"""Builds the demo catalogue: two CSV files for `npm run import:catalogue`, and one illustration per gift.

    python scripts/demo-catalogue/build.py

Output:  samples/demo-taxonomy.csv, samples/demo-products.csv
         ../sentimently-web/apps/storefront/public/images/demo/<slug>.svg
These are placeholders for development. Replace the names, prices and pictures with the studio's real ones.
"""
import csv
import math
import os
import random
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from groups import CATEGORIES, OCCASIONS, RECIPIENTS, SENTIMENTS  # noqa: E402
from items import ITEMS  # noqa: E402

API = os.path.dirname(os.path.dirname(HERE))
IMG_DIR = os.path.join(os.path.dirname(API), "sentimently-web", "apps", "storefront", "public", "images", "demo")
SAMPLES = os.path.join(API, "samples")

# background 1, background 2, accent, light
PALETTES = [
    ("#fde7ef", "#f6c6d6", "#c43d68", "#ffffff"),
    ("#fdf1d3", "#f4d98d", "#b88a1e", "#ffffff"),
    ("#efe6f5", "#d3bfe6", "#6d4a8f", "#ffffff"),
    ("#e3f2ea", "#b5dbc6", "#3a6b55", "#ffffff"),
    ("#e4eefa", "#bcd5f0", "#3d6fa8", "#ffffff"),
    ("#fde9dc", "#f6c3a6", "#c0623a", "#ffffff"),
    ("#def3f1", "#a9ddd8", "#2a7f7a", "#ffffff"),
    ("#efeae6", "#d5ccc4", "#6b5d52", "#ffffff"),
    ("#fde4e1", "#f6b3ab", "#cf4a3d", "#ffffff"),
    ("#e3e7f3", "#b4bfde", "#2e3f7a", "#ffffff"),
    ("#f5e1e4", "#e2b3bd", "#8c1f3b", "#ffffff"),
]
HEART = "M0 38c-30-22-40-38-40-54a22 22 0 0 1 40-11 22 22 0 0 1 40 11c0 16-10 32-40 54z"


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower().replace("'", "")).strip("-")[:100]


def scene(body, pal, label):
    c1, c2, a, b = pal
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" role="img" aria-label="{label}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/></linearGradient>
    <linearGradient id="sh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  </defs>
  <rect width="800" height="800" fill="url(#bg)"/>
  <circle cx="650" cy="150" r="120" fill="#fff" opacity=".28"/>
  <circle cx="120" cy="700" r="90" fill="#fff" opacity=".2"/>
  <ellipse cx="400" cy="672" rx="220" ry="24" fill="#000" opacity=".1"/>
  {body}
