import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MAP_IDS, getMapConfig } from '../world/maps/index.ts';
import { createLayout } from '../world/terrain.ts';
import {
  MINIMAP_NORTH_UP,
  minimapRotationForSpawnYaw,
  normalizeMinimapAngle,
  orientMinimapDirection,
  orientMinimapPoint,
  orientMinimapYaw,
} from './minimapOrientation.ts';

assert.equal(minimapRotationForSpawnYaw(0), MINIMAP_NORTH_UP,
  'the near-side north-facing spawn keeps the authored map orientation');
assert.ok(Math.abs(minimapRotationForSpawnYaw(Math.PI / 12) + Math.PI / 12) < 1e-12,
  'an angled deployment receives its exact inverse map rotation');
assert.equal(minimapRotationForSpawnYaw(Math.PI), -Math.PI,
  'the opposite-side south-facing spawn flips the tactical map once');
assert.equal(minimapRotationForSpawnYaw(Number.NaN), MINIMAP_NORTH_UP,
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
const verifyDeploymentUp = (yaw, label) => {
  const rotation = minimapRotationForSpawnYaw(yaw);
  assert.ok(angleError(orientMinimapYaw(yaw, rotation), 0) < 1e-9,
    `${label}: spawn hull points screen-up`);

  const center = 110;
  const distance = 30;
  const forward = orientMinimapPoint(
    center + Math.sin(yaw) * distance,
    center - Math.cos(yaw) * distance,
    center * 2,
    rotation,
  );
  assert.ok(Math.abs(forward[0] - center) < 1e-8 && Math.abs(forward[1] - (center - distance)) < 1e-8,
    `${label}: a world point in front of the spawn appears directly above it`);

  const right = orientMinimapPoint(
    center + Math.cos(yaw) * distance,
    center + Math.sin(yaw) * distance,
    center * 2,
    rotation,
  );
  assert.ok(Math.abs(right[0] - (center + distance)) < 1e-8 && Math.abs(right[1] - center) < 1e-8,
    `${label}: a world point to the spawn's right appears on the right`);
  assert.ok(angleError(
    orientMinimapDirection(Math.sin(yaw), Math.cos(yaw), rotation),
    -Math.PI / 2,
  ) < 1e-9, `${label}: the camera wedge points screen-up when looking forward`);
  assert.ok(angleError(
    orientMinimapDirection(Math.cos(yaw), -Math.sin(yaw), rotation),
    0,
  ) < 1e-9, `${label}: the camera wedge points screen-right when looking right`);
};

// Use every canonical map's authored spawn centroids, then reverse the same
// deployment axis to model a local player assigned to the opposite team.
// This directly guards the private-room regression that a 0/180 smoke test
// could not detect.
for (const mapId of MAP_IDS) {
  const { spawns } = createLayout(getMapConfig(mapId));
  const enemyX = spawns.enemies.reduce((sum, spawn) => sum + spawn.x, 0) / spawns.enemies.length;
  const enemyZ = spawns.enemies.reduce((sum, spawn) => sum + spawn.z, 0) / spawns.enemies.length;
  const nearYaw = Math.atan2(enemyX - spawns.player.x, enemyZ - spawns.player.z);
  verifyDeploymentUp(nearYaw, `${mapId} near deployment`);
  verifyDeploymentUp(nearYaw + Math.PI, `${mapId} opposite deployment`);
}

const hudSource = await readFile(new URL('./hud.js', import.meta.url), 'utf8');
const worldActivationSource = await readFile(
  new URL('../world/worldActivationRuntime.ts', import.meta.url), 'utf8',
);
assert.match(hudSource,
  /minimapDeploymentYaw = Math\.atan2\(dx, dz\);[\s\S]{0,120}minimapRotationForSpawnYaw\(minimapDeploymentYaw\)/,
  'orientation locks to the complete local-to-opponent deployment axis');
assert.match(hudSource,
  /mmBg = image;[\s\S]{0,120}drawMinimapBackground\(\)/,
  'production draws from the retained decoded image instead of a purge-prone iPad canvas copy');
assert.match(hudSource,
  /function drawMinimapBackground\([\s\S]{0,500}rotate\(minimapRotation\)[\s\S]{0,2500}drawMinimapChrome\(mmCtx\)/,
  'the background receives the same exact rotation beneath upright grid chrome');
assert.match(worldActivationSource,
  /minimapAssetVersion \|\| 'spawn-oriented-v2'/,
  'the chrome-free asset contract must bypass previously cached tactical maps');

console.log('minimapOrientation.selftest: ok');
