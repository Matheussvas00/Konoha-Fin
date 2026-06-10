import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  ScrollView, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import {
  validateUsername, getEmailByUsername, looksLikeEmail,
} from '../../lib/profile';

// URL de callback após confirmação de e-mail
const EMAIL_REDIRECT =
  Platform.OS === 'web'
    ? 'http://localhost:8081/callback'
    : 'konohafin://callback';

// ── Validações ────────────────────────────────────────────────────────
function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default function LoginScreen() {
  const [isSignUp, setIsSignUp] = useState(false);

  // campos
  const [name, setName]               = useState('');
  const [username, setUsername]       = useState('');
  const [email, setEmail]             = useState('');
  const [identifier, setIdentifier]   = useState(''); // login: usuário OU e-mail
  const [password, setPassword]       = useState('');
  const [confirm, setConfirm]         = useState('');
  const [showPass, setShowPass]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // estado
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');

  function clearForm() {
    setName(''); setUsername(''); setEmail(''); setIdentifier('');
    setPassword(''); setConfirm('');
    setError(''); setSuccess('');
  }

  function toggleMode() {
    setIsSignUp((v) => !v);
    clearForm();
  }

  // ── Submit ────────────────────────────────────────────────────────
  async function handleSubmit() {
    setError(''); setSuccess('');

    // ── Validações ──────────────────────────────────────────────
    if (isSignUp) {
      if (!name.trim()) { setError('Digite seu nome completo.'); return; }
      const uErr = validateUsername(username);
      if (uErr) { setError(uErr); return; }
      if (!validateEmail(email)) { setError('E-mail inválido.'); return; }
      if (password.length < 6) {
        setError('A senha deve ter no mínimo 6 caracteres.'); return;
      }
      if (password !== confirm) { setError('As senhas não conferem.'); return; }
    } else {
      if (!identifier.trim()) {
        setError('Digite seu usuário ou e-mail.'); return;
      }
      if (!password) { setError('Digite sua senha.'); return; }
    }

    setLoading(true);
    try {
      if (isSignUp) {
        const { data, error: signUpErr } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: EMAIL_REDIRECT },
        });
        if (signUpErr) throw signUpErr;

        // Atualiza nome e username no perfil (criado pelo trigger do Supabase)
        if (data.user) {
          const { error: profErr } = await supabase
            .from('profiles')
            .update({ full_name: name.trim(), username: username.trim() })
            .eq('id', data.user.id);
          if (profErr && (profErr.code === '23505' || /duplicate|unique/i.test(profErr.message))) {
            throw new Error('Este nome de usuário já está em uso.');
          }
        }
        setSuccess('Conta criada! Verifique seu e-mail se a confirmação estiver ativa.');
      } else {
        // Resolve usuário -> e-mail, se necessário
        let loginEmail = identifier.trim();
        if (!looksLikeEmail(loginEmail)) {
          const resolved = await getEmailByUsername(loginEmail);
          if (!resolved) {
            throw new Error('Usuário não encontrado.');
          }
          loginEmail = resolved;
        }

        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: loginEmail,
          password,
        });
        if (signInErr) throw signInErr;
        // guardião em _layout.tsx redireciona automaticamente
      }
    } catch (e: any) {
      // Mensagens amigáveis em pt-BR
      const msg: Record<string, string> = {
        'Invalid login credentials': 'Usuário/e-mail ou senha incorretos.',
        'Email not confirmed':       'Confirme seu e-mail antes de entrar.',
        'User already registered':   'Este e-mail já está cadastrado.',
      };
      setError(msg[e.message] ?? e.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={styles.logoWrap}>
          <View style={styles.logoCircle}>
            <Ionicons name="wallet" size={38} color="#e63946" />
          </View>
          <Text style={styles.logoTitle}>Konoha Fin</Text>
          <Text style={styles.logoSub}>Sua carteira pessoal inteligente</Text>
        </View>

        {/* Toggle login / cadastro */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, !isSignUp && styles.toggleActive]}
            onPress={() => { if (isSignUp) toggleMode(); }}
          >
            <Text style={[styles.toggleTxt, !isSignUp && styles.toggleTxtActive]}>
              Entrar
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, isSignUp && styles.toggleActive]}
            onPress={() => { if (!isSignUp) toggleMode(); }}
          >
            <Text style={[styles.toggleTxt, isSignUp && styles.toggleTxtActive]}>
              Criar conta
            </Text>
          </TouchableOpacity>
        </View>

        {/* Mensagem de erro */}
        {!!error && (
          <View style={styles.msgBox}>
            <Ionicons name="alert-circle-outline" size={16} color="#fca5a5" />
            <Text style={styles.msgTxt}>{error}</Text>
          </View>
        )}

        {/* Mensagem de sucesso */}
        {!!success && (
          <View style={[styles.msgBox, styles.msgSuccess]}>
            <Ionicons name="checkmark-circle-outline" size={16} color="#86efac" />
            <Text style={[styles.msgTxt, styles.msgSuccessTxt]}>{success}</Text>
          </View>
        )}

        {/* Campos */}
        {isSignUp ? (
          <>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Nome completo</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Como quer ser chamado?"
                placeholderTextColor="#4a4a6a"
                autoCapitalize="words"
                returnKeyType="next"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Nome de usuário</Text>
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={(t) => setUsername(t.replace(/\s/g, '').toLowerCase())}
                placeholder="ex: joao.silva"
                placeholderTextColor="#4a4a6a"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>E-mail</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="seu@email.com"
                placeholderTextColor="#4a4a6a"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                returnKeyType="next"
              />
            </View>
          </>
        ) : (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Usuário ou e-mail</Text>
            <TextInput
              style={styles.input}
              value={identifier}
              onChangeText={setIdentifier}
              placeholder="seu usuário ou seu@email.com"
              placeholderTextColor="#4a4a6a"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />
          </View>
        )}

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Senha</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, styles.inputFlex]}
              value={password}
              onChangeText={setPassword}
              placeholder="Mínimo 6 caracteres"
              placeholderTextColor="#4a4a6a"
              secureTextEntry={!showPass}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              returnKeyType={isSignUp ? 'next' : 'done'}
              onSubmitEditing={isSignUp ? undefined : handleSubmit}
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPass((v) => !v)}>
              <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color="#666" />
            </TouchableOpacity>
          </View>
        </View>

        {isSignUp && (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Confirmar senha</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, styles.inputFlex]}
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Repita a senha"
                placeholderTextColor="#4a4a6a"
                secureTextEntry={!showConfirm}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
              <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowConfirm((v) => !v)}>
                <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={20} color="#666" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Botão principal */}
        <TouchableOpacity
          style={[styles.submitBtn, loading && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.submitTxt}>{isSignUp ? 'Criar conta' : 'Entrar'}</Text>
          }
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0f0f1e',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },

  // Logo
  logoWrap: {
    alignItems: 'center',
    marginBottom: 36,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#2a2a4e',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  logoTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  logoSub: {
    color: '#555',
    fontSize: 13,
    marginTop: 4,
  },

  // Toggle
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a4e',
    marginBottom: 24,
    padding: 4,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: 'center',
  },
  toggleActive: {
    backgroundColor: '#e63946',
  },
  toggleTxt: {
    color: '#666',
    fontWeight: '600',
    fontSize: 14,
  },
  toggleTxtActive: {
    color: '#fff',
  },

  // Mensagens
  msgBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  msgTxt: {
    color: '#fca5a5',
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  msgSuccess: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderColor: 'rgba(34,197,94,0.35)',
  },
  msgSuccessTxt: {
    color: '#86efac',
  },

  // Campos
  field: {
    marginBottom: 14,
  },
  fieldLabel: {
    color: '#888',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#2a2a4e',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: '#fff',
    fontSize: 15,
  },
  inputFlex: {
    flex: 1,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  eyeBtn: {
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderLeftWidth: 0,
    borderColor: '#2a2a4e',
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },

  // Botão
  submitBtn: {
    backgroundColor: '#e63946',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitTxt: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
