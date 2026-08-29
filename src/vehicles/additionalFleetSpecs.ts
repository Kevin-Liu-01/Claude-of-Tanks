// Additional first-party Cold-War and modern combat rows. Each variant clones
// the nearest researched donor and applies explicit identity/balance changes;
// visual geometry remains in the demand-loaded procedural family builders.
import { TANK_SPECS, ALL_TANK_IDS, fitArmorToDims } from './specs.ts';
import { shell, type ArmorEnvelope } from './specHelpers.ts';
import type {
  FleetDimensions,
  FleetGunSpec,
  FleetTankSpec,
  FleetVisualSpec,
} from './specContracts.ts';

type VariantPatch = Omit<Partial<FleetTankSpec>, 'armor' | 'dims' | 'gun' | 'visual'> & {
  armor?: ArmorEnvelope;
  dims?: Partial<FleetDimensions>;
  gun?: Partial<FleetGunSpec>;
  visual?: Partial<FleetVisualSpec>;
};

interface MerkavaGunOptions {
  readonly reloadS: number;
  readonly accuracy: number;
  readonly aimTimeS: number;
  readonly kinetic: readonly [number, number, number, number, number];
  readonly heat: readonly [number, number];
  readonly heDamage: number;
  readonly moduleDmg: number;
  readonly bloom: Partial<FleetGunSpec['bloom']>;
}

interface MerkavaArmorOptions {
  readonly glacis: readonly [number, number];
  readonly lower: readonly [number, number];
  readonly wedge: readonly [number, number];
  readonly notch: readonly [number, number];
  readonly side: readonly [number, number];
}

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const tankSpecs: typeof TANK_SPECS & Record<string, unknown> = TANK_SPECS;

function isFleetSpecRecord(value: unknown): value is FleetTankSpec {
  return value !== null && typeof value === 'object';
}

function requireFleetSpec(id: string): FleetTankSpec {
  const spec = tankSpecs[id];
  if (!isFleetSpecRecord(spec)) throw new Error(`Fleet donor missing or incomplete: ${id}`);
  return spec;
}

function make(
  baseId: string,
  id: string,
  name: string,
  nation: string,
  patch: VariantPatch = {},
): FleetTankSpec {
  const donor = requireFleetSpec(baseId);
  const spec = copy(donor);
  spec.id = id;
  spec.name = name;
  spec.nation = nation;
  spec.variantOf = baseId;
  spec.publicVisualFallback = baseId;
  delete spec.community;
  const baseGun = spec.gun;
  const baseDims = spec.dims;
  const baseVisual = spec.visual;
  Object.assign(spec, patch);
  if (patch.gun) spec.gun = { ...baseGun, ...patch.gun };
  if (patch.dims) spec.dims = { ...baseDims, ...patch.dims };
  if (patch.visual) spec.visual = { ...baseVisual, ...patch.visual };
  // MODULE HITBOXES (module_hitbox r1): the visual renders at spec.dims (the
  // geometry gate enforces it) while the copied armor stayed donor-sized —
  // e.g. m60a1 carried Leopard-1-sized armor 1.2 m shorter than its render,
  // so shots at the rendered turret resolved as air. Refit the copy.
  if (patch.dims) fitArmorToDims(spec.armor, baseDims, spec.dims);
  return spec;
}

function merkavaGun({
  reloadS, accuracy, aimTimeS, kinetic, heat, heDamage, moduleDmg, bloom,
}: MerkavaGunOptions): FleetGunSpec {
  const gun = copy(requireFleetSpec('merkava4').gun);
  gun.reloadS = reloadS;
  gun.baseAccuracy = accuracy;
  gun.aimTimeS = aimTimeS;
  gun.bloom = { ...gun.bloom, ...bloom };
  Object.assign(gun.shells[0], {
    pen100Mm: kinetic[0], pen1000Mm: kinetic[1], pen2000Mm: kinetic[2],
    dmg: kinetic[3], velocityMps: kinetic[4], moduleDmg,
  });
  Object.assign(gun.shells[1], {
    pen100Mm: heat[0], pen1000Mm: heat[0], dmg: heat[1], moduleDmg,
  });
  Object.assign(gun.shells[2], { dmg: heDamage, moduleDmg });
  return gun;
}

