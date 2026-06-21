
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'diretoria', 'gerente_comercial', 'assistente_vendas', 'responsavel_faturamento');
CREATE TYPE public.app_permission AS ENUM ('manage_goals', 'manage_work_calendar', 'manage_notifications', 'view_audit');
CREATE TYPE public.entry_type AS ENUM ('sales', 'billing');
CREATE TYPE public.delivery_status AS ENUM ('pending', 'sent', 'failed');

-- ============ FACTORIES ============
CREATE TABLE public.factories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  state TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.factories TO authenticated;
GRANT ALL ON public.factories TO service_role;
ALTER TABLE public.factories ENABLE ROW LEVEL SECURITY;

INSERT INTO public.factories (code, name, state) VALUES
  ('eusebio', 'Eusébio', 'CE'),
  ('timon', 'Timon', 'MA');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  last_sign_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============ USER PERMISSIONS ============
CREATE TABLE public.user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission public.app_permission NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, permission)
);
GRANT SELECT ON public.user_permissions TO authenticated;
GRANT ALL ON public.user_permissions TO service_role;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- ============ USER FACTORY ACCESS ============
CREATE TABLE public.user_factory_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  factory_id UUID NOT NULL REFERENCES public.factories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, factory_id)
);
GRANT SELECT ON public.user_factory_access TO authenticated;
GRANT ALL ON public.user_factory_access TO service_role;
ALTER TABLE public.user_factory_access ENABLE ROW LEVEL SECURITY;

-- ============ SECURITY DEFINER HELPERS ============
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _permission public.app_permission)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = _user_id AND permission = _permission)
$$;

CREATE OR REPLACE FUNCTION public.has_factory_access(_user_id UUID, _factory_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
      OR public.has_role(_user_id, 'diretoria')
      OR public.has_role(_user_id, 'gerente_comercial')
      OR EXISTS (SELECT 1 FROM public.user_factory_access WHERE user_id = _user_id AND factory_id = _factory_id)
$$;

CREATE OR REPLACE FUNCTION public.is_active_user(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_active FROM public.profiles WHERE id = _user_id), false)
$$;

-- ============ PROFILES POLICIES ============
CREATE POLICY "profiles_select_self_or_admin" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles_update_self_or_admin" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ============ FACTORIES POLICIES ============
CREATE POLICY "factories_select_all_auth" ON public.factories FOR SELECT TO authenticated USING (true);

-- ============ USER ROLES POLICIES ============
CREATE POLICY "user_roles_select_self_or_admin" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ============ USER PERMISSIONS POLICIES ============
CREATE POLICY "user_permissions_select_self_or_admin" ON public.user_permissions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ============ USER FACTORY ACCESS POLICIES ============
CREATE POLICY "user_factory_access_select_self_or_admin" ON public.user_factory_access FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ============ SALES ENTRIES ============
CREATE TABLE public.sales_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_date DATE NOT NULL,
  factory_id UUID NOT NULL REFERENCES public.factories(id) ON DELETE RESTRICT,
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  note TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reference_date, factory_id)
);
CREATE INDEX idx_sales_date_factory ON public.sales_entries (reference_date DESC, factory_id);
GRANT SELECT, INSERT, UPDATE ON public.sales_entries TO authenticated;
GRANT ALL ON public.sales_entries TO service_role;
ALTER TABLE public.sales_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_select_with_access" ON public.sales_entries FOR SELECT TO authenticated
  USING (public.has_factory_access(auth.uid(), factory_id));
CREATE POLICY "sales_insert_assist_or_admin" ON public.sales_entries FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active_user(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'assistente_vendas'))
    AND public.has_factory_access(auth.uid(), factory_id)
  );
CREATE POLICY "sales_update_assist_or_admin" ON public.sales_entries FOR UPDATE TO authenticated
  USING (
    public.is_active_user(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'assistente_vendas'))
    AND public.has_factory_access(auth.uid(), factory_id)
  );

