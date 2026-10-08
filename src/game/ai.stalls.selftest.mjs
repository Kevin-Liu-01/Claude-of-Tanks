// Bots that never get stuck (bots lane, 2026-10-02): each section reproduces a stall the maps lane's battles found
// (or that tracing them uncovered) in a deterministic fixture, and asserts the behaviour that ends it. Real
// movement drives the hull (updateTank) wherever the stall lived in the motion; the walls are pushed against the
// hull's length the way the authority pushes its contact rectangle. Before the fixes every section fails on the
// stall it names; see docs/BOT-TACTICS.md, "Traffic and keeping the battle moving".
import { Vector3 } from 'three';
// Register the same complete production specs without executing roster tests.
import '../vehicles/fleetFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.ts';
import { createAI, mulberry32 } from './ai.ts';

let failures = 0;
function ok(cond, label) {
  if (cond) console.log(`  ok  ${label}`);
  else { failures++; console.error(`FAIL  ${label}`); }
}

const flat = {
  getHeightAt: () => 0,
  getNormalAt: () => ({ x: 0, y: 1, z: 0 }),
  getGroundType: () => 'firm',
};

function entity(id, specId, team, x, z, yaw = 0, hp = null) {
  const spec = getSpec(specId);
  const state = createTankState(spec, new Vector3(x, 0, z), yaw);
  return {
    id, specId, spec, team, state,
    combat: {
      hp: hp ?? spec.hp, maxHp: spec.hp, destroyed: false,
      reload: { t: 0, totalS: spec.gun.reloadS, kind: 'ready' }, shellSlot: 0,
      modules: {}, crew: {}, fire: { burning: false, tickTimer: 0, ticksLeft: 0 },
      magazine: null,
    },
    input: {
      throttle: 0, steer: 0, brake: false, fire: false,
      aimPoint: new Vector3(), shellSlot: 0, actionBits: 0,
    },
    aiCtl: null,
  };
}

function controller(bot, { enemies = [], allies = [], seed = 73, ...deps } = {}) {
  const ctl = createAI(bot, {
    difficulty: 'normal',
    rng: mulberry32(seed),
    deps: {
      heightField: flat,
      raycast: () => null,
      getEnemies: () => enemies,
      getAllies: () => allies,
      getObstacles: () => [],
      spotting: { isSpotted: () => true },
      ...deps,
    },
  });
  bot.aiCtl = ctl;
  return ctl;
}

const box = (x0, z0, x1, z1) => ({ min: [x0, -1, z0], max: [x1, 6, z1], kind: 'building' });

/** Push a hull out of solid boxes: three discs of its half-width along its length. */
function boxCollider(hull, boxes) {
  return (pos, _radius, out) => {
    const r = hull.spec.dims.widthM * 0.5;
    const reach = Math.max(0, hull.spec.dims.hullLengthM * 0.5 - r);
    const fx = Math.sin(hull.state.yaw), fz = Math.cos(hull.state.yaw);
    let px = 0, pz = 0;
    for (const along of [-reach, 0, reach]) {
      const sx = pos.x + fx * along + px, sz = pos.z + fz * along + pz;
      for (const o of boxes) {
        const cx = Math.max(o.min[0], Math.min(sx, o.max[0]));
        const cz = Math.max(o.min[2], Math.min(sz, o.max[2]));
        const d = Math.hypot(sx - cx, sz - cz);
        if (d < r && d > 1e-6) { px += (sx - cx) / d * (r - d); pz += (sz - cz) / d * (r - d); }
      }
    }
    if (px === 0 && pz === 0) return false;
    out.x = px;
    out.z = pz;
    return true;
  };
}

