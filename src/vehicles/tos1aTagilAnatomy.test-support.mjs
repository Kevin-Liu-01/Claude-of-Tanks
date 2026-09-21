import assert from 'node:assert/strict';

const STOCKS = ['yaw-bearing', 'load-platform', 'load-platform', 'load-platform'];
const STATIONS = [undefined, 0, 1, 2];
const within = (actual, expected) => assert(Math.abs(actual - expected) < 2e-7);

function closedCell(source, cell) {
  assert.equal(cell.sourceStock, source.sourceStock);
  for (const key of ['vertices', 'min', 'max']) assert.deepEqual(cell[key], source[key], `finalized ${key} retains exact measured stock`);
  assert.equal(cell.faces.length, source.faces.length, 'every measured stock face survives finalization');
  const edges = new Map();
  source.faces.forEach((indices, i) => {
    const face = cell.faces[i];
    assert.deepEqual([...face.indices].sort(), [...indices].sort(), 'finalized face retains the same triangle');
    assert.equal(face.plate.kind || 'main', 'main');
    within(Math.hypot(...face.normal), 1);
    for (const vertex of source.vertices) {
      const distance = face.constant + face.normal.reduce((sum, value, axis) => sum + value * vertex[axis], 0);
      assert(distance < 2e-7, 'each actual stock is convex with outward planes');
    }
    for (const index of indices) within(face.constant + face.normal.reduce((sum, value, axis) => sum + value * source.vertices[index][axis], 0), 0);
    for (let j = 0; j < 3; j++) {
      const key = [indices[j], indices[(j + 1) % 3]].sort((a, b) => a - b).join(':');
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  });
  assert([...edges.values()].every(count => count === 2), 'closed manifold: every stock edge belongs to exactly two faces');
}

/** This shallow two-stock platform is not the sampled turret shell used by
 * most tanks. Its cylinder and three authored section slabs are exactly four
 * cells; adding arbitrary subdivisions would not provide additional coverage.
 * The native collision selftest independently compares these cells to actual
 * emitted HIGH/LOW triangles, then applies this same finalization contract. */
export function assertTos1aTagilTurretCells(calibration, shell) {
  const measured = calibration.turretCollision;
  assert.equal(measured.length, 4, 'exact primary stock census');
  assert.equal(shell.turret.length, 4, 'all four measured primary cells survive finalization');
  assert.deepEqual(measured.map(cell => cell.sourceStock), STOCKS);
  assert.deepEqual(measured.map(cell => cell.sourceStation), STATIONS);
  const bearing = measured[0];
  for (const point of bearing.vertices) {
    within(Math.hypot(point[0], point[2]), 1.2);
    assert(Math.min(Math.abs(point[1] + .015), Math.abs(point[1] - .065)) < 2e-7, 'bearing has only its actual two radial faces');
  }
  const stations = [-1.63, -1.40, .67, .95];
  measured.slice(1).forEach((cell, i) => {
    assert.equal(cell.vertices.length, 12, 'two six-point authored station rings');
    assert.equal(cell.faces.length, 20, 'closed platform section topology');
    within(cell.min[2], stations[i]); within(cell.max[2], stations[i + 1]);
  });
  measured.forEach((cell, i) => closedCell(cell, shell.turret[i]));
  const occupied = point => shell.turret.some(cell => cell.faces.every(face => (
    face.constant + face.normal.reduce((sum, value, axis) => sum + value * point[axis], 0) <= 1e-8
  )));
  for (const point of [[0, .02, 1.12], [0, .06, -1.55], [1.5, .12, 0], [0, .12, .8]]) assert(occupied(point), 'bearing and every platform section remain damageable');
  for (const point of [[1.4, .04, .8], [-1.4, .04, .8], [1.6, 0, 1.1], [0, .4, -1.3]]) assert(!occupied(point), 'exact union preserves air outside and above the two primary stocks');
}
