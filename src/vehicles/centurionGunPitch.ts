// Release 262: the rebuilt Centurion family's measured gun depression (profiles/centurionFamily.ts). Each curve is the
// lowest gun pitch (deg, positive up) by absolute turret yaw at which the whole gun keeps 26 mm from its hull, measured
// with tools/gun-depression-sweep.mjs --no-suit on the rebuilt hulls (stations rounded shallower to 0.1 deg, never more
// than 0.35 deg shallower than the need, linear between them): the handbook's -10 deg ahead and abeam, shallower over
// the driver's hatch and periscopes and the front guard bins, and over the raised engine deck astern (the Sho't Kal's
// AVDS-1790 hump the most). No mount conflicts and no blocks at +20 deg on any of the four.
// profiles/centurionGunClearance.selftest.mjs holds the barrel (25 mm) and the mount (20 mm) to these stops.
import type { GunPitchByYawCurve } from '../sim/gunPitchLimits.ts';
import type { TankSpecRegistry } from './specContracts.ts';

const CENTURION_GUN_PITCH_BY_YAW: Readonly<Record<string, GunPitchByYawCurve>> = Object.freeze({
  // depression 10, elevation 20; mountConflicts []
  centurion3: [
    [0, -10], [1, -10], [7, -8.5], [11, -8.1], [24, -7.9], [31, -7.1], [34, -7.1], [37, -7.8], [41, -9.1], [43, -9],
    [45, -9], [48, -9.5], [50, -10], [132, -10], [133, -9.8], [134, -8.5], [135, -7.8], [136, -7.5], [157, -3.5],
    [158, -3.4], [166, -3.2], [172, -3.2], [180, -3.3]],
});

/** Publish the measured curves on the registry's specs (after every spec pack has registered). */
export function applyCenturionGunPitch(registry: TankSpecRegistry): void {
  for (const [id, curve] of Object.entries(CENTURION_GUN_PITCH_BY_YAW)) {
    const spec = registry[id];
    if (!spec) throw new Error(`centurionGunPitch: unknown tank ${id}`);
    spec.gunPitchByYawDeg = curve;
  }
}
