// The South African Army line (release 269; Main's ruling 2026-11-02, ~/cot-lanes/sa-aus-trees-269-evidence/PROPOSAL.md):
// the native fixture of the Semel, the Olifant Mk 1, Mk 1A and Mk 1B (the Centurion family's South African marks in
// profiles/centurionFamily.ts) and the TTD (profiles/ttd.ts) at both qualities. Each id is South Africa's, drawn in the
// South Africa tree at Main's tier on its published gun and crew, its muzzle on its station, each mark's own kit as a
// player reads it at range (Main's condition: each Olifant reads as itself), and its as-built envelope inside its photo
// packet (docs/references/photos/olifant-*-20261102.json, 3 %).
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { ensureInteriorFills } from '../interiorFills.ts';
import { TECH_TREES, nodeForVehicle, rootOf } from '../../techTree/trees.ts';
import { displayTier } from '../../techTree/tiers.ts';
import { TTD_DATUMS } from './ttd.ts';

const CENT = 'olifant-centurions-20261102.json';
const IDS = {
  semel: { tier: 2, caliber: 84, packet: CENT, receipt: 'olifantMarkReceipt', muzzle: 6.07 },
  olifant_mk1: { tier: 2, caliber: 84, packet: CENT, receipt: 'olifantMarkReceipt', muzzle: 6.07 },
  olifant_mk1a: { tier: 3, caliber: 105, packet: CENT, receipt: 'olifantMarkReceipt', muzzle: 5.84 },
  olifant_mk1b: { tier: 3, caliber: 105, packet: CENT, receipt: 'olifantMarkReceipt', muzzle: 5.84 },
  ttd: { tier: 4, caliber: 105, packet: 'olifant-ttd-20261102.json', receipt: 'ttdTurretReceipt', muzzle: TTD_DATUMS.muzzleHullZ },
};
await ensureInteriorFills(Object.keys(IDS));
const within = (actual, expected, label, fraction = 0.03) =>
  assert.ok(Math.abs(actual - expected) <= expected * fraction, `${label}: ${actual.toFixed(3)} m, expected ${expected} m within ${fraction * 100} %`);

// the TTD on the fleet's Leopard 2 (the owner, 2026-11-02): its seven road wheels a side on Leopard 2-type torsion bars
assert.equal(TTD_DATUMS.roadWheelZs.length, 7, 'the TTD: seven road wheels a side');

for (const [id, row] of Object.entries(IDS)) {
  const spec = getSpec(id);
  assert.equal(spec.nation, 'South Africa', `${id}: South Africa's`);
  assert.equal(spec.role, 'mbt', `${id}: a main battle tank`);
  assert.equal(spec.gun.caliberMm, row.caliber, `${id}: the ${row.caliber} mm gun`);
  assert.equal(nodeForVehicle(id)?.tree.id, 'south_africa', `${id}: drawn in the South Africa tree`);
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
      const turret = tank.root.getObjectByName('rig_turret');
      assert.ok(turret?.userData[row.receipt], `${id} ${quality}: its turret receipt`);
      const box = new THREE.Box3().setFromObject(tank.root);
      // the gun at rest: the build's front is its muzzle
      within(box.max.z, row.muzzle, `${id} ${quality}: the muzzle station`, 0.01);
      within(box.max.x - box.min.x, target.widthM, `${id} ${quality}: the packet's width`);
      within(box.max.z - box.min.z, target.overallLengthM, `${id} ${quality}: the packet's length`);
      within(box.max.y, target.tallestM, `${id} ${quality}: the packet's tallest`);
    } finally {
      tank.dispose?.();
    }
  }
}

// each mark's own kit (Main's condition: the four Olifants read apart at Garage range)
const receipt = (id, key) => {
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, quality: 'low', camoSeed: 4242 });
  try { return { ...tank.root.getObjectByName('rig_turret').userData[key] }; } finally { tank.dispose?.(); }
};
const [semel, mk1, mk1a, mk1b] = ['semel', 'olifant_mk1', 'olifant_mk1a', 'olifant_mk1b'].map((id) => receipt(id, 'olifantMarkReceipt'));
assert.deepEqual([semel.gun, mk1.gun, mk1a.gun, mk1b.gun], ['20pdrB', '20pdrB', 'l7', 'l7'], 'the 20-pdr Semel and Mk 1, the 105 mm Mk 1A and Mk 1B');
assert.deepEqual([semel.skirts, mk1.skirts, mk1a.skirts, mk1b.skirts], ['plates', 'off', 'off', 'armoured'],
  'the Semel on the Mk 5\'s side plates, the Mk 1 and Mk 1A skirtless in the bush, the Mk 1B\'s armoured skirts');
assert.deepEqual([semel.dischargers, mk1.dischargers, mk1a.dischargers, mk1b.dischargers], [12, 8, 8, 8],
  'two by six on the Semel, two by four on the Olifants');
assert.deepEqual([semel.bustle, mk1.bustle, mk1a.bustle, mk1b.bustle], ['bin', 'net-rack', 'box', 'can-rack'], 'each mark\'s bustle');
assert.deepEqual([mk1a.bushBar, mk1b.searchlight, mk1b.sightPost, mk1b.suspension, mk1.suspension],
  [true, true, false, 'torsion', 'horstmann'], 'the Mk 1A\'s bush bar; the Mk 1B\'s searchlight over the gun, no sight post, its torsion bars');
assert.equal(receipt('olifant_mk2', 'olifantMarkReceipt').mark, undefined, 'the Mk 2 keeps its own 262 build (its sight post)');
const ttd = receipt('ttd', 'ttdTurretReceipt');
assert.deepEqual([ttd.base, ttd.dischargers, ttd.sheetedDischargers], ['leopard2a4-block', 8, true],
  'the TTD on the Leopard 2A4\'s block turret, its two banks of four behind their sheets');

// the tree: the Mk 1 its root with the Semel its twin, the Mk 2 moved in from the UK tree, the TTD its special
const sa = TECH_TREES.find((entry) => entry.id === 'south_africa');
assert.equal(rootOf(sa).id, 'olifant_mk1', 'the South Africa tree opens on the Olifant Mk 1');
assert.equal(nodeForVehicle('semel').node.id, 'olifant_mk1', 'the Semel is the Mk 1\'s twin build');
assert.equal(nodeForVehicle('olifant_mk2').tree.id, 'south_africa', 'the Olifant Mk 2 moved to the South Africa tree');
assert.equal(nodeForVehicle('ttd').node.slot, 'special', 'the TTD is the South African special');
assert.ok(!TECH_TREES.find((entry) => entry.id === 'uk').nations.includes('South Africa'), 'the UK tree no longer draws South Africa');
console.log(`southAfrica.selftest: ${Object.keys(IDS).length} South African ids at both qualities in their packets, tree and tiers`);
