// Helpers de permissão usados no cliente para esconder UI.
// IMPORTANTE: nunca confiar apenas no cliente — toda regra é também aplicada
// no banco via RLS e nos server functions.

export type AppRole =
  | "admin"
  | "diretoria"
  | "gerente_comercial"
  | "assistente_vendas"
  | "responsavel_faturamento";

export type AppPermission =
  | "manage_goals"
  | "manage_work_calendar"
  | "manage_notifications"
  | "view_audit";

export type SessionContext = {
  userId: string;
  email: string;
  fullName: string;
  isActive: boolean;
  roles: AppRole[];
  permissions: AppPermission[];
  factoryIds: string[];
};

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Administrador",
  diretoria: "Diretoria",
  gerente_comercial: "Gerente comercial",
  assistente_vendas: "Assistente comercial",
  responsavel_faturamento: "Responsável pelo faturamento",
};

export function hasRole(ctx: SessionContext | null, role: AppRole): boolean {
  return !!ctx?.roles.includes(role);
}
export function hasAnyRole(ctx: SessionContext | null, roles: AppRole[]): boolean {
  return !!ctx?.roles.some((r) => roles.includes(r));
}
export function hasPermission(ctx: SessionContext | null, p: AppPermission): boolean {
  return !!ctx?.permissions.includes(p);
}

export function canRegisterSales(ctx: SessionContext | null): boolean {
  return hasAnyRole(ctx, ["admin", "assistente_vendas"]);
}
export function canRegisterBilling(ctx: SessionContext | null): boolean {
  return hasAnyRole(ctx, ["admin", "responsavel_faturamento"]);
}
export function canManageGoals(ctx: SessionContext | null): boolean {
  return hasRole(ctx, "admin") || hasPermission(ctx, "manage_goals");
}
export function canManageCalendar(ctx: SessionContext | null): boolean {
  return hasRole(ctx, "admin") || hasPermission(ctx, "manage_work_calendar");
}
export function canManageNotifications(ctx: SessionContext | null): boolean {
  return hasRole(ctx, "admin") || hasPermission(ctx, "manage_notifications");
}
export function canViewAudit(ctx: SessionContext | null): boolean {
  return hasRole(ctx, "admin") || hasPermission(ctx, "view_audit");
}
export function canAccessAdmin(ctx: SessionContext | null): boolean {
  return hasRole(ctx, "admin");
}
export function canRegisterReturnedCheckRecovery(ctx: SessionContext | null): boolean {
  return hasAnyRole(ctx, ["admin", "responsavel_faturamento", "diretoria"]);
}
