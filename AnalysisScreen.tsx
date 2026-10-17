import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Candle, MarketType, SymbolInfo } from '../services/marketData';
import { loadCandles, loadSymbolInfo } from '../services/markets';
import { fetchFuturesContractInfo, type FuturesContractInfo } from '../services/marketData';
import { analyze } from '../services/signalEngine';
import { emaOf } from '../services/analysis';
import { toSimpleSignal, toSimpleLevels, toNextSignal } from '../services/simpleView';
import { planPosition } from '../services/risk';
import { openPriceFeed, type ConnectionState } from '../services/websocket';
import CandleChart from './CandleChart';
import { ErrorPanel, Loading, Tip } from './ErrorPanel';
import { CurrentSignalCard, NextSignalCard, formatPrice, formatCompact } from './SimpleSignalCards';
import { TimeframeSelector } from './TimeframeSelector';
import { useAppState } from '../contexts/AppStateContext';
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';

export const TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d', '1w'] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

const TF_HINTS: Partial<Record<Timeframe, string>> = {
  '1m': 'Each candle shows 1 minute of price movement.',
  '5m': 'Each candle shows 5 minutes of price movement.',
  '15m': 'Each candle shows 15 minutes of price movement.',
  '30m': 'Each candle shows 30 minutes of price movement.',
  '1h': 'Each candle shows 1 hour of price movement.',
  '4h': 'Each candle shows 4 hours of price movement.',
  '1d': 'Each candle shows 1 day of price movement.',
  '1w': 'Each candle shows 1 week of price movement.',
};

interface Props {
  marketType: MarketType;
  symbol: string;
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
}

type Phase = 'loading' | 'ready' | 'error';

