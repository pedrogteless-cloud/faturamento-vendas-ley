import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { centsToBRL, formatPct } from "@/lib/format";
import { ProgressBar } from "./ProgressBar";
import { Sparkline } from "./Sparkline";
import { AnimatedBRL } from "@/components/AnimatedBRL";

export type FactoryCardData = {
  factoryName: string;
  factoryState?: string;
  billingTodayCents: number;
  salesTodayCents: number;
  billingMonthCents: number;
  salesMonthCents: number;
  billingGoalCents: number;
  salesGoalCents: number;
  workdaysElapsed: number;
  workdaysTotal: number;
  calendarConfigured?: boolean;
  expectedBillingCents: number;
  expectedSalesCents: number;
  series: { date: string; billing: number; sales: number }[];
  variant?: "consolidated" | "factory";
  workdayLabel?: string; // override para o consolidado
};

type MetricStatus = "success" | "warning" | "danger" | "info";

function statusFromRatio(actual: number, expected: number): MetricStatus {
  if (expected <= 0) return "info";
  const ratio = actual / expected;
  if (ratio >= 1) return "success";
  if (ratio >= 0.9) return "warning";
  return "danger";
}

function overallStatus(...statuses: MetricStatus[]): MetricStatus {
  const active = statuses.filter((status) => status !== "info");
  if (active.length === 0) return "info";
  if (active.includes("danger")) return "danger";
  if (active.includes("warning")) return "warning";
  return "success";
}

function useGoalAchieved(achieved: boolean) {
  const prevRef = useRef(false);
  const articleRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (achieved && !prevRef.current && articleRef.current) {
      const el = articleRef.current;
      el.animate(
        [
          { boxShadow: "0 0 0px 0px oklch(0.78 0.14 240 / 0)" },
          { boxShadow: "0 0 32px 8px oklch(0.78 0.14 240 / 0.45)" },
          { boxShadow: "0 0 0px 0px oklch(0.78 0.14 240 / 0)" },
        ],
        { duration: 1200, easing: "ease-out" },
      );
    }
    prevRef.current = achieved;
  }, [achieved]);

  return articleRef;
}

