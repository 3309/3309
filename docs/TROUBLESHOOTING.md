# NEXUS — Troubleshooting

Check the bottom-right corner of the chart first:

| It says | Meaning |
|---|---|
| **● Live** (green) | Market open, prices are fresh |
| **Market closed** (grey) | Showing the latest closing prices |
| **● Stale** (orange) | Market open, but no update for 20+ minutes |
| **● Offline · last data** (red) | The last update failed. Old prices are kept |
| **Not connected yet** | Tasker hasn't sent anything yet |

To see the exact reason for an error: **Tasker → VARS tab → `%NexusMsg`**.

## Problems and fixes

| Problem | Fix |
|---|---|
| KLWP won't load NEXUS.klwp | Send me a screenshot of the error. |
| Weather shows `--` or is empty | KLWP → menu → Settings → **Location** (allow it). Then wait a few minutes, or pull down in the KLWP editor to refresh. |
| Rain % shows strange text | Your weather provider may not supply rain chance. KLWP → Settings → **Weather provider**: try another. Tell me if it stays wrong. |
| Clock shows 24-hour when you want 12-hour (or the reverse) | KLWP → Settings → **Clock mode → Automatic**, and set the phone: Settings → General management → Date and time → **Use 24-hour format**. |
| "Waiting for stock data from Tasker" | Tasker: is the top switch **on**? Run **NEXUS Refresh** with ▶ and wait 1½ minutes. |
| `%NexusMsg` = **API key missing** | Add `%NexusKey` in Tasker VARS (see INSTALL Part C step 3). |
| `%NexusMsg` = **API key rejected** | The key is mistyped. Copy it again from twelvedata.com → your account → API keys. |
| `%NexusMsg` = **Rate limit reached** | You ran it many times in a row. Wait 1–2 minutes; it recovers on its own. |
| **Stale** during market hours | Samsung put Tasker to sleep. Redo INSTALL Part A (Unrestricted + Never sleeping apps). |
| Prices update, chart doesn't | The chart updates once an hour. Check `%NexusMsg`. |
| Phone or Messages button opens nothing | These buttons are set to the Samsung Phone and Samsung Messages apps. If you use Google's apps instead: KLWP editor → tap the button item → **Touch** → change the app. |
| All apps button does nothing | It uses Nova's "App drawer" action. Make sure Nova is your default launcher. |
| Dashboard is cut off or overlaps Nova's dock | Hide Nova's dock (INSTALL Part D) or tell me and I'll shift the layout. |

## Reset everything

Tasker → VARS → delete all variables starting with `%Nexus` **except** `%NexusKey` → run **NEXUS Refresh**.
