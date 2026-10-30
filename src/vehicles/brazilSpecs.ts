// The Brazilian Army line (release 266; owner 2026-10-29: "lets build brazil, not taiwan, and flesh it out with all its
// own tanks"; Main's ruling the same day, ~/cot-lanes/brazil-line-266-evidence/PROPOSAL.md): the tanks Brazil designed,
// built or fielded, each with its own kit (docs/references/tanks/osorio_p2.md and the packets beside it;
// profiles/brazil.ts builds them). Combat data from published figures: Engesa's data sheet (Forças Terrestres 2015),
// Jane's via M. Nita (Poligon 2014), E. C. S. Bastos (2003, 2022); rounds and armour at a peer's fleet footing where no
// published figure exists, as each comment says.
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { modernArmor } from './specHelpers.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);

const brazilian = (id: string, donor: string, name: string, era: 'cold-war' | 'modern') => {
  const spec = cloneFleetVariant(registries.tankSpecs, id, donor, { name, nation: 'Brazil', era, role: 'mbt' });
  for (const key of ['balancePeerOf', 'publicVisualFallback', 'label', 'roster', 'variantOf', 'gunPitchByYawDeg'] as const) delete spec[key];
  stripSilhouetteDimensions(spec.dims);
  return spec;
};

// ------------------------------------------------------------------------------------------------- EE-T1 Osório --
// Engesa's sheet and Jane's (via Nita): 7.13 m hull, 10.10 m (120 mm) and 9.36 m (105 mm) over the gun, 3.26 m over the
// skirts, 2.89 m and 2.68 m to the sight tops (2.37 m to the roof), 43.7 t and 41.0 t, the MWM TBD 234 V12 of 1,040 hp
// through the ZF LSG 3000, 70 km/h, 45 km/h in reverse, more than 33 degrees a second of traverse, +20/-10 degrees, four
// crew. Neither prototype got its definitive armour (Bastos): the composite frontal arc "against 105 mm APFSDS" sits at
// the AMX-40's footing, its 1987 Saudi rival with the same claim and the same G1 gun.
const osorioArmor = (barrelLenM: number, barrelRadM: number) => modernArmor({
  hl: 3.565, hw: 1.50, inW: 1.00, floor: 0.46, trkTop: 0.92, roofY: 1.60,
  turretPivot: [0, 1.60, 0.40], gunPivot: [0, 0.28, 0.85], barrelLenM, barrelRadM,
  glacis: [380, 380, 480], lower: [120, 120, 150], side: [60, 60, 70], skirt: [40, 40, 120], rear: 30, roof: 30,
  tw: 1.145, tFrontZ: 1.44, tRearZ: -2.38, tH: 0.77,
  cheek: [430, 430, 620], tSide: [200, 200, 280], tRear: 45, tRoof: 35, mantlet: [340, 340, 430], loader: true,
  bustleAmmo: true,
});
const osorioMobility = {
  role: 'mbt', enginePowerHp: 1040, topSpeedKmh: 70, reverseSpeedKmh: 45,
  hullTraverseDegS: 48, turretTraverseDegS: 36, gunPitchDegS: 30, gunElevationDeg: 20, gunDepressionDeg: 10,
} as const;

