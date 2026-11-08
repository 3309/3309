// NEXUS core logic. Runs inside Tasker JavaScriptlets (embedded by
// tasker/build_tasker.py) and in Node for the tests (tasker/test/nexus.test.js).
//
// Providers (Tasker variable %NexusProvider, default "twelvedata"):
//   twelvedata  /quote (1 credit per symbol) every 30 min in US market hours,
//               /time_series 1day (1 credit per symbol) once per trading day.
//               Key sent as header "Authorization: apikey <key>".
//   massive     Massive Stocks Basic daily aggregates (end of day), once a day.
//               Key sent as header "Authorization: Bearer <key>".
// The key lives only in the Tasker variable %NexusKey. Tasker inserts it into
// the request header; it never passes through this code or reaches KLWP.
//
// How a run works:
//   1. plan()   decides which requests to make (up to 10 "slots") and the
//               pause before each one (rate limits), stores the plan.
//   2. Tasker   performs each HTTP request and saves "code<SEP>body" to
//               %NexusRaw1..10 (plain Variable Set, no JavaScript).
//   3. finish() reads the raw responses, validates them, keeps the last good
//               data for anything that failed, and builds what KLWP shows.
//
// Sent to KLWP (Kustom Tasker plugin, read with $br(tasker, name)$):
//   iwm, spy, qqq, gld, mags   "PRICE;CHG;PCT;DIR"   DIR = 1, -1 or 0
//   nx_chart  "p_iwm|p_spy|p_qqq|p_gld|p_mags|zero"  SVG paths in a 0-100 box
//   nx_meta   "TS|STATE|UPDATED|YMAX|YMIN|ZEROY|D1|D2|D3|D4|D5|MSG|SESSION|PROVIDER"
//             STATE = OPEN, CLOSED, EOD or ERROR
var NX = (function () {
  "use strict";

  var SYMBOLS = ["IWM", "SPY", "QQQ", "GLD", "MAGS"];
  var SEP = "~~NX~~";
  var MINUS = "−";
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var QUOTE_EVERY = 30 * 60;      // seconds between quote refreshes in market hours
  var MIN_GAP = 65;               // seconds between two runs that call the API

  var PROVIDERS = {
    twelvedata: { base: "https://api.twelvedata.com", authPrefix: "apikey", label: "Twelve Data" },
    massive: { base: "https://api.massive.com", authPrefix: "Bearer", label: "Massive EOD" }
  };

  // ------------------------------------------------------------ helpers
  function isSet(v) { return v !== undefined && v !== null && String(v) !== "" && String(v).charAt(0) !== "%"; }
  function str(v) { return isSet(v) ? String(v) : ""; }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : NaN; }
  function clean(s) { return String(s).replace(/[|;\n\r]/g, " ").slice(0, 140); }
  function varName(sym) { return "Nexus_" + sym.toLowerCase(); }          // Tasker global per symbol
  function providerOf(env) {
    var p = str(env.global("NexusProvider")).toLowerCase();
    return PROVIDERS[p] ? p : "twelvedata";
  }

  function nyParts(ms) {
    var f = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", weekday: "short", year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    });
    var o = {};
    f.formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value; });
    return { wd: o.weekday, ymd: o.year + "-" + o.month + "-" + o.day,
             h: parseInt(o.hour, 10) % 24, m: parseInt(o.minute, 10) };
  }
  function addDays(ymd, n) {
    var d = new Date(ymd + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function weekdayOf(ymd) { return new Date(ymd + "T12:00:00Z").getUTCDay(); }
  function sessionLabel(ymd) {
    var d = new Date(ymd + "T12:00:00Z");
    return DAYS[d.getUTCDay()] + " " + d.getUTCDate() + " " + MONTHS[d.getUTCMonth()];
  }
  function updatedLabel(ms) {
    var d = new Date(ms);
    return DAYS[d.getDay()] + " " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  // Epoch seconds of 16:00 New York on the most recent weekday close at or before now.
  // (Holidays are not known; on a holiday this simply allows one extra fetch.)
  function lastCloseEpoch(nowMs) {
    var p = nyParts(nowMs), ymd = p.ymd;
    var mins = p.h * 60 + p.m;
    if (!(weekdayOf(ymd) >= 1 && weekdayOf(ymd) <= 5 && mins >= 16 * 60)) {
      do { ymd = addDays(ymd, -1); } while (weekdayOf(ymd) === 0 || weekdayOf(ymd) === 6);
    }
    // find the UTC instant of 16:00 NY on ymd (EST = UTC-5, EDT = UTC-4)
    for (var off = 4; off <= 5; off++) {
      var t = Date.parse(ymd + "T" + (16 + off) + ":00:00Z");
      var q = nyParts(t);
      if (q.ymd === ymd && q.h === 16) return Math.floor(t / 1000);
    }
    return 0;
  }
  function inMarketHours(nowMs) {
    var p = nyParts(nowMs), wd = weekdayOf(p.ymd), mins = p.h * 60 + p.m;
    return wd >= 1 && wd <= 5 && mins >= 9 * 60 + 30 && mins <= 16 * 60 + 10;
  }

  // ------------------------------------------------------------ 1. plan
  function plan(env, manual) {
    var now = env.now(), nowS = Math.floor(now / 1000), ny = nyParts(now);
    var prov = providerOf(env), P = PROVIDERS[prov];
    var r = { go: false, slots: [], authPrefix: P.authPrefix, provider: prov, reason: "" };
    for (var k = 1; k <= 10; k++) env.setGlobal("NexusRaw" + k, "");

    if (!isSet(env.global("NexusKey"))) {
      env.setGlobal("NexusState", "ERROR");
      env.setGlobal("NexusMsg", "API key missing: add NexusKey in Tasker VARS");
      publish(env); r.reason = "no key"; return r;
    }
    var lastRun = num(env.global("NexusLastRun")) || 0;
    if (nowS - lastRun < MIN_GAP) { r.reason = "too soon (rate limit)"; return r; }

    var haveData = SYMBOLS.some(function (s) { return isSet(env.global(varName(s))); });
    var lastQ = num(env.global("NexusTs")) || 0;
    var histDay = str(env.global("NexusHistDay"));
    var wantQuotes = false, wantHist = false;

    if (prov === "twelvedata") {
      if (manual || !haveData) wantQuotes = true;
      else if (inMarketHours(now)) wantQuotes = nowS - lastQ >= QUOTE_EVERY - 60;
      else wantQuotes = lastQ < lastCloseEpoch(now);            // pick up the closing prices once
      var wd = weekdayOf(ny.ymd), mins = ny.h * 60 + ny.m;
      var tradingDayStarted = wd >= 1 && wd <= 5 && mins >= 9 * 60 + 30;
      wantHist = !histDay || (wantQuotes && histDay !== ny.ymd && (tradingDayStarted || manual));
      if (wantQuotes) SYMBOLS.forEach(function (s, i) {
        r.slots.push({ kind: "quote", sym: s, wait: 0,
          url: P.base + "/quote?symbol=" + s });
      });
      if (wantHist) SYMBOLS.forEach(function (s, i) {
        // 5 quote credits + 5 history credits would exceed 8 per minute: pause 61 s first
        r.slots.push({ kind: "series", sym: s, wait: (i === 0 && wantQuotes) ? 61 : 0,
          url: P.base + "/time_series?symbol=" + s + "&interval=1day&outputsize=6&order=asc" });
      });
    } else {                                                    // massive: once per NY day after 00:15
      var due = manual || !haveData || ((ny.h * 60 + ny.m >= 15) && histDay !== ny.ymd);
      if (due) SYMBOLS.forEach(function (s, i) {
        r.slots.push({ kind: "bars", sym: s, wait: i ? 13 : 0,  // 5 requests per minute limit
          url: P.base + "/v2/aggs/ticker/" + s + "/range/1/day/" + addDays(ny.ymd, -14) + "/" + ny.ymd +
               "?adjusted=true&sort=asc&limit=50" });
      });
    }
    r.go = r.slots.length > 0;
    if (r.go) {
      env.setGlobal("NexusLastRun", String(nowS));
      env.setGlobal("NexusPlan", JSON.stringify(r.slots.map(function (s) { return [s.kind, s.sym]; })));
    }
    r.reason = r.go ? (manual ? "manual" : "scheduled") : "nothing due";
    return r;
  }

  // credits this plan will use (Twelve Data: 1 per symbol for /quote and /time_series)
  function credits(r) { return r.slots.length; }

  // ------------------------------------------------------------ 2. responses
  function parse(code, body) {
    if (!isSet(body) || body === "x") return { error: "No response (offline?)" };
    var j;
    try { j = JSON.parse(body); } catch (e) { return { error: "Bad response from server" }; }
    if (j && (j.status === "error" || j.status === "ERROR" || j.status === "NOT_AUTHORIZED")) {
      var c = j.code || code, m = String(j.message || j.error || "");
      if (c === 401 || c === 403 || /api ?key/i.test(m)) return { error: "API key problem" };
      if (c === 429 || /exceeded|limit|credits/i.test(m)) return { error: "Rate limit reached" };
      return { error: "API error " + (c || "") };
    }
    if (isSet(code) && String(code) !== "200") return { error: "HTTP " + code };
    return { json: j };
  }

  function readQuote(sym, j) {                       // Twelve Data /quote
    if (!j || String(j.symbol || "").toUpperCase() !== sym) return { error: "Wrong symbol in response" };
    if (j.currency && j.currency !== "USD") return { error: "Not a USD listing" };
    var price = num(j.close), chg = num(j.change), pct = num(j.percent_change);
    if (!(price > 0) || !isFinite(chg) || !isFinite(pct)) return { error: "Incomplete quote" };
    var d = /^\d{4}-\d\d-\d\d/.test(String(j.datetime)) ? String(j.datetime).slice(0, 10) : "";
    return { q: { p: price, c: chg, pc: pct, d: d, open: j.is_market_open === true || j.is_market_open === "true" } };
  }
  function readSeries(sym, j) {                      // Twelve Data /time_series 1day
    if (!j || !j.meta || String(j.meta.symbol || "").toUpperCase() !== sym) return { error: "Wrong symbol in history" };
    var bars = (j.values || []).map(function (v) { return { d: String(v.datetime).slice(0, 10), c: num(v.close) }; })
      .filter(function (b) { return /^\d{4}-\d\d-\d\d$/.test(b.d) && b.c > 0; })
      .sort(function (a, b) { return a.d < b.d ? -1 : 1; });
    return bars.length ? { bars: bars.slice(-6) } : { error: "No history" };
  }
  function readBars(sym, j) {                        // Massive daily aggregates
    if (!j || String(j.ticker || "").toUpperCase() !== sym) return { error: "Wrong symbol in response" };
    if (j.status !== "OK" && j.status !== "DELAYED") return { error: "Unexpected status " + j.status };
    var bars = (j.results || []).filter(function (b) { return num(b.c) > 0 && num(b.t) > 0; })
      .map(function (b) { return { d: nyParts(num(b.t)).ymd, c: num(b.c) }; })
      .sort(function (a, b) { return a.d < b.d ? -1 : 1; });
    return bars.length ? { bars: bars.slice(-6) } : { error: "No bars" };
  }

  // stored formats: Nexus_<sym> = "P;C;PC;DIR;QUOTEDATE"  NexusBars_<SYM> = "date:close,..."
  function encodeBars(bars) { return bars.map(function (b) { return b.d + ":" + b.c; }).join(","); }
  function decodeBars(s) {
    return str(s).split(",").map(function (x) { var k = x.split(":"); return { d: k[0], c: num(k[1]) }; })
      .filter(function (b) { return /^\d{4}-\d\d-\d\d$/.test(b.d) && b.c > 0; });
  }
  function signed(v, digits, suffix) {
    var s = Math.abs(v).toFixed(digits);
    if (Number(s) === 0) return (0).toFixed(digits) + (suffix || "");
    return (v > 0 ? "+" : MINUS) + s + (suffix || "");
  }
  // The change field is sent ready to display ("▲ +2.69"), because KLWP's "+"
  // operator would turn "+2.69" into a number and drop the sign.
  function encodeQuote(q) {
    var r2 = Number(q.c.toFixed(2));
    var arrow = r2 > 0 ? "\u25B2 " : r2 < 0 ? "\u25BC " : "";
    return [q.p.toFixed(2), arrow + signed(q.c, 2), signed(q.pc, 2, "%"),
            r2 > 0 ? "1" : r2 < 0 ? "-1" : "0", q.d || "-"].join(";");
  }
  function quoteFromBars(bars) {
    if (bars.length < 2) return null;
    var c = bars[bars.length - 1].c, p = bars[bars.length - 2].c;
    return { p: c, c: c - p, pc: (c - p) / p * 100, d: bars[bars.length - 1].d, open: false };
  }

  // ------------------------------------------------------------ chart
  function niceUp(v) {
    var steps = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 10, 12.5, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 300, 500, 1000];
    for (var i = 0; i < steps.length; i++) if (steps[i] >= v * 1.05) return steps[i];
    return Math.ceil(v / 1000) * 1000;
  }
  function pctLabel(v) {
    var s = (Math.round(Math.abs(v) * 10) / 10).toString();
    return (v > 0 ? "+" : v < 0 ? MINUS : "") + s + "%";
  }
  function r1(v) { return (Math.round(v * 10) / 10).toString(); }

  // Daily closes, with today's latest quote as the newest point when it is newer.
  function sessions(bars, quote) {
    var out = bars.slice();
    if (quote && quote.d) {
      if (!out.length || quote.d > out[out.length - 1].d) out.push({ d: quote.d, c: quote.p });
      else if (quote.d === out[out.length - 1].d) out[out.length - 1] = { d: quote.d, c: quote.p };
    }
    return out;
  }

  // One common % scale for all five lines; each line starts at 0% on the first of the 5 sessions.
  function buildChart(seriesBySym) {
    var all = {};
    SYMBOLS.forEach(function (s) { (seriesBySym[s] || []).forEach(function (b) { all[b.d] = 1; }); });
    var days = Object.keys(all).sort().slice(-5);
    if (!days.length) return null;
    var lines = SYMBOLS.map(function (s) {
      var map = {}; (seriesBySym[s] || []).forEach(function (b) { map[b.d] = b.c; });
      var base = null, last = null, out = [];
      days.forEach(function (d, i) {
        if (map[d] !== undefined) last = map[d];            // missing session: repeat previous close
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
    var x = function (i) { return n === 1 ? 50 : 10 + i / (n - 1) * 80; };   // under the 5 day labels
    var paths = lines.map(function (l) {
      if (!l.length) return "M 0,0";
      if (l.length === 1) return "M " + r1(x(l[0].i)) + "," + r1(y(l[0].v)) + " L " + r1(x(l[0].i) + 0.1) + "," + r1(y(l[0].v));
      return l.map(function (p, k) { return (k ? "L " : "M ") + r1(x(p.i)) + "," + r1(y(p.v)); }).join(" ");
    });
    var zy = y(0);
    paths.push("M 0," + r1(zy) + " L 100," + r1(zy));
    var labels = days.map(function (d) { return DAYS[weekdayOf(d)]; });
    while (labels.length < 5) labels.push("");
    return { paths: paths, meta: [zy < 12 ? "" : pctLabel(hi), zy > 88 ? "" : pctLabel(lo), r1(zy)].concat(labels),
             last: days[days.length - 1] };
  }

  // ------------------------------------------------------------ 3. finish
  function finish(env) {
    var now = env.now();
    var prov = providerOf(env);
    var planned = [];
    try { planned = JSON.parse(str(env.global("NexusPlan")) || "[]"); } catch (e) { planned = []; }
    var errs = [], okQuotes = 0, okAny = 0, anyOpen = false, histOkCount = 0;

    planned.forEach(function (p, idx) {
      var kind = p[0], sym = p[1];
      var raw = str(env.global("NexusRaw" + (idx + 1)));
      var cut = raw.indexOf(SEP);
      var res = parse(cut >= 0 ? raw.slice(0, cut) : "", cut >= 0 ? raw.slice(cut + SEP.length) : "");
      if (!res.error) {
        res = kind === "quote" ? readQuote(sym, res.json) : kind === "series" ? readSeries(sym, res.json) : readBars(sym, res.json);
      }
      if (res.error) { errs.push(sym + (kind === "series" ? " history" : "") + ": " + res.error); return; }
      okAny++;
      if (res.q) {
        okQuotes++; if (res.q.open) anyOpen = true;
        env.setGlobal(varName(sym), encodeQuote(res.q));
      } else {
        env.setGlobal("NexusBars_" + sym, encodeBars(res.bars));
        histOkCount++;
        if (kind === "bars") {                        // Massive: price/change from the last two closes
          var q = quoteFromBars(res.bars);
          if (q) { okQuotes++; env.setGlobal(varName(sym), encodeQuote(q)); }
        }
      }
    });
    // history counts as done for today if at least one symbol's history arrived
    if (histOkCount > 0) env.setGlobal("NexusHistDay", nyParts(now).ymd);

    // build chart from stored closes + latest stored quotes
    var series = {}, haveAny = false;
    SYMBOLS.forEach(function (s) {
      var bars = decodeBars(env.global("NexusBars_" + s));
      var qs = str(env.global(varName(s))).split(";");
      var quote = qs.length >= 5 && num(qs[0]) > 0 && /^\d{4}-\d\d-\d\d$/.test(qs[4]) ? { p: num(qs[0]), d: qs[4] } : null;
      series[s] = prov === "twelvedata" ? sessions(bars, quote) : bars;
      if (series[s].length || quote) haveAny = true;
    });
    var ch = haveAny ? buildChart(series) : null;
    if (ch) {
      env.setGlobal("NexusChart", ch.paths.join("|"));
      env.setGlobal("NexusChartMeta", ch.meta.join("|"));
      env.setGlobal("NexusSession", sessionLabel(ch.last));
    }

    if (planned.length && !okAny) {                  // everything failed: keep all old data
      env.setGlobal("NexusState", "ERROR");
      env.setGlobal("NexusMsg", clean(errs.join(", ") || "No data"));
      publish(env); return false;
    }
    if (okQuotes) {
      env.setGlobal("NexusTs", String(Math.floor(now / 1000)));
      env.setGlobal("NexusUpd", updatedLabel(now));
      env.setGlobal("NexusState", prov === "massive" ? "EOD" : anyOpen ? "OPEN" : "CLOSED");
    }
    env.setGlobal("NexusMsg", clean(errs.length ? "Partly updated: " + errs.join(", ") : ""));
    publish(env);
    return true;
  }

  function publish(env) {
    var cm = str(env.global("NexusChartMeta")).split("|");
    while (cm.length < 8) cm.push("");
    var meta = [str(env.global("NexusTs")) || "0", str(env.global("NexusState")) || "ERROR",
                str(env.global("NexusUpd")) || "--:--"].concat(cm.slice(0, 8))
      .concat([clean(str(env.global("NexusMsg"))), str(env.global("NexusSession")),
               PROVIDERS[providerOf(env)].label]);
    // KLWP's tc(split) skips empty fields, which would shift every later field:
    // empty values are sent as "-" and KLWP shows them as blank.
    meta = meta.map(function (f) { return f === "" ? "-" : f; });
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
    SYMBOLS: SYMBOLS, SEP: SEP, PROVIDERS: PROVIDERS, nyParts: nyParts, inMarketHours: inMarketHours,
    lastCloseEpoch: lastCloseEpoch, plan: plan, credits: credits, parse: parse, finish: finish,
    buildChart: buildChart, sessions: sessions, publish: publish, varName: varName, taskerEnv: taskerEnv
  };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = NX; }
