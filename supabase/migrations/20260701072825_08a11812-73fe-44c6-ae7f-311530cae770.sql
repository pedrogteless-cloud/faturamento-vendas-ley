
create or replace function public.is_aal2()
returns boolean language sql stable security definer
set search_path = public as $$
  select coalesce((auth.jwt() ->> 'aal') = 'aal2', false);
$$;

drop policy if exists "sales_delete_assist_or_admin" on public.sales_entries;
create policy "sales_delete_assist_or_admin" on public.sales_entries
  for delete to authenticated using (
    public.is_active_user(auth.uid())
    and public.has_factory_access(auth.uid(), factory_id)
    and (
      public.has_role(auth.uid(), 'assistente_vendas')
      or (public.has_role(auth.uid(), 'admin') and public.is_aal2())
    )
  );

drop policy if exists "billing_delete_resp_or_admin" on public.billing_entries;
create policy "billing_delete_resp_or_admin" on public.billing_entries
  for delete to authenticated using (
    public.is_active_user(auth.uid())
    and public.has_factory_access(auth.uid(), factory_id)
    and (
      public.has_role(auth.uid(), 'responsavel_faturamento')
      or (public.has_role(auth.uid(), 'admin') and public.is_aal2())
    )
  );

drop policy if exists "sales_update_assist_or_admin" on public.sales_entries;
create policy "sales_update_assist_or_admin" on public.sales_entries
  for update to authenticated using (
    public.is_active_user(auth.uid())
    and public.has_factory_access(auth.uid(), factory_id)
    and (
      public.has_role(auth.uid(), 'assistente_vendas')
      or (public.has_role(auth.uid(), 'admin') and public.is_aal2())
    )
  );

drop policy if exists "billing_update_resp_or_admin" on public.billing_entries;
create policy "billing_update_resp_or_admin" on public.billing_entries
  for update to authenticated using (
    public.is_active_user(auth.uid())
    and public.has_factory_access(auth.uid(), factory_id)
    and (
      public.has_role(auth.uid(), 'responsavel_faturamento')
      or (public.has_role(auth.uid(), 'admin') and public.is_aal2())
    )
  );
