// Twin cannons: one barrel owner (round 8 Y1 s5-01; sim/launcherPolicy.ts nextCannonMuzzle). Which of a gun's own mouths a
// round leaves was three owners' call: the solo step alternated its own cursor and fired from the visual's mouth, the
// authority kept none (every round left the gun's centre line, shell_fired named mouth -1), and each network screen
// alternated its visual's cursor, so on a twin air-defence cannon (gepard_1a2: bores 0.96 m either side of the trunnion)
// the flash, the sabot petals and the kill-cam trajectory started on an outer barrel while the round left from between
// the guns, solo and online fired from origins 1-1.2 m apart, and the own seat's predicted kick always took barrel 1.
// Now both drivers ask one selector at the shot and the authority offsets the round to that mouth and names it; the
// network screens kick and flash the barrel it names, the own seat's prediction the barrel it will name next.
// - the authority (the real fire path, seeded on verdant): a gepard_1a2's rounds name mouths 0, 1, 0, and each leaves its
//   mouth (the profile's own data: trunnion, bores, mouth plane, in the turret frame at the shot, within 1 cm) with the gun
//   laid steep (round 8 Y1 residual: at the old near-level lay, 0.003 rad, the mouth's pitch terms moved the origin by
//   0.04 cm, so an unpitched or sign-flipped mouth passed; at ~0.68 rad they move it ~10 cm); its life ends, the mode
//   revives it, and the new life's rounds name mouths 0, 1, 0 again (a fresh combat state: reviveForMode);
// - a twin cannon with missiles (tunguska_m): each missile takes the next launcher tube (0, then 1) and leaves the cannons'
//   alternation alone;
//   aft10's canisters are launcher tubes (launcherMuzzles), so the launcher rule names them as before;
// - the solo step (setupBattle, simStep) asks the same selector: the same mouths in the same order (a battle on the page's
//   step: src/game/twinMuzzleSolo.selftest.mjs, MANUAL 'sims'; this file reads the authority's fleet only, so it costs a
//   few seconds on every npm test);
// - the network presentation: the own seat's predicted kick is the mouth the authority names next, a confirmed shot
//   flashes at the mouth it names, a remote shooter's visual kicks the named barrel; within a life the barrel and launcher
//   mirrors follow the authority's cursors (a second missile kicks tube 1), and across the own hull's death and revive and
//   a battle restart they begin each life where the authority's cursors do (round 8 Y1 residual), and a mode_respawn
//   released after the new life's first round leaves the mirror on that round;
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
import { ENTITY_FLAGS, PHASE, TEAM, VERDICT, quantizePosition, zeroEntityRow } from '../mp/wire/index.ts';
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

/**
 * An authority with one shooter (and a far target), stepped at `aimPitch` with the trigger held from tick `fireFrom`: its
 * shots, each with its pose then. `afterTick(shooter, fired)` runs after each tick; `respawns` collects the shooter's
 * mode_respawn ticks.
 */
function authorityShots(specId, shots, { slots = () => 0, aimPitch = 0.02, fireFrom = 1, gameMode, afterTick, respawns } = {}) {
  const match = createAuthoritativeMatch({ mapId: 'verdant', seed: 9, countdownS: 0, ...(gameMode ? { gameMode } : {}), players: [
    { id: 'aa', specId, team: 'alpha', spawn: { x: 0, z: -50, yaw: 0 } },
    { id: 'far', specId: 'm1a1_abrams_hc', team: 'bravo', spawn: { x: 0, z: 350, yaw: Math.PI } },
  ] });
  match.onMatchReady();
  const shooter = match.entityById.get('aa');
  const fired = [];
  for (let tick = 1; tick <= 3000 && fired.length < shots; tick++) {
    const input = { throttle: 0, steer: 0, brake: true, fire: tick >= fireFrom, aimYaw: 0, aimPitch, shellSlot: slots(fired.length) };
    match.step({ dt: 1 / 60, tick, inputs: new Map([['aa', input]]) });
    const snapshot = match.snapshot({ tick, serverTimeMs: tick * 1000 / 60, viewerId: 'aa', ackInputSeq: tick });
    for (const event of snapshot.events) {
      if (event.type === 'mode_respawn' && event.id === 'aa') respawns?.push(tick);
      if (event.type !== 'shell_fired' || event.shooterId !== 'aa') continue;
      // the shot's pose: a shot only changes the hull's rates, and nothing after the weapons in the step moves it
      fired.push({ ...event, local: turretLocal(shooter, event.x, event.y, event.z), gunPitch: shooter.state.gunPitch,
        cursor: shooter.combat.muzzleCursor ?? 0 });
    }
    match.afterSnapshotBroadcast();
    afterTick?.(shooter, fired);
  }
  assert.equal(fired.length, shots, `${specId} fired ${shots} rounds`);
  return fired;
}

