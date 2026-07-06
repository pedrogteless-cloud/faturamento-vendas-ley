import { useState } from "react";
import { Activity, Copy, Check, Send } from "lucide-react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { centsToBRL, getErrorMessage } from "@/lib/format";
import { sendDailySummaryNow } from "@/lib/notifications.functions";
import type { DashboardData } from "@/lib/dashboard.functions";

type Row = {
  title: string;
  subtitle?: string;
  billing: number;
  sales: number;
  carteira: number;
  highlight?: boolean;
};

function buildRows(data: DashboardData): Row[] {
  const factories: Row[] = data.factories.map((f) => ({
    title: f.factoryName,
    subtitle: f.factoryState,
    billing: f.billingTodayCents,
    sales: f.salesTodayCents,
    carteira: Math.max(0, f.carteiraCents),
  }));
  const total: Row = {
    title: "Total Ley Colchões",
    billing: data.consolidated.billingTodayCents,
    sales: data.consolidated.salesTodayCents,
    carteira: Math.max(0, data.consolidated.carteiraCents),
    highlight: true,
  };
  return [...factories, total];
}

function buildText(data: DashboardData): string {
  const date = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Fortaleza",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(data.asOf));
  const lines: string[] = [`📊 STATUS DE HOJE — ${date}`, "Ley Colchões", ""];
  for (const r of buildRows(data)) {
    const name = r.subtitle
      ? `${r.title.toUpperCase()} (${r.subtitle})`
      : `📈 ${r.title.toUpperCase()}`;
    lines.push(r.highlight ? name : `🏭 ${name}`);
    lines.push(`💰 Faturamento: ${centsToBRL(r.billing)}`);
    lines.push(`🛒 Vendas: ${centsToBRL(r.sales)}`);
    lines.push(`📦 Carteira: ${centsToBRL(r.carteira)}`);
    lines.push("");
  }
  return lines.join("\n").trim();
}

export function DayStatusButton({ data, canSend }: { data: DashboardData; canSend?: boolean }) {
  const [copied, setCopied] = useState(false);
  const rows = buildRows(data);
  const sendSummary = useServerFn(sendDailySummaryNow);

  const sendMutation = useMutation({
    mutationFn: () => sendSummary(),
    onSuccess: () => toast.success("Resumo enviado no Telegram."),
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buildText(data));
      setCopied(true);
      toast.success("Resumo copiado — cole no WhatsApp.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className="btn-ghost min-h-9">
          <Activity className="h-3.5 w-3.5" />
          Status de hoje
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>📊</span> Status de hoje
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {rows.map((r) => (
            <div
              key={r.title}
              className={
                r.highlight
                  ? "rounded-2xl border border-primary/40 bg-primary/10 p-4"
                  : "rounded-2xl border border-border-subtle bg-surface p-4"
              }
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="text-base">{r.highlight ? "📈" : "🏭"}</span>
                <span className="text-sm font-semibold">
                  {r.title}
                  {r.subtitle && <span className="text-muted-foreground"> · {r.subtitle}</span>}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <StatBox emoji="💰" label="Faturamento" value={r.billing} tone="billing" />
                <StatBox emoji="🛒" label="Vendas" value={r.sales} tone="sales" />
                <StatBox emoji="📦" label="Carteira" value={r.carteira} tone="carteira" />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={handleCopy}
            className="btn-ghost inline-flex w-full items-center justify-center gap-2"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copiado!" : "Copiar para WhatsApp"}
          </button>
          {canSend && (
            <button
              type="button"
              onClick={() => sendMutation.mutate()}
              disabled={sendMutation.isPending}
              className="btn-primary inline-flex w-full items-center justify-center gap-2"
            >
              <Send className="h-4 w-4" />
              {sendMutation.isPending ? "Enviando…" : "Enviar no Telegram"}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatBox({
  emoji,
  label,
  value,
  tone,
}: {
  emoji: string;
  label: string;
  value: number;
  tone: "billing" | "sales" | "carteira";
}) {
  const toneClass = {
    billing: "text-success",
    sales: "text-primary",
    carteira: "text-warning",
  }[tone];
  return (
    <div className="rounded-xl bg-background/50 p-2.5 text-center">
      <div className="text-[11px] text-muted-foreground">
        {emoji} {label}
      </div>
      <div className={`tabular mt-1 text-sm font-semibold ${toneClass}`}>{centsToBRL(value)}</div>
    </div>
  );
}
