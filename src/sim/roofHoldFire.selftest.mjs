// Roof guns hold fire where their rounds cannot hurt (owner, 2026-10-19). VH.14's balance rule judged a target as a
// whole at selection (defeatableShare: a quarter of the presented main armour defeatable) and the station then laid on
// the hull's centre, so a quartering BMP-2 or a head-on Hayate took 12.7 and 30 mm rounds on armour they cannot defeat.
// Now every round is judged where it lands — from the muzzle along the bore with its drop, against the target where it
// will stand when the round arrives, priced by the damage model's own walk over the pen roll, the modules it reaches and
// one ricochet (sim/damage.ts estimateHurtChance) — and a round with less than one chance in five to hurt is not fired:
// the station lays on the point of the target's faces where a round hurts, or holds the target and takes the next.
//
// The oracle here is the live damage model, not the station's estimate: every fired round is flown again GHOSTS times
// (sim/ballistics.ts stepShell; sim/armor.ts traceTank on each tick's swept segment against every hull, the targets
// carried along their heading at their speed; sim/damage.ts resolveShellHit with its own pen, damage and module rolls),
// and it hurts when the first hull it strikes is a live enemy that takes hull damage or a module hit. A round that hurts
// in under one flight in ten is wasted.
//
// On the pre-change module (integ/229, 2026-10-19) case 1 fails (the K6 on a BMP-2 150 degrees off, the TTS's 30 mm on
// a BMP-2 head-on and 30 degrees off and on a Hayate 30 degrees off, the Abrams's 12.7 on a BMP-2 at 140 degrees: every
// round wasted), case 2 (rounds on a turning BMP-2's front), case 3 (rounds into a wreck in the line),
// case 4 (a 30 mm idle under an unlayable nearest target), case 5 (a station idle under an overhead drone; rounds at a
// drone through an ally), case 6 (the Abrams's 12.7 on a quartering BMP-2's front). The cases marked GUARD held before
// and must hold after: a station still fires where the damage model lets its round hurt (a moving target, a track, a
// gun behind a glancing glacis), the pillbox, the same rounds twice, host and solo shot for shot.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { getSpec } from '../vehicles/specs.ts';
import { auxiliaryShot, roofStationCount, stepRoofGun, stepRoofStation } from './auxiliarySystems.ts';
import { traceTank } from './armor.ts';
import { createCombatState, resolveShellHit } from './damage.ts';
import { createShell, stepShell } from './ballistics.ts';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { matchRulesetFor } from './matchRuleset.ts';
import { createTankState, SIM_DT } from './movement.ts';
import { createGameState, createBus, simStep } from '../game/state.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';

const FLEET = ['k1e1', 'm551a1_tts', 'm1a1_abrams_hc', 'bmp2', 'leo1a5', 'amx10p_25', 'bmp3m_dragun125', 'cv9040c', 'hayate_ifv', 'm1a2_abrams'];
await ensureAuthorityFleet(FLEET);
const DEG = Math.PI / 180, GHOSTS = 16;
/** A vehicle at (x, z) whose front faces the origin turned `aspectDeg` (0: head-on to a shooter at the origin), whole
 * (createCombatState: every module at full hit points), driving at `speed` along its heading. */
function vehicle(id, specId, team, x, z, aspectDeg = 0, speed = 0) {
  const spec = getSpec(specId);
  return { id, team, specId, spec, state: { pos: { x, y: 0, z }, yaw: Math.atan2(-x, -z) + aspectDeg * DEG, turretYaw: 0, speed }, combat: createCombatState(spec) };
}
const soft = (id, team, x, y, z) => ({ id, team, spec: { id: 'target', dims: { heightM: 2.5 } }, state: { pos: { x, y, z }, yaw: 0, turretYaw: 0 }, combat: {} });

