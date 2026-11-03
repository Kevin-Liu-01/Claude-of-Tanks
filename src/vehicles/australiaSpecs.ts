// The Australian Army line (release 269; the owner, 2026-11-02: "flesh out south african and australian tank trees", "no
// senntinnel please"; Main's ruling the same day, ~/cot-lanes/sa-aus-trees-269-evidence/PROPOSAL.md): the tanks and
// tracked vehicles Australia fielded after the Centurion, each with its own kit (docs/references/tanks/<id>.md;
// profiles/australia.ts builds the M113s and the Redback, the Leopard AS1 and the two Abrams on their families). Combat
// data from published figures (the Army, Wikipedia, RM Sotheby's, Army Recognition, Hanwha), rounds and armour at a
// peer's footing where no published figure exists, as each comment says.
import './m41Specs.ts';
import './aresApcXSpecs.ts';
import './denmarkSpecs.ts';
import './ifvReplicaSpecs.ts';
import './abramsSourceXSpecs.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { modernArmor } from './specHelpers.ts';
import { m113Datums, type M113Mark } from './m113Datums.ts';
import { ABRAMS_SOURCE_X_MEASUREMENTS } from './abramsSourceXDatums.ts';
import { REDBACK } from './redbackDatums.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);

const australian = (id: string, donor: string, name: string, era: 'cold-war' | 'modern', role: string) => {
  const spec = cloneFleetVariant(registries.tankSpecs, id, donor, { name, nation: 'Australia', era, role });
  // (each vehicle's own gun depression is measured on its build: tools/gun-depression-sweep.mjs)
  for (const key of ['balancePeerOf', 'publicVisualFallback', 'label', 'roster', 'variantOf', 'gunPitchByYawDeg'] as const) delete spec[key];
  stripSilhouetteDimensions(spec.dims);
  return spec;
};

// The Australian Army's disruptive pattern: a tan base under olive and black in broad patches (the Abrams, AS1, AS4 and
// Redback service photographs since the 1990s); and the RAAC's olive drab of the 1970s and 1980s (the Centurion Mk 5/1's coat)
const ausDisruptive = (number: string) => ({ scheme: 'blotch' as const, base: '#8a7656', weather: '#95825f',
  patches: ['#57593c', '#262620'], marking: 'number' as const, number, camoScale: 0.55, patchK: 2.2 });
