import assert from 'node:assert/strict';
import { Euler, Group, Quaternion, Vector3 } from 'three';
import { createRequire } from 'node:module';
import '../vehicles/tankFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { tankPoseFromState, traceTank } from './armor.ts';
import { sustainedPrimaryDpm } from '../vehicles/balanceAudit.ts';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { createCombatState, startMagazineReload, tickReload, resolveHeBurst, blastRadiusM } from './damage.ts';
import { createTankState, shotRecoilScale, SIM_DT } from './movement.ts';
import { createShell, stepShell, guideShellToward } from './ballistics.ts';
import { isUnguidedRocket, usesLauncherMuzzles } from './launcherPolicy.ts';
import { createGameState, createBus, simStep } from '../game/state.ts';
import { createBrowserBattleBridge } from '../net/browserBattleBridge.ts';
import { snapshotWireCodec } from '../net/snapshotWireCodec.ts';
import { createEnvelope, MESSAGE_TYPES } from '../net/protocol.ts';
import { createSnapshotDelta } from '../net/snapshot.ts';
import { autoloaderHudState } from '../ui/hud.ts';
import { specialActionKind } from './specialActionPolicy.ts';
import { createFx } from '../fx/effects.ts';
import { disposeObject3DResources } from '../engine/resourceLifetime.ts';

const spec = structuredClone(getSpec('tos1a_tagil'));
assert.equal(spec.gun.launcherMuzzles.length, 24);
assert.deepEqual(spec.gun.autoloader, { magazineSize: 24, intraClipS: .25, fullReloadS: 48 });
assert.equal(spec.gun.shells.length, 1, 'no phantom secondary cannon channel');
assert.equal(spec.gun.shells[0].count, 72);
const rocket = spec.gun.shells[0];
const flat = { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) };
const input = { throttle: 0, steer: 0, brake: true, fire: true, shellSlot: 0,
  aimYaw: 0, aimPitch: .15, aimPoint: new Vector3(0, 50, 300), actionBits: 0 };
function near(a, b, label, eps = 1e-8) { assert.ok(Math.abs(a - b) < eps, `${label}: ${a} != ${b}`); }
assert.equal(isUnguidedRocket(spec.gun, rocket), true);
assert.equal(usesLauncherMuzzles(spec.gun, rocket), true);
assert.equal(usesLauncherMuzzles({ ...spec.gun, fixedLaunchCanisters: false }, rocket), false);
assert.equal(usesLauncherMuzzles({ ...spec.gun, launcherMuzzles: [] }, rocket), false);
assert.equal(isUnguidedRocket(spec.gun, null), false);
assert.equal(isUnguidedRocket(spec.gun, { guided: true }), false);
assert.equal(usesLauncherMuzzles({ launcherMuzzles: spec.gun.launcherMuzzles }, { guided: true }), true);
assert.equal(shotRecoilScale(spec, rocket), 0);
assert.equal(specialActionKind(spec), 'magazine_reload');
assert.equal(autoloaderHudState({ rounds: 24, capacity: 24 }, { t: 0 }).overflow, 20);

// A real ballistic shell follows gravity and ignores attempted cursor steering.
const ballistic = createShell(rocket, 'r', true, new Vector3(0, 20, 0), new Vector3(0, 0, 1), 1);
ballistic.rocket = true;
assert.equal(guideShellToward(ballistic, new Vector3(100, 100, 0), SIM_DT), false);
stepShell(ballistic, 1);
near(ballistic.vel.y, -9.81, 'rocket retains gravity');
near(ballistic.vel.x, 0, 'rocket cannot home');

