// Run: node --test tasker/test/
// Fixtures in ./fixtures are real Twelve Data responses captured with the
// public "demo" key (AAPL only). Batch responses are assembled from them,
// because the demo key does not allow several symbols at once.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const NX = require("../nexus.js");

const fx = (f) => fs.readFileSync(path.join(__dirname, "fixtures", f), "utf8");
const QUOTE = JSON.parse(fx("demo_quote_single.json"));
const SERIES = JSON.parse(fx("demo_series_single.json"));
const SYMS = ["IWM", "SPY", "QQQ", "SOXL", "SPCX"];

function env(globals = {}, nowMs = Date.parse("2026-11-09T15:00:00Z")) {
  const g = { NexusKey: "test-key", ...globals };
  return {
    g,
    global: (n) => (n in g ? g[n] : "%" + n),   // Tasker returns "%Name" for unset
    setGlobal: (n, v) => { g[n] = v; },
    now: () => nowMs,
  };
}
// batch of quotes: real AAPL fields, relabelled per symbol, scaled so they differ
function batchQuote(scaleBySym = {}) {
  const out = {};
  SYMS.forEach((s, i) => {
    const k = scaleBySym[s] ?? 1 + i * 0.1;
    out[s] = { ...QUOTE, symbol: s,
      close: String(Number(QUOTE.close) * k), change: String(Number(QUOTE.change) * k),
      previous_close: String(Number(QUOTE.previous_close) * k) };
  });
  return out;
}
function batchSeries() {
  const out = {};
  SYMS.forEach((s, i) => {
    out[s] = { meta: { ...SERIES.meta, symbol: s },
      values: SERIES.values.map((v) => ({ ...v, close: String(Number(v.close) * (1 + i * 0.1)) })),
      status: "ok" };
  });
  return out;
}

test("New York market window", () => {
  assert.equal(NX.inMarketWindow(Date.parse("2026-11-09T15:00:00Z")), true);   // Mon 10:00 ET
  assert.equal(NX.inMarketWindow(Date.parse("2026-11-09T14:20:00Z")), false);  // Mon 09:20 ET
  assert.equal(NX.inMarketWindow(Date.parse("2026-11-09T21:10:00Z")), true);   // Mon 16:10 ET
  assert.equal(NX.inMarketWindow(Date.parse("2026-11-09T21:20:00Z")), false);  // Mon 16:20 ET
  assert.equal(NX.inMarketWindow(Date.parse("2026-11-08T15:00:00Z")), false);  // Sunday
  // summer time (EDT): 13:35Z = 09:35 ET
  assert.equal(NX.inMarketWindow(Date.parse("2026-07-01T13:35:00Z")), true);
  assert.equal(NX.nyParts(Date.parse("2026-11-10T05:00:00Z")).h, 0);          // midnight -> 0
});

test("plan: missing key stops everything and reports it", () => {
  const e = env({ NexusKey: "%NexusKey" });
  delete e.g.NexusKey;
  const r = NX.plan(e);
  assert.equal(r.doQ, false); assert.equal(r.doC, false);
  assert.equal(e.g.NexusState, "ERROR");
  assert.match(e.g.NexusMeta, /API key missing/);
});

test("plan: first run fetches both, with a wait between (rate limit)", () => {
  const e = env();
  const r = NX.plan(e);
  assert.equal(r.doQ, true); assert.equal(r.doC, true); assert.equal(r.wait, true);
  assert.equal(r.qUrl, "https://api.twelvedata.com/quote?symbol=IWM,SPY,QQQ,SOXL,SPCX");
  assert.ok(!r.qUrl.includes("apikey") && !r.cUrl.includes("apikey"), "key is added by Tasker, not JS");
});

test("plan: market hours -> quotes every run, chart hourly; closed -> rest", () => {
  const now = Date.parse("2026-11-09T15:00:00Z"), s = now / 1000;
  let e = env({ NexusQ: "x", NexusChart: "x", NexusQTry: String(s - 300), NexusQTs: String(s - 300),
                NexusChartTs: String(s - 1200), NexusChartTry: String(s - 1200) }, now);
  let r = NX.plan(e);
  assert.equal(r.doQ, true); assert.equal(r.doC, false);
  e = env({ NexusQ: "x", NexusChart: "x", NexusQTry: String(s - 60), NexusQTs: String(s - 60),
            NexusChartTs: String(s - 4000), NexusChartTry: String(s - 4000) }, now);
  r = NX.plan(e);
  assert.equal(r.doQ, false); assert.equal(r.doC, true);
  const sun = Date.parse("2026-11-08T15:00:00Z"), ss = sun / 1000;
  e = env({ NexusQ: "x", NexusChart: "x", NexusQTry: String(ss - 3600), NexusQTs: String(ss - 3600),
            NexusChartTs: String(ss - 3600), NexusChartTry: String(ss - 3600) }, sun);
  r = NX.plan(e);
  assert.equal(r.doQ, false); assert.equal(r.doC, false);
});

