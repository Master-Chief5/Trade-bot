// Express server: serves the dashboard, runs the market-watch loop, exposes the API.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env (Node 18+ has no built-in dotenv parsing before this call). Optional.
try { process.loadEnvFile?.(); } catch { /* no .env file — fine */ }

import { getState, saveState, loadState, resetPortfolio, DEFAULT_CONFIG } from './store.js';
import { getMarket, supportedSymbols } from './marketData.js';
import {
  analyzeWithClaude, analyzeHeuristic, analyzeNews, combineDecision, hasClaudeKey,
} from './analyzer.js';
import { applyDecision, portfolioView } from './paperEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

loadState();

// --- Core watch cycle ------------------------------------------------------
let cycleRunning = false;
async function runCycle() {
  if (cycleRunning) return getStateView();
  cycleRunning = true;
  try {
    const s = getState();
    const sym = s.config.symbol;
    const { candles, source } = await getMarket(sym);
    const price = candles[candles.length - 1].c;

    let chart, analyzerSource;
    if (hasClaudeKey()) {
      try {
        chart = await analyzeWithClaude(sym, candles);
        analyzerSource = 'claude';
      } catch (err) {
        chart = analyzeHeuristic(sym, candles);
        analyzerSource = `heuristic (Claude error: ${err.message})`;
      }
    } else {
      chart = analyzeHeuristic(sym, candles);
      analyzerSource = 'heuristic';
    }

    let sentiment = 'NEUTRAL', newsSummary = null;
    if (s.config.useNews && hasClaudeKey()) {
      const news = await analyzeNews(sym);
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
  } catch (err) {
    console.error('Cycle error:', err.message);
  } finally {
    cycleRunning = false;
  }
  return getStateView();
}

// --- Auto-mode scheduler ---------------------------------------------------
let pollTimer = null;
function reschedule() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  const s = getState();
  if (s.config.autoMode) {
    const sec = Math.max(10, Number(s.config.pollIntervalSec) || 60);
    pollTimer = setInterval(runCycle, sec * 1000);
    runCycle(); // fire one immediately
  }
}

// --- View assembly ---------------------------------------------------------
function getStateView() {
  const s = getState();
  const sym = s.config.symbol;
  const ms = s.marketState[sym] || {};
  const candles = ms.candles || [];
  const price = candles.length ? candles[candles.length - 1].c : (ms.lastPrice || 0);
  return {
    paperMode: true,
    hasClaudeKey: hasClaudeKey(),
    config: s.config,
    dataSource: ms.source || 'none',
    analyzerSource: hasClaudeKey() ? 'claude' : 'heuristic',
    price,
    latest: s.latest,
    portfolio: portfolioView(s, price),
    candles: candles.map((c) => ({ t: c.t, c: c.c })),
    trades: s.trades.slice(0, 100),
    symbols: supportedSymbols(),
    autoMode: s.config.autoMode,
  };
}

// --- Routes ----------------------------------------------------------------
app.get('/api/state', (_req, res) => res.json(getStateView()));

app.post('/api/analyze', async (_req, res) => {
  const view = await runCycle();
  res.json(view);
});

app.post('/api/config', (req, res) => {
  const s = getState();
  const b = req.body || {};
  const numKeys = ['tradeAmount', 'confidenceThreshold', 'pollIntervalSec', 'cooldownMinutes'];
  for (const k of numKeys) {
    if (b[k] !== undefined && Number(b[k]) >= 0) s.config[k] = Number(b[k]);
  }
  if (b.symbol && supportedSymbols().includes(b.symbol)) s.config.symbol = b.symbol;
  if (typeof b.useNews === 'boolean') s.config.useNews = b.useNews;
  saveState();
  reschedule();
  res.json(getStateView());
});

app.post('/api/auto', (req, res) => {
  const s = getState();
  s.config.autoMode = !!(req.body && req.body.enabled);
  saveState();
  reschedule();
  res.json(getStateView());
});

app.post('/api/reset', (req, res) => {
  const bal = req.body && req.body.startingBalance;
  resetPortfolio(bal);
  res.json(getStateView());
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  reschedule();
  console.log(`\n  Crypto paper-trader running:  http://localhost:${PORT}`);
  console.log(`  Claude analysis: ${hasClaudeKey() ? `ON (${process.env.ANTHROPIC_MODEL || 'claude-opus-4-8'})` : 'OFF — using local heuristic'}`);
  console.log(`  Mode: PAPER (simulated only — no real orders)\n`);
});