function expectedMouth(entity, index) {
  const { state } = entity, [tx, ty, tz] = spec.armor.turretPivot, [gx, gy, gz] = spec.armor.gunPivot;
  const tip = spec.gun.launcherMuzzles[index];
  return new Vector3(tip.x, tip.y, tip.z).applyAxisAngle(new Vector3(1, 0, 0), -state.gunPitch)
    .add(new Vector3(gx, gy, gz)).applyAxisAngle(new Vector3(0, 1, 0), state.turretYaw)
    .add(new Vector3(tx, ty, tz)).applyQuaternion(new Quaternion().setFromEuler(new Euler(-state.visualPitch, state.yaw, state.visualRoll, 'YXZ'))).add(state.pos);
}
function authorityRun() {
  const match = createAuthoritativeMatch({ mapId: 'verdant', seed: 9, countdownS: 0,
    worldCollision: { mapId: 'verdant', heightField: flat, obstacles: [] },
    players: [{ id: 'rocket', specId: 'm1a2', team: 'alpha', spawn: { x: 0, z: 0, yaw: 0 } },
      { id: 'opponent', specId: 'm1a2', team: 'bravo', spawn: { x: 400, z: -400, yaw: 0 } }] });
  const entity = match.entities[0]; entity.spec = structuredClone(spec); entity.combat = createCombatState(entity.spec);
  entity.state = createTankState(entity.spec, new Vector3(), 0); entity.state.gunPitch = .15;
  match.onMatchReady();
  const events = [];
  for (let tick = 0; tick <= 345; tick++) {
    match.step({ dt: SIM_DT, inputs: new Map([['rocket', input]]) });
    const snap = match.snapshot({ tick, serverTimeMs: tick * 1000 / 60, viewerId: 'rocket', ackInputSeq: tick });
    for (const event of snap.events.filter(e => e.type === 'shell_fired')) {
      const expected = expectedMouth(entity, events.length);
      assert.ok(expected.distanceTo(new Vector3(event.x, event.y, event.z)) < 1e-8, 'authority uses the actual indexed pitching mouth');
      events.push({ tick, muzzleIndex: event.muzzleIndex, x: event.x, y: event.y, z: event.z, dx: event.dx, dy: event.dy, dz: event.dz });
    }
    match.afterSnapshotBroadcast();
  }
  assert.equal(events.length, 24); assert.deepEqual(events.map(e => e.muzzleIndex), Array.from({ length: 24 }, (_, i) => i));
  assert.deepEqual(events.map(e => e.tick), Array.from({ length: 24 }, (_, i) => i * 15));
  assert.equal(entity.combat.ammo[0], 48); assert.equal(entity.combat.magazine.rounds, 0);
  assert.equal(entity.combat.reload.kind, 'magazine'); near(entity.combat.reload.t, 48, 'full rack begins after final rocket');
  const snapshot = match.snapshot({ tick: 346, serverTimeMs: 346 * 1000 / 60, viewerId: 'rocket' });
  const packet = createEnvelope(MESSAGE_TYPES.SNAPSHOT, createSnapshotDelta(snapshot), { tick: snapshot.tick, seq: snapshot.tick });
  assert.deepEqual(snapshotWireCodec.decode(snapshotWireCodec.encode(packet)), JSON.parse(JSON.stringify(packet)), '24-round rack traverses unchanged wire codec');
  for (let tick = 0; tick < 2879; tick++) match.step({ dt: SIM_DT, inputs: new Map([['rocket', input]]) });
  assert.equal(entity.combat.ammo[0], 48, 'no 25th rocket before the complete rack reload');
  match.afterSnapshotBroadcast();
  match.step({ dt: SIM_DT, inputs: new Map([['rocket', input]]) });
  assert.equal(entity.combat.ammo[0], 47); assert.equal(entity.combat.magazine.rounds, 23);
  assert.equal(match.snapshot({ tick: 4000, serverTimeMs: 0, viewerId: 'rocket' }).events.find(e => e.type === 'shell_fired').muzzleIndex, 0, 'next rack returns to tube zero');
  return events;
}
assert.deepEqual(authorityRun(), authorityRun(), 'equal fixed steps and seed produce identical salvo events');

// Full local sim integration, with a Three.js articulated visual fixture.
const game = createGameState(), events = [], kicks = [];
const entity = { id: 'solo-rocket', specId: 'm1a2', spec, isPlayer: true, team: 'player',
  state: createTankState(spec, new Vector3(), 0), combat: createCombatState(spec), input: { ...input },
  visual: { root: new Group(), gunMuzzleWorld(out, index, launcher) {
    assert.equal(launcher, true); return out.copy(expectedMouth(entity, index));
  }, gunDirWorld(out) { return out.set(0, Math.sin(entity.state.gunPitch), Math.cos(entity.state.gunPitch)); },
  recoilKick(age, scale, index, launcher) { kicks.push({ scale, index, launcher }); } } };
game.tanks = [entity]; game.allTanks = [entity]; game.tankById.set(entity.id, entity);
const bus = createBus((name, payload) => { if (name === 'shell:fired') events.push(structuredClone(payload)); });
const collider = { setSelf() {}, collide() { return false; }, pendingCrush: [], pendingRams: [], queueRam() {} };
for (let i = 0; i <= 345; i++) simStep(game, bus, { heightField: flat, raycast: () => null }, null, collider);
assert.equal(events.length, 24); assert.deepEqual(events.map(e => e.muzzleIndex), Array.from({ length: 24 }, (_, i) => i));
near(events[23].timeS - events[0].timeS, 5.75, 'local full salvo duration');
assert.ok(events.every(e => e.rocket === true && e.shellType === 'HE' && e.recoilScale === 0));
assert.ok(kicks.every(k => k.scale === 0 && k.launcher === true));
assert.equal(entity.combat.ammo[0], 48); assert.equal(entity.combat.reload.kind, 'magazine');
assert.ok(game.shells.every(s => s.rocket === true && !s.spec.guided));

