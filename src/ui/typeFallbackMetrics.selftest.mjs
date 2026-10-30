// typeFallbackMetrics.selftest.mjs — (264) a title set in Chakra Petch keeps its width when the face arrives.
// Copyright © 2026 Kevin B. Liu.
//
// Main, 2026-10-28: on /docs/fleet at 390 px the banner title rewrapped from two lines to one when Chakra Petch arrived,
// its fallback's capitals 1.7 % wider than the face's. Every fallback that stands in for a Chakra Petch face (the shell's
// 'Cot Fallback' at 550-1000 and 'Cot Display Fallback') is Arial or Arial Bold under size-adjust: a rule for the
// capitals (TYPE_CAPS_RANGE) after a rule for the rest (src/ui/typeFaces.ts). This receipt sets fixed strings in both
// from advance widths: Chakra Petch's read from the shipped WOFF2 bytes (cmap, hmtx), Arial's pinned below, and the
// browser's choice of rule per character (of one weight's rules, the last whose unicode-range covers it). A caps title
// holds within 1 % of the face for every Chakra Petch weight, and mixed-case text within 1.5 %; the Bold's line takes
// Chakra Petch's cap height within 1 %. Kerning is the browser's and is left out: in Chrome, 809 rendered runs from the
// docs, home, gallery and 404 pages (en and zh) and the fleet's names in Garage capitals put the caps titles at 700 at a
// median +0.37 % (-0.90 % to +2.11 %), against +2.42 % (+0.90 % to +3.89 %) with one size per family.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync } from 'node:zlib';
import { TYPE_CAPS_RANGE, TYPE_FACE_RANGES, TYPE_FALLBACK_FAMILY, TYPE_SPACE_RANGE, fontFaceCss, typeFaceFile } from './typeFaces.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// Arial and Arial Bold 5.01 advance widths (hmtx, 2048 units per em, read with fontTools on macOS, 2026-10-28) for the
// characters the strings use; Liberation Sans and Arimo, the Linux and ChromeOS stand-ins, carry the same widths.
const ARIAL_CHARS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789,.-';
const ARIAL_UNITS = {
  regular: [569, 1366, 1366, 1479, 1479, 1366, 1251, 1593, 1479, 569, 1024, 1366, 1139, 1706, 1479, 1593, 1366, 1593, 1479, 1366,
    1251, 1479, 1366, 1933, 1366, 1366, 1251, 1139, 1139, 1024, 1139, 1139, 569, 1139, 1139, 455, 455, 1024, 455, 1706, 1139, 1139,
    1139, 1139, 682, 1024, 569, 1139, 1024, 1479, 1024, 1024, 1024, 1139, 1139, 1139, 1139, 1139, 1139, 1139, 1139, 1139, 1139, 569,
    569, 682],
  bold: [569, 1479, 1479, 1479, 1479, 1366, 1251, 1593, 1479, 569, 1139, 1479, 1251, 1706, 1479, 1593, 1366, 1593, 1479, 1366, 1251,
    1479, 1366, 1933, 1366, 1366, 1251, 1139, 1251, 1139, 1251, 1139, 682, 1251, 1251, 569, 569, 1139, 569, 1821, 1251, 1251, 1251,
    1251, 797, 1139, 682, 1251, 1139, 1593, 1139, 1139, 1024, 1139, 1139, 1139, 1139, 1139, 1139, 1139, 1139, 1139, 1139, 569, 569,
    682],
};
// Their cap heights (OS/2 sCapHeight, same units): the line's cap edge that text-box trims a title to.
const ARIAL_CAP = { regular: 1467 / 2048, bold: 1466 / 2048 };
const ARIAL = Object.fromEntries(Object.entries(ARIAL_UNITS).map(([face, units]) => {
  assert.equal(units.length, ARIAL_CHARS.length, `Arial ${face}: one width per character`);
  return [face, new Map([...ARIAL_CHARS].map((char, i) => [char, units[i] / 2048]))];
}));

// A face's advance widths per character and its cap height, read from its WOFF2 bytes: the table directory, the one
// brotli stream, then head (units per em), hhea (long metrics count), OS/2 (sCapHeight), the cmap's format 4 subtable
// and hmtx (untransformed in these files).
const WOFF2_TAGS = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ',
  'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB'];
