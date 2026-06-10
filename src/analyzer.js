// Signal generation. Uses Claude (official SDK + structured outputs) when an
// ANTHROPIC_API_KEY is set; otherwise falls back to a local technical-analysis
// heuristic so the app is fully functional offline.
import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';

let _client;
export function hasClaudeKey() {
  return !!process.env.ANTHROPIC_API_KEY;
}
function getClient() {
  if (!hasClaudeKey()) return null;
  if (!_client) _client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  return _client;
}

const SYSTEM_PROMPT = `You are an expert day trader using ICT (Inner Circle Trader) Smart Money Concepts.
You are given recent OHLC candlestick data (1-minute candles, oldest to newest) for a crypto asset.
Identify: current trend direction (bullish/bearish/ranging), any Fair Value Gaps (FVGs), order blocks,
recent break of structure (BOS) or market structure shift (MSS), and key support/resistance.
Decide whether price is at a high-probability point of interest.
Respond ONLY with the structured JSON object requested — no extra commentary.
Be conservative: prefer HOLD unless there is a clear setup.`;

const SIGNAL_SCHEMA = {
  type: 'object',
  properties: {
    signal: { type: 'string', enum: ['BUY', 'SELL', 'HOLD'] },
    confidence: { type: 'integer' },
    reasoning: { type: 'string' },
    setup_type: { type: 'string', enum: ['FVG', 'OB', 'BOS', 'MSS', 'OTHER', 'NONE'] },
  },
  required: ['signal', 'confidence', 'reasoning', 'setup_type'],
  additionalProperties: false,
};

export async function analyzeWithClaude(symbol, candles) {
  const client = getClient();
  if (!client) throw new Error('No API key');
  const recent = candles.slice(-60).map((c) => [
    +c.o.toFixed(6), +c.h.toFixed(6), +c.l.toFixed(6), +c.c.toFixed(6),
  ]);
  const userText =
    `Asset: ${symbol}/USD\n` +
    `Current price: ${candles[candles.length - 1].c}\n` +
    `Recent 1m candles as [open, high, low, close], oldest first:\n` +
    JSON.stringify(recent);

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userText }],
    output_config: { format: { type: 'json_schema', schema: SIGNAL_SCHEMA } },
  });

  if (resp.stop_reason === 'refusal') throw new Error('refusal');
  const text = resp.content.find((b) => b.type === 'text')?.text || '{}';
  const out = JSON.parse(text);
  out.confidence = clamp(Math.round(out.confidence), 0, 100);
  return out;
}

// --- Local heuristic (no API key needed) -----------------------------------
function smaSeries(values, period) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { out.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    out.push(sum / period);
  }
  return out;
}

function rsi(closes, period = 14) {
  if (closes.length <= period) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function analyzeHeuristic(symbol, candles) {
  const closes = candles.map((c) => c.c);
  if (closes.length < 30) {
    return { signal: 'HOLD', confidence: 0, reasoning: 'Warming up — not enough candles yet.', setup_type: 'NONE' };
  }
  const short = smaSeries(closes, 7);
  const long = smaSeries(closes, 25);
  const r = rsi(closes, 14);
  const sNow = short.at(-1), sPrev = short.at(-2);
  const lNow = long.at(-1), lPrev = long.at(-2);
  const spreadPct = ((sNow - lNow) / lNow) * 100;

  const crossedUp = sPrev <= lPrev && sNow > lNow;
  const crossedDown = sPrev >= lPrev && sNow < lNow;

  let signal = 'HOLD', setup_type = 'NONE', confidence = 35;

  if (crossedUp && r < 72) {
    signal = 'BUY'; setup_type = 'BOS';
    confidence = clamp(Math.round(71 + Math.abs(spreadPct) * 10 + Math.max(0, 50 - r) / 4), 0, 95);
  } else if (crossedDown && r > 28) {
    signal = 'SELL'; setup_type = 'MSS';
    confidence = clamp(Math.round(71 + Math.abs(spreadPct) * 10 + Math.max(0, r - 50) / 4), 0, 95);
  } else if (sNow > lNow && r < 34) {
    signal = 'BUY'; setup_type = 'OB';
    confidence = clamp(Math.round(60 + (34 - r) * 1.2), 0, 90);
  } else if (sNow < lNow && r > 66) {
    signal = 'SELL'; setup_type = 'OB';
    confidence = clamp(Math.round(60 + (r - 66) * 1.2), 0, 90);
  } else {
    confidence = clamp(Math.round(30 + Math.abs(spreadPct) * 5), 0, 60);
  }

  const trend = sNow > lNow ? 'bullish' : sNow < lNow ? 'bearish' : 'ranging';
  const reasoning =
    `${trend} (SMA7 ${sNow.toFixed(2)} vs SMA25 ${lNow.toFixed(2)}, ${spreadPct >= 0 ? '+' : ''}${spreadPct.toFixed(2)}%), ` +
    `RSI ${r.toFixed(0)}` +
    (crossedUp ? ' — fresh bullish cross.' : crossedDown ? ' — fresh bearish cross.' :
      signal === 'BUY' ? ' — pullback in uptrend.' : signal === 'SELL' ? ' — exhaustion in downtrend.' : ' — no clean setup.');

  return { signal, confidence, reasoning, setup_type };
}

// --- Optional news sentiment via web search --------------------------------
export async function analyzeNews(symbol) {
  const client = getClient();
  if (!client) return { sentiment: 'NEUTRAL', summary: 'News disabled (no API key).' };
  try {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system:
        'You are a crypto markets news analyst. Use web search to find news from the last few hours about the given asset, plus any major macro/regulatory events today. Be concise.',
      messages: [{
        role: 'user',
        content:
          `Asset: ${symbol}. Summarize the latest short-term sentiment in one sentence, ` +
          `then end your reply with a final line exactly in the form: SENTIMENT: POSITIVE  (or NEGATIVE or NEUTRAL).`,
      }],
      tools: [{ type: 'web_search_20260209', name: 'web_search' }],
    });
    const text = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    const m = text.match(/SENTIMENT:\s*(POSITIVE|NEGATIVE|NEUTRAL)/i);
    const sentiment = m ? m[1].toUpperCase() : 'NEUTRAL';
    return { sentiment, summary: text.replace(/SENTIMENT:.*$/i, '').trim().slice(0, 300) };
  } catch (err) {
    return { sentiment: 'NEUTRAL', summary: `News lookup failed: ${err.message}` };
  }
}

// Combine chart signal with news per the spec's override rules.
export function combineDecision(chartSignal, sentiment, useNews) {
  if (!useNews) return chartSignal;
  if (chartSignal === 'BUY') return sentiment === 'NEGATIVE' ? 'HOLD' : 'BUY';
  if (chartSignal === 'SELL') return sentiment === 'POSITIVE' ? 'HOLD' : 'SELL';
  return 'HOLD';
}
