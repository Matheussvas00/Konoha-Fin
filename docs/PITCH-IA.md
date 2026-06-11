# Konoha Fin — Assistente Financeiro **Multiagente**

> Pitch para a disciplina de IA · Tema: **sistemas multiagentes de IA**

## 1. Problema

Apps de finanças pessoais exigem que o usuário **navegue por telas e preencha
formulários** para registrar gastos e para entender para onde o dinheiro vai.
Isso gera atrito: as pessoas desistem de lançar despesas e raramente analisam os
próprios dados.

## 2. Solução

Um **assistente financeiro conversacional** dentro do app, construído como um
**sistema multiagente**: o usuário fala em linguagem natural e o sistema decide,
sozinho, **quem** deve atender — um agente que **analisa** ou um agente que
**executa ações** (grava dados). Tudo com os **dados reais** do usuário e sem
expor números inventados.

## 3. Arquitetura multiagente

```
                 ┌──────────────────────────┐
   Pergunta  ──▶ │   AGENTE 1 · ROTEADOR     │   classifica a intenção
   do usuário    │   (Gemini, zero-shot)     │   → "análise" ou "ação"
                 └───────────┬──────────────┘
                             │
            ┌────────────────┴─────────────────┐
            ▼                                   ▼
 ┌────────────────────────┐         ┌──────────────────────────┐
 │  AGENTE 2 · ANALISTA    │         │  AGENTE 3 · OPERADOR      │
 │  somente leitura        │         │  function calling (tools) │
 │  relatórios, análises,  │         │  cria lançamentos,        │
 │  insights e dicas       │         │  categorias, carteiras,   │
 │                         │         │  metas — executa no banco │
 └───────────┬────────────┘         └─────────────┬────────────┘
             │                                     │
             └──────────────┬──────────────────────┘
                            ▼
                   Resposta + ações realizadas
                  (RLS garante isolamento por usuário)
```

**Os três agentes:**

| Agente | Papel | Capacidade | Ferramentas |
|---|---|---|---|
| **Roteador** | Supervisor | Classifica a intenção em "análise" ou "ação" | — |
| **Analista** | Especialista de leitura | Gera relatórios, análises de gastos, saúde financeira, dicas | Contexto financeiro (resumo do mês) injetado |
| **Operador** | Especialista de escrita | Registra dados a pedido do usuário | `criar_lancamento`, `criar_categoria`, `criar_carteira`, `criar_meta` |

## 4. Como funciona (fluxo técnico)

1. O app chama a **Supabase Edge Function** `ai-assistant`, enviando a pergunta,
   o histórico e o **nome do agente** (personalizável no Perfil). O **JWT** do
   usuário vai junto → **RLS** restringe tudo aos dados dele.
2. O **Roteador** (chamada curta ao Gemini) devolve `analise` ou `acao`.
3. **Se análise:** o **Analista** recebe um resumo financeiro do mês (saldos,
   entradas/saídas, gastos por categoria, orçamentos, metas) e responde
   fundamentado nesses números — proibido inventar.
4. **Se ação:** o **Operador** roda um **loop de _function calling_**: o Gemini
   decide qual ferramenta chamar (ex.: `criar_lancamento`), a função executa a
   operação no Postgres (resolvendo nomes de conta/categoria para IDs) e
   devolve o resultado ao modelo, que **confirma** em linguagem natural.
5. A resposta volta ao app com um **selo do agente** que respondeu
   (Analista/Operador) — ótimo para visualizar o sistema multiagente na demo.

## 5. Tecnologias

- **Google ADK (Agent Development Kit)** — framework de agentes em **Python**,
  nativo para Gemini; define Coordenador/Analista/Operador e faz a delegação
  entre agentes (_agent transfer_) e o _function calling_.
- **Google Gemini** (`gemini-2.0-flash`) — raciocínio + chamada de ferramentas.
- **FastAPI** (Python) — serviço HTTP que hospeda a orquestração e protege a API key.
- **PostgreSQL + RLS (Supabase)** — cada agente só enxerga/escreve os dados do usuário.
- **React Native (Expo)** — app cliente; tela de chat com selo de agente.

> Nota de arquitetura: a ADK é Python, então a IA roda em um **serviço FastAPI
> separado** (`ai-service/`), não nas Edge Functions do Supabase (que são Deno).
> O Supabase segue como banco + autenticação + RLS. Há também uma implementação
> equivalente em TypeScript/Deno em `supabase/functions/ai-assistant/` (alternativa).

## 6. Por que é um (bom) sistema multiagente

- **Especialização**: separar **ler** de **escrever** reduz erro e alucinação —
  o Analista nunca grava; o Operador valida antes de gravar.
- **Roteamento (supervisor/worker)**: um agente decide quem atua — padrão
  clássico de orquestração multiagente.
- **Segurança por design**: o Operador só age via ferramentas tipadas e com RLS;
  não há acesso livre ao banco.
- **Extensível**: novos agentes (ex.: "Consultor de Investimentos", "Auditor de
  recorrências") entram sem reescrever os demais.

## 7. Roteiro de demonstração (3 min)

1. **Análise** — Pergunte: *"Como foram meus gastos este mês?"* → responde o
   **Analista** (selo "Analista"), com números reais.
2. **Ação** — Diga: *"Lance uma despesa de R$ 50 no mercado pela carteira
   Nubank"* → responde o **Operador**, que cria o lançamento e confirma.
3. **Prova** — Abra a aba **Lançamentos** e mostre a despesa recém-criada pela IA.
4. **Personalização** — No **Perfil**, troque o nome do agente e mostre o chat
   reagindo ao novo nome.

## 8. Evolução: MCP (Model Context Protocol)

As ferramentas do **Operador** já são, conceitualmente, "ferramentas MCP". O
próximo passo natural é expor `criar_lancamento`, `criar_categoria`, etc. como um
**servidor MCP**, permitindo que **qualquer host de IA** (Claude Desktop, um
agente web, automações) use as mesmas capacidades financeiras — reaproveitando
100% da lógica já escrita. Ou seja, começamos com _function calling_ e
**graduamos para MCP** sem retrabalho.

## 9. Limitações e próximos passos

- Hoje o Operador confirma operações de escrita diretamente; um passo de
  **confirmação explícita** do usuário (human-in-the-loop) deixaria mais seguro.
- Adicionar **streaming** de resposta e memória de longo prazo por usuário.
- Métricas de custo/uso e _rate limiting_ por usuário.
- Expor as ferramentas como **servidor MCP** (item 8).

---

### Onde está o código
- Orquestração multiagente (Python + ADK): `ai-service/` (`agents.py`, `main.py`, `context.py`)
- Deploy do serviço de IA: `ai-service/README.md`
- Cliente (chat + selo de agente): `src/app/(tabs)/ia.tsx` → `src/lib/aiClient.ts`
- Nome do agente (personalização): `src/lib/agent.ts` + tela de Perfil
- Alternativa em TypeScript/Deno: `supabase/functions/ai-assistant/index.ts`
