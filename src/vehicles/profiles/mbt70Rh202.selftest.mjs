// MBT-70 roof weapon (owner markup 2026-10-14 on its M2-derived machine-gun body; coordinator ruling: the KPz 70's
// calibre-true 20 mm Rh 202 remote station and its weapon profile). The working roof gun is the 20 mm station on the
// commander's station top, firing the 20 mm profile; no .50-calibre M2 remains on the turret; its traverse arc and
// depression table hold against the built stock.
// 2026-10-21 (owner: "the mbt 70 needs a proper gun turret with a gun housing for a machine gun"): the station is a
// small gun turret, an armoured housing on trunnions in an armoured yoke that elevates with the gun, the gun recoiling
// inside it. Measured as workingPintleCradleAudit measures a working station (cnTurretGeometry.test-support.mjs
// stationSelfClearance, every station mesh, the vehicle's weapon profile): through the whole pitch range and the recoil
// stroke the moving housing and gun keep 1.5 mm from the yaw stage, no moving triangle crosses it, and the recoiling gun
// crosses nothing of its housing and keeps 1.5 mm from it.
import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';
import { AUXILIARY_INVENTORY } from '../auxiliaryInventory.generated.ts';
import { auxiliaryWeaponProfile } from '../auxiliaryWeapons.ts';
import { stationSelfClearance } from '../cnTurretGeometry.test-support.mjs';
import { stationDepression, stationProbe } from '../../../tools/roof-station-arcs.mjs';
import { MBT70_RH202_RECOIL_M } from './mbt70Rh202.ts';

const CLEARANCE_M = 0.0015;
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
  const pitch = station?.getObjectByName('auxiliaryWeaponPitch'), recoil = pitch?.getObjectByName('auxiliaryWeaponRecoil');
  assert.ok(pitch, `${quality}: the station pitches real stock`);
  // the housing elevates with the gun (the pitch stage's own meshes); the gun recoils inside it in its own group
  assert.ok(pitch.children.some((o) => o.isMesh), `${quality}: the armoured housing pitches with the gun`);
  assert.ok(recoil?.children.some((o) => o.isMesh), `${quality}: the gun recoils in its own group`);
  assert.equal(station.userData.auxiliaryRecoilM, MBT70_RH202_RECOIL_M, `${quality}: the station publishes its recoil stroke`);
  let yawMeshes = 0; for (const o of station.children) if (o.isMesh) yawMeshes++;
  assert.ok(yawMeshes > 0, `${quality}: the turntable and yoke turn with the station`);
  if (quality === 'high') {
    // the audit's settings (workingPintleCradleAudit.test-support.mjs): 1-degree steps, 5 mm samples, a 4 mm cap
    const self = stationSelfClearance(station, pitch, { depression: profile.depressionRad, elevation: profile.elevationRad,
      step: Math.PI / 180, h: .005, cap: .004 });
    const where = `${(self.el * 180 / Math.PI).toFixed(1)} deg, recoil ${(self.r * 1000).toFixed(0)} mm`;
    assert.equal(self.stroke, MBT70_RH202_RECOIL_M, 'the sweep runs the gun through its own recoil stroke');
    assert.ok(self.d >= CLEARANCE_M, `the housing and gun keep 1.5 mm from the yoke and turntable (${(self.d * 1000).toFixed(2)} mm at ${where})`);
    assert.equal(self.crossings, 0, 'no moving triangle crosses the yaw stage');
    assert.equal(self.gunCradle?.crossings, 0, 'the recoiling gun crosses nothing of its housing over its stroke');
    assert.ok(self.gunCradle.bearing >= CLEARANCE_M,
      `the recoiling gun keeps 1.5 mm from its housing (${(self.gunCradle.bearing * 1000).toFixed(2)} mm)`);
    const { probe } = stationProbe(tank.root, station), DEG = Math.PI / 180;
    for (let yaw = gun.yawArc[0]; yaw <= gun.yawArc[1] + 1e-9; yaw += DEG) {
      for (let p = 0; p <= profile.elevationRad + 1e-9; p += .05) assert.ok(!probe(yaw, p), `clear at ${(yaw / DEG).toFixed(0)}°, +${p.toFixed(2)}`);
    }
    // The depression the authority allows at a yaw (auxiliarySystems.ts depressionAt: outside a depression table, or
    // with none, the profile's; inside it the lesser end of the interval) holds against the stock over the whole arc:
    // every half degree, and every 0.05 degree across a table's span (a whip's tip is a few centimetres across).
    const table = gun.depressionByYaw ?? [];
    const allowed = (yaw) => {
      if (!table.length || yaw < table[0][0] || yaw > table.at(-1)[0]) return profile.depressionRad;
      for (let i = 1; i < table.length; i++) if (yaw <= table[i][0]) return Math.min(profile.depressionRad, table[i - 1][1], table[i][1]);
      return Math.min(profile.depressionRad, table.at(-1)[1]);
    };
    const yaws = [];
    for (let deg = gun.yawArc[0] / DEG; deg < gun.yawArc[1] / DEG; deg += 0.5) yaws.push(deg);
    if (table.length) for (let deg = table[0][0] / DEG; deg <= table.at(-1)[0] / DEG; deg += 0.05) yaws.push(deg);
    yaws.push(gun.yawArc[1] / DEG);
    stationDepression(tank.root, station, profile, yaws).forEach((deepest, i) => {
      const want = allowed(yaws[i] * DEG);
      assert.ok(want <= deepest + 1e-9, `the allowed ${want} rad depression holds at ${yaws[i].toFixed(2)}° (measured ${deepest})`);
    });
  }
  tank.dispose();
}
console.log('mbt70Rh202: the 20 mm Rh 202 remote station is the working roof gun (20x139 mm, between the heavy MG and the 30 mm), '
  + 'an armoured gun housing elevating with it and the gun recoiling inside it, 1.5 mm clear through pitch and recoil; '
  + 'no M2 remains, arc and depression hold against the stock');
