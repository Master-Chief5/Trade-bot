// Cloud paper-trading bot — the same engine as the app, running 24/7.
// Ticks once a minute via pg_cron; the phone app reads/controls it through
// this endpoint. PAPER ONLY: no real order is ever placed.
//
// Deployed as the Supabase Edge Function `trade-bot` (verify_jwt off — it
// guards only paper state). Schedule (already applied as a migration):
//   select cron.schedule('trade-bot-tick', '* * * * *', $$
//     select net.http_post(
//       url := 'https://<project-ref>.supabase.co/functions/v1/trade-bot',
//       headers := '{"Content-Type": "application/json"}'::jsonb,
//       body := '{"action":"tick"}'::jsonb,
//       timeout_milliseconds := 40000);
//   $$);
//
// API:
//   GET  ?              -> { state, hasAiKey, now }
//   POST {action:'tick'}                          -> run one cycle
//   POST {action:'config', config:{...}, aiKey?}  -> update settings (and AI key)
//   POST {action:'reset', startingBalance}        -> reset portfolio
// @ts-nocheck
import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS } });

const SYMBOLS = {
  BTC: { type: 'crypto', binance: 'BTCUSDT', coinbase: 'BTC-USD' },
  ETH: { type: 'crypto', binance: 'ETHUSDT', coinbase: 'ETH-USD' },
  SOL: { type: 'crypto', binance: 'SOLUSDT', coinbase: 'SOL-USD' },
  XRP: { type: 'crypto', binance: 'XRPUSDT', coinbase: 'XRP-USD' },
  DOGE: { type: 'crypto', binance: 'DOGEUSDT', coinbase: 'DOGE-USD' },
  ADA: { type: 'crypto', binance: 'ADAUSDT', coinbase: 'ADA-USD' },
  AAPL: { type: 'stock', yahoo: 'AAPL' }, MSFT: { type: 'stock', yahoo: 'MSFT' },
  NVDA: { type: 'stock', yahoo: 'NVDA' }, TSLA: { type: 'stock', yahoo: 'TSLA' },
  AMZN: { type: 'stock', yahoo: 'AMZN' }, GOOGL: { type: 'stock', yahoo: 'GOOGL' },
  META: { type: 'stock', yahoo: 'META' }, SPY: { type: 'stock', yahoo: 'SPY' },
};

