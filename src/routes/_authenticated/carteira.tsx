import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import {
  createCarteiraAdjustment,
  listCarteiraAdjustments,
  deleteCarteiraAdjustment,
} from "@/lib/carteira.functions";
import { listFactories } from "@/lib/factories.functions";
import { listUsers } from "@/lib/admin-users.functions";
import { getDashboard } from "@/lib/dashboard.functions";
import { getSessionContext } from "@/lib/session.functions";
import { canAccessAdmin } from "@/lib/permissions";
import { centsToBRL, formatDateTimeBR, getErrorMessage } from "@/lib/format";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/carteira")({
  head: () => ({ meta: [{ title: "Ajuste de carteira — Ley Colchões" }] }),
  component: CarteiraPage,
});

function formatAmountMask(cents: number): string {
  if (!cents) return "";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function CarteiraPage() {
  const fetchSession = useServerFn(getSessionContext);
  const fetchFactories = useServerFn(listFactories);
  const fetchDashboard = useServerFn(getDashboard);
  const fetchUsers = useServerFn(listUsers);
  const fetchAdjustments = useServerFn(listCarteiraAdjustments);
  const submitAdjustment = useServerFn(createCarteiraAdjustment);
  const removeAdjustment = useServerFn(deleteCarteiraAdjustment);
  const qc = useQueryClient();

  const sessionQuery = useQuery({ queryKey: ["session-context"], queryFn: () => fetchSession() });
  const isAdmin = canAccessAdmin(sessionQuery.data ?? null);

  const factoriesQuery = useQuery({ queryKey: ["factories"], queryFn: () => fetchFactories() });
  const dashboardQuery = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchDashboard() });
  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: () => fetchUsers(),
    enabled: isAdmin,
  });
  const adjustmentsQuery = useQuery({
    queryKey: ["carteira-adjustments"],
    queryFn: () => fetchAdjustments({ data: {} }),
    enabled: isAdmin,
  });

  const factories = factoriesQuery.data ?? [];
  const [factoryId, setFactoryId] = useState("");
  const [direction, setDirection] = useState<"increase" | "decrease">("decrease");
  const [amountCents, setAmountCents] = useState(0);
  const [note, setNote] = useState("");

  const createMutation = useMutation({
    mutationFn: () => {
      if (!factoryId) throw new Error("Selecione a fábrica.");
      if (amountCents <= 0) throw new Error("Informe um valor maior que zero.");
      if (!note.trim()) throw new Error("Descreva o motivo do ajuste.");
      const signed = direction === "decrease" ? -amountCents : amountCents;
      return submitAdjustment({
        data: { factoryId, amountCents: signed, note: note.trim() },
      });
    },
    onSuccess: () => {
      toast.success("Ajuste de carteira registrado.");
      setAmountCents(0);
      setNote("");
      qc.invalidateQueries({ queryKey: ["carteira-adjustments"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => removeAdjustment({ data: { id } }),
    onSuccess: () => {
      toast.success("Ajuste excluído.");
      qc.invalidateQueries({ queryKey: ["carteira-adjustments"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const factoryName = (id: string) => {
    const f = factories.find((x) => x.id === id);
    return f ? `${f.name} · ${f.state}` : "—";
  };
  const userName = (id: string) => {
    const u = usersQuery.data?.find((x) => x.id === id);
    return u?.full_name || u?.email || "—";
  };

  if (sessionQuery.data && !isAdmin) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <p className="text-sm text-muted-foreground">Esta área é restrita a administradores.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">Ajuste de carteira</h1>
        <p className="text-xs text-muted-foreground">
          Correções e cancelamentos de pedidos alteram a carteira sem lançar venda ou faturamento
          fictício. Todo ajuste fica registrado.
        </p>
      </header>

      {/* Carteira atual por fábrica */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(dashboardQuery.data?.factories ?? []).map((f) => (
          <div key={f.factoryId} className="rounded-xl border border-border-subtle bg-surface p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {f.factoryName} · {f.factoryState}
            </div>
            <div className="tabular mt-1 text-lg font-semibold">
              {centsToBRL(Math.max(0, f.carteiraCents))}
            </div>
            <div className="text-[11px] text-muted-foreground">carteira atual</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-border-subtle bg-surface p-5">
          <h2 className="mb-4 text-sm font-semibold">Novo ajuste</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate();
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
                {factories.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} · {f.state}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tipo de ajuste">
              <select
                className="input-field"
                value={direction}
                onChange={(e) => setDirection(e.target.value as "increase" | "decrease")}
              >
                <option value="decrease">Reduzir carteira (cancelamento, correção)</option>
                <option value="increase">Aumentar carteira (correção)</option>
              </select>
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
            <Field label="Motivo">
              <input
                type="text"
                className="input-field"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex: cancelamento do pedido #123"
                maxLength={500}
                required
              />
            </Field>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="btn-primary w-full"
            >
              {createMutation.isPending ? "Salvando…" : "Registrar ajuste"}
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-border-subtle bg-surface">
          <header className="border-b border-border-subtle px-5 py-3 text-sm font-semibold">
            Ajustes registrados
          </header>
          {adjustmentsQuery.isLoading ? (
            <div className="space-y-px p-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-9 animate-pulse rounded-lg bg-muted/40" />
              ))}
            </div>
          ) : (adjustmentsQuery.data ?? []).length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              Nenhum ajuste registrado ainda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-5 py-2 text-left">Data</th>
                    <th className="px-5 py-2 text-left">Fábrica</th>
                    <th className="px-5 py-2 text-right">Valor</th>
                    <th className="px-5 py-2 text-left">Motivo</th>
                    <th className="px-5 py-2 text-left">Autor</th>
                    <th className="px-5 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {(adjustmentsQuery.data ?? []).map((row) => (
                    <tr key={row.id} className="border-t border-border-subtle/40">
                      <td className="px-5 py-2 text-xs text-muted-foreground">
                        {formatDateTimeBR(row.created_at)}
                      </td>
                      <td className="px-5 py-2">{factoryName(row.factory_id)}</td>
                      <td
                        className={`px-5 py-2 text-right tabular font-medium ${row.amount_cents < 0 ? "text-destructive" : "text-success"}`}
                      >
                        {row.amount_cents < 0 ? "−" : "+"}
                        {centsToBRL(Math.abs(Number(row.amount_cents)))}
                      </td>
                      <td
                        className="max-w-[220px] truncate px-5 py-2 text-muted-foreground"
                        title={row.note}
                      >
                        {row.note}
                      </td>
                      <td className="px-5 py-2 text-xs text-muted-foreground">
                        {userName(row.created_by)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button
                              type="button"
                              className="rounded p-1 text-muted-foreground hover:text-destructive"
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir ajuste?</AlertDialogTitle>
                              <AlertDialogDescription>
                                {factoryName(row.factory_id)} — {row.amount_cents < 0 ? "−" : "+"}
                                {centsToBRL(Math.abs(Number(row.amount_cents)))} — {row.note}. A
                                carteira volta ao valor anterior a este ajuste.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteMutation.mutate(row.id)}>
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
