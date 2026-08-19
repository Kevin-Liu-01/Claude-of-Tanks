import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import '../vehicles/tankFactory.js'; // register the full authored fleet
import { getSpec } from '../vehicles/specs.js';
import { createCombatState, startPostShotReload } from './damage.js';
import { createTankState, SIM_DT, updateTank } from './movement.js';
import {
  GUIDED_MISSILE_TURN_RATE_RAD_S,
  createShell,
  guideShellToward,
} from './ballistics.js';
import { createAuthoritativeMatch } from './authoritativeMatch.js';
import { PLAYER_ACTION_BITS } from '../net/protocol.js';
import { captureEntitySnapshot, SNAPSHOT_FLAGS } from '../net/snapshot.js';
import {
  SPECIAL_ACTION_KINDS,
  activateSpecialAction,
  completeGuidedMissileFlight,
  createSpecialActionState,
  finishSpecialActionFire,
  specialActionKind,
  specialActionLocksShell,
} from './specialActions.js';

function entityFor(id) {
  const spec = getSpec(id);
  const state = createTankState(spec, new Vector3(), 0);
  return {
    spec,
    state,
    combat: createCombatState(spec),
    input: {
      throttle: 0,
      steer: 0,
      brake: false,
      fire: false,
      shellSlot: 0,
      aimPoint: state.aimPoint,
    },
    specialAction: createSpecialActionState(spec),
  };
}

const ifv = entityFor('bwp1');
assert.equal(specialActionKind(ifv.spec), SPECIAL_ACTION_KINDS.GUIDED_MISSILE);
const originalSlot = ifv.combat.shellSlot;
const missileResult = activateSpecialAction(ifv);
assert.equal(missileResult.ok, true);
assert.equal(ifv.combat.shellSlot, ifv.specialAction.missileSlot);
assert.ok(ifv.combat.reload.t > 0, 'ATGM uses the existing per-shell load time');
assert.equal(specialActionLocksShell(ifv), true);
ifv.combat.reload.t = 0;
startPostShotReload(ifv.combat, ifv.spec);
assert.equal(finishSpecialActionFire(ifv, 41), true);
assert.equal(ifv.specialAction.inFlightShellId, 41);
assert.equal(ifv.specialAction.active, true, 'guidance remains engaged during flight');
assert.equal(completeGuidedMissileFlight(ifv, 41), true);
assert.equal(ifv.combat.shellSlot, originalSlot, 'impact restores the pre-E weapon immediately');
assert.equal(specialActionLocksShell(ifv), false);

const toggled = entityFor('bwp1');
assert.equal(activateSpecialAction(toggled).active, true);
assert.equal(activateSpecialAction(toggled).active, false,
  'a second E press disengages an armed missile before launch');

const guidedSpec = toggled.spec.gun.shells[toggled.specialAction.missileSlot];
const guidedShell = createShell(
  guidedSpec, 'ifv', true, new Vector3(), new Vector3(0, 0, 1), 77,
);
const guidedSpeed = guidedShell.vel.length();
assert.equal(guideShellToward(guidedShell, new Vector3(80, 0, 120), SIM_DT), true);
assert.ok(guidedShell.vel.x > 0, 'cursor guidance turns the missile toward the new sight point');
assert.ok(Math.abs(guidedShell.vel.length() - guidedSpeed) < 1e-9,
  'guidance preserves authored missile speed');
assert.ok(Math.atan2(guidedShell.vel.x, guidedShell.vel.z) <=
  GUIDED_MISSILE_TURN_RATE_RAD_S * SIM_DT + 1e-9,
  'guidance obeys the deterministic turn-rate cap');

const strv = entityFor('strv103a');
assert.equal(specialActionKind(strv.spec), SPECIAL_ACTION_KINDS.HYDROPNEUMATIC_AIM);
assert.equal(activateSpecialAction(strv).active, true);
assert.equal(strv.state.suspensionAim, true);
assert.ok(captureEntitySnapshot(strv).flags & SNAPSHOT_FLAGS.SPECIAL_ACTIVE,
  'network snapshots replicate the engaged suspension mode');
strv.input.aimPoint.set(0, 40, 200);
const flat = { getHeightAt: () => 0, getGroundType: () => 'hard' };
for (let i = 0; i < 180; i++) updateTank(strv, flat, SIM_DT);
assert.ok(strv.state.suspensionAimPitch > 0.04,
  'engaged hydropneumatic mode drives the canonical hull attitude toward the sight line');
