"""Serviço FastAPI multiagente LEVE (sem ADK) — chama o Gemini direto.

Roda confortavelmente no plano grátis do Render (sem a Google ADK pesada).
Mantém os 3 agentes: Roteador → Analista (leitura) ou Operador (escrita/tools).

POST /chat
  Body:    { "question": str, "history": [...], "agentName": str }
  Header:  Authorization: Bearer <access_token do Supabase>
  Resposta: { "answer": str, "agent": "analista"|"operador", "actions": [...] }
"""

import datetime
import json
import os
import urllib.error
import urllib.request

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client

from context import brl, build_summary, find_by_name, load_lookups

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
GEMINI_KEY = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY") or ""
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]

app = FastAPI(title="Konoha Fin · Assistente Multiagente (leve)")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)


# ── Chamada ao Gemini (urllib, sem dependências pesadas) ────────────────

def gemini(system: str, contents: list, tools: list | None = None) -> list:
    body: dict = {
        "system_instruction": {"parts": [{"text": system}]},
        "contents": contents,
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 1024},
    }
    if tools:
        body["tools"] = tools
        body["tool_config"] = {"function_calling_config": {"mode": "AUTO"}}

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}"
        f":generateContent?key={GEMINI_KEY}"
    )
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Gemini {e.code}: {e.read().decode('utf-8')[:200]}")

    return data.get("candidates", [{}])[0].get("content", {}).get("parts", []) or []


def parts_text(parts: list) -> str:
    return "".join(p.get("text", "") for p in parts if "text" in p).strip()


# ── Ferramentas do Operador (function calling) ──────────────────────────

OPERATOR_TOOLS = [{
    "function_declarations": [
        {
            "name": "criar_lancamento",
            "description": "Cria um lançamento (income/expense/transfer).",
            "parameters": {"type": "OBJECT", "properties": {
                "tipo": {"type": "STRING", "enum": ["income", "expense", "transfer"]},
                "descricao": {"type": "STRING"},
                "valor": {"type": "NUMBER"},
                "conta": {"type": "STRING", "description": "nome da carteira de origem"},
                "categoria": {"type": "STRING"},
                "conta_destino": {"type": "STRING", "description": "só para transfer"},
                "forma_pagamento": {"type": "STRING", "enum": ["pix", "cash", "credit", "debit", "bank_transfer"]},
                "data": {"type": "STRING", "description": "YYYY-MM-DD; padrão hoje"},
            }, "required": ["tipo", "descricao", "valor", "conta"]},
        },
        {"name": "criar_categoria", "description": "Cria uma categoria.",
         "parameters": {"type": "OBJECT", "properties": {
             "nome": {"type": "STRING"}, "tipo": {"type": "STRING", "enum": ["income", "expense"]}},
             "required": ["nome", "tipo"]}},
        {"name": "criar_carteira", "description": "Cria uma carteira/conta.",
         "parameters": {"type": "OBJECT", "properties": {
             "nome": {"type": "STRING"},
             "tipo": {"type": "STRING", "enum": ["checking", "savings", "cash", "credit_card", "investment", "other"]},
             "saldo_inicial": {"type": "NUMBER"}}, "required": ["nome", "tipo"]}},
        {"name": "criar_meta", "description": "Cria uma meta de economia.",
         "parameters": {"type": "OBJECT", "properties": {
             "nome": {"type": "STRING"}, "valor_alvo": {"type": "NUMBER"}, "valor_inicial": {"type": "NUMBER"}},
             "required": ["nome", "valor_alvo"]}},
        {"name": "definir_orcamento", "description": "Define/atualiza o orçamento mensal de uma categoria.",
         "parameters": {"type": "OBJECT", "properties": {
             "categoria": {"type": "STRING"}, "valor": {"type": "NUMBER"}}, "required": ["categoria", "valor"]}},
        {"name": "aportar_meta", "description": "Aporta (ou retira, negativo) valor em uma meta.",
         "parameters": {"type": "OBJECT", "properties": {
             "meta": {"type": "STRING"}, "valor": {"type": "NUMBER"}}, "required": ["meta", "valor"]}},
    ]
}]

