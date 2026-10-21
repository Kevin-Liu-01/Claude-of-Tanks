// VH.15 counter-drone engagements on the real network authority (227 guards, 2026-10-16). One run is one FPV attack:
// a pilot on team bravo launches its drone 300-420 m out and flies it at a parked team-alpha tank whose roof stations
// engage it, inside createAuthoritativeMatch in the drone mode (the host Worker's and the match service's step: stepAerial,
// stepRoofGun / stepRoofStation with the authority's GunContext, strikeDrone, the warhead's shell sweep) on a flat stub
// world (open ground at y = 0: no cover, the drone's worst case). The pilot holds the crosshair on the target's centre of
// mass through aim intents, as a guest's client sends them; a dive climbs first and noses over above the target.
//
// Every random choice comes from a seeded PRNG keyed by (approach, seed index) only, so every vehicle and every rule value
// sees the same geometry for the same seed (common random numbers: a lever's effect is the difference, not noise).
// The launch time sets the drone's gust phase (aerialCombat.ts: born * .73 rad), so it is drawn over one full gust cycle
// (2 pi / .73 = 8.6 s) after a second's settle instead of the old harness's 10-60 s of idle stepping.
//
// Callers: src/sim/counterDroneEngagement.selftest.mjs (the owner's outcome band and the pinned hovers),
// src/sim/weaponReload.selftest.mjs (the solo battle's hover, through soloHoverCounterDrone: that receipt already loads
// game/state.ts) and tools/counter-drone-engage.mjs (the --ids entry point the 227 turret work calls for new stations).
// The tuning workflow's original harness
// (~/cot-launch-state/streams/counter-drone/harness/cdh.mjs) composed the same modules outside the authority and agreed
// with it on 160 of 160 runs; this one is the authority itself.
import { createHash } from 'node:crypto';
import { Group, Vector3 } from 'three';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { TANK_SPECS } from '../vehicles/specs.ts';
import { AUXILIARY_INVENTORY } from '../vehicles/auxiliaryInventory.generated.ts';
import { auxiliaryWeaponProfile } from '../vehicles/auxiliaryWeapons.ts';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { encodeAimIntent } from './aimIntent.ts';
import { initializeAerial } from './aerialCombat.ts';
import { createAuxiliaryState, roofStationCount } from './auxiliarySystems.ts';
import { COUNTER_DRONE_BANDS, COUNTER_DRONE_CLASSES, COUNTER_DRONE_PINS, COUNTER_DRONE_SETS, roofStations, stationClass } from './counterDroneStations.test-support.mjs';
import { createCombatState } from './damage.ts';
import { AERIAL_RULES, matchRulesetFor } from './matchRuleset.ts';
import { createTankState, SIM_DT } from './movement.ts';
import { PLAYER_ACTION_BITS } from './playerActions.ts';

// the station half, re-exported for the entry point (tools/counter-drone-engage.mjs)
export { COUNTER_DRONE_BANDS, COUNTER_DRONE_CLASSES, COUNTER_DRONE_PINS, COUNTER_DRONE_SETS, roofStations, stationClass };

/** The pilot's approaches: a level run at the hull's front, side (either, by seed) or rear, or a steep dive. */
export const COUNTER_DRONE_APPROACHES = Object.freeze({
  direct_front: Object.freeze({ bearingDeg: 0 }),
  direct_side: Object.freeze({ bearingDeg: 90 }),
  direct_rear: Object.freeze({ bearingDeg: 180 }),
  dive: Object.freeze({ bearingDeg: null }),
});
/** The level runs: the approaches a roof station can answer (a 60-75 degree dive is past every station's elevation). */
export const LEVEL_APPROACHES = Object.freeze(['direct_front', 'direct_side', 'direct_rear']);
/** The pilot's tank, its front to the target: no roof station spends a round on the KV-2's front (stationAccepts: not a
 * quarter of it defeatable, even by a 30 mm at 30 m), and it has no roof station of its own. */
const DEFAULT_CARRIER = 'kv2';
const MAX_FLIGHT_S = AERIAL_RULES.drone.batteryS + 4;
const FPV_SHELL = 'FPV shaped charge';

function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const seedOf = (...parts) => createHash('sha256').update(parts.join('|')).digest().readUInt32LE(0);

