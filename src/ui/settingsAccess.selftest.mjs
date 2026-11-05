import assert from 'node:assert/strict';
import { createSettingsAccess } from './settingsAccess.ts';
import { publishKillcamScreen } from '../game/killcamScreen.ts';

class FakeGear extends EventTarget {
  style = { display: '' };
}

let action = null;
let spectating = false;
let releases = 0;
const busHandlers = new Map();
const input = { releaseLock() { releases++; }, onAction(_id, handler) { action = handler; } };
const bus = { on(event, handler) { busHandlers.set(event, [...(busHandlers.get(event) ?? []), handler]); } };
const emit = (event, payload) => { for (const handler of busHandlers.get(event) ?? []) handler(payload); };
// the kill-cam controller publishes its own `active` flag on the bus (killcamScreen.ts, IR15); its edges only notify
let replayLive = false;
publishKillcamScreen(bus, () => replayLive);
const replayBegins = () => { replayLive = true; emit('killcam:begin'); };
const replayDone = () => { replayLive = false; emit('killcam:done'); };
const gear = new FakeGear();
let now = 1000;
let modalOpen = false;
let loadCovered = false;
let attempts = 0;
let constructions = 0;
let opens = 0;
let closes = 0;
let open = false;

const access = createSettingsAccess({
  input,
  bus,
  gearVisible: () => true,
  isSpectating: () => spectating,
}, async () => {
  attempts++;
  if (attempts === 1) throw new Error('simulated settings chunk failure');
  return {
    createSettings(options) {
      constructions++;
      assert.equal(options.gear, gear);
      assert.equal(options.registerMenuAction, false);
      return {
        root: {},
        gear,
        open() { opens++; open = true; },
        close() { closes++; open = false; },
        toggle() { open = !open; },
        isOpen: () => open,
        showHints() {},
      };
    },
  };
}, {
  createGear: () => gear,
  modalOpen: () => modalOpen,
  now: () => now,
  loadCovered: () => loadCovered,
});

assert.equal(gear.style.display, 'flex');
assert.equal(access.isOpen(), false);
await assert.rejects(access.preload(), /simulated settings chunk failure/);
assert.equal(access.current, null);

const first = access.preload();
assert.equal(first, access.preload(), 'parallel intents coalesce one module request');
await first;
assert.equal(attempts, 2);
assert.equal(constructions, 1);

modalOpen = true;
action();
await Promise.resolve();
assert.equal(opens, 0, 'an existing modal keeps settings closed');
modalOpen = false;
// (black-screen-228 round 2, D5) Esc under the battle entry's loading cover opens nothing (an invisible pause panel held
// the entry on PREPARING)
loadCovered = true;
action('Escape');
await Promise.resolve();
assert.equal(opens, 0, 'the battle loading cover keeps settings closed');
loadCovered = false;
action();
await Promise.resolve();
assert.equal(opens, 1);
assert.equal(access.isOpen(), true);
access.close({ noRelock: true });
assert.equal(closes, 1);

replayBegins();
action();
await Promise.resolve();
assert.equal(opens, 1, 'kill-cam owns the settings action');
replayDone();
action();
await Promise.resolve();
assert.equal(opens, 1, 'the replay skip key is absorbed by the done grace');
now += 251;
gear.dispatchEvent(new Event('click'));
await Promise.resolve();
assert.equal(opens, 2);
access.close({ noRelock: true });

// 2026-11-02 audit F4: a battle-ending camera beat (time's up, objective orbit, wreck orbit) owns the screen like a
// replay. Its any-key skip is a capture-phase window listener that does not stop the key, so the live Esc path (this
// access's settingsMenu action: the panel registers none) must refuse the menu for the whole beat and the skip press.
emit('ending:begin', { beat: 'timesUp' });
action('Escape');
await Promise.resolve();
assert.equal(opens, 2, 'an ending beat owns the settings action (the Esc that skips it opens nothing)');
emit('ui:openSettings');
gear.dispatchEvent(new Event('click'));
await Promise.resolve();
assert.equal(opens, 2, 'no trigger opens Settings over an ending beat');
emit('ending:done', { beat: 'timesUp' });
action('Escape');
await Promise.resolve();
assert.equal(opens, 2, 'the beat\'s skip key is absorbed by the done grace');
now += 251;
action('Escape');
await Promise.resolve();
assert.equal(opens, 3, 'the report keeps its Esc menu once the beat is over');
access.close({ noRelock: true });
// overlapping owners: the first done must not free the screen while the other still owns it
replayBegins();
emit('ending:begin', { beat: 'wreckOrbit' });
replayDone();
now += 251;
action('Escape');
await Promise.resolve();
assert.equal(opens, 3, 'an ending beat still running keeps the screen after the replay\'s done');
emit('ending:done', { beat: 'wreckOrbit' });
now += 251;
// a phase flip is the reset of last resort (a lost done)
emit('ending:begin', { beat: 'timesUp' });
emit('phase:change', { phase: 'garage' });
action('Escape');
await Promise.resolve();
assert.equal(opens, 4, 'a phase change releases a presentation whose done never came');

access.close();
spectating = true;
action('Escape');
await Promise.resolve();
assert.equal(releases, 1, 'spectator Escape explicitly releases capture');
assert.equal(access.isOpen(), false, 'spectator Escape never opens Settings');
action('Pad9');
await Promise.resolve();
assert.equal(access.isOpen(), true, 'gamepad menu remains available while spectating');

console.log('settingsAccess.selftest: retry, intent, modal, loading-cover and replay gates passed');
