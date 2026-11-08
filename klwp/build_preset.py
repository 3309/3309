#!/usr/bin/env python3
"""Build klwp/NEXUS.klwp (a ZIP containing preset.json + fonts + thumbnails).

Run:  python3 klwp/build_preset.py

Layout units: KLWP lays out on a canvas 720 units wide (a Galaxy S22 at
1080x2340 px gives 720x1560 units). Every coordinate below is in those units.

The same element list also produces klwp/preview.html, a rough desktop preview
with sample values. It only checks the layout; the real result is what KLWP
shows on the phone.

Data contract with Tasker (see config/stocks.md), read with $br(tasker, name)$:
  iwm, spy, qqq, gld, mags   "PRICE;CHG;PCT;DIR[;DATE]"
  nx_chart  6 SVG paths (0-100 box) joined by "|": 5 series + the zero line
  nx_meta   TS|STATE|UPDATED|YMAX|YMIN|ZEROY|D1..D5|MSG|SESSION|PROVIDER

Layout: no title bar. Clock, weather and watchlist hang from the top edge; the
chart and the three buttons hang from the BOTTOM edge with SAFE units kept free
for Samsung's navigation bar (3-button bar = 48 dp = 96 units on a 360 dp wide
screen; gesture bar is smaller). Anchoring to the bottom follows the real
screen height, so nothing is drawn under the navigation bar.
"""
import html
import io
import json
import os
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

W, H = 720, 1560
M = 40                       # side margin
CW = W - 2 * M               # content width (640)

C = {  # palette, #AARRGGBB as KLWP stores it
    "bg": "#FFF5F1E8", "text": "#FF252525", "accent": "#FFE88A42",
    "secondary": "#FF75B9D5", "pos": "#FF39845B", "neg": "#FFDC665D",
    "muted": "#FF8A8478", "purple": "#FF8065A9", "rule": "#FFD9D2C3", "clear": "#00000000",
}
SYMBOLS = ["IWM", "SPY", "QQQ", "GLD", "MAGS"]
VARS = [s.lower() for s in SYMBOLS]                      # KLWP variables: iwm spy qqq gld mags
SERIES = ["#FFE88A42", "#FF252525", "#FF75B9D5", "#FFA89060", "#FF8065A9"]  # orange ink blue gold purple
SAFE = 120          # units kept free above the bottom edge (Samsung navigation bar + margin)

# Preview samples (klwp/samples/*.json, built by tasker/make_sample.js from REAL
# API responses, or empty/error states). Used only for preview.html / PNGs.
_S = None
def use_sample(name):
    global _S
    _S = json.load(open(os.path.join(HERE, "samples", name + ".json"))) if name else None
def _row(i):
    v = (_S or {}).get(VARS[i], "")
    return v.split(";") if v else None
def sq(i, f):          # f: 0 symbol, 1 price, 2 chg, 3 pct, 4 dir
    if f == 0:
        return SYMBOLS[i]
    r = _row(i)
    return r[f - 1] if r else ["--.--", "--.--", "--.--%", "0"][f - 1]
def sm(k):
    m = (_S or {}).get("nx_meta", "")
    return m.split("|")[k] if m else ""
def sc(i):
    c = (_S or {}).get("nx_chart", "")
    return c.split("|")[i] if c else "M 0,0"

FONT_FILES = {
    "regular": "Inter-Regular.otf", "medium": "Inter-Medium.otf",
    "semibold": "Inter-SemiBold.otf", "bold": "Inter-Bold.otf",
    "xbold": "Inter-ExtraBold.otf", "light": "InterDisplay-Light.otf",
}
def font(key):
    return "kfile://org.kustom.provider/fonts/" + FONT_FILES[key]

# ---------------------------------------------------------------- formulas
def Q(i, f):   # field f (0 price, 1 chg, 2 pct, 3 dir) of symbol i
    return f'tc(split, br(tasker, {VARS[i]}), ";", {f})'
def NOQ(i):
    return f'br(tasker, {VARS[i]})=""'
def MT(k):     # field k of meta
    return f'tc(split, br(tasker, nx_meta), "|", {k})'
