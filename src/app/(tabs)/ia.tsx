import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform, StatusBar, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font, alpha } from '../../lib/theme';
import { getAgentName, DEFAULT_AGENT_NAME } from '../../lib/agent';
import { supabase } from '../../lib/supabase';

// ── Sugestões rápidas ──────────────────────────────────────────────────

const SUGGESTIONS = [
  'Como foram meus gastos este mês?',
  'Em que categoria gasto mais?',
  'Lance uma despesa de R$ 50 no mercado pela carteira Nubank.',
  'Analise minha saúde financeira.',
];

// ── Tipos ──────────────────────────────────────────────────────────────

type AgentId = 'analista' | 'operador' | 'roteador';
type Message = { role: 'user' | 'ai'; text: string; agent?: AgentId };

const AGENT_LABELS: Record<AgentId, string> = {
  analista: 'Analista',
  operador: 'Operador',
  roteador: 'Roteador',
};

// ── Screen ─────────────────────────────────────────────────────────────

export default function IAScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [agentName, setAgentName] = useState(DEFAULT_AGENT_NAME);

  // Recarrega o nome do agente sempre que a tela ganha foco (reflete o que foi
  // definido no Perfil).
  useFocusEffect(
    useCallback(() => {
      let active = true;
      getAgentName().then((n) => { if (active) setAgentName(n); });
      return () => { active = false; };
    }, [])
  );

  async function send(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    setInput('');
    const history = messages.slice(-10);
    setMessages((prev) => [...prev, { role: 'user', text: q }]);
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: { question: q, history, agentName },
      });
      if (error) throw error;
      const answer = (data?.answer ?? '').trim();
      setMessages((prev) => [
        ...prev,
        { role: 'ai', text: answer || 'Não consegui gerar uma resposta agora.', agent: data?.agent },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          text: 'Não consegui falar com o assistente agora. Verifique sua conexão e tente novamente em instantes.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={s.header}>
        <View style={s.headerIcon}>
          <Ionicons name="sparkles" size={18} color={colors.text} />
        </View>
        <View>
          <Text style={s.headerTitle}>{agentName}</Text>
          <Text style={s.headerSub}>Seu assistente financeiro · Gemini</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Mensagens */}
        <ScrollView
          style={s.chat}
          contentContainerStyle={[s.chatContent, isEmpty && s.chatEmpty]}
          showsVerticalScrollIndicator={false}
        >
          {isEmpty ? (
            <View style={s.emptyState}>
              <View style={s.emptyIcon}>
                <Ionicons name="sparkles-outline" size={40} color={colors.text} />
              </View>
              <Text style={s.emptyTitle}>Olá! Sou {agentName}, seu assistente financeiro.</Text>
              <Text style={s.emptySub}>
                Vou analisar seus dados e responder perguntas sobre suas finanças.
              </Text>

              {/* Sugestões */}
              <View style={s.suggestions}>
                {SUGGESTIONS.map((sug) => (
                  <TouchableOpacity
                    key={sug}
                    style={s.sugChip}
                    onPress={() => send(sug)}
                  >
                    <Text style={s.sugTxt}>{sug}</Text>
                    <Ionicons name="arrow-forward" size={14} color={colors.text} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            messages.map((msg, i) => (
              <View
                key={i}
                style={[s.bubble, msg.role === 'user' ? s.bubbleUser : s.bubbleAI]}
              >
                {msg.role === 'ai' && (
                  <View style={s.aiAvatar}>
                    <Ionicons name="sparkles" size={12} color={colors.text} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  {msg.role === 'ai' && msg.agent && (
                    <View style={s.agentBadge}>
                      <Ionicons
                        name={msg.agent === 'operador' ? 'create-outline' : 'analytics-outline'}
                        size={10}
                        color={colors.textFaint}
                      />
                      <Text style={s.agentBadgeTxt}>Agente {AGENT_LABELS[msg.agent]}</Text>
                    </View>
                  )}
                  <Text style={[s.bubbleTxt, msg.role === 'user' && s.bubbleTxtUser]}>
                    {msg.text}
                  </Text>
                </View>
              </View>
            ))
          )}

          {loading && (
            <View style={[s.bubble, s.bubbleAI]}>
              <View style={s.aiAvatar}>
                <Ionicons name="sparkles" size={12} color={colors.text} />
              </View>
              <ActivityIndicator size="small" color={colors.text} style={{ marginLeft: 4 }} />
            </View>
          )}
        </ScrollView>

        {/* Input */}
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder="Pergunte sobre suas finanças…"
            placeholderTextColor={colors.placeholder}
            multiline
            returnKeyType="send"
            onSubmitEditing={() => send(input)}
          />
          <TouchableOpacity
            style={[s.sendBtn, (!input.trim() || loading) && s.sendBtnDisabled]}
            onPress={() => send(input)}
            disabled={!input.trim() || loading}
          >
            <Ionicons name="send" size={18} color={colors.brandText} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  header: {
    backgroundColor: colors.surface,
    paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: alpha(colors.text, 0.12),
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  headerSub:   { color: colors.textFaint, fontSize: 12, marginTop: 1 },

  chat: { flex: 1 },
  chatContent: { padding: 16, gap: 12, paddingBottom: 8 },
  chatEmpty: { flex: 1 },

  emptyState: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 8, gap: 12,
  },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: alpha(colors.text, 0.1),
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    color: colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center',
  },
  emptySub: {
    color: colors.textFaint, fontSize: 14, textAlign: 'center', lineHeight: 20,
  },

  suggestions: { width: '100%', gap: 8, marginTop: 8 },
  sugChip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  sugTxt: { color: colors.textMuted, fontSize: 14, flex: 1, marginRight: 8 },

  bubble: {
    maxWidth: '85%', borderRadius: 16, padding: 12,
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: colors.brand,
    borderBottomRightRadius: 4,
  },
  bubbleAI: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: colors.border,
  },
  aiAvatar: {
    width: 20, height: 20, borderRadius: 6,
    backgroundColor: alpha(colors.text, 0.15),
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  bubbleTxt:     { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  bubbleTxtUser: { color: colors.brandText },
  agentBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4,
  },
  agentBadgeTxt: {
    color: colors.textFaint, fontSize: 10, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.4,
  },

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  input: {
    flex: 1, backgroundColor: colors.bg,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    color: colors.text, fontSize: 15, maxHeight: 100,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: colors.border },
});
