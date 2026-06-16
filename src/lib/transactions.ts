import { supabase } from './supabase';

// ── Tipos ──────────────────────────────────────────────────────────────

export type TransactionType   = 'income' | 'expense' | 'transfer';
export type TransactionStatus = 'effected' | 'pending';

// Padrões de recorrência suportados.
export type RecurrencePattern =
  | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual';

// Formas de pagamento suportadas.
export type PaymentMethod =
  | 'pix' | 'cash' | 'credit' | 'debit' | 'bank_transfer';

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
  payment_method: PaymentMethod | null;
  // Recorrência (a "transação-modelo" guarda o padrão; as instâncias geradas
  // apontam para ela via recurring_parent).
  recurrence:       RecurrencePattern | null;
  recurrence_end:   string | null;   // YYYY-MM-DD (opcional)
  recurrence_next:  string | null;   // próxima data a gerar
  recurring_parent: string | null;
  created_at:  string;
};

export type TransactionRow = Transaction & {
  category_name: string | null;
  account_name:  string | null;
  to_account_name: string | null;
};

// ── Filtros ────────────────────────────────────────────────────────────

export type TransactionFilters = {
  type?:        TransactionType;
  status?:      TransactionStatus;
  account_id?:  string;
  category_id?: string;
  month?:       string;  // 'YYYY-MM'
  searchText?:  string;  // busca em descrição/notas
  dateFrom?:    string;  // 'YYYY-MM-DD'
  dateTo?:      string;  // 'YYYY-MM-DD'
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

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Avança uma data (YYYY-MM-DD) conforme o padrão de recorrência. */
export function addInterval(dateISO: string, pattern: RecurrencePattern): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  switch (pattern) {
    case 'daily':     dt.setUTCDate(dt.getUTCDate() + 1);   break;
    case 'weekly':    dt.setUTCDate(dt.getUTCDate() + 7);   break;
    case 'biweekly':  dt.setUTCDate(dt.getUTCDate() + 14);  break;
    case 'monthly':   dt.setUTCMonth(dt.getUTCMonth() + 1); break;
    case 'quarterly': dt.setUTCMonth(dt.getUTCMonth() + 3); break;
    case 'annual':    dt.setUTCFullYear(dt.getUTCFullYear() + 1); break;
  }
  return dt.toISOString().slice(0, 10);
}

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const id = data.user?.id;
  if (!id) throw new Error('Sessão expirada. Entre novamente.');
  return id;
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

  if (filters.type)        q = q.eq('type', filters.type);
  if (filters.status)      q = q.eq('status', filters.status);
  if (filters.account_id)  q = q.eq('account_id', filters.account_id);
  if (filters.category_id) q = q.eq('category_id', filters.category_id);
  if (filters.month) {
    const { start, end } = monthRange(filters.month);
    q = q.gte('date', start).lte('date', end);
  }
  if (filters.dateFrom) q = q.gte('date', filters.dateFrom);
  if (filters.dateTo)   q = q.lte('date', filters.dateTo);
  if (filters.searchText?.trim()) {
    const term = filters.searchText.trim().replace(/[%,]/g, ' ');
    q = q.or(`description.ilike.%${term}%,notes.ilike.%${term}%`);
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
  payment_method?: PaymentMethod;
  recurrence?:     RecurrencePattern;
  recurrence_end?: string;
};

export async function createTransaction(input: CreateTransactionInput): Promise<Transaction> {
  const user_id = await currentUserId();
  const recurring = !!input.recurrence;

  const row: Record<string, any> = {
    user_id,
    account_id:    input.account_id,
    category_id:   input.category_id   ?? null,
    to_account_id: input.to_account_id ?? null,
    type:          input.type,
    status:        input.status,
    description:   input.description,
    amount:        input.amount,
    date:          input.date,
    notes:         input.notes ?? null,
  };

  // Só referencia a coluna quando há valor — assim, quem ainda não aplicou a
  // migração 006 continua criando lançamentos sem forma de pagamento.
  if (input.payment_method) row.payment_method = input.payment_method;

  // Só referencia as colunas de recorrência quando há recorrência — assim, quem
  // ainda não aplicou a migração 005 continua criando lançamentos normais.
  // A transação-modelo é, ela mesma, a primeira ocorrência; a próxima fica
  // agendada para a data seguinte segundo o padrão escolhido.
  if (recurring) {
    row.recurrence      = input.recurrence;
    row.recurrence_end  = input.recurrence_end ?? null;
    row.recurrence_next = addInterval(input.date, input.recurrence!);
  }

  const { data, error } = await supabase
    .from('transactions')
    .insert(row)
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

// ── Recorrência ────────────────────────────────────────────────────────

/**
 * Gera as ocorrências pendentes de todas as transações recorrentes do usuário
 * cuja `recurrence_next` já venceu (<= hoje). Cada modelo pode gerar várias
 * instâncias de uma vez (ex.: app ficou meses sem abrir). Retorna quantas
 * transações foram criadas. Seguro chamar a cada boot — é idempotente.
 */
export async function generateDueRecurring(): Promise<number> {
  const today = todayISO();

  const { data: templates, error } = await supabase
    .from('transactions')
    .select('*')
    .not('recurrence', 'is', null)
    .lte('recurrence_next', today);

  if (error) throw error;

  let created = 0;

  for (const t of (templates ?? []) as any[]) {
    let next: string | null = t.recurrence_next;
    const end: string | null = t.recurrence_end;
    const inserts: any[] = [];

    while (next && next <= today && (!end || next <= end)) {
      inserts.push({
        user_id:       t.user_id,
        account_id:    t.account_id,
        category_id:   t.category_id,
        to_account_id: t.to_account_id,
        type:          t.type,
        status:        t.status,
        description:   t.description,
        amount:        t.amount,
        date:          next,
        notes:         t.notes,
        payment_method: t.payment_method ?? null,
        recurring_parent: t.id,
      });
      next = addInterval(next, t.recurrence as RecurrencePattern);
    }

    if (inserts.length) {
      const { error: insErr } = await supabase.from('transactions').insert(inserts);
      if (insErr) throw insErr;
      created += inserts.length;
    }

    // Avança o ponteiro do modelo mesmo quando nada foi inserido (mantém idempotência).
    if (next !== t.recurrence_next) {
      const { error: updErr } = await supabase
        .from('transactions')
        .update({ recurrence_next: next })
        .eq('id', t.id);
      if (updErr) throw updErr;
    }
  }

  return created;
}
