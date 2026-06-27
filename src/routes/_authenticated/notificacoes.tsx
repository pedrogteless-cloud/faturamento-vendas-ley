import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  createDestination,
  deleteDestination,
  listNotifications,
  sendDailySummaryNow,
  sendTestMessage,
  setRuleDestination,
  toggleRule,
  updateDestination,
} from "@/lib/notifications.functions";
import { getSessionContext } from "@/lib/session.functions";
import { canManageNotifications } from "@/lib/permissions";
import { formatDateTimeBR, getErrorMessage } from "@/lib/format";
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

export const Route = createFileRoute("/_authenticated/notificacoes")({
  head: () => ({ meta: [{ title: "Notificações — Ley Colchões" }] }),
  component: NotificationsPage,
});

type Destination = { id: string; name: string; chat_id: string; description: string | null };
type Rule = {
  id: string;
  name: string;
  description: string | null;
  destination_id: string | null;
  schedule_cron: string | null;
  schedule_label: string | null;
  is_active: boolean;
  last_run_at: string | null;
  last_status: string | null;
  next_run_at: string | null;
};

function NotificationsPage() {
  const [tab, setTab] = useState<"rules" | "destinations" | "history">("rules");
  const fetchSession = useServerFn(getSessionContext);
  const fetchData = useServerFn(listNotifications);
  const submitCreate = useServerFn(createDestination);
  const submitUpdate = useServerFn(updateDestination);
  const submitDelete = useServerFn(deleteDestination);
  const submitToggleRule = useServerFn(toggleRule);
  const submitSetRuleDestination = useServerFn(setRuleDestination);
  const submitTest = useServerFn(sendTestMessage);
  const submitDailySummary = useServerFn(sendDailySummaryNow);
  const qc = useQueryClient();

  const sessionQuery = useQuery({ queryKey: ["session-context"], queryFn: () => fetchSession() });
  const query = useQuery({ queryKey: ["notifications"], queryFn: () => fetchData() });
  const data = query.data ?? { rules: [] as Rule[], destinations: [] as Destination[], logs: [] };

  const canManage = canManageNotifications(sessionQuery.data ?? null);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  const ruleDestMutation = useMutation({
    mutationFn: (vars: { id: string; destinationId: string | null }) =>
      submitSetRuleDestination({ data: vars }),
    onSuccess: invalidate,
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const toggleMutation = useMutation({
    mutationFn: (vars: { id: string; isActive: boolean }) => submitToggleRule({ data: vars }),
    onSuccess: () => {
      invalidate();
      toast.success("Regra atualizada.");
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const testMutation = useMutation({
    mutationFn: (vars: { destinationId: string }) => submitTest({ data: vars }),
    onSuccess: () => toast.success("Mensagem de teste enviada."),
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const summaryMutation = useMutation({
    mutationFn: () => submitDailySummary(),
    onSuccess: () => toast.success("Resumo enviado."),
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (vars: { id: string }) => submitDelete({ data: vars }),
    onSuccess: () => {
      invalidate();
      toast.success("Destino removido.");
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Notificações</h1>
        <p className="text-xs text-muted-foreground">
          Alertas e resumo diário enviados pelo bot do Telegram. Cadastre o destino (chat_id) e
          vincule às regras abaixo.
        </p>
      </header>

      <div className="mb-4 inline-flex rounded-xl border border-border-subtle bg-surface p-1 text-sm">
        <button
          onClick={() => setTab("rules")}
          className={`rounded-lg px-3 py-1.5 ${tab === "rules" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          Regras
        </button>
        <button
          onClick={() => setTab("destinations")}
          className={`rounded-lg px-3 py-1.5 ${tab === "destinations" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          Destinos
        </button>
        <button
          onClick={() => setTab("history")}
          className={`rounded-lg px-3 py-1.5 ${tab === "history" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          Histórico
        </button>
      </div>

      {tab === "rules" && (
        <div className="grid gap-3 md:grid-cols-2">
          {data.rules.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border-subtle bg-surface p-6 text-sm text-muted-foreground md:col-span-2">
              Nenhuma regra cadastrada.
            </div>
          ) : (
            data.rules.map((r) => (
              <article
                key={r.id}
                className="rounded-2xl border border-border-subtle bg-surface p-5"
              >
                <header className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">{r.name}</h3>
                    <p className="truncate text-xs text-muted-foreground">{r.description ?? "—"}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${r.is_active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}
                  >
                    {r.is_active ? "Ativa" : "Pausada"}
                  </span>
                </header>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <Stat label="Agendamento" value={r.schedule_label ?? r.schedule_cron ?? "—"} />
                  <Stat label="Última execução" value={formatDateTimeBR(r.last_run_at)} />
                  <Stat label="Status" value={r.last_status ?? "—"} />
                  <Stat label="Próxima" value={formatDateTimeBR(r.next_run_at)} />
                </dl>
                {canManage && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select
                      className="input-field !w-auto text-xs"
                      value={r.destination_id ?? ""}
                      onChange={(e) =>
                        ruleDestMutation.mutate({
                          id: r.id,
                          destinationId: e.target.value || null,
                        })
                      }
                    >
                      <option value="">Sem destino</option>
                      {data.destinations.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn-ghost"
                      disabled={toggleMutation.isPending}
                      onClick={() => toggleMutation.mutate({ id: r.id, isActive: !r.is_active })}
                    >
                      {r.is_active ? "Pausar" : "Ativar"}
                    </button>
                    {r.name === "resumo_diario" && (
                      <button
                        type="button"
                        className="btn-ghost"
                        disabled={summaryMutation.isPending || !r.destination_id}
                        title={!r.destination_id ? "Vincule um destino primeiro" : undefined}
                        onClick={() => summaryMutation.mutate()}
                      >
                        {summaryMutation.isPending ? "Enviando…" : "Enviar resumo agora"}
                      </button>
                    )}
                  </div>
                )}
              </article>
            ))
          )}
        </div>
      )}

      {tab === "destinations" && (
        <DestinationsTab
          destinations={data.destinations}
          canManage={canManage}
          onCreate={async (payload) => {
            try {
              await submitCreate({ data: payload });
              invalidate();
              toast.success("Destino cadastrado.");
            } catch (e) {
              toast.error(getErrorMessage(e));
            }
          }}
          onUpdate={async (payload) => {
            try {
              await submitUpdate({ data: payload });
              invalidate();
              toast.success("Destino atualizado.");
            } catch (e) {
              toast.error(getErrorMessage(e));
            }
          }}
          onDelete={(id) => deleteMutation.mutate({ id })}
          onTest={(id) => testMutation.mutate({ destinationId: id })}
          testPending={testMutation.isPending}
        />
      )}

      {tab === "history" && (
        <section className="overflow-x-auto rounded-2xl border border-border-subtle bg-surface">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-5 py-2 text-left">Quando</th>
                <th className="px-5 py-2 text-left">Status</th>
                <th className="px-5 py-2 text-left">Erro</th>
              </tr>
            </thead>
            <tbody>
              {data.logs.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-xs text-muted-foreground">
                    Sem envios registrados.
                  </td>
                </tr>
              ) : (
                data.logs.map((l) => (
                  <tr key={l.id} className="border-t border-border-subtle/40">
                    <td className="px-5 py-2 tabular">{formatDateTimeBR(l.attempted_at)}</td>
                    <td className="px-5 py-2">{l.status}</td>
                    <td className="px-5 py-2 text-muted-foreground">{l.error ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function DestinationsTab({
  destinations,
  canManage,
  onCreate,
  onUpdate,
  onDelete,
  onTest,
  testPending,
}: {
  destinations: Destination[];
  canManage: boolean;
  onCreate: (payload: {
    name: string;
    chatId: string;
    description: string | null;
  }) => Promise<void>;
  onUpdate: (payload: {
    id: string;
    name: string;
    chatId: string;
    description: string | null;
  }) => Promise<void>;
  onDelete: (id: string) => void;
  onTest: (id: string) => void;
  testPending: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {canManage && (
        <DestinationForm
          key="new"
          onSubmit={async (payload) => {
            await onCreate(payload);
          }}
          submitLabel="Adicionar destino"
        />
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {destinations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-subtle bg-surface p-6 text-sm text-muted-foreground md:col-span-2">
            Nenhum destino cadastrado. Adicione o chat_id do grupo do Telegram acima.
          </div>
        ) : (
          destinations.map((d) =>
            editingId === d.id ? (
              <DestinationForm
                key={d.id}
                initial={d}
                onSubmit={async (payload) => {
                  await onUpdate({ id: d.id, ...payload });
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
                submitLabel="Salvar"
              />
            ) : (
              <article
                key={d.id}
                className="rounded-2xl border border-border-subtle bg-surface p-5"
              >
                <h3 className="text-sm font-semibold">{d.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">chat_id: {d.chat_id}</p>
                {d.description && (
                  <p className="mt-1 text-xs text-muted-foreground">{d.description}</p>
                )}
                {canManage && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-ghost"
                      disabled={testPending}
                      onClick={() => onTest(d.id)}
                    >
                      Enviar teste
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => setEditingId(d.id)}>
                      Editar
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger className="btn-ghost">Remover</AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover destino {d.name}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            As regras vinculadas a este destino deixarão de enviar mensagens até que
                            um novo destino seja escolhido.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onDelete(d.id)}>
                            Remover
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </article>
            ),
          )
        )}
      </div>
    </div>
  );
}

function DestinationForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial?: Destination;
  onSubmit: (payload: {
    name: string;
    chatId: string;
    description: string | null;
  }) => Promise<void>;
  onCancel?: () => void;
  submitLabel: string;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [chatId, setChatId] = useState(initial?.chat_id ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [saving, setSaving] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await onSubmit({
            name,
            chatId,
            description: description.trim() ? description.trim() : null,
          });
          if (!initial) {
            setName("");
            setChatId("");
            setDescription("");
          }
        } finally {
          setSaving(false);
        }
      }}
      className="grid gap-3 rounded-2xl border border-border-subtle bg-surface p-5 md:grid-cols-3"
    >
      <Field label="Nome">
        <input
          className="input-field"
          required
          minLength={2}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Chat ID">
        <input
          className="input-field"
          required
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          placeholder="-100123456789"
        />
      </Field>
      <Field label="Descrição (opcional)">
        <input
          className="input-field"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={200}
        />
      </Field>
      <div className="md:col-span-3 flex gap-2">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Salvando…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-md bg-background/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-foreground">{value ?? "—"}</div>
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
