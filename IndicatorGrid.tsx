import type { Analysis } from '../services/signalEngine';
import { Section, Stat } from './SignalPanel';
import { formatPrice } from './SimpleSignalCards';

export default function IndicatorGrid({ analysis }: { analysis: Analysis }) {
  const emaAlign = analysis.ema50 !== null && analysis.ema200 !== null
    ? analysis.ema50 > analysis.ema200 ? 'BULLISH' : 'BEARISH'
    : 'N/A';
  const emaTone = emaAlign === 'BULLISH' ? 'green' : emaAlign === 'BEARISH' ? 'red' : undefined;
  const adxTrend = analysis.adx === null ? null : analysis.adx >= 25 ? 'STRONG' : analysis.adx >= 20 ? 'MODERATE' : 'WEAK';
  const dmiBias = analysis.plusDi !== null && analysis.minusDi !== null
    ? analysis.plusDi > analysis.minusDi ? '+DI LEADS (BULLISH)' : '-DI LEADS (BEARISH)'
    : 'N/A';

  return (
    <Section title="Technical Indicators" statusChip={<span className="text-xs text-neutral-500">last candle values</span>}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Price" value={formatPrice(analysis.price)} />
        <Stat label="EMA 50" value={analysis.ema50 !== null ? formatPrice(analysis.ema50) : 'insufficient data'} />
        <Stat label="EMA 200" value={analysis.ema200 !== null ? formatPrice(analysis.ema200) : 'insufficient data'} />
        <Stat label="RSI (14)" value={analysis.rsi !== null ? analysis.rsi.toFixed(1) : 'N/A'} tone={analysis.rsi === null ? undefined : analysis.rsi >= 70 ? 'red' : analysis.rsi <= 30 ? 'green' : undefined} />
        <Stat label="ADX (14)" value={analysis.adx !== null ? analysis.adx.toFixed(1) : 'N/A'} sub={adxTrend ?? 'insufficient data'} />
        <Stat label="+DI / -DI" value={analysis.plusDi !== null && analysis.minusDi !== null ? `${analysis.plusDi.toFixed(1)} / ${analysis.minusDi.toFixed(1)}` : 'N/A'} />
        <Stat label="ATR (14)" value={analysis.atr !== null ? formatPrice(analysis.atr) : 'N/A'} sub={analysis.atr !== null ? `${((analysis.atr / analysis.price) * 100).toFixed(2)}% of price` : undefined} />
        <Stat label="Volume vs avg" value={analysis.volumeRatio !== null ? `${analysis.volumeRatio.toFixed(2)}x` : 'N/A'} tone={analysis.volumeRatio !== null && analysis.volumeRatio >= 1.05 ? 'green' : undefined} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
        <ConditionRow label="EMA alignment" verdict={emaAlign} tone={emaTone} detail="EMA50 vs EMA200 relationship" />
        <ConditionRow label="Market structure" verdict={analysis.trend.toUpperCase()} tone={analysis.trend === 'up' ? 'green' : analysis.trend === 'down' ? 'red' : undefined} detail="Swing-based trend direction" />
        <ConditionRow label="DMI bias" verdict={dmiBias} tone={dmiBias.includes('BULLISH') ? 'green' : dmiBias.includes('BEARISH') ? 'red' : undefined} detail="Directional movement comparison" />
        <ConditionRow label="Higher timeframe" verdict={analysis.htfTrend.toUpperCase()} tone={analysis.htfTrend === 'up' ? 'green' : analysis.htfTrend === 'down' ? 'red' : undefined} detail="Trend on the confirmation timeframe" />
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="rounded-lg bg-neutral-800/60 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wider text-green-500 mb-1.5">Supports</p>
          {analysis.supports.length === 0
            ? <p className="text-xs text-neutral-500">No clustered levels</p>
            : analysis.supports.slice(0, 3).map((p, i) => <p key={i} className="text-sm text-green-400 tabular-nums">{formatPrice(p)}</p>)}
        </div>
        <div className="rounded-lg bg-neutral-800/60 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wider text-red-500 mb-1.5">Resistances</p>
          {analysis.resistances.length === 0
            ? <p className="text-xs text-neutral-500">No clustered levels</p>
            : analysis.resistances.slice(0, 3).map((p, i) => <p key={i} className="text-sm text-red-400 tabular-nums">{formatPrice(p)}</p>)}
        </div>
      </div>
    </Section>
  );
}

function ConditionRow({ label, verdict, detail, tone }: { label: string; verdict: string; detail: string; tone?: 'green' | 'red' }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-neutral-800/60 px-3.5 py-3">
      <div>
        <p className="text-sm font-medium text-neutral-200">{label}</p>
        <p className="text-xs text-neutral-500">{detail}</p>
      </div>
      <span className={`text-xs font-bold ${tone === 'green' ? 'text-green-400' : tone === 'red' ? 'text-red-400' : 'text-neutral-400'}`}>{verdict}</span>
    </div>
  );
}
