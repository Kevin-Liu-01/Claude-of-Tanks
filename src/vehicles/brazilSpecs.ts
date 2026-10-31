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
const osorioArmor = (barrelLenM: number, barrelRadM: number, kit: Partial<Parameters<typeof modernArmor>[0]> = {}) => modernArmor({
  hl: 3.565, hw: 1.50, inW: 1.00, floor: 0.46, trkTop: 0.92, roofY: 1.60,
  turretPivot: [0, 1.60, 0.40], gunPivot: [0, 0.28, 0.85], barrelLenM, barrelRadM,
  glacis: [380, 380, 480], lower: [120, 120, 150], side: [60, 60, 70], skirt: [40, 40, 120], rear: 30, roof: 30,
  tw: 1.145, tFrontZ: 1.44, tRearZ: -2.38, tH: 0.77,
  cheek: [430, 430, 620], tSide: [200, 200, 280], tRear: 45, tRoof: 35, mantlet: [340, 340, 430], loader: true,
  bustleAmmo: true, ...kit,
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
osorio_p2.gunPitchByYawDeg = [[0, -10], [9, -10], [11, -9.4], [20, -8.8], [22, -8.8], [24, -9.1], [28, -8.8],
  [30, -8.8], [35, -8.9], [36, -8.6], [42, -7.5], [45, -7.5], [54, -9], [56, -9], [57, -9.1], [60, -10], [113, -10],
  [115, -9.6], [121, -9.1], [123, -8.5], [124, -8.3], [130, -7.8], [146, -4.3], [156, -2.6], [157, -2.6], [159, -0.8],
  [160, -0.5], [162, -0.5], [163, -0.7], [165, -2], [177, -2], [180, -2.5]];
osorio_p2.visual = {
  ...osorio_p2.visual,
  // the Army's two-tone (the CIBld tank, 2020): a reddish chocolate brown and a dark grey-green in about equal shares,
  // broad soft-edged patches a metre to a metre and a half across (the blotch painter, as the P.1's coat that the critics
  // read as the CIBld scheme; this recipe's seed lays 53 % green; blind critics, rounds 3 to 10: near-black stripes, then
  // narrow streaks); darker and redder than the P.1's tan, which keeps the marks apart; the 1983-98 plaque
  scheme: 'blotch', base: '#5e4232', weather: '#664a35', patches: ['#323a2c'], marking: 'number',
  number: '02', camoScale: 0.48, patchK: 2.2, trackWidthM: 0.57, insignia: 'br-cruzeiro',
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
osorio_p1.gunPitchByYawDeg = [[0, -10], [13, -10], [17, -9.5], [18, -9.4], [21, -9.4], [22, -9.5], [24, -9.8],
  [35, -8.5], [42, -7.1], [45, -7.2], [59, -10], [118, -10], [142, -5], [145, -4.5], [150, -4], [158, -2.6],
  [159, -1.4], [160, -1], [162, -1], [163, -1.2], [164, -2.2], [169, -2.4], [173, -2.4], [176, -2.5], [180, -2.9]];
osorio_p1.visual = {
  ...osorio_p1.visual,
  // the surviving P.1 as photographed (museum 2015, Curitiba 2024): a milk-chocolate brown with large rounded,
  // smooth-edged blobs of a dark olive grey, a metre or more across, three or four along each side and on the turret and
  // deck; no stripes, no black (the blotch painter: this recipe's seed lays them about 42 % of the area, even down the
  // hull's height; blind critic, round 5); the white ring-and-oval emblem it carries on the turret
  scheme: 'blotch', base: '#6a5644', weather: '#72634c', patches: ['#3c3f33'], marking: 'number', number: '01',
  camoScale: 0.48, patchK: 2.0, trackWidthM: 0.57, insignia: 'br-osorio',
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
  // (the lane's balance footing, re-duelled on the round-3 turret: the 0.31 / 1.9 s / 5.6 s footing fell to 0.34 against
  // the tier-II MBTs, 3 of 8 in band; this one 0.49, 5 of 8)
  caliberMm: 90, reloadS: 5.4, baseAccuracy: 0.28, aimTimeS: 1.75,
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
  // the 1987 coat (Vesp's profile, the collector's photograph): the Army's olive and earth brown (the Tamoyo 1's brown),
  // two tones, in broad masses a metre to a metre and a half across (the blotch painter; this recipe's seed lays 47-73 %
  // brown in every hull-height band; blind critics, rounds 9 to 12: a near-black third tone, the nato painter's fine
  // mottle at any field size, then a tan read as desert sand); the 1983-98 plaque
  scheme: 'blotch', base: '#3b4231', weather: '#444b36', patches: ['#6a4a2c'], marking: 'number', number: '13',
  camoScale: 0.48, patchK: 2.2, trackWidthM: 0.53, insignia: 'br-cruzeiro',
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
// (over the gun: the 5.04 m hull and the D-921's muzzle 1.28 m past the bow as Gaydos draws it, against TE's 6.04)
Object.assign(x1_pioneiro.dims, { hullLengthM: 5.04, overallLengthM: 6.32, widthM: 2.40, heightM: 2.45 });
Object.assign(x1_pioneiro, {
  role: 'light', hp: 1550, enginePowerHp: 256, weightTons: 17.0, topSpeedKmh: 55, reverseSpeedKmh: 12,
  hullTraverseDegS: 40, turretTraverseDegS: 28, gunPitchDegS: 24, gunElevationDeg: 15, gunDepressionDeg: 8,
});
x1_pioneiro.gun = { ...x1_pioneiro.gun, caliberMm: 90, reloadS: 4.9, baseAccuracy: 0.34, aimTimeS: 2.0, shells: x1Rounds(x1_pioneiro, 480) };
x1_pioneiro.armor = x1Armor({ hl: 2.52, hw: 1.12, inW: 0.74, roofY: 1.62, trkTop: 1.10, pivot: [0, 1.62, 0.08], gun: [0, 0.33, 1.02],
  barrelLenM: 2.70, tw: 0.92, tFrontZ: 1.02, tRearZ: -1.54, tH: 0.66, glacis: 38, lower: 44, side: 25, loader: true });
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
x1a2_carcara.armor = x1Armor({ hl: 3.03, hw: 1.25, inW: 0.84, roofY: 1.68, trkTop: 1.12, pivot: [0, 1.68, 0.10], gun: [0, 0.43, 1.30],
  barrelLenM: 2.49, tw: 0.98, tFrontZ: 1.28, tRearZ: -1.86, tH: 0.77, glacis: 30, lower: 63, side: 28, loader: false });
x1a2_carcara.visual = {
  ...x1a2_carcara.visual,
  // the 6º RCB's three-tone (Gaydos' camouflaged profile): a dark olive base dominant, flowing khaki streaks over about
  // 31 % of it and narrow brown bands at their edges, one scale on hull and turret (the merdc painter: patches[0] the
  // khaki fields, [1] and [2] the brown accents; blind critics, rounds 4 and 5: sand swamped the hull, then a light sage
  // and sand read too pale); the white turret ring
  scheme: 'merdc', base: '#4b5436', weather: '#505e3f', patches: ['#857a54', '#5a4630', '#3a3226'], marking: 'number',
  number: '21', camoScale: 0.5, patchK: 1.4, trackWidthM: 0.42, insignia: 'br-ring',
};

// ------------------------------------------------------------------- the fictional EE-T3 and EE-T4 Osório --
// (owner 2026-10-30: "now make a super modernized hypotehtical version a tier 9 and a tier 10"; Main's ruling the same
// day, the "concept" facet): the P.2 under a bolted armour kit (profiles/osorio.ts, marks t3 and t4), continuing Engesa's
// numbering as the Challenger 1's fictional FV4030/5 and /6 continue Vickers'. Their rows sit at the tier IX and X MBT
// medians (2026-10-30: IX 2,500 hp, 23.4 hp/t, 6.3 s, 0.30, 1.76 s, 830 mm; X 2,700 hp, 25 hp/t, 6.1 s, 0.29, 1.67 s,
// 891 mm); the balance lane measures both in its IX/X pass.
const osorioModernShells = (base: typeof osorio_p2.gun.shells, pen: readonly [number, number, number], dmg: number, cal: number) =>
  base.map((shell, i) => i === 0
    ? { ...shell, caliberMm: cal, pen100Mm: pen[0], pen1000Mm: pen[1], pen2000Mm: pen[2], dmg, velocityMps: cal > 120 ? 1700 : 1750 }
    : { ...shell, caliberMm: cal, dmg: Math.round(shell.dmg * (cal > 120 ? 1.15 : 1.05)) });

// The EE-T3 (tier IX, the 2000s): a 120 mm L/55, the nose module, composite modules on the front three skirt panels, the
// cheeks' wedge modules and side boxes, a stabilised panoramic sight with its thermal channel, the remote 12.7 mm, two
// 200 L fuel drums across the stern.
const ee_t3_osorio = brazilian('ee_t3_osorio', 'amx40', 'EE-T3 Osório', 'modern');
Object.assign(ee_t3_osorio.dims, { hullLengthM: 7.13, overallLengthM: 10.46, widthM: 3.40, heightM: 2.95 });
Object.assign(ee_t3_osorio, { ...osorioMobility, hp: 2500, weightTons: 55, enginePowerHp: 1300, topSpeedKmh: 66,
  reverseSpeedKmh: 40, turretTraverseDegS: 40 });
// (at the tier IX MBT medians, 2026-10-30, the cheeks and glacis a little under, the lower nose well under: a first
// footing of 0.82 against the tier's MBTs came down to these; the balance lane measures it in its IX pass)
ee_t3_osorio.gun = {
  ...osorio_p2.gun, caliberMm: 120, reloadS: 6.6, baseAccuracy: 0.30, aimTimeS: 1.76,
  shells: osorioModernShells(osorio_p2.gun.shells, [830, 770, 710], 530, 120),
};
ee_t3_osorio.armor = osorioArmor(5.645, 0.104, {
  glacis: [430, 430, 530], lower: [160, 160, 190], side: [70, 70, 80], skirt: [80, 80, 200], rear: 35, roof: 40,
  cheek: [620, 620, 760], tSide: [260, 260, 340], tRear: 50, tRoof: 45, mantlet: [350, 350, 430],
});
// (2026-10-31, the fuel drums raised over the deck line: from 166 deg to the rear the gun clears them at +2.7 to +2.9 deg,
// re-measured over the whole traverse, the front as published)
ee_t3_osorio.gunPitchByYawDeg = [[0, -9.9], [15, -9.7], [17, -9.4], [30, -8.5], [38, -8.2], [42, -7.4], [45, -7.4],
  [52, -8.4], [55, -8.4], [56, -8.5], [61, -9.1], [65, -9], [69, -9.5], [73, -9.5], [75, -10], [104, -10], [107, -9.2],
  [108, -9], [114, -8.8], [115, -8.5], [123, -8.1], [124, -7.8], [126, -7.6], [133, -7.1], [147, -4.2], [157, -2.5],
  [159, -0.8], [160, -0.5], [162, -0.5], [163, -0.7], [164, -1.4], [165, 1.7], [166, 2.7], [167, 2.9], [180, 2.9]];
ee_t3_osorio.visual = {
  ...osorio_p2.visual,
  // a NATO-style three-tone (the Army's Leopard 1A5BR coat): green the field, brown masses and broad black blotches
  // (blind critics, rounds c1 and c2: a deeper green about 40 %, brown 35 %, black 20-25 %), the 1998 arms
  scheme: 'blotch', base: '#3c4530', weather: '#434d36', patches: ['#5c442d', '#1d1e1a'], marking: 'number',
  number: '31', camoScale: 0.48, patchK: 1.9, trackWidthM: 0.57, insignia: 'br-eb-arms',
};

// The EE-T4 (tier X, the 2030s): a 130 mm L/51, the kit heavier and full length, a hard-kill active protection system,
// laser-warning heads, slat armour over the rear plate with the two fuel drums behind it, a hybrid pack's power.
const ee_t4_osorio = brazilian('ee_t4_osorio', 'amx40', 'EE-T4 Osório', 'modern');
Object.assign(ee_t4_osorio.dims, { hullLengthM: 7.45, overallLengthM: 11.73, widthM: 3.43, heightM: 2.98 });
Object.assign(ee_t4_osorio, { ...osorioMobility, hp: 2700, weightTons: 58, enginePowerHp: 1500, topSpeedKmh: 68,
  reverseSpeedKmh: 40, turretTraverseDegS: 42 });
// (at the tier X MBT medians, 2026-10-30, the 130 mm's round a step over in penetration and damage for its slower
// reload: a first footing of 0.83 against the tier's MBTs came down to these; the balance lane measures it in its X pass)
ee_t4_osorio.gun = {
  ...osorio_p2.gun, caliberMm: 130, reloadS: 6.6, baseAccuracy: 0.29, aimTimeS: 1.68,
  shells: osorioModernShells(osorio_p2.gun.shells, [900, 840, 780], 560, 130),
};
ee_t4_osorio.armor = osorioArmor(6.60, 0.140, {
  glacis: [550, 550, 650], lower: [190, 190, 220], side: [80, 80, 90], skirt: [100, 100, 240], rear: 40, roof: 45,
  cheek: [660, 660, 800], tSide: [320, 320, 400], tRear: 60, tRoof: 50, mantlet: [440, 440, 520],
});
// (measured 2026-10-31 on the c4 build: the 130 mm's thicker barrel holds the gun level over the engine deck at 160)
// (2026-10-31, the fuel drums raised over the deck line: from 166 deg to the rear the gun clears them at +2.7 to +3.3 deg,
// re-measured from 140 deg, the front as published)
ee_t4_osorio.gunPitchByYawDeg = [[0, -8.7], [12, -8.4], [15, -8], [27, -7.2], [30, -6.6], [40, -6.3], [42, -6],
  [45, -6], [55, -6.5], [70, -8.4], [72, -8.4], [78, -9.7], [103, -9.4], [107, -8.2], [108, -8], [116, -7.2],
  [118, -6.8], [125, -5.8], [134, -5.4], [150, -2.8], [157, -2], [158, -0.9], [159, -0.1], [160, 0.1], [162, 0.1],
  [163, -0.1], [164, -0.6], [165, 1.2], [166, 2.7], [167, 3.3], [180, 3.3]];
ee_t4_osorio.visual = {
  ...osorio_p2.visual,
  // a two-scale digital woodland in the Army's tones (olive, a light olive, brown and black), the 1998 arms (the light
  // olive laid first, under the others, and every tone a step darker: a medium olive field, woodland, not sand; the black
  // laid before the brown so no panel goes black, a deep black and a darker earth for contrast at range, the olives
  // warmer and the pixel a size up so its steps stay crisp: blind critics, rounds c1 to c5)
  scheme: 'digital', base: '#3a3f27', weather: '#41462d', patches: ['#56553a', '#191a15', '#45331f'], marking: 'number',
  number: '41', camoScale: 0.48, patchK: 1.6, digitalCellK: 1.4, trackWidthM: 0.57, insignia: 'br-eb-arms',
};

registerFleetSpecs(registries, ['x1_pioneiro', 'x1a2_carcara', 'osorio_p1', 'osorio_p2', 'tamoyo1', 'tamoyo3', 'ee_t3_osorio',
  'ee_t4_osorio'], { x1_pioneiro, x1a2_carcara, osorio_p1, osorio_p2, tamoyo1, tamoyo3, ee_t3_osorio, ee_t4_osorio });
