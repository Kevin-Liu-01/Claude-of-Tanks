import assert from 'node:assert/strict';
import {
  PLAYABLE_HALF_EXTENT_M,
  TERRAIN_HALF_EXTENT_M,
  pushHullInsidePlayableBounds,
} from './battlefieldBounds.ts';

assert.ok(PLAYABLE_HALF_EXTENT_M < TERRAIN_HALF_EXTENT_M,
  'playable ground and rendered terrain retain a separate visual safety apron');

function resolve(centerX, centerZ, yaw, halfLength = 4.1, halfWidth = 1.8) {
  const forwardX = Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  const rightX = forwardZ;
  const rightZ = -forwardX;
  const push = { x: 0, z: 0 };
  const hit = pushHullInsidePlayableBounds(
    centerX, centerZ, forwardX, forwardZ, rightX, rightZ,
    halfLength, halfWidth, push,
  );
  const finalX = centerX + push.x;
  const finalZ = centerZ + push.z;
  const extentX = Math.abs(forwardX) * halfLength + Math.abs(rightX) * halfWidth;
  const extentZ = Math.abs(forwardZ) * halfLength + Math.abs(rightZ) * halfWidth;
  assert.ok(Math.abs(finalX) + extentX <= PLAYABLE_HALF_EXTENT_M + 1e-9,
    'resolved full hull stays inside the east/west playable edge');
  assert.ok(Math.abs(finalZ) + extentZ <= PLAYABLE_HALF_EXTENT_M + 1e-9,
    'resolved full hull stays inside the north/south playable edge');
  return { hit, push };
}

assert.equal(resolve(0, 0, 0).hit, false, 'interior tank receives no phantom boundary push');
for (const yaw of [0, Math.PI / 4, Math.PI / 2, -Math.PI / 3]) {
  for (const [x, z] of [[480, 0], [-480, 0], [0, 480], [0, -480], [480, 480]]) {
    const resolved = resolve(x, z, yaw);
    assert.equal(resolved.hit, true, `out-of-bounds hull resolves at yaw ${yaw}`);
    assert.ok(Math.hypot(resolved.push.x, resolved.push.z) > 0,
      'boundary contact returns a minimum translation');
  }
}

const accumulated = { x: 2, z: -3 };
pushHullInsidePlayableBounds(480, -480, 0, 1, 1, 0, 4, 2, accumulated);
assert.notDeepEqual(accumulated, { x: 2, z: -3 },
  'boundary correction composes with existing obstacle pushes');

console.log('battlefieldBounds.selftest: complete oriented hull stays within the visual apron');
