#!/usr/bin/env python3
# cot-accents.py: builds public/fonts/cot-accents/CotAccents-{Regular,Medium,SemiBold}.woff2, the accented letters the
# shipped IBM Plex Sans Latin1 subsets lack. Copyright (c) 2026 Kevin B. Liu. The outlines are the
# shipped IBM Plex Sans glyphs (SIL OFL 1.1; Copyright 2017 IBM Corp. with Reserved Font Name "Plex"), so the output is
# an OFL 1.1 Modified Version under its own family name, which never uses the reserved name
# (public/fonts/cot-accents/OFL.txt carries IBM's copyright line and the reservation).
#
# Each letter is Plex's own base glyph with Plex's own spacing accent, set where Plex sets that accent itself:
#   macron vowels  ā ē ī ō ū  Ā Ē Ī Ō Ū   romanised Japanese and pinyin names (Type 90 Kyū-maru, Raijū, Type 96-80 Fēng)
#   acute          ć ń ś ź    Ć Ń Ś Ź      Polish names (T-72 Ryś)
# The horizontal offset of an accent over a base is the offset Plex's own Latin1 composites use over that base
# (uacute, ucircumflex: Plex centres acute, circumflex and macron on one axis); bases with no Latin1 composite (c, s, z,
# C, S, Z) take the mean of their advance centre and outline centre, the rule the others fit within a few units.
# The capital macron sits as far above the lowercase macron as Plex's acute.case sits above its acute.
#   stroke, dot    ł Ł ż Ż                 Polish names (PT-84 Orzeł, PT-84 Żbik; release 265)
# The Latin1 subsets carry no lslash and no dotaccent, so those come from the full IBM Plex Sans (3.201, whose l L z Z
# outline boxes equal the shipped 1.1.0 subsets', advances within a unit), recorded in plex-latin-ext.json: ł and Ł are
# Plex's own outlines; ż and Ż are the shipped z and Z with Plex's own dotaccent / dotaccent.case at its own composite
# offsets.
# Chakra Petch composes the acute and macron letters from its own combining marks; the four above it cannot (ł has no
# decomposition, and its subsets lack the dot above), so the marks face carries Chakra Petch's own (cot-symbols.py).
# Vertical metrics copy Plex's, so a letter from this face never grows a line box.
# Requires Python fontTools with brotli (an authoring tool; nothing ships it). Run from the repository root:
#   python3 tools/type/cot-accents.py
#   python3 tools/type/cot-accents.py --extract <dir with IBMPlexSans-400/500/600.ttf>   (re-records plex-latin-ext.json)
import hashlib
import json
import os
import sys

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
WEIGHTS = {'Regular': 400, 'Medium': 500, 'SemiBold': 600}
OUT = os.path.join(ROOT, 'public', 'fonts', 'cot-accents')
# name: (codepoint, base glyph, accent glyph, glyph whose composite gives the offset over that base or None)
LETTERS = {
    'amacron': (0x0101, 'a', 'macron', 'acircumflex'), 'Amacron': (0x0100, 'A', 'macron.case', 'Acircumflex'),
    'emacron': (0x0113, 'e', 'macron', 'ecircumflex'), 'Emacron': (0x0112, 'E', 'macron.case', 'Ecircumflex'),
    'imacron': (0x012B, 'dotlessi', 'macron', 'icircumflex'), 'Imacron': (0x012A, 'I', 'macron.case', 'Icircumflex'),
    'omacron': (0x014D, 'o', 'macron', 'ocircumflex'), 'Omacron': (0x014C, 'O', 'macron.case', 'Ocircumflex'),
    'umacron': (0x016B, 'u', 'macron', 'ucircumflex'), 'Umacron': (0x016A, 'U', 'macron.case', 'Ucircumflex'),
    'cacute': (0x0107, 'c', 'acute', None), 'Cacute': (0x0106, 'C', 'acute.case', None),
    'nacute': (0x0144, 'n', 'acute', 'ntilde'), 'Nacute': (0x0143, 'N', 'acute.case', 'Ntilde'),
    'sacute': (0x015B, 's', 'acute', None), 'Sacute': (0x015A, 'S', 'acute.case', None),
    'zacute': (0x017A, 'z', 'acute', None), 'Zacute': (0x0179, 'Z', 'acute.case', None),
}
# name: (codepoint, shipped base glyph or None for a whole full-Plex glyph, the full-Plex glyph drawn over or as it)
EXTENDED = {
    'lslash': (0x0142, None, 'lslash'), 'Lslash': (0x0141, None, 'Lslash'),
    'zdotaccent': (0x017C, 'z', 'dotaccent'), 'Zdotaccent': (0x017B, 'Z', 'dotaccent.case'),
}
EXTENDED_DATA = os.path.join(os.path.dirname(__file__), 'plex-latin-ext.json')


def record(font, name):
    pen = RecordingPen()
    font.getGlyphSet()[name].draw(pen)
    return [[op, [list(p) if p is not None else None for p in args]] for op, args in pen.value]


def replay(ops, pen):
    for op, args in ops:
        getattr(pen, op)(*[tuple(p) if p is not None else None for p in args])


def extract(directory):
    """Records the full Plex glyphs the Latin1 subsets lack, after checking the full font draws the subsets' bases alike."""
    data = {'source': 'IBM Plex Sans (IBMPlexSans-400/500/600.ttf), SIL OFL 1.1, Reserved Font Name "Plex"', 'weights': {}}
    for weight, number in WEIGHTS.items():
        path = os.path.join(directory, f'IBMPlexSans-{number}.ttf')
        full = TTFont(path)
        shipped = TTFont(os.path.join(ROOT, 'public', 'fonts', 'ibm-plex-sans', f'IBMPlexSans-{weight}-Latin1.woff2'))
        for base in ('l', 'L', 'z', 'Z'):
            for font in (full, shipped):
                font['glyf'][base].recalcBounds(font['glyf'])
            a, b = full['glyf'][base], shipped['glyf'][base]
            # the same outline box; an advance a unit apart at most (3.x rounds Medium's Z to 592, 1.1.0 to 591)
            if (a.xMin, a.yMin, a.xMax, a.yMax) != (b.xMin, b.yMin, b.xMax, b.yMax) \
                    or abs(full['hmtx'][base][0] - shipped['hmtx'][base][0]) > 1:
                raise SystemExit(f'{path}: {base} differs from the shipped subset')
        offsets = {name: [c.x, c.y] for name in ('zdotaccent', 'Zdotaccent')
                   for c in full['glyf'][name].components if c.glyphName.startswith('dotaccent')}
        with open(path, 'rb') as f:
            digest = hashlib.sha256(f.read()).hexdigest()
        data['weights'][weight] = {
            'file': os.path.basename(path), 'version': full['name'].getDebugName(5), 'sha256': digest, 'offsets': offsets,
            'glyphs': {name: {'advance': full['hmtx'][name][0], 'ops': record(full, name)}
                       for name in ('lslash', 'Lslash', 'dotaccent', 'dotaccent.case')},
        }
    with open(EXTENDED_DATA, 'w') as f:
        json.dump(data, f, indent=1)
        f.write('\n')
    print(EXTENDED_DATA)


def offset(plex, base, accent, model):
    glyf, hmtx = plex['glyf'], plex['hmtx']
    if model:
        components = [c for c in glyf[model].components if c.glyphName != base]
        return components[0].x
    g = glyf[base]
    g.recalcBounds(glyf)
    mark = hmtx[accent][0]
    advance_centre = (hmtx[base][0] - mark) / 2
    outline_centre = (g.xMin + g.xMax) / 2 - mark / 2
    return round((advance_centre + outline_centre) / 2)


def build(weight):
    plex = TTFont(os.path.join(ROOT, 'public', 'fonts', 'ibm-plex-sans', f'IBMPlexSans-{weight}-Latin1.woff2'))
    glyph_set = plex.getGlyphSet()
    glyf, hmtx = plex['glyf'], plex['hmtx']
    for name in ('acute', 'acute.case'):
        glyf[name].recalcBounds(glyf)
    lift = glyf['acute.case'].yMin - glyf['acute'].yMin
    glyphs, metrics = {'.notdef': TTGlyphPen(None).glyph()}, {'.notdef': (500, 0)}
    for name, (_cp, base, accent, model) in LETTERS.items():
        source_accent = 'macron' if accent == 'macron.case' else accent
        dy = lift if accent == 'macron.case' else 0
        dx = offset(plex, base, source_accent, model)
        pen = TTGlyphPen(None)
        glyph_set[base].draw(pen)
        glyph_set[source_accent].draw(TransformPen(pen, (1, 0, 0, 1, dx, dy)))
        glyphs[name] = pen.glyph()
        glyphs[name].recalcBounds(None)
        metrics[name] = (hmtx[base][0], getattr(glyphs[name], 'xMin', 0))
    with open(EXTENDED_DATA) as f:
        extended = json.load(f)['weights'][weight]
    for name, (_cp, base, source) in EXTENDED.items():
        drawn = extended['glyphs'][source]
        pen = TTGlyphPen(None)
        if base:
            glyph_set[base].draw(pen)
            dx, dy = extended['offsets'][name]
            replay(drawn['ops'], TransformPen(pen, (1, 0, 0, 1, dx, dy)))
        else:
            replay(drawn['ops'], pen)
        glyphs[name] = pen.glyph()
        glyphs[name].recalcBounds(None)
        metrics[name] = (hmtx[base][0] if base else drawn['advance'], getattr(glyphs[name], 'xMin', 0))
    order = ['.notdef', *LETTERS, *EXTENDED]
    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap({cp: name for name, (cp, *_rest) in {**LETTERS, **EXTENDED}.items()})
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    hhea, os2 = plex['hhea'], plex['OS/2']
    fb.setupHorizontalHeader(ascent=hhea.ascent, descent=hhea.descent, lineGap=hhea.lineGap)
    family = 'Cot Accents'
    fb.setupNameTable({
        'copyright': 'Copyright 2017 IBM Corp. with Reserved Font Name "Plex"; modifications Copyright 2026 Kevin B. Liu',
        'familyName': family, 'styleName': 'Regular' if weight == 'Regular' else weight,
        'uniqueFontIdentifier': f'CotAccents-{weight};2026-10-18', 'fullName': f'{family} {weight}',
        'version': 'Version 1.000', 'psName': f'CotAccents-{weight}',
        'licenseDescription': 'This Font Software is licensed under the SIL Open Font License, Version 1.1.',
        'licenseInfoURL': 'https://openfontlicense.org',
    })
    fb.setupOS2(sTypoAscender=os2.sTypoAscender, sTypoDescender=os2.sTypoDescender, sTypoLineGap=os2.sTypoLineGap,
                usWinAscent=os2.usWinAscent, usWinDescent=os2.usWinDescent, sxHeight=os2.sxHeight,
                sCapHeight=os2.sCapHeight, usWeightClass=WEIGHTS[weight], fsType=0, achVendID='NONE',
                fsSelection=0x40)
    fb.setupPost()
    fb.font['head'].created = fb.font['head'].modified = 3843187200  # fixed: byte-identical rebuilds
    os.makedirs(OUT, exist_ok=True)
    fb.font.flavor = 'woff2'
    path = os.path.join(OUT, f'CotAccents-{weight}.woff2')
    fb.font.save(path)
    if '--ttf' in sys.argv:
        fb.font.flavor = None
        fb.font.save(os.path.join(sys.argv[sys.argv.index('--ttf') + 1], f'CotAccents-{weight}.ttf'))
    return path


if '--extract' in sys.argv:
    extract(sys.argv[sys.argv.index('--extract') + 1])
else:
    for weight in WEIGHTS:
        print(build(weight))
