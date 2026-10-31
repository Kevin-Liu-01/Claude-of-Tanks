import { isFleetBalanceFinalized } from './fleetBalanceState.ts';
import { k2SourceMetadata } from './xk2Specs.ts';
// September 2026 owner-requested, separately selectable source-study rebuilds.
// These clone combat metadata only. Geometry is independently authored in
// dedicated demand-loaded X profiles, never taken from the donor builders.
import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS, fitArmorToDims } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariantFrom, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { donorSpec } from './donorSpecs.ts';
import { LEOPARD_X_WEDGES, leopardXWedgePlates, type LeopardXWedgeId } from './leopardXWedges.ts';
import type { FleetTankSpec, FleetDimensions } from './specContracts.ts';
import {
  LEOPARD_IMPROVED_AUTHORED_WIDTH_M,
  LEOPARD_IMPROVED_HULL_WIDTH_SCALE,
  scaleLeopardImprovedHullArmor,
} from './profiles/leopardImprovedHull.ts';

const entries = [
  ['leo2a7v', 'leo2_improved', 'Leopard 2A7V'],
  ['leo2a6m', 'leo2a4_otco', 'Leopard 2A6M'],
  ['leo2a5m', 'leo2a4m_can', 'Leopard 2A5M'],
  ['leo2a5', 'leo2a4_v', 'Leopard 2A5'],
  ['merkava4', 'merkava4', 'Merkava Mk 4'],
  ['merkava3d', 'merkava3_baz', 'Merkava Mk 3D'],
  ['k2_black_panther', 'xk2_black_panther', 'K2 Black Panther'],
  ['kf51_panther', 'kf51_evo', 'KF51 Panther'],
  ['t90a', 't90a_2004', 'T-90A'],
  ['t90a_vladimir', 't90a_2006', 'T-90A Vladimir'],
  ['t90m', 't90am', 'T-90M Proryv'],
  ['t90sm', 't90sm_2013', 'T-90SM'],
  ['t14_armata', 'object148_proto', 'T-14 Armata'],
] as const;