test("quotes: real response format is parsed and formatted", () => {
  const row = NX.quoteRow("AAPL", QUOTE);
  assert.equal(row, "AAPL;342.37;−1.80;−0.52%;-1");
});

test("quotes: single-symbol response (real fixture) works", () => {
  const e = env({ NexusSymbols: "AAPL" });
  assert.equal(NX.handleQuotes(e, "200", fx("demo_quote_single.json")), true);
  assert.equal(e.g.NexusQ, "AAPL;342.37;−1.80;−0.52%;-1");
  assert.equal(e.g.NexusState, "CLOSED");   // fixture: is_market_open false
});

test("quotes: batch of five, positive and negative", () => {
  const b = batchQuote();
  b.SPY.change = "2.5"; b.SPY.percent_change = "0.4"; b.SPY.is_market_open = true;
  const e = env();
  assert.equal(NX.handleQuotes(e, "200", JSON.stringify(b)), true);
  const rows = e.g.NexusQ.split("|");
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map((r) => r.split(";")[0]), SYMS);
  assert.equal(rows[1].split(";")[4], "1");
  assert.equal(rows[1].split(";")[2], "+2.50");
  assert.equal(e.g.NexusState, "OPEN");
  const meta = e.g.NexusMeta.split("|");
  assert.equal(meta.length, 12);
  assert.equal(meta[1], "OPEN");
});

test("quotes: failure keeps the last good data and marks ERROR", () => {
  const e = env();
  NX.handleQuotes(e, "200", JSON.stringify(batchQuote()));
  const good = e.g.NexusQ, ts = e.g.NexusQTs;
  for (const [code, body] of [["", ""], ["200", "<html>"], ["401", fx("err_badkey.json")],
                              ["429", '{"code":429,"message":"x","status":"error"}']]) {
    assert.equal(NX.handleQuotes(e, code, body), false);
    assert.equal(e.g.NexusQ, good, "prices preserved");
    assert.equal(e.g.NexusQTs, ts, "timestamp preserved");
    assert.equal(e.g.NexusState, "ERROR");
  }
  assert.match(e.g.NexusMsg, /Rate limit/);
  assert.doesNotMatch(e.g.NexusMeta, /test-key/);
});

test("quotes: one bad symbol keeps its previous row, others update", () => {
  const e = env();
  NX.handleQuotes(e, "200", JSON.stringify(batchQuote()));
  const oldSpcx = e.g.NexusQ.split("|")[4];
  const b = batchQuote({ IWM: 2 });
  b.SPCX = { code: 400, message: "not found", status: "error" };
  NX.handleQuotes(e, "200", JSON.stringify(b));
  const rows = e.g.NexusQ.split("|");
  assert.equal(rows[4], oldSpcx);
  assert.equal(rows[0].split(";")[1], (Number(QUOTE.close) * 2).toFixed(2));
  assert.match(e.g.NexusMsg, /SPCX/);
});

test("quotes: a non-USD listing is rejected", () => {
  assert.equal(NX.quoteRow("SPCX", { ...QUOTE, currency: "ARS" }), null);
});

test("chart: real hourly series -> 5 paths + zero line, last 5 trading days", () => {
  const e = env();
  assert.equal(NX.handleSeries(e, "200", JSON.stringify(batchSeries())), true);
  const paths = e.g.NexusChart.split("|");
  assert.equal(paths.length, 6);
  for (const p of paths) assert.match(p, /^M [\d.]+,[\d.]+( L [\d.]+,[\d.]+)*$/);
  // every coordinate inside the 0-100 box
  const nums = e.g.NexusChart.match(/[\d.]+/g).map(Number);
  assert.ok(nums.every((n) => n >= 0 && n <= 100));
  const meta = e.g.NexusChartMeta.split("|");
  // fixture covers Oct 29 - Nov 6; the last five trading days are Nov 2-6
  assert.deepEqual(meta.slice(3), ["Mon", "Tue", "Wed", "Thu", "Fri"]);
  // each normalized series starts at 0% -> first point on the zero line
  const zy = Number(meta[2]);
  for (const p of paths.slice(0, 5)) assert.equal(Number(p.split(" ")[1].split(",")[1]), zy);
});

