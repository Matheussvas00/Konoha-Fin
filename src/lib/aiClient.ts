import { supabase } from './supabase';

export type AgentId = 'analista' | 'operador' | 'roteador' | 'grafico';

export type ChartPoint = { label: string; value: number };
export type ChartSpec = { type: 'bar' | 'pie'; title: string; points: ChartPoint[] };

export type AgentReply = {
  answer: string;
  agent?: AgentId;
  chart?: ChartSpec;
  actions?: { tool: string; ok: boolean; message: string }[];
};

export type ChatHistoryItem = { role: 'user' | 'ai'; text: string };

export async function askAgent(
  question: string,
  history: ChatHistoryItem[],
  agentName: string,
): Promise<AgentReply> {
  try {
    // Slug da Edge Function publicada no Supabase (nome gerado no deploy).
    const { data, error } = await supabase.functions.invoke<AgentReply>('hyper-handler', {
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

/**
 * Envia o áudio gravado (base64 ou data URL) para a Edge Function transcrever
 * com o Whisper (Groq) e devolve o texto reconhecido.
 */
export async function transcribeAudio(audioBase64: string, mime: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ text: string }>('hyper-handler', {
    body: { mode: 'transcribe', audio: audioBase64, mime },
  });
  if (error) {
    throw new Error(error.message || 'Erro ao transcrever o áudio.');
  }
  if (!data || typeof data.text !== 'string') {
    throw new Error('Transcrição inválida do serviço de IA.');
  }
  return data.text.trim();
}
