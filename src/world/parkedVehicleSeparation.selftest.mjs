import assert from 'node:assert/strict';
import {
  CART_SLIDE_MAX_M, PARKED_VEHICLE_CLEARANCE, parkedFootprintsOverlap, polygonGap, seatCartsClear, separateParkedVehicles,
  shapePolygons, VEHICLE_SLIDE_MAX_M,
} from './parkedVehicleSeparation.ts';
import { createCollisionManifestLoader } from '../../server/collisionManifestLoader.ts';
import { MAP_IDS } from './maps/index.ts';

// The map-vehicles lane (2026-10-05): parked vehicles never stand inside each other. The pass moves only the later
// vehicle of an overlapping pair, along its heading, onto a seat clear of every other vehicle and judged clear by the
// caller, or drops it; and no map's committed collision shard (which collisionManifestDrift holds to the tree) has
// two vehicles within the clearance. 2026-10-06 (the integrator's ruling): no cart stands inside anything either — a
// cart whose body meets an obstacle, a tree, a vehicle or another cart slides the smallest way that clears it, within
// 3 m and on its own lot, or is dropped; on every shard the carts keep the vehicles' clearance and stand clear of every
// other obstacle, and Longleaf's haycart, which stood in a fence line, stands beside it.

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

// the cart seating: the separating axis and its gap; a record's footprint as polygons; a cart straddling a fence line
// slides out on its own side by the smallest step that clears it, a boxed-in cart is dropped, a clear one stays
{
  const box = (cx, cz, hw, hl) => [[cx - hw, cz - hl], [cx + hw, cz - hl], [cx + hw, cz + hl], [cx - hw, cz + hl]];
  let g = polygonGap(box(0, 0, 1, 1), box(3, 0, 1, 1));
  assert.ok(Math.abs(g.gap - 1) < 1e-9 && g.nx === -1 && g.nz === 0, 'a 1 m gap, the first box leaving the second to -x');
  g = polygonGap(box(0, 0.2, 1.1, 0.6), box(0, 0, 10, 0.05));
  assert.ok(Math.abs(g.gap + 0.45) < 1e-9 && g.nz === 1, 'a cart 0.45 m into a fence leaves it the short way');
  const obb = shapePolygons({ min: [-1, 0, -2], max: [1, 1, 2], shape2: { kind: 'obb', cx: 0, cz: 0, hw: 1, hl: 2, yaw: 0 } })[0];
  assert.deepEqual(obb.map(([x, z]) => [Math.round(x), Math.round(z)]), [[-1, -2], [1, -2], [1, 2], [-1, 2]], 'an OBB as its corners');
  const compound = shapePolygons({ min: [0, 0, 0], max: [1, 1, 1], shape2: { kind: 'compound', cx: 0, cz: 0, parts: [
    { kind: 'circle', cx: 0, cz: 0, r: 1 }, { kind: 'convex', cx: 0, cz: 0, points: [0, 0, 1, 0, 0, 1] }] } });
  assert.equal(compound.length, 2); assert.equal(compound[0].length, 12); assert.equal(compound[1].length, 3);
  const fence = box(0, 0, 10, 0.05), body = (x, z) => box(x, z, 1.1, 0.6);
  const run = (cart, opts) => seatCartsClear([cart], { blocked: (c, x, z) => polygonGap(body(x, z), fence).gap < 0.05,
    away: (c) => { const q = polygonGap(body(c.x, c.z), fence); return [q.nx, q.nz]; },
    seatOk: (c, x, z) => z > 0, move: (c, x, z) => { c.x = x; c.z = z; }, drop: (c) => { c.dropped = true; }, ...opts });
  const cart = { kind: 'haycart', x: 0, z: 0.2, yaw: Math.PI / 2, sc: 1 };
  const receipt = run(cart);
  assert.equal(receipt.slid.length, 1);
  assert.ok(Math.abs(cart.x) < 1e-9 && cart.z > 0.65 && cart.z <= 0.2 + 1, `straight out on its own side, the least (z ${cart.z})`);
  assert.deepEqual(run({ ...cart, x: 0, z: 0.2 }), receipt, 'no stream: the same seat every time');
  const boxed = { kind: 'sled', x: 0, z: 0.2, yaw: 0, sc: 1 };
  assert.equal(run(boxed, { seatOk: () => false }).dropped.length, 1, 'no seat within reach: dropped');
  assert.ok(boxed.dropped);
  const clear = { kind: 'handcart', x: 0, z: 5, yaw: 0, sc: 1 };
  assert.equal(run(clear, { move: () => assert.fail('a clear cart stays') }).blocked, 0);
  assert.equal(CART_SLIDE_MAX_M, 3, 'the ruling\'s reach');
  // 2026-10-08: a vehicle may go further (its own reach, `maxSlide`)
  const lorry = { kind: 'truck', x: 0, z: 0.2, yaw: Math.PI / 2, sc: 1 };
  const long = (x, z) => box(x, z, 1.1, 4.2);
  const r2 = seatCartsClear([lorry], { blocked: (c, x, z) => polygonGap(long(x, z), fence).gap < 0.05,
    away: (c) => { const q = polygonGap(long(c.x, c.z), fence); return [q.nx, q.nz]; },
    seatOk: (c, x, z) => z > 3, move: (c, x, z) => { c.x = x; c.z = z; }, drop: (c) => { c.dropped = true; },
    maxSlide: () => VEHICLE_SLIDE_MAX_M });
  assert.equal(r2.slid.length, 1, 'a vehicle slides past the cart\'s 3 m when its seat needs it');
  assert.ok(lorry.z > 3 && r2.slid[0].by <= VEHICLE_SLIDE_MAX_M, `within its own reach (${r2.slid[0].by} m)`);
}

