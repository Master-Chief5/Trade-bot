// Market upkeep for the dashboard: candles + live price feed for whichever
// asset is selected. All trading decisions live in the cloud bot
// (supabase/functions/trade-bot); while the app is open it nudges that bot,
// and this module only keeps the chart and price fresh.
import { getState, saveState } from './store.js';
import { getMarket, supportedSymbols, symbolGroups } from './marketData.js';
import { ensureFeed, feedAlive } from './priceFeed.js';

let refreshing = false;
export async function refreshMarket() {
  if (refreshing) return getMarketView();
  refreshing = true;
  try {
    const s = getState();
    const sym = s.config.symbol;
    const { candles, source } = await getMarket(sym);
    s.marketState[sym] = s.marketState[sym] || {};
    s.marketState[sym].candles = candles.slice(-150);
    s.marketState[sym].lastPrice = candles[candles.length - 1].c;
    s.marketState[sym].source = source;
    saveState();
    ensureFeed(); // keep the live price stream matched to symbol + data source
  } catch (err) {
    console.error('Market refresh error:', err.message);
  } finally {
    refreshing = false;
  }
  return getMarketView();
}

// Periodic chart refresh while the app is open (the cloud bot has its own
// once-a-minute clock regardless).
let pollTimer = null;
export function reschedule() {
  if (pollTimer) clearInterval(pollTimer);
  const sec = Math.max(5, Number(getState().config.pollIntervalSec) || 15);
  pollTimer = setInterval(refreshMarket, sec * 1000);
  refreshMarket();
}

export function getMarketView() {
  const s = getState();
  const sym = s.config.symbol;
  const ms = s.marketState[sym] || {};
  const candles = ms.candles || [];
  return {
    config: s.config,
    symbol: sym,
    dataSource: ms.source || 'none',
    feedLive: feedAlive(),
    price: candles.length ? candles[candles.length - 1].c : (ms.lastPrice || 0),
    candles: candles.map((c) => ({ t: c.t, c: c.c })),
    symbols: supportedSymbols(),
    symbolGroups: symbolGroups(),
  };
}
