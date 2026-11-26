import assert from 'node:assert/strict';
import '../src/vehicles/fleetFactory.ts';
import { createAuthoritativeMatch } from '../src/sim/authoritativeMatch.ts';
import { createDedicatedWorldCollision } from './dedicatedWorldCollision.ts';
import { execFileSync } from 'node:child_process';
import { decodeCollisionManifest } from './collisionManifestCodec.ts';
import { createHeadlessCollisionWorld } from '../src/world/headlessCollisionWorld.ts';
import { createHeightField } from '../src/world/terrain.ts';
import { MAP_IDS, getMapConfig } from '../src/world/maps/index.ts';

// Real driving + mode scoring, not a test that teleports a flag carrier home.
// Remove cannon attrition to isolate whether the bot can complete its job.
for (const mapId of ['verdant', 'cliffbridge']) {
  for (const gameMode of ['capture_the_flag', 'turbo_ball']) {
    const world = createDedicatedWorldCollision(mapId);
    const match = createAuthoritativeMatch({
      mapId, gameMode, seed: 6767, countdownS: 0, worldCollision: world,
      players: [
        { id: 'runner', specId: 'm551_sheridan', team: 'alpha', bot: true },
        { id: 'opponent', specId: 't90am', team: 'bravo' },
      ],
    });
    match.onMatchReady();
    for (const entity of match.entities) entity.combat.ammo.fill(0);
    if (gameMode === 'turbo_ball') {
      const ball = match.modeController.state.ball;
      const goal = match.modeController.state.goals.find(g => g.team === 'bravo');
      const dx = goal.x - ball.x, dz = goal.z - ball.z, length = Math.hypot(dx, dz);
      const nx = dx / length, nz = dz / length;
      ball.x = goal.x - nx * 60; ball.z = goal.z - nz * 60;
      ball.y = match.heightField.getHeightAt(ball.x, ball.z) + 2.2;
      const bot = match.entityById.get('runner');
      bot.state.pos.set(ball.x - nx * 22, match.heightField.getHeightAt(ball.x - nx * 22, ball.z - nz * 22), ball.z - nz * 22);
      bot.state.yaw = Math.atan2(nx, nz);
      // A passive opponent watches from outside the goal mouth.
      const opponent = match.entityById.get('opponent');
      opponent.state.pos.x += 75;
      opponent.state.pos.y = match.heightField.getHeightAt(opponent.state.pos.x, opponent.state.pos.z);
    }
    const events = new Map(), inputs = new Map();
    const wanted = gameMode === 'turbo_ball' ? 'mode_goal_scored' : 'mode_flag_captured';
    for (let tick = 0; tick < 480 * 60 && !events.has(wanted); tick++) {
      match.step({ dt: 1 / 60, inputs });
      if (tick % 15 !== 0) continue;
      for (const event of match.snapshot({ tick, serverTimeMs: tick * 1000 / 60 }).events) {
        if (event.type.startsWith('mode_')) events.set(event.type, (events.get(event.type) ?? 0) + 1);
      }
      match.afterSnapshotBroadcast();
    }
    console.log(`${mapId}/${gameMode}: ${JSON.stringify(Object.fromEntries(events))}`);
    assert.ok(events.has(wanted), `${mapId}/${gameMode}: bot must score through normal movement and objective rules`);
  }
}
// (landmark-lanes-278) Every map's Turbo Ball, toward both goals. 277's cliffbridge plaza de toros stood on the lane into
// bravo's goal and only this receipt's two maps would have caught it; Earthrise's commons and Steinburg's gates had stood
// on theirs unseen. The geometric rule is src/world/landmarks/landmarkLanes.selftest.mjs; here the ball is played. One
// runner from 60 m out, no ammunition (it drives the ball), a 120 s clock; a goal on any of four match seeds passes (a
// single run is chaotic: a remote change in the world moves the bots' routes). The pairs that stall without any set piece
// near (the same runs with every set piece's structure records left out stall too) are named below with the stall; the
// list only shrinks: a listed pair that scores fails until it is struck off.
const SEEDS = [6767, 1, 2, 3];
const KNOWN_STALLS = new Map([
  ['monsoon->bravo', 'the ball never comes nearer than its 60 m start (no set piece on the run)'],
  ['ruinspires->bravo', 'the ball never comes nearer than its 60 m start (the map has no set piece near the run)'],
  ['ruinspires->alpha', 'the ball never comes nearer than its 60 m start (the map has no set piece near the run)'],
  ['fjord->alpha', 'the ball never comes nearer than its 60 m start (the same with every set piece left out)'],
]);
/** One run toward `goalTeam`'s goal: the ball `fromM` before it on the kick-off's line, the runner 22 m behind it. */
function ballRun(mapId, world, goalTeam, fromM, seed, capS) {
  const runnerTeam = goalTeam === 'bravo' ? 'alpha' : 'bravo';
  const match = createAuthoritativeMatch({
    mapId, gameMode: 'turbo_ball', seed, countdownS: 0, worldCollision: world,
    players: [
      { id: 'runner', specId: 'm551_sheridan', team: runnerTeam, bot: true },
      { id: 'opponent', specId: 't90am', team: goalTeam },
    ],
  });
  match.onMatchReady();
  for (const entity of match.entities) entity.combat.ammo.fill(0);
  const { ball, goals } = match.modeController.state, goal = goals.find((g) => g.team === goalTeam);
  const dx = goal.x - ball.x, dz = goal.z - ball.z, length = Math.hypot(dx, dz), nx = dx / length, nz = dz / length;
  ball.x = goal.x - nx * fromM; ball.z = goal.z - nz * fromM;
  ball.y = match.heightField.getHeightAt(ball.x, ball.z) + 2.2;
  const bot = match.entityById.get('runner');
  bot.state.pos.set(ball.x - nx * 22, match.heightField.getHeightAt(ball.x - nx * 22, ball.z - nz * 22), ball.z - nz * 22);
  bot.state.yaw = Math.atan2(nx, nz);
  const opponent = match.entityById.get('opponent');
  opponent.state.pos.x += 75;
  opponent.state.pos.y = match.heightField.getHeightAt(opponent.state.pos.x, opponent.state.pos.z);
  const inputs = new Map();
  for (let tick = 0; tick < capS * 60; tick++) {
    match.step({ dt: 1 / 60, inputs });
    if (tick % 15 !== 0) continue;
    if (match.snapshot({ tick, serverTimeMs: tick * 1000 / 60 }).events.some((event) => event.type === 'mode_goal_scored')) return tick / 60;
    match.afterSnapshotBroadcast();
  }
  return null;
}
/** The seeds' runs until one scores: the seed and time, or null. */
function scores(mapId, makeWorld, goalTeam, fromM, capS) {
  for (const seed of SEEDS) {
    const s = ballRun(mapId, makeWorld(), goalTeam, fromM, seed, capS);
    if (s != null) return { seed, s };
  }
  return null;
}
const stalls = [], struck = [];
let pairs = 0;
for (const mapId of MAP_IDS) for (const goalTeam of ['alpha', 'bravo']) {
  const key = `${mapId}->${goalTeam}`, hit = scores(mapId, () => createDedicatedWorldCollision(mapId), goalTeam, 60, 120);
  if (hit && KNOWN_STALLS.has(key)) struck.push(`${key} scores (seed ${hit.seed}, ${hit.s.toFixed(1)} s): strike it off KNOWN_STALLS`);
  if (!hit && !KNOWN_STALLS.has(key)) stalls.push(`${key}: no goal from 60 m on seeds ${SEEDS.join(', ')}`);
  pairs++;
}
assert.deepEqual([...stalls, ...struck], [], `Turbo Ball sweep:\n${[...stalls, ...struck].join('\n')}`);

