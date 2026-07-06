ALTER TABLE public.sales_entries
  ADD COLUMN channel text NOT NULL DEFAULT 'representantes'
  CHECK (channel IN ('representantes', 'distribuidora'));

DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.sales_entries'::regclass AND contype = 'u';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.sales_entries DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.sales_entries
  ADD CONSTRAINT sales_entries_date_factory_channel_key
  UNIQUE (reference_date, factory_id, channel);