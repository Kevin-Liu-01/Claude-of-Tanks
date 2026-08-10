// Roster nation names predate ISO-code-backed flag rendering, so keep the
// translation centralized. flag-icons follows ISO 3166-1 alpha-2 codes.
// The package has no historical Soviet asset; USSR-family vehicles therefore
// use the Russian flag rather than retaining a hand-drawn approximation.
// Community is not a country and intentionally uses flag-icons' `xx` unknown
// territory mark instead of presenting a fictional workshop badge as a flag.

export const FLAG_ICON_CODE_BY_NATION = Object.freeze({
  USA: 'us',
  Germany: 'de',
  USSR: 'ru',
  Russia: 'ru',
  'USSR/Russia': 'ru',
  UK: 'gb',
  France: 'fr',
  China: 'cn',
  Israel: 'il',
  Italy: 'it',
  Japan: 'jp',
  Poland: 'pl',
  'South Korea': 'kr',
  Sweden: 'se',
  Ukraine: 'ua',
  Community: 'xx',
});

export function flagIconCode(nation) {
  return FLAG_ICON_CODE_BY_NATION[nation] || 'xx';
}
