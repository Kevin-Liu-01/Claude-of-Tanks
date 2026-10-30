// The Danish Army line (release 265; owner 2026-10-29: "add a bunch more denmark tanks"; Main's ruling, DECISIONS
// 2026-10-29): the tanks Denmark fielded, each with its own national kit (docs/references/tanks/leo1a3dk.md and the
// packets beside it; profiles/denmark.ts builds them). Combat data from published figures: Pansermuseet's data plates,
// armyvehicles.dk, the Forsvaret Leopard 2A7 fact sheet; rounds and armour at the donor's fleet footing where no
// published Danish figure exists, as each comment says.
import './modern2Specs.generated.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import {
  bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions,
} from './fleetSpecRegistry.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);

const danishVariant = (id: string, donor: string, name: string, era: 'cold-war' | 'modern') => {
  const spec = cloneFleetVariant(registries.tankSpecs, id, donor, { name, nation: 'Denmark', era, role: registries.tankSpecs[donor].role });
  delete spec.balancePeerOf;
  delete spec.publicVisualFallback;
  delete spec.label;
  delete spec.roster;
  delete spec.variantOf;
  stripSilhouetteDimensions(spec.dims);
  return spec;
};

// ------------------------------------------------------------------------------------------------- Leopard 1 DK --
// Pansermuseet (Leopard 1A5 DK data plate): 6.94 m hull, 9.54 m over the gun, 3.41 m wide, 2.8 m over the commander's
// MG, 830 hp MTU MB 838 Ca M500, 65 km/h, 42.4 t loaded, 105 mm L7A1/A3, four crew. The 1A3 DK came in 1976-78 (120
// tanks), all 230 became 1A5 DK in 1990-94 and 35-36 of them the DK-1 for the Balkans (1994-95).

// The Leopard 1A3 DK: the welded turret with the TEM 2A rangefinder and the XSW-30-U searchlight. DM23, the 105 mm
// APFSDS of its first service decade (1979), as on the Leopard 1A2A1.
const leo1a3dk = danishVariant('leo1a3dk', 'leo1a5', 'Leopard 1A3 DK', 'cold-war');
Object.assign(leo1a3dk.dims, { hullLengthM: 6.94, overallLengthM: 9.54, widthM: 3.37, heightM: 2.62 });
Object.assign(leo1a3dk, { weightTons: 42.0, hp: 1500 });
leo1a3dk.gun = {
  ...leo1a3dk.gun,
  // the TEM 2A optical rangefinder ahead of the EMES 18's laser: slower to lay
  aimTimeS: leo1a3dk.gun.aimTimeS + 0.2,
  shells: leo1a3dk.gun.shells.map((shell, i) => i === 0
    ? { ...shell, name: 'DM23 APFSDS', pen100Mm: 404, pen1000Mm: 368, pen2000Mm: 331 }
    : shell),
};
leo1a3dk.visual = {
  ...leo1a3dk.visual,
  // the 1970s Danish Army's plain olive drab (r2: the Krigsmuseet tank's darker, greyer olive)
  scheme: 'solid', base: '#474b37', weather: '#545747', patches: [], marking: 'number', number: '43', camoScale: 0.5,
};

// The Leopard 1A5 DK: EMES 18 thermal fire control on the welded turret, the 1990s 105 mm APFSDS at the 1A5's footing.
const leo1a5dk = danishVariant('leo1a5dk', 'leo1a5', 'Leopard 1A5 DK', 'modern');
Object.assign(leo1a5dk.dims, { hullLengthM: 6.94, overallLengthM: 9.54, widthM: 3.37, heightM: 2.80 });
Object.assign(leo1a5dk, { weightTons: 42.4 });
leo1a5dk.gun = {
  ...leo1a5dk.gun,
  shells: leo1a5dk.gun.shells.map((shell, i) => i === 0 ? { ...shell, name: 'DM33 APFSDS' } : shell),
};
leo1a5dk.visual = {
  ...leo1a5dk.visual,
  // the Danish Army's three-tone of the 1990s (the Aalborg museum's 1A5 DK turret): a greyer olive, black and earth brown
  // in large fields
  scheme: 'nato', base: '#494e3a', weather: '#555a47', patches: ['#1c1e1a', '#4e4130'], marking: 'number', number: '24',
  camoScale: 0.72,
};

