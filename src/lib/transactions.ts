import { supabase } from './supabase';

// ── Tipos ──────────────────────────────────────────────────────────────

export type TransactionType   = 'income' | 'expense' | 'transfer';
export type TransactionStatus = 'effected' | 'pending';

export type Transaction = {
  id:          string;
  user_id:     string;
  account_id:  string;
  category_id: string | null;
  to_account_id: string | null;   // só em transferências
  type:        TransactionType;
  status:      TransactionStatus;
  description: string;
  amount:      number;
  date:        string;            // YYYY-MM-DD
  notes:       string | null;
  created_at:  string;
};

export type TransactionRow = Transaction & {
  category_name: string | null;
  account_name:  string | null;
  to_account_name: string | null;
};

// ── Filtros ────────────────────────────────────────────────────────────

export type TransactionFilters = {
  type?:       TransactionType;
  status?:     TransactionStatus;
  account_id?: string;
  month?:      string;  // 'YYYY-MM'
};

// ── Helpers ────────────────────────────────────────────────────────────

function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number);
  const start  = new Date(y, m - 1, 1).toISOString().slice(0, 10);
  const end    = new Date(y, m, 0).toISOString().slice(0, 10);
  return { start, end };
}

export function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ── Consultas ──────────────────────────────────────────────────────────

export async function listTransactions(filters: TransactionFilters = {}): Promise<TransactionRow[]> {
  let q = supabase
    .from('transactions')
    .select(`
      *,
      categories ( name ),
      accounts!transactions_account_id_fkey ( name ),
      to_account:accounts!transactions_to_account_id_fkey ( name )
    `)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters.type)       q = q.eq('type', filters.type);
  if (filters.status)     q = q.eq('status', filters.status);
  if (filters.account_id) q = q.eq('account_id', filters.account_id);
  if (filters.month) {
    const { start, end } = monthRange(filters.month);
    q = q.gte('date', start).lte('date', end);
  }

  const { data, error } = await q;
  if (error) throw error;

  return ((data ?? []) as any[]).map((t) => ({
    ...t,
    amount:          Number(t.amount),
    category_name:   t.categories?.name   ?? null,
    account_name:    t.accounts?.name     ?? null,
    to_account_name: t.to_account?.name   ?? null,
  }));
}

// ── Mutações ──────────────────────────────────────────────────────────

export type CreateTransactionInput = {
  account_id:    string;
  category_id?:  string;
  to_account_id?: string;
  type:          TransactionType;
  status:        TransactionStatus;
  description:   string;
  amount:        number;
  date:          string;
  notes?:        string;
};

export async function createTransaction(input: CreateTransactionInput): Promise<Transaction> {
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      account_id:    input.account_id,
      category_id:   input.category_id   ?? null,
      to_account_id: input.to_account_id ?? null,
      type:          input.type,
      status:        input.status,
      description:   input.description,
      amount:        input.amount,
      date:          input.date,
      notes:         input.notes ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return { ...data, amount: Number(data.amount) };
}

export type UpdateTransactionInput = Partial<Omit<CreateTransactionInput, 'type'>>;

export async function updateTransaction(id: string, input: UpdateTransactionInput): Promise<Transaction> {
  const { data, error } = await supabase
    .from('transactions')
    .update(input)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return { ...data, amount: Number(data.amount) };
}

export async function toggleStatus(id: string, current: TransactionStatus): Promise<void> {
  const next = current === 'pending' ? 'effected' : 'pending';
  const { error } = await supabase
    .from('transactions')
    .update({ status: next })
    .eq('id', id);

  if (error) throw error;
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
