import type ExcelJSType from "exceljs";
import type { ReportData } from "@/lib/reports.functions";
import { formatDateBR } from "@/lib/format";

// Paleta azul (inspirada no modelo aprovado).
const INK = "FF0A1628"; // navy quase preto — títulos/texto
const HEADER = "FF1A4BAD"; // azul profundo — cabeçalho padrão
const BLUE = "FF2E6FD9"; // azul primário
const BLUE_LIGHT = "FF5B9BF0"; // azul claro
const TEAL = "FF0E7490"; // total / consolidado
const NAVY = "FF0D2B6E"; // meta
const ZEBRA1 = "FFC7DCFF";
const ZEBRA2 = "FFE8F0FF";
const BORDER = "FFBBD3F5";
const WHITE = "FFFFFFFF";

const BRL = '"R$" #,##0.00';
const PCT = "0.0%";

type Col = {
  header: string;
  key: string;
  width?: number;
  numFmt?: string;
  total?: boolean;
  fill?: string; // cor do cabeçalho
  align?: "left" | "center" | "right";
};

const reais = (cents: number | null | undefined) => Number(cents ?? 0) / 100;
const fill = (argb: string): ExcelJSType.Fill => ({
  type: "pattern",
  pattern: "solid",
  fgColor: { argb },
});
const thin = (argb: string) => ({ style: "thin" as const, color: { argb } });
const borderAll = () => ({
  top: thin(BORDER),
  left: thin(BORDER),
  bottom: thin(BORDER),
  right: thin(BORDER),
});

function inRange(date: string | null, from: string, to: string): boolean {
  if (!date) return false;
  const d = date.slice(0, 10);
  return d >= from && d <= to;
}

