# Stock data configuration

## Symbols and colors
| Row / line | Symbol | Line color |
|---|---|---|
| 1 | IWM | Orange `#E88A42` |
| 2 | SPY | Ink `#252525` |
| 3 | QQQ | Blue `#75B9D5` |
| 4 | SOXL | Purple `#8065A9` |
| 5 | SPCX | Muted gold `#A89060` (green and red are reserved for up/down) |

**Proof of concept:** only **IWM** is fetched until you've confirmed it on the phone.
To switch on all five, set the Tasker variable `%NexusSymbols` = `IWM,SPY,QQQ,SOXL,SPCX`. No new files are needed.

## Provider: Massive Stocks Basic (end of day)
Request (one per symbol):
`GET https://api.massive.com/v2/aggs/ticker/{SYM}/range/1/day/{today−14d}/{today}?adjusted=true&sort=asc&limit=50`
with header `Authorization: Bearer %NexusKey`.

- **Close** = the latest completed session's close.
- **Daily $ change** = last close − previous close. **Daily %** = that ÷ previous close × 100.
- **Chart** = the latest 5 sessions, each line as `(close / first close − 1) × 100`. A missing session repeats the previous close.
- The dates are New York trading dates (Massive daily bars start at midnight ET).

## Schedule
- Tasker profile "NEXUS Daily 00:15 New York" checks once an hour (a few milliseconds of work).
  It downloads only at the **first check after 00:15 New York time** each day, so it works whatever time zone your phone uses.
- Manual refresh: run **NEXUS_Update_Market** with ▶ in Tasker, or from a home-screen Task Shortcut.
- At most 5 requests per batch, 13 s apart, and no new batch within 65 s.

## Values sent to KLWP (Kustom Tasker plugin → `$br(tasker, name)$`)
| Variable | Content |
|---|---|
| `nx_q` | 5 rows `SYM;CLOSE;CHG;PCT;DIR` joined by `|` (DIR = `1`, `-1`, `0`) |
| `nx_chart` | 6 SVG paths in a 0–100 box joined by `|`: 5 lines + the 0 % line |
| `nx_meta` | `TS|STATE|UPDATED|YMAX|YMIN|ZEROY|D1..D5|MSG|SESSION` |

KLWP formulas use lowercase `tasker`, which is the documented form: `$br(tasker, nx_q)$`.
`STATE` is `EOD` or `ERROR`. KLWP shows **Stale** when `df(S) − TS` is over 36 hours.
