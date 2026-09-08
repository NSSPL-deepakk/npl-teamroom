import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Role } from '../data/roles';

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: Role;
  employee_id: string | null;
  login_enabled: boolean;
  last_active_at: string | null;
}

export const LOGGED_IN_ELSEWHERE_MESSAGE = 'You were signed out because this account was signed in on another device or browser.';
export type SignOutReason = 'manual' | 'session_expired' | 'logged_in_elsewhere';

interface AuthContextValue {
  session: Session | null;
  activeSessionId: string | null;
  profile: Profile | null;
  signOutReason: SignOutReason | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: (reason?: SignOutReason) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, role, employee_id, login_enabled, last_active_at')
    .eq('id', userId)
    .single();

  if (error || !data) return null;
  return data as Profile;
}

async function recordActivity(userId: string) {
  const { error } = await supabase
    .from('profiles')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) console.error('[Auth] Could not record user activity:', error);
}

function getAuthSessionId(accessToken: string): string | null {
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { session_id?: unknown };
    return typeof decoded.session_id === 'string' ? decoded.session_id : null;
  } catch {
    return null;
  }
}

async function claimActiveSession(session: Session): Promise<{ sessionId: string | null; error: string | null }> {
  const sessionId = crypto.randomUUID();
  const authSessionId = getAuthSessionId(session.access_token);
  if (!authSessionId) return { sessionId: null, error: 'Could not verify the Supabase authentication session.' };

  const { error } = await supabase.from('active_sessions').upsert({
    user_id: session.user.id,
    session_id: sessionId,
    auth_session_id: authSessionId,
    device_label: navigator.userAgent,
    updated_at: new Date().toISOString(),
  });
  if (error) return { sessionId: null, error: error.message };

  sessionStorage.setItem('active_session_id', sessionId);
  return { sessionId, error: null };
}

function clearClientSessionState() {
  sessionStorage.clear();
  localStorage.removeItem('roster.profile-overrides');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => sessionStorage.getItem('active_session_id'));
  const [profile, setProfile] = useState<Profile | null>(null);
  const [signOutReason, setSignOutReason] = useState<SignOutReason | null>(null);
  const [loading, setLoading] = useState(true);
  const pendingLogin = useRef(false);
  const signOutReasonRef = useRef<SignOutReason | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(data.session);
      setActiveSessionId(sessionStorage.getItem('active_session_id'));
      if (data.session) {
        if (!sessionStorage.getItem('active_session_id') && !pendingLogin.current) {
          clearClientSessionState();
          await supabase.auth.signOut();
          if (!cancelled) {
            setSession(null);
            setProfile(null);
            setActiveSessionId(null);
            setLoading(false);
          }
          return;
        }
        const p = await fetchProfile(data.session.user.id);
        if (!p) {
          clearClientSessionState();
          await supabase.auth.signOut();
          if (!cancelled) {
            setSession(null);
            setProfile(null);
            setActiveSessionId(null);
            setLoading(false);
          }
          return;
        }
        if (!cancelled) setProfile(p);
        await recordActivity(data.session.user.id);
        console.log('Logged in as:', p?.email, '— role:', p?.role);
      }
      if (!cancelled) setLoading(false);
    }

    init();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setLoading(true);
      setSession(newSession);
      if (newSession) {
        if (pendingLogin.current) return;
        const p = await fetchProfile(newSession.user.id);
        if (!p) {
          clearClientSessionState();
          await supabase.auth.signOut();
          setSession(null);
          setProfile(null);
          setActiveSessionId(null);
          setLoading(false);
          return;
        }
        setProfile(p);
        await recordActivity(newSession.user.id);
      } else {
        setProfile(null);
        setActiveSessionId(null);
        if (!signOutReasonRef.current) {
          signOutReasonRef.current = 'session_expired';
          setSignOutReason('session_expired');
        }
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string) {
    signOutReasonRef.current = null;
    setSignOutReason(null);
    pendingLogin.current = true;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      pendingLogin.current = false;
      return { error: error.message };
    }

    const claim = await claimActiveSession(data.session);
    if (claim.error) {
      pendingLogin.current = false;
      clearClientSessionState();
      await supabase.auth.signOut();
      return { error: claim.error };
    }
    setActiveSessionId(claim.sessionId);
    const profile = await fetchProfile(data.session.user.id);
    setProfile(profile);
    await recordActivity(data.session.user.id);
    pendingLogin.current = false;
    setLoading(false);

    return { error: null };
  }

  async function signOut(reason: SignOutReason = 'manual') {
    signOutReasonRef.current = reason;
    setSignOutReason(reason);
    clearClientSessionState();
    setActiveSessionId(null);
    setSession(null);
    setProfile(null);
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ session, activeSessionId, profile, signOutReason, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}