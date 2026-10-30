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
const osorioArmor = (barrelLenM: number) => modernArmor({
  hl: 3.565, hw: 1.50, inW: 1.00, floor: 0.46, trkTop: 0.92, roofY: 1.60,
  turretPivot: [0, 1.60, 0.40], gunPivot: [0, 0.25, 0.85], barrelLenM, barrelRadM: 0.088,
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
Object.assign(osorio_p2, { ...osorioMobility, hp: 2000, weightTons: 43.7 });
osorio_p2.gun = { ...osorio_p2.gun, caliberMm: 120, reloadS: 6.5, baseAccuracy: 0.29, aimTimeS: 1.75 };
osorio_p2.armor = osorioArmor(5.285);
osorio_p2.visual = {
  ...osorio_p2.visual,
  // the Army's two-tone (the CIBld tank, 2020): dark olive with broad red-brown bands; the 1983-98 Southern Cross plaque
  scheme: 'stripes', base: '#3d4532', weather: '#4b5340', patches: ['#6a4630', '#5c3e2c'], marking: 'number', number: '02',
  camoScale: 0.55, trackWidthM: 0.57, insignia: 'br-cruzeiro',
};

// The 105 mm P.1 (the Army's 1986-87 homologation tank): the Royal Ordnance L7A3 and the OIP LRS-5 sights, mechanically
// linked to the gun (Forças Terrestres: poorer on the move); the 105 mm rounds at the fleet's 105 mm footing (the
// Leopard 1A5's) for the balance session to measure.
const osorio_p1 = brazilian('osorio_p1', 'amx40', 'EE-T1 Osório (105)', 'cold-war');
Object.assign(osorio_p1.dims, { hullLengthM: 7.13, overallLengthM: 9.36, widthM: 3.26, heightM: 2.68 });
Object.assign(osorio_p1, { ...osorioMobility, hp: 1900, weightTons: 41.0 });
const l7Rounds = registries.tankSpecs.leo1a5.gun.shells;
osorio_p1.gun = {
  ...osorio_p1.gun,
  caliberMm: 105, reloadS: 6.0, baseAccuracy: 0.31, aimTimeS: 1.85,
  bloom: { ...osorio_p1.gun.bloom, move: osorio_p1.gun.bloom.move * 1.15, hullRot: osorio_p1.gun.bloom.hullRot * 1.15 },
  shells: [
    { ...l7Rounds[0], name: 'M735 APFSDS' },
    { ...l7Rounds[1], name: 'M456 HEAT' },
    { ...l7Rounds[2], name: 'L35 HESH', type: 'HE' },
  ],
};
osorio_p1.armor = osorioArmor(4.545);
osorio_p1.visual = {
  ...osorio_p1.visual,
  // the 1986 homologation three-tone, "the scheme that should have been the Army's new one" (Bastos): green, brown, black
  scheme: 'nato', base: '#4a5136', weather: '#565d42', patches: ['#5b432f', '#1f201b'], marking: 'number', number: '01',
  camoScale: 0.55, trackWidthM: 0.57, insignia: 'br-cruzeiro',
};

registerFleetSpecs(registries, ['osorio_p1', 'osorio_p2'], { osorio_p1, osorio_p2 });
