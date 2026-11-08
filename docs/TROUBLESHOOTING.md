# NEXUS — Troubleshooting

The bottom-right of the chart shows the data status:

| It says | Meaning |
|---|---|
| **● Close of Fri 6 Nov** (green) | End-of-day prices for that session. This is normal |
| **● Stale · close of …** (orange) | No successful update for 36+ hours |
| **● Error · showing last data** (red) | The last update failed. Old prices are kept |
| **Not connected yet** | Tasker hasn't sent anything yet |

**The prices are end of day** (free plan). They don't change during the trading day.

To see the exact reason for an error: **Tasker → VARS → `%NexusMsg`**.

| Problem | Fix |
|---|---|
| KLWP won't load NEXUS.klwp | Send me a screenshot. |
| Weather shows `--` | KLWP → Settings → **Location**: allow. Wait a few minutes. |
| Rain % shows odd text | KLWP → Settings → **Weather provider**: try another. Tell me if it stays wrong. |
| Wrong 12/24-hour clock | KLWP → Settings → **Clock mode → Automatic**. Phone: Settings → General management → Date and time. |
| Tasker import says the plugin is missing | Open KLWP once, then import again. If it still fails, tell me. |
| `%NexusMsg` = **API key missing** | Add `%NexusKey` in Tasker VARS. |
| `%NexusMsg` mentions **API key problem** | The key is wrong. Copy it again from massive.com → Dashboard → API Keys. |
| `%NexusMsg` = **Rate limit reached** | You refreshed too often. Wait 1 minute and try again. |
| Nothing happens when you press ▶ | A refresh within 65 s of the last one is skipped (the limit). Wait a minute. |
| **Stale** in the morning | Samsung stopped Tasker overnight. Redo INSTALL Part A. |
| Only IWM has prices | Expected for the proof of concept. See INSTALL Part D. |
| Phone / Messages button wrong app | Set for Samsung's apps. KLWP editor → tap the button → **Touch** → choose your app. |
| Dashboard overlaps the dock | Hide Nova's dock, or tell me and I'll move things. |
