// Exactly one hull of an ally pair yields (268, Main item 10b). The controller's yield rule read
// `mustYield = following || !hasPriority`: a follower closing on the hull ahead yields as a follower, and the hull ahead
// yields too when the follower holds the id priority (the ids decide a crossing). In a following pair both yielded and
// the pair stood (Infected, Badlands seed 2: a T-55A and a BMP-2 each yielding to the other, 31-38 m off the survivors,
// about 13 s each). The rule is now pair-symmetric: in a following pair the follower yields and the leader never does;
// only a crossing or head-on meeting goes by the ids. This builds the mutual case directly (no lucky seed): a follower
// with the priority closing from behind on a slower leader without it, both bound for the same point.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.ts';
import { createAI, mulberry32 } from './ai.ts';

await ensureAuthorityFleet();
const spec = getSpec('t72b3');
const FIELD = { getHeightAt: () => 0, getNormalAt: () => ({ x: 0, y: 1, z: 0 }), getGroundType: () => 'firm' };

function hull(id, z, speed, x = 0, yaw = 0) {
  const state = createTankState(spec, new Vector3(x, 0, z), yaw);
  state.speed = speed;
  return { id, specId: spec.id, spec, team: 'bravo', state,
    combat: { hp: spec.hp, maxHp: spec.hp, destroyed: false, reload: { t: 0, totalS: spec.gun.reloadS, kind: 'ready' },
      shellSlot: 0, modules: {}, crew: {}, fire: { burning: false, tickTimer: 0, ticksLeft: 0 }, magazine: null },
    input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: new Vector3(), shellSlot: 0, actionBits: 0 }, aiCtl: null };
}
// ids: the follower 'a-follower' holds the priority over the leader 'b-leader' (String order, the controller's handshake)
const leader = hull('b-leader', 14, 2), follower = hull('a-follower', 0, 9);
const both = [leader, follower];
for (const self of both) {
  self.aiCtl = createAI(self, { difficulty: 'normal', rng: mulberry32(self === leader ? 3 : 5), deps: {
    heightField: FIELD, raycast: () => null, getEnemies: () => [], getAllies: () => both.filter((other) => other !== self),
    getObstacles: () => [], spotting: { isSpotted: () => false } } });
  self.aiCtl.setWaypoints([[0, 400]], { loop: false });
}
let mutual = 0, followerYields = 0, leaderYields = 0, leaderSawFollower = 0, followerSawLeader = 0, leaderSlowTicks = 0, ticks = 0;
for (let i = 0; i < 8 / SIM_DT; i++) {
  const t = 1 + i * SIM_DT;
  for (const self of both) self.aiCtl.update(SIM_DT, t);
  const l = leader.aiCtl.debugInfo(), f = follower.aiCtl.debugInfo();
  if (l.allyAvoidingId === follower.id) leaderSawFollower++;
  if (f.allyAvoidingId === leader.id) followerSawLeader++;
  if (l.allyYielding && l.allyAvoidingId === follower.id) leaderYields++;
  if (f.allyYielding && f.allyAvoidingId === leader.id) followerYields++;
  if (l.allyYielding && f.allyYielding) mutual++;
  for (const self of both) updateTank(self, FIELD, SIM_DT, null);
  ticks++;
  if (i * SIM_DT > 2 && Math.abs(leader.state.speed) < 0.5) leaderSlowTicks++;
}
console.log(`ally pair over ${ticks} ticks: the leader registered the follower ${leaderSawFollower}, the follower the leader ${followerSawLeader}; `
  + `yields: follower ${followerYields}, leader ${leaderYields}, both at once ${mutual}; the leader under 0.5 m/s ${leaderSlowTicks} ticks after 2 s`);
assert.ok(leaderSawFollower > 0 && followerSawLeader > 0, 'the case is built: each hull of the pair registers the other');
assert.equal(mutual, 0, 'never both hulls of the pair yielding at once');
assert.ok(followerYields > 0, 'the follower yields to the hull ahead');
assert.equal(leaderYields, 0, 'the leader never yields to its follower, whatever the ids');
assert.equal(leaderSlowTicks, 0, 'the leader keeps rolling');

// A skewed pair (item 10, the director's gate: Steppe seed 7, Coastal seed 8): a hull 4 m to the side of the other and
// 0.5 m ahead, angled 34 degrees across its lane, both bound up the field. Each read the other AHEAD along its own heading,
// so each was the follower and both yielded. Judged along the sum of their headings, exactly one of them is behind.
{
  const left = hull('c-left', 0, 2), right = hull('d-right', 0.5, 2, 4, -0.6);
  const pair = [left, right];
  for (const self of pair) {
    self.aiCtl = createAI(self, { difficulty: 'normal', rng: mulberry32(self === left ? 7 : 11), deps: {
      heightField: FIELD, raycast: () => null, getEnemies: () => [], getAllies: () => pair.filter((other) => other !== self),
      getObstacles: () => [], spotting: { isSpotted: () => false } } });
    self.aiCtl.setWaypoints([[self.state.pos.x, 400]], { loop: false });
  }
  let both = 0, seen = 0, yields = 0;
  for (let i = 0; i < 4 / SIM_DT; i++) {
    const t = 1 + i * SIM_DT;
    for (const self of pair) self.aiCtl.update(SIM_DT, t);
    const l = left.aiCtl.debugInfo(), r = right.aiCtl.debugInfo();
    if (l.allyAvoidingId === right.id && r.allyAvoidingId === left.id) seen++;
    if (l.allyYielding || r.allyYielding) yields++;
    if (l.allyYielding && r.allyYielding) both++;
    for (const self of pair) updateTank(self, FIELD, SIM_DT, null);
  }
  console.log(`skewed pair: both registering each other ${seen} ticks; a yield ${yields} ticks, both at once ${both}`);
  assert.ok(seen > 0 && yields > 0, 'the case is built: the pair registers each other and one yields');
  assert.equal(both, 0, 'never both hulls of a skewed pair yielding at once');
}
console.log('ai.allyYield.selftest: in a following pair exactly the follower yields; the leader keeps its way whatever the ids; a skewed pair, one');
