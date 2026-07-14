import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listEntries } from "@/lib/entries.functions";
import { listFactories } from "@/lib/factories.functions";
import { listReturnedCheckRecoveries } from "@/lib/returned-checks.functions";
import { centsToBRL, formatDateBR, formatDateTimeBR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/historico")({
  head: () => ({ meta: [{ title: "Histórico — Ley Colchões" }] }),
  component: HistoryPage,
});

type HistoryMode = "sales" | "billing" | "returned-check";

const HISTORY_MODES: { value: HistoryMode; label: string }[] = [
  { value: "sales", label: "Vendas" },
  { value: "billing", label: "Faturamento" },
  { value: "returned-check", label: "Cheques recuperados" },
];

function HistoryPage() {
  const [mode, setMode] = useState<HistoryMode>("sales");
  const fetchEntries = useServerFn(listEntries);
  const fetchFactories = useServerFn(listFactories);
  const fetchReturnedChecks = useServerFn(listReturnedCheckRecoveries);
  const factoriesQuery = useQuery({ queryKey: ["factories"], queryFn: () => fetchFactories() });
  const entriesQuery = useQuery({
    queryKey: ["entries", mode, "history"],
    queryFn: () => {
      if (mode === "returned-check") return Promise.resolve([]);
      return fetchEntries({ data: { type: mode, limit: 200 } });
    },
    enabled: mode !== "returned-check",
  });
  const returnedChecksQuery = useQuery({
    queryKey: ["returned-check-recoveries", "history"],
    queryFn: () => fetchReturnedChecks({ data: { limit: 200 } }),
    enabled: mode === "returned-check",
  });
  const factoryById = useMemo(
    () => new Map((factoriesQuery.data ?? []).map((f) => [f.id, f])),
    [factoriesQuery.data],
  );

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">Histórico de lançamentos</h1>
        <p className="text-xs text-muted-foreground">
          Consulta dos lançamentos com data de criação e alteração.
        </p>
      </header>

      <div className="mb-4 inline-flex flex-wrap rounded-xl border border-border-subtle bg-surface p-1 text-sm">
        {HISTORY_MODES.map((item) => (
          <button
            key={item.value}
            onClick={() => setMode(item.value)}
            className={`rounded-lg px-3 py-1.5 ${mode === item.value ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <section className="overflow-x-auto rounded-2xl border border-border-subtle bg-surface">
        {mode === "returned-check" ? (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-5 py-2 text-left">Recuperação</th>
                <th className="px-5 py-2 text-left">Fábrica</th>
                <th className="px-5 py-2 text-right">Valor</th>
                <th className="px-5 py-2 text-left">Status</th>
                <th className="px-5 py-2 text-left">Identificação</th>
                <th className="px-5 py-2 text-left">Devolução</th>
                <th className="px-5 py-2 text-left">Criado</th>
                <th className="px-5 py-2 text-left">Atualizado</th>
                <th className="px-5 py-2 text-left">Observação</th>
              </tr>
            </thead>
            <tbody>
              {(returnedChecksQuery.data ?? []).map((row) => {
                const fac = factoryById.get(row.factory_id);
                const identity = [row.customer_name, row.check_reference]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <tr key={row.id} className="border-t border-border-subtle/40">
                    <td className="px-5 py-2 tabular">{formatDateBR(row.recovered_date)}</td>
                    <td className="px-5 py-2">{fac ? `${fac.name} · ${fac.state}` : "—"}</td>
                    <td className="px-5 py-2 text-right tabular font-medium">
                      {centsToBRL(Number(row.amount_cents))}
                    </td>
                    <td className="px-5 py-2">
                      <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">
                        Recuperado
                      </span>
                    </td>
                    <td className="px-5 py-2 text-muted-foreground">{identity || "—"}</td>
                    <td className="px-5 py-2 tabular text-muted-foreground">
                      {formatDateBR(row.returned_date)}
                    </td>
                    <td className="px-5 py-2 text-xs text-muted-foreground">
                      {formatDateTimeBR(row.created_at)}
                    </td>
                    <td className="px-5 py-2 text-xs text-muted-foreground">
                      {formatDateTimeBR(row.updated_at)}
                    </td>
                    <td className="px-5 py-2 text-muted-foreground">{row.note ?? "—"}</td>
                  </tr>
                );
              })}
              {returnedChecksQuery.data?.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-8 text-center text-xs text-muted-foreground">
                    Nenhum cheque recuperado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-5 py-2 text-left">Data ref.</th>
                <th className="px-5 py-2 text-left">Fábrica</th>
                <th className="px-5 py-2 text-right">Valor</th>
                <th className="px-5 py-2 text-left">Criado</th>
                <th className="px-5 py-2 text-left">Atualizado</th>
                <th className="px-5 py-2 text-left">Observação</th>
              </tr>
            </thead>
            <tbody>
              {(entriesQuery.data ?? []).map((row) => {
                const fac = factoryById.get(row.factory_id);
                return (
                  <tr key={row.id} className="border-t border-border-subtle/40">
                    <td className="px-5 py-2 tabular">{formatDateBR(row.reference_date)}</td>
                    <td className="px-5 py-2">{fac ? `${fac.name} · ${fac.state}` : "—"}</td>
                    <td className="px-5 py-2 text-right tabular font-medium">
                      {centsToBRL(Number(row.amount_cents))}
                    </td>
                    <td className="px-5 py-2 text-xs text-muted-foreground">
                      {formatDateTimeBR(row.created_at)}
                    </td>
                    <td className="px-5 py-2 text-xs text-muted-foreground">
                      {formatDateTimeBR(row.updated_at)}
                    </td>
                    <td className="px-5 py-2 text-muted-foreground">{row.note ?? "—"}</td>
                  </tr>
                );
              })}
              {entriesQuery.data?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-xs text-muted-foreground">
                    Nenhum registro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
