// The Danish Army line (release 265; owner 2026-10-29: "add a bunch more denmark tanks"; Main's ruling, DECISIONS
// 2026-10-29): the tanks Denmark fielded, each with its own national kit (docs/references/tanks/leo1a3dk.md and the
// packets beside it; profiles/denmark.ts builds them). Combat data from published figures: Pansermuseet's data plates,
// armyvehicles.dk, the Forsvaret Leopard 2A7 fact sheet; rounds and armour at the donor's fleet footing where no
// published Danish figure exists, as each comment says.
import './modern2Specs.generated.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);

const danishVariant = (id: string, donor: string, name: string, era: 'cold-war' | 'modern') => {
  const spec = cloneFleetVariant(registries.tankSpecs, id, donor, { name, nation: 'Denmark', era });
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
  // the 1970s Danish Army's plain olive drab
  scheme: 'solid', base: '#4f5538', weather: '#5c6245', patches: [], marking: 'number', number: '43', camoScale: 0.5,
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
  // the Danish Army's three-tone of the 1990s (the Aalborg museum's 1A5 DK turret): olive, black and earth brown
  scheme: 'nato', base: '#4b5236', weather: '#565d42', patches: ['#1f221b', '#5a4a33'], marking: 'number', number: '24',
  camoScale: 0.5,
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

// ------------------------------------------------------------------------------------------------- Leopard 2 DK --
// The Leopard 2A5 DK: 51 ex-German 2A4s converted under the 29 June 2000 contract (armyvehicles.dk/leopard2a5.htm):
// improved hull composite and extra front armour beyond the German/Dutch A5, about 61 t (MLC 70) before the Helmand bar
// armour of 2008; 1,500 hp, the 120 mm L44, four crew. Rounds at the 2A5's fleet footing.
const leo2a5dk = danishVariant('leo2a5dk', 'leo2a5', 'Leopard 2A5 DK', 'modern');
Object.assign(leo2a5dk.dims, { hullLengthM: 7.72, overallLengthM: 10.33, widthM: 3.80, heightM: 3.04 });
Object.assign(leo2a5dk, { weightTons: 62.0 });
leo2a5dk.visual = {
  ...leo2a5dk.visual,
  // the Danish Army's three-tone of the 2010s (the Grafenwöhr photographs): olive, khaki sand and black
  scheme: 'nato', base: '#4e5a3b', weather: '#5b6646', patches: ['#8d8662', '#1e211b'], marking: 'number', number: '31',
  camoScale: 0.55,
};

// The Leopard 2A7 DK: the 2A5 DKs rebuilt in 2019-22 (Forsvaret's fact sheet: 44 tanks for Jydske Dragonregiment in
// Holstebro; about 68 t, up to 60 km/h, 1,500 hp, four crew; the 120 mm L55A1; new thermal sights, an auxiliary
// generator, air conditioning for turret and hull, new CBRN protection, a driver's camera system, new stowage modules,
// the mobile camouflage system and new protection against anti-tank rounds and IEDs; MLC 77). Rounds at the 2A7V's
// fleet footing (the L55A1's programmable HE and its newer sabot).
const leo2a7dk = danishVariant('leo2a7dk', 'leo2a7v', 'Leopard 2A7 DK', 'modern');
Object.assign(leo2a7dk.dims, { hullLengthM: 7.72, overallLengthM: 11.00, widthM: 3.80, heightM: 3.05 });
Object.assign(leo2a7dk, { weightTons: 68.0, topSpeedKmh: 60 });
leo2a7dk.visual = {
  ...leo2a7dk.visual,
  // Danish olive under the Barracuda cover
  scheme: 'nato', base: '#4b5639', weather: '#586345', patches: ['#2a3124', '#6c7550'], marking: 'number', number: '11',
  camoScale: 0.55,
};

registerFleetSpecs(registries, ['leo1a3dk', 'leo1a5dk', 'leo1a5dk1', 'leo2a5dk', 'leo2a7dk'],
  { leo1a3dk, leo1a5dk, leo1a5dk1, leo2a5dk, leo2a7dk });
