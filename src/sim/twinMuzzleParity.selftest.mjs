// Twin cannons: one barrel owner (round 8 Y1 s5-01; sim/launcherPolicy.ts nextCannonMuzzle). Which of a gun's own mouths a
// round leaves was three owners' call: the solo step alternated its own cursor and fired from the visual's mouth, the
// authority kept none (every round left the gun's centre line, shell_fired named mouth -1), and each network screen
// alternated its visual's cursor, so on a twin air-defence cannon (gepard_1a2: bores 0.96 m either side of the trunnion)
// the flash, the sabot petals and the kill-cam trajectory started on an outer barrel while the round left from between
// the guns, solo and online fired from origins 1-1.2 m apart, and the own seat's predicted kick always took barrel 1.
// Now both drivers ask one selector at the shot and the authority offsets the round to that mouth and names it; the
// network screens kick and flash the barrel it names, the own seat's prediction the barrel it will name next.
// - the authority (the real fire path, seeded on verdant): a gepard_1a2's rounds name mouths 0, 1, 0, and each leaves its
//   mouth (the profile's own data: trunnion, bores, mouth plane, in the turret frame at the shot, within 1 cm);
// - a twin cannon with missiles (tunguska_m): a missile takes its launcher tube and leaves the cannon's alternation alone;
//   aft10's canisters are launcher tubes (launcherMuzzles), so the launcher rule names them as before;
// - the solo step (setupBattle, simStep) asks the same selector: the same mouths in the same order (a battle on the page's
//   step: src/game/twinMuzzleSolo.selftest.mjs, MANUAL 'sims'; this file reads the authority's fleet only, so it costs a
//   few seconds on every npm test);
// - the network presentation: the own seat's predicted kick is the mouth the authority names next, a confirmed shot
//   flashes at the mouth it names, a remote shooter's visual kicks the named barrel;
// - one writer of a hull's barrel cursor (the selector; the presentation mirrors the authority's): no assignment, compound
//   assignment, increment or decrement of muzzleCursor, and no object literal naming it, outside those two files.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { createTankState } from './movement.ts';
import { GEPARD_BORE, GEPARD_MUZZLE_Z, GEPARD_TRUNNION } from '../vehicles/profiles/gepardFrame.ts';
import { createBattlePresentation } from '../mp/presentation/index.ts';
import { PHASE, TEAM, VERDICT, quantizePosition, zeroEntityRow } from '../mp/wire/index.ts';
import { createEntitySample } from '../mp/match/interpolation.ts';

// the four ids the authority fires here, their combat anatomy only: no vehicle builders, no page step (state.ts)
await ensureAuthorityFleet(['gepard_1a2', 'tunguska_m', 'aft10', 'm1a1_abrams_hc']);
const _euler = new Euler(), _quat = new Quaternion(), _unit = new Vector3(), _hull = new Matrix4(), _local = new Matrix4();
const _turret = new Matrix4(), _inverse = new Matrix4(), _point = new Vector3();

/** A world point in the hull's turret frame, as the authority poses the turret (gunWorldPose). */
function turretLocal(entity, x, y, z) {
  const s = entity.state, pivot = entity.spec.armor.turretPivot;
  _euler.set(-s.visualPitch, s.yaw, s.visualRoll, 'YXZ');
  _quat.setFromEuler(_euler);
  _unit.setScalar(s.modeScale ?? 1);
  _hull.compose(s.pos, _quat, _unit);
  _local.makeRotationY(s.turretYaw);
  _local.setPosition(pivot[0], pivot[1], pivot[2]);
  _turret.multiplyMatrices(_hull, _local);
  _inverse.copy(_turret).invert();
  return _point.set(x, y, z).applyMatrix4(_inverse).clone();
}

