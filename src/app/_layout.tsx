import { useEffect } from 'react';
import { Stack, useRouter, useSegments, type ErrorBoundaryProps } from 'expo-router';
import { ActivityIndicator, View, Text, ScrollView } from 'react-native';
import { AuthProvider, useAuth } from '../lib/auth';
import { supabaseConfigError } from '../lib/supabase';

// ── Diagnóstico (web): mostra erros não capturados como overlay na tela ──
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const show = (msg: string) => {
    let el = document.getElementById('__err') as HTMLPreElement | null;
    if (!el) {
      el = document.createElement('pre');
      el.id = '__err';
      el.style.cssText =
        'position:fixed;left:0;right:0;bottom:0;max-height:55%;overflow:auto;margin:0;' +
        'padding:12px;background:#1a0000;color:#ff8a8a;font-size:12px;z-index:99999;white-space:pre-wrap';
      document.body.appendChild(el);
    }
    el.textContent = (el.textContent || '') + msg + '\n\n';
  };
  window.addEventListener('error', (e: any) =>
    show('ERROR: ' + (e?.error?.stack || e?.message || String(e))),
  );
  window.addEventListener('unhandledrejection', (e: any) =>
    show('PROMISE: ' + (e?.reason?.stack || String(e?.reason))),
  );
}

// Mostra qualquer erro de renderização na tela (em vez de tela branca).
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#0c0c0d' }}
      contentContainerStyle={{ padding: 24, paddingTop: 80 }}
    >
      <Text style={{ color: '#f87171', fontSize: 18, fontWeight: '700', marginBottom: 12 }}>
        Algo deu errado ao carregar
      </Text>
      <Text selectable style={{ color: '#fff', fontSize: 13, lineHeight: 18 }}>
        {String(error?.message ?? error)}
      </Text>
      <Text onPress={retry} style={{ color: '#fff', marginTop: 20, fontWeight: '700' }}>
        Tentar de novo
      </Text>
    </ScrollView>
  );
}

function ConfigError({ message }: { message: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#0c0c0d', justifyContent: 'center', padding: 24 }}>
      <Text style={{ color: '#f87171', fontSize: 18, fontWeight: '700', marginBottom: 12 }}>
        Configuração ausente
      </Text>
      <Text selectable style={{ color: '#fff', fontSize: 13, lineHeight: 18 }}>
        {message}
      </Text>
    </View>
  );
}

function RootNavigation() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      // não logado e fora da área de login -> manda pro login
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      // logado mas ainda na tela de login -> manda pro app (home = "/")
      router.replace('/');
    }
  }, [session, loading, segments]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0c0c0d' }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  if (supabaseConfigError) {
    return <ConfigError message={supabaseConfigError} />;
  }
  return (
    <AuthProvider>
      <RootNavigation />
    </AuthProvider>
  );
}
