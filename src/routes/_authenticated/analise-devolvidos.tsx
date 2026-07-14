import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Suspense, useMemo, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, Cell,
} from "recharts";
import {
  AlertTriangle, Download, TrendingUp, Clock, Building2,
  Users, RefreshCw, ChevronUp, ChevronDown, Search,
} from "lucide-react";
import { getReturnedChecksAnalysis, type ReturnedChecksAnalysisData } from "@/lib/returned-checks-analysis.functions";
import { centsToBRL, centsToCompact, formatDateBR, formatPct } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/analise-devolvidos")({
  head: () => ({ meta: [{ title: "Análise de Devolvidos — Ley Colchões" }] }),
  component: AnalisePage,
});

// ─── Excel Export ─────────────────────────────────────────────────────────────

async function exportToExcel(data: ReturnedChecksAnalysisData) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  wb.Props = {
    Title: "Análise de Cheques Devolvidos — Ley Colchões",
    Author: "Painel Ley Colchões",
    CreatedDate: new Date(),
  };

  const cBRL = (c: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(c / 100);
  const pct = (v: number) => `${v.toFixed(2).replace(".", ",")}%`;
  const fmtDate = (d: string | null | undefined) => {
    if (!d) return "—";
    const [y, m, dd] = (d as string).split("-");
    return `${dd}/${m}/${y}`;
  };

  // ── Aba 1: Resumo Executivo ──────────────────────────────────────────────
  const resumo = [
    ["ANÁLISE DE CHEQUES DEVOLVIDOS", "", "", "Ley Colchões"],
    ["Gerado em", new Date().toLocaleString("pt-BR", { timeZone: "America/Fortaleza" })],
    [],
    ["INDICADORES GERAIS"],
    ["Total Recuperado de Devolvidos", cBRL(data.totalRecoveredCents)],
    ["Total Faturado (base de cálculo)", cBRL(data.totalBilledCents)],
    ["Taxa de Impacto (devolvido / faturado)", pct(data.returnRatePct)],
    ["Prazo Médio de Recuperação", data.avgDaysToRecover != null ? `${data.avgDaysToRecover} dias` : "—"],
    ["Prazo Mediano de Recuperação", data.medianDaysToRecover != null ? `${data.medianDaysToRecover} dias` : "—"],
    ["Total de Registros", data.recordCount],
    ["Fábricas com Devoluções", data.factoryCount],
    ["Clientes Únicos", data.uniqueCustomers],
    [],
    ["RANKING POR FÁBRICA"],
    ["Cód.", "Fábrica", "Estado", "Faturado", "Recuperado", "Taxa (%)", "Ocorrências", "Prazo Médio (dias)"],
    ...data.byFactory.map((f) => [
      f.factoryCode,
      f.factoryName,
      f.factoryState,
      cBRL(f.billedCents),
      cBRL(f.recoveredCents),
      pct(f.returnRatePct),
      f.count,
      f.avgDaysToRecover ?? "—",
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), "Resumo Executivo");

  // ── Aba 2: Evolução Mensal ────────────────────────────────────────────────
  const mensal = [
    ["EVOLUÇÃO MENSAL"],
    ["Mês", "Faturamento", "Devolvidos Recuperados", "Taxa (%)"],
    ...data.byMonth.map((m) => [
      m.label,
      cBRL(m.billedCents),
      cBRL(m.recoveredCents),
      m.billedCents > 0 ? pct((m.recoveredCents / m.billedCents) * 100) : "—",
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mensal), "Mensal");

  // ── Aba 3: Por Fábrica Detalhado ─────────────────────────────────────────
  const porFabrica = [
    ["ANÁLISE POR FÁBRICA — DETALHADO"],
    ["Cód.", "Fábrica", "Estado", "Faturado", "Recuperado", "Taxa (%)", "Ocorrências", "Prazo Médio", "Prazo Mínimo", "Prazo Máximo"],
    ...data.byFactory.map((f) => [
      f.factoryCode,
      f.factoryName,
      f.factoryState,
      cBRL(f.billedCents),
      cBRL(f.recoveredCents),
      pct(f.returnRatePct),
      f.count,
      f.avgDaysToRecover ?? "—",
      f.minDays ?? "—",
      f.maxDays ?? "—",
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(porFabrica), "Por Fábrica");

  // ── Aba 4: Por Cliente ────────────────────────────────────────────────────
  if (data.byCustomer.some((c) => c.customerName !== "—")) {
    const porCliente = [
      ["ANÁLISE POR CLIENTE"],
      ["Cliente", "Recuperado", "Ocorrências", "Fábricas"],
      ...data.byCustomer.map((c) => [
        c.customerName,
        cBRL(c.recoveredCents),
        c.count,
        c.factories.join("; "),
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(porCliente), "Por Cliente");
  }

  // ── Aba 5: Registros Completos ────────────────────────────────────────────
  const registros = [
    ["TODOS OS REGISTROS DE RECUPERAÇÃO"],
    [
      "Cód. Fábrica", "Fábrica", "Estado",
      "Data Recuperação", "Data Devolução", "Dias p/ Recuperar",
      "Valor Recuperado", "Valor Original do Cheque",
      "Cliente", "Referência", "Observação",
    ],
    ...data.records.map((r) => [
      r.factoryCode,
      r.factoryName,
      r.factoryState,
      fmtDate(r.recoveredDate),
      fmtDate(r.returnedDate),
      r.daysToRecover ?? "—",
      cBRL(r.amountCents),
      "—",
      r.customerName ?? "—",
      r.checkReference ?? "—",
      r.note ?? "—",
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(registros), "Registros Completos");

  // Ajustar larguras das colunas automaticamente
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const ref = ws["!ref"];
    if (!ref) continue;
    const range = XLSX.utils.decode_range(ref);
    const colWidths: number[] = [];
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
        const len = cell?.v != null ? String(cell.v).length : 0;
        colWidths[C] = Math.min(Math.max(colWidths[C] ?? 8, len + 2), 50);
      }
    }
    ws["!cols"] = colWidths.map((w) => ({ wch: w }));
  }

  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `devolvidos-analise-${today}.xlsx`);
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, tone = "default", icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "success" | "warning" | "destructive" | "muted";
  icon: React.ReactNode;
}) {
  const textColor =
    tone === "success" ? "text-success" :
    tone === "warning" ? "text-warning" :
    tone === "destructive" ? "text-destructive" :
    tone === "muted" ? "text-muted-foreground" :
    "text-foreground";

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className={`mt-2 text-2xl font-bold tabular-nums ${textColor}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

// ─── Chart Tooltip ────────────────────────────────────────────────────────────

const ChartTooltip = ({ active, payload, label }: Record<string, unknown>) => {
  if (!(active as boolean) || !(payload as unknown[])?.length) return null;
  return (
    <div className="rounded-xl border border-border-subtle bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1.5 font-semibold text-foreground">{label as string}</p>
      {(payload as { name: string; value: number; color: string }[]).map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <span className="font-medium">{centsToBRL(p.value)}</span>
        </p>
      ))}
    </div>
  );
};

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border-subtle bg-surface">
      <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

// ─── Main Analysis View ───────────────────────────────────────────────────────

function AnaliseView({ data }: { data: ReturnedChecksAnalysisData }) {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<"recoveredCents" | "billedCents" | "returnRatePct" | "count" | "avgDaysToRecover">("recoveredCents");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [exportLoading, setExportLoading] = useState(false);

  // Chart data — last 18 months
  const chartMonths = useMemo(() => data.byMonth.slice(-18), [data.byMonth]);

  // Factory table with sort
  const sortedFactories = useMemo(() => {
    const arr = [...data.byFactory].filter((f) => f.count > 0 || f.billedCents > 0);
    const q = search.trim().toLowerCase();
    const filtered = q ? arr.filter((f) => f.factoryName.toLowerCase().includes(q) || f.factoryCode.toLowerCase().includes(q)) : arr;
    return filtered.sort((a, b) => {
      const va = a[sortField] ?? 0;
      const vb = b[sortField] ?? 0;
      return sortDir === "desc" ? (vb as number) - (va as number) : (va as number) - (vb as number);
    });
  }, [data.byFactory, search, sortField, sortDir]);

  function toggleSort(field: typeof sortField) {
    if (sortField === field) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortField(field); setSortDir("desc"); }
  }

  const SortIcon = ({ field }: { field: typeof sortField }) =>
    sortField === field
      ? sortDir === "desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />
      : <ChevronDown className="h-3 w-3 opacity-30" />;

  async function handleExport() {
    setExportLoading(true);
    try { await exportToExcel(data); } finally { setExportLoading(false); }
  }

  // Insights
  const insights: { icon: string; text: string; tone: "success" | "warning" | "destructive" | "default" }[] = [];
  if (data.returnRatePct > 5) {
    insights.push({ icon: "🚨", text: `Taxa de impacto elevada: ${formatPct(data.returnRatePct / 100)} do faturamento total.`, tone: "destructive" });
  } else if (data.returnRatePct > 2) {
    insights.push({ icon: "⚠️", text: `Taxa de impacto moderada: ${formatPct(data.returnRatePct / 100)} do faturamento.`, tone: "warning" });
  } else if (data.totalBilledCents > 0) {
    insights.push({ icon: "✅", text: `Taxa de impacto controlada: ${formatPct(data.returnRatePct / 100)} do faturamento.`, tone: "success" });
  }
  const top = data.byFactory.find((f) => f.count > 0);
  if (top) insights.push({ icon: "🏭", text: `${top.factoryName} · ${top.factoryState} tem o maior volume recuperado: ${centsToBRL(top.recoveredCents)}.`, tone: "default" });
  if (data.avgDaysToRecover != null) {
    if (data.avgDaysToRecover > 90) insights.push({ icon: "⏰", text: `Prazo médio de recuperação longo: ${data.avgDaysToRecover} dias. Considere ação mais ágil.`, tone: "warning" });
    else if (data.avgDaysToRecover > 30) insights.push({ icon: "🕐", text: `Prazo médio de recuperação: ${data.avgDaysToRecover} dias.`, tone: "default" });
    else insights.push({ icon: "⚡", text: `Recuperação rápida: prazo médio de ${data.avgDaysToRecover} dias.`, tone: "success" });
  }
  const topCust = data.byCustomer.find((c) => c.customerName !== "—");
  if (topCust) insights.push({ icon: "👤", text: `Cliente com maior volume: ${topCust.customerName} — ${centsToBRL(topCust.recoveredCents)} (${topCust.count} ocorrências).`, tone: "default" });

  const toneClass = {
    success: "border-success/30 bg-success/10 text-success",
    warning: "border-warning/30 bg-warning/10 text-warning",
    destructive: "border-destructive/30 bg-destructive/10 text-destructive",
    default: "border-border-subtle bg-muted/20 text-muted-foreground",
  };

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Análise de Cheques Devolvidos</h1>
          <p className="text-xs text-muted-foreground">
            Impacto no faturamento, evolução mensal, ranking por fábrica e cliente.
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exportLoading || data.recordCount === 0}
          className="btn-primary inline-flex items-center gap-2 disabled:opacity-60"
        >
          {exportLoading
            ? <RefreshCw className="h-4 w-4 animate-spin" />
            : <Download className="h-4 w-4" />}
          {exportLoading ? "Gerando..." : "Exportar Excel"}
        </button>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          label="Recuperado"
          value={centsToCompact(data.totalRecoveredCents)}
          sub={centsToBRL(data.totalRecoveredCents)}
          tone="destructive"
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <KpiCard
          label="Taxa de Impacto"
          value={formatPct(data.returnRatePct / 100)}
          sub="sobre o faturamento"
          tone={data.returnRatePct > 5 ? "destructive" : data.returnRatePct > 2 ? "warning" : "success"}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <KpiCard
          label="Prazo Médio"
          value={data.avgDaysToRecover != null ? `${data.avgDaysToRecover}d` : "—"}
          sub={data.medianDaysToRecover != null ? `mediana: ${data.medianDaysToRecover}d` : "de devolução a recuperação"}
          tone="warning"
          icon={<Clock className="h-4 w-4" />}
        />
        <KpiCard
          label="Ocorrências"
          value={String(data.recordCount)}
          sub={`${data.factoryCount} fábricas afetadas`}
          icon={<Building2 className="h-4 w-4" />}
        />
        <KpiCard
          label="Clientes"
          value={String(data.uniqueCustomers)}
          sub="com cheque devolvido"
          icon={<Users className="h-4 w-4" />}
        />
        <KpiCard
          label="Faturado Total"
          value={centsToCompact(data.totalBilledCents)}
          sub="base de comparação"
          tone="muted"
          icon={<TrendingUp className="h-4 w-4" />}
        />
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <section className="rounded-2xl border border-border-subtle bg-surface p-4">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Insights automáticos
          </h2>
          <ul className="space-y-2">
            {insights.map((ins, i) => (
              <li
                key={i}
                className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm ${toneClass[ins.tone]}`}
              >
                <span className="shrink-0 text-base leading-5">{ins.icon}</span>
                <span>{ins.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Evolução mensal */}
        <Section title="Evolução mensal (faturado vs. devolvido)">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartMonths} margin={{ left: 0, right: 4, top: 4 }}>
              <CartesianGrid stroke="hsl(var(--border-subtle))" vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => centsToCompact(v)} width={60} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="billedCents" name="Faturado" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} opacity={0.7} />
              <Bar dataKey="recoveredCents" name="Devolvido recuperado" fill="hsl(var(--destructive))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Section>

        {/* Taxa mensal */}
        <Section title="Taxa de impacto mensal (%)">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart
              data={chartMonths.map((m) => ({
                ...m,
                rate: m.billedCents > 0 ? parseFloat(((m.recoveredCents / m.billedCents) * 100).toFixed(2)) : 0,
              }))}
              margin={{ left: 0, right: 4, top: 4 }}
            >
              <CartesianGrid stroke="hsl(var(--border-subtle))" vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `${v}%`} width={42} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--surface))", border: "1px solid hsl(var(--border-subtle))", borderRadius: 12, fontSize: 12 }}
                formatter={(v: number) => [`${v.toFixed(2).replace(".", ",")}%`, "Taxa"]}
                labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
              />
              <Line
                type="monotone"
                dataKey="rate"
                name="Taxa (%)"
                stroke="hsl(var(--destructive))"
                strokeWidth={2}
                dot={{ r: 3, fill: "hsl(var(--destructive))" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Section>
      </div>

      {/* Factory bar chart */}
      {data.byFactory.filter((f) => f.recoveredCents > 0).length > 0 && (
        <Section title="Volume recuperado por fábrica">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={data.byFactory.filter((f) => f.recoveredCents > 0).slice(0, 12)}
              layout="vertical"
              margin={{ left: 4, right: 60, top: 4 }}
            >
              <CartesianGrid stroke="hsl(var(--border-subtle))" horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => centsToCompact(v)} />
              <YAxis
                type="category"
                dataKey="factoryName"
                tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
                width={120}
                tickFormatter={(v: string) => v.length > 16 ? v.slice(0, 15) + "…" : v}
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="recoveredCents" name="Recuperado" radius={[0, 4, 4, 0]}>
                {data.byFactory.filter((f) => f.recoveredCents > 0).slice(0, 12).map((_, i) => (
                  <Cell key={i} fill={`hsl(${0 + i * 22}, 70%, 50%)`} opacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Section>
      )}

      {/* Factory table */}
      <Section
        title="Ranking por fábrica"
        action={
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar fábrica..."
              className="h-7 rounded-md border border-border-subtle bg-background pl-7 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2 text-left pl-1">Fábrica</th>
                <th className="py-2 cursor-pointer hover:text-foreground" onClick={() => toggleSort("billedCents")}>
                  <span className="inline-flex items-center gap-1">Faturado <SortIcon field="billedCents" /></span>
                </th>
                <th className="py-2 cursor-pointer hover:text-foreground" onClick={() => toggleSort("recoveredCents")}>
                  <span className="inline-flex items-center gap-1">Recuperado <SortIcon field="recoveredCents" /></span>
                </th>
                <th className="py-2 cursor-pointer hover:text-foreground" onClick={() => toggleSort("returnRatePct")}>
                  <span className="inline-flex items-center gap-1">Taxa <SortIcon field="returnRatePct" /></span>
                </th>
                <th className="py-2 cursor-pointer hover:text-foreground" onClick={() => toggleSort("count")}>
                  <span className="inline-flex items-center gap-1">Ocorr. <SortIcon field="count" /></span>
                </th>
                <th className="py-2 cursor-pointer hover:text-foreground" onClick={() => toggleSort("avgDaysToRecover")}>
                  <span className="inline-flex items-center gap-1">Prazo médio <SortIcon field="avgDaysToRecover" /></span>
                </th>
                <th className="py-2">Barra</th>
              </tr>
            </thead>
            <tbody>
              {sortedFactories.map((f) => {
                const maxRec = Math.max(...data.byFactory.map((x) => x.recoveredCents), 1);
                const barW = Math.round((f.recoveredCents / maxRec) * 100);
                const rateColor =
                  f.returnRatePct > 5 ? "text-destructive" :
                  f.returnRatePct > 2 ? "text-warning" :
                  f.count > 0 ? "text-success" : "text-muted-foreground";
                return (
                  <tr key={f.factoryId} className="border-b border-border-subtle/40 last:border-0 hover:bg-muted/10">
                    <td className="py-2.5 pl-1">
                      <div className="font-medium text-foreground">{f.factoryName}</div>
                      <div className="text-[10px] text-muted-foreground">{f.factoryCode} · {f.factoryState}</div>
                    </td>
                    <td className="py-2.5 pr-2 text-right tabular-nums text-muted-foreground">{centsToBRL(f.billedCents)}</td>
                    <td className="py-2.5 pr-2 text-right tabular-nums font-semibold text-destructive">{f.recoveredCents > 0 ? centsToBRL(f.recoveredCents) : "—"}</td>
                    <td className={`py-2.5 pr-2 text-right tabular-nums font-bold ${rateColor}`}>{f.count > 0 ? formatPct(f.returnRatePct / 100) : "—"}</td>
                    <td className="py-2.5 pr-2 text-right tabular-nums text-muted-foreground">{f.count > 0 ? f.count : "—"}</td>
                    <td className="py-2.5 pr-2 text-right tabular-nums text-muted-foreground">
                      {f.avgDaysToRecover != null ? `${f.avgDaysToRecover}d` : "—"}
                    </td>
                    <td className="py-2.5 pr-1">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-muted/40">
                        <div
                          className="h-full rounded-full bg-destructive/70"
                          style={{ width: `${barW}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {sortedFactories.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-xs text-muted-foreground">Nenhuma fábrica encontrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Top customers */}
      {data.byCustomer.filter((c) => c.customerName !== "—").length > 0 && (
        <Section title="Top clientes com devoluções">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 text-left pl-1">Cliente</th>
                  <th className="py-2 text-right">Recuperado</th>
                  <th className="py-2 text-right">Ocorrências</th>
                  <th className="py-2 text-left pl-4">Fábricas</th>
                </tr>
              </thead>
              <tbody>
                {data.byCustomer.filter((c) => c.customerName !== "—").slice(0, 20).map((c, i) => (
                  <tr key={i} className="border-b border-border-subtle/40 last:border-0 hover:bg-muted/10">
                    <td className="py-2.5 pl-1 font-medium text-foreground">{c.customerName}</td>
                    <td className="py-2.5 pr-2 text-right tabular-nums font-semibold text-destructive">{centsToBRL(c.recoveredCents)}</td>
                    <td className="py-2.5 pr-2 text-right tabular-nums text-muted-foreground">{c.count}</td>
                    <td className="py-2.5 pl-4 text-xs text-muted-foreground">{c.factories.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Recent records */}
      <Section title={`Últimos registros (${data.records.length} total)`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2 text-left pl-1">Fábrica</th>
                <th className="py-2 text-left">Recuperação</th>
                <th className="py-2 text-left">Devolução</th>
                <th className="py-2 text-right">Prazo</th>
                <th className="py-2 text-right">Valor</th>
                <th className="py-2 text-left pl-4">Cliente</th>
                <th className="py-2 text-left">Referência</th>
              </tr>
            </thead>
            <tbody>
              {data.records.slice(0, 50).map((r) => (
                <tr key={r.id} className="border-b border-border-subtle/40 last:border-0 hover:bg-muted/10">
                  <td className="py-2.5 pl-1">
                    <span className="font-medium text-foreground">{r.factoryCode}</span>
                    <span className="text-muted-foreground"> · {r.factoryState}</span>
                  </td>
                  <td className="py-2.5 tabular-nums text-muted-foreground">{formatDateBR(r.recoveredDate)}</td>
                  <td className="py-2.5 tabular-nums text-muted-foreground">{formatDateBR(r.returnedDate)}</td>
                  <td className="py-2.5 text-right tabular-nums">
                    {r.daysToRecover != null ? (
                      <span className={r.daysToRecover > 90 ? "text-destructive" : r.daysToRecover > 30 ? "text-warning" : "text-success"}>
                        {r.daysToRecover}d
                      </span>
                    ) : "—"}
                  </td>
                  <td className="py-2.5 pr-2 text-right tabular-nums font-semibold text-destructive">{centsToBRL(r.amountCents)}</td>
                  <td className="py-2.5 pl-4 text-muted-foreground">{r.customerName ?? "—"}</td>
                  <td className="py-2.5 text-muted-foreground">{r.checkReference ?? "—"}</td>
                </tr>
              ))}
              {data.records.length > 50 && (
                <tr>
                  <td colSpan={7} className="py-3 text-center text-xs text-muted-foreground">
                    + {data.records.length - 50} registros adicionais — exporte o Excel para ver todos.
                  </td>
                </tr>
              )}
              {data.records.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-muted-foreground">
                    Nenhum registro de cheque devolvido.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function AnaliseSkeleton() {
  return (
    <div className="space-y-4 px-4 py-6 sm:px-6 lg:px-8">
      <div className="h-8 w-64 animate-pulse rounded-lg bg-surface" />
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-72 animate-pulse rounded-2xl bg-surface" />
        <div className="h-72 animate-pulse rounded-2xl bg-surface" />
      </div>
      <div className="h-80 animate-pulse rounded-2xl bg-surface" />
    </div>
  );
}

function AnaliseContent() {
  const fetchAnalysis = useServerFn(getReturnedChecksAnalysis);
  const { data } = useSuspenseQuery({
    queryKey: ["returned-checks-analysis"],
    queryFn: () => fetchAnalysis(),
    staleTime: 60_000,
  });
  return <AnaliseView data={data} />;
}

function AnalisePage() {
  return (
    <Suspense fallback={<AnaliseSkeleton />}>
      <AnaliseContent />
    </Suspense>
  );
}
