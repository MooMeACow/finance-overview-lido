"""How it works, as a pool seen from above: one lane per step, lane ropes in between.

Writes workflow-day.svg and workflow-night.svg. The lane numbers are Bricolage Grotesque
outlined to paths (README SVGs can't load fonts) and the icons are the app's Phosphor set.
"""
from __future__ import annotations

import random
import re
import sys
from pathlib import Path

import numpy as np
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from scipy.spatial import Voronoi

HERE = Path(__file__).resolve().parent
PROJECT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else HERE.parents[2]
OUT = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else HERE.parent

STEPS = [
    ('FileCsv', 'Export a CSV from your bank', 'ING and Revolut are recognised. Other banks: match the columns once.', 'ING · Revolut · any bank'),
    ('Browser', 'Import it in your browser', 'Duplicates are skipped, categories learn, own transfers are left out.', 'parsed client-side'),
    ('Devices', 'It stays on your device', 'Kept in your browser, or on your phone. Nothing is uploaded.', 'browser storage · SQLite'),
    ('LockKey', 'Sync it encrypted, if you like', 'Locked with your passphrase first. Cloudflare only stores ciphertext.', 'AES-GCM · PBKDF2 ×600k'),
]
MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace"

THEMES = {
    'day': {
        'deck': ('#FDEBD0', '#FBF3E4'),
        'coping': '#F1E2C6',
        'water': ('#0B3FA8', '#1557D0', '#2C8FE2'),
        'caustic': 'rgba(210,246,255,0.24)',
        'glow': 'rgba(210,246,255,0.07)',
        'chip': 'rgba(255,248,236,0.13)',
        'tile': '#FFF8EC',
        'numeral': '#1F4FE0',
        'text': '#FFF8EC',
        'muted': 'rgba(255,248,236,0.84)',
        'duo': '#FFB938',
        'floats': ('#FFF8EC', '#8DEBFF', '#FFB938'),
    },
    'night': {
        'deck': ('#0A1A44', '#07122E'),
        'coping': '#14285F',
        'water': ('#041448', '#0A2E86', '#1460B8'),
        'caustic': 'rgba(134,228,255,0.22)',
        'glow': 'rgba(134,228,255,0.07)',
        'chip': 'rgba(255,248,236,0.11)',
        'tile': '#FFF8EC',
        'numeral': '#123AA8',
        'text': '#FFF8EC',
        'muted': 'rgba(255,248,236,0.8)',
        'duo': '#FFC95C',
        'floats': ('#FFF8EC', '#3FD4F5', '#FFC95C'),
    },
}

W = 1200
PAD = 32
LANE = 96
ROPE = 16
POOL_Y = PAD
POOL_H = 4 * LANE + 3 * ROPE
H = POOL_Y + POOL_H + PAD
FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif"


def icon_paths(name: str) -> tuple[str, str]:
    src = (PROJECT / 'node_modules/phosphor-react-native/src/defs' / f'{name}.tsx').read_text(encoding='utf-8')
    block = re.search(r"\[\s*'duotone',(.*?)\n  \],", src, re.S).group(1)
    paths = re.findall(r'<Path\s+d="([^"]+)"([^>]*)/>', block)
    tint = next(d for d, rest in paths if 'opacity' in rest)
    line = next(d for d, rest in paths if 'opacity' not in rest)
    return tint, line


def numeral(ch: str, size: float) -> tuple[str, float]:
    """A Bricolage 800 digit as an SVG path, origin at the baseline start; returns (d, advance)."""
    font = TTFont(PROJECT / 'node_modules/@expo-google-fonts/bricolage-grotesque/800ExtraBold/BricolageGrotesque_800ExtraBold.ttf')
    glyphs = font.getGlyphSet()
    name = font.getBestCmap()[ord(ch)]
    k = size / font['head'].unitsPerEm
    pen = SVGPathPen(glyphs, ntos=lambda v: f'{v:.1f}')
    glyphs[name].draw(TransformPen(pen, (k, 0, 0, -k, 0, 0)))
    return pen.getCommands(), glyphs[name].width * k


def caustics(x: float, y: float, w: float, h: float, seed: int = 11) -> str:
    """Light on the pool floor: the edges of a jittered cell pattern, gently bowed."""
    rnd = random.Random(seed)
    cell = 64
    pts = []
    for gy in range(-1, int(h / cell) + 2):
        for gx in range(-1, int(w / cell) + 2):
            pts.append((x + (gx + 0.2 + rnd.random() * 0.6) * cell, y + (gy + 0.2 + rnd.random() * 0.6) * cell * 0.82))
    vor = Voronoi(np.array(pts))
    out = []
    for (a, b) in vor.ridge_vertices:
        if a < 0 or b < 0:
            continue
        (x1, y1), (x2, y2) = vor.vertices[a], vor.vertices[b]
        if max(x1, x2) < x - 20 or min(x1, x2) > x + w + 20 or max(y1, y2) < y - 20 or min(y1, y2) > y + h + 20:
            continue
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        dx, dy = x2 - x1, y2 - y1
        bow = (rnd.random() - 0.5) * 0.35
        cx, cy = mx - dy * bow, my + dx * bow
        out.append(f'M{x1:.1f} {y1:.1f}Q{cx:.1f} {cy:.1f} {x2:.1f} {y2:.1f}')
    return ''.join(out)


