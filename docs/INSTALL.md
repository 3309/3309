# NEXUS — Install on your Galaxy S22

About 15 minutes. No programming. You need two files from this project:

| File | What it is |
|---|---|
| `NEXUS.klwp` | The wallpaper (clock, weather, stocks, chart, 3 buttons) |
| `NEXUS.prj.xml` | The Tasker project that fetches stock prices |

Download both to your phone. They'll end up in your **Downloads** folder.

---

## Part A — One-time phone settings (Samsung)

1. **Settings → Apps → Tasker → Battery → Unrestricted.**
2. **Settings → Apps → KLWP → Battery → Unrestricted.**
3. **Settings → Battery → Background usage limits → Never sleeping apps → +** → add **Tasker** and **KLWP**.

Samsung stops background apps aggressively. If you skip this, prices will stop updating after a while.

## Part B — Install the wallpaper (KLWP)

1. Open **KLWP**.
2. Tap the **menu** (☰, top left) → **Load preset** → tap the **import / folder icon** → pick **NEXUS.klwp** from Downloads.
3. Tap the **Save** icon (💾, top right).
4. If KLWP asks to set the live wallpaper, choose **Home screen**.
5. Weather: allow KLWP **Location** when asked. If it doesn't ask, go to KLWP **menu → Settings → Location**.
6. Clock: KLWP **menu → Settings → Clock mode → Automatic** (follows your phone's 12/24-hour setting).

You should now see the clock, the date, the 5-day weather and three buttons. The stock area says
"Waiting for stock data from Tasker". That's expected until Part C is done.

> If KLWP says the file is not valid, stop and send me a screenshot. I have a backup plan.

## Part C — Install the stock updater (Tasker)

1. Open **Tasker**. Make sure the switch at the top is **on**.
2. **Long-press the house icon** at the bottom-left → **Import Project** → pick **NEXUS.prj.xml**.
   A new **NEXUS** tab appears at the bottom.
3. Add your free API key from twelvedata.com:
   - Open the **VARS** tab → tap **+**.
   - Name: `%NexusKey` → tap ✓.
   - Tap the new **%NexusKey** row → paste your key as the value → ✓.
4. Open the **TASKS** tab → tap **NEXUS Refresh** → tap **▶ (play)** at the bottom.
   Wait about **1½ minutes**. There's a planned 61-second pause to stay within the free plan's limit.
5. Go to your home screen. The prices, the chart and the "Updated" time should now appear.

From then on it updates on its own, every 5 minutes while your screen is on.

> Your key stays inside Tasker on your phone. It isn't in the wallpaper file, the Tasker file, or this project.

## Part D — Nova Launcher

- Remove widgets and icons from the page where you want the dashboard.
- Optional: the wallpaper has its own **Phone / Messages / All apps** buttons, so you can hide Nova's dock:
  **Nova Settings → Dock → Dock (off)**.

## How it saves battery

- Stock checks only run while the **screen is on**. Nothing runs with the screen off.
- During US market hours (9:30–16:00 New York time, Mon–Fri): prices every 5 minutes, chart once an hour.
- Outside market hours: at most one check every 3 hours, to pick up closing prices.
- Free data plan use: about 425 of the 800 daily requests on a busy day.
