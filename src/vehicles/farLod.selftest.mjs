// The far LOD (perf-255, farLod.ts): past FAR_LOD_ENTER_M of screen-equivalent distance a battle build draws its far
// hull (its visible static draws merged per owner and material, vertex-clustered) and its far running gear (one low
// cylinder a wheel), its detail parked on FAR_LOD_PARKED_LAYER and its gear's runtime at rest. Held here:
// - the clustering law: fewer triangles, the same extent within a cell, hard edges kept by normal direction, never across
//   a UV seam, the members' normals averaged;
// - a SEPv3 and a T-90M bot at 200 m: half the triangles or less, the gear two draws, the detail parked, the gear at rest;
// - back near, the build draws exactly what the identity build draws (the near law of the dual merge holds after a far
//   trip); never far with no distance (an inspection view), on a wreck, or after the Garage reset;
// - one build at a time (claimFarLodBuild), and a copied visual (cloneTankVisual) builds its own from its own objects;
// - a tank moving at the boundary under a jittering camera switches once each way and never inside the band;
// - (local-fps-265) the gear stage: from GEAR_LOD_ENTER_M (back under GEAR_LOD_RETURN_M) the wheel stations alone stand
//   in for the wheel layers, the hull, turret and gun keep their detail, the gear rests, and a vehicle that went far in one
//   step comes back to the gear stage with its wheels parked once.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';

const restoreCanvas = installCanvasFixture();
const { createTank, ensureTankBuilder } = await import('./fleetFactory.ts');
const { cloneTankVisual } = await import('./tankVisualClone.ts');
const { getSpec } = await import('./specs.ts');
const { createTankState } = await import('../sim/movement.ts');
const { FAR_LOD_ENTER_M, FAR_LOD_RETURN_M, FAR_LOD_PARKED_LAYER, GEAR_LOD_ENTER_M, GEAR_LOD_RETURN_M, claimFarLodBuild, clusterGeometry,
  noteFarLodBuild } = await import('./farLod.ts');
/** The full far LOD's own sign: its hull stand-ins show (the gear stand-in also shows in the gear stage). */
const farHullShown = (visual) => { let shown = false; visual.root.traverse((o) => { if (o.name === 'farLodHull' && o.visible) shown = true; }); return shown; };

// ---- the clustering law
{
  const box = new THREE.BoxGeometry(2, 1, 3, 20, 10, 30);
  const before = box.index.count / 3;
  const out = clusterGeometry(box, 0.25);
  assert.ok(out && out.index.count / 3 < before / 4, `fewer triangles (${before} -> ${out.index.count / 3})`);
  box.computeBoundingBox(); out.computeBoundingBox();
  assert.ok(out.boundingBox.min.distanceTo(box.boundingBox.min) <= 0.25 * Math.sqrt(3) + 1e-9
    && out.boundingBox.max.distanceTo(box.boundingBox.max) <= 0.25 * Math.sqrt(3) + 1e-9, 'the same extent within a cell');
  const normals = new Set();
  const n = out.getAttribute('normal');
  for (let i = 0; i < n.count; i++) normals.add(`${Math.round(n.getX(i))},${Math.round(n.getY(i))},${Math.round(n.getZ(i))}`);
  assert.equal(normals.size, 6, 'a box keeps its six face directions (hard edges stay hard)');
  assert.equal(clusterGeometry(new THREE.BoxGeometry(0.01, 0.01, 0.01).translate(0.5, 0.5, 0.5), 1), null, 'a part inside one cell is gone');
  // (perf-256) never across a UV seam: two triangles 1 cm apart, one normal, their UVs a tile apart (a box-mapped
  // barrel's projection change) keep their own UVs; the members' normals average
  const seam = new THREE.BufferGeometry();
  seam.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 0.01, 0, 0, 1.01, 0, 0, 0.01, 1, 0], 3));
  seam.translate(0.002, 0.002, 0); // (clear of the cell boundaries)
  seam.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0.1, 1, 0, 0.1, 1, 0, 0.1, 1, 0, -0.1, 1, 0, -0.1, 1, 0, -0.1, 1], 3));
  seam.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0.5, 0, 0, 0.5, 1, 1, 1.5, 1, 1, 1.5], 2));
  const split = clusterGeometry(seam, 0.05);
  const us = new Set();
  for (let i = 0; i < split.getAttribute('uv').count; i++) us.add(split.getAttribute('uv').getX(i));
  assert.ok(us.has(0) && us.has(1), 'the far side of a UV seam keeps its own UVs');
  const joined = clusterGeometry(seam.clone().deleteAttribute('uv'), 0.05);
  assert.equal(joined.getAttribute('position').count, 3, 'without UVs the two triangles share three vertices');
  assert.ok(Math.abs(joined.getAttribute('normal').getY(0)) < 1e-6, 'and their normals average');
}
// ---- one build at a time, spaced by its own cost
assert.equal(claimFarLodBuild(1e9), true);
noteFarLodBuild(1e9, 1e9 + 12);
assert.equal(claimFarLodBuild(1e9 + 20), false, 'the next waits as long as the last took');
assert.equal(claimFarLodBuild(1e9 + 25), true);
noteFarLodBuild(0, 0);