EOD = f'{MT(13)}="Massive EOD"'
NOMETA = 'br(tasker, nx_meta)=""'
NOCHART = 'br(tasker, nx_chart)=""'

# ---------------------------------------------------------------- modules
preview = []   # (kind, dict) for preview.html

def _pos(mod, x, y, anchor):
    mod["position_anchor"] = anchor
    if anchor == "TOPRIGHT":
        mod["position_padding_right"] = float(x)
    else:
        mod["position_padding_left"] = float(x)
    if anchor.startswith("BOTTOM"):
        mod["position_padding_bottom"] = float(y)      # y = distance from the bottom edge
    else:
        mod["position_padding_top"] = float(y)

def text(title, expr, x, y, size, fkey, color, anchor="TOPLEFT",
         color_formula=None, sample=None, top_formula=None, visible=None, pcolor=None):
    m = {"internal_type": "TextModule", "internal_title": title,
         "text_expression": expr, "text_size": float(size),
         "text_family": font(fkey), "paint_color": color}
    _pos(m, x, y, anchor)
    toggles, formulas = {}, {}
    if color_formula:
        toggles["paint_color"] = 10; formulas["paint_color"] = color_formula
    if top_formula:
        toggles["position_padding_top"] = 10; formulas["position_padding_top"] = top_formula
    if visible:
        toggles["config_visible"] = 10; formulas["config_visible"] = visible
    if toggles:
        m["internal_toggles"] = toggles; m["internal_formulas"] = formulas
    preview.append(("text", dict(x=x, y=y, size=size, f=fkey, color=pcolor or color,
                                 anchor=anchor, s=sample if sample is not None else expr)))
    return m

def rect(title, x, y, w, h, color, corners=0, stroke=None, anchor="TOPLEFT", events=None):
    m = {"internal_type": "ShapeModule", "internal_title": title, "shape_type": "RECT",
         "shape_width": float(w), "shape_height": float(h), "paint_color": color}
    if corners:
        m["shape_corners"] = float(corners)
    if stroke:
        m["paint_style"] = "STROKE"; m["paint_stroke"] = float(stroke)
    _pos(m, x, y, anchor)
    if events:
        m["internal_events"] = events
    preview.append(("rect", dict(x=x, y=y, w=w, h=h, color=color, corners=corners,
                                 stroke=stroke, anchor=anchor)))
    return m

def circle(title, x, y, d, color):
    m = {"internal_type": "ShapeModule", "internal_title": title, "shape_type": "CIRCLE",
         "shape_width": float(d), "shape_height": float(d), "paint_color": color}
    _pos(m, x, y, "TOPLEFT")
    preview.append(("circle", dict(x=x, y=y, d=d, color=color)))
    return m

def path(title, x, y, w, h, color, path_formula, stroke=4, fill=False, sample=""):
    m = {"internal_type": "ShapeModule", "internal_title": title, "shape_type": "PATH",
         "shape_width": float(w), "shape_height": float(h), "paint_color": color,
         "shape_path": "M 0,0",
         "internal_toggles": {"shape_path": 10},
         "internal_formulas": {"shape_path": path_formula}}
    if not fill:
        m["paint_style"] = "STROKE"; m["paint_stroke"] = float(stroke)
    _pos(m, x, y, "TOPLEFT")
    preview.append(("path", dict(x=x, y=y, w=w, h=h, color=color, stroke=stroke,
                                 fill=fill, d=sample)))
    return m

def group(title, items, stack=None, margin=0, x=0, y=0, events=None):
    m = {"internal_type": "StackLayerModule" if stack else "OverlapLayerModule",
         "internal_title": title, "viewgroup_items": items}
    if stack:
        m["config_stacking"] = stack; m["config_margin"] = float(margin)
        _pos(m, x, y, "TOPLEFT")
    if events:
        m["internal_events"] = events
    return m

