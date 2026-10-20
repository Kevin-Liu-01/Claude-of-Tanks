#!/usr/bin/env node
/**
 * Roof-gun fire discipline (owner, 2026-10-19: "Make roof guns hold fire where their rounds cannot hurt"): seeded,
 * headless all-bot matches on the shared authority (src/sim/authoritativeMatch.ts, the simulation the multiplayer host
 * steps; the solo battle calls the same roof-station functions, src/sim/auxiliarySystems.ts) with rosters weighted to
 * roof-gun vehicles and light hulls, and a ledger of every roof round:
 *
 * - at the shot, an oracle on the live damage model, independent of the station's estimate: the round (back-projected
 *   from its first tick) flown GHOSTS times through sim/ballistics.ts stepShell, sim/armor.ts traceTank on each tick's
 *   swept segment against every hull near its line (each carried along its heading at its speed and turn) and
 *   sim/damage.ts resolveShellHit with its own rolls, against copies of the hulls' combat states. `chance`: the share of
 *   flights whose first hull is a live enemy that takes hull damage, a module hit or a crew hit. `cannotHurt` counts the rounds
 *   under one flight in ten (why: `armour`, or a first hull that is a `wreck` or a `friendly`); `canHurt` the rest, and
 *   `expected` sums their chances; `drone` the rounds laid on an enemy drone in flight; `miss` the rest (the world, the
 *   sky);
 * - the outcome from the authority's own events: `pen` (hull damage), `module` (no hull damage, a module struck),
 *   `nonpen` (a live hull struck for nothing), `wreck`, `friendly`, `world` (shell_impact), and the hull damage, kills
 *   and drones brought down by roof rounds.
 *
 *   node tools/roof-gun-discipline.mjs --label=after --out=/path/dir
 *   node tools/roof-gun-discipline.mjs --maps=verdant,urban,alpine --modes=standard,drone --seeds=8 --seconds=150
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Vector3 } from 'three';
import { ensureAuthorityFleet } from '../src/vehicles/authorityFleet.ts';
import { createAuthoritativeMatch } from '../src/sim/authoritativeMatch.ts';
import { createDedicatedWorldCollision } from '../server/dedicatedWorldCollision.ts';
import { SIM_DT } from '../src/sim/movement.ts';
import { PRODUCTION_TANK_IDS, getSpec } from '../src/vehicles/specs.ts';
import { isBotTankId } from '../src/game/matchmaking.ts';
import { AUXILIARY_INVENTORY } from '../src/vehicles/auxiliaryInventory.generated.ts';
import { auxiliaryWeaponProfile } from '../src/vehicles/auxiliaryWeapons.ts';
import { traceTank, tankPoseFromState } from '../src/sim/armor.ts';
import { createCombatState, resolveShellHit } from '../src/sim/damage.ts';
import { createShell, stepShell } from '../src/sim/ballistics.ts';

const arg = (name, fallback) => { const hit = process.argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };

/** The handoff's seeded unit generator (server/pacingRoster.test-support.ts): the same seed picks the same roster. */
function seededUnit(seed) {
  let value = seed >>> 0;
  return () => {
    value |= 0; value = (value + 0x6D2B79F5) | 0;
    let out = Math.imul(value ^ (value >>> 15), 1 | value);
    out = (out + Math.imul(out ^ (out >>> 7), 61 | out)) ^ out;
    return ((out ^ (out >>> 14)) >>> 0) / 4294967296;
  };
}
const BOT_IDS = PRODUCTION_TANK_IDS.filter(isBotTankId);
const ROOF_IDS = BOT_IDS.filter((id) => AUXILIARY_INVENTORY[id]?.guns?.length);
const LIGHT_IDS = BOT_IDS.filter((id) => getSpec(id)?.role !== 'mbt');

/** Six bots a side: four roof-gun vehicles (any role) and two light hulls, drawn from the bot catalog by the seed. */
export function disciplineRoster(seed) {
  const random = seededUnit(seed ^ 0x2f00f);
  const draw = (pool) => pool[Math.floor(random() * pool.length)];
  const players = [];
  for (const team of ['alpha', 'bravo']) for (let index = 0; index < 6; index++) {
    players.push({ id: `bot-${team}-${index}`, name: `Bot ${team} ${index}`, specId: draw(index < 4 ? ROOF_IDS : LIGHT_IDS),
      team, bot: true, difficulty: 'normal', camo: 'auto', equipment: null, ready: true, connected: true, isHost: false });
  }
  return players;
}

const ROOF_NAMES = new Set();
for (const [id, kit] of Object.entries(AUXILIARY_INVENTORY)) for (const gun of kit.guns ?? []) ROOF_NAMES.add(auxiliaryWeaponProfile(gun.caliberMm, id).shell.name);

