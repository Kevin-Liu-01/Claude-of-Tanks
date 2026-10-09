// The face forest's reach (horizonVista.ts buildHorizonForest, the borders lane 2026-10-08; R023: "distant treelines
// across the full height of mountain faces in several irregular forest belts from lower to mid slopes"): on Nordhavn —
// a sea map whose opening holds the ring's column 0, where the rows stretch out to 4.3 km — the face trees stand on the
// stands at every height the stands reach, not on the lowest and densest alone: the share of the trees above half the
// treeline follows the share of the stand area there, and the trees spread over the whole annulus the stands cover.
import assert from 'node:assert/strict';
import { Matrix4, Vector3 } from 'three';
import { getMapConfig } from './maps/index.ts';
import { HORIZON_SEGMENTS, buildHorizonRing, sampleHorizonGeometry } from './maps/horizon.ts';
import { ringMeshSurfaceSampler } from './horizonSurface.ts';
import { HORIZON_FACE_FOREST_M } from './horizonVista.ts';
import { HORIZON_RELIEF_BAKE_R1 } from './horizonRelief.ts';
import { createHeightField } from './terrain.ts';

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
  const cfg = getMapConfig('fjord');
  // (with its height field: the square's water at the edge derives the openings that stretch column 0's rows)
  const ground = createHeightField(1337, cfg);
  const mesh = buildHorizonRing(null, cfg, 1337, ground);
  const standAt = mesh.userData.horizonRing.standAt;
  assert.equal(typeof standAt, 'function', 'Nordhavn bakes its stands');
  const maxH = sampleHorizonGeometry(cfg, 1337, ground).maxHeight;
  const half = Math.min(cfg.horizon.treeline, 1.2) * maxH * 0.5;
  // (the ring's column 0 lies in the sea opening: its rows reach far past the face reach while the others stand inside it)
  const pos = mesh.geometry.attributes.position.array, stride = HORIZON_SEGMENTS + 1, rows = mesh.geometry.attributes.position.count / stride;
  const c0 = Math.hypot(pos[(rows - 1) * stride * 3], pos[(rows - 1) * stride * 3 + 2]);
  assert.ok(c0 > HORIZON_RELIEF_BAKE_R1 * 1.5, `Nordhavn's column 0 runs out into the sea (${c0.toFixed(0)} m)`);
  // the stand area by height over the face annulus, on the drawn ring's surface
  const surf = ringMeshSurfaceSampler(mesh.geometry.attributes.position, HORIZON_SEGMENTS);
  let standLow = 0, standHigh = 0;
  for (let a = 0; a < 1440; a++) for (let r = HORIZON_FACE_FOREST_M[1]; r < HORIZON_RELIEF_BAKE_R1; r += 8) {
    const x = Math.cos(a * Math.PI / 720) * r, z = Math.sin(a * Math.PI / 720) * r;
    if (standAt(x, z) < 0.5) continue;
    const y = surf(x, z);
    if (!Number.isFinite(y)) continue;
    if (y > half) standHigh += r; else standLow += r; // (area ∝ r dr dθ)
  }
  const standShareHigh = standHigh / Math.max(1, standLow + standHigh);
  assert.ok(standShareHigh > 0.1, `Nordhavn's stands climb past half its treeline (${(standShareHigh * 100).toFixed(0)} % of their area)`);
  const forest = mesh.getObjectByName('horizon-forest');
  const m = new Matrix4(), v = new Vector3();
  let face = 0, high = 0, outer = 0;
  for (const child of forest.children) {
    if (!child.name.endsWith('-face')) continue;
    for (let i = 0; i < child.count; i++) {
      child.getMatrixAt(i, m); v.setFromMatrixPosition(m); face++;
      if (v.y + 0.4 > half) high++;
      if (Math.hypot(v.x, v.z) > 1150) outer++;
    }
  }
  const treeShareHigh = high / Math.max(1, face);
  assert.ok(face > 6000, `Nordhavn's faces carry their stands as trees (${face})`);
  assert.ok(treeShareHigh >= standShareHigh * 0.6,
    `the face trees climb with the stands: ${(treeShareHigh * 100).toFixed(0)} % above half the treeline against ${(standShareHigh * 100).toFixed(0)} % of the stand area`);
  assert.ok(outer > face * 0.15, `the face trees reach the outer faces past 1.15 km (${outer} of ${face})`);
  console.log(`horizonFaceForest.selftest: ok (Nordhavn ${face} face trees, ${(treeShareHigh * 100).toFixed(0)} % above half the treeline against ${(standShareHigh * 100).toFixed(0)} % of the stands, ${outer} past 1.15 km)`);
} finally {
  globalThis.document = previousDocument;
}
