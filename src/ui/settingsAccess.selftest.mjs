import assert from 'node:assert/strict';
import { createSettingsAccess } from './settingsAccess.ts';

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

emit('killcam:begin');
action();
await Promise.resolve();
assert.equal(opens, 1, 'kill-cam owns the settings action');
emit('killcam:done');
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
emit('killcam:begin');
emit('ending:begin', { beat: 'wreckOrbit' });
emit('killcam:done');
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

// ---- (round 2 U35) the panel's load is one app/lazyChunk.ts chunk under the default policy, which the idle preload,
// every battle entry's preload and the gear share. The memo here cleared each failure, so every caller asked a failed
// chunk again at once: no backoff, no offline gate, no 404 rule. It is not an opener's chunk (a battle entry awaits it, so
// a kept failure would fail every later battle); the gear keeps the kit's rule for its own press.
{
  const settle = async () => { for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve)); };
  let clock = 0;
  let asks = 0;
  let failing = true;
  let reloads = 0;
  let online = true;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { get onLine() { return online; } } });
  globalThis.location = { reload() { reloads++; } };
  const markedGear = Object.assign(new FakeGear(), {
    dataset: {}, attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
  });
  const panel = { opens: 0, shown: false, root: {}, open() { this.opens++; this.shown = true; }, close() { this.shown = false; }, isOpen() { return this.shown; }, showHints() {} };
  const failures = createSettingsAccess({ input: { releaseLock() {}, onAction() {} }, gearVisible: () => true }, async () => {
    asks++;
    if (failing) throw new TypeError('Failed to fetch dynamically imported module: ./settings.ts');
    return { createSettings: () => panel };
  }, { createGear: () => markedGear, modalOpen: () => false, now: () => clock, loadCovered: () => false });
  const error = console.error;
  console.error = () => {};
  try {
    // the idle preload, then a battle entry's: one failure is asked again at once, then the backoff holds
    await assert.rejects(failures.preload(), /dynamically imported module/);
    await assert.rejects(failures.preload(), /dynamically imported module/);
    assert.equal(asks, 2);
    for (let i = 0; i < 10; i++) await assert.rejects(failures.preload(), /dynamically imported module/);
    assert.equal(asks, 2, `ten more preloads inside the 2 s backoff ask nothing (${asks - 2} more asks)`);
    clock += 2000;
    await assert.rejects(failures.preload(), /dynamically imported module/);
    assert.equal(asks, 3, 'past the backoff the next caller asks again');
    // the gear's press never asks a chunk another caller saw fail (the kit's opener rule), even past the backoff: it
    // marks the gear, and its next press reloads
    clock += 60_000;
    failures.open();
    await settle();
    assert.equal(asks, 3, 'a press asks nothing for a failed chunk');
    assert.equal(markedGear.dataset.loadState, 'error', 'the failed press marks the gear (the kit\'s error state)');
    failures.open();
    assert.equal(reloads, 1, 'and its next press reloads the page');
    // offline, nothing is asked, however long
    online = false;
    clock += 120_000;
    for (let i = 0; i < 5; i++) await assert.rejects(failures.preload(), /dynamically imported module/);
    assert.equal(asks, 3, 'never while offline');
    online = true;
    // back online, a battle entry's preload loads the panel: the gear's press opens it, not a reload, and its mark goes
    failing = false;
    await failures.preload();
    assert.equal(asks, 4);
    assert.equal(markedGear.dataset.loadState, undefined, 'the built panel\'s gear loses the failed press\'s mark');
    assert.equal(markedGear.attributes['aria-description'], undefined);
    failures.open();
    await settle();
    assert.equal(reloads, 1, 'a press with the panel built opens it');
    assert.equal(panel.opens, 1);
  } finally {
    console.error = error;
  }
}

console.log('settingsAccess.selftest: retry, intent, modal, loading-cover and replay gates passed; one lazy chunk (backoff, offline, the gear\'s mark and reload)');
