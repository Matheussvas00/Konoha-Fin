import { supabase } from './supabase';

// URL do serviço de IA (Python + Google ADK). Configure no .env do app:
//   EXPO_PUBLIC_AI_URL=https://sua-url-do-servico
const AI_URL = process.env.EXPO_PUBLIC_AI_URL?.trim() ?? '';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, '');
const FALLBACK_AI_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/ai-assistant` : '';

export type AgentId = 'analista' | 'operador' | 'roteador';

export type AgentReply = {
  answer: string;
  agent?: AgentId;
  actions?: { tool: string; ok: boolean; message: string }[];
};

export type ChatHistoryItem = { role: 'user' | 'ai'; text: string };

/**
 * Envia a pergunta ao serviço multiagente, incluindo o token do usuário para
 * que o backend aplique RLS (cada agente só vê/escreve os dados do usuário).
 */
async function readErrorMessage(res: Response): Promise<string> {
  const raw = await res.text().catch(() => '');
  if (!raw) return '';

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.error === 'string') return parsed.error;
    if (typeof parsed?.detail === 'string') return parsed.detail;
    if (typeof parsed?.message === 'string') return parsed.message;
  } catch {
    // ignora e usa o texto bruto abaixo
  }

  return raw.slice(0, 240);
}

export async function askAgent(
  question: string,
  history: ChatHistoryItem[],
  agentName: string,
): Promise<AgentReply> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const targets = [
    AI_URL ? `${AI_URL.replace(/\/+$/, '')}/chat` : null,
    FALLBACK_AI_URL,
  ].filter(Boolean) as string[];

  if (!targets.length) {
    throw new Error('Nenhuma configuração de IA encontrada. Defina EXPO_PUBLIC_AI_URL ou EXPO_PUBLIC_SUPABASE_URL.');
  }

  let lastError: Error | null = null;

  for (let i = 0; i < targets.length; i += 1) {
    const target = targets[i];
    try {
      const res = await fetch(target, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ question, history, agentName }),
      });

      if (!res.ok) {
        const detail = await readErrorMessage(res);
        if (i < targets.length - 1) {
          lastError = new Error(`Tentando outro endpoint de IA após erro ${res.status} em ${target}${detail ? `: ${detail}` : ''}`);
          continue;
        }
        throw new Error(`Serviço de IA respondeu ${res.status} em ${target}${detail ? `. ${detail}` : ''}`);
      }

      const payload = await res.json();
      if (!payload || typeof payload !== 'object') {
        throw new Error(`Resposta inválida do serviço de IA em ${target}.`);
      }

      return payload as AgentReply;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (i < targets.length - 1) {
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error('Não foi possível contactar o serviço de IA.');
}
