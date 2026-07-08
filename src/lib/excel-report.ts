import type ExcelJSType from "exceljs";
import type { ReportData } from "@/lib/reports.functions";
import { formatDateBR } from "@/lib/format";

const BRL = '"R$" #,##0.00';
const PCT = "0.0%";
const HEADER_FILL = "FF0F172A"; // navy
const TOTAL_FILL = "FFE2E8F0";

type Col = {
  header: string;
  key: string;
  width?: number;
  numFmt?: string;
  total?: boolean;
};

const reais = (cents: number | null | undefined) => Number(cents ?? 0) / 100;

function inRange(date: string | null, from: string, to: string): boolean {
  if (!date) return false;
  const d = date.slice(0, 10);
  return d >= from && d <= to;
}

function styleHeader(ws: ExcelJSType.Worksheet) {
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  row.alignment = { vertical: "middle" };
  row.height = 20;
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

function addTable(
  wb: ExcelJSType.Workbook,
  name: string,
  columns: Col[],
  rows: Record<string, unknown>[],
) {
  const ws = wb.addWorksheet(name);
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 16 }));
  for (const r of rows) ws.addRow(r);
  for (const c of columns) if (c.numFmt) ws.getColumn(c.key).numFmt = c.numFmt;
  styleHeader(ws);

  const totalCols = columns.filter((c) => c.total);
  if (totalCols.length && rows.length) {
    const totalRow: Record<string, unknown> = {};
    const first = columns[0].key;
    totalRow[first] = "TOTAL";
    for (const c of totalCols) {
      totalRow[c.key] = rows.reduce((s, r) => s + Number(r[c.key] ?? 0), 0);
    }
    const added = ws.addRow(totalRow);
    added.font = { bold: true };
    added.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_FILL } };
  }
  return ws;
}

