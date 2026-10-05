-- TABELA DIÁRIA (imagem) no Telegram — 17:15 America/Fortaleza.
-- Monta Matriz / Filial / Total (faturamento, vendas, carteira, trocas, % trocas),
-- codifica em JSON base64url e manda sendPhoto com a URL da função tabela-png,
-- que desenha a tabela estilo Excel. Mesmo destino do resumo diário.

create or replace function public.send_daily_table()
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'vault'
as $function$
declare
  v_rule public.notification_rules%rowtype;
  v_dest public.notification_destinations%rowtype;
  v_today date := (now() at time zone 'America/Fortaleza')::date;
  v_token text;
  f record;
  v_bill bigint; v_sales bigint; v_cart bigint; v_tr bigint;
  v_tot_bill bigint := 0; v_tot_sales bigint := 0; v_tot_cart bigint := 0;
  v_tot_tr bigint := 0; v_tot_prod bigint := 0; v_any boolean := false; v_all boolean := true;
  v_att numeric; v_crit numeric; v_pct numeric;
  v_rows jsonb := '[]'::jsonb;
  v_label text; v_tr_txt text; v_pct_txt text; v_color text;
  v_data jsonb; v_b64 text; v_photo text; v_payload jsonb; v_req bigint; v_idem text;
begin
  select * into v_rule from public.notification_rules where name = 'tabela_diaria' limit 1;
  if not found then return; end if;
  select * into v_dest from public.notification_destinations
    where id = v_rule.destination_id and is_active;
  if v_dest.chat_id is null then
    update public.notification_rules set last_run_at = now(), last_status = 'failed'::delivery_status
      where id = v_rule.id;
    return;
  end if;

  select (value->>'atencao')::numeric, (value->>'critico')::numeric into v_att, v_crit
    from public.app_settings where key = 'trocas_thresholds';
  v_att := coalesce(v_att, 5); v_crit := coalesce(v_crit, 10);

  for f in select * from public.factories
           order by case code when 'eusebio' then 1 when 'timon' then 2 else 3 end, name
  loop
    select coalesce(sum(amount_cents),0) into v_bill from public.billing_entries
      where factory_id = f.id and reference_date = v_today;
    select coalesce(sum(amount_cents),0) into v_sales from public.sales_entries
      where factory_id = f.id and reference_date = v_today;
    v_cart := (select coalesce(sum(amount_cents),0) from public.sales_entries where factory_id = f.id)
            - (select coalesce(sum(amount_cents),0) from public.billing_entries where factory_id = f.id)
            + (select coalesce(sum(amount_cents),0) from public.carteira_adjustments where factory_id = f.id);
    v_tr := null;
    select amount_cents into v_tr from public.production_exchanges
      where factory_id = f.id and reference_date = v_today;

    v_label := case f.code when 'eusebio' then 'Matriz · CE' when 'timon' then 'Filial · MA' else f.name end;
    if v_tr is null then
      v_tr_txt := 'não informada'; v_pct_txt := '—'; v_color := '#6b7280'; v_all := false;
    else
      v_pct := case when v_bill + v_tr > 0 then 100.0 * v_tr / (v_bill + v_tr) else 0 end;
      v_tr_txt := public.format_brl(v_tr);
      v_pct_txt := public.format_pct_br(v_pct) || case when v_pct >= v_crit then ' Crítico'
                                                       when v_pct >= v_att then ' Atenção' else ' Normal' end;
      v_color := case when v_pct >= v_crit then '#dc2626' when v_pct >= v_att then '#d97706' else '#16a34a' end;
      v_any := true; v_tot_tr := v_tot_tr + v_tr; v_tot_prod := v_tot_prod + v_bill + v_tr;
    end if;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'c', jsonb_build_array(v_label, public.format_brl(v_bill), public.format_brl(v_sales),
                             public.format_brl(v_cart), v_tr_txt, v_pct_txt),
      'x', jsonb_build_array(null, null, null, null,
                             case when v_tr is null then '#6b7280' end, v_color)));
    v_tot_bill := v_tot_bill + v_bill; v_tot_sales := v_tot_sales + v_sales; v_tot_cart := v_tot_cart + v_cart;
  end loop;

  if v_any then
    v_pct := case when v_tot_prod > 0 then 100.0 * v_tot_tr / v_tot_prod else 0 end;
    v_tr_txt := public.format_brl(v_tot_tr) || case when v_all then '' else '*' end;
    v_pct_txt := public.format_pct_br(v_pct);
    v_color := case when v_pct >= v_crit then '#dc2626' when v_pct >= v_att then '#d97706' else '#16a34a' end;
  else
    v_tr_txt := 'não informada'; v_pct_txt := '—'; v_color := '#6b7280';
  end if;
  v_rows := v_rows || jsonb_build_array(jsonb_build_object('k', 'total',
    'c', jsonb_build_array('Total', public.format_brl(v_tot_bill), public.format_brl(v_tot_sales),
                           public.format_brl(v_tot_cart), v_tr_txt, v_pct_txt),
    'x', jsonb_build_array(null, null, null, null, null, v_color)));

  v_data := jsonb_build_object(
    't', 'Status de hoje — ' || to_char(v_today, 'DD/MM'),
    's', 'Ley Colchões · posição às ' || to_char(now() at time zone 'America/Fortaleza', 'HH24:MI'),
    'h', jsonb_build_array('Unidade', 'Faturamento', 'Vendas', 'Carteira', 'Trocas', '% Trocas'),
    'r', v_rows,
    'f', case when v_any and not v_all then '* Total de trocas parcial (sem a unidade não informada). '
              else '' end
         || 'Trocas não são faturamento. % = trocas ÷ (faturamento + trocas).');

  v_b64 := rtrim(translate(replace(encode(convert_to(v_data::text, 'UTF8'), 'base64'), E'\n', ''),
                           '+/', '-_'), '=');
  v_photo := 'https://divfjtrswewwtqcmbczz.supabase.co/functions/v1/tabela-png?d=' || v_b64;
  v_payload := jsonb_build_object('chat_id', v_dest.chat_id, 'photo', v_photo,
    'caption', '📊 Status de hoje — ' || to_char(v_today, 'DD/MM'));
  v_idem := 'tabela_diaria:' || to_char(v_today, 'YYYY-MM-DD') || ':' ||
            to_char(now() at time zone 'America/Fortaleza', 'HH24MISS');

  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'telegram_bot_token' limit 1;
  if v_token is null or v_token = '' then
    insert into public.notification_delivery_logs (rule_id, destination_id, status, payload, error, idempotency_key)
      values (v_rule.id, v_dest.id, 'failed', v_payload, 'telegram_bot_token ausente no Vault', v_idem);
    update public.notification_rules set last_run_at = now(), last_status = 'failed' where id = v_rule.id;
    return;
  end if;

  select net.http_post(url := 'https://api.telegram.org/bot' || v_token || '/sendPhoto',
                       headers := '{"Content-Type":"application/json"}'::jsonb,
                       body := v_payload, timeout_milliseconds := 20000) into v_req;
  insert into public.notification_delivery_logs (rule_id, destination_id, status, payload, response, idempotency_key)
    values (v_rule.id, v_dest.id, 'sent', v_payload, jsonb_build_object('request_id', v_req), v_idem);
  update public.notification_rules set last_run_at = now(), last_status = 'sent',
    next_run_at = (date_trunc('day', now() at time zone 'America/Fortaleza') + interval '1 day 17 hours 15 minutes')
                  at time zone 'America/Fortaleza'
    where id = v_rule.id;
end;
$function$;

grant execute on function public.send_daily_table() to authenticated;

insert into public.notification_rules (name, description, rule_type, destination_id, schedule_cron, schedule_label, is_active)
select 'tabela_diaria', 'Tabela (imagem) Matriz / Filial / Total: faturamento, vendas, carteira e trocas.',
       'scheduled', (select destination_id from public.notification_rules where name = 'resumo_diario' limit 1),
       '15 20 * * *', 'Diariamente 17:15 (America/Fortaleza)', true
where not exists (select 1 from public.notification_rules where name = 'tabela_diaria');

do $$ begin perform cron.unschedule('ley_send_daily_table'); exception when others then null; end $$;
select cron.schedule('ley_send_daily_table', '15 20 * * *', $$ select public.send_daily_table(); $$);