// The lane a set piece stood on, played: Earthrise's south commons stood at (-12, -88) on the run into alpha's goal until
// 278. From 120 m out the ball reaches that goal inside 120 s on three of the four seeds now; the reverted control, the
// world as 277 committed it (the commons back on both lanes, read from 1e7afa12dc's shard), scores on none.
const moonLane = (makeWorld) => SEEDS.filter((seed) => ballRun('moon', makeWorld(), 'alpha', 120, seed, 120) != null).length;
const moonNow = moonLane(() => createDedicatedWorldCollision('moon'));
assert.ok(moonNow >= 3, `moon: the run into alpha's goal past the moved commons scores on ${moonNow} of 4 seeds (3 wanted)`);
const reverted = decodeCollisionManifest(JSON.parse(execFileSync('git', ['show', '1e7afa12dc:server/world-collision-manifests/moon.json'],
  { cwd: new URL('..', import.meta.url), encoding: 'utf8', maxBuffer: 1 << 28 })));
const moonReverted = moonLane(() => createHeadlessCollisionWorld({ mapId: 'moon', heightField: createHeightField(1337, getMapConfig('moon')), manifest: reverted }));
assert.ok(moonReverted < 3, `the reverted control: with the commons back on the lane the run scores on ${moonReverted} of 4 seeds (it must fail)`);
console.log(`botObjectives.selftest: real-map flag captures and ball goals passed; Turbo Ball scores toward ${pairs - KNOWN_STALLS.size} of ${pairs} goals `
  + `(${KNOWN_STALLS.size} known stalls), moon's lane ${moonNow}/4 against the reverted control's ${moonReverted}/4`);
