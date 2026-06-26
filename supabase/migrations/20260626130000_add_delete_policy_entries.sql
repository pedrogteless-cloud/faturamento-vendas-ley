-- Permite excluir lançamentos de vendas/faturamento (ex.: remover registros de teste),
-- restrito aos mesmos papéis que já podem criar/editar cada tipo de lançamento.

GRANT DELETE ON public.sales_entries TO authenticated;
GRANT DELETE ON public.billing_entries TO authenticated;

CREATE POLICY "sales_delete_assist_or_admin" ON public.sales_entries FOR DELETE TO authenticated
  USING (
    public.is_active_user(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'assistente_vendas'))
    AND public.has_factory_access(auth.uid(), factory_id)
  );

CREATE POLICY "billing_delete_resp_or_admin" ON public.billing_entries FOR DELETE TO authenticated
  USING (
    public.is_active_user(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'responsavel_faturamento'))
    AND public.has_factory_access(auth.uid(), factory_id)
  );
