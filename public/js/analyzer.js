// Signal generation. Uses an AI model when the user has saved an API key in
// Settings — Claude via the Anthropic Messages API (sk-ant-… keys) or an
// NVIDIA-hosted open model via the build.nvidia.com OpenAI-style API
// (nvapi-… keys) — otherwise falls back to a local technical-analysis
// heuristic so the app is fully functional offline.
//
// This is a zero-build static page (also packaged into the Android WebView),
// so it calls the REST APIs with fetch rather than npm SDKs. The key is the
// user's own, entered on-device and stored only in localStorage. In the
// Android app CapacitorHttp routes fetch natively so there are no CORS
// limits; in a desktop browser only Anthropic permits direct calls (via the
// anthropic-dangerous-direct-browser-access header) — NVIDIA is blocked by
// CORS there and the app falls back to the heuristic.
import { getApiKey } from './store.js';

const CLAUDE_MODEL = 'claude-opus-4-8';
const CLAUDE_URL = 'https://api.anthropic.com/v1/messages';
const NVIDIA_MODEL = 'meta/llama-3.3-70b-instruct';
const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

// 'claude' | 'nvidia' | null, detected from the saved key's prefix.
export function aiName() {
  const key = getApiKey();
  if (!key) return null;
  return key.startsWith('nvapi-') ? 'nvidia' : 'claude';
}

export function hasAiKey() {
  return !!getApiKey();
}

async function claudeRequest(body) {
  const res = await fetch(CLAUDE_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': getApiKey(),
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 1024, ...body }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message || `API error ${res.status}`);
  return data;
}

async function nvidiaRequest(messages) {
  const res = await fetch(NVIDIA_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({ model: NVIDIA_MODEL, messages, temperature: 0.2, max_tokens: 500 }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error?.message || data?.detail || data?.title || `API error ${res.status}`);
  }
  return data?.choices?.[0]?.message?.content || '';
}

// Open models lack Anthropic's structured-output guarantee — ask for bare
// JSON, then dig it out of whatever fences or prose surround it.
function extractJson(text) {
  const cleaned = String(text).replace(/```(?:json)?/g, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('model reply had no JSON');
  return JSON.parse(cleaned.slice(start, end + 1));
}

const SYSTEM_PROMPT = `You are an expert day trader using ICT (Inner Circle Trader) Smart Money Concepts.
You are given recent OHLC candlestick data (1-minute candles, oldest to newest) for a market asset (crypto or a US stock/ETF).
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

export async function analyzeWithAI(label, candles, position = null) {
  const provider = aiName();
  if (!provider) throw new Error('No API key');
  const recent = candles.slice(-60).map((c) => [
    +c.o.toFixed(6), +c.h.toFixed(6), +c.l.toFixed(6), +c.c.toFixed(6),
  ]);
  const last = candles[candles.length - 1].c;
  const posLine = position
    ? `\nOpen position: entered at ${position.avgPrice}, currently ${(((last - position.avgPrice) / position.avgPrice) * 100).toFixed(2)}% from entry — SELL exits it, BUY is not possible.`
    : '\nNo open position — BUY would open one, SELL is not possible.';
  const userText =
    `Asset: ${label}\n` +
    `Current price: ${last}\n` +
    `Recent 1m candles as [open, high, low, close], oldest first:\n` +
    JSON.stringify(recent) + posLine;

  let out;
  if (provider === 'nvidia') {
    const text = await nvidiaRequest([
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content:
          userText +
          '\nRespond with ONLY this JSON object, nothing else:\n' +
          '{"signal":"BUY"|"SELL"|"HOLD","confidence":<0-100>,"reasoning":"<one sentence>","setup_type":"FVG"|"OB"|"BOS"|"MSS"|"OTHER"|"NONE"}',
      },
    ]);
    out = extractJson(text);
  } else {
    const resp = await claudeRequest({
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userText }],
      output_config: { format: { type: 'json_schema', schema: SIGNAL_SCHEMA } },
    });
    if (resp.stop_reason === 'refusal') throw new Error('refusal');
    out = JSON.parse(resp.content.find((b) => b.type === 'text')?.text || '{}');
  }

  if (!['BUY', 'SELL', 'HOLD'].includes(out.signal)) out.signal = 'HOLD';
  out.confidence = clamp(Math.round(+out.confidence || 0), 0, 100);
  out.reasoning = String(out.reasoning || '').slice(0, 300);
  if (!['FVG', 'OB', 'BOS', 'MSS', 'OTHER', 'NONE'].includes(out.setup_type)) out.setup_type = 'OTHER';
  return out;
}

// --- Local heuristic (no API key needed) -----------------------------------
// Weighted evidence scoring across five independent reads of the chart:
// EMA trend, fresh EMA cross, momentum (rate of change), RSI extremes, and
// 20-bar breakout. Each contributes bullish (+) or bearish (−) points; the
// total decides the signal and scales the confidence. Faster than the old
// single SMA-cross trigger (EMAs react sooner, and any strong combination
// fires — not just a cross), and the reasoning lists exactly which factors
// agreed.
function emaSeries(values, period) {
  const k = 2 / (period + 1);
  let e = values[0];
  const out = [e];
  for (let i = 1; i < values.length; i++) {
    e = values[i] * k + e * (1 - k);
    out.push(e);
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
  const fast = emaSeries(closes, 9);
  const slow = emaSeries(closes, 21);
  const fNow = fast.at(-1), fPrev = fast.at(-2);
  const sNow = slow.at(-1), sPrev = slow.at(-2);
  const r = rsi(closes, 14);
  const price = closes.at(-1);
  const roc10 = ((price - closes.at(-11)) / closes.at(-11)) * 100;
  // 20-bar breakout, excluding the current candle.
  const window = candles.slice(-21, -1);
  const hi20 = Math.max(...window.map((c) => c.h));
  const lo20 = Math.min(...window.map((c) => c.l));

  let score = 0;
  const bull = [], bear = [];
  const add = (pts, label) => {
    score += pts;
    (pts > 0 ? bull : bear).push(label);
  };

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
  if (score >= 1.8) signal = 'BUY';
  else if (score <= -1.8) signal = 'SELL';

  if (signal !== 'HOLD') {
    const factors = signal === 'BUY' ? bull : bear;
    setup_type = factors.some((f) => f.includes('cross')) ? (signal === 'BUY' ? 'BOS' : 'MSS')
      : factors.some((f) => f.includes('break')) ? 'BOS'
      : factors.some((f) => f.includes('RSI')) ? 'OB'
      : 'OTHER';
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

// --- Optional news sentiment via web search --------------------------------
// Claude-only: it relies on the Anthropic web-search tool, which the
// NVIDIA-hosted open models don't have.
export async function analyzeNews(label) {
  if (aiName() !== 'claude') return { sentiment: 'NEUTRAL', summary: 'News needs a Claude (sk-ant-…) key.' };
  try {
    const resp = await claudeRequest({
      system:
        'You are a financial markets news analyst. Use web search to find news from the last few hours about the given asset, plus any major macro/regulatory events today. Be concise.',
      messages: [{
        role: 'user',
        content:
          `Asset: ${label}. Summarize the latest short-term sentiment in one sentence, ` +
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
