import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listEntries } from "@/lib/entries.functions";
import { listFactories } from "@/lib/factories.functions";
import { centsToBRL, formatDateBR, formatDateTimeBR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/historico")({
  head: () => ({ meta: [{ title: "Histórico — Ley Colchões" }] }),
  component: HistoryPage,
});

function HistoryPage() {
  const [type, setType] = useState<"sales" | "billing">("sales");
  const fetchEntries = useServerFn(listEntries);
  const fetchFactories = useServerFn(listFactories);
  const factoriesQuery = useQuery({ queryKey: ["factories"], queryFn: () => fetchFactories() });
  const entriesQuery = useQuery({
    queryKey: ["entries", type, "history"],
    queryFn: () => fetchEntries({ data: { type, limit: 200 } }),
  });

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">Histórico de lançamentos</h1>
        <p className="text-xs text-muted-foreground">
          Consulta dos lançamentos com data de criação e alteração.
        </p>
      </header>

      <div className="mb-4 inline-flex rounded-xl border border-border-subtle bg-surface p-1 text-sm">
        <button
          onClick={() => setType("sales")}
          className={`rounded-lg px-3 py-1.5 ${type === "sales" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          Vendas
        </button>
        <button
          onClick={() => setType("billing")}
          className={`rounded-lg px-3 py-1.5 ${type === "billing" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          Faturamento
        </button>
      </div>

      <section className="overflow-x-auto rounded-2xl border border-border-subtle bg-surface">
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
              const fac = factoriesQuery.data?.find((f) => f.id === row.factory_id);
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
      </section>
    </div>
  );
}