// ---- the authority: a gepard_1a2's rounds leave its two bores in turn, the gun laid steep; a new life starts at mouth 0 --
const gepard = getSpec('gepard_1a2');
assert.deepEqual([gepard.armor.gunPivot, gepard.armor.gunBarrel.lengthM, gepard.gun.muzzles.map((m) => [m.x, m.y])],
  [[...GEPARD_TRUNNION], GEPARD_MUZZLE_Z, [[-GEPARD_BORE.x, GEPARD_BORE.y], [GEPARD_BORE.x, GEPARD_BORE.y]]],
  'the spec seats the profile\'s trunnion, mouth plane and bores');
// Zone control revives a dead hull at its spawn (ruleset respawnS). The gun lays toward 0.7 rad for 240 ticks before the
// trigger; three rounds; then the hull's life ends (its hit points written to 0, as hullLifeParity.selftest does: the
// mode's own death and revive follow) with the trigger still held, so the new life fires as soon as it can.
const gepardRespawns = [];
let gepardLifeEnded = false;
const gepardRounds = authorityShots('gepard_1a2', 6, { gameMode: 'zone_control', aimPitch: 0.7, fireFrom: 240, respawns: gepardRespawns,
  afterTick(shooter, fired) {
    if (gepardLifeEnded || fired.length < 3) return;
    shooter.combat.hp = 0;
    shooter.combat.destroyed = true;
    gepardLifeEnded = true;
  } });
const gepardShots = gepardRounds.slice(0, 3), gepardNewLife = gepardRounds.slice(3);
assert.equal(gepardRespawns.length, 1, 'the mode revived the gepard once, between its third and fourth rounds');
assert.deepEqual(gepardShots.map((shot) => shot.muzzleIndex), [0, 1, 0], 'the authority names the mouth each round leaves, in turn');
assert.deepEqual(gepardNewLife.map((shot) => shot.muzzleIndex), [0, 1, 0],
  'a new life\'s rounds start again at mouth 0 (the revive builds a fresh combat state: reviveForMode)');
for (const shot of gepardShots) {
  const bx = shot.muzzleIndex === 0 ? -GEPARD_BORE.x : GEPARD_BORE.x, by = GEPARD_BORE.y, p = shot.gunPitch;
  const expected = new Vector3(GEPARD_TRUNNION[0] + bx, GEPARD_TRUNNION[1] + by * Math.cos(p) + GEPARD_MUZZLE_Z * Math.sin(p),
    GEPARD_TRUNNION[2] - by * Math.sin(p) + GEPARD_MUZZLE_Z * Math.cos(p));
  // the lay is steep enough that the 1 cm check tells the pitched mouth from an unpitched one (the bore's height left
  // level: about 10 cm off here, 0.04 cm at a near-level lay)
  const unpitched = new Vector3(GEPARD_TRUNNION[0] + bx, GEPARD_TRUNNION[1] + by + GEPARD_MUZZLE_Z * Math.sin(p),
    GEPARD_TRUNNION[2] + GEPARD_MUZZLE_Z * Math.cos(p));
  assert.ok(p > 0.6 && expected.distanceTo(unpitched) > 0.05,
    `round ${shot.shellId} leaves with the gun laid steep (${p.toFixed(3)} rad; the pitched and unpitched mouths ${(expected.distanceTo(unpitched) * 100).toFixed(1)} cm apart)`);
  const miss = shot.local.distanceTo(expected);
  assert.ok(miss < 0.01, `round ${shot.shellId} leaves mouth ${shot.muzzleIndex} at (${bx}, ${by}, ${GEPARD_MUZZLE_Z}) on the gun pitched ${p.toFixed(3)} rad, `
    + `turret frame (${shot.local.toArray().map((v) => v.toFixed(3))}), ${(miss * 100).toFixed(1)} cm off`);
}
assert.ok(Math.abs(gepardShots[0].local.x - gepardShots[1].local.x) > 1.9, 'the two bores are 1.92 m apart across the turret');

