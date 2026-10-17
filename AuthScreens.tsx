import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ErrorPanel, SBLogo } from './ErrorPanel';

export function SignInScreen({ onNeedsRegister, onForgot }: { onNeedsRegister: () => void; onForgot: () => void }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await signIn(email, password); } catch (err) { setError(err instanceof Error ? err.message : 'Sign-in failed.'); } finally { setBusy(false); }
  };

  return (
    <AuthShell title="Sign in" subtitle="Access your trading signals dashboard">
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="rounded-lg bg-red-950/50 border border-red-900/50 px-4 py-3 text-sm text-red-300">{error}</div>}
        <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" required />
        <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" required />
        <button type="submit" disabled={busy} className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold transition-colors">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <div className="flex justify-between text-sm">
          <button type="button" onClick={onForgot} className="text-green-400 hover:text-green-300">Forgot password?</button>
          <button type="button" onClick={onNeedsRegister} className="text-green-400 hover:text-green-300">Create account</button>
        </div>
      </form>
    </AuthShell>
  );
}

export function RegisterScreen({ onBackToSignIn }: { onBackToSignIn: () => void }) {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setBusy(true); setError(null);
    try { await signUp(email, password); } catch (err) { setError(err instanceof Error ? err.message : 'Registration failed.'); } finally { setBusy(false); }
  };

  return (
    <AuthShell title="Create account" subtitle="Free account — your watchlist, journal and settings sync across devices">
      <div className="rounded-lg bg-blue-950/40 border border-blue-900/40 px-4 py-3 text-sm text-blue-200 mb-4">
        <p className="font-semibold mb-1">Why verify your email?</p>
        <p className="text-blue-300/90">Verification confirms you own the address, lets you recover your password, and protects your saved watchlist, journal and settings from unauthorized access.</p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="rounded-lg bg-red-950/50 border border-red-900/50 px-4 py-3 text-sm text-red-300">{error}</div>}
        <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" required />
        <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="At least 6 characters" required />
        <Field label="Confirm password" type="password" value={confirm} onChange={setConfirm} placeholder="Repeat password" required />
        <button type="submit" disabled={busy} className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold transition-colors">
          {busy ? 'Creating account…' : 'Create account'}
        </button>
        <button type="button" onClick={onBackToSignIn} className="w-full text-sm text-green-400 hover:text-green-300">
          Already have an account? Sign in
        </button>
      </form>
    </AuthShell>
  );
}

export function ForgotPasswordScreen({ onBack }: { onBack: () => void }) {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await resetPassword(email); setDone(true); } catch (err) { setError(err instanceof Error ? err.message : 'Failed to send reset email.'); } finally { setBusy(false); }
  };

  return (
    <AuthShell title="Reset password" subtitle="We will email you a reset link">
      {done ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-green-400 bg-green-950/40 border border-green-900/40 rounded-lg px-4 py-3">Reset email sent. Check your inbox (and spam folder).</p>
          <button onClick={onBack} className="text-sm text-green-400 hover:text-green-300">Back to sign in</button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="rounded-lg bg-red-950/50 border border-red-900/50 px-4 py-3 text-sm text-red-300">{error}</div>}
          <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" required />
          <button type="submit" disabled={busy} className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold transition-colors">
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
          <button type="button" onClick={onBack} className="w-full text-sm text-green-400 hover:text-green-300">Back to sign in</button>
        </form>
      )}
    </AuthShell>
  );
}

export function VerifyEmailScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const { email, resendVerification, refreshStatus, updateEmail, notice, error, clearMessages } = useAuth();
  const [busy, setBusy] = useState<'resend' | 'refresh' | null>(null);
  const [showChange, setShowChange] = useState(false);
  const [newEmail, setNewEmail] = useState(email);
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);

  const run = async (kind: 'resend' | 'refresh') => {
    setBusy(kind); setLocalError(null); clearMessages();
    try {
      if (kind === 'resend') await resendVerification(); else await refreshStatus();
      if (kind === 'refresh') onSignedIn();
    } catch (err) { setLocalError(err instanceof Error ? err.message : 'Action failed.'); } finally { setBusy(null); }
  };

  const submitChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    try { await updateEmail(newEmail, password); setShowChange(false); setChanged(true); } catch (err) { setLocalError(err instanceof Error ? err.message : 'Failed to change email.'); }
  };

  return (
    <AuthShell title="Check your email" subtitle="One quick step before you can use the app">
      <div className="space-y-5">
        <div className="rounded-xl bg-neutral-800/60 border border-neutral-700/60 px-5 py-4 text-center">
          <p className="text-xs uppercase tracking-wider text-neutral-400 mb-1">We sent a verification link to</p>
          <p className="text-lg font-semibold text-white break-all">{email}</p>
          <p className="text-sm text-neutral-400 mt-2">Open the link in your email to confirm your account. Check your spam folder if you can't find it.</p>
        </div>

        {(error || localError) && <div className="rounded-lg bg-red-950/50 border border-red-900/50 px-4 py-3 text-sm text-red-300">{localError ?? error}</div>}
        {notice && <div className="rounded-lg bg-green-950/40 border border-green-900/40 px-4 py-3 text-sm text-green-300">{notice}</div>}
        {changed && !notice && <div className="rounded-lg bg-sky-950/40 border border-sky-900/40 px-4 py-3 text-sm text-sky-300">Confirmation email sent to your new address. Confirm it there, then tap “I Have Verified”.</div>}

        <div className="space-y-3">
          <button onClick={() => run('refresh')} disabled={busy !== null} className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold transition-colors">
            {busy === 'refresh' ? 'Checking…' : 'I Have Verified'}
          </button>
          <button onClick={() => run('resend')} disabled={busy !== null} className="w-full py-3 rounded-xl border border-neutral-700 hover:bg-neutral-800 disabled:opacity-50 text-neutral-200 font-semibold transition-colors">
            {busy === 'resend' ? 'Sending…' : 'Resend Email'}
          </button>
          <button onClick={() => { setShowChange((s) => !s); clearMessages(); }} className="w-full text-sm text-green-400 hover:text-green-300">
            {showChange ? 'Cancel email change' : 'Wrong email? Change it'}
          </button>
        </div>

        {showChange && (
          <form onSubmit={submitChange} className="space-y-3 rounded-xl border border-neutral-700/60 p-4">
            <Field label="New email" type="email" value={newEmail} onChange={setNewEmail} required />
            <Field label="Current password" type="password" value={password} onChange={setPassword} required />
            <button type="submit" className="w-full py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-white text-sm font-semibold transition-colors">Update email</button>
          </form>
        )}
      </div>
    </AuthShell>
  );
}

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#060b14] flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center mb-8">
          <SBLogo size={44} />
        </div>
        <div className="rounded-2xl bg-[#0b1220] border border-neutral-800 p-6">
          <h1 className="text-xl font-bold text-white mb-1">{title}</h1>
          <p className="text-sm text-neutral-400 mb-6">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

export function Field({ label, type, value, onChange, placeholder, required }: {
  label: string; type: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-1.5">{label}</span>
      <input
        type={type} value={value} required={required} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl bg-neutral-800/80 border border-neutral-700 px-3.5 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent"
      />
    </label>
  );
}

export function AuthErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <ErrorPanel title="Authentication error" message={message} onRetry={onRetry} />;
}
