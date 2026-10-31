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
  // the 1970s Danish Army's plain olive drab (r2: the Krigsmuseet tank's darker, greyer olive; r7 critics: a saturated green
  // under cloudy mottling: flatter and greyer, the mottle light)
  scheme: 'solid', base: '#484a3b', weather: '#55574a', patches: [], marking: 'number', number: '43', camoScale: 0.5,
  solidWeatheringIntensity: 0.35,
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
  // (r8 tried a black and a black-green field on the r7 critics' "black-dominant, the brown little"; the r8 critics, both
  // models, then found the brown missing and scored it 0.7 lower: the r7 olive, black and brown, which passed both, again)
  scheme: 'nato', base: '#494e3a', weather: '#555a47', patches: ['#1c1e1a', '#4e4130'], marking: 'number', number: '24',
  // (r10 tried larger fields on the r9 critics' "soft round blobs": the black ran down the centreline as one band, both
  // critics; the r7-r9 field size kept)
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
  // (r9 tried a warmer olive with less black on the r8 critics' "minty sage, oversized black": the khaki took over the
  // olive and the black stood as isolated blots; the r7 coat, which passed both, kept)
  scheme: 'nato', base: '#434b34', weather: '#4f5640', patches: ['#1c1e19', '#6f6440'], patchK: 1.5, blackK: 1.5,
  marking: 'number', number: '31', camoScale: 0.5,
};
// its measured gun stops (tools/gun-depression-sweep.mjs at 26 mm): the 2A5's own curve, the bar armour clear of the gun
// (the stern cage and quarter cages stay under the barrel's path over the rear deck)
leo2a5dk.gunPitchByYawDeg = Object.freeze([[0, -9], [24, -9], [25, -8.4], [28, -8.2], [30, -8.3], [32, -9], [35, -9],
  [37, -8.8], [46, -8.1], [53, -8], [56, -8], [58, -8.2], [59, -9], [122, -9], [124, -8], [136, -4.8], [144, -3.1],
  [145, -2.5], [146, -2.1], [149, -1.4], [155, -0.6], [156, -0.3], [163, 0.6], [176, 0.6], [177, 6.6], [178, 7.1],
  [180, 7.1]] as const);

// The Leopard 2A7 DK is held from release 265 (the coordinator, 2026-10-30): its Barracuda cover is rebuilt as a reusable
// fit on wip/denmark-2a7dk-265 and lands with its own critics.

// ------------------------------------------------------------------------------------------------- CV9035 DK --
// armyvehicles.dk/cv9035.htm: 45 ordered (2007, DALO, BAE Systems Hägglunds), 6.87 m long, 3.19 m wide, 2.80 m, 31,750 kg,
// the 755 hp Scania DI-16, 940 l and 500 km, three crew and seven dismounts, the 35/50 Bushmaster III with its ammunition
// programmer, stabilised day/night sights for gunner and commander (hunter-killer), and a defensive aids suite whose
// laser warning receivers cue the smoke dischargers. The 35 mm rounds and cycle sit at tier V's 35 mm footing (the KF41
// Lynx's), a little under its damage so the group's median holds.
const cv9035dk = danishVariant('cv9035dk', 'cv90', 'CV9035 DK', 'modern');
{
  const [sabot, he, second] = cv9035dk.gun.shells;
  cv9035dk.gun = {
    ...cv9035dk.gun,
    // the fleet's 35 mm report (the KF41 Lynx's), not the donor CV90's 40 mm Bofors; every round on the 35 mm's cycle (they
    // kept the 40 mm's 0.44 s until afvBalance.selftest's per-round check)
    caliberMm: 35, reloadS: 0.55, baseAccuracy: 0.24, aimTimeS: 0.95, soundProfile: 'kde-35',
    shells: [
      { ...sabot, name: '35 mm APFSDS-T', caliberMm: 35, pen100Mm: 205, pen1000Mm: 188, pen2000Mm: 170, dmg: 115, velocityMps: 1440, reloadS: 0.55 },
      { ...he, name: '35 mm programmable HE (ABM)', caliberMm: 35, pen100Mm: 20, pen1000Mm: 20, dmg: 118, velocityMps: 1050, reloadS: 0.55 },
      { ...second, name: '35 mm FAPDS', caliberMm: 35, pen100Mm: 160, pen1000Mm: 145, pen2000Mm: 130, dmg: 105, velocityMps: 1385, reloadS: 0.55 },
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
  // r9 (r8 critics, both: the pale sage bright, small even blobs; the Holstebro coat darker, lower in contrast, fewer and
  // larger fields): the light tone darker and warmer, the fields larger
  // c4 (critics, both: too pale and cool, the Holstebro coat darker): the ground a darker olive, the third tone a dark
  // grey-olive for the pale sage
  scheme: 'nato', base: '#454a37', weather: '#50543f', patches: ['#2e3527', '#1b1d17', '#3d4234'], marking: 'number', number: '45',
  camoScale: 0.45,
};
// the CV90 Mk IV under it (the owner 2026-10-30: "the cv9035 should be based on the cv90 mk 4"; profiles/denmark.ts
// builds it on profiles/cv90MkivSourceX.ts with the Danish kit): the Mk IV's armour frame, pivots, modules and crew
// seats and its size, the plates at this tier's own thicknesses; BAE's Mk IV figures, the 1,000 hp and 37 t; the 35 mm
// barrel to its muzzle (2.42 m from the trunnion)
{
  const mk4 = registries.tankSpecs.cv90_mk4;
  const own = new Map([...cv9035dk.armor.hullPlates, ...cv9035dk.armor.turretPlates].map((plate) => [plate.name, plate]));
  const keep = (plate: typeof mk4.armor.hullPlates[number]) => {
    const tier = own.get(plate.name);
    return tier ? { ...structuredClone(plate), physicalMm: tier.physicalMm, keMm: tier.keMm, ceMm: tier.ceMm, kind: tier.kind } : structuredClone(plate);
  };
  cv9035dk.armor = {
    ...structuredClone(mk4.armor),
    hullPlates: mk4.armor.hullPlates.map(keep),
    turretPlates: mk4.armor.turretPlates.map(keep),
    gunBarrel: { lengthM: 2.42, radiusM: 0.05 },
  };
  Object.assign(cv9035dk.dims, { hullLengthM: 6.62, overallLengthM: 6.62, widthM: 3.30, heightM: 2.82 });
  Object.assign(cv9035dk, { weightTons: 37, enginePowerHp: 1000 });
}
// its measured gun stops on the Mk IV (tools/gun-depression-sweep.mjs at 26 mm): the full 8 degrees over the bow but
// over the corner lamp receivers, and almost none over the raised troop roof astern
cv9035dk.gunPitchByYawDeg = Object.freeze([[0, -8], [14, -8], [15, -7.5], [16, -6.1], [17, -5.5], [24, -5.1], [26, -5.2],
  [27, -5.4], [28, -5.9], [30, -8], [134, -8], [136, -2.1], [137, -1.8], [139, -1.7], [141, -0.3], [165, -0.2], [176, -0.3],
  [178, -1.8], [180, -1.8]] as const);

registerFleetSpecs(registries, ['leo1a3dk', 'leo1a5dk', 'leo1a5dk1', 'leo2a5dk', 'cv9035dk'],
  { leo1a3dk, leo1a5dk, leo1a5dk1, leo2a5dk, cv9035dk });
