// Kevin B. Liu — the M3A2 Bradley (ODS) cavalry fighting vehicle: the M2A2's spec with the M3's real deltas, on the
// shared Bradley hull under the classic M2A2 turret (profiles/m3a2Bradley.ts; docs/references/tanks/m3a2_bradley.md).
// The M3 carried the M2's two-man turret and hull with no firing ports and two scouts in place of the rifle squad, and
// stowed more ammunition: 1,500 rounds of 25 mm against the M2's 900 and 12 TOW against 7 (Wikipedia, "M3 Bradley" and
// "M2 Bradley" infoboxes; GlobalSecurity, "M2A3 and M3A3 Bradley Fighting Vehicle Systems Specifications"). Mobility,
// protection, the gun's ballistics and the tier stay the M2A2's.
import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { modernArmor } from './specHelpers.ts';
import { CLASSIC_BARREL_LENGTH_M, CLASSIC_BARREL_RADIUS_M, CLASSIC_GUN_PIVOT, CLASSIC_TURRET_ENVELOPE } from './bradleyClassicTurretLayout.ts';

/** The M3's stowed loads over the M2's (25 mm 1,500 / 900; TOW 12 / 7). */
const M3_CANNON_LOAD = 1500 / 900;
const M3_TOW_ROUNDS = 12;

const spec = cloneFleetVariant(TANK_SPECS, 'm3a2_bradley', 'm2a2_bradley', {
  name: 'M3A2 Bradley', nation: 'USA', era: 'modern', role: 'ifv',
});
spec.gun = {
  ...spec.gun,
  shells: spec.gun.shells.map((shell) => ({
    ...shell,
    count: shell.guided ? M3_TOW_ROUNDS : Math.round((shell.count ?? 0) * M3_CANNON_LOAD),
  })),
};
// published M3A2: 6.55 m long, 3.28 m wide without the armour kit, 2.97 m to the turret roof (Wikipedia, "M3 Bradley");
// the M2A2 row's silhouette actuals measured another build, so the census measures this one afresh
spec.dims = { ...spec.dims, hullLengthM: 6.55, overallLengthM: 6.55, widthM: 3.28, heightM: 2.97 };
stripSilhouetteDimensions(spec.dims);
// The shared hull's armour row is the M2A2's (modern3Specs.ts, 268: the hull measured from the owner's source); the turret
// rows, the gun pivot and the barrel are the classic turret's (7cc204ab32, mirrored: bradleyClassicTurretLayout.ts). The
// ring stands where the family's does (the donor's turretPivot, modern3.ts BRADLEY_TURRET_RING).
const pivot = spec.armor.turretPivot;
spec.armor = modernArmor({
  hl: 3.27, hw: 1.70, inW: 0.95, floor: 0.45, trkTop: 1.16, roofY: 2.06,
  turretPivot: [pivot[0], pivot[1], pivot[2]],
  gunPivot: [CLASSIC_GUN_PIVOT[0], CLASSIC_GUN_PIVOT[1], CLASSIC_GUN_PIVOT[2]],
  barrelLenM: CLASSIC_BARREL_LENGTH_M, barrelRadM: CLASSIC_BARREL_RADIUS_M,
  glacis: [40, 60, 60], lower: [40, 50, 50], side: [30, 30, 30],
  skirt: [25, 30, 60], rear: 25, roof: 20,
  ...CLASSIC_TURRET_ENVELOPE,
  cheek: [35, 60, 60], tSide: [30, 30, 30], tRear: 25, tRoof: 20,
  mantlet: [40, 60, 60], loader: false,
});
// The 25 mm's depression stops over the rear (tools/gun-depression-sweep.mjs at 26 mm, 2026-11-02): from 149 deg of yaw
// the barrel passes over the hull's raised troop-compartment roof (2.24 m, z -3.0..-2.1) from the classic turret's
// 2.435 m axis; the full 9 deg everywhere ahead of that. No mount conflict at any yaw (the pod is turret stock).
spec.gunPitchByYawDeg = Object.freeze([
  [0, -9], [148, -9], [149, -6.7], [150, -5.8], [153, -4.9], [159, -3.4], [164, -3.3], [180, -3.6],
] as const);
spec.visual = { ...spec.visual, number: 'B-31' };
// the M2A2's gun, rounds and armour: one vote between them in the fleet balance audit's era/tier/role medians
spec.balancePeerOf = 'm2a2_bradley';

registerFleetSpecs(bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS), ['m3a2_bradley'], { m3a2_bradley: spec });
