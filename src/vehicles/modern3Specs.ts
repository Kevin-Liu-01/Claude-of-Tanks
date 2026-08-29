// Boot-light combat records for modern procedural builder pack #3.
// The Three.js builders remain in modern3.ts and are loaded only when one of
// their canonical vehicles (or a derived family profile) is requested.

import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.ts';
import {
  crewBox as cbox,
  shell,
  apfsdsPenetration as apfsdsPens,
  modernArmor,
  type ArmorEnvelope,
} from './specHelpers.ts';
import type { AimBloom, FleetTankSpec } from './specContracts.ts';
import { bindFleetRegistries, registerFleetSpecs } from './fleetSpecRegistry.ts';

const BLOOM_MODERN: Readonly<AimBloom> = {
  move: 0.06,
  hullRot: 0.08,
  turret: 0.06,
  afterShot: 2.2,
};

function offsetTurretRing(armor: ArmorEnvelope, offsetX: number): void {
  const ring = armor.modules.find((module) => module.module === 'turretRing');
  if (!ring) throw new Error('Modern armor envelope is missing its turret ring');
  ring.min = [ring.min[0] + offsetX, ring.min[1], ring.min[2]];
  ring.max = [ring.max[0] + offsetX, ring.max[1], ring.max[2]];
}

// ---------------------------------------------------------------------------
// The spec table (values per modern-roster.md sections cited above)
// ---------------------------------------------------------------------------

