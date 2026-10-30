// Ukrainian family gameplay/spec registration. Builders remain in
// profiles/ukraine.ts; these rows clone the nearest certified combat envelope
// and apply only the typed national delta.

import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.ts';
import type { FleetDimensions, FleetTankSpec } from './specContracts.ts';
import { apfsdsPenetration, modernArmor, plate, shell } from './specHelpers.ts';
import type { ArmorPlate } from './specHelpers.ts';
import type { EraProtection } from '../sim/armor.ts';
import { OPLOT_BM_ERA, OPLOT_BM_FRAME } from './oplotFlankLayout.ts';
import { ukrainianAbramsCage } from './ukrainianDroneCage.ts';
import {
  bindFleetRegistries,
  cloneFleetVariant,
  registerFleetSpecs,
  scaleNonExternalArmor,
  stripSilhouetteDimensions,
} from './fleetSpecRegistry.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
// (the PT-84s, the Polish concepts on the Oplot family's base, register with their family; their nation is Poland)
const UKRAINE_IDS = Object.freeze([
  't64bv_donbas', 'ua_t80bv', 't80u_kursk', 't84bm_oplot_m', 'ua_m1a1', 'bm_oplot_m', 'bm_oplot_t', 'pt84_orzel',
  'pt84_sokol', 'pt84_zbik',
] as const);

type UkraineStatOverrides = Partial<Pick<FleetTankSpec,
  | 'hp'
  | 'enginePowerHp'
  | 'weightTons'
  | 'topSpeedKmh'
  | 'reverseSpeedKmh'
  | 'turretTraverseDegS'
  | 'gunPitchDegS'
>>;

interface UkraineVariantOptions {
  name: string;
  nation?: string;
  number: string;
  scheme?: string;
  base?: string;
  weather?: string;
  patches?: string[];
  camoScale?: number;
  dims?: Partial<FleetDimensions>;
  stats?: UkraineStatOverrides;
  armorFactor?: number;
}

function variant(
  id: string,
  donorId: string,
  options: UkraineVariantOptions,
): FleetTankSpec {
  const spec = cloneFleetVariant(registries.tankSpecs, id, donorId, {
    name: options.name,
    nation: options.nation || 'Ukraine',
  });
  Object.assign(spec, options.stats || {});
  spec.visual = {
    ...spec.visual,
    scheme: options.scheme || 'digital',
    base: options.base || '#43503c',
    weather: options.weather || '#53604b',
    patches: options.patches || ['#2d352c', '#59604b', '#6d6650'],
    marking: 'number',
    number: options.number,
    camoScale: options.camoScale ?? 0.52,
  };
  // Ground-up Ukrainian builds own their silhouette measurements; donor gate
  // overrides describe the donor and must never transfer through the clone.
  stripSilhouetteDimensions(spec.dims);
  if (options.dims) Object.assign(spec.dims, options.dims);
  if (options.armorFactor) scaleNonExternalArmor(spec, options.armorFactor);
  return spec;
}

