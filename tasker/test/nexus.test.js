// Run: node --test tasker/test/*.test.js
// Fixtures are real API responses captured on 2026-11-08 (no key inside):
//   td_quote_aapl.json, td_daily_aapl.json  Twelve Data with the public "demo" key
//        (the demo key only serves AAPL; tests relabel them as IWM/SPY/... to
//         exercise the code paths. Relabelled values are never shown anywhere.)
//   td_err_badkey.json, td_err_demo_batch.json  real Twelve Data error bodies
//   massive_iwm_daily.json, massive_mags_daily.json, massive_mags_overview.json
//   massive_err_*.json                      real Massive responses/errors
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const NX = require("../nexus.js");

const fx = (f) => fs.readFileSync(path.join(__dirname, "fixtures", f), "utf8");
const SYMS = ["IWM", "SPY", "QQQ", "GLD", "MAGS"];
const KEY = "SECRET-KEY-123";
const MINUS = "−";
const ET = (s) => Date.parse(s);       // helper: ISO string with explicit offset

function env(globals = {}, nowMs = ET("2026-11-09T10:05:00-05:00")) {   // Mon 10:05 New York
  const g = { NexusKey: KEY, ...globals };
  const e = { g, t: nowMs, global: (n) => (n in g ? g[n] : "%" + n), setGlobal: (n, v) => { g[n] = v; }, now: () => e.t };
  return e;
}
function tdQuote(sym, k = 1, open = true) {
  const j = JSON.parse(fx("td_quote_aapl.json"));
  return JSON.stringify({ ...j, symbol: sym, close: String(j.close * k), change: String(j.change * k),
    previous_close: String(j.previous_close * k), is_market_open: open });
}
function tdDaily(sym, k = 1) {
  const j = JSON.parse(fx("td_daily_aapl.json"));
  j.meta.symbol = sym; j.values.forEach((v) => { v.close = String(v.close * k); });
  return JSON.stringify(j);
}
// Imitates the Tasker actions between plan and finish: one HTTP request per slot,
// saved as "code~~NX~~body" in %NexusRaw<k>.
function runTasker(e, r, respond) {
  r.slots.forEach((s, i) => {
    const [code, body] = respond(s) || ["0", "x"];
    e.g["NexusRaw" + (i + 1)] = code + NX.SEP + body;
  });
  return NX.finish(e);
}
const okAll = (s) => s.kind === "quote" ? ["200", tdQuote(s.sym, 1 + SYMS.indexOf(s.sym) / 10)]
  : s.kind === "series" ? ["200", tdDaily(s.sym, 1 + SYMS.indexOf(s.sym) / 10)] : null;

const OLD = new RegExp(["SO" + "XL", "SP" + "CX"].join("|"), "i");   // removed symbols (spelt split on purpose)
test("symbols are exactly IWM, SPY, QQQ, GLD, MAGS (old ones gone)", () => {
  assert.deepEqual(NX.SYMBOLS, SYMS);
  for (const f of ["nexus.js", "NEXUS.prj.xml", "build_tasker.py"]) {
    const t = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    assert.doesNotMatch(t, OLD, f);
  }
  assert.deepEqual(SYMS.map(NX.varName), ["Nexus_iwm", "Nexus_spy", "Nexus_qqq", "Nexus_gld", "Nexus_mags"]);
});

test("GLD and MAGS exist (real Massive ticker overview for MAGS)", () => {
  const r = JSON.parse(fx("massive_mags_overview.json")).results;
  assert.equal(r.ticker, "MAGS"); assert.equal(r.active, true); assert.equal(r.currency_name, "usd");
});

