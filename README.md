# Paper Trader — crypto & stocks

A watch-only trading dashboard for **crypto and US stocks/ETFs**. You tell it
**how much you have**, it watches the live market in real time, and it logs the
**BUY/SELL trades it would make** — all **simulated against a balance you
choose**. You watch the trade feed and **copy any trade into your own account
by hand** if you decide to.

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
(Note: stock data needs the Android app or the simulator on desktop — see below.)

## Live updates

- **Crypto prices stream in real time** over exchange WebSockets
  (Binance, falling back to Coinbase) — the price, chart and unrealized P&L
  tick continuously, and the source chip shows **LIVE**.
- While Auto-watch is ON, a fresh decision is made **every time a 1-minute
  candle closes**, plus on your configured check interval (down to every 5s).
- **Stocks** poll Yahoo Finance every 15s (there's no public stock WebSocket).
  Stock prices only move during US market hours (9:30–16:00 ET, Mon–Fri);
  outside those hours the source chip says "market closed".
- New trades flash in the feed the moment they execute.

## Assets

- **Crypto:** BTC, ETH, SOL, XRP, DOGE, ADA — live from Binance/Coinbase
  public APIs (no account needed), in the app *and* in desktop browsers.
- **Stocks & ETFs:** AAPL, MSFT, NVDA, TSLA, AMZN, GOOGL, META, SPY — live
  from Yahoo Finance **in the Android app**. Desktop browsers block Yahoo's
  API (CORS), so on a computer stocks run on the built-in simulator instead.
- If a live source is unreachable, the app falls back to a **market
  simulator** so it keeps working — the data source is always labelled
  (`live:binance` / `live:coinbase` / `live:yahoo` / `simulated`).

## Trade sizing

By default **the bot chooses its own trade size**: it stakes a share of
available cash equal to its confidence (82% confident → 82% of cash).
Untick "Let it choose the trade size" to use a fixed **$ per trade** instead.
Selling always closes the whole position.

## Claude analysis (optional)

Out of the box the app uses a local **SMA-cross + RSI heuristic** — free and
fully offline. To switch the analyzer to **Claude**, paste your own Anthropic
API key into **Setup → Claude API key** and hit "Save settings".

- Get a key at [platform.claude.com](https://platform.claude.com) → API keys
  (it's tied to your own Anthropic account and billing — nobody can hand you one).
- The key is stored only on your device (localStorage) and sent only to
  `api.anthropic.com`.
- **Cost note:** every check costs a small amount of API credit. With a very
  fast check interval (5s = ~720 checks/hour) that adds up — the free local
  heuristic is unlimited. "Use news sentiment" adds a second Claude call per check.

## Settings

- **How much you have** — your starting balance; "Set & reset" applies it and clears history.
- **Asset** — crypto (BTC, ETH, SOL, XRP, DOGE, ADA) or stocks (AAPL, MSFT, NVDA, TSLA, AMZN, GOOGL, META, SPY).
- **Let it choose the trade size** — confidence-scaled position sizing (default ON).
- **$ per trade** — fixed size of each simulated buy (when auto-size is off).
- **Confidence threshold** — minimum analyzer confidence (0–100) to act.
- **Check interval** — how often Auto-watch polls (min 5s; candle-close checks happen automatically too).
- **Use news sentiment** — adds a Claude web-search sentiment pass (needs API key).
- **Claude API key** — optional; stays on this device.
- **Check now** — run one analysis cycle immediately.
- **Auto-watch ON/OFF** — the watch loop. **On by default** — the app starts
  watching the moment you open it.

## How a decision is made

1. Pull the last ~100 one-minute candles for the chosen asset.
2. Analyzer (Claude or the local heuristic) returns
   `{ signal: BUY/SELL/HOLD, confidence: 0-100, reasoning, setup_type }`.
3. If news is on: combine with sentiment (BUY+NEGATIVE → HOLD, SELL+POSITIVE → HOLD).
4. Paper engine executes the (simulated) trade if confidence ≥ threshold
   (default 60), not in cooldown (1 min between trades by default), and the
   position rules allow it (one position at a time; BUY opens it, SELL closes it).

## Project layout

```
public/                    The whole app (vanilla HTML/CSS/JS, no build step)
  app.js                     Dashboard UI
  js/engine.js               Watch loop + view assembly
  js/priceFeed.js            Real-time price stream (WebSocket/poll/simulated)
  js/marketData.js           Candles: Binance/Coinbase/Yahoo + offline simulator
  js/analyzer.js             Claude (Messages API) + local heuristic + news
  js/paperEngine.js          Simulated buy/sell, sizing, P&L
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