/** One seed's geometry for an approach: always the same draws in the same order, whatever the vehicles. */
function counterDroneGeometry(approach, seedIndex) {
  const ap = COUNTER_DRONE_APPROACHES[approach];
  if (!ap) throw new Error(`unknown approach ${approach} (${Object.keys(COUNTER_DRONE_APPROACHES).join(', ')})`);
  const rnd = mulberry32(seedOf('cdx-v1', approach, seedIndex));
  const hullYaw = rnd() * Math.PI * 2;
  const jitter = (rnd() * 2 - 1) * 20 * Math.PI / 180;
  const sideSign = rnd() < .5 ? -1 : 1;
  const launchDist = 300 + rnd() * 120;
  const bornAt = 1 + rnd() * (2 * Math.PI / .73);
  const diveAlt = 70 + rnd() * 30, diveDeg = 60 + rnd() * 15;
  const turretRel = (rnd() * 2 - 1) * Math.PI;
  const mates = [0, 1, 2].map(() => ({ ang: rnd() * Math.PI * 2, dist: 12 + rnd() * 13, yaw: (rnd() * 2 - 1) * .35, turret: (rnd() * 2 - 1) * Math.PI }));
  // a station's barrel and burst are wherever its last engagement left them (a multi-station roof starts at rest, so its
  // traverse interlock starts clear)
  const stations = Array.from({ length: 8 }, () => ({ yaw: (rnd() * 2 - 1) * Math.PI, phase: rnd() }));
  const anyBearing = rnd() * 360;
  const bearingDeg = ap.bearingDeg === null ? anyBearing : ap.bearingDeg * (ap.bearingDeg === 90 ? sideSign : 1);
  const world = hullYaw + bearingDeg * Math.PI / 180 + (ap.bearingDeg === null ? 0 : jitter);
  return { approach, seedIndex, hullYaw, launchDist, bornAt, diveAlt, diveDeg, turretRel, mates, stations, bearingDeg, world, dive: ap.bearingDeg === null };
}

// A flat stub world: open ground at y = 0, no colliders, no obstacles (the authority's terrain trace takes the raycast).
const flatField = {
  getHeightAt: () => 0, getHeightAtFast: () => 0, getContactHeightAt: () => 0, maxY: 0, getGroundType: () => 'hard',
  getNormalAt: () => new Vector3(0, 1, 0), getContactNormalAt: (_x, _z, out) => out.set(0, 1, 0),
  *warmFastTilesAround() {},
};
const flatWorld = () => ({
  mapId: 'steppe', heightField: flatField,
  raycast(o, d, maxDist) { if (d.y >= -1e-9) return null; const t = -o.y / d.y; return t >= 0 && t <= maxDist ? { dist: t, normal: { x: 0, y: 1, z: 0 }, kind: 'terrain' } : null; },
  getObstacles: () => [], getColliders: () => [], queryObstacles: (_a, _b, _c, _d, out) => { if (out) { out.length = 0; return out; } return []; },
});

/** Loads the combat anatomy of `specIds` and the carrier (the authority reads specs only). */
export async function prepareCounterDrone(specIds, carrierId = DEFAULT_CARRIER) {
  const ids = [...new Set([...specIds, carrierId])];
  for (const id of ids) if (!TANK_SPECS[id]) throw new Error(`unknown spec ${id}`);
  await ensureAuthorityFleet(ids);
}


const idle = { throttle: 0, steer: 0, brake: true, fire: false, fireIntentSeq: null, aimLocked: true, shellSlot: 0, actionBits: 0, aimYaw: 0, aimPitch: 0, aimDistance: 100 };

/**
 * One attack run on the authority. `specIds[0]` is the attacked tank at the origin; later ids are its mates around it.
 * Returns the outcome ('downed' by the stations, 'strike' on a tank, 'other': ground, battery or link), its time from
 * launch, and the rounds each target tank's stations fired at the drone.
 */
