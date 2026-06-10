import { supabase } from './supabase';

// ── Tipos ──────────────────────────────────────────────────────────────
export type Budget = {
  id:          string;
  user_id:     string;
  category_id: string;
  amount:      number;
  created_at:  string;
};

export type BudgetProgress = {
  id:           string;
  category_id:  string;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
  amount:       number; // limite
  spent:        number; // gasto no mês
  remaining:    number; // amount - spent
  pct:          number; // 0-100+ (pode passar de 100)
  over:         boolean;
};

const FALLBACK_COLOR = '#64748b';

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
  return { start, end };
}

// ── Consulta com progresso ─────────────────────────────────────────────
export async function listBudgetsWithProgress(): Promise<BudgetProgress[]> {
  const { start, end } = currentMonthRange();

  const { data: budgets, error } = await supabase
    .from('budgets')
    .select('id, category_id, amount, categories ( name, color, icon )')
    .order('created_at', { ascending: true });

  if (error) throw error;
  if (!budgets || budgets.length === 0) return [];

  // Gasto do mês por categoria (despesas efetivadas)
  const spentByCat = new Map<string, number>();
  try {
    const { data: tx } = await supabase
      .from('transactions')
      .select('category_id, amount')
      .eq('type', 'expense')
      .eq('status', 'effected')
      .gte('date', start)
      .lte('date', end);

    for (const t of (tx ?? []) as any[]) {
      if (!t.category_id) continue;
      spentByCat.set(t.category_id, (spentByCat.get(t.category_id) ?? 0) + Number(t.amount));
    }
  } catch {
    // sem transações ainda
  }

  return (budgets as any[]).map((b) => {
    const amount = Number(b.amount);
    const spent  = spentByCat.get(b.category_id) ?? 0;
    const pct    = amount > 0 ? (spent / amount) * 100 : 0;
    return {
      id:            b.id,
      category_id:   b.category_id,
      categoryName:  (b.categories as any)?.name ?? 'Categoria',
      categoryColor: (b.categories as any)?.color ?? FALLBACK_COLOR,
      categoryIcon:  (b.categories as any)?.icon ?? 'pricetag-outline',
      amount,
      spent,
      remaining:     amount - spent,
      pct,
      over:          spent > amount,
    };
  });
}

/** IDs de categorias que já têm orçamento (para filtrar no seletor). */
export async function getBudgetedCategoryIds(): Promise<string[]> {
  const { data, error } = await supabase.from('budgets').select('category_id');
  if (error) throw error;
  return (data ?? []).map((b: any) => b.category_id);
}

// ── Mutações ───────────────────────────────────────────────────────────
/** Cria ou atualiza o orçamento de uma categoria (upsert pelo par único). */
export async function upsertBudget(categoryId: string, amount: number): Promise<Budget> {
  const { data, error } = await supabase
    .from('budgets')
    .upsert(
      { category_id: categoryId, amount },
      { onConflict: 'user_id,category_id' }
    )
    .select()
    .single();

  if (error) throw error;
  return data as Budget;
}

export async function deleteBudget(id: string): Promise<void> {
  const { error } = await supabase.from('budgets').delete().eq('id', id);
  if (error) throw error;
}
