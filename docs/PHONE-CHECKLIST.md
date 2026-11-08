# NEXUS — Phone test checklist

Answer yes or no for each line. Send a screenshot for any **No**.

## Layout
- [ ] No title bar: the clock is the first thing at the top, not covered by the status bar
- [ ] Phone, Messages and All apps buttons are fully **above** the navigation buttons (three-button mode)
- [ ] Same check with gesture navigation (Settings → Display → Navigation bar → Swipe gestures)
- [ ] Each button opens the right thing with one tap
- [ ] Looks right on all 3 Nova pages

## Clock and weather
- [ ] Time, day and full date correct; 12/24-hour follows the phone
- [ ] 5 weather days with date, icon, high, low; rain % shows numbers

## Stocks (after ▶ on NEXUS_Update_Market and ~1½ minutes)
- [ ] Rows in this order: IWM, SPY, QQQ, GLD, MAGS (and no other symbols)
- [ ] Each row has a price, ▲/▼ $ change and %; green for up, red for down
- [ ] One price checked against Google Finance (Twelve Data prices may differ slightly from other sources)
- [ ] Chart: 5 lines in the legend colors (orange, black, blue, gold, purple), all starting at 0%
- [ ] Footer: "Updated <time> · Twelve Data" and a green status

## Failure handling
- [ ] Airplane mode on → wait 1 min → ▶: prices stay, status turns red "Error · last data kept"
- [ ] Airplane mode off → wait 1 min → ▶: back to normal
- [ ] During market hours, with normal phone use, "Updated" moves on about every 30 minutes
