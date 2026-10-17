import { describe, it, expect } from 'vitest';
import { sma, ema, rsi, adx, atr, swingPoints, validateCandles } from '../services/indicators';
import type { Candle } from '../services/marketData';

function makeCloses(values: number[]): Candle[] {
  return values.map((close, i) => ({
    time: i * 60_000,
    open: close,
    high: close * 1.01,
    low: close * 0.99,
    close,
    volume: 100,
    closeTime: i * 60_000 + 59_999,
  }));
}

describe('sma', () => {
  it('computes the mean over the window', () => {
    const out = sma([1, 2, 3, 4, 5], 3);
    expect(out[1]).toBeNull();
    expect(out[2]).toBe(2);
    expect(out[4]).toBe(4);
  });
});

describe('ema', () => {
  it('seeds with SMA then applies the multiplier', () => {
    const out = ema([2, 4, 6, 8], 2);
    expect(out[0]).toBeNull();
    expect(out[1]).toBe(3); // (2+4)/2
    // k = 2/3
    expect(out[2]).toBeCloseTo(6 * (2 / 3) + 3 * (1 / 3), 10);
    expect(out[3]).toBeCloseTo(8 * (2 / 3) + (out[2] as number) * (1 / 3), 10);
  });

  it('returns nulls when there is insufficient data', () => {
    const out = ema([1, 2], 5);
    expect(out.every((v) => v === null)).toBe(true);
  });
});

describe('rsi', () => {
  it('returns 100 in a pure uptrend', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    const out = rsi(closes, 14);
    expect(out[out.length - 1]).toBe(100);
  });

  it('returns 0 in a pure downtrend', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 - i);
    const out = rsi(closes, 14);
    expect(out[out.length - 1]).toBe(0);
  });

  it('returns nulls before the period completes', () => {
    const out = rsi([1, 2, 3, 4, 5], 14);
    expect(out.every((v) => v === null)).toBe(true);
  });
});

describe('adx', () => {
  it('produces high ADX in a strong trend', () => {
    const candles = Array.from({ length: 100 }, (_, i) => {
      const close = 100 + i * 1.5;
      return { time: i * 60_000, open: close - 1, high: close + 1, low: close - 2, close, volume: 10, closeTime: i * 60_000 };
    });
    const out = adx(candles, 14);
    const last = out[out.length - 1];
    expect(last.adx).not.toBeNull();
    expect(last.adx as number).toBeGreaterThan(25);
    expect(last.plusDi as number).toBeGreaterThan(last.minusDi as number);
  });

  it('returns all-null arrays for insufficient data', () => {
    const out = adx(makeCloses([1, 2, 3]), 14);
    expect(out.every((p) => p.adx === null)).toBe(true);
  });
});

describe('atr', () => {
  it('equals the average true range after the period', () => {
    const candles = makeCloses([10, 10, 10, 10, 10, 10, 10]);
    const out = atr(candles, 5);
    expect(out[4]).toBeNull();
    expect(out[5]).toBeCloseTo(0.2, 6);
    expect(out[6]).toBeCloseTo(0.2, 6);
  });

  it('returns nulls for insufficient data', () => {
    const out = atr(makeCloses([1, 2]), 14);
    expect(out.every((v) => v === null)).toBe(true);
  });
});

describe('swingPoints', () => {
  it('detects a clear swing high and low', () => {
    const candles = makeCloses([1, 2, 3, 4, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).map((c, i) => ({
      ...c,
      high: c.close + 0.5,
      low: c.close - 0.5,
      time: i * 60_000,
    }));
    const points = swingPoints(candles, 2, 2);
    expect(points.some((p) => p.type === 'high' && p.index === 4)).toBe(true);
    expect(points.some((p) => p.type === 'low' && p.index === 8)).toBe(true);
  });
});

describe('validateCandles', () => {
  it('rejects candles with high < low', () => {
    const bad = [{ time: 0, open: 5, high: 4, low: 6, close: 5, volume: 1, closeTime: 1 }];
    expect(validateCandles(bad)).toBe(false);
  });

  it('accepts well-formed candles', () => {
    expect(validateCandles(makeCloses([1, 2, 3]))).toBe(true);
  });
});
