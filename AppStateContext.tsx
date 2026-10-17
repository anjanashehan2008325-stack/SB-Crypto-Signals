import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { EngineConfig } from '../services/signalEngine';
import { DEFAULT_CONFIG } from '../services/signalEngine';
import { DEFAULT_RISK, type RiskSettings } from '../services/risk';
import type { MarketType } from '../services/marketData';

export interface AlertCategories {
  newSignals: boolean;
  entryZone: boolean;
  stopLoss: boolean;
  takeProfit: boolean;
  invalidation: boolean;
  dataErrors: boolean;
}

export const DEFAULT_ALERTS: AlertCategories = {
  newSignals: true, entryZone: true, stopLoss: true, takeProfit: true, invalidation: true, dataErrors: true,
};

export interface Alert {
  id: string;
  category: keyof AlertCategories;
  title: string;
  body: string;
  symbol?: string;
  timeframe?: string;
  createdAt: number;
  read: boolean;
}

export interface FavoriteRow { market_type: string; symbol: string; base: string; quote: string }

export interface SavedSignalRow {
  id: string;
  market_type: string;
  symbol: string;
  timeframe: string;
  direction: string;
  entry: number;
  stop_loss: number;
  tps: { price: number; rr: number }[];
  rr: number | null;
  strength: string | null;
  status: string;
  created_at: string;
}

export interface JournalTradeRow {
  id: string;
  market_type: string;
  symbol: string;
  timeframe: string | null;
  direction: string;
  entry_price: number;
  exit_price: number | null;
  stop_loss: number | null;
  tp1: number | null;
  quantity: number | null;
  fees: number | null;
  pnl: number | null;
  status: string;
  notes: string | null;
  opened_at: string;
  closed_at: string | null;
}

interface AppStateValue {
  risk: RiskSettings;
  engineConfig: EngineConfig;
  alertsEnabled: AlertCategories;
  favorites: FavoriteRow[];
  savedSignals: SavedSignalRow[];
  journal: JournalTradeRow[];
  alerts: Alert[];
  lastViewed: { marketType: MarketType; symbol: string; timeframe: string } | null;
  loading: boolean;
  updateRisk: (r: Partial<RiskSettings>) => Promise<void>;
  updateEngineConfig: (c: Partial<EngineConfig>) => Promise<void>;
  updateAlerts: (a: Partial<AlertCategories>) => Promise<void>;
  toggleFavorite: (row: FavoriteRow) => Promise<void>;
  isFavorite: (marketType: string, symbol: string) => boolean;
  saveSignal: (s: Omit<SavedSignalRow, 'id' | 'created_at'>) => Promise<void>;
  deleteSignal: (id: string) => Promise<void>;
  addTrade: (t: Omit<JournalTradeRow, 'id' | 'opened_at' | 'closed_at'>) => Promise<void>;
  closeTrade: (id: string, exitPrice: number, pnl: number) => Promise<void>;
  deleteTrade: (id: string) => Promise<void>;
  pushAlert: (a: Omit<Alert, 'id' | 'createdAt' | 'read'>) => void;
  markAlertsRead: () => void;
  clearAlerts: () => void;
  setLastViewed: (v: { marketType: MarketType; symbol: string; timeframe: string }) => void;
  refresh: () => Promise<void>;
}

const AppStateContext = createContext<AppStateValue | null>(null);

const LS_LAST = 'crypto-sig-last-viewed';

