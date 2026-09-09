import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [garage, css, english] = await Promise.all([
  readFile(new URL('./garage.ts', import.meta.url), 'utf8'),
  readFile(new URL('./garage.css', import.meta.url), 'utf8'),
  readFile(new URL('./i18nCatalog.en-US.json', import.meta.url), 'utf8'),
]);

assert.match(english, /"garage\.nav\.gallery": "Gallery"/,
  'Garage navigation must use the concise Gallery label');
assert.match(english, /"garage\.nav\.docs": "Docs"/,
  'Garage navigation must use the concise Docs label');
assert.match(english, /"publicNav\.gallery": "Gallery"/,
  'public navigation must use the same concise Gallery label');
assert.match(english, /"publicNav\.language\.creditEyebrow": "FULLY INTERNATIONALIZED BY"/,
  'the language credit must state that the game is fully internationalized');
assert.match(garage,
  /class="cot-locale-credit-wrap cot-nav-desktop"[\s\S]*?class="nv cot-locale-switcher"[^>]*data-nav="locale"[^>]*aria-label="\$\{localeSwitchLabel\}"/,
  'desktop Garage navigation must expose the shared locale switch action');
assert.match(garage,
  /class="cot-locale-credit"[^>]*href="https:\/\/generaltranslation\.com\/"[\s\S]*?\/brand\/partners\/general-translation\.png/,
  'desktop Garage navigation must credit General Translation with its packaged mark');
assert.match(garage,
  /data-mobile-nav="locale"[^>]*aria-label="\$\{localeSwitchLabel\}"[\s\S]*?<strong>\$\{t\('settings\.language\.title'\)\}<\/strong>/,
  'compact Garage navigation must keep the locale switcher available without crowding the header');
assert.match(garage,
  /setLocale\(nextLocale\);[\s\S]*window\.location\.assign\(currentLocationHrefForLocale\(window\.location, nextLocale\)\)/,
  'Garage locale switching must persist the selection and preserve its route, query, and hash');
assert.match(css,
  /body\[data-cot-width='laptop'\] \.cot-header-nav \.cot-locale-options\{display:none\}/,
  'laptop Garage headers must collapse the locale label while retaining the globe control');
assert.match(css,
  /\.cot-locale-credit-wrap:hover \.cot-locale-credit,[\s\S]*?\.cot-locale-credit-wrap:focus-within \.cot-locale-credit/,
  'the Garage GT credit must appear for both pointer hover and keyboard focus');

console.log('garageLocaleNavigation.selftest: concise destinations and responsive locale switching verified');