test("Twelve Data first run: 5 quotes, pause 61 s, 5 history = 10 credits, max 5 per minute", () => {
  const e = env();
  const r = NX.plan(e, false);
  assert.equal(r.provider, "twelvedata"); assert.equal(r.authPrefix, "apikey");
  assert.deepEqual(r.slots.map((s) => s.kind + ":" + s.sym), [
    ...SYMS.map((s) => "quote:" + s), ...SYMS.map((s) => "series:" + s)]);
  assert.equal(NX.credits(r), 10);
  assert.deepEqual(r.slots.map((s) => s.wait), [0, 0, 0, 0, 0, 61, 0, 0, 0, 0]);
  assert.equal(r.slots[0].url, "https://api.twelvedata.com/quote?symbol=IWM");
  assert.equal(r.slots[5].url, "https://api.twelvedata.com/time_series?symbol=IWM&interval=1day&outputsize=6&order=asc");
  for (const s of r.slots) assert.doesNotMatch(s.url, /apikey|SECRET/i);
});

test("schedule: quotes every 30 min in market hours, once after the close, nothing at weekends", () => {
  const base = { Nexus_iwm: "1;+1;+1%;1;2026-11-09", NexusHistDay: "2026-11-09", NexusBars_IWM: "2026-11-06:1" };
  const at = (iso, last) => NX.plan(env({ ...base, NexusTs: String(ET(last) / 1000) }, ET(iso)), false);
  assert.equal(at("2026-11-09T10:35:00-05:00", "2026-11-09T10:05:00-05:00").slots.length, 5);  // 30 min
  assert.equal(at("2026-11-09T10:25:00-05:00", "2026-11-09T10:05:00-05:00").go, false);        // 20 min
  assert.equal(at("2026-11-09T16:40:00-05:00", "2026-11-09T15:50:00-05:00").slots.length, 5);  // close
  assert.equal(at("2026-11-09T18:00:00-05:00", "2026-11-09T16:40:00-05:00").go, false);        // done
  assert.equal(at("2026-11-10T08:00:00-05:00", "2026-11-09T16:40:00-05:00").go, false);        // pre-market
  assert.equal(at("2026-11-14T12:00:00-05:00", "2026-11-13T16:40:00-05:00").go, false);        // Saturday
  // Friday evening phone first used Monday 08:00: pick up Friday's close once
  assert.equal(at("2026-11-16T08:00:00-05:00", "2026-11-13T15:30:00-05:00").slots.length, 5);
});

test("history (daily closes) is downloaded once per trading day only", () => {
  const e = env();
  let r = NX.plan(e, false); runTasker(e, r, okAll);
  assert.equal(e.g.NexusHistDay, "2026-11-09");
  e.t = ET("2026-11-09T10:40:00-05:00");
  r = NX.plan(e, false);
  assert.deepEqual([...new Set(r.slots.map((s) => s.kind))], ["quote"]);
  e.t = ET("2026-11-10T09:45:00-05:00");
  r = NX.plan(e, false);
  assert.equal(r.slots.filter((s) => s.kind === "series").length, 5);
});

test("credit budget: a full trading day with the screen always on stays far below 800", () => {
  const e = env({}, ET("2026-11-09T06:00:00-05:00"));
  let credits = 0; const stamps = [];
  for (let t = ET("2026-11-09T06:00:00-05:00"); t < ET("2026-11-10T06:00:00-05:00"); t += 10 * 60 * 1000) {
    e.t = t;
    const r = NX.plan(e, false);
    if (!r.go) continue;
    let clock = t;
    r.slots.forEach((s) => { clock += s.wait * 1000; stamps.push(clock); });
    credits += NX.credits(r);
    runTasker(e, r, okAll);
  }
  // first check 06:00 (no data yet: 10), 9:30-16:10 every 30 min (14 x 5), after close (5)
  assert.ok(credits <= 100, "credits per day " + credits);
  for (const t0 of stamps) assert.ok(stamps.filter((t) => t >= t0 && t < t0 + 60000).length <= 8, "per-minute limit");
  console.log("# simulated credits for one trading day:", credits);
});

test("rate guard: no second API run within 65 s, even manual", () => {
  const e = env();
  assert.equal(NX.plan(e, true).go, true);
  const r = NX.plan(e, true);
  assert.equal(r.go, false); assert.match(r.reason, /too soon/);
});

