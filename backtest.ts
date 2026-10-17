import type { Candle, MarketType } from './marketData';
import { analyze, DEFAULT_CONFIG, intervalToMs, roundTo } from './signalEngine';
import type { EngineConfig } from './signalEngine';

export interface BacktestSettings {
  config: EngineConfig;
  riskPercent: number;
  feeBps: number;
  slippageBps: number;
  allowShorts: boolean;
  /** Annualised funding cost in percent, charged every 8h on notional (futures only). */
  fundingRatePct8h?: number;
}

export const DEFAULT_BACKTEST: BacktestSettings = {
  config: DEFAULT_CONFIG,
  riskPercent: 1,
  feeBps: 7.5,
  slippageBps: 5,
  allowShorts: true,
};

export interface BacktestTrade {
  entryTime: number;
  exitTime: number;
  direction: 'LONG' | 'SHORT';
  entry: number;
  exit: number;
  pnlPct: number;
  outcome: 'tp1' | 'tp2' | 'tp3' | 'tp4' | 'stop' | 'end';
  barsHeld: number;
}

export interface BacktestResult {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  netReturnPct: number;
  profitFactor: number;
  maxDrawdownPct: number;
  avgWinPct: number;
  avgLossPct: number;
  avgRr: number;
  totalFeesPct: number;
  /** Estimated total funding paid across trades (percent, futures only; null in spot mode). */
  totalFundingPct: number | null;
  longTrades: number;
  shortTrades: number;
  longWinRate: number;
  shortWinRate: number;
  trades: BacktestTrade[];
  equity: { time: number; value: number }[];
}

/**
 * Walk-forward backtest. Signals are evaluated on candle close i (using data up to i only),
 * entries fill at the NEXT candle's open (no look-ahead). Intrabar ambiguity between stop and
 * TP within one candle is resolved conservatively: stop is assumed hit first.
 */
