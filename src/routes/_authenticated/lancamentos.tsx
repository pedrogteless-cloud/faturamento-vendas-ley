import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listFactories } from "@/lib/factories.functions";
import { listEntries, upsertEntry } from "@/lib/entries.functions";
import { getSessionContext } from "@/lib/session.functions";
import { centsToBRL, formatDateBR, todayISO } from "@/lib/format";
import { canRegisterBilling, canRegisterSales } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/lancamentos")({
  head: () => ({ meta: [{ title: "Lançamentos — Ley Colchões" }] }),
  component: EntriesPage,
});

function formatAmountMask(cents: number): string {
  if (!cents) return "";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function EntriesPage() {
  const [type, setType] = useState<"sales" | "billing">("sales");
  const fetchFactories = useServerFn(listFactories);
  const fetchSession = useServerFn(getSessionContext);
  const fetchEntries = useServerFn(listEntries);
  const submitEntry = useServerFn(upsertEntry);
  const qc = useQueryClient();

  const factoriesQuery = useQuery({ queryKey: ["factories"], queryFn: () => fetchFactories() });
  const sessionQuery = useQuery({ queryKey: ["session-context"], queryFn: () => fetchSession() });
  const entriesQuery = useQuery({
    queryKey: ["entries", type],
    queryFn: () => fetchEntries({ data: { type, limit: 60 } }),
  });

  const factories = factoriesQuery.data ?? [];
  const userFactoryIds = useMemo(
    () => new Set(sessionQuery.data?.factoryIds ?? []),
    [sessionQuery.data],
  );
  const accessibleFactories = factories.filter(
    (f) =>
      sessionQuery.data?.roles.includes("admin") ||
      sessionQuery.data?.roles.includes("diretoria") ||
      sessionQuery.data?.roles.includes("gerente_comercial") ||
      userFactoryIds.has(f.id),
  );

  const canSales = canRegisterSales(sessionQuery.data ?? null);
  const canBilling = canRegisterBilling(sessionQuery.data ?? null);
  const canSubmit = type === "sales" ? canSales : canBilling;

  const [factoryId, setFactoryId] = useState<string>("");
  const [date, setDate] = useState<string>(todayISO());
  const [amountCents, setAmountCents] = useState<number>(0);
  const [note, setNote] = useState<string>("");

  const mutation = useMutation({
    mutationFn: async () => {
      if (!factoryId) throw new Error("Selecione a fábrica.");
      if (date > todayISO()) throw new Error("A data do lançamento não pode ser no futuro.");
      return submitEntry({
        data: {
          type,
          factoryId,
          referenceDate: date,
          amountCents,
          note: note || null,
        },
      });
    },
    onSuccess: (res) => {
      toast.success(res.updated ? "Lançamento atualizado." : "Lançamento registrado.");
      setAmountCents(0);
      setNote("");
      qc.invalidateQueries({ queryKey: ["entries", type] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">Lançamentos</h1>
        <p className="text-xs text-muted-foreground">
          Registre vendas e faturamento por fábrica e data.
        </p>
      </header>

      <div className="mb-4 inline-flex rounded-xl border border-border-subtle bg-surface p-1 text-sm">
        <button
          onClick={() => setType("sales")}
          className={`rounded-lg px-3 py-1.5 ${type === "sales" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          Vendas
        </button>
        <button
          onClick={() => setType("billing")}
          className={`rounded-lg px-3 py-1.5 ${type === "billing" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          Faturamento
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-border-subtle bg-surface p-5">
          <h2 className="mb-4 text-sm font-semibold">
            Novo lançamento de {type === "sales" ? "vendas" : "faturamento"}
          </h2>
          {!canSubmit ? (
            <p className="text-xs text-muted-foreground">
              Você não tem permissão para lançar {type === "sales" ? "vendas" : "faturamento"}.
            </p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                mutation.mutate();
              }}
              className="space-y-3"
            >
              <Field label="Fábrica">
                <select
                  className="input-field"
                  value={factoryId}
                  onChange={(e) => setFactoryId(e.target.value)}
                  required
                >
                  <option value="">Selecione…</option>
                  {accessibleFactories.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} · {f.state}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Data">
                <input
                  type="date"
                  className="input-field"
                  value={date}
                  max={todayISO()}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </Field>
              <Field label="Valor (R$)">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0,00"
                  className="input-field tabular"
                  value={formatAmountMask(amountCents)}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "");
                    setAmountCents(digits ? parseInt(digits, 10) : 0);
                  }}
                  required
                />
              </Field>
              <Field label="Observação">
                <input
                  type="text"
                  className="input-field"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="opcional"
                />
              </Field>
              <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Se já existir um lançamento para esta fábrica e data, ele será atualizado e
                auditado.
              </p>
              <button type="submit" disabled={mutation.isPending} className="btn-primary w-full">
                {mutation.isPending ? "Salvando…" : "Salvar"}
              </button>
            </form>
          )}
        </section>

        <section className="rounded-2xl border border-border-subtle bg-surface">
          <header className="border-b border-border-subtle px-5 py-3 text-sm font-semibold">
            Últimos lançamentos
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 text-left">Data</th>
                  <th className="px-5 py-2 text-left">Fábrica</th>
                  <th className="px-5 py-2 text-right">Valor</th>
                  <th className="px-5 py-2 text-left">Observação</th>
                </tr>
              </thead>
              <tbody>
                {(entriesQuery.data ?? []).map((row) => {
                  const fac = factories.find((f) => f.id === row.factory_id);
                  return (
                    <tr key={row.id} className="border-t border-border-subtle/40">
                      <td className="px-5 py-2 tabular">{formatDateBR(row.reference_date)}</td>
                      <td className="px-5 py-2">{fac ? `${fac.name} · ${fac.state}` : "—"}</td>
                      <td className="px-5 py-2 text-right tabular font-medium">
                        {centsToBRL(Number(row.amount_cents))}
                      </td>
                      <td
                        className="max-w-[220px] truncate px-5 py-2 text-muted-foreground"
                        title={row.note ?? undefined}
                      >
                        {row.note ?? "—"}
                      </td>
                    </tr>
                  );
                })}
                {entriesQuery.data?.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-xs text-muted-foreground">
                      Nenhum lançamento.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
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
