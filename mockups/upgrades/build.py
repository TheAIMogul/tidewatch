#!/usr/bin/env python3
"""Builds the Tidewatch upgrade mockups. Static HTML on top of the real stylesheet (../../src/style.css)."""
import math, os, html

OUT = os.path.dirname(os.path.abspath(__file__))
COLORS = {"GMD": "#0E7C6B", "TIX": "#D4473A", "GALA": "#B4741A", "CHK": "#3A57D0", "CSV": "#55555D"}
e = html.escape

# ---------- helpers mirroring src/main.ts ----------
def initials(name):
    p = [x for x in name.replace("Dr. ", "").replace("The ", "").replace("&", " ").split() if x]
    return (p[0][0] + (p[-1][0] if len(p) > 1 else "")).upper()

def avatar(url, name, size=24, badge=None, red=False):
    if url:
        img = f'<img class="av" style="width:{size}px;height:{size}px" src="{url}" alt="">'
    else:
        img = f'<span class="initials" style="width:{size}px;height:{size}px;font-size:{max(9, size*0.38):.0f}px">{initials(name)}</span>'
    b = ""
    if badge and badge > 1:
        st = ' style="min-width:18px;height:18px;line-height:18px;font-size:10.5px"' if size > 30 else ""
        b = f'<span class="b {"r" if red else ""}"{st}>{badge}</span>'
    return f'<span class="avb">{img}{b}</span>'

def sb(code, label=None):
    return f'<span class="sb"><i style="background:{COLORS.get(code, COLORS["CSV"])}"></i>{e(label or code)}</span>'

def ring(p, size, stroke, color):
    r = (size - stroke) / 2 - 1; c = 2 * math.pi * r; v = max(0, min(1, p or 0))
    return (f'<svg class="mring" width="{size}" height="{size}" viewBox="0 0 {size} {size}"><circle cx="{size/2}" cy="{size/2}" r="{r}" fill="none" stroke="rgba(12,12,14,.08)" stroke-width="{stroke}"/>'
            f'<circle cx="{size/2}" cy="{size/2}" r="{r}" fill="none" stroke="{color}" stroke-width="{stroke}" stroke-dasharray="{c:.1f}" stroke-dashoffset="{c*(1-v):.1f}" stroke-linecap="round"/></svg>')

def risk_color(p): return "#D4473A" if (p or 0) >= .6 else "#B4741A" if (p or 0) >= .35 else "#0E7C6B"
def gauge(p, size=56):
    col = "#0E7C6B" if p >= .8 else "#B4741A" if p >= .5 else "#D4473A"
    inner = ring(p, size, 5, col).replace('<svg class="mring"', '<svg').replace("</svg>", "")
    inner = inner[inner.index(">") + 1:]
    return f'<div class="gauge" style="width:{size}px;height:{size}px"><svg width="{size}" height="{size}" viewBox="0 0 {size} {size}">{inner}</svg><div class="v">{p:.2f}</div></div>'
def pct(p): return f"{round(p*100)}%"
def money(n): return "$" + f"{round(n):,}"
def svgi(d, extra=""): return f'<svg class="i" viewBox="0 0 24 24" {extra}>{d}</svg>'
CHECK = svgi('<path d="M5 12l5 5 9-10"/>', 'style="stroke-width:2.2"')
PHONE_I = '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>'
IMPORT_I = '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17"/>'
SHIELD_I = '<path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>'
def cad(strip): return '<div class="cad">' + "".join(f'<i class="{"" if k == "off" else k}"></i>' for k in strip) + "</div>"
def cite(src, text, ok=False):
    return f'<span class="cite{" ok" if ok else ""}"><i style="background:{COLORS[src]}"></i>{src} · {e(text)}</span>'

# ---------- shell (copied from index.html) ----------
NAV = [
    ("story", "The story", '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M9 8h7M9 11.5h5"/>', ""),
    ("today", "Today", '<path d="M3 12h4l3-8 4 16 3-8h4"/>', ""),
    ("donors", "Donors", '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.5-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.7.8 2.8 2.5 3.2 5.2"/>', '<span class="c">148</span>'),
    ("duplicates", "Duplicates", '<rect x="3" y="3" width="12" height="12" rx="2.5"/><path d="M9 21h9.5a2.5 2.5 0 0 0 2.5-2.5V9"/>', '<span class="c hot">10</span>'),
    ("imports", "Imports", IMPORT_I, '<span class="c">4</span>'),
    ("lab", "Outreach", "", ""),
    ("calls", "Call list", PHONE_I, '<span class="c">11</span>'),
    ("giveday", "Give Day", '<path d="M12 21s-7-4.6-7-10.2A4 4 0 0 1 12 8a4 4 0 0 1 7 2.8C19 16.4 12 21 12 21z"/><path d="M12 3v3M5.5 5.5l2 2M18.5 5.5l-2 2"/>', '<span class="c" style="color:var(--accent)">Live</span>'),
    ("lab", "Workspace", "", ""),
    ("settings", "Settings", '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>', ""),
]

