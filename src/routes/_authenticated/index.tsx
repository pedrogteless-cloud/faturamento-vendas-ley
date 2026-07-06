import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSessionContext } from "@/lib/session.functions";
import { canRegisterBilling, canRegisterSales } from "@/lib/permissions";
import { Suspense, useEffect, useState } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import { FactoryCard, type FactoryCardData } from "@/components/dashboard/FactoryCard";
import { DayStatusButton } from "@/components/dashboard/DayStatusButton";
import { getDashboard, type DashboardData } from "@/lib/dashboard.functions";
import { centsToBRL, formatDateTimeBR, labelAction, labelEntity } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { setDashboardStatus } from "@/lib/dashboard-status";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Painel Ley Colchões" },
      {
        name: "description",
        content: "Acompanhamento em tempo real de vendas e faturamento das fábricas Ley Colchões.",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}

function DashboardContent() {
  const fetchDashboard = useServerFn(getDashboard);
  const queryClient = useQueryClient();
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "connected" | "failed">(
    "connecting",
  );
  const { data, isFetching, refetch } = useSuspenseQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchDashboard(),
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });

  useEffect(() => {
    let channel = supabase.channel("ley-dashboard-live");
    for (const table of [
      "sales_entries",
      "billing_entries",
      "goals",
      "work_calendar_days",
      "audit_logs",
    ]) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, () =>
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      );
    }
    const failTimeout = setTimeout(() => {
      setRealtimeStatus((s) => (s === "connected" ? s : "failed"));
    }, 10_000);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(failTimeout);
        setRealtimeStatus("connected");
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setRealtimeStatus("failed");
      }
    });
    return () => {
      clearTimeout(failTimeout);
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  useEffect(() => {
    setDashboardStatus({ asOf: data.asOf, realtime: realtimeStatus });
  }, [data.asOf, realtimeStatus]);

  const fetchSession = useServerFn(getSessionContext);
  const sessionQuery = useQuery({ queryKey: ["session-context"], queryFn: () => fetchSession() });
  const session = sessionQuery.data ?? null;
  return (
    <DashboardView
      data={data}
      isRefreshing={isFetching}
      onRefresh={() => void refetch()}
      session={session}
    />
  );
}