test("chart: normalization math", () => {
  const s = { A: [{ t: "2026-11-02 09:30:00", c: 100 }, { t: "2026-11-02 10:30:00", c: 110 }],
              B: [{ t: "2026-11-02 09:30:00", c: 50 }, { t: "2026-11-02 10:30:00", c: 45 }] };
  const c = NX.buildChart(s, ["A", "B"]);
  // A: 0% -> +10%, B: 0% -> -10%; range +-10 -> nice 15
  assert.equal(c.meta[0], "+15%");
  assert.equal(c.meta[1], "−15%");
  assert.equal(c.paths[0], "M 0,50 L 100,18");
  assert.equal(c.paths[1], "M 0,50 L 100,82");
});

test("chart: missing bars are forward-filled, missing symbol draws nothing", () => {
  const s = { A: [{ t: "2026-11-02 09:30:00", c: 100 }, { t: "2026-11-02 11:30:00", c: 101 }],
              B: [{ t: "2026-11-02 09:30:00", c: 10 }, { t: "2026-11-02 10:30:00", c: 10 },
                  { t: "2026-11-02 11:30:00", c: 10 }] };
  const c = NX.buildChart(s, ["A", "B", "C"]);
  assert.equal(c.paths[0].split(" L ").length, 3);   // 10:30 filled from 09:30
  assert.equal(c.paths[2], "M 0,0");
});

test("chart: failure keeps the old chart", () => {
  const e = env();
  NX.handleSeries(e, "200", JSON.stringify(batchSeries()));
  const old = e.g.NexusChart;
  assert.equal(NX.handleSeries(e, "", ""), false);
  assert.equal(e.g.NexusChart, old);
  assert.match(e.g.NexusMsg, /Chart not updated/);
});

test("meta never contains separators from messages", () => {
  const e = env({ NexusMsg: "a|b;c" });
  const meta = NX.publish(e);
  assert.equal(e.g.NexusMeta.split("|").length, 12);
  assert.equal(meta[11], "a b c");
});

// Runs the exact JavaScriptlet code from NEXUS.prj.xml in a sandbox that
// imitates Tasker's JS functions (global, setGlobal, local).
test("Tasker JavaScriptlets from the project file run end-to-end", () => {
  const vm = require("node:vm");
  const xml = fs.readFileSync(path.join(__dirname, "..", "NEXUS.prj.xml"), "utf8");
  const unesc = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const scripts = [...xml.matchAll(/<code>129<\/code>[\s\S]*?<Str sr="arg0" ve="3">([\s\S]*?)<\/Str>/g)]
    .map((m) => unesc(m[1]));
  assert.equal(scripts.length, 3);
  const G = { NexusKey: "SECRET-KEY-123" }, L = {};
  const ctx = () => vm.createContext({
    global: (n) => G[n], setGlobal: (n, v) => { G[n] = v; }, local: (n) => L[n],
    Intl, Date, JSON, Math, String, Number, Object, isFinite, parseFloat, parseInt,
  });
  const c1 = ctx(); vm.runInContext(scripts[0], c1);
  assert.equal(c1.do_q, "1"); assert.equal(c1.do_c, "1"); assert.equal(c1.do_w, "1");
  assert.match(c1.nx_qurl, /quote\?symbol=IWM,SPY,QQQ,SOXL,SPCX$/);
  L.http_response_code = "200"; L.http_data = JSON.stringify(batchQuote());
  vm.runInContext(scripts[1], ctx());
  assert.equal(G.NexusQ.split("|").length, 5);
  L.http_data = JSON.stringify(batchSeries());
  vm.runInContext(scripts[2], ctx());
  assert.equal(G.NexusChart.split("|").length, 6);
  assert.equal(G.NexusMeta.split("|").length, 12);
  for (const v of ["NexusQ", "NexusChart", "NexusMeta"]) assert.ok(!G[v].includes("SECRET"), "key never sent to KLWP");
});
