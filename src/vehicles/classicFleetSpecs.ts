// Additional first-party classic tank and assault-gun combat rows. Visual
// geometry remains in the demand-loaded procedural family builders.
import { TANK_SPECS, ALL_TANK_IDS, fitArmorToDims } from './specs.js';
import {
  rightCheekPlate as chR,
  leftCheekPlate as chL,
  rightSidePlate as sR,
  leftSidePlate as sL,
  type ArmorEnvelope,
} from './specHelpers.ts';
import type {
  FleetDimensions,
  FleetGunSpec,
  FleetTankSpec,
  FleetVisualSpec,
} from './specContracts.ts';

type VariantPatch = Omit<Partial<FleetTankSpec>, 'armor' | 'dims' | 'gun' | 'visual'> & {
  armor?: ArmorEnvelope & Partial<Record<'barrelLenM' | 'tHalfW' | 'tFrontZ' | 'tRearZ', number>>;
  dims?: Partial<FleetDimensions>;
  gun?: Partial<FleetGunSpec>;
  visual?: Partial<FleetVisualSpec>;
};

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const tankSpecs: typeof TANK_SPECS & Record<string, unknown> = TANK_SPECS;

function isFleetSpecRecord(value: unknown): value is FleetTankSpec {
  return value !== null && typeof value === 'object';
}

function requireFleetSpec(id: string): FleetTankSpec {
  const spec = tankSpecs[id];
  if (!isFleetSpecRecord(spec)) throw new Error(`Classic fleet donor missing or incomplete: ${id}`);
  return spec;
}

function make(
  baseId: string,
  id: string,
  name: string,
  nation: string,
  patch: VariantPatch = {},
): FleetTankSpec {
  const s = copy(requireFleetSpec(baseId));
  s.id = id; s.name = name; s.nation = nation; s.variantOf = baseId;
  s.publicVisualFallback = baseId;
  delete s.community;
  const gun = s.gun, dims = s.dims, visual = s.visual;
  Object.assign(s, patch);
  if (patch.gun) s.gun = { ...gun, ...patch.gun };
  if (patch.dims) s.dims = { ...dims, ...patch.dims };
  if (patch.visual) s.visual = { ...visual, ...patch.visual };
  // A patched armor arrives as a top-level spread over a DONOR's armor — its
  // plate/box arrays are shared references. Deep-copy before the dims fit
  // below may mutate them (charioteer would otherwise rescale the Jagdtiger).
  if (patch.armor) s.armor = copy(patch.armor);
  // MODULE HITBOXES (module_hitbox r1): visuals render at spec.dims (geometry
  // gate) while copied armor stayed donor-sized — refit the copy so hit
  // resolution agrees with the rendered vehicle (see specs.fitArmorToDims).
  if (patch.dims) fitArmorToDims(s.armor, dims, s.dims);
  return s;
}

function m60a3Armor(): ArmorEnvelope {
  const armor = copy(requireFleetSpec('m60a1').armor);
  // First-generation Blazer-style protection: a meaningful shaped-charge
  // defeat layer with only a modest kinetic effect.  The broad records are
  // sector hit surfaces; each name maps to a dense visual cassette cluster
  // in profiles/patton.js and is independently consumed after detonation.
  const blazer = { keReduction: 0.08, ceFlatMm: 300 };
  const era = { kind: 'era', era: blazer, keMm: 18, ceMm: 18 };
  armor.turretPlates = [
    chL('m60a3_turret_era_front_L', 18,
      0.34, 1.86, 1.43, 0.02, 0.14, 0.90, 0.12, 0, era),
    chR('m60a3_turret_era_front_R', 18,
      0.34, 1.86, 1.43, 0.02, 0.14, 0.90, 0.12, 0, era),
    sL('m60a3_turret_era_side_L', 18,
      1.42, 0.14, 1.36, 0.90, -1.58, 0.12, era),
    sR('m60a3_turret_era_side_R', 18,
      1.42, 0.14, 1.36, 0.90, -1.58, 0.12, era),
    ...armor.turretPlates,
  ];
  return armor;
}