/** The ghosts' rolls: a fixed stream per flight. */
const stream = (seed) => { let value = seed >>> 0; return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; }; };
/** A hull's armour pose `t` seconds after the shot (carried along its heading at its speed). */
const poseAfter = (entity, t) => {
  const s = entity.state, travel = (s.speed ?? 0) * t;
  return { pos: new Vector3(s.pos.x + Math.sin(s.yaw) * travel, s.pos.y, s.pos.z + Math.cos(s.yaw) * travel), yaw: s.yaw, pitch: 0, roll: 0,
    turretYaw: s.turretYaw || 0, gunPitch: 0, modeScale: 1 };
};
/** The share of GHOSTS flights of a fired round that hurt: the live damage model, never the station's estimate. */
function realChance(round, shooter) {
  let hurt = 0;
  for (let flight = 0; flight < GHOSTS; flight++) {
    const rng = stream(0x9e3779b9 ^ (flight * 7919 + round.tick * 31));
    const shell = createShell(round.shell, shooter.id, false, round.origin, round.direction, flight);
    const hulls = round.scene.filter((e) => e.id !== shooter.id && e.spec.armor)
      .map((entity) => ({ entity, ghost: { id: entity.id, spec: entity.spec, state: entity.state, combat: Object.assign(createCombatState(entity.spec), { destroyed: !!entity.combat.destroyed }) } }));
    for (let tick = 1; tick <= 150 && !shell.dead; tick++) {
      stepShell(shell, SIM_DT);
      let first = null;
      for (const hull of hulls) {
        const hits = traceTank(shell.prevPos, shell.pos, poseAfter(hull.entity, tick * SIM_DT), hull.entity.spec.armor, hull.ghost.combat.eraSpent);
        if (hits.length && (!first || hits[0].t < first.hits[0].t)) first = { ...hull, hits };
      }
      if (!first) continue;
      const event = resolveShellHit(shell, first.ghost, first.hits, rng);
      if (first.ghost.combat.destroyed) continue;
      if (first.entity.team === shooter.team) break;
      if ((event.damage ?? 0) > 0 || event.modulesHit?.some((m) => m.dmg > 0)) { hurt++; break; }
    }
  }
  return hurt / GHOSTS;
}
/** Steps every station of `shooter` for `seconds` (`each(tick)` moves the scene first; a hull with a speed drives along
 * its heading); each fired round's station, calibre, tick, line, the scene it flies into, whether it went at a drone,
 * and its real chance to hurt (realChance). */
function battle(shooter, entities, seconds = 6, each = () => {}, context = {}) {
  let droneRound = false;
  const ctx = { entities, visible: () => true, clear: () => true, ...context,
    droneHit: (...args) => { droneRound = true; context.droneHit?.(...args); } };
  const stations = roofStationCount(shooter.spec), rounds = [];
  for (let tick = 0; tick < seconds * 60; tick++) {
    each(tick);
    for (const e of entities) if (e.state.speed) { e.state.pos.x += Math.sin(e.state.yaw) * e.state.speed * SIM_DT; e.state.pos.z += Math.cos(e.state.yaw) * e.state.speed * SIM_DT; }
    for (let station = 0; station < stations; station++) {
      droneRound = false;
      const fired = station ? stepRoofStation(shooter, station, tick / 60, 1 / 60, ctx) : stepRoofGun(shooter, tick / 60, 1 / 60, ctx);
      if (!fired) continue;
      const round = { station, tick, shell: auxiliaryShot.shell, caliber: auxiliaryShot.shell.caliberMm, origin: auxiliaryShot.origin.clone(),
        direction: auxiliaryShot.direction.clone(), drone: droneRound, scene: entities.map((e) => ({ ...e, state: { ...e.state, pos: { ...e.state.pos } } })) };
      round.p = round.drone ? 1 : realChance(round, shooter);
      rounds.push(round);
    }
  }
  return rounds;
}
const wasted = (rounds) => rounds.filter((round) => round.p < .1).map((round) => `station ${round.station} tick ${round.tick} p ${round.p}`);
const expected = (rounds, f = () => true) => rounds.filter(f).reduce((sum, round) => sum + round.p, 0);
const count = (rounds, f) => rounds.filter(f).length;

