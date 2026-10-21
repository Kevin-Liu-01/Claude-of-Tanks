// Release 229 (the owner's field-equipment standard: nothing that moves passes through what does not; the CN lane's
// critic D4, carried to the whole fleet): every working station built by FITTINGS.pintleMG (a crew-served `working` rig
// or a `remoteControlled` one, the shared Browning-family construction) rides its cradle (FittingOptions.ridingCradle,
// machineGunGeometry.ts addPintleRidingCradle): its cradle, trunnion pin and any shield pitch with the gun, and the gun
// recoils inside the cradle in its own group. The fleet's old working rig kept the cradle, the shield and the yoke bridge
// on the yaw stage while the gun pitched about the receiver's centre, so at full elevation the receiver swept ~22 mm into
// the bridge, the barrel passed through the shield's top beam and the can met the shield's brace.
//
// Release 230: the American constructions ride theirs too (profiles/kit.ts): the M2HB and M240 working stations of
// FITTINGS.americanM2 (the Abrams loaders' skate, LGS and LAGS mounts, the Sheridan's, Patton's and M60's commander guns),
// the TTS-derived FITTINGS.americanRws towers and the armed FITTINGS.openYokeRws towers. Their fleet rigs sat at 0 mm with
// 2,900-6,300 crossing triangle pairs each (the receiver through the yoke head or the cross-shaft, the barrel through the
// shield, the coffin through the fork arm or the sensor head).
//
// The audit (fleetPassDefault's build) finds every such station on every vehicle and measures it as it stands on the
// vehicle (cnTurretGeometry.test-support.mjs stationSelfClearance): through its weapon profile's whole pitch range
// (auxiliaryWeapons.ts, the calibre's or the vehicle's own) and the gun's recoil stroke, the moving parts keep 1.5 mm
// from every part of the mount that does not pitch, no moving triangle crosses the yaw stage, and the recoiling gun
// crosses nothing of its cradle. The external cradles a host builds round the gun (mount: 'external-cradle') are other
// constructions and are not counted; nor is an open-yoke optics tower that carries no gun. The mount measured is the one
// the fitting builds (its meshes' `fitting`): stock a vehicle's builder hangs on the station (an RWS's housing, sensors, a
// tower's head; 22 stations at release 229, 18 of them met by their gun as on the fleet rig before) is that builder's, and
// the audit counts the stations carrying it.
import assert from 'node:assert/strict';
import { stationSelfClearance } from './cnTurretGeometry.test-support.mjs';
import { auxiliaryWeaponProfile } from './auxiliaryWeapons.ts';

/** The clearance every working pintle's moving parts keep from its own mount (metres). */
const WORKING_PINTLE_CLEARANCE_M = 0.0015;

/** A mesh the station's fitting itself built (its yaw stage, cradle and gun), not stock a builder hung on the station. */
const fittingOwn = (mesh) => ['pintleMG', 'openYokeRws', 'auxiliaryWeapon'].includes(mesh.userData.fitting);

/** The construction a working station under its fitting's userData was built by, or null for one the audit does not
 * count. */
function workingConstruction(u) {
  if (u.americanRwsFamily) return 'americanRws';
  if (u.designFamily === 'abramsx-open-yoke-v1') return u.hasWeapon ? 'openYokeRws' : null;
  if (u.americanWeaponStandard) return u.remoteControlled ? 'americanM2' : null;
  if (u.fitting !== 'pintleMG' || u.browningDerivedStandard !== 'cot-browning-family-v2' || !u.remoteControlled) return null;
  return u.weaponClass && u.mount !== 'external-cradle' ? 'pintleMG' : null;
}

/** The working stations under `root`: [{ station, pitch, construction }]. */
function workingStations(root) {
  const out = [];
  root.traverse((o) => {
    const construction = workingConstruction(o.userData);
    if (!construction) return;
    const pitch = o.children.find((c) => c.name === 'auxiliaryWeaponPitch');
    if (pitch) out.push({ station: o, pitch, construction });
  });
  return out;
}

/** One station's verdict over its vehicle's profile for its calibre; throws on a station that does not ride its cradle
 * or whose moving parts come within the clearance of its mount. Returns the measurement. */
export function assertWorkingPintleClear(id, station, pitch) {
  const label = `${id}: ${station.name}`;
  assert.ok(Number.isFinite(station.userData.auxiliaryRecoilM) && pitch.getObjectByName('auxiliaryWeaponRecoil'),
    `${label}: a working station rides its cradle, its gun recoiling in its own group`);
  const profile = auxiliaryWeaponProfile(station.userData.caliberMm || 12.7, id);
  // 1-degree steps, 5 mm samples and a 4 mm cap (cnStations measures its two emplacements at 0.5 degrees and 4 mm): about
  // a hundred and twenty stations ride in the default fleet pass
  const self = stationSelfClearance(station, pitch, { depression: profile.depressionRad, elevation: profile.elevationRad,
    step: Math.PI / 180, h: .005, cap: .004 });
  const where = `${(self.el * 180 / Math.PI).toFixed(1)} deg, recoil ${(self.r * 1000).toFixed(0)} mm`;
  assert.ok(self.d >= WORKING_PINTLE_CLEARANCE_M,
    `${label}: the moving parts keep 1.5 mm from their own mount through pitch and recoil (${(self.d * 1000).toFixed(2)} mm at ${where})`);
  assert.equal(self.crossings, 0, `${label}: no moving triangle crosses the yaw stage`);
  assert.equal(self.gunCradle?.crossings, 0, `${label}: the recoiling gun crosses nothing of its cradle over its stroke`);
  return self;
}

/** `minimumStations`: the fewest stations of each construction the fleet must show (a selector that stops finding a
 * construction fails the audit rather than passing it unmeasured). */
export function createWorkingPintleCradleAudit({ minimumStations = { pintleMG: 1 } } = {}) {
  const stations = {}, vehicles = new Set();
  let hosted = 0, worst = { d: Infinity, label: '' };
  return {
    check(id, tank) {
      const found = workingStations(tank.root);
      if (!found.length) return;
      tank.root.updateMatrixWorld(true);
      vehicles.add(id);
      for (const { station, pitch, construction } of found) {
        const self = assertWorkingPintleClear(id, station, pitch);
        stations[construction] = (stations[construction] ?? 0) + 1;
        let carries = false; station.traverse((o) => { if (o.isMesh && !fittingOwn(o)) carries = true; });
        if (carries) hosted++;
        if (self.d < worst.d) worst = { d: self.d, label: `${id}: ${station.name}` };
      }
    },
    finish() {
      for (const [construction, minimum] of Object.entries(minimumStations)) {
        assert.ok((stations[construction] ?? 0) >= minimum,
          `the audit measured ${stations[construction] ?? 0} working ${construction} stations, expected at least ${minimum}`);
      }
      const counts = Object.entries(stations).map(([k, n]) => `${n} ${k}`).join(', ');
      console.log(`workingPintleCradle: ${counts} working stations on ${vehicles.size} vehicles ride their cradles, `
        + `${(WORKING_PINTLE_CLEARANCE_M * 1000).toFixed(1)} mm clear of their own mounts (closest ${(worst.d * 1000).toFixed(1)} mm, ${worst.label}); `
        + `${hosted} of them carry their builder's stock, measured with it`);
    },
  };
}