</svg>
'''


# ---------------------------------------------------------------- ribbon flowers, gajray and chocolate bouquets
def _mix(hex_color, target, f):
    h = hex_color.lstrip("#")
    c = [int(h[i:i + 2], 16) for i in (0, 2, 4)]
    return "#%02x%02x%02x" % tuple(round(v + (target - v) * f) for v in c)


def _dark(hex_color, f):
    return _mix(hex_color, 0, f)


def _light(hex_color, f):
    return _mix(hex_color, 255, f)


def _rose(cx, cy, r, col, glitter=False, seed=0):
    rnd = random.Random(seed)
    parts = [f'<circle cx="{cx:.0f}" cy="{cy:.0f}" r="{r:.0f}" fill="{_dark(col, .28)}"/>']
    for k, (scale, shade) in enumerate([(.92, 0), (.74, .1), (.55, .0), (.36, .12)]):
        rr = r * scale
        ox, oy = r * .05 * (k % 2 or -1), r * .04 * (-1 if k % 3 else 1)
        fill = _light(col, shade) if k % 2 == 0 else _dark(col, .12)
        parts.append(f'<circle cx="{cx + ox:.0f}" cy="{cy + oy:.0f}" r="{rr:.0f}" fill="{fill}" stroke="{_dark(col, .35)}" stroke-width="{max(r * .03, 1):.1f}"/>')
    s = r * .17
    parts.append(f'<path d="M{cx:.0f} {cy - s:.0f}a{s:.0f} {s:.0f} 0 1 1 {s:.0f} {s:.0f}a{s * 2:.0f} {s * 2:.0f} 0 1 1 {-s * 3:.0f} {-s:.0f}" fill="none" stroke="{_dark(col, .4)}" stroke-width="{max(r * .035, 1):.1f}" stroke-linecap="round"/>')
    parts.append(f'<ellipse cx="{cx - r * .3:.0f}" cy="{cy - r * .4:.0f}" rx="{r * .3:.0f}" ry="{r * .14:.0f}" fill="#fff" opacity=".28" transform="rotate(-30 {cx - r * .3:.0f} {cy - r * .4:.0f})"/>')
    if glitter:
        for _ in range(max(int(r * .5), 6)):
            a, d = rnd.uniform(0, 6.283), r * .9 * rnd.random() ** .5
            parts.append(f'<circle cx="{cx + d * math.cos(a):.0f}" cy="{cy + d * math.sin(a):.0f}" r="{rnd.choice([1.2, 1.8, 2.4]) * max(r / 60, .6):.1f}" fill="#fff" opacity="{rnd.choice([.55, .8, .95])}"/>')
    return "".join(parts)


def _bow(cx, cy, col, size=1.0):
    s = size
    return (f'<path d="M{cx} {cy}c-{80 * s:.0f}-{70 * s:.0f}-{150 * s:.0f}-{20 * s:.0f}-{100 * s:.0f} {26 * s:.0f}z" fill="{col}"/>'
            f'<path d="M{cx} {cy}c{80 * s:.0f}-{70 * s:.0f} {150 * s:.0f}-{20 * s:.0f} {100 * s:.0f} {26 * s:.0f}z" fill="{col}"/>'
            f'<path d="M{cx} {cy}c-{80 * s:.0f}-{70 * s:.0f}-{150 * s:.0f}-{20 * s:.0f}-{100 * s:.0f} {26 * s:.0f}z" fill="#000" opacity=".1"/>'
            f'<path d="M{cx - 6} {cy + 10}l-{50 * s:.0f} {120 * s:.0f}l{34 * s:.0f}-{14 * s:.0f}l{16 * s:.0f} {28 * s:.0f}zM{cx + 6} {cy + 10}l{50 * s:.0f} {120 * s:.0f}l-{34 * s:.0f}-{14 * s:.0f}l-{16 * s:.0f} {28 * s:.0f}z" fill="{_dark(col, .15)}"/>'
            f'<circle cx="{cx}" cy="{cy + 6}" r="{22 * s:.0f}" fill="{_dark(col, .08)}"/>')


def _breath(rnd, cx, cy, spread, n):
    out = []
    for _ in range(n):
        a, d = rnd.uniform(0, 6.283), spread * (.55 + .5 * rnd.random())
        x, y = cx + d * math.cos(a), cy + d * math.sin(a) * .85
        out.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{rnd.choice([4, 5, 6]):.0f}" fill="#fff" opacity=".92"/>')
    return "".join(out)


def _butterfly(x, y, s, col, rot):
    return (f'<g transform="translate({x} {y}) rotate({rot}) scale({s})"><ellipse cx="-22" cy="-12" rx="26" ry="18" fill="{col}" transform="rotate(-25 -22 -12)"/>'
            f'<ellipse cx="22" cy="-12" rx="26" ry="18" fill="{col}" transform="rotate(25 22 -12)"/><ellipse cx="-16" cy="14" rx="17" ry="12" fill="{_dark(col, .2)}" transform="rotate(20 -16 14)"/>'
            f'<ellipse cx="16" cy="14" rx="17" ry="12" fill="{_dark(col, .2)}" transform="rotate(-20 16 14)"/><rect x="-3" y="-20" width="6" height="42" rx="3" fill="#1d2433"/></g>')


def ribbon_bouquet(kind, pal):
    """rr<count><k|w><b: butterflies><x: ivory roses><g: glitter><s: birthday sash>  (k = black wrap, w = cream wrap)"""
    m = re.fullmatch(r"rr(\d+)([kw])([bxgs]*)", kind)
    n, wrap, flags = int(m.group(1)), m.group(2), m.group(3)
    c1, c2, a, b = pal
    rose_col = "#f6efe6" if "x" in flags else a
    rnd = random.Random(n * 7 + len(flags))
    dark_wrap, light_wrap = ("#2a2330", "#4a4052") if wrap == "k" else ("#efe5d6", "#fbf6ee")
    cx, cy = 400, 330
    rc = min(215, 60 + 50 * math.sqrt(n)) if n > 1 else 0
    c = rc / math.sqrt(n) if n > 1 else 0
    rr = min(105, c * 1.18) if n > 1 else 105
    cone_top = cy - 28 + rc * .35
    out = [f'<path d="M400 705L{max(150, 400 - rc - rr - 30):.0f} {cone_top + 60:.0f}Q400 {cone_top - 90:.0f} {min(650, 400 + rc + rr + 30):.0f} {cone_top + 60:.0f}Z" fill="{dark_wrap}"/>',
           f'<path d="M400 705L{max(190, 400 - rc * .8 - rr):.0f} {cone_top + 120:.0f}L400 {cone_top + 40:.0f}L{min(610, 400 + rc * .8 + rr):.0f} {cone_top + 120:.0f}Z" fill="{light_wrap}" opacity=".55"/>',
           f'<path d="M400 705l-26-170M400 705l26-170M400 705l-70-150M400 705l70-150" stroke="{_light(dark_wrap, .15)}" stroke-width="3" opacity=".45"/>']
    if wrap == "k":
        out.append(_breath(rnd, cx, cy + 10, rc + rr, 26 if n > 1 else 18))
    pts = [(cx + c * math.sqrt(i + .5) * math.cos(i * 2.39996), cy + c * math.sqrt(i + .5) * math.sin(i * 2.39996) * .92) for i in range(n)] if n > 1 else [(cx, cy)]
    for i in reversed(range(len(pts))):
        out.append(_rose(pts[i][0], pts[i][1], rr, rose_col, glitter="g" in flags, seed=i))
    if "b" in flags:
        for x, y, s, rot in [(330, 250, 1.1, -18), (480, 290, .95, 22), (400, 190, .8, 8), (545, 215, .7, 30)]:
            out.append(_butterfly(x, y, s, "#1f5fd0", rot))
    if "s" in flags:
        out.append('<g transform="rotate(-9 400 340)"><rect x="110" y="300" width="580" height="86" fill="#1c1820"/><rect x="110" y="300" width="580" height="86" fill="none" stroke="#d9b45a" stroke-width="3"/>'
                   '<text x="400" y="358" text-anchor="middle" font-family="Georgia, serif" font-weight="bold" font-size="42" letter-spacing="6" fill="#e6c068">HAPPY BIRTHDAY</text></g>')
    out.append(_bow(400, 585, "#d9304a" if wrap == "k" and "x" not in flags else _dark(a, .05), 1.0))
    return "".join(out)


def gajray(kind, pal):
    """gj0 corsage, gj1 simple, gj2 with stamens, gj3 with pearl latkans, gj4 crown; trailing x = ivory roses"""
    m = re.fullmatch(r"gj(\d)(x?)", kind)
    t, ivory = int(m.group(1)), bool(m.group(2))
    c1, c2, a, b = pal
    col = "#f6efe6" if ivory else a
    rnd = random.Random(t * 13)
    out = []

    def stamens(x, y, n=7, spread=46):
        s = []
        for _ in range(n):
            ang = rnd.uniform(-2.6, -.5)
            ln = rnd.uniform(40, spread + 40)
            ex, ey = x + ln * math.cos(ang), y + ln * math.sin(ang)
            s.append(f'<path d="M{x:.0f} {y:.0f}L{ex:.0f} {ey:.0f}" stroke="#c9a54c" stroke-width="4" stroke-linecap="round"/><circle cx="{ex:.0f}" cy="{ey:.0f}" r="7" fill="{rnd.choice(["#e6c068", "#d8d8e0", "#c9a54c"])}"/>')
        return "".join(s)

    if t == 4:  # crown
        import math as _m
        pts = [(400 + 270 * _m.cos(_m.radians(ang)), 560 + 270 * _m.sin(_m.radians(ang))) for ang in range(205, 336, 22)]
        out.append(f'<path d="M{pts[0][0]:.0f} {pts[0][1]:.0f}A270 270 0 0 1 {pts[-1][0]:.0f} {pts[-1][1]:.0f}" fill="none" stroke="#3f8a63" stroke-width="18" stroke-linecap="round"/>')
        out.append(_breath(rnd, 400, 310, 250, 34))
        for i, (x, y) in enumerate(pts):
            out.append(_rose(x, y, 58 if 0 < i < len(pts) - 1 else 46, col, seed=i))
            for dx in (-34, 34):
                out.append(f'<ellipse cx="{x + dx:.0f}" cy="{y - 54:.0f}" rx="12" ry="26" fill="#4fa77a" transform="rotate({dx} {x + dx:.0f} {y - 54:.0f})"/>')
        out.append(_bow(626, 520, _dark(a, .1), .7))
        return "".join(out)

    if t == 0:  # wrist corsage
        out.append(f'<ellipse cx="400" cy="470" rx="230" ry="110" fill="none" stroke="{_light(a, .45)}" stroke-width="40"/><ellipse cx="400" cy="470" rx="230" ry="110" fill="none" stroke="{a}" stroke-width="10" opacity=".35"/>')
        for x, y, r in [(320, 330, 90), (470, 360, 100)]:
            out.append(_rose(x, y, r, col, seed=x))
            out.append(stamens(x + 20, y - 10, 6, 36))
        for x, y in [(400, 440)]:
            out.append(f'<ellipse cx="{x}" cy="{y}" rx="40" ry="20" fill="#4fa77a"/>')
        out.append('<g fill="#fff" opacity=".9">' + "".join(f'<circle cx="{rnd.randint(250, 550)}" cy="{rnd.randint(240, 300)}" r="{rnd.choice([4, 5])}"/>' for _ in range(14)) + "</g>")
        return "".join(out)

    xs = [175, 290, 400, 510, 625]
    out.append(f'<path d="M110 330Q400 250 690 330" fill="none" stroke="{_dark(b, .1) if b != "#ffffff" else _light(a, .5)}" stroke-width="46" stroke-linecap="round"/>')
    for x in xs:
        out.append(f'<ellipse cx="{x - 50}" cy="{300}" rx="14" ry="38" fill="#4fa77a" transform="rotate(-50 {x - 50} 300)"/><ellipse cx="{x + 50}" cy="{300}" rx="14" ry="38" fill="#4fa77a" transform="rotate(50 {x + 50} 300)"/>')
    for i, x in enumerate(xs):
        y = 320 - (60 if i in (0, 4) else 0) * 0 + (-18 if i == 2 else 0) + (14 if i in (0, 4) else 0)
        out.append(_rose(x, y, 66 if i != 2 else 78, col, seed=i))
    if t >= 2:
        for x in (232, 345, 455, 568, 400):
            out.append(stamens(x, 270, 5, 30))
    if t >= 3:
        for i, x in enumerate(xs):
            ln = 250 if i % 2 == 0 else 190
            y = 390
            out.append(f'<path d="M{x} {y}L{x} {y + ln}" stroke="#d8d4cc" stroke-width="3"/>')
            for k in range(int(ln / 26)):
                out.append(f'<circle cx="{x}" cy="{y + 14 + k * 26}" r="9" fill="#fbf6ee" stroke="#cfc6b8" stroke-width="2"/>')
            ey = y + ln + 18
            out.append(f'<circle cx="{x}" cy="{ey}" r="26" fill="{col}"/><circle cx="{x - 14}" cy="{ey + 8}" r="20" fill="{_dark(col, .12)}"/><circle cx="{x + 14}" cy="{ey + 8}" r="20" fill="{_light(col, .1)}"/><circle cx="{x}" cy="{ey - 6}" r="11" fill="#e6c068"/>')
    return "".join(out)


def chocolate_bouquet(kind, pal):
    """cq0 small, cq1 large"""
    big = kind == "cq1"
    c1, c2, a, b = pal
    n = 7 if big else 5
    wraps = ["#5a2c83", "#7a3b1e", "#c0312e", "#5a2c83", "#4a2a1c"]
    out = []
    angs = [(-34 + i * 68 / (n - 1)) for i in range(n)]
    for i in sorted(range(n), key=lambda k: -abs(angs[k])):
        ang = angs[i]
        col = wraps[i % len(wraps)]
        w, h = (92, 330) if big else (100, 340)
        out.append(f'<g transform="translate(400 600) rotate({ang:.1f}) translate({-w / 2} {-h - 20})"><rect width="{w}" height="{h}" rx="10" fill="{col}"/>'
                   f'<rect width="{w}" height="{h * .09:.0f}" fill="#e6c068"/><rect x="{w * .12:.0f}" y="{h * .16:.0f}" width="{w * .76:.0f}" height="{h * .22:.0f}" rx="6" fill="#fff" opacity=".9"/>'
                   f'<rect x="{w * .24:.0f}" y="{h * .25:.0f}" width="{w * .52:.0f}" height="9" rx="4" fill="{col}"/>'
                   f'<path d="M{w * .5:.0f} {h * .45:.0f}V{h:.0f}M{w * .12:.0f} {h * .6:.0f}H{w * .88:.0f}M{w * .12:.0f} {h * .78:.0f}H{w * .88:.0f}" stroke="#000" stroke-opacity=".2" stroke-width="3"/></g>')
    out.append('<path d="M400 715L215 470Q400 380 585 470Z" fill="#fbf7f0"/><path d="M400 715L300 470 400 430 500 470Z" fill="#fff" opacity=".8"/>'
               f'<path d="M400 715L215 470M400 715L585 470" stroke="{c2}" stroke-width="5" fill="none"/>')
    out.append(_bow(400, 560, "#d9a21e", 1.05))
    return "".join(out)


def draw(kind, pal, price, name):
    c1, c2, a, b = pal
    if kind.startswith("rr"):
        return ribbon_bouquet(kind, pal)
    if kind.startswith("gj"):
        return gajray(kind, pal)
    if kind.startswith("cq"):
        return chocolate_bouquet(kind, pal)
    if kind == "mug":
        return f'''<path d="M250 270h300v250a110 110 0 0 1-110 110h-80a110 110 0 0 1-110-110z" fill="{b}"/>
  <path d="M550 330h40a60 60 0 0 1 0 140h-40" fill="none" stroke="{b}" stroke-width="34" stroke-linecap="round"/>
  <rect x="250" y="270" width="300" height="46" fill="{a}"/>
  <g transform="translate(400 470) scale(1.1)"><path d="{HEART}" fill="{a}"/></g>
  <rect x="268" y="300" width="60" height="300" fill="url(#sh)"/>'''
    if kind == "candle":
        return f'''<rect x="270" y="360" width="260" height="300" rx="40" fill="{b}" opacity=".95"/>
  <rect x="270" y="360" width="260" height="60" rx="30" fill="{a}" opacity=".35"/>
  <rect x="270" y="480" width="260" height="110" fill="{a}" opacity=".18"/>
  <rect x="296" y="380" width="46" height="260" rx="22" fill="url(#sh)"/>
  <rect x="396" y="310" width="8" height="70" rx="4" fill="#5a3d33"/>
  <path d="M400 190c46 56 56 96 0 126-56-30-46-70 0-126z" fill="#f7a93b"/><path d="M400 236c20 26 24 44 0 58-24-14-20-32 0-58z" fill="#fde08a"/>
  <g transform="translate(400 545) scale(.8)"><path d="{HEART}" fill="{a}"/></g>'''
    if kind == "giftbox":
        return f'''<rect x="210" y="360" width="380" height="290" rx="20" fill="{a}"/>
  <rect x="190" y="300" width="420" height="90" rx="20" fill="{a}"/><rect x="190" y="300" width="420" height="90" rx="20" fill="#000" opacity=".12"/>
  <rect x="370" y="300" width="60" height="350" fill="{b}"/>
  <path d="M400 300c-80-90-160-20-80 18l80 8zM400 300c80-90 160-20 80 18l-80 8z" fill="{b}"/>
  <rect x="226" y="372" width="40" height="260" rx="10" fill="url(#sh)"/>'''
    if kind == "bouquet":
        blooms = "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{col}"/><circle cx="{x}" cy="{y}" r="{r*0.38:.0f}" fill="#f7d57a"/>'
                         for x, y, r, col in [(310, 300, 62, a), (400, 250, 70, b), (490, 300, 62, a), (350, 380, 56, b), (450, 385, 58, a), (400, 340, 52, "#f3a9bf")])
        return f'''<path d="M330 400l70 250 70-250z" fill="#3f8a63"/>
  <path d="M290 420l110 240 110-240-110 40z" fill="{b}" opacity=".92"/><path d="M290 420l110 240 40-230z" fill="{a}" opacity=".35"/>
  <path d="M360 450l-90-60M440 450l90-60" stroke="#3f8a63" stroke-width="14" stroke-linecap="round"/>
  {blooms}'''
    if kind == "pendant":
        return f'''<path d="M170 190c40 250 150 330 230 330s190-80 230-330" fill="none" stroke="{a}" stroke-width="9" stroke-linecap="round"/>
  <path d="M170 190c40 250 150 330 230 330s190-80 230-330" fill="none" stroke="{b}" stroke-width="3" stroke-dasharray="2 14" stroke-linecap="round"/>
  <circle cx="400" cy="548" r="9" fill="{a}"/>
  <g transform="translate(400 620) scale(.85)"><path d="{HEART}" fill="{a}"/><path d="{HEART}" fill="{b}" opacity=".25" transform="scale(.6) translate(-10 -20)"/></g>'''
    if kind == "ring":
        return f'''<circle cx="400" cy="450" r="150" fill="none" stroke="{a}" stroke-width="44"/>
  <circle cx="400" cy="450" r="150" fill="none" stroke="{b}" stroke-width="8" opacity=".5" stroke-dasharray="40 600" stroke-dashoffset="-40"/>
  <path d="M400 225l62 62-62 50-62-50z" fill="{b}"/><path d="M400 225l62 62h-124z" fill="{c1}"/><path d="M338 287l62 50 62-50z" fill="{a}" opacity=".45"/>'''
    if kind == "watch":
        return f'''<rect x="340" y="110" width="120" height="180" rx="30" fill="{a}"/><rect x="340" y="510" width="120" height="190" rx="30" fill="{a}"/>
  <circle cx="400" cy="400" r="170" fill="{a}"/><circle cx="400" cy="400" r="142" fill="{b}"/>
  <g stroke="{a}" stroke-width="8" stroke-linecap="round"><path d="M400 400V300"/><path d="M400 400l64 36"/></g><circle cx="400" cy="400" r="12" fill="{a}"/>
  <g fill="{a}"><circle cx="400" cy="282" r="6"/><circle cx="400" cy="518" r="6"/><circle cx="282" cy="400" r="6"/><circle cx="518" cy="400" r="6"/></g>'''
    if kind == "book":
        return f'''<rect x="240" y="170" width="330" height="470" rx="18" fill="{a}"/>
  <rect x="270" y="190" width="300" height="470" rx="14" fill="{b}"/><rect x="240" y="170" width="330" height="470" rx="18" fill="{a}"/>
  <rect x="262" y="170" width="14" height="470" fill="#000" opacity=".15"/>
  <rect x="330" y="260" width="190" height="14" rx="7" fill="{b}" opacity=".9"/><rect x="330" y="294" width="130" height="14" rx="7" fill="{b}" opacity=".7"/>
  <g transform="translate(425 490) scale(.9)"><path d="{HEART}" fill="{b}" opacity=".95"/></g>'''
    if kind == "plant":
        return f'''<path d="M300 520h200l-26 150H326z" fill="{a}"/><rect x="290" y="496" width="220" height="40" rx="14" fill="{a}"/><rect x="290" y="496" width="220" height="40" rx="14" fill="#000" opacity=".1"/>
  <g fill="#3f8a63"><path d="M400 500c-100-40-130-150-80-250 70 60 100 150 80 250z"/><path d="M400 500c100-40 130-150 80-250-70 60-100 150-80 250z"/>
  <path d="M400 500c-30-100-20-210 0-320 20 110 30 220 0 320z" fill="#4fa77a"/><path d="M400 520c-120 0-190-60-200-140 90 0 170 50 200 140z" opacity=".85"/><path d="M400 520c120 0 190-60 200-140-90 0-170 50-200 140z" opacity=".85"/></g>'''
    if kind == "card":
        return f'''<g transform="rotate(-6 400 420)"><rect x="230" y="190" width="340" height="460" rx="20" fill="{b}"/>
  <rect x="256" y="216" width="288" height="408" rx="12" fill="none" stroke="{a}" stroke-width="4" stroke-dasharray="10 10" opacity=".7"/>
  <g transform="translate(400 330) scale(1.1)"><path d="{HEART}" fill="{a}"/></g>
  <rect x="300" y="470" width="200" height="14" rx="7" fill="{a}" opacity=".5"/><rect x="330" y="506" width="140" height="14" rx="7" fill="{a}" opacity=".35"/><rect x="350" y="542" width="100" height="14" rx="7" fill="{a}" opacity=".25"/></g>
  <g transform="translate(610 210) rotate(14)" fill="{a}" opacity=".85"><path d="M0 -26l8 18 20 2-15 14 5 20-18-10-18 10 5-20-15-14 20-2z"/></g>'''
    if kind == "egift":
        amount = f"Rs {price:,}"
        return f'''<rect x="150" y="250" width="500" height="310" rx="30" fill="{b}"/>
  <path d="M150 280a30 30 0 0 1 30-30h440a30 30 0 0 1 30 30v62H150z" fill="{a}"/>
  <text x="200" y="312" font-family="Georgia, serif" font-size="44" fill="{b}">Gift card</text>
  <g transform="translate(588 420) scale(.55)"><path d="{HEART}" fill="{a}"/></g>
  <text x="200" y="470" font-family="Georgia, serif" font-size="68" fill="{a}">{amount}</text>
  <rect x="200" y="505" width="220" height="14" rx="7" fill="{a}" opacity=".25"/>'''
    if kind == "bottle":
        return f'''<rect x="350" y="150" width="100" height="90" rx="14" fill="{a}"/><rect x="368" y="230" width="64" height="40" fill="{a}" opacity=".7"/>
  <rect x="270" y="262" width="260" height="400" rx="46" fill="{b}" opacity=".96"/><rect x="270" y="262" width="260" height="400" rx="46" fill="{a}" opacity=".16"/>
  <rect x="300" y="420" width="200" height="120" rx="16" fill="{b}"/><g transform="translate(400 480) scale(.5)"><path d="{HEART}" fill="{a}"/></g>
  <rect x="294" y="290" width="40" height="340" rx="20" fill="url(#sh)"/>'''
    if kind == "frame":
        return f'''<rect x="180" y="200" width="440" height="440" rx="14" fill="{a}"/><rect x="180" y="200" width="440" height="440" rx="14" fill="#000" opacity=".08"/>
  <rect x="226" y="246" width="348" height="348" fill="{b}"/><rect x="226" y="246" width="348" height="348" fill="{c1}" opacity=".6"/>
  <circle cx="320" cy="350" r="34" fill="#f7d57a"/><path d="M226 594l110-150 80 100 60-70 98 120z" fill="{a}" opacity=".55"/>
  <g transform="translate(470 330) scale(.45)"><path d="{HEART}" fill="{a}"/></g>'''
    if kind == "pillow":
        return f'''<path d="M200 230c120-30 280-30 400 0 30 120 30 220 0 340-120 30-280 30-400 0-30-120-30-220 0-340z" fill="{a}"/>
  <path d="M200 230c120-30 280-30 400 0 30 120 30 220 0 340-120 30-280 30-400 0-30-120-30-220 0-340z" fill="url(#sh)" opacity=".5"/>
  <path d="M250 290c100-20 200-20 300 0 18 90 18 130 0 220-100 20-200 20-300 0-18-90-18-130 0-220z" fill="none" stroke="{b}" stroke-width="3" stroke-dasharray="3 12" stroke-linecap="round"/>
  <g transform="translate(400 420) scale(1.2)"><path d="{HEART}" fill="{b}" opacity=".95"/></g>'''
    if kind == "gadget":
        return f'''<rect x="250" y="190" width="300" height="470" rx="46" fill="{a}"/><rect x="274" y="214" width="252" height="422" rx="30" fill="{b}"/>
  <circle cx="400" cy="320" r="86" fill="{a}" opacity=".9"/><circle cx="400" cy="320" r="46" fill="{b}" opacity=".9"/><circle cx="400" cy="320" r="14" fill="{a}"/>
  <circle cx="400" cy="480" r="58" fill="{a}" opacity=".9"/><circle cx="400" cy="480" r="30" fill="{b}" opacity=".9"/>
  <rect x="340" y="578" width="120" height="14" rx="7" fill="{a}" opacity=".5"/>'''
    if kind == "bag":
        return f'''<path d="M300 300c0-120 40-170 100-170s100 50 100 170" fill="none" stroke="{a}" stroke-width="28" stroke-linecap="round"/>
  <path d="M220 290h360l30 360H190z" fill="{a}"/><path d="M220 290h360l30 360H190z" fill="#000" opacity=".08"/>
  <rect x="236" y="300" width="50" height="330" fill="url(#sh)"/>
  <g transform="translate(400 470) scale(1.25)"><path d="{HEART}" fill="{b}" opacity=".95"/></g>'''
    if kind == "cake":
        return f'''<rect x="210" y="440" width="380" height="190" rx="24" fill="{a}"/><rect x="250" y="320" width="300" height="140" rx="24" fill="{b}"/><rect x="250" y="320" width="300" height="140" rx="24" fill="{a}" opacity=".2"/>
  <path d="M250 350h300c0 28-30 36-50 22s-40 24-70 4-60 26-90 4-50 24-90 0z" fill="{b}"/>
  <path d="M210 470h380c0 30-34 40-56 24s-44 28-76 6-68 28-100 4-56 30-100 0-48 16-48-34z" fill="{b}" opacity=".95"/>
  <circle cx="400" cy="296" r="30" fill="#d9304a"/><path d="M400 266c10-30 30-40 50-40" fill="none" stroke="#3f8a63" stroke-width="8" stroke-linecap="round"/>
  <rect x="236" y="470" width="30" height="150" rx="14" fill="url(#sh)"/>'''
    if kind == "lamp":
        return f'''<path d="M300 150h200l60 220H240z" fill="{b}"/><path d="M300 150h200l60 220H240z" fill="{a}" opacity=".25"/>
  <rect x="388" y="370" width="24" height="230" fill="{a}"/><ellipse cx="400" cy="620" rx="110" ry="26" fill="{a}"/>
  <path d="M340 150h120l30 220H310z" fill="#fff" opacity=".35"/><circle cx="400" cy="360" r="170" fill="#f7d57a" opacity=".13"/>'''
    # tin (default): a round tin / hamper
    return f'''<ellipse cx="400" cy="570" rx="230" ry="60" fill="{a}"/><rect x="170" y="400" width="460" height="170" fill="{a}"/><rect x="170" y="400" width="460" height="170" fill="#000" opacity=".1"/>
  <ellipse cx="400" cy="400" rx="230" ry="60" fill="{b}"/><ellipse cx="400" cy="400" rx="206" ry="48" fill="{a}" opacity=".3"/>
  <rect x="170" y="440" width="460" height="46" fill="{b}" opacity=".9"/><g transform="translate(400 466) scale(.45)"><path d="{HEART}" fill="{a}"/></g>
  <rect x="198" y="410" width="40" height="150" rx="14" fill="url(#sh)"/>
  <path d="M400 360c-50-80-110-30-60 8l60 10zM400 360c50-80 110-30 60 8l-60 10z" fill="{b}" opacity=".9"/>'''


def yes(v):
    return "yes" if v else "no"


def main():
    os.makedirs(IMG_DIR, exist_ok=True)
    groups = []
    for key, (slug, name, blurb) in SENTIMENTS.items():
        groups.append(("sentiment", slug, name, blurb, len([g for g in groups if g[0] == "sentiment"]) + 1))
    for key, (slug, name) in OCCASIONS.items():
        groups.append(("occasion", slug, name, "", len([g for g in groups if g[0] == "occasion"]) + 1))
    for key, (slug, name) in RECIPIENTS.items():
        groups.append(("recipient", slug, name, "", len([g for g in groups if g[0] == "recipient"]) + 1))
    for key, (slug, name) in CATEGORIES.items():
        groups.append(("category", slug, name, "", len([g for g in groups if g[0] == "category"]) + 1))
    with open(os.path.join(SAMPLES, "demo-taxonomy.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["kind", "slug", "name", "blurb", "image", "sortOrder"])
        for kind, slug, name, blurb, order in groups:
            w.writerow([kind, slug, name, blurb, "", order])

    rows, seen = [], set()
    for (name, cat, price, pic, pal, desc, s, o, r, flags) in ITEMS:
        slug = slugify(name)
        assert slug not in seen, f"duplicate slug {slug}"
        seen.add(slug)
        fl = flags.split()
        mto = next((x for x in fl if re.fullmatch(r"m\d+-\d+", x)), None)
        offer = next((int(x[1:]) for x in fl if re.fullmatch(r"o\d+", x)), None)
        stock = next((int(x[1:]) for x in fl if re.fullmatch(r"s\d+", x)), 0)
        digital = "eg" in fl or "gc" in fl
        kind_digital = "egift" if "eg" in fl else ("greeting" if "gc" in fl else "")
        assert offer is None or offer < price, name
        lo, hi = (mto[1:].split("-") if mto else ("", ""))
        feelings = "|".join(SENTIMENTS[k][0] for k in s.split(","))
        occasions = "|".join(OCCASIONS[k][0] for k in o.split(","))
        recipients = "|".join(RECIPIENTS[k][0] for k in r.split(","))
        if digital:
            extras = ""
            stock = 9999
        else:
            extras = "premium_wrap|keepsake_box" if cat not in ("food", "flowers", "plants") else "premium_wrap"
            if cat == "flowers":
                extras += "|dried_flower_posy"
            if not mto:
                extras += "|express_same_day"
        rows.append([
            slug, name, desc, price, offer if offer else "", "digital" if digital else "physical", kind_digital, stock, CATEGORIES[cat][0],
            feelings, occasions, recipients, extras, yes(bool(mto)), lo, hi, yes("p" in fl), "yes", f"/images/demo/{slug}.svg",
        ])
        with open(os.path.join(IMG_DIR, slug + ".svg"), "w", encoding="utf-8", newline="\n") as f:
            f.write(scene(draw(pic, PALETTES[pal], price, name), PALETTES[pal], name))

    with open(os.path.join(SAMPLES, "demo-products.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["slug", "name", "description", "price", "offerPrice", "type", "digitalKind", "stock", "category", "sentiments", "occasions", "recipients", "allowedExtras", "isMadeToOrder", "leadTimeMinDays", "leadTimeMaxDays", "isPerishable", "isActive", "imageUrls"])
        w.writerows(rows)
    print(f"{len(groups)} groups, {len(rows)} gifts, {len(rows)} pictures")


main()
