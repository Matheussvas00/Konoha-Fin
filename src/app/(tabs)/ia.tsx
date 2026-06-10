import { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform, StatusBar, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// ── Sugestões rápidas ──────────────────────────────────────────────────

const SUGGESTIONS = [
  'Como foram meus gastos este mês?',
  'Em que categoria gasto mais?',
  'Quanto posso poupar por mês?',
  'Analise minha saúde financeira.',
];

// ── Tipos ──────────────────────────────────────────────────────────────

type Message = { role: 'user' | 'ai'; text: string };

// ── Screen ─────────────────────────────────────────────────────────────

export default function IAScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: text.trim() }]);
    setLoading(true);

    // TODO: integrar Supabase Edge Function com Gemini
    // Por enquanto: resposta simulada
    await new Promise((r) => setTimeout(r, 1200));
    setMessages((prev) => [
      ...prev,
      {
        role: 'ai',
        text: '🚧 O assistente IA ainda está em desenvolvimento.\n\nEm breve você poderá fazer perguntas sobre seus gastos, receber análises personalizadas e dicas de economia direto aqui.',
      },
    ]);
    setLoading(false);
  }

  const isEmpty = messages.length === 0;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={s.header}>
        <View style={s.headerIcon}>
          <Ionicons name="sparkles" size={18} color="#e63946" />
        </View>
        <View>
          <Text style={s.headerTitle}>Assistente IA</Text>
          <Text style={s.headerSub}>Powered by Gemini · Em breve</Text>
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
                <Ionicons name="sparkles-outline" size={40} color="#e63946" />
              </View>
              <Text style={s.emptyTitle}>Olá! Sou seu assistente financeiro.</Text>
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
                    <Ionicons name="arrow-forward" size={14} color="#e63946" />
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
                    <Ionicons name="sparkles" size={12} color="#e63946" />
                  </View>
                )}
                <Text style={[s.bubbleTxt, msg.role === 'user' && s.bubbleTxtUser]}>
                  {msg.text}
                </Text>
              </View>
            ))
          )}

          {loading && (
            <View style={[s.bubble, s.bubbleAI]}>
              <View style={s.aiAvatar}>
                <Ionicons name="sparkles" size={12} color="#e63946" />
              </View>
              <ActivityIndicator size="small" color="#e63946" style={{ marginLeft: 4 }} />
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
            placeholderTextColor="#4a4a6a"
            multiline
            returnKeyType="send"
            onSubmitEditing={() => send(input)}
          />
          <TouchableOpacity
            style={[s.sendBtn, (!input.trim() || loading) && s.sendBtnDisabled]}
            onPress={() => send(input)}
            disabled={!input.trim() || loading}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f0f1e' },

  header: {
    backgroundColor: '#1a1a2e',
    paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderBottomWidth: 1, borderBottomColor: '#2a2a4e',
  },
  headerIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(230,57,70,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerSub:   { color: '#555', fontSize: 12, marginTop: 1 },

  chat: { flex: 1 },
  chatContent: { padding: 16, gap: 12, paddingBottom: 8 },
  chatEmpty: { flex: 1 },

  emptyState: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 8, gap: 12,
  },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: 'rgba(230,57,70,0.1)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center',
  },
  emptySub: {
    color: '#666', fontSize: 14, textAlign: 'center', lineHeight: 20,
  },

  suggestions: { width: '100%', gap: 8, marginTop: 8 },
  sugChip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1a1a2e', borderRadius: 12,
    borderWidth: 1, borderColor: '#2a2a4e',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  sugTxt: { color: '#aaa', fontSize: 14, flex: 1, marginRight: 8 },

  bubble: {
    maxWidth: '85%', borderRadius: 16, padding: 12,
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: '#e63946',
    borderBottomRightRadius: 4,
  },
  bubbleAI: {
    alignSelf: 'flex-start',
    backgroundColor: '#1a1a2e',
    borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: '#2a2a4e',
  },
  aiAvatar: {
    width: 20, height: 20, borderRadius: 6,
    backgroundColor: 'rgba(230,57,70,0.15)',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  bubbleTxt:     { color: '#ddd', fontSize: 14, lineHeight: 20, flex: 1 },
  bubbleTxtUser: { color: '#fff' },

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#1a1a2e',
    borderTopWidth: 1, borderTopColor: '#2a2a4e',
  },
  input: {
    flex: 1, backgroundColor: '#0f0f1e',
    borderWidth: 1, borderColor: '#2a2a4e',
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    color: '#fff', fontSize: 15, maxHeight: 100,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#e63946',
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#2a2a4e' },
});
