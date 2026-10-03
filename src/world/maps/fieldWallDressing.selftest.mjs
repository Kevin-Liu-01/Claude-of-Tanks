// fieldWallDressing.selftest — how the field walls meet the ground and the weather (the scenery lane, 2026-10-03; wave
// 20: "shape, construction type and how things meet the ground"):
//   1. the snow load lies on the dry-stone module's top: over its highest stones, 5-15 cm at its crest, its lips a
//      little under the top, its faces looking up (the snow cap whitens them); a module's load meets itself at both
//      ends (a run repeats the module);
//   2. the foot stones sit at the wall's foot on both faces, each sunk in the ground and standing out of it, never
//      inside the wall, never far from it;
//   3. the drift banks on the asked face only, from its toe on the ground up to 20-50 cm at the face, looking up;
//   4. the mud apron skirts both faces, low at the face (under 25 cm) and down to the ground at its toe, its lumps by it;
//   5. the run's owner dresses a stone island with its stones (and on a snow map its drift), a mud island with its
//      apron; the same place gives the same dressing.
import assert from 'node:assert/strict';
import { DESTRUCTIBLE_TYPES } from './inhabitKit.ts';
import { buildMudApron, buildSnowLoad, buildWallDrift, buildWallFootStones, createWallDressing } from './fieldWallDressing.ts';

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const slope = { getHeightAt: (x, z) => 2 + x * 0.08 + Math.sin(z * 0.4) * 0.3 };
const flat = { getHeightAt: () => 0 };
const attrs = (g) => Object.keys(g.attributes).sort().join(',');

// 1. the snow load
{
  const wall = DESTRUCTIBLE_TYPES.wallstone.build(mulberry32(11));
  wall.computeBoundingBox();
  const top = wall.boundingBox.max.y;
  const snow = buildSnowLoad(wall, 0x5a0c1, { seamless: true });
  assert.equal(attrs(snow), 'normal,position,uv', 'the load merges with the module (position, normal, uv)');
  snow.computeBoundingBox();
  const b = snow.boundingBox;
  assert.ok(b.max.y > top + 0.04 && b.max.y < top + 0.16, `the load stands 4-16 cm over the highest stone (${(b.max.y - top).toFixed(3)} m)`);
  assert.ok(b.min.y > top - 0.45, 'the load lies on the top, not down the faces');
  const n = snow.attributes.normal;
  let up = 0;
  for (let i = 0; i < n.count; i++) up += n.getY(i);
  assert.ok(up / n.count > 0.8, `the load looks up (mean normal y ${(up / n.count).toFixed(2)})`);
  // its two ends at one height (the next module's load meets it)
  const p = snow.attributes.position;
  let z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < p.count; i++) { z0 = Math.min(z0, p.getZ(i)); z1 = Math.max(z1, p.getZ(i)); }
  const crest = (z) => { let y = -Infinity; for (let i = 0; i < p.count; i++) if (Math.abs(p.getZ(i) - z) < 1e-4) y = Math.max(y, p.getY(i)); return y; };
  assert.ok(Math.abs(crest(z0) - crest(z1)) < 0.004, `a module's load meets itself at both ends (${crest(z0).toFixed(3)} vs ${crest(z1).toFixed(3)})`);
  wall.dispose(); snow.dispose();
}

// 2. the foot stones
{
  const half = 0.28;
  const stones = buildWallFootStones(slope, 0, 0, 0, 12, half, 0xf007);
  assert.equal(attrs(stones), 'normal,position,uv');
  const again = buildWallFootStones(slope, 0, 0, 0, 12, half, 0xf007);
  assert.deepEqual(Array.from(again.attributes.position.array), Array.from(stones.attributes.position.array), 'the same place lays the same stones');
  // each stone is a run of 10 triangles (a box's five faces kept): sunk and standing out, off the face, near it
  const p = stones.attributes.position, per = 10 * 3;
  assert.equal(p.count % per, 0, 'whole stones');
  let count = 0, sides = new Set();
  for (let s = 0; s < p.count; s += per) {
    let below = false, above = false, minOff = Infinity, maxOff = 0;
    for (let i = s; i < s + per; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), g = slope.getHeightAt(x, z);
      if (y < g) below = true; else above = true;
      minOff = Math.min(minOff, Math.abs(x)); maxOff = Math.max(maxOff, Math.abs(x));
    }
    assert.ok(below && above, `foot stone ${count}: sunk in the ground and standing out of it`);
    assert.ok(minOff > half - 0.12 && maxOff < half + 1.2, `foot stone ${count}: off the wall's face, near it (${minOff.toFixed(2)}..${maxOff.toFixed(2)})`);
    sides.add(Math.sign(p.getX(s)));
    count++;
  }
  assert.ok(count >= 16 && sides.size === 2, `a stone every half metre or so on both faces (${count})`);
  stones.dispose(); again.dispose();
}

