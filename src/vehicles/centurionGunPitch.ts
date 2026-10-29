// Release 262: the rebuilt Centurion family's measured gun depression (profiles/centurionFamily.ts). Each curve is the
// lowest gun pitch (deg, positive up) by absolute turret yaw at which the whole gun keeps 26 mm from its hull, measured
// with tools/gun-depression-sweep.mjs --no-suit on the rebuilt hulls (stations rounded shallower to 0.1 deg, never more
// than 0.35 deg shallower than the need, linear between them): the handbook's -10 deg ahead and abeam, shallower over
// the driver's hatch and periscopes and the front guard bins, and over the engine deck astern - the Sho't Kal's
// AVDS-1790 hump holds its gun about level there and the Strv 81B's rear stowage box 2.3 deg up; the Strv 105's lamps
// on its front bins hold it at -3.5 deg over the bow quarters; the Olifant's gun, at mid-height in its box turret,
// keeps -10 deg ahead and abeam and -7.6 over the bow quarters; the AVRE's dozer gear on the bow and its 165 mm's fat
// drum hold it at -4.9 deg ahead, -3.4 over the bow quarters and -1.5 astern; the Australian Mk 5/1's lamps on its
// front bins' faces at -5 deg over the bow quarters (re-measured on the critics' rounds, 2026-10-28 and 10-29). No
// mount conflicts and no blocks at +20 deg on any of the nine. profiles/centurionGunClearance.selftest.mjs holds the
// barrel (25 mm) and the mount (20 mm) to these stops.
import type { GunPitchByYawCurve } from '../sim/gunPitchLimits.ts';
import type { TankSpecRegistry } from './specContracts.ts';

