import assert from 'node:assert/strict';
import { createTank } from '../src/vehicles/tankFactory.ts';
import { isOpenLatticeMesh } from './standard-continuity-policy.mjs';

const tank = createTank('leo2_revolution', null, { proceduralOnly: true, geometryReceipt: true });
try {
  const lattice = [];
  tank.root.traverse((object) => { if (isOpenLatticeMesh(object)) lattice.push(object); });
  assert.deepEqual(lattice.map((object) => object.name).sort(), ['hullOpenLattice', 'hullOpenLatticeDark'],
    'only the separately owned cage bars and supports carry the open-lattice role');
  for (const object of lattice) {
    assert.ok(object.visible && object.parent?.isLOD, 'lattice retains normal rendered equipment LOD ownership');
    assert.notEqual(object.material.colorWrite, false, 'lattice remains visible in the game and source comparison');
    assert.notEqual(object.userData.runningGear, true, 'lattice remains subject to strict track clearance');
  }
  for (const name of ['hull', 'hullDetail', 'hullDark', 'turret']) {
    assert.equal(isOpenLatticeMesh(tank.root.getObjectByName(name)), false, `${name} remains in continuity scan`);
  }
  assert.equal(isOpenLatticeMesh({isMesh:true,userData:{continuityRole:'open-lattice',combatHitboxRole:'armor'}}), false,
    'an accidental lattice tag cannot exempt structural armor');
} finally {
  tank.dispose();
}
console.log('standard-continuity-policy.selftest: separated cage equipment only; armor remains checked');
