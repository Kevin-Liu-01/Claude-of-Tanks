import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { MAP_IDS, getMapConfig } from '../world/maps/index.ts';
import { createLayout } from '../world/terrain.ts';
import { SHORELINE_SEGMENTS, shorelineRadiusAt } from '../world/shoreline.ts';
import { splitMinimapWater } from '../world/minimapWaterPatches.ts';
import { MINIMAP_RASTER_REVISION, minimapAssetUrl } from './minimapAssetUrl.ts';
import {
  minimapAngleForDirection,
  minimapYawForHeading,
  normalizeMinimapAngle,
  projectWorldToMinimap,
} from './minimapOrientation.ts';

const point = [0, 0];
assert.strictEqual(projectWorldToMinimap(0, 0, 1000, 220, point), point,
  'world projection reuses caller-owned storage on the HUD hot path');
assert.deepEqual(point, [110, 110], 'world origin is the fixed map center');
assert.deepEqual(projectWorldToMinimap(-500, 0, 1000, 220, point), [220, 110],
  'screen-right world -X is always map-right');
assert.deepEqual(projectWorldToMinimap(500, 0, 1000, 220, point), [0, 110],
  'screen-left world +X is always map-left');
assert.deepEqual(projectWorldToMinimap(0, 500, 1000, 220, point), [110, 0],
  'world +Z is always map-up');
assert.deepEqual(projectWorldToMinimap(0, -500, 1000, 220, point), [110, 220],
  'world -Z is always map-down');
assert.equal(normalizeMinimapAngle(Math.PI * 4), 0,
  'equivalent full turns normalize to one stable marker angle');
assert.equal(minimapAngleForDirection(-1, 0), 0,
  'a mouse-right/world -X view cone points right on the fixed map');
assert.equal(minimapAngleForDirection(0, 1), -Math.PI / 2,
  'a world-north view cone points up on the fixed map');
assert.equal(minimapYawForHeading(-Math.PI / 2), Math.PI / 2,
  'a mouse-right yaw decrease rotates an up-facing tank marker to map-right');

const hudSource = await readFile(new URL('./hud.ts', import.meta.url), 'utf8');
const worldActivationSource = await readFile(
  new URL('../world/worldActivationRuntime.ts', import.meta.url), 'utf8',
);
assert.doesNotMatch(hudSource, /minimapRotation|minimapViewHeading|minimapPlayerHeading/,
  'camera and hull movement never rotate or translate the fixed battlefield raster');
assert.match(hudSource,
  /function drawMinimapBackground\(\)[\s\S]{0,600}drawImage\(mmBg, 0, 0, MM, MM\)[\s\S]{0,300}drawMinimapChrome\(mmCtx\)/,
  'the decoded north-up battlefield image is drawn once without tiling or transforms');
assert.doesNotMatch(hudSource, /N - 1 - x3/,
  'the top-down capture keeps its native screen-right/world -X handedness');
assert.match(hudSource,
  /transformDirection\(camera\.matrixWorld\)[\s\S]{0,160}minimapAngleForDirection\(_fwd\.x, _fwd\.z\)/,
  'the field-of-view cone still follows the live camera over the fixed map');
