import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { todayISO } from "@/lib/format";

export const SALES_CHANNELS = ["representantes", "distribuidora"] as const;
export type SalesChannel = (typeof SALES_CHANNELS)[number];
export const CHANNEL_LABEL: Record<SalesChannel, string> = {
  representantes: "Representantes",
  distribuidora: "Distribuidora",
};

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
  channel: z.enum(SALES_CHANNELS).optional().nullable(),
});

export const upsertEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const isSales = data.type === "sales";
    const table = isSales ? "sales_entries" : "billing_entries";
    const channel: SalesChannel | null = isSales ? (data.channel ?? "representantes") : null;

    let existingQuery = supabase
      .from(table)
      .select("id")
      .eq("factory_id", data.factoryId)
      .eq("reference_date", data.referenceDate);
    if (isSales) existingQuery = existingQuery.eq("channel", channel as string);
    const existing = await existingQuery.maybeSingle();

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

    const insertPayload: Record<string, unknown> = {
      factory_id: data.factoryId,
      reference_date: data.referenceDate,
      amount_cents: data.amountCents,
      note: data.note ?? null,
      created_by: userId,
      updated_by: userId,
    };
    if (isSales) insertPayload.channel = channel;

    const { data: inserted, error } = await supabase
      .from(table)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- channel column not yet in generated types
      .insert(insertPayload as any)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id, updated: false };
  });

const updateFieldsSchema = z.object({
  type: z.enum(["sales", "billing"]),
  id: z.string().uuid(),
  amountCents: z.number().int().min(0).max(1_000_000_000_00),
  note: z.string().max(500).optional().nullable(),
});

export const updateEntryFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateFieldsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const table = data.type === "sales" ? "sales_entries" : "billing_entries";
    const { error } = await context.supabase
      .from(table)
      .update({
        amount_cents: data.amountCents,
        note: data.note ?? null,
        updated_by: context.userId,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { id: data.id };
  });

const deleteEntrySchema = z.object({
  type: z.enum(["sales", "billing"]),
  id: z.string().uuid(),
});

export const deleteEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deleteEntrySchema.parse(d))
  .handler(async ({ data, context }) => {
    const table = data.type === "sales" ? "sales_entries" : "billing_entries";
    const { error, count } = await context.supabase
      .from(table)
      .delete({ count: "exact" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    if (!count) throw new Error("Você não tem permissão para excluir este lançamento.");
    return { id: data.id };
  });

export const listEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        type: z.enum(["sales", "billing"]),
        limit: z.number().int().min(1).max(200).default(60),
        factoryId: z.string().uuid().optional(),
        channel: z.enum(SALES_CHANNELS).optional(),
        dateFrom: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        dateTo: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const isSales = data.type === "sales";
    const table = isSales ? "sales_entries" : "billing_entries";
    const baseCols =
      "id, reference_date, factory_id, amount_cents, note, created_at, updated_at, created_by, updated_by";
    let query = context.supabase.from(table).select(isSales ? `${baseCols}, channel` : baseCols);
    if (data.factoryId) query = query.eq("factory_id", data.factoryId);
    if (isSales && data.channel) query = query.eq("channel", data.channel);
    if (data.dateFrom) query = query.gte("reference_date", data.dateFrom);
    if (data.dateTo) query = query.lte("reference_date", data.dateTo);
    const { data: rows, error } = await query
      .order("reference_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
