// Trees perf (2026-10-07, the coordinator's step 0 — "cull the near pools to the view"): a near pool keeps its slots in
// two runs, the trees the main camera's view (or their shadows) can reach first; the main camera draws that run, every
// other camera the whole pool. On the real seeded Verdant producer, driven along a path that moves trees between the
// tiers, turns the camera about and puts the sun low behind it:
//   - every slot of every pool holds its own tree's data (matrix, tint, occlusion fade, cross-fade share) — whichever run
//     it is in, so a render that draws the whole pool never reads a stale slot;
//   - the run is conservative: every near tree whose bounding sphere, or whose shadow (the sphere swept away from the
//     sun until it lands), meets the camera's TRUE frustum stands in it;
//   - it culls: at a chase-like pose the pools draw well under two thirds of their trees;
//   - the main camera's draws take the run, any other camera's the whole pool, a frame without a camera every tree;
//   - a still camera re-culls nothing, a small turn neither, a turn or a move past the margins does;
//   - the near partition itself (which trees are near) is the uncull'd one's: culling only orders it;
//   - `?treeCull=0` keeps every near tree drawn.
// A construction receipt: no GPU, no frame-time claim (the timing is the cost rule's hold).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHeightField } from './terrain.ts';
import { createVegetation } from './vegetation.ts';
import { getMapConfig } from './maps/index.ts';
import { disposeObject3DResources } from '../engine/resourceLifetime.ts';

