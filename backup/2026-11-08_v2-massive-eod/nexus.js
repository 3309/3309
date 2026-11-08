// NEXUS core logic (Massive Stocks Basic, end-of-day data).
// Runs inside Tasker "JavaScriptlet" actions (embedded by tasker/build_tasker.py)
// and in Node for the automated tests (tasker/test/nexus.test.js).
//
// Data: Massive daily aggregates
//   GET https://api.massive.com/v2/aggs/ticker/{SYM}/range/1/day/{from}/{to}?adjusted=true&sort=asc
// The API key is sent by Tasker's HTTP Request action as the header
// "Authorization: Bearer %NexusKey". It never passes through this code.
//
// Values sent to KLWP (text, see config/stocks.md):
//   nx_q     "SYM;CLOSE;CHG;PCT;DIR|..."   always 5 rows, fixed display order
//   nx_chart "p0|p1|p2|p3|p4|zeroLine"      SVG paths in a 0-100 box
//   nx_meta  "TS|STATE|UPDATED|YMAX|YMIN|ZEROY|D1|D2|D3|D4|D5|MSG|SESSION"
//
// Tasker globals:
//   NexusKey      your Massive API key (you create it in the VARS tab)
//   NexusSymbols  optional: which symbols to fetch (default FETCH_DEFAULT)
//   NexusBars_SYM last good closes per symbol, "YYYY-MM-DD:close,..."
//   NexusQ, NexusChart, NexusMeta    last values sent to KLWP
//   NexusTs, NexusState, NexusMsg, NexusUpd, NexusDay, NexusLastBatch
var NX = (function () {
  "use strict";

  var DISPLAY = ["IWM", "SPY", "QQQ", "SOXL", "SPCX"];   // rows / colors in KLWP
  var FETCH_DEFAULT = "IWM";                             // proof of concept: IWM only
  var BASE = "https://api.massive.com";
  var MINUS = "−";
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function isSet(v) {
    return v !== undefined && v !== null && String(v) !== "" && String(v).charAt(0) !== "%";
  }
  function str(v) { return isSet(v) ? String(v) : ""; }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : NaN; }
  function clean(s) { return String(s).replace(/[|;\n\r]/g, " ").slice(0, 120); }

  function fetchList(env) {
    var raw = str(env.global("NexusSymbols")) || FETCH_DEFAULT;
    return raw.split(",").map(function (s) { return s.trim().toUpperCase(); })
      .filter(function (s) { return DISPLAY.indexOf(s) >= 0; });
  }

  // ------------------------------------------------------------ New York date/time
  function nyParts(ms) {
    var f = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    });
    var o = {};
    f.formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value; });
    return { ymd: o.year + "-" + o.month + "-" + o.day, h: parseInt(o.hour, 10) % 24, m: parseInt(o.minute, 10) };
  }
  function addDays(ymd, n) {
    var d = new Date(ymd + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function dayName(ymd) { return DAYS[new Date(ymd + "T12:00:00Z").getUTCDay()]; }
  function sessionLabel(ymd) {
    var d = new Date(ymd + "T12:00:00Z");
    return DAYS[d.getUTCDay()] + " " + d.getUTCDate() + " " + MONTHS[d.getUTCMonth()];
  }
  function updatedLabel(ms) {
    var d = new Date(ms);
    return DAYS[d.getDay()] + " " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  // ------------------------------------------------------------ planning
  // Scheduled runs (Tasker profile, hourly check): fetch once per New York day,
  // at the first check after 00:15 ET. Manual runs: always, unless the previous
  // batch started less than 65 s ago (free plan: 5 requests per minute).
  function plan(env, manual) {
    var now = env.now(), nowS = Math.floor(now / 1000);
    var ny = nyParts(now);
    var r = { go: false, urls: [], syms: [], reason: "" };
    if (!isSet(env.global("NexusKey"))) {
      env.setGlobal("NexusState", "ERROR");
      env.setGlobal("NexusMsg", "API key missing: add NexusKey in Tasker VARS");
      publish(env); r.reason = "no key"; return r;
    }
    var last = num(env.global("NexusLastBatch")) || 0;
    if (nowS - last < 65) { r.reason = "too soon (rate limit)"; return r; }
    if (!manual) {
      var after = ny.h * 60 + ny.m >= 15;
      var done = str(env.global("NexusDay")) === ny.ymd;
      if (!after || done) { r.reason = done ? "already updated today" : "before 00:15 ET"; return r; }
    }
    var from = addDays(ny.ymd, -14), to = ny.ymd;
    r.syms = fetchList(env);
    r.urls = r.syms.map(function (s) {
      return BASE + "/v2/aggs/ticker/" + s + "/range/1/day/" + from + "/" + to + "?adjusted=true&sort=asc&limit=50";
    });
    r.go = r.urls.length > 0;
    if (r.go) { env.setGlobal("NexusLastBatch", String(nowS)); env.setGlobal("NexusErrs", ""); }
    r.reason = manual ? "manual" : "scheduled";
    return r;
  }

  // ------------------------------------------------------------ one response
  function parseBars(code, body) {
    if (!isSet(body)) return { error: "No response (offline?)" };
    var j;
    try { j = JSON.parse(body); } catch (e) { return { error: "Bad response from server" }; }
    var st = j && j.status;
    if (st === "ERROR" || st === "NOT_AUTHORIZED" || (j && j.error && !j.results)) {
      var m = String(j.error || j.message || "");
      if (/api key/i.test(m)) return { error: "API key problem: " + m };
      if (String(code) === "429" || /exceeded|limit/i.test(m)) return { error: "Rate limit reached" };
      return { error: "API error: " + (m || st) };
    }
    if (isSet(code) && String(code) !== "200") return { error: "HTTP " + code };
    if (st !== "OK" && st !== "DELAYED") return { error: "Unexpected status " + st };
    var bars = (j.results || []).filter(function (b) { return num(b.c) > 0 && num(b.t) > 0; })
      .map(function (b) { return { d: nyParts(num(b.t)).ymd, c: num(b.c) }; })
      .sort(function (a, b) { return a.d < b.d ? -1 : 1; });
    if (!bars.length) return { error: "No bars returned" };
    return { ticker: String(j.ticker || "").toUpperCase(), bars: bars.slice(-6) };
  }

  // Called after each HTTP Request. Saves bars only when valid.
  function storeBars(env, sym, code, body) {
    var p = parseBars(code, body);
    if (!p.error && p.ticker && p.ticker !== sym) p = { error: "Wrong ticker in response" };
    if (p.error) {
      var errs = str(env.global("NexusErrs"));
      env.setGlobal("NexusErrs", (errs ? errs + ", " : "") + sym + ": " + p.error);
      return false;
    }
    env.setGlobal("NexusBars_" + sym, p.bars.map(function (b) { return b.d + ":" + b.c; }).join(","));
    return true;
  }

  function readBars(env, sym) {
    return str(env.global("NexusBars_" + sym)).split(",").map(function (x) {
      var k = x.split(":"); return { d: k[0], c: num(k[1]) };
    }).filter(function (b) { return /^\d{4}-\d\d-\d\d$/.test(b.d) && b.c > 0; });
  }

  // ------------------------------------------------------------ rows + chart
  function signed(v, digits, suffix) {
    var s = Math.abs(v).toFixed(digits);
    if (Number(s) === 0) return (0).toFixed(digits) + (suffix || "");
    return (v > 0 ? "+" : MINUS) + s + (suffix || "");
  }
  function row(sym, bars) {
    if (!bars.length) return [sym, "--.--", "--.--", "--.--%", "0"].join(";");
    var c = bars[bars.length - 1].c;
    if (bars.length < 2) return [sym, c.toFixed(2), "--.--", "--.--%", "0"].join(";");
    var p = bars[bars.length - 2].c, chg = c - p, pct = chg / p * 100;
    var r2 = Number(chg.toFixed(2));
    return [sym, c.toFixed(2), signed(chg, 2), signed(pct, 2, "%"), r2 > 0 ? "1" : r2 < 0 ? "-1" : "0"].join(";");
  }

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

  // barsBySym: {SYM: [{d, c}, ...]} ascending. Uses the latest 5 sessions.
  function buildChart(barsBySym) {
    var all = {};
    DISPLAY.forEach(function (s) { (barsBySym[s] || []).forEach(function (b) { all[b.d] = 1; }); });
    var days = Object.keys(all).sort().slice(-5);
    if (!days.length) return null;
    var lines = DISPLAY.map(function (s) {
      var map = {}; (barsBySym[s] || []).forEach(function (b) { map[b.d] = b.c; });
      var base = null, last = null, out = [];
      days.forEach(function (d, i) {
        if (map[d] !== undefined) last = map[d];            // missing session: keep previous
        if (last === null) return;
        if (base === null) base = last;
        out.push({ i: i, v: (last / base - 1) * 100 });
      });
      return out;
    });
    var maxv = 0, minv = 0;
    lines.forEach(function (l) { l.forEach(function (p) { maxv = Math.max(maxv, p.v); minv = Math.min(minv, p.v); }); });
    var hi = niceUp(Math.max(maxv, 0.1)), lo = -niceUp(Math.max(-minv, 0.1));
    var y = function (v) { return 2 + (hi - v) / (hi - lo) * 96; };
    var n = days.length;
    var x = function (i) { return n === 1 ? 50 : 10 + i / (n - 1) * 80; };   // points sit under the day labels
    var paths = lines.map(function (l) {
      if (!l.length) return "M 0,0";
      if (l.length === 1) return "M " + r1(x(l[0].i)) + "," + r1(y(l[0].v)) + " L " + r1(x(l[0].i) + 0.1) + "," + r1(y(l[0].v));
      return l.map(function (p, k) { return (k ? "L " : "M ") + r1(x(p.i)) + "," + r1(y(p.v)); }).join(" ");
    });
    var zy = y(0);
    paths.push("M 0," + r1(zy) + " L 100," + r1(zy));
    var labels = days.map(dayName);
    while (labels.length < 5) labels.push("");
    return { paths: paths, meta: [zy < 12 ? "" : pctLabel(hi), zy > 88 ? "" : pctLabel(lo), r1(zy)].concat(labels),
             last: days[days.length - 1] };
  }

  // Called once after all requests: builds what KLWP shows from the stored bars.
  function finish(env) {
    var now = env.now();
    var errs = str(env.global("NexusErrs"));
    var wanted = fetchList(env);
    var barsBySym = {}, have = 0;
    DISPLAY.forEach(function (s) { barsBySym[s] = readBars(env, s); if (barsBySym[s].length) have++; });
    var failedAll = wanted.length > 0 && wanted.every(function (s) { return errs.indexOf(s + ":") >= 0; });

    if (!have) {
      env.setGlobal("NexusState", "ERROR");
      env.setGlobal("NexusMsg", clean(errs || "No data yet"));
      publish(env); return false;
    }
    if (failedAll) {                     // nothing new: keep everything, flag the error
      env.setGlobal("NexusState", "ERROR");
      env.setGlobal("NexusMsg", clean(errs));
      publish(env); return false;
    }
    env.setGlobal("NexusQ", DISPLAY.map(function (s) { return row(s, barsBySym[s]); }).join("|"));
    var ch = buildChart(barsBySym);
    env.setGlobal("NexusChart", ch.paths.join("|"));
    env.setGlobal("NexusChartMeta", ch.meta.join("|"));
    env.setGlobal("NexusSession", sessionLabel(ch.last));
    env.setGlobal("NexusTs", String(Math.floor(now / 1000)));
    env.setGlobal("NexusUpd", updatedLabel(now));
    env.setGlobal("NexusDay", nyParts(now).ymd);
    env.setGlobal("NexusState", "EOD");
    env.setGlobal("NexusMsg", clean(errs ? "Partly updated: " + errs : ""));
    publish(env);
    return true;
  }

  function publish(env) {
    var cm = str(env.global("NexusChartMeta")).split("|");
    while (cm.length < 8) cm.push("");
    var meta = [str(env.global("NexusTs")) || "0", str(env.global("NexusState")) || "ERROR",
                str(env.global("NexusUpd")) || "--:--"].concat(cm.slice(0, 8))
               .concat([clean(str(env.global("NexusMsg"))), str(env.global("NexusSession"))]);
    env.setGlobal("NexusMeta", meta.join("|"));
    return meta;
  }

  function taskerEnv() {
    /* global global, setGlobal */
    return {
      global: function (n) { return global(n); },
      setGlobal: function (n, v) { setGlobal(n, v); },
      now: function () { return Date.now(); }
    };
  }

  return {
    DISPLAY: DISPLAY, FETCH_DEFAULT: FETCH_DEFAULT, nyParts: nyParts, plan: plan, parseBars: parseBars,
    storeBars: storeBars, finish: finish, buildChart: buildChart, row: row, publish: publish,
    niceUp: niceUp, fetchList: fetchList, taskerEnv: taskerEnv
  };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = NX; }
