// Road crossings, driven (maps lane, 2026-10-03; after the physics lane's crossing sweep). On every road of the maps
// this lane rebuilt, each crossing a hull is most likely to meet something on — a bridge record, a terrain bridge deck,
// a causeway (the road 1.2 m or more over the ground 12 m to either side) — is driven both ways on the authority, from
// 40 m before it to 40 m past it, by a scripted driver that keeps to the road at road speed (14 m/s) and slows for its
// bends as a driver would (to the speed a 3.5 m/s² turn holds on the bend 16 m ahead). A building or rock standing in
// the carriageway stops that hull: the physics lane's sweep of all 33 maps found its hits on buildings and rocks
// 0.4-2 m from a road's centreline (Blackglass's civic hall across road 3 among them). The receipt holds that every run
// reaches its end without a hard contact (a collider impact of 3 m/s or more) and without stalling for 3 s.
// - Negative control: on 551f2fff6, with the civic hall still across road 3, Blackglass fails at its first causeway
//   (9.4 m/s against the hall at (-123.4, -83.6)).
// - Why the driver slows for bends: at a constant 14 m/s it leaves Tidegate Polders' and Highland Reservoir's
//   right-angle dike bends and meets the ground or a farm building 7-18 m off the road.
import assert from 'node:assert/strict';
import '../src/vehicles/fleetFactory.ts';
import { createAuthoritativeMatch } from '../src/sim/authoritativeMatch.ts';
import { IMPACT_SOURCE_COLLIDER } from '../src/sim/movement.ts';
import { collisionFootprintContainsPoint } from '../src/world/collision.ts';
import { createDedicatedWorldCollision } from './dedicatedWorldCollision.ts';

/** The maps the maps lane rebuilt to the layout brief, and Blackglass, whose district it cleared off the roads. */
const LANE_MAPS = ['desert', 'urban', 'railyard', 'frontier', 'saltwind', 'coastal', 'verdant', 'mangrove', 'badlands',
  'polders', 'delta', 'reservoir', 'monsoon', 'caldera', 'alpine', 'foundry', 'titan_gorge', 'skybridge', 'mars',
  'blackglass', 'ruinspires'];
// COT_CROSSING_MAPS=a,b narrows the run (a negative control on an older tree, or one map while authoring)
const MAPS = process.env.COT_CROSSING_MAPS
  ? process.env.COT_CROSSING_MAPS.split(',').filter((id) => LANE_MAPS.includes(id)) : LANE_MAPS;
const ROAD_SPEED = 14, LEAD_M = 40, STEP_M = 2, TURN_ACCEL = 3.5, LOOK_M = 16;
const HARD_CONTACT_MPS = 3, STALL_S = 3;
const input = (throttle, steer, brake) => ({ throttle, steer, brake, fire: false, aimLocked: true, aimYaw: 0,
  aimPitch: 0, aimDistance: 300, shellSlot: 0, actionBits: 0 });

function crossingsOf(world) {
  const hf = world.heightField;
  const bridges = world.getObstacles().filter((r) => r.kind === 'bridge');
  const decks = hf.bridgeDecks ?? [];
  const crossings = [];
  for (const road of hf._layout?.roads ?? []) {
    const pts = [];
    for (let i = 0; i + 1 < road.length; i++) {
      const [ax, az] = road[i], [bx, bz] = road[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / STEP_M));
      for (let k = 0; k < n; k++) pts.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
    }
    if (road.length) pts.push(road[road.length - 1]);
    const kindAt = (i) => {
      const [x, z] = pts[i];
      if (Math.max(Math.abs(x), Math.abs(z)) > 470) return null;
      if (bridges.some((r) => collisionFootprintContainsPoint(r, x, z, 0))) return 'bridge';
      for (const d of decks) {
        const dx = x - d.x, dz = z - d.z;
        if (Math.abs(dx * d.ux + dz * d.uz) <= d.halfLength && Math.abs(-dx * d.uz + dz * d.ux) <= d.halfWidth) return 'deck';
      }
      const j = Math.min(pts.length - 1, i + 1), k = Math.max(0, i - 1);
      const tx = pts[j][0] - pts[k][0], tz = pts[j][1] - pts[k][1], tl = Math.hypot(tx, tz) || 1;
      const nx = -tz / tl, nz = tx / tl;
      const side = Math.min(hf.getHeightAt(x + nx * 12, z + nz * 12), hf.getHeightAt(x - nx * 12, z - nz * 12));
      return hf.getHeightAt(x, z) - side >= 1.2 ? 'causeway' : null;
    };
    let start = -1, kind = null;
    for (let i = 0; i <= pts.length; i++) {
      const here = i < pts.length ? kindAt(i) : null;
      if (here && start < 0) { start = i; kind = here; } else if (here === 'bridge') kind = 'bridge';
      if (!here && start >= 0) {
        const lead = Math.round(LEAD_M / STEP_M);
        let a = Math.max(0, start - lead), b = Math.min(pts.length - 1, i - 1 + lead);
        const inside = (q) => Math.max(Math.abs(pts[q][0]), Math.abs(pts[q][1])) <= 455;
        while (a < start && !inside(a)) a++;
        while (b > i - 1 && !inside(b)) b--;
        if ((i - start) * STEP_M >= 6) crossings.push({ kind, pts: pts.slice(a, b + 1), entry: pts[start], spanM: (i - start) * STEP_M });
        start = -1; kind = null;
      }
    }
  }
  return crossings;
}

