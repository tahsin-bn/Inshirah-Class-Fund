import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import type { Profile, Role } from './types';

interface AuthState {
  session: Session | null;
  ready: boolean;
  profile: Profile | null;
  profileLoading: boolean;
  role: Role;
  can: (...roles: Role[]) => boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) qc.clear();
    });
    return () => sub.subscription.unsubscribe();
  }, [qc]);

  // The role always comes from the database, never from the browser.
  const uid = session?.user.id;
  const { data: profile, isLoading } = useQuery({
    queryKey: ['me', uid],
    enabled: !!uid,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', uid!).single();
      if (error) throw error;
      return data as Profile;
    },
  });

  const role: Role = profile && profile.is_active ? profile.role : 'pending';

  const value: AuthState = {
    session,
    ready,
    profile: profile ?? null,
    profileLoading: !!uid && isLoading,
    role,
    can: (...roles) => roles.includes(role),
    signOut: async () => {
      await supabase.auth.signOut();
      qc.clear();
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be inside AuthProvider');
  return v;
}
