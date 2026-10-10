import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createCanvas, Path2D, DOMMatrix, ImageData } from '@napi-rs/canvas';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';
import { createTank } from './tankFactory.ts';
import { getSpec } from './specs.ts';
import { CAMO_UV_REPEATS_PER_M, CAMO_TILE_SPAN_M, camoPatchWorldScale } from './camoWorldScale.ts';
import { camoPatternIdHash, camoPatternStreamSeed, resolveCamoVisual } from './materials.ts';
import { createMaterialPainter } from './materialPainter.ts';
import { paintMaterialBase } from './materialPainterWorker.ts';

// Round 35 (owner 2026-09-21): "fix our camos completely: the look of identical camos looks completely different if
// you switch between tanks. this system is busted". One pattern id is one tile that covers the same world metres on
// every hull, fitting and picker swatch: the hull box-UV density is a fleet constant, the recipe's camoScale only
// shapes the paint, the first bake paints from the pattern stream, and the swatch is a crop of the real tile.

const source = (file) => readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
const near = (actual, expected, rel, message) => assert.ok(Math.abs(actual - expected) <= Math.abs(expected) * rel,
  `${message}: expected ${expected} within ${rel * 100}%, received ${actual}`);

// --- the constant and the painter's density law ---------------------------------------------------------------------
assert.equal(CAMO_UV_REPEATS_PER_M, 0.5, 'every hull projects the camo tile at 0.5 repeats per metre');
assert.equal(CAMO_TILE_SPAN_M, 2, 'one tile spans two metres of armour');
assert.equal(camoPatchWorldScale(undefined), 1, 'a recipe without a density paints reference-size patches');
assert.equal(camoPatchWorldScale(0.34), 1, 'sparser-than-reference recipes paint reference-size patches');
assert.equal(camoPatchWorldScale(0.5), 1, 'the reference density is the reference');
near(camoPatchWorldScale(0.72), 0.5 / 0.72, 1e-9, 'a denser recipe paints proportionally smaller patches');
near(camoPatchWorldScale(0.88), 0.5 / 0.88, 1e-9, 'the densest fleet recipe');
assert.equal(camoPatchWorldScale(NaN), 1, 'a broken density falls back to the reference');

// --- every hull's merged camo surfaces project at the constant, whatever it authored -------------------------------
// Four very different hulls: no authored scale (the 0.34 legacy default), the 0.5 reference, a 0.6 and a 0.72 hull
// (type74 took the 0.6 seat when tiger1 retired with the hidden fleet, 2026-09-23).
const HULLS = ['t90m', 'm1a2', 'type74', 'spz_puma_s1'];
const AXIS = { x: (p, i) => [p.getZ(i), p.getY(i)], y: (p, i) => [p.getX(i), p.getZ(i)], z: (p, i) => [p.getX(i), p.getY(i)] };
function measureUvDensity(mesh) {
  const p = mesh.geometry.attributes.position, n = mesh.geometry.attributes.normal, uv = mesh.geometry.attributes.uv;
  assert.ok(p && n && uv, `${mesh.name}: position, normal and uv`);
  const ratios = [];
  const ref = { x: null, y: null, z: null };
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    const axis = ny >= nx && ny >= nz ? 'y' : nx >= nz ? 'x' : 'z';
    const [u, v] = AXIS[axis](p, i);
    // exact projection contract: uv = position * density along the box axes
    assert.equal(uv.getX(i), Math.fround(u * CAMO_UV_REPEATS_PER_M), `${mesh.name}: exact U at vertex ${i}`);
    assert.equal(uv.getY(i), Math.fround(v * CAMO_UV_REPEATS_PER_M), `${mesh.name}: exact V at vertex ${i}`);
    if (ref[axis] == null) { ref[axis] = i; continue; }
    const [u0] = AXIS[axis](p, ref[axis]);
    if (Math.abs(u - u0) > 0.25) ratios.push(Math.abs((uv.getX(i) - uv.getX(ref[axis])) / (u - u0)));
  }
  ratios.sort((a, b) => a - b);
  return ratios.length ? ratios[ratios.length >> 1] : null;
}
const restoreFixture = installCanvasFixture();
const authored = {};
let projected = 0;
try {
  for (const id of HULLS) {
    const spec = getSpec(id);
    authored[id] = spec.visual.camoScale ?? null;
    const tank = createTank(id, null, { quality: 'low', camoPattern: 'factory', materialMode: 'rendered',
      proceduralOnly: true, geometryReceipt: true, batchStatic: false, camoSeed: 4242 });
    try {
      for (const name of ['hull', 'turret']) {
        const mesh = tank.root.getObjectByName(name);
        assert.ok(mesh?.isMesh, `${id}: merged ${name} mesh`);
        const density = measureUvDensity(mesh);
        near(density, CAMO_UV_REPEATS_PER_M, 0.01, `${id}: ${name} UV repeats per metre (authored camoScale ${authored[id]})`);
        projected++;
      }
      // the material contract fittings project with (profiles/kit.ts reads material.userData.camoUvScale)
      const hull = tank.root.getObjectByName('hull');
      assert.equal(hull.material.userData.camoProjection, 'vehicle-scale-box-uv', `${id}: hull paint projection contract`);
      assert.equal(hull.material.userData.camoUvScale, CAMO_UV_REPEATS_PER_M, `${id}: hull paint density contract`);
      tank.root.traverse((object) => {
        if (object.isMesh && object.userData.camoUvScale !== undefined) {
          assert.equal(object.userData.camoUvScale, CAMO_UV_REPEATS_PER_M, `${id}: ${object.name} fitting density`);
        }
      });
    } finally { tank.dispose?.(); }
  }
} finally { restoreFixture(); }
assert.ok(new Set(Object.values(authored)).size >= 3, `the hulls really author different scales (${JSON.stringify(authored)})`);

