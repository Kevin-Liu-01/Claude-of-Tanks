// Recovered-drop wave 6: distinct Cold-War/modern vehicles from the owner's
// source archives. Geometry was normalized by tools/build_recovered_fleet.sh;
// class stats inherit the nearest researched vehicle and are then adjusted to
// keep each variant identifiable and matchmaking-safe.
import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS, fitArmorToDims } from './specs.js';
import { shell } from './specHelpers.js';

const copy = (v) => JSON.parse(JSON.stringify(v));
// Reference assets never become playables, including in local development.
const ALLOW_LOCAL_RECOVERED_MODELS = false;
const make = (baseId, id, name, nation, patch = {}) => {
  const spec = copy(TANK_SPECS[baseId]);
  spec.id = id;
  spec.name = name;
  spec.nation = nation || spec.nation;
  spec.variantOf = baseId;
  spec.publicVisualFallback = baseId;
  if (ALLOW_LOCAL_RECOVERED_MODELS) {
    spec.community = {
      author: 'Recovered owner drop', source: `user-drops-recovered/${id}`,
      license: 'Redistribution not cleared — LOCAL-ONLY QUARANTINE',
    };
  } else {
    delete spec.community;
  }
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
};

const merkavaGun = ({
  reloadS, accuracy, aimTimeS, kinetic, heat, heDamage, moduleDmg, bloom,
}) => {
  const gun = copy(TANK_SPECS.merkava4.gun);
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
};

