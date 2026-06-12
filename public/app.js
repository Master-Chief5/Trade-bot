import { getState, saveState, resetPortfolio, getApiKey, setApiKey } from './js/store.js';
import { supportedSymbols } from './js/marketData.js';
import { runCycle, reschedule, getStateView } from './js/engine.js';
import { onTick } from './js/priceFeed.js';
import { fetchCloud, cloudSetConfig, cloudReset } from './js/cloud.js';

const $ = (id) => document.getElementById(id);
let lastState = null;
let editingFields = false; // pause input overwrites while user types
let prevPrice = 0;
let lastTopTradeId; // undefined until first render, then last seen trade id
let newTradeUntil = 0;

const fmt = (n, d = 2) =>
  (n < 0 ? '-' : '') + '$' + Math.abs(Number(n)).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtNum = (n, d) => Number(n).toLocaleString(undefined, { maximumFractionDigits: d });
const signClass = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : 'flat');

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 2200);
}

function render(s) {
  lastState = s;
  const p = s.portfolio;

  // Headline P&L vs starting balance
  $('startBalLabel').textContent = fmt(p.startingBalance, 0);
  const pnlEl = $('totalPnl');
  pnlEl.textContent = (p.totalPnl >= 0 ? '+' : '') + fmt(p.totalPnl);
  pnlEl.className = 'hero-value ' + signClass(p.totalPnl);
  const pctEl = $('pnlPct');
  pctEl.textContent = (p.pnlPct >= 0 ? '+' : '') + p.pnlPct.toFixed(2) + '%';
  pctEl.className = 'hero-sub ' + signClass(p.totalPnl);

  $('equity').textContent = fmt(p.equity);
  $('cash').textContent = fmt(p.cash);
  setSigned('realized', p.realizedPnl);
  setSigned('unrealized', p.unrealizedPnl);
  $('position').textContent = p.position
    ? `${fmtNum(p.position.qty, 6)} ${p.position.symbol} @ ${fmt(p.position.avgPrice, p.position.avgPrice < 1 ? 5 : 2)}`
    : 'flat';
  $('position').className = 'v';

  // Price, with a flash on every live change
  const priceEl = $('price');
  priceEl.textContent = s.price ? fmt(s.price, s.price < 1 ? 5 : 2) : '—';
  const dir = prevPrice && s.price && s.price !== prevPrice
    ? (s.price > prevPrice ? 'flash-up' : 'flash-down')
    : null;
  priceEl.className = 'v';
  if (dir) { void priceEl.offsetWidth; priceEl.classList.add(dir); }
  prevPrice = s.price;

  // Source chips
  $('dataSource').textContent = 'data: ' + s.dataSource + (s.feedLive ? ' · LIVE' : '');
  $('dataSource').className = 'chip' + (s.feedLive ? ' chip-live' : '');
  // Show what actually analyzed the last cycle — including AI failures
  // (bad key, no credit), which fall back to the heuristic with the reason.
  $('analyzerSource').textContent = 'analyzer: ' + (s.latest?.analyzerSource || s.analyzerSource);

  // Current signal
  const L = s.latest;
  const badge = $('signalBadge');
  if (L) {
    badge.textContent = L.signal;
    badge.className = 'signal-badge ' + L.signal.toLowerCase();
    $('confidence').textContent = L.confidence + '%';
    $('setupType').textContent = 'setup: ' + L.setup_type;
    $('reasoning').textContent = L.reasoning;
    const note = [];
    if (L.executed) note.push('✓ executed a paper trade');
    else if (L.note) note.push(L.note);
    $('signalNote').textContent = note.join(' · ');
    const sl = $('sentimentLine');
    if (s.config.useNews && L.sentiment) {
      sl.textContent = `News sentiment: ${L.sentiment}` + (L.newsSummary ? ` — ${L.newsSummary}` : '');
      sl.classList.remove('hidden');
    } else sl.classList.add('hidden');
  }

  // Inputs (don't clobber while user is editing)
  if (!editingFields) {
    if (document.activeElement !== $('startingBalance')) $('startingBalance').value = p.startingBalance;
    $('tradeAmount').value = s.config.tradeAmount;
    $('autoSize').checked = !!s.config.autoSize;
    $('confidenceThreshold').value = s.config.confidenceThreshold;
    $('takeProfitPct').value = s.config.takeProfitPct;
    $('stopLossPct').value = s.config.stopLossPct;
    $('pollIntervalSec').value = s.config.pollIntervalSec;
    $('useNews').checked = s.config.useNews;
    if (document.activeElement !== $('apiKey')) $('apiKey').value = getApiKey();
    buildSymbols(s);
  }
  $('tradeAmount').disabled = !!s.config.autoSize;

  // Auto toggle
  const at = $('autoToggle');
  at.textContent = s.autoMode ? 'ON' : 'OFF';
  at.className = 'toggle ' + (s.autoMode ? 'on' : 'off');

  renderTrades(s.trades);
  drawChart(s.candles);
}

