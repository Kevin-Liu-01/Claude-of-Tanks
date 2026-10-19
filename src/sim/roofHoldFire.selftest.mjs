// Roof guns hold fire where their rounds cannot hurt (owner, 2026-10-19). VH.14's balance rule judged a target as a
// whole at selection (defeatableShare: a quarter of the presented main armour defeatable) and the station then laid
// on the hull's centre, so a quartering BMP-2 or Leopard 1 took 12.7 and 30 mm rounds on a front they cannot defeat.
// Now every round is judged where it lands — along the line it leaves on from the muzzle, with its drop, against the
// real armour stack (sim/armor.ts queryAimArmor) priced by the damage model (sim/damage.ts estimatePenRatio) — and a
// refused round is not fired: the station lays on a flank plate it defeats, or holds that target and takes the next
// one it can hurt. Wrecks and seen hulls in the line, a nearest target past the station's lay and a drone past its
// elevation no longer take or hold a station's fire; drones in reach are still engaged. The oracle here traces each
// fired round independently of the station (its muzzle, its bore, its drop to every hull near the line).
//
// Cases 1-7 fail on the pre-change module (2026-10-19): 22 K6 rounds wasted at each of a BMP-2's 130/140/150 degree
// aspects and 12 30 mm rounds on its front at 0 and 30 degrees, rounds on the turning BMP-2's front, the 30 mm on a
// quartering Leopard 1's front, rounds into a wreck in the line, a 30 mm idle under an unlayable nearest target, a
// station idle under an overhead drone, the Abrams's 12.7 on a BMP-2's front. Cases 8 (a pillbox in the line) and 9
// (host and solo, shot for shot) held before and must hold after.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { getSpec } from '../vehicles/specs.ts';
import { auxiliaryShot, roofStationCount, stepRoofGun, stepRoofStation } from './auxiliarySystems.ts';
import { queryAimArmor, tankPoseFromState } from './armor.ts';
import { estimatePenRatio, createCombatState } from './damage.ts';
import { shellGravityMps2 } from './ballistics.ts';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { matchRulesetFor } from './matchRuleset.ts';
import { createTankState, SIM_DT } from './movement.ts';
import { createGameState, createBus, simStep } from '../game/state.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';

await ensureAuthorityFleet(['k1e1', 'm551a1_tts', 'm1a1_abrams_hc', 'bmp2', 'leo1a5']);
const DEG = Math.PI / 180;
/** A vehicle at (x, z) whose front faces the origin turned `aspectDeg` (0: head-on to a shooter at the origin). */
function vehicle(id, specId, team, x, z, aspectDeg = 0, extra = {}) {
  const spec = getSpec(specId);
  return { id, team, specId, spec, state: { pos: { x, y: 0, z }, yaw: Math.atan2(-x, -z) + aspectDeg * DEG, turretYaw: 0, ...extra.state },
    combat: { modules: {}, ...extra.combat }, ...extra.entity };
}
const soft = (id, team, x, y, z) => ({ id, team, spec: { id: 'target', dims: { heightM: 2.5 } }, state: { pos: { x, y, z }, yaw: 0, turretYaw: 0 }, combat: {} });

const oracleRay = new Vector3(), oracleEnd = new Vector3(), oracleTo = new Vector3(), oraclePose = { pos: new Vector3() };
/** Where the round just fired (auxiliaryShot) lands: the first hull along its flight and whether the round's nominal
 * penetration defeats the armour it meets there (a wreck or a friend is never a hurt). */
