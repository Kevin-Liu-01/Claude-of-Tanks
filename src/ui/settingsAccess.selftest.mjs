import assert from 'node:assert/strict';
import { createSettingsAccess } from './settingsAccess.ts';

class FakeGear extends EventTarget {
  style = { display: '' };
}

let action = null;
const busHandlers = new Map();
const input = { onAction(_id, handler) { action = handler; } };
const bus = { on(event, handler) { busHandlers.set(event, handler); } };
const gear = new FakeGear();
let now = 1000;
let modalOpen = false;
let attempts = 0;
let constructions = 0;
let opens = 0;
let closes = 0;
let open = false;

const access = createSettingsAccess({
  input,
  bus,
  gearVisible: () => true,
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
action();
await Promise.resolve();
assert.equal(opens, 1);
assert.equal(access.isOpen(), true);
access.close({ noRelock: true });
assert.equal(closes, 1);

busHandlers.get('killcam:begin')();
action();
await Promise.resolve();
assert.equal(opens, 1, 'kill-cam owns the settings action');
busHandlers.get('killcam:done')();
action();
await Promise.resolve();
assert.equal(opens, 1, 'the replay skip key is absorbed by the done grace');
now += 251;
gear.dispatchEvent(new Event('click'));
await Promise.resolve();
assert.equal(opens, 2);

console.log('settingsAccess.selftest: retry, intent, modal and replay gates passed');
