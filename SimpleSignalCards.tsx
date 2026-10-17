import { Star } from 'lucide-react';

export type SimpleSignalKind = 'BUY' | 'SELL' | 'LONG' | 'SHORT' | 'WAIT' | 'NO DATA';

export interface SimpleSignalView {
  kind: SimpleSignalKind;
  headline: string;
  sub: string;
  timeframe: string;
  updatedAt: number;
  provisional: boolean;
  strength?: string;
  reason: string[];
}

export interface SimpleLevels {
  entryLabel: string;
  entry: string;
  stop: string | null;
  targets: string[];
}

export function formatPrice(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

const KIND_STYLE: Record<SimpleSignalKind, { bg: string; text: string; dot: string }> = {
  BUY: { bg: 'bg-green-950/60 border-green-800', text: 'text-green-400', dot: 'bg-green-400' },
  LONG: { bg: 'bg-green-950/60 border-green-800', text: 'text-green-400', dot: 'bg-green-400' },
  SELL: { bg: 'bg-red-950/60 border-red-800', text: 'text-red-400', dot: 'bg-red-400' },
  SHORT: { bg: 'bg-red-950/60 border-red-800', text: 'text-red-400', dot: 'bg-red-400' },
  WAIT: { bg: 'bg-neutral-800/60 border-neutral-700', text: 'text-neutral-300', dot: 'bg-neutral-400' },
  'NO DATA': { bg: 'bg-neutral-800/60 border-neutral-700', text: 'text-neutral-300', dot: 'bg-neutral-400' },
};

export function CurrentSignalCard({ view, levels, onToggleFav, fav }: {
  view: SimpleSignalView;
  levels: SimpleLevels | null;
  onToggleFav?: () => void;
  fav?: boolean;
}) {
  const s = KIND_STYLE[view.kind];
  const isAction = view.kind === 'BUY' || view.kind === 'SELL' || view.kind === 'LONG' || view.kind === 'SHORT';
  return (
    <div className={`rounded-2xl border ${isAction ? s.bg : 'bg-[#0b1220] border-neutral-800'} p-5`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-400">Current Signal</h2>
        {onToggleFav && (
          <button onClick={onToggleFav} className={`p-1.5 rounded-lg transition-colors ${fav ? 'text-green-400' : 'text-neutral-500 hover:text-neutral-300'}`} aria-label="Save coin">
            <Star size={18} fill={fav ? 'currentColor' : 'none'} />
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 mb-2">
        <span className={`text-4xl font-extrabold tracking-tight ${s.text}`}>{view.kind}</span>
        {view.provisional && (
          <span className="px-2 py-1 rounded-lg bg-amber-950/60 text-amber-400 text-xs font-bold border border-amber-900">STILL FORMING</span>
        )}
      </div>
      <p className="text-sm text-neutral-300 mb-1">{view.headline}</p>
      <p className="text-xs text-neutral-500 mb-4">{view.sub}</p>

      {levels && isAction && (
        <div className="rounded-xl bg-black/30 border border-white/5 p-4 space-y-2.5">
          <Level label="Entry Price" hint="Where you would start the trade." value={levels.entry} tone="neutral" />
          {levels.stop && <Level label="Stop Loss" hint="The price where you plan to exit to limit your loss." value={levels.stop} tone="red" />}
          {levels.targets.map((t, i) => (
            <Level key={i} label={`Target ${i + 1}`} hint="The price where you plan to take your profit." value={t} tone="green" />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mt-4 text-xs text-neutral-500">
        <span>Timeframe: {view.timeframe.toUpperCase()}</span>
        <span>Updated {new Date(view.updatedAt).toLocaleTimeString()}</span>
      </div>

      <div className="mt-4 rounded-xl bg-black/20 border border-white/5 px-4 py-3">
        <p className="text-xs font-semibold text-neutral-300 mb-1.5">Why this signal</p>
        <ul className="space-y-1">
          {view.reason.map((r, i) => (
            <li key={i} className="text-xs text-neutral-400 flex gap-2">
              <span className={s.text}>•</span>{r}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Level({ label, hint, value, tone }: { label: string; hint: string; value: string; tone: 'green' | 'red' | 'neutral' }) {
  const color = tone === 'green' ? 'text-green-400' : tone === 'red' ? 'text-red-400' : 'text-white';
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-neutral-200">{label}</p>
        <p className="text-[10px] text-neutral-500 leading-tight">{hint}</p>
      </div>
      <span className={`text-base font-bold tabular-nums shrink-0 ${color}`}>{value}</span>
    </div>
  );
}

export interface NextSignalView {
  status: 'WAITING' | 'FORMING' | 'NEEDS CONFIRMATION' | 'READY' | 'INVALID';
  direction: 'up' | 'down';
  waitingFor: string[];
  levels: SimpleLevels | null;
  timeframe: string;
}

const NEXT_STATUS_STYLE: Record<NextSignalView['status'], { cls: string; explain: string }> = {
  WAITING: { cls: 'bg-neutral-800 text-neutral-300 border-neutral-700', explain: 'Nothing is forming yet. The market is quiet.' },
  FORMING: { cls: 'bg-sky-950 text-sky-400 border-sky-900', explain: 'An idea is starting to build, but it is too early.' },
  'NEEDS CONFIRMATION': { cls: 'bg-amber-950 text-amber-400 border-amber-900', explain: 'Almost there — one or more conditions must still happen.' },
  READY: { cls: 'bg-green-950 text-green-400 border-green-900', explain: 'All conditions are met. Check the Current Signal card above.' },
  INVALID: { cls: 'bg-red-950 text-red-400 border-red-900', explain: 'The setup failed. A new one must form first.' },
};

export function NextSignalCard({ view }: { view: NextSignalView }) {
  const st = NEXT_STATUS_STYLE[view.status];
  return (
    <div className="rounded-2xl bg-[#0b1220] border border-neutral-800 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-400">Next Signal — What To Wait For</h2>
        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${st.cls}`}>{view.status}</span>
      </div>
      <p className="text-xs text-neutral-500 mb-3">{st.explain}</p>

      <p className="text-sm text-neutral-300 mb-2">
        Possible {view.direction === 'up' ? 'upward' : 'downward'} move.
      </p>

      {view.waitingFor.length > 0 ? (
        <ul className="space-y-1.5 mb-4">
          {view.waitingFor.map((w, i) => (
            <li key={i} className="text-xs text-neutral-400 flex gap-2">
              <span className="text-amber-400">•</span>{w}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-green-400 mb-4">All conditions are currently met.</p>
      )}

      {view.levels ? (
        <div className="rounded-xl bg-black/30 border border-white/5 p-4 space-y-2.5">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Possible future levels — not guaranteed</p>
          <Level label="Entry Price" hint="If the setup completes, this is where it might start." value={view.levels.entry} tone="neutral" />
          {view.levels.stop && <Level label="Stop Loss" hint="Where you would plan to exit if it fails." value={view.levels.stop} tone="red" />}
          {view.levels.targets.map((t, i) => (
            <Level key={i} label={`Target ${i + 1}`} hint="A possible profit-taking price." value={t} tone="green" />
          ))}
        </div>
      ) : (
        <p className="text-xs text-neutral-500">Not enough information yet to suggest any prices.</p>
      )}

      <p className="text-[10px] text-neutral-600 mt-3">Timeframe: {view.timeframe.toUpperCase()} · This is a possible future setup, not a guaranteed prediction.</p>
    </div>
  );
}
