
-- PARTE 1
create table if not exists public.carteira_adjustments (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references public.factories(id) on delete restrict,
  amount_cents bigint not null,
  note text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_carteira_adj_factory on public.carteira_adjustments (factory_id, created_at desc);
grant select, insert, delete on public.carteira_adjustments to authenticated;
grant all on public.carteira_adjustments to service_role;
alter table public.carteira_adjustments enable row level security;

drop policy if exists "carteira_adj_select" on public.carteira_adjustments;
create policy "carteira_adj_select" on public.carteira_adjustments for select to authenticated using (public.has_factory_access(auth.uid(), factory_id));
drop policy if exists "carteira_adj_insert_admin" on public.carteira_adjustments;
create policy "carteira_adj_insert_admin" on public.carteira_adjustments for insert to authenticated with check (public.is_active_user(auth.uid()) and public.has_role(auth.uid(), 'admin'));
drop policy if exists "carteira_adj_delete_admin" on public.carteira_adjustments;
create policy "carteira_adj_delete_admin" on public.carteira_adjustments for delete to authenticated using (public.is_active_user(auth.uid()) and public.has_role(auth.uid(), 'admin'));

-- PARTE 2
create or replace function public.format_brl(cents bigint)
returns text
language sql
immutable
set search_path = public
as $$
  select 'R$ ' || replace(replace(replace(
    to_char(coalesce(cents,0)/100.0, 'FM999G999G990D00'),
    ',', '#'), '.', ','), '#', '.')
$$;

-- PARTE 3
create or replace function public.send_daily_summary()
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_rule public.notification_rules%rowtype;
  v_dest public.notification_destinations%rowtype;
  v_today date := (now() at time zone 'America/Fortaleza')::date;
  v_msg text;
  v_body text := '';
  f record;
  v_bill_day bigint;
  v_sales_day bigint;
  v_sales_all bigint;
  v_bill_all bigint;
  v_adj_all bigint;
  v_carteira bigint;
  v_label text;
  v_sub text;
  v_tot_bill bigint := 0;
  v_tot_sales bigint := 0;
  v_tot_carteira bigint := 0;
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

  for f in
    select * from public.factories
    order by case code when 'eusebio' then 1 when 'timon' then 2 else 3 end, name
  loop
    select coalesce(sum(amount_cents),0) into v_bill_day
      from public.billing_entries where factory_id = f.id and reference_date = v_today;
    select coalesce(sum(amount_cents),0) into v_sales_day
      from public.sales_entries where factory_id = f.id and reference_date = v_today;

    select coalesce(sum(amount_cents),0) into v_sales_all
      from public.sales_entries where factory_id = f.id;
    select coalesce(sum(amount_cents),0) into v_bill_all
      from public.billing_entries where factory_id = f.id;
    select coalesce(sum(amount_cents),0) into v_adj_all
      from public.carteira_adjustments where factory_id = f.id;
    v_carteira := v_sales_all - v_bill_all + v_adj_all;

    if f.code = 'eusebio' then
      v_label := '🏭 <b>MATRIZ</b> (Eusébio · CE)';
    elsif f.code = 'timon' then
      v_label := '🏭 <b>FILIAL</b> (Timon · MA)';
    else
      v_label := '🏭 <b>' || upper(f.name) || '</b>';
    end if;

    v_sub := v_label
      || E'\n💰 Faturamento: ' || public.format_brl(v_bill_day)
      || E'\n🛒 Vendas: ' || public.format_brl(v_sales_day)
      || E'\n📦 Carteira: ' || public.format_brl(v_carteira);

    v_body := v_body || E'\n\n' || v_sub;

    v_tot_bill := v_tot_bill + v_bill_day;
    v_tot_sales := v_tot_sales + v_sales_day;
    v_tot_carteira := v_tot_carteira + v_carteira;
  end loop;

  v_msg := '📊 <b>STATUS DE HOJE — ' || to_char(v_today,'DD/MM') || '</b>'
        || E'\nLey Colchões'
        || v_body
        || E'\n\n📈 <b>TOTAL LEY COLCHÕES</b>'
        || E'\n💰 Faturamento: ' || public.format_brl(v_tot_bill)
        || E'\n🛒 Vendas: ' || public.format_brl(v_tot_sales)
        || E'\n📦 Carteira: ' || public.format_brl(v_tot_carteira);

  v_idem := 'resumo_diario:' || to_char(v_today,'YYYY-MM-DD') || ':' || to_char(now(),'HH24MI');
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
$function$;