/** A world raycast against the boxes (slab test on the xz footprint, the boxes standing on y = 0..6). */
function boxRaycast(boxes) {
  return (origin, dir, maxDist) => {
    let best = null;
    for (const o of boxes) {
      let t0 = 0, t1 = maxDist, hit = true;
      for (const [o0, d0, lo, hi] of [[origin.x, dir.x, o.min[0], o.max[0]], [origin.y, dir.y, o.min[1], o.max[1]],
        [origin.z, dir.z, o.min[2], o.max[2]]]) {
        if (Math.abs(d0) < 1e-9) { if (o0 < lo || o0 > hi) { hit = false; break; } continue; }
        let a = (lo - o0) / d0, b = (hi - o0) / d0;
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, b);
        if (t0 > t1) { hit = false; break; }
      }
      if (hit && (!best || t0 < best.dist)) best = { dist: t0 };
    }
    return best;
  };
}

/** Run one bot with real movement; a shot leaves the gun when the trigger is pulled on a loaded gun. */
function drive(bot, ctl, seconds, { startS = 20, collide = null, onTick = null } = {}) {
  let shots = 0;
  for (let i = 0; i < seconds / SIM_DT; i++) {
    const t = startS + i * SIM_DT;
    ctl.update(SIM_DT, t);
    if (bot.input.fire && bot.combat.reload.t <= 0) {
      shots++;
      bot.combat.reload.t = bot.spec.gun.reloadS;
      if (Array.isArray(bot.combat.ammo)) bot.combat.ammo[bot.input.shellSlot] -= 1;
    }
    bot.combat.reload.t = Math.max(0, bot.combat.reload.t - SIM_DT);
    updateTank(bot, flat, SIM_DT, collide);
    if (onTick && onTick(i * SIM_DT) === false) break;
  }
  return shots;
}

console.log('[1] a parked human across the route: the committed passing path is driven, not cancelled');
// Cinder Junction 7v7 seed 72839: the detour's pivot (-1) plus the head-on evasive nudge (+1) left the hull at 0
// behind the idle host for 239 s. The bow angles cover the head-on rule; the near placements need the reverse
// escape to open room to turn before the passing path.
for (const team of ['player', 'enemy']) {
  for (const [specId, dx, dz, deg] of [
    ['type99a', 2, 10, 160], ['type99a', 4, 10, -135], ['type99a', 3, 12, 110], ['type99a', 1, 8, 180],
    ['m1a2', 1, 10, 135], ['m1a2', 2, 10, -160], ['m1a2', 1, 9, 110],
  ]) {
    const bot = entity('a-bot', specId, team, 0, 0, 0);
    const human = entity('z-human', 'm1a2', team, dx, dz, deg * Math.PI / 180);
    human.isPlayer = true;
    const ctl = controller(bot, { allies: [human] });
    ctl.setWaypoints([[0, 200]], { loop: false });
    let passedS = null, closest = Infinity;
    drive(bot, ctl, 40, { onTick: (t) => {
      closest = Math.min(closest, bot.state.pos.distanceTo(human.state.pos));
      if (passedS === null && bot.state.pos.z > dz + 12) passedS = t;
    } });
    ok(passedS !== null && passedS < 30 && closest > 6,
      `${team}: ${specId} passes a parked human at (${dx}, ${dz}) bow ${deg} deg in ${passedS?.toFixed(1) ?? 'never'} s (closest ${closest.toFixed(1)} m)`);
  }
}