const CENTURION_GUN_PITCH_BY_YAW: Readonly<Record<string, GunPitchByYawCurve>> = Object.freeze({
  // depression 10, elevation 20; mountConflicts []
  centurion3: [
    [0, -10], [2, -9.1], [6, -8], [10, -7.5], [18, -7.5], [25, -7.8], [31, -7.1], [34, -7.1], [40, -8.2], [45, -8.3],
    [50, -9.3], [51, -9.1], [54, -9], [56, -9.2], [61, -10], [120, -10], [130, -8.4], [133, -8.3], [135, -7.1],
    [136, -6.8], [142, -5.8], [148, -5.2], [157, -3.5], [158, -3.4], [166, -3.2], [172, -3.2], [175, -3.3],
    [176, -2.9], [179, -2.9], [180, -3.2]],
  // depression 10, elevation 20; mountConflicts []
  centurion5_2: [
    [0, -10], [1, -9.2], [2, -8.5], [3, -8.3], [13, -7.7], [19, -7.7], [20, -7.2], [22, -6.9], [32, -6.4], [34, -6.4],
    [37, -6.9], [39, -7.4], [41, -8.4], [43, -8.2], [45, -8.2], [50, -9.6], [52, -9.3], [55, -9.4], [59, -10],
    [122, -10], [130, -8.6], [133, -8.6], [135, -7.4], [141, -5.5], [142, -5.2], [148, -4.3], [158, -3], [168, -2.9],
    [172, -2.9], [175, -3], [176, -2.5], [179, -2.5], [180, -2.9]],
  // depression 10, elevation 20; mountConflicts []
  strv81: [
    [0, -10], [1, -10], [7, -8.5], [11, -8.1], [17, -8.1], [18, -8.2], [19, -7.3], [20, -6.9], [21, -6.6],
    [32, -5.9], [34, -5.9], [37, -6.5], [39, -7.2], [40, -7.9], [41, -9], [45, -8.9], [50, -10], [51, -9.8],
    [53, -9.7], [55, -9.8], [57, -10], [124, -10], [130, -9], [133, -9], [135, -7.7], [139, -6.3], [142, -5.7],
    [144, -4.5], [151, -3.5], [161, -2.9], [162, -2.9], [163, 1.3], [164, 2.1], [167, 2.2], [180, 2.3]],
  // depression 10, elevation 20; mountConflicts []
  shot_kal: [
    [0, -10], [1, -9.2], [2, -8.5], [3, -8.3], [11, -7.9], [19, -7.7], [20, -7.2], [22, -6.9], [32, -6.4], [34, -6.4],
    [37, -6.9], [39, -7.4], [41, -8.4], [43, -8.2], [45, -8.2], [50, -9.7], [51, -9.5], [55, -9.5], [59, -10],
    [123, -10], [130, -8.7], [133, -8.7], [135, -7.5], [141, -5.5], [142, -5.2], [144, -4.9], [146, -2.7],
    [147, -2.2], [149, -1.6], [150, -0.5], [151, 0.1], [152, 0.4], [154, 0.6], [160, 0.5], [163, -0.1], [177, -0.2],
    [180, -0.3]],
  // depression 10, elevation 20; mountConflicts []
  centurion13: [
    [0, -9.7], [6, -8.4], [8, -8], [13, -7.7], [19, -7.7], [20, -7.2], [22, -6.9], [32, -6.4], [34, -6.4], [37, -6.9],
    [39, -7.4], [41, -8.4], [43, -8.2], [45, -8.2], [50, -9.6], [52, -9.3], [55, -9.4], [59, -10], [122, -10],
    [130, -8.6], [133, -8.6], [135, -7.4], [141, -5.5], [142, -5.2], [148, -4.3], [158, -3], [168, -2.9], [172, -2.9],
    [175, -3], [176, -2.5], [179, -2.5], [180, -2.9]],
  // depression 10, elevation 20; mountConflicts []
  strv105: [
    [0, -10], [1, -10], [2, -9.5], [5, -8.6], [8, -8], [16, -7.3], [21, -6.2], [22, -4.4], [23, -3.7], [25, -3.5],
    [30, -3.5], [31, -3.8], [32, -4.8], [33, -6.4], [34, -6.4], [37, -6.9], [39, -7.4], [41, -8.4], [43, -8.2],
    [45, -8.2], [50, -9.6], [52, -9.3], [55, -9.4], [59, -10], [122, -10], [130, -8.6], [133, -8.6], [135, -7.4],
    [141, -5.5], [142, -5.2], [148, -4.3], [158, -3], [168, -2.9], [172, -2.9], [180, -3]],
  // depression 10, elevation 20; mountConflicts []
  olifant_mk2: [
    [0, -10], [24, -10], [28, -8.7], [30, -8.4], [32, -8.4], [38, -9.9], [39, -10], [135, -10], [137, -9.5],
    [140, -9.1], [141, -8.3], [149, -8.1], [156, -6], [179, -6], [180, -6.1]],
  // depression 10, elevation 20; mountConflicts []
  centurion5_avre: [
    [0, -4.9], [1, -4.4], [2, -4.1], [8, -3.5], [13, -3.4], [17, -3.4], [23, -3.6], [24, -3.7], [25, -3.9],
    [27, -4.8], [29, -4.7], [36, -4.6], [48, -5], [51, -4.5], [58, -4.5], [83, -5.9], [87, -5.8], [105, -5.8],
    [110, -5.4], [130, -4.2], [132, -4.2], [134, -3.2], [135, -2.9], [142, -2], [145, -1.8], [157, -1.5], [180, -1.5]],
  // depression 10, elevation 20; mountConflicts []
  centurion5_1_aus: [
    [0, -9.1], [1, -8.9], [11, -7.8], [16, -7.6], [18, -8.2], [19, -6.3], [20, -5.5], [21, -5.2], [25, -5], [27, -5],
    [28, -5.1], [30, -6.1], [31, -5.9], [34, -5.9], [37, -6.5], [39, -7.2], [40, -7.9], [41, -9], [45, -8.9],
    [50, -10], [51, -9.8], [53, -9.7], [55, -9.8], [57, -10], [124, -10], [130, -9], [133, -9], [135, -7.7],
    [139, -6.3], [142, -5.7], [144, -4.5], [151, -3.5], [161, -2.9], [167, -2.8], [179, -2.8], [180, -2.9]],
});

/** Publish the measured curves on the registry's specs (after every spec pack has registered). */
export function applyCenturionGunPitch(registry: TankSpecRegistry): void {
  for (const [id, curve] of Object.entries(CENTURION_GUN_PITCH_BY_YAW)) {
    const spec = registry[id];
    if (!spec) throw new Error(`centurionGunPitch: unknown tank ${id}`);
    spec.gunPitchByYawDeg = curve;
  }
}