def shell(title, active, crumb, body, giveday=False, foot=None, extra_head="", after=""):
    nav = ""
    for key, label, icon, count in NAV:
        if key == "lab": nav += f'<div class="lab">{label}</div>'; continue
        if key == "giveday" and not giveday: continue
        nav += f'<a data-v="{key}" class="{"on" if key == active else ""}"><svg class="i" viewBox="0 0 24 24">{icon}</svg>{label}{count}</a>'
    foot = foot or '<div class="t">Give Miami Day · Thu, Nov 19</div><div class="v"><span class="mono">11 days</span><span style="font-weight:400;color:var(--fg-3);font-size:12px">· $7,080 at risk</span></div><div class="prog"><i style="width:63.3%"></i></div>'
    return f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{e(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="../../src/style.css" />
  <link rel="stylesheet" href="upgrades.css" />{extra_head}
</head>
<body>
  <div class="tide"><div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div></div>
  <div class="app" id="app">
    <aside class="side">
      <div class="ws"><div class="logo"></div><div><b id="orgName">Tidepath Family Alliance</b><span>Tidewatch · Nonprofit</span></div></div>
      <div class="search" id="searchBtn"><svg class="i" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>Search donors<kbd>⌘K</kbd></div>
      <nav class="nav" id="nav">{nav}</nav>
      <div class="foot">{foot}</div>
    </aside>
    <main class="main">
      <header class="top">
        <div class="crumb" id="crumb">{crumb}</div>
        <div class="r">
          <div class="live"><span class="dot"></span>Decisions live · <span class="mono" id="qcount">324</span> questions</div>
          <button class="btn" id="importBtn">{svgi(IMPORT_I)}Import</button>
          <span class="initials" style="width:28px;height:28px;font-size:11px;background:#E9F4F1;color:#0B6A5B">DN</span>
        </div>
      </header>
      <section class="view on" id="view">{body}</section>
    </main>
  </div>{after}
</body>
</html>'''

def ph(h1, sub, right=""):
    return f'<div class="ph"><div><h1>{h1}</h1><p>{sub}</p></div>{f"<div class=\"r\">{right}</div>" if right else ""}</div>'

def card_h(h3, s="", r=""):
    return f'<div class="ch"><h3>{h3}</h3>{f"<span class=\"s\">{s}</span>" if s else ""}{f"<div class=\"r\">{r}</div>" if r else ""}</div>'

# ---------- live data ----------
CALLS = [  # from /api/calls
    (132, "Dr. Harold Weiss", "https://randomuser.me/api/portraits/men/0.jpg", 1, "Every June", "Gave every June since 2022. None in Jun 2026.", ["off"]*6+["miss"]+["off"]*4+["fut"], 1.0, 2000, "ready"),
    (59, "Theodore Baptiste", "https://randomuser.me/api/portraits/men/21.jpg", 1, "Monthly", "$150 a month for 10 months. Card declined ×3 since Aug.", ["on"]*8+["miss"]*4, .99, 1800, "ready"),
    (72, "Kenji Watanabe", "https://randomuser.me/api/portraits/men/19.jpg", 1, "Monthly", "$75 a month for 9 months. Nothing since Sep 12, 2026.", ["off"]+["on"]*9+["miss"]*2, 1.0, 900, "ready"),
    (124, "R. Delgado", "", 1, "Every December", "Gave every December 2024 and 2025. Nothing yet this year.", ["on"]+["off"]*10+["fut"], .23, 500, "flagged"),
    (61, "Priya Nair", "https://randomuser.me/api/portraits/women/62.jpg", 2, "Monthly", "$40 a month for 9 months. Nothing since Jun 20, 2026.", ["on"]*7+["miss"]+["off"]*3+["fut"], .99, 480, "ready"),
    (1, "Rosa M. Delgado", "https://randomuser.me/api/portraits/women/81.jpg", 2, "Every Give Miami Day", "Gave every Give Miami Day since 2021. Nothing yet this year.", ["off"]*11+["miss"], .10, 400, "ready"),
    (79, "Carmen Fuentes", "https://randomuser.me/api/portraits/women/19.jpg", 1, "Every March", "Gave every March 2024 and 2025. None in Mar 2026.", ["off"]*3+["miss"]+["off"]*7+["fut"], .99, 400, "ready"),
    (11, "Lucia & Tomas Herrera", "https://randomuser.me/api/portraits/women/12.jpg", 2, "Every Give Miami Day", "Gave every Give Miami Day since 2022. Nothing yet this year.", ["off"]*11+["miss"], .15, 300, "ready"),
    (76, "Jean-Marc Celestin", "https://randomuser.me/api/portraits/men/31.jpg", 2, "Every March", "Gave every March 2024 and 2025. None in Mar 2026.", ["off"]*3+["miss"]+["off"]*7+["fut"], .98, 150, "flagged"),
    (44, "Joshua Carter", "https://randomuser.me/api/portraits/men/74.jpg", 2, "Every Give Miami Day", "Gave every Give Miami Day 2024 and 2025. Nothing yet this year.", ["off"]*11+["miss"], .26, 100, "ready"),
    (30, "Jean Pierre-Louis", "https://randomuser.me/api/portraits/men/74.jpg", 2, "Every Give Miami Day", "Gave every Give Miami Day since 2023. Nothing yet this year.", ["off"]*11+["miss"], .30, 50, "ready"),
]
DONE = {132, 72, 61}   # mockup state: 3 of 11 done this morning
SEL = 59               # drawer open on Theodore
ROSA = "https://randomuser.me/api/portraits/women/81.jpg"
THEO = "https://randomuser.me/api/portraits/men/21.jpg"

DECISIONS = [("Dr. Harold Weiss", .37, 551, "35h ago"), ("Jean Pierre-Louis", .31, 384, "37h ago"), ("Joshua Carter", .48, 384, "37h ago"),
             ("Jean-Marc Celestin", .71, 384, "37h ago"), ("Lucia & Tomas Herrera", .23, 384, "37h ago"), ("Carmen Fuentes", .40, 384, "37h ago")]

# ---------- shared pieces ----------
PIPE_ARROW = '<div class="arr"><svg class="i" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></div>'
def pipeline():
    def node(k, v, d, cls="", last=False):
        return f'<div class="pn {cls}"><div class="k"><i></i>{k}</div><div class="v">{v}</div><div class="d">{d}</div>{"" if last else PIPE_ARROW}</div>'
    srcs = "".join(f'<span class="sb"><i style="background:{COLORS[c]}"></i>{f}</span>' for c, f in [("GMD", "gmd-export.csv"), ("TIX", "tickets.csv"), ("GALA", "gala-auction.csv"), ("CHK", "check-log.csv")])
    return f'''<div class="card"><div class="pipe">
    {node("Sources", "4", "GMD, event tickets, gala auction, paper checks")}
    {node("Rows imported", "293", "Nov 2021 to Nov 2026")}
    {node("Unique donors", "148", "after resolution", "acc")}
    {node("Duplicates", "42", '<a href="03-duplicates.html" style="color:var(--risk)">10 need review</a> · 42 auto')}
    {node("Lapsing", "11", "expected gift is late")}
    {node("Revenue at risk", "$7,080", "before Give Miami Day", "risk", True)}
  </div><div class="pipefoot"><div class="src">{srcs}</div><span style="margin-left:auto">Workflow run <span class="mono">#1</span> · 22.0s · <a href="02-imports.html" style="color:var(--fg-2);text-decoration:underline;text-decoration-color:var(--line-3)">View run</a></span></div></div>'''

FLOW = [
    ("review", [("GMD", "Rosa M. Delgado", 250), ("GALA", "Rosa Delgado", 150), ("CHK", "R. Delgado", 500)], ("Rosa M. Delgado", ROSA, 3, '<span class="chip risk">Review</span>'), ("Call Rosa", 400, .097)),
    ("auto", [("TIX", "Jean-Marc Celestin", 100), ("GALA", "Jean-Marc Celestin", 150)], ("Jean-Marc Celestin", "https://randomuser.me/api/portraits/men/31.jpg", 2, '<span class="chip acc">Auto</span>'), ("Call Jean-Marc", 150, .98)),
    ("pending", [("GMD", "Joshua Carter", 100), ("GMD", "Joshua Carter", 100), ("TIX", "Josh Carter", 1500)], ("Joshua Carter", "https://randomuser.me/api/portraits/men/74.jpg", 3, '<span class="chip info">0.82</span>'), ("Call Joshua", 100, .26)),
]
def flow_card():
    kind_cls = {"review": "c", "auto": "t", "pending": "p"}
    col1 = "".join(f'<div class="fr" data-g="{gi}" data-c="1"><span class="sbg" style="background:{COLORS[c]}">{c}</span><b>{e(n)}</b><span class="m">{money(a)}</span></div>' for gi, g in enumerate(FLOW) for c, n, a in g[1])
    col2 = "".join(f'<div class="fr {"hot" if g[0] == "review" else ""}" data-g="{gi}" data-c="2" tabindex="0">{avatar(g[2][1], g[2][0], 24, g[2][2], g[0] == "review")}<b>{e(g[2][0])}</b>{g[2][3]}</div>' for gi, g in enumerate(FLOW))
    col3 = "".join(f'<div class="fr" data-g="{gi}" data-c="3" tabindex="0">{ring(g[3][2], 24, 3, risk_color(g[3][2]))}<b>{e(g[3][0])}</b><span class="m">{money(g[3][1])}</span></div>' for gi, g in enumerate(FLOW))
    return f'''<div class="card"><div class="ch"><h3>Resolution flow</h3><span class="s">How 293 rows became 148 people</span><div class="r lgd"><span><i style="border-color:var(--accent)"></i>Merged</span><span><i style="border-color:var(--risk)"></i>Needs you</span><span><i style="border-color:var(--info);border-top-style:dashed"></i>Pending</span></div></div>
    <div class="board" id="board" data-kinds="{",".join(kind_cls[g[0]] for g in FLOW)}" data-risks="{",".join(str(g[3][2]) for g in FLOW)}">
      <div class="col"><div class="colh">Came in <span class="mono">293</span></div>{col1}</div>
      <div class="col"><div class="colh">One person <span class="mono">148</span></div>{col2}<div class="fr more">+ 145 more people</div></div>
      <div class="col"><div class="colh">This week <span class="mono">11</span></div>{col3}<div class="fr more">+ 8 more calls</div></div>
      <svg class="wires" id="wires"></svg></div></div>'''

WIRE_JS = '''<script>
(function(){const board=document.getElementById('board'),svg=document.getElementById('wires');if(!board||!svg)return;
const b=board.getBoundingClientRect();svg.setAttribute('viewBox','0 0 '+b.width+' '+b.height);svg.setAttribute('width',b.width);svg.setAttribute('height',b.height);
const kinds=board.dataset.kinds.split(','),risks=board.dataset.risks.split(',').map(Number);
const pt=(el,side)=>{const r=el.getBoundingClientRect();return [side==='r'?r.right-b.left:r.left-b.left,r.top-b.top+r.height/2]};
const link=(a,z,k)=>{const A=pt(a,'r'),Z=pt(z,'l'),mx=(A[0]+Z[0])/2;const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d',`M${A[0]} ${A[1]} C ${mx} ${A[1]}, ${mx} ${Z[1]}, ${Z[0]} ${Z[1]}`);p.setAttribute('class',k);svg.appendChild(p);
for(const q of [A,Z]){const c=document.createElementNS('http://www.w3.org/2000/svg','circle');c.setAttribute('cx',q[0]);c.setAttribute('cy',q[1]);c.setAttribute('r','3');c.setAttribute('class',k);svg.appendChild(c)}};
kinds.forEach((k,gi)=>{const person=board.querySelector(`[data-g="${gi}"][data-c="2"]`),act=board.querySelector(`[data-g="${gi}"][data-c="3"]`);
board.querySelectorAll(`[data-g="${gi}"][data-c="1"]`).forEach(r=>person&&link(r,person,k));if(person&&act)link(person,act,risks[gi]>=.5?'c':'t')});})();
</script>'''

def decisions_card():
    items = ""
    for subj, p, ms, ago in DECISIONS:
        cls = "lo" if p >= .5 else "hi"
        items += f'<div class="fi"><div class="ic">{svgi("<path d=\"M5 12l5 5 9-10\"/>")}</div><div><div class="q">Claims not in record? · <b>{e(subj)}</b></div><div class="m">predicate · {ms} ms · {ago}</div></div><span class="p {cls}">{p:.2f}</span></div>'
    return f'''<div class="card" style="contain:size;overflow:hidden"><div class="ch"><h3>OpenAI Decisions</h3><span class="s">gpt-6-luna</span><div class="r"><span class="chip acc"><span class="dot" style="width:5px;height:5px"></span>Live</span></div></div>
    <div class="fsum"><div><div class="k">Questions</div><div class="v">324</div></div><div><div class="k">Latency</div><div class="v">714 ms</div></div><div><div class="k">Cost</div><div class="v">$0.0109</div></div></div>
    <div class="feed" id="feed">{items}</div></div>'''

def outreach_chip(o, done=False):
    if done: return '<span class="chip">Called</span>'
    return {"ready": '<span class="chip acc">Draft ready</span>', "flagged": '<span class="chip warn">Check draft</span>'}[o]

# ---------- 01 today ----------
def today_calls_card():
    rows = ""
    for i, (did, name, av, recs, pattern, reason, strip, risk, at, out) in enumerate(CALLS):
        done = did in DONE
        cls = ("isdone" if done else "") + (" sel" if did == SEL else "")
        rows += f'''<tr class="{cls}"><td><div class="who">{avatar(av, name, 24, recs)}<div><b>{e(name)}</b><span>{e(pattern)}{f" · {recs} linked records" if recs > 1 else ""}</span></div></div></td>
    <td>{cad(strip)}</td>
    <td style="white-space:normal;max-width:300px;color:var(--fg-2);font-size:12.5px">{e(reason)}</td>
    <td><div class="rk">{ring(risk, 18, 2.5, risk_color(risk))}<span class="mono">{pct(risk)}</span></div></td>
    <td class="r-al mono" style="font-weight:500">{money(at)}</td><td>{outreach_chip(out, done)}</td></tr>'''
    return f'''<div class="card" id="calls"><div class="ch"><h3>Call before Give Miami Day</h3><span class="s">11 donors · ranked by revenue at risk</span><span class="done"><span class="prog"><i style="width:27%"></i></span><span class="mono">3 of 11</span> done this morning</span></div>
    <table><thead><tr><th>Donor</th><th>Last 12 months</th><th>Why now</th><th>Lapse risk</th><th class="r-al">At risk</th><th>Outreach</th></tr></thead><tbody>{rows}</tbody></table></div>'''

def drawer_theo():
    note = f'''<p>Hi Theodore,</p>
<p>This is Denise from Tidepath Family Alliance. I’m calling because it looks like your monthly gift for mentoring {cite("GMD", "monthly · $150", True)} did not go through, with three failed payments {cite("GMD", "Aug · Sep · Oct 2026 · declined", True)} since the expected August 5 gift {cite("GMD", "Jul 5 2026 · $150", True)}. I wanted to check in and see if you meant to continue your support, or if anything needs to be updated. Thank you for all the steady support you’ve already given {cite("GMD", "19 gifts · $2,850", True)}.</p>
<p>Denise · Tidepath Family Alliance</p>'''
    return f'''<aside class="drawer" id="drawer">
  <div class="dh">{avatar(THEO, "Theodore Baptiste", 56)}<div style="min-width:0"><div class="stepn">4 of 11 · next up</div><h2>Theodore Baptiste</h2><div class="reason">$150 a month for 10 months. Card declined ×3 since Aug.</div><p style="display:flex;gap:5px;margin-top:8px;flex-wrap:wrap"><span class="chip">Monthly</span><span class="chip risk">Lapsing · 99%</span><span class="chip info">Best by phone</span></p></div><span class="x">{svgi("<path d=\"M6 6l12 12M18 6L6 18\"/>")}</span></div>
  <div class="body">
    <div class="sect" style="border-top:0"><h4>Drafted call note <span class="chip">gpt-5.5</span></h4><div class="note">{note}</div></div>
    <div class="sect" style="padding-top:0;padding-bottom:0"><div class="check">{svgi(SHIELD_I, 'style="color:var(--accent)"')}<span>OpenAI Decisions checked <span class="mono">4 of 4</span> facts</span><span class="mono" style="margin-left:auto">0.07</span></div></div>
    <div class="sect"><h4>At a glance</h4><div class="lr">Lifetime<span class="mono" style="color:var(--fg)">$2,850</span></div><div class="lr">At risk this year<span class="mono" style="color:var(--risk)">$1,800</span></div><div class="lr">Phone<span class="mono">(305) 555-0177</span></div><div class="lr">Last gift<span class="mono">Jul 5, 2026</span></div></div>
  </div>
  <div class="na"><button class="btn">Approve</button><button class="btn pri">{svgi(PHONE_I)}Call Theodore</button><button class="btn acc" style="margin-left:auto">Mark called</button></div>
</aside>'''

def page_today():
    body = ph("Good morning, Denise", "Nov 8, 2026 · Last import 37h ago", '<button class="btn">Export call list</button><button class="btn pri">Start call session</button>') \
        + pipeline() + f'<div style="margin-top:12px">{today_calls_card()}</div><div class="g2 tall" style="margin-top:12px">{flow_card()}{decisions_card()}</div>'
    return shell("Tidewatch · Today", "today", "<b>Today</b>", body, after=drawer_theo() + WIRE_JS)

# ---------- 02 imports ----------
STEPS = [("Upload to storage", "R2", "Original files kept as uploaded", "4 files · 34 KB", "981 ms"),
         ("Parse and normalize", "Workers", "Any column layout · names, emails, phones, street suffixes, dates", "293 rows · 190 records", "1.3s"),
         ("Exact matches", "D1", "Same email or phone", "42 merged · 148 groups", "171 ms"),
         ("Embed names and addresses", "Workers AI", "bge-base-en-v1.5 · one vector per group", "148 vectors · 768 dims", "508 ms"),
         ("Find candidate pairs", "Workers", "Cosine similarity plus name and address rules", "16 pairs from 148 groups", "93 ms"),
         ("Judge every pair", "OpenAI Decisions", "One predicate per pair · people approve every merge", "10 to review · 6 ruled out", "1.2s"),
         ("Build donor records", "D1", "Cadence, lapse window, revenue at risk", "148 donors · 11 lapsing · $7,080 at risk", "798 ms"),
         ("Score lapse risk and channel", "OpenAI Decisions", "Score and choice per donor", "148 donors · 296 questions", "1.2s"),
         ("Draft outreach and verify", "OpenAI", "Draft with gpt-5.5, check every claim with Decisions", "11 notes · 3 flagged", "10.7s")]
SOURCES = [("GMD", "GiveMiamiDay.org", "gmd-export.csv", "22 KB", 81, 166, "CSV"), ("TIX", "Event tickets", "tickets.csv", "4 KB", 42, 43, "CSV"),
           ("GALA", "Gala auction", "gala-auction.csv", "4 KB", 35, 47, "CSV"), ("CHK", "Paper checks", "check-log.csv", "3 KB", 32, 37, "CSV")]

def page_imports():
    files = "".join(f'<div class="f"><div class="lg srcs" style="width:28px;height:28px;border-radius:7px;display:grid;place-items:center;font:600 10px var(--mono);color:#fff;background:{COLORS[c]}">{c}</div><div><b>{e(fn)} <span class="ftype">{t}</span></b><span>Recognized as {e(lab)} · {sz} · {rows} rows</span></div>{sb(c, lab)}</div>' for c, lab, fn, sz, recs, rows, t in SOURCES)
    arrow = '<span class="arrow"><svg class="i" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>'
    preview = f'''<div class="card" style="margin-top:12px"><div class="ch"><h3>Preview</h3><span class="s">nothing is saved yet</span><div class="r"><span class="chip info">Ready</span></div></div>
    <div class="pv"><div class="line"><span class="num">293</span> rows from <span class="num">4</span> files become <span class="num acc">148</span> people · <span class="num">42</span> merged automatically · <span class="num risk">10</span> need you</div>
    <div class="sub">Exact email or phone matches merge on their own. The other 10 are judged by OpenAI Decisions and wait for you. Nothing is deleted, and this import can be undone later.</div>
    <div class="flow"><span class="chip">293 rows · 4 files</span>{arrow}<span class="chip">190 records · same email or phone merged</span>{arrow}<span class="chip acc">148 people</span>{arrow}<span class="chip risk">10 need review</span></div></div>
    <div class="na"><span style="font-size:12px;color:var(--fg-3);margin-right:auto;align-self:center">Saving starts workflow run #2 · about 22s</span><button class="btn">Review the 10 first</button><button class="btn pri">{CHECK}Save import</button></div></div>'''
    drop = f'''<div class="card"><div class="ch"><h3>New import</h3><span class="s">4 files recognized · any column layout</span></div>
    <div class="files">{files}</div>
    <div class="drop compact"><div><b>Drop more CSV or XLSX files here</b> or click to choose</div><div style="font-size:12px;margin-top:4px;color:var(--fg-3)">GiveMiamiDay.org exports, ticketing, gala auctions, typed-in checks, Excel workbooks. Any column layout.</div></div></div>'''
    steps = "".join(f'<div class="st done"><span class="ck">{svgi("<path d=\"M5 12l5 5 9-10\"/>")}</span><div><b>{e(l)}<span class="tech">{e(t)}</span></b><span>{e(d)}</span></div><span class="o">{e(o)}</span><span class="t">{ms}</span></div>' for l, t, d, o, ms in STEPS)
    steps_card = f'<div class="card steps" style="margin-top:12px"><div class="ch"><h3>Run #1 · steps</h3><span class="s">9 of 9 complete · each step retries on its own</span></div>{steps}</div>'
    srcs = "".join(f'<div class="s"><div class="lg" style="background:{COLORS[c]}">{c}</div><div><b>{e(lab)}</b><span>{e(fn)} · {sz} · {recs} records</span></div><span class="mono">{rows}</span></div>' for c, lab, fn, sz, recs, rows, t in SOURCES)
    runs = f'''<div class="card runlist"><div class="ch"><h3>Past runs</h3><span class="s">every import can be rolled back</span></div>
    <div class="rr"><div><b>Run #1 <span class="tech">current</span></b><span>Nov 8 · 4:01 PM · 293 rows · 22.0s</span></div><span class="chip acc">Done</span><button class="btn">Undo this import</button></div>
    <div class="rr"><div><b>Run #0 <span class="tech">sample</span></b><span>Nov 7 · 2:48 PM · 293 rows · 24.1s</span></div><span class="chip">Replaced</span><button class="btn" disabled>Undone</button></div></div>'''
    cost = '''<div class="card" style="margin-top:12px"><div class="ch"><h3>Run cost</h3><span class="s">OpenAI usage · run #1</span></div><div class="sect" style="border-top:0">
        <div class="lr">Decisions questions<span class="mono">323</span></div><div class="lr">Decisions input tokens<span class="mono">107,992</span></div><div class="lr">gpt-5.5 tokens in / out<span class="mono">4,448 / 1,272</span></div>
        <div class="lr" style="border-top:1px solid var(--line);margin-top:4px;padding-top:9px;font-weight:500">Total<span class="mono" style="color:var(--fg)">$0.0712</span></div></div></div>'''
    body = ph("Imports", "Drop files, check the preview, then save. Durable pipeline on Cloudflare Workflows · last run finished in 22.0s", '<a class="btn" href="01-today.html">Open Today</a><button class="btn pri">New import</button>') \
        + f'<div class="runs"><div>{drop}{preview}{steps_card}</div><div>{runs}<div class="card srcs" style="margin-top:12px"><div class="ch"><h3>Sources</h3></div>{srcs}</div>{cost}</div></div>'
    return shell("Tidewatch · Imports", "imports", "<b>Imports</b>", body)

# ---------- 03 duplicates ----------
QUEUE = [("Rosa M. Delgado", ROSA, ["GMD", "GALA", "CHK"], .98), ("Wideline Echeverria", "https://randomuser.me/api/portraits/women/40.jpg", ["GALA", "CHK"], .98),
         ("Marguerite Désir", "https://randomuser.me/api/portraits/women/34.jpg", ["CHK", "CHK"], .98), ("Alvarez Family Fund", "", ["GALA", "GALA"], .96),
         ("Simone Urrutia", "https://randomuser.me/api/portraits/women/38.jpg", ["GALA", "CHK"], .96), ("Isabella Ramsey", "https://randomuser.me/api/portraits/women/71.jpg", ["GALA", "CHK"], .92),
         ("Joshua Carter", "https://randomuser.me/api/portraits/men/74.jpg", ["GMD", "GMD", "TIX"], .82), ("Lauren Fletcher", "https://randomuser.me/api/portraits/women/55.jpg", ["GALA", "CHK"], .82),
         ("Ana Castellanos", "https://randomuser.me/api/portraits/women/24.jpg", ["GMD", "TIX", "TIX"], .80), ("Kenji Watanabe", "https://randomuser.me/api/portraits/men/19.jpg", ["GMD", "CHK"], .42)]

def page_duplicates():
    pr = lambda p: "hi" if p >= .9 else "md" if p >= .6 else "lo"
    q = "".join(f'<div class="it {"on" if i == 0 else ""}">{avatar(av, n, 24, len(codes), p < .6)}<div><b>{e(n)}</b><div class="src">{"".join(sb(c) for c in codes)}</div></div><span class="pr {pr(p)}">{p:.2f}</span></div>' for i, (n, av, codes, p) in enumerate(QUEUE))
    def cell(val, picked=False, dim=False):
        if dim: return '<td class="dim">—</td>'
        return f'<td class="click {"pick" if picked else ""}"><span class="radio"></span>{e(val)}</td>'
    table = f'''<table class="cmp"><thead><tr><th></th><th>{sb("GMD")} &nbsp;GiveMiamiDay.org</th><th>{sb("GALA")} &nbsp;Gala auction</th><th>{sb("CHK")} &nbsp;Paper checks</th><th>Merged record</th></tr></thead><tbody>
      <tr><td>Name</td>{cell("Rosa M. Delgado", True)}{cell("Rosa Delgado")}{cell("R. Delgado")}<td class="res">Rosa M. Delgado</td></tr>
      <tr><td>Email</td>{cell("rosa.delgado@gmail.com", True)}{cell("rosa.delgado@gmail.com", True)}{cell("", dim=True)}<td class="res">rosa.delgado@gmail.com</td></tr>
      <tr><td>Phone</td>{cell("(305) 555-0142", True)}{cell("", dim=True)}{cell("", dim=True)}<td class="res">(305) 555-0142</td></tr>
      <tr><td>Address</td>{cell("1420 SW 8th St", True)}{cell("", dim=True)}{cell("1420 SW 8 Street")}<td class="res">1420 SW 8th St</td></tr>
      <tr><td>Gifts</td><td class="mono" style="font-size:12px">4 · $800</td><td class="mono" style="font-size:12px">1 · $150</td><td class="mono" style="font-size:12px">2 · $1,000</td><td class="res mono" style="font-size:12px">7 · $1,950</td></tr>
      <tr><td>Date range</td><td class="mono" style="font-size:12px">Nov 2021 – Nov 2025</td><td class="mono" style="font-size:12px">Mar 2025 – Mar 2025</td><td class="mono" style="font-size:12px">Dec 2024 – Dec 2025</td><td class="res mono" style="font-size:12px">Nov 2021 – Dec 2025</td></tr>
    </tbody></table>'''
    actions = f'<button class="btn">Keep separate<span class="kbd">N</span></button><button class="btn">Same household<span class="kbd">H</span></button><button class="btn acc">{CHECK}Merge 3 records<span class="kbd">Y</span></button>'
    detail = f'''<div class="card"><div class="ch" style="padding:14px">{avatar(ROSA, "Rosa M. Delgado", 28, 3)}<div><h3 style="font-size:14px">Rosa M. Delgado</h3><span class="s">3 records · GiveMiamiDay.org, Gala auction, Paper checks</span></div><div class="r">{actions}</div></div>
    {table}
    <div class="quiet">{svgi('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v4.5h4.5"/>')}Every merge can be undone from the donor’s history. Nothing is deleted.</div></div>
    <div class="g2" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr);margin-top:12px">
      <div class="card"><div class="ch"><h3>Why we think so</h3></div><div class="score">{gauge(.98)}<div><div style="font-weight:500">Very likely the same donor</div><div style="color:var(--fg-3);font-size:12px;margin-top:2px">OpenAI Decisions read both groups side by side. The signals below are computed, not guessed.</div></div></div>
        <div class="ev"><div><span class="ok">✓</span>Same street, written two ways</div><div><span class="ok">✓</span>Both live in ZIP 33135</div><div><span class="ok">✓</span>R. Delgado is an initial of Rosa</div><div><span class="ok">✓</span>Gifts never on the same day</div></div></div>
      <div class="card"><div class="ch"><h3>Request</h3><span class="s mono">POST /v1/decisions</span><div class="r"><span class="chip">253 ms</span><span class="chip mono">$0.00003</span></div></div>
<pre class="code">{{
  <span class="k">"model"</span>: <span class="s">"gpt-6-luna"</span>,
  <span class="k">"input"</span>: <span class="s">"You are deduplicating donor records for a Miami nonprofit…"</span>,
  <span class="k">"questions"</span>: [
    {{
      <span class="k">"type"</span>: <span class="s">"predicate"</span>,
      <span class="k">"name"</span>: <span class="s">"pair_1"</span>,
      <span class="k">"instructions"</span>: <span class="s">"Are these two groups of records the same donor? Group A: [2 records] Group B: [1 record]"</span>
    }},
    <span class="s">"…15 more pairs in the same request"</span>
  ]
}}
<span style="color:var(--fg-3)">→</span> {{ <span class="k">"probability"</span>: <span class="n">0.98</span> }}</pre></div></div>'''
    body = ph("Duplicates", "Tidewatch merges on its own only when an email or phone matches exactly. Every other match is judged by OpenAI Decisions and approved by you. Nothing is deleted.") \
        + f'<div style="margin-bottom:12px;display:flex;align-items:center;gap:12px"><div class="seg"><a class="on">Needs review <span class="mono">10</span></a><a>Merged <span class="mono">0</span></a><a>Kept separate <span class="mono">0</span></a></div></div>' \
        + f'<div class="dup"><div class="card ql"><div class="ch"><h3>Queue</h3><span class="s">sorted by confidence</span></div>{q}</div><div>{detail}</div></div>'
    return shell("Tidewatch · Duplicates", "duplicates", "Donors <span>/</span> <b>Duplicates</b>", body)

# ---------- 04 donor ----------
HEAT = {2021: ["l0"]*10+["l2","l0"], 2022: ["l0"]*12, 2023: ["l0"]*10+["l3","l0"], 2024: ["l0"]*10+["l3","l0"], 2025: ["l0","l0","l2"]+["l0"]*7+["l3","l0"], 2026: ["l0"]*10+["miss","fut"]}

def page_donor():
    heat = '<div class="heat"><div></div>' + "".join(f'<div class="m">{m}</div>' for m in "JFMAMJJASOND") + "".join(f'<div class="y">{y}</div>' + "".join(f'<i class="{"" if c == "l0" else c}"></i>' for c in HEAT[y]) for y in [2026, 2025, 2024, 2023, 2022, 2021]) + "</div>"
    rings = f'''<div class="rings">
        <div><div class="ring">{ring(.097, 64, 5, risk_color(.097))}<div class="v">0.10</div></div><div class="rl">Lapse risk</div></div>
        <div><div class="ring">{ring(.67, 64, 5, "#3A57D0")}<div class="v">67</div></div><div class="rl">Loyalty</div></div>
        <div><div class="ring">{ring(1 - 24/148, 64, 5, "#0E7C6B")}<div class="v">25th</div></div><div class="rl">of 148</div></div>
      </div>'''
    left = f'''<div class="card">{rings}
      <div class="prof"><dl class="kv"><dt>Email</dt><dd>rosa.delgado@gmail.com</dd><dt>Phone</dt><dd class="mono" style="font-size:12.5px">(305) 555-0142</dd><dt>Address</dt><dd>1420 SW 8th St<br>Miami, FL 33135</dd><dt>Owner</dt><dd>Denise</dd><dt>Gives to</dt><dd>Mentoring</dd></dl></div>
      <div class="sect"><h4>Lifetime</h4><div class="lr">Total given<span class="mono" style="color:var(--fg)">$950</span></div><div class="lr">Gifts<span class="mono">5</span></div><div class="lr">Average gift<span class="mono">$190</span></div><div class="lr">Years giving<span class="mono">4</span></div></div>
      <div class="sect"><h4>Linked records</h4><div class="lr">{sb("GMD")}Rosa M. Delgado<span class="mono">4 gifts</span></div><div class="lr">{sb("GALA")}Rosa Delgado<span class="mono">1 gift</span></div></div>
    </div>'''
    note = f'''<p>Hi Rosa,</p>
<p>I’m calling from Tidepath Family Alliance to thank you for showing up for us on Give Miami Day over the years {cite("GMD", "2021 · 2023 · 2024 · 2025", True)}, especially for mentoring {cite("GMD", "Mentoring · 4 gifts · $800", True)}. Give Miami Day is coming up on November 19 {cite("GMD", "Thu Nov 19 2026", True)}, and I wanted to let you know we’d be grateful to have your support again {cite("GMD", "Nov 20 2025 · $250", True)} for Miami-Dade kids and families.</p>
<p>Denise · Tidepath Family Alliance</p>'''
    tl_gift = lambda d, code, src, amt: f'<div class="t"><span class="d">{d}</span><span class="b" style="background:{COLORS[code]}"></span><span>{src}</span><span class="mono">{amt}</span></div>'
    tl_ev = lambda d, cls, text, who="", right="": f'<div class="t"><span class="d">{d}</span><span class="b {cls}"></span><span>{text}{f" <span class=\"who\">· {who}</span>" if who else ""}</span><span class="mono">{right}</span></div>'
    timeline = f'''<div class="card tl"><div class="ch"><h3>Timeline</h3><span class="s">9 entries · gifts, merges, calls</span></div>
          {tl_ev("Nov 8, 2026", "k", "Call note approved", "", "Denise")}
          {tl_ev("Nov 8, 2026", "m", 'Merged ' + sb("GALA") + ' Rosa Delgado · 0.98', "", '<a class="undo" style="margin:0">Undo merge</a>')}
          {tl_ev("Nov 8, 2026", "i", "Imported · run #1 · gmd-export.csv", "", "4 rows")}
          {tl_ev("Nov 6, 2026", "k", "Called · left a voicemail", "", "Denise")}
          {tl_gift("Nov 20, 2025", "GMD", "GiveMiamiDay.org · Mentoring", "$250")}
          {tl_gift("Mar 14, 2025", "GALA", "Gala auction · Weekend in Key West", "$150")}
          {tl_gift("Nov 21, 2024", "GMD", "GiveMiamiDay.org · Mentoring", "$250")}
          {tl_gift("Nov 16, 2023", "GMD", "GiveMiamiDay.org · Mentoring", "$200")}
          {tl_gift("Nov 18, 2021", "GMD", "GiveMiamiDay.org · Mentoring", "$100")}</div>'''
    outreach = f'''<div class="card"><div class="ch"><h3>Suggested outreach</h3><span class="s">drafted 37h ago</span><div class="r"><span class="chip">gpt-5.5</span></div></div>
          <div class="note">{note}</div>
          <div class="facts"><span class="chip">GiveMiamiDay.org · 4 gifts</span><span class="chip">Gala auction · 1 gift</span><span class="chip">Designation: Mentoring</span></div>
          <div class="check">{svgi(SHIELD_I, 'style="color:var(--accent)"')}OpenAI Decisions checked 4 of 4 facts in the note<span class="mono" style="margin-left:auto;color:var(--accent-2)">0.09</span></div>
          <div class="na"><button class="btn">Regenerate</button><button class="btn">Copy</button><button class="btn acc" style="margin-left:auto">Mark called</button></div></div>'''
    notes = '''<div class="card notes" style="margin-top:12px"><div class="ch"><h3>Notes</h3><span class="s">0 entries · a ledger, entries can't be edited or deleted</span></div>
    <div class="composer"><textarea rows="3" placeholder="Add a note about Rosa: a call, a preference, anything the next person should know."></textarea><div class="cbar"><span class="muted">Saved with today's date and time · ⌘↵ to save</span><button class="btn pri">Save note</button></div></div>
    <div class="ledger"><div class="lempty">No notes yet. The first one starts the ledger.</div></div></div>'''
    head = f'''<div class="ph"><div style="display:flex;align-items:center;gap:14px">{avatar(ROSA, "Rosa M. Delgado", 56, 2)}<div><h1>Rosa M. Delgado</h1><div class="reason">Gave every Give Miami Day since 2021. Nothing yet this year, and Give Miami Day is in 11 days.</div><p style="display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap"><span class="chip">Every Give Miami Day</span><span class="chip risk">Due · 10%</span><span class="chip">2 linked records</span><span class="chip info">Best by phone</span><span style="color:var(--fg-3)">· 33135</span></p></div></div>
      <div class="r"><button class="btn">Log activity</button><button class="btn pri">{svgi(PHONE_I)}Call Rosa</button></div></div>'''
    body = head + f'''<div class="dn">{left}<div>
      <div class="card"><div class="ch"><h3>Giving pattern</h3><span class="s">Gave every Give Miami Day since 2021. Nothing yet this year.</span><div class="r"><span class="chip risk">Nov 2026 expected</span></div></div>{heat}</div>
      <div class="dgrid">{outreach}{timeline}</div>{notes}</div></div>'''
    return shell("Tidewatch · Rosa M. Delgado", "calls", '<a href="01-today.html" style="color:inherit">Call list</a> <span>/</span> <b>Rosa M. Delgado</b>', body)

# ---------- 05 call mode on a phone ----------
def page_phone():
    tp = lambda n, text, cites: f'<div class="pt"><span class="n">{n}</span><div>{text}<div class="cites">{"".join(cites)}</div></div></div>'
    out = lambda cls, icon, label: f'<div class="out {cls}">{svgi(icon)}{label}</div>'
    phone = f'''<div class="phone">
  <div class="ptide"><div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div></div>
  <div class="notch"></div>
  <div class="status"><span>9:41</span><span class="mono">●●●● <span style="opacity:.6">5G</span></span></div>
  <div class="pscr">
    <div class="pbar"><b>Call mode</b><span class="s">4 of 11 · Give Miami Day in 11 days</span><div class="seg"><a><span class="mono">←</span></a><a class="on"><span class="mono">→</span></a></div></div>
    <div class="card"><div class="hero">{avatar(THEO, "Theodore Baptiste", 60)}<h2>Theodore Baptiste</h2>
      <div class="chips"><span class="chip">Monthly</span><span class="chip risk">Lapsing · 99%</span><span class="chip info">Best by phone</span></div>
      <div class="reason">$150 a month for 10 months. Card declined ×3 since August.</div>
      <button class="callbtn">{svgi(PHONE_I)}Call Theodore <span class="mono">(305) 555-0177</span></button></div></div>
    <div class="card"><div class="ch" style="padding:11px 14px"><h3>Talking points</h3><span class="s">from the record only</span></div>
      <div class="tp">
        {tp(1, "Thank him: 19 monthly gifts for mentoring, $2,850 since January 2025.", [cite("GMD", "19 gifts · $2,850", True), cite("GMD", "Mentoring", True)])}
        {tp(2, "His card has declined three times since the August 5 gift. Ask if he meant to continue.", [cite("GMD", "Aug 5 · Sep 5 · Oct 5 · declined", True)])}
        {tp(3, "Offer to update the card, or move his gift to Give Miami Day on Nov 19.", [cite("GMD", "Jul 5 2026 · $150 · last paid", True), cite("GMD", "Give Miami Day · Nov 19", True)])}
      </div>
      <div class="check">{svgi(SHIELD_I, 'style="color:var(--accent)"')}<span>OpenAI Decisions checked <span class="mono">4 of 4</span> facts</span><span class="mono" style="margin-left:auto">0.07</span></div></div>
    <div class="card"><div class="outh">One tap after the call</div><div class="outs">
      {out("acc", '<path d="M5 12l5 5 9-10"/>', "Reached")}
      {out("", '<path d="M4 7h16v10H4z"/><path d="M4 7l8 6 8-6"/>', "Voicemail")}
      {out("acc", '<path d="M12 3v18M7 7.5c0-1.4 2.2-2.5 5-2.5s5 1.1 5 2.5-2.2 2.5-5 2.5-5 1.1-5 2.5 2.2 2.5 5 2.5 5-1.1 5-2.5"/>', "Pledged $")}
      {out("risk", '<path d="M6 6l12 12M18 6L6 18"/>', "Don’t contact")}
    </div></div>
  </div>
  <div class="home"></div>
</div>'''
    return f'''<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Tidewatch · Call mode</title>
<link rel="preconnect" href="https://fonts.googleapis.com" /><link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="../../src/style.css" /><link rel="stylesheet" href="upgrades.css" /></head>
<body><div class="tide"><div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div></div>
<div class="stage">{phone}</div></body></html>'''

# ---------- 06 give day ----------
GIFTS = [  # invented day-of gifts; names and portraits are real donors from /api/donors
    ("Dana Williams", "https://randomuser.me/api/portraits/women/88.jpg", 100, "Monthly · gave last Nov too", "matched · email", "acc", "2:14 PM"),
    ("Mei Chen", "https://randomuser.me/api/portraits/women/3.jpg", 50, "Monthly", "matched · email", "acc", "2:12 PM"),
    ("A. Bermudez", "", 250, "no email on file", "new · review later", "warn", "2:11 PM"),
    ("Miguel Figueroa", "https://randomuser.me/api/portraits/men/23.jpg", 300, "Every March · first Give Miami Day gift", "matched · phone", "acc", "2:09 PM"),
    ("Jean Pierre-Louis", "https://randomuser.me/api/portraits/men/74.jpg", 50, "Every Give Miami Day · was on the call list", "matched · email", "acc", "2:06 PM"),
    ("Valentina Sutton", "https://randomuser.me/api/portraits/women/46.jpg", 75, "Occasional", "matched · email", "acc", "2:03 PM"),
    ("Carter Group", "", 1500, "looks like Josh Carter · 0.82", "new · review later", "warn", "1:58 PM"),
    ("Nadege Urrutia", "https://randomuser.me/api/portraits/women/39.jpg", 200, "Every March", "matched · email", "acc", "1:55 PM"),
    ("Caleb Patel", "https://randomuser.me/api/portraits/men/49.jpg", 100, "Every March", "matched · email", "acc", "1:51 PM"),
    ("Noah Laguerre", "https://randomuser.me/api/portraits/men/82.jpg", 40, "Occasional", "matched · email", "acc", "1:49 PM"),
]
LOYAL = [("Rosa M. Delgado", ROSA, "Every Give Miami Day since 2021 · $250 in 2025", 2),
         ("Lucia & Tomas Herrera", "https://randomuser.me/api/portraits/women/12.jpg", "Every Give Miami Day since 2022 · $300 in 2025", 2),
         ("Joshua Carter", "https://randomuser.me/api/portraits/men/74.jpg", "Give Miami Day 2024 and 2025 · $100 in 2025", 2),
         ("Dr. Harold Weiss", "https://randomuser.me/api/portraits/men/0.jpg", "Every June · $2,000 · voicemail Nov 6", 1),
         ("Theodore Baptiste", THEO, "Monthly · declined ×3 · pledged today", 1),
         ("Carmen Fuentes", "https://randomuser.me/api/portraits/women/19.jpg", "Every March · $400 · missed March", 1)]

def page_giveday():
    hero = '''<div class="card gd-hero"><div class="k"><span class="dot"></span>Raised today · live from GiveMiamiDay.org · refreshed 20s ago</div>
    <div class="big"><b>$18,420</b><span>of a $25,000 goal · 74%</span></div>
    <div class="prog"><i style="width:73.7%"></i></div>
    <div class="marks"><span>8:00 AM</span><span>last year at 2:14 PM · $14,900</span><span>$25,000</span></div>
    <div class="gd-stats"><div><div class="k">Gifts</div><div class="v">61</div></div><div><div class="k">Matched to a donor</div><div class="v">54<small>89%</small></div></div><div><div class="k">New · review later</div><div class="v">7</div></div><div><div class="k">From the call list</div><div class="v">$2,250<small>5 of 11 gave</small></div></div></div></div>'''
    gifts = "".join(f'<div class="gi {"new" if i == 0 else ""}">{avatar(av, n, 24)}<div><b>{e(n)}</b><span class="s">{e(sub)}</span></div><span class="chip {cls}">{chip}</span><span class="amt">{money(a)}</span></div>' for i, (n, av, a, sub, chip, cls, at) in enumerate(GIFTS))
    gifts_card = f'<div class="card gifts"><div class="ch"><h3>Gifts landing</h3><span class="s">matched to a person as they arrive</span><div class="r"><span class="chip acc"><span class="dot" style="width:5px;height:5px"></span>Live</span></div></div>{gifts}</div>'
    loyal = "".join(f'<div class="li">{avatar(av, n, 24, recs)}<div><b>{e(n)}</b><span>{e(sub)}</span></div><div class="acts"><button class="btn">Text</button><button class="btn pri">{svgi(PHONE_I)}Call</button></div></div>' for n, av, sub, recs in LOYAL)
    loyal_card = f'<div class="card loyal"><div class="ch"><h3>Loyal donors who haven’t given yet</h3><span class="s">6 people · $3,350 last year</span></div>{loyal}</div>'
    body = ph("Give Miami Day", "Thu, Nov 19, 2026 · 2:14 PM · the board updates on its own, every gift is matched to a person by OpenAI Decisions", '<button class="btn">Share board</button><button class="btn pri">Start call session</button>') \
        + hero + f'<div class="g2" style="margin-top:12px;grid-template-columns:minmax(0,1fr) 420px">{gifts_card}{loyal_card}</div>'
    foot = '<div class="t">Give Miami Day · Thu, Nov 19</div><div class="v"><span class="mono" style="color:var(--accent-2)">Today</span><span style="font-weight:400;color:var(--fg-3);font-size:12px">· $18,420 raised</span></div><div class="prog"><i style="width:74%"></i></div>'
    return shell("Tidewatch · Give Day", "giveday", "Outreach <span>/</span> <b>Give Day</b>", body, giveday=True, foot=foot)

# ---------- index ----------
# ---------- 07 calls (full page, modeled on AttendClear's Calls page) ----------
MONTHS = ["D", "J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N"]
def page_calls():
    todo = [c for c in CALLS if c[0] not in DONE]
    done = [c for c in CALLS if c[0] in DONE]
    def qrow(c, on=False, isdone=False):
        did, name, av, recs, pattern, reason, strip, risk, at, out = c
        short = reason.split(". ")[0].rstrip(".")
        dot = "" if isdone else f'<i class="cq-dot {"risk" if risk >= .6 else "warn" if risk >= .35 else ""}"></i>'
        return f'<div class="it {"on" if on else ""} {"isdone" if isdone else ""}">{avatar(av, name, 32, recs)}<div style="min-width:0"><b>{e(name)}</b><span class="cq-why">{e(short)}</span></div><div class="cq-r"><span class="mono">{money(at)}</span>{dot}</div></div>'
    queue = "".join(qrow(c, c[0] == SEL) for c in todo)
    queue += '<div class="cq-lab">Done this morning</div>' + "".join(qrow(c, isdone=True) for c in done)
    left = f'''<div class="card ql cq">{card_h("Queue", "ranked by revenue at risk")}
      <div style="padding:10px 12px 8px;border-bottom:1px solid var(--line)"><div class="seg"><a class="on">To call <span class="mono">8</span></a><a>Called <span class="mono">3</span></a><a>Gave since <span class="mono">0</span></a></div></div>
      {queue}
      <div class="cq-foot">Notes are drafted the moment an import finishes. Nothing goes out until you send it.</div></div>'''
    theo = next(c for c in CALLS if c[0] == SEL)
    strip = theo[6]
    months = "".join(f'<div class="cm {k}"><i></i><span>{MONTHS[i]}</span></div>' for i, k in enumerate(strip))
    note = f'''<p>Hi Theodore, this is Denise from Tidepath Family Alliance.</p>
<p>Thank you for giving to mentoring every month {cite("GMD", "monthly · $150", True)}. Your card didn’t go through in August, September or October {cite("GMD", "Aug · Sep · Oct 2026 · declined", True)}, after your last gift on July 5 {cite("GMD", "Jul 5 2026 · $150", True)}. Nothing’s wrong on your end; cards expire. Could I help you update it, or would you rather give on Give Miami Day, November 19?</p>
<p>Either way, thank you for all you’ve given {cite("GMD", "19 gifts · $2,850", True)}.</p>'''
    right = f'''<div class="card cs">
      <div class="cs-h">{avatar(THEO, "Theodore Baptiste", 56)}<div style="min-width:0"><h2>Theodore Baptiste</h2><p>Monthly since Jan 2025 · Mentoring · <span class="mono">(305) 555-0177</span></p>
        <p style="display:flex;gap:5px;margin-top:8px;flex-wrap:wrap"><span class="chip">Monthly</span><span class="chip risk">Lapsing · 99%</span><span class="chip info">Best by phone</span><span class="chip">1 linked record</span></p></div>
        <div class="r"><a class="btn">Open donor page</a><button class="btn acc">{svgi(PHONE_I)}Call Theodore</button></div></div>
      <div class="cs-why"><div><div class="cs-big">Card declined three times since August. Nobody has called yet.</div>
          <div class="cs-meta">{ring(.99, 16, 2.5, "#D4473A")}<span>Lapse risk <span class="mono">99%</span> · OpenAI Decisions</span><span>·</span><span><span class="mono" style="color:var(--risk)">$1,800</span> at risk this year</span></div></div>
        <div class="cs-months">{months}</div></div>
      <div class="cs-note">
        <div class="cs-nh"><span>Call script · <b>To Theodore</b> · <span class="mono">(305) 555-0177</span></span><div class="seg"><a class="on">Call script</a><a>Text</a><a>Email</a></div></div>
        <div class="note">{note}</div>
        <div class="cs-src"><span class="chip">{svgi('<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/>')}GiveMiamiDay.org · 19 gifts</span><span class="chip">{svgi('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>')}Next charge would be Nov 5 · skipped</span><span class="chip">{svgi('<path d="M12 21s-7-4.6-7-10.2A4 4 0 0 1 12 8a4 4 0 0 1 7 2.8C19 16.4 12 21 12 21z"/>')}Give Miami Day · Thu, Nov 19</span></div>
        <div class="check">{svgi(SHIELD_I, 'style="color:var(--accent)"')}<span>OpenAI Decisions checked <span class="mono">4 of 4</span> facts against the record</span><span class="mono" style="margin-left:auto">0.07</span></div>
      </div>
      <div class="cs-act"><button class="btn pri big">{svgi(PHONE_I)}Call Theodore</button><button class="btn big">Send as text</button><button class="btn big">Send as email</button><button class="btn big">{svgi('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>')}Rewrite</button>
        <span class="cs-sub"><a>Edit</a><a>Not needed</a></span></div>
      <div class="cs-out"><span class="cs-ol">After the call, one tap</span><button class="btn">{CHECK}Reached</button><button class="btn">Voicemail</button><button class="btn">Pledged $</button><button class="btn">Card updated</button><button class="btn" style="color:var(--risk)">Don’t contact</button></div>
      <div class="cs-steps"><div class="st on"><i></i><b>Drafted</b><span>Nov 6, 6:20 PM</span></div><div class="cs-ln"></div><div class="st"><i></i><b>Called</b><span>Waiting on you</span></div><div class="cs-ln"></div><div class="st"><i></i><b>Gave again</b><span>Watching GiveMiamiDay.org</span></div></div>
    </div>'''
    body = ph("Call list", "11 donors to reach before Give Miami Day · 3 done this morning · ranked by revenue at risk", '<button class="btn">Export call list</button><button class="btn pri">Start call session</button>') \
        + f'<div class="cgrid">{left}{right}</div>'
    return shell("Tidewatch · Call list", "calls", '<span class="muted">Outreach</span> / <b>Call list</b>', body)


SHOTS = [("01-today", "Today, as a morning list", "The call list now counts itself down (3 of 11 done, finished rows go quiet) and a row opens a drawer with the drafted note. Every fact in the note carries its receipt, and Decisions says it checked 4 of 4."),
         ("02-imports", "Imports, with a preview before anything is saved", "Drop any CSV or XLSX. Tidewatch recognizes each file, previews what 293 rows become (148 people, 42 merged, 10 for you) and lets you review the 10 first. Any past run can be undone."),
         ("03-duplicates", "Duplicates, with a third answer", "Same household joins Keep separate and Merge, with Y / H / N keys. Evidence reads in plain English, and a quiet line says every merge can be undone."),
         ("04-donor", "The donor page, unchanged, plus receipts", "Rosa’s page keeps everything. New: a one-line reason under her name, citation chips inside the suggested note, and merge, import, call and approval events on the timeline with an Undo merge link."),
         ("05-call-phone", "Call mode on a phone", "Theodore’s reason, one big Call button, three talking points with citations, the Decisions check, and one-tap outcomes: Reached, Voicemail, Pledged $, Don’t contact."),
         ("07-calls", "Call list, a page of its own", "Modeled on the AttendClear calls page: the queue on the left, one donor at a time on the right. The reason in one sentence, twelve months of giving, a call script with receipts, Call, text or email, then one tap to log what happened."),
         ("06-give-day", "Give Day, a new nav item", "A live board for November 19: total vs goal, gifts landing matched to a person as they arrive, and the loyal donors who haven’t given yet with Text and Call.")]

def page_index():
    cards = "".join(f'''<section class="card shot"><div class="ch"><h3>{i+1}. {e(t)}</h3></div><a href="{f}.html"><img src="{f}.png" alt="{e(t)}" loading="lazy"></a><p>{e(cap)} <a href="{f}.html">Open the mockup</a></p></section>''' for i, (f, t, cap) in enumerate(SHOTS))
    return f'''<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Tidewatch: what’s next</title>
<link rel="preconnect" href="https://fonts.googleapis.com" /><link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="../../src/style.css" /><link rel="stylesheet" href="upgrades.css" />
<style>
html,body{{height:auto;overflow-x:hidden}}
.wrap{{position:relative;z-index:1;max-width:1100px;margin:0 auto;padding:40px 16px 60px}}
.hero{{text-align:center;margin:12px auto 28px;max-width:760px}}
.hero .logo{{width:40px;height:40px;border-radius:11px;margin:0 auto 14px}}
.hero h1{{font-size:34px;font-weight:600;letter-spacing:-.03em;line-height:1.15}}
.hero p{{font-size:15px;color:var(--fg-2);margin-top:10px;line-height:1.55}}
.shot{{margin-top:16px;overflow:hidden}}
.shot img{{display:block;width:100%;height:auto;border-top:1px solid var(--line)}}
.shot p{{padding:12px 14px 14px;font-size:13.5px;color:var(--fg-2);line-height:1.5;border-top:1px solid var(--line)}}
.shot p a{{color:var(--accent-2)}}
.toc{{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:16px}}
.toc a{{text-decoration:none}}
@media (max-width:767px){{.wrap{{padding:24px 16px 40px}}.hero h1{{font-size:24px}}.hero p{{font-size:14px}}}}
</style></head>
<body><div class="tide"><div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div></div>
<div class="wrap">
  <div class="hero"><div class="logo"></div><h1>Tidewatch: what’s next</h1><p>Seven screens from the next release, built inside the Tidewatch you already use. Same shell, same calm. What changes: the morning list finishes itself, every claim carries a receipt, imports preview before they save, and Give Miami Day gets a live board.</p>
  <div class="toc">{"".join(f'<a class="chip" href="#{f}">{i+1} · {e(t.split(",")[0])}</a>' for i, (f, t, cap) in enumerate(SHOTS))}</div></div>
  {cards.replace('<section class="card shot">', '<section class="card shot" id="SHOTID">')}
</div></body></html>'''

if __name__ == "__main__":
    pages = {"01-today.html": page_today(), "02-imports.html": page_imports(), "03-duplicates.html": page_duplicates(), "04-donor.html": page_donor(), "05-call-phone.html": page_phone(), "06-give-day.html": page_giveday(), "07-calls.html": page_calls()}
    idx = page_index()
    for f, t, c in SHOTS: idx = idx.replace('id="SHOTID"', f'id="{f}"', 1)
    pages["index.html"] = idx
    for name, content in pages.items():
        with open(os.path.join(OUT, name), "w") as fh: fh.write(content)
        print("wrote", name, len(content))
