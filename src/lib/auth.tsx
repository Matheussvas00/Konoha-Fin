import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { generateDueRecurring } from './transactions';

type AuthContextType = {
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Proteção: o loading nunca trava por mais de 5s
    const safety = setTimeout(() => setLoading(false), 5000);

    // pega a sessão salva ao abrir o app
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      clearTimeout(safety);
    }).catch(() => {
      setLoading(false);
      clearTimeout(safety);
    });

    // escuta login/logout em tempo real
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => {
      clearTimeout(safety);
      listener.subscription.unsubscribe();
    };
  }, []);

  // Ao entrar/abrir o app com sessão válida, materializa as ocorrências de
  // lançamentos recorrentes que já venceram. Fire-and-forget: nunca bloqueia a UI.
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    generateDueRecurring().catch(() => {});
  }, [session?.user?.id]);

  async function signOut() {
    await supabase.auth.signOut();
    // onAuthStateChange vai setar session = null automaticamente
  }

  return (
    <AuthContext.Provider value={{ session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
