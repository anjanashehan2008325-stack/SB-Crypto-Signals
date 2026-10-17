import type { NextSetup } from '../services/signalEngine';
import { formatPrice } from './SimpleSignalCards';
import { Chip, Section, Stat } from './SignalPanel';

const TONE: Record<NextSetup['status'], 'blue' | 'amber' | 'green' | 'neutral' | 'red'> = {
  'WAITING FOR SETUP': 'neutral',
  'FORMING': 'blue',
  'AWAITING CONFIRMATION': 'amber',
  'CONFIRMED': 'green',
  'INVALIDATED': 'red',
};

export default function NextSetupPanel({ setup, timeframe }: { setup: NextSetup; timeframe: string }) {
  const tone = TONE[setup.status];
  return (
    <Section title="Next Potential Signal" statusChip={<Chip tone={tone}>{setup.status}</Chip>}>
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <Chip tone={setup.direction === 'LONG' ? 'green' : 'red'}>{setup.direction === 'LONG' ? 'BULLISH' : 'BEARISH'} SETUP</Chip>
        <span className="text-xs text-neutral-500">{timeframe.toUpperCase()} · {setup.conditionsPassed}/{setup.conditionsTotal} conditions met</span>
      </div>

      {setup.entryZone && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Potential entry zone" value={`${formatPrice(setup.entryZone[0])} – ${formatPrice(setup.entryZone[1])}`} />
          {setup.stopLoss !== null && <Stat label="Potential stop" value={formatPrice(setup.stopLoss)} tone="red" />}
          {setup.tps.map((tp, i) => (
            <Stat key={i} label={`Potential TP${i + 1}`} value={formatPrice(tp.price)} tone="green" sub={`R:R ${tp.rr}`} />
          ))}
        </div>
      )}

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">Conditions still required</p>
        {setup.missing.length === 0 ? (
          <p className="text-sm text-green-400">All conditions currently met — this setup is confirmed on the last {setup.status === 'CONFIRMED' ? 'closed' : 'in-progress'} candle.</p>
        ) : (
          <ul className="space-y-1.5">
            {setup.missing.map((m, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 shrink-0 w-4 h-4 rounded-full bg-amber-950 text-amber-400 flex items-center justify-center text-[10px] font-bold">•</span>
                <span className="text-neutral-300">{m}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs">
        <span className="text-neutral-500">HTF confirmation:</span>
        <Chip tone={setup.htfConfirmed ? 'green' : 'amber'}>{setup.htfConfirmed ? 'CONFIRMS' : 'NOT CONFIRMED'}</Chip>
      </div>

      <div className="mt-3 rounded-lg bg-neutral-800/40 border border-neutral-700/40 px-3.5 py-3">
        <p className="text-xs font-semibold text-neutral-300 mb-1">Invalidation</p>
        <p className="text-xs text-neutral-400">{setup.invalidation}</p>
      </div>

      <p className="text-xs text-neutral-600 mt-3">{setup.note} This panel describes conditional future possibilities — never guaranteed prices.</p>
    </Section>
  );
}