const UKRAINE_SPECS = {
  t64bv_donbas: variant('t64bv_donbas', 't64bv1', {
    name: 'T-64BV mod. 2017', number: 'UA 64', base: '#46503d', weather: '#5a604d',
    patches: ['#30382f', '#655f49', '#776c52'], camoScale: 0.48,
    dims: { hullLengthM: 6.54, overallLengthM: 9.23, widthM: 3.42, heightM: 2.17 },
    stats: { hp: 2050, enginePowerHp: 850, weightTons: 43.5, topSpeedKmh: 60 },
  }),
  ua_t80bv: variant('ua_t80bv', 't80bv', {
    name: 'T-80BV (Ukraine)', number: 'UA 80', base: '#38483b', weather: '#4b5848',
    patches: ['#263329', '#5c5942', '#71644b'], camoScale: 0.56,
    stats: { hp: 2150, enginePowerHp: 1100, weightTons: 44.5, topSpeedKmh: 70 },
  }),
  t80u_kursk: variant('t80u_kursk', 't80uk', {
    name: 'T-80U Kursk', number: 'KURSK', base: '#4b5039', weather: '#5c5b45',
    patches: ['#303329', '#6b634a', '#80745a'], camoScale: 0.64,
    stats: { hp: 2350, enginePowerHp: 1250, weightTons: 46.0, topSpeedKmh: 70 },
    armorFactor: 1.04,
  }),
  // Release 262 (owner 2026-10-27): this build is the T-84U Oplot, Object 478DU9 (tankLabels.ts); the id stays.
  // the 2000 Ukrainian service finish: olive with brown and black disruptive bands
  t84bm_oplot_m: variant('t84bm_oplot_m', 't84', {
    name: 'T-84U Oplot', number: 'OPLOT', scheme: 'nato', base: '#4b5636', weather: '#5d6646',
    patches: ['#6b5537', '#26281f'], camoScale: 0.48,
    // the build's measured extents (the family hull, the Kontakt-5 skirt boxes, the cupola NSVT)
    dims: { hullLengthM: 7.11, overallLengthM: 10.28, widthM: 4.38, heightM: 2.91 },
    stats: { hp: 2700, enginePowerHp: 1200, weightTons: 51.0, topSpeedKmh: 70,
      reverseSpeedKmh: 35, turretTraverseDegS: 44 },
  }),
  // its coat: the Ukrainian Army's MM-14 digital (khaki-olive with dark green, brown and light khaki), not a flat olive
  // (owner 2026-10-22: no flat single-colour stock coats; owner 2026-10-30: "oplot-m doesnt hav ea camo. why, fix")
  bm_oplot_m: variant('bm_oplot_m', 't84', {
    name: 'T-84BM Oplot-M', number: '121', scheme: 'digital', base: '#68693f', weather: '#7a7b52',
    patches: ['#39442c', '#6f563a', '#9a9268'], camoScale: 0.50,
    // the build's measured extents (geometry-gate) without external stowage, as published dimensions are given: the
    // stern drums excluded; the skirt Duplet course and the roof stations included (the published 9.72 m / 3.78 m /
    // 2.2 m are the bare tank's: bm_oplot_m.md). The silhouette hull length is the hash-pinned oracle's own P95 body
    // extent as the geometry gate measures it (its stepped stern's thin overhang falls under the band rule), never the
    // candidate's.
    dims: { hullLengthM: 7.17, overallLengthM: 10.28, widthM: 4.40, heightM: 2.96, silhouetteHullLengthM: 6.825 },
    stats: { hp: 2750, enginePowerHp: 1200, weightTons: 51.0, topSpeedKmh: 70, reverseSpeedKmh: 30,
      turretTraverseDegS: 44 },
  }),
  bm_oplot_t: variant('bm_oplot_t', 't84', {
    name: 'T-84BM Oplot-T', number: '231', scheme: 'nato', base: '#b39466', weather: '#c3a578',
    patches: ['#7e4c37', '#5c4232', '#a17f58'], camoScale: 0.58,
    dims: { hullLengthM: 7.17, overallLengthM: 10.28, widthM: 4.43, heightM: 2.97 },
    stats: { hp: 2750, enginePowerHp: 1200, weightTons: 51.5, topSpeedKmh: 70, reverseSpeedKmh: 30,
      turretTraverseDegS: 44 },
  }),
  // Release 262 (owner 2026-10-28: "make a new polish version based on this style"): a first-party Polish concept on the
  // Oplot-M's base (docs/references/concepts/pt84-orzel-20261028.json), in the Polish three-tone the Zubr family wears
  pt84_orzel: variant('pt84_orzel', 't84', {
    name: 'PT-84 Orzeł', nation: 'Poland', number: '184', scheme: 'nato', base: '#4a563b', weather: '#4a5c42',
    patches: ['#29342d', '#827458'], camoScale: 0.52,
    // the family's published hull and length (the stern drums excluded) and roof line; the width over the framed skirts
    dims: { hullLengthM: 7.17, overallLengthM: 10.28, widthM: 4.42, heightM: 2.97 },
    stats: { hp: 2750, enginePowerHp: 1200, weightTons: 52.0, topSpeedKmh: 70, reverseSpeedKmh: 30,
      turretTraverseDegS: 44 },
  }),
  // Release 262 (owner 2026-10-28: "i would like mroe based on that"): two more Polish concepts on the same base
  // (docs/references/concepts/pt84-family-20261028.json). The Sokół, the light hunter: Krata on the glacis, the cheeks and
  // the three forward skirt panels only, one low remote station and a telescopic sensor mast; the PL-01's Polish digital.
  pt84_sokol: variant('pt84_sokol', 't84', {
    name: 'PT-84 Sokół', nation: 'Poland', number: '271', scheme: 'digital', base: '#55604a', weather: '#606a52',
    patches: ['#2f3a2c', '#7d8466', '#9a9c8a'], camoScale: 0.48,
    dims: { hullLengthM: 7.17, overallLengthM: 10.28, widthM: 4.42, heightM: 2.97 },
    stats: { hp: 2550, enginePowerHp: 1200, weightTons: 49.0, topSpeedKmh: 72, reverseSpeedKmh: 32,
      turretTraverseDegS: 46 },
  }),
  // The Żbik, the assault tank: Krata-2 two-layer pillows everywhere, a dozer blade, both stations on towers,
  // searchlights and the bustle slat cage; in the urban block grey.
  pt84_zbik: variant('pt84_zbik', 't84', {
    name: 'PT-84 Żbik', nation: 'Poland', number: '311', scheme: 'nato', base: '#5d625d', weather: '#6c706a',
    patches: ['#3a3d3a', '#8a8d87', '#24262a'], camoScale: 0.50,
    dims: { hullLengthM: 7.17, overallLengthM: 10.28, widthM: 4.44, heightM: 2.97 },
    stats: { hp: 2950, enginePowerHp: 1200, weightTons: 55.5, topSpeedKmh: 64, reverseSpeedKmh: 25,
      turretTraverseDegS: 40 },
  }),
  ua_m1a1: variant('ua_m1a1', 'm1a1ha', {
    name: 'M1A1 SA (Ukraine)', number: 'UA M1', base: '#55594b', weather: '#69695a',
    patches: ['#393c34', '#77705b', '#82755c'], camoScale: 0.55,
    stats: { hp: 2450, weightTons: 64.0, topSpeedKmh: 65 },
  }),
} satisfies Record<string, FleetTankSpec>;

