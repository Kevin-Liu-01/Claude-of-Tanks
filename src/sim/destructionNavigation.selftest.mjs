// The bots' grid after a collapse (docs/DESTRUCTION.md §6): a refresh round the fallen structure and its heap reads
// exactly what a grid built from scratch on the changed world reads (cells, heights, grades, hull edges, bends,
// components), routes then run through where the building stood, and a felled tree's canopy stops concealing.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createBotNavigationGrid } from './botRoutePlanner.ts';
import { createObstacleGrid, setCompoundShape, setObbShape } from '../world/collision.ts';
import { createDeformedHeightField, createTerrainDeformation, rubbleFalloffM, rubbleHeightFor } from './terrainDeformation.ts';
import { createStructureDamage } from './structureDamage.ts';
import { bushBonusBetween, fellConcealersAt, restoreConcealers } from './spotting.ts';

const up = new Vector3(0, 1, 0);
const height = (x, z) => 0.5 * Math.sin(x * 0.02) + 0.3 * Math.cos(z * 0.03);
const baseField = { getHeightAt: height, getHeightAtFast: height, getNormalAt: () => up, getGroundType: () => 'medium', maxY: 1 };

/** A street of buildings: a wall of houses across x ∈ [−60, 60] at z = 0, each 20 × 12 m, 7 m tall. */
function street() {
  const obstacles = [], colliders = [];
  for (let i = 0; i < 6; i++) {
    const cx = -50 + i * 20;
    obstacles.push(setObbShape({ min: [0, -0.5, 0], max: [0, 1.8, 0], kind: 'structure', structureIdx: i }, cx, 0, 10, 6, 0));
    colliders.push(setCompoundShape({ min: [0, -0.5, 0], max: [0, 7, 0], kind: 'structure', structureIdx: i },
      [{ kind: 'obb', cx, cz: 0, hw: 10, hl: 6, yaw: 0 }]));
  }
  return { obstacles, colliders };
}
function gridOver(field, obstacles) {
  return createBotNavigationGrid({ heightField: field, queryObstacles: createObstacleGrid(obstacles), getObstacles: () => obstacles });
}
const digest = (grid) => [grid.heights, grid.blocked, grid.groundTypes, grid.hullBlockedEdges, grid.hullComponents,
  grid.edgeSteepness, grid.hullBends].map((array) => Buffer.from(array.buffer, array.byteOffset, array.byteLength).toString('base64'));

{
  const { obstacles, colliders } = street();
  const overlay = createTerrainDeformation();
  const field = createDeformedHeightField(baseField, overlay);
  const grid = gridOver(field, obstacles);
  assert.equal(typeof grid.refreshArea, 'function', 'every grid can refresh an area');
  const blockedBefore = grid.blocked.reduce((n, v) => n + v, 0);
  // houses come down: their records flip, their heaps rise, the grid refreshes round each
  const damage = createStructureDamage(obstacles, colliders, {
    onCollapse(structure) {
      const h = rubbleHeightFor(structure.topY - structure.baseY);
      overlay.addRubble(structure.cx, structure.cz, structure.hw, structure.hd, structure.yaw, h);
      const reach = rubbleFalloffM(structure.hw, structure.hd, h);
      const ex = Math.abs(Math.sin(structure.yaw)) * structure.hd + Math.abs(Math.cos(structure.yaw)) * structure.hw + reach;
      const ez = Math.abs(Math.cos(structure.yaw)) * structure.hd + Math.abs(Math.sin(structure.yaw)) * structure.hw + reach;
      grid.refreshArea(structure.cx - ex, structure.cz - ez, structure.cx + ex, structure.cz + ez);
    },
  });
  // the two houses either side of x = 0 (a grid cell's centre both their margins cover) fall to one blow, one swap a
  // tick (COLLAPSES_PER_TICK)
  for (const id of [2, 3]) {
    const house = damage.byId(id);
    damage.applyPoints(house, 1e6, { cause: 'blast', munition: 'howitzer', x: house.cx, y: 2, z: house.cz, dirX: 0, dirZ: 1 });
  }
  damage.step();
  assert.equal(obstacles[2].crushed && !obstacles[3].crushed, true, 'the first swaps this tick, the second waits');
  damage.step();
  assert.equal(obstacles[2].crushed && obstacles[3].crushed, true);
  // the reference: the same world built from scratch after the collapse
  const fresh = gridOver(field, obstacles);
  const [a, b] = [digest(grid), digest(fresh)];
  const names = ['heights', 'blocked', 'groundTypes', 'hullBlockedEdges', 'hullComponents', 'edgeSteepness', 'hullBends'];
  for (let i = 0; i < names.length; i++) assert.equal(a[i], b[i], `the refreshed ${names[i]} equal a fresh build's`);
  const blockedAfter = grid.blocked.reduce((n, v) => n + v, 0);
  assert.ok(blockedAfter < blockedBefore, `cells opened where the house stood (${blockedBefore} → ${blockedAfter})`);
  // a cell on the fallen house's line is open and sits on the heap
  const cell = (x, z) => Math.round((z + 500) / 25) * 41 + Math.round((x + 500) / 25);
  assert.equal(grid.blocked[cell(0, 0)], 0, 'the cell between the fallen houses is open');
  assert.equal(grid.blocked[cell(-25, 0)], 1, 'the cell its standing neighbour covers stays blocked');
  assert.ok(overlay.offsetAt(0, 0) > 0.5, `the two heaps' skirts meet there (${overlay.offsetAt(0, 0).toFixed(2)} m)`);
  assert.ok(Math.abs(grid.heights[cell(0, 0)] - (height(0, 0) + overlay.offsetAt(0, 0))) < 1e-5, 'and the cell reads them');
}

// ---- concealment: a felled tree's canopy stops concealing until the battle resets
{
  const concealers = [{ x: 10, z: 0, r: 4, add: 0.08 }, { x: 10, z: 0.5, r: 2, add: 0.35 }, { x: -10, z: 0, r: 4, add: 0.08 }];
  assert.ok(bushBonusBetween(concealers, 10, -20, 10, 20, false) > 0.1);
  assert.equal(fellConcealersAt(concealers, 10.004, 0.003), 1, 'the canopy on the trunk, within 1 cm');
  assert.equal(concealers[0].dead, true);
  assert.ok(Math.abs(bushBonusBetween(concealers, 10, -20, 10, 20, false) - 0.35) < 1e-12, 'the bush beside it still counts');
  assert.equal(fellConcealersAt(concealers, 10, 0), 0, 'a canopy falls once');
  restoreConcealers(concealers);
  assert.equal(concealers[0].dead, false, 'a new battle stands it again');
}

console.log('destructionNavigation: a refresh round a fallen house and its heap equals a fresh build (cells, heights, '
  + 'grades, hull edges, bends, components), the street opens, a felled canopy stops concealing PASS');
