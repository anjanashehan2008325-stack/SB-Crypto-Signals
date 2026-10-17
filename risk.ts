export interface RiskSettings {
  balance: number;
  riskPercent: number;
  leverage: number;
  feeBps: number;
  slippageBps: number;
}

export const DEFAULT_RISK: RiskSettings = {
  balance: 1000,
  riskPercent: 1,
  leverage: 5,
  feeBps: 7.5,
  slippageBps: 5,
};

export interface PositionPlan {
  direction: 'LONG' | 'SHORT';
  entry: number;
  stopLoss: number;
  tps: { price: number; rr: number }[];
  riskAmount: number;
  quantity: number;
  notional: number;
  margin: number;
  liquidationEstimate: number | null;
  estimatedFees: number;
  estimatedSlippage: number;
  riskPct: number;
}

export function planPosition(
  settings: RiskSettings,
  direction: 'LONG' | 'SHORT',
  entry: number,
  stopLoss: number,
  tps: { price: number; rr: number }[],
  minQty = 0,
  minNotional = 0,
): PositionPlan | null {
  if (!(entry > 0) || !(stopLoss > 0)) return null;
  const long = direction === 'LONG';
  if (long ? stopLoss >= entry : stopLoss <= entry) return null;

  const riskAmount = (settings.balance * settings.riskPercent) / 100;
  const perUnitRisk = Math.abs(entry - stopLoss);
  if (perUnitRisk <= 0) return null;

  let quantity = riskAmount / perUnitRisk;
  let notional = quantity * entry;
  const levCap = (settings.balance * settings.leverage) / entry;
  if (notional > levCap * entry) {
    notional = levCap * entry;
    quantity = notional / entry;
  }
  if (minNotional > 0 && quantity * entry < minNotional) return null;
  if (minQty > 0 && quantity < minQty) return null;

  const margin = notional / settings.leverage;
  const fees = (notional * settings.feeBps) / 10000;
  const slippage = (notional * settings.slippageBps) / 10000;
  const liqDist = entry / settings.leverage;
  const liquidationEstimate = settings.leverage > 1 ? (long ? entry - liqDist : entry + liqDist) : null;

  return {
    direction, entry, stopLoss, tps,
    riskAmount, quantity, notional, margin, liquidationEstimate,
    estimatedFees: fees, estimatedSlippage: slippage,
    riskPct: (riskAmount / settings.balance) * 100,
  };
}