function setSigned(id, v) {
  const el = $(id);
  el.textContent = (v >= 0 ? '+' : '') + fmt(v);
  el.className = 'v ' + signClass(v);
}

function buildSymbols(s) {
  const sel = $('symbol');
  const flat = s.symbols || [];
  if (sel.options.length === flat.length && sel.value === s.config.symbol) return;
  sel.innerHTML = '';
  const groups = s.symbolGroups || { crypto: flat, stocks: [] };
  for (const [label, syms] of [['Crypto', groups.crypto], ['Stocks & ETFs', groups.stocks]]) {
    if (!syms || !syms.length) continue;
    const og = document.createElement('optgroup');
    og.label = label;
    syms.forEach((sym) => {
      const o = document.createElement('option');
      o.value = sym; o.textContent = sym;
      if (sym === s.config.symbol) o.selected = true;
      og.appendChild(o);
    });
    sel.appendChild(og);
  }
}

function renderTrades(trades) {
  $('tradeCount').textContent = trades.length ? `${trades.length} trade${trades.length > 1 ? 's' : ''}` : '';
  const body = $('tradesBody');
  if (!trades.length) {
    lastTopTradeId = null;
    body.innerHTML = '<tr><td colspan="8" class="empty">No trades yet — it trades the moment a setup appears.</td></tr>';
    return;
  }

  // Flash the newest row — and the whole screen — when a trade just landed.
  const top = trades[0].id;
  if (lastTopTradeId !== undefined && lastTopTradeId !== null && top !== lastTopTradeId) {
    newTradeUntil = Date.now() + 1600;
    flashScreen(trades[0].action);
  }
  lastTopTradeId = top;
  const flashTop = Date.now() < newTradeUntil;

  body.innerHTML = trades.map((t, i) => {
    const d = new Date(t.time);
    const time = d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dec = t.price < 1 ? 5 : 2;
    const pnl = t.realizedPnl == null ? '—'
      : `<span class="${signClass(t.realizedPnl)}">${(t.realizedPnl >= 0 ? '+' : '') + fmt(t.realizedPnl)}</span>`;
    return `<tr${i === 0 && flashTop ? ' class="new-trade"' : ''}>
      <td>${time}</td>
      <td class="t-${t.action.toLowerCase()}">${t.action}</td>
      <td>${fmtNum(t.qty, 6)} ${t.symbol} <span class="muted">(${fmt(t.amountUsd)})</span></td>
      <td>${fmt(t.price, dec)}</td>
      <td>${t.confidence}%</td>
      <td>${pnl}</td>
      <td class="why">${escapeHtml(t.reasoning || '')}</td>
      <td><button class="copy-btn" data-i="${i}">Copy</button></td>
    </tr>`;
  }).join('');
  body.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => copyTrade(trades[+btn.dataset.i]));
  });
}

// Light the whole screen up green (BUY) or red (SELL), with a short buzz on
// phones that support it.
function flashScreen(action) {
  const f = $('screenFlash');
  f.className = 'screen-flash ' + action.toLowerCase();
  void f.offsetWidth; // restart the animation if one is mid-flight
  f.classList.add('go');
  try { navigator.vibrate?.(action === 'BUY' ? [60, 40, 60] : [140]); } catch { /* not supported */ }
  clearTimeout(flashScreen._t);
  flashScreen._t = setTimeout(() => (f.className = 'screen-flash'), 1200);
}