function advancesOf(file) {
  const bytes = readFileSync(join(ROOT, 'public', file));
  assert.equal(bytes.toString('latin1', 0, 4), 'wOF2', `${file}: a WOFF2 file`);
  const numTables = bytes.readUInt16BE(12);
  const compressed = bytes.readUInt32BE(20);
  let at = 48;
  const base128 = () => { let value = 0; for (let i = 0; i < 5; i++) { const byte = bytes[at++]; value = value * 128 + (byte & 127); if (!(byte & 128)) return value; } throw new Error('UIntBase128'); };
  const directory = [];
  for (let i = 0; i < numTables; i++) {
    const flags = bytes[at++];
    const index = flags & 63;
    const tag = index === 63 ? bytes.subarray(at, (at += 4)).toString('latin1') : WOFF2_TAGS[index];
    const version = flags >> 6;
    const length = base128();
    const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0;
    assert.ok(!(tag === 'hmtx' && transformed), `${file}: an untransformed hmtx`);
    directory.push({ tag, length: transformed ? base128() : length });
  }
  const data = brotliDecompressSync(bytes.subarray(at, at + compressed));
  const tables = {};
  let offset = 0;
  for (const { tag, length } of directory) { tables[tag] = data.subarray(offset, offset + length); offset += length; }
  const unitsPerEm = tables.head.readUInt16BE(18);
  const longMetrics = tables.hhea.readUInt16BE(34);
  const { cmap, hmtx } = tables;
  const subtables = Array.from({ length: cmap.readUInt16BE(2) }, (_, i) => ({ platform: cmap.readUInt16BE(4 + i * 8), encoding: cmap.readUInt16BE(6 + i * 8), at: cmap.readUInt32BE(8 + i * 8) }));
  const pick = subtables.find((entry) => entry.platform === 3 && entry.encoding === 1) ?? subtables.find((entry) => entry.platform === 0);
  const sub = cmap.subarray(pick.at);
  assert.equal(sub.readUInt16BE(0), 4, `${file}: a format 4 cmap`);
  const segments = sub.readUInt16BE(6) / 2;
  const ends = 14, starts = ends + segments * 2 + 2, deltas = starts + segments * 2, ranges = deltas + segments * 2;
  const glyphOf = (code) => {
    for (let i = 0; i < segments; i++) {
      const end = sub.readUInt16BE(ends + i * 2), start = sub.readUInt16BE(starts + i * 2);
      if (code < start || code > end) continue;
      const delta = sub.readInt16BE(deltas + i * 2), range = sub.readUInt16BE(ranges + i * 2);
      const raw = range ? sub.readUInt16BE(ranges + i * 2 + range + (code - start) * 2) : code;
      return range && !raw ? 0 : (raw + delta) & 0xffff;
    }
    return 0;
  };
  assert.ok(tables['OS/2'].readUInt16BE(0) >= 2, `${file}: an OS/2 table with a cap height`);
  const advances = new Map([...ARIAL_CHARS].map((char) => {
    const glyph = glyphOf(char.codePointAt(0));
    assert.ok(glyph, `${file}: a glyph for '${char}'`);
    return [char, hmtx.readUInt16BE(Math.min(glyph, longMetrics - 1) * 4) / unitsPerEm];
  }));
  return { advances, capHeight: tables['OS/2'].readInt16BE(88) / unitsPerEm };
}

// The fallback rules as they ship, in order, and the one the browser draws a character with at a weight: of the rules
// whose weight range holds it, the last whose unicode-range covers the character (a rule with none covers every one).
const rules = [...fontFaceCss(['ui', 'display']).matchAll(/@font-face\{([^}]+)\}/g)].map(([, body]) => Object.fromEntries(
  body.split(';').filter(Boolean).map((decl) => [decl.slice(0, decl.indexOf(':')), decl.slice(decl.indexOf(':') + 1)])));
