import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Trash2, ArrowLeftRight } from "lucide-react";
import {
  createCarteiraAdjustment,
  listCarteiraAdjustments,
  deleteCarteiraAdjustment,
  reconcileCarteira,
  REASON_LABEL,
  type AdjustmentReason,
  type CarteiraAdjustment,
} from "@/lib/carteira.functions";
import { listFactories } from "@/lib/factories.functions";
import { listUsers } from "@/lib/admin-users.functions";
import { getDashboard } from "@/lib/dashboard.functions";
import { getSessionContext } from "@/lib/session.functions";
import { canAccessAdmin } from "@/lib/permissions";
import {
  centsToBRL,
  formatDateBR,
  formatDateTimeBR,
  getErrorMessage,
  todayISO,
} from "@/lib/format";
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
  head: () => ({ meta: [{ title: "Carteira — Ley Colchões" }] }),
  component: CarteiraPage,
});

// Acima deste valor, o ajuste exige confirmação reforçada.
const DOUBLE_CONFIRM_CENTS = 5_000_000_00; // R$ 50.000,00

function mask(cents: number): string {
  if (!cents) return "";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
function parseMask(raw: string): number {
  const digits = raw.replace(/\D/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

const REASON_BADGE: Record<AdjustmentReason, string> = {
  cancelamento: "bg-destructive/15 text-destructive ring-destructive/30",
  repasse: "bg-warning/15 text-warning ring-warning/30",
  devolucao: "bg-destructive/15 text-destructive ring-destructive/30",
  correcao: "bg-primary/15 text-primary ring-primary/30",
  conciliacao: "bg-success/15 text-success ring-success/30",
};

function CarteiraPage() {
  const fetchSession = useServerFn(getSessionContext);
  const fetchFactories = useServerFn(listFactories);
  const fetchDashboard = useServerFn(getDashboard);
  const fetchUsers = useServerFn(listUsers);
  const fetchAdjustments = useServerFn(listCarteiraAdjustments);
  const submitAdjustment = useServerFn(createCarteiraAdjustment);
  const removeAdjustment = useServerFn(deleteCarteiraAdjustment);
  const submitReconcile = useServerFn(reconcileCarteira);
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

  // Formulário de ajuste
  const [factoryId, setFactoryId] = useState("");
  const [reason, setReason] = useState<Exclude<AdjustmentReason, "conciliacao">>("cancelamento");
  const [referenceDate, setReferenceDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [direction, setDirection] = useState<"decrease" | "increase">("decrease");
  const [amountCents, setAmountCents] = useState(0);
  // Repasse
  const [originalCents, setOriginalCents] = useState(0);
  const [realizedCents, setRealizedCents] = useState(0);
  const [destKind, setDestKind] = useState<"distribuidora" | "cliente">("distribuidora");
  const [destName, setDestName] = useState("");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const isRepasse = reason === "repasse";
  const discountCents = Math.max(0, originalCents - realizedCents);
  const impactCents = isRepasse
    ? -discountCents
    : reason === "correcao"
      ? direction === "decrease"
        ? -amountCents
        : amountCents
      : -amountCents; // cancelamento / devolução sempre reduzem

  function resetForm() {
    setAmountCents(0);
    setOriginalCents(0);
    setRealizedCents(0);
    setDestName("");
    setNote("");
  }

  function validate(): string | null {
    if (!factoryId) return "Selecione a fábrica.";
    if (!note.trim()) return "Descreva o motivo.";
    if (isRepasse) {
      if (originalCents <= 0) return "Informe o valor original do pedido.";
      if (realizedCents > originalCents)
        return "O valor realizado não pode ser maior que o original.";
      if (discountCents === 0) return "Repasse sem desconto não altera a carteira.";
    } else if (amountCents <= 0) {
      return "Informe um valor maior que zero.";
    }
    return null;
  }

  const createMutation = useMutation({
    mutationFn: () => {
      if (!factoryId) throw new Error("Selecione a fábrica.");
      if (!note.trim()) throw new Error("Descreva o motivo.");
      if (isRepasse) {
        if (originalCents <= 0) throw new Error("Informe o valor original do pedido.");
        if (realizedCents > originalCents)
          throw new Error("O valor realizado não pode ser maior que o original.");
        return submitAdjustment({
          data: {
            factoryId,
            reason: "repasse",
            referenceDate,
            note: note.trim(),
            originalCents,
            realizedCents,
            destination:
              destKind === "distribuidora" ? "Distribuidora" : destName.trim() || "Outro cliente",
          },
        });
      }
      if (amountCents <= 0) throw new Error("Informe um valor maior que zero.");
      return submitAdjustment({
        data: { factoryId, reason, referenceDate, note: note.trim(), amountCents: impactCents },
      });
    },
    onSuccess: () => {
      toast.success("Ajuste registrado.");
      resetForm();
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

  // Insight de repasses
  const repasses = (adjustmentsQuery.data ?? []).filter((a) => a.reason === "repasse");
  const repasseInsight = useMemo(() => {
    const orig = repasses.reduce((s, r) => s + Number(r.original_cents ?? 0), 0);
    const real = repasses.reduce((s, r) => s + Number(r.realized_cents ?? 0), 0);
    const loss = orig - real;
    return { count: repasses.length, orig, real, loss, pct: orig > 0 ? loss / orig : 0 };
  }, [repasses]);

  const bigImpact = Math.abs(impactCents) >= DOUBLE_CONFIRM_CENTS;

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
        <h1 className="text-xl font-semibold">Carteira</h1>
        <p className="text-xs text-muted-foreground">
          Concilie com o ERP e registre cancelamentos, devoluções e repasses sem lançar venda ou
          faturamento fictício. Todo ajuste fica registrado.
        </p>
      </header>

      {/* Conciliação por fábrica */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(dashboardQuery.data?.factories ?? []).map((f) => (
          <ReconcileCard
            key={f.factoryId}
            factoryId={f.factoryId}
            name={`${f.factoryName} · ${f.factoryState}`}
            current={Math.max(0, f.carteiraCents)}
            onReconcile={(erpCents) =>
              submitReconcile({ data: { factoryId: f.factoryId, erpCents } })
            }
            onDone={() => {
              qc.invalidateQueries({ queryKey: ["carteira-adjustments"] });
              qc.invalidateQueries({ queryKey: ["dashboard"] });
            }}
          />
        ))}
      </div>

      {/* Insight de repasses */}
      {repasseInsight.count > 0 && (
        <div className="mb-6 rounded-2xl border border-warning/30 bg-warning/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-warning">
            <ArrowLeftRight className="h-4 w-4" /> Repasses com desconto
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Operações" value={String(repasseInsight.count)} />
            <Metric label="Valor original" value={centsToBRL(repasseInsight.orig)} />
            <Metric label="Realizado" value={centsToBRL(repasseInsight.real)} />
            <Metric
              label="Perda (desconto)"
              value={`${centsToBRL(repasseInsight.loss)} · ${(repasseInsight.pct * 100).toFixed(1)}%`}
              tone="text-destructive"
            />
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
        {/* Formulário */}
        <section className="rounded-2xl border border-border-subtle bg-surface p-5">
          <h2 className="mb-4 text-sm font-semibold">Novo ajuste</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const err = validate();
              if (err) {
                toast.error(err);
                return;
              }
              setConfirmOpen(true);
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

            <Field label="Tipo">
              <select
                className="input-field"
                value={reason}
                onChange={(e) => setReason(e.target.value as typeof reason)}
              >
                <option value="cancelamento">Cancelamento de pedido</option>
                <option value="repasse">Repasse (distribuidora / outro cliente)</option>
                <option value="devolucao">Devolução</option>
                <option value="correcao">Correção</option>
              </select>
            </Field>

            <Field label="Data de referência">
              <input
                type="date"
                className="input-field"
                value={referenceDate}
                max={todayISO()}
                onChange={(e) => setReferenceDate(e.target.value)}
                required
              />
            </Field>

            {isRepasse ? (
              <>
                <Field label="Destino">
                  <select
                    className="input-field"
                    value={destKind}
                    onChange={(e) => setDestKind(e.target.value as typeof destKind)}
                  >
                    <option value="distribuidora">Distribuidora</option>
                    <option value="cliente">Outro cliente</option>
                  </select>
                </Field>
                {destKind === "cliente" && (
                  <Field label="Nome do cliente">
                    <input
                      type="text"
                      className="input-field"
                      value={destName}
                      onChange={(e) => setDestName(e.target.value)}
                      maxLength={200}
                    />
                  </Field>
                )}
                <Field label="Valor original do pedido (R$)">
                  <input
                    type="text"
                    inputMode="numeric"
                    className="input-field tabular"
                    placeholder="0,00"
                    value={mask(originalCents)}
                    onChange={(e) => setOriginalCents(parseMask(e.target.value))}
                    required
                  />
                </Field>
                <Field label="Valor realizado (R$)">
                  <input
                    type="text"
                    inputMode="numeric"
                    className="input-field tabular"
                    placeholder="0,00"
                    value={mask(realizedCents)}
                    onChange={(e) => setRealizedCents(parseMask(e.target.value))}
                    required
                  />
                </Field>
                <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  Desconto:{" "}
                  <span className="font-semibold text-destructive">
                    {centsToBRL(discountCents)}
                  </span>
                  {originalCents > 0 && ` · ${((discountCents / originalCents) * 100).toFixed(1)}%`}
                  . A carteira baixa esse valor. Faturamento e vendas não são alterados.
                </div>
              </>
            ) : (
              <>
                {reason === "correcao" && (
                  <Field label="Direção">
                    <select
                      className="input-field"
                      value={direction}
                      onChange={(e) => setDirection(e.target.value as typeof direction)}
                    >
                      <option value="decrease">Reduzir carteira</option>
                      <option value="increase">Aumentar carteira</option>
                    </select>
                  </Field>
                )}
                <Field label="Valor (R$)">
                  <input
                    type="text"
                    inputMode="numeric"
                    className="input-field tabular"
                    placeholder="0,00"
                    value={mask(amountCents)}
                    onChange={(e) => setAmountCents(parseMask(e.target.value))}
                    required
                  />
                </Field>
              </>
            )}

            <Field label="Motivo">
              <input
                type="text"
                className="input-field"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex: cliente sem espaço para receber"
                maxLength={500}
                required
              />
            </Field>

            <div className="rounded-lg bg-background/50 px-3 py-2 text-xs">
              Impacto na carteira:{" "}
              <span
                className={`font-semibold ${impactCents < 0 ? "text-destructive" : "text-success"}`}
              >
                {impactCents < 0 ? "−" : "+"}
                {centsToBRL(Math.abs(impactCents))}
              </span>
            </div>

            <button
              type="submit"
              disabled={createMutation.isPending}
              className="btn-primary w-full"
            >
              {createMutation.isPending ? "Salvando…" : "Registrar ajuste"}
            </button>
          </form>

          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar ajuste de carteira?</AlertDialogTitle>
                <AlertDialogDescription>
                  Isto vai {impactCents < 0 ? "reduzir" : "aumentar"} a carteira em{" "}
                  {centsToBRL(Math.abs(impactCents))}.
                  {bigImpact && (
                    <span className="mt-2 block font-semibold text-destructive">
                      ⚠️ Valor alto — confira antes de confirmar. A ação fica registrada com seu
                      nome.
                    </span>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Revisar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    setConfirmOpen(false);
                    createMutation.mutate();
                  }}
                >
                  Confirmar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </section>

        {/* Histórico */}
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
                    <th className="px-4 py-2 text-left">Ref.</th>
                    <th className="px-4 py-2 text-left">Fábrica</th>
                    <th className="px-4 py-2 text-left">Tipo</th>
                    <th className="px-4 py-2 text-right">Impacto</th>
                    <th className="px-4 py-2 text-left">Detalhe</th>
                    <th className="px-4 py-2 text-left">Autor</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {(adjustmentsQuery.data ?? []).map((row) => (
                    <AdjustmentRow
                      key={row.id}
                      row={row}
                      factoryLabel={factoryName(row.factory_id)}
                      author={userName(row.created_by)}
                      onDelete={() => deleteMutation.mutate(row.id)}
                      deleting={deleteMutation.isPending}
                    />
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

function ReconcileCard({
  factoryId,
  name,
  current,
  onReconcile,
  onDone,
}: {
  factoryId: string;
  name: string;
  current: number;
  onReconcile: (erpCents: number) => Promise<{ id: string | null; diff: number }>;
  onDone: () => void;
}) {
  const [erp, setErp] = useState(0);
  const mutation = useMutation({
    mutationFn: () => onReconcile(erp),
    onSuccess: (res) => {
      if (res.diff === 0) toast.info("Já estava batendo com o ERP.");
      else toast.success("Carteira conciliada com o ERP.");
      setErp(0);
      onDone();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
  const diff = erp - current;

  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{name}</div>
      <div className="tabular mt-1 text-lg font-semibold">{centsToBRL(current)}</div>
      <div className="text-[11px] text-muted-foreground">carteira atual (software)</div>
      <div className="mt-3 space-y-2">
        <input
          type="text"
          inputMode="numeric"
          className="input-field tabular text-sm"
          placeholder="Carteira no ERP"
          value={mask(erp)}
          onChange={(e) => setErp(parseMask(e.target.value))}
        />
        {erp > 0 && diff !== 0 && (
          <div className="text-[11px] text-muted-foreground">
            Diferença:{" "}
            <span className={`font-semibold ${diff < 0 ? "text-destructive" : "text-success"}`}>
              {diff < 0 ? "−" : "+"}
              {centsToBRL(Math.abs(diff))}
            </span>
          </div>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              disabled={erp <= 0 || diff === 0 || mutation.isPending}
              className="btn-ghost w-full text-xs disabled:opacity-40"
            >
              {mutation.isPending ? "Acertando…" : "Acertar com o ERP"}
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Conciliar {name}?</AlertDialogTitle>
              <AlertDialogDescription>
                A carteira vai de {centsToBRL(current)} para {centsToBRL(erp)} (ajuste de{" "}
                {diff < 0 ? "−" : "+"}
                {centsToBRL(Math.abs(diff))}), registrado como conciliação com o ERP.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => mutation.mutate()}>Acertar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

function AdjustmentRow({
  row,
  factoryLabel,
  author,
  onDelete,
  deleting,
}: {
  row: CarteiraAdjustment;
  factoryLabel: string;
  author: string;
  onDelete: () => void;
  deleting: boolean;
}) {
  const detail =
    row.reason === "repasse" && row.original_cents != null && row.realized_cents != null
      ? `${row.destination ?? "—"}: ${centsToBRL(Number(row.original_cents))} → ${centsToBRL(Number(row.realized_cents))}`
      : row.note;
  return (
    <tr className="border-t border-border-subtle/40">
      <td className="px-4 py-2 tabular text-xs">
        {row.reference_date ? formatDateBR(row.reference_date) : formatDateBR(row.created_at)}
      </td>
      <td className="px-4 py-2">{factoryLabel}</td>
      <td className="px-4 py-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${REASON_BADGE[row.reason]}`}
        >
          {REASON_LABEL[row.reason]}
        </span>
      </td>
      <td
        className={`px-4 py-2 text-right tabular font-medium ${row.amount_cents < 0 ? "text-destructive" : "text-success"}`}
      >
        {row.amount_cents < 0 ? "−" : "+"}
        {centsToBRL(Math.abs(Number(row.amount_cents)))}
      </td>
      <td className="max-w-[240px] truncate px-4 py-2 text-muted-foreground" title={detail}>
        {detail}
      </td>
      <td className="px-4 py-2 text-xs text-muted-foreground">
        {author}
        <div className="text-[10px]">{formatDateTimeBR(row.created_at)}</div>
      </td>
      <td className="px-3 py-2 text-right">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:text-destructive"
              disabled={deleting}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir ajuste?</AlertDialogTitle>
              <AlertDialogDescription>
                {REASON_LABEL[row.reason]} de {centsToBRL(Math.abs(Number(row.amount_cents)))} —{" "}
                {factoryLabel}. A carteira volta ao valor anterior a este ajuste.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete}>Excluir</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </td>
    </tr>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-background/50 p-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`tabular mt-0.5 text-sm font-semibold ${tone ?? ""}`}>{value}</div>
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
