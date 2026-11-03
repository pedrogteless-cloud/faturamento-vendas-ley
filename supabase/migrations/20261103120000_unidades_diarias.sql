-- UNIDADES DIÁRIAS (faturadas e produzidas) — estrutura
-- Quantidade de peças por dia e fábrica, para calcular o ticket médio diário
-- (faturamento ÷ unidades faturadas) e comparar com a produção.
-- NULL = não informado; 0 = nenhuma peça. Não altera faturamento, vendas ou carteira.

create table if not exists public.daily_units (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references public.factories(id) on delete restrict,
  reference_date date not null,
  billed_colchoes integer null check (billed_colchoes is null or billed_colchoes >= 0),
  billed_bases integer null check (billed_bases is null or billed_bases >= 0),
  billed_unibox integer null check (billed_unibox is null or billed_unibox >= 0),
  billed_outros integer null check (billed_outros is null or billed_outros >= 0),
  produced_colchoes integer null check (produced_colchoes is null or produced_colchoes >= 0),
  produced_bases integer null check (produced_bases is null or produced_bases >= 0),
  produced_unibox integer null check (produced_unibox is null or produced_unibox >= 0),
  produced_outros integer null check (produced_outros is null or produced_outros >= 0),
  note text,
  created_by uuid default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (factory_id, reference_date)
);
create index if not exists idx_daily_units_date on public.daily_units (reference_date);

grant select, insert, update, delete on public.daily_units to authenticated;
grant all on public.daily_units to service_role;
alter table public.daily_units enable row level security;

drop policy if exists "daily_units_select" on public.daily_units;
create policy "daily_units_select" on public.daily_units for select to authenticated
  using (public.has_factory_access(auth.uid(), factory_id));

drop policy if exists "daily_units_insert" on public.daily_units;
create policy "daily_units_insert" on public.daily_units for insert to authenticated
  with check (
    public.is_active_user(auth.uid())
    and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'responsavel_faturamento'))
    and public.has_factory_access(auth.uid(), factory_id)
  );

drop policy if exists "daily_units_update" on public.daily_units;
create policy "daily_units_update" on public.daily_units for update to authenticated
  using (
    public.is_active_user(auth.uid())
    and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'responsavel_faturamento'))
    and public.has_factory_access(auth.uid(), factory_id)
  );

drop policy if exists "daily_units_delete" on public.daily_units;
create policy "daily_units_delete" on public.daily_units for delete to authenticated
  using (public.is_active_user(auth.uid()) and public.has_role(auth.uid(), 'admin'));

drop trigger if exists trg_daily_units_updated on public.daily_units;
create trigger trg_daily_units_updated before update on public.daily_units
  for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_audit_daily_units on public.daily_units;
create trigger trg_audit_daily_units after insert or update or delete on public.daily_units
  for each row execute function public.tg_audit_changes();