function DashboardView({
  data,
  isRefreshing,
  onRefresh,
  session,
}: {
  data: DashboardData;
  isRefreshing: boolean;
  onRefresh: () => void;
  session: import("@/lib/permissions").SessionContext | null;
}) {
  const canSales = canRegisterSales(session);
  const canBilling = canRegisterBilling(session);

  const consolidated: FactoryCardData = {
    factoryName: "Total Ley Colchões",
    billingTodayCents: data.consolidated.billingTodayCents,
    salesTodayCents: data.consolidated.salesTodayCents,
    billingMonthCents: data.consolidated.billingMonthCents,
    salesMonthCents: data.consolidated.salesMonthCents,
    billingGoalCents: data.consolidated.billingGoalCents,
    salesGoalCents: data.consolidated.salesGoalCents,
    workdaysElapsed: 0,
    workdaysTotal: 0,
    expectedBillingCents: data.consolidated.expectedBillingCents,
    expectedSalesCents: data.consolidated.expectedSalesCents,
    series: aggregateSeries(data.factories.map((f) => f.series)),
    variant: "consolidated",
    carteiraCents: data.consolidated.carteiraCents,
    workdayLabel: "Ritmo consolidado das fábricas",
  };

  const monthLabel = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Fortaleza",
    month: "long",
    year: "numeric",
  }).format(new Date(data.asOf));

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Visão geral</h2>
          <p className="text-xs text-muted-foreground first-letter:uppercase">
            {monthLabel} · atualizado em {formatDateTimeBR(data.asOf)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DayStatusButton data={data} />
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="btn-ghost min-h-9"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "Atualizando" : "Atualizar"}
          </button>
        </div>
      </div>

      {data.factories.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-border-subtle bg-surface p-10 text-center">
          <h3 className="text-sm font-semibold">Nenhuma fábrica disponível</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Cadastre as fábricas ou verifique as permissões de acesso.
          </p>
        </section>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <FactoryCard {...consolidated} />
            {(() => {
              const pendingMap = new Map(data.pendingToday.map((p) => [p.factoryId, p.missing]));
              return (
                <div className="grid gap-4 md:grid-cols-2">
                  {data.factories.map((f) => (
                    <FactoryCard
                      key={f.factoryId}
                      factoryName={f.factoryName}
                      factoryState={f.factoryState}
                      billingTodayCents={f.billingTodayCents}
                      salesTodayCents={f.salesTodayCents}
                      billingMonthCents={f.billingMonthCents}
                      salesMonthCents={f.salesMonthCents}
                      billingGoalCents={f.billingGoalCents}
                      salesGoalCents={f.salesGoalCents}
                      workdaysElapsed={f.workdaysElapsed}
                      workdaysTotal={f.workdaysTotal}
                      calendarConfigured={f.calendarConfigured}
                      expectedBillingCents={f.expectedBillingCents}
                      expectedSalesCents={f.expectedSalesCents}
                      series={f.series}
                      variant="factory"
                      carteiraCents={f.carteiraCents}
                      factoryId={f.factoryId}
                      pendingTypes={pendingMap.get(f.factoryId)}
                      canRegisterSales={canSales}
                      canRegisterBilling={canBilling}
                    />
                  ))}
                </div>
              );
            })()}
          </div>

          <aside className="space-y-4">
            {(canSales || canBilling) && (
              <Panel title="Pendências de hoje">
                {data.pendingToday.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma pendência. Tudo lançado.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.pendingToday.map((p) => (
                      <li
                        key={p.factoryId}
                        className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs"
                      >
                        <div className="font-medium text-foreground">{p.factoryName}</div>
                        <div className="mt-0.5 flex items-center justify-between gap-2 text-muted-foreground">
                          <span className="flex shrink-0 items-center gap-2">
                            {p.missing.map((m) => (
                              <Link
                                key={m}
                                to="/lancamentos"
                                search={{ factoryId: p.factoryId, type: m as "sales" | "billing" }}
                                className="inline-flex items-center gap-1 font-medium text-destructive hover:underline"
                              >
                                {m === "sales" ? "↗ Venda" : "↗ Fat."}{" "}
                                <ArrowRight className="h-3 w-3" />
                              </Link>
                            ))}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}

            <Panel title="Insights">
              <ul className="space-y-2 text-xs">
                {generateInsights(data).map((line, i) => (
                  <li key={i} className="rounded-md bg-muted/30 px-3 py-2 text-muted-foreground">
                    {line}
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Últimas atualizações">
              {data.recentUpdates.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma atualização recente.</p>
              ) : (
                <ul className="space-y-2 text-xs">
                  {data.recentUpdates.map((u) => (
                    <li
                      key={u.id}
                      className="border-b border-border-subtle/50 pb-2 last:border-0 last:pb-0"
                    >
                      <div className="font-medium text-foreground">
                        {labelEntity(u.entity)} · {labelAction(u.action)}
                      </div>
                      <div className="text-muted-foreground">
                        {u.actor ?? "Sistema"} · {formatDateTimeBR(u.createdAt)}
                        {u.factoryName ? ` · ${u.factoryName}` : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </aside>
        </div>
      )}
    </>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border-subtle bg-surface p-4">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function aggregateSeries(seriesList: { date: string; billing: number; sales: number }[][]) {
  const map = new Map<string, { billing: number; sales: number }>();
  for (const list of seriesList) {
    for (const s of list) {
      const cur = map.get(s.date) ?? { billing: 0, sales: 0 };
      cur.billing += s.billing;
      cur.sales += s.sales;
      map.set(s.date, cur);
    }
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, billing: v.billing, sales: v.sales }));
}

function generateInsights(data: DashboardData): string[] {
  const out: string[] = [];
  const c = data.consolidated;
  if (c.billingGoalCents > 0) {
    const pct = c.billingMonthCents / c.billingGoalCents;
    if (pct >= 1)
      out.push(`Meta consolidada de faturamento atingida (${(pct * 100).toFixed(0)}%).`);
    else if (c.expectedBillingCents > 0) {
      const diff = c.billingMonthCents - c.expectedBillingCents;
      if (diff >= 0) out.push(`Faturamento consolidado acima do esperado em ${centsToBRL(diff)}.`);
      else out.push(`Faturamento consolidado abaixo do esperado em ${centsToBRL(Math.abs(diff))}.`);
    }
  } else {
    out.push("Configure as metas mensais para acompanhar o ritmo.");
  }
  if (data.pendingToday.length > 0) {
    out.push(`${data.pendingToday.length} fábrica(s) com lançamentos pendentes hoje.`);
  }
  for (const f of data.factories) {
    if (f.billingGoalCents > 0 && f.billingMonthCents >= f.billingGoalCents) {
      out.push(`${f.factoryName} atingiu a meta mensal de faturamento.`);
    }
  }
  if (out.length === 0) out.push("Tudo no ritmo esperado.");
  return out.slice(0, 4);
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-64 animate-pulse rounded-2xl bg-surface" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-56 animate-pulse rounded-2xl bg-surface" />
        <div className="h-56 animate-pulse rounded-2xl bg-surface" />
      </div>
    </div>
  );
}
