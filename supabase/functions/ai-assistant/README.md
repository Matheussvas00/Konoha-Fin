# Edge Function: ai-assistant (Groq, multiagente)

Assistente financeiro do Konoha Fin. Lê os dados do usuário (com RLS), monta um
resumo do mês e conversa via um LLM gratuito (Groq / Llama 3.3).

Arquitetura multiagente:

- **Roteador** — classifica a mensagem em `analise` ou `acao`.
- **Analista** — somente leitura: relatórios/análises do mês.
- **Operador** — escreve dados via *function calling* (lançamento, categoria,
  carteira, meta, orçamento, aporte).

## Deploy

Pré-requisitos: [Supabase CLI](https://supabase.com/docs/guides/cli) instalada e
`supabase login` feito.

```bash
# na raiz do projeto
supabase link --project-ref SEU_PROJECT_REF

# chave do Groq (grátis em https://console.groq.com -> API Keys)
supabase secrets set GROQ_API_KEY=gsk_suachave

# publica a função (--no-verify-jwt: o preflight de CORS vai sem token;
# a própria função autentica o usuário com supabase.auth.getUser())
supabase functions deploy ai-assistant --no-verify-jwt
```

> O `supabase/config.toml` já fixa `verify_jwt = false` para esta função, então
> `supabase functions deploy ai-assistant` (sem a flag) também já sobe com a
> verificação desligada.

`SUPABASE_URL` e `SUPABASE_ANON_KEY` são injetadas automaticamente pela
plataforma — não precisa configurá-las.

### Deploy pelo painel (sem CLI)

Edge Functions → função `ai-assistant` → **Settings** → desligue **Verify JWT**.
Sem isso, o navegador bloqueia o preflight de CORS e o app mostra
*"Failed to send a request to the Edge Function"*.

## Como o app chama

`src/lib/aiClient.ts` usa `supabase.functions.invoke('ai-assistant', { body })`,
enviando `{ question, history, agentName }`. O token do usuário vai no header
automaticamente, então a função enxerga apenas os dados dele (RLS).

## Modelo

Usa `llama-3.3-70b-versatile` (Groq). Para trocar, defina o secret `GROQ_MODEL`
ou edite `GROQ_MODEL` em `index.ts`.
