import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listFactories } from "@/lib/factories.functions";
import { listEntries, upsertEntry } from "@/lib/entries.functions";
import {
  listReturnedCheckRecoveries,
  recordReturnedCheckRecovery,
} from "@/lib/returned-checks.functions";
import { getSessionContext } from "@/lib/session.functions";
import { brlInputToCents, centsToBRL, formatDateBR, todayISO } from "@/lib/format";
import {
  canRegisterBilling,
  canRegisterReturnedCheckRecovery,
  canRegisterSales,
} from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/lancamentos")({
  head: () => ({ meta: [{ title: "Lançamentos — Ley Colchões" }] }),
  component: EntriesPage,
});

type EntryMode = "sales" | "billing" | "returned-check";

const ENTRY_MODES: { value: EntryMode; label: string }[] = [
  { value: "sales", label: "Vendas" },
  { value: "billing", label: "Faturamento" },
  { value: "returned-check", label: "Cheques recuperados" },
];

function EntriesPage() {
  const [mode, setMode] = useState<EntryMode>("sales");
  const fetchFactories = useServerFn(listFactories);
  const fetchSession = useServerFn(getSessionContext);
  const fetchEntries = useServerFn(listEntries);
  const fetchReturnedChecks = useServerFn(listReturnedCheckRecoveries);
  const submitEntry = useServerFn(upsertEntry);
  const submitReturnedCheck = useServerFn(recordReturnedCheckRecovery);
  const qc = useQueryClient();

  const factoriesQuery = useQuery({ queryKey: ["factories"], queryFn: () => fetchFactories() });
  const sessionQuery = useQuery({ queryKey: ["session-context"], queryFn: () => fetchSession() });
  const entriesQuery = useQuery({
    queryKey: ["entries", mode],
    queryFn: () => {
      if (mode === "returned-check") return Promise.resolve([]);
      return fetchEntries({ data: { type: mode, limit: 60 } });
    },
    enabled: mode !== "returned-check",
  });
  const returnedChecksQuery = useQuery({
    queryKey: ["returned-check-recoveries", "latest"],
    queryFn: () => fetchReturnedChecks({ data: { limit: 60 } }),
    enabled: mode === "returned-check",
  });

  const factories = useMemo(() => factoriesQuery.data ?? [], [factoriesQuery.data]);
  const factoryById = useMemo(() => new Map(factories.map((f) => [f.id, f])), [factories]);
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
  const canReturnedCheck = canRegisterReturnedCheckRecovery(sessionQuery.data ?? null);
  const canSubmit =
    mode === "sales" ? canSales : mode === "billing" ? canBilling : canReturnedCheck;

  const [factoryId, setFactoryId] = useState<string>("");
  const [date, setDate] = useState<string>(todayISO());
  const [returnedDate, setReturnedDate] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [customerName, setCustomerName] = useState<string>("");
  const [checkReference, setCheckReference] = useState<string>("");
  const [note, setNote] = useState<string>("");

  const mutation = useMutation({
    mutationFn: async () => {
      const cents = brlInputToCents(amount);
      if (cents <= 0) throw new Error("Informe um valor maior que zero.");
      if (!factoryId) throw new Error("Selecione a fábrica.");

      if (mode === "returned-check") {
        return submitReturnedCheck({
          data: {
            factoryId,
            recoveredDate: date,
            returnedDate: returnedDate || null,
            amountCents: cents,
            customerName: customerName || null,
            checkReference: checkReference || null,
            note: note || null,
          },
        });
      }

      return submitEntry({
        data: {
          type: mode,
          factoryId,
          referenceDate: date,
          amountCents: cents,
          note: note || null,
        },
      });
    },
    onSuccess: (res) => {
      if (mode === "returned-check") {
        toast.success("Cheque recuperado registrado.");
        qc.invalidateQueries({ queryKey: ["returned-check-recoveries"] });
      } else {
        toast.success(
          "updated" in res && res.updated ? "Lançamento atualizado." : "Lançamento registrado.",
        );
        qc.invalidateQueries({ queryKey: ["entries", mode] });
      }
      setAmount("");
      setReturnedDate("");
      setCustomerName("");
      setCheckReference("");
      setNote("");
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const formTitle =
    mode === "returned-check"
      ? "Novo cheque recuperado"
      : `Novo lançamento de ${mode === "sales" ? "vendas" : "faturamento"}`;
  const noPermissionLabel =
    mode === "returned-check" ? "cheques recuperados" : mode === "sales" ? "vendas" : "faturamento";

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">Lançamentos</h1>
        <p className="text-xs text-muted-foreground">
          Registre vendas, faturamento e cheques recuperados por fábrica.
        </p>
      </header>

      <div className="mb-4 inline-flex flex-wrap rounded-xl border border-border-subtle bg-surface p-1 text-sm">
        {ENTRY_MODES.map((item) => (
          <button
            key={item.value}
            onClick={() => setMode(item.value)}
            className={`rounded-lg px-3 py-1.5 ${mode === item.value ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-border-subtle bg-surface p-5">
          <h2 className="mb-4 text-sm font-semibold">{formTitle}</h2>
          {!canSubmit ? (
            <p className="text-xs text-muted-foreground">
              Você não tem permissão para lançar {noPermissionLabel}.
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
              <Field label={mode === "returned-check" ? "Data da recuperação" : "Data"}>
                <input
                  type="date"
                  className="input-field"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </Field>
              <Field label={mode === "returned-check" ? "Valor recuperado (R$)" : "Valor (R$)"}>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  className="input-field tabular"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </Field>
              {mode === "returned-check" && (
                <>
                  <Field label="Cliente / emitente">
                    <input
                      type="text"
                      className="input-field"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="opcional"
                    />
                  </Field>
                  <Field label="Nº cheque / documento">
                    <input
                      type="text"
                      className="input-field"
                      value={checkReference}
                      onChange={(e) => setCheckReference(e.target.value)}
                      placeholder="opcional"
                    />
                  </Field>
                  <Field label="Data da devolução">
                    <input
                      type="date"
                      className="input-field"
                      value={returnedDate}
                      onChange={(e) => setReturnedDate(e.target.value)}
                    />
                  </Field>
                </>
              )}
              <Field label="Observação">
                <input
                  type="text"
                  className="input-field"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="opcional"
                />
              </Field>
              <button type="submit" disabled={mutation.isPending} className="btn-primary w-full">
                {mutation.isPending ? "Salvando…" : "Salvar"}
              </button>
              {mode !== "returned-check" && (
                <p className="text-[11px] text-muted-foreground">
                  Se já existir um lançamento para esta fábrica e data, ele será atualizado e
                  auditado.
                </p>
              )}
            </form>
          )}
        </section>

        <section className="rounded-2xl border border-border-subtle bg-surface">
          <header className="border-b border-border-subtle px-5 py-3 text-sm font-semibold">
            {mode === "returned-check" ? "Últimos cheques recuperados" : "Últimos lançamentos"}
          </header>
          <div className="overflow-x-auto">
            {mode === "returned-check" ? (
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-5 py-2 text-left">Recuperação</th>
                    <th className="px-5 py-2 text-left">Fábrica</th>
                    <th className="px-5 py-2 text-right">Valor</th>
                    <th className="px-5 py-2 text-left">Status</th>
                    <th className="px-5 py-2 text-left">Identificação</th>
                    <th className="px-5 py-2 text-left">Devolução</th>
                    <th className="px-5 py-2 text-left">Observação</th>
                  </tr>
                </thead>
                <tbody>
                  {(returnedChecksQuery.data ?? []).map((row) => {
                    const fac = factoryById.get(row.factory_id);
                    const identity = [row.customer_name, row.check_reference]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <tr key={row.id} className="border-t border-border-subtle/40">
                        <td className="px-5 py-2 tabular">{formatDateBR(row.recovered_date)}</td>
                        <td className="px-5 py-2">{fac ? `${fac.name} · ${fac.state}` : "—"}</td>
                        <td className="px-5 py-2 text-right tabular font-medium">
                          {centsToBRL(Number(row.amount_cents))}
                        </td>
                        <td className="px-5 py-2">
                          <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">
                            Recuperado
                          </span>
                        </td>
                        <td className="px-5 py-2 text-muted-foreground">{identity || "—"}</td>
                        <td className="px-5 py-2 tabular text-muted-foreground">
                          {formatDateBR(row.returned_date)}
                        </td>
                        <td className="px-5 py-2 text-muted-foreground">{row.note ?? "—"}</td>
                      </tr>
                    );
                  })}
                  {returnedChecksQuery.data?.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-5 py-8 text-center text-xs text-muted-foreground"
                      >
                        Nenhum cheque recuperado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
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
                    const fac = factoryById.get(row.factory_id);
                    return (
                      <tr key={row.id} className="border-t border-border-subtle/40">
                        <td className="px-5 py-2 tabular">{formatDateBR(row.reference_date)}</td>
                        <td className="px-5 py-2">{fac ? `${fac.name} · ${fac.state}` : "—"}</td>
                        <td className="px-5 py-2 text-right tabular font-medium">
                          {centsToBRL(Number(row.amount_cents))}
                        </td>
                        <td className="px-5 py-2 text-muted-foreground">{row.note ?? "—"}</td>
                      </tr>
                    );
                  })}
                  {entriesQuery.data?.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-5 py-8 text-center text-xs text-muted-foreground"
                      >
                        Nenhum lançamento.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
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
