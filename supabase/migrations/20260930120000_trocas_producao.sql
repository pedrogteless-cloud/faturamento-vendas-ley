-- TROCAS NA PRODUÇÃO — estrutura
-- Tabela própria. NUNCA entra em faturamento, vendas, metas, carteira ou contas a receber.
-- amount_cents NULL = não informado; 0 = não houve troca.

create table if not exists public.production_exchanges (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references public.factories(id) on delete restrict,
  reference_date date not null,
  amount_cents bigint null check (amount_cents is null or amount_cents >= 0),
  note text,
  created_by uuid default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (factory_id, reference_date)
);
create index if not exists idx_prod_exch_date on public.production_exchanges (reference_date);

grant select, insert, update, delete on public.production_exchanges to authenticated;
grant all on public.production_exchanges to service_role;
alter table public.production_exchanges enable row level security;

drop policy if exists "prod_exch_select" on public.production_exchanges;
create policy "prod_exch_select" on public.production_exchanges for select to authenticated
  using (public.has_factory_access(auth.uid(), factory_id));

drop policy if exists "prod_exch_insert" on public.production_exchanges;
create policy "prod_exch_insert" on public.production_exchanges for insert to authenticated
  with check (
    public.is_active_user(auth.uid())
    and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'responsavel_faturamento'))
    and public.has_factory_access(auth.uid(), factory_id)
  );

drop policy if exists "prod_exch_update" on public.production_exchanges;
create policy "prod_exch_update" on public.production_exchanges for update to authenticated
  using (
    public.is_active_user(auth.uid())
    and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'responsavel_faturamento'))
    and public.has_factory_access(auth.uid(), factory_id)
  );

drop policy if exists "prod_exch_delete" on public.production_exchanges;
create policy "prod_exch_delete" on public.production_exchanges for delete to authenticated
  using (public.is_active_user(auth.uid()) and public.has_role(auth.uid(), 'admin'));

drop trigger if exists trg_prod_exch_updated on public.production_exchanges;
create trigger trg_prod_exch_updated before update on public.production_exchanges
  for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_audit_prod_exch on public.production_exchanges;
create trigger trg_audit_prod_exch after insert or update or delete on public.production_exchanges
  for each row execute function public.tg_audit_changes();

-- Faixas de alerta em configuração (não fixas no código). Valores em %.
insert into public.app_settings (key, value)
values ('trocas_thresholds', '{"atencao": 5, "critico": 10}'::jsonb)
on conflict (key) do nothing;