export function AppStateProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const [risk, setRisk] = useState<RiskSettings>(DEFAULT_RISK);
  const [engineConfig, setEngineConfig] = useState<EngineConfig>(DEFAULT_CONFIG);
  const [alertsEnabled, setAlertsEnabled] = useState<AlertCategories>(DEFAULT_ALERTS);
  const [favorites, setFavorites] = useState<FavoriteRow[]>([]);
  const [savedSignals, setSavedSignals] = useState<SavedSignalRow[]>([]);
  const [journal, setJournal] = useState<JournalTradeRow[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [lastViewed, setLastViewedState] = useState<{ marketType: MarketType; symbol: string; timeframe: string } | null>(() => {
    try {
      const raw = localStorage.getItem(LS_LAST);
      return raw ? (JSON.parse(raw) as { marketType: MarketType; symbol: string; timeframe: string }) : null;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(enabled);

  const refresh = useCallback(async () => {
    if (!enabled) { setLoading(false); return; }
    setLoading(true);
    const [settingsRes, favRes, sigRes, journalRes] = await Promise.all([
      supabase.from('user_settings').select('*').maybeSingle(),
      supabase.from('favorites').select('*'),
      supabase.from('saved_signals').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('journal_trades').select('*').order('opened_at', { ascending: false }).limit(200),
    ]);
    if (settingsRes.data) {
      setRisk({
        balance: Number(settingsRes.data.balance) || DEFAULT_RISK.balance,
        riskPercent: Number(settingsRes.data.risk_percent) || DEFAULT_RISK.riskPercent,
        leverage: Number(settingsRes.data.leverage) || DEFAULT_RISK.leverage,
        feeBps: Number(settingsRes.data.fee_bps) || DEFAULT_RISK.feeBps,
        slippageBps: Number(settingsRes.data.slippage_bps) || DEFAULT_RISK.slippageBps,
      });
      try { setEngineConfig({ ...DEFAULT_CONFIG, ...(JSON.parse(settingsRes.data.engine_config) as EngineConfig) }); } catch { /* keep default */ }
      try { setAlertsEnabled({ ...DEFAULT_ALERTS, ...(JSON.parse(settingsRes.data.alert_categories) as AlertCategories) }); } catch { /* keep default */ }
    }
    if (favRes.data) setFavorites(favRes.data as FavoriteRow[]);
    if (sigRes.data) setSavedSignals(sigRes.data as SavedSignalRow[]);
    if (journalRes.data) setJournal(journalRes.data as JournalTradeRow[]);
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    if (enabled) void refresh();
    else setLoading(false);
  }, [enabled, refresh]);

  const upsertSettings = useCallback(async (patch: Record<string, unknown>) => {
    if (!enabled) return;
    const { error } = await supabase.from('user_settings').upsert(patch, { onConflict: 'user_id' });
    if (error) throw new Error(error.message);
  }, [enabled]);

  const updateRisk = useCallback(async (r: Partial<RiskSettings>) => {
    const next = { ...risk, ...r };
    setRisk(next);
    await upsertSettings({
      balance: next.balance, risk_percent: next.riskPercent, leverage: next.leverage,
      fee_bps: next.feeBps, slippage_bps: next.slippageBps,
    });
  }, [risk, upsertSettings]);

  const updateEngineConfig = useCallback(async (c: Partial<EngineConfig>) => {
    const next = { ...engineConfig, ...c };
    setEngineConfig(next);
    await upsertSettings({ engine_config: JSON.stringify(next) });
  }, [engineConfig, upsertSettings]);

  const updateAlerts = useCallback(async (a: Partial<AlertCategories>) => {
    const next = { ...alertsEnabled, ...a };
    setAlertsEnabled(next);
    await upsertSettings({ alert_categories: JSON.stringify(next) });
  }, [alertsEnabled, upsertSettings]);

  const toggleFavorite = useCallback(async (row: FavoriteRow) => {
    const exists = favorites.some((f) => f.market_type === row.market_type && f.symbol === row.symbol);
    if (exists) {
      setFavorites((prev) => prev.filter((f) => !(f.market_type === row.market_type && f.symbol === row.symbol)));
      if (enabled) await supabase.from('favorites').delete().eq('market_type', row.market_type).eq('symbol', row.symbol);
    } else {
      setFavorites((prev) => [...prev, row]);
      if (enabled) {
        const { error } = await supabase.from('favorites').insert(row);
        if (error) setFavorites((prev) => prev.filter((f) => !(f.market_type === row.market_type && f.symbol === row.symbol)));
      }
    }
  }, [favorites, enabled]);

  const isFavorite = useCallback((marketType: string, symbol: string) =>
    favorites.some((f) => f.market_type === marketType && f.symbol === symbol), [favorites]);

  const saveSignal = useCallback(async (s: Omit<SavedSignalRow, 'id' | 'created_at'>) => {
    if (enabled) {
      const { data, error } = await supabase.from('saved_signals').insert(s).select().single();
      if (error || !data) throw new Error(error?.message ?? 'Failed to save signal.');
      setSavedSignals((prev) => [data as SavedSignalRow, ...prev]);
    }
  }, [enabled]);

  const deleteSignal = useCallback(async (id: string) => {
    setSavedSignals((prev) => prev.filter((s) => s.id !== id));
    if (enabled) await supabase.from('saved_signals').delete().eq('id', id);
  }, [enabled]);

  const addTrade = useCallback(async (t: Omit<JournalTradeRow, 'id' | 'opened_at' | 'closed_at'>) => {
    if (enabled) {
      const { data, error } = await supabase.from('journal_trades').insert(t).select().single();
      if (error || !data) throw new Error(error?.message ?? 'Failed to add trade.');
      setJournal((prev) => [data as JournalTradeRow, ...prev]);
    }
  }, [enabled]);

  const closeTrade = useCallback(async (id: string, exitPrice: number, pnl: number) => {
    setJournal((prev) => prev.map((t) => t.id === id ? { ...t, status: 'closed', exit_price: exitPrice, pnl, closed_at: new Date().toISOString() } : t));
    if (enabled) {
      await supabase.from('journal_trades').update({
        status: 'closed', exit_price: exitPrice, pnl, closed_at: new Date().toISOString(),
      }).eq('id', id);
    }
  }, [enabled]);

  const deleteTrade = useCallback(async (id: string) => {
    setJournal((prev) => prev.filter((t) => t.id !== id));
    if (enabled) await supabase.from('journal_trades').delete().eq('id', id);
  }, [enabled]);

  const pushAlert = useCallback((a: Omit<Alert, 'id' | 'createdAt' | 'read'>) => {
    setAlerts((prev) => {
      const alert: Alert = { ...a, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: Date.now(), read: false };
      const next = [alert, ...prev].slice(0, 200);
      return next;
    });
    if (enabled) {
      void supabase.from('alerts_log').insert({
        category: a.category, title: a.title, body: a.body,
        market_type: null, symbol: a.symbol ?? null, timeframe: a.timeframe ?? null,
      });
    }
  }, [enabled]);

  const markAlertsRead = useCallback(() => setAlerts((prev) => prev.map((a) => ({ ...a, read: true }))), []);
  const clearAlerts = useCallback(() => setAlerts([]), []);

  const setLastViewed = useCallback((v: { marketType: MarketType; symbol: string; timeframe: string }) => {
    setLastViewedState(v);
    try { localStorage.setItem(LS_LAST, JSON.stringify(v)); } catch { /* ignore */ }
  }, []);

  return (
    <AppStateContext.Provider value={{
      risk, engineConfig, alertsEnabled, favorites, savedSignals, journal, alerts, lastViewed, loading,
      updateRisk, updateEngineConfig, updateAlerts, toggleFavorite, isFavorite,
      saveSignal, deleteSignal, addTrade, closeTrade, deleteTrade,
      pushAlert, markAlertsRead, clearAlerts, setLastViewed, refresh,
    }}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
