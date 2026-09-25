// src/vehicles/specs.ts — pure gameplay stat and armor data for the registered fleet.
// PURE data module: no three import, no side effects. Runs under plain node.
// Sources: docs/history/research/tank-roster.md (+ locked overrides in docs/ARCHITECTURE.md §3.3.1).
// Units per ARCHITECTURE §1.2 — suffixed fields keep human units; consumers convert.

import { tankLabelRecord } from './tankLabels.ts';
import { vehicleMarkingRecord } from './vehicleMarkings.ts';
import {
  DEV_FLEET_ACTIVE,
  DEV_FLEET_LABEL,
  RETIRED_EXTERNAL_PLACEHOLDER_IDS,
  developmentOnlyReason,
  isProductionHiddenTankId,
  isRetiredHistoricalTank,
} from './rosterPolicy.ts';
import { FIRST_PARTY_VEHICLE_AUTHORSHIP } from '../authorship.ts';
import { applyVehicleTaxonomy } from './taxonomy.ts';
import { applyFleetLauncherMuzzles } from './fleetLauncherMuzzles.ts';
import {
  plate as par,
  frontPlate as fr,
  rearPlate as rr,
  rightSidePlate as sR,
  leftSidePlate as sL,
  roofPlate as rf,
  rightCheekPlate as chR,
  leftCheekPlate as chL,
  moduleBox as mbox,
  crewBox as cbox,
  shell,
  reactivePlate,
  apfsdsPenetration as apfsdsPens,
  communityArmor,
} from './specHelpers.ts';
import type {
  ArmorEnvelope,
  ArmorPlate,
  MutableVec3Tuple,
} from './specHelpers.ts';
import type {
  AimBloom,
  FleetDimensions,
  FleetTankSpec,
  ModelSourceRegistry,
  TankSpecRegistry,
} from './specContracts.ts';

type TrackModule = 'trackL' | 'trackR';
type MutableVec2Tuple = [number, number];

interface TrackHull {
  readonly module?: TrackModule;
  readonly x0: number;
  readonly x1: number;
  readonly poly: readonly (readonly [number, number])[];
}

type TrackShapePlate = Omit<ArmorPlate, 'verts'>;

interface TrackShape {
  readonly module: TrackModule;
  x0: number;
  x1: number;
  poly: MutableVec2Tuple[];
  readonly plate: TrackShapePlate;
}

interface TrackArmorEnvelope extends ArmorEnvelope {
  trackShapesOverride?: TrackHull[];
  trackShapes?: TrackShape[];
}

