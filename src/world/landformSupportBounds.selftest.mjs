// landformSupportBounds.selftest.mjs — the perf stream (2026-10-13): every height sample used to visit every landform of
// its map (up to 52); applyMacroTerrain now skips a form outside its support box (terrain.ts landformSupportBounds),
// where the form adds exactly zero, so the field is bit-for-bit the same.
// 1. On every map, every prepared landform has a box, and the form is exactly zero on a ring of points just outside it
//    and at random points beyond it, in both construction phases.
// 2. The box is not empty: each form with height is non-zero somewhere inside it.
// 3. The skip stands before the form's sample in applyMacroTerrain.
import assert from 'node:assert/strict';
import { createLayout, sampleLandformHeight } from './terrain.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';
import { terrainSourceText } from './terrainSourceText.mjs'; // (terrain.ts with roadSurfaceShader.ts's road chunks in place)

let forms = 0, unbounded = 0, outside = 0, inside = 0;
let seed = 2024;
const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
for (const mapId of MAP_IDS) {
  const layout = createLayout(getMapConfig(mapId), false);
  for (const form of layout.terrain.landforms) {
    forms++;
    const b = form._bounds;
    if (!b) { unbounded++; continue; }
    const [x0, x1, z0, z1] = b;
    assert.ok(x0 < form.x && form.x < x1 && z0 < form.z && form.z < z1, `${mapId}: the box holds its form's centre`);
    const points = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      points.push([x, z0 - 0.01], [x, z1 + 0.01], [x0 - 0.01, z], [x1 + 0.01, z]);
    }
    for (let i = 0; i < 64; i++) {
      const w = (x1 - x0) * 2, d = (z1 - z0) * 2;
      let x = x0 + (rand() * 2 - 0.5) * w, z = z0 + (rand() * 2 - 0.5) * d;
      if (x >= x0 && x <= x1 && z >= z0 && z <= z1) x = rand() < 0.5 ? x0 - 1 - rand() * w : x1 + 1 + rand() * w;
      points.push([x, z]);
    }
    for (const [x, z] of points) {
      for (const phase of ['legacy-support', 'authored-relief']) {
        const v = sampleLandformHeight(form, x, z, phase);
        // +0 or -0: either leaves the running height bit-for-bit as it was
        assert.ok(v === 0, `${mapId} ${form.kind ?? 'knoll'} at (${x.toFixed(2)}, ${z.toFixed(2)}) outside its box gives ${v}`);
        outside++;
      }
    }
    if (form.height) {
      let found = false;
      for (let i = 0; i < 400 && !found; i++) {
        const x = form.x + (rand() - 0.5) * (x1 - x0) * 0.6, z = form.z + (rand() - 0.5) * (z1 - z0) * 0.6;
        found = sampleLandformHeight(form, x, z, 'authored-relief') !== 0;
      }
      assert.ok(found, `${mapId}: a ${form.kind ?? 'knoll'} with height is non-zero inside its box`);
      inside++;
    }
  }
}
assert.equal(unbounded, 0, 'every landform on every map is bounded today (an authored relief or an inverted gorge wall would not be)');

const source = terrainSourceText();
const macro = source.slice(source.indexOf('  function applyMacroTerrain('), source.indexOf('  function applyHeightConstraints('));
const skipAt = macro.indexOf('if (bounds && (x < bounds[0] || x > bounds[1] || z < bounds[2] || z > bounds[3])) continue;');
assert.ok(skipAt > 0 && skipAt < macro.indexOf('sampleLandformHeight(form, x, z, landformPhase)'), 'the skip stands before the sample');

console.log(`landformSupportBounds.selftest: ${forms} landforms on ${MAP_IDS.length} maps bounded; ${outside} samples outside their boxes all exactly zero; ${inside} boxes hold their form`);
