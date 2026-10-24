// perf-250 (the coordinator's rulings of 2026-10-24): the source-X Abrams family's BATTLE builds take the 'dual' static
// merge (fleetFactory battleStaticDrawMerge): the identity build exactly, plus each translated run's merged copy, drawn only
// past FAR_MERGE_ENTER_M of screen-equivalent distance. The player's own tank (the chase camera), a ridden or spectated
// vehicle and the killcam's subjects (synced without a distance) therefore draw the identity build; every other vehicle,
// and every Garage, Gallery and hero build, keeps the identity merge. Held here:
// - the policy, per attempt in the battle roster, and the probes' ?staticmerge= override;
// - NEAR (under the threshold, with no distance, and on a wreck) a dual build draws what the identity build draws at the
//   same distance, to the byte: the same meshes, matrices, materials, geometry bytes and depth-hook offsets;
// - FAR it draws the copies in their runs' place, 30+ fewer draws on a SEPv3 bot, with the hysteresis the runtime keeps.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';

const restoreCanvas = installCanvasFixture();
const { battleStaticDrawMerge, createTank, ensureTankBuilder } = await import('./fleetFactory.ts');
const { ABRAMS_SOURCE_X_IDS } = await import('./abramsSourceXSpecs.ts');
const { FAR_MERGE_ENTER_M, FAR_MERGE_RETURN_M } = await import('./tankFactoryCore.ts');
const { getSpec } = await import('./specs.ts');
const { createTankState } = await import('../sim/movement.ts');

assert.deepEqual([...ABRAMS_SOURCE_X_IDS].sort(),
  ['m1a2_abrams', 'm1a2_abrams_sepv2', 'm1a2_abrams_sepv3', 'm1a2_abrams_tusk', 'ua_m1a2_abrams'], 'the family the ruling names');
for (const id of ABRAMS_SOURCE_X_IDS) assert.equal(battleStaticDrawMerge(id), 'dual', `${id} takes the dual merge`);
for (const id of ['m1a1_abrams_hc', 'm1a1_abrams_fep', 't90m', 'leo2_improved', 'challenger2']) {
  assert.equal(battleStaticDrawMerge(id), 'identity', `${id} keeps the identity merge`);
}
// the probes' same-build pairs: ?staticmerge= wins for every build
const realLocation = globalThis.location;
for (const mode of ['off', 'identity', 'translations', 'dual']) {
  globalThis.location = { search: `?staticmerge=${mode}` };
  assert.equal(battleStaticDrawMerge('m1a2_abrams_sepv3'), mode);
  assert.equal(battleStaticDrawMerge('t90m'), mode);
}
globalThis.location = { search: '?staticmerge=bogus' };
assert.equal(battleStaticDrawMerge('m1a2_abrams_sepv3'), 'dual', 'an unknown value is no override');
globalThis.location = realLocation;

// only the battle roster asks for it, per attempt; the Garage pedestal (the hero lent to battle) and the Gallery never do
const roster = readFileSync(new URL('../game/rosterState.ts', import.meta.url), 'utf8');
assert.match(roster, /const attemptOptions = \{ \.\.\.attempt\.options, staticDrawMerge: battleStaticDrawMerge\(attempt\.specId\) \};/);
assert.match(roster, /createTankSteps\(attempt\.specId, engineCtx, attemptOptions\)\s*:\s*createTank\(attempt\.specId, engineCtx, attemptOptions\)/);
for (const path of ['../game/garagePedestalRuntime.ts', '../game/garageDressing.ts', '../gallery/gallery.ts', '../game/studio.ts']) {
  assert.doesNotMatch(readFileSync(new URL(path, import.meta.url), 'utf8'), /staticDrawMerge|battleStaticDrawMerge/, `${path} builds no battle merge`);
}

// ---- a SEPv3 bot (low geometry, battle detail), identity and dual, synced side by side ---------------------------------
const ID = 'm1a2_abrams_sepv3';
await ensureTankBuilder(ID);
const build = (mode) => createTank(ID, null, { camoSeed: 7, quality: 'ai', geometryQuality: 'low', batchStatic: true,
  battleDetailLod: true, eraVisualBindingReceipt: false, staticDrawMerge: mode });
const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 2000);
const geometryDigests = new WeakMap();
function geometryDigest(g) {
  let hex = geometryDigests.get(g);
  if (hex) return hex;
  const digest = createHash('sha256');
  for (const name of Object.keys(g.attributes).sort()) {
    const a = g.attributes[name];
    digest.update(name).update(Buffer.from(a.array.buffer, a.array.byteOffset, a.array.byteLength));
  }
  if (g.index) digest.update(Buffer.from(g.index.array.buffer, g.index.array.byteOffset, g.index.array.byteLength));
  hex = digest.digest('hex').slice(0, 16);
  geometryDigests.set(g, hex);
  return hex;
}
/** Every mesh a camera would draw (visible chain, nearest LOD level), in traversal order: what it draws, where, with what,
 * and the polygon offset its depth hook sets. */
