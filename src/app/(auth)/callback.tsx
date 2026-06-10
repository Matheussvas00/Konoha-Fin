import { useEffect } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';

/**
 * Rota web: /callback
 * Supabase redireciona aqui após confirmação de e-mail.
 * O cliente detecta o token no hash da URL (detectSessionInUrl: true no web)
 * e dispara onAuthStateChange → _layout.tsx redireciona para o dashboard.
 */
export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    // Tenta pegar a sessão que o Supabase já processou do hash da URL
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace('/');
      }
    });

    // Fallback: escuta o evento caso getSession seja chamado antes do processamento
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        router.replace('/');
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f0f1e', gap: 16 }}>
      <ActivityIndicator size="large" color="#e63946" />
      <Text style={{ color: '#888', fontSize: 14 }}>Confirmando sua conta…</Text>
    </View>
  );
}
