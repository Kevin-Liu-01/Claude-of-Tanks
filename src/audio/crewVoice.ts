/** Persisted crew choice shared by input, Settings and the lazy audio engine. */
import type { RuntimeValue } from '../runtimeTypes.ts';
import { CREW_LANGUAGES, crewLanguageForVehicle, type CrewLanguage, type NationalCrewLanguage } from './vehicleAudioProfiles.ts';

/** One operating nation per national pack; reuse the UI's nation labels and flags. */
export const CREW_VOICE_NATIONS: Readonly<Record<NationalCrewLanguage, string>> = Object.freeze({
  'en-US': 'USA', 'en-GB': 'UK', de: 'Germany', ru: 'Russia', uk: 'Ukraine',
  zh: 'China', fr: 'France', sv: 'Sweden', ja: 'Japan', ko: 'South Korea',
  it: 'Italy', pl: 'Poland', he: 'Israel',
  da: 'Denmark', 'pt-BR': 'Brazil', 'en-AU': 'Australia', af: 'South Africa',
});

/**
 * Every pack's language in its own words, beside the name in the player's language: a player finds their own language
 * by the name they know it by.
 */
export const CREW_LANGUAGE_NAMES: Readonly<Record<CrewLanguage, string>> = Object.freeze({
  'en-US': 'English', 'en-GB': 'English', de: 'Deutsch', ru: 'Русский', uk: 'Українська', zh: '中文', fr: 'Français',
  sv: 'Svenska', ja: '日本語', ko: '한국어', it: 'Italiano', pl: 'Polski', he: 'עברית', da: 'Dansk',
  'pt-BR': 'Português', 'en-AU': 'English', af: 'Afrikaans',
  'es-ES': 'Español (España)', 'es-419': 'Español (Latinoamérica)', 'pt-PT': 'Português (Portugal)', nl: 'Nederlands',
  no: 'Norsk', fi: 'Suomi', el: 'Ελληνικά', cs: 'Čeština', hu: 'Magyar', ro: 'Română', tr: 'Türkçe', ar: 'العربية',
  fa: 'فارسی', hi: 'हिन्दी', ur: 'اردو', bn: 'বাংলা', 'id-ID': 'Bahasa Indonesia', ms: 'Bahasa Melayu',
  vi: 'Tiếng Việt', th: 'ไทย', fil: 'Filipino',
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

/** The crew a vehicle speaks under a setting: National is its operator's (vehicleAudioProfiles.crewLanguageForVehicle). */
export function resolveCrewLanguage(id: string | null | undefined, nation: string | null | undefined, setting: CrewVoiceSetting = 'national'): CrewLanguage {
  return setting === 'national' ? crewLanguageForVehicle(id, nation) : setting;
}
