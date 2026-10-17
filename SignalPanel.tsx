import type { TpLevel } from '../services/signalEngine';
import type { MarketType } from '../services/marketData';
import type { PositionPlan } from '../services/risk';
import { formatPrice } from './SimpleSignalCards';

interface Props {
  signal: {
    direction: 'LONG' | 'SHORT';
    status: 'confirmed' | 'provisional' | 'none' | 'invalidated';
    entry: number;
    stopLoss: number;
    tps: TpLevel[];
    rr: number;
    strength: 'strong' | 'moderate' | 'weak';
    checks: { name: string; passed: boolean; detail: string; weight: 'required' | 'supporting' }[];
    provisional: boolean;
    htfConfirmed: boolean;
    invalidation: string;
    createdAt: number;
  } | null;
  timeframe: string;
  marketType: MarketType;
  symbol: string;
  plan: PositionPlan | null;
}

const dirLabel = (d: 'LONG' | 'SHORT', mt: MarketType) => {
  if (mt === 'spot') return d === 'LONG' ? 'BUY' : 'SELL';
  return d;
};

export default function SignalPanel({ signal, timeframe, marketType, symbol, plan }: Props) {
  if (!signal) {
    return (
      <Section title="Current Signal" statusChip={<Chip tone="neutral">NO VALID SIGNAL</Chip>}>
        <p className="text-sm text-neutral-400">
          No valid <span className="text-neutral-200">{marketType === 'spot' ? 'BUY/SELL' : 'LONG/SHORT'}</span> setup on {symbol} {timeframe.toUpperCase()} right now.
          The engine evaluates both directions every refresh; required conditions were not all met.
        </p>
        <p className="text-xs text-neutral-500 mt-2">Conditions from the most recent evaluation are shown in the NEXT POTENTIAL panel below.</p>
      </Section>
    );
  }
  const long = signal.direction === 'LONG';
  const tone = long ? 'green' : 'red';

  return (
    <Section
      title="Current Signal"
      statusChip={
        signal.provisional
          ? <Chip tone="amber">PROVISIONAL</Chip>
          : <Chip tone={tone}>{dirLabel(signal.direction, marketType)}</Chip>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Entry" value={formatPrice(signal.entry)} />
        <Stat label="Stop Loss" value={formatPrice(signal.stopLoss)} tone="red" />
        {signal.tps.map((tp, i) => (
          <Stat key={i} label={`TP${i + 1}`} value={formatPrice(tp.price)} tone="green" sub={`R:R ${tp.rr}`} />
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
        <Stat label="Timeframe" value={timeframe.toUpperCase()} />
        <Stat label="Signal strength" value={signal.strength.toUpperCase()} />
        <Stat label="HTF trend" value={signal.htfConfirmed ? 'CONFIRMS' : 'AGAINST'} tone={signal.htfConfirmed ? 'green' : 'amber'} />
        <Stat label="Risk:Reward" value={`1 : ${signal.rr.toFixed(1)}`} />
      </div>

      {plan && (
        <div className="mt-4 rounded-xl bg-neutral-800/50 border border-neutral-700/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">Position estimate (based on your settings)</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Stat label="Quantity" value={plan.quantity.toPrecision(4)} />
            <Stat label="Notional" value={`$${plan.notional.toFixed(2)}`} />
            <Stat label="Risk amount" value={`$${plan.riskAmount.toFixed(2)} (${plan.riskPct.toFixed(2)}%)`} />
            <Stat label="Est. fees" value={`$${(plan.estimatedFees + plan.estimatedSlippage).toFixed(2)}`} />
          </div>
          {marketType === 'futures' && (
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Stat label="Margin" value={`$${plan.margin.toFixed(2)}`} />
              <Stat label="Liq. estimate" value={plan.liquidationEstimate ? formatPrice(plan.liquidationEstimate) : '—'} tone="red" />
            </div>
          )}
          <p className="text-xs text-neutral-500 mt-3">Estimates only — not an order recommendation. Targets may never be reached.</p>
        </div>
      )}

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">Conditions</p>
        <CheckList checks={signal.checks} />
      </div>

      <div className="mt-4 rounded-lg bg-neutral-800/40 border border-neutral-700/40 px-3.5 py-3">
        <p className="text-xs font-semibold text-neutral-300 mb-1">Invalidation</p>
        <p className="text-xs text-neutral-400">{signal.invalidation}</p>
      </div>

      <p className="text-xs text-neutral-600 mt-3">
        Created {new Date(signal.createdAt).toLocaleString()} · {signal.provisional ? 'unconfirmed candle — levels may change' : 'based on a completed candle'}
      </p>
    </Section>
  );
}

function CheckList({ checks }: { checks: { name: string; passed: boolean; detail: string }[] }) {
  if (!checks?.length) return null;
  return (
    <ul className="space-y-1.5">
      {checks.map((c) => (
        <li key={c.name} className="flex items-start gap-2 text-sm">
          <span className={`mt-0.5 shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${c.passed ? 'bg-green-950 text-green-400' : 'bg-red-950 text-red-400'}`}>
            {c.passed ? '✓' : '✕'}
          </span>
          <span className="text-neutral-300 font-medium">{c.name}</span>
          <span className="text-neutral-500 text-xs">{c.detail}</span>
        </li>
      ))}
    </ul>
  );
}

export function Stat({ label, value, tone, sub }: { label: string; value: string; tone?: 'red' | 'green' | 'amber'; sub?: string }) {
  const color = tone === 'red' ? 'text-red-400' : tone === 'green' ? 'text-green-400' : tone === 'amber' ? 'text-amber-400' : 'text-white';
  return (
    <div className="rounded-lg bg-neutral-800/60 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-neutral-500 mb-0.5">{label}</p>
      <p className={`font-semibold tabular-nums text-sm ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-neutral-500">{sub}</p>}
    </div>
  );
}

export function Chip({ tone, children }: { tone: 'green' | 'red' | 'amber' | 'neutral' | 'blue'; children: React.ReactNode }) {
  const map = {
    green: 'bg-green-950 text-green-400 border-green-900',
    red: 'bg-red-950 text-red-400 border-red-900',
    amber: 'bg-amber-950 text-amber-400 border-amber-900',
    neutral: 'bg-neutral-800 text-neutral-400 border-neutral-700',
    blue: 'bg-sky-950 text-sky-400 border-sky-900',
  } as const;
  return <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${map[tone]}`}>{children}</span>;
}

export function Section({ title, statusChip, children, right }: { title: string; statusChip?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-300">{title}</h2>
        <div className="flex items-center gap-2">{statusChip}{right}</div>
      </div>
      {children}
    </div>
  );
}
