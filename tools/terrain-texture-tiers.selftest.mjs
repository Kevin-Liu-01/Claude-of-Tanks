// terrain-texture-tiers.selftest.mjs — the battle's tier WebPs (the terrain's, texture-diet-277; the village buildings',
// building-tex-diet-277) are the generator's, from the committed sources. No encoder runs here: each group's ledger digests
// pin the sources and every output, so a hand edit, a regenerated file with no ledger, or a source swapped under the
// outputs fails.
// 1. every source and output matches its group's ledger, and every tier holds Color, NormalGL and ORM for every set;
// 2. the sets the loader names (sourcedTextures.ts `tiered(...)`, `tieredBuilding(...)`) are exactly the generator's, and
//    every set the loader holds is one of them;
// 3. each tier's outputs are at its size, the 512 tier is smaller than the 1K, and the 1K tier saves at least 30 % against
//    the JPGs it replaces (the brief's floor), with its recorded error inside the bounds the encode settings were chosen at;
// 4. the kernels: the normal halving renormalises, the colour halving averages in linear light, ORM packing.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BUILDING_SOURCES, checkLedger, GROUPS, halve, outputFile, packOrm, sourceFiles, TERRAIN_SOURCES, TIERS } from './terrain-texture-tiers.mjs';

const ROOT = new URL('../', import.meta.url);
const ledgers = Object.fromEntries(Object.entries(GROUPS).map(([name, group]) =>
  [name, JSON.parse(readFileSync(new URL(group.ledger, ROOT), 'utf8'))]));

// 1.
assert.deepEqual(checkLedger(), [], 'the sources and tier outputs match the ledger');

