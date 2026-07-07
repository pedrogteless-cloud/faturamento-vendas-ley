import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { todayISO } from "@/lib/format";

// Ajustes administrativos de carteira. amount_cents é ASSINADO: positivo aumenta,
// negativo reduz. Regra de acesso (admin) é aplicada via RLS no banco.

export const ADJUSTMENT_REASONS = [
  "cancelamento",
  "repasse",
  "devolucao",
  "correcao",
  "conciliacao",
] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

export const REASON_LABEL: Record<AdjustmentReason, string> = {
  cancelamento: "Cancelamento",
  repasse: "Repasse",
  devolucao: "Devolução",
  correcao: "Correção",
  conciliacao: "Conciliação (ERP)",
};

export type CarteiraAdjustment = {
  id: string;
  factory_id: string;
  amount_cents: number;
  reason: AdjustmentReason;
  reference_date: string | null;
  note: string;
  original_cents: number | null;
  realized_cents: number | null;
  destination: string | null;
  created_at: string;
  created_by: string;
};

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const createSchema = z
  .object({
    factoryId: z.string().uuid(),
    reason: z.enum(["cancelamento", "repasse", "devolucao", "correcao"]),
    referenceDate: z.string().regex(dateRegex).optional(),
    note: z.string().min(1).max(500),
    // Para cancelamento/devolução/correção: valor assinado do impacto na carteira
    amountCents: z.number().int().min(-1_000_000_000_00).max(1_000_000_000_00).optional(),
    // Para repasse: valor original do pedido × valor realizado + destino
    originalCents: z.number().int().min(0).max(1_000_000_000_00).optional(),
    realizedCents: z.number().int().min(0).max(1_000_000_000_00).optional(),
    destination: z.string().max(200).optional(),
  })
  .refine(
    (d) => (d.reason === "repasse" ? d.originalCents != null && d.realizedCents != null : true),
    {
      message: "Repasse exige valor original e valor realizado.",
    },
  );

export const createCarteiraAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    let amountCents: number;
    let originalCents: number | null = null;
    let realizedCents: number | null = null;
    let destination: string | null = null;

    if (data.reason === "repasse") {
      originalCents = data.originalCents!;
      realizedCents = data.realizedCents!;
      destination = data.destination?.trim() || null;
      // Repasse só revaloriza a carteira pela diferença (o desconto que nunca
      // será faturado). Faturamento e vendas não são tocados.
      amountCents = realizedCents - originalCents;
      if (amountCents > 0)
        throw new Error("No repasse, o valor realizado deve ser menor ou igual ao original.");
      if (amountCents === 0) throw new Error("Repasse sem desconto não altera a carteira.");
    } else {
      if (!data.amountCents || data.amountCents === 0)
        throw new Error("Informe um valor diferente de zero.");
      amountCents = data.amountCents;
    }

    const { data: inserted, error } = await context.supabase
      .from("carteira_adjustments")
      .insert({
        factory_id: data.factoryId,
        amount_cents: amountCents,
        reason: data.reason,
        reference_date: data.referenceDate ?? todayISO(),
        note: data.note,
        original_cents: originalCents,
        realized_cents: realizedCents,
        destination,
        created_by: context.userId,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (inserted as { id: string }).id };
  });

// Conciliação com o ERP: calcula a carteira atual da fábrica no servidor e
// cria um ajuste com a diferença exata para bater com o valor informado.
async function currentCarteiraForFactory(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cliente supabase do contexto
  supabase: any,
  factoryId: string,
): Promise<number> {
  const sum = (rows: { amount_cents: number }[] | null) =>
    (rows ?? []).reduce((a, r) => a + Number(r.amount_cents), 0);
  const [salesRes, billingRes, adjRes] = await Promise.all([
    supabase.from("sales_entries").select("amount_cents").eq("factory_id", factoryId),
    supabase.from("billing_entries").select("amount_cents").eq("factory_id", factoryId),
    supabase.from("carteira_adjustments").select("amount_cents").eq("factory_id", factoryId),
  ]);
  if (salesRes.error) throw new Error(salesRes.error.message);
  if (billingRes.error) throw new Error(billingRes.error.message);
  if (adjRes.error) throw new Error(adjRes.error.message);
  return sum(salesRes.data) - sum(billingRes.data) + sum(adjRes.data);
}

export const reconcileCarteira = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        factoryId: z.string().uuid(),
        erpCents: z.number().int().min(0).max(1_000_000_000_00),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const current = await currentCarteiraForFactory(context.supabase, data.factoryId);
    const diff = data.erpCents - current;
    if (diff === 0) return { id: null, diff: 0 };

    const fmt = (c: number) =>
      new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100);
    const { data: inserted, error } = await context.supabase
      .from("carteira_adjustments")
      .insert({
        factory_id: data.factoryId,
        amount_cents: diff,
        reason: "conciliacao",
        reference_date: todayISO(),
        note: `Acerto para bater com o ERP (ERP: ${fmt(data.erpCents)} · antes: ${fmt(current)})`,
        created_by: context.userId,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (inserted as { id: string }).id, diff };
  });

export const listCarteiraAdjustments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        factoryId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(200).default(100),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("carteira_adjustments")
      .select(
        "id, factory_id, amount_cents, reason, reference_date, note, original_cents, realized_cents, destination, created_at, created_by",
      );
    if (data.factoryId) query = query.eq("factory_id", data.factoryId);
    const { data: rows, error } = await query
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []) as CarteiraAdjustment[];
  });

export const deleteCarteiraAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error, count } = await context.supabase
      .from("carteira_adjustments")
      .delete({ count: "exact" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    if (!count) throw new Error("Você não tem permissão para excluir este ajuste.");
    return { id: data.id };
  });
