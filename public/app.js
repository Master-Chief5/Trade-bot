// Dashboard + remote control for THE bot (which runs in the cloud 24/7).
// The phone shows live prices and the bot's portfolio/trades, and while the
// app is open it accelerates the bot: extra checks on candle closes and the
// instant a take-profit/stop-loss is crossed.
import { getState, saveState, getApiKey, setApiKey } from './js/store.js';
import { supportedSymbols } from './js/marketData.js';
import { refreshMarket, reschedule, getMarketView } from './js/engine.js';
import { onTick, onCandleClose } from './js/priceFeed.js';
import { fetchCloud, cloudSetConfig, cloudReset, cloudTick } from './js/cloud.js';

const $ = (id) => document.getElementById(id);
let cloud = null;           // last successful cloud fetch { state, hasAiKey, now }
let cloudOk = false;        // is the cloud reachable right now?
let cloudSyncedAt = 0;
let editingFields = false;  // pause input overwrites while user types
let prevPrice = 0;
let lastTopTradeId;         // undefined until first successful poll
let newTradeUntil = 0;

const fmt = (n, d = 2) =>
  (n < 0 ? '-' : '') + '$' + Math.abs(Number(n)).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtNum = (n, d) => Number(n).toLocaleString(undefined, { maximumFractionDigits: d });
const signClass = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : 'flat');
const fmtAgo = (t) => {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 90 ? `${s}s ago` : `${Math.round(s / 60)}m ago`;
};

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 2200);
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

function render() {
  const m = getMarketView();
  const st = cloud?.state || null;

  // Chips: live data feed (this phone) + the bot (cloud).
  $('dataSource').textContent = 'data: ' + m.dataSource + (m.feedLive ? ' · LIVE' : '');
  $('dataSource').className = 'chip' + (m.feedLive ? ' chip-live' : '');
  const botChip = $('analyzerSource');
  if (!st) {
    botChip.textContent = 'bot: connecting…';
    botChip.className = 'chip';
  } else {
    const latest = st.latest;
    const fresh = latest && Date.now() - latest.time < 3 * 60_000;
    const an = latest?.analyzerSource || (cloud.hasAiKey ? 'heuristic+AI' : 'heuristic');
    botChip.textContent = 'bot: ' + (!cloudOk ? 'offline · still trading' : !st.config.autoMode ? 'paused' : fresh ? 'running' : 'waiting') + ' · ' + an;
    botChip.className = 'chip' + (cloudOk && st.config.autoMode && fresh ? ' chip-live' : '');
  }
  $('connNote').classList.toggle('hidden', cloudOk);
  if (!cloudOk && cloudSyncedAt) {
    $('connNote').textContent =
      `📡 Can't reach the bot right now — it keeps trading in the cloud on its own. Showing what it had done as of ${fmtAgo(cloudSyncedAt)}; this screen catches up automatically.`;
  }

  // Hero: the bot's portfolio, with the live price filling in unrealized P&L
  // between cloud syncs.
  if (st) {
    const pf = st.portfolio;
    const pos = pf.position;
    const posPrice = pos
      ? (pos.symbol === m.symbol && m.price ? m.price
        : st.latest && st.latest.symbol === pos.symbol ? st.latest.price
        : pos.avgPrice)
      : 0;
    const equity = pf.cash + (pos ? pos.qty * posPrice : 0);
    const unrealized = pos ? (posPrice - pos.avgPrice) * pos.qty : 0;
    const totalPnl = equity - pf.startingBalance;
    const pnlPct = pf.startingBalance ? (totalPnl / pf.startingBalance) * 100 : 0;

    $('startBalLabel').textContent = fmt(pf.startingBalance, 0);
    const pnlEl = $('totalPnl');
    pnlEl.textContent = (totalPnl >= 0 ? '+' : '') + fmt(totalPnl);
    pnlEl.className = 'hero-value ' + signClass(totalPnl);
    const pctEl = $('pnlPct');
    pctEl.textContent = (pnlPct >= 0 ? '+' : '') + pnlPct.toFixed(2) + '%';
    pctEl.className = 'hero-sub ' + signClass(totalPnl);
    $('equity').textContent = fmt(equity);
    $('cash').textContent = fmt(pf.cash);
    setSigned('realized', pf.realizedPnl);
    setSigned('unrealized', unrealized);
    $('position').textContent = pos
      ? `${fmtNum(pos.qty, 6)} ${pos.symbol} @ ${fmt(pos.avgPrice, pos.avgPrice < 1 ? 5 : 2)}`
      : 'flat';
    $('position').className = 'v';
  }

  // Live price with a flash on every change.
  const priceEl = $('price');
  priceEl.textContent = m.price ? fmt(m.price, m.price < 1 ? 5 : 2) : '—';
  const dir = prevPrice && m.price && m.price !== prevPrice
    ? (m.price > prevPrice ? 'flash-up' : 'flash-down')
    : null;
  priceEl.className = 'v';
  if (dir) { void priceEl.offsetWidth; priceEl.classList.add(dir); }
  prevPrice = m.price;

  // Current signal: the bot's latest decision.
  const L = st?.latest;
  if (L) {
    const badge = $('signalBadge');
    badge.textContent = L.signal;
    badge.className = 'signal-badge ' + L.signal.toLowerCase();
    $('confidence').textContent = L.confidence + '%';
    $('setupType').textContent = 'setup: ' + L.setup_type + (L.symbol ? ` · ${L.symbol}` : '');
    $('reasoning').textContent = L.reasoning;
    const note = [];
    if (L.executed) note.push('✓ executed a paper trade');
    else if (L.note) note.push(L.note);
    note.push(`checked ${fmtAgo(L.time)}`);
    $('signalNote').textContent = note.join(' · ');
  }

  // Inputs (don't clobber while user is editing).
  const cfg = getState().config;
  if (!editingFields) {
    if (document.activeElement !== $('startingBalance')) {
      $('startingBalance').value = st ? st.portfolio.startingBalance : cfg.startingBalance;
    }
    $('tradeAmount').value = cfg.tradeAmount;
    $('autoSize').checked = !!cfg.autoSize;
    $('confidenceThreshold').value = cfg.confidenceThreshold;
    $('takeProfitPct').value = cfg.takeProfitPct;
    $('stopLossPct').value = cfg.stopLossPct;
    $('pollIntervalSec').value = cfg.pollIntervalSec;
    if (document.activeElement !== $('apiKey')) $('apiKey').value = getApiKey();
    buildSymbols(m, cfg);
  }
  $('tradeAmount').disabled = !!cfg.autoSize;

  // Auto-watch = the cloud bot's on/off switch.
  const at = $('autoToggle');
  const auto = st ? st.config.autoMode : null;
  at.textContent = auto === null ? '…' : auto ? 'ON' : 'OFF';
  at.className = 'toggle ' + (auto ? 'on' : 'off');

  renderTrades(st?.trades || []);
  drawChart(m.candles);
}

