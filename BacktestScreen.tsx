import { useMemo, useState } from 'react';
import { runBacktest, runOutOfSample, DEFAULT_BACKTEST, type BacktestResult } from '../services/backtest';
import type { MarketType } from '../services/marketData';
import { loadCandles } from '../services/markets';
import { fetchFundingHistory, fetchKlines } from '../services/marketData';
import { TIMEFRAMES } from './AnalysisScreen';
import { ErrorPanel, Loading } from './ErrorPanel';
import { Stat } from './SignalPanel';
import { intervalToMs } from '../services/signalEngine';

type Mode = 'backtest' | 'oos';

export default function BacktestScreen({ onPickSymbol }: { onPickSymbol: () => void }) {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [marketType, setMarketType] = useState<MarketType>('spot');
  const [timeframe, setTimeframe] = useState('1h');
  const [range, setRange] = useState({ from: '2024-01-01', to: '2025-01-01' });
  const [riskPercent, setRiskPercent] = useState(1);
  const [feeBps, setFeeBps] = useState(7.5);
  const [slippageBps, setSlippageBps] = useState(5);
  const [allowShorts, setAllowShorts] = useState(true);
  const [mode, setMode] = useState<Mode>('backtest');
  const [result, setResult] = useState<{ bt: BacktestResult | null; oos: ReturnType<typeof runOutOfSample> | null } | null>(null);
  const [phase, setPhase] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  const canRun = useMemo(() => symbol.trim().length > 0 && range.from < range.to, [symbol, range]);

  const run = async () => {
    setPhase('running'); setError(''); setResult(null);
    try {
      const from = new Date(range.from).getTime();
      const to = new Date(range.to).getTime();
      if (Number.isNaN(from) || Number.isNaN(to) || from >= to) throw new Error('Invalid date range.');
      const spanMs = to - from;
      const intervalMs = intervalToMs(timeframe);
      const needed = Math.ceil(spanMs / intervalMs);
      if (needed > 1000) throw new Error(`Range too wide for ${timeframe} candles (Binance returns max 1000 per request). Narrow the dates or use a larger timeframe.`);
      const candles = await fetchKlines({ symbol: symbol.toUpperCase(), interval: timeframe, limit: 1000, startTime: from, endTime: to, marketType }).catch((e) => {
        throw new Error(e instanceof Error ? e.message : 'Failed to load historical candles.');
      });
      if (candles.length < 300) throw new Error(`Only ${candles.length} candles returned — at least 300 are needed for a meaningful test. Widen the range.`);
      const filtered = candles.filter((c) => c.time >= from && c.time <= to);
      let fundingRatePct8h: number | undefined;
      if (marketType === 'futures') {
        const funding = await fetchFundingHistory(symbol.toUpperCase(), from, to).catch(() => [] as { time: number; rate: number }[]);
        if (funding.length > 0) {
          const avg = funding.reduce((s, f) => s + f.rate, 0) / funding.length;
          fundingRatePct8h = avg * 100;
        }
      }
      const settings = { ...DEFAULT_BACKTEST, riskPercent, feeBps, slippageBps, allowShorts, fundingRatePct8h };
      if (mode === 'backtest') {
        setResult({ bt: runBacktest(filtered, marketType, settings), oos: null });
      } else {
        setResult({ bt: null, oos: runOutOfSample(filtered, marketType, settings) });
      }
      setPhase('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backtest failed.');
      setPhase('error');
    }
  };

  const fmtDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

  return (
    <div className="max-w-3xl mx-auto px-4 pb-24 pt-4 space-y-4">
      <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-4 space-y-3">
        <h1 className="text-base font-bold text-white">Historical Backtesting</h1>
        <p className="text-xs text-neutral-500">
          Walk-forward simulation on historical Binance candles. Signals are computed only on completed candles, fills happen at the next candle's open,
          and when a candle's range covers both stop and target the <span className="text-neutral-300">stop is assumed hit first (conservative)</span>.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Pair</span>
            <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-2.5 py-2 text-sm text-white" />
          </label>
          <FilterSelect label="Market" value={marketType} onChange={(v) => setMarketType(v as MarketType)}
            options={[['spot', 'Spot'], ['futures', 'Futures']]} />
          <FilterSelect label="Timeframe" value={timeframe} onChange={setTimeframe}
            options={TIMEFRAMES.map((t) => [t, t.toUpperCase()] as [string, string])} />
          <FilterSelect label="Mode" value={mode} onChange={(v) => setMode(v as Mode)}
            options={[['backtest', 'Backtest'], ['oos', 'Out-of-sample']]} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wider text-neutral-500 mb-1">From</span>
            <input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-2.5 py-2 text-sm text-white" />
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wider text-neutral-500 mb-1">To</span>
            <input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-2.5 py-2 text-sm text-white" />
          </label>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <NumberField label="Risk % per trade" value={riskPercent} onChange={setRiskPercent} step={0.1} min={0.1} />
          <NumberField label="Fee (bps)" value={feeBps} onChange={setFeeBps} step={0.5} min={0} />
          <NumberField label="Slippage (bps)" value={slippageBps} onChange={setSlippageBps} step={0.5} min={0} />
        </div>
        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input type="checkbox" checked={allowShorts} onChange={(e) => setAllowShorts(e.target.checked)}
            className="w-4 h-4 rounded bg-neutral-800 border-neutral-600 accent-green-600" />
          Allow SHORT trades
        </label>
        <button onClick={() => void run()} disabled={!canRun || phase === 'running'}
          className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
          {phase === 'running' ? 'Running…' : 'Run test'}
        </button>
      </div>

      {phase === 'error' && <ErrorPanel message={error} onRetry={() => void run()} title="Backtest error" />}
      {phase === 'running' && <Loading label="Fetching candles and simulating…" />}

      {phase === 'done' && result?.bt && <ResultTable r={result.bt} title={`Backtest — ${symbol} ${timeframe.toUpperCase()}`} />}
      {phase === 'done' && result?.oos && (
        <div className="space-y-4">
          <div className="rounded-xl bg-blue-950/30 border border-blue-900/40 px-4 py-3 text-xs text-blue-300">
            Out-of-sample mode: the first 70% of the period is used for development (in-sample), the remaining 30% is unseen evaluation data.
            Results are reported separately and must be judged independently — a good in-sample result does not prove future profitability.
          </div>
          <ResultTable r={result.oos.inSample} title="In-sample (development)" period={`${fmtDate(result.oos.inSampleFrom)} → ${fmtDate(result.oos.inSampleTo)}`} />
          <ResultTable r={result.oos.outOfSample} title="Out-of-sample (unseen)" period={`${fmtDate(result.oos.outOfSampleFrom)} → ${fmtDate(result.oos.outOfSampleTo)}`} />
        </div>
      )}

      {phase === 'idle' && (
        <p className="text-sm text-neutral-500 text-center py-10">
          Configure a pair, timeframe and date range, then run a test. Historical candles come from Binance (max 1000 per run).
        </p>
      )}
    </div>
  );
}

