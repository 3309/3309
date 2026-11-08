#!/usr/bin/env python3
"""Build tasker/NEXUS.prj.xml, an importable Tasker project (CANDIDATE: not yet
verified by importing it on the phone).

Run:  python3 tasker/build_tasker.py

Every action/context layout copies a real Tasker export found in public
repositories (Tasker 4.9-6.7): HTTP Request (339), JavaScriptlet (129),
Variable Set (547), Wait (30, with a variable number of seconds), Display State
context (123), a repeating Time context, and the KLWP "Kustom Variable" plugin
action (org.kustom.wallpaper / EditVarActivity, code 703953103).

Task:    NEXUS_Update_Market
Profile: "NEXUS check (screen on)": every 10 min while the screen is on. The
         script decides whether anything is due (30-min quotes in US market hours,
         once-a-day history), so most checks make no request at all.

Your API key is NOT in this file. Tasker reads it from %NexusKey (created once in
Tasker's VARS tab) and sends it only in the HTTP header
"Authorization: <apikey|Bearer> <key>", never in a URL.
"""
import os
from xml.sax.saxutils import escape

HERE = os.path.dirname(os.path.abspath(__file__))
LIB_FULL = open(os.path.join(HERE, "nexus.js"), encoding="utf-8").read()
# Embedded copy without comment-only lines and indentation (smaller Tasker file).
LIB = "// NEXUS library - source: tasker/nexus.js\n" + "\n".join(
    l.strip() for l in LIB_FULL.splitlines() if l.strip() and not l.strip().startswith("//"))
CDATE = 1793990000000
SLOTS = 10
SEP = "~~NX~~"                       # must match NX.SEP in nexus.js
SYMBOLS = ["iwm", "spy", "qqq", "gld", "mags"]

# %caller1 starts with "profile" when the schedule runs the task; anything else
# (the play button, a home-screen shortcut) counts as a manual refresh.
SNIP_PLAN = """
var nx_plan = NX.plan(NX.taskerEnv(), !/^profile/.test(String(local("caller1"))));
var nx_go = nx_plan.go ? "1" : "0";
var nx_ak = nx_plan.authPrefix;
var nx_why = nx_plan.reason;
""" + "".join(
    f'var nx_d{k} = nx_plan.slots.length >= {k} ? "1" : "0";\n'
    f'var nx_u{k} = nx_plan.slots[{k - 1}] ? nx_plan.slots[{k - 1}].url : "none";\n'
    f'var nx_w{k} = nx_plan.slots[{k - 1}] ? String(nx_plan.slots[{k - 1}].wait) : "0";\n'
    f'var nx_p{k} = (nx_plan.slots[{k - 1}] && nx_plan.slots[{k - 1}].wait > 0) ? "1" : "0";\n'
    for k in range(1, SLOTS + 1))
SNIP_FINISH = "NX.finish(NX.taskerEnv());\n"


def cond(lhs, op, rhs=""):
    # op 0 = equals, 12 = is set (verified against real Tasker exports)
    return (f'\t\t\t<ConditionList sr="if">\n\t\t\t\t<Condition sr="c0" ve="3">\n'
            f'\t\t\t\t\t<lhs>{escape(lhs)}</lhs>\n\t\t\t\t\t<op>{op}</op>\n'
            f'\t\t\t\t\t<rhs>{escape(rhs)}</rhs>\n\t\t\t\t</Condition>\n\t\t\t</ConditionList>\n')


def head(n, code, label):
    return f'\t\t<Action sr="act{n}" ve="7">\n\t\t\t<code>{code}</code>\n\t\t\t<label>{escape(label)}</label>\n'


def js(n, code, label, c=""):
    return (head(n, 129, label) +
            f'\t\t\t<Str sr="arg0" ve="3">{escape(code)}</Str>\n\t\t\t<Str sr="arg1" ve="3"/>\n'
            f'\t\t\t<Int sr="arg2" val="1"/>\n\t\t\t<Int sr="arg3" val="45"/>\n{c}\t\t</Action>\n')


def setvar(n, name, value, label, c=""):
    return (head(n, 547, label) +
            f'\t\t\t<Str sr="arg0" ve="3">{escape(name)}</Str>\n\t\t\t<Str sr="arg1" ve="3">{escape(value)}</Str>\n'
            f'\t\t\t<Int sr="arg2" val="0"/>\n\t\t\t<Int sr="arg3" val="0"/>\n\t\t\t<Int sr="arg4" val="0"/>\n'
            f'{c}\t\t</Action>\n')


def http(n, url, label, c=""):
    return (head(n, 339, label) +
            f'\t\t\t<se>false</se>\n'                                    # continue task after error
            f'\t\t\t<Bundle sr="arg0">\n\t\t\t\t<Vals sr="val"/>\n\t\t\t</Bundle>\n'
            f'\t\t\t<Int sr="arg1" val="0"/>\n'                          # GET
            f'\t\t\t<Str sr="arg2" ve="3">{escape(url)}</Str>\n'
            f'\t\t\t<Str sr="arg3" ve="3">Authorization:%nx_ak %NexusKey</Str>\n'   # key in a header only
            + "".join(f'\t\t\t<Str sr="arg{i}" ve="3"/>\n' for i in range(4, 8)) +
            f'\t\t\t<Int sr="arg8" val="30"/>\n'                         # timeout (s)
            f'\t\t\t<Int sr="arg9" val="0"/>\n'                          # trust any certificate: NO
            f'\t\t\t<Int sr="arg10" val="0"/>\n\t\t\t<Int sr="arg11" val="0"/>\n\t\t\t<Int sr="arg12" val="0"/>\n'
            f'{c}\t\t</Action>\n')