test("Twelve Data: rows, daily change and a 5-line chart on one common scale", () => {
  const e = env();
  const r = NX.plan(e, false); runTasker(e, r, okAll);
  // real AAPL quote relabelled as IWM: close 342.37, change -1.80002, pct -0.52300266
  assert.equal(e.g.Nexus_iwm, `342.37;${MINUS}1.80;${MINUS}0.52%;-1;2026-11-06`);
  for (const s of SYMS) assert.match(e.g[NX.varName(s)], /^[\d.]+;[+−]?[\d.]+;[+−]?[\d.]+%;-?[01];\d{4}-\d\d-\d\d$/);
  const paths = e.g.NexusChart.split("|");
  assert.equal(paths.length, 6);
  const meta = e.g.NexusMeta.split("|");
  assert.equal(meta.length, 14);
  assert.equal(meta[13], "Twelve Data");
  const zy = meta[5];
  for (const p of paths.slice(0, 5)) {
    assert.match(p, /^M 10,[\d.]+ L 30,[\d.]+ L 50,[\d.]+ L 70,[\d.]+ L 90,[\d.]+$/);
    assert.equal(p.split(" ")[1].split(",")[1], zy, "every line starts at 0% of the common scale");
  }
  // all five relabelled series have the same % shape -> identical paths prove the common scale
  const pts = paths.slice(0, 5).map((p) => p.match(/[\d.]+/g).map(Number));
  for (const p of pts) p.forEach((v, i) => assert.ok(Math.abs(v - pts[0][i]) <= 0.15, "same scale"));
  assert.deepEqual(meta.slice(6, 11), ["Mon", "Tue", "Wed", "Thu", "Fri"]);
  assert.equal(meta[12], "Fri 6 Nov");
  assert.equal(meta[1], "OPEN");
});

test("today's quote becomes the newest chart point once a new session starts", () => {
  const bars = [["2026-11-03", 100], ["2026-11-04", 101], ["2026-11-05", 102], ["2026-11-06", 103]].map(([d, c]) => ({ d, c }));
  assert.deepEqual(NX.sessions(bars, { d: "2026-11-09", p: 110 }).map((b) => b.d).slice(-2), ["2026-11-06", "2026-11-09"]);
  assert.equal(NX.sessions(bars, { d: "2026-11-06", p: 104 }).slice(-1)[0].c, 104);
  const s = { IWM: [{ d: "a", c: 100 }, { d: "b", c: 110 }], SPY: [{ d: "a", c: 50 }, { d: "b", c: 45 }] };
  const c = NX.buildChart(s);
  assert.equal(c.meta[0], "+12.5%"); assert.equal(c.meta[1], MINUS + "12.5%");
  assert.equal(c.paths[0], "M 10,50 L 90,11.6"); assert.equal(c.paths[1], "M 10,50 L 90,88.4");
  assert.equal(c.paths[2], "M 0,0");                          // no data -> nothing drawn, never invented
});

test("failures keep the last good prices and chart, and say why", () => {
  const e = env();
  let r = NX.plan(e, true); runTasker(e, r, okAll);
  const keep = { iwm: e.g.Nexus_iwm, chart: e.g.NexusChart, ts: e.g.NexusTs };
  for (const [resp, msg] of [[() => null, /offline/], [() => ["200", "<html>"], /Bad response/],
      [() => ["401", fx("td_err_badkey.json")], /API key problem/],
      [() => ["429", '{"code":429,"message":"You have run out of API credits","status":"error"}'], /Rate limit/],
      [(s) => ["200", tdQuote("XXX")], /Wrong symbol/]]) {
    e.g.NexusLastRun = "0";
    r = NX.plan(e, true);
    assert.equal(runTasker(e, r, resp), false);
    assert.equal(e.g.Nexus_iwm, keep.iwm); assert.equal(e.g.NexusChart, keep.chart); assert.equal(e.g.NexusTs, keep.ts);
    assert.equal(e.g.NexusState, "ERROR"); assert.match(e.g.NexusMsg, msg);
  }
});