// The 120 mm P.2 (the "Al Fahd" of the 1987 Saudi trials): the GIAT G1 smoothbore, the Marconi Centaur fire control with
// the stabilised SFIM VS580-19 panoramic sight, the VS580-10 and the Philips UA 9090 thermal; the French 120 mm rounds of
// its trials, at the AMX-40's footing.
const osorio_p2 = brazilian('osorio_p2', 'amx40', 'EE-T1 Osório (120)', 'cold-war');
Object.assign(osorio_p2.dims, { hullLengthM: 7.13, overallLengthM: 10.10, widthM: 3.26, heightM: 2.89 });
Object.assign(osorio_p2, { ...osorioMobility, hp: 2150, weightTons: 43.7 });
// the rounds at the shown tier's footing (no published figure for the G1's trial rounds): the IV MBT median, 2026-10-29
osorio_p2.gun = {
  ...osorio_p2.gun, caliberMm: 120, reloadS: 6.3, baseAccuracy: 0.29, aimTimeS: 1.75,
  shells: osorio_p2.gun.shells.map((shell, i) => i === 0 ? { ...shell, pen100Mm: 760, pen1000Mm: 690, pen2000Mm: 622, dmg: 510 } : shell),
};
osorio_p2.armor = osorioArmor(5.285, 0.104);
// the measured depression by yaw (tools/gun-depression-sweep.mjs, the whole gun 26 mm off its hull): the published -10
// over the front, the fender line at the front corners, the engine deck astern
osorio_p2.gunPitchByYawDeg = [[0, -10], [15, -10], [28, -8.8], [30, -8.8], [35, -8.9], [36, -8.6], [42, -7.5],
  [45, -7.5], [54, -9], [56, -9], [57, -9.1], [60, -10], [113, -10], [115, -9.6], [121, -9.1], [123, -8.5],
  [124, -8.3], [130, -7.8], [146, -4.3], [156, -2.6], [157, -2.6], [159, -0.8], [160, -0.5], [162, -0.5],
  [163, -0.7], [165, -2], [177, -2], [180, -2.5]];
osorio_p2.visual = {
  ...osorio_p2.visual,
  // the Army's coat (the CIBld tank, 2020): a dull olive with large fields of a reddish earth brown (about 35-40 %) edged
  // in a very dark green (the nato painter: patches[0] the boundary bars, patches[1] the fields); the 1983-98 plaque
  scheme: 'nato', base: '#4a5034', weather: '#555b3e', patches: ['#262c20', '#6f4026'], marking: 'number', number: '02',
  camoScale: 0.45, patchK: 1.7, trackWidthM: 0.57, insignia: 'br-cruzeiro',
};

// The 105 mm P.1 (the Army's 1986-87 homologation tank): the Royal Ordnance L7A3 and the OIP LRS-5 sights, mechanically
// linked to the gun (Forças Terrestres: poorer on the move); the 105 mm rounds at the fleet's 105 mm footing (the
// Leopard 1A5's) for the balance session to measure.
const osorio_p1 = brazilian('osorio_p1', 'amx40', 'EE-T1 Osório (105)', 'cold-war');
Object.assign(osorio_p1.dims, { hullLengthM: 7.13, overallLengthM: 9.36, widthM: 3.26, heightM: 2.68 });
Object.assign(osorio_p1, { ...osorioMobility, hp: 2050, weightTons: 41.0 });
const l7Rounds = registries.tankSpecs.leo1a5.gun.shells;
osorio_p1.gun = {
  ...osorio_p1.gun,
  caliberMm: 105, reloadS: 6.0, baseAccuracy: 0.31, aimTimeS: 1.85,
  bloom: { ...osorio_p1.gun.bloom, move: osorio_p1.gun.bloom.move * 1.15, hullRot: osorio_p1.gun.bloom.hullRot * 1.15 },
  shells: [
    // the L7's mid-1980s APFSDS at the III footing (no published figure for the Army's 1986-87 trial rounds)
    { ...l7Rounds[0], name: 'M833 APFSDS', pen100Mm: 680, pen1000Mm: 618, pen2000Mm: 556, dmg: 480 },
    { ...l7Rounds[1], name: 'M456 HEAT' },
    { ...l7Rounds[2], name: 'L35 HESH', type: 'HE' },
  ],
};
osorio_p1.armor = osorioArmor(4.545, 0.088);
// the measured depression by yaw (tools/gun-depression-sweep.mjs, the whole gun 26 mm off its hull): the published -10
// over the front, the fender line at the front corners, the engine deck astern
osorio_p1.gunPitchByYawDeg = [[0, -10], [11, -10], [24, -8.9], [27, -9], [32, -9.3], [35, -10], [36, -10],
  [41, -8.6], [42, -8.4], [45, -8.4], [51, -10], [113, -10], [115, -9.6], [130, -9.1], [135, -7.7], [142, -6],
  [143, -5.1], [144, -4.7], [152, -3.2], [157, -3], [158, -2.6], [159, -1.4], [160, -1], [162, -1], [163, -1.2],
  [164, -2.2], [169, -2.4], [176, -2.4], [180, -2.7]];
