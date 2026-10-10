// Crumpled wrecks (world/wreckCrumple.ts, vehicles/wreckDents.ts; the owner, 2026-10-09: "destroyed vehicles should be
// crumpled not just turn rusty"). The map's baked hulks: dented hull and turret, sagging fenders, hanging skirts, a slack
// track on some, a bent barrel; the burnt map vehicles: roof pressed in, dented flanks, an end pushed in on some; the
// live kill: the burn hook's dents and a bent copy of the gun, undone at a rematch. Held to: deterministic, the field a
// function of position alone (split corners keep meeting), unit normals, bounded displacement, collision untouched.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { ensureTankBuilder, createTank } from '../vehicles/fleetFactory.ts';
import { bendGeometry, planBend, planDents, wreckRandom } from '../vehicles/wreckDents.ts';
import { crumpleBurntVehicle, crumpleWreckGeometry, planWreckCrumple } from './wreckCrumple.ts';
import { bakeTankWreck } from './wrecks.ts';
import { CIVILIAN_VEHICLE_RECEIPTS } from './maps/civilianVehicleKit.ts';

const finiteUnit = (normal, label) => {
  for (let i = 0; i < normal.count; i++) {
    const l = Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i));
    assert.ok(l > 0.99 && l < 1.01, `${label}: unit normals (corner ${i}: ${l})`);
  }
};

// ---- the planner: real surface, bounded, deterministic -------------------------------------------------------------
{
  const plane = new THREE.PlaneGeometry(4, 2, 40, 20).rotateY(Math.PI / 2).translate(1, 1, 0); // a flank facing +x
  const samples = { p: Array.from(plane.attributes.position.array), n: Array.from(plane.attributes.normal.array) };
  const dents = [];
  planDents(samples, 6, 0.4, 0.9, 0.08, 0.2, wreckRandom(7), dents, new THREE.Vector3(0, 1, 0));
  assert.equal(dents.length, 6);
  for (const d of dents) {
    assert.ok(Math.abs(d.cx - 1) < 1e-9, 'a dent sits on the surface');
    assert.ok(d.dx < -0.99, 'pushed in, toward the middle');
    assert.ok(d.depth >= 0.08 && d.depth <= 0.2 && d.r2 >= 0.16 && d.r2 <= 0.81);
  }
  const again = [];
  planDents(samples, 6, 0.4, 0.9, 0.08, 0.2, wreckRandom(7), again, new THREE.Vector3(0, 1, 0));
  assert.deepEqual(again, dents, 'deterministic in the seed');
  const bend = planBend(0.5, 5, wreckRandom(3), false);
  assert.ok(bend && bend.z0 > 0.5 + 0.3 * 4.5 && bend.z0 < 0.5 + 0.65 * 4.5, 'bends past a third of the barrel');
  const tip = bend.kappa * (5 - bend.z0) ** 2;
  assert.ok(tip >= 0.22 && tip <= 0.6, `the muzzle 0.22-0.6 m off (${tip.toFixed(2)})`);
  assert.ok(bend.uy < -0.4, 'down, under its own weight');
  assert.equal(planBend(0, 0.6, wreckRandom(3), false), null, 'a stub does not bend');
  // the bend: the bore past z0 curves, the breech end stays, normals follow
  const tube = new THREE.CylinderGeometry(0.1, 0.1, 5, 12, 20).rotateX(Math.PI / 2).translate(0, 0, 2.5);
  const before = Float32Array.from(tube.attributes.position.array);
  const I = new THREE.Matrix4();
  bendGeometry(tube, bend, I, I);
  const p = tube.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = before[i * 3 + 2], moved = Math.hypot(p.getX(i) - before[i * 3], p.getY(i) - before[i * 3 + 1], p.getZ(i) - z);
    if (z <= bend.z0) assert.equal(moved, 0, 'the breech end stays');
  }
  finiteUnit(tube.attributes.normal, 'bent tube');
}

