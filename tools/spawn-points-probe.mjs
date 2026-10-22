#!/usr/bin/env node
/**
 * Spawn-points probe (item/sim-spawn-points-234; the owner, 2026-10-21: "fix spawn points for all maps annd game modes
 * too"). Headless, no GPU: for every map x mode x roster x seed it seats a match through the real placement
 * (sim/matchPlacement.ts) exactly as the authority and the solo sim do (deployment slot k, then placement.spawn), runs
 * the real mode controller (sim/matchModes.ts) over stationary hulls, kills them in rounds (and parks an enemy on the
 * victims' spawns in a camping round), and records every point the controller revives a hull on: the start, the
 * construction-time arrivals (infected, kick-off), respawns, horde / frontline waves and infected rings.
 *
 * Each point is judged by its own arithmetic, not the placement's predicate:
 *   wet / soft / steep / relief  the hull footprint (2 m lattice + boundary) dry, firm, normal >= .90, relief <= 2 m;
 *   blocked / crushable           no live collision record (structures, walls, trees, cars, breastworks) in the disc;
 *   unreachable                   the dry navigation flood from the other side's deployment reaches it (a drive route);
 *   enemyZone                     a start or respawn stands >= ENEMY_ZONE_M from every enemy start slot;
 *   lineOfFire                    at round start no clear ray to an enemy start within MAX_SPOT_RANGE_M;
 *   facesAway / facesWall / facesCliff   faces within 100 deg of the front or the middle; no solid in the hull's lane and
 *                                 no stretch rising or falling steeper than CLIFF_GRADE within 12 m of its nose;
 *   overlap                       no live hull's disc within r1 + r2 + 1 m;
 *   unsafe                        a revive keeps SAFE_RESPAWN_M from every live enemy (the camping round too);
 *   onTopOfPlayers                an arrival (horde, infected) keeps ARRIVAL_CLEAR_M from every live player;
 *   stuckDead                     a hull due to respawn came back before the round ended.
 *
 * Usage: node tools/spawn-points-probe.mjs [--maps=a,b] [--modes=x,y] [--seeds=1,2,3] [--out=file.json]
 *        [--resume] [--parity] [--quiet]
 * Run one at a time with a 4 GB heap: NODE_OPTIONS=--max-old-space-size=4096.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Vector3 } from 'three';
import { createDedicatedWorldCollision } from '../server/dedicatedWorldCollision.ts';
import { createMatchPlacement, matchPlacementAnchors, placementTankRadius } from '../src/sim/matchPlacement.ts';
import { createMatchModeController } from '../src/sim/matchModes.ts';
import { matchRulesetFor, rulesetObjectiveAxisM, terrainVariantFor } from '../src/sim/matchRuleset.ts';
import { createObjectiveAccess } from '../src/sim/matchPlacementAccess.ts';
import { collisionFootprintContainsPoint } from '../src/world/collision.ts';
import { BOT_TANK_IDS, RUNTIME_TANK_IDS, getSpec } from '../src/vehicles/specs.ts';
import { MAP_IDS } from '../src/world/maps/index.ts';
import { MAX_SPOT_RANGE_M } from '../src/sim/spotting.ts';
import { CLIFF_GRADE } from '../src/sim/terrainMobility.ts';
import { planSoloProvingRange, provingSpawn } from '../src/game/provingRange.ts';

const ALL_MODES = ['standard', 'capture_the_flag', 'zone_control', 'turbo_ball', 'mars', 'realistic', 'gun_game', 'drone',
  'endless_horde', 'frontline_assault', 'infected', 'juggernaut', 'ac130', 'proving_ground'];
/** Team modes a room fills to 14 a side (the room's ROOM_MAX_TEAM_SIZE). */
const SYMMETRIC = new Set(['standard', 'capture_the_flag', 'zone_control', 'turbo_ball', 'mars', 'realistic', 'gun_game', 'drone']);
const SPAWN_NORMAL_Y = 0.90, RELIEF_M = 2, WET = 0.05;
const ENEMY_ZONE_M = 150, SAFE_RESPAWN_M = 75, ARRIVAL_CLEAR_M = 50, FACING_DEG = 100;
const SIM_DT = 1 / 60;

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, '').split('=');
  return [key, value ?? true];
}));
const maps = args.maps ? String(args.maps).split(',') : MAP_IDS;
const modes = args.modes ? String(args.modes).split(',') : ALL_MODES;
const seeds = args.seeds ? String(args.seeds).split(',').map(Number) : [1, 2, 3];
const outPath = String(args.out ?? '.qa-dev/spawns/probe.json');
const quiet = !!args.quiet;