// ---- a twin cannon with missiles: a missile takes a launcher tube and leaves the cannons' turn alone -------------------
let tunguskaShots;
{
  const tunguska = getSpec('tunguska_m');
  const missileSlot = tunguska.gun.shells.findIndex((shell) => shell.guided);
  assert.ok(missileSlot > 0, 'tunguska_m carries a guided round');
  // cannon, missile, cannon, missile (the second missile waits out the launcher's reload: about 160 ticks)
  const shots = authorityShots('tunguska_m', 4, { slots: (n) => (n % 2 === 1 ? missileSlot : 0) });
  tunguskaShots = shots;
  assert.deepEqual(shots.map((shot) => [shot.shellSlot, shot.muzzleIndex]), [[0, 0], [missileSlot, 0], [0, 1], [missileSlot, 1]],
    'cannon round from mouth 0, the missile from tube 0, the next cannon round from mouth 1, the next missile from tube 1');
  assert.deepEqual(shots.map((shot) => shot.cursor), [1, 1, 2, 2], 'the missiles left the cannons\' cursor where it was');
  // aft10's eight canisters are launcher tubes: the launcher rule names them, the cannons' cursor never moves
  const aft10 = authorityShots('aft10', 2);
  assert.ok(getSpec('aft10').gun.launcherMuzzles?.length === 8, 'aft10 seats its canisters as launcher tubes');
  assert.deepEqual(aft10.map((shot) => [shot.muzzleIndex, shot.cursor]), [[0, 0], [1, 0]], 'aft10\'s missiles leave tubes 0 and 1');
}

// ---- the network presentation: the barrel the authority names --------------------------------------------------------
/**
 * The page's network presentation for an own `specId` seat and a remote gepard, with fake visuals that log each kick's
 * barrel; `frame` builds a frame whose own row is alive or a wreck, `predict` presents a predicted shot of `slot` and
 * returns the barrel it kicked, `confirm` presents the authority's shell_fired for one of the own seat's rounds.
 */
