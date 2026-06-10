import { supabase } from './supabase';

// ── Tipos ──────────────────────────────────────────────────────────────

export type MonthlySummary = {
  income:  number;
  expense: number;
};

export type TopAccount = {
  id:      string;
  name:    string;
  type:    string;
  color:   string | null;
  balance: number;
};

export type RecentTransaction = {
  id:          string;
  description: string;
  amount:      number;
  type:        'income' | 'expense' | 'transfer';
  date:        string;
  category:    string | null;
  account:     string | null;
};

export type DashboardData = {
  fullName:    string;
  totalBalance: number;
  monthly:     MonthlySummary;
  topAccounts: TopAccount[];
  recent:      RecentTransaction[];
};

// ── Helpers ────────────────────────────────────────────────────────────

function currentMonthRange() {
  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
  return { start, end };
}

// ── Consulta principal ─────────────────────────────────────────────────

export async function getDashboardData(): Promise<DashboardData> {
  const { start, end } = currentMonthRange();

  // Busca perfil, saldos e contas — transações separadas para não quebrar se tabela não existir
  const [profileRes, balancesRes, accountsRes] = await Promise.all([
    supabase.from('profiles').select('full_name').single(),
    supabase.from('account_balances').select('id, balance'),
    supabase
      .from('accounts')
      .select('id, name, type, color')
      .eq('is_archived', false)
      .order('created_at', { ascending: true })
      .limit(3),
  ]);

  // ── Nome ──────────────────────────────────────────────────────────
  const fullName = (profileRes.data as any)?.full_name ?? 'Ninja';

  // ── Saldo total ───────────────────────────────────────────────────
  const balanceMap = new Map<string, number>(
    ((balancesRes.data ?? []) as any[]).map((b) => [b.id, Number(b.balance)])
  );
  const totalBalance = Array.from(balanceMap.values()).reduce((s, v) => s + v, 0);

  // ── Top contas ────────────────────────────────────────────────────
  const topAccounts: TopAccount[] = ((accountsRes.data ?? []) as any[]).map((a) => ({
    id:      a.id,
    name:    a.name,
    type:    a.type,
    color:   a.color,
    balance: balanceMap.get(a.id) ?? 0,
  }));

  // ── Transações (ignora erro se tabela não existir ainda) ──────────
  let income  = 0;
  let expense = 0;
  let recent: RecentTransaction[] = [];

  try {
    const { data: txData } = await supabase
      .from('transactions')
      .select(`id, description, amount, type, date, categories ( name ), accounts ( name )`)
      .eq('status', 'effected')
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: false })
      .limit(5);

    const txRows = (txData ?? []) as any[];
    for (const t of txRows) {
      if (t.type === 'income')  income  += Number(t.amount);
      if (t.type === 'expense') expense += Number(t.amount);
    }
    recent = txRows.map((t) => ({
      id:          t.id,
      description: t.description,
      amount:      Number(t.amount),
      type:        t.type,
      date:        t.date,
      category:    (t.categories as any)?.name ?? null,
      account:     (t.accounts as any)?.name ?? null,
    }));
  } catch {
    // Tabela transactions ainda não existe — ignora
  }

  return { fullName, totalBalance, monthly: { income, expense }, topAccounts, recent };
}

// ── Resumo mensal completo (usado quando precisar de totais exatos) ──

export async function getMonthlySummary(): Promise<MonthlySummary> {
  const { start, end } = currentMonthRange();

  const { data, error } = await supabase
    .from('transactions')
    .select('type, amount')
    .eq('status', 'effected')
    .gte('date', start)
    .lte('date', end);

  if (error) return { income: 0, expense: 0 };

  let income  = 0;
  let expense = 0;
  for (const t of (data ?? []) as any[]) {
    if (t.type === 'income')  income  += Number(t.amount);
    if (t.type === 'expense') expense += Number(t.amount);
  }
  return { income, expense };
}
