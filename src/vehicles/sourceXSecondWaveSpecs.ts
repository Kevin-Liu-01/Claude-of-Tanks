// Independent September 2026 second-wave X builds. Only completed authoring
// drafts enter this registry; pending source studies never become placeholders.
// This module is boot-light: combat donors supply rules, never visual geometry.
import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS, fitArmorToDims } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { createT62MV1XArmorZones } from './t62mv1XArmor.ts';
import { createT72B1987XArmorZones } from './t72b1987XArmor.ts';
import { createT80UXArmorZones } from './t80uXArmor.ts';
import { createT72B3XArmorZones, T72B3_X_SOURCE_DATUMS } from './t72b3XArmor.ts';
import {createT72B3MXArmorZones,T72B3M_X_SOURCE_DATUMS} from './t72b3mXArmor.ts';
import {createT72BUXArmorZones,T72BU_X_SOURCE_DATUMS} from './t72buXArmor.ts';
import {createT90AWXArmorZones,T90_AW_X_SOURCE_DATUMS} from './t90AwXArmor.ts';
import {createT90BurlakXArmorZones,T90_BURLAK_X_SOURCE_DATUMS} from './t90BurlakXArmor.ts';
import {createT90MSXArmorZones,T90MS_X_SOURCE_DATUMS} from './t90msXArmor.ts';
import { LECLERC_CLASSIC_X_DATUMS } from './profiles/leclercClassicXFrame.ts';
import { ARIETE_SUPPLIED_X_DATUMS } from './profiles/arieteXSuppliedFrame.ts';
import { CHALLENGER1_SUPPLIED_DATUMS } from './profiles/challenger1XSuppliedFrame.ts';
import { STRV122_SUPPLIED_DATUMS } from './profiles/strv122XSuppliedFrame.ts';
import { applySourceXAuxArmor } from './sourceXAuxArmor.ts';
import type { FleetTankSpec, FleetDimensions } from './specContracts.ts';

const entries = [
  ['leo2a6_x', 'leo2a6', 'Leopard 2A6 X'],
  ['k1a1_x', 'k1a1', 'K1A1 X'],
  ['amx30_x', 'amx30', 'AMX-30 B X'],
  ['t62mv1_x', 't62mv1', 'T-62MV-1 X'],
  ['t72b_1987_x', 't72b_1987', 'T-72B obr. 1987 X'],
  ['t80u_x', 't80u', 'T-80U X'],
  ['leclerc_x', 'leclerc', 'Char Leclerc X'],
  ['leclerc_classic_x', 'leclerc', 'Leclerc X'],
  ['chieftain_mk10_x', 'chieftain_mk10', 'Chieftain Mk 10 X'],
  ['t72b3_x', 't72b3', 'T-72B3 X'],
  ['jpz_e100_x', 'jpz_e100', 'Jagdpanzer E100 X'],
  ['type10_x', 'type10', 'Type 10 X'],
  ['type90_x', 'type90', 'Type 90 X'],
  ['amx40_x', 'amx40', 'AMX-40 X'],
  ['ariete_c1_x', 'ariete_c1', 'C1 Ariete X'],
  ['strv122_x', 'strv122', 'Stridsvagn 122 X'],
  ['t72b3m_x', 't72b3m', 'T-72B3M obr. 2022 X'],
  ['challenger1_x', 'challenger1', 'Challenger 1 X'],
  ['t72bu_x', 't72bu', 'T-72BU X'],
  ['chieftain5_x', 'chieftain5', 'Chieftain Mk 5 X'],
  ['t90_x', 't90', 'T-90 X'],
  ['t90a_burlak_x', 't90a_burlak', 'T-90A Burlak X'],
  ['t90ms_x', 't90ms', 'T-90MS Tagil X'],
] as const;
export const SECOND_WAVE_X_IDS = Object.freeze(entries.map(([id]) => id));
export const SECOND_WAVE_X_DONORS = Object.freeze(Object.fromEntries(entries.map(([id, donor]) => [id, donor])));