export function runBacktest(candles: Candle[], marketType: MarketType, settings: BacktestSettings = DEFAULT_BACKTEST): BacktestResult {
  const trades: BacktestTrade[] = [];
  const intervalMs = candles.length >= 2 ? candles[candles.length - 1].time - candles[candles.length - 2].time : intervalToMs('1h');
  let equity = 100;
  const equityCurve: { time: number; value: number }[] = [];
  let inPosition: null | {
    direction: 'LONG' | 'SHORT';
    entry: number;
    stop: number;
    remaining: number; // fraction of position after partial TPs
    tpsHit: number;
    entryTime: number;
    riskPerUnit: number;
  } = null;

  const warmup = 220;
  const fundingPct = settings.fundingRatePct8h ?? 0;
  // funding events per candle: funding is charged every 8h on remaining notional
  const fundingPerCandlePct = fundingPct * (intervalMs / (8 * 3_600_000));
  for (let i = warmup; i < candles.length - 1; i++) {
    const closed = candles[i];
    const next = candles[i + 1];

    // manage open position on this candle
    if (inPosition) {
      const p = inPosition;
      const hitStop = p.direction === 'LONG' ? closed.low <= p.stop : closed.high >= p.stop;
      if (hitStop) {
        const exit = p.stop;
        const movePct = ((exit - p.entry) / p.entry) * 100 * (p.direction === 'LONG' ? 1 : -1);
        const realized = movePct * p.remaining;
        const fundingPaid = fundingPerCandlePct * Math.round((closed.time - p.entryTime) / intervalMs);
        trades.push({
          entryTime: p.entryTime, exitTime: closed.time, direction: p.direction,
          entry: p.entry, exit,
          pnlPct: realized - settings.feeBps / 100 - settings.slippageBps / 100 - fundingPaid,
          outcome: p.tpsHit > 0 ? 'stop' : 'stop',
          barsHeld: Math.round((closed.time - p.entryTime) / intervalMs),
        });
        equity *= 1 + ((realized - settings.feeBps / 100 - settings.slippageBps / 100 - fundingPaid) * settings.riskPercent) / 100;
        equityCurve.push({ time: closed.time, value: equity });
        inPosition = null;
      } else {
        // check TPs (assume first touched target fills)
        for (let t = p.tpsHit; t < 4; t++) {
          const tpPrice = p.entry + p.riskPerUnit * [1.5, 2.5, 3.5, 5][t] * (p.direction === 'LONG' ? 1 : -1);
          const hit = p.direction === 'LONG' ? closed.high >= tpPrice : closed.low <= tpPrice;
          if (hit) {
            const fraction = t === 0 ? 0.4 : t === 1 ? 0.3 : t === 2 ? 0.2 : 0.1;
            const movePct = ((tpPrice - p.entry) / p.entry) * 100 * (p.direction === 'LONG' ? 1 : -1);
            equity *= 1 + ((movePct * fraction - settings.feeBps / 100) * settings.riskPercent) / 100;
            p.remaining -= fraction;
            p.tpsHit = t + 1;
          }
        }
        if (p.remaining <= 0.01) {
          trades.push({
            entryTime: p.entryTime, exitTime: closed.time, direction: p.direction,
            entry: p.entry, exit: closed.close,
            pnlPct: 0, outcome: p.tpsHit >= 4 ? 'tp4' : 'tp1',
            barsHeld: Math.round((closed.time - p.entryTime) / intervalMs),
          });
          trades[trades.length - 1].pnlPct = computeRealized(p, settings) - settings.feeBps / 50 - fundingPerCandlePct * Math.round((closed.time - p.entryTime) / intervalMs);
          equityCurve.push({ time: closed.time, value: equity });
          inPosition = null;
        } else {
          equityCurve.push({ time: closed.time, value: equity });
        }
      }
      if (inPosition) continue; // one position at a time; skip new signal eval while in position
    }

    // evaluate signal on data up to and including candle i (no look-ahead)
    const window = candles.slice(Math.max(0, i - 400), i + 1);
    if (window.length < warmup) { equityCurve.push({ time: closed.time, value: equity }); continue; }
    const analysis = analyze(window, window, '1h', '1h', marketType, settings.config, 0.01);
    const sig = analysis.signal;
    if (!sig || (sig.direction === 'SHORT' && !settings.allowShorts)) { equityCurve.push({ time: closed.time, value: equity }); continue; }

    const fill = next.open * (sig.direction === 'LONG' ? 1 + settings.slippageBps / 10000 : 1 - settings.slippageBps / 10000);
    const stop = roundTo(sig.stopLoss, 0.0001);
    if (sig.direction === 'LONG' ? stop >= fill : stop <= fill) { equityCurve.push({ time: closed.time, value: equity }); continue; }

    inPosition = {
      direction: sig.direction,
      entry: fill,
      stop,
      remaining: 1,
      tpsHit: 0,
      entryTime: next.time,
      riskPerUnit: Math.abs(fill - stop),
    };
  }

  // close open position at end
  if (inPosition) {
    const lastCandle = candles[candles.length - 1];
    const movePct = ((lastCandle.close - inPosition.entry) / inPosition.entry) * 100 * (inPosition.direction === 'LONG' ? 1 : -1);
    const barsHeldEnd = Math.round((lastCandle.time - inPosition.entryTime) / intervalMs);
    const fundingPaid = fundingPerCandlePct * barsHeldEnd;
    trades.push({
      entryTime: inPosition.entryTime, exitTime: lastCandle.time, direction: inPosition.direction,
      entry: inPosition.entry, exit: lastCandle.close,
      pnlPct: movePct * inPosition.remaining - settings.feeBps / 100 - settings.slippageBps / 100 - fundingPaid,
      outcome: 'end',
      barsHeld: barsHeldEnd,
    });
    equity *= 1 + ((movePct * inPosition.remaining - fundingPaid) * settings.riskPercent) / 100;
    equityCurve.push({ time: lastCandle.time, value: equity });
  }

  const wins = trades.filter((t) => t.pnlPct > 0);
  const losses = trades.filter((t) => t.pnlPct <= 0);
  const grossWin = wins.reduce((s, t) => s + t.pnlPct, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlPct, 0));
  let peak = 100;
  let maxDd = 0;
  for (const pt of [{ time: 0, value: 100 }, ...equityCurve]) {
    peak = Math.max(peak, pt.value);
    maxDd = Math.max(maxDd, ((peak - pt.value) / peak) * 100);
  }
  const longs = trades.filter((t) => t.direction === 'LONG');
  const shorts = trades.filter((t) => t.direction === 'SHORT');

  return {
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
    netReturnPct: equity - 100,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    maxDrawdownPct: maxDd,
    avgWinPct: wins.length ? grossWin / wins.length : 0,
    avgLossPct: losses.length ? grossLoss / losses.length : 0,
    avgRr: trades.length ? wins.length / Math.max(1, losses.length) : 0,
    totalFeesPct: trades.reduce((s, t) => s + settings.feeBps / 100 + settings.slippageBps / 100, 0),
    totalFundingPct: fundingPct > 0
      ? trades.reduce((s, t) => s + fundingPerCandlePct * t.barsHeld, 0)
      : null,
    longTrades: longs.length,
    shortTrades: shorts.length,
    longWinRate: longs.length ? (longs.filter((t) => t.pnlPct > 0).length / longs.length) * 100 : 0,
    shortWinRate: shorts.length ? (shorts.filter((t) => t.pnlPct > 0).length / shorts.length) * 100 : 0,
    trades,
    equity: equityCurve,
  };
}