function ResultTable({ r, title, period }: { r: BacktestResult; title: string; period?: string }) {
  return (
    <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-4">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-300">{title}</h2>
        {period && <span className="text-xs text-neutral-500">{period}</span>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Trades" value={String(r.totalTrades)} />
        <Stat label="Win rate" value={`${r.winRate.toFixed(1)}%`} tone={r.winRate >= 50 ? 'green' : 'red'} />
        <Stat label="Net return" value={`${r.netReturnPct >= 0 ? '+' : ''}${r.netReturnPct.toFixed(2)}%`} tone={r.netReturnPct >= 0 ? 'green' : 'red'} />
        <Stat label="Profit factor" value={r.profitFactor === Infinity ? '∞' : r.profitFactor.toFixed(2)} />
        <Stat label="Wins / Losses" value={`${r.wins} / ${r.losses}`} />
        <Stat label="Avg win" value={`+${r.avgWinPct.toFixed(2)}%`} tone="green" />
        <Stat label="Avg loss" value={`-${r.avgLossPct.toFixed(2)}%`} tone="red" />
        <Stat label="Max drawdown" value={`-${r.maxDrawdownPct.toFixed(2)}%`} tone="red" />
        <Stat label="Long trades" value={`${r.longTrades} (${r.longWinRate.toFixed(0)}% won)`} />
        <Stat label="Short trades" value={`${r.shortTrades} (${r.shortWinRate.toFixed(0)}% won)`} />
        <Stat label="Total fees+slip" value={`${r.totalFeesPct.toFixed(2)}%`} />
        {r.totalFundingPct !== null && <Stat label="Est. funding paid" value={`-${r.totalFundingPct.toFixed(2)}%`} tone="red" />}
        <Stat label="Avg R:R realized" value={r.avgRr.toFixed(2)} />
      </div>
      <p className="text-xs text-neutral-600 mt-4">
        Past performance never guarantees future results. Results include the conservative assumption that a candle touching both stop and target resolves as a loss.
        {r.totalFundingPct !== null && ' Funding is an estimate: the average funding rate for this period is charged every 8 hours while a trade is open.'}
      </p>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-neutral-500 mb-1">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-2.5 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-600">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function NumberField({ label, value, onChange, step, min }: { label: string; value: number; onChange: (v: number) => void; step: number; min: number }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-neutral-500 mb-1">{label}</span>
      <input type="number" value={value} step={step} min={min} onChange={(e) => onChange(Number(e.target.value) || min)}
        className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-2.5 py-2 text-sm text-white" />
    </label>
  );
}
