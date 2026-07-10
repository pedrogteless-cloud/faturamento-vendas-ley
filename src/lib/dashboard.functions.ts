import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type FactorySummary = {
  factoryId: string;
  factoryCode: string;
  factoryName: string;
  factoryState: string;
  billingTodayCents: number;
  salesTodayCents: number;
  billingMonthCents: number;
  salesMonthCents: number;
  billingGoalCents: number;
  salesGoalCents: number;
  workdaysElapsed: number;
  workdaysTotal: number;
  calendarConfigured: boolean;
  expectedBillingCents: number;
  expectedSalesCents: number;
  series: { date: string; billing: number; sales: number }[];
  carteiraCents: number;
};

export type DashboardData = {
  asOf: string;
  historical?: boolean;
  asOfDate?: string;
  factories: FactorySummary[];
  consolidated: {
    billingTodayCents: number;
    salesTodayCents: number;
    billingMonthCents: number;
    salesMonthCents: number;
    billingGoalCents: number;
    salesGoalCents: number;
    expectedBillingCents: number;
    expectedSalesCents: number;
    carteiraCents: number;
  };
  pendingToday: { factoryId: string; factoryName: string; missing: ("sales" | "billing")[] }[];
  recentUpdates: {
    id: string;
    entity: string;
    action: string;
    actor: string | null;
    factoryName: string | null;
    createdAt: string;
  }[];
};

