import assert from 'node:assert/strict';
import {
  PARKED_VEHICLE_CLEARANCE, parkedFootprintsOverlap, separateParkedVehicles,
} from './parkedVehicleSeparation.ts';
import { createCollisionManifestLoader } from '../../server/collisionManifestLoader.ts';
import { MAP_IDS } from './maps/index.ts';

// The map-vehicles lane (2026-10-05): parked vehicles never stand inside each other. The pass moves only the later
// vehicle of an overlapping pair, along its heading, onto a seat clear of every other vehicle and judged clear by the
// caller, or drops it; and no map's committed collision shard (which collisionManifestDrift holds to the tree) has
// two vehicles within the clearance.

const box = { hw: 0.9, hl: 2.1 };
const car = (x, z, yaw = 0, kind = 'sedan') => ({ kind, x, z, yaw, sc: 1 });

// the footprint test: side by side, nose to tail, crossed, rotated corners
assert.ok(parkedFootprintsOverlap(car(0, 0), box, car(1.2, 0.3), box), 'side by side, 1.2 m apart: inside each other');
assert.ok(!parkedFootprintsOverlap(car(0, 0), box, car(0, 4.2 + PARKED_VEHICLE_CLEARANCE + 0.01), box),
  'nose to tail past the clearance: clear');
assert.ok(parkedFootprintsOverlap(car(0, 0), box, car(0, 4.2 + PARKED_VEHICLE_CLEARANCE - 0.05), box),
  'nose to tail inside the clearance: too close');
assert.ok(parkedFootprintsOverlap(car(0, 0), box, car(2.5, 0, Math.PI / 2), box), 'crossed: the nose meets the door');
const diagonal = car(3.4, 3.4, Math.PI / 4);
assert.ok(!parkedFootprintsOverlap(car(0, 0), box, diagonal, box), 'corner to corner on a diagonal with air between: clear');
assert.equal(parkedFootprintsOverlap(car(0, 0), box, diagonal, box), parkedFootprintsOverlap(diagonal, box, car(0, 0), box),
  'the test is symmetric');

// the pass: the later of a pair slides forward along its heading, clear of every vehicle
{
  const fleet = [car(0, 0), car(0.2, 0.4, 0.05), car(0, 30)];
  const moves = [];
  const receipt = separateParkedVehicles(fleet, {
    footprint: () => box, seatClear: () => true,
    move: (v, x, z) => { moves.push([v, x, z]); v.x = x; v.z = z; }, drop: () => assert.fail('nothing to drop'),
  });
  assert.equal(receipt.overlapping, 1, 'one overlapping pair');
  assert.equal(moves.length, 1, 'one vehicle moves');
  assert.equal(moves[0][0], fleet[1], 'the LATER vehicle of the pair moves, never the earlier');
  assert.ok(moves[0][2] > 4, 'forward along its heading first');
  for (let i = 0; i < fleet.length; i++) for (let j = i + 1; j < fleet.length; j++) {
    assert.ok(!parkedFootprintsOverlap(fleet[i], box, fleet[j], box), `no overlap left (${i}, ${j})`);
  }
}
// forward blocked by a later vehicle: back instead; a move never makes a new overlap
{
  const fleet = [car(0, 0), car(0, 0.5), car(0, 5.6)];
  const receipt = separateParkedVehicles(fleet, {
    footprint: () => box, seatClear: () => true, move: (v, x, z) => { v.x = x; v.z = z; }, drop: () => assert.fail('no drop'),
  });
  assert.equal(receipt.moved.length, 1);
  assert.ok(fleet[1].z < 0, 'the forward seat holds a later vehicle, so it backs up');
  for (let i = 0; i < fleet.length; i++) for (let j = i + 1; j < fleet.length; j++) {
    assert.ok(!parkedFootprintsOverlap(fleet[i], box, fleet[j], box), `no overlap left (${i}, ${j})`);
  }
}
// the caller's seat rules decide; no clear seat drops the later vehicle, which then stops counting as a blocker
{
  const fleet = [car(0, 0), car(0.3, 0.2), car(0.1, -0.2)];
  const dropped = [];
  const receipt = separateParkedVehicles(fleet, {
    footprint: () => box, seatClear: (v, x, z) => !(v === fleet[1]) && Math.abs(z) < 20,
    move: (v, x, z) => { v.x = x; v.z = z; }, drop: (v) => dropped.push(v),
  });
  assert.deepEqual(dropped, [fleet[1]], 'no seat cleared for the second: dropped');
  assert.equal(receipt.dropped.length, 1);
  assert.equal(receipt.moved.length, 1, 'the third still overlaps the first and moves');
  assert.ok(!parkedFootprintsOverlap(fleet[0], box, fleet[2], box));
}
// no stream: the same input gives the same receipt, and a fleet without overlaps is left exactly as it was
{
  const make = () => [car(0, 0), car(0.2, 0.4, 0.05), car(10, 0), car(10.4, 0.6, 1.2)];
  const run = (fleet) => separateParkedVehicles(fleet, { footprint: () => box, seatClear: () => true,
    move: (v, x, z) => { v.x = x; v.z = z; }, drop: () => {} });
  assert.deepEqual(run(make()), run(make()), 'deterministic');
  const apart = [car(0, 0), car(0, 10), car(10, 0)], before = JSON.stringify(apart);
  const receipt = run(apart);
  assert.equal(receipt.overlapping, 0);
  assert.equal(JSON.stringify(apart), before, 'nothing moves without an overlap');
}