def rope(y: float, x0: float, x1: float, floats: tuple[str, str, str]) -> str:
    beads = 44
    gap = 5
    bw = (x1 - x0 - gap * (beads - 1)) / beads
    parts = []
    for i in range(beads):
        near_wall = i < 4 or i >= beads - 4
        color = floats[2] if near_wall else floats[i % 2]
        parts.append(f'<rect x="{x0 + i * (bw + gap):.1f}" y="{y - 5:.1f}" width="{bw:.1f}" height="10" rx="5" fill="{color}"/>')
    return ''.join(parts)


def svg(theme: str) -> str:
    t = THEMES[theme]
    px, pw = PAD, W - 2 * PAD
    body = []
    body.append(
        f'<defs>'
        f'<linearGradient id="deck" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{t["deck"][0]}"/><stop offset="0.6" stop-color="{t["deck"][1]}"/></linearGradient>'
        f'<linearGradient id="water" x1="0" y1="0" x2="1" y2="0.35"><stop offset="0" stop-color="{t["water"][0]}"/><stop offset="0.55" stop-color="{t["water"][1]}"/><stop offset="1" stop-color="{t["water"][2]}"/></linearGradient>'
        f'<clipPath id="pool"><rect x="{px}" y="{POOL_Y}" width="{pw}" height="{POOL_H}" rx="24"/></clipPath>'
        f'</defs>'
    )
    body.append(f'<rect width="{W}" height="{H}" rx="32" fill="url(#deck)"/>')
    body.append(f'<rect x="{px - 6}" y="{POOL_Y - 6}" width="{pw + 12}" height="{POOL_H + 12}" rx="30" fill="{t["coping"]}"/>')
    body.append(f'<g clip-path="url(#pool)">')
    body.append(f'<rect x="{px}" y="{POOL_Y}" width="{pw}" height="{POOL_H}" fill="url(#water)"/>')
    light = caustics(px, POOL_Y, pw, POOL_H)
    body.append(f'<path d="{light}" fill="none" stroke="{t["glow"]}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>')
    body.append(f'<path d="{light}" fill="none" stroke="{t["caustic"]}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>')
    for i in range(3):
        body.append(rope(POOL_Y + (i + 1) * LANE + i * ROPE + ROPE / 2, px, px + pw, t['floats']))
    body.append('</g>')

    for i, (icon, title, caption, detail) in enumerate(STEPS):
        y0 = POOL_Y + i * (LANE + ROPE)
        cy = y0 + LANE / 2
        tile = 60
        tx = px + 26
        body.append(f'<g id="lane-{i + 1}">')
        body.append(f'<rect x="{tx}" y="{cy - tile / 2:.1f}" width="{tile}" height="{tile}" rx="16" fill="{t["tile"]}"/>')
        d, adv = numeral(str(i + 1), 40)
        body.append(f'<path transform="translate({tx + tile / 2 - adv / 2:.1f} {cy + 14.5:.1f})" d="{d}" fill="{t["numeral"]}"/>')
        tint, line = icon_paths(icon)
        s = 40 / 256
        ix = tx + tile + 26
        body.append(
            f'<g transform="translate({ix:.1f} {cy - 20:.1f}) scale({s:.4f})">'
            f'<path d="{tint}" fill="{t["duo"]}" opacity="0.9"/><path d="{line}" fill="{t["text"]}"/></g>'
        )
        lx = ix + 40 + 22
        body.append(f'<text x="{lx:.1f}" y="{cy - 5:.1f}" font-family="{FONT}" font-size="23" font-weight="700" fill="{t["text"]}">{title}</text>')
        body.append(f'<text x="{lx:.1f}" y="{cy + 24:.1f}" font-family="{FONT}" font-size="18.5" fill="{t["muted"]}">{caption}</text>')
        cw = len(detail) * 18 * 0.6 + 36
        cx = px + pw - 28 - cw
        body.append(f'<rect x="{cx:.1f}" y="{cy - 20:.1f}" width="{cw:.1f}" height="40" rx="20" fill="{t["chip"]}"/>')
        body.append(f'<text x="{cx + cw / 2:.1f}" y="{cy + 6:.1f}" text-anchor="middle" font-family="{MONO}" font-size="18" fill="{t["text"]}">{detail}</text>')
        body.append('</g>')

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-labelledby="title desc">'
        f'<title id="title">How Finance Overview works</title>'
        f'<desc id="desc">Four lanes of a pool: 1, export a CSV from your bank; 2, import it in your browser, where duplicates are skipped, categories learn and own transfers are left out; 3, it stays on your device; 4, optionally sync it, encrypted with your passphrase so Cloudflare only stores ciphertext.</desc>'
        + ''.join(body)
        + '</svg>\n'
    )


OUT.mkdir(parents=True, exist_ok=True)
for theme in THEMES:
    (OUT / f'workflow-{theme}.svg').write_text(svg(theme), encoding='utf-8')
    print('wrote', OUT / f'workflow-{theme}.svg', (OUT / f'workflow-{theme}.svg').stat().st_size // 1024, 'KB')
