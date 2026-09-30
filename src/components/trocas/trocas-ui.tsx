import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { getTrocaDay, saveTroca } from "@/lib/trocas.functions";
import {
  STATUS_LABEL,
  dayShare,
  formatShare,
  per100Sentence,
  statusFor,
  type TrocasStatus,
} from "@/lib/trocas-calc";
import { centsToBRL, formatDateBR, getErrorMessage } from "@/lib/format";

export const TROCAS_DISCLAIMER =
  "NÃO é faturamento. NÃO gera contas a receber. Foi produção (matéria-prima, mão de obra e máquina) para repor produto já vendido. Quanto menor, melhor.";

export const STATUS_STYLE: Record<
  TrocasStatus,
  { text: string; pill: string; fill: string; dot: string }
> = {
  normal: {
    text: "text-success",
    pill: "bg-success/15 text-success ring-success/30",
    fill: "fill-success",
    dot: "bg-success",
  },
  atencao: {
    text: "text-warning",
    pill: "bg-warning/15 text-warning ring-warning/30",
    fill: "fill-warning",
    dot: "bg-warning",
  },
  critico: {
    text: "text-destructive",
    pill: "bg-destructive/15 text-destructive ring-destructive/30",
    fill: "fill-destructive",
    dot: "bg-destructive",
  },
  sem_info: {
    text: "text-muted-foreground",
    pill: "bg-muted/40 text-muted-foreground ring-border",
    fill: "fill-muted-foreground",
    dot: "bg-muted-foreground",
  },
};

export function StatusPill({ status }: { status: TrocasStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${STATUS_STYLE[status].pill}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_STYLE[status].dot}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}

function mask(cents: number | null): string {
  if (cents == null) return "";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/**
 * Seção "Trocas na produção" na tela de lançamento de faturamento.
 * Vazio = não informado; 0 = não houve troca (botão próprio).
 */
export function TrocasEntry({
  factoryId,
  date,
  canEdit,
}: {
  factoryId: string;
  date: string;
  canEdit: boolean;
}) {
  const fetchDay = useServerFn(getTrocaDay);
  const submit = useServerFn(saveTroca);
  const qc = useQueryClient();
  const enabled = !!factoryId && !!date;

  const dayQuery = useQuery({
    queryKey: ["trocas-day", factoryId, date],
    queryFn: () => fetchDay({ data: { factoryId, date } }),
    enabled,
  });

  // null = campo vazio (não informado)
  const [value, setValue] = useState<number | null>(null);
  useEffect(() => {
    setValue(dayQuery.data?.trocasCents ?? null);
  }, [dayQuery.data?.trocasCents, factoryId, date]);

  const mutation = useMutation({
    mutationFn: (amountCents: number | null) => submit({ data: { factoryId, date, amountCents } }),
    onSuccess: (_r, amountCents) => {
      toast.success(
        amountCents == null
          ? "Trocas do dia marcadas como não informadas."
          : amountCents === 0
            ? "Registrado: não houve troca neste dia."
            : "Trocas na produção registradas.",
      );
      qc.invalidateQueries({ queryKey: ["trocas-day", factoryId, date] });
      qc.invalidateQueries({ queryKey: ["trocas-range"] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const thresholds = dayQuery.data?.thresholds;
  const billing = dayQuery.data?.billingCents ?? 0;
  const share = dayShare(billing, value);
  const status = thresholds ? statusFor(share, thresholds) : "sem_info";
  const saved = dayQuery.data?.trocasCents ?? null;
  const dirty = value !== saved;

  return (
    <section className="rounded-2xl border-2 border-orange-500/50 bg-orange-500/[0.06] p-5">
      <div className="mb-2 flex items-center gap-2">
        <RefreshCcw className="h-4 w-4 text-orange-500" />
        <h2 className="text-sm font-semibold text-orange-500">Trocas na produção</h2>
      </div>
      <div className="mb-4 flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs leading-relaxed text-destructive">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{TROCAS_DISCLAIMER}</p>
      </div>

      {!enabled ? (
        <p className="text-xs text-muted-foreground">Selecione a fábrica e a data acima.</p>
      ) : dayQuery.isLoading ? (
        <div className="h-24 animate-pulse rounded-xl bg-muted/40" />
      ) : (
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Trocas na produção (R$) · {formatDateBR(date)}
            </span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="não informado"
              disabled={!canEdit}
              className="input-field tabular border-orange-500/40"
              value={mask(value)}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                setValue(digits ? parseInt(digits, 10) : null);
              }}
            />
            <span className="text-[11px] text-muted-foreground">
              Vazio = não informado. Para registrar que não houve troca, use o botão abaixo.
            </span>
          </label>

          <div className="flex items-center justify-between gap-2 rounded-lg bg-background/50 px-3 py-2 text-xs">
            <span className="text-muted-foreground">
              % da produção do dia em trocas
              {!dayQuery.data?.hasBilling && value != null && (
                <span className="block text-[10px]">
                  Faturamento do dia ainda não lançado — o % considera R$ 0 de faturamento.
                </span>
              )}
            </span>
            <span className="flex items-center gap-2">
              <b className={`tabular text-sm ${STATUS_STYLE[status].text}`}>{formatShare(share)}</b>
              <StatusPill status={status} />
            </span>
          </div>
          {share != null && (
            <p className="text-[11px] text-muted-foreground">{per100Sentence(share)}</p>
          )}

          {canEdit && (
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                className="btn-primary"
                disabled={mutation.isPending || !dirty || value == null}
                onClick={() => mutation.mutate(value)}
              >
                {mutation.isPending ? "Salvando…" : "Salvar trocas"}
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={mutation.isPending || saved === 0}
                onClick={() => {
                  setValue(0);
                  mutation.mutate(0);
                }}
              >
                Não houve troca hoje
              </button>
            </div>
          )}
          {canEdit && saved != null && (
            <button
              type="button"
              className="text-[11px] text-muted-foreground underline underline-offset-2"
              disabled={mutation.isPending}
              onClick={() => {
                setValue(null);
                mutation.mutate(null);
              }}
            >
              Voltar para "não informado"
            </button>
          )}
          {saved != null && (
            <p className="text-[11px] text-muted-foreground">
              Registrado: {centsToBRL(saved)}
              {saved === 0 && " (não houve troca)"}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
