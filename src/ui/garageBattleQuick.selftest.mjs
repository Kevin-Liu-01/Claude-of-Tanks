import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The battle card's corner control (owner 10-26, via Main: "also fix the top right button here", a drawn triangle on a dark
// square): the kit's icon button on its media plate with the sprite's chevron, named and tipped for what it opens, opening
// the mode and then the battlefield on the kit's picker menus anchored to it; a finger's 44 px on touch.

const garageTs = await readFile(new URL('./garage.ts', import.meta.url), 'utf8');
const garageCss = await readFile(new URL('./garage.css', import.meta.url), 'utf8');
const showroomCss = await readFile(new URL('./showroom.css', import.meta.url), 'utf8');
const pickerMenuTs = await readFile(new URL('./components/pickerMenu.ts', import.meta.url), 'utf8');
const en = JSON.parse(await readFile(new URL('./i18nCatalog.en-US.json', import.meta.url), 'utf8'));
const zh = JSON.parse(await readFile(new URL('./i18nCatalog.zh-CN.json', import.meta.url), 'utf8'));

assert.match(garageTs,
  /<button type="button" class="cot-c-btn cot-c-btn--icon cot-battle-quick" data-battle-quick aria-haspopup="listbox" ` \+\s*`aria-expanded="false" aria-label="\$\{t\('garage\.battle\.quickChoose'\)\}" data-tip="\$\{t\('garage\.battle\.quickChoose'\)\}">` \+\s*`\$\{uiIconSVG\('chevronDown', 16\)\}<\/button>/,
  "the corner control is the kit's icon button with the sprite's chevron, named and tipped for what it opens");
assert.ok(en['garage.battle.quickChoose'] && zh['garage.battle.quickChoose'], 'its name reads in en and zh');
assert.match(garageTs, /createPickerMenu\(requiredElement<HTMLElement>\(hosts, '\[data-quick-mode\]'\), \{\s*id: 'garage-quick-mode',[\s\S]*?layout: 'cards'/,
  'the modes open on the kit picker menu');
assert.match(garageTs, /createPickerMenu\(requiredElement<HTMLElement>\(hosts, '\[data-quick-field\]'\), \{\s*id: 'garage-quick-battlefield',[\s\S]*?layout: 'cards'/,
  'the battlefields open on the kit picker menu');
assert.match(garageTs, /field\.open\(quickBtn\)/, 'a mode chosen, the battlefield menu follows from the same control');
assert.match(garageTs, /quickMenus\.mode\.open\(quickBtn\)/, 'the menus are anchored to the control');
assert.match(garageTs, /const cards = \(\): import\('\.\/battlefieldPicker\.ts'\)\.BattlefieldCard\[\] => battlefieldCards\(battlefieldFacts\);/,
  "the Deploy screen's picker and the quick menu read one set of battlefield cards");
assert.match(pickerMenuTs, /if \(openFrom\?\.hasAttribute\('aria-haspopup'\)\) openFrom\.setAttribute\('aria-expanded', 'true'\);/,
  'the control that opens a menu says it is open');
assert.doesNotMatch(`${garageCss}\n${showroomCss}`, /\.cot-battle-mode::(?:after|before)/, 'no drawn triangle or plate stays on the card');
assert.match(showroomCss, /body\[data-cot-input='coarse'\] \.cot-battle-quick\{--h:var\(--target-min\);\}/, "a finger's 44 px on touch");
assert.match(showroomCss, /body\[data-cot-panels='persistent'\] \.cot-battle-quick\{position:absolute;z-index:var\(--z-lift\);top:var\(--s2\);right:var\(--s2\);\}/,
  "it stands in the card's top-right corner on the --s grid");

console.log('garageBattleQuick.selftest: the corner control is the kit icon button opening the mode and battlefield menus');
