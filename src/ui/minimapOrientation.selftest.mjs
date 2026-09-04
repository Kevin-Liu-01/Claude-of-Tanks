import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  MINIMAP_NORTH_UP,
  minimapRotationForHeading,
  normalizeMinimapAngle,
  orientMinimapDirection,
  orientMinimapPoint,
  orientMinimapYaw,
} from './minimapOrientation.ts';

assert.equal(minimapRotationForHeading(0), MINIMAP_NORTH_UP,
  'a north-facing vehicle keeps the authored map orientation');
assert.ok(Math.abs(minimapRotationForHeading(Math.PI / 12) + Math.PI / 12) < 1e-12,
  'an angled vehicle receives its exact inverse map rotation');
assert.equal(minimapRotationForHeading(Math.PI), -Math.PI,
  'a south-facing vehicle flips the tactical map once');
assert.equal(minimapRotationForHeading(Number.NaN), MINIMAP_NORTH_UP,
  'invalid presentation state fails closed to north-up');
assert.equal(normalizeMinimapAngle(Math.PI * 4), 0,
  'equivalent full turns normalize to the stable north-up identity');

const point = [0, 0];
assert.deepEqual(orientMinimapPoint(24, 46, 220, MINIMAP_NORTH_UP, point), [24, 46]);
assert.strictEqual(orientMinimapPoint(24, 46, 220, -Math.PI, point), point,
  'the hot-path point transform reuses caller-owned storage');
assert.ok(Math.abs(point[0] - 196) < 1e-9 && Math.abs(point[1] - 174) < 1e-9,
  'the flip rotates both axes around the map center');
assert.equal(orientMinimapYaw(Math.PI, -Math.PI), 0,
  'a south-facing far-side tank points screen-up after the map flip');

const angleError = (actual, expected) => Math.abs(normalizeMinimapAngle(actual - expected));
const verifyHeadingUp = (yaw, label) => {
  const rotation = minimapRotationForHeading(yaw);
  assert.ok(angleError(orientMinimapYaw(yaw, rotation), 0) < 1e-9,
    `${label}: current hull heading points screen-up`);

  const center = 110;
  const distance = 30;
  const forward = orientMinimapPoint(
    center + Math.sin(yaw) * distance,
    center - Math.cos(yaw) * distance,
    center * 2,
    rotation,
  );
  assert.ok(Math.abs(forward[0] - center) < 1e-8 && Math.abs(forward[1] - (center - distance)) < 1e-8,
    `${label}: a world point in front of the vehicle appears directly above it`);

  const right = orientMinimapPoint(
    center + Math.cos(yaw) * distance,
    center + Math.sin(yaw) * distance,
    center * 2,
    rotation,
  );
  assert.ok(Math.abs(right[0] - (center + distance)) < 1e-8 && Math.abs(right[1] - center) < 1e-8,
    `${label}: a world point to the vehicle's right appears on the right`);
  assert.ok(angleError(
    orientMinimapDirection(Math.sin(yaw), Math.cos(yaw), rotation),
    -Math.PI / 2,
  ) < 1e-9, `${label}: the camera wedge points screen-up when looking forward`);
  assert.ok(angleError(
    orientMinimapDirection(Math.cos(yaw), -Math.sin(yaw), rotation),
    0,
  ) < 1e-9, `${label}: the camera wedge points screen-right when looking right`);
};

// The map follows the live vehicle orientation through a full turn, including
// headings that could never be represented by the old spawn-only 0/180 flip.
for (const [yaw, label] of [
  [0, 'north'],
  [Math.PI / 12, 'north-northeast'],
  [Math.PI / 2, 'east'],
  [Math.PI, 'south'],
  [-Math.PI / 2, 'west'],
  [-Math.PI * 0.73, 'arbitrary live turn'],
]) {
  verifyHeadingUp(yaw, label);
}

const hudSource = await readFile(new URL('./hud.ts', import.meta.url), 'utf8');
const worldActivationSource = await readFile(
  new URL('../world/worldActivationRuntime.ts', import.meta.url), 'utf8',
);
assert.match(hudSource,
  /const playerYaw = frame\.player\?\.state\?\.yaw;[\s\S]{0,240}minimapRotationForHeading\(playerYaw\);[\s\S]{0,120}drawMinimap\(frame\)/,
  'every minimap repaint derives its orientation from the current player hull heading');
assert.doesNotMatch(hudSource, /minimapDeploymentYaw|minimapOrientationLocked/,
  'the old round-long deployment orientation lock is fully removed');
assert.match(hudSource,
  /mmBg = image;[\s\S]{0,120}drawMinimapBackground\(\)/,
  'production draws from the retained decoded image instead of a purge-prone iPad canvas copy');
assert.match(hudSource,
  /function drawMinimapBackground\([\s\S]{0,500}rotate\(minimapRotation\)[\s\S]{0,2500}drawMinimapChrome\(mmCtx\)/,
  'the background receives the same exact live rotation beneath upright grid chrome');
assert.match(worldActivationSource,
  /minimapAssetVersion \|\| 'heading-up-v3'/,
  'the chrome-free asset contract must bypass previously cached tactical maps');

console.log('minimapOrientation.selftest: ok');
