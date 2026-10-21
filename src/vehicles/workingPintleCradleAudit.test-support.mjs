// Release 229 (the owner's field-equipment standard: nothing that moves passes through what does not; the CN lane's
// critic D4, carried to the whole fleet): every working station built by FITTINGS.pintleMG (a crew-served `working` rig
// or a `remoteControlled` one, the shared Browning-family construction) rides its cradle (FittingOptions.ridingCradle,
// machineGunGeometry.ts addPintleRidingCradle): its cradle, trunnion pin and any shield pitch with the gun, and the gun
// recoils inside the cradle in its own group. The fleet's old working rig kept the cradle, the shield and the yoke bridge
// on the yaw stage while the gun pitched about the receiver's centre, so at full elevation the receiver swept ~22 mm into
// the bridge, the barrel passed through the shield's top beam and the can met the shield's brace.
//
// The audit (fleetPassDefault's build) finds every such station on every vehicle and measures it as it stands on the
// vehicle (cnTurretGeometry.test-support.mjs stationSelfClearance): through its weapon profile's whole pitch range
// (auxiliaryWeapons.ts, the calibre's or the vehicle's own) and the gun's recoil stroke, the moving parts keep 1.5 mm
// from every part of the mount that does not pitch, no moving triangle crosses the yaw stage, and the recoiling gun
// crosses nothing of its cradle. The American M2 and RWS constructions and the external cradles a host builds round the
// gun (mount: 'external-cradle') are other constructions and are not counted.
import assert from 'node:assert/strict';
import { stationSelfClearance } from './cnTurretGeometry.test-support.mjs';
import { auxiliaryWeaponProfile } from './auxiliaryWeapons.ts';

/** The clearance every working pintle's moving parts keep from its own mount (metres). */
export const WORKING_PINTLE_CLEARANCE_M = 0.0015;

/** The working FITTINGS.pintleMG stations under `root`: [{ station, pitch }]. */
export function workingPintleStations(root) {
  const out = [];
  root.traverse((o) => {
    const u = o.userData;
    if (u.fitting !== 'pintleMG' || u.browningDerivedStandard !== 'cot-browning-family-v2' || !u.remoteControlled) return;
    if (!u.weaponClass || u.americanWeaponStandard || u.americanRwsFamily || u.mount === 'external-cradle') return;
    const pitch = o.children.find((c) => c.name === 'auxiliaryWeaponPitch');
    if (pitch) out.push({ station: o, pitch });
  });
  return out;
}

/** One station's verdict over its vehicle's profile for its calibre; throws on a station that does not ride its cradle
 * or whose moving parts come within the clearance of its mount. Returns the measurement. */
export function assertWorkingPintleClear(id, station, pitch) {
  const label = `${id}: ${station.name}`;
  assert.ok(Number.isFinite(station.userData.auxiliaryRecoilM) && pitch.getObjectByName('auxiliaryWeaponRecoil'),
    `${label}: a working pintle rides its cradle (FittingOptions.ridingCradle), its gun recoiling in its own group`);
  const profile = auxiliaryWeaponProfile(station.userData.caliberMm || 12.7, id);
  // 1-degree steps, 5 mm samples and a 4 mm cap (cnStations measures its two emplacements at 0.5 degrees and 4 mm): about
  // a hundred stations ride in the default fleet pass
  const self = stationSelfClearance(station, pitch, { depression: profile.depressionRad, elevation: profile.elevationRad,
    step: Math.PI / 180, h: .005, cap: .004 });
  const where = `${(self.el * 180 / Math.PI).toFixed(1)} deg, recoil ${(self.r * 1000).toFixed(0)} mm`;
  assert.ok(self.d >= WORKING_PINTLE_CLEARANCE_M,
    `${label}: the moving parts keep 1.5 mm from their own mount through pitch and recoil (${(self.d * 1000).toFixed(2)} mm at ${where})`);
  assert.equal(self.crossings, 0, `${label}: no moving triangle crosses the yaw stage`);
  assert.equal(self.gunCradle?.crossings, 0, `${label}: the recoiling gun crosses nothing of its cradle over its stroke`);
  return self;
}

export function createWorkingPintleCradleAudit({ minimumStations = 1 } = {}) {
  let stations = 0, vehicles = 0, worst = { d: Infinity, label: '' };
  return {
    check(id, tank) {
      const found = workingPintleStations(tank.root);
      if (!found.length) return;
      tank.root.updateMatrixWorld(true);
      vehicles++;
      for (const { station, pitch } of found) {
        const self = assertWorkingPintleClear(id, station, pitch);
        stations++;
        if (self.d < worst.d) worst = { d: self.d, label: `${id}: ${station.name}` };
      }
    },
    finish() {
      assert.ok(stations >= minimumStations, `the audit measured ${stations} working pintles, expected at least ${minimumStations}`);
      console.log(`workingPintleCradle: ${stations} working pintles on ${vehicles} vehicles ride their cradles, `
        + `${(WORKING_PINTLE_CLEARANCE_M * 1000).toFixed(1)} mm clear of their own mounts (closest ${(worst.d * 1000).toFixed(1)} mm, ${worst.label})`);
    },
  };
}
