import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createServerFn } from "@tanstack/react-start";
import { formatDateTimeBR } from "@/lib/format";

const listRules = createServerFn({ method: "GET" })
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

export const Route = createFileRoute("/_authenticated/notificacoes")({
  head: () => ({ meta: [{ title: "Notificações — Ley Colchões" }] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const [tab, setTab] = useState<"rules" | "history">("rules");
  const fetchData = useServerFn(listRules);
  const query = useQuery({ queryKey: ["notifications"], queryFn: () => fetchData() });
  const data = query.data ?? { rules: [], destinations: [], logs: [] };

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Notificações</h1>
        <p className="text-xs text-muted-foreground">
          Regras de envio pelo Telegram. Para ativar o envio real, configure o token (secret{" "}
          <span className="font-mono">TELEGRAM_API_KEY</span>) e os destinatários.
        </p>
      </header>

      <div className="mb-4 inline-flex rounded-xl border border-border-subtle bg-surface p-1 text-sm">
        <button
          onClick={() => setTab("rules")}
          className={`rounded-lg px-3 py-1.5 ${tab === "rules" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          Regras
        </button>
        <button
          onClick={() => setTab("history")}
          className={`rounded-lg px-3 py-1.5 ${tab === "history" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          Histórico
        </button>
      </div>

      {tab === "rules" ? (
        <div className="grid gap-3 md:grid-cols-2">
          {data.rules.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border-subtle bg-surface p-6 text-sm text-muted-foreground md:col-span-2">
              Nenhuma regra cadastrada. As regras serão criadas após a configuração do token do
              Telegram.
            </div>
          ) : (
            data.rules.map((r) => (
              <article
                key={r.id}
                className="rounded-2xl border border-border-subtle bg-surface p-5"
              >
                <header className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">{r.name}</h3>
                    <p className="truncate text-xs text-muted-foreground">{r.description ?? "—"}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${r.is_active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}
                  >
                    {r.is_active ? "Ativa" : "Pausada"}
                  </span>
                </header>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <Stat label="Agendamento" value={r.schedule_label ?? r.schedule_cron ?? "—"} />
                  <Stat label="Última execução" value={formatDateTimeBR(r.last_run_at)} />
                  <Stat label="Status" value={r.last_status ?? "—"} />
                  <Stat label="Próxima" value={formatDateTimeBR(r.next_run_at)} />
                </dl>
              </article>
            ))
          )}
        </div>
      ) : (
        <section className="overflow-x-auto rounded-2xl border border-border-subtle bg-surface">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-5 py-2 text-left">Quando</th>
                <th className="px-5 py-2 text-left">Status</th>
                <th className="px-5 py-2 text-left">Erro</th>
              </tr>
            </thead>
            <tbody>
              {data.logs.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-xs text-muted-foreground">
                    Sem envios registrados.
                  </td>
                </tr>
              ) : (
                data.logs.map((l) => (
                  <tr key={l.id} className="border-t border-border-subtle/40">
                    <td className="px-5 py-2 tabular">{formatDateTimeBR(l.attempted_at)}</td>
                    <td className="px-5 py-2">{l.status}</td>
                    <td className="px-5 py-2 text-muted-foreground">{l.error ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-md bg-background/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-foreground">{value ?? "—"}</div>
    </div>
  );
}
