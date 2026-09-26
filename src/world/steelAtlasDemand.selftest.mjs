// Round 75 follow-up 1 (2026-09-26): the steel atlas is painted only where a props build will draw the steel
// material — a container row, a yard structure kind (every yard profile places a steel family) or corrugated
// cladding — so a map without pays nothing; the mobile tier paints it at half size with the same strip ranges;
// a steel part on an unpredicted map falls back to one synchronous paint, and the record on the group is the
// build-timing probe's evidence.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';
import { STEEL_ATLAS_SIZE, STEEL_ATLAS_SIZE_MOBILE, STEEL_STRIP_V, makeSteelAtlas, steelAtlasNeeded } from './propsSteelAtlas.ts';
import { yardStructureKinds } from './yardDressing.ts';

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// --- the predicate against an independent reading of every plan
const yard = new Set(yardStructureKinds());
const without = [];
for (const id of MAP_IDS) {
  const props = getMapConfig(id).props ?? {};
  const plan = props.plan ?? [];
  const expected = props.industrialCladding === 'steel' || plan.some((kind) => kind === 'containerRow' || yard.has(kind));
  assert.equal(steelAtlasNeeded(plan, props.industrialCladding), expected, `${id}: the predicate follows the plan`);
  if (!expected) without.push(id);
}
assert.deepEqual(without, ['verdant', 'desert', 'coastal', 'autumn', 'oasis', 'orchard'], 'six battlefields draw no steel (2026-09-26 plans)');
assert.equal(steelAtlasNeeded(['cottage', 'barn'], undefined), false);
assert.equal(steelAtlasNeeded(['cottage', 'containerRow'], undefined), true, 'a container row');
assert.equal(steelAtlasNeeded(['cottage', 'shed'], undefined), true, 'a yard kind (its profile places drums)');
assert.equal(steelAtlasNeeded(['cottage'], 'steel'), true, 'corrugated cladding');
assert.equal(steelAtlasNeeded(undefined, undefined), false, 'no plan, no steel');

// --- the half-size paint: the same checkpoints and strip ranges, a quarter of the texels
globalThis.ImageData = class { constructor(data, w, h) { this.data = data; this.width = w; this.height = h; } };
globalThis.document = { createElement() { const canvas = { width: 0, height: 0 }; canvas.getContext = () => ({ putImageData(image) { canvas.pixels = image.data; } }); return canvas; } };
try {
  assert.equal(STEEL_ATLAS_SIZE_MOBILE, STEEL_ATLAS_SIZE / 2);
  for (const size of [STEEL_ATLAS_SIZE, STEEL_ATLAS_SIZE_MOBILE]) {
    const g = makeSteelAtlas(new SimplexNoise({ random: mulberry32(1337 + 7) }), 4, size);
    let steps = 0, r;
    do { r = g.next(); if (!r.done) { steps++; assert.deepEqual(r.value, { fine: true, stage: `steel-rows-${steps * 16}` }); } } while (!r.done);
    assert.equal(steps, size / 16, `${size}: sixteen rows a checkpoint`);
    for (const t of Object.values(r.value)) { assert.equal(t.image.width, size); assert.equal(t.image.pixels.byteLength, size * size * 4); t.dispose(); }
  }
  for (const [strip, [v0, v1]] of Object.entries(STEEL_STRIP_V)) assert.ok(v0 > 0 && v1 <= 1 && v1 - v0 > 0.22, `${strip}: strip ranges are size-independent`);
} finally { delete globalThis.ImageData; delete globalThis.document; }

// --- the producer: gated paint, the timing record, both fallback sites
const source = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
assert.match(source, /const steelAtlas = \{ needed: steelAtlasNeeded\(P\.plan, P\.industrialCladding\), painted: false, fallback: '', ms: 0, size: 0 \};/);
assert.match(source, /if \(steelAtlas\.needed\) \{\n\s*const painter = makeSteelAtlas\(noi, aniso, steelAtlasSize\);/, 'the atlas paints only when needed');
assert.match(source, /getDeviceTier\(\) === 'mobile' \? STEEL_ATLAS_SIZE_MOBILE : STEEL_ATLAS_SIZE/, 'half size on the mobile tier');
assert.match(source, /group\.userData\.steelAtlas = steelAtlas;/, 'the timing record for the build probe');
assert.match(source, /if \(tmp\.steel\?\.length\) ensureSteelAtlas\('plan:' \+ structureId\);/, 'a planned steel part falls back');
assert.match(source, /ensureSteelAtlas\('yard:'/, 'a yard steel family falls back');
assert.match(source, /\.\.\.\(steel \? \{ map: steel\.albedo, normalMap: steel\.normal, roughnessMap: steel\.surface, aoMap: steel\.surface \} : \{\}\)/, 'the material takes the maps only when painted');
console.log(`steelAtlasDemand self-test passed: ${MAP_IDS.length - without.length} maps paint the atlas, ${without.length} do not; half-size paint checked`);