_PAYMENT = {"pix", "cash", "credit", "debit", "bank_transfer"}


def execute_tool(name, args, supabase, user_id, accounts, categories) -> dict:
    try:
        if name == "criar_lancamento":
            acc = find_by_name(accounts, args.get("conta"))
            if not acc:
                nomes = ", ".join(a["name"] for a in accounts) or "nenhuma"
                return {"ok": False, "message": f"Carteira '{args.get('conta')}' não encontrada. Disponíveis: {nomes}."}
            valor = float(args.get("valor") or 0)
            if valor <= 0:
                return {"ok": False, "message": "Valor inválido."}
            cat = find_by_name(categories, args.get("categoria")) if args.get("categoria") else None
            tipo = args.get("tipo")
            to_acc = find_by_name(accounts, args.get("conta_destino")) if tipo == "transfer" else None
            if tipo == "transfer" and not to_acc:
                return {"ok": False, "message": "Transferência precisa de conta de destino válida."}
            row = {
                "user_id": user_id, "account_id": acc["id"],
                "to_account_id": to_acc["id"] if to_acc else None,
                "category_id": cat["id"] if cat else None,
                "type": tipo, "status": "effected",
                "description": (args.get("descricao") or "Lançamento").strip(),
                "amount": valor, "date": args.get("data") or datetime.date.today().isoformat(),
            }
            fp = args.get("forma_pagamento")
            if fp in _PAYMENT:
                row["payment_method"] = fp
            supabase.table("transactions").insert(row).execute()
            return {"ok": True, "message": f"Lançamento criado: {row['description']} ({brl(valor)}) em {acc['name']}."}

        if name == "criar_categoria":
            data = supabase.table("categories").insert({
                "user_id": user_id, "name": args["nome"].strip(), "type": args["tipo"],
                "icon": "ellipsis-horizontal-outline"}).execute().data
            if data:
                categories.append(data[0])
            return {"ok": True, "message": f"Categoria '{args['nome']}' criada."}

        if name == "criar_carteira":
            data = supabase.table("accounts").insert({
                "user_id": user_id, "name": args["nome"].strip(), "type": args["tipo"],
                "initial_balance": float(args.get("saldo_inicial") or 0), "currency": "BRL"}).execute().data
            if data:
                accounts.append(data[0])
            return {"ok": True, "message": f"Carteira '{args['nome']}' criada."}

        if name == "criar_meta":
            supabase.table("goals").insert({
                "user_id": user_id, "name": args["nome"].strip(),
                "target_amount": float(args["valor_alvo"]),
                "current_amount": float(args.get("valor_inicial") or 0)}).execute()
            return {"ok": True, "message": f"Meta '{args['nome']}' criada (alvo {brl(args['valor_alvo'])})."}

        if name == "definir_orcamento":
            cat = find_by_name(categories, args.get("categoria"))
            if not cat:
                return {"ok": False, "message": f"Categoria '{args.get('categoria')}' não encontrada."}
            supabase.table("budgets").upsert(
                {"user_id": user_id, "category_id": cat["id"], "amount": float(args["valor"])},
                on_conflict="user_id,category_id").execute()
            return {"ok": True, "message": f"Orçamento de {cat['name']} definido em {brl(args['valor'])}/mês."}

        if name == "aportar_meta":
            goals = supabase.table("goals").select("id,name,target_amount,current_amount").execute().data or []
            g = find_by_name(goals, args.get("meta"))
            if not g:
                return {"ok": False, "message": f"Meta '{args.get('meta')}' não encontrada."}
            nxt = max(0.0, float(g["current_amount"]) + float(args["valor"]))
            supabase.table("goals").update({
                "current_amount": nxt, "is_completed": nxt >= float(g["target_amount"])}).eq("id", g["id"]).execute()
            return {"ok": True, "message": f"Aporte de {brl(args['valor'])} na meta '{g['name']}'. Total: {brl(nxt)}."}

        return {"ok": False, "message": f"Ferramenta desconhecida: {name}."}
    except Exception as e:
        return {"ok": False, "message": f"Erro em {name}: {e}"}


