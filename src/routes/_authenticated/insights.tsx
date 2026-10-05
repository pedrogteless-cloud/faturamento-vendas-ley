import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getReportData, type ReportData } from "@/lib/reports.functions";
import { centsToBRL, centsToCompact, formatPct, todayISO } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/insights")({
  head: () => ({ meta: [{ title: "Insights — Ley Colchões" }] }),
  component: InsightsPage,
});

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const C_MATRIZ = "var(--color-primary)";
const C_FILIAL = "#0ea5e9";
const C_VENDAS = "#16a34a";
const C_TROCAS = "#f97316";

const ym = (d: string) => d.slice(0, 7);
const monthLabel = (k: string) => `${MESES[Number(k.slice(5, 7)) - 1]}/${k.slice(2, 4)}`;
const reais = (c: number) => Math.round(c) / 100;
const kfmt = (v: number) =>
  Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${Math.round(v / 1000)}k`;
const brlTip = (v: number) => centsToBRL(Math.round(v * 100));

function lastMonths(n: number): string[] {
  const t = todayISO();
  let y = Number(t.slice(0, 4));
  let m = Number(t.slice(5, 7));
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

function weekdaysBetween(from: string, to: string): number {
  let n = 0;
  const d = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  while (d <= end) {
    const w = d.getDay();
    if (w !== 0 && w !== 6) n++;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

function factoryKey(code: string) {
  return code === "eusebio" ? "matriz" : code === "timon" ? "filial" : code;
}

function InsightsPage() {
  const fetchData = useServerFn(getReportData);
  const months = useMemo(() => lastMonths(12), []);
  const today = todayISO();
  const q = useQuery({
    queryKey: ["insights-data", months[0]],
    queryFn: () => fetchData({ data: { dateFrom: `${months[0]}-01`, dateTo: today } }),
  });
  const [scope, setScope] = useState<"todas" | "matriz" | "filial">("todas");

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Insights</h1>
          <p className="text-xs text-muted-foreground">Últimos 12 meses · valores em R$</p>
        </div>
        <div className="flex rounded-lg border border-border-subtle bg-surface p-0.5 text-xs">
          {(["todas", "matriz", "filial"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`rounded-md px-3 py-1.5 capitalize ${scope === s ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {s === "todas" ? "Consolidado" : s}
            </button>
          ))}
        </div>
      </header>
      {q.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {q.data && <Insights data={q.data} months={months} scope={scope} today={today} />}
    </div>
  );
}

function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border-subtle bg-surface p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {hint && <p className="mb-3 text-xs text-muted-foreground">{hint}</p>}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad";
}) {
  const color =
    tone === "good" ? "text-green-600" : tone === "bad" ? "text-red-600" : "text-muted-foreground";
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {sub && <p className={`mt-0.5 text-xs ${color}`}>{sub}</p>}
    </div>
  );
}

const axis = { tick: { fontSize: 10 }, tickLine: false, axisLine: false } as const;

