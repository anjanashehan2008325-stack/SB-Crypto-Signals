
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';

import { supabase } from './supabase';

export type AuthStatus =
  | 'loading'
  | 'signedOut'
  | 'needsVerification'
  | 'signedIn';

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

  if (/invalid login credentials/i.test(msg))
    return 'Incorrect email or password.';

  if (/user already registered/i.test(msg))
    return 'An account with this email already exists. Try signing in.';

  if (/email not confirmed/i.test(msg))
    return 'Please verify your email address before signing in.';

  if (/password should be at least/i.test(msg))
    return 'Password must be at least 6 characters.';

  if (/rate limit/i.test(msg))
    return 'Too many attempts. Please wait a minute and try again.';

  if (/valid email/i.test(msg))
    return 'Please enter a valid email address.';

  if (/same as the old/i.test(msg))
    return 'The new email matches your current email.';

  return msg || 'Something went wrong. Please try again.';
}

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [status, setStatus] = useState<AuthStatus>('loading');

  const [session, setSession] =
    useState<import('@supabase/supabase-js').Session | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const computeStatus = (
    currentSession: import('@supabase/supabase-js').Session | null,
  ): AuthStatus => {
    if (!currentSession) return 'signedOut';

    const user = currentSession.user;

    if (user && !user.email_confirmed_at && !user.confirmed_at) {
      return 'needsVerification';
    }

    return 'signedIn';
  };

  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;

        setSession(data.session);
        setStatus(computeStatus(data.session));
      })
      .catch(() => {
        if (mounted) setStatus('signedOut');
      });

    const { data: subscription } =
      supabase.auth.onAuthStateChange((_event, currentSession) => {
        if (!mounted) return;

        setSession(currentSession);
        setStatus(computeStatus(currentSession));
        setError(null);
      });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(
    async (email: string, password: string) => {
      setError(null);
      setNotice(null);

      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) {
        throw new Error(friendlyAuthError(authError));
      }

      if (data.session) {
        setSession(data.session);
        setStatus(computeStatus(data.session));
      } else {
        setNotice(
          `Verification email sent to ${email}. Check your inbox and spam folder.`,
        );
        setStatus('needsVerification');
      }
    },
    [],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      setError(null);
      setNotice(null);

      const { data, error: authError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (authError) {
        throw new Error(friendlyAuthError(authError));
      }

      setSession(data.session);
      setStatus(computeStatus(data.session));
    },
    [],
  );

  const signOut = useCallback(async () => {
    const { error: authError } = await supabase.auth.signOut();

    if (authError) {
      throw new Error(friendlyAuthError(authError));
    }

    setSession(null);
    setStatus('signedOut');
    setError(null);
    setNotice(null);
  }, []);

  const resendVerification = useCallback(async () => {
    setError(null);
    setNotice(null);

    const email = session?.user?.email;

    if (!email) {
      throw new Error('No email found for this account.');
    }

    const { error: authError } = await supabase.auth.resend({
      type: 'signup',
      email,
    });

    if (authError) {
      throw new Error(friendlyAuthError(authError));
    }

    setNotice(
      `Verification email re-sent to ${email}. It may take a minute to arrive.`,
    );
  }, [session]);

  const refreshStatus = useCallback(async () => {
    setError(null);
    setNotice(null);

    const { data, error: userError } = await supabase.auth.getUser();

    if (userError) {
      throw new Error(friendlyAuthError(userError));
    }

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();

    if (sessionError) {
      throw new Error(friendlyAuthError(sessionError));
    }

    setSession(sessionData.session);
    setStatus(computeStatus(sessionData.session));

    if (data.user?.email_confirmed_at) {
      setNotice('Email verified successfully!');
    }
  }, []);

  const updateEmail = useCallback(
    async (newEmail: string, password: string) => {
      setError(null);
      setNotice(null);

      const user = session?.user;

      if (!user?.email) {
        throw new Error('You must be signed in to change your email.');
      }

      const { error: passwordError } =
        await supabase.auth.signInWithPassword({
          email: user.email,
          password,
        });

      if (passwordError) {
        throw new Error('Password is incorrect.');
      }

      const { error: updateError } = await supabase.auth.updateUser({
        email: newEmail,
      });

      if (updateError) {
        throw new Error(friendlyAuthError(updateError));
      }

      setNotice(
        `Confirmation emails sent to ${newEmail}. Confirm from the required email address to finish the change.`,
      );
    },
    [session],
  );

  const resetPassword = useCallback(async (email: string) => {
    setError(null);
    setNotice(null);

    const { error: authError } =
      await supabase.auth.resetPasswordForEmail(email);

    if (authError) {
      throw new Error(friendlyAuthError(authError));
    }

    setNotice(`Password reset email sent to ${email}.`);
  }, []);

  const changePassword = useCallback(async (newPassword: string) => {
    setError(null);
    setNotice(null);

    const { error: authError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (authError) {
      throw new Error(friendlyAuthError(authError));
    }

    setNotice('Password updated successfully.');
  }, []);

  const clearMessages = useCallback(() => {
    setError(null);
    setNotice(null);
  }, []);

  const value: AuthContextValue = {
    status,
    session,
    email: session?.user?.email ?? '',
    error,
    notice,
    signUp,
    signIn,
    signOut,
    resendVerification,
    refreshStatus,
    updateEmail,
    resetPassword,
    changePassword,
    clearMessages,
    setError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
