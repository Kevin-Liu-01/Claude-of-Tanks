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
assert.match(garage,
  /class="nv cot-nav-desktop cot-locale-switcher"[^>]*data-nav="locale"[^>]*aria-label="\$\{localeSwitchLabel\}"/,
  'desktop Garage navigation must expose the shared locale switch action');
assert.match(garage,
  /data-mobile-nav="locale"[^>]*aria-label="\$\{localeSwitchLabel\}"[\s\S]*?<strong>\$\{t\('settings\.language\.title'\)\}<\/strong>/,
  'compact Garage navigation must keep the locale switcher available without crowding the header');
assert.match(garage,
  /setLocale\(nextLocale\);[\s\S]*window\.location\.assign\(currentLocationHrefForLocale\(window\.location, nextLocale\)\)/,
  'Garage locale switching must persist the selection and preserve its route, query, and hash');
assert.match(css,
  /body\[data-cot-width='laptop'\] \.cot-header-nav \.cot-locale-options\{display:none\}/,
  'laptop Garage headers must collapse the locale label while retaining the globe control');

console.log('garageLocaleNavigation.selftest: concise destinations and responsive locale switching verified');