const from = new Vector3(), dir = new Vector3(), toPoint = new Vector3();
const GHOSTS = 12;
/** The ghosts' rolls: a fixed stream per round and flight. */
const stream = (seed) => { let value = seed >>> 0; return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; }; };
/** A hull's armour pose `t` seconds on: carried along its heading at its speed, turning at its yaw rate. */
function poseAfter(entity, t) {
  const pose = tankPoseFromState(entity.state, { pos: new Vector3() }), s = entity.state, turn = (s.yawRate ?? 0) * t;
  const heading = s.yaw + turn * .5, travel = (s.speed ?? 0) * t;
  pose.pos.x += Math.sin(heading) * travel; pose.pos.z += Math.cos(heading) * travel; pose.yaw = s.yaw + turn;
  return pose;
}
/** A copy of a hull's combat state for one ghost flight (hit points, modules, spent ERA, the mode's damage flags). */
function ghostCombat(entity) {
  const live = entity.combat, copy = createCombatState(entity.spec);
  copy.hp = live.hp; copy.destroyed = !!live.destroyed; copy.eraSpent = new Set(live.eraSpent ?? []);
  for (const [name, module] of Object.entries(live.modules ?? {})) if (copy.modules[name]) Object.assign(copy.modules[name], module);
  for (const key of ['modeDamageTakenScale', 'modeCriticalDamage', 'modeModuleOnlyDamage']) if (key in live) copy[key] = live[key];
  return copy;
}
/** The oracle: the round's first hull (or drone) and its chance to hurt there over GHOSTS flights of the live model. */
function judgeRound(match, world, shooter, row, calibres) {
  dir.set(row.vx, row.vy, row.vz).multiplyScalar(.01);
  const speed = dir.length();
  if (speed < 1) return { verdict: 'miss' };
  from.set(row.x, row.y, row.z).multiplyScalar(.01).addScaledVector(dir, -SIM_DT);
  dir.multiplyScalar(1 / speed);
  const maxDist = 420;
  const near = [];
  for (const other of match.entities) {
    if (other === shooter || other.modeActive === false || !other.spec?.armor) continue;
    toPoint.copy(other.state.pos).sub(from);
    const along = toPoint.dot(dir);
    if (along < -8 || along > maxDist + 8 || toPoint.addScaledVector(dir, -along).length() > 12) continue;
    near.push({ other, along });
  }
  near.sort((a, b) => a.along - b.along);
  for (const other of match.entities) {
    const air = other.aerial;
    if (other.team === shooter.team || !air || air.kind !== 'drone' || !air.active || air.launching) continue;
    toPoint.set(air.x, air.y, air.z).sub(from);
    const along = toPoint.dot(dir);
    if (along < 0 || along > maxDist || (near.length && along > near[0].along)) continue;
    if (toPoint.addScaledVector(dir, -along).length() < 4) return { verdict: 'drone' };
  }
  if (!near.length) return { verdict: 'miss' };
  // the round's calibre: the station that fired this tick; when two stations of one vehicle fired in the same tick the
  // row does not say which, and the heavier is the generous reading (the oracle never invents a wasted round)
  const caliberMm = Math.max(...calibres);
  const shellSpec = auxiliaryWeaponProfile(caliberMm, shooter.specId).shell;
  let hurt = 0, first = null, blocked = false;
  for (let flight = 0; flight < GHOSTS; flight++) {
    const rng = stream(row.id * 7919 + flight * 104729);
    const shell = createShell(shellSpec, shooter.id, false, from, dir, row.id);
    shell.gravityMps2 *= shooter.modeGravityScale ?? 1;
    const hulls = near.map(({ other }) => ({ other, ghost: { id: other.id, spec: other.spec, state: other.state, combat: ghostCombat(other) } }));
    for (let tick = 1; tick <= 40 && !shell.dead; tick++) {
      stepShell(shell, SIM_DT);
      let best = null;
      for (const hull of hulls) {
        const hits = traceTank(shell.prevPos, shell.pos, poseAfter(hull.other, tick * SIM_DT), hull.other.spec.armor, hull.ghost.combat.eraSpent);
        if (hits.length && (!best || hits[0].t < best.hits[0].t)) best = { ...hull, hits };
      }
      if (!best) continue;
      if (flight === 0 && !first) {
        // the world first: a round the terrain or a structure stops before the hull is a miss
        toPoint.copy(best.hits[0].point).sub(from);
        const hit = world?.raycast?.(from, toPoint.clone().normalize(), toPoint.length());
        if (hit && hit.dist < toPoint.length() - .5) { blocked = true; break; }
        first = best.other;
      }
      // a wreck before the round (a round that destroys the hull hurts it)
      const wreck = best.ghost.combat.destroyed;
      const event = resolveShellHit(shell, best.ghost, best.hits, rng);
      if (wreck) continue;
      if (best.other.team === shooter.team) break;
      if ((event.damage ?? 0) > 0 || event.modulesHit?.some((m) => m.dmg > 0) || event.crewHit?.length) { hurt++; break; }
    }
    if (blocked) break;
  }
  if (blocked) return { verdict: 'miss', blocked: true };
  if (!first) return { verdict: 'miss' };
  if (first.combat.destroyed) return { verdict: 'cannotHurt', why: 'wreck', chance: 0, targetSpec: 'wreck' };
  if (first.team === shooter.team) return { verdict: 'cannotHurt', why: 'friendly', chance: 0, targetSpec: 'friendly' };
  const chance = hurt / GHOSTS;
  return { verdict: chance >= .1 ? 'canHurt' : 'cannotHurt', why: chance >= .1 ? 'hurts' : 'armour', chance, targetSpec: first.specId };
}

