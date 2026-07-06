Executar limpeza de dados operacionais de teste via SQL no banco, sem alterar código nem outras tabelas.

## O que será feito

Rodar uma única operação de dados que esvazia estas 4 tabelas:

- `sales_entries` — lançamentos de vendas
- `billing_entries` — lançamentos de faturamento
- `audit_logs` — histórico de auditoria
- `notification_delivery_logs` — logs de envio de notificações

Tabelas preservadas intactas: `factories`, `profiles`, `user_roles`, `user_permissions`, `user_factory_access`, `goals`, `work_calendar_days`, `notification_rules`, `notification_destinations`.

## Detalhes técnicos

- Ferramenta usada: data-change (DELETE). Como a ferramenta de dados aceita apenas INSERT/UPDATE/DELETE (não TRUNCATE), será usado `DELETE FROM` em cada tabela. Efeito prático é o mesmo: as 4 tabelas ficam vazias.
- Não há sequences numéricas próprias nessas tabelas (IDs são UUID), então `RESTART IDENTITY` não se aplica.
- Ordem de execução escolhida para respeitar FKs: `notification_delivery_logs` → `audit_logs` → `sales_entries` → `billing_entries`.
- Nenhum arquivo de código será alterado.

## Aviso

A operação é irreversível — todos os lançamentos, logs de auditoria e logs de entrega atuais serão apagados. Confirme antes de eu executar.
