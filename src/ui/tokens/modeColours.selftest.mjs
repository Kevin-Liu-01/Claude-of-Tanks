// modeColours.selftest.mjs — every game mode wears its own hue, from one token set (owner 2026-10-25: "use the unique
// colors for each modes icon again"; UI-GAUNTLET bar line 6). Copyright © 2026 Kevin B. Liu.
//
//  1. tokens.json carries a modehue primitive and a mode-<id> semantic token for every game mode (gameModeCatalog.ts),
//     and the generated tokens.css names each.
//  2. Every hue holds 4.5:1 on the plates. The battle menu's original seven keep their hues; each of the other seven
//     keeps at least 8 ΔE from every mode hue, the accent, the teams and ink in every vision view (colorVision.ts).
//     Mode identity is the glyph's shape and the hue reinforces it, so the originals' own close pairs are not held.
//  3. components.css maps data-mode-tone=<mode id> to --mode-ink for every mode.
//  4. One source: no mode hue is written as a literal outside the token files.
//  5. The registered mode-glyph call sites paint var(--mode-ink), never ink: Rooms' rule tiles, /home's modes rail,
//     the Garage battle menu. A new call site adds its row here.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAME_MODE_IDS } from '../../sim/gameModeCatalog.ts';
import { contrastRatio, deltaE, parseHex, VISION_VIEWS } from '../colorVision.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const tokenName = (id) => id.replace(/_/g, '-');

// 1. one token per mode
const tokens = JSON.parse(read('src/ui/tokens/tokens.json'));
const hues = tokens.primitive.modehue;
const semantic = tokens.semantic.mode;
const css = read('src/ui/tokens/tokens.css');
for (const id of GAME_MODE_IDS) {
  const name = tokenName(id);
  assert.ok(parseHex(hues[`modehue-${name}`]), `tokens.json: modehue-${name} is a hex hue`);
  assert.equal(semantic[`mode-${name}`]?.value, `{modehue-${name}}`, `tokens.json: mode-${name} reads its hue`);
  assert.ok(css.includes(`--mode-${name}:var(--modehue-${name})`), `tokens.css: --mode-${name} is generated (node tools/gen-tokens.mjs)`);
}
const modeHexes = Object.fromEntries(GAME_MODE_IDS.map((id) => [id, hues[`modehue-${tokenName(id)}`]]));

// 2. contrast and separation
const ORIGINAL = { standard: '#efb258', capture_the_flag: '#5dd0db', zone_control: '#64c6fb', turbo_ball: '#a8e46a',
  endless_horde: '#f5827b', frontline_assault: '#e6a875', mars: '#c8a2ff' };
for (const [id, hex] of Object.entries(ORIGINAL)) assert.equal(modeHexes[id], hex, `${id} keeps the battle menu's original hue`);
const PLATES = { plate: '#0d1014', page: '#0b0e11', raised: '#11151a', tile: '#1a1f25' };
for (const [id, hex] of Object.entries(modeHexes)) {
  for (const [plate, bg] of Object.entries(PLATES)) {
    const ratio = contrastRatio(parseHex(hex), parseHex(bg));
    assert.ok(ratio >= 4.5, `${id} ${hex} holds 4.5:1 on the ${plate} (${ratio.toFixed(2)})`);
  }
}
// the kit's own colours a mode glyph must not read as: the accent, the two teams, the squad and ink
const KIT = { accent: '#f0a030', 'team-own': '#57b8ff', 'team-enemy': '#ff5a4e', squad: '#5bd69b', 'ink-3': '#c9c5bb', 'ink-1': '#f6f3ec' };
for (const id of GAME_MODE_IDS.filter((mode) => !(mode in ORIGINAL))) {
  const others = { ...Object.fromEntries(Object.entries(modeHexes).filter(([other]) => other !== id)), ...KIT };
  for (const [other, hex] of Object.entries(others)) {
    for (const view of VISION_VIEWS) {
      const d = deltaE(view, parseHex(modeHexes[id]), parseHex(hex));
      assert.ok(d >= 8, `${id} keeps 8 ΔE from ${other} in ${view} vision (${d.toFixed(1)})`);
    }
  }
}

// 3. the kit maps every mode
const components = read('src/ui/components/components.css');
for (const id of GAME_MODE_IDS) {
  assert.ok(components.includes(`[data-mode-tone='${id}']{--mode-ink:var(--mode-${tokenName(id)})}`),
    `components.css maps data-mode-tone=${id} to --mode-ink`);
}

// 4. one source: no mode hue as a literal outside the token files
const TOKEN_FILES = new Set(['src/ui/tokens/tokens.json', 'src/ui/tokens/tokens.css', 'src/ui/tokens/tokens.ts',
  'src/ui/tokens/modeColours.selftest.mjs']);
const literal = new RegExp(Object.values(modeHexes).map((hex) => hex.slice(1)).join('|'), 'i');
const walk = (dir, out = []) => {
  for (const name of readdirSync(join(ROOT, dir))) {
    const path = join(dir, name);
    if (statSync(join(ROOT, path)).isDirectory()) walk(path, out);
    else if (/\.(css|ts|mjs|html)$/.test(name)) out.push(path);
  }
  return out;
};
const leaks = walk('src').filter((path) => !TOKEN_FILES.has(path) && literal.test(read(path)));
assert.deepEqual(leaks.map((path) => relative(ROOT, join(ROOT, path))), [], 'mode hues live only in the token files');

