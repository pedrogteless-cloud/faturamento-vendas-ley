-- Seed das regras de notificação do bot do Telegram.
-- Os destinos (chat_id) são cadastrados pela UI em /notificacoes; as regras
-- abaixo ficam sem destination_id até alguém vincular um destino.
INSERT INTO public.notification_rules (name, description, rule_type, schedule_cron, schedule_label, is_active) VALUES
  ('entrada_vendas', 'Alerta instantâneo a cada novo lançamento de vendas.', 'instant_entry_sales', NULL, 'Ao registrar', true),
  ('entrada_faturamento', 'Alerta instantâneo a cada novo lançamento de faturamento.', 'instant_entry_billing', NULL, 'Ao registrar', true),
  ('recorde_mes', 'Alerta quando um lançamento bate o maior valor do mês até agora.', 'instant_record', NULL, 'Ao registrar', true),
  ('resumo_diario', 'Resumo diário de faturamento, vendas e progresso da meta.', 'daily_summary', '0 18 * * *', '18:00', true),
  ('pendencia_dia', 'Aviso de fábricas sem lançamento até o horário definido.', 'pending_check', '0 11,17 * * *', '11:00 e 17:00', true),
  ('meta_em_risco', 'Aviso quando o ritmo do mês indica fechar abaixo do threshold de meta.', 'goal_at_risk', '0 11,17 * * *', '11:00 e 17:00', true);
