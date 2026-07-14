import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const recoverySchema = z.object({
  factoryId: z.string().uuid(),
  recoveredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  returnedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  amountCents: z.number().int().min(1).max(1_000_000_000_00),
  customerName: z.string().max(160).optional().nullable(),
  checkReference: z.string().max(80).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

export const recordReturnedCheckRecovery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => recoverySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: inserted, error } = await context.supabase
      .from("returned_check_recoveries")
      .insert({
        factory_id: data.factoryId,
        recovered_date: data.recoveredDate,
        returned_date: data.returnedDate || null,
        amount_cents: data.amountCents,
        customer_name: data.customerName || null,
        check_reference: data.checkReference || null,
        note: data.note || null,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });

export const listReturnedCheckRecoveries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ limit: z.number().int().min(1).max(500).default(60) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("returned_check_recoveries")
      .select(
        "id, recovered_date, returned_date, factory_id, amount_cents, customer_name, check_reference, note, created_at, updated_at, created_by, updated_by",
      )
      .order("recovered_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