// Rack damage affects the long refill, not whether an HE round becomes guided.
const damaged = structuredClone(spec);
damaged.armor.modules.push({ module: 'missileRack', min: [0, 0, 0], max: [1, 1, 1], turretLocal: true });
const combat = createCombatState(damaged); combat.magazine.rounds = 12;
combat.modules.missileRack.state = 'yellow'; startMagazineReload(combat, damaged);
near(combat.reload.totalS, 67.2, 'yellow rack multiplier'); tickReload(combat, 100);
combat.magazine.rounds = 12; combat.modules.missileRack.state = 'red'; startMagazineReload(combat, damaged);
near(combat.reload.totalS, 86.4, 'red rack multiplier');
const ordinary = structuredClone(damaged); ordinary.gun.fixedLaunchCanisters = false;
const ordinaryCombat = createCombatState(ordinary); ordinaryCombat.magazine.rounds = 12;
ordinaryCombat.modules.missileRack.state = 'red'; startMagazineReload(ordinaryCombat, ordinary);
near(ordinaryCombat.reload.totalS, 48, 'ordinary HE is not launcher stock');

// Late-join network projectiles reconstruct rocket presentation without new wire fields.
const netGame = { tanks: [], tankById: new Map(), shells: [], player: null, timeS: 0, result: null };
const feedback = [], calls = [];
const bridge = createBrowserBattleBridge({ engineCtx: { scene: { add() {} } }, game: netGame,
  viewerId: 'viewer', bus: { emit(type, payload) { feedback.push({ type, payload }); } }, prepareVisualTextures: async () => {},
  createTankVisual: () => ({ root: new Group(), setVisible() {}, syncFromState() {}, dispose() {},
    recoilKick(age, scale, index, launcher) { calls.push({ index, launcher, scale }); return index; },
    gunMuzzleWorld(out, index, launcher) { assert.equal(launcher, true); return out.set(index, 3, 2.6); }, gunDirWorld(out) { return out.set(0, 0, 1); } }) });
const own = { id: 'viewer', specId: 'm1a2', team: 'alpha', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0,
  turretYaw: 0, gunPitch: 0, hp: 2000, maxHp: 2000, reloadS: 0, shellSlot: 0,
  ammo0: 72, ammo1: 0, ammo2: 0, magazineRounds: 24, magazineCapacity: 24, flags: 0 };
const frame = { tick: 1, serverTimeMs: 0, entities: [own], shells: [], meta: { phase: 'playing', roomRound: 0 } };
bridge.apply(frame); netGame.player.spec = spec;
frame.tick++; frame.shells = [{ id: 101, shooterId: 'viewer', type: 'HE', guided: false, x: 0, y: 300, z: 800, vx: 0, vy: 0, vz: 30000 }];
bridge.apply(frame, 0, [{ type: 'shell_fired', shooterId: 'viewer', shellId: 101, shellName: rocket.name,
  shellType: 'HE', shellSlot: 0, muzzleIndex: 23, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 1, caliberMm: 220, velocityMps: 300 }]);
assert.equal(netGame.shells[0].rocket, true); assert.equal(netGame.shells[0].spec.guided, false);
assert.equal(netGame.player.combat.launcherCursor, 0);
assert.ok(calls.some(c => c.index === 23 && c.launcher === true && c.scale === 0));
assert.equal(feedback.findLast(e => e.type === 'shell:fired').payload.rocket, true);
assert.deepEqual(feedback.findLast(e => e.type === 'shell:fired').payload.muzzlePos, [23, 3, 2.6]);
netGame.player.spec = ordinary; frame.tick++; bridge.apply(frame);
assert.equal(netGame.shells[0].rocket, false, 'ordinary HE does not acquire rocket visuals');
bridge.dispose();

