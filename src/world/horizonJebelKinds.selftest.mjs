// The far jebels' kinds (horizonPanorama.ts HORIZON_JEBEL_KINDS, the borders lane 2026-10-08; gauntlet wave 270 on
// Redrock: "the pale buttes along the horizon are near-identical clones in a row"; "the horizon should be a chain of
// massive jebels with domed tops and siq gaps"): the bake's GLSL carries the kinds' table, and the per-cell law (its JS
// twin, horizonJebelMassif) lays a country of varied massifs — every kind in its share, sizes and heights spread, no long
// axis past the next cell, and next to no neighbouring pair alike — where the law before laid one kind of massif.
import assert from 'node:assert/strict';
import {
  HORIZON_JEBEL_CELL_M, HORIZON_JEBEL_KINDS, HORIZON_JEBEL_SHARE_SCALE, HORIZON_PANORAMA_SHADERS, horizonJebelHash,
  horizonJebelMassif, resolveHorizonPanoramaCharacter,
} from './horizonPanorama.ts';

// the table: five kinds whose shares sum to one; the GLSL generated from it, in both passes that draw the massifs
const total = HORIZON_JEBEL_KINDS.reduce((sum, k) => sum + k.share, 0);
assert.ok(Math.abs(total - 1) < 1e-9, `the kinds' shares sum to one (${total})`);
assert.deepEqual(HORIZON_JEBEL_KINDS.map((k) => k.name), ['beehive', 'jebel', 'mesa', 'chain', 'knoll']);
let acc = 0;
for (const [i, k] of HORIZON_JEBEL_KINDS.slice(0, -1).entries()) {
  acc += k.share;
  for (const pass of ['height', 'strip']) {
    assert.ok(HORIZON_PANORAMA_SHADERS[pass].includes(`if (roll < ${acc.toFixed(4)}) return ${i}.0;`), `${pass}: the ${k.name}s' cumulative share`);
  }
}
for (const pass of ['height', 'strip']) {
  const glsl = HORIZON_PANORAMA_SHADERS[pass];
  assert.ok(glsl.includes(`vec2 cell = floor(p / ${HORIZON_JEBEL_CELL_M.toFixed(1)});`), `${pass}: the ${HORIZON_JEBEL_CELL_M} m cells`);
  assert.ok(glsl.includes(`uJebel.x * ${HORIZON_JEBEL_SHARE_SCALE.toFixed(4)}`), `${pass}: the share's scale`);
  assert.ok(glsl.includes('if (length(centre) - rad * el < uJebel3.w) continue;'), `${pass}: no massif inside the near limit`);
  assert.ok(glsl.includes('hj += k2.x * hgt * pow(1.0 - d * d, 0.6);'), `${pass}: the beehives' and knolls' rounded crowns`);
  assert.ok(glsl.includes('hj *= mix(0.04, 1.0, smoothstep(w * 0.4, w, abs(lq.x - g)));'), `${pass}: the chains' siqs down to the plain`);
}
// the twin's hash is the GLSL's (NOISE_GLSL hash12) on its own reference values
const fr = (v) => v - Math.floor(v);
const ref = (x, y) => { const a = [fr(x * 0.1031), fr(y * 0.1031), fr(x * 0.1031)]; const d = a[0] * (a[1] + 33.33) + a[1] * (a[2] + 33.33) + a[2] * (a[0] + 33.33); return fr((a[0] + d + a[1] + d) * (a[2] + d)); };
for (const [x, y] of [[0, 0], [3.7, -2.2], [31.7, 3.1], [-12, 44.5]]) assert.ok(Math.abs(horizonJebelHash(x, y) - ref(x, y)) < 1e-12, 'the twin hashes as the bake does');

