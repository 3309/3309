// Builds klwp/samples/*.json: exactly what Tasker would send to KLWP, produced by
// the real nexus.js logic from REAL API responses (tasker/test/fixtures), so the
// previews never show invented prices.
//   1-real-data  Massive end-of-day bars for IWM SPY QQQ GLD MAGS, close of Fri 6 Nov 2026
//   2-error      the same data after a failed update (all requests fail -> data kept, ERROR)
//   3-first-run  nothing received yet
// Run: TZ=America/New_York node tasker/make_sample.js
const fs = require("fs"), path = require("path");
const NX = require("./nexus.js");
const fx = (f) => fs.readFileSync(path.join(__dirname, "test", "fixtures", f), "utf8");
const out = path.join(__dirname, "..", "klwp", "samples");
fs.mkdirSync(out, { recursive: true });

const g = { NexusKey: "placeholder", NexusProvider: "massive" };
let now = Date.parse("2026-11-07T00:20:00-05:00");            // Sat 00:20 New York
const env = { global: (n) => (n in g ? g[n] : "%" + n), setGlobal: (n, v) => { g[n] = v; }, now: () => now };
function run(respond) {
  const r = NX.plan(env, true);
  r.slots.forEach((s, i) => { const [c, b] = respond(s); g["NexusRaw" + (i + 1)] = c + NX.SEP + b; });
  NX.finish(env);
}
const snapshot = (note) => {
  const o = { note };
  NX.SYMBOLS.forEach((s) => { o[s.toLowerCase()] = g[NX.varName(s)] || ""; });
  Object.assign(o, { nx_chart: g.NexusChart || "", nx_meta: g.NexusMeta || "" });
  return o;
};

run((s) => ["200", fx(`massive_${s.sym.toLowerCase()}_daily.json`)]);
fs.writeFileSync(path.join(out, "1-real-data.json"), JSON.stringify(snapshot(
  "Real Massive end-of-day responses captured 2026-11-08; processed by tasker/nexus.js"), null, 2));

now += 5 * 60 * 1000;
run(() => ["0", "x"]);                                          // offline: every request fails
fs.writeFileSync(path.join(out, "2-error.json"), JSON.stringify(snapshot(
  "Same data after a failed update: values kept, state ERROR"), null, 2));

fs.writeFileSync(path.join(out, "3-first-run.json"), JSON.stringify({ note: "Nothing received from Tasker yet" }, null, 2));
console.log(JSON.stringify(snapshot(""), null, 1));
