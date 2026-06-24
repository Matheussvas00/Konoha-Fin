import { supabase } from './supabase';

// ── Tipos ──────────────────────────────────────────────────────────────
export type CategorySlice = {
  name:    string;
  color:   string;
  total:   number;
  pct:     number; // 0-100
};

export type MonthBar = {
  key:     string; // '2026-06'
  label:   string; // 'jun'
  income:  number;
  expense: number;
};

export type PaymentSlice = {
  key:   string;
  label: string;
  icon:  string;
  total: number;
  pct:   number; // 0-100
};

const PAYMENT_META: Record<string, { label: string; icon: string }> = {
  pix:           { label: 'Pix',                  icon: 'qr-code-outline' },
  cash:          { label: 'Dinheiro',             icon: 'cash-outline' },
  credit:        { label: 'Crédito',              icon: 'card-outline' },
  debit:         { label: 'Débito',               icon: 'card' },
  bank_transfer: { label: 'Transf. bancária',     icon: 'swap-horizontal-outline' },
  none:          { label: 'Sem forma',            icon: 'help-circle-outline' },
};

// ── Helpers ────────────────────────────────────────────────────────────
const MONTH_LABELS = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

const FALLBACK_COLOR = '#64748b';

function monthRange(year: number, month: number) {
  const start = new Date(year, month, 1).toISOString();
  const end   = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
  return { start, end };
}

// ── Despesas por categoria (mês atual) ─────────────────────────────────
export async function getCategoryBreakdown(
  type: 'expense' | 'income' = 'expense'
): Promise<CategorySlice[]> {
  const now = new Date();
  const { start, end } = monthRange(now.getFullYear(), now.getMonth());

  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('amount, categories ( name, color )')
      .eq('status', 'effected')
      .eq('type', type)
      .gte('date', start)
      .lte('date', end);

    if (error) return [];

    // Agrupa por nome de categoria
    const map = new Map<string, { color: string; total: number }>();
    for (const t of (data ?? []) as any[]) {
      const cat   = (t.categories as any)?.name ?? 'Sem categoria';
      const color = (t.categories as any)?.color ?? FALLBACK_COLOR;
      const prev  = map.get(cat);
      map.set(cat, { color, total: (prev?.total ?? 0) + Number(t.amount) });
    }

    const total = Array.from(map.values()).reduce((s, v) => s + v.total, 0);
    if (total === 0) return [];

    return Array.from(map.entries())
      .map(([name, v]) => ({
        name,
        color: v.color,
        total: v.total,
        pct:   (v.total / total) * 100,
      }))
      .sort((a, b) => b.total - a.total);
  } catch {
    return [];
  }
}

// ── Despesas por forma de pagamento (mês atual) ────────────────────────
export async function getPaymentBreakdown(): Promise<PaymentSlice[]> {
  const now = new Date();
  const { start, end } = monthRange(now.getFullYear(), now.getMonth());

  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('amount, payment_method')
      .eq('status', 'effected')
      .eq('type', 'expense')
      .gte('date', start)
      .lte('date', end);

    // Coluna pode não existir ainda (migração 006 não rodada) → silencioso
    if (error) return [];

    const map = new Map<string, number>();
    for (const t of (data ?? []) as any[]) {
      const key = t.payment_method ?? 'none';
      map.set(key, (map.get(key) ?? 0) + Number(t.amount));
    }

    const total = Array.from(map.values()).reduce((s, v) => s + v, 0);
    if (total === 0) return [];

    // Resolve rótulo/ícone pelas formas cadastradas (tabela 007); cai no mapa
    // fixo para keys legadas ou "none".
    const custom = new Map<string, { label: string; icon: string }>();
    try {
      const { data: pms } = await supabase.from('payment_methods').select('key, name, icon');
      for (const p of (pms ?? []) as any[]) {
        custom.set(p.key, { label: p.name, icon: p.icon ?? 'wallet-outline' });
      }
    } catch { /* tabela pode não existir ainda */ }

    const meta = (key: string) =>
      custom.get(key) ?? PAYMENT_META[key] ?? { label: key, icon: PAYMENT_META.none.icon };

    return Array.from(map.entries())
      .map(([key, v]) => ({
        key,
        label: key === 'none' ? PAYMENT_META.none.label : meta(key).label,
        icon:  key === 'none' ? PAYMENT_META.none.icon  : meta(key).icon,
        total: v,
        pct:   (v / total) * 100,
      }))
      .sort((a, b) => b.total - a.total);
  } catch {
    return [];
  }
}

// ── Evolução mensal (últimos N meses) ──────────────────────────────────
export async function getMonthlyEvolution(months = 6): Promise<MonthBar[]> {
  const now = new Date();

  // Janela: do 1º dia de (now - months + 1) até o fim do mês atual
  const startDate = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const endDate   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  // Esqueleto com todos os meses zerados (mantém a ordem mesmo sem dados)
  const bars: MonthBar[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1) + i, 1);
    bars.push({
      key:     `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label:   MONTH_LABELS[d.getMonth()],
      income:  0,
      expense: 0,
    });
  }
  const index = new Map(bars.map((b, i) => [b.key, i]));

  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('type, amount, date')
      .eq('status', 'effected')
      .gte('date', startDate.toISOString())
      .lte('date', endDate.toISOString());

    if (error) return bars;

    for (const t of (data ?? []) as any[]) {
      const d   = new Date(t.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const i   = index.get(key);
      if (i === undefined) continue;
      if (t.type === 'income')  bars[i].income  += Number(t.amount);
      if (t.type === 'expense') bars[i].expense += Number(t.amount);
    }
    return bars;
  } catch {
    return bars;
  }
}
