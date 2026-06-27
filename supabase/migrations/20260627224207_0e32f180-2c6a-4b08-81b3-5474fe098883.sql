
-- 1) Extensões
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;
create extension if not exists "supabase_vault" with schema "vault";

grant usage on schema net to postgres;
grant usage on schema cron to postgres;

-- =========================================================
-- 2) notify_telegram(): envia mensagem e loga
-- =========================================================
create or replace function public.notify_telegram(
  p_chat_id text,
  p_message text,
  p_rule_id uuid,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_token text;
  v_dest_id uuid;
  v_log_id uuid;
  v_req_id bigint;
  v_url text;
  v_payload jsonb;
begin
  if p_idempotency_key is not null and exists (
    select 1 from public.notification_delivery_logs
    where idempotency_key = p_idempotency_key
  ) then
    return null;
  end if;

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'telegram_bot_token'
  limit 1;

  select id into v_dest_id
  from public.notification_destinations
  where chat_id = p_chat_id and is_active
  limit 1;

  v_payload := jsonb_build_object(
    'chat_id', p_chat_id,
    'text', p_message,
    'parse_mode', 'HTML',
    'disable_web_page_preview', true
  );

  if v_token is null or length(v_token) = 0 then
    insert into public.notification_delivery_logs
      (rule_id, destination_id, status, payload, error, idempotency_key)
    values (p_rule_id, v_dest_id, 'failed'::delivery_status,
            v_payload, 'telegram_bot_token ausente no Vault', p_idempotency_key)
    returning id into v_log_id;
    update public.notification_rules
      set last_run_at = now(), last_status = 'failed'::delivery_status
      where id = p_rule_id;
    return v_log_id;
  end if;

  v_url := 'https://api.telegram.org/bot' || v_token || '/sendMessage';

  begin
    select net.http_post(
      url     := v_url,
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body    := v_payload,
      timeout_milliseconds := 10000
    ) into v_req_id;

    insert into public.notification_delivery_logs
      (rule_id, destination_id, status, payload, response, idempotency_key)
    values (p_rule_id, v_dest_id, 'sent'::delivery_status, v_payload,
            jsonb_build_object('request_id', v_req_id), p_idempotency_key)
    returning id into v_log_id;

    update public.notification_rules
      set last_run_at = now(), last_status = 'sent'::delivery_status
      where id = p_rule_id;
  exception when others then
    insert into public.notification_delivery_logs
      (rule_id, destination_id, status, payload, error, idempotency_key)
    values (p_rule_id, v_dest_id, 'failed'::delivery_status, v_payload,
            SQLERRM, p_idempotency_key)
    returning id into v_log_id;
    update public.notification_rules
      set last_run_at = now(), last_status = 'failed'::delivery_status
      where id = p_rule_id;
  end;

  return v_log_id;
end;
$$;

revoke all on function public.notify_telegram(text, text, uuid, text) from public, anon, authenticated;

-- =========================================================
-- Helpers BRL e datas (timezone America/Fortaleza)
-- =========================================================
create or replace function public.fmt_brl(cents bigint)
returns text language sql immutable as $$
  select 'R$ ' || replace(replace(replace(
    to_char((coalesce(cents,0)::numeric / 100.0), 'FM999G999G999G990D00'),
    ',', '#'), '.', ','), '#', '.')
$$;

create or replace function public.workdays_in_month(p_factory_id uuid, p_year int, p_month int)
returns int language sql stable as $$
  with days as (
    select d::date as day
    from generate_series(
      make_date(p_year, p_month, 1),
      (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date,
      interval '1 day'
    ) d
  ),
  resolved as (
    select d.day,
      coalesce(
        (select w.is_workday from public.work_calendar_days w
          where w.factory_id = p_factory_id and w.day = d.day),
        extract(isodow from d.day) between 1 and 5
      ) as is_work
    from days d
  )
  select count(*)::int from resolved where is_work
$$;

create or replace function public.workdays_remaining(p_factory_id uuid, p_today date)
returns int language sql stable as $$
  with days as (
    select d::date as day
    from generate_series(
      p_today,
      (date_trunc('month', p_today) + interval '1 month - 1 day')::date,
      interval '1 day'
    ) d
  ),
  resolved as (
    select d.day,
      coalesce(
        (select w.is_workday from public.work_calendar_days w
          where w.factory_id = p_factory_id and w.day = d.day),
        extract(isodow from d.day) between 1 and 5
      ) as is_work
    from days d
  )
  select count(*)::int from resolved where is_work
$$;

create or replace function public.workdays_elapsed(p_factory_id uuid, p_today date)
returns int language sql stable as $$
  with days as (
    select d::date as day
    from generate_series(
      date_trunc('month', p_today)::date,
      p_today,
      interval '1 day'
    ) d
  ),
  resolved as (
    select d.day,
      coalesce(
        (select w.is_workday from public.work_calendar_days w
          where w.factory_id = p_factory_id and w.day = d.day),
        extract(isodow from d.day) between 1 and 5
      ) as is_work
    from days d
  )
  select count(*)::int from resolved where is_work
$$;

-- =========================================================
-- 4) Resumo diário
-- =========================================================
create or replace function public.send_daily_summary()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_rule public.notification_rules%rowtype;
  v_dest public.notification_destinations%rowtype;
  v_today date := (now() at time zone 'America/Fortaleza')::date;
  v_year int := extract(year from v_today);
  v_month int := extract(month from v_today);
  v_msg text;
  v_lines text := '';
  v_pending text := '';
  f record;
  v_bill_day bigint; v_sales_day bigint;
  v_bill_month bigint; v_sales_month bigint;
  v_bill_goal bigint; v_sales_goal bigint;
  v_workdays int; v_remaining int;
  v_daily_goal numeric;
  v_pct_day numeric; v_pct_month numeric;
  v_idem text;
begin
  select * into v_rule from public.notification_rules
    where name = 'resumo_diario' and is_active limit 1;
  if not found then return; end if;

  if v_rule.destination_id is not null then
    select * into v_dest from public.notification_destinations
      where id = v_rule.destination_id and is_active;
  end if;
  if v_dest.chat_id is null then
    update public.notification_rules set last_run_at = now(),
      last_status = 'failed'::delivery_status where id = v_rule.id;
    return;
  end if;

  for f in select * from public.factories order by name loop
    select coalesce(sum(amount_cents),0) into v_bill_day
      from public.billing_entries where factory_id = f.id and reference_date = v_today;
    select coalesce(sum(amount_cents),0) into v_sales_day
      from public.sales_entries where factory_id = f.id and reference_date = v_today;
    select coalesce(sum(amount_cents),0) into v_bill_month
      from public.billing_entries
      where factory_id = f.id
        and reference_date >= date_trunc('month', v_today)::date
        and reference_date <= v_today;
    select coalesce(sum(amount_cents),0) into v_sales_month
      from public.sales_entries
      where factory_id = f.id
        and reference_date >= date_trunc('month', v_today)::date
        and reference_date <= v_today;

    select coalesce(billing_goal_cents,0), coalesce(sales_goal_cents,0)
      into v_bill_goal, v_sales_goal
      from public.goals where factory_id = f.id and year = v_year and month = v_month;
    v_bill_goal := coalesce(v_bill_goal, 0);
    v_sales_goal := coalesce(v_sales_goal, 0);

    v_workdays := public.workdays_in_month(f.id, v_year, v_month);
    v_remaining := public.workdays_remaining(f.id, v_today);
    v_daily_goal := case when v_workdays > 0 then v_bill_goal::numeric / v_workdays else 0 end;
    v_pct_day := case when v_daily_goal > 0 then (v_bill_day::numeric / v_daily_goal) * 100 else 0 end;
    v_pct_month := case when v_bill_goal > 0 then (v_bill_month::numeric / v_bill_goal) * 100 else 0 end;

    v_lines := v_lines
      || E'\n<b>🏭 ' || f.name || '</b>'
      || E'\n• Faturamento hoje: ' || public.fmt_brl(v_bill_day)
      || E'\n• Vendas hoje: ' || public.fmt_brl(v_sales_day)
      || E'\n• Meta do dia: ' || to_char(v_pct_day,'FM990D0') || '%'
      || E'\n• Meta do mês: ' || to_char(v_pct_month,'FM990D0') || '% ('
                              || public.fmt_brl(v_bill_month) || ' / '
                              || public.fmt_brl(v_bill_goal) || ')'
      || E'\n• Dias úteis restantes: ' || v_remaining
      || E'\n';

    if v_bill_day = 0 and v_sales_day = 0 then
      v_pending := v_pending || E'\n• ' || f.name;
    end if;
  end loop;

  v_msg := '<b>📊 Resumo diário — '
        || to_char(v_today,'DD/MM/YYYY') || '</b>' || E'\n' || v_lines;
  if length(v_pending) > 0 then
    v_msg := v_msg || E'\n<b>⚠️ Sem lançamento hoje:</b>' || v_pending;
  end if;

  v_idem := 'resumo_diario:' || to_char(v_today,'YYYY-MM-DD');
  perform public.notify_telegram(v_dest.chat_id, v_msg, v_rule.id, v_idem);

  update public.notification_rules
    set last_run_at = now(),
        next_run_at = (date_trunc('day', now() at time zone 'America/Fortaleza')
                       + interval '1 day'
                       + (coalesce((select value::text from public.app_settings
                                    where key='daily_summary_time'),'"18:00"')::jsonb #>> '{}')::interval)
                       at time zone 'America/Fortaleza'
    where id = v_rule.id;
end;
$$;

revoke all on function public.send_daily_summary() from public, anon, authenticated;

-- =========================================================
-- 5) Trigger: nova entrada + recorde do mês
-- =========================================================
create or replace function public.notify_new_entry()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_rule_name text;
  v_kind_label text;
  v_rule public.notification_rules%rowtype;
  v_dest public.notification_destinations%rowtype;
  v_record_rule public.notification_rules%rowtype;
  v_record_dest public.notification_destinations%rowtype;
  v_factory public.factories%rowtype;
  v_msg text;
  v_idem text;
  v_year int; v_month int;
  v_max_other bigint;
begin
  if TG_TABLE_NAME = 'sales_entries' then
    v_rule_name := 'entrada_vendas';
    v_kind_label := 'vendas';
  else
    v_rule_name := 'entrada_faturamento';
    v_kind_label := 'faturamento';
  end if;

  select * into v_factory from public.factories where id = NEW.factory_id;

  select * into v_rule from public.notification_rules where name = v_rule_name and is_active;
  if found and v_rule.destination_id is not null then
    select * into v_dest from public.notification_destinations
      where id = v_rule.destination_id and is_active;
    if v_dest.chat_id is not null then
      v_msg := '✅ <b>Lançamento de ' || v_kind_label || '</b>'
            || E'\n🏭 ' || v_factory.name
            || E'\n💰 ' || public.fmt_brl(NEW.amount_cents)
            || E'\n📅 ' || to_char(NEW.reference_date, 'DD/MM/YYYY');
      v_idem := 'entry:' || TG_TABLE_NAME || ':' || NEW.id::text;
      perform public.notify_telegram(v_dest.chat_id, v_msg, v_rule.id, v_idem);
    end if;
  end if;

  -- Recorde do mês
  v_year := extract(year from NEW.reference_date);
  v_month := extract(month from NEW.reference_date);

  if TG_TABLE_NAME = 'sales_entries' then
    select coalesce(max(amount_cents),0) into v_max_other
    from public.sales_entries
    where factory_id = NEW.factory_id
      and id <> NEW.id
      and extract(year from reference_date) = v_year
      and extract(month from reference_date) = v_month;
  else
    select coalesce(max(amount_cents),0) into v_max_other
    from public.billing_entries
    where factory_id = NEW.factory_id
      and id <> NEW.id
      and extract(year from reference_date) = v_year
      and extract(month from reference_date) = v_month;
  end if;

  if NEW.amount_cents > v_max_other and NEW.amount_cents > 0 then
    select * into v_record_rule from public.notification_rules
      where name = 'recorde_mes' and is_active;
    if found and v_record_rule.destination_id is not null then
      select * into v_record_dest from public.notification_destinations
        where id = v_record_rule.destination_id and is_active;
      if v_record_dest.chat_id is not null then
        v_msg := '🏆 <b>Novo recorde do mês!</b>'
              || E'\n🏭 ' || v_factory.name
              || E'\n📈 ' || initcap(v_kind_label) || ': ' || public.fmt_brl(NEW.amount_cents)
              || E'\n📅 ' || to_char(NEW.reference_date,'DD/MM/YYYY')
              || E'\n(anterior: ' || public.fmt_brl(v_max_other) || ')';
        v_idem := 'record:' || TG_TABLE_NAME || ':' || NEW.id::text;
        perform public.notify_telegram(v_record_dest.chat_id, v_msg, v_record_rule.id, v_idem);
      end if;
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_notify_new_sales on public.sales_entries;
create trigger trg_notify_new_sales
  after insert on public.sales_entries
  for each row execute function public.notify_new_entry();

drop trigger if exists trg_notify_new_billing on public.billing_entries;
create trigger trg_notify_new_billing
  after insert on public.billing_entries
  for each row execute function public.notify_new_entry();

-- =========================================================
-- 6) Pendência do dia + meta em risco
-- =========================================================
create or replace function public.notify_pending_and_risk()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_today date := (now() at time zone 'America/Fortaleza')::date;
  v_year int := extract(year from v_today);
  v_month int := extract(month from v_today);
  v_hh text := to_char(now() at time zone 'America/Fortaleza','HH24');
  v_pending_rule public.notification_rules%rowtype;
  v_pending_dest public.notification_destinations%rowtype;
  v_risk_rule public.notification_rules%rowtype;
  v_risk_dest public.notification_destinations%rowtype;
  v_threshold numeric;
  f record;
  v_has_today boolean;
  v_bill_month bigint;
  v_bill_goal bigint;
  v_workdays int;
  v_elapsed int;
  v_pace_pct numeric;
  v_idem text;
begin
  select * into v_pending_rule from public.notification_rules where name='pendencia_dia' and is_active;
  if found and v_pending_rule.destination_id is not null then
    select * into v_pending_dest from public.notification_destinations
      where id = v_pending_rule.destination_id and is_active;
  end if;

  select * into v_risk_rule from public.notification_rules where name='meta_em_risco' and is_active;
  if found and v_risk_rule.destination_id is not null then
    select * into v_risk_dest from public.notification_destinations
      where id = v_risk_rule.destination_id and is_active;
  end if;

  select coalesce((value->>'attention_pct')::numeric, 90) into v_threshold
    from public.app_settings where key='thresholds';

  for f in select * from public.factories order by name loop
    -- Pendência
    if v_pending_dest.chat_id is not null then
      select exists(select 1 from public.sales_entries
                    where factory_id = f.id and reference_date = v_today)
        into v_has_today;
      if not v_has_today then
        v_idem := 'pendencia:' || f.id::text || ':' || to_char(v_today,'YYYY-MM-DD') || ':' || v_hh;
        perform public.notify_telegram(
          v_pending_dest.chat_id,
          '⚠️ <b>' || f.name || '</b> ainda sem lançamento de vendas hoje ('
            || to_char(v_today,'DD/MM/YYYY') || ' ' || v_hh || 'h).',
          v_pending_rule.id, v_idem);
      end if;
    end if;

    -- Meta em risco (ritmo)
    if v_risk_dest.chat_id is not null then
      select coalesce(sum(amount_cents),0) into v_bill_month
        from public.billing_entries
        where factory_id = f.id
          and reference_date >= date_trunc('month', v_today)::date
          and reference_date <= v_today;
      select coalesce(billing_goal_cents,0) into v_bill_goal
        from public.goals where factory_id=f.id and year=v_year and month=v_month;
      v_workdays := public.workdays_in_month(f.id, v_year, v_month);
      v_elapsed := public.workdays_elapsed(f.id, v_today);

      if v_bill_goal > 0 and v_elapsed > 0 and v_workdays > 0 then
        v_pace_pct := ((v_bill_month::numeric / v_elapsed) * v_workdays
                       / v_bill_goal::numeric) * 100;
        if v_pace_pct < v_threshold then
          v_idem := 'risco:' || f.id::text || ':' || to_char(v_today,'YYYY-MM-DD') || ':' || v_hh;
          perform public.notify_telegram(
            v_risk_dest.chat_id,
            '📉 <b>' || f.name || '</b> — ritmo atual indica '
              || to_char(v_pace_pct,'FM990D0') || '% da meta do mês (limite '
              || to_char(v_threshold,'FM990') || '%).',
            v_risk_rule.id, v_idem);
        end if;
      end if;
    end if;
  end loop;

  if v_pending_rule.id is not null then
    update public.notification_rules
      set last_run_at = now() where id = v_pending_rule.id;
  end if;
  if v_risk_rule.id is not null then
    update public.notification_rules
      set last_run_at = now() where id = v_risk_rule.id;
  end if;
end;
$$;

revoke all on function public.notify_pending_and_risk() from public, anon, authenticated;

-- =========================================================
-- Seed das regras (idempotente)
-- =========================================================
insert into public.notification_rules (name, description, rule_type, schedule_cron, schedule_label, is_active)
values
  ('resumo_diario','Resumo executivo diário consolidado por fábrica.','scheduled','0 21 * * *','Diariamente 18:00 (America/Fortaleza)', true),
  ('entrada_vendas','Aviso a cada novo lançamento de vendas.','event',null,'Em tempo real', true),
  ('entrada_faturamento','Aviso a cada novo lançamento de faturamento.','event',null,'Em tempo real', true),
  ('recorde_mes','Aviso quando um lançamento bate o recorde do mês.','event',null,'Em tempo real', true),
  ('pendencia_dia','Aviso de fábricas sem lançamento de vendas.','scheduled','0 14,20 * * *','11:00 e 17:00 (America/Fortaleza)', true),
  ('meta_em_risco','Aviso quando o ritmo do mês indica abaixo do limiar.','scheduled','0 14,20 * * *','11:00 e 17:00 (America/Fortaleza)', true)
on conflict do nothing;

-- =========================================================
-- Jobs pg_cron (cron usa UTC; Fortaleza = UTC-3)
--  18:00 BRT  -> 21:00 UTC
--  11:00 BRT  -> 14:00 UTC
--  17:00 BRT  -> 20:00 UTC
-- =========================================================
do $$
begin
  perform cron.unschedule('ley_send_daily_summary');
exception when others then null; end $$;
do $$
begin
  perform cron.unschedule('ley_notify_pending_and_risk');
exception when others then null; end $$;

select cron.schedule('ley_send_daily_summary', '0 21 * * *',
  $$ select public.send_daily_summary(); $$);

select cron.schedule('ley_notify_pending_and_risk', '0 14,20 * * *',
  $$ select public.notify_pending_and_risk(); $$);
