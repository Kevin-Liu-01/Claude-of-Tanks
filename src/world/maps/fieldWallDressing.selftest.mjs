// fieldWallDressing.selftest — how the field walls meet the ground and the weather (the scenery lane, 2026-10-03; wave
// 20: "shape, construction type and how things meet the ground"):
//   1. the snow load lies on the dry-stone module's top: over its highest stones, 6-24 cm at its crest and lumpy
//      along it (wave 34: "uniform frosting"), its lips a little under the top, its faces looking up (the snow cap
//      whitens them); a module's load meets itself at both ends (a run repeats the module);
//   2. the foot stones sit at the wall's foot on both faces, each sunk in the ground and standing out of it, never
//      inside the wall, never far from it, their print windows in the field print's face band;
//   3. the drifts bank on the asked face only, from a scalloped toe (wave 34: "a hard, straight edge") to the face,
//      looking up: the lee drift the big one (40-80 cm, out three to four and a half metres), the windward a small
//      ramp; both smaller where the wind runs along the wall;
//   4. the mud apron skirts both faces, low at the face (under 25 cm) and down to the ground at its toe, its lumps by it;
//   5. the tumbled end (wave 34: "nothing bedded"): stones out past a run's end and along its feet, sunk and standing
//      out; a mud wall's lumps on the mud print's plain band;
//   6. the run's owner dresses a stone island with its stones (and on a snow map its two drifts), a mud island with its
//      apron; the same place gives the same dressing.
import assert from 'node:assert/strict';
import { DESTRUCTIBLE_TYPES } from './inhabitKit.ts';
import { buildMudApron, buildSnowLoad, buildWallDrift, buildWallFootStones, buildWallTumble, createWallDressing } from './fieldWallDressing.ts';
import { FIELD_STONE_FACE_V } from '../fieldStoneSurface.ts';

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
  assert.ok(b.max.y > top + 0.06 && b.max.y < top + 0.24, `the load stands 6-24 cm over the highest stone (${(b.max.y - top).toFixed(3)} m)`);
  {
    // lumpy along the wall: the crest line (the middle of the five points across) rises and falls 5 cm or more
    const p = snow.attributes.position, crestAt = new Map();
    for (let i = 0; i < p.count; i++) { const z = p.getZ(i).toFixed(3); crestAt.set(z, Math.max(crestAt.get(z) ?? -Infinity, p.getY(i))); }
    const crests = [...crestAt.values()];
    assert.ok(Math.max(...crests) - Math.min(...crests) > 0.05, `the load is lumpy along the wall (${(Math.max(...crests) - Math.min(...crests)).toFixed(3)} m)`);
    const uv = snow.attributes.uv;
    for (let i = 0; i < uv.count; i++) assert.ok(uv.getY(i) >= FIELD_STONE_FACE_V[0] - 1e-6 && uv.getY(i) <= FIELD_STONE_FACE_V[1] + 1e-6, 'the load reads the field print\'s face band');
  }
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
  const fuv = stones.attributes.uv;
  for (let i = 0; i < fuv.count; i++) assert.ok(fuv.getY(i) >= FIELD_STONE_FACE_V[0] - 1e-6 && fuv.getY(i) <= FIELD_STONE_FACE_V[1] + 1e-6, 'a foot stone reads the field print\'s face band, never the hearting');
  stones.dispose(); again.dispose();
}

