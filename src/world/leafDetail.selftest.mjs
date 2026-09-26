// Round 77b (2026-09-26): the leaf-scale crown detail (leafDetail.ts) — the per-class tiling normal + alpha-break
// tile the near cards carry as their normal map. Pins the tiles' pixels (deterministic, a digest per class), their
// contract (unit normals, an unbiased mean normal, a wrapped tile with no seam, a mask that covers leaves and opens
// the gaps), the mean-neutral law the shader applies, the class resolution against the authored map palettes, and
// the lazy per-class library. Pure CPU: no canvas, no GPU, no art claim.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DataTexture, NoColorSpace, RepeatWrapping } from 'three';
import {
  createLeafDetailLibrary, LEAF_DETAIL_CLASSES, LEAF_DETAIL_LAW, LEAF_DETAIL_MASK_MEAN, LEAF_DETAIL_REPEAT, LEAF_DETAIL_SIZE,
  leafDetailClassOfSpecies, makeLeafDetailPixels, makeLeafDetailTexture, resolveLeafDetailClass,
} from './leafDetail.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';
import { TREE_ARCHETYPES } from './treeSpecies.ts';

const sha = bytes => createHash('sha256').update(bytes).digest('hex').slice(0, 16);
// The pinned pixel digests (world seed 2001); a changed painter moves them — re-pin deliberately.
const PINS = {
  broadleaf: '231e1c9bc41db8a6', conifer: '05fbae606c7613a9', autumn: 'caf760ec3c2193de', palm: 'fe4e1db9badd35de',
};

const s = LEAF_DETAIL_SIZE, rows = [];
for (const cls of LEAF_DETAIL_CLASSES) {
  const pixels = makeLeafDetailPixels(cls, 2001);
  assert.equal(pixels.length, s * s * 4);
  assert.deepEqual(makeLeafDetailPixels(cls, 2001), pixels, `${cls}: deterministic`);
  assert.notDeepEqual(makeLeafDetailPixels(cls, 2002), pixels, `${cls}: the seed matters`);
  let sumX = 0, sumY = 0, sumZ = 0, maskSum = 0, minZ = 1, seam = 0, interior = 0, steep = 0;
  const histogram = new Uint32Array(256);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = (y * s + x) * 4;
    const nx = pixels[i] / 127.5 - 1, ny = pixels[i + 1] / 127.5 - 1, nz = pixels[i + 2] / 127.5 - 1;
    const len = Math.hypot(nx, ny, nz);
    assert.ok(Math.abs(len - 1) < 0.02, `${cls}: unit normal at ${x},${y} (${len})`);
    assert.ok(nz > 0, `${cls}: a normal that faces out`);
    sumX += nx; sumY += ny; sumZ += nz; minZ = Math.min(minZ, nz); if (nz < 0.3) steep++;
    const mask = pixels[i + 3] / 255;
    maskSum += mask; histogram[pixels[i + 3]]++;
    // a wrapped tile: the change across the seam (column 255 → 0, row 255 → 0) is no larger than between neighbours
    if (x === s - 1) seam += Math.abs(pixels[i] - pixels[(y * s) * 4]) + Math.abs(pixels[i + 3] - pixels[(y * s) * 4 + 3]);
    else interior += Math.abs(pixels[i] - pixels[i + 4]) + Math.abs(pixels[i + 3] - pixels[i + 7]);
  }
  const n = s * s;
  const meanMask = maskSum / n;
  assert.ok(Math.abs(sumX / n) < 0.03 && Math.abs(sumY / n) < 0.03, `${cls}: an unbiased tile (${sumX / n}, ${sumY / n})`);
  assert.ok(sumZ / n > 0.75, `${cls}: mostly facing out (${sumZ / n})`);
  assert.ok(minZ > 0.1, `${cls}: no horizontal normals (${minZ})`);
  assert.ok(steep / n < 0.06, `${cls}: steep leaf edges are a sliver of the tile, not speckle (${steep / n})`);
  assert.ok(Math.abs(meanMask - LEAF_DETAIL_MASK_MEAN) < 0.01, `${cls}: the mask's mean is one half, so the far mips are neutral (${meanMask})`);
  // the mask's spread: its 5th and 95th percentiles at least 0.4 apart — real gaps and real leaf bodies on every tile
  const percentile = (share) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += histogram[v]; if (acc >= share * n) return v / 255; } return 1; };
  const p5 = percentile(0.05), p95 = percentile(0.95);
  assert.ok(p95 - p5 > 0.4, `${cls}: real gaps and real leaf bodies (p5 ${p5}, p95 ${p95})`);
  assert.ok(seam / s <= (interior / (s * (s - 1))) * 1.6 + 2, `${cls}: no seam (${seam / s} vs ${interior / (s * (s - 1))})`);
  const digest = sha(pixels);
  rows.push({ cls, digest, meanMask: +meanMask.toFixed(3), p5: +p5.toFixed(3), p95: +p95.toFixed(3), meanZ: +(sumZ / n).toFixed(3), steep: +(steep / n).toFixed(4) });
  assert.equal(digest, PINS[cls], `${cls}: the pinned pixels (${digest})`);
  const texture = makeLeafDetailTexture(cls, 2001);
  assert.ok(texture instanceof DataTexture && texture.image.width === s && texture.image.height === s);
  assert.equal(texture.wrapS, RepeatWrapping); assert.equal(texture.wrapT, RepeatWrapping);
  assert.equal(texture.repeat.x, LEAF_DETAIL_REPEAT); assert.equal(texture.repeat.y, LEAF_DETAIL_REPEAT);
  assert.equal(texture.colorSpace, NoColorSpace, 'linear data, never decoded');
  assert.equal(texture.generateMipmaps, true); assert.equal(texture.flipY, false, 'rows follow v');
  assert.equal(texture.name, `leafDetail:${cls}`);
  texture.dispose();
}
// the law: neutral at the mask's mean, so the far mips (the mask averaged) keep the pre-round coverage and tone
assert.equal(LEAF_DETAIL_MASK_MEAN, 0.5);
assert.ok(Math.abs(LEAF_DETAIL_LAW.alphaFloor + LEAF_DETAIL_LAW.alphaSpan * LEAF_DETAIL_MASK_MEAN - 1) < 1e-9, 'the alpha break is mean-neutral');
assert.ok(Math.abs(LEAF_DETAIL_LAW.aoFloor + LEAF_DETAIL_LAW.aoSpan * LEAF_DETAIL_MASK_MEAN - 1) < 1e-9, 'the leaf-gap shade is mean-neutral');
assert.ok(LEAF_DETAIL_LAW.alphaFloor > 0.38 / 0.6, 'a solid card texel (alpha 1) survives the 0.38 alpha test in a gap');

