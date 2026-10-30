// (battle-spikes-253, the draw-count plan's step 3; the vehicles lane's conditions) The near hulls' merged shadow
// casters (nearVehicleShadowMerge.ts, through nearVehicleShadowDetail.ts's policy). Held here:
// - what merges: only real opaque casters (no cut-out, transparent, instanced, skinned, morphed, runtime-written or
//   already-casting mesh, no field suit, lattice or slat panel);
// - a T-90M, a Leopard 2A7V and a SEPv3 battle build: fewer shadow draws, and per effective shadow side the same depth
//   triangles in the world (count, area, area-weighted centroid and normal) as the detail they cover;
// - the policy: one build a frame, the casters under their owners only while their cascade renders, a hull never cast
//   twice (merged and detail) in one cascade, a changed source falls back to the detail until the retry, the reduced
//   tier and a disabled merge cast mesh by mesh, a removed or long-unselected hull gives its set back;
// - the wiring: the live battle frame alone turns it on.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { installCanvasFixture } from '../vehicles/canvasFixture.test-support.mjs';

const restoreCanvas = installCanvasFixture();
const { createTank, ensureTankBuilder } = await import('../vehicles/fleetFactory.ts');
const { getSpec } = await import('../vehicles/specs.ts');
const { createTankState } = await import('../sim/movement.ts');
const { buildMergedHullCasters, mergeableShadowSource, attachMergedHullCasters, detachMergedHullCasters } = await import('./nearVehicleShadowMerge.ts');
const {
  NEAR_SHADOW_MERGE_HOLD_UPDATES, NEAR_SHADOW_MERGE_RETRY_UPDATES, createNearVehicleShadowPolicy, vehicleShadowDetailOf,
} = await import('./nearVehicleShadowDetail.ts');
const { SHADOW_ONLY_LAYER } = await import('./renderLayers.ts');

// ---- what merges
{
  const mesh = (material = new THREE.MeshStandardMaterial(), geometry = new THREE.BoxGeometry()) => {
    const m = new THREE.Mesh(geometry, material); new THREE.Group().add(m); return m;
  };
  assert.equal(mergeableShadowSource(mesh()), true, 'an opaque static mesh merges');
  const casting = mesh(); casting.castShadow = true;
  assert.equal(mergeableShadowSource(casting), false, 'one casting already keeps its own cast');
  assert.equal(mergeableShadowSource(mesh(new THREE.MeshStandardMaterial({ transparent: true }))), false, 'transparent');
  assert.equal(mergeableShadowSource(mesh(new THREE.MeshStandardMaterial({ alphaTest: 0.5 }))), false, 'cut out by alpha test');
  assert.equal(mergeableShadowSource(mesh(new THREE.MeshStandardMaterial({ alphaMap: new THREE.Texture() }))), false, 'an alpha map');
  const dynamic = mesh(); dynamic.geometry.getAttribute('position').setUsage(THREE.DynamicDrawUsage);
  assert.equal(mergeableShadowSource(dynamic), false, 'a buffer a runtime writes');
  const suit = mesh(); suit.userData.fieldSuit = true;
  assert.equal(mergeableShadowSource(suit), false, 'a field suit');
  const lattice = mesh(); lattice.name = 'hullOpenLattice';
  assert.equal(mergeableShadowSource(lattice), false, 'an open lattice');
  const instanced = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 2); new THREE.Group().add(instanced);
  assert.equal(mergeableShadowSource(instanced), false, 'instanced (the running gear)');
  const ranged = mesh(); ranged.geometry.setDrawRange(0, 6);
  assert.equal(mergeableShadowSource(ranged), false, 'a draw range');
  const depth = mesh(); depth.customDepthMaterial = new THREE.MeshDepthMaterial();
  assert.equal(mergeableShadowSource(depth), false, 'its own depth material');
}

/** Per effective shadow side: the world triangles a set of casters writes (count, area, centroid and normal sums). */
function depthSoup(meshes) {
  const out = new Map();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), cross = new THREE.Vector3();
  for (const mesh of meshes) {
    const g = mesh.geometry, p = g.getAttribute('position');
    const sign = mesh.matrixWorld.determinant() < 0 ? -1 : 1;
    const side = `${mesh.material.side}|${mesh.material.shadowSide ?? ''}`;
    const row = out.get(side) ?? { triangles: 0, area: 0, cx: 0, cy: 0, cz: 0, nx: 0, ny: 0, nz: 0 };
    const corners = g.index ? g.index.count : p.count;
    for (let t = 0; t < corners; t += 3) {
      const i0 = g.index ? g.index.getX(t) : t, i1 = g.index ? g.index.getX(t + 1) : t + 1, i2 = g.index ? g.index.getX(t + 2) : t + 2;
      a.fromBufferAttribute(p, i0).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(p, i1).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(p, i2).applyMatrix4(mesh.matrixWorld);
      cross.subVectors(b, a).cross(c.clone().sub(a)).multiplyScalar(sign / 2);
      const area = cross.length();
      row.triangles++; row.area += area;
      row.cx += area * (a.x + b.x + c.x) / 3; row.cy += area * (a.y + b.y + c.y) / 3; row.cz += area * (a.z + b.z + c.z) / 3;
      row.nx += cross.x; row.ny += cross.y; row.nz += cross.z;
    }
    out.set(side, row);
  }
  return out;
}
const close = (x, y, what) => assert.ok(Math.abs(x - y) <= 1e-5 * Math.max(1, Math.abs(x), Math.abs(y)), `${what}: ${x} vs ${y}`);
const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.5, 2000);
camera.position.set(0, 3, 0); camera.lookAt(0, 0, -100); camera.updateMatrixWorld();
const options = { camoSeed: 7, quality: 'ai', geometryQuality: 'high', batchStatic: true, battleDetailLod: true,
  eraVisualBindingReceipt: false, staticDrawMerge: 'dual' };