export const SOURCE_X_IDS = Object.freeze(entries.map(([id]) => id));
export const SOURCE_X_DONORS = Object.freeze(Object.fromEntries(entries.map(([id, donor]) => [id, donor])));
// Boot-light measured metadata: do not import visual profiles here. Source
// exterior lengths include fitted rear stowage; hullLengthM is the structural
// hull datum. Differences from published configurations are in source packets.
const dimensions: Readonly<Record<string, FleetDimensions>> = Object.freeze({
  leo2a7v: { hullLengthM: 7.72, overallLengthM: 10.97, widthM: 4, heightM: 2.64,
    silhouetteHeightM: 3.415 },
  leo2a6m: { hullLengthM: 7.72, overallLengthM: 10.97, widthM: 3.98, heightM: 3.03, silhouetteHeightM: 2.800 },
  leo2a5m: { hullLengthM: 7.72, overallLengthM: 9.96, widthM: 3.77, heightM: 2.62,
    silhouetteHeightM: 3.120 },
  leo2a5: { hullLengthM: 7.72, overallLengthM: 9.97, widthM: 3.75, heightM: 2.64,
    silhouetteHeightM: 3.005, silhouetteHullLengthM: 7.814 },
  merkava4: { hullLengthM: 7.60, overallLengthM: 8.705, widthM: 3.77689, heightM: 2.565,
    // Source-only P95 at the gate's fixed 1024 raster: four whips occupy
    // enough 96-column bins to enter this statistic. It is NOT roof height;
    // actual 2.565 m armor roof remains an independent geometric assertion.
    silhouetteHeightM: 4.655 },
  merkava3d: { hullLengthM: 7.9645, overallLengthM: 8.8382, widthM: 3.976352, heightM: 2.59, silhouetteHeightM: 3.016 },
  k2_black_panther: { hullLengthM: 7.3418, overallLengthM: 10.8448, widthM: 3.71906, heightM: 2.369,
    silhouetteHeightM: 3.020, silhouetteHullLengthM: 7.566 },
  kf51_panther: { hullLengthM: 7.70, overallLengthM: 10.7497, widthM: 3.5603123, heightM: 2.5603, silhouetteHeightM: 3.093 },
  t90a: { hullLengthM: 6.86, overallLengthM: 10.4586, widthM: 3.78, heightM: 2.2049,
    silhouetteHullLengthM: 7.888, silhouetteHeightM: 2.727 },
  t90a_vladimir: { hullLengthM: 6.86, overallLengthM: 10.7863, widthM: 3.78, heightM: 2.2595,
    silhouetteHullLengthM: 8.016, silhouetteHeightM: 2.881 },
  t90m: { hullLengthM: 6.86, overallLengthM: 10.3513, widthM: 3.78, heightM: 2.0309,
    silhouetteHullLengthM: 7.686, silhouetteHeightM: 2.828 },
  t90sm: { hullLengthM: 6.86, overallLengthM: 11.1371, widthM: 3.78, heightM: 2.2893,
    silhouetteHullLengthM: 7.770, silhouetteHeightM: 3.113 },
  t14_armata: { hullLengthM: 8.65425, overallLengthM: 9.9701, widthM: 3.9, heightM: 2.75,
    // Fixed source P95 occupied height includes the remote weapon station;
    // structural roof height remains separate. Never fit this to the candidate.
    silhouetteHeightM: 3.176 },
});
const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
// Independent source-study yaw/trunnion datums in the hull frame. Keep this
// scalar contract boot-light; tests compare it with the actual demand-loaded
// rigs. Donor pivots would put damage rays in a different place from the tank.
type SourceFrame = { turret: [number, number, number]; gun: [number, number, number]; muzzleZ: number };
const sourceFrames: Readonly<Record<string, SourceFrame>> = Object.freeze({
  leo2a7v: { turret: [0, 1.79, .52], gun: [0, 2.0326, 2.02], muzzleZ: 6.969 },
  leo2a6m: { turret: [.006, 1.719, .508], gun: [-.0005, 2.0894, 1.95], muzzleZ: 7.025 },
  leo2a5m: { turret: [-.05, 1.65, .36], gun: [-.1273, 1.908, 1.91], muzzleZ: 6.10 },
  leo2a5: { turret: [0, 1.662, .661], gun: [.0238, 1.9979, 1.659], muzzleZ: 6.11 },
  merkava4: { turret: [0, 1.605, -.3906], gun: [0, 1.9934619, 1.93], muzzleZ: 4.8055 },
  merkava3d: { turret: [0, 1.68034, -.72418], gun: [0, 2.0898, 1.4258], muzzleZ: 4.8560 },
  k2_black_panther: { turret: [0, 1.5945, .21815], gun: [0, 1.99253, 1.36815], muzzleZ: 6.91805 },
  kf51_panther: { turret: [0, 1.4596, .5185], gun: [0, 1.85491175, 1.3478], muzzleZ: 6.8997 },
  t90a: { turret: [.010, 1.468, -.0039], gun: [.005, 1.8174, 1.30], muzzleZ: 6.2642 },
  t90a_vladimir: { turret: [0, 1.416, .298], gun: [0, 1.7287, 1.34], muzzleZ: 6.5964 },
  t90m: { turret: [.018092, 1.336748, -.104459], gun: [.001973, 1.608251, 1.140604], muzzleZ: 6.2542 },
  t90sm: { turret: [.008, 1.532, .359], gun: [.001, 1.90309, 1.56], muzzleZ: 7.0399 },
  t14_armata: { turret: [0, 1.69, -.22], gun: [0, 2.051, 1.00], muzzleZ: 5.643 },
});
function applySourceFrame(spec: FleetTankSpec, id: string): void {
  const frame = sourceFrames[id];
  spec.armor.turretPivot = [...frame.turret];
  spec.armor.gunPivot = [frame.gun[0] - frame.turret[0],
    frame.gun[1] - frame.turret[1], frame.gun[2] - frame.turret[2]];
  spec.armor.gunBarrel.lengthM = frame.muzzleZ - frame.gun[2];
}
const specs: Record<string, FleetTankSpec> = {};

/**
 * The leopardX wedges' spaced turret_wedge_L/R plates fitted on the drawn wedge (leopardXWedges.ts, the stations the
 * profile lofts), replacing the donors' pairs, which sat behind the cheeks (release 266, Main 2026-10-31). Each keeps its
 * own pair's ratings; the 2A5M, whose donor (the 2A4M CAN) carries none, takes the 2A6M's.
 * Measured on a 600 mm APFSDS grid at 0/±15/±30 deg (.qa-dev frontshots): every angle at or under the pre-fit build
 * except the 2A5M at ±30 (about 16 and 14 % against 14.6 and 4.5 %). Its old -30 deg figure came from the proud wedge the
 * owner had removed (its cell faces resolved to the cheeks); what still gets in is the front-top bevel, whose faces
 * resolve by nearest plate to the 59 mm turret_roof (a 69.7 deg graze where the proud wedge gave 76.8): a fleet-wide
 * anatomy item, not a rating to tune here.
 */
