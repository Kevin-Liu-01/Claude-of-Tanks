// A collider stop (physics lane, 2026-10-04; the coordinator's defect 2 from Tidegate Polders pacing seed 41002 on the
// merged tree): a UA M1A1 turning a route corner ran into a farm building's wall at 6 m/s and stayed against it until it
// was hit, 7.6 s later, fighting from the wall the enemy it saw half a second after the stop. A stop against a solid
// primitive backs the hull off at once (updateColliderRecovery in ai.ts). Real movement drives the hull with the walls
// pushed against its length, as the authority pushes its contact rectangle.
import { Vector3 } from 'three';
// Register the same complete production specs without executing roster tests.
import '../vehicles/fleetFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createTankState, updateTank, SIM_DT, IMPACT_SOURCE_COLLIDER } from '../sim/movement.ts';
import { createAI, mulberry32 } from './ai.ts';

let failures = 0;
function ok(cond, label) {
  if (cond) console.log(`  ok  ${label}`);
  else { failures++; console.error(`FAIL  ${label}`); }
}

const flat = { getHeightAt: () => 0, getNormalAt: () => ({ x: 0, y: 1, z: 0 }), getGroundType: () => 'firm' };

function entity(id, specId, team, x, z, yaw = 0) {
  const spec = getSpec(specId);
  const state = createTankState(spec, new Vector3(x, 0, z), yaw);
  return {
    id, specId, spec, team, state,
    combat: {
      hp: spec.hp, maxHp: spec.hp, destroyed: false,
      reload: { t: 0, totalS: spec.gun.reloadS, kind: 'ready' }, shellSlot: 0,
      modules: {}, crew: {}, fire: { burning: false, tickTimer: 0, ticksLeft: 0 }, magazine: null,
    },
    input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: new Vector3(), shellSlot: 0, actionBits: 0 },
    aiCtl: null,
  };
}

function controller(bot, { enemies = [], obstacles = [], spotted = () => true } = {}) {
  const ctl = createAI(bot, {
    difficulty: 'normal',
    rng: mulberry32(52),
    deps: {
      heightField: flat,
      raycast: () => null,
      getEnemies: () => enemies,
      getAllies: () => [],
      getObstacles: () => obstacles,
      spotting: { isSpotted: () => spotted() },
    },
  });
  bot.aiCtl = ctl;
  return ctl;
}

/** The authority's contact on a hull's length: three discs along it pushed out of each box. */
function discCollider(hull, boxes) {
  return (pos, _radius, out) => {
    const r = hull.spec.dims.widthM * 0.5, reach = Math.max(0, hull.spec.dims.hullLengthM * 0.5 - r);
    const fx = Math.sin(hull.state.yaw), fz = Math.cos(hull.state.yaw);
    let px = 0, pz = 0;
    for (const along of [-reach, 0, reach]) {
      const sx = pos.x + fx * along + px, sz = pos.z + fz * along + pz;
      for (const o of boxes) {
        const cx = Math.max(o.min[0], Math.min(sx, o.max[0])), cz = Math.max(o.min[2], Math.min(sz, o.max[2]));
        const d = Math.hypot(sx - cx, sz - cz);
        if (d < r && d > 1e-6) { px += (sx - cx) / d * (r - d); pz += (sz - cz) / d * (r - d); }
      }
    }
    out.set(px, 0, pz);
    return px !== 0 || pz !== 0;
  };
}

/** Real movement from t = 300 s; returns per tick through onTick. */
function drive(bot, ctl, seconds, collide, onTick) {
  for (let i = 0; i < seconds / SIM_DT; i++) {
    const t = 300 + i * SIM_DT;
    ctl.update(SIM_DT, t);
    bot.combat.reload.t = Math.max(0, bot.combat.reload.t - SIM_DT);
    updateTank(bot, flat, SIM_DT, collide);
    if (onTick && onTick(i * SIM_DT, t) === false) break;
  }
}

// a farm building's north wall across the hull's path, 12 m wide
const WALL = { min: [-6, -1, 0], max: [6, 5, 3], kind: 'building' };

/**
 * An M1A1 at 6 m/s with its bow 0.6 m short of the wall and its patrol leg's goal beyond its east end. `contactAt`
 * spots an idle enemy that long after the stop. Returns when the stop came, how far the hull got off the wall 1.5 s
 * later, the reverse it drove in the first second and the turn its bow made toward the goal's side.
 */
