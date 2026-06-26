import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listFactories } from "@/lib/factories.functions";
import { listGoals, upsertGoal } from "@/lib/goals.functions";
import { getSessionContext } from "@/lib/session.functions";
import { brlInputToCents, centsToBRL, centsToBRLInput } from "@/lib/format";
import { canManageGoals } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/metas")({
  head: () => ({ meta: [{ title: "Metas — Ley Colchões" }] }),
  component: GoalsPage,
});

function GoalsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const fetchFactories = useServerFn(listFactories);
  const fetchGoals = useServerFn(listGoals);
  const fetchSession = useServerFn(getSessionContext);
  const saveGoal = useServerFn(upsertGoal);
  const qc = useQueryClient();

  const factoriesQuery = useQuery({ queryKey: ["factories"], queryFn: () => fetchFactories() });
  const sessionQuery = useQuery({ queryKey: ["session-context"], queryFn: () => fetchSession() });
  const goalsQuery = useQuery({
    queryKey: ["goals", year, month],
    queryFn: () => fetchGoals({ data: { year, month } }),
  });

  const canManage = canManageGoals(sessionQuery.data ?? null);

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">Metas mensais</h1>
          <p className="text-xs text-muted-foreground">
            Defina meta de faturamento e meta de vendas para cada fábrica.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <select
            className="input-field !w-auto"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {String(m).padStart(2, "0")}
              </option>
            ))}
          </select>
          <select
            className="input-field !w-auto"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {[year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {(factoriesQuery.data ?? []).map((f) => {
          const existing = (goalsQuery.data ?? []).find((g) => g.factory_id === f.id);
          return (
            <GoalCard
              key={f.id}
              factoryName={`${f.name} · ${f.state}`}
              factoryId={f.id}
              billingCents={Number(existing?.billing_goal_cents ?? 0)}
              salesCents={Number(existing?.sales_goal_cents ?? 0)}
              canManage={canManage}
              onSave={async (b, s) => {
                try {
                  await saveGoal({
                    data: { factoryId: f.id, year, month, billingGoalCents: b, salesGoalCents: s },
                  });
                  toast.success("Meta salva.");
                  qc.invalidateQueries({ queryKey: ["goals", year, month] });
                  qc.invalidateQueries({ queryKey: ["dashboard"] });
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function GoalCard({
  factoryName,
  factoryId,
  billingCents,
  salesCents,
  canManage,
  onSave,
}: {
  factoryName: string;
  factoryId: string;
  billingCents: number;
  salesCents: number;
  canManage: boolean;
  onSave: (billingCents: number, salesCents: number) => void | Promise<void>;
}) {
  const [billing, setBilling] = useState(centsToBRLInput(billingCents));
  const [sales, setSales] = useState(centsToBRLInput(salesCents));
  useEffect(() => {
    setBilling(centsToBRLInput(billingCents));
  }, [billingCents]);
  useEffect(() => {
    setSales(centsToBRLInput(salesCents));
  }, [salesCents]);
  void factoryId;

  return (
    <section className="rounded-2xl border border-border-subtle bg-surface p-5">
      <h3 className="text-sm font-semibold">{factoryName}</h3>
      <div className="mt-4 space-y-3">
        <Field label="Meta mensal de faturamento (R$)">
          <input
            type="text"
            inputMode="decimal"
            className="input-field tabular"
            value={billing}
            onChange={(e) => setBilling(e.target.value)}
            disabled={!canManage}
          />
          <span className="block pt-1 text-[11px] text-muted-foreground">
            Atual: {centsToBRL(billingCents)}
          </span>
        </Field>
        <Field label="Meta mensal de vendas (R$)">
          <input
            type="text"
            inputMode="decimal"
            className="input-field tabular"
            value={sales}
            onChange={(e) => setSales(e.target.value)}
            disabled={!canManage}
          />
          <span className="block pt-1 text-[11px] text-muted-foreground">
            Atual: {centsToBRL(salesCents)}
          </span>
        </Field>
        {canManage && (
          <button
            type="button"
            className="btn-primary w-full"
            onClick={() => onSave(brlInputToCents(billing), brlInputToCents(sales))}
          >
            Salvar
          </button>
        )}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
