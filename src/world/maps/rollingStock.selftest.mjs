import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ROLLING_STOCK_BODY, ROLLING_STOCK_LENGTH, buildRollingStock } from './rollingStock.ts';
import { railStockPlacements } from '../railSpurs.ts';
import railyard from './railyard.ts';
import { MAP_IDS, getMapConfig } from './index.ts';

// The map-vehicles lane (P5, 2026-10-06): the rolling stock is built at its real dimensions in the painted bucket's
// streams, stands with its treads on the rail head (y = 0), keeps its triangles bounded and rebuilds byte for byte;
// Cinder Junction's standing cuts keep the yard's rotational symmetry, stay on the straight between the throats and
// clear of the station square, and leave room between cuts to cross the yard. The Soviet bogie stock (1950s) runs on
// 1520 mm: a spur that stands it is laid to that gauge, and the yards' DB stock keeps the default.

const digest = (g) => {
  const hash = createHash('sha256');
  for (const key of Object.keys(g.attributes).sort()) {
    const a = g.attributes[key].array; hash.update(key).update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  }
  const i = g.index.array; hash.update(Buffer.from(i.buffer, i.byteOffset, i.byteLength));
  return hash.digest('hex');
};

const SOVIET = new Set(['covered4', 'gondola4', 'tank4', 'tem1']);
let worst = 0;
for (const kind of Object.keys(ROLLING_STOCK_LENGTH)) {
  const g = buildRollingStock(kind);
  try {
    assert.deepEqual(Object.keys(g.attributes).sort(), ['color', 'normal', 'position', 'uv'], `${kind}: the painted bucket's streams`);
    assert.ok(g.index && g.index.count % 3 === 0, `${kind}: indexed whole triangles`);
    for (const a of Object.values(g.attributes)) assert.ok(a.array.every(Number.isFinite), `${kind}: finite streams`);
    g.computeBoundingBox();
    const b = g.boundingBox, L = ROLLING_STOCK_LENGTH[kind], body = ROLLING_STOCK_BODY[kind];
    assert.ok(b.min.y > -0.05 && b.min.y <= 0, `${kind}: the flanges just under the rail head (${b.min.y.toFixed(3)})`);
    assert.ok(Math.abs(b.max.z - b.min.z - L) < 0.4, `${kind}: ${(b.max.z - b.min.z).toFixed(2)} m over buffers (${L})`);
    assert.ok(Math.abs(b.max.z + b.min.z) < 0.05, `${kind}: centred on its length`);
    assert.ok(b.max.x - b.min.x <= body.w + 0.25 && b.max.x - b.min.x >= body.w - 0.4, `${kind}: its width`);
    assert.ok(b.max.y <= body.h + 0.5 && b.max.y >= body.h - 0.4, `${kind}: its height over the rail (${b.max.y.toFixed(2)})`);
    const tris = g.index.count / 3;
    worst = Math.max(worst, tris);
    // a locomotive carries more than a wagon: the Soviet stock's 6000, and the V60's rods, cranks and jackshaft, its
    // rounded hoods, rails and three lamps an end (round 4, wave 260) at that too
    // (round 5, wave 278) the Omm's heap at a granular grain, its rough lumps and its spill: a coal wagon at 6000 too
    // and the V60 at 6500: its louvres, framed glass, sand boxes, white tyre rims and soot (round 5, wave 278)
    const budget = kind === 'v60' ? 6500 : SOVIET.has(kind) || kind === 'omm' ? 6000 : 5000;
    assert.ok(tris <= budget, `${kind}: ${tris} triangles within the budget (${budget})`);
    const again = buildRollingStock(kind);
    assert.equal(digest(again), digest(g), `${kind}: a rebuild is byte-identical`);
    again.dispose();
  } finally { g.dispose(); }
}

// Cinder Junction's cuts
const spurs = railyard.terrain.railSpurs;
const placed = spurs.flatMap((spur, index) => railStockPlacements(spur, ROLLING_STOCK_LENGTH).map((p) => ({ ...p, index })));
assert.ok(placed.length >= 12, `the yard has its standing stock (${placed.length})`);
for (const p of placed) {
  // every vehicle has its twin turned through 180 degrees about the station square
  const twin = placed.find((q) => q.kind === p.kind && Math.hypot(q.x + p.x, q.z + p.z) < 0.2);
  assert.ok(twin, `${p.kind} at (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) has its 180-degree twin`);
  assert.ok(Math.abs(twin.ux + p.ux) < 1e-6 && Math.abs(twin.uz + p.uz) < 1e-6, 'the twin faces the other way');
  // on the straight between the throats, clear of the station square and its crossing
  assert.ok(Math.abs(p.x) > 60 && Math.abs(p.x) < 170, `${p.kind} stands out along the straight (x ${p.x.toFixed(1)})`);
}
// the cuts on each siding leave room to cross the yard
for (const spur of spurs) {
  if (!spur.stock?.length) continue;
  const ends = spur.stock.map((cut) => {
    const length = cut.kinds.reduce((sum, kind) => sum + ROLLING_STOCK_LENGTH[kind], 0);
    return [cut.atM, cut.atM + length];
  }).sort((a, b) => a[0] - b[0]);
  for (let k = 1; k < ends.length; k++) assert.ok(ends[k][0] - ends[k - 1][1] >= 20, 'a 20 m gap between cuts');
}

// the gauge each spur's stock runs on
let soviet = 0;
for (const mapId of MAP_IDS) {
  for (const spur of getMapConfig(mapId).terrain?.railSpurs ?? []) {
    const kinds = (spur.stock ?? []).flatMap((cut) => cut.kinds);
    for (const kind of kinds) assert.ok(ROLLING_STOCK_LENGTH[kind], `${mapId}: ${kind} is built`);
    const su = kinds.filter((kind) => SOVIET.has(kind)).length;
    soviet += su;
    if (su) assert.equal(spur.gauge, 1.52, `${mapId}: the spur that stands Soviet stock is laid to 1520 mm`);
    assert.ok(su === 0 || su === kinds.length, `${mapId}: one railway's stock to a spur`);
    if (kinds.length && !su) assert.equal(spur.gauge ?? 1.44, 1.44, `${mapId}: the standard-gauge stock on the default spur`);
  }
}

console.log(`rollingStock.selftest: ${Object.keys(ROLLING_STOCK_LENGTH).length} vehicles at their dimensions on the rail, bounded `
  + `(worst ${worst} triangles), byte-identical; Cinder Junction's ${placed.length} standing vehicles symmetric about the square; `
  + `${soviet} Soviet vehicle(s) on 1520 mm spurs`);
