import {applyEscortFieldKitArmor} from './escortFieldKitArmor.ts';
import {ESCORT_FIELD_KITS} from './escortFieldKitLayout.ts';
// AFV/IFV registrations.
//
// Runtime vehicles are first-party procedural constructions in profiles/afvFamily.ts, inheriting
// complete certified hull/suspension rigs and publishing their own gameplay
// identity here.
//
// §5.248 IFV WAVE (2026-08-17): GROUND-UP print-measured ids joined the
// lane — bmp3, upior (new), marder1a3, m3a3_bradley. Their full spec rows
// live below with the modern3-pattern local armor mirror; the builders are
// original constructions in profiles/afvFamily.ts authored from
// docs/references/vertex/<id>.json. §5.304 OWNER ORDER (verbatim): "keep our
// BMPT terminator 2, but remove the BMPT-72 Terminator 2" — the ground-up
// `bmpt` id is REMOVED (spec row, builder, tier, labels, markings, tool REG
// rows); the `bmpt_terminator2` clone stays the roster's Terminator
// (hash-frozen 1c7d8fbc at removal). §5.302/§5.306: marder1a3 and
// m3a3_bradley revert to their pre-wave hulls/bases per owner order — see
// their rows.

import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.ts';
import {
  shell,
  modernArmor as ifvArmor,
  reactivePlate,
  type ShellSpec,
} from './specHelpers.ts';
import type {
  AimBloom,
  FleetDimensions,
  FleetGunSpec,
  FleetTankSpec,
} from './specContracts.ts';
import { bindFleetRegistries, registerFleetSpecs } from './fleetSpecRegistry.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);

const AFV_FAMILY_IDS = Object.freeze([
  'bmp3_rok',
  'ua_m2a3_bradley',
  'bmpt_terminator2',
  'bwp1',
  'marder1a3',
  'm3a3_bradley',
  // §5.248 ground-up wave (bmpt removed by §5.304 owner order — the
  // bmpt_terminator2 clone is the roster's Terminator)
  'bmp3',
  'upior',
  // §5.363 owner order — the Terminator on a T-90 hull (new id, tier 10)
  'bmpt_t90',
  // 267 — the original Ob'yekt 199 "Ramka" Terminator (2009-2013 standard) on the T-72 X hull (new id)
  'bmpt_terminator',
] as const);

type AFVStatOverrides = Partial<Pick<FleetTankSpec,
  | 'hp'
  | 'enginePowerHp'
  | 'weightTons'
  | 'topSpeedKmh'
  | 'reverseSpeedKmh'
  | 'hullTraverseDegS'
  | 'turretTraverseDegS'
  | 'gunPitchDegS'
  | 'gunElevationDeg'
  | 'gunDepressionDeg'
>>;

interface AFVVariantOptions {
  name: string;
  nation: string;
  number: string;
  base: string;
  weather: string;
  patches: string[];
  dims?: Partial<FleetDimensions>;
  trackWidthM?: number;
  stats?: AFVStatOverrides;
  gun?: Partial<FleetGunSpec>;
  shells?: ShellSpec[];
  scheme?: string;
  camoScale?: number;
}

function variant(id: string, donorId: string, o: AFVVariantOptions): FleetTankSpec {
  const donor = registries.tankSpecs[donorId];
  if (!donor) throw new Error(`AFV family donor missing: ${donorId}`);
  const spec = structuredClone(donor);
  spec.id = id;
  spec.name = o.name;
  spec.nation = o.nation;
  spec.era = 'modern';
  spec.role = 'ifv';
  spec.variantOf = donorId;
  delete spec.community;
  Object.assign(spec, o.stats || {});
  if (o.dims) spec.dims = { ...spec.dims, ...o.dims };
  if (o.gun) spec.gun = { ...spec.gun, ...o.gun };
  if (o.shells) spec.gun.shells = o.shells;
  spec.visual = {
    ...spec.visual,
    scheme: o.scheme || 'digital',
    base: o.base,
    weather: o.weather,
    patches: o.patches,
    marking: 'number',
    number: o.number,
    camoScale: o.camoScale ?? 0.50,
    trackWidthM: o.trackWidthM || spec.visual.trackWidthM,
  };
  return spec;
}

type Penetration = number | [number, number, number];

const ap = (
  name: string,
  caliberMm: number,
  pen: Penetration,
  damage: number,
  velocityMps: number,
  count: number,
  reloadS = 0.42,
): ShellSpec => ({
  name, type: 'APFSDS', caliberMm,
  pen100Mm: Array.isArray(pen) ? pen[0] : Math.round(pen * 1.10),
  pen1000Mm: Array.isArray(pen) ? pen[1] : Math.round(pen * 1.04),
  pen2000Mm: Array.isArray(pen) ? pen[2] : pen, dmg: damage,
  moduleDmg: caliberMm, tracer: 'APFSDS', velocityMps, count, reloadS,
});
const heat = (
  name: string,
  caliberMm: number,
  pen: number,
  damage: number,
  velocityMps: number,
  count: number,
  reloadS: number,
  soundProfile: string,
  /** launcher tubes modelled for the round (0 = gun-launched); the load is at least one round per tube (2026-09-18) */
  launcherTubes = 0,
): ShellSpec =>
  shell(name, 'HEAT', caliberMm, pen, pen, damage, velocityMps, {
    pen2000Mm: pen, count, reloadS, guided: true, soundProfile, launcherTubes,
  });
