#!/usr/bin/env python3
# The wordmark master (brand-ui BUI-F6, SPEC 3.1). Copyright (c) 2026 Kevin B. Liu.
# Outlines CLAUDE —of— TANKS to pure SVG paths from Chakra Petch Bold and Medium at the positions the browser lays the
# Premiere direction's wordmark CSS out (tools/brand/wordmark-layout.mjs, kerning and tracking included), and writes
# every lockup the identity uses into public/brand/ plus the inline paths src/ui/brandWordmark.ts carries.
#   node tools/brand/wordmark-layout.mjs > /tmp/wordmark-layout.json
#   python3 tools/brand/wordmark.py /tmp/wordmark-layout.json /path/to/ChakraPetch-Bold.ttf /path/to/ChakraPetch-Medium.ttf
# Needs fontTools (pip install fonttools). The TTFs are the SIL OFL sources of public/fonts/chakra-petch.
import json, os, sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
layout = json.load(open(sys.argv[1]))
fonts = {700: TTFont(sys.argv[2]), 500: TTFont(sys.argv[3])}
RULE = 90  # the "of" rules: 0.09 em, the direction's 1.5 px at 16 px, scaling with the mark
PAPER, TUNGSTEN, GRAPHITE, TUNGSTEN_600 = '#f6f3ec', '#f0a030', '#11151a', '#c97f1c'
NOTICE = 'Copyright (c) 2026 Kevin B. Liu.'


def glyph_path(g):
    font = fonts[g['weight']]
    scale = g['size'] / font['head'].unitsPerEm
    name = font.getBestCmap()[ord(g['ch'])]
    gs = font.getGlyphSet()
    pen = SVGPathPen(gs, lambda v: f'{v:.0f}' if abs(v - round(v)) < 0.05 else f'{v:.1f}')
    # font units grow upward; the page grows downward from the lockup's top
    gs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, g['x'], g['baseline'])))
    bounds = BoundsPen(gs)
    gs[name].draw(TransformPen(bounds, (scale, 0, 0, -scale, g['x'], g['baseline'])))
    return pen.getCommands(), bounds.bounds


def build(part):
    words, of, box = [], [], [None, None, None, None]
    def grow(b):
        for i, f in enumerate((min, min, max, max)):
            box[i] = b[i] if box[i] is None else f(box[i], b[i])
    for g in part['glyphs']:
        d, b = glyph_path(g)
        grow(b)
        (of if g['weight'] == 500 else words).append(d)
    for r in part['rules']:
        x, y, w = round(r['x']), round(r['y'] - RULE / 2), round(r['width'])
        of.append(f'M{x} {y}h{w}v{RULE}h{-w}Z')
        grow((x, y, x + w, y + RULE))
    x0, y0, x1, y1 = (round(v) for v in box)
    return ''.join(words), ''.join(of), (x0, y0, x1 - x0, y1 - y0)


def svg(words, of, vb, ink, accent, label='Claude of Tanks'):
    x, y, w, h = vb
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}" role="img" aria-label="{label}">'
            f'<!-- The Claude of Tanks wordmark (brand-ui BUI-F6): Chakra Petch outlined by tools/brand/wordmark.py. {NOTICE} -->'
            f'<path fill="{ink}" d="{words}"/><path fill="{accent}" d="{of}"/></svg>\n')


horizontal = build(layout['horizontal'])
stacked = build(layout['stacked'])
out = os.path.join(ROOT, 'public', 'brand')
files = {
    'wordmark.svg': svg(*horizontal, PAPER, TUNGSTEN),
    'wordmark-paper.svg': svg(*horizontal, GRAPHITE, TUNGSTEN_600),
    'wordmark-mono.svg': svg(*horizontal, 'currentColor', 'currentColor'),
    'wordmark-stacked.svg': svg(*stacked, PAPER, TUNGSTEN),
}
# The Bracket Chevron (brandMark.ts, 24-unit grid): paper brackets around a tungsten chevron.
MARK_BRACKETS = 'M2 8V2h6M16 2h6v6M22 16v6h-6M8 22H2v-6'
MARK_CHEVRON = 'M6.5 16.5 12 8.2l5.5 8.3'


