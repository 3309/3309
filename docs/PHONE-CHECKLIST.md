# NEXUS — Phone test checklist

Answer each line with yes or no. Send a screenshot for any **No**.

## Step 1 — IWM proof of concept
- [ ] KLWP loaded NEXUS.klwp without errors
- [ ] Tasker imported NEXUS.prj.xml without errors (project "NEXUS", task "NEXUS_Update_Market")
- [ ] After ▶: the IWM row shows a close, ▲/▼ change and %
- [ ] IWM close matches Google Finance for the date shown in "Close of …"
- [ ] The chart shows one orange line starting on the 0% line, with day labels under it
- [ ] Bottom right: green "● Close of …"; bottom left: "Updated …" with the time you ran it
- [ ] Airplane mode on → ▶ (wait 1 min since the last run): IWM keeps its numbers and the status turns red "Error"
- [ ] Airplane mode off → ▶ again: back to green

## Step 2 — Rest of the dashboard
- [ ] Time, day and full date correct; 12/24-hour follows the phone
- [ ] Weather: 5 days with date, icon, high, low; rain % shows numbers
- [ ] Phone, Messages and All apps buttons open the right thing
- [ ] Looks right on all 3 Nova pages

## Step 3 — All five stocks (after INSTALL Part D)
- [ ] 5 rows with closes; one checked against Google Finance
- [ ] 5 colored lines (orange, black, blue, purple, gold) matching the legend
- [ ] The next morning, "Updated" shows a time just after 00:15 New York (your local equivalent), with no manual run
- [ ] After a restart, everything comes back by itself