function merkavaArmor({ glacis, lower, wedge, notch, side }: MerkavaArmorOptions): ArmorEnvelope {
  const armor = copy(requireFleetSpec('merkava4').armor);
  const ratings: Partial<Record<string, readonly [number, number]>> = {
    upper_glacis: glacis,
    lower_front: lower,
    turret_wedge_R: wedge,
    turret_wedge_L: wedge,
    gun_notch: notch,
    turret_side_R: side,
    turret_side_L: side,
  };
  for (const plate of [...armor.hullPlates, ...armor.turretPlates]) {
    const rating = ratings[plate.name];
    if (!rating) continue;
    [plate.keMm, plate.ceMm] = rating;
  }
  return armor;
}

const SPECS: FleetTankSpec[] = [
  make('challenger2', 'challenger1', 'Challenger 1 Mk.3', 'UK',
    { hp: 2100, weightTons: 62, topSpeedKmh: 56, gun: { reloadS: 7.2 },
      dims: { hullLengthM: 8.32, overallLengthM: 11.5, widthM: 3.52, heightM: 2.95 } }),
  make('chieftain_mk10', 'chieftain5', 'Chieftain Mk.5', 'UK',
    { hp: 1850, topSpeedKmh: 48, gun: { reloadS: 7.8 },
      visual: { trackWidthM: 0.656 },
      dims: { hullLengthM: 7.52, overallLengthM: 10.79, widthM: 3.50, heightM: 2.90 } }),
  // Warrior gun rebuild (AFV support round): the cloned Bradley loadout left
  // 25 mm ammo + a TOW rail on a vehicle that mounts neither — and the old
  // gun-level 0.45 s reload applied to that inherited TOW (900 dmg HEAT at
  // 2 rps). Real 30 mm RARDEN belts, per-shell reloads, no missile.
  make('m2a2_bradley', 'fv510', 'FV510 Warrior', 'UK',
    { hp: 1400, weightTons: 25.4, topSpeedKmh: 75, hullTraverseDegS: 45,
      gun: {
        caliberMm: 30, reloadS: 0.75, soundProfile: 'rarden-l21a1',
        shells: [
          { name: 'L14A2 APDS-T', type: 'APFSDS', caliberMm: 30, pen100Mm: 96, pen1000Mm: 86,
            dmg: 90, velocityMps: 1175, moduleDmg: 30, tracer: 'APFSDS',
            pen2000Mm: 76, reloadS: 0.75, count: 130 },
          { name: 'L13A1 HE-T', type: 'HE', caliberMm: 30, pen100Mm: 8, pen1000Mm: 8,
            dmg: 82, velocityMps: 1070, moduleDmg: 30, tracer: 'HE',
            pen2000Mm: 8, reloadS: 0.75, count: 120 },
        ],
      },
      dims: { hullLengthM: 6.34, overallLengthM: 6.34, widthM: 3.03, heightM: 2.80 } }),
  make('leo2a7', 'leo2_revolution', 'Leopard 2 Revolution', 'Germany',
    { hp: 2550, weightTons: 60, topSpeedKmh: 70,
      dims: { hullLengthM: 7.72, overallLengthM: 9.97, widthM: 4.00, heightM: 2.64 } }),
  make('leo2a6', 'leo2a5', 'Leopard 2A5', 'Germany',
    { hp: 2350, weightTons: 59.5, gun: { reloadS: 6.4 },
      dims: { hullLengthM: 7.72, overallLengthM: 9.97, widthM: 3.75, heightM: 2.64 },
      // bakeDirt deck equalizer (f243966; r10 A/B: deck med -> 56.6 toward
      // ref 59.9, deck sub45 -507, hero-rr -307, gear/rear/glacis identical;
      // caution logged: deck over92 72 -> 154 vs ref 29 — critic adjudicates).
      visual: { bakeDirtDeckEq: true } }),
  make('leo2a7', 'leo2a7v', 'Leopard 2A7V', 'Germany',
    { hp: 2650, weightTons: 66.5, topSpeedKmh: 63,
      // 2.87 m remains the published configured-vehicle envelope.  Geometry
      // validation uses the authored broad-body P95 (2.50 m) rather than
      // pretending the narrow PERI/antenna equipment peak fills the roof.
      // The retained reference measures its broad welded roof around 2.44 m;
      // this target therefore remains source-close without copying its mesh.
      dims: { hullLengthM: 7.72, overallLengthM: 10.97, widthM: 4.00,
        heightM: 2.87, silhouetteHeightM: 2.50 } }),
  make('m1a1', 'm1a1ha', 'M1A1HA Abrams', 'USA',
    { hp: 2350, weightTons: 62, gun: { reloadS: 6.3 },
      // §5.73-1 P95 datum: the owner-mandatory full-vehicle ghillie now
      // includes the shielded commander's weapon. Its broad, physically
      // seated cover measures a 2.80 m combat envelope; 2.44 m remains the
      // bare turret datum and is no longer honest for this configured mark.
      dims: { heightM: 2.80 } }),
  make('m1a2', 'm1a2_sepv2', 'M1A2 Abrams SEPv2', 'USA',
    { hp: 2600, weightTons: 66.8, gun: { reloadS: 6.0 },
      // §5.73-1 P95 datum: elevated armored CROWS plus its seated ghillie
      // cover measures 3.44 m on the authoritative mask.
      dims: { heightM: 3.44 } }),
  // m1a2_sepv3 (§5.07 owner order 2026-08-07): M1A2 SEPv3 — redesignated
  // M1A2C in Sept 2018; first shown AUSA Oct 2015. PURE PROCEDURAL variant
  // on the m1a2 family rig (ABRAMS_PROFILES m1a2_sepv3) — NO recovered GLB
  // ships or registers for this id (the local m1a2_sepv3_dannzjs.glb is a
  // measurement-influence source only: its print is the adjudicated
  // mislabeled-Leopard/odd-dims asset, see docs/references/tanks/m1a2.md;
  // footprint stays 7.93/9.77/3.66; §5.73-1 now derives height from the
  // mandatory-kit P95 envelope (3.18 below). community: null — original
  // build, nothing recovered to credit.
  make('m1a2', 'm1a2_sepv3', 'M1A2 SEPv3', 'USA',
    { hp: 2700, weightTons: 67.5, gun: { reloadS: 5.8 },
      // FALSE-0 four-box + temporary 1024 datum replica: the wide/low CROWS
      // plus mandatory ghillie cover measures a 3.18 m P95 envelope.
      dims: { heightM: 3.18 }, community: null, visual: { number: '34' } }),
  // DUAL-GATE GRADUATE (2026-07-31, commit 0f5cd55): m60a1's procedural build
  // passed geometry min 90.7 + shaded parity min 9/10 — the recovered GLB is
  // retired and the procedural model ships EVERYWHERE (local + public), so no
  // publicVisualFallback: its own regenerated icons are legal to distribute.
  make('leo1a5', 'm60a1', 'M60A1 Patton', 'USA',
    { hp: 2050, weightTons: 49.7, topSpeedKmh: 50, reverseSpeedKmh: 16,
      gun: {
        reloadS: 6.8, baseAccuracy: 0.30, aimTimeS: 1.8,
        shells: requireFleetSpec('leo1a5').gun.shells.map((round, index) => ({
          ...round,
          ...(index === 0
            ? { pen100Mm: 570, pen1000Mm: 530, pen2000Mm: 480, dmg: 440 }
            : index === 1
              ? { pen100Mm: 540, pen1000Mm: 540, dmg: 440 }
              : { dmg: 520 }),
        })),
      },
      publicVisualFallback: null, community: null,
      dims: { hullLengthM: 6.946, overallLengthM: 9.436, widthM: 3.631, heightM: 3.27 } }),
  make('t72b3', 'pt91m', 'PT-91M Pendekar', 'Poland',
    { hp: 2050, weightTons: 48.5, topSpeedKmh: 70, reverseSpeedKmh: 20,
      visual: {
        scheme: 'stripes', base: '#394b3c', weather: '#53604a',
        patches: ['#202820', '#4a3b30', '#70634a'], camoScale: 0.42,
        marking: 'number', number: '312', trackWidthM: 0.50,
      },
      dims: { hullLengthM: 6.86, overallLengthM: 9.53, widthM: 3.59, heightM: 2.19 } }),
  make('merkava4', 'merkava1b', 'Merkava Mk.1B', 'Israel',
    { hp: 1900, weightTons: 60, topSpeedKmh: 46, gun: { reloadS: 7.8 },
      dims: { hullLengthM: 7.45, overallLengthM: 8.63, widthM: 3.70, heightM: 2.65 } }),
  make('merkava4', 'merkava2b', 'Merkava Mk.2B', 'Israel',
    { hp: 2200, enginePowerHp: 1000, weightTons: 63,
      topSpeedKmh: 46, reverseSpeedKmh: 18, hullTraverseDegS: 32,
      turretTraverseDegS: 32, gunPitchDegS: 26, gunDepressionDeg: 8,
      terrainResistance: { hard: 0.85, medium: 0.95, soft: 1.75 },
      gun: merkavaGun({
        reloadS: 6.9, accuracy: 0.31, aimTimeS: 1.9,
        kinetic: [794, 722, 650, 525, 1680], heat: [600, 485],
        heDamage: 600, moduleDmg: 120,
        bloom: { move: 0.075, hullRot: 0.095, turret: 0.075, afterShot: 2.35 },
      }),
      armor: merkavaArmor({
        glacis: [500, 750], lower: [250, 350], wedge: [650, 1000],
        notch: [380, 450], side: [350, 500],
      }),
      dims: { hullLengthM: 7.45, overallLengthM: 8.78, widthM: 3.70, heightM: 2.65 } }),
  make('merkava4', 'merkava2d', 'Merkava Mk.2D', 'Israel',
    { hp: 2150, weightTons: 65, topSpeedKmh: 50, gun: { reloadS: 7.2 },
      dims: { hullLengthM: 7.45, overallLengthM: 8.78, widthM: 3.70, heightM: 2.65 } }),
  // merkava3b REMOVED BY OWNER 2026-08-06 ('remove merkava mk 3b') —
  // builder code stays dormant in merkava.js; packet is historical.
  make('merkava4', 'merkava3c', 'Merkava Mk.3C', 'Israel',
    { hp: 2450, enginePowerHp: 1200, weightTons: 65,
      topSpeedKmh: 60, reverseSpeedKmh: 20, hullTraverseDegS: 36,
      turretTraverseDegS: 36, gunPitchDegS: 28, gunDepressionDeg: 8,
      terrainResistance: { hard: 0.78, medium: 0.88, soft: 1.60 },
      gun: merkavaGun({
        reloadS: 6.2, accuracy: 0.29, aimTimeS: 1.7,
        kinetic: [830, 755, 680, 540, 1685], heat: [620, 500],
        heDamage: 610, moduleDmg: 125,
        bloom: { move: 0.06, hullRot: 0.08, turret: 0.055, afterShot: 2.15 },
      }),
      armor: merkavaArmor({
        glacis: [540, 800], lower: [270, 380], wedge: [700, 1080],
        notch: [400, 480], side: [360, 520],
      }),
      dims: { hullLengthM: 7.60, overallLengthM: 9.04, widthM: 3.72, heightM: 2.66 } }),
  make('merkava4', 'merkava3d', 'Merkava Mk.3D', 'Israel',
    { hp: 2700, enginePowerHp: 1200, weightTons: 65,
      topSpeedKmh: 60, reverseSpeedKmh: 20, hullTraverseDegS: 38,
      turretTraverseDegS: 38, gunPitchDegS: 30, gunDepressionDeg: 8,
      terrainResistance: { hard: 0.75, medium: 0.85, soft: 1.50 },
      gun: merkavaGun({
        reloadS: 5.9, accuracy: 0.28, aimTimeS: 1.6,
        kinetic: [891, 810, 730, 560, 1710], heat: [650, 520],
        heDamage: 630, moduleDmg: 130,
        bloom: { move: 0.055, hullRot: 0.075, turret: 0.05, afterShot: 2.10 },
      }),
      armor: merkavaArmor({
        glacis: [600, 900], lower: [300, 430], wedge: [780, 1180],
        notch: [440, 530], side: [400, 580],
      }),
      dims: { hullLengthM: 7.60, overallLengthM: 9.04, widthM: 3.72, heightM: 2.66 } }),
  // Restored from the owner's dedicated Mk.4B source archive.  This is the
  // early/non-Trophy 4B fit and uses its own dormant bespoke profile rather
  // than inheriting the Mk.4M/Windbreaker furniture.
  make('merkava4', 'merkava4b', 'Merkava Mk.4B', 'Israel',
    { hp: 2800, enginePowerHp: 1500, weightTons: 65,
      topSpeedKmh: 64, reverseSpeedKmh: 25, hullTraverseDegS: 40,
      turretTraverseDegS: 40, gunPitchDegS: 32, gunDepressionDeg: 8,
      terrainResistance: { hard: 0.68, medium: 0.78, soft: 1.40 },
      gun: merkavaGun({
        reloadS: 5.6, accuracy: 0.27, aimTimeS: 1.5,
        kinetic: [916, 833, 750, 550, 1730], heat: [680, 510],
        heDamage: 620, moduleDmg: 130,
        bloom: { move: 0.05, hullRot: 0.07, turret: 0.045, afterShot: 2.00 },
      }),
      armor: merkavaArmor({
        glacis: [650, 950], lower: [330, 470], wedge: [850, 1280],
        notch: [480, 580], side: [450, 650],
      }),
      publicVisualFallback: null, community: null,
      dims: { hullLengthM: 7.60, overallLengthM: 9.04, widthM: 3.72, heightM: 2.66 } }),
  make('leo1a5', 't62mv1', 'T-62 obr. 1975', 'USSR/Russia',
    { hp: 1650, weightTons: 38, topSpeedKmh: 50, reverseSpeedKmh: 8, gun: { reloadS: 8.2 },
      dims: {
        // widthM 3.30 -> 3.63 (§5.304 OWNER ORDER 2026-08-17, verbatim:
        // "update our t62 obr 1975 10% wider ..."): owner-decreed spec
        // change landed WITH the build widen (profiles/russia.ts
        // buildT62MV1 — every lateral station ×1.10). The offline obr-1975
        // oracle print now reads ~9.1% narrow vs this row by decree —
        // adjudicated FALSE-class divergence (never chase the print back).
        hullLengthM: 6.63, overallLengthM: 9.34, widthM: 3.63, heightM: 2.40,
        // The supplied Obr. 1975 art source includes its full fender/drum
        // envelope and DShK-height convention.  Preserve published vehicle
        // dimensions for gameplay/UI while the geometry gate compares the
        // actual registered source silhouette measured from that file.
        silhouetteHullLengthM: 7.06,
        silhouetteOverallLengthM: 9.96,
        silhouetteHeightM: 2.74,
      } }),
  make('t72b3', 't64bv1', 'T-64BV1', 'USSR/Russia',
    { hp: 1850, weightTons: 42.4, topSpeedKmh: 60, reverseSpeedKmh: 12, gun: { reloadS: 7.4 },
      dims: {
        hullLengthM: 6.54, overallLengthM: 9.23, widthM: 3.42, heightM: 2.17,
        // Owner-supplied 42manako T-64BV1 source silhouette after the
        // fleet-standard width normalization. Published dimensions remain
        // gameplay/UI truth; these fields keep the fidelity gate honest to
        // the actual visual reference without importing its geometry.
        silhouetteHullLengthM: 5.98,
        silhouetteOverallLengthM: 8.61,
        silhouetteHeightM: 2.28,
      } }),
  make('t72b3', 't72b_1987', 'T-72B obr. 1987', 'USSR/Russia',
    { hp: 1950, weightTons: 44.5, topSpeedKmh: 60, reverseSpeedKmh: 12, gun: { reloadS: 7.2 } }),
  make('t72b3', 't72b3m', 'T-72B3M obr. 2022', 'Russia',
    { hp: 2250, enginePowerHp: 1130, topSpeedKmh: 70, reverseSpeedKmh: 20, gun: { reloadS: 6.5 },
      visual: {
        // Keep the authored factory-green field coherent under the warm
        // garage key. The fleet solid painter otherwise adds broad dusty
        // lifts that read as accidental light-olive replacement panels on
        // this densely segmented ERA/roof layout.
        base: '#293a28',
        weather: '#2e422d',
        solidWeatheringIntensity: 0.03,
      } }),
  make('t90a', 't72bu', 'T-72BU', 'USSR/Russia',
    { hp: 2050, weightTons: 46.5, topSpeedKmh: 65, gun: { reloadS: 7.0 } }),
  make('t90m', 't90sm', 'T-90SM', 'Russia',
    { hp: 2400, weightTons: 48, topSpeedKmh: 72, gun: { reloadS: 6.4 },
      dims: { hullLengthM: 6.86, overallLengthM: 9.63, widthM: 3.78, heightM: 2.23 } }),
  make('type10', 'type90', 'Type 90 Kyu-maru', 'Japan',
    // heightM DATUM 2.34 -> 2.55 (§5.73-1 P95-ENVELOPE LAW, owner-ratified;
    // t14/type99a precedent): heightM = the P95 envelope including mandatory
    // roof kit, NOT the bare 2.34 turret roof (Wikipedia infobox) and NOT the
    // published 3.05 "over sights+MG" (weaponsystems.net) — 3.05 is a
    // 1-2-column MAX over the swung M2, exactly the spike class the gate's
    // antenna-robust p95 excludes. 2.55 = the corrected 49-v2 oracle's
    // measured bodyHeightM (gate dims-replica: 12% body filter, p95 of column
    // tops — docs/references/vertex/type90.json at fcfeb38a; §5.39 owner
    // verdict re-compressed the print to the REAL lines: roof 2.34 / hatch+
    // ridge band 2.44-2.53 / sight head 2.60 max). Bracket: 2.34 roof < 2.55
    // p95-with-kit < 2.60 print max < 3.05 published max. Unlocks the §5.57
    // crown-band dims-datum cap (turret_side 68.9). Receipts:
    // docs/references/tanks/type90.md DATUM section.
    { hp: 2200, weightTons: 50.2, topSpeedKmh: 70,
      gun: {
        reloadS: 18.5,
        autoloader: { magazineSize: 3, intraClipS: 2.2, fullReloadS: 18.5 },
      },
      dims: { hullLengthM: 7.45, overallLengthM: 9.76, widthM: 3.43, heightM: 2.55 } }),
  make('t90a', 't90a_vladimir', 'T-90A Vladimir', 'Russia',
    { hp: 2300, topSpeedKmh: 65, gun: { reloadS: 6.6 } }),
];

