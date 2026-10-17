// The tactical map paints water only where the world draws it (owner 2026-10-14, Kestrel Airfield: "fix the map and how
// it shows a bunch of water spots by spawn even though you can't actually see any water"). World.getMinimapFeatures splits
// the lake and marsh discs by the world's own liquid mask (world/minimapWaterPatches.ts); the HUD's baked plate and the
// Studio's plan paint liquidPatches as water (fill, keyline, waterline rim) and softPatches as ground — bog, salt pan or
// takyr in the map's own tones, ice on an iceLake map — with a keyline and no rim. Over all 33 battlefields:
//   - a map without a liquid sheet (terrain.ts liquidWater: splat.seaLake without frozen marshes) paints no disc in its
//     water colour and no waterline rim; its dry ground is ground-toned (not blue) and its ice is its palette's ice;
//   - the world's own hand-off decides it: map.ts's water preamble and getMinimapFeatures, run from its source on each
//     map's discs (createMap builds the whole world, 36-70 s in Node), hand the painters the split as liquidPatches and
//     softPatches the right way round, with the wet layer's iceLake, sampled once per world;
//   - Kestrel Airfield: the world hands all twenty bogs over as softPatches and none as liquidPatches, and from those
//     features nothing is water-coloured within 160 m of either team's pads (the real height field's mask, end to end);
//   - "wet" is what the world renders: a ramped mask of 0.015 and up (the water sheet discards below it, shallowWater.ts).
//     On a map with a liquid sheet, every disc the world wets anywhere (a 4 m census inside its contour) is painted as
//     water, and every disc painted as water is wet somewhere (to 1 m where the 4 m census misses a sliver). Height fields
//     are built only for the liquid maps and Kestrel;
//   - the painters read water only from liquidPatches, and drop the rim on request (the real shoreline painter, a fake
//     canvas);
//   - the split is bounded: at most 337 mask samples per disc.
// Phase 2 (2026-10-15, world/visibleWater.ts): on the liquid maps the water itself is the world's visible-water raster —
// the water sheet's own cells, 2 m (its parity with the sheet is visibleWater.selftest.mjs):
//   - the world builds it lazily, once, outside getMinimapFeatures (the battle's audio reads those mid-fight), and both
//     plate builds hand it to the HUD beside the features; the Studio's plan takes it too;
//   - the HUD paints exactly the raster (the real painter on a recording canvas: one texel a cell, laid through
//     worldToMap's axes) and then no liquid disc;
//   - no painted water on dry ground beyond the contour tolerance: every painted point lies in a 2 m cell whose centre the
//     world shows wet, and the paint over dry ground (a 1 m census of every painted cell) stays under half a metre per
//     metre of waterline; the water the paint misses along the waterline obeys the same bound;
//   - causeways are dry: every road point inside an old liquid contour where the world shows no water (the point and
//     2 m around it) is unpainted; Pine Hollow's two near-dry bog discs by the causeway, (171, 19) and (193, 28), are
//     no longer painted wet.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { MAP_IDS } from '../world/maps/mapIds.ts';
import { worldBuildConfig } from '../world/worldBuildConfig.ts';
import { createHeightField, createLayout } from '../world/terrain.ts';
import { SHORELINE_SEGMENTS, shorelineDistance, shorelineRadiusAt } from '../world/shoreline.ts';
import { splitMinimapWater } from '../world/minimapWaterPatches.ts';
import { shallowWaterGeometrySteps } from '../world/shallowWater.ts';
import { VISIBLE_WATER_MIN, WATER_SHEET_GRID_M, buildVisibleWaterRaster, visibleWaterAt } from '../world/visibleWater.ts';
import { projectWorldToMinimap } from './minimapOrientation.ts';

