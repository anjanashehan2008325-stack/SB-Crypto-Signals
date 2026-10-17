
import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { AppStateProvider, useAppState } from './AppStateContext';
import { ErrorBoundary, Loading, SBLogo } from './ErrorPanel';
import {
  SignInScreen,
  RegisterScreen,
  ForgotPasswordScreen,
  VerifyEmailScreen,
} from './AuthScreens';
import HomeScreen from './HomeScreen';
import AnalysisScreen, { type Timeframe } from './AnalysisScreen';
import SearchScreen from './SearchScreen';
import ScannerScreen from './ScannerScreen';
import BacktestScreen from './BacktestScreen';
import JournalScreen from './JournalScreen';
import SettingsScreen from './SettingsScreen';
import {
  BarChart3,
  BookOpen,
  Home,
  Radar,
  Search,
} from 'lucide-react';
import type { MarketType } from './marketData';

type Screen =
  | 'home'
  | 'analysis'
  | 'search'
  | 'scanner'
  | 'backtest'
  | 'journal'
  | 'settings'
  | 'alerts';

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </ErrorBoundary>
  );
}

function Root() {
  const auth = useAuth();

  if (auth.status === 'loading') {
    return (
      <div className="min-h-screen bg-[#060b14] flex items-center justify-center">
        <Loading label="Welcome to SB Crypto Signals" />
      </div>
    );
  }

  if (auth.status === 'signedOut') return <AuthFlow />;

  if (auth.status === 'needsVerification') {
    return <VerifyEmailScreen onSignedIn={() => undefined} />;
  }

  return (
    <AppStateProvider enabled>
      <MainApp />
    </AppStateProvider>
  );
}