function computeRealized(p: NonNullable<ReturnType<typeof runBacktest>['trades'] extends never ? never : { remaining: number; entry: number; direction: 'LONG' | 'SHORT'; tpsHit: number; riskPerUnit: number }>, settings: BacktestSettings): number {
  // approximate realized pnl across partial fills
  const captured = 1 - p.remaining;
  const avgTp = [1.5, 2.5, 3.5, 5].slice(0, p.tpsHit);
  const gains = avgTp.reduce((s, m, idx) => {
    const frac = idx === 0 ? 0.4 : idx === 1 ? 0.3 : idx === 2 ? 0.2 : 0.1;
    return s + m * frac;
  }, 0);
  const dirMult = p.direction === 'LONG' ? 1 : -1;
  return captured > 0 ? ((gains * p.riskPerUnit) / p.entry) * 100 * dirMult * (captured / Math.max(captured, 1)) : 0;
}

export interface OosResult {
  inSample: BacktestResult;
  outOfSample: BacktestResult;
  inSampleFrom: number;
  inSampleTo: number;
  outOfSampleFrom: number;
  outOfSampleTo: number;
  splitIndex: number;
}

/** Split chronologically: first 70% in-sample (development), last 30% out-of-sample (unseen). */
export function runOutOfSample(candles: Candle[], marketType: MarketType, settings: BacktestSettings = DEFAULT_BACKTEST): OosResult {
  const splitIndex = Math.floor(candles.length * 0.7);
  const inSample = candles.slice(0, splitIndex);
  const outOfSample = candles.slice(splitIndex - 200); // overlap warmup only
  const isRes = runBacktest(inSample, marketType, settings);
  const oosRes = runBacktest(outOfSample, marketType, settings);
  return {
    inSample: isRes,
    outOfSample: oosRes,
    inSampleFrom: inSample[0]?.time ?? 0,
    inSampleTo: inSample[inSample.length - 1]?.time ?? 0,
    outOfSampleFrom: candles[splitIndex]?.time ?? 0,
    outOfSampleTo: candles[candles.length - 1]?.time ?? 0,
    splitIndex,
  };
}