function Insights({
  data,
  months,
  scope,
  today,
}: {
  data: ReportData;
  months: string[];
  scope: "todas" | "matriz" | "filial";
  today: string;
}) {
  const m = useMemo(() => {
    const keyOf = new Map(data.factories.map((f) => [f.id, factoryKey(f.code)]));
    const inScope = (fid: string) => scope === "todas" || keyOf.get(fid) === scope;
    const curMonth = ym(today);
    const firstMonth = months[0];

    // Mensal por fábrica
    const monthly = months.map((k) => ({
      k,
      mes: monthLabel(k),
      matriz: 0,
      filial: 0,
      fat: 0,
      vendas: 0,
      meta: 0,
      representantes: 0,
      distribuidora: 0,
      trocas: 0,
      prodTrocas: 0,
      carteira: 0,
    }));
    const idx = new Map(months.map((k, i) => [k, i]));

    for (const b of data.billing) {
      if (!inScope(b.factory_id)) continue;
      const i = idx.get(ym(b.reference_date));
      if (i == null) continue;
      const row = monthly[i];
      row.fat += b.amount_cents;
      const fk = keyOf.get(b.factory_id);
      if (fk === "matriz") row.matriz += b.amount_cents;
      else if (fk === "filial") row.filial += b.amount_cents;
    }
    for (const s of data.sales) {
      if (!inScope(s.factory_id)) continue;
      const i = idx.get(ym(s.reference_date));
      if (i == null) continue;
      monthly[i].vendas += s.amount_cents;
      if (s.channel === "distribuidora") monthly[i].distribuidora += s.amount_cents;
      else monthly[i].representantes += s.amount_cents;
    }
    for (const g of data.goals) {
      if (!inScope(g.factory_id)) continue;
      const i = idx.get(`${g.year}-${String(g.month).padStart(2, "0")}`);
      if (i != null) monthly[i].meta += g.billing_goal_cents;
    }

    // Trocas: % = trocas ÷ (faturamento + trocas) só nos dias informados
    const billByDay = new Map<string, number>();
    for (const b of data.billing) {
      const key = `${b.factory_id}|${b.reference_date}`;
      billByDay.set(key, (billByDay.get(key) ?? 0) + b.amount_cents);
    }
    for (const t of data.trocas) {
      if (t.amount_cents == null || !inScope(t.factory_id)) continue;
      const i = idx.get(ym(t.reference_date));
      if (i == null) continue;
      monthly[i].trocas += t.amount_cents;
      monthly[i].prodTrocas +=
        t.amount_cents + (billByDay.get(`${t.factory_id}|${t.reference_date}`) ?? 0);
    }

    // Carteira no fim de cada mês (vendas − faturamento + ajustes, acumulado desde sempre)
    const deltas: { d: string; v: number }[] = [];
    for (const s of data.sales)
      if (inScope(s.factory_id)) deltas.push({ d: s.reference_date, v: s.amount_cents });
    for (const b of data.billing)
      if (inScope(b.factory_id)) deltas.push({ d: b.reference_date, v: -b.amount_cents });
    for (const a of data.adjustments)
      if (inScope(a.factory_id))
        deltas.push({ d: (a.reference_date ?? a.created_at).slice(0, 10), v: a.amount_cents });
    let before = 0;
    for (const x of deltas) if (ym(x.d) < firstMonth) before += x.v;
    let run = before;
    for (const row of monthly) {
      for (const x of deltas) if (ym(x.d) === row.k) run += x.v;
      row.carteira = run;
    }

    // Mês atual: acumulado diário × ritmo da meta
    const cur = monthly[monthly.length - 1];
    const lastDay = new Date(
      Number(curMonth.slice(0, 4)),
      Number(curMonth.slice(5, 7)),
      0,
    ).getDate();
    const monthEnd = `${curMonth}-${String(lastDay).padStart(2, "0")}`;
    const wdTotal = weekdaysBetween(`${curMonth}-01`, monthEnd);
    const wdElapsed = weekdaysBetween(`${curMonth}-01`, today);
    const dailyCur = new Map<string, number>();
    for (const b of data.billing)
      if (inScope(b.factory_id) && ym(b.reference_date) === curMonth)
        dailyCur.set(b.reference_date, (dailyCur.get(b.reference_date) ?? 0) + b.amount_cents);
    const pace: { dia: string; realizado?: number; meta: number }[] = [];
    let acc = 0;
    let wd = 0;
    for (let d = 1; d <= lastDay; d++) {
      const iso = `${curMonth}-${String(d).padStart(2, "0")}`;
      const w = new Date(`${iso}T12:00:00`).getDay();
      if (w !== 0 && w !== 6) wd++;
      acc += dailyCur.get(iso) ?? 0;
      pace.push({
        dia: String(d),
        realizado: iso <= today ? reais(acc) : undefined,
        meta: reais(wdTotal ? (cur.meta * wd) / wdTotal : 0),
      });
    }
    const projection = wdElapsed ? (cur.fat / wdElapsed) * wdTotal : 0;

    // Mesmo período do mês anterior
    const prevK = months[months.length - 2];
    const dayN = Number(today.slice(8, 10));
    let prevMtd = 0;
    for (const b of data.billing)
      if (
        inScope(b.factory_id) &&
        ym(b.reference_date) === prevK &&
        Number(b.reference_date.slice(8, 10)) <= dayN
      )
        prevMtd += b.amount_cents;

    // Média por dia da semana (dias com faturamento, últimos 12 meses)
    const perDay = new Map<string, number>();
    for (const b of data.billing)
      if (inScope(b.factory_id) && ym(b.reference_date) >= firstMonth)
        perDay.set(b.reference_date, (perDay.get(b.reference_date) ?? 0) + b.amount_cents);
    const wk = DIAS.map((d) => ({ dia: d, soma: 0, n: 0 }));
    for (const [d, v] of perDay) {
      const w = new Date(`${d}T12:00:00`).getDay();
      wk[w].soma += v;
      wk[w].n += 1;
    }
    const weekdayAvg = wk
      .filter((w) => w.n > 0)
      .map((w) => ({ dia: w.dia, media: reais(w.soma / w.n), dias: w.n }));

    // Book-to-bill dos últimos 3 meses
    const last3 = monthly.slice(-3);
    const v3 = last3.reduce((s, r) => s + r.vendas, 0);
    const f3 = last3.reduce((s, r) => s + r.fat, 0);

    return { monthly, pace, projection, cur, prevMtd, weekdayAvg, btb: f3 ? v3 / f3 : NaN };
  }, [data, months, scope, today]);

  const chart = m.monthly.map((r) => ({
    mes: r.mes,
    matriz: reais(r.matriz),
    filial: reais(r.filial),
    fat: reais(r.fat),
    vendas: reais(r.vendas),
    meta: r.meta ? reais(r.meta) : null,
    representantes: reais(r.representantes),
    distribuidora: reais(r.distribuidora),
    carteira: reais(r.carteira),
    trocasPct: r.prodTrocas ? Number(((100 * r.trocas) / r.prodTrocas).toFixed(1)) : null,
  }));
  const mtdDelta = m.prevMtd ? m.cur.fat / m.prevMtd - 1 : NaN;
  const projVsMeta = m.cur.meta ? m.projection / m.cur.meta : NaN;
  const thr = data.trocasThresholds;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Faturamento no mês"
          value={centsToCompact(m.cur.fat)}
          sub={
            Number.isFinite(mtdDelta)
              ? `${mtdDelta >= 0 ? "▲" : "▼"} ${formatPct(Math.abs(mtdDelta))} vs mesmo período do mês anterior`
              : undefined
          }
          tone={mtdDelta >= 0 ? "good" : "bad"}
        />
        <Tile
          label="Projeção do mês (ritmo atual)"
          value={centsToCompact(m.projection)}
          sub={
            Number.isFinite(projVsMeta) ? `${formatPct(projVsMeta)} da meta` : "sem meta cadastrada"
          }
          tone={projVsMeta >= 1 ? "good" : "bad"}
        />
        <Tile
          label="Carteira atual"
          value={centsToCompact(m.monthly[m.monthly.length - 1].carteira)}
          sub="vendas − faturamento + ajustes"
        />
        <Tile
          label="Vendas ÷ faturamento (3 meses)"
          value={Number.isFinite(m.btb) ? m.btb.toFixed(2).replace(".", ",") : "—"}
          sub={m.btb > 1 ? "carteira crescendo" : "carteira diminuindo"}
          tone={m.btb > 1 ? "good" : undefined}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="Mês atual: faturamento acumulado × ritmo da meta"
          hint="Linha tracejada = onde deveria estar para bater a meta (dias úteis)."
        >
          <LineChart data={m.pace} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeOpacity={0.15} />
            <XAxis dataKey="dia" {...axis} />
            <YAxis {...axis} width={48} tickFormatter={kfmt} />
            <Tooltip formatter={(v: number) => brlTip(v)} labelFormatter={(l) => `Dia ${l}`} />
            <Line
              dataKey="meta"
              name="Ritmo da meta"
              stroke="#9ca3af"
              strokeDasharray="4 4"
              dot={false}
            />
            <Line
              dataKey="realizado"
              name="Realizado"
              stroke={C_MATRIZ}
              strokeWidth={2.5}
              dot={false}
            />
          </LineChart>
        </Card>

        <Card title="Faturamento mensal × meta" hint="Barras por fábrica · marcador = meta do mês.">
          <ComposedChart data={chart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeOpacity={0.15} />
            <XAxis dataKey="mes" {...axis} />
            <YAxis {...axis} width={48} tickFormatter={kfmt} />
            <Tooltip formatter={(v: number) => brlTip(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {scope !== "filial" && (
              <Bar dataKey="matriz" name="Matriz" stackId="f" fill={C_MATRIZ} />
            )}
            {scope !== "matriz" && (
              <Bar
                dataKey="filial"
                name="Filial"
                stackId="f"
                fill={C_FILIAL}
                radius={[3, 3, 0, 0]}
              />
            )}
            <Line
              dataKey="meta"
              name="Meta"
              stroke="#111827"
              strokeWidth={0}
              dot={{ r: 4, fill: "#111827" }}
            />
          </ComposedChart>
        </Card>

        <Card
          title="Vendas × faturamento"
          hint="Quando vendas passam do faturamento, a carteira cresce."
        >
          <BarChart data={chart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeOpacity={0.15} />
            <XAxis dataKey="mes" {...axis} />
            <YAxis {...axis} width={48} tickFormatter={kfmt} />
            <Tooltip formatter={(v: number) => brlTip(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="vendas" name="Vendas" fill={C_VENDAS} radius={[3, 3, 0, 0]} />
            <Bar dataKey="fat" name="Faturamento" fill={C_MATRIZ} radius={[3, 3, 0, 0]} />
          </BarChart>
        </Card>

        <Card title="Evolução da carteira" hint="Saldo no fim de cada mês.">
          <LineChart data={chart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeOpacity={0.15} />
            <XAxis dataKey="mes" {...axis} />
            <YAxis {...axis} width={48} tickFormatter={kfmt} />
            <Tooltip formatter={(v: number) => brlTip(v)} />
            <Line
              dataKey="carteira"
              name="Carteira"
              stroke={C_VENDAS}
              strokeWidth={2.5}
              dot={{ r: 3 }}
            />
          </LineChart>
        </Card>

        <Card title="Vendas por canal" hint="Representantes × distribuidora por mês.">
          <BarChart data={chart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeOpacity={0.15} />
            <XAxis dataKey="mes" {...axis} />
            <YAxis {...axis} width={48} tickFormatter={kfmt} />
            <Tooltip formatter={(v: number) => brlTip(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="representantes" name="Representantes" stackId="c" fill={C_VENDAS} />
            <Bar
              dataKey="distribuidora"
              name="Distribuidora"
              stackId="c"
              fill="#a855f7"
              radius={[3, 3, 0, 0]}
            />
          </BarChart>
        </Card>

        <Card
          title="Faturamento médio por dia da semana"
          hint="Média dos dias com faturamento nos últimos 12 meses."
        >
          <BarChart data={m.weekdayAvg} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeOpacity={0.15} />
            <XAxis dataKey="dia" {...axis} />
            <YAxis {...axis} width={48} tickFormatter={kfmt} />
            <Tooltip formatter={(v: number) => brlTip(v)} />
            <Bar dataKey="media" name="Média do dia" fill={C_FILIAL} radius={[3, 3, 0, 0]} />
          </BarChart>
        </Card>

        <Card
          title="Trocas na produção (% por mês)"
          hint="Não é faturamento. Trocas ÷ (faturamento + trocas) nos dias informados."
        >
          <BarChart data={chart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeOpacity={0.15} />
            <XAxis dataKey="mes" {...axis} />
            <YAxis {...axis} width={36} tickFormatter={(v: number) => `${v}%`} />
            <Tooltip formatter={(v: number) => `${String(v).replace(".", ",")}%`} />
            <ReferenceLine y={thr.atencao} stroke="#d97706" strokeDasharray="4 4" />
            <ReferenceLine y={thr.critico} stroke="#dc2626" strokeDasharray="4 4" />
            <Bar dataKey="trocasPct" name="% trocas" fill={C_TROCAS} radius={[3, 3, 0, 0]} />
          </BarChart>
        </Card>
      </div>
    </div>
  );
}
