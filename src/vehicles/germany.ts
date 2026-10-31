// German Leopard derivative registration. Owner-supplied GLBs stay outside
// the project and are used only for comparison; all playable geometry is
// first-party procedural work in profiles/leopard.ts and profiles/germany.ts.

import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.ts';
import { leopardA6WedgePlates } from './leopardXWedges.ts';
import { LEOPARD_IMPROVED_HULL_WIDTH_SCALE } from './profiles/leopardImprovedHull.ts';
import { LEOPARD_A6_UA_SHELL_DIMS } from './leopardA6UaLayout.ts';
import { applySourceXWesternAuxArmor } from './sourceXWesternAuxArmor.ts';
import {
  frontPlate,
  leftCheekPlate,
  leftSidePlate,
  rightCheekPlate,
  rightSidePlate,
  type ArmorEnvelope,
  type PlateOptions,
  type Vec3Tuple,
} from './specHelpers.ts';
import type { FleetDimensions, FleetTankSpec } from './specContracts.ts';
import {
  bindFleetRegistries,
  cloneFleetVariant,
  registerFleetSpecs,
  scaleNonExternalArmor,
  stripSilhouetteDimensions,
} from './fleetSpecRegistry.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
const GERMANY_IDS = Object.freeze([
  'leo2a3', 'leo2a4m_can', 'leo2a4_otco', 'leo2a4m',
] as const);

type GermanStatOverrides = Partial<Pick<FleetTankSpec,
  | 'hp'
  | 'enginePowerHp'
  | 'weightTons'
  | 'topSpeedKmh'
  | 'reverseSpeedKmh'
  | 'turretTraverseDegS'
  | 'gunPitchDegS'
>>;

interface GermanVariantOptions {
  name: string;
  nation?: string;
  number: string;
  scheme: string;
  base: string;
  weather: string;
  patches: string[];
  camoScale: number;
  dims?: Partial<FleetDimensions>;
  stats?: GermanStatOverrides;
  reloadS?: number;
  shellName?: string;
  turretPivot?: Vec3Tuple;
  gunPivot?: Vec3Tuple;
  gunBarrel?: Partial<ArmorEnvelope['gunBarrel']>;
  armorFactor?: number;
}

/** 258 (vehicles-hit-volume-fit-258): the A4M CAN's skirt plates come from the A2's hull and ran 25 cm past the skirt
 * the A4M draws (and stopped 5 cm short of its nose): fitted to the drawn skirt's run, rear lip to nose. */
function fitSkirtRun(spec: FleetTankSpec, rearZ: number, frontZ: number): FleetTankSpec {
  for (const plate of spec.armor.hullPlates) {
    if (!/^skirt_[LR]$/.test(plate.name ?? '')) continue;
    const zs = plate.verts.map((vertex) => vertex[2]), lo = Math.min(...zs), hi = Math.max(...zs);
    plate.verts = plate.verts.map(([x, y, z]) => [x, y, z === lo ? rearZ : z === hi ? frontZ : z]);
  }
  return spec;
}

function variant(
  id: string,
  donorId: string,
  options: GermanVariantOptions,
): FleetTankSpec {
  const spec = cloneFleetVariant(registries.tankSpecs, id, donorId, {
    name: options.name,
    nation: options.nation || 'Germany',
  });
  Object.assign(spec, options.stats || {});
  if (options.reloadS !== undefined && Number.isFinite(options.reloadS)) {
    spec.gun.reloadS = options.reloadS;
  }
  if (options.shellName && spec.gun.shells[0]) spec.gun.shells[0].name = options.shellName;
  // Ground-up rows own their silhouette receipts; donor gate overrides must
  // not survive into a new geometry package.
  if (options.dims) {
    stripSilhouetteDimensions(spec.dims);
    spec.dims = { ...spec.dims, ...options.dims };
  }
  // Measured ring, trunnion, and muzzle dimensions are also the shadow-proxy
  // truth, so copy tuples into the mutable armor envelope explicitly.
  if (options.turretPivot) spec.armor.turretPivot = [...options.turretPivot];
  if (options.gunPivot) spec.armor.gunPivot = [...options.gunPivot];
  if (options.gunBarrel) Object.assign(spec.armor.gunBarrel, options.gunBarrel);
  spec.visual = {
    ...spec.visual,
    scheme: options.scheme,
    base: options.base,
    weather: options.weather,
    patches: options.patches,
    marking: 'number',
    number: options.number,
    camoScale: options.camoScale,
  };
  if (options.armorFactor) scaleNonExternalArmor(spec, options.armorFactor);
  return spec;
}

