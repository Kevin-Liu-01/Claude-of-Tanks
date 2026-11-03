// The Australian Army line (release 269; the owner, 2026-11-02: "flesh out south african and australian tank trees", "no
// senntinnel please"; Main's ruling the same day, ~/cot-lanes/sa-aus-trees-269-evidence/PROPOSAL.md): the tanks and
// tracked vehicles Australia fielded after the Centurion, each with its own kit (docs/references/tanks/<id>.md;
// profiles/australia.ts builds the M113s and the Redback, the Leopard AS1 and the two Abrams on their families). Combat
// data from published figures (the Army, Wikipedia, RM Sotheby's, Army Recognition, Hanwha), rounds and armour at a
// peer's footing where no published figure exists, as each comment says.
import './m41Specs.ts';
import './aresApcXSpecs.ts';
import './denmarkSpecs.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { modernArmor } from './specHelpers.ts';
import { m113Datums, type M113Mark } from './m113Datums.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);

const australian = (id: string, donor: string, name: string, era: 'cold-war' | 'modern', role: string) => {
  const spec = cloneFleetVariant(registries.tankSpecs, id, donor, { name, nation: 'Australia', era, role });
  // (each vehicle's own gun depression is measured on its build: tools/gun-depression-sweep.mjs)
  for (const key of ['balancePeerOf', 'publicVisualFallback', 'label', 'roster', 'variantOf', 'gunPitchByYawDeg'] as const) delete spec[key];
  stripSilhouetteDimensions(spec.dims);
  return spec;
};

// The Australian Army's disruptive pattern: olive, brown and black in broad patches (every service photograph since the
// 1990s); and the RAAC's olive drab of the 1970s and 1980s
const ausDisruptive = (number: string) => ({ scheme: 'blotch' as const, base: '#5d5a3c', weather: '#686545',
  patches: ['#6e5236', '#262620'], marking: 'number' as const, number, camoScale: 0.55, patchK: 2.2 });
const raacOliveDrab = (number: string) => ({ scheme: 'solid' as const, base: '#55573a', weather: '#606244', patches: [] as string[],
  marking: 'number' as const, number, camoScale: 0.55 });

// ---------------------------------------------------------------------------------------------------- M113s --
// The aluminium M113A1 hull (4.863 x 2.686 m, 0.43 m clearance; 12-38 mm) on the build's datums (profiles/m113.ts)
const m113Armor = (mark: M113Mark, turret: { tw: number; tFrontZ: number; tRearZ: number; tH: number }, barrelLenM: number, barrelRadM: number) => {
  const D = m113Datums(mark);
  const as4 = mark === 'as4';
  return modernArmor({
    hl: D.length / 2, hw: 1.27, inW: 0.93, floor: 0.43, trkTop: 0.74, roofY: 1.86,
    turretPivot: [0, 1.86, D.ringZ], gunPivot: [mark === 'as4' ? 0.22 : 0, mark === 'fsv' ? 0.28 : 0.26, mark === 'as4' ? 0.56 : 0.72],
    barrelLenM, barrelRadM,
    glacis: as4 ? [70, 70, 110] : [38, 38, 38], lower: as4 ? [50, 50, 80] : [32, 32, 32], side: as4 ? [60, 60, 100] : [44, 44, 44],
    skirt: null, rear: 32, roof: 25, ...turret,
    cheek: mark === 'fsv' ? [32, 32, 32] : mark === 'mrv' ? [25, 25, 25] : [30, 30, 40], tSide: [16, 16, 16],
    tRear: 12, tRoof: 10, mantlet: mark === 'fsv' ? [32, 32, 32] : [25, 25, 25],
  });
};
const m113Mobility = (weightTons: number, hp: number, kmh: number) =>
  ({ weightTons, enginePowerHp: hp, topSpeedKmh: kmh, reverseSpeedKmh: 14, hullTraverseDegS: 55 });
// the 76 mm short guns' rounds: HESH and HE (no armour-piercing round: the Saladin's L5A1 and the Scorpion's L23A1)
const lowVelocity76 = (hesh: string, he: string) => [
  { name: hesh, type: 'HE', caliberMm: 76, pen100Mm: 110, pen1000Mm: 110, pen2000Mm: 110, dmg: 320, velocityMps: 533, moduleDmg: 90, tracer: 'HE' },
  { name: he, type: 'HE', caliberMm: 76, pen100Mm: 20, pen1000Mm: 20, pen2000Mm: 20, dmg: 260, velocityMps: 520, moduleDmg: 70, tracer: 'HE' },
];