function copyTrade(t) {
  const d = new Date(t.time);
  const dec = t.price < 1 ? 5 : 2;
  const text =
    `${t.action} ${fmtNum(t.qty, 8)} ${t.symbol} (~${fmt(t.amountUsd)}) @ ${fmt(t.price, dec)} ` +
    `[SIMULATED ${d.toLocaleString()}] — confidence ${t.confidence}%. Reason: ${t.reasoning}`;
  navigator.clipboard?.writeText(text).then(
    () => toast('Trade copied to clipboard'),
    () => toast('Copy failed — select and copy manually')
  );
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function drawChart(candles) {
  const cv = $('chart');
  const ctx = cv.getContext('2d');
  const w = cv.width = cv.clientWidth * (window.devicePixelRatio || 1);
  const h = cv.height = 120 * (window.devicePixelRatio || 1);
  ctx.clearRect(0, 0, w, h);
  if (!candles || candles.length < 2) return;
  const xs = candles.map((c) => c.c);
  const min = Math.min(...xs), max = Math.max(...xs);
  const pad = 8 * (window.devicePixelRatio || 1);
  const sx = (i) => (i / (candles.length - 1)) * (w - pad * 2) + pad;
  const sy = (v) => h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
  const up = xs[xs.length - 1] >= xs[0];
  ctx.lineWidth = 2 * (window.devicePixelRatio || 1);
  ctx.strokeStyle = up ? '#2ecc71' : '#ff5c5c';
  ctx.beginPath();
  candles.forEach((c, i) => (i ? ctx.lineTo(sx(i), sy(c.c)) : ctx.moveTo(sx(i), sy(c.c))));
  ctx.stroke();
}

// --- Actions ---------------------------------------------------------------
$('analyzeBtn').addEventListener('click', async () => {
  $('analyzeBtn').textContent = 'Checking…';
  render(await runCycle());
  $('analyzeBtn').textContent = 'Check now';
});

// Switching the asset takes effect immediately — no "Save settings" needed.
// (It used to wait for Save, and the periodic re-render would even snap the
// dropdown back to the old asset, so switching looked broken.)
$('symbol').addEventListener('change', async () => {
  const s = getState();
  const sym = $('symbol').value;
  if (!supportedSymbols().includes(sym) || s.config.symbol === sym) return;
  s.config.symbol = sym;
  saveState();
  toast(`Watching ${sym}`);
  reschedule();              // realign the timer; kicks a cycle when auto-watch is on
  render(await runCycle());  // and load the new chart even when it's off
});

$('saveBtn').addEventListener('click', () => {
  const s = getState();
  const nums = {
    tradeAmount: +$('tradeAmount').value,
    confidenceThreshold: +$('confidenceThreshold').value,
    takeProfitPct: +$('takeProfitPct').value,
    stopLossPct: +$('stopLossPct').value,
    pollIntervalSec: +$('pollIntervalSec').value,
  };
  for (const [k, v] of Object.entries(nums)) {
    if (Number.isFinite(v) && v >= 0) s.config[k] = v;
  }
  s.config.pollIntervalSec = Math.max(5, s.config.pollIntervalSec || 15);
  const sym = $('symbol').value;
  if (supportedSymbols().includes(sym)) s.config.symbol = sym;
  s.config.autoSize = $('autoSize').checked;
  s.config.useNews = $('useNews').checked;
  setApiKey($('apiKey').value);
  saveState();
  editingFields = false;
  reschedule();
  render(getStateView());
  toast('Settings saved');
});

$('resetBtn').addEventListener('click', () => {
  const bal = +$('startingBalance').value;
  if (!(bal > 0)) return toast('Enter an amount above 0');
  resetPortfolio(bal);
  render(getStateView());
  toast(`Reset — watching with ${fmt(bal, 0)}`);
});

$('autoToggle').addEventListener('click', () => {
  const s = getState();
  s.config.autoMode = !s.config.autoMode;
  saveState();
  reschedule();
  render(getStateView());
  toast(s.config.autoMode ? 'Auto-watch ON' : 'Auto-watch OFF');
});

['startingBalance', 'tradeAmount', 'confidenceThreshold', 'takeProfitPct', 'stopLossPct', 'pollIntervalSec', 'apiKey'].forEach((id) => {
  $(id).addEventListener('focus', () => (editingFields = true));
  $(id).addEventListener('blur', () => (editingFields = false));
});

// --- Cloud bot panel ---------------------------------------------------------
let cloud = null;     // last fetched { state, hasAiKey, now }, null when unreachable
let lastCloudTradeId; // undefined until first successful poll

const fmtAgo = (t) => {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 90 ? `${s}s ago` : `${Math.round(s / 60)}m ago`;
};

function renderCloud() {
  const status = $('cloudStatus');
  if (!cloud) {
    status.textContent = navigator.onLine === false
      ? 'phone offline — bot still running in the cloud'
      : 'unreachable';
    status.className = 'chip';
    return;
  }
  const st = cloud.state;
  const pf = st.portfolio;
  const latest = st.latest;
  const posPrice = pf.position
    ? (latest && latest.symbol === pf.position.symbol ? latest.price : pf.position.avgPrice)
    : 0;
  const equity = pf.cash + (pf.position ? pf.position.qty * posPrice : 0);
  const pnl = equity - pf.startingBalance;

  const fresh = latest && Date.now() - latest.time < 3 * 60_000;
  status.textContent = !st.config.autoMode ? 'paused' : fresh ? 'running · live' : 'running — waiting for next check';
  status.className = 'chip' + (st.config.autoMode && fresh ? ' chip-live' : '');
  $('cloudPauseBtn').textContent = st.config.autoMode ? 'Pause' : 'Resume';

  $('cloudEquity').textContent = fmt(equity);
  const pnlEl = $('cloudPnl');
  pnlEl.textContent = (pnl >= 0 ? '+' : '') + fmt(pnl);
  pnlEl.className = 'v ' + signClass(pnl);
  $('cloudPosition').textContent = pf.position ? `${fmtNum(pf.position.qty, 6)} ${pf.position.symbol}` : 'flat';
  $('cloudSymbol').textContent = st.config.symbol;
  $('cloudLastTick').textContent = latest ? fmtAgo(latest.time) : '—';
  $('cloudAnalyzer').textContent = (latest?.analyzerSource || (cloud.hasAiKey ? 'AI' : 'heuristic')).split(' ')[0];
  $('cloudLatest').textContent = latest
    ? `${latest.signal} ${latest.confidence}% — ${latest.reasoning}`
    : 'No checks yet.';

  const trades = st.trades.slice(0, 6);
  $('cloudTradesList').innerHTML = trades.length
    ? trades.map((t) => {
        const d = new Date(t.time);
        const pnlTxt = t.realizedPnl == null ? ''
          : ` · <span class="${signClass(t.realizedPnl)}">${(t.realizedPnl >= 0 ? '+' : '') + fmt(t.realizedPnl)}</span>`;
        return `<div class="ct-row"><span class="t-${t.action.toLowerCase()}">${t.action}</span> ` +
          `${fmtNum(t.qty, 6)} ${t.symbol} @ ${fmt(t.price, t.price < 1 ? 5 : 2)} (${fmt(t.amountUsd)})${pnlTxt} ` +
          `<span class="muted">${d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>`;
      }).join('')
    : '<div class="muted">No cloud trades yet.</div>';

  // Trades made while you were away (or just now) light the screen up too.
  const top = trades[0]?.id || null;
  if (lastCloudTradeId !== undefined && top && top !== lastCloudTradeId) flashScreen(trades[0].action);
  lastCloudTradeId = top;
}

async function pollCloud() {
  try { cloud = await fetchCloud(); } catch { cloud = null; }
  renderCloud();
}

$('cloudPauseBtn').addEventListener('click', async () => {
  if (!cloud) return toast('Cloud unreachable');
  try {
    const pausing = cloud.state.config.autoMode;
    await cloudSetConfig({ autoMode: !pausing });
    toast(pausing ? 'Cloud bot paused' : 'Cloud bot resumed');
    await pollCloud();
  } catch (e) { toast('Cloud error: ' + e.message); }
});

$('cloudSyncBtn').addEventListener('click', async () => {
  const c = getState().config;
  try {
    await cloudSetConfig({
      symbol: c.symbol,
      confidenceThreshold: c.confidenceThreshold,
      takeProfitPct: c.takeProfitPct,
      stopLossPct: c.stopLossPct,
      autoSize: c.autoSize,
      tradeAmount: c.tradeAmount,
      cooldownMinutes: c.cooldownMinutes,
    }, getApiKey());
    toast(getApiKey() ? 'Settings + AI key sent to cloud' : 'Settings sent to cloud');
    await pollCloud();
  } catch (e) { toast('Cloud error: ' + e.message); }
});

$('cloudResetBtn').addEventListener('click', async () => {
  const bal = +$('startingBalance').value;
  if (!(bal > 0)) return toast('Enter an amount above 0');
  try {
    await cloudReset(bal);
    toast(`Cloud bot reset — watching with ${fmt(bal, 0)}`);
    await pollCloud();
  } catch (e) { toast('Cloud error: ' + e.message); }
});

// --- Boot --------------------------------------------------------------------
$('apiKey').value = getApiKey();
reschedule(); // resumes Auto-watch if it was left ON last time
pollCloud();
setInterval(pollCloud, 10_000);

function tick() { render(getStateView()); }

// Re-render on live price ticks (throttled), plus a steady 3s heartbeat.
let lastTickRender = 0;
onTick(() => {
  const now = Date.now();
  if (now - lastTickRender > 800) {
    lastTickRender = now;
    tick();
  }
});
tick();
setInterval(tick, 3000);
