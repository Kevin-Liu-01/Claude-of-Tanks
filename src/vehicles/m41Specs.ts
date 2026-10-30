// The M41 Walker Bulldog family (release 265; owner 2026-10-29: "lets make a m41", the original US tank and other
// countries'; Main's ruling the same day): the US Army's M41A3, the Bundeswehr's and the JGSDF's M41s and the Danish
// M41 DK-1, one build (profiles/m41.ts) and one combat envelope. Published figures: the US M41A3 (TM 9-2350-217 data as
// summarised by the Pansermuseet and armyvehicles.dk pages: 5.82 m hull, 8.21 m over the gun, 3.20 m wide, 2.73 m,
// 23.5 t, 500 hp Continental AOS-895-3, 72 km/h, four crew, the 76 mm M32); the Danish DK-1 (Pansermuseet's data plate:
// 25 t, 3.33 m over its skirts, 3.25 m over the commander's MG, 750 km; armyvehicles.dk: the 465 hp Cummins VTA-903T).
// Armour is the M41's: 25.4 mm at 60 degrees on the upper glacis, 31.75 mm lower, 25.4 mm sides and turret, the 38 mm
// gun shield, 19 mm rear, 12.7 mm roofs. Penetration figures are not published for the M32's rounds in the form the
// fleet uses, nor for the AAI APFSDS the Danes bought: the rounds sit at the fleet's tier I and II light-tank footings
// for the balance session to measure.
import './modern2Specs.generated.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { modernArmor } from './specHelpers.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);

const m41 = (id: string, name: string, nation: string) => {
  const spec = cloneFleetVariant(registries.tankSpecs, id, 'leo1a5', { name, nation, era: 'cold-war' });
  for (const key of ['balancePeerOf', 'publicVisualFallback', 'label', 'roster', 'variantOf', 'gunPitchByYawDeg'] as const) delete spec[key];
  stripSilhouetteDimensions(spec.dims);
  Object.assign(spec, {
    role: 'light', hp: 1250, enginePowerHp: 500, weightTons: 23.5, topSpeedKmh: 72, reverseSpeedKmh: 20,
    hullTraverseDegS: 48, turretTraverseDegS: 36, gunPitchDegS: 30, gunElevationDeg: 19.75, gunDepressionDeg: 9.75,
  });
  // the supplied print's envelope at the published hull length (its 3.38 m over the tracks against the published 3.20)
  Object.assign(spec.dims, { hullLengthM: 5.82, overallLengthM: 8.12, widthM: 3.38, heightM: 2.73 });
  const [sabot, heat, he] = spec.gun.shells;
  spec.gun = {
    ...spec.gun,
    caliberMm: 76, reloadS: 4.6, baseAccuracy: 0.31, aimTimeS: 1.8,
    shells: [
      { ...sabot, name: 'M331A2 HVAP-T', type: 'APFSDS', caliberMm: 76, pen100Mm: 215, pen1000Mm: 190, pen2000Mm: 165, dmg: 250, velocityMps: 1260 },
      { ...heat, name: 'M496 HEAT-T', caliberMm: 76, pen100Mm: 254, pen1000Mm: 254, dmg: 270, velocityMps: 1000 },
      { ...he, name: 'M352 HE-T', caliberMm: 76, pen100Mm: 20, pen1000Mm: 20, dmg: 300, velocityMps: 732 },
    ],
  };
  spec.armor = modernArmor({
    hl: 2.80, hw: 1.33, inW: 1.15, floor: 0.29, trkTop: 1.18, roofY: 1.44,
    turretPivot: [0, 1.44, 0.20], gunPivot: [0, 0.315, 1.30], barrelLenM: 3.71, barrelRadM: 0.066,
    glacis: [25, 25, 25], lower: [32, 32, 32], side: [25, 25, 25], skirt: null, rear: 19, roof: 13,
    tw: 1.13, tFrontZ: 1.50, tRearZ: -2.25, tH: 0.74,
    cheek: [25, 25, 25], tSide: [25, 25, 25], tRear: 25, tRoof: 13, mantlet: [38, 38, 38], loader: true,
  });
  return spec;
};

