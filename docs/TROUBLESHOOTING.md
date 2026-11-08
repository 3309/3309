# NEXUS — Troubleshooting

The bottom-right of the chart shows the data status:

| It says | Meaning |
|---|---|
| **● Market open** (green) | Prices from the last 30-minute refresh |
| **Market closed · Fri 6 Nov** (grey) | Latest prices are that session's close |
| **● Close of Fri 6 Nov** (green) | End-of-day data (Massive option) |
| **● Stale data** (orange) | No good update for too long (45 min while the market is open) |
| **● Error · last data kept** (red) | The last update failed. The old prices are still shown |
| **Not connected yet** | Tasker hasn't sent anything yet |

The exact reason for an error: **Tasker → VARS → `%NexusMsg`**.

| Problem | Fix |
|---|---|
| KLWP won't load NEXUS.klwp | Send me a screenshot. |
| Buttons still touch the navigation bar | Send a screenshot. The space (`SAFE` in `klwp/build_preset.py`) can be increased. |
| Clock touches the status bar at the top | Send a screenshot. |
| Weather shows `--` | KLWP → Settings → **Location**: allow. Wait a few minutes. |
| Rain % shows odd text | KLWP → Settings → **Weather provider**: try another. |
| Wrong 12/24-hour clock | KLWP → Settings → **Clock mode → Automatic**. |
| Tasker import says the plugin is missing | Open KLWP once, then import again. |
| `%NexusMsg`: **API key missing** | Add `%NexusKey` in Tasker VARS. |
| `%NexusMsg`: **API key problem** | Wrong key, or a key from the other provider. Copy it again. |
| `%NexusMsg`: **Rate limit reached** | Too many refreshes. Wait 1 minute. |
| ▶ does nothing | A refresh within 65 s of the last one is skipped. Wait a minute. |
| Prices don't update during the day | Samsung put Tasker to sleep. Redo INSTALL Part A. Updates only run while the screen is on. |
| One stock shows old numbers | `%NexusMsg` says "Partly updated: …". The others still update. |
| Phone / Messages button opens the wrong app | KLWP editor → tap the button → **Touch** → choose your app. |
