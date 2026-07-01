
GRANT UPDATE, DELETE ON public.sales_entries TO authenticated;
GRANT UPDATE, DELETE ON public.billing_entries TO authenticated;

DROP POLICY IF EXISTS "sales_update_assist_or_admin" ON public.sales_entries;
CREATE POLICY "sales_update_assist_or_admin" ON public.sales_entries FOR UPDATE TO authenticated
  USING (
    public.is_active_user(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'assistente_vendas'))
    AND public.has_factory_access(auth.uid(), factory_id)
  );

DROP POLICY IF EXISTS "billing_update_resp_or_admin" ON public.billing_entries;
CREATE POLICY "billing_update_resp_or_admin" ON public.billing_entries FOR UPDATE TO authenticated
  USING (
    public.is_active_user(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'responsavel_faturamento'))
    AND public.has_factory_access(auth.uid(), factory_id)
  );

DROP POLICY IF EXISTS "sales_delete_assist_or_admin" ON public.sales_entries;
CREATE POLICY "sales_delete_assist_or_admin" ON public.sales_entries FOR DELETE TO authenticated
  USING (
    public.is_active_user(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'assistente_vendas'))
    AND public.has_factory_access(auth.uid(), factory_id)
  );

DROP POLICY IF EXISTS "billing_delete_resp_or_admin" ON public.billing_entries;
CREATE POLICY "billing_delete_resp_or_admin" ON public.billing_entries FOR DELETE TO authenticated
  USING (
    public.is_active_user(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'responsavel_faturamento'))
    AND public.has_factory_access(auth.uid(), factory_id)
  );
