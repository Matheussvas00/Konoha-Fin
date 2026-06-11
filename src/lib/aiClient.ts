import { supabase } from './supabase';

// URL do serviço de IA (Python + Google ADK). Configure no .env do app:
//   EXPO_PUBLIC_AI_URL=https://sua-url-do-servico
const AI_URL = process.env.EXPO_PUBLIC_AI_URL ?? '';

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
export async function askAgent(
  question: string,
  history: ChatHistoryItem[],
  agentName: string,
): Promise<AgentReply> {
  if (!AI_URL) {
    throw new Error('EXPO_PUBLIC_AI_URL não configurada.');
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const res = await fetch(`${AI_URL.replace(/\/+$/, '')}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token ? `Bearer ${token}` : '',
    },
    body: JSON.stringify({ question, history, agentName }),
  });

  if (!res.ok) {
    throw new Error(`Serviço de IA respondeu ${res.status}`);
  }
  return res.json();
}