async function presentationOf(specId) {
  const kicks = new Map(), events = [];
  const fakeVisual = () => {
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
    { entityId: 1, seat: 0, team: TEAM.ALPHA, bot: false, connected: true, playerId: 'me', name: 'Me', specId },
    { entityId: 2, seat: 1, team: TEAM.BRAVO, bot: false, connected: true, playerId: 'foe', name: 'Foe', specId: 'gepard_1a2' },
  ], { ownEntityId: 1, ownPlayerId: 'me', roomId: 'r', mapId: 'verdant', mode: 'standard', rulesetJson: '{}' });
  const ownState = createTankState(getSpec(specId), new Vector3(0, 1, 0), 0);
  const foeSample = () => Object.assign(createEntitySample(2), { x: 40, y: 1, z: 40, hp: 900, maxHp: 900, ammo0: 40, ammo1: 600 });
  let tick = 140, fireSeq = 0, shellId = 500;
  const frame = ({ predictedShot = null, wreck = false, battleRestarts = 0 } = {}) => ({
    tick: tick += 2, renderTimeMs: 2000 + tick, entities: [foeSample()], shells: [], battleRestarts,
    meta: { phase: PHASE.PLAYING, countdownMs: 0, battleTimeMs: 12_500, verdict: VERDICT.NONE, verdictReason: '', destructibleRevision: 0 },
    modeStateJson: null, destroyed: [], destructibleRevision: 0,
    viewer: { entityId: 1, playerId: 'me', state: ownState,
      row: { ...zeroEntityRow(1), x: quantizePosition(0), y: 1000, z: quantizePosition(0), hp: wreck ? 0 : 900, maxHp: 900, reload: 0,
        reloadTotal: 350, magazineRounds: 0, magazineCapacity: 0, ammo0: 40, ammo1: 600, ammo2: 8, flags: wreck ? ENTITY_FLAGS.DESTROYED : 0 },
      viewer: { entityId: 1, modules: new Array(15).fill(0), crewBits: 0, equipment: [1000, 1000, 1000, 1000], modeSpeedMultiplier: 1000,
        modeGravityScale: 1000, movementVersion: 0, movementFlags: 0, movementValues: [] },
      authorityTick: tick - 2, authorityReceivedAtMs: 990, predictedShot },
    events: [], ownShots: [], extrapolatedMs: 0, phase: 'live',
  });
  presentation.applyFrame(frame());
  const own = presentation.ownActor;
  /** A predicted shot of the own seat; returns the barrel or tube its kick took (the call must kick exactly once). */
  const predict = (slot = 0, options = {}) => {
    // the visual logs a kick only when the prediction reaches recoilKick (a confirmed own round logs none), so a shot that
    // kicked nothing would read as the previous kick's barrel: count this call's kick (review residual r1)
    const log = kicks.get(own.visual), before = log.length;
    presentation.applyFrame(frame({ ...options, predictedShot: { fireSeq: ++fireSeq, shellSlot: slot, confirmed: false } }));
    assert.equal(log.length, before + 1, `the own seat's predicted shot ${fireSeq} (slot ${slot}) kicked one barrel or tube`);
    return log.at(-1);
  };
  /** The authority's shell_fired for an own round; returns the mouth its flash took, or null where it was not presented. */
  const confirm = (shot) => {
    const before = events.length;
    presentation.applyEvent({ kind: 'shell_fired', payload: { shellId: shellId++, shooterId: 'me', fireIntentSeq: fireSeq,
      shellSlot: shot.shellSlot, shellType: shot.shellType, shellName: shot.shellName, muzzleIndex: shot.muzzleIndex, caliberMm: 35,
      velocityMps: 1385, x: shot.x, y: shot.y, z: shot.z, dx: 0, dy: 0, dz: 1 } }, { own: true, feedbackPredicted: true });
    const fired = events.slice(before).find((event) => event.type === 'shell:fired')?.payload;
    return fired ? [fired.muzzleIndex, fired.muzzlePos[0]] : null;
  };
  // the host's frames as they reach this seat: the own rows and the own rounds come at once, any other event waits for
  // the render tick (mp/match/events.ts), so a mode_respawn is presented after the new life's first frames and rounds
  const respawn = () => presentation.applyEvent({ kind: 'mode_respawn', payload: { id: 'me', team: 'alpha' } }, { own: false, feedbackPredicted: false });
  /** The own hull's death: the frame whose row first shows the wreck (`trade`: an old-life round confirmed with it), then one more. */
  const die = (trade = null) => {
    presentation.applyFrame(frame({ wreck: true }));
    if (trade) assert.equal(confirm(trade), null, 'a round confirmed while the own row shows the wreck is not presented');
    presentation.applyFrame(frame({ wreck: true }));
  };
  return { presentation, own, kicks, events, frame, predict, confirm, respawn, die };
}

