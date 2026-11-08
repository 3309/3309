#!/usr/bin/env python3
"""Build tasker/NEXUS.prj.xml, an importable Tasker project.

Run:  python3 tasker/build_tasker.py

The XML layout copies real Tasker exports (Tasker 6.x): the HTTP Request action
(code 339), JavaScriptlet (129), Wait (30), Display State context (123), a
5-minute Time context, and the KLWP "Kustom Variable" plugin action
(org.kustom.wallpaper / EditVarActivity, code 703953103).

Your API key is NOT in this file. Tasker reads it from the global variable
%NexusKey, which you create once in Tasker's VARS tab.
"""
import os
from xml.sax.saxutils import escape

HERE = os.path.dirname(os.path.abspath(__file__))
LIB = open(os.path.join(HERE, "nexus.js"), encoding="utf-8").read()
CDATE = 1793990000000

SNIP_PLAN = """
var nx_env = NX.taskerEnv();
var nx_plan = NX.plan(nx_env);
var do_q = nx_plan.doQ ? "1" : "0";
var do_c = nx_plan.doC ? "1" : "0";
var do_w = nx_plan.wait ? "1" : "0";
var nx_qurl = nx_plan.qUrl;
var nx_curl = nx_plan.cUrl;
"""
SNIP_QUOTES = """
NX.handleQuotes(NX.taskerEnv(), local("http_response_code"), local("http_data"));
"""
SNIP_SERIES = """
NX.handleSeries(NX.taskerEnv(), local("http_response_code"), local("http_data"));
"""


def cond(lhs, op, rhs=""):
    # op 0 = equals, 12 = is set (verified against real Tasker exports)
    return (f'\t\t\t<ConditionList sr="if">\n\t\t\t\t<Condition sr="c0" ve="3">\n'
            f'\t\t\t\t\t<lhs>{escape(lhs)}</lhs>\n\t\t\t\t\t<op>{op}</op>\n'
            f'\t\t\t\t\t<rhs>{escape(rhs)}</rhs>\n\t\t\t\t</Condition>\n\t\t\t</ConditionList>\n')


def js(n, code, label, c=""):
    return (f'\t\t<Action sr="act{n}" ve="7">\n\t\t\t<code>129</code>\n\t\t\t<label>{escape(label)}</label>\n'
            f'\t\t\t<Str sr="arg0" ve="3">{escape(code)}</Str>\n\t\t\t<Str sr="arg1" ve="3"/>\n'
            f'\t\t\t<Int sr="arg2" val="1"/>\n\t\t\t<Int sr="arg3" val="45"/>\n{c}\t\t</Action>\n')


def http(n, url, label, c=""):
    return (f'\t\t<Action sr="act{n}" ve="7">\n\t\t\t<code>339</code>\n\t\t\t<label>{escape(label)}</label>\n'
            f'\t\t\t<se>false</se>\n'                                    # continue task after error
            f'\t\t\t<Bundle sr="arg0">\n\t\t\t\t<Vals sr="val"/>\n\t\t\t</Bundle>\n'
            f'\t\t\t<Int sr="arg1" val="0"/>\n'                          # GET
            f'\t\t\t<Str sr="arg2" ve="3">{escape(url)}</Str>\n'
            + "".join(f'\t\t\t<Str sr="arg{i}" ve="3"/>\n' for i in range(3, 8)) +
            f'\t\t\t<Int sr="arg8" val="30"/>\n'                         # timeout (s)
            f'\t\t\t<Int sr="arg9" val="0"/>\n'                          # trust any certificate: NO
            f'\t\t\t<Int sr="arg10" val="0"/>\n\t\t\t<Int sr="arg11" val="0"/>\n\t\t\t<Int sr="arg12" val="0"/>\n'
            f'{c}\t\t</Action>\n')


def wait(n, seconds, label, c=""):
    return (f'\t\t<Action sr="act{n}" ve="7">\n\t\t\t<code>30</code>\n\t\t\t<label>{escape(label)}</label>\n'
            f'\t\t\t<Int sr="arg0" val="0"/>\n\t\t\t<Int sr="arg1" val="{seconds}"/>\n'
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
    acts = [
        js(0, code(SNIP_PLAN), "Plan: what to fetch now"),
        http(1, "%nx_qurl&apikey=%NexusKey", "Get prices", cond("%do_q", 0, "1")),
        js(2, code(SNIP_QUOTES), "Read prices (keeps old data on error)", cond("%do_q", 0, "1")),
        wait(3, 61, "Pause 61 s (API limit: 8 symbols per minute)", cond("%do_w", 0, "1")),
        http(4, "%nx_curl&apikey=%NexusKey", "Get 5-day history", cond("%do_c", 0, "1")),
        js(5, code(SNIP_SERIES), "Build chart (keeps old chart on error)", cond("%do_c", 0, "1")),
        kustom(6, "nx_q", "%NexusQ", cond("%NexusQ", 12)),
        kustom(7, "nx_chart", "%NexusChart", cond("%NexusChart", 12)),
        kustom(8, "nx_meta", "%NexusMeta", cond("%NexusMeta", 12)),
    ]
    task = (f'\t<Task sr="task902">\n\t\t<cdate>{CDATE}</cdate>\n\t\t<edate>{CDATE}</edate>\n'
            f'\t\t<id>902</id>\n\t\t<nme>NEXUS Refresh</nme>\n\t\t<pri>100</pri>\n' + "".join(acts) + '\t</Task>\n')
    profile = (f'\t<Profile sr="prof901" ve="2">\n\t\t<cdate>{CDATE}</cdate>\n\t\t<edate>{CDATE}</edate>\n'
               f'\t\t<id>901</id>\n\t\t<mid0>902</mid0>\n\t\t<nme>NEXUS Every 5 min (screen on)</nme>\n'
               f'\t\t<Time sr="con0">\n\t\t\t<fh>-1</fh>\n\t\t\t<fm>-1</fm>\n\t\t\t<rep>2</rep>\n'
               f'\t\t\t<repval>5</repval>\n\t\t\t<th>-1</th>\n\t\t\t<tm>-1</tm>\n\t\t</Time>\n'
               f'\t\t<State sr="con1">\n\t\t\t<code>123</code>\n\t\t\t<Int sr="arg0" val="1"/>\n\t\t</State>\n'
               f'\t</Profile>\n')
    project = (f'\t<Project sr="proj0" ve="2">\n\t\t<cdate>{CDATE}</cdate>\n\t\t<name>NEXUS</name>\n'
               f'\t\t<pids>901</pids>\n\t\t<tids>902</tids>\n\t</Project>\n')
    return '<TaskerData sr="" dvi="1" tv="6.3.13">\n' + profile + project + task + '</TaskerData>\n'


def main():
    doc = build()
    import xml.dom.minidom
    xml.dom.minidom.parseString(doc.encode())        # well-formed check
    out = os.path.join(HERE, "NEXUS.prj.xml")
    open(out, "w", encoding="utf-8").write(doc)
    assert "apikey=%NexusKey" in doc and "twelvedata" in doc
    print(f"wrote {out} ({len(doc)//1024} KB)")


if __name__ == "__main__":
    main()
