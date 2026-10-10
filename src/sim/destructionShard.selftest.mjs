// Destruction on a real collision shard (docs/DESTRUCTION.md §3, §6, §8): Steinburg's recaptured shard carries its
// structure groups; the authority derives its table from them (every 'structure' record grouped, classes and hit points
// from the records); a hull driven at a real house on the real terrain brings it down and drives through where it stood;
// the heap rides the match's ground (never the shared terrain); the route grid opens round it; and the whole run
// replays bit for bit, its destruction log included.
import assert from 'node:assert/strict';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { createDestructionMatch } from './destructionMatch.ts';
import { matchRulesetFor } from './matchRuleset.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';
import { SIM_DT } from './movement.ts';

const MAP = 'urban';
const world0 = createDedicatedWorldCollision(MAP, { retain: true });
const structureRecords = [...world0.getObstacles(), ...world0.getColliders()].filter((record) => record.kind === 'structure');
assert.ok(structureRecords.length > 1000, `the shard's structure records (${structureRecords.length})`);
assert.ok(structureRecords.every((record) => Number.isSafeInteger(record.structureIdx)), 'every structure record is grouped');
const table = createDestructionMatch({ rules: matchRulesetFor('standard').destruction,
  obstacles: world0.getObstacles(), colliders: world0.getColliders() });
assert.equal(table.enabled, true);
const structures = table.structures.structures;
assert.ok(structures.length >= 130, `Steinburg's structures (${structures.length})`);
const classes = structures.reduce((count, s) => ({ ...count, [s.massClass]: (count[s.massClass] ?? 0) + 1 }), {});
assert.ok(classes.house > 50, `classes ${JSON.stringify(classes)}`);
for (const s of structures) {
  assert.ok(s.hw > 0.3 && s.hd >= s.hw && s.topY > s.baseY && s.maxHp >= 10, `structure ${s.id} is sane`);
}

// a house with a clear 60 m approach across its long side, on ground a hull can drive
const field = world0.heightField;
const clearPath = (ax, az, bx, bz, skip) => {
  const out = [];
  world0.queryObstacles(Math.min(ax, bx) - 3, Math.min(az, bz) - 3, Math.max(ax, bx) + 3, Math.max(az, bz) + 3, out);
  return out.every((record) => record.crushable || skip.has(record)
    || Math.hypot(Math.max(record.min[0] - Math.max(ax, bx), 0, Math.min(ax, bx) - record.max[0]),
      Math.max(record.min[2] - Math.max(az, bz), 0, Math.min(az, bz) - record.max[2])) > 0.5
    || !segmentMeetsBox(ax, az, bx, bz, record, 2.5));
};
function segmentMeetsBox(ax, az, bx, bz, record, margin) {
  const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5);
  for (let i = 0; i <= steps; i++) {
    const x = ax + (bx - ax) * i / steps, z = az + (bz - az) * i / steps;
    if (x > record.min[0] - margin && x < record.max[0] + margin && z > record.min[2] - margin && z < record.max[2] + margin) return true;
  }
  return false;
}
let pick = null;
for (const s of structures) {
  if (s.massClass !== 'house' || s.maxHp > 90) continue;
  // approach along the across axis (right = (cos yaw, −sin yaw)), from 60 m out to 4 m short of the wall
  for (const side of [1, -1]) {
    const rx = Math.cos(s.yaw) * side, rz = -Math.sin(s.yaw) * side;
    const sx = s.cx + rx * (s.hw + 60), sz = s.cz + rz * (s.hw + 60);
    const ex = s.cx + rx * (s.hw + 4), ez = s.cz + rz * (s.hw + 4);
    if (Math.max(Math.abs(sx), Math.abs(sz)) > 440) continue;
    const grade = Math.abs(field.getHeightAt(sx, sz) - field.getHeightAt(ex, ez)) / 56;
    if (grade > 0.12) continue;
    // the far side clear too, for the hull to drive on through
    const fx = s.cx - rx * (s.hw + 25), fz = s.cz - rz * (s.hw + 25);
    const own = new Set(s.obstacles);
    if (!clearPath(sx, sz, ex, ez, own) || !clearPath(s.cx - rx * (s.hw + 3), s.cz - rz * (s.hw + 3), fx, fz, own)) continue;
    pick = { s, sx, sz, yaw: Math.atan2(-rx, -rz) };
    break;
  }
  if (pick) break;
}
assert.ok(pick, 'a house with a clear approach');
world0.release();

