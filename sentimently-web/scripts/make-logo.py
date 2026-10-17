"""Draws the Bloomora logo once and writes every copy of it.

    python scripts/make-logo.py

Writes:
  packages/ui/src/logo-art.ts                       the mark, for the React <Logo> component
  apps/*/public/brand/*.svg                         standalone files: mark, favicon, light and dark lockups
The colours are the shop's own: deep plum, rose and gold on ivory.
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.dirname(HERE)


def star(x, y, s, fill="#f6e3a1", op=1):
    return (f'<path d="M{x} {y-s} Q{x} {y} {x+s} {y} Q{x} {y} {x} {y+s} Q{x} {y} {x-s} {y} Q{x} {y} {x} {y-s}Z" '
            f'fill="{fill}" opacity="{op}"/>')


def rose(cx, cy, r):
    k = r / 26
    return f'''<g transform="translate({cx} {cy}) scale({k:.3f})">
    <circle r="26" fill="url(#__ID__r)"/>
    <circle r="26" fill="none" stroke="url(#__ID__g)" stroke-width="1.1" opacity=".8"/>
    <path d="M-15 -9 A18 18 0 0 1 15 -9" fill="none" stroke="#7c2043" stroke-width="1.7" stroke-linecap="round" opacity=".85"/>
    <path d="M-19 5 A21 21 0 0 0 17 13" fill="none" stroke="#7c2043" stroke-width="1.7" stroke-linecap="round" opacity=".8"/>
    <path d="M0 -3 a5 5 0 1 1 5 5 a9 9 0 1 1 -9 -9 a13 13 0 1 1 13 13" fill="none" stroke="#6a1a3a" stroke-width="1.8" stroke-linecap="round" opacity=".9"/>
    <path d="M-17 -12 A21 21 0 0 1 6 -21" fill="none" stroke="#fbc3d3" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>
    <circle cx="9" cy="-14" r="1" fill="#f6e3a1"/><circle cx="-11" cy="12" r=".9" fill="#f6e3a1"/><circle cx="14" cy="9" r=".8" fill="#f6e3a1"/>
  </g>'''


def leaf(x, y, rot, gold=False, s=1.0):
    fill = "url(#__ID__g)" if gold else "url(#__ID__l)"
    stroke = "#2a1633" if gold else "#c89b3c"
    return (f'<g transform="translate({x} {y}) rotate({rot}) scale({s})">'
            f'<path d="M0 0 C10 -9 28 -9 38 0 C28 9 10 9 0 0Z" fill="{fill}" stroke="{stroke}" stroke-width=".7" stroke-opacity=".6"/>'
            f'<path d="M3 0 L34 0" stroke="{stroke}" stroke-width=".6" opacity=".55"/></g>')


leaves = "".join([
    leaf(97, 168, 118, False, 1.0), leaf(103, 168, 62, False, 1.0), leaf(100, 170, 90, True, .8),
    leaf(70, 150, 158, False, 1.1), leaf(130, 150, 22, False, 1.1),
    leaf(58, 128, 186, True, 1.0), leaf(142, 128, -6, True, 1.0),
    leaf(64, 112, 214, False, .9), leaf(136, 112, -34, False, .9),
])

berries = "".join(f'<circle cx="{x}" cy="{y}" r="1.9" fill="url(#__ID__g)"/>' for x, y in
                  [(150, 100), (155, 108), (146, 112), (50, 100), (45, 108), (54, 112), (160, 124), (40, 124)])

sparkles = "".join([star(34, 70, 6), star(168, 60, 7), star(22, 136, 4, op=.8), star(180, 130, 5), star(100, 190, 4, op=.7), star(150, 44, 3.5, op=.8)])

crown = '''<g>
    <path d="M58 70 C58 50 142 50 142 70 Z" fill="url(#__ID__p)"/>
    <path d="M50 70 L44 34 L62 52 L72 26 L86 52 L100 16 L114 52 L128 26 L138 52 L156 34 L150 70 Z" fill="url(#__ID__g)" stroke="#8a6514" stroke-width=".8" stroke-linejoin="round"/>
    <path d="M58 70 C58 50 142 50 142 70 Z" fill="url(#__ID__p)"/>
    <path d="M58 70 C58 50 142 50 142 70" fill="none" stroke="url(#__ID__g)" stroke-width="1.4"/>
    <g fill="#e0577f" stroke="#f6e3a1" stroke-width=".6"><path d="M80 66 l3 -4 l3 4 l-3 4z"/><path d="M98.5 62 l3 -4 l3 4 l-3 4z" transform="translate(-2 0)"/><path d="M114 66 l3 -4 l3 4 l-3 4z"/></g>
    <rect x="48" y="68" width="104" height="14" rx="3.5" fill="url(#__ID__g)" stroke="#8a6514" stroke-width=".8"/>
    <g fill="#2a1633" stroke="#f6e3a1" stroke-width=".7"><circle cx="64" cy="75" r="3.3"/><circle cx="100" cy="75" r="3.9"/><circle cx="136" cy="75" r="3.3"/></g>
    <g fill="#fbeab4"><circle cx="44" cy="33" r="3"/><circle cx="72" cy="25" r="3"/><circle cx="100" cy="15" r="3.4"/><circle cx="128" cy="25" r="3"/><circle cx="156" cy="33" r="3"/></g>
    <path d="M100 6 l2.6 5 l-2.6 5 l-2.6 -5z" fill="url(#__ID__g)"/>
  </g>'''

MARK = f'''<defs>
  <linearGradient id="__ID__g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7e3a0"/><stop offset=".5" stop-color="#cf9f3c"/><stop offset="1" stop-color="#8a6514"/></linearGradient>
  <radialGradient id="__ID__r" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#f08aa7"/><stop offset=".55" stop-color="#c43d68"/><stop offset="1" stop-color="#7c2043"/></radialGradient>
  <linearGradient id="__ID__l" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4d2a66"/><stop offset="1" stop-color="#2a1633"/></linearGradient>
  <linearGradient id="__ID__p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a2a62"/><stop offset="1" stop-color="#1d0f26"/></linearGradient>
  <radialGradient id="__ID__w" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#f6e3a1" stop-opacity=".5"/><stop offset="1" stop-color="#f6e3a1" stop-opacity="0"/></radialGradient>
</defs>
<circle cx="100" cy="118" r="88" fill="url(#__ID__w)"/>
{leaves}
{berries}
{rose(74, 110, 14)}{rose(126, 110, 14)}
{rose(64, 142, 22)}{rose(136, 142, 22)}
{rose(100, 124, 30)}
{crown}
{sparkles}'''


def with_ids(markup, prefix):
    return markup.replace("__ID__", prefix)


# ---------------------------------------------------------------- the React component's art
ts = f'''/* Generated by scripts/make-logo.py: do not edit by hand. The Bloomora mark (crown and roses), 200 x 200.
   "__ID__" is replaced with a unique prefix wherever the mark is drawn, so several copies can share a page. */
export const MARK_ART = `{MARK}`;
'''
with open(os.path.join(WEB, "packages", "ui", "src", "logo-art.ts"), "w", encoding="utf-8", newline="\n") as f:
    f.write(ts)

# ---------------------------------------------------------------- standalone files
FONT = "Fraunces Variable, Cormorant Garamond, Georgia, 'Times New Roman', serif"


def lockup(dark: bool):
    word = "#f6e3a1" if dark else "#2a1633"
    tag = "#d9c8e3" if dark else "#8a6514"
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 330" role="img" aria-label="Bloomora, luxury gifts and handmade bouquets">
  <g transform="translate(110 0)">{with_ids(MARK, "m")}</g>
  <text x="210" y="252" text-anchor="middle" font-family="{FONT}" font-size="52" font-weight="500" letter-spacing="9" fill="{word}">BLOOMORA</text>
  <text x="210" y="288" text-anchor="middle" font-family="{FONT}" font-size="12.5" letter-spacing="3.6" fill="{tag}">LUXURY GIFTS &amp; HANDMADE BOUQUETS</text>
</svg>
'''


mark_svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="Bloomora">{with_ids(MARK, "m")}</svg>\n'
favicon = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a2a62"/><stop offset="1" stop-color="#1d0f26"/></linearGradient></defs>
  <rect width="64" height="64" rx="15" fill="url(#bg)"/>
  <g transform="translate(5 7) scale(.27)">{with_ids(MARK, "f")}</g>
</svg>
'''

files = {
    "bloomora-mark.svg": mark_svg,
    "bloomora-logo.svg": lockup(False),
    "bloomora-logo-on-dark.svg": lockup(True),
    "favicon.svg": favicon,
}
for app in ("storefront", "admin"):
    out = os.path.join(WEB, "apps", app, "public", "brand")
    os.makedirs(out, exist_ok=True)
    for name, content in files.items():
        with open(os.path.join(out, name), "w", encoding="utf-8", newline="\n") as f:
            f.write(content)
print("wrote logo-art.ts and", len(files), "brand files for 2 apps")
