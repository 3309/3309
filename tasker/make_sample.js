// Builds klwp/sample_iwm.json (what Tasker would send to KLWP) from the real
// IWM fixture, so the layout preview shows real data instead of invented numbers.
// Run: node tasker/make_sample.js
const fs = require("fs"), path = require("path");
const NX = require("./nexus.js");
const g = { NexusKey: "x", NexusSymbols: "IWM" };
const now = Date.parse("2026-11-07T05:20:00Z");     // Sat 00:20 New York
const env = { global: (n) => (n in g ? g[n] : "%" + n), setGlobal: (n, v) => { g[n] = v; }, now: () => now };
NX.plan(env, false);
NX.storeBars(env, "IWM", "200", fs.readFileSync(path.join(__dirname, "test/fixtures/iwm_daily.json"), "utf8"));
NX.finish(env);
const out = { source: "Massive daily bars for IWM, captured 2026-11-08 (real data)", nx_q: g.NexusQ, nx_chart: g.NexusChart, nx_meta: g.NexusMeta };
fs.writeFileSync(path.join(__dirname, "..", "klwp", "sample_iwm.json"), JSON.stringify(out, null, 2));
console.log(out);
