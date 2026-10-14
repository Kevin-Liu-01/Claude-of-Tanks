import assert from 'node:assert/strict';
import { createTank } from '../src/vehicles/tankFactory.ts';
import { isOpenLatticeMesh } from './standard-continuity-policy.mjs';

const tank = createTank('leo2_revolution', null, { proceduralOnly: true, geometryReceipt: true });
try {
  const lattice = [], suit = [];
  // 2026-10-12 (cam-netting): the Revolution's field suit (the owner's 10-10 order, ghillieFleetSuits.ts) is open
  // lattice too: its four alpha-cut meshes, each marked fieldSuit and non-armour; the cage stays the only equipment
  tank.root.traverse((object) => { if (isOpenLatticeMesh(object)) (/_ghillie_/.test(object.name) ? suit : lattice).push(object); });
  assert.deepEqual(lattice.map((object) => object.name).sort(), ['hullOpenLattice', 'hullOpenLatticeDark'],
    'only the separately owned cage bars and supports carry the open-lattice role');
  assert.deepEqual(suit.map((object) => object.name).sort(), ['hull_leaves', 'hull_net', 'turret_leaves', 'turret_net']
    .map((part) => `leo2_revolution_ghillie_${part}`), 'the field suit is the only other open lattice');
  for (const object of suit) {
    assert.equal(object.userData.fieldSuit, true, `${object.name} is the field suit`);
    assert.equal(object.userData.combatHitboxRole, 'nonArmor', `${object.name} is no armour`);
  }
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