// the fleet's widest hulls with the bot pool, so the footprints are the ones the roster can really seat
const SPEC_IDS = (() => {
  const wide = [...new Set(RUNTIME_TANK_IDS)].map((id) => ({ id, r: placementTankRadius(getSpec(id)) }))
    .sort((a, b) => b.r - a.r).slice(0, 3).map((entry) => entry.id);
  return [...wide, ...BOT_TANK_IDS];
})();

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- the world and its route floods -------------------------------------------------------------------------------
const NAV = { min: -500, cell: 25, n: 41 };
function worldAccess(world) {
  const anchors = matchPlacementAnchors(world.heightField._layout.spawns);
  const access = createObjectiveAccess({ heightField: world.heightField, obstacles: world.getObstacles(),
    queryObstacles: world.queryObstacles }, anchors);
  const scratch = [];
  const field = world.heightField;
  const connectorClear = (from, to) => {
    const distance = Math.hypot(to.x - from.x, to.z - from.z), samples = Math.max(1, Math.ceil(distance / 2));
    for (let s = 0; s <= samples; s++) {
      const t = s / samples, x = from.x + (to.x - from.x) * t, z = from.z + (to.z - from.z) * t;
      if (field.getWaterMaskAt(x, z) > WET || field.getNormalAt(x, z).y < .85) return false;
      for (const o of world.queryObstacles(x - 3.5, z - 3.5, x + 3.5, z + 3.5, scratch)) {
        if (!o.crushed && !o.dead && !o.crushable && collisionFootprintContainsPoint(o, x, z, 3.5)) return false;
      }
    }
    return true;
  };
  const nav = access.dryNavigation;
  const cell = (v) => Math.min(NAV.n - 1, Math.max(0, Math.round((v - NAV.min) / NAV.cell)));
  /** In the flood `mask`: a 3 x 3 neighbour cell open, flooded and joined to the point by a clear dry connector. */
  const reaches = (mask, point) => {
    const cx = cell(point.x), cz = cell(point.z);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const ix = cx + dx, iz = cz + dz;
      if (ix < 0 || iz < 0 || ix >= NAV.n || iz >= NAV.n) continue;
      const index = iz * NAV.n + ix;
      if (nav.blocked[index] || mask[index] !== 1) continue;
      const target = nav.cellPositions
        ? { x: nav.cellPositions[index * 2], z: nav.cellPositions[index * 2 + 1] }
        : { x: NAV.min + ix * NAV.cell, z: NAV.min + iz * NAV.cell };
      if (connectorClear(point, target)) return true;
    }
    return false;
  };
  return { anchors, alpha: access.alpha, bravo: access.bravo, reaches };
}

const worlds = new Map();
function worldFor(mapId, variant) {
  const key = variant ? `${mapId}@${variant}` : mapId;
  let entry = worlds.get(key);
  if (!entry) {
    const world = createDedicatedWorldCollision(mapId, { variant });
    entry = { world, access: worldAccess(world) };
    worlds.set(key, entry);
  }
  return entry;
}