// Grounded source datums, not dimensions fitted to a candidate screenshot.
// Roof height excludes antennae/roof weapons. The separately named silhouette
// fields are reference-only P95 body extents measured by the geometry gate
// from the hash-pinned oracle, never copied from candidate measurements.
const dimensions: Readonly<Record<string, FleetDimensions>> = {
  leo2a6_x: { hullLengthM: 7.63049, overallLengthM: 10.9547999, widthM: 3.80991006, heightM: 2.43111, silhouetteHeightM: 2.888 },
  k1a1_x: { hullLengthM: 7.627, overallLengthM: 9.72264, widthM: 3.6758, heightM: 2.20756,
    silhouetteHeightM: 2.738168, silhouetteHullLengthM: 7.547909, silhouetteWidthM: 3.599614 },
  amx30_x: { hullLengthM: 6.30289, overallLengthM: 9.54869, widthM: 3.11322, heightM: 2.284, silhouetteHeightM: 2.991, silhouetteHullLengthM: 6.662 },
  t62mv1_x: { hullLengthM: 6.363553662, overallLengthM: 9.510790337, widthM: 3.30, heightM: 2.082969, silhouetteHeightM: 2.558, silhouetteHullLengthM: 6.742 },
  t72b_1987_x: { hullLengthM: 6.737070506, overallLengthM: 9.703027867, widthM: 3.59, heightM: 2.105640266, silhouetteHeightM: 2.531, silhouetteHullLengthM: 7.243 },
  t80u_x: { hullLengthM: 6.720291335, overallLengthM: 9.534282731, widthM: 3.6, heightM: 2.172451481, silhouetteHeightM: 2.484, silhouetteHullLengthM: 6.652 },
  leclerc_x: { hullLengthM: 7.1303053, overallLengthM: 9.8043880, widthM: 3.6, heightM: 2.36494, silhouetteHeightM: 2.75059, silhouetteHullLengthM: 6.840284 },
  leclerc_classic_x: { ...LECLERC_CLASSIC_X_DATUMS.dims },
  chieftain_mk10_x: { hullLengthM: 7.38869, overallLengthM: 10.803698, widthM: 3.678103, heightM: 2.453337,
    silhouetteHeightM:2.8486312905980586,silhouetteWidthM:3.6348535268031235,silhouetteHullLengthM:7.657120909127583 },
  t72b3_x: { ...T72B3_X_SOURCE_DATUMS.dims, silhouetteHeightM:4.107454637245056,
    silhouetteHullLengthM:7.193154389603283,silhouetteWidthM:3.7600579763835347 },
  jpz_e100_x: {hullLengthM:8.7475677,overallLengthM:11.4206558,widthM:4.4788417,heightM:3.16101265,
    silhouetteHeightM:3.3847075556530717,silhouetteHullLengthM:8.60631156054847},
  type10_x: {hullLengthM:7.22996,overallLengthM:9.42,widthM:3.38929737,heightM:2.2148683143,
    silhouetteHeightM:3.6465144162243215,silhouetteHullLengthM:7.630853056295037},
  type90_x: {hullLengthM:7.798844,overallLengthM:9.80,widthM:3.61781384,heightM:2.459472,
    silhouetteHeightM:3.5972020259823676,silhouetteHullLengthM:7.9386527469955706},
  amx40_x: {hullLengthM:6.6816,overallLengthM:10.0588002,widthM:3.3585,heightM:2.50869,
    silhouetteHeightM:3.0890287367999556,silhouetteHullLengthM:6.910507586449385},
  ariete_c1_x: {...ARIETE_SUPPLIED_X_DATUMS.dims},
  strv122_x: {...STRV122_SUPPLIED_DATUMS.dims},
  t72b3m_x:{...T72B3M_X_SOURCE_DATUMS.dims,
    silhouetteHeightM:3.5952429614961154,silhouetteHullLengthM:7.509942752402276},
  challenger1_x:{...CHALLENGER1_SUPPLIED_DATUMS.dims},
  t72bu_x:{...T72BU_X_SOURCE_DATUMS.dims,
    silhouetteHeightM:2.742923826724291,silhouetteHullLengthM:7.573092477768661},
  chieftain5_x:{hullLengthM:6.57542378005239,overallLengthM:10.470842599868774,
    widthM:3.509999990463257,heightM:2.315201997756958},
  t90_x:{...T90_AW_X_SOURCE_DATUMS.dims,
    silhouetteHeightM:3.03744235069491,silhouetteHullLengthM:7.094520826181398},
  t90a_burlak_x:{...T90_BURLAK_X_SOURCE_DATUMS.dims,
    silhouetteHeightM:2.686041350355372,silhouetteHullLengthM:7.022989538577385},
  t90ms_x:{...T90MS_X_SOURCE_DATUMS.dims,
    silhouetteHeightM:2.993182508108867,silhouetteHullLengthM:7.040902625836161},
};
type SourceFrame = { turret: [number, number, number]; gun: [number, number, number]; muzzleZ: number };
const frames: Readonly<Record<string, SourceFrame>> = {
  leo2a6_x: { turret: [.000005, 2.14836, 1.047795], gun: [.000005, 1.97054, 1.419495], muzzleZ: 7.139555 },
  k1a1_x: { turret: [0, 1.49566, .42564], gun: [.0352, 1.81797, 1.57716], muzzleZ: 5.9052399 },
  amx30_x: { turret: [0, 1.584, .285], gun: [-.011, 1.87565, 1.60], muzzleZ: 5.99439 },
  t62mv1_x: { turret: [0, 1.446436, .3041853764], gun: [0, 1.6650417561, 1.5303753764], muzzleZ: 5.920914939 },
  t72b_1987_x: { turret: [-.0000548974, 1.4040902854, -.0343498434], gun: [-.0000548633, 1.6208176016, 1.2669569241], muzzleZ: 5.766827075 },
  t80u_x: { turret: [0, 1.55158, .0718698169], gun: [0, 1.7564274071, 1.4199398169], muzzleZ: 6.002754533 },
  leclerc_x: { turret: [-.00215336, 1.40294995, .72122934], gun: [.018886, 1.8791055, 1.998880], muzzleZ: 6.239235 },
  leclerc_classic_x: { turret: [...LECLERC_CLASSIC_X_DATUMS.turretPivot],
    gun: [...LECLERC_CLASSIC_X_DATUMS.trunnion], muzzleZ: LECLERC_CLASSIC_X_DATUMS.muzzleZ },
  chieftain_mk10_x: { turret: [0, 1.512956, .595241], gun: [.000026, 1.912199, 1.550505], muzzleZ: 7.093385 },
  t72b3_x: { turret: [...T72B3_X_SOURCE_DATUMS.turretPivot], gun: [...T72B3_X_SOURCE_DATUMS.trunnion], muzzleZ: T72B3_X_SOURCE_DATUMS.muzzleZ },
  jpz_e100_x: {turret:[-.0007,2.33805,.20],gun:[-.0007,2.33805,.20],muzzleZ:7.04687214},
  type10_x: {turret:[-.00275904,1.50831687,.20655021],gun:[0,1.851,2.0529],muzzleZ:5.628774},
  type90_x: {turret:[0,1.681682,.156993],gun:[0,1.997083,1.650032],muzzleZ:5.754624},
  amx40_x: {turret:[-.03904,1.56289,.16819],gun:[-.00005,1.94827,1.3413],muzzleZ:6.6028},
  ariete_c1_x: {turret:[...ARIETE_SUPPLIED_X_DATUMS.turretPivot],
    gun:[...ARIETE_SUPPLIED_X_DATUMS.trunnion],muzzleZ:ARIETE_SUPPLIED_X_DATUMS.muzzleZ},
  strv122_x: {turret:[...STRV122_SUPPLIED_DATUMS.turretPivot],
    gun:[...STRV122_SUPPLIED_DATUMS.trunnion],muzzleZ:STRV122_SUPPLIED_DATUMS.muzzleZ},
  t72b3m_x:{turret:[...T72B3M_X_SOURCE_DATUMS.turretPivot],gun:[...T72B3M_X_SOURCE_DATUMS.trunnion],muzzleZ:T72B3M_X_SOURCE_DATUMS.muzzleZ},
  challenger1_x:{turret:[...CHALLENGER1_SUPPLIED_DATUMS.turretPivot],
    gun:[...CHALLENGER1_SUPPLIED_DATUMS.trunnion],muzzleZ:CHALLENGER1_SUPPLIED_DATUMS.muzzleZ},
  t72bu_x:{turret:[...T72BU_X_SOURCE_DATUMS.turretPivot],gun:[...T72BU_X_SOURCE_DATUMS.trunnion],muzzleZ:T72BU_X_SOURCE_DATUMS.muzzleZ},
  chieftain5_x:{turret:[.0031,1.476,.36928],gun:[-.008067,1.859441,1.570],muzzleZ:6.812053203582764},
  t90_x:{turret:[...T90_AW_X_SOURCE_DATUMS.turretPivot],gun:[...T90_AW_X_SOURCE_DATUMS.trunnion],muzzleZ:T90_AW_X_SOURCE_DATUMS.muzzleZ},
  t90a_burlak_x:{turret:[...T90_BURLAK_X_SOURCE_DATUMS.turretPivot],gun:[...T90_BURLAK_X_SOURCE_DATUMS.trunnion],muzzleZ:T90_BURLAK_X_SOURCE_DATUMS.muzzleZ},
  t90ms_x:{turret:[...T90MS_X_SOURCE_DATUMS.turretPivot],gun:[...T90MS_X_SOURCE_DATUMS.trunnion],muzzleZ:T90MS_X_SOURCE_DATUMS.muzzleZ},
};
const authoredEraZones = { t62mv1_x: createT62MV1XArmorZones,
  t72b_1987_x: createT72B1987XArmorZones, t80u_x: createT80UXArmorZones,
  t72b3_x: createT72B3XArmorZones,t72b3m_x:createT72B3MXArmorZones,t72bu_x:createT72BUXArmorZones,
  t90_x:createT90AWXArmorZones,t90a_burlak_x:createT90BurlakXArmorZones,t90ms_x:createT90MSXArmorZones };
