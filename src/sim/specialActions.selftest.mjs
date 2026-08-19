import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import '../vehicles/tankFactory.js'; // register the full authored fleet
import { getSpec } from '../vehicles/specs.js';
import { createCombatState, startPostShotReload } from './damage.js';
import { createTankState, SIM_DT, updateTank } from './movement.js';
import { createAuthoritativeMatch } from './authoritativeMatch.js';
import { PLAYER_ACTION_BITS } from '../net/protocol.js';
import { captureEntitySnapshot, SNAPSHOT_FLAGS } from '../net/snapshot.js';
import {
  SPECIAL_ACTION_KINDS,
  activateSpecialAction,
  createSpecialActionState,
  finishSpecialActionFire,
  specialActionKind,
  specialActionLocksShell,
  specialActionWantsFire,
  tickSpecialAction,
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
assert.equal(specialActionWantsFire(ifv), true, 'queued ATGM fires only when authoritative reload is ready');
startPostShotReload(ifv.combat, ifv.spec);
finishSpecialActionFire(ifv);
assert.equal(ifv.specialAction.restoringShell, true);
assert.equal(tickSpecialAction(ifv), false, 'shell remains locked through the ATGM post-shot reload');
ifv.combat.reload.t = 0;
assert.equal(tickSpecialAction(ifv), true);
assert.equal(ifv.combat.shellSlot, originalSlot, 'completed launcher cycle restores the prior shell');
assert.equal(specialActionLocksShell(ifv), false);

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

// The network action remains fully authoritative: the input edge queues the
// launch server-side, and the normal server firing path emits the projectile.
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
authoritativeIfv.combat.reload.t = 0;
match.step({
  dt: SIM_DT,
  inputs: new Map([
    ['ifv', input()],
    ['target', input()],
  ]),
});
const snapshot = match.snapshot({ tick: 2, serverTimeMs: 34, viewerId: 'ifv', ackInputSeq: 2 });
assert.ok(snapshot.events.some((event) => event.type === 'special_action' && event.id === 'ifv'));
assert.ok(snapshot.events.some((event) => event.type === 'shell_fired' && event.shooterId === 'ifv'),
  'queued ATGM launches through the authoritative firing path');

console.log('specialActions.selftest: all assertions passed');
