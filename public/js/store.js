// Browser-side state store backed by localStorage. Same state shape as the
// original server version so the rest of the engine ports over unchanged.
const STATE_KEY = 'cpt_state_v1';
const API_KEY_KEY = 'cpt_anthropic_key';

// Node (used for smoke tests) has no localStorage — fall back to an in-memory shim.
const storage = typeof localStorage !== 'undefined'
  ? localStorage
  : (() => {
      const m = new Map();
      return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => m.set(k, String(v)),
        removeItem: (k) => m.delete(k),
      };
    })();

export const DEFAULT_CONFIG = {
  symbol: 'BTC',
  startingBalance: 500,      // the amount you tell it you have
  tradeAmount: 50,           // $ per simulated buy (when autoSize is off)
  autoSize: true,            // let the bot size each buy from its confidence
  confidenceThreshold: 70,   // min analyzer confidence to act
  pollIntervalSec: 15,       // how often auto-mode checks the market (min 5)
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
    const raw = storage.getItem(STATE_KEY);
    if (raw) {
      state = JSON.parse(raw);
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

export function saveState() {
  if (!state) return;
  try {
    storage.setItem(STATE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to save state:', err.message);
  }
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

// The Anthropic API key lives outside the state blob, on this device only.
export function getApiKey() {
  return storage.getItem(API_KEY_KEY) || '';
}

export function setApiKey(key) {
  const k = (key || '').trim();
  if (k) storage.setItem(API_KEY_KEY, k);
  else storage.removeItem(API_KEY_KEY);
}
