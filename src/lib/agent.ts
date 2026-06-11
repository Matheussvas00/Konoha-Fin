import AsyncStorage from '@react-native-async-storage/async-storage';

// Nome do assistente de IA (o "agente"), personalizável pelo usuário.
// Guardado localmente no dispositivo — não precisa de migração no banco.

const KEY = 'konoha:agent_name';
export const DEFAULT_AGENT_NAME = 'Konoha';

export async function getAgentName(): Promise<string> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    return v?.trim() ? v : DEFAULT_AGENT_NAME;
  } catch {
    return DEFAULT_AGENT_NAME;
  }
}

export async function setAgentName(name: string): Promise<string> {
  const value = name.trim() || DEFAULT_AGENT_NAME;
  await AsyncStorage.setItem(KEY, value);
  return value;
}
