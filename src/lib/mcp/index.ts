import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listFactoriesTool from "./tools/list-factories";
import getDashboardSummaryTool from "./tools/get-dashboard-summary";
import listRecentEntriesTool from "./tools/list-recent-entries";

// Use the direct Supabase host as issuer — the .lovable.cloud proxy is
// rejected by mcp-js (RFC 8414 issuer mismatch). VITE_SUPABASE_PROJECT_ID
// is inlined at build time by Vite.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "faturamento-vendas-mcp",
  title: "Faturamento & Vendas",
  version: "0.1.0",
  instructions:
    "Tools to read factory, sales and billing data for the signed-in user. Use `list_factories` to discover factories, `get_dashboard_summary` for current-month totals vs. goals, and `list_recent_entries` for recent sales or billing entries.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listFactoriesTool, getDashboardSummaryTool, listRecentEntriesTool],
});
