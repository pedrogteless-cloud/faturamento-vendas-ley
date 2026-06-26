import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteEntry, listEntries, updateEntryFields } from "@/lib/entries.functions";
import { listFactories } from "@/lib/factories.functions";
import { getSessionContext } from "@/lib/session.functions";
import { canRegisterBilling, canRegisterSales } from "@/lib/permissions";
import { centsToBRL, formatDateBR, formatDateTimeBR, getErrorMessage } from "@/lib/format";
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

export const Route = createFileRoute("/_authenticated/historico")({
  head: () => ({ meta: [{ title: "Histórico — Ley Colchões" }] }),
  component: HistoryPage,
});

function formatAmountMask(cents: number): string {
  if (!cents) return "";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function parseAmountMask(raw: string): number {
  const digits = raw.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

function HistoryPage() {
  const [type, setType] = useState<"sales" | "billing">("sales");
  const [factoryId, setFactoryId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editNote, setEditNote] = useState("");

  const qc = useQueryClient();
  const fetchEntries = useServerFn(listEntries);
  const fetchFactories = useServerFn(listFactories);
  const fetchSession = useServerFn(getSessionContext);
  const updateFields = useServerFn(updateEntryFields);
  const removeEntry = useServerFn(deleteEntry);

  const factoriesQuery = useQuery({ queryKey: ["factories"], queryFn: () => fetchFactories() });
  const sessionQuery = useQuery({ queryKey: ["session-context"], queryFn: () => fetchSession() });
  const entriesQuery = useQuery({
    queryKey: ["entries", type, "history", factoryId, dateFrom, dateTo],
    queryFn: () =>
      fetchEntries({
        data: {
          type,
          limit: 200,
          factoryId: factoryId || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        },
      }),
  });

  const canEdit =
    type === "sales"
      ? canRegisterSales(sessionQuery.data ?? null)
      : canRegisterBilling(sessionQuery.data ?? null);

  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; amountCents: number; note: string | null }) =>
      updateFields({ data: { type, id: vars.id, amountCents: vars.amountCents, note: vars.note } }),
    onSuccess: () => {
      toast.success("Lançamento atualizado.");
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["entries"] });
    },
    onError: (error: Error) => toast.error(getErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => removeEntry({ data: { type, id } }),
    onSuccess: () => {
      toast.success("Lançamento excluído.");
      qc.invalidateQueries({ queryKey: ["entries"] });
    },
    onError: (error: Error) => toast.error(getErrorMessage(error)),
  });

  function startEdit(id: string, amountCents: number, note: string | null) {
    setEditingId(id);
    setEditAmount(formatAmountMask(amountCents));
    setEditNote(note ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function saveEdit(id: string) {
    updateMutation.mutate({
      id,
      amountCents: parseAmountMask(editAmount),
      note: editNote.trim() ? editNote.trim() : null,
    });
  }

  function handleExportCSV() {
    const rows = entriesQuery.data ?? [];
    const header = ["Data ref.", "Fábrica", "Valor (R$)", "Criado", "Atualizado", "Observação"];
    const lines = rows.map((row) => {
      const fac = factoriesQuery.data?.find((f) => f.id === row.factory_id);
      return [
        formatDateBR(row.reference_date),
        fac ? `${fac.name} - ${fac.state}` : "",
        (Number(row.amount_cents) / 100).toFixed(2).replace(".", ","),
        formatDateTimeBR(row.created_at),
        formatDateTimeBR(row.updated_at),
        (row.note ?? "").replace(/[\r\n;]+/g, " "),
      ]
        .map((field) => `"${String(field).replace(/"/g, '""')}"`)
        .join(";");
    });
    const csv = [header.join(";"), ...lines].join("\r\n");
    // eslint-disable-next-line no-irregular-whitespace -- BOM prefix for Excel UTF-8 CSV compatibility
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historico-${type === "sales" ? "vendas" : "faturamento"}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">Histórico de lançamentos</h1>
        <p className="text-xs text-muted-foreground">
          Consulta dos lançamentos com data de criação e alteração.
        </p>
      </header>

      <div className="mb-4 inline-flex rounded-xl border border-border-subtle bg-surface p-1 text-sm">
        <button
          onClick={() => {
            setType("sales");
            setEditingId(null);
          }}
          className={`rounded-lg px-3 py-1.5 ${type === "sales" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          Vendas
        </button>
        <button
          onClick={() => {
            setType("billing");
            setEditingId(null);
          }}
          className={`rounded-lg px-3 py-1.5 ${type === "billing" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          Faturamento
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-border-subtle bg-surface p-4">
        <label className="block space-y-1">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Fábrica
          </span>
          <select
            className="input-field !w-auto"
            value={factoryId}
            onChange={(e) => setFactoryId(e.target.value)}
          >
            <option value="">Todas</option>
            {(factoriesQuery.data ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} · {f.state}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">De</span>
          <input
            type="date"
            className="input-field !w-auto"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Até</span>
          <input
            type="date"
            className="input-field !w-auto"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </label>
        {(factoryId || dateFrom || dateTo) && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setFactoryId("");
              setDateFrom("");
              setDateTo("");
            }}
          >
            Limpar filtros
          </button>
        )}
        <button
          type="button"
          onClick={handleExportCSV}
          disabled={(entriesQuery.data ?? []).length === 0}
          className="btn-ghost ml-auto inline-flex items-center gap-1.5"
        >
          <Download className="h-3.5 w-3.5" />
          Exportar CSV
        </button>
      </div>

      <p className="mb-2 text-xs text-muted-foreground">
        {entriesQuery.data?.length ?? 0} registro(s)
        {entriesQuery.data?.length === 200 && " · mostrando os 200 mais recentes"}
      </p>

      <section className="overflow-x-auto rounded-2xl border border-border-subtle bg-surface">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-5 py-2 text-left">Data ref.</th>
              <th className="px-5 py-2 text-left">Fábrica</th>
              <th className="px-5 py-2 text-right">Valor</th>
              <th className="px-5 py-2 text-left">Criado</th>
              <th className="px-5 py-2 text-left">Atualizado</th>
              <th className="px-5 py-2 text-left">Observação</th>
              {canEdit && <th className="px-5 py-2 text-right">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {(entriesQuery.data ?? []).map((row) => {
              const fac = factoriesQuery.data?.find((f) => f.id === row.factory_id);
              const isEditing = editingId === row.id;
              return (
                <tr key={row.id} className="border-t border-border-subtle/40">
                  <td className="px-5 py-2 tabular">{formatDateBR(row.reference_date)}</td>
                  <td className="px-5 py-2">{fac ? `${fac.name} · ${fac.state}` : "—"}</td>
                  <td className="px-5 py-2 text-right tabular font-medium">
                    {isEditing ? (
                      <input
                        className="input-field !w-32 text-right"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        inputMode="numeric"
                      />
                    ) : (
                      centsToBRL(Number(row.amount_cents))
                    )}
                  </td>
                  <td className="px-5 py-2 text-xs text-muted-foreground">
                    {formatDateTimeBR(row.created_at)}
                  </td>
                  <td className="px-5 py-2 text-xs text-muted-foreground">
                    {formatDateTimeBR(row.updated_at)}
                  </td>
                  <td
                    className="max-w-48 truncate px-5 py-2 text-muted-foreground"
                    title={row.note ?? undefined}
                  >
                    {isEditing ? (
                      <input
                        className="input-field !w-full"
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        maxLength={500}
                      />
                    ) : (
                      (row.note ?? "—")
                    )}
                  </td>
                  {canEdit && (
                    <td className="px-5 py-2 text-right">
                      {isEditing ? (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => saveEdit(row.id)}
                            disabled={updateMutation.isPending}
                          >
                            Salvar
                          </button>
                          <button type="button" className="btn-ghost" onClick={cancelEdit}>
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            className="btn-ghost"
                            title="Editar"
                            onClick={() =>
                              startEdit(row.id, Number(row.amount_cents), row.note ?? null)
                            }
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button type="button" className="btn-ghost" title="Excluir">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir lançamento</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Essa ação não pode ser desfeita. O lançamento de{" "}
                                  {formatDateBR(row.reference_date)} no valor de{" "}
                                  {centsToBRL(Number(row.amount_cents))} será excluído
                                  permanentemente.
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
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {entriesQuery.data?.length === 0 && (
              <tr>
                <td
                  colSpan={canEdit ? 7 : 6}
                  className="px-5 py-8 text-center text-xs text-muted-foreground"
                >
                  Nenhum registro encontrado para os filtros selecionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