function addStyledTable(
  wb: ExcelJSType.Workbook,
  sheetName: string,
  title: string,
  columns: Col[],
  rows: Record<string, unknown>[],
) {
  const ws = wb.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 2 }],
  });
  const n = columns.length;
  ws.columns = columns.map((c) => ({ key: c.key, width: c.width ?? 16 }));

  // Faixa de título (linha 1)
  ws.mergeCells(1, 1, 1, n);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { bold: true, size: 14, color: { argb: WHITE } };
  t.fill = fill(INK);
  t.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 26;

  // Cabeçalho (linha 2)
  columns.forEach((c, i) => {
    const cell = ws.getCell(2, i + 1);
    cell.value = c.header;
    cell.font = { bold: true, size: 10, color: { argb: WHITE } };
    cell.fill = fill(c.fill ?? HEADER);
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = borderAll();
  });
  ws.getRow(2).height = 22;

  // Dados (zebra)
  rows.forEach((r, ri) => {
    columns.forEach((c, i) => {
      const cell = ws.getCell(3 + ri, i + 1);
      const v = r[c.key];
      cell.value = (v ?? (c.numFmt ? null : "")) as ExcelJSType.CellValue;
      if (c.numFmt) cell.numFmt = c.numFmt;
      cell.font = { size: 10, color: { argb: INK } };
      cell.fill = fill(ri % 2 === 0 ? ZEBRA1 : ZEBRA2);
      cell.alignment = {
        vertical: "middle",
        horizontal: c.align ?? (c.numFmt ? "right" : "left"),
        indent: c.align === "center" || c.numFmt ? 0 : 1,
      };
      cell.border = borderAll();
    });
  });

  // Total
  const totalCols = columns.filter((c) => c.total);
  if (totalCols.length && rows.length) {
    const idx = 3 + rows.length;
    columns.forEach((c, i) => {
      const cell = ws.getCell(idx, i + 1);
      if (i === 0) cell.value = "TOTAL";
      else if (c.total) {
        cell.value = rows.reduce((s, r) => s + Number(r[c.key] ?? 0), 0);
        if (c.numFmt) cell.numFmt = c.numFmt;
      }
      cell.font = { bold: true, size: 10, color: { argb: WHITE } };
      cell.fill = fill(TEAL);
      cell.alignment = {
        vertical: "middle",
        horizontal: c.numFmt ? "right" : i === 0 ? "left" : "center",
        indent: i === 0 ? 1 : 0,
      };
      cell.border = borderAll();
    });
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
  const periodo = `${formatDateBR(dateFrom)} a ${formatDateBR(dateTo)}`;

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
  cover.columns = [{ width: 26 }, { width: 44 }];
  cover.mergeCells("A1:B1");
  const cTitle = cover.getCell("A1");
  cTitle.value = "LEY COLCHÕES · RELATÓRIO";
  cTitle.font = { bold: true, size: 18, color: { argb: WHITE } };
  cTitle.fill = fill(INK);
  cTitle.alignment = { vertical: "middle", horizontal: "center" };
  cover.getRow(1).height = 40;
  cover.addRow([]);
  const info: [string, string][] = [
    ["Período", periodo],
    ["Gerado em", formatDateBR(new Date().toISOString().slice(0, 10))],
    ["Exportado por", exporterName],
  ];
  info.forEach(([k, v], i) => {
    const row = cover.getRow(3 + i);
    const a = row.getCell(1);
    const b = row.getCell(2);
    a.value = k;
    a.font = { bold: true, size: 11, color: { argb: WHITE } };
    a.fill = fill(i % 2 === 0 ? BLUE : BLUE_LIGHT);
    a.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    b.value = v;
    b.font = { size: 11, color: { argb: INK } };
    b.fill = fill(i % 2 === 0 ? ZEBRA1 : ZEBRA2);
    b.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    a.border = borderAll();
    b.border = borderAll();
    row.height = 20;
  });

  // ---------- Resumo ----------
  const resumoRows = data.factories.map((f) => {
    const vendas = salesIn
      .filter((s) => s.factory_id === f.id)
      .reduce((a, s) => a + s.amount_cents, 0);
    const fat = billingIn
      .filter((b) => b.factory_id === f.id)
      .reduce((a, b) => a + b.amount_cents, 0);
    const goal = goalFor(f.id);
    const pctFat = goal.b > 0 ? fat / goal.b : 0;
    return {
      fabrica: `${f.name} · ${f.state}`,
      vendas: reais(vendas),
      metaVendas: reais(goal.s),
      pctVendas: goal.s > 0 ? vendas / goal.s : 0,
      faturamento: reais(fat),
      metaFat: reais(goal.b),
      pctFat,
      carteira: reais(carteiraByFactory.get(f.id) ?? 0),
      status: goal.b <= 0 ? "—" : pctFat >= 1 ? "✅ Meta" : "⏳ Em progresso",
    };
  });
  addStyledTable(
    wb,
    "Resumo",
    `RESUMO EXECUTIVO · ${periodo}`,
    [
      { header: "Fábrica", key: "fabrica", width: 22, fill: INK, align: "left" },
      { header: "Vendas", key: "vendas", width: 16, numFmt: BRL, total: true, fill: BLUE },
      { header: "Meta vendas", key: "metaVendas", width: 16, numFmt: BRL, total: true, fill: NAVY },
      { header: "% meta vendas", key: "pctVendas", width: 13, numFmt: PCT, fill: BLUE_LIGHT },
      {
        header: "Faturamento",
        key: "faturamento",
        width: 16,
        numFmt: BRL,
        total: true,
        fill: BLUE,
      },
      {
        header: "Meta faturamento",
        key: "metaFat",
        width: 16,
        numFmt: BRL,
        total: true,
        fill: NAVY,
      },
      { header: "% meta fat.", key: "pctFat", width: 12, numFmt: PCT, fill: BLUE_LIGHT },
      {
        header: "Carteira atual",
        key: "carteira",
        width: 16,
        numFmt: BRL,
        total: true,
        fill: TEAL,
      },
      { header: "Status", key: "status", width: 16, fill: INK, align: "center" },
    ],
    resumoRows,
  );

  // ---------- Vendas ----------
  addStyledTable(
    wb,
    "Vendas",
    `VENDAS · ${periodo}`,
    [
      { header: "Data", key: "data", width: 12, align: "center" },
      { header: "Fábrica", key: "fabrica", width: 20 },
      { header: "Canal", key: "canal", width: 16 },
      { header: "Valor", key: "valor", width: 16, numFmt: BRL, total: true, fill: BLUE },
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
  addStyledTable(
    wb,
    "Faturamento",
    `FATURAMENTO · ${periodo}`,
    [
      { header: "Data", key: "data", width: 12, align: "center" },
      { header: "Fábrica", key: "fabrica", width: 20 },
      { header: "Valor", key: "valor", width: 16, numFmt: BRL, total: true, fill: BLUE },
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
  addStyledTable(
    wb,
    "Carteira (ajustes)",
    `CARTEIRA — AJUSTES · ${periodo}`,
    [
      { header: "Data ref.", key: "data", width: 12, align: "center" },
      { header: "Fábrica", key: "fabrica", width: 20 },
      { header: "Tipo", key: "tipo", width: 16 },
      { header: "Impacto", key: "impacto", width: 16, numFmt: BRL, total: true, fill: BLUE },
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
    addStyledTable(
      wb,
      "Repasses",
      `REPASSES · ${periodo}`,
      [
        { header: "Data ref.", key: "data", width: 12, align: "center" },
        { header: "Fábrica", key: "fabrica", width: 20 },
        { header: "Destino", key: "destino", width: 18 },
        { header: "Original", key: "original", width: 16, numFmt: BRL, total: true, fill: BLUE },
        { header: "Realizado", key: "realizado", width: 16, numFmt: BRL, total: true, fill: BLUE },
        { header: "Desconto", key: "desconto", width: 16, numFmt: BRL, total: true, fill: TEAL },
        { header: "% desconto", key: "pct", width: 12, numFmt: PCT, fill: BLUE_LIGHT },
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
  addStyledTable(
    wb,
    "Metas",
    `METAS · ${periodo}`,
    [
      { header: "Fábrica", key: "fabrica", width: 20 },
      { header: "Ano", key: "ano", width: 8, align: "center" },
      { header: "Mês", key: "mes", width: 8, align: "center" },
      { header: "Meta faturamento", key: "metaFat", width: 18, numFmt: BRL, fill: NAVY },
      { header: "Meta vendas", key: "metaVendas", width: 18, numFmt: BRL, fill: NAVY },
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

  // ---------- Diário ----------
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
  const diarioCols: Col[] = [{ header: "Data", key: "data", width: 12, align: "center" }];
  data.factories.forEach((f, i) => {
    const c = i === 0 ? BLUE : BLUE_LIGHT;
    diarioCols.push({
      header: `${f.name} — Vendas`,
      key: `v_${f.id}`,
      width: 16,
      numFmt: BRL,
      total: true,
      fill: c,
    });
    diarioCols.push({
      header: `${f.name} — Fat.`,
      key: `f_${f.id}`,
      width: 16,
      numFmt: BRL,
      total: true,
      fill: c,
    });
  });
  diarioCols.push({
    header: "Total Vendas",
    key: "tv",
    width: 16,
    numFmt: BRL,
    total: true,
    fill: TEAL,
  });
  diarioCols.push({
    header: "Total Fat.",
    key: "tf",
    width: 16,
    numFmt: BRL,
    total: true,
    fill: TEAL,
  });

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
  addStyledTable(wb, "Diário", `DIÁRIO · ${periodo}`, diarioCols, diarioRows);

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