/** An authority with one shooter (and a far target), stepped with the trigger held; its shots, each with its pose then. */
function authorityShots(specId, shots, slots = () => 0) {
  const match = createAuthoritativeMatch({ mapId: 'verdant', seed: 9, countdownS: 0, players: [
    { id: 'aa', specId, team: 'alpha', spawn: { x: 0, z: -50, yaw: 0 } },
    { id: 'far', specId: 'm1a1_abrams_hc', team: 'bravo', spawn: { x: 0, z: 350, yaw: Math.PI } },
  ] });
  match.onMatchReady();
  const shooter = match.entityById.get('aa');
  const fired = [];
  for (let tick = 1; tick <= 3000 && fired.length < shots; tick++) {
    const input = { throttle: 0, steer: 0, brake: true, fire: true, aimYaw: 0, aimPitch: 0.02, shellSlot: slots(fired.length) };
    match.step({ dt: 1 / 60, tick, inputs: new Map([['aa', input]]) });
    const snapshot = match.snapshot({ tick, serverTimeMs: tick * 1000 / 60, viewerId: 'aa', ackInputSeq: tick });
    for (const event of snapshot.events) {
      if (event.type !== 'shell_fired' || event.shooterId !== 'aa') continue;
      // the shot's pose: a shot only changes the hull's rates, and nothing after the weapons in the step moves it
      fired.push({ ...event, local: turretLocal(shooter, event.x, event.y, event.z), gunPitch: shooter.state.gunPitch,
        cursor: shooter.combat.muzzleCursor ?? 0 });
    }
    match.afterSnapshotBroadcast();
  }
  assert.equal(fired.length, shots, `${specId} fired ${shots} rounds`);
  return fired;
}

// ---- the authority: a gepard_1a2's rounds leave its two bores in turn -------------------------------------------------
const gepard = getSpec('gepard_1a2');
assert.deepEqual([gepard.armor.gunPivot, gepard.armor.gunBarrel.lengthM, gepard.gun.muzzles.map((m) => [m.x, m.y])],
  [[...GEPARD_TRUNNION], GEPARD_MUZZLE_Z, [[-GEPARD_BORE.x, GEPARD_BORE.y], [GEPARD_BORE.x, GEPARD_BORE.y]]],
  'the spec seats the profile\'s trunnion, mouth plane and bores');
const gepardShots = authorityShots('gepard_1a2', 3);
assert.deepEqual(gepardShots.map((shot) => shot.muzzleIndex), [0, 1, 0], 'the authority names the mouth each round leaves, in turn');
for (const shot of gepardShots) {
  const bx = shot.muzzleIndex === 0 ? -GEPARD_BORE.x : GEPARD_BORE.x, by = GEPARD_BORE.y, p = shot.gunPitch;
  const expected = new Vector3(GEPARD_TRUNNION[0] + bx, GEPARD_TRUNNION[1] + by * Math.cos(p) + GEPARD_MUZZLE_Z * Math.sin(p),
    GEPARD_TRUNNION[2] - by * Math.sin(p) + GEPARD_MUZZLE_Z * Math.cos(p));
  const miss = shot.local.distanceTo(expected);
  assert.ok(miss < 0.01, `round ${shot.shellId} leaves mouth ${shot.muzzleIndex} at (${bx}, ${by}, ${GEPARD_MUZZLE_Z}) on the gun, `
    + `turret frame (${shot.local.toArray().map((v) => v.toFixed(3))}), ${(miss * 100).toFixed(1)} cm off`);
}
assert.ok(Math.abs(gepardShots[0].local.x - gepardShots[1].local.x) > 1.9, 'the two bores are 1.92 m apart across the turret');

// ---- a twin cannon with missiles: a missile takes a launcher tube and leaves the cannons' turn alone -------------------
{
  const tunguska = getSpec('tunguska_m');
  const missileSlot = tunguska.gun.shells.findIndex((shell) => shell.guided);
  assert.ok(missileSlot > 0, 'tunguska_m carries a guided round');
  const shots = authorityShots('tunguska_m', 3, (n) => (n === 1 ? missileSlot : 0));
  assert.deepEqual(shots.map((shot) => [shot.shellSlot, shot.muzzleIndex]), [[0, 0], [missileSlot, 0], [0, 1]],
    'cannon round from mouth 0, the missile from tube 0, the next cannon round from mouth 1');
  assert.deepEqual(shots.map((shot) => shot.cursor), [1, 1, 2], 'the missile left the cannons\' cursor where it was');
  // aft10's eight canisters are launcher tubes: the launcher rule names them, the cannons' cursor never moves
  const aft10 = authorityShots('aft10', 2);
  assert.ok(getSpec('aft10').gun.launcherMuzzles?.length === 8, 'aft10 seats its canisters as launcher tubes');
  assert.deepEqual(aft10.map((shot) => [shot.muzzleIndex, shot.cursor]), [[0, 0], [1, 0]], 'aft10\'s missiles leave tubes 0 and 1');
}