const GERMANY_SPECS = {
  leo2a3: variant('leo2a3', 'leo2a2', {
    name: 'Leopard 2A3', number: 'OTCO', scheme: 'stripes',
    base: '#4b5140', weather: '#666a57', patches: ['#2d3328', '#665a42', '#77725e'],
    camoScale: 0.44,
    dims: { hullLengthM: 7.72, overallLengthM: 9.67, widthM: 3.70, heightM: 2.90 },
    stats: { hp: 2250, enginePowerHp: 1500, weightTons: 56.0, topSpeedKmh: 68,
      reverseSpeedKmh: 31, turretTraverseDegS: 36, gunPitchDegS: 31 },
    // 260 (fidelity): no armorFactor. The fourth batch changed radios, grilles, the gunner's chest rest and the
    // ammunition hatch, not the armour (armedconflicts.com/-t84825); the first four batches (2A1-2A3) share the basic
    // armour package and improved armour arrives with the sixth batch's 2A4 (joint-forces.com/features/31130).
    reloadS: 6.1, shellName: 'DM53 APFSDS',
  }),
  leo2a4m_can: fitSkirtRun(variant('leo2a4m_can', 'leo2a2', {
    name: 'Leopard 2A4M CAN', number: 'A4M', scheme: 'stripes',
    base: '#4a5141', weather: '#656b58', patches: ['#2b3329', '#625941', '#77705b'],
    camoScale: 0.42,
    dims: { hullLengthM: 7.72, overallLengthM: 9.96, widthM: 3.77, heightM: 2.62 },
    // The ring reproduces the donor A4 seat margin while the certified gun
    // axis and 9.96 m overall muzzle receipt remain unchanged.
    turretPivot: [0, 1.70, 0.30], gunPivot: [0, 0.30, 1.13],
    gunBarrel: { lengthM: 4.81, radiusM: 0.10 },
    stats: { hp: 2450, enginePowerHp: 1500, weightTons: 61.8, topSpeedKmh: 68,
      reverseSpeedKmh: 31, turretTraverseDegS: 38, gunPitchDegS: 32 },
    reloadS: 5.9, shellName: 'DM53A1 APFSDS', armorFactor: 1.22,
  }), -3.605, 3.717),
  leo2a4_otco: variant('leo2a4_otco', 'leo2a4', {
    name: 'Leopard 2A4 OTCO', number: 'A6M', scheme: 'stripes',
    base: '#48503f', weather: '#626956', patches: ['#293128', '#605640', '#746d58'],
    camoScale: 0.40,
    dims: { hullLengthM: 7.72, overallLengthM: 10.97, widthM: 3.98, heightM: 3.03 },
    // Measured L55 rig: the authored bore mouth lands at the published 10.97
    // m overall line from the ISAF cage tail.
    turretPivot: [0, 1.80, 0.45], gunPivot: [0, 0.33, 0.85],
    gunBarrel: { lengthM: 5.98, radiusM: 0.10 },
    stats: { hp: 2600, enginePowerHp: 1500, weightTons: 64.1, topSpeedKmh: 68,
      reverseSpeedKmh: 31, turretTraverseDegS: 40, gunPitchDegS: 34 },
    reloadS: 5.7, shellName: 'DM63 APFSDS', armorFactor: 1.27,
  }),
  leo2a4m: variant('leo2a4m', 'leo2a4_v', {
    name: 'Leopard 2A4M', number: 'A5NL', scheme: 'stripes',
    base: '#465041', weather: '#626b58', patches: ['#273229', '#625a42', '#78715c'],
    camoScale: 0.39,
    dims: { hullLengthM: 7.72, overallLengthM: 9.97, widthM: 3.98, heightM: 3.12 },
    stats: { hp: 2825, enginePowerHp: 1500, weightTons: 63.8, topSpeedKmh: 68,
      reverseSpeedKmh: 31, turretTraverseDegS: 40, gunPitchDegS: 34 },
    reloadS: 5.6, shellName: 'DM63A1 APFSDS', armorFactor: 1.30,
  }),
} satisfies Record<string, FleetTankSpec>;

registerFleetSpecs(registries, GERMANY_IDS, GERMANY_SPECS);

