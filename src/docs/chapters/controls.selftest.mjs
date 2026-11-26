// controls.selftest.mjs — the manual's controls chapter keeps to the game: its key tables cover every action the
// settings list, every replay key it names is one the viewer reads, and every Watch-mode key it names for riding and driving is one src/game/watchController.ts handles.
// Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MINIMAL_HUD_KEY, REPLAY_KEYS, WATCH_KEYS, controlsSections } from './controls.ts';
import { replayKeyAction } from '../../game/replay/replayPlayback.ts';
import { ACTION_DEFS } from '../../game/input.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const watch = readFileSync(join(ROOT, 'src/game/watchController.ts'), 'utf8');
for (const key of WATCH_KEYS.filter((entry) => entry.view !== 'drone')) {
  for (const code of key.codes) {
    assert.ok(watch.includes(`case '${code}'`) || watch.includes(`code === '${code}'`), `watchController handles ${code} (${key.label})`);
  }
}
const sections = controlsSections();
assert.deepEqual(sections.map((section) => section.id), ['keys', 'hold', 'touch', 'phone', 'watch', 'replays', 'photo', 'hud'],
  'the chapter keeps its eight sections');
// (docs-refresh-279) every replay key the chapter names is one the viewer handles: replayKeyAction's, or Escape, which
// src/app/replayViewerRuntime.ts takes to leave
const viewer = readFileSync(join(ROOT, 'src/app/replayViewerRuntime.ts'), 'utf8');
for (const key of REPLAY_KEYS) {
  for (const code of key.codes) {
    assert.ok(replayKeyAction(code) !== null || (code === 'Escape' && viewer.includes("'Escape'")), `the replay viewer handles ${code} (${key.label})`);
  }
}
const visibility = readFileSync(join(ROOT, 'src/ui/battleUiVisibility.ts'), 'utf8');
assert.equal(MINIMAL_HUD_KEY, 'F10', 'the minimal HUD ships on F10');
assert.ok(visibility.includes('!options.isShortcut(event.code)'), 'battleUiVisibility.ts switches the minimal HUD on its binding (settings-unify-278)');
const keys = sections[0].html;
assert.equal((keys.match(/<tr><th scope="row">/g) ?? []).length, ACTION_DEFS.length, 'one row per action the settings list');
console.log(`controls.selftest: ${ACTION_DEFS.length} actions in the tables; ${WATCH_KEYS.length} Watch keys held to watchController.ts; ${REPLAY_KEYS.length} replay keys held to the viewer`);
