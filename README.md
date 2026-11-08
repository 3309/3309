# NEXUS — KLWP Market & Weather Dashboard

A simple, bright live wallpaper for a Samsung Galaxy S22 (KLWP Pro + Tasker + Nova, 3 pages):
clock, 5-day weather, a 5-stock **end-of-day** watchlist (IWM, SPY, QQQ, SOXL, SPCX) from the Massive
Stocks Basic API, a combined 5-session % chart drawn with KLWP SVG Path shapes, and Phone / Messages / All apps buttons.

![preview](klwp/preview.png)

*Desktop layout preview. The IWM row and line use **real** Massive data (close of Fri 6 Nov 2026, `klwp/sample_iwm.json`).
The other rows are empty because the proof of concept fetches IWM only. Weather shows placeholders.*

## Files to put on the phone
| File | Install with |
|---|---|
| [`klwp/NEXUS.klwp`](klwp/NEXUS.klwp) | KLWP → Load preset → import |
| [`tasker/NEXUS.prj.xml`](tasker/NEXUS.prj.xml) | Tasker → long-press house icon → Import Project |

Step-by-step: **[docs/INSTALL.md](docs/INSTALL.md)** · API key: **[docs/API-SETUP.md](docs/API-SETUP.md)** · Problems: **[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** ·
Test list: **[docs/PHONE-CHECKLIST.md](docs/PHONE-CHECKLIST.md)** · Data setup: **[config/stocks.md](config/stocks.md)**

## Status
| Stage | What | Status |
|---|---|---|
| 1 | Design | ✅ Approved |
| 2 | Massive API: IWM daily bars, SPCX symbol | ✅ Verified with a real key (8 Nov 2026) |
| 2 | Tasker logic (IWM POC + 5 symbols) | ✅ 11 automated tests on real responses |
| 2 | KLWP preset + Tasker import on the phone | ⏳ **Not yet tested on the S22** |
| 3 | Expand to all 5 symbols | After IWM is confirmed on the phone |
| 4 | Final ZIP + 3 previews | After phone testing |

## For maintainers
```
python3 klwp/build_preset.py      # -> klwp/NEXUS.klwp, klwp/preset.json, klwp/preview.html
python3 tasker/build_tasker.py    # -> tasker/NEXUS.prj.xml (embeds tasker/nexus.js)
node tasker/make_sample.js        # -> klwp/sample_iwm.json (real IWM data for the preview)
node --test tasker/test/*.test.js # logic tests (real Massive response fixtures)
```
Fonts: Inter (SIL OFL 1.1, see `klwp/fonts/OFL.txt`). No API key is stored anywhere in this repository.