// Clone before adding the A6M's separate fitted frontal package. The
// Ukrainian vehicle owns its own field-modernized sector layout.
// 264 (the owner, 2026-10-28: rebuilt "off of our new current actual leopard 2a6"): the visual is the source-measured
// 2A6 (profiles/leopardA6X.ts) with its field kit (profiles/leopardA6Ua.ts), so the ring, trunnion and muzzle are that
// rig's (LEOPARD_A6_X_DATUMS.leo2a6; muzzle 7.139555). Its mobility, ERA sectors and dimensions are unchanged (the kit
// is sized to the 4.44 m width and 3.28 m height); its main plates, HP and cadence are the 2A6's (fleetBalancePass.ts).
const LEOPARD_2A6_UA_ID = 'leo2a6_ua';
const leopard2A6UA = variant(LEOPARD_2A6_UA_ID, 'leo2a4_otco', {
  name: 'Leopard 2A6 UA', nation: 'Ukraine', number: 'UA 26', scheme: 'digital',
  base: '#4d5343', weather: '#686858', patches: ['#2d382f', '#6c654d', '#4b5141'],
  camoScale: 0.46,
  dims: { hullLengthM: 7.72, overallLengthM: 10.97, widthM: 4.44, heightM: 3.28 },
  turretPivot: [.000005, 2.14836, 1.047795], gunPivot: [0, 1.97054 - 2.14836, 1.419495 - 1.047795],
  gunBarrel: { lengthM: 7.139555 - 1.419495 },
  stats: { hp: 2850, enginePowerHp: 1500, weightTons: 72.4, topSpeedKmh: 64,
    reverseSpeedKmh: 29, turretTraverseDegS: 38, gunPitchDegS: 32 },
  reloadS: 5.8, shellName: 'DM63A1 APFSDS', armorFactor: 1.06,
});
// 264b (Main's armour-truth audit, 2026-10-29): the UA's spaced and track plates sit on the 2A6 shell it is drawn on, as
// leo2a6's do. The 2A6M donor's one-piece spaced wedge pair (turret_wedge_R/L) stood at the 2A6M turret's height, up to
// 0.7 m over the 2A6 roof, where flank and top fire met it, and its template skirts covered y 0.45-1.15 m against the
// 2A6's leaves and heavy panels at 0.88-1.33 m. That donor pair does not return (266: a pair fitted on the drawn cheeks
// does, below); the skirts
// take the 2A6's faces with the UA's own ratings (sourceXWesternAuxArmor.ts). Its Kontakt-1 stays seated on both.
applySourceXWesternAuxArmor(leopard2A6UA, LEOPARD_2A6_UA_ID);
// 266 (Main 2026-10-31): the wedge pair returns fitted on the 2A6 cheeks the UA is drawn with (leopardXWedges.ts), not the
// donor's free-standing one: without it the wedges' hits fell to whichever main plate was nearest. Its donor's ratings.
{
  const ratings = registries.tankSpecs.leo2a4_otco?.armor.turretPlates.find((plate) => plate.name === 'turret_wedge_L');
  if (!ratings) throw new Error(`${LEOPARD_2A6_UA_ID}: no turret_wedge ratings on the leo2a4_otco donor to fit its wedge plates with`);
  leopard2A6UA.armor.turretPlates = leopard2A6UA.armor.turretPlates.filter((plate) => !/^turret_wedge_[LR]$/.test(plate.name))
    .concat(leopardA6WedgePlates(leopard2A6UA.armor.turretPivot, ratings));
}
{
  // the track faces: the Leopard 2 template's, fitted from the 2A4's dimensions to the 2A6's, as leo2a6 takes them
  // (sourceXSecondWaveSpecs.ts fitArmorToDims)
  const from = registries.tankSpecs.leo2a4?.dims, to = LEOPARD_A6_UA_SHELL_DIMS;
  if (!from) throw new Error(`${LEOPARD_2A6_UA_ID}: the Leopard 2A4 template frame is not registered`);
  const sx = to.widthM / from.widthM, sy = to.heightM / from.heightM, sz = to.hullLengthM / from.hullLengthM;
  for (const plate of leopard2A6UA.armor.hullPlates) {
    if (plate.kind !== 'external' || !/^track_[LR]$/.test(plate.name)) continue;
    plate.verts = plate.verts.map(([x, y, z]): Vec3Tuple => [x * sx, y * sy, z * sz]);
  }
}

interface EraReduction {
  readonly keReduction: number;
  readonly ceFlatMm: number;
}

const ukrainianNizh: EraReduction = Object.freeze({ keReduction: 0.22, ceFlatMm: 480 });
const ukrainianNizhSkirt: EraReduction = Object.freeze({ keReduction: 0.12, ceFlatMm: 320 });
const eraLayer = (era: EraReduction, keMm: number, ceMm: number): PlateOptions => ({
  kind: 'era', era, keMm, ceMm,
});

