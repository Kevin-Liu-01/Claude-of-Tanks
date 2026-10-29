// The Longwei family (release 264, owner 2026-10-28: "make 4 new chinnese tannks combining variations of vt4a1, qilin,
// kunlun, annd ztz 99a2 with modernized versions of the lonngwei turret which i like the shape of";
// src/vehicles/longweiFamilyConfig.ts): the native fixture of the four concepts, at both qualities. Each is its host's
// hull under the Longwei's arrowhead turret with its own kit: the hull is the host's (its hull mesh's bounds), the turret
// is the Longwei's shape (its receipt's datums) on the kit's ring, the kit is the configured one, and its roof gun is
// the kit's. The Longwei itself still builds with its own kit.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { ensureInteriorFills } from '../interiorFills.ts';
import { LONGWEI_FAMILY } from '../longweiFamilyConfig.ts';

const near = (actual, expected, label, tolerance = 0.002) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual.toFixed(4)}, expected ${expected}`);
const box = (object) => new THREE.Box3().setFromObject(object);

await ensureInteriorFills([...LONGWEI_FAMILY.flatMap((m) => [m.id, m.host]), 'ztz99_longwei']);

function build(id, quality) {
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, quality, camoSeed: 4242 });
  tank.root.updateMatrixWorld(true);
  return tank;
}

const longwei = build('ztz99_longwei', 'high');
const reference = longwei.root.getObjectByName('rig_turret').userData.longweiTurretReceipt;
assert.equal(reference.architecture, 'longwei-arrowhead-r262', 'the Longwei keeps its own kit');
assert.deepEqual(reference.kit, { faceEra: 'pair', sideEra: false, roofGun: 'pintle', protection: 'gl5', bustle: 'bins', bustleCage: false,
  floodlight: false, blockCamo: false });
longwei.dispose();

for (const m of LONGWEI_FAMILY) {
  let envelope = null;
  for (const quality of ['high', 'low']) {
    const tank = build(m.id, quality), host = build(m.host, quality);
    try {
      const turretRig = tank.root.getObjectByName('rig_turret');
      const receipt = turretRig.userData.longweiTurretReceipt;
      assert.ok(receipt, `${m.id} ${quality}: the Longwei turret's receipt`);
      // the Longwei's shape: its cheek tips, sweep, width over the side modules, length, throat and roof
      for (const key of ['cheekTipZ', 'cheekSweepDeg', 'widthOverModulesM', 'lengthM', 'throatHalfWidthM', 'roofLocalY']) {
        near(receipt[key], reference[key], `${m.id} ${quality} ${key}`, 1e-9);
      }
      assert.deepEqual(receipt.trunnionLocalM, reference.trunnionLocalM, `${m.id}: the Longwei's trunnion`);
      // the kit and its ring
      assert.equal(receipt.architecture, m.kit.revision);
      assert.deepEqual(receipt.kit, { faceEra: m.kit.faceEra, sideEra: m.kit.sideEra, roofGun: m.kit.roofGun,
        protection: m.kit.protection, bustle: m.kit.bustle, bustleCage: m.kit.bustleCage, floodlight: m.kit.floodlight,
        blockCamo: m.kit.blockCamo },
        `${m.id}: its own kit`);
      // the floodlight on the gun mount when the kit carries one
      assert.equal(Boolean(tank.root.getObjectByName('rig_gun')?.userData.gunFloodlight), m.kit.floodlight, `${m.id}: floodlight`);
      turretRig.position.toArray().forEach((v, i) => near(v, m.kit.pivot[i], `${m.id} ${quality} ring[${i}]`, 1e-6));
      // the host's hull, unchanged
      const hull = box(tank.root.getObjectByName('hull')), hostHull = box(host.root.getObjectByName('hull'));
      [...hull.min.toArray(), ...hull.max.toArray()].forEach((v, i) =>
        near(v, [...hostHull.min.toArray(), ...hostHull.max.toArray()][i], `${m.id} ${quality} hull bound ${i}`));
      // the kit's roof gun
      const gun = m.kit.roofGun === 'pintle' ? 'fitting_browningDerived_qjc88' : 'Longwei remote 12.7 mm station';
      assert.ok(turretRig.getObjectByName(gun), `${m.id}: its ${m.kit.roofGun} roof gun`);
      // its protection: radar faces and launchers with the hard-kill suite, none without it
      assert.equal(receipt.radarFaces, m.kit.protection.startsWith('gl5') ? 4 : 0, `${m.id}: radar faces`);
      // one design at both qualities
      const b = box(tank.root), values = [...b.min.toArray(), ...b.max.toArray()];
      if (envelope) values.forEach((v, i) => near(v, envelope[i], `${m.id} ${quality} envelope[${i}]`));
      else envelope = values;
    } finally {
      tank.dispose();
      host.dispose();
    }
  }
}
console.log('longweiFamily.selftest: four hosts\' hulls under the Longwei turret with their own kits and roof guns at both qualities; the Longwei unchanged');
