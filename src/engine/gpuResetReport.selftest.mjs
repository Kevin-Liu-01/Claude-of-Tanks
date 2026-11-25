// gpuResetReport.selftest — one field record per graphics reset (mobile-gpu-reset-277): the snapshot taken at the loss
// (before its quality relief), settled by the recovery machine's outcome, words and numbers only, within the server's
// record rules (server/telemetryRecord.ts: an error record's stage and code alphabets). The browser receipt
// (tools/gpu-reset.browser.selftest.mjs) loses a real context and reads the beacon.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGpuResetReport } from './gpuResetReport.ts';
import { createEntryTelemetry } from '../entry/telemetry.ts';
import { validateTelemetryRecord } from '../../server/telemetryRecord.ts';

let clock = 1000;
let preset = 'mobile';
const sent = [];
let context = { phase: 'loading', loaderPercent: 97, mode: 'network', sinceEntryMs: 6420.4 };
const report = createGpuResetReport({
  read: () => context,
  preset: () => preset,
  tier: () => 'mobile',
  report: (stage, message, code) => sent.push({ stage, message, code }),
  now: () => clock,
});

report.lost();
preset = 'mobile-low'; // the loss's relief, after the snapshot
clock += 1830;
report.notice('waiting');
report.notice('restoring');
assert.equal(sent.length, 0, 'nothing is sent before the outcome is known');
report.notice('ready');
assert.deepEqual(sent, [{
  stage: 'gpu-reset',
  code: 'gpu_reset:loading:restored',
  message: 'gpu reset 1 phase=loading loader=97 preset=mobile tier=mobile mode=network sinceEntryMs=6420 back=restored afterMs=1830',
}], 'the snapshot at the loss (its preset before the relief), the outcome and how long it took');
report.notice('ready');
assert.equal(sent.length, 1, 'one record per loss');

// a second loss in battle that never comes back within the machine's deadline, then a third that fails outright
context = { phase: 'battle', loaderPercent: null, mode: 'solo', sinceEntryMs: 41000 };
report.lost();
clock += 10000;
report.notice('delayed');
assert.equal(sent[1].code, 'gpu_reset:battle:delayed');
assert.match(sent[1].message, /^gpu reset 2 phase=battle loader=none .* mode=solo sinceEntryMs=41000 back=delayed afterMs=10000$/);
report.lost();
report.notice('failed');
assert.equal(sent[2].code, 'gpu_reset:battle:failed');
assert.match(sent[2].message, /^gpu reset 3 /, 'each loss numbered, so the telemetry client does not fold repeats together');

// a loss superseded by another before it settled is settled as delayed, and an unreadable context is 'none'
const lone = [];
const second = createGpuResetReport({
  read: () => { throw new Error('owners not ready'); },
  preset: () => 'mobile', tier: () => 'mobile', now: () => 0,
  report: (stage, message, code) => lone.push({ stage, message, code }),
});
second.lost();
second.lost();
assert.equal(lone.length, 1);
assert.equal(lone[0].code, 'gpu_reset:none:delayed');
second.notice('ready');
assert.equal(lone[1].code, 'gpu_reset:none:restored');
assert.match(lone[1].message, /phase=none loader=none preset=mobile tier=mobile mode=none sinceEntryMs=none/);
// a value outside the beacon alphabet is reduced to it
const odd = [];
const oddReport = createGpuResetReport({ read: () => ({ phase: 'war room <b>', loaderPercent: null, mode: 'x y', sinceEntryMs: -5 }), preset: () => 'a b',
  tier: () => 'mobile', now: () => 0, report: (stage, message, code) => odd.push({ code, message }) });
oddReport.lost();
oddReport.notice('ready');
assert.equal(odd[0].code, 'gpu_reset:war-room-b-:restored');
assert.match(odd[0].code, /^[A-Za-z0-9_.:-]{1,48}$/, 'the code stays in the server\'s alphabet');
assert.match(odd[0].message, /phase=war-room-b- loader=none preset=a-b tier=mobile mode=x-y sinceEntryMs=0 /);

// through the real telemetry client: the record it sends is one the server accepts
const posts = [];
const telemetry = createEntryTelemetry({
  enabled: true, build: 'test', sessionId: 'abcdefabcdefabcd',
  endpoints: { session: '/s', error: '/e' },
  transport: (endpoint, text) => { posts.push({ endpoint, body: JSON.parse(text) }); return true; },
  schedule: (callback) => { callback(); return 1; }, cancel: () => {},
});
const wired = createGpuResetReport({
  read: () => ({ phase: 'loading', loaderPercent: 94, mode: 'network', sinceEntryMs: 7000 }),
  preset: () => 'mobile', tier: () => 'mobile', now: () => 0,
  report: (stage, message, code) => { telemetry.error(stage, { message }, code); },
});
wired.lost();
wired.notice('ready');
assert.equal(posts.length, 1, 'before the session record, a reset sends it within the error delay');
const record = posts[0].body;
assert.equal(record.error.stage, 'gpu-reset');
assert.equal(record.error.code, 'gpu_reset:loading:restored');
assert.match(record.error.message, /^gpu reset 1 phase=loading loader=94 preset=mobile tier=mobile mode=network sinceEntryMs=7000 back=restored/);
const validated = validateTelemetryRecord(record);
assert.equal(validated.ok, true, `the server accepts it: ${validated.error ?? ''}`);
assert.equal(validated.record.error.code, 'gpu_reset:loading:restored');

// the wiring: the renderer snapshots before the loss's relief and settles on every notice; main supplies the context
const renderer = readFileSync(new URL('./renderer.ts', import.meta.url), 'utf8');
assert.match(renderer, /recordLoss: \(\) => \{ gpuReset\.lost\(\); noteGraphicsContextLoss\(\); \}/,
  'the snapshot is taken before noteGraphicsContextLoss lowers the preset');
assert.match(renderer, /notice: \(state\) => \{ gpuReset\.notice\(state\); showContextLossOverlay\(state\); \}/);
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
assert.match(main, /renderer\.userData\.gpuResetContext = \(\) => \(\{/);
assert.match(main, /battleEntryStartedAt = performance\.now\(\)/);

console.log('gpuResetReport.selftest: one record per reset (snapshot before relief, restored/delayed/failed, numbered), the server accepts it, renderer and main wired PASS');