/** Each roof station's shot counter, station order (guns[0] is the auxiliary state's own fields). */
function stationShots(entity) {
  const aux = entity.combat?.auxiliary;
  if (!aux) return [];
  return [aux.shots, ...(aux.stations ?? []).map((station) => station.shots)];
}

export async function playDisciplineMatch({ mapId, mode, seed, seconds }) {
  const players = disciplineRoster(seed);
  await ensureAuthorityFleet(players.map((player) => player.specId));
  const world = createDedicatedWorldCollision(mapId, { retain: true });
  const match = createAuthoritativeMatch({ players, mapId, seed, countdownS: 0, gameMode: mode, worldCollision: world });
  match.onMatchReady();
  const mainShellIds = new Set(), roofShellIds = new Map(), destroyed = new Set();
  const lastShots = new Map(match.entities.map((entity) => [entity.id, stationShots(entity)])), firedCalibres = new Map();
  const oracle = { canHurt: 0, cannotHurt: 0, drone: 0, miss: 0, blocked: 0, expected: 0, why: {}, wastedBy: {} };
  const outcome = { pen: 0, module: 0, nonpen: 0, wreck: 0, friendly: 0, world: 0 };
  let fired = 0, damage = 0, kills = 0, dronesDown = 0, roofDronesDown = 0;
  const ticks = Math.round(seconds / SIM_DT);
  for (let tick = 1; tick <= ticks && !match.result; tick++) {
    match.step({ dt: SIM_DT, inputs: new Map() });
    const events = match.eventsForViewer('__audit__');
    for (const event of events) if (event.type === 'shell_fired') mainShellIds.add(event.shellId);
    let newShots = 0;
    firedCalibres.clear();
    for (const entity of match.entities) {
      const shots = stationShots(entity), before = lastShots.get(entity.id) ?? [];
      const guns = AUXILIARY_INVENTORY[entity.specId]?.guns ?? [];
      for (let station = 0; station < shots.length; station++) {
        const count = shots[station] - (before[station] ?? 0);
        if (count <= 0) continue;
        newShots += count;
        const list = firedCalibres.get(entity.id) ?? [];
        list.push(guns[station]?.caliberMm ?? 12.7); firedCalibres.set(entity.id, list);
      }
      lastShots.set(entity.id, shots);
    }
    fired += newShots;
    if (newShots) {
      const snapshot = match.snapshot({ tick, serverTimeMs: 0, viewerId: '__audit__', ackInputSeq: null });
      for (const row of snapshot.shells) {
        if (mainShellIds.has(row.id) || roofShellIds.has(row.id) || row.type === 'DRONE') continue;
        const shooter = match.entityById.get(row.shooterId);
        if (!shooter) continue;
        const judged = judgeRound(match, world, shooter, row, firedCalibres.get(shooter.id) ?? (AUXILIARY_INVENTORY[shooter.specId]?.guns ?? []).map((gun) => gun.caliberMm));
        roofShellIds.set(row.id, judged);
        oracle[judged.verdict]++;
        oracle.expected += judged.chance ?? 0;
        if (judged.blocked) oracle.blocked++;
        if (judged.why) oracle.why[judged.why] = (oracle.why[judged.why] ?? 0) + 1;
        if (judged.verdict === 'cannotHurt') {
          const key = `${shooter.specId}->${judged.targetSpec ?? judged.why}`;
          oracle.wastedBy[key] = (oracle.wastedBy[key] ?? 0) + 1;
        }
      }
    }
    for (const event of events) {
      if (event.type === 'tank_destroyed') { destroyed.add(event.id); continue; }
      if (event.type === 'drone_down') { dronesDown++; continue; }
      const roof = (event.type === 'shell_hit' || event.type === 'shell_impact') && !mainShellIds.has(event.shellId)
        && (roofShellIds.has(event.shellId) || ROOF_NAMES.has(event.shellName) || (event.type === 'shell_impact' && event.shellType === 'AP' && event.caliberMm <= 30));
      if (!roof) continue;
      if (event.type === 'shell_impact') { outcome.world++; continue; }
      const target = match.entityById.get(event.targetId), shooter = match.entityById.get(event.shooterId);
      if (target && destroyed.has(target.id)) outcome.wreck++;
      else if (target && shooter && target.team === shooter.team) outcome.friendly++;
      else if ((event.damage ?? 0) > 0) outcome.pen++;
      else if (event.modulesHit?.length) outcome.module++;
      else outcome.nonpen++;
      damage += event.damage ?? 0;
      if (event.destroyed && target && !destroyed.has(target.id)) kills++;
    }
    match.afterEventBroadcast();
  }
  world.release?.();
  // drones down in the drone mode: the counter-drone path is the only roof-gun source of a drone_down
  roofDronesDown = mode === 'drone' ? dronesDown : 0;
  return { mapId, mode, seed, seconds: Math.round(match.timeS), result: match.resultReason ?? null,
    roster: players.map((player) => player.specId), fired, oracle, outcome, damage, kills, dronesDown: roofDronesDown };
}