// --- Market data (server-side fetch: no CORS limits) -----------------------
async function getCandles(sym) {
  const meta = SYMBOLS[sym];
  if (!meta) throw new Error(`unknown symbol ${sym}`);
  const tmo = { signal: AbortSignal.timeout(8000) };
  if (meta.type === 'crypto') {
    try {
      const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${meta.binance}&interval=1m&limit=100`, tmo);
      if (r.ok) {
        const rows = await r.json();
        if (Array.isArray(rows) && rows.length) {
          return { source: 'live:binance', candles: rows.map((x) => ({ t: x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4] })) };
        }
      }
    } catch { /* try coinbase */ }
    const r = await fetch(`https://api.exchange.coinbase.com/products/${meta.coinbase}/candles?granularity=60`, tmo);
    if (!r.ok) throw new Error('market data unreachable');
    const rows = await r.json();
    return {
      source: 'live:coinbase',
      candles: rows.map((x) => ({ t: x[0] * 1000, o: +x[3], h: +x[2], l: +x[1], c: +x[4] })).sort((a, b) => a.t - b.t).slice(-100),
    };
  }
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${meta.yahoo}?interval=1m&range=1d`, tmo);
  if (!r.ok) throw new Error('market data unreachable');
  const data = await r.json();
  const res = data?.chart?.result?.[0];
  const ts = res?.timestamp || [];
  const q = res?.indicators?.quote?.[0] || {};
  const candles = [];
  for (let i = 0; i < ts.length; i++) {
    if (q.close?.[i] == null) continue;
    candles.push({ t: ts[i] * 1000, o: +q.open[i], h: +q.high[i], l: +q.low[i], c: +q.close[i] });
  }
  if (!candles.length) throw new Error('market closed / no data');
  return { source: 'live:yahoo', candles: candles.slice(-100) };
}

// --- Analyzer (same as the app: weighted evidence scoring) ------------------
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function emaSeries(values, period) {
  const k = 2 / (period + 1);
  let e = values[0];
  const out = [e];
  for (let i = 1; i < values.length; i++) { e = values[i] * k + e * (1 - k); out.push(e); }
  return out;
}

function rsi(closes, period = 14) {
  if (closes.length <= period) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  if (losses === 0) return 100;
  return 100 - 100 / (1 + gains / losses);
}

function analyzeHeuristic(candles) {
  const closes = candles.map((c) => c.c);
  if (closes.length < 30) {
    return { signal: 'HOLD', confidence: 0, reasoning: 'Warming up — not enough candles yet.', setup_type: 'NONE' };
  }
  const fast = emaSeries(closes, 9), slow = emaSeries(closes, 21);
  const fNow = fast.at(-1), fPrev = fast.at(-2), sNow = slow.at(-1), sPrev = slow.at(-2);
  const r = rsi(closes, 14);
  const price = closes.at(-1);
  const roc10 = ((price - closes.at(-11)) / closes.at(-11)) * 100;
  const window = candles.slice(-21, -1);
  const hi20 = Math.max(...window.map((c) => c.h));
  const lo20 = Math.min(...window.map((c) => c.l));

  let score = 0;
  const bull = [], bear = [];
  const add = (pts, label) => { score += pts; (pts > 0 ? bull : bear).push(label); };

  if (fNow > sNow) add(1, 'uptrend (EMA9>EMA21)'); else if (fNow < sNow) add(-1, 'downtrend (EMA9<EMA21)');
  if (fPrev <= sPrev && fNow > sNow) add(1.5, 'fresh bullish cross');
  else if (fPrev >= sPrev && fNow < sNow) add(-1.5, 'fresh bearish cross');
  if (roc10 > 0.12) add(0.8, `momentum +${roc10.toFixed(2)}%/10m`);
  else if (roc10 < -0.12) add(-0.8, `momentum ${roc10.toFixed(2)}%/10m`);
  if (r <= 32) add(1.2, `RSI ${r.toFixed(0)} oversold`);
  else if (r >= 68) add(-1.2, `RSI ${r.toFixed(0)} overbought`);
  if (price > hi20) add(1.5, '20-bar breakout up');
  else if (price < lo20) add(-1.5, '20-bar breakdown');

  let signal = 'HOLD', setup_type = 'NONE', confidence;
  if (score >= 1.8) signal = 'BUY'; else if (score <= -1.8) signal = 'SELL';
  if (signal !== 'HOLD') {
    const factors = signal === 'BUY' ? bull : bear;
    setup_type = factors.some((f) => f.includes('cross')) ? (signal === 'BUY' ? 'BOS' : 'MSS')
      : factors.some((f) => f.includes('break')) ? 'BOS'
      : factors.some((f) => f.includes('RSI')) ? 'OB' : 'OTHER';
    confidence = clamp(Math.round(52 + Math.abs(score) * 9), 0, 95);
  } else {
    confidence = clamp(Math.round(32 + Math.abs(score) * 8), 0, 59);
  }
  const side = score > 0.5 ? 'bullish' : score < -0.5 ? 'bearish' : 'ranging';
  const factors = (score >= 0 ? bull : bear).join(', ') || 'no aligned factors';
  const reasoning = `${side} — ${factors} (score ${score > 0 ? '+' : ''}${score.toFixed(1)}, RSI ${r.toFixed(0)})` +
    (signal === 'HOLD' ? '; not enough agreement to act.' : '.');
  return { signal, confidence, reasoning, setup_type };
}

// --- Optional AI analyzer (key uploaded from the app) -----------------------
const SYSTEM_PROMPT = `You are an expert day trader using ICT (Inner Circle Trader) Smart Money Concepts.
You are given recent OHLC candlestick data (1-minute candles, oldest to newest) for a market asset (crypto or a US stock/ETF).
Identify: current trend direction (bullish/bearish/ranging), any Fair Value Gaps (FVGs), order blocks,
recent break of structure (BOS) or market structure shift (MSS), and key support/resistance.
Decide whether price is at a high-probability point of interest.
Respond ONLY with the structured JSON object requested — no extra commentary.
Be conservative: prefer HOLD unless there is a clear setup.`;

function extractJson(text) {
  const cleaned = String(text).replace(/```(?:json)?/g, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('model reply had no JSON');
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function analyzeWithAI(key, sym, candles, position) {
  const meta = SYMBOLS[sym];
  const label = meta.type === 'stock' ? `${sym} (US stock/ETF)` : `${sym}/USD (crypto)`;
  const recent = candles.slice(-60).map((c) => [+c.o.toFixed(6), +c.h.toFixed(6), +c.l.toFixed(6), +c.c.toFixed(6)]);
  const last = candles.at(-1).c;
  const posLine = position
    ? `\nOpen position: entered at ${position.avgPrice}, currently ${(((last - position.avgPrice) / position.avgPrice) * 100).toFixed(2)}% from entry — SELL exits it, BUY is not possible.`
    : '\nNo open position — BUY would open one, SELL is not possible.';
  const userText = `Asset: ${label}\nCurrent price: ${last}\nRecent 1m candles as [open, high, low, close], oldest first:\n${JSON.stringify(recent)}${posLine}`;

  let out;
  if (key.startsWith('nvapi-')) {
    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'meta/llama-3.3-70b-instruct',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userText + '\nRespond with ONLY this JSON object, nothing else:\n{"signal":"BUY"|"SELL"|"HOLD","confidence":<0-100>,"reasoning":"<one sentence>","setup_type":"FVG"|"OB"|"BOS"|"MSS"|"OTHER"|"NONE"}' },
        ],
        temperature: 0.2, max_tokens: 500,
      }),
      signal: AbortSignal.timeout(25000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error?.message || data?.detail || data?.title || `API error ${res.status}`);
    out = extractJson(data?.choices?.[0]?.message?.content || '');
  } else {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-opus-4-8', max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userText }],
        output_config: { format: { type: 'json_schema', schema: {
          type: 'object',
          properties: {
            signal: { type: 'string', enum: ['BUY', 'SELL', 'HOLD'] },
            confidence: { type: 'integer' },
            reasoning: { type: 'string' },
            setup_type: { type: 'string', enum: ['FVG', 'OB', 'BOS', 'MSS', 'OTHER', 'NONE'] },
          },
          required: ['signal', 'confidence', 'reasoning', 'setup_type'],
          additionalProperties: false,
        } } },
      }),
      signal: AbortSignal.timeout(25000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error?.message || `API error ${res.status}`);
    if (data.stop_reason === 'refusal') throw new Error('refusal');
    out = JSON.parse(data.content.find((b) => b.type === 'text')?.text || '{}');
  }
  if (!['BUY', 'SELL', 'HOLD'].includes(out.signal)) out.signal = 'HOLD';
  out.confidence = clamp(Math.round(+out.confidence || 0), 0, 100);
  out.reasoning = String(out.reasoning || '').slice(0, 300);
  if (!['FVG', 'OB', 'BOS', 'MSS', 'OTHER', 'NONE'].includes(out.setup_type)) out.setup_type = 'OTHER';
  return out;
}

