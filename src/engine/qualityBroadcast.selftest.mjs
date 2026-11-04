import assert from 'node:assert/strict';

// 2026-11-02 audit R3 (quality broadcast): the preset reached its listeners through five plain `for` loops. One listener
// that threw left the earlier modules on the new preset and the later ones on the old (and the throw escaped into the
// governor's tier step, skipping its tier trial); a listener that changed the preset again nested a second broadcast,
// so the outer loop then handed the later listeners the stale preset. And with a context-loss recovery cap binding, a
// governor step of the auto tier changed nothing that ran yet reported a cut. quality.ts's broadcastPreset is now the
// one owner: synchronous, isolated, never nested; the governor's steps move the preset that actually runs.

function installBrowser(search) {
  const storage = new Map();
  const session = new Map();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { search },
      localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) },
      sessionStorage: { getItem: (k) => session.get(k) ?? null, setItem: (k, v) => session.set(k, String(v)), removeItem: (k) => session.delete(k) },
      matchMedia: () => ({ matches: false }),
    },
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgent: 'Desktop', maxTouchPoints: 0, deviceMemory: 8, hardwareConcurrency: 8 },
  });
}
const quietConsole = { info: console.info, error: console.error };
const reported = [];
console.info = () => {};
console.error = (...args) => { reported.push(args); };

async function fresh(tag) {
  installBrowser('?tier=desktop');
  const q = await import(`./quality.ts?broadcast-${tag}`);
  q.resolveDeviceTier({ capabilities: { maxTextureSize: 16384 } });
  return q;
}

try {
  {
    // a throwing listener: every other listener still reaches the new preset, and the writer does not throw
    const q = await fresh('isolation');
    const seen = [];
    q.onPresetChange((p) => seen.push(`a:${p.label}`));
    q.onPresetChange(() => { throw new Error('a listener that throws'); });
    q.onPresetChange((p) => seen.push(`c:${p.label}`));
    assert.doesNotThrow(() => q.setPresetName('medium'), 'one listener\'s failure never escapes into the writer');
    assert.deepEqual(seen, ['a:Medium', 'c:Medium'], 'the listener after the failing one is not left on the old preset');
    assert.equal(reported.length, 1, 'the failure is reported');
    // the governor's tier step: a throwing listener no longer aborts reportSustainedOverload (post.ts then begins its trial)
    q.setPresetName('auto');
    seen.length = 0;
    let stepped;
    assert.doesNotThrow(() => { stepped = q.reportSustainedOverload(); });
    assert.equal(stepped, true);
    assert.deepEqual(seen, ['a:Medium', 'c:Medium']);
  }
  {
    // a listener that changes the preset again: every listener ends on the newest preset, in order, once per pass
    const q = await fresh('nesting');
    const last = new Map();
    const order = [];
    q.onPresetChange((p) => {
      order.push(`a:${p.label}`); last.set('a', p.label);
      if (p.label === 'Medium') q.setPresetName('low');
    });
    q.onPresetChange((p) => { order.push(`b:${p.label}`); last.set('b', p.label); });
    q.setPresetName('medium');
    assert.equal(q.resolvePresetName(), 'low');
    assert.deepEqual(Object.fromEntries(last), { a: 'Low', b: 'Low' }, 'no listener is left on the superseded preset');
    assert.deepEqual(order, ['a:Medium', 'a:Low', 'b:Low'], 'the superseded preset never reaches a later listener');
  }
  {
    // a recovery cap binding: the governor's step moves the preset that runs, and recovery does not pretend to lift it
    const q = await fresh('recovery');
    q.setPresetName('auto');
    assert.equal(q.resolvePresetName(), 'high');
    q.noteGraphicsContextLoss();
    assert.equal(q.resolvePresetName(), 'medium', 'a reset caps the tab one rung down');
    const seen = [];
    q.onPresetChange((p) => seen.push(p.label));
    assert.equal(q.reportSustainedOverload(), true);
    assert.equal(q.resolvePresetName(), 'low', 'an overload under the cap steps the running preset, not only the auto tier');
    assert.deepEqual(seen, ['Low'], 'one broadcast, of a preset that changed');
    assert.equal(q.reportSustainedRecovery(), true, 'stable evidence restores the governor\'s own step');
    assert.equal(q.resolvePresetName(), 'medium');
    assert.equal(q.canRecoverAutoTier(), false, 'the recovery cap binds: raising the auto tier would change nothing that runs');
    assert.equal(q.reportSustainedRecovery(), false);
    assert.deepEqual(seen, ['Low', 'Medium'], 'no broadcast of an unchanged preset (no governor reset for nothing)');
    q.setPresetName('auto');
    assert.equal(q.resolvePresetName(), 'high', 'an explicit choice clears the one-way recovery cap');
  }
} finally {
  console.info = quietConsole.info;
  console.error = quietConsole.error;
}

console.log('qualityBroadcast selftest: isolated, non-nesting preset broadcast; governor steps move the running preset');
