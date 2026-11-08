// Run: node --test tasker/test/*.test.js
// Fixtures are real Massive responses captured on 2026-11-08:
//   iwm_daily.json, spcx_daily.json  daily bars 2026-10-26 .. 2026-11-06 (status "DELAYED")
//   spcx_overview.json               ticker overview (symbol verification)
//   err_nokey.json, err_badkey.json  real error bodies
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const NX = require("../nexus.js");

const fx = (f) => fs.readFileSync(path.join(__dirname, "fixtures", f), "utf8");
const IWM = fx("iwm_daily.json");
const MINUS = "−";
// Sat 2026-11-07 00:20 New York (05:20 UTC; EST)
const SAT_0020 = Date.parse("2026-11-07T05:20:00Z");

function env(globals = {}, nowMs = SAT_0020) {
  const g = { NexusKey: "SECRET-KEY-123", ...globals };
  return { g, global: (n) => (n in g ? g[n] : "%" + n), setGlobal: (n, v) => { g[n] = v; }, now: () => nowMs };
}
// other symbols built from the real IWM response, relabelled and scaled
function relabel(sym, k) {
  const j = JSON.parse(IWM);
  j.ticker = sym;
  j.results.forEach((r) => { r.c = +(r.c * k).toFixed(2); });
  return JSON.stringify(j);
}

test("SPCX exists on Massive (real ticker overview)", () => {
  const r = JSON.parse(fx("spcx_overview.json")).results;
  assert.equal(r.ticker, "SPCX"); assert.equal(r.active, true);
  assert.equal(r.market, "stocks"); assert.equal(r.currency_name, "usd");
});

test("real IWM response: status DELAYED accepted, bars dated in New York time", () => {
  const p = NX.parseBars("200", IWM);
  assert.equal(p.error, undefined);
  assert.equal(p.ticker, "IWM");
  assert.deepEqual(p.bars.map((b) => b.d),
    ["2026-10-30", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]);
  assert.equal(p.bars[5].c, 273.67);
});

test("IWM proof of concept: close, daily $ and % change, chart, labels", () => {
  const e = env({ NexusSymbols: "IWM" });
  const r = NX.plan(e, false);
  assert.equal(r.go, true);
  assert.deepEqual(r.syms, ["IWM"]);
  assert.equal(r.urls[0], "https://api.massive.com/v2/aggs/ticker/IWM/range/1/day/2026-10-24/2026-11-07?adjusted=true&sort=asc&limit=50");
  assert.equal(NX.storeBars(e, "IWM", "200", IWM), true);
  assert.equal(NX.finish(e), true);
  const rows = e.g.NexusQ.split("|");
  assert.equal(rows.length, 5);
  // 2026-11-06 close 273.67, previous 270.98 -> +2.69 (+0.99%)
  assert.equal(rows[0], "IWM;273.67;+2.69;+0.99%;1");
  assert.equal(rows[1], "SPY;--.--;--.--;--.--%;0");       // not fetched yet in the POC
  const paths = e.g.NexusChart.split("|");
  assert.equal(paths.length, 6);
  // last 5 sessions Nov 2..6: 279.14, 279.79, 284.02, 270.98, 273.67 -> starts at 0%
  assert.match(paths[0], /^M 10,[\d.]+ L 30,[\d.]+ L 50,[\d.]+ L 70,[\d.]+ L 90,[\d.]+$/);
  for (const p of paths.slice(1, 5)) assert.equal(p, "M 0,0");
  const meta = e.g.NexusMeta.split("|");
  assert.equal(meta.length, 13);
  assert.equal(meta[1], "EOD");
  assert.deepEqual(meta.slice(6, 11), ["Mon", "Tue", "Wed", "Thu", "Fri"]);
  assert.equal(meta[12], "Fri 6 Nov");
  // y of the first point equals the zero line; Nov 5 (-2.92%) is the lowest point
  const zy = Number(meta[5]);
  assert.equal(Number(paths[0].split(" ")[1].split(",")[1]), zy);
  assert.equal(meta[3], "+2%"); assert.equal(meta[4], MINUS + "5%");
  assert.equal(e.g.NexusDay, "2026-11-07");
});

test("schedule: once per New York day after 00:15, any phone time zone", () => {
  assert.equal(NX.plan(env({}, Date.parse("2026-11-07T05:10:00Z")), false).go, false);   // 00:10 ET
  assert.equal(NX.plan(env({}, Date.parse("2026-11-07T05:20:00Z")), false).go, true);    // 00:20 ET
  assert.equal(NX.plan(env({ NexusDay: "2026-11-07" }), false).go, false);               // already done
  assert.equal(NX.plan(env({ NexusDay: "2026-11-07" }), true).go, true);                 // manual refresh
  // summer time (EDT): 04:20 UTC = 00:20 ET
  assert.equal(NX.plan(env({}, Date.parse("2026-07-01T04:20:00Z")), false).go, true);
});

test("rate limit: no second batch within 65 s, even manually", () => {
  const e = env();
  assert.equal(NX.plan(e, true).go, true);
  const r = NX.plan(e, true);
  assert.equal(r.go, false); assert.match(r.reason, /too soon/);
});

test("missing key: nothing fetched, clear message", () => {
  const e = env(); delete e.g.NexusKey;
  const r = NX.plan(e, true);
  assert.equal(r.go, false); assert.equal(r.reason, "no key");
  assert.match(e.g.NexusMeta, /API key missing/);
});