// The Leopard 1A5 DK-1: the Bosnia fit (air conditioning and a generator on the turret rear, the M41 DK-1's searchlight,
// GPS) in United Nations white, as the 1A5 DKs of Operation Bøllebank (29 April 1994) were painted.
const leo1a5dk1 = danishVariant('leo1a5dk1', 'leo1a5', 'Leopard 1A5 DK-1', 'modern');
Object.assign(leo1a5dk1.dims, { hullLengthM: 6.94, overallLengthM: 9.54, widthM: 3.37, heightM: 2.80 });
Object.assign(leo1a5dk1, { weightTons: 43.0 });
leo1a5dk1.gun = { ...leo1a5dk.gun };
leo1a5dk1.visual = {
  ...leo1a5dk1.visual,
  scheme: 'solid', base: '#d9d8cf', weather: '#c9c8bd', patches: [], marking: 'number', number: '22', camoScale: 0.5,
};

// The Leopard 1 DKs' measured gun stops (tools/gun-depression-sweep.mjs at 26 mm on the welded turret and its gun): the
// full 9 degrees to yaw 151, then the engine deck's louvres, the exhaust grilles and the stern stowage over the rear quarter
const LEO1_DK_GUN_PITCH_BY_YAW_DEG = Object.freeze([[0, -9], [151, -9], [155, -6.9], [156, -5.5], [159, -3.5],
  [160, -2.9], [162, -2.8], [163, -2], [164, -1.6], [165, -0.6], [166, -0.1], [167, 0.1], [168, 0.2], [172, 0.2],
  [173, -0.1], [175, -1.5], [176, -1.9], [177, -2.7], [180, -2.7]] as const);
for (const spec of [leo1a3dk, leo1a5dk, leo1a5dk1]) spec.gunPitchByYawDeg = LEO1_DK_GUN_PITCH_BY_YAW_DEG;

// ------------------------------------------------------------------------------------------------- Leopard 2 DK --
// The Leopard 2A5 DK: 51 ex-German 2A4s converted under the 29 June 2000 contract (armyvehicles.dk/leopard2a5.htm):
// improved hull composite and extra front armour beyond the German/Dutch A5, about 61 t (MLC 70) before the Helmand bar
// armour of 2008; 1,500 hp, the 120 mm L44, four crew. Rounds at the 2A5's fleet footing.
const leo2a5dk = danishVariant('leo2a5dk', 'leo2a5', 'Leopard 2A5 DK', 'modern');
Object.assign(leo2a5dk.dims, { hullLengthM: 7.72, overallLengthM: 10.33, widthM: 3.80, heightM: 3.04 });
Object.assign(leo2a5dk, { weightTons: 62.0 });
// Denmark's 120 mm sabot is the DM53A1 (esut.de, May 2022: the Danish stock being brought to the DM73 standard)
leo2a5dk.gun = {
  ...leo2a5dk.gun,
  shells: leo2a5dk.gun.shells.map((shell, i) => i === 0 ? { ...shell, name: 'DM53A1 APFSDS' } : shell),
};
leo2a5dk.visual = {
  ...leo2a5dk.visual,
  // the Danish Army's three-tone of the 2010s (the Grafenwöhr side photograph): dark olive, a yellow-olive khaki and
  // black (r2 critics: round blobs read as woodland; r3: thin sprayed bands read as tiger stripes; r4: the splinter
  // wedges tiled into a small checker): the NATO painter's long khaki bands through the olive at one and a half times
  // their size, black shadowing them, the khaki warmed toward yellow-brown (previewed on the CPU, .qa-dev camoprev)
  scheme: 'nato', base: '#434b34', weather: '#4f5640', patches: ['#1c1e19', '#6f6440'], patchK: 1.5, blackK: 1.5,
  marking: 'number', number: '31', camoScale: 0.5,
};
// its measured gun stops (tools/gun-depression-sweep.mjs at 26 mm): the 2A5's own curve, the bar armour clear of the gun
// (the stern cage and quarter cages stay under the barrel's path over the rear deck)
leo2a5dk.gunPitchByYawDeg = Object.freeze([[0, -9], [24, -9], [25, -8.4], [28, -8.2], [30, -8.3], [32, -9], [35, -9],
  [37, -8.8], [46, -8.1], [53, -8], [56, -8], [58, -8.2], [59, -9], [122, -9], [124, -8], [136, -4.8], [144, -3.1],
  [145, -2.5], [146, -2.1], [149, -1.4], [155, -0.6], [156, -0.3], [163, 0.6], [176, 0.6], [177, 6.6], [178, 7.1],
  [180, 7.1]] as const);

