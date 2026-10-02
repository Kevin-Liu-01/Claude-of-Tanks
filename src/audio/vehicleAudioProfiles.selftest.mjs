import assert from 'node:assert/strict';
import {
  CREW_LANGUAGES, ENGINE_FAMILIES, ENGINE_FAMILY_IDS, crewLanguageForNation, massClass,
  resolveEngineFamily, resolveVehicleAudioIdentity,
} from './vehicleAudioProfiles.ts';

// Powertrains follow the real installations.
const cases = [
  ['m1a2', 'mbt', 66.8, 'turbine_agt'], ['ua_m1a1', 'mbt', 64, 'turbine_agt'], ['m1a3', 'mbt', 61.5, 'turbine_agt'],
  ['t80u', 'mbt', 46, 'turbine_gtd'], ['ua_t80bv', 'mbt', 44.5, 'turbine_gtd'], ['type96_80_feng', 'mbt', 46, 'turbine_gtd'],
  ['t72b3m', 'mbt', 46.5, 'diesel_v12_soviet'], ['t90ms', 'mbt', 48, 'diesel_v12_soviet'], ['type59', 'mbt', 36, 'diesel_v12_soviet'],
  ['kv2', 'heavy', 52, 'diesel_v12_soviet'], ['bmpt_t90', 'ifv', 48, 'diesel_v12_soviet'], ['tos1a_tagil', 'spg', 49, 'diesel_v12_soviet'],
  ['t64bv1', 'mbt', 42.4, 'diesel_two_stroke'], ['t84', 'mbt', 46, 'diesel_two_stroke'], ['chieftain5', 'mbt', 55, 'diesel_two_stroke'],
  ['type90', 'mbt', 50.2, 'diesel_two_stroke'], ['strv103', 'td', 39.7, 'diesel_two_stroke'], ['m551_sheridan', 'light', 18.6, 'diesel_two_stroke'],
  ['m60a1', 'mbt', 49.7, 'diesel_aircooled'], ['merkava2b', 'mbt', 63, 'diesel_aircooled'], ['mbt70', 'mbt', 50.4, 'diesel_aircooled'],
  ['leo2a6', 'mbt', 62.3, 'diesel_v12_modern'], ['merkava4b', 'mbt', 65, 'diesel_v12_modern'], ['leclerc', 'mbt', 54.5, 'diesel_v12_modern'],
  ['k2', 'mbt', 55, 'diesel_v12_modern'], ['namer_ifv', 'ifv', 63.5, 'diesel_v12_modern'], ['abramsx', 'mbt', 49, 'diesel_v12_modern'],
  ['m2a2_bradley', 'ifv', 30.4, 'diesel_ifv'], ['cv90', 'ifv', 37, 'diesel_ifv'], ['bmp2', 'ifv', 14.3, 'diesel_ifv'],
  ['centurion5', 'mbt', 52, 'gasoline_v12'], ['jpz_e100_x', 'td', 130, 'gasoline_v12'],
];
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

// Crews speak the operating nation's language.
assert.equal(crewLanguageForNation('USA'), 'en-US');
assert.equal(crewLanguageForNation('UK'), 'en-GB');
assert.equal(crewLanguageForNation('USSR/Russia'), 'ru');
assert.equal(crewLanguageForNation('Ukraine'), 'uk');
assert.equal(crewLanguageForNation('South Korea'), 'ko');
assert.equal(crewLanguageForNation('Israel'), 'he');
assert.equal(crewLanguageForNation('Atlantis'), 'en-US', 'unknown nations fall back to the US crew');
assert.equal(CREW_LANGUAGES.length, 13);

// Identity details.
const abrams = resolveVehicleAudioIdentity({ id: 'm1a2', nation: 'USA', role: 'mbt', weightTons: 66.8, enginePowerHp: 1500, gun: { caliberMm: 120 } });
assert.equal(abrams.engine, 'turbine_agt');
assert.equal(abrams.turretDrive, 'electric');
assert.equal(abrams.loader, 'manual');
assert.equal(abrams.tracks, 'heavy');
assert.equal(abrams.crew, 'en-US');
const t72 = resolveVehicleAudioIdentity({ id: 't72b3m', nation: 'Russia', role: 'mbt', weightTons: 46.5, gun: { caliberMm: 125 } });
assert.equal(t72.loader, 'carousel', 'Soviet-lineage 125 mm feeds from the carousel');
assert.equal(t72.turretDrive, 'hydraulic');
assert.equal(t72.crew, 'ru');
const leclerc = resolveVehicleAudioIdentity({ id: 'leclerc', nation: 'France', role: 'mbt', weightTons: 54.5, gun: { caliberMm: 120, autoloader: { magazineSize: 3 } } });
assert.equal(leclerc.loader, 'bustle');
assert.ok(leclerc.turboWhistle > 0.5, 'the Hyperbar whistles');
const bradley = resolveVehicleAudioIdentity({ id: 'm2a2_bradley', nation: 'USA', role: 'ifv', weightTons: 30.4, gun: { caliberMm: 25 } });
assert.equal(bradley.loader, 'autocannon');
assert.equal(bradley.tracks, 'light');
const viper = resolveVehicleAudioIdentity({ id: 'griffin_viper', role: 'ifv', weightTons: 42, gun: { caliberMm: 140, soundProfile: 'konkurs-launch', reloadS: 14 } });
assert.equal(viper.loader, 'missile');
assert.ok(resolveVehicleAudioIdentity({ id: 'abramsx', weightTons: 49 }).electricDrive > 0.5, 'AbramsX hybrid drive whines');
assert.ok(resolveVehicleAudioIdentity({ id: 'strv103', weightTons: 39.7 }).turbineAux > 0, 'S-tank boost turbine');
assert.ok(resolveVehicleAudioIdentity({ id: 'k2', weightTons: 55 }).hydropneumatic);
assert.equal(massClass(12), 0);
assert.equal(massClass(130), 1);
const heavy = resolveVehicleAudioIdentity({ id: 'jpz_e100_x', weightTons: 130, enginePowerHp: 1500 });
const light = resolveVehicleAudioIdentity({ id: 'bmp2', weightTons: 14.3, enginePowerHp: 300, role: 'ifv' });
assert.ok(heavy.enginePitch < light.enginePitch, 'heavier hulls run lower');
assert.ok(heavy.enginePitch >= 0.86 && light.enginePitch <= 1.14, 'pitch trim stays bounded');
assert.doesNotThrow(() => resolveVehicleAudioIdentity(null));

console.log(`vehicleAudioProfiles.selftest: ${cases.length} powertrain mappings, ${ENGINE_FAMILY_IDS.length} families, crews, loaders and drives passed`);
