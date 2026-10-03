/** Persisted crew choice shared by input, Settings and the lazy audio engine. */
import type { RuntimeValue } from '../runtimeTypes.ts';
import { CREW_LANGUAGES, crewLanguageForNation, type CrewLanguage } from './vehicleAudioProfiles.ts';

/** One operating nation per shipped pack; reuse the UI's nation labels and flags. */
export const CREW_VOICE_NATIONS: Readonly<Record<CrewLanguage, string>> = Object.freeze({
  'en-US': 'USA', 'en-GB': 'UK', de: 'Germany', ru: 'Russia', uk: 'Ukraine',
  zh: 'China', fr: 'France', sv: 'Sweden', ja: 'Japan', ko: 'South Korea',
  it: 'Italy', pl: 'Poland', he: 'Israel',
});

export type CrewVoiceSetting = 'national' | CrewLanguage;

export function isCrewVoiceSetting(value: RuntimeValue): value is CrewVoiceSetting {
  return value === 'national' || CREW_LANGUAGES.some(language => language === value);
}

/** Legacy Interface becomes one fixed pack, independent of later UI changes. */
export function normalizeCrewVoiceSetting(value: RuntimeValue, interfaceLocale: string | null = null): CrewVoiceSetting {
  if (isCrewVoiceSetting(value)) return value;
  if (value === 'english') return 'en-US';
  if (value === 'interface') {
    const locale = String(interfaceLocale || '').toLowerCase();
    const direct = CREW_LANGUAGES.find(language => language.toLowerCase() === locale);
    const base = locale.split('-')[0];
    return direct ?? CREW_LANGUAGES.find(language => language.split('-')[0] === base) ?? 'en-US';
  }
  return 'national';
}

export function resolveCrewLanguage(nation: string | null | undefined, setting: CrewVoiceSetting = 'national'): CrewLanguage {
  return setting === 'national' ? crewLanguageForNation(nation) : setting;
}