def box(title, x, y, w, h, build_children, events=None, bottom=None):
    """Overlap layer at (x, y) whose size is fixed by an invisible w*h rect.
    Children use coordinates relative to the box: TOPLEFT/TOP from its top-left,
    TOPRIGHT from its right edge. With bottom=N the box hangs N units above the
    screen's bottom edge (y is then only used for the preview)."""
    start = len(preview)
    kids = [rect(title + " area", 0, 0, w, h, "#01F5F1E8" if events else C["clear"])]
    kids += build_children()
    for kind, d in preview[start:]:
        d["x"] = d["x"] + (W - x - w if d.get("anchor") == "TOPRIGHT" else x)
        d["y"] = d["y"] + y
    m = {"internal_type": "OverlapLayerModule", "internal_title": title, "viewgroup_items": kids}
    if bottom is None:
        _pos(m, x, y, "TOPLEFT")
    else:
        _pos(m, x, bottom, "BOTTOMLEFT")
    if events:
        m["internal_events"] = events
    return m

def ctext(title, expr, w, y, size, fkey, color, **kw):
    """Text centred horizontally inside a box of width w (relative y)."""
    m = text(title, expr, w / 2, y, size, fkey, color, anchor="TOP", **kw)
    m.pop("position_padding_left", None)
    return m

def launch(action, intent):
    return [{"type": "SINGLE_TAP", "action": action, "intent": intent}]

# ---------------------------------------------------------------- 1 clock
def clock():
    y0 = 14        # no title bar: the clock is the first thing on screen (status bar sits above ~y 50)
    items = []
    # time + AM/PM in a bottom-aligned horizontal stack
    t = text("Time", "$df(h:mm)$", 0, 0, 170, "light", C["text"], sample="10:24")
    ap = text("AM/PM", "$df(a)$", 0, 0, 44, "medium", C["muted"], sample="AM")
    preview[-2][1].update(x=M, y=y0 + 50); preview[-1][1].update(x=M + 400, y=y0 + 168)
    for mod in (t, ap):
        for k in ("position_anchor", "position_padding_left", "position_padding_top"):
            mod.pop(k, None)
    items.append(group("Time row", [t, ap], stack="HORIZONTAL_BOTTOM", margin=10, x=M - 6, y=y0 + 50))
    items += [
        text("Weekday", "$df(EEEE)$", M, y0 + 236, 42, "bold", C["text"], sample="Sunday"),
        text("Date", '$df("d MMMM yyyy")$', M, y0 + 292, 29, "regular", C["muted"], sample="8 November 2026"),
    ]
    return items

# ---------------------------------------------------------------- 2 weather
P = {
    "none": "M 0,0",
    "sun": ("M 32,50 A 18,18 0 1,1 68,50 A 18,18 0 1,1 32,50 Z "
            "M 50,6 L 50,18 M 50,82 L 50,94 M 6,50 L 18,50 M 82,50 L 94,50 "
            "M 19,19 L 27,27 M 73,73 L 81,81 M 19,81 L 27,73 M 73,27 L 81,19"),
    "sun_small": ("M 22,34 A 12,12 0 1,1 46,34 A 12,12 0 1,1 22,34 Z "
                  "M 34,8 L 34,15 M 8,34 L 15,34 M 16,16 L 21,21 M 52,16 L 47,21"),
    "cloud": "M 26,76 L 74,76 A 14,14 0 0,0 77,48 A 22,22 0 0,0 35,46 A 15,15 0 0,0 26,76 Z",
    "cloud_p": "M 38,86 L 82,86 A 12,12 0 0,0 84,62 A 19,19 0 0,0 47,60 A 13,13 0 0,0 38,86 Z",
    "cloud_up": "M 26,62 L 74,62 A 14,14 0 0,0 77,34 A 22,22 0 0,0 35,32 A 15,15 0 0,0 26,62 Z",
    "drops": "M 37,74 L 33,90 M 53,74 L 49,90 M 69,74 L 65,90",
    "flakes": "M 34,76 L 34,80 M 50,82 L 50,86 M 66,76 L 66,80 M 42,90 L 42,94 M 58,90 L 58,94",
}
RAINY = ["TSTORM", "TSHOWER", "SHOWER", "RAIN", "TORNADO"]
SNOWY = ["SLEET", "LSNOW", "SNOW", "HAIL"]

def is_any(i, codes):
    return " | ".join(f'wf(icon, {i})="{c}"' for c in codes)