/** The speed the bend LOOK_M ahead holds: the heading turned over that stretch, as a radius, at TURN_ACCEL. */
function bendSpeed(path, idx) {
  const ahead = Math.round(LOOK_M / STEP_M);
  const p0 = path[idx], p1 = path[Math.min(path.length - 1, idx + 2)];
  const q0 = path[Math.min(path.length - 1, idx + ahead)], q1 = path[Math.min(path.length - 1, idx + ahead + 2)];
  const h0 = Math.atan2(p1[0] - p0[0], p1[1] - p0[1]), h1 = Math.atan2(q1[0] - q0[0], q1[1] - q0[1]);
  const turn = Math.abs(Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0)));
  if (turn < 0.05) return ROAD_SPEED;
  return Math.max(4, Math.min(ROAD_SPEED, Math.sqrt(TURN_ACCEL * LOOK_M / turn)));
}

function drive(mapId, path) {
  const world = createDedicatedWorldCollision(mapId);
  const [sx, sz] = path[0], [tx, tz] = path[Math.min(3, path.length - 1)];
  const match = createAuthoritativeMatch({ mapId, seed: 4242, countdownS: 0, worldCollision: world,
    players: [{ id: 'driver', specId: 'm551_sheridan', team: 'alpha' }, { id: 'idle', specId: 't90m', team: 'bravo' }] });
  match.onMatchReady();
  const driver = match.entityById.get('driver'), idle = match.entityById.get('idle');
  for (const entity of match.entities) entity.combat.hp = entity.combat.maxHp = 1e7;
  idle.state.pos.set(sx > 0 ? -460 : 460, 0, sz > 0 ? -460 : 460);
  idle.state.pos.y = world.heightField.getHeightAt(idle.state.pos.x, idle.state.pos.z);
  const st = driver.state;
  // set down on a deck when the run starts on one (a standable part's top over the ground), else on the ground
  let ground = world.heightField.getHeightAt(sx, sz);
  for (const r of world.getObstacles()) {
    if (r.crushable || !r.max || sx < r.min[0] || sx > r.max[0] || sz < r.min[2] || sz > r.max[2]) continue;
    for (const q of r.shape2?.kind === 'compound' ? r.shape2.parts : [r.shape2]) {
      if (!q) continue;
      const y0 = q.y0 ?? r.min[1], y1 = q.y1 ?? r.max[1];
      if (y1 - y0 >= 0.9 && y1 > ground && y1 < ground + 60
        && collisionFootprintContainsPoint({ min: r.min, max: r.max, shape2: q }, sx, sz, 0)) ground = y1;
    }
  }
  st.pos.set(sx, ground, sz);
  st._ride.y = ground; st._ride.v = 0; st._sup.x = NaN;
  st.yaw = Math.atan2(tx - sx, tz - sz); st.speed = bendSpeed(path, 0) * 0.8; st._prevSpeed = st.speed;
  const inputs = new Map();
  let idx = 0, hard = 0, hardAt = null, stall = 0, worstStall = 0, stallAt = null, reached = false;
  const maxTicks = Math.round(((path.length * STEP_M) / 6 + 12) * 60);
  for (let tick = 0; tick < maxTicks && !match.result; tick++) {
    while (idx + 1 < path.length && Math.hypot(path[idx + 1][0] - st.pos.x, path[idx + 1][1] - st.pos.z)
      < Math.hypot(path[idx][0] - st.pos.x, path[idx][1] - st.pos.z) + 0.01) idx++;
    if (idx >= path.length - 2) { reached = true; break; }
    const look = path[Math.min(path.length - 1, idx + 4)];
    const error = Math.atan2(look[0] - st.pos.x, look[1] - st.pos.z) - st.yaw;
    const steer = Math.max(-1, Math.min(1, Math.atan2(Math.sin(error), Math.cos(error)) * 2.2));
    const target = bendSpeed(path, idx);
    inputs.set('driver', input(st.speed < target ? 1 : 0, steer, st.speed > target + 1.5));
    match.step({ dt: 1 / 60, inputs });
    if (st.impactSource === IMPACT_SOURCE_COLLIDER && st.impactMps > hard) {
      hard = st.impactMps; hardAt = [+st.pos.x.toFixed(1), +st.pos.z.toFixed(1)];
    }
    if (Math.abs(st.speed) < 1) {
      stall += 1 / 60;
      if (stall > worstStall) { worstStall = stall; stallAt = [+st.pos.x.toFixed(1), +st.pos.z.toFixed(1)]; }
    } else stall = 0;
    if (tick % 15 === 0) { match.snapshot({ tick, serverTimeMs: tick * 1000 / 60 }); match.afterSnapshotBroadcast(); }
  }
  return { hard, hardAt, worstStall, stallAt, reached };
}

const summary = [];
let runs = 0;
for (const mapId of MAPS) {
  const crossings = crossingsOf(createDedicatedWorldCollision(mapId));
  let worstHard = 0, worstStall = 0;
  for (const crossing of crossings) {
    for (const dir of [1, -1]) {
      const path = dir > 0 ? crossing.pts : [...crossing.pts].reverse();
      const run = drive(mapId, path);
      runs++;
      const where = `${mapId} ${crossing.kind} at (${crossing.entry.map((v) => v.toFixed(0))}) ${dir > 0 ? 'forward' : 'back'}`;
      assert.ok(run.hard < HARD_CONTACT_MPS, `${where}: no hard contact on the road (${run.hard.toFixed(1)} m/s at ${run.hardAt})`);
      assert.ok(run.worstStall < STALL_S, `${where}: no stall (${run.worstStall.toFixed(1)} s at ${run.stallAt})`);
      assert.ok(run.reached, `${where}: the run reaches its end`);
      worstHard = Math.max(worstHard, run.hard); worstStall = Math.max(worstStall, run.worstStall);
    }
  }
  summary.push(`${mapId} ${crossings.length}`);
}
console.log(`roadCrossingSweep.selftest: ${runs} runs over ${MAPS.length} maps' crossings, each clear (${summary.join(', ')})`);
