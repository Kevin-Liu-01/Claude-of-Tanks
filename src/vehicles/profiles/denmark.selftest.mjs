// The Danish Army line (release 265; docs/history/research/denmark-line-265.md): the native fixture each id's photo packet
// names (docs/references/photos/leopard-*-dk*-20261029.json). At both qualities: the as-built envelope against its packet
// (widthM the X extent, overallLengthM the Z extent, tallestM the highest point, within 3%); the Leopard 1 DKs' welded
// 1A3 turret with each mark's kit; the 2A5 DK's Elop sight and bar armour, without the German builds' remote 30 mm
// station (the 2A7 DK held, 2026-10-30); the CV9035 DK on the CV90 Mk IV (the owner 2026-10-30) with the 35 mm and no
// missile launcher (the M41 DK-1 is m41.selftest.mjs's). Then the tree and the team country: one Denmark tree rooted on the 1A3 DK, the Christian II in
// its special lane, Denmark a country that fills first from Sweden.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { ensureInteriorFills } from '../interiorFills.ts';
import { TECH_TREES, nodeForVehicle, rootOf } from '../../techTree/trees.ts';
import { displayTier } from '../../techTree/tiers.ts';
import { COUNTRY_ALLIES, countryOfVehicle } from '../../sim/countries.ts';

const PACKETS = {
  'leo1a3dk': 'leopard-1a3-dk-20261029.json',
  'leo1a5dk': 'leopard-1a5-dk-20261029.json',
  'leo1a5dk1': 'leopard-1a5-dk-1-20261029.json',
  'leo2a5dk': 'leopard-2a5-dk-20261029.json',
  'cv9035dk': 'cv9035-dk-20261029.json',
};
const TIERS = { 'leo1a3dk': 1, 'leo1a5dk': 1, 'leo1a5dk1': 1, 'leo2a5dk': 9, 'cv9035dk': 5 };
await ensureInteriorFills(Object.keys(PACKETS));

const within = (actual, target, label) =>
  assert.ok(Math.abs(actual - target) / target <= 0.03, `${label}: ${actual.toFixed(3)} m against the packet's ${target} m`);

for (const [id, file] of Object.entries(PACKETS)) {
  const packet = JSON.parse(readFileSync(new URL(`../../../docs/references/photos/${file}`, import.meta.url), 'utf8'));
  const target = packet.targets[id];
  assert.ok(target, `${id}: its packet holds it`);
  const spec = getSpec(id);
  assert.equal(spec.nation, 'Denmark', `${id}: a Danish tank`);
  assert.equal(target.caliberMm, spec.gun.caliberMm, `${id}: the packet's calibre`);
  assert.equal(target.crew, spec.armor.crew.length, `${id}: the packet's crew`);
  assert.equal(displayTier(id), TIERS[id], `${id}: Main's tier`);
  assert.equal(nodeForVehicle(id)?.tree.id, 'denmark', `${id}: drawn in the Denmark tree`);
  for (const quality of ['high', 'low']) {
    const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, quality, camoSeed: 4242 });
    try {
      tank.root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(tank.root);
      within(box.max.x - box.min.x, target.widthM, `${id} ${quality} width`);
      within(box.max.z - box.min.z, target.overallLengthM, `${id} ${quality} length`);
      within(box.max.y, target.tallestM, `${id} ${quality} tallest`);
      const turret = tank.root.getObjectByName('rig_turret');
      let remote30 = false;
      tank.root.traverse((o) => { if (/remote 30 mm cannon/i.test(o.name ?? '')) remote30 = true; });
      if (id.startsWith('leo1')) {
        const r = turret.userData.leopard1DkTurretReceipt;
        assert.ok(r?.weldedTurret, `${id} ${quality}: the welded 1A3 turret`);
        assert.equal(r.emes18, id !== 'leo1a3dk', `${id} ${quality}: EMES 18 on the 1A5 DKs only`);
        assert.equal(r.rangefinderPortsOpen, id === 'leo1a3dk', `${id} ${quality}: the TEM 2A ports open on the 1A3 DK only`);
        assert.equal(r.airConditioningHousing, id === 'leo1a5dk1', `${id} ${quality}: the DK-1's air conditioning housing`);
        assert.ok(r.cheekRoot[0] < r.halfWidth, `${id}: the pointed plan front`);
      } else if (id === 'cv9035dk') {
        assert.equal(spec.role, 'ifv', `${id}: an IFV`);
        const gun = tank.root.getObjectByName('rig_gun').userData.cv9035DkReceipt;
        assert.equal(gun?.host, 'cv90_mk4', `${id} ${quality}: on the CV90 Mk IV`);
        assert.equal(gun.mainGunCaliberMm, 35, `${id} ${quality}: the 35 mm Bushmaster III`);
        assert.equal(gun.missileLauncher, false, `${id} ${quality}: no missile launcher`);
        assert.ok(!spec.gun.shells.some((shell) => shell.guided), `${id}: no guided round`);
      } else {
        const r = turret.userData.leopard2DkReceipt;
        assert.ok(r, `${id} ${quality}: the Danish kit's receipt`);
        assert.equal(remote30, false, `${id} ${quality}: no remote 30 mm station`);
        assert.ok(r.elopCommanderSight && r.bustleSlats && r.hullSlats, `${id} ${quality}: Elop sight, bar armour`);
      }
    } finally {
      tank.dispose?.();
    }
  }
}

// the tree: one root, the 1A3 DK; the Christian II in Denmark's special lane, no longer Sweden's
const denmark = TECH_TREES.find((tree) => tree.id === 'denmark');
assert.equal(rootOf(denmark).id, 'leo1a3dk', 'the Denmark tree opens on the Leopard 1A3 DK');
assert.equal(nodeForVehicle('christian2')?.tree.id, 'denmark', 'the Christian II is drawn in the Denmark tree');
assert.equal(nodeForVehicle('christian2')?.node.slot, 'special', 'as its special');
assert.deepEqual(TECH_TREES.find((tree) => tree.id === 'sweden').nations, ['Sweden'], "Sweden's tree is Sweden's alone");
// the team country
assert.equal(countryOfVehicle('christian2', 'Denmark'), 'denmark');
assert.equal(COUNTRY_ALLIES.denmark[0], 'sweden', 'Denmark fills first from Sweden');
console.log(`denmark.selftest: ${Object.keys(PACKETS).length} Danish marks at both qualities within their packets; the tree and the country`);