// --- the judges ---------------------------------------------------------------------------------------------------
function footprintIssues(world, p, r) {
  const field = world.heightField, out = new Set();
  let low = Infinity, high = -Infinity;
  const sample = (x, z) => {
    const y = field.getHeightAt(x, z);
    if (!Number.isFinite(y)) { out.add('steep'); return; }
    if (field.getWaterMaskAt(x, z) > WET) out.add('wet');
    if (field.getGroundType(x, z) === 'soft') out.add('soft');
    if (field.getNormalAt(x, z).y < SPAWN_NORMAL_Y) out.add('steep');
    low = Math.min(low, y); high = Math.max(high, y);
  };
  for (let dz = -r; dz <= r; dz += 2) for (let dx = -r; dx <= r; dx += 2) if (dx * dx + dz * dz <= r * r) sample(p.x + dx, p.z + dz);
  const count = Math.max(16, Math.ceil(2 * Math.PI * r / 2));
  for (let i = 0; i < count; i++) { const a = i / count * Math.PI * 2; sample(p.x + Math.sin(a) * r, p.z + Math.cos(a) * r); }
  if (high - low > RELIEF_M) out.add('relief');
  const floor = field.getHeightAt(p.x, p.z), hits = [];
  for (const o of world.queryObstacles(p.x - r, p.z - r, p.x + r, p.z + r, [])) {
    if (o.crushed || o.dead) continue;
    if (o.max[1] < floor - .5 || o.min[1] > floor + 3.5) continue;
    if (!collisionFootprintContainsPoint(o, p.x, p.z, r)) continue;
    out.add(o.crushable ? 'crushable' : 'blocked');
    hits.push(o.kind ?? '?');
  }
  return { issues: out, hits };
}

const forwardOf = (yaw) => ({ x: Math.sin(yaw), z: Math.cos(yaw) });
function facingIssues(world, p, r, yaw, fronts) {
  const out = new Set(), f = forwardOf(yaw);
  if (fronts.length) {
    let best = Infinity;
    for (const front of fronts) {
      const dx = front.x - p.x, dz = front.z - p.z, len = Math.hypot(dx, dz);
      if (len < 1) { best = 0; break; }
      best = Math.min(best, Math.acos(Math.max(-1, Math.min(1, (dx * f.x + dz * f.z) / len))) * 180 / Math.PI);
    }
    if (best > FACING_DEG) out.add('facesAway');
  }
  // a cliff is the game's own: ground rising or falling steeper than CLIFF_GRADE over a 2 m stretch (terrainMobility.ts)
  const field = world.heightField;
  let prev = field.getHeightAt(p.x, p.z), prevD = 0;
  for (let d = r + 2; d <= r + 12 + 1e-6; d += 2) {
    const x = p.x + f.x * d, z = p.z + f.z * d, y = field.getHeightAt(x, z);
    if (Math.abs(y - prev) > CLIFF_GRADE * (d - prevD)) out.add('facesCliff');
    prev = y; prevD = d;
    for (const o of world.queryObstacles(x - 2, z - 2, x + 2, z + 2, [])) {
      if (o.crushed || o.dead || o.crushable) continue;
      if (o.max[1] < y + .3 || o.min[1] > y + 3) continue;
      if (collisionFootprintContainsPoint(o, x, z, 1.8)) { out.add('facesWall'); break; }
    }
  }
  return out;
}

const _o = new Vector3(), _d = new Vector3();
function clearShot(world, a, b) {
  const field = world.heightField;
  _o.set(a.x, field.getHeightAt(a.x, a.z) + 2.3, a.z);
  _d.set(b.x, field.getHeightAt(b.x, b.z) + 2.3, b.z).sub(_o);
  const distance = _d.length();
  if (distance > MAX_SPOT_RANGE_M || distance < 1) return false;
  _d.multiplyScalar(1 / distance);
  const hit = world.raycast(_o, _d, distance);
  return !hit || hit.dist >= distance - 4;
}

