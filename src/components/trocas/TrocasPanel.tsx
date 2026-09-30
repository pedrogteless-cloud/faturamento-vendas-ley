import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, RefreshCcw } from "lucide-react";
import { getTrocasRange } from "@/lib/trocas.functions";
import {
  dayShare,
  formatShare,
  statusFor,
  summarize,
  type TrocasDay,
  type TrocasThresholds,
} from "@/lib/trocas-calc";
import { centsToBRL } from "@/lib/format";
import { STATUS_STYLE, StatusPill } from "@/components/trocas/trocas-ui";

/** Barras do % diário, coloridas pela situação, com as faixas de alerta. */
export function TrocasBars({
  days,
  thresholds,
  height = 56,
}: {
  days: TrocasDay[];
  thresholds: TrocasThresholds;
  height?: number;
}) {
  const shares = days.map((d) => dayShare(d.billingCents, d.trocasCents));
  const maxPct = Math.max(thresholds.critico * 1.5, ...shares.map((s) => (s ?? 0) * 100));
  const W = 300;
  const n = Math.max(days.length, 1);
  const bw = W / n;
  const y = (pct: number) => height - (pct / maxPct) * height;

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="none"
      className="block h-14 w-full"
      role="img"
      aria-label="Percentual diário de trocas na produção"
    >
      {[thresholds.atencao, thresholds.critico].map((t) => (
        <line
          key={t}
          x1={0}
          x2={W}
          y1={y(t)}
          y2={y(t)}
          className={t === thresholds.critico ? "stroke-destructive/50" : "stroke-warning/50"}
          strokeDasharray="3 3"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {days.map((d, i) => {
        const s = shares[i];
        const st = statusFor(s, thresholds);
        const pct = s == null ? maxPct * 0.08 : Math.max((s ?? 0) * 100, maxPct * 0.02);
        return (
          <rect
            key={d.date}
            x={i * bw + bw * 0.15}
            width={bw * 0.7}
            y={y(pct)}
            height={height - y(pct)}
            rx={1.5}
            className={STATUS_STYLE[st].fill}
            opacity={s == null ? 0.35 : 1}
          >
            <title>
              {d.date.slice(8, 10)}/{d.date.slice(5, 7)}: {formatShare(s)}
            </title>
          </rect>
        );
      })}
    </svg>
  );
}

export function TrocasPanel({ date }: { date: string }) {
  const fetchRange = useServerFn(getTrocasRange);
  const monthStart = `${date.slice(0, 7)}-01`;
  const q = useQuery({
    queryKey: ["trocas-range", monthStart, date],
    queryFn: () => fetchRange({ data: { dateFrom: monthStart, dateTo: date } }),
    refetchInterval: 60_000, // painel de TV: atualiza sozinho
  });

  if (q.isLoading) return <div className="h-48 animate-pulse rounded-2xl bg-muted/40" />;
  if (!q.data) return null;
  const { thresholds, factories } = q.data;

  return (
    <section className="rounded-2xl border-2 border-orange-500/40 bg-orange-500/[0.05] p-5">
      <header className="mb-1 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-orange-500">
          <RefreshCcw className="h-4 w-4" /> Trocas na produção
        </h3>
        <Link
          to="/trocas"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Análise <ArrowRight className="h-3 w-3" />
        </Link>
      </header>
      <p className="mb-4 flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
        Não é faturamento e não gera contas a receber. Quanto menor, melhor.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {factories.map((f) => {
          const today = f.days.find((d) => d.date === date);
          const todayShare = today ? dayShare(today.billingCents, today.trocasCents) : null;
          const month = summarize(f.days, thresholds);
          return (
            <div key={f.id} className="rounded-xl border border-border-subtle bg-surface p-4">
              <div className="mb-3 text-[11px] uppercase tracking-wider text-muted-foreground">
                {f.code === "eusebio" ? "Matriz" : f.code === "timon" ? "Filial" : ""} · {f.name} ·{" "}
                {f.state}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] text-muted-foreground">Hoje</div>
                  <div
                    className={`tabular text-2xl font-semibold ${STATUS_STYLE[statusFor(todayShare, thresholds)].text}`}
                  >
                    {formatShare(todayShare)}
                  </div>
                  <StatusPill status={statusFor(todayShare, thresholds)} />
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Acumulado do mês</div>
                  <div
                    className={`tabular text-2xl font-semibold ${STATUS_STYLE[statusFor(month.weightedShare, thresholds)].text}`}
                  >
                    {formatShare(month.weightedShare)}
                  </div>
                  <div className="tabular text-[11px] text-muted-foreground">
                    {centsToBRL(month.trocasCents)} em trocas
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <TrocasBars days={f.days} thresholds={thresholds} />
              </div>
              {month.missingDays > 0 && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {month.missingDays} dia(s) sem informação no mês
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
