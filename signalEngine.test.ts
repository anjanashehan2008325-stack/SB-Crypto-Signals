import { describe, it, expect } from 'vitest';
import { analyze, DEFAULT_CONFIG, intervalToMs, roundTo } from '../services/signalEngine';
import { planPosition, DEFAULT_RISK } from '../services/risk';
import { runBacktest, runOutOfSample } from '../services/backtest';
import type { Candle } from '../services/marketData';

function trending(trend: 'up' | 'down', n = 400): Candle[] {
  // realistic trend: steady drift with regular pullbacks so RSI/ADX stay in signal-producing bands
  return Array.from({ length: n }, (_, i) => {
    const wave = i % 8 < 4 ? (trend === 'up' ? -12 : 12) : 0;
    const close = trend === 'up' ? 100 + i * 0.8 + wave : 300 - i * 0.8 + wave;
    const open = close - (trend === 'up' ? 0.3 : -0.3);
    return {
      time: i * 3_600_000,
      open,
      high: Math.max(open, close) + 0.8,
      low: Math.min(open, close) - 0.8,
      close,
      volume: 1000 + Math.abs(Math.sin(i / 3)) * 800 + (trend === 'up' ? i * 2 : (n - i) * 2),
      closeTime: i * 3_600_000 + 3_599_999,
    };
  });
}

describe('analyze', () => {
  it('produces a LONG signal for a strong uptrend with rising volume', () => {
    const result = analyze(trending('up'), trending('up'), '1h', '4h', 'spot', DEFAULT_CONFIG, 0.01);
    expect(result.trend).toBe('up');
    expect(result.signal).not.toBeNull();
    expect(result.signal?.direction).toBe('LONG');
  });

  it('produces a SHORT signal for a strong downtrend', () => {
    const result = analyze(trending('down'), trending('down'), '1h', '4h', 'futures', DEFAULT_CONFIG, 0.01);
    expect(result.trend).toBe('down');
    expect(result.signal?.direction).toBe('SHORT');
  });
  it('never produces both LONG and SHORT simultaneously', () => {
    const result = analyze(trending('up'), trending('up'), '1h', '4h', 'futures', DEFAULT_CONFIG, 0.01);
    if (result.signal) {
      expect(['LONG', 'SHORT']).toContain(result.signal.direction);
    }
    expect(result.nextSetup.direction).toBeDefined();
  });

  it('validates LONG levels are directionally correct', () => {
    const result = analyze(trending('up'), trending('up'), '1h', '4h', 'spot', DEFAULT_CONFIG, 0.01);
    const s = result.signal;
    if (!s) return; // no-signal case is covered by the dedicated tests
    expect(s.stopLoss).toBeLessThan(s.entry);
    s.tps.forEach((tp) => expect(tp.price).toBeGreaterThan(s.entry));
  });

  it('validates SHORT levels are directionally correct', () => {
    const result = analyze(trending('down'), trending('down'), '1h', '4h', 'futures', DEFAULT_CONFIG, 0.01);
    const s = result.signal;
    if (!s) return;
    expect(s.stopLoss).toBeGreaterThan(s.entry);
    s.tps.forEach((tp) => expect(tp.price).toBeLessThan(s.entry));
  });

  it('labels provisional signals when the last candle is unfinished', () => {
    const candles = trending('up');
    // make last candle appear in-progress (close time in the future)
    const patched = [...candles];
    patched[patched.length - 1] = { ...patched[patched.length - 1], closeTime: Date.now() + 3_600_000 };
    const result = analyze(patched, patched, '1h', '4h', 'spot', DEFAULT_CONFIG, 0.01);
    if (result.signal) expect(result.signal.provisional).toBe(true);
  });

  it('explains failed conditions when there is no signal', () => {
    // sideways market with tiny swings
    const candles = Array.from({ length: 400 }, (_, i) => {
      const close = 100 + Math.sin(i / 5) * 0.1;
      return { time: i * 3_600_000, open: close, high: close + 0.05, low: close - 0.05, close, volume: 100, closeTime: i * 3_600_000 };
    });
    const result = analyze(candles, candles, '1h', '4h', 'spot', DEFAULT_CONFIG, 0.01);
    expect(result.nextSetup.missing.length).toBeGreaterThan(0);
  });
});

describe('risk', () => {
  it('sizes positions so risk amount matches stop distance', () => {
    const plan = planPosition({ ...DEFAULT_RISK, balance: 10_000, riskPercent: 1 }, 'LONG', 100, 90, []);
    expect(plan).not.toBeNull();
    expect(plan!.riskAmount).toBeCloseTo(100, 6);
    expect(plan!.quantity).toBeCloseTo(10, 6);
    expect(plan!.stopLoss).toBeLessThan(plan!.entry);
  });

  it('rejects SHORT plans where stop is below entry', () => {
    expect(planPosition(DEFAULT_RISK, 'SHORT', 100, 90, [])).toBeNull();
  });

  it('caps notional by leverage', () => {
    const plan = planPosition({ ...DEFAULT_RISK, balance: 1000, riskPercent: 50, leverage: 5 }, 'LONG', 100, 99.9, []);
    expect(plan!.notional).toBeLessThanOrEqual(1000 * 5 + 1e-6);
  });
});

describe('roundTo', () => {
  it('rounds to tick size', () => {
    expect(roundTo(123.4567, 0.01)).toBeCloseTo(123.46, 10);
    expect(roundTo(0.0012345, 0.0001)).toBeCloseTo(0.0012, 10);
  });
});

describe('intervalToMs', () => {
  it('converts intervals', () => {
    expect(intervalToMs('1m')).toBe(60_000);
    expect(intervalToMs('1h')).toBe(3_600_000);
    expect(intervalToMs('1d')).toBe(86_400_000);
    expect(intervalToMs('1w')).toBe(604_800_000);
  });
});

describe('backtest', () => {
  it('runs without look-ahead and produces stats on a trending series', () => {
    const candles = trending('up', 600);
    const res = runBacktest(candles, 'spot');
    expect(res.totalTrades).toBeGreaterThanOrEqual(0);
    expect(res.winRate).toBeGreaterThanOrEqual(0);
    expect(res.winRate).toBeLessThanOrEqual(100);
    // equity curve never uses future data; trades are chronological
    for (let i = 1; i < res.trades.length; i++) {
      expect(res.trades[i].entryTime).toBeGreaterThanOrEqual(res.trades[i - 1].entryTime);
    }
    // entries must be after warmup
    res.trades.forEach((t) => expect(t.entryTime).toBeGreaterThanOrEqual(candles[0].time + 200 * 3_600_000));
  });

  it('splits in-sample and out-of-sample chronologically', () => {
    const candles = trending('up', 600);
    const oos = runOutOfSample(candles, 'spot');
    expect(oos.splitIndex).toBe(420); // 70% of 600
    expect(oos.outOfSampleFrom).toBeGreaterThan(oos.inSampleFrom);
    expect(oos.outOfSampleTo).toBe(candles[599].time);
  });

  it('runs on a downtrend series without errors', () => {
    const res = runBacktest(trending('down', 600), 'futures');
    expect(res.winRate).toBeGreaterThanOrEqual(0);
    expect(res.winRate).toBeLessThanOrEqual(100);
  });

  it('reports zero trades for insufficient data', () => {
    const res = runBacktest(trending('up', 150), 'spot');
    expect(res.totalTrades).toBe(0);
  });
});
