// The woods past the edge as woods, not a wall (the borders lane, round 4, 2026-10-08; the gauntlet at Verdant's and
// Steinburg's south-west corners: "a uniform, even-height treeline runs across the whole horizon and closes the view";
// at Saltmere's: "a straight palisade of identical bare trunks under a flat canopy line, no shrub mantle"):
//   1. the hand-over to the ranges' stands is measured on the square's metric (horizonRelief.ts horizonStandReach), so a
//      corner keeps the border's woods — its open fields along the edge, its copses — as far out as a side's middle;
//   2. the near band's free-form woods are copses: glades break them on the first few hundred metres past the edge
//      (borderLandform.ts gladeAt), none past 470 m nor within 25 m of the edge;
//   3. a wood's edge facing the square is a wood's edge (horizonVista.ts shapeWoodsEdges): its trees lower than the
//      interior's, emergents over the canopy, and a mantle of bushes along it (drawn with the hedges).
import assert from 'node:assert/strict';
import { Matrix4, Vector3 } from 'three';
import { getMapConfig } from './maps/index.ts';
import { buildHorizonRing } from './maps/horizon.ts';
import { HORIZON_STAND_HANDOVER_M, horizonStandReach } from './horizonRelief.ts';
import { createHeightField } from './terrain.ts';

// 1. the metric: a side's middle as before, a corner's diagonal by its distance past the edge
assert.equal(horizonStandReach(0, 700), 700, 'a side\'s middle: the radius');
assert.equal(horizonStandReach(-650, -650), 650, 'a corner\'s diagonal: 138 m past both edges');
assert.ok(Math.hypot(-650, -650) > HORIZON_STAND_HANDOVER_M[1] && horizonStandReach(-650, -650) < HORIZON_STAND_HANDOVER_M[0],
  'the corner point the radius handed to the ranges\' stands stays the border\'s');

// 2. the glades: Verdant's near-band woods with and without them (the same field otherwise)
const cfg = getMapConfig('verdant');
const withGlades = createHeightField(1337, cfg);
const noGlades = createHeightField(1337, { ...cfg, terrain: { ...(cfg.terrain ?? {}), border: { ...(cfg.terrain?.border ?? {}), glades: 0 } } });
const share = (hf, lo, hi) => {
  let n = 0, wooded = 0;
  for (let k = 0; k < 4000; k++) {
    const t = (k / 4000) * 4, side = Math.floor(t), f = t - side;
    for (let d = lo; d < hi; d += 9) {
      const along = -512 - d + f * (1024 + 2 * d), out = 512 + d;
      const x = side === 0 ? along : side === 1 ? out : side === 2 ? -along : -out;
      const z = side === 0 ? out : side === 1 ? -along : side === 2 ? -out : along;
      n++; if (hf.getBorderWoodsAt(x, z) > 0.5) wooded++;
    }
  }
  return wooded / n;
};
const near0 = share(noGlades, 70, 300), near1 = share(withGlades, 70, 300);
assert.ok(near1 < near0 * 0.92 && near1 > near0 * 0.45, `the near band's woods open into copses (${(near0 * 100).toFixed(1)} % → ${(near1 * 100).toFixed(1)} %)`);
for (const [lo, hi] of [[0, 25], [480, 700]]) {
  assert.equal(share(withGlades, lo, hi), share(noGlades, lo, hi), `no glade within 25 m of the edge nor past 470 m (${lo}-${hi} m)`);
}

