import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  MINIMAP_NORTH_UP,
  MINIMAP_SPAWN_FLIPPED,
  minimapRotationForSpawnYaw,
  orientMinimapPoint,
  orientMinimapYaw,
} from './minimapOrientation.js';

assert.equal(minimapRotationForSpawnYaw(0), MINIMAP_NORTH_UP,
  'the near-side north-facing spawn keeps the authored map orientation');
assert.equal(minimapRotationForSpawnYaw(Math.PI / 12), MINIMAP_NORTH_UP,
  'small authored spawn offsets do not rotate the tactical map diagonally');
assert.equal(minimapRotationForSpawnYaw(Math.PI), MINIMAP_SPAWN_FLIPPED,
  'the opposite-side south-facing spawn flips the tactical map once');
assert.equal(minimapRotationForSpawnYaw(Math.PI - Math.PI / 12), MINIMAP_SPAWN_FLIPPED,
  'angled far-side spawns still receive the stable half-turn');
assert.equal(minimapRotationForSpawnYaw(Number.NaN), MINIMAP_NORTH_UP,
  'invalid presentation state fails closed to north-up');

const point = [0, 0];
assert.deepEqual(orientMinimapPoint(24, 46, 220, MINIMAP_NORTH_UP, point), [24, 46]);
assert.strictEqual(orientMinimapPoint(24, 46, 220, MINIMAP_SPAWN_FLIPPED, point), point,
  'the hot-path point transform reuses caller-owned storage');
assert.deepEqual(point, [196, 174], 'the flip rotates both axes around the map center');
assert.equal(orientMinimapYaw(Math.PI, MINIMAP_SPAWN_FLIPPED), Math.PI * 2,
  'a south-facing far-side tank points screen-up after the map flip');

const hudSource = await readFile(new URL('./hud.js', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../main.js', import.meta.url), 'utf8');
assert.match(hudSource,
  /minimapRotation = minimapRotationForSpawnYaw\(frame\.player\.state\.yaw\)/,
  'orientation locks to the actual local spawn pose');
assert.match(hudSource,
  /mmBg = image;[\s\S]{0,120}drawMinimapBackground\(\)/,
  'production draws from the retained decoded image instead of a purge-prone iPad canvas copy');
assert.match(hudSource,
  /function drawMinimapBackground\([\s\S]{0,500}rotate\(Math\.PI\)[\s\S]{0,500}drawMinimapChrome\(mmCtx\)/,
  'the background flips beneath upright, orientation-aware grid chrome');
assert.match(mainSource, /MINIMAP_ASSET_VERSION = 'spawn-oriented-v2'/,
  'the chrome-free asset contract must bypass previously cached tactical maps');

console.log('minimapOrientation.selftest: ok');
