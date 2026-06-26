import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { formatDateTimeBR, labelAction, labelEntity } from "@/lib/format";

const ENTITIES = [
  "sales_entries",
  "billing_entries",
  "goals",
  "work_calendar_days",
  "user_roles",
  "user_permissions",
  "user_factory_access",
];
const ACTIONS = ["create", "update", "delete"];

const listAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        dateFrom: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        dateTo: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        entity: z.string().optional(),
        action: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("audit_logs")
      .select("id, entity, action, actor_email, before, after, reason, created_at");
    if (data.dateFrom) query = query.gte("created_at", `${data.dateFrom}T00:00:00`);
    if (data.dateTo) query = query.lte("created_at", `${data.dateTo}T23:59:59`);
    if (data.entity) query = query.eq("entity", data.entity);
    if (data.action) query = query.eq("action", data.action);
    const { data: rows, error } = await query.order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const Route = createFileRoute("/_authenticated/auditoria")({
  head: () => ({ meta: [{ title: "Auditoria — Ley Colchões" }] }),
  component: AuditPage,
});

function AuditPage() {
  const fetchAudit = useServerFn(listAudit);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [entity, setEntity] = useState("");
  const [action, setAction] = useState("");
  const query = useQuery({
    queryKey: ["audit", dateFrom, dateTo, entity, action],
    queryFn: () =>
      fetchAudit({
        data: {
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          entity: entity || undefined,
          action: action || undefined,
        },
      }),
  });

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Auditoria</h1>
        <p className="text-xs text-muted-foreground">Registro imutável de todas as alterações.</p>
      </header>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-border-subtle bg-surface p-4">
        <label className="block space-y-1">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">De</span>
          <input
            type="date"
            className="input-field !w-auto"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Até</span>
          <input
            type="date"
            className="input-field !w-auto"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Entidade
          </span>
          <select
            className="input-field !w-auto"
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
          >
            <option value="">Todas</option>
            {ENTITIES.map((e) => (
              <option key={e} value={e}>
                {labelEntity(e)}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Ação</span>
          <select
            className="input-field !w-auto"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          >
            <option value="">Todas</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {labelAction(a)}
              </option>
            ))}
          </select>
        </label>
        {(dateFrom || dateTo || entity || action) && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setDateFrom("");
              setDateTo("");
              setEntity("");
              setAction("");
            }}
          >
            Limpar filtros
          </button>
        )}
      </div>

      {query.isLoading ? (
        <div className="h-64 animate-pulse rounded-2xl bg-surface" />
      ) : (
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
                  <td className="px-5 py-2 text-xs">{r.actor_email ?? "Sistema"}</td>
                  <td className="px-5 py-2 text-xs">{labelEntity(r.entity)}</td>
                  <td className="px-5 py-2 text-xs">{labelAction(r.action)}</td>
                  <td className="px-5 py-2 text-xs text-muted-foreground">{r.reason ?? "—"}</td>
                </tr>
              ))}
              {query.data?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-xs text-muted-foreground">
                    Nenhum registro encontrado para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