// SEPv3 ammo identity (coordinator wiki reference 2026-08-07): the AMP round
// ships under its developmental XM designation on this mark (the base m1a2
// row carries the fielded 'M1147 AMP' name — the copy is renamed, not the
// base). Ammunition Data Link handling is the row's reloadS edge.
{
  const sepv3 = SPECS.find((s) => s.id === 'm1a2_sepv3');
  if (!sepv3) throw new Error('Additional fleet spec missing: m1a2_sepv3');
  const amp = sepv3.gun.shells.find((sh) => /AMP/.test(sh.name));
  if (amp) amp.name = 'XM1147 AMP';
}

// §5.364 type90 gun-trunnion true-up (owner order: "properly attached ...
// arc up and down porperly"). The visual rig now pitches about the turret-
// face trunnion (profiles/misc.ts buildType90 — world y 1.686, z 1.30). The
// inherited type10-scaled armor row kept its donor pivot at world (1.722,
// 1.634) with a 4.978 m barrel: sim/armor.ts pitches the mantlet plates
// about THAT point, sim/movement.ts solves the lay from it, and the
// authoritative muzzle estimate overshot the rendered tip by 0.65 m — the
// hit-model arc diverged from the rendered gun. Re-anchor the armor
// trunnion on the rendered line (armor frame: turretPivot [0, 1.4463,
// 0.2287] + gunPivot = the world trunnion) and true the barrel run to the
// rendered muzzle (5.9594 − 1.30 = 4.66 m). type90a structuredClones this
// row in src/vehicles/japan.ts and stays in lockstep. §5.361 rig-anchor
// law: pivots are authored data — this is the authored correction, never a
// calibration remap.
{
  const t90 = SPECS.find((s) => s.id === 'type90');
  if (!t90) throw new Error('Additional fleet spec missing: type90');
  t90.armor.gunPivot = [0, 0.2397, 1.0713];
  t90.armor.gunBarrel.lengthM = 4.66;
}

