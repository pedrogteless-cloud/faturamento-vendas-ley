-- TROCAS NA PRODUÇÃO — linha no resumo diário do Telegram.
-- Mantém o resumo atual intacto (faturamento, vendas, carteira e TOTAL não mudam)
-- e acrescenta a linha de trocas por fábrica + lembrete quando não informada.

create or replace function public.format_pct_br(p numeric)
returns text
language sql
immutable
set search_path = public
as $$
  select case when p is null then '—'
              else replace(to_char(round(p, 1), 'FM990.0'), '.', ',') || '%' end
$$;

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
  v_month_start date := date_trunc('month', (now() at time zone 'America/Fortaleza'))::date;
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
  -- trocas na produção
  v_att numeric;
  v_crit numeric;
  v_tr_day bigint;
  v_tr_m bigint;
  v_prod_m bigint;
  v_pct numeric;
  v_pct_m numeric;
  v_sit text;
  v_cons_tr bigint := 0;
  v_cons_prod bigint := 0;
  v_cons_ok boolean := true;
  v_missing text := '';
  v_any boolean := false;
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

  select (value->>'atencao')::numeric, (value->>'critico')::numeric
    into v_att, v_crit
    from public.app_settings where key = 'trocas_thresholds';
  v_att := coalesce(v_att, 5);
  v_crit := coalesce(v_crit, 10);

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

    -- Trocas do dia (NULL ou sem registro = não informado; 0 = não houve troca)
    v_tr_day := null;
    select amount_cents into v_tr_day
      from public.production_exchanges
      where factory_id = f.id and reference_date = v_today;

    -- Acumulado do mês ponderado: Σ trocas ÷ Σ (faturamento + trocas) dos dias informados
    select coalesce(sum(t.amount_cents), 0),
           coalesce(sum(t.amount_cents + coalesce(b.bill, 0)), 0)
      into v_tr_m, v_prod_m
      from public.production_exchanges t
      left join (
        select reference_date, sum(amount_cents) as bill
        from public.billing_entries
        where factory_id = f.id and reference_date between v_month_start and v_today
        group by reference_date
      ) b on b.reference_date = t.reference_date
      where t.factory_id = f.id
        and t.amount_cents is not null
        and t.reference_date between v_month_start and v_today;
    v_pct_m := case when v_prod_m > 0 then 100.0 * v_tr_m / v_prod_m
                    when exists (select 1 from public.production_exchanges
                                 where factory_id = f.id and amount_cents is not null
                                   and reference_date between v_month_start and v_today)
                      then 0
                    else null end;

    if v_tr_day is not null then
      v_pct := case when (v_bill_day + v_tr_day) > 0
                    then 100.0 * v_tr_day / (v_bill_day + v_tr_day) else 0 end;
      v_sit := case when v_pct >= v_crit then '🔴 <b>CRÍTICO</b>'
                    when v_pct >= v_att then '🟡 Atenção'
                    else '🟢 Normal' end;
      v_sub := v_sub
        || E'\n🔁 Trocas na produção (não geram a receber): ' || public.format_brl(v_tr_day)
        || ' = ' || public.format_pct_br(v_pct) || ' da produção — ' || v_sit
        || '. Mês: ' || public.format_pct_br(v_pct_m);
      v_any := true;
      v_cons_tr := v_cons_tr + v_tr_day;
      v_cons_prod := v_cons_prod + v_bill_day + v_tr_day;
    else
      v_sub := v_sub
        || E'\n⚠️ Trocas na produção: <b>não informada hoje</b> — lançar no sistema. Mês: '
        || public.format_pct_br(v_pct_m);
      v_cons_ok := false;
      v_missing := v_missing || case when v_missing = '' then '' else ', ' end
        || case f.code when 'eusebio' then 'Matriz' when 'timon' then 'Filial' else f.name end;
    end if;

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

  -- Trocas sob o total (valor e % da produção). Parcial se alguma fábrica não informou.
  if v_any then
    v_msg := v_msg
      || E'\n🔁 Trocas na produção (não geram a receber): ' || public.format_brl(v_cons_tr)
      || ' = ' || public.format_pct_br(case when v_cons_prod > 0
                                            then 100.0 * v_cons_tr / v_cons_prod else 0 end)
      || ' da produção'
      || case when v_cons_ok then '' else ' — parcial (não informada: ' || v_missing || ')' end;
  else
    v_msg := v_msg || E'\n⚠️ Trocas na produção: <b>não informada hoje</b>';
  end if;

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

grant execute on function public.send_daily_summary() to authenticated;
