// The key-binding census (owner 2026-10-28: "sometimes battle diagnostics randomly appears when u click stuff even if i dont
// want it to ... stop that from hhappening unless u trigger it"). Copyright (c) 2026 Kevin B. Liu.
//
// Every default key the game acts on, by the phases in which its owner is live: the input layer's actions (input.ts
// DEFAULT_BINDINGS and DEFAULT_BINDINGS2) and the keys owners read off the event themselves (KEY_OWNERS below, each row
// checked against its owner's source). It fails on
//   - two input actions with one default key (the layer's dedupe would leave one of them unbound);
//   - two owners of one key in a phase where both are live (the battle diagnostics' F8, live everywhere, and the Studio's
//     F8 in the Garage: a press on Studio toggled the diagnostics, and saved them on);
//   - a function key an owner compares a key code with that no row names (a new one is a new row here first);
//   - a key the browser keeps (reload, the address bar, caret browsing, full screen, the developer tools) taken by default;
//   - a synthetic KeyboardEvent anywhere in src/ (the Garage's Studio button dispatched F8, and the input layer heard it);
//   - the diagnostics on Escape: a battle's Escape opens Settings, never the diagnostics.
// Escape as a surface's close (surfaceStack.ts, the diagnostics panel's own) is the surface layer's: it closes what stands
// on top and goes no further, so it is no owner here.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_BINDINGS, DEFAULT_BINDINGS2 } from './input.ts';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PHASES = ['garage', 'studio', 'battle', 'killcam'];

/** The input actions live outside a battle; the rest are a battle's (their handlers stand down elsewhere). The
 *  diagnostics stand aside while the Studio is open (main.ts: if (studio.active) return). */
const ACTION_PHASES = { perfHud: ['garage', 'battle', 'killcam'], settingsMenu: ['garage', 'battle'] };
const BATTLE = ['battle'];

/** Keys owners read off the event themselves, by feature: the files, the codes and the phases they act in. */
const KEY_OWNERS = [
  { feature: 'garage hotkeys', files: ['src/ui/garage.ts'], phases: ['garage'],
    codes: ['KeyB', 'KeyG', 'KeyV', 'KeyT', 'KeyF', 'KeyP', 'KeyI', 'KeyR', 'F1'] },
  { feature: 'studio entry', files: ['src/game/studioAccess.ts', 'src/game/studio.ts'], phases: ['garage'], codes: ['F8'] },
  { feature: 'studio', files: ['src/game/studio.ts', 'src/ui/studioPanel.ts'], phases: ['studio'],
    codes: ['F8', 'KeyJ', 'KeyK', 'KeyL', 'Space', 'Delete', 'Backspace', 'Escape'] },
  { feature: 'minimal HUD', files: ['src/ui/battleUiVisibility.ts'], phases: BATTLE, codes: ['F10'] },
  { feature: 'kill cam', files: ['src/game/killcam.ts'], phases: ['killcam'],
    codes: ['Escape', 'Space', 'Enter', 'NumpadEnter', 'ArrowLeft', 'ArrowRight', 'KeyE', 'KeyQ'] },
];

/** The browser's own: reload, the address bar, caret browsing, full screen, the developer tools. */
const BROWSER_KEYS = new Set(['F5', 'F6', 'F7', 'F11', 'F12']);

const source = (file) => readFileSync(join(ROOT, file), 'utf8');

// --- the input layer's defaults
const byCode = new Map();
for (const [slot, map] of [['primary', DEFAULT_BINDINGS], ['secondary', DEFAULT_BINDINGS2]]) {
  for (const [action, code] of Object.entries(map)) {
    if (!code) continue;
    const list = byCode.get(code) ?? [];
    list.push(`${action} (${slot})`);
    byCode.set(code, list);
  }
}
for (const [code, actions] of byCode) {
  assert.equal(actions.length, 1, `${code} is the default of ${actions.join(' and ')}: the input layer keeps one`);
}

