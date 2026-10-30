// Release 263: the rebuilt Centurion Mk 3 and Strv 81's measured gun depression (profiles/centurionFamily.ts). Each
// curve is the lowest gun pitch (deg, positive up) by absolute turret yaw at which the whole gun keeps 26 mm from its
// hull, measured with tools/gun-depression-sweep.mjs --no-suit on the rebuilt hulls (stations rounded shallower to
// 0.1 deg, never more than 0.35 deg shallower than the need, linear between them): the handbook's -10 deg ahead and
// abeam, shallower over the driver's hatch and periscopes and the front guard bins, and over the engine deck astern -
// the Strv 81B's rear stowage box holds it 2.3 deg up. No mount conflicts and no blocks at +20 deg on either.
// profiles/centurionGunClearance.selftest.mjs holds the barrel (25 mm) and the mount (20 mm) to these stops.
import type { GunPitchByYawCurve } from '../sim/gunPitchLimits.ts';
import type { TankSpecRegistry } from './specContracts.ts';

const CENTURION_GUN_PITCH_BY_YAW: Readonly<Record<string, GunPitchByYawCurve>> = Object.freeze({
  // depression 10, elevation 20; mountConflicts []
  centurion3: [
    [0, -10], [1, -10], [7, -8.5], [11, -8.1], [24, -7.9], [31, -7.1], [34, -7.1], [37, -7.8], [41, -9.1], [43, -9],
    [45, -9], [48, -9.5], [50, -10], [51, -9.8], [54, -9.7], [57, -10], [124, -10], [130, -9], [133, -9],
    [135, -7.8], [136, -7.5], [157, -3.5], [158, -3.4], [166, -3.2], [172, -3.2], [175, -3.3], [176, -2.9],
    [179, -2.9], [180, -3.2]],
  // depression 10, elevation 20; mountConflicts []
  strv81: [
    [0, -10], [1, -10], [7, -8.5], [11, -8.1], [17, -8.1], [18, -8.2], [19, -7.3], [20, -6.9], [21, -6.6],
    [32, -5.9], [34, -5.9], [37, -6.5], [39, -7.2], [40, -7.9], [41, -9], [45, -8.9], [50, -10], [51, -9.8],
    [53, -9.7], [55, -9.8], [57, -10], [124, -10], [130, -9], [133, -9], [135, -7.7], [139, -6.3], [142, -5.7],
    [144, -4.5], [151, -3.5], [161, -2.9], [162, -2.9], [163, 1.3], [164, 2.1], [167, 2.2], [180, 2.3]],
});

/** Publish the measured curves on the registry's specs (after every spec pack has registered). */
export function applyCenturionGunPitch(registry: TankSpecRegistry): void {
  for (const [id, curve] of Object.entries(CENTURION_GUN_PITCH_BY_YAW)) {
    const spec = registry[id];
    if (!spec) throw new Error(`centurionGunPitch: unknown tank ${id}`);
    spec.gunPitchByYawDeg = curve;
  }
}