const covers = (range, char) => range.split(',').some((part) => {
  const [lo, hi = lo] = part.replace(/^U\+/i, '').split('-').map((hex) => parseInt(hex, 16));
  return char.codePointAt(0) >= lo && char.codePointAt(0) <= hi;
});
assert.deepEqual([...ARIAL_CHARS].filter((char) => covers(TYPE_CAPS_RANGE, char)), [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'], 'the capitals range is A-Z');
assert.deepEqual([...ARIAL_CHARS].filter((char) => covers(TYPE_SPACE_RANGE, char)), [' '], 'the space range is the space');
/** The rule a character is drawn with at a weight, its Arial face and its scale. */
function ruleFor(family, weight, char) {
  const own = rules.filter((rule) => rule['font-family'] === `'${family}'` && (() => {
    const [lo, hi = lo] = rule['font-weight'].split(' ').map(Number);
    return weight >= lo && weight <= hi;
  })());
  const rule = own.findLast((entry) => !entry['unicode-range'] || covers(entry['unicode-range'], char));
  assert.ok(rule, `${family} ${weight}: a fallback rule for '${char}'`);
  const face = /^local\('Arial Bold'\)/.test(rule.src) ? 'bold' : /^local\('Arial'\)/.test(rule.src) ? 'regular' : null;
  assert.ok(face, `${family} ${weight}: the fallback draws Arial or Arial Bold`);
  return { face, scale: parseFloat(rule['size-adjust']) / 100 };
}
function fallbackWidth(family, weight, text) {
  let width = 0;
  for (const char of text) {
    const { face, scale } = ruleFor(family, weight, char);
    width += ARIAL[face].get(char) * scale;
  }
  return width;
}

// Every capital in a sentence, and the title Main measured; the same sentence in mixed case for the rest's rule.
const CAPS_TITLES = ['THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG', 'EVERY TANK, SIDE BY SIDE'];
const MIXED = 'The quick brown fox jumps over the lazy dog';
const rows = [], capRows = [];
for (const family of ['ui', 'display']) {
  for (const [voice, weight] of TYPE_FACE_RANGES[family]) {
    if (voice !== 'display') continue;
    const { advances, capHeight } = advancesOf(typeFaceFile(`display-${weight}`));
    const faceWidth = (text) => [...text].reduce((sum, char) => sum + advances.get(char), 0);
    const off = (text) => (fallbackWidth(TYPE_FALLBACK_FAMILY[family], weight, text) / faceWidth(text) - 1) * 100;
    for (const title of CAPS_TITLES) {
      const delta = off(title);
      rows.push(delta);
      assert.ok(Math.abs(delta) <= 1, `${TYPE_FALLBACK_FAMILY[family]} ${weight}: '${title}' ${delta.toFixed(2)} % against Chakra Petch (within 1 %)`);
    }
    const mixed = off(MIXED);
    assert.ok(Math.abs(mixed) <= 1.5, `${TYPE_FALLBACK_FAMILY[family]} ${weight}: '${MIXED}' ${mixed.toFixed(2)} % against Chakra Petch (within 1.5 %)`);
    // The titles that trim to the cap (the /home hero, the press stats, the credits) are Bold: the line takes its cap
    // edge from the rule that covers the space, so that rule's Arial Bold sets Chakra Petch's cap height.
    if (weight === 700) {
      const { face, scale } = ruleFor(TYPE_FALLBACK_FAMILY[family], weight, ' ');
      capRows.push((ARIAL_CAP[face] * scale / capHeight - 1) * 100);
      assert.ok(Math.abs(capRows.at(-1)) <= 1, `${TYPE_FALLBACK_FAMILY[family]} 700: cap height ${capRows.at(-1).toFixed(2)} % against Chakra Petch (within 1 %)`);
    }
  }
}
assert.equal(rows.length, 2 * CAPS_TITLES.length + 3 * CAPS_TITLES.length, 'the shell family\'s two Chakra Petch weights and the display family\'s three');

assert.equal(capRows.length, 2, 'the cap height of both Bold fallbacks');
const worst = (list) => list.reduce((max, delta) => Math.max(max, Math.abs(delta)), 0).toFixed(2);
console.log(`typeFallbackMetrics: ${rows.length} caps titles across 5 Chakra Petch fallbacks within ${worst(rows)} % of the face, `
  + `the Bold cap height within ${worst(capRows)} % (1 % allowed) PASS`);
