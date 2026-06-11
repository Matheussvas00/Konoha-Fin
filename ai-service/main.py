"""Serviço FastAPI que expõe o sistema multiagente (Google ADK + Gemini).

POST /chat
  Body:    { "question": str, "history": [...], "agentName": str }
  Header:  Authorization: Bearer <access_token do Supabase>
  Resposta: { "answer": str, "agent": "analista"|"operador", "actions": [...] }

O access_token do usuário é usado para criar um cliente Supabase com RLS, de modo
que cada agente só lê/escreve os dados do próprio usuário.
"""

import os
import uuid

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from supabase import create_client

from agents import build_root_agent
from context import RequestContext, load_lookups, request_ctx

APP_NAME = "konoha-fin"
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]

app = FastAPI(title="Konoha Fin · Assistente Multiagente")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

root_agent = build_root_agent()
session_service = InMemorySessionService()
runner = Runner(agent=root_agent, app_name=APP_NAME, session_service=session_service)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/chat")
async def chat(req: Request):
    body = await req.json()
    question = (body.get("question") or "").strip()
    agent_name = (body.get("agentName") or "Konoha").strip() or "Konoha"
    if not question:
        raise HTTPException(status_code=400, detail="Pergunta ausente.")

    auth = req.headers.get("authorization", "")
    token = auth[7:] if auth.lower().startswith("bearer ") else ""
    if not token:
        raise HTTPException(status_code=401, detail="Sem token de autenticação.")

    # Cliente Supabase agindo como o usuário (RLS)
    supabase = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    try:
        user_resp = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido.")
    user = getattr(user_resp, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Não autenticado.")
    supabase.postgrest.auth(token)  # aplica RLS nas queries/inserts

    accounts, categories = load_lookups(supabase)
    ctx = RequestContext(
        supabase=supabase,
        user_id=user.id,
        agent_name=agent_name,
        accounts=accounts,
        categories=categories,
        actions=[],
    )
    ctx_token = request_ctx.set(ctx)
    try:
        uid = user.id
        sid = str(uuid.uuid4())
        await session_service.create_session(
            app_name=APP_NAME,
            user_id=uid,
            session_id=sid,
            state={"agent_name": agent_name},
        )

        content = types.Content(role="user", parts=[types.Part(text=question)])
        final_text, author = "", None
        async for ev in runner.run_async(user_id=uid, session_id=sid, new_message=content):
            if ev.is_final_response() and ev.content and ev.content.parts:
                txt = getattr(ev.content.parts[0], "text", None)
                if txt:
                    final_text = txt
                author = ev.author

        agent_id = "operador" if author == "operador" else "analista"
        return {
            "answer": final_text or "Não consegui responder agora.",
            "agent": agent_id,
            "actions": ctx.actions,
        }
    finally:
        request_ctx.reset(ctx_token)
