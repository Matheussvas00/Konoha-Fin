import { supabase } from './supabase';

// ── Tipos ──────────────────────────────────────────────────────────────
export type AccountType =
  | 'checking'
  | 'savings'
  | 'cash'
  | 'credit_card'
  | 'investment'
  | 'other';

export type Account = {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  initial_balance: number;
  currency: string;
  color: string | null;
  icon: string | null;
  is_archived: boolean;
  created_at: string;
};

export type AccountWithBalance = Account & {
  balance: number;
};

// ── Metadados de exibição ─────────────────────────────────────────────
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking:    'Conta Corrente',
  savings:     'Poupança',
  cash:        'Dinheiro',
  credit_card: 'Cartão de Crédito',
  investment:  'Investimento',
  other:       'Outro',
};

export const ACCOUNT_TYPE_ICONS: Record<AccountType, string> = {
  checking:    'business-outline',
  savings:     'leaf-outline',
  cash:        'cash-outline',
  credit_card: 'card-outline',
  investment:  'trending-up-outline',
  other:       'ellipsis-horizontal-outline',
};

export const ACCOUNT_TYPE_COLORS: Record<AccountType, string> = {
  checking:    '#2563eb',
  savings:     '#16a34a',
  cash:        '#ca8a04',
  credit_card: '#7c3aed',
  investment:  '#ea580c',
  other:       '#64748b',
};

export const ACCOUNT_TYPES: AccountType[] = [
  'checking', 'savings', 'cash', 'credit_card', 'investment', 'other',
];

// ── Consultas ─────────────────────────────────────────────────────────

/** Lista carteiras ativas do usuário com saldo calculado pela view. */
export async function listAccountsWithBalance(): Promise<AccountWithBalance[]> {
  const [
    { data: accounts, error: aErr },
    { data: balances, error: bErr },
  ] = await Promise.all([
    supabase
      .from('accounts')
      .select('*')
      .eq('is_archived', false)
      .order('created_at', { ascending: true }),
    supabase
      .from('account_balances')
      .select('*'),
  ]);

  if (aErr) throw aErr;
  if (bErr) throw bErr;

  // A view retorna { id, balance } onde id = account_id
  const balanceMap = new Map<string, number>(
    (balances ?? []).map((b: { id: string; balance: number }) => [b.id, Number(b.balance)])
  );

  return (accounts ?? []).map((a) => ({
    ...a,
    initial_balance: Number(a.initial_balance),
    // Se a view ainda não tem o registro (conta nova), usa o initial_balance
    balance: balanceMap.has(a.id) ? balanceMap.get(a.id)! : Number(a.initial_balance),
  }));
}

// ── Mutações ──────────────────────────────────────────────────────────

export type CreateAccountInput = {
  name: string;
  type: AccountType;
  initial_balance: number;
  color?: string;
  currency?: string;
};

export async function createAccount(input: CreateAccountInput): Promise<Account> {
  const { data, error } = await supabase
    .from('accounts')
    .insert({
      name:            input.name,
      type:            input.type,
      initial_balance: input.initial_balance,
      color:           input.color ?? ACCOUNT_TYPE_COLORS[input.type],
      currency:        input.currency ?? 'BRL',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export type UpdateAccountInput = {
  name?: string;
  type?: AccountType;
  color?: string;
};

export async function updateAccount(id: string, input: UpdateAccountInput): Promise<Account> {
  const { data, error } = await supabase
    .from('accounts')
    .update(input)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function archiveAccount(id: string): Promise<void> {
  const { error } = await supabase
    .from('accounts')
    .update({ is_archived: true })
    .eq('id', id);

  if (error) throw error;
}

/** Reativa uma carteira arquivada. */
export async function restoreAccount(id: string): Promise<void> {
  const { error } = await supabase
    .from('accounts')
    .update({ is_archived: false })
    .eq('id', id);

  if (error) throw error;
}

/** Lista apenas as carteiras arquivadas. */
export async function listArchivedAccounts(): Promise<Account[]> {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('is_archived', true)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((a) => ({ ...a, initial_balance: Number(a.initial_balance) }));
}

/**
 * Exclui permanentemente uma carteira.
 * Falha se ainda existirem lançamentos vinculados (FK restrict),
 * protegendo o histórico financeiro.
 */
export async function deleteAccount(id: string): Promise<void> {
  const { error } = await supabase
    .from('accounts')
    .delete()
    .eq('id', id);

  if (error) {
    if (error.code === '23503' || /foreign key|violates/i.test(error.message)) {
      throw new Error(
        'Esta carteira possui lançamentos e não pode ser excluída. Mantenha-a arquivada.'
      );
    }
    throw error;
  }
}
