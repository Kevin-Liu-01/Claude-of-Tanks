// READY-227 (bots lane, 2026-10-16): a hard bot's approach on Verdant, pinned. On 226's Verdant (main 16aeab482) the hard
// T-90AM of botDroneAttack took 110 s to its first gun solution from the north-east deployment (66 s on the 225 world,
// e8a8c8527): it drove 115 m east before it turned west, and backed off twice. The cause was the smock mill on the
// northern swell (226's Verdant v2 landmarks, structure 18 at (267, 288)): its plinth carries three 0.15 m slivers, and
// the bots' clearance tests grew a sliver's 2.6-degree corner by the hull's lane margin into a needle ~150 m long, so the
// corner router saw the mill across the lane to the first waypoint 120 m away. The bots' clearance queries now bevel a
// sharp corner at the margin (world/collision.ts collisionClearanceContainsPoint, rayCollisionClearanceEntry2). Over eight
// seeds (this setup) the approach averaged 98.2 s on the 225 world, 93.5 s on 226 and 84.0 s with the bevel; over the 33
// maps 96.8 s, 110.0 s and 91.8 s (Monsoon, Titan Gorge and Whiteout had lost 40-116 s to the same needles).
import assert from 'node:assert/strict';
import '../vehicles/tankFactory.ts';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { SIM_DT } from './movement.ts';
import { getSpec } from '../vehicles/specs.ts';
import { hullYieldingRecord, rayCollisionClearanceEntry2, rayCollisionFootprintEntry2 } from '../world/collision.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';

const BOT = 't90am', TARGET = 'centurion3';

// 1. The mill no longer stands across the deployment's first lane, as the corner router reads it (ai.ts
// findBlockingObstacle: every solid the hull does not drive through, the hull's half width plus 1.4 m either side)
{
  const world = createDedicatedWorldCollision('verdant', { retain: true });
  const mill = world.getObstacles().find((o) => o.structureRole === 'setpiece' && o.min[0] < 267 && o.max[0] > 267
    && o.min[2] < 288 && o.max[2] > 288);
  assert.ok(mill, 'the smock mill stands on the northern swell');
  const margin = getSpec(BOT).dims.widthM * 0.5 + 1.4;
  const from = [190, 390], to = [175, 375], length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const ux = (to[0] - from[0]) / length, uz = (to[1] - from[1]) / length;
  assert.ok(rayCollisionFootprintEntry2(mill, from[0], from[1], ux, uz, length, margin) != null,
    'the plain offset clearance still grows the mill\'s slivers across the lane (the defect the bevel answers)');
  const blockers = world.getObstacles().filter((o) => !o.crushed && !hullYieldingRecord(o) && o.kind !== 'bridge'
    && rayCollisionClearanceEntry2(o, from[0], from[1], ux, uz, length, margin) != null);
  assert.deepEqual(blockers, [], 'nothing solid stands across the deployment\'s first lane');
  world.release?.();
}

// 2. The approach: botDroneAttack's setup (a hard T-90AM against a passive Centurion Mk 3 in the drone mode), the time to
// its first gun solution and the opening's heading, per seed
const SEEDS = [
  // seed 11 (botDroneAttack's): its search leg runs through the village (the kolkhoz grain store, 226, closes the lane west
  // of it) and circles a waypoint by the sandbag ring at (-26, -57); 97.6 s (73.3 s on the 225 world, 109.6 s on 226)
  { seed: 11, fireByS: 105 },
  // seed 41: 71.7 s (80.3 s on the 225 world, 85.4 s on 226)
  { seed: 41, fireByS: 80 },
];
for (const { seed, fireByS } of SEEDS) {
  const world = createDedicatedWorldCollision('verdant', { retain: true });
  const match = createAuthoritativeMatch({ players: [
    { id: 'h1', specId: TARGET, team: 'alpha' },
    { id: 'b1', specId: BOT, team: 'bravo', bot: true, difficulty: 'hard' },
  ], mapId: 'verdant', seed, countdownS: 0, gameMode: 'drone', worldCollision: world });
  match.onMatchReady();
  const bot = match.entityById.get('b1'), inputs = new Map();
  const start = { x: bot.state.pos.x, z: bot.state.pos.z };
  assert.ok(Math.hypot(start.x - 190, start.z - 390) < 2, `the bot deploys in the north-east (${start.x.toFixed(1)}, ${start.z.toFixed(1)})`);
  let fireAt = null, eastmost = start.x;
  for (let tick = 1; tick <= 60 * fireByS; tick++) {
    inputs.set('h1', { throttle: 0, steer: 0, brake: true, fire: false, fireIntentSeq: null, aimLocked: false, shellSlot: 0,
      actionBits: 0, aimYaw: 0, aimPitch: 0, aimDistance: 300 });
    match.step({ dt: SIM_DT, inputs });
    match.eventsForViewer('__bot_route__'); match.afterEventBroadcast();
    if (tick <= 60 * 12) eastmost = Math.max(eastmost, bot.state.pos.x);
    if (bot.input.fire) { fireAt = tick * SIM_DT; break; }
  }
  world.release?.();
  // on 226 unfixed the bot reached x 255 in its first 14 s, chasing a corner round the mill's needle
  assert.ok(eastmost < start.x + 3, `seed ${seed}: the opening heads west for the first waypoint (eastmost x ${eastmost.toFixed(1)})`);
  assert.ok(fireAt !== null, `seed ${seed}: the hard bot reaches a gun solution inside ${fireByS} s`);
  console.log(`botVerdantApproach: seed ${seed} gun solution at ${fireAt.toFixed(1)} s (window ${fireByS} s)`);
}
console.log('botVerdantApproach: the smock mill leaves the deployment lane clear; the hard bot\'s Verdant approach is pinned');