// 3. the drift
{
  const drift = buildWallDrift(flat, 0, 0, 0, 9, 0.27, 1, 0xd71f);
  const p = drift.attributes.position, n = drift.attributes.normal;
  let maxY = 0, minX = Infinity, maxX = -Infinity, up = 0;
  for (let i = 0; i < p.count; i++) {
    maxY = Math.max(maxY, p.getY(i)); minX = Math.min(minX, p.getX(i)); maxX = Math.max(maxX, p.getX(i)); up += n.getY(i);
  }
  // the run's left normal for +z is +x: side 1 banks on +x
  assert.ok(minX > 0.15 && maxX < 2.5, `the drift banks on its face only (${minX.toFixed(2)}..${maxX.toFixed(2)})`);
  assert.ok(maxY > 0.2 && maxY < 0.5, `the drift rises to 20-50 cm at the face (${maxY.toFixed(2)})`);
  assert.ok(up / n.count > 0.85, 'the drift looks up');
  drift.dispose();
}

// 4. the mud apron
{
  const apron = buildMudApron(flat, 0, 0, 0, 9, 0.26, 0xad0a, { uvPerM: 1 / 3, plainV: [0.89, 0.99] });
  const p = apron.attributes.position, uv = apron.attributes.uv;
  let maxY = 0, sides = new Set();
  for (let i = 0; i < p.count; i++) { maxY = Math.max(maxY, p.getY(i)); sides.add(Math.sign(p.getX(i))); }
  assert.ok(maxY < 0.3 && maxY > 0.08, `the apron stays low (${maxY.toFixed(2)} m)`);
  assert.ok(sides.has(1) && sides.has(-1), 'the apron skirts both faces');
  let inBand = 0;
  for (let i = 0; i < uv.count; i++) { const v = uv.getY(i); if (v > 0.84 && v < 1.04) inBand++; }
  assert.ok(inBand / uv.count > 0.9, 'the apron and its lumps read the print\'s plain render');
  apron.dispose();
}

// 5. the owner
{
  const snowy = createWallDressing({ ground: slope, snow: true, mobile: false, adobeBucket: 'fieldMud', mudUv: 1 / 3 });
  const stone = snowy.island(false, 0, 0, 0, 9, 0.23);
  assert.ok(stone.wall.length === 1 && stone.snow.length === 1, 'a snow map\'s stone island: its foot stones and its drift');
  const mild = createWallDressing({ ground: slope, snow: false, mobile: false, adobeBucket: 'fieldMud', mudUv: 1 / 3 });
  const plain = mild.island(false, 0, 0, 0, 9, 0.23);
  assert.ok(plain.wall.length === 1 && plain.snow.length === 0, 'a mild map\'s stone island: its foot stones only');
  const mud = mild.island(true, 0, 0, 0, 9, 0.26);
  assert.ok(mud.wall.length === 1 && mud.snow.length === 0, 'a mud island: its apron');
  assert.deepEqual(Array.from(mild.island(false, 0, 0, 0, 9, 0.23).wall[0].attributes.position.array),
    Array.from(plain.wall[0].attributes.position.array), 'the same island, the same dressing');
}

console.log('fieldWallDressing self-test passed: the snow load on the module\'s top (seamless, looking up), the foot stones sunk on both faces, the windward drift, the mud apron on its plain band, the run\'s owner');
