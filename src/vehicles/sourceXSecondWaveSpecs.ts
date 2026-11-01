import { isFleetBalanceFinalized } from './fleetBalanceState.ts';
// Independent September 2026 second-wave X builds. Only completed authoring
// drafts enter this registry; pending source studies never become placeholders.
// This module is boot-light: combat donors supply rules, never visual geometry.
import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS, fitArmorToDims } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariantFrom, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { leopardA6WedgePlates } from './leopardXWedges.ts';
import { donorSpec } from './donorSpecs.ts';
import { restoreInstalledVehicleFrame } from './vehicleSizePolicy.ts';
import { createT62MV1XArmorZones } from './t62mv1XArmor.ts';
import { createT72B1987XArmorZones } from './t72b1987XArmor.ts';
import { createT80UXArmorZones, T80U_X_RING_RAISE_M, T80U_X_GUN_PITCH_BY_YAW_DEG } from './t80uXArmor.ts';
import { createT72B3XArmorZones, T72B3_X_SOURCE_DATUMS, T72B3_X_GUN_PITCH_BY_YAW_DEG } from './t72b3XArmor.ts';
import {createT72B3MXArmorZones,T72B3M_X_SOURCE_DATUMS} from './t72b3mXArmor.ts';
import {createT72BUXArmorZones,T72BU_X_SOURCE_DATUMS} from './t72buXArmor.ts';
import {createT90AWXArmorZones,T90_AW_X_SOURCE_DATUMS} from './t90AwXArmor.ts';
import {createT90BurlakXArmorZones,T90_BURLAK_X_SOURCE_DATUMS} from './t90BurlakXArmor.ts';
import {createT90MSXArmorZones,T90MS_X_SOURCE_DATUMS} from './t90msXArmor.ts';
import { LECLERC_CLASSIC_X_DATUMS } from './profiles/leclercClassicXFrame.ts';
import { ARIETE_C1_X_DATUMS, ARIETE_X_FAMILY_SCALE, ARIETE_C1_X_GUN_PITCH_BY_YAW_DEG } from './profiles/arieteXFamilyFrame.ts';
import { CHALLENGER1_SUPPLIED_DATUMS } from './profiles/challenger1XSuppliedFrame.ts';
import { rateChallenger1Armor } from './challenger1Armor.ts';
import { STRV122_SUPPLIED_DATUMS } from './profiles/strv122XSuppliedFrame.ts';
import { applySourceXAuxArmor } from './sourceXAuxArmor.ts';
import { applyLeclercClassicXFieldKitArmor } from './leclercClassicXKitArmor.ts';
import type { FleetTankSpec, FleetDimensions } from './specContracts.ts';

const entries = [
  ['leo2a6', 'leo2a4', 'Leopard 2A6'],
  ['k1a1', 'k1e1', 'K1A1'],
  ['amx30b', 'amx30', 'AMX-30B'],
  ['t62mv1', 't62_1975', 'T-62MV-1'],
  ['t72b_1987', 't72b_1987', 'T-72B obr. 1987'],
  ['t80u', 't80uk', 'T-80U'],
  // owner 2026-09-16: the studies carry the newer marks (SXXI -> XLR, S1 -> AMX 56 swapped with the legacy hulls)
  ['leclerc_xlr', 'leclerc_s2', 'Leclerc XLR'],
  ['amx56', 'leclerc_s2', 'AMX 56'],
  ['chieftain_mk10', 'chieftain_mk9', 'Chieftain Mk 10'],
  ['t72b3', 't72b3', 'T-72B3'],
  ['jpz_e100', 'jpz_e100', 'Jagdpanzer E100'],
  ['type10', 'type10_tk_x', 'Type 10'],
  ['type90', 'type90_kyumaru', 'Type 90'],
  ['amx40', 'amx40_proto', 'AMX-40'],
  ['c1_ariete', 'c1_ariete_proto_serie1', 'C1 Ariete'],
  ['strv122', 'strv121', 'Stridsvagn 122'],
  ['t72b3m_2016', 't72b3m_2022', 'T-72B3M obr. 2016'],
  ['challenger1_mk3', 'challenger1_mk2', 'Challenger 1 Mk 3'],
  ['t72bu', 't72bu_1989', 'T-72BU'],
  ['chieftain5', 'chieftain3', 'Chieftain Mk 5'],
  ['t90', 't90_1992', 'T-90'],
  ['t90a_burlak', 't90a_burlak_proto', 'T-90A Burlak'],
  ['t90ms_tagil', 't90ms_2011', 'T-90MS Tagil'],
] as const;
export const SECOND_WAVE_X_IDS = Object.freeze(entries.map(([id]) => id));
export const SECOND_WAVE_X_DONORS = Object.freeze(Object.fromEntries(entries.map(([id, donor]) => [id, donor])));

