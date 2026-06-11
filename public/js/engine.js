// The watch-cycle "brain" — what src/server.js used to run on the backend, now
// running entirely in the page so the app works standalone (including as the
// Android app, with no computer involved).
import { getState, saveState } from './store.js';
import { getMarket, supportedSymbols, symbolGroups, assetLabel } from './marketData.js';
import {
  analyzeWithAI, analyzeHeuristic, analyzeNews, combineDecision, hasAiKey, aiName,
} from './analyzer.js';
import { applyDecision, portfolioView, checkRiskExit } from './paperEngine.js';
import { ensureFeed, onCandleClose, onTick, feedAlive } from './priceFeed.js';

// --- Core watch cycle ------------------------------------------------------
let cycleRunning = false;
export async function runCycle() {
  if (cycleRunning) return getStateView();
  cycleRunning = true;
  try {
    const s = getState();
    const sym = s.config.symbol;
    const label = assetLabel(sym);
    const { candles, source } = await getMarket(sym);
    const price = candles[candles.length - 1].c;
    checkRiskExit(s, sym, price); // catch TP/SL gaps even when the tick feed is down

    let chart, analyzerSource;
    const ai = aiName(); // 'claude' | 'nvidia' | null, from the saved key
    const position = s.portfolio.position?.symbol === sym ? s.portfolio.position : null;
    if (ai) {
      try {
        chart = await analyzeWithAI(label, candles, position);
        analyzerSource = ai;
      } catch (err) {
        chart = analyzeHeuristic(sym, candles);
        analyzerSource = `heuristic (${ai} error: ${err.message})`;
      }
    } else {
      chart = analyzeHeuristic(sym, candles);
      analyzerSource = 'heuristic';
    }

    let sentiment = 'NEUTRAL', newsSummary = null;
    if (s.config.useNews && hasAiKey()) {
      const news = await analyzeNews(label);
      sentiment = news.sentiment;
      newsSummary = news.summary;
    }

    const finalSignal = combineDecision(chart.signal, sentiment, s.config.useNews);
    applyDecision(s, { finalSignal, chart, sentiment, price, dataSource: source, analyzerSource, newsSummary });

    s.marketState[sym] = s.marketState[sym] || {};
    s.marketState[sym].candles = candles.slice(-150);
    s.marketState[sym].lastPrice = price;
    s.marketState[sym].source = source;
    saveState();
    ensureFeed(); // keep the live price stream matched to symbol + data source
  } catch (err) {
    console.error('Cycle error:', err.message);
  } finally {
    cycleRunning = false;
  }
  return getStateView();
}

// When the live stream reports a finished 1-minute candle, make a decision on
// it right away (in addition to the interval timer) while Auto-watch is on.
onCandleClose(() => {
  if (getState().config.autoMode) runCycle();
});

// Take-profit / stop-loss runs on every live tick — exits fire within a
// second of the price touching a target instead of waiting for a cycle.
onTick((price) => {
  const s = getState();
  checkRiskExit(s, s.config.symbol, price);
});

// --- Auto-mode scheduler ----------------------------------------------------
// Runs while the app is open; there is no server, so closing the app pauses
// the watch loop until it's opened again.
let pollTimer = null;
export function reschedule() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  const s = getState();
  if (s.config.autoMode) {
    const sec = Math.max(5, Number(s.config.pollIntervalSec) || 15);
    pollTimer = setInterval(runCycle, sec * 1000);
    runCycle(); // fire one immediately
  }
}

// --- View assembly -----------------------------------------------------------
export function getStateView() {
  const s = getState();
  const sym = s.config.symbol;
  const ms = s.marketState[sym] || {};
  const candles = ms.candles || [];
  const price = candles.length ? candles[candles.length - 1].c : (ms.lastPrice || 0);
  return {
    paperMode: true,
    config: s.config,
    dataSource: ms.source || 'none',
    analyzerSource: aiName() || 'heuristic',
    feedLive: feedAlive(),
    price,
    latest: s.latest,
    portfolio: portfolioView(s, price),
    candles: candles.map((c) => ({ t: c.t, c: c.c })),
    trades: s.trades.slice(0, 100),
    symbols: supportedSymbols(),
    symbolGroups: symbolGroups(),
    autoMode: s.config.autoMode,
  };
}
