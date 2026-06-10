// Live crypto candles with a graceful offline simulator fallback.
// Tries Binance, then Coinbase. If both are unreachable (e.g. a locked-down
// network), it generates a believable random-walk market so the app still runs.
import { getState, saveState } from './store.js';

const SYMBOLS = {
  BTC: { binance: 'BTCUSDT', coinbase: 'BTC-USD', seed: 65000 },
  ETH: { binance: 'ETHUSDT', coinbase: 'ETH-USD', seed: 3400 },
  SOL: { binance: 'SOLUSDT', coinbase: 'SOL-USD', seed: 150 },
  XRP: { binance: 'XRPUSDT', coinbase: 'XRP-USD', seed: 0.6 },
  DOGE: { binance: 'DOGEUSDT', coinbase: 'DOGE-USD', seed: 0.16 },
  ADA: { binance: 'ADAUSDT', coinbase: 'ADA-USD', seed: 0.45 },
};

export function supportedSymbols() {
  return Object.keys(SYMBOLS);
}

const TIMEOUT_MS = 8000;

async function fetchBinance(sym) {
  const map = SYMBOLS[sym];
  if (!map) return null;
  const url = `https://api.binance.com/api/v3/klines?symbol=${map.binance}&interval=1m&limit=100`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) return null;
  const rows = await res.json();
  if (!Array.isArray(rows)) return null;
  return rows.map((r) => ({ t: r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4] }));
}

async function fetchCoinbase(sym) {
  const map = SYMBOLS[sym];
  if (!map) return null;
  // Coinbase Exchange: [time(s), low, high, open, close, volume], newest first.
  const url = `https://api.exchange.coinbase.com/products/${map.coinbase}/candles?granularity=60`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) return null;
  const rows = await res.json();
  if (!Array.isArray(rows)) return null;
  return rows
    .map((r) => ({ t: r[0] * 1000, o: +r[3], h: +r[2], l: +r[1], c: +r[4] }))
    .sort((a, b) => a.t - b.t)
    .slice(-100);
}

// --- Offline simulator -----------------------------------------------------
function gaussian() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function nextCandle(prevClose, t) {
  const vol = 0.004;                       // ~0.4% per-minute volatility
  const drift = (Math.random() - 0.5) * 0.0006;
  const close = Math.max(1e-8, prevClose * (1 + drift + vol * gaussian()));
  const hi = Math.max(prevClose, close) * (1 + Math.random() * vol);
  const lo = Math.min(prevClose, close) * (1 - Math.random() * vol);
  return { t, o: prevClose, h: hi, l: lo, c: close };
}

function advanceSimulator(sym) {
  const s = getState();
  const seed = SYMBOLS[sym]?.seed ?? 100;
  s.marketState[sym] = s.marketState[sym] || { lastPrice: seed, candles: [], source: 'simulated' };
  const ms = s.marketState[sym];

  if (!ms.candles || ms.candles.length < 30) {
    // Bootstrap ~100 minutes of history ending now.
    const now = Date.now();
    let price = ms.lastPrice || seed;
    const candles = [];
    for (let i = 99; i >= 0; i--) {
      const candle = nextCandle(price, now - i * 60_000);
      price = candle.c;
      candles.push(candle);
    }
    ms.candles = candles;
  } else {
    const last = ms.candles[ms.candles.length - 1];
    ms.candles.push(nextCandle(last.c, Date.now()));
    ms.candles = ms.candles.slice(-150);
  }
  ms.lastPrice = ms.candles[ms.candles.length - 1].c;
  ms.source = 'simulated';
  saveState();
  return ms.candles.slice();
}

// Returns { candles, source }. source is 'live:binance' | 'live:coinbase' | 'simulated'.
export async function getMarket(sym) {
  for (const [name, fn] of [['live:binance', fetchBinance], ['live:coinbase', fetchCoinbase]]) {
    try {
      const candles = await fn(sym);
      if (candles && candles.length > 20) return { candles, source: name };
    } catch {
      /* fall through to next source */
    }
  }
  return { candles: advanceSimulator(sym), source: 'simulated' };
}
