# Crypto Paper Trader

A watch-only crypto trading dashboard. You tell it **how much you have**, it
watches the live market, and it logs the **BUY/SELL trades it would make** —
all **simulated against a balance you choose**. You watch the trade feed and
**copy any trade into your own account by hand** if you decide to.

> **Paper mode only.** This app never places a real order, never connects to a
> brokerage or exchange account, and never touches another app. "Copy a trade"
> is something *you* do manually, at your own risk. It's a learning tool, not
> financial advice. Automated real-money trading off an LLM reading charts is a
> reliable way to lose money — that's deliberately not what this does.

## What it does

- **Live data** from Binance/Coinbase public APIs (no account needed). If those
  are unreachable (e.g. a locked-down network), it falls back to a built-in
  **market simulator** so the app still runs — the data source is labelled in
  the UI (`live:binance` / `live:coinbase` / `simulated`).
- **Analysis** via Claude (official `@anthropic-ai/sdk`, structured-output JSON)
  when `ANTHROPIC_API_KEY` is set. Without a key it uses a local
  **SMA-cross + RSI heuristic**, so it's fully functional offline.
- **Paper engine** trades your chosen balance: buys `$ per trade` worth on a
  qualifying BUY, sells the position on a SELL, respects a confidence threshold
  and a cooldown, and tracks realized + unrealized P&L.
- **Headline P&L** shows exactly how much you're up or down on your balance.
- **Trade feed** with a **Copy** button on every row.

## Run

```bash
npm install
# optional — enables Claude analysis:
cp .env.example .env && echo "set your ANTHROPIC_API_KEY in .env"
npm start
# open http://localhost:3000
```

No API key? It just works with the heuristic analyzer.

## Settings

- **How much you have** — your starting balance; "Set & reset" applies it and clears history.
- **Coin** — BTC, ETH, SOL, XRP, DOGE, ADA.
- **$ per trade** — size of each simulated buy.
- **Confidence threshold** — minimum analyzer confidence (0–100) to act.
- **Check interval** — how often Auto-watch polls the market.
- **Use news sentiment** — adds a Claude web-search sentiment pass (needs API key).
- **Check now** — run one analysis cycle immediately.
- **Auto-watch ON/OFF** — start/stop the polling loop. Off by default.

## How a decision is made

1. Pull recent 1-minute candles.
2. Analyzer returns `{ signal, confidence, reasoning, setup_type }`.
3. If news is on: combine with sentiment (BUY+NEGATIVE → HOLD, SELL+POSITIVE → HOLD).
4. Paper engine executes the (simulated) trade if confidence ≥ threshold, not in
   cooldown, and the position rules allow it.

## Project layout

```
src/
  server.js       Express app, watch loop, API
  marketData.js   Live candles + offline simulator
  analyzer.js     Claude (SDK) + local heuristic + news
  paperEngine.js  Simulated buy/sell, P&L
  store.js        JSON-file state
public/           Dashboard (vanilla HTML/CSS/JS)
```

State persists to `data/state.json` (gitignored).
