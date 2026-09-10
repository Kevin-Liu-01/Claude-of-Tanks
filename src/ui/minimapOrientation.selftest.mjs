import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { MAP_IDS, getMapConfig } from '../world/maps/index.ts';
import { createLayout } from '../world/terrain.ts';
import { SHORELINE_SEGMENTS, shorelineRadiusAt } from '../world/shoreline.ts';
import { minimapAssetUrl } from './minimapAssetUrl.ts';
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
for (const mapId of MAP_IDS) {
  const revision = mapId === 'oasis' ? 'north-up-v7-oasis-shoreline-v2'
    : mapId === 'autumn' ? 'north-up-v7-autumn-headlands'
      : mapId === 'foundry' ? 'north-up-v7-foundry-service-court' : 'north-up-v7';
  assert.equal(minimapAssetUrl(mapId), `/minimaps/${mapId}.webp?v=${revision}`,
    'only explicitly refreshed rasters invalidate their previous browser cache entries');
  assert.equal(minimapAssetUrl(mapId, '/game/'), `/game/minimaps/${mapId}.webp?v=${revision}`);
  assert.equal(minimapAssetUrl(mapId, '/game/', 'capture-fixture'),
    `/game/minimaps/${mapId}.webp?v=capture-fixture`, 'explicit capture/test overrides remain honored');
}
assert.equal(minimapAssetUrl('test/map name', ''), '/minimaps/test%2Fmap%20name.webp?v=north-up-v7');

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