const hudSource = await readFile(new URL('./hud.ts', import.meta.url), 'utf8');
const planSource = await readFile(new URL('./studioPlanView.ts', import.meta.url), 'utf8');
const studioSource = await readFile(new URL('../game/studio.ts', import.meta.url), 'utf8');
const mapSource = await readFile(new URL('../world/map.ts', import.meta.url), 'utf8');
const terrainSource = await readFile(new URL('../world/terrain.ts', import.meta.url), 'utf8');
const shallowWaterSource = await readFile(new URL('../world/shallowWater.ts', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
const audioSource = await readFile(new URL('../audio/audioEngine.ts', import.meta.url), 'utf8');

// ---- "wet" is the rendered threshold: the sheet discards a fragment below it, and the CPU mask is the sheet's ramp ----
assert.match(terrainSource,
  /function getWaterMaskAt\(x: number, z: number\): number \{[^}]*return smoothstep\(waterRampStart, waterRampEnd, wetness\);\s*\}/,
  'the CPU water mask is the material\'s ramped wetness, the quantity the sheet discards on');
assert.deepEqual(shallowWaterSource.match(/discard;/g), ['discard;'], 'the water sheet has one discard');
assert.match(shallowWaterSource, /if \(wet < \$\{glslFloat\(VISIBLE_WATER_MIN\)\}\) discard;/,
  'the water sheet discards below the shared VISIBLE_WATER_MIN (visibleWater.ts)');
const RENDERED_WET = VISIBLE_WATER_MIN;
assert.equal(RENDERED_WET, 0.015, 'the water sheet draws a fragment at a ramped mask of 0.015 and up');

// ---- the sources: one liquid rule, and water only from liquidPatches ----
// (integ/226: Caldera's paddies 3c38af2b5 hold their water on any unfrozen map; the marshes and lakes keep the seaLake rule)
assert.match(terrainSource, /const marshLiquid = !!cfg\?\.splat\?\.seaLake && !T\.frozenMarshes;\s*const liquidWater = marshLiquid \|\| \(!!T\.paddies\?\.length && !T\.frozenMarshes\);/,
  'the world draws a liquid sheet only on a seaLake map without frozen marshes, or for an unfrozen map\'s paddies');
assert.match(terrainSource, /function getWaterMaskAt\(x: number, z: number\): number \{\s*if \(!liquidWater\) return 0;/,
  'without a liquid sheet the water mask is 0 everywhere (so every disc there is dry)');
assert.match(mapSource, /minimapWater \?\?= splitMinimapWater\(\[\.\.\.layout\.marshes, \.\.\.layout\.lakes\], heightField\.getWaterMaskAt\);/,
  'the world splits its discs by its own water mask, once');
assert.match(mapSource, /const minimapIceLake = !!minimapSplat\?\.iceLake;[\s\S]*iceLake: minimapIceLake,/,
  'the ice switch is the wet layer\'s (splat.iceLake)');
assert.doesNotMatch(hudSource, /waterOrSoft/, 'the HUD never paints the unsplit discs');
const bgBody = hudSource.slice(hudSource.indexOf('  function buildMinimapBg('), hudSource.indexOf('  function preloadMinimapAsset('));
assert.match(bgBody, /paintMinimapWaterLayers\(octx, f, pal\);/, 'the plate paints its water layers through one composer');
assert.doesNotMatch(bgBody, /fillMinimapPatches|paintMinimapShorelines|\.water\b/, 'the plate paints no water of its own');
const layersBody = hudSource.slice(hudSource.indexOf('  function paintMinimapWaterLayers('), hudSource.indexOf('  function buildMinimapBg('));
assert.deepEqual(layersBody.match(/palette\.water\b/g), ['palette.water'], 'one disc water fill in the composer');
assert.match(layersBody, /if \(features\.visibleWater\) \{\s*paintVisibleWater\(context, features\.visibleWater, palette\);\s*return;\s*\}\s*fillMinimapPatches\(context, features\.liquidPatches, palette\.water\);/,
  'the world\'s visible-water raster is the water when handed over; the liquid discs only without one');
assert.deepEqual(hudSource.match(/'rgb\(204,234,240\)'/g), ["'rgb(204,234,240)'"], 'one waterline rim colour');
assert.match(hudSource, /const MINIMAP_WATERLINE_RIM = 'rgb\(204,234,240\)';/, 'the rim colour is the named waterline rim');
assert.match(layersBody, /paintMinimapShorelines\(context, features\.liquidPatches, palette\.waterStroke, MINIMAP_WATERLINE_RIM\);/,
  'without a raster the waterline rim is the liquid discs\'');
const rasterBody = hudSource.slice(hudSource.indexOf('  function paintVisibleWater('), hudSource.indexOf('  function paintMinimapWaterLayers('));
assert.match(rasterBody, /fctx\.fillStyle = palette\.water;[\s\S]*paintMinimapShoreBands\(context, mask, palette\.waterStroke, MINIMAP_WATERLINE_RIM\);/,
  'the raster painter: the water fill, its keyline and the waterline rim, from the raster\'s mask');
assert.equal((mainSource.match(/hud\.buildMinimap\(next\.heightField, \{ \.\.\.next\.getMinimapFeatures\(\), visibleWater: next\.getVisibleWaterRaster\(\) \},/g) ?? []).length, 2,
  'both plate builds (the battle\'s and the bake\'s) hand the HUD the world\'s raster beside its features');
assert.doesNotMatch(mainSource, /hud\.buildMinimap\(next\.heightField, next\.getMinimapFeatures\(\)/, 'no plate build without the raster');
assert.doesNotMatch(audioSource, /getVisibleWaterRaster|visibleWater/, 'the battle\'s audio never builds the raster');
assert.doesNotMatch(planSource, /waterOrSoft/, 'the Studio plan never paints the unsplit discs');
assert.deepEqual(planSource.match(/COLORS\.water\b/g), ['COLORS.water', 'COLORS.water'], 'one water colour on the plan: the raster\'s and the discs\'');
assert.match(studioSource, /liquidPatches: f\.liquidPatches, softPatches: f\.softPatches, iceLake: f\.iceLake, visibleWater: world\.getVisibleWaterRaster\(\)/,
  'the Studio hands the plan the world\'s split and its visible-water raster');
assert.match(planSource, /if \(features\.visibleWater\) paintVisibleWater\(g, features\.visibleWater, size\);\s*else discs\(features\.liquidPatches, COLORS\.water\);/,
  'the plan paints the raster as its water when handed one, the liquid discs otherwise');

// ---- the painters, run from the HUD source ----
function hudPainters(name, nextName, names, bindings) {
  const begin = hudSource.indexOf(`  function ${name}(`);
  const end = hudSource.indexOf(`  function ${nextName}(`, begin);
  assert.ok(begin >= 0 && end > begin, `${name}: HUD implementation remains discoverable`);
  const javascript = stripTypeScriptTypes(hudSource.slice(begin, end));
  return new Function(...Object.keys(bindings), `${javascript}\nreturn { ${names.join(', ')} };`)(...Object.values(bindings));
}
const hudPainter = (name, nextName, bindings) => hudPainters(name, nextName, [name], bindings)[name];
const defaultSource = /const MM_PALETTE_DEFAULT: HudMinimapPalette = \{[\s\S]*?\n {2}\};/.exec(hudSource);
assert.ok(defaultSource, 'the HUD default palette remains discoverable');
const MM_PALETTE_DEFAULT = new Function(`${stripTypeScriptTypes(defaultSource[0])}\nreturn MM_PALETTE_DEFAULT;`)();

const mapSize = 220;
let worldSize = 1024;
const painterPoint = [0, 0];
const worldToMap = (x, z) => projectWorldToMinimap(x, z, worldSize, mapSize, painterPoint);
const fillPatches = hudPainter('fillMinimapPatches', 'mixedForestFill', { SHORELINE_SEGMENTS, shorelineRadiusAt, worldToMap });
const shorelines = [];
const rasterPaints = [];
const paintWaterLayers = hudPainter('paintMinimapWaterLayers', 'buildMinimapBg', {
  fillMinimapPatches: fillPatches,
  paintMinimapShorelines: (context, patches, keyline, rim) => { if (patches?.length) shorelines.push({ count: patches.length, keyline, rim }); },
  paintVisibleWater: (context, raster, palette) => { rasterPaints.push({ raster, water: palette.water }); },
  MINIMAP_WATERLINE_RIM: 'rgb(204,234,240)',
});
function recordingContext() {
  const fills = [];
  let paths = [];
  const context = {
    fillStyle: '',
    beginPath() { paths = []; },
    moveTo(x, y) { paths.push([[x, y]]); },
    lineTo(x, y) { paths.at(-1).push([x, y]); },
    closePath() {},
    fill() { fills.push({ style: context.fillStyle, paths }); },
  };
  return { context, fills };
}
/** Paint one battlefield's water layers in its own palette: what each disc was filled with, and the shoreline passes. */
function paintMap(features, palette) {
  const { context, fills } = recordingContext();
  shorelines.length = 0; rasterPaints.length = 0;
  paintWaterLayers(context, features, palette);
  return { fills, shorelines: shorelines.slice(), rasters: rasterPaints.slice() };
}
const rgba = (style) => {
  const match = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(style);
  assert.ok(match, `a parseable colour: ${style}`);
  return match.slice(1, 4).map(Number);
};
const WATERLINE_RIM = 'rgb(204,234,240)';

// the real shoreline painter drops the rim on request: a fake canvas records every band tint
{
  const tints = [];
  const fakeCanvas = () => {
    const canvas = { width: 0, height: 0 };
    const ctx = { canvas, filter: 'none', globalCompositeOperation: 'source-over', globalAlpha: 1, fillStyle: '',
      setTransform() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, drawImage() {}, save() {}, restore() {},
      fillRect() { if (ctx.globalCompositeOperation === 'source-in') tints.push(ctx.fillStyle); } };
    canvas.ctx = ctx;
    return canvas;
  };
  const target = fakeCanvas();
  target.width = 440; target.height = 440;
  target.ctx.getTransform = () => ({ a: 2 });
  const paintShorelines = hudPainter('paintMinimapShorelines', 'paintMinimapWaterLayers', {
    SHORELINE_SEGMENTS, shorelineRadiusAt, worldToMap,
    document: { createElement: (tag) => { assert.equal(tag, 'canvas'); return fakeCanvas(); } },
    requireCanvasContext: (canvas) => canvas.ctx,
  });
  const disc = [{ x: 10, z: 20, r: 30 }];
  paintShorelines(target.ctx, disc, 'rgba(1,2,3,.5)', WATERLINE_RIM);
  assert.deepEqual(tints, [WATERLINE_RIM, 'rgba(1,2,3,.5)'], 'liquid water: the waterline rim inside, the keyline outside');
  tints.length = 0;
  paintShorelines(target.ctx, disc, 'rgba(4,5,6,.5)', null);
  assert.deepEqual(tints, ['rgba(4,5,6,.5)'], 'dry ground and ice: the keyline alone, no rim band at all');
  tints.length = 0;
  paintShorelines(target.ctx, [], 'rgba(4,5,6,.5)', null);
  assert.deepEqual(tints, [], 'no discs, no bands');
}

// the real raster painter: one opaque texel a raster cell, laid through worldToMap's own axes, filtered down to the plate,
// then tinted the water colour with its keyline and waterline rim — a recording canvas tracks every transform
{
  const draws = [], tints = [];
  const multiply = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  const recordingCanvas = () => {
    const canvas = { width: 0, height: 0, image: null };
    let matrix = [1, 0, 0, 1, 0, 0];
    const ctx = {
      canvas, filter: 'none', globalCompositeOperation: 'source-over', globalAlpha: 1, fillStyle: '',
      imageSmoothingEnabled: false, imageSmoothingQuality: 'low',
      setTransform(a, b, c, d, e, f) { matrix = typeof a === 'object' ? [a.a, a.b, a.c, a.d, a.e, a.f] : [a, b, c, d, e, f]; },
      transform(a, b, c, d, e, f) { matrix = multiply(matrix, [a, b, c, d, e, f]); },
      getTransform() { const [a, b, c, d, e, f] = matrix; return { a, b, c, d, e, f }; },
      createImageData(width, height) { return { width, height, data: new Uint8ClampedArray(width * height * 4) }; },
      putImageData(image) { canvas.image = image; },
      drawImage(source) { draws.push({ target: canvas, source, matrix: matrix.slice(), smoothing: ctx.imageSmoothingEnabled }); },
      fillRect() { if (ctx.globalCompositeOperation === 'source-in') tints.push(ctx.fillStyle); },
      save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {},
    };
    canvas.ctx = ctx;
    return canvas;
  };
  const { paintVisibleWater } = hudPainters('paintMinimapShorelines', 'paintMinimapWaterLayers', ['paintVisibleWater'], {
    SHORELINE_SEGMENTS, shorelineRadiusAt, worldToMap, MINIMAP_WATERLINE_RIM: WATERLINE_RIM,
    document: { createElement: (tag) => { assert.equal(tag, 'canvas'); return recordingCanvas(); } },
    requireCanvasContext: (canvas) => canvas.ctx,
  });
  worldSize = 1024;
  const cells = 16, cellM = worldSize / cells, water = new Uint8Array(cells * cells);
  for (const [i, j] of [[0, 0], [1, 0], [2, 0], [0, 1], [9, 4], [15, 15]]) water[j * cells + i] = 1; // an L by (−x, −z), a stray, a corner
  const raster = { size: worldSize, cells, cellM, water };
  const target = recordingCanvas();
  target.width = 440; target.height = 440;
  target.ctx.setTransform(2, 0, 0, 2, 0, 0); // the plate's device pixel ratio
  paintVisibleWater(target.ctx, raster, MM_PALETTE_DEFAULT);
  const texels = draws.find((d) => d.source.image)?.source;
  assert.ok(texels && texels.width === cells && texels.height === cells, 'one texel a raster cell');
  for (let k = 0; k < cells * cells; k++) {
    assert.equal(texels.image.data[k * 4 + 3], water[k] ? 255 : 0, `texel ${k}: opaque exactly where the world shows water`);
  }
  const laid = draws.find((d) => d.source === texels);
  assert.ok(laid.smoothing, 'the raster is filtered down to the plate');
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const [a, b, c, d, e, f] = laid.matrix, u = i + 0.5, v = j + 0.5;
      const expected = projectWorldToMinimap(-worldSize / 2 + u * cellM, -worldSize / 2 + v * cellM, worldSize, mapSize);
      assert.ok(Math.abs(a * u + c * v + e - expected[0] * 2) < 1e-9 && Math.abs(b * u + d * v + f - expected[1] * 2) < 1e-9,
        `cell (${i}, ${j}) lands on its world centre's map pixel (world +X map-left, +Z map-up)`);
    }
  }
  assert.deepEqual(tints, [MM_PALETTE_DEFAULT.water, WATERLINE_RIM, MM_PALETTE_DEFAULT.waterStroke],
    'the raster in the water colour, then the waterline rim inside it and the keyline outside');
  assert.ok(draws.some((d) => d.target === target && d.matrix.join() === '1,0,0,1,0,0'), 'composited onto the plate 1:1');
  draws.length = 0; tints.length = 0;
  paintVisibleWater(target.ctx, { ...raster, water: new Uint8Array(cells * cells) }, MM_PALETTE_DEFAULT);
  assert.deepEqual(tints, [], 'a raster without water paints nothing');
  assert.ok(!draws.some((d) => d.target === target), 'and leaves the plate untouched');
}

// ---- the world's hand-off, run from map.ts: its water preamble (layout, the memo, the iceLake switch) and its own
// getMinimapFeatures, on a real height field. Props and vegetation feed only the roads/buildings/trees, so they are
// empty here. A swap of liquidPatches and softPatches in map.ts repaints Kestrel's twenty bogs as water: this catches it.
const preambleBegin = mapSource.indexOf('  const layout = heightField._layout;\n');
const preambleEnd = mapSource.indexOf('\n', mapSource.indexOf('  const visibleWaterSheet = ', preambleBegin));
const featuresBegin = mapSource.indexOf('    getMinimapFeatures: () => {', preambleEnd);
const rasterBegin = mapSource.indexOf('\n    getVisibleWaterRaster: () => {', featuresBegin);
const featuresEnd = mapSource.indexOf('\n    },\n', rasterBegin + 1);
assert.equal(mapSource.slice(mapSource.indexOf('\n    },\n', featuresBegin), rasterBegin), '\n    },',
  'map.ts: getVisibleWaterRaster follows getMinimapFeatures');
assert.doesNotMatch(mapSource.slice(featuresBegin, rasterBegin), /VisibleWater|visibleWater/,
  'map.ts: getMinimapFeatures never touches the raster (the battle\'s audio reads the features mid-fight)');
assert.match(mapSource.slice(rasterBegin, featuresEnd), /if \(visibleWater === undefined\) visibleWater = visibleWaterSheet \? buildVisibleWaterRaster\(heightField\) : null;/,
  'map.ts: the raster is built once per world, on a map with a liquid sheet');
assert.ok(preambleBegin >= 0 && preambleEnd > preambleBegin && featuresBegin > preambleEnd && featuresEnd > featuresBegin,
  'map.ts: the world\'s minimap water preamble and getMinimapFeatures remain discoverable');
const handOffSource = stripTypeScriptTypes(`${mapSource.slice(preambleBegin, preambleEnd)}
const runtime = {
${mapSource.slice(featuresBegin, featuresEnd)}
    },
};`);
const assembleHandOff = new Function('splitMinimapWater', 'buildVisibleWaterRaster', 'config', 'heightField', 'props', 'vegetation',
  `${handOffSource}\nreturn runtime;`);
/** One world's minimap hand-off as map.ts runs it: its features, its raster, and how often it sampled each. */
function worldMinimap(config, heightField) {
  let splits = 0;
  const rasterBuilds = [];
  const runtime = assembleHandOff(
    (discs, waterMaskAt) => { splits++; return splitMinimapWater(discs, waterMaskAt); },
    (field) => { rasterBuilds.push(field); return buildVisibleWaterRaster(field); },
    config, heightField, { features: { buildings: [], tacticalBeats: [] } }, { _clusters: [] });
  return { getMinimapFeatures: runtime.getMinimapFeatures, getVisibleWaterRaster: runtime.getVisibleWaterRaster,
    splits: () => splits, rasterBuilds: () => rasterBuilds.slice() };
}

// ---- phase 2: what the world shows against what the plate paints ----
/** The sheet cells the real geometry builds (shallowWaterGeometrySteps: six indices a cell, its (−x, −z) corner first). */
function sheetAdmission(field) {
  const segments = Math.ceil(field.size / WATER_SHEET_GRID_M), step = field.size / segments, half = field.size / 2;
  const admitted = new Uint8Array(segments * segments);
  const steps = shallowWaterGeometrySteps(field);
  let next;
  do next = steps.next(); while (!next.done);
  if (next.value) {
    const index = next.value.geometry.getIndex().array, position = next.value.geometry.getAttribute('position');
    for (let t = 0; t < index.length; t += 6) {
      admitted[Math.round((position.getZ(index[t]) + half) / step) * segments + Math.round((position.getX(index[t]) + half) / step)] = 1;
    }
    next.value.geometry.dispose();
  }
  return { admitted, segments, step };
}
/**
 * One liquid map's waterline census on a 1 m lattice (each raster cell's four quarter points): the old paint (the liquid
 * discs to their contours) and the raster's paint against what the world shows — the built sheet's cells with the mask
 * at VISIBLE_WATER_MIN — and its causeways (road points inside an old liquid contour where the world shows no water
 * within 2 m).
 */
function waterlineCensus(field, raster, liquidDiscs) {
  const { admitted, segments, step } = sheetAdmission(field);
  const half = field.size / 2, n = raster.cells, cellM = raster.cellM, q = cellM / 4, pointM2 = (cellM / 2) ** 2;
  const seen = (x, z) => {
    const cx = Math.floor((x + half) / step), cz = Math.floor((z + half) / step);
    return cx >= 0 && cz >= 0 && cx < segments && cz < segments && admitted[cz * segments + cx] === 1
      && field.getWaterMaskAt(x, z) >= VISIBLE_WATER_MIN;
  };
  // the old paint: the liquid discs filled to their contours, on the 1 m lattice
  const R = n * 2, pointM = cellM / 2, old = new Uint8Array(R * R);
  const lattice = (v) => Math.floor((v + half) / pointM);
  for (const d of liquidDiscs) {
    for (let b = Math.max(0, lattice(d.z - d.r)); b <= Math.min(R - 1, lattice(d.z + d.r)); b++) {
      const z = -half + (b + 0.5) * pointM;
      for (let a = Math.max(0, lattice(d.x - d.r)); a <= Math.min(R - 1, lattice(d.x + d.r)); a++) {
        if (!old[b * R + a] && shorelineDistance(d, -half + (a + 0.5) * pointM, z, 1) <= 1) old[b * R + a] = 1;
      }
    }
  }
  const oldAt = (x, z) => { const a = lattice(x), b = lattice(z); return a >= 0 && b >= 0 && a < R && b < R && old[b * R + a] === 1; };
  let dryBefore = 0, missedBefore = 0, dryAfter = 0, missedAfter = 0, waterlineM = 0;
  for (let b = 0; b < R; b++) {
    for (let a = 0; a < R; a++) if (old[b * R + a] && !seen(-half + (a + 0.5) * pointM, -half + (b + 0.5) * pointM)) dryBefore++;
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i, wet = raster.water[k] !== 0;
      if (i + 1 < n && (raster.water[k + 1] !== 0) !== wet) waterlineM += cellM;
      if (j + 1 < n && (raster.water[k + n] !== 0) !== wet) waterlineM += cellM;
      const byLine = wet || (i > 0 && raster.water[k - 1]) || (i + 1 < n && raster.water[k + 1])
        || (j > 0 && raster.water[k - n]) || (j + 1 < n && raster.water[k + n]);
      if (!byLine) continue;
      const x = -half + (i + 0.5) * cellM, z = -half + (j + 0.5) * cellM;
      for (const [dx, dz] of [[-q, -q], [q, -q], [-q, q], [q, q]]) {
        const shows = seen(x + dx, z + dz);
        if (wet && !shows) dryAfter++;
        else if (!wet && shows) missedAfter++;
        if (wet && shows && !oldAt(x + dx, z + dz)) missedBefore++;
      }
    }
  }
  let causewayM = 0, causewayPaintedM = 0;
  for (const road of field._layout.roads) {
    for (let s = 1; s < road.length; s++) {
      const [x0, z0] = road[s - 1], [x1, z1] = road[s];
      const length = Math.hypot(x1 - x0, z1 - z0), pieces = Math.max(1, Math.ceil(length));
      for (let t = 0; t < pieces; t++) {
        const x = x0 + (x1 - x0) * (t + 0.5) / pieces, z = z0 + (z1 - z0) * (t + 0.5) / pieces;
        if (!oldAt(x, z) || seen(x, z) || seen(x + 2, z) || seen(x - 2, z) || seen(x, z + 2) || seen(x, z - 2)) continue;
        causewayM += length / pieces;
        if (visibleWaterAt(raster, x, z)) causewayPaintedM += length / pieces;
      }
    }
  }
  return { dryBeforeM2: dryBefore * pointM2, missedBeforeM2: missedBefore * pointM2, dryAfterM2: dryAfter * pointM2,
    missedAfterM2: missedAfter * pointM2, waterlineM, causewayM, causewayPaintedM, seen };
}
/** The painted and the world's share of a disc's contour (1 m lattice). */
function discShares(disc, raster, seen) {
  let inside = 0, painted = 0, shows = 0;
  for (let z = Math.ceil(disc.z - disc.r) + 0.5; z < disc.z + disc.r; z++) {
    for (let x = Math.ceil(disc.x - disc.r) + 0.5; x < disc.x + disc.r; x++) {
      if (shorelineDistance(disc, x, z, 1) > 1) continue;
      inside++;
      if (visibleWaterAt(raster, x, z)) painted++;
      if (seen(x, z)) shows++;
    }
  }
  return { painted: painted / inside, shows: shows / inside };
}
const censusRows = [];

// ---- every battlefield ----
const liquidMaps = [], dryMaps = [], iceMaps = [];
const discCensus = { liquid: 0, soft: 0 };
for (const id of MAP_IDS) {
  const config = worldBuildConfig(id);
  const palette = { ...MM_PALETTE_DEFAULT, ...(config.minimap || {}) };
  const liquid = !!config.splat?.seaLake && !config.terrain?.frozenMarshes;
  const iceLake = !!config.splat?.iceLake;
  // only the liquid maps (and Kestrel, below) need the real mask; elsewhere it is 0 by the source rule above
  const field = liquid ? createHeightField(1337, config) : null;
  const layout = field ? field._layout : createLayout(config);
  const discs = [...layout.marshes, ...layout.lakes];
  worldSize = field?.size ?? 1024;
  let samples = 0;
  const split = splitMinimapWater(discs, field ? (x, z) => { samples++; return field.getWaterMaskAt(x, z); } : () => { samples++; return 0; });
  assert.ok(samples <= discs.length * 337, `${id}: the split is bounded (${samples} samples for ${discs.length} discs)`);
  assert.equal(split.liquid.length + split.soft.length, discs.length, `${id}: every disc is classed once`);
  discCensus.liquid += split.liquid.length; discCensus.soft += split.soft.length;
  // the features the world hands the painters (a dry map's mask is 0 everywhere by the source rule above)
  const world = worldMinimap(config, field ?? { _layout: layout, getWaterMaskAt: () => 0 });
  const features = world.getMinimapFeatures();
  assert.deepEqual(features.liquidPatches, split.liquid, `${id}: the world hands over its liquid discs as liquidPatches`);
  assert.deepEqual(features.softPatches, split.soft, `${id}: the world hands over its dry discs as softPatches`);
  assert.equal(features.iceLake, iceLake, `${id}: the world's iceLake is its wet layer's`);
  const painted = paintMap(features, palette);
  const waterFills = painted.fills.filter((f) => f.style === palette.water);
  const rims = painted.shorelines.filter((s) => s.rim !== null);
  const softStyle = iceLake ? palette.ice : palette.bog, softKeyline = iceLake ? palette.iceStroke : palette.bogStroke;
  if (split.soft.length) {
    assert.ok(softStyle !== palette.water, `${id}: dry discs are not painted in the water colour`);
    const softFill = painted.fills.find((f) => f.style === softStyle);
    assert.equal(softFill?.paths.length, split.soft.length, `${id}: every dry disc is painted in the ${iceLake ? 'ice' : 'soft-ground'} style`);
    assert.ok(painted.shorelines.some((s) => s.keyline === softKeyline && s.rim === null && s.count === split.soft.length),
      `${id}: the dry discs carry a keyline and no waterline rim`);
    if (!iceLake) {
      const [r, , b] = rgba(softStyle);
      assert.ok(b < r, `${id}: dry ground is ground-toned, not blue (${softStyle})`);
    }
  }
  if (!liquid) {
    assert.equal(split.liquid.length, 0, `${id}: no liquid disc on a map without a liquid sheet`);
    assert.equal(waterFills.length, 0, `${id}: nothing painted in the water colour`);
    assert.equal(rims.length, 0, `${id}: no waterline rim`);
    if (discs.length) (iceLake ? iceMaps : dryMaps).push(id);
    continue;
  }
  liquidMaps.push(id);
  assert.ok(split.liquid.length > 0, `${id}: a liquid map paints its water`);
  assert.equal(waterFills.length, 1, `${id}: the liquid discs are one water fill`);
  assert.equal(waterFills[0].paths.length, split.liquid.length, `${id}: every liquid disc is painted as water`);
  assert.deepEqual(rims.map((s) => [s.rim, s.keyline, s.count]), [[WATERLINE_RIM, palette.waterStroke, split.liquid.length]],
    `${id}: the waterline rim follows the liquid discs only`);
  // every disc the world visibly wets anywhere (4 m census inside its contour) is water; every water disc is visibly wet
  // somewhere (wet = the rendered threshold, not merely a mask above 0)
  const liquidSet = new Set(split.liquid);
  const wetSomewhere = (disc, step) => {
    const reach = disc.r;
    for (let z = disc.z - reach; z <= disc.z + reach; z += step) {
      for (let x = disc.x - reach; x <= disc.x + reach; x += step) {
        if (shorelineDistance(disc, x, z, 1) <= 1 && field.getWaterMaskAt(x, z) >= RENDERED_WET) return true;
      }
    }
    return false;
  };
  for (const disc of discs) {
    const wet4 = wetSomewhere(disc, 4);
    if (wet4) assert.ok(liquidSet.has(disc), `${id}: the disc at (${disc.x.toFixed(0)}, ${disc.z.toFixed(0)}) shows water and is painted as water`);
    else if (liquidSet.has(disc)) assert.ok(wetSomewhere(disc, 1), `${id}: the water disc at (${disc.x.toFixed(0)}, ${disc.z.toFixed(0)}) shows water somewhere`);
  }
  // ---- phase 2: the plate paints the world's visible-water raster, not the discs ----
  assert.deepEqual(world.rasterBuilds(), [], `${id}: reading the features never builds the raster`);
  const raster = world.getVisibleWaterRaster();
  assert.ok(raster && world.getVisibleWaterRaster() === raster, `${id}: the world keeps one raster`);
  assert.deepEqual(world.rasterBuilds(), [field], `${id}: built once, on the first call, from the world's height field`);
  const plate = paintMap({ ...features, visibleWater: raster }, palette);
  assert.deepEqual(plate.rasters, [{ raster, water: palette.water }], `${id}: the plate's water is the world's raster, in the water colour`);
  assert.equal(plate.fills.filter((f) => f.style === palette.water).length, 0, `${id}: no liquid disc is painted beside it`);
  assert.equal(plate.shorelines.filter((s) => s.rim !== null).length, 0, `${id}: no disc waterline rim beside it`);
  const census = waterlineCensus(field, raster, split.liquid);
  // the contour tolerance: the paint's edge runs along 2 m cell edges whose centres the world shows wet, so on average it
  // sits within half a metre of the world's waterline, outward and inward alike
  assert.ok(census.dryAfterM2 <= 0.5 * census.waterlineM,
    `${id}: painted water over dry ground ${census.dryAfterM2.toFixed(0)} m2 along ${census.waterlineM.toFixed(0)} m of waterline (≤ 0.5 m a metre)`);
  assert.ok(census.missedAfterM2 <= 0.5 * census.waterlineM,
    `${id}: the world's water left unpainted along the waterline ${census.missedAfterM2.toFixed(0)} m2 (≤ 0.5 m a metre)`);
  assert.equal(census.causewayPaintedM, 0, `${id}: no causeway is painted wet (${census.causewayM.toFixed(0)} m of road the old paint covered)`);
  censusRows.push({ id, ...census });
  if (id === 'autumn') {
    for (const [x, z] of [[171, 19], [193, 28]]) {
      const disc = split.liquid.find((d) => Math.hypot(d.x - x, d.z - z) < 1.5);
      assert.ok(disc, `Pine Hollow: the near-dry bog disc at (${x}, ${z}) is still classed liquid (wet somewhere)`);
      const share = discShares(disc, raster, census.seen);
      assert.ok(share.shows < 0.02, `Pine Hollow (${x}, ${z}): the world shows water in under 2 % of it (${(share.shows * 100).toFixed(1)} %)`);
      assert.ok(share.painted < 0.05, `Pine Hollow (${x}, ${z}): painted wet in under 5 % of it, was all of it (${(share.painted * 100).toFixed(1)} %)`);
    }
  }
}
assert.ok(censusRows.reduce((sum, row) => sum + row.causewayM, 0) > 100, 'the causeway check bites: the old paint covered causeways');
assert.ok(censusRows.find((row) => row.id === 'polders').missedBeforeM2 > 0, 'Tidegate Polders: the canals the old paint missed are counted');
assert.deepEqual(iceMaps.sort(), ['alpine', 'whiteout', 'winter'], 'the frozen maps paint their lakes as ice');
assert.deepEqual(dryMaps.sort(), ['airfield', 'caldera', 'copper_mesa', 'desert', 'longleaf', 'orchard', 'steppe'],
  'the maps whose discs are dry ground');
assert.equal(liquidMaps.length, 12, `twelve liquid maps (${liquidMaps.join(', ')})`);

// ---- Kestrel Airfield, end to end on its real height field ----
{
  const config = worldBuildConfig('airfield');
  const field = createHeightField(1337, config);
  worldSize = field.size;
  const layout = field._layout;
  const pads = [layout.spawns.player, ...layout.spawns.enemies];
  for (const [x, z] of [[-60, 416], [0, -403], [120, -403]]) {
    assert.ok(pads.some((p) => p.x === x && p.z === z), `Kestrel: the owner's spawn (${x}, ${z}) is one of the pads checked`);
  }
  assert.equal(pads.length, 8, 'Kestrel: alpha\'s pad and bravo\'s seven');
  const discs = [...layout.marshes, ...layout.lakes];
  assert.equal(discs.length, 20, 'Kestrel: the twenty valley bogs');
  // the world path: map.ts's own getMinimapFeatures on Kestrel's real height field
  const world = worldMinimap(config, field);
  const features = world.getMinimapFeatures();
  assert.deepEqual(features.liquidPatches, [], 'Kestrel: the world hands over no bog as liquid water');
  assert.deepEqual(features.softPatches, discs, 'Kestrel: the world hands over all twenty bogs, in order, as softPatches');
  assert.deepEqual(features.waterOrSoft, discs, 'Kestrel: the footprint list still carries every disc');
  assert.ok(features.softPatches.every((disc, i) => disc !== discs[i]), 'Kestrel: the features are copies, not the layout\'s own discs');
  assert.equal(features.iceLake, false, 'Kestrel: its wet layer is not ice');
  assert.deepEqual(world.getMinimapFeatures().softPatches, discs, 'Kestrel: a second read hands over the same split');
  assert.equal(world.splits(), 1, 'Kestrel: the split is sampled once per world (the battle\'s audio re-reads the features)');
  assert.equal(world.getVisibleWaterRaster(), null, 'Kestrel: no standing water anywhere, so no raster (its plate paints the bogs from the discs)');
  const palette = { ...MM_PALETTE_DEFAULT, ...config.minimap };
  const painted = paintMap(features, palette);
  assert.deepEqual(painted.fills.map((f) => [f.style, f.paths.length]), [[palette.bog, 20]], 'Kestrel: all twenty bogs painted as soft ground');
  const metresPerPixel = worldSize / mapSize;
  const waterLike = new Set([palette.water, palette.waterStroke, WATERLINE_RIM]);
  let nearestBogM = Infinity;
  for (const fill of painted.fills) {
    for (const path of fill.paths) {
      for (const [px, py] of path) {
        for (const pad of pads) {
          const [cx, cy] = projectWorldToMinimap(pad.x, pad.z, worldSize, mapSize);
          const metres = Math.hypot(px - cx, py - cy) * metresPerPixel;
          if (waterLike.has(fill.style)) assert.ok(metres >= 160, `Kestrel: nothing water-coloured within 160 m of a pad (${metres.toFixed(0)} m)`);
          else nearestBogM = Math.min(nearestBogM, metres);
        }
      }
    }
  }
  assert.ok(painted.shorelines.every((s) => s.rim === null && !waterLike.has(s.keyline)), 'Kestrel: no waterline rim or water keyline anywhere');
  assert.ok(nearestBogM < 160, `Kestrel: the bogs by the pads are still marked as soft ground (nearest bank ${nearestBogM.toFixed(0)} m)`);
  const [r, g, b] = rgba(palette.bog);
  assert.ok(b < g && g < r + 8 && r > b + 30, `Kestrel: the bog is an olive-brown (${palette.bog})`);
}

const kM2 = (m2) => `${(m2 / 1000).toFixed(1)}k`;
console.log(`minimapLiquidWater.selftest: blue over dry ground before -> after (1 m census): ${censusRows.map((row) =>
  `${row.id} ${kM2(row.dryBeforeM2)} -> ${kM2(row.dryAfterM2)} (waterline ${(row.waterlineM / 1000).toFixed(1)} km; missed ${kM2(row.missedBeforeM2)} -> ${kM2(row.missedAfterM2)}; causeway ${row.causewayM.toFixed(0)} m dry)`).join('; ')}`);
console.log(`minimapLiquidWater.selftest: ${MAP_IDS.length} maps — ${liquidMaps.length} liquid (${discCensus.liquid} water discs, every wet disc painted as water), `
  + `${dryMaps.length} dry-ground and ${iceMaps.length} ice maps (${discCensus.soft} dry discs, no water colour, no waterline rim); Kestrel clear of water within 160 m of every pad`);
