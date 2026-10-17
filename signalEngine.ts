import type { Candle, MarketType } from './marketData';
import { adx as calcAdx, atr as calcAtr, ema, rsi as calcRsi, swingPoints, supportResistance, trendDirection } from './indicators';

export type Direction = 'LONG' | 'SHORT';
export type SignalStatus = 'confirmed' | 'provisional' | 'none' | 'invalidated';

export interface EngineConfig {
  adxThreshold: number;
  rsiLongMax: number;
  rsiShortMin: number;
  volumeFactor: number;
  requireHtf: boolean;
  requireVolume: boolean;
  minSwings: number;
}

export const DEFAULT_CONFIG: EngineConfig = {
  adxThreshold: 22,
  rsiLongMax: 70,
  rsiShortMin: 30,
  volumeFactor: 1.05,
  requireHtf: true,
  requireVolume: true,
  minSwings: 4,
};

export interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
  weight: 'required' | 'supporting';
}

export interface TpLevel { price: number; rr: number }

export interface Signal {
  direction: Direction;
  status: SignalStatus;
  entry: number;
  stopLoss: number;
  tps: TpLevel[];
  rr: number;
  timeframe: string;
  trend: 'up' | 'down' | 'sideways';
  strength: 'strong' | 'moderate' | 'weak';
  checks: CheckResult[];
  createdAt: number;
  updatedAt: number;
  provisional: boolean;
  htfConfirmed: boolean;
  invalidation: string;
}

export interface Analysis {
  price: number;
  ema50: number | null;
  ema200: number | null;
  rsi: number | null;
  adx: number | null;
  plusDi: number | null;
  minusDi: number | null;
  atr: number | null;
  volumeRatio: number | null;
  trend: 'up' | 'down' | 'sideways';
  htfTrend: 'up' | 'down' | 'sideways';
  supports: number[];
  resistances: number[];
  signal: Signal | null;
  nextSetup: NextSetup;
}

export interface NextSetup {
  direction: Direction;
  status: 'WAITING FOR SETUP' | 'FORMING' | 'AWAITING CONFIRMATION' | 'CONFIRMED' | 'INVALIDATED';
  conditionsPassed: number;
  conditionsTotal: number;
  missing: string[];
  entryZone: [number, number] | null;
  stopLoss: number | null;
  tps: TpLevel[];
  htfConfirmed: boolean;
  invalidation: string;
  note: string;
}

const HTF_MAP: Record<string, string> = {
  '1m': '15m', '3m': '30m', '5m': '30m', '15m': '1h', '30m': '4h',
  '1h': '4h', '2h': '12h', '4h': '1d', '6h': '1d', '12h': '1d', '1d': '1w', '1w': '1w',
};

export function htfFor(interval: string): string {
  return HTF_MAP[interval] ?? '1d';
}

interface EvalContext {
  candles: Candle[];
  closes: number[];
  last: Candle;
  price: number;
  ema50: number | null;
  ema200: number | null;
  rsi: number | null;
  adx: number | null;
  plusDi: number | null;
  minusDi: number | null;
  atr: number | null;
  volumeRatio: number | null;
  trend: 'up' | 'down' | 'sideways';
  supports: number[];
  resistances: number[];
  htfTrend: 'up' | 'down' | 'sideways';
}

