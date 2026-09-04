// Boot-light combat data for three core first-party procedural variants.
// Historical derivative GLBs remain offline comparison inputs only; they
// never enter the runtime registry or replace these specs/builders.

import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.ts';
import {
  shell,
  apfsdsPenetration as apfsdsPens,
  reactivePlate,
  type ArmorEnvelope,
  type ArmorPlate,
} from './specHelpers.ts';
import type { FleetTankSpec } from './specContracts.ts';
import { bindFleetRegistries } from './fleetSpecRegistry.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);

const BLOOM_MODERN = { move: 0.06, hullRot: 0.08, turret: 0.06, afterShot: 2.2 };

/**
 * Deep-clone a base armor model and scale the KE/CE ratings of the fighting
 * plates ('main'/'spaced'/'cast'; external track plates and ERA tiles keep
 * their values). Geometry is reused verbatim — every variant shares its
 * base vehicle's hull/turret envelope, which is exactly why it is a variant.
 */
type ArmorRatingOverride = Partial<Pick<ArmorPlate, 'keMm' | 'ceMm'>>;

function derivedArmor(
  baseArmor: ArmorEnvelope,
  factor: number,
  overrides: Readonly<Record<string, ArmorRatingOverride>> = {},
): ArmorEnvelope {
  const a = structuredClone(baseArmor);
  const scalePlate = (p: ArmorPlate): void => {
    if (p.kind === 'external' || p.kind === 'era') return;
    const o = overrides[p.name];
    if (o) {
      if (o.keMm !== undefined) p.keMm = o.keMm;
      if (o.ceMm !== undefined) p.ceMm = o.ceMm;
      return;
    }
    p.keMm = Math.round(p.keMm * factor);
    p.ceMm = Math.round(p.ceMm * factor);
  };
  a.hullPlates.forEach(scalePlate);
  a.turretPlates.forEach(scalePlate);
  return a;
}

function withoutEra(baseArmor: ArmorEnvelope): ArmorEnvelope {
  const armor = structuredClone(baseArmor);
  armor.hullPlates = armor.hullPlates.filter((plate) => plate.kind !== 'era');
  armor.turretPlates = armor.turretPlates.filter((plate) => plate.kind !== 'era');
  return armor;
}

/** Flat additive bump for side/rear plates (stat-level stand-in for the
 * TUSK ERA/slat kit until per-tile era plates land). */
function bumpPlates(
  armor: ArmorEnvelope,
  nameRe: RegExp,
  dKe: number,
  dCe: number,
): void {
  for (const p of [...armor.hullPlates, ...armor.turretPlates]) {
    if (p.kind === 'external' || p.kind === 'era') continue;
    if (nameRe.test(p.name)) {
      p.keMm += dKe;
      p.ceMm += dCe;
    }
  }
}

const m1a2 = registries.tankSpecs.m1a2;
const t90m = registries.tankSpecs.t90m;
if (!m1a2 || !t90m) throw new Error('Core variant donors must register first');

const VARIANT_TANK_IDS = ['m1a1', 't90a', 'm1a2_tusk'] as const;
type VariantTankId = typeof VARIANT_TANK_IDS[number];