// every map's committed collision shard: no two vehicles' ground footprints (the convex hull of their contact band)
// come within the clearance (less a centimetre's packing slack)
const VEHICLES = new Set(['sedan', 'wagon', 'pickup', 'van', 'jeep', 'truck', 'truckbox', 'truckflatbed']);
function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), q) <= 0) lower.pop(); lower.push(q); }
  for (const q of p.reverse()) { while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), q) <= 0) upper.pop(); upper.push(q); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
function shapePoints(shape) {
  if (!shape) return [];
  if (shape[0] === 'm') return shape.slice(1).flatMap(shapePoints);
  if (shape[0] === 'o') {
    const [, cx, cz, hw, hl, yaw] = shape, s = Math.sin(yaw), c = Math.cos(yaw);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [cx + u * hw * c + v * hl * s, cz - u * hw * s + v * hl * c]);
  }
  const numbers = shape[0] === 'w' ? shape.slice(3) : shape.slice(1);
  const out = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) out.push([numbers[i], numbers[i + 1]]);
  return out;
}
/** The gap between two convex polygons along the best separating edge normal (negative: they overlap). */
function gap(a, b) {
  let best = -Infinity;
  for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const nx = q[1] - p[1], nz = p[0] - q[0], l = Math.hypot(nx, nz) || 1;
    const project = (pts) => pts.map(([x, z]) => (x * nx + z * nz) / l);
    const pa = project(a), pb = project(b);
    best = Math.max(best, Math.min(...pb) - Math.max(...pa), Math.min(...pa) - Math.max(...pb));
  }
  return best;
}
const loader = createCollisionManifestLoader();
let vehicles = 0, pairs = 0;
for (const mapId of MAP_IDS) {
  const manifest = loader.get(mapId);
  const footprints = manifest.obstacles.filter((r) => VEHICLES.has(r.k)).map((r) => ({ r, poly: hull(shapePoints(r.s)) }));
  vehicles += footprints.length;
  for (let i = 0; i < footprints.length; i++) for (let j = i + 1; j < footprints.length; j++) {
    const a = footprints[i], b = footprints[j];
    if (Math.abs(a.r.b[0] - b.r.b[0]) > 12 || Math.abs(a.r.b[2] - b.r.b[2]) > 12) continue;
    pairs++;
    const g = gap(a.poly, b.poly);
    assert.ok(g >= PARKED_VEHICLE_CLEARANCE - 0.05,
      `${mapId}: a ${a.r.k} and a ${b.r.k} stand ${g.toFixed(2)} m apart at (${a.r.b[0].toFixed(1)}, ${a.r.b[2].toFixed(1)})`);
  }
}
console.log(`parkedVehicleSeparation.selftest: the pass's footprint, order, seat and drop rules; ${vehicles} parked vehicles `
  + `on ${MAP_IDS.length} maps' shards, ${pairs} neighbouring pairs, none within ${PARKED_VEHICLE_CLEARANCE} m`);
