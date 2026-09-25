// src/ui/damagePanelMaskRetry.selftest.mjs — the damage panel's mask retry
// receipt (2026-09-25 owner report: an M1A3 battle showed the vector stand-in
// until reload). The real panel is driven with a scripted mask source and
// injected timers: a build that fails or is cancelled by a disposed borrowed
// visual is retried after 1.5 s WITHOUT the borrowed visual, then after 8 s;
// the third failure warns once and beacons one `hud_mask_failed` event that
// the real API validator accepts. A new tank cancels a pending retry and
// ignores late callbacks from the old build.
import assert from 'node:assert/strict';
import { createDamagePanel, DAMAGE_PANEL_MASK_RETRY } from './damagePanel.ts';
import { validateTelemetryBody } from '../../api/telemetry.ts';

function fakeElement(tag) {
  const selected = new Map();
  const element = {
    tagName: tag.toUpperCase(), id: '', className: '', textContent: '', innerHTML: '',
    style: {}, dataset: {}, children: [],
    appendChild(child) { element.children.push(child); return child; },
    querySelector(selector) {
      let found = selected.get(selector);
      if (!found) { found = fakeElement('span'); selected.set(selector, found); }
      return found;
    },
  };
  return element;
}
const passiveContext = () => new Proxy({}, {
  get: (target, key) => (key in target ? target[key] : () => undefined),
  set: (target, key, value) => { target[key] = value; return true; },
});
function fakeCanvas() {
  const canvas = fakeElement('canvas');
  canvas.width = 0;
  canvas.height = 0;
  const context = passiveContext();
  canvas.getContext = (kind) => { assert.equal(kind, '2d'); return context; };
  return canvas;
}

