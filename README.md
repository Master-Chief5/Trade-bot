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

## How the analyzers work together

The bot has two brains that collaborate on every check:

1. A **multi-signal chart-math heuristic** (EMA trend + fresh cross +
   momentum + RSI extremes + 20-bar breakout, combined into a weighted
   score) screens the market every minute — free, instant.
2. An optional **AI model** is consulted whenever the decision could matter:
   the heuristic sees a possible setup, leans strongly, or a position is
   open. If both agree, the trade fires with boosted confidence; if the AI
   says HOLD, it vetoes the entry; if they call opposite directions, the bot
   stands aside. The AI also gets the heuristic's readout in its prompt.

The `bot:` chip shows what ran last — `heuristic+nvidia` when they worked
together, `heuristic · nvidia on standby` while nothing is happening, or the
error reason when an AI call failed and chart-math carried on alone.

To enable the AI half, paste an API key into **Setup → AI key** and hit Save
(it's stored in your bot's database, in a table only the bot can read). The
provider is detected from the key:

- **Claude** (`sk-ant-…` keys): the Anthropic Messages API —
  [platform.claude.com](https://platform.claude.com) → API keys.
- **NVIDIA** (`nvapi-…` keys): an NVIDIA-hosted open model
  (`meta/llama-3.3-70b-instruct`) via [build.nvidia.com](https://build.nvidia.com).

**Cost note:** consulting the AI spends API credit, but the screen-first
design keeps that to decision moments rather than every check, and the bot
never re-analyzes more than once per 15s no matter how hard the app nudges
it. (News sentiment from earlier versions is off in the unified bot for now.)

## Settings

- **How much you have** — your starting balance; "Set & reset" applies it and clears history.
- **Asset** — crypto (BTC, ETH, SOL, XRP, DOGE, ADA) or stocks (AAPL, MSFT, NVDA, TSLA, AMZN, GOOGL, META, SPY).
  Switching applies instantly — chart, price and feed follow the new pick.
- **Let it choose the trade size** — confidence-scaled position sizing (default ON).
- **$ per trade** — fixed size of each simulated buy (when auto-size is off).
- **Confidence threshold** — minimum analyzer confidence (0–100) to open a
  position. Signal-based exits use a lower bar (threshold − 15) — cutting a
  position takes less evidence than opening one.
- **Take profit / Stop loss %** — automatic exits, checked on every live price
  tick: a position up ≥ take-profit % or down ≥ stop-loss % is sold instantly
  (defaults +1% / −0.5%; 0 disables). These bypass threshold and cooldown.
- **Check interval** — how often the open app refreshes the chart and nudges
  the bot (min 5s; candle-close nudges happen automatically too).
- **AI key** — optional; Claude (`sk-ant-…`) or NVIDIA (`nvapi-…`). Saved to
  your bot when you hit Save settings.
- **Check now** — ask the bot for an extra check immediately.
- **Bot on/off** — pauses/resumes the bot itself (in the cloud). It keeps
  running with the app closed; pausing here stops it everywhere.

Save settings pushes everything (including the AI key) to the bot; settings
edited while offline apply the next time Save succeeds.

## How a decision is made

There is **one bot**, and it lives in the cloud (a Supabase Edge Function,
ticked once a minute by `pg_cron` + `pg_net`). The app is its dashboard and
remote control — and while the app is open, it accelerates the bot: a nudge
on every closed 1-minute candle and the instant a live tick crosses
take-profit/stop-loss, so reactions are near-instant when you're watching
and steady once-a-minute when you're not. Each check:

1. Pull the last ~100 one-minute candles for the chosen asset (server-side:
   Binance → Coinbase for crypto, Yahoo for stocks, with a short-lived candle
   cache to ride out rate limits; stocks stand down outside US market hours).
2. If a position is past take-profit/stop-loss, sell instantly — before any
   analysis, bypassing threshold and cooldown.
3. The analyzers (heuristic screen + AI confirm/veto, see above) produce
   `{ signal, confidence, reasoning, setup_type }`.
4. The paper engine executes if confidence clears the bar (entry: threshold,
   default 60; exit: threshold − 15), it's not in cooldown (1 min default),
   and position rules allow (one position at a time; BUY opens, SELL closes).
5. Executed trades flash the whole screen green (BUY) or red (SELL) — also
   when the app syncs in trades the bot made while it was closed.

The dashboard draws a **candlestick chart** with BUY/SELL markers where the
bot traded, and a **"money over time" graph**: the bot records its equity
once a minute (kept in its state, thinned as it grows), so the P&L curve
keeps building around the clock and the app draws it against a dashed
starting-balance line.

State lives in Postgres (`trade_bot_state`; the AI key in
`trade_bot_secrets`, readable only by the function). The endpoint requires
no auth (it guards only fake-money state); anyone with the exact URL could
read or reconfigure the paper bot — an accepted trade-off for a personal
tool. The function source lives in `supabase/functions/trade-bot/index.ts`.

## Project layout

```
public/                    The whole app (vanilla HTML/CSS/JS, no build step)
  app.js                     Dashboard UI
  js/engine.js               Chart/price upkeep for the dashboard
  js/priceFeed.js            Real-time price stream (WebSocket/poll/simulated)
  js/marketData.js           Candles: Binance/Coinbase/Yahoo + offline simulator
  js/analyzer.js             (legacy in-app analyzer; the bot embeds its own copy)
  js/paperEngine.js          (legacy in-app engine; the bot embeds its own copy)
  js/store.js                localStorage state
  js/cloud.js                Client for the bot (read state, send commands)
supabase/functions/trade-bot/index.ts  Cloud bot (Supabase Edge Function)
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