// 5. the registered call sites paint the mode's hue
const SITES = [
  ['src/ui/playMenu.ts', 'data-mode-tone="${rule.id}"', "Rooms' rule tiles carry their mode"],
  ['src/ui/playMenu.ts', '.cot-play .rule svg{display:block;color:var(--mode-ink,currentColor)}', "Rooms' rule glyphs paint the mode"],
  ['tools/home-premiere.mjs', 'data-mode-tone="${id}"', "/home's modes rail carries its mode"],
  ['src/presentation/home.css', '.play-tile__nm .cot-i{flex:none;width:24px;height:24px;color:var(--mode-ink,var(--ink-2))}', "/home's rail glyphs paint the mode"],
  ['src/ui/garage.ts', 'data-mode-tone="${id}"', "Deploy's mode tiles and rows carry their mode"],
  ['src/ui/deploy.css', '.cot-garage .cot-battle-choice .choice-icon svg{color:var(--mode-ink,var(--ink-2));}', "Deploy's tile and row glyphs paint the mode"],
  ['src/ui/garage.ts', 'setupIcon.dataset.modeTone = battleGameMode;', "Deploy's heading glyph carries its mode"],
  ['src/ui/deploy.css', '.cot-garage .cot-battle-menu.open .cot-battle-preview-icon svg{color:var(--mode-ink,var(--ink-2));}', "Deploy's heading glyph paints the mode"],
  ['src/ui/serviceRecordView.ts', '<span data-mode-tone="${battle.mode}">', "a Record battle's place line carries its mode"],
  ['src/ui/serviceRecord.css', '.cot-record-battle-what small [data-mode-tone] svg{color:var(--mode-ink,var(--ink-3))}', "a Record battle's mode glyph paints the mode"],
  ['src/docs/chapters/modes.ts', '<h3 data-mode-tone="${mode}">', "the Field Manual's mode headings carry their mode"],
  ['src/docs/chapters/modes.ts', '<a href="#${modeAnchor(mode)}" data-mode-tone="${mode}">', "the Field Manual's modes table rows carry their mode"],
  ['src/docs/chapters/multiplayer.ts', '<a href="${modes}#${modeAnchor(mode)}" data-mode-tone="${mode}">', "the Field Manual's multiplayer mode chips carry their mode"],
  ['src/docs/chapters.css', '[data-mode-tone] .cot-i.dm-mode-glyph{color:var(--mode-ink,var(--ink-3))}', "the Field Manual's mode glyphs paint the mode"],
  ['src/ui/hud.ts', 'modeStatusEl.dataset.modeTone = modeId;', "the battle HUD's objective plate carries its mode"],
  ['src/ui/battleHudLayout.css', '.cot-mode-status .mi{grid-column:1;grid-row:1;color:var(--mode-ink,var(--objective-accent))}', "the objective plate's glyph paints the mode"],
  ['src/ui/battleLoad.ts', 'modeChip.dataset.modeTone = normalizeGameMode(info.modeId);', "the battle load's mode chip carries its mode"],
  ['src/ui/battleLoad.ts', '.cot-bl .rules .gi{display:flex;color:var(--mode-ink,var(--ink-3));}', "the battle load's mode glyph paints the mode"],
  ['src/ui/endScreen.ts', '<span class="mode" data-mode-tone="${mode.id}"', "the end report's mode chip carries its mode"],
  ['src/ui/endScreen.ts', '.cot-es .es-meta svg{color:var(--mode-ink,var(--ink-3))}', "the end report's mode glyph paints the mode"],
  ['src/ui/garage.ts', 'data-game-mode="${id}" data-mode-tone="${id}"', "every Garage Deploy choice carries its mode"],
  ['src/ui/garage.ts', 'data-proving data-mode-tone="proving_ground"', "the Garage's proving-ground choice carries its mode"],
  ['src/ui/garage.ts', 'battleMenu.dataset.modeTone = battleGameMode;', "the Garage battle menu carries its selected mode"],
  ['src/ui/garage.css', '.cot-battle-menu,.cot-garage [data-mode-tone]{--mode-color:var(--mode-ink,var(--mode-standard));}',
    "the Garage battle menu and its choices read every mode's tone (the plate's glyph and title, the features, the chosen edge)"],
  ['src/ui/garage.css', ".cot-garage .cot-battle-choice[data-mode-tone]:not([aria-pressed='true']) .choice-icon{color:var(--mode-color);}",
    "a Garage Deploy choice's glyph paints its mode"],
];
for (const [path, text, what] of SITES) assert.ok(read(path).includes(text), `${what} (${path})`);
// the Garage's battle menu names no mode by hand: every mode reaches it through the kit's data-mode-tone mapping
assert.doesNotMatch(read('src/ui/garage.css'), /\[data-rule='[a-z_]+'\][^{]*\{--mode-color/, 'garage.css maps no mode by hand');

console.log(`modeColours.selftest: ${GAME_MODE_IDS.length} modes, one token each, contrast and separation held, ${SITES.length} call sites on the tokens`);