function todayInFortaleza(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        asOf: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<DashboardData> => {
    const { supabase } = context;
    const liveToday = todayInFortaleza();
    // Visão histórica: "hoje" passa a ser a data escolhida (nunca no futuro).
    const historical = !!data.asOf && data.asOf < liveToday;
    const today = historical ? data.asOf! : liveToday;
    const [y, m] = today.split("-").map((n) => parseInt(n, 10));
    const pad = (n: number) => String(n).padStart(2, "0");
    const monthStart = `${y}-${pad(m)}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const monthEnd = `${y}-${pad(m)}-${pad(lastDay)}`;

    const [
      factoriesRes,
      salesRes,
      billingRes,
      goalsRes,
      calendarRes,
      recentRes,
      allSalesRes,
      allBillingRes,
      adjustmentsRes,
    ] = await Promise.all([
      supabase.from("factories").select("id, code, name, state").order("name"),
      supabase
        .from("sales_entries")
        .select("factory_id, reference_date, amount_cents")
        .gte("reference_date", monthStart)
        .lte("reference_date", today),
      supabase
        .from("billing_entries")
        .select("factory_id, reference_date, amount_cents")
        .gte("reference_date", monthStart)
        .lte("reference_date", today),
      supabase
        .from("goals")
        .select("factory_id, billing_goal_cents, sales_goal_cents")
        .eq("year", y)
        .eq("month", m),
      supabase
        .from("work_calendar_days")
        .select("factory_id, day, is_workday")
        .gte("day", monthStart)
        .lte("day", monthEnd),
      supabase
        .from("audit_logs")
        .select("id, entity, action, actor_email, after, created_at")
        .in("entity", ["sales_entries", "billing_entries", "goals", "work_calendar_days"])
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("sales_entries")
        .select("factory_id, amount_cents")
        .lte("reference_date", today),
      supabase
        .from("billing_entries")
        .select("factory_id, amount_cents")
        .lte("reference_date", today),
      supabase
        .from("carteira_adjustments")
        .select("factory_id, amount_cents")
        .lte("reference_date", today),
    ]);

    const queryError =
      factoriesRes.error ??
      salesRes.error ??
      billingRes.error ??
      goalsRes.error ??
      calendarRes.error ??
      recentRes.error;
    if (queryError) throw new Error(queryError.message);
    const factories = factoriesRes.data ?? [];

    const salesByFactory = new Map<string, { date: string; cents: number }[]>();
    for (const s of salesRes.data ?? []) {
      const arr = salesByFactory.get(s.factory_id as string) ?? [];
      arr.push({ date: s.reference_date as string, cents: Number(s.amount_cents) });
      salesByFactory.set(s.factory_id as string, arr);
    }
    const billingByFactory = new Map<string, { date: string; cents: number }[]>();
    for (const b of billingRes.data ?? []) {
      const arr = billingByFactory.get(b.factory_id as string) ?? [];
      arr.push({ date: b.reference_date as string, cents: Number(b.amount_cents) });
      billingByFactory.set(b.factory_id as string, arr);
    }
    const allSalesTotalByFactory = new Map<string, number>();
    for (const s of allSalesRes.data ?? []) {
      allSalesTotalByFactory.set(
        s.factory_id as string,
        (allSalesTotalByFactory.get(s.factory_id as string) ?? 0) + Number(s.amount_cents),
      );
    }
    const allBillingTotalByFactory = new Map<string, number>();
    for (const b of allBillingRes.data ?? []) {
      allBillingTotalByFactory.set(
        b.factory_id as string,
        (allBillingTotalByFactory.get(b.factory_id as string) ?? 0) + Number(b.amount_cents),
      );
    }
    // Ajustes administrativos de carteira (assinados). Resiliente: se a tabela
    // ainda não existir, adjustmentsRes.error é ignorado e trata como zero.
    const adjustmentsByFactory = new Map<string, number>();
    for (const a of adjustmentsRes.data ?? []) {
      adjustmentsByFactory.set(
        a.factory_id as string,
        (adjustmentsByFactory.get(a.factory_id as string) ?? 0) + Number(a.amount_cents),
      );
    }
    const goalsByFactory = new Map<string, { b: number; s: number }>();
    for (const g of goalsRes.data ?? []) {
      goalsByFactory.set(g.factory_id as string, {
        b: Number(g.billing_goal_cents),
        s: Number(g.sales_goal_cents),
      });
    }
    const calendarByFactory = new Map<string, Map<string, boolean>>();
    for (const c of calendarRes.data ?? []) {
      const map = calendarByFactory.get(c.factory_id as string) ?? new Map();
      map.set(c.day as string, c.is_workday as boolean);
      calendarByFactory.set(c.factory_id as string, map);
    }

    function workdaysFor(factoryId: string): {
      elapsed: number;
      total: number;
      configured: boolean;
    } {
      const map = calendarByFactory.get(factoryId);
      // Fallback: seg-sex se calendário não configurado
      let elapsed = 0;
      let total = 0;
      for (let d = 1; d <= lastDay; d++) {
        const iso = `${y}-${pad(m)}-${pad(d)}`;
        const dow = new Date(`${iso}T12:00:00`).getDay();
        const defaultIsWorkday = dow >= 1 && dow <= 5;
        const isWork = map?.has(iso) ? map.get(iso)! : defaultIsWorkday;
        if (isWork) {
          total++;
          if (iso <= today) elapsed++;
        }
      }
      return { elapsed, total, configured: !!map?.size };
    }

    const factorySummaries: FactorySummary[] = factories.map((f) => {
      const sales = salesByFactory.get(f.id) ?? [];
      const billing = billingByFactory.get(f.id) ?? [];
      const goals = goalsByFactory.get(f.id) ?? { b: 0, s: 0 };
      const { elapsed, total, configured } = workdaysFor(f.id);

      const billingMonth = billing.reduce((acc, e) => acc + e.cents, 0);
      const salesMonth = sales.reduce((acc, e) => acc + e.cents, 0);
      const billingToday = billing.find((e) => e.date === today)?.cents ?? 0;
      const salesToday = sales.find((e) => e.date === today)?.cents ?? 0;

      const ratio = total > 0 ? elapsed / total : 0;

      // Série acumulada do mês. Assim o gráfico representa evolução real,
      // em vez de oscilar apenas com o valor isolado de cada dia.
      const series: { date: string; billing: number; sales: number }[] = [];
      let cumulativeBilling = 0;
      let cumulativeSales = 0;
      for (let d = 1; d <= lastDay; d++) {
        const iso = `${y}-${pad(m)}-${pad(d)}`;
        if (iso > today) break;
        const b = billing.find((e) => e.date === iso)?.cents ?? 0;
        const s = sales.find((e) => e.date === iso)?.cents ?? 0;
        cumulativeBilling += b;
        cumulativeSales += s;
        series.push({ date: iso, billing: cumulativeBilling, sales: cumulativeSales });
      }

      return {
        factoryId: f.id,
        factoryCode: f.code,
        factoryName: f.name,
        factoryState: f.state,
        billingTodayCents: billingToday,
        salesTodayCents: salesToday,
        billingMonthCents: billingMonth,
        salesMonthCents: salesMonth,
        billingGoalCents: goals.b,
        salesGoalCents: goals.s,
        workdaysElapsed: elapsed,
        workdaysTotal: total,
        calendarConfigured: configured,
        expectedBillingCents: Math.round(goals.b * ratio),
        expectedSalesCents: Math.round(goals.s * ratio),
        series,
        carteiraCents:
          (allSalesTotalByFactory.get(f.id) ?? 0) -
          (allBillingTotalByFactory.get(f.id) ?? 0) +
          (adjustmentsByFactory.get(f.id) ?? 0),
      };
    });

    // Consolidado — soma absoluta, nunca média de percentuais
    const consolidated = factorySummaries.reduce(
      (acc, f) => ({
        billingTodayCents: acc.billingTodayCents + f.billingTodayCents,
        salesTodayCents: acc.salesTodayCents + f.salesTodayCents,
        billingMonthCents: acc.billingMonthCents + f.billingMonthCents,
        salesMonthCents: acc.salesMonthCents + f.salesMonthCents,
        billingGoalCents: acc.billingGoalCents + f.billingGoalCents,
        salesGoalCents: acc.salesGoalCents + f.salesGoalCents,
        expectedBillingCents: acc.expectedBillingCents + f.expectedBillingCents,
        expectedSalesCents: acc.expectedSalesCents + f.expectedSalesCents,
        carteiraCents: acc.carteiraCents + f.carteiraCents,
      }),
      {
        billingTodayCents: 0,
        salesTodayCents: 0,
        billingMonthCents: 0,
        salesMonthCents: 0,
        billingGoalCents: 0,
        salesGoalCents: 0,
        expectedBillingCents: 0,
        expectedSalesCents: 0,
        carteiraCents: 0,
      },
    );

    // Pendências de hoje (se for dia útil para a fábrica)
    const pendingToday: DashboardData["pendingToday"] = [];
    for (const f of factorySummaries) {
      const map = calendarByFactory.get(f.factoryId);
      const dow = new Date(`${today}T12:00:00`).getDay();
      const defaultIsWorkday = dow >= 1 && dow <= 5;
      const isWork = map?.has(today) ? map.get(today)! : defaultIsWorkday;
      if (!isWork) continue;
      const missing: ("sales" | "billing")[] = [];
      const hasSalesEntry = (salesByFactory.get(f.factoryId) ?? []).some(
        (entry) => entry.date === today,
      );
      const hasBillingEntry = (billingByFactory.get(f.factoryId) ?? []).some(
        (entry) => entry.date === today,
      );
      if (!hasSalesEntry) missing.push("sales");
      if (!hasBillingEntry) missing.push("billing");
      if (missing.length > 0) {
        pendingToday.push({
          factoryId: f.factoryId,
          factoryName: `${f.factoryName} · ${f.factoryState}`,
          missing,
        });
      }
    }

    const factoryNameById = new Map(factories.map((f) => [f.id, `${f.name} · ${f.state}`]));
    const recentUpdates = (recentRes.data ?? []).map((r) => {
      const after = (r.after ?? {}) as { factory_id?: string };
      return {
        id: r.id as string,
        entity: r.entity as string,
        action: r.action as string,
        actor: (r.actor_email as string | null) ?? null,
        factoryName: after.factory_id ? (factoryNameById.get(after.factory_id) ?? null) : null,
        createdAt: r.created_at as string,
      };
    });

    return {
      // Em visão histórica, asOf reflete a data escolhida (meio-dia Fortaleza)
      // para que rótulos de mês/período fiquem corretos.
      asOf: historical ? `${today}T12:00:00-03:00` : new Date().toISOString(),
      historical,
      asOfDate: today,
      factories: factorySummaries,
      consolidated,
      pendingToday,
      recentUpdates,
    };
  });
