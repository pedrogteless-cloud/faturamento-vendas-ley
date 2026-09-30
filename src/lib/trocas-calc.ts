// Cálculos do indicador "Trocas na produção".
//
// Trocas NÃO são faturamento: produtos fabricados para repor itens já vendidos.
// Este módulo nunca soma trocas no faturamento — "produção total" só existe aqui.
//
// Convenção: trocasCents === null significa "não informado" (diferente de 0).

export type TrocasStatus = "normal" | "atencao" | "critico" | "sem_info";

export type TrocasThresholds = {
  /** % a partir do qual o dia entra em Atenção (ex.: 5). */
  atencao: number;
  /** % a partir do qual o dia entra em Crítico (ex.: 10). */
  critico: number;
};

export const DEFAULT_THRESHOLDS: TrocasThresholds = { atencao: 5, critico: 10 };

export type TrocasDay = {
  date: string; // YYYY-MM-DD
  billingCents: number;
  trocasCents: number | null;
};

export const STATUS_LABEL: Record<TrocasStatus, string> = {
  normal: "Normal",
  atencao: "Atenção",
  critico: "Crítico",
  sem_info: "Sem informação",
};

/** Fração 0..1 da produção que foi troca. null quando trocas não foi informado. */
export function dayShare(billingCents: number, trocasCents: number | null): number | null {
  if (trocasCents == null) return null;
  const production = billingCents + trocasCents;
  if (production <= 0) return 0;
  return trocasCents / production;
}

export function statusFor(share: number | null, t: TrocasThresholds): TrocasStatus {
  if (share == null) return "sem_info";
  const pct = share * 100;
  if (pct >= t.critico) return "critico";
  if (pct >= t.atencao) return "atencao";
  return "normal";
}

export type TrocasSummary = {
  informedDays: number;
  missingDays: number;
  trocasCents: number;
  productionCents: number;
  /** Acumulado ponderado: Σ trocas ÷ Σ produção dos dias informados. */
  weightedShare: number | null;
  /** Média simples dos % diários (informativo; o oficial é o ponderado). */
  simpleAvgShare: number | null;
  worst: { date: string; share: number } | null;
  counts: Record<Exclude<TrocasStatus, "sem_info">, number>;
  /** % dos dias informados que ficaram em Crítico. */
  criticalDaysShare: number | null;
};

export function summarize(days: TrocasDay[], t: TrocasThresholds): TrocasSummary {
  let trocas = 0;
  let production = 0;
  let informed = 0;
  let missing = 0;
  let sumShares = 0;
  let worst: TrocasSummary["worst"] = null;
  const counts = { normal: 0, atencao: 0, critico: 0 };

  for (const d of days) {
    const share = dayShare(d.billingCents, d.trocasCents);
    if (share == null) {
      missing++;
      continue;
    }
    informed++;
    trocas += d.trocasCents ?? 0;
    production += d.billingCents + (d.trocasCents ?? 0);
    sumShares += share;
    const st = statusFor(share, t);
    if (st !== "sem_info") counts[st]++;
    if (!worst || share > worst.share) worst = { date: d.date, share };
  }

  return {
    informedDays: informed,
    missingDays: missing,
    trocasCents: trocas,
    productionCents: production,
    weightedShare: informed ? (production > 0 ? trocas / production : 0) : null,
    simpleAvgShare: informed ? sumShares / informed : null,
    worst,
    counts,
    criticalDaysShare: informed ? counts.critico / informed : null,
  };
}

/** Segunda-feira (YYYY-MM-DD) da semana da data. */
export function weekStart(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const dow = d.getDay(); // 0 dom … 6 sáb
  d.setDate(d.getDate() - ((dow + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Visão semanal (seg–sex): acumulado ponderado por semana. */
export function weekly(days: TrocasDay[], t: TrocasThresholds) {
  const groups = new Map<string, TrocasDay[]>();
  for (const d of days) {
    const dow = new Date(`${d.date}T12:00:00`).getDay();
    if (dow === 0 || dow === 6) continue;
    const k = weekStart(d.date);
    groups.set(k, [...(groups.get(k) ?? []), d]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, ds]) => ({ week, summary: summarize(ds, t) }));
}

/**
 * Consolidado das fábricas: só entram os dias em que TODAS informaram trocas.
 * Recebe um mapa fábrica → dias.
 */
export function consolidatedDays(byFactory: TrocasDay[][]): TrocasDay[] {
  if (!byFactory.length) return [];
  const maps = byFactory.map((ds) => new Map(ds.map((d) => [d.date, d])));
  const dates = new Set(byFactory.flat().map((d) => d.date));
  const out: TrocasDay[] = [];
  for (const date of [...dates].sort()) {
    const rows = maps.map((m) => m.get(date));
    const allInformed = rows.every((r) => r && r.trocasCents != null);
    out.push({
      date,
      billingCents: rows.reduce((s, r) => s + (r?.billingCents ?? 0), 0),
      trocasCents: allInformed ? rows.reduce((s, r) => s + (r?.trocasCents ?? 0), 0) : null,
    });
  }
  return out;
}

export function formatShare(share: number | null, digits = 1): string {
  if (share == null) return "—";
  return `${(share * 100).toFixed(digits).replace(".", ",")}%`;
}

/** "De cada R$ 100 produzidos, R$ X são trocas e não viram contas a receber." */
export function per100Sentence(share: number | null): string {
  if (share == null) return "Sem informação de trocas para calcular.";
  const x = (share * 100).toFixed(2).replace(".", ",");
  return `De cada R$ 100 produzidos, R$ ${x} são trocas e não viram contas a receber.`;
}
