---
title: Konoha Fin AI
emoji: 🍃
colorFrom: green
colorTo: gray
sdk: docker
app_port: 8080
pinned: false
---

# Konoha Fin · Serviço de IA multiagente (Python, leve)

Backend do assistente financeiro: **FastAPI** + **Gemini** (chamadas REST
diretas, sem bibliotecas pesadas), para rodar no **plano grátis** do Render
(512 MB). Mantém o sistema multiagente: Roteador → Analista (leitura) ou
Operador (escrita via function calling).

## Arquitetura

```
Coordenador (roteia)
   ├─▶ Analista  (leitura)  → ferramenta: obter_resumo_financeiro
   └─▶ Operador  (escrita)  → ferramentas: criar_lancamento / criar_categoria /
                                            criar_carteira / criar_meta
```

- `main.py` — API FastAPI (`POST /chat`), valida o JWT do usuário e aplica RLS.
- `agents.py` — agentes ADK + ferramentas.
- `context.py` — contexto por-requisição (cliente Supabase do usuário) e resumo.

## Rodar localmente

```bash
cd ai-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # preencha GOOGLE_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY
export $(grep -v '^#' .env | xargs)
uvicorn main:app --reload --port 8080
```

Teste: `curl -X POST localhost:8080/chat -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"question":"como foram meus gastos?","agentName":"Konoha"}'`

(O `<token>` é o `access_token` de um usuário logado — dá pra pegar no app.)

## Deploy no Hugging Face Spaces (grátis, mais generoso)

1. Crie conta em https://huggingface.co e clique em **New Space**.
2. **Space SDK: Docker** · nome à vontade · visibilidade **Public**.
3. Em **Files**, suba os arquivos desta pasta `ai-service/`:
   `Dockerfile`, `main.py`, `context.py`, `requirements.txt` e este `README.md`
   (o bloco no topo deste README, com `sdk: docker` e `app_port: 8080`, é o que
   configura o Space).
4. Em **Settings → Variables and secrets**, adicione como **Secrets**:
   `GOOGLE_API_KEY`, `SUPABASE_URL` (= `https://SEU-ID.supabase.co`) e
   `SUPABASE_ANON_KEY`.
5. O Space builda sozinho. A URL fica tipo
   `https://SEU-USUARIO-konoha-fin-ai.hf.space`.
6. No app, aponte `EXPO_PUBLIC_AI_URL` para essa URL (Vercel) e teste
   `…/health`.

## Deploy

Qualquer host de container/Python serve. Variáveis a configurar:
`GOOGLE_API_KEY`, `GOOGLE_GENAI_USE_VERTEXAI=FALSE`, `SUPABASE_URL`,
`SUPABASE_ANON_KEY` (e opcional `GEMINI_MODEL`).

### Render (mais simples)

**Opção A — Blueprint (1 clique):** existe um `render.yaml` na raiz do repo. No
Render: **New +** → **Blueprint** → selecione este repositório. Ele cria o
serviço a partir de `ai-service/Dockerfile`. Depois, em **Environment**, preencha
os segredos `GOOGLE_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

**Opção B — manual:**
1. New → Web Service → aponte para este repositório, **Root Directory** `ai-service`.
2. Environment: **Docker** (usa o `Dockerfile`) ou **Python** com
   start `uvicorn main:app --host 0.0.0.0 --port $PORT`.
3. Configure as variáveis e pegue a URL pública (ex.: `https://konoha-ai.onrender.com`).

> O serviço expõe `GET /health` para o health check do Render.

> ⚠️ Os valores das chaves vão **somente** nas variáveis de ambiente do host —
> nunca no repositório.

### Google Cloud Run
```bash
gcloud run deploy konoha-ai --source ai-service --region us-central1 \
  --set-env-vars GOOGLE_GENAI_USE_VERTEXAI=FALSE,GEMINI_MODEL=gemini-2.0-flash \
  --set-env-vars GOOGLE_API_KEY=...,SUPABASE_URL=...,SUPABASE_ANON_KEY=... \
  --allow-unauthenticated
```

## Ligar o app

No `.env` do app (raiz do projeto Expo), aponte para a URL do serviço:

```
EXPO_PUBLIC_AI_URL=https://sua-url-do-servico
```

**Se o app web está na Vercel:** adicione a mesma variável
`EXPO_PUBLIC_AI_URL` em **Project Settings → Environment Variables** e refaça o
deploy (variáveis `EXPO_PUBLIC_*` são embutidas no build). A Vercel continua
servindo só o **frontend**; o backend de IA fica neste serviço Python.

O app (`src/app/(tabs)/ia.tsx` → `src/lib/aiClient.ts`) envia a pergunta com o
token do usuário no header `Authorization`.
