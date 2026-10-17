import type { Analysis } from './signalEngine';
import type { MarketType } from './marketData';
import type { SimpleSignalView, SimpleLevels, NextSignalView, SimpleSignalKind } from '../components/SimpleSignalCards';
import { formatPrice } from '../components/SimpleSignalCards';

export function toSimpleSignal(a: Analysis, marketType: MarketType, timeframe: string, updatedAt: number, hasData: boolean): SimpleSignalView {
  if (!hasData || a.price <= 0) {
    return {
      kind: 'NO DATA',
      headline: 'Price data is unavailable. Try again.',
      sub: 'We could not reach the exchange for this coin.',
      timeframe, updatedAt, provisional: false,
      reason: [],
    };
  }

  const sig = a.signal;
  if (!sig) {
    const reason = plainReasons(a, 'WAIT');
    return {
      kind: 'WAIT',
      headline: 'No clear signal yet. Wait for better conditions.',
      sub: 'The numbers do not line up enough to suggest a trade right now.',
      timeframe, updatedAt, provisional: false,
      reason,
    };
  }

  const kind: SimpleSignalKind = marketType === 'futures'
    ? (sig.direction === 'LONG' ? 'LONG' : 'SHORT')
    : (sig.direction === 'LONG' ? 'BUY' : 'SELL');

  const headline = {
    BUY: 'The setup suggests a possible buying opportunity.',
    SELL: 'The setup suggests a possible selling opportunity.',
    LONG: 'The setup suggests the price may move up in Futures trading.',
    SHORT: 'The setup suggests the price may move down in Futures trading.',
  }[kind];

  const strengthWord = sig.strength === 'strong' ? 'Strong' : sig.strength === 'moderate' ? 'Moderate' : 'Weak';
  return {
    kind,
    headline,
    sub: `${strengthWord} signal · Trend: ${a.trend === 'up' ? 'moving up' : a.trend === 'down' ? 'moving down' : 'flat'}`,
    timeframe, updatedAt,
    provisional: sig.provisional,
    strength: strengthWord,
    reason: plainReasons(a, kind),
  };
}

function plainReasons(a: Analysis, kind: SimpleSignalKind): string[] {
  const out: string[] = [];
  const up = kind !== 'SELL' && kind !== 'SHORT' && kind !== 'WAIT' ? true : a.trend === 'up';

  if (a.trend !== 'sideways') {
    out.push(`Trend is moving ${a.trend === 'up' ? 'up' : 'down'}.`);
  } else {
    out.push('The price is moving sideways — no clear direction.');
  }

  if (a.ema50 !== null && a.ema200 !== null) {
    out.push(a.ema50 > a.ema200 ? 'The average price trend (EMA) points up.' : 'The average price trend (EMA) points down.');
  }

  if (a.rsi !== null) {
    if (a.rsi >= 70) out.push('The price may be overheated (RSI is high).');
    else if (a.rsi <= 30) out.push('The price may be oversold (RSI is low).');
    else out.push(up ? 'Buying pressure is present.' : 'Selling pressure is present.');
  }

  if (a.adx !== null) {
    out.push(a.adx >= 25 ? 'The trend is strong.' : a.adx >= 20 ? 'The trend is moderate.' : 'The trend is weak right now.');
  }

  if (a.volumeRatio !== null) {
    out.push(a.volumeRatio >= 1.05 ? 'Trading volume supports this move.' : 'Trading volume is normal.');
  }

  out.push(a.htfTrend === (kind === 'SELL' || kind === 'SHORT' ? 'down' : 'up')
    ? 'The higher timeframe confirms this direction.'
    : 'The higher timeframe does not confirm this signal.');
  return out.slice(0, 5);
}

export function toSimpleLevels(a: Analysis): SimpleLevels | null {
  const sig = a.signal;
  if (!sig || sig.tps.length === 0) return null;
  return {
    entryLabel: 'Entry Price',
    entry: formatPrice(sig.entry),
    stop: formatPrice(sig.stopLoss),
    targets: sig.tps.map((t) => formatPrice(t.price)),
  };
}

export function toNextSignal(a: Analysis, timeframe: string): NextSignalView {
  const n = a.nextSetup;
  const status = n.status === 'CONFIRMED' ? 'READY'
    : n.status === 'AWAITING CONFIRMATION' ? 'NEEDS CONFIRMATION'
    : n.status === 'FORMING' ? 'FORMING'
    : n.status === 'INVALIDATED' ? 'INVALID'
    : 'WAITING';

  const waitingFor = n.missing.map((m) => {
    if (m.startsWith('EMA alignment')) return 'Waiting for the price trend to line up.';
    if (m.startsWith('Price vs EMA')) return 'Waiting for the price to cross its average line.';
    if (m.startsWith('Market structure')) return 'Waiting for the trend to become clearer.';
    if (m.startsWith('RSI')) return 'Waiting for buying/selling pressure to settle.';
    if (m.startsWith('ADX')) return 'Waiting for the trend to become stronger.';
    if (m.startsWith('DMI')) return 'Waiting for the price to confirm the move.';
    if (m.startsWith('Volume')) return 'Waiting for more trading volume.';
    if (m.startsWith('Volatility')) return 'Waiting for calmer price movement.';
    if (m.startsWith('Higher-timeframe')) return 'Waiting for the bigger picture to agree.';
    return m;
  });

  const levels = n.entryZone && n.stopLoss !== null && n.tps.length > 0
    ? {
        entryLabel: 'Entry Price',
        entry: `${formatPrice(n.entryZone[0])} – ${formatPrice(n.entryZone[1])}`,
        stop: formatPrice(n.stopLoss),
        targets: n.tps.map((t) => formatPrice(t.price)),
      }
    : null;

  return {
    status,
    direction: n.direction === 'LONG' ? 'up' : 'down',
    waitingFor,
    levels,
    timeframe,
  };
}

export function marketStatusLine(analysis: Analysis): { label: string; tone: 'green' | 'red' | 'neutral'; text: string } {
  if (analysis.trend === 'up' && (analysis.adx ?? 0) >= 20) return { label: 'RISING', tone: 'green', text: 'Prices are generally moving up.' };
  if (analysis.trend === 'down' && (analysis.adx ?? 0) >= 20) return { label: 'FALLING', tone: 'red', text: 'Prices are generally moving down.' };
  return { label: 'CALM', tone: 'neutral', text: 'Prices are moving sideways. Good time to watch and wait.' };
}
