// recordClearance.selftest.mjs — the street kits' footprint clearance from a grid of the records (recordClearance.ts,
// 2026-10-13, the perf stream) answers as the walk over every record did: the same verdict for every footprint, across
// records added between queries, felled records, records whose edges touch the footprint's exactly (the walk's strict
// test lets them pass), giant and non-finite records, and degenerate footprints. The two kits (sarajevoStreets.ts,
// shanghaiStreets.ts) ask it and keep no walk of their own.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRecordClearance } from './recordClearance.ts';

const walk = (records, cx, cz, hl, hw, tx, tz, pad) => {
  const ex = Math.abs(tx) * hl + Math.abs(tz) * hw + pad, ez = Math.abs(tz) * hl + Math.abs(tx) * hw + pad;
  return !records.some((r) => !r.dead && r.max[0] > cx - ex && r.min[0] < cx + ex && r.max[2] > cz - ez && r.min[2] < cz + ez);
};
let seed = 913;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const box = (x, z, hx, hz) => ({ min: [x - hx, 0, z - hz], max: [x + hx, 3, z + hz] });
const records = [];
for (let i = 0; i < 3000; i++) {
  const r = box((rand() - 0.5) * 900, (rand() - 0.5) * 900, i % 97 === 0 ? 20 + rand() * 60 : 0.2 + rand() * 6, 0.2 + rand() * 6);
  if (rand() < 0.05) r.dead = true;
  records.push(r);
}
records.push(box(0, 0, 2000, 3)); // a giant band across the map
records.push({ min: [NaN, 0, 0], max: [NaN, 1, 1] }); // non-finite bounds never block (the walk's comparisons fail)
records.push({ min: [-Infinity, 0, 40], max: [Infinity, 1, 41] }); // an infinite strip
const live = [...records];
const grid = createRecordClearance(records);
let blocked = 0, clear = 0;
for (let k = 0; k < 20000; k++) {
  const hl = k % 5 === 0 ? 11 : 0.3 + rand() * 3, hw = 0.3 + rand() * 2, pad = rand() * 0.5;
  const a = rand() * 6.283, tx = Math.cos(a), tz = Math.sin(a);
  let cx = (rand() - 0.5) * 1000, cz = (rand() - 0.5) * 1000;
  if (k % 4 === 0) {
    // a footprint whose padded box edge lands exactly on a record's edge
    const r = live[Math.floor(rand() * 3000)];
    const ex = Math.abs(tx) * hl + Math.abs(tz) * hw + pad;
    cx = r.max[0] + ex; cz = (r.min[2] + r.max[2]) / 2;
  }
  const want = walk(live, cx, cz, hl, hw, tx, tz, pad);
  assert.equal(grid.clears(cx, cz, hl, hw, tx, tz, pad), want, `footprint ${k} at (${cx}, ${cz})`);
  want ? clear++ : blocked++;
  if (k % 50 === 0) {
    // the kit places a piece where it cleared and holds it from then on
    const r = box(cx, cz, hl, hw);
    live.push(r); grid.add(r);
  }
}
assert.ok(blocked > 3000 && clear > 3000, `both verdicts reached (${blocked} blocked, ${clear} clear)`);
// a felled record stops blocking at once (the walk reads `dead` at each query)
{
  const r = box(5000, 5000, 3, 3);
  live.push(r); grid.add(r);
  assert.equal(grid.clears(5000, 5000, 1, 1, 1, 0, 0), false);
  r.dead = true;
  assert.equal(grid.clears(5000, 5000, 1, 1, 1, 0, 0), true);
}
// degenerate footprints answer as the walk
for (const [cx, cz, hl] of [[NaN, 0, 1], [0, 0, 1e9], [0, 0, Infinity]]) {
  assert.equal(grid.clears(cx, cz, hl, 1, 1, 0, 0), walk(live, cx, cz, hl, 1, 1, 0, 0), `degenerate footprint (${cx}, ${cz}, ${hl})`);
}
// (the Miljacka valley round, landed 2026-10-17) `shapes`: the box test, then the footprint's points against each record's
// footprint (a box record: its bounds grown by the pad): equal to that walk on every footprint above, and a turned
// footprint whose box meets a record's box but whose points keep off it clears where the box test alone blocks
{
  const shapeGrid = createRecordClearance(live, { shapes: true });
  const pointWalk = (cx, cz, hl, hw, tx, tz, pad) => {
    const ex = Math.abs(tx) * hl + Math.abs(tz) * hw + pad, ez = Math.abs(tz) * hl + Math.abs(tx) * hw + pad;
    const nx = -tz, nz = tx, na = Math.max(1, Math.ceil(2 * hl)), nb = Math.max(1, Math.ceil(2 * hw));
    return !live.some((r) => {
      if (r.dead || !(r.max[0] > cx - ex && r.min[0] < cx + ex && r.max[2] > cz - ez && r.min[2] < cz + ez)) return false;
      for (let i = 0; i <= na; i++) for (let j = 0; j <= nb; j++) {
        const a = -hl + (2 * hl * i) / na, b = -hw + (2 * hw * j) / nb, x = cx + tx * a + nx * b, z = cz + tz * a + nz * b;
        if (x >= r.min[0] - pad && x <= r.max[0] + pad && z >= r.min[2] - pad && z <= r.max[2] + pad) return true;
      }
      return false;
    });
  };
  let eased = 0;
  for (let k = 0; k < 4000; k++) {
    const hl = 0.3 + rand() * 6, hw = 0.3 + rand() * 2, pad = rand() * 0.5, a = rand() * 6.283, tx = Math.cos(a), tz = Math.sin(a);
    const cx = (rand() - 0.5) * 1000, cz = (rand() - 0.5) * 1000;
    const want = pointWalk(cx, cz, hl, hw, tx, tz, pad);
    assert.equal(shapeGrid.clears(cx, cz, hl, hw, tx, tz, pad), want, `shapes footprint ${k} at (${cx}, ${cz})`);
    if (want && !walk(live, cx, cz, hl, hw, tx, tz, pad)) eased++;
  }
  assert.ok(eased > 0, 'the point test clears some footprint the box test blocks');
  const corner = createRecordClearance([box(0, 0, 1, 1)], { shapes: true });
  const d = Math.SQRT1_2;
  assert.equal(corner.clears(3.2, 3.2, 3, 0.4, d, -d, 0), true, 'a turned footprint past a box corner clears');
  assert.equal(createRecordClearance([box(0, 0, 1, 1)]).clears(3.2, 3.2, 3, 0.4, d, -d, 0), false, 'the box test alone blocks it');
  assert.equal(corner.clears(1.2, 0, 1, 0.4, 0, 1, 0), false, 'a footprint over the box blocks');
}
// the kits ask the grid and keep no walk of their own
for (const kit of ['sarajevoStreets.ts', 'shanghaiStreets.ts']) {
  const source = readFileSync(new URL(`./${kit}`, import.meta.url), 'utf8');
  assert.doesNotMatch(source, /function clears\(/, `${kit}: no local walk`);
  assert.doesNotMatch(source, /records\.some\(/, `${kit}: no walk over the records`);
  assert.match(source, /const records = createRecordClearance\(\[\.\.\.\(ctx\.obstacles \?\? \[\]\), \.\.\.\(ctx\.colliders \?\? \[\]\)\](, \{ shapes: true \})?\);/, `${kit}: the grid of the records placed so far`);
  assert.match(source, /for \(const record of \(ctx\.obstacles \?\? \[\]\)\.slice\(-1\)\) records\.add\(record\);/, `${kit}: a placed piece is held`);
}

console.log(`recordClearance.selftest: 20,000 footprints equal the walk over ${live.length} records (${blocked} blocked, ${clear} clear), edges, adds, felled and degenerate`);