def wait_var(n, var, label, c=""):
    return (head(n, 30, label) +
            f'\t\t\t<Int sr="arg0" val="0"/>\n\t\t\t<Int sr="arg1">\n\t\t\t\t<var>{escape(var)}</var>\n\t\t\t</Int>\n'
            f'\t\t\t<Int sr="arg2" val="0"/>\n\t\t\t<Int sr="arg3" val="0"/>\n\t\t\t<Int sr="arg4" val="0"/>\n'
            f'{c}\t\t</Action>\n')


def kustom(n, name, value, c=""):
    v = [
        ("com.twofortyfouram.locale.intent.extra.BLURB", f"Set: {name}", "java.lang.String"),
        ("net.dinglisch.android.tasker.extras.VARIABLE_REPLACE_KEYS",
         "org.kustom.tasker.VAR_NAME org.kustom.tasker.VAR_VALUE", "java.lang.String"),
        ("net.dinglisch.android.tasker.subbundled", "true", "java.lang.Boolean"),
        ("org.kustom.tasker.VAR_NAME", name, "java.lang.String"),
        ("org.kustom.tasker.VAR_VALUE", value, "java.lang.String"),
        ("org.kustom.tasker.extra.INT_VERSION_CODE", "376422110", "java.lang.Integer"),
    ]
    vals = "".join(f"\t\t\t\t\t<{k}>{escape(val)}</{k}>\n\t\t\t\t\t<{k}-type>{t}</{k}-type>\n" for k, val, t in v)
    return (f'\t\t<Action sr="act{n}" ve="7">\n\t\t\t<code>703953103</code>\n'
            f'\t\t\t<Bundle sr="arg0">\n\t\t\t\t<Vals sr="val">\n{vals}\t\t\t\t</Vals>\n\t\t\t</Bundle>\n'
            f'\t\t\t<Str sr="arg1" ve="3">org.kustom.wallpaper</Str>\n'
            f'\t\t\t<Str sr="arg2" ve="3">org.kustom.lib.editor.tasker.EditVarActivity</Str>\n'
            f'\t\t\t<Int sr="arg3" val="0"/>\n\t\t\t<Int sr="arg4" val="1"/>\n{c}\t\t</Action>\n')


def build():
    code = lambda snip: LIB + "\n" + snip
    acts, n = [], 0

    def add(f, *a):
        nonlocal n
        acts.append(f(n, *a)); n += 1

    add(js, code(SNIP_PLAN), "Plan: what is due now (rate limits, market hours)")
    for k in range(1, SLOTS + 1):
        on = cond(f"%nx_d{k}", 0, "1")
        add(wait_var, f"%nx_w{k}", f"Pause before request {k} (API per-minute limit)", cond(f"%nx_p{k}", 0, "1"))
        add(setvar, "%http_data", "x", f"Clear old response {k}", on)
        add(setvar, "%http_response_code", "0", f"Clear old status {k}", on)
        add(http, f"%nx_u{k}", f"Request {k}", on)
        add(setvar, f"%NexusRaw{k}", f"%http_response_code{SEP}%http_data", f"Save response {k}", on)
    add(js, code(SNIP_FINISH), "Check responses, keep last good data, build chart", cond("%nx_go", 0, "1"))
    for s in SYMBOLS:
        add(kustom, s, f"%Nexus_{s}", cond(f"%Nexus_{s}", 12))
    add(kustom, "nx_chart", "%NexusChart", cond("%NexusChart", 12))
    add(kustom, "nx_meta", "%NexusMeta", cond("%NexusMeta", 12))

    task = (f'\t<Task sr="task902">\n\t\t<cdate>{CDATE}</cdate>\n\t\t<edate>{CDATE}</edate>\n'
            f'\t\t<id>902</id>\n\t\t<nme>NEXUS_Update_Market</nme>\n\t\t<pri>100</pri>\n' + "".join(acts) + '\t</Task>\n')
    profile = (f'\t<Profile sr="prof901" ve="2">\n\t\t<cdate>{CDATE}</cdate>\n\t\t<edate>{CDATE}</edate>\n'
               f'\t\t<id>901</id>\n\t\t<mid0>902</mid0>\n\t\t<nme>NEXUS check (screen on)</nme>\n'
               f'\t\t<Time sr="con0">\n\t\t\t<fh>-1</fh>\n\t\t\t<fm>-1</fm>\n\t\t\t<rep>2</rep>\n'
               f'\t\t\t<repval>10</repval>\n\t\t\t<th>-1</th>\n\t\t\t<tm>-1</tm>\n\t\t</Time>\n'
               f'\t\t<State sr="con1">\n\t\t\t<code>123</code>\n\t\t\t<Int sr="arg0" val="1"/>\n\t\t</State>\n'
               f'\t</Profile>\n')
    project = (f'\t<Project sr="proj0" ve="2">\n\t\t<cdate>{CDATE}</cdate>\n\t\t<name>NEXUS</name>\n'
               f'\t\t<pids>901</pids>\n\t\t<tids>902</tids>\n\t</Project>\n')
    return '<TaskerData sr="" dvi="1" tv="6.3.13">\n' + profile + project + task + '</TaskerData>\n'


def main():
    doc = build()
    import xml.dom.minidom
    xml.dom.minidom.parseString(doc.encode())        # well-formed check
    assert "%nx_ak %NexusKey" in doc and "apikey=" not in doc.lower()
    out = os.path.join(HERE, "NEXUS.prj.xml")
    open(out, "w", encoding="utf-8").write(doc)
    print(f"wrote {out} ({len(doc)//1024} KB, {doc.count('<Action ')} actions)")


if __name__ == "__main__":
    main()
