## Diagnóstico

Banco hoje (junho/2026):
- Eusébio · faturamento: **R$ 5.000.000,00** (500.000.000 centavos)
- Timon · faturamento: **R$ 2,50** (250 centavos)

Somando: R$ 5.000.002,50 → o card consolidado arredonda para **R$ 5.000.003**. Ou seja, a soma está correta — o problema é que a meta de Timon nunca foi regravada depois do fix do parser; continua valendo R$ 2,50, salva quando "2.500.000" virava 250 centavos.

## Plano

1. **Corrigir o dado em produção**
   - Migration única para atualizar `goals` de Timon (junho/2026) para `billing_goal_cents = 250000000` (R$ 2.500.000,00). Mantém `sales_goal_cents` como está (0).

2. **Evitar repetição do erro na UI de Metas (`src/routes/_authenticated/metas.tsx` + `src/lib/format.ts`)**
   - `centsToBRLInput`: passar a formatar com separador de milhar (`2.500.000,00`) para o valor atual ficar legível dentro do input — hoje devolve apenas `2,50`, o que confunde quando o usuário reabre o formulário.
   - `GoalCard`: ao clicar em **Salvar**, exibir um diálogo de confirmação quando o novo valor for **menor que 10%** do valor atual e o atual for ≥ R$ 100.000 (protege contra typo tipo "2,50" sobrescrevendo R$ 5M).
   - Mostrar abaixo do input o preview formatado em BRL do valor digitado (`= R$ 2.500.000,00`) para feedback imediato antes de salvar.

3. **Verificação**
   - Após migration: rodar `SELECT` nas metas para confirmar Timon = 250.000.000.
   - Recarregar `/metas` e `/` e conferir consolidado = R$ 7.500.000.

## Fora de escopo

- Nenhuma mudança nas regras de negócio, RLS, auditoria, lançamentos ou Telegram.
- Sem alteração no cálculo do consolidado (já é soma absoluta correta).