const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 4000);
/** The draws a camera on layer 0 would make (visible chain, the LOD level the distance picks), with what they draw. */
function drawn(visual, dist = 10) {
  visual.root.updateMatrixWorld(true);
  const out = [];
  let triangles = 0;
  const visit = (o) => {
    if (!o.visible) return;
    if (o.isLOD) { let pick = o.levels[0]; for (const l of o.levels) if (dist >= l.distance) pick = l; if (pick) visit(pick.object); return; }
    if ((o.isMesh) && o.layers.isEnabled(0)) {
      const g = o.geometry, digest = createHash('sha256');
      for (const name of Object.keys(g.attributes).sort()) digest.update(name).update(Buffer.from(g.attributes[name].array.buffer, g.attributes[name].array.byteOffset, g.attributes[name].array.byteLength));
      if (g.index) digest.update(Buffer.from(g.index.array.buffer, g.index.array.byteOffset, g.index.array.byteLength));
      const materials = Array.isArray(o.material) ? o.material : [o.material];
      out.push(`${o.name}|${digest.digest('hex').slice(0, 12)}|${o.matrixWorld.elements.map((v) => v.toFixed(5)).join(',')}|${materials.map((m) => m.name).join('+')}`);
      const per = (g.index ? g.index.count : g.attributes.position.count) / 3;
      triangles += o.isInstancedMesh ? per * o.count : per;
    }
    for (const c of o.children) visit(c);
  };
  visit(visual.root);
  return { draws: out, triangles };
}
const build = (id, mode) => createTank(id, null, { camoSeed: 7, quality: 'ai', geometryQuality: 'low', batchStatic: true,
  battleDetailLod: true, eraVisualBindingReceipt: false, staticDrawMerge: mode });
const settle = async (visual, state, dist, frames = 2) => {
  for (let i = 0; i < frames; i++) { visual.syncFromState(state, 1 / 30, dist); await new Promise((r) => setTimeout(r, 20)); }
};
/** Frames at `dist` until the far LOD is built, as a battle's frames ask: a build waits as long as the last one took
 * (claimFarLodBuild), so on a loaded machine one slow build holds the next past any fixed number of frames. */