export const MODERN3_SPECS = {
  chieftain_mk10: {
    id: 'chieftain_mk10', name: 'Chieftain Mk 10', nation: 'UK', era: 'modern', role: 'mbt',
    hp: 1750,
    enginePowerHp: 750, weightTons: 55, topSpeedKmh: 48, reverseSpeedKmh: 10,
    hullTraverseDegS: 28,
    terrainResistance: { hard: 0.85, medium: 1.0, soft: 1.8 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 26, gunPitchDegS: 20, gunElevationDeg: 20, gunDepressionDeg: 10,
    gun: {
      caliberMm: 120, reloadS: 8.0, baseAccuracy: 0.32, aimTimeS: 2.4,
      bloom: BLOOM_MODERN,
      shells: [
        shell('L23A1 APFSDS', 'APFSDS', 120, apfsdsPens(400)[0], apfsdsPens(400)[1], 480, 1534, { pen2000Mm: apfsdsPens(400)[2] }),
        shell('L31A7 HESH', 'HE', 120, 150, 150, 600, 670),   // 150 flat, no falloff — the identity round
        shell('L34 WP Smoke', 'HE', 120, 10, 10, 100, 670),
      ],
    },
    dims: { hullLengthM: 7.52, overallLengthM: 10.79, widthM: 3.66, heightM: 2.90 },
    armor: modernArmor({
      hl: 3.76, hw: 1.80, inW: 1.16, floor: 0.34, trkTop: 1.07, roofY: 1.72,
      turretPivot: [0, 1.72, 0.1], gunPivot: [0, 0.30, 0.8],
      barrelLenM: 6.1, barrelRadM: 0.082,
      // Stillbrew turret front; the famous 72° glacis is overmatched by
      // late APFSDS (§19.2) — ke sits below every modern round on purpose.
      glacis: [120, 300, 300], lower: [95, 120, 120], side: [38, 60, 60],
      skirt: null, rear: 25, roof: 20,
      tw: 1.05, tFrontZ: 1.45, tRearZ: -1.35, tH: 0.66,
      cheek: [300, 380, 450], tSide: [95, 160, 200], tRear: 45, tRoof: 25,
      mantlet: [250, 340, 400], loader: true,
    }),
    visual: {
      // BAOR green/black blotch (§19.5)
      scheme: 'stripes', base: '#3f4a36', weather: '#4a5540',
      patches: ['#1d1f1c', '#33402c'],
      marking: 'number', number: '22', trackWidthM: 0.61, camoScale: 0.55,
    },
  },

  k2: {
    id: 'k2', name: 'K2 Black Panther', nation: 'South Korea', era: 'modern', role: 'mbt',
    hp: 2450,
    enginePowerHp: 1500, weightTons: 55, topSpeedKmh: 70, reverseSpeedKmh: 25,
    hullTraverseDegS: 44,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    // ISU hydropneumatic kneel (§23.3): modeled as best-in-class -10 depression.
    turretTraverseDegS: 40, gunPitchDegS: 32, gunElevationDeg: 20, gunDepressionDeg: 10,
    gun: {
      caliberMm: 120, reloadS: 5.2, baseAccuracy: 0.29, aimTimeS: 1.8,
      bloom: BLOOM_MODERN,
      shells: [
        shell('K279 APFSDS', 'APFSDS', 120, apfsdsPens(700)[0], apfsdsPens(700)[1], 530, 1760, { pen2000Mm: apfsdsPens(700)[2] }),
        shell('K280 HEAT-MP', 'HEAT', 120, 610, 610, 470, 1130),
        shell('K281 HE', 'HE', 120, 45, 45, 580, 1000),
      ],
    },
    dims: { hullLengthM: 7.5, overallLengthM: 10.8, widthM: 3.6, heightM: 2.4 },
    // §5.38 PRINT REBUILD (2026-08-08): armor rig re-derived to the
    // k2_black_panther_armored_warfare print truth (raw meters ×0.968 =
    // gate frame). The print's turret is LONG (shell z -3.0..+2.32 world)
    // and WIDE (walls ±1.50, cheek modules ±1.61) — pivot re-set to the
    // shell's plan center (spin law: pivot-at-visual-center, world-identity
    // at rest); trunnion world (0, 1.96, +1.42); barrelLenM = the visible
    // gun-local run to the +6.95 muzzle (§C shadow-proxy true-up — the old
    // 6.6 spec row vs 6.00 built was the flagged residual).
    armor: modernArmor({
      hl: 3.75, hw: 1.79, inW: 1.22, floor: 0.45, trkTop: 1.05, roofY: 1.66,
      turretPivot: [0, 1.66, -0.30], gunPivot: [0, 0.33, 1.72],
      barrelLenM: 5.57, barrelRadM: 0.10,
      glacis: [45, 130, 160], lower: [550, 500, 700], side: [45, 100, 100],
      skirt: [80, 150, 400], rear: 40, roof: 40,
      tw: 1.50, tFrontZ: 2.60, tRearZ: -2.10, tH: 0.72,
      cheek: [650, 650, 900], tSide: [300, 300, 400], tRear: 60, tRoof: 45,
      mantlet: [350, 400, 480], loader: false, bustleAmmo: true,
    }),
    visual: {
      // ROK 3-color soft-edge blobs (§23.5)
      scheme: 'nato', base: '#4c5844', weather: '#56624d',
      patches: ['#23261f', '#5a4a38'],
      marking: 'number', number: '325', trackWidthM: 0.63, camoScale: 0.5,
    },
  },

  // §5.38 KOREA round (2026-08-08, owner priority): K1A1 — the "baby
  // Abrams". ROKA's KM256-gunned K1 upgrade: Abrams-like low flat turret
  // with angled cheek fronts, Korean cupola + gunner-sight doghouse,
  // 6 roadwheels on the hybrid (torsion-bar + hydropneumatic) stance,
  // full skirts. Print: public/models/community-candidates/k1a1_kojf.glb
  // (semantic re-bake, LOCAL-ONLY quarantine — measurement/influence only).
  k1a1: {
    id: 'k1a1', name: 'K1A1', nation: 'South Korea', era: 'modern', role: 'mbt',
    hp: 2200,
    enginePowerHp: 1200, weightTons: 53.2, topSpeedKmh: 65, reverseSpeedKmh: 25,
    hullTraverseDegS: 42,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    // hybrid suspension nose-kneel: -10 frontal depression like the K2
    turretTraverseDegS: 36, gunPitchDegS: 30, gunElevationDeg: 20, gunDepressionDeg: 10,
    gun: {
      caliberMm: 120, reloadS: 6.0, baseAccuracy: 0.30, aimTimeS: 1.9,
      bloom: BLOOM_MODERN,
      shells: [
        shell('K276 APFSDS', 'APFSDS', 120, apfsdsPens(600)[0], apfsdsPens(600)[1], 520, 1700, { pen2000Mm: apfsdsPens(600)[2] }),
        shell('K277 HEAT-MP', 'HEAT', 120, 600, 600, 470, 1140),
        shell('120 HE', 'HE', 120, 45, 45, 560, 1000),
      ],
    },
    // 2.20 m is the bare turret/cupola plane. The owner-mandated K6 on the
    // commander's cupola is part of the combat envelope, so the P95 datum is
    // the broad receiver/cupola station rather than an artificial low-wall
    // mount. Thin whip tips remain excluded by the P95 law.
    dims: { hullLengthM: 7.48, overallLengthM: 9.71, widthM: 3.6, heightM: 2.58 },
    // Rig derived from the print (raw ×0.979 ≈ gate): deck 1.475/1.61,
    // finished low shell walls ±1.32, z world -1.42..+1.72, pivot at its
    // plan center (spin law), trunnion world (0, 1.765, +1.55), muzzle
    // world +5.90 (overall 9.64, inside the 1% dims grace vs the print's
    // -1.9% overall bind).
    armor: modernArmor({
      hl: 3.74, hw: 1.69, inW: 1.02, floor: 0.40, trkTop: 1.00, roofY: 1.48,
      turretPivot: [0, 1.50, 0.10], gunPivot: [0, 0.265, 1.45],
      barrelLenM: 4.35, barrelRadM: 0.105,
      glacis: [55, 420, 480], lower: [400, 380, 520], side: [45, 90, 100],
      skirt: [50, 100, 320], rear: 32, roof: 38,
      tw: 1.32, tFrontZ: 1.72, tRearZ: -1.42, tH: 0.60,
      cheek: [500, 560, 750], tSide: [270, 280, 380], tRear: 55, tRoof: 40,
      mantlet: [300, 380, 460], loader: true, bustleAmmo: true,
    }),
    visual: {
      // ROK 3-color, K2 family grammar with its own tone step (§H.4)
      scheme: 'nato', base: '#4a5743', weather: '#545f4c',
      patches: ['#242720', '#584936'],
      marking: 'number', number: '110', trackWidthM: 0.57, camoScale: 0.5,
    },
  },

  type10: {
    id: 'type10', name: 'Type 10', nation: 'Japan', era: 'modern', role: 'mbt',
    hp: 2300,
    enginePowerHp: 1200, weightTons: 48, topSpeedKmh: 70, reverseSpeedKmh: 25,
    hullTraverseDegS: 46,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 42, gunPitchDegS: 32, gunElevationDeg: 20, gunDepressionDeg: 10,
    gun: {
      caliberMm: 120, reloadS: 5.5, baseAccuracy: 0.29, aimTimeS: 1.8,
      bloom: BLOOM_MODERN,
      shells: [
        shell('Type 10 APFSDS', 'APFSDS', 120, apfsdsPens(680)[0], apfsdsPens(680)[1], 520, 1750, { pen2000Mm: apfsdsPens(680)[2] }),
        shell('JM12A1 HEAT-MP', 'HEAT', 120, 600, 600, 470, 1400),
        shell('Type 10 HE', 'HE', 120, 45, 45, 570, 1000),
      ],
    },
    // §5.336 OWNER-DECREED ENLARGEMENT (order verbatim 2026-08-17: "make the
    // type 10s larger..."): the §5.248 sovereign datums 6.84 / 9.49 / 3.24 /
    // 2.68 are re-derived at the ordered ×1.10 (scale judged vs type90
    // side-by-side, receipts shots/type10-enlarge/scale-probe/). §5.304-class
    // divergence: the registered repaired print now reads ~9.1% SMALL vs
    // this row BY DECREE — adjudicated FALSE-class divergence (never chase
    // the print back). heightM = P95 envelope incl. the mandatory pano head
    // (§5.73-1 law; authored head cap 2.963 physical).
    // EXACT ×1.10 published values (not rounded): type90's spec clones this
    // row's armor frame through userdrops5 make() + fitArmorToDims — exact
    // scaling makes that refit the exact inverse, so the owner-corrected
    // type90 hit frame stays byte-invariant (guard law §5.336).
    dims: { hullLengthM: 7.524, overallLengthM: 10.439, widthM: 3.564, heightM: 2.948 },
    // Native authored rig at the ×1.10 frame (§5.336): deck 1.6885 mid /
    // 1.782 engine, ring pivot [1.672, +0.235], bore 1.991, muzzle +6.653 =
    // the 10.44 overall on the 7.52 hull. Armor frame scaled in the SAME
    // edit (§D ERA-def/geometry coupling law); protection mm values are
    // gameplay truth and do not scale with visual size.
    // PIVOT CLONE-FRAME LAW (§5.362 re-auth): the two pivot arrays below are
    // the §5.336 CLONE FRAME, kept byte-stable because userdrops5's type90
    // row clones this armor through make() + fitArmorToDims (which scales
    // pivots — the type90 hit frame must stay byte-invariant, guard law
    // §5.336) and japan.ts clones it for type10b. The LIVE rig/sim pivots
    // for type10 + type10b are re-seated post-clone in japan.ts. Their gun
    // pivot comes from profiles/type10GunSeat.ts so the mantlet meets the
    // marked turret throat without moving the certified muzzle station.
    // rig_turret itself stays builder-pinned at [0, 1.672, 0.2354] (see
    // P.turretG.position.set in the builder).
    armor: modernArmor({
      hl: 3.762, hw: 1.782, inW: 1.144, floor: 0.495, trkTop: 1.045, roofY: 1.683,
      turretPivot: [0, 1.672, 0.231], gunPivot: [0, 0.319, 1.419],
      barrelLenM: 5.027, barrelRadM: 0.0825,
      glacis: [45, 120, 150], lower: [450, 450, 600], side: [35, 60, 60],
      skirt: [60, 120, 300], rear: 35, roof: 40,
      tw: 1.32, tFrontZ: 2.178, tRearZ: -1.848, tH: 0.748,
      cheek: [600, 600, 850], tSide: [250, 250, 350], tRear: 50, tRoof: 40,
      mantlet: [320, 380, 450], loader: false, bustleAmmo: true,
    }),
    visual: {
      // JGSDF 2-tone hard-edge waves (§24.5); garage-kept — light weathering
      scheme: 'stripes', base: '#39463a', weather: '#445144',
      patches: ['#63523c', '#2e392f'],
      marking: 'number', number: '73', trackWidthM: 0.60, camoScale: 0.5,
    },
  },

  m2a2_bradley: {
    id: 'm2a2_bradley', name: 'M2A2 Bradley', nation: 'USA', era: 'modern', role: 'ifv',
    hp: 1650,
    enginePowerHp: 600, weightTons: 30.4, topSpeedKmh: 61, reverseSpeedKmh: 20,
    hullTraverseDegS: 42,
    terrainResistance: { hard: 0.75, medium: 0.85, soft: 1.4 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 60, gunPitchDegS: 40, gunElevationDeg: 30, gunDepressionDeg: 9,
    gun: {
      // §6.4 per-shell reloads are LIVE (sim/damage.ts startReload): the M242
      // cycles 0.42 s bursts for sustained support fire while the TOW rail
      // pays its full 14 s. gun.reloadS carries the headline burst value
      // (garage card + fallback); per-shell counts size the belts vs. rails.
      caliberMm: 25, reloadS: 0.42, baseAccuracy: 0.30, aimTimeS: 1.4,
      soundProfile: 'm242-bushmaster',
      bloom: BLOOM_MODERN,
      shells: [
        shell('M919 APFSDS-T', 'APFSDS', 25, 130, 118, 58, 1345, { pen2000Mm: 106, reloadS: 0.42, count: 225 }),
        shell('BGM-71 TOW-2A', 'HEAT', 152, 900, 900, 540, 195,
          { reloadS: 14, count: 7, guided: true, soundProfile: 'tow-launch' }),
        shell('M792 HEI-T', 'HE', 25, 8, 8, 50, 1100, { reloadS: 0.42, count: 300 }),
      ],
    },
    // dims reconciliation (AFV r1, packet "Oracle status"): widthM rides the
    // PUBLISHED BASE 3.28 datum (armyrecognition A2 hull/skirts) — the old
    // 3.61 appliqué-stack datum made the width-anchored harness inflate the
    // 42manako oracle +11.5% on every axis (safeScale is uniform). The print
    // itself reads 3.236 as loaded (-1.3%, its untouched anchor axis). The
    // appliqué READ stays in the dressing, inside the 3.28 dims band.
    // OWNER BRADLEY ORDER (2026-08-17) dims true-up: the flank dressing
    // (attached skirt course + bow closures) re-frames the silhouette reads
    // — silhouette* rows carry the dressed build's honest gate actuals
    // (m3a3 §5.306 convention); published rows keep the 3.28 datum / 6.55.
    dims: { hullLengthM: 6.55, overallLengthM: 6.55, widthM: 3.28, heightM: 2.98,
      silhouetteWidthM: 3.25, silhouetteHullLengthM: 6.28,
      // §5.365: 2.98 was tuned against the §5.356 pivot-lifted render; the
      // §5.361 rig-anchor law re-seats the turret — 2.83 is the seated p95.
      silhouetteOverallLengthM: 6.25, silhouetteHeightM: 2.83 },
    armor: modernArmor({
      // AFV r1 rebuild (42manako oracle envelope, docs/references/vertex/
      // m2a2_bradley.json): hull roof 1.90 with the tall two-man turret
      // cluster to 2.98; ring plane 1.895 at the print's own z -0.45 seat.
      hl: 3.27, hw: 1.635, inW: 0.95, floor: 0.45, trkTop: 0.95, roofY: 1.90,
      // gun x -0.075: the print's fused M242 plan band reads x -0.15..0.0
      // (r3c gate-frame re-measure; the r2 "-0.11 tube center" put my tube
      // 0.04 left of its band and lit an extra plan-turret column).
      turretPivot: [0, 1.895, -0.45], gunPivot: [-0.075, 0.375, 0.60],
      barrelLenM: 2.30, barrelRadM: 0.038,
      // aluminum + spaced appliqué: everything overmatched by tank guns (§6.2)
      glacis: [40, 60, 60], lower: [40, 50, 50], side: [30, 30, 30],
      skirt: [25, 30, 60], rear: 25, roof: 20,
      tw: 0.82, tFrontZ: 0.98, tRearZ: -1.05, tH: 0.87,
      cheek: [35, 60, 60], tSide: [30, 30, 30], tRear: 25, tRoof: 20,
      mantlet: [40, 60, 60], loader: false,
    }),
    visual: {
      scheme: 'nato', base: '#49543c', weather: '#525f45',
      patches: ['#23261f', '#4a3a2c'],
      marking: 'number', number: 'C-21', trackWidthM: 0.53, camoScale: 0.5,
    },
  },

  bmp2: {
    id: 'bmp2', name: 'BMP-2', nation: 'USSR', era: 'modern', role: 'ifv',
    hp: 1050,
    enginePowerHp: 300, weightTons: 14.3, topSpeedKmh: 65, reverseSpeedKmh: 12,
    hullTraverseDegS: 50,
    terrainResistance: { hard: 0.75, medium: 0.9, soft: 1.6 },
    pivotStyle: 'pivot',
    turretTraverseDegS: 50, gunPitchDegS: 36, gunElevationDeg: 30, gunDepressionDeg: 5,
    gun: {
      // §17.4 per-shell reloads are LIVE (sim/damage.ts startReload): 2A42
      // 0.28 s bursts / 16 s Konkurs rail. Belt split is the real 160/340.
      caliberMm: 30, reloadS: 0.28, baseAccuracy: 0.32, aimTimeS: 1.4,
      soundProfile: '2a42',
      bloom: BLOOM_MODERN,
      shells: [
        shell('3UBR8 APDS', 'APFSDS', 30, 74, 66, 42, 1120, { pen2000Mm: 58, reloadS: 0.28, count: 160 }),
        shell('9M113M Konkurs-M', 'HEAT', 135, 750, 750, 430, 162.5,
          { reloadS: 16, count: 5, guided: true, soundProfile: 'konkurs-launch' }),
        shell('3UOF8 HE-I', 'HE', 30, 6, 6, 38, 960, { reloadS: 0.28, count: 340 }),
      ],
    },
    // dims two-datum note (packet): heightM 2.45 is the Wikipedia
    // turret+ATGM-stack datum (hull roof alone is 2.06); the spec rides the
    // 2.45 datum and the Bergman oracle agrees (bodyTop 2.42, -1.1%).
    dims: { hullLengthM: 6.72, overallLengthM: 6.72, widthM: 3.15, heightM: 2.45 },
    armor: modernArmor({
      // AFV r2 (post-warp): tub floor 0.41, sponson roof 1.63, fenders to
      // +-1.575; ring plane 1.66. REGISTRATION LAW: dims forces a body-thick
      // nose where the warped print's is body-thin, so the gate's side
      // bodySpan registration settles at dAlong +0.076 — every MID feature
      // (ring included) authors +0.076 forward of the print's own line; the
      // ends hold the published 6.72 envelope.
      hl: 3.36, hw: 1.575, inW: 1.0, floor: 0.41, trkTop: 1.14, roofY: 1.63,
      turretPivot: [0, 1.66, 0.03], gunPivot: [0, 0.285, 0.55],
      barrelLenM: 2.52, barrelRadM: 0.036,
      glacis: [33, 35, 35], lower: [26, 28, 28], side: [17, 18, 18],
      skirt: null, rear: 16, roof: 6,
      tw: 0.98, tFrontZ: 0.98, tRearZ: -0.96, tH: 0.50,
      cheek: [26, 30, 30], tSide: [19, 20, 20], tRear: 16, tRoof: 8,
      mantlet: [30, 33, 33], loader: false,
    }),
    visual: {
      scheme: 'solid', base: '#4a5138', weather: '#565e43', patches: [],
      marking: 'number', number: '245', trackWidthM: 0.36,
    },
  },

  spz_puma: {
    id: 'spz_puma', name: 'SPz Puma', nation: 'Germany', era: 'modern', role: 'ifv',
    hp: 2100,
    enginePowerHp: 1088, weightTons: 31.5, topSpeedKmh: 70, reverseSpeedKmh: 30,
    hullTraverseDegS: 46,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.4 },
    pivotStyle: 'neutral',
    // Unmanned RCT30: fast stabilized drives, +45 elevation class.
    turretTraverseDegS: 60, gunPitchDegS: 45, gunElevationDeg: 45, gunDepressionDeg: 10,
    gun: {
      // MK30-2/ABM per-shell reloads are LIVE (sim/damage.ts startReload):
      // 0.35 s bursts on the belts, 15 s on the Spike rail.
      caliberMm: 30, reloadS: 0.35, baseAccuracy: 0.28, aimTimeS: 1.3,
      soundProfile: 'mk30-2',
      bloom: BLOOM_MODERN,
      shells: [
        shell('MK30 APFSDS-T', 'APFSDS', 30, 180, 164, 70, 1385, { pen2000Mm: 148, reloadS: 0.35, count: 200 }),
        shell('Spike LR', 'HEAT', 152, 760, 760, 520, 117,
          { reloadS: 15, count: 6, guided: true, soundProfile: 'spike-launch' }),
        shell('KETF ABM', 'HE', 30, 10, 10, 72, 1100, { reloadS: 0.35, count: 200 }),
      ],
    },
    // dims datum (AFV lane 2026-08-06, packet "Oracle status"): 7.6 hull =
    // published length (IFV: the MK30 muzzle stays behind the bow plane in
    // the 42manako print — overall = hull, bradley convention). widthM 3.9 =
    // the published level-C armor datum: the print's own proportions read
    // w/l 0.534 (4.06 at len-anchor) so 3.9 is the closest published width
    // (-3.8%); 3.7 (level A) would inflate the safeScale clamp to -8.8% on
    // every axis. heightM 3.6 = the published mast/optics datum (the print's
    // own PERI mast plateau, raw 3.64 pre-clamp). Print reads -4% uniform in
    // the width-anchored gate frame (k 0.9615) — normalize plan filed in the
    // packet (orchestrator lane, §E).
    dims: { hullLengthM: 7.6, overallLengthM: 7.6, widthM: 3.9, heightM: 3.6 },
    armor: (() => {
      const a = modernArmor({
        // Extract-mapped envelope (docs/references/vertex/spz_puma.json,
        // build = print gate frame x as-is, z x1.0418, y x1.0444): deck 2.11,
        // ring plane 2.03 / z -1.374. §B8 REWORK (owner 2026-08-06 "a more
        // centered turret"): seat x 0.435 (the print's autoPivot) -> 0.15 —
        // just off centerline toward the driver-hatch side, the packet's
        // residual-2 seat change; honest turret-row gate cost accepted.
        hl: 3.8, hw: 1.95, inW: 1.00, floor: 0.47, trkTop: 1.0, roofY: 2.11,
        // Gun axis: print fused-tube plan band x 0.03..0.14 -> tube center
        // x +0.085 world HELD (= -0.065 turret-local off the 0.15 seat);
        // axis y ~2.55 world.
        turretPivot: [0.15, 2.03, -1.374], gunPivot: [-0.065, 0.52, 0.55],
        barrelLenM: 3.30, barrelRadM: 0.034,
        // Best-protected IFV in class: modular composite + ERA-ready flanks.
        glacis: [45, 160, 220], lower: [45, 130, 160], side: [40, 90, 140],
        skirt: [50, 150, 350], rear: 30, roof: 35,
        tw: 0.95, tFrontZ: 0.95, tRearZ: -1.26, tH: 0.62,
        cheek: [60, 140, 180], tSide: [45, 90, 120], tRear: 35, tRoof: 30,
        mantlet: [70, 140, 180], loader: false,
      });
      // UNMANNED TURRET: all three crew live in the hull (driver front on
      // the turret side of the bow, gunner+commander mid-hull) — a turret
      // hit must not resolve as a crew kill. Replaces modernArmor's default
      // turret-seated gunner/commander boxes.
      a.crew = [
        cbox('driver', [0.25, 0.62, 1.30], [0.95, 1.85, 2.30]),
        cbox('gunner', [-0.15, 0.62, -0.55], [0.75, 1.90, 0.55]),
        cbox('commander', [-0.95, 0.62, -0.55], [-0.15, 1.90, 0.55]),
      ];
      // Hit-box truth for the offset ring (modernArmor centers it on x 0).
      offsetTurretRing(a, 0.15);
      return a;
    })(),
    visual: {
      // Bundeswehr NATO 3-tone (bronzegruen base, teerschwarz/lederbraun)
      scheme: 'nato', base: '#46503c', weather: '#505a46',
      patches: ['#22251f', '#4f4030'],
      marking: 'number', number: 'Y-514', trackWidthM: 0.50, camoScale: 0.5,
    },
  },

  type89: {
    id: 'type89', name: 'Type 89 IFV', nation: 'Japan', era: 'modern', role: 'ifv',
    hp: 1450,
    enginePowerHp: 600, weightTons: 26.5, topSpeedKmh: 70, reverseSpeedKmh: 16,
    hullTraverseDegS: 46,
    terrainResistance: { hard: 0.75, medium: 0.85, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 48, gunPitchDegS: 36, gunElevationDeg: 30, gunDepressionDeg: 8,
    gun: {
      // 35 mm KDE per-shell reloads are LIVE (sim/damage.ts startReload):
      // 0.5 s bursts — the heaviest AFV autocannon round — / 18 s Jyu-MAT.
      caliberMm: 35, reloadS: 0.52, baseAccuracy: 0.30, aimTimeS: 1.4,
      soundProfile: 'kde-35',
      bloom: BLOOM_MODERN,
      shells: [
        shell('Type 89 APDS-T', 'APFSDS', 35, 112, 100, 82, 1385, { pen2000Mm: 88, reloadS: 0.52, count: 120 }),
        shell('Type 79 Jyu-MAT', 'HEAT', 153, 700, 700, 500, 130,
          { reloadS: 18, count: 6, guided: true, soundProfile: 'jyu-mat-launch' }),
        shell('35mm HEI-T', 'HE', 35, 8, 8, 78, 1175, { reloadS: 0.52, count: 280 }),
      ],
    },
    // PHOTO-CLASS build (no oracle — the War Thunder rip is REFUSED per THE
    // ONE ABSOLUTE RULE; PROGRAM-STATE queue entry). Published: 6.8 hull,
    // 3.2 wide, 2.5 high; the KDE muzzle overhangs the bow (overall 7.3).
    dims: { hullLengthM: 6.8, overallLengthM: 7.3, widthM: 3.2, heightM: 2.5 },
    armor: (() => {
      const a = modernArmor({
        hl: 3.4, hw: 1.6, inW: 0.98, floor: 0.45, trkTop: 0.95, roofY: 1.78,
        // Two-man turret seated CENTER-RIGHT (the mark's identity seat).
        turretPivot: [0.25, 1.80, -0.10], gunPivot: [-0.05, 0.30, 0.55],
        barrelLenM: 3.45, barrelRadM: 0.048,
        // Welded steel box — everything overmatched by tank guns.
        glacis: [35, 45, 45], lower: [30, 35, 35], side: [25, 25, 25],
        skirt: [10, 25, 60], rear: 20, roof: 15,
        tw: 0.78, tFrontZ: 0.85, tRearZ: -0.95, tH: 0.60,
        cheek: [35, 55, 55], tSide: [25, 30, 30], tRear: 20, tRoof: 15,
        mantlet: [40, 60, 60], loader: false,
      });
      offsetTurretRing(a, 0.25);
      return a;
    })(),
    visual: {
      // JGSDF 2-tone hard-edge (same family grammar as type10/type90)
      scheme: 'stripes', base: '#3a4739', weather: '#455245',
      patches: ['#5f4f3a', '#2d382e'],
      marking: 'number', number: '1071', trackWidthM: 0.45, camoScale: 0.5,
    },
  },

  ariete: {
    id: 'ariete', name: 'C1 Ariete Preserie', nation: 'Italy', era: 'modern', role: 'mbt',
    hp: 2150,
    enginePowerHp: 1250, weightTons: 54, topSpeedKmh: 65, reverseSpeedKmh: 25,
    hullTraverseDegS: 40,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 38, gunPitchDegS: 30, gunElevationDeg: 20, gunDepressionDeg: 9,
    gun: {
      caliberMm: 120, reloadS: 6.2, baseAccuracy: 0.29, aimTimeS: 1.7,
      bloom: BLOOM_MODERN,
      shells: [
        shell('DM33 APFSDS', 'APFSDS', 120, apfsdsPens(480)[0], apfsdsPens(480)[1], 500, 1650, { pen2000Mm: apfsdsPens(480)[2] }),
        shell('MP HEAT', 'HEAT', 120, 600, 600, 470, 1400),
        shell('120 HE', 'HE', 120, 45, 45, 560, 1000),
      ],
    },
    dims: { hullLengthM: 7.59, overallLengthM: 9.67, widthM: 3.60, heightM: 2.50 },
    armor: modernArmor({
      hl: 3.8, hw: 1.79, inW: 1.22, floor: 0.42, trkTop: 0.92, roofY: 1.47,
      turretPivot: [0, 1.48, -0.12], gunPivot: [0, 0.31, 0.72],
      barrelLenM: 5.35, barrelRadM: 0.079,
      // lightest first-rank NATO MBT — sniper, not brawler (§26.2)
      glacis: [45, 110, 140], lower: [400, 350, 500], side: [40, 70, 70],
      skirt: [15, 40, 120], rear: 35, roof: 35,
      tw: 1.25, tFrontZ: 0.92, tRearZ: -1.62, tH: 0.64,
      cheek: [420, 400, 600], tSide: [250, 260, 380], tRear: 60, tRoof: 40,
      mantlet: [300, 360, 450], loader: true,
    }),
    visual: {
      // solid NATO green + low-contrast dark olive mottle (§26.5)
      scheme: 'stripes', base: '#42503a', weather: '#4c5a44',
      patches: ['#37432f', '#2c352a'],
      marking: 'number', number: '118', trackWidthM: 0.60, camoScale: 0.6,
    },
  },

  ariete_c1: {
    id: 'ariete_c1', name: 'C1 Ariete', nation: 'Italy', era: 'modern', role: 'mbt',
    hp: 2300,
    enginePowerHp: 1270, weightTons: 56, topSpeedKmh: 63, reverseSpeedKmh: 25,
    hullTraverseDegS: 39,
    terrainResistance: { hard: 0.68, medium: 0.79, soft: 1.46 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 40, gunPitchDegS: 32, gunElevationDeg: 20, gunDepressionDeg: 9,
    gun: {
      caliberMm: 120, reloadS: 5.9, baseAccuracy: 0.28, aimTimeS: 1.6,
      bloom: BLOOM_MODERN,
      shells: [
        shell('CL3143 APFSDS', 'APFSDS', 120, apfsdsPens(560)[0], apfsdsPens(560)[1], 520, 1705, { pen2000Mm: apfsdsPens(560)[2] }),
        shell('DM12A1 HEAT-MP', 'HEAT', 120, 625, 625, 490, 1400),
        shell('DM11 HE-FRAG', 'HE', 120, 55, 55, 590, 1010),
      ],
    },
    // §5.248 ground-up true-up: published production C1 plan dimensions
    // (7.59 hull, 3.61 over skirts, 9.67 overall). The authored envelope is
    // 0.10 m taller than the 2.45 m roof datum because this round restores the
    // compressed suspension/track course and raises the supported body with it.
    dims: { hullLengthM: 7.59, overallLengthM: 9.67, widthM: 3.60, heightM: 2.55 },
    armor: modernArmor({
      // geometric FRAME params re-seated on the arrafi-print measured build
      // (profiles/italy.ts buildArieteMk); every RHAe VALUE byte-identical.
      hl: 3.8, hw: 1.80, inW: 1.22, floor: 0.50, trkTop: 1.06, roofY: 1.59,
      turretPivot: [0, 1.40, -0.10], gunPivot: [0, 0.35, 1.05],
      barrelLenM: 4.93, barrelRadM: 0.105,
      glacis: [55, 380, 520], lower: [55, 320, 430], side: [45, 110, 150],
      skirt: [45, 120, 320], rear: 40, roof: 40,
      tw: 1.28, tFrontZ: 2.12, tRearZ: -2.40, tH: 0.86,
      cheek: [560, 620, 850], tSide: [320, 380, 560], tRear: 90, tRoof: 45,
      mantlet: [420, 500, 680], loader: true, bustleAmmo: true,
    }),
    visual: {
      scheme: 'stripes', base: '#48533e', weather: '#53604a',
      patches: ['#384431', '#2c3529'], marking: 'number', number: 'C1 32',
      trackWidthM: 0.60, camoScale: 0.56,
    },
  },

  ariete_c2: {
    id: 'ariete_c2', name: 'C2 Ariete', nation: 'Italy', era: 'modern', role: 'mbt',
    hp: 2600,
    enginePowerHp: 1500, weightTons: 59, topSpeedKmh: 65, reverseSpeedKmh: 30,
    hullTraverseDegS: 42,
    terrainResistance: { hard: 0.65, medium: 0.76, soft: 1.40 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 44, gunPitchDegS: 36, gunElevationDeg: 22, gunDepressionDeg: 10,
    gun: {
      caliberMm: 120, reloadS: 5.4, baseAccuracy: 0.26, aimTimeS: 1.45,
      bloom: BLOOM_MODERN,
      shells: [
        shell('DM73 APFSDS', 'APFSDS', 120, apfsdsPens(650)[0], apfsdsPens(650)[1], 545, 1740, { pen2000Mm: apfsdsPens(650)[2] }),
        shell('DM12B HEAT-MP', 'HEAT', 120, 650, 650, 510, 1420),
        shell('DM11A1 Programmable', 'HE', 120, 65, 65, 620, 1010),
      ],
    },
    // §5.248 true-up: the AMV/C2 package rides the SAME C1 chassis (same
    // hull, same 120/44). Its 2.57 m authored envelope carries the same 0.10 m
    // course/body correction, with the remaining height in its armor package.
    dims: { hullLengthM: 7.59, overallLengthM: 9.67, widthM: 3.60, heightM: 2.57 },
    armor: modernArmor({
      // frame re-seated on the shared buildArieteMk base; RHAe VALUES
      // byte-identical (the C2 package keeps its uparmored rows).
      hl: 3.8, hw: 1.80, inW: 1.22, floor: 0.50, trkTop: 1.06, roofY: 1.59,
      turretPivot: [0, 1.40, -0.10], gunPivot: [0, 0.35, 1.05],
      barrelLenM: 4.93, barrelRadM: 0.105,
      glacis: [70, 520, 760], lower: [65, 450, 620], side: [50, 160, 240],
      skirt: [55, 230, 520], rear: 45, roof: 45,
      tw: 1.28, tFrontZ: 2.12, tRearZ: -2.40, tH: 0.86,
      cheek: [650, 760, 1050], tSide: [420, 520, 760], tRear: 110, tRoof: 55,
      mantlet: [500, 600, 820], loader: true, bustleAmmo: true,
    }),
    visual: {
      scheme: 'stripes', base: '#3f4d3b', weather: '#4b5945',
      patches: ['#2e3b2d', '#5b5140'], marking: 'number', number: 'C2 01',
      trackWidthM: 0.60, camoScale: 0.50,
    },
  },

  carro45t: {
    id: 'carro45t', name: 'Carro 45t', nation: 'Italy', era: 'cold-war', role: 'medium',
    hp: 1850,
    enginePowerHp: 850, weightTons: 45, topSpeedKmh: 55, reverseSpeedKmh: 18,
    hullTraverseDegS: 36,
    terrainResistance: { hard: 0.76, medium: 0.88, soft: 1.62 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 30, gunPitchDegS: 24, gunElevationDeg: 18, gunDepressionDeg: 8,
    gun: {
      caliberMm: 105, reloadS: 21.0, baseAccuracy: 0.31, aimTimeS: 2.0,
      // Four-round bustle magazine. The 2.5 s presentation cycle and 21 s
      // replenishment preserve the former single-shot gun's sustained output
      // while giving the Carro its intended burst-fire identity.
      autoloader: { magazineSize: 4, intraClipS: 2.5, fullReloadS: 21.0 },
      bloom: { move: 0.08, hullRot: 0.10, turret: 0.08, afterShot: 2.5 },
      shells: [
        shell('OTO 105 APDS', 'APFSDS', 105, 345, 315, 430, 1475, { pen2000Mm: 280 }),
        shell('M456 HEAT', 'HEAT', 105, 400, 400, 420, 1173),
        shell('M393 HESH', 'HE', 105, 127, 127, 520, 730),
      ],
    },
    // Paper vehicle: the spec row stays the gameplay anchor (LOW-CONF law);
    // hull/overall/width match the hlebov print within 0.3%. heightM 2.95 is
    // the registered anchor, but the print's own p95 body envelope reads
    // 2.42 (roof 2.35 + cupola 2.42; nothing between 2.55 and the bare whips
    // at 4.11) — silhouetteHeightM lets the gate compare like with like
    // (userdrops5 leo2a6 / modern2 ztz99a2 precedent).
    dims: { hullLengthM: 6.98, overallLengthM: 10.60, widthM: 3.43, heightM: 2.95,
      silhouetteHeightM: 2.42 },
    armor: modernArmor({
      // frame re-seated on the hlebov-print measured build (profiles/
      // italy.ts buildCarro45T); every RHAe VALUE byte-identical.
      hl: 3.48, hw: 1.40, inW: 1.08, floor: 0.49, trkTop: 0.94, roofY: 1.50,
      turretPivot: [0, 1.50, -0.30], gunPivot: [0, 0.40, 1.30],
      barrelLenM: 6.13, barrelRadM: 0.10,
      glacis: [80, 150, 170], lower: [65, 110, 125], side: [45, 55, 65],
      skirt: null, rear: 35, roof: 28,
      tw: 1.55, tFrontZ: 2.11, tRearZ: -1.94, tH: 0.92,
      cheek: [120, 210, 240], tSide: [80, 115, 135], tRear: 45, tRoof: 30,
      mantlet: [150, 250, 280], loader: false, bustleAmmo: true,
    }),
    visual: {
      scheme: 'solid', base: '#53604a', weather: '#5f6b55',
      patches: ['#46523e', '#6a6653'], marking: 'number', number: '45T',
      trackWidthM: 0.56, camoScale: 0.72,
    },
  },
} satisfies Readonly<Record<string, FleetTankSpec>>;

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
registerFleetSpecs(registries, Object.keys(MODERN3_SPECS), MODERN3_SPECS);