// The M113A1 FSV (15 converted at Bandiana from 1970; six to Vietnam in 1971; reserve to 1986): the Saladin's turret and
// 76 mm L5A1, 4.86 x 2.69 x 2.78 m to the cupola, 11.9 t, the GM 6V53 of 212 hp (RM Sotheby's)
const m113a1_fsv = australian('m113a1_fsv', 'm41a3', 'M113A1 FSV', 'cold-war', 'light');
Object.assign(m113a1_fsv.dims, { hullLengthM: 4.86, overallLengthM: 5.62, widthM: 2.69, heightM: 2.78 });
Object.assign(m113a1_fsv, { hp: 900, ...m113Mobility(11.9, 212, 64) });
m113a1_fsv.armor = m113Armor('fsv', { tw: 0.80, tFrontZ: 0.76, tRearZ: -0.84, tH: 0.56 }, 1.66, 0.06);
m113a1_fsv.gun = { ...m113a1_fsv.gun, caliberMm: 76, reloadS: 5.2, baseAccuracy: 0.36, aimTimeS: 2.0,
  shells: lowVelocity76('L29 HESH', 'L24 HE') };
m113a1_fsv.visual = { ...m113a1_fsv.visual, ...raacOliveDrab('41A') };

// The M113A1 MRV (48 from 1978, withdrawn 1996): the Scorpion's turret and 76 mm L23A1, its buoyancy pods
const m113a1_mrv = australian('m113a1_mrv', 'm41a3', 'M113A1 MRV', 'cold-war', 'light');
Object.assign(m113a1_mrv.dims, { hullLengthM: 4.86, overallLengthM: 5.36, widthM: 2.95, heightM: 2.62 });
Object.assign(m113a1_mrv, { hp: 900, ...m113Mobility(12.5, 212, 62) });
m113a1_mrv.armor = m113Armor('mrv', { tw: 0.80, tFrontZ: 0.80, tRearZ: -1.10, tH: 0.50 }, 1.42, 0.055);
m113a1_mrv.gun = { ...m113a1_mrv.gun, caliberMm: 76, reloadS: 5.0, baseAccuracy: 0.34, aimTimeS: 1.9,
  shells: lowVelocity76('L32 HESH', 'L24 HE') };
m113a1_mrv.visual = { ...m113a1_mrv.visual, ...raacOliveDrab('21B') };

// The M113AS4 (340 from 2007): the hull stretched 0.666 m, the MTU 6V199 of 350 hp, 18 t, ceramic appliqué, the Tenix
// turret's 12.7 mm M2 (the Ares APC's precedent at II)
const m113as4 = australian('m113as4', 'ares_apc', 'M113AS4', 'modern', 'ifv');
Object.assign(m113as4.dims, { hullLengthM: 5.53, overallLengthM: 6.05, widthM: 2.69, heightM: 2.60 });
Object.assign(m113as4, { hp: 1300, ...m113Mobility(18, 350, 65) });
m113as4.armor = m113Armor('as4', { tw: 0.66, tFrontZ: 0.70, tRearZ: -0.66, tH: 0.46 }, 1.10, 0.03);
m113as4.visual = { ...m113as4.visual, ...ausDisruptive('22A') };

// ------------------------------------------------------------------------------------------------- Leopard AS1 --
// 90 gun tanks, 1976-2007 (103 with the bridgelayers and recovery vehicles): a Leopard 1A3 with the welded spaced turret
// and the Belgian SABCA fire control with its laser rangefinder; the 105 mm L7A3, the MTU MB 838 of 830 PS, 42.4 t,
// 65 km/h; 7.090 m of hull, 9.543 m over the gun, 3.370 m wide, 2.764 m to the top (armedconflicts.com; Wikipedia). On the
// Danish line's welded-turret build ('as1' mark); its fire control quicker to lay than the 1A3 DK's optical rangefinder.
const leopard_as1 = australian('leopard_as1', 'leo1a3dk', 'Leopard AS1', 'cold-war', 'mbt');
Object.assign(leopard_as1.dims, { hullLengthM: 7.09, overallLengthM: 9.543, widthM: 3.37, heightM: 2.764 });
Object.assign(leopard_as1, { weightTons: 42.4, enginePowerHp: 830, topSpeedKmh: 65 });
leopard_as1.gun = { ...leopard_as1.gun, baseAccuracy: +(leopard_as1.gun.baseAccuracy * 0.95).toFixed(3),
  aimTimeS: +(leopard_as1.gun.aimTimeS * 0.92).toFixed(2) };
// (the Danish flag goes; Australia's kangaroo is the country's own insignia)
leopard_as1.visual = { ...leopard_as1.visual, ...ausDisruptive('27') };
delete leopard_as1.visual.insignia;

registerFleetSpecs(registries, ['m113a1_fsv', 'm113a1_mrv', 'm113as4', 'leopard_as1'],
  { m113a1_fsv, m113a1_mrv, m113as4, leopard_as1 });
