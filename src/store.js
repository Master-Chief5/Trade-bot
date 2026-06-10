// Tiny JSON-file-backed state store. No native deps, survives restarts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

export const DEFAULT_CONFIG = {
  symbol: 'BTC',
  startingBalance: 500,      // the amount you tell it you have
  tradeAmount: 50,           // $ per simulated buy
  confidenceThreshold: 70,   // min analyzer confidence to act
  pollIntervalSec: 60,       // how often auto-mode checks the market
  cooldownMinutes: 5,        // min gap between trades
  autoMode: false,           // off by default (no surprise API spend)
  useNews: false,            // optional web-search sentiment (needs API key)
};

function freshState() {
  return {
    config: { ...DEFAULT_CONFIG },
    portfolio: {
      startingBalance: DEFAULT_CONFIG.startingBalance,
      cash: DEFAULT_CONFIG.startingBalance,
      position: null,        // { symbol, qty, avgPrice }
      realizedPnl: 0,
      lastTradeTime: 0,
    },
    trades: [],              // executed paper trades, newest first
    latest: null,            // most recent signal (incl. HOLD)
    marketState: {},         // per-symbol: { lastPrice, candles, source }
  };
}

let state;

export function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      state.config = { ...DEFAULT_CONFIG, ...state.config };
    } else {
      state = freshState();
    }
  } catch (err) {
    console.error('Failed to load state, starting fresh:', err.message);
    state = freshState();
  }
  return state;
}

export function getState() {
  if (!state) loadState();
  return state;
}

let saveTimer = null;
export function saveState() {
  if (!state || saveTimer) return; // debounce burst writes
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (err) {
      console.error('Failed to save state:', err.message);
    }
  }, 250);
}

// Reset the paper portfolio to a (possibly new) starting balance and clear history.
export function resetPortfolio(startingBalance) {
  const s = getState();
  const bal = Number(startingBalance) > 0 ? Number(startingBalance) : s.config.startingBalance;
  s.config.startingBalance = bal;
  s.portfolio = {
    startingBalance: bal,
    cash: bal,
    position: null,
    realizedPnl: 0,
    lastTradeTime: 0,
  };
  s.trades = [];
  s.latest = null;
  saveState();
  return s;
}
