import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Box3 } from 'three';
import { createTank } from '../tankFactory.js';
import { getSpec } from '../specs.js';

const near = (actual, expected, epsilon = 1e-6) => Math.abs(actual - expected) <= epsilon;
const unchangedHullHashes = Object.freeze({
  pl01: '77bda060a9a0b2402601c0aea3cdf9e7e0f8f21f8236d72f68e733f1ae58af07',
  pl01_105: '1952002d5799c35c815bf3a16f3253a5fc8dc28d1105264d2f17b25f8d616aa0',
});

function geometryHash(group) {
  const hash = createHash('sha256');
  group.traverse((node) => {
    if (!node.isMesh) return;
    const positions = node.geometry.getAttribute('position');
    if (positions) {
      hash.update(Buffer.from(positions.array.buffer,
        positions.array.byteOffset, positions.array.byteLength));
    }
    node.updateMatrix();
    hash.update(node.matrix.toArray().join(','));
  });
  return hash.digest('hex');
}

for (const id of ['pl01', 'pl01_105']) {
  const spec = getSpec(id);
  assert.equal(spec.dims.heightM, 2.80,
    `${id} dossier must retain the published vehicle height`);
  assert.deepEqual(spec.armor.gunPivot, [0, 0.2592, 1.45],
    `${id} gun datum must follow the 20%-taller turret nose`);
  if (id === 'pl01_105') {
    assert.equal(spec.dims.silhouetteHeightM, 3.12,
      'PL-01 105 CROWS silhouette height must remain explicit');
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
  const turretShell = turret.getObjectByName('turret');
  const roofStowage = tank.root.getObjectByName('pl01_roof_stowage');
  const smokeLeft = tank.root.getObjectByName('pl01_smoke_bank_left');
  const smokeRight = tank.root.getObjectByName('pl01_smoke_bank_right');
  const cupola = turret.getObjectByName('turretCupola');

  const hullBounds = new Box3().setFromObject(hull);
  assert.deepEqual(
    [...hullBounds.min.toArray(), ...hullBounds.max.toArray()]
      .map((value) => Number(value.toFixed(6))),
    [-1.922, -0.087, -3.565, 1.922, 2.203312, 3.44],
    `${id} hull bounds must remain byte-for-byte geometrically unchanged`,
  );
  assert.equal(geometryHash(hull), unchangedHullHashes[id],
    `${id} hull meshes and transforms must remain untouched by the turret-only change`);
  assert.deepEqual(turret.position.toArray(), [0, 2.07, -0.90],
    `${id} turret ring must remain on its existing hull seat`);

  assert.deepEqual(gun.position.toArray(), spec.armor.gunPivot,
    `${id} rendered gun root must match its combat/anatomy datum`);
  assert.equal(turret.userData.pl01TurretHeightScale, 0.72,
    `${id} structural turret must be exactly 20% taller than its 0.60-scale predecessor`);
  assert.ok(near(turret.userData.pl01RoofLocalY, 0.5184),
    `${id} roof must rise by 20% while the turret ring stays fixed`);
  assert.ok(turretShell?.isMesh, `${id} must retain one merged structural turret shell`);
  const shellPositions = turretShell.geometry.getAttribute('position');
  let roofVertices = 0;
  for (let index = 0; index < shellPositions.count; index++) {
    if (near(shellPositions.getY(index), 0.5184, 0.001)) roofVertices += 1;
  }
  assert.ok(roofVertices >= 24,
    `${id} merged shell must retain a broad 0.5184 m roof plane`);
  const cupolaBounds = new Box3().setFromObject(cupola);
  assert.ok(near(cupolaBounds.min.y, 2.5884),
    `${id} structural cupolas must contact the raised roof without a gap`);
  assert.ok(roofStowage?.parent === turret && near(roofStowage.position.y, 0.5284),
    `${id} mission-bay rack must be seated on the rebuilt rear roof`);
  assert.ok(smokeLeft?.parent === turret && smokeRight?.parent === turret,
    `${id} both smoke banks must remain turret-owned`);
  assert.ok(near(smokeLeft.position.y, 0.5284) && near(smokeRight.position.y, 0.5284),
    `${id} smoke banks must share the rebuilt roof datum`);

  assert.deepEqual(hull.userData.pl01GlacisReceipt, {
    revision: 'raised-wedge-r2', upperProwY: 1.46, lowerProwY: 1.29,
    skirtProwY: 1.46, shoulderBridges: 2, aligned: true,
  }, `${id} upper, middle, and lower glacis must share the raised skirt datum`);
  assert.deepEqual(turret.userData.pl01RoofSuiteReceipt, {
    revision: 'low-profile-r4', turretHeightScale: 0.72, roofY: 0.5184,
    cupolas: 2, periscopes: 10, lights: 4, machineGuns: 2,
    allEquipmentSeated: true,
  }, `${id} must carry the corrected roof suite`);
  assert.deepEqual(gun.userData.pl01MantletReceipt, {
    revision: 'low-profile-r4', axisWorldY: 2.3292,
    coverMinWorldY: 2.2302, coverMaxWorldY: 2.4912,
    turretRoofWorldY: 2.5884, aligned: true,
  }, `${id} gun-root prism must fit within the rebuilt turret envelope`);

  const trackBands = [];
  tank.root.traverse((node) => {
    if (node.name === 'gearTrackBandL' || node.name === 'gearTrackBandR') {
      trackBands.push(node.name);
    }
  });
  assert.deepEqual(trackBands.sort(), ['gearTrackBandL', 'gearTrackBandR'],
    `${id} must retain exactly one linked track course per side`);

  const loaderMG = tank.root.getObjectByName('pl01_loader_mg');
  assert.ok(loaderMG?.parent === turret,
    `${id} loader machine gun must traverse with the turret`);
  assert.ok(tank.root.getObjectByName('turretCupola'),
    `${id} must expose structural cupola geometry`);
  assert.ok(tank.root.getObjectByName('turretEquipment'),
    `${id} must expose non-armor roof equipment geometry`);

  const spareLinks = tank.root.getObjectByName('pl01_105_glacis_spare_links');
  const crows = tank.root.getObjectByName('pl01_105_crows_weapon');
  const rws = tank.root.getObjectByName('pl01_rws_weapon');
  if (id === 'pl01_105') {
    assert.equal(hull.userData.pl01FrontGlacisPack,
      'seated-spare-links-and-camo-era',
      'PL-01 105 must carry the seated glacis protection pack');
    assert.ok(spareLinks?.parent === hull,
      'PL-01 105 spare links must be attached to the fixed hull');
    assert.equal(turret.userData.pl01RemoteStation, 'forward-crows',
      'PL-01 105 must identify its forward CROWS station');
    assert.ok(crows?.parent === turret && near(crows.position.y, 0.6784),
      'PL-01 105 CROWS must be seated on the corrected roof');
    assert.equal(crows.rotation.y, 0,
      'PL-01 105 CROWS must rest aimed forward');
    assert.equal(rws, undefined,
      'PL-01 105 must not inherit the base low-observable RWS');
  } else {
    assert.equal(spareLinks, undefined,
      'base PL-01 must not inherit the 105 glacis protection pack');
    assert.equal(crows, undefined,
      'base PL-01 keeps its own low-observable RWS');
    assert.ok(rws?.parent === turret && near(rws.position.y, 0.6584),
      'base PL-01 RWS must be seated on the corrected roof');
  }
  tank.dispose();
}

console.log('pl01GunGlacisCrows.selftest: unchanged hulls, 20%-taller turrets, reseated guns, and roof suites pass');
