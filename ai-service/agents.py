"""Definição do sistema multiagente com Google ADK.

Coordenador (roteia) ── delega para ──▶ Analista (leitura)  ou  Operador (escrita).

As ferramentas (`obter_resumo_financeiro`, `criar_lancamento`, ...) são funções
Python comuns; a ADK gera o schema automaticamente a partir das anotações de tipo
e da docstring. Elas leem o contexto da requisição via ContextVar (ver context.py).
"""

import datetime
import os

from google.adk.agents import Agent

from context import build_summary, find_by_name, get_ctx

MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")


# ── Ferramenta do ANALISTA (leitura) ────────────────────────────────────

def obter_resumo_financeiro() -> dict:
    """Retorna um resumo financeiro do mês atual do usuário: saldo total,
    entradas, saídas, gastos por categoria, orçamentos e metas."""
    ctx = get_ctx()
    return {"resumo": build_summary(ctx.supabase)}


# ── Ferramentas do OPERADOR (escrita) ───────────────────────────────────

_PAYMENT_METHODS = {"pix", "cash", "credit", "debit", "bank_transfer"}


def criar_lancamento(
    tipo: str,
    descricao: str,
    valor: float,
    conta: str,
    categoria: str = "",
    conta_destino: str = "",
    forma_pagamento: str = "",
    data: str = "",
) -> dict:
    """Cria um lançamento financeiro.

    tipo: 'income' (receita), 'expense' (despesa) ou 'transfer' (transferência).
    conta: nome da carteira de origem.
    categoria: nome da categoria (opcional).
    conta_destino: nome da carteira de destino (obrigatório só para 'transfer').
    forma_pagamento: 'pix', 'cash' (dinheiro), 'credit' (crédito), 'debit'
        (débito) ou 'bank_transfer' (transferência bancária) — opcional.
    data: 'YYYY-MM-DD' (opcional; padrão hoje).
    """
    ctx = get_ctx()
    acc = find_by_name(ctx.accounts, conta)
    if not acc:
        nomes = ", ".join(a["name"] for a in ctx.accounts) or "nenhuma"
        return {"ok": False, "message": f"Carteira '{conta}' não encontrada. Disponíveis: {nomes}."}
    if valor is None or float(valor) <= 0:
        return {"ok": False, "message": "Valor inválido."}
    cat = find_by_name(ctx.categories, categoria) if categoria else None
    to_acc = find_by_name(ctx.accounts, conta_destino) if tipo == "transfer" else None
    if tipo == "transfer" and not to_acc:
        return {"ok": False, "message": "Transferência precisa de uma conta de destino válida."}

    row = {
        "user_id": ctx.user_id,
        "account_id": acc["id"],
        "to_account_id": to_acc["id"] if to_acc else None,
        "category_id": cat["id"] if cat else None,
        "type": tipo,
        "status": "effected",
        "description": (descricao or "").strip() or "Lançamento",
        "amount": float(valor),
        "date": data or datetime.date.today().isoformat(),
    }
    if forma_pagamento in _PAYMENT_METHODS:
        row["payment_method"] = forma_pagamento
    ctx.supabase.table("transactions").insert(row).execute()
    msg = f"Lançamento criado: {row['description']} ({_brl(valor)}) em {acc['name']}."
    ctx.actions.append({"tool": "criar_lancamento", "ok": True, "message": msg})
    return {"ok": True, "message": msg}


def criar_categoria(nome: str, tipo: str) -> dict:
    """Cria uma categoria. tipo: 'income' (receita) ou 'expense' (despesa)."""
    ctx = get_ctx()
    data = (
        ctx.supabase.table("categories")
        .insert({
            "user_id": ctx.user_id,
            "name": nome.strip(),
            "type": tipo,
            "icon": "ellipsis-horizontal-outline",
        })
        .execute()
        .data
    )
    if data:
        ctx.categories.append(data[0])
    msg = f"Categoria '{nome}' ({'receita' if tipo == 'income' else 'despesa'}) criada."
    ctx.actions.append({"tool": "criar_categoria", "ok": True, "message": msg})
    return {"ok": True, "message": msg}


def criar_carteira(nome: str, tipo: str, saldo_inicial: float = 0) -> dict:
    """Cria uma carteira/conta.

    tipo: 'checking', 'savings', 'cash', 'credit_card', 'investment' ou 'other'.
    saldo_inicial: saldo atual da conta (opcional; padrão 0).
    """
    ctx = get_ctx()
    data = (
        ctx.supabase.table("accounts")
        .insert({
            "user_id": ctx.user_id,
            "name": nome.strip(),
            "type": tipo,
            "initial_balance": float(saldo_inicial or 0),
            "currency": "BRL",
        })
        .execute()
        .data
    )
    if data:
        ctx.accounts.append(data[0])
    msg = f"Carteira '{nome}' criada com saldo {_brl(saldo_inicial or 0)}."
    ctx.actions.append({"tool": "criar_carteira", "ok": True, "message": msg})
    return {"ok": True, "message": msg}


