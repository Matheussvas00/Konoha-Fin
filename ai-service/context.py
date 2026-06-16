"""Funções auxiliares puras: lookups e resumo financeiro (com RLS via cliente)."""

import datetime


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


def brl(n) -> str:
    return f"R$ {float(n):,.2f}"


def build_summary(supabase) -> str:
    """Monta um resumo financeiro do mês corrente (RLS aplicada pelo cliente)."""
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
        .gte("date", start).lte("date", end).execute().data
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
        supabase.table("goals").select("name,target_amount,current_amount,is_completed")
        .execute().data or []
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
        f"Saldo total: {brl(total)}. Entradas: {brl(income)}. "
        f"Saídas: {brl(expense)}. Resultado: {brl(income - expense)}."
    ]
    if accounts:
        lines.append("Carteiras: " + ", ".join(f"{a['name']} ({brl(balances.get(a['id'], 0))})" for a in accounts))
    if top:
        lines.append("Gastos por categoria: " + ", ".join(f"{n}: {brl(v)}" for n, v in top))
    if budgets:
        lines.append("Orçamentos: " + ", ".join(
            f"{catname.get(b['category_id'], 'Categoria')}: gasto {brl(bycat.get(catname.get(b['category_id']), 0))} de {brl(b['amount'])}"
            for b in budgets))
    if goals:
        lines.append("Metas: " + ", ".join(
            f"{g['name']}: {brl(g['current_amount'])}/{brl(g['target_amount'])}"
            + (" (concluída)" if g.get("is_completed") else "") for g in goals))

    # Gastos por forma de pagamento (coluna pode não existir → protegido)
    try:
        pay_rows = (
            supabase.table("transactions").select("amount,payment_method")
            .eq("status", "effected").eq("type", "expense")
            .gte("date", start).lte("date", end).execute().data or []
        )
        labels = {"pix": "Pix", "cash": "Dinheiro", "credit": "Crédito",
                  "debit": "Débito", "bank_transfer": "Transferência bancária"}
        pay: dict[str, float] = {}
        for r in pay_rows:
            k = r.get("payment_method") or "sem forma"
            pay[k] = pay.get(k, 0) + float(r["amount"])
        if pay:
            lines.append("Gastos por forma de pagamento: " + ", ".join(
                f"{labels.get(k, k)}: {brl(v)}" for k, v in sorted(pay.items(), key=lambda x: -x[1])))
    except Exception:
        pass

    return "\n".join(lines)
