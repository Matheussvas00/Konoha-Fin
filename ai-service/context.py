"""Contexto por-requisição compartilhado entre os agentes ADK.

Como as ferramentas da ADK são funções Python "soltas", usamos um ContextVar
para que cada chamada tenha acesso ao cliente Supabase do usuário (com RLS),
ao user_id e às listas de contas/categorias — sem variáveis globais mutáveis.
"""

import contextvars
import datetime
from dataclasses import dataclass, field
from typing import Any


@dataclass
class RequestContext:
    supabase: Any
    user_id: str
    agent_name: str
    accounts: list
    categories: list
    actions: list = field(default_factory=list)


request_ctx: contextvars.ContextVar["RequestContext"] = contextvars.ContextVar("request_ctx")


def get_ctx() -> "RequestContext":
    return request_ctx.get()


def find_by_name(items: list, name: str | None):
    """Acha um item por nome (igualdade; depois, contém), case-insensitive."""
    if not name:
        return None
    q = name.strip().lower()
    for x in items:
        if x["name"].lower() == q:
            return x
    for x in items:
        if q in x["name"].lower():
            return x
    return None


def load_lookups(supabase) -> tuple[list, list]:
    accounts = (
        supabase.table("accounts").select("id,name,type").eq("is_archived", False).execute().data
        or []
    )
    categories = supabase.table("categories").select("id,name,type").execute().data or []
    return accounts, categories


def _brl(n) -> str:
    return f"R$ {float(n):,.2f}"


def build_summary(supabase) -> str:
    """Monta um resumo financeiro do mês corrente (com RLS aplicada)."""
    today = datetime.date.today()
    start = today.replace(day=1).isoformat()
    nm = (
        today.replace(year=today.year + 1, month=1, day=1)
        if today.month == 12
        else today.replace(month=today.month + 1, day=1)
    )
    end = (nm - datetime.timedelta(days=1)).isoformat()

    txs = (
        supabase.table("transactions")
        .select("type,amount,status,category_id")
        .gte("date", start)
        .lte("date", end)
        .execute()
        .data
        or []
    )
    accounts = (
        supabase.table("accounts").select("id,name").eq("is_archived", False).execute().data or []
    )
    balances = {
        b["id"]: float(b["balance"])
        for b in (supabase.table("account_balances").select("id,balance").execute().data or [])
    }
    cats = supabase.table("categories").select("id,name").execute().data or []
    catname = {c["id"]: c["name"] for c in cats}
    budgets = supabase.table("budgets").select("category_id,amount").execute().data or []
    goals = (
        supabase.table("goals")
        .select("name,target_amount,current_amount,is_completed")
        .execute()
        .data
        or []
    )

    eff = [t for t in txs if t["status"] == "effected"]
    income = sum(float(t["amount"]) for t in eff if t["type"] == "income")
    expense = sum(float(t["amount"]) for t in eff if t["type"] == "expense")

    bycat: dict[str, float] = {}
    for t in eff:
        if t["type"] != "expense":
            continue
        n = catname.get(t["category_id"], "Sem categoria")
        bycat[n] = bycat.get(n, 0) + float(t["amount"])
    top = sorted(bycat.items(), key=lambda x: -x[1])[:8]
    total = sum(balances.get(a["id"], 0) for a in accounts)

    lines = [
        f"Saldo total: {_brl(total)}. Entradas: {_brl(income)}. "
        f"Saídas: {_brl(expense)}. Resultado: {_brl(income - expense)}."
    ]
    if accounts:
        lines.append(
            "Carteiras: " + ", ".join(f"{a['name']} ({_brl(balances.get(a['id'], 0))})" for a in accounts)
        )
    if top:
        lines.append("Gastos por categoria: " + ", ".join(f"{n}: {_brl(v)}" for n, v in top))
    if budgets:
        lines.append(
            "Orçamentos: "
            + ", ".join(
                f"{catname.get(b['category_id'], 'Categoria')}: "
                f"gasto {_brl(bycat.get(catname.get(b['category_id']), 0))} de {_brl(b['amount'])}"
                for b in budgets
            )
        )
    if goals:
        lines.append(
            "Metas: "
            + ", ".join(
                f"{g['name']}: {_brl(g['current_amount'])}/{_brl(g['target_amount'])}"
                + (" (concluída)" if g.get("is_completed") else "")
                for g in goals
            )
        )
    return "\n".join(lines)
