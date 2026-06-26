// Pub/sub com replay do último valor — evita corrida entre o efeito do
// dashboard (que publica o status) e o efeito do AppShell (que assina),
// já que a ordem de montagem dos efeitos pode fazer o evento inicial
// disparar antes do listener existir.

export type RealtimeStatus = "connecting" | "connected" | "failed";

export type DashboardStatus = {
  asOf: string | null;
  realtime: RealtimeStatus;
};

let current: DashboardStatus = { asOf: null, realtime: "connecting" };
const listeners = new Set<(status: DashboardStatus) => void>();

export function setDashboardStatus(partial: Partial<DashboardStatus>): void {
  current = { ...current, ...partial };
  for (const fn of listeners) fn(current);
}

export function subscribeDashboardStatus(fn: (status: DashboardStatus) => void): () => void {
  fn(current);
  listeners.add(fn);
  return () => listeners.delete(fn);
}
