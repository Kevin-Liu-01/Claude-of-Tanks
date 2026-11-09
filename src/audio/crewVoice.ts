/** Persisted crew choice shared by input, Settings and the lazy audio engine. */
import type { RuntimeValue } from '../runtimeTypes.ts';
import { CREW_LANGUAGES, crewLanguageForVehicle, type CrewLanguage, type NationalCrewLanguage } from './vehicleAudioProfiles.ts';

/** One operating nation per national pack: the nation whose tanks speak it by default (crewLanguageForVehicle). */
export const CREW_VOICE_NATIONS: Readonly<Record<NationalCrewLanguage, string>> = Object.freeze({
  'en-US': 'USA', 'en-GB': 'UK', de: 'Germany', ru: 'Russia', uk: 'Ukraine',
  zh: 'China', fr: 'France', sv: 'Sweden', ja: 'Japan', ko: 'South Korea',
  it: 'Italy', pl: 'Poland', he: 'Israel',
  da: 'Denmark', 'pt-BR': 'Brazil', 'en-AU': 'Australia', af: 'South Africa',
});

/** A pack's language as a player reads it: named in their interface's language, and in its own words when that differs. */
export interface CrewLanguageLabel { readonly name: string; readonly own: string | null }

const languageNames = new Map<string, Intl.DisplayNames>();

/** One language's name in a locale, its first letter capitalised for a list ("norsk" -> "Norsk"). */
function languageName(tag: string, locale: string): string {
  let names = languageNames.get(locale);
  if (!names) languageNames.set(locale, names = new Intl.DisplayNames([locale], { type: 'language', languageDisplay: 'standard' }));
  const name = names.of(tag) ?? tag;
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
}

/**
 * Every pack named as a language, never a country: "German · Deutsch", "English (Australia)". A pack keeps its region
 * only where another pack shares its language (English, Spanish, Portuguese). The names come from Intl.DisplayNames,
 * so a new pack needs no catalog string.
 */
export function crewLanguageLabel(language: CrewLanguage, interfaceLocale: string): CrewLanguageLabel {
  const base = language.split('-')[0];
  const tag = CREW_LANGUAGES.filter(other => other.split('-')[0] === base).length > 1 ? language : base;
  const name = languageName(tag, interfaceLocale);
  const own = languageName(tag, language);
  return { name, own: own === name ? null : own };
}

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