function setSigned(id, v) {
  const el = $(id);
  el.textContent = (v >= 0 ? '+' : '') + fmt(v);
  el.className = 'v ' + signClass(v);
}

function buildSymbols(m, cfg) {
  const sel = $('symbol');
  const flat = m.symbols || [];
  if (sel.options.length === flat.length && sel.value === cfg.symbol) return;
  sel.innerHTML = '';
  const groups = m.symbolGroups || { crypto: flat, stocks: [] };
  for (const [label, syms] of [['Crypto', groups.crypto], ['Stocks & ETFs', groups.stocks]]) {
    if (!syms || !syms.length) continue;
    const og = document.createElement('optgroup');
    og.label = label;
    syms.forEach((sym) => {
      const o = document.createElement('option');
      o.value = sym; o.textContent = sym;
      if (sym === cfg.symbol) o.selected = true;
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
    body.innerHTML = '<tr><td colspan="8" class="empty">No trades yet — the bot trades the moment a setup appears.</td></tr>';
    return;
  }

  // Flash the newest row — and the whole screen — when a trade just landed
  // (including trades it made while the app was closed and just synced in).
  const top = trades[0].id;
  if (lastTopTradeId !== undefined && lastTopTradeId !== null && top !== lastTopTradeId) {
    newTradeUntil = Date.now() + 1600;
    flashScreen(trades[0].action);
  }
  lastTopTradeId = top;
  const flashTop = Date.now() < newTradeUntil;

  body.innerHTML = trades.slice(0, 100).map((t, i) => {
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

// --- Cloud sync ---------------------------------------------------------------
async function pollCloud() {
  try {
    cloud = await fetchCloud();
    cloudOk = true;
    cloudSyncedAt = Date.now();
  } catch {
    cloudOk = false;
  }
  render();
}

// Nudge the bot for an extra check (it ignores nudges more often than ~15s).
let lastKick = 0;
async function kickCloud(force = false) {
  if (!force && Date.now() - lastKick < 8000) return;
  lastKick = Date.now();
  try {
    await cloudTick();
    await pollCloud();
  } catch { /* offline — the bot's own clock keeps it going */ }
}

// While watching: decide on every closed 1-minute candle…
onCandleClose(() => {
  if (cloudOk && cloud?.state?.config.autoMode) kickCloud();
});

// …and exit the instant a live tick crosses take-profit/stop-loss.
onTick((price) => {
  const st = cloud?.state;
  const pos = st?.portfolio.position;
  if (cloudOk && pos && pos.symbol === getState().config.symbol && price > 0) {
    const movePct = ((price - pos.avgPrice) / pos.avgPrice) * 100;
    const tp = Number(st.config.takeProfitPct) || 0;
    const sl = Number(st.config.stopLossPct) || 0;
    if ((tp > 0 && movePct >= tp) || (sl > 0 && movePct <= -sl)) kickCloud();
  }
});

// --- Actions ---------------------------------------------------------------
$('analyzeBtn').addEventListener('click', async () => {
  $('analyzeBtn').textContent = 'Checking…';
  await kickCloud(true);
  $('analyzeBtn').textContent = 'Check now';
  if (!cloudOk) toast('Bot unreachable — it still checks once a minute on its own');
});

$('saveBtn').addEventListener('click', async () => {
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
  setApiKey($('apiKey').value);
  saveState();
  editingFields = false;
  reschedule();
  try {
    await cloudSetConfig({
      symbol: s.config.symbol,
      confidenceThreshold: s.config.confidenceThreshold,
      takeProfitPct: s.config.takeProfitPct,
      stopLossPct: s.config.stopLossPct,
      autoSize: s.config.autoSize,
      tradeAmount: s.config.tradeAmount,
      cooldownMinutes: s.config.cooldownMinutes,
    }, getApiKey());
    await pollCloud();
    toast('Saved — the bot has the new settings' + (getApiKey() ? ' + AI key' : ''));
  } catch {
    toast('Saved on this phone — couldn\'t reach the bot, hit Save again when online');
  }
  render();
});

$('resetBtn').addEventListener('click', async () => {
  const bal = +$('startingBalance').value;
  if (!(bal > 0)) return toast('Enter an amount above 0');
  getState().config.startingBalance = bal;
  saveState();
  try {
    await cloudReset(bal);
    await pollCloud();
    toast(`Bot reset — trading with ${fmt(bal, 0)}`);
  } catch {
    toast('Bot unreachable — try again when online');
  }
});

$('autoToggle').addEventListener('click', async () => {
  if (!cloud) return toast('Bot unreachable — try again when online');
  const turningOff = cloud.state.config.autoMode;
  try {
    await cloudSetConfig({ autoMode: !turningOff });
    await pollCloud();
    toast(turningOff ? 'Bot paused' : 'Bot running');
  } catch {
    toast('Bot unreachable — try again when online');
  }
});

// Switching the asset takes effect immediately — chart here, bot in the cloud.
$('symbol').addEventListener('change', async () => {
  const s = getState();
  const sym = $('symbol').value;
  if (!supportedSymbols().includes(sym) || s.config.symbol === sym) return;
  s.config.symbol = sym;
  saveState();
  toast(`Watching ${sym}`);
  refreshMarket().then(render);
  try {
    await cloudSetConfig({ symbol: sym });
    await kickCloud(true);
  } catch { /* bot picks it up next time Save succeeds */ }
});

['startingBalance', 'tradeAmount', 'confidenceThreshold', 'takeProfitPct', 'stopLossPct', 'pollIntervalSec', 'apiKey'].forEach((id) => {
  $(id).addEventListener('focus', () => (editingFields = true));
  $(id).addEventListener('blur', () => (editingFields = false));
});

// --- Boot --------------------------------------------------------------------
$('apiKey').value = getApiKey();
reschedule();          // live chart/price loop
pollCloud();           // first bot sync
setInterval(pollCloud, 5000);

// Re-render on live price ticks (throttled), plus a steady 3s heartbeat.
let lastTickRender = 0;
onTick(() => {
  const now = Date.now();
  if (now - lastTickRender > 800) {
    lastTickRender = now;
    render();
  }
});
render();
setInterval(render, 3000);