test("one symbol failing keeps its old value; the rest update", () => {
  const e = env();
  let r = NX.plan(e, true); runTasker(e, r, okAll);
  const oldMags = e.g.Nexus_mags;
  e.g.NexusLastRun = "0"; r = NX.plan(e, true);
  runTasker(e, r, (s) => s.sym === "MAGS" ? ["500", "{}"] : okAll(s));
  assert.equal(e.g.Nexus_mags, oldMags);
  assert.match(e.g.NexusMsg, /Partly updated: MAGS: HTTP 500/);
  assert.notEqual(e.g.NexusState, "ERROR");
});

test("missing key: no requests, clear message", () => {
  const e = env(); delete e.g.NexusKey;
  const r = NX.plan(e, true);
  assert.equal(r.go, false); assert.match(e.g.NexusMeta, /API key missing/);
});

test("Massive provider (end of day) still works with real IWM and MAGS data", () => {
  const e = env({ NexusProvider: "massive" }, ET("2026-11-07T00:20:00-05:00"));
  const r = NX.plan(e, false);
  assert.equal(r.authPrefix, "Bearer");
  assert.deepEqual(r.slots.map((s) => s.wait), [0, 13, 13, 13, 13]);
  runTasker(e, r, (s) => s.sym === "IWM" ? ["200", fx("massive_iwm_daily.json")]
    : s.sym === "MAGS" ? ["200", fx("massive_mags_daily.json")] : ["401", fx("massive_err_badkey.json")]);
  assert.equal(e.g.Nexus_iwm, "273.67;+2.69;+0.99%;1;2026-11-06");
  assert.match(e.g.Nexus_mags, /^67\.53;\+0\.68;\+1\.02%;1;2026-11-06$/);
  assert.equal(e.g.NexusState, "EOD");
  assert.match(e.g.NexusMsg, /SPY: API key problem/);
});

test("Tasker project: embedded scripts run end-to-end, key stays in the header", () => {
  const xml = fs.readFileSync(path.join(__dirname, "..", "NEXUS.prj.xml"), "utf8");
  assert.doesNotMatch(xml, /apikey=/i);
  assert.match(xml, /Authorization:%nx_ak %NexusKey/);
  assert.match(xml, /<nme>NEXUS_Update_Market<\/nme>/);
  for (const v of ["iwm", "spy", "qqq", "gld", "mags", "nx_chart", "nx_meta"])
    assert.match(xml, new RegExp(`<org.kustom.tasker.VAR_NAME>${v}</org.kustom.tasker.VAR_NAME>`));
  const unesc = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const scripts = [...xml.matchAll(/<code>129<\/code>[\s\S]*?<Str sr="arg0" ve="3">([\s\S]*?)<\/Str>/g)].map((m) => unesc(m[1]));
  assert.equal(scripts.length, 2);
  const NOW = ET("2026-11-09T10:05:00-05:00");
  const G = { NexusKey: KEY }, L = { caller1: "profile=enter:NEXUS check" };
  const D = class extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } };
  const run = (code) => { const c = vm.createContext({ global: (n) => G[n], setGlobal: (n, v) => { G[n] = v; },
    local: (n) => L[n], Intl, Date: D, JSON, Math, String, Number, Object, isFinite, parseFloat, parseInt });
    vm.runInContext(code, c); return c; };
  const p = run(scripts[0]);
  assert.equal(p.nx_go, "1"); assert.equal(p.nx_ak, "apikey");
  assert.equal(p.nx_d10, "1"); assert.equal(p.nx_p6, "1"); assert.equal(p.nx_w6, "61");
  for (let k = 1; k <= 10; k++) {
    const s = { kind: k <= 5 ? "quote" : "series", sym: SYMS[(k - 1) % 5] };
    assert.match(p["nx_u" + k], new RegExp(s.sym + "(&|$)"));
    const [code, body] = okAll(s);
    G["NexusRaw" + k] = code + "~~NX~~" + body;            // what the "Save response" Variable Set stores
  }
  run(scripts[1]);
  assert.equal(G.Nexus_iwm.split(";")[0], "342.37");
  for (const v of Object.keys(G).filter((n) => n !== "NexusKey")) assert.ok(!String(G[v]).includes("SECRET"), v);
});
