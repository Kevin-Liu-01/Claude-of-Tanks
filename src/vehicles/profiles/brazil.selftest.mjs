// The Brazilian Army line (release 266; docs/history/research/brazil-line-266.md): the native fixture of profiles/brazil.ts
// at both qualities. Each id is Brazil's, drawn in the Brazil tree at Main's tier, on its published gun and crew, its
// muzzle on the published overall length, its build's own receipt (the Osório's Vickers turret and sight heads, the
// Tamoyos' turrets and skirts, the X1 family's bustles), and its as-built envelope inside its photo packet
// (docs/references/photos/*-20261029.json, 3 %).
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { ensureInteriorFills } from '../interiorFills.ts';
import { nodeForVehicle } from '../../techTree/trees.ts';
import { displayTier } from '../../techTree/tiers.ts';
import { OSORIO_DATUMS } from './osorio.ts';
import { TAMOYO_DATUMS } from './tamoyo.ts';
import { BERNARDINI_X1_DATUMS } from './bernardiniX1.ts';

const IDS = {
  'x1_pioneiro': { tier: 1, role: 'light', caliber: 90, crew: 4, packet: 'ccl-x1-pioneiro-20261029.json', receipt: 'x1TurretReceipt', muzzle: BERNARDINI_X1_DATUMS.x1.muzzleHullZ },
  'x1a2_carcara': { tier: 1, role: 'light', caliber: 90, crew: 3, packet: 'ccl-x1a2-carcara-20261029.json', receipt: 'x1TurretReceipt', muzzle: BERNARDINI_X1_DATUMS.x1a2.muzzleHullZ },
  'tamoyo1': { tier: 2, role: 'medium', caliber: 90, crew: 4, packet: 'mb-3-tamoyo-1-20261029.json', receipt: 'tamoyoTurretReceipt', muzzle: TAMOYO_DATUMS.muzzleHullZ.t1 },
  'tamoyo3': { tier: 3, role: 'mbt', caliber: 105, crew: 4, packet: 'mb-3-tamoyo-3-20261029.json', receipt: 'tamoyoTurretReceipt', muzzle: TAMOYO_DATUMS.muzzleHullZ.t3 },
  'osorio_p1': { tier: 3, role: 'mbt', caliber: 105, crew: 4, packet: 'ee-t1-osorio-105-20261029.json', receipt: 'osorioTurretReceipt', muzzle: OSORIO_DATUMS.muzzleHullZ.p1 },
  'osorio_p2': { tier: 4, role: 'mbt', caliber: 120, crew: 4, packet: 'ee-t1-osorio-120-20261029.json', receipt: 'osorioTurretReceipt', muzzle: OSORIO_DATUMS.muzzleHullZ.p2 },
};
await ensureInteriorFills(Object.keys(IDS));
const within = (actual, expected, label, fraction = 0.03) =>
  assert.ok(Math.abs(actual - expected) <= expected * fraction, `${label}: ${actual.toFixed(3)} m, expected ${expected} m within ${fraction * 100} %`);

// the published overall lengths the guns stand on (the muzzle forward of the hull's middle plus the half hull)
within(OSORIO_DATUMS.muzzleHullZ.p2 + OSORIO_DATUMS.hull.noseZ, 10.10, 'Osório P.2 over the gun', 0.005);
within(OSORIO_DATUMS.muzzleHullZ.p1 + OSORIO_DATUMS.hull.noseZ, 9.36, 'Osório P.1 over the gun', 0.005);
within(TAMOYO_DATUMS.muzzleHullZ.t1 + TAMOYO_DATUMS.hull.noseZ, 8.77, 'Tamoyo 1 over the gun', 0.005);
within(TAMOYO_DATUMS.muzzleHullZ.t3 + TAMOYO_DATUMS.hull.noseZ, 8.90, 'Tamoyo 3 over the gun', 0.005);
// (the X1's muzzle as Gaydos draws it, 1.28 m past the bow, the 33-calibre D-921; TE's 6.04 m reads the gun 0.28 m short)
within(BERNARDINI_X1_DATUMS.x1.muzzleHullZ - BERNARDINI_X1_DATUMS.x1.sternZ, 6.32, 'X1 over the gun', 0.005);
assert.equal(OSORIO_DATUMS.roadWheelZs.length, 6, 'the Osório: six road wheels a side');
assert.equal(TAMOYO_DATUMS.roadWheelZs.length, 6, 'the Tamoyo: six road wheels a side');
assert.equal(BERNARDINI_X1_DATUMS.x1.wheelZs.length, 4, 'the X1: two bogies, four wheels a side');
assert.equal(BERNARDINI_X1_DATUMS.x1a2.wheelZs.length, 6, 'the X1A2: three bogies, six wheels a side');
assert.ok(OSORIO_DATUMS.hull.noseZ - OSORIO_DATUMS.ring.z > 3.15 && OSORIO_DATUMS.hull.noseZ - OSORIO_DATUMS.ring.z < 3.18,
  'the Osório ring 3.165 m behind the nose (both guns\' published lengths)');

