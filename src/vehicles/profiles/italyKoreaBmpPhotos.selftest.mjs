// Release 268 (the owner, 2026-11-01: "now update the c2 protottype, c1 prototype s1, ariete preserie, carro 45t, K2B,
// xK2, bmp2, bmp 3 rok, bwp-1, k1e1"; 2026-11-02: "also update the cheiftainn mk 3 and mk 9"): the rebuilds that take
// stage A's photo route hold their packets (docs/references/photos/{ariete-prototypes,korea-k1e1-k2b,bmp-family}-20261101
// .json and chieftain-mk9-20261102.json):
// - each holds its as-built envelope, calibre, crew, launcher tubes and roof guns (the gate's roof-weapon census);
// - bmp3_rok draws the fleet's BMP-3 hull and sits its turret on the BMP-3's ring, not the BMP-2's;
// - bwp1's RCWS-30 is unmanned: every crew seat is in the hull, and the station carries the Spike-LR canister.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { censusEquipment } from '../../../tools/source-equipment-policy.mjs';

const FIXTURE = 'src/vehicles/profiles/italyKoreaBmpPhotos.selftest.mjs';
const IDS = ['c1_ariete_proto_serie1', 'c2_ariete_proto', 'k1e1', 'k2b', 'bmp3_rok', 'bwp1', 'chieftain_mk9'];
const checked = [];
for (const file of ['ariete-prototypes-20261101.json', 'korea-k1e1-k2b-20261101.json', 'bmp-family-20261101.json',
  'chieftain-mk9-20261102.json']) {
  const packet = JSON.parse(readFileSync(new URL(`../../../docs/references/photos/${file}`, import.meta.url), 'utf8'));
  for (const [id, target] of Object.entries(packet.targets)) {
    assert.equal(target.test, FIXTURE, `${id}: the packet names this fixture`);
    const spec = getSpec(id);
    assert.equal(spec.gun.caliberMm, target.caliberMm, `${id}: its calibre`);
    assert.equal(spec.gun.launcherMuzzles?.length ?? 0, target.launcherTubes, `${id}: its launcher tubes`);
    assert.equal(spec.armor.crew.length, target.crew, `${id}: its crew`);
    assert.equal(spec.armor.crew.some((c) => c.turretLocal), !target.unmannedTurret, `${id}: turret crew`);
    for (const quality of ['high', 'low']) {
      const tank = createTank(id, null, { quality, proceduralOnly: true, geometryReceipt: true, camoSeed: 4242 });
      tank.root.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(tank.root);
      for (const [key, value] of [['widthM', b.max.x - b.min.x], ['overallLengthM', b.max.z - b.min.z], ['tallestM', b.max.y]]) {
        assert.ok(Math.abs(value - target[key]) / target[key] <= packet.dimensionToleranceFraction,
          `${id} ${quality}: ${key} ${value.toFixed(3)} m vs the packet's ${target[key]}`);
      }
      const census = censusEquipment(tank.root);
      assert.equal(census.invalidWeaponMarkers, 0, `${id} ${quality}: no nonphysical weapon marker`);
      assert.equal(census.mg, target.roofMachineGuns, `${id} ${quality}: ${target.roofMachineGuns} roof guns`);
      tank.dispose?.();
    }
    checked.push(id);
  }
}
assert.deepEqual(checked.toSorted(), IDS.toSorted(), 'the packets hold exactly these rebuilds');
assert.deepEqual(getSpec('bmp3_rok').armor.turretPivot, getSpec('bmp3').armor.turretPivot,
  'bmp3_rok: its turret sits on the BMP-3 ring');
console.log(`italyKoreaBmpPhotos: ${checked.length} photo-route rebuilds hold their packets`);
