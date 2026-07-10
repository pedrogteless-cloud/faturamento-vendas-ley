import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSessionContext } from "@/lib/session.functions";
import { ExportExcelButton } from "@/components/ExportExcelButton";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — Ley Colchões" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const fetchSession = useServerFn(getSessionContext);
  const sessionQuery = useQuery({ queryKey: ["session-context"], queryFn: () => fetchSession() });

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">Relatórios</h1>
        <p className="text-xs text-muted-foreground">
          Exporte uma planilha Excel com todas as informações do período escolhido.
        </p>
      </header>

      <section className="max-w-lg rounded-2xl border border-border-subtle bg-surface p-6">
        <p className="mb-4 text-sm text-muted-foreground">
          Gere um Excel formatado com as abas Resumo, Vendas, Faturamento, Carteira, Repasses, Metas
          e Diário. Escolha o período na janela que abrir.
        </p>
        <ExportExcelButton exporterName={sessionQuery.data?.fullName ?? "—"} variant="primary" />
      </section>
    </div>
  );
}