// The T-84U Oplot (Object 478DU9, the 2000 serial tank; release 262 rebuilds it in profiles/oplotBM.ts as the Oplot-M and
// Oplot-T's predecessor, owner 2026-10-27) on the family's installed frame, at the period protection this row carried
// (glacis 538 / 616, cheeks 616 / 672, mantlet 392 / 448, its 1.12 factor folded in), Kontakt-5 where the build carries
// it: the glacis panel at the row's 0.24 / 500, the turret front and the forward skirt boxes at the fleet's Kontakt-5
// (modern2.ts, 0.20 / 400). One seed plate per sector; the anatomy replaces each with the cassette lids.
{
  const spec = UKRAINE_SPECS.t84bm_oplot_m;
  const KONTAKT5: EraProtection = Object.freeze({ keReduction: 0.20, ceFlatMm: 400 });
  const KONTAKT5_GLACIS: EraProtection = Object.freeze({ keReduction: 0.24, ceFlatMm: 500 });
  const era = (name: string, v0: [number, number, number], v1: [number, number, number], v3: [number, number, number],
    protection: EraProtection): ArmorPlate => plate(name, 12, v0, v1, v3, { kind: 'era', era: { ...protection } });
  const frame = modernArmor({
    hl: 3.461, hw: 1.743, inW: 1.097, floor: 0.43, trkTop: 1.097, roofY: 1.497,
    turretPivot: [...OPLOT_BM_FRAME.turret], gunPivot: [...OPLOT_BM_FRAME.gun],
    barrelLenM: OPLOT_BM_FRAME.barrelM, barrelRadM: OPLOT_BM_FRAME.barrelR,
    glacis: [500, 538, 616], lower: [100, 134, 134], side: [80, 90, 90], skirt: [8, 9, 9],
    rear: 50, roof: 45, tw: 1.51, tFrontZ: 1.49, tRearZ: -2.03, tH: 0.707,
    cheek: [650, 616, 672], tSide: [300, 336, 392], tRear: 56, tRoof: 50, mantlet: [350, 392, 448],
  });
  frame.hullPlates.push(
    era(OPLOT_BM_ERA.glacis, [-1.13, 1.23, 3.03], [1.13, 1.23, 3.03], [-1.13, 1.455, 2.56], KONTAKT5_GLACIS),
    era(OPLOT_BM_ERA.skirtL, [2.02, 1.00, 0.51], [2.02, 1.00, 2.93], [2.02, 1.455, 0.51], KONTAKT5),
    era(OPLOT_BM_ERA.skirtR, [-2.02, 1.00, 2.93], [-2.02, 1.00, 0.51], [-2.02, 1.455, 2.93], KONTAKT5),
  );
  frame.turretPlates.push(
    era(OPLOT_BM_ERA.turretL, [0.42, 0.10, 1.66], [1.54, 0.10, 1.12], [0.42, 0.48, 1.66], KONTAKT5),
    era(OPLOT_BM_ERA.turretR, [-1.54, 0.10, 1.12], [-0.42, 0.10, 1.66], [-1.54, 0.48, 1.12], KONTAKT5),
  );
  spec.armor = frame;
  spec.visual.trackWidthM = 0.58;
  spec.gunElevationDeg = 14;
  spec.gunDepressionDeg = 5;
  // the KBA-3's depression by turret yaw over this build (tools/gun-depression-sweep.mjs): the same family hull as the
  // Oplot-M's, the same curve (oplotBMGun.selftest.mjs holds it)
  spec.gunPitchByYawDeg = [[0, -5], [142, -5], [149, -3.6], [152, -3.6], [154, -3.9], [159, -4.7], [162, -3.5], [163, -3.2],
    [168, -2.6], [171, -2.7], [176, -3.3], [180, -3.3]];
  spec.hp = 2800;
  spec.gun.reloadS = 6.3;
  spec.gun.baseAccuracy = 0.31;
  spec.gun.aimTimeS = 1.8;
  // Release 262 (Main's ruling on the rename): the 2000 serial tank fires the Soviet-stock rounds Ukraine held then, the
  // 3BM42 Mango (1986) and the 3BK29 HEAT, on the fleet's apfsdsPenetration scale (quoted ~500 mm at 2 km); the 3BM60U
  // and the Kombat-M of the old Oplot-M row are later than the T-84U. The 3OF26 keeps the T-84's value.
  const mango = apfsdsPenetration(500);
  Object.assign(spec.gun.shells[0], {
    name: '3BM42 Mango APFSDS', pen100Mm: mango[0], pen1000Mm: mango[1],
    pen2000Mm: mango[2], dmg: 500, velocityMps: 1715,
  });
  Object.assign(spec.gun.shells[1], {
    name: '3BK29 HEAT', pen100Mm: 630, pen1000Mm: 630, dmg: 470,
  });
  Object.assign(spec.gun.shells[2], { dmg: 570 });
}