const settleFar = async (visual, state, dist = 200) => {
  const until = performance.now() + 30_000;
  do await settle(visual, state, dist, 1); while (!visual.root.userData.farLod && performance.now() < until);
  return visual.root.userData.farLod;
};
const rows = [];
for (const id of ['m1a2_abrams_sepv3', 't90m']) {
  await ensureTankBuilder(id);
  const state = createTankState(getSpec(id), new THREE.Vector3(0, 0, 0), 0);
  const identity = build(id, 'identity'), dual = build(id, 'dual');
  await settle(identity, state, 200);
  const before = drawn(identity, 200);
  const info = await settleFar(dual, state);
  const far = drawn(dual, 200);
  assert.ok(info, `${id}: the far LOD was built at 200 m`);
  assert.equal(identity.root.userData.farLod, undefined, `${id}: an identity build has none`);
  assert.ok(far.triangles <= before.triangles * 0.5, `${id}: half the triangles or fewer at 200 m (${before.triangles} -> ${far.triangles})`);
  assert.ok(far.draws.length < before.draws.length, `${id}: fewer draws (${before.draws.length} -> ${far.draws.length})`);
  assert.equal(far.draws.filter((d) => d.startsWith('farLodRunningGear|')).length, 1, `${id}: the gear stands in as one mesh`);
  {
    // every far gear triangle faces the way its normals do (a front face from outside: treads, rings and dishes)
    const g = dual.root.getObjectByName('farLodRunningGear').geometry;
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), normal = new THREE.Vector3();
    let inward = 0;
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
      normal.fromBufferAttribute(n, i).add(c.clone().fromBufferAttribute(n, i + 1)).add(c.clone().fromBufferAttribute(n, i + 2));
      if (b.sub(a).cross(c.sub(a)).dot(normal) <= 0) inward++;
    }
    assert.equal(inward, 0, `${id}: the far gear's faces all wind outward`);
  }
  let parked = 0;
  dual.root.traverse((o) => { if (o.isMesh && o.layers.mask === 1 << FAR_LOD_PARKED_LAYER) parked++; });
  assert.ok(parked >= info.gearParked + info.hullSources, `${id}: the detail is parked (${parked})`);
  // the gear rests while far: the bands keep the pose they had (a moving state would deform them near)
  const band = dual.root.getObjectByName('gearTrackBandL');
  const bandVersion = band.geometry.getAttribute('position').version;
  const moving = createTankState(getSpec(id), new THREE.Vector3(0, 0, 0), 0);
  for (let i = 0; i < 6; i++) { moving.trackScroll.l += 0.3; moving.trackScroll.r += 0.3; dual.syncFromState(moving, 1 / 30, 200); }
  assert.equal(band.geometry.getAttribute('position').version, bandVersion, `${id}: the gear's runtime rests while far`);
  // the hysteresis, then back near: the identity build's draws exactly
  await settle(dual, state, FAR_LOD_RETURN_M + 1, 1);
  assert.ok(farHullShown(dual), `${id}: the far LOD holds above the return distance`);
  await settle(dual, state, FAR_LOD_RETURN_M - 1, 1);
  assert.ok(!farHullShown(dual), `${id}: and lets go under it`);
  // (local-fps-265) the gear stage under it: the wheel stations stand in for the wheel layers (parked), every other draw
  // is the identity build's, and the gear rests; it holds above GEAR_LOD_RETURN_M and lets go under it
  {
    const gear = dual.root.getObjectByName('farLodRunningGear');
    for (const dist of [FAR_LOD_RETURN_M - 1, 120, GEAR_LOD_RETURN_M + 1]) {
      await settle(dual, state, dist, 1);
      assert.ok(gear.visible && !farHullShown(dual), `${id}: the gear stage alone at ${dist} m`);
    }
    let wheelsParked = 0, otherParked = 0;
    dual.root.traverse((o) => {
      if (!o.isMesh || o.layers.mask !== 1 << FAR_LOD_PARKED_LAYER) return;
      if (/^gear(RoadWheel|ReturnRoller|EndWheel)/.test(o.name) || o.isInstancedMesh || o.isBatchedMesh) wheelsParked++; else otherParked++;
    });
    assert.ok(wheelsParked >= info.gearParked && otherParked === 0, `${id}: the wheel layers parked (${wheelsParked}), nothing else (${otherParked})`);
    // inside the band (85 m) beside a twin that came from near (its gear stage off): the same draws but for the wheel
    // layers and their stand-in
    const twin = build(id, 'dual');
    await settle(twin, state, 10); await settle(twin, state, 85);
    await settle(dual, state, 85);
    const wheelLayer = (d) => /^gear(RoadWheel|ReturnRoller|EndWheel)/.test(d);
    const gearDraws = drawn(dual, 85).draws, twinDraws = drawn(twin, 85).draws;
    assert.ok(gear.visible && !twin.root.getObjectByName('farLodRunningGear')?.visible, `${id}: in the band, the stage from far holds and the twin's from near does not`);
    assert.ok(gearDraws.every((d) => !wheelLayer(d)) && twinDraws.some(wheelLayer), `${id}: no wheel layer draws in the gear stage`);
    assert.deepEqual(gearDraws.filter((d) => !d.startsWith('farLodRunningGear|')), twinDraws.filter((d) => !wheelLayer(d)),
      `${id}: every other draw is the detail's own, to the byte`);
    twin.dispose();
    const bandVersion2 = band.geometry.getAttribute('position').version;
    for (let i = 0; i < 6; i++) { moving.trackScroll.l += 0.3; moving.trackScroll.r += 0.3; dual.syncFromState(moving, 1 / 30, 100); }
    assert.equal(band.geometry.getAttribute('position').version, bandVersion2, `${id}: the gear rests in the gear stage`);
    await settle(dual, state, GEAR_LOD_RETURN_M - 1, 1);
    assert.ok(!gear.visible, `${id}: the gear stage lets go under ${GEAR_LOD_RETURN_M} m`);
    // near to far in one step and back to the gear stage: the wheels parked once (no detailed wheel draws beside the
    // stand-in), then near again: the identity build
    await settle(dual, state, 10, 1); await settle(dual, state, 200, 1); await settle(dual, state, 120, 1);
    assert.ok(gear.visible && !farHullShown(dual), `${id}: from far to the gear stage in one step`);
    assert.ok(drawn(dual).draws.every((d) => !/^gear(RoadWheel|ReturnRoller|EndWheel)/.test(d)), `${id}: the wheels stay parked after a far trip`);
  }
  await settle(identity, state, 10); await settle(dual, state, 10);
  assert.deepEqual(drawn(dual).draws, drawn(identity).draws, `${id}: back near, the identity build's draws to the byte`);
  // never with no distance, never on a wreck, never after the Garage reset
  await settle(dual, state, undefined);
  assert.ok(!dual.root.getObjectByName('farLodRunningGear').visible, `${id}: no far LOD in an inspection view`);
  await settle(dual, state, 200);
  dual.setDestroyed({ ageS: 30 });
  await settle(dual, state, 200);
  assert.ok(!dual.root.getObjectByName('farLodRunningGear').visible, `${id}: no far LOD on a wreck`);
  dual.resetDestroyed();
  await settle(dual, state, 200);
  dual.resetForGaragePresentation();
  assert.ok(!dual.root.getObjectByName('farLodRunningGear').visible, `${id}: the Garage reset lets it go`);
  rows.push(`${id} ${before.draws.length} -> ${far.draws.length} draws, ${Math.round(before.triangles / 1000)}k -> ${Math.round(far.triangles / 1000)}k triangles`);
  identity.dispose(); dual.dispose();
}
// ---- prepared under the battle visual streamer's budget (prepareFarLod, before the vehicle has synced at range): the
// far LOD the range itself builds
{
  const id = 'm1a2_abrams_sepv3';
  const state = createTankState(getSpec(id), new THREE.Vector3(0, 0, 0), 0);
  const lazy = build(id, 'dual'), prepared = build(id, 'dual');
  await settle(prepared, state, 10);
  assert.equal(prepared.prepareFarLod(), true, 'prepared near');
  assert.equal(prepared.prepareFarLod(), false, 'once');
  assert.equal(build(id, 'identity').prepareFarLod(), false, 'an identity build has none to prepare');
  await settle(lazy, state, 10);
  assert.deepEqual(drawn(prepared).draws, drawn(lazy).draws, 'preparing changes nothing near');
  await settleFar(lazy, state); await settle(prepared, state, 200);
  const key = (d) => d.split('|').slice(0, 2).join('|');
  assert.deepEqual(drawn(prepared, 200).draws.map(key), drawn(lazy, 200).draws.map(key), 'the prepared far LOD is the one the range builds');
  // (250) prepared hidden, as an unspotted enemy is in the countdown warm (setVisible(false) hides its root): the same
  // far LOD, hull and gear (the vehicle's own visibility is not its far detail's)
  const hidden = build(id, 'dual');
  await settle(hidden, state, 10);
  hidden.setVisible(false);
  assert.equal(hidden.prepareFarLod(), true, 'prepared hidden');
  hidden.setVisible(true);
  assert.ok(hidden.root.userData.farLod.hullDraws > 0, `a vehicle prepared hidden has its far hull (${hidden.root.userData.farLod.hullDraws} draws)`);
  await settle(hidden, state, 200);
  assert.deepEqual(drawn(hidden, 200).draws.map(key), drawn(lazy, 200).draws.map(key), 'the far LOD prepared hidden is the one the range builds');
  hidden.dispose();
  lazy.dispose(); prepared.dispose();
}
// ---- a tank moving at the boundary (perf-256, the coordinator's flicker check): 60 Hz frames of screen-equivalent
// distance along a path, with a seeded ±2.5 m frame jitter (a chase camera's bob and recoil shake), switch only where
// the hysteresis says: out past FAR_LOD_ENTER_M once, back under FAR_LOD_RETURN_M once, never inside the band
{
  const id = 't90m';
  const state = createTankState(getSpec(id), new THREE.Vector3(0, 0, 0), 0);
  const visual = build(id, 'dual');
  await settle(visual, state, 10);
  assert.equal(visual.prepareFarLod(), true);
  const gear = { get visible() { return farHullShown(visual); } };
  let seed = 0x2f6e2b1;
  const jitter = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed / 2 ** 32 - 0.5) * 5; };
  /** Frames along `path(t)` (seconds), from a start state; the switches and the frames under the far LOD. */
  const drive = (startFar, seconds, path) => {
    visual.syncFromState(state, 1 / 60, startFar ? 200 : 10);
    assert.equal(gear.visible, startFar);
    let switches = 0, was = gear.visible;
    for (let frame = 1; frame <= seconds * 60; frame++) {
      visual.syncFromState(state, 1 / 60, path(frame / 60) + jitter());
      if (gear.visible !== was) { switches++; was = gear.visible; }
    }
    return switches;
  };
  // out from 150 m to 200 m at 8 m/s and back: one switch each way
  assert.equal(drive(false, 12.5, (t) => (t < 6.25 ? 150 + 8 * t : 200 - 8 * (t - 6.25))), 2, 'out and back: one switch each way');
  // weaving across the enter distance (171-189 m, 168.5-191.5 with the jitter) from near: on once, then held
  assert.equal(drive(false, 30, (t) => 180 + 9 * Math.sin(t * 1.3)), 1, 'weaving across the enter distance: on once, held');
  // weaving across the return distance (156-174 m, 153.5-176.5 with the jitter) from far: off once, then held
  assert.equal(drive(true, 30, (t) => 165 + 9 * Math.sin(t * 1.3)), 1, 'weaving across the return distance: off once, held');
  // standing inside the band (170.5-174.5 m, 168-177 with the jitter), from either side: never a switch
  assert.equal(drive(false, 30, (t) => 172.5 + 2 * Math.sin(t * 0.7)), 0, 'inside the band from near: no switch');
  assert.equal(drive(true, 30, (t) => 172.5 + 2 * Math.sin(t * 0.7)), 0, 'inside the band from far: no switch');
  // (local-fps-265) the gear stage's boundary under the same jitter: out from 60 m to 110 m and back, once each way;
  // standing inside its band (83.5-87.5 m, 81-90 with the jitter), never a switch
  const stand = visual.root.getObjectByName('farLodRunningGear');
  const driveGear = (startFar, seconds, path) => {
    visual.syncFromState(state, 1 / 60, startFar ? 120 : 10);
    assert.equal(stand.visible, startFar);
    let switches = 0, was = stand.visible;
    for (let frame = 1; frame <= seconds * 60; frame++) {
      visual.syncFromState(state, 1 / 60, path(frame / 60) + jitter());
      if (stand.visible !== was) { switches++; was = stand.visible; }
    }
    return switches;
  };
  assert.equal(driveGear(false, 12.5, (t) => (t < 6.25 ? 60 + 8 * t : 110 - 8 * (t - 6.25))), 2, 'the gear stage, out and back: once each way');
  assert.equal(driveGear(false, 30, (t) => 85.5 + 2 * Math.sin(t * 0.7)), 0, 'inside the gear band from near: no switch');
  assert.equal(driveGear(true, 30, (t) => 85.5 + 2 * Math.sin(t * 0.7)), 0, 'inside the gear band from far: no switch');
  visual.dispose();
}
// ---- a copied visual builds its own far LOD from its own objects
{
  const id = 'leo2a7v';
  await ensureTankBuilder(id);
  const options = { camoSeed: 7, quality: 'ai', geometryQuality: 'low', batchStatic: true, battleDetailLod: true,
    eraVisualBindingReceipt: false, staticDrawMerge: 'dual' };
  const source = createTank(id, null, options);
  const clone = cloneTankVisual(source, null, options);
  const state = createTankState(getSpec(id), new THREE.Vector3(0, 0, 0), 0);
  await settleFar(clone, state);
  await settleFar(source, state);
  assert.ok(clone.root.userData.farLod && source.root.userData.farLod, 'both build their own far LOD');
  assert.equal(clone.root.userData.farLod.wheels, source.root.userData.farLod.wheels, 'the copy stands in the same wheels');
  let foreign = 0;
  clone.root.traverse((o) => { if (o.isMesh && o.name.startsWith('farLod') && !o.parent) foreign++; });
  assert.equal(foreign, 0);
  assert.deepEqual(drawn(clone, 200).draws.map((d) => d.split('|').slice(0, 2).join('|')),
    drawn(source, 200).draws.map((d) => d.split('|').slice(0, 2).join('|')), 'the copy draws what its source draws far');
  clone.dispose(); source.dispose();
}
restoreCanvas();
console.log(`farLod.selftest: the far LOD past ${FAR_LOD_ENTER_M} m (back under ${FAR_LOD_RETURN_M}): ${rows.join('; ')}; `
  + 'the gear rests while far, back near the identity build to the byte, never with no distance, on a wreck or after the Garage reset; '
  + 'one build at a time; a tank moving at the boundary switches once each way, never inside the band; a copy builds its own PASS');
