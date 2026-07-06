import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_recent_entries",
  title: "List recent sales/billing entries",
  description:
    "List the most recent sales or billing entries (amount in BRL cents) for factories the signed-in user has access to. Filter by kind ('sales' or 'billing') and optional factory_id.",
  inputSchema: {
    kind: z.enum(["sales", "billing"]).describe("Which kind of entry to list."),
    limit: z.number().int().min(1).max(50).default(10).describe("Max rows to return (1-50)."),
    factory_id: z.string().uuid().optional().describe("Optional factory UUID filter."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ kind, limit, factory_id }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const table = kind === "sales" ? "sales_entries" : "billing_entries";
    let query = supabaseForUser(ctx)
      .from(table)
      .select("id, factory_id, amount_cents, entry_date, created_at")
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (factory_id) query = query.eq("factory_id", factory_id);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { entries: data ?? [] },
    };
  },
});
