import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gtSymbolSvg } from './gtSymbol.ts';

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
  /class="cot-locale-credit"[^>]*href="https:\/\/generaltranslation\.com\/"[\s\S]*?\$\{gtSymbolSvg\(30, 'cot-gt-symbol'\)\}/,
  'desktop Garage navigation must credit General Translation with its symbol, inline at 30 px');
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

// 272 (owner: "used this new logo for both"): both credits draw General Translation's symbol, byte for byte from the
// retained source, square (never squashed), in currentColor with the source's even-odd rule, and decorative.
{
  const source = await readFile(new URL('../../docs/references/brand-assets/gt-symbol.svg', import.meta.url));
  assert.equal(createHash('sha256').update(source).digest('hex'), '855a421a9a5288d7e2b4275ebafcb57fb5d25a8b59b69cb6ef57d4409941b665',
    'the retained General Translation symbol is the owner-supplied file');
  const sourcePath = source.toString().match(/<path\b[^>]*\bd="([^"]+)"/)[1];
  for (const size of [16, 30]) {
    const svg = gtSymbolSvg(size, 'mark');
    assert.equal(svg.match(/\bd="([^"]+)"/)[1], sourcePath, `${size} px: the credit draws the complete source path`);
    assert.match(svg, new RegExp(`width="${size}" height="${size}" viewBox="0 0 487 487"`), `${size} px: square box on the 487-unit symbol`);
    assert.match(svg, /fill="currentColor" fill-rule="evenodd"/, `${size} px: the surface colour, the source's even-odd rule`);
    assert.match(svg, /aria-hidden="true"/, `${size} px: decorative; the link names General Translation`);
  }
  assert.match(css, /\.cot-locale-credit \.cot-gt-symbol\{width:30px;height:30px;aspect-ratio:1;flex:none;/,
    'the Garage credit keeps the symbol a 30 px circle');
  assert.doesNotMatch(garage, /general-translation\.png/, 'the retired PNG credit is gone');
}

console.log('garageLocaleNavigation.selftest: concise destinations and responsive locale switching verified');
