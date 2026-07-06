create table public.carteira_adjustments (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references public.factories(id) on delete restrict,
  amount_cents bigint not null,
  note text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index idx_carteira_adj_factory on public.carteira_adjustments (factory_id, created_at desc);

grant select, insert, delete on public.carteira_adjustments to authenticated;
grant all on public.carteira_adjustments to service_role;

alter table public.carteira_adjustments enable row level security;

create policy "carteira_adj_select" on public.carteira_adjustments for select to authenticated
  using (public.has_factory_access(auth.uid(), factory_id));

create policy "carteira_adj_insert_admin" on public.carteira_adjustments for insert to authenticated
  with check (public.is_active_user(auth.uid()) and public.has_role(auth.uid(), 'admin'));

create policy "carteira_adj_delete_admin" on public.carteira_adjustments for delete to authenticated
  using (public.is_active_user(auth.uid()) and public.has_role(auth.uid(), 'admin'));