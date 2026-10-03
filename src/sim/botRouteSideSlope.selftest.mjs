// The side slope across a grid edge (bots lane, 2026-10-03). Redrock Divide's plateau face (55-63 degrees) carried grid
// edges along it and slanting across it: an edge read only the grade along its own line, so on a face whose foot line
// slants across the grid an edge could climb it at a gentle along-edge grade while the ground fell away at 60 degrees
// beside the hull. Frontline defenders bound for the plateau were routed across the face and fell off it. Each
// interior sample of an edge now also reads the side slope across the edge's line, held to the same two-way rule.
//
// A synthetic face pins the rule (not any map's geometry): the floor (y 0) south of a foot line z = 0.4 x - 10, a face
// rising 26 m over 15 m north of it (60 degrees), the plateau beyond; west of x = -300 the same rise is a gentle ramp.
import assert from 'node:assert/strict';
import { createBotNavigationGrid, planBotRoute } from './botRoutePlanner.ts';
import { getSpec } from '../vehicles/specs.ts';

const RISE = 26, FACE_RUN = 15, RAMP_RUN = 120, SLANT = 0.4, RAMP_X = -300;
const footZ = (x) => SLANT * x - 10;
const climb = (x, z, run) => Math.max(0, Math.min(RISE, (z - footZ(x)) / run * RISE));
const faceField = { getHeightAt: (x, z) => climb(x, z, x < RAMP_X ? RAMP_RUN : FACE_RUN), getGroundType: () => 'medium' };
const rampOnly = { getHeightAt: (x, z) => climb(x, z, RAMP_RUN), getGroundType: () => 'medium' };
const spec = getSpec('m1a2');

/** The steepest ground (gradient over 2 m either way) under a route's polyline, sampled every 2 m. */
function steepestUnder(field, route, start) {
  const grad = (x, z) => Math.hypot(field.getHeightAt(x + 2, z) - field.getHeightAt(x - 2, z),
    field.getHeightAt(x, z + 2) - field.getHeightAt(x, z - 2)) / 4;
  let worst = 0, at = null;
  const points = [[start.x, start.z], ...route];
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i], length = Math.hypot(bx - ax, bz - az);
    for (let d = 0; d <= length; d += 2) {
      const x = ax + (bx - ax) * d / length, z = az + (bz - az) * d / length, g = grad(x, z);
      if (g > worst) { worst = g; at = [Math.round(x), Math.round(z)]; }
    }
  }
  return { worst, at };
}

function seeded(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const TRIPS = [
  [{ x: 100, z: -100 }, { x: -100, z: 100 }],
  [{ x: 200, z: -40 }, { x: 0, z: 120 }],
  [{ x: 50, z: -150 }, { x: -150, z: 60 }],
];

console.log('[1] floor to plateau over a slanting 60 degree face: the routes take the ramp');
{
  const navigation = createBotNavigationGrid({ heightField: faceField });
  for (const [start, goal] of TRIPS) {
    const route = planBotRoute({ start, goal, navigation, rng: seeded(7), role: 'brawler', spec, useRoleDetour: false });
    const { worst, at } = steepestUnder(faceField, route, start);
    assert.ok(route.length > 0, `a route from (${start.x}, ${start.z}) to the plateau`);
    assert.ok(worst < 0.9, `from (${start.x}, ${start.z}): no ground under the route steeper than the hull climbs ` +
      `(steepest ${worst.toFixed(2)} at ${at})`);
    assert.ok(route.some(([x]) => x < RAMP_X), `from (${start.x}, ${start.z}): the route goes round by the ramp`);
    console.log(`  ok  from (${start.x}, ${start.z}): ${route.length} points, steepest ground ${worst.toFixed(2)}`);
  }
}

console.log('[2] control: the same rise as a ramp everywhere is driven straight up its slant');
{
  const navigation = createBotNavigationGrid({ heightField: rampOnly });
  const [start, goal] = TRIPS[0];
  const route = planBotRoute({ start, goal, navigation, rng: seeded(7), role: 'brawler', spec, useRoleDetour: false });
  const { worst } = steepestUnder(rampOnly, route, start);
  assert.ok(route.length > 0 && route.every(([x]) => x > RAMP_X), 'no detour to the west');
  assert.ok(worst < 0.3, `gentle ground all the way (${worst.toFixed(2)})`);
  console.log(`  ok  ${route.length} points, no detour, steepest ground ${worst.toFixed(2)}`);
}

console.log('botRouteSideSlope.selftest: routes keep off faces steeper than the hull climbs');
