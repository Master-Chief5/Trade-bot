// Live market candles with a graceful offline simulator fallback.
// Crypto: Binance, then Coinbase. Stocks/ETFs: Yahoo Finance chart API.
// If live sources are unreachable (e.g. a locked-down network, or stock data
// in a desktop browser where Yahoo blocks CORS), it generates a believable
// random-walk market so the app still runs.
import { getState, saveState } from './store.js';

const SYMBOLS = {
  // Crypto — Binance/Coinbase public APIs (work in browsers and in the app).
  BTC: { type: 'crypto', binance: 'BTCUSDT', coinbase: 'BTC-USD', seed: 65000 },
  ETH: { type: 'crypto', binance: 'ETHUSDT', coinbase: 'ETH-USD', seed: 3400 },
  SOL: { type: 'crypto', binance: 'SOLUSDT', coinbase: 'SOL-USD', seed: 150 },
  XRP: { type: 'crypto', binance: 'XRPUSDT', coinbase: 'XRP-USD', seed: 0.6 },
  DOGE: { type: 'crypto', binance: 'DOGEUSDT', coinbase: 'DOGE-USD', seed: 0.16 },
  ADA: { type: 'crypto', binance: 'ADAUSDT', coinbase: 'ADA-USD', seed: 0.45 },
  // US stocks & ETFs — Yahoo Finance chart API (no key needed). Yahoo sends no
  // CORS headers, so desktop browsers fall back to the simulator for these;
  // the Android app fetches natively and gets live data.
  AAPL: { type: 'stock', yahoo: 'AAPL', seed: 230 },
  MSFT: { type: 'stock', yahoo: 'MSFT', seed: 520 },
  NVDA: { type: 'stock', yahoo: 'NVDA', seed: 190 },
  TSLA: { type: 'stock', yahoo: 'TSLA', seed: 340 },
  AMZN: { type: 'stock', yahoo: 'AMZN', seed: 220 },
  GOOGL: { type: 'stock', yahoo: 'GOOGL', seed: 195 },
  META: { type: 'stock', yahoo: 'META', seed: 720 },
  SPY: { type: 'stock', yahoo: 'SPY', seed: 640 },
};

export function supportedSymbols() {
  return Object.keys(SYMBOLS);
}

export function symbolGroups() {
  const groups = { crypto: [], stocks: [] };
  for (const [sym, m] of Object.entries(SYMBOLS)) {
    (m.type === 'stock' ? groups.stocks : groups.crypto).push(sym);
  }
  return groups;
}

export function symbolMeta(sym) {
  return SYMBOLS[sym] || null;
}

export function assetLabel(sym) {
  return SYMBOLS[sym]?.type === 'stock' ? `${sym} (US stock/ETF)` : `${sym}/USD (crypto)`;
}

const TIMEOUT_MS = 8000;

async function fetchBinance(sym) {
  const map = SYMBOLS[sym];
  if (!map?.binance) return null;
  const url = `https://api.binance.com/api/v3/klines?symbol=${map.binance}&interval=1m&limit=100`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) return null;
  const rows = await res.json();
  if (!Array.isArray(rows)) return null;
  return rows.map((r) => ({ t: r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4] }));
}