// --- the rosters ----------------------------------------------------------------------------------------------------
function rostersFor(mode, ruleset) {
  const out = [];
  const allies = ruleset.allies ?? 6, enemies = ruleset.enemies ?? 7;
  const solo = [{ id: 'p0', team: 'alpha', bot: false }];
  for (let i = 0; i < allies; i++) solo.push({ id: `a${i + 1}`, team: 'alpha', bot: true });
  for (let i = 0; i < enemies; i++) solo.push({ id: `e${i}`, team: 'bravo', bot: true });
  out.push({ name: 'solo', players: solo });
  if (SYMMETRIC.has(mode)) {
    const full = [{ id: 'p0', team: 'alpha', bot: false }];
    for (let i = 1; i < 14; i++) full.push({ id: `a${i}`, team: 'alpha', bot: true });
    for (let i = 0; i < 14; i++) full.push({ id: `e${i}`, team: 'bravo', bot: true });
    out.push({ name: 'room14', players: full });
  }
  return out.map((roster) => ({ ...roster,
    players: roster.players.map((player, index) => ({ ...player, specId: SPEC_IDS[index % SPEC_IDS.length] })) }));
}

// --- one match --------------------------------------------------------------------------------------------------------
function runMatch({ mapId, mode, ruleset, roster, seed, world, access, parity }) {
  const field = world.heightField, layout = field._layout;
  const trenchLines = field.assaultTrenchLines;
  const base = createMatchPlacement({
    mapId, heightField: field, obstacles: world.getObstacles(), queryObstacles: world.queryObstacles,
    anchors: matchPlacementAnchors(layout.spawns), mode, objectiveAxisM: rulesetObjectiveAxisM(ruleset),
    assaultLines: trenchLines?.sectors ?? trenchLines?.lines ?? null,
  });
  const calls = [];
  const placement = { ...base,
    respawn(point, key, occupied) {
      const got = base.respawn(point, key, occupied);
      calls.push({ via: 'respawn', key, want: { x: point.x, z: point.z }, got });
      return got;
    },
    respawnNear(point, key, occupied, maxShiftM) {
      const got = base.respawnNear(point, key, occupied, maxShiftM);
      calls.push({ via: 'respawnNear', key, want: { x: point.x, z: point.z }, got });
      return got;
    },
  };
  // seat exactly as the authority (spawnFor: deployment slot k of the side, then placement.spawn) and the solo sim
  const proving = ruleset.provingGround ? planSoloProvingRange(ruleset.provingGround, world) : null;
  const entities = [], index = { alpha: 0, bravo: 0 };
  for (const player of roster.players) {
    const spec = getSpec(player.specId), radius = placementTankRadius(spec);
    let preferred;
    const mark = proving ? provingSpawn(proving, !player.bot, !player.bot ? 0 : index.bravo) : null;
    if (mark) { preferred = { x: mark.x, z: mark.z, yaw: mark.yaw }; if (player.bot) index.bravo++; }
    else { const slot = base.deploymentSlot(player.team, index[player.team]++); preferred = { x: slot.x, z: slot.z, yaw: slot.yaw }; }
    const pad = base.spawn(preferred, player.id, radius, false);
    entities.push({ id: player.id, team: player.team, bot: player.bot, isPlayer: !player.bot, spec, specId: spec.id, radius,
      state: { pos: new Vector3(pad.x, field.getHeightAt(pad.x, pad.z), pad.z), yaw: pad.yaw, speed: 0, aimPoint: new Vector3() },
      combat: { hp: 1000, maxHp: 1000, destroyed: false, ammo: [20, 20, 20], ammoCapacity: [20, 20, 20] },
      input: { aimPoint: new Vector3() }, seat: { x: pad.x, z: pad.z, yaw: pad.yaw } });
  }
  const gunship = (entity) => ruleset.aerial === 'gunship' && !entity.bot && entity.team === 'alpha';
  const teamOf = (entity) => (entity.team === 'alpha' || entity.team === 'player' ? 'alpha' : 'bravo');
  const live = (entity) => !entity.combat.destroyed && entity.modeActive !== false && !gunship(entity);
  const points = [];
  let label = 'start', timeS = 0;
  const startSlots = { alpha: [], bravo: [] }, seats = { alpha: [], bravo: [] };
  for (const entity of entities) if (!gunship(entity)) seats[teamOf(entity)].push(entity.seat);
  // Turbo Ball's kick-off line-up (ball.kickoffAtStart) is a face-off by rule: its start is no spawn zone
  const kickoff = !!ruleset.ball?.kickoffAtStart;
  let controller = null;
  const record = (entity, kind) => {
    if (gunship(entity)) return;
    const p = { x: entity.state.pos.x, z: entity.state.pos.z };
    const team = teamOf(entity), r = entity.radius;
    const { issues, hits } = footprintIssues(world, p, r);
    const enemies = entities.filter((other) => other !== entity && live(other) && teamOf(other) !== team);
    const friends = entities.filter((other) => other !== entity && live(other));
    for (const other of friends) {
      if (Math.hypot(other.state.pos.x - p.x, other.state.pos.z - p.z) < r + other.radius + 1) issues.add('overlap');
    }
    const arrival = kind === 'arrival';
    if (!proving) {
      if (!access.reaches(team === 'alpha' ? access.bravo : access.alpha, p)) issues.add('unreachable');
      if (!arrival && !ruleset.horde && !ruleset.assault && !ruleset.infection && !(kickoff && kind === 'start')) {
        // the other side's deployment seats: the spawn zone a start or a respawn never stands in or beside
        const other = seats[team === 'alpha' ? 'bravo' : 'alpha'];
        if (other.some((slot) => Math.hypot(slot.x - p.x, slot.z - p.z) < ENEMY_ZONE_M)) issues.add('enemyZone');
      }
      if (kind !== 'start' && kind !== 'construct') {
        const nearest = Math.min(Infinity, ...enemies.map((other) => Math.hypot(other.state.pos.x - p.x, other.state.pos.z - p.z)));
        if (arrival ? nearest < ARRIVAL_CLEAR_M : nearest < SAFE_RESPAWN_M) issues.add(arrival ? 'onTopOfPlayers' : 'unsafe');
      }
      const fronts = frontsFor(entity, team, enemies);
      for (const issue of facingIssues(world, p, r, entity.state.yaw, fronts)) issues.add(issue);
    }
    // the respawn distance: how far the placement moved the revive from the point the controller asked for
    let shift = null;
    for (let i = calls.length - 1; i >= 0; i--) {
      const call = calls[i];
      if (call.key !== entity.id || !call.got) continue;
      if (Math.hypot(call.got.x - p.x, call.got.z - p.z) < 0.01) shift = +Math.hypot(call.want.x - p.x, call.want.z - p.z).toFixed(1);
      break;
    }
    points.push({ id: entity.id, team, kind, label, t: +timeS.toFixed(2), x: +p.x.toFixed(2), z: +p.z.toFixed(2),
      yaw: +entity.state.yaw.toFixed(3), r: +r.toFixed(2), shift, issues: [...issues], hits: [...new Set(hits)] });
  };
  const frontsFor = (entity, team, enemies) => {
    const out = [base.middle];
    const st = controller?.state;
    const centroid = (list) => {
      if (!list.length) return null;
      let x = 0, z = 0;
      for (const e of list) { x += e.state.pos.x; z += e.state.pos.z; }
      return { x: x / list.length, z: z / list.length };
    };
    const enemyCentre = centroid(enemies);
    if (enemyCentre) out.push(enemyCentre);
    const otherSlots = startSlots[team === 'alpha' ? 'bravo' : 'alpha'];
    if (otherSlots.length) out.push(centroid(otherSlots.map((s) => ({ state: { pos: s } }))));
    if (st) {
      for (const flag of st.flags ?? []) out.push({ x: flag.baseX, z: flag.baseZ });
      for (const zone of st.zones ?? []) out.push(zone);
      for (const goal of st.goals ?? []) out.push(goal);
      if (st.ball) out.push(st.ball);
    }
    return out;
  };

  let reviving = 'construct';
  const revive = (entity, spawn) => {
    entity.state.pos.set(spawn.x, field.getHeightAt(spawn.x, spawn.z), spawn.z);
    entity.state.yaw = spawn.yaw;
    entity.combat.destroyed = false;
    entity.combat.hp = entity.combat.maxHp;
    pendingRevives.push({ entity, kind: reviving });
  };
  const pendingRevives = [];
  controller = createMatchModeController({ mode, entities, seed, placement, ruleset, revive,
    setActive(entity, active) { entity.modeActive = active; }, setWeaponStage() {},
    terrainHeight: (x, z) => field.getHeightAt(x, z), ballFloorHeight: (x, z) => field.getHeightAt(x, z), emit() {},
    ...(proving ? { range: { origin: proving.origin, lanes: [] } } : {}) });
  // the start: every live hull after the first tick (construction-time arrivals included; a wave mode's hostile pool
  // parks inactive there until its wave), then the round-start shots
  for (const entity of entities) entity.builtPos = { x: entity.state.pos.x, z: entity.state.pos.z };
  timeS = SIM_DT;
  controller.step(SIM_DT, timeS);
  pendingRevives.length = 0;
  for (const entity of entities) {
    entity.startPos = { x: entity.state.pos.x, z: entity.state.pos.z };
    if (live(entity)) startSlots[teamOf(entity)].push(entity.startPos);
  }
  for (const entity of entities) if (live(entity)) record(entity, 'start');
  let shots = 0;
  // both sides at their deployments at round start (the kick-off, the infected rings and the waves face off by rule)
  if (!proving && !ruleset.horde && !ruleset.assault && !ruleset.infection && !kickoff) {
    for (const a of entities) {
      if (!live(a) || teamOf(a) !== 'alpha') continue;
      for (const b of entities) {
        if (!live(b) || teamOf(b) !== 'bravo') continue;
        if (clearShot(world, a.state.pos, b.state.pos)) {
          shots++;
          for (const point of points) {
            if (point.kind === 'start' && (point.id === a.id || point.id === b.id) && !point.issues.includes('lineOfFire')) point.issues.push('lineOfFire');
          }
        }
      }
    }
  }
  const flush = () => {
    for (const { entity, kind } of pendingRevives.splice(0)) {
      record(entity, ruleset.horde || ruleset.assault ? (teamOf(entity) === 'bravo' ? 'arrival' : kind)
        : ruleset.infection && teamOf(entity) === 'bravo' ? 'arrival' : kind);
    }
  };
  const run = (seconds) => {
    const end = timeS + seconds;
    while (timeS < end) {
      timeS += SIM_DT;
      controller.step(SIM_DT, timeS);
      flush();
      if (controller.state.result || controller.result) break;
    }
  };
  reviving = 'wave';
  label = 'opening';
  run(ruleset.horde || ruleset.assault ? 25 : 2);
  const rng = mulberry(seed * 7919 + 13);
  const respawnS = ruleset.respawnS ?? 0;
  const kill = (entity) => { entity.combat.destroyed = true; entity.combat.hp = 0; };
  const due = new Set();
  const rounds = ruleset.horde || ruleset.assault ? 4 : 3;
  for (let round = 0; round < rounds; round++) {
    label = `round${round + 1}`;
    reviving = 'respawn';
    const alive = entities.filter((entity) => live(entity) && !gunship(entity));
    let victims;
    if (ruleset.horde || ruleset.assault) victims = alive.filter((entity) => teamOf(entity) === 'bravo' || (entity.bot && rng() < .3));
    else if (ruleset.infection) victims = alive.filter((entity) => teamOf(entity) === 'bravo' || (rng() < .25));
    else victims = alive.filter((_, i) => (i + round) % 2 === 0 || rng() < .2);
    if (ruleset.juggernaut) victims = victims.filter((entity) => entity !== entities.find((e) => teamOf(e) === ruleset.juggernaut.team));
    // the camping round: a live enemy parked 10 m in front of each victim's own spawn when it comes back
    const parked = [];
    if (round === rounds - 1 && respawnS > 0 && !proving) {
      const used = new Set();
      for (const victim of victims) {
        const camper = entities.find((other) => live(other) && !victims.includes(other) && !used.has(other)
          && teamOf(other) !== teamOf(victim));
        if (!camper) continue;
        used.add(camper);
        parked.push({ camper, x: camper.state.pos.x, z: camper.state.pos.z });
        const f = forwardOf(victim.seat.yaw), x = victim.seat.x + f.x * 10, z = victim.seat.z + f.z * 10;
        camper.state.pos.set(x, field.getHeightAt(x, z), z);
      }
      if (parked.length) label = `round${round + 1}-camped`;
    }
    for (const victim of victims) { kill(victim); if (respawnS > 0) due.add(victim.id); }
    run(ruleset.horde || ruleset.assault ? 40 : respawnS + 3);
    for (const { camper, x, z } of parked) camper.state.pos.set(x, field.getHeightAt(x, z), z);
    for (const point of points) if (point.label === label) due.delete(point.id);
  }
  const stuck = respawnS > 0 ? [...due].filter((id) => entities.find((e) => e.id === id)?.combat.destroyed) : [];
  const failed = calls.filter((call) => call.via === 'respawn' && call.got == null);
  // parity with the authority's own seating (one seed): the same placement calls give the same seats
  let parityOk = null;
  if (parity) {
    parityOk = parityCheck({ mapId, mode, roster, seed, entities });
  }
  return { points, shots, calls: calls.length, failedCalls: failed.length, stuck, parityOk };
}

