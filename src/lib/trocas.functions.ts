import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_THRESHOLDS, type TrocasDay, type TrocasThresholds } from "@/lib/trocas-calc";

// "Trocas na produção": tabela própria (production_exchanges), nunca somada ao
// faturamento. amount_cents NULL = não informado; 0 = não houve troca.
// Tabela nova, fora dos tipos gerados — por isso os casts.

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabela fora dos tipos gerados
type Db = any;

async function readThresholds(supabase: Db): Promise<TrocasThresholds> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "trocas_thresholds")
    .maybeSingle();
  const v = data?.value as Partial<TrocasThresholds> | undefined;
  return {
    atencao: Number(v?.atencao ?? DEFAULT_THRESHOLDS.atencao),
    critico: Number(v?.critico ?? DEFAULT_THRESHOLDS.critico),
  };
}

/** Troca e faturamento de uma fábrica num dia (para a tela de lançamento). */
export const getTrocaDay = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ factoryId: z.string().uuid(), date: dateStr }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase: Db = context.supabase;
    const [trocaRes, billRes, thresholds] = await Promise.all([
      supabase
        .from("production_exchanges")
        .select("amount_cents, note")
        .eq("factory_id", data.factoryId)
        .eq("reference_date", data.date)
        .maybeSingle(),
      supabase
        .from("billing_entries")
        .select("amount_cents")
        .eq("factory_id", data.factoryId)
        .eq("reference_date", data.date),
      readThresholds(supabase),
    ]);
    if (trocaRes.error) throw new Error(trocaRes.error.message);
    if (billRes.error) throw new Error(billRes.error.message);
    const billingCents = (billRes.data ?? []).reduce(
      (s: number, r: { amount_cents: number }) => s + Number(r.amount_cents),
      0,
    );
    return {
      exists: !!trocaRes.data,
      trocasCents: trocaRes.data?.amount_cents == null ? null : Number(trocaRes.data.amount_cents),
      note: (trocaRes.data?.note as string | null) ?? null,
      billingCents,
      hasBilling: (billRes.data ?? []).length > 0,
      thresholds,
    };
  });

/** Grava (upsert) a troca do dia. amountCents null volta para "não informado". */
export const saveTroca = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        factoryId: z.string().uuid(),
        date: dateStr,
        amountCents: z.number().int().min(0).max(1_000_000_000_00).nullable(),
        note: z.string().max(300).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase: Db = context.supabase;
    const { error } = await supabase.from("production_exchanges").upsert(
      {
        factory_id: data.factoryId,
        reference_date: data.date,
        amount_cents: data.amountCents,
        note: data.note ?? null,
        updated_by: context.userId,
      },
      { onConflict: "factory_id,reference_date" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type TrocasRange = {
  thresholds: TrocasThresholds;
  factories: { id: string; code: string; name: string; state: string; days: TrocasDay[] }[];
};

/**
 * Dias de um período por fábrica: faturamento do dia + trocas (ou null).
 * Um dia entra se teve faturamento lançado OU registro de troca.
 */
export const getTrocasRange = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ dateFrom: dateStr, dateTo: dateStr }).parse(d))
  .handler(async ({ data, context }): Promise<TrocasRange> => {
    const supabase: Db = context.supabase;
    const [factoriesRes, billRes, trocaRes, thresholds] = await Promise.all([
      supabase.from("factories").select("id, code, name, state"),
      supabase
        .from("billing_entries")
        .select("factory_id, reference_date, amount_cents")
        .gte("reference_date", data.dateFrom)
        .lte("reference_date", data.dateTo),
      supabase
        .from("production_exchanges")
        .select("factory_id, reference_date, amount_cents")
        .gte("reference_date", data.dateFrom)
        .lte("reference_date", data.dateTo),
      readThresholds(supabase),
    ]);
    const err = factoriesRes.error ?? billRes.error;
    if (err) throw new Error(err.message);

    // Tabela de trocas pode não existir ainda (antes da migração): trata como vazia.
    const trocas = trocaRes.error ? [] : (trocaRes.data ?? []);
    const order = (code: string) => (code === "eusebio" ? 1 : code === "timon" ? 2 : 3);

    const factories = (factoriesRes.data ?? [])
      .slice()
      .sort((a: { code: string }, b: { code: string }) => order(a.code) - order(b.code))
      .map((f: { id: string; code: string; name: string; state: string }) => {
        const days = new Map<string, TrocasDay>();
        for (const b of billRes.data ?? []) {
          if (b.factory_id !== f.id) continue;
          const cur = days.get(b.reference_date) ?? {
            date: b.reference_date,
            billingCents: 0,
            trocasCents: null,
          };
          cur.billingCents += Number(b.amount_cents);
          days.set(b.reference_date, cur);
        }
        for (const t of trocas) {
          if (t.factory_id !== f.id) continue;
          const cur = days.get(t.reference_date) ?? {
            date: t.reference_date,
            billingCents: 0,
            trocasCents: null,
          };
          cur.trocasCents = t.amount_cents == null ? null : Number(t.amount_cents);
          days.set(t.reference_date, cur);
        }
        return {
          ...f,
          days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
        };
      });

    return { thresholds, factories };
  });
