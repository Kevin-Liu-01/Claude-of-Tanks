// Ukrainian family gameplay/spec registration. Builders remain in
// profiles/ukraine.ts; these rows clone the nearest certified combat envelope
// and apply only the typed national delta.

import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.ts';
import type { FleetDimensions, FleetTankSpec } from './specContracts.ts';
import { apfsdsPenetration, modernArmor, plate, reactivePlate, shell } from './specHelpers.ts';
import type { ArmorPlate } from './specHelpers.ts';
import { OPLOT_BM_ERA, OPLOT_BM_FRAME } from './oplotBMLayout.ts';
import { ukrainianAbramsCage } from './ukrainianDroneCage.ts';
import {
  bindFleetRegistries,
  cloneFleetVariant,
  registerFleetSpecs,
  scaleNonExternalArmor,
  stripSilhouetteDimensions,
} from './fleetSpecRegistry.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
const UKRAINE_IDS = Object.freeze([
  't64bv_donbas', 'ua_t80bv', 't80u_kursk', 't84bm_oplot_m', 'ua_m1a1', 'bm_oplot_m', 'bm_oplot_t',
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
    nation: 'Ukraine',
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
  t84bm_oplot_m: variant('t84bm_oplot_m', 't84', {
    name: 'T-84U Oplot', number: 'OPLOT', base: '#42483a', weather: '#56594a',
    patches: ['#2d3029', '#77705b', '#8a8068'], camoScale: 0.42,
    dims: { heightM: 2.285, widthM: 3.775 },
    stats: { hp: 2700, enginePowerHp: 1200, weightTons: 51.0, topSpeedKmh: 70,
      reverseSpeedKmh: 35, turretTraverseDegS: 44 },
    armorFactor: 1.12,
  }),
  bm_oplot_m: variant('bm_oplot_m', 't84', {
    name: 'T-84BM Oplot-M', number: '121', scheme: 'solid', base: '#56603f', weather: '#68704f', patches: [],
    camoScale: 0.50,
    dims: { hullLengthM: 7.075, overallLengthM: 9.72, widthM: 3.78, heightM: 2.20 },
    stats: { hp: 2750, enginePowerHp: 1200, weightTons: 51.0, topSpeedKmh: 70, reverseSpeedKmh: 30,
      turretTraverseDegS: 44 },
  }),
  bm_oplot_t: variant('bm_oplot_t', 't84', {
    name: 'T-84BM Oplot-T', number: '231', scheme: 'nato', base: '#b99c6c', weather: '#c6ab7e',
    patches: ['#7e4c37', '#5c4232', '#a17f58'], camoScale: 0.58,
    dims: { hullLengthM: 7.075, overallLengthM: 9.72, widthM: 3.78, heightM: 2.20 },
    stats: { hp: 2750, enginePowerHp: 1200, weightTons: 51.5, topSpeedKmh: 70, reverseSpeedKmh: 30,
      turretTraverseDegS: 44 },
  }),
  ua_m1a1: variant('ua_m1a1', 'm1a1ha', {
    name: 'M1A1 SA (Ukraine)', number: 'UA M1', base: '#55594b', weather: '#69695a',
    patches: ['#393c34', '#77705b', '#82755c'], camoScale: 0.55,
    stats: { hp: 2450, weightTons: 64.0, topSpeedKmh: 65 },
  }),
} satisfies Record<string, FleetTankSpec>;

// The T-84U Oplot (this id's build until release 262 was named the Oplot-M) keeps its own ammunition and cycle
// rather than the inherited T-84 values.
{
  const spec = UKRAINE_SPECS.t84bm_oplot_m;
  // Owner-requested 10% larger chassis; the turret retains its local size.
  const originalHullLength=spec.dims.hullLengthM;
  spec.dims.hullLengthM*=1.10;spec.dims.widthM*=1.10;
  spec.dims.overallLengthM+=originalHullLength*.05;spec.dims.heightM+=.142;
  spec.armor.turretPivot=spec.armor.turretPivot.map(v=>v*1.10) as [number,number,number];
  for(const plate of spec.armor.hullPlates)plate.verts=plate.verts.map(p=>p.map(v=>v*1.10) as [number,number,number]);

  spec.armor.hullPlates.push(
    reactivePlate('ua_t84_oplot_m_hull_era', 'front', {
      keReduction: 0.24, ceFlatMm: 500,
    }),
  );
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
  for (const id of ['bm_oplot_m', 'bm_oplot_t'] as const) {
    const spec = UKRAINE_SPECS[id];
    const frame = modernArmor({
      hl: 3.5375, hw: 1.70, inW: 1.06, floor: 0.44, trkTop: 1.07, roofY: 1.455,
      turretPivot: [...OPLOT_BM_FRAME.turret], gunPivot: [...OPLOT_BM_FRAME.gun],
      barrelLenM: OPLOT_BM_FRAME.barrelM, barrelRadM: OPLOT_BM_FRAME.barrelR,
      glacis: [500, 560, 650], lower: [100, 140, 160], side: [80, 95, 110], skirt: [10, 12, 12],
      rear: 45, roof: 40, tw: 1.50, tFrontZ: 1.78, tRearZ: -2.26, tH: 0.70,
      cheek: [650, 620, 700], tSide: [300, 340, 400], tRear: 60, tRoof: 45, mantlet: [350, 400, 450],
      bustleAmmo: true,
    });
    frame.hullPlates.push(
      era(OPLOT_BM_ERA.glacis, [-1.10, 1.20, 3.10], [1.10, 1.20, 3.10], [-1.10, 1.42, 2.62], DUPLET),
      era(OPLOT_BM_ERA.skirtL, [1.89, 0.98, -1.90], [1.89, 0.98, 3.00], [1.89, 1.42, -1.90], DUPLET_SKIRT),
      era(OPLOT_BM_ERA.skirtR, [-1.89, 0.98, 3.00], [-1.89, 0.98, -1.90], [-1.89, 1.42, 3.00], DUPLET_SKIRT),
    );
    frame.turretPlates.push(
      era(OPLOT_BM_ERA.turretL, [0.37, 0.08, 1.80], [1.50, 0.08, 1.30], [0.37, 0.60, 1.80], DUPLET),
      era(OPLOT_BM_ERA.turretR, [-1.50, 0.08, 1.30], [-0.37, 0.08, 1.80], [-1.50, 0.60, 1.30], DUPLET),
      era(OPLOT_BM_ERA.flankL, [1.54, 0.06, -0.60], [1.50, 0.06, 0.90], [1.54, 0.62, -0.60], DUPLET),
      era(OPLOT_BM_ERA.flankR, [-1.50, 0.06, 0.90], [-1.54, 0.06, -0.60], [-1.50, 0.62, 0.90], DUPLET),
    );
    spec.armor = frame;
    spec.visual.trackWidthM = 0.58;
    if (id === 'bm_oplot_t') spec.visual.insignia = 'th-flag';
    spec.gunElevationDeg = 14;
    spec.gunDepressionDeg = 5;
    spec.gun.reloadS = 6.3;
    spec.gun.baseAccuracy = 0.31;
    spec.gun.aimTimeS = 1.8;
    spec.gun.shells = [
      shell('BTA-4 APFSDS', 'APFSDS', 125, 840, 780, 545, 1780, { pen2000Mm: 710, count: 18 }),
      shell('3BK29M HEAT', 'HEAT', 125, 700, 700, 490, 905, { count: 10 }),
      shell('3OF26 HE-Frag', 'HE', 125, 50, 50, 600, 850, { count: 12 }),
      shell('Kombat ATGM', 'HEAT', 125, 800, 800, 520, 350, {
        pen2000Mm: 800, guided: true, guidanceTurnRateRadS: 0.62, reloadS: 8.0, count: 6, launcherTubes: 0,
        soundProfile: 'arkan-launch',
      }),
    ];
  }
}

UKRAINE_SPECS.ua_m1a1.armor.droneScreens = ukrainianAbramsCage();
registerFleetSpecs(registries, UKRAINE_IDS, UKRAINE_SPECS);
