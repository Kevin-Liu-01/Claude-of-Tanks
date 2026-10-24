// controls.selftest.mjs — the manual's controls chapter keeps to the game: its key tables cover every action the
// settings list, and every Watch-mode key it names for riding and driving is one src/game/watchController.ts handles.
// Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WATCH_KEYS, controlsSections } from './controls.ts';
import { ACTION_DEFS } from '../../game/input.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const watch = readFileSync(join(ROOT, 'src/game/watchController.ts'), 'utf8');
for (const key of WATCH_KEYS.filter((entry) => entry.view !== 'drone')) {
  for (const code of key.codes) {
    assert.ok(watch.includes(`case '${code}'`) || watch.includes(`code === '${code}'`), `watchController handles ${code} (${key.label})`);
  }
}
const sections = controlsSections();
assert.deepEqual(sections.map((section) => section.id), ['keys', 'hold', 'touch', 'watch'], 'the chapter keeps its four sections');
const keys = sections[0].html;
assert.equal((keys.match(/<tr><th scope="row">/g) ?? []).length, ACTION_DEFS.length, 'one row per action the settings list');
console.log(`controls.selftest: ${ACTION_DEFS.length} actions in the tables; ${WATCH_KEYS.length} Watch keys held to watchController.ts`);