for (const [id, row] of Object.entries(IDS)) {
  const spec = getSpec(id);
  assert.equal(spec.nation, 'Brazil', `${id}: Brazil's`);
  assert.equal(spec.role, row.role, `${id}: a ${row.role}`);
  assert.equal(spec.gun.caliberMm, row.caliber, `${id}: the ${row.caliber} mm gun`);
  assert.equal(nodeForVehicle(id)?.tree.id, 'brazil', `${id}: drawn in the Brazil tree`);
  assert.equal(displayTier(id), row.tier, `${id}: Main's tier`);
  const packetPath = new URL(`../../../docs/references/photos/${row.packet}`, import.meta.url);
  assert.ok(existsSync(packetPath), `${id}: its photo packet`);
  const target = JSON.parse(readFileSync(packetPath, 'utf8')).targets[id];
  assert.equal(target.caliberMm, row.caliber, `${id}: the packet's calibre`);
  assert.equal(target.crew, spec.armor.crew.length, `${id}: the packet's crew is the spec's`);
  for (const quality of ['high', 'low']) {
    const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, quality, camoSeed: 4242 });
    try {
      tank.root.updateMatrixWorld(true);
      const turret = tank.root.getObjectByName('rig_turret'), gun = tank.root.getObjectByName('rig_gun');
      assert.ok(turret?.userData[row.receipt], `${id} ${quality}: its turret receipt`);
      // the muzzle on its published station, the gun at rest
      const muzzle = gun.localToWorld(new THREE.Vector3(0, 0, tank.rig?.muzzleZ ?? gun.userData.osorioGunReceipt?.muzzleZ
        ?? gun.userData.tamoyoGunReceipt?.muzzleZ ?? gun.userData.x1GunReceipt?.muzzleZ));
      within(muzzle.z, row.muzzle, `${id} ${quality}: the muzzle station`, 0.01);
      const box = new THREE.Box3().setFromObject(tank.root);
      within(box.max.x - box.min.x, target.widthM, `${id} ${quality}: the packet's width`);
      within(box.max.z - box.min.z, target.overallLengthM, `${id} ${quality}: the packet's length`);
      within(box.max.y, target.tallestM, `${id} ${quality}: the packet's tallest`);
    } finally {
      tank.dispose?.();
    }
  }
}
// the marks' own kit (the distinctness a player reads at range)
const receipt = (id, key) => {
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, quality: 'low', camoSeed: 4242 });
  try { return { ...tank.root.getObjectByName('rig_turret').userData[key] }; } finally { tank.dispose?.(); }
};
const p1 = receipt('osorio_p1', 'osorioTurretReceipt'), p2 = receipt('osorio_p2', 'osorioTurretReceipt');
assert.deepEqual([p1.dischargers, p2.dischargers], [8, 12], 'the Osório P.1 two by two dischargers a side, the P.2 two by three');
assert.deepEqual([p1.sightHeads, p2.sightHeads, p2.panoramicPedestal], [3, 3, true],
  'the P.1\'s two LRS-5 heads and the commander\'s hooded head; the P.2\'s VS580 heads');
assert.deepEqual([p1.rightGrid, p2.rightGrid, p1.leftBasket, p2.leftBasket, p1.gunBoot, p2.gunBoot],
  ['flat', 'basket', false, false, 'black', 'canvas'], 'the P.1\'s flat grid and black boot, the P.2\'s basket; no left basket');
assert.deepEqual([receipt('tamoyo1', 'tamoyoTurretReceipt').sideSkirts, receipt('tamoyo3', 'tamoyoTurretReceipt').sideSkirts], [true, false],
  'the Tamoyo 1 on its side plates, the Tamoyo 3 on open gear');
const x1 = receipt('x1_pioneiro', 'x1TurretReceipt'), x1a2 = receipt('x1a2_carcara', 'x1TurretReceipt');
assert.deepEqual([x1.flankSmokeBoxes, x1a2.flankSmokeBoxes, x1.cupola, x1a2.cupola], [false, true, 'dome-slit', 'rect-periscope'],
  'the X1A2\'s six-tube boxes on its rear flanks; the X1\'s domed slit cupola, the X1A2\'s raised rectangular periscope cupola');
console.log(`brazil.selftest: ${Object.keys(IDS).length} Brazilian ids at both qualities in their packets, trees and tiers`);
