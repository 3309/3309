// NEXUS core logic.
// Runs inside Tasker "JavaScriptlet" actions (embedded by tasker/build_tasker.py)
// and in Node for the automated tests (tasker/test/nexus.test.js).
//
// Data source: Twelve Data (https://twelvedata.com), free plan.
// Nothing here contains or logs the API key: Tasker inserts %NexusKey into
// the HTTP Request URL itself.
//
// Values sent to KLWP (all text, see config/stocks.md):
//   nx_q     "SYM;PRICE;CHG;PCT;DIR|..."     5 rows, fixed order
//   nx_chart "path0|path1|path2|path3|path4|zeroLine"   SVG paths in a 0-100 box
//   nx_meta  "TS|STATE|UPDATED|YMAX|YMIN|ZEROY|D1|D2|D3|D4|D5|MSG"
//
// Tasker globals used to keep the last good data:
//   NexusKey (you set it), NexusSymbols (optional override),
//   NexusQ, NexusQTs, NexusQTry, NexusState, NexusMsg, NexusUpd,
//   NexusChart, NexusChartMeta, NexusChartTs, NexusChartTry, NexusMeta
var NX = (function () {
  "use strict";

  var DEFAULT_SYMBOLS = "IWM,SPY,QQQ,SOXL,SPCX";
  var MINUS = "\u2212";
  var BASE = "https://api.twelvedata.com";

  // ------------------------------------------------------------ small helpers
  function isSet(v) {
    return v !== undefined && v !== null && String(v) !== "" && String(v).charAt(0) !== "%";
  }
  function str(v) { return isSet(v) ? String(v) : ""; }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : NaN; }
  function clean(s) { return String(s).replace(/[|;\n\r]/g, " ").slice(0, 120); }

  function symbolsFrom(env) {
    var raw = str(env.global("NexusSymbols")) || DEFAULT_SYMBOLS;
    return raw.split(",").map(function (s) { return s.trim().toUpperCase(); })
      .filter(function (s) { return /^[A-Z0-9.]{1,10}$/.test(s); }).slice(0, 5);
  }

  function signed(v, digits, suffix) {
    var s = Math.abs(v).toFixed(digits);
    if (Number(s) === 0) return "0." + "000000".slice(0, digits) + (suffix || "");
    return (v > 0 ? "+" : MINUS) + s + (suffix || "");
  }

  function fmtPrice(p) { return p.toFixed(2); }

  // ------------------------------------------------------------ New York clock
  function nyParts(ms) {
    var f = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", weekday: "short", year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    });
    var out = {};
    f.formatToParts(new Date(ms)).forEach(function (p) { out[p.type] = p.value; });
    var h = parseInt(out.hour, 10) % 24;
    return { wd: out.weekday, h: h, m: parseInt(out.minute, 10),
             ymd: out.year + "-" + out.month + "-" + out.day };
  }

  // Regular session 9:30-16:00 ET, Mon-Fri, with a small margin either side.
  // Holidays are handled by the API's is_market_open flag (state CLOSED).
  function inMarketWindow(ms) {
    var p = nyParts(ms);
    if (p.wd === "Sat" || p.wd === "Sun") return false;
    var t = p.h * 60 + p.m;
    return t >= 9 * 60 + 25 && t <= 16 * 60 + 15;
  }

  function updatedLabel(ms) {
    var d = new Date(ms);
    var day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
    var time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return day + " " + time;
  }

  // ------------------------------------------------------------ planning
  // Decides which requests to make this run. Free plan: 800 credits/day and
  // 8 credits/minute; each request below costs 1 credit per symbol (5).
  function plan(env) {
    var now = env.now();
    var nowS = Math.floor(now / 1000);
    var syms = symbolsFrom(env);
    var r = { doQ: false, doC: false, wait: false, qUrl: "", cUrl: "", reason: "" };

    if (!isSet(env.global("NexusKey"))) {
      env.setGlobal("NexusState", "ERROR");
      env.setGlobal("NexusMsg", "API key missing: add NexusKey in Tasker VARS");
      publish(env);
      r.reason = "no key";
      return r;
    }

    var open = inMarketWindow(now);
    var lastQTry = num(env.global("NexusQTry")) || 0;
    var lastQ = num(env.global("NexusQTs")) || 0;
    var lastCTry = num(env.global("NexusChartTry")) || 0;
    var lastC = num(env.global("NexusChartTs")) || 0;

    if (open) {
      r.doQ = nowS - lastQTry >= 120;                     // profile fires every 5 min
      r.doC = nowS - lastC >= 3600 && nowS - lastCTry >= 600;
    } else {
      // outside market hours: pick up closing prices, then rest
      r.doQ = nowS - lastQ >= 3 * 3600 && nowS - lastQTry >= 1800;
      r.doC = nowS - lastC >= 3 * 3600 && nowS - lastCTry >= 1800;
    }
    if (!isSet(env.global("NexusQ")) && nowS - lastQTry >= 60) r.doQ = true;
    if (!isSet(env.global("NexusChart")) && nowS - lastCTry >= 60) r.doC = true;

    r.wait = r.doQ && r.doC;                               // stay under 8 credits/minute
    var s = syms.join(",");
    r.qUrl = BASE + "/quote?symbol=" + s;
    r.cUrl = BASE + "/time_series?symbol=" + s + "&interval=1h&outputsize=45&order=asc";
    if (r.doQ) env.setGlobal("NexusQTry", String(nowS));
    if (r.doC) env.setGlobal("NexusChartTry", String(nowS));
    r.reason = (open ? "market window" : "outside market hours");
    return r;
  }

  // ------------------------------------------------------------ responses
  function parseResponse(code, body) {
    if (!isSet(body)) return { error: "No response (offline?)" };
    var j;
    try { j = JSON.parse(body); } catch (e) { return { error: "Bad response from server" }; }
    if (j && j.status === "error") {
      var c = j.code || code;
      if (c === 401 || c === 403) return { error: "API key rejected (" + c + ")" };
      if (c === 429) return { error: "Rate limit reached, will retry" };
      return { error: "API error " + (c || "") };
    }
    if (isSet(code) && String(code) !== "200") return { error: "HTTP " + code };
    return { json: j };
  }

  // Twelve Data returns a single object for one symbol and an object keyed by
  // symbol for several.
  function bySymbol(j, syms) {
    if (j && typeof j.symbol === "string") { var o = {}; o[j.symbol.toUpperCase()] = j; return o; }
    if (j && j.meta && j.meta.symbol) { var m = {}; m[j.meta.symbol.toUpperCase()] = j; return m; }
    return j || {};
  }

  function oldRows(env) {
    var map = {};
    str(env.global("NexusQ")).split("|").forEach(function (row) {
      var f = row.split(";");
      if (f.length === 5 && f[0]) map[f[0]] = row;
    });
    return map;
  }

  function quoteRow(sym, q) {
    if (!q || q.status === "error") return null;
    if (q.currency && q.currency !== "USD") return null;     // wrong listing
    var price = num(q.close), chg = num(q.change), pct = num(q.percent_change);
    if (!(price > 0)) return null;
    if (!isFinite(chg)) { var prev = num(q.previous_close); chg = prev > 0 ? price - prev : NaN; }
    if (!isFinite(pct)) { var pv = price - chg; pct = pv > 0 ? chg / pv * 100 : NaN; }
    if (!isFinite(chg) || !isFinite(pct)) return null;
    var dir = Number(chg.toFixed(2)) > 0 ? "1" : Number(chg.toFixed(2)) < 0 ? "-1" : "0";
    return [sym, fmtPrice(price), signed(chg, 2), signed(pct, 2, "%"), dir].join(";");
  }

  function handleQuotes(env, code, body) {
    var syms = symbolsFrom(env);
    var p = parseResponse(code, body);
    if (p.error) { fail(env, p.error); return false; }
    var map = bySymbol(p.json, syms), old = oldRows(env);
    var rows = [], good = 0, missing = [], open = false;
    syms.forEach(function (s) {
      var q = map[s];
      var row = quoteRow(s, q);
      if (row) { good++; if (q.is_market_open === true || q.is_market_open === "true") open = true; }
      else { missing.push(s); row = old[s] || [s, "--.--", "--.--", "--.--%", "0"].join(";"); }
      rows.push(row);
    });
    if (!good) { fail(env, "No valid prices in response"); return false; }
    env.setGlobal("NexusQ", rows.join("|"));
    env.setGlobal("NexusQTs", String(Math.floor(env.now() / 1000)));
    env.setGlobal("NexusUpd", updatedLabel(env.now()));
    env.setGlobal("NexusState", open ? "OPEN" : "CLOSED");
    env.setGlobal("NexusMsg", missing.length ? "No data for " + missing.join(", ") : "");
    publish(env);
    return true;
  }

  function fail(env, msg) {
    env.setGlobal("NexusState", "ERROR");
    env.setGlobal("NexusMsg", clean(msg));
    publish(env);      // last good prices/chart are untouched
  }

  // ------------------------------------------------------------ chart
  function niceUp(v) {
    var steps = [0.5, 1, 2, 2.5, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 300, 500, 1000];
    for (var i = 0; i < steps.length; i++) if (steps[i] >= v * 1.05) return steps[i];
    return Math.ceil(v / 1000) * 1000;
  }
  function pctLabel(v) {
    var s = (Math.round(Math.abs(v) * 10) / 10).toString();
    return (v > 0 ? "+" : v < 0 ? MINUS : "") + s + "%";
  }
  function r1(v) { return (Math.round(v * 10) / 10).toString(); }

  function buildChart(seriesBySym, syms) {
    // seriesBySym: { SYM: [{t:"YYYY-MM-DD HH:MM:SS", c:Number}, ...] }
    var dates = {};
    syms.forEach(function (s) { (seriesBySym[s] || []).forEach(function (p) { dates[p.t.slice(0, 10)] = 1; }); });
    var days = Object.keys(dates).sort().slice(-5);
    if (!days.length) return null;
    var first = days[0];
    var stamps = {};
    syms.forEach(function (s) {
      (seriesBySym[s] || []).forEach(function (p) { if (p.t.slice(0, 10) >= first) stamps[p.t] = 1; });
    });
    var ts = Object.keys(stamps).sort();
    if (ts.length < 2) return null;

    var lines = syms.map(function (s) {
      var pts = (seriesBySym[s] || []).filter(function (p) { return p.t.slice(0, 10) >= first; })
        .sort(function (a, b) { return a.t < b.t ? -1 : 1; });
      if (!pts.length) return null;
      var base = pts[0].c, j = 0, last = null, out = [];
      ts.forEach(function (t, i) {
        while (j < pts.length && pts[j].t <= t) { last = pts[j].c; j++; }   // forward-fill
        if (last !== null) out.push({ i: i, v: (last / base - 1) * 100 });
      });
      return out;
    });

    var maxv = 0, minv = 0;
    lines.forEach(function (l) { (l || []).forEach(function (p) { maxv = Math.max(maxv, p.v); minv = Math.min(minv, p.v); }); });
    var hi = niceUp(Math.max(maxv, 0.1)), lo = -niceUp(Math.max(-minv, 0.1));
    var y = function (v) { return 2 + (hi - v) / (hi - lo) * 96; };
    var x = function (i) { return i / (ts.length - 1) * 100; };

    var paths = lines.map(function (l) {
      if (!l || !l.length) return "M 0,0";
      return l.map(function (p, k) { return (k ? "L " : "M ") + r1(x(p.i)) + "," + r1(y(p.v)); }).join(" ");
    });
    var zy = y(0);
    paths.push("M 0," + r1(zy) + " L 100," + r1(zy));

    var dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    var labels = days.map(function (d) { return dayNames[new Date(d + "T12:00:00Z").getUTCDay()]; });
    while (labels.length < 5) labels.push("");
    return {
      paths: paths,
      meta: [zy < 12 ? "" : pctLabel(hi), zy > 88 ? "" : pctLabel(lo), r1(zy)].concat(labels)
    };
  }

  function handleSeries(env, code, body) {
    var syms = symbolsFrom(env);
    var p = parseResponse(code, body);
    if (p.error) { env.setGlobal("NexusMsg", clean("Chart not updated: " + p.error)); publish(env); return false; }
    var map = bySymbol(p.json, syms), series = {}, n = 0;
    syms.forEach(function (s) {
      var d = map[s];
      if (!d || d.status === "error" || !d.values) return;
      if (d.meta && d.meta.currency && d.meta.currency !== "USD") return;
      series[s] = d.values.map(function (v) { return { t: v.datetime, c: num(v.close) }; })
        .filter(function (v) { return v.c > 0 && /^\d{4}-\d\d-\d\d \d\d:\d\d/.test(v.t); });
      if (series[s].length) n++;
    });
    var chart = n ? buildChart(series, syms) : null;
    if (!chart) { env.setGlobal("NexusMsg", "Chart not updated: no history data"); publish(env); return false; }
    env.setGlobal("NexusChart", chart.paths.join("|"));
    env.setGlobal("NexusChartMeta", chart.meta.join("|"));
    env.setGlobal("NexusChartTs", String(Math.floor(env.now() / 1000)));
    publish(env);
    return true;
  }

  // ------------------------------------------------------------ meta for KLWP
  function publish(env) {
    var cm = str(env.global("NexusChartMeta")).split("|");
    while (cm.length < 8) cm.push("");
    var meta = [str(env.global("NexusQTs")) || "0", str(env.global("NexusState")) || "ERROR",
                str(env.global("NexusUpd")) || "--:--"].concat(cm.slice(0, 8))
               .concat([clean(str(env.global("NexusMsg")))]);
    env.setGlobal("NexusMeta", meta.join("|"));
    return meta;
  }

  // ------------------------------------------------------------ Tasker glue
  function taskerEnv() {
    /* global global, setGlobal */
    return {
      global: function (n) { return global(n); },
      setGlobal: function (n, v) { setGlobal(n, v); },
      now: function () { return Date.now(); }
    };
  }

  return {
    DEFAULT_SYMBOLS: DEFAULT_SYMBOLS, nyParts: nyParts, inMarketWindow: inMarketWindow,
    plan: plan, parseResponse: parseResponse, quoteRow: quoteRow, handleQuotes: handleQuotes,
    handleSeries: handleSeries, buildChart: buildChart, publish: publish, niceUp: niceUp,
    signed: signed, taskerEnv: taskerEnv, symbolsFrom: symbolsFrom
  };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = NX; }
