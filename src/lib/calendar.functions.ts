import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listCalendar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        factoryId: z.string().uuid(),
        year: z.number().int(),
        month: z.number().int().min(1).max(12),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const start = `${data.year}-${pad(data.month)}-01`;
    const lastDay = new Date(data.year, data.month, 0).getDate();
    const end = `${data.year}-${pad(data.month)}-${pad(lastDay)}`;
    const { data: rows, error } = await context.supabase
      .from("work_calendar_days")
      .select("day, is_workday, note")
      .eq("factory_id", data.factoryId)
      .gte("day", start)
      .lte("day", end);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const setCalendarDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        factoryId: z.string().uuid(),
        day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        isWorkday: z.boolean(),
        note: z.string().max(200).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const existing = await supabase
      .from("work_calendar_days")
      .select("id")
      .eq("factory_id", data.factoryId)
      .eq("day", data.day)
      .maybeSingle();

    if (existing.data?.id) {
      const { error } = await supabase
        .from("work_calendar_days")
        .update({ is_workday: data.isWorkday, note: data.note ?? null, updated_by: userId })
        .eq("id", existing.data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("work_calendar_days").insert({
        factory_id: data.factoryId,
        day: data.day,
        is_workday: data.isWorkday,
        note: data.note ?? null,
        created_by: userId,
        updated_by: userId,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const generateDefaultMonth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        factoryId: z.string().uuid(),
        year: z.number().int(),
        month: z.number().int().min(1).max(12),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const pad = (n: number) => String(n).padStart(2, "0");
    const lastDay = new Date(data.year, data.month, 0).getDate();
    const rows: {
      factory_id: string;
      day: string;
      is_workday: boolean;
      created_by: string;
      updated_by: string;
    }[] = [];
    for (let d = 1; d <= lastDay; d++) {
      const iso = `${data.year}-${pad(data.month)}-${pad(d)}`;
      const dow = new Date(`${iso}T12:00:00`).getDay();
      rows.push({
        factory_id: data.factoryId,
        day: iso,
        is_workday: dow >= 1 && dow <= 5,
        created_by: userId,
        updated_by: userId,
      });
    }
    // upsert
    const { error } = await supabase
      .from("work_calendar_days")
      .upsert(rows, { onConflict: "factory_id,day" });
    if (error) throw new Error(error.message);
    return { ok: true, count: rows.length };
  });