-- ============ BILLING ENTRIES ============
CREATE TABLE public.billing_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_date DATE NOT NULL,
  factory_id UUID NOT NULL REFERENCES public.factories(id) ON DELETE RESTRICT,
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  note TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reference_date, factory_id)
);
CREATE INDEX idx_billing_date_factory ON public.billing_entries (reference_date DESC, factory_id);
GRANT SELECT, INSERT, UPDATE ON public.billing_entries TO authenticated;
GRANT ALL ON public.billing_entries TO service_role;
ALTER TABLE public.billing_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_select_with_access" ON public.billing_entries FOR SELECT TO authenticated
  USING (public.has_factory_access(auth.uid(), factory_id));
CREATE POLICY "billing_insert_resp_or_admin" ON public.billing_entries FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active_user(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'responsavel_faturamento'))
    AND public.has_factory_access(auth.uid(), factory_id)
  );
CREATE POLICY "billing_update_resp_or_admin" ON public.billing_entries FOR UPDATE TO authenticated
  USING (
    public.is_active_user(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'responsavel_faturamento'))
    AND public.has_factory_access(auth.uid(), factory_id)
  );

-- ============ GOALS ============
CREATE TABLE public.goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES public.factories(id) ON DELETE CASCADE,
  year INT NOT NULL,
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  billing_goal_cents BIGINT NOT NULL DEFAULT 0,
  sales_goal_cents BIGINT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (factory_id, year, month)
);
GRANT SELECT, INSERT, UPDATE ON public.goals TO authenticated;
GRANT ALL ON public.goals TO service_role;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "goals_select_auth" ON public.goals FOR SELECT TO authenticated USING (true);
CREATE POLICY "goals_write_admin_or_perm" ON public.goals FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'manage_goals'));
CREATE POLICY "goals_update_admin_or_perm" ON public.goals FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'manage_goals'));

-- ============ DAILY GOAL OVERRIDES ============
CREATE TABLE public.daily_goal_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES public.factories(id) ON DELETE CASCADE,
  reference_date DATE NOT NULL,
  billing_goal_cents BIGINT,
  sales_goal_cents BIGINT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (factory_id, reference_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_goal_overrides TO authenticated;
GRANT ALL ON public.daily_goal_overrides TO service_role;
ALTER TABLE public.daily_goal_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "overrides_select_auth" ON public.daily_goal_overrides FOR SELECT TO authenticated USING (true);
CREATE POLICY "overrides_write_admin_or_perm" ON public.daily_goal_overrides FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'manage_goals'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'manage_goals'));

-- ============ WORK CALENDAR DAYS ============
CREATE TABLE public.work_calendar_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES public.factories(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  is_workday BOOLEAN NOT NULL DEFAULT true,
  note TEXT,
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (factory_id, day)
);
CREATE INDEX idx_work_calendar_factory_day ON public.work_calendar_days (factory_id, day);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_calendar_days TO authenticated;
GRANT ALL ON public.work_calendar_days TO service_role;
ALTER TABLE public.work_calendar_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calendar_select_auth" ON public.work_calendar_days FOR SELECT TO authenticated USING (true);
CREATE POLICY "calendar_write_admin_or_perm" ON public.work_calendar_days FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'manage_work_calendar'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'manage_work_calendar'));

-- ============ AUDIT LOGS ============
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id),
  actor_email TEXT,
  entity TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  before JSONB,
  after JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entity ON public.audit_logs (entity, created_at DESC);
CREATE INDEX idx_audit_actor ON public.audit_logs (actor_id, created_at DESC);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_select_admin_or_perm" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'view_audit'));
CREATE POLICY "audit_insert_self" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ============ NOTIFICATION DESTINATIONS ============
CREATE TABLE public.notification_destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_destinations TO authenticated;
GRANT ALL ON public.notification_destinations TO service_role;
ALTER TABLE public.notification_destinations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dest_select_auth" ON public.notification_destinations FOR SELECT TO authenticated USING (true);
CREATE POLICY "dest_write_admin_or_perm" ON public.notification_destinations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'manage_notifications'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'manage_notifications'));

-- ============ NOTIFICATION RULES ============
CREATE TABLE public.notification_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  rule_type TEXT NOT NULL,
  destination_id UUID REFERENCES public.notification_destinations(id) ON DELETE SET NULL,
  schedule_cron TEXT,
  schedule_label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  last_status public.delivery_status,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_rules TO authenticated;
