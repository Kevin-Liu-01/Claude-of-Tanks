import assert from 'node:assert/strict';
import { createCanvas, Path2D, DOMMatrix, ImageData } from '@napi-rs/canvas';
import { createCatalogCamoPainter } from './catalogCamoPainter.ts';
import { createMaterialPainter } from './materialPainter.ts';
import { resolveCamoVisual, camoPatternIdHash, camoPatternStreamSeed } from './materials.ts';
import './tankFactory.ts';
import { getSpec } from './specs.ts';
Object.assign(globalThis, { Path2D, DOMMatrix, ImageData });

// Fleet lane (2026-10-08; blind critics on the T-90M: "a field of smooth, near-identical black ovals ... read as holes
// punched through the skirts"; on the Type 99A and the Oplot-M: "smooth blobs with stair-stepped edges", "a stair-stepped
// bitmap of huge squares"). The three-colour field art paints its dark tone as strokes that bridge the green and the
// sand, and the digital art breaks its fields into pixel clusters at more than one scale. Shapes are measured on the
// painted tile (each texel classified to its nearest palette colour), never on the painter's own fields.

const painter = createMaterialPainter(createCanvas), catalog = createCatalogCamoPainter(createCanvas);
const N = 256;
function classified(specId, patternId) {
  const visual = resolveCamoVisual(getSpec(specId), patternId);
  const seed = camoPatternStreamSeed(visual, camoPatternIdHash(patternId));
  const c = createCanvas(N, N);
  catalog(c.getContext('2d'), N, visual, painter.mulberry32(seed));
  const d = c.getContext('2d').getImageData(0, 0, N, N).data;
  const pal = [visual.base, ...(visual.patches || [])].map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  const cls = new Int8Array(N * N);
  for (let i = 0; i < N * N; i++) {
    let best = 0, bd = Infinity;
    pal.forEach((p, k) => { const e = (d[i * 4] - p[0]) ** 2 + (d[i * 4 + 1] - p[1]) ** 2 + (d[i * 4 + 2] - p[2]) ** 2; if (e < bd) { bd = e; best = k; } });
    cls[i] = best;
  }
  return { cls, tones: pal.length, visual };
}
const around = (i) => { const x = i % N, y = (i / N) | 0; return [((y + N - 1) % N) * N + x, ((y + 1) % N) * N + x, y * N + (x + N - 1) % N, y * N + (x + 1) % N]; };
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

// --- the three-colour field: dark strokes, not ovals. A sizable dark patch (at least 0.2% of the tile) is measured by its
// isoperimetric quotient (4 pi A / P^2: 1 for a disc, lower for a stroke or a ragged patch) and its second-moment
// elongation; before this change the four paints' median quotients were 0.61, 0.65, 0.45 and 0.47
const strokePaints = [['t90m_proryv', 'paint_ru_t80u_modern'], ['m1a2', 'paint_m1a1'], ['ua_t72b3m_hetman_ii', 'paint_ua_t80u_modern'], ['k2', 'sig_k2']];
const strokeLog = [];
for (const [specId, patternId] of strokePaints) {
  const { cls, tones, visual } = classified(specId, patternId);
  assert.equal(visual.catalogPattern, 'summer', `${patternId}: the three-colour field art`);
  assert.equal(tones, 3, `${patternId}: three colours`);
  const patches = regions(cls, 1).filter((texels) => texels.length >= N * N * 0.002);
  assert.ok(patches.length >= 3, `${patternId}: the dark tone paints several patches (${patches.length})`);
  const quotient = patches.map((texels) => {
    const own = new Set(texels); let perimeter = 0;
    for (const i of texels) for (const j of around(i)) if (!own.has(j)) perimeter++;
    return 4 * Math.PI * texels.length / (perimeter * perimeter);
  });
  const elongation = [];
  let bridging = 0, dark = 0;
  for (const texels of patches) {
    const touches = new Set();
    for (const i of texels) for (const j of around(i)) if (cls[j] !== 1) touches.add(cls[j]);
    dark += texels.length;
    if (touches.size >= 2) bridging += texels.length;
    const xs = texels.map((i) => i % N), ys = texels.map((i) => (i / N) | 0);
    if (Math.max(...xs) - Math.min(...xs) > N / 2 || Math.max(...ys) - Math.min(...ys) > N / 2) continue; // wraps the tile
    const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (let t = 0; t < xs.length; t++) { const dx = xs[t] - mx, dy = ys[t] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    const half = (sxx + syy) / 2, root = Math.sqrt(Math.max(0, half * half - (sxx * syy - sxy * sxy)));
    elongation.push(Math.sqrt((half + root) / Math.max(1e-6, half - root)));
  }
  const q = median(quotient), e = median(elongation);
  assert.ok(q <= 0.42, `${patternId}: dark patches are strokes, not ovals (median quotient ${q.toFixed(2)})`);
  assert.ok(e >= 1.6, `${patternId}: dark patches run long (median elongation ${e.toFixed(2)})`);
  assert.ok(bridging / dark >= 0.85, `${patternId}: the dark strokes bridge both other colours (${(bridging / dark).toFixed(2)})`);
  strokeLog.push(`${patternId} q ${q.toFixed(2)} e ${e.toFixed(1)}`);
}

// --- the digital fields: pixel clusters at more than one scale. Edge texels (a texel with a differently coloured
// neighbour) and colour regions per tile; before this change the Oplot-M, Type 99A, PL-01 and Type 100 tiles held
// 0.134, 0.129, 0.117 and 0.115 edge shares
const pixelPaints = [['ua_t84_oplot_m', 'sig_ua_t84_oplot_m'], ['type99a', 'sig_type99a'], ['t90m_x', 'sig_t90m'],
  ['pl01_105', 'sig_pl01_105'], ['type100', 'sig_type100'], ['m1a2', 'digitaldesert']];
const pixelLog = [];
for (const [specId, patternId] of pixelPaints) {
  const { cls, tones, visual } = classified(specId, patternId);
  assert.ok(['digital', 'digitaldesert'].includes(visual.catalogPattern), `${patternId}: a digital art`);
  let edges = 0; for (let i = 0; i < N * N; i++) if (around(i).some((j) => cls[j] !== cls[i])) edges++;
  let count = 0; for (let tone = 0; tone < tones; tone++) count += regions(cls, tone).length;
  const share = edges / (N * N);
  assert.ok(share >= 0.137, `${patternId}: broken into clusters (edge share ${share.toFixed(3)})`);
  assert.ok(count >= 80, `${patternId}: islands and notches at more than one scale (${count} regions)`);
  pixelLog.push(`${patternId} ${share.toFixed(3)}/${count}`);
}

// --- determinism: the new fields draw nothing from the stream, so a repeat paints the same tile
for (const [specId, patternId] of [strokePaints[0], pixelPaints[0]]) {
  assert.deepEqual(classified(specId, patternId).cls, classified(specId, patternId).cls, `${patternId}: repeatable`);
}
console.log(`camoStrokesAndClusters: three-colour dark strokes (${strokeLog.join('; ')}); digital clusters (${pixelLog.join('; ')})`);
