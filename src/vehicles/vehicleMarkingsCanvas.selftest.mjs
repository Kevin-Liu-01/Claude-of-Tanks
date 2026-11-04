import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  drawNationalInsignia, drawTacticalNumber, GLACIS_MARKING_OUTLINE, GLACIS_MARKING_TRACKING, SHELL_MIDDLE_CAP_LIFT,
} from './vehicleMarkings.ts';
import { CMAP, GLYPHS } from '../ui/glacis.js';

function createRecordingContext() {
  const operations = [];
  const context = { operations };
  for (const method of [
    'save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'arc',
    'stroke', 'fill', 'clip', 'fillRect', 'strokeRect',
  ]) {
    context[method] = (...args) => operations.push([method, ...args]);
  }
  for (const property of ['lineJoin', 'lineCap', 'strokeStyle', 'fillStyle', 'lineWidth']) {
    Object.defineProperty(context, property, {
      set(value) { operations.push([property, value]); },
    });
  }
  return context;
}

const insignias = [
  'us-star', 'de-cross', 'ru-star', 'cn-star', 'gb-roundel', 'fr-roundel',
  'il-star', 'it-shield', 'jp-roundel', 'pl-checker', 'kr-taeguk',
  'se-crowns', 'ua-trident', 'za-castle', 'au-kangaroo', 'br-eb-arms', 'br-cruzeiro', 'br-ring', 'br-osorio', 'unknown-shield',
];
// 2026-10-01 (owner: retire frozen pins): the pinned sha256 of the recorded insignia operation stream is
// gone (texture canvases sit outside the fleet geometry ledger). Live contracts: every insignia, including
// the unknown-nation fallback, paints real marks deterministically with balanced painter state.
const paintAll = () => {
  const recording = createRecordingContext();
  insignias.forEach((insignia, index) => {
    drawNationalInsignia(recording, insignia, 20 + index, 30 - index, 48 + index);
  });
  return recording;
};
const context = paintAll();
assert.deepEqual(paintAll().operations, context.operations, 'insignia painters are deterministic');
insignias.forEach((insignia, index) => {
  const single = createRecordingContext();
  drawNationalInsignia(single, insignia, 20 + index, 30 - index, 48 + index);
  assert.ok(single.operations.some(([operation]) => ['fill', 'stroke', 'fillRect', 'strokeRect'].includes(operation)),
    `${insignia}: paints real marks`);
});
assert.equal(
  context.operations.filter(([operation]) => operation === 'save').length,
  context.operations.filter(([operation]) => operation === 'restore').length,
  'nested shield clipping and outer painter state remain balanced',
);

// 264 / glacis-269: a tactical number fits its bounds once measured. Numbers Glacis sets are its outlines (one path,
// stroked under its fill): a digit number keeps the 1.75-per-character size it always had (its caps 0.7 of the size),
// and a letter code that would pass its bounds (OTCO, KURSK, 99A2 ran 5-8 px past a 252 px decal) comes down until it
// and its outline fit, centred across the bounds, its caps standing where Chrome set the shell face's: 0.087 of the
// size above the middle (centred caps cut the BMPT-90's bottoms off at the end of its side face).
function tracingContext() {
  const drawn = { xs: [], ys: [], lineWidth: 0, strokes: 0, fills: 0, texts: [] };
  return { drawn, canvas: { width: 256, height: 256 }, save() {}, restore() {}, beginPath() {},
    moveTo(x, y) { drawn.xs.push(x); drawn.ys.push(y); }, lineTo(x, y) { drawn.xs.push(x); drawn.ys.push(y); }, closePath() {},
    stroke() { drawn.strokes++; }, fill() { drawn.fills++; },
    set lineWidth(value) { drawn.lineWidth = value; }, set lineJoin(_) {}, set miterLimit(_) {}, set strokeStyle(_) {}, set fillStyle(_) {},
    set font(_) {}, set textAlign(_) {}, set textBaseline(_) {},
    strokeText(text) { drawn.texts.push(text); }, fillText(text) { drawn.texts.push(text); } };
}
const bounds = { x: 2, y: 34, width: 252, height: 188 };
for (const [number, fits] of [['32', true], ['732', true], ['OTCO', false], ['KURSK', false], ['99A2', false]]) {
  const ctx = tracingContext();
  drawTacticalNumber(ctx, { tacticalNumber: number }, bounds);
  const { xs, ys, lineWidth } = ctx.drawn;
  assert.equal(ctx.drawn.texts.length, 0, `${number}: drawn as Glacis outlines, never canvas text`);
  assert.deepEqual([ctx.drawn.strokes, ctx.drawn.fills], [1, 1], `${number}: one path, its outline stroked under its fill`);
  const rule = Math.min(bounds.height * 0.68, bounds.width / number.length * 1.75);
  const capHeight = Math.max(...ys) - Math.min(...ys);
  const width = Math.max(...xs) - Math.min(...xs) + lineWidth;
  if (fits) assert.ok(Math.abs(capHeight - 0.7 * rule) < 0.01, `${number}: a number that fits keeps the per-character size (caps ${capHeight.toFixed(2)})`);
  else assert.ok(capHeight < 0.7 * rule - 0.5, `${number}: a number wider than its bounds comes down (caps ${capHeight.toFixed(1)} < ${(0.7 * rule).toFixed(1)})`);
  assert.ok(width <= bounds.width * 0.94 + 1e-9, `${number}: ${width.toFixed(1)} px with its outline fits ${bounds.width} px`);
  const mid = (Math.max(...ys) + Math.min(...ys)) / 2;
  assert.ok(Math.abs(mid - (bounds.y + bounds.height / 2 - capHeight / 0.7 * SHELL_MIDDLE_CAP_LIFT)) < 0.01,
    `${number}: its caps stand where the shell face's did (centre ${mid.toFixed(2)})`);
  assert.ok(Math.abs(SHELL_MIDDLE_CAP_LIFT - 0.0869) < 1e-4, 'Chakra Petch Bold\'s caps stood 0.087 em above Chrome\'s middle');
  assert.ok(Math.abs(lineWidth - Math.max(2, capHeight / 0.7 * GLACIS_MARKING_OUTLINE)) < 0.01,
    `${number}: its outline is ${GLACIS_MARKING_OUTLINE * 100} % of its size`);
}
// glacis-269 blind critics: at Glacis's own spacing (side bearings 28 + 28 of 1000) an 8 % outline merged neighbours
// and clogged counters. Markings space wide: any two glyphs keep 6 % of the em of paint clear between their outlines
// (Q's tail runs to its advance by design and is left out).
const bearings = [...'0123456789ABCDEFGHIJKLMNOPRSTUVWXYZ-./'].map((ch) => {
  const glyph = GLYPHS[CMAP[ch.codePointAt(0)]];
  const xs = glyph.d.match(/-?\d+(?:\.\d+)?/g).map(Number).filter((_, index) => index % 2 === 0);
  return [Math.min(...xs), glyph.advance - Math.max(...xs)];
});
const tightest = Math.min(...bearings.map(([left]) => left)) + Math.min(...bearings.map(([, right]) => right));
assert.ok(tightest + GLACIS_MARKING_TRACKING - GLACIS_MARKING_OUTLINE * 1000 >= 60,
  `the tightest pair keeps ${tightest + GLACIS_MARKING_TRACKING - GLACIS_MARKING_OUTLINE * 1000}/1000 of paint clear between outlines`);
