import assert from 'node:assert/strict';
import { createCanvas, Path2D, DOMMatrix, ImageData } from '@napi-rs/canvas';
import { createCatalogCamoPainter, isPatchFieldArt, liftDigitalTone } from './catalogCamoPainter.ts';
import { createMaterialPainter } from './materialPainter.ts';
import { resolveCamoVisual, camoPatternIdHash, camoPatternStreamSeed } from './materials.ts';
import { patchRoles } from './camoPatchField.ts';
import './tankFactory.ts';
import { getSpec } from './specs.ts';
Object.assign(globalThis, { Path2D, DOMMatrix, ImageData });

// Fleet lane camouflage painter v2 (2026-10-08; wave 268, both blind critics on every tank: "small evenly sized round
// blobs", "soft feathered edges", "single scale", "printed cloth, not paint"). The three-colour field ('summer': the
// nato and woodland recipes), the desert field and the digital patterns are drawn from domain-warped Voronoi patch
// fields (camoPatchField.ts). Measured on the painted tile, each texel classified to its nearest palette colour:
//  - three-colour: each tone holds its share; edges are hard (at most one blended texel across a boundary); the main
//    patches are large (the largest region at least an eighth of the tile) AND broken by small islands (dozens of
//    regions under half a percent of the tile: more than one scale); the shapes are irregular, not round (median
//    isoperimetric quotient of the sizable regions at most 0.5; a disc is 1) and run along the plate (median bounding
//    width over height at least 1.2); the dark tone bridges the two main tones;
//  - digital: every tone present, the boundaries broken into clusters (edge share and region count) on crisp pixels.
// Before (the value-noise painter, 2026-10-08 morning): the four three-colour paints' main regions measured quotients of
// 0.6 to 0.9 (rounded blobs) at one scale.

const painter = createMaterialPainter(createCanvas), catalog = createCatalogCamoPainter(createCanvas);
const N = 256;
const around = (i) => { const x = i % N, y = (i / N) | 0; return [((y + N - 1) % N) * N + x, ((y + 1) % N) * N + x, y * N + (x + N - 1) % N, y * N + (x + 1) % N]; };
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function classified(specId, patternId) {
  const visual = resolveCamoVisual(getSpec(specId), patternId);
  const seed = camoPatternStreamSeed(visual, camoPatternIdHash(patternId));
  const c = createCanvas(N, N);
  catalog(c.getContext('2d'), N, visual, painter.mulberry32(seed));
  const d = c.getContext('2d').getImageData(0, 0, N, N).data;
  const digital = visual.catalogPattern === 'digital' || visual.catalogPattern === 'digitaldesert';
  const pal = [visual.base, ...(visual.patches || [])].map(hex).map((p) => (digital ? liftDigitalTone(p) : p));
  const cls = new Int8Array(N * N), dist = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) {
    let best = 0, bd = Infinity;
    pal.forEach((p, k) => { const e = Math.hypot(d[i * 4] - p[0], d[i * 4 + 1] - p[1], d[i * 4 + 2] - p[2]); if (e < bd) { bd = e; best = k; } });
    cls[i] = best; dist[i] = bd;
  }
  return { cls, dist, tones: pal.length, visual, pal };
}
function regions(cls, tone) {
  const seen = new Uint8Array(N * N), out = [];
  for (let s = 0; s < N * N; s++) {
    if (seen[s] || cls[s] !== tone) continue;
    const stack = [s], texels = []; seen[s] = 1;
    while (stack.length) { const i = stack.pop(); texels.push(i); for (const j of around(i)) if (!seen[j] && cls[j] === tone) { seen[j] = 1; stack.push(j); } }
    out.push(texels);
  }
  return out;
}
const median = (values) => { const v = [...values].sort((a, b) => a - b); return v[v.length >> 1]; };
const shareOf = (cls, tone) => cls.reduce((a, c) => a + (c === tone ? 1 : 0), 0) / (N * N);