osorio_p1.visual = {
  ...osorio_p1.visual,
  // the surviving P.1 as photographed (museum 2015, Curitiba 2024): a darker, greyer earth brown with large irregular
  // near-black green fields across the full side height; the 1983-98 plaque
  scheme: 'nato', base: '#5c4f3e', weather: '#675a48', patches: ['#1c2119', '#283022'], marking: 'number', number: '01',
  camoScale: 0.45, patchK: 1.8, trackWidthM: 0.57, insignia: 'br-cruzeiro',
};

// ------------------------------------------------------------------------------------------------- MB-3 Tamoyo --
// Tanks Encyclopedia (Tamoyo 1 and 3, after Bastos' "Bernardini MB-3 Tamoyo") and Bastos 2022: the 6.5 m Bernardini hull,
// welded steel (hull front 40 mm, sides 19 mm; the Tamoyo 1's turret front 40, shield 50, sides 25 mm), torsion bars, four
// crew. The Tamoyo 1: 30 t, 8.77 m over the gun, 3.22 m wide, 2.2 m to the turret roof, the Scania DSI-14 of 500 hp through
// the M41's CD-500-3, 67 km/h, the unstabilised 90 mm BR3 (a copy of GIAT's CS Super 90 F4, L/52). The Tamoyo 3: 31 t
// unstowed, 35 t combat, 8.9 m, 3.29 m, 2.35 m, the Detroit 8V92TA of 736 hp through the CD-850-6A, 65 km/h, the 105 mm
// L7A3, the Ferranti Falcon fire control with a laser rangefinder, thermal and two-axis stabilisation, a composite and
// spaced turret front. Rounds: the French 90 mm family of the Super 90 and the L7's at the fleet's 105 mm footing.
const tamoyoArmor = (o: { ringY: number; barrelLenM: number; gunPivot: [number, number, number]; tFrontZ: number; tRearZ: number;
  tH: number; tw: number; skirt: boolean; glacis: number; lower: number; cheek: [number, number, number]; mantlet: [number, number, number];
  tSide: [number, number, number] }) => modernArmor({
  hl: 3.25, hw: 1.46, inW: 1.05, floor: 0.45, trkTop: 1.12, roofY: o.ringY,
  turretPivot: [0, o.ringY, 0.16], gunPivot: o.gunPivot, barrelLenM: o.barrelLenM, barrelRadM: 0.072,
  glacis: [o.glacis, o.glacis, o.glacis + 30], lower: [o.lower, o.lower, o.lower], side: [19, 19, 19],
  skirt: o.skirt ? [10, 10, 30] : null, rear: 19, roof: 13,
  tw: o.tw, tFrontZ: o.tFrontZ, tRearZ: o.tRearZ, tH: o.tH,
  cheek: o.cheek, tSide: o.tSide, tRear: 25, tRoof: 15, mantlet: o.mantlet, loader: true,
});

