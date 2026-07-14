import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FactoryRow = {
  id: string;
  code: string;
  name: string;
  state: string;
};

export type RecoveryRow = {
  id: string;
  factory_id: string;
  recovered_date: string;
  returned_date: string | null;
  amount_cents: number;
  customer_name: string | null;
  check_reference: string | null;
  note: string | null;
  created_at: string;
};

export type BillingRow = {
  factory_id: string;
  reference_date: string;
  amount_cents: number;
};

export type FactoryStat = {
  factoryId: string;
  factoryCode: string;
  factoryName: string;
  factoryState: string;
  billedCents: number;
  recoveredCents: number;
  returnRatePct: number;
  count: number;
  avgDaysToRecover: number | null;
  minDays: number | null;
  maxDays: number | null;
};

export type MonthlyStat = {
  month: string;        // "YYYY-MM"
  label: string;        // "Jan/24"
  billedCents: number;
  recoveredCents: number;
  count: number;
};

export type CustomerStat = {
  customerName: string;
  recoveredCents: number;
  count: number;
  factories: string[];
};

export type RecoveryRecord = {
  id: string;
  factoryCode: string;
  factoryName: string;
  factoryState: string;
  recoveredDate: string;
  returnedDate: string | null;
  amountCents: number;
  customerName: string | null;
  checkReference: string | null;
  note: string | null;
  daysToRecover: number | null;
};