// The T-84BM Oplot-M and its Thai export twin, the Oplot-T (release 262, tier X): their own frame
// (profiles/oplotBM.ts), Duplet built-in ERA on the turret, glacis and skirts, the KBA-3's ammunition and the
// gun-fired Kombat. Sources: KMDB/Malyshev and Ukroboronprom (crew 3, 51 t, 6TD-2E 1,200 hp, 70 km/h, 46 rounds with
// 28 in the loader, the 5 km laser-guided Kombat with its tandem warhead); the Oplot-T adds an air conditioner and an
// auxiliary power unit (Wikipedia's T-84 article, 478DU9-T; Royal Thai Army deliveries 2014-2018).
{
  const DUPLET = Object.freeze({ keReduction: 0.26, ceFlatMm: 480, antiTandem: true });
  const DUPLET_SKIRT = Object.freeze({ keReduction: 0.14, ceFlatMm: 340, antiTandem: true });
  const era = (name: string, v0: [number, number, number], v1: [number, number, number], v3: [number, number, number],
    protection: typeof DUPLET | typeof DUPLET_SKIRT): ArmorPlate =>
    plate(name, 12, v0, v1, v3, { kind: 'era', era: { ...protection } });
  // The KBA-3's depression by turret yaw over each build (tools/gun-depression-sweep.mjs, 25 mm kept, recoil included):
  // the full -5 degrees forward and abeam, held up over the unditching log and the stern drums astern, and on the
  // Oplot-T to about level over its APU on the left rear fender (oplotBMGun.selftest.mjs holds both).
  const GUN_PITCH_BY_YAW_DEG: Record<'bm_oplot_m' | 'bm_oplot_t', [number, number][]> = {
    bm_oplot_m: [[0, -5], [142, -5], [149, -3.6], [152, -3.6], [154, -3.9], [159, -4.7], [162, -3.5], [163, -3.2],
      [168, -2.6], [171, -2.7], [176, -3.3], [180, -3.3]],
    bm_oplot_t: [[0, -5], [134, -5], [135, -3.9], [136, -1.7], [137, -0.7], [138, -0.3], [142, -0.2], [153, -0.1],
      [154, -0.3], [155, -1.3], [157, -4.6], [160, -4.5], [162, -3.5], [163, -3.2], [168, -2.6], [171, -2.7], [176, -3.3],
      [180, -3.3]],
  };
  for (const id of ['bm_oplot_m', 'bm_oplot_t'] as const) {
    const spec = UKRAINE_SPECS[id];
    const frame = modernArmor({
      // the installed frame: the print at the registered uniform 4.10 (oplotFlankLayout.ts OPLOT_BM_SCALE)
      hl: 3.461, hw: 1.743, inW: 1.097, floor: 0.43, trkTop: 1.097, roofY: 1.497,
      turretPivot: [...OPLOT_BM_FRAME.turret], gunPivot: [...OPLOT_BM_FRAME.gun],
      barrelLenM: OPLOT_BM_FRAME.barrelM, barrelRadM: OPLOT_BM_FRAME.barrelR,
      glacis: [500, 560, 650], lower: [100, 140, 160], side: [80, 95, 110], skirt: [10, 12, 12],
      rear: 45, roof: 40, tw: 1.51, tFrontZ: 1.49, tRearZ: -2.03, tH: 0.707,
      cheek: [650, 620, 700], tSide: [300, 340, 400], tRear: 60, tRoof: 45, mantlet: [350, 400, 450],
      bustleAmmo: true,
    });
    frame.hullPlates.push(
      era(OPLOT_BM_ERA.glacis, [-1.13, 1.23, 3.03], [1.13, 1.23, 3.03], [-1.13, 1.455, 2.56], DUPLET),
      era(OPLOT_BM_ERA.skirtL, [2.02, 1.00, -1.86], [2.02, 1.00, 2.93], [2.02, 1.455, -1.86], DUPLET_SKIRT),
      era(OPLOT_BM_ERA.skirtR, [-2.02, 1.00, 2.93], [-2.02, 1.00, -1.86], [-2.02, 1.455, 2.93], DUPLET_SKIRT),
    );
    frame.turretPlates.push(
      era(OPLOT_BM_ERA.turretL, [0.42, 0.09, 1.865], [1.62, 0.09, 1.33], [0.42, 0.53, 1.865], DUPLET),
      era(OPLOT_BM_ERA.turretR, [-1.62, 0.09, 1.33], [-0.42, 0.09, 1.865], [-1.62, 0.53, 1.33], DUPLET),
      era(OPLOT_BM_ERA.flankL, [1.763, 0.09, -0.40], [1.763, 0.09, 1.20], [1.763, 0.575, -0.40], DUPLET),
      era(OPLOT_BM_ERA.flankR, [-1.763, 0.09, 1.20], [-1.763, 0.09, -0.40], [-1.763, 0.575, 1.20], DUPLET),
    );
    spec.armor = frame;
    spec.visual.trackWidthM = 0.58;
    if (id === 'bm_oplot_t') spec.visual.insignia = 'th-flag';
    spec.gunElevationDeg = 14;
    spec.gunDepressionDeg = 5;
    spec.gunPitchByYawDeg = GUN_PITCH_BY_YAW_DEG[id];
    spec.gun.reloadS = 6.3;
    // the 1G46M gunner's sight and the PNK-6 panoramic hunter-killer: the tier X peers' fire control (the T-90M Proryv's
    // Kalina class); the fleet's tier X MBT median (balanceAudit) reads them at 2.0, not under its floor of peers
    spec.gun.baseAccuracy = 0.30;
    spec.gun.aimTimeS = 1.63;
    // 263 (integrator): every playable gun exposes one to three ammunition channels (ammunitionFlow.selftest, the HUD's
    // three slots), and a guided channel on a gun tank is an auxiliary missile with a 2-3 s cadence. The lane's fourth
    // round, the gun-fired Kombat ATGM (guided, 8 s), fits neither, so the pair carries the fleet's 125 mm Soviet-pattern
    // set as the T-84, T-80UK and T-90M do: APFSDS, HEAT and HE as authored. A guided Kombat is owed to the Oplot lane.
    spec.gun.shells = [
      shell('BTA-4 APFSDS', 'APFSDS', 125, 840, 780, 545, 1780, { pen2000Mm: 710, count: 18 }),
      shell('3BK29M HEAT', 'HEAT', 125, 700, 700, 490, 905, { count: 10 }),
      shell('3OF26 HE-Frag', 'HE', 125, 50, 50, 600, 850, { count: 12 }),
    ];
  }
}