def mark_group(x, y, size, ink, accent):
    k = size / 24
    return (f'<g transform="translate({x:.0f} {y:.0f}) scale({k:.3f})" fill="none">'
            f'<path d="{MARK_BRACKETS}" stroke="{ink}" stroke-width="2"/>'
            f'<path d="{MARK_CHEVRON}" stroke="{accent}" stroke-width="2.4" stroke-linecap="square" stroke-linejoin="miter"/></g>')


def lockup(words, of, vb, ink, accent):
    # the direction's nav lockup: a 28 px mark, a 12 px gap and the wordmark at 17 px (its caps 0.7 em tall)
    x, y, w, h = vb
    em = h / 0.7
    size, gap = em * 28 / 17, em * 12 / 17
    top = y + h / 2 - size / 2
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x - size - gap:.0f} {top:.0f} {w + size + gap:.0f} {size:.0f}" '
            f'role="img" aria-label="Claude of Tanks"><!-- The Claude of Tanks lockup: the Bracket Chevron and the wordmark. {NOTICE} -->'
            f'{mark_group(x - size - gap, top, size, ink, accent)}<path fill="{ink}" d="{words}"/><path fill="{accent}" d="{of}"/></svg>\n')


def title_card(words, of, vb, ink, accent):
    # the ceremonial tier (SPEC 3.3, the retired crest's place): the chevron over the stacked wordmark
    x, y, w, h = vb
    size = w * 0.34
    gap = size * 0.28
    mx = x + w / 2 - size / 2
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x:.0f} {y - size - gap:.0f} {w:.0f} {h + size + gap:.0f}" '
            f'role="img" aria-label="Claude of Tanks"><!-- The Claude of Tanks title card: the Bracket Chevron over the stacked wordmark. {NOTICE} -->'
            f'{mark_group(mx, y - size - gap, size, ink, accent)}<path fill="{ink}" d="{words}"/><path fill="{accent}" d="{of}"/></svg>\n')


files['lockup.svg'] = lockup(*horizontal, PAPER, TUNGSTEN)
files['lockup-paper.svg'] = lockup(*horizontal, GRAPHITE, TUNGSTEN_600)
files['title-card.svg'] = title_card(*stacked, PAPER, TUNGSTEN)
for name, text in files.items():
    open(os.path.join(out, name), 'w').write(text)

# The inline master for the shell: the words take the surrounding ink, the "of" the accent.
x, y, w, h = horizontal[2]
ts = f'''// Generated by tools/brand/wordmark.py from Chakra Petch (SIL OFL); do not edit by hand. {NOTICE}
// The Claude of Tanks wordmark as pure paths (SPEC 3.1: never live HTML text): CLAUDE —of— TANKS at the Premiere
// direction's tracking, gaps and kerning. The words take currentColor and the "of" the accent, so one master serves the
// nav, the cards and the title cards in every treatment.

/** The viewBox of the horizontal lockup: the caps' box in font units (height {h} = the cap height). */
export const WORDMARK_VIEWBOX = '{x} {y} {w} {h}';
/** Its width per unit of height, for reserving the lockup's box before it paints. */
export const WORDMARK_ASPECT = {w / h:.4f};
export const WORDMARK_WORDS = '{horizontal[0]}';
export const WORDMARK_OF = '{horizontal[1]}';
'''
open(os.path.join(ROOT, 'src', 'ui', 'brandWordmark.ts'), 'w').write(ts)
for name in files:
    print(name, os.path.getsize(os.path.join(out, name)), 'bytes')
print('brandWordmark.ts', len(ts), 'bytes', 'viewBox', horizontal[2], 'stacked', stacked[2])
