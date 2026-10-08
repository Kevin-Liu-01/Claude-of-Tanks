import assert from 'node:assert/strict';
import { ballSolidAt } from './ballSolids.ts';
import { createMatchModeController } from './matchModes.ts';

// What stops a shell stops Turbo Ball's ball (modes lane 2026-10-08): standing buildings, rock and dense masonry;
// light cover (a fence, a wood pile), a crushed or dead record and anything under or over the ball let it pass.
const box = (minX, minY, minZ, maxX, maxY, maxZ, extra = {}) => ({ min: [minX, minY, minZ], max: [maxX, maxY, maxZ], ...extra });
const records = {
  house: box(10, 0, -5, 20, 8, 5, { kind: 'structure' }),
  fence: box(-20, 0, -5, -18, 1.4, 5, { kind: 'fence', crushable: true }),
  stoneWall: box(-30, 0, -5, -28, 1.6, 5, { kind: 'wallstone', crushable: true }),
  ruin: box(30, 0, -5, 40, 8, 5, { kind: 'structure', dead: true }),
  bridge: box(50, 12, -5, 60, 14, 5, { kind: 'structure' }),
};
const only = (record) => () => [record];
const R = 2.2;
assert.equal(ballSolidAt(only(records.house), 8.5, 2.2, 0, R), true, 'a house wall stops the ball at its surface');
assert.equal(ballSolidAt(only(records.house), 7, 2.2, 0, R), false, 'and not before it');
assert.equal(ballSolidAt(only(records.fence), -19, 2.2, 0, R), false, 'a fence a shell passes lets the ball through');
assert.equal(ballSolidAt(only(records.stoneWall), -29, 2.2, 0, R), true, 'a dense stone wall stops it');
assert.equal(ballSolidAt(only(records.stoneWall), -29, 4.2, 0, R), false, 'a ball in the air clears a low wall');
assert.equal(ballSolidAt(only(records.ruin), 35, 2.2, 0, R), false, 'a destroyed building no longer stops it');
assert.equal(ballSolidAt(only({ ...records.house, crushed: true }), 15, 2.2, 0, R), false, 'nor a crushed record');
assert.equal(ballSolidAt(only(records.bridge), 55, 2.2, 0, R), false, 'a span overhead is not a wall');

// The controller turns the ball off a wall instead of letting it into the house (each axis alone, 0.55 kept)
{
  const entity = (id, team, x, z) => ({ id, team, bot: true, state: { pos: { x, y: 0, z }, yaw: 0, speed: 0 },
    combat: { hp: 100, maxHp: 100, destroyed: false, ammo: [24], ammoCapacity: [24] } });
  const tanks = [entity('a', 'alpha', 0, -300), entity('b', 'bravo', 0, 300)];
  let wallZ = Infinity;
  const match = createMatchModeController({ mode: 'turbo_ball', entities: tanks, seed: 7, terrainHeight: () => 0,
    setActive(target, active) { target.modeActive = active; }, revive() {},
    ballBlocked: (x, y, z, radius) => z + radius > wallZ });
  const ball = match.state.ball;
  wallZ = ball.z + 10;
  ball.vz = 20; ball.vx = 3;
  let maxZ = -Infinity, bounced = false;
  for (let tick = 1; tick <= 120; tick++) {
    match.step(1 / 60, tick / 60);
    maxZ = Math.max(maxZ, ball.z);
    if (ball.vz < 0) bounced = true;
  }
  assert.ok(bounced, 'the ball comes back off the wall');
  assert.ok(maxZ + 2.2 <= wallZ + 1e-9, `the ball never enters the wall (${(maxZ + 2.2 - wallZ).toFixed(3)} m)`);
  assert.ok(ball.vx > 0, 'the axis along the wall keeps its motion');
}
console.log('ballSolids.selftest: shells\' solids stop the ball, light cover lets it pass, walls turn it back');