test("errors keep the last good data and mark ERROR", () => {
  const e = env({ NexusSymbols: "IWM" });
  NX.plan(e, true); NX.storeBars(e, "IWM", "200", IWM); NX.finish(e);
  const good = { q: e.g.NexusQ, c: e.g.NexusChart, ts: e.g.NexusTs };
  for (const [code, body, msg] of [["", "", /offline/], ["200", "<html>", /Bad response/],
      ["401", fx("err_badkey.json"), /API key problem/], ["401", fx("err_nokey.json"), /API key problem/],
      ["429", '{"status":"ERROR","error":"You\'ve exceeded the maximum requests per minute"}', /Rate limit/]]) {
    e.g.NexusLastBatch = "0";
    NX.plan(e, true);
    assert.equal(NX.storeBars(e, "IWM", code, body), false);
    assert.equal(NX.finish(e), false);
    assert.equal(e.g.NexusQ, good.q); assert.equal(e.g.NexusChart, good.c); assert.equal(e.g.NexusTs, good.ts);
    assert.equal(e.g.NexusState, "ERROR");
    assert.match(e.g.NexusMsg, msg);
  }
  assert.ok(!e.g.NexusMeta.includes("SECRET"));
});

test("a response for the wrong ticker is rejected", () => {
  const e = env();
  assert.equal(NX.storeBars(e, "SPY", "200", IWM), false);
  assert.match(e.g.NexusErrs, /Wrong ticker/);
});

test("all five symbols (real IWM + real SPCX + relabelled copies)", () => {
  const e = env({ NexusSymbols: "IWM,SPY,QQQ,SOXL,SPCX" });
  const r = NX.plan(e, false);
  assert.equal(r.urls.length, 5);
  NX.storeBars(e, "IWM", "200", IWM);
  NX.storeBars(e, "SPY", "200", relabel("SPY", 2.4));
  NX.storeBars(e, "QQQ", "200", relabel("QQQ", 2.2));
  NX.storeBars(e, "SOXL", "200", relabel("SOXL", 0.2));
  NX.storeBars(e, "SPCX", "200", fx("spcx_daily.json"));
  assert.equal(NX.finish(e), true);
  const rows = e.g.NexusQ.split("|");
  // SPCX real: 2026-11-06 134.27, previous 123.62 -> +10.65 (+8.62%)
  assert.equal(rows[4], "SPCX;134.27;+10.65;+8.62%;1");
  const paths = e.g.NexusChart.split("|");
  assert.ok(paths.slice(0, 5).every((p) => p.startsWith("M 10,")));
  const nums = e.g.NexusChart.match(/[\d.]+/g).map(Number);
  assert.ok(nums.every((v) => v >= 0 && v <= 100));
  assert.equal(e.g.NexusMsg, "");
});

test("one symbol failing keeps its previous bars; others update", () => {
  const e = env({ NexusSymbols: "IWM,SPCX" });
  NX.plan(e, true); NX.storeBars(e, "IWM", "200", IWM); NX.storeBars(e, "SPCX", "200", fx("spcx_daily.json")); NX.finish(e);
  const spcxRow = e.g.NexusQ.split("|")[4];
  e.g.NexusLastBatch = "0"; NX.plan(e, true);
  NX.storeBars(e, "IWM", "200", relabel("IWM", 1.01));
  NX.storeBars(e, "SPCX", "", "");
  assert.equal(NX.finish(e), true);
  assert.equal(e.g.NexusQ.split("|")[4], spcxRow);
  assert.match(e.g.NexusMsg, /Partly updated: SPCX/);
});

test("Tasker project: the embedded JavaScriptlets run end-to-end", () => {
  const xml = fs.readFileSync(path.join(__dirname, "..", "NEXUS.prj.xml"), "utf8");
  assert.ok(!/apikey=/i.test(xml), "key never in a URL");
  assert.match(xml, /Authorization:Bearer %NexusKey/);
  assert.match(xml, /<nme>NEXUS_Update_Market<\/nme>/);
  const unesc = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const scripts = [...xml.matchAll(/<code>129<\/code>[\s\S]*?<Str sr="arg0" ve="3">([\s\S]*?)<\/Str>/g)].map((m) => unesc(m[1]));
  assert.equal(scripts.length, 7);   // plan, 5 x store, finish
  const G = { NexusKey: "SECRET-KEY-123" }, L = { caller1: "profile=enter:NEXUS Daily" };
  const Date2 = class extends Date { constructor(...a) { super(...(a.length ? a : [SAT_0020])); } static now() { return SAT_0020; } };
  const run = (code) => { const c = vm.createContext({ global: (n) => G[n], setGlobal: (n, v) => { G[n] = v; },
    local: (n) => L[n], Intl, Date: Date2, JSON, Math, String, Number, Object, isFinite, parseFloat, parseInt });
    vm.runInContext(code, c); return c; };
  const p = run(scripts[0]);
  assert.equal(p.nx_go, "1"); assert.equal(p.nx_d1, "1"); assert.equal(p.nx_d2, "0");   // POC: IWM only
  assert.equal(p.nx_s1, "IWM");
  Object.assign(L, { nx_s1: p.nx_s1, http_response_code: "200", http_data: IWM });
  run(scripts[1]);
  run(scripts[6]);
  assert.equal(G.NexusQ.split("|")[0], "IWM;273.67;+2.69;+0.99%;1");
  for (const v of ["NexusQ", "NexusChart", "NexusMeta"]) assert.ok(!G[v].includes("SECRET"));
  // the scheduled run does not repeat the same day
  G.NexusLastBatch = "0";
  assert.equal(run(scripts[0]).nx_go, "0");
});