// --- native canvas from here on: pixels ---------------------------------------------------------------------------
Object.assign(globalThis, { Path2D, DOMMatrix, ImageData });
const painter = createMaterialPainter(createCanvas);
const pixels = (canvas) => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
const EMPTY = { hLines: [], vLines: [], rings: [], chips: [], streaks: [] };
const abrams = getSpec('m1a2'), t90m = getSpec('t90m'), puma = getSpec('spz_puma_s1');

// the same shared pattern resolves to one recipe and paints one byte-identical pattern layer on any hull
for (const patternId of ['service_usa_desert', 'sig_abramsx', 'paint_chieftain5', 'national_de', 'flecktarn', 'urbanblock', 'openai']) {
  const recipes = [abrams, t90m, puma].map((spec) => resolveCamoVisual(spec, patternId));
  const morphology = (v) => JSON.stringify([v.scheme, v.base, v.weather, v.patches, v.camoScale, v.patchK, v.digitalCellK,
    v.solidWeatheringIntensity, v.bandAngle, v.blackK, v.rainK]);
  assert.equal(new Set(recipes.map(morphology)).size, 1, `${patternId}: one recipe on the Abrams, the T-90M and the Puma`);
  const tiles = recipes.map((visual) => {
    const tile = createCanvas(128, 128);
    const seed = camoPatternStreamSeed(visual, camoPatternIdHash(patternId));
    painter.paintCamo(tile, visual, painter.mulberry32(seed), EMPTY, seed);
    return Buffer.from(pixels(tile)).toString('hex');
  });
  assert.equal(new Set(tiles).size, 1, `${patternId}: byte-identical pattern tile on every hull`);
}
// nation-relative built-ins (summer: Soviet 4BO on Russian hulls, NATO three-tone elsewhere) still resolve to one
// recipe within a nation group and differ only where the pattern is defined to
assert.deepEqual(resolveCamoVisual(abrams, 'summer').patches, resolveCamoVisual(puma, 'summer').patches,
  'summer: one NATO recipe on the Abrams and the Puma');
assert.notDeepEqual(resolveCamoVisual(abrams, 'summer').patches, resolveCamoVisual(t90m, 'summer').patches,
  'summer: the Soviet 4BO variant on the T-90M is a defined nation dependency');
const digitalOf = (spec) => JSON.stringify([resolveCamoVisual(spec, 'digital').scheme, resolveCamoVisual(spec, 'digital').patches,
  resolveCamoVisual(spec, 'digital').digitalCellK]);
assert.equal(digitalOf(abrams), digitalOf(getSpec('m1a1')), 'digital: one NATO recipe on two US hulls');
assert.notEqual(digitalOf(abrams), digitalOf(t90m), 'digital: the Russian lattice on the T-90M is a defined nation dependency');
// a built-in pattern no longer inherits the hull's authored density/knobs (the Puma authors 0.72)
assert.equal(resolveCamoVisual(puma, 'summer').camoScale, undefined, 'summer does not inherit the Puma hull density');
// Factory is the nation's service pattern (round 32) and carries THAT recipe's density, not the hull's authored one
assert.equal(resolveCamoVisual(puma, 'factory').camoScale, resolveCamoVisual(getSpec('leo2a6m'), 'service_leo2a6m').camoScale,
  'Factory on the Puma wears the German service recipe density');