export function FactoryCard(props: FactoryCardData) {
  const isConsolidated = props.variant === "consolidated";
  const billingPct =
    props.billingGoalCents > 0 ? props.billingMonthCents / props.billingGoalCents : 0;
  const salesPct = props.salesGoalCents > 0 ? props.salesMonthCents / props.salesGoalCents : 0;
  const billingExpectedPct =
    props.billingGoalCents > 0 ? props.expectedBillingCents / props.billingGoalCents : 0;
  const salesExpectedPct =
    props.salesGoalCents > 0 ? props.expectedSalesCents / props.salesGoalCents : 0;

  const billingStatus = statusFromRatio(props.billingMonthCents, props.expectedBillingCents);
  const salesStatus = statusFromRatio(props.salesMonthCents, props.expectedSalesCents);
  const cardStatus = overallStatus(billingStatus, salesStatus);
  const goalAchieved =
    props.billingGoalCents > 0 &&
    props.billingMonthCents >= props.billingGoalCents &&
    props.salesGoalCents > 0 &&
    props.salesMonthCents >= props.salesGoalCents;
  const articleRef = useGoalAchieved(goalAchieved);
  const remainingBilling = Math.max(0, props.billingGoalCents - props.billingMonthCents);
  const remainingSales = Math.max(0, props.salesGoalCents - props.salesMonthCents);

  const statusBadge = {
    success: "bg-success/15 text-success ring-1 ring-success/30",
    warning: "bg-warning/15 text-warning ring-1 ring-warning/30",
    danger: "bg-destructive/15 text-destructive ring-1 ring-destructive/30",
    info: "bg-primary/15 text-primary ring-1 ring-primary/30",
  }[cardStatus];

  const statusLabel = {
    success: "No prazo",
    warning: "Atenção",
    danger: "Abaixo",
    info: "Sem meta",
  }[cardStatus];

  const statusTitle = {
    success: "Realizado no mês em linha ou acima do esperado para os dias úteis decorridos.",
    warning: "Realizado no mês entre 90% e 100% do esperado para os dias úteis decorridos.",
    danger: "Realizado no mês abaixo de 90% do esperado para os dias úteis decorridos.",
    info: "Cadastre uma meta mensal para acompanhar o ritmo esperado.",
  }[cardStatus];

  const series = props.series.map((s) => ({ date: s.date, value: s.billing }));

  const workdayLabel =
    props.workdayLabel ??
    (props.workdaysTotal > 0
      ? `${props.workdaysElapsed}º dia útil de ${props.workdaysTotal}${props.calendarConfigured === false ? " · calendário sugerido" : ""}`
      : "Calendário não configurado");

  return (
    <article
      ref={articleRef}
      className={cn(
        "flex flex-col gap-5 rounded-2xl border bg-surface p-5 shadow-sm transition-colors sm:p-6",
        isConsolidated
          ? "border-primary/40 bg-surface-elevated ring-1 ring-primary/20"
          : "border-border-subtle",
        goalAchieved && !isConsolidated && "ring-1 ring-success/40",
      )}
    >
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {isConsolidated ? "Consolidado" : "Fábrica"}
          </div>
          <h3 className="mt-0.5 truncate text-lg font-semibold text-foreground sm:text-xl">
            {props.factoryName}
            {props.factoryState && (
              <span className="ml-1.5 text-muted-foreground">· {props.factoryState}</span>
            )}
          </h3>
          <div className="mt-1 text-xs text-muted-foreground">{workdayLabel}</div>
        </div>
        <span
          title={statusTitle}
          className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium", statusBadge)}
        >
          {statusLabel}
        </span>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0 rounded-xl bg-background/30 p-3 sm:bg-transparent sm:p-0">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Faturamento hoje
          </div>
          <AnimatedBRL
            cents={props.billingTodayCents}
            className="tabular mt-1 block truncate text-xl font-semibold text-foreground sm:text-2xl"
          />
        </div>
        <div className="min-w-0 rounded-xl bg-background/30 p-3 sm:bg-transparent sm:p-0">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Vendas hoje
          </div>
          <AnimatedBRL
            cents={props.salesTodayCents}
            className="tabular mt-1 block truncate text-xl font-semibold text-foreground sm:text-2xl"
          />
        </div>
      </section>

      <section className="space-y-4 rounded-xl bg-background/40 p-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Mês</div>

        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted-foreground">Faturamento</span>
            {props.billingGoalCents > 0 ? (
              <span className="tabular text-sm font-semibold text-foreground">
                <AnimatedBRL cents={props.billingMonthCents} />
                <span className="ml-1 text-muted-foreground">
                  / {centsToBRL(props.billingGoalCents)}
                </span>
              </span>
            ) : (
              <Link
                to="/metas"
                className="text-[11px] font-medium text-warning underline-offset-2 hover:underline"
              >
                Meta não cadastrada
              </Link>
            )}
          </div>
          {props.billingGoalCents > 0 && (
            <>
              <div className="mt-2">
                <ProgressBar
                  value={billingPct}
                  expected={billingExpectedPct}
                  variant={billingStatus}
                  label={`Progresso da meta de faturamento de ${props.factoryName}`}
                />
              </div>
              <div className="tabular mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Restam {centsToBRL(remainingBilling)}</span>
                <span className="font-medium text-foreground">{formatPct(billingPct)}</span>
              </div>
            </>
          )}
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted-foreground">Vendas</span>
            {props.salesGoalCents > 0 ? (
              <span className="tabular text-sm font-semibold text-foreground">
                <AnimatedBRL cents={props.salesMonthCents} />
                <span className="ml-1 text-muted-foreground">
                  / {centsToBRL(props.salesGoalCents)}
                </span>
              </span>
            ) : (
              <Link
                to="/metas"
                className="text-[11px] font-medium text-warning underline-offset-2 hover:underline"
              >
                Meta não cadastrada
              </Link>
            )}
          </div>
          {props.salesGoalCents > 0 && (
            <>
              <div className="mt-2">
                <ProgressBar
                  value={salesPct}
                  expected={salesExpectedPct}
                  variant={salesStatus}
                  label={`Progresso da meta de vendas de ${props.factoryName}`}
                />
              </div>
              <div className="tabular mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Restam {centsToBRL(remainingSales)}</span>
                <span className="font-medium text-foreground">{formatPct(salesPct)}</span>
              </div>
            </>
          )}
        </div>
      </section>

      <section>
        <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
          <span>Evolução do mês</span>
          <span>Faturamento acumulado</span>
        </div>
        <Sparkline data={series} />
      </section>
    </article>
  );
}