const VARIANT_SPECS = {
  // ---- M1A1 Abrams — roster §2 (priority 2) -------------------------------
  m1a1: {
    id: 'm1a1', name: 'M1A1 Abrams', nation: 'USA', era: 'modern', role: 'mbt',
    // Nation-roster derivative, not a source-model loading relationship.
    variantOf: 'm1a2',
    hp: 2300,
    enginePowerHp: 1500, weightTons: 62.1, topSpeedKmh: 67, reverseSpeedKmh: 25,
    hullTraverseDegS: 44,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 42, gunPitchDegS: 32, gunElevationDeg: 20, gunDepressionDeg: 10,
    gun: {
      caliberMm: 120, reloadS: 6.5, baseAccuracy: 0.32, aimTimeS: 1.9,
      bloom: BLOOM_MODERN,
      shells: [
        shell('M829A1 APFSDS', 'APFSDS', 120, apfsdsPens(620)[0], apfsdsPens(620)[1], 520, 1575, { pen2000Mm: apfsdsPens(620)[2] }),
        shell('M830 HEAT', 'HEAT', 120, 480, 480, 460, 1140),
        shell('M908 HE-OR', 'HE', 120, 55, 55, 580, 1400),
      ],
    },
    dims: { hullLengthM: 7.92, overallLengthM: 9.77, widthM: 3.66, heightM: 2.44 },
    // M1A1HA: same envelope as the SEPv3, pre-SEP composite ratings
    // (roster §2.2: turret ~600/1000, hull ~560/700 -> ~0.86 of SEPv3)
    armor: derivedArmor(withoutEra(m1a2.armor), 0.86),
    visual: {
      scheme: 'nato', base: '#49543c', weather: '#525f45',
      patches: ['#23261f', '#4a3a2c'],
      marking: 'number', number: 'A-11', trackWidthM: 0.635,
      camoScale: 0.5,
    },
  },

  // ---- T-90A — roster §13 (priority 2) ------------------------------------
  t90a: {
    id: 't90a', name: 'T-90A', nation: 'Russia', era: 'modern', role: 'mbt',
    variantOf: 't90m', // see m1a1 note
    hp: 2200,
    enginePowerHp: 1000, weightTons: 46.5, topSpeedKmh: 60, reverseSpeedKmh: 5,
    hullTraverseDegS: 40,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 36, gunPitchDegS: 28, gunElevationDeg: 14, gunDepressionDeg: 6,
    gun: {
      caliberMm: 125, reloadS: 7.0, baseAccuracy: 0.34, aimTimeS: 2.1,
      bloom: BLOOM_MODERN,
      shells: [
        shell('3BM42M Lekalo', 'APFSDS', 125, apfsdsPens(590)[0], apfsdsPens(590)[1], 510, 1700, { pen2000Mm: apfsdsPens(590)[2] }),
        shell('3BK29M HEAT', 'HEAT', 125, 650, 650, 470, 905),
        shell('3OF26 HE-Frag', 'HE', 125, 50, 50, 570, 850),
      ],
    },
    dims: { hullLengthM: 6.86, overallLengthM: 9.53, widthM: 3.78, heightM: 2.23 },
    // T-90M armor layout shared (identical 6.86 m hull); base composite
    // scaled to the A's cast-turret ratings. Kontakt-5 'era' plates ride
    // along from the t90m layout (roster: reuse the glacis two-tile pattern).
    // Proryv's strengthened Relikt/composite package is intentionally not
    // inherited wholesale by the older T-90A. This explicit factor preserves
    // the A's tier-IX protection after the tier-X donor hardening pass.
    armor: (() => {
      const armor = derivedArmor(t90m.armor, 0.80);
      // The T-90A model carries K-5 on the glacis, skirts and frontal turret
      // cheeks. Proryv's turret-flank Relikt plates are not present here.
      armor.turretPlates = armor.turretPlates.filter(
        (plate) => plate.kind !== 'era' || !/side/i.test(plate.name),
      );
      for (const plate of [...armor.hullPlates, ...armor.turretPlates]) {
        if (plate.kind === 'era') plate.era = { keReduction: 0.20, ceFlatMm: 400 };
      }
      return armor;
    })(),
    visual: {
      // Russian dark forest green solid, matching the shipped t90m factory
      scheme: 'solid', base: '#3f5138', weather: '#4a5c42', patches: [],
      marking: 'number', number: '112', trackWidthM: 0.58,
    },
  },

  // ---- M1A2 Abrams TUSK — roster §3 (priority 3) --------------------------
  m1a2_tusk: {
    id: 'm1a2_tusk', name: 'M1A2 Abrams TUSK', nation: 'USA', era: 'modern', role: 'mbt',
    variantOf: 'm1a2', // see m1a1 note
    hp: 2650,
    enginePowerHp: 1500, weightTons: 69.5, topSpeedKmh: 64, reverseSpeedKmh: 25,
    hullTraverseDegS: 42,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 38, gunPitchDegS: 32, gunElevationDeg: 20, gunDepressionDeg: 10,
    gun: {
      // identical M256 loadout to m1a2 (roster §3.3)
      caliberMm: 120, reloadS: 6.0, baseAccuracy: 0.30, aimTimeS: 1.8,
      bloom: BLOOM_MODERN,
      shells: [
        shell('M829A4 APFSDS', 'APFSDS', 120, apfsdsPens(750)[0], apfsdsPens(750)[1], 540, 1670, { pen2000Mm: apfsdsPens(750)[2] }),
        shell('M830A1 MPAT', 'HEAT', 120, 600, 600, 480, 1400),
        shell('M1147 AMP', 'HE', 120, 60, 60, 600, 1000),
      ],
    },
    // §5.73-1 P95 datum: mandatory CROWS plus its physically seated ghillie
    // cover measures 3.29 m on the authoritative 1024 mask.
    dims: { hullLengthM: 7.93, overallLengthM: 9.77, widthM: 3.66, heightM: 3.29 },
    armor: (() => {
      const a = derivedArmor(withoutEra(m1a2.armor), 1.0);
      // ARAT rows are single-use reactive zones, not permanent base-armor
      // inflation. Their seed quads are fitted to the visible cassettes by
      // the combat-anatomy generator.
      a.hullPlates.push(
        reactivePlate('m1a2_tusk_skirt_era_R', 'right'),
        reactivePlate('m1a2_tusk_skirt_era_L', 'left'),
      );
      a.turretPlates.push(
        reactivePlate('m1a2_tusk_turret_era_R', 'right'),
        reactivePlate('m1a2_tusk_turret_era_L', 'left'),
      );
      // Rear slat armor remains passive stand-off protection.
      bumpPlates(a, /rear/i, 0, 250);
      return a;
    })(),
    visual: {
      // tank_models r2 (critic: ARAT tiles/muzzle painted a clashing tan over
      // the woodland hull): the GLB's baked-texture composite is keyed by
      // NATION pattern tile (USA woodland), while every untextured kit part
      // (ARAT rows, loader shield, muzzle furniture) wears THIS visual's
      // shared canvas — the roster §3.4 solid desert tan made the kit read
      // as beige toy parts glued on a green tank. The TUSK now ships the
      // m1a2 family woodland so hull and kit read as one paint job; the tan
      // urban-Iraq fit stays available via the 'desert' picker pattern.
      scheme: 'nato', base: '#49543c', weather: '#525f45',
      patches: ['#23261f', '#4a3a2c'],
      marking: 'number', number: 'T-2', trackWidthM: 0.635,
      camoScale: 0.5,
    },
  },
} satisfies Readonly<Record<VariantTankId, FleetTankSpec>>;

// ---------------------------------------------------------------------------
// Registration side effect: fold the variants into the shared roster tables.
// Guarded so a double import (or a concurrent registrar) can't duplicate ids.
// ---------------------------------------------------------------------------
for (const id of VARIANT_TANK_IDS) {
  registries.tankSpecs[id] ||= VARIANT_SPECS[id];
  registries.modelSources[id] ||= { source: 'procedural' };
  if (!registries.allTankIds.includes(id)) registries.allTankIds.push(id);
}

export { VARIANT_TANK_IDS, VARIANT_SPECS };