const tamoyo1 = brazilian('tamoyo1', 'm47_patton', 'MB-3 Tamoyo 1', 'cold-war');
Object.assign(tamoyo1.dims, { hullLengthM: 6.50, overallLengthM: 8.77, widthM: 3.22, heightM: 2.50 });
Object.assign(tamoyo1, {
  role: 'medium', hp: 1800, enginePowerHp: 500, weightTons: 30.0, topSpeedKmh: 67, reverseSpeedKmh: 16,
  hullTraverseDegS: 42, turretTraverseDegS: 34, gunPitchDegS: 28, gunElevationDeg: 18, gunDepressionDeg: 8,
});
const [heat90, he90] = [tamoyo1.gun.shells[1], tamoyo1.gun.shells[2]];
tamoyo1.gun = {
  ...tamoyo1.gun,
  caliberMm: 90, reloadS: 5.6, baseAccuracy: 0.31, aimTimeS: 1.9,
  shells: [
    { ...tamoyo1.gun.shells[0], name: 'OFL 90 F1 APFSDS', caliberMm: 90, pen100Mm: 500, pen1000Mm: 455, pen2000Mm: 410, dmg: 400, velocityMps: 1350 },
    { ...heat90, name: 'OCC 90 HEAT', caliberMm: 90, pen100Mm: 320, pen1000Mm: 320, dmg: 330, velocityMps: 950 },
    { ...he90, name: 'OE 90 HE', caliberMm: 90, dmg: 380, velocityMps: 750 },
  ],
};
tamoyo1.armor = tamoyoArmor({
  ringY: 1.475, barrelLenM: 4.01, gunPivot: [0, 0.315, 1.35], tFrontZ: 1.60, tRearZ: -2.05, tH: 0.72, tw: 1.12,
  skirt: true,
  glacis: 40, lower: 40, cheek: [40, 40, 40], mantlet: [50, 50, 50], tSide: [25, 25, 25],
});
// the measured depression by yaw (tools/gun-depression-sweep.mjs): the full -8 to 141 degrees, the raised engine deck astern
tamoyo1.gunPitchByYawDeg = [[0, -8], [141, -8], [142, -6.3], [143, -5.8], [146, -4.9], [147, -4.1], [148, -3.5],
  [149, -3], [155, -0.7], [163, -0.8], [165, -1.2], [166, -0.7], [170, -0.7], [174, -1.2], [180, -1.2]];
tamoyo1.visual = {
  ...tamoyo1.visual,
  // the Army's two-tone of the trials (Vesp's profile, the CIBld tank): a dark olive and an orange earth brown in large
  // hard-edged fields of about equal area, the same swoops on the decks as on the sides; the 1983-98 plaque
  scheme: 'nato', base: '#454d31', weather: '#515a3c', patches: ['#70502e', '#634528'], marking: 'number', number: '11',
  camoScale: 0.42, patchK: 1.7, trackWidthM: 0.53, insignia: 'br-cruzeiro',
};

const tamoyo3 = brazilian('tamoyo3', 'leo1a5', 'MB-3 Tamoyo 3', 'cold-war');
Object.assign(tamoyo3.dims, { hullLengthM: 6.48, overallLengthM: 8.90, widthM: 3.29, heightM: 2.50 });
Object.assign(tamoyo3, {
  role: 'mbt', hp: 1950, enginePowerHp: 736, weightTons: 35.0, topSpeedKmh: 65, reverseSpeedKmh: 18,
  hullTraverseDegS: 44, turretTraverseDegS: 36, gunPitchDegS: 30, gunElevationDeg: 18, gunDepressionDeg: 8,
});
tamoyo3.gun = {
  ...tamoyo3.gun,
  caliberMm: 105, reloadS: 6.0, baseAccuracy: 0.30, aimTimeS: 1.8,
  shells: [
    { ...l7Rounds[0], name: 'M833 APFSDS', pen100Mm: 660, pen1000Mm: 600, pen2000Mm: 540, dmg: 470 },
    { ...l7Rounds[1], name: 'M456 HEAT' },
    { ...l7Rounds[2], name: 'L35 HESH', type: 'HE' },
  ],
};
tamoyo3.armor = tamoyoArmor({
  ringY: 1.565, barrelLenM: 4.46, gunPivot: [0, 0.335, 1.05], tFrontZ: 1.50, tRearZ: -2.11, tH: 0.75, tw: 1.10,
  skirt: false,
  glacis: 260, lower: 60, cheek: [400, 400, 520], mantlet: [300, 300, 380], tSide: [60, 60, 80],
});
// the measured depression by yaw (tools/gun-depression-sweep.mjs): the full -8 to 139 degrees, the raised engine deck astern
tamoyo3.gunPitchByYawDeg = [[0, -8], [139, -8], [142, -6.4], [144, -4.1], [145, -3.5], [148, -2.3], [152, -0.9],
  [154, -0.6], [162, -0.3], [177, -0.3], [180, -0.4]];
