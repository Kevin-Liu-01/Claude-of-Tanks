// shadowCasterCells.selftest.mjs — the cascade caster proxies' cell culling (2026-10-13, the perf stream): a settled
// owner's instances are bucketed into world cells, and a recompaction classifies whole cells against the cascade's
// frustum before it tests any instance. Every proxy must hold exactly the bytes the per-instance test put there (the
// same instances, in owner order), across moving cascades, an instance rewrite and an owner rewritten every frame
// (which never buckets). Executes the production block as shadowGeometryClaims.selftest.mjs does.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { markShadowOnly } from './renderLayers.ts';

const source = readFileSync(new URL('./shadowCasterProxies.ts', import.meta.url), 'utf8');
const start = source.indexOf('const SHADOW_CULL_MIN_TRIS =');
const end = source.indexOf('// --- end of the r8 caster-proxy block', start);
const actual = stripTypeScriptTypes(source.slice(start, end), { mode: 'strip' });
const shadows = new Function('THREE', 'markShadowOnly', `${actual}\nreturn {
  register: registerCasterCascades, build: buildCasterRecord, update: updateCasterProxies,
  CELL_M: CASTER_CELL_M, SETTLE: CASTER_CELL_SETTLE,
};`)(THREE, markShadowOnly);

let seed = 4211;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

function makeCascade(half) {
  const light = new THREE.DirectionalLight();
  const cam = light.shadow.camera;
  cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half; cam.near = 0.5; cam.far = 1600;
  cam.updateProjectionMatrix();
  return light;
}
const lights = [makeCascade(40), makeCascade(140), makeCascade(420), makeCascade(5000)];
shadows.register(lights);

// a heavy owner: 5,000 trees over 1.1 km with varied scale and height, and an instanced stream travelling with them
const N = 5000;
const geometry = new THREE.BoxGeometry(2, 9, 2);
const tag = new Float32Array(N);
for (let i = 0; i < N; i++) tag[i] = i;
geometry.setAttribute('instanceTag', new THREE.InstancedBufferAttribute(tag, 1));
const owner = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), N);
const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
const place = () => {
  for (let i = 0; i < N; i++) {
    const k = 0.6 + rand() * 1.4;
    m.compose(p.set((rand() - 0.5) * 1100, (rand() - 0.5) * 40, (rand() - 0.5) * 1100),
      q.setFromAxisAngle(s.set(0, 1, 0), rand() * 6.28), s.set(k, k * (0.8 + rand() * 0.6), k));
    owner.setMatrixAt(i, m);
  }
  owner.instanceMatrix.needsUpdate = true;
};
place();
const world = new THREE.Group();
world.add(owner);
owner.updateMatrixWorld(true);
const rec = shadows.build(owner);
assert.ok(rec, 'the heavy owner gets proxies');

