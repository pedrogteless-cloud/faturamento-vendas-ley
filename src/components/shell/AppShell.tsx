import { useEffect, useState } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  PlusSquare,
  Target,
  CalendarDays,
  History,
  Bell,
  Users,
  ShieldCheck,
  LogOut,
  Menu,
  MoreHorizontal,
  Wallet,
  Wifi,
  WifiOff,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { subscribeDashboardStatus } from "@/lib/dashboard-status";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { SessionContext } from "@/lib/permissions";
import {
  canAccessAdmin,
  canManageCalendar,
  canManageGoals,
  canRegisterBilling,
  canRegisterSales,
  canManageNotifications,
  canViewAudit,
  ROLE_LABEL,
} from "@/lib/permissions";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  show: (s: SessionContext | null) => boolean;
  primary?: boolean;
};

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, show: () => true, primary: true },
  {
    to: "/lancamentos",
    label: "Lançamentos",
    icon: PlusSquare,
    show: (s) => canRegisterSales(s) || canRegisterBilling(s),
    primary: true,
  },
  {
    to: "/metas",
    label: "Metas",
    icon: Target,
    show: (s) => canManageGoals(s) || canRegisterSales(s) || canRegisterBilling(s),
    primary: true,
  },
  {
    to: "/calendario",
    label: "Calendário",
    icon: CalendarDays,
    show: (s) => canManageCalendar(s),
  },
  { to: "/historico", label: "Histórico", icon: History, show: () => true, primary: true },
  {
    to: "/notificacoes",
    label: "Notificações",
    icon: Bell,
    show: (s) => canManageNotifications(s),
    primary: true,
  },
  { to: "/carteira", label: "Carteira", icon: Wallet, show: (s) => canAccessAdmin(s) },
  { to: "/admin", label: "Usuários", icon: Users, show: (s) => canAccessAdmin(s) },
  { to: "/auditoria", label: "Auditoria", icon: ShieldCheck, show: (s) => canViewAudit(s) },
];

export function AppShell({ session }: { session: SessionContext | null }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [collapsed, setCollapsed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "connected" | "failed">(
    "connecting",
  );
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const unsubscribe = subscribeDashboardStatus((status) => {
      if (status.asOf) setUpdatedAt(status.asOf);
      setRealtimeStatus(status.realtime);
    });
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      unsubscribe();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const visible = NAV.filter((n) => n.show(session));
  const primaryMobile = visible.filter((n) => n.primary).slice(0, 4);
  const primaryMobilePaths = new Set(primaryMobile.map((item) => item.to));
  const moreMobile = visible.filter((item) => !primaryMobilePaths.has(item.to));
  const moreActive = moreMobile.some(
    (item) => pathname === item.to || (item.to !== "/" && pathname.startsWith(item.to)),
  );

  const updatedLabel = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Fortaleza",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(updatedAt ?? Date.now()));

  const connectionLabel = !online
    ? "Offline"
    : realtimeStatus === "connected"
      ? "Tempo real"
      : realtimeStatus === "failed"
        ? "Sem tempo real"
        : "Sincronizando";
  const connectionTitle = !online
    ? "Sem conexão com a internet. Os dados podem estar desatualizados."
    : realtimeStatus === "connected"
      ? "Conectado: mudanças aparecem automaticamente, sem precisar recarregar."
      : realtimeStatus === "failed"
        ? "Não foi possível manter a conexão em tempo real. Os dados continuam sendo atualizados a cada 30s."
        : "Estabelecendo conexão em tempo real…";
  const ConnectionIcon = !online || realtimeStatus === "failed" ? WifiOff : Wifi;

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar desktop */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border-subtle bg-sidebar text-sidebar-foreground transition-all lg:flex",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-4">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground font-bold">
            L
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">Ley Colchões</div>
              <div className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                Painel executivo
              </div>
            </div>
          )}
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            aria-label="Recolher menu"
          >
            <Menu className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {visible.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.to || (item.to !== "/" && pathname.startsWith(item.to));
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-primary" />
                )}
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          {!collapsed && session && (
            <div className="mb-2 truncate text-xs text-muted-foreground">
              <div className="truncate font-medium text-foreground">{session.fullName}</div>
              <div className="truncate">{session.roles.map((r) => ROLE_LABEL[r]).join(" · ")}</div>
            </div>
          )}
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
            {!collapsed && "Sair"}
          </button>
        </div>
      </aside>

      {/* Conteúdo principal */}
      <div className="flex min-w-0 flex-1 flex-col pb-16 lg:pb-0">
        {/* Header */}
        <header className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border-subtle bg-background/85 px-4 py-3 backdrop-blur sm:px-6">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">
              Painel Ley Colchões
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              {updatedAt
                ? `Dados atualizados às ${updatedLabel}`
                : "Aguardando a primeira atualização"}{" "}
              · Fortaleza
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              title={connectionTitle}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] ring-1",
                !online || realtimeStatus === "failed"
                  ? "bg-destructive/15 text-destructive ring-destructive/30"
                  : realtimeStatus === "connected"
                    ? "bg-success/15 text-success ring-success/30"
                    : "bg-warning/15 text-warning ring-warning/30",
              )}
            >
              <ConnectionIcon className="h-3 w-3" />
              <span className="hidden sm:inline">{connectionLabel}</span>
            </span>
          </div>
        </header>

        <main className="flex-1">
          <div key={pathname} className="animate-in fade-in duration-200">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Bottom nav mobile */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 grid grid-cols-5 border-t border-border-subtle bg-sidebar lg:hidden">
        {primaryMobile.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.to || (item.to !== "/" && pathname.startsWith(item.to));
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 py-2 text-[10px]",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
        <Sheet>
          <SheetTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 py-2 text-[10px]",
                moreActive ? "text-primary" : "text-muted-foreground",
              )}
              aria-label="Abrir mais opções"
            >
              <MoreHorizontal className="h-5 w-5" />
              <span>Mais</span>
            </button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="rounded-t-3xl border-border-subtle bg-surface pb-8"
          >
            <SheetHeader className="text-left">
              <SheetTitle>Mais opções</SheetTitle>
              {session && (
                <p className="text-xs text-muted-foreground">
                  {session.fullName} · {session.roles.map((role) => ROLE_LABEL[role]).join(" · ")}
                </p>
              )}
            </SheetHeader>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {moreMobile.map((item) => {
                const Icon = item.icon;
                const active =
                  pathname === item.to || (item.to !== "/" && pathname.startsWith(item.to));
                return (
                  <SheetClose asChild key={item.to}>
                    <Link
                      to={item.to}
                      className={cn(
                        "flex min-h-16 items-center gap-3 rounded-xl border px-4 py-3 text-sm",
                        active
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border-subtle bg-background/40 text-muted-foreground",
                      )}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  </SheetClose>
                );
              })}
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-border-subtle px-4 py-3 text-sm text-muted-foreground"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </SheetContent>
        </Sheet>
      </nav>
    </div>
  );
}