const merkavaArmor = ({ glacis, lower, wedge, notch, side }) => {
  const armor = copy(TANK_SPECS.merkava4.armor);
  const ratings = {
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
};

const SPECS = [
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
        shells: TANK_SPECS.leo1a5.gun.shells.map((round, index) => ({
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
        // The widened obr-1975 authoring frame remains the shared Type 59
        // chassis source, but this T-62 presentation is uniformly reduced
        // to 90% at its articulated hull/turret roots. Published dimensions
        // follow the same exact reduction in all three axes.
        hullLengthM: 5.967, overallLengthM: 8.406, widthM: 3.267, heightM: 2.16,
        // The supplied Obr. 1975 art source includes its full fender/drum
        // envelope and DShK-height convention.  Preserve published vehicle
        // dimensions for gameplay/UI while the geometry gate compares the
        // actual registered source silhouette measured from that file.
        silhouetteHullLengthM: 6.354,
        silhouetteOverallLengthM: 8.964,
        silhouetteHeightM: 2.466,
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
  const amp = sepv3.gun.shells.find((sh) => /AMP/.test(sh.name));
  if (amp) amp.name = 'XM1147 AMP';
}

// §5.364 type90 gun-trunnion true-up (owner order: "properly attached ...
// arc up and down porperly"). The visual rig now pitches about the turret-
// face trunnion (profiles/misc.js buildType90 — world y 1.686, z 1.30). The
// inherited type10-scaled armor row kept its donor pivot at world (1.722,
// 1.634) with a 4.978 m barrel: sim/armor.js pitches the mantlet plates
// about THAT point, sim/movement.js solves the lay from it, and the
// authoritative muzzle estimate overshot the rendered tip by 0.65 m — the
// hit-model arc diverged from the rendered gun. Re-anchor the armor
// trunnion on the rendered line (armor frame: turretPivot [0, 1.4463,
// 0.2287] + gunPivot = the world trunnion) and true the barrel run to the
// rendered muzzle (5.9594 − 1.30 = 4.66 m). type90a structuredClones this
// row in src/vehicles/japan.js and stays in lockstep. §5.361 rig-anchor
// law: pivots are authored data — this is the authored correction, never a
// calibration remap.
{
  const t90 = SPECS.find((s) => s.id === 'type90');
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

const ROOT = '/models/tanks/community/recovered/';
const source = (id, cfg = {}) => {
  MODEL_SOURCE[id] = { source: 'glb', glb: { path: `${ROOT}${id}.glb`, paintUntextured: true, ...cfg } };
};
const articulated = (id, cfg = {}) => source(id, {
  turretNode: '^Turret$', gunNode: '^Gun$', autoPivot: true, ...cfg,
});
const CHALLENGER_TURRET_FOLLOWERS =
  'vehicle#(?:ammo_|antenna_|bone_mg_aa_|ex_decor_(?:0[1-3]|0[5-9]|1[0-2])_|hatch_0[2-5]_)';
const CHALLENGER_GUN_FOLLOWERS = 'vehicle#(?:gun_mask_|bone_mg_gun_twin_)';
// ex_armor_[lr]_NN are the HULL SKIRT runs (26 nodes on the 2B print) — the
// old (?!body) lookahead swept them into rig_turret and capped the family's
// reference turret masks at 26-58 no matter what the procedural built
// (round-3 finding, quantified in docs/references/tanks/merkava2b.md).
const MERKAVA_TURRET_FOLLOWERS =
  'vehicle#(?:antenna_|bone_|ex_armor_(?!body|[lr]_)|ex_decor_(?:0[1-9]|13)|ex_decor_[lr]_02|hatch_(?:0[4-9]|1[0-3]))';
const MERKAVA_GUN_FOLLOWERS = 'vehicle#gun_barrel_';

// Specs/gameplay ship everywhere. Public builds deliberately omit the
// recovered GLBs and resolve each row through its procedural family model;
// private/local builds install the exact recovered source below.
for (const spec of SPECS) {
  TANK_SPECS[spec.id] = TANK_SPECS[spec.id] || spec;
  if (!ALL_TANK_IDS.includes(spec.id)) ALL_TANK_IDS.push(spec.id);
}

if (ALLOW_LOCAL_RECOVERED_MODELS) {
    // FLIP-RETIRED: articulated('challenger1', {
  // FLIP-RETIRED: turretFollowers: CHALLENGER_TURRET_FOLLOWERS,
  // FLIP-RETIRED: gunFollowers: CHALLENGER_GUN_FOLLOWERS,
  // FLIP-RETIRED: });
  // This OBJ retains its authored Z-up frame after import; rotate Z-up to the
  // runtime's Y-up convention before modelLoader measures and normalizes it.
  // Oracle repair (tools/repair_oracles.py): the GLB's original `Turret` node
  // was the CHASSIS; the repaired file seats the real casting under `Turret`
  // (ring pivot at the authored y=0 station) and the L11 under `Gun`.
  // chieftain5: DUAL-GATE GRADUATE (2026-08-04) — the program's 18th, the
  // UK family's FIRST. Geometry min 91.2 gatePassed x2 (turret 94.1) +
  // graduation critic 9.0 on ALL FOURTEEN views (floor 5.0 -> 7.0 -> 9.0
  // across r4-r6; right view 9.5). NO MODEL_SOURCE — freeze hash e8919e36
  // via tmp-hashgeo; the recovered Z-up print stays as the measurement
  // oracle (all three override maps carry the registration incl.
  // pitchOffset -PI/2).
  // fv510: SOURCE REGISTRATION RETIRED (2026-08-10). The repaired CC-BY
  // print remains a comparison oracle only; the playable is authored by the
  // repository's native procedural builder.
    // FLIP-RETIRED: articulated('leo2_revolution', { yawOffset: Math.PI });
  // leo2a5: DUAL-GATE GRADUATE (2026-08-04, the 21st — geometry 90.8 x2 +
  // critic 9.0 every view at r10; ladder 7.7 -> 9.0 over five rounds;
  // 04c3e11). Registration retired per §10; freeze hash bc9bad30; the
  // recovered print stays a measurement oracle via the three maps.
  // leo2a7v: runtime source registration retired. The local print remains a
  // comparison oracle only; buildLeo2A7V owns every playable vertex.
  // m1a1ha: DUAL-GATE GRADUATE (2026-08-02, freeze hash 88a4a978) — no
  // MODEL_SOURCE; procedural ships everywhere (tejas GLB stays as oracle).
    // FLIP-RETIRED: source('m1a2_sepv2', {
  // FLIP-RETIRED: turretNode: '^Turret$', gunNode: '^misc_b$', autoPivot: true,
  // FLIP-RETIRED: yawOffset: Math.PI,
  // FLIP-RETIRED: turretFollowers: '^(?:ammo_(?:5|box)|armor_turret|ex_armoc|ex_armor(?!_body)|ex_era_turret|ex_decor_04|glsaa_[6-8]|hatch_0[34]|mg_aamount_h|misc_a|optic_commander)$',
  // FLIP-RETIRED: });
  // m60a1: NO source() call — dual-gate graduate, procedural build ships in
  // every flavor. The recovered m60a1.glb FILE stays on disk: userdrops6's
  // m60a3 still aliases it directly (and has NOT passed the gate).
  // pt91m: DUAL-GATE GRADUATE (2026-08-03) — the program's 14th. Geometry
  // min 91.3 gatePassed x2 + graduation critic 9.0 on ALL FOURTEEN views
  // (floor 8.2 -> 8.6 -> 9.0 across r25-r28; crown-air column cert audited
  // and binding). NO MODEL_SOURCE — freeze hash via tmp-hashgeo; the
  // recovered GLB stays as the measurement oracle (all three override
  // maps; NOTE the print is authored -z-forward: the critic + evaluator
  // harnesses need yawOffset PI in their entries, the fidelity page does
  // not — probe-proven both ways).
  // merkava3b + merkava3c: DUAL-GATE GRADUATES (2026-08-02) — no
  // MODEL_SOURCE; procedural ships everywhere (hashes 5296950a/5287233e;
  // critic 9.0 all nine views, r8). GLBs stay as measurement oracles.
  // merkava3d: DUAL-GATE GRADUATE (2026-08-03) — the program's 13th.
  // Geometry min 90.4 gatePassed x2 + graduation critic 9.0 on ALL
  // FOURTEEN views (floor climbed 8.6 -> 8.9 -> 9.0 across r11-r13; five
  // arbitration certs transfer with the graduation record). NO
  // MODEL_SOURCE — freeze hash 954a9650 via tmp-hashgeo; the recovered
  // GLB stays as the measurement oracle (all three override maps).
  // merkava1b: DUAL-GATE GRADUATE (2026-08-04) — the program's 16th, the
  // merkava family's FOURTH. Geometry min 90.0 gatePassed x2 at the exact
  // razor + graduation critic 9.0 on ALL FOURTEEN views (floor 8.4 -> 9.0
  // across r12-r13; three arbitration certs decisive). NO MODEL_SOURCE —
  // freeze hash 106b0074 via tmp-hashgeo; the recovered GLB stays as the
  // measurement oracle (all three override maps carry the registration).
  for (const id of []) { // FLEET FLIP 2026-08-04: merkava2b/2d/4b -> procedural+CUSTOM
    articulated(id, {
      turretFollowers: MERKAVA_TURRET_FOLLOWERS,
      gunFollowers: MERKAVA_GUN_FOLLOWERS,
    });
  }
  for (const id of []) { // FLEET FLIP 2026-08-04: t64bv1/type90 -> procedural+CUSTOM
    source(id, {
      turretNode: '^Turret$', autoPivot: true, yawOffset: -Math.PI / 2,
    });
  }
  // TYPE 90 SOURCE-VIEW ARTICULATION (owner screenshot 2026-08-10): the
  // recovered print has only three render meshes. Its complete upper vehicle
  // — welded shell, the two circular roof stations, bustle cage, boxes and
  // gun — is the single TurretMesh child of the authored Turret node. Keep
  // gameplay on the procedural build, but register that print with the same
  // explicit Turret contract so the Sources card cannot leave the cage/roof
  // furniture fused to the hull when the turret is slewed.
  MODEL_SOURCE.type90 = {
    source: 'procedural',
    candidateGlb: {
      path: `${ROOT}type90.glb`,
      turretNode: '^Turret$',
      autoPivot: true,
      yawOffset: -Math.PI / 2,
      paintUntextured: true,
    },
  };
  // batch-13b RULING (no surgery): t72bu's batch-9 split already created a
  // Gun node under Turret, but this registration never DECLARED it — the
  // turret mask swallowed the whole tube subtree (plan_turret read the ref
  // turret to z 5.89) and turret rows capped at 11. gunNode resolves it.
    // FLIP-RETIRED: source('t72bu', {
  // FLIP-RETIRED: turretNode: '^Turret$', gunNode: '^Gun$', autoPivot: true,
  // FLIP-RETIRED: yawOffset: -Math.PI / 2,
  // FLIP-RETIRED: });
  // batch-13 (tools/repair_oracles.py 't72b_1987'): the fused 2A46M — 7
  // loose tube components inside TurretMesh — is component-split into
  // GunMesh under a new Gun node (no trim; the warped tube already ends at
  // published overall -0.3%). gunNode resolves it so turret masks compare
  // tube-less turret to tube-less turret at every yaw pose.
    // FLIP-RETIRED: source('t72b_1987', {
  // FLIP-RETIRED: turretNode: '^Turret$', gunNode: '^Gun$', autoPivot: true,
  // FLIP-RETIRED: yawOffset: -Math.PI / 2,
  // FLIP-RETIRED: });
  // t62mv1 is intentionally source-free at runtime.  Its retired Bergman/MV
  // oracle is not registered: the first-party obr. 1975 build was rebuilt
  // and certified against the owner's external GLB, which remains an offline
  // measurement/visual reference only.
  // t72b3m: DUAL-GATE GRADUATE (2026-08-04) — the program's 15th. Geometry
  // min 91.8 gatePassed x2 + graduation critic 9.0 on ALL FOURTEEN views
  // (floor 8.0 -> 8.5 -> 9.0 across thirteen builder rounds; three views
  // banked early and held; five-for-five order reproduction, zero flips).
  // NO MODEL_SOURCE — freeze hash c19ec9f0 via tmp-hashgeo; the recovered
  // GLB stays as the measurement oracle (all three override maps carry the
  // registration incl. yawOffset PI).
    // FLIP-RETIRED: source('t90sm', {
  // FLIP-RETIRED: turretNode: '^misc_a$', gunNode: '^misc_b$', autoPivot: true,
  // FLIP-RETIRED: yawOffset: Math.PI,
  // FLIP-RETIRED: });
    // FLIP-RETIRED: source('t90a_vladimir', {
  // FLIP-RETIRED: // Highest-detail turret assembly; the remaining desirefx meshes are hull,
  // FLIP-RETIRED: // running gear, side skirts and LOD layers and must stay with the chassis.
  // FLIP-RETIRED: turretNode: '^desirefx[._]?me_001$', autoPivot: true,
  // FLIP-RETIRED: });
}

export const USERDROP5_TANK_IDS = SPECS.map((s) => s.id);

// PROVENANCE-INTENT (era bucketing): the wave-5 rows whose visual is sourced
// from an online/recovered model in the full local build. Public builds skip
// the quarantined registrations above, so MODEL_SOURCE is NOT a public-safe
// signal — the garage catalog keys era buckets off this list instead, keeping
// local and public grouping identical. m60a1 is excluded: it graduated the
// dual gate and its procedural build ships everywhere (a true original now).
export const USERDROP5_SOURCED_IDS = USERDROP5_TANK_IDS.filter((id) => !['m60a1', 'm1a1ha', 'merkava3c', 'merkava3d', 'merkava4b', 'pt91m', 't72b3m', 'merkava1b', 'chieftain5', 'leo2a5', 'challenger1', 'leo2_revolution', 'm1a2_sepv2', 'm1a2_sepv3', 't62mv1', 't72bu', 't72b_1987', 't90sm', 't90a_vladimir', 'merkava2b', 'merkava2d', 'fv510', 'fv510_milan', 't64bv1', 'type90'].includes(id));
