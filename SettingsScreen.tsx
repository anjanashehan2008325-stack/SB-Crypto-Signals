import { useState } from 'react';
import { useAppState, DEFAULT_ALERTS } from '../contexts/AppStateContext';
import { useAuth } from '../contexts/AuthContext';
import { Section, Stat } from './SignalPanel';

export default function SettingsScreen() {
  const app = useAppState();
  const auth = useAuth();
  const [risk, setRisk] = useState(app.risk);
  const [engine, setEngine] = useState(app.engineConfig);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  const save = async () => {
    setSaving(true); setSaved(false);
    try {
      await app.updateRisk(risk);
      await app.updateEngineConfig(engine);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (newPw.length < 6) { setPwMsg('Password must be at least 6 characters.'); return; }
    try { await auth.changePassword(newPw); setPwMsg('Password updated.'); setNewPw(''); setPwOpen(false); }
    catch (err) { setPwMsg(err instanceof Error ? err.message : 'Failed to update password.'); }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 pb-24 pt-4 space-y-4">
      <Section title="Account" statusChip={<span className="text-xs text-neutral-500">{auth.email}</span>}>
        <div className="space-y-3">
          <button onClick={() => void auth.signOut()} className="w-full py-3 rounded-xl bg-red-950/60 border border-red-900/50 text-red-300 text-sm font-semibold hover:bg-red-900/60 transition-colors">
            Log out
          </button>
          <button onClick={() => setPwOpen((s) => !s)} className="w-full py-2.5 rounded-lg border border-neutral-700 text-neutral-200 text-sm font-medium hover:bg-neutral-800 transition-colors">
            {pwOpen ? 'Cancel password change' : 'Change password'}
          </button>
          {pwOpen && (
            <div className="space-y-2">
              <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="New password (min 6 characters)"
                className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3.5 py-2.5 text-sm text-white" />
              <button onClick={() => void changePassword()} className="w-full py-2.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-white text-sm font-medium transition-colors">Update password</button>
            </div>
          )}
          {pwMsg && <p className="text-xs text-neutral-400">{pwMsg}</p>}
          {auth.notice && <p className="text-xs text-green-400">{auth.notice}</p>}
        </div>
      </Section>

      <Section title="Risk & account settings" statusChip={saved ? <span className="text-xs text-green-400">Saved</span> : undefined}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <NumField label="Balance ($)" value={risk.balance} onChange={(v) => setRisk((r) => ({ ...r, balance: v }))} step={50} min={10} />
          <NumField label="Risk % per trade" value={risk.riskPercent} onChange={(v) => setRisk((r) => ({ ...r, riskPercent: v }))} step={0.1} min={0.1} />
          <NumField label="Leverage (futures)" value={risk.leverage} onChange={(v) => setRisk((r) => ({ ...r, leverage: Math.round(v) }))} step={1} min={1} />
          <NumField label="Fee (bps)" value={risk.feeBps} onChange={(v) => setRisk((r) => ({ ...r, feeBps: v }))} step={0.5} min={0} />
          <NumField label="Slippage (bps)" value={risk.slippageBps} onChange={(v) => setRisk((r) => ({ ...r, slippageBps: v }))} step={0.5} min={0} />
        </div>
        <p className="text-xs text-neutral-500 mt-2">Used for the position-size estimates shown on the analysis screen. Estimates only.</p>
        <div className="rounded-xl bg-amber-950/30 border border-amber-900/50 px-3 py-2.5 mt-2">
          <p className="text-xs font-semibold text-amber-400 mb-1">Leverage warning</p>
          <p className="text-[11px] text-amber-200/80 leading-relaxed">
            Leverage multiplies both gains and losses. At {Math.round(risk.leverage)}x, a price move of about {(100 / risk.leverage).toFixed(1)}%
            against you can wipe out the money you put in. The liquidation price on a futures signal is where that happens — the trade is closed
            automatically and your margin is gone. Higher leverage means that price is closer. Never risk money you cannot afford to lose.
          </p>
        </div>
      </Section>

      <Section title="Signal engine thresholds">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <NumField label="ADX threshold" value={engine.adxThreshold} onChange={(v) => setEngine((c) => ({ ...c, adxThreshold: v }))} step={1} min={5} />
          <NumField label="RSI max (long)" value={engine.rsiLongMax} onChange={(v) => setEngine((c) => ({ ...c, rsiLongMax: v }))} step={1} min={50} />
          <NumField label="RSI min (short)" value={engine.rsiShortMin} onChange={(v) => setEngine((c) => ({ ...c, rsiShortMin: v }))} step={1} max={50} />
          <NumField label="Volume factor (x avg)" value={engine.volumeFactor} onChange={(v) => setEngine((c) => ({ ...c, volumeFactor: v }))} step={0.05} min={0.5} />
        </div>
        <div className="space-y-2 mt-3">
          <Toggle label="Require higher-timeframe confirmation" checked={engine.requireHtf} onChange={(v) => setEngine((c) => ({ ...c, requireHtf: v }))} />
          <Toggle label="Require volume confirmation" checked={engine.requireVolume} onChange={(v) => setEngine((c) => ({ ...c, requireVolume: v }))} />
        </div>
      </Section>

      <Section title="Alerts">
        <div className="space-y-2">
          {(Object.keys(DEFAULT_ALERTS) as (keyof typeof DEFAULT_ALERTS)[]).map((k) => (
            <Toggle
              key={k}
              label={({
                newSignals: 'Newly confirmed signals',
                entryZone: 'Entry-zone activation',
                stopLoss: 'Stop-loss events',
                takeProfit: 'Take-profit events',
                invalidation: 'Signal invalidation',
                dataErrors: 'Market-data connection errors',
              } as Record<keyof typeof DEFAULT_ALERTS, string>)[k]}
              checked={app.alertsEnabled[k]}
              onChange={(v) => void app.updateAlerts({ [k]: v })}
            />
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={app.markAlertsRead} className="flex-1 py-2 rounded-lg border border-neutral-700 text-neutral-300 text-xs hover:bg-neutral-800 transition-colors">Mark all read</button>
          <button onClick={app.clearAlerts} className="flex-1 py-2 rounded-lg border border-neutral-700 text-neutral-300 text-xs hover:bg-neutral-800 transition-colors">Clear alerts</button>
        </div>
      </Section>

      <button onClick={() => void save()} disabled={saving}
        className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
        {saving ? 'Saving…' : 'Save settings'}
      </button>

      <p className="text-xs text-neutral-600 text-center px-4">
        SB Crypto Signals is a decision-support tool. It never places trades and never asks for exchange API keys.
      </p>
    </div>
  );
}

function NumField({ label, value, onChange, step, min, max }: { label: string; value: number; onChange: (v: number) => void; step: number; min?: number; max?: number }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-neutral-500 mb-1">{label}</span>
      <input type="number" value={value} step={step} min={min} max={max}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-600" />
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-lg bg-neutral-800/60 px-3.5 py-3 cursor-pointer">
      <span className="text-sm text-neutral-200">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`w-11 h-6 rounded-full transition-colors relative ${checked ? 'bg-green-600' : 'bg-neutral-700'}`}
      >
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </label>
  );
}
