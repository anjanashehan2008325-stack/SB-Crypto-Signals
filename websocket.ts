const WS_SPOT = 'wss://stream.binance.com:9443/ws';
const WS_FUTURES = 'wss://fstream.binance.com/ws';

export type ConnectionState = 'connecting' | 'open' | 'closed' | 'error';

export interface PriceFeed {
  close: () => void;
}

export function openPriceFeed(
  marketType: 'spot' | 'futures',
  symbol: string,
  onPrice: (price: number, changePercent: number) => void,
  onState: (state: ConnectionState) => void,
  onKline?: (candle: { time: number; open: number; high: number; low: number; close: number; volume: number; closed: boolean }) => void,
): PriceFeed {
  const base = marketType === 'futures' ? WS_FUTURES : WS_SPOT;
  const lower = symbol.toLowerCase();
  let ws: WebSocket | null = null;
  let closedByUser = false;
  let retry = 0;
  let reconnectTimer: number | null = null;

  const connect = () => {
    onState(retry === 0 ? 'connecting' : 'connecting');
    try {
      ws = new WebSocket(`${base}/${lower}@ticker/${lower}@kline_1m`);
    } catch {
      onState('error');
      scheduleReconnect();
      return;
    }
    ws.onopen = () => {
      retry = 0;
      onState('open');
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        if (msg.e === '24hrTicker' && msg.data) {
          const d = msg.data;
          const price = Number(d.c);
          const pct = Number(d.P);
          if (Number.isFinite(price) && Number.isFinite(pct)) onPrice(price, pct);
        } else if (msg.e === 'kline' && msg.k) {
          const k = msg.k;
          if (onKline) {
            onKline({
              time: Number(k.t), open: Number(k.o), high: Number(k.h),
              low: Number(k.l), close: Number(k.c), volume: Number(k.v), closed: Boolean(k.x),
            });
          }
        }
      } catch {
        // ignore malformed frames
      }
    };
    ws.onerror = () => onState('error');
    ws.onclose = () => {
      onState('closed');
      if (!closedByUser) scheduleReconnect();
    };
  };

  const scheduleReconnect = () => {
    if (closedByUser || reconnectTimer !== null) return;
    retry = Math.min(retry + 1, 5);
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, Math.min(1000 * 2 ** retry, 15000));
  };

  connect();

  return {
    close: () => {
      closedByUser = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      ws?.close();
    },
  };
}

export function wsBaseUrl(marketType: 'spot' | 'futures'): string {
  return marketType === 'futures' ? WS_FUTURES : WS_SPOT;
}
