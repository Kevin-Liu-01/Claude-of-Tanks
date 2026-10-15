// Owner (2026-10-14): "in jump modes, jump should always be placed farthest left in the stuff u can do row".
// Every jump mode (every ruleset with a jump launch, Mars in each gravity world) x every loadout the row can show
// (each subset of special action, drone, extra ATGM, smoke, lights, roof gun, in or out of cooldown) leads with the
// jump; every other mode keeps the row's existing order. The HUD's one row (desktop and touch) is arranged by the
// same function, and nothing in the row's styles reorders it visually.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { GAME_MODE_IDS } from '../sim/matchModes.ts';
import { MARS_CACHE_IDS, MARS_GRAVITY_IDS, matchRulesetFor } from '../sim/matchRuleset.ts';
import { arrangeVehicleControls, isJumpMode, vehicleControlOrder, visibleVehicleControls } from './vehicleControlOrder.ts';

// The row's order before this change, as the HUD built it: special, jump, drone, ATGM, smoke, lights, roof gun.
const BUILD_ORDER = ['special', 'jump', 'drone', 'missile', 'smoke', 'lights', 'roofGun'];
const LOADOUT = BUILD_ORDER.filter((id) => id !== 'jump');

// --- every ruleset the HUD can be handed: each mode, and Mars in every gravity world and cache cadence ---
const rulesets = GAME_MODE_IDS.map((mode) => ({ name: mode, ruleset: matchRulesetFor(mode) }));
for (const marsGravity of MARS_GRAVITY_IDS) {
  for (const marsCaches of MARS_CACHE_IDS) {
    rulesets.push({ name: `mars/${marsGravity}/${marsCaches}`, ruleset: matchRulesetFor('mars', null, { marsGravity, marsCaches }) });
  }
}
const jumpModes = rulesets.filter(({ ruleset }) => isJumpMode(ruleset)).map(({ name }) => name);
const plainModes = rulesets.filter(({ ruleset }) => !isJumpMode(ruleset)).map(({ name }) => name);
assert.ok(jumpModes.includes('turbo_ball') && jumpModes.includes('mars'), `Turbo Ball and Mars are jump modes: ${jumpModes}`);
assert.ok(MARS_GRAVITY_IDS.every((g) => jumpModes.includes(`mars/${g}/standard`)), 'every Mars gravity world keeps its jump');
assert.ok(plainModes.includes('standard') && plainModes.length >= GAME_MODE_IDS.length - 2, `the other modes have no jump: ${plainModes}`);
for (const { name, ruleset } of rulesets) assert.equal(isJumpMode(ruleset), ruleset.jumpMps != null, `${name}: a jump mode is a ruleset with a jump launch`);
assert.equal(isJumpMode(null), false, 'no ruleset (garage, before the pre-battle rules arrive) has no jump');

// --- the pure ordering: every mode x every loadout subset (a cooling item is disabled, never hidden: see below) ---
const loadouts = [];
for (let mask = 0; mask < 1 << LOADOUT.length; mask++) loadouts.push(new Set(LOADOUT.filter((_, i) => mask & (1 << i))));
let combinations = 0;
for (const { name, ruleset } of rulesets) {
  const jump = isJumpMode(ruleset);
  assert.deepEqual([...vehicleControlOrder(jump)].sort(), [...BUILD_ORDER].sort(), `${name}: the order names every row item once`);
  for (const shown of loadouts) {
    // the mode alone decides the jump: offering it in the shown set neither adds it to a plain mode nor moves it
    for (const withJumpInLoadout of [false, true]) {
      const offered = new Set(shown);
      if (withJumpInLoadout) offered.add('jump');
      const row = visibleVehicleControls(offered, jump);
      const loadoutOrder = LOADOUT.filter((id) => shown.has(id));
      if (jump) {
        assert.equal(row[0], 'jump', `${name} [${[...shown]}]: the jump leads the row`);
        assert.deepEqual(row.slice(1), loadoutOrder, `${name} [${[...shown]}]: the loadout follows in its own order`);
      } else {
        assert.deepEqual(row, loadoutOrder, `${name} [${[...shown]}]: a mode without a jump keeps the row's order and shows no jump`);
      }
      combinations++;
    }
  }
}