export type ReturnedChecksAnalysisData = {
  asOf: string;
  // KPIs
  totalRecoveredCents: number;
  totalBilledCents: number;
  returnRatePct: number;
  avgDaysToRecover: number | null;
  medianDaysToRecover: number | null;
  recordCount: number;
  factoryCount: number;
  uniqueCustomers: number;
  // Breakdowns
  byFactory: FactoryStat[];
  byMonth: MonthlyStat[];
  byCustomer: CustomerStat[];
  records: RecoveryRecord[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" })
    .format(date)
    .replace(".", "");
}

function daysToRecover(returnedDate: string | null, recoveredDate: string): number | null {
  if (!returnedDate) return null;
  const r = new Date(returnedDate);
  const d = new Date(recoveredDate);
  if (isNaN(r.getTime()) || isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - r.getTime()) / 86_400_000);
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// ─── Server Function ──────────────────────────────────────────────────────────

export const getReturnedChecksAnalysis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReturnedChecksAnalysisData> => {
    const { supabase } = context;

    const [factoriesRes, recoveriesRes, billingRes] = await Promise.all([
      supabase.from("factories").select("id, code, name, state").order("name"),
      supabase
        .from("returned_check_recoveries")
        .select(
          "id, factory_id, recovered_date, returned_date, amount_cents, customer_name, check_reference, note, created_at",
        )
        .order("recovered_date", { ascending: false })
        .limit(5000),
      supabase
        .from("billing_entries")
        .select("factory_id, reference_date, amount_cents")
        .limit(20000),
    ]);

    if (factoriesRes.error) throw new Error(factoriesRes.error.message);
    if (recoveriesRes.error) throw new Error(recoveriesRes.error.message);
    if (billingRes.error) throw new Error(billingRes.error.message);

    const factories: FactoryRow[] = (factoriesRes.data ?? []) as FactoryRow[];
    const recoveries: RecoveryRow[] = (recoveriesRes.data ?? []).map((r) => ({
      ...r,
      amount_cents: Number(r.amount_cents),
    })) as RecoveryRow[];
    const billings: BillingRow[] = (billingRes.data ?? []).map((b) => ({
      ...b,
      amount_cents: Number(b.amount_cents),
    })) as BillingRow[];

    const factoryById = new Map(factories.map((f) => [f.id, f]));

    // ── By Factory ────────────────────────────────────────────────────────────
    const factoryMap = new Map<
      string,
      { rec: number; count: number; days: number[]; billing: number }
    >();
    for (const f of factories) {
      factoryMap.set(f.id, { rec: 0, count: 0, days: [], billing: 0 });
    }
    for (const r of recoveries) {
      const s = factoryMap.get(r.factory_id) ?? { rec: 0, count: 0, days: [], billing: 0 };
      s.rec += r.amount_cents;
      s.count += 1;
      const d = daysToRecover(r.returned_date, r.recovered_date);
      if (d !== null && d >= 0) s.days.push(d);
      factoryMap.set(r.factory_id, s);
    }
    for (const b of billings) {
      const s = factoryMap.get(b.factory_id) ?? { rec: 0, count: 0, days: [], billing: 0 };
      s.billing += b.amount_cents;
      factoryMap.set(b.factory_id, s);
    }

    const totalBilledCents = billings.reduce((s, b) => s + b.amount_cents, 0);

    const byFactory: FactoryStat[] = factories
      .map((f) => {
        const s = factoryMap.get(f.id) ?? { rec: 0, count: 0, days: [], billing: 0 };
        const avgDays =
          s.days.length > 0 ? Math.round(s.days.reduce((a, b) => a + b, 0) / s.days.length) : null;
        return {
          factoryId: f.id,
          factoryCode: f.code,
          factoryName: f.name,
          factoryState: f.state,
          billedCents: s.billing,
          recoveredCents: s.rec,
          returnRatePct: s.billing > 0 ? (s.rec / s.billing) * 100 : 0,
          count: s.count,
          avgDaysToRecover: avgDays,
          minDays: s.days.length > 0 ? Math.min(...s.days) : null,
          maxDays: s.days.length > 0 ? Math.max(...s.days) : null,
        };
      })
      .sort((a, b) => b.recoveredCents - a.recoveredCents);

    // ── By Month ──────────────────────────────────────────────────────────────
    const monthRecMap = new Map<string, { rec: number; count: number }>();
    for (const r of recoveries) {
      const key = monthKey(r.recovered_date);
      const s = monthRecMap.get(key) ?? { rec: 0, count: 0 };
      s.rec += r.amount_cents;
      s.count += 1;
      monthRecMap.set(key, s);
    }
    const monthBilMap = new Map<string, number>();
    for (const b of billings) {
      const key = monthKey(b.reference_date);
      monthBilMap.set(key, (monthBilMap.get(key) ?? 0) + b.amount_cents);
    }

    // Combine all months from both sources
    const allMonths = new Set([...monthRecMap.keys(), ...monthBilMap.keys()]);
    const byMonth: MonthlyStat[] = Array.from(allMonths)
      .sort()
      .map((m) => ({
        month: m,
        label: monthLabel(m),
        billedCents: monthBilMap.get(m) ?? 0,
        recoveredCents: monthRecMap.get(m)?.rec ?? 0,
        count: monthRecMap.get(m)?.count ?? 0,
      }));

    // ── By Customer ───────────────────────────────────────────────────────────
    const custMap = new Map<string, { rec: number; count: number; factories: Set<string> }>();
    for (const r of recoveries) {
      const key = r.customer_name?.trim() || "—";
      const s = custMap.get(key) ?? { rec: 0, count: 0, factories: new Set() };
      s.rec += r.amount_cents;
      s.count += 1;
      const f = factoryById.get(r.factory_id);
      if (f) s.factories.add(`${f.name} · ${f.state}`);
      custMap.set(key, s);
    }
    const byCustomer: CustomerStat[] = Array.from(custMap.entries())
      .map(([name, s]) => ({
        customerName: name,
        recoveredCents: s.rec,
        count: s.count,
        factories: Array.from(s.factories),
      }))
      .sort((a, b) => b.recoveredCents - a.recoveredCents);

    // ── Individual Records ────────────────────────────────────────────────────
    const records: RecoveryRecord[] = recoveries.map((r) => {
      const f = factoryById.get(r.factory_id);
      return {
        id: r.id,
        factoryCode: f?.code ?? "—",
        factoryName: f?.name ?? "—",
        factoryState: f?.state ?? "—",
        recoveredDate: r.recovered_date,
        returnedDate: r.returned_date,
        amountCents: r.amount_cents,
        customerName: r.customer_name,
        checkReference: r.check_reference,
        note: r.note,
        daysToRecover: daysToRecover(r.returned_date, r.recovered_date),
      };
    });

    // ── Global KPIs ───────────────────────────────────────────────────────────
    const totalRecoveredCents = recoveries.reduce((s, r) => s + r.amount_cents, 0);
    const allDays = records.map((r) => r.daysToRecover).filter((d): d is number => d !== null && d >= 0);
    const avgDays =
      allDays.length > 0 ? Math.round(allDays.reduce((a, b) => a + b, 0) / allDays.length) : null;

    return {
      asOf: new Date().toISOString(),
      totalRecoveredCents,
      totalBilledCents,
      returnRatePct: totalBilledCents > 0 ? (totalRecoveredCents / totalBilledCents) * 100 : 0,
      avgDaysToRecover: avgDays,
      medianDaysToRecover: median(allDays),
      recordCount: recoveries.length,
      factoryCount: byFactory.filter((f) => f.count > 0).length,
      uniqueCustomers: byCustomer.filter((c) => c.customerName !== "—").length,
      byFactory,
      byMonth,
      byCustomer,
      records,
    };
  });