const saved = new Map(['document', 'window'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
Object.defineProperties(globalThis, {
  document: { configurable: true, value: {
    head: fakeElement('head'), getElementById: () => null,
    createElement: (kind) => (kind === 'canvas' ? fakeCanvas() : fakeElement(kind)),
  } },
  window: { configurable: true, value: {} },
});
const originalWarn = console.warn;
const warnings = [];
console.warn = (...args) => warnings.push(args);

const spec = {
  id: 'receipt-tank', hp: 1000,
  dims: { hullLengthM: 7, widthM: 3.6, overallLengthM: 9.5 },
  armor: {
    turretPivot: [0, 1.4, -0.3], gunBarrel: { lengthM: 5 },
    modules: [
      { module: 'engine', min: [-0.6, 0, -2.4], max: [0.6, 1, -1.2] },
      { module: 'gun', min: [-0.1, 0, 0.2], max: [0.1, 1, 3], turretLocal: true },
    ],
    crew: [{ crew: 'driver', min: [-0.4, 0.4, 1.4], max: [0.4, 1.2, 2.2] }],
  },
};
const maskEntry = () => ({
  ready: true,
  hull: { canvas: fakeCanvas(), camX: 0, camZ: 0, halfM: 5, cx: 0, cz: 0, radiusM: 4, widthM: 3.6, lengthM: 7 },
  turret: { canvas: fakeCanvas(), camX: 0, camZ: 0, halfM: 4, radiusM: 3 },
  pivot: [0, -0.3], pxPerM: 19.2,
});

function timers() {
  const list = [];
  return {
    list,
    schedule(callback, delayMs) { const timer = { callback, delayMs, fired: false, cancelled: false }; list.push(timer); return timer; },
    cancel(handle) { handle.cancelled = true; },
    fire(index) {
      const timer = list[index];
      assert.ok(timer && !timer.fired && !timer.cancelled, `timer ${index} is live`);
      timer.fired = true;
      timer.callback();
    },
  };
}
function scriptedMaskSource() {
  const calls = [];
  const queue = [];
  return {
    calls,
    plan(handler) { queue.push(handler); },
    source: {
      get(tank, onReady, sourceVisual = null) {
        const call = { id: tank.id, onReady, sourceVisual };
        calls.push(call);
        const handler = queue.shift();
        return handler ? handler(call) : null;
      },
      async prepare() { return null; },
    },
  };
}
const sink = () => ({ events: [], send(event) { this.events.push(event); return true; } });
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const failure = (code, attempts, retryable = true) => ({
  code, message: code === 'mask_build_error' ? 'injected compile failure' : code, attempts, retryable,
});
const failing = (detail) => (call) => { queueMicrotask(() => call.onReady(false, detail)); return null; };
const cached = (entry) => () => entry;
function harness() {
  const clock = timers();
  const masks = scriptedMaskSource();
  const telemetry = sink();
  const panel = createDamagePanel({ maskSource: masks.source, telemetry, schedule: clock.schedule, cancel: clock.cancel });
  return { panel, clock, masks, telemetry };
}

try {
  assert.deepEqual(DAMAGE_PANEL_MASK_RETRY, { maxAttempts: 3, delaysMs: [1500, 8000] },
    'attempt 2 after 1.5 s, attempt 3 after a further 8 s, then give up');

  // The owner's battle: the borrowed live visual is disposed mid-build (the
  // battle-start race). Attempt 2 runs without it and the panel ends with masks.
  {
    const h = harness();
    const visual = { root: {}, dispose() {} };
    h.masks.plan(failing(failure('top_mask_source_disposed', 0)));
    h.panel.setTank(spec, visual);
    assert.equal(h.masks.calls.length, 1);
    assert.strictEqual(h.masks.calls[0].sourceVisual, visual, 'attempt 1 borrows the live battle visual');
    assert.equal(h.panel.debugState().masksReady, false, 'the vector stand-in covers the first frames');
    await flush();
    assert.deepEqual(h.clock.list.map((timer) => timer.delayMs), [1500], 'the race schedules attempt 2 after 1.5 s');
    const entry = maskEntry();
    h.masks.plan((call) => {
      assert.equal(call.sourceVisual, null, 'attempt 2 drops the borrowed visual so the factory build owns its resources');
      queueMicrotask(() => call.onReady(true)); // a single-argument success still adopts
      return null;
    });
    h.masks.plan(cached(entry));
    h.clock.fire(0);
    await flush();
    assert.equal(h.masks.calls.length, 3);
    assert.equal(h.masks.calls[2].onReady, null, 'adoption re-reads the cache without subscribing again');
    assert.equal(h.panel.debugState().masksReady, true, 'the panel ends with the real masks');
    assert.equal(h.panel.debugState().markers.length, 3, 'the module map is painted on the real layers');
    assert.deepEqual(warnings, [], 'a recovered race is silent');
    assert.deepEqual(h.telemetry.events, [], 'a recovered race sends no beacon');
  }

  // A synchronous cache hit needs no retry machinery at all.
  {
    const h = harness();
    h.masks.plan(cached(maskEntry()));
    h.panel.setTank(spec, null);
    assert.equal(h.panel.debugState().masksReady, true);
    assert.deepEqual(h.clock.list, []);
  }

  // Three hard failures: one warning, one bounded beacon the server accepts.
  {
    const h = harness();
    h.masks.plan(failing(failure('mask_build_error', 1)));
    h.panel.setTank(spec, { root: {}, dispose() {} });
    await flush();
    h.masks.plan(failing(failure('mask_build_error', 1))); // the hot negative cache answers at once
    h.clock.fire(0);
    await flush();
    assert.deepEqual(h.clock.list.map((timer) => timer.delayMs), [1500, 8000]);
    assert.equal(h.masks.calls[1].sourceVisual, null);
    assert.deepEqual(warnings, [], 'no warning before the last attempt');
    h.masks.plan(failing(failure('mask_build_error', 2)));
    h.clock.fire(1);
    await flush();
    assert.equal(h.masks.calls.length, 3, 'three attempts, then the panel gives up');
    assert.equal(h.clock.list.length, 2, 'no fourth attempt is scheduled');
    assert.equal(warnings.length, 1, 'exactly one console warning at the terminal failure');
    assert.match(warnings[0][0], /receipt-tank after 3 attempt\(s\) \(mask_build_error: injected compile failure\)/);
    assert.deepEqual(h.telemetry.events, [{
      kind: 'hud_mask_failed', stage: 'damagePanel', code: 'mask_build_error', reason: 'receipt-tank',
      error: { message: 'injected compile failure', frames: [] },
    }], 'one hud_mask_failed event with the spec id and the pipeline code/message');
    const validation = validateTelemetryBody(
      { v: 1, sid: 'sess_hud_mask_1', build: 'v1.0.0+greceipt', events: h.telemetry.events },
      '2026-09-25T00:00:00.000Z',
    );
    assert.equal(validation.ok, true, `the API accepts the event: ${JSON.stringify(validation)}`);
    assert.deepEqual(
      [validation.events[0].kind, validation.events[0].stage, validation.events[0].code, validation.events[0].reason, validation.events[0].error],
      ['hud_mask_failed', 'damagePanel', 'mask_build_error', 'receipt-tank', { message: 'injected compile failure', frames: [] }],
    );
    assert.equal(h.panel.debugState().masksReady, false);
    assert.equal(h.panel.debugState().markers.length, 3, 'the stand-in keeps painting the module map');
    warnings.length = 0;
  }

  // A pipeline that reports its attempt cap is terminal at once.
  {
    const h = harness();
    h.masks.plan(failing(failure('top_mask_program_context_lost', 3, false)));
    h.panel.setTank(spec, null);
    await flush();
    assert.deepEqual(h.clock.list, [], 'a capped pipeline failure schedules nothing');
    assert.equal(warnings.length, 1);
    assert.equal(h.telemetry.events.length, 1);
    assert.equal(h.telemetry.events[0].code, 'top_mask_program_context_lost');
    warnings.length = 0;
  }

  // A new tank cancels the pending retry; the old build's late callbacks and
  // its stale timer are inert.
  {
    const h = harness();
    let staleReady = null;
    h.masks.plan((call) => {
      staleReady = call.onReady;
      queueMicrotask(() => call.onReady(false, failure('top_mask_source_disposed', 0)));
      return null;
    });
    h.panel.setTank(spec, null);
    await flush();
    assert.equal(h.clock.list.length, 1);
    const other = { ...spec, id: 'receipt-other' };
    h.masks.plan(cached(maskEntry()));
    h.panel.setTank(other, null);
    assert.equal(h.clock.list[0].cancelled, true, 'a new tank cancels the pending retry');
    assert.deepEqual(h.masks.calls.map((call) => call.id), ['receipt-tank', 'receipt-other']);
    assert.equal(h.panel.debugState().masksReady, true);
    staleReady(true);
    h.clock.list[0].callback();
    await flush();
    assert.equal(h.masks.calls.length, 2, 'a stale callback or timer neither adopts nor requests masks');
    assert.equal(h.panel.debugState().specId, 'receipt-other');
    assert.deepEqual(warnings, []);
    assert.deepEqual(h.telemetry.events, []);
  }

  // Without an injected sink (Node has no page beacon) the terminal failure
  // still warns and never throws.
  {
    const clock = timers();
    const masks = scriptedMaskSource();
    const panel = createDamagePanel({ maskSource: masks.source, schedule: clock.schedule, cancel: clock.cancel });
    masks.plan(failing(failure('mask_build_error', 3, false)));
    panel.setTank(spec, null);
    await flush();
    assert.equal(warnings.length, 1, 'the default beacon lookup is guarded');
    warnings.length = 0;
  }
} finally {
  console.warn = originalWarn;
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}

console.log('damagePanelMaskRetry.selftest: race retry without the borrowed visual, 1.5 s / 8 s backoff, '
  + 'one warning + one accepted hud_mask_failed beacon, and tank-switch cancellation pass');
