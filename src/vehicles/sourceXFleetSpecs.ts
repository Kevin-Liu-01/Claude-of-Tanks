// September 2026 owner-requested, separately selectable source-study rebuilds.
// These clone combat metadata only. Geometry is independently authored in
// dedicated demand-loaded X profiles, never taken from the donor builders.
import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS, fitArmorToDims } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import type { FleetTankSpec, FleetDimensions } from './specContracts.ts';

const entries = [
  ['leo2a7v_x', 'leo2a7v', 'Leopard 2A7V X'],
  ['leo2a6m_x', 'leo2a6m', 'Leopard 2A6M X'],
  ['leo2a4m_x', 'leo2a4m', 'Leopard 2A4M X'],
  ['leo2a5_x', 'leo2a5', 'Leopard 2A5 X'],
  ['merkava4_x', 'merkava4', 'Merkava Mk.4 X'],
  ['merkava3d_x', 'merkava3d', 'Merkava Mk.3D X'],
  ['k2_x', 'k2', 'K2 Black Panther X'],
  ['kf51_x', 'kf51', 'KF51 Panther X'],
  ['t90a_x', 't90a', 'T-90A X'],
  ['t90a_vladimir_x', 't90a_vladimir', 'T-90A Vladimir X'],
  ['t90m_x', 't90m', 'T-90M X'],
  ['t90sm_x', 't90sm', 'T-90SM X'],
  ['t14_x', 't14', 'T-14 Armata X'],
] as const;

