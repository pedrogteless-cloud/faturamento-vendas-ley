drop policy if exists "sales_delete_assist_or_admin" on public.sales_entries;
create policy "sales_delete_assist_or_admin" on public.sales_entries
  for delete to authenticated using (
    public.is_active_user(auth.uid())
    and public.has_factory_access(auth.uid(), factory_id)
    and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'assistente_vendas'))
  );

drop policy if exists "billing_delete_resp_or_admin" on public.billing_entries;
create policy "billing_delete_resp_or_admin" on public.billing_entries
  for delete to authenticated using (
    public.is_active_user(auth.uid())
    and public.has_factory_access(auth.uid(), factory_id)
    and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'responsavel_faturamento'))
  );

drop policy if exists "sales_update_assist_or_admin" on public.sales_entries;
create policy "sales_update_assist_or_admin" on public.sales_entries
  for update to authenticated using (
    public.is_active_user(auth.uid())
    and public.has_factory_access(auth.uid(), factory_id)
    and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'assistente_vendas'))
  );

drop policy if exists "billing_update_resp_or_admin" on public.billing_entries;
create policy "billing_update_resp_or_admin" on public.billing_entries
  for update to authenticated using (
    public.is_active_user(auth.uid())
    and public.has_factory_access(auth.uid(), factory_id)
    and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'responsavel_faturamento'))
  );