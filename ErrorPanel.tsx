import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode; label?: string }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 p-6 text-center">
          <SBLogo size={44} />
          <h2 className="text-lg font-semibold text-red-400">Something went wrong</h2>
          <p className="text-sm text-neutral-400 max-w-md">{this.state.error.message || 'An unexpected error occurred. Please try again.'}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold transition-colors"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function SBLogo({ size = 36, withName = true }: { size?: number; withName?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="rounded-xl bg-gradient-to-br from-green-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-green-950/50 shrink-0"
        style={{ width: size, height: size }}
      >
        <span className="text-white font-extrabold tracking-tight" style={{ fontSize: size * 0.42 }}>SB</span>
      </div>
      {withName && (
        <span className="text-lg font-bold text-white tracking-tight">
          SB <span className="text-green-400">Crypto Signals</span>
        </span>
      )}
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <SBLogo size={44} withName={false} />
      <div className="w-7 h-7 border-2 border-neutral-800 border-t-green-500 rounded-full animate-spin" />
      <p className="text-sm text-neutral-400">{label}</p>
    </div>
  );
}

export function ErrorPanel({ message, onRetry, title = 'Could not load data' }: { message: string; onRetry?: () => void; title?: string }) {
  return (
    <div className="rounded-2xl border border-red-900/50 bg-red-950/30 p-5 text-center">
      <p className="text-sm font-semibold text-red-400 mb-1">{title}</p>
      <p className="text-sm text-neutral-300 mb-4">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="px-5 py-2.5 rounded-xl bg-red-900/60 hover:bg-red-800/70 text-red-200 text-sm font-semibold transition-colors">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center gap-2">
      <div className="text-4xl mb-1">{icon}</div>
      <h3 className="text-base font-semibold text-neutral-200">{title}</h3>
      <p className="text-sm text-neutral-400 max-w-sm">{body}</p>
    </div>
  );
}

export function Tip({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs text-neutral-500 leading-relaxed">{children}</p>
  );
}