function landing(entities, shooter) {
  const o = auxiliaryShot.origin, d = auxiliaryShot.direction, shell = auxiliaryShot.shell;
  let best = null;
  for (const other of entities) {
    if (other === shooter || !other.spec.armor) continue;
    oracleTo.set(other.state.pos.x, other.state.pos.y + other.spec.dims.heightM / 2, other.state.pos.z).sub(o);
    const along = oracleTo.dot(d);
    if (along < 0 || oracleTo.addScaledVector(d, -along).length() > 9) continue;
    const t = along / shell.velocityMps;
    oracleEnd.copy(o).addScaledVector(d, along); oracleEnd.y -= .5 * shellGravityMps2(shell) * t * t;
    oracleRay.copy(oracleEnd).sub(o);
    const length = oracleRay.length();
    oracleRay.multiplyScalar(1 / length);
    const s = other.state;
    const pose = tankPoseFromState({ pos: new Vector3(s.pos.x, s.pos.y, s.pos.z), yaw: s.yaw, turretYaw: s.turretYaw, visualPitch: 0, visualRoll: 0, gunPitch: 0 }, oraclePose);
    const info = queryAimArmor(o, oracleRay, length + 12, pose, other.spec.armor, other.combat.eraSpent);
    if (info && (!best || info.distM < best.info.distM)) best = { other, info };
  }
  if (!best) return { id: null, hurts: false };
  const hurts = !best.other.combat.destroyed && best.other.team !== shooter.team && estimatePenRatio(shell, best.info.distM, best.info) >= 1;
  return { id: best.other.id, hurts };
}
/** Steps every station of `shooter` for `seconds`; each fired round's station, landing and calibre. `each(tick)` moves
 * the scene first. */
function battle(shooter, entities, seconds = 8, each = () => {}, context = {}) {
  const ctx = { entities, visible: () => true, clear: () => true, ...context };
  const stations = roofStationCount(shooter.spec), rounds = [];
  for (let tick = 0; tick < seconds * 60; tick++) {
    each(tick);
    for (let station = 0; station < stations; station++) {
      const fired = station ? stepRoofStation(shooter, station, tick / 60, 1 / 60, ctx) : stepRoofGun(shooter, tick / 60, 1 / 60, ctx);
      if (fired) rounds.push({ station, tick, caliber: auxiliaryShot.shell.caliberMm, ...landing(entities, shooter) });
    }
  }
  return rounds;
}
const wasted = (rounds) => rounds.filter((round) => !round.hurts && round.id !== 'drone');
const count = (rounds, f) => rounds.filter(f).length;