assert.equal(activateSpecialAction(strv).active, false);
assert.equal(strv.state.suspensionAim, false);

const autoloader = entityFor('leclerc');
assert.equal(specialActionKind(autoloader.spec), SPECIAL_ACTION_KINDS.MAGAZINE_RELOAD);
autoloader.combat.magazine.rounds -= 1;
autoloader.combat.reload.t = 0;
const reloadResult = activateSpecialAction(autoloader);
assert.equal(reloadResult.ok, true);
assert.equal(autoloader.combat.magazine.rounds, 0, 'manual reload discards the partial magazine');
assert.equal(autoloader.combat.reload.kind, 'magazine');

assert.equal(specialActionKind(getSpec('m1a2')), SPECIAL_ACTION_KINDS.NONE,
  'vehicles without a modeled system do not receive a fake ability');

// The network action remains fully authoritative: E only engages/selects the
// launcher; a later ordinary fire frame launches and subsequent aim frames
// steer the missile on the server.
const match = createAuthoritativeMatch({
  mapId: 'verdant',
  countdownS: 0,
  players: [
    { id: 'ifv', specId: 'bwp1', team: 'alpha', spawn: { x: 0, z: -40, yaw: 0 } },
    { id: 'target', specId: 'm1a2', team: 'bravo', spawn: { x: 0, z: 80, yaw: Math.PI } },
  ],
});
match.onMatchReady();
const input = (actionBits = 0) => ({
  throttle: 0,
  steer: 0,
  brake: false,
  fire: false,
  aimYaw: 0,
  aimPitch: 0,
  shellSlot: 0,
  actionBits,
});
match.step({
  dt: SIM_DT,
  inputs: new Map([
    ['ifv', input(PLAYER_ACTION_BITS.SPECIAL_ACTION)],
    ['target', input()],
  ]),
});
const authoritativeIfv = match.entityById.get('ifv');
assert.equal(authoritativeIfv.specialAction.pendingFire, true);
assert.equal(authoritativeIfv.combat.shellSlot, authoritativeIfv.specialAction.missileSlot);
let snapshot = match.snapshot({ tick: 1, serverTimeMs: 17, viewerId: 'ifv', ackInputSeq: 1 });
assert.ok(snapshot.events.some((event) => event.type === 'special_action' && event.id === 'ifv'));
assert.ok(!snapshot.events.some((event) => event.type === 'shell_fired'),
  'E engages ATGM guidance without auto-firing');
match.afterSnapshotBroadcast();
authoritativeIfv.combat.reload.t = 0;
match.step({
  dt: SIM_DT,
  inputs: new Map([
    ['ifv', input()],
    ['target', input()],
  ]),
});
snapshot = match.snapshot({ tick: 2, serverTimeMs: 34, viewerId: 'ifv', ackInputSeq: 2 });
assert.ok(!snapshot.events.some((event) => event.type === 'shell_fired'),
  'a ready launcher still waits for the player click');
match.afterSnapshotBroadcast();
match.step({
  dt: SIM_DT,
  inputs: new Map([
    ['ifv', { ...input(), fire: true }],
    ['target', input()],
  ]),
});
snapshot = match.snapshot({ tick: 3, serverTimeMs: 51, viewerId: 'ifv', ackInputSeq: 3 });
assert.ok(snapshot.events.some((event) => event.type === 'shell_fired' && event.shooterId === 'ifv'),
  'the click launches the engaged ATGM through the authoritative firing path');
assert.equal(snapshot.shells.length, 1);
assert.equal(snapshot.shells[0].guided, true, 'network snapshots preserve the yellow ATGM tracer identity');
const launchVx = snapshot.shells[0].vx;
match.afterSnapshotBroadcast();
for (let i = 0; i < 6; i++) {
  match.step({
    dt: SIM_DT,
    inputs: new Map([
      ['ifv', { ...input(), aimYaw: 0.45, aimDistance: 800 }],
      ['target', input()],
    ]),
  });
}
snapshot = match.snapshot({ tick: 9, serverTimeMs: 153, viewerId: 'ifv', ackInputSeq: 9 });
assert.ok(snapshot.shells[0].vx > launchVx,
  'authoritative missile velocity follows subsequent cursor aim frames');

console.log('specialActions.selftest: all assertions passed');
