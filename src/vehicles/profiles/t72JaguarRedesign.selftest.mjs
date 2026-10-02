import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { FLEET_RENEWAL_DONORS } from '../fleetRenewalSpecs.ts';
import { censusEquipment } from '../../../tools/source-equipment-policy.mjs';

// 2026-10-01: the owner's September renewal (4c34b3e8b, docs/tank-generation/fleet-renewal-publication-20260930.md:
// "Rebuild T-72M1 Jaguar around the new T-72B3") replaced the former Jaguar builder, its PT-91A stance, ERAWA glacis,
// WKM-B, lockers and fuel barrels, with the complete t72b3_x donor plus a Polish fit (profiles/t72ModernVariants.ts
// buildJaguarModern: cheek receivers, panoramic sight, rear rack, enclosed stowage). The receipts of the retired
// builder left with it; this receipt holds the rebuild to its own contract and the owner's standing rulings.
const options = { proceduralOnly: true, geometryReceipt: true };
const tank = createTank('t72m1_jaguar', null, options);
const donor = createTank('t72b3_x', null, options);
try {
  const spec = getSpec('t72m1_jaguar');
  const hull = tank.root.getObjectByName('rig_hull');
  const turret = tank.root.getObjectByName('rig_turret');
  const gun = tank.root.getObjectByName('rig_gun');
  assert.equal(FLEET_RENEWAL_DONORS.t72m1_jaguar, 't72b3_x', 'the renewal builds the Jaguar on the T-72B3 study');
  assert.deepEqual(hull.userData.familyRebuild, { donor: 't72b3_x', revision: 1, variant: 'jaguar' },
    'Jaguar is the owner-directed T-72B3 family rebuild, not a half-retired builder');

  // Running gear: the donor's six T-72 stations, three return rollers per side (FSP-03 ruling), one band per side.
  const [gear] = hull.userData.runningGearReceipts || [];
  const [donorGear] = donor.root.getObjectByName('rig_hull').userData.runningGearReceipts || [];
  assert.ok(gear && donorGear, 'both hulls publish their running-gear receipt');
  for (const key of ['wheelZs', 'wheelY', 'wheelR', 'idler', 'sprocket', 'topY', 'botY', 'trackTh']) {
    assert.deepEqual(gear[key], donorGear[key], `Jaguar ${key} is the t72b3_x donor's`);
  }
  assert.equal(gear.wheelZs.length, 6, 'Jaguar keeps the native six-station T-72 suspension');
  assert.equal(hull.getObjectByName('gearReturnRollerTires')?.count, 6,
    'three return rollers per side: the T-72 family carries its upper run on rollers');
  const bandNames = [];
  tank.root.traverse((node) => {
    if (node.name === 'gearTrackBandL' || node.name === 'gearTrackBandR') bandNames.push(node.name);
  });
  assert.deepEqual(bandNames.sort(), ['gearTrackBandL', 'gearTrackBandR'],
    'Jaguar has exactly one linked track course on each side');
  const clear = (end, z) => Math.hypot(end.z - z, end.y - gear.wheelY) - (end.r + gear.wheelR);
  const zs = [...gear.wheelZs].sort((a, b) => a - b);
  assert.ok(clear(gear.sprocket, zs[0]) > 0.02, 'rear sprocket clears the first road wheel');
  assert.ok(clear(gear.idler, zs.at(-1)) > 0.02, 'front idler clears the last road wheel');
  assert.ok(Math.abs(gear.botY + gear.trackTh / 2 - (gear.wheelY - gear.wheelR)) < 1e-9,
    'Jaguar loaded track run carries the tire feet (ground-datum seat, 2026-09-17)');
  // 2026-09-22 owner ("poland uses the pl-01 or bwp-1 wheels"): the Polish T-72 hull draws the PL-01 nation wheel.
  const pattern = hull.userData.wheelPatternReceipts?.[0];
  assert.equal(pattern?.construction, 'nation:pl01-plain-dish', 'Jaguar draws the Poland nation wheel construction');
  assert.equal(pattern?.nationStandard?.donor, 'pl01', 'Jaguar wheel donor is the PL-01');

  // Articulation and combat datum.
  assert.deepEqual(turret.position.toArray(), spec.armor.turretPivot,
    'rendered turret ring matches the combat/anatomy datum');
  assert.deepEqual(gun.position.toArray(), spec.armor.gunPivot,
    'rendered gun root matches the combat/anatomy datum');
  assert.equal(gun.getObjectByName('gunMount')?.parent, gun, 'Jaguar mantlet remains attached to the weapon root');
  assert.equal(gun.getObjectByName('rig_recoil')?.parent, gun, 'Jaguar recoiling barrel remains attached to the weapon root');

  // The Polish fit: the Jaguar's own paint, three attached cheek receivers per side over the donor's cheek ERA,
  // the donor's single roof machine gun.
  assert.equal(spec.visual.scheme, 'nato', 'Jaguar uses a flowing Polish three-colour woodland pattern');
  assert.equal(spec.visual.base, '#46533a', 'Jaguar body color is olive green rather than the former blue-gray tone');
  assert.deepEqual(spec.visual.patches, ['#5a4534', '#1c211c'],
    'Jaguar carries distinct earth-brown and charcoal disruption bands');
  const parts = (t) => t.root.userData.eraFinishReceipt?.partsBySector ?? {};
  const own = parts(tank), base = parts(donor);
  assert.deepEqual(Object.keys(own).sort(), Object.keys(base).sort(), 'Jaguar ERA keeps the donor zones, no invented field');
  for (const side of ['L', 'R']) {
    assert.equal(own[`turret_era_${side}`] - base[`turret_era_${side}`], 6,
      `Jaguar adds three attached cheek receivers (cassette and lid) on the ${side} cheek`);
  }
  for (const zone of Object.keys(base).filter((name) => !name.startsWith('turret_era_'))) {
    assert.equal(own[zone], base[zone], `${zone}: the donor hull ERA is unchanged`);
  }
  assert.ok(turret.getObjectByName('turretExternalArmor')?.isMesh, 'Jaguar cheek ERA is turret-owned external armor');
  assert.equal(censusEquipment(tank.root).mg, censusEquipment(donor.root).mg, 'Jaguar keeps the donor roof machine gun');

  tank.root.updateMatrixWorld(true); donor.root.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(tank.root).getSize(new THREE.Vector3());
  const donorSize = new THREE.Box3().setFromObject(donor.root).getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.z - donorSize.z) < 0.05 && Math.abs(size.x - donorSize.x) < 0.05,
    `Jaguar length and width stay the T-72B3 envelope (got ${size.z.toFixed(3)} x ${size.x.toFixed(3)} m)`);
} finally {
  tank.dispose();
  donor.dispose();
}
console.log('t72JaguarRedesign.selftest: T-72B3 donor gear, PL-01 wheels, datum articulation and the Polish cheek fit verified');