console.log('[2] the bounded yield: a parked human in a walled lane is given way past, a moving lead is not');
for (const team of ['player', 'enemy']) {
  // walls beside the human close the ordinary passing lane on both sides; the wider lane round them is open
  const walls = [box(7, 8, 10, 22), box(-10, 8, -7, 22)];
  const bot = entity('a-bot', 'type99a', team, 0, 0, 0);
  const human = entity('z-human', 'm1a2', team, 0, 16, Math.PI / 2);
  human.isPlayer = true;
  const ctl = controller(bot, { allies: [human], getObstacles: () => walls });
  ctl.setWaypoints([[0, 200]], { loop: false });
  let passedS = null, closest = Infinity, yieldRun = 0, longestYield = 0;
  drive(bot, ctl, 60, { collide: boxCollider(bot, walls), onTick: (t) => {
    yieldRun = ctl.debugInfo().allyYielding ? yieldRun + SIM_DT : 0;
    longestYield = Math.max(longestYield, yieldRun);
    closest = Math.min(closest, bot.state.pos.distanceTo(human.state.pos));
    if (passedS === null && bot.state.pos.z > 31) passedS = t;
  } });
  ok(passedS !== null && passedS < 45,
    `${team}: the held bot gives way and passes on the wider lane (${passedS?.toFixed(1) ?? 'never'} s)`);
  ok(longestYield < 10.5, `${team}: no single yield to the parked hull outlasts the bound (${longestYield.toFixed(1)} s)`);
  ok(closest > 8, `${team}: the give-way keeps clear of the human (${closest.toFixed(1)} m)`);
}
for (const team of ['player', 'enemy']) {
  // control: a lead moving at 3 m/s ahead in the lane is traffic, not a parked hull
  const bot = entity('z-follow', 'm1a2', team, 0, 0, 0);
  const lead = entity('a-lead', 'm1a2', team, 0, 14, 0);
  const ctl = controller(bot, { allies: [lead] });
  ctl.setWaypoints([[0, 400]], { loop: false });
  let closest = Infinity;
  drive(bot, ctl, 30, { onTick: () => {
    lead.state.speed = 3;
    lead.state.pos.z += 3 * SIM_DT;
    closest = Math.min(closest, bot.state.pos.distanceTo(lead.state.pos));
  } });
  ok(ctl.debugInfo().allyHoldGiveWays === 0 && closest > 8,
    `${team}: a follower behind a moving lead never gives way (${ctl.debugInfo().allyHoldGiveWays} give-ways, closest ${closest.toFixed(1)} m)`);
}

console.log('[3] oncoming traffic passes side by side instead of stopping on every predicted crossing');
// The nose-to-nose gap stop fired on hulls that were passing outside the lane: every stop ended the predicted
// crossing and every restart re-armed it, 40-365 stops and 19-36 s per pair.
for (const [specA, specB, gap, offset] of [['m1a2', 'm1a2', 28, 0], ['type99a', 'leclerc', 32, 1], ['k2', 'm1a2', 26, -1]]) {
  const a = entity('a-route', specA, 'player', 0, 0);
  const b = entity('z-route', specB, 'player', offset, gap, Math.PI);
  const ca = controller(a, { allies: [b] });
  const cb = controller(b, { allies: [a], seed: 74 });
  ca.setWaypoints([[0, 160]], { loop: false });
  cb.setWaypoints([[0, -160]], { loop: false });
  let passedS = null, closest = Infinity;
  for (let i = 0; i < 30 / SIM_DT; i++) {
    ca.update(SIM_DT, 20 + i * SIM_DT);
    cb.update(SIM_DT, 20 + i * SIM_DT);
    updateTank(a, flat, SIM_DT);
    updateTank(b, flat, SIM_DT);
    closest = Math.min(closest, a.state.pos.distanceTo(b.state.pos));
    if (passedS === null && a.state.pos.z > b.state.pos.z + 12) passedS = i * SIM_DT;
  }
  ok(passedS !== null && passedS < 12 && closest > 6,
    `${specA} and ${specB} pass head-on in ${passedS?.toFixed(1) ?? 'never'} s (closest ${closest.toFixed(1)} m)`);
}

