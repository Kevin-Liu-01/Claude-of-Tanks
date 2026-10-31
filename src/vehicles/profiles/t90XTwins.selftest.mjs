import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';

// 2026-10-30 (lane t90-family-266; the owner: "for all of these we can just take inspirration annd update from the
// later t90s we added that have far more accurate models", then "our new versiosn now just look way too identical to
// sources. tone down that copying a lil"): each earlier T-90 mark builds from its source-X twin and lays its own
// fittings on it (t90Mark*.ts). This receipt holds both halves, part for part, from the builder's part census: nearly
// every hull, turret and gun part of the twin is the mark's own part in the same place, and the mark carries parts the
// twin does not. The Burlak prototype rides the T-90A X hull under its own turret and the BMPT T-90 rides the T-90M X
// hull under its station: their hulls are compared alone, and they need no kit of their own.
const TWINS = Object.freeze([
  ['t90_1992', 't90', ['hull', 'turret', 'gun'], true],
  ['t90a_2004', 't90a', ['hull', 'turret', 'gun'], true],
  ['t90a_2006', 't90a_vladimir', ['hull', 'turret', 'gun'], true],
  ['t90ms_2011', 't90ms_tagil', ['hull', 'turret', 'gun'], true],
  ['t90sm_2013', 't90sm', ['hull', 'turret', 'gun'], true],
  ['t90am', 't90sm', ['hull', 'turret', 'gun'], true],
  ['t90m_proryv', 't90m', ['hull', 'turret', 'gun'], true],
  ['t90a_burlak_proto', 't90a', ['hull'], false],
  ['bmpt_t90', 't90m', ['hull'], false],
]);
// The share of the twin's parts the mark keeps, and the fewest parts of its own a mark with a kit carries.
const SHARED_MIN = 0.9, OWN_MIN = 12;
const options = { proceduralOnly: true, quality: 'high', camoSeed: 4242, geometryReceipt: true };

// Each part as its bucket, vertex count and centroid in the bucket's frame, rounded to 0.1 mm.
function census(id, rigs) {
  const counts = new Map();
  const tank = createTank(id, null, { ...options, partCensus: (bucket, part) => {
    if (!rigs.some((rig) => bucket.startsWith(rig))) return;
    const pos = part.getAttribute('position');
    if (!pos || pos.count === 0) return;
    let sx = 0, sy = 0, sz = 0;
    for (let i = 0; i < pos.count; i++) { sx += pos.getX(i); sy += pos.getY(i); sz += pos.getZ(i); }
    const key = `${bucket}:${pos.count}:${(sx / pos.count).toFixed(4)},${(sy / pos.count).toFixed(4)},${(sz / pos.count).toFixed(4)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  } });
  tank.dispose();
  return counts;
}

const total = (counts) => [...counts.values()].reduce((a, b) => a + b, 0);
const rows = [];
for (const [id, twin, rigs, kit] of TWINS) {
  const mark = census(id, rigs), source = census(twin, rigs);
  let shared = 0;
  for (const [key, n] of source) shared += Math.min(n, mark.get(key) ?? 0);
  const share = shared / total(source), own = total(mark) - shared;
  assert.ok(total(source) > 0, `${twin}: has ${rigs.join('/')} parts`);
  assert.ok(share >= SHARED_MIN, `${id}: keeps ${(share * 100).toFixed(1)} % of its source-X twin ${twin}'s parts (>= ${SHARED_MIN * 100} %)`);
  if (kit) assert.ok(own >= OWN_MIN, `${id}: carries ${own} parts of its own on ${twin} (>= ${OWN_MIN})`);
  rows.push(`${id} ${(share * 100).toFixed(1)}%/+${own}`);
}

console.log(`t90XTwins.selftest: the earlier T-90 marks build from their source-X twins and carry their own fittings (${rows.join(', ')})`);