// Grounded source datums, not dimensions fitted to a candidate screenshot.
// Roof height excludes antennae/roof weapons. The separately named silhouette
// fields are reference-only P95 body extents measured by the geometry gate
// from the hash-pinned oracle, never copied from candidate measurements.
const dimensions: Readonly<Record<string, FleetDimensions>> = {
  leo2a6: { hullLengthM: 7.63049, overallLengthM: 10.9547999, widthM: 3.80991006, heightM: 2.43111, silhouetteHeightM: 2.888 },
  k1a1: { hullLengthM: 7.627, overallLengthM: 9.72264, widthM: 3.6758, heightM: 2.20756,
    silhouetteHeightM: 2.738168, silhouetteHullLengthM: 7.547909, silhouetteWidthM: 3.599614 },
  amx30b: { hullLengthM: 6.30289, overallLengthM: 9.54869, widthM: 3.11322, heightM: 2.284, silhouetteHeightM: 2.991, silhouetteHullLengthM: 6.662 },
  t62mv1: { hullLengthM: 6.363553662, overallLengthM: 9.510790337, widthM: 3.30, heightM: 2.082969, silhouetteHeightM: 2.558, silhouetteHullLengthM: 6.742 },
  t72b_1987: { hullLengthM: 6.737070506, overallLengthM: 9.703027867, widthM: 3.59, heightM: 2.105640266, silhouetteHeightM: 2.531, silhouetteHullLengthM: 7.243 },
  // release 231: the structural roof rises with the T-80U X ring (t80uXArmor.ts T80U_X_RING_RAISE_M); the silhouette fields stay the oracle's
  t80u: { hullLengthM: 6.720291335, overallLengthM: 9.534282731, widthM: 3.6, heightM: 2.172451481 + T80U_X_RING_RAISE_M, silhouetteHeightM: 2.484, silhouetteHullLengthM: 6.652 },
  leclerc_xlr: { hullLengthM: 7.1303053, overallLengthM: 9.8043880, widthM: 3.6, heightM: 2.36494, silhouetteHeightM: 2.75059, silhouetteHullLengthM: 6.840284 },
  amx56: { ...LECLERC_CLASSIC_X_DATUMS.dims,
    widthM: LECLERC_CLASSIC_X_DATUMS.fieldKitWidthM },
  chieftain_mk10: { hullLengthM: 7.38869, overallLengthM: 10.803698, widthM: 3.678103, heightM: 2.453337,
    silhouetteHeightM:2.8486312905980586,silhouetteWidthM:3.6348535268031235,silhouetteHullLengthM:7.657120909127583 },
  t72b3: { ...T72B3_X_SOURCE_DATUMS.dims, silhouetteHeightM:4.107454637245056,
    silhouetteHullLengthM:7.193154389603283,silhouetteWidthM:3.7600579763835347 },
  jpz_e100: {hullLengthM:8.7475677,overallLengthM:11.4206558,widthM:4.4788417,heightM:3.16101265,
    silhouetteHeightM:3.3847075556530717,silhouetteHullLengthM:8.60631156054847},
  type10: {hullLengthM:7.22996,overallLengthM:9.42,widthM:3.38929737,heightM:2.2148683143,
    silhouetteHeightM:3.6465144162243215,silhouetteHullLengthM:7.630853056295037},
  type90: {hullLengthM:7.798844,overallLengthM:9.80,widthM:3.61781384,heightM:2.459472,
    silhouetteHeightM:3.5972020259823676,silhouetteHullLengthM:7.9386527469955706},
  amx40: {hullLengthM:6.6816,overallLengthM:10.0588002,widthM:3.3585,heightM:2.50869,
    silhouetteHeightM:3.0890287367999556,silhouetteHullLengthM:6.910507586449385},
  c1_ariete: {...ARIETE_C1_X_DATUMS.dims},
  strv122: {...STRV122_SUPPLIED_DATUMS.dims},
  t72b3m_2016:{...T72B3M_X_SOURCE_DATUMS.dims,
    silhouetteHeightM:3.5952429614961154,silhouetteHullLengthM:7.509942752402276},
  challenger1_mk3:{...CHALLENGER1_SUPPLIED_DATUMS.dims},
  t72bu:{...T72BU_X_SOURCE_DATUMS.dims,
    silhouetteHeightM:2.742923826724291,silhouetteHullLengthM:7.573092477768661},
  chieftain5:{hullLengthM:6.57542378005239,overallLengthM:10.470842599868774,
    widthM:3.509999990463257,heightM:2.315201997756958},
  t90:{...T90_AW_X_SOURCE_DATUMS.dims,
    silhouetteHeightM:3.03744235069491,silhouetteHullLengthM:7.094520826181398},
  t90a_burlak:{...T90_BURLAK_X_SOURCE_DATUMS.dims,
    silhouetteHeightM:2.686041350355372,silhouetteHullLengthM:7.022989538577385},
  t90ms_tagil:{...T90MS_X_SOURCE_DATUMS.dims,
    silhouetteHeightM:2.993182508108867,silhouetteHullLengthM:7.040902625836161},
};
type SourceFrame = { turret: [number, number, number]; gun: [number, number, number]; muzzleZ: number };
const frames: Readonly<Record<string, SourceFrame>> = {
  leo2a6: { turret: [.000005, 2.14836, 1.047795], gun: [.000005, 1.97054, 1.419495], muzzleZ: 7.139555 },
  k1a1: { turret: [0, 1.49566, .42564], gun: [.0352, 1.81797, 1.57716], muzzleZ: 5.9052399 },
  amx30b: { turret: [0, 1.584, .285], gun: [-.011, 1.87565, 1.60], muzzleZ: 5.99439 },
  t62mv1: { turret: [0, 1.446436, .3041853764], gun: [0, 1.6650417561, 1.5303753764], muzzleZ: 5.920914939 },
  t72b_1987: { turret: [-.0000548974, 1.4040902854, -.0343498434], gun: [-.0000548633, 1.6208176016, 1.2669569241], muzzleZ: 5.766827075 },
  // release 231: the ring and the trunnion over it raised by T80U_X_RING_RAISE_M (the gun's own frame is unchanged)
  t80u: { turret: [0, 1.55158 + T80U_X_RING_RAISE_M, .0718698169], gun: [0, 1.7564274071 + T80U_X_RING_RAISE_M, 1.4199398169], muzzleZ: 6.002754533 },
  leclerc_xlr: { turret: [-.00215336, 1.40294995, .72122934], gun: [.018886, 1.8791055, 1.998880], muzzleZ: 6.239235 },
  amx56: { turret: [...LECLERC_CLASSIC_X_DATUMS.turretPivot],
    gun: [...LECLERC_CLASSIC_X_DATUMS.trunnion], muzzleZ: LECLERC_CLASSIC_X_DATUMS.muzzleZ },
  chieftain_mk10: { turret: [0, 1.512956, .595241], gun: [.000026, 1.912199, 1.550505], muzzleZ: 7.093385 },
  t72b3: { turret: [...T72B3_X_SOURCE_DATUMS.turretPivot], gun: [...T72B3_X_SOURCE_DATUMS.trunnion], muzzleZ: T72B3_X_SOURCE_DATUMS.muzzleZ },
  jpz_e100: {turret:[-.0007,2.33805,.20],gun:[-.0007,2.33805,.20],muzzleZ:7.04687214},
  type10: {turret:[-.00275904,1.50831687,.20655021],gun:[0,1.851,2.0529],muzzleZ:5.628774},
  type90: {turret:[0,1.681682,.156993],gun:[0,1.997083,1.650032],muzzleZ:5.754624},
  amx40: {turret:[-.03904,1.56289,.16819],gun:[-.00005,1.94827,1.3413],muzzleZ:6.6028},
  c1_ariete: {turret:[...ARIETE_C1_X_DATUMS.turretPivot],
    gun:[...ARIETE_C1_X_DATUMS.trunnion],muzzleZ:ARIETE_C1_X_DATUMS.muzzleZ},
  strv122: {turret:[...STRV122_SUPPLIED_DATUMS.turretPivot],
    gun:[...STRV122_SUPPLIED_DATUMS.trunnion],muzzleZ:STRV122_SUPPLIED_DATUMS.muzzleZ},
  t72b3m_2016:{turret:[...T72B3M_X_SOURCE_DATUMS.turretPivot],gun:[...T72B3M_X_SOURCE_DATUMS.trunnion],muzzleZ:T72B3M_X_SOURCE_DATUMS.muzzleZ},
  challenger1_mk3:{turret:[...CHALLENGER1_SUPPLIED_DATUMS.turretPivot],
    gun:[...CHALLENGER1_SUPPLIED_DATUMS.trunnion],muzzleZ:CHALLENGER1_SUPPLIED_DATUMS.muzzleZ},
  t72bu:{turret:[...T72BU_X_SOURCE_DATUMS.turretPivot],gun:[...T72BU_X_SOURCE_DATUMS.trunnion],muzzleZ:T72BU_X_SOURCE_DATUMS.muzzleZ},
  chieftain5:{turret:[.0031,1.476,.36928],gun:[-.008067,1.859441,1.570],muzzleZ:6.812053203582764},
  t90:{turret:[...T90_AW_X_SOURCE_DATUMS.turretPivot],gun:[...T90_AW_X_SOURCE_DATUMS.trunnion],muzzleZ:T90_AW_X_SOURCE_DATUMS.muzzleZ},
  t90a_burlak:{turret:[...T90_BURLAK_X_SOURCE_DATUMS.turretPivot],gun:[...T90_BURLAK_X_SOURCE_DATUMS.trunnion],muzzleZ:T90_BURLAK_X_SOURCE_DATUMS.muzzleZ},
  t90ms_tagil:{turret:[...T90MS_X_SOURCE_DATUMS.turretPivot],gun:[...T90MS_X_SOURCE_DATUMS.trunnion],muzzleZ:T90MS_X_SOURCE_DATUMS.muzzleZ},
};
const authoredEraZones = { t62mv1: createT62MV1XArmorZones,
  t72b_1987: createT72B1987XArmorZones, t80u: createT80UXArmorZones,
  t72b3: createT72B3XArmorZones,t72b3m_2016:createT72B3MXArmorZones,t72bu:createT72BUXArmorZones,
  t90:createT90AWXArmorZones,t90a_burlak:createT90BurlakXArmorZones,t90ms_tagil:createT90MSXArmorZones };
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