const ids = ['t90m', 'leo2a7v', 'm1a2_abrams_sepv3'];
const scene = new THREE.Scene();
const hulls = [];
const rows = [];
for (const [i, id] of ids.entries()) {
  await ensureTankBuilder(id);
  const visual = createTank(id, null, options);
  const state = createTankState(getSpec(id), new THREE.Vector3(i * 6 - 6, 0, -14 - i * 16), 0.4 * i);
  visual.syncFromState(state, 1 / 30, 14 + i * 16);
  visual.root.name = `tank_${id}`;
  scene.add(visual.root);
  scene.updateMatrixWorld(true);
  visual.root.traverse((o) => { if (o.isLOD) o.update(camera); });
  hulls.push({ id, visual, root: visual.root });
}

// ---- each build: the merged casters write the same depth triangles as the detail they cover, in fewer draws
for (const { id, root } of hulls) {
  const detail = vehicleShadowDetailOf(root);
  const set = buildMergedHullCasters(root, detail.detail);
  assert.ok(set && set.casters.length > 0, `${id}: merged casters built`);
  const covered = [...set.covered];
  assert.ok(set.casters.length < covered.length, `${id}: fewer draws (${covered.length} -> ${set.casters.length})`);
  for (const caster of set.casters) {
    assert.equal(caster.layers.mask, 1 << SHADOW_ONLY_LAYER, `${id}: a caster on the shadow-only layer`);
    assert.equal(caster.material.colorWrite, false);
    assert.ok(caster.parent === null, `${id}: built detached`);
  }
  attachMergedHullCasters(set);
  set.casters.forEach((caster, k) => assert.ok(caster.parent === set.owners[k], `${id}: caster ${k} under its owner`));
  const before = depthSoup(covered);
  const after = depthSoup(set.casters);
  assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), `${id}: the same shadow sides`);
  for (const [side, row] of before) {
    const merged = after.get(side);
    assert.equal(merged.triangles, row.triangles, `${id} side ${side}: every triangle`);
    for (const key of ['area', 'cx', 'cy', 'cz', 'nx', 'ny', 'nz']) close(merged[key], row[key], `${id} side ${side} ${key}`);
  }
  // the owners: the hull, turret, gun mount and recoil as the detail's own parents (a LOD wrapper skipped)
  for (const mesh of covered) {
    let owner = mesh.parent; while (owner.isLOD) owner = owner.parent;
    assert.ok(set.owners.includes(owner), `${id}: ${mesh.name} cast under its own owner ${owner.name}`);
  }
  detachMergedHullCasters(set);
  assert.ok(set.casters.every((caster) => caster.parent === null), `${id}: detached after its cascade`);
  for (const caster of set.casters) caster.geometry.dispose();
  const unique = new Set(detail.detail).size;
  rows.push(`${id} ${unique} -> ${unique - covered.length + set.casters.length} shadow draws a cascade`);
}

// ---- the policy: a build a frame, attached only while its cascade renders, never a hull cast twice
let merge = true, reduced = false;
const ranges = [{ near: 0.5, far: 25 }, { near: 25, far: 70 }, { near: 70, far: 200 }, { near: 200, far: 700 }];
const policy = createNearVehicleShadowPolicy({ camera, scene, cascadeRanges: () => ranges, enabled: () => true, max: () => 6,
  reduced: () => reduced, merge: () => merge });