// --- every owner of a key, by phase
const live = new Map(PHASES.map((phase) => [phase, new Map()]));
const claim = (phase, code, who) => {
  const owners = live.get(phase).get(code) ?? [];
  owners.push(who);
  live.get(phase).set(code, owners);
};
for (const [code, [action]] of byCode) {
  const name = action.replace(/ \(.*\)$/, '');
  for (const phase of ACTION_PHASES[name] ?? BATTLE) claim(phase, code, `input action ${action}`);
}
for (const row of KEY_OWNERS) {
  const text = row.files.map(source).join('\n');
  for (const code of row.codes) {
    assert.ok(text.includes(`'${code}'`), `${row.feature}: ${row.files.join(', ')} no longer reads ${code} (a stale row)`);
    for (const phase of row.phases) claim(phase, code, row.feature);
  }
}
for (const [phase, codes] of live) {
  for (const [code, owners] of codes) {
    assert.equal(new Set(owners).size, 1, `${code} in the ${phase} phase is ${[...new Set(owners)].join(' and ')}'s at once`);
  }
}

// --- the browser's keys stay the browser's
for (const code of [...byCode.keys(), ...KEY_OWNERS.flatMap((row) => row.codes)]) {
  assert.ok(!BROWSER_KEYS.has(code), `${code} is the browser's own key`);
}

