import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import {
  validateUsername,
  getEmailByUsername,
  looksLikeEmail,
} from "../../lib/profile";
import { colors, radius, spacing, font, alpha } from "../../lib/theme";

// URL de callback após confirmação de e-mail
const EMAIL_REDIRECT =
  Platform.OS === "web"
    ? "http://localhost:8081/callback"
    : "konohafin://callback";

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default function LoginScreen() {
  const [isSignUp, setIsSignUp] = useState(false);

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function clearForm() {
    setName("");
    setUsername("");
    setEmail("");
    setIdentifier("");
    setPassword("");
    setConfirm("");
    setError("");
    setSuccess("");
  }

  function toggleMode() {
    setIsSignUp((v) => !v);
    clearForm();
  }

  async function handleSubmit() {
    setError("");
    setSuccess("");

    if (isSignUp) {
      if (!name.trim()) {
        setError("Digite seu nome completo.");
        return;
      }
      const uErr = validateUsername(username);
      if (uErr) {
        setError(uErr);
        return;
      }
      if (!validateEmail(email)) {
        setError("E-mail inválido.");
        return;
      }
      if (password.length < 6) {
        setError("A senha deve ter no mínimo 6 caracteres.");
        return;
      }
      if (password !== confirm) {
        setError("As senhas não conferem.");
        return;
      }
    } else {
      if (!identifier.trim()) {
        setError("Digite seu usuário ou e-mail.");
        return;
      }
      if (!password) {
        setError("Digite sua senha.");
        return;
      }
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

        if (data.user) {
          const { error: profErr } = await supabase
            .from("profiles")
            .update({ full_name: name.trim(), username: username.trim() })
            .eq("id", data.user.id);
          if (
            profErr &&
            (profErr.code === "23505" ||
              /duplicate|unique/i.test(profErr.message))
          ) {
            throw new Error("Este nome de usuário já está em uso.");
          }
        }
        setSuccess(
          "Conta criada! Verifique seu e-mail se a confirmação estiver ativa.",
        );
      } else {
        let loginEmail = identifier.trim();
        if (!looksLikeEmail(loginEmail)) {
          const resolved = await getEmailByUsername(loginEmail);
          if (!resolved) {
            throw new Error("Usuário não encontrado.");
          }
          loginEmail = resolved;
        }

        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: loginEmail,
          password,
        });
        if (signInErr) throw signInErr;
      }
    } catch (e: any) {
      const msg: Record<string, string> = {
        "Invalid login credentials": "Usuário/e-mail ou senha incorretos.",
        "Email not confirmed": "Confirme seu e-mail antes de entrar.",
        "User already registered": "Este e-mail já está cadastrado.",
      };
      setError(msg[e.message] ?? e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {/* Logo — lockup monocromático Konoha */}
        <View style={styles.logoWrap}>
          <View style={styles.logoMark}>
            <Text style={styles.logoMarkTxt}>K</Text>
          </View>
          <Text style={styles.logoTitle}>KONOHA FIN</Text>
          <Text style={styles.logoSub}>Sua carteira pessoal inteligente</Text>
        </View>

        {/* Toggle login / cadastro */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, !isSignUp && styles.toggleActive]}
            onPress={() => {
              if (isSignUp) toggleMode();
            }}>
            <Text
              style={[styles.toggleTxt, !isSignUp && styles.toggleTxtActive]}>
              Entrar
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, isSignUp && styles.toggleActive]}
            onPress={() => {
              if (!isSignUp) toggleMode();
            }}>
            <Text
              style={[styles.toggleTxt, isSignUp && styles.toggleTxtActive]}>
              Criar conta
            </Text>
          </TouchableOpacity>
        </View>

        {!!error && (
          <View style={styles.msgBox}>
            <Ionicons
              name="alert-circle-outline"
              size={16}
              color={colors.dangerText}
            />
            <Text style={styles.msgTxt}>{error}</Text>
          </View>
        )}

        {!!success && (
          <View style={[styles.msgBox, styles.msgSuccess]}>
            <Ionicons
              name="checkmark-circle-outline"
              size={16}
              color={colors.successText}
            />
            <Text style={[styles.msgTxt, styles.msgSuccessTxt]}>{success}</Text>
          </View>
        )}

        {isSignUp ? (
          <>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Nome completo</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Como quer ser chamado?"
                placeholderTextColor={colors.placeholder}
                autoCapitalize="words"
                returnKeyType="next"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Nome de usuário</Text>
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={(t) =>
                  setUsername(t.replace(/\s/g, "").toLowerCase())
                }
                placeholder="ex: joao.silva"
                placeholderTextColor={colors.placeholder}
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
                placeholderTextColor={colors.placeholder}
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
              placeholderTextColor={colors.placeholder}
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
              placeholderTextColor={colors.placeholder}
              secureTextEntry={!showPass}
              autoComplete={isSignUp ? "new-password" : "current-password"}
              returnKeyType={isSignUp ? "next" : "done"}
              onSubmitEditing={isSignUp ? undefined : handleSubmit}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPass((v) => !v)}>
              <Ionicons
                name={showPass ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={colors.textMuted}
              />
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
                placeholderTextColor={colors.placeholder}
                secureTextEntry={!showConfirm}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowConfirm((v) => !v)}>
                <Ionicons
                  name={showConfirm ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={colors.textMuted}
                />
              </TouchableOpacity>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[styles.submitBtn, loading && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.85}>
          {loading ? (
            <ActivityIndicator color={colors.brandText} />
          ) : (
            <Text style={styles.submitTxt}>
              {isSignUp ? "Criar conta" : "Entrar"}
            </Text>
          )}
        </TouchableOpacity>

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xxl,
    paddingVertical: 40,
  },

  // Logo
  logoWrap: {
    alignItems: "center",
    marginBottom: 36,
  },
  logoMark: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  logoMarkTxt: {
    color: colors.brandText,
    fontSize: 40,
    fontWeight: font.weight.extrabold,
    letterSpacing: -1,
  },
  logoTitle: {
    color: colors.text,
    fontSize: font.size.xxl,
    fontWeight: font.weight.extrabold,
    letterSpacing: 3,
  },
  logoSub: {
    color: colors.textFaint,
    fontSize: font.size.sm,
    marginTop: spacing.xs,
  },

  // Toggle
  toggleRow: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xxl,
    padding: spacing.xs,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.sm,
    alignItems: "center",
  },
  toggleActive: {
    backgroundColor: colors.brand,
  },
  toggleTxt: {
    color: colors.textMuted,
    fontWeight: font.weight.semibold,
    fontSize: font.size.md,
  },
  toggleTxtActive: {
    color: colors.brandText,
  },

  // Mensagens
  msgBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  msgTxt: {
    color: colors.dangerText,
    fontSize: font.size.sm,
    flex: 1,
    lineHeight: 18,
  },
  msgSuccess: {
    backgroundColor: colors.successBg,
    borderColor: colors.successBorder,
  },
  msgSuccessTxt: {
    color: colors.successText,
  },

  // Campos
  field: {
    marginBottom: spacing.md,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    fontWeight: font.weight.bold,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: spacing.xs,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
    color: colors.text,
    fontSize: font.size.md,
  },
  inputFlex: {
    flex: 1,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  eyeBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderLeftWidth: 0,
    borderColor: colors.border,
    borderTopRightRadius: radius.md,
    borderBottomRightRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
  },

  // Botão primário — branco com texto preto (estilo Konoha Tech)
  submitBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  submitTxt: {
    color: colors.brandText,
    fontSize: font.size.lg,
    fontWeight: font.weight.bold,
    letterSpacing: 0.3,
  },
});
