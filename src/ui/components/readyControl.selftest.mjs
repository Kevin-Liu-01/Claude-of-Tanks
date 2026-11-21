// readyControl.selftest.mjs — the room's one ready control (owner 2026-11-19). Copyright © 2026 Kevin B. Liu.
//
// The Play menu, the Garage's room strip and the end screen draw their Ready toggle and their roster's readiness
// through readyControl.ts. Before it, a pressed Ready still read "Ready" (Play menu) or named the state a press would
// leave ("NOT READY" on the end screen's cancel). The view now says what the seat is and what a press does.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { readyControlView, readyTagState, waitingOnOthers } = await import('./readyControl.ts');
const en = JSON.parse(readFileSync(new URL('../i18nCatalog.en-US.json', import.meta.url), 'utf8'));

// unready: one action word, not pressed
const idle = readyControlView({ ready: false });
assert.equal(idle.state, 'idle');
assert.equal(idle.label, en['readyControl.readyUp']);
assert.equal(idle.hint, '');
assert.equal(idle.pressed, false);

// ready: a different label, pressed, and the hint names what is pending and that a press cancels
const waiting = readyControlView({ ready: true, waitingOn: 2 });
assert.equal(waiting.state, 'ready');
assert.equal(waiting.pressed, true);
assert.notEqual(waiting.label, idle.label, 'ready and unready never share a label');
assert.equal(waiting.hint, `${en['readyControl.waitingFor'].replace('{count}', '2')} · ${en['readyControl.cancel']}`);
assert.equal(readyControlView({ ready: true, waitingOn: 0 }).hint, `${en['readyControl.allReady']} · ${en['readyControl.cancel']}`);
assert.equal(readyControlView({ ready: true }).hint, en['readyControl.cancel'], 'a surface that cannot count still says Cancel');
assert.notEqual(waiting.ariaLabel, idle.ariaLabel, 'the accessible name says what a press does');

// a spectator has no readiness
const watching = readyControlView({ ready: true, spectator: true });
assert.equal(watching.state, 'watching');
assert.equal(watching.pressed, false);

// the roster: every seat's state, offline first
assert.equal(readyTagState({ ready: true, connected: true, team: 'alpha' }), 'ready');
assert.equal(readyTagState({ ready: false, connected: true, team: 'bravo' }), 'waiting');
assert.equal(readyTagState({ ready: true, connected: false, team: 'alpha' }), 'offline');
assert.equal(readyTagState({ ready: false, connected: true, team: 'spectator' }), 'watching');
for (const state of ['ready', 'waiting', 'offline', 'watching']) assert.ok(en[`readyControl.tag.${state}`], `tag copy for ${state}`);

// the count a ready seat waits on: the other commanders not ready (spectators and the seat itself never count)
const players = [
  { id: 'me', team: 'alpha', ready: true }, { id: 'a', team: 'alpha', ready: false },
  { id: 'b', team: 'bravo', ready: true }, { id: 'c', team: 'bravo', ready: false }, { id: 's', team: 'spectator', ready: false },
];
assert.equal(waitingOnOthers(players, 'me'), 2);

// one renderer: the three surfaces call it and none keeps its own ready words
for (const [file, call] of [['../playMenu.ts', 'renderReadyControl(readyBtn'], ['../garage.ts', 'renderReadyControl(roomReady'],
  ['../endScreen.ts', 'renderReadyControl(ready']]) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  assert.ok(source.includes(call), `${file} draws its Ready through readyControl.ts`);
  assert.doesNotMatch(source, /'(?:playMenu\.ready\.notReady|playMenu\.ready\.markNotReady|endScreen\.notReady|endScreen\.readyNext)'/,
    `${file} keeps no ready label of its own`);
}

console.log('readyControl.selftest: two-state labels, pressed state, pending hint, roster tags, one renderer on three surfaces');
