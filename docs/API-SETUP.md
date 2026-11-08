# Massive API setup (free "Stocks Basic")

1. On your phone or computer, go to **massive.com** → **Sign up** (free).
2. Open your **Dashboard → API Keys** and copy the default key.
3. Keep it private. Don't paste it in chats, emails or GitHub.
4. Put it in **Tasker only**: Tasker → **VARS** tab → **+** → name `%NexusKey` → paste the key as the value.

## What the free plan gives you
| | Stocks Basic |
|---|---|
| Data timing | **End of day** (yesterday's close). Not real-time |
| History | 2 years |
| Speed limit | 5 requests per minute |

NEXUS makes **one request per symbol, once a day** (just after 00:15 New York time), spaced 13 s apart.
That's 5 requests in about a minute, within the limit. A manual refresh can't start within 65 s of the previous one.

## Where the key goes (and where it doesn't)
- It's stored only in Tasker's `%NexusKey` variable on your phone.
- Tasker sends it as a hidden request header (`Authorization: Bearer …`), never inside a web address.
- It's **not** in `NEXUS.klwp`, `NEXUS.prj.xml`, this repository, or anything sent to KLWP.
- Exporting the Tasker project doesn't include it (Tasker doesn't export global variable values).

## Verified on 8 Nov 2026 with a real key
- `IWM` daily bars: OK (status `DELAYED`, which is normal for the free plan).
- `SPCX`: active, *Space Exploration Technologies Corp. Class A Common Stock*, NASDAQ (XNAS), listed 2026-06-12. Daily bars OK.
