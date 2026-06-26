import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [rules, dests, logs] = await Promise.all([
      context.supabase.from("notification_rules").select("*").order("name"),
      context.supabase.from("notification_destinations").select("*").order("name"),
      context.supabase
        .from("notification_delivery_logs")
        .select("*")
        .order("attempted_at", { ascending: false })
        .limit(50),
    ]);
    return {
      rules: rules.data ?? [],
      destinations: dests.data ?? [],
      logs: logs.data ?? [],
    };
  });

const destinationSchema = z.object({
  name: z.string().min(2).max(80),
  chatId: z.string().min(1).max(80),
  description: z.string().max(200).nullable().optional(),
});

export const createDestination = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => destinationSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("notification_destinations").insert({
      name: data.name,
      chat_id: data.chatId,
      description: data.description ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateDestination = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => destinationSchema.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notification_destinations")
      .update({
        name: data.name,
        chat_id: data.chatId,
        description: data.description ?? null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDestination = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notification_destinations")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), isActive: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notification_rules")
      .update({ is_active: data.isActive })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setRuleDestination = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), destinationId: z.string().uuid().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notification_rules")
      .update({ destination_id: data.destinationId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendTestMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ destinationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: dest, error: destError } = await context.supabase
      .from("notification_destinations")
      .select("chat_id")
      .eq("id", data.destinationId)
      .single();
    if (destError) throw new Error(destError.message);

    // notify_telegram é criada no Supabase via Lovable (ainda não está nos tipos gerados).
    const { error } = await (
      context.supabase.rpc as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ error: { message: string } | null }>
    )("notify_telegram", {
      p_chat_id: dest.chat_id,
      p_message:
        "🔔 Mensagem de teste — Ley Colchões. Se você recebeu isso, o destino está configurado corretamente.",
      p_rule_id: null,
      p_idempotency_key: `test-${data.destinationId}-${Date.now()}`,
    });
    if (error) {
      throw new Error(
        `Falha ao enviar teste: ${error.message}. Verifique se a função notify_telegram já foi configurada no Supabase.`,
      );
    }
    return { ok: true };
  });