function fitSourceWedges(spec: FleetTankSpec, id: string, wedgeDonor: FleetTankSpec | undefined): void {
  if (!(id in LEOPARD_X_WEDGES)) return;
  const own = spec.armor.turretPlates.find((plate) => plate.name === 'turret_wedge_L');
  const ratings = own ?? wedgeDonor?.armor.turretPlates.find((plate) => plate.name === 'turret_wedge_L');
  if (!ratings) throw new Error(`${id}: no turret_wedge ratings to fit its wedge plates with`);
  const ys = spec.armor.turretPlates.filter((plate) => plate.name === 'turret_roof').flatMap((plate) => plate.verts.map((v) => v[1]));
  const xs = spec.armor.turretPlates.filter((plate) => /^turret_cheek_[LR]$/.test(plate.name))
    .flatMap((plate) => plate.verts.map((v) => Math.abs(v[0])));
  const plates = leopardXWedgePlates(id as LeopardXWedgeId, spec.armor.turretPivot, ratings,
    { roofY: Math.max(...ys), cheekHalfWidth: Math.max(...xs) });
  spec.armor.turretPlates = spec.armor.turretPlates.filter((plate) => !/^turret_wedge_[LR]$/.test(plate.name)).concat(plates);
}

function fitSourceArmor(spec: FleetTankSpec, donorDimensions: FleetDimensions): void {
  let baseDimensions = donorDimensions;
  if (spec.id === 'leo2a7v') {
    // The independent 2A7V retains its original hull and turret proportions.
    // Undo the Improved donor's hull-only edit before fitting its source frame.
    scaleLeopardImprovedHullArmor(spec.armor, 1 / LEOPARD_IMPROVED_HULL_WIDTH_SCALE);
    baseDimensions = { ...donorDimensions, widthM: LEOPARD_IMPROVED_AUTHORED_WIDTH_M };
  }
  fitArmorToDims(spec.armor, baseDimensions, spec.dims);
}

for (const [id, donorId, name] of entries) {
  // Registered donors first, then the unregistered templates (merkava4 retired 2026-09-23).
  const donor = donorSpec(registries.tankSpecs, donorId);
  const spec = cloneFleetVariantFrom(donor, id, donorId, {
    name, nation: donor.nation, era: donor.era, role: donor.role,
  });
  delete spec.publicVisualFallback;
  delete spec.label;
  delete spec.roster;
  spec.balancePeerOf = donorId;
  stripSilhouetteDimensions(spec.dims);
  const baseDimensions = { ...spec.dims };
  Object.assign(spec.dims, dimensions[id]);
  fitSourceArmor(spec, baseDimensions);
  applySourceFrame(spec, id);
  fitSourceWedges(spec, id, specs.leo2a6m);
  specs[id] = spec;
}
registerFleetSpecs(registries, SOURCE_X_IDS, specs);

/** Existing donors receive their fleet balance pass after registration. Copy
 * that combat revision explicitly, without inheriting their visual builders,
 * calibration receipts, dimensions, markings or identity. */
export function synchronizeSourceXCombatMetadata(): void {
  // Combat donor synchronization is initialization-only once final role tuning is published.
  if (isFleetBalanceFinalized(registries.tankSpecs)) return;
  const fields = ['hp', 'enginePowerHp', 'weightTons', 'topSpeedKmh', 'reverseSpeedKmh',
    'hullTraverseDegS', 'terrainResistance', 'pivotStyle', 'turretTraverseDegS',
    'gunPitchDegS', 'gunElevationDeg', 'gunDepressionDeg', 'gun'] as const;
  for (const [id, donorId] of entries) {
    const target = registries.tankSpecs[id], registered = donorSpec(registries.tankSpecs, donorId);
    const donor = donorId === 'xk2_black_panther' ? { ...registered, ...k2SourceMetadata() } : registered;
    for (const key of fields) Object.assign(target, { [key]: structuredClone(donor[key]) });
    target.armor = structuredClone(donor.armor);
    fitSourceArmor(target, donor.dims);
    applySourceFrame(target, id);
    fitSourceWedges(target, id, registries.tankSpecs.leo2a6m);
  }
}
