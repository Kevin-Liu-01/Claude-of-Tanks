#!/usr/bin/env python3
# cot-symbols.py: builds public/fonts/cot-symbols/CotSymbols-{Medium,Bold}.woff2, the arrows and math marks the
# shipped Latin subsets lack. Copyright (c) 2026 Kevin B. Liu. The outlines derive from the shipped
# Chakra Petch Latin subsets (SIL OFL 1.1, no Reserved Font Name; Copyright 2018 The Chakra Petch Project Authors), so
# the output is licensed under the SIL OFL 1.1 too (public/fonts/cot-symbols/OFL.txt) under its own family name.
#
#   ← ↑ → ↓   Chakra Petch's own arrowup / arrowdown; the horizontal pair is that arrow turned a quarter, shaft trimmed
#   ≤ ≥       Chakra Petch's chevron (its '<' build: flat apex, stroke = the hyphen's weight) over its hyphen bar
#   ∞         two of Chakra Petch's chamfered 'o' rings fused on a shared stem, centred on the math axis
#   ł Ł ż Ż   Chakra Petch's own, for the Polish names on the display voice (PT-84 Orzeł, PT-84 Żbik; release 265): its
#             Latin subsets carry neither lslash nor the dot above, so the browser cannot compose them. ł and Ł are its
#             own outlines; ż and Ż are the shipped z and Z with its uni0307 at its own composite offsets, recorded from
#             the full Chakra Petch v1.000 (whose l L z Z equal the shipped subsets') in chakra-latin-ext.json. The
#             Plex voice takes these four from the accents face, which comes first in its stacks (cot-accents.py).
#
# Medium is drawn from Chakra Petch Medium and serves weights up to 549; Bold from Chakra Petch Bold serves 550 and up.
# Vertical metrics sit inside both shell faces' (Plex 1025/-275, Chakra 992/-308), so a mark never grows a line box;
# the ascent is Chakra Petch's own 992, over its dotted capital (893 at Bold).
# Requires Python fontTools with brotli (an authoring tool; nothing ships it). Run from the repository root:
#   python3 tools/type/cot-symbols.py
#   python3 tools/type/cot-symbols.py --extract <dir with ChakraPetch-Medium.ttf and -Bold.ttf>   (re-records the json)
import hashlib
import json
import math
import os
import sys

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.recordingPen import DecomposingRecordingPen, RecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SOURCES = {'Medium': 'chakra-petch/ChakraPetch-Medium-Latin.woff2', 'Bold': 'chakra-petch/ChakraPetch-Bold-Latin.woff2'}
OUT = os.path.join(ROOT, 'public', 'fonts', 'cot-symbols')
AXIS = 264  # Chakra Petch's math axis: the centre of '=' and '+'
CODEPOINTS = {'arrowleft': 0x2190, 'arrowup': 0x2191, 'arrowright': 0x2192, 'arrowdown': 0x2193,
              'infinity': 0x221E, 'lessequal': 0x2264, 'greaterequal': 0x2265,
              'lslash': 0x0142, 'Lslash': 0x0141, 'zdotaccent': 0x017C, 'Zdotaccent': 0x017B}
# the Polish letters: name -> (shipped base glyph or None for a whole full-font glyph, the full-font glyph drawn)
LETTERS = {'lslash': (None, 'lslash'), 'Lslash': (None, 'Lslash'), 'zdotaccent': ('z', 'uni0307'),
           'Zdotaccent': ('Z', 'uni0307')}
LETTER_DATA = os.path.join(os.path.dirname(__file__), 'chakra-latin-ext.json')
ASCENT = 992  # Chakra Petch's own


def record(font, name):
    pen = DecomposingRecordingPen(font.getGlyphSet())
    font.getGlyphSet()[name].draw(pen)
    return [[op, [list(p) if p is not None else None for p in args]] for op, args in pen.value]


def replay(ops, pen):
    for op, args in ops:
        getattr(pen, op)(*[tuple(p) if p is not None else None for p in args])


def extract(directory):
    """Records the full Chakra Petch glyphs the Latin subsets lack, after checking it draws the subsets' bases alike."""
    data = {'source': 'Chakra Petch (ChakraPetch-Medium.ttf, ChakraPetch-Bold.ttf), SIL OFL 1.1, no Reserved Font Name',
            'weights': {}}
    for weight, file in SOURCES.items():
        path = os.path.join(directory, f'ChakraPetch-{weight}.ttf')
        full, shipped = TTFont(path), TTFont(os.path.join(ROOT, 'public', 'fonts', file))
        for base in ('l', 'L', 'z', 'Z'):
            if record(full, base) != record(shipped, base) or full['hmtx'][base] != shipped['hmtx'][base]:
                raise SystemExit(f'{path}: {base} differs from the shipped subset')
        offsets = {name: [c.x, c.y] for name in ('zdotaccent', 'Zdotaccent')
                   for c in full['glyf'][name].components if c.glyphName == 'uni0307'}
        with open(path, 'rb') as f:
            digest = hashlib.sha256(f.read()).hexdigest()
        data['weights'][weight] = {
            'file': os.path.basename(path), 'version': full['name'].getDebugName(5), 'sha256': digest, 'offsets': offsets,
            'glyphs': {name: {'advance': full['hmtx'][name][0], 'ops': record(full, name)}
                       for name in ('lslash', 'Lslash', 'uni0307')},
        }
    with open(LETTER_DATA, 'w') as f:
        json.dump(data, f, indent=1)
        f.write('\n')
    print(LETTER_DATA)


