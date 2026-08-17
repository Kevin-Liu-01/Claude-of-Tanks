import assert from 'node:assert/strict';
import { createUtilityNetwork } from './utilityNetwork.js';

const poles = [
  { x: 0, y: 0, z: 0, yaw: 0, attachH: 6.5 },
  { x: 0, y: 0.2, z: 32, yaw: 0.08, attachH: 6.5 },
  { x: 1, y: 0.4, z: 64, yaw: 0.12, attachH: 6.5 },
];
const net = createUtilityNetwork(poles, [[0, 1], [1, 2]]);
assert.equal(net.instanceCount, 64, 'two spans × two conductors × sixteen segments');

const intact = new Float64Array((net.segments + 1) * 3);
net.writeSpanPoints(0, 0, intact);
assert.ok(Math.abs(intact[1] - 6.5) < 1e-9, 'wire begins on the first crossarm');
assert.ok(intact[8 * 3 + 1] < Math.min(intact[1], intact[16 * 3 + 1]), 'intact span sags at midpoint');

const affected = net.setPoleFall(1, 0, -1, Math.PI * 0.46);
assert.deepEqual(affected, [0, 1], 'both spans adjacent to the pole are linked');
const fallen = new Float64Array(intact.length);
net.writeSpanPoints(0, 0, fallen);
assert.ok(fallen[16 * 3 + 1] < 2.0, 'falling crossarm drags its wire endpoint near the ground');
assert.ok(Math.abs(fallen[16 * 3] - intact[16 * 3]) > 4,
  'wire endpoint follows the pole tip laterally');

net.reset();
const restored = new Float64Array(intact.length);
net.writeSpanPoints(0, 0, restored);
assert.deepEqual([...restored], [...intact], 'rematch reset restores the original catenary');

console.log('utilityNetwork.selftest: linked fall, catenary, and reset passed');
