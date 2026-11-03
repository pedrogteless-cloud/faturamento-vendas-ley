// Unidades diárias (faturadas e produzidas) e ticket médio.
//
// Convenção: null = não informado (diferente de 0 peça).
// Ticket médio diário = faturamento do dia ÷ unidades faturadas do dia.

export const UNIT_KINDS = ["colchoes", "bases", "unibox", "outros"] as const;
export type UnitKind = (typeof UNIT_KINDS)[number];

export const UNIT_LABEL: Record<UnitKind, string> = {
  colchoes: "Colchões",
  bases: "Bases",
  unibox: "Unibox",
  outros: "Outros (Dandan e demais)",
};

export type UnitCounts = Record<UnitKind, number | null>;

export const EMPTY_COUNTS: UnitCounts = { colchoes: null, bases: null, unibox: null, outros: null };

/** Linha da tabela daily_units (colunas fora dos tipos gerados). */
export type UnitsRow = {
  factory_id: string;
  reference_date: string;
  billed_colchoes: number | null;
  billed_bases: number | null;
  billed_unibox: number | null;
  billed_outros: number | null;
  produced_colchoes: number | null;
  produced_bases: number | null;
  produced_unibox: number | null;
  produced_outros: number | null;
};

export const UNIT_COLUMNS =
  "factory_id, reference_date, billed_colchoes, billed_bases, billed_unibox, billed_outros, produced_colchoes, produced_bases, produced_unibox, produced_outros";

const num = (v: unknown): number | null => (v == null ? null : Number(v));

export function billedOf(r: UnitsRow): UnitCounts {
  return {
    colchoes: num(r.billed_colchoes),
    bases: num(r.billed_bases),
    unibox: num(r.billed_unibox),
    outros: num(r.billed_outros),
  };
}

export function producedOf(r: UnitsRow): UnitCounts {
  return {
    colchoes: num(r.produced_colchoes),
    bases: num(r.produced_bases),
    unibox: num(r.produced_unibox),
    outros: num(r.produced_outros),
  };
}

/** Soma dos tipos informados; null se nenhum tipo foi informado. */
export function totalUnits(c: UnitCounts): number | null {
  const vals = UNIT_KINDS.map((k) => c[k]).filter((v): v is number => v != null);
  return vals.length ? vals.reduce((s, v) => s + v, 0) : null;
}

/** Ticket médio em centavos por unidade; null sem unidades faturadas. */
export function ticketMedioCents(billingCents: number, billedTotal: number | null): number | null {
  if (billedTotal == null || billedTotal <= 0) return null;
  return Math.round(billingCents / billedTotal);
}

export type UnitsDay = {
  date: string;
  billingCents: number;
  billed: UnitCounts;
  produced: UnitCounts;
};

export type UnitsSummary = {
  daysWithBilled: number;
  billedUnits: number;
  producedUnits: number;
  /** Faturamento só dos dias com unidades faturadas informadas. */
  billingCentsInformed: number;
  /** Ticket médio ponderado: Σ faturamento ÷ Σ unidades (dias informados). */
  ticketCents: number | null;
  /** Unidades produzidas por unidade faturada (só dias com as duas informadas). */
  producedPerBilled: number | null;
};

export function summarizeUnits(days: UnitsDay[]): UnitsSummary {
  let daysWithBilled = 0;
  let billedUnits = 0;
  let producedUnits = 0;
  let billingCentsInformed = 0;
  let bothBilled = 0;
  let bothProduced = 0;
  for (const d of days) {
    const b = totalUnits(d.billed);
    const p = totalUnits(d.produced);
    if (b != null) {
      daysWithBilled++;
      billedUnits += b;
      billingCentsInformed += d.billingCents;
    }
    if (p != null) producedUnits += p;
    if (b != null && p != null) {
      bothBilled += b;
      bothProduced += p;
    }
  }
  return {
    daysWithBilled,
    billedUnits,
    producedUnits,
    billingCentsInformed,
    ticketCents: billedUnits > 0 ? Math.round(billingCentsInformed / billedUnits) : null,
    producedPerBilled: bothBilled > 0 ? bothProduced / bothBilled : null,
  };
}

/** Correlação de Pearson (−1..1); null com menos de 3 pontos ou sem variação. */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}
