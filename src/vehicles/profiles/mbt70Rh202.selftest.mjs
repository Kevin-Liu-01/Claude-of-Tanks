// MBT-70 roof weapon (owner markup 2026-10-14 on its M2-derived machine-gun body; coordinator ruling: the KPz 70's
// calibre-true 20 mm Rh 202 remote station and its weapon profile). The working roof gun is the 20 mm station on the
// commander's station top, firing the 20 mm profile; no .50-calibre M2 remains on the turret; its traverse arc and
// depression table hold against the built stock.
import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';
import { AUXILIARY_INVENTORY } from '../auxiliaryInventory.generated.ts';
import { auxiliaryWeaponProfile } from '../auxiliaryWeapons.ts';
import { stationDepression, stationProbe } from '../../../tools/roof-station-arcs.mjs';

const kit = AUXILIARY_INVENTORY.mbt70;
assert.equal(kit.guns.length, 1, 'one remote station');
const [gun] = kit.guns;
assert.equal(gun.name, 'mbt70Rh202Station');
assert.equal(gun.caliberMm, 20, 'the Rh 202 is a 20 mm');
assert.ok(gun.yawArc && gun.yawArc[0] < -2.6 && gun.yawArc[1] > 2.6, 'nearly all-round traverse, stopped short of the rear whips');

const profile = auxiliaryWeaponProfile(20, 'mbt70'), heavy = auxiliaryWeaponProfile(12.7), cannon = auxiliaryWeaponProfile(30);
assert.equal(profile.shell.caliberMm, 20);
assert.match(profile.shell.name, /^20×139 mm/, 'the Rh 202 cartridge');
for (const key of ['pen100Mm', 'pen1000Mm', 'dmg', 'moduleDmg']) {
  assert.ok(profile.shell[key] > heavy.shell[key] && profile.shell[key] < cannon.shell[key], `${key} between the heavy MG and the 30 mm`);
}
assert.ok(profile.rangeM > heavy.rangeM && profile.rangeM < cannon.rangeM, 'range between the two');
assert.equal(auxiliaryWeaponProfile(20).shell.caliberMm, 30, 'other 20-30 mm stations keep the shared cannon profile');

for (const quality of ['high', 'low']) {
  const tank = createTank('mbt70', null, { proceduralOnly: true, geometryReceipt: true, decor: true, quality });
  tank.root.updateMatrixWorld(true);
  const turret = tank.root.getObjectByName('rig_turret');
  let m2 = 0; turret.traverse((o) => { if (/M2HB|browningDerived/.test(o.name)) m2++; });
  assert.equal(m2, 0, `${quality}: no .50-calibre M2 on the turret`);
  const station = tank.root.getObjectByName('mbt70Rh202Station');
  assert.ok(station?.getObjectByName('auxiliaryWeaponPitch'), `${quality}: the station pitches real stock`);
  if (quality === 'high') {
    const { probe } = stationProbe(tank.root, station), DEG = Math.PI / 180;
    for (let yaw = gun.yawArc[0]; yaw <= gun.yawArc[1] + 1e-9; yaw += DEG) {
      for (let p = 0; p <= profile.elevationRad + 1e-9; p += .05) assert.ok(!probe(yaw, p), `clear at ${(yaw / DEG).toFixed(0)}°, +${p.toFixed(2)}`);
    }
    for (const [yaw, depression] of gun.depressionByYaw) {
      const [deepest] = stationDepression(tank.root, station, profile, [yaw / DEG]);
      assert.ok(depression <= deepest + 1e-9, `the table's ${depression} rad holds at ${(yaw / DEG).toFixed(0)}° (measured ${deepest})`);
    }
  }
  tank.dispose();
}
console.log('mbt70Rh202: the 20 mm Rh 202 remote station is the working roof gun (20x139 mm, between the heavy MG and the 30 mm), no M2 remains, arc and depression hold against the stock');