function AuthFlow() {
  const [screen, setScreen] = useState<
    'signin' | 'register' | 'forgot'
  >('signin');

  if (screen === 'register') {
    return (
      <ErrorBoundary>
        <RegisterScreen
          onBackToSignIn={() => setScreen('signin')}
        />
      </ErrorBoundary>
    );
  }

  if (screen === 'forgot') {
    return (
      <ErrorBoundary>
        <ForgotPasswordScreen
          onBack={() => setScreen('signin')}
        />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <SignInScreen
        onNeedsRegister={() => setScreen('register')}
        onForgot={() => setScreen('forgot')}
      />
    </ErrorBoundary>
  );
}

function MainApp() {
  const app = useAppState();

  const [screen, setScreen] = useState<Screen>('home');
  const [marketType, setMarketType] = useState<MarketType>('spot');
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    if (!restored && !app.loading) {
      if (app.lastViewed) {
        setMarketType(app.lastViewed.marketType);
        setSymbol(app.lastViewed.symbol);
        setTimeframe(app.lastViewed.timeframe as Timeframe);
      }
      setRestored(true);
    }
  }, [app.loading, app.lastViewed, restored]);

  useEffect(() => {
    app.setLastViewed({ marketType, symbol, timeframe });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketType, symbol, timeframe]);

  const openCoin = (mt: MarketType, sym: string) => {
    setMarketType(mt);
    setSymbol(sym);
    setScreen('analysis');
  };

  const marketSwitch = (
    <div className="max-w-3xl mx-auto px-4 pt-2">
      <div className="flex rounded-xl bg-[#0b1220] border border-neutral-800 p-1">
        {(['spot', 'futures'] as MarketType[]).map((m) => (
          <button
            key={m}
            onClick={() => setMarketType(m)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${
              marketType === m
                ? m === 'futures'
                  ? 'bg-amber-600 text-white'
                  : 'bg-green-600 text-white'
                : 'text-neutral-400'
            }`}
          >
            {m === 'futures'
              ? 'FUTURES (up or down)'
              : 'SPOT (own the coin)'}
          </button>
        ))}
      </div>

      {marketType === 'futures' && (
        <p className="text-[11px] text-amber-500/90 mt-1 px-1">
          Futures lets you trade price moves up or down — losses can grow quickly with leverage.
        </p>
      )}
    </div>
  );

  const unread = app.alerts.filter((a) => !a.read).length;

  return (
    <div className="min-h-screen bg-[#060b14] text-neutral-100">
      <main className="pt-2">
        <ErrorBoundary>
          {screen === 'home' && (
            <>
              {marketSwitch}
              <HomeScreen
                marketType={marketType}
                onGo={setScreen}
                onOpenCoin={openCoin}
                unread={unread}
              />
            </>
          )}

          {screen === 'analysis' && (
            <>
              {marketSwitch}
              <AnalysisScreen
                key={`${marketType}:${symbol}`}
                marketType={marketType}
                symbol={symbol}
                timeframe={timeframe}
                onTimeframeChange={setTimeframe}
              />
            </>
          )}

          {screen === 'search' && (
            <SearchScreen
              marketType={marketType}
              onSelect={openCoin}
            />
          )}

          {screen === 'scanner' && (
            <ScannerScreen
              marketType={marketType}
              onOpen={openCoin}
            />
          )}

          {screen === 'backtest' && (
            <BacktestScreen
              onPickSymbol={() => setScreen('search')}
            />
          )}

          {screen === 'journal' && (
            <JournalScreen onOpen={openCoin} />
          )}

          {screen === 'settings' && <SettingsScreen />}

          {screen === 'alerts' && (
            <AlertsScreen onBack={() => setScreen('home')} />
          )}
        </ErrorBoundary>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#060b14]/97 backdrop-blur border-t border-neutral-800 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-3xl mx-auto flex">
          {([
            ['home', Home, 'Home'],
            ['search', Search, 'Find'],
            ['scanner', Radar, 'Scan'],
            ['backtest', BarChart3, 'Test'],
            ['journal', BookOpen, 'Trades'],
          ] as [Screen, typeof Search, string][]).map(
            ([id, Icon, label]) => (
              <button
                key={id}
                onClick={() => setScreen(id)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors ${
                  screen === id
                    ? 'text-green-400'
                    : 'text-neutral-500 hover:text-neutral-300'
                }`}
              >
                <Icon size={20} />
                <span className="text-[10px] font-semibold">
                  {label}
                </span>
              </button>
            )
          )}
        </div>
      </nav>
    </div>
  );
}

function AlertsScreen({ onBack }: { onBack: () => void }) {
  const app = useAppState();

  useEffect(() => {
    app.markAlertsRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 pb-28 pt-4 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-bold text-white">
          Notifications
        </h1>

        <div className="flex gap-3">
          <button
            onClick={app.clearAlerts}
            className="text-xs text-neutral-400 hover:text-neutral-200"
          >
            Clear all
          </button>
          <button
            onClick={onBack}
            className="text-xs text-green-400 hover:text-green-300"
          >
            Done
          </button>
        </div>
      </div>

      {app.alerts.length === 0 ? (
        <div className="rounded-2xl bg-[#0b1220] border border-neutral-800">
          <div className="flex flex-col items-center justify-center py-14 px-6 text-center gap-2">
            <SBLogo size={40} withName={false} />
            <h3 className="text-base font-semibold text-neutral-200">
              No notifications yet
            </h3>
            <p className="text-sm text-neutral-400 max-w-sm">
              When a coin you're viewing reaches its entry, Stop Loss, or a Target — or loses connection — you'll see it here.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {app.alerts.map((a) => (
            <div
              key={a.id}
              className="rounded-2xl bg-[#0b1220] border border-neutral-800 px-4 py-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-neutral-100">
                  {a.title}
                </p>
                <span className="text-[10px] text-neutral-500 shrink-0">
                  {new Date(a.createdAt).toLocaleTimeString()}
                </span>
              </div>
              {a.body && (
                <p className="text-xs text-neutral-400 mt-0.5">
                  {a.body}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
