import { COUNTRIES } from '../sim/teamNations.ts';
// Roster nation names predate ISO-code-backed flag rendering, so keep the
// translation centralized. flag-icons follows ISO 3166-1 alpha-2 codes.
// The package has no historical Soviet asset; USSR-family vehicles therefore
// use the Russian flag rather than retaining a hand-drawn approximation.
// Community is not a country and intentionally uses flag-icons' `xx` unknown
// territory mark instead of presenting a fictional workshop badge as a flag.

// the countries' flags come from the one country table (sim/teamNations.ts COUNTRIES); Community is not a country
export const FLAG_ICON_CODE_BY_NATION: Readonly<Record<string, string>> = Object.freeze({
  ...Object.fromEntries(COUNTRIES.flatMap((country) => country.specNations.map((nation) => [nation, country.flag]))),
  Community: 'xx',
});

export function flagIconCode(nation: string): string {
  return FLAG_ICON_CODE_BY_NATION[nation] || 'xx';
}
