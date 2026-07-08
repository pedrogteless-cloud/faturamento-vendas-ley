import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Dados brutos para montar o relatório Excel. A construção da planilha (abas,
// formatação) acontece no cliente. Restrito a admin via lógica + RLS.

export type ReportEntry = {
  reference_date: string;
  factory_id: string;
  amount_cents: number;
  note: string | null;
  channel?: string | null;
  created_by: string | null;
  created_at: string;
};

export type ReportAdjustment = {
  factory_id: string;
  amount_cents: number;
  reason: string;
  reference_date: string | null;
  note: string;
  original_cents: number | null;
  realized_cents: number | null;
  destination: string | null;
  created_by: string;
  created_at: string;
};

export type ReportData = {
  factories: { id: string; name: string; state: string; code: string }[];
  goals: {
    factory_id: string;
    year: number;
    month: number;
    billing_goal_cents: number;
    sales_goal_cents: number;
  }[];
  sales: ReportEntry[];
  billing: ReportEntry[];
  adjustments: ReportAdjustment[];
  users: { id: string; name: string }[];
};

const HIGH_LIMIT = 50000;

export const getReportData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(d),
  )
  .handler(async ({ context }): Promise<ReportData> => {
    const { supabase } = context;
    const [factoriesRes, goalsRes, salesRes, billingRes, adjRes, profilesRes] = await Promise.all([
      supabase.from("factories").select("id, name, state, code").order("name"),
      supabase
        .from("goals")
        .select("factory_id, year, month, billing_goal_cents, sales_goal_cents"),
      supabase
        .from("sales_entries")
        .select("reference_date, factory_id, amount_cents, note, channel, created_by, created_at")
        .limit(HIGH_LIMIT),
      supabase
        .from("billing_entries")
        .select("reference_date, factory_id, amount_cents, note, created_by, created_at")
        .limit(HIGH_LIMIT),
      supabase
        .from("carteira_adjustments")
        .select(
          "factory_id, amount_cents, reason, reference_date, note, original_cents, realized_cents, destination, created_by, created_at",
        )
        .limit(HIGH_LIMIT),
      supabase.from("profiles").select("id, full_name, email"),
    ]);

    const err =
      factoriesRes.error ??
      goalsRes.error ??
      salesRes.error ??
      billingRes.error ??
      profilesRes.error;
    if (err) throw new Error(err.message);

    return {
      factories: (factoriesRes.data ?? []) as ReportData["factories"],
      goals: (goalsRes.data ?? []) as ReportData["goals"],
      sales: (salesRes.data ?? []) as ReportEntry[],
      billing: (billingRes.data ?? []) as ReportEntry[],
      // adjustments pode falhar se a tabela ainda não existir — resiliente
      adjustments: (adjRes.error ? [] : (adjRes.data ?? [])) as ReportAdjustment[],
      users: (profilesRes.data ?? []).map(
        (p: { id: string; full_name: string | null; email: string | null }) => ({
          id: p.id,
          name: p.full_name || p.email || "—",
        }),
      ),
    };
  });