// Warrior MILAN remains a first-party procedural derivative of the authored
// FV510 rather than a Bradley fallback.  Clone the already-constructed local
// Warrior row here (it is not registered in TANK_SPECS until the loop below),
// retain the RARDEN belts and add the roof-mounted MILAN 2 as its own guided
// ammunition plant.
{
  const base = SPECS.find((s) => s.id === 'fv510');
  if (!base) throw new Error('Additional fleet spec missing: fv510');
  const milan = copy(base);
  milan.id = 'fv510_milan';
  milan.name = 'FV510 Warrior MILAN';
  milan.variantOf = 'fv510';
  milan.publicVisualFallback = null;
  milan.hp = 1525;
  milan.weightTons = 28.4;
  milan.topSpeedKmh = 68;
  milan.hullTraverseDegS = 43;
  milan.visual = { ...base.visual, number: 'M9' };
  milan.gun = {
    ...base.gun,
    reloadS: 0.78,
    shells: [
      ...base.gun.shells.map((shell, index) => ({
        ...copy(shell),
        dmg: index === 0 ? 84 : 76,
        reloadS: 0.78,
      })),
      shell('MILAN 2', 'HEAT', 115, 800, 800, 480, 130, {
        pen2000Mm: 800, reloadS: 12.5, count: 6, guided: true,
        soundProfile: 'milan-launch',
      }),
    ],
  };
  // The visible glacis tiles, side packs and turret applique are real armor,
  // not cosmetic boxes. Add their protection directly to this canonical
  // variant. Tracks remain external and untouched.
  for (const plate of milan.armor.hullPlates) {
    if (/upper_glacis/.test(plate.name)) {
      plate.keMm += 30; plate.ceMm += 70;
    } else if (/hull_side_upper|skirt/.test(plate.name)) {
      plate.keMm += 20; plate.ceMm += 50;
    }
  }
  for (const plate of milan.armor.turretPlates) {
    if (/cheek|mantlet/.test(plate.name)) {
      plate.keMm += 25; plate.ceMm += 60;
    } else if (/side/.test(plate.name)) {
      plate.keMm += 15; plate.ceMm += 40;
    }
  }
  SPECS.push(milan);
}

// Register only first-party procedural gameplay rows. Historical source assets
// are offline comparison inputs and have no runtime registration path.
for (const spec of SPECS) {
  tankSpecs[spec.id] ||= spec;
  if (!ALL_TANK_IDS.includes(spec.id)) ALL_TANK_IDS.push(spec.id);
}

export const ADDITIONAL_FLEET_TANK_IDS = SPECS.map((spec) => spec.id);
