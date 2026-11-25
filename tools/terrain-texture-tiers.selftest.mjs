// terrain-texture-tiers.selftest.mjs — the battle terrain's tier WebPs are the generator's, from the committed sources
// (texture-diet-277). No encoder runs here: the ledger's digests pin the sources and every output, so a hand edit, a
// regenerated file with no ledger, or a source swapped under the outputs fails.
// 1. every source and output matches the ledger, and every tier holds Color, NormalGL and ORM for every set;
// 2. the sets the loader names (sourcedTextures.ts `tiered(...)`) are exactly the generator's;
// 3. each tier's outputs are at its size, the 512 tier is smaller than the 1K, and the 1K tier saves at least 30 % against
//    the JPGs it replaces (the brief's floor), with its recorded error inside the bounds the encode settings were chosen at;
// 4. the kernels: the normal halving renormalises, the colour halving averages in linear light, ORM packing.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkLedger, halve, LEDGER, outputFile, packOrm, TERRAIN_SOURCES, TIERS } from './terrain-texture-tiers.mjs';

const ROOT = new URL('../', import.meta.url);
const ledger = JSON.parse(readFileSync(new URL(LEDGER, ROOT), 'utf8'));

// 1.
assert.deepEqual(checkLedger(), [], 'the sources and tier outputs match the ledger');

// 2.
const loader = readFileSync(new URL('src/world/sourcedTextures.ts', ROOT), 'utf8');
const named = [...loader.matchAll(/\btiered\('([^']+)'\)/g)].map((m) => m[1]).sort();
assert.deepEqual(named, TERRAIN_SOURCES.map((s) => s.base).sort(), 'the loader routes exactly the generated sets');
assert.match(loader, /`\$\{TT\}\/\$\{terrainTextureTier\(\)\}\/\$\{set\.tiered\}`/, 'the loader reads the running tier');
for (const tier of Object.keys(TIERS)) {
  assert.equal(outputFile(tier, 'Grass004', 'ORM'), `public/textures/terrain/${tier}/Grass004_ORM.webp`, 'the files the loader names');
}

// 3.
for (const [base, entry] of Object.entries(ledger.sets)) {
  const sourceBytes = Object.values(entry.sources).reduce((sum, s) => sum + s.bytes, 0);
  const tierBytes = (tier) => Object.values(entry.outputs[tier]).reduce((sum, o) => sum + o.bytes, 0);
  for (const [tier, size] of Object.entries(TIERS)) {
    for (const o of Object.values(entry.outputs[tier])) assert.equal(o.size, size, `${base} ${tier}: ${o.file} is ${size} px`);
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
assert.match(ledger.encoder, /^cwebp \d+\.\d+\.\d+ \/ dwebp \d+\.\d+\.\d+$/, 'the ledger names the libwebp that encoded it');

// 4.
const flat = (px) => Uint8Array.from(px.flat());
const normals = halve(flat([[255, 128, 128, 255], [0, 128, 128, 255], [128, 128, 255, 255], [128, 128, 255, 255]]), 2, 'normal');
assert.deepEqual([...normals], [128, 128, 255, 255], '+x and −x cancel; the mean of unit normals is renormalised to +z');
const grey = halve(flat([[0, 0, 0, 255], [255, 255, 255, 255], [0, 0, 0, 255], [255, 255, 255, 255]]), 2, 'srgb');
assert.deepEqual([...grey], [188, 188, 188, 255], 'black and white average to linear 0.5 (sRGB 188), not 128');
const data = halve(flat([[0, 10, 0, 255], [255, 20, 0, 255], [0, 30, 0, 255], [255, 40, 0, 255]]), 2, 'data');
assert.deepEqual([...data], [128, 25, 0, 255], 'data channels average as numbers');
assert.deepEqual([...packOrm(flat([[90, 1, 2, 255]]), flat([[200, 3, 4, 255]]))], [90, 200, 0, 255], 'R = AO, G = roughness, B = 0');

console.log(`terrain-texture-tiers.selftest: ${Object.keys(ledger.sets).length} sets × ${Object.keys(TIERS).length} tiers match the ledger`);
