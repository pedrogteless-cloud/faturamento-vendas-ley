import type ExcelJSType from "exceljs";
import type { ReportData } from "@/lib/reports.functions";
import { formatDateBR } from "@/lib/format";
import { UNIT_KINDS, billedOf, producedOf, ticketMedioCents, totalUnits } from "@/lib/units-calc";
import {
  STATUS_LABEL,
  consolidatedDays,
  dayShare,
  statusFor,
  summarize,
  weekly,
  type TrocasDay,
  type TrocasStatus,
} from "@/lib/trocas-calc";

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
  /** Total customizado (ex.: soma só dos dias informados, % ponderado). */
  totalFn?: (rows: Record<string, unknown>[]) => unknown;
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
  const totalCols = columns.filter((c) => c.total || c.totalFn);
  if (totalCols.length && rows.length) {
    const idx = 3 + rows.length;
    columns.forEach((c, i) => {
      const cell = ws.getCell(idx, i + 1);
      if (i === 0) cell.value = "TOTAL";
      else if (c.totalFn) {
        cell.value = c.totalFn(rows) as ExcelJSType.CellValue;
        if (c.numFmt) cell.numFmt = c.numFmt;
      } else if (c.total) {
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

  // ---------- Trocas na produção: dados base (NÃO é faturamento) ----------
  const thr = data.trocasThresholds;
  const trocasIn = data.trocas.filter((t) => inRange(t.reference_date, dateFrom, dateTo));
  const unitLabel = (code: string, name: string) =>
    code === "eusebio" ? `Matriz · ${name}` : code === "timon" ? `Filial · ${name}` : name;

  const byFactory = data.factories.map((f) => {
    const days = new Map<string, TrocasDay>();
    for (const b of billingIn) {
      if (b.factory_id !== f.id) continue;
      const cur = days.get(b.reference_date) ?? {
        date: b.reference_date,
        billingCents: 0,
        trocasCents: null,
      };
      cur.billingCents += Number(b.amount_cents);
      days.set(b.reference_date, cur);
    }
    for (const t of trocasIn) {
      if (t.factory_id !== f.id) continue;
      const cur = days.get(t.reference_date) ?? {
        date: t.reference_date,
        billingCents: 0,
        trocasCents: null,
      };
      cur.trocasCents = t.amount_cents;
      days.set(t.reference_date, cur);
    }
    return {
      label: unitLabel(f.code, f.name),
      days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    };
  });
  const units = [
    ...byFactory,
    {
      label: "Consolidado (dias com as duas)",
      days: consolidatedDays(byFactory.map((u) => u.days)),
    },
  ];

  const STATUS_ARGB: Record<TrocasStatus, string> = {
    normal: "FF16A34A",
    atencao: "FFD97706",
    critico: "FFDC2626",
    sem_info: "FF6B7280",
  };
  const colorStatus = (
    ws: ExcelJSType.Worksheet,
    key: string,
    rows: { status: TrocasStatus }[],
  ) => {
    const col = ws.getColumn(key).number;
    rows.forEach((r, i) => {
      const cell = ws.getCell(3 + i, col);
      cell.font = { bold: true, size: 10, color: { argb: STATUS_ARGB[r.status] } };
    });
  };
  const ORANGE = "FFEA580C";
  const aviso = "NÃO é faturamento · NÃO gera contas a receber";
  const MISSING = "sem informação";

  // ---------- Resumo ----------
  const trocasTotal = summarize(
    byFactory.flatMap((u) => u.days),
    thr,
  );
  const resumoRows = data.factories.map((f, fi) => {
    const smT = summarize(byFactory[fi].days, thr);
    const stT = statusFor(smT.weightedShare, thr);
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
      // Trocas: NÃO entram em faturamento/vendas/carteira. Sem informação ≠ zero.
      trocas: smT.informedDays ? reais(smT.trocasCents) : MISSING,
      pctTrocas: smT.weightedShare ?? MISSING,
      sitTrocas: STATUS_LABEL[stT],
      statusTrocas: stT,
    };
  });
  const wsResumo = addStyledTable(
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
      {
        header: "Trocas (não é fat.)",
        key: "trocas",
        width: 18,
        numFmt: BRL,
        fill: ORANGE,
        totalFn: () => (trocasTotal.informedDays ? reais(trocasTotal.trocasCents) : MISSING),
      },
      {
        header: "% trocas (ponderado)",
        key: "pctTrocas",
        width: 14,
        numFmt: PCT,
        fill: ORANGE,
        totalFn: () => trocasTotal.weightedShare ?? MISSING,
      },
      {
        header: "Situação trocas",
        key: "sitTrocas",
        width: 16,
        fill: INK,
        align: "center",
        totalFn: () => STATUS_LABEL[statusFor(trocasTotal.weightedShare, thr)],
      },
    ],
    resumoRows,
  );
  colorStatus(
    wsResumo,
    "sitTrocas",
    resumoRows.map((r) => ({ status: r.statusTrocas })),
  );
  colorStatus(
    wsResumo,
    "pctTrocas",
    resumoRows.map((r) => ({ status: r.statusTrocas })),
  );
  {
    const nr = 3 + resumoRows.length + 2;
    wsResumo.mergeCells(nr, 1, nr, 12);
    const c = wsResumo.getCell(nr, 1);
    c.value =
      `Trocas na produção NÃO entram em faturamento, vendas, metas nem carteira. ` +
      `Total de trocas = soma dos dias informados; dias sem informação ficam fora (não são zero). ` +
      `% = trocas ÷ (faturamento + trocas). Detalhe dia a dia nas colunas finais da aba Diário e nas abas "Trocas".`;
    c.font = { italic: true, size: 9, color: { argb: "FF6B7280" } };
    c.alignment = { wrapText: true, vertical: "top" };
    wsResumo.getRow(nr).height = 40;
  }

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

  // Trocas por dia (informadas no período). NÃO entram em "Total Fat." nem em "Total Vendas".
  const trocasKey = new Map<string, number | null>();
  for (const t of trocasIn) trocasKey.set(`${t.factory_id}|${t.reference_date}`, t.amount_cents);
  data.factories.forEach((f, fi) => {
    const sm = summarize(byFactory[fi].days, thr);
    diarioCols.push({
      header: `${f.name} — Trocas (não é fat.)`,
      key: `t_${f.id}`,
      width: 18,
      numFmt: BRL,
      fill: ORANGE,
      totalFn: () => (sm.informedDays ? reais(sm.trocasCents) : MISSING),
    });
    diarioCols.push({
      header: `${f.name} — % trocas`,
      key: `p_${f.id}`,
      width: 13,
      numFmt: PCT,
      fill: ORANGE,
      totalFn: () => sm.weightedShare ?? MISSING,
    });
  });
  const diarioStatus = new Map<string, { status: TrocasStatus }[]>();

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
      const tr = trocasKey.get(`${f.id}|${day}`) ?? null;
      const share = dayShare(b, tr);
      row[`t_${f.id}`] = tr == null ? MISSING : reais(tr);
      row[`p_${f.id}`] = share ?? MISSING;
      const st = { status: statusFor(share, thr) };
      diarioStatus.set(f.id, [...(diarioStatus.get(f.id) ?? []), st]);
    }
    row.tv = reais(tv);
    row.tf = reais(tf);
    return row;
  });
  const wsDiario = addStyledTable(wb, "Diário", `DIÁRIO · ${periodo}`, diarioCols, diarioRows);
  for (const f of data.factories) {
    colorStatus(wsDiario, `t_${f.id}`, diarioStatus.get(f.id) ?? []);
    colorStatus(wsDiario, `p_${f.id}`, diarioStatus.get(f.id) ?? []);
  }

  // ---------- Trocas na produção (NÃO é faturamento) ----------
  // Abas separadas: trocas nunca entram nos totais de faturamento/vendas acima.
  {
    // Resumo
    const resumo = units.map((u) => {
      const sm = summarize(u.days, thr);
      const st = statusFor(sm.weightedShare, thr);
      return {
        unidade: u.label,
        trocas: sm.informedDays ? reais(sm.trocasCents) : MISSING,
        producao: sm.informedDays ? reais(sm.productionCents) : MISSING,
        pct: sm.weightedShare ?? MISSING,
        situacao: STATUS_LABEL[st],
        status: st,
        media: sm.simpleAvgShare ?? "",
        pior: sm.worst
          ? `${formatDateBR(sm.worst.date)} (${(sm.worst.share * 100).toFixed(1).replace(".", ",")}%)`
          : "—",
        normal: sm.counts.normal,
        atencao: sm.counts.atencao,
        critico: sm.counts.critico,
        semInfo: sm.missingDays,
        pctCritico: sm.criticalDaysShare ?? "",
      };
    });
    const wsR = addStyledTable(
      wb,
      "Trocas (resumo)",
      `TROCAS NA PRODUÇÃO · ${periodo} · ${aviso}`,
      [
        { header: "Unidade", key: "unidade", width: 30, fill: ORANGE },
        { header: "Trocas", key: "trocas", width: 16, numFmt: BRL, fill: ORANGE },
        {
          header: "Produção total (fat. + trocas)",
          key: "producao",
          width: 20,
          numFmt: BRL,
          fill: NAVY,
        },
        { header: "% acumulado (ponderado)", key: "pct", width: 14, numFmt: PCT, fill: ORANGE },
        { header: "Situação", key: "situacao", width: 14, fill: INK, align: "center" },
        { header: "Média simples dos %", key: "media", width: 13, numFmt: PCT, fill: BLUE_LIGHT },
        { header: "Pior dia", key: "pior", width: 20, fill: INK, align: "center" },
        { header: "Dias Normal", key: "normal", width: 10, fill: INK, align: "center" },
        { header: "Dias Atenção", key: "atencao", width: 10, fill: INK, align: "center" },
        { header: "Dias Crítico", key: "critico", width: 10, fill: INK, align: "center" },
        { header: "Sem informação", key: "semInfo", width: 12, fill: INK, align: "center" },
        { header: "% dias em Crítico", key: "pctCritico", width: 12, numFmt: PCT, fill: INK },
      ],
      resumo,
    );
    colorStatus(wsR, "situacao", resumo);
    const noteRow = 4 + resumo.length;
    wsR.mergeCells(noteRow, 1, noteRow, 12);
    const note = wsR.getCell(noteRow, 1);
    note.value =
      `Trocas = produtos fabricados para trocas e assistências de itens já vendidos. Consomem matéria-prima, mão de obra e máquina, mas não viram contas a receber. ` +
      `% = trocas ÷ (faturamento + trocas). Faixas: Normal < ${thr.atencao}% · Atenção ${thr.atencao}–${thr.critico}% · Crítico ≥ ${thr.critico}%. ` +
      `Dias sem informação ficam fora do cálculo. Consolidado considera só os dias em que as duas unidades informaram.`;
    note.font = { italic: true, size: 9, color: { argb: "FF6B7280" } };
    note.alignment = { wrapText: true, vertical: "top" };
    wsR.getRow(noteRow).height = 42;

    // Diário
    const diario = byFactory.flatMap((u) =>
      u.days.map((d) => {
        const share = dayShare(d.billingCents, d.trocasCents);
        const st = statusFor(share, thr);
        return {
          data: formatDateBR(d.date),
          unidade: u.label,
          faturamento: reais(d.billingCents),
          trocas: d.trocasCents == null ? MISSING : reais(d.trocasCents),
          producao: d.trocasCents == null ? "" : reais(d.billingCents + d.trocasCents),
          pct: share ?? "",
          situacao: STATUS_LABEL[st],
          status: st,
        };
      }),
    );
    const wsD = addStyledTable(
      wb,
      "Trocas (diário)",
      `TROCAS NA PRODUÇÃO — DIÁRIO · ${periodo} · ${aviso}`,
      [
        { header: "Data", key: "data", width: 12, align: "center" },
        { header: "Unidade", key: "unidade", width: 22 },
        {
          header: "Faturamento (gera a receber)",
          key: "faturamento",
          width: 18,
          numFmt: BRL,
          fill: BLUE,
        },
        {
          header: "Trocas (não gera)",
          key: "trocas",
          width: 16,
          numFmt: BRL,
          fill: ORANGE,
          align: "right",
        },
        { header: "Produção total", key: "producao", width: 16, numFmt: BRL, fill: NAVY },
        { header: "% trocas", key: "pct", width: 11, numFmt: PCT, fill: ORANGE },
        { header: "Situação", key: "situacao", width: 14, fill: INK, align: "center" },
      ],
      diario,
    );
    colorStatus(wsD, "situacao", diario);

    // Semanal
    const semanal = byFactory.flatMap((u) =>
      weekly(u.days, thr).map((w) => {
        const st = statusFor(w.summary.weightedShare, thr);
        return {
          semana: formatDateBR(w.week),
          unidade: u.label,
          trocas: w.summary.informedDays ? reais(w.summary.trocasCents) : MISSING,
          producao: w.summary.informedDays ? reais(w.summary.productionCents) : MISSING,
          pct: w.summary.weightedShare ?? MISSING,
          situacao: STATUS_LABEL[st],
          status: st,
        };
      }),
    );
    const wsS = addStyledTable(
      wb,
      "Trocas (semanal)",
      `TROCAS NA PRODUÇÃO — SEMANAL (SEG–SEX) · ${periodo}`,
      [
        { header: "Semana de", key: "semana", width: 12, align: "center" },
        { header: "Unidade", key: "unidade", width: 22 },
        { header: "Trocas", key: "trocas", width: 16, numFmt: BRL, fill: ORANGE },
        { header: "Produção total", key: "producao", width: 16, numFmt: BRL, fill: NAVY },
        { header: "% ponderado", key: "pct", width: 12, numFmt: PCT, fill: ORANGE },
        { header: "Situação", key: "situacao", width: 14, fill: INK, align: "center" },
      ],
      semanal,
    );
    colorStatus(wsS, "situacao", semanal);
  }

  // ---------- Unidades (faturadas e produzidas) e ticket médio ----------
  // Só entram os dias com unidades lançadas; dias sem lançamento não aparecem.
  {
    const billKey = new Map<string, number>();
    for (const b of billingIn) {
      const k = `${b.factory_id}|${b.reference_date}`;
      billKey.set(k, (billKey.get(k) ?? 0) + Number(b.amount_cents));
    }
    const facIndex = (id: string) => data.factories.findIndex((f) => f.id === id);
    const unitRows = data.units
      .filter((u) => inRange(u.reference_date, dateFrom, dateTo))
      .slice()
      .sort(
        (a, b) =>
          a.reference_date.localeCompare(b.reference_date) ||
          facIndex(a.factory_id) - facIndex(b.factory_id),
      );

    const rows = unitRows.map((u) => {
      const f = data.factories.find((x) => x.id === u.factory_id);
      const billingCents = billKey.get(`${u.factory_id}|${u.reference_date}`) ?? 0;
      const b = billedOf(u);
      const p = producedOf(u);
      const bt = totalUnits(b);
      const pt = totalUnits(p);
      const ticket = ticketMedioCents(billingCents, bt);
      const row: Record<string, unknown> = {
        data: formatDateBR(u.reference_date),
        unidade: f ? unitLabel(f.code, f.name) : "—",
        fat: reais(billingCents),
        bt: bt ?? MISSING,
        ticket: ticket == null ? MISSING : reais(ticket),
        pt: pt ?? MISSING,
        razao: bt != null && bt > 0 && pt != null ? pt / bt : MISSING,
        _billingCents: billingCents,
        _bt: bt,
        _pt: pt,
      };
      for (const k of UNIT_KINDS) {
        row[`b_${k}`] = b[k] ?? "";
        row[`p_${k}`] = p[k] ?? "";
      }
      return row;
    });

    const sumNum = (key: string) =>
      rows.reduce((acc, r) => acc + (typeof r[key] === "number" ? (r[key] as number) : 0), 0);
    const bothRows = rows.filter((r) => r._bt != null && (r._bt as number) > 0 && r._pt != null);
    const billedSum = rows.reduce((a, r) => a + ((r._bt as number | null) ?? 0), 0);
    const billingOfBilled = rows
      .filter((r) => r._bt != null && (r._bt as number) > 0)
      .reduce((a, r) => a + (r._billingCents as number), 0);
    const unitsCol = (header: string, key: string, fillColor: string): Col => ({
      header,
      key,
      width: 11,
      numFmt: "#,##0",
      fill: fillColor,
      totalFn: () => sumNum(key),
    });

    const wsU = addStyledTable(
      wb,
      "Unidades",
      `UNIDADES FATURADAS E PRODUZIDAS · ${periodo}`,
      [
        { header: "Data", key: "data", width: 12, align: "center" },
        { header: "Unidade", key: "unidade", width: 22 },
        {
          header: "Faturamento do dia",
          key: "fat",
          width: 16,
          numFmt: BRL,
          fill: BLUE,
          totalFn: () => reais(rows.reduce((a, r) => a + (r._billingCents as number), 0)),
        },
        unitsCol("Fat.: colchões", "b_colchoes", BLUE_LIGHT),
        unitsCol("Fat.: bases", "b_bases", BLUE_LIGHT),
        unitsCol("Fat.: unibox", "b_unibox", BLUE_LIGHT),
        unitsCol("Fat.: outros", "b_outros", BLUE_LIGHT),
        {
          header: "Unid. faturadas",
          key: "bt",
          width: 12,
          numFmt: "#,##0",
          fill: BLUE,
          totalFn: () => billedSum,
        },
        {
          header: "Ticket médio (R$/unid.)",
          key: "ticket",
          width: 16,
          numFmt: BRL,
          fill: TEAL,
          totalFn: () => (billedSum > 0 ? reais(billingOfBilled) / billedSum : MISSING),
        },
        unitsCol("Prod.: colchões", "p_colchoes", BLUE_LIGHT),
        unitsCol("Prod.: bases", "p_bases", BLUE_LIGHT),
        unitsCol("Prod.: unibox", "p_unibox", BLUE_LIGHT),
        unitsCol("Prod.: outros", "p_outros", BLUE_LIGHT),
        {
          header: "Unid. produzidas",
          key: "pt",
          width: 12,
          numFmt: "#,##0",
          fill: NAVY,
          totalFn: () => sumNum("pt"),
        },
        {
          header: "Produzidas ÷ faturadas",
          key: "razao",
          width: 13,
          numFmt: "0.00",
          fill: NAVY,
          totalFn: () => {
            const b = bothRows.reduce((a, r) => a + (r._bt as number), 0);
            const p = bothRows.reduce((a, r) => a + (r._pt as number), 0);
            return b > 0 ? p / b : MISSING;
          },
        },
      ],
      rows,
    );
    const noteRow = rows.length ? 5 + rows.length : 3;
    wsU.mergeCells(noteRow, 1, noteRow, 16);
    const noteU = wsU.getCell(noteRow, 1);
    noteU.value = rows.length
      ? "Ticket médio = faturamento do dia ÷ unidades faturadas. O total pondera pelos dias lançados. " +
        "Só aparecem os dias com unidades lançadas; campo vazio = não informado. " +
        "Outros inclui Dandan e demais peças."
      : "Nenhuma unidade lançada no período. As unidades faturadas e produzidas passam a ser lançadas " +
        "na tela de lançamento de faturamento (Unidades do dia).";
    noteU.font = { italic: true, size: 9, color: { argb: "FF6B7280" } };
    noteU.alignment = { wrapText: true, vertical: "top" };
    wsU.getRow(noteRow).height = 32;
  }

  // ---------- Capa (última aba) ----------
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

  // Garante que o Resumo seja a aba ativa ao abrir
  wb.views = [
    {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      firstSheet: 0,
      activeTab: 0,
      visibility: "visible",
    },
  ];

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
