// The Australian Army line (release 269; Main's ruling 2026-11-02, ~/cot-lanes/sa-aus-trees-269-evidence/PROPOSAL.md):
// the native fixture of the M113A1 FSV and MRV and the M113AS4 (profiles/m113.ts), the Leopard AS1 (the 'as1' mark of
// profiles/leopard1Dk.ts), the M1A1 AIM SA (profiles/abramsAus.ts) and the M1A2 SEPv3 (the source study's 'mounts' fit,
// profiles/abramsSourceX.ts) and the AS21 Redback (profiles/redback.ts) at both qualities. Each id is Australia's, drawn in
// the Australia tree at Main's tier on its published gun and crew (and the US Army's M113A3 on the same M113 build, the
// owner's 2026-11-03 request, in the US tree's special lane), its own kit as a player reads it at range (Main's
// condition: the Abrams' tells real, not a paint swap; the owner's heavy field nets on both Abrams, their guns netted to
// the muzzle), and its as-built envelope inside its photo packet (docs/references/photos/aus-*-20261102.json, 3 %).
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { ensureInteriorFills } from '../interiorFills.ts';
import { nodeForVehicle } from '../../techTree/trees.ts';
import { displayTier } from '../../techTree/tiers.ts';
import { buildM113HullSteps } from './m113.ts';
import { M113_BASE, m113Datums } from '../m113Datums.ts';
import { M741_COMMANDER_HATCH, M741_RING } from '../m741Datums.ts';

const M113 = 'aus-m113-20261102.json', ABRAMS = 'aus-abrams-20261102.json';
// muzzle: the gun at rest is the build's front (null where the hull's nose leads, as on the Redback)
const IDS = {
  'm113a1_fsv': { tier: 1, role: 'light', caliber: 76, packet: M113, muzzle: null },
  'm113a1_mrv': { tier: 1, role: 'light', caliber: 76, packet: M113, muzzle: null },
  'm113as4': { tier: 3, role: 'ifv', caliber: 12.7, packet: M113, muzzle: null },
  'leopard_as1': { tier: 1, role: 'mbt', caliber: 105, packet: 'aus-leopard-as1-20261102.json', muzzle: 6.078 },
  'm1a1_aim_sa_aus': { tier: 8, role: 'mbt', caliber: 120, packet: ABRAMS, muzzle: 5.80 },
  'm1a2_sepv3_aus': { tier: 9, role: 'mbt', caliber: 120, packet: ABRAMS, muzzle: 5.809 },
  'redback': { tier: 6, role: 'ifv', caliber: 30, packet: 'aus-redback-20261102.json', muzzle: null },
  // 269 (the owner, 2026-11-03): the US Army's M113A3 on the same M113 build, in the US tree's special lane
  'm113a3': { tier: 2, role: 'ifv', caliber: 12.7, packet: 'usa-m113a3-20261103.json', muzzle: null, nation: 'USA', tree: 'usa' },
};
await ensureInteriorFills(Object.keys(IDS));
const within = (actual, expected, label, fraction = 0.03) =>
  assert.ok(Math.abs(actual - expected) <= expected * fraction, `${label}: ${actual.toFixed(3)} m, expected ${expected} m within ${fraction * 100} %`);

// Main's condition on the SEPv3: no ARAT (its reactive skirt and turret banks leave the armour with the drawn cassettes)
assert.ok(!getSpec('m1a2_sepv3_aus').armor.hullPlates.some((plate) => plate.kind === 'era'), 'the Australian SEPv3: no ARAT');
assert.ok(!getSpec('m1a2_sepv3_aus').armor.turretPlates.some((plate) => plate.kind === 'era'), 'the Australian SEPv3: no turret ARAT');

