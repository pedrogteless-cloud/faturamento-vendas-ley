import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Ajustes administrativos de carteira (correções, cancelamentos de pedido).
// amount_cents é ASSINADO: positivo aumenta a carteira, negativo reduz.
// Regra de acesso (admin) é aplicada via RLS no banco.

const createSchema = z.object({
  factoryId: z.string().uuid(),
  amountCents: z.number().int().min(-1_000_000_000_00).max(1_000_000_000_00),
  note: z.string().min(1).max(500),
});

export const createCarteiraAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    if (data.amountCents === 0) throw new Error("O valor do ajuste não pode ser zero.");
    const { data: inserted, error } = await context.supabase
      .from("carteira_adjustments")
      .insert({
        factory_id: data.factoryId,
        amount_cents: data.amountCents,
        note: data.note,
        created_by: context.userId,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (inserted as { id: string }).id };
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
      .select("id, factory_id, amount_cents, note, created_at, created_by");
    if (data.factoryId) query = query.eq("factory_id", data.factoryId);
    const { data: rows, error } = await query
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []) as {
      id: string;
      factory_id: string;
      amount_cents: number;
      note: string;
      created_at: string;
      created_by: string;
    }[];
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
