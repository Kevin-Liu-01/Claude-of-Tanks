import assert from 'node:assert/strict';
import {
  CREW_LANGUAGES, ENGINE_FAMILIES, ENGINE_FAMILY_IDS, crewLanguageForVehicle, massClass,
  resolveEngineFamily, resolveVehicleAudioIdentity,
} from './vehicleAudioProfiles.ts';
import { COUNTRIES } from '../sim/countries.ts';

// Powertrains follow the real installations.
const cases = [
  ['m1a1_abrams_hc', 'mbt', 66.8, 'turbine_agt'], ['ua_m1a1', 'mbt', 64, 'turbine_agt'], ['m1a3', 'mbt', 61.5, 'turbine_agt'],
  ['t80uk', 'mbt', 46, 'turbine_gtd'], ['ua_t80bv', 'mbt', 44.5, 'turbine_gtd'], ['type96_80_feng', 'mbt', 46, 'turbine_gtd'],
  ['t72b3m_2022', 'mbt', 46.5, 'diesel_v12_soviet'], ['t90ms_2011', 'mbt', 48, 'diesel_v12_soviet'], ['type59', 'mbt', 36, 'diesel_v12_soviet'],
  ['kv2', 'heavy', 52, 'diesel_v12_soviet'], ['bmpt_t90', 'ifv', 48, 'diesel_v12_soviet'], ['tos1a_tagil', 'spg', 49, 'diesel_v12_soviet'],
  ['t64bv1', 'mbt', 42.4, 'diesel_two_stroke'], ['t84', 'mbt', 46, 'diesel_two_stroke'], ['chieftain3', 'mbt', 55, 'diesel_two_stroke'],
  ['type90_kyumaru', 'mbt', 50.2, 'diesel_two_stroke'], ['strv103b', 'td', 39.7, 'diesel_two_stroke'], ['m551_sheridan', 'light', 18.6, 'diesel_two_stroke'],
  ['m60a1', 'mbt', 49.7, 'diesel_aircooled'], ['merkava2b', 'mbt', 63, 'diesel_aircooled'], ['mbt70', 'mbt', 50.4, 'diesel_aircooled'],
  ['leo2a4', 'mbt', 62.3, 'diesel_v12_modern'], ['merkava4b', 'mbt', 65, 'diesel_v12_modern'], ['leclerc_s2', 'mbt', 54.5, 'diesel_v12_modern'],
  ['xk2_black_panther', 'mbt', 55, 'diesel_v12_modern'], ['namer_ifv', 'ifv', 63.5, 'diesel_v12_modern'], ['abramsx', 'mbt', 49, 'diesel_v12_modern'],
  ['m2a2_bradley', 'ifv', 30.4, 'diesel_ifv'], ['cv90', 'ifv', 37, 'diesel_ifv'], ['bmp2', 'ifv', 14.3, 'diesel_ifv'],
  ['centurion5_2', 'mbt', 52, 'gasoline_v12'], ['jpz_e100', 'td', 130, 'gasoline_v12'],
  // world-sfx-269 (2026-11-03): /e100/ no longer catches the Type 100; the Strv 81 is a Centurion; the Magachs and the
  // Sho't Kal run the AVDS-1790
  ['type100', 'ifv', 38, 'diesel_ifv'], ['strv81', 'mbt', 51.8, 'gasoline_v12'], ['magach6b', 'mbt', 51, 'diesel_aircooled'],
  ['shot_kal', 'mbt', 51.8, 'diesel_aircooled'],
];
// …and a cold-war Western hull runs the cold-war diesel, the Leopard 2 lineage the MTU from its first prototype
for (const [id, family] of [['leo1a5', 'diesel_v12_coldwar'], ['amx30b2', 'diesel_v12_coldwar'], ['challenger1_mk2', 'diesel_v12_coldwar'],
  ['leopard2_proto', 'diesel_v12_modern'], ['leo2a2', 'diesel_v12_modern']]) {
  assert.equal(resolveEngineFamily({ id, role: 'mbt', weightTons: 50, era: 'cold-war' }), family, `${id} (cold war) → ${family}`);
}
for (const [id, role, weightTons, family] of cases) {
  assert.equal(resolveEngineFamily({ id, role, weightTons, era: 'modern' }), family, `${id} → ${family}`);
}

// Every family is a complete, sane powertrain description.
for (const id of ENGINE_FAMILY_IDS) {
  const f = ENGINE_FAMILIES[id];
  assert.equal(f.id, id);
  assert.ok(f.idleRpm > 0.15 && f.idleRpm < 0.45, `${id} idle`);
  assert.ok(f.spoolUpS > 0 && f.spoolDownS >= f.spoolUpS, `${id} spool`);
  assert.equal(f.turbine, id.startsWith('turbine'), `${id} turbine flag`);
  assert.equal(f.gears === 0, f.turbine, `${id}: only turbines run gearless`);
}

