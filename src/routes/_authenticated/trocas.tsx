import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getTrocasRange } from "@/lib/trocas.functions";
import {
  STATUS_LABEL,
  consolidatedDays,
  dayShare,
  formatShare,
  per100Sentence,
  statusFor,
  summarize,
  weekly,
  type TrocasDay,
} from "@/lib/trocas-calc";
import { centsToBRL, formatDateBR, todayISO } from "@/lib/format";
import { STATUS_STYLE, StatusPill, TROCAS_DISCLAIMER } from "@/components/trocas/trocas-ui";
import { TrocasBars } from "@/components/trocas/TrocasPanel";

export const Route = createFileRoute("/_authenticated/trocas")({
  head: () => ({ meta: [{ title: "Trocas na produção — Ley Colchões" }] }),
  component: TrocasPage,
});

function monthBounds(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const end = `${ym}-${String(last).padStart(2, "0")}`;
  const today = todayISO();
  return { from: `${ym}-01`, to: end > today ? today : end };
}

function TrocasPage() {
  const fetchRange = useServerFn(getTrocasRange);
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [view, setView] = useState<string>("consolidado");
  const { from, to } = monthBounds(month);

  const q = useQuery({
    queryKey: ["trocas-range", from, to],
    queryFn: () => fetchRange({ data: { dateFrom: from, dateTo: to } }),
  });

  const views = useMemo(() => {
    if (!q.data) return [];
    const list: { key: string; label: string; days: TrocasDay[] }[] = q.data.factories.map((f) => ({
      key: f.id,
      label: `${f.code === "eusebio" ? "Matriz" : f.code === "timon" ? "Filial" : f.name} · ${f.name}`,
      days: f.days,
    }));
    list.unshift({
      key: "consolidado",
      label: "Consolidado",
      days: consolidatedDays(q.data.factories.map((f) => f.days)),
    });
    return list;
  }, [q.data]);

  const current = views.find((v) => v.key === view) ?? views[0];
  const t = q.data?.thresholds;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <RefreshCcw className="h-5 w-5 text-orange-500" /> Trocas na produção
          </h1>
          <p className="text-xs text-muted-foreground">
            Produtos fabricados para trocas e assistências de itens já vendidos.
          </p>
        </div>
        <label className="block space-y-1">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Mês</span>
          <input
            type="month"
            className="input-field !w-auto"
            value={month}
            max={todayISO().slice(0, 7)}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
          />
        </label>
      </header>

      <div className="mb-5 flex gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs leading-relaxed text-destructive">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{TROCAS_DISCLAIMER}</p>
      </div>

      {q.isLoading || !t || !current ? (
        <div className="h-64 animate-pulse rounded-2xl bg-muted/40" />
      ) : (
        <>
          <div className="mb-5 inline-flex flex-wrap rounded-xl border border-border-subtle bg-surface p-1 text-sm">
            {views.map((v) => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={`rounded-lg px-3 py-1.5 ${current.key === v.key ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <Analysis
            days={current.days}
            thresholds={t}
            consolidated={current.key === "consolidado"}
          />
        </>
      )}
    </div>
  );
}

function Analysis({
  days,
  thresholds,
  consolidated,
}: {
  days: TrocasDay[];
  thresholds: { atencao: number; critico: number };
  consolidated: boolean;
}) {
  const s = summarize(days, thresholds);
  const st = statusFor(s.weightedShare, thresholds);
  const weeks = weekly(days, thresholds);
  const chartData = days.map((d) => ({
    dia: d.date.slice(8, 10),
    receber: d.billingCents / 100,
    trocas: (d.trocasCents ?? 0) / 100,
  }));

  if (!days.length) {
    return (
      <p className="rounded-2xl border border-dashed border-border-subtle p-10 text-center text-sm text-muted-foreground">
        Nenhum dado de faturamento ou trocas neste mês.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Acumulado do mês (ponderado)">
          <div className={`tabular text-3xl font-semibold ${STATUS_STYLE[st].text}`}>
            {formatShare(s.weightedShare)}
          </div>
          <StatusPill status={st} />
        </Tile>
        <Tile label="Trocas na produção">
          <div className="tabular text-2xl font-semibold">{centsToBRL(s.trocasCents)}</div>
          <div className="tabular text-[11px] text-muted-foreground">
            Produção total (faturamento + trocas): {centsToBRL(s.productionCents)}
          </div>
        </Tile>
        <Tile label="Pior dia">
          <div className="tabular text-2xl font-semibold text-destructive">
            {s.worst ? formatShare(s.worst.share) : "—"}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {s.worst ? formatDateBR(s.worst.date) : "—"} · média simples{" "}
            {formatShare(s.simpleAvgShare)}
          </div>
        </Tile>
        <Tile label="Dias por situação">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm tabular">
            <span className="text-success">{s.counts.normal} normal</span>
            <span className="text-warning">{s.counts.atencao} atenção</span>
            <span className="text-destructive">{s.counts.critico} crítico</span>
            <span className="text-muted-foreground">{s.missingDays} sem info</span>
          </div>
          <div className="tabular text-[11px] text-muted-foreground">
            {formatShare(s.criticalDaysShare, 0)} dos dias informados em Crítico
          </div>
        </Tile>
      </section>

      <p className="rounded-xl bg-orange-500/10 px-4 py-3 text-sm">
        {per100Sentence(s.weightedShare)}
        {consolidated && (
          <span className="block text-[11px] text-muted-foreground">
            Consolidado considera só os dias em que as duas fábricas informaram.
          </span>
        )}
      </p>

      <section className="rounded-2xl border border-border-subtle bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">% da produção em trocas, por dia</h2>
        <TrocasBars days={days} thresholds={thresholds} height={90} />
        <p className="mt-2 text-[11px] text-muted-foreground">
          Linhas tracejadas: Atenção a partir de {thresholds.atencao}% · Crítico a partir de{" "}
          {thresholds.critico}%. Barras claras = sem informação.
        </p>
      </section>

      <section className="rounded-2xl border border-border-subtle bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">Gera a receber × trocas (R$ por dia)</h2>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeOpacity={0.15} />
              <XAxis dataKey="dia" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={44}
                tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
              />
              <Tooltip
                formatter={(v: number, name: string) => [
                  centsToBRL(Math.round(v * 100)),
                  name === "receber" ? "Faturamento (gera a receber)" : "Trocas (não gera)",
                ]}
                labelFormatter={(l) => `Dia ${l}`}
              />
              <Bar dataKey="receber" stackId="p" fill="var(--color-primary)" />
              <Bar dataKey="trocas" stackId="p" fill="#f97316" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="overflow-x-auto rounded-2xl border border-border-subtle bg-surface">
        <h2 className="border-b border-border-subtle px-5 py-3 text-sm font-semibold">
          Evolução semanal (seg–sex)
        </h2>
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-5 py-2 text-left">Semana de</th>
              <th className="px-5 py-2 text-right">Trocas</th>
              <th className="px-5 py-2 text-right">% ponderado</th>
              <th className="px-5 py-2 text-left">Situação</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.week} className="border-t border-border-subtle/40">
                <td className="px-5 py-2 tabular">{formatDateBR(w.week)}</td>
                <td className="px-5 py-2 text-right tabular">
                  {centsToBRL(w.summary.trocasCents)}
                </td>
                <td className="px-5 py-2 text-right tabular">
                  {formatShare(w.summary.weightedShare)}
                </td>
                <td className="px-5 py-2">
                  <StatusPill status={statusFor(w.summary.weightedShare, thresholds)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="overflow-x-auto rounded-2xl border border-border-subtle bg-surface">
        <h2 className="border-b border-border-subtle px-5 py-3 text-sm font-semibold">
          Tabela diária
        </h2>
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-5 py-2 text-left">Data</th>
              <th className="px-5 py-2 text-right">Faturamento</th>
              <th className="px-5 py-2 text-right">Trocas</th>
              <th className="px-5 py-2 text-right">Produção total</th>
              <th className="px-5 py-2 text-right">%</th>
              <th className="px-5 py-2 text-left">Situação</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const share = dayShare(d.billingCents, d.trocasCents);
              const status = statusFor(share, thresholds);
              return (
                <tr
                  key={d.date}
                  className={`border-t border-border-subtle/40 ${d.trocasCents == null ? "text-muted-foreground" : ""}`}
                >
                  <td className="px-5 py-2 tabular">{formatDateBR(d.date)}</td>
                  <td className="px-5 py-2 text-right tabular">{centsToBRL(d.billingCents)}</td>
                  <td className="px-5 py-2 text-right tabular">
                    {d.trocasCents == null ? "sem informação" : centsToBRL(d.trocasCents)}
                  </td>
                  <td className="px-5 py-2 text-right tabular">
                    {d.trocasCents == null ? "—" : centsToBRL(d.billingCents + d.trocasCents)}
                  </td>
                  <td className={`px-5 py-2 text-right tabular ${STATUS_STYLE[status].text}`}>
                    {formatShare(share)}
                  </td>
                  <td className="px-5 py-2" title={STATUS_LABEL[status]}>
                    <StatusPill status={status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1 rounded-2xl border border-border-subtle bg-surface p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}