export async function buildReportWorkbook(
  data: ReportData,
  dateFrom: string,
  dateTo: string,
  exporterName: string,
): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Painel Ley Colchões";
  wb.created = new Date();

  const factoryLabel = (id: string) => {
    const f = data.factories.find((x) => x.id === id);
    return f ? `${f.name} · ${f.state}` : "—";
  };
  const userName = (id: string | null) => data.users.find((u) => u.id === id)?.name ?? "—";

  const salesIn = data.sales.filter((s) => inRange(s.reference_date, dateFrom, dateTo));
  const billingIn = data.billing.filter((b) => inRange(b.reference_date, dateFrom, dateTo));
  const adjIn = data.adjustments.filter((a) =>
    inRange(a.reference_date ?? a.created_at, dateFrom, dateTo),
  );

  // Carteira atual por fábrica (acumulado, todos os registros)
  const carteiraByFactory = new Map<string, number>();
  for (const f of data.factories) {
    const s = data.sales
      .filter((x) => x.factory_id === f.id)
      .reduce((a, x) => a + x.amount_cents, 0);
    const b = data.billing
      .filter((x) => x.factory_id === f.id)
      .reduce((a, x) => a + x.amount_cents, 0);
    const adj = data.adjustments
      .filter((x) => x.factory_id === f.id)
      .reduce((a, x) => a + x.amount_cents, 0);
    carteiraByFactory.set(f.id, s - b + adj);
  }

  // Metas do período (soma dos meses que tocam o intervalo)
  const monthsInRange = new Set<string>();
  {
    const [fy, fm] = dateFrom.split("-").map(Number);
    const [ty, tm] = dateTo.split("-").map(Number);
    let y = fy;
    let m = fm;
    while (y < ty || (y === ty && m <= tm)) {
      monthsInRange.add(`${y}-${m}`);
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
  }
  const goalFor = (factoryId: string) => {
    let b = 0;
    let s = 0;
    for (const g of data.goals) {
      if (g.factory_id === factoryId && monthsInRange.has(`${g.year}-${g.month}`)) {
        b += Number(g.billing_goal_cents);
        s += Number(g.sales_goal_cents);
      }
    }
    return { b, s };
  };

  // ---------- Capa ----------
  const cover = wb.addWorksheet("Capa");
  cover.columns = [{ width: 24 }, { width: 40 }];
  cover.addRow(["Relatório Ley Colchões"]).font = { bold: true, size: 16 };
  cover.addRow([]);
  cover.addRow(["Período", `${formatDateBR(dateFrom)} a ${formatDateBR(dateTo)}`]);
  cover.addRow(["Gerado em", formatDateBR(new Date().toISOString().slice(0, 10))]);
  cover.addRow(["Exportado por", exporterName]);
  cover.getColumn(1).font = { bold: true };

  // ---------- Resumo ----------
  const resumoRows = data.factories.map((f) => {
    const vendas = salesIn
      .filter((s) => s.factory_id === f.id)
      .reduce((a, s) => a + s.amount_cents, 0);
    const fat = billingIn
      .filter((b) => b.factory_id === f.id)
      .reduce((a, b) => a + b.amount_cents, 0);
    const goal = goalFor(f.id);
    return {
      fabrica: `${f.name} · ${f.state}`,
      vendas: reais(vendas),
      metaVendas: reais(goal.s),
      pctVendas: goal.s > 0 ? vendas / goal.s : 0,
      faturamento: reais(fat),
      metaFat: reais(goal.b),
      pctFat: goal.b > 0 ? fat / goal.b : 0,
      carteira: reais(carteiraByFactory.get(f.id) ?? 0),
    };
  });
  addTable(
    wb,
    "Resumo",
    [
      { header: "Fábrica", key: "fabrica", width: 22 },
      { header: "Vendas", key: "vendas", width: 16, numFmt: BRL, total: true },
      { header: "Meta vendas", key: "metaVendas", width: 16, numFmt: BRL, total: true },
      { header: "% meta vendas", key: "pctVendas", width: 14, numFmt: PCT },
      { header: "Faturamento", key: "faturamento", width: 16, numFmt: BRL, total: true },
      { header: "Meta faturamento", key: "metaFat", width: 16, numFmt: BRL, total: true },
      { header: "% meta fat.", key: "pctFat", width: 14, numFmt: PCT },
      { header: "Carteira atual", key: "carteira", width: 16, numFmt: BRL, total: true },
    ],
    resumoRows,
  );

  // ---------- Vendas ----------
  addTable(
    wb,
    "Vendas",
    [
      { header: "Data", key: "data", width: 12 },
      { header: "Fábrica", key: "fabrica", width: 20 },
      { header: "Canal", key: "canal", width: 16 },
      { header: "Valor", key: "valor", width: 16, numFmt: BRL, total: true },
      { header: "Observação", key: "obs", width: 30 },
      { header: "Autor", key: "autor", width: 22 },
    ],
    salesIn
      .sort((a, b) => a.reference_date.localeCompare(b.reference_date))
      .map((s) => ({
        data: formatDateBR(s.reference_date),
        fabrica: factoryLabel(s.factory_id),
        canal: s.channel === "distribuidora" ? "Distribuidora" : "Representantes",
        valor: reais(s.amount_cents),
        obs: s.note ?? "",
        autor: userName(s.created_by),
      })),
  );

  // ---------- Faturamento ----------
  addTable(
    wb,
    "Faturamento",
    [
      { header: "Data", key: "data", width: 12 },
      { header: "Fábrica", key: "fabrica", width: 20 },
      { header: "Valor", key: "valor", width: 16, numFmt: BRL, total: true },
      { header: "Observação", key: "obs", width: 30 },
      { header: "Autor", key: "autor", width: 22 },
    ],
    billingIn
      .sort((a, b) => a.reference_date.localeCompare(b.reference_date))
      .map((b) => ({
        data: formatDateBR(b.reference_date),
        fabrica: factoryLabel(b.factory_id),
        valor: reais(b.amount_cents),
        obs: b.note ?? "",
        autor: userName(b.created_by),
      })),
  );

  // ---------- Carteira / Ajustes ----------
  const reasonLabel: Record<string, string> = {
    cancelamento: "Cancelamento",
    repasse: "Repasse",
    devolucao: "Devolução",
    correcao: "Correção",
    conciliacao: "Conciliação (ERP)",
  };
  addTable(
    wb,
    "Carteira (ajustes)",
    [
      { header: "Data ref.", key: "data", width: 12 },
      { header: "Fábrica", key: "fabrica", width: 20 },
      { header: "Tipo", key: "tipo", width: 16 },
      { header: "Impacto", key: "impacto", width: 16, numFmt: BRL, total: true },
      { header: "Original", key: "original", width: 16, numFmt: BRL },
      { header: "Realizado", key: "realizado", width: 16, numFmt: BRL },
      { header: "Destino", key: "destino", width: 18 },
      { header: "Motivo", key: "motivo", width: 30 },
      { header: "Autor", key: "autor", width: 22 },
    ],
    adjIn.map((a) => ({
      data: formatDateBR(a.reference_date ?? a.created_at),
      fabrica: factoryLabel(a.factory_id),
      tipo: reasonLabel[a.reason] ?? a.reason,
      impacto: reais(a.amount_cents),
      original: a.original_cents != null ? reais(a.original_cents) : "",
      realizado: a.realized_cents != null ? reais(a.realized_cents) : "",
      destino: a.destination ?? "",
      motivo: a.note,
      autor: userName(a.created_by),
    })),
  );

  // ---------- Repasses ----------
  const repasses = adjIn.filter((a) => a.reason === "repasse");
  if (repasses.length) {
    addTable(
      wb,
      "Repasses",
      [
        { header: "Data ref.", key: "data", width: 12 },
        { header: "Fábrica", key: "fabrica", width: 20 },
        { header: "Destino", key: "destino", width: 18 },
        { header: "Original", key: "original", width: 16, numFmt: BRL, total: true },
        { header: "Realizado", key: "realizado", width: 16, numFmt: BRL, total: true },
        { header: "Desconto", key: "desconto", width: 16, numFmt: BRL, total: true },
        { header: "% desconto", key: "pct", width: 12, numFmt: PCT },
        { header: "Autor", key: "autor", width: 22 },
      ],
      repasses.map((a) => {
        const orig = Number(a.original_cents ?? 0);
        const real = Number(a.realized_cents ?? 0);
        return {
          data: formatDateBR(a.reference_date ?? a.created_at),
          fabrica: factoryLabel(a.factory_id),
          destino: a.destination ?? "",
          original: reais(orig),
          realizado: reais(real),
          desconto: reais(orig - real),
          pct: orig > 0 ? (orig - real) / orig : 0,
          autor: userName(a.created_by),
        };
      }),
    );
  }

  // ---------- Metas ----------
  addTable(
    wb,
    "Metas",
    [
      { header: "Fábrica", key: "fabrica", width: 20 },
      { header: "Ano", key: "ano", width: 8 },
      { header: "Mês", key: "mes", width: 8 },
      { header: "Meta faturamento", key: "metaFat", width: 18, numFmt: BRL },
      { header: "Meta vendas", key: "metaVendas", width: 18, numFmt: BRL },
    ],
    data.goals
      .slice()
      .sort((a, b) => b.year - a.year || b.month - a.month)
      .map((g) => ({
        fabrica: factoryLabel(g.factory_id),
        ano: g.year,
        mes: g.month,
        metaFat: reais(g.billing_goal_cents),
        metaVendas: reais(g.sales_goal_cents),
      })),
  );

  // ---------- Diário (matriz dia a dia) ----------
  const days: string[] = [];
  {
    let d = dateFrom;
    while (d <= dateTo) {
      days.push(d);
      const dt = new Date(`${d}T12:00:00`);
      dt.setDate(dt.getDate() + 1);
      d = dt.toISOString().slice(0, 10);
    }
  }
  const diarioCols: Col[] = [{ header: "Data", key: "data", width: 12 }];
  for (const f of data.factories) {
    diarioCols.push({
      header: `${f.name} — Vendas`,
      key: `v_${f.id}`,
      width: 16,
      numFmt: BRL,
      total: true,
    });
    diarioCols.push({
      header: `${f.name} — Fat.`,
      key: `f_${f.id}`,
      width: 16,
      numFmt: BRL,
      total: true,
    });
  }
  diarioCols.push({ header: "Total Vendas", key: "tv", width: 16, numFmt: BRL, total: true });
  diarioCols.push({ header: "Total Fat.", key: "tf", width: 16, numFmt: BRL, total: true });

  const diarioRows = days.map((day) => {
    const row: Record<string, unknown> = { data: formatDateBR(day) };
    let tv = 0;
    let tf = 0;
    for (const f of data.factories) {
      const v = salesIn
        .filter((s) => s.factory_id === f.id && s.reference_date === day)
        .reduce((a, s) => a + s.amount_cents, 0);
      const b = billingIn
        .filter((x) => x.factory_id === f.id && x.reference_date === day)
        .reduce((a, x) => a + x.amount_cents, 0);
      row[`v_${f.id}`] = reais(v);
      row[`f_${f.id}`] = reais(b);
      tv += v;
      tf += b;
    }
    row.tv = reais(tv);
    row.tf = reais(tf);
    return row;
  });
  addTable(wb, "Diário", diarioCols, diarioRows);

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
