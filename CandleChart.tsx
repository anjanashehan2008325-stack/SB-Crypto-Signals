import { useEffect, useRef } from 'react';
import { createChart, ColorType, type IChartApi, type ISeriesApi, type IPriceLine, type UTCTimestamp } from 'lightweight-charts';
import type { Candle } from '../services/marketData';

interface Props {
  candles: Candle[];
  ema50: (number | null)[];
  ema200: (number | null)[];
  supports: number[];
  resistances: number[];
  entry?: number | null;
  stopLoss?: number | null;
  tps?: number[];
}

function toLine(candles: Candle[], values: (number | null)[]) {
  const out: { time: UTCTimestamp; value: number }[] = [];
  for (let i = 0; i < candles.length; i++) {
    const v = values[i];
    if (v !== null && Number.isFinite(v)) {
      out.push({ time: (candles[i].time / 1000) as UTCTimestamp, value: v });
    }
  }
  return out;
}

export default function CandleChart({ candles, ema50, ema200, supports, resistances, entry, stopLoss, tps }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const ema50Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const ema200Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0c0f14' },
        textColor: '#8b93a1',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.08)', timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
      autoSize: true,
    });
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e', downColor: '#ef4444',
      borderUpColor: '#22c55e', borderDownColor: '#ef4444',
      wickUpColor: '#22c55e', wickDownColor: '#ef4444',
      priceFormat: { type: 'price', precision: 6, minMove: 0.000001 },
    });
    const e50 = chart.addLineSeries({ color: '#3b82f6', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    const e200 = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    ema50Ref.current = e50;
    ema200Ref.current = e200;
    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      ema50Ref.current = null;
      ema200Ref.current = null;
    };
  }, []);

  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series || candles.length === 0) return;
    const data = candles.map((c) => ({
      time: (c.time / 1000) as UTCTimestamp,
      open: c.open, high: c.high, low: c.low, close: c.close,
    }));
    series.setData(data);
    series.applyOptions({ priceFormat: { type: 'price', precision: priceDecimals(candles), minMove: minMove(candles) } });
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  useEffect(() => {
    ema50Ref.current?.setData(toLine(candles, ema50));
    ema200Ref.current?.setData(toLine(candles, ema200));
  }, [candles, ema50, ema200]);

  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    for (const line of priceLinesRef.current) {
      try { series.removePriceLine(line); } catch { /* chart disposed */ }
    }
    priceLinesRef.current = [];
    const add = (price: number, color: string, title: string) => {
      if (!Number.isFinite(price) || price <= 0) return;
      priceLinesRef.current.push(series.createPriceLine({
        price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title,
      }));
    };
    supports.slice(0, 3).forEach((p) => add(p, '#16a34a', 'S'));
    resistances.slice(0, 3).forEach((p) => add(p, '#dc2626', 'R'));
    if (entry) add(entry, '#3b82f6', 'ENTRY');
    if (stopLoss) add(stopLoss, '#ef4444', 'SL');
    (tps ?? []).forEach((p, i) => add(p, '#22c55e', `TP${i + 1}`));
  }, [supports, resistances, entry, stopLoss, tps]);

  return <div ref={containerRef} className="w-full h-[320px] sm:h-[420px]" />;
}

function priceDecimals(candles: Candle[]): number {
  const price = candles[candles.length - 1]?.close ?? 1;
  if (price >= 1000) return 2;
  if (price >= 1) return 4;
  if (price >= 0.01) return 5;
  return 7;
}

function minMove(candles: Candle[]): number {
  return Number(`1e-${priceDecimals(candles)}`);
}