const he = (
  name: string,
  caliberMm: number,
  damage: number,
  velocityMps: number,
  count: number,
  reloadS = 0.42,
  soundProfile?: string,
): ShellSpec => ({
  name, type: 'HE', caliberMm, pen100Mm: 8, pen1000Mm: 8, pen2000Mm: 8,
  dmg: damage, moduleDmg: caliberMm, tracer: 'HE', velocityMps, count, reloadS,
  soundProfile,
});

const BLOOM_IFV: AimBloom = { move: 0.06, hullRot: 0.08, turret: 0.06, afterShot: 2.2 };

const AFV_FAMILY_SPECS: Record<string, FleetTankSpec> = {
  bmp3_rok: variant('bmp3_rok', 'bmp2', {
    name: 'BMP-3 (ROK)', nation: 'South Korea', number: 'ROK 3',
    base: '#465341', weather: '#5e6753', patches: ['#2d352c', '#69604b', '#81765b'],
    dims: { hullLengthM: 7.14, overallLengthM: 7.20, widthM: 3.20, heightM: 2.40,
      silhouetteHullLengthM: 6.53, silhouetteOverallLengthM: 6.74,
      silhouetteWidthM: 3.20, silhouetteHeightM: 2.62 },
    trackWidthM: 0.38,
    stats: { hp: 1550, enginePowerHp: 500, weightTons: 18.7, topSpeedKmh: 70,
      reverseSpeedKmh: 20, hullTraverseDegS: 48, turretTraverseDegS: 52, gunPitchDegS: 38 },
    gun: { caliberMm: 30, reloadS: 0.36, baseAccuracy: 0.29, aimTimeS: 1.35,
      soundProfile: '2a72' },
    shells: [
      ap('3UBR11 APFSDS', 30, [128, 116, 104], 58, 1120, 180, 0.36),
      { ...heat('9M117M1 Arkan', 100, 750, 470, 240.5, 8, 2.4, 'arkan-launch', 0), reloadGroup: '2a70' },
      { ...he('3UOF19 HE-FRAG', 100, 340, 355, 22, 4.0, 'bmp3-100mm'), reloadGroup: '2a70' },
    ],
  }),
  ua_m2a3_bradley: variant('ua_m2a3_bradley', 'm2a2_bradley', {
    name: 'M2A3 Bradley (Ukraine)', nation: 'Ukraine', number: 'UA B3',
    base: '#4c5142', weather: '#666956', patches: ['#30352d', '#625b46', '#77705a'],
    dims: { hullLengthM: 6.55, overallLengthM: 6.55, widthM: 3.61, heightM: 3.60,
      silhouetteHullLengthM: 6.58, silhouetteOverallLengthM: 6.62,
      silhouetteWidthM: 3.56, silhouetteHeightM: 3.09 },
    stats: { hp: 1950, weightTons: 34.3, topSpeedKmh: 58, reverseSpeedKmh: 20,
      hullTraverseDegS: 40 },
    gun: { reloadS: 0.42, soundProfile: 'm242-bushmaster' },
    shells: [
      ap('M919 APFSDS-T', 25, [142, 128, 116], 64, 1345, 225, 0.42),
      heat('BGM-71E TOW-2A', 152, 900, 560, 195, 7, 2.6, 'tow-launch', 2),
      he('M792 HEI-T', 25, 56, 1100, 300, 0.42),
    ],
  }),
  bmpt_terminator2: variant('bmpt_terminator2', 't72b3m_2022', {
    name: 'BMPT Terminator 2', nation: 'Russia', number: 'BMPT-2',
    // The previous digital field peaked in pale sage/khaki. Under the
    // garage key those tones made the ERA, engine covers and station armor
    // look like unpainted replacement parts. Keep the same three-tone
    // language, but inside the deeper Russian factory-olive family.
    base: '#35452f', weather: '#3f4d36', patches: ['#243128', '#4d4a37', '#5a523e'],
    dims: { hullLengthM: 7.20, overallLengthM: 7.20, widthM: 3.59, heightM: 3.33,
      silhouetteHullLengthM: 6.99, silhouetteOverallLengthM: 7.52,
      silhouetteWidthM: 3.59, silhouetteHeightM: 2.56 },
    trackWidthM: 0.58,
    stats: { hp: 2700, enginePowerHp: 1000, weightTons: 44.0, topSpeedKmh: 60,
      reverseSpeedKmh: 18, hullTraverseDegS: 34, turretTraverseDegS: 58, gunPitchDegS: 45,
      gunElevationDeg: 45, gunDepressionDeg: 5 },
    // OWNER ORDER (2026-08-17): "2 shooting holes for both its barrels ...
    // with a super fast reload". muzzles = the twin 2A42 tips' recoil-local
    // axes (tubes authored at x +-0.16 in addTerminatorStation) — the
    // factory's fallback-bore pass seats one dark mouth PER tip (opt-in
    // knob, absent-param byte-identical fleet-wide). reloadS 0.34 -> 0.30:
    // the fleet's fastest autocannon convention was marder1a3's 20 mm at
    // 0.20; the twin-plant Terminator trades some cycle rate for heavier fire.
    gun: { caliberMm: 30, reloadS: 0.30, baseAccuracy: 0.27, aimTimeS: 1.25,
      soundProfile: 'twin-2a42',
      muzzles: [{ x: -0.16, y: 0 }, { x: 0.16, y: 0 }] },
    shells: [
      ap('3UBR8 APDS', 30, [118, 106, 94], 52, 1120, 425, 0.30),
      heat('9M120-1 Ataka-T', 130, 850, 540, 357.5, 4, 2.5, 'ataka-launch', 4),
      he('3UOF8 HE-I', 30, 48, 960, 425, 0.30),
    ],
  }),
  bwp1: variant('bwp1', 'bmp2', {
    name: 'BWP-1 (Bojowy Wóz Piechoty 1)', nation: 'Poland', number: 'BWP-1',
    base: '#3f4a3e', weather: '#535d4d', patches: ['#28312b', '#5d5948', '#706750'],
    // 267 round 2: the as-built envelope of the BMP-1 hull with the appliqué and the RCWS-30 (the 30 mm muzzle stays
    // inside the bow; height to the station's head, whips excluded)
    dims: { hullLengthM: 6.76, overallLengthM: 6.76, widthM: 3.05, heightM: 2.60,
      silhouetteHullLengthM: 6.76, silhouetteOverallLengthM: 6.76,
      silhouetteWidthM: 3.05, silhouetteHeightM: 2.60 },
    trackWidthM: 0.44,
    stats: { hp: 1850, enginePowerHp: 720, weightTons: 32.0, topSpeedKmh: 68,
      reverseSpeedKmh: 28, hullTraverseDegS: 48, turretTraverseDegS: 60, gunPitchDegS: 46 },
    gun: { caliberMm: 30, reloadS: 0.32, baseAccuracy: 0.26, aimTimeS: 1.25,
      soundProfile: 'mk30-2' },
    shells: [
      ap('MK30 APFSDS-T', 30, [158, 144, 130], 62, 1385, 220, 0.32),
      heat('Spike-LR2', 152, 850, 580, 117, 4, 2.6, 'spike-launch', 1),
      he('30 mm ABM', 30, 60, 1100, 220, 0.32),
    ],
  }),

  // -------------------------------------------------------------------------
  // §5.248 GROUND-UP WAVE — print-measured full spec rows (no donor cloning).
  // -------------------------------------------------------------------------

  marder1a3: {
    // Marder 1A3, the Bundeswehr's tall-hull IFV — 20 mm MK20 in the small
    // two-man turret, MILAN on the mount, rear ramp. §5.302 OWNER ORDER:
    // "now completely revert our marder hull while preserving its new
    // turret" — the pre-§5.286 Bradley-donor hull returns (buildBradley +
    // A3 rails); the §5.269 cast turret with the external MK20 carriage is
    // preserved and re-seated. Print marder1a3_arrafi.glb stays fused/
    // suspect (rip-poster account history) — PHOTOS GOVERN (§B7 class).
    id: 'marder1a3', name: 'Marder 1A3', nation: 'Germany', era: 'modern', role: 'ifv',
    hp: 1250,
    enginePowerHp: 600, weightTons: 33.5, topSpeedKmh: 65, reverseSpeedKmh: 17,
    hullTraverseDegS: 50,
    terrainResistance: { hard: 0.75, medium: 0.85, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 50, gunPitchDegS: 40, gunElevationDeg: 45, gunDepressionDeg: 12,
    gun: {
      // MK20 Rh202 belt bursts are LIVE per-shell reloads; MILAN pays its
      // full rail time.
      caliberMm: 20, reloadS: 0.20, baseAccuracy: 0.30, aimTimeS: 1.30,
      soundProfile: 'rh202',
      bloom: BLOOM_IFV,
      shells: [
        shell('DM63 APDS-T', 'APFSDS', 20, 72, 64, 32, 1100, { pen2000Mm: 56, reloadS: 0.20, count: 500 }),
        shell('MILAN 2', 'HEAT', 115, 720, 720, 450, 130,
          { reloadS: 2.3, count: 4, guided: true, soundProfile: 'milan-launch', launcherTubes: 1 }),
        shell('DM81 HEI-T', 'HE', 20, 6, 6, 30, 1045, { reloadS: 0.20, count: 750 }),
      ],
    },
    // Published Marder 1A3 data: 6.88 hull (gun never passes the bow —
    // overall = hull), 3.38 over the appliqué, 3.02 to the sight crown.
    // §5.302 hull revert: the silhouette* rows return with the pre-§5.286
    // Bradley-donor hull (hull-side honest-measured dims; heightM stays on
    // the preserved turret's sight-crown publication).
    dims: { hullLengthM: 6.88, overallLengthM: 6.88, widthM: 3.38, heightM: 3.02,
      silhouetteHullLengthM: 6.39, silhouetteOverallLengthM: 6.41,
      silhouetteWidthM: 3.38, silhouetteHeightM: 2.85 },
    armor: ifvArmor({
      // §5.302 reverted-hull envelope (m2a2 family datum — the Bradley donor
      // hull the order restores): roof 1.90, ring station (0.18, -0.05) at
      // 1.895 carrying the PRESERVED §5.269 cast turret + external MK20
      // carriage; turret-side values stay on the wave's print-measured band.
      hl: 3.27, hw: 1.64, inW: 0.95, floor: 0.45, trkTop: 0.95, roofY: 1.90,
      turretPivot: [0.18, 1.895, -0.05], gunPivot: [0, 0.78, 0.26],
      barrelLenM: 2.55, barrelRadM: 0.026,
      glacis: [30, 45, 75], lower: [25, 32, 45], side: [20, 35, 60],
      skirt: [15, 25, 45], rear: 15, roof: 12,
      tw: 0.75, tFrontZ: 0.80, tRearZ: -0.75, tH: 0.60,
      cheek: [35, 55, 80], tSide: [25, 40, 60], tRear: 15, tRoof: 10,
      mantlet: [35, 55, 80],
    }),
    visual: {
      // Bundeswehr NATO 3-tone
      scheme: 'stripes', base: '#46503f', weather: '#57604b',
      patches: ['#28302a', '#5f5643'], marking: 'number', number: 'Y-224',
      trackWidthM: 0.45, camoScale: 0.50,
    },
  },

  m3a3_bradley: {
    // M3A3 Bradley CFV — the two-man scout configuration. §5.306 OWNER
    // ORDER: "revert our m3a3 bradley CFV except add the extra equipment we
    // added and detailing and armor" — the pre-§5.286 buildBradley base
    // returns and the wave's equipment suite (TOW twin-box, ISU, CIV drum,
    // bustle, glacis appliqué, coax) re-seats on it. Print
    // m3a3_bradley_sipriv.glb is a rigged lowpoly (bind-pose vertex reads
    // are scattered — the browser gate poses it correctly). 269 (owner: "redesign the m3a3 bradley turret"): that print,
    // the owner's low_poly_m3a3_bradley.glb, loads assembled under three's GLTFLoader in Node (its loose parts are the
    // TOW rounds and a launch tube modelled beside the hull); the A3 turret is measured from it and the Ukrainian M2A3
    // (profiles/bradleyA3Turret.ts).
    id: 'm3a3_bradley', name: 'M3A3 Bradley CFV', nation: 'USA', era: 'modern', role: 'ifv',
    // Tier X reconnaissance support: materially lower durability than the
    // T-90-based Terminator, paid back through fast acquisition, a modern
    // M919 belt and the fleet's strongest Bradley TOW channel.
    hp: 2300,
    enginePowerHp: 600, weightTons: 34.4, topSpeedKmh: 61, reverseSpeedKmh: 20,
    hullTraverseDegS: 44,
    terrainResistance: { hard: 0.75, medium: 0.85, soft: 1.4 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 60, gunPitchDegS: 40, gunElevationDeg: 30, gunDepressionDeg: 9,
    // Preserve full front/side depression. Only the aft hatch sector needs a mechanical stop, shared by game and Gallery.
    // 269 (the A3 turret on the A2 shell and trunnion, the gun line 7.3 cm higher; tools/gun-depression-sweep.mjs): the
    // front quarter keeps full depression with no mount conflict, and only the raised troop roof aft holds a stop from 160.
    gunPitchByYawDeg: [[0, -9], [158, -9], [161, -7.7], [162, -7.4], [166, -7.4], [180, -7.8]],
    gun: {
      caliberMm: 25, reloadS: 0.33, baseAccuracy: 0.25, aimTimeS: 1.05,
      soundProfile: 'm242-bushmaster',
      bloom: BLOOM_IFV,
      shells: [
        shell('M919 APFSDS-T', 'APFSDS', 25, 185, 170, 70, 1345,
          { pen2000Mm: 155, reloadS: 0.33, count: 300 }),
        // 269 (owner: "a launcher aonn its other sdie"): a second twin launcher on the turret's right, four ready tubes
        // (launcherTubes 2 -> 4); the ten rounds carried are unchanged
        shell('BGM-71F TOW-2B', 'HEAT', 152, 1050, 1050, 700, 195,
          { reloadS: 2.8, count: 10, guided: true, soundProfile: 'tow-launch', launcherTubes: 4 }),
        shell('M792 HEI-T', 'HE', 25, 8, 8, 62, 1100,
          { pen2000Mm: 8, reloadS: 0.33, count: 300 }),
      ],
    },
    // §5.306 base revert: the pre-§5.286 declared dims return with the
    // buildBradley base (silhouette* rows are that base's honest-measured
    // values; re-trued against the hybrid build at gate time).
    // 2026-11-06 (270, Main: "The spec describes what we build"): silhouetteHeightM 3.05 -> 3.41, the drawn height as the
    // gate's dims row measures it (procedural-fidelity.html heightM: body top 3.4098 to roof-fittings top 3.4177 at the
    // gate's width fit). The 269 A3 turret and the owner's order of 2026-11-05 ("make the m3a3 special by having a munch of
    // extra optics tech and a launcher aonn its other sdie and a bunch of extra boxes") raised it: the LRAS3-pattern
    // sensor head over the gunner's hatch, the camera pods and the rear-corner posts stand over the 3.05 m roof line.
    dims: { hullLengthM: 6.55, overallLengthM: 6.55, widthM: 3.61, heightM: 3.73,
      silhouetteHullLengthM: 6.71, silhouetteOverallLengthM: 6.70,
      silhouetteWidthM: 3.61, silhouetteHeightM: 3.41 },
    armor: ifvArmor({
      // 268: the shared hull measured from the owner's source (modern3.ts BRADLEY_HULL): hw 1.64 -> 1.70, trkTop 0.95 ->
      // 1.16, roofY 1.90 -> 2.06; the A3 ring on the M2's datum (modern3.ts BRADLEY_TURRET_RING, was
      // [0.04, 1.895, -0.36]); the M242 to the M2's muzzle at world z 2.37 (barrelLenM
      // 2.30 -> 1.99, the drawn tube 2.42 -> 1.99).
      // 269: the A3 turret on the family's measured A2 shell (profiles/bradleyA3Turret.ts): the M242 on the A2's trunnion,
      // 0.305 m under the 0.77 roof as both A3 sources carry it (gunPivot [-0.06, 0.392, 0.78] -> [-0.06, 0.465, 0.60]),
      // to the same muzzle at world z 2.37 (barrelLenM 1.99 -> 2.17); the turret envelope is the shell's, as the M2A2's
      // (tw 0.85 -> 0.98, tFrontZ 1.00 -> 1.15, tRearZ -1.10 -> -1.20, tH 0.90 -> 0.77).
      hl: 3.27, hw: 1.70, inW: 0.95, floor: 0.45, trkTop: 1.16, roofY: 2.06,
      turretPivot: [-0.14, 2.06, -0.40], gunPivot: [-0.06, 0.465, 0.60],
      barrelLenM: 2.17, barrelRadM: 0.038,
      glacis: [45, 70, 80], lower: [45, 60, 60], side: [35, 40, 45],
      skirt: [25, 35, 70], rear: 25, roof: 20,
      tw: 0.98, tFrontZ: 1.15, tRearZ: -1.20, tH: 0.77,
      cheek: [40, 70, 80], tSide: [35, 40, 45], tRear: 25, tRoof: 20,
      mantlet: [45, 70, 80],
    }),
    visual: {
      scheme: 'nato', base: '#4a553d', weather: '#535f46',
      patches: ['#232620', '#4b3b2d'], marking: 'number', number: 'C-30',
      trackWidthM: 0.53, camoScale: 0.50,
    },
  },

  bmp3: {
    // NEW GROUND-UP ID: the BMP-3 — low boat hull with the distinctive
    // raked bow, REAR engine + raised rear troop deck, 100 mm 2A70 +
    // 30 mm 2A72 twin plant in the low two-man turret. Built against the
    // fully semantic bmp3_rok_42manako print (docs/references/vertex/
    // bmp3.json; print +3.3% long in the width-anchored frame — features
    // author on the print's lines z-mapped x0.9684 into the PUBLISHED 7.14
    // envelope, pub-dims sovereignty).
    // NATION: Russia (§5.249 ASK-OWNER default; the print's ROK livery is
    // noted — a ROK-marked variant remains available as bmp3_rok).
    id: 'bmp3', name: 'BMP-3', nation: 'Russia', era: 'modern', role: 'ifv',
    hp: 1450,
    enginePowerHp: 500, weightTons: 18.7, topSpeedKmh: 70, reverseSpeedKmh: 20,
    hullTraverseDegS: 48,
    terrainResistance: { hard: 0.72, medium: 0.85, soft: 1.45 },
    pivotStyle: 'pivot',
    turretTraverseDegS: 50, gunPitchDegS: 38, gunElevationDeg: 60, gunDepressionDeg: 6,
    gun: {
      // 2A72 belt is the rapid plant; the 2A70 pays real rail/loader time
      // on the ATGM and HE-FRAG natures (per-shell reloads are LIVE).
      caliberMm: 30, reloadS: 0.34, baseAccuracy: 0.30, aimTimeS: 1.35,
      soundProfile: '2a72',
      bloom: BLOOM_IFV,
      shells: [
        shell('3UBR11 APFSDS-T', 'APFSDS', 30, 112, 102, 55, 1120, { pen2000Mm: 92, reloadS: 0.34, count: 200 }),
        shell('9M117M1 Arkan', 'HEAT', 100, 750, 750, 500, 240.5,
          { reloadS: 2.4, count: 8, guided: true, soundProfile: 'arkan-launch', launcherTubes: 0, reloadGroup: '2a70' }),
        shell('3UOF19 HE-FRAG', 'HE', 100, 12, 12, 360, 250,
          { reloadS: 4.0, count: 22, soundProfile: 'bmp3-100mm', reloadGroup: '2a70' }),
      ],
    },
    // Published: 7.14 hull; the 2A70 muzzle overhangs the bow ~0.27 in the
    // print but published overall is hull-total 7.14 (IFV convention) —
    // the print's own overhang is honored in the build (overall reads the
    // gun; dims grace covers the published datum).
    dims: { hullLengthM: 7.14, overallLengthM: 7.14, widthM: 3.23, heightM: 2.40 },
    armor: ifvArmor({
      hl: 3.57, hw: 1.615, inW: 1.00, floor: 0.29, trkTop: 1.20, roofY: 1.84,
      turretPivot: [0, 1.85, 0.24], gunPivot: [0.05, 0.28, 0.65],
      barrelLenM: 2.95, barrelRadM: 0.058,
      glacis: [35, 45, 60], lower: [30, 35, 40], side: [25, 28, 30],
      skirt: null, rear: 20, roof: 10,
      tw: 1.15, tFrontZ: 1.10, tRearZ: -1.10, tH: 0.57,
      cheek: [45, 60, 80], tSide: [30, 35, 40], tRear: 20, tRoof: 12,
      mantlet: [45, 60, 80],
    }),
    visual: {
      scheme: 'stripes', base: '#44503a', weather: '#525c45',
      patches: ['#2a331f', '#5c5a41'], marking: 'number', number: '331',
      trackWidthM: 0.37, camoScale: 0.55,
    },
  },

  upior: {
    // Owner's original Polish concept, rebuilt in October with a raised
    // angular IFV turret, fitted side cassettes and open cage screens.
    id: 'upior', name: 'Upiór IFV', nation: 'Poland', era: 'modern', role: 'ifv',
    hp: 1700,
    enginePowerHp: 800, weightTons: 30.0, topSpeedKmh: 75, reverseSpeedKmh: 30,
    hullTraverseDegS: 52,
    terrainResistance: { hard: 0.70, medium: 0.82, soft: 1.45 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 55, gunPitchDegS: 40, gunElevationDeg: 35, gunDepressionDeg: 7,
    gun: {
      caliberMm: 30, reloadS: 0.30, baseAccuracy: 0.28, aimTimeS: 1.30,
      soundProfile: '2a72',
      bloom: BLOOM_IFV,
      shells: [
        shell('3UBR11 APFSDS-T', 'APFSDS', 30, 146, 132, 58, 1120, { pen2000Mm: 118, reloadS: 0.30, count: 220 }),
        shell('Spike-LR', 'HEAT', 152, 800, 800, 550, 117,
          { reloadS: 2.6, count: 4, guided: true, soundProfile: 'spike-launch', launcherTubes: 1 }),
        shell('3UOF8 HE-I', 'HE', 30, 8, 8, 52, 960, { reloadS: 0.30, count: 300 }),
      ],
    },
    // The rear ring station retains the established forward hull orientation.
    dims: { hullLengthM: 5.15, overallLengthM: 5.30, widthM: 3.69, heightM: 2.98 },
    armor: ifvArmor({
      // Print envelope (width-anchored frame IS the authoring frame): deck
      // crown 1.60, skirts to ±1.50, BMP-2-class turret ring 1.47 at
      // [x -0.10, z -0.74], roof 1.91, tower crown 2.55.
      hl: 2.555, hw: 1.50, inW: 0.85, floor: 0.28, trkTop: 0.83, roofY: 1.58,
      turretPivot: [-0.10, 1.64, -0.74], gunPivot: [0, 0.35, 0.76],
      barrelLenM: 2.40, barrelRadM: 0.035,
      glacis: [40, 90, 140], lower: [35, 60, 90], side: [30, 55, 90],
      skirt: [25, 45, 120], rear: 25, roof: 15,
      tw: 1.02, tFrontZ: 0.88, tRearZ: -1.04, tH: 0.62,
      cheek: [45, 80, 120], tSide: [30, 50, 80], tRear: 25, tRoof: 15,
      mantlet: [50, 90, 130],
    }),
    visual: {
      scheme: 'digital', base: '#3d4639', weather: '#4b5344',
      patches: ['#262e26', '#565243', '#6a6252'], marking: 'number', number: 'W-01',
      trackWidthM: 0.44, camoScale: 0.42,
    },
  },

  // -------------------------------------------------------------------------
  // §5.363 OWNER ORDER (verbatim): "add a bmp terminator 2 where it has an
  // even crazier beefier two autocannon turret with even more equipment and
  // decorations and even some era on a t90_1992 hull". NEW id on the certified
  // T-90A donor (spec clone t90a_2004; geometry T90_PROFILES.t90a_2004 + the beefed
  // station in profiles/afvFamily.ts). FALSE-0/photo-class — never gated.
  // Tier 10 (one over bmpt_terminator2's 9 — the beefier variant).
  // -------------------------------------------------------------------------
};

// The CFV package exposes independent glacis, skirt, cheek and turret-side
// reactive arrays. Bind each exact visual cluster to a gameplay plate so a
// hit consumes only the contacted package and removes its rendered tiles.
AFV_FAMILY_SPECS.m3a3_bradley.armor.hullPlates.push(
  reactivePlate('m3a3_glacis_R', 'front'),
  reactivePlate('m3a3_glacis_L', 'front'),
  reactivePlate('m3a3_side_R', 'right'),
  reactivePlate('m3a3_side_L', 'left'),
);
AFV_FAMILY_SPECS.m3a3_bradley.armor.turretPlates.push(
  reactivePlate('m3a3_turret_cheek_R', 'front'),
  reactivePlate('m3a3_turret_cheek_L', 'front'),
  reactivePlate('m3a3_turret_side_R', 'right'),
  reactivePlate('m3a3_turret_side_L', 'left'),
);

AFV_FAMILY_SPECS.bmpt_t90 = variant('bmpt_t90', 't90a_2004', {
  name: 'BMPT T-90', nation: 'Russia', number: 'BMPT-90',
  base: '#414c39', weather: '#565f48', patches: ['#2b3329', '#615a43', '#6f6852'],
  // Published stance: the T-90A donor's 6.86 hull IS the vehicle; overall
  // reads the twin 30 mm tips past the bow (measured tip +4.109 / stern
  // −3.455). heightM publishes the solid station crown (pano head cap at
  // 2.90 — whips are mask-filtered, §D whip-rough law). silhouette* rows
  // are honest node-measured AABBs (tools/tmp-bmpt-t90-measure.mjs, packet).
  dims: { hullLengthM: 6.86, overallLengthM: 7.56, widthM: 3.78, heightM: 2.90,
    silhouetteHullLengthM: 6.90, silhouetteOverallLengthM: 7.56,
    silhouetteWidthM: 3.78, silhouetteHeightM: 2.90 },
  trackWidthM: 0.58,
  // bmpt_terminator2's frame up a notch for the T-90 hull: +150 hp pool,
  // T-90M-class 1130 hp plant, 48 t with the full skirt/station ERA suite.
  stats: { hp: 2950, enginePowerHp: 1130, weightTons: 48.0, topSpeedKmh: 60,
    reverseSpeedKmh: 18, hullTraverseDegS: 32, turretTraverseDegS: 60, gunPitchDegS: 48,
    gunElevationDeg: 45, gunDepressionDeg: 5 },
  // §5.330 knob: muzzles = the twin 2A42 tips' recoil-local axes (tubes
  // authored at x ±0.20 in addTerminatorT90Station — wider than the clone's
  // ±0.16 for the beefier read); one bore assembly per tip (§B3.1 ×2).
  // reloadS 0.28 keeps the T-90 station distinct from the 0.30 s clone.
  gun: { caliberMm: 30, reloadS: 0.28, baseAccuracy: 0.26, aimTimeS: 1.20,
    soundProfile: 'twin-2a42',
    muzzles: [{ x: -0.20, y: 0 }, { x: 0.20, y: 0 }] },
  shells: [
    ap('3UBR8 APDS', 30, [122, 110, 98], 50, 1120, 500, 0.28),
    heat('9M120-1 Ataka-T', 130, 850, 560, 357.5, 8, 2.6, 'ataka-launch', 8),
    he('3UOF8 HE-I', 30, 46, 960, 500, 0.28),
  ],
});

// The Terminator 2 station replaces the donor tank turret and has no turret
// ERA of its own; retaining the T-72B3M cheek plates created invisible armor.
// The ring and trunnion of the BMPT-72 station (profiles/bmpt72Station.ts on the T-72B3M ring, 267); the physical frame
// is synchronized with its hull donor in fleetRenewalSpecs.ts.
AFV_FAMILY_SPECS.bmpt_terminator2.armor.turretPivot = [0, 1.52948397398, 0.1143146502203];
AFV_FAMILY_SPECS.bmpt_terminator2.armor.gunPivot = [0, 0.92, 0.10];
AFV_FAMILY_SPECS.bmpt_terminator2.armor.turretPlates =
  AFV_FAMILY_SPECS.bmpt_terminator2.armor.turretPlates.filter(
    (plate) => plate.kind !== 'era',
  );

// The larger BMPT T-90 station visibly carries both front-cheek and flank
// reactive fields. T-90A intentionally omits Proryv's flank kit, so restore
// only those two gameplay zones for this station; the anatomy receipt seats
// them to the station's own authored cassette faces.
const bmptT90FlankEra = registries.tankSpecs.t90am?.armor.turretPlates
  .filter((plate) => plate.kind === 'era' && /side/i.test(plate.name))
  .map((plate) => structuredClone(plate)) || [];
AFV_FAMILY_SPECS.bmpt_t90.armor.turretPlates.push(...bmptT90FlankEra);

// 267 (lane bmpt-family-267; the owner: "lets actually make a BMPT Terminator and a BMPT T-90"): the original Ob'yekt 199
// "Ramka" of 2009-2013, also Kazakhstan's (docs/references/tanks/bmpt_terminator.md), on the T-72 X hull
// (profiles/bmptTerminator.ts; spec clone of the T-72B3M obr. 2016, whose hull it draws). Its combat frame sits between
// the BMPT-72 (bmpt_terminator2) and the 2018 BMPT T-90 (bmpt_t90), an earlier, lighter standard than the T-90's:
// - hp 2820: between 2700 and 2950, over the BMPT-72 for its Kontakt-5 glacis and the full skirt and side-box wall;
// - its own V-92S2 at 1000 hp (published) on 47 t (published 47-48 t), 60/18 km/h, hull 33 and turret 59 deg/s between
//   the two, the cannons' +45/-5;
// - the twin 2A42 at 0.29 s (between 0.30 and 0.28), accuracy 0.265 and aim 1.22 s between the two; the same 3UBR8 APDS
//   and 3UOF8 HE-I natures as bmpt_t90 at in-between penetration (123/111/99 between the installed 125/112/100 and
//   122/110/98) and damage, 850 rounds in all (425 + 425, published);
// - four 9M120-1 Ataka-T, one per open tube (guided-load rule), damage 520 (the installed 540 and 500) and 2.55 s.
// The real vehicle's two bow AG-17D were hull equipment only, as on bmpt_t90 (no secondary-weapon row); the build leaves
// them off at the owner's ruling (round 5), so nothing in the combat data changes.
AFV_FAMILY_SPECS.bmpt_terminator = variant('bmpt_terminator', 't72b3m_2022', {
  name: 'BMPT Terminator', nation: 'Russia', number: '01',
  // the Engineering Technologies 2012 vehicle's three-tone (photos 03-12): large olive and brown blots on sand
  base: '#a6936a', weather: '#b3a27a', patches: ['#5f6748', '#7b6142'],
  scheme: 'nato', camoScale: 0.60,
  // the T-72's 6.95 m hull; overall, width and height the build's measured envelope without whips (the guns never pass
  // the bow: the stern slat cage to the front fenders' noses 7.55, over the side boxes' handles 4.10, the panoramic
  // sight's lid at the published 3.44)
  dims: { hullLengthM: 6.95, overallLengthM: 7.55, widthM: 4.10, heightM: 3.44,
    silhouetteHullLengthM: 7.55, silhouetteOverallLengthM: 7.55,
    silhouetteWidthM: 4.10, silhouetteHeightM: 3.44 },
  trackWidthM: 0.58,
  stats: { hp: 2820, enginePowerHp: 1000, weightTons: 47.0, topSpeedKmh: 60,
    reverseSpeedKmh: 18, hullTraverseDegS: 33, turretTraverseDegS: 59, gunPitchDegS: 46,
    gunElevationDeg: 45, gunDepressionDeg: 5 },
  // the twin 2A42 bores at x +-0.15 in the cradle (profiles/bmptTerminatorStation.ts RAMKA_BARREL_X)
  gun: { caliberMm: 30, reloadS: 0.29, baseAccuracy: 0.265, aimTimeS: 1.22,
    soundProfile: 'twin-2a42',
    muzzles: [{ x: -0.15, y: 0 }, { x: 0.15, y: 0 }] },
  shells: [
    ap('3UBR8 APDS', 30, [123, 111, 99], 51, 1120, 425, 0.29),
    heat('9M120-1 Ataka-T', 130, 850, 520, 357.5, 4, 2.55, 'ataka-launch', 4),
    he('3UOF8 HE-I', 30, 47, 960, 425, 0.29),
  ],
});
// The Ramka station has no turret ERA: drop the donor turret's reactive plates (as on bmpt_terminator2). Its yaw axis
// and trunnion are the station's (bmptTerminatorStation.ts RAMKA_RING, RAMKA_TRUNNION) and its barrel the twin 2A42's
// (RAMKA_MUZZLE_Z from the trunnion; the envelope round both box brakes).
AFV_FAMILY_SPECS.bmpt_terminator.armor.turretPivot = [0, 1.5295, -0.40];
AFV_FAMILY_SPECS.bmpt_terminator.armor.gunPivot = [0, 0.95, -0.90];
AFV_FAMILY_SPECS.bmpt_terminator.armor.gunBarrel.lengthM = 2.711;
AFV_FAMILY_SPECS.bmpt_terminator.armor.gunBarrel.radiusM = 0.10;
AFV_FAMILY_SPECS.bmpt_terminator.armor.turretPlates =
  AFV_FAMILY_SPECS.bmpt_terminator.armor.turretPlates.filter((plate) => plate.kind !== 'era');

applyEscortFieldKitArmor(AFV_FAMILY_SPECS.upior,ESCORT_FIELD_KITS.upior);

// 267: the ROK BMP-3 stands on the BMP-3 hull (profiles/afvFamily.ts buildBMP3ROK): its ring moves to the bmp3 ring
// (was the BMP-2 donor's [0, 1.66, 0.03]); the trunnion is its own turret's, as drawn and as the combat rig already
// records it (was the donor's [0, 0.285, 0.55]). The barrel datum stays.
AFV_FAMILY_SPECS.bmp3_rok.armor.turretPivot = [...AFV_FAMILY_SPECS.bmp3.armor.turretPivot];
AFV_FAMILY_SPECS.bmp3_rok.armor.gunPivot = [0, 0.34, 0.62];
// 267 round 2: its hull plates take the BMP-3 hull's faces (bmp3's plates of the same name: the hull it draws) and keep
// their own protection (physical, KE and CE millimetres and kind), so shots meet plates where the hull is.
for (const rokPlate of AFV_FAMILY_SPECS.bmp3_rok.armor.hullPlates) {
  const bmp3Plate = AFV_FAMILY_SPECS.bmp3.armor.hullPlates.find((candidate) => candidate.name === rokPlate.name);
  if (!bmp3Plate) throw new Error(`bmp3_rok hull plate ${rokPlate.name} has no BMP-3 face`);
  rokPlate.verts = structuredClone(bmp3Plate.verts);
}
// 267: the BWP-1's RCWS-30 carries its cradle between the yoke cheeks of its strut frame (profiles/bwp1Rcws30.ts); the
// trunnion follows the drawn station (was the BMP-2 donor's [0, 0.285, 0.55]; the old turret drew it at [0, 0.40, 0.60]).
AFV_FAMILY_SPECS.bwp1.armor.gunPivot = [0, 0.55, 0.10];

registerFleetSpecs(registries, AFV_FAMILY_IDS, AFV_FAMILY_SPECS);
