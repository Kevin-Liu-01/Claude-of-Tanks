// badgeColours.selftest.mjs — (261) the item badge's category colours, equipment's and consumables', from one token group
// (owner 2026-10-27: "make consumables all have much better icons annd be represented uniquely but as cool-y as
// eqquipment"; Main: one badge, extended with consumable categories, each its own colour token checked for colour-vision
// separation against the equipment categories and the Settings tab colours). Copyright © 2026 Kevin B. Liu.
//
//  1. tokens.json component.surface-badge carries badge-equip-<category> for the equipment picker's five categories and
//     badge-cons-<category> for every consumable category (sim/consumableRules.ts), in its own sheet and module.
//  2. Every consumable hue holds 3:1 on the plates (a graphic: the frame around the ink glyph, WCAG 1.4.11) and keeps at
//     least 8 ΔE from every other badge hue, the Settings tabs, the teams, the squad and ink, and 12 from the accent, in
//     every vision view by CIE76 and CIEDE2000 (colorVision.ts): beside the battle tray's team marks a consumable frame
//     never reads as a side, and beside a selection never as the accent. The equipment's five keep their hues; their own
//     close pairs (recon and protection 0.9 apart for a deuteranope) are the equipment set's, told apart by the glyph.
//  3. equipIcons.ts frames every badge from the module, so the badge has one source: no badge hue as a literal outside the
//     token files.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contrastRatio, deltaE, deltaE2000, parseHex, VISION_VIEWS } from '../colorVision.ts';
import { CONSUMABLE_CATEGORIES } from '../../sim/consumableRules.ts';
import { SURFACE_TOKENS } from './surface-badge.ts';
import { consumableIconSVG, equipIconSVG } from '../equipIcons.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

// 1. one token per category, in the group's own sheet and module
const group = JSON.parse(read('src/ui/tokens/tokens.json')).component['surface-badge'];
assert.equal(group.$sheet, 'src/ui/tokens/surface-badge.css', 'the badge hues have their own sheet');
assert.equal(group.$module, 'src/ui/tokens/surface-badge.ts', 'and their own module, so the boot\'s tokens.ts carries none');
const EQUIPMENT = { firepower: '#d9a451', recon: '#79afc0', mobility: '#a4b66d', protection: '#9ea7c4', survival: '#c48e70' };
for (const [category, hex] of Object.entries(EQUIPMENT)) {
  assert.equal(group[`badge-equip-${category}`]?.value, hex, `badge-equip-${category} keeps the equipment picker's hue`);
}
const consumables = {};
for (const category of CONSUMABLE_CATEGORIES) {
  const hex = group[`badge-cons-${category}`]?.value;
  assert.ok(parseHex(hex), `tokens.json: badge-cons-${category} is a hex hue`);
  assert.equal(SURFACE_TOKENS[`badge-cons-${category}`], hex, `surface-badge.ts carries badge-cons-${category} (node tools/gen-tokens.mjs)`);
  consumables[category] = hex;
}
assert.equal(Object.keys(group).filter((key) => !key.startsWith('$')).length, 5 + CONSUMABLE_CATEGORIES.length,
  'the group holds the equipment\'s five and one hue per consumable category, nothing else');

// 2. contrast and separation
const PLATES = { plate: '#0d1014', page: '#0b0e11', raised: '#11151a', tile: '#1a1f25' };
const SETTINGS = Object.fromEntries(Object.entries(JSON.parse(read('src/ui/tokens/tokens.json')).primitive.settingshue)
  .filter(([key]) => !key.startsWith('$')).map(([key, value]) => [key, value]));
const KIT = { accent: '#f0a030', 'team-own': '#57b8ff', 'team-enemy': '#ff5a4e', squad: '#5bd69b', 'ink-3': '#c9c5bb', 'ink-1': '#f6f3ec' };
const near = (a, b) => Math.min(...VISION_VIEWS.flatMap((view) => [deltaE(view, parseHex(a), parseHex(b)), deltaE2000(view, parseHex(a), parseHex(b))]));
let floor = Infinity;
for (const [category, hex] of Object.entries(consumables)) {
  for (const [plate, bg] of Object.entries(PLATES)) {
    const ratio = contrastRatio(parseHex(hex), parseHex(bg));
    assert.ok(ratio >= 3, `badge-cons-${category} ${hex} holds 3:1 on the ${plate} (${ratio.toFixed(2)})`);
  }
  const others = {
    ...Object.fromEntries(Object.entries(consumables).filter(([other]) => other !== category).map(([k, v]) => [`badge-cons-${k}`, v])),
    ...Object.fromEntries(Object.entries(EQUIPMENT).map(([k, v]) => [`badge-equip-${k}`, v])),
    ...SETTINGS, ...KIT,
  };
  for (const [other, otherHex] of Object.entries(others)) {
    const need = other === 'accent' ? 12 : 8;
    const d = near(hex, otherHex);
    floor = Math.min(floor, d);
    assert.ok(d >= need, `badge-cons-${category} keeps ${need} ΔE from ${other} in every vision view, CIE76 and CIEDE2000 (${d.toFixed(1)})`);
  }
}

// 3. the badge frames from the module: each category's hue reaches its badge, and no badge hue is a literal elsewhere
assert.match(equipIconSVG('rammer', 38), new RegExp(`stroke="${EQUIPMENT.firepower}"`), 'an equipment badge frames in its token');
assert.match(consumableIconSVG('extinguisher', 38), new RegExp(`stroke="${consumables.fire}"`), 'a consumable badge frames in its token');
const TOKEN_FILES = new Set(['src/ui/tokens/tokens.json', 'src/ui/tokens/surface-badge.css', 'src/ui/tokens/surface-badge.ts',
  'src/ui/tokens/badgeColours.selftest.mjs']);
const literal = new RegExp([...Object.values(EQUIPMENT), ...Object.values(consumables)].map((hex) => hex.slice(1)).join('|'), 'i');
const walk = (dir, out = []) => {
  for (const name of readdirSync(join(ROOT, dir))) {
    const path = join(dir, name);
    if (statSync(join(ROOT, path)).isDirectory()) walk(path, out);
    else if (/\.(css|ts|mjs|html)$/.test(name)) out.push(path);
  }
  return out;
};
assert.deepEqual(walk('src').filter((path) => !TOKEN_FILES.has(path) && literal.test(read(path))), [], 'badge hues live only in the token files');

console.log(`badgeColours.selftest: ${CONSUMABLE_CATEGORIES.length} consumable categories beside the equipment's 5, one token each, 3:1 on the plates, ${floor.toFixed(1)} ΔE from every badge, Settings, team and ink hue at worst PASS`);