def icon_formulas(i):
    clear = f'wf(icon, {i})="CLEAR"'
    part = f'wf(icon, {i})="PCLOUDY"'
    wet = is_any(i, RAINY + SNOWY)
    sun = f'$if({clear}, "{P["sun"]}", {part}, "{P["sun_small"]}", "{P["none"]}")$'
    cloud = (f'$if({clear}, "{P["none"]}", {part}, "{P["cloud_p"]}", '
             f'{wet}, "{P["cloud_up"]}", "{P["cloud"]}")$')
    drops = (f'$if({is_any(i, RAINY)}, "{P["drops"]}", '
             f'{is_any(i, SNOWY)}, "{P["flakes"]}", "{P["none"]}")$')
    return sun, cloud, drops

SAMPLE_ICONS = ["CLEAR", "PCLOUDY", "RAIN", "MCLOUDY", "CLEAR"]
def sample_icon(code):
    sun = {"CLEAR": P["sun"], "PCLOUDY": P["sun_small"]}.get(code, P["none"])
    cloud = {"CLEAR": P["none"], "PCLOUDY": P["cloud_p"], "RAIN": P["cloud_up"]}.get(code, P["cloud"])
    drops = P["drops"] if code == "RAIN" else P["none"]
    return sun, cloud, drops

def weather():
    y0 = 372
    colw = CW / 5
    items = [
        text("Weather label", "5-DAY FORECAST", M, y0, 19, "semibold", C["muted"]),
        text("Weather label rain", "RAIN %", M, y0, 19, "semibold", C["muted"], anchor="TOPRIGHT"),
        rect("Weather rule", M, y0 + 34, CW, 2, C["rule"]),
    ]
    yc = y0 + 56
    sample_days = [("SUN", "8 Nov"), ("MON", "9 Nov"), ("TUE", "10 Nov"), ("WED", "11 Nov"), ("THU", "12 Nov")]
    for i in range(5):
        x = M + colw * i
        if i:
            items.append(rect(f"Weather divider {i}", x, yc, 2, 214, C["rule"]))
        day = "$tc(up, df(EEE))$" if i == 0 else f"$tc(up, df(EEE, a{i}d))$"
        date = '$df("d MMM")$' if i == 0 else f'$df("d MMM", a{i}d)$'
        sun, cloud, drops = icon_formulas(i)
        s_sun, s_cloud, s_drops = sample_icon(SAMPLE_ICONS[i])

        def kids(i=i, day=day, date=date, sun=sun, cloud=cloud, drops=drops,
                 s_sun=s_sun, s_cloud=s_cloud, s_drops=s_drops):
            ix, iy, isz = colw / 2 - 26, 62, 52
            return [
                ctext(f"Day {i}", day, colw, 0, 23, "bold", C["text"], sample=sample_days[i][0]),
                ctext(f"Date {i}", date, colw, 30, 20, "regular", C["muted"], sample=sample_days[i][1]),
                path(f"Icon sun {i}", ix, iy, isz, isz, C["accent"], sun, stroke=4, sample=s_sun),
                path(f"Icon cloud fill {i}", ix, iy, isz, isz, C["bg"], cloud, fill=True, sample=s_cloud),
                path(f"Icon cloud {i}", ix, iy, isz, isz, C["text"], cloud, stroke=4, sample=s_cloud),
                path(f"Icon drops {i}", ix, iy, isz, isz, C["secondary"], drops, stroke=4, sample=s_drops),
                ctext(f"High {i}", f"$wf(max, {i})$°", colw, 122, 31, "bold", C["text"], sample="--°"),
                ctext(f"Low {i}", f"$wf(min, {i})$°", colw, 160, 24, "regular", C["muted"], sample="--°"),
                ctext(f"Rain {i}", f"$wf(rainc, {i})$%", colw, 192, 21, "semibold", C["secondary"], sample="--%"),
            ]
        items.append(box(f"Weather day {i}", x, yc, colw, 214, kids))
    return items