// ---- the network presentation: the barrel the authority names --------------------------------------------------------
{
  const kicks = new Map(), events = [];
  const fakeVisual = (specId) => {
    let alternate = 0;
    const visual = {
      root: { position: new Vector3(), userData: {} }, visible: false, syncs: 0,
      setVisible(next) { this.visible = next; }, syncFromState(state) { this.syncs++; this.root.position.copy(state.pos); },
      recoilKick(_age, _scale, muzzleIndex) { kicks.get(visual).push(muzzleIndex); return muzzleIndex ?? (alternate++ % 2); },
      gunMuzzleWorld(out, muzzleIndex) { return out.set(100 + muzzleIndex, 3, 0); },
      gunDirWorld(out) { return out.set(0, 0, 1); },
      stripEra() {}, resetEra() {}, setDestroyed() {}, resetDestroyed() {}, dispose() {},
    };
    kicks.set(visual, []);
    return visual;
  };
  const game = { tanks: [], tankById: new Map(), player: null, shells: [], spotting: null, allTanks: [], timeS: 0, preBattleS: 0,
    result: null, resultReason: null, mapId: 'verdant' };
  const presentation = createBattlePresentation({ engineCtx: { scene: { add() {} }, anisotropy: 1 }, game,
    bus: { emit(type, payload) { events.push({ type, payload }); } }, createTankVisual: fakeVisual,
    prepareVisualTextures: async () => {}, camoFor: () => 'factory', clock: () => 1000 });
  await presentation.applyRoster([
    { entityId: 1, seat: 0, team: TEAM.ALPHA, bot: false, connected: true, playerId: 'me', name: 'Me', specId: 'gepard_1a2' },
    { entityId: 2, seat: 1, team: TEAM.BRAVO, bot: false, connected: true, playerId: 'foe', name: 'Foe', specId: 'gepard_1a2' },
  ], { ownEntityId: 1, ownPlayerId: 'me', roomId: 'r', mapId: 'verdant', mode: 'standard', rulesetJson: '{}' });
  const ownState = createTankState(gepard, new Vector3(0, 1, 0), 0);
  const foeSample = () => Object.assign(createEntitySample(2), { x: 40, y: 1, z: 40, hp: 900, maxHp: 900, ammo0: 40, ammo1: 600 });
  const frame = (tick, predictedShot = null) => ({
    tick, renderTimeMs: 2000 + tick, entities: [foeSample()], shells: [],
    meta: { phase: PHASE.PLAYING, countdownMs: 0, battleTimeMs: 12_500, verdict: VERDICT.NONE, verdictReason: '', destructibleRevision: 0 },
    modeStateJson: null, destroyed: [], destructibleRevision: 0,
    viewer: { entityId: 1, playerId: 'me', state: ownState,
      row: { ...zeroEntityRow(1), x: quantizePosition(0), y: 1000, z: quantizePosition(0), hp: 900, maxHp: 900, reload: 0, reloadTotal: 350,
        magazineRounds: 0, magazineCapacity: 0, ammo0: 40, ammo1: 600, ammo2: 0, flags: 0 },
      viewer: { entityId: 1, modules: new Array(15).fill(0), crewBits: 0, equipment: [1000, 1000, 1000, 1000], modeSpeedMultiplier: 1000,
        modeGravityScale: 1000, movementVersion: 0, movementFlags: 0, movementValues: [] },
      authorityTick: tick - 2, authorityReceivedAtMs: 990, predictedShot },
    events: [], ownShots: [], extrapolatedMs: 0, phase: 'live',
  });
  presentation.applyFrame(frame(140));
  const own = presentation.ownActor, foe = presentation.actors.get('foe');
  const predictedKicks = [], confirmedMouths = [];
  gepardShots.forEach((shot, n) => {
    presentation.applyFrame(frame(142 + n * 2, { fireSeq: n + 1, shellSlot: 0, confirmed: false }));
    predictedKicks.push(kicks.get(own.visual).at(-1));
    presentation.applyEvent({ kind: 'shell_fired', payload: { shellId: 500 + n, shooterId: 'me', fireIntentSeq: n + 1, shellSlot: 0,
      shellType: shot.shellType, shellName: shot.shellName, muzzleIndex: shot.muzzleIndex, caliberMm: 35, velocityMps: 1385,
      x: shot.x, y: shot.y, z: shot.z, dx: 0, dy: 0, dz: 1 } }, { own: true, feedbackPredicted: true });
    const fired = events.filter((event) => event.type === 'shell:fired').at(-1).payload;
    confirmedMouths.push([fired.muzzleIndex, fired.muzzlePos[0]]);
  });
  assert.deepEqual(predictedKicks, gepardShots.map((shot) => shot.muzzleIndex),
    'the own seat\'s predicted kick is the barrel the authority names next');
  assert.deepEqual(confirmedMouths, gepardShots.map((shot) => [shot.muzzleIndex, 100 + shot.muzzleIndex]),
    'a confirmed shot flashes at the mouth the authority names');
  presentation.applyEvent({ kind: 'shell_fired', payload: { shellId: 600, shooterId: 'foe', shellType: gepardShots[1].shellType,
    shellName: gepardShots[1].shellName, muzzleIndex: 1, caliberMm: 35, velocityMps: 1385, x: 40, y: 3, z: 40, dx: 0, dy: 0, dz: 1 } },
  { own: false, feedbackPredicted: false });
  assert.deepEqual(kicks.get(foe.visual), [1], 'a remote shooter\'s visual kicks the barrel the authority names, not its own turn');
  assert.equal(events.filter((event) => event.type === 'shell:fired').at(-1).payload.muzzleIndex, 1);
  presentation.dispose();
}

