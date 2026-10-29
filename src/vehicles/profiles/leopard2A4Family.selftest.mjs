// The 2A4-era Leopards on the release construction (release 264, owner 2026-10-28; docs/references/tanks/leo2a4-family.md):
// the native fixture their photographic packets name (docs/references/photos/<id>-20261029.json, Main 2026-10-29), at both
// qualities. The owner's even split (the square 2A4 block on the 2A4, the 2A4 V and the 2A4M CAN; the 2A6-look wedge on
// the 2A4M, the OTCO and the Improved), the L/44 every one carries (its 9.67 m gun forward of the Slovak MoD's 2A4
// sheet), the turret ring on the release hull's deck and the 2A4 turret's roof behind the hatches.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { ensureInteriorFills } from '../interiorFills.ts';
import { LEOPARD2_HULL } from '../leopard2HullDatums.ts';
import { LEOPARD2A4_FAMILY_FRONT, LEOPARD2A4_FAMILY_GUN } from '../leopard2A4FamilyArmor.ts';
import { KONTAKT1_ERA, LEO2A4V_KONTAKT1 } from '../leopard2A4Kontakt1.ts';
import { getSpec } from '../specs.ts';

/** Each id's front and gun, written out so a change to the shared tables fails here (the packets read these). */
const EXPECTED = [
  ['leo2a4', { front: 'block', gun: 'L44' }],
  ['leo2a4_v', { front: 'block', gun: 'L44' }],
  ['leo2a4m_can', { front: 'block', gun: 'L44' }],
  ['leo2a4m', { front: 'wedge', gun: 'L44' }],
  ['leo2a4_otco', { front: 'wedge', gun: 'L44' }],
  ['leo2_improved', { front: 'wedge', gun: 'L44' }],
];
/** Gun forward from the stern plate: the L/44's published 9.67 m (Slovak MoD, tanks-encyclopedia; as built 9.70). Every one
 *  of the six carries it (the OTCO and the Improved since the owner's ruling via Main, 2026-10-29). */
const GUN_FORWARD_M = { L44: 9.67 };
const STERN_Z = -3.80, ROOF_Y = 2.431;

const near = (actual, expected, label, tolerance) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual.toFixed(3)}, expected ${expected}`);
const box = (object) => new THREE.Box3().setFromObject(object);

assert.deepEqual(Object.keys(LEOPARD2A4_FAMILY_FRONT).sort(), EXPECTED.map(([id]) => id).sort(), 'the family is these six');
assert.equal(EXPECTED.filter(([, e]) => e.front === 'block').length, 3, 'the owner\'s even split: three square fronts');

const ids = EXPECTED.map(([id]) => id);
await ensureInteriorFills(ids);
for (const [id, expected] of EXPECTED) {
  assert.equal(LEOPARD2A4_FAMILY_FRONT[id], expected.front, `${id}: front`);
  assert.equal(LEOPARD2A4_FAMILY_GUN[id], expected.gun, `${id}: gun`);
  for (const quality of ['high', 'low']) {
    const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, quality, camoSeed: 4242 });
    try {
      tank.root.updateMatrixWorld(true);
      const named = (name) => {
        const object = tank.root.getObjectByName(name);
        assert.ok(object, `${id} ${quality}: ${name} exists`);
        return object;
      };
      named('rig_hull');
      const turretRig = named('rig_turret'), turret = named('turret'), gun = named('rig_gun');
      // the ring on the release hull's deck
      const ring = new THREE.Vector3().setFromMatrixPosition(turretRig.matrixWorld);
      near(ring.x, LEOPARD2_HULL.ring[0], `${id} ${quality} ring x`, 0.005);
      near(ring.z, LEOPARD2_HULL.ring[2], `${id} ${quality} ring z`, 0.005);
      // the square block's faces 1.65 m ahead of the ring; the wedge's tips over a metre further
      const front = box(turret).max.z;
      if (expected.front === 'block') assert.ok(front < 2.10, `${id} ${quality}: the square front at ${front.toFixed(2)} m`);
      else assert.ok(front > 3.0, `${id} ${quality}: the wedge's tips at ${front.toFixed(2)} m`);
      // the muzzle, gun forward from the stern plate
      near(box(gun).max.z - STERN_Z, GUN_FORWARD_M[expected.gun], `${id} ${quality} gun forward (${expected.gun})`, 0.035);
      // the 2A4 turret's roof straight down behind the hatches
      const roof = new THREE.Raycaster(new THREE.Vector3(0.10, 5, LEOPARD2_HULL.ring[2] - 1.20), new THREE.Vector3(0, -1, 0))
        .intersectObject(turret, false)[0];
      assert.ok(roof, `${id} ${quality}: the turret roof is closed behind the hatches`);
      near(roof.point.y, ROOF_Y, `${id} ${quality} turret roof`, 0.02);
    } finally {
      tank.dispose();
    }
  }
}
// leo2a4_v, the Ukrainian-service 2A4 under Kontakt-1 (release 265; the owner via Main, 2026-10-29): every course's ERA
// plate in its record with the Kontakt-1 values, on the cheeks, the walls and the fore skirts; the glacis bare
{
  const plates = [...getSpec('leo2a4_v').armor.hullPlates, ...getSpec('leo2a4_v').armor.turretPlates];
  for (const course of LEO2A4V_KONTAKT1) {
    const p = plates.find((q) => q.name === course.name);
    assert.ok(p, `leo2a4_v carries ${course.name}`);
    assert.equal(p.kind, 'era', `${course.name} is ERA`);
    assert.deepEqual(p.era, { ...KONTAKT1_ERA }, `${course.name} carries the Kontakt-1 values`);
  }
  const bricks = LEO2A4V_KONTAKT1.reduce((n, c) => n + c.seats.length, 0);
  assert.equal(bricks, 102, 'leo2a4_v: 102 containers (the service photographs\' courses)');
  assert.ok(!plates.some((q) => q.kind === 'era' && /glacis/.test(q.name)), 'leo2a4_v: the glacis stays bare');
}
console.log('leopard2A4Family: six ids, both qualities: the owner\'s split, the guns, the ring and the roof');
