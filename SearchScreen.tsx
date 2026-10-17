import { useEffect, useMemo, useState } from 'react';
import { QUOTES, searchMarkets, getPopularMarkets, type SearchResult } from '../services/markets';
import type { MarketType } from '../services/marketData';
import { ErrorPanel, Loading } from './ErrorPanel';
import { useAppState } from '../contexts/AppStateContext';
import { formatCompact, formatPrice } from './SimpleSignalCards';
import { Star } from 'lucide-react';

interface Props {
  marketType: MarketType;
  onSelect: (marketType: MarketType, symbol: string) => void;
}

export default function SearchScreen({ marketType, onSelect }: Props) {
  const app = useAppState();
  const [query, setQuery] = useState('');
  const [quote, setQuote] = useState<string>('USDT');
  const [minVolume, setMinVolume] = useState(0);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [popular, setPopular] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const runSearch = async () => {
    setLoading(true); setError(null);
    try {
      if (query.trim()) {
        const res = await searchMarkets({ query, marketType, quote: 'all', minVolume });
        setResults(res.slice(0, 60));
        setPopular([]);
      } else {
        const res = await getPopularMarkets(marketType, quote);
        setPopular(res);
        setResults(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed.');
      setResults(null); setPopular([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = window.setTimeout(() => { void runSearch(); }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, marketType, quote, minVolume]);

  const shown = results ?? popular;
  const hasQuery = query.trim().length > 0;

  const favResults = useMemo(() =>
    app.favorites.map((f) => ({ f, hit: shown.find((s) => s.market.symbol === f.symbol && s.market.type === f.market_type) })),
  [app.favorites, shown]);

  return (
    <div className="max-w-3xl mx-auto px-4 pb-24 pt-4 space-y-4">
      <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-4 space-y-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search coin name, ticker or pair (e.g. Solana, SOL, SOLUSDT)…"
          className="w-full rounded-xl bg-neutral-800 border border-neutral-700 px-4 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent"
        />
        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          {(hasQuery ? ['all' as const] : QUOTES).map((q) => (
            <button
              key={q}
              onClick={() => setQuote(q)}
              disabled={hasQuery}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors disabled:opacity-40 ${
                quote === q ? 'bg-green-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {q === 'all' ? 'ALL QUOTES' : q}
            </button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          {[
            { label: 'Any volume', v: 0 },
            { label: '>$10M/day', v: 10_000_000 },
            { label: '>$100M/day', v: 100_000_000 },
          ].map((f) => (
            <button
              key={f.v}
              onClick={() => setMinVolume(f.v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                minVolume === f.v ? 'bg-green-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-neutral-500">
          Live from Binance {marketType === 'futures' ? 'USD-M Futures' : 'Spot'} — all eligible {quote === 'all' || hasQuery ? '' : `${quote} `}trading pairs the exchange currently lists.
        </p>
      </div>

      {error && <ErrorPanel message={error} onRetry={() => void runSearch()} title="Could not load markets" />}
      {loading && <Loading label="Loading markets…" />}

      {!loading && !error && (
        <>
          {!hasQuery && favResults.some((r) => r.hit) && (
            <RowGroup title="Your favorites">
              {favResults.filter((r) => r.hit).map(({ f, hit }) => (
                <MarketRow key={`${f.market_type}:${f.symbol}`} result={hit!} onSelect={onSelect} fav onToggleFav={() => void app.toggleFavorite({ market_type: f.market_type, symbol: f.symbol, base: f.base, quote: f.quote })} />
              ))}
            </RowGroup>
          )}
          <RowGroup title={hasQuery ? `Results (${shown.length})` : 'Popular coins'}>
            {shown.length === 0 && (
              <p className="text-sm text-neutral-500 py-6 text-center">
                No matching pairs found. {hasQuery ? 'Try a shorter query or check the spelling.' : 'This quote currency has no popular listings — try another filter.'}
              </p>
            )}
            {shown.slice(0, 40).map((r) => (
              <MarketRow
                key={r.market.key}
                result={r}
                onSelect={onSelect}
                fav={app.isFavorite(r.market.type, r.market.symbol)}
                onToggleFav={() => void app.toggleFavorite({ market_type: r.market.type, symbol: r.market.symbol, base: r.market.base, quote: r.market.quote })}
              />
            ))}
          </RowGroup>
        </>
      )}
    </div>
  );
}

function RowGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-400 px-1 mb-2">{title}</h2>
      <div className="rounded-2xl bg-neutral-900 border border-neutral-800 divide-y divide-neutral-800/70 overflow-hidden">{children}</div>
    </div>
  );
}

function MarketRow({ result, onSelect, fav, onToggleFav }: {
  result: SearchResult; onSelect: Props['onSelect']; fav: boolean; onToggleFav: () => void;
}) {
  const m = result.market;
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-800/40 transition-colors">
      <button onClick={onToggleFav} className={`p-1 shrink-0 ${fav ? 'text-amber-400' : 'text-neutral-600 hover:text-neutral-400'}`} aria-label="Toggle favorite">
        <Star size={16} fill={fav ? 'currentColor' : 'none'} />
      </button>
      <button onClick={() => onSelect(m.type, m.symbol)} className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white">{m.base}</span>
          <span className="text-xs text-neutral-500">{m.base}/{m.quote}</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${m.type === 'futures' ? 'bg-amber-950 text-amber-400' : 'bg-sky-950 text-sky-400'}`}>
            {m.type === 'futures' ? 'FUT' : 'SPOT'}
          </span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-950 text-green-400">TRADING</span>
        </div>
        <p className="text-xs text-neutral-500 mt-0.5 truncate">{m.name}</p>
      </button>
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold text-white tabular-nums">{formatPrice(result.price)}</p>
        <p className={`text-xs tabular-nums ${result.priceChangePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {result.priceChangePercent >= 0 ? '+' : ''}{result.priceChangePercent.toFixed(2)}%
        </p>
        <p className="text-[10px] text-neutral-600 tabular-nums">Vol {formatCompact(result.quoteVolume)}</p>
      </div>
    </div>
  );
}