// 1. Where: the K1's K6 (station 0) and M60 (station 1) and the TTS's 30 mm (0) and M2 (1) on a lone BMP-2 at 100 m.
//    At 50 and 130 degrees the line to its centre meets armour the 12.7 cannot defeat (the share rule engaged it); at
//    140 and 150 the K6 lays on the flank plate it does defeat; the 30 mm holds on its front head-on.
{
  for (const [shooterId, aspects] of [['k1e1', [50, 130, 140, 150]], ['m551a1_tts', [0, 30, 130, 140]]]) {
    for (const aspect of aspects) {
      const shooter = vehicle('s', shooterId, 'blue', 0, 0, 0, { state: { yaw: 0 } }), target = vehicle('t', 'bmp2', 'red', 0, 100, aspect);
      shooter.state.yaw = 0;
      const rounds = battle(shooter, [shooter, target]);
      assert.deepEqual(wasted(rounds), [], `${shooterId} on a BMP-2 at ${aspect} degrees: no round where it cannot hurt`);
      if (shooterId === 'k1e1' && aspect >= 140) assert.ok(count(rounds, (r) => r.station === 0 && r.hurts) >= 15, `the K6 lays on the BMP-2's flank at ${aspect} degrees (${rounds.length})`);
    }
  }
}
// 2. A target turning its front mid-burst: a BMP-2 at 100 m swings from rear-on through its flank to head-on at 25
//    degrees a second. The K6 and the TTS's two stations fire while a face they defeat is turned to them, every round
//    where it hurts, and stop as the front comes round.
for (const shooterId of ['k1e1', 'm551a1_tts']) {
  const shooter = vehicle('s', shooterId, 'blue', 0, 0), target = vehicle('t', 'bmp2', 'red', 20, 110, 180);
  shooter.state.yaw = 0;
  const start = target.state.yaw;
  const rounds = battle(shooter, [shooter, target], 8, (tick) => { target.state.yaw = start - 25 * DEG * tick / 60; });
  assert.ok(count(rounds, (r) => r.hurts) >= 9, `${shooterId}: rounds into the turning BMP-2 while it shows a face they defeat (${rounds.length})`);
  assert.deepEqual(wasted(rounds), [], `${shooterId}: no round lands on a face it cannot defeat as the BMP-2 turns`);
  const late = rounds.filter((r) => r.tick > 7.2 * 60 && r.caliber < 20);
  assert.equal(late.length, 0, `${shooterId}: the 12.7 holds once the BMP-2's front faces it`);
}
// 3. An MBT's front at range against a light IFV's side: a Leopard 1A5 at 120 m quartering 35 degrees (the share rule
//    put the TTS's 30 mm on its front) and a BMP-2 side-on at 200 m. The M2 puts its rounds into the BMP-2's side, the
//    30 mm into the Leopard's flank or the BMP-2, and no round lands where it cannot hurt.
{
  const shooter = vehicle('s', 'm551a1_tts', 'blue', 0, 0), mbt = vehicle('mbt', 'leo1a5', 'red', 0, 120, 35), ifv = vehicle('ifv', 'bmp2', 'red', -60, 190, 90);
  shooter.state.yaw = 0;
  const rounds = battle(shooter, [shooter, mbt, ifv], 10);
  assert.deepEqual(wasted(rounds), [], 'no round on the Leopard\'s front');
  assert.ok(count(rounds, (r) => r.station === 1 && r.id === 'ifv' && r.hurts) >= 10, `the M2 engages the BMP-2's side (${count(rounds, (r) => r.station === 1)})`);
  assert.ok(count(rounds, (r) => r.station === 0 && r.hurts) >= 6, `the 30 mm still fires where it hurts (${count(rounds, (r) => r.station === 0)})`);
}
// 4. A wreck in the line (inert cover: sim/damage.ts resolveWreckHit) and a seen MBT hull in the line: the station
//    holds on the BMP-2 behind them and takes the BMP-2 it has a clear lane to.
{
  const shooter = vehicle('s', 'k1e1', 'blue', 0, 0), behind = vehicle('behind', 'bmp2', 'red', 0, 150, 90);
  const wreck = vehicle('wreck', 'bmp2', 'red', 0, 75, 90, { combat: { destroyed: true } }), clear = vehicle('clear', 'bmp2', 'red', 80, 150, 90);
  shooter.state.yaw = 0;
  const rounds = battle(shooter, [shooter, wreck, behind, clear]);
  assert.equal(count(rounds, (r) => r.id === 'wreck' || r.id === 'behind'), 0, 'no round into the wreck in the line');
  assert.ok(count(rounds, (r) => r.id === 'clear' && r.hurts) >= 15, `the K6 takes the BMP-2 it has a lane to (${rounds.length})`);
  const mbt = vehicle('mbt', 'm1a1_abrams_hc', 'red', 0, 75, 0), again = vehicle('s2', 'k1e1', 'blue', 0, 0), behind2 = vehicle('behind', 'bmp2', 'red', 0, 150, 90);
  again.state.yaw = 0;
  assert.equal(count(battle(again, [again, mbt, behind2]), (r) => r.id === 'mbt' || r.id === 'behind'), 0, 'no round into a seen Abrams in the line');
}
// 5. A nearest target the station cannot lay on no longer idles it: under the TTS's 30 mm, 9 m ahead and low (its
//    turret-front depression table), and a target 150 m off to the left inside its arc: the 30 mm takes the far one.
{
  const shooter = vehicle('s', 'm551a1_tts', 'blue', 0, 0); shooter.state.yaw = 0;
  const near = soft('near', 'red', -.3, 0, 9), far = soft('far', 'red', -130, 0, 75);
  const rounds = battle(shooter, [shooter, near, far], 6);
  assert.ok(count(rounds, (r) => r.station === 0) >= 3, `the 30 mm engages the target it can lay on (${count(rounds, (r) => r.station === 0)})`);
}
// 6. Drones: one in reach is engaged before any vehicle (each round charged to the airframe); one overhead past the
//    station's elevation no longer holds the station off a vehicle; a round at a drone keeps the friendly corridor.
{
  const air = (x, y, z) => ({ id: 'carrier', team: 'red', spec: { id: 'target', dims: { heightM: 2.5 } }, state: { pos: { x: 400, y: 0, z: 400 }, yaw: 0, turretYaw: 0 }, combat: {},
    aerial: { kind: 'drone', active: true, launching: false, x, y, z } });
  let strikes = 0;
  const droneHit = () => { strikes++; };
  {
    const shooter = vehicle('s', 'k1e1', 'blue', 0, 0); shooter.state.yaw = 0;
    const rounds = battle(shooter, [shooter, air(20, 30, 80), soft('apc', 'red', 0, 0, 100)], 6, () => {}, { counterDrone: true, droneHit });
    assert.ok(rounds.length >= 10 && strikes === rounds.length, `the drone in reach is engaged (${rounds.length} rounds, ${strikes} charged)`);
  }
  {
    const shooter = vehicle('s', 'k1e1', 'blue', 0, 0); shooter.state.yaw = 0; strikes = 0;
    const rounds = battle(shooter, [shooter, air(0, 40, 3), soft('apc', 'red', 0, 0, 100)], 6, () => {}, { counterDrone: true, droneHit });
    assert.ok(rounds.length >= 10 && strikes === 0, `a drone overhead past the elevation leaves the K6 on the vehicle (${rounds.length})`);
  }
  {
    const shooter = vehicle('s', 'k1e1', 'blue', 0, 0); shooter.state.yaw = 0; strikes = 0;
    const ally = soft('ally', 'blue', 4.8, 0, 20);
    const rounds = battle(shooter, [shooter, ally, air(24, 4, 100)], 4, () => {}, { counterDrone: true, droneHit });
    assert.equal(rounds.length, 0, 'no round at a drone through an ally');
  }
}
// 7. Station 0 and every later station: the two-station Abrams (12.7 commander, 7.62 loader) and the K1 on a BMP-2
//    quartering at 140 degrees (its flank plates defeatable to the 12.7, nothing to the 7.62): each station judges its
//    own round.
for (const shooterId of ['m1a1_abrams_hc', 'k1e1']) {
  const shooter = vehicle('s', shooterId, 'blue', 0, 0), target = vehicle('t', 'bmp2', 'red', 0, 90, 140);
  shooter.state.yaw = 0;
  const rounds = battle(shooter, [shooter, target]);
  assert.equal(roofStationCount(shooter.spec), 2);
  assert.deepEqual(wasted(rounds), [], `${shooterId}: no station fires where it cannot hurt`);
  assert.ok(count(rounds, (r) => r.station === 0) > 0 && count(rounds, (r) => r.station === 1) === 0, `${shooterId}: the 12.7 fires, the 7.62 holds`);
}
// 8. A pillbox (fortified cover, world/collision.ts) between a station and the BMP-2 behind it, on Foundry's own
//    collision shard and the multiplayer host's authority: no round goes into the bunker; the BMP-2 driven clear of it
//    draws fire.
{
  const world = createDedicatedWorldCollision('foundry');
  const bunker = world.getObstacles().find((record) => record.kind === 'bunker');
  const cx = (bunker.min[0] + bunker.max[0]) / 2, cz = (bunker.min[2] + bunker.max[2]) / 2, ground = world.heightField.getHeightAt;
  const match = createAuthoritativeMatch({ mapId: 'foundry', seed: 3, countdownS: 0, worldCollision: world,
    ruleset: { ...matchRulesetFor('standard'), alwaysVisible: true },
    players: [{ id: 'k1', specId: 'k1e1', team: 'alpha', spawn: { x: cx - 30, z: cz, yaw: Math.PI / 2 } },
      { id: 'ifv', specId: 'bmp2', team: 'bravo', spawn: { x: cx + 14, z: cz, yaw: 0 } }] });
  match.onMatchReady();
  const k1 = match.entityById.get('k1'), ifv = match.entityById.get('ifv');
  const shots = () => k1.combat.auxiliary.shots;
  const place = (entity, x, z, yaw) => { entity.state.pos.set(x, ground(x, z), z); entity.state.yaw = yaw; entity.state.speed = 0; };
  const idle = { throttle: 0, steer: 0, brake: true, fire: false, shellSlot: 0, aimYaw: 0, aimPitch: 0, actionBits: 0, aimLocked: false, aimDistance: 300 };
  for (let tick = 0; tick < 300; tick++) {
    place(k1, cx - 30, cz, Math.PI / 2); place(ifv, cx + 14, cz, 0);
    match.step({ dt: SIM_DT, inputs: new Map([['k1', idle], ['ifv', idle]]) }); match.eventsForViewer('__audit__'); match.afterEventBroadcast();
  }
  const muzzle = new Vector3(cx - 30, ground(cx - 30, cz) + 2.6, cz), aim = new Vector3(cx + 14, ground(cx + 14, cz) + 1.2, cz);
  const ray = aim.clone().sub(muzzle), hit = world.raycast(muzzle, ray.clone().normalize(), ray.length());
  assert.equal(hit?.record?.kind, 'bunker', 'the pillbox stands in the line');
  assert.equal(shots(), 0, 'no roof round into the pillbox');
  for (let tick = 0; tick < 300; tick++) {
    place(k1, cx - 30, cz, Math.PI / 2); place(ifv, cx + 14, cz + 26, 0);
    match.step({ dt: SIM_DT, inputs: new Map([['k1', idle], ['ifv', idle]]) }); match.eventsForViewer('__audit__'); match.afterEventBroadcast();
  }
  assert.ok(shots() > 0, `the BMP-2 clear of the pillbox draws fire (${shots()})`);
  world.release?.();
}
// 9. Host and solo agree: the TTS against a turning BMP-2 and a quartering Leopard 1, stepped by the multiplayer host's
//    authority and by the solo battle (both read the same pure roof-station law), poses pinned and hulls kept whole each
//    tick: the same rounds from the same stations on the same ticks, and the same lays.
{
  const flat = { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) };
  const TICKS = 9 * 60;
  const pins = { tts: [0, 0, 'm551a1_tts'], ifv: [20, 110, 'bmp2'], mbt: [-40, 130, 'leo1a5'] };
  // every hull starts each tick from one fresh rest state (its springs, flinch and settle too: the rounds' knocks and
  // each authority's movement integration never reach the next tick's lay)
  const data = (value) => (value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, data(v)])) : value);
  const restore = (into, from) => { for (const [k, v] of Object.entries(from)) { if (v && typeof v === 'object' && into[k] && typeof into[k] === 'object') restore(into[k], v); else into[k] = v && typeof v === 'object' ? structuredClone(v) : v; } };
  const rest = Object.fromEntries(Object.entries(pins).map(([id, [x, z, specId]]) => [id, data(createTankState(getSpec(specId), new Vector3(x, 0, z), 0))]));
  const pin = (entity, tick) => {
    const [x, z] = pins[entity.id], s = entity.state;
    restore(s, rest[entity.id]);
    s.yaw = entity.id === 'tts' ? 0 : entity.id === 'ifv' ? Math.atan2(-x, -z) + Math.PI - 25 * DEG * tick / 60 : Math.atan2(-x, -z) + 35 * DEG;
    // the two authorities roll damage on their own streams: the hulls stay whole, so the roof law alone is compared
    const c = entity.combat; c.hp = c.maxHp; if (c.fire) c.fire.burning = false;
  };
  // the turrets held where they rest (an unlocked aim lays them on each authority's own aim point)
  const idle = () => ({ throttle: 0, steer: 0, brake: true, fire: false, shellSlot: 0, aimYaw: 0, aimPitch: 0, actionBits: 0, aimLocked: true, aimDistance: 300 });
  const lays = (entity) => { const a = entity.combat.auxiliary; return [a, ...(a.stations ?? [])].map((s) => [s.shots, s.gunYaw, s.gunPitch]); };
  const host = () => {
    const match = createAuthoritativeMatch({ mapId: 'verdant', seed: 5, countdownS: 0, ruleset: { ...matchRulesetFor('standard'), alwaysVisible: true },
      worldCollision: { mapId: 'verdant', heightField: flat, obstacles: [] },
      players: [{ id: 'tts', specId: 'm551a1_tts', team: 'alpha', spawn: { x: 0, z: 0, yaw: 0 } }, { id: 'ifv', specId: 'bmp2', team: 'bravo', spawn: { x: 20, z: 110, yaw: 0 } },
        { id: 'mbt', specId: 'leo1a5', team: 'bravo', spawn: { x: -40, z: 130, yaw: 0 } }] });
    match.onMatchReady();
    const entities = ['tts', 'ifv', 'mbt'].map((id) => match.entityById.get(id)), rows = [];
    for (let tick = 0; tick < TICKS; tick++) {
      for (const entity of entities) pin(entity, tick);
      match.step({ dt: SIM_DT, inputs: new Map(entities.map((entity) => [entity.id, idle()])) });
      match.eventsForViewer('__audit__'); match.afterEventBroadcast();
      rows.push(lays(entities[0]));
    }
    return rows;
  };
  const solo = () => {
    const game = createGameState();
    game.ruleset = { ...game.ruleset, alwaysVisible: true };
    game.spotting = { isSpotted: () => true, update: () => [], notifyFired() {} };
    game.phase = 'battle';
    const make = (id, specId, team) => { const spec = getSpec(specId); return { id, specId, spec, isPlayer: id === 'tts', team, state: createTankState(spec, new Vector3(), 0), combat: createCombatState(spec), input: idle() }; };
    game.tanks = [make('tts', 'm551a1_tts', 'player'), make('ifv', 'bmp2', 'enemy'), make('mbt', 'leo1a5', 'enemy')];
    game.allTanks = game.tanks; for (const entity of game.tanks) game.tankById.set(entity.id, entity);
    const bus = createBus(), collider = { setSelf() {}, collide() { return false; }, pendingCrush: [], pendingRams: [], queueRam() {} }, rows = [];
    for (let tick = 0; tick < TICKS; tick++) {
      for (const entity of game.tanks) pin(entity, tick);
      simStep(game, bus, { heightField: flat, raycast: () => null }, null, collider);
      rows.push(lays(game.tanks[0]));
    }
    return rows;
  };
  const a = host(), b = solo();
  const shotTicks = (rows, station) => rows.flatMap((row, tick) => (tick && row[station][0] > rows[tick - 1][station][0] ? [tick] : []));
  for (const station of [0, 1]) {
    assert.deepEqual(shotTicks(b, station), shotTicks(a, station), `station ${station}: host and solo fire on the same ticks`);
    assert.ok(shotTicks(a, station).length >= 6, `station ${station} fires (${shotTicks(a, station).length})`);
  }
  assert.deepEqual(b, a, 'host and solo lay every station alike on every tick, to the bit');
  console.log(`roofHoldFire: host and solo fire ${shotTicks(a, 0).length} 30 mm and ${shotTicks(a, 1).length} 12.7 rounds on the same ticks with the same lays`);
}
console.log('roofHoldFire: every roof round lands where it hurts (quartering and turning BMP-2s, a quartering Leopard 1 beside a side-on BMP-2, each station of the K1, TTS and Abrams); flanks laid on, wrecks and seen hulls in the line held, an unlayable nearest target and an overhead drone no longer idle a station; drones in reach engaged, never through an ally; a pillbox in the line draws nothing; host and solo agree shot for shot');