def criar_meta(nome: str, valor_alvo: float, valor_inicial: float = 0) -> dict:
    """Cria uma meta de economia, com valor alvo e valor inicial (opcional)."""
    ctx = get_ctx()
    ctx.supabase.table("goals").insert({
        "user_id": ctx.user_id,
        "name": nome.strip(),
        "target_amount": float(valor_alvo),
        "current_amount": float(valor_inicial or 0),
    }).execute()
    msg = f"Meta '{nome}' criada (alvo {_brl(valor_alvo)})."
    ctx.actions.append({"tool": "criar_meta", "ok": True, "message": msg})
    return {"ok": True, "message": msg}


def definir_orcamento(categoria: str, valor: float) -> dict:
    """Define (cria ou atualiza) o orçamento mensal de uma categoria de despesa."""
    ctx = get_ctx()
    cat = find_by_name(ctx.categories, categoria)
    if not cat:
        nomes = ", ".join(c["name"] for c in ctx.categories) or "nenhuma"
        return {"ok": False, "message": f"Categoria '{categoria}' não encontrada. Disponíveis: {nomes}."}
    ctx.supabase.table("budgets").upsert(
        {"user_id": ctx.user_id, "category_id": cat["id"], "amount": float(valor)},
        on_conflict="user_id,category_id",
    ).execute()
    msg = f"Orçamento de {cat['name']} definido em {_brl(valor)}/mês."
    ctx.actions.append({"tool": "definir_orcamento", "ok": True, "message": msg})
    return {"ok": True, "message": msg}


def aportar_meta(meta: str, valor: float) -> dict:
    """Aporta (ou retira, com valor negativo) um valor em uma meta de economia."""
    ctx = get_ctx()
    goals = ctx.supabase.table("goals").select("id,name,target_amount,current_amount").execute().data or []
    g = find_by_name(goals, meta)
    if not g:
        nomes = ", ".join(x["name"] for x in goals) or "nenhuma"
        return {"ok": False, "message": f"Meta '{meta}' não encontrada. Disponíveis: {nomes}."}
    nxt = max(0.0, float(g["current_amount"]) + float(valor))
    ctx.supabase.table("goals").update({
        "current_amount": nxt,
        "is_completed": nxt >= float(g["target_amount"]),
    }).eq("id", g["id"]).execute()
    msg = f"Aporte de {_brl(valor)} na meta '{g['name']}'. Total: {_brl(nxt)}."
    ctx.actions.append({"tool": "aportar_meta", "ok": True, "message": msg})
    return {"ok": True, "message": msg}


def _brl(n) -> str:
    return f"R$ {float(n):,.2f}"


# ── Montagem do sistema multiagente ─────────────────────────────────────

def build_root_agent() -> Agent:
    analista = Agent(
        name="analista",
        model=MODEL,
        description="Gera relatórios, análises de gastos e dicas a partir dos dados financeiros.",
        instruction=(
            "Você é {agent_name}, o agente ANALISTA do app Konoha Fin. "
            "Responda em português do Brasil, de forma curta e prática. "
            "Sempre chame a ferramenta obter_resumo_financeiro para obter os números reais e "
            "baseie-se SOMENTE neles; se um dado não existir, diga que não tem essa informação. "
            "Nunca invente valores."
        ),
        tools=[obter_resumo_financeiro],
    )

    operador = Agent(
        name="operador",
        model=MODEL,
        description="Registra lançamentos, categorias, carteiras e metas a pedido do usuário.",
        instruction=(
            "Você é {agent_name}, o agente OPERADOR do app Konoha Fin. "
            "Use as ferramentas para REGISTRAR o que o usuário pedir: lançamento, categoria, "
            "carteira, meta, orçamento de categoria e aporte em meta. Se faltar uma informação "
            "obrigatória, pergunte de forma objetiva em vez de chamar a ferramenta. Depois de "
            "registrar, confirme em uma frase curta."
        ),
        tools=[
            criar_lancamento, criar_categoria, criar_carteira, criar_meta,
            definir_orcamento, aportar_meta,
        ],
    )

    coordenador = Agent(
        name="coordenador",
        model=MODEL,
        description="Roteia o pedido do usuário para o agente especialista correto.",
        instruction=(
            "Você é o coordenador do Konoha Fin, um sistema multiagente. "
            "Se o usuário quer CRIAR/REGISTRAR/SALVAR algo (lançamento, despesa, receita, "
            "transferência, categoria, carteira, orçamento ou meta), transfira para 'operador'. "
            "Se quer relatório, análise, consulta, dica ou conversa, transfira para 'analista'. "
            "Sempre delegue para um dos agentes; não responda diretamente."
        ),
        sub_agents=[analista, operador],
    )
    return coordenador
