// The tactical map paints water only where the world draws it (owner 2026-10-14, Kestrel Airfield: "fix the map and how
// it shows a bunch of water spots by spawn even though you can't actually see any water"). World.getMinimapFeatures splits
// the lake and marsh discs by the world's own liquid mask (world/minimapWaterPatches.ts); the HUD's baked plate and the
// Studio's plan paint liquidPatches as water (fill, keyline, waterline rim) and softPatches as ground — bog, salt pan or
// takyr in the map's own tones, ice on an iceLake map — with a keyline and no rim. Over all 33 battlefields:
//   - a map without a liquid sheet (terrain.ts liquidWater: splat.seaLake without frozen marshes) paints no disc in its
//     water colour and no waterline rim; its dry ground is ground-toned (not blue) and its ice is its palette's ice;
//   - Kestrel Airfield: nothing water-coloured within 160 m of either team's pads, every one of its twenty bogs painted
//     as soft ground (the real height field's mask, end to end);
//   - on a map with a liquid sheet, every disc the world wets anywhere (a 4 m census inside its contour) is painted as
//     water, and every disc painted as water is wet somewhere (to 1 m where the 4 m census misses a sliver). Height fields
//     are built only for the liquid maps and Kestrel;
//   - the painters read water only from liquidPatches, and drop the rim on request (the real shoreline painter, a fake
//     canvas);
//   - the split is bounded: at most 337 mask samples per disc.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { MAP_IDS } from '../world/maps/mapIds.ts';
import { worldBuildConfig } from '../world/worldBuildConfig.ts';
import { createHeightField, createLayout } from '../world/terrain.ts';
import { SHORELINE_SEGMENTS, shorelineDistance, shorelineRadiusAt } from '../world/shoreline.ts';
import { splitMinimapWater } from '../world/minimapWaterPatches.ts';
import { projectWorldToMinimap } from './minimapOrientation.ts';

const hudSource = await readFile(new URL('./hud.ts', import.meta.url), 'utf8');
const planSource = await readFile(new URL('./studioPlanView.ts', import.meta.url), 'utf8');
const studioSource = await readFile(new URL('../game/studio.ts', import.meta.url), 'utf8');
const mapSource = await readFile(new URL('../world/map.ts', import.meta.url), 'utf8');
const terrainSource = await readFile(new URL('../world/terrain.ts', import.meta.url), 'utf8');

// ---- the sources: one liquid rule, and water only from liquidPatches ----
assert.match(terrainSource, /const liquidWater = !!cfg\?\.splat\?\.seaLake && !T\.frozenMarshes;/,
  'the world draws a liquid sheet only on a seaLake map without frozen marshes');
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
assert.deepEqual(layersBody.match(/palette\.water\b/g), ['palette.water'], 'one water fill in the composer');
assert.match(layersBody, /fillMinimapPatches\(context, features\.liquidPatches, palette\.water\);/, 'the water fill is the liquid discs\'');
assert.deepEqual(layersBody.match(/'rgb\(204,234,240\)'/g), ["'rgb(204,234,240)'"], 'one waterline rim in the composer');
assert.match(layersBody, /paintMinimapShorelines\(context, features\.liquidPatches, palette\.waterStroke, 'rgb\(204,234,240\)'\);/,
  'the waterline rim is the liquid discs\'');
assert.doesNotMatch(planSource, /waterOrSoft/, 'the Studio plan never paints the unsplit discs');
assert.deepEqual(planSource.match(/COLORS\.water\b/g), ['COLORS.water'], 'one water fill on the plan');
assert.match(planSource, /discs\(features\.liquidPatches, COLORS\.water\);/, 'the plan\'s water is the liquid discs\'');
assert.match(studioSource, /liquidPatches: f\.liquidPatches, softPatches: f\.softPatches, iceLake: f\.iceLake/,
  'the Studio hands the plan the world\'s split');

// ---- the painters, run from the HUD source ----
function hudPainter(name, nextName, bindings) {
  const begin = hudSource.indexOf(`  function ${name}(`);
  const end = hudSource.indexOf(`  function ${nextName}(`, begin);
  assert.ok(begin >= 0 && end > begin, `${name}: HUD implementation remains discoverable`);
  const javascript = stripTypeScriptTypes(hudSource.slice(begin, end));
  return new Function(...Object.keys(bindings), `${javascript}\nreturn ${name};`)(...Object.values(bindings));
}
const defaultSource = /const MM_PALETTE_DEFAULT: HudMinimapPalette = \{[\s\S]*?\n {2}\};/.exec(hudSource);
assert.ok(defaultSource, 'the HUD default palette remains discoverable');
const MM_PALETTE_DEFAULT = new Function(`${stripTypeScriptTypes(defaultSource[0])}\nreturn MM_PALETTE_DEFAULT;`)();

const mapSize = 220;
let worldSize = 1024;
const painterPoint = [0, 0];
const worldToMap = (x, z) => projectWorldToMinimap(x, z, worldSize, mapSize, painterPoint);
const fillPatches = hudPainter('fillMinimapPatches', 'mixedForestFill', { SHORELINE_SEGMENTS, shorelineRadiusAt, worldToMap });
const shorelines = [];
const paintWaterLayers = hudPainter('paintMinimapWaterLayers', 'buildMinimapBg', {
  fillMinimapPatches: fillPatches,
  paintMinimapShorelines: (context, patches, keyline, rim) => { if (patches?.length) shorelines.push({ count: patches.length, keyline, rim }); },
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
  shorelines.length = 0;
  paintWaterLayers(context, features, palette);
  return { fills, shorelines: shorelines.slice() };
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
  const painted = paintMap({ liquidPatches: [...split.liquid], softPatches: [...split.soft], iceLake }, palette);
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
  // every disc the world wets anywhere (4 m census inside its contour) is water; every water disc is wet somewhere
  const liquidSet = new Set(split.liquid);
  const wetSomewhere = (disc, step) => {
    const reach = disc.r;
    for (let z = disc.z - reach; z <= disc.z + reach; z += step) {
      for (let x = disc.x - reach; x <= disc.x + reach; x += step) {
        if (shorelineDistance(disc, x, z, 1) <= 1 && field.getWaterMaskAt(x, z) > 0) return true;
      }
    }
    return false;
  };
  for (const disc of discs) {
    const wet4 = wetSomewhere(disc, 4);
    if (wet4) assert.ok(liquidSet.has(disc), `${id}: the disc at (${disc.x.toFixed(0)}, ${disc.z.toFixed(0)}) holds water and is painted as water`);
    else if (liquidSet.has(disc)) assert.ok(wetSomewhere(disc, 1), `${id}: the water disc at (${disc.x.toFixed(0)}, ${disc.z.toFixed(0)}) is wet somewhere`);
  }
}
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
  const split = splitMinimapWater(discs, field.getWaterMaskAt);
  assert.equal(split.liquid.length, 0, 'Kestrel: no bog holds liquid in the world');
  const palette = { ...MM_PALETTE_DEFAULT, ...config.minimap };
  const painted = paintMap({ liquidPatches: [...split.liquid], softPatches: [...split.soft], iceLake: !!config.splat?.iceLake }, palette);
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

console.log(`minimapLiquidWater.selftest: ${MAP_IDS.length} maps — ${liquidMaps.length} liquid (${discCensus.liquid} water discs, every wet disc painted as water), `
  + `${dryMaps.length} dry-ground and ${iceMaps.length} ice maps (${discCensus.soft} dry discs, no water colour, no waterline rim); Kestrel clear of water within 160 m of every pad`);
