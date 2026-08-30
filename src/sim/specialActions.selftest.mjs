import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import '../vehicles/tankFactory.ts'; // register the full authored fleet
import { getSpec } from '../vehicles/specs.ts';
import { createCombatState, selectShell, startPostShotReload, tickReload } from './damage.ts';
import { createTankState, SIM_DT, updateTank } from './movement.ts';
import {
  GUIDED_MISSILE_TURN_RATE_RAD_S,
  createShell,
  guideShellToward,
} from './ballistics.ts';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { PLAYER_ACTION_BITS } from '../net/protocol.ts';
import { captureEntitySnapshot, SNAPSHOT_FLAGS } from '../net/snapshot.ts';
import {
  SPECIAL_ACTION_KINDS,
  activateSpecialAction,
  createSpecialActionState,
  specialActionGuidesShell,
  specialActionKind,
} from './specialActions.ts';

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
assert.equal(missileResult.slot, ifv.specialAction.missileSlot);
assert.equal(ifv.combat.shellSlot, ifv.specialAction.missileSlot);
assert.equal(ifv.input.shellSlot, ifv.specialAction.missileSlot);
assert.equal(ifv.combat.reload.t, 0,
  'E selects the same preloaded ATGM channel as its numbered ammunition slot');
assert.equal(ifv.specialAction.active, false, 'ammunition selection is not a hidden mode');
startPostShotReload(ifv.combat, ifv.spec);
assert.equal(ifv.combat.reload.t, 2.6, 'the launcher owns its post-shot cycle');
assert.notEqual(ifv.combat.shellSlot, originalSlot,
  'a missile impact never silently restores a different ammunition type');

const m1a3 = entityFor('m1a3');
const cannonMagazineRounds = m1a3.combat.magazine.rounds;
assert.equal(activateSpecialAction(m1a3).ok, true);
assert.equal(m1a3.combat.reload.t, 0);
startPostShotReload(m1a3.combat, m1a3.spec);
assert.equal(m1a3.combat.magazine.rounds, cannonMagazineRounds,
  'an external guided launcher never consumes the cannon autoloader magazine');
assert.equal(m1a3.combat.reload.kind, 'shell');
selectShell(m1a3.combat, 0, m1a3.spec);
assert.equal(m1a3.combat.reload.t, 0,
  'switching back to the cannon exposes its preserved ready channel');
assert.equal(m1a3.combat.magazine.rounds, cannonMagazineRounds);
for (let tick = 0; tick < Math.ceil(2.8 / SIM_DT) + 1; tick++) {
  tickReload(m1a3.combat, SIM_DT);
}
selectShell(m1a3.combat, m1a3.specialAction.missileSlot, m1a3.spec);
assert.equal(m1a3.combat.reload.t, 0,
  'the guided launcher reloads in the background while the cannon is selected');

const mbt70 = entityFor('mbt70');
assert.equal(mbt70.spec.gun.shells.length, 1,
  'MBT-70 exposes only its primary ATGM ammunition');
assert.equal(mbt70.spec.gun.shells[0].guided, true);
assert.equal(specialActionKind(mbt70.spec), SPECIAL_ACTION_KINDS.GUIDED_MISSILE,
  'every missile vehicle maps E to its guided ammunition slot');
const mbt70Selection = activateSpecialAction(mbt70);
assert.equal(mbt70Selection.ok, true);
assert.equal(mbt70Selection.slot, 0,
  'a primary-guided vehicle uses the same slot-selection rule as an IFV');
const mbt70Shell = createShell(
  mbt70.spec.gun.shells[0], 'mbt70', true, new Vector3(), new Vector3(0, 0, 1), 70,
);
assert.equal(specialActionGuidesShell(mbt70, mbt70Shell), true,
  'MBT-70 primary fire guides immediately without the IFV selector action');

