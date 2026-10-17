import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';

export type AuthStatus = 'loading' | 'signedOut' | 'needsVerification' | 'signedIn';

interface AuthContextValue {
  status: AuthStatus;
  session: import('@supabase/supabase-js').Session | null;
  email: string;
  error: string | null;
  notice: string | null;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resendVerification: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  updateEmail: (newEmail: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  changePassword: (newPassword: string) => Promise<void>;
  clearMessages: () => void;
  setError: (msg: string | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function friendlyAuthError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (/invalid login credentials/i.test(msg)) return 'Incorrect email or password.';
  if (/user already registered/i.test(msg)) return 'An account with this email already exists. Try signing in.';
  if (/email not confirmed/i.test(msg)) return 'Please verify your email address before signing in.';
  if (/password should be at least/i.test(msg)) return 'Password must be at least 6 characters.';
  if (/rate limit/i.test(msg)) return 'Too many attempts. Please wait a minute and try again.';
  if (/valid email/i.test(msg)) return 'Please enter a valid email address.';
  if (/same as the old/i.test(msg)) return 'The new email matches your current email.';
  return msg || 'Something went wrong. Please try again.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<import('@supabase/supabase-js').Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const computeStatus = (s: import('@supabase/supabase-js').Session | null): AuthStatus => {
    if (!s) return 'signedOut';
    if (s.user && !s.user.email_confirmed_at && !s.user.confirmed_at) return 'needsVerification';
    return 'signedIn';
  };

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session);
        setStatus(computeStatus(data.session));
      })
      .catch(() => {
        if (mounted) setStatus('signedOut');
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!mounted) return;
      setSession(s);
      setStatus(computeStatus(s));
      setError(null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    setError(null); setNotice(null);
    const { data, error: err } = await supabase.auth.signUp({ email, password });
    if (err) throw new Error(friendlyAuthError(err));
    // Email confirmation is enabled in this project: the user must verify before sign-in.
    if (data.session) {
      setSession(data.session);
      setStatus(computeStatus(data.session));
    } else {
      setNotice(`Verification email sent to ${email}. Check your inbox and spam folder.`);
      setStatus('needsVerification');
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null); setNotice(null);
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) throw new Error(friendlyAuthError(err));
    setSession(data.session);
    setStatus(computeStatus(data.session));
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setStatus('signedOut');
  }, []);

  const resendVerification = useCallback(async () => {
    setError(null); setNotice(null);
    const user = session?.user;
    const email = user?.email;
    if (!email) throw new Error('No email found for this account.');
    const { error: err } = await supabase.auth.resend({ type: 'signup', email });
    if (err) throw new Error(friendlyAuthError(err));
    setNotice(`Verification email re-sent to ${email}. It may take a minute to arrive.`);
  }, [session]);

  const refreshStatus = useCallback(async () => {
    setError(null); setNotice(null);
    const { data, error: err } = await supabase.auth.getUser();
    if (err) throw new Error(friendlyAuthError(err));
    const { data: s } = await supabase.auth.getSession();
    setSession(s.session);
    setStatus(computeStatus(s.session));
    if (data.user?.email_confirmed_at) setNotice('Email verified successfully!');
  }, []);

  const updateEmail = useCallback(async (newEmail: string, password: string) => {
    setError(null); setNotice(null);
    const user = session?.user;
    if (!user?.email) throw new Error('You must be signed in to change your email.');
    const { error: err } = await supabase.auth.signInWithPassword({ email: user.email, password });
    if (err) throw new Error('Password is incorrect.');
    const { error: err2 } = await supabase.auth.updateUser({ email: newEmail });
    if (err2) throw new Error(friendlyAuthError(err2));
    setNotice(`Confirmation emails sent to ${newEmail}. Confirm from the new address to finish the change.`);
  }, [session]);

  const resetPassword = useCallback(async (email: string) => {
    setError(null); setNotice(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email);
    if (err) throw new Error(friendlyAuthError(err));
    setNotice(`Password reset email sent to ${email}.`);
  }, []);

  const changePassword = useCallback(async (newPassword: string) => {
    setError(null); setNotice(null);
    const { error: err } = await supabase.auth.updateUser({ password: newPassword });
    if (err) throw new Error(friendlyAuthError(err));
    setNotice('Password updated successfully.');
  }, []);

  const clearMessages = useCallback(() => { setError(null); setNotice(null); }, []);

  const value: AuthContextValue = {
    status, session, email: session?.user?.email ?? '', error, notice,
    signUp, signIn, signOut, resendVerification, refreshStatus,
    updateEmail, resetPassword, changePassword, clearMessages,
    setError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