console.log('[4] a rack that cannot hurt the target stops pressing it');
// Frontier Basin 7v7 seed 88677: the last bravo Challenger 2 held only L34 WP smoke rounds against the idle M1A2
// and pressed for six minutes without firing until the 900 s cap. The bot keeps a teammate with rounds aboard, out
// beyond support range, which the retirement leaves the finish to; with no teammate left that can fire a run the ram
// law refuses is the last run (ai.lastRun.selftest).
function smokeOnly(hp, ammo = [0, 0, 12]) {
  const bot = entity('bot', 'challenger2', 'enemy', 0, 0, 0, hp);
  bot.combat.ammo = ammo.slice();
  bot.combat.ammoCapacity = [16, 16, 12];
  const host = entity('host', 'm1a2', 'player', 8, 80, Math.PI);
  host.isPlayer = true;
  const teammate = entity('mate', 't90m', 'enemy', -450, -450); // 636 m off: no support to retire to
  const ctl = controller(bot, { enemies: [host], allies: [teammate], seed: 91 });
  return { bot, host, ctl };
}
{
  const { bot, host, ctl } = smokeOnly(null);
  let rammingS = null;
  const shots = drive(bot, ctl, 120, { startS: 200, onTick: (t) => {
    if (rammingS === null && ctl.debugInfo().ramming) rammingS = t;
  } });
  ok(shots === 0, 'a smoke round is never fired at the armour it cannot hurt');
  ok(rammingS !== null && rammingS < 80,
    `with the hull to spare the ram law allows it, the spent rack rams (${rammingS?.toFixed(0) ?? 'never'} s)`);
  void host;
}
{
  const { bot, host, ctl } = smokeOnly(391);
  let farS = null;
  drive(bot, ctl, 140, { startS: 200, onTick: (t) => {
    if (farS === null && bot.state.pos.distanceTo(host.state.pos) > 240) farS = t;
  } });
  ok(farS !== null && farS < 100, `a hull the ram would kill retires past 240 m instead (${farS?.toFixed(0) ?? 'never'} s)`);
  ok(ctl.debugInfo().rackSpentVerdicts >= 1, 'the retirement comes from the spent-rack verdict');
}
{
  const { bot, ctl } = smokeOnly(null, [10, 0, 12]);
  const shots = drive(bot, ctl, 60, { startS: 200 });
  ok(shots > 0 && ctl.debugInfo().rackSpentVerdicts === 0, `control: with APFSDS aboard the same bot fires (${shots} shots)`);
}

console.log('[5] a zone holder that cannot fight from where it stands shifts inside the zone');
// Cinder Junction frontline seed 72839: both sides held the last line 17 m apart, every gate shut, for 640 s; on
// Steinburg a defender held its line 119 s with no sight of its target. The mission owned the hull.
function zoneHolder({ blocked }) {
  const zone = { mission: 'assault', x: 0, z: 60, radiusM: 30 };
  const walls = blocked ? [box(-2.5, 70, 2.5, 73)] : [];
  const bot = entity('holder', 'type59', 'enemy', 0, 60, 0);
  bot.combat.ammo = [20, 0, 0]; // the kinetic round only: no HE burst to fall back on
  bot.combat.ammoCapacity = [20, 20, 20];
  // bow on at the zone's far edge: the Type 59's rounds shut on its front (ratio 0.8) and open on its side
  const foe = entity('foe', 'leo2a7v', 'player', 0, 85, Math.PI);
  const ctl = controller(bot, {
    enemies: [foe], getObjective: () => zone, getObstacles: () => walls,
    ...(blocked ? { raycast: boxRaycast(walls) } : {}),
  });
  let maxFromCentre = 0;
  const shots = drive(bot, ctl, 40, { startS: 300, collide: boxCollider(bot, walls), onTick: () => {
    maxFromCentre = Math.max(maxFromCentre, Math.hypot(bot.state.pos.x - zone.x, bot.state.pos.z - zone.z));
  } });
  return { shots, maxFromCentre, ctl };
}
{
  const { shots, maxFromCentre } = zoneHolder({ blocked: false });
  ok(shots > 0, `a shut frontal gate: the holder shifts round to a side and fires (${shots} shots)`);
  ok(maxFromCentre < 30, `and stays on the zone (${maxFromCentre.toFixed(1)} m from its centre)`);
}
{
  const { shots, maxFromCentre } = zoneHolder({ blocked: true });
  ok(shots > 0, `no sight line from the centre: the holder shifts into sight and fires (${shots} shots)`);
  ok(maxFromCentre < 30, `and stays on the zone (${maxFromCentre.toFixed(1)} m from its centre)`);
}