function canvasFixture() {
  const saved = new Map(['document', 'ImageData', 'location'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  class ImageData { constructor(data, width, height) {
    this.data = typeof data === 'number' ? new Uint8ClampedArray(data * width * 4) : data;
    this.width = typeof data === 'number' ? data : width;
    this.height = typeof data === 'number' ? width : height;
  } }
  globalThis.ImageData = ImageData;
  globalThis.document = { createElement() {
    const canvas = { width: 0, height: 0 };
    const context = new Proxy({
      createImageData: (w, h) => new ImageData(new Uint8ClampedArray(w * h * 4), w, h),
      getImageData: (_x, _y, w, h) => new ImageData(new Uint8ClampedArray(w * h * 4).fill(128), w, h),
      createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
    }, { get: (target, key) => target[key] ?? (() => {}) });
    canvas.getContext = () => context; return canvas;
  } };
  return () => { for (const [k, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k];
  } };
}

/** The near pools as the meshes hold them: each pool's meshes (found by the matrix its slot 0 holds) and its trees by slot. */
function nearPools(veg) {
  const byKey = new Map();
  for (const t of veg._trees) {
    if (t.slot < 0) continue;
    const key = `${t.species}_${t.variant}`;
    let pool = byKey.get(key);
    if (!pool) byKey.set(key, pool = { key, trees: [], meshes: [] });
    assert.equal(pool.trees[t.slot], undefined, `${key}: one tree a slot`);
    pool.trees[t.slot] = t;
  }
  const meshes = veg.group.children.filter((m) => m.isInstancedMesh && (m.userData.treeLod === 'near' || m.userData.treeCanopyShadowProxy));
  for (const pool of byKey.values()) {
    for (let i = 0; i < pool.trees.length; i++) assert.ok(pool.trees[i], `${pool.key}: slots 0..${pool.trees.length - 1} filled`);
    const e = pool.trees[0].mat.elements;
    pool.meshes = meshes.filter((m) => {
      const a = m.instanceMatrix.array;
      for (let k = 0; k < 16; k++) if (a[k] !== Math.fround(e[k])) return false;
      return true;
    });
    assert.ok(pool.meshes.length >= 2, `${pool.key}: its trunk and cards (and proxy) found (${pool.meshes.length})`);
  }
  return [...byKey.values()];
}

/** Every slot holds its own tree's data, the draw count is the run's, and the run's trees are exactly those below it. */
function auditSlots(pools, culling) {
  let near = 0, drawn = 0;
  for (const pool of pools) {
    const len = pool.trees.length;
    const counts = new Set(pool.meshes.map((m) => m.count));
    assert.equal(counts.size, 1, `${pool.key}: one count for the pool's meshes`);
    const count = pool.meshes[0].count;
    assert.ok(count >= 0 && count <= len, `${pool.key}: count ${count} within the pool's ${len}`);
    if (!culling) assert.equal(count, len, `${pool.key}: no cull, every tree drawn`);
    for (const m of pool.meshes) {
      assert.ok(m.visible === len > 0, `${pool.key}: visible while it holds trees`);
      const fade = m.geometry.getAttribute('aFadeI'), lodF = m.geometry.getAttribute('aLodF');
      for (let i = 0; i < len; i++) {
        const t = pool.trees[i], e = t.mat.elements, a = m.instanceMatrix.array;
        for (let k = 0; k < 16; k++) assert.equal(a[i * 16 + k], Math.fround(e[k]), `${pool.key} slot ${i}: its tree's matrix`);
        const c = m.instanceColor.array;
        assert.ok(c[i * 3] === Math.fround(t.tint.r) && c[i * 3 + 1] === Math.fround(t.tint.g) && c[i * 3 + 2] === Math.fround(t.tint.b), `${pool.key} slot ${i}: its tint`);
        assert.equal(fade.array[i], Math.fround(t.fade), `${pool.key} slot ${i}: its occlusion fade`);
        assert.equal(lodF.array[i], Math.fround(t.lodF || 0), `${pool.key} slot ${i}: its cross-fade share`);
      }
    }
    near += len; drawn += count;
  }
  return { near, drawn };
}

/** The pool's local bounding sphere (the union of its meshes'), independently of the producer's. */
function poolSphere(pool) {
  const s = new THREE.Sphere();
  for (const m of pool.meshes) {
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    if (s.isEmpty()) s.copy(m.geometry.boundingSphere); else s.union(m.geometry.boundingSphere);
  }
  return s;
}

/** Every tree the TRUE view meets — its sphere, or its shadow sampled along the sun's ray to the ground — is in the run. */
function auditConservative(pools, camera, sun) {
  camera.updateMatrixWorld();
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const L = sun.clone().normalize(), sinE = Math.max(0.035, L.y);
  const sphere = new THREE.Sphere(), scale = new THREE.Vector3();
  let inView = 0, shadowOnly = 0;
  for (const pool of pools) {
    const local = poolSphere(pool), count = pool.meshes[0].count;
    for (let i = 0; i < pool.trees.length; i++) {
      const t = pool.trees[i];
      sphere.center.copy(local.center).applyMatrix4(t.mat);
      scale.setFromMatrixScale(t.mat);
      sphere.radius = local.radius * Math.max(scale.x, scale.y, scale.z);
      let meets = frustum.intersectsSphere(sphere);
      if (meets) inView++;
      else {
        // the shadow: the sphere's top falls to the base's height along -L
        const length = (sphere.center.y + sphere.radius - t.mat.elements[13]) / sinE;
        const c0 = sphere.center.clone();
        for (let s = 1; s <= 24 && !meets; s++) {
          sphere.center.copy(c0).addScaledVector(L, -length * s / 24);
          meets = frustum.intersectsSphere(sphere);
        }
        if (meets) shadowOnly++;
      }
      if (meets) assert.ok(i < count, `${pool.key}: tree ${i} meets the view (or casts into it) but stands past the run (${count})`);
    }
  }
  return { inView, shadowOnly };
}

function aim(camera, x, y, z, tx, ty, tz) {
  camera.position.set(x, y, z);
  camera.lookAt(tx, ty, tz);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
}

const restore = canvasFixture();
try {
  const cfg = getMapConfig('verdant'), field = createHeightField(1337, cfg);
  const sun = new THREE.Vector3(0.45, 0.62, 0.3).normalize();
  const engineCtx = { setupShadowMaterial() {}, scene: { userData: { sunDirWorld: sun } } };
  globalThis.location = { search: '' };
  const veg = createVegetation(field, engineCtx, 2001, cfg);
  globalThis.location = { search: '?treeCull=0' };
  const plain = createVegetation(field, { setupShadowMaterial() {}, scene: { userData: { sunDirWorld: sun } } }, 2001, cfg);
  globalThis.location = { search: '' };
  try {
    const spawn = field._layout?.spawns?.player ?? { x: 0, z: 0 };
    const ground = (x, z) => field.getHeightAt(x, z);
    const camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.3, 4000);
    const other = new THREE.PerspectiveCamera(52, 16 / 9, 0.3, 4000);
    const fwd = new THREE.Vector3();
    const step = (v, cam, dt = 1 / 60) => { cam.getWorldDirection(fwd); v.update(dt, cam.position, fwd, null, cam); };
    // the partition first builds without a camera (the warm): every near tree drawn
    aim(camera, spawn.x, ground(spawn.x, spawn.z) + 5, spawn.z, spawn.x + 40, ground(spawn.x, spawn.z) + 2, spawn.z + 10);
    for (let k = 0; k < 3; k++) { veg.update(0, camera.position, fwd, null); plain.update(0, camera.position, fwd, null); }
    let pools = nearPools(veg);
    let audit = auditSlots(pools, false);
    assert.ok(audit.near > 300, `the near tier holds a wooded view's trees (${audit.near})`);
    assert.deepEqual(veg._nearCull(), { on: false, passes: 0, moved: 0, near: audit.near, drawn: audit.near });

    // the main camera culls: a chase-like pose draws well under two thirds of the near trees, conservatively
    step(veg, camera, 0); step(plain, camera, 0);
    pools = nearPools(veg);
    audit = auditSlots(pools, true);
    let cull = veg._nearCull();
    assert.ok(cull.on && cull.passes === 1 && cull.drawn === audit.drawn && cull.near === audit.near, JSON.stringify(cull));
    assert.ok(audit.drawn < audit.near * 0.66, `the view culls (${audit.drawn} of ${audit.near} drawn)`);
    const seen = auditConservative(pools, camera, sun);
    assert.ok(seen.inView > 50, `the view holds trees (${JSON.stringify(seen)})`);
    const plainCull = plain._nearCull();
    assert.ok(!plainCull.on && plainCull.drawn === plainCull.near, '?treeCull=0 draws every near tree');
    console.log(JSON.stringify({ pose: 'spawn', ...cull, seen }));

    // the main camera's draws take the run; any other camera's the whole pool
    for (const pool of pools) {
      const m = pool.meshes.find((x) => typeof x.onBeforeRender === 'function' && !x.userData.treeCanopyShadowProxy);
      const run = m.count;
      m.onBeforeRender(null, null, other, m.geometry, m.material, null);
      assert.equal(m.count, pool.trees.length, `${pool.key}: another camera draws the whole pool`);
      m.onBeforeRender(null, null, camera, m.geometry, m.material, null);
      assert.equal(m.count, run, `${pool.key}: the culling camera draws its run`);
    }

    // a still camera, and a turn inside the margin, re-cull nothing; a turn past it does
    step(veg, camera); step(veg, camera);
    assert.equal(veg._nearCull().passes, 1, 'a still camera re-culls nothing');
    camera.rotateY(THREE.MathUtils.degToRad(2)); camera.updateMatrixWorld();
    step(veg, camera);
    assert.equal(veg._nearCull().passes, 1, 'a 2° turn stays inside the margin');
    auditConservative(nearPools(veg), camera, sun);
    camera.rotateY(THREE.MathUtils.degToRad(178)); camera.updateMatrixWorld();
    step(veg, camera);
    cull = veg._nearCull();
    assert.equal(cull.passes, 2, 'a half turn re-culls');
    assert.ok(cull.moved > 0, 'trees changed runs');
    pools = nearPools(veg);
    auditSlots(pools, true);
    auditConservative(pools, camera, sun);

    // the sun low behind the camera: the trees behind whose shadows reach forward stay in the run
    camera.getWorldDirection(fwd);
    sun.set(-fwd.x, 0.21, -fwd.z).normalize(); // ~12° elevation, straight behind
    step(veg, camera);
    pools = nearPools(veg);
    auditSlots(pools, true);
    const behind = auditConservative(pools, camera, sun);
    assert.ok(behind.shadowOnly > 0, `trees outside the view cast into it and are kept (${JSON.stringify(behind)})`);
    console.log(JSON.stringify({ pose: 'sun-behind', ...veg._nearCull(), seen: behind }));
    sun.set(0.45, 0.62, 0.3).normalize();

    // a drive: trees cross between the tiers while the camera culls; the slots stay exact, the runs conservative, and
    // the near partition is the uncull'd one's
    const path = [[120, 0], [260, 60], [300, 240], [120, 300], [-80, 220], [-160, 40]];
    for (const [ox, oz] of path) {
      for (let s = 0; s < 8; s++) {
        const x = spawn.x + ox + s * 6, z = spawn.z + oz + s * 3, y = ground(x, z) + 6;
        aim(camera, x, y, z, x + 30 * Math.cos(ox + s * 0.4), ground(x, z) + 3, z + 30 * Math.sin(oz + s * 0.4));
        step(veg, camera, 1 / 30);
        step(plain, camera, 1 / 30);
      }
      pools = nearPools(veg);
      auditSlots(pools, true);
      auditConservative(pools, camera, sun);
      const ids = (v) => v._trees.map((t, i) => (t.slot >= 0 ? `${i}:${t.species}_${t.variant}` : null)).filter(Boolean).sort();
      assert.deepEqual(ids(veg), ids(plain), 'culling orders the near partition, never changes it');
    }
    cull = veg._nearCull();
    console.log(JSON.stringify({ pose: 'drive', ...cull }));

    // a felled tree draws from the next update wherever it stands (its fall may swing it into the view)
    {
      pools = nearPools(veg);
      const culled = pools.flatMap((pool) => pool.trees.slice(pool.meshes[0].count));
      const ob = veg.treeObstacles.find((o) => !o.crushed && culled.includes(veg._trees[o.treeIdx]));
      assert.ok(ob, 'a culled near tree with a trunk to fell');
      const tree = veg._trees[ob.treeIdx];
      assert.ok(veg.crushTree(ob, 1, 0, true), 'the tree falls');
      step(veg, camera);
      pools = nearPools(veg);
      const pool = pools.find((p) => p.trees.includes(tree));
      assert.ok(tree.slot < pool.meshes[0].count, 'the felled tree joined the drawn run');
      auditSlots(pools, true);
      veg.resetToppled();
      step(veg, camera);
      auditSlots(nearPools(veg), true);
    }

    // a frame without a camera (the Studio, the warm): every near tree drawn again
    veg.update(1 / 60, camera.position, fwd, null);
    cull = veg._nearCull();
    assert.ok(!cull.on && cull.drawn === cull.near, 'no camera, no cull');
    auditSlots(nearPools(veg), false);
  } finally {
    for (const v of [veg, plain]) { v.dispose(); disposeObject3DResources(v.group); }
  }
} finally { restore(); }
console.log('treeViewCull.selftest: the near pools cull to the main camera\'s view and their shadows\' reach, exact slots, conservative runs, the partition unchanged PASS');
