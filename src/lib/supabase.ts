import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Limpa o valor da variável: remove espaços e aspas acidentais e garante o
// prefixo https:// (causas comuns de "Invalid supabaseUrl" no deploy).
function cleanEnv(raw: string | undefined): string {
  return (raw ?? '').trim().replace(/^['"]+|['"]+$/g, '').trim();
}

function normalizeUrl(raw: string): string {
  let u = cleanEnv(raw);
  if (!u) return '';
  // Caso comum: colaram a URL do PAINEL (supabase.com/dashboard/project/<ref>)
  // em vez da URL da API. Extrai o <ref> e monta a URL correta da API.
  const dash = u.match(/supabase\.(?:com|co)\/dashboard\/project\/([a-z0-9]+)/i);
  if (dash) return `https://${dash[1]}.supabase.co`;
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u.replace(/\/+$/, '');
}

function isValidHttpUrl(u: string): boolean {
  try {
    const parsed = new URL(u);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.hostname.includes('.')
    );
  } catch {
    return false;
  }
}

const supabaseUrl = normalizeUrl(process.env.EXPO_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = cleanEnv(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

// Sinaliza problema de configuração SEM quebrar o boot (evita tela branca).
export const supabaseConfigError =
  !supabaseUrl || !supabaseAnonKey
    ? 'Configuração ausente: defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY nas Environment Variables da Vercel (Production) e refaça o deploy.'
    : !isValidHttpUrl(supabaseUrl)
      ? `EXPO_PUBLIC_SUPABASE_URL inválida: "${supabaseUrl}". Use exatamente algo como https://SEU-PROJETO.supabase.co (sem aspas e sem espaços).`
      : null;

export const supabase = createClient(
  isValidHttpUrl(supabaseUrl) ? supabaseUrl : 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);
