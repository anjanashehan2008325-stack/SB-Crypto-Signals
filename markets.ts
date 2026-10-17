import type { Candle, MarketType, SymbolInfo } from './marketData';
import { MarketDataError, fetchExchangeInfo, fetchKlines, fetchTicker24h } from './marketData';

export interface Market {
  key: string; // `${type}:${symbol}`
  type: MarketType;
  symbol: string;
  base: string;
  quote: string;
  name: string;
  status: string;
  tickSize: number;
  stepSize: number;
  minQty: number;
  minNotional: number;
}

interface TickerEntry {
  price: number;
  priceChangePercent: number;
  quoteVolume: number;
}

export const QUOTES = ['USDT', 'FDUSD', 'USDC', 'BTC', 'ETH', 'BNB'] as const;

export interface SearchFilters {
  query: string;
  marketType: MarketType | 'all';
  quote: string | 'all';
  minVolume: number;
}

export interface SearchResult extends TickerEntry {
  market: Market;
}

interface CacheEntry<T> {
  at: number;
  data: T;
}

let spotMarkets: CacheEntry<Market[]> | null = null;
let futuresMarkets: CacheEntry<Market[]> | null = null;
let spotTickers: CacheEntry<Map<string, TickerEntry>> | null = null;
let futuresTickers: CacheEntry<Map<string, TickerEntry>> | null = null;

const TTL = 15 * 60 * 1000;

const SPOT_NAMES: Record<string, string> = {
  BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', BNB: 'BNB', XRP: 'XRP', ADA: 'Cardano',
  DOGE: 'Dogecoin', AVAX: 'Avalanche', DOT: 'Polkadot', LINK: 'Chainlink', MATIC: 'Polygon',
  LTC: 'Litecoin', TRX: 'TRON', BCH: 'Bitcoin Cash', UNI: 'Uniswap', ATOM: 'Cosmos',
  NEAR: 'NEAR Protocol', APT: 'Aptos', ARB: 'Arbitrum', OP: 'Optimism', SUI: 'Sui',
  PEPE: 'Pepe', SHIB: 'Shiba Inu', FIL: 'Filecoin', INJ: 'Injective', TIA: 'Celestia',
  SEI: 'Sei', RNDR: 'Render', FET: 'Artificial Superintelligence Alliance', GRT: 'The Graph',
  ETC: 'Ethereum Classic', ICP: 'Internet Computer', HBAR: 'Hedera', VET: 'VeChain',
  ALGO: 'Algorand', AAVE: 'Aave', MKR: 'Maker', RUNE: 'THORChain', FTM: 'Fantom',
};

const POPULAR = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'SUI'];

function nameFor(base: string, marketName?: string): string {
  return marketName || SPOT_NAMES[base] || base;
}

function extractFilter(type: string): number | undefined {
  const m = /(\d+(?:\.\d+)?)/.exec(type);
  if (!m) return undefined;
  return Number(m[1]);
}

export async function getMarkets(marketType: MarketType): Promise<Market[]> {
  const cached = marketType === 'futures' ? futuresMarkets : spotMarkets;
  if (cached && Date.now() - cached.at < TTL) return cached.data as Market[];

  const info = (await fetchExchangeInfo(marketType)) as {
    symbols: Array<{
      symbol: string;
      pair?: string;
      status: string;
      baseAsset: string;
      quoteAsset: string;
      contractType?: string;
      filters: Array<{ filterType: string } & Record<string, string>>;
    }>;
  };

  const markets: Market[] = [];
  for (const s of info.symbols || []) {
    if (s.status !== 'TRADING') continue;
    if (marketType === 'futures' && s.contractType && s.contractType !== 'PERPETUAL') continue;
    let tickSize = 0.01, stepSize = 0.001, minQty = 0, minNotional = 0;
    for (const f of s.filters || []) {
      if (f.filterType === 'PRICE_FILTER') tickSize = extractFilter(f.tickSize) ?? 0.01;
      else if (f.filterType === 'LOT_SIZE') { stepSize = extractFilter(f.stepSize) ?? 0.001; minQty = extractFilter(f.minQty) ?? 0; }
      else if (f.filterType === 'NOTIONAL' || f.filterType === 'MIN_NOTIONAL') minNotional = extractFilter(f.minNotional) ?? 0;
    }
    markets.push({
      key: `${marketType}:${s.symbol}`,
      type: marketType,
      symbol: s.symbol,
      base: s.baseAsset,
      quote: s.quoteAsset,
      name: nameFor(s.baseAsset),
      status: s.status,
      tickSize, stepSize, minQty, minNotional,
    });
  }
  if (markets.length === 0) throw new MarketDataError('bad-response', 'Exchange reported no trading symbols.');
  const entry: CacheEntry<Market[]> = { at: Date.now(), data: markets };
  if (marketType === 'futures') futuresMarkets = entry; else spotMarkets = entry;
  return markets;
}