// Actual fleet armor traces: light hull penetration versus protected MBT armor.
function directHit(id, y) {
  const targetSpec = getSpec(id), state = createTankState(targetSpec, new Vector3(), 0);
  const target = { id, spec: targetSpec, state, combat: createCombatState(targetSpec) };
  const from = new Vector3(0, y, 20), to = new Vector3(0, y, -8);
  const hits = traceTank(from, to, tankPoseFromState(state), targetSpec.armor, target.combat.eraSpent);
  const plate = hits.find(hit => hit.kind === 'plate');
  assert.ok(plate, `${id}: actual armor receives the test ray`);
  const shell = createShell(rocket, 'battery', true, from, new Vector3(0, 0, -1), 1);
  shell.pos.copy(to);
  const events = resolveHeBurst(shell, plate.point, [target], target, hits, () => .5);
  assert.equal(events.length, 1);
  return { target, plate, event: events[0] };
}
const heavy = directHit('m1a2', .75), light = directHit('bmp2', 1.2);
assert.equal(heavy.plate.plate.name, 'lower_front');
assert.equal(light.plate.plate.name, 'upper_glacis');
assert.equal(heavy.event.kind, 'he_splash'); assert.equal(heavy.event.damage, 0, 'thick frontal armor absorbs the blast');
assert.equal(light.event.kind, 'he_pen'); assert.equal(light.event.damage, 240, 'a direct light-hull penetration deals authored damage');
const lightSlope = directHit('bmp2', .65);
assert.equal(lightSlope.event.kind, 'he_splash');
near(lightSlope.event.damage, 91.4, 'a steep light-hull plate resists direct HE penetration');
const slope = directHit('m1a2', 1.4);
assert.equal(slope.event.kind, 'he_splash');
assert.ok(slope.event.damage > 0 && slope.event.damage < light.event.damage, 'sloped thin upper glacis takes reduced surface blast');
assert.equal(blastRadiusM(rocket.caliberMm), 8, 'existing bounded caliber radius is retained');
const farShell = createShell(rocket, 'battery', true, new Vector3(0, 1, 30), new Vector3(0, 0, -1), 2);
assert.deepEqual(resolveHeBurst(farShell, new Vector3(0, 1, 30), [light.target], null, null, () => .5), [], 'outside-radius blast has no damage');
near(sustainedPrimaryDpm(spec), 240 * 24 * 60 / (48 + 23 * .25), 'complete-cycle damage includes all rack downtime');
console.log(JSON.stringify({ damageStudy: { protectedMbtFront: heavy.event.damage,
  thinSlopedMbtGlacis: slope.event.damage, lightHullDirect: light.event.damage, steepLightHull: lightSlope.event.damage,
  nominalSalvoDamage: 24 * rocket.dmg, salvoS: 5.75, fullReloadS: 48,
  nominalSustainedDpm: sustainedPrimaryDpm(spec), blastRadiusM: 8,
  limitation: 'Fixed mean-roll direct impacts, not a win-rate or accuracy claim.' } }));

// Actual bounded FX runtime renders unguided rocket bodies/trails and distinct ignition.
const beforeDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const { createCanvas } = createRequire(import.meta.url)('@napi-rs/canvas');
globalThis.document = { createElement: tag => { assert.equal(tag, 'canvas'); return createCanvas(1, 1); } };
let fx;
try {
  fx = createFx({ anisotropy: 1 }, flat, { seed: 77 });
  const fxBus = createBus(); fx.bindBus(fxBus);
  const camera = new (await import('three')).PerspectiveCamera(); camera.position.set(10, 5, -10);
  const shell = { id: 1, rocket: true, pos: new Vector3(0, 3, 10), prevPos: new Vector3(0, 3, 5),
    vel: new Vector3(0, -1, 300), distM: 10, spec: rocket };
  fxBus.emit('shell:fired', { shellId: 1, muzzlePos: [0, 3, 2.6], dir: [0, 0, 1], caliberMm: 220, shellType: 'HE', rocket: true });
  fx.update(SIM_DT, [shell], camera);
  assert.equal(fx.getGuidedMissileDebug().bodies, 1, 'pooled missile body is visible without guidance');
  assert.ok(fx.getGuidedMissileDebug().trailSegments > 0);
  fx.update(SIM_DT, [{ ...shell, rocket: false }], camera);
  assert.equal(fx.getGuidedMissileDebug().bodies, 0, 'ordinary HE negative has no missile body');
  fx.update(SIM_DT, [{ ...shell, rocket: false, spec: { ...rocket, guided: true } }], camera);
  assert.equal(fx.getGuidedMissileDebug().bodies, 1, 'existing guided visuals stay supported');
} finally {
  if (fx) { fx.resetAll(); disposeObject3DResources(fx.group); }
  if (beforeDocument) Object.defineProperty(globalThis, 'document', beforeDocument); else delete globalThis.document;
}
console.log('rocketBattery:24 actual local/authority events, .25s cadence/48s refill, deterministic indexed mouths, ammo/HUD/wire, no guidance/recoil, rocket FX and negatives PASS');