// --- every source file: function keys only through a row; no synthetic key events
function* sources(dir) {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sources(path);
    else if (/\.(ts|mjs|js)$/.test(entry.name) && !/\.selftest\.mjs$|\.test-support\.mjs$/.test(entry.name)) yield path;
  }
}
const rowed = new Set(KEY_OWNERS.flatMap((row) => row.files.flatMap((file) => row.codes.map((code) => `${file} ${code}`))));
let scanned = 0;
for (const file of sources('src')) {
  const text = source(file);
  scanned++;
  assert.ok(!/new\s+(?:window\.)?KeyboardEvent\s*\(/.test(text),
    `${relative(ROOT, join(ROOT, file))} makes a synthetic KeyboardEvent: call the owner's own function (the Garage's Studio button sent F8)`);
  for (const match of text.matchAll(/\.code\s*[!=]==?\s*'(F\d{1,2})'/g)) {
    assert.ok(rowed.has(`${file} ${match[1]}`), `${file} acts on ${match[1]} with no row in the key census`);
  }
}
assert.ok(scanned > 500, `the scan read ${scanned} source files`);

// --- the diagnostics: their own key, never Escape
assert.notEqual(DEFAULT_BINDINGS.perfHud, 'Escape', 'a battle Escape opens Settings, never the diagnostics');
assert.notEqual(DEFAULT_BINDINGS2.perfHud, 'Escape');
assert.equal(DEFAULT_BINDINGS.perfHud, 'F9', 'the diagnostics keep F9, a key no other owner takes');
assert.match(source('src/main.ts'), /input\.onAction\('perfHud', \(\) => \{\s+(\/\/[^\n]*\n\s*)*if \(studio\.active\) return;/,
  'the diagnostics stand aside while the Studio is open, as the census models them');
const perfHud = source('src/ui/perfHud.ts');
assert.match(perfHud, /event\.key !== 'Escape'[\s\S]{0,200}openSurfaceIds\(\)\.length\) return;[\s\S]{0,120}close\(\);/,
  'the panel\'s Escape closes it, under any open surface, and only closes');
const garage = source('src/ui/garage.ts');
assert.match(garage, /const openStudio = \(\) => \{\s+emit\('ui:click', \{\}\);\s+opts\.onStudio\?\.\(\);/,
  'the Garage\'s Studio button opens the Studio through its own open');

// --- no hidden second key (Main 2026-10-28, from the owner's "why is atgm labeled Q? E does it for me"): on every kind of
// hull each system answers only the keys the battle shows for it, the ATGM Q (and the digit of its own round, which the
// tray names), the reload C, the suspension E. Every default key is pressed on each hull, its effects recorded.
const { createPlayerBattleActions } = await import('./playerBattleActions.ts');
const { createBus } = await import('./stateCore.ts');
const { rulesetUnlimitedFor } = await import('../sim/matchRuleset.ts');
const HULLS = { launcher: 'guided_missile', autoloader: 'magazine_reload', suspension: 'hydropneumatic_aim', plain: 'none' };
const SYSTEM_OF = { guided_missile: 'atgm', magazine_reload: 'reload', hydropneumatic_aim: 'suspension', none: null };
let pressed = 0;
for (const [hull, kind] of Object.entries(HULLS)) {
  const handlers = new Map();
  const input = {
    onAction(action, listener) {
      if (!handlers.has(action)) handlers.set(action, new Set());
      handlers.get(action).add(listener);
      return () => handlers.get(action).delete(listener);
    },
  };
  const effects = [];
  const bus = createBus((event) => { if (event === 'ui:atgmToggle') effects.push('atgm'); });
  const shell = (type, guided = false) => ({ name: type, type, guided, dmg: 1, pen100Mm: 1 });
  const spec = { gun: { shells: [shell('APFSDS'), shell('HEAT', kind === 'guided_missile'), shell('HE')], autoloader: kind === 'magazine_reload' } };
  const player = { id: 'p', spec, state: { overturned: false, grounded: true }, input: { shellSlot: 0 },
    combat: { destroyed: false, shellSlot: 0, ammo: [9, 9, 9], ammoCapacity: [9, 9, 9], magazine: null, crew: {}, fire: {} },
    specialAction: { kind, missileSlot: 1, previousShellSlot: 0, active: false } };
  const base = {
    selectShell(combat, slot) { combat.shellSlot = slot; if (kind === 'guided_missile' && slot === 1) effects.push('atgm'); return true; },
    hasAmmunition: () => true, specialActionKind: () => kind, guidedMissileSlot: () => 1,
    activateSpecialAction() { if (SYSTEM_OF[kind]) effects.push(SYSTEM_OF[kind]); return { ok: true, kind }; },
    startMagazineReload() { effects.push('reload'); return true; }, magazineReloadDenialReason: () => null,
    shellAmmunitionCapacity: () => 9, rulesetUnlimitedFor, hasConsumableRule: () => false, repairAllModules: () => [],
  };
  // (any other rule a key reaches answers nothing: only the three systems are recorded)
  const rules = new Proxy(base, { get: (target, key) => (key in target ? target[key] : () => undefined) });
  createPlayerBattleActions({ game: { phase: 'battle', timeS: 10, player }, bus, input, rules,
    network: { isActive: () => false, queueConsumable() {}, queueAction() {} }, isSettingsOpen: () => false });
  for (const [action, code] of [...Object.entries(DEFAULT_BINDINGS), ...Object.entries(DEFAULT_BINDINGS2)]) {
    effects.length = 0;
    player.combat.shellSlot = 0;
    player.input.shellSlot = 0;
    for (const listener of handlers.get(action) ?? []) listener(code);
    const own = { atgm: ['atgm'], shell2: kind === 'guided_missile' ? ['atgm'] : [], reloadMagazine: ['reload'],
      specialAction: kind === 'hydropneumatic_aim' ? ['suspension'] : [] }[action] ?? [];
    for (const effect of effects) {
      assert.ok(own.includes(effect), `${code} (${action}) runs the ${effect} on a ${hull} hull: a second key the battle does not show for it`);
    }
    pressed++;
  }
}
assert.ok(pressed > 150, `${pressed} presses across the hulls`);

console.log(`keybindingCensus.selftest: PASS (${byCode.size} input defaults, ${KEY_OWNERS.length} key owners, ${scanned} sources)`);
