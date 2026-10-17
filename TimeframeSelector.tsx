import { TIMEFRAMES } from './AnalysisScreen';

const HINTS: Record<string, string> = {
  '1m': '1 min per candle', '3m': '3 min per candle', '5m': '5 min per candle',
  '15m': '15 min per candle', '30m': '30 min per candle', '1h': '1 hour per candle',
  '2h': '2 hours per candle', '4h': '4 hours per candle', '6h': '6 hours per candle',
  '12h': '12 hours per candle', '1d': '1 day per candle', '1w': '1 week per candle',
};

export function TimeframeSelector({ current, onChange }: { current: string; onChange: (tf: (typeof TIMEFRAMES)[number]) => void }) {
  return (
    <div className="rounded-2xl bg-[#0b1220] border border-neutral-800 p-2.5">
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none" role="tablist" aria-label="Timeframe">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            role="tab"
            aria-selected={current === tf}
            title={HINTS[tf]}
            onClick={() => onChange(tf)}
            className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
              current === tf ? 'bg-green-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {tf === '1d' ? '1D' : tf === '1w' ? '1W' : tf}
          </button>
        ))}
      </div>
    </div>
  );
}
