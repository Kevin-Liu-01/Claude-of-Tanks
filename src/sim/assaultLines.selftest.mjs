import assert from 'node:assert/strict';
import {
  ASSAULT_LINE_FRACTIONS, ASSAULT_TRENCH, assaultTeamCenters, assaultTrenchCarveDepth,
  planAssaultTrenchLines, trenchProfile,
} from './assaultLines.ts';

// Frontline Assault trench geometry (2026-09-13): one pure plan shared by the
// terrain carve, the match sectors and the line works.
assert.deepEqual([...ASSAULT_LINE_FRACTIONS], [0.25, 0.55, 0.85], 'sector fractions are the published ones');

const centers = assaultTeamCenters({ x: -300, z: -40 }, [{ x: 280, z: 60 }, { x: 320, z: 20 }, { x: 300, z: 40 }]);
assert.deepEqual(centers, { alpha: { x: -300, z: -40 }, bravo: { x: 300, z: 40 } }, 'bravo is the enemy centroid');

const plan = planAssaultTrenchLines(centers.alpha, centers.bravo);
assert.equal(plan.lines.length, 3, 'three fire trenches');
const axisLength = Math.hypot(600, 80);
for (const [index, line] of plan.lines.entries()) {
  const f = ASSAULT_LINE_FRACTIONS[index];
  assert.ok(Math.abs(line.x - (-300 + 600 * f)) < 1e-9 && Math.abs(line.z - (-40 + 80 * f)) < 1e-9, `line ${index} sits at fraction ${f}`);
  assert.ok(Math.abs(line.ax * line.lx + line.az * line.lz) < 1e-12, 'lateral is perpendicular to the axis');
  assert.ok(Math.abs(Math.hypot(line.ax, line.az) - 1) < 1e-12 && Math.abs(Math.hypot(line.lx, line.lz) - 1) < 1e-12);
  assert.equal(line.halfLengthM, ASSAULT_TRENCH.halfLengthM);
}
assert.ok(plan.connector && plan.connector.x0 === plan.lines[0].x && plan.connector.x1 === plan.lines[2].x, 'the communication trench joins line 1 to line 3');
assert.ok(axisLength > ASSAULT_TRENCH.minAxisM);
assert.deepEqual(planAssaultTrenchLines({ x: 0, z: 0 }, { x: 10, z: 0 }), { lines: [], connector: null }, 'degenerate short axes carry no trenches');

// Cross-section: flat floor, smooth walls, surface beyond.
assert.equal(trenchProfile(0, 2.3, 1.7), 1);
assert.equal(trenchProfile(2.3, 2.3, 1.7), 1);
assert.equal(trenchProfile(4.0, 2.3, 1.7), 0);
const mid = trenchProfile(2.3 + 0.85, 2.3, 1.7);
assert.ok(mid > 0.45 && mid < 0.55, `wall midpoint is half depth (${mid.toFixed(3)})`);

// Carve depth: full on the floor of line 2, ramped at the ends, zero well outside.
const line = plan.lines[1];
const at = (along, across) => assaultTrenchCarveDepth(line.x + line.lx * along + line.ax * across, line.z + line.lz * along + line.az * across, plan);
assert.ok(Math.abs(at(0, 0) - ASSAULT_TRENCH.depthM) < 1e-9, 'trench floor is at full depth');
assert.ok(Math.abs(at(20, 1.5) - ASSAULT_TRENCH.depthM) < 1e-9, 'the flat floor spans the whole floor half-width');
assert.ok(at(ASSAULT_TRENCH.halfLengthM - 1, 0) < 0.2 * ASSAULT_TRENCH.depthM, 'ramped end');
assert.equal(at(ASSAULT_TRENCH.halfLengthM + 5, 0), 0, 'nothing beyond the trench end');
assert.equal(at(20, ASSAULT_TRENCH.floorHalfWidthM + ASSAULT_TRENCH.wallRunM + 0.5), 0, 'nothing beyond the wall');
// the connector runs along the axis between line 1 and line 3
const c = plan.connector;
const cm = { x: c.x0 + (c.x1 - c.x0) * 0.25, z: c.z0 + (c.z1 - c.z0) * 0.25 }; // between line 1 and line 2
assert.ok(Math.abs(assaultTrenchCarveDepth(cm.x, cm.z, plan) - ASSAULT_TRENCH.connectorDepthM) < 1e-9, 'communication trench at its own depth');
assert.equal(assaultTrenchCarveDepth(cm.x + line.lx * 50, cm.z + line.lz * 50, plan), 0, 'the connector is narrow');
console.log('assaultLines.selftest: fractions, centres, three lines + connector, profile and carve depth PASS');