// 2.
const loader = readFileSync(new URL('src/world/sourcedTextures.ts', ROOT), 'utf8');
const named = (fn) => [...loader.matchAll(new RegExp(`\\b${fn}\\('([^']+)'\\)`, 'g'))].map((m) => m[1]).sort();
assert.deepEqual(named('tiered'), TERRAIN_SOURCES.map((s) => s.base).sort(), 'the loader routes exactly the generated terrain sets');
assert.deepEqual(named('tieredBuilding'), BUILDING_SOURCES.map((s) => s.base).sort(), 'and exactly the generated building sets');
assert.match(loader, /const tiered = \(base: string\): TieredTextureSet => \(\{ tiered: base, dir: TT \}\);/);
assert.match(loader, /const tieredBuilding = \(base: string\): TieredTextureSet => \(\{ tiered: base, dir: TB \}\);/);
assert.match(loader, /const TT = '\/textures\/terrain';/);
assert.match(loader, /const TB = '\/textures\/buildings';/);
const setsBlock = /const SETS = \{([\s\S]*?)\} satisfies Record<string, TieredTextureSet>;/.exec(loader)?.[1];
assert.ok(setsBlock, 'the loader\'s SETS');
assert.equal([...setsBlock.matchAll(/^\s+\w+: (tiered|tieredBuilding)\('/gm)].length,
  TERRAIN_SOURCES.length + BUILDING_SOURCES.length, 'every set the loader holds is a generated tier set');
assert.match(loader, /`\$\{set\.dir\}\/\$\{terrainTextureTier\(\)\}\/\$\{set\.tiered\}`/, 'the loader reads the running tier');
for (const tier of Object.keys(TIERS)) {
  assert.equal(outputFile(tier, 'Grass004', 'ORM'), `public/textures/terrain/${tier}/Grass004_ORM.webp`, 'the files the loader names');
  assert.equal(outputFile(tier, 'Planks023A', 'ORM', GROUPS.buildings.dir), `public/textures/buildings/${tier}/Planks023A_ORM.webp`);
}
// Plaster 007's tiers are its first-party derivatives' (the maps the battle drew before the tiers), not the download's
const plaster = sourceFiles(BUILDING_SOURCES.find((s) => s.base === 'Plaster007'));
assert.equal(plaster.color, 'public/textures/buildings/Plaster007_1K-JPG_Color-even.jpg');
assert.equal(plaster.normal, 'public/textures/buildings/Plaster007_1K-JPG_NormalGL-smooth.jpg');
assert.equal(plaster.ao, 'public/textures/buildings/Plaster007_1K-JPG_AmbientOcclusion.jpg');

// 3.
for (const [base, entry] of Object.values(ledgers).flatMap((ledger) => Object.entries(ledger.sets))) {
  const sourceBytes = Object.values(entry.sources).reduce((sum, s) => sum + s.bytes, 0);
  const tierBytes = (tier) => Object.values(entry.outputs[tier]).reduce((sum, o) => sum + o.bytes, 0);
  for (const [tier, size] of Object.entries(TIERS)) {
    for (const o of Object.values(entry.outputs[tier])) {
      assert.equal(o.size, size, `${base} ${tier}: ${o.file} is ${size} px wide`);
      // a set wider than tall (Bricks 097, 1024 x 512) keeps its aspect; a square set records no height
      if (o.height !== undefined) assert.ok(o.height < size && size % o.height === 0, `${base} ${tier}: ${o.file} keeps its aspect`);
    }
  }
  assert.ok(tierBytes('512') < tierBytes('1k'), `${base}: the phone tier is the smaller`);
  assert.ok(tierBytes('1k') <= 0.7 * sourceBytes, `${base}: the 1K tier saves ≥ 30 % (${tierBytes('1k')} of ${sourceBytes} B)`);
  for (const tier of Object.keys(TIERS)) {
    const { Color, NormalGL, ORM } = entry.outputs[tier];
    assert.ok(NormalGL.error.meanAngleDeg < 2.5, `${base} ${tier}: normal within 2.5° (${NormalGL.error.meanAngleDeg})`);
    assert.ok(ORM.error.psnrAo >= 40 && ORM.error.psnrRough >= 40, `${base} ${tier}: ORM ≥ 40 dB`);
    assert.ok(Color.error.psnrRgb >= 31, `${base} ${tier}: colour ≥ 31 dB (${Color.error.psnrRgb})`);
  }
}
for (const ledger of Object.values(ledgers)) {
  assert.match(ledger.encoder, /^cwebp \d+\.\d+\.\d+ \/ dwebp \d+\.\d+\.\d+$/, 'the ledger names the libwebp that encoded it');
}
assert.equal(ledgers.buildings.sets.Bricks097.outputs['512'].Color.height, 256, 'Bricks 097\'s 512 tier is 512 x 256');

// 4.
const flat = (px) => Uint8Array.from(px.flat());
const normals = halve(flat([[255, 128, 128, 255], [0, 128, 128, 255], [128, 128, 255, 255], [128, 128, 255, 255]]), 2, 'normal');
assert.deepEqual([...normals], [128, 128, 255, 255], '+x and −x cancel; the mean of unit normals is renormalised to +z');
const grey = halve(flat([[0, 0, 0, 255], [255, 255, 255, 255], [0, 0, 0, 255], [255, 255, 255, 255]]), 2, 'srgb');
assert.deepEqual([...grey], [188, 188, 188, 255], 'black and white average to linear 0.5 (sRGB 188), not 128');
const data = halve(flat([[0, 10, 0, 255], [255, 20, 0, 255], [0, 30, 0, 255], [255, 40, 0, 255]]), 2, 'data');
assert.deepEqual([...data], [128, 25, 0, 255], 'data channels average as numbers');
assert.deepEqual([...packOrm(flat([[90, 1, 2, 255]]), flat([[200, 3, 4, 255]]))], [90, 200, 0, 255], 'R = AO, G = roughness, B = 0');
const wide = halve(flat([[0, 0, 0, 255], [40, 40, 40, 255], [80, 80, 80, 255], [120, 120, 120, 255],
  [0, 0, 0, 255], [40, 40, 40, 255], [80, 80, 80, 255], [120, 120, 120, 255]]), 4, 'data', 2);
assert.deepEqual([...wide], [20, 20, 20, 255, 100, 100, 100, 255], 'a 4 x 2 image halves to 2 x 1, row-major');

const setCount = Object.values(ledgers).reduce((sum, ledger) => sum + Object.keys(ledger.sets).length, 0);
console.log(`terrain-texture-tiers.selftest: ${setCount} sets (${Object.keys(GROUPS).join(', ')}) × ${Object.keys(TIERS).length} tiers match their ledgers`);
