import { useEffect, useState } from 'react';
import { useAppState } from '../contexts/AppStateContext';
import { getTickers, type SearchResult } from '../services/markets';
import { SBLogo, Loading, EmptyState } from './ErrorPanel';
import { formatCompact, formatPrice } from './SimpleSignalCards';
import { Bell, BookOpen, LineChart, Radar, Search, Settings, Star, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import type { MarketType } from '../services/marketData';

interface Props {
  marketType: MarketType;
  onGo: (screen: 'search' | 'scanner' | 'backtest' | 'journal' | 'settings' | 'alerts') => void;
  onOpenCoin: (mt: MarketType, symbol: string) => void;
  unread: number;
}

interface BigButton { id: Props['onGo'] extends (s: infer S) => void ? S : never; label: string; sub: string; icon: typeof Search; cls: string }

const BUTTONS: BigButton[] = [
  { id: 'search', label: 'Find a Coin', sub: 'Search any coin', icon: Search, cls: 'from-green-600/90 to-emerald-800/90' },
  { id: 'scanner', label: 'Scan Market', sub: 'Coins with signals now', icon: Radar, cls: 'from-sky-700/90 to-blue-900/90' },
  { id: 'journal', label: 'My Trades', sub: 'Record and review trades', icon: BookOpen, cls: 'from-violet-800/90 to-purple-950/90' },
  { id: 'backtest', label: 'Test Strategy', sub: 'Practice with history', icon: LineChart, cls: 'from-amber-700/90 to-orange-900/90' },
];

export default function HomeScreen({ marketType, onGo, onOpenCoin, unread }: Props) {
  const app = useAppState();
  const [favTickers, setFavTickers] = useState<Map<string, SearchResult>>(new Map());
  const [loading, setLoading] = useState(app.favorites.length > 0);
  const [status, setStatus] = useState<{ label: string; tone: 'green' | 'red' | 'neutral'; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (app.favorites.length === 0) { setFavTickers(new Map()); setLoading(false); return; }
      try {
        const [spotT, futT] = await Promise.all([getTickers('spot'), getTickers('futures')]);
        if (!alive) return;
        const map = new Map<string, SearchResult>();
        for (const f of app.favorites) {
          const t = (f.market_type === 'futures' ? futT : spotT).get(f.symbol);
          if (t) map.set(`${f.market_type}:${f.symbol}`, { market: { key: f.market_type + f.symbol, type: f.market_type as MarketType, symbol: f.symbol, base: f.base, quote: f.quote, name: f.base, status: 'TRADING', tickSize: 0, stepSize: 0, minQty: 0, minNotional: 0 }, ...t });
        }
        setFavTickers(map);
        // simple overall market pulse from BTC and ETH
        const btc = spotT.get('BTCUSDT');
        const eth = spotT.get('ETHUSDT');
        if (btc && eth) {
          const avg = (btc.priceChangePercent + eth.priceChangePercent) / 2;
          setStatus(avg > 1 ? { label: 'RISING', tone: 'green', text: 'Big coins are moving up today.' }
            : avg < -1 ? { label: 'FALLING', tone: 'red', text: 'Big coins are moving down today.' }
            : { label: 'CALM', tone: 'neutral', text: 'A quiet day. Good time to watch and wait.' });
        }
      } catch {
        if (alive) setStatus(null);
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    const iv = window.setInterval(load, 30_000);
    return () => { alive = false; window.clearInterval(iv); };
  }, [app.favorites]);

  return (
    <div className="max-w-3xl mx-auto px-4 pb-28 pt-2 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <SBLogo size={38} />
        <div className="flex items-center gap-1">
          <button onClick={() => onGo('alerts')} className="relative p-2.5 rounded-xl text-neutral-400 hover:text-neutral-200 transition-colors" aria-label="Notifications">
            <Bell size={20} />
            {unread > 0 && (
              <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
          <button onClick={() => onGo('search')} className="p-2.5 rounded-xl text-neutral-400 hover:text-neutral-200 transition-colors" aria-label="Search">
            <Search size={20} />
          </button>
          <button onClick={() => onGo('settings')} className="p-2.5 rounded-xl text-neutral-400 hover:text-neutral-200 transition-colors" aria-label="Settings">
            <Settings size={20} />
          </button>
        </div>
      </div>

      {/* Market status */}
      <div className="rounded-2xl bg-[#0b1220] border border-neutral-800 p-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs uppercase tracking-wider text-neutral-500">Market Today</p>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${marketType === 'futures' ? 'bg-amber-600/20 text-amber-400' : 'bg-green-600/20 text-green-400'}`}>
            {marketType === 'futures' ? 'FUTURES' : 'SPOT'}
          </span>
        </div>
        {status === null && !loading && <p className="text-sm text-neutral-500">Market status unavailable right now.</p>}
        {loading && status === null ? (
          <div className="h-8 w-40 bg-neutral-800/60 rounded-lg animate-pulse" />
        ) : status && (
          <div className="flex items-center gap-3">
            {status.tone === 'green' ? <TrendingUp className="text-green-400" size={26} />
              : status.tone === 'red' ? <TrendingDown className="text-red-400" size={26} />
              : <Minus className="text-neutral-400" size={26} />}
            <div>
              <p className={`text-lg font-bold ${status.tone === 'green' ? 'text-green-400' : status.tone === 'red' ? 'text-red-400' : 'text-neutral-300'}`}>
                {status.label}
              </p>
              <p className="text-xs text-neutral-500">{status.text}</p>
            </div>
          </div>
        )}
      </div>

      {/* Favorites */}
      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-400">My Coins</h2>
          {app.favorites.length > 0 && (
            <button onClick={() => onGo('search')} className="text-xs text-green-400 hover:text-green-300">Find more</button>
          )}
        </div>
        {app.favorites.length === 0 ? (
          <div className="rounded-2xl bg-[#0b1220] border border-neutral-800">
            <EmptyState icon="☆" title="No coins saved yet" body="Search for a coin and tap the star to pin it here." />
          </div>
        ) : loading ? (
          <Loading label="Loading your coins…" />
        ) : (
          <div className="rounded-2xl bg-[#0b1220] border border-neutral-800 divide-y divide-neutral-800/70 overflow-hidden">
            {app.favorites.map((f) => {
              const t = favTickers.get(`${f.market_type}:${f.symbol}`);
              return (
                <button key={`${f.market_type}:${f.symbol}`} onClick={() => onOpenCoin(f.market_type as MarketType, f.symbol)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-neutral-800/40 transition-colors text-left">
                  <Star size={16} className="text-green-400 shrink-0" fill="currentColor" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white">{f.base}<span className="text-neutral-500 font-normal">/{f.quote}</span></p>
                    <p className="text-[10px] text-neutral-500 uppercase">{f.market_type}</p>
                  </div>
                  {t ? (
                    <div className="text-right">
                      <p className="text-sm font-semibold text-white tabular-nums">{formatPrice(t.price)}</p>
                      <p className={`text-xs font-medium tabular-nums ${t.priceChangePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        <span className="sr-only">{t.priceChangePercent >= 0 ? 'up ' : 'down '}</span>
                        {t.priceChangePercent >= 0 ? '▲' : '▼'} {Math.abs(t.priceChangePercent).toFixed(2)}%
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-neutral-600">No live price</p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Big action buttons */}
      <div className="grid grid-cols-2 gap-3">
        {BUTTONS.map((b) => (
          <button key={b.id} onClick={() => onGo(b.id)}
            className={`rounded-2xl bg-gradient-to-br ${b.cls} p-5 text-left transition-transform active:scale-[0.98] hover:brightness-110 min-h-[104px] flex flex-col justify-between`}>
            <b.icon size={24} className="text-white/90" />
            <div>
              <p className="text-white font-bold text-base leading-tight">{b.label}</p>
              <p className="text-white/70 text-xs mt-0.5">{b.sub}</p>
            </div>
          </button>
        ))}
      </div>

      <p className="text-[10px] text-neutral-600 text-center px-6 leading-relaxed">
        SB Crypto Signals helps you understand the market. It never places trades, and no signal is a guarantee.
        24h volume across your coins: {formatCompact(Array.from(favTickers.values()).reduce((s, t) => s + t.quoteVolume, 0))}
      </p>
    </div>
  );
}