# ---------------------------------------------------------------- 3 watchlist
def stocks():
    y0 = 668
    items = [
        text("Label", "WATCHLIST", M, y0, 19, "semibold", C["muted"]),
        text("Label eod", f'$if({EOD}, "END OF DAY", "LATEST")$', M, y0, 19, "semibold", C["muted"], anchor="TOPRIGHT",
             sample="END OF DAY" if sm(13) == "Massive EOD" else "LATEST"),
        text("H symbol", "SYMBOL", M, y0 + 36, 18, "semibold", C["muted"]),
        text("H price", f'$if({EOD}, "CLOSE", "PRICE")$', 340, y0 + 36, 18, "semibold", C["muted"], anchor="TOPRIGHT",
             sample="CLOSE" if sm(13) == "Massive EOD" else "PRICE"),
        text("H chg", "CHG $", 180, y0 + 36, 18, "semibold", C["muted"], anchor="TOPRIGHT"),
        text("H pct", "CHG %", M, y0 + 36, 18, "semibold", C["muted"], anchor="TOPRIGHT"),
    ]
    color = lambda i: (f'$if({NOQ(i)}, "{C["muted"]}", {Q(i, 3)}>0, "{C["pos"]}", '
                       f'{Q(i, 3)}<0, "{C["neg"]}", "{C["muted"]}")$')
    pc = lambda i: {"1": C["pos"], "-1": C["neg"]}.get(sq(i, 4), C["muted"])
    for i, sym in enumerate(SYMBOLS):
        y = y0 + 72 + 44 * i
        items += [
            rect(f"Row rule {i}", M, y, CW, 2, C["rule"]),
            circle(f"Dot {i}", M, y + 15, 16, SERIES[i]),
            text(f"Symbol {i}", sym, M + 28, y + 7, 27, "bold", C["text"], sample=sym),
            text(f"Price {i}", f'$if({NOQ(i)}, "--.--", {Q(i, 0)})$', 340, y + 7, 27, "regular", C["text"],
                 anchor="TOPRIGHT", sample=sq(i, 1)),
            text(f"Change {i}",
                 f'$if({NOQ(i)}, "--.--", {Q(i, 3)}<0, "▼ " + {Q(i, 1)}, {Q(i, 3)}>0, "▲ " + {Q(i, 1)}, {Q(i, 1)})$',
                 180, y + 7, 27, "semibold", C["muted"], anchor="TOPRIGHT",
                 color_formula=color(i), pcolor=pc(i), sample=("▼ " if sq(i, 4) == "-1" else "▲ ") + sq(i, 2) if sq(i, 4) != "0" else sq(i, 2)),
            text(f"Percent {i}", f'$if({NOQ(i)}, "--.--%", {Q(i, 2)})$', M, y + 7, 27, "semibold", C["muted"],
                 anchor="TOPRIGHT", color_formula=color(i), pcolor=pc(i), sample=sq(i, 3)),
        ]
    return items

# ---------------------------------------------------------------- 4 chart