// every map's committed collision shard: no two vehicles' ground footprints (the convex hull of their contact band)
// come within the clearance (less a centimetre's packing slack); since 2026-10-06 the carts are vehicles of the pass
const CARTS = new Set(['handcart', 'haycart', 'sled']);
const VEHICLES = new Set(['sedan', 'wagon', 'pickup', 'van', 'jeep', 'truck', 'truckbox', 'truckflatbed', ...CARTS]);
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
// and no cart's footprint stands in any other obstacle (a fence, a wall, firewood, a trough, a building, rubble, a rock,
// a tree, a hedgehog): the pass seats each cart's whole body clear by 5 cm, its collision footprint lies inside that
let carts = 0;
const shardPolys = (record) => shapePolygons({ min: [record.b[0], 0, record.b[2]], max: [record.b[0], 0, record.b[2]],
  shape2: decodeShape(record.s) });
function decodeShape(s) {
  if (!s) return undefined;
  if (s[0] === 'm') return { kind: 'compound', cx: 0, cz: 0, parts: s.slice(1).map(decodeShape) };
  if (s[0] === 'o') return { kind: 'obb', cx: s[1], cz: s[2], hw: s[3], hl: s[4], yaw: s[5] };
  if (s[0] === 'c') return { kind: 'circle', cx: s[1], cz: s[2], r: s[3] };
  return { kind: 'convex', cx: 0, cz: 0, points: s[0] === 'w' ? s.slice(3) : s.slice(1) };
}
// 2026-10-08 (the map-vehicles lane's placement audit over the merge): the parked vehicles too stand clear of every
// other obstacle — the seating pass takes them after the lampposts, the sandbags, the hulks, the rubble and the kerbs
let parkedClear = 0;
for (const mapId of MAP_IDS) {
  const obstacles = loader.get(mapId).obstacles;
  for (const cart of obstacles.filter((r) => VEHICLES.has(r.k) && !CARTS.has(r.k))) {
    parkedClear++;
    const own = shardPolys(cart);
    for (const other of obstacles) {
      if (other === cart || VEHICLES.has(other.k)) continue;
      if (Math.abs(other.b[0] - cart.b[0]) > 18 || Math.abs(other.b[2] - cart.b[2]) > 18) continue;
      for (const a of own) for (const b of shardPolys(other)) {
        const g = polygonGap(a, b).gap;
        assert.ok(g >= -0.02, `${mapId}: a ${cart.k} at (${cart.b[0].toFixed(1)}, ${cart.b[2].toFixed(1)}) stands ${(-g).toFixed(2)} m into a ${other.k ?? 'solid'}`);
      }
    }
  }
}
for (const mapId of MAP_IDS) {
  const obstacles = loader.get(mapId).obstacles;
  for (const cart of obstacles.filter((r) => CARTS.has(r.k))) {
    carts++;
    const own = shardPolys(cart);
    for (const other of obstacles) {
      if (other === cart || VEHICLES.has(other.k)) continue;
      if (Math.abs(other.b[0] - cart.b[0]) > 15 || Math.abs(other.b[2] - cart.b[2]) > 15) continue;
      for (const a of own) for (const b of shardPolys(other)) {
        const g = polygonGap(a, b).gap;
        assert.ok(g >= -0.02, `${mapId}: a ${cart.k} at (${cart.b[0].toFixed(1)}, ${cart.b[2].toFixed(1)}) stands ${(-g).toFixed(2)} m into a ${other.k ?? 'solid'}`);
      }
    }
  }
}
// the canonical case: Longleaf's haycart stood 0.03 m (its body more) into the fence line along its field (2026-10-06
// shards) and the seating pass slid it clear. Since gauntlet wave 211 (2026-10-07) its road station on the field's bank
// is steeper than the carts' 12-degree tilt cap, so it stands across the road at the station's far side, and nothing is
// left on the bank by the fence line
{
  const obstacles = loader.get('longleaf').obstacles;
  const haycart = obstacles.filter((r) => r.k === 'haycart')
    .sort((a, b) => Math.hypot(a.b[0] + 291.71, a.b[2] + 217.18) - Math.hypot(b.b[0] + 291.71, b.b[2] + 217.18))[0];
  // (2026-10-08: 0.8 m further along the road than the 10-07 shards had it — the seating pass now keeps a cart off a
  // destructible's refitted band as well as its box, and the fence modules' bands outreach their boxes)
  assert.ok(haycart && Math.hypot(haycart.b[0] + 291.71, haycart.b[2] + 217.18) <= 0.5, 'Longleaf\'s haycart stands across the road from its steep station');
  assert.ok(!obstacles.some((r) => (r.k === 'haycart' || r.k === 'handcart') && Math.hypot(r.b[0] + 275.5, r.b[2] + 204.3) <= CART_SLIDE_MAX_M),
    'no cart is left on the bank by the fence line');
  const fences = obstacles.filter((r) => r.k === 'fenceplank' && Math.hypot(r.b[0] + 275.5, r.b[2] + 204.3) < 8);
  assert.ok(fences.length > 0, 'the fence line is there');
}
console.log(`parkedVehicleSeparation.selftest: the pass's footprint, order, seat and drop rules; ${vehicles} parked vehicles `
  + `on ${MAP_IDS.length} maps' shards, ${pairs} neighbouring pairs, none within ${PARKED_VEHICLE_CLEARANCE} m, ${parkedClear} clear of every `
  + `other obstacle; ${carts} carts, none inside an obstacle; Longleaf's haycart across the road from its steep station`);