// 3. the drifts
{
  const measure = (g) => {
    const p = g.attributes.position, n = g.attributes.normal;
    let maxY = 0, minX = Infinity, maxX = -Infinity, up = 0;
    const toe = new Map();
    for (let i = 0; i < p.count; i++) {
      maxY = Math.max(maxY, p.getY(i)); minX = Math.min(minX, p.getX(i)); maxX = Math.max(maxX, p.getX(i)); up += n.getY(i);
      const z = p.getZ(i).toFixed(2); toe.set(z, Math.max(toe.get(z) ?? 0, Math.abs(p.getX(i))));
    }
    const reach = [...toe.values()], mean = reach.reduce((a, b) => a + b, 0) / reach.length;
    const wander = Math.sqrt(reach.reduce((a, b) => a + (b - mean) ** 2, 0) / reach.length) / mean;
    return { maxY, minX, maxX, up: up / n.count, wander };
  };
  const windward = measure(buildWallDrift(flat, 0, 0, 0, 9, 0.27, 1, 0xd71f));
  const lee = measure(buildWallDrift(flat, 0, 0, 0, 9, 0.27, 1, 0x1ee5, { lee: true }));
  // the run's left normal for +z is +x: side 1 banks on +x
  for (const [name, d] of [['windward', windward], ['lee', lee]]) {
    assert.ok(d.minX > 0.15, `the ${name} drift banks on its face only (${d.minX.toFixed(2)})`);
    assert.ok(d.up > 0.85, `the ${name} drift looks up`);
    assert.ok(d.wander > 0.06, `the ${name} drift's toe wanders, never a straight edge (${(d.wander * 100).toFixed(0)} %)`);
  }
  assert.ok(windward.maxY > 0.08 && windward.maxY < 0.25 && windward.maxX < 1.6, `the windward drift is a small ramp (${windward.maxY.toFixed(2)} m, out to ${windward.maxX.toFixed(2)} m)`);
  // (wave 48: the lee drift under half a field wall's metre, so it never rides over the top)
  assert.ok(lee.maxY > 0.25 && lee.maxY < 0.48 && lee.maxX > 2 && lee.maxX < 4, `the lee drift is the big one, under half the wall (${lee.maxY.toFixed(2)} m, out to ${lee.maxX.toFixed(2)} m)`);
  // (and clear of its island's ends: a breach, a head)
  for (const g of [buildWallDrift(flat, 0, 0, 0, 9, 0.27, 1, 0xd71f), buildWallDrift(flat, 0, 0, 0, 9, 0.27, 1, 0x1ee5, { lee: true })]) {
    const p = g.attributes.position;
    let z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < p.count; i++) { z0 = Math.min(z0, p.getZ(i)); z1 = Math.max(z1, p.getZ(i)); }
    assert.ok(z0 >= 0.3 && z1 <= 8.7, `a drift stops inside its island's ends (${z0.toFixed(2)}..${z1.toFixed(2)} of 0..9)`);
  }
  const along = measure(buildWallDrift(flat, 0, 0, 0, 9, 0.27, 1, 0x1ee5, { lee: true, across: 0 }));
  assert.ok(along.maxY < lee.maxY * 0.7 && along.maxX < lee.maxX * 0.8, 'a wind along the wall banks less snow in its lee');
}

// 5. the tumbled end
{
  const fallen = buildWallTumble(slope, 0, 0, 0, 1, 0.23, 0x7b1e);
  const again = buildWallTumble(slope, 0, 0, 0, 1, 0.23, 0x7b1e);
  assert.deepEqual(Array.from(again.attributes.position.array), Array.from(fallen.attributes.position.array), 'the same end tumbles the same');
  const p = fallen.attributes.position, per = 10 * 3;
  let stones = 0, out = 0;
  for (let s = 0; s < p.count; s += per) {
    let below = false, above = false, z = 0;
    for (let i = s; i < s + per; i++) {
      const g = slope.getHeightAt(p.getX(i), p.getZ(i));
      if (p.getY(i) < g) below = true; else above = true;
      z += p.getZ(i) / per;
    }
    assert.ok(below && above, `tumbled stone ${stones}: sunk and standing out`);
    if (z > -0.25) out++;
    stones++;
  }
  assert.ok(stones >= 9 && out / stones > 0.75, `the stones lie out past the end (${out} of ${stones})`);
  const mud = buildWallTumble(flat, 0, 0, 0, 1, 0.26, 0x7a3b, { uvPerM: 1 / 3, mudV: 0.94 });
  const uv = mud.attributes.uv;
  let inBand = 0;
  for (let i = 0; i < uv.count; i++) if (uv.getY(i) > 0.84 && uv.getY(i) < 1.04) inBand++;
  assert.ok(inBand / uv.count > 0.9, 'a mud wall\'s fallen lumps read the mud print\'s plain band');
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

// 6. the owner
{
  const snowy = createWallDressing({ ground: slope, snow: true, mobile: false, adobeBucket: 'fieldMud', mudUv: 1 / 3 });
  const stone = snowy.island(false, 0, 0, 0, 9, 0.23);
  assert.ok(stone.wall.length === 1 && snowy.drifts.length === 2, 'a snow map\'s stone island: its foot stones, and its two drifts kept for their own mesh');
  const mild = createWallDressing({ ground: slope, snow: false, mobile: false, adobeBucket: 'fieldMud', mudUv: 1 / 3 });
  const plain = mild.island(false, 0, 0, 0, 9, 0.23);
  assert.ok(plain.wall.length === 1 && mild.drifts.length === 0, 'a mild map\'s stone island: its foot stones only');
  const mud = mild.island(true, 0, 0, 0, 9, 0.26);
  assert.ok(mud.wall.length === 1 && mild.drifts.length === 0, 'a mud island: its apron');
  assert.deepEqual(Array.from(mild.island(false, 0, 0, 0, 9, 0.23).wall[0].attributes.position.array),
    Array.from(plain.wall[0].attributes.position.array), 'the same island, the same dressing');
}

console.log('fieldWallDressing self-test passed: the snow load on the module\'s top (lumpy, seamless, looking up), the foot stones sunk on both faces, the lee and windward drifts with wandering toes, the mud apron on its plain band, the tumbled ends, the run\'s owner');
