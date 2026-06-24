import { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform, StatusBar, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font, alpha } from '../../lib/theme';
import { getAgentName, DEFAULT_AGENT_NAME } from '../../lib/agent';
import { askAgent, transcribeAudio, type ChartSpec } from '../../lib/aiClient';
import {
  audioRecordingAvailable, startAudioRecording, textToSpeechAvailable, speak, stopSpeaking,
  type AudioRecorder,
} from '../../lib/voiceWeb';

// ── Sugestões rápidas ──────────────────────────────────────────────────

const SUGGESTIONS = [
  'Como foram meus gastos este mês?',
  'Mostre um gráfico dos meus gastos por categoria.',
  'Lance uma despesa de R$ 50 no mercado pela carteira Nubank.',
  'Analise minha saúde financeira.',
];

// ── Tipos ──────────────────────────────────────────────────────────────

type AgentId = 'analista' | 'operador' | 'roteador' | 'grafico';
type Message = { role: 'user' | 'ai'; text: string; agent?: AgentId; chart?: ChartSpec };

const AGENT_LABELS: Record<AgentId, string> = {
  analista: 'Analista',
  operador: 'Operador',
  roteador: 'Roteador',
  grafico: 'Gráficos',
};

function formatBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ── Gráfico no chat (barras horizontais, sem libs) ─────────────────────

function ChatChart({ chart }: { chart: ChartSpec }) {
  const pts = chart.points.filter((p) => Number.isFinite(p.value) && p.value !== 0);
  if (!pts.length) return null;
  const max = Math.max(1, ...pts.map((p) => Math.abs(p.value)));
  const total = pts.reduce((acc, p) => acc + Math.abs(p.value), 0) || 1;

  return (
    <View style={s.chartCard}>
      <View style={s.chartHead}>
        <Ionicons name="bar-chart-outline" size={14} color={colors.text} />
        <Text style={s.chartTitle}>{chart.title}</Text>
      </View>
      <View style={{ gap: 10, marginTop: 4 }}>
        {pts.map((p, i) => (
          <View key={i} style={{ gap: 4 }}>
            <View style={s.chartRowTop}>
              <Text style={s.chartLabel} numberOfLines={1}>{p.label}</Text>
              <Text style={s.chartValue}>{formatBRL(p.value)}</Text>
            </View>
            <View style={s.chartTrack}>
              <View style={[s.chartFill, { width: `${Math.max((Math.abs(p.value) / max) * 100, 2)}%` }]} />
            </View>
            {chart.type === 'pie' && (
              <Text style={s.chartPct}>{((Math.abs(p.value) / total) * 100).toFixed(0)}%</Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────

export default function IAScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [agentName, setAgentName] = useState(DEFAULT_AGENT_NAME);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceOut, setVoiceOut]   = useState(false);
  const recRef = useRef<AudioRecorder | null>(null);

  const micOn = audioRecordingAvailable();
  const ttsOn = textToSpeechAvailable();

  function toggleVoiceOut() {
    setVoiceOut((v) => {
      if (v) stopSpeaking();
      return !v;
    });
  }

  function pushAI(text: string) {
    setMessages((prev) => [...prev, { role: 'ai', text }]);
  }

  async function toggleMic() {
    if (transcribing) return;

    // Parar a gravação → transcrever → enviar.
    if (recording) {
      setRecording(false);
      const rec = recRef.current;
      recRef.current = null;
      if (!rec) return;
      setTranscribing(true);
      try {
        const out = await rec.stop();
        if (out?.base64) {
          const text = await transcribeAudio(out.base64, out.mime);
          if (text) send(text);
          else pushAI('Não entendi o áudio. Tente falar de novo, mais perto do microfone.');
        }
      } catch (e: any) {
        pushAI(`Não consegui transcrever o áudio.\n\nDetalhe: ${String(e?.message ?? e)}`);
      } finally {
        setTranscribing(false);
      }
      return;
    }

    // Iniciar a gravação.
    const rec = await startAudioRecording();
    if (!rec) {
      pushAI('Não consegui acessar o microfone. Verifique a permissão do navegador para este site.');
      return;
    }
    recRef.current = rec;
    setRecording(true);
  }

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
      const data = await askAgent(q, history, agentName);
      const answer = (data?.answer ?? '').trim() || 'Não consegui gerar uma resposta agora.';
      setMessages((prev) => [
        ...prev,
        { role: 'ai', text: answer, agent: data?.agent, chart: data?.chart },
      ]);
      if (voiceOut) speak(answer);
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          text: `Não consegui falar com o assistente.\n\nDetalhe: ${String(e?.message ?? e)}`,
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
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>{agentName}</Text>
          <Text style={s.headerSub}>Seu assistente financeiro · Groq</Text>
        </View>
        {ttsOn && (
          <TouchableOpacity
            onPress={toggleVoiceOut}
            style={[s.voiceBtn, voiceOut && s.voiceBtnActive]}
            hitSlop={8}
          >
            <Ionicons
              name={voiceOut ? 'volume-high' : 'volume-mute'}
              size={18}
              color={voiceOut ? colors.brandText : colors.textMuted}
            />
          </TouchableOpacity>
        )}
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
                        name={
                          msg.agent === 'operador' ? 'create-outline'
                          : msg.agent === 'grafico' ? 'bar-chart-outline'
                          : 'analytics-outline'
                        }
                        size={10}
                        color={colors.textFaint}
                      />
                      <Text style={s.agentBadgeTxt}>Agente {AGENT_LABELS[msg.agent]}</Text>
                    </View>
                  )}
                  <Text style={[s.bubbleTxt, msg.role === 'user' && s.bubbleTxtUser]}>
                    {msg.text}
                  </Text>
                  {msg.role === 'ai' && msg.chart && <ChatChart chart={msg.chart} />}
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
            placeholder={
              recording ? 'Gravando… toque no microfone para enviar'
              : transcribing ? 'Transcrevendo o áudio…'
              : 'Pergunte sobre suas finanças…'
            }
            placeholderTextColor={colors.placeholder}
            multiline
            returnKeyType="send"
            onSubmitEditing={() => send(input)}
          />
          {micOn && (
            <TouchableOpacity
              style={[s.sendBtn, s.micBtn, recording && s.micBtnActive]}
              onPress={toggleMic}
              disabled={loading || transcribing}
            >
              {transcribing ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <Ionicons
                  name={recording ? 'stop' : 'mic'}
                  size={18}
                  color={recording ? colors.brandText : colors.text}
                />
              )}
            </TouchableOpacity>
          )}
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

  micBtn: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1, borderColor: colors.border,
  },
  micBtnActive: { backgroundColor: colors.expense, borderColor: colors.expense },

  voiceBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  voiceBtnActive: { backgroundColor: colors.brand, borderColor: colors.brand },

  // Gráfico no chat
  chartCard: {
    marginTop: 10,
    backgroundColor: colors.bg,
    borderRadius: 12,
    borderWidth: 1, borderColor: colors.border,
    padding: 12,
  },
  chartHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  chartTitle: { color: colors.text, fontSize: 13, fontWeight: '700', flex: 1 },
  chartRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chartLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600', flex: 1, paddingRight: 8 },
  chartValue: { color: colors.text, fontSize: 12, fontWeight: '700' },
  chartTrack: {
    height: 7, borderRadius: 4,
    backgroundColor: colors.surfaceAlt, overflow: 'hidden',
  },
  chartFill: { height: '100%', borderRadius: 4, backgroundColor: colors.text },
  chartPct: { color: colors.textFaint, fontSize: 10, fontWeight: '600', alignSelf: 'flex-end' },
});