// the FIRST bake paints from the pattern stream: identical to a repaint, byte for byte, through both painter paths
{
  const visual = { ...resolveCamoVisual(abrams, 'service_usa_desert'), modernWelds: true };
  const streamSeed = camoPatternStreamSeed(visual, camoPatternIdHash('service_usa_desert'));
  const request = { identity: 'r35:first-bake', visual, seed: 0x5eed ^ 4242, dimensions: { albedo: 128, map: 64 },
    plateLines: true, camoStreamSeed: streamSeed };
  const entry = { camoCanvas: createCanvas(4, 4), normalCanvas: createCanvas(4, 4), roughCanvas: createCanvas(4, 4), feats: null };
  for (const step of painter.bakeBaseSteps(entry, request)) void step;
  const repaint = createCanvas(128, 128);
  painter.paintCamo(repaint, visual, painter.mulberry32(streamSeed), entry.feats, request.seed);
  painter.exposureTrim(repaint);
  assert.deepEqual(pixels(entry.camoCanvas), pixels(repaint), 'first bake == repaint of the same pattern');
  const worker = paintMaterialBase(request, createCanvas);
  assert.deepEqual(worker.albedo, pixels(entry.camoCanvas), 'the worker path bakes the same first tile');
  const legacy = { camoCanvas: createCanvas(4, 4), normalCanvas: createCanvas(4, 4), roughCanvas: createCanvas(4, 4), feats: null };
  const { camoStreamSeed: _omit, ...legacyRequest } = request;
  for (const step of painter.bakeBaseSteps(legacy, legacyRequest)) void step;
  assert.notDeepEqual(pixels(legacy.camoCanvas), pixels(entry.camoCanvas), 'the stream seed is what makes the first bake hull-independent');
}

// --- a denser recipe paints SMALLER world patches: mean blob area on the fixed tile ---------------------------------
function meanPatchArea(visual, size = 256) {
  const tile = createCanvas(size, size);
  painter.paintCamo(tile, visual, painter.mulberry32(99), EMPTY, 99);
  const d = pixels(tile);
  // the darkest patch colour: pixels closer to it than to the base coat
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const dark = hex(visual.patches[0]), base = hex(visual.base);
  const mask = new Uint8Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    const dd = (r - dark[0]) ** 2 + (g - dark[1]) ** 2 + (b - dark[2]) ** 2;
    const db = (r - base[0]) ** 2 + (g - base[1]) ** 2 + (b - base[2]) ** 2;
    mask[i] = dd < db ? 1 : 0;
  }
  const seen = new Uint8Array(size * size); const stack = new Int32Array(size * size); const areas = [];
  for (let s = 0; s < size * size; s++) {
    if (!mask[s] || seen[s]) continue;
    let top = 0; stack[top++] = s; seen[s] = 1; let area = 0;
    while (top) {
      const q = stack[--top]; area++;
      const x = q % size, y = (q / size) | 0;
      for (const nb of [x > 0 ? q - 1 : -1, x < size - 1 ? q + 1 : -1, y > 0 ? q - size : -1, y < size - 1 ? q + size : -1]) {
        if (nb >= 0 && mask[nb] && !seen[nb]) { seen[nb] = 1; stack[top++] = nb; }
      }
    }
    if (area >= 12) areas.push(area);
  }
  return { mean: areas.reduce((a, b) => a + b, 0) / Math.max(1, areas.length), count: areas.length };
}
const nato = { scheme: 'nato', base: '#6f7a58', weather: '#77825f', patches: ['#1c1f1a', '#4a3a2c'] };
const reference = meanPatchArea({ ...nato, camoScale: 0.5 });
const dense = meanPatchArea({ ...nato, camoScale: 0.72 });
const sparse = meanPatchArea({ ...nato, camoScale: 0.34 });
assert.ok(reference.count >= 4 && dense.count >= 4, `patches found (${reference.count}, ${dense.count})`);
assert.ok(dense.mean < reference.mean * 0.75,
  `camoScale 0.72 paints smaller patches than 0.5 on the fixed 2 m tile (${dense.mean.toFixed(0)} vs ${reference.mean.toFixed(0)} px^2)`);
near(sparse.mean, reference.mean, 1e-9, 'at or below the reference density the patch geometry is the reference');

// --- the picker swatch is a crop of the real tile, identical across specs for a shared preset ----------------------
const { paintCamoSwatch, camoSwatchRecipe, resetCamoSwatchCache, CAMO_SWATCH_CROP, CAMO_SWATCH_TILE_PX,
  CAMO_SWATCH_WIDTH, CAMO_SWATCH_HEIGHT, CAMO_SWATCH_SPAN_M, queueCamoSwatch, pendingCamoSwatchCount, hasCachedCamoSwatch }
  = await import('../ui/camoSwatchPainter.ts');
