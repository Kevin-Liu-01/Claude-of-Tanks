import assert from 'node:assert/strict';
import { CREW_VOICE_NATIONS, isCrewVoiceSetting, normalizeCrewVoiceSetting, resolveCrewLanguage } from './crewVoice.ts';
import { CREW_LANGUAGES } from './vehicleAudioProfiles.ts';
import { VOICE_PACKS } from './voiceManifest.generated.ts';
import { FLAG_ICON_CODE_BY_NATION } from '../ui/flagCodes.ts';
import { getLocale, setLocale, t } from '../ui/i18n.ts';

const packs = Object.keys(CREW_VOICE_NATIONS);
assert.deepEqual(packs.sort(), Object.keys(VOICE_PACKS).sort(), 'every selectable crew has a shipped pack, and every pack is selectable');
assert.deepEqual(packs, [...CREW_LANGUAGES].sort());
for (const [language, nation] of Object.entries(CREW_VOICE_NATIONS)) {
  assert.ok(isCrewVoiceSetting(language));
  assert.equal(normalizeCrewVoiceSetting(language), language);
  assert.equal(resolveCrewLanguage(nation), language, `${nation} keeps its national crew by default`);
  assert.ok(FLAG_ICON_CODE_BY_NATION[nation], `${nation} has a flag`);
  for (const other of Object.values(CREW_VOICE_NATIONS)) {
    assert.equal(resolveCrewLanguage(other, language), language, `${language} overrides ${other}`);
  }
}
assert.equal(resolveCrewLanguage('USSR'), 'ru');
assert.equal(resolveCrewLanguage('USSR/Russia'), 'ru');
assert.equal(resolveCrewLanguage('Community'), 'en-US', 'preserves existing unknown-nation fallback');
assert.equal(normalizeCrewVoiceSetting('english'), 'en-US');
for (const [locale, language] of [['zh-CN', 'zh'], ['en-GB', 'en-GB'], ['de-DE', 'de'], ['pt-BR', 'en-US'], [null, 'en-US']]) {
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
console.log('crewVoice.selftest: all 13 packs, national/fixed policy, flags, locale copy, legacy migration and invalid storage passed');
