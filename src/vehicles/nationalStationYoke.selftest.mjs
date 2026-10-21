// 2026-10-18 (release 227 land stage; geometry critic CN4-2 on the Yun's faceted station: "its trunnion is modelled
// through solid uprights, and the whole pitch group recoils 25 mm through them", 251-274 crossing pairs at every pose;
// the same yoke carries the Hetman II's and the Wilk's wedge stations and both Zubrs' WKM-B emplacements; UAPL-R6C-2:
// the Zubr's sight foot slid through its cheek's top at every pitch). The bored-trunnion yoke (profiles/
// nationalRoofWeapon.ts boredYoke): each station's pitch group, its box, sight, housing and trunnion pin, crosses no
// triangle of its yaw stage and keeps 1.5 mm from it through the whole pitch range and its published recoil stroke
// (1.5 mm, half the pin's 3 mm of air in its bored bearing); the whole pitch group recoiling the old 25 mm must cross
// its bearings (a negative control).
import assert from 'node:assert/strict';
import { createTank } from './tankFactory.ts';
import { NATIONAL_ROOF_LOADOUTS } from './nationalRoofConfig.ts';
import { auxiliaryWeaponProfile } from './auxiliaryWeapons.ts';
import { stationSelfClearance } from './cnTurretGeometry.test-support.mjs';

const BORED = { t80u_yun: 'wedge', t72b3m_hetman_ii: 'wedge', t72b3m_wilk: 'wedge', t72b3_zubr: 'cradle', t72b3_zubr_ii: 'casemate' };
const STROKE = .0015;
for (const [id, mount] of Object.entries(BORED)) {
  const l = NATIONAL_ROOF_LOADOUTS[id];
  assert.equal(l.mount, mount, `${id}: the ${mount} station`);
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  try {
    tank.root.updateMatrixWorld(true);
    const station = tank.root.getObjectByName('rig_turret').getObjectByName(l.name), pitch = station?.getObjectByName('auxiliaryWeaponPitch');
    assert.ok(station && pitch, `${id}: yaw and pitch owners`);
    assert.equal(pitch.getObjectByName('auxiliaryWeaponRecoil') === undefined, true, `${id}: the whole pitch group recoils (no recoil group)`);
    assert.equal(station.userData.auxiliaryRecoilM, STROKE, `${id}: the published recoil stroke stays inside the bearing's air`);
    const prof = auxiliaryWeaponProfile(l.caliber, id);
    const range = { depression: prof.depressionRad, elevation: prof.elevationRad, step: Math.PI / 180 };
    const self = stationSelfClearance(station, pitch, { ...range, travel: STROKE });
    assert.equal(self.crossings, 0, `${id}: no triangle of the pitch group crosses the yoke through pitch and recoil`);
    assert.ok(self.d >= .0015, `${id}: the pitch group keeps 1.5 mm from its yoke (${(self.d * 1000).toFixed(2)} mm at ${(self.el * 180 / Math.PI).toFixed(1)} deg, recoil ${(self.r * 1000).toFixed(2)} mm)`);
    // (at the level pose only: the pin's crossing does not depend on the pitch)
    const whole = stationSelfClearance(station, pitch, { depression: 0, elevation: 0, travel: .025, wholeRecoil: true });
    assert.ok(whole.crossings > 0, `${id}: negative control: 25 mm of whole-group recoil carries the pin through its bearings`);
    console.log(`${id}: ${l.name} keeps ${(self.d * 1000).toFixed(1)} mm from its yoke over ${((range.depression + range.elevation) * 180 / Math.PI).toFixed(1)} deg of pitch and ${STROKE * 1000} mm of recoil (25 mm: ${whole.crossings} crossing pairs)`);
  } finally {
    tank.dispose?.();
  }
}
console.log('nationalStationYoke: PASS');