GRANT ALL ON public.notification_rules TO service_role;
ALTER TABLE public.notification_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rules_select_auth" ON public.notification_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "rules_write_admin_or_perm" ON public.notification_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'manage_notifications'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'manage_notifications'));

-- ============ NOTIFICATION DELIVERY LOGS ============
CREATE TABLE public.notification_delivery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES public.notification_rules(id) ON DELETE SET NULL,
  destination_id UUID REFERENCES public.notification_destinations(id) ON DELETE SET NULL,
  status public.delivery_status NOT NULL,
  payload JSONB,
  response JSONB,
  error TEXT,
  idempotency_key TEXT UNIQUE,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_delivery_attempted ON public.notification_delivery_logs (attempted_at DESC);
GRANT SELECT, INSERT ON public.notification_delivery_logs TO authenticated;
GRANT ALL ON public.notification_delivery_logs TO service_role;
ALTER TABLE public.notification_delivery_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "delivery_select_admin_or_perm" ON public.notification_delivery_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'manage_notifications') OR public.has_permission(auth.uid(), 'view_audit'));

-- ============ APP SETTINGS ============
CREATE TABLE public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_select_auth" ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings_write_admin" ON public.app_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.app_settings (key, value) VALUES
  ('thresholds', '{"attention_pct": 90, "below_pct": 90}'::jsonb),
  ('daily_summary_time', '"18:00"'::jsonb);

-- ============ UPDATED_AT TRIGGERS ============
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_sales_updated BEFORE UPDATE ON public.sales_entries FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_billing_updated BEFORE UPDATE ON public.billing_entries FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_goals_updated BEFORE UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_calendar_updated BEFORE UPDATE ON public.work_calendar_days FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_rules_updated BEFORE UPDATE ON public.notification_rules FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ HANDLE NEW USER ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ AUDIT TRIGGERS for entries/goals/calendar/users ============
CREATE OR REPLACE FUNCTION public.tg_audit_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor UUID := auth.uid();
  actor_mail TEXT;
BEGIN
  SELECT email INTO actor_mail FROM public.profiles WHERE id = actor;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (actor_id, actor_email, entity, entity_id, action, after)
    VALUES (actor, actor_mail, TG_TABLE_NAME, NEW.id, 'create', to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (actor_id, actor_email, entity, entity_id, action, before, after)
    VALUES (actor, actor_mail, TG_TABLE_NAME, NEW.id, 'update', to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (actor_id, actor_email, entity, entity_id, action, before)
    VALUES (actor, actor_mail, TG_TABLE_NAME, OLD.id, 'delete', to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_sales AFTER INSERT OR UPDATE OR DELETE ON public.sales_entries FOR EACH ROW EXECUTE FUNCTION public.tg_audit_changes();
CREATE TRIGGER trg_audit_billing AFTER INSERT OR UPDATE OR DELETE ON public.billing_entries FOR EACH ROW EXECUTE FUNCTION public.tg_audit_changes();
CREATE TRIGGER trg_audit_goals AFTER INSERT OR UPDATE OR DELETE ON public.goals FOR EACH ROW EXECUTE FUNCTION public.tg_audit_changes();
CREATE TRIGGER trg_audit_calendar AFTER INSERT OR UPDATE OR DELETE ON public.work_calendar_days FOR EACH ROW EXECUTE FUNCTION public.tg_audit_changes();
CREATE TRIGGER trg_audit_user_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.tg_audit_changes();
CREATE TRIGGER trg_audit_user_factory_access AFTER INSERT OR UPDATE OR DELETE ON public.user_factory_access FOR EACH ROW EXECUTE FUNCTION public.tg_audit_changes();
CREATE TRIGGER trg_audit_user_permissions AFTER INSERT OR UPDATE OR DELETE ON public.user_permissions FOR EACH ROW EXECUTE FUNCTION public.tg_audit_changes();

-- ============ REALTIME ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.sales_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.billing_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.goals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.work_calendar_days;
