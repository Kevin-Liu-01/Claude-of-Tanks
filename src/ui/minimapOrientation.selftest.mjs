import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { MAP_IDS, getMapConfig } from '../world/maps/index.ts';
import { createLayout } from '../world/terrain.ts';
import { SHORELINE_SEGMENTS, shorelineRadiusAt } from '../world/shoreline.ts';
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
assert.equal(MINIMAP_RASTER_REVISION, 'north-up-v9-tactical'); // round 48: one bump for the three redesigned plates
for (const mapId of MAP_IDS) {
  const revision = MINIMAP_RASTER_REVISION;
  assert.equal(minimapAssetUrl(mapId), `/minimaps/${mapId}.webp?v=${revision}`,
    'a refreshed raster invalidates its previous browser cache entry');
  assert.equal(minimapAssetUrl(mapId, '/game/'), `/game/minimaps/${mapId}.webp?v=${revision}`);
  assert.equal(minimapAssetUrl(mapId, '/game/', 'capture-fixture'),
    `/game/minimaps/${mapId}.webp?v=capture-fixture`, 'explicit capture/test overrides remain honored');
}
assert.equal(minimapAssetUrl('test/map name', ''), '/minimaps/test%2Fmap%20name.webp?v=north-up-v9-tactical');

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
const paintWater = hudPainter('paintMinimapWater', 'mixedForestFill', {
  SHORELINE_SEGMENTS,
  shorelineRadiusAt,
  worldToMap: (x, z) => projectWorldToMinimap(x, z, worldSize, mapSize, painterPoint),
});
let testedPatches = 0;
for (const mapId of MAP_IDS) {
  const layout = createLayout(getMapConfig(mapId));
  const patches = [...layout.marshes, ...layout.lakes];
  const paths = [];
  let closed = 0, fills = 0, begins = 0;
  const context = {
    beginPath() { begins++; },
    moveTo(x, y) { paths.push([[x, y]]); },
    lineTo(x, y) { paths.at(-1).push([x, y]); },
    closePath() { closed++; },
    fill(rule) { assert.ok(rule === undefined || rule === 'nonzero'); fills++; },
    stroke() { assert.fail('construction lobes must not create internal bank seams'); },
    arc() { assert.fail('fallback water cannot return to circular minimap discs'); },
  };
  paintWater(context, patches, { water: '#345', waterStroke: '#123' });
  assert.equal(begins, patches.length ? 1 : 0, `${mapId}: water is a single compound path`);
  assert.equal(fills, patches.length ? 1 : 0, `${mapId}: overlapping water is painted once at uniform opacity`);
  assert.equal(paths.length, patches.length, `${mapId}: every fallback water patch is painted`);
  assert.equal(closed, patches.length, `${mapId}: every irregular bank is a closed polygon`);
  for (let patchIndex = 0; patchIndex < patches.length; patchIndex++) {
    const patch = patches[patchIndex], vertices = paths[patchIndex];
    assert.equal(vertices.length, SHORELINE_SEGMENTS, 'bank tessellation remains bounded');
    const center = projectWorldToMinimap(patch.x, patch.z, worldSize, mapSize);
    assert.ok(vertices[0][0] < center[0], `${mapId}: the world +X cape appears map-left`);
    assert.ok(vertices[SHORELINE_SEGMENTS / 4][1] < center[1], `${mapId}: the world +Z cape appears map-up`);
    for (let vertex = 0; vertex < SHORELINE_SEGMENTS; vertex++) {
      const angle = vertex / SHORELINE_SEGMENTS * Math.PI * 2;
      const radius = shorelineRadiusAt(patch, angle);
      const expected = projectWorldToMinimap(patch.x + Math.cos(angle) * radius,
        patch.z + Math.sin(angle) * radius, worldSize, mapSize);
      assert.deepEqual(vertices[vertex], expected, `${mapId}: contour agrees with terrain and marker handedness`);
    }
    testedPatches++;
  }
}
assert.ok(testedPatches > 0, 'the all-map fallback test actually covers authored shorelines');

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
  const pushTankBlip = hudPainter('pushTankMinimapBlip', 'collectMinimapTankBlips', {
    worldToMap: (x, z) => projectWorldToMinimap(x, z, worldSize, mapSize, painterPoint),
    pushLiveBlip, spotById: new Map([['enemy', { vis: true, ever: true }]]),
    PEN_GREEN: '#7ee87e', PEN_RED: '#f05a5a',
    drawGhostMarker() { assert.fail('a spotted enemy is a live arrow, not a ghost'); }, mmCtx: {},
  });
  const stacked = { pos: { x: 100, z: -40 } };
  pushTankBlip({ id: 'ally-1', team: 'player' }, { ...stacked, yaw: 0.4 });
  pushTankBlip({ id: 'ally-2', team: 'player' }, { ...stacked, yaw: 2.9 });
  pushTankBlip({ id: 'enemy', team: 'enemy' }, { ...stacked, yaw: -1.2 });
  const expected = projectWorldToMinimap(100, -40, worldSize, mapSize);
  assert.deepEqual(pool.map((blip) => [blip.x, blip.y]), [expected, expected, expected],
    'co-located tanks put their arrows on exactly the same projected point (they overlap)');
  assert.deepEqual(pool.map((blip) => blip.yaw), [0.4, 2.9, -1.2], 'each arrow keeps its own hull heading');
  assert.deepEqual(pool.map((blip) => blip.fill), ['#7ee87e', '#7ee87e', '#f05a5a']);

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

const paintTerrain = hudPainter('paintProceduralMinimapTerrain', 'paintMinimapWater', {
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
console.log(`minimapOrientation.selftest: ${MAP_IDS.length} fallback maps, ${testedPatches} irregular banks and terrain sampling agree`);
