# Painel Ley Colchões — Plano Atualizado

Direção visual ancorada na referência anexada. Todas as regras de negócio, permissões, lançamentos, metas, auditoria e notificações Telegram previamente acordadas permanecem **inalteradas**; este plano apenas redefine a camada de apresentação, componentes e comportamento responsivo.

## 1. Identidade Visual

- Produto: **Painel Ley Colchões** (fábricas Eusébio · CE e Timon · MA).
- Estética: executiva, premium, sóbria, minimalista.
- Tema escuro único, azul-marinho quase preto.
- Bordas de card azuladas discretas, cantos arredondados (radius médio), sombras muito sutis.
- Azul-claro como cor de marca/ação; branco para texto principal; azul acinzentado para texto secundário.
- Tipografia Inter (ou equivalente) com **font-variant-numeric: tabular-nums** em todos os valores.
- Proibido: glassmorphism exagerado, neon, gradientes fortes, animações decorativas.

### Tokens (src/styles.css, oklch)

```
--background        navy quase preto
--surface           navy levemente mais claro (cards)
--surface-elevated  card destacado (consolidado)
--border-subtle     azul translúcido baixo contraste
--foreground        branco
--muted-foreground  azul acinzentado
--primary           azul-claro de marca
--primary-foreground navy escuro
--success / --warning / --danger / --info  (uso discreto, semântico)
--chart-line, --chart-area  (azul-claro com área translúcida)
```

Mapear em `@theme inline` para gerar utilities (`bg-surface`, `text-muted-foreground`, etc.). Nenhuma cor hardcoded em componentes.

## 2. Estrutura de Navegação

| Item | Acesso |
|---|---|
| Dashboard | todos |
| Lançamentos | operadores + admin |
| Metas | gestores + admin |
| Histórico | todos (escopo conforme permissão) |
| Notificações | todos |
| Administração | apenas autorizados |

- **Desktop:** sidebar vertical compacta (ícone + label), colapsável, item ativo com barra azul-claro à esquerda.
- **Mobile:** bottom navigation com os 5 itens principais; Administração acessível via overflow.

## 3. Dashboard — Composição

Cabeçalho:
- Título "Ley Colchões".
- Seletor de período (Hoje · Semana · Mês · Personalizado).
- Indicador "Dia X de Y" dentro do período.
- Pill de atualização em tempo real: ponto pulsante + texto **"Atualizado às HH:MM"** (nunca apenas o horário solto).

Grid de cards (ordem da referência):
1. **Total Ley Colchões** (consolidado, card destacado com borda azul-clara levemente mais forte).
2. **Eusébio · CE**.
3. **Timon · MA**.

Cada card exibe:
- Nome da fábrica + badge de status (no prazo / atenção / abaixo).
- Bloco grande: Faturamento de hoje (R$) e Vendas de hoje (un).
- Bloco secundário: Acumulado do mês, Meta mensal de faturamento, Meta mensal de vendas.
- Barra de progresso horizontal com **percentual mensal alinhado à direita**.
- Valor restante para meta ("Faltam R$ X · Y unidades").
- Mini gráfico de evolução (sparkline area, dados reais, tooltip ao hover/tap).

Área complementar (desktop, abaixo/à direita):
- Insights do dia (3–4 itens curtos).
- Pendências (lançamentos não confirmados, em vermelho discreto).
- Últimas atualizações (timeline curta com autor + horário).

## 4. Regras do Card Consolidado

Nunca editável. Calculado em tempo de render:

```
faturamento_total = faturamento_eusebio + faturamento_timon
vendas_total      = vendas_eusebio + vendas_timon
meta_total        = meta_eusebio + meta_timon
percentual_total  = realizado_total / meta_total
```

**Proibido** calcular o percentual consolidado como média dos percentuais das fábricas.

## 5. Clareza dos Indicadores

Cada número exibido carrega rótulo de período explícito. Layout dentro do card:

