import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listGoals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ year: z.number().int(), month: z.number().int().min(1).max(12) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("goals")
      .select("id, factory_id, year, month, billing_goal_cents, sales_goal_cents, updated_at")
      .eq("year", data.year)
      .eq("month", data.month);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        factoryId: z.string().uuid(),
        year: z.number().int(),
        month: z.number().int().min(1).max(12),
        billingGoalCents: z.number().int().min(0),
        salesGoalCents: z.number().int().min(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const existing = await supabase
      .from("goals")
      .select("id")
      .eq("factory_id", data.factoryId)
      .eq("year", data.year)
      .eq("month", data.month)
      .maybeSingle();

    if (existing.data?.id) {
      const { error } = await supabase
        .from("goals")
        .update({
          billing_goal_cents: data.billingGoalCents,
          sales_goal_cents: data.salesGoalCents,
          updated_by: userId,
        })
        .eq("id", existing.data.id);
      if (error) throw new Error(error.message);
      return { id: existing.data.id, updated: true };
    }
    const { data: inserted, error } = await supabase
      .from("goals")
      .insert({
        factory_id: data.factoryId,
        year: data.year,
        month: data.month,
        billing_goal_cents: data.billingGoalCents,
        sales_goal_cents: data.salesGoalCents,
        created_by: userId,
        updated_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id, updated: false };
  });