export default function AnalysisScreen({ marketType, symbol, timeframe, onTimeframeChange }: Props) {
  const app = useAppState();
  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [info, setInfo] = useState<SymbolInfo | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [htfCandles, setHtfCandles] = useState<Candle[]>([]);
  const [lastUpdate, setLastUpdate] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [wsState, setWsState] = useState<ConnectionState>('closed');
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [liveChange, setLiveChange] = useState<number | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [contract, setContract] = useState<FuturesContractInfo | null>(null);
  const requestIdRef = useRef(0);
  const feedRef = useRef<{ close: () => void } | null>(null);

  const load = useCallback(async (silent: boolean) => {
    const id = ++requestIdRef.current;
    if (!silent) { setPhase('loading'); setErrorMsg(''); }
    else setRefreshing(true);
    try {
      const [symbolInfo, k, htf] = await Promise.all([
        loadSymbolInfo(marketType, symbol),
        loadCandles(marketType, symbol, timeframe, 500),
        loadCandles(marketType, symbol, htfOf(timeframe), 200).catch(() => []),
      ]);
      if (requestIdRef.current !== id) return;
      if (!Array.isArray(k) || k.length === 0) throw new Error('No price data returned for this coin right now.');
      setInfo(symbolInfo);
      setCandles(k);
      setHtfCandles(htf);
      setLivePrice(symbolInfo.price);
      setLiveChange(symbolInfo.priceChangePercent);
      setLastUpdate(Date.now());
      setPhase('ready');
    } catch (err) {
      if (requestIdRef.current !== id) return;
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load market data.');
      setPhase('error');
    } finally {
      if (requestIdRef.current === id) setRefreshing(false);
    }
  }, [marketType, symbol, timeframe]);

  useEffect(() => { void load(false); }, [load]);

  useEffect(() => {
    setContract(null);
    if (marketType !== 'futures') return;
    let alive = true;
    fetchFuturesContractInfo(symbol)
      .then((c) => { if (alive) setContract(c); })
      .catch(() => { /* shown as N/A */ });
    return () => { alive = false; };
  }, [marketType, symbol]);

  useEffect(() => {
    feedRef.current?.close();
    const feed = openPriceFeed(
      marketType, symbol,
      (price, pct) => { setLivePrice(price); setLiveChange(pct); },
      (state) => {
        setWsState(state);
        if ((state === 'error' || state === 'closed') && app.alertsEnabled.dataErrors) {
          app.pushAlert({ category: 'dataErrors', title: 'Live connection lost', body: `Live prices for ${symbol} dropped. We are using slower updates until it reconnects.`, symbol });
        }
      },
      (k) => { if (k.closed) void load(true); },
    );
    feedRef.current = feed;
    return () => feed.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketType, symbol]);

  useEffect(() => {
    const iv = window.setInterval(() => { void load(true); }, 60_000);
    return () => window.clearInterval(iv);
  }, [load]);

  const analysis = useMemo(() => {
    if (!candles.length) return null;
    try {
      return analyze(candles, htfCandles, timeframe, htfOf(timeframe), marketType, app.engineConfig, info?.tickSize ?? 0.01);
    } catch (err) {
      console.error('Analysis failed:', err);
      return null;
    }
  }, [candles, htfCandles, timeframe, marketType, app.engineConfig, info?.tickSize]);

  const signalView = useMemo(
    () => analysis ? toSimpleSignal(analysis, marketType, timeframe, lastUpdate || Date.now(), phase === 'ready') : null,
    [analysis, marketType, timeframe, lastUpdate, phase],
  );
  const levels = useMemo(() => analysis ? toSimpleLevels(analysis) : null, [analysis]);
  const nextView = useMemo(() => analysis ? toNextSignal(analysis, timeframe) : null, [analysis, timeframe]);

  const plan = useMemo(() => {
    if (!analysis?.signal || !info) return null;
    return planPosition(app.risk, analysis.signal.direction, analysis.signal.entry, analysis.signal.stopLoss, analysis.signal.tps, info.minQty, info.minNotional);
  }, [analysis, info, app.risk]);

  // level alerts: entry zone, stop, targets (deduped)
  const alertKeyRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!analysis?.signal || !livePrice || !info) return;
    const dir = analysis.signal.direction;
    const long = dir === 'LONG';
    const key = `${marketType}:${symbol}:${timeframe}`;
    const fired = alertKeyRef.current;
    const fire = (cat: 'entryZone' | 'stopLoss' | 'takeProfit', title: string, body: string) => {
      const k = `${key}:${cat}`;
      if (fired.has(k)) return;
      fired.add(k);
      app.pushAlert({ category: cat, title, body, symbol, timeframe });
    };
    const beyondEntry = long ? livePrice <= analysis.signal.entry : livePrice >= analysis.signal.entry;
    if (beyondEntry && app.alertsEnabled.entryZone) fire('entryZone', 'Entry area reached', `${symbol} price is now at the entry level (${formatPrice(analysis.signal.entry)}).`);
    const stopHit = long ? livePrice <= analysis.signal.stopLoss : livePrice >= analysis.signal.stopLoss;
    if (stopHit && app.alertsEnabled.stopLoss) fire('stopLoss', 'Stop Loss level reached', `${symbol} reached the Stop Loss price (${formatPrice(analysis.signal.stopLoss)}). Consider exiting.`);
    analysis.signal.tps.forEach((tp, i) => {
      const hit = long ? livePrice >= tp.price : livePrice <= tp.price;
      if (hit && app.alertsEnabled.takeProfit) {
        const k = `${key}:tp${i}`;
        if (!fired.has(k)) {
          fired.add(k);
          app.pushAlert({ category: 'takeProfit', title: `Target ${i + 1} reached`, body: `${symbol} reached Target ${i + 1} (${formatPrice(tp.price)}).`, symbol, timeframe });
        }
      }
    });
  }, [livePrice, analysis, marketType, symbol, timeframe, info, app]);

  const fav = app.isFavorite(marketType, symbol);
  const priceDisplay = livePrice ?? info?.price ?? 0;
  const changeDisplay = liveChange ?? info?.priceChangePercent ?? 0;

  if (phase === 'loading') return <Loading label={`Loading ${symbol}…`} />;
  if (phase === 'error' || !info || !analysis || !signalView || !nextView) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <ErrorPanel message={errorMsg || 'We could not analyze this coin right now.'} onRetry={() => void load(false)} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 pb-28 pt-3 space-y-4">
      {/* Coin header */}
      <div className="rounded-2xl bg-[#0b1220] border border-neutral-800 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-white">{info.name}</h1>
              <span className="px-2 py-0.5 rounded-md bg-neutral-800 text-xs font-semibold text-neutral-300">{info.base}/{info.quote}</span>
              <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${marketType === 'futures' ? 'bg-amber-950 text-amber-400' : 'bg-sky-950 text-sky-400'}`}>
                {marketType === 'futures' ? 'FUTURES' : 'SPOT'}
              </span>
            </div>
            <p className="text-xs text-neutral-500 mt-1">Binance</p>
          </div>
          <button
            onClick={() => void load(true)}
            className={`p-2.5 rounded-xl border border-neutral-700 text-neutral-400 hover:text-neutral-200 transition-colors ${refreshing ? 'animate-spin' : ''}`}
            aria-label="Refresh prices"
          >
            <RefreshCw size={17} />
          </button>
        </div>
        <p className="text-3xl font-extrabold text-white tabular-nums mt-3">{formatPrice(priceDisplay)}</p>
        <p className={`text-sm font-semibold tabular-nums mt-0.5 ${changeDisplay >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {changeDisplay >= 0 ? '▲' : '▼'} {Math.abs(changeDisplay).toFixed(2)}% in 24 hours
          <span className="sr-only">{changeDisplay >= 0 ? ' (up)' : ' (down)'}</span>
        </p>
        <div className="flex items-center justify-between mt-2 text-xs text-neutral-500">
          <span className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${wsState === 'open' ? 'bg-green-500 animate-pulse' : wsState === 'connecting' ? 'bg-amber-500' : 'bg-red-500'}`} />
            {wsState === 'open' ? 'Live prices' : 'Updating every minute'}
          </span>
          <span>24h volume: {formatCompact(info.volume)}</span>
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-2xl bg-[#0b1220] border border-neutral-800 overflow-hidden">
        <CandleChart
          candles={candles}
          ema50={emaOf(candles, 50)}
          ema200={emaOf(candles, 200)}
          supports={analysis.supports}
          resistances={analysis.resistances}
          entry={analysis.signal?.entry ?? null}
          stopLoss={analysis.signal?.stopLoss ?? null}
          tps={analysis.signal?.tps.map((t) => t.price) ?? []}
        />
        <div className="px-4 py-2 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-500">
          <span>Price chart</span>
          <div className="flex gap-3">
            <span className="text-green-400">Fast average (EMA50)</span>
            <span className="text-amber-400">Slow average (EMA200)</span>
          </div>
        </div>
      </div>

      <div>
        <TimeframeSelector current={timeframe} onChange={onTimeframeChange} />
        <p className="text-[11px] text-neutral-600 mt-1.5 px-1">{TF_HINTS[timeframe] ?? `Each candle shows ${timeframe} of price movement.`}</p>
      </div>

      {/* Signal cards */}
      <CurrentSignalCard
        view={signalView}
        levels={levels}
        fav={fav}
        onToggleFav={() => void app.toggleFavorite({ market_type: marketType, symbol, base: info.base, quote: info.quote })}
      />
      <NextSignalCard view={nextView} />

      {/* Estimate */}
      {plan && (
        <div className="rounded-2xl bg-[#0b1220] border border-neutral-800 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-400 mb-3">Your Size Estimate</h2>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div><p className="text-[10px] uppercase text-neutral-500">Amount</p><p className="text-sm font-bold text-white tabular-nums">{plan.quantity.toPrecision(4)}</p></div>
            <div><p className="text-[10px] uppercase text-neutral-500">Value</p><p className="text-sm font-bold text-white tabular-nums">${plan.notional.toFixed(2)}</p></div>
            <div><p className="text-[10px] uppercase text-neutral-500">If wrong, you risk</p><p className="text-sm font-bold text-red-400 tabular-nums">${plan.riskAmount.toFixed(2)}</p></div>
          </div>
          <div className="mt-3">
            <Tip>Estimate based on your balance (${app.risk.balance}) and risk setting ({app.risk.riskPercent}%). Change these in Settings. This is only an estimate — never a promise.</Tip>
          </div>
        </div>
      )}

      {/* Futures contract info */}
      {marketType === 'futures' && (
        <div className="rounded-2xl bg-[#0b1220] border border-neutral-800 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-400 mb-3">Futures Contract Info</h2>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[10px] uppercase text-neutral-500">Funding Rate</p>
              <p className={`text-sm font-bold tabular-nums ${contract?.fundingRate == null ? 'text-neutral-500' : contract.fundingRate >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {contract?.fundingRate != null ? `${(contract.fundingRate * 100).toFixed(4)}% / 8h` : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-neutral-500">Next Funding</p>
              <p className="text-sm font-bold text-white tabular-nums">
                {contract?.nextFundingTime ? new Date(contract.nextFundingTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-neutral-500">Open Interest</p>
              <p className="text-sm font-bold text-white tabular-nums">
                {contract?.openInterest != null ? formatCompact(contract.openInterest) : 'N/A'}
              </p>
            </div>
          </div>
          <div className="mt-3">
            <Tip>
              Funding Rate — a small fee traders pay each 8 hours. Positive means traders pay to hold long positions.
              Open Interest — how many contracts traders currently hold. Both come from Binance and may be unavailable for some contracts.
            </Tip>
          </div>
        </div>
      )}

      {/* More details */}
      <button
        onClick={() => setShowDetails((s) => !s)}
        className="w-full py-3 rounded-xl border border-neutral-700 text-neutral-300 text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-neutral-800/60 transition-colors"
      >
        {showDetails ? <><ChevronUp size={16} /> Hide details</> : <><ChevronDown size={16} /> More details (for advanced users)</>}
      </button>
      {showDetails && (
        <div className="rounded-2xl bg-[#0b1220] border border-neutral-800 p-5 space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-400">Technical Details</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <DetailBox label="RSI (momentum)" value={analysis.rsi !== null ? analysis.rsi.toFixed(1) : 'N/A'} hint="0–100. Above 70 can mean overheated; below 30 can mean oversold." />
            <DetailBox label="ADX (trend strength)" value={analysis.adx !== null ? analysis.adx.toFixed(1) : 'N/A'} hint="Above 25 usually means a strong trend." />
            <DetailBox label="ATR (volatility)" value={analysis.atr !== null ? formatPrice(analysis.atr) : 'N/A'} hint="How much the price typically moves per candle." />
            <DetailBox label="Volume vs average" value={analysis.volumeRatio !== null ? `${analysis.volumeRatio.toFixed(2)}x` : 'N/A'} hint="How today's trading compares to recent days." />
            <DetailBox label="EMA 50" value={analysis.ema50 !== null ? formatPrice(analysis.ema50) : 'N/A'} hint="Average price over the last 50 candles." />
            <DetailBox label="EMA 200" value={analysis.ema200 !== null ? formatPrice(analysis.ema200) : 'N/A'} hint="Average price over the last 200 candles." />
            <DetailBox label="+DI" value={analysis.plusDi !== null ? analysis.plusDi.toFixed(1) : 'N/A'} hint="Upward pressure indicator." />
            <DetailBox label="-DI" value={analysis.minusDi !== null ? analysis.minusDi.toFixed(1) : 'N/A'} hint="Downward pressure indicator." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-neutral-800/60 p-3">
              <p className="text-[10px] uppercase tracking-wider text-green-500 mb-1">Support levels (floors)</p>
              {analysis.supports.length === 0 ? <p className="text-xs text-neutral-500">None detected</p> :
                analysis.supports.slice(0, 3).map((p, i) => <p key={i} className="text-sm text-green-400 tabular-nums">{formatPrice(p)}</p>)}
            </div>
            <div className="rounded-xl bg-neutral-800/60 p-3">
              <p className="text-[10px] uppercase tracking-wider text-red-500 mb-1">Resistance levels (ceilings)</p>
              {analysis.resistances.length === 0 ? <p className="text-xs text-neutral-500">None detected</p> :
                analysis.resistances.slice(0, 3).map((p, i) => <p key={i} className="text-sm text-red-400 tabular-nums">{formatPrice(p)}</p>)}
            </div>
          </div>
          {analysis.signal?.invalidation && (
            <p className="text-xs text-neutral-500">Signal becomes invalid if: {analysis.signal.invalidation}</p>
          )}
        </div>
      )}

      <p className="text-[11px] text-neutral-600 text-center px-6 leading-relaxed">
        Signals are ideas, not guarantees. SB Crypto Signals never places trades for you — you always decide.
      </p>
    </div>
  );
}

export function htfOf(tf: Timeframe): Timeframe {
  const map: Record<Timeframe, Timeframe> = {
    '1m': '15m', '3m': '30m', '5m': '30m', '15m': '1h', '30m': '4h',
    '1h': '4h', '2h': '12h', '4h': '1d', '6h': '1d', '12h': '1d', '1d': '1w', '1w': '1w',
  };
  return map[tf];
}

function DetailBox({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl bg-neutral-800/60 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="text-sm font-bold text-white tabular-nums mt-0.5">{value}</p>
      <p className="text-[10px] text-neutral-500 leading-tight mt-0.5">{hint}</p>
    </div>
  );
}