for (const [id, row] of Object.entries(IDS)) {
  const spec = getSpec(id);
  assert.equal(spec.nation, row.nation ?? 'Australia', `${id}: ${row.nation ?? 'Australia'}'s`);
  assert.equal(spec.role, row.role, `${id}: its role`);
  assert.equal(spec.gun.caliberMm, row.caliber, `${id}: the ${row.caliber} mm gun`);
  if (!row.nation) assert.equal(spec.visual.insignia, 'au-army-kangaroo', `${id}: the Army's kangaroo`);
  assert.equal(nodeForVehicle(id)?.tree.id, row.tree ?? 'australia', `${id}: drawn in the ${row.tree ?? 'australia'} tree`);
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
      const names = [];
      tank.root.traverse((part) => names.push(part.name));
      if (id.startsWith('m113')) {
        const receipt = turret?.userData.m113TurretReceipt;
        assert.equal(receipt?.turret, { m113a1_fsv: 'saladin', m113a1_mrv: 'scorpion', m113as4: 'tenix', m113a3: 'acav-cupola' }[id],
          `${id} ${quality}: its turret`);
        assert.equal(receipt.towTubes, id === 'm113a3' ? 0 : 2, `${id} ${quality}: its TOW tubes`);
        assert.equal(receipt.roadWheels, id === 'm113as4' ? 6 : 5, `${id} ${quality}: its road wheels`);
      }
      if (id === 'leopard_as1') assert.ok(tank.root.getObjectByName('leo1As1LoaderMag'), `${id} ${quality}: the loader's MAG 58`);
      if (id === 'm1a1_aim_sa_aus') {
        const receipt = turret?.userData.ausAbramsReceipt;
        assert.equal(receipt?.tmapu, 'rack-left-rear', `${id} ${quality}: the TMAPU in the rack's left rear`);
        assert.equal(receipt.rackTiers, 2, `${id} ${quality}: the two-tier rack`);
      }
      if (id.includes('_aus')) {
        // the owner, 2026-11-02: "a lot of ghillie on them and on their barrels"
        for (const owner of ['hull', 'turret', 'gun']) {
          assert.ok(names.some((name) => name.endsWith(`_ghillie_${owner}_net`)), `${id} ${quality}: the ${owner} netted`);
        }
      }
      if (id === 'redback') assert.equal(turret?.userData.redbackTurretReceipt?.roadWheels, 7, `${id} ${quality}: seven road wheels`);
      const box = new THREE.Box3().setFromObject(tank.root);
      if (row.muzzle !== null) within(box.max.z, row.muzzle, `${id} ${quality}: the muzzle station`, 0.01);
      within(box.max.x - box.min.x, target.widthM, `${id} ${quality}: the packet's width`);
      within(box.max.z - box.min.z, target.overallLengthM, `${id} ${quality}: the packet's length`);
      within(box.max.y, target.tallestM, `${id} ${quality}: the packet's tallest`);
    } finally {
      tank.dispose?.();
    }
  }
}
// the M163 VADS's carrier (the twin-aa lane builds its Vulcan turret over buildM113HullSteps(P, 'm741')): the M741's
// turret race centred on the roof's rear half, inside the roof, the driver's hatch ahead of it and the commander's round
// hatch behind it at the right rear (the owner's photo of 2026-11-04)
{
  const D = m113Datums('fsv'), R = M741_RING, H = M741_COMMANDER_HATCH;
  assert.equal(typeof buildM113HullSteps, 'function', 'the M113 hull steps exported for the M741');
  assert.deepEqual([D.wheelZs.length, D.length, R.roofY], [5, M113_BASE.length, M113_BASE.roofY], 'the M741 on the A1\'s hull and roof');
  assert.ok(R.z < (D.glacisTopZ + D.sternZ) / 2, 'the race on the roof\'s rear half');
  assert.ok(Math.abs(R.x) + R.diameter / 2 < M113_BASE.hw - 0.2, 'the race inside the roof\'s sides');
  // (m113.ts's driver's hatch: 0.30 m behind the glacis' top, 0.31 m in radius)
  assert.ok(D.glacisTopZ - 0.30 - 0.31 > R.z + R.diameter / 2, 'the driver\'s hatch ahead of the race');
  assert.ok(H.x < 0 && H.z - H.r > D.sternZ && Math.hypot(H.x - R.x, H.z - R.z) > R.diameter / 2 + H.r + 0.2,
    'the commander\'s hatch at the right rear, on the roof and clear of the race');
}
console.log(`australia.selftest: ${Object.keys(IDS).length} Australian ids at both qualities in their packets, tree and tiers`);
