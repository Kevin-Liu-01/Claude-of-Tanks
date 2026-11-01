// The M41 Walker Bulldog family (release 265; docs/references/tanks/m41a3.md): the native fixture of profiles/m41.ts at both
// qualities. The M41A3's datums are its registered print's (SIpriv's "Low poly M41Walker Bulldog", scaled once on the
// published 5.82 m hull): five 0.716 m road wheels, the turret on its 1.44 m base with a 0.74 m roof, the muzzle on 5.21 m.
// The Bundeswehr, JGSDF and Danish DK-1 marks share the build and carry their own kit; each derivative's as-built envelope
// holds its photo packet (docs/references/photos/m41-*-20261029.json). Every mark sits in its own nation's tree. The T49
// (the owner 2026-10-30) is the US hull under the M551's turret and 152 mm gun-launcher, a tier over the M41A3.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { ensureInteriorFills } from '../interiorFills.ts';
import { nodeForVehicle } from '../../techTree/trees.ts';
import { displayTier } from '../../techTree/tiers.ts';

const MARKS = {
  'm41a3': { nation: 'USA', tree: 'usa', tier: 1, packet: null },
  'm41_bw': { nation: 'Germany', tree: 'germany', tier: 1, packet: 'm41-bundeswehr-20261029.json' },
  'm41_jgsdf': { nation: 'Japan', tree: 'japan', tier: 1, packet: 'm41-jgsdf-20261029.json' },
  'm41dk1': { nation: 'Denmark', tree: 'denmark', tier: 2, packet: 'm41-dk-1-20261029.json' },
};
await ensureInteriorFills([...Object.keys(MARKS), 't49']);
const near = (actual, expected, label, tolerance = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual.toFixed(3)} m, expected ${expected} m`);

for (const [id, mark] of Object.entries(MARKS)) {
  const spec = getSpec(id);
  assert.equal(spec.nation, mark.nation, `${id}: ${mark.nation}'s`);
  assert.equal(spec.role, 'light', `${id}: a light tank`);
  assert.equal(spec.gun.caliberMm, 76, `${id}: the 76 mm M32`);
  assert.equal(nodeForVehicle(id)?.tree.id, mark.tree, `${id}: drawn in its nation's tree`);
  assert.equal(displayTier(id), mark.tier, `${id}: Main's tier`);
  const packetPath = mark.packet ? new URL(`../../../docs/references/photos/${mark.packet}`, import.meta.url) : null;
  const target = packetPath && existsSync(packetPath) ? JSON.parse(readFileSync(packetPath, 'utf8')).targets[id] : null;
  for (const quality of ['high', 'low']) {
    const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, quality, camoSeed: 4242 });
    try {
      tank.root.updateMatrixWorld(true);
      const turret = tank.root.getObjectByName('rig_turret'), gun = tank.root.getObjectByName('rig_gun');
      const r = turret.userData.m41TurretReceipt, g = gun.userData.m41MantletReceipt;
      assert.equal(r?.mark, { m41a3: 'us', m41_bw: 'bw', m41_jgsdf: 'jgsdf', m41dk1: 'dk1' }[id], `${id} ${quality}: its mark`);
      near(r.roofY, 0.74, `${id} ${quality} turret roof over its base`, 0.001);
      near(turret.getWorldPosition(new THREE.Vector3()).y, 1.44, `${id} ${quality} turret base`);
      // the muzzle on the print's 5.21 m
      near(new THREE.Box3().setFromObject(gun).max.z, 5.21, `${id} ${quality} muzzle`, 0.05);
      const dk = id === 'm41dk1';
      assert.equal(r.sideBaskets, dk, `${id} ${quality}: mesh baskets on the DK-1 only`);
      assert.equal(r.bustleRack, !dk, `${id} ${quality}: the bustle rack on the originals`);
      assert.equal(r.dischargers, dk ? 8 : 0, `${id} ${quality}: Wegmann dischargers on the DK-1`);
      assert.equal(g.thermalSightBox, dk ? 'right' : null, `${id} ${quality}: the DK-1's thermal sight box on the shield's right`);
      // the owner 2026-10-30: the gun shield a broad casting proud of the turret's face; the DK-1's under its canvas
      assert.equal(g.proudShield?.widthM ?? null, dk ? null : 1.28, `${id} ${quality}: the proud gun shield`);
      if (target) {
        const box = new THREE.Box3().setFromObject(tank.root);
        for (const [label, actual, want] of [['width', box.max.x - box.min.x, target.widthM],
          ['length', box.max.z - box.min.z, target.overallLengthM], ['tallest', box.max.y, target.tallestM]]) {
          assert.ok(Math.abs(actual - want) / want <= 0.03, `${id} ${quality} ${label}: ${actual.toFixed(3)} against the packet's ${want}`);
        }
      }
    } finally {
      tank.dispose?.();
    }
  }
}
{
  const id = 't49', spec = getSpec(id);
  assert.equal(spec.nation, 'USA', `${id}: the USA's`);
  assert.equal(spec.role, 'light', `${id}: a light tank`);
  assert.equal(spec.gun.caliberMm, 152, `${id}: the M551's 152 mm gun-launcher`);
  assert.ok(spec.gun.shells.some((shell) => shell.guided), `${id}: the Shillelagh`);
  assert.ok(!spec.armor.turretPlates.some((plate) => plate.kind === 'era'), `${id}: no ERA sectors`);
  assert.equal(nodeForVehicle(id)?.tree.id, 'usa', `${id}: drawn in the US tree`);
  assert.equal(displayTier(id), 2, `${id}: a tier over the M41A3`);
  for (const quality of ['high', 'low']) {
    const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, quality, camoSeed: 4242 });
    try {
      tank.root.updateMatrixWorld(true);
      const turret = tank.root.getObjectByName('rig_turret');
      assert.equal(turret.userData.m41TurretReceipt, undefined, `${id} ${quality}: not the M41's turret`);
      near(turret.getWorldPosition(new THREE.Vector3()).y, 1.37, `${id} ${quality} the M551 turret on its low ring boss`);
      // the M551's tube to 3.19 m ahead of its pivot, the pivot 0.30 m aft of the M41's ring
      near(new THREE.Box3().setFromObject(tank.root.getObjectByName('rig_gun')).max.z, 3.09, `${id} ${quality} muzzle`, 0.05);
    } finally {
      tank.dispose?.();
    }
  }
}
console.log(`m41.selftest: ${Object.keys(MARKS).length} M41 marks at both qualities on the print's datums, each in its nation's tree; the T49`);
