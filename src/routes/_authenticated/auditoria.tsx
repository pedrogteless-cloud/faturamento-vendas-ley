import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { formatDateTimeBR } from "@/lib/format";

const listAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("audit_logs")
      .select("id, entity, action, actor_email, before, after, reason, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const Route = createFileRoute("/_authenticated/auditoria")({
  head: () => ({ meta: [{ title: "Auditoria — Ley Colchões" }] }),
  component: AuditPage,
});

function AuditPage() {
  const fetchAudit = useServerFn(listAudit);
  const query = useQuery({ queryKey: ["audit"], queryFn: () => fetchAudit() });

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Auditoria</h1>
        <p className="text-xs text-muted-foreground">Registro imutável de todas as alterações.</p>
      </header>

      <section className="overflow-x-auto rounded-2xl border border-border-subtle bg-surface">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-5 py-2 text-left">Quando</th>
              <th className="px-5 py-2 text-left">Autor</th>
              <th className="px-5 py-2 text-left">Entidade</th>
              <th className="px-5 py-2 text-left">Ação</th>
              <th className="px-5 py-2 text-left">Motivo</th>
            </tr>
          </thead>
          <tbody>
            {(query.data ?? []).map((r) => (
              <tr key={r.id} className="border-t border-border-subtle/40">
                <td className="px-5 py-2 text-xs tabular">{formatDateTimeBR(r.created_at)}</td>
                <td className="px-5 py-2 text-xs">{r.actor_email ?? "—"}</td>
                <td className="px-5 py-2 text-xs">{r.entity}</td>
                <td className="px-5 py-2 text-xs">{r.action}</td>
                <td className="px-5 py-2 text-xs text-muted-foreground">{r.reason ?? "—"}</td>
              </tr>
            ))}
            {query.data?.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-xs text-muted-foreground">Sem registros.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
