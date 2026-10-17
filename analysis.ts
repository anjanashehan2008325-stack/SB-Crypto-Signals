import { ema } from './indicators';
import type { Candle } from './marketData';
import { analyze as analyzeImpl } from './signalEngine';
import type { Analysis, EngineConfig } from './signalEngine';
import type { MarketType } from './marketData';

export { analyzeImpl as analyze };
export type { Analysis, EngineConfig };

export function emaOf(candles: Candle[], period: number): (number | null)[] {
  return ema(candles.map((c) => c.close), period);
}