def chart_items():
    """Chart, legend and footer. Coordinates are relative to the bottom block
    (x from its left edge, TOPRIGHT x from its right edge, y from its top)."""
    y0 = 0
    px, py, pw, ph = 52, y0 + 40, CW - 52, 184
    items = [
        text("Chart label", "LAST 5 SESSIONS", 0, y0, 19, "semibold", C["muted"]),
        text("Chart label unit", "% FROM FIRST CLOSE", 0, y0, 19, "semibold", C["muted"], anchor="TOPRIGHT"),
        rect("Grid top", px, py, pw, 2, C["rule"]),
        rect("Grid bottom", px, py + ph, pw, 2, C["rule"]),
        path("Zero line", px, py, pw, ph, "#FFBDB5A5", f'$tc(split, br(tasker, nx_chart), "|", 5)$',
             stroke=2, sample=sc(5)),
        text("Y max", f'$if({NOMETA}, "", {MT(3)})$', 0, py - 9, 17, "regular", C["muted"], sample=sm(3)),
        text("Y min", f'$if({NOMETA}, "", {MT(4)})$', 0, py + ph - 9, 17, "regular", C["muted"], sample=sm(4)),
        text("Y zero", f'$if({NOMETA}, "", "0%")$', 0,
             (py - 9 + ph * float(sm(5)) / 100) if sm(5) else py + ph / 2 - 9, 17, "regular", C["muted"],
             top_formula=f'$if({NOMETA}, {py + ph / 2 - 9}, {py - 9} + {ph} * {MT(5)} / 100)$',
             sample="0%" if sm(5) else ""),
    ]
    for i in range(5):
        items.append(path(f"Line {SYMBOLS[i]}", px, py, pw, ph, SERIES[i],
                          f'$tc(split, br(tasker, nx_chart), "|", {i})$',
                          stroke=4 if i != 1 else 3.2, sample=sc(i)))
    for k in range(5):
        bw = pw / 5
        items.append(box(f"Chart day {k}", px + bw * k, py + ph + 12, bw, 24, lambda k=k, bw=bw: [
            ctext(f"Day label {k}", f'$if({NOMETA}, "", {MT(6 + k)})$', bw, 0, 17, "regular", C["muted"],
                  sample=sm(6 + k))]))
    waiting = box("Chart waiting", px, py + ph / 2 - 16, pw, 32, lambda: [
        ctext("Waiting", "Waiting for stock data from Tasker", pw, 0, 22, "medium", C["muted"],
              sample="" if sc(0) != "M 0,0" or sm(1) else "Waiting for stock data from Tasker")])
    waiting["internal_toggles"] = {"config_visible": 10}
    waiting["internal_formulas"] = {"config_visible": f"$if({NOCHART}, ALWAYS, REMOVE)$"}
    items.append(waiting)
    # compact legend: one swatch + symbol per line, same colours as the rows
    ly = y0 + 264
    for i, sym in enumerate(SYMBOLS):
        x = (CW / 5) * i
        items += [rect(f"Legend swatch {i}", x, ly + 12, 24, 6, SERIES[i], corners=3),
                  text(f"Legend {i}", sym, x + 32, ly, 20, "bold", C["text"])]
    # footer: last update (with data source) and status
    fy = y0 + 300
    stale = (f'({MT(1)}="OPEN" & df(S) - {MT(0)} > 2700) | ({MT(1)}="EOD" & df(S) - {MT(0)} > 129600) | '
             f'({MT(1)}="CLOSED" & df(S) - {MT(0)} > 345600)')
    status = (f'$if({NOMETA}, "Not connected yet", {MT(1)}="ERROR", "● Error · last data kept", '
              f'{stale}, "● Stale data", {MT(1)}="OPEN", "● Market open", {MT(1)}="EOD", "● Close of " + {MT(12)}, '
              f'"Market closed · " + {MT(12)})$')
    status_c = (f'$if({NOMETA}, "{C["muted"]}", {MT(1)}="ERROR", "{C["neg"]}", {stale}, "{C["accent"]}", '
                f'{MT(1)}="OPEN" | {MT(1)}="EOD", "{C["pos"]}", "{C["muted"]}")$')
    st = sm(1)
    s_status = {"": "Not connected yet", "ERROR": "● Error · last data kept", "OPEN": "● Market open",
                "EOD": "● Close of " + sm(12)}.get(st, "Market closed · " + sm(12))
    s_color = {"": C["muted"], "ERROR": C["neg"], "OPEN": C["pos"], "EOD": C["pos"]}.get(st, C["muted"])
    items += [
        text("Updated", f'$if({NOMETA}, "Updated --:--", "Updated " + {MT(2)} + " · " + {MT(13)})$', 0, fy, 19,
             "regular", C["muted"], sample=("Updated " + sm(2) + " · " + sm(13)) if sm(2) else "Updated --:--"),
        text("Status", status, 0, fy, 19, "semibold", C["muted"], anchor="TOPRIGHT",
             color_formula=status_c, pcolor=s_color, sample=s_status),
    ]
    return items

# ---------------------------------------------------------------- 5 buttons
INTENT_PHONE = ("intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;"
                "launchFlags=0x10200000;component=com.samsung.android.dialer/.DialtactsActivity;"
                "S.org.kustom.intent.label=Phone;end")
INTENT_SMS = ("intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;"
              "launchFlags=0x10200000;component=com.samsung.android.messaging/com.android.mms.ui.ConversationComposer;"
              "S.org.kustom.intent.label=Messages;end")