export function engageCounterDrone({ specIds, approach, seed, carrierId = DEFAULT_CARRIER, matchSeed = 1000 }) {
  const g = counterDroneGeometry(approach, seed);
  const cx = Math.sin(g.world) * g.launchDist, cz = Math.cos(g.world) * g.launchDist;
  const seats = specIds.map((specId, i) => {
    const m = g.mates[i - 1];
    return i === 0 ? { id: 't0', specId, x: 0, z: 0, yaw: g.hullYaw, turret: g.turretRel }
      : { id: `t${i}`, specId, x: Math.sin(m.ang) * m.dist, z: Math.cos(m.ang) * m.dist, yaw: g.hullYaw + m.yaw, turret: m.turret };
  });
  const match = createAuthoritativeMatch({ players: [
    ...seats.map((s) => ({ id: s.id, specId: s.specId, team: 'alpha', spawn: { x: s.x, z: s.z, yaw: s.yaw } })),
    { id: 'pilot', specId: carrierId, team: 'bravo', spawn: { x: cx, z: cz, yaw: g.world + Math.PI } },
  ], mapId: 'steppe', seed: matchSeed + seed, countdownS: 0, gameMode: 'drone', worldCollision: flatWorld() });
  match.onMatchReady();
  const targets = seats.map((s, i) => {
    const e = match.entityById.get(s.id);
    e.state.pos.set(s.x, 0, s.z); e.state.yaw = s.yaw; e.state.turretYaw = s.turret;
    const aux = e.combat.auxiliary ??= createAuxiliaryState(e.spec), guns = AUXILIARY_INVENTORY[s.specId]?.guns ?? [], count = roofStationCount(e.spec);
    if (aux) for (let k = 0; k < count; k++) {
      const st = k === 0 ? aux : aux.stations?.[k - 1], draw = g.stations[(i * 2 + k) % g.stations.length];
      if (!st) continue;
      st.gunYaw = count > 1 || guns[k].yawArc ? 0 : draw.yaw;
      st.shots = Math.floor(draw.phase * auxiliaryWeaponProfile(guns[k].caliberMm, s.specId).burstRounds); st.nextShot = 0;
    }
    return e;
  });
  const target = targets[0], pilot = match.entityById.get('pilot');
  pilot.state.pos.set(cx, 0, cz); pilot.state.yaw = g.world + Math.PI;
  const shotsOf = (e) => { const a = e.combat.auxiliary; return a ? [a.shots ?? 0, ...(a.stations ?? []).map((s) => s.shots ?? 0)] : []; };
  const before = targets.map(shotsOf);
  const inputs = new Map(seats.map((s) => [s.id, null]));
  const centre = new Vector3(), aim = new Vector3();
  let launched = null, outcome = null, at = null, diving = false;
  const maxTicks = Math.ceil((g.bornAt + MAX_FLIGHT_S) / SIM_DT);
  for (let tick = 1; tick <= maxTicks && !outcome; tick++) {
    const t = tick * SIM_DT, v = pilot.aerial;
    let input = idle;
    if (launched === null) {
      if (t + 1e-9 >= g.bornAt) input = { ...idle, throttle: 1, brake: false, actionBits: PLAYER_ACTION_BITS.DRONE };
    } else if (v?.active) {
      centre.set(target.state.pos.x, target.state.pos.y + target.spec.dims.heightM * .5, target.state.pos.z);
      aim.copy(centre);
      if (g.dive && !v.launching) {
        // climb to the dive altitude on the way in, hold it, and nose over at the dive angle above the target
        const h = Math.hypot(centre.x - v.x, centre.z - v.z);
        if (diving || h <= g.diveAlt / Math.tan(g.diveDeg * Math.PI / 180)) diving = true;
        else if (v.y < g.diveAlt - 2) { const k = 60 / Math.max(h, 1); aim.set(v.x + (centre.x - v.x) * k, v.y + 40, v.z + (centre.z - v.z) * k); }
        else aim.set(centre.x, g.diveAlt, centre.z);
      }
      input = { ...idle, throttle: 1, brake: false, aimLocked: false, ...encodeAimIntent(v, aim) };
    }
    inputs.set('pilot', input);
    match.step({ dt: SIM_DT, inputs });
    if (launched === null && pilot.aerial?.active) launched = t;
    for (const ev of match.eventsForViewer('__counter_drone__')) {
      if (outcome) break;
      if (ev.type === 'drone_down' && ev.id === 'pilot') { outcome = 'downed'; at = t - launched; }
      else if (ev.type === 'shell_hit' && ev.shooterId === 'pilot' && ev.shellName === FPV_SHELL) { outcome = 'strike'; at = t - launched; }
    }
    match.afterEventBroadcast();
    if (!outcome && launched !== null && !pilot.aerial?.active) { outcome = 'other'; at = t - launched; }
  }
  const rounds = targets.map((e, i) => shotsOf(e).map((n, s) => n - (before[i][s] ?? 0)));
  return { approach, seed, outcome: outcome ?? 'timeout', at, rounds, totalRounds: rounds.flat().reduce((a, b) => a + b, 0) };
}

