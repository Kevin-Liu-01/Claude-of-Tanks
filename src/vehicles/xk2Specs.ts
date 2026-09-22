import { TANK_SPECS } from './specs.ts';
import type { ArmorEnvelope } from './specHelpers.ts';
import type { FleetDimensions, FleetGunSpec } from './specContracts.ts';
import { XK2_FRAME as D } from './profiles/xk2Frame.ts';

interface OriginalK2Metadata {
  armor: ArmorEnvelope;
  dims: FleetDimensions;
  gun: FleetGunSpec;
  turretTraverseDegS: number;
  gunPitchDegS: number;
}
let donor: OriginalK2Metadata | null = null;

/** Freeze the original production donor before applying the prototype hybrid. */
export function k2SourceMetadata(): OriginalK2Metadata {
  const spec = TANK_SPECS.k2;
  donor ??= structuredClone({ armor: spec.armor, dims: spec.dims, gun: spec.gun,
    turretTraverseDegS: spec.turretTraverseDegS, gunPitchDegS: spec.gunPitchDegS });
  return structuredClone(donor);
}

/** Production K2 and K2B still derive from the original K2 combat envelope.
 * Restore it before family synchronization, including mixed facade imports. */
export function prepareXk2DonorMetadata(): void {
  Object.assign(TANK_SPECS.k2, k2SourceMetadata());
}

/** Apply the selected turret only after all original donor clones are ready. */
export function synchronizeXk2CombatMetadata(): void {
  const spec = TANK_SPECS.k2, turret = TANK_SPECS.k1a1_x.armor;
  spec.gun = structuredClone(TANK_SPECS.k1a1_x.gun);
  // The prototype uses the transplanted gun/ammunition and a slower loading
  // cycle. Keep its mobile and stationary Tier IX matchups within their bands.
  spec.gun.reloadS = 6.5;
  spec.turretTraverseDegS = TANK_SPECS.k1a1_x.turretTraverseDegS;
  spec.gunPitchDegS = TANK_SPECS.k1a1_x.gunPitchDegS;
  spec.armor.turretPivot = [...D.turretPivot];
  spec.armor.gunPivot = [...D.gunPivot];
  spec.armor.gunBarrel = { lengthM: D.barrelLengthM, radiusM: D.barrelRadiusM };
  spec.armor.turretPlates = structuredClone(turret.turretPlates);
  spec.armor.modules = [
    ...spec.armor.modules.filter(part => !part.turretLocal),
    ...structuredClone(turret.modules.filter(part => part.turretLocal)),
  ];
  spec.armor.crew = [
    ...spec.armor.crew.filter(part => !part.turretLocal),
    ...structuredClone(turret.crew.filter(part => part.turretLocal)),
  ];
  spec.dims = { hullLengthM: D.hullLengthM, overallLengthM: D.overallLengthM,
    widthM: D.widthM, heightM: D.roofHeightM };
}