// release 265: the 262 Strv 121's stops (tools/gun-depression-sweep.mjs --no-suit at 26 mm, lane christian2-262), which
// the Strv 122 cloned from its donor; the Strv 121 rebuilt on the 2A4 family takes its own after registration
// (leopard2A4FamilySpecs.ts)
const STRV122_X_GUN_PITCH_BY_YAW_DEG: NonNullable<FleetTankSpec['gunPitchByYawDeg']> = [[0, -7.8], [14, -7.4], [18, -6.2],
  [19, -4.7], [20, -4.3], [26, -3.8], [36, -3.2], [45, -3.2], [51, -3.9], [52, -4.1], [53, -4.4], [54, -5.7], [55, -9],
  [126, -9], [127, -5.9], [128, -4], [129, -3.7], [130, -0.7], [131, 0.2], [135, 1], [140, 1.1], [141, -1.8], [142, -1.5],
  [143, -0.3], [144, 0.2], [161, 0.4], [162, 2.6], [173, 2.8], [174, 3.9], [175, 4.2], [180, 4.2]];

function applyAuthoredFrame(spec: FleetTankSpec, id: string): void {
  if (id === 'c1_ariete') {
    spec.gunPitchByYawDeg = ARIETE_C1_X_GUN_PITCH_BY_YAW_DEG;
  }
  // release 230: the T-72B3's measured stops (t72b3XArmor.ts); its donor template keeps none
  if (id === 't72b3') spec.gunPitchByYawDeg = T72B3_X_GUN_PITCH_BY_YAW_DEG;
  // release 231: the raised T-80U's measured stops (t80uXArmor.ts)
  if (id === 't80u') spec.gunPitchByYawDeg = T80U_X_GUN_PITCH_BY_YAW_DEG;
  if (id === 'strv122') spec.gunPitchByYawDeg = STRV122_X_GUN_PITCH_BY_YAW_DEG;
  const frame = frames[id];
  spec.armor.turretPivot = [...frame.turret];
  spec.armor.gunPivot = [frame.gun[0] - frame.turret[0],
    frame.gun[1] - frame.turret[1], frame.gun[2] - frame.turret[2]];
  spec.armor.gunBarrel.lengthM = frame.muzzleZ - frame.gun[2];
  if (id === 'c1_ariete') {
    spec.visual.trackWidthM = ARIETE_C1_X_DATUMS.trackWidthM;
    // Widest real recoiling sleeve; the independent open bore stays 120 mm.
    spec.armor.gunBarrel.radiusM = .12248 * ARIETE_X_FAMILY_SCALE;
    // 264: the donor prototype's cheek and skirt ERA zones (modern3Specs.ts, its own add-on kit) stay on the prototype:
    // the production C1, and the C2 cloned from it (arieteModernSpecs.ts, which adds its own), draw none of its cassettes
    spec.armor.hullPlates = spec.armor.hullPlates.filter(p => p.kind !== 'era');
    spec.armor.turretPlates = spec.armor.turretPlates.filter(p => p.kind !== 'era');
  }
  if (id === 'jpz_e100') applyJagdpanzerFixedArmor(spec);
  applySourceXAuxArmor(spec, id);
  // The AMX 56 field kit's thick side modules are installed armor stock outside the source skirt faces.
  if (id === 'amx56') applyLeclercClassicXFieldKitArmor(spec);
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

function armorFitDimensions(id: string, dims: FleetDimensions): FleetDimensions {
  // The AMX 56 field kit widens the installed silhouette, not its retained
  // hull or running gear. Fit donor armor in the original structural frame.
  return id === 'amx56'
    ? { ...dims, widthM: LECLERC_CLASSIC_X_DATUMS.dims.widthM } : dims;
}

// A donor that is itself a named prototype hands its clone that prototype's designation (owner 2026-10-25: the procedural
// type90_kyumaru became the STC-1 and carries 'STC-1' as its number); the production study keeps its service number.
const PRODUCTION_NUMBERS: Readonly<Record<string, string>> = Object.freeze({ type90: '73' });

const specs: Record<string, FleetTankSpec> = {};

/**
 * The source 2A6's wedge plates (release 266, Main 2026-10-31): spaced turret_wedge_L/R fitted on its swept cheeks
 * (leopardXWedges.ts, the numbers the profile draws them from) with the family's pair's ratings (the 2A4 OTCO donor's,
 * which the 2A6M carries); its 2A4 donor has none, so its wedges' hits fell to whichever main plate was nearest.
 */
function fitSourceA6Wedges(spec: FleetTankSpec, id: string): void {
  if (id !== 'leo2a6') return;
  const ratings = registries.tankSpecs.leo2a4_otco?.armor.turretPlates.find((plate) => plate.name === 'turret_wedge_L');
  if (!ratings) throw new Error('leo2a6: no turret_wedge ratings on the leo2a4_otco donor to fit its wedge plates with');
  spec.armor.turretPlates = spec.armor.turretPlates.filter((plate) => !/^turret_wedge_[LR]$/.test(plate.name))
    .concat(leopardA6WedgePlates(spec.armor.turretPivot, ratings));
}
for (const [id, donorId, name] of entries) {
  // Registered donors first, then the unregistered templates (t72b_1987, t72b3,
  // jpz_e100 retired 2026-09-23).
  const donor = donorSpec(registries.tankSpecs, donorId);
  const spec = cloneFleetVariantFrom(donor, id, donorId, {
    name, nation: donor.nation, era: donor.era, role: donor.role,
  });
  delete spec.publicVisualFallback;
  delete spec.label;
  delete spec.roster;
  if (PRODUCTION_NUMBERS[id]) spec.visual.number = PRODUCTION_NUMBERS[id];
  // 266 (owner 2026-10-31, the Challenger 1 camo sheet): the Op Granby Mk 3 in plain light stone, as the Bovington Gulf
  // tanks; its Mk 2 donor wears the 1980s BAOR green and black (additionalFleetSpecs.ts)
  if (id === 'challenger1_mk3') Object.assign(spec.visual, { scheme: 'solid', base: '#b59a70', weather: '#c7a97b', patches: [] });
  spec.balancePeerOf = donorId;
  stripSilhouetteDimensions(spec.dims);
  const previous = { ...spec.dims };
  Object.assign(spec.dims, dimensions[id]);
  fitArmorToDims(spec.armor, previous, armorFitDimensions(id, spec.dims));
  applyAuthoredFrame(spec, id);
  fitSourceA6Wedges(spec, id);
  specs[id] = spec;
}
registerFleetSpecs(registries, SECOND_WAVE_X_IDS, specs);

/** Mirror the balanced combat revision without inheriting donor appearance,
 * dimensions, calibration receipts, markings or rig transforms. */
export function synchronizeSecondWaveXCombatMetadata(): void {
  // Combat donor synchronization is initialization-only once final role tuning is published.
  if (isFleetBalanceFinalized(registries.tankSpecs)) return;
  const fields = ['hp', 'enginePowerHp', 'weightTons', 'topSpeedKmh', 'reverseSpeedKmh',
    'hullTraverseDegS', 'terrainResistance', 'pivotStyle', 'turretTraverseDegS',
    'gunPitchDegS', 'gunElevationDeg', 'gunDepressionDeg', 'gun'] as const;
  for (const [id, donorId] of entries) {
    const target = registries.tankSpecs[id], donor = donorSpec(registries.tankSpecs, donorId);
    for (const key of fields) Object.assign(target, { [key]: structuredClone(donor[key]) });
    target.armor = structuredClone(donor.armor);
    fitArmorToDims(target.armor, donor.dims, armorFitDimensions(id, target.dims));
    // 262: the Mk 3 is the late Challenger 1, whose hull front the public estimates raise over the Mk 2's
    if (id === 'challenger1_mk3') rateChallenger1Armor(target.armor, 'late');
    applyAuthoredFrame(target, id);
    fitSourceA6Wedges(target, id);
    restoreInstalledVehicleFrame(target);
  }
}