// ---- one writer of the barrel cursor ---------------------------------------------------------------------------------
{
  // the solo step's shot asks the same owner (its battle is twinMuzzleSolo.selftest, MANUAL 'sims'; here, the wiring)
  assert.match(readFileSync(new URL('../game/state.ts', import.meta.url), 'utf8'),
    /muzzleIndex = nextCannonMuzzle\(entity\.spec\.gun, shell, entity\.combat\);/, 'the solo step\'s shot asks the barrel owner');
  // a write in any shape: `x.muzzleCursor = | += | -= | *= ...`, `x.muzzleCursor++ / --`, `++x.muzzleCursor`, and an object
  // literal or Object.assign naming the field (`{ muzzleCursor: n }`, `{ muzzleCursor }`); a read (`?? 0`, `===`) is none
  const WRITE = [/\.muzzleCursor\s*(?:(?:[-+*\/%&|^]|\*\*|<<|>>>?|&&|\|\||\?\?)?=(?!=)|\+\+|--)/, /(?:\+\+|--)\s*[\w$.?\]\[]*\.muzzleCursor\b/,
    /[{,]\s*muzzleCursor\s*[:,}]/];
  const writesCursor = (source) => WRITE.some((pattern) => pattern.test(source));
  for (const [plant, expected] of [['c.muzzleCursor = 1', true], ['c.muzzleCursor += 1', true], ['c.muzzleCursor++', true],
    ['--c.muzzleCursor', true], ['Object.assign(c, { muzzleCursor: 2 })', true], ['({ id, muzzleCursor })', true],
    ['c.muzzleCursor ??= 0', true], ['c.muzzleCursor ?? 0', false], ['c.muzzleCursor === 1', false], ['f(c.muzzleCursor, 1)', false]]) {
    assert.equal(writesCursor(plant), expected, `the census reads \`${plant}\` as ${expected ? 'a write' : 'a read'}`);
  }
  const root = fileURLToPath(new URL('../', import.meta.url));
  const writers = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const file = join(dir, name);
      if (statSync(file).isDirectory()) { walk(file); continue; }
      if (!file.endsWith('.ts')) continue;
      if (writesCursor(readFileSync(file, 'utf8'))) writers.push(file.slice(root.length));
    }
  };
  walk(root);
  assert.deepEqual(writers.sort(), ['mp/presentation/battlePresentation.ts', 'sim/launcherPolicy.ts'],
    'the selector moves a hull\'s barrel cursor; a network screen only mirrors the authority\'s');
}

console.log('twinMuzzleParity.selftest: the authority names and fires gepard_1a2 mouths 0, 1, 0 from its bores (within 1 cm); a '
  + 'missile keeps its tube and the cannons\' turn; the network screens kick and flash the named barrel; one cursor writer PASS');
process.exit(0);