registries.tankSpecs.leo2a4m.armor.hullPlates.push(
  rightSidePlate('a5nl_skirt_era_R', 18, 1.95, 0.78, 1.95, 1.49, -3.25, 3.25,
    eraLayer(ukrainianNizhSkirt, 180, 560)),
  leftSidePlate('a5nl_skirt_era_L', 18, 1.95, 0.78, 1.95, 1.49, -3.25, 3.25,
    eraLayer(ukrainianNizhSkirt, 180, 560)),
);

function addLeopard2A6UAFieldEraSectors(spec: FleetTankSpec): void {
  spec.armor.hullPlates.push(
    rightSidePlate('ua_skirt_era_R', 18, 2.04, 0.72, 2.04, 1.48, -3.08, 3.22,
      eraLayer(ukrainianNizhSkirt, 145, 520)),
    leftSidePlate('ua_skirt_era_L', 18, 2.04, 0.72, 2.04, 1.48, -3.08, 3.22,
      eraLayer(ukrainianNizhSkirt, 145, 520)),
  );
  spec.armor.turretPlates.push(
    rightCheekPlate('ua_turret_cheek_era_R', 18, 0.34, 2.58, 1.48, 1.30,
      0.05, 0.78, 0.14, 0, eraLayer(ukrainianNizh, 780, 1280)),
    leftCheekPlate('ua_turret_cheek_era_L', 18, 0.34, 2.58, 1.48, 1.30,
      0.05, 0.78, 0.14, 0, eraLayer(ukrainianNizh, 780, 1280)),
    rightSidePlate('ua_turret_side_era_R', 18, 1.56, 0.05, 1.56, 0.76,
      -2.86, 1.22, eraLayer(ukrainianNizhSkirt, 320, 720)),
    leftSidePlate('ua_turret_side_era_L', 18, 1.56, 0.05, 1.56, 0.76,
      -2.86, 1.22, eraLayer(ukrainianNizhSkirt, 320, 720)),
  );
}

// A6M keeps only the requested frontal field package. Its certified ISAF
// cage, skirts, and 3.98 m silhouette remain untouched.
registries.tankSpecs.leo2a4_otco.armor.hullPlates.push(
  frontPlate('a6m_upper_glacis_era', 18, 1.46, 1.65, 2.12, 1.39, 3.08,
    eraLayer(ukrainianNizh, 620, 1120)),
);
registries.tankSpecs.leo2a4_otco.armor.turretPlates.push(
  rightCheekPlate('a6m_turret_cheek_era_R', 18, 0.32, 2.66, 1.48, 1.30,
    0.05, 0.78, 0.16, 0, eraLayer(ukrainianNizh, 780, 1280)),
  leftCheekPlate('a6m_turret_cheek_era_L', 18, 0.32, 2.66, 1.48, 1.30,
    0.05, 0.78, 0.16, 0, eraLayer(ukrainianNizh, 780, 1280)),
);

// The A7V turret front is permanent layered arrowhead armor, not ERA. Keep
// the separate fitted upper-glacis ERA sector, but model the two broad cheek
// layers as non-consumable spaced armor so damage, gallery overlays and the
// procedural panel geometry all describe the same construction.
registries.tankSpecs.leo2_improved.armor.hullPlates.push(
  frontPlate('a7v_upper_glacis_era', 18, 1.50 * LEOPARD_IMPROVED_HULL_WIDTH_SCALE, 1.60, 2.10, 1.43, 2.84,
    eraLayer(ukrainianNizh, 620, 1120)),
);
registries.tankSpecs.leo2_improved.armor.turretPlates.push(
  rightCheekPlate('a7v_turret_cheek_layer_R', 34, 0.36, 2.58, 1.40, 1.42,
    0.09, 0.66, 0.78, 0, { kind: 'spaced', keMm: 420, ceMm: 760 }),
  leftCheekPlate('a7v_turret_cheek_layer_L', 34, 0.36, 2.58, 1.40, 1.42,
    0.09, 0.66, 0.78, 0, { kind: 'spaced', keMm: 420, ceMm: 760 }),
);
addLeopard2A6UAFieldEraSectors(leopard2A6UA);

registerFleetSpecs(registries, [LEOPARD_2A6_UA_ID], {
  [LEOPARD_2A6_UA_ID]: leopard2A6UA,
});