// 3. the woods' edges in Verdant's ring forest
const previousDocument = globalThis.document;
globalThis.document = { createElement() {
  const canvas = { width: 0, height: 0, getContext() { return {
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData(image) { canvas.pixels = image.data; }, clearRect() {}, save() {}, restore() {}, beginPath() {}, closePath() {},
    rect() {}, clip() {}, moveTo() {}, lineTo() {}, fill() {}, createLinearGradient: () => ({ addColorStop() {} }),
  }; } };
  return canvas;
} };
try {
  const mesh = buildHorizonRing(null, cfg, 1337, withGlades);
  const forest = mesh.getObjectByName('horizon-forest');
  const record = forest.userData.horizonForest;
  const woodsAt = withGlades.getBorderWoodsAt;
  const standAt = mesh.userData.horizonRing.standAt;
  // (1, on the built ring) the corners' stands are the border's woods out to the hand-over's reach
  let cornerPts = 0, cornerSame = 0;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    for (let d = 30; d <= 190; d += 4) for (let w = -60; w <= 60; w += 6) {
      const x = sx * (512 + d) + w, z = sz * (512 + d) - w;
      if (horizonStandReach(x, z) >= HORIZON_STAND_HANDOVER_M[0] - 10) continue;
      cornerPts++;
      if (Math.abs(standAt(x, z) - woodsAt(x, z)) < 0.2) cornerSame++;
    }
  }
  assert.ok(cornerSame / cornerPts > 0.9, `the corners' stands are the border's woods (${cornerSame} of ${cornerPts})`);
  // the edge trees: the band's trees in the woods, by their depth toward the square (the law's own probes)
  const stride = 10, packed = record.placements;
  const edge = [], core = [];
  for (let o = 0; o < packed.length; o += stride) {
    if (packed[o + 9] < 1) continue; // (the band and near classes: the range and face classes share detail 0)
    const x = packed[o], z = packed[o + 2], s = packed[o + 3];
    const edgeOut = Math.max(Math.abs(x), Math.abs(z)) - 512;
    if (edgeOut <= 0 || edgeOut >= 470 || woodsAt(x, z) < 0.5) continue;
    let ux = Math.max(-512, Math.min(512, x)) - x, uz = Math.max(-512, Math.min(512, z)) - z;
    const l = Math.hypot(ux, uz); ux /= l; uz /= l;
    let depth = 32, prev = 0;
    for (const probe of [7, 16, 28]) { if (woodsAt(x + ux * probe, z + uz * probe) < 0.5) { depth = (prev + probe) / 2; break; } prev = probe; }
    if (depth <= 3.5) edge.push(s); else if (depth >= 32) core.push(s);
  }
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(edge.length > 100 && core.length > 300, `the band's woods have edges and interiors (${edge.length} edge trees, ${core.length} interior)`);
  assert.ok(mean(edge) < mean(core) * 0.8, `the trees at a wood's edge stand lower than its interior's (${mean(edge).toFixed(2)} against ${mean(core).toFixed(2)})`);
  // (a band tree's stature roll is 0.9-1.45 and a wood's 0.82-1.18: past their product only an emergent stands)
  const canopyTop = 1.45 * 1.18;
  const emergents = core.filter((s) => s > canopyTop * 1.005).length;
  assert.ok(emergents >= 3 && emergents < core.length * 0.07, `emergents stand over the canopy (${emergents} of ${core.length} interior trees past the canopy's tallest, ${canopyTop.toFixed(2)})`);
  // the mantle: bush lines along the edges, within its reach, each point by a wood's edge
  const lines = forest.userData.horizonForestMantle;
  assert.ok(record.mantle && record.mantle.lines === lines.length && lines.length >= 10 && record.mantle.metres > 300,
    `the woods' edges carry a mantle (${lines.length} lines, ${record.mantle?.metres} m)`);
  // (the ring forest's woods: the border's to the hand-over's reach, the bake's stands past it — maps/horizon.ts)
  const forestWoodsAt = (x, z) => (horizonStandReach(x, z) > HORIZON_STAND_HANDOVER_M[0] ? standAt(x, z) : woodsAt(x, z));
  let points = 0, byEdge = 0;
  for (const line of lines) {
    assert.ok(line.heightK > 1 && line.girthK > 1 && line.xs.length === line.w.length, 'a mantle line: taller and broader bushes than a hedge\'s');
    for (let k = 0; k < line.xs.length; k++) {
      const x = line.xs[k], z = line.zs[k];
      assert.ok(Math.max(Math.abs(x), Math.abs(z)) - 512 < 430, 'the mantle stands within its reach');
      points++;
      let near = forestWoodsAt(x, z) > 0.5;
      for (let a = 0; a < 16 && !near; a++) {
        const ax = Math.cos(a * Math.PI / 8), az = Math.sin(a * Math.PI / 8);
        for (const d of [4, 8, 12]) if (forestWoodsAt(x + ax * d, z + az * d) > 0.5) near = true;
      }
      if (near) byEdge++;
    }
  }
  // (the forest's woods are the border's and the farmsteads' shelter copses: a copse's mantle stands off the border's woods)
  assert.ok(byEdge / points > 0.8, `the mantle's points stand by the woods (${byEdge} of ${points} within 12 m)`);
  const hedges = mesh.getObjectByName('border-hedgerows');
  assert.ok(hedges && hedges.geometry.index.count / 3 > 15000, 'the hedges and the mantle are drawn');
  console.log(`borderWoodsEdge.selftest: ok (near-band woods ${(near0 * 100).toFixed(1)} → ${(near1 * 100).toFixed(1)} %; corners ${cornerSame}/${cornerPts} the border's woods; edge trees ${mean(edge).toFixed(2)} against interior ${mean(core).toFixed(2)}, ${emergents} emergents; mantle ${lines.length} lines, ${record.mantle.metres} m, ${byEdge}/${points} points by the woods)`);
} finally {
  globalThis.document = previousDocument;
}