// class resolution: families, then the palette's tone against the authored maps
assert.equal(resolveLeafDetailClass('conifer', null), 'conifer');
assert.equal(resolveLeafDetailClass('palm', null), 'palm');
assert.equal(resolveLeafDetailClass('broadleaf', null), 'broadleaf');
assert.equal(resolveLeafDetailClass('birch', null), 'broadleaf');
assert.equal(resolveLeafDetailClass('broadleaf', (h, sat, l) => [h, sat, l]), 'broadleaf', 'an identity tone keeps the green');
assert.equal(resolveLeafDetailClass('broadleaf', () => [0.08, 0.5, 0.4]), 'autumn', 'an orange tone reads as autumn');
assert.equal(leafDetailClassOfSpecies('spruce', {}), 'conifer');
assert.equal(leafDetailClassOfSpecies('no-such-species', {}), 'broadleaf');
// the palette a species reads in production (vegetation.ts palOf): its own, else its family's default entry
const familyDefault = { conifer: 'pine', birch: 'birch', palm: 'palm', broadleaf: 'oak' };
const paletteOf = (veg, sp) => veg.palettes?.[sp] ?? veg.palettes?.[familyDefault[TREE_ARCHETYPES[sp].family]] ?? {};
const byMap = {};
for (const id of MAP_IDS) {
  const veg = getMapConfig(id).vegetation;
  byMap[id] = Object.fromEntries(veg.species.map(sp => [sp, leafDetailClassOfSpecies(sp, paletteOf(veg, sp))]));
}
assert.equal(byMap.autumn.oak, 'autumn'); assert.equal(byMap.autumn.birch, 'autumn'); assert.equal(byMap.autumn.aspen, 'autumn');
assert.equal(byMap.verdant.oak, 'broadleaf'); assert.equal(byMap.verdant.pine, 'conifer'); assert.equal(byMap.desert.palm, 'palm');
assert.equal(byMap.fjord.spruce, 'conifer'); assert.equal(byMap.fjord.birch, 'broadleaf');
assert.equal(byMap.desert.acacia, 'autumn', 'the dusty khaki desert broadleaf takes the sparse small-leaf tile');
assert.equal(byMap.railyard.oak, 'broadleaf', 'a tone that keeps the green stays broadleaf');
const usedClasses = new Set(Object.values(byMap).flatMap(row => Object.values(row)));
assert.equal(usedClasses.size, 4, 'the catalog exercises every class');

// the library: lazy per class, live texture list, disabled on the mobile tier
const library = createLeafDetailLibrary(2001, true);
assert.equal(library.textures.length, 0);
const oak = library.texture(library.classOf('oak', {}));
assert.strictEqual(library.texture('broadleaf'), oak, 'one tile per class');
assert.equal(library.textures.length, 1);
library.texture('conifer');
assert.deepEqual(library.textures.map(t => t.name), ['leafDetail:broadleaf', 'leafDetail:conifer']);
const mobile = createLeafDetailLibrary(2001, false);
assert.equal(mobile.texture('broadleaf'), null); assert.equal(mobile.textures.length, 0); assert.equal(mobile.enabled, false);
for (const texture of library.textures) texture.dispose();

console.log(JSON.stringify({ rows, classesByMap: Object.fromEntries(Object.entries(byMap).map(([id, row]) => [id, [...new Set(Object.values(row))].sort()])) }));
console.log(`leafDetail.selftest: ${LEAF_DETAIL_CLASSES.length} classes pinned (unit unbiased normals, wrapped tiles, a covering mask), the mean-neutral law, the class resolution over ${MAP_IDS.length} maps, the lazy library PASS`);