let createAuthority = null;
/** The authority's own seats for the same roster (null where the controller moves hulls at construction). */
function parityCheck({ mapId, mode, roster, seed, entities }) {
  if (!createAuthority || mode === 'proving_ground') return null;
  const fresh = createDedicatedWorldCollision(mapId, { variant: terrainVariantFor(mode) });
  const authority = createAuthority({ mapId, worldCollision: fresh, gameMode: mode, seed,
    players: roster.players.map(({ id, team, specId, bot }) => ({ id, team, specId, bot })) });
  let worst = 0;
  for (const entity of entities) {
    const twin = authority.entityById.get(entity.id);
    if (!twin || twin.aerial?.kind === 'gunship') continue;
    worst = Math.max(worst, Math.hypot(twin.state.pos.x - entity.builtPos.x, twin.state.pos.z - entity.builtPos.z));
  }
  fresh.release?.();
  return worst < 0.5;
}

// --- the census ----------------------------------------------------------------------------------------------------
const BAD = ['wet', 'soft', 'steep', 'relief', 'blocked', 'crushable', 'unreachable', 'enemyZone', 'lineOfFire', 'facesAway',
  'facesWall', 'facesCliff', 'overlap', 'unsafe', 'onTopOfPlayers'];

async function main() {
  if (args.parity) ({ createAuthoritativeMatch: createAuthority } = await import('../src/sim/authoritativeMatch.ts'));
  const results = args.resume && existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : { runs: [] };
  const done = new Set(results.runs.map((run) => `${run.mapId}|${run.mode}|${run.roster}|${run.seed}`));
  mkdirSync(dirname(outPath), { recursive: true });
  const started = performance.now();
  for (const mapId of maps) {
    for (const mode of modes) {
      const ruleset = matchRulesetFor(mode);
      if (ruleset.provingGround && ruleset.provingGround.mapId !== mapId) continue; // the range plays on its own map
      const variant = terrainVariantFor(mode);
      const { world, access } = worldFor(mapId, variant);
      for (const roster of rostersFor(mode, ruleset)) {
        // a symmetric mode's seed draws only the kill order: --symSeeds of them (default 1); the arrival modes take all
        for (const seed of SYMMETRIC.has(mode) ? seeds.slice(0, Number(args.symSeeds ?? 1)) : seeds) {
          const key = `${mapId}|${mode}|${roster.name}|${seed}`;
          if (done.has(key)) continue;
          const t0 = performance.now();
          let run;
          try {
            run = runMatch({ mapId, mode, ruleset, roster, seed, world, access, parity: args.parity && seed === seeds[0] });
          } catch (error) {
            run = { error: String(error?.message ?? error), points: [], shots: 0, calls: 0, failedCalls: 0, stuck: [] };
          }
          const bad = run.points.filter((point) => point.issues.length);
          results.runs.push({ mapId, mode, roster: roster.name, seed, ms: Math.round(performance.now() - t0), ...run });
          if (!quiet) {
            const tally = {};
            for (const point of bad) for (const issue of point.issues) tally[issue] = (tally[issue] ?? 0) + 1;
            console.log(`${key} points=${run.points.length} bad=${bad.length} stuck=${run.stuck.length} failed=${run.failedCalls}`
              + `${run.error ? ` ERROR ${run.error}` : ''}${run.parityOk === false ? ' PARITY-MISMATCH' : ''} ${JSON.stringify(tally)}`);
          }
        }
      }
      writeFileSync(outPath, JSON.stringify(results));
    }
    // one map's worlds at a time
    for (const [key, entry] of worlds) { entry.world.release?.(); worlds.delete(key); }
    if (!quiet) console.log(`# ${mapId} done ${((performance.now() - started) / 1000).toFixed(0)} s rss ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB`);
  }
  summarize(results);
}

