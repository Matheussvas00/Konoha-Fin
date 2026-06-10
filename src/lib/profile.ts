import { supabase } from './supabase';

export type Profile = {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url?: string | null;
  created_at?: string;
};

// Regex de username: 3-20 chars, letras/números/._, sem espaço
const USERNAME_RE = /^[a-zA-Z0-9._]{3,20}$/;

export function validateUsername(username: string): string | null {
  const u = username.trim();
  if (!u) return 'Digite um nome de usuário.';
  if (!USERNAME_RE.test(u)) {
    return 'Use 3-20 caracteres: letras, números, ponto ou underline (sem espaços).';
  }
  return null;
}

/** Perfil do usuário logado. */
export async function getMyProfile(): Promise<Profile | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, username, avatar_url, created_at')
    .eq('id', auth.user.id)
    .single();

  if (error) throw error;
  return data as Profile;
}

/** Atualiza nome e/ou username do usuário logado. */
export async function updateMyProfile(patch: {
  full_name?: string;
  username?: string;
}): Promise<Profile> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Não autenticado.');

  const update: Record<string, any> = {};
  if (patch.full_name !== undefined) update.full_name = patch.full_name.trim();
  if (patch.username !== undefined) update.username = patch.username.trim();

  const { data, error } = await supabase
    .from('profiles')
    .update(update)
    .eq('id', auth.user.id)
    .select('id, full_name, username, avatar_url, created_at')
    .single();

  if (error) {
    // Violação do índice único de username
    if (error.code === '23505' || /duplicate|unique/i.test(error.message)) {
      throw new Error('Este nome de usuário já está em uso.');
    }
    throw error;
  }
  return data as Profile;
}

/** Verifica se o username está disponível (via RPC security definer). */
export async function isUsernameAvailable(username: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_username_available', {
    p_username: username.trim(),
  });
  if (error) throw error;
  return data === true;
}

/** Resolve um username para o e-mail correspondente (para login). */
export async function getEmailByUsername(username: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_email_by_username', {
    p_username: username.trim(),
  });
  if (error) throw error;
  return (data as string) || null;
}

/** Heurística simples: contém "@" => é e-mail. */
export function looksLikeEmail(value: string): boolean {
  return value.includes('@');
}
