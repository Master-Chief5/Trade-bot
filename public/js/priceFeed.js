// Live price feed — streams real-time prices into the app between analysis
// cycles so the price, chart and unrealized P&L move continuously.
//
//   live:binance   → Binance WebSocket, 1-minute kline stream (also tells us
//                    the moment a candle closes, which triggers a decision)
//   live:coinbase  → Coinbase Exchange WebSocket, ticker channel
//   live:yahoo     → poll the chart API every 15s (stocks have no public WS)
//   simulated      → a small random wiggle every 3s
import { getState, saveState } from './store.js';
import { symbolMeta, fetchLiveCandles, simulateTick } from './marketData.js';

let ws = null;
let pollTimer = null;
let current = { sym: null, mode: 'none' };
let tickHandler = null;
let candleCloseHandler = null;
let alive = false;

export function onTick(fn) { tickHandler = fn; }
export function onCandleClose(fn) { candleCloseHandler = fn; }
export function feedAlive() { return alive; }

function emitTick(price) {
  alive = true;
  if (tickHandler) tickHandler(price);
}

// Fold a streamed price into the stored candles (extend the last candle, or
// open a new one when the stream reports a newer candle start time).
function applyPrice(sym, price, candleTime) {
  const s = getState();
  const ms = s.marketState[sym];
  if (!ms?.candles?.length) return;
  const last = ms.candles[ms.candles.length - 1];
  if (candleTime && candleTime > last.t) {
    ms.candles.push({ t: candleTime, o: price, h: price, l: price, c: price });
    ms.candles = ms.candles.slice(-150);
  } else {
    last.c = price;
    if (price > last.h) last.h = price;
    if (price < last.l) last.l = price;
  }
  ms.lastPrice = price;
  saveState();
}

export function stopFeed() {
  if (ws) { try { ws.close(); } catch { /* already closed */ } ws = null; }
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  alive = false;
  current = { sym: null, mode: 'none' };
}

// (Re)start the right feed for the current symbol and whatever data source the
// last analysis cycle ended up using. Safe to call often; it's a no-op when
// the right feed is already running.
export function ensureFeed() {
  const s = getState();
  const sym = s.config.symbol;
  const source = s.marketState[sym]?.source || 'none';
  const meta = symbolMeta(sym);
  const mode =
    source === 'live:binance' ? 'binance-ws'
    : source === 'live:coinbase' ? 'coinbase-ws'
    : source.startsWith('live:yahoo') ? 'poll'
    : source === 'simulated' ? 'sim'
    : 'none';

  if (current.sym === sym && current.mode === mode && (ws || pollTimer)) return;
  stopFeed();
  current = { sym, mode };
  if (mode === 'none') return;

  if (mode === 'binance-ws' && typeof WebSocket !== 'undefined' && meta?.binance) {
    try {
      ws = new WebSocket(`wss://stream.binance.com:9443/ws/${meta.binance.toLowerCase()}@kline_1m`);
      ws.onmessage = (ev) => {
        try {
          const k = JSON.parse(ev.data)?.k;
          if (!k) return;
          applyPrice(sym, +k.c, +k.t);
          emitTick(+k.c);
          if (k.x && candleCloseHandler) candleCloseHandler(); // minute candle closed
        } catch { /* ignore malformed frame */ }
      };
      ws.onerror = () => stopFeed();
      ws.onclose = () => { alive = false; };
      return;
    } catch { stopFeed(); }
  }

  if (mode === 'coinbase-ws' && typeof WebSocket !== 'undefined' && meta?.coinbase) {
    try {
      ws = new WebSocket('wss://ws-feed.exchange.coinbase.com');
      ws.onopen = () => ws.send(JSON.stringify({
        type: 'subscribe', product_ids: [meta.coinbase], channels: ['ticker'],
      }));
      ws.onmessage = (ev) => {
        try {
          const m = JSON.parse(ev.data);
          if (m.type === 'ticker' && m.price) {
            applyPrice(sym, +m.price, 0);
            emitTick(+m.price);
          }
        } catch { /* ignore malformed frame */ }
      };
      ws.onerror = () => stopFeed();
      ws.onclose = () => { alive = false; };
      return;
    } catch { stopFeed(); }
  }

  if (mode === 'poll') {
    pollTimer = setInterval(async () => {
      const candles = await fetchLiveCandles(sym);
      if (candles?.length) {
        const s2 = getState();
        const ms = s2.marketState[sym];
        if (ms) {
          ms.candles = candles.slice(-150);
          ms.lastPrice = candles[candles.length - 1].c;
          saveState();
        }
        emitTick(candles[candles.length - 1].c);
      }
    }, 15_000);
    alive = true;
    return;
  }

  if (mode === 'sim') {
    pollTimer = setInterval(() => {
      const price = simulateTick(sym);
      if (price != null) emitTick(price);
    }, 3000);
    alive = true;
  }
}
