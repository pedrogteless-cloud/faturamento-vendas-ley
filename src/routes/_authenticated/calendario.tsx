import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listFactories } from "@/lib/factories.functions";
import { getSessionContext } from "@/lib/session.functions";
import { generateDefaultMonth, listCalendar, setCalendarDay } from "@/lib/calendar.functions";
import { canManageCalendar } from "@/lib/permissions";
import { cn } from "@/lib/utils";
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

export const Route = createFileRoute("/_authenticated/calendario")({
  head: () => ({ meta: [{ title: "Calendário — Ley Colchões" }] }),
  component: CalendarPage,
});

function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [factoryId, setFactoryId] = useState<string>("");
  const fetchFactories = useServerFn(listFactories);
  const fetchSession = useServerFn(getSessionContext);
  const fetchCalendar = useServerFn(listCalendar);
  const setDay = useServerFn(setCalendarDay);
  const genMonth = useServerFn(generateDefaultMonth);
  const qc = useQueryClient();

  const factoriesQuery = useQuery({ queryKey: ["factories"], queryFn: () => fetchFactories() });
  const sessionQuery = useQuery({ queryKey: ["session-context"], queryFn: () => fetchSession() });
  const canManage = canManageCalendar(sessionQuery.data ?? null);

  const currentFactory = factoryId || factoriesQuery.data?.[0]?.id || "";
  const calQuery = useQuery({
    enabled: !!currentFactory,
    queryKey: ["calendar", currentFactory, year, month],
    queryFn: () => fetchCalendar({ data: { factoryId: currentFactory, year, month } }),
  });

  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();
  const days = Array.from({ length: lastDay }, (_, i) => i + 1);

  function isWorkday(day: number): boolean {
    const iso = `${year}-${pad(month)}-${pad(day)}`;
    const found = (calQuery.data ?? []).find((r) => r.day === iso);
    if (found) return found.is_workday;
    const dow = new Date(`${iso}T12:00:00`).getDay();
    return dow >= 1 && dow <= 5;
  }

  const total = days.filter((d) => isWorkday(d)).length;

  const toggle = useMutation({
    mutationFn: async (day: number) => {
      const iso = `${year}-${pad(month)}-${pad(day)}`;
      const next = !isWorkday(day);
      return setDay({ data: { factoryId: currentFactory, day: iso, isWorkday: next } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar", currentFactory, year, month] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">Calendário de dias úteis</h1>
          <p className="text-xs text-muted-foreground">
            Configure feriados e dias trabalhados de cada fábrica.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <select
            className="input-field !w-auto"
            value={currentFactory}
            onChange={(e) => setFactoryId(e.target.value)}
          >
            {(factoriesQuery.data ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} · {f.state}
              </option>
            ))}
          </select>
          <select
            className="input-field !w-auto"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {pad(m)}
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

      <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Total de dias úteis:{" "}
          <span className="font-semibold text-foreground tabular">{total}</span>
        </span>
        {canManage && (
          <AlertDialog>
            <AlertDialogTrigger className="btn-ghost">Gerar padrão seg–sex</AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Gerar configuração padrão?</AlertDialogTitle>
                <AlertDialogDescription>
                  Isso vai marcar todos os dias de segunda a sexta deste mês como dia útil, e
                  sábados/domingos como não úteis — sobrescrevendo qualquer ajuste manual já feito
                  neste período.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    try {
                      await genMonth({ data: { factoryId: currentFactory, year, month } });
                      qc.invalidateQueries({ queryKey: ["calendar", currentFactory, year, month] });
                      toast.success("Configuração padrão gerada (segunda a sexta).");
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  Gerar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      <div className="mb-3 flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-primary/20" /> Dia útil
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-muted/30" /> Não útil
        </span>
      </div>

      <div className="grid grid-cols-7 gap-2 rounded-2xl border border-border-subtle bg-surface p-4">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
          <div
            key={i}
            className="py-1 text-center text-[11px] uppercase tracking-wider text-muted-foreground"
          >
            {d}
          </div>
        ))}
        {/* offset */}
        {Array.from({ length: new Date(`${year}-${pad(month)}-01T12:00:00`).getDay() }).map(
          (_, i) => (
            <div key={`pad-${i}`} />
          ),
        )}
        {days.map((d) => {
          const work = isWorkday(d);
          const isPendingThis = toggle.isPending && toggle.variables === d;
          return (
            <button
              key={d}
              disabled={!canManage || toggle.isPending}
              onClick={() => toggle.mutate(d)}
              className={cn(
                "tabular grid aspect-square place-items-center rounded-lg text-sm transition",
                work
                  ? "bg-primary/20 text-foreground hover:bg-primary/30"
                  : "bg-muted/30 text-muted-foreground hover:bg-muted/50",
                !canManage && "cursor-default",
                isPendingThis && "opacity-50",
              )}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}
