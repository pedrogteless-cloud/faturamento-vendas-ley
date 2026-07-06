import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AppPermission, AppRole } from "./permissions";

async function ensureAdmin(
  userId: string,
  supabase: ReturnType<typeof import("@supabase/supabase-js").createClient>,
) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin required");
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId, context.supabase as never);
    const { data: profiles, error } = await context.supabase
      .from("profiles")
      .select("id, email, full_name, is_active, last_sign_in_at, created_at")
      .order("full_name");
    if (error) throw new Error(error.message);

    const [rolesRes, permsRes, accessRes] = await Promise.all([
      context.supabase.from("user_roles").select("user_id, role"),
      context.supabase.from("user_permissions").select("user_id, permission"),
      context.supabase.from("user_factory_access").select("user_id, factory_id"),
    ]);

    const rolesByUser = new Map<string, AppRole[]>();
    for (const r of rolesRes.data ?? []) {
      const arr = rolesByUser.get(r.user_id as string) ?? [];
      arr.push(r.role as AppRole);
      rolesByUser.set(r.user_id as string, arr);
    }
    const permsByUser = new Map<string, AppPermission[]>();
    for (const p of permsRes.data ?? []) {
      const arr = permsByUser.get(p.user_id as string) ?? [];
      arr.push(p.permission as AppPermission);
      permsByUser.set(p.user_id as string, arr);
    }
    const accessByUser = new Map<string, string[]>();
    for (const a of accessRes.data ?? []) {
      const arr = accessByUser.get(a.user_id as string) ?? [];
      arr.push(a.factory_id as string);
      accessByUser.set(a.user_id as string, arr);
    }

    return (profiles ?? []).map((p) => ({
      ...p,
      roles: rolesByUser.get(p.id) ?? [],
      permissions: permsByUser.get(p.id) ?? [],
      factoryIds: accessByUser.get(p.id) ?? [],
    }));
  });

const createUserSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2).max(120),
  password: z
    .string()
    .min(8, "Senha deve ter ao menos 8 caracteres")
    .max(72)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  roles: z
    .array(
      z.enum([
        "admin",
        "diretoria",
        "gerente_comercial",
        "assistente_vendas",
        "responsavel_faturamento",
      ]),
    )
    .min(1),
  permissions: z
    .array(z.enum(["manage_goals", "manage_work_calendar", "manage_notifications", "view_audit"]))
    .default([]),
  factoryIds: z.array(z.string().uuid()).default([]),
});

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createUserSchema.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId, context.supabase as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Cria usuário; se senha for informada, já define; caso contrário exige troca no 1º login
    const created = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      email_confirm: true,
      password: data.password,
      user_metadata: { full_name: data.fullName },
    });
    if (created.error) throw new Error(created.error.message);
    const newUserId = created.data.user!.id;

    await supabaseAdmin.from("profiles").upsert({
      id: newUserId,
      email: data.email,
      full_name: data.fullName,
      is_active: true,
      must_change_password: !data.password,
    });

    if (data.roles.length > 0) {
      await supabaseAdmin
        .from("user_roles")
        .insert(data.roles.map((r) => ({ user_id: newUserId, role: r })));
    }
    if (data.permissions.length > 0) {
      await supabaseAdmin
        .from("user_permissions")
        .insert(data.permissions.map((p) => ({ user_id: newUserId, permission: p })));
    }
    if (data.factoryIds.length > 0) {
      await supabaseAdmin
        .from("user_factory_access")
        .insert(data.factoryIds.map((fid) => ({ user_id: newUserId, factory_id: fid })));
    }

    // Envia link de definição de senha
    await supabaseAdmin.auth.resetPasswordForEmail(data.email);

    return { ok: true, userId: newUserId };
  });

export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().uuid(), active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId, context.supabase as never);
    if (!data.active && data.userId === context.userId) {
      throw new Error("Você não pode desativar sua própria conta.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Impede desativar o último admin
    if (!data.active) {
      const { data: adminRoles } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      const adminIds = (adminRoles ?? []).map((a) => a.user_id as string);
      if (adminIds.length > 0) {
        const { data: activeProfiles } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .in("id", adminIds)
          .eq("is_active", true);
        const activeIds = (activeProfiles ?? []).map((p) => p.id as string);
        if (activeIds.length <= 1 && activeIds.includes(data.userId)) {
          throw new Error("Não é possível desativar o único administrador ativo.");
        }
      }
    }
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_active: data.active })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ email: z.string().email() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId, context.supabase as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(data.email);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateUserAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        roles: z.array(
          z.enum([
            "admin",
            "diretoria",
            "gerente_comercial",
            "assistente_vendas",
            "responsavel_faturamento",
          ]),
        ),
        permissions: z.array(
          z.enum(["manage_goals", "manage_work_calendar", "manage_notifications", "view_audit"]),
        ),
        factoryIds: z.array(z.string().uuid()),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId, context.supabase as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    if (data.roles.length > 0) {
      await supabaseAdmin
        .from("user_roles")
        .insert(data.roles.map((r) => ({ user_id: data.userId, role: r })));
    }
    await supabaseAdmin.from("user_permissions").delete().eq("user_id", data.userId);
    if (data.permissions.length > 0) {
      await supabaseAdmin
        .from("user_permissions")
        .insert(data.permissions.map((p) => ({ user_id: data.userId, permission: p })));
    }
    await supabaseAdmin.from("user_factory_access").delete().eq("user_id", data.userId);
    if (data.factoryIds.length > 0) {
      await supabaseAdmin
        .from("user_factory_access")
        .insert(data.factoryIds.map((fid) => ({ user_id: data.userId, factory_id: fid })));
    }
    return { ok: true };
  });
