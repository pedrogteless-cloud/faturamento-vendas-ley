import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileSpreadsheet, Download } from "lucide-react";
import { getReportData } from "@/lib/reports.functions";
import { buildReportWorkbook } from "@/lib/excel-report";
import { getSessionContext } from "@/lib/session.functions";
import { canAccessAdmin } from "@/lib/permissions";
import { getErrorMessage, todayISO } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — Ley Colchões" }] }),
  component: ReportsPage,
});

function monthStartISO(): string {
  const t = todayISO();
  return `${t.slice(0, 7)}-01`;
}

function ReportsPage() {
  const fetchSession = useServerFn(getSessionContext);
  const fetchReport = useServerFn(getReportData);
  const sessionQuery = useQuery({ queryKey: ["session-context"], queryFn: () => fetchSession() });
  const isAdmin = canAccessAdmin(sessionQuery.data ?? null);

  const [dateFrom, setDateFrom] = useState(monthStartISO());
  const [dateTo, setDateTo] = useState(todayISO());

  const exportMutation = useMutation({
    mutationFn: async () => {
      if (dateFrom > dateTo) throw new Error("A data inicial não pode ser maior que a final.");
      const data = await fetchReport({ data: { dateFrom, dateTo } });
      const blob = await buildReportWorkbook(
        data,
        dateFrom,
        dateTo,
        sessionQuery.data?.fullName ?? "—",
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Ley_Colchoes_${dateFrom}_a_${dateTo}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => toast.success("Relatório gerado."),
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  if (sessionQuery.data && !isAdmin) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <p className="text-sm text-muted-foreground">Esta área é restrita a administradores.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">Relatórios</h1>
        <p className="text-xs text-muted-foreground">
          Exporte uma planilha Excel com todas as informações do período escolhido.
        </p>
      </header>

      <section className="max-w-lg rounded-2xl border border-border-subtle bg-surface p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <FileSpreadsheet className="h-4 w-4 text-success" />
          Exportar Excel
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">De</span>
            <input
              type="date"
              className="input-field"
              value={dateFrom}
              max={todayISO()}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Até</span>
            <input
              type="date"
              className="input-field"
              value={dateTo}
              max={todayISO()}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {[
            { label: "Este mês", from: monthStartISO(), to: todayISO() },
            { label: "Últimos 30 dias", from: shiftDays(todayISO(), -29), to: todayISO() },
          ].map((p) => (
            <button
              key={p.label}
              type="button"
              className="btn-ghost text-xs"
              onClick={() => {
                setDateFrom(p.from);
                setDateTo(p.to);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => exportMutation.mutate()}
          disabled={exportMutation.isPending}
          className="btn-primary mt-4 inline-flex w-full items-center justify-center gap-2"
        >
          <Download className="h-4 w-4" />
          {exportMutation.isPending ? "Gerando…" : "Exportar Excel"}
        </button>

        <p className="mt-3 text-[11px] text-muted-foreground">
          Abas: Resumo, Vendas, Faturamento, Carteira, Repasses, Metas e Diário.
        </p>
      </section>
    </div>
  );
}

function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