// 1. Where: lone targets at 100 m (the Abrams's 90, the Leopard's 120, the AMX-10P's 140), static or driving. Every
//    round any station fires hurts in at least one ghost flight in ten, and the rounds hurt as the damage model lets
//    them: `least`, the expected hurting rounds over the six seconds.
{
  const scenes = [
    // [shooter, target, aspect, range, speed, least] — the old rule wasted every round of these five
    ['k1e1', 'bmp2', 150, 100, 0, 12], ['m551a1_tts', 'bmp2', 0, 100, 0, 6], ['m551a1_tts', 'bmp2', 30, 100, 0, 4],
    ['m551a1_tts', 'hayate_ifv', 30, 100, 0, 6], ['m1a1_abrams_hc', 'bmp2', 140, 90, 0, 12],
    // GUARD: hurting before and after (a driving AMX-10P, a flank, a quarter, a side, a track, a gun behind a glancing
    // glacis)
    ['k1e1', 'amx10p_25', 150, 140, 8, 8],
    ['k1e1', 'bmp2', 50, 100, 0, 8], ['k1e1', 'bmp2', 90, 100, 0, 10], ['m551a1_tts', 'bmp2', 130, 100, 0, 10],
    ['k1e1', 'bmp3m_dragun125', 150, 100, 0, 12], ['m551a1_tts', 'cv9040c', 0, 100, 0, 2], ['m551a1_tts', 'leo1a5', 35, 120, 0, 2],
    // GUARD: nothing it can hurt (the share rule's own hold)
    ['k1e1', 'bmp2', 0, 100, 0, 0], ['k1e1', 'leo1a5', 0, 120, 0, 0],
  ];
  for (const [shooterId, targetId, aspect, range, speed, least] of scenes) {
    const shooter = vehicle('s', shooterId, 'blue', 0, 0), target = vehicle('t', targetId, 'red', 0, range, aspect, speed);
    shooter.state.yaw = 0;
    // a driving target crosses its mark mid-battle
    target.state.pos.x -= Math.sin(target.state.yaw) * speed * 3; target.state.pos.z -= Math.cos(target.state.yaw) * speed * 3;
    const rounds = battle(shooter, [shooter, target]), label = `${shooterId} on a ${targetId} at ${aspect} degrees, ${range} m${speed ? `, ${speed} m/s` : ''}`;
    assert.deepEqual(wasted(rounds), [], `${label}: no round where it cannot hurt`);
    assert.ok(expected(rounds) >= least, `${label}: ${expected(rounds).toFixed(1)} rounds hurt (at least ${least}; ${rounds.length} fired)`);
    if (!least) assert.equal(rounds.length, 0, `${label}: nothing fired`);
  }
}
// 2. A target turning its front mid-burst: a BMP-2 at 110 m swings from rear-on through its flank to head-on at 25
//    degrees a second. The K6 and the TTS's two stations fire while a face they can hurt is turned to them, and stop as
//    the front comes round.
for (const shooterId of ['k1e1', 'm551a1_tts']) {
  const shooter = vehicle('s', shooterId, 'blue', 0, 0), target = vehicle('t', 'bmp2', 'red', 20, 110, 180);
  shooter.state.yaw = 0;
  const start = target.state.yaw;
  const rounds = battle(shooter, [shooter, target], 8, (tick) => { target.state.yaw = start - 25 * DEG * tick / 60; });
  assert.deepEqual(wasted(rounds), [], `${shooterId}: no round lands where it cannot hurt as the BMP-2 turns`);
  assert.ok(expected(rounds) >= 9, `${shooterId}: rounds into the turning BMP-2 while it shows a face they hurt (${expected(rounds).toFixed(1)} of ${rounds.length})`);
  assert.equal(count(rounds, (r) => r.tick > 7.2 * 60 && r.caliber < 20), 0, `${shooterId}: the 12.7 holds once the BMP-2's front faces it`);
}
// 3. A wreck in the line (inert cover: sim/damage.ts resolveWreckHit) and a seen MBT hull in the line: the station
//    holds on the BMP-2 behind them and takes the BMP-2 it has a clear lane to.
{
  const shooter = vehicle('s', 'k1e1', 'blue', 0, 0), behind = vehicle('behind', 'bmp2', 'red', 0, 150, 90);
  const wreck = vehicle('wreck', 'bmp2', 'red', 0, 75, 90), clear = vehicle('clear', 'bmp2', 'red', 80, 150, 90);
  wreck.combat.destroyed = true; shooter.state.yaw = 0;
  const rounds = battle(shooter, [shooter, wreck, behind, clear]);
  assert.deepEqual(wasted(rounds), [], 'no round into the wreck in the line');
  assert.ok(expected(rounds) >= 10, `the K6 takes the BMP-2 it has a lane to (${expected(rounds).toFixed(1)} of ${rounds.length})`);
  const mbt = vehicle('mbt', 'm1a1_abrams_hc', 'red', 0, 75, 0), again = vehicle('s2', 'k1e1', 'blue', 0, 0), behind2 = vehicle('behind', 'bmp2', 'red', 0, 150, 90);
  again.state.yaw = 0;
  assert.equal(battle(again, [again, mbt, behind2]).length, 0, 'no round into a seen Abrams in the line');
}
// 4. A nearest target the station cannot lay on no longer idles it: under the TTS's 30 mm, 9 m ahead and low (its
//    turret-front depression table), and a target 150 m off to the left inside its arc: the 30 mm takes the far one.
{
  const shooter = vehicle('s', 'm551a1_tts', 'blue', 0, 0); shooter.state.yaw = 0;
  const rounds = battle(shooter, [shooter, soft('near', 'red', -.3, 0, 9), soft('far', 'red', -130, 0, 75)], 6);
  assert.ok(count(rounds, (r) => r.station === 0) >= 3, `the 30 mm engages the target it can lay on (${count(rounds, (r) => r.station === 0)})`);
}
// 5. Drones: one in reach is engaged before any vehicle (each round charged to the airframe); one overhead past the
//    station's elevation no longer holds the station off a vehicle; a drone behind an ally draws no round (the friendly
//    corridor is the drone round's too) and leaves the station on the BMP-2 it can hurt.
{
  const air = (x, y, z) => ({ id: 'carrier', team: 'red', spec: { id: 'target', dims: { heightM: 2.5 } }, state: { pos: { x: 400, y: 0, z: 400 }, yaw: 0, turretYaw: 0 }, combat: {},
    aerial: { kind: 'drone', active: true, launching: false, x, y, z } });
  let strikes = 0;
  const droneHit = () => { strikes++; };
  {
    const shooter = vehicle('s', 'k1e1', 'blue', 0, 0); shooter.state.yaw = 0;
    const rounds = battle(shooter, [shooter, air(20, 30, 80), soft('apc', 'red', 0, 0, 100)], 6, () => {}, { counterDrone: true, droneHit });
    assert.ok(rounds.length >= 10 && strikes === rounds.length, `GUARD: the drone in reach is engaged (${rounds.length} rounds, ${strikes} charged)`);
  }
  {
    const shooter = vehicle('s', 'k1e1', 'blue', 0, 0); shooter.state.yaw = 0; strikes = 0;
    const rounds = battle(shooter, [shooter, air(0, 40, 3), soft('apc', 'red', 0, 0, 100)], 6, () => {}, { counterDrone: true, droneHit });
    assert.ok(rounds.length >= 10 && strikes === 0, `a drone overhead past the elevation leaves the K6 on the vehicle (${rounds.length})`);
  }
  {
    const shooter = vehicle('s', 'k1e1', 'blue', 0, 0); shooter.state.yaw = 0; strikes = 0;
    const ally = soft('ally', 'blue', 4.8, 0, 20), ifv = vehicle('ifv', 'bmp2', 'red', -60, 100, 90);
    const rounds = battle(shooter, [shooter, ally, air(24, 4, 100), ifv], 6, () => {}, { counterDrone: true, droneHit });
    assert.equal(strikes, 0, 'no round at a drone through an ally');
    assert.ok(expected(rounds) >= 8, `the K6 takes the BMP-2 it can hurt instead (${expected(rounds).toFixed(1)} of ${rounds.length})`);
  }
}
// 6. Station 0 and every later station: the two-station Abrams (12.7 commander, 7.62 loader) and the K1 on a BMP-2
//    quartering at 140 degrees: each station judges its own round (the 7.62 has nothing it can hurt).
for (const shooterId of ['m1a1_abrams_hc', 'k1e1']) {
  const shooter = vehicle('s', shooterId, 'blue', 0, 0), target = vehicle('t', 'bmp2', 'red', 0, 90, 140);
  shooter.state.yaw = 0;
  const rounds = battle(shooter, [shooter, target]);
  assert.equal(roofStationCount(shooter.spec), 2);
  assert.deepEqual(wasted(rounds), [], `${shooterId}: no station fires where it cannot hurt`);
  assert.ok(expected(rounds, (r) => r.station === 0) >= 10 && count(rounds, (r) => r.station === 1) === 0, `${shooterId}: the 12.7 fires where it hurts, the 7.62 holds`);
}
// 7. GUARD: the same scene twice, a moving one (the hold memory is the station's own): the same rounds, bit for bit.
{
  const run = () => {
    const shooter = vehicle('s', 'm551a1_tts', 'blue', 0, 0), target = vehicle('t', 'amx10p_25', 'red', 30, 120, 150, 6);
    shooter.state.yaw = 0;
    return battle(shooter, [shooter, target], 5).map((r) => [r.station, r.tick, r.direction.x, r.direction.y, r.direction.z]);
  };
  const first = run();
  assert.ok(first.length >= 10, `the TTS fires on the driving AMX-10P (${first.length})`);
  assert.deepEqual(run(), first, 'the same rounds on the same ticks along the same lines');
}
// 8. GUARD: a pillbox (fortified cover, world/collision.ts) between a station and the BMP-2 behind it, on Foundry's own
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
// 9. GUARD: host and solo agree: the TTS against a turning BMP-2 and a quartering Leopard 1, stepped by the multiplayer host's
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
console.log('roofHoldFire: every roof round hurts in the live damage model where it lands (quartering, head-on, turning and driving targets, tracks and a glanced gun; each station of the K1, TTS and Abrams), and rounds that can hurt still fly; wrecks and seen hulls in the line held, an unlayable nearest target and an overhead drone no longer idle a station; drones in reach engaged, never through an ally; the same rounds twice; a pillbox in the line draws nothing; host and solo agree shot for shot');