function sum(records, pick) { return records.reduce((total, record) => total + pick(record), 0); }
export function summarize(records) {
  const fired = sum(records, (r) => r.fired);
  const cannot = sum(records, (r) => r.oracle.cannotHurt);
  const why = {}, wastedBy = {};
  for (const record of records) {
    for (const [key, value] of Object.entries(record.oracle.why)) why[key] = (why[key] ?? 0) + value;
    for (const [key, value] of Object.entries(record.oracle.wastedBy)) wastedBy[key] = (wastedBy[key] ?? 0) + value;
  }
  return {
    matches: records.length, fired,
    oracle: { canHurt: sum(records, (r) => r.oracle.canHurt), cannotHurt: cannot, drone: sum(records, (r) => r.oracle.drone),
      miss: sum(records, (r) => r.oracle.miss), blocked: sum(records, (r) => r.oracle.blocked),
      expected: +sum(records, (r) => r.oracle.expected).toFixed(1), why,
      cannotHurtShare: fired ? +(cannot / fired).toFixed(4) : 0,
      topWasted: Object.entries(wastedBy).sort((a, b) => b[1] - a[1]).slice(0, 12) },
    outcome: Object.fromEntries(Object.keys(records[0]?.outcome ?? {}).map((key) => [key, sum(records, (r) => r.outcome[key])])),
    damage: sum(records, (r) => r.damage), kills: sum(records, (r) => r.kills), dronesDown: sum(records, (r) => r.dronesDown),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const maps = arg('maps', 'verdant,urban,alpine').split(',');
  const modes = arg('modes', 'standard,drone').split(',');
  const seeds = Number(arg('seeds', 8)), seconds = Number(arg('seconds', 150)), base = Number(arg('base', 2290));
  const label = arg('label', 'run'), out = arg('out', '');
  const records = [];
  const started = performance.now();
  for (const mapId of maps) for (const mode of modes) for (let sample = 0; sample < seeds; sample++) {
    const record = await playDisciplineMatch({ mapId, mode, seed: base + sample, seconds });
    records.push(record);
    console.log(`${label} ${mapId}/${mode}/${record.seed}: ${record.fired} roof rounds, oracle ${JSON.stringify({ can: record.oracle.canHurt, cannot: record.oracle.cannotHurt, expected: +record.oracle.expected.toFixed(1), drone: record.oracle.drone, miss: record.oracle.miss })}, outcome ${JSON.stringify(record.outcome)}, damage ${record.damage}, kills ${record.kills}, drones down ${record.dronesDown}`);
  }
  const summary = { label, maps, modes, seeds, seconds, wallS: Math.round((performance.now() - started) / 1000), all: summarize(records),
    byMode: Object.fromEntries(modes.map((mode) => [mode, summarize(records.filter((r) => r.mode === mode))])),
    byMap: Object.fromEntries(maps.map((mapId) => [mapId, summarize(records.filter((r) => r.mapId === mapId))])) };
  console.log(JSON.stringify(summary.all));
  if (out) {
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, `${label}.json`), JSON.stringify({ summary, records }, null, 1));
  }
}
