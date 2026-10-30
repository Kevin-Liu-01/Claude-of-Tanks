// The transient-surface census (static): every surface the source puts on the page's stack (components/surfaceStack.ts)
// has a row in src/ui/transientSurfaceRegistry.ts, every row's owner still names its id, every module that opens a surface
// owns a row, and every row's place (the surface it stands on, its recipes) is whole. The browser census
// (tools/surface-pairs.mjs) drives the pairs. Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRANSIENT_SURFACES } from './transientSurfaceRegistry.ts';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const rows = Object.entries(TRANSIENT_SURFACES);
const ids = new Set(rows.map(([id]) => id));

const sources = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.ts$/.test(name) && !/\.d\.ts$/.test(name)) sources.push(relative(ROOT, path));
  }
};
walk(join(ROOT, 'src'));
const text = new Map(sources.map((file) => [file, readFileSync(join(ROOT, file), 'utf8')]));

// 1. Every surface id the source opens, in each way a surface takes one: its own TransientSurface, a room's pickSurface, a
// picker menu's id, a modal's or a select's surface option.
const found = new Map();
const note = (id, file) => { if (!found.has(id)) found.set(id, new Set()); found.get(id).add(file); };
for (const [file, source] of text) {
  if (file === 'src/ui/transientSurfaceRegistry.ts' || file.endsWith('surfaceStack.ts')) continue;
  for (const match of source.matchAll(/:\s*TransientSurface(?:\s*=>\s*\(\{|\s*=\s*\{)\s*\n?\s*id:\s*([^,\n]+),/g)) {
    // (a ternary's id: its results, never the value it compares)
    for (const quoted of match[1].matchAll(/(?<!=== )'([a-z0-9-]+)'/g)) note(quoted[1], file);
  }
  for (const match of source.matchAll(/pickSurface\('([a-z0-9-]+)'/g)) note(match[1], file);
  for (const match of source.matchAll(/dialogSurface\([^,]+, '([a-z0-9-]+)'\)/g)) note(match[1], file);
  for (const match of source.matchAll(/create\w*PickerMenu\([^]{0,160}?\bid: '([a-z0-9-]+)'/g)) note(match[1], file);
  for (const match of source.matchAll(/createModal\(\{[^}]*?surface:\s*'([a-z0-9-]+)'/g)) note(match[1], file);
}
const unregistered = [...found].filter(([id]) => !ids.has(id)).map(([id, files]) => `${id} (${[...files].join(', ')})`);
assert.deepEqual(unregistered, [], `surfaces with no registry row: ${unregistered.join('; ')}`);

// 2. Every row's owner exists and names its id; a row that is only a default (the shared modal's) names it in its option.
for (const [id, row] of rows) {
  assert.ok(existsSync(join(ROOT, row.owner)), `${id}: its owner ${row.owner} is gone`);
  assert.ok(text.get(row.owner)?.includes(`'${id}'`), `${id}: ${row.owner} no longer names it`);
}

// 3. Every module that opens a surface owns a row (the kit's own components open under their callers' ids).
const KIT = new Set(['src/ui/components/surfaceStack.ts', 'src/ui/components/pickerMenu.ts']);
const owners = new Set(rows.map(([, row]) => row.owner));
for (const [file, source] of text) {
  if (KIT.has(file) || !/\b(?:openSurface|dialogSurface)\(/.test(source)) continue;
  assert.ok(owners.has(file), `${file} opens a surface but owns no row`);
}

// 4. Every dialog, popover and modal the source shows stands on the stack (owner 2026-10-27: "audit all dropdowns and ui
// surfaces and make sure they share components"): a file that shows a modal or a popover, or marks a box a modal dialog,
// opens it as a surface, builds it on the kit (the picker menu, the shared modal), or is an exempt with its reason.
const OFF_STACK_EXEMPT = {
  'src/ui/components/hoverTip.ts': 'the hover tip: a tooltip, never a surface (it takes no focus and no key)',
  'src/ui/richTooltip.ts': "the service record's rich tip: a tooltip",
  'src/ui/endScreen.ts': "the battle's report: the screen a battle ends on, not a surface over one",
  'src/engine/renderer.ts': "the renderer's lost-context notice: the page's last state",
  'src/audio/interfaceSounds.ts': "names the dialogs' roles to choose a sound; shows none",
};
const SHOWS = /\.showModal\(|\.showPopover\(|aria-modal|role',\s*'dialog'|role="dialog"/;
const ON_STACK = /\b(?:openSurface|dialogSurface|createPickerMenu|createModal|createSelectPickerMenu)\(/;
const offStack = [...text].filter(([file, source]) => !KIT.has(file) && !(file in OFF_STACK_EXEMPT) && !file.endsWith('transientSurfaceRegistry.ts')
  && SHOWS.test(source) && !ON_STACK.test(source)).map(([file]) => file);
assert.deepEqual(offStack, [], `dialogs or popovers off the surface stack: ${offStack.join(', ')}`);
for (const file of Object.keys(OFF_STACK_EXEMPT)) assert.ok(text.has(file), `${file}: an exempt that is gone`);

// 5. Every row's place is whole: the surface it stands on is a row of its screen or a page-wide one, and every recipe
// presses at least one control.
for (const [id, row] of rows) {
  for (const on of typeof row.on === 'string' ? [row.on] : Object.values(row.on ?? {})) assert.ok(ids.has(on), `${id}: it stands on ${on}, which has no row`);
  for (const [layout, recipe] of Object.entries(row.open)) {
    assert.ok(Array.isArray(recipe) && recipe.length > 0 && recipe.every((step) => typeof step === 'string' && step.length > 0),
      `${id}: its ${layout} recipe presses nothing`);
  }
}
// the census's screens each hold at least one pair it can open
for (const screen of ['garage', 'deploy', 'settings', 'gallery']) {
  const openable = rows.filter(([, row]) => row.screen === screen && Object.keys(row.open).length);
  assert.ok(openable.length >= 1, `${screen}: the census can open none of its surfaces`);
}

console.log(`transientSurfaceRegistry.selftest: ${ids.size} surfaces registered, every opened surface named, every owner and place whole PASS`);
