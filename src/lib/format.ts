// Formatadores brasileiros — moeda, datas, percentuais.
// Valores monetários sempre em centavos (BIGINT) — nunca usar float.

export function centsToBRL(cents: number | null | undefined): string {
  const v = Number(cents ?? 0) / 100;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(v);
}

export function centsToCompact(cents: number | null | undefined): string {
  const v = Number(cents ?? 0) / 100;
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(1).replace(".", ",")}k`;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(v);
}

export function brlInputToCents(input: string): number {
  if (input == null) return 0;
  const cleaned = String(input).replace(/[^\d,.-]/g, "").trim();
  if (!cleaned) return 0;

  const hasComma = cleaned.includes(",");
  let normalized: string;
  if (hasComma) {
    // Vírgula é decimal; pontos são separadores de milhar.
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    // Sem vírgula: trate pontos como milhar quando o último grupo tem 3 dígitos
    // (ex.: "5.000.000" -> 5000000). Caso contrário, ponto é decimal ("1234.56").
    const parts = cleaned.split(".");
    const looksLikeThousands =
      parts.length > 1 && parts.slice(1).every((p) => p.length === 3);
    normalized = looksLikeThousands ? parts.join("") : cleaned;
  }
  const value = parseFloat(normalized);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

/** Formata centavos para preencher um input editável (sem 'R$' ou separador de milhar). */
export function centsToBRLInput(cents: number | null | undefined): string {
  const n = Number(cents ?? 0);
  if (!Number.isFinite(n) || n === 0) return "";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const reais = Math.trunc(abs / 100);
  const centavos = abs % 100;
  return `${sign}${reais},${String(centavos).padStart(2, "0")}`;
}

export function formatPct(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits).replace(".", ",")}%`;
}

export function formatDateBR(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Fortaleza",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export function formatTimeBR(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Fortaleza",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatDateTimeBR(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return `${formatDateBR(d)} · ${formatTimeBR(d)}`;
}

/** Retorna 'YYYY-MM-DD' no fuso America/Fortaleza */
export function todayISO(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

export function monthRange(year: number, month: number): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${year}-${pad(month)}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${pad(month)}-${pad(lastDay)}`;
  return { start, end };
}