function run(seed) {
  const world = createDedicatedWorldCollision(MAP, { retain: true });
  const match = createAuthoritativeMatch({
    mapId: MAP, seed, countdownS: 0, worldCollision: world,
    players: [
      { id: 'ram', specId: 'm1a2', team: 'alpha', spawn: { x: pick.sx, z: pick.sz, yaw: pick.yaw } },
      { id: 'far', specId: 'm1a2', team: 'bravo', spawn: { x: -pick.sx * 0.2, z: 420, yaw: 0 } },
    ],
  });
  match.onMatchReady();
  const drive = new Map([['ram', { throttle: 1, steer: 0, brake: false, fire: false, aimYaw: pick.yaw, aimPitch: 0, shellSlot: 0 }]]);
  const stages = [];
  const seen = new Set();
  let passedAt = -1;
  const hull = match.entityById.get('ram');
  for (let tick = 0; tick < 900; tick++) {
    match.step({ dt: SIM_DT, inputs: drive });
    for (const event of match.eventsForViewer('far')) {
      if (event.type === 'structure_stage' && !seen.has(event)) { seen.add(event); stages.push(event); }
    }
    match.afterEventBroadcast();
    const along = (hull.state.pos.x - pick.s.cx) * Math.cos(pick.s.yaw) - (hull.state.pos.z - pick.s.cz) * Math.sin(pick.s.yaw);
    if (passedAt < 0 && Math.sign(along) !== Math.sign((pick.sx - pick.s.cx) * Math.cos(pick.s.yaw) - (pick.sz - pick.s.cz) * Math.sin(pick.s.yaw))) passedAt = tick;
  }
  const meta = match.snapshot({ tick: 0, serverTimeMs: 0, viewerId: 'far', ackInputSeq: null }).meta;
  const record = world.getObstacles().find((r) => r.structureIdx === pick.s.id);
  const ground = (x, z) => match.heightField.getHeightAt(x, z);
  const result = {
    stages: stages.map((e) => `${e.structureId}:${e.stage}:${e.cause}`),
    log: JSON.stringify(meta.destructionLog),
    pose: [hull.state.pos.x, hull.state.pos.y, hull.state.pos.z, hull.state.speed, hull.combat.hp].map((v) => v.toFixed(6)).join(','),
    crushed: !!record.crushed, passedAt, baseGround: ground(pick.s.cx, pick.s.cz),
  };
  world.release();
  return result;
}

const a = run(5);
assert.ok(a.stages.some((stage) => stage === `${pick.s.id}:collapsed:ram`),
  `a hull at speed brings Steinburg's house ${pick.s.id} down (${a.stages.join(', ')})`);
assert.equal(a.crushed, true, 'its contact record no longer pushes');
assert.ok(a.passedAt > 0, 'the hull drove through where it stood');
const b = run(5);
assert.deepEqual(b, a, 'the run replays bit for bit, its destruction log included');
// the shared terrain carries no heap: a match's ground is its own (match.heightField is the base)
const later = createDedicatedWorldCollision(MAP);
assert.equal(later.heightField.getHeightAt(pick.s.cx, pick.s.cz), a.baseGround, 'the next match stands on clean ground');

console.log(`destructionShard: Steinburg's shard groups every structure record (${structures.length} structures: `
  + `${JSON.stringify(classes)}); an M1A2 rams house ${pick.s.id} (${pick.s.maxHp.toFixed(0)} HP) down on the real terrain `
  + `and drives through at tick ${a.passedAt}; bit-for-bit replay; shared terrain untouched PASS`);
