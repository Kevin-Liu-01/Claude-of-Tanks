import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
assert.match(worldActivationSource,
  /minimapAssetVersion \|\| 'north-up-v5'/,
  'the corrected current-world raster bypasses stale heading-up browser caches');

console.log('minimapOrientation.selftest: fixed north-up raster and live overlays passed');