// Crews speak their operator's language: countries.ts countryOfVehicle, one crew per country.
assert.equal(crewLanguageForVehicle('m1a1_abrams_hc', 'USA'), 'en-US');
assert.equal(crewLanguageForVehicle('chieftain3', 'UK'), 'en-GB');
assert.equal(crewLanguageForVehicle('t72b', 'USSR/Russia'), 'ru');
assert.equal(crewLanguageForVehicle('t84', 'Ukraine'), 'uk');
assert.equal(crewLanguageForVehicle('xk2_black_panther', 'South Korea'), 'ko');
assert.equal(crewLanguageForVehicle('merkava4b', 'Israel'), 'he');
assert.equal(crewLanguageForVehicle('leo2a7dk', 'Denmark'), 'da', 'Danish crews speak Danish');
assert.equal(crewLanguageForVehicle('ee_t4_osorio', 'Brazil'), 'pt-BR', 'Brazilian crews speak Brazilian Portuguese');
assert.equal(crewLanguageForVehicle('centurion5_1_aus', 'Australia'), 'en-AU', 'Australian crews speak Australian English');
assert.equal(crewLanguageForVehicle('olifant_mk2', 'South Africa'), 'af', 'South African crews speak Afrikaans');
assert.equal(crewLanguageForVehicle('leo2a4m_can', 'Germany'), 'en-US', 'the Leopard 2A4M CAN is crewed by its operator, Canada, not its German design');
assert.equal(crewLanguageForVehicle('leo2a4', 'Germany'), 'de');
assert.equal(crewLanguageForVehicle('dev_hull', 'Community'), 'en-US', 'a hull with no country keeps the US crew');
assert.equal(crewLanguageForVehicle(null, 'Atlantis'), 'en-US');
assert.equal(crewLanguageForVehicle(undefined, undefined), 'en-US');
// Every country names a crew that ships (the Record is exhaustive at compile time; this checks the values).
for (const { id, specNations } of COUNTRIES) {
  assert.ok(CREW_LANGUAGES.includes(crewLanguageForVehicle(null, specNations[0])), `${id} speaks a shipped crew language`);
}
assert.equal(CREW_LANGUAGES.length, 17);

// Identity details.
const abrams = resolveVehicleAudioIdentity({ id: 'm1a1_abrams_hc', nation: 'USA', role: 'mbt', weightTons: 66.8, enginePowerHp: 1500, gun: { caliberMm: 120 } });
assert.equal(abrams.engine, 'turbine_agt');
assert.equal(abrams.turretDrive, 'electric');
assert.equal(abrams.loader, 'manual');
assert.equal(abrams.tracks, 'heavy');
assert.equal(abrams.crew, 'en-US');
const t72 = resolveVehicleAudioIdentity({ id: 't72b3m_2022', nation: 'Russia', role: 'mbt', weightTons: 46.5, gun: { caliberMm: 125 } });
assert.equal(t72.loader, 'carousel', 'Soviet-lineage 125 mm feeds from the carousel');
assert.equal(t72.turretDrive, 'hydraulic');
assert.equal(t72.crew, 'ru');
const leclerc_s2 = resolveVehicleAudioIdentity({ id: 'leclerc_s2', nation: 'France', role: 'mbt', weightTons: 54.5, gun: { caliberMm: 120, autoloader: { magazineSize: 3 } } });
assert.equal(leclerc_s2.loader, 'bustle');
assert.ok(leclerc_s2.turboWhistle > 0.5, 'the Hyperbar whistles');
const bradley = resolveVehicleAudioIdentity({ id: 'm2a2_bradley', nation: 'USA', role: 'ifv', weightTons: 30.4, gun: { caliberMm: 25 } });
assert.equal(bradley.loader, 'autocannon');
assert.equal(bradley.tracks, 'light');
const viper = resolveVehicleAudioIdentity({ id: 'griffin_viper', role: 'ifv', weightTons: 42, gun: { caliberMm: 140, soundProfile: 'konkurs-launch', reloadS: 14 } });
assert.equal(viper.loader, 'missile');
assert.ok(resolveVehicleAudioIdentity({ id: 'abramsx', weightTons: 49 }).electricDrive > 0.5, 'AbramsX hybrid drive whines');
assert.ok(resolveVehicleAudioIdentity({ id: 'strv103b', weightTons: 39.7 }).turbineAux > 0, 'S-tank boost turbine');
assert.ok(resolveVehicleAudioIdentity({ id: 'xk2_black_panther', weightTons: 55 }).hydropneumatic);
assert.equal(massClass(12), 0);
assert.equal(massClass(130), 1);
const heavy = resolveVehicleAudioIdentity({ id: 'jpz_e100', weightTons: 130, enginePowerHp: 1500 });
const light = resolveVehicleAudioIdentity({ id: 'bmp2', weightTons: 14.3, enginePowerHp: 300, role: 'ifv' });
assert.ok(heavy.enginePitch < light.enginePitch, 'heavier hulls run lower');
assert.ok(heavy.enginePitch >= 0.86 && light.enginePitch <= 1.14, 'pitch trim stays bounded');
assert.doesNotThrow(() => resolveVehicleAudioIdentity(null));

console.log(`vehicleAudioProfiles.selftest: ${cases.length} powertrain mappings, ${ENGINE_FAMILY_IDS.length} families, crews, loaders and drives passed`);
