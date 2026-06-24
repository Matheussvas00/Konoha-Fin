import { supabase } from './supabase';

// ── Tipos ──────────────────────────────────────────────────────────────

export type PaymentMethod = {
  id:         string;
  user_id:    string;
  key:        string;   // identificador estável guardado em transactions.payment_method
  name:       string;   // rótulo exibido
  icon:       string | null;
  is_default: boolean;
  sort:       number;
  created_at: string;
};

// Ícones sugeridos no seletor.
export const PAYMENT_ICONS: Array<{ icon: string; label: string }> = [
  { icon: 'qr-code-outline',          label: 'Pix'          },
  { icon: 'cash-outline',             label: 'Dinheiro'     },
  { icon: 'card-outline',             label: 'Cartão'       },
  { icon: 'card',                     label: 'Cartão 2'     },
  { icon: 'swap-horizontal-outline',  label: 'Transf.'      },
  { icon: 'wallet-outline',           label: 'Carteira'     },
  { icon: 'gift-outline',             label: 'Vale'         },
  { icon: 'phone-portrait-outline',   label: 'App'          },
  { icon: 'business-outline',         label: 'Boleto'       },
  { icon: 'ellipsis-horizontal-outline', label: 'Outro'    },
];

// Formas padrão (usadas para semear quando o usuário não tem nenhuma).
const DEFAULTS: Array<{ key: string; name: string; icon: string; sort: number }> = [
  { key: 'pix',           name: 'Pix',                    icon: 'qr-code-outline',        sort: 1 },
  { key: 'cash',          name: 'Dinheiro',               icon: 'cash-outline',           sort: 2 },
  { key: 'credit',        name: 'Crédito',                icon: 'card-outline',           sort: 3 },
  { key: 'debit',         name: 'Débito',                 icon: 'card',                   sort: 4 },
  { key: 'bank_transfer', name: 'Transferência bancária', icon: 'swap-horizontal-outline', sort: 5 },
];

// ── Helpers ────────────────────────────────────────────────────────────

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const id = data.user?.id;
  if (!id) throw new Error('Sessão expirada. Entre novamente.');
  return id;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // remove acentos
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'forma';
}

// ── Consultas ──────────────────────────────────────────────────────────

export async function listPaymentMethods(): Promise<PaymentMethod[]> {
  const { data, error } = await supabase
    .from('payment_methods')
    .select('*')
    .order('sort', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/** Garante que o usuário tenha ao menos as formas padrão. */
export async function ensureDefaultPaymentMethods(): Promise<PaymentMethod[]> {
  const existing = await listPaymentMethods();
  if (existing.length > 0) return existing;

  const user_id = await currentUserId();
  const rows = DEFAULTS.map((d) => ({ user_id, ...d, is_default: true }));
  const { error } = await supabase.from('payment_methods').insert(rows);
  if (error) throw error;
  return listPaymentMethods();
}

// ── Mutações ──────────────────────────────────────────────────────────

export async function createPaymentMethod(input: { name: string; icon?: string }): Promise<PaymentMethod> {
  const user_id = await currentUserId();
  const existing = await listPaymentMethods();

  // Gera uma key única a partir do nome.
  const base = slugify(input.name);
  const keys = new Set(existing.map((p) => p.key));
  let key = base;
  let i = 2;
  while (keys.has(key)) { key = `${base}_${i++}`; }

  const sort = existing.reduce((m, p) => Math.max(m, p.sort), 0) + 1;

  const { data, error } = await supabase
    .from('payment_methods')
    .insert({ user_id, key, name: input.name.trim(), icon: input.icon ?? 'wallet-outline', is_default: false, sort })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updatePaymentMethod(id: string, input: { name?: string; icon?: string }): Promise<PaymentMethod> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.icon !== undefined) patch.icon = input.icon;

  const { data, error } = await supabase
    .from('payment_methods')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Quantos lançamentos usam esta forma de pagamento (pela key). */
export async function getPaymentMethodUsage(key: string): Promise<number> {
  const { count, error } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('payment_method', key);

  if (error) throw error;
  return count ?? 0;
}

export async function deletePaymentMethod(pm: PaymentMethod): Promise<void> {
  // Regra de negócio: só exclui se nenhuma transação usar esta forma.
  const usage = await getPaymentMethodUsage(pm.key);
  if (usage > 0) {
    throw new Error(
      `Não é possível excluir: esta forma tem ${usage} lançamento${usage > 1 ? 's' : ''} vinculado${usage > 1 ? 's' : ''}. ` +
      'Altere esses lançamentos antes de excluí-la.'
    );
  }

  const { error } = await supabase.from('payment_methods').delete().eq('id', pm.id);
  if (error) throw error;
}