```
HOJE                          MÊS
Faturamento  R$ ...           Acumulado     R$ ...
Vendas       ... un           Meta fatur.   R$ ...
                              Meta vendas   ... un
                              % atingido    ...%  ▓▓▓▓░░
                              Restante      R$ ... · ... un
```

Diário e mensal nunca compartilham o mesmo número sem rótulo de período.

## 6. Estados Visuais

Semânticos, sempre em tom discreto sobre o azul dominante:

- **Verde** — meta atingida.
- **Amarelo** — atenção (ritmo abaixo do esperado).
- **Vermelho** — lançamento pendente / erro.
- **Azul** — situação normal.

Estados de tela obrigatórios para cada superfície de dados:
1. Loading (skeleton com shimmer sutil).
2. Empty (ilustração mínima + CTA).
3. Erro (mensagem + retry).
4. Lançamento pendente (badge + ação rápida).
5. Atualização concluída (toast curto, canto inferior).

## 7. Responsividade

**Desktop (≥1024px)**
- Sidebar lateral compacta fixa.
- Consolidado em destaque (largura maior ou linha própria).
- Eusébio e Timon lado a lado.
- Coluna direita para insights/pendências/últimas atualizações.

**Tablet (640–1023px)**
- Sidebar colapsa em ícones.
- Consolidado em linha cheia; fábricas em 2 colunas.

**Celular (<640px)**
- Bottom navigation.
- Cards empilhados na ordem da referência.
- Tipografia escalonada para legibilidade sem rolagem horizontal.
- FAB para "Novo lançamento".
- Formulários em sheet inferior, foco em uma mão (CTAs largos na parte de baixo).

Padrão de header responsivo: `grid-cols-[minmax(0,1fr)_auto]` mobile → `flex` no `sm:`, com `min-w-0` nos containers de texto e `shrink-0` em ícones.

## 8. Tela de Notificações (Telegram)

Mesma identidade visual. Duas abas: **Regras** e **Histórico**.

Lista de regras (card por linha):
- Nome/descrição da regra.
- Destinatário (chat/usuário Telegram).
- Horário programado (cron amigável: "Diário às 18:00").
- Status do envio (ícone semântico).
- Última execução (relativo + absoluto no tooltip).
- Toggle ativar/desativar.

Histórico:
- Tabela densa com filtro por regra, status e período.
- Linha expansível mostrando payload enviado e resposta da API.

## 9. Componentes a Criar/Refinar

- `AppShell` (sidebar desktop + bottom-nav mobile + header).
- `PeriodSelector` com indicador "Dia X de Y" e pill "Atualizado às HH:MM".
- `FactoryCard` (variant: `consolidated | factory`) com slots para sparkline e progress.
- `MetricBlock` (rótulo de período + valor tabular + delta opcional).
- `ProgressBar` com percentual à direita e cor semântica.
- `Sparkline` (Recharts ou SVG próprio, tooltip obrigatório, dados reais).
- `StatusBadge`, `StatePanel` (loading/empty/error), `UpdateToast`.
- `InsightsPanel`, `PendingPanel`, `RecentUpdatesPanel`.
- `NotificationRuleCard`, `NotificationHistoryTable`.

## 10. Detalhes Técnicos

- TanStack Start já configurado; rotas separadas para Dashboard, Lançamentos, Metas, Histórico, Notificações, Administração (com guard).
- Cada rota define `head()` com title/description próprios.
- Dados via TanStack Query (`ensureQueryData` no loader + `useSuspenseQuery` no componente).
- Cálculo do consolidado em selector puro, derivado dos dados das fábricas; nunca persistido.
- Sparklines recebem série temporal real do backend; sem mocks decorativos.
- Permissões, lançamentos, metas, auditoria e Telegram **mantêm a implementação acordada**; este plano só altera UI/UX e componentes de apresentação.

## 11. Fora de Escopo Desta Iteração

- Mudanças em schema, RLS, regras de auditoria ou lógica de notificação.
- Light theme (apenas tema escuro).
- Animações decorativas além de transições funcionais (hover, focus, toast).

---

Aguardando aprovação antes de implementar.