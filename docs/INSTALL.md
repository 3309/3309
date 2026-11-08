# NEXUS — Install on your Galaxy S22

About 15 minutes, no programming. You need two files: **NEXUS.klwp** (wallpaper) and
**NEXUS.prj.xml** (Tasker). Download both to your phone's **Downloads** folder.

If you installed an earlier NEXUS version, do **Part 0** first.

## Part 0 — Remove the old version (only if you installed one before)
1. Tasker → bottom bar → long-press the **NEXUS** project tab → **Delete** → choose to delete its profiles and tasks.
2. Tasker → **VARS** tab → delete every variable starting with `%Nexus` **except** `%NexusKey`.
   (If `%NexusKey` holds a Massive key and you're switching to Twelve Data, change its value to the Twelve Data key.)

## Part A — Samsung battery settings (once)
1. **Settings → Apps → Tasker → Battery → Unrestricted.**
2. **Settings → Apps → KLWP → Battery → Unrestricted.**
3. **Settings → Battery → Background usage limits → Never sleeping apps → +** → add **Tasker** and **KLWP**.

## Part B — Wallpaper (KLWP)
1. Open **KLWP** → menu **☰** → **Load preset** → import/folder icon → pick **NEXUS.klwp**.
2. Tap **Save 💾** (top right). If asked, set it as the **Home screen** wallpaper.
3. Allow **Location** when asked (for the weather). Otherwise: KLWP menu → Settings → Location.
4. KLWP menu → Settings → **Clock mode → Automatic**.

There's no title bar now: the clock is at the very top. The chart and the three buttons sit at the
bottom, kept clear of Samsung's navigation buttons.

## Part C — Stock updater (Tasker)
1. Open **Tasker**. The switch at the top must be **on**.
2. **Long-press the house icon** (bottom left) → **Import Project** → pick **NEXUS.prj.xml**.
3. **VARS** tab → **+** → `%NexusKey` → ✓ → tap it → paste your **Twelve Data** key → ✓.
   (Read the licensing note in DATA-PROVIDER.md first: the free plan is for testing only.)
4. **TASKS** tab → **NEXUS_Update_Market** → **▶**. Wait about **1½ minutes**.
   There's a planned 61-second pause between the prices and the 5-day history, because of the free plan's per-minute limit.
5. Home screen: 5 prices with changes, 5 colored lines, and "Updated … · Twelve Data".

From then on, while the screen is on, it refreshes about every 30 minutes during US market hours.

### Optional — use Massive (end of day) instead
VARS → **+** → `%NexusProvider` → value `massive`. Put your Massive key in `%NexusKey`.

### Optional — refresh button on a home screen
Long-press an empty spot → **Widgets** → **Tasker** → **Task Shortcut** → place it → pick **NEXUS_Update_Market**.

## Part D — Nova
- Keep the dashboard pages free of icons and widgets. Nova's dock can be hidden (Nova Settings → Dock → off),
  since the wallpaper has its own Phone / Messages / All apps buttons.
- If you use **gesture navigation** (Settings → Display → Navigation bar → Swipe gestures), there's extra space under the buttons. That's expected.