const SPECS: FleetTankSpec[] = [
  make('is3', 'is3_bergman', 'IS-3 (Bergman)', 'USSR', { visual: { number: '703' } }),
  make('sturmtiger', 'isu152', 'ISU-152', 'USSR',
    { hp: 1450, weightTons: 47.3, topSpeedKmh: 37, reverseSpeedKmh: 14, gun: { caliberMm: 152, reloadS: 15.5 },
      dims: { hullLengthM: 6.77, overallLengthM: 9.05, widthM: 3.07, heightM: 2.48 } }),
  make('jagdtiger', 'isu122s', 'ISU-122S', 'USSR',
    { hp: 1400, weightTons: 46, topSpeedKmh: 37, reverseSpeedKmh: 14, gun: { caliberMm: 122, reloadS: 9.5 },
      dims: { hullLengthM: 6.77, overallLengthM: 9.85, widthM: 3.07, heightM: 2.48 } }),
  make('chieftain_mk10', 'centurion3', 'Centurion Mk.3', 'UK',
    { hp: 1500, weightTons: 51, topSpeedKmh: 35, gun: { caliberMm: 84, reloadS: 7.0 },
      dims: { hullLengthM: 7.56, overallLengthM: 9.83, widthM: 3.38, heightM: 2.94 } }),
  make('chieftain_mk10', 'centurion5', 'Centurion Mk.5/2', 'UK',
    { hp: 1650, weightTons: 52, topSpeedKmh: 35, gun: { caliberMm: 105, reloadS: 7.4 },
      dims: { hullLengthM: 7.56, overallLengthM: 9.83, widthM: 3.38, heightM: 2.94 } }),
  make('panther_g', 'comet', 'A34 Comet', 'UK',
    { hp: 1150, weightTons: 33.5, topSpeedKmh: 51, gun: { caliberMm: 77, reloadS: 5.2 },
      dims: { hullLengthM: 6.55, overallLengthM: 7.66, widthM: 3.05, heightM: 2.68 } }),
  make('panther_g', 'challenger_cruiser', 'A30 Challenger', 'UK',
    { hp: 1050, weightTons: 33, topSpeedKmh: 52, gun: { caliberMm: 76.2, reloadS: 5.8 },
      dims: { hullLengthM: 8.03, overallLengthM: 8.15, widthM: 2.91, heightM: 2.77 } }),
  make('jagdtiger', 'charioteer', 'FV4101 Charioteer', 'UK',
    {
      hp: 1250, weightTons: 30, topSpeedKmh: 56,
      gun: { caliberMm: 84, reloadS: 7.0 },
      // Gameplay ancestry supplies balance defaults only; the Charioteer has
      // a rotating turret and must not inherit the Jagdtiger's casemate flag.
      armor: { ...requireFleetSpec('jagdtiger').armor, turretless: false },
      dims: { hullLengthM: 6.55, overallLengthM: 9.20, widthM: 3.05, heightM: 2.58 },
    }),
  make('leo2a4', 'leopard2_proto', 'Leopard 2 Prototype', 'Germany',
    {
      hp: 2050, weightTons: 55, topSpeedKmh: 68, gun: { reloadS: 6.8 },
      dims: { hullLengthM: 7.72, overallLengthM: 10.67, widthM: 3.70, heightM: 2.48 },
      // The prototype now owns its elongated visual rig instead of silently
      // inheriting the production A4 pivot and bustle envelope.
      armor: {
        ...requireFleetSpec('leo2a4').armor,
        turretPivot: [0, 1.72, 0.55], gunPivot: [0, 0.26, 1.00],
        barrelLenM: 5.26, tHalfW: 1.22, tFrontZ: 1.18, tRearZ: -2.75,
      },
    }),
  // m1a1_aim REMOVED BY OWNER 2026-08-06 ('also remove the AIM abrams') —
  // builder code dormant in abrams.js; packet historical.
  make('m60a1', 'm46_patton', 'M46 Patton', 'USA',
    { hp: 1450, weightTons: 44, topSpeedKmh: 48, gun: { caliberMm: 90, reloadS: 7.0 },
      dims: { hullLengthM: 6.33, overallLengthM: 8.48, widthM: 3.51, heightM: 3.18 },
      // bakeDirt deck equalizer (f243966): the Bergman refs paint from the
      // shared canvas with NO deck penalty — knob-on is ref-parity for this
      // print class (m47-top census gap 1029 -> 401 measured).
      visual: { bakeDirtDeckEq: true } }),
  make('m60a1', 'm47_patton', 'M47 Patton', 'USA',
    { hp: 1550, weightTons: 46, topSpeedKmh: 48, gun: { caliberMm: 90, reloadS: 6.8 },
      dims: { hullLengthM: 6.33, overallLengthM: 8.51, widthM: 3.51, heightM: 3.35 },
      visual: { bakeDirtDeckEq: true } }),
  make('m4a3e8', 'm26_pershing', 'M26 Pershing', 'USA',
    { hp: 1450, weightTons: 41.9, topSpeedKmh: 40, gun: { caliberMm: 90, reloadS: 7.5 },
      // heightM uses the over-mounted-M2 convention (matching the m46/m47
      // rows): published 2.78 is the no-MG datum, but the gate measures the
      // build's roof INCLUDING the pintle M2 (~14 body columns) — batch-8
      // packet proves no build satisfies both 2.78 and turretCurves >= 90.
      // 3.08 = extract bodyTopM 3.078 (m26 r2 re-derivation, 166 columns
      // above 3.0 are real mounted-M2 print geometry; lands with batch-42).
      dims: { hullLengthM: 6.33, overallLengthM: 8.65, widthM: 3.51, heightM: 3.08 } }),
  make('m4a3e8', 'm45_patton', 'M45 Patton', 'USA',
    { hp: 1500, weightTons: 42, topSpeedKmh: 40, gun: { caliberMm: 105, reloadS: 9.0 },
      // stub 105mm howitzer barely clears the bow; the seated oracle's muzzle
      // reads ~6.6 overall (batch-8 packet), not the earlier 6.4 estimate.
      // heightM: over-mounted-M2 convention, same ruling as m26 above.
      dims: { hullLengthM: 6.33, overallLengthM: 6.6, widthM: 3.51, heightM: 3.0 } }),
  make('m60a1', 'm60a3', 'M60A3', 'USA',
    { hp: 2200, weightTons: 52.6, topSpeedKmh: 50,
      hullTraverseDegS: 42, turretTraverseDegS: 40,
      gun: {
        reloadS: 6.4, baseAccuracy: 0.28, aimTimeS: 1.6,
        shells: requireFleetSpec('m60a1').gun.shells.map((round, index) => ({
          ...round,
          ...(index === 0 ? { pen100Mm: 610, pen1000Mm: 570, pen2000Mm: 520, dmg: 450 }
            : index === 1 ? { pen100Mm: 560, pen1000Mm: 560, dmg: 450 }
              : { dmg: 530 }),
        })),
      },
      armor: m60a3Armor(),
      dims: { hullLengthM: 6.946, overallLengthM: 9.436, widthM: 3.631, heightM: 3.27 } }),
];

// Register only first-party procedural gameplay rows. Historical source assets
// remain offline comparison inputs and have no runtime registration path.
for (const spec of SPECS) {
  tankSpecs[spec.id] ||= spec;
  if (!ALL_TANK_IDS.includes(spec.id)) ALL_TANK_IDS.push(spec.id);
}

export const CLASSIC_FLEET_TANK_IDS = SPECS.map((spec) => spec.id);

// Chain-load the following supplemental rows for every fleet facade.
import './supplementalFleetSpecs.ts';