INTENT_DRAWER = ("intent:#Intent;action=com.teslacoilsw.launcher.ACTION;launchFlags=0x10000000;"
                 "component=com.teslacoilsw.launcher/.NovaShortcutHandler;S.LAUNCHER_ACTION=APP_DRAWER;"
                 "S.org.kustom.intent.label=App%20drawer;end")

BUTTONS_Y, BUTTON_H, BLOCK_H = 336, 72, 408      # inside the bottom block

def button_items():
    gap = 16
    bw = (CW - 2 * gap) / 3
    items = []
    for i, (label, action, intent) in enumerate([
            ("Phone", "LAUNCH_APP", INTENT_PHONE),
            ("Messages", "LAUNCH_APP", INTENT_SMS),
            ("All apps", "LAUNCH_SHORTCUT", INTENT_DRAWER)]):
        x = (bw + gap) * i
        items.append(box(f"Button {label}", x, BUTTONS_Y, bw, BUTTON_H, lambda label=label: [
            rect(f"{label} outline", 0, 0, bw, BUTTON_H, C["text"], corners=BUTTON_H / 2, stroke=2.5),
            ctext(f"{label} label", label, bw, 20, 26, "semibold", C["text"]),
        ], events=launch(action, intent)))
    return items

def bottom_block():
    """Chart + legend + footer + buttons, hanging SAFE units above the real bottom
    edge of the screen, so the buttons never sit under the navigation bar."""
    top = H - SAFE - BLOCK_H                     # where it lands on a 720x1560 (S22) screen, for the preview
    return [box("Bottom block (chart + buttons)", M, top, CW, BLOCK_H,
                lambda: chart_items() + button_items(), bottom=SAFE)]

# ---------------------------------------------------------------- assemble
def build():
    root = {
        "internal_type": "RootLayerModule",
        "background_type": "SOLID",
        "background_color": C["bg"],
        "viewgroup_items": clock() + weather() + stocks() + bottom_block(),
    }
    return {
        "preset_info": {
            "version": 13, "title": "NEXUS",
            "description": "Markets & weather dashboard: clock, 5-day forecast, IWM SPY QQQ GLD MAGS, 5-session chart.",
            "author": "NEXUS", "email": "", "archive": "",
            "features": "LOCATION WEATHER", "release": 376417910,
            "locked": False, "pflags": 0,
            "width": 1080, "height": 2340, "xscreens": 2, "yscreens": 0,  # 3 Nova pages
        },
        "preset_root": root,
    }

def thumbnails():
    """Portrait/landscape JPEG thumbnails from the rendered real-data preview."""
    png = os.path.join(HERE, "previews", "1-real-data.png")
    try:
        from PIL import Image
        im = Image.open(png).convert("RGB")
        p = io.BytesIO(); im.resize((360, 780)).save(p, "JPEG", quality=85)
        l = io.BytesIO(); Image.new("RGB", (780, 360), (245, 241, 232)).save(l, "JPEG", quality=85)
        return p.getvalue(), l.getvalue()
    except Exception as e:  # pragma: no cover
        raise SystemExit(f"Pillow + mockup PNG needed for thumbnails: {e}")