// --- three-colour fields
const fieldPaints = [['t90m_proryv', 'paint_ru_t80u_modern'], ['m1a2', 'paint_m1a1'], ['ua_t72b3m_hetman_ii', 'paint_ua_t80u_modern'], ['k2', 'sig_k2']];
const fieldLog = [];
for (const [specId, patternId] of fieldPaints) {
  const { cls, dist, tones, visual, pal } = classified(specId, patternId);
  assert.equal(visual.catalogPattern, 'summer', `${patternId}: the three-colour field art`);
  assert.ok(isPatchFieldArt(visual.catalogPattern), `${patternId}: drawn by the patch fields`);
  assert.equal(tones, 3, `${patternId}: three colours`);
  const roles = patchRoles(pal);
  const base = shareOf(cls, roles.base), second = shareOf(cls, roles.second), dark = shareOf(cls, roles.dark);
  assert.ok(base >= .38 && base <= .58, `${patternId}: base share ${base.toFixed(2)}`);
  assert.ok(second >= .24 && second <= .44, `${patternId}: second main tone share ${second.toFixed(2)}`);
  assert.ok(dark >= .12 && dark <= .30, `${patternId}: dark share ${dark.toFixed(2)}`);
  const blended = dist.reduce((a, v) => a + (v > 12 ? 1 : 0), 0) / (N * N);
  assert.ok(blended <= .05, `${patternId}: hard edges (${(blended * 100).toFixed(1)} % blended texels)`);
  const all = [];
  for (let tone = 0; tone < tones; tone++) for (const texels of regions(cls, tone)) all.push({ tone, texels });
  const largest = Math.max(...all.map(({ texels }) => texels.length)) / (N * N);
  const small = all.filter(({ texels }) => texels.length < N * N * .005).length;
  assert.ok(largest >= .125, `${patternId}: large main patches (largest region ${(largest * 100).toFixed(1)} % of the tile)`);
  assert.ok(small >= 40, `${patternId}: islands at a second scale (${small} small regions)`);
  const big = all.filter(({ texels }) => texels.length >= N * N * .002);
  const quotient = median(big.map(({ texels }) => {
    const own = new Set(texels); let perimeter = 0;
    for (const i of texels) for (const j of around(i)) if (!own.has(j)) perimeter++;
    return 4 * Math.PI * texels.length / (perimeter * perimeter);
  }));
  const aspect = median(big.map(({ texels }) => {
    const xs = texels.map((i) => i % N), ys = texels.map((i) => (i / N) | 0);
    const w = Math.max(...xs) - Math.min(...xs) + 1, h = Math.max(...ys) - Math.min(...ys) + 1;
    return w > N / 2 || h > N / 2 ? null : w / h;
  }).filter((v) => v != null));
  assert.ok(quotient <= .5, `${patternId}: irregular patches, not round blobs (median quotient ${quotient.toFixed(2)})`);
  assert.ok(aspect >= 1.2, `${patternId}: patches run along the plate (median aspect ${aspect.toFixed(2)})`);
  let bridging = 0, darkTexels = 0;
  for (const { tone, texels } of all) {
    if (tone !== roles.dark) continue;
    const touches = new Set();
    for (const i of texels) for (const j of around(i)) if (cls[j] !== tone) touches.add(cls[j]);
    darkTexels += texels.length;
    if (touches.size >= 2) bridging += texels.length;
  }
  assert.ok(bridging / darkTexels >= .6, `${patternId}: the dark tone bridges both main tones (${(bridging / darkTexels).toFixed(2)})`);
  fieldLog.push(`${patternId} q ${quotient.toFixed(2)} aspect ${aspect.toFixed(2)} largest ${(largest * 100).toFixed(0)}%/${small} islands`);
}

// --- digital fields
const pixelPaints = [['ua_t84_oplot_m', 'sig_ua_t84_oplot_m'], ['type99a', 'sig_type99a'], ['t90m_x', 'sig_t90m'],
  ['pl01_105', 'sig_pl01_105'], ['type100', 'sig_type100'], ['m1a2', 'digitaldesert']];
const pixelLog = [];
for (const [specId, patternId] of pixelPaints) {
  const { cls, tones, visual } = classified(specId, patternId);
  assert.ok(['digital', 'digitaldesert'].includes(visual.catalogPattern), `${patternId}: a digital art`);
  for (let tone = 0; tone < tones; tone++) assert.ok(shareOf(cls, tone) >= .03, `${patternId}: tone ${tone} present (${shareOf(cls, tone).toFixed(3)})`);
  let edges = 0; for (let i = 0; i < N * N; i++) if (around(i).some((j) => cls[j] !== cls[i])) edges++;
  let count = 0; for (let tone = 0; tone < tones; tone++) count += regions(cls, tone).length;
  const share = edges / (N * N);
  assert.ok(share >= .13, `${patternId}: broken into clusters (edge share ${share.toFixed(3)})`);
  assert.ok(count >= 100, `${patternId}: islands and notches at more than one scale (${count} regions)`);
  pixelLog.push(`${patternId} ${share.toFixed(3)}/${count}`);
}

// --- determinism: the fields are hashed from the recipe's own stream, so a repeat paints the same tile
for (const [specId, patternId] of [fieldPaints[0], pixelPaints[0]]) {
  assert.deepEqual(classified(specId, patternId).cls, classified(specId, patternId).cls, `${patternId}: repeatable`);
}
console.log(`camoPatchFields: three-colour patch fields (${fieldLog.join('; ')}); digital clusters (${pixelLog.join('; ')})`);
