import { getState, saveState, resetPortfolio, getApiKey, setApiKey } from './js/store.js';
import { supportedSymbols } from './js/marketData.js';
import { runCycle, reschedule, getStateView } from './js/engine.js';
import { onTick } from './js/priceFeed.js';

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
    body.innerHTML = '<tr><td colspan="8" class="empty">No trades yet. Hit “Check now”, or turn on Auto-watch.</td></tr>';
    return;
  }

  // Flash the newest row briefly when a trade just landed.
  const top = trades[0].id;
  if (lastTopTradeId !== undefined && lastTopTradeId !== null && top !== lastTopTradeId) {
    newTradeUntil = Date.now() + 1600;
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

$('saveBtn').addEventListener('click', () => {
  const s = getState();
  const nums = {
    tradeAmount: +$('tradeAmount').value,
    confidenceThreshold: +$('confidenceThreshold').value,
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

['startingBalance', 'tradeAmount', 'confidenceThreshold', 'pollIntervalSec', 'apiKey'].forEach((id) => {
  $(id).addEventListener('focus', () => (editingFields = true));
  $(id).addEventListener('blur', () => (editingFields = false));
});

// --- Boot --------------------------------------------------------------------
$('apiKey').value = getApiKey();
reschedule(); // resumes Auto-watch if it was left ON last time

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