// Text Glacis cannot set as written keeps the shell face, measured into its bounds (a measuring context: bold capitals
// ~0.72 em, lowercase ~0.56, a space ~0.28, as the Cot UI face sets them).
function measuringContext() {
  const drawn = { font: '', lineWidth: 0, texts: [] };
  const size = () => Number(/(\d+(?:\.\d+)?)px/.exec(drawn.font)[1]);
  return { drawn, canvas: { width: 256, height: 256 }, save() {}, restore() {},
    set font(value) { drawn.font = value; }, get font() { return drawn.font; },
    set lineWidth(value) { drawn.lineWidth = value; }, set strokeStyle(_) {}, set fillStyle(_) {},
    set textAlign(_) {}, set textBaseline(_) {},
    measureText: (text) => ({ width: [...text].reduce((sum, c) => sum + (c === ' ' ? 0.28 : /[a-z0-9-]/.test(c) ? 0.56 : 0.72), 0) * size() }),
    strokeText(text) { drawn.texts.push(text); }, fillText() {} };
}
for (const number of ['Kp 12', 'ПТ-76']) {
  const ctx = measuringContext();
  drawTacticalNumber(ctx, { tacticalNumber: number }, bounds);
  assert.deepEqual(ctx.drawn.texts, [number], `${number}: Glacis cannot set it as written, so the shell face does`);
  assert.ok(ctx.measureText(number).width + ctx.drawn.lineWidth <= bounds.width * 0.94 + 1e-9, `${number}: fits its bounds`);
}

// Glacis (DECISIONS 2026-11-03; owner 2026-11-04: the tanks' markings only, never the HUD, so no font file ships): the
// outline module vendored byte for byte from Princeton-Powerlifting 8eb6c4f, its licence and attribution beside it.
{
  const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url));
  assert.equal(createHash('sha256').update(read('src/ui/glacis.js')).digest('hex'),
    '5871e53fa50f001a9fea46b13f29283f6c09cb53f6fcd161907682d1777bb6f5', 'src/ui/glacis.js is the 8eb6c4f module, byte for byte');
  const ofl = read('public/fonts/glacis/OFL.txt').toString('utf8');
  assert.match(ofl, /SIL Open Font License, Version 1\.1/, 'Glacis ships its OFL text');
  assert.match(ofl, /^Copyright 2026 Kevin Liu/, 'Glacis keeps its copyright line');
  const row = read('docs/ATTRIBUTION.md').toString('utf8').split('\n').find((line) => line.startsWith('| Glacis '));
  assert.ok(row && /SIL Open Font License 1\.1/.test(row) && row.includes('src/ui/glacis.js')
    && row.includes('public/fonts/glacis/OFL.txt'), 'docs/ATTRIBUTION.md has the Glacis row (the module and its licence)');
  assert.ok(read('NOTICE.md').toString('utf8').includes('Glacis'), 'NOTICE.md names Glacis');
}

console.log('vehicleMarkingsCanvas.selftest: all insignia painters and fallback pass; tactical numbers are Glacis outlines that fit their bounds');