const guidedSpec = ifv.spec.gun.shells[ifv.specialAction.missileSlot];
const guidedShell = createShell(
  guidedSpec, 'ifv', true, new Vector3(), new Vector3(0, 0, 1), 77,
);
assert.equal(specialActionGuidesShell(ifv, guidedShell), true,
  'every guided round uses cursor steering without an armed-mode exception');
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
assert.equal(activateSpecialAction(autoloader).reason, 'MAGAZINE_RELOADING',
  'repeating the command reports the active magazine load');
autoloader.combat.reload.kind = 'ready';
autoloader.combat.reload.t = 0;
autoloader.combat.magazine.rounds = autoloader.combat.magazine.capacity;
assert.equal(activateSpecialAction(autoloader).reason, 'MAGAZINE_FULL',
  'a full ready rack receives a distinct denial from an active reload');

assert.equal(specialActionKind(getSpec('m1a2')), SPECIAL_ACTION_KINDS.NONE,
  'vehicles without a modeled system do not receive a fake ability');

// The network action remains fully authoritative: E and slot 2 both select
// the launcher; a later ordinary fire frame launches after the launcher load.
const match = createAuthoritativeMatch({
  mapId: 'verdant',
  countdownS: 0,
  players: [
    { id: 'ifv', specId: 'bwp1', team: 'alpha', spawn: { x: 0, z: -40, yaw: 0 } },
    { id: 'target', specId: 'm1a2', team: 'bravo', spawn: { x: 0, z: 80, yaw: Math.PI } },
  ],
});
match.onMatchReady();
const input = (actionBits = 0, shellSlot = 0) => ({
  throttle: 0,
  steer: 0,
  brake: false,
  fire: false,
  aimYaw: 0,
  aimPitch: 0,
  shellSlot,
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
assert.equal(authoritativeIfv.combat.shellSlot, authoritativeIfv.specialAction.missileSlot);
assert.equal(authoritativeIfv.combat.reload.kind, 'ready',
  'separate missile channel is preloaded before its first shot');
let snapshot = match.snapshot({ tick: 1, serverTimeMs: 17, viewerId: 'ifv', ackInputSeq: 1 });
assert.ok(snapshot.events.some((event) => event.type === 'special_action' && event.id === 'ifv'));
assert.ok(!snapshot.events.some((event) => event.type === 'shell_fired'),
  'E selects the ATGM without auto-firing');
match.afterSnapshotBroadcast();
for (let tick = 0; tick < Math.ceil(2.6 / SIM_DT) + 1; tick++) {
  match.step({
    dt: SIM_DT,
    inputs: new Map([
      ['ifv', input(0, authoritativeIfv.specialAction.missileSlot)],
      ['target', input()],
    ]),
  });
}
match.step({
  dt: SIM_DT,
  inputs: new Map([
    ['ifv', { ...input(0, authoritativeIfv.specialAction.missileSlot), fire: true }],
    ['target', input()],
  ]),
});
snapshot = match.snapshot({ tick: 160, serverTimeMs: 2700, viewerId: 'ifv', ackInputSeq: 160 });
assert.ok(snapshot.events.some((event) => event.type === 'shell_fired' && event.shooterId === 'ifv'),
  'the click launches the selected ATGM through the authoritative firing path');
assert.equal(snapshot.shells.length, 1);
assert.equal(snapshot.shells[0].guided, true, 'network snapshots preserve the yellow ATGM tracer identity');
const launchVx = snapshot.shells[0].vx;
match.afterSnapshotBroadcast();
for (let i = 0; i < 6; i++) {
  match.step({
    dt: SIM_DT,
    inputs: new Map([
      ['ifv', { ...input(0, authoritativeIfv.specialAction.missileSlot), aimYaw: 0.45, aimDistance: 800 }],
      ['target', input()],
    ]),
  });
}
snapshot = match.snapshot({ tick: 166, serverTimeMs: 2800, viewerId: 'ifv', ackInputSeq: 166 });
assert.ok(snapshot.shells[0].vx > launchVx,
  'authoritative missile velocity follows subsequent cursor aim frames');

console.log('specialActions.selftest: all assertions passed');
