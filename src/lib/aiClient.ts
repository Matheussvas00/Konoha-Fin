import { supabase } from './supabase';

export type AgentId = 'analista' | 'operador' | 'roteador';

export type AgentReply = {
  answer: string;
  agent?: AgentId;
  actions?: { tool: string; ok: boolean; message: string }[];
};

export type ChatHistoryItem = { role: 'user' | 'ai'; text: string };

export async function askAgent(
  question: string,
  history: ChatHistoryItem[],
  agentName: string,
): Promise<AgentReply> {
  try {
    const { data, error } = await supabase.functions.invoke<AgentReply>('ai-assistant', {
      body: {
        question,
        history,
        agentName,
      },
    });

    if (error) {
      throw new Error(error.message || 'Erro ao comunicar com o assistente.');
    }

    if (!data || typeof data !== 'object' || typeof data.answer !== 'string') {
      throw new Error('Resposta inválida do serviço de IA.');
    }

    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(message);
  }
}
