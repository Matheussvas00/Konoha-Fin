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

export default function PerfilScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');

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
    } catch (e: any) {
      setError(e.message ?? 'Erro ao carregar perfil.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const dirty =
    fullName.trim() !== (profile?.full_name ?? '') ||
    username.trim() !== (profile?.username ?? '');

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
      setSuccess('Perfil atualizado com sucesso!');
    } catch (e: any) {
      setError(e.message ?? 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  function confirmSignOut() {
    Alert.alert('Sair', 'Deseja realmente sair da sua conta?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => signOut() },
    ]);
  }

  const initial = (fullName.trim() || 'N').charAt(0).toUpperCase();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Meu perfil</Text>
        <View style={styles.iconBtn} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#e63946" />
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
              <Ionicons name="alert-circle-outline" size={16} color="#fca5a5" />
              <Text style={styles.msgTxt}>{error}</Text>
            </View>
          )}
          {!!success && (
            <View style={[styles.msgBox, styles.msgSuccess]}>
              <Ionicons name="checkmark-circle-outline" size={16} color="#86efac" />
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
              placeholderTextColor="#4a4a6a"
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
              placeholderTextColor="#4a4a6a"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.hint}>Use este nome para entrar no app.</Text>
          </View>

          {/* Salvar */}
          <TouchableOpacity
            style={[styles.saveBtn, (!dirty || saving) && { opacity: 0.5 }]}
            onPress={handleSave}
            disabled={!dirty || saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveTxt}>Salvar alterações</Text>}
          </TouchableOpacity>

          {/* Sair */}
          <TouchableOpacity style={styles.signOutBtn} onPress={confirmSignOut} activeOpacity={0.85}>
            <Ionicons name="log-out-outline" size={18} color="#fca5a5" />
            <Text style={styles.signOutTxt}>Sair da conta</Text>
          </TouchableOpacity>

          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f0f1e' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  iconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },

  scroll: { paddingHorizontal: 24, paddingTop: 8 },

  avatarWrap: { alignItems: 'center', marginBottom: 28 },
  avatar: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: '#e63946',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  avatarTxt: { color: '#fff', fontSize: 38, fontWeight: '800' },
  handle: { color: '#888', fontSize: 14, fontWeight: '600' },

  msgBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)',
    borderRadius: 10, padding: 12, marginBottom: 16,
  },
  msgTxt: { color: '#fca5a5', fontSize: 13, flex: 1, lineHeight: 18 },
  msgSuccess: { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.35)' },
  msgSuccessTxt: { color: '#86efac' },

  field: { marginBottom: 16 },
  fieldLabel: {
    color: '#888', fontSize: 12, fontWeight: '700',
    letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6,
  },
  input: {
    backgroundColor: '#1a1a2e',
    borderWidth: 1, borderColor: '#2a2a4e',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    color: '#fff', fontSize: 15,
  },
  hint: { color: '#555', fontSize: 12, marginTop: 6 },

  saveBtn: {
    backgroundColor: '#e63946', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  saveTxt: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },

  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#1a1a2e',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)',
    borderRadius: 14, paddingVertical: 15, marginTop: 14,
  },
  signOutTxt: { color: '#fca5a5', fontSize: 15, fontWeight: '700' },
});
