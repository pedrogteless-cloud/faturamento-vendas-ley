import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function todayInFortaleza(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default defineTool({
  name: "get_dashboard_summary",
  title: "Get dashboard summary",
  description:
    "Return current-month billing and sales totals per factory (in BRL cents), plus monthly goals, for the signed-in user's accessible factories.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };

    const supabase = supabaseForUser(ctx);
    const today = todayInFortaleza();
    const [y, m] = today.split("-");
    const monthStart = `${y}-${m}-01`;

    const [factoriesRes, salesRes, billingRes, goalsRes] = await Promise.all([
      supabase.from("factories").select("id, code, name, state").order("name"),
      supabase
        .from("sales_entries")
        .select("factory_id, amount_cents, entry_date")
        .gte("entry_date", monthStart)
        .lte("entry_date", today),
      supabase
        .from("billing_entries")
        .select("factory_id, amount_cents, entry_date")
        .gte("entry_date", monthStart)
        .lte("entry_date", today),
      supabase
        .from("monthly_goals")
        .select("factory_id, sales_goal_cents, billing_goal_cents, year, month")
        .eq("year", Number(y))
        .eq("month", Number(m)),
    ]);

    for (const r of [factoriesRes, salesRes, billingRes, goalsRes]) {
      if (r.error) return { content: [{ type: "text", text: r.error.message }], isError: true };
    }

    const factories = factoriesRes.data ?? [];
    const summary = factories.map((f) => {
      const salesMonth = (salesRes.data ?? [])
        .filter((e) => e.factory_id === f.id)
        .reduce((s, e) => s + (e.amount_cents ?? 0), 0);
      const billingMonth = (billingRes.data ?? [])
        .filter((e) => e.factory_id === f.id)
        .reduce((s, e) => s + (e.amount_cents ?? 0), 0);
      const goal = (goalsRes.data ?? []).find((g) => g.factory_id === f.id);
      return {
        factoryId: f.id,
        code: f.code,
        name: f.name,
        state: f.state,
        salesMonthCents: salesMonth,
        billingMonthCents: billingMonth,
        salesGoalCents: goal?.sales_goal_cents ?? 0,
        billingGoalCents: goal?.billing_goal_cents ?? 0,
      };
    });

    const payload = { asOf: today, factories: summary };
    return {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      structuredContent: payload,
    };
  },
});
