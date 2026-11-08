// Kevin B. Liu — the M3A2 Bradley (ODS) cavalry fighting vehicle and the M2A2's classic turret. 269 (owner 2026-11-05:
// "the m3a2 bradley USA should be m2a2 bradley, and our current m2a2 bradley usa should be the m3a2 bradley"): the M3A2
// takes the turret measured from the owner's source (the M2A2 row's family base, modern3Specs.ts bradleySourceArmorInput)
// and the M2A2 the classic turret (bradleyClassicTurretLayout.ts; profiles/m3a2Bradley.ts and modern3.ts buildM2A2Bradley
// build them; docs/references/tanks/m3a2_bradley.md).
// The M3 carried the M2's two-man turret and hull with no firing ports and two scouts in place of the rifle squad, and
// stowed more ammunition: 1,500 rounds of 25 mm against the M2's 900 and 12 TOW against 7 (Wikipedia, "M3 Bradley" and
// "M2 Bradley" infoboxes; GlobalSecurity, "M2A3 and M3A3 Bradley Fighting Vehicle Systems Specifications"). Mobility,
// protection, the gun's ballistics and the tier stay the M2A2's.
import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs } from './fleetSpecRegistry.ts';
import { modernArmor } from './specHelpers.ts';
import { bradleySourceArmorInput } from './modern3Specs.ts';
import {
  CLASSIC_BARREL_LENGTH_M, CLASSIC_BARREL_RADIUS_M, CLASSIC_GUN_PITCH_BY_YAW_DEG, CLASSIC_GUN_PIVOT, CLASSIC_TURRET_ENVELOPE,
} from './bradleyClassicTurretLayout.ts';

/** The M3's stowed loads over the M2's (25 mm 1,500 / 900; TOW 12 / 7). */
const M3_CANNON_LOAD = 1500 / 900;
const M3_TOW_ROUNDS = 12;

// the M3A2: the M2A2 row as it stands, the source turret's datums and silhouette reads with the full 9 deg of depression
// at every yaw, and the M3's stowed loads
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
spec.visual = { ...spec.visual, number: 'B-31' };
// the M2A2's gun, rounds and armour: one vote between them in the fleet balance audit's era/tier/role medians
spec.balancePeerOf = 'm2a2_bradley';

registerFleetSpecs(bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS), ['m3a2_bradley'], { m3a2_bradley: spec });

// the M2A2: the classic turret on the hull's ring datum (the row's turretPivot), its gun datums, armour envelope and the
// 25 mm's rear depression stops; its silhouette reads are measured afresh (published 6.55 x 3.28 x 2.98 stay). Set here,
// after every clone of the M2A2 row has registered, so they keep the family base (tools: r269 specdiff proves it).
const m2a2 = TANK_SPECS.m2a2_bradley;
m2a2.armor = modernArmor({
  ...bradleySourceArmorInput(),
  gunPivot: [...CLASSIC_GUN_PIVOT], barrelLenM: CLASSIC_BARREL_LENGTH_M, barrelRadM: CLASSIC_BARREL_RADIUS_M,
  ...CLASSIC_TURRET_ENVELOPE,
});
m2a2.dims = { hullLengthM: 6.55, overallLengthM: 6.55, widthM: 3.28, heightM: 2.98 };
m2a2.gunPitchByYawDeg = CLASSIC_GUN_PITCH_BY_YAW_DEG;