assert.match(hudSource,
  /function drawArrowBlip\([\s\S]{0,500}rotate\(minimapYawForHeading\(yaw\)\)/,
  'the player tank marker still follows live hull rotation over the fixed map');
assert.match(hudSource,
  /mmBg = image;[\s\S]{0,120}drawMinimapBackground\(\)/,
  'production retains the decoded image instead of a purge-prone iPad canvas copy');
const mainSource = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
assert.match(mainSource, /import \{ minimapAssetUrl as getMinimapAssetUrl \} from '\.\/ui\/minimapAssetUrl\.ts'/);
assert.match(mainSource, /getMinimapAssetUrl\(mapId, import\.meta\.env\.BASE_URL \|\| '\/'\)/,
  'intent prefetch uses the same versioned URL owner as activation');
assert.match(worldActivationSource, /minimapAssetUrl\(mapId, baseUrl, options\.minimapAssetVersion\)/);
assert.doesNotMatch(mainSource + worldActivationSource, /north-up-v\d/,
  'callers cannot retain a stale hardcoded raster revision');
// tactical map 2026-09-15: every raster was re-baked (tone curve, hillshade, union
// shorelines), so one shared revision invalidates every cache entry at once.
assert.equal(MINIMAP_RASTER_REVISION, 'north-up-v21-apron-paint'); // 2026-10-22: sixteen plates with the natural maps' aprons softened; v20 2026-10-21: thirty plates on the 227 world; v19 2026-10-15: the liquid maps' visible water; v18 2026-10-14: water only where the world draws it; v17 2026-10-05: the map-revival lane's plates (Suzhou Creek); v16 2026-10-03: maps lane B's gauntlet wave 28 plates (maps lane A's twenty on the merged head: v15; lane B's gauntlet wave 11: v14; batches 7 and 8: v13; batches 5 and 6: v12; batch 1's four: v11; the pilot's three: v10; round 48: v9)
for (const mapId of MAP_IDS) {
  const revision = MINIMAP_RASTER_REVISION;
  assert.equal(minimapAssetUrl(mapId), `/minimaps/${mapId}.webp?v=${revision}`,
    'a refreshed raster invalidates its previous browser cache entry');
  assert.equal(minimapAssetUrl(mapId, '/game/'), `/game/minimaps/${mapId}.webp?v=${revision}`);
  assert.equal(minimapAssetUrl(mapId, '/game/', 'capture-fixture'),
    `/game/minimaps/${mapId}.webp?v=capture-fixture`, 'explicit capture/test overrides remain honored');
}
assert.equal(minimapAssetUrl('test/map name', ''), '/minimaps/test%2Fmap%20name.webp?v=north-up-v21-apron-paint');

// Exercise the actual nested canvas painters without creating the full HUD,
// WebGL, DOM, or a second copy of their presentation policy.
function hudPainter(name, nextName, bindings) {
  const begin = hudSource.indexOf(`  function ${name}(`);
  const end = hudSource.indexOf(`  function ${nextName}(`, begin);
  assert.ok(begin >= 0 && end > begin, `${name}: HUD implementation remains discoverable`);
  const javascript = stripTypeScriptTypes(hudSource.slice(begin, end));
  return new Function(...Object.keys(bindings), `${javascript}\nreturn ${name};`)(...Object.values(bindings));
}

const worldSize = 1024, mapSize = 220;
const painterPoint = [0, 0];
const worldToMap = (x, z) => projectWorldToMinimap(x, z, worldSize, mapSize, painterPoint);
const fillPatches = hudPainter('fillMinimapPatches', 'mixedForestFill', { SHORELINE_SEGMENTS, shorelineRadiusAt, worldToMap });
/** A 2D context that keeps every filled compound path with the fill style it was painted in. */
function recordingContext() {
  const fills = [];
  let paths = [];
  const context = {
    fillStyle: '',
    beginPath() { paths = []; },
    moveTo(x, y) { paths.push([[x, y]]); },
    lineTo(x, y) { paths.at(-1).push([x, y]); },
    closePath() { paths.at(-1).closed = true; },
    fill(rule) { assert.ok(rule === undefined || rule === 'nonzero'); fills.push({ style: context.fillStyle, paths }); },
    stroke() { assert.fail('construction lobes must not create internal bank seams'); },
    arc() { assert.fail('fallback water cannot return to circular minimap discs'); },
  };
  return { context, fills };
}
const shorelines = [];
const paintWaterLayers = hudPainter('paintMinimapWaterLayers', 'buildMinimapBg', {
  fillMinimapPatches: fillPatches,
  paintMinimapShorelines: (context, patches, keyline, rim) => { if (patches?.length) shorelines.push({ patches, keyline, rim }); },
  // (phase 2: a world's visible-water raster paints instead of the liquid discs; its axes are minimapLiquidWater's)
  paintVisibleWater: () => assert.fail('no raster handed over here: the liquid discs are the fallback water'),
  MINIMAP_WATERLINE_RIM: 'rgb(204,234,240)',
});
const palette = { water: '#345', waterStroke: '#123', bog: '#654', bogStroke: '#321', ice: '#9bd', iceStroke: '#68a' };
const expectContour = (label, patch, vertices) => {
  assert.equal(vertices.length, SHORELINE_SEGMENTS, `${label}: bank tessellation remains bounded`);
  assert.ok(vertices.closed, `${label}: every irregular bank is a closed polygon`);
  for (let vertex = 0; vertex < SHORELINE_SEGMENTS; vertex++) {
    const angle = vertex / SHORELINE_SEGMENTS * Math.PI * 2;
    const radius = shorelineRadiusAt(patch, angle);
    const expected = projectWorldToMinimap(patch.x + Math.cos(angle) * radius,
      patch.z + Math.sin(angle) * radius, worldSize, mapSize);
    assert.deepEqual(vertices[vertex], expected, `${label}: contour agrees with terrain and marker handedness`);
  }
};

// An asymmetric liquid lake (2026-10-14): a long cape to world +X and +Z, short coves to -X and -Z. Painted as water
// through the composer, the long +X cape reaches map-left and the long +Z cape map-up, with the waterline rim.
{
  // sixteen stations from east (+X) winding toward +Z: station 4 is +Z, 8 is -X, 12 is -Z
  const lake = { x: 120, z: -80, r: 60, radii: [1, .95, .9, .92, 1, .9, .8, .6, .4, .42, .48, .52, .5, .6, .75, .9] };
  const { context, fills } = recordingContext();
  shorelines.length = 0;
  paintWaterLayers(context, { liquidPatches: [lake], softPatches: [], iceLake: false }, palette);
  assert.deepEqual(fills.map((f) => [f.style, f.paths.length]), [[palette.water, 1]], 'the liquid lake is the one water fill');
  const ring = fills[0].paths[0];
  expectContour('asymmetric lake', lake, ring);
  const center = projectWorldToMinimap(lake.x, lake.z, worldSize, mapSize);
  const xs = ring.map(([x]) => x), ys = ring.map(([, y]) => y);
  assert.ok(center[0] - Math.min(...xs) > 1.6 * (Math.max(...xs) - center[0]),
    'the long world +X cape reaches map-left, the short -X cove map-right');
  assert.ok(center[1] - Math.min(...ys) > 1.5 * (Math.max(...ys) - center[1]),
    'the long world +Z cape reaches map-up, the short -Z cove map-down');
  assert.equal(Math.min(...xs), ring[0][0], 'the +X station is the leftmost bank');
  assert.deepEqual(shorelines.map((s) => [s.keyline, s.rim]), [[palette.waterStroke, 'rgb(204,234,240)']],
    'liquid water carries the keyline and the pale waterline rim');
}

// Every battlefield: every disc's fallback contour agrees with the terrain and the markers, and on a map without a
// liquid sheet (terrain.ts liquidWater: splat.seaLake without frozen marshes; its water mask is 0 everywhere, so the
// world's split puts every disc in softPatches) every disc is painted in the soft style — bog, salt or clay ground, ice
// on an iceLake map — with no water fill and no waterline rim.
let testedPatches = 0, dryPatches = 0;
for (const mapId of MAP_IDS) {
  const config = getMapConfig(mapId);
  const layout = createLayout(config);
  const patches = [...layout.marshes, ...layout.lakes];
  const plain = recordingContext();
  fillPatches(plain.context, patches, palette.water);
  assert.equal(plain.fills.length, patches.length ? 1 : 0, `${mapId}: a patch class is a single compound path, painted once at uniform opacity`);
  const paths = plain.fills[0]?.paths ?? [];
  assert.equal(paths.length, patches.length, `${mapId}: every fallback patch is painted`);
  for (let patchIndex = 0; patchIndex < patches.length; patchIndex++) {
    expectContour(mapId, patches[patchIndex], paths[patchIndex]);
    testedPatches++;
  }
  if (!patches.length || (config.splat?.seaLake && !layout.terrain.frozenMarshes)) continue;
  const iceLake = !!config.splat?.iceLake;
  const split = splitMinimapWater(patches, () => 0);
  const layers = recordingContext();
  shorelines.length = 0;
  paintWaterLayers(layers.context, { liquidPatches: [...split.liquid], softPatches: [...split.soft], iceLake }, palette);
  const dryFill = iceLake ? palette.ice : palette.bog, dryKeyline = iceLake ? palette.iceStroke : palette.bogStroke;
  assert.deepEqual(layers.fills.map((f) => [f.style, f.paths.length]), [[dryFill, patches.length]],
    `${mapId}: every dry disc is painted in the ${iceLake ? 'ice' : 'soft-ground'} style and none as water`);
  assert.deepEqual(shorelines.map((s) => [s.keyline, s.rim, s.patches.length]), [[dryKeyline, null, patches.length]],
    `${mapId}: dry discs keep a ground-toned keyline and no waterline rim`);
  dryPatches += patches.length;
}
assert.ok(testedPatches > 0, 'the all-map fallback test actually covers authored shorelines');
assert.ok(dryPatches >= 20, 'the dry-disc rule covers the authored bogs (Kestrel Airfield alone has twenty)');

// Owner rule (2026-09-25): minimap markers may overlap. No jitter or separation
// pass moves co-located markers apart (the r5/r7 relax-to-13.5 px pass and the
// per-id jitter made them wiggle around each other); each arrow keeps its own
// hull heading and every objective glyph stays upright.
assert.doesNotMatch(hudSource, /relaxMinimapBlip|blipJitter|minSeparation/,
  'no pass nudges co-located minimap markers apart');
const glyphSource = await readFile(new URL('./objectiveGlyphs.ts', import.meta.url), 'utf8');
assert.doesNotMatch(glyphSource, /\.rotate\(/, 'objective glyphs never rotate the context: they stay upright');
{
  const pool = [];
  const pushLiveBlip = (x, y, yaw, fill, s, a, fixed) => pool.push({ x, y, yaw, fill, s, a, fixed });
  const blipPainter = (playerRef) => hudPainter('pushTankMinimapBlip', 'collectMinimapTankBlips', {
    worldToMap: (x, z) => projectWorldToMinimap(x, z, worldSize, mapSize, painterPoint),
    pushLiveBlip, spotById: new Map([['enemy', { vis: true, ever: true }]]),
    PEN_GREEN: '#7ee87e', PEN_RED: '#f05a5a', playerRef,
    drawGhostMarker() { assert.fail('a spotted enemy is a live arrow, not a ghost'); }, mmCtx: {},
  });
  const pushTankBlip = blipPainter({ id: 'me', team: 'player' });
  const stacked = { pos: { x: 100, z: -40 } };
  pushTankBlip({ id: 'ally-1', team: 'player' }, { ...stacked, yaw: 0.4 });
  pushTankBlip({ id: 'ally-2', team: 'player' }, { ...stacked, yaw: 2.9 });
  pushTankBlip({ id: 'enemy', team: 'enemy' }, { ...stacked, yaw: -1.2 });
  const expected = projectWorldToMinimap(100, -40, worldSize, mapSize);
  assert.deepEqual(pool.map((blip) => [blip.x, blip.y]), [expected, expected, expected],
    'co-located tanks put their arrows on exactly the same projected point (they overlap)');
  assert.deepEqual(pool.map((blip) => blip.yaw), [0.4, 2.9, -1.2], 'each arrow keeps its own hull heading');
  assert.deepEqual(pool.map((blip) => blip.fill), ['#7ee87e', '#7ee87e', '#f05a5a']);
  // Infected turns a player to the other side: allies are whoever shares the player's team now.
  const converted = blipPainter({ id: 'me', team: 'enemy' });
  const before = pool.length;
  converted({ id: 'infected-ally', team: 'enemy' }, { ...stacked, yaw: 0 });
  converted({ id: 'survivor', team: 'player' }, { ...stacked, yaw: 0 });
  assert.deepEqual(pool.slice(before).map((blip) => blip.fill), ['#7ee87e'],
    'after conversion the infected side is green and an unspotted survivor is not drawn');
  pool.length = before;

  // the painter draws every pooled arrow where it was pushed (frame clamp only), player last
  const drawn = [];
  const paint = hudPainter('paintMinimapBlips', 'drawMinimap', {
    _liveBlipPool: [...pool, { x: expected[0], y: expected[1], yaw: 1.1, fill: '#f2f8ff', s: 6.6, a: 1, fixed: true }],
    _liveBlipCount: pool.length + 1, MM: mapSize, mmCtx: {},
    drawArrowBlip: (c, x, y, yaw, fill) => drawn.push([x, y, yaw, fill]),
  });
  paint();
  assert.deepEqual(drawn.map(([x, y]) => [x, y]), [expected, expected, expected, expected],
    'overlapping arrows are painted on the same point without a separation pass');
  assert.deepEqual(drawn.map(([, , yaw]) => yaw), [0.4, 2.9, -1.2, 1.1], 'painted arrows keep their headings');
  assert.equal(drawn.at(-1)[3], '#f2f8ff', 'the player arrow is painted last, on top');
}
{
  // the arrow itself rotates with its tank's yaw
  const ops = [];
  const context = new Proxy({}, {
    get: (target, key) => (key in target ? target[key] : (...args) => { ops.push([key, args]); }),
    set: (target, key, value) => { target[key] = value; return true; },
  });
  const drawArrowBlip = hudPainter('drawArrowBlip', 'pushLiveBlip', { minimapYawForHeading });
  drawArrowBlip(context, 40, 50, -Math.PI / 2, '#7ee87e', 5, 0.95);
  assert.deepEqual(ops.slice(0, 3), [['save', []], ['translate', [40, 50]], ['rotate', [minimapYawForHeading(-Math.PI / 2)]]],
    'an arrow translates to its point and rotates to its own hull heading before its nose is drawn');
  assert.ok(ops.some(([op]) => op === 'moveTo') && ops.at(-1)[0] === 'restore', 'the arrow path is drawn inside the rotated frame');
}
{
  // objective markers: co-located markers draw at one exact point and the
  // context is never rotated for them
  const context = new Proxy({}, {
    get: (target, key) => {
      if (key in target) return target[key];
      if (key === 'rotate') return () => assert.fail('objective glyphs stay upright: the minimap never rotates the context for them');
      return () => {};
    },
    set: (target, key, value) => { target[key] = value; return true; },
  });
  const placed = [];
  const drawObjectives = hudPainter('drawMinimapObjectives', 'drawDestroyedMinimapTank', {
    worldToMap: (x, z) => projectWorldToMinimap(x, z, worldSize, mapSize, painterPoint),
    MM: mapSize, mmCtx: context, FONT_COND: 'sans-serif',
    sideColor: () => '#fff', sideFill: () => '#000', OBJECTIVE_PALETTE: { keyline: '#000' },
    drawSpawnGlyph: (c, x, y) => placed.push(['spawn', x, y]),
    drawHexBadge: (c, x, y) => placed.push(['badge', x, y]),
    drawGoalGlyph: (c, x, y) => placed.push(['goal', x, y]),
    drawBallGlyph: (c, x, y) => placed.push(['ball', x, y]),
    drawPickupGlyph: (c, x, y) => placed.push(['pickup', x, y]),
    drawPennant: (c, x, y) => placed.push(['pennant', x, y]),
    drawProgressArc() {}, drawCheck() {},
  });
  drawObjectives([
    { kind: 'spawn', x: 100, z: -40, side: 'own', status: 'active' },
    { kind: 'zone', x: 100, z: -40, side: 'neutral', label: 'A', status: 'active' },
    { kind: 'goal', x: 100, z: -40, side: 'enemy' },
  ], 1.5, 999, 999, false);
  const expected = projectWorldToMinimap(100, -40, worldSize, mapSize);
  assert.deepEqual(placed, [['spawn', ...expected], ['badge', ...expected], ['goal', ...expected]],
    'co-located objective glyphs share one exact point instead of being spread apart');
}

const paintTerrain = hudPainter('paintProceduralMinimapTerrain', 'fillMinimapPatches', {
  mapWorldSize: worldSize,
});
const sampledGround = [];
paintTerrain({
  createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
  putImageData() {},
}, {
  minY: 0, maxY: 1,
  getHeightAt() { return 0; },
  getGroundType(x, z) { sampledGround.push([x, z]); return x > 0 ? 'hard' : 'soft'; },
}, { hard: [80, 80, 80], soft: [40, 40, 40], base: [60, 60, 60] }, 4);
for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) {
  const projected = projectWorldToMinimap(...sampledGround[row * 4 + column], worldSize, 4);
  assert.deepEqual(projected, [column + 0.5, row + 0.5],
    'procedural ground samples invert the marker projection at exact pixel centers');
}

console.log('minimapOrientation.selftest: fixed north-up raster and live overlays passed');
console.log(`minimapOrientation.selftest: ${MAP_IDS.length} fallback maps, ${testedPatches} irregular banks (${dryPatches} dry, painted as ground or ice) and terrain sampling agree`);