async function fetchCoinbase(sym) {
  const map = SYMBOLS[sym];
  if (!map?.coinbase) return null;
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

async function fetchYahoo(sym) {
  const map = SYMBOLS[sym];
  if (!map?.yahoo) return null;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${map.yahoo}?interval=1m&range=1d`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) return null;
  const data = await res.json();
  const r = data?.chart?.result?.[0];
  const ts = r?.timestamp;
  const q = r?.indicators?.quote?.[0];
  if (!Array.isArray(ts) || !q) return null;
  const candles = [];
  for (let i = 0; i < ts.length; i++) {
    if (q.open?.[i] == null || q.close?.[i] == null) continue; // gaps in halted minutes
    candles.push({ t: ts[i] * 1000, o: +q.open[i], h: +q.high[i], l: +q.low[i], c: +q.close[i] });
  }
  return candles.slice(-100);
}

function liveFetchers(sym) {
  return SYMBOLS[sym]?.type === 'stock'
    ? [['live:yahoo', fetchYahoo]]
    : [['live:binance', fetchBinance], ['live:coinbase', fetchCoinbase]];
}

// Latest live candles only (no simulator fallback) — used by the price feed.
export async function fetchLiveCandles(sym) {
  for (const [, fn] of liveFetchers(sym)) {
    try {
      const candles = await fn(sym);
      if (candles && candles.length > 20) return candles;
    } catch {
      /* try next source */
    }
  }
  return null;
}

// --- Offline simulator -----------------------------------------------------
function gaussian() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function perMinuteVol(sym) {
  // Stocks wiggle far less than crypto per minute.
  return SYMBOLS[sym]?.type === 'stock' ? 0.0015 : 0.004;
}

function nextCandle(prevClose, t, vol) {
  const drift = (Math.random() - 0.5) * 0.0006;
  const close = Math.max(1e-8, prevClose * (1 + drift + vol * gaussian()));
  const hi = Math.max(prevClose, close) * (1 + Math.random() * vol);
  const lo = Math.min(prevClose, close) * (1 - Math.random() * vol);
  return { t, o: prevClose, h: hi, l: lo, c: close };
}

function advanceSimulator(sym) {
  const s = getState();
  const seed = SYMBOLS[sym]?.seed ?? 100;
  const vol = perMinuteVol(sym);
  s.marketState[sym] = s.marketState[sym] || { lastPrice: seed, candles: [], source: 'simulated' };
  const ms = s.marketState[sym];

  if (!ms.candles || ms.candles.length < 30) {
    // Bootstrap ~100 minutes of history ending now.
    const now = Date.now();
    let price = ms.lastPrice || seed;
    const candles = [];
    for (let i = 99; i >= 0; i--) {
      const candle = nextCandle(price, now - i * 60_000, vol);
      price = candle.c;
      candles.push(candle);
    }
    ms.candles = candles;
  } else {
    const last = ms.candles[ms.candles.length - 1];
    ms.candles.push(nextCandle(last.c, Date.now(), vol));
    ms.candles = ms.candles.slice(-150);
  }
  ms.lastPrice = ms.candles[ms.candles.length - 1].c;
  ms.source = 'simulated';
  saveState();
  return ms.candles.slice();
}

// One small price wiggle on the latest candle — gives simulated data the same
// live, ticking feel as a real feed.
export function simulateTick(sym) {
  const s = getState();
  const ms = s.marketState[sym];
  if (!ms?.candles?.length) return null;
  const tickVol = perMinuteVol(sym) / 4;
  const last = ms.candles[ms.candles.length - 1];
  const price = Math.max(1e-8, last.c * (1 + (Math.random() - 0.5) * tickVol));
  last.c = price;
  if (price > last.h) last.h = price;
  if (price < last.l) last.l = price;
  ms.lastPrice = price;
  saveState();
  return price;
}

// Returns { candles, source }.
// source: 'live:binance' | 'live:coinbase' | 'live:yahoo' (± ' (market closed)') | 'simulated'.
export async function getMarket(sym) {
  for (const [name, fn] of liveFetchers(sym)) {
    try {
      const candles = await fn(sym);
      if (candles && candles.length > 20) {
        let source = name;
        // Stock candles stop updating outside US market hours — say so.
        if (SYMBOLS[sym]?.type === 'stock' && Date.now() - candles[candles.length - 1].t > 20 * 60_000) {
          source += ' (market closed)';
        }
        return { candles, source };
      }
    } catch {
      /* fall through to next source */
    }
  }
  return { candles: advanceSimulator(sym), source: 'simulated' };
}