assert.equal(CAMO_SWATCH_SPAN_M.width, CAMO_TILE_SPAN_M, 'the swatch shows one full 2 m tile across');
near(CAMO_SWATCH_SPAN_M.height, CAMO_TILE_SPAN_M * CAMO_SWATCH_HEIGHT / CAMO_SWATCH_WIDTH, 1e-9, 'and the same scale down');
resetCamoSwatchCache();
for (const patternId of ['service_usa_desert', 'paint_chieftain5', 'national_de', 'openai', 'urbanblock']) {
  const swatches = [abrams, t90m, puma].map((spec) => { const c = createCanvas(4, 4); paintCamoSwatch(c, spec, patternId); return c; });
  assert.equal(swatches[0].width, CAMO_SWATCH_WIDTH); assert.equal(swatches[0].height, CAMO_SWATCH_HEIGHT);
  const hex = swatches.map((c) => Buffer.from(pixels(c)).toString('hex'));
  assert.equal(new Set(hex).size, 1, `${patternId}: byte-identical swatch on the Abrams, the T-90M and the Puma`);
  // and it is a crop of the tile the real painter paints for that recipe
  const recipe = camoSwatchRecipe(abrams, patternId);
  const tile = createCanvas(CAMO_SWATCH_TILE_PX, CAMO_SWATCH_TILE_PX);
  painter.paintCamo(tile, recipe.visual, painter.mulberry32(recipe.streamSeed), EMPTY, recipe.streamSeed);
  painter.exposureTrim(tile);
  const expected = createCanvas(CAMO_SWATCH_WIDTH, CAMO_SWATCH_HEIGHT);
  expected.getContext('2d').drawImage(tile, CAMO_SWATCH_CROP.x, CAMO_SWATCH_CROP.y, CAMO_SWATCH_CROP.width, CAMO_SWATCH_CROP.height,
    0, 0, CAMO_SWATCH_WIDTH, CAMO_SWATCH_HEIGHT);
  assert.deepEqual(pixels(swatches[0]), pixels(expected), `${patternId}: the swatch is the real tile's middle band at 2:1`);
  assert.ok(!('zimmerit' in recipe.visual) && !('plateLines' in recipe.visual) && !('number' in recipe.visual),
    `${patternId}: hull-only knobs stay out of the swatch recipe`);
}
// Factory legitimately depends on the vehicle: the Abrams (USA) and the T-90M (Russia) wear different service paints
{
  const a = createCanvas(4, 4), b = createCanvas(4, 4);
  paintCamoSwatch(a, abrams, 'factory'); paintCamoSwatch(b, t90m, 'factory');
  assert.notDeepEqual(pixels(a), pixels(b), 'Factory swatches follow the nation');
}
// the queue paints resident recipes at once and defers cold ones
{
  const hot = createCanvas(4, 4), cold = createCanvas(4, 4);
  assert.ok(hasCachedCamoSwatch(abrams, 'service_usa_desert'));
  queueCamoSwatch(hot, abrams, 'service_usa_desert');
  assert.equal(hot.width, CAMO_SWATCH_WIDTH, 'resident swatch painted synchronously');
  assert.ok(!hasCachedCamoSwatch(abrams, 'winterbands'));
  queueCamoSwatch(cold, abrams, 'winterbands');
  assert.equal(pendingCamoSwatchCount(), 1, 'cold swatch waits for a frame budget');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(pendingCamoSwatchCount(), 0, 'drained on the next tick');
  assert.equal(cold.width, CAMO_SWATCH_WIDTH, 'cold swatch painted by the drain');
  assert.ok(hasCachedCamoSwatch(abrams, 'winterbands'));
}

// --- source pins: no per-hull UV density survives anywhere on the camo path ----------------------------------------
const core = source('./tankFactoryCore.ts');
assert.ok(/boxUV\(merged, CAMO_UV_REPEATS_PER_M\);/.test(core), 'the hull/turret merge projects at the constant');
assert.ok(!/camoScale \?\? 0?\.34/.test(core), 'no legacy per-hull UV density in the factory core');
const mats = source('./materials.ts');
assert.ok(/const camoUvScale = CAMO_UV_REPEATS_PER_M;/.test(mats), 'fittings publish the constant density');
assert.ok(/camoStreamSeed: camoPatternStreamSeed\(vis, camoPatternIdHash\(entry\.patternId\)\)/.test(mats),
  'the shared paint request carries the pattern stream for the first bake');
const paint = source('./materialPainter.ts');
assert.ok(/const wk = camoPatchWorldScale\(visual\.camoScale\);/.test(paint), 'the painter shapes patches by the recipe density law');
assert.ok(/mulberry32\(request\.camoStreamSeed\)/.test(paint), 'the first bake paints the pattern from its stream');
assert.ok(!/camoScale \?\? \.34|camoScale \?\? 0\.34/.test(source('./profiles/leopardA5XDetails.ts')), 'Leopard A5 covers project at the constant');
console.log(`camoWorldScale.selftest: ${projected} merged surfaces at ${CAMO_UV_REPEATS_PER_M} repeats/m on ${HULLS.length} hulls, `
  + `pattern tiles, first bake and swatches hull-independent; camoScale 0.72 patches ${(dense.mean / reference.mean * 100).toFixed(0)}% of reference area`);