policy.update();
assert.equal(policy.selected.length, 3, 'the three hulls selected');
assert.equal([...policy.merged.values()].filter(Boolean).length, 1, 'one build a frame');
policy.update(); policy.update();
assert.equal([...policy.merged.values()].filter(Boolean).length, 3, 'all three by the third');
/** Every object a cascade would draw for the near hulls: castShadow, shown, on the default or shadow-only layer. */
const casting = (root) => {
  const out = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.castShadow || !(o.layers.isEnabled(0) || o.layers.isEnabled(SHADOW_ONLY_LAYER))) return;
    for (let n = o; n; n = n.parent) if (!n.visible) return;
    out.push(o);
  });
  return out;
};
const light = new THREE.DirectionalLight();
for (let cascade = 0; cascade < ranges.length; cascade++) {
  policy.beforeLight(light, cascade);
  for (const entry of policy.selected) {
    const set = policy.merged.get(entry.root);
    const drawn = casting(entry.root);
    if (!(entry.cascadeMask & (1 << cascade))) {
      assert.ok(!set || set.casters.every((caster) => caster.parent === null), `${entry.root.name}: no merged caster outside its cascades`);
      continue;
    }
    assert.ok(set.casters.every((caster) => caster.parent && drawn.includes(caster)), `${entry.root.name} c${cascade}: its merged casters cast`);
    assert.equal(drawn.filter((o) => set.covered.has(o)).length, 0, `${entry.root.name} c${cascade}: never a covered mesh beside its merged caster`);
    const detail = vehicleShadowDetailOf(entry.root).detail;
    const shown = (o) => { for (let n = o; n && n !== entry.root; n = n.parent) if (!n.visible) return false; return true; };
    assert.ok(detail.filter((o) => !set.covered.has(o) && shown(o)).every((o) => drawn.includes(o)),
      `${entry.root.name} c${cascade}: the detail it does not cover still casts`);
  }
  policy.afterLight(light, cascade);
  for (const set of policy.merged.values()) assert.ok(!set || set.casters.every((caster) => caster.parent === null), 'detached after the cascade');
}
// a changed source: the hull casts its detail mesh by mesh until the retry, then merges again
{
  const entry = policy.selected[0];
  const set = policy.merged.get(entry.root);
  const source = [...set.covered][0];
  source.geometry.getAttribute('position').needsUpdate = true;
  policy.update();
  assert.equal(policy.merged.get(entry.root), undefined, 'a changed source drops the set');
  assert.ok(set.casters.every((caster) => caster.parent === null), 'and detaches it');
  const cascade = Math.log2(entry.cascadeMask & -entry.cascadeMask);
  policy.beforeLight(light, cascade);
  assert.ok(casting(entry.root).includes(source), 'its detail casts mesh by mesh meanwhile');
  assert.ok(!casting(entry.root).some((o) => o.userData.nearHullMergedCaster), 'and no merged caster');
  policy.afterLight(light, cascade);
  for (let k = 0; k < NEAR_SHADOW_MERGE_RETRY_UPDATES; k++) policy.update();
  assert.ok(policy.merged.get(entry.root), 'rebuilt after the retry');
}
// the reduced tier casts mesh by mesh; a disabled merge gives every set back
{
  reduced = true;
  policy.update();
  policy.beforeLight(light, 0);
  for (const entry of policy.selected) assert.ok(!casting(entry.root).some((o) => o.userData.nearHullMergedCaster), 'reduced: no merged caster');
  policy.afterLight(light, 0);
  reduced = false;
  merge = false;
  const sets = [...policy.merged.values()].filter(Boolean);
  policy.update();
  assert.equal(policy.merged.size, 0, 'merge off: no set held');
  assert.ok(sets.every((set) => set.casters.every((caster) => caster.parent === null)), 'every caster detached');
  merge = true;
  for (let k = 0; k < 3; k++) policy.update();
  assert.equal([...policy.merged.values()].filter(Boolean).length, 3);
}
// a removed hull gives its set back; one long out of the selection too
{
  const gone = hulls[2].root;
  scene.remove(gone);
  policy.update();
  assert.ok(!policy.merged.has(gone), 'a removed hull: its set given back');
  const away = hulls[1].root;
  away.visible = false; // (out of the selection)
  for (let k = 0; k <= NEAR_SHADOW_MERGE_HOLD_UPDATES; k++) policy.update();
  assert.ok(!policy.merged.has(away), 'out of the selection past the hold: given back');
  assert.ok(policy.merged.get(hulls[0].root), 'the selected hull keeps its set');
  away.visible = true;
}
// ---- the wiring: the live battle frame alone
{
  const lighting = readFileSync(new URL('./lighting.ts', import.meta.url), 'utf8');
  assert.match(lighting, /merge: \(\) => vehicleShadowMerge && !\(typeof window !== 'undefined' && window\.__SHADOW_DEBUG\?\.noVehicleMerge\),/);
  assert.match(lighting, /setVehicleShadowMerge\(on: boolean\): void \{\n\s+vehicleShadowMerge = on;/);
  const frame = readFileSync(new URL('../app/mainFrameRuntime.ts', import.meta.url), 'utf8');
  assert.match(frame, /lighting\.setVehicleShadowMerge\(frame\.inBattle && !frame\.killcamActive\);/, 'a live battle frame, never the Garage or a killcam');
}
for (const { visual } of hulls) visual.dispose();
restoreCanvas();
console.log(`nearVehicleShadowMerge.selftest: ${rows.join('; ')}, per shadow side the same depth triangles; opaque casters only; `
  + 'a build a frame, attached only in their cascades, never a hull cast twice; a changed source falls back until the retry; '
  + 'reduced and disabled cast mesh by mesh; removed and long-unselected hulls give their sets back; the live battle frame alone PASS');