const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);

function applyJagdpanzerFixedArmor(spec: FleetTankSpec): void {
  const mantlet = spec.armor.turretPlates.find(plate => plate.name === 'mantlet');
  if (!mantlet) throw new Error('JPz E100 X requires its inherited mantlet balance');
  // The complete fixed casemate is already measured into hull collision cells.
  // Donor turret plates would create a second, floating compartment when the
  // real limited-traverse trunnion replaces the donor turret pivot.
  spec.armor.turretPlates = [];
  // This is the actual front cap of jagdpanzerBell(), not a bounding rectangle.
  // Its 48-edge first-party outline retains the donor's protection ratings.
  // gunFollow selects the gun frame even in hullPlates; keeping these authored
  // spaced faces here avoids the legacy fixed-child hull-envelope rescaling.
  const verts: [number, number, number][] = [];
  for (let index = 0; index < 48; index++) {
    const angle = index * Math.PI * 2 / 48;
    verts.push([Math.cos(angle) * .24664, 2.3351 - 2.33805 + Math.sin(angle) * .24664,
      1.55465 - .20]);
  }
  spec.armor.hullPlates.push({ ...mantlet, kind: 'spaced', gunFollow: true,
    convexPolygon: true, verts });
}

function applyAuthoredFrame(spec: FleetTankSpec, id: string): void {
  const frame = frames[id];
  spec.armor.turretPivot = [...frame.turret];
  spec.armor.gunPivot = [frame.gun[0] - frame.turret[0],
    frame.gun[1] - frame.turret[1], frame.gun[2] - frame.turret[2]];
  spec.armor.gunBarrel.lengthM = frame.muzzleZ - frame.gun[2];
  if (id === 'jpz_e100_x') applyJagdpanzerFixedArmor(spec);
  applySourceXAuxArmor(spec, id);
  const createZones = authoredEraZones[id as keyof typeof authoredEraZones];
  if (createZones) {
    // The retained donor is the owner's non-ERA T-62 obr.1975. The separately
    // requested MV-1 X gets first-generation reactive GAMEPLAY cover fields.
    // Their protection values are a balance convention, not source geometry
    // evidence. Permanent structural plates are retained under these covers.
    // Replace donor positions, not permanent plates. Every new cover field
    // names actual authored triangles on this independent tank.
    spec.armor.hullPlates = spec.armor.hullPlates.filter(p => !p.era);
    spec.armor.turretPlates = spec.armor.turretPlates.filter(p => !p.era);
    const zones = createZones();
    spec.armor.hullPlates.push(...zones.hullPlates);
    spec.armor.turretPlates.push(...zones.turretPlates);
  }
}