// --- Paper engine (same rules as the app) -----------------------------------
let tradeSeq = 0;
function recordTrade(state, t) {
  state.trades.unshift({ id: `${Date.now()}-${tradeSeq++}`, time: Date.now(), ...t });
  state.trades = state.trades.slice(0, 200);
}

function checkRiskExit(state, symbol, price, source) {
  const pf = state.portfolio, cfg = state.config;
  if (!pf.position || pf.position.symbol !== symbol || !(price > 0)) return false;
  const movePct = ((price - pf.position.avgPrice) / pf.position.avgPrice) * 100;
  const tp = Number(cfg.takeProfitPct) || 0;
  const sl = Number(cfg.stopLossPct) || 0;
  const kind = tp > 0 && movePct >= tp ? 'TP' : sl > 0 && movePct <= -sl ? 'SL' : null;
  if (!kind) return false;
  const qty = pf.position.qty;
  const realized = (price - pf.position.avgPrice) * qty;
  pf.cash += qty * price;
  pf.realizedPnl += realized;
  pf.lastTradeTime = Date.now();
  recordTrade(state, {
    action: 'SELL', symbol, qty, price, amountUsd: qty * price, confidence: 100,
    reasoning: kind === 'TP'
      ? `Take-profit: position up ${movePct.toFixed(2)}% (target +${tp}%).`
      : `Stop-loss: position down ${movePct.toFixed(2)}% (limit -${sl}%).`,
    setup_type: kind, sentiment: 'NEUTRAL', dataSource: source, analyzerSource: 'risk-exit', realizedPnl: realized,
  });
  pf.position = null;
  return true;
}

function applyDecision(state, ctx) {
  const { finalSignal, chart, price, dataSource, analyzerSource } = ctx;
  const cfg = state.config, pf = state.portfolio;
  const now = Date.now();
  const inCooldown = now - pf.lastTradeTime < cfg.cooldownMinutes * 60_000;
  const holding = pf.position && pf.position.symbol === cfg.symbol;
  let executed = false, note = '';

  if (finalSignal === 'BUY') {
    if (chart.confidence < cfg.confidenceThreshold) note = `Below confidence threshold (${chart.confidence} < ${cfg.confidenceThreshold}).`;
    else if (holding) note = 'Already holding a position — no add.';
    else if (inCooldown) note = 'In cooldown.';
    else if (pf.cash < 1) note = 'Out of cash.';
    else {
      const amount = cfg.autoSize
        ? Math.max(1, Math.min(pf.cash, pf.cash * (chart.confidence / 100)))
        : Math.min(cfg.tradeAmount, pf.cash);
      const qty = amount / price;
      pf.cash -= amount;
      pf.position = { symbol: cfg.symbol, qty, avgPrice: price };
      pf.lastTradeTime = now;
      recordTrade(state, { action: 'BUY', symbol: cfg.symbol, qty, price, amountUsd: amount,
        confidence: chart.confidence, reasoning: chart.reasoning, setup_type: chart.setup_type,
        sentiment: 'NEUTRAL', dataSource, analyzerSource, realizedPnl: null });
      executed = true;
    }
  } else if (finalSignal === 'SELL') {
    const exitThreshold = Math.max(40, cfg.confidenceThreshold - 15);
    if (!holding) note = 'No open position to sell.';
    else if (chart.confidence < exitThreshold) note = `Below exit threshold (${chart.confidence} < ${exitThreshold}).`;
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
        sentiment: 'NEUTRAL', dataSource, analyzerSource, realizedPnl: realized });
      pf.position = null;
      executed = true;
    }
  } else {
    note = 'Holding — no trade.';
  }

  state.latest = {
    time: now, price, symbol: cfg.symbol, signal: finalSignal, chartSignal: chart.signal,
    confidence: chart.confidence, reasoning: chart.reasoning, setup_type: chart.setup_type,
    sentiment: 'NEUTRAL', newsSummary: null, dataSource, analyzerSource, executed, note,
  };
}

