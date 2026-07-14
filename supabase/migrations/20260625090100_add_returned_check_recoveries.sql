CREATE TABLE public.returned_check_recoveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recovered_date DATE NOT NULL,
  returned_date DATE,
  factory_id UUID NOT NULL REFERENCES public.factories(id) ON DELETE RESTRICT,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  customer_name TEXT,
  check_reference TEXT,
  note TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_returned_check_recoveries_date_factory
  ON public.returned_check_recoveries (recovered_date DESC, factory_id);

GRANT SELECT, INSERT, UPDATE ON public.returned_check_recoveries TO authenticated;
GRANT ALL ON public.returned_check_recoveries TO service_role;
ALTER TABLE public.returned_check_recoveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "returned_check_recoveries_select_with_access"
  ON public.returned_check_recoveries FOR SELECT TO authenticated
  USING (public.has_factory_access(auth.uid(), factory_id));

CREATE POLICY "returned_check_recoveries_insert_credit_or_admin"
  ON public.returned_check_recoveries FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active_user(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'credito_cobranca')
    )
    AND public.has_factory_access(auth.uid(), factory_id)
  );

CREATE POLICY "returned_check_recoveries_update_credit_or_admin"
  ON public.returned_check_recoveries FOR UPDATE TO authenticated
  USING (
    public.is_active_user(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'credito_cobranca')
    )
    AND public.has_factory_access(auth.uid(), factory_id)
  );

CREATE TRIGGER trg_returned_check_recoveries_updated
  BEFORE UPDATE ON public.returned_check_recoveries
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TRIGGER trg_audit_returned_check_recoveries
  AFTER INSERT OR UPDATE OR DELETE ON public.returned_check_recoveries
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_changes();

ALTER PUBLICATION supabase_realtime ADD TABLE public.returned_check_recoveries;