export async function getTickers(marketType: MarketType): Promise<Map<string, TickerEntry>> {
  const cached = marketType === 'futures' ? futuresTickers : spotTickers;
  if (cached && Date.now() - cached.at < 30 * 1000) return cached.data as Map<string, TickerEntry>;

  const base = marketType === 'futures' ? 'https://fapi.binance.com/fapi/v1' : 'https://api.binance.com/api/v3';
  const res = await fetch(`${base}/ticker/24hr`);
  if (!res.ok) throw new MarketDataError('bad-response', `Failed to load tickers (HTTP ${res.status}).`);
  const raw = await res.json();
  if (!Array.isArray(raw)) throw new MarketDataError('bad-response', 'Unexpected ticker list response.');
  const map = new Map<string, TickerEntry>();
  for (const t of raw as Record<string, string>[]) {
    const price = Number(t.lastPrice);
    if (!Number.isFinite(price) || price <= 0) continue;
    map.set(t.symbol, {
      price,
      priceChangePercent: Number(t.priceChangePercent) || 0,
      quoteVolume: Number(t.quoteVolume) || 0,
    });
  }
  const entry: CacheEntry<Map<string, TickerEntry>> = { at: Date.now(), data: map };
  if (marketType === 'futures') futuresTickers = entry; else spotTickers = entry;
  return map;
}

export function scoreMarket(m: Market, tickers: Map<string, TickerEntry>): number {
  return tickers.get(m.symbol)?.quoteVolume ?? 0;
}

export async function searchMarkets(filters: SearchFilters): Promise<SearchResult[]> {
  const types: MarketType[] = filters.marketType === 'all' ? ['spot', 'futures'] : [filters.marketType];
  const results: SearchResult[] = [];
  for (const type of types) {
    const [markets, tickers] = await Promise.all([getMarkets(type), getTickers(type)]);
    for (const m of markets) {
      if (filters.quote !== 'all' && m.quote !== filters.quote) continue;
      const t = tickers.get(m.symbol);
      if (!t) continue;
      if (filters.minVolume > 0 && t.quoteVolume < filters.minVolume) continue;
      const q = filters.query.trim().toUpperCase();
      const base = m.base.toUpperCase();
      const symbol = m.symbol.toUpperCase();
      if (q && !base.includes(q) && !symbol.includes(q) && !m.name.toUpperCase().includes(q)) continue;
      results.push({ market: m, ...t });
    }
  }
  // popular first, then by volume
  results.sort((a, b) => {
    const ai = POPULAR.indexOf(a.market.base);
    const bi = POPULAR.indexOf(b.market.base);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return b.quoteVolume - a.quoteVolume;
  });
  return results;
}

export async function getPopularMarkets(marketType: MarketType, quote: string): Promise<SearchResult[]> {
  const [markets, tickers] = await Promise.all([getMarkets(marketType), getTickers(marketType)]);
  return markets
    .filter((m) => m.quote === quote && POPULAR.includes(m.base) && tickers.has(m.symbol))
    .map((m) => ({ market: m, ...(tickers.get(m.symbol) as TickerEntry) }))
    .sort((a, b) => POPULAR.indexOf(a.market.base) - POPULAR.indexOf(b.market.base));
}

export function pairLabel(m: Market): string {
  return `${m.base}/${m.quote}`;
}

export async function loadSymbolInfo(type: MarketType, symbol: string): Promise<SymbolInfo> {
  const [markets, ticker] = await Promise.all([
    getMarkets(type).catch(() => [] as Market[]),
    fetchTicker24h(symbol, type),
  ]);
  const m = markets.find((x) => x.symbol === symbol);
  return {
    symbol,
    pair: m ? pairLabel(m) : symbol,
    base: m?.base ?? symbol,
    quote: m?.quote ?? '',
    name: m ? nameFor(m.base) : symbol,
    marketType: type,
    price: ticker.price,
    priceChangePercent: ticker.priceChangePercent,
    volume: ticker.quoteVolume,
    status: 'TRADING',
    tickSize: m?.tickSize ?? 0.01,
    stepSize: m?.stepSize ?? 0.001,
    minQty: m?.minQty ?? 0,
    minNotional: m?.minNotional ?? 0,
  };
}

export async function loadCandles(type: MarketType, symbol: string, interval: string, limit: number): Promise<Candle[]> {
  return fetchKlines({ symbol, interval, limit, marketType: type });
}
