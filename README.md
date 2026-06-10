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

The whole app runs on your device (phone or browser) — there is no backend.

## Get the Android app (APK)

Every push to `main` builds an APK automatically. On your phone:

1. Open the [**apk-latest** release](https://github.com/Master-Chief5/Trade-bot/releases/tag/apk-latest)
   and download `crypto-paper-trader.apk`.
2. Open the downloaded file and allow installing from your browser when Android
   asks ("install unknown apps").
3. It's a debug-signed build for personal use, so Android may show an extra
   warning — that's expected for sideloaded apps.

Auto-watch runs while the app is open; closing the app pauses it.

## Run it on a computer

```bash
npm install
npm start
# open http://localhost:3000
```

The server only serves static files — all logic runs in the page.

## Claude analysis (optional)

Out of the box the app uses a local **SMA-cross + RSI heuristic**, fully
offline. To switch the analyzer to **Claude**, paste your Anthropic API key
into **Setup → Claude API key** and hit "Save settings". The key is stored
only on your device (localStorage) and is sent only to `api.anthropic.com`.
"Use news sentiment" adds a Claude web-search sentiment pass (needs the key).

## What it does

- **Live data** from Binance/Coinbase public APIs (no account needed). If those
  are unreachable, it falls back to a built-in **market simulator** so the app
  still runs — the data source is labelled in the UI
  (`live:binance` / `live:coinbase` / `simulated`).
- **Analysis** via Claude (structured-output JSON) when a key is set, else the
  local heuristic.
- **Paper engine** trades your chosen balance: buys `$ per trade` worth on a
  qualifying BUY, sells the position on a SELL, respects a confidence threshold
  and a cooldown, and tracks realized + unrealized P&L.
- **Headline P&L** shows exactly how much you're up or down on your balance.
- **Trade feed** with a **Copy** button on every row.

State persists in the device's local storage.

## Settings

- **How much you have** — your starting balance; "Set & reset" applies it and clears history.
- **Coin** — BTC, ETH, SOL, XRP, DOGE, ADA.
- **$ per trade** — size of each simulated buy.
- **Confidence threshold** — minimum analyzer confidence (0–100) to act.
- **Check interval** — how often Auto-watch polls the market.
- **Use news sentiment** — adds a Claude web-search sentiment pass (needs API key).
- **Claude API key** — optional; stays on this device.
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
public/                    The whole app (vanilla HTML/CSS/JS, no build step)
  app.js                     Dashboard UI
  js/engine.js               Watch loop + view assembly
  js/marketData.js           Live candles + offline simulator
  js/analyzer.js             Claude (Messages API) + local heuristic + news
  js/paperEngine.js          Simulated buy/sell, P&L
  js/store.js                localStorage state
src/server.js              Tiny static server for desktop use
capacitor.config.json      Android wrapper config
.github/workflows/android.yml  Builds + publishes the APK
```

## Building the APK yourself

GitHub Actions does this on every push to `main`. To build locally instead
(needs the Android SDK + Java 21):

```bash
npm install
npx cap add android
cd android && ./gradlew assembleDebug
# APK lands in android/app/build/outputs/apk/debug/app-debug.apk
```
