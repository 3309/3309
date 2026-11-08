# NEXUS — Install on your Galaxy S22 (IWM proof of concept)

About 15 minutes, no programming. You need two files: **NEXUS.klwp** (wallpaper) and
**NEXUS.prj.xml** (Tasker). Download both to your phone's **Downloads** folder.

## Part A — Samsung battery settings (once)
1. **Settings → Apps → Tasker → Battery → Unrestricted.**
2. **Settings → Apps → KLWP → Battery → Unrestricted.**
3. **Settings → Battery → Background usage limits → Never sleeping apps → +** → add **Tasker** and **KLWP**.

The update runs at night, so Samsung must not put Tasker to sleep.

## Part B — Wallpaper (KLWP)
1. Open **KLWP** → menu **☰** → **Load preset** → import/folder icon → pick **NEXUS.klwp**.
2. Tap **Save 💾** (top right). If asked, set it as the **Home screen** wallpaper.
3. Allow **Location** when asked (needed for weather). Otherwise: KLWP menu → Settings → Location.
4. KLWP menu → Settings → **Clock mode → Automatic** (follows your phone's 12/24-hour setting).

You should see the clock, the date, the weather, empty stock rows and three buttons.
The wallpaper is set up for **3 Nova pages** and stays the same on each page.

> If KLWP says the file isn't valid, stop and send me a screenshot.

## Part C — Stock updater (Tasker)
1. Open **Tasker**. The switch at the top must be **on**.
2. **Long-press the house icon** (bottom left) → **Import Project** → pick **NEXUS.prj.xml**.
3. Add your Massive key (see API-SETUP.md): **VARS** tab → **+** → `%NexusKey` → ✓ → tap it → paste the key → ✓.
4. **TASKS** tab → **NEXUS_Update_Market** → **▶**. Wait ~10 seconds (only IWM for now).
5. Look at your home screen: the IWM row shows a close price and change, and the chart has an orange line.
   The bottom right shows **● Close of** *(the last trading day)*.

**Check:** compare IWM's close with Google Finance for that same day. It should match to the cent.

## Part D — Turn on all five stocks (after IWM is confirmed)
Tasker → **VARS** → **+** → `%NexusSymbols` → value `IWM,SPY,QQQ,SOXL,SPCX` → run **NEXUS_Update_Market** again.
It takes about a minute (13-second pauses between the 5 requests, because of the free plan's limit).

## Optional — Manual refresh button on the home screen
Long-press an empty spot → **Widgets** → **Tasker** → **Task Shortcut** → drag it to a page → pick **NEXUS_Update_Market**.

## Part E — Nova
- Keep the dashboard area free of icons and widgets.
- The wallpaper has its own **Phone / Messages / All apps** buttons, so you can hide Nova's dock:
  Nova Settings → Dock → off.

## What runs in the background
Once an hour Tasker checks the time (no internet). The download happens **once a day after 00:15 New York time**:
5 small requests, then KLWP updates. Nothing else runs.
