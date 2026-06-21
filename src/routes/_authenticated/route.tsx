import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/shell/AppShell";
import { getSessionContext } from "@/lib/session.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const fetchSession = useServerFn(getSessionContext);
  const sessionQuery = useQuery({
    queryKey: ["session-context"],
    queryFn: () => fetchSession(),
    staleTime: 60_000,
  });

  if (sessionQuery.data && !sessionQuery.data.isActive) {
    return (
      <div className="grid min-h-screen place-items-center bg-background p-6 text-center">
        <div className="max-w-sm space-y-4">
          <h1 className="text-xl font-semibold">Conta desativada</h1>
          <p className="text-sm text-muted-foreground">
            Sua conta foi desativada. Procure um administrador.
          </p>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/auth";
            }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  return <AppShell session={sessionQuery.data ?? null} />;
}