// The Leopard 2A7 DK: the 2A5 DKs rebuilt in 2019-22 (Forsvaret's fact sheet: 44 tanks for Jydske Dragonregiment in
// Holstebro; about 68 t, up to 60 km/h, 1,500 hp, four crew; the 120 mm L55A1; new thermal sights, an auxiliary
// generator, air conditioning for turret and hull, new CBRN protection, a driver's camera system, new stowage modules,
// the mobile camouflage system and new protection against anti-tank rounds and IEDs; MLC 77). Rounds at the 2A7V's
// fleet footing (the L55A1's programmable HE and its newer sabot).
const leo2a7dk = danishVariant('leo2a7dk', 'leo2a7v', 'Leopard 2A7 DK', 'modern');
Object.assign(leo2a7dk.dims, { hullLengthM: 7.72, overallLengthM: 11.00, widthM: 3.80, heightM: 3.05 });
Object.assign(leo2a7dk, { weightTons: 68.0, topSpeedKmh: 60 });
// the DM73 the Danish DM53A1s are being rebuilt to (esut.de, May 2022: the same penetrator, a stronger propellant), from
// the L55A1 at the 2A7V's footing
leo2a7dk.gun = {
  ...leo2a7dk.gun,
  shells: leo2a7dk.gun.shells.map((shell, i) => i === 0 ? { ...shell, name: 'DM73 APFSDS' } : shell),
};
// its measured gun stops (tools/gun-depression-sweep.mjs --no-suit at 26 mm; the Barracuda cover is cut to them): the
// full 9 degrees forward and to the sides, then the rear deck's louvres and the stern stowage over the rear quarters
leo2a7dk.gunPitchByYawDeg = Object.freeze([[0, -9], [31, -9], [32, -8.5], [33, -8.4], [35, -8.4], [36, -8.6], [37, -9],
  [46, -9], [48, -8.6], [52, -8.3], [62, -8.2], [68, -8.5], [71, -9], [100, -9], [110, -6.1], [121, -3.5], [129, -2],
  [138, -0.7], [141, -0.5], [142, 0.4], [143, 2.1], [144, 3], [145, 3.5], [146, 3.9], [152, 4.5], [154, 4.5], [158, 4.3],
  [159, 5.8], [160, 6.6], [161, 6.8], [169, 7.3], [174, 7.3], [180, 6.7]] as const);
leo2a7dk.visual = {
  ...leo2a7dk.visual,
  // the Barracuda cover's dull grey-green mottle (the Latvia photograph; r2 critics: no terracotta; r3: the grey-green
  // read pale sage; r4: the brown base showed between the cover's panels): small grey-green patches in the cover's own
  // tones, so the painted faces under it read as the same cover
  scheme: 'nato', base: '#4d5545', weather: '#575f4e', patches: ['#353c30', '#5d6353', '#434a3b'], marking: 'number',
  number: '11', camoScale: 0.9,
};

