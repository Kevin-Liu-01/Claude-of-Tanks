import assert from 'node:assert/strict';
import { createPerfHud } from './perfHud.ts';

// Test the real HUD/observer owner without a browser or exposing private
// retained records through the production diagnostics API.
class Element {
  children = [];
  selectors = new Map();
  classes = new Set();
  style = {};
  classList = {
    toggle: (name, force = !this.classes.has(name)) => {
      if (force) this.classes.add(name);
      else this.classes.delete(name);
      return force;
    },
  };
  constructor(tag) { this.tagName = tag.toUpperCase(); }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute() {}
  addEventListener() {}
  querySelector(selector) {
    if (!this.selectors.has(selector)) this.selectors.set(selector, new Element('div'));
    return this.selectors.get(selector);
  }
}

const prior = new Map(['document', 'performance', 'PerformanceObserver', 'setTimeout', 'setInterval']
  .map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
let clock = 1000;
let observerCallback;
let subscriptions = 0;
let retained = null;
let updateCalls = 0;
const renderer = { info: {
  render: { calls: 12, triangles: 3456 }, programs: [{}, {}],
  memory: { geometries: 42, textures: 17 },
} };
const game = { phase: 'garage', timeS: 0 };

function define(key, value) {
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}

function deliver(time, durations) {
  clock = time;
  const entries = durations.map(duration => ({ duration }));
  const push = Array.prototype.push;
  // Synchronously observe the real owner receiving records, then immediately
  // restore the intrinsic before assertions, DOM work, or another test runs.
  Array.prototype.push = function (...items) {
    if (items.length === 1 && items[0]?.t === clock && 'd' in items[0]) {
      if (retained) assert.equal(this, retained, 'reuse the original record array');
      retained = this;
    }
    return push.apply(this, items);
  };
  try { observerCallback({ getEntries: () => entries }); }
  finally { Array.prototype.push = push; }
}

function update(hud, time) {
  clock = time;
  updateCalls++;
  hud.update(16);
}

try {
  define('document', {
    head: new Element('head'), body: new Element('body'),
    getElementById: () => null, createElement: tag => new Element(tag),
  });
  define('performance', { now: () => clock });
  define('PerformanceObserver', class {
    constructor(callback) { observerCallback = callback; }
    observe(options) {
      assert.deepEqual(options, { entryTypes: ['longtask'] });
      subscriptions++;
    }
  });
  define('setTimeout', () => assert.fail('retention must not schedule a timer'));
  define('setInterval', () => assert.fail('retention must not schedule an interval'));
  const hud = createPerfHud({ renderer, game });
  assert.equal(subscriptions, 1);
  assert.equal(hud.isVisible(), false);
  assert.equal(hud.el.style.display, 'none');
  assert.equal(hud.stats(), null, 'no fabricated frame sample before update');

  // No update calls: the exact Shot/Studio lifecycle that retained hundreds
  // of records in the saved late-Coastal heaps must expire at collection.
  deliver(1000, [900, 80]);
  const originalArray = retained;
  deliver(5999, [70]);
  assert.equal(retained.length, 3, 'all records inside five seconds survive');
  deliver(6000, [60]);
  assert.equal(retained.length, 4, 'exact five-second boundary is inclusive');
  deliver(6001, [50]);
  assert.deepEqual(retained, [{ t: 5999, d: 70 }, { t: 6000, d: 60 }, { t: 6001, d: 50 }],
    'collection must evict stale records even without a HUD update');
  assert.equal(updateCalls, 0);
  for (let time = 7000; time <= 127000; time += 1000) {
    deliver(time, [55, 65]);
    assert.ok(retained.length <= 12, 'two deliveries per second retain at most six inclusive seconds');
    assert.ok(retained.every(row => time - row.t <= 5000));
  }
  assert.equal(retained, originalArray);
  assert.equal(updateCalls, 0, 'boundedness is not borrowed from frame maintenance');

  // Normal hidden-HUD updates still expire a quiet window with no new tasks.
  update(hud, 132001);
  assert.equal(retained.length, 0);
  assert.equal(hud.stats().worstStall, 0);
  assert.equal(hud.stats().fps, 62.5);
  assert.equal(hud.stats().calls, 12);

  let paints = 0;
  hud.setTelemetryProvider(() => { paints++; return {}; });
  hud.setVisible(true);
  hud.setCaptureHidden(true);
  assert.equal(hud.isVisible(), true);
  assert.equal(hud.el.style.display, 'none');
  deliver(133000, [300, 95]);
  update(hud, 133000);
  assert.equal(hud.stats().worstStall, 300, 'still report the maximum, not the newest duration');
  assert.equal(paints, 0, 'capture-hidden never paints diagnostics');
  deliver(139001, [70]);
  assert.deepEqual(retained, [{ t: 139001, d: 70 }]);
  assert.equal(hud.stats().worstStall, 70);
  update(hud, 144001);
  assert.equal(retained.length, 1, 'quiet update preserves the exact boundary too');
  update(hud, 144002);
  assert.equal(retained.length, 0, 'quiet cleanup precedes the 4 Hz DOM throttle');

  // Switching visibility does not alter collection or ordinary paint cadence.
  hud.setCaptureHidden(false);
  assert.equal(hud.el.style.display, 'block');
  update(hud, 145000);
  assert.equal(paints, 1);
  update(hud, 145249);
  assert.equal(paints, 1);
  update(hud, 145250);
  assert.equal(paints, 2);
  hud.setVisible(false);
  deliver(146000, [110]);
  deliver(152000, []);
  assert.equal(retained.length, 0, 'an empty callback can expire an old window without allocating');
  assert.equal(hud.el.style.display, 'none');

  define('PerformanceObserver', undefined);
  const unsupported = createPerfHud({ renderer, game });
  update(unsupported, 153000);
  assert.equal(unsupported.stats().worstStall, 0, 'unsupported engines preserve graceful behavior');
  assert.equal(subscriptions, 1, 'visibility and updates never recreate observers');
} finally {
  for (const [key, descriptor] of prior) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}

console.log('perfHud.selftest: PASS (no-update retention, exact boundary, quiet expiry, visibility, cadence, no timers)');