def write_preview(path_out, caption=""):
    fam = {"regular": ("Inter", 400), "medium": ("Inter", 500), "semibold": ("Inter", 600),
           "bold": ("Inter", 700), "xbold": ("Inter", 800), "light": ("Inter Display", 300)}
    css = lambda c: "#" + c[3:] if c.startswith("#FF") or len(c) == 9 else c
    out = []
    for kind, d in preview:
        if kind == "text":
            f, wgt = fam[d["f"]]
            style = f"font-family:'{f}';font-weight:{wgt};font-size:{d['size']}px;color:{css(d['color'])};top:{d['y']}px;"
            if d["anchor"] == "TOPRIGHT":
                style += f"right:{d['x']}px;"
            elif d["anchor"] == "TOP":
                style += f"left:{d['x']}px;transform:translateX(-50%);"
            else:
                style += f"left:{d['x']}px;"
            out.append(f'<div class="t" style="{style}">{html.escape(str(d["s"]))}</div>')
        elif kind == "rect":
            side = "right" if d["anchor"] == "TOPRIGHT" else "left"
            border = f"border:{d['stroke']}px solid {css(d['color'])};" if d["stroke"] else f"background:{css(d['color'])};"
            if d["color"][:3] in ("#01", "#00"):
                border = ""
            out.append(f'<div style="position:absolute;{side}:{d["x"]}px;top:{d["y"]}px;width:{d["w"]}px;'
                       f'height:{d["h"]}px;border-radius:{d["corners"]}px;box-sizing:border-box;{border}"></div>')
        elif kind == "circle":
            out.append(f'<div style="position:absolute;left:{d["x"]}px;top:{d["y"]}px;width:{d["d"]}px;'
                       f'height:{d["d"]}px;border-radius:50%;background:{css(d["color"])}"></div>')
        elif kind == "path":
            sw = d["stroke"] * 100 / d["w"]
            paint = (f'fill="{css(d["color"])}" stroke="none"' if d["fill"]
                     else f'fill="none" stroke="{css(d["color"])}" stroke-width="{sw:.2f}" vector-effect="none"')
            out.append(f'<svg style="position:absolute;left:{d["x"]}px;top:{d["y"]}px" width="{d["w"]}" '
                       f'height="{d["h"]}" viewBox="0 0 100 100" preserveAspectRatio="none">'
                       f'<path d="{d["d"]}" {paint} stroke-linecap="round" stroke-linejoin="round"/></svg>')
    # Not part of the wallpaper: shows where Samsung's 3-button navigation bar (48 dp) sits.
    nav = 96
    out.append(f'<div style="position:absolute;left:0;right:0;bottom:0;height:{nav}px;background:rgba(37,37,37,.10);'
               f'border-top:2px dashed rgba(37,37,37,.35);font:600 15px Inter;color:#8A8478;display:flex;'
               f'align-items:center;justify-content:center">Samsung navigation bar area (not part of the wallpaper)</div>')
    if caption:
        out.append(f'<div style="position:absolute;left:0;right:0;top:0;height:40px;background:#252525;color:#F5F1E8;'
                   f'font:600 16px Inter;display:flex;align-items:center;justify-content:center">{html.escape(caption)}</div>')
    doc = f"""<!doctype html><html><head><meta charset="utf-8"><title>NEXUS Preview</title>
<style>body{{margin:0;background:#F5F1E8}}#c{{position:relative;width:{W}px;height:{H}px;overflow:hidden}}
.t{{position:absolute;white-space:nowrap;line-height:1.2}}</style></head>
<body><div id="c">{''.join(out)}</div></body></html>"""
    open(path_out, "w").write(doc)

PREVIEWS = [  # (sample file, caption shown on the preview image)
    ("1-real-data", "Preview 1: real end-of-day data (Massive, close of Fri 6 Nov 2026)"),
    ("2-error", "Preview 2: update failed, last good data kept"),
    ("3-first-run", "Preview 3: first start, before Tasker has sent data"),
]

def main():
    import subprocess
    use_sample(None); preview.clear()
    preset = build()                           # the preset never depends on preview samples
    pj = json.dumps(preset, indent=2, ensure_ascii=False)
    json.loads(pj)
    os.makedirs(os.path.join(HERE, "previews"), exist_ok=True)
    for name, caption in PREVIEWS:
        use_sample(name); preview.clear(); build()
        write_preview(os.path.join(HERE, "previews", name + ".html"), caption)
    use_sample(None); preview.clear()
    subprocess.run(["node", os.path.join(HERE, "render_previews.js")], check=True)
    thumb_p, thumb_l = thumbnails()
    out = os.path.join(HERE, "NEXUS.klwp")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("preset.json", pj)
        z.writestr("preset_thumb_portrait.jpg", thumb_p)
        z.writestr("preset_thumb_landscape.jpg", thumb_l)
        for f in FONT_FILES.values():
            z.write(os.path.join(HERE, "fonts", f), "fonts/" + f)
    open(os.path.join(HERE, "preset.json"), "w").write(pj)  # readable copy for review
    print(f"wrote {out} ({os.path.getsize(out)//1024} KB)")

if __name__ == "__main__":
    main()