// ------------------------------------------------------------------------------------------------- CV9035 DK --
// armyvehicles.dk/cv9035.htm: 45 ordered (2007, DALO, BAE Systems Hägglunds), 6.87 m long, 3.19 m wide, 2.80 m, 31,750 kg,
// the 755 hp Scania DI-16, 940 l and 500 km, three crew and seven dismounts, the 35/50 Bushmaster III with its ammunition
// programmer, stabilised day/night sights for gunner and commander (hunter-killer), and a defensive aids suite whose
// laser warning receivers cue the smoke dischargers. The 35 mm rounds and cycle sit at tier V's 35 mm footing (the KF41
// Lynx's), a little under its damage so the group's median holds.
const cv9035dk = danishVariant('cv9035dk', 'cv90', 'CV9035 DK', 'modern');
Object.assign(cv9035dk.dims, { hullLengthM: 6.87, overallLengthM: 7.10, widthM: 3.19, heightM: 2.80 });
Object.assign(cv9035dk, { weightTons: 31.75, enginePowerHp: 755 });
{
  const [sabot, he, second] = cv9035dk.gun.shells;
  cv9035dk.gun = {
    ...cv9035dk.gun,
    caliberMm: 35, reloadS: 0.55, baseAccuracy: 0.24, aimTimeS: 0.95,
    shells: [
      { ...sabot, name: '35 mm APFSDS-T', caliberMm: 35, pen100Mm: 205, pen1000Mm: 188, pen2000Mm: 170, dmg: 115, velocityMps: 1440 },
      { ...he, name: '35 mm programmable HE (ABM)', caliberMm: 35, pen100Mm: 20, pen1000Mm: 20, dmg: 118, velocityMps: 1050 },
      { ...second, name: '35 mm FAPDS', caliberMm: 35, pen100Mm: 160, pen1000Mm: 145, pen2000Mm: 130, dmg: 105, velocityMps: 1385 },
    ],
  };
}
cv9035dk.visual = {
  ...cv9035dk.visual,
  // the Danish Army's three-tone on its CV90s (the Holstebro and Latvia photographs): a muted grey-green ground, a dark
  // green and black (r3: no sand; the brown in the Latvia photograph is its cover's; r6 critics: a cool blue-grey against
  // the Holstebro photograph's warmer olive-khaki ground): the ground warmer and lighter, a dark olive-brown third tone
  // r7 (critics, both: four tones with the brown; the Holstebro coat greens and black on a cooler grey-olive): a dark green,
  // black and a pale grey-green on a darker ground, its wash light so it stays its own paint
  scheme: 'nato', base: '#4d5345', weather: '#646a5c', patches: ['#353b30', '#1f221c', '#61675a'], marking: 'number', number: '45',
  camoScale: 0.58,
};
// its measured gun stops (the 35 mm on its solid shroud): the glacis's add-on armour ahead, the rear deck's stowage aft
cv9035dk.gunPitchByYawDeg = Object.freeze([[0, -6.9], [20, -6.6], [34, -6.4], [36, -5.6], [37, -5.5], [39, -5.5],
  [40, -6.2], [41, -7.2], [42, -7.3], [43, -8], [142, -8], [150, -5.9], [151, -5.2], [152, -5], [155, -5], [166, -5.7],
  [168, -5.9], [169, -6.6], [170, -6.6], [171, -6.9], [172, -8], [180, -8]] as const);

registerFleetSpecs(registries, ['leo1a3dk', 'leo1a5dk', 'leo1a5dk1', 'leo2a5dk', 'leo2a7dk', 'cv9035dk'],
  { leo1a3dk, leo1a5dk, leo1a5dk1, leo2a5dk, leo2a7dk, cv9035dk });