// a country of massifs under Redrock's means (the jebel class, the near limit off so every cell counts)
const ch = resolveHorizonPanoramaCharacter('mesa', { regional: 'jebel' });
const means = { share: ch.jebelShare, heightM: ch.jebelM, radiusM: ch.jebelRadiusM, nearM: 0 };
const massifs = [], grid = new Map();
for (let cy = -40; cy < 40; cy++) for (let cx = -40; cx < 40; cx++) {
  const m = horizonJebelMassif(cx, cy, means);
  if (!m) continue;
  massifs.push(m); grid.set(`${cx},${cy}`, m);
}
assert.ok(massifs.length > 1200, `the cells hold massifs (${massifs.length} of 6400)`);
const counts = Object.fromEntries(HORIZON_JEBEL_KINDS.map((k) => [k.name, 0]));
for (const m of massifs) counts[m.kind]++;
for (const k of HORIZON_JEBEL_KINDS) {
  const share = counts[k.name] / massifs.length;
  assert.ok(Math.abs(share - k.share) < 0.04, `the ${k.name}s stand in their share (${(share * 100).toFixed(1)} % against ${(k.share * 100).toFixed(0)} %)`);
}
const cv = (xs) => { const mean = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length) / mean; };
const area = massifs.map((m) => m.rad * m.rad * m.el), heights = massifs.map((m) => m.hgt);
assert.ok(cv(area) > 0.5, `the footprints spread (cv ${cv(area).toFixed(2)})`);
assert.ok(cv(heights) > 0.25, `the heights spread (cv ${cv(heights).toFixed(2)})`);
for (const m of massifs) assert.ok(m.rad * m.el <= 0.98 * HORIZON_JEBEL_CELL_M + 1e-6, `no long axis past the next cell (${(m.rad * m.el).toFixed(0)} m)`);
// neighbours: a pair of massifs in adjacent cells "alike" when of one kind with radius, elongation and height within 8 %
let pairs = 0, alike = 0;
for (const [key, m] of grid) {
  const [cx, cy] = key.split(',').map(Number);
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    const o = grid.get(`${cx + dx},${cy + dy}`);
    if (!o) continue;
    // (two knolls alike are two small domes on the plain; the clones the critics saw were the big massifs)
    if (m.kind === 'knoll' || o.kind === 'knoll') continue;
    pairs++;
    const near = (a, b) => Math.abs(a - b) / Math.max(a, b) < 0.08;
    if (o.kind === m.kind && near(o.rad, m.rad) && near(o.el, m.el) && near(o.hgt, m.hgt)) alike++;
  }
}
assert.ok(pairs > 1000 && alike / pairs < 0.025, `next to no neighbouring pair of big massifs alike (${alike} of ${pairs})`);
// the law before: one kind, radius 0.7-1.3, elongation 1-1.5, height 0.7-1: its pairs alike, for the record
let oldAlike = 0, oldPairs = 0;
const oldAt = (cx, cy) => {
  const h = horizonJebelHash;
  if (h(cx + 31.7, cy + 3.1) < 1 - means.share) return null;
  return { rad: 0.7 + 0.6 * h(cx + 5.3, cy + 8.8), el: 1 + 0.5 * h(cx + 0.7, cy + 2.2), hgt: 0.7 + 0.3 * h(cx + 8.2, cy + 6.6) };
};
for (let cy = -40; cy < 40; cy++) for (let cx = -40; cx < 40; cx++) {
  const m = oldAt(cx, cy); if (!m) continue;
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    const o = oldAt(cx + dx, cy + dy); if (!o) continue;
    oldPairs++;
    const near = (a, b) => Math.abs(a - b) / Math.max(a, b) < 0.08;
    if (near(o.rad, m.rad) && near(o.el, m.el) && near(o.hgt, m.hgt)) oldAlike++;
  }
}
assert.ok(oldAlike / oldPairs > (alike / pairs) * 2, `the old law laid alike neighbours far more often (${oldAlike} of ${oldPairs}; one kind of massif besides)`);
// the means hold: the massifs' mean height and the big kinds' mean radius about the map's own
const big = massifs.filter((m) => m.kind !== 'knoll');
const meanRad = big.reduce((a, m) => a + m.rad, 0) / big.length / means.radiusM, meanHgt = big.reduce((a, m) => a + m.hgt, 0) / big.length / means.heightM;
assert.ok(meanRad > 0.7 && meanRad < 1.15 && meanHgt > 0.7 && meanHgt < 1.05, `the big massifs keep the map's means (radius ${meanRad.toFixed(2)}, height ${meanHgt.toFixed(2)})`);

console.log(`horizonJebelKinds.selftest: ok (${massifs.length} massifs: ${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', ')}; footprint cv ${cv(area).toFixed(2)}, height cv ${cv(heights).toFixed(2)}; alike neighbours ${alike}/${pairs}, the old law ${oldAlike}/${oldPairs})`);