function wallCase({ contactAt = null } = {}) {
  const bot = entity('bot', 'ua_m1a1', 'enemy', -2, -0.6 - 0.5 * getSpec('ua_m1a1').dims.hullLengthM, 0);
  bot.state.speed = 6;
  const host = entity('host', 'm1a2', 'player', 60, -80, 0);
  host.isPlayer = true;
  let seen = false;
  const ctl = controller(bot, { enemies: [host], obstacles: [WALL], spotted: () => seen });
  ctl.setWaypoints([[20, 30]], { loop: false });
  const collide = discCollider(bot, [WALL]);
  let stopAt = null, reverseS = 0, gapAt15 = null, yawAtStop = 0, yawAt15 = 0, engaged = false;
  const front = () => WALL.min[2] - (bot.state.pos.z + 0.5 * bot.spec.dims.hullLengthM * Math.cos(bot.state.yaw));
  drive(bot, ctl, 4, collide, (t) => {
    if (stopAt === null && bot.state.impactSource === IMPACT_SOURCE_COLLIDER && bot.state.impactMps >= 2) {
      stopAt = t;
      yawAtStop = bot.state.yaw;
    }
    if (stopAt === null) return;
    if (contactAt !== null && t - stopAt >= contactAt) seen = true;
    if (ctl.debugInfo().mode === 'engage') engaged = true;
    if (t - stopAt <= 1 && bot.input.throttle < -0.1) reverseS += SIM_DT;
    if (gapAt15 === null && t - stopAt >= 1.5) {
      gapAt15 = front();
      yawAt15 = bot.state.yaw;
    }
  });
  return { stopAt, reverseS, gapAt15: gapAt15 ?? NaN, turn: yawAt15 - yawAtStop, engaged, stops: ctl.debugInfo().colliderStops };
}

console.log('[1] a hull that runs into a wall at speed backs off at once, its bow swinging toward its goal\'s side');
{
  const c = wallCase();
  ok(c.stopAt !== null, `fixture: the wall stops the hull (at ${c.stopAt?.toFixed(2) ?? 'never'} s)`);
  ok(c.stops === 1 && c.reverseS > 0.6, `it reverses within a second of the stop (${c.reverseS.toFixed(2)} s of reverse, ${c.stops} collider stops)`);
  ok(c.gapAt15 > 1, `and is off the wall 1.5 s after it (${c.gapAt15.toFixed(2)} m from the face)`);
  ok(c.turn > 0.1, `its bow turned toward the goal's side, east (${c.turn.toFixed(2)} rad)`);
}

console.log('[2] an enemy sighted just after the stop does not hold the hull against the wall');
{
  const c = wallCase({ contactAt: 0.3 });
  ok(c.engaged, 'fixture: it engages the enemy');
  ok(c.reverseS > 0.6 && c.gapAt15 > 1, `it still backs off the wall (${c.reverseS.toFixed(2)} s of reverse, ${c.gapAt15.toFixed(2)} m off at 1.5 s)`);
}

console.log('[3] a scrape that keeps its speed is no stop, and a hull is no wall');
{
  // the movement's report on one tick, read by the controller: what the contact took and what the hull kept
  const probe = (lost, kept, obstacles) => {
    const bot = entity('bot', 'ua_m1a1', 'enemy', 0, -5, 0);
    const ctl = controller(bot, { obstacles });
    ctl.setWaypoints([[0, 200]], { loop: false });
    ctl.update(SIM_DT, 300);
    bot.state.speed = kept;
    bot.state.impactSource = IMPACT_SOURCE_COLLIDER;
    bot.state.impactMps = lost;
    bot.state.impactNx = 0;
    bot.state.impactNz = -1; // pushed back off a face ahead
    ctl.update(SIM_DT, 300 + SIM_DT);
    return ctl.debugInfo().colliderStops;
  };
  const ahead = [{ min: [-6, -1, -5 + 0.5 * getSpec('ua_m1a1').dims.hullLengthM + 0.2], max: [6, 5, 0], kind: 'building' }];
  ok(probe(6, 0.4, ahead) === 1, 'control: a face that took 6 of 6.4 m/s is a stop');
  ok(probe(2, 6, ahead) === 0, 'a scrape that took 2 m/s and kept 6 is not');
  ok(probe(6, 0.4, []) === 0, 'nor is a stop with no world obstacle on that side (another hull)');
}

if (failures) {
  console.error(`ai.colliderStop.selftest: ${failures} failure(s)`);
  process.exit(1);
}
console.log('ai.colliderStop.selftest: ok');
