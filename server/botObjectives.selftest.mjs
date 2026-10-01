import assert from 'node:assert/strict';
import '../src/vehicles/fleetFactory.ts';
import { createAuthoritativeMatch } from '../src/sim/authoritativeMatch.ts';
import { createDedicatedWorldCollision } from './dedicatedWorldCollision.ts';

// Real driving + mode scoring, not a test that teleports a flag carrier home.
// Remove cannon attrition to isolate whether the bot can complete its job.
for (const mapId of ['verdant', 'cliffbridge']) {
  for (const gameMode of ['capture_the_flag', 'turbo_ball']) {
    const world = createDedicatedWorldCollision(mapId);
    const match = createAuthoritativeMatch({
      mapId, gameMode, seed: 6767, countdownS: 0, worldCollision: world,
      players: [
        { id: 'runner', specId: 'm551_sheridan', team: 'alpha', bot: true },
        { id: 'opponent', specId: 't90m', team: 'bravo' },
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
console.log('botObjectives.selftest: real-map flag captures and ball goals passed');
