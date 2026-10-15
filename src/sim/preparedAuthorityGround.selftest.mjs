// A standby host's prepared match ground (2026-10-14, the MP stream; docs/MULTIPLAYER-V2.md §13.21). An elected host's
// authority built its bot navigation grid while every seat waited (1.2 s of a 1.8 s creation on Verdant at main; 39 ms on
// 2026-09-30). `prepareAuthorityGround` builds the grid, the deformation overlay and the deformed field on the world the
// standby prepared, and the first authority on that world takes them once. This receipt proves the prepared match plays
// exactly as a fresh one: two Verdant worlds, one prepared, six bots, the same seed and inputs, 30 s of ticks, the same
// state digest every second — and the preparation is taken once, and only by its own world.
import assert from 'node:assert/strict';
import '../vehicles/tankFactory.ts';
import { ALL_TANK_IDS, getSpec } from '../vehicles/specs.ts';
import { createAuthoritativeMatch, hasPreparedAuthorityGround, prepareAuthorityGround } from './authoritativeMatch.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';

const watchdog = setTimeout(() => { console.error('preparedAuthorityGround.selftest: stuck'); process.exit(1); }, 240_000);
watchdog.unref();
const SPECS = ALL_TANK_IDS.filter((id) => ['light', 'medium', 'heavy'].includes(getSpec(id).role)).slice(0, 6);
assert.equal(SPECS.length, 6);
const players = () => SPECS.map((specId, index) => ({ id: `bot-${index}`, specId, team: index < 3 ? 'alpha' : 'bravo', bot: true, difficulty: 'normal' }));
const round = (value) => Math.round(value * 1e5) / 1e5;
function digest(match) {
  return match.entities.map((entity) => [entity.id, round(entity.state.pos.x), round(entity.state.pos.y), round(entity.state.pos.z), round(entity.state.yaw),
    round(entity.combat.hp ?? 0), !!entity.combat.destroyed, round(entity.input.throttle || 0), round(entity.input.steer || 0)].join(',')).join('|');
}
function play(world, ticks) {
  const match = createAuthoritativeMatch({ players: players(), mapId: 'verdant', seed: 9411, countdownS: 0, worldCollision: world });
  match.onMatchReady();
  const digests = [];
  for (let tick = 0; tick < ticks && !match.result; tick++) {
    match.step({ dt: 1 / 60, inputs: new Map() });
    if ((tick + 1) % 60 === 0) { match.snapshot({ tick, serverTimeMs: tick * 1000 / 60 }); match.afterSnapshotBroadcast(); digests.push(digest(match)); }
  }
  return { match, digests };
}

// ---- the prepared world plays exactly as a fresh one
const prepared = createDedicatedWorldCollision('verdant');
const fresh = createDedicatedWorldCollision('verdant');
const started = performance.now();
prepareAuthorityGround(prepared);
const prepareMs = performance.now() - started;
assert.equal(hasPreparedAuthorityGround(prepared), true, 'the preparation waits for the next authority on its world');
assert.equal(hasPreparedAuthorityGround(fresh), false, 'and only on its own world');
const a = play(prepared, 1800);
assert.equal(hasPreparedAuthorityGround(prepared), false, 'the first authority took it (once)');
const b = play(fresh, 1800);
assert.equal(a.digests.length, b.digests.length);
assert.ok(a.digests.length >= 20, `the bots played ${a.digests.length} s`);
for (let second = 0; second < a.digests.length; second++) {
  assert.equal(a.digests[second], b.digests[second], `second ${second + 1}: the prepared match diverged from the fresh one`);
}
const moved = a.match.entities.filter((entity) => Math.hypot(entity.state.pos.x, entity.state.pos.z) > 0).length;
assert.ok(moved > 0);

// ---- a preparation whose world changed under it is not used (the obstacles it read are not the authority's)
const changed = createDedicatedWorldCollision('verdant');
prepareAuthorityGround(changed);
const own = changed.getObstacles();
changed.getObstacles = () => own.slice();
const c = play(changed, 600);
assert.equal(hasPreparedAuthorityGround(changed), false, 'taken and dropped');
assert.deepEqual(c.digests, b.digests.slice(0, c.digests.length), 'the authority built its own grid and played the same match');
console.log(`preparedAuthorityGround.selftest: a prepared Verdant ground (${Math.round(prepareMs)} ms to prepare) plays ${a.digests.length} s of six bots digest for digest as a fresh one; taken once, by its own world only; a world whose obstacles changed builds its own`);
