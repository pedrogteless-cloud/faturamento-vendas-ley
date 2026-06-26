import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SessionContext, AppRole, AppPermission } from "./permissions";

export const getSessionContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SessionContext> => {
    const { supabase, userId } = context;

    const [profileRes, rolesRes, permsRes, accessRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("email, full_name, is_active")
        .eq("id", userId)
        .maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("user_permissions").select("permission").eq("user_id", userId),
      supabase.from("user_factory_access").select("factory_id").eq("user_id", userId),
    ]);

    if (profileRes.error) throw new Error(profileRes.error.message);

    // Atualiza último acesso (best-effort)
    void supabase
      .from("profiles")
      .update({ last_sign_in_at: new Date().toISOString() })
      .eq("id", userId);

    return {
      userId,
      email: profileRes.data?.email ?? "",
      fullName: profileRes.data?.full_name ?? "",
      isActive: profileRes.data?.is_active ?? false,
      roles: (rolesRes.data ?? []).map((r) => r.role as AppRole),
      permissions: (permsRes.data ?? []).map((p) => p.permission as AppPermission),
      factoryIds: (accessRes.data ?? []).map((a) => a.factory_id as string),
    };
  });