tamoyo3.visual = {
  ...tamoyo3.visual,
  // the 1987 coat (Vesp's profile, the collector's photograph): olive and earth brown in large fields; the 1983-98
  // plaque
  scheme: 'nato', base: '#4b5434', weather: '#57603f', patches: ['#3e2f20', '#6a4a2c'], marking: 'number', number: '13',
  camoScale: 0.42, patchK: 1.6, trackWidthM: 0.53, insignia: 'br-cruzeiro',
};

// ------------------------------------------------------------------------------------------------- the X1 family --
// Tanks Encyclopedia (CCL X1 Pioneiro, CCL X1A2 Carcará, after Bastos' "Brazilian Stuart"): the 90 mm low-pressure guns
// (the French D-921 on the X1, Engesa's EC-90, the Cockerill Mk 3 under licence, on the X1A2) fire the Cascavel's rounds,
// fin-stabilised HEAT first. The X1: 17 t, 5.04 m hull, 6.04 m over the gun, 2.4 m wide, 2.45 m, the Scania-Vabis DS-11 of
// 256 hp, 55 km/h, hull front 38 mm at 17 degrees over 44 mm, sides 25 mm, the turret 28 mm, four crew (the Stuart's
// co-driver kept). The X1A2: 19 t, 6.06 m hull, 2.6 m wide, 2.45 m, the DS-11 of 280 hp through the Allison CD-500, 60
// km/h, hull front 15 mm at 25 degrees over 35 + 28 mm, sides 28 mm, the turret 28 mm, three crew.
const x1Rounds = (spec: ReturnType<typeof brazilian>, heatPen: number) => {
  const [first, second] = spec.gun.shells;
  return [
    { ...first, name: 'OCC 90 HEAT-T', type: 'HEAT', caliberMm: 90, pen100Mm: heatPen, pen1000Mm: heatPen, pen2000Mm: heatPen, dmg: 280, velocityMps: 760 },
    { ...second, name: 'OE 90 HE-T', type: 'HE', caliberMm: 90, pen100Mm: 20, pen1000Mm: 20, dmg: 320, velocityMps: 640 },
    { ...second, name: 'Can 90 HESH-T', type: 'HE', caliberMm: 90, pen100Mm: 110, pen1000Mm: 110, dmg: 300, velocityMps: 700 },
  ];
};
const x1Armor = (o: { hl: number; hw: number; inW: number; roofY: number; trkTop: number; pivot: [number, number, number];
  gun: [number, number, number]; barrelLenM: number; tw: number; tFrontZ: number; tRearZ: number; tH: number; glacis: number;
  lower: number; side: number; loader: boolean }) => modernArmor({
  hl: o.hl, hw: o.hw, inW: o.inW, floor: 0.41, trkTop: o.trkTop, roofY: o.roofY,
  turretPivot: o.pivot, gunPivot: o.gun, barrelLenM: o.barrelLenM, barrelRadM: 0.062,
  glacis: [o.glacis, o.glacis, o.glacis], lower: [o.lower, o.lower, o.lower], side: [o.side, o.side, o.side], skirt: null,
  rear: o.side, roof: 13, tw: o.tw, tFrontZ: o.tFrontZ, tRearZ: o.tRearZ, tH: o.tH,
  cheek: [28, 28, 28], tSide: [28, 28, 28], tRear: 28, tRoof: 15, mantlet: [40, 40, 40], loader: o.loader,
});