{
  const { presentation, kicks, events, predict, confirm, respawn, die } = await presentationOf('gepard_1a2');
  const foe = presentation.actors.get('foe');
  const [old0, old1, old2] = gepardShots, [new0, new1, new2] = gepardNewLife;
  const kicked = [], expected = [], flashes = [];
  /** A predicted shot, then the authority's round it became: the kick must be the barrel that round leaves. */
  const shoot = (round, options) => {
    kicked.push(predict(0, options));
    expected.push(round.muzzleIndex);
    flashes.push(confirm(round));
  };
  // life 1: three rounds (the mirror leaves it at mouth 1); its death comes with one more round of its own (a trade: the
  // host sends a round's event before the snapshot that shows the death, so both can reach one frame, where the frame's
  // rows are presented before its own rounds: mp/presentation/adapter.ts)
  shoot(old0); shoot(old1); shoot(old2);
  die(old1);
  // life 2: its first round leaves mouth 0, predicted before the mode_respawn is presented
  shoot(new0); respawn(); shoot(new1);
  // life 2 dies with a trade round from mouth 0 (an old life's last round must not survive into the next)
  die(new2);
  // life 3, the trigger untouched through the revive
  shoot(new0); respawn(); shoot(new1); shoot(new2);
  // life 3 dies; life 4 fires as soon as it can, its first round reaching this seat before the row that shows it alive
  // (the host sends the round's event before the next snapshot): the round is not presented, but the mirror counts it
  die();
  assert.equal(confirm(new0), null, 'the new life\'s first round, ahead of its row, is not presented');
  shoot(new1); respawn(); shoot(new2);
  // a battle restart: the host builds every hull anew, so the restarted battle's first round leaves mouth 0, as this
  // match's first did (the mirror stood at mouth 1)
  kicked.push(predict(0, { battleRestarts: 1 }));
  expected.push(old0.muzzleIndex);
  assert.deepEqual(kicked.slice(0, 3), expected.slice(0, 3), 'the own seat\'s predicted kick is the barrel the authority names next');
  assert.deepEqual(kicked, expected, 'the own seat\'s predicted kick is the barrel the authority names next, through three deaths '
    + '(life 2 after a trade round, life 3 after one from mouth 0, life 4 whose first round came ahead of its row; the mode_respawn '
    + 'presented after each new life\'s first round) and a battle restart');
  assert.deepEqual(flashes, kicked.slice(0, -1).map((_, n) => [expected[n], 100 + expected[n]]),
    'a confirmed shot flashes at the mouth the authority names');
  presentation.applyEvent({ kind: 'shell_fired', payload: { shellId: 600, shooterId: 'foe', shellType: old1.shellType,
    shellName: old1.shellName, muzzleIndex: 1, caliberMm: 35, velocityMps: 1385, x: 40, y: 3, z: 40, dx: 0, dy: 0, dz: 1 } },
  { own: false, feedbackPredicted: false });
  assert.deepEqual(kicks.get(foe.visual), [1], 'a remote shooter\'s visual kicks the barrel the authority names, not its own turn');
  assert.equal(events.filter((event) => event.type === 'shell:fired').at(-1).payload.muzzleIndex, 1);
  presentation.dispose();
}

// ---- the own seat's launcher mirror within a life, across a life and a restart (tunguska_m's missiles) ----------------
{
  // the authority's two missiles of one life (the tunguska run above): tube 0, then tube 1
  const missile = tunguskaShots[1], second = tunguskaShots[3], missileSlot = missile.shellSlot;
  assert.deepEqual([missile.muzzleIndex, second.muzzleIndex, second.shellSlot], [0, 1, missileSlot],
    'a fresh life\'s first missile leaves tube 0 and its second tube 1 (the tunguska run above)');
  assert.ok(getSpec('tunguska_m').gun.launcherMuzzles.length > 2, 'tunguska_m has more than two tubes (tube 2 is not tube 0)');
  const { presentation, predict, confirm, respawn, die } = await presentationOf('tunguska_m');
  // life 1: two missiles; the mirror follows each (the second kicks tube 1) and stands at tube 2 at the death (review
  // residual r2: with one missile a life, a mirror that never followed the launcher kicked tube 0 every time and passed)
  const kicked = [predict(missileSlot)];
  const flashes = [confirm(missile)];
  kicked.push(predict(missileSlot));
  flashes.push(confirm(second));
  assert.deepEqual(flashes, [[0, 100], [1, 101]], 'the own seat\'s confirmed missiles flash at the tubes the authority names');
  die();
  kicked.push(predict(missileSlot));
  respawn();
  confirm(missile);
  kicked.push(predict(missileSlot, { battleRestarts: 1 }));
  assert.deepEqual(kicked, [0, 1, 0, 0], 'the own seat\'s predicted missile kicks the tube the authority names next: tube 1 after '
    + 'a missile within a life, then tube 0 at a fresh life and after a battle restart (its launcher mirror, at tube 2 after '
    + 'two missiles and at tube 1 after one, begins each life where the authority\'s cursor does)');
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

console.log('twinMuzzleParity.selftest: the authority names and fires gepard_1a2 mouths 0, 1, 0 from its bores (within 1 cm, the gun '
  + 'laid steep), and 0, 1, 0 again after a revive; missiles take tubes 0, 1 and keep the cannons\' turn; the network screens kick and '
  + 'flash the named barrel, the own seat\'s mirrors follow within a life and begin each life and restart where the authority\'s '
  + 'cursors do; one cursor writer PASS');
process.exit(0);
