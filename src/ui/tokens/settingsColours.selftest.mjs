// settingsColours.selftest.mjs — (item 259) every Settings category wears its own colour, from one token set (owner
// 2026-10-26: "color code settings so its easier"; UI-GAUNTLET bar line 6's exception, as the modes'). Copyright © 2026
// Kevin B. Liu.
//
//  1. tokens.json carries a settingshue primitive and a settings-<tab> semantic token for every Settings tab, and the
//     generated tokens.css names each.
//  2. Every hue holds 4.5:1 on the plates and keeps at least 8 ΔE from every other category, the teams, the squad and ink,
//     and 12 from the accent, in every vision view and by both CIE76 and CIEDE2000 (colorVision.ts). The gauntlet's
//     critics read the first set (CIE76 only) under CIEDE2000, where Controls and Graphics came 5.3 apart and the
//     Accessibility yellow 7.4 from the accent: a yellow beside the accent's selection reads as a second accent.
//  3. settings.ts maps data-settings-tone=<tab> to --settings-ink for every tab, marks every tab and the body with it,
//     and paints only glyphs, the selected tab's mark and the headings' rule with it: never text.
//  4. One source: no category hue is written as a literal outside the token files.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contrastRatio, deltaE, deltaE2000, parseHex, VISION_VIEWS } from '../colorVision.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const settings = read('src/ui/settings.ts');
const tabs = /type SettingsTab = ([^;]+);/.exec(settings)[1].split('|').map((part) => part.trim().replace(/'/g, ''));
assert.deepEqual(tabs, ['controls', 'gameplay', 'sound', 'graphics', 'accessibility', 'language'], 'the Settings tabs');

// 1. one token per category
const tokens = JSON.parse(read('src/ui/tokens/tokens.json'));
const hues = tokens.primitive.settingshue;
const semantic = tokens.semantic.settings;
const css = read('src/ui/tokens/tokens.css');
for (const tab of tabs) {
  assert.ok(parseHex(hues[`settingshue-${tab}`]), `tokens.json: settingshue-${tab} is a hex hue`);
  assert.equal(semantic[`settings-${tab}`]?.value, `{settingshue-${tab}}`, `tokens.json: settings-${tab} reads its hue`);
  assert.ok(css.includes(`--settings-${tab}:var(--settingshue-${tab})`), `tokens.css: --settings-${tab} is generated (node tools/gen-tokens.mjs)`);
}
const hexes = Object.fromEntries(tabs.map((tab) => [tab, hues[`settingshue-${tab}`]]));

// 2. contrast and separation
const PLATES = { plate: '#0d1014', page: '#0b0e11', raised: '#11151a', tile: '#1a1f25' };
const KIT = { accent: '#f0a030', 'team-own': '#57b8ff', 'team-enemy': '#ff5a4e', squad: '#5bd69b', 'ink-3': '#c9c5bb', 'ink-1': '#f6f3ec' };
let floor = Infinity;
for (const [tab, hex] of Object.entries(hexes)) {
  for (const [plate, bg] of Object.entries(PLATES)) {
    const ratio = contrastRatio(parseHex(hex), parseHex(bg));
    assert.ok(ratio >= 4.5, `${tab} ${hex} holds 4.5:1 on the ${plate} (${ratio.toFixed(2)})`);
  }
  const others = { ...Object.fromEntries(Object.entries(hexes).filter(([other]) => other !== tab)), ...KIT };
  for (const [other, otherHex] of Object.entries(others)) {
    const need = other === 'accent' ? 12 : 8;
    for (const view of VISION_VIEWS) {
      const d = Math.min(deltaE(view, parseHex(hex), parseHex(otherHex)), deltaE2000(view, parseHex(hex), parseHex(otherHex)));
      floor = Math.min(floor, d);
      assert.ok(d >= need, `${tab} keeps ${need} ΔE from ${other} in ${view} vision, CIE76 and CIEDE2000 (${d.toFixed(1)})`);
    }
  }
}

// 3. the panel's mapping and its painted parts
for (const tab of tabs) {
  assert.ok(settings.includes(`.cot-settings [data-settings-tone='${tab}']{--settings-ink:var(--settings-${tab});}`),
    `settings.ts maps data-settings-tone=${tab} to --settings-ink`);
}
assert.match(settings, /data-tab="\$\{tab\}" data-settings-tone="\$\{tab\}"/, 'every tab carries its category');
assert.match(settings, /body\.dataset\.settingsTone = activeTab;/, 'the body carries the open tab\'s category');
const painted = [...settings.matchAll(/([^{}\n]+)\{[^{}]*var\(--settings-ink[^{}]*\}/g)].map((m) => m[1].trim()).sort();
assert.deepEqual(painted, [
  '.cot-set-group::after', // the headings' rule
  '.cot-set-tab-glyph', // the tab's glyph
  '.cot-set-tab.sel>span::after', // the selected tab's mark
  '.cot-setting-icon', // the rows' glyphs
], 'the category colour paints glyphs, marks and rules only, never text');

// the stricter measure is the critics': Sharma, Wu and Dalal's CIEDE2000 reference pair (Lab 50/2.6772/-79.7751 and
// 50/0/-82.7485, ΔE00 2.0425) is not reachable through sRGB here, so its definition is pinned on two sRGB pairs the critics
// measured with their own tool: Controls #a292d7 and Graphics #c287bc 5.3 apart in protanopia, #f0d03c 7.4 from the accent
// in deuteranopia
assert.equal(deltaE2000('protan', parseHex('#a292d7'), parseHex('#c287bc')).toFixed(1), '5.3');
assert.equal(deltaE2000('deutan', parseHex('#f0d03c'), parseHex('#f0a030')).toFixed(1), '7.4');

// 4. one source: no category hue as a literal outside the token files
const TOKEN_FILES = new Set(['src/ui/tokens/tokens.json', 'src/ui/tokens/tokens.css', 'src/ui/tokens/tokens.ts',
  'src/ui/tokens/settingsColours.selftest.mjs']);
const literal = new RegExp(Object.values(hexes).map((hex) => hex.slice(1)).join('|'), 'i');
const walk = (dir, out = []) => {
  for (const name of readdirSync(join(ROOT, dir))) {
    const path = join(dir, name);
    if (statSync(join(ROOT, path)).isDirectory()) walk(path, out);
    else if (/\.(css|ts|mjs|html)$/.test(name)) out.push(path);
  }
  return out;
};
assert.deepEqual(walk('src').filter((path) => !TOKEN_FILES.has(path) && literal.test(read(path))), [], 'category hues live only in the token files');

console.log(`settingsColours.selftest: ${tabs.length} categories, one token each, 4.5:1 on the plates, ${floor.toFixed(1)} ΔE apart at worst, glyphs and rules only PASS`);
