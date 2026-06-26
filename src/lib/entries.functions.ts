import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { todayISO } from "@/lib/format";

const upsertSchema = z.object({
  type: z.enum(["sales", "billing"]),
  factoryId: z.string().uuid(),
  referenceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((v) => v <= todayISO(), {
      message: "A data do lançamento não pode ser no futuro.",
    }),
  amountCents: z.number().int().min(0).max(1_000_000_000_00),
  note: z.string().max(500).optional().nullable(),
  reason: z.string().max(500).optional().nullable(),
});

export const upsertEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const table = data.type === "sales" ? "sales_entries" : "billing_entries";

    const existing = await supabase
      .from(table)
      .select("id")
      .eq("factory_id", data.factoryId)
      .eq("reference_date", data.referenceDate)
      .maybeSingle();

    if (existing.data?.id) {
      const { error } = await supabase
        .from(table)
        .update({
          amount_cents: data.amountCents,
          note: data.note ?? null,
          updated_by: userId,
        })
        .eq("id", existing.data.id);
      if (error) throw new Error(error.message);
      return { id: existing.data.id, updated: true };
    }

    const { data: inserted, error } = await supabase
      .from(table)
      .insert({
        factory_id: data.factoryId,
        reference_date: data.referenceDate,
        amount_cents: data.amountCents,
        note: data.note ?? null,
        created_by: userId,
        updated_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id, updated: false };
  });

export const listEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        type: z.enum(["sales", "billing"]),
        limit: z.number().int().min(1).max(200).default(60),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const table = data.type === "sales" ? "sales_entries" : "billing_entries";
    const { data: rows, error } = await context.supabase
      .from(table)
      .select(
        "id, reference_date, factory_id, amount_cents, note, created_at, updated_at, created_by, updated_by",
      )
      .order("reference_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
