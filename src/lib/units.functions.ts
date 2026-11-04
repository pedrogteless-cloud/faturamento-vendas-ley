import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  UNIT_COLUMNS,
  UNIT_KINDS,
  billedOf,
  producedOf,
  type UnitCounts,
  type UnitsRow,
} from "@/lib/units-calc";

// Unidades diárias (faturadas e produzidas) — tabela daily_units, fora dos tipos
// gerados (por isso os casts). null = não informado; 0 = nenhuma peça.

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const count = z.number().int().min(0).max(1_000_000).nullable();
const countsSchema = z.object({
  colchoes: count,
  bases: count,
  unibox: count,
  outros: count,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabela fora dos tipos gerados
type Db = any;

export type UnitsDayData = {
  exists: boolean;
  billed: UnitCounts;
  produced: UnitCounts;
  billingCents: number;
};

/** Unidades e faturamento de uma fábrica num dia (tela de lançamento). */
export const getUnitsDay = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ factoryId: z.string().uuid(), date: dateStr }).parse(d),
  )
  .handler(async ({ data, context }): Promise<UnitsDayData> => {
    const supabase: Db = context.supabase;
    const [unitsRes, billRes] = await Promise.all([
      supabase
        .from("daily_units")
        .select(UNIT_COLUMNS)
        .eq("factory_id", data.factoryId)
        .eq("reference_date", data.date)
        .maybeSingle(),
      supabase
        .from("billing_entries")
        .select("amount_cents")
        .eq("factory_id", data.factoryId)
        .eq("reference_date", data.date),
    ]);
    if (billRes.error) throw new Error(billRes.error.message);
    // Tabela ainda não criada (antes da migração): trata como "sem lançamento".
    const row = unitsRes.error ? null : (unitsRes.data as UnitsRow | null);
    const empty: UnitCounts = { colchoes: null, bases: null, unibox: null, outros: null };
    return {
      exists: !!row,
      billed: row ? billedOf(row) : empty,
      produced: row ? producedOf(row) : empty,
      billingCents: (billRes.data ?? []).reduce(
        (s: number, r: { amount_cents: number }) => s + Number(r.amount_cents),
        0,
      ),
    };
  });

/** Grava (upsert) as unidades do dia. Vazio (null) = não informado. */
export const saveUnitsDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        factoryId: z.string().uuid(),
        date: dateStr,
        billed: countsSchema,
        produced: countsSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase: Db = context.supabase;
    const payload: Record<string, unknown> = {
      factory_id: data.factoryId,
      reference_date: data.date,
      updated_by: context.userId,
    };
    for (const k of UNIT_KINDS) {
      payload[`billed_${k}`] = data.billed[k];
      payload[`produced_${k}`] = data.produced[k];
    }
    const { error } = await supabase
      .from("daily_units")
      .upsert(payload, { onConflict: "factory_id,reference_date" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
