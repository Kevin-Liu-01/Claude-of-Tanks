import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.js';
import { getSpec } from '../specs.js';

for (const id of ['pl01', 'pl01_105']) {
  const spec = getSpec(id);
  assert.deepEqual(spec.armor.gunPivot, [0, 0.26, 1.45],
    `${id} gun datum must be raised and seated farther into the turret`);
  if (id === 'pl01_105') {
    assert.equal(spec.dims.silhouetteHeightM, 3.31,
      'PL-01 105 CROWS silhouette height must be explicit');
  }

  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });
  const hull = tank.root.getObjectByName('rig_hull');
  const turret = tank.root.getObjectByName('rig_turret');
  const gun = tank.root.getObjectByName('rig_gun');
  assert.deepEqual(gun.position.toArray(), spec.armor.gunPivot,
    `${id} rendered gun root must match its combat/anatomy datum`);

  const trackBands = [];
  tank.root.traverse((node) => {
    if (node.name === 'gearTrackBandL' || node.name === 'gearTrackBandR') {
      trackBands.push(node.name);
    }
  });
  assert.deepEqual(trackBands.sort(), ['gearTrackBandL', 'gearTrackBandR'],
    `${id} must retain exactly one linked track course per side`);

  const spareLinks = tank.root.getObjectByName('pl01_105_glacis_spare_links');
  const crows = tank.root.getObjectByName('pl01_105_crows_weapon');
  if (id === 'pl01_105') {
    assert.equal(hull.userData.pl01FrontGlacisPack,
      'seated-spare-links-and-camo-era',
      'PL-01 105 must carry the seated glacis protection pack');
    assert.ok(spareLinks && spareLinks.parent === hull,
      'PL-01 105 spare links must be attached to the fixed hull');
    assert.equal(turret.userData.pl01RemoteStation, 'forward-crows',
      'PL-01 105 must identify its forward CROWS station');
    assert.ok(crows && crows.parent === turret,
      'PL-01 105 CROWS weapon must traverse with the turret');
    assert.equal(crows.rotation.y, 0,
      'PL-01 105 CROWS must rest aimed forward');
  } else {
    assert.equal(spareLinks, undefined,
      'base PL-01 must not inherit the 105 glacis protection pack');
    assert.equal(crows, undefined,
      'base PL-01 keeps its original low-observable RWS');
  }
  tank.dispose();
}

console.log('pl01GunGlacisCrows.selftest: gun seating, 105 glacis pack, CROWS, and track uniqueness pass');
