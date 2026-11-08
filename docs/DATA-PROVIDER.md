# Market data provider, API key and licensing

## Which provider is used
Tasker variable **`%NexusProvider`** chooses it:

| Value | Provider | Data | When it updates |
|---|---|---|---|
| `twelvedata` (default if the variable is missing) | Twelve Data | Latest quote + daily closes | Every 30 min during US market hours (screen on), once after the close |
| `massive` | Massive Stocks Basic | End of day only | Once a day after 00:15 New York (first time the screen is on) |

Your key goes in **`%NexusKey`**. It must belong to the provider you picked.

## Getting a Twelve Data key
1. Go to **twelvedata.com** → **Sign up**.
2. Open your **Dashboard → API keys** → copy the key.
3. Tasker → **VARS** → **+** → `%NexusKey` → paste the key. Don't put it anywhere else.

The key is sent only as a hidden request header (`Authorization: apikey …`), never inside a web address.
It is **not** in `NEXUS.klwp`, `NEXUS.prj.xml`, this repository or anything sent to KLWP.
Tasker project exports never include variable values.

## ⚠️ Licensing — read this before daily use
These quotes are copied from Twelve Data's own pages, read on **8 Nov 2026**:

| Plan | Price | What Twelve Data says about use |
|---|---|---|
| **Basic** | $0 | "Internal non-display usage. Data may be used internally for **testing, evaluation, or development purposes only**. The data **cannot be displayed to users**, shared externally, or used in production systems." |
| **Grow** ("For hobby projects") | $79/month | "Internal display data access. View-only access for internal use within your applications and dashboards. The data may be displayed but **cannot be programmatically processed, stored, transformed**, or redistributed." |
| **Pro** | $229/month | "Everything from Grow…" (same display wording, more markets) |
| **Ultra** ("For high-volume personal use") | $999/month | "Internal non-display data access. Use the data internally for programmatic processing, analysis, system integration, **and internal display**." |

The terms of service add: "Use Data for Non-Display Use only as permitted by your subscription tier", and say external display needs a separate Redistribution add-on.

**What this means for NEXUS:**
- **Basic (free):** fine for **building and testing** the dashboard. It is **not approved** for showing the data on your wallpaper every day.
- **Grow / Pro:** these allow display, but NEXUS also **processes** the data (daily % change, the % chart from the first session) and **stores** the last good values. Grow's wording forbids that. **Not verified as allowed.**
- **Ultra** is the only plan whose wording covers processing **and** display. It's far more than a personal wallpaper needs.
- **Recommended:** before using NEXUS with Twelve Data beyond testing, email **sales@twelvedata.com**. Ask whether *"a personal, single-user phone wallpaper that shows quotes for 5 US ETFs and a % chart calculated from them"* is allowed on Grow, and what they'd require. Keep their written answer.

Nothing in this project claims that the free Basic plan is licensed for the finished display.

### The Massive option
Massive Stocks Basic is end-of-day only. **Its license terms for display use have not been checked either.**
Read massive.com's terms or ask them before relying on it.

## Credit use (Twelve Data)
Each endpoint costs **1 credit per symbol** (Twelve Data docs, `/quote` and `/time_series`).

| Request | Symbols | Credits | How often |
|---|---|---|---|
| `/quote?symbol=X` | 5 (one request each) | 5 | Every 30 min, 9:30–16:10 New York, screen on (max 14×) |
| `/quote` after the close | 5 | 5 | Once per trading day |
| `/time_series?interval=1day&outputsize=6` | 5 | 5 | Once per trading day (the 5-session chart) |
| **Total, screen on all day** | | **≈ 80 per day** | Basic limit: 800 per day |

- **Per minute:** at most 5 credits. When quotes and history are both due, Tasker pauses 61 s between them, because 10 at once would exceed the 8-per-minute limit.
- A manual refresh within 65 s of the previous one is skipped.
- History is downloaded at most once a day. Today's newest chart point comes from the quote, so it needs no extra credits.
- These numbers come from a simulated full trading day in the automated tests (`tasker/test/nexus.test.js`, result: 80 credits).

## Symbols (checked 8 Nov 2026)
| Symbol | Name | Twelve Data | Massive |
|---|---|---|---|
| IWM | iShares Russell 2000 ETF | ✓ NYSE, USD | ✓ |
| SPY | SPDR S&P 500 ETF Trust | ✓ NYSE, USD | ✓ |
| QQQ | Invesco QQQ Trust | ✓ NASDAQ, USD | ✓ |
| GLD | SPDR Gold Shares | ✓ NYSE, USD | ✓ (ARCX) |
| MAGS | Roundhill Magnificent Seven ETF | ✓ CBOE, USD | ✓ (BATS) |