const specs: Record<string, FleetTankSpec> = {};
for (const [id, donorId, name] of entries) {
  const donor = registries.tankSpecs[donorId];
  if (!donor) throw new Error(`Second-wave X combat donor missing: ${donorId}`);
  const spec = cloneFleetVariant(registries.tankSpecs, id, donorId, {
    name, nation: donor.nation, era: donor.era, role: donor.role,
  });
  delete spec.publicVisualFallback;
  delete spec.label;
  delete spec.roster;
  spec.balancePeerOf = donorId;
  stripSilhouetteDimensions(spec.dims);
  const previous = { ...spec.dims };
  Object.assign(spec.dims, dimensions[id]);
  fitArmorToDims(spec.armor, previous, spec.dims);
  applyAuthoredFrame(spec, id);
  specs[id] = spec;
}
registerFleetSpecs(registries, SECOND_WAVE_X_IDS, specs);

/** Mirror the balanced combat revision without inheriting donor appearance,
 * dimensions, calibration receipts, markings or rig transforms. */
export function synchronizeSecondWaveXCombatMetadata(): void {
  const fields = ['hp', 'enginePowerHp', 'weightTons', 'topSpeedKmh', 'reverseSpeedKmh',
    'hullTraverseDegS', 'terrainResistance', 'pivotStyle', 'turretTraverseDegS',
    'gunPitchDegS', 'gunElevationDeg', 'gunDepressionDeg', 'gun'] as const;
  for (const [id, donorId] of entries) {
    const target = registries.tankSpecs[id], donor = registries.tankSpecs[donorId];
    for (const key of fields) Object.assign(target, { [key]: structuredClone(donor[key]) });
    target.armor = structuredClone(donor.armor);
    fitArmorToDims(target.armor, donor.dims, target.dims);
    applyAuthoredFrame(target, id);
  }
}
