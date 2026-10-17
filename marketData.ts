export interface Candle {
  time: number; // ms open time
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number; // ms close time
}

export type MarketType = 'spot' | 'futures';

export interface SymbolInfo {
  symbol: string;
  pair: string;
  base: string;
  quote: string;
  name: string;
  marketType: MarketType;
  price: number;
  priceChangePercent: number;
  volume: number; // quote volume 24h
  status: 'TRADING' | 'SETTLING' | 'UNKNOWN';
  tickSize: number;
  stepSize: number;
  minQty: number;
  minNotional: number;
}

export interface KlineOptions {
  symbol: string;
  interval: string;
  limit?: number;
  startTime?: number;
  endTime?: number;
  marketType: MarketType;
}

export class MarketDataError extends Error {
  code: 'network' | 'rate-limit' | 'invalid-symbol' | 'bad-response' | 'no-data';
  constructor(code: MarketDataError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

const SPOT_BASE = 'https://api.binance.com';
const FUTURES_BASE = 'https://fapi.binance.com';

function isValidNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

async function fetchJson(url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new MarketDataError('network', `Network error reaching exchange: ${err instanceof Error ? err.message : 'unknown'}`);
  }
  if (res.status === 429 || res.status === 418) {
    throw new MarketDataError('rate-limit', 'Exchange rate limit reached. Please wait a moment and retry.');
  }
  if (res.status === 400) {
    throw new MarketDataError('invalid-symbol', 'The exchange rejected this request (invalid symbol or parameters).');
  }
  if (!res.ok) {
    throw new MarketDataError('bad-response', `Exchange request failed (HTTP ${res.status}).`);
  }
  try {
    return await res.json();
  } catch {
    throw new MarketDataError('bad-response', 'Exchange returned malformed data.');
  }
}

function parseCandle(raw: unknown): Candle | null {
  if (!Array.isArray(raw) || raw.length < 6) return null;
  const [t, o, h, l, c, v, ct] = raw as (string | number)[];
  const time = Number(t);
  const open = Number(o);
  const high = Number(h);
  const low = Number(l);
  const close = Number(c);
  const volume = Number(v);
  const closeTime = Number(ct ?? 0);
  if (![time, open, high, low, close, volume].every(isValidNumber)) return null;
  if (high < low || high < open || high < close || low > open || low > close) return null;
  return { time, open, high, low, close, volume, closeTime };
}

export async function fetchKlines(opts: KlineOptions): Promise<Candle[]> {
  const base = opts.marketType === 'futures' ? FUTURES_BASE : SPOT_BASE;
  const params = new URLSearchParams({
    symbol: opts.symbol,
    interval: opts.interval,
    limit: String(opts.limit ?? 500),
  });
  if (opts.startTime) params.set('startTime', String(opts.startTime));
  if (opts.endTime) params.set('endTime', String(opts.endTime));
  const raw = await fetchJson(`${base}/api/v3/klines?${params}`.replace('/api/v3', opts.marketType === 'futures' ? '/fapi/v1' : '/api/v3'));
  if (!Array.isArray(raw)) throw new MarketDataError('bad-response', 'Unexpected kline response.');
  const candles = raw.map(parseCandle).filter((c): c is Candle => c !== null);
  if (candles.length === 0) throw new MarketDataError('no-data', 'No valid candles returned for this symbol.');
  return candles;
}

export async function fetchTicker24h(symbol: string, marketType: MarketType) {
  const base = marketType === 'futures' ? FUTURES_BASE : SPOT_BASE;
  const path = marketType === 'futures' ? '/fapi/v1/ticker/24hr?symbol=' : '/api/v3/ticker/24hr?symbol=';
  const raw = await fetchJson(`${base}${path}${encodeURIComponent(symbol)}`);
  if (!raw || typeof raw !== 'object') throw new MarketDataError('bad-response', 'Unexpected ticker response.');
  const t = raw as Record<string, unknown>;
  return {
    price: Number(t.lastPrice) || 0,
    priceChangePercent: Number(t.priceChangePercent) || 0,
    quoteVolume: Number(t.quoteVolume) || 0,
  };
}

export async function fetchExchangeInfo(marketType: MarketType) {
  const base = marketType === 'futures' ? FUTURES_BASE : SPOT_BASE;
  const path = marketType === 'futures' ? '/fapi/v1/exchangeInfo' : '/api/v3/exchangeInfo';
  return fetchJson(`${base}${path}`);
}

export interface FuturesContractInfo {
  fundingRate: number | null; // current 8h funding rate as a decimal, e.g. 0.0001
  nextFundingTime: number | null;
  openInterest: number | null; // base-asset contracts outstanding
}

export async function fetchFuturesContractInfo(symbol: string): Promise<FuturesContractInfo> {
  const out: FuturesContractInfo = { fundingRate: null, nextFundingTime: null, openInterest: null };
  try {
    const raw = await fetchJson(`${FUTURES_BASE}/fapi/v1/fundingRate?symbol=${encodeURIComponent(symbol)}&limit=1`);
    if (Array.isArray(raw) && raw.length > 0) {
      const row = raw[0] as Record<string, string>;
      const rate = Number(row.fundingRate);
      if (Number.isFinite(rate)) out.fundingRate = rate;
    }
  } catch { /* funding unavailable — displayed as N/A */ }
  try {
    const raw = await fetchJson(`${FUTURES_BASE}/fapi/v1/openInterest?symbol=${encodeURIComponent(symbol)}`);
    if (raw && typeof raw === 'object') {
      const oi = Number((raw as Record<string, string>).openInterest);
      if (Number.isFinite(oi)) out.openInterest = oi;
    }
  } catch { /* OI unavailable — displayed as N/A */ }
  return out;
}

export async function fetchFundingHistory(symbol: string, startTime: number, endTime: number): Promise<{ time: number; rate: number }[]> {
  const raw = await fetchJson(`${FUTURES_BASE}/fapi/v1/fundingRate?symbol=${encodeURIComponent(symbol)}&startTime=${startTime}&endTime=${endTime}&limit=1000`);
  if (!Array.isArray(raw)) return [];
  const out: { time: number; rate: number }[] = [];
  for (const r of raw as Record<string, string>[]) {
    const t = Number(r.fundingTime);
    const rate = Number(r.fundingRate);
    if (Number.isFinite(t) && Number.isFinite(rate)) out.push({ time: t, rate });
  }
  return out;
}