function drawn(visual) {
  visual.root.updateMatrixWorld(true);
  const out = [];
  const visit = (o) => {
    if (!o.visible) return;
    if (o.isLOD) { if (o.levels.length) visit(o.levels[0].object); return; }
    if (o.isMesh) {
      const materials = Array.isArray(o.material) ? o.material : [o.material];
      const units = materials.map((m) => {
        const saved = [m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits];
        o.onBeforeRender?.({}, null, camera, o.geometry, m, null);
        const offset = m.polygonOffset ? `${m.polygonOffsetFactor}/${m.polygonOffsetUnits}` : '-';
        [m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits] = saved;
        return offset;
      });
      out.push(`${o.name}|${geometryDigest(o.geometry)}|${o.matrixWorld.elements.join(',')}|`
        + `${materials.map((m) => `${m.type}:${m.name}:${m.color?.getHexString?.() ?? ''}`).join(',')}|${units.join(',')}`);
    }
    for (const child of o.children) visit(child);
  };
  visit(visual.root);
  return out;
}
const state = createTankState(getSpec(ID), new THREE.Vector3(0, 0, 0), 0);
const identity = build('identity'), dual = build('dual');
assert.ok(dual.root.userData.staticMergeFarCopies > 0, 'the dual build made far copies');
assert.equal(identity.root.userData.staticMergeFarCopies, undefined, 'the identity build made none');
const pair = (dist) => {
  identity.syncFromState(state, 0, dist);
  dual.syncFromState(state, 0, dist);
  return { identity: drawn(identity), dual: drawn(dual) };
};
for (const [label, dist] of [['8 m (the chase camera)', 8], ['under the threshold', FAR_MERGE_ENTER_M - 0.01],
  ['no distance (the killcam, inspection)', undefined]]) {
  const { identity: a, dual: b } = pair(dist);
  assert.deepEqual(b, a, `near (${label}): the identity build's draws to the byte`);
}
const near = pair(10).identity.length;
const farPair = pair(100);
const saved = farPair.identity.length - farPair.dual.length;
assert.ok(saved >= 30, `far: 30+ fewer draws (${farPair.identity.length} -> ${farPair.dual.length})`);
assert.equal(saved, dual.root.userData.staticMergeFarSavedDraws, 'the saving the build records');
// the hysteresis: the copies hold to the return distance, the parts come back under it, and need the full entry distance
assert.equal(pair(FAR_MERGE_RETURN_M + 0.01).dual.length, pair(FAR_MERGE_RETURN_M + 0.01).identity.length - saved,
  'the copies hold above the return distance');
{ const { identity: a, dual: b } = pair(FAR_MERGE_RETURN_M - 0.01); assert.deepEqual(b, a, 'the parts come back under it'); }
{ const { identity: a, dual: b } = pair(FAR_MERGE_ENTER_M - 1); assert.deepEqual(b, a, 'and stay until the entry distance'); }
// a wreck draws its parts whatever the distance (the killcam and the burn read them), and a reset wreck is the build again
pair(100);
identity.setDestroyed({ ageS: 30 });
dual.setDestroyed({ ageS: 30 });
{ const { identity: a, dual: b } = pair(100); assert.deepEqual(b, a, 'a wreck at range draws the identity build'); }
identity.resetDestroyed();
dual.resetDestroyed();
{ const { identity: a, dual: b } = pair(10); assert.deepEqual(b, a, 'a reset wreck is the identity build near'); }
{ const { identity: a, dual: b } = pair(100); assert.equal(b.length, a.length - saved, 'and takes its copies far'); }
// the Garage's reset draws the parts
pair(100);
dual.resetForGaragePresentation?.();
identity.resetForGaragePresentation?.();
assert.deepEqual(drawn(dual), drawn(identity), 'the Garage reset draws the identity build');
restoreCanvas();
console.log(`battleStaticDrawMerge.selftest: the source-X Abrams family takes the dual merge in battle (SEPv3 bot: ${near} draws `
  + `near, the identity build's to the byte with no distance, under ${FAR_MERGE_ENTER_M} m and as a wreck; ${saved} fewer `
  + 'past it), every other vehicle and every Garage, Gallery and hero build keeps identity, the probe override holds PASS');
