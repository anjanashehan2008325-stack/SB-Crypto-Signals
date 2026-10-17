import { useCallback, useEffect, useRef, useState } from 'react';
import { analyze } from '../services/analysis';
import { getMarkets, getTickers, pairLabel } from '../services/markets';
import type { Candle, MarketType } from '../services/marketData';
import { loadCandles } from '../services/markets';
import { TIMEFRAMES } from './AnalysisScreen';
import { Chip } from './SignalPanel';
import { ErrorPanel, Loading } from './ErrorPanel';
import { formatCompact, formatPrice } from './SimpleSignalCards';

type ScanSignal = 'BUY' | 'SELL' | 'LONG' | 'SHORT' | null;

interface ScanRow {
  marketType: MarketType;
  symbol: string;
  pair: string;
  price: number;
  change: number;
  volume: number;
  signal: ScanSignal;
  provisional: boolean;
  trend: string;
  adx: number | null;
  strength: string;
  at: number;
}

interface Filters {
  direction: 'all' | 'bullish' | 'bearish';
  confirmedOnly: boolean;
  minAdx: number;
  minVolume: number;
  quote: string;
  timeframe: string;
}

const PAGE_SIZE = 25;
const CONCURRENCY = 6;
const MAX_SCANNED = 120;

export default function ScannerScreen({ marketType, onOpen }: { marketType: MarketType; onOpen: (mt: MarketType, symbol: string) => void }) {
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 });
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<Filters>({ direction: 'all', confirmedOnly: true, minAdx: 0, minVolume: 0, quote: 'USDT', timeframe: '1h' });
  const [page, setPage] = useState(0);
  const cancelRef = useRef(false);

  const scan = useCallback(async () => {
    cancelRef.current = false;
    setPhase('scanning');
    setRows([]);
    setProgress({ done: 0, total: 0, failed: 0 });
    try {
      const [markets, tickers] = await Promise.all([getMarkets(marketType), getTickers(marketType)]);
      const eligible = markets
        .filter((m) => m.quote === filters.quote)
        .map((m) => ({ m, t: tickers.get(m.symbol) }))
        .filter((x) => x.t && x.t.quoteVolume > 0)
        .sort((a, b) => b.t!.quoteVolume - a.t!.quoteVolume)
        .slice(0, MAX_SCANNED);

      setProgress({ done: 0, total: eligible.length, failed: 0 });
      const out: ScanRow[] = [];
      let done = 0;
      let failed = 0;

      const queue = [...eligible];
      const worker = async () => {
        while (queue.length > 0 && !cancelRef.current) {
          const item = queue.shift();
          if (!item) break;
          try {
            const candles = await loadCandles(marketType, item.m.symbol, filters.timeframe, 320);
            const analysis = analyze(candles, [], filters.timeframe, filters.timeframe, marketType);
            const sig = analysis.signal;
            out.push({
              marketType, symbol: item.m.symbol, pair: pairLabel(item.m),
              price: item.t!.price, change: item.t!.priceChangePercent, volume: item.t!.quoteVolume,
              signal: sig ? (marketType === 'spot' ? (sig.direction === 'LONG' ? 'BUY' : 'SELL') : sig.direction) : null,
              provisional: sig?.provisional ?? false,
              trend: analysis.trend,
              adx: analysis.adx,
              strength: sig?.strength ?? '—',
              at: Date.now(),
            });
          } catch {
            failed++;
          }
          done++;
          if (done % 10 === 0 || queue.length === 0) {
            setProgress({ done, total: eligible.length, failed });
            setRows([...out].sort(sortRows));
          }
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      if (!cancelRef.current) {
        setProgress({ done, total: eligible.length, failed });
        setRows([...out].sort(sortRows));
        setPhase('done');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed.');
      setPhase('error');
    }
  }, [marketType, filters.quote, filters.timeframe]);

  useEffect(() => () => { cancelRef.current = true; }, []);

  const filtered = rows.filter((r) => {
    if (filters.confirmedOnly && (r.signal === null || r.provisional)) return false;
    if (filters.direction === 'bullish' && !(r.signal === 'BUY' || r.signal === 'LONG')) return false;
    if (filters.direction === 'bearish' && !(r.signal === 'SELL' || r.signal === 'SHORT')) return false;
    if (filters.minAdx > 0 && (r.adx === null || r.adx < filters.minAdx)) return false;
    if (filters.minVolume > 0 && r.volume < filters.minVolume) return false;
    return true;
  });

  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  return (
    <div className="max-w-3xl mx-auto px-4 pb-24 pt-4 space-y-4">
      <div className="rounded-2xl bg-[#0b1220] border border-neutral-800 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-bold text-white">Market Scanner</h1>
          <span className="text-xs text-neutral-500">Top {MAX_SCANNED} {filters.quote} pairs by volume</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <FilterSelect label="Direction" value={filters.direction} onChange={(v) => setFilters((f) => ({ ...f, direction: v as Filters['direction'] }))}
            options={[['all', 'All'], ['bullish', 'Buy / Long'], ['bearish', 'Sell / Short']]} />
          <FilterSelect label="Timeframe" value={filters.timeframe} onChange={(v) => setFilters((f) => ({ ...f, timeframe: v }))}
            options={TIMEFRAMES.map((t) => [t, t.toUpperCase()] as [string, string])} />
          <FilterSelect label="Quote" value={filters.quote} onChange={(v) => setFilters((f) => ({ ...f, quote: v }))}
            options={[['USDT', 'USDT'], ['FDUSD', 'FDUSD'], ['BTC', 'BTC']]} />
          <FilterSelect label="Min ADX" value={String(filters.minAdx)} onChange={(v) => setFilters((f) => ({ ...f, minAdx: Number(v) }))}
            options={[['0', 'Any'], ['20', '20+'], ['25', '25+'], ['30', '30+']]} />
        </div>
        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input type="checkbox" checked={filters.confirmedOnly} onChange={(e) => setFilters((f) => ({ ...f, confirmedOnly: e.target.checked }))}
            className="w-4 h-4 rounded bg-neutral-800 border-neutral-600 accent-green-600" />
          Confirmed signals only (exclude provisional)
        </label>
        <button
          onClick={() => { if (phase === 'scanning') { cancelRef.current = true; setPhase('idle'); } else void scan(); }}
          disabled={phase === 'scanning' && cancelRef.current}
          className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold transition-colors"
        >
          {phase === 'scanning' ? 'Scanning… tap to stop' : phase === 'done' ? 'Scan again' : 'Start scan'}
        </button>
        {phase === 'scanning' && (
          <div>
            <div className="h-1.5 rounded-full bg-neutral-800 overflow-hidden">
              <div className="h-full bg-green-600 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
            <p className="text-xs text-neutral-500 mt-1.5">Checked {progress.done} of {progress.total} coins · {progress.failed} could not be checked · {rows.length} signals so far</p>
          </div>
        )}
        {phase === 'done' && (
          <p className="text-xs text-neutral-500">
            Scanned {progress.done} pairs; {progress.failed} could not be processed (missing candles or exchange errors). Showing {filtered.length} matches.
          </p>
        )}
      </div>

      {phase === 'error' && <ErrorPanel message={error} onRetry={() => void scan()} title="Scanner error" />}
      {phase === 'idle' && <p className="text-sm text-neutral-500 text-center py-10">Choose filters and start a scan to find setups across the market.</p>}
      {phase === 'scanning' && rows.length === 0 && <Loading label="Scanning pairs…" />}

      {rows.length > 0 && (
        <div className="rounded-2xl bg-[#0b1220] border border-neutral-800 divide-y divide-neutral-800/70 overflow-hidden">
          {pageRows.map((r) => (
            <button key={r.symbol} onClick={() => onOpen(r.marketType, r.symbol)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-800/40 transition-colors text-left">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">{r.pair}</p>
                <p className="text-xs text-neutral-500 tabular-nums">
                  {formatPrice(r.price)} · {r.change >= 0 ? '+' : ''}{r.change.toFixed(2)}% · Vol {formatCompact(r.volume)}
                </p>
              </div>
              <div className="text-right shrink-0 space-y-1">
                {r.signal ? (
                  <Chip tone={r.signal === 'BUY' || r.signal === 'LONG' ? 'green' : 'red'}>
                    {r.signal}{r.provisional ? ' (prov.)' : ''}
                  </Chip>
                ) : (
                  <Chip tone="neutral">NONE</Chip>
                )}
                <p className="text-[10px] text-neutral-500">
                  {r.trend} · ADX {r.adx !== null ? r.adx.toFixed(0) : '—'}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="px-4 py-2 rounded-lg bg-neutral-800 text-neutral-300 disabled:opacity-40">Previous</button>
          <span className="text-neutral-500 text-xs">Page {page + 1} of {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-4 py-2 rounded-lg bg-neutral-800 text-neutral-300 disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}

function sortRows(a: ScanRow, b: ScanRow): number {
  const sigA = a.signal ? 0 : 1;
  const sigB = b.signal ? 0 : 1;
  if (sigA !== sigB) return sigA - sigB;
  return b.volume - a.volume;
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-neutral-500 mb-1">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-2.5 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-600">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
