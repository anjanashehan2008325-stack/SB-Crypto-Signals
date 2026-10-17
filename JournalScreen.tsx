import { useState } from 'react';
import { useAppState } from '../contexts/AppStateContext';
import { ErrorPanel, EmptyState } from './ErrorPanel';
import { Stat } from './SignalPanel';
import { formatPrice } from './SimpleSignalCards';

type Tab = 'watchlist' | 'signals' | 'journal';

export default function JournalScreen({ onOpen }: { onOpen: (mt: 'spot' | 'futures', symbol: string) => void }) {
  const app = useAppState();
  const [tab, setTab] = useState<Tab>('watchlist');
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ symbol: 'BTCUSDT', direction: 'LONG', entryPrice: '', quantity: '', stopLoss: '', tp1: '', notes: '' });

  const closed = app.journal.filter((t) => t.status === 'closed');
  const totalPnl = closed.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
  const wins = closed.filter((t) => (Number(t.pnl) || 0) > 0).length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const entry = Number(form.entryPrice);
    if (!Number.isFinite(entry) || entry <= 0) { setError('Enter a valid entry price.'); return; }
    try {
      await app.addTrade({
        market_type: 'spot', symbol: form.symbol.toUpperCase(), timeframe: null,
        direction: form.direction, entry_price: entry,
        exit_price: null, stop_loss: form.stopLoss ? Number(form.stopLoss) : null,
        tp1: form.tp1 ? Number(form.tp1) : null,
        quantity: form.quantity ? Number(form.quantity) : null,
        fees: 0, pnl: null, status: 'open', notes: form.notes,
      });
      setShowForm(false);
      setForm({ symbol: 'BTCUSDT', direction: 'LONG', entryPrice: '', quantity: '', stopLoss: '', tp1: '', notes: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save trade.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 pb-24 pt-4 space-y-4">
      <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-1.5 flex gap-1.5">
        {([['watchlist', 'Watchlist'], ['signals', 'Saved signals'], ['journal', 'Trade journal']] as [Tab, string][]).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${tab === id ? 'bg-green-600 text-white' : 'text-neutral-400 hover:text-neutral-200'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'watchlist' && (
        app.favorites.length === 0 ? (
          <EmptyState icon="☆" title="No favorites yet" body="Tap the star on any coin in Search or Analysis to pin it here." />
        ) : (
          <div className="rounded-2xl bg-neutral-900 border border-neutral-800 divide-y divide-neutral-800/70 overflow-hidden">
            {app.favorites.map((f) => (
              <button key={`${f.market_type}:${f.symbol}`} onClick={() => onOpen(f.market_type as 'spot' | 'futures', f.symbol)}
                className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-neutral-800/40 transition-colors text-left">
                <div>
                  <p className="text-sm font-bold text-white">{f.base}/{f.quote}</p>
                  <p className="text-xs text-neutral-500">{f.symbol}</p>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${f.market_type === 'futures' ? 'bg-amber-950 text-amber-400' : 'bg-sky-950 text-sky-400'}`}>
                  {f.market_type === 'futures' ? 'FUTURES' : 'SPOT'}
                </span>
              </button>
            ))}
          </div>
        )
      )}

      {tab === 'signals' && (
        app.savedSignals.length === 0 ? (
          <EmptyState icon="🔖" title="No saved signals" body="Save a signal from any coin's analysis screen to review it here later." />
        ) : (
          <div className="space-y-3">
            {app.savedSignals.map((s) => (
              <div key={s.id} className="rounded-2xl bg-neutral-900 border border-neutral-800 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${s.direction === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>{s.direction}</span>
                    <span className="text-sm font-semibold text-white">{s.symbol}</span>
                    <span className="text-xs text-neutral-500">{s.timeframe.toUpperCase()} · {s.market_type}</span>
                  </div>
                  <button onClick={() => void app.deleteSignal(s.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                </div>
                <div className="grid grid-cols-4 gap-2 mt-3 text-xs">
                  <div><p className="text-neutral-500">Entry</p><p className="text-neutral-200 tabular-nums">{formatPrice(Number(s.entry))}</p></div>
                  <div><p className="text-neutral-500">SL</p><p className="text-red-400 tabular-nums">{formatPrice(Number(s.stop_loss))}</p></div>
                  <div><p className="text-neutral-500">TP1</p><p className="text-green-400 tabular-nums">{formatPrice(Number(s.tps?.[0]?.price ?? 0))}</p></div>
                  <div><p className="text-neutral-500">Saved</p><p className="text-neutral-400">{new Date(s.created_at).toLocaleDateString()}</p></div>
                </div>
                <button onClick={() => onOpen(s.market_type as 'spot' | 'futures', s.symbol)} className="mt-3 text-xs text-green-400 hover:text-green-300">Open analysis →</button>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'journal' && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Open trades" value={String(app.journal.filter((t) => t.status === 'open').length)} />
            <Stat label="Closed P&L" value={`${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}`} tone={totalPnl >= 0 ? 'green' : 'red'} />
            <Stat label="Win rate" value={closed.length ? `${((wins / closed.length) * 100).toFixed(0)}%` : '—'} />
          </div>

          <button onClick={() => setShowForm((s) => !s)} className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold transition-colors">
            {showForm ? 'Cancel' : 'Record a trade'}
          </button>

          {showForm && (
            <form onSubmit={submit} className="rounded-2xl bg-neutral-900 border border-neutral-800 p-4 space-y-3">
              {error && <div className="rounded-lg bg-red-950/50 border border-red-900/50 px-3 py-2 text-sm text-red-300">{error}</div>}
              <div className="grid grid-cols-2 gap-2">
                <input value={form.symbol} onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value.toUpperCase() }))} placeholder="SYMBOL"
                  className="rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2.5 text-sm text-white" />
                <select value={form.direction} onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value }))}
                  className="rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2.5 text-sm text-white">
                  <option>LONG</option><option>SHORT</option>
                </select>
                <input value={form.entryPrice} onChange={(e) => setForm((f) => ({ ...f, entryPrice: e.target.value }))} placeholder="Entry price" inputMode="decimal"
                  className="rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2.5 text-sm text-white" />
                <input value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} placeholder="Quantity" inputMode="decimal"
                  className="rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2.5 text-sm text-white" />
                <input value={form.stopLoss} onChange={(e) => setForm((f) => ({ ...f, stopLoss: e.target.value }))} placeholder="Stop loss (optional)" inputMode="decimal"
                  className="rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2.5 text-sm text-white" />
                <input value={form.tp1} onChange={(e) => setForm((f) => ({ ...f, tp1: e.target.value }))} placeholder="TP1 (optional)" inputMode="decimal"
                  className="rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2.5 text-sm text-white" />
              </div>
              <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Notes (optional)" rows={2}
                className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2.5 text-sm text-white" />
              <button type="submit" className="w-full py-2.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-white text-sm font-medium transition-colors">Save trade</button>
            </form>
          )}

          <p className="text-xs text-neutral-600">These are manually recorded trades only — they are not connected to any exchange account.</p>

          {app.journal.length === 0 ? (
            <EmptyState icon="📓" title="No trades recorded" body="Record a trade to track entries, exits and your personal performance." />
          ) : (
            <div className="space-y-3">
              {app.journal.map((t) => (
                <div key={t.id} className="rounded-2xl bg-neutral-900 border border-neutral-800 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${t.direction === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>{t.direction}</span>
                      <span className="text-sm font-semibold text-white">{t.symbol}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${t.status === 'open' ? 'bg-sky-950 text-sky-400' : 'bg-neutral-800 text-neutral-400'}`}>
                        {t.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex gap-3">
                      {t.status === 'open' && <button onClick={() => { const exit = window.prompt('Exit price:'); if (exit) { const p = Number(exit); if (Number.isFinite(p) && p > 0) { const pnl = (t.direction === 'LONG' ? p - Number(t.entry_price) : Number(t.entry_price) - p) * (Number(t.quantity) || 1); void app.closeTrade(t.id, p, pnl); } } }} className="text-xs text-green-400 hover:text-green-300">Close</button>}
                      <button onClick={() => void app.deleteTrade(t.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2 mt-3 text-xs">
                    <div><p className="text-neutral-500">Entry</p><p className="text-neutral-200 tabular-nums">{formatPrice(Number(t.entry_price))}</p></div>
                    <div><p className="text-neutral-500">Exit</p><p className="text-neutral-200 tabular-nums">{t.exit_price ? formatPrice(Number(t.exit_price)) : '—'}</p></div>
                    <div><p className="text-neutral-500">SL</p><p className="text-red-400 tabular-nums">{t.stop_loss ? formatPrice(Number(t.stop_loss)) : '—'}</p></div>
                    <div><p className="text-neutral-500">P&L</p><p className={`tabular-nums ${(Number(t.pnl) || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{t.pnl !== null ? Number(t.pnl).toFixed(2) : '—'}</p></div>
                  </div>
                  {t.notes && <p className="text-xs text-neutral-500 mt-2">{t.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