// The US Army's M41A3, in olive drab with the white star (its stock coat is the US Factory coat, the owner's 2026-10-22
// rule for plain US coats).
const m41a3 = m41('m41a3', 'M41A3 Walker Bulldog', 'USA');
m41a3.visual = { ...m41a3.visual, scheme: 'solid', base: '#4b4e32', weather: '#575a3e', patches: [], marking: 'number', number: '24', camoScale: 0.5 };

// The Bundeswehr's M41 (1956-66, the armoured reconnaissance battalions), in RAL 6014 Gelboliv (the German national coat).
const m41_bw = m41('m41_bw', 'M41 (Bundeswehr)', 'Germany');
m41_bw.visual = { ...m41_bw.visual, scheme: 'solid', base: '#4e4530', weather: '#5a5139', patches: [], marking: 'number', number: '231', camoScale: 0.5 };

// The JGSDF's M41, in the Ground Self-Defense Force's olive drab of its service years (1961 to the 1980s; the two-tone
// came after it), warmer and greener than the Bundeswehr's Gelboliv.
const m41_jgsdf = m41('m41_jgsdf', 'M41 (JGSDF)', 'Japan');
m41_jgsdf.visual = { ...m41_jgsdf.visual, scheme: 'solid', base: '#5c5832', weather: '#68643e', patches: [], marking: 'number', number: '12', camoScale: 0.5 };

// The Danish M41 DK-1 of the late 1980s: the Cummins diesel, skirts, the thermal sight and laser rangefinder, the AAI
// APFSDS at the tier II footing.
const m41dk1 = m41('m41dk1', 'M41 DK-1', 'Denmark');
Object.assign(m41dk1, { hp: 1300, enginePowerHp: 465, weightTons: 25.0 });
Object.assign(m41dk1.dims, { widthM: 3.33, heightM: 3.25 });
m41dk1.gun = {
  ...m41dk1.gun,
  baseAccuracy: 0.29, aimTimeS: 1.6,
  shells: m41dk1.gun.shells.map((shell, i) => i === 0
    ? { ...shell, name: 'AAI 76 mm APFSDS-T', pen100Mm: 262, pen1000Mm: 238, pen2000Mm: 214, dmg: 260, velocityMps: 1500 }
    : shell),
};
m41dk1.armor = { ...m41dk1.armor };
m41dk1.visual = {
  ...m41dk1.visual,
  // the late-1980s Danish Army coat (the Aalborg DK-1): a dull grey-olive with large black-green and blue-grey patches
  scheme: 'nato', base: '#5a5f4b', weather: '#656a55', patches: ['#2c3129', '#3e4446'], marking: 'number', number: '26', camoScale: 0.62,
};

// The measured gun stops (tools/gun-depression-sweep.mjs at 26 mm on the cast turret, its conformal nose and the gun): the
// full 9.7 degrees to yaw 128, then the engine deck's grilles and the stern stowage over the rear quarters
const M41_GUN_PITCH_BY_YAW_DEG = Object.freeze([[0, -9.7], [128, -9.7], [129, -9], [130, -5.5], [131, -4.6], [140, -3.2],
  [142, -3], [146, -3], [150, -3.3], [151, -3.8], [152, -9.7], [167, -9.7], [168, -9], [169, -8.5], [180, -8.8]] as const);
for (const spec of [m41a3, m41_bw, m41_jgsdf]) spec.gunPitchByYawDeg = M41_GUN_PITCH_BY_YAW_DEG;

registerFleetSpecs(registries, ['m41a3', 'm41_bw', 'm41_jgsdf', 'm41dk1'], { m41a3, m41_bw, m41_jgsdf, m41dk1 });