/**
 * The hover: the pilot's tank parks `distanceM` from the target off its bow (by `bearingDeg`), launches, and the drone
 * hovers (throttle 0, no climb: only the gusts move it) where its launch left it, about 12 m up. Every station of the
 * target engages it, so the rounds that bring it down are the airframe's threshold (AERIAL_RULES.drone.hitsToDown) in
 * the shares the stations land at that range (at about 33 m every round is capped at droneHitMax; at about 100 m every
 * round is below the cap) as the real authority fires and charges them: its station slew, bursts and pauses, the
 * GunContext's droneHit and strikeDrone. With `flights` > 1 the pilot relaunches as soon as the cooldown allows and the
 * next flight is engaged the same way (a flight starts with no strikes on it). Returns the first flight's rounds per
 * station, the time from its first round to the fall, whether it fell inside the first burst, and every flight's.
 */
export function hoverCounterDrone({ specId, distanceM = 30, bearingDeg = 0, carrierId = DEFAULT_CARRIER, seconds = 12, flights = 1 }) {
  const b = bearingDeg * Math.PI / 180, cx = Math.sin(b) * distanceM, cz = Math.cos(b) * distanceM;
  const match = createAuthoritativeMatch({ players: [
    { id: 't0', specId, team: 'alpha', spawn: { x: 0, z: 0, yaw: 0 } },
    { id: 'pilot', specId: carrierId, team: 'bravo', spawn: { x: cx, z: cz, yaw: b + Math.PI } },
  ], mapId: 'steppe', seed: 7, countdownS: 0, gameMode: 'drone', worldCollision: flatWorld() });
  match.onMatchReady();
  const target = match.entityById.get('t0'), pilot = match.entityById.get('pilot');
  target.state.pos.set(0, 0, 0); target.state.yaw = 0; target.state.turretYaw = 0;
  pilot.state.pos.set(cx, 0, cz); pilot.state.yaw = b + Math.PI; // its front to the target: no station spends a round on it
  const aux = target.combat.auxiliary ??= createAuxiliaryState(target.spec);
  const inputs = new Map([['t0', null]]);
  return hoverFlights({ specId, target, pilot, stations: [aux, ...(aux.stations ?? [])].slice(0, roofStationCount(target.spec)), seconds, flights,
    step(input) { inputs.set('pilot', input); match.step({ dt: SIM_DT, inputs }); },
    downed() { let down = false; for (const ev of match.eventsForViewer('__counter_drone__')) if (ev.type === 'drone_down' && ev.id === 'pilot') down = true; match.afterEventBroadcast(); return down; },
    aimInput: (v) => ({ ...idle, throttle: 0, brake: false, aimLocked: false, ...encodeAimIntent(v, target.state.pos) }),
    launchInput: () => ({ ...idle, throttle: 0, brake: false, actionBits: PLAYER_ACTION_BITS.DRONE }) });
}

/** The hover's flights, whichever sim steps them: a launch press while the drone is docked, the aim once it flies. */
function hoverFlights({ specId, target, pilot, stations, seconds, flights, step, downed, aimInput, launchInput }) {
  const burst = roofStations(specId).map((s) => s.burstRounds), done = [];
  let flight = null;
  for (let tick = 1; tick <= seconds / SIM_DT && done.length < flights; tick++) {
    const t = tick * SIM_DT, v = pilot.aerial;
    step(v?.active ? aimInput(v) : launchInput());
    if (pilot.aerial?.active && !flight) flight = { rounds: stations.map(() => 0), shots: stations.map((s) => s.shots), firstShotAt: null, rangeM: null };
    if (flight) stations.forEach((s, i) => {
      const fired = s.shots - flight.shots[i]; flight.shots[i] = s.shots;
      if (fired > 0 && flight.firstShotAt === null) { flight.firstShotAt = t; flight.rangeM = Math.hypot(v.x, v.y - target.spec.dims.heightM, v.z); }
      flight.rounds[i] += fired;
    });
    if (downed() && flight) { done.push({ rounds: flight.rounds, downAt: t, firstShotAt: flight.firstShotAt, rangeM: flight.rangeM }); flight = null; }
  }
  const rows = done.map((f) => ({ ...f, totalRounds: f.rounds.reduce((a, n) => a + n, 0), downedS: f.firstShotAt === null ? null : f.downAt - f.firstShotAt,
    insideFirstBurst: f.rounds.every((n, i) => n <= burst[i]) }));
  const first = rows[0] ?? { rounds: stations.map(() => 0), totalRounds: 0, downAt: null, firstShotAt: null, rangeM: null, downedS: null, insideFirstBurst: false };
  return { specId, ...first, flights: rows };
}

