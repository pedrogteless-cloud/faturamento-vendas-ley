import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Boxes } from "lucide-react";
import { getUnitsDay, saveUnitsDay } from "@/lib/units.functions";
import {
  UNIT_KINDS,
  UNIT_LABEL,
  ticketMedioCents,
  totalUnits,
  type UnitCounts,
} from "@/lib/units-calc";
import { centsToBRL, formatDateBR, getErrorMessage } from "@/lib/format";

type Form = Record<"billed" | "produced", Record<(typeof UNIT_KINDS)[number], string>>;

const emptyForm = (): Form => ({
  billed: { colchoes: "", bases: "", unibox: "", outros: "" },
  produced: { colchoes: "", bases: "", unibox: "", outros: "" },
});

const toForm = (billed: UnitCounts, produced: UnitCounts): Form => {
  const f = emptyForm();
  for (const k of UNIT_KINDS) {
    f.billed[k] = billed[k] == null ? "" : String(billed[k]);
    f.produced[k] = produced[k] == null ? "" : String(produced[k]);
  }
  return f;
};

const toCounts = (g: Record<(typeof UNIT_KINDS)[number], string>): UnitCounts => ({
  colchoes: g.colchoes === "" ? null : parseInt(g.colchoes, 10),
  bases: g.bases === "" ? null : parseInt(g.bases, 10),
  unibox: g.unibox === "" ? null : parseInt(g.unibox, 10),
  outros: g.outros === "" ? null : parseInt(g.outros, 10),
});

const fmtInt = (n: number | null) => (n == null ? "—" : n.toLocaleString("pt-BR"));

/**
 * Seção "Unidades do dia" na tela de lançamento de faturamento:
 * peças faturadas e produzidas, por tipo. Vazio = não informado; 0 = nenhuma peça.
 * Ticket médio do dia = faturamento ÷ unidades faturadas.
 */
export function UnitsEntry({
  factoryId,
  date,
  canEdit,
}: {
  factoryId: string;
  date: string;
  canEdit: boolean;
}) {
  const fetchDay = useServerFn(getUnitsDay);
  const submit = useServerFn(saveUnitsDay);
  const qc = useQueryClient();
  const enabled = !!factoryId && !!date;

  const dayQuery = useQuery({
    queryKey: ["units-day", factoryId, date],
    queryFn: () => fetchDay({ data: { factoryId, date } }),
    enabled,
  });

  const [form, setForm] = useState<Form>(emptyForm());
  useEffect(() => {
    if (dayQuery.data) setForm(toForm(dayQuery.data.billed, dayQuery.data.produced));
    else setForm(emptyForm());
  }, [dayQuery.data, factoryId, date]);

  const mutation = useMutation({
    mutationFn: () =>
      submit({
        data: {
          factoryId,
          date,
          billed: toCounts(form.billed),
          produced: toCounts(form.produced),
        },
      }),
    onSuccess: () => {
      toast.success("Unidades do dia registradas.");
      qc.invalidateQueries({ queryKey: ["units-day", factoryId, date] });
      qc.invalidateQueries({ queryKey: ["insights-data"] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const billed = toCounts(form.billed);
  const produced = toCounts(form.produced);
  const billedTotal = totalUnits(billed);
  const producedTotal = totalUnits(produced);
  const billingCents = dayQuery.data?.billingCents ?? 0;
  const ticket = ticketMedioCents(billingCents, billedTotal);

  const saved = dayQuery.data;
  const dirty =
    !saved || JSON.stringify(toForm(saved.billed, saved.produced)) !== JSON.stringify(form);
  const anyFilled = billedTotal != null || producedTotal != null;

  const field = (group: "billed" | "produced", k: (typeof UNIT_KINDS)[number]) => (
    <label key={`${group}-${k}`} className="block space-y-1">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {UNIT_LABEL[k]}
      </span>
      <input
        type="text"
        inputMode="numeric"
        placeholder="—"
        disabled={!canEdit}
        className="input-field tabular"
        value={form[group][k]}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
          setForm((f) => ({ ...f, [group]: { ...f[group], [k]: digits } }));
        }}
      />
    </label>
  );

  return (
    <section className="rounded-2xl border border-border-subtle bg-surface p-5">
      <div className="mb-3 flex items-center gap-2">
        <Boxes className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Unidades do dia</h2>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Peças faturadas e produzidas em {formatDateBR(date)}. Campo vazio = não informado. O ticket
        médio do dia é o faturamento dividido pelas unidades faturadas.
      </p>

      {!enabled ? (
        <p className="text-xs text-muted-foreground">Selecione a fábrica e a data acima.</p>
      ) : dayQuery.isLoading ? (
        <div className="h-32 animate-pulse rounded-xl bg-muted/40" />
      ) : (
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider">Faturadas</h3>
              <span className="tabular text-xs text-muted-foreground">
                Total: <b className="text-foreground">{fmtInt(billedTotal)}</b>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {UNIT_KINDS.map((k) => field("billed", k))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider">Produzidas</h3>
              <span className="tabular text-xs text-muted-foreground">
                Total: <b className="text-foreground">{fmtInt(producedTotal)}</b>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {UNIT_KINDS.map((k) => field("produced", k))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 rounded-lg bg-background/50 px-3 py-2 text-xs">
            <span className="text-muted-foreground">
              Ticket médio do dia
              {!dayQuery.data?.billingCents && billedTotal != null && (
                <span className="block text-[10px]">Faturamento do dia ainda não lançado.</span>
              )}
            </span>
            <b className="tabular text-sm">{ticket == null ? "—" : centsToBRL(ticket)}</b>
          </div>

          {canEdit && (
            <button
              type="button"
              className="btn-primary w-full"
              disabled={mutation.isPending || !dirty || !anyFilled}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Salvando…" : "Salvar unidades"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
