import assert from 'node:assert/strict';
import { createPerfDiagnosticsAccess } from './perfDiagnosticsAccess.ts';

let loads = 0;
let fail = true;
const calls = [];
const runtime = {
  hud: {
    update: (value) => calls.push(['update', value]),
    toggle: () => calls.push(['toggle']),
    setTelemetryProvider: (provider) => calls.push(['provider', typeof provider]),
    setCaptureHidden: (hidden) => calls.push(['hidden', hidden]),
    stats: () => ({ fps: 120 }),
    snapshot: () => ({ stats: { fps: 120 }, telemetry: null }),
  },
  telemetry: {
    collect: () => ({ tier: 'test' }),
    sampleShadowContribution: async () => ({ changed: 4 }),
  },
};
const access = createPerfDiagnosticsAccess(async () => {
  loads++;
  if (fail) throw new Error('injected diagnostics transfer failure');
  return runtime;
});

access.update(8.3);
access.setCaptureHidden(true);
access.setTelemetryProvider(() => ({ ready: true }));
assert.equal(loads, 0, 'ordinary frame calls never transfer diagnostics');
assert.equal(access.stats(), null);
assert.deepEqual(await access.sampleShadowContribution(), {
  skipped: true, reason: 'diagnostics_not_loaded',
});

await assert.rejects(access.preload(), /injected diagnostics transfer failure/);
fail = false;
const [first, second] = await Promise.all([access.preload(), access.preload()]);
assert.equal(first, runtime);
assert.equal(second, runtime);
assert.equal(loads, 2, 'a failed optional transfer retries and concurrent intent coalesces');
assert.deepEqual(calls.slice(0, 2), [['hidden', true], ['provider', 'function']]);

access.update(8.3);
access.toggle();
assert.deepEqual(calls.slice(2), [['update', 8.3], ['toggle']]);
assert.deepEqual(access.stats(), { fps: 120 });
assert.deepEqual(access.collectTelemetry(), { tier: 'test' });
assert.deepEqual(await access.sampleShadowContribution(), { changed: 4 });

console.log('perfDiagnosticsAccess.selftest: PASS');
