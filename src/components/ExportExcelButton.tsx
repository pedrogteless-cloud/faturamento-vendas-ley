import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileSpreadsheet, Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getReportData } from "@/lib/reports.functions";
import { buildReportWorkbook } from "@/lib/excel-report";
import { getErrorMessage, todayISO } from "@/lib/format";

function monthStartISO(): string {
  return `${todayISO().slice(0, 7)}-01`;
}
function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function ExportExcelButton({
  exporterName,
  variant = "ghost",
}: {
  exporterName: string;
  variant?: "ghost" | "primary";
}) {
  const fetchReport = useServerFn(getReportData);
  const [open, setOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState(monthStartISO());
  const [dateTo, setDateTo] = useState(todayISO());

  const exportMutation = useMutation({
    mutationFn: async () => {
      if (dateFrom > dateTo) throw new Error("A data inicial não pode ser maior que a final.");
      const data = await fetchReport({ data: { dateFrom, dateTo } });
      const blob = await buildReportWorkbook(data, dateFrom, dateTo, exporterName);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Ley_Colchoes_${dateFrom}_a_${dateTo}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      toast.success("Relatório gerado.");
      setOpen(false);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={`${variant === "primary" ? "btn-primary" : "btn-ghost"} min-h-9 inline-flex items-center gap-1.5`}
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          Exportar Excel
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-success" /> Exportar Excel
          </DialogTitle>
        </DialogHeader>

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

        <div className="flex flex-wrap gap-2">
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
          className="btn-primary mt-1 inline-flex w-full items-center justify-center gap-2"
        >
          <Download className="h-4 w-4" />
          {exportMutation.isPending ? "Gerando…" : "Baixar planilha"}
        </button>

        <p className="text-[11px] text-muted-foreground">
          Abas: Resumo, Vendas, Faturamento, Carteira, Repasses, Metas e Diário.
        </p>
      </DialogContent>
    </Dialog>
  );
}
