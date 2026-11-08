# Stock data configuration

## Symbols, KLWP variables and colors
| Row / line | Symbol | KLWP variable | Tasker variable | Line color |
|---|---|---|---|---|
| 1 | IWM | `iwm` | `%Nexus_iwm` | Orange `#E88A42` |
| 2 | SPY | `spy` | `%Nexus_spy` | Ink `#252525` |
| 3 | QQQ | `qqq` | `%Nexus_qqq` | Blue `#75B9D5` |
| 4 | GLD | `gld` | `%Nexus_gld` | Gold `#A89060` |
| 5 | MAGS | `mags` | `%Nexus_mags` | Purple `#8065A9` |

Green `#39845B` and red `#DC665D` are only used for up and down.

Each symbol variable holds `PRICE;CHG;PCT;DIR;DATE`, for example `735.29;+2.29;+0.31%;1;2026-11-06`.
DIR is `1` (up), `-1` (down) or `0`. KLWP reads it with `$br(tasker, iwm)$` and `tc(split, …, ";", n)`.

## Other values sent to KLWP
| Variable | Content |
|---|---|
| `nx_chart` | 6 SVG paths in a 0–100 box, joined by `|`: IWM, SPY, QQQ, GLD, MAGS, then the 0% line |
| `nx_meta` | `TS|STATE|UPDATED|YMAX|YMIN|ZEROY|D1..D5|MSG|SESSION|PROVIDER` |

STATE is `OPEN`, `CLOSED`, `EOD` or `ERROR`. KLWP shows **Stale data** when the last good update is older than:

| STATE | Stale after |
|---|---|
| OPEN | 45 min |
| EOD | 36 h |
| CLOSED | 4 days (covers weekends and holidays) |

## Chart
- All five lines share **one % scale**. The scale is rounded to 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 10 … %.
- Each line = `(close / close on the first of the 5 sessions − 1) × 100`, so every line starts at 0%.
- Twelve Data uses daily closes plus the latest quote as today's point. Massive uses daily closes only.
- If a session is missing for a symbol, its previous close is repeated. A symbol with no data draws no line. Nothing is invented.

Provider, key, credits and licensing: see [docs/DATA-PROVIDER.md](../docs/DATA-PROVIDER.md).
