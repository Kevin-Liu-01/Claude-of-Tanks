import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { createHeightField } from './terrain.ts';
import { createTerrainContactSampler } from './terrainContactSurface.ts';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
import { createStructureSupportField } from '../sim/structureSupport.ts';
import { createLiveHeightFieldProxy } from './liveHeightFieldProxy.ts';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.ts';

// Build the production mesh buffers and raycast their real indexed triangles;
// the oracle deliberately does not reimplement the contact interpolation.
const source = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
const chunks = source.slice(source.indexOf('const CHUNKS = 8'));
const api = new Function('THREE', stripTypeScriptTypes(`
  const MAP_SIZE = 1024, HALF = 512;
  ${chunks.replace(/^export /gm, '')}
`) + 'return { buildFineGridSteps, buildChunkGeometrySteps };')(THREE);
const drain = (steps) => { let r; do { r = steps.next(); } while (!r.done); return r.value; };
const ray = new THREE.Raycaster(), origin = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
const material = new THREE.MeshBasicMaterial();
let checked = 0, worstOldGap = 0, normalsChecked = 0;
for (const mapId of MAP_IDS) {
  const hf = createHeightField(1337, getMapConfig(mapId));
  // A rough flank and an interior chunk cover both triangle halves, roads,
  // dips and seams, including fractional vertices on either side of zero.
  for (const [cx, cz] of [[256, 384], [-128, -128]]) {
    const fine = drain(api.buildFineGridSteps(hf, cx, cz));
    const geometry = drain(api.buildChunkGeometrySteps(hf, cx, cz, 96, fine));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.updateMatrixWorld();
    for (let i = 0; i < 40; i++) {
      const x = cx + .13 + (i * 19.371) % 127.7;
      const z = cz + .21 + (i * 31.173) % 127.6;
      ray.set(origin.set(x, 300, z), down);
      const hit = ray.intersectObject(mesh, false)[0];
      assert.ok(hit, `${mapId}: terrain triangle present`);
      const contact = hf.getContactHeightAt(x, z);
      assert.ok(Math.abs(contact - hit.point.y) < 1e-5,
        `${mapId} ${x},${z}: visible mesh ${hit.point.y}, contact ${contact}`);
      worstOldGap = Math.max(worstOldGap, hf.getHeightAtFast(x, z) - hit.point.y);
      // (2026-10-08) the contact normal is the drawn triangle's own: the face the ray hit
      const n = hf.getContactNormalAt(x, z, { x: 0, y: 0, z: 0 }), f = hit.face.normal, up = f.y < 0 ? -1 : 1;
      assert.ok(Math.abs(Math.hypot(n.x, n.y, n.z) - 1) < 1e-9 && n.y > 0, `${mapId} ${x},${z}: a unit normal, up`);
      assert.ok((n.x * f.x + n.y * f.y + n.z * f.z) * up > 1 - 1e-6,
        `${mapId} ${x},${z}: visible face ${f.x},${f.y},${f.z}, contact normal ${n.x},${n.y},${n.z}`);
      normalsChecked++;
      checked++;
    }
    geometry.dispose();
  }
}
material.dispose();
assert.ok(worstOldGap > .05, 'fixtures reproduce the old visibly raised contact surface');
assert.equal(normalsChecked, checked, 'every sampled point checks its normal against the hit face');

let calls = 0;
const contact = createTerrainContactSampler((x, z) => { calls++; return .5 * x - .25 * z; });
for (const x of [-512, -384, -256, -128, 0, 128, 256, 384, 512]) {
  for (const delta of [-.00001, 0, .00001]) {
    const xx = Math.max(-512, Math.min(512, x + delta));
    assert.ok(Math.abs(contact(xx, x) - (.5 * xx - .25 * x)) < 1e-5, 'Float32 chunk seams stay continuous');
  }
}
{
  // the plane's own normal on both triangle halves, at every seam; straight up off the square
  const ex = -.5, ey = 1, ez = .25, el = Math.hypot(ex, ey, ez), out = { x: 0, y: 0, z: 0 };
  for (const [x, z] of [[10.1, 20.2], [10.9, 20.9], [-127.99, 0.4], [0.001, -0.001], [511.9, -511.9]]) {
    contact.normalAt(x, z, out);
    // (the vertices are Float32, as the mesh's: a slope within 1e-5)
    assert.ok(Math.abs(out.x - ex / el) < 1e-5 && Math.abs(out.y - ey / el) < 1e-5 && Math.abs(out.z - ez / el) < 1e-5,
      `the plane's normal at ${x},${z}: ${out.x},${out.y},${out.z}`);
  }
  contact.normalAt(600, 0, out);
  assert.deepEqual([out.x, out.y, out.z], [0, 1, 0], 'off the square: straight up');
}
contact(10.1, 20.2);
const before = calls;
for (let i = 0; i < 100; i++) contact(10.1, 20.2);
assert.equal(calls, before, 'hot contact reads never reevaluate procedural terrain');
assert.equal(contact(600, 0), 300, 'outland queries are not clamped to the boundary');

// Deliberately disagreeing surfaces catch a wrapper silently reverting to the
// old cache. Exercise the actual movement integrator and roof support too.
const spec = {
  enginePowerHp: 500, weightTons: 33, topSpeedKmh: 42, reverseSpeedKmh: 15,
  hullTraverseDegS: 36, turretTraverseDegS: 36, gunPitchDegS: 24,
  gunElevationDeg: 25, gunDepressionDeg: 10, pivotStyle: 'pivot',
  terrainResistance: { hard: 1, medium: 1.2, soft: 2.2 },
  dims: { hullLengthM: 6.27, overallLengthM: 7.52, widthM: 3, heightM: 2.97 },
  gun: { caliberMm: 76, baseAccuracy: .38, aimTimeS: 2.3,
    bloom: { move: .2, hullRot: .2, turret: .12, afterShot: 4 } },
};
const field = { size: 1024, minY: 0, maxY: 4, getHeightAt: () => 4,
  getHeightAtFast: () => 2, getContactHeightAt: () => 0,
  getGroundType: () => 'medium', getNormalAt: () => down, getWaterMaskAt: () => 0 };
const support = createStructureSupportField(field, {});
const proxy = createLiveHeightFieldProxy({ getWorld: () => ({ heightField: field }),
  useExactHeight: () => true, upNormal: down });
for (const sample of [field, support, proxy]) {
  const entity = { spec, state: createTankState(spec, new THREE.Vector3(0, 4, 0), 0),
    input: { throttle: 0, steer: 0, brake: false, aimPoint: null } };
  for (let i = 0; i < 300; i++) updateTank(entity, sample, SIM_DT);
  assert.ok(entity.state.grounded && entity.state.pos.y < .2, 'solo, authority and prediction land on the mesh');
}
const roof = createStructureSupportField(field, { getObstacles: () => [
  { min: [-10, 0, -10], max: [10, 3, 10] },
] });
roof.beginHull(0, 0, 3.2);
assert.equal(roof.getContactHeightAt(0, 0), 3, 'roof still overrides the terrain contact surface');
console.log(`terrainContactSurface.selftest: ${MAP_IDS.length} maps, ${checked} real mesh raycasts pass; old gap ${(worstOldGap * 100).toFixed(1)} cm`);
