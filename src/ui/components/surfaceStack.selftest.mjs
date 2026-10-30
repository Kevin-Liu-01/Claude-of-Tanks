// The surface stack (surfaceStack.ts): one open transient surface per level (owner 2026-10-27: "what if i have equipment open
// and select consumables, the old surface needs to go away while new one comes in"). The pure plan (planOpen, planPress)
// and the stack's replace and close order, on stand-in surfaces; the source pins the page's keys. Copyright © 2026
// Kevin B. Liu.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { closeSurface, openSurface, openSurfaceIds, planOpen, planPress } from './surfaceStack.ts';

// stand-in nodes and boxes: a node is a path, a box holds the paths under its own
const at = (path) => ({ path });
const box = (prefix) => ({ contains: (node) => !!node && node.path.startsWith(prefix) });

// 1. The plan: a surface opened from inside an open one stands on it; any other replaces the open ones above its parent.
assert.deepEqual(planOpen([], at('band/eq0')), { parent: -1, replaced: [] }, 'the first surface stands on the page');
assert.deepEqual(planOpen([box('eqpick')], at('band/cs0')), { parent: -1, replaced: [0] }, 'a sibling replaces the open one');
assert.deepEqual(planOpen([box('settings')], at('settings/quality')), { parent: 0, replaced: [] }, 'a surface opened inside one stands on it');
assert.deepEqual(planOpen([box('settings'), box('menu:quality')], at('settings/colours')), { parent: 0, replaced: [1] },
  "a second menu inside the panel replaces the first, never the panel");
assert.deepEqual(planOpen([box('settings'), box('menu:quality')], at('header/gear')), { parent: -1, replaced: [1, 0] },
  'a surface opened from the page replaces every open one, the top first');
assert.deepEqual(planOpen([box('a'), box('b')], null), { parent: -1, replaced: [1, 0] }, 'no opener: a surface of the page');

// a press closes the top surface only when it lands outside it and its controls, and the top is not modal
assert.equal(planPress(undefined, at('x')), false, 'nothing open, nothing closes');
assert.equal(planPress(box('menu'), at('menu/row')), false, 'a press inside is its own');
assert.equal(planPress(box('menu'), at('page/other')), true, 'a press outside closes it');
assert.equal(planPress({ ...box('dialog'), modal: true }, at('page/other')), false, 'a modal surface answers its own scrim');
assert.equal(planPress(box('menu'), null), false);

// 2. The stack on stand-in surfaces (Node has no window: the page's keys are not installed, the stack is).
const log = [];
const surfaces = new Map();
const surface = (id, prefix, owns) => {
  const s = {
    id,
    element: () => box(prefix),
    owns: owns ? (node) => node.path.startsWith(owns) : undefined,
    close: (reason) => { log.push(`${id}:${reason}`); closeSurface(s); },
  };
  surfaces.set(id, s);
  return s;
};
const equipment = surface('garage-equipment', 'eqpick', 'band/eq');
const consumables = surface('garage-consumables', 'cspick', 'band/cs');
const settings = surface('settings', 'settings');
const quality = surface('settings-quality', 'menu:quality', 'settings/quality');
const colours = surface('settings-colour-preset', 'menu:colours', 'settings/colours');

openSurface(equipment, at('band/eq0'));
assert.deepEqual(openSurfaceIds(), ['garage-equipment']);
openSurface(equipment, at('band/eq1'));
assert.deepEqual(openSurfaceIds(), ['garage-equipment'], 'opening an open surface again changes nothing');
openSurface(consumables, at('band/cs0'));
assert.deepEqual(log, ['garage-equipment:replace'], 'the consumables replace the equipment, in the same press');
assert.deepEqual(openSurfaceIds(), ['garage-consumables']);
assert.ok(!openSurfaceIds().includes('garage-equipment'));

log.length = 0;
openSurface(settings, at('header/gear'));
assert.deepEqual(log, ['garage-consumables:replace'], 'Settings replaces the open picker');
openSurface(quality, at('settings/quality'));
assert.deepEqual(openSurfaceIds(), ['settings', 'settings-quality'], 'a menu inside Settings stands on it');
openSurface(colours, at('settings/colours'));
assert.deepEqual(openSurfaceIds(), ['settings', 'settings-colour-preset'], 'the next menu replaces the first, Settings stays');
assert.equal(openSurfaceIds().at(-1), 'settings-colour-preset');
log.length = 0;
closeSurface(settings);
assert.deepEqual(log, ['settings-colour-preset:replace'], 'closing a surface closes the ones standing on it');
assert.deepEqual(openSurfaceIds(), []);
closeSurface(settings);
assert.deepEqual(openSurfaceIds(), [], 'closing a closed surface changes nothing');

// 3. The page's keys (source): one Escape and one outside press in the window's capture, ahead of the page's own; the
// census reads the open ids.
const source = readFileSync(new URL('./surfaceStack.ts', import.meta.url), 'utf8');
assert.match(source, /window\.addEventListener\('keydown', \(event\) => \{[\s\S]*?event\.stopImmediatePropagation\(\);[\s\S]*?top\.close\('escape'\);[\s\S]*?\}, true\);/,
  'Escape closes the top surface only, in the capture');
assert.match(source, /if \(top\.keepsEscape\?\.\(event\)\) return;/, 'a surface keeps an Escape it uses');
assert.match(source, /window\.addEventListener\('pointerdown', \(event\) => \{[\s\S]*?top!\.close\('outside'\);\n  \}, true\);/,
  'an outside press closes the top surface on its way down');
assert.doesNotMatch(source.slice(source.indexOf("addEventListener('pointerdown'")), /preventDefault|stopPropagation/,
  'the press goes on to its target: never swallowed');
assert.match(source, /Object\.defineProperty\(window, '__cotSurfaces', \{ value: openSurfaceIds/, 'the census reads the open ids');
assert.match(source, /const sweep = \(\): void => \{[\s\S]*?element\.getClientRects\(\)\.length\) continue;\s*closeSurface\(surface\);\s*surface\.close\('replace'\);/,
  'a resize that hides an open surface closes it');
assert.match(source, /window\.addEventListener\('cot:layoutchange', \(\) => \{ if \(stack\.length\) sweep\(\); \}\);/, 'so does a change of layout');

console.log('surfaceStack.selftest: one surface per level (replace, stand on, close with its children), the outside press and Escape PASS');