// --- the DOM arrangement the HUD applies (one fake row: firstChild / nextSibling / insertBefore) ---
function fakeRow(ids) {
  const nodes = Object.fromEntries(ids.map((id) => [id, { id, hidden: false, disabled: false, parent: null }]));
  const children = ids.map((id) => nodes[id]);
  const sibling = (node) => { const i = children.indexOf(node); return i < 0 ? null : children[i + 1] ?? null; };
  for (const node of children) Object.defineProperty(node, 'nextSibling', { get: () => sibling(node) });
  const row = {
    get firstChild() { return children[0] ?? null; },
    insertBefore(node, reference) {
      const from = children.indexOf(node);
      if (from >= 0) children.splice(from, 1);
      const at = reference ? children.indexOf(reference) : children.length;
      assert.ok(at >= 0, 'the reference node is a child of the row');
      children.splice(at, 0, node);
      return node;
    },
    order: () => children.map((node) => node.id),
    visible: (jump) => children.filter((node) => (node.id === 'jump' ? jump : !node.hidden)).map((node) => node.id),
  };
  return { row, nodes };
}
{
  const { row, nodes } = fakeRow(BUILD_ORDER);
  assert.ok(arrangeVehicleControls(row, nodes, false) > 0);
  assert.deepEqual(row.order(), [...LOADOUT, 'jump'], 'outside a jump mode the hidden jump waits at the far end');
  assert.equal(arrangeVehicleControls(row, nodes, false), 0, 'a repeat call moves nothing');
  assert.ok(arrangeVehicleControls(row, nodes, true) > 0);
  assert.deepEqual(row.order(), ['jump', ...LOADOUT], 'a jump mode moves the jump farthest left');
  assert.equal(arrangeVehicleControls(row, nodes, true), 0, 'a repeat call moves nothing');
  // a session that hops through every mode, each with every loadout and cooldown state, always shows the pure order
  let arranged = 0;
  for (const { name, ruleset } of rulesets) {
    const jump = isJumpMode(ruleset);
    arrangeVehicleControls(row, nodes, jump);
    arranged++;
    for (const shown of loadouts) {
      for (const cooling of [false, true]) {
        for (const id of LOADOUT) { nodes[id].hidden = !shown.has(id); nodes[id].disabled = cooling; }
        nodes.jump.disabled = cooling;
        assert.deepEqual(row.visible(jump), visibleVehicleControls(shown, jump), `${name} [${[...shown]}] cooling=${cooling}: the row shows the ordering`);
      }
    }
  }
  assert.equal(arranged, rulesets.length);
}

// --- the HUD wiring: one row, every item mapped, one arrangement call, the jump flag in one place ---
const hud = readFileSync(new URL('./hud.ts', import.meta.url), 'utf8');
const rowChildren = [...hud.matchAll(/el\(\s*'button'\s*,\s*'([^']+)'\s*,\s*controlsRow\s*\)/g)].map((m) => m[1]);
assert.deepEqual(rowChildren, ['cot-special', 'cot-jump', 'cot-auxiliary cot-drone-control', 'cot-auxiliary', 'cot-auxiliary'],
  'the row holds the special action, the jump, the drone, the ATGM and the three auxiliary buttons (smoke, lights, roof gun) and nothing else');
assert.match(hud, /const auxiliaryButtons = \(\['smoke','lights','roofGun'\] as const\)\.map/, 'the auxiliary trio is smoke, lights, roof gun');
assert.match(hud, /const vehicleControls=\{jump:jumpHint,special:specialButton,drone:droneButton,missile:missileButton,\n\s*smoke:auxiliaryButton\('smoke'\),lights:auxiliaryButton\('lights'\),roofGun:auxiliaryButton\('roofGun'\)\};/,
  'every row button is handed to the ordering by its id');
assert.equal(hud.match(/arrangeVehicleControls\(/g)?.length, 1, 'the HUD arranges the row in exactly one place');
assert.match(hud, /if\(controlsJumpMode===on\)return;\n\s*controlsJumpMode=on;\n\s*arrangeVehicleControls\(controlsRow,vehicleControls,on\);/,
  'the row is rearranged only when the jump flag changes, never per frame');
assert.equal(hud.match(/jumpHint\.classList\.toggle\(/g)?.length, 1, 'the jump flag is set in one place, beside the arrangement');
assert.match(hud, /setControlsJumpMode\(isJumpMode\(ruleset\)\);/, 'the pre-battle rules set the flag');
assert.match(hud, /if\(frame\.matchModeState\?\.id\)setControlsJumpMode\(isJumpMode\(/, 'the live mode state sets the flag');
assert.doesNotMatch(hud, /controlsRow\.(append|prepend|appendChild|insertBefore|replaceChildren)\(/, 'nothing else reorders the row');

// --- no style reorders the row visually (order, row-reverse, rtl) on desktop or touch ---
const ROW_SELECTOR = /cot-vehicle-controls|cot-jump|cot-special|cot-auxiliary|cot-drone-control/;
const sources = [
  ...readdirSync(new URL('.', import.meta.url)).filter((f) => f.endsWith('.css')).map((f) => `./${f}`),
  './hud.ts', './touchControls.ts', './battleHudLayout.ts',
];
let rowRules = 0;
for (const file of sources) {
  const text = readFileSync(new URL(file, import.meta.url), 'utf8');
  for (const block of text.split('}')) {
    const brace = block.lastIndexOf('{');
    if (brace < 0 || !ROW_SELECTOR.test(block.slice(0, brace))) continue;
    const declarations = block.slice(brace + 1);
    rowRules++;
    assert.doesNotMatch(declarations, /(^|[;\s])order\s*:|row-reverse|column-reverse|(^|[;\s])direction\s*:\s*rtl/,
      `${file}: a row rule must not reorder its items (${block.slice(0, brace).trim().slice(-80)})`);
  }
}
assert.ok(rowRules >= 20, `the style scan reads the row's rules (${rowRules})`);
// the scan itself catches a reorder
assert.match(' order:-1', /(^|[;\s])order\s*:/); assert.doesNotMatch('border:0;border-bottom:1px', /(^|[;\s])order\s*:/);

console.log(`vehicleControlOrder.selftest: ${jumpModes.length} jump rulesets lead with the jump and ${plainModes.length} others keep the row order across ${loadouts.length} loadouts (${combinations} combinations); the HUD row is arranged once per mode change and none of ${rowRules} row styles reorders it`);
