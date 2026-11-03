// 2026-11-02 audit F10: a network peer's wreck takes the cause of the death it shows. The row's DESTROYED flag and the
// tank_destroyed event (which carries the cause) race; the presentation forwards a late cook-off cause to the visual,
// naming it late (lateCause: only then does the visual's wreck owner upgrade a young plain wreck,
// vehicles/wreckLifecycle.ts; the first call names nothing), and a respawn forgets the last life's
// cause, so a second death never first draws the previous death's wreck (a turret pop after a cook-off last time).
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createTankState } from '../../sim/movement.ts';
import { getSpec } from '../../vehicles/specs.ts';
import { ENTITY_FLAGS, PHASE, TEAM, VERDICT, quantizePosition, zeroEntityRow } from '../wire/index.ts';
import { createEntitySample } from '../match/interpolation.ts';
import { createBattlePresentation } from './index.ts';

const wrecks = [];
let nowMs = 1000;
const game = {
  tanks: [], tankById: new Map(), player: null, shells: [], spotting: null, allTanks: [],
  timeS: 0, preBattleS: 0, result: null, resultReason: null, mapId: 'winter',
};
function fakeVisual() {
  return {
    root: { position: new Vector3(), userData: {} },
    setVisible() {}, syncFromState(state) { this.root.position.copy(state.pos); },
    recoilKick() { return null; }, gunMuzzleWorld(out) { return out.set(0, 2, 0); }, gunDirWorld(out) { return out.set(0, 0, 1); },
    stripEra() {}, resetEra() {},
    setDestroyed(options) { wrecks.push((options.pop ? 'cookoff' : 'plain') + (options.lateCause ? '+late' : '')); },
    resetDestroyed() { wrecks.push('revive'); },
    dispose() {},
  };
}
const presentation = createBattlePresentation({
  engineCtx: { scene: { add() {} }, anisotropy: 1 }, game, bus: { emit() {} },
  worldCollision: { heightField: { getHeightAt: () => 0, getHeightAtFast: () => 0, getGroundType: () => 'hard' }, getObstacles: () => [],
    crushObstacle() {} },
  createTankVisual: fakeVisual, prepareVisualTextures: async () => {}, clearVehicleDecals: () => {}, camoFor: () => 'summer',
  clock: () => nowMs,
});
await presentation.applyRoster([
  { entityId: 1, seat: 0, team: TEAM.ALPHA, bot: false, connected: true, playerId: 'me', name: 'Me', specId: 'm1a1_abrams_hc' },
  { entityId: 2, seat: 1, team: TEAM.BRAVO, bot: false, connected: true, playerId: 'foe', name: 'Foe', specId: 'm1a1_abrams_hc' },
], { ownEntityId: 1, ownPlayerId: 'me', roomId: 'r', mapId: 'winter', mode: 'standard', rulesetJson: '{}' });

const ownState = createTankState(getSpec('m1a1_abrams_hc'), new Vector3(0, 1.2, 0), 0);
function foeSample(destroyed) {
  const out = createEntitySample(2);
  Object.assign(out, { x: 20, y: 1.2, z: 20, yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0, hp: destroyed ? 0 : 1500, maxHp: 2000,
    reloadS: 0, reloadTotalS: 6, reloadKind: 'shell', gunReloadS: 0, gunReloadTotalS: 6, gunReloadKind: 'shell',
    ammo0: 20, ammo1: 4, ammo2: 2, flags: destroyed ? ENTITY_FLAGS.DESTROYED : 0, snapped: false, eraSpent: [] });
  return out;
}
let tick = 100;
function frame(destroyed) {
  tick += 2;
  presentation.applyFrame({
    tick, renderTimeMs: tick * 16, entities: [foeSample(destroyed)], shells: [],
    meta: { phase: PHASE.PLAYING, countdownMs: 0, battleTimeMs: 12_500, verdict: VERDICT.NONE, verdictReason: '', destructibleRevision: 0 },
    modeStateJson: null, destroyed: [], destructibleRevision: 0,
    viewer: { entityId: 1, playerId: 'me', state: ownState,
      row: { ...zeroEntityRow(1), x: quantizePosition(0), y: 1200, z: quantizePosition(0), hp: 1800, maxHp: 2000, reloadTotal: 3000 },
      viewer: { entityId: 1, modules: new Array(15).fill(0), crewBits: 0, equipment: [1000, 1000, 1000, 1000], modeSpeedMultiplier: 1000,
        modeGravityScale: 1000, movementVersion: 0, movementFlags: 0, movementValues: [] },
      authorityTick: tick - 2, authorityReceivedAtMs: nowMs, predictedShot: null },
    events: [], ownShots: [], extrapolatedMs: 0, phase: 'live',
  });
}
const killed = (cause) => presentation.applyEvent({ kind: 'tank_destroyed', payload: { id: 'foe', killerId: 'me', cause, x: 20, y: 1.2, z: 20 } },
  { own: false, feedbackPredicted: false });

frame(false);
// the race on a first death: the row's flag first (plain), then the cook-off cause, forwarded for the visual's upgrade
frame(true);
assert.deepEqual(wrecks, ['plain']);
killed('ammo_rack');
frame(true);
assert.deepEqual(wrecks, ['plain', 'cookoff+late'], 'a late cook-off cause reaches the visual, named late');
frame(true);
assert.deepEqual(wrecks, ['plain', 'cookoff+late'], 'once');

// a respawn forgets the last life's cause: the next death's flag before its event wrecks as the plain kill it may be
frame(false);
assert.deepEqual(wrecks.slice(2), ['revive']);
frame(true);
assert.deepEqual(wrecks.slice(3), ['plain'], "a second death never first draws the previous death's cook-off");
killed('shot');
frame(true);
assert.deepEqual(wrecks.slice(3), ['plain'], 'a plain cause leaves the plain wreck');

// the other order (the event first) still wrecks with its cause at once
frame(false);
killed('ammo_rack');
frame(true);
assert.deepEqual(wrecks.slice(4), ['revive', 'cookoff'], 'an event before the flag wrecks with its cause');

presentation.dispose();
console.log('wreckCause.selftest: a late cook-off cause reaches the wreck; a respawn forgets the last life\'s cause');
