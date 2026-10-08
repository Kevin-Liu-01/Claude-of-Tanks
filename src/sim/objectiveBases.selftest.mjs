// Forward bases (modes lane, 2026-10-08; owner decision "Capture the Flag and Turbo Ball are too big to score"): on every
// map Capture the Flag's flags and Turbo Ball's goals stand the ruleset's separation apart on the deployments' axis, each
// the 180-degree rotation of the other about the deployments' pivot (sim/deployment.ts), on ground a tank can stand on
// and both sides can reach; Turbo Ball's kickoff stands on the goals' perpendicular bisector, equidistant from both.
import assert from 'node:assert/strict';
import { MAP_IDS } from '../world/maps/index.ts';
import { collisionFootprintContainsPoint } from '../world/collision.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';
import { createMatchPlacement, matchPlacementAnchors, placementTerrainSafe } from './matchPlacement.ts';
import { matchRulesetFor } from './matchRuleset.ts';
import { MATCH_MODE_ARENA_HALF_EXTENT_M } from './matchObjectiveLayouts.ts';
import { ballSolidAt } from './ballSolids.ts';

const r1 = (value) => Math.round(value * 10) / 10;
assert.equal(matchRulesetFor('capture_the_flag').bases.separationM, 470, 'the flags 470 m apart');
assert.equal(matchRulesetFor('turbo_ball').bases.separationM, 500, 'the goals 500 m apart');
assert.deepEqual([matchRulesetFor('capture_the_flag').bases.reliefM, matchRulesetFor('capture_the_flag').bases.normalY], [5, 0.94],
  'a flag stands on the objective footprint');
assert.deepEqual([matchRulesetFor('turbo_ball').bases.reliefM, matchRulesetFor('turbo_ball').bases.normalY], [7, 0.90],
  'a goal stands on ground as steep as a spawn slot\'s');
for (const mode of ['standard', 'zone_control', 'endless_horde', 'frontline_assault', 'mars']) {
  assert.equal(matchRulesetFor(mode).bases, null, `${mode}: no bases`);
}

const report = { capture_the_flag: [], turbo_ball: [] };
let worstRotation = 0, worstKick = 0;
for (const mapId of MAP_IDS) {
  const world = createDedicatedWorldCollision(mapId), field = world.heightField;
  const anchors = matchPlacementAnchors(field._layout.spawns);
  const pivot = { x: (anchors.alpha.x + anchors.bravo.x) / 2, z: (anchors.alpha.z + anchors.bravo.z) / 2 };
  const axis = { x: anchors.bravo.x - anchors.alpha.x, z: anchors.bravo.z - anchors.alpha.z };
  const axisLength = Math.hypot(axis.x, axis.z);
  for (const mode of ['capture_the_flag', 'turbo_ball']) {
    const placement = createMatchPlacement({ mapId, heightField: field, obstacles: world.getObstacles(), queryObstacles: world.queryObstacles, anchors, mode });
    const { alpha, bravo } = placement.centers;
    const rotation = Math.hypot(alpha.x + bravo.x - 2 * pivot.x, alpha.z + bravo.z - 2 * pivot.z);
    worstRotation = Math.max(worstRotation, rotation);
    assert.ok(rotation <= 0.5, `${mapId}/${mode}: the bases are rotations of each other about the pivot (${r1(rotation)} m)`);
    // each base on its own side of the middle line
    const along = (p) => ((p.x - pivot.x) * axis.x + (p.z - pivot.z) * axis.z) / axisLength;
    assert.ok(along(alpha) < -40 && along(bravo) > 40, `${mapId}/${mode}: each base on its own half`);
    const rules = matchRulesetFor(mode).bases, radius = rules.radiusM;
    const footprint = { radius, relief: rules.reliefM, normalY: rules.normalY, halfExtent: rules.arena ? MATCH_MODE_ARENA_HALF_EXTENT_M : undefined };
    for (const [team, base] of [['alpha', alpha], ['bravo', bravo]]) {
      assert.ok(placementTerrainSafe(field, base, footprint), `${mapId}/${mode}/${team}: ground the base footprint holds`);
      for (const obstacle of world.queryObstacles(base.x - radius, base.z - radius, base.x + radius, base.z + radius, [])) {
        if (obstacle.crushed || obstacle.dead || obstacle.crushable) continue;
        const floor = field.getHeightAt(base.x, base.z);
        if (obstacle.max[1] < floor - 0.5 || obstacle.min[1] > floor + 5) continue;
        assert.ok(!collisionFootprintContainsPoint(obstacle, base.x, base.z, radius), `${mapId}/${mode}/${team}: no solid on the base`);
      }
    }
    const apart = Math.hypot(alpha.x - bravo.x, alpha.z - bravo.z);
    const row = { mapId, apart: r1(apart) };
    if (mode === 'turbo_ball') {
      const kick = placement.middle;
      const gap = Math.abs(Math.hypot(kick.x - alpha.x, kick.z - alpha.z) - Math.hypot(kick.x - bravo.x, kick.z - bravo.z));
      worstKick = Math.max(worstKick, gap);
      assert.ok(gap <= 0.5, `${mapId}: the kickoff stands equidistant from both goals (${r1(gap)} m)`);
      // the ball starts there and comes back after every goal: never inside, nor against, a record that stops it
      const floor = field.getHeightAt(kick.x, kick.z);
      assert.ok(!ballSolidAt((a, b, c, d) => world.queryObstacles(a, b, c, d, []), kick.x, floor + 2.2, kick.z, 2.2 + 2),
        `${mapId}: the kickoff clear of every ball-stopping record`);
      row.kickOffPivot = r1(Math.hypot(kick.x - pivot.x, kick.z - pivot.z));
    }
    report[mode].push(row);
  }
  world.release?.();
}
const line = (mode) => report[mode].map((row) => `${row.mapId} ${row.apart}${row.kickOffPivot != null ? `/k${row.kickOffPivot}` : ''}`).join(', ');
console.log(`objectiveBases.selftest: ${MAP_IDS.length} maps, flags and goals rotations of each other (worst ${r1(worstRotation)} m), the kickoff equidistant (worst ${r1(worstKick)} m); metres apart:\n  flags: ${line('capture_the_flag')}\n  goals (/k kickoff off the pivot): ${line('turbo_ball')}`);
