
import { useEffect, useMemo, useState } from 'react';
import {
  QUOTES,
  searchMarkets,
  getPopularMarkets,
  type SearchResult,
} from './markets';
import type { MarketType } from './marketData';
import { ErrorPanel, Loading } from './ErrorPanel';
import { useAppState } from './AppStateContext';
import { formatCompact, formatPrice } from './SimpleSignalCards';
import { Star } from 'lucide-react';

interface Props {
  marketType: MarketType;
  onSelect: (marketType: MarketType, symbol: string) => void;
}

export default function SearchScreen({
  marketType,
  onSelect,
}: Props) {
  const app = useAppState();

  const [query, setQuery] = useState('');
  const [quote, setQuote] = useState<string>('USDT');
  const [minVolume, setMinVolume] = useState(0);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [popular, setPopular] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const runSearch = async () => {
    setLoading(true);
    setError(null);

    try {
      if (query.trim()) {
        const res = await searchMarkets({
          query,
          marketType,
          quote: 'all',
          minVolume,
        });

        setResults(res.slice(0, 60));
        setPopular([]);
      } else {
        const res = await getPopularMarkets(marketType, quote);
        setPopular(res);
        setResults(null);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Search failed.',
      );
      setResults(null);
      setPopular([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void runSearch();
    }, 300);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, marketType, quote, minVolume]);

  const shown = results ?? popular;
  const hasQuery = query.trim().length > 0;

  const favResults = useMemo(
    () =>
      app.favorites.map((favorite) => ({
        favorite,
        hit: shown.find(
          (item) =>
            item.market.symbol === favorite.symbol &&
            item.market.type === favorite.market_type,
        ),
      })),
    [app.favorites, shown],
  );

  return (
    <div className="max-w-3xl mx-auto px-4 pb-24 pt-4 space-y-4">
      <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-4 space-y-3">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search coin name, ticker or pair (e.g. Solana, SOL, SOLUSDT)…"
          className="w-full rounded-xl bg-neutral-800 border border-neutral-700 px-4 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent"
        />

        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          {(hasQuery ? (['all'] as const) : QUOTES).map((item) => (
            <button
              key={item}
              onClick={() => setQuote(item)}
              disabled={hasQuery}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors disabled:opacity-40 ${
                quote === item
                  ? 'bg-green-600 text-white'
                  : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {item === 'all' ? 'ALL QUOTES' : item}
            </button>
          ))}
        </div>

        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          {[
            { label: 'Any volume', value: 0 },
            { label: '>$10M/day', value: 10_000_000 },
            { label: '>$100M/day', value: 100_000_000 },
          ].map((filter) => (
            <button
              key={filter.value}
              onClick={() => setMinVolume(filter.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                minVolume === filter.value
                  ? 'bg-green-600 text-white'
                  : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <p className="text-xs text-neutral-500">
          Live from Binance{' '}
          {marketType === 'futures' ? 'USD-M Futures' : 'Spot'} — all
          eligible{' '}
          {quote === 'all' || hasQuery ? '' : `${quote} `}
          trading pairs the exchange currently lists.
        </p>
      </div>

      {error && (
        <ErrorPanel
          message={error}
          onRetry={() => void runSearch()}
          title="Could not load markets"
        />
      )}

      {loading && <Loading label="Loading markets…" />}

      {!loading && !error && (
        <>
          {!hasQuery && favResults.some((item) => item.hit) && (
            <RowGroup title="Your favorites">
              {favResults
                .filter((item) => item.hit)
                .map(({ favorite, hit }) => (
                  <MarketRow
                    key={`${favorite.market_type}:${favorite.symbol}`}
                    result={hit!}
                    onSelect={onSelect}
                    fav
                    onToggleFav={() =>
                      void app.toggleFavorite({
                        market_type: favorite.market_type,
                        symbol: favorite.symbol,
                        base: favorite.base,
                        quote: favorite.quote,
                      })
                    }
                  />
                ))}
            </RowGroup>
          )}

          <RowGroup
            title={
              hasQuery ? `Results (${shown.length})` : 'Popular coins'
            }
          >
            {shown.length === 0 && (
              <p className="text-sm text-neutral-500 py-6 text-center">
                No matching pairs found.{' '}
                {hasQuery
                  ? 'Try a shorter query or check the spelling.'
                  : 'This quote currency has no popular listings — try another filter.'}
              </p>
            )}

            {shown.slice(0, 40).map((result) => (
              <MarketRow
                key={result.market.key}
                result={result}
                onSelect={onSelect}
                fav={app.isFavorite(
                  result.market.type,
                  result.market.symbol,
                )}
                onToggleFav={() =>
                  void app.toggleFavorite({
                    market_type: result.market.type,
                    symbol: result.market.symbol,
                    base: result.market.base,
                    quote: result.market.quote,
                  })
                }
              />
            ))}
          </RowGroup>
        </>
      )}
    </div>
  );
}

function RowGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-400 px-1 mb-2">
        {title}
      </h2>
      <div className="rounded-2xl bg-neutral-900 border border-neutral-800 divide-y divide-neutral-800/70 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function MarketRow({
  result,
  onSelect,
  fav,
  onToggleFav,
}: {
  result: SearchResult;
  onSelect: Props['onSelect'];
  fav: boolean;
  onToggleFav: () => void;
}) {
  const market = result.market;

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-800/40 transition-colors">
      <button
        onClick={onToggleFav}
        className={`p-1 shrink-0 ${
          fav
            ? 'text-amber-400'
            : 'text-neutral-600 hover:text-neutral-400'
        }`}
        aria-label="Toggle favorite"
      >
        <Star size={16} fill={fav ? 'currentColor' : 'none'} />
      </button>

      <button
        onClick={() => onSelect(market.type, market.symbol)}
        className="flex-1 min-w-0 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white">
            {market.base}
          </span>
          <span className="text-xs text-neutral-500">
            {market.base}/{market.quote}
          </span>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
              market.type === 'futures'
                ? 'bg-amber-950 text-amber-400'
                : 'bg-sky-950 text-sky-400'
            }`}
          >
            {market.type === 'futures' ? 'FUT' : 'SPOT'}
          </span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-950 text-green-400">
            TRADING
          </span>
        </div>

        <p className="text-xs text-neutral-500 mt-0.5 truncate">
          {market.name}
        </p>
      </button>

      <div className="text-right shrink-0">
        <p className="text-sm font-semibold text-white tabular-nums">
          {formatPrice(result.price)}
        </p>

        <p
          className={`text-xs tabular-nums ${
            result.priceChangePercent >= 0
              ? 'text-green-400'
              : 'text-red-400'
          }`}
        >
          {result.priceChangePercent >= 0 ? '+' : ''}
          {result.priceChangePercent.toFixed(2)}%
        </p>

        <p className="text-[10px] text-neutral-600 tabular-nums">
          Vol {formatCompact(result.quoteVolume)}
        </p>
      </div>
    </div>
  );
}