const x1_pioneiro = brazilian('x1_pioneiro', 'leo1a5', 'CCL X1 Pioneiro', 'cold-war');
Object.assign(x1_pioneiro.dims, { hullLengthM: 5.04, overallLengthM: 6.04, widthM: 2.40, heightM: 2.45 });
Object.assign(x1_pioneiro, {
  role: 'light', hp: 1550, enginePowerHp: 256, weightTons: 17.0, topSpeedKmh: 55, reverseSpeedKmh: 12,
  hullTraverseDegS: 40, turretTraverseDegS: 28, gunPitchDegS: 24, gunElevationDeg: 15, gunDepressionDeg: 8,
});
x1_pioneiro.gun = { ...x1_pioneiro.gun, caliberMm: 90, reloadS: 4.9, baseAccuracy: 0.34, aimTimeS: 2.0, shells: x1Rounds(x1_pioneiro, 480) };
x1_pioneiro.armor = x1Armor({ hl: 2.52, hw: 1.12, inW: 0.74, roofY: 1.62, trkTop: 1.10, pivot: [0, 1.62, 0.08], gun: [0, 0.33, 1.02],
  barrelLenM: 2.42, tw: 0.92, tFrontZ: 1.02, tRearZ: -1.46, tH: 0.66, glacis: 38, lower: 44, side: 25, loader: true });
x1_pioneiro.visual = {
  ...x1_pioneiro.visual,
  // the Army's plain grey olive drab of the 1970s and 80s (Gaydos' profile); the white turret ring
  scheme: 'solid', base: '#4c5038', weather: '#575b43', patches: [], marking: 'number', number: '31', camoScale: 0.5,
  trackWidthM: 0.40, insignia: 'br-ring',
};

const x1a2_carcara = brazilian('x1a2_carcara', 'leo1a5', 'CCL X1A2 Carcará', 'cold-war');
Object.assign(x1a2_carcara.dims, { hullLengthM: 6.06, overallLengthM: 6.92, widthM: 2.60, heightM: 2.45 });
Object.assign(x1a2_carcara, {
  role: 'light', hp: 1500, enginePowerHp: 280, weightTons: 19.0, topSpeedKmh: 60, reverseSpeedKmh: 14,
  hullTraverseDegS: 42, turretTraverseDegS: 30, gunPitchDegS: 25, gunElevationDeg: 15, gunDepressionDeg: 8,
});
x1a2_carcara.gun = { ...x1a2_carcara.gun, caliberMm: 90, reloadS: 5.0, baseAccuracy: 0.33, aimTimeS: 2.0, shells: x1Rounds(x1a2_carcara, 470) };
x1a2_carcara.armor = x1Armor({ hl: 3.03, hw: 1.25, inW: 0.84, roofY: 1.74, trkTop: 1.10, pivot: [0, 1.74, 0.10], gun: [0, 0.43, 1.30],
  barrelLenM: 2.49, tw: 0.98, tFrontZ: 1.28, tRearZ: -1.86, tH: 0.77, glacis: 30, lower: 63, side: 28, loader: false });
x1a2_carcara.visual = {
  ...x1a2_carcara.visual,
  // the 6º RCB's three-tone (Gaydos' camouflaged profile): an olive base with sand fields edged in a narrow dark brown;
  // the white turret ring
  scheme: 'nato', base: '#55603f', weather: '#606b4a', patches: ['#463727', '#9a8a60'], marking: 'number', number: '21',
  camoScale: 0.5, patchK: 1.2, trackWidthM: 0.42, insignia: 'br-ring',
};

registerFleetSpecs(registries, ['x1_pioneiro', 'x1a2_carcara', 'osorio_p1', 'osorio_p2', 'tamoyo1', 'tamoyo3'],
  { x1_pioneiro, x1a2_carcara, osorio_p1, osorio_p2, tamoyo1, tamoyo3 });