const raacOliveDrab = (number: string) => ({ scheme: 'solid' as const, base: '#5a5c30', weather: '#696b3d', patches: [] as string[],
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

// ------------------------------------------------------------------------------------------------- AS21 Redback --
// 129 ordered (December 2023; Hanwha, Geelong; deliveries from 2027): the EOS/Elbit T2000 turret with the 30 mm Mk44S, a
// MAG 58 and two Spike LR2, Iron Fist active protection, the EOS R400 station; the MTU of 1,000 hp, the Allison X1100,
// Soucy composite rubber tracks, in-arm hydropneumatics; 42 t; 8.8 m over the gun, 3.6 m wide, 3.8 m high (Hanwha; Janes
// 7.9 x 3.64 x 3.75 m). On the Puma S1's footing (VI: the 30 mm, the Spike, the 43 t; its LAND 400 rival the KF41 at V).
const redback = australian('redback', 'puma_s1', 'AS21 Redback', 'modern', 'ifv');
// as built (redbackDatums.ts): the 7.9 m hull, 8.37 m over the rear step frames and lamp guards (the 30 mm muzzle 0.8 m
// inside the nose, as the 2021 live-fire profile shows: Hanwha's 8.8 m is not reached), 3.64 m over the appliqué
// ledges, 3.52 m to the remote station's gun (the turret roof 2.90)
Object.assign(redback.dims, { hullLengthM: 7.9, overallLengthM: 8.37, widthM: 3.64, heightM: 3.52 });
// the combat envelope on the build's own datums (the Puma's was another hull and turret), at the Puma's protection
redback.armor = modernArmor({
  hl: (REDBACK.noseZ - REDBACK.sternZ) / 2, hw: REDBACK.halfWidthM, inW: REDBACK.tubX, floor: REDBACK.bellyY, trkTop: 1.0,
  roofY: REDBACK.roofY, turretPivot: [...REDBACK.ring], gunPivot: [...REDBACK.trunnion], barrelLenM: REDBACK.barrelM, barrelRadM: 0.046,
  glacis: [285, 285, 390], lower: [210, 210, 275], side: [145, 145, 205], skirt: null, rear: 40, roof: 48,
  tw: (REDBACK.turret.leftX - REDBACK.turret.rightX) / 2, tFrontZ: REDBACK.turret.noseZ, tRearZ: REDBACK.turret.rearZ,
  tH: REDBACK.turret.roofY, cheek: [265, 265, 350], tSide: [165, 165, 245], tRear: 50, tRoof: 44, mantlet: [285, 285, 370],
});
Object.assign(redback, { hp: 2700, weightTons: 42, enginePowerHp: 1000, topSpeedKmh: 65, reverseSpeedKmh: 30,
  protectionSuite: { hardKillAps: true, softKillAps: false } });
// its two Spike LR2 (the Puma's MELLS is the same family)
redback.gun = { ...redback.gun, shells: redback.gun.shells.map((shell) => (shell.type === 'HEAT' ? { ...shell, name: 'Spike LR2' } : shell)) };
redback.visual = { ...redback.visual, ...ausDisruptive('31A') };

// ------------------------------------------------------------------------------------------------------ Abrams --
// Australia fires tungsten, never depleted uranium: GD-OTS's 120 mm KEW-A2 APFSDS-T (the 2008 contract), with the M830A1
// multipurpose round and the M908 obstacle-reduction round; KEW-A2's penetration at the M829A1's footing
const kewA2 = { name: 'KEW-A2 APFSDS', type: 'APFSDS', caliberMm: 120, pen100Mm: 740, pen1000Mm: 680, pen2000Mm: 615,
  dmg: 520, velocityMps: 1680, moduleDmg: 120, tracer: 'APFSDS' } as const;
const ausAbramsShells = (base: typeof TANK_SPECS[string]['gun']['shells']) => [
  { ...base.find((s) => s.type === 'APFSDS')!, ...kewA2 },
  ...base.filter((s) => s.type !== 'APFSDS'),
];

// The M1A1 AIM SA (59 from 2006-07, 1st Armoured Regiment; retired 2024-26): a rebuilt US Army M1A1 to the AIM standard
// with export armour (no depleted-uranium layer), the AGT1500 of 1,500 hp, about 61 t (the M1A2 "about five tonnes
// heavier", Asian Military Review 2024); the Australian kit on the plain M1A1 build: the TMAPU on the bustle rack, the
// longer two-tier rack, call-sign plates, the kangaroo and the disruptive three-tone (profiles/abramsAus.ts)
const m1a1_aim_sa_aus = australian('m1a1_aim_sa_aus', 'm1a1', 'M1A1 AIM SA', 'modern', 'mbt');
Object.assign(m1a1_aim_sa_aus.dims, { hullLengthM: 7.92, overallLengthM: 9.77, widthM: 3.66, heightM: 2.44 });
Object.assign(m1a1_aim_sa_aus, { hp: 2400, weightTons: 61.3, enginePowerHp: 1500, topSpeedKmh: 67, reverseSpeedKmh: 25 });
m1a1_aim_sa_aus.gun = { ...m1a1_aim_sa_aus.gun, reloadS: 6.2, baseAccuracy: 0.31, aimTimeS: 1.80,
  shells: ausAbramsShells(m1a1_aim_sa_aus.gun.shells.map((s) => s.type === 'HEAT'
    ? { ...s, name: 'M830A1 MPAT', pen100Mm: 600, pen1000Mm: 600, velocityMps: 1400 } : s)) };
m1a1_aim_sa_aus.visual = { ...m1a1_aim_sa_aus.visual, ...ausDisruptive('21B') };

// The M1A2 SEPv3 (75 ordered under LAND 907 Phase 2, deliveries from 2024): new SEPv3 turrets on rebuilt hulls, the
// CROWS-LP, Trophy "fitted for future installation" and no ARAT (the 2024-26 photographs: the stock skirts and turret
// flanks, empty Trophy brackets); 66 t. The US SEPv3's study build with its 'mounts' fit (profiles/abramsSourceX.ts);
// its ARAT banks go from the armour, its width back to the stock skirts'
const m1a2_sepv3_aus = australian('m1a2_sepv3_aus', 'm1a2_abrams_sepv3', 'M1A2 SEPv3 (Aus)', 'modern', 'mbt');
Object.assign(m1a2_sepv3_aus.dims, { hullLengthM: ABRAMS_SOURCE_X_MEASUREMENTS.structuralHullLengthM,
  overallLengthM: ABRAMS_SOURCE_X_MEASUREMENTS.overallLengthM, widthM: ABRAMS_SOURCE_X_MEASUREMENTS.standardWidthM, heightM: 3.18 });
m1a2_sepv3_aus.armor = { ...m1a2_sepv3_aus.armor,
  hullPlates: m1a2_sepv3_aus.armor.hullPlates.filter((plate) => plate.kind !== 'era'),
  turretPlates: m1a2_sepv3_aus.armor.turretPlates.filter((plate) => plate.kind !== 'era') };
Object.assign(m1a2_sepv3_aus, { hp: 2650, weightTons: 66, enginePowerHp: 1500, topSpeedKmh: 67, reverseSpeedKmh: 25 });
m1a2_sepv3_aus.gun = { ...m1a2_sepv3_aus.gun, shells: ausAbramsShells(m1a2_sepv3_aus.gun.shells) };
m1a2_sepv3_aus.visual = { ...m1a2_sepv3_aus.visual, ...ausDisruptive('42A') };
delete m1a2_sepv3_aus.sourceStudyStatus;

registerFleetSpecs(registries, ['m113a1_fsv', 'm113a1_mrv', 'm113as4', 'leopard_as1', 'redback', 'm1a1_aim_sa_aus', 'm1a2_sepv3_aus'],
  { m113a1_fsv, m113a1_mrv, m113as4, leopard_as1, redback, m1a1_aim_sa_aus, m1a2_sepv3_aus });
