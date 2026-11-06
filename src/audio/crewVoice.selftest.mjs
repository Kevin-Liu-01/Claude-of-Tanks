import assert from 'node:assert/strict';
import { CREW_VOICE_NATIONS, isCrewVoiceSetting, normalizeCrewVoiceSetting, resolveCrewLanguage } from './crewVoice.ts';
import { CREW_LANGUAGES, WORLD_CREW_LANGUAGES } from './vehicleAudioProfiles.ts';
import { VOICE_PACKS } from './voiceManifest.generated.ts';
import { FLAG_ICON_CODE_BY_NATION } from '../ui/flagCodes.ts';
import { getLocale, setLocale, t } from '../ui/i18n.ts';

const packs = [...Object.keys(CREW_VOICE_NATIONS), ...WORLD_CREW_LANGUAGES];
assert.deepEqual([...packs].sort(), Object.keys(VOICE_PACKS).sort(), 'every selectable crew has a shipped pack, and every pack is selectable');
assert.deepEqual([...packs].sort(), [...CREW_LANGUAGES].sort());
// Languages with no country in the game (crew-languages-270): no nation speaks one by default, any player may choose one.
for (const language of WORLD_CREW_LANGUAGES) {
  assert.ok(!(language in CREW_VOICE_NATIONS), `${language} has no country in the game`);
  assert.ok(isCrewVoiceSetting(language));
  assert.equal(normalizeCrewVoiceSetting(language), language);
  for (const nation of Object.values(CREW_VOICE_NATIONS)) {
    assert.notEqual(resolveCrewLanguage(null, nation), language, `${nation}'s national crew stays its own`);
    assert.equal(resolveCrewLanguage(null, nation, language), language, `${language} overrides ${nation}`);
  }
}
for (const [language, nation] of Object.entries(CREW_VOICE_NATIONS)) {
  assert.ok(isCrewVoiceSetting(language));
  assert.equal(normalizeCrewVoiceSetting(language), language);
  assert.equal(resolveCrewLanguage(null, nation), language, `${nation} keeps its national crew by default`);
  assert.ok(FLAG_ICON_CODE_BY_NATION[nation], `${nation} has a flag`);
  for (const other of Object.values(CREW_VOICE_NATIONS)) {
    assert.equal(resolveCrewLanguage(null, other, language), language, `${language} overrides ${other}`);
  }
}
assert.equal(resolveCrewLanguage(null, 'USSR'), 'ru');
assert.equal(resolveCrewLanguage(null, 'USSR/Russia'), 'ru');
assert.equal(resolveCrewLanguage(null, 'Community'), 'en-US', 'preserves existing unknown-nation fallback');
// The operator speaks (countries.ts countryOfVehicle): the Leopard 2A4M CAN names its German design but fights for Canada.
assert.equal(resolveCrewLanguage('leo2a4m_can', 'Germany'), 'en-US', 'a Canadian crew, not a German one');
assert.equal(resolveCrewLanguage('leo2a4', 'Germany'), 'de');
assert.equal(resolveCrewLanguage('leo2a4m_can', 'Germany', 'de'), 'de', 'a fixed pack still overrides the operator');
assert.equal(normalizeCrewVoiceSetting('english'), 'en-US');
for (const [locale, language] of [['zh-CN', 'zh'], ['en-GB', 'en-GB'], ['de-DE', 'de'], ['pt-BR', 'pt-BR'], ['pt-PT', 'pt-PT'], ['en-AU', 'en-AU'], ['da-DK', 'da'], ['af-ZA', 'af'], ['es-ES', 'es-ES'], ['tr-TR', 'tr'], ['ko-KR', 'ko'], ['xx-YY', 'en-US'], [null, 'en-US']]) {
  assert.equal(normalizeCrewVoiceSetting('interface', locale), language, 'legacy Interface becomes its current pack');
}
for (const value of [undefined, null, '', 'bogus', 'en', 'de-DE', '__proto__', 'constructor', 3, {}, []]) {
  assert.equal(isCrewVoiceSetting(value), false);
  assert.equal(normalizeCrewVoiceSetting(value), 'national', 'invalid stored choices use the default');
}
const originalLocale = getLocale();
for (const locale of ['en-US', 'zh-CN']) {
  setLocale(locale);
  for (const nation of Object.values(CREW_VOICE_NATIONS)) assert.notEqual(t(`nation.${nation}`), `nation.${nation}`);
  for (const key of ['settings.crew.voice', 'settings.crew.national', 'settings.crew.note']) assert.notEqual(t(key), key);
}
setLocale(originalLocale);
console.log(`crewVoice.selftest: all ${packs.length} packs (${WORLD_CREW_LANGUAGES.length} with no country), national/fixed policy, the operator rule, flags, locale copy, legacy migration and invalid storage passed`);
