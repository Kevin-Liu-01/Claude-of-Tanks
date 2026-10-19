#!/usr/bin/env node
/**
 * Roof-gun fire discipline (owner, 2026-10-19: "Make roof guns hold fire where their rounds cannot hurt"): seeded,
 * headless all-bot matches on the shared authority (src/sim/authoritativeMatch.ts, the simulation the multiplayer host
 * steps; the solo battle calls the same roof-station functions, src/sim/auxiliarySystems.ts) with rosters weighted to
 * roof-gun vehicles and light hulls, and a ledger of every roof round:
 *
 * - at the shot, an independent oracle on the real armour model (sim/armor.ts queryAimArmor + sim/damage.ts
 *   estimatePenRatio, the main gun's own estimate): the first hull along the round's line (back-projected from its first
 *   tick) and whether its nominal penetration at that range defeats the stack it meets there. `cannotHurt` counts the
 *   rounds whose first hull is a live enemy it cannot defeat where it lands, a wreck or a friend; `canHurt` the live
 *   enemies it defeats; `drone` the rounds laid on an enemy drone in flight; `miss` the rest (the world, the sky);
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
import { queryAimArmor, tankPoseFromState } from '../src/sim/armor.ts';
import { estimatePenRatio } from '../src/sim/damage.ts';

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

const from = new Vector3(), dir = new Vector3(), toPoint = new Vector3(), chord = new Vector3(), pose = { pos: new Vector3() };
const G = 9.81;
/**
 * The oracle: the first hull (or drone) on the round's flight and what the round's nominal penetration does there. The
 * flight leaves the back-projected muzzle along the first tick's velocity and drops as the authority's shell steps it
 * (sim/ballistics.ts stepShell): each hull near the line is traced along the chord to the point the round reaches at
 * that hull's range.
 */
function judgeRound(match, world, shooter, row, calibres) {
  dir.set(row.vx, row.vy, row.vz).multiplyScalar(.01);
  const speed = dir.length();
  if (speed < 1) return { verdict: 'miss' };
  from.set(row.x, row.y, row.z).multiplyScalar(.01).addScaledVector(dir, -SIM_DT);
  dir.multiplyScalar(1 / speed);
  const gravity = G * (shooter.modeGravityScale ?? 1);
  const maxDist = 420;
  let best = null;
  for (const other of match.entities) {
    if (other === shooter || other.modeActive === false || !other.spec?.armor) continue;
    toPoint.copy(other.state.pos).sub(from);
    const along = toPoint.dot(dir);
    if (along < -8 || along > maxDist + 8) continue;
    if (toPoint.addScaledVector(dir, -along).length() > 9) continue;
    const range = Math.max(1, along), flight = range / speed;
    chord.copy(from).addScaledVector(dir, range); chord.y -= .5 * gravity * flight * flight;
    chord.sub(from);
    const length = chord.length();
    chord.multiplyScalar(1 / length);
    const info = queryAimArmor(from, chord, length + 12, tankPoseFromState(other.state, pose), other.spec.armor, other.combat.eraSpent);
    if (info && (!best || info.distM < best.info.distM)) best = { other, info, dir: chord.clone() };
  }
  let drone = null;
  for (const other of match.entities) {
    const air = other.aerial;
    if (other.team === shooter.team || !air || air.kind !== 'drone' || !air.active || air.launching) continue;
    toPoint.set(air.x, air.y, air.z).sub(from);
    const along = toPoint.dot(dir);
    if (along < 0 || along > maxDist || (best && along > best.info.distM)) continue;
    if (toPoint.addScaledVector(dir, -along).length() < 4) { drone = other; break; }
  }
  if (drone) return { verdict: 'drone' };
  if (!best) return { verdict: 'miss' };
  const hit = world?.raycast?.(from, best.dir, best.info.distM);
  if (hit && hit.dist < best.info.distM - .5) return { verdict: 'miss', blocked: true };
  const target = best.other;
  if (target.combat.destroyed) return { verdict: 'cannotHurt', why: 'wreck' };
  if (target.team === shooter.team) return { verdict: 'cannotHurt', why: 'friendly' };
  // the round's calibre: the station that fired this tick; when two stations of one vehicle fired in the same tick the
  // row does not say which, and the heavier is the generous reading (the oracle never invents a wasted round)
  let ratio = 0;
  for (const caliberMm of calibres) ratio = Math.max(ratio, estimatePenRatio(auxiliaryWeaponProfile(caliberMm, shooter.specId).shell, best.info.distM, best.info));
  return { verdict: ratio >= 1 ? 'canHurt' : 'cannotHurt', why: ratio >= 1 ? 'defeats' : 'armour', ratio, targetSpec: target.specId,
    zone: best.info.plate?.name ?? null, distM: Math.round(best.info.distM) };
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
  const oracle = { canHurt: 0, cannotHurt: 0, drone: 0, miss: 0, blocked: 0, why: {}, wastedBy: {} };
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
      miss: sum(records, (r) => r.oracle.miss), blocked: sum(records, (r) => r.oracle.blocked), why,
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
    console.log(`${label} ${mapId}/${mode}/${record.seed}: ${record.fired} roof rounds, oracle ${JSON.stringify({ can: record.oracle.canHurt, cannot: record.oracle.cannotHurt, drone: record.oracle.drone, miss: record.oracle.miss })}, outcome ${JSON.stringify(record.outcome)}, damage ${record.damage}, kills ${record.kills}, drones down ${record.dronesDown}`);
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
