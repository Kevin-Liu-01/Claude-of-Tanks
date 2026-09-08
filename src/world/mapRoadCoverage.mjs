// CPU test helper only: coverage is relative to the two deployment regions,
// not a fixed world axis. This measures extent, not graph connectivity.
import assert from 'node:assert/strict';

export function deploymentRoadCoverage(routes, spawns) {
  assert.ok(Array.isArray(routes) && routes.length > 0, 'authored routes required');
  assert.ok(spawns?.player && Array.isArray(spawns.enemies) && spawns.enemies.length > 0,
    'both deployment regions are required');
  const pads = [spawns.player, ...spawns.enemies];
  for (const pad of pads) assert.ok(Number.isFinite(pad.x) && Number.isFinite(pad.z),
    'finite deployment coordinates');
  const enemy = spawns.enemies.reduce((out, pad) => ({ x: out.x + pad.x, z: out.z + pad.z }), { x: 0, z: 0 });
  enemy.x /= spawns.enemies.length; enemy.z /= spawns.enemies.length;
  const dx = enemy.x - spawns.player.x, dz = enemy.z - spawns.player.z;
  const separationM = Math.hypot(dx, dz);
  assert.ok(Number.isFinite(separationM) && separationM > 1e-6, 'distinct deployment regions');
  const forward = [dx / separationM, dz / separationM], right = [forward[1], -forward[0]];
  let minimumForwardM = Infinity, maximumForwardM = -Infinity;
  let minimumRightM = Infinity, maximumRightM = -Infinity, nodes = 0, segments = 0;
  for (const route of routes) {
    assert.ok(Array.isArray(route) && route.length >= 2, 'every road has actual segments');
    nodes += route.length; segments += route.length - 1;
    for (const point of route) {
      assert.ok(Array.isArray(point) && point.length === 2 && point.every(Number.isFinite),
        'complete finite road coordinates');
      const x = point[0] - spawns.player.x, z = point[1] - spawns.player.z;
      const longitudinalM = x * forward[0] + z * forward[1], lateralM = x * right[0] + z * right[1];
      minimumForwardM = Math.min(minimumForwardM, longitudinalM); maximumForwardM = Math.max(maximumForwardM, longitudinalM);
      minimumRightM = Math.min(minimumRightM, lateralM); maximumRightM = Math.max(maximumRightM, lateralM);
    }
  }
  const longitudinalM = maximumForwardM - minimumForwardM, lateralM = maximumRightM - minimumRightM;
  assert.ok(Number.isFinite(longitudinalM) && Number.isFinite(lateralM), 'finite projected road spans');
  return { longitudinalM, lateralM, nodes, segments, paths: routes.length,
    separationM, forward, right, player: { ...spawns.player }, enemyCentroid: enemy };
}

export function assertDeploymentRoadCoverage(routes, spawns, longitudinalFloorM, lateralFloorM, label) {
  assert.ok(Number.isFinite(longitudinalFloorM) && longitudinalFloorM > 0
    && Number.isFinite(lateralFloorM) && lateralFloorM > 0, 'positive finite coverage floors');
  const measured = deploymentRoadCoverage(routes, spawns);
  // Only compensate for floating-point error in rigid rotations, not metres
  // of missing route coverage or a changed authored support tolerance.
  assert.ok(measured.longitudinalM + 1e-6 >= longitudinalFloorM,
    `${label}: deployment-axis span ${measured.longitudinalM} >= ${longitudinalFloorM}`);
  assert.ok(measured.lateralM + 1e-6 >= lateralFloorM,
    `${label}: lateral flank span ${measured.lateralM} >= ${lateralFloorM}`);
  return measured;
}