def outline(font, name):
    pen = RecordingPen()
    font.getGlyphSet()[name].draw(pen)
    contours, current = [], []
    for op, args in pen.value:
        if op in ('moveTo', 'lineTo'):
            current.append(args[0])
        elif op == 'closePath':
            contours.append(current)
            current = []
        else:
            raise SystemExit(f'{name}: {op} (the source glyphs are polygons)')
    return contours


def area(points):
    return sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(points, points[1:] + points[:1])) / 2


def clockwise(points, outer=True):
    # TrueType fills to the right of the path: outer contours run clockwise (negative area), counters the other way.
    return points if (area(points) < 0) == outer else points[::-1]


def glyph(contours):
    pen = TTGlyphPen(None)
    for points in contours:
        pen.moveTo(tuple(round(v) for v in points[0]))
        for point in points[1:]:
            pen.lineTo(tuple(round(v) for v in point))
        pen.closePath()
    return pen.glyph()


def bounds(contours):
    xs = [x for c in contours for x, _ in c]
    ys = [y for c in contours for _, y in c]
    return min(xs), min(ys), max(xs), max(ys)


def build(weight, source):
    chakra = TTFont(source)
    side = 50 if weight == 'Medium' else 40  # Chakra Petch's side bearing on its symbols
    stem = {'Medium': 82, 'Bold': 114}[weight]  # its hyphen / bar weight
    ring = {'Medium': (93, 81), 'Bold': (124, 104)}[weight]  # its 'o' stems (Bold a touch lighter: open counters)
    glyphs, metrics = {}, {}

    def put(name, contours, advance):
        glyphs[name] = glyph(contours)
        metrics[name] = (round(advance), round(bounds(contours)[0]) if contours else 0)

    # ↑ ↓ as Chakra Petch draws them.
    up = outline(chakra, 'arrowup')
    put('arrowup', up, chakra['hmtx']['arrowup'][0])
    put('arrowdown', outline(chakra, 'arrowdown'), chakra['hmtx']['arrowdown'][0])
    # ← → : the up arrow turned a quarter (a rotation keeps the contour direction), its tail trimmed by 60 units so the
    # horizontal arrow reads at about the width of a capital.
    tail = min(y for c in up for _, y in c)
    trimmed = [[(x, y + 60 if y == tail else y) for x, y in c] for c in up]
    for name, turn in (('arrowright', lambda x, y: (y, -x)), ('arrowleft', lambda x, y: (-y, x))):
        turned = [[turn(x, y) for x, y in c] for c in trimmed]
        x0, y0, x1, y1 = bounds(turned)
        dx, dy = side - x0, AXIS - (y0 + y1) / 2
        moved = [[(x + dx, y + dy) for x, y in c] for c in turned]
        put(name, moved, x1 - x0 + 2 * side)

    # ≤ ≥ : a lower chevron of Chakra Petch's build over its bar.
    less = outline(chakra, 'less')[0]
    lx0, _, lx1, ltop = bounds([less])
    apex = [y for x, y in less if x == lx0]
    half_apex = (max(apex) - min(apex)) / 2
    inner_e = 3
    width = round((lx1 - lx0) * 0.84)
    gap = round(stem * 0.95)
    ybot = stem + gap
    ytop = 612
    yc = (ybot + ytop) / 2
    slope = (ytop - yc - half_apex) / width
    perpendicular = stem * 0.99
    vertical = perpendicular * math.sqrt(1 + slope * slope)
    x0 = lx0 + (lx1 - lx0 - width) / 2
    x1 = x0 + width
    xi = x1 - (ytop - vertical - yc - inner_e) / slope
    chevron = [(x0, yc - half_apex), (x0, yc + half_apex), (x1, ytop), (x1, ytop - vertical), (xi, yc + inner_e),
               (xi, yc - inner_e), (x1, ybot + vertical), (x1, ybot)]
    bar = [(x0, 0), (x0, stem), (x1, stem), (x1, 0)]
    advance = chakra['hmtx']['less'][0]
    lessequal = [clockwise(chevron), clockwise(bar)]
    put('lessequal', lessequal, advance)
    mirrored = [clockwise([(advance - x, y) for x, y in c]) for c in lessequal]
    put('greaterequal', mirrored, advance)

    # ∞ : two chamfered rings sharing a stem, a pinch where they meet.
    vstem, hstroke = ring
    height = {'Medium': 400, 'Bold': 410}[weight]
    yb, yt = AXIS - height / 2, AXIS + height / 2
    total = 780 - 2 * side
    loop = (total + vstem) / 2
    xl0, xl1 = side, side + loop
    xr0, xr1 = xl1 - vstem, xl1 - vstem + loop
    c = round(height * 0.2)  # outer chamfer (the 'o' carries about a fifth of its height)
    cj = round(vstem / 2 + height * 0.2)  # the joint's chamfer: deep enough to pinch the waist
    mid = xl1 - vstem / 2
    outer = [(xl0, yb + c), (xl0, yt - c), (xl0 + c, yt), (xl1 - cj, yt), (mid, yt - (cj - vstem / 2)), (xr0 + cj, yt),
             (xr1 - c, yt), (xr1, yt - c), (xr1, yb + c), (xr1 - c, yb), (xr0 + cj, yb), (mid, yb + (cj - vstem / 2)),
             (xl1 - cj, yb), (xl0 + c, yb)]
    hc = max(round(c - vstem * 0.55), 16)
    hj = max(round(cj - vstem * 0.55), 16)

    def hole(a, b, near_left):
        # The counter of one ring, inset by the stems; its joint side keeps the deeper chamfer.
        l, r, bt, tp = a + vstem, b - vstem, yb + hstroke, yt - hstroke
        cl, cr = (hc, hj) if not near_left else (hj, hc)
        return [(l, bt + cl), (l, tp - cl), (l + cl, tp), (r - cr, tp), (r, tp - cr), (r, bt + cr), (r - cr, bt), (l + cl, bt)]
    infinity = [clockwise(outer), clockwise(hole(xl0, xl1, False), outer=False), clockwise(hole(xr0, xr1, True), outer=False)]
    put('infinity', infinity, 780)

    # ł Ł ż Ż as Chakra Petch draws them (chakra-latin-ext.json).
    with open(LETTER_DATA) as f:
        letters = json.load(f)['weights'][weight]
    glyph_set = chakra.getGlyphSet()
    for name, (base, source) in LETTERS.items():
        drawn = letters['glyphs'][source]
        pen = TTGlyphPen(None)
        if base:
            glyph_set[base].draw(pen)
            dx, dy = letters['offsets'][name]
            replay(drawn['ops'], TransformPen(pen, (1, 0, 0, 1, dx, dy)))
        else:
            replay(drawn['ops'], pen)
        glyphs[name] = pen.glyph()
        glyphs[name].recalcBounds(None)
        metrics[name] = (chakra['hmtx'][base][0] if base else drawn['advance'], getattr(glyphs[name], 'xMin', 0))

    order = ['.notdef', *CODEPOINTS]
    notdef = TTGlyphPen(None).glyph()
    glyphs['.notdef'] = notdef
    metrics['.notdef'] = (500, 0)
    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap({cp: name for name, cp in CODEPOINTS.items()})
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=ASCENT, descent=-200)
    family = 'Cot Symbols'
    fb.setupNameTable({
        'copyright': 'Copyright 2018 The Chakra Petch Project Authors (https://github.com/m4rc1e/Chakra-Petch.git); '
                     'modifications Copyright 2026 Kevin B. Liu',
        'familyName': family, 'styleName': 'Regular' if weight == 'Medium' else 'Bold',
        'uniqueFontIdentifier': f'CotSymbols-{weight};2026-10-18', 'fullName': f'{family} {weight}',
        'version': 'Version 1.000', 'psName': f'CotSymbols-{weight}',
        'licenseDescription': 'This Font Software is licensed under the SIL Open Font License, Version 1.1.',
        'licenseInfoURL': 'https://openfontlicense.org',
    })
    fb.setupOS2(sTypoAscender=ASCENT, sTypoDescender=-200, sTypoLineGap=0, usWinAscent=ASCENT, usWinDescent=200,
                sxHeight=498, sCapHeight=700, usWeightClass=500 if weight == 'Medium' else 700, fsType=0,
                achVendID='NONE', fsSelection=0x40 if weight == 'Medium' else 0x20)
    fb.setupPost()
    fb.font['head'].created = fb.font['head'].modified = 3843187200  # 2025-10-18, fixed: byte-identical rebuilds
    fb.font['head'].macStyle = 0 if weight == 'Medium' else 1
    os.makedirs(OUT, exist_ok=True)
    fb.font.flavor = 'woff2'
    path = os.path.join(OUT, f'CotSymbols-{weight}.woff2')
    fb.font.save(path)
    if '--ttf' in sys.argv:
        fb.font.flavor = None
        fb.font.save(os.path.join(sys.argv[sys.argv.index('--ttf') + 1], f'CotSymbols-{weight}.ttf'))
    return path


if '--extract' in sys.argv:
    extract(sys.argv[sys.argv.index('--extract') + 1])
else:
    for weight, file in SOURCES.items():
        print(build(weight, os.path.join(ROOT, 'public', 'fonts', file)))