console.log('[6] a mission route that ends short of its objective releases the hull');
// Cinder Junction frontline seed 72839: a Challenger 2 stood 494 s at its route end, 192 m short of the line.
{
  const zone = { mission: 'assault', x: 0, z: 400, radiusM: 30 };
  const bot = entity('attacker', 'm60a3', 'enemy', 0, 0, 0);
  const foe = entity('defender', 'leo2a7v', 'player', 0, 330, Math.PI);
  // the planner's best reaches z = 140: beyond it lies another connected component for this hull
  const planRoute = (start) => (start.z < 134 ? [[0, Math.min(140, start.z + 60)], [0, 140]] : [[start.x, start.z]]);
  const ctl = controller(bot, { enemies: [foe], getObjective: () => zone, planRoute });
  const routeEnd = new Vector3(0, 0, 140);
  let leftEnd = 0;
  const shots = drive(bot, ctl, 90, { startS: 300, onTick: (t) => {
    if (t > 30) leftEnd = Math.max(leftEnd, bot.state.pos.distanceTo(routeEnd));
  } });
  ok(leftEnd > 25 || shots > 0, `the attacker leaves its route end to fight (${leftEnd.toFixed(0)} m from it, ${shots} shots)`);
  ok(ctl.debugInfo().missionReleases >= 1, 'through the mission release');
}

console.log('[7] a hull that has arrived holds its destination; a wedged one still backs off');
// Battles on every objective mode: a zone holder with nobody in sight reversed off its hold point every 4-5 s,
// because the arrival itself counted as drive intent and the low-speed watchdog read the hold as a wedge.
function arrivalRun(specId, walls) {
  const zone = { mission: 'capture', x: 0, z: 60, radiusM: 30 };
  const bot = entity('holder', specId, 'enemy', 0, 0, 0);
  const ctl = controller(bot, { getObjective: () => zone });
  let arrivedS = null, reverses = 0, reversing = false, path = 0;
  let px = 0, pz = 0;
  drive(bot, ctl, walls.length ? 30 : 100, { startS: 300, collide: boxCollider(bot, walls), onTick: (t) => {
    const st = bot.state;
    if (arrivedS === null && Math.hypot(st.pos.x - zone.x, st.pos.z - zone.z) < 20 && Math.abs(st.speed) < 0.5) {
      arrivedS = t;
    }
    const counting = walls.length ? true : arrivedS !== null && t > arrivedS + 5;
    const back = bot.input.throttle < -0.05;
    if (counting && back && !reversing) reverses++;
    reversing = back;
    if (counting) path += Math.hypot(st.pos.x - px, st.pos.z - pz);
    px = st.pos.x; pz = st.pos.z;
  } });
  return { arrivedS, reverses, path };
}
for (const specId of ['m1a2', 'type59']) {
  const { arrivedS, reverses, path } = arrivalRun(specId, []);
  ok(arrivedS !== null && reverses === 0 && path < 1,
    `${specId}: arrived at ${arrivedS?.toFixed(0) ?? 'never'} s, then ${reverses} reverses and ${path.toFixed(1)} m in 90 s`);
}
{
  const { reverses } = arrivalRun('m1a2', [box(-40, 12, 40, 14)]);
  ok(reverses >= 1, `control: a hull wedged on a wall short of the zone still backs off (${reverses} reverses)`);
}

if (failures) {
  console.error(`ai.stalls.selftest: ${failures} failure(s)`);
  process.exit(1);
}
console.log('ai.stalls.selftest: all passed');