function summarize(results) {
  const byMode = new Map(), matrix = new Map();
  for (const run of results.runs) {
    const m = byMode.get(run.mode) ?? { points: 0, bad: 0, unique: new Set(), stuck: 0, errors: 0, issues: {} };
    m.points += run.points.length;
    m.stuck += run.stuck.length;
    if (run.error) m.errors++;
    for (const point of run.points) {
      if (!point.issues.length) continue;
      m.bad++;
      m.unique.add(`${run.mapId}|${point.x.toFixed(0)}|${point.z.toFixed(0)}`);
      for (const issue of point.issues) m.issues[issue] = (m.issues[issue] ?? 0) + 1;
      const cell = `${run.mapId}|${run.mode}`;
      const set = matrix.get(cell) ?? new Set();
      set.add(`${point.x.toFixed(0)}|${point.z.toFixed(0)}`);
      matrix.set(cell, set);
    }
    byMode.set(run.mode, m);
  }
  console.log('\nmode                 points   bad  unique  stuck  errors  issues');
  let total = 0;
  for (const [mode, m] of byMode) {
    total += m.unique.size;
    console.log(`${mode.padEnd(20)} ${String(m.points).padStart(6)} ${String(m.bad).padStart(5)} ${String(m.unique.size).padStart(7)}`
      + ` ${String(m.stuck).padStart(6)} ${String(m.errors).padStart(7)}  ${JSON.stringify(m.issues)}`);
  }
  console.log(`unique bad points: ${total}`);
  // the respawn distance per mode: how far a revive stood from the point its controller asked for
  const shifts = new Map();
  for (const run of results.runs) for (const point of run.points) {
    if (point.kind !== 'respawn' || point.shift == null) continue;
    const list = shifts.get(run.mode) ?? [];
    list.push(point.shift);
    shifts.set(run.mode, list);
  }
  for (const [mode, list] of shifts) {
    list.sort((a, b) => a - b);
    const at = (q) => list[Math.min(list.length - 1, Math.floor(q * list.length))];
    console.log(`respawn shift ${mode.padEnd(18)} n=${list.length} p50=${at(.5)} p95=${at(.95)} max=${list.at(-1)} m`);
  }
  const rows = [...matrix].filter(([, set]) => set.size).sort((a, b) => b[1].size - a[1].size).slice(0, 40);
  if (rows.length) console.log('worst map x mode:', rows.map(([cell, set]) => `${cell}=${set.size}`).join(' '));
}

main().catch((error) => { console.error(error); process.exit(1); });
