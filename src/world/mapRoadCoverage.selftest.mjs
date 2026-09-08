import assert from 'node:assert/strict';
import { assertDeploymentRoadCoverage, deploymentRoadCoverage } from './mapRoadCoverage.mjs';

const fixture = (length = 880, width = 580) => ({
  routes: [[[-width / 2, -length / 2], [-width / 2, length / 2]], [[width / 2, -length / 2], [width / 2, length / 2]]],
  spawns: { player: { x: 0, z: -400 }, enemies: [{ x: -50, z: 400 }, { x: 50, z: 400 }] },
});
function rotate(input, angle, tx = 0, tz = 0) {
  const point = ([x, z]) => [x * Math.cos(angle) + z * Math.sin(angle) + tx, -x * Math.sin(angle) + z * Math.cos(angle) + tz];
  const pad = ({ x, z }) => { const [px, pz] = point([x, z]); return { x: px, z: pz }; };
  return { routes: input.routes.map(path => path.map(point)), spawns: {
    player: pad(input.spawns.player), enemies: input.spawns.enemies.map(pad) } };
}
const base = fixture();
for (const angle of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 7, Math.PI]) {
  const input = rotate(base, angle, 17, -31), measured = assertDeploymentRoadCoverage(input.routes, input.spawns, 880, 580, 'rigid transform');
  assert.ok(Math.abs(measured.longitudinalM - 880) < 1e-6 && Math.abs(measured.lateralM - 580) < 1e-6);
  assert.equal(measured.nodes, 4); assert.equal(measured.segments, 2);
}
for (const [length, width, longitudinalFloor] of [[819, 580, 820], [879, 580, 880], [880, 579, 880], [880, 0, 880]]) {
  const input = rotate(fixture(length, width), Math.PI / 4);
  assert.throws(() => assertDeploymentRoadCoverage(input.routes, input.spawns, longitudinalFloor, 580, 'insufficient extent'));
}
for (const mutate of [
  f => { f.routes[0][0][0] = NaN; }, f => { f.routes[0][0][1] = Infinity; },
  f => { f.routes[0] = []; }, f => { f.spawns.enemies = []; },
  f => { f.spawns.player.x = NaN; }, f => { f.spawns.enemies = [{ ...f.spawns.player }]; },
]) { const input = fixture(); mutate(input); assert.throws(() => deploymentRoadCoverage(input.routes, input.spawns)); }
assert.throws(() => assertDeploymentRoadCoverage(base.routes, base.spawns, NaN, 580, 'invalid floor'));
console.log('mapRoadCoverage: rigid rotation/translation preserves 880/580; 819/879/579 and malformed controls rejected');