// ---- the baked hulks ------------------------------------------------------------------------------------------------
for (const [specId, seed, pop] of [['t90m', 2526, false], ['m1a2', 2002, true]]) {
  await ensureTankBuilder(specId);
  const visual = createTank(specId, {}, { camoSeed: 4532, quality: 'low', geometryQuality: 'low', materialMode: 'geometry-only',
    eraVisualBindingReceipt: false, proceduralOnly: true });
  try {
    visual.setDestroyed({ pop, ageS: 1000 });
    const root = visual.root;
    root.updateMatrixWorld(true);
    const plan = planWreckCrumple(root, seed, pop);
    assert.ok(plan, `${specId}: a rigged tank has a plan`);
    const { hull, gear, turret, gun } = plan.parts;
    assert.ok(hull.dents.length >= 5 && hull.dents.length <= 11, `${specId}: hull dents (${hull.dents.length})`);
    assert.ok(turret.dents.length >= 3, `${specId}: turret dents`);
    assert.equal(hull.droops.length, 2, 'both fenders sag in runs');
    assert.equal(hull.hinges.length, 2, 'both skirts hang out in runs');
    assert.ok(gun.bend, 'the barrel bends');
    assert.equal(hull.bulges.length, pop ? 1 : 0, 'an ammo-rack wreck\'s deck bulges');
    assert.ok(gear.sags.length <= 1);
    // position alone: two corners at one place go to one place, whichever mesh they came from
    const inv = root.matrixWorld.clone().invert();
    let checked = 0;
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh || checked > 6) return;
      if (!/^(hull|turret|gun|hullExternalArmor)$/.test(object.name)) return;
      const geometry = object.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, object.matrixWorld));
      const twin = geometry.clone();
      crumpleWreckGeometry(plan, geometry, object);
      crumpleWreckGeometry(plan, twin, object);
      assert.deepEqual(Array.from(geometry.attributes.position.array), Array.from(twin.attributes.position.array), 'deterministic');
      const seen = new Map(), src = twin; // twin is crumpled too: compare against a fresh clone's coincident corners
      const fresh = object.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, object.matrixWorld));
      const fp = fresh.attributes.position, gp = geometry.attributes.position;
      let maxMove = 0;
      for (let i = 0; i < fp.count; i++) {
        const key = `${fp.getX(i).toFixed(5)},${fp.getY(i).toFixed(5)},${fp.getZ(i).toFixed(5)}`;
        const at = [gp.getX(i), gp.getY(i), gp.getZ(i)];
        const prior = seen.get(key);
        if (prior) assert.ok(Math.hypot(at[0] - prior[0], at[1] - prior[1], at[2] - prior[2]) < 1e-5, `${object.name}: split corners keep meeting`);
        else seen.set(key, at);
        maxMove = Math.max(maxMove, Math.hypot(at[0] - fp.getX(i), at[1] - fp.getY(i), at[2] - fp.getZ(i)));
      }
      assert.ok(maxMove > 0.02, `${specId} ${object.name}: deformed (${maxMove.toFixed(3)} m)`);
      assert.ok(maxMove < (object.name === 'gun' ? 0.75 : 0.5), `${specId} ${object.name}: within bounds (${maxMove.toFixed(3)} m)`);
      finiteUnit(geometry.attributes.normal, `${specId} ${object.name}`);
      void src;
      checked++;
    });
    assert.ok(checked >= 3, `${specId}: hull, turret and gun checked`);
  } finally { visual.dispose(); }
  // the bake carries it: deterministic, and its collision is the posed hierarchy's
  const baked = bakeTankWreck(null, specId, { seed, pop });
  const again = bakeTankWreck(null, specId, { seed, pop });
  assert.deepEqual(Array.from(baked.geo.attributes.position.array.slice(0, 3000)), Array.from(again.geo.attributes.position.array.slice(0, 3000)),
    `${specId}: the crumpled bake rebuilds byte-identical`);
  finiteUnit(baked.geo.attributes.normal, `${specId} bake`);
  baked.geo.dispose(); baked.shadowGeo?.dispose(); again.geo.dispose(); again.shadowGeo?.dispose();
}

// ---- the burnt map vehicles -----------------------------------------------------------------------------------------
for (const [role, receipt] of Object.entries(CIVILIAN_VEHICLE_RECEIPTS)) {
  const draws = () => wreckRandom(41);
  const burnt = receipt.broken(draws());
  const burntAgain = receipt.broken(draws());
  assert.deepEqual(Array.from(burnt.attributes.position.array), Array.from(burntAgain.attributes.position.array), `${role}: deterministic`);
  burnt.computeBoundingBox();
  const box = burnt.boundingBox;
  assert.ok(box.min.y > -0.005, `${role}: nothing pushed under the ground (${box.min.y.toFixed(3)})`);
  finiteUnit(burnt.attributes.normal, `${role} burnt`);
}
{
  // the field in a vehicle's frame: the roof goes down, the belt line stays
  const body = new THREE.BoxGeometry(1.8, 1.4, 4.2, 18, 14, 42).translate(0, 0.7, 0);
  body.userData.bodyBox = new THREE.Box3(new THREE.Vector3(-0.9, 0, -2.1), new THREE.Vector3(0.9, 1.4, 2.1));
  const before = Float32Array.from(body.attributes.position.array);
  crumpleBurntVehicle(body, 99);
  const p = body.attributes.position;
  let roofDown = 0, beltMoved = 0;
  for (let i = 0; i < p.count; i++) {
    const y0 = before[i * 3 + 1];
    if (y0 > 1.39 && Math.abs(before[i * 3]) < 0.3) roofDown = Math.max(roofDown, y0 - p.getY(i));
    if (y0 < 0.5 && Math.abs(before[i * 3 + 2]) < 1.0) beltMoved = Math.max(beltMoved, Math.abs(p.getY(i) - y0));
  }
  assert.ok(roofDown > 0.08, `the roof is pressed in (${roofDown.toFixed(3)} m)`);
  assert.ok(beltMoved < 1e-9, 'below the belt line nothing drops');
  finiteUnit(body.attributes.normal, 'vehicle box');
}

// ---- the live kill: the burn hook's dents and the bent gun, undone at a rematch --------------------------------------
const materials = readFileSync(new URL('../vehicles/materials.ts', import.meta.url), 'utf8');
const factory = readFileSync(new URL('../vehicles/tankFactoryCore.ts', import.meta.url), 'utf8');
assert.match(materials, /\.replace\('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\\n\$\{CRUMPLE_NORMAL_GLSL\}`\)/,
  'the dents and their normals before the normal transform');
assert.match(materials, /`#include <begin_vertex>\ntransformed \+= crD;/, 'the displacement before the burn front reads the position');
assert.match(materials, /'\|burn-r7'/, 'a new program key for the new vertex stage');
assert.match(materials, /bool crHull = crSameFrame\( modelMatrix, uCrHullW \);/, 'only meshes drawn in the hull\'s or the turret\'s frame');
assert.match(factory, /applyWreckMaterials\(\);\s*planLiveCrumple\(!!\(opts && opts\.pop\)\);/, 'planned at the kill');
assert.match(factory, /resetDestroyed\(\) \{\s*equipmentDamage\.reset\(\);\s*weaponDamage\.reset\(\);\s*resetLiveCrumple\(\);/, 'undone at a rematch');
assert.match(factory, /if \(geometryOnly\) return;\s*const rng = wreckRandom/, 'the bake plans its own (wreckCrumple.ts)');
console.log('wreckCrumple selftest: ok');