function evaluateDirectional(ctx: EvalContext, dir: Direction, cfg: EngineConfig): CheckResult[] {
  const long = dir === 'LONG';
  const checks: CheckResult[] = [];
  const push = (name: string, passed: boolean, detail: string, weight: 'required' | 'supporting' = 'required') =>
    checks.push({ name, passed, detail, weight });

  // EMA alignment
  if (ctx.ema50 !== null && ctx.ema200 !== null) {
    const aligned = long ? ctx.ema50 > ctx.ema200 : ctx.ema50 < ctx.ema200;
    push(
      'EMA alignment',
      aligned,
      long ? `EMA50 ${ctx.ema50 > ctx.ema200 ? 'above' : 'below'} EMA200 — ${aligned ? 'bullish' : 'bearish'} structure` : `EMA50 ${ctx.ema50 < ctx.ema200 ? 'below' : 'above'} EMA200 — ${aligned ? 'bearish' : 'bullish'} structure`,
    );
  } else {
    push('EMA alignment', false, 'Not enough candle history for EMA200 (need ~200 candles).');
  }

  // Price vs EMA50
  if (ctx.ema50 !== null) {
    const above = ctx.price > ctx.ema50;
    push('Price vs EMA50', long ? above : !above, `Price is ${above ? 'above' : 'below'} EMA50 (${fmt(ctx.ema50)}).`, 'supporting');
  }

  // Trend direction
  push('Market structure trend', ctx.trend === (long ? 'up' : 'down'), `Structure trend is ${ctx.trend}.`);

  // RSI
  if (ctx.rsi !== null) {
    const ok = long ? ctx.rsi < cfg.rsiLongMax : ctx.rsi > cfg.rsiShortMin;
    push('RSI momentum', ok, `RSI ${ctx.rsi.toFixed(1)} ${long ? 'below overbought' : 'above oversold'} threshold.`);
  } else {
    push('RSI momentum', false, 'RSI unavailable.');
  }

  // ADX strength
  if (ctx.adx !== null) {
    push('ADX trend strength', ctx.adx >= cfg.adxThreshold, `ADX ${ctx.adx.toFixed(1)} vs threshold ${cfg.adxThreshold}.`);
  } else {
    push('ADX trend strength', false, 'ADX unavailable (insufficient data).');
  }

  // DMI directional bias
  if (ctx.plusDi !== null && ctx.minusDi !== null) {
    const ok = long ? ctx.plusDi > ctx.minusDi : ctx.minusDi > ctx.plusDi;
    push('DMI directional bias', ok, `+DI ${ctx.plusDi.toFixed(1)} / -DI ${ctx.minusDi.toFixed(1)}.`);
  } else {
    push('DMI directional bias', false, 'DMI unavailable.');
  }

  // Volume
  if (ctx.volumeRatio !== null) {
    const ok = ctx.volumeRatio >= cfg.volumeFactor;
    push('Volume confirmation', ok, `Current volume ${ctx.volumeRatio.toFixed(2)}x the 20-candle average.`, cfg.requireVolume ? 'required' : 'supporting');
  } else {
    push('Volume confirmation', false, 'Volume data insufficient.', cfg.requireVolume ? 'required' : 'supporting');
  }

  // ATR / volatility
  if (ctx.atr !== null && ctx.price > 0) {
    const atrPct = (ctx.atr / ctx.price) * 100;
    push('Volatility (ATR)', atrPct >= 0.15 && atrPct <= 15, `ATR is ${atrPct.toFixed(2)}% of price.`, 'supporting');
  }

  // HTF confirmation
  push('Higher-timeframe trend', !cfg.requireHtf || ctx.htfTrend === (long ? 'up' : 'down'), `HTF trend is ${ctx.htfTrend}.`, cfg.requireHtf ? 'required' : 'supporting');

  return checks;
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1000) return n.toFixed(2);
  if (Math.abs(n) >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

function passedRequired(checks: CheckResult[]): boolean {
  return checks.filter((c) => c.weight === 'required').every((c) => c.passed);
}

function passedCount(checks: CheckResult[]): number {
  return checks.filter((c) => c.passed).length;
}

function strengthOf(checks: CheckResult[]): Signal['strength'] {
  const total = checks.length || 1;
  const pct = passedCount(checks) / total;
  if (pct >= 0.85) return 'strong';
  if (pct >= 0.65) return 'moderate';
  return 'weak';
}

function lastCandleClosed(candles: Candle[], interval: string): boolean {
  const last = candles[candles.length - 1];
  if (last.closeTime > 0) return Date.now() >= last.closeTime;
  return Date.now() >= last.time + intervalToMs(interval);
}

export function intervalToMs(interval: string): number {
  const n = parseInt(interval, 10);
  const unit = interval[interval.length - 1];
  if (unit === 'm') return n * 60_000;
  if (unit === 'h') return n * 3_600_000;
  if (unit === 'd') return n * 86_400_000;
  if (unit === 'w') return n * 7 * 86_400_000;
  return 60_000;
}

function buildLevels(dir: Direction, entry: number, atrVal: number, recent: Candle[], tickSize: number): { stopLoss: number; tps: TpLevel[]; rr: number } | null {
  const recentSwings = swingPoints(recent, 2, 2);
  const lows = recentSwings.filter((s) => s.type === 'low').map((s) => s.price);
  const highs = recentSwings.filter((s) => s.type === 'high').map((s) => s.price);
  if (dir === 'LONG') {
    const swingLow = lows.length ? Math.min(...lows.slice(-5)) : entry - atrVal * 2;
    const stop = Math.min(swingLow - atrVal * 0.5, entry - atrVal * 1.2);
    if (stop >= entry) return null;
    const risk = entry - stop;
    const mults = [1.5, 2.5, 3.5, 5];
    const tps = mults.map((m) => ({ price: entry + risk * m, rr: m }));
    return { stopLoss: roundTo(stop, tickSize), tps: tps.map((t) => ({ ...t, price: roundTo(t.price, tickSize) })), rr: 1.5 };
  }
  const swingHigh = highs.length ? Math.max(...highs.slice(-5)) : entry + atrVal * 2;
  const stop = Math.max(swingHigh + atrVal * 0.5, entry + atrVal * 1.2);
  if (stop <= entry) return null;
  const risk = stop - entry;
  const mults = [1.5, 2.5, 3.5, 5];
  const tps = mults.map((m) => ({ price: entry - risk * m, rr: m }));
  return { stopLoss: roundTo(stop, tickSize), tps: tps.map((t) => ({ ...t, price: roundTo(t.price, tickSize) })), rr: 1.5 };
}

export function roundTo(value: number, tick: number): number {
  if (!tick || tick <= 0) return value;
  const decimals = Math.max(0, Math.round(-Math.log10(tick)));
  return Number((Math.round(value / tick) * tick).toFixed(decimals));
}

export function analyze(
  candles: Candle[],
  htfCandles: Candle[],
  interval: string,
  htfInterval: string,
  marketType: MarketType,
  cfg: EngineConfig = DEFAULT_CONFIG,
  tickSize = 0.01,
): Analysis {
  const closes = candles.map((c) => c.close);
  const last = candles[candles.length - 1];
  const price = last.close;

  const e50arr = ema(closes, 50);
  const e200arr = ema(closes, 200);
  const rsiArr = calcRsi(closes, 14);
  const adxArr = calcAdx(candles, 14);
  const atrArr = calcAtr(candles, 14);

  const ema50 = e50arr[e50arr.length - 1];
  const ema200 = e200arr[e200arr.length - 1];
  const rsiVal = rsiArr[rsiArr.length - 1];
  const adxVal = adxArr[adxArr.length - 1];
  const atrVal = atrArr[atrArr.length - 1];

  const volSlice = candles.slice(-21);
  const volAvg = volSlice.slice(0, -1).reduce((s, c) => s + c.volume, 0) / Math.max(1, volSlice.length - 1);
  const volumeRatio = volAvg > 0 ? volSlice[volSlice.length - 1].volume / volAvg : null;

  const sr = supportResistance(candles, atrVal);
  const trend = trendDirection(candles);
  const htfTrend = htfCandles.length >= 30 ? trendDirection(htfCandles) : 'sideways';

  const ctx: EvalContext = {
    candles, closes, last, price,
    ema50, ema200, rsi: rsiVal, adx: adxVal?.adx ?? null,
    plusDi: adxVal?.plusDi ?? null, minusDi: adxVal?.minusDi ?? null,
    atr: atrVal, volumeRatio, trend,
    supports: sr.filter((l) => l.type === 'support').map((l) => l.price),
    resistances: sr.filter((l) => l.type === 'resistance').map((l) => l.price),
    htfTrend,
  };

  const candleClosed = lastCandleClosed(candles, interval);
  const provisional = !candleClosed;

  const longChecks = evaluateDirectional(ctx, 'LONG', cfg);
  const shortChecks = evaluateDirectional(ctx, 'SHORT', cfg);
  const longOk = passedRequired(longChecks);
  const shortOk = passedRequired(shortChecks);

  let signal: Signal | null = null;
  const now = Date.now();

  if (longOk && !shortOk) {
    signal = buildSignal('LONG', ctx, longChecks, interval, marketType, tickSize, provisional, now);
  } else if (shortOk && !longOk) {
    signal = buildSignal('SHORT', ctx, shortChecks, interval, marketType, tickSize, provisional, now);
  }

  const nextSetup = buildNextSetup(ctx, longChecks, shortChecks, interval, tickSize, provisional, now);

  return {
    price, ema50, ema200, rsi: rsiVal, adx: adxVal?.adx ?? null,
    plusDi: adxVal?.plusDi ?? null, minusDi: adxVal?.minusDi ?? null,
    atr: atrVal, volumeRatio, trend, htfTrend,
    supports: ctx.supports, resistances: ctx.resistances,
    signal, nextSetup,
  };
}

function buildSignal(
  dir: Direction,
  ctx: EvalContext,
  checks: CheckResult[],
  interval: string,
  marketType: MarketType,
  tickSize: number,
  provisional: boolean,
  now: number,
): Signal {
  const atrVal = ctx.atr ?? ctx.price * 0.02;
  const levels = buildLevels(dir, ctx.price, atrVal, ctx.candles.slice(-80), tickSize);
  const failed = checks.filter((c) => !c.passed).map((c) => c.name);
  return {
    direction: dir,
    status: 'confirmed',
    entry: ctx.price,
    stopLoss: levels?.stopLoss ?? ctx.price,
    tps: levels?.tps ?? [],
    rr: levels?.rr ?? 1.5,
    timeframe: interval,
    trend: ctx.trend,
    strength: strengthOf(checks),
    checks,
    createdAt: now,
    updatedAt: now,
    provisional,
    htfConfirmed: ctx.htfTrend === (dir === 'LONG' ? 'up' : 'down'),
    invalidation: failed.length ? `Invalid if: ${failed.join(', ')} conditions turn against the trade; or price closes beyond the stop-loss.` : 'Invalid if price closes beyond the stop-loss.',
  };
}

function buildNextSetup(
  ctx: EvalContext,
  longChecks: CheckResult[],
  shortChecks: CheckResult[],
  interval: string,
  tickSize: number,
  provisional: boolean,
  now: number,
): NextSetup {
  const longScore = passedCount(longChecks);
  const shortScore = passedCount(shortChecks);
  const dir: Direction = longScore >= shortScore ? 'LONG' : 'SHORT';
  const checks = dir === 'LONG' ? longChecks : shortChecks;
  const missing = checks.filter((c) => !c.passed).map((c) => `${c.name}: ${c.detail}`);
  const passed = passedCount(checks);
  const total = checks.length;
  const required = checks.filter((c) => c.weight === 'required');
  const allRequiredPass = required.every((c) => c.passed);

  let status: NextSetup['status'];
  if (allRequiredPass) status = 'CONFIRMED';
  else if (passed >= Math.ceil(total * 0.7)) status = 'AWAITING CONFIRMATION';
  else if (passed >= Math.ceil(total * 0.5)) status = 'FORMING';
  else status = 'WAITING FOR SETUP';

  const atrVal = ctx.atr ?? ctx.price * 0.02;
  const levels = buildLevels(dir, ctx.price, atrVal, ctx.candles.slice(-80), tickSize);

  return {
    direction: dir,
    status,
    conditionsPassed: passed,
    conditionsTotal: total,
    missing,
    entryZone: levels ? [roundTo(ctx.price - atrVal * 0.25, tickSize), roundTo(ctx.price + atrVal * 0.25, tickSize)] : null,
    stopLoss: levels?.stopLoss ?? null,
    tps: levels?.tps ?? [],
    htfConfirmed: ctx.htfTrend === (dir === 'LONG' ? 'up' : 'down'),
    invalidation: 'Invalidated if the opposing EMA alignment or DMI bias becomes dominant, or ADX falls further while price ranges.',
    note: provisional ? 'Based on the unfinished candle — provisional until the candle closes.' : 'Based on the last completed candle.',
  };
}
