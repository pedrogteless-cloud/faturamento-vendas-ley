## Diagnóstico

**1. Lançamentos não aceitam zero**
`src/routes/_authenticated/lancamentos.tsx` rejeita o valor antes de enviar:
```ts
if (cents <= 0) throw new Error("Informe um valor maior que zero.");
```
O backend (`upsertEntry` em `src/lib/entries.functions.ts`) e o schema já aceitam `min(0)`. Só a UI bloqueia.

**2. Meta consolidada "errada"**
A soma no `getDashboard` está correta (soma absoluta dos `billing_goal_cents` das fábricas, sem média de percentuais). O problema real está no **parser de entrada** e no **estado inicial** do formulário de metas (`src/routes/_authenticated/metas.tsx`):

- O valor inicial é gerado com `centsToBRL(...).replace(/\D/g, c => c)` — um no-op que devolve `"R$ 5.000.000"`. O usuário edita por cima dessa string com `R$` e pontos.
- `brlInputToCents` em `src/lib/format.ts` trata `"."` como separador decimal quando não há vírgula: `parseFloat("5.000.000") = 5` → salva **500 centavos** em vez de R$ 5.000.000,00.
- Confirmado no banco: Eusébio = 500.000.000 (R$ 5M) e Timon = **250** (R$ 2,50). O consolidado soma corretamente esses dois números, mas um deles foi gravado errado por causa do parser. O usuário percebe como "a meta consolidada não bate".

## Mudanças

### A. Permitir zero em lançamentos
- `src/routes/_authenticated/lancamentos.tsx`: trocar `if (cents <= 0)` por `if (cents < 0)` e ajustar a mensagem ("Informe um valor maior ou igual a zero.").
- Manter `required` no input mas aceitar `"0"` / `"0,00"`.
- Servidor e schema (`min(0)`) já permitem — sem mudanças.

### B. Corrigir parser e formulário de metas
- `src/lib/format.ts` → reescrever `brlInputToCents` para tratar pontos como separador de milhar sempre que **não** houver vírgula E o último grupo após o ponto tiver exatamente 3 dígitos (ex.: `"5.000.000"` → 500000000 centavos). Quando houver vírgula, manter regra atual (pontos = milhar, vírgula = decimal). Adicionar testes manuais cobrindo: `"0"`, `"0,00"`, `"1.234,56"`, `"5.000.000"`, `"1234.56"`, `"R$ 5.000.000,00"`.
- `src/routes/_authenticated/metas.tsx`:
  - Estado inicial usa um novo helper `centsToBRLInput(cents)` que devolve apenas dígitos + vírgula (ex.: `"5000000,00"` ou vazio quando zero), sem `R$` nem pontos.
  - Reidratar o estado quando `billingCents` / `salesCents` mudam (ex.: ao trocar mês). Hoje o `useState` inicial só roda uma vez.
  - Permitir salvar zero (mensagem "Meta salva.").

### C. Backfill da meta corrompida de Timon (junho/2026)
- Tela de metas continua funcionando; após o fix, o usuário pode regravar a meta correta. Não vamos sobrescrever o valor automaticamente para não destruir um lançamento legítimo — apenas garantir que daqui pra frente a gravação seja correta.

### D. Contexto para o Claude Code
Gerar e exibir no chat um bloco pronto pra colar, explicando o domínio, os arquivos relevantes, as convenções (centavos em bigint, fuso America/Fortaleza, RLS via `requireSupabaseAuth`, server fns em `src/lib/*.functions.ts`, regra do consolidado ser soma absoluta), e a tarefa pedida. Sem arquivo novo — só a mensagem.

## Fora de escopo
- Mudar schema do banco.
- Alterar regras de auditoria, permissões ou Telegram.
- Refatorar identidade visual.

## Validação
- Cadastrar lançamento com valor `0,00` e ver na lista "Últimos lançamentos" + auditoria.
- Regravar meta de Timon como `R$ 5.000.000,00` e conferir o card consolidado = R$ 10.000.000.
- Trocar mês na tela de metas e ver os inputs reidratarem com o valor salvo.
