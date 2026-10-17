import type { Candle } from './marketData';

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  const k = 2 / (period + 1);
  let prev: number | null = null;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      sum += values[i];
      out.push(null);
      continue;
    }
    if (prev === null) {
      sum += values[i];
      prev = sum / period;
    } else {
      prev = values[i] * k + prev * (1 - k);
    }
    out.push(prev);
  }
  return out;
}

export function rsi(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [null];
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    if (i <= period) {
      avgGain += gain / period;
      avgLoss += loss / period;
      out.push(i === period ? computeRsi(avgGain, avgLoss) : null);
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      out.push(computeRsi(avgGain, avgLoss));
    }
  }
  return out;
}

function computeRsi(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export interface AdxPoint { adx: number | null; plusDi: number | null; minusDi: number | null }

export function adx(candles: Candle[], period: number): AdxPoint[] {
  const n = candles.length;
  const out: AdxPoint[] = Array.from({ length: n }, () => ({ adx: null, plusDi: null, minusDi: null }));
  if (n < period * 2 + 1) return out;

  const trs: number[] = [0];
  const plusDMs: number[] = [0];
  const minusDMs: number[] = [0];
  for (let i = 1; i < n; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close)));
    const up = c.high - prev.high;
    const down = prev.low - c.low;
    plusDMs.push(up > down && up > 0 ? up : 0);
    minusDMs.push(down > up && down > 0 ? down : 0);
  }

  const wilder = (arr: number[]): number[] => {
    const smoothed: number[] = [];
    let acc = 0;
    for (let i = 0; i < arr.length; i++) {
      if (i < period) { acc += arr[i]; smoothed.push(i === period - 1 ? acc : 0); continue; }
      acc = acc - acc / period + arr[i];
      smoothed.push(acc);
    }
    return smoothed;
  };

  const trS = wilder(trs);
  const plusS = wilder(plusDMs);
  const minusS = wilder(minusDMs);

  const dxs: (number | null)[] = Array.from({ length: n }, () => null);
  for (let i = period - 1; i < n; i++) {
    if (trS[i] === 0) { out[i] = { adx: null, plusDi: 0, minusDi: 0 }; continue; }
    const plusDi = (100 * plusS[i]) / trS[i];
    const minusDi = (100 * minusS[i]) / trS[i];
    const sum = plusDi + minusDi;
    const dx = sum === 0 ? 0 : (100 * Math.abs(plusDi - minusDi)) / sum;
    out[i] = { adx: null, plusDi, minusDi };
    dxs[i] = dx;
  }

  let adxAcc = 0;
  let adxPrev: number | null = null;
  let count = 0;
  for (let i = period - 1; i < n; i++) {
    if (dxs[i] === null) continue;
    count++;
    if (count <= period) {
      adxAcc += dxs[i] as number;
      if (count === period) {
        adxPrev = adxAcc / period;
        out[i].adx = adxPrev;
      }
      continue;
    }
    adxPrev = ((adxPrev as number) * (period - 1) + (dxs[i] as number)) / period;
    out[i].adx = adxPrev;
  }
  return out;
}

export function atr(candles: Candle[], period: number): (number | null)[] {
  const out: (number | null)[] = [null];
  let prevAtr: number | null = null;
  let acc = 0;
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
    if (i <= period) {
      acc += tr;
      out.push(i === period ? acc / period : null);
      if (i === period) prevAtr = acc / period;
    } else {
      prevAtr = ((prevAtr as number) * (period - 1) + tr) / period;
      out.push(prevAtr);
    }
  }
  return out;
}

export interface SwingPoint { index: number; price: number; type: 'high' | 'low' }

export function swingPoints(candles: Candle[], left = 3, right = 3): SwingPoint[] {
  const points: SwingPoint[] = [];
  for (let i = left; i < candles.length - right; i++) {
    const c = candles[i];
    let isHigh = true;
    let isLow = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (candles[j].high >= c.high) isHigh = false;
      if (candles[j].low <= c.low) isLow = false;
    }
    if (isHigh) points.push({ index: i, price: c.high, type: 'high' });
    if (isLow) points.push({ index: i, price: c.low, type: 'low' });
  }
  return points;
}

export interface SRLevel { price: number; touches: number; type: 'support' | 'resistance' }

export function supportResistance(candles: Candle[], atrVal: number | null, lookback = 150): SRLevel[] {
  const recent = candles.slice(-lookback);
  const sw = swingPoints(recent, 2, 2);
  const tol = atrVal && atrVal > 0 ? atrVal * 0.5 : 0;
  const clusters: { price: number; touches: number; isHigh: boolean[] }[] = [];
  for (const p of sw) {
    const c = clusters.find((cl) => tol === 0 ? cl.price === p.price : Math.abs(cl.price - p.price) <= tol);
    if (c) {
      const total = c.touches * c.price + p.price;
      c.touches += 1;
      c.price = total / c.touches;
      c.isHigh.push(p.type === 'high');
    } else {
      clusters.push({ price: p.price, touches: 1, isHigh: [p.type === 'high'] });
    }
  }
  const lastClose = candles[candles.length - 1].close;
  return clusters
    .map((cl) => ({
      price: cl.price,
      touches: cl.touches,
      type: (cl.price < lastClose ? 'support' : 'resistance') as 'support' | 'resistance',
    }))
    .filter((l) => l.touches >= 2)
    .sort((a, b) => b.touches - a.touches)
    .slice(0, 6);
}

export function trendDirection(candles: Candle[]): 'up' | 'down' | 'sideways' {
  if (candles.length < 30) return 'sideways';
  const closes = candles.map((c) => c.close);
  const e50 = ema(closes, Math.min(50, Math.floor(closes.length / 2)));
  const last = e50[e50.length - 1];
  const prior = e50[Math.max(0, e50.length - 11)];
  if (last === null || prior === null) return 'sideways';
  const change = ((last - prior) / Math.abs(prior)) * 100;
  if (change > 0.5) return 'up';
  if (change < -0.5) return 'down';
  return 'sideways';
}

export function validateCandles(candles: Candle[]): boolean {
  return Array.isArray(candles) && candles.length > 0 && candles.every(
    (c) => Number.isFinite(c.time) && Number.isFinite(c.open) && Number.isFinite(c.high) &&
      Number.isFinite(c.low) && Number.isFinite(c.close) && c.high >= c.low && c.high >= c.open &&
      c.high >= c.close && c.low <= c.open && c.low <= c.close && c.volume >= 0,
  );
}