/**
 * The same hover in the solo battle (game/state.ts simStep: its own GunContext, droneHit and 'drone:down'), for a
 * receipt that already loads that module (`solo`: its createGameState, createBus and simStep; this module never
 * imports it). The two sims share stepAerial, the stations and strikeDrone; this is where they could part.
 */
export function soloHoverCounterDrone({ specId, solo, distanceM = 30, carrierId = DEFAULT_CARRIER, seconds = 12 }) {
  const game = solo.createGameState();
  game.ruleset = matchRulesetFor('drone');
  const tank = (id, sid, team, x, z, yaw) => {
    const spec = TANK_SPECS[sid], combat = createCombatState(spec);
    combat.equipMults = {};
    return { id, specId: sid, spec, isPlayer: false, team, combat, state: createTankState(spec, new Vector3(x, 0, z), yaw),
      input: { ...idle, aimPoint: new Vector3() },
      visual: { root: new Group(), gunMuzzleWorld: (out) => out.set(x, 2, z), gunDirWorld: (out) => out.set(0, 0, 1), recoilKick() {}, setDestroyed() {} } };
  };
  const target = tank('t0', specId, 'player', 0, 0, 0), pilot = tank('pilot', carrierId, 'enemy', 0, distanceM, Math.PI);
  game.tanks = [target, pilot]; game.allTanks = [target, pilot];
  for (const e of game.tanks) { game.tankById.set(e.id, e); initializeAerial(e, game.ruleset); }
  const aux = target.combat.auxiliary ??= createAuxiliaryState(target.spec);
  let down = false;
  const bus = solo.createBus((name, payload) => { if (name === 'drone:down' && payload.id === 'pilot') down = true; });
  const collider = { setSelf() {}, collide: () => false, pendingCrush: [], pendingRams: [], queueRam() {} };
  const world = { heightField: flatField, raycast: () => null };
  return hoverFlights({ specId, target, pilot, stations: [aux, ...(aux.stations ?? [])].slice(0, roofStationCount(target.spec)), seconds, flights: 1,
    step(input) { Object.assign(pilot.input, input); pilot.input.auxiliaryBits = input.actionBits; solo.simStep(game, bus, world, null, collider); },
    downed() { const d = down; down = false; return d; },
    aimInput: () => { pilot.input.aimPoint.copy(target.state.pos); return { ...idle, throttle: 0, brake: false, aimLocked: false }; },
    launchInput: () => ({ ...idle, throttle: 0, brake: false, actionBits: PLAYER_ACTION_BITS.DRONE }) });
}

/** One pilot run as the pins write it. */
export const pinnedRunRow = (r) => `${r.outcome[0]}:${r.rounds[0].join('/')}@${r.at === null ? '-' : Math.round(r.at / SIM_DT)}`;

/** Wilson 95 % interval for k of n, in percent. */
function wilson(k, n) {
  if (!n) return [NaN, NaN];
  const z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [100 * (c - h) / d, 100 * (c + h) / d];
}

/** `runs` seeded attack runs per approach (seeds seed0..seed0 + runs - 1) and their tally. */
export function counterDroneCell({ specIds, approaches = LEVEL_APPROACHES, runs, seed0 = 1, carrierId = DEFAULT_CARRIER }) {
  const rows = [];
  for (const approach of approaches) for (let i = 0; i < runs; i++) rows.push(engageCounterDrone({ specIds, approach, seed: seed0 + i, carrierId }));
  const n = rows.length, count = (o) => rows.filter((r) => r.outcome === o).length;
  const downed = count('downed');
  return { specIds, approaches, runs, seed0, n, downed, strike: count('strike'), other: count('other') + count('timeout'),
    downedPct: 100 * downed / n, downedCI: wilson(downed, n), engaged: rows.filter((r) => r.totalRounds > 0).length, rows };
}
