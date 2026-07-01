import { supabase } from './supabase';
import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPE_ICONS, ACCOUNT_TYPE_COLORS } from './accounts';

// ── Tipos ──────────────────────────────────────────────────────────────

export type WalletType = {
  id:         string;
  user_id:    string;
  key:        string;   // guardado em accounts.type
  name:       string;
  icon:       string | null;
  color:      string | null;
  is_default: boolean;
  sort:       number;
  created_at: string;
};

export const WALLET_TYPE_ICONS: string[] = [
  'business-outline', 'leaf-outline', 'cash-outline', 'card-outline',
  'trending-up-outline', 'wallet-outline', 'briefcase-outline', 'home-outline',
  'gift-outline', 'ellipsis-horizontal-outline',
];

export const WALLET_TYPE_COLORS: string[] = [
  '#2563eb', '#16a34a', '#ca8a04', '#7c3aed',
  '#ea580c', '#e63946', '#0891b2', '#64748b', '#db2777', '#059669',
];

const DEFAULTS: Array<{ key: string; name: string; icon: string; color: string; sort: number }> = [
  { key: 'checking',    name: 'Conta Corrente',    icon: 'business-outline',   color: '#2563eb', sort: 1 },
  { key: 'savings',     name: 'Poupança',          icon: 'leaf-outline',       color: '#16a34a', sort: 2 },
  { key: 'cash',        name: 'Dinheiro',          icon: 'cash-outline',       color: '#ca8a04', sort: 3 },
  { key: 'credit_card', name: 'Cartão de Crédito', icon: 'card-outline',       color: '#7c3aed', sort: 4 },
  { key: 'investment',  name: 'Investimento',      icon: 'trending-up-outline', color: '#ea580c', sort: 5 },
  { key: 'other',       name: 'Outro',             icon: 'ellipsis-horizontal-outline', color: '#64748b', sort: 6 },
];

// Resolve rótulo/ícone/cor de um tipo (a partir da lista carregada, com
// fallback nos metadados fixos e, por fim, um genérico).
export function walletTypeMeta(
  key: string,
  types: WalletType[],
): { label: string; icon: string; color: string } {
  const t = types.find((x) => x.key === key);
  if (t) return { label: t.name, icon: t.icon ?? 'wallet-outline', color: t.color ?? '#64748b' };
  return {
    label: ACCOUNT_TYPE_LABELS[key] ?? key,
    icon:  ACCOUNT_TYPE_ICONS[key] ?? 'wallet-outline',
    color: ACCOUNT_TYPE_COLORS[key] ?? '#64748b',
  };
}

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
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'tipo';
}

// ── Consultas ──────────────────────────────────────────────────────────

export async function listWalletTypes(): Promise<WalletType[]> {
  const { data, error } = await supabase
    .from('wallet_types')
    .select('*')
    .order('sort', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function ensureDefaultWalletTypes(): Promise<WalletType[]> {
  const existing = await listWalletTypes();
  if (existing.length > 0) return existing;
  const user_id = await currentUserId();
  const rows = DEFAULTS.map((d) => ({ user_id, ...d, is_default: true }));
  const { error } = await supabase.from('wallet_types').insert(rows);
  if (error) throw error;
  return listWalletTypes();
}

// ── Mutações ──────────────────────────────────────────────────────────

export async function createWalletType(input: { name: string; icon?: string; color?: string }): Promise<WalletType> {
  const user_id = await currentUserId();
  const existing = await listWalletTypes();
  const base = slugify(input.name);
  const keys = new Set(existing.map((p) => p.key));
  let key = base;
  let i = 2;
  while (keys.has(key)) { key = `${base}_${i++}`; }
  const sort = existing.reduce((m, p) => Math.max(m, p.sort), 0) + 1;

  const { data, error } = await supabase
    .from('wallet_types')
    .insert({ user_id, key, name: input.name.trim(), icon: input.icon ?? 'wallet-outline', color: input.color ?? '#64748b', is_default: false, sort })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateWalletType(id: string, input: { name?: string; icon?: string; color?: string }): Promise<WalletType> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.icon !== undefined) patch.icon = input.icon;
  if (input.color !== undefined) patch.color = input.color;
  const { data, error } = await supabase.from('wallet_types').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function getWalletTypeUsage(key: string): Promise<number> {
  const { count, error } = await supabase
    .from('accounts')
    .select('id', { count: 'exact', head: true })
    .eq('type', key);
  if (error) throw error;
  return count ?? 0;
}

export async function deleteWalletType(t: WalletType): Promise<void> {
  const usage = await getWalletTypeUsage(t.key);
  if (usage > 0) {
    throw new Error(
      `Não é possível excluir: ${usage} carteira${usage > 1 ? 's usam' : ' usa'} este tipo. ` +
      'Altere essas carteiras antes de excluí-lo.'
    );
  }
  const { error } = await supabase.from('wallet_types').delete().eq('id', t.id);
  if (error) throw error;
}
