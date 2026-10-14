// shellLightCover.selftest.mjs — a round breaks the light cover it flies through (destruction stream, 2026-10-12; the
// owner: "make sure all props below a certain size are destructible whether from ramming or shooting"; MASTER item 17).
// The sweep both simulations share: the crushable records a round passes through (fences, crates, carts, cars) that its
// segment crosses before what stops it, nearest first, bounded; dense cover, structures, trees, crushed records, a record
// the round passes over and one beyond the stop are left alone. The authority's receipt (authoritativeMatch.selftest)
// pins a parked car broken by a live round that flies on into a tank.
import assert from 'node:assert/strict';
import { LIGHT_COVER_PER_SEGMENT, sweepLightCover } from './shellLightCover.ts';

const box = (x0, z0, x1, z1, extra = {}) => ({ min: [x0, 0, z0], max: [x1, 1.6, z1], crushable: true, kind: 'fencerail', ...extra });
const queryOf = (records) => (minX, minZ, maxX, maxZ, out) => {
  out.length = 0;
  for (const r of records) if (r.max[0] >= minX && r.min[0] <= maxX && r.max[2] >= minZ && r.min[2] <= maxZ) out.push(r);
  return out;
};
const origin = { x: 0, y: 1, z: 0 }, east = { x: 1, y: 0, z: 0 };

// nearest first; dense cover, structures, trees, crushed records skipped; a record past the stop untouched
{
  const fenceFar = box(9, -1, 9.4, 1), fenceNear = box(3, -1, 3.3, 1, { kind: 'fencepicket' });
  const car = box(6, -1, 7.8, 1, { kind: 'sedan', propIdx: 7 });
  const sandbags = box(4.5, -1, 5, 1, { kind: 'sandbagbig' });
  const shed = box(5.2, -1, 5.6, 1, { structureIdx: 3 });
  const tree = box(7.9, -1, 8.2, 1, { treeIdx: 2 });
  const gone = box(8.4, -1, 8.6, 1, { crushed: true });
  const beyond = box(12, -1, 12.4, 1);
  const seen = [];
  const n = sweepLightCover(queryOf([fenceFar, beyond, car, sandbags, shed, tree, gone, fenceNear]), origin, east, 11, [],
    (record, distance) => { seen.push([record.kind, +distance.toFixed(2)]); });
  assert.deepEqual(seen, [['fencepicket', 3], ['sedan', 6], ['fencerail', 9]], `nearest first, light cover only (${JSON.stringify(seen)})`);
  assert.equal(n, 3);
}

// a round that passes over a fence leaves it (the records' heights count)
{
  const low = box(3, -1, 3.3, 1);
  const seen = [];
  sweepLightCover(queryOf([low]), { x: 0, y: 2.4, z: 0 }, east, 10, [], (record) => seen.push(record));
  assert.equal(seen.length, 0, 'a round 0.8 m over the fence top flies over it');
}

// one prop group's sibling records break once (the first met crushes the group: its siblings are crushed with it)
{
  const a = box(2, -1, 2.2, 1, { propIdx: 5 }), b = box(2.6, -1, 2.8, 1, { propIdx: 5 });
  let breaks = 0;
  sweepLightCover(queryOf([a, b]), origin, east, 10, [], () => { breaks++; a.crushed = true; b.crushed = true; });
  assert.equal(breaks, 1, 'a group breaks once');
}

// bounded per segment: a volley along a fence line breaks at most LIGHT_COVER_PER_SEGMENT a step, the nearest ones
{
  const line = Array.from({ length: 20 }, (_, i) => box(1 + i, -1, 1.2 + i, 1));
  const seen = [];
  sweepLightCover(queryOf(line.slice().reverse()), origin, east, 30, [], (record, d) => seen.push(d));
  assert.equal(seen.length, LIGHT_COVER_PER_SEGMENT, 'bounded');
  assert.ok(seen.every((d, i) => i === 0 || d >= seen[i - 1]) && seen[0] < 1.01, 'the nearest, in order');
}

// deterministic and allocation-free in shape: the same call twice visits the same records in the same order
{
  const recs = [box(2, -1, 2.2, 1), box(4, -1, 4.2, 1), box(3, -1, 3.2, 1)];
  const run = () => { const out = []; sweepLightCover(queryOf(recs), origin, east, 10, [], (r, d) => out.push(d)); return out; };
  assert.deepEqual(run(), run());
}

console.log('shellLightCover selftest: nearest first, light cover only, heights, groups once, bounded, deterministic — ok');