interface ArmorScale {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface ArmorBox {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

type TrackSide = -1 | 1;

/** Foundational roster ids in their locked relative garage-carousel order. */
// Owner 2026-09-22 ("we shouldn't have any hidden tanks"): the five archived
// WWII core hulls (m4a3e8, tiger1, t34_85, is2, panther_g), the M1A2 legacy
// donor and the Leopard 2A7 donor left the saved fleet on 2026-09-23. The
// combat rows live vehicles were cloned from survive as unregistered donor
// templates in donorSpecs.ts.
export const TANK_IDS: string[] = ['m1a2', 't90m', 't90m_proryv'];


// controls_gunnery r2: afterShot 4/3 → 2.8/2.2 with the movement.ts LN6
// shrink tau so a second aimed shot is possible ~2.3 s (modern) / ~3.5 s
// (WW2) after firing — the old pair needed ~4.6 s on an M1A2.
const BLOOM_WW2: AimBloom = { move: 0.20, hullRot: 0.20, turret: 0.12, afterShot: 2.8 };
const BLOOM_MODERN: AimBloom = { move: 0.06, hullRot: 0.08, turret: 0.06, afterShot: 2.2 };

// ---------------------------------------------------------------------------
// M1A2 Abrams SEPv3 (composite: keMm/ceMm are RHAe estimates; physicalMm for geometry)
// ---------------------------------------------------------------------------
function armorM1A2(): ArmorEnvelope {
  const trkTop = 1.05, floor = 0.45, roofY = 1.47;
  return {
    boundingRadiusM: 5.2,
    turretPivot: [0, 1.47, -0.2],
    gunPivot: [0, 0.30, 0.75],
    gunBarrel: { lengthM: 5.28, radiusM: 0.11 },
    hullPlates: [
      fr('upper_glacis', 38, 1.6, 1.0, 3.90, roofY, 1.60, { keMm: 120, ceMm: 120 }),  // ~76 deg
      fr('lower_front', 650, 1.6, floor, 3.50, 1.0, 3.90, { keMm: 600, ceMm: 750 }),
      sR('hull_side_upper_R', 40, 1.83, trkTop, 1.83, roofY, -3.9, 1.6),
      sL('hull_side_upper_L', 40, 1.83, trkTop, 1.83, roofY, -3.9, 1.6),
      sR('hull_side_lower_R', 40, 1.19, floor, 1.19, trkTop, -3.8, 3.5),
      sL('hull_side_lower_L', 40, 1.19, floor, 1.19, trkTop, -3.8, 3.5),
      sR('skirt_front_R', 70, 1.86, 0.6, 1.86, 1.07, 0.9, 3.9, { kind: 'spaced', keMm: 150, ceMm: 450 }),
      sL('skirt_front_L', 70, 1.86, 0.6, 1.86, 1.07, 0.9, 3.9, { kind: 'spaced', keMm: 150, ceMm: 450 }),
      sR('skirt_rear_R', 10, 1.86, 0.6, 1.86, 1.07, -3.9, 0.9, { kind: 'spaced' }),
      sL('skirt_rear_L', 10, 1.86, 0.6, 1.86, 1.07, -3.9, 0.9, { kind: 'spaced' }),
      sR('track_R', 25, 1.51, 0.15, 1.51, trkTop, -3.96, 3.96, { kind: 'external', moduleLink: 'trackR' }),
      sL('track_L', 25, 1.51, 0.15, 1.51, trkTop, -3.96, 3.96, { kind: 'external', moduleLink: 'trackL' }),
      rr('hull_rear', 30, 1.6, floor, -3.96, roofY, -3.96),
      rf('hull_roof', 40, 1.6, roofY, -3.96, 1.60),
    ],
    turretPlates: [
      chR('turret_cheek_R', 800, 0.24, 1.12, 1.66, 0.26, 0.0, 0.85, 0.13, 0, { keMm: 850, ceMm: 1250 }),
      chL('turret_cheek_L', 800, 0.24, 1.12, 1.66, 0.26, 0.0, 0.85, 0.13, 0, { keMm: 850, ceMm: 1250 }),
      par('mantlet', 300, [-0.28, 0.05, 1.12], [0.28, 0.05, 1.12], [-0.28, 0.52, 1.09],
        { keMm: 350, ceMm: 450, gunFollow: true }),
      sR('turret_side_R', 350, 1.66, 0.0, 1.66, 0.85, -2.62, 0.12, { keMm: 380, ceMm: 500 }),
      sL('turret_side_L', 350, 1.66, 0.0, 1.66, 0.85, -2.62, 0.12, { keMm: 380, ceMm: 500 }),
      rr('turret_rear', 40, 1.62, 0.0, -2.62, 0.85, -2.62),            // ammo blow-off zone
      rf('turret_roof', 40, 1.62, 0.86, -2.62, 0.6),
      rr('bustle_rack', 10, 1.58, 0.15, -3.34, 0.75, -3.34, { kind: 'external' }),
    ],
    modules: [
      mbox('engine', [-1.0, 0.5, -3.85], [1.0, 1.5, -2.0]),
      mbox('fuelTank', [-1.15, 0.5, 2.4], [-0.45, 1.4, 3.6]),          // front-left fuel cell
      mbox('ammoRack', [-0.85, 0.0, -2.55], [0.85, 0.75, -0.9], true),// turret bustle
      mbox('turretRing', [-0.95, 1.37, -1.3], [0.95, 1.57, 0.9]),
      mbox('radio', [-0.6, 0.1, -0.85], [-0.1, 0.5, -0.35], true),
      mbox('optics', [0.35, 0.82, 0.35], [0.8, 1.1, 0.85], true),      // GPS doghouse
      mbox('gun', [-0.18, 0.05, -0.5], [0.18, 0.55, 0.75], true),
      mbox('trackL', [-1.83, 0.0, -3.96], [-1.19, trkTop, 3.96]),
      mbox('trackR', [1.19, 0.0, -3.96], [1.83, trkTop, 3.96]),
    ],
    crew: [
      cbox('driver', [-0.35, 0.55, 2.3], [0.35, 1.15, 3.4]),
      cbox('gunner', [0.25, 0.0, -0.1], [0.85, 0.7, 0.6], true),
      cbox('commander', [0.25, 0.05, -0.85], [0.9, 0.78, -0.2], true),
      cbox('loader', [-0.9, 0.0, -0.55], [-0.25, 0.75, 0.4], true),
    ],
  };
}

// ---------------------------------------------------------------------------
// T-90M Proryv (Relikt ERA: consumable tiles, keReduction 0.25 / ceFlat 500)
// ---------------------------------------------------------------------------
function armorT90M(): ArmorEnvelope {
  // r7: hull roof dropped 1.45 -> 1.40 with the barge-hull visual rebuild
  // (deck band rides just above the fender line; turret scaled up instead).
  const trkTop = 1.0, floor = 0.43, roofY = 1.40;
  const relikt = { keReduction: 0.30, ceFlatMm: 600 };
  const reliktSkirt = { keReduction: 0.18, ceFlatMm: 400 };
  return {
    boundingRadiusM: 5.1,
    turretPivot: [0, 1.40, 0.15],
    gunPivot: [0, 0.32, 0.55],
    gunBarrel: { lengthM: 6.0, radiusM: 0.105 },
    hullPlates: [
      fr('glacis_era_L', 15, 0.78, 0.95, 3.42, 1.42, 2.02, { kind: 'era', era: relikt }),
      fr('upper_glacis', 500, 1.55, 0.85, 3.35, roofY, 1.85, { keMm: 560, ceMm: 760 }), // 68 deg
      fr('lower_front', 80, 1.55, floor, 3.05, 0.85, 3.35, { keMm: 130, ceMm: 160 }),
      sR('hull_side_upper_R', 70, 1.89, trkTop, 1.89, roofY, -3.4, 1.9, { keMm: 90, ceMm: 110 }),
      sL('hull_side_upper_L', 70, 1.89, trkTop, 1.89, roofY, -3.4, 1.9, { keMm: 90, ceMm: 110 }),
      sR('hull_side_lower_R', 70, 1.31, floor, 1.31, trkTop, -3.3, 3.0, { keMm: 90, ceMm: 110 }),
      sL('hull_side_lower_L', 70, 1.31, floor, 1.31, trkTop, -3.3, 3.0, { keMm: 90, ceMm: 110 }),
      sR('skirt_era_R', 15, 1.90, 0.45, 1.90, 1.05, 0.2, 3.3, { kind: 'era', era: reliktSkirt }),
      sL('skirt_era_L', 15, 1.90, 0.45, 1.90, 1.05, 0.2, 3.3, { kind: 'era', era: reliktSkirt }),
      sR('skirt_rubber_R', 8, 1.90, 0.45, 1.90, 1.05, -3.3, 0.2, { kind: 'spaced' }),
      sL('skirt_rubber_L', 8, 1.90, 0.45, 1.90, 1.05, -3.3, 0.2, { kind: 'spaced' }),
      sR('track_R', 20, 1.60, 0.12, 1.60, trkTop, -3.43, 3.43, { kind: 'external', moduleLink: 'trackR' }),
      sL('track_L', 20, 1.60, 0.12, 1.60, trkTop, -3.43, 3.43, { kind: 'external', moduleLink: 'trackL' }),
      rr('slat_cage', 10, 1.5, 0.5, -3.6, 1.3, -3.6, { kind: 'spaced' }),
      rr('hull_rear', 45, 1.55, floor, -3.43, roofY, -3.43),
      rf('hull_roof', 40, 1.55, roofY, -3.4, 1.85),
    ],
    turretPlates: [
      chR('turret_era_R', 15, 0.28, 1.02, 1.10, 0.32, 0.05, 0.68, 0.08, 0, { kind: 'era', era: relikt }),
      chL('turret_era_L', 15, 0.28, 1.02, 1.10, 0.32, 0.05, 0.68, 0.08, 0, { kind: 'era', era: relikt }),
      chR('turret_cheek_R', 650, 0.22, 0.86, 1.06, 0.18, 0.0, 0.70, 0.08, 0, { keMm: 700, ceMm: 900 }),
      chL('turret_cheek_L', 650, 0.22, 0.86, 1.06, 0.18, 0.0, 0.70, 0.08, 0, { keMm: 700, ceMm: 900 }),
      par('mantlet', 300, [-0.22, 0.08, 0.92], [0.22, 0.08, 0.92], [-0.22, 0.48, 0.89],
        { keMm: 400, ceMm: 500, gunFollow: true }),
      sR('side_era_R', 15, 1.16, 0.1, 1.16, 0.55, -0.5, 0.2, { kind: 'era', era: reliktSkirt }),
      sL('side_era_L', 15, 1.16, 0.1, 1.16, 0.55, -0.5, 0.2, { kind: 'era', era: reliktSkirt }),
      sR('turret_side_R', 300, 1.10, 0.0, 1.10, 0.70, -0.95, 0.2, { keMm: 350, ceMm: 500 }),
      sL('turret_side_L', 300, 1.10, 0.0, 1.10, 0.70, -0.95, 0.2, { keMm: 350, ceMm: 500 }),
      rr('turret_bustle', 45, 0.95, 0.0, -1.92, 0.58, -1.92),
      rf('turret_roof', 45, 1.05, 0.74, -0.95, 0.55),
    ],
    modules: [
      mbox('engine', [-1.0, 0.45, -3.3], [1.0, 1.4, -1.7]),
      mbox('fuelTank', [0.6, 0.45, -1.65], [1.25, 1.05, -0.3]),
      mbox('ammoRack', [-0.7, 0.45, -0.5], [0.7, 0.95, 0.7]),          // carousel autoloader
      mbox('turretRing', [-0.85, 1.27, -0.75], [0.85, 1.47, 0.95]),
      mbox('radio', [-0.6, 0.05, -1.2], [-0.1, 0.5, -0.75], true),
      mbox('optics', [-0.6, 0.62, 0.25], [-0.15, 0.95, 0.7], true),    // Sosna-U
      mbox('gun', [-0.18, 0.05, -0.45], [0.18, 0.5, 0.6], true),
      mbox('trackL', [-1.89, 0.0, -3.43], [-1.31, trkTop, 3.43]),
      mbox('trackR', [1.31, 0.0, -3.43], [1.89, trkTop, 3.43]),
    ],
    crew: [
      cbox('driver', [-0.35, 0.5, 1.9], [0.35, 1.1, 2.9]),
      cbox('gunner', [-0.75, 0.0, -0.2], [-0.2, 0.6, 0.5], true),
      cbox('commander', [0.2, 0.0, -0.45], [0.78, 0.62, 0.3], true),
    ],
  };
}

// ---------------------------------------------------------------------------
// The spec table (locked values from ARCHITECTURE §3.3.1 + roster tables)
// ---------------------------------------------------------------------------

export const TANK_SPECS: TankSpecRegistry = {
  t90m: {
    id: 't90m', name: 'T-90AM', nation: 'Russia', era: 'modern', role: 'mbt',
    hp: 2700,
    enginePowerHp: 1130, weightTons: 48, topSpeedKmh: 65, reverseSpeedKmh: 12,
    hullTraverseDegS: 44,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 40, gunPitchDegS: 32, gunElevationDeg: 14, gunDepressionDeg: 6,
    gun: {
      caliberMm: 125, reloadS: 6.4, baseAccuracy: 0.31, aimTimeS: 1.8,
      bloom: BLOOM_MODERN,
      shells: [
        shell('3BM60 Svinets-2', 'APFSDS', 125, 855, 800, 560, 1800, { pen2000Mm: 720 }),
        shell('3BK31 HEAT', 'HEAT', 125, 800, 800, 500, 905),
        shell('3OF82 HE-Frag', 'HE', 125, 55, 55, 600, 850),
      ],
    },
    dims: { hullLengthM: 6.86, overallLengthM: 9.63, widthM: 3.78, heightM: 2.39 },
    armor: armorT90M(),
    visual: {
      // r8: FACTORY is the roster-doc "Russian dark forest green overall"
      // solid — the digital speckle rendered as dithered confetti at garage
      // distance and killed the silhouette read; 'digital' stays available
      // as a picker pattern (nation-flavored, retuned scale).
      scheme: 'solid', base: '#3f5138', weather: '#4a5c42', patches: [],
      marking: 'number', number: '527', trackWidthM: 0.58,
    },
  },

  m1a2: {
    // OWNER IDENTITY SWAP (2026-08-14): Tejas is the canonical M1A2. This row
    // was the 'm1a2_legacy' procedural anchor that m1a2 used to structuredClone;
    // the legacy record itself retired on 2026-09-23 (hidden-fleet cleanup), so
    // the anchor row now IS the M1A1 HC mark (2026-09-15 owner: the X study is
    // the M1A2; this hull is the HC mark).
    id: 'm1a2', name: 'M1A1 Abrams HC', nation: 'USA', era: 'modern', role: 'mbt',
    hp: 2600,
    // Real SEPv3 reverses at ~40 km/h, but that reads arcade-y next to the
    // 5-8 km/h WW2 roster and sits far outside the WoT-feel envelope
    // (10-20 km/h reverse across all classes) — cap modern MBTs at 25.
    enginePowerHp: 1500, weightTons: 66.8, topSpeedKmh: 67, reverseSpeedKmh: 25,
    hullTraverseDegS: 44,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 40, gunPitchDegS: 32, gunElevationDeg: 20, gunDepressionDeg: 10,
    gun: {
      caliberMm: 120, reloadS: 6.0, baseAccuracy: 0.30, aimTimeS: 1.8,
      bloom: { ...BLOOM_MODERN },
      shells: [
        shell('M829A4 APFSDS', 'APFSDS', 120, apfsdsPens(750)[0], apfsdsPens(750)[1], 540, 1670, { pen2000Mm: apfsdsPens(750)[2] }),
        shell('M830A1 MPAT', 'HEAT', 120, 600, 600, 480, 1400),
        shell('M1147 AMP', 'HE', 120, 60, 60, 600, 1000),
      ],
    },
    dims: { hullLengthM: 7.93, overallLengthM: 9.77, widthM: 3.66, heightM: 3.30 },
    armor: armorM1A2(),
    visual: {
      scheme: 'nato', base: '#49543c', weather: '#525f45',
      patches: ['#23261f', '#4a3a2c'],
      marking: 'number', number: '23', trackWidthM: 0.635,
      camoScale: 0.5,
    },
  },

};

// The M1A1 HC anchor carries live ERA zones for its visible cassette arrays.
TANK_SPECS.m1a2.armor.hullPlates.push(
  reactivePlate('m1a2_skirt_era_R', 'right'),
  reactivePlate('m1a2_skirt_era_L', 'left'),
  reactivePlate('m1a2_glacis_era_R', 'front'),
  reactivePlate('m1a2_glacis_era_L', 'front'),
);
TANK_SPECS.m1a2.armor.turretPlates.push(
  reactivePlate('m1a2_turret_era_R', 'right'),
  reactivePlate('m1a2_turret_era_L', 'left'),
);

// T-90M glacis ERA is split into two tiles so strips read locally.
{
  const t90 = TANK_SPECS.t90m.armor;
  const l = t90.hullPlates[0];
  // Re-place the single glacis ERA quad as two side-by-side tiles.
  const mk = (name: string, x0: number, x1: number): ArmorPlate => par(name, 15,
    [x0, 0.95, 3.42], [x1, 0.95, 3.42], [x0, 1.42, 2.02],
    { kind: 'era', era: l.era ?? undefined });
  t90.hullPlates.splice(0, 1, mk('glacis_era_L', -1.5, -0.02), mk('glacis_era_R', 0.02, 1.5));
}

// The established Proryv reconstruction remains addressable as T-90M at
// tier IX.  Tier X is a distinct first-party configuration with the denser
// two-row Relikt chevron front; both share the corrected long T-90 chassis.
TANK_SPECS.t90m_proryv = structuredClone(TANK_SPECS.t90m);
TANK_SPECS.t90m_proryv.id = 't90m_proryv';
TANK_SPECS.t90m_proryv.name = 'T-90M Proryv';
TANK_SPECS.t90m_proryv.hp = 2850;
TANK_SPECS.t90m_proryv.visual.number = '623';

// ===========================================================================
// FIRST-PARTY PROCEDURAL EXPANSION TANKS.
//
// These gameplay rows began life beside isolated third-party measurement
// references, but the selectable models are now repository-authored
// procedural builds.  Reference credits belong in ATTRIBUTION/reference
// tooling, never on a playable spec: a `community` field used to make the UI
// imply that the reference mesh itself was shipping.  The owner-only roster
// finalizer below enforces that distinction after every extension pack loads.
// Armor models are parametric balance layouts, not copied mesh payloads.
// ===========================================================================


/** First-party expansion ids (garage carousel order, appended after core). */
// 2026-09-23: the other sixteen expansion rows (the archived WWII / Cold War
// study hulls and the two reference placeholders) retired with the hidden
// fleet; jpz_e100 survives as an unregistered donor in donorSpecs.ts.
const FIRST_PARTY_EXPANSION_TANK_IDS: string[] = [
  'strv103',
  // wave 2 (print-model crawl, 2026-07-28)
  'kv2',
];

const FIRST_PARTY_EXPANSION_SPECS: TankSpecRegistry = {
  strv103: {
    id: 'strv103', name: 'Stridsvagn 103', nation: 'Sweden', era: 'modern', role: 'td',
    community: {
      author: 'Lukasz Wesiora (canisferus)',
      source: 'https://opengameart.org/content/stridsvagn-103',
      license: 'CC-BY 3.0',
    },
    hp: 1100,
    enginePowerHp: 730, weightTons: 39.7, topSpeedKmh: 50, reverseSpeedKmh: 25,
    hullTraverseDegS: 44,
    terrainResistance: { hard: 0.85, medium: 1.0, soft: 1.8 },
    pivotStyle: 'neutral',
    // fixed gun (casemate): the sim's virtual turret slews fast — the S-tank
    // aims with the hull, so the "turret" is really the fire-control solution.
    turretTraverseDegS: 34, gunPitchDegS: 24, gunElevationDeg: 12, gunDepressionDeg: 6, gunArcDeg: 4,
    gun: {
      caliberMm: 105, reloadS: 4.0, baseAccuracy: 0.30, aimTimeS: 1.9,
      bloom: BLOOM_MODERN,
      shells: [
        shell('slpprj m/61 APDS', 'APCR', 105, 260, 235, 320, 1463),
        shell('slpgr m/66 HEAT', 'HEAT', 105, 400, 400, 300, 730),
        shell('sgr m/61 HE', 'HE', 105, 50, 50, 420, 730),
      ],
    },
    dims: { hullLengthM: 7.04, overallLengthM: 8.99, widthM: 3.63, heightM: 2.14 },
    armor: communityArmor({
      lenM: 7.04, widM: 3.63, hgtM: 2.14, turretPivot: [0, 1.5, 0.2],
      gunPivot: [0, 0.35, 0.4], barrelLenM: 4.2, barrelRadM: 0.075,
      frontMm: 100, sideMm: 30, rearMm: 25, roofMm: 20,
      tFrontMm: 60, tSideMm: 30, tRearMm: 20, mantletMm: 60, turretless: true,
    }),
    visual: {
      // r9: base pulled off the saturated forest green — the S-tank rendered
      // as the brightest, most toy-like material in the carousel.
      scheme: 'stripes', base: '#47513c', weather: '#525c46',
      patches: ['#2d3427', '#5c5a44'], marking: 'number', number: '103',
      trackWidthM: 0.67, camoScale: 0.5,
    },
  },

  // =========================================================================
  // COMMUNITY WAVE 2 (print-model crawl, integrated 2026-07-28)
  // =========================================================================

  kv2: {
    id: 'kv2', name: 'KV-2', nation: 'USSR', era: 'ww2', role: 'heavy',
    community: {
      author: 'Comrade1280',
      source: 'https://sketchfab.com/3d-models/kv-2-heavy-tank-1940-ba8b84d78c0a42038cf2eaa4210ef296',
      license: 'CC-BY 4.0',
    },
    hp: 1250,
    enginePowerHp: 600, weightTons: 52, topSpeedKmh: 34, reverseSpeedKmh: 7,
    hullTraverseDegS: 20,
    terrainResistance: { hard: 1.20, medium: 1.40, soft: 2.40 },
    pivotStyle: 'pivot',
    // the giant slab turret slews painfully slowly — signature KV-2 feel
    turretTraverseDegS: 10, gunPitchDegS: 10, gunElevationDeg: 12, gunDepressionDeg: 5,
    gun: {
      caliberMm: 152, reloadS: 20.5, baseAccuracy: 0.55, aimTimeS: 3.6,
      bloom: BLOOM_WW2,
      shells: [
        shell('OF-530 HE', 'HE', 152, 92, 92, 900, 508),
        shell('BR-540 APHE', 'AP', 152, 155, 135, 700, 436),
        shell('G-530 semi-AP', 'AP', 152, 130, 114, 760, 436),
      ],
    },
    dims: { hullLengthM: 6.95, overallLengthM: 6.95, widthM: 3.32, heightM: 3.25 },
    armor: communityArmor({
      lenM: 6.95, widM: 3.32, hgtM: 3.25, turretPivot: [0, 1.75, -0.1],
      gunPivot: [0, 0.4, 0.4], barrelLenM: 3.2, barrelRadM: 0.1,
      frontMm: 75, sideMm: 75, rearMm: 60, roofMm: 30,
      tFrontMm: 75, tSideMm: 75, tRearMm: 75, mantletMm: 110,
    }),
    visual: {
      // r2: authored darker under the community paint-path lift (is7 note) —
      // the '#3e4a2e' 4BO rendered as pale flat sage on the pedestal
      scheme: 'solid', base: '#37412a', weather: '#404b33', patches: [],
      marking: 'number', number: '2', trackWidthM: 0.7,
    },
  },

};

Object.assign(TANK_SPECS, FIRST_PARTY_EXPANSION_SPECS);

/** Core + first-party expansion ids — the full selectable garage roster. */
export const ALL_TANK_IDS = [...TANK_IDS, ...FIRST_PARTY_EXPANSION_TANK_IDS];

// Canonical roster projections populated after every registration wave.
// ALL_TANK_IDS intentionally remains the established release/anatomy roster;
// consumers choose the projection matching their responsibility.
export const SAVED_TANK_IDS = Object.keys(TANK_SPECS);
export const DEVELOPMENT_TANK_IDS = SAVED_TANK_IDS.filter(
  (id) => !RETIRED_EXTERNAL_PLACEHOLDER_IDS.has(id),
);
export const PRODUCTION_TANK_IDS = ALL_TANK_IDS.filter((id) => !isProductionHiddenTankId(id));
const visibleTankIds = DEV_FLEET_ACTIVE ? DEVELOPMENT_TANK_IDS : PRODUCTION_TANK_IDS;
const runtimeTankIds = DEV_FLEET_ACTIVE ? DEVELOPMENT_TANK_IDS : ALL_TANK_IDS;

// One catalog registry owns every fleet projection. Role-specific exports
// below are aliases, never snapshots, so registration/finalization and family
// ordering cannot leave the garage, gallery, bots, runtime, or tools stale.
export const TANK_CATALOGS = Object.freeze({
  saved: SAVED_TANK_IDS,
  development: DEVELOPMENT_TANK_IDS,
  release: ALL_TANK_IDS,
  production: PRODUCTION_TANK_IDS,
  bots: PRODUCTION_TANK_IDS,
  visible: visibleTankIds,
  runtime: runtimeTankIds,
});

// Compatibility names preserve the existing public API while sharing the
// exact authoritative catalog arrays above.
export const BOT_TANK_IDS = TANK_CATALOGS.bots;
export const VISIBLE_TANK_IDS = TANK_CATALOGS.visible;
export const RUNTIME_TANK_IDS = TANK_CATALOGS.runtime;

// Generic externally-authored placeholders are useful archaeological/reference
// records, but they are not historical vehicles authored by this project and
// therefore cannot be selectable.  Keep their dormant spec/source notes out of
// ALL_TANK_IDS while retaining the audit trail in this file.
export { RETIRED_EXTERNAL_PLACEHOLDER_IDS };

/**
 * Seal the public roster after all extension packs register their rows.
 *
 * Geometry provenance is enforced separately by tank:native:check.  This
 * removes obsolete UI credit metadata that described retired comparison
 * references rather than the live procedural model, normalizes source-branded
 * display names, and makes generic third-party placeholders unselectable.
 */
export function finalizeFirstPartyRoster(): void {
  for (let i = TANK_IDS.length - 1; i >= 0; i -= 1) {
    const spec = TANK_SPECS[TANK_IDS[i]];
    if (isRetiredHistoricalTank(spec)) TANK_IDS.splice(i, 1);
  }
  for (let i = ALL_TANK_IDS.length - 1; i >= 0; i -= 1) {
    const id = ALL_TANK_IDS[i];
    if (RETIRED_EXTERNAL_PLACEHOLDER_IDS.has(id) || isRetiredHistoricalTank(TANK_SPECS[id])) {
      ALL_TANK_IDS.splice(i, 1);
    }
  }
  const activeRoster = new Set(ALL_TANK_IDS);
  const savedIds = Object.keys(TANK_SPECS);
  const developmentIds = savedIds.filter((id) => !RETIRED_EXTERNAL_PLACEHOLDER_IDS.has(id));
  const productionIds = ALL_TANK_IDS.filter((id) => !isProductionHiddenTankId(id));

  SAVED_TANK_IDS.splice(0, SAVED_TANK_IDS.length, ...savedIds);
  DEVELOPMENT_TANK_IDS.splice(0, DEVELOPMENT_TANK_IDS.length, ...developmentIds);
  PRODUCTION_TANK_IDS.splice(0, PRODUCTION_TANK_IDS.length, ...productionIds);

  const productionSet = new Set(productionIds);
  for (const id of savedIds) {
    const spec = TANK_SPECS[id];
    if (!spec) continue;
    applyVehicleTaxonomy(spec);
    applyFleetLauncherMuzzles(spec);
    delete spec.community;
    delete spec.publicVisualFallback;
    const label = tankLabelRecord(spec);
    spec.name = label.displayName;
    spec.label = label;
    spec.markings = vehicleMarkingRecord(spec);
    spec.authorship = FIRST_PARTY_VEHICLE_AUTHORSHIP;
    const productionVisible = productionSet.has(id);
    spec.roster = Object.freeze({
      productionVisible,
      localVisible: !RETIRED_EXTERNAL_PLACEHOLDER_IDS.has(id),
      developmentOnly: !productionVisible,
      tag: productionVisible
        ? ''
        : RETIRED_EXTERNAL_PLACEHOLDER_IDS.has(id) ? 'REF' : DEV_FLEET_LABEL,
      reason: productionVisible
        ? 'production'
        : developmentOnlyReason(spec, { activeRoster: activeRoster.has(id) }),
    });
  }
}

// Runtime geometry provenance. Registrars add procedural rows for the rest of
// the fleet; native-playables-audit rejects every external runtime source.
export const MODEL_SOURCE: ModelSourceRegistry = {
  m1a2: { source: 'procedural' },
  t90m: { source: 'procedural' },
  t90m_proryv: { source: 'procedural' },
};

// Browser runtime sources are procedural-only. Offline comparison articulation
// metadata lives under tools/ and native-playables-audit rejects regressions.

/**
 * TRACK-HITBOX SCHEMA (combat round 2026-08-06, owner order: "make track
 * hitboxes represented and look much more accurate ... theyre just a bunch
 * of rectangles"). Attach real track-shape volumes to an ArmorModel:
 *
 *   armor.trackShapes = [{
 *     module: 'trackL'|'trackR',       // combat module the prism damages
 *     x0, x1,                          // hull-local lateral slab (x0 < x1)
 *     poly: [[z,y], ...],              // convex CCW side-view silhouette
 *     plate: {name, physicalMm, keMm, ceMm, kind:'external',
 *             era:null, moduleLink, gunFollow:false},  // screen stats
 *   }, ...]
 *
 * Each entry is a convex prism (the polygon extruded across [x0,x1]) that
 * REPLACES, for ray tests only, the legacy hand-authored track pair — the
 * full-length rectangle plate (sR/sL 'track_R'/'track_L') and the trackL/R
 * module AABB. sim/armor.traceTank consumes it (prism entry face = the
 * external track screen with a TRUE surface normal — vertical band side,
 * angled approach/departure ramps, raised end-wheel wraps); the killcam
 * x-ray draws it. The legacy plates/boxes STAY in the model as authored:
 * plates keep feeding the HE nearest-face AABB, boxes keep feeding HE blast
 * targets, killcam shader bands and ghost anatomy — traceTank simply skips
 * them when trackShapes is present, and every armor model WITHOUT
 * trackShapes (headless probes, hand-built selftest models, gearless
 * community placeholders) keeps the legacy path bit-identical.
 *
 * `hulls` comes from the running gear actually built for this spec
 * (buildRunningGear publishes {x0,x1,poly} per unit — wheel positions/radii
 * and band profile truth), so the hitbox follows the real \____/ trapezoid
 * run per tank with zero hand-authoring. Idempotent: recomputes and
 * overwrites on every call. HAND-OVERRIDE HOOK for odd rigs: author
 * `armor.trackShapesOverride = [...]` (same entry shape, minus `plate`
 * which is still auto-wired) on a spec and it wins over the derived hulls.
 *
 * @param {object} armor ArmorModel (mutated in place)
 * @param {Array<{x0:number,x1:number,poly:Array}>} hulls derived per-unit
 *   track hulls, RIGHT-side coordinates (x0>0); mirrored here for the left
 * @returns {object} the same armor object
 */
export function attachTrackShapes<T extends TrackArmorEnvelope>(
  armor: T,
  hulls: readonly TrackHull[],
): T {
  if (!armor) return armor;
  const src = Array.isArray(armor.trackShapesOverride) && armor.trackShapesOverride.length
    ? armor.trackShapesOverride
    : hulls;
  if (!Array.isArray(src) || !src.length) return armor;
  const shapes: TrackShape[] = [];
  for (const hull of src) {
    if (!isUsableTrackHull(hull)) continue;
    for (const side of trackHullSides(hull)) {
      shapes.push(trackShapeForSide(armor, hull, side));
    }
  }
  if (shapes.length) armor.trackShapes = shapes;
  return armor;
}

function isUsableTrackHull(hull: TrackHull | null | undefined): hull is TrackHull {
  return !!hull && Array.isArray(hull.poly) && hull.poly.length >= 3;
}

function trackHullSides(hull: TrackHull): readonly TrackSide[] {
  if (hull.module === 'trackL') return [-1];
  if (hull.module === 'trackR') return [1];
  return [-1, 1];
}

function trackShapeForSide(
  armor: TrackArmorEnvelope,
  hull: TrackHull,
  side: TrackSide,
): TrackShape {
  const module: TrackModule = side < 0 ? 'trackL' : 'trackR';
  const legacy = armor.hullPlates?.find(
    (plate) => plate.moduleLink === module && plate.kind === 'external');
  const lowX = Math.min(Math.abs(hull.x0), Math.abs(hull.x1));
  const highX = Math.max(Math.abs(hull.x0), Math.abs(hull.x1));
  return {
    module,
    x0: side < 0 ? -highX : lowX,
    x1: side < 0 ? -lowX : highX,
    poly: hull.poly.map((point) => [point[0], point[1]]),
    plate: {
      name: legacy?.name ?? (side < 0 ? 'track_L' : 'track_R'),
      physicalMm: legacy?.physicalMm ?? 20,
      keMm: legacy?.keMm ?? 20,
      ceMm: legacy?.ceMm ?? 20,
      kind: 'external',
      era: null,
      moduleLink: module,
      gunFollow: false,
    },
  };
}

/**
 * Fit a (deep-copied) donor armor model to a recipient's published dims
 * (module_hitbox r1). Recovered/derived vehicles copy their donor's spec and
 * patch `dims` — but the armor GEOMETRY (plates, module/crew boxes, pivots)
 * stayed donor-sized, so hit resolution disagreed with the rendered vehicle
 * by up to 1.2 m (m60a1 carried Leopard-1 armor: every shot at its rendered
 * upper hull/turret passed through air). The geometry gate pins every visual
 * to spec.dims, so a per-axis affine fit re-derives the armor envelope from
 * the same measured truth the visual is built to.
 *
 * Scales positions only — plate thickness/ratings (physicalMm/keMm/ceMm) and
 * ERA values are design stats and stay untouched. Slopes change by the axis
 * ratio (second-order next to the envelope error being fixed). MUTATES and
 * returns `armor`; call on a copy, never a shared donor reference.
 *
 * @param {object} armor ArmorModel (deep copy, mutated in place)
 * @param {object} fromDims donor spec.dims
 * @param {object} toDims recipient spec.dims
 * @returns {object} the same armor object, fitted
 */
export function fitArmorToDims<T extends TrackArmorEnvelope>(
  armor: T,
  fromDims: FleetDimensions,
  toDims: FleetDimensions,
): T {
  if (!armor || !fromDims || !toDims) return armor;
  const scale = armorScale(fromDims, toDims);
  if (isIdentityArmorScale(scale)) return armor;
  scaleArmorPlates(armor.hullPlates, scale);
  scaleArmorPlates(armor.turretPlates, scale);
  scaleArmorBoxes(armor.modules, scale);
  scaleArmorBoxes(armor.crew, scale);
  scaleTrackShapes(armor.trackShapes, scale);
  if (armor.turretPivot) scaleArmorPoint(armor.turretPivot, scale);
  if (armor.gunPivot) scaleArmorPoint(armor.gunPivot, scale);
  if (armor.gunBarrel) armor.gunBarrel.lengthM *= scale.z;
  if (armor.boundingRadiusM) armor.boundingRadiusM *= Math.max(scale.x, scale.z);
  return armor;
}

function dimensionRatio(from: number, to: number): number {
  return from > 0 && to > 0 ? to / from : 1;
}

function armorScale(fromDims: FleetDimensions, toDims: FleetDimensions): ArmorScale {
  return {
    x: dimensionRatio(fromDims.widthM, toDims.widthM),
    y: dimensionRatio(fromDims.heightM, toDims.heightM),
    z: dimensionRatio(fromDims.hullLengthM, toDims.hullLengthM),
  };
}

function isIdentityArmorScale(scale: ArmorScale): boolean {
  return Math.abs(scale.x - 1) < 1e-3
    && Math.abs(scale.y - 1) < 1e-3
    && Math.abs(scale.z - 1) < 1e-3;
}

function scaleArmorPoint(point: readonly [number, number, number], scale: ArmorScale): void {
  const mutable = point as MutableVec3Tuple;
  mutable[0] *= scale.x;
  mutable[1] *= scale.y;
  mutable[2] *= scale.z;
}

function scaleArmorPlates(plates: readonly ArmorPlate[] | undefined, scale: ArmorScale): void {
  for (const plate of plates ?? []) {
    for (const vertex of plate.verts) scaleArmorPoint(vertex, scale);
  }
}

function scaleArmorBoxes(boxes: readonly ArmorBox[] | undefined, scale: ArmorScale): void {
  for (const box of boxes ?? []) {
    scaleArmorPoint(box.min, scale);
    scaleArmorPoint(box.max, scale);
  }
}

function scaleTrackShapes(shapes: readonly TrackShape[] | undefined, scale: ArmorScale): void {
  // Derived track prisms scale like every other armor position. Plate stats
  // remain design values, matching the rule applied to hull and turret plates.
  for (const shape of shapes ?? []) {
    shape.x0 *= scale.x;
    shape.x1 *= scale.x;
    for (const point of shape.poly) {
      point[0] *= scale.z;
      point[1] *= scale.y;
    }
  }
}

/**
 * Look up a tank spec by id.
 * @param {string} id one of TANK_IDS
 * @returns {object} TankSpec (ARCHITECTURE §2.2)
 * @throws {Error} on unknown id
 */
export function getSpec(id: string): FleetTankSpec {
  const s = TANK_SPECS[id];
  if (!s) throw new Error(`Unknown tank id: ${id}`);
  return s;
}
