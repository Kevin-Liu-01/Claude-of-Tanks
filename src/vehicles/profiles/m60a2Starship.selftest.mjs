import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createShell, guideShellToward } from '../../sim/ballistics.ts';
import { createCombatState, startReload } from '../../sim/damage.ts';
import {
  SPECIAL_ACTION_KINDS,
  createSpecialActionState,
  specialActionKind,
} from '../../sim/specialActions.ts';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';

const spec = getSpec('m60a2');
assert.equal(spec.gun.caliberMm, 152, 'Starship retains the 152 mm gun/launcher');
assert.equal(spec.gun.shells.every((round) => round.caliberMm === 152), true,
  'Starship never inherits the donor Patton 105 mm ammunition');

const missileSlot = spec.gun.shells.findIndex((round) => round.guided === true);
assert.notEqual(missileSlot, -1, 'MGM-51C Shillelagh is present in the launcher loadout');
const missile = spec.gun.shells[missileSlot];
assert.match(missile.name, /MGM-51C Shillelagh/i);
assert.equal(missile.count, 13, 'Starship carries its dedicated missile allotment');
assert.equal(missile.soundProfile, 'shillelagh-launch');
assert.equal(specialActionKind(spec), SPECIAL_ACTION_KINDS.GUIDED_MISSILE,
  'the ATGM action selects the Starship missile channel');
assert.equal(createSpecialActionState(spec).missileSlot, missileSlot);
assert.ok(spec.armor.modules.some((module) => module.module === 'missileRack'),
  'combat anatomy exposes the launcher missile stowage as a damageable module');

const guidedShell = createShell(
  missile, 'm60a2', true, new THREE.Vector3(), new THREE.Vector3(0, 0, 1), 60,
);
const guidedSpeed = guidedShell.vel.length();
assert.equal(guideShellToward(guidedShell, new THREE.Vector3(20, 0, 80), 1 / 60), true);
assert.ok(guidedShell.vel.x > 0, 'the Shillelagh steers toward the authority-owned sight point');
assert.ok(Math.abs(guidedShell.vel.length() - guidedSpeed) < 1e-9,
  'guided steering preserves the authored missile speed');

const conventionalSlot = spec.gun.shells.findIndex(
  (round) => round.type === 'HEAT' && round.guided !== true,
);
assert.notEqual(conventionalSlot, -1, 'Starship retains a conventional 152 mm HEAT-MP round');
const combat = createCombatState(spec);
combat.modules.missileRack.state = 'yellow';
combat.shellSlot = conventionalSlot;
startReload(combat, spec);
assert.equal(combat.reload.totalS, spec.gun.shells[conventionalSlot].reloadS,
  'missile-rack damage does not penalize conventional HEAT-MP loading');
combat.shellSlot = missileSlot;
startReload(combat, spec);
assert.equal(combat.reload.totalS, missile.reloadS * 1.4,
  'missile-rack damage applies only to the guided Shillelagh cycle');

const tank = createTank('m60a2', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});
try {
  const hullRig = tank.root.getObjectByName('rig_hull');
  assert.ok(hullRig, 'Starship retains the canonical hull rig');
  const receipt = hullRig.userData.m60a2RearClosureReceipt;
  assert.equal(receipt?.panels, 2, 'both over-track rear shoulders are structurally closed');
  assert.ok(receipt.deckOverlapM >= 0.02, 'closures overlap the deck instead of floating below it');

  const sideShoulder = hullRig.userData.m60a2SideShoulderReceipt;
  assert.equal(sideShoulder?.panels, 6,
    'both raised side shoulders are sealed from the transition through the aft deck');
  assert.ok(sideShoulder.roofOverlapM >= 0.015,
    'side shoulder volumes overlap the marked roof course instead of leaving a seam');
  assert.ok(sideShoulder.trackClearanceM >= 0.069,
    'side shoulder floors retain visible clearance over the moving track crown');
  assert.equal(sideShoulder.mergedHullDrawCalls, 0,
    'structural side fills merge into the existing camouflaged hull bucket');

  const gear = hullRig.userData.runningGearReceipts?.at(-1);
  const sprocketCrestY = gear.sprocket.y + gear.sprocket.r;
  assert.ok(receipt.bottomY - sprocketCrestY >= 0.07,
    'rear closures preserve visible clearance above the sprocket and track wrap');

  tank.root.updateMatrixWorld(true);
  for (const side of [-1, 1]) {
    const ray = new THREE.Raycaster(
      new THREE.Vector3(side * 1.4, 1.7, -5),
      new THREE.Vector3(0, 0, 1),
      0,
      2,
    );
    const hit = ray.intersectObject(hullRig, true)
      .find((intersection) => intersection.object.name === 'hull');
    assert.ok(hit, `${side < 0 ? 'left' : 'right'} rear shoulder has a camouflaged structural panel`);
    assert.ok(hit.point.z <= -3.40 && hit.point.z >= -3.70,
      `${side < 0 ? 'left' : 'right'} closure is seated against the rear deck edge`);

    for (const [y, label] of [[1.70, 'lower'], [1.90, 'upper']]) {
      const shoulderRay = new THREE.Raycaster(
        new THREE.Vector3(side * 2.5, y, -3.0),
        new THREE.Vector3(-side, 0, 0),
        0,
        1.5,
      );
      const shoulderHit = shoulderRay.intersectObject(hullRig, true)
        .find((intersection) => intersection.object.name === 'hull');
      assert.ok(shoulderHit,
        `${side < 0 ? 'left' : 'right'} ${label} side shoulder is backed by structural hull`);
      assert.ok(Math.abs(Math.abs(shoulderHit.point.x) - sideShoulder.outerX) <= 0.015,
        `${side < 0 ? 'left' : 'right'} ${label} shoulder reaches the marked outer hull edge`);
    }

    const transitionRay = new THREE.Raycaster(
      new THREE.Vector3(side * 1.47, 1.72, -1.10),
      new THREE.Vector3(0, 0, 1),
      0,
      0.7,
    );
    const transitionHit = transitionRay.intersectObject(hullRig, true)
      .find((intersection) => intersection.object.name === 'hull');
    assert.ok(transitionHit,
      `${side < 0 ? 'left' : 'right'} sloped shoulder transition is structurally filled`);
  }
} finally {
  tank.dispose();
}

console.log('m60a2Starship.selftest: side/rear shoulders closed and 152 mm Shillelagh channel verified');