# ── Agentes ─────────────────────────────────────────────────────────────

def route_intent(question: str) -> str:
    sys = (
        "Classifique a mensagem do usuário em UMA palavra: 'acao' se ele quer "
        "criar/registrar/salvar algo (lançamento, despesa, receita, transferência, "
        "categoria, carteira, orçamento, meta, aporte); 'analise' caso contrário "
        "(relatório, consulta, dica, conversa). Responda só 'acao' ou 'analise'."
    )
    t = parts_text(gemini(sys, [{"role": "user", "parts": [{"text": question}]}])).lower()
    return "acao" if ("acao" in t or "ação" in t) else "analise"


def run_analyst(persona: str, summary: str, history: list, question: str) -> str:
    sys = (
        f"Você é {persona}, o agente ANALISTA do app Konoha Fin. Responda em português "
        f"do Brasil, curto e prático. Baseie-se SOMENTE nos dados abaixo; se não houver, "
        f"diga que não tem essa informação. Nunca invente valores.\n\nDADOS:\n{summary}"
    )
    contents = history + [{"role": "user", "parts": [{"text": question}]}]
    return parts_text(gemini(sys, contents)) or "Não consegui analisar agora."


def run_operator(persona, question, supabase, user_id, accounts, categories):
    sys = (
        f"Você é {persona}, o agente OPERADOR do app Konoha Fin. Use as ferramentas para "
        f"registrar o que o usuário pedir. Se faltar dado obrigatório, pergunte. "
        f"Carteiras: {', '.join(a['name'] for a in accounts) or 'nenhuma'}. "
        f"Categorias: {', '.join(c['name'] for c in categories) or 'nenhuma'}."
    )
    parts = gemini(sys, [{"role": "user", "parts": [{"text": question}]}], tools=OPERATOR_TOOLS)
    calls = [p["functionCall"] for p in parts if "functionCall" in p]
    if not calls:
        return parts_text(parts) or "Não entendi o que registrar. Pode detalhar?", []

    actions = []
    for c in calls:
        res = execute_tool(c.get("name"), c.get("args") or {}, supabase, user_id, accounts, categories)
        actions.append({"tool": c.get("name"), "ok": res["ok"], "message": res["message"]})

    results = "; ".join(a["message"] for a in actions)
    confirm = gemini(
        f"Você é {persona}. Confirme em UMA frase curta, em português, o que foi feito.",
        [{"role": "user", "parts": [{"text": f"Pedido: {question}\nResultado: {results}"}]}],
    )
    return parts_text(confirm) or results, actions


# ── API ─────────────────────────────────────────────────────────────────

class ChatIn(BaseModel):
    question: str
    history: list = []
    agentName: str = "Konoha"


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/chat")
def chat(payload: ChatIn, authorization: str = Header(default="")):
    if not GEMINI_KEY:
        raise HTTPException(status_code=500, detail="GOOGLE_API_KEY não configurada.")
    question = (payload.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Pergunta ausente.")

    token = authorization[7:] if authorization.lower().startswith("bearer ") else ""
    if not token:
        raise HTTPException(status_code=401, detail="Sem token.")

    supabase = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    try:
        user = supabase.auth.get_user(token).user
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido.")
    if not user:
        raise HTTPException(status_code=401, detail="Não autenticado.")
    supabase.postgrest.auth(token)

    persona = (payload.agentName or "Konoha").strip() or "Konoha"
    history = [
        {"role": "model" if m.get("role") == "ai" else "user", "parts": [{"text": str(m.get("text", ""))}]}
        for m in (payload.history or [])[-10:]
        if isinstance(m, dict) and m.get("text")
    ]

    if route_intent(question) == "acao":
        accounts, categories = load_lookups(supabase)
        answer, actions = run_operator(persona, question, supabase, user.id, accounts, categories)
        return {"answer": answer, "agent": "operador", "actions": actions}

    summary = build_summary(supabase)
    answer = run_analyst(persona, summary, history, question)
    return {"answer": answer, "agent": "analista", "actions": []}