// The PT-84 Polish concepts (release 262): the Oplot-M's installed frame and base armour, ERAWA-2 where each build carries
// its Krata grids: a two-layer cassette short of the Duplet, no anti-tandem layer; the Żbik's Krata-2 pillows a step
// heavier. Their gun is the PT-17's: the KMDB KBM2 120 mm smoothbore in the carousel loader (Bumar-Łabędy / KMDB, MSPO
// 2017), firing the Polish Army's NATO stock, the K2PL's K279 / K280 / K281. Luch's Falarick 120 gun-launched missile
// (the Orzeł's and the Żbik's fourth round) is owed: a gun-fired guided round fits neither a gun channel nor the
// auxiliary-missile cadence (ammunitionFlow.selftest, the integrator's 263 ruling on the Oplots' Kombat).
{
  const ERAWA2: EraProtection = Object.freeze({ keReduction: 0.20, ceFlatMm: 440 });
  const ERAWA2_SKIRT: EraProtection = Object.freeze({ keReduction: 0.12, ceFlatMm: 320 });
  const KRATA2: EraProtection = Object.freeze({ keReduction: 0.24, ceFlatMm: 480 });
  const KRATA2_SKIRT: EraProtection = Object.freeze({ keReduction: 0.16, ceFlatMm: 360 });
  const era = (name: string, v0: [number, number, number], v1: [number, number, number], v3: [number, number, number],
    protection: EraProtection): ArmorPlate => plate(name, 12, v0, v1, v3, { kind: 'era', era: { ...protection } });
  interface PolishRow {
    front: EraProtection; skirt: EraProtection;
    /** where the skirt sector starts (installed z): the full run, or the Sokół's three forward panels */
    skirtZ0: number; flank: boolean; reloadS: number;
    /** the KBM2's depression by turret yaw over this build (tools/gun-depression-sweep.mjs; oplotBMGun.selftest.mjs) */
    curve: [number, number][];
  }
  const ROWS: Record<'pt84_orzel' | 'pt84_sokol' | 'pt84_zbik', PolishRow> = {
    // held up from 137 degrees, where the barrel crosses the rear skirt (its slats now, 10 cm under the deck edge); the
    // skirt sector is the five framed forward panels (262 visual bar: slats over the engine bay behind them)
    pt84_orzel: { front: ERAWA2, skirt: ERAWA2_SKIRT, skirtZ0: -0.16, flank: true, reloadS: 6.3,
      curve: [[0, -5], [137, -5], [145, -3.8], [149, -3.6], [152, -3.6], [154, -3.9], [159, -4.7], [162, -3.5],
        [163, -3.2], [168, -2.6], [171, -2.7], [176, -3.3], [180, -3.3]] },
    // the Oplot-M's curve: no framed fields aft of the three forward panels
    pt84_sokol: { front: ERAWA2, skirt: ERAWA2_SKIRT, skirtZ0: 1.19, flank: false, reloadS: 6.1,
      curve: [[0, -5], [142, -5], [149, -3.6], [152, -3.6], [154, -3.9], [159, -4.7], [162, -3.5], [163, -3.2],
        [168, -2.6], [171, -2.7], [176, -3.3], [180, -3.3]] },
    // held up from 137 degrees over the deeper Krata-2 frames of the rear skirt fields
    pt84_zbik: { front: KRATA2, skirt: KRATA2_SKIRT, skirtZ0: -2.80, flank: true, reloadS: 6.5,
      curve: [[0, -5], [137, -5], [138, -4.7], [141, -4.2], [145, -3.7], [150, -3.6], [152, -3.6], [154, -3.9],
        [159, -4.7], [162, -3.5], [163, -3.2], [168, -2.6], [171, -2.7], [176, -3.3], [180, -3.3]] },
  };
  for (const [id, row] of Object.entries(ROWS) as [keyof typeof ROWS, PolishRow][]) {
    const spec = UKRAINE_SPECS[id];
    const frame = modernArmor({
      hl: 3.461, hw: 1.743, inW: 1.097, floor: 0.43, trkTop: 1.097, roofY: 1.497,
      turretPivot: [...OPLOT_BM_FRAME.turret], gunPivot: [...OPLOT_BM_FRAME.gun],
      barrelLenM: OPLOT_BM_FRAME.barrelM, barrelRadM: OPLOT_BM_FRAME.barrelR,
      glacis: [500, 560, 650], lower: [100, 140, 160], side: [80, 95, 110], skirt: [10, 12, 12],
      rear: 45, roof: 40, tw: 1.51, tFrontZ: 1.49, tRearZ: -2.03, tH: 0.707,
      cheek: [650, 620, 700], tSide: [300, 340, 400], tRear: 60, tRoof: 45, mantlet: [350, 400, 450],
      bustleAmmo: true,
    });
    frame.hullPlates.push(
      era(OPLOT_BM_ERA.glacis, [-1.13, 1.23, 3.03], [1.13, 1.23, 3.03], [-1.13, 1.455, 2.56], row.front),
      era(OPLOT_BM_ERA.skirtL, [2.02, 1.00, row.skirtZ0], [2.02, 1.00, 2.93], [2.02, 1.455, row.skirtZ0], row.skirt),
      era(OPLOT_BM_ERA.skirtR, [-2.02, 1.00, 2.93], [-2.02, 1.00, row.skirtZ0], [-2.02, 1.455, 2.93], row.skirt),
    );
    frame.turretPlates.push(
      era(OPLOT_BM_ERA.turretL, [0.42, 0.24, 1.78], [1.62, 0.15, 1.25], [0.42, 0.53, 1.78], row.front),
      era(OPLOT_BM_ERA.turretR, [-1.62, 0.15, 1.25], [-0.42, 0.24, 1.78], [-1.62, 0.53, 1.25], row.front),
    );
    if (row.flank) frame.turretPlates.push(
      era(OPLOT_BM_ERA.flankL, [1.73, 0.09, -0.40], [1.73, 0.09, 1.20], [1.73, 0.575, -0.40], row.front),
      era(OPLOT_BM_ERA.flankR, [-1.73, 0.09, 1.20], [-1.73, 0.09, -0.40], [-1.73, 0.575, 1.20], row.front),
    );
    spec.armor = frame;
    spec.visual.trackWidthM = 0.58;
    spec.gunElevationDeg = 14;
    spec.gunDepressionDeg = 5;
    spec.gunPitchByYawDeg = row.curve;
    spec.gun.caliberMm = 120;
    spec.gun.reloadS = row.reloadS;
    // the tier X pair carry the Oplot-M's hunter-killer fire control; the tier IX Sokół the T-84U's
    spec.gun.baseAccuracy = id === 'pt84_sokol' ? 0.31 : 0.30;
    spec.gun.aimTimeS = id === 'pt84_sokol' ? 1.8 : 1.63;
    const k279 = apfsdsPenetration(700);
    spec.gun.shells = [
      shell('K279 APFSDS', 'APFSDS', 120, k279[0], k279[1], 530, 1760, { pen2000Mm: k279[2], count: 22 }),
      shell('K280 HEAT-MP', 'HEAT', 120, 610, 610, 470, 1130, { count: 12 }),
      shell('K281 HE', 'HE', 120, 45, 45, 580, 1000, { count: 12 }),
    ];
  }
}

UKRAINE_SPECS.ua_m1a1.armor.droneScreens = ukrainianAbramsCage();
registerFleetSpecs(registries, UKRAINE_IDS, UKRAINE_SPECS);