// --- State I/O ---------------------------------------------------------------
async function loadState() {
  const { data, error } = await supabase.from('trade_bot_state').select('state').eq('id', 1).single();
  if (error) throw new Error('state load failed: ' + error.message);
  return data.state;
}

async function saveState(state) {
  const { error } = await supabase.from('trade_bot_state')
    .update({ state, updated_at: new Date().toISOString() }).eq('id', 1);
  if (error) throw new Error('state save failed: ' + error.message);
}

async function loadKey() {
  const { data } = await supabase.from('trade_bot_secrets').select('value').eq('name', 'ai_key').maybeSingle();
  return data?.value || '';
}

// --- Tick ---------------------------------------------------------------------
async function tick() {
  const state = await loadState();
  if (!state.config.autoMode) return { skipped: 'paused' };
  const sym = state.config.symbol;
  const { candles, source } = await getCandles(sym);
  const price = candles.at(-1).c;

  if (checkRiskExit(state, sym, price, source)) {
    await saveState(state);
    return { riskExit: true, trade: state.trades[0] };
  }

  const key = await loadKey();
  const position = state.portfolio.position?.symbol === sym ? state.portfolio.position : null;
  let chart, analyzerSource;
  if (key) {
    try {
      chart = await analyzeWithAI(key, sym, candles, position);
      analyzerSource = key.startsWith('nvapi-') ? 'nvidia' : 'claude';
    } catch (err) {
      chart = analyzeHeuristic(candles);
      analyzerSource = `heuristic (${key.startsWith('nvapi-') ? 'nvidia' : 'claude'} error: ${err.message})`;
    }
  } else {
    chart = analyzeHeuristic(candles);
    analyzerSource = 'heuristic';
  }

  applyDecision(state, { finalSignal: chart.signal, chart, price, dataSource: source, analyzerSource });
  await saveState(state);
  return { latest: state.latest, executed: state.latest.executed };
}

// --- HTTP ----------------------------------------------------------------------
const CONFIG_KEYS = ['symbol', 'confidenceThreshold', 'takeProfitPct', 'stopLossPct',
  'autoSize', 'tradeAmount', 'cooldownMinutes', 'autoMode'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    if (req.method === 'GET') {
      const state = await loadState();
      const hasKey = !!(await loadKey());
      return json({ state, hasAiKey: hasKey, now: Date.now() });
    }
    const body = await req.json().catch(() => ({}));
    if (body.action === 'tick') return json(await tick());
    if (body.action === 'config') {
      const state = await loadState();
      for (const k of CONFIG_KEYS) {
        if (body.config && body.config[k] !== undefined) state.config[k] = body.config[k];
      }
      if (!SYMBOLS[state.config.symbol]) state.config.symbol = 'BTC';
      await saveState(state);
      if (typeof body.aiKey === 'string') {
        const v = body.aiKey.trim();
        if (v) await supabase.from('trade_bot_secrets').upsert({ name: 'ai_key', value: v });
        else await supabase.from('trade_bot_secrets').delete().eq('name', 'ai_key');
      }
      return json({ ok: true, config: state.config });
    }
    if (body.action === 'reset') {
      const state = await loadState();
      const bal = Number(body.startingBalance) > 0 ? Number(body.startingBalance) : state.config.startingBalance;
      state.config.startingBalance = bal;
      state.portfolio = { startingBalance: bal, cash: bal, position: null, realizedPnl: 0, lastTradeTime: 0 };
      state.trades = [];
      state.latest = null;
      await saveState(state);
      return json({ ok: true });
    }
    return json({ error: 'unknown action' }, 400);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});