export const SOURCE_X_IDS = Object.freeze(entries.map(([id]) => id));
export const SOURCE_X_DONORS = Object.freeze(Object.fromEntries(entries.map(([id, donor]) => [id, donor])));
// Boot-light measured metadata: do not import visual profiles here. Source
// exterior lengths include fitted rear stowage; hullLengthM is the structural
// hull datum. Differences from published configurations are in source packets.
const dimensions: Readonly<Record<string, FleetDimensions>> = Object.freeze({
  leo2a7v_x: { hullLengthM: 7.72, overallLengthM: 10.97, widthM: 4, heightM: 2.64,
    silhouetteHeightM: 3.415 },
  leo2a6m_x: { hullLengthM: 7.72, overallLengthM: 10.97, widthM: 3.98, heightM: 3.03, silhouetteHeightM: 2.800 },
  leo2a4m_x: { hullLengthM: 7.72, overallLengthM: 9.96, widthM: 3.77, heightM: 2.62,
    silhouetteHeightM: 3.120 },
  leo2a5_x: { hullLengthM: 7.72, overallLengthM: 9.97, widthM: 3.75, heightM: 2.64,
    silhouetteHeightM: 3.005, silhouetteHullLengthM: 7.814 },
  merkava4_x: { hullLengthM: 7.60, overallLengthM: 8.705, widthM: 3.77689, heightM: 2.565,
    // Source-only P95 at the gate's fixed 1024 raster: four whips occupy
    // enough 96-column bins to enter this statistic. It is NOT roof height;
    // actual 2.565 m armor roof remains an independent geometric assertion.
    silhouetteHeightM: 4.655 },
  merkava3d_x: { hullLengthM: 7.9645, overallLengthM: 8.8382, widthM: 3.976352, heightM: 2.59, silhouetteHeightM: 3.016 },
  k2_x: { hullLengthM: 7.3418, overallLengthM: 10.8448, widthM: 3.71906, heightM: 2.369,
    silhouetteHeightM: 3.020, silhouetteHullLengthM: 7.566 },
  kf51_x: { hullLengthM: 7.70, overallLengthM: 10.7497, widthM: 3.5603123, heightM: 2.5603, silhouetteHeightM: 3.093 },
  t90a_x: { hullLengthM: 6.86, overallLengthM: 10.4586, widthM: 3.78, heightM: 2.2049,
    silhouetteHullLengthM: 7.888, silhouetteHeightM: 2.727 },
  t90a_vladimir_x: { hullLengthM: 6.86, overallLengthM: 10.7863, widthM: 3.78, heightM: 2.2595,
    silhouetteHullLengthM: 8.016, silhouetteHeightM: 2.881 },
  t90m_x: { hullLengthM: 6.86, overallLengthM: 10.3513, widthM: 3.78, heightM: 2.0309,
    silhouetteHullLengthM: 7.686, silhouetteHeightM: 2.828 },
  t90sm_x: { hullLengthM: 6.86, overallLengthM: 11.1371, widthM: 3.78, heightM: 2.2893,
    silhouetteHullLengthM: 7.770, silhouetteHeightM: 3.113 },
  t14_x: { hullLengthM: 8.65425, overallLengthM: 9.9701, widthM: 3.9, heightM: 2.75,
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
  leo2a7v_x: { turret: [0, 1.79, .52], gun: [0, 2.0326, 2.02], muzzleZ: 6.969 },
  leo2a6m_x: { turret: [.006, 1.719, .508], gun: [-.0005, 2.0894, 1.95], muzzleZ: 7.025 },
  leo2a4m_x: { turret: [-.05, 1.65, .36], gun: [-.1273, 1.908, 1.91], muzzleZ: 6.10 },
  leo2a5_x: { turret: [0, 1.662, .661], gun: [.0238, 1.9979, 1.659], muzzleZ: 6.11 },
  merkava4_x: { turret: [0, 1.605, -.3906], gun: [0, 1.9934619, 1.93], muzzleZ: 4.8055 },
  merkava3d_x: { turret: [0, 1.68034, -.72418], gun: [0, 2.0898, 1.4258], muzzleZ: 4.8560 },
  k2_x: { turret: [0, 1.5945, .21815], gun: [0, 1.99253, 1.36815], muzzleZ: 6.91805 },
  kf51_x: { turret: [0, 1.4596, .5185], gun: [0, 1.85491175, 1.3478], muzzleZ: 6.8997 },
  t90a_x: { turret: [.010, 1.468, -.0039], gun: [.005, 1.8174, 1.30], muzzleZ: 6.2642 },
  t90a_vladimir_x: { turret: [0, 1.416, .298], gun: [0, 1.7287, 1.34], muzzleZ: 6.5964 },
  t90m_x: { turret: [.018092, 1.336748, -.104459], gun: [.001973, 1.608251, 1.140604], muzzleZ: 6.2542 },
  t90sm_x: { turret: [.008, 1.532, .359], gun: [.001, 1.90309, 1.56], muzzleZ: 7.0399 },
  t14_x: { turret: [0, 1.69, -.22], gun: [0, 2.051, 1.00], muzzleZ: 5.643 },
});
function applySourceFrame(spec: FleetTankSpec, id: string): void {
  const frame = sourceFrames[id];
  spec.armor.turretPivot = [...frame.turret];
  spec.armor.gunPivot = [frame.gun[0] - frame.turret[0],
    frame.gun[1] - frame.turret[1], frame.gun[2] - frame.turret[2]];
  spec.armor.gunBarrel.lengthM = frame.muzzleZ - frame.gun[2];
}
const specs: Record<string, FleetTankSpec> = {};
for (const [id, donorId, name] of entries) {
  const donor = registries.tankSpecs[donorId];
  if (!donor) throw new Error(`X fleet combat donor is not registered: ${donorId}`);
  const spec = cloneFleetVariant(registries.tankSpecs, id, donorId, {
    name, nation: donor.nation, era: donor.era, role: donor.role,
  });
  delete spec.publicVisualFallback;
  delete spec.label;
  delete spec.roster;
  spec.balancePeerOf = donorId;
  stripSilhouetteDimensions(spec.dims);
  const baseDimensions = { ...spec.dims };
  Object.assign(spec.dims, dimensions[id]);
  fitArmorToDims(spec.armor, baseDimensions, spec.dims);
  applySourceFrame(spec, id);
  specs[id] = spec;
}
registerFleetSpecs(registries, SOURCE_X_IDS, specs);

/** Existing donors receive their fleet balance pass after registration. Copy
 * that combat revision explicitly, without inheriting their visual builders,
 * calibration receipts, dimensions, markings or identity. */
export function synchronizeSourceXCombatMetadata(): void {
  const fields = ['hp', 'enginePowerHp', 'weightTons', 'topSpeedKmh', 'reverseSpeedKmh',
    'hullTraverseDegS', 'terrainResistance', 'pivotStyle', 'turretTraverseDegS',
    'gunPitchDegS', 'gunElevationDeg', 'gunDepressionDeg', 'gun'] as const;
  for (const [id, donorId] of entries) {
    const target = registries.tankSpecs[id], donor = registries.tankSpecs[donorId];
    for (const key of fields) Object.assign(target, { [key]: structuredClone(donor[key]) });
    target.armor = structuredClone(donor.armor);
    fitArmorToDims(target.armor, donor.dims, target.dims);
    applySourceFrame(target, id);
  }
}
