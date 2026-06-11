# Edge Function: ai-assistant (Gemini)

Assistente financeiro do Konoha Fin. Lê os dados do usuário (com RLS), monta um
resumo do mês e pede uma resposta ao Google Gemini.

## Deploy

Pré-requisitos: [Supabase CLI](https://supabase.com/docs/guides/cli) instalada e
`supabase login` feito.

```bash
# na raiz do projeto
supabase link --project-ref SEU_PROJECT_REF

# configura a chave do Gemini (https://aistudio.google.com/apikey)
supabase secrets set GEMINI_API_KEY=suacchave

# publica a função
supabase functions deploy ai-assistant
```

`SUPABASE_URL` e `SUPABASE_ANON_KEY` já são injetadas automaticamente pela
plataforma — não precisa configurá-las.

## Como o app chama

`src/app/(tabs)/ia.tsx` usa `supabase.functions.invoke('ai-assistant', { body })`,
enviando `{ question, history, agentName }`. O token do usuário vai no header
automaticamente, então a função enxerga apenas os dados dele (RLS).

## Modelo

Usa `gemini-2.0-flash`. Para trocar, edite `GEMINI_MODEL` em `index.ts`.
