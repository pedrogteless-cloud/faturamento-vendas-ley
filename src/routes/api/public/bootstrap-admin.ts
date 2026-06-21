import { createFileRoute } from "@tanstack/react-router";

/**
 * Endpoint de bootstrap do primeiro administrador (Pedro Teles).
 * Só funciona ENQUANTO NÃO EXISTIR nenhum administrador no sistema.
 * Após o primeiro admin ser criado, este endpoint passa a recusar tudo.
 *
 * Fluxo: cria o usuário com e-mail confirmado, atribui papel admin e
 * acesso às duas fábricas, e envia link de definição de senha por e-mail.
 */
export const Route = createFileRoute("/api/public/bootstrap-admin")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const ADMIN_EMAIL = "pedrogteless@gmail.com";
        const ADMIN_NAME = "Pedro Teles";

        // Já existe admin?
        const { data: existingAdmins, error: roleErr } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin")
          .limit(1);
        if (roleErr) {
          return Response.json({ error: roleErr.message }, { status: 500 });
        }
        if ((existingAdmins ?? []).length > 0) {
          return Response.json(
            { error: "Bootstrap já executado: já existe administrador." },
            { status: 409 },
          );
        }

        // Tenta encontrar o usuário (caso o trigger já tenha criado o profile via signup)
        const list = await supabaseAdmin.auth.admin.listUsers();
        if (list.error) return Response.json({ error: list.error.message }, { status: 500 });

        let userId = list.data.users.find((u) => u.email?.toLowerCase() === ADMIN_EMAIL)?.id;

        if (!userId) {
          const created = await supabaseAdmin.auth.admin.createUser({
            email: ADMIN_EMAIL,
            email_confirm: true,
            user_metadata: { full_name: ADMIN_NAME },
          });
          if (created.error) {
            return Response.json({ error: created.error.message }, { status: 500 });
          }
          userId = created.data.user!.id;
        }

        await supabaseAdmin
          .from("profiles")
          .upsert({
            id: userId,
            email: ADMIN_EMAIL,
            full_name: ADMIN_NAME,
            is_active: true,
            must_change_password: true,
          });

        await supabaseAdmin
          .from("user_roles")
          .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });

        const { data: factories } = await supabaseAdmin.from("factories").select("id");
        if (factories) {
          for (const f of factories) {
            await supabaseAdmin
              .from("user_factory_access")
              .upsert({ user_id: userId, factory_id: f.id }, { onConflict: "user_id,factory_id" });
          }
        }

        // Envia link de recuperação para definir senha
        await supabaseAdmin.auth.resetPasswordForEmail(ADMIN_EMAIL);

        return Response.json({
          ok: true,
          message:
            "Administrador criado. Verifique o e-mail para definir a senha. Caso não chegue, use 'Esqueci minha senha' na tela de login.",
          email: ADMIN_EMAIL,
        });
      },
    },
  },
});