// the reference: THREE.Frustum.intersectsSphere over every instance, in owner order (the compaction before the cells)
const bs = geometry.boundingSphere ?? (geometry.computeBoundingSphere(), geometry.boundingSphere);
function reference(frustum) {
  const out = [];
  const mm = new THREE.Matrix4(), c = new THREE.Vector3(), sphere = new THREE.Sphere();
  for (let i = 0; i < N; i++) {
    mm.fromArray(owner.instanceMatrix.array, i * 16).premultiply(owner.matrixWorld);
    c.copy(bs.center).applyMatrix4(mm);
    sphere.center.set(Math.fround(c.x), Math.fround(c.y), Math.fround(c.z));
    sphere.radius = Math.fround(bs.radius * mm.getMaxScaleOnAxis() + 4.0);
    if (frustum.intersectsSphere(sphere)) out.push(i);
  }
  return out;
}
let cellFrames = 0, partialOnly = 0;
function frame(f) {
  // the cascades follow a driving camera: each light sits up-sun of a point on the route, looking at it
  const a = f * 0.013;
  const fx = Math.cos(a) * 300 + rand() * 4, fz = Math.sin(a * 1.7) * 300 + rand() * 4;
  for (const light of lights) {
    light.target.position.set(fx, 0, fz);
    light.position.set(fx + 120, 260, fz + 60 + (f % 7));
    light.updateMatrixWorld(); light.target.updateMatrixWorld();
    light.shadow.needsUpdate = true; // every cascade redraws this frame (lighting.ts schedules them so)
  }
  shadows.update(lights, world, false);
  for (let c = 0; c < 3; c++) {
    const want = reference(lights[c].shadow.getFrustum());
    assert.equal(rec.counts[c], want.length, `frame ${f} cascade ${c}: the per-instance count`);
    const got = Array.from(rec.proxies[c].geometry.getAttribute('instanceTag').array.slice(0, want.length));
    assert.deepEqual(got, want, `frame ${f} cascade ${c}: the same instances in owner order`);
    const mats = rec.proxies[c].instanceMatrix.array;
    for (let k = 0; k < want.length; k += 97) {
      for (let e = 0; e < 16; e++) assert.equal(mats[k * 16 + e], owner.instanceMatrix.array[want[k] * 16 + e]);
    }
  }
  if (rec.cellCount > 0) cellFrames++;
}
for (let f = 0; f < 60; f++) frame(f);
assert.ok(cellFrames >= 55, `the settled owner culls by cells (${cellFrames} of 60 frames)`);
const settledCells = rec.cellCount;
assert.ok(settledCells > 300 && settledCells <= Math.ceil(1100 / shadows.CELL_M + 1) ** 2, `${settledCells} cells of ${shadows.CELL_M} m`);
// an instance rewrite drops the cells until the instances hold still again, and the proxies follow the new places
place();
for (let f = 60; f < 70; f++) frame(f);
assert.ok(rec.cellCount > 0, 'rebucketed after the rewrite settled');
// an owner rewritten every frame keeps the plain per-instance test (no bucketing churn)
for (let f = 70; f < 80; f++) {
  owner.instanceMatrix.needsUpdate = true; // a version bump each frame, as a swaying or crushed stand would make
  frame(f);
  assert.equal(rec.cellCount, -1, `frame ${f}: a moving owner is not bucketed`);
  partialOnly++;
}
assert.equal(shadows.SETTLE, 3);

// a cascade that moves without changing which instances it holds keeps the proxy's bytes: no copy, no upload
{
  const versions = () => rec.proxies.map((proxy) => proxy.instanceMatrix.version);
  for (const light of lights) light.shadow.needsUpdate = true;
  shadows.update(lights, world, false);
  const before = versions();
  const counts = Array.from(rec.counts);
  for (const light of lights) { light.position.x += 1e-4; light.updateMatrixWorld(); light.shadow.needsUpdate = true; }
  shadows.update(lights, world, false);
  for (let c = 0; c < 3; c++) {
    const want = reference(lights[c].shadow.getFrustum());
    assert.equal(rec.counts[c], want.length);
    if (want.length === counts[c]) assert.equal(versions()[c], before[c], `cascade ${c}: the same instances are not re-uploaded`);
  }
  // priming always recompacts
  shadows.update(lights, world, true);
  assert.ok(versions().every((v, c) => v > before[c] || rec.counts[c] === 0), 'priming re-uploads every non-empty proxy');
}

// the cells' verdict is conservative: a cell straddling a plane by less than its radius tests its members
assert.match(source, /P\[p \* 5 \+ 4\] = Math\.max\(1, Math\.sqrt\(nrm\.x \* nrm\.x \+ nrm\.y \* nrm\.y \+ nrm\.z \* nrm\.z\)\);/);
assert.match(source, /if \(frustum\.intersectsSphere\(_cullSphere\)\) included\[j\] = 1;/);

console.log(`shadowCasterCells.selftest: 80 frames x 3 cascades, every proxy the per-instance test's bytes in owner order; ${settledCells} cells; a moving owner unbucketed`);
