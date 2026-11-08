# Stock data configuration

## Symbols

`IWM, SPY, QQQ, SOXL, SPCX`, in this order (the order also sets the chart colors).

All five were checked against Twelve Data's symbol search on 8 Nov 2026:

| Symbol | Instrument | Listing used |
|---|---|---|
| IWM | iShares Russell 2000 ETF | NYSE Arca, USD |
| SPY | SPDR S&P 500 ETF Trust | NYSE Arca, USD |
| QQQ | Invesco QQQ Trust | NASDAQ, USD |
| SOXL | Direxion Daily Semiconductor Bull 3X | NYSE Arca, USD |
| SPCX | Space Exploration Technologies Corp. Class A | NASDAQ, USD |

Rows from a non-USD listing are rejected. If one appears, that symbol keeps its last good value and `%NexusMsg` names it.

To change symbols (optional): in Tasker VARS, create `%NexusSymbols` = `AAA,BBB,CCC,DDD,EEE` (max 5).
The wallpaper legend and colors follow the same order.

## Data source

[Twelve Data](https://twelvedata.com), free plan: 800 credits per day and 8 per minute. Each request costs 1 credit per symbol.

| Request | When | Credits |
|---|---|---|
| `/quote` for 5 symbols (price, $ change, % change) | every 5 min in market hours, screen on | 5 |
| `/time_series` 1h bars, last 45 (5 trading days) | hourly in market hours | 5 |
| either | outside market hours: at most every 3 h | 5 |

The two requests are 61 s apart, which keeps each minute within the limit.
The worst-case day uses about 425 credits.

## Values sent to KLWP (Kustom Tasker plugin)

| KLWP formula | Content |
|---|---|
| `$br(tasker, nx_q)$` | `SYM;PRICE;CHG;PCT;DIR` × 5, joined by `|`. DIR is `1`, `-1` or `0` |
| `$br(tasker, nx_chart)$` | 6 SVG paths in a 0–100 box joined by `|` (5 series + the 0 % line) |
| `$br(tasker, nx_meta)$` | `TS|STATE|UPDATED|YMAX|YMIN|ZEROY|D1|D2|D3|D4|D5|MSG` |

`STATE` is `OPEN`, `CLOSED` or `ERROR`. `TS` is the Unix time of the last good prices. KLWP compares it with
`df(S)` to show **Stale** after 20 minutes, so this works even if Tasker has stopped.

## Chart math

Each series is normalized to its first bar in the window: `(close / first_close − 1) × 100`.
Bars are aligned by timestamp, and a missing bar repeats the previous value.
The y-range is rounded to a tidy value (0.5, 1, 2, 2.5, 5, 10 … %).
