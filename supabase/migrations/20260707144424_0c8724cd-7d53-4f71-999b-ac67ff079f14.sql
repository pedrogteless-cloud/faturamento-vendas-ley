alter table public.carteira_adjustments
  add column if not exists reason text not null default 'correcao',
  add column if not exists reference_date date,
  add column if not exists original_cents bigint,
  add column if not exists realized_cents bigint,
  add column if not exists destination text;

alter table public.carteira_adjustments drop constraint if exists carteira_adj_reason_check;

alter table public.carteira_adjustments add constraint carteira_adj_reason_check
  check (reason in ('cancelamento','repasse','devolucao','correcao','conciliacao'));

update public.carteira_adjustments set reference_date = created_at::date where reference_date is null;