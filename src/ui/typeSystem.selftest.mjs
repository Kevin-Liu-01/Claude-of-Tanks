// Type system receipt (owner ruling 2026-10-17). Copyright © 2026 Kevin B. Liu.
// Chakra Petch (display), IBM Plex Sans (body) and IBM Plex Mono (readouts) replace ABC Monument Grotesk everywhere.
// This receipt holds the whole contract on the CPU:
//   - the eight shipped WOFF2 files are the pinned official builds, each family beside its OFL text, with attribution;
//     the marks face and the accents face are pinned first-party OFL derivatives with their generators, and every
//     character a catalog string or a tank name prints is in a shipped face's cmap (read from the WOFF2 bytes);
//   - Monument is gone from the repository tree and from every shipped source; Inter is gone from the stacks;
//   - one declaration source: every document carries one cot:type marker that declares only the families the page
//     uses, preloads at most two of their faces, and stays inside its head budget (documents are boot bytes that
//     tools/bundle-budget.mjs does not count); no stylesheet or module declares a face of its own;
//   - every weight the code asks for is a real face (400/500/600/700) in CSS, CSS-in-TS, style properties, object
//     literals and canvas fonts, and every weight range of every family resolves to exactly one face;
//   - nothing declares text under TYPE_FLOOR_PX (11 px, the type rules) in any of those forms;
//   - tabular figures only through the .num class (IBM Plex Mono), and the readouts that tick in place carry it;
//   - per-family metric-matched fallbacks (Android included), an explicit body family, and the zh-CN resets.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, brotliDecompressSync, constants } from 'node:zlib';
import {
  TYPE_FACES, TYPE_FAMILY, TYPE_SOURCES, TYPE_STACK, TYPE_WEIGHTS, TYPE_SCALE, TYPE_FLOOR_PX, TYPE_FACE_RANGES,
  TYPE_FALLBACK_FAMILY, TYPE_FALLBACKS, TYPE_CAPS_RANGE, TYPE_SPACE_RANGE, TYPE_DEFAULT_FAMILIES, TYPE_SYMBOLS, TYPE_ACCENTS,
  fontFaceCss, typeTokenCss, typeFaceFile, typeHead, expandTypeMarkers, parseTypeMarker, TYPE_MARKER,
} from './typeFaces.ts';
import { FONT_STACK, FONT_COND } from './fonts.ts';
import { zhTypeFloorCss, zhTypeFloorSelectors, zhTypeFloorStyle } from './zhTypeFloor.ts';
import { PUBLIC_ROUTE_RECORDS } from './localeRouting.ts';
import { localizeHtmlDocument } from '../presentation/localizedHtml.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const walk = (dir, accept) => readdirSync(join(ROOT, dir), { recursive: true })
  .map((entry) => join(dir, String(entry)).split('\\').join('/'))
  .filter((path) => !path.includes('node_modules/') && accept(path) && statSync(join(ROOT, path)).isFile());
const brotli = (text) => brotliCompressSync(Buffer.from(text), { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;

// ------------------------------------------------------------------------------------------------- files and licences
const FONT_DIRS = new Set(Object.values(TYPE_SOURCES).map((source) => source.dir));
for (const face of TYPE_FACES) {
  const bytes = readFileSync(join(ROOT, 'public/fonts', face.file));
  assert.equal(bytes.subarray(0, 4).toString('latin1'), 'wOF2', `${face.file} is WOFF2`);
  assert.equal(bytes.length, face.bytes, `${face.file} keeps its pinned size`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), face.sha256, `${face.file} is the pinned official build`);
  assert.ok(FONT_DIRS.has(face.file.split('/')[0]), `${face.file} sits in its family's licensed directory`);
  assert.ok(TYPE_WEIGHTS[face.voice].includes(face.weight), `${face.file} is a declared weight of its voice`);
}
for (const voice of ['display', 'body', 'mono']) {
  assert.deepEqual(TYPE_FACES.filter((face) => face.voice === voice).map((face) => face.weight), TYPE_WEIGHTS[voice],
    `${voice}: one shipped file per declared weight`);
}
assert.deepEqual(TYPE_WEIGHTS.display, [500, 600, 700], 'Chakra Petch display 500/600/700 (owner UI rule 1)');
assert.deepEqual(TYPE_WEIGHTS.body, [400, 500, 600], 'IBM Plex Sans body 400/500/600 (owner UI rule 1)');
assert.deepEqual(TYPE_WEIGHTS.mono, [400, 500], 'IBM Plex Mono data 400/500 (owner UI rule 1)');
for (const [voice, source] of Object.entries(TYPE_SOURCES)) {
  const ofl = read(`public/fonts/${source.dir}/OFL.txt`);
  assert.match(ofl, /SIL Open Font License, Version 1\.1/, `${voice}: the OFL text ships beside the files`);
  if (source.dir.startsWith('ibm-plex')) assert.match(ofl, /Reserved Font Name "Plex"/, `${voice}: IBM's Reserved Font Name kept`);
  assert.match(source.source, /fonts\.google\.com|github\.com\/google\/fonts|github\.com\/IBM\/plex/, `${voice}: an official source`);
}
// The marks face: first-party, drawn from Chakra Petch's outlines by tools/type/cot-symbols.py (rebuilds byte for byte).
for (const face of TYPE_SYMBOLS.faces) {
  const bytes = readFileSync(join(ROOT, 'public/fonts', face.file));
  assert.equal(bytes.subarray(0, 4).toString('latin1'), 'wOF2', `${face.file} is WOFF2`);
  assert.equal(bytes.length, face.bytes, `${face.file} keeps its pinned size`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), face.sha256, `${face.file} is the pinned cot-symbols.py build`);
  assert.ok(face.file.startsWith(`${TYPE_SYMBOLS.dir}/`), `${face.file} sits beside its licence`);
}
assert.deepEqual(TYPE_SYMBOLS.faces.map((face) => face.weight), ['100 549', '550 1000'], 'the marks face covers every weight, Medium then Bold');
assert.equal(TYPE_SYMBOLS.range, 'U+2190-2193,U+221E,U+2264-2265', 'the marks face carries ← ↑ → ↓ ∞ ≤ ≥ and nothing else');
{
  const ofl = read(`public/fonts/${TYPE_SYMBOLS.dir}/OFL.txt`);
  assert.match(ofl, /SIL Open Font License, Version 1\.1/, 'the marks face ships its OFL text');
  assert.match(ofl, /Chakra Petch Project Authors/, 'the marks face keeps the Chakra Petch copyright it derives from');
  assert.match(ofl, /Kevin B\. Liu/, 'the marks face names its first-party author');
  assert.doesNotMatch(read('public/fonts/chakra-petch/OFL.txt').split('This Font Software is licensed')[0], /Reserved Font Name/,
    'Chakra Petch reserves no name, so a derived face may ship');
  const generator = read('tools/type/cot-symbols.py');
  for (const face of TYPE_SYMBOLS.faces) assert.ok(generator.includes(face.file.split('/')[1].replace(/-(Medium|Bold)\.woff2$/, '')), `${face.file}: its generator`);
}
// The accents face: an OFL Modified Version of IBM Plex Sans under its own name, assembled from Plex's own glyphs by
// tools/type/cot-accents.py (rebuilds byte for byte). It must never carry the reserved name.
for (const face of TYPE_ACCENTS.faces) {
  const bytes = readFileSync(join(ROOT, 'public/fonts', face.file));
  assert.equal(bytes.subarray(0, 4).toString('latin1'), 'wOF2', `${face.file} is WOFF2`);
  assert.equal(bytes.length, face.bytes, `${face.file} keeps its pinned size`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), face.sha256, `${face.file} is the pinned cot-accents.py build`);
  assert.ok(face.file.startsWith(`${TYPE_ACCENTS.dir}/`), `${face.file} sits beside its licence`);
  assert.doesNotMatch(face.file, /plex/i, `${face.file}: a Modified Version never uses the Reserved Font Name`);
}
assert.doesNotMatch(TYPE_ACCENTS.family, /plex/i, 'the accents family never uses the Reserved Font Name "Plex"');
assert.deepEqual(TYPE_ACCENTS.faces.map((face) => face.weight), ['100 449', '450 549', '550 1000'],
  'the accents face follows the Plex Sans weights: Regular, Medium, SemiBold');
{
  const ofl = read(`public/fonts/${TYPE_ACCENTS.dir}/OFL.txt`);
  assert.match(ofl, /SIL Open Font License, Version 1\.1/, 'the accents face ships its OFL text');
  assert.match(ofl, /Copyright © 2017 IBM Corp\. with Reserved Font Name "Plex"/, 'the accents face keeps IBM\'s copyright and reservation');
  assert.match(ofl, /Kevin B\. Liu/, 'the accents face names its first-party author');
  const generator = read('tools/type/cot-accents.py');
  for (const face of TYPE_ACCENTS.faces) assert.ok(generator.includes(face.file.split('/')[1].replace(/-(Regular|Medium|SemiBold)\.woff2$/, '')), `${face.file}: its generator`);
  assert.match(generator, /ibm-plex-sans/, 'the accents face is built from the shipped Plex Sans files');
}
// Every arrow or math mark a catalog string prints has a shipped face: U+2212 sits in every Latin subset (fontTools
// cmap check, 2026-10-18) and the marks face carries the rest. A new mark in a string must join the marks face first.
const rangeChars = TYPE_SYMBOLS.range.split(',').flatMap((part) => {
  const [lo, hi = lo] = part.replace(/^U\+/, '').split('-').map((hex) => parseInt(hex, 16));
  return Array.from({ length: hi - lo + 1 }, (_, index) => String.fromCodePoint(lo + index));
});
assert.deepEqual(rangeChars, ['←', '↑', '→', '↓', '∞', '≤', '≥'], 'the marks range spells the seven marks');
const COVERED_MARKS = new Set(['\u2212', ...rangeChars]);
// Each face's cmap, read from its WOFF2 bytes (table directory, one brotli stream, the cmap's format 4 / 12 subtable).
const WOFF2_TAGS = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ',
  'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB'];
function cmapOf(file) {
  const bytes = readFileSync(join(ROOT, 'public/fonts', file));
  const numTables = bytes.readUInt16BE(12);
  const compressed = bytes.readUInt32BE(20);
  let at = 48;
  const base128 = () => { let value = 0; for (let i = 0; i < 5; i++) { const byte = bytes[at++]; value = value * 128 + (byte & 127); if (!(byte & 128)) return value; } throw new Error('UIntBase128'); };
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const flags = bytes[at++];
    const index = flags & 63;
    const tag = index === 63 ? bytes.subarray(at, (at += 4)).toString('latin1') : WOFF2_TAGS[index];
    const version = flags >> 6;
    const length = base128();
    const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0;
    tables.push({ tag, length: transformed ? base128() : length });
  }
  const data = brotliDecompressSync(bytes.subarray(at, at + compressed));
  let offset = 0;
  const cmap = {};
  for (const table of tables) { if (table.tag === 'cmap') Object.assign(cmap, { start: offset, length: table.length }); offset += table.length; }
  const table = data.subarray(cmap.start, cmap.start + cmap.length);
  const subtables = Array.from({ length: table.readUInt16BE(2) }, (_, i) => ({ platform: table.readUInt16BE(4 + i * 8), encoding: table.readUInt16BE(6 + i * 8), at: table.readUInt32BE(8 + i * 8) }));
  const pick = subtables.find((entry) => entry.platform === 3 && entry.encoding === 10) ?? subtables.find((entry) => (entry.platform === 3 && entry.encoding === 1) || entry.platform === 0);
  const chars = new Set();
  const sub = table.subarray(pick.at);
  if (sub.readUInt16BE(0) === 12) {
    for (let i = 0, n = sub.readUInt32BE(12); i < n; i++) {
      const lo = sub.readUInt32BE(16 + i * 12), hi = sub.readUInt32BE(20 + i * 12), glyph = sub.readUInt32BE(24 + i * 12);
      for (let c = lo; c <= hi; c++) if (glyph + c - lo) chars.add(c);
    }
  } else {
    assert.equal(sub.readUInt16BE(0), 4, `${file}: a format 4 or 12 cmap`);
    const segments = sub.readUInt16BE(6) / 2;
    const ends = 14, starts = ends + segments * 2 + 2, deltas = starts + segments * 2, ranges = deltas + segments * 2;
    for (let i = 0; i < segments; i++) {
      const end = sub.readUInt16BE(ends + i * 2), start = sub.readUInt16BE(starts + i * 2);
      const delta = sub.readInt16BE(deltas + i * 2), range = sub.readUInt16BE(ranges + i * 2);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        const raw = range ? sub.readUInt16BE(ranges + i * 2 + range + (c - start) * 2) : c;
        if (range && !raw) continue;
        if ((raw + delta) & 0xffff) chars.add(c);
      }
    }
  }
  return chars;
}
const intersect = (sets) => new Set([...sets[0]].filter((c) => sets.every((set) => set.has(c))));
const PLEX_CHARS = intersect(TYPE_FACES.filter((face) => face.voice === 'body').map((face) => cmapOf(face.file)));
const CHAKRA_CHARS = intersect(TYPE_FACES.filter((face) => face.voice === 'display').map((face) => cmapOf(face.file)));
const rangeSet = (range) => new Set(range.split(',').flatMap((part) => {
  const [lo, hi = lo] = part.replace(/^U\+/, '').split('-').map((hex) => parseInt(hex, 16));
  return Array.from({ length: hi - lo + 1 }, (_, index) => lo + index);
}));
// The accents face's unicode-range is the Latin Extended-A block (short in every document head); its cmap is the
// eighteen letters it draws. A page that prints another letter of the block fetches the 2 KB face and falls through.
assert.equal(TYPE_ACCENTS.range, 'U+0100-017F', 'the accents face downloads for Latin Extended-A text only');
const ACCENT_CHARS = cmapOf(TYPE_ACCENTS.faces[1].file);
assert.equal([...ACCENT_CHARS].map((c) => String.fromCodePoint(c)).sort().join(''), 'ĀāĆćĒēĪīŃńŌōŚśŪūŹź',
  'the accents face draws ā ē ī ō ū and ć ń ś ź with their capitals');
const SYMBOL_CHARS = rangeSet(TYPE_SYMBOLS.range);
const ACCENT_RANGE = rangeSet(TYPE_ACCENTS.range);
for (const face of TYPE_ACCENTS.faces) {
  const chars = [...cmapOf(face.file)];
  assert.deepEqual(chars.sort((a, b) => a - b), [...ACCENT_CHARS].sort((a, b) => a - b), `${face.file} draws the same letters in every weight`);
  assert.ok(chars.every((c) => ACCENT_RANGE.has(c)), `${face.file}: every letter inside its unicode-range`);
}
for (const face of TYPE_SYMBOLS.faces) {
  assert.deepEqual([...cmapOf(face.file)].sort((a, b) => a - b), [...SYMBOL_CHARS], `${face.file} carries exactly its unicode-range`);
}
assert.deepEqual([...ACCENT_CHARS].filter((c) => PLEX_CHARS.has(c)), [], 'the accents face adds only letters Plex Sans lacks');
// Chakra Petch composes the accented letters from its own combining marks (the browser decomposes a letter its cmap
// lacks into base + mark when the face carries both), so its stacks need no accents face.
for (const c of ACCENT_CHARS) {
  const [letter, mark] = [...String.fromCodePoint(c).normalize('NFD')].map((ch) => ch.codePointAt(0));
  assert.ok(CHAKRA_CHARS.has(letter) && CHAKRA_CHARS.has(mark), `Chakra Petch composes U+${c.toString(16)} from its own glyphs`);
}
// Every character a catalog string or a tank name prints is drawn by a shipped face on both voice paths: the Plex path
// (Plex Sans, then the accents face, then the marks face) and the Chakra Petch path (its cmap or its composition, then
// the marks face). Chinese and emoji use the system faces by design; the zero-width space the Chinese catalog marks its
// phrase breaks with (equipment descriptions: never 装/备 at a line end) draws nothing, like the joiner.
const systemFace = (c) => (c >= 0x2e80 && c <= 0x9fff) || (c >= 0x3000 && c <= 0x303f) || (c >= 0xf900 && c <= 0xfaff)
  || (c >= 0xff00 && c <= 0xffef) || c >= 0x1f000 || c === 0xfe0f || c === 0x200d || c === 0x200b;
const chakraDraws = (c) => CHAKRA_CHARS.has(c) || SYMBOL_CHARS.has(c)
  || [...String.fromCodePoint(c).normalize('NFD')].every((ch) => CHAKRA_CHARS.has(ch.codePointAt(0)));
const printed = new Map();
for (const locale of ['en-US', 'zh-CN']) {
  for (const value of Object.values(JSON.parse(read(`src/ui/i18nCatalog.${locale}.json`)))) {
    if (typeof value === 'string') for (const ch of value) if (!printed.has(ch)) printed.set(ch, `${locale} catalog`);
  }
}
for (const [, name] of read('src/vehicles/tankLabels.ts').matchAll(/(?:displayName|shortName): '([^']*)'/g)) {
  for (const ch of name) if (!printed.has(ch)) printed.set(ch, `tank name ${name}`);
}
assert.ok(printed.has('ū') && printed.has('ś'), 'the coverage scan reads the tank names (Kyū-maru, Ryś)');
const undrawn = [...printed].filter(([ch]) => {
  const c = ch.codePointAt(0);
  if (/\s/.test(ch) || systemFace(c)) return false;
  return !(PLEX_CHARS.has(c) || ACCENT_CHARS.has(c) || SYMBOL_CHARS.has(c)) || !chakraDraws(c);
}).map(([ch, where]) => `U+${ch.codePointAt(0).toString(16).toUpperCase()} ${ch} (${where})`);
assert.deepEqual(undrawn, [], 'every printed character has a shipped face on the Plex and the Chakra Petch paths');
for (const locale of ['en-US', 'zh-CN']) {
  const marks = [...new Set([...read(`src/ui/i18nCatalog.${locale}.json`)].filter((ch) => /[\u2190-\u22ff]/u.test(ch)))];
  assert.deepEqual(marks.filter((ch) => !COVERED_MARKS.has(ch)), [], `${locale}: every arrow or math mark in a string has a shipped face`);
}
const shippedFontFiles = walk('public/fonts', (path) => /\.(woff2?|ttf|otf)$/i.test(path)).map((path) => path.slice('public/fonts/'.length));
assert.deepEqual(shippedFontFiles.sort(), [...TYPE_FACES, ...TYPE_SYMBOLS.faces, ...TYPE_ACCENTS.faces].map((face) => face.file).sort(), 'public/fonts ships exactly the pinned faces');
const attribution = read('docs/ATTRIBUTION.md');
const notice = read('NOTICE.md');
for (const [voice, source] of Object.entries(TYPE_SOURCES)) {
  const family = TYPE_FAMILY[voice];
  const row = attribution.split('\n').find((line) => line.startsWith(`| ${family} `));
  assert.ok(row, `docs/ATTRIBUTION.md has a ${family} row`);
  assert.match(row, /SIL Open Font License 1\.1/, `${family}: the row names the licence`);
  assert.ok(row.includes(`public/fonts/${source.dir}/`), `${family}: the row names the shipped files`);
  assert.ok(notice.includes(family), `NOTICE.md names ${family}`);
}
{
  const row = attribution.split('\n').find((line) => line.startsWith(`| ${TYPE_SYMBOLS.family} `));
  assert.ok(row && /SIL Open Font License 1\.1/.test(row) && row.includes(`public/fonts/${TYPE_SYMBOLS.dir}/`), 'docs/ATTRIBUTION.md has the Cot Symbols row');
  assert.ok(notice.includes(TYPE_SYMBOLS.family), 'NOTICE.md names Cot Symbols');
  const accents = attribution.split('\n').find((line) => line.startsWith(`| ${TYPE_ACCENTS.family} `));
  assert.ok(accents && /SIL Open Font License 1\.1/.test(accents) && accents.includes(`public/fonts/${TYPE_ACCENTS.dir}/`), 'docs/ATTRIBUTION.md has the Cot Accents row');
  assert.ok(notice.includes(TYPE_ACCENTS.family), 'NOTICE.md names Cot Accents');
}

// ------------------------------------------------------------------------------------------------------- the sources
const SHIPPED_HTML = ['index.html', '404.html', ...walk('site', (path) => path.endsWith('.html'))];
const FIXTURE_HTML = walk('tools/fixtures', (path) => path.endsWith('.html'));
const SHIPPED_CODE = [
  ...walk('src', (path) => /\.(ts|css|js|mjs)$/.test(path) && !/\.(selftest|browser|test-support)\.|\.d\.ts$/.test(path)),
  'src/presentation/home.css',
  ...SHIPPED_HTML,
];
// Code, not commentary: the history notes in comments may name the retired faces and the rules they replaced.
const stripComments = (path, text) => (path.endsWith('.html') ? text.replace(/<!--(?!cot:type)[\s\S]*?-->/g, '') : text)
  .replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
const sources = new Map(SHIPPED_CODE.map((path) => [path, stripComments(path, read(path))]));

// Monument retired: the Dinamo trial builds are out of the repository tree, and no shipped source names the face.
for (const dir of ['public', 'docs', 'src', 'tools', 'site']) {
  assert.deepEqual(walk(dir, (path) => /\.(woff2?|ttf|otf)$/i.test(path) && /monument[-_ ]?grotesk/i.test(path)), [],
    `${dir}/ holds no ABC Monument Grotesk font file`);
}
for (const [path, text] of sources) {
  assert.doesNotMatch(text, /Monument Grotesk|abc-monument|ABCMonument/, `${path} no longer names ABC Monument Grotesk`);
}
for (const path of ['tools/marketing-shots/generate-og-images.mjs', 'tools/media-production/pipeline.mjs',
  'tools/media-production/campaignArtwork.mjs', 'tools/media-r5/kit-page.mjs']) {
  assert.doesNotMatch(read(path), /abc-monument-grotesk/, `${path} renders with the UI faces`);
}
// Inter left the stacks (it survives only inside the two brand-lockup SVG subsets).
assert.doesNotMatch(FONT_STACK, /Inter|Monument/, 'FONT_STACK carries no retired face');
assert.doesNotMatch(read('src/ui/richTooltip.css'), /\bInter\b/, 'richTooltip.css carries no Inter');
assert.equal(FONT_STACK, TYPE_STACK.ui, 'FONT_STACK (canvas-safe) equals the --font-ui stack');
assert.equal(FONT_COND, FONT_STACK, 'the numeral stack is the shell family');
for (const family of ['display', 'body', 'ui']) {
  const accents = family === 'display' ? '' : `'${TYPE_ACCENTS.family}',`;
  assert.match(TYPE_STACK[family], new RegExp(`^'${TYPE_FAMILY[family]}',${accents}'${TYPE_SYMBOLS.family}','${TYPE_FALLBACK_FAMILY[family]}','PingFang SC'`),
    `${family}: the Latin face, ${accents ? 'the accents face (Plex weights), ' : ''}the marks face, its own metric-matched fallback, then the system CJK faces`);
}
assert.match(TYPE_STACK.mono, /^'IBM Plex Mono','Cot Mono Fallback',/, 'mono: Plex Mono, then its own fallback');

// One declaration source: faces are declared only by the cot:type marker (typeFaces.ts), never by a stylesheet.
for (const [path, text] of sources) {
  if (path === 'src/ui/typeFaces.ts') continue;
  const code = path.endsWith('.html') ? text.replace(/<script\b[\s\S]*?<\/script>/g, '') : text;
  assert.doesNotMatch(code, /@font-face/, `${path} declares no face of its own (the cot:type marker is the one source)`);
  assert.doesNotMatch(code, /<link[^>]+rel="preload"[^>]+\/fonts\//, `${path} preloads fonts only through its marker`);
}

// Pages declare only the families they use, so code never names a face family directly: canvas text and inline
// styles read 'Cot UI' (700 is Chakra Petch Bold) or the --font-* tokens, which every page that needs them defines.
// TEMPORARY (release 230): heroCardPolicy.ts's HERO_TYPE still names the faces; the hero-card overlay session
// (item/ui-hero-name-overlay-230) renames it to the tokens, and this exemption goes with that landing.
const FACE_NAMES_PENDING = new Set(['src/ui/heroCardPolicy.ts']);
for (const [path, text] of sources) {
  // The token package holds the stacks as data equal to TYPE_STACK (src/ui/tokens/tokens.selftest.mjs pins them).
  if (path === 'src/ui/typeFaces.ts' || path.startsWith('src/ui/tokens/') || FACE_NAMES_PENDING.has(path)) continue;
  const code = path.endsWith('.html') ? text.replace(/<!--[\s\S]*?-->/g, '') : text;
  assert.doesNotMatch(code, /['"](?:Chakra Petch|IBM Plex Sans|IBM Plex Mono)['"]/, `${path} names a face family; use 'Cot UI' or a --font-* token`);
}

// ------------------------------------------------------------------------------------------------------- the markers
const markersOf = (html) => [...html.matchAll(new RegExp(TYPE_MARKER.source, 'g'))].map((match) => match[1].trim());
const needsType = (html) => /\/src\/|var\(--font-/.test(html);
// Head budgets (brotli, measured standalone): documents are boot bytes that tools/bundle-budget.mjs counts only as
// their inline CSS (inlineCss), so the type head carries its own cap. The block replaces the Monument block (695 raw /
// 190 brotli) and its two preload links; it includes the marks face (two unicode-range rules and its stack name, +373
// raw / +66 brotli on the game page), the readouts' plain zero (+29 raw) and the accents face (three unicode-range rules
// and its stack name, +494 raw / +47 brotli). Measured with the two preload links: the game head is 4,361 raw / 868
// brotli. The cascade-layer wrapper (brand-ui BUI-F3: the order statement and @layer surfaces{}) adds 82 raw / 27
// brotli: the game head measures 4,443 raw / 895 brotli. A public page that shows readouts declares the mono face too
// (bar line 4: the landing's counts and clocks, 2026-10-26, without a preload): /home measures 3,538 raw / 921 brotli.
// Each Chakra Petch face's fallback is a pair, its capitals' rule and the rest's, and the Bold's has a space rule (264: a
// caps title keeps its width and its cap height when the face arrives): +1,107 raw / +66 brotli on the game head
// (5,550 / 961), +1,107 / +71 on /home (4,645 / 992), and on the gallery, which declares the display family as well,
// +2,512 / +98 (6,632 / 956).
const HEAD_BUDGET = Object.freeze({ game: { raw: 5580, brotli: 970 }, page: { raw: 6670, brotli: 1000 } });
const consumes = (path, pattern) => {
  const html = read(path);
  const linked = [...html.matchAll(/href="\/((?:src|public)?[^"]+\.css)"/g)].map((match) => match[1])
    .map((href) => (existsSync(join(ROOT, href)) ? href : existsSync(join(ROOT, 'public', href)) ? `public/${href}` : null)).filter(Boolean);
  return pattern.test(html.replace(/<!--[\s\S]*?-->/g, '')) || linked.some((css) => pattern.test(read(css)));
};
for (const path of [...SHIPPED_HTML, ...FIXTURE_HTML]) {
  const html = read(path);
  if (!needsType(html)) continue;
  const markers = markersOf(html);
  assert.equal(markers.length, 1, `${path} carries exactly one cot:type marker`);
  const marker = parseTypeMarker(markers[0]);
  const charset = html.search(/<meta charset/i);
  if (charset >= 0) assert.ok(charset < html.search(/<!--cot:type/), `${path}: the marker follows <meta charset> (the faces must not push it past 1 KB)`);
  assert.ok(marker.preload.length <= 2, `${path} preloads at most two faces (only what its first paint needs)`);
  assert.ok(marker.families.includes('ui'), `${path} declares the shell family`);
  const expanded = expandTypeMarkers(html);
  assert.equal(markersOf(expanded).length, 0, `${path}: the marker expands`);
  assert.equal(expanded.match(/<style id="cot-font-faces">/g)?.length, 1, `${path}: one face declaration block`);
  assert.equal(expanded.match(/rel="preload"[^>]+as="font"/g)?.length ?? 0, marker.preload.length, `${path}: preloads equal the marker's faces`);
  const head = typeHead(marker);
  if (SHIPPED_HTML.includes(path)) {
    const budget = path === 'index.html' ? HEAD_BUDGET.game : HEAD_BUDGET.page;
    assert.ok(head.length <= budget.raw && brotli(head) <= budget.brotli,
      `${path}: type head ${head.length} raw / ${brotli(head)} brotli within ${budget.raw} / ${budget.brotli}`);
    // Opt-in rule sets only where the page reads them; a declared family only where its token or face is used.
    if (marker.scale) assert.ok(consumes(path, /var\(--(?:fs|t|lh|track)-/), `${path}: the type scale is emitted only where it is read`);
    if (marker.fx) assert.ok(consumes(path, /\bt-(?:hollow|accent)\b/), `${path}: the display treatments are emitted only where they are used`);
    // Mono backs .num, which the page's own modules may render (the HUD preview draws the live HUD).
    if (marker.families.includes('mono')) assert.ok(consumes(path, /var\(--(?:font-)?mono\)|\bnum\b/) || /<script type="module" src="\/src\//.test(html),
      `${path}: mono is declared where it is read`);
  }
}
const marker = (path) => parseTypeMarker(markersOf(read(path))[0]);
assert.deepEqual(marker('index.html'), { families: ['ui', 'mono', 'body'], preload: ['display-700', 'body-500'], scale: false, fx: false },
  'the game page declares the shell, readout and prose-emphasis families and preloads the wordmark and UI-text faces');
assert.deepEqual(marker('404.html').families, ['ui'], 'the 404 declares only the shell family (its kit voices read it: notFound.css)');
// Preloads: Medium and Bold on the game page and home only (the type rules); every other document relies on its
// metric-matched fallbacks, so a late face swaps in without moving text.
const PRELOADERS = new Set(['index.html', 'site/home.html']);
for (const path of SHIPPED_HTML) {
  const markers = markersOf(read(path));
  if (!markers.length || PRELOADERS.has(path)) continue;
  assert.deepEqual(parseTypeMarker(markers[0]).preload, [], `${path} preloads no font (only the game page and home do)`);
}
assert.deepEqual(marker('site/home.html').preload, ['display-700', 'body-400'], 'home preloads its headline and reading faces');
assert.ok(marker('site/home.html').fx, 'the landing reads the shared hollow and accent treatments');
assert.equal(typeHead('').includes('rel="preload"'), false, 'a bare marker declares the faces without preloading');
assert.deepEqual(parseTypeMarker('').families, [...TYPE_DEFAULT_FAMILIES], 'a bare marker declares the shell and readout families');
assert.throws(() => parseTypeMarker('ui body-600'), /no declared family uses it/, 'a preload must be a face of a declared family');

// ------------------------------------------------------------------------------------------------- faces and weights
const parseRules = (css) => [...css.matchAll(/@font-face\{([^}]+)\}/g)].map(([, body]) => Object.fromEntries(
  body.split(';').filter(Boolean).map((decl) => [decl.slice(0, decl.indexOf(':')), decl.slice(decl.indexOf(':') + 1)])));
const faceRules = parseRules(fontFaceCss());
const ruleFor = (family, weight, rules = faceRules) => {
  const hits = rules.filter((rule) => rule['font-family'] === `'${family}'` && (() => {
    const [lo, hi = lo] = rule['font-weight'].split(' ').map(Number);
    return weight >= lo && weight <= hi;
  })());
  assert.equal(hits.length, 1, `${family} ${weight}: exactly one face (no overlap, no gap)`);
  return hits[0];
};
const fileOf = (rule) => rule.src.match(/url\(([^)]+)\)/)?.[1];
// A fallback's capitals rule (unicode-range) stands beside the rule for the rest of the same weights; the rest's rules
// alone cover every weight once.
const restRules = faceRules.filter((rule) => !rule['unicode-range']);
for (const family of ['display', 'body', 'mono', 'ui']) {
  for (let weight = 100; weight <= 1000; weight += 50) {
    ruleFor(TYPE_FAMILY[family], weight);
    ruleFor(TYPE_FALLBACK_FAMILY[family], weight, restRules);
  }
}
for (const voice of ['display', 'body', 'mono']) {
  for (const weight of TYPE_WEIGHTS[voice]) {
    assert.equal(fileOf(ruleFor(TYPE_FAMILY[voice], weight)), typeFaceFile(`${voice}-${weight}`), `${voice} ${weight} is its own face`);
  }
}
// The weight-voiced shell family: Plex Sans for reading weights, Chakra Petch for the label voice and the bold voice.
assert.deepEqual(TYPE_WEIGHTS.ui.map((weight) => fileOf(ruleFor('Cot UI', weight))),
  ['body-400', 'body-500', 'display-600', 'display-700'].map(typeFaceFile), "'Cot UI' 400/500/600/700 are four distinct faces");
for (const rule of faceRules.filter((entry) => entry.src.startsWith('url('))) {
  assert.equal(rule['font-display'], 'swap', 'late faces swap in over the metric-matched fallback');
  if (rule['font-family'] === `'${TYPE_SYMBOLS.family}'`) {
    assert.equal(rule['unicode-range'], TYPE_SYMBOLS.range, 'the marks face downloads only for a page that prints a mark');
  } else if (rule['font-family'] === `'${TYPE_ACCENTS.family}'`) {
    assert.equal(rule['unicode-range'], TYPE_ACCENTS.range, 'the accents face downloads only for a page that prints one of its letters');
  } else assert.equal(rule['unicode-range'], undefined, 'no unicode-range: every file is already a Latin subset');
}
for (let weight = 100; weight <= 1000; weight += 50) ruleFor(TYPE_SYMBOLS.family, weight);
for (let weight = 100; weight <= 1000; weight += 50) ruleFor(TYPE_ACCENTS.family, weight);
assert.deepEqual([400, 500, 600].map((weight) => fileOf(ruleFor(TYPE_ACCENTS.family, weight))), TYPE_ACCENTS.faces.map((face) => `/fonts/${face.file}`),
  'each Plex Sans weight takes the accents drawn from that weight');
assert.ok(!fontFaceCss(['display']).includes(TYPE_ACCENTS.family) && !fontFaceCss(['mono']).includes(TYPE_ACCENTS.family),
  'display-only and readout-only blocks carry no accents face (their stacks do not name it)');
assert.ok(!fontFaceCss(['mono']).includes(TYPE_SYMBOLS.family), 'a readout-only block carries no marks face (the mono stack does not name it)');
// A page's block holds only its families' faces and fallbacks.
const gameRules = parseRules(typeHead(marker('index.html')));
assert.deepEqual([...new Set(gameRules.map((rule) => rule['font-family'].replace(/'/g, '')))].sort(),
  ['Cot Accents', 'Cot Body Fallback', 'Cot Fallback', 'Cot Mono Fallback', 'Cot Symbols', 'Cot UI', 'IBM Plex Mono', 'IBM Plex Sans'], 'the game page declares only what it uses');
// Metric-matched fallbacks, keyed by family: the overrides are the face's vertical metrics over the size-adjust
// (fontTools, 2026-10-17: IBM Plex Sans and Mono 1025/-275, Chakra Petch 992/-308 at 1000 units per em).
const PLEX = [1025, 275];
const CHAKRA = [992, 308];
// Each Chakra Petch face (one weight range each) has a capitals rule after its rest rule, and the Bold face a space rule
// after those: the browser tries the later rule first for the characters both cover, and takes the line's metrics from
// the rule that covers the space (src/ui/typeFallbackMetrics.selftest.mjs holds their widths and the Bold cap height).
const BOLD = '650 1000';
const FALLBACK_METRICS = {
  ui: { '100 549': PLEX, '550 649': CHAKRA, '650 1000': CHAKRA },
  body: { '100 549': PLEX, '550 1000': PLEX },
  display: { '100 549': CHAKRA, '550 649': CHAKRA, '650 1000': CHAKRA },
  mono: { '100 1000': PLEX },
};
for (const [family, ranges] of Object.entries(FALLBACK_METRICS)) {
  assert.deepEqual(TYPE_FALLBACKS[family].filter((face) => !face.range).map((face) => face.weight), Object.keys(ranges), `${family}: its fallback ranges`);
  assert.equal(faceRules.filter((entry) => entry['font-family'] === `'${TYPE_FALLBACK_FAMILY[family]}'`).length, TYPE_FALLBACKS[family].length,
    `${TYPE_FALLBACK_FAMILY[family]}: one @font-face rule per fallback face`);
  const chakraRanges = Object.keys(ranges).filter((range) => ranges[range] === CHAKRA);
  assert.deepEqual(TYPE_FALLBACKS[family].filter((face) => face.range).map((face) => `${face.weight} ${face.range}`),
    chakraRanges.flatMap((range) => [`${range} ${TYPE_CAPS_RANGE}`, ...(range === BOLD ? [`${range} ${TYPE_SPACE_RANGE}`] : [])]),
    `${family}: a capitals rule for each Chakra Petch face, a space rule for its Bold, and no other ranged rule`);
  const familyRules = faceRules.filter((entry) => entry['font-family'] === `'${TYPE_FALLBACK_FAMILY[family]}'`);
  for (const range of chakraRanges) {
    const at = (unicodeRange) => familyRules.findIndex((entry) => entry['font-weight'] === range && entry['unicode-range'] === unicodeRange);
    const rest = at(undefined), caps = at(TYPE_CAPS_RANGE), space = at(TYPE_SPACE_RANGE);
    const key = `${TYPE_FALLBACK_FAMILY[family]} ${range}`;
    assert.ok(rest >= 0 && caps > rest, `${key}: the capitals rule follows the rest's`);
    if (range === BOLD) assert.ok(space > caps, `${key}: the space rule comes last`);
    for (const index of [caps, space].filter((entry) => entry >= 0)) {
      assert.equal(familyRules[index].src, familyRules[rest].src, `${key}: every rule draws the same local face`);
    }
  }
  for (const [range, [ascent, descent]] of Object.entries(ranges)) for (const rule of familyRules.filter((entry) => entry['font-weight'] === range)) {
    const key = `${TYPE_FALLBACK_FAMILY[family]} ${range}${rule['unicode-range'] ? ` ${rule['unicode-range']}` : ''}`;
    const size = parseFloat(rule['size-adjust']);
    assert.ok(size >= 90 && size <= 110, `${key}: size-adjust within 10 %`);
    assert.ok(Math.abs(parseFloat(rule['ascent-override']) - ascent / size * 10) < 0.15, `${key}: ascent matches its face`);
    assert.ok(Math.abs(parseFloat(rule['descent-override']) - descent / size * 10) < 0.15, `${key}: descent matches its face`);
    assert.equal(rule['line-gap-override'], '0%', `${key}: no line gap`);
    const locals = rule.src;
    if (family === 'mono') assert.match(locals, /local\('Courier New'\).*local\('Liberation Mono'\).*local\('Droid Sans Mono'\)/, `${key}: desktop, Linux and Android monospace`);
    else assert.match(locals, /local\('Arial(?: Bold)?'\).*local\('Liberation Sans(?: Bold)?'\).*local\('Roboto(?: Bold)?'\)/, `${key}: desktop, Linux and Android sans`);
  }
}

// The weight lint: every weight the shipped code asks for is a real face, in every form a weight can take.
const ALLOWED = new Set(TYPE_WEIGHTS.ui);
const WEIGHT_FORMS = [
  /font-weight:\s*(\d{3}|bolder|lighter)\b/g, // CSS
  /\bfont:\s*(?:(?:italic|normal|oblique)\s+)?(\d{3})\s/g, // CSS shorthand
  /fontWeight\s*[:=]\s*[`'"]?(\d{3}|bolder|lighter)\b/g, // style property or object literal
  /setProperty\(\s*['"]font-weight['"]\s*,\s*['"](\d{3}|bolder|lighter)/g, // style.setProperty
  /[`'"](?:(?:italic|normal|oblique)\s+)?(\d{3})\s+\d*\.?\d+px\b/g, // canvas font strings and font object literals
];
const weightsIn = (text) => WEIGHT_FORMS.flatMap((form) => [...text.matchAll(form)].map((match) => match[1]));
// Named exemptions, each a count that may only fall:
// - battleHudLayout.css holds the HUD notice planner's and the touch trays' tuned boxes (HUD r10g); its notice, controls
//   and kill-lane sizes take the floor in the HUD's own layout pass with its probes. The ammo slot's rules there already
//   follow the floor. Its three legacy 800s resolve to Chakra Petch Bold.
// - garage.css: TEMPORARY (release 230), the compact hero card's 5 px dev-only tag, which the hero-card overlay session
//   (item/ui-hero-name-overlay-230) resizes with the compact card's name and tier.
const LANE_OWNED = Object.freeze({
  'src/ui/battleHudLayout.css': { weights: 3, under: 22, tabular: 1 },
  'src/ui/garage.css': { under: 1 },
});
for (const [path, text] of sources) {
  const bad = weightsIn(text).filter((weight) => !ALLOWED.has(Number(weight)));
  assert.ok(bad.length <= (LANE_OWNED[path]?.weights ?? 0), `${path}: weights ${bad.join(', ')} are not shipped faces (use 400/500/600/700)`);
}
for (const [probe, expected] of [
  ['.a{font-weight:800}', ['800']], ['.a{font: italic 800 12px/1 x}', ['800']], ['.a{font-weight:bolder}', ['bolder']],
  ["const o = { font: '800 12px sans-serif' };", ['800']], ["e.style.fontWeight='900';", ['900']], ['e.style.fontWeight = 750;', ['750']],
  ["c.font='700 7px x';", ['700']], ["s.setProperty('font-weight','850')", ['850']], ['.a{font-weight:600}', ['600']],
]) assert.deepEqual(weightsIn(probe), expected, `the weight lint reads ${probe}`);

// The floor: nothing a player reads is declared under TYPE_FLOOR_PX, in any form a size can take.
assert.equal(TYPE_FLOOR_PX, 11, 'the floor is the the type rules caps-label floor, 11 px');
assert.equal(TYPE_FLOOR_PX, TYPE_SCALE[0], 'the floor is the first step of the type scale');
const SIZE_FORMS = [
  /font-size:\s*(\d*\.?\d+)px/g, // CSS
  /\bfont:\s*(?:(?:normal|italic|oblique|bold|small-caps|\d{3})\s+)*(\d*\.?\d+)px/g, // CSS shorthand
  /fontSize\s*[:=]\s*[`'"](\d*\.?\d+)px/g, // style property or object literal
  /setProperty\(\s*['"]font-size['"]\s*,\s*['"](\d*\.?\d+)px/g, // style.setProperty
  /[`'"](?:(?:italic|normal|oblique|bold)\s+)?(?:\d{3}\s+)?(\d*\.?\d+)px\s+(?:\/|[`'"$]|var\(|'|"|[A-Za-z])/g, // canvas / object-literal fonts
];
// clamp(), max() and min() sizes: the smallest size each can compute to. clamp() is held up by its first argument, max()
// by its largest fixed argument, min() by its smallest; rem counts 16 px; relative-only arguments are not a floor.
const FN_SIZE = /(?:font-size:\s*|\bfont:\s*(?:(?:normal|italic|oblique|bold|small-caps|\d{3})\s+)*)(clamp|max|min)\(/g;
const fnFloors = (text) => [...text.matchAll(FN_SIZE)].map((match) => {
  let at = match.index + match[0].length, depth = 1, body = '';
  while (at < text.length && depth) { const ch = text[at++]; depth += ch === '(' ? 1 : ch === ')' ? -1 : 0; if (depth) body += ch; }
  const args = []; let level = 0, part = '';
  for (const ch of body) { level += ch === '(' ? 1 : ch === ')' ? -1 : 0; if (ch === ',' && !level) { args.push(part); part = ''; } else part += ch; }
  args.push(part);
  const fixed = args.map((arg) => /^\s*(\d*\.?\d+)(px|rem)\s*$/.exec(arg)).map((m) => (m ? parseFloat(m[1]) * (m[2] === 'rem' ? 16 : 1) : null));
  const known = fixed.filter((value) => value !== null);
  if (match[1] === 'clamp') return fixed[0];
  return known.length ? (match[1] === 'max' ? Math.max(...known) : Math.min(...known)) : null;
}).filter((value) => value !== null);
const sizesIn = (text) => [...new Set(SIZE_FORMS.flatMap((form) => [...text.matchAll(form)].map((match) => `${match.index}:${match[1]}`)))]
  .map((entry) => parseFloat(entry.split(':')[1])).concat(fnFloors(text));
// Canvas text painted into textures and world labels is sized in texture pixels, then scaled by the camera or the
// sprite; those files draw at their own resolution and are not CSS text (each is a 3D or texture painter).
const TEXTURE_PAINTERS = new Set(['src/vehicles/materialPainter.ts', 'src/vehicles/materialPainterWorker.ts', 'src/vehicles/vehicleMarkings.ts',
  'src/vehicles/materials.ts', 'src/game/matchModeWorldPresentation.ts']);
for (const [path, text] of sources) {
  if (TEXTURE_PAINTERS.has(path)) continue;
  const under = sizesIn(text).filter((px) => px < TYPE_FLOOR_PX);
  assert.ok(under.length <= (LANE_OWNED[path]?.under ?? 0),
    `${path}: ${under.length} font sizes under ${TYPE_FLOOR_PX}px (${under.join(', ')}); the floor is ${TYPE_FLOOR_PX}px`);
}
for (const [probe, expected] of [
  ['.a{font-size:8px}', [8]], ['.a{font:700 10px/1 x}', [10]], ['.a{font: italic 600 9.5px x}', [9.5]], ["e.style.fontSize='9px'", [9]],
  ["const o = { font: '600 7px sans-serif' };", [7]], ["c.font='700 7px x';", [7]], ["s.setProperty('font-size','10px')", [10]],
  ['.a::after{font-size:max(10px,.55em)}', [10]], ['.a{font-size:clamp(9px,2vw,14px)}', [9]], ['.a{font-size:min(10px,3vw)}', [10]],
  ['.a{font:700 clamp(.5rem,1vw,1rem)/1 x}', [8]], ['.a{font-size:max(.55em,1vw)}', []],
]) assert.deepEqual(sizesIn(probe), expected, `the size lint reads ${probe}`);

// Tabular figures: only the .num class sets them (Monument's tnum widened every space; the type rules).
for (const [path, text] of sources) {
  if (path === 'src/ui/typeFaces.ts') continue;
  const hits = text.match(/font-variant(?:-numeric)?\s*:[^;}]*|fontVariant(?:Numeric)?\b|font-feature-settings\s*:[^;}]*tnum|['"]tnum['"]/g) ?? [];
  assert.ok(hits.length <= (LANE_OWNED[path]?.tabular ?? 0), `${path}: tabular figures only through .num (${hits.join(', ')})`);
}
const tokens = typeTokenCss(marker('index.html'));
assert.match(tokens, /\.num\{font-family:var\(--font-mono\)!important;font-variant-numeric:lining-nums tabular-nums;font-feature-settings:'ss04'\}/,
  '.num: IBM Plex Mono with tabular lining figures and its plain zero (ss04), not the dotted code zero');
assert.equal((tokens.match(/tabular-nums/g) ?? []).length, 1, 'the .num rule is the only tabular rule');
// The readouts that tick in place carry .num (clock, scores, tallies, counters, HP, ammo, flight instruments, sliders).
const hud = read('src/ui/hud.ts');
for (const [path, pattern, what] of [
  ['index.html', /class="cot-boot-foot num"/, 'the boot version'],
  ['src/ui/hud.ts', /<span class="tm num"(?:[ >]|\$\{datumAttr\('clock'\)\}>)/, 'the battle clock'],
  ['src/ui/hud.ts', /class="al num"/, 'the alive tallies'],
  ['src/ui/hud.ts', /<span class="kills num" hidden>/, 'the roster kill tallies'],
  ['src/ui/hud.ts', /<strong class="speed num"/, 'the speedometer'],
  ['src/ui/hud.ts', /<div class="hp num">/, 'the target HP'],
  ['src/ui/aerialHud.ts', /const value=node\('b','num',host\)/, 'the flight instruments'],
  ['src/ui/settings.ts', /const num = el\('input', 'num', wrap\);\s*num\.type = 'number';/, 'the slider readouts'],
  ['src/ui/damagePanel.ts', /class="hpnum num"/, 'the hull points'],
]) assert.match(read(path), pattern, `${path}: ${what} carry .num`);
// .num is never on prose (the type rules): a localized string inside a .num element would set words in Plex Mono.
for (const [path, text] of sources) {
  assert.doesNotMatch(text, /class="[^"]*\bnum\b[^"]*"[^>]*>\$\{t\(/, `${path}: .num holds a readout, never a localized string`);
}
assert.match(hud, /<span class="mv"(\$\{datumAttr\('objective'\)\})?><\/span>/, 'the mode status sentence reads in the shell face (no .num)');
// The team scores are the HUD's display numerals (the data voice: Bold lining figures): Chakra Petch Bold, centred
// in fixed columns. They change on a kill, never per frame, so proportional figures move nothing beside them.
assert.match(hud, /<b class="fg">0<\/b>/, 'the allied score is a display numeral');
assert.match(hud, /<b class="fe">0<\/b>/, 'the enemy score is a display numeral');
assert.match(hud, /\.cot-top \.fg,\.cot-top \.fe,\.cot-top \.fh b\{font-family:\$\{FONT_COND\};font-size:24px;font-weight:700;/, 'the scores (and the Frontline hostiles on the smallest touch windows) set in the bold display voice (24 px points: owner 2026-10-25, the top plate \"less so big and wide\")');
// The end screen's headline tallies and team scores are display numerals too: they count up once (1.05 s ease-out) and
// settle, and the settled frame is what reads (Plex Mono's full-cell comma printed "8 , 420"). Live gauges keep .num.
const endScreen = read('src/ui/endScreen.ts');
assert.match(endScreen, /const v = el\('div', 'v', t\);/, 'the counted tallies are display numerals');
assert.match(endScreen, /<div class="sn">\$\{fmtN\(allyStats\.kills\)\}/, 'the end-screen team score is a display numeral');
assert.match(endScreen, /\.cot-es \.es-tal \.v\{font-family:\$\{FONT_COND\};font-weight:700;/, 'the tallies set in the bold display voice');
assert.match(hud, /netPingValue\.classList\.toggle\('num', ping > 0\)/, 'the link readout is .num only while it shows milliseconds');
assert.match(read('src/ui/hudAmmunitionPresentation.ts'), /classList\.toggle\('num', numericCount\)/, 'the ammo count carries .num while it counts (∞ stays in the shell face)');
assert.match(read('src/ui/hudConsumablePresentation.ts'), /classList\.toggle\('num', nextCooling\)/, 'the consumable countdown carries .num (the ready ∞ stays in the shell face)');
// ∞ is the marks face's (0.78 em, Monument Bold's was 0.685): the ready and unlimited marks keep the counts' sizes.
assert.doesNotMatch(hud, /\.cnt:not\(\.num\)\{font-size/, 'the ∞ marks need no size patch now a real face draws them');

// ------------------------------------------------------------------------------------------------ tokens and resets
const scaled = typeTokenCss({ scale: true, fx: true });
for (const px of [11, 12, 13, 14, 16, 18, 20, 24, 32, 44, 60, 88, 128]) {
  assert.ok(TYPE_SCALE.includes(px), `the type scale step ${px} exists`);
  assert.ok(scaled.includes(`--fs-${px}:calc(${px}px*var(--cot-type-scale))`), `--fs-${px} scales with the type scale`);
}
for (const name of ['--cot-type-scale', '--cot-user-text', '--t-display', '--t-title', '--t-body', '--t-label', '--t-data']) {
  assert.ok(scaled.includes(`${name}:`), `${name} is a scale token`);
}
assert.ok(!tokens.includes('--fs-') && !tokens.includes('.t-hollow'), 'the game page carries no scale or treatment it does not read');
for (const name of ['--font-ui', '--font-mono', '--font-body', '--hud-font']) assert.ok(tokens.includes(`${name}:`), `the game page defines ${name}`);
assert.ok(tokens.includes(':lang(zh-CN){letter-spacing:0!important}'), 'zh-CN: no tracking on Chinese (CJK tracking defect)');
assert.doesNotMatch(tokens, /text-transform:none/, 'zh-CN keeps case transforms (they only ever touch Latin)');
assert.ok(scaled.includes(':lang(zh-CN) .t-hollow{color:var(--hollow-ink,#eef4f8);-webkit-text-stroke:0;opacity:.72}'), 'zh-CN: no outline type (a quieter solid ink keeps the hierarchy)');
assert.match(scaled, /\.t-hollow\{color:transparent;-webkit-text-stroke:/, 'the hollow display treatment (owner UI rule 5)');
assert.match(read('site/home.html'), /<h1 class="hero__title" id="hero-title"><span class="home-sr">Claude of Tanks\. <\/span><span data-i18n="home\.hero\.title">/, 'the landing\'s h1 is the hero\'s headline and names the game; the lockup is the nav bar\'s alone (owner 2026-10-25)');
assert.match(read('site/home.html'), /<h2 class="home-h2 press__title" id="press-title">[^]*?<span class="t-hollow" data-i18n-html="home\.social\.kicker"/, 'the landing\'s section headline uses the shared hollow treatment (2026-10-25: the press band)');
// Every hollow (outline) treatment in a shipped stylesheet turns solid for Chinese (the type rules: no outline type on CJK).
// The 404 numeral is digits in every locale.
const HOLLOW_DIGITS_ONLY = new Set(['.not-found h1', '.cot-facet-tally>.num:not(b)']);
for (const [path, text] of sources) {
  for (const [, selector, body] of text.matchAll(/(?<=^|[{}\n])\s*([^{}@;]+?)\{([^{}]*-webkit-text-stroke:\s*(?!0\b)[^{}]*)\}/g)) {
    if (!/color:\s*transparent/.test(body) || selector.includes(':lang(zh-CN)') || selector.includes('${')) continue;
    for (const one of selector.split(',').map((part) => part.replace(/^[\s'"`+]+/, '').trim()).filter(Boolean)) {
      if (HOLLOW_DIGITS_ONLY.has(one)) continue;
      const zh = new RegExp(`:lang\\(zh-CN\\) ${one.replace(/[.*+?^$()|[\]\\]/g, '\\$&')}\\{[^}]*-webkit-text-stroke:0`);
      assert.match(text, zh, `${path}: the hollow ${one} has a solid zh-CN form`);
    }
  }
}
// Chinese display headings open up: CJK glyphs fill the em box, so a Latin display leading under 1 would make two lines
// touch (the r5 docs hero). Every tight heading rule of a public stylesheet has a zh-CN rule (:lang(zh-CN) or
// html[lang^='zh'], directly or through an :is() list, by selector or by its heading tag) at 1.1 or more. The 404 numeral
// is digits in every locale.
const ZH_DISPLAY_EXEMPT = new Set(['.not-found h1']);
for (const path of ['src/presentation/home.css', 'src/docs/docs.css', 'src/docs/chapters.css', 'src/gallery/gallery.css', 'src/presentation/notFound.css',
  'src/presentation/mediaArchive.css', 'src/presentation/manualStart.css', 'src/presentation/publicNav.css']) {
  const css = stripComments(path, read(path));
  const covered = new Set();
  for (const [, selector, body] of css.matchAll(/(?<=^|[{}\n])\s*([^{}@;]+?)\{([^{}]*)\}/g)) {
    const zh = /^(?::lang\(zh-CN\)|html\[lang\^='zh'\])\s+(.+)$/.exec(selector.trim());
    const lh = /line-height:\s*([\d.]+)(?![\w%])/.exec(body);
    if (!zh || !lh || Number(lh[1]) < 1.1) continue;
    const inner = /^:is\((.*)\)$/.exec(zh[1].trim());
    for (const one of (inner ? inner[1] : zh[1]).split(',')) covered.add(one.trim());
  }
  for (const [, selector, body] of css.matchAll(/(?<=^|[{}\n])\s*([^{}@;]+?)\{([^{}]*)\}/g)) {
    if (/lang|zh/.test(selector)) continue;
    const lh = /(?:line-height:\s*|\bfont:[^;}]*\/)(0?\.\d+)(?![\w%])/.exec(body);
    if (!lh || Number(lh[1]) >= 1) continue;
    for (const one of selector.split(',').map((part) => part.trim())) {
      const tag = /\b(h[1-3])$/.exec(one)?.[1];
      if (!tag || ZH_DISPLAY_EXEMPT.has(one)) continue;
      const bare = one.replace(/^:where\([^)]*\)\s+/, '');
      assert.ok(covered.has(one) || covered.has(bare) || covered.has(tag),
        `${path}: the display heading ${one} (line-height ${lh[1]}) has a zh-CN line-height of 1.1 or more`);
    }
  }
}
// The docs hero lines are blocks: the <br> between them would print a blank line.
assert.match(read('src/docs/docs.css'), /\.docs-hero h1 br\{display:none\}/, 'docs hero: no blank line between its two blocks');
// The ammo type label sits top-right, where the reload curtain fills from: it rides above the curtain.
const zOf = (selector) => Number(new RegExp(`${selector.replace(/[.]/g, '\\.')}\\{(?:\\$\\{[^}]*\\}|[^}])*?z-index:(\\d+)`).exec(hud)?.[1]);
assert.ok(zOf('.cot-shell .ty') > zOf('.cot-shell .cool'), 'the ammo type label reads over the reload curtain');
assert.ok(zOf('.cot-shell .key') > zOf('.cot-shell .cool'), 'the ammo slot key reads over the reload curtain too');
// The docs hero date is part of each locale's string (2026 年 9 月 30 日 in Chinese), never an English var.
assert.doesNotMatch(read('site/docs.html'), /data-i18n="docs\.hero\.eyebrow" data-i18n-vars/, 'docs hero: the date is not an English var');
assert.match(JSON.parse(read('src/ui/i18nCatalog.zh-CN.json'))['docs.hero.eyebrow'], /\d{4} 年 \d{1,2} 月 \d{1,2} 日/, 'docs hero: the Chinese date reads in Chinese');
// Latin-only brand lockups inside a Chinese page keep their tracking: lang="en", tracked on that element itself.
for (const path of SHIPPED_HTML) {
  assert.doesNotMatch(read(path), /<span>Claude <b>of Tanks<\/b><\/span>/, `${path}: the brand lockup is marked lang="en"`);
}
assert.match(read('src/ui/brandMark.ts'), /WORDMARK_WORDS[\s\S]*WORDMARK_OF/, 'the wordmark is the outlined master (SPEC 3.1: never live text)');
assert.match(read('src/ui/garage.ts'), /\$\{BRAND_WORDMARK_HTML\}/, 'the garage bar sets the one wordmark');
assert.match(read('src/presentation/publicShell.ts'), /WORDMARK = `<span class="cot-wordmark">\$\{BRAND_WORDMARK_HTML\}<\/span>`/, 'the public bar and footer set the one wordmark (no live text to track)');
assert.match(read('index.html'), /<div class="cot-boot-mark" role="img" aria-label="Claude of Tanks"[^>]*><!-- cot:boot-lockup -->[\s\S]*?<svg class="wm-stack"/,
  'the boot lockup is the outlined wordmark stacked beside the tank (SPEC 3.3; owner, 2026-10-26), named for assistive reading');

// The zh-CN label floor (the type rules: Chinese labels one step up, 13 px floor) ships only inside Chinese documents, right
// after their type head; English documents and the game entry carry none of it. Every selector names classes the shipped
// sources still use (a renamed label must move its floor entry with it), and each block stays inside its budget.
for (const route of PUBLIC_ROUTE_RECORDS) {
  const source = route.sourceHtml === 'index.html' || route.sourceHtml === '404.html' ? route.sourceHtml : `site/${route.sourceHtml}`;
  const html = expandTypeMarkers(read(source));
  assert.doesNotMatch(localizeHtmlDocument(html, route, 'en-US'), /cot-zh-type/, `${route.id}: the English document carries no zh-CN floor`);
  const zh = localizeHtmlDocument(html, route, 'zh-CN');
  assert.equal(zh.match(/<style id="cot-zh-type">/g)?.length, 1, `${route.id}: the Chinese document carries one zh-CN floor`);
  assert.ok(zh.includes(`</style>${zhTypeFloorStyle(route.id)}`) && zh.indexOf('id="cot-zh-type"') > zh.indexOf('id="cot-font-faces"'),
    `${route.id}: the floor follows the type head`);
  const css = zhTypeFloorCss(route.id);
  const { length } = css;
  assert.ok(length <= 2600 && brotli(css) <= 640, `${route.id}: the zh-CN floor is ${length} raw / ${brotli(css)} brotli (within 2600 / 640)`);
  assert.match(css, /^:root:lang\(zh-CN\)\{--fs-11:calc\(13px\*var\(--cot-type-scale,1\)\);--fs-12:calc\(13px\*var\(--cot-type-scale,1\)\)\}/,
    `${route.id}: the label tokens step up to 13 px in Chinese`);
  if (zhTypeFloorSelectors(route.id).length) {
    const rules = css.split('\n').slice(1);
    assert.match(rules[0], /\{font-size:13px\}$/, `${route.id}: the floor lifts its labels to 13 px`);
    for (const rule of rules.slice(1)) assert.match(rule, /^:lang\(zh\) [^{]+\{line-height:1;margin-top:\d+px\}$/, `${route.id}: besides the floor, only a lifted label's leading`);
  }
}
{
  const shippedText = [...sources].filter(([path]) => path !== 'src/ui/zhTypeFloor.ts').map(([, text]) => text).join('\n');
  for (const id of ['game', 'home', 'docs', 'docsVehicles', 'notFound', 'gallery']) {
    for (const selector of zhTypeFloorSelectors(id)) {
      assert.match(selector, /^[^,{};]+$/, `${id}: ${selector} is one complex selector`);
      for (const [, name] of selector.matchAll(/\.([a-zA-Z][\w-]*)/g)) {
        assert.ok(new RegExp(`[\\s"'.\\x60]${name}(?![\\w-])`).test(shippedText), `${id}: the zh-CN floor names .${name}, which no shipped source uses`);
      }
    }
  }
  assert.ok(zhTypeFloorSelectors('game').includes('.cot-brief .objectives') && zhTypeFloorSelectors('game').includes('.nv .nav-label'),
    'the game floor covers the mission brief and the game bar');
}

// An explicit body family on every page (no Times fallback anywhere).
assert.match(read('index.html'), /body, button, input, select, textarea \{[^}]*font-family: var\(--font-ui\);/, 'game page: explicit body family');
for (const [path, pattern] of [
  ['src/presentation/home.css', /(?:^|[}\s])body\{[^}]*font-family:var\(--font-ui\)/],
  ['src/docs/docs.css', /(?:^|[}\s])body\{[^}]*font:500 var\(--fs-14\)\/1\.68 var\(--font\)/],
  ['src/gallery/gallery.css', /(?:^|[}\s])body\{[^}]*font:500 var\(--fs-12\)\/1\.45 var\(--font\)/],
  ['src/presentation/notFound.css', /body\.not-found-page\{[^}]*font-family:var\(--font-ui\)/],
]) assert.match(read(path), pattern, `${path}: the page body names the UI family`);
for (const path of ['src/docs/docs.css', 'src/gallery/gallery.css']) {
  assert.match(read(path), /--font:var\(--font-ui\)/, `${path}: its --font token reads the UI family`);
}

// Canvas text that paints the brand face loads the pinned display file (vehicle markings, social cards).
const display700 = TYPE_FACES.find((face) => face.voice === 'display' && face.weight === 700).file;
for (const path of ['src/vehicles/materialPainterWorkerClient.ts', 'tools/marketing-shots/generate-og-images.mjs']) {
  assert.ok(read(path).includes(display700), `${path} loads ${display700}`);
}

console.log(`typeSystem: ${TYPE_FACES.length} pinned OFL faces + ${TYPE_SYMBOLS.faces.length} marks + ${TYPE_ACCENTS.faces.length} accents faces, `
  + `${printed.size} printed characters drawn, ${sources.size} shipped sources (weights, `
  + `${TYPE_FLOOR_PX}px floor, .num-only tabular figures, zh display leading and 13 px label floor, no Monument), ${SHIPPED_HTML.length + FIXTURE_HTML.length} `
  + `documents' markers, preloads and head budgets passed`);
