import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, StatusBar, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import {
  Profile, getMyProfile, updateMyProfile, validateUsername,
} from '../../lib/profile';
import { getAgentName, setAgentName as saveAgentName } from '../../lib/agent';
import { confirmAction } from '../../lib/confirm';
import { colors, spacing, radius, font, alpha } from '../../lib/theme';

export default function PerfilScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [agentName, setAgentName] = useState('');
  const [loadedAgent, setLoadedAgent] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const p = await getMyProfile();
      setProfile(p);
      setFullName(p?.full_name ?? '');
      setUsername(p?.username ?? '');
      const an = await getAgentName();
      setAgentName(an);
      setLoadedAgent(an);
    } catch (e: any) {
      setError(e.message ?? 'Erro ao carregar perfil.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const dirty =
    fullName.trim() !== (profile?.full_name ?? '') ||
    username.trim() !== (profile?.username ?? '') ||
    agentName.trim() !== loadedAgent;

  async function handleSave() {
    setError(''); setSuccess('');

    if (!fullName.trim()) { setError('Digite seu nome completo.'); return; }
    const uErr = validateUsername(username);
    if (uErr) { setError(uErr); return; }

    setSaving(true);
    try {
      const updated = await updateMyProfile({
        full_name: fullName.trim(),
        username: username.trim(),
      });
      setProfile(updated);
      const savedAgent = await saveAgentName(agentName);
      setAgentName(savedAgent);
      setLoadedAgent(savedAgent);
      setSuccess('Perfil atualizado com sucesso!');
    } catch (e: any) {
      setError(e.message ?? 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  function confirmSignOut() {
    confirmAction({
      title: 'Sair da conta',
      message: 'Deseja realmente sair da sua conta?',
      confirmLabel: 'Sair',
      destructive: true,
      onConfirm: () => signOut(),
    });
  }

  const initial = (fullName.trim() || 'N').charAt(0).toUpperCase();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Meu perfil</Text>
        <View style={styles.iconBtn} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.text} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Avatar */}
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarTxt}>{initial}</Text>
            </View>
            {!!username && <Text style={styles.handle}>@{username}</Text>}
          </View>

          {/* Mensagens */}
          {!!error && (
            <View style={styles.msgBox}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.expenseText} />
              <Text style={styles.msgTxt}>{error}</Text>
            </View>
          )}
          {!!success && (
            <View style={[styles.msgBox, styles.msgSuccess]}>
              <Ionicons name="checkmark-circle-outline" size={16} color={colors.successText} />
              <Text style={[styles.msgTxt, styles.msgSuccessTxt]}>{success}</Text>
            </View>
          )}

          {/* Campos */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Nome completo</Text>
            <TextInput
              style={styles.input}
              value={fullName}
              onChangeText={(t) => { setFullName(t); setSuccess(''); }}
              placeholder="Seu nome"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Nome de usuário</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={(t) => { setUsername(t.replace(/\s/g, '').toLowerCase()); setSuccess(''); }}
              placeholder="ex: joao.silva"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.hint}>Use este nome para entrar no app.</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Nome do assistente (IA)</Text>
            <TextInput
              style={styles.input}
              value={agentName}
              onChangeText={(t) => { setAgentName(t); setSuccess(''); }}
              placeholder="Ex.: Konoha, Sofia, Jarvis…"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="words"
              maxLength={24}
            />
            <Text style={styles.hint}>Como o assistente de IA vai se chamar.</Text>
          </View>

          {/* Salvar */}
          <TouchableOpacity
            style={[styles.saveBtn, (!dirty || saving) && { opacity: 0.5 }]}
            onPress={handleSave}
            disabled={!dirty || saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color={colors.brandText} />
              : <Text style={styles.saveTxt}>Salvar alterações</Text>}
          </TouchableOpacity>

          {/* Sair */}
          <TouchableOpacity style={styles.signOutBtn} onPress={confirmSignOut} activeOpacity={0.85}>
            <Ionicons name="log-out-outline" size={18} color={colors.expenseText} />
            <Text style={styles.signOutTxt}>Sair da conta</Text>
          </TouchableOpacity>

          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  iconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },

  scroll: { paddingHorizontal: 24, paddingTop: 8 },

  avatarWrap: { alignItems: 'center', marginBottom: 28 },
  avatar: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  avatarTxt: { color: colors.brandText, fontSize: 38, fontWeight: '800' },
  handle: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },

  msgBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.dangerBg,
    borderWidth: 1, borderColor: colors.dangerBorder,
    borderRadius: 10, padding: 12, marginBottom: 16,
  },
  msgTxt: { color: colors.expenseText, fontSize: 13, flex: 1, lineHeight: 18 },
  msgSuccess: { backgroundColor: colors.successBg, borderColor: colors.successBorder },
  msgSuccessTxt: { color: colors.successText },

  field: { marginBottom: 16 },
  fieldLabel: {
    color: colors.textMuted, fontSize: 12, fontWeight: '700',
    letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    color: colors.text, fontSize: 15,
  },
  hint: { color: colors.textFaint, fontSize: 12, marginTop: 6 },

  saveBtn: {
    backgroundColor: colors.brand, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  saveTxt: { color: colors.brandText, fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },

  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.dangerBorder,
    borderRadius: 14, paddingVertical: 15, marginTop: 14,
  },
  signOutTxt: { color: colors.expenseText, fontSize: 15, fontWeight: '700' },
});
