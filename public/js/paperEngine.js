// Paper-trading engine. Simulates BUY/SELL against the chosen balance.
// NOTHING here places a real order — it only records what it *would* do so you
// can watch the trades and copy them manually if you choose.
import { saveState } from './store.js';

let tradeSeq = 0;

// Apply a final decision to the paper portfolio. Returns the `latest` signal view.
export function applyDecision(state, ctx) {
  const { finalSignal, chart, sentiment, price, dataSource, analyzerSource, newsSummary } = ctx;
  const cfg = state.config;
  const pf = state.portfolio;
  const now = Date.now();

  const cooldownMs = cfg.cooldownMinutes * 60_000;
  const inCooldown = now - pf.lastTradeTime < cooldownMs;
  const belowThreshold = chart.confidence < cfg.confidenceThreshold;
  const holding = pf.position && pf.position.symbol === cfg.symbol;

  let executed = false;
  let note = '';

  if (finalSignal === 'BUY') {
    if (belowThreshold) note = `Below confidence threshold (${chart.confidence} < ${cfg.confidenceThreshold}).`;
    else if (holding) note = 'Already holding a position — no add.';
    else if (inCooldown) note = 'In cooldown.';
    else if (pf.cash < 1) note = 'Out of cash.';
    else {
      // Auto-size: the bot stakes a share of available cash equal to its
      // confidence (82% confident → 82% of cash). Otherwise: fixed $ amount.
      const amount = cfg.autoSize
        ? Math.max(1, Math.min(pf.cash, pf.cash * (chart.confidence / 100)))
        : Math.min(cfg.tradeAmount, pf.cash);
      const qty = amount / price;
      pf.cash -= amount;
      pf.position = { symbol: cfg.symbol, qty, avgPrice: price };
      pf.lastTradeTime = now;
      recordTrade(state, { action: 'BUY', symbol: cfg.symbol, qty, price, amountUsd: amount,
        confidence: chart.confidence, reasoning: chart.reasoning, setup_type: chart.setup_type,
        sentiment, dataSource, analyzerSource, realizedPnl: null });
      executed = true;
    }
  } else if (finalSignal === 'SELL') {
    if (!holding) note = 'No open position to sell.';
    else if (belowThreshold) note = `Below confidence threshold (${chart.confidence} < ${cfg.confidenceThreshold}).`;
    else if (inCooldown) note = 'In cooldown.';
    else {
      const qty = pf.position.qty;
      const proceeds = qty * price;
      const realized = (price - pf.position.avgPrice) * qty;
      pf.cash += proceeds;
      pf.realizedPnl += realized;
      pf.lastTradeTime = now;
      recordTrade(state, { action: 'SELL', symbol: cfg.symbol, qty, price, amountUsd: proceeds,
        confidence: chart.confidence, reasoning: chart.reasoning, setup_type: chart.setup_type,
        sentiment, dataSource, analyzerSource, realizedPnl: realized });
      pf.position = null;
      executed = true;
    }
  } else {
    note = 'Holding — no trade.';
  }

  state.latest = {
    time: now, price, symbol: cfg.symbol,
    signal: finalSignal, chartSignal: chart.signal,
    confidence: chart.confidence, reasoning: chart.reasoning, setup_type: chart.setup_type,
    sentiment, newsSummary: newsSummary || null,
    dataSource, analyzerSource, executed, note,
  };
  saveState();
  return state.latest;
}

function recordTrade(state, t) {
  state.trades.unshift({
    id: `${Date.now()}-${tradeSeq++}`,
    time: Date.now(),
    ...t,
  });
  state.trades = state.trades.slice(0, 200);
}

// Derived portfolio numbers for the UI — centred on P&L vs the starting balance.
export function portfolioView(state, price) {
  const pf = state.portfolio;
  const positionValue = pf.position ? pf.position.qty * price : 0;
  const equity = pf.cash + positionValue;
  const unrealizedPnl = pf.position ? (price - pf.position.avgPrice) * pf.position.qty : 0;
  const totalPnl = equity - pf.startingBalance;
  return {
    startingBalance: pf.startingBalance,
    cash: pf.cash,
    position: pf.position,
    positionValue,
    equity,
    realizedPnl: pf.realizedPnl,
    unrealizedPnl,
    totalPnl,
    pnlPct: pf.startingBalance ? (totalPnl / pf.startingBalance) * 100 : 0,
  };
}
