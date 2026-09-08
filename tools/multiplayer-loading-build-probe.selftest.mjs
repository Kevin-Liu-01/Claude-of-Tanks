#!/usr/bin/env node
// CPU-only: injected native service/browser ports. Never binds or launches.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireLoadingEvidence, CAPTURE_QUEUE_TIMEOUT_MS, entryEvidence, hashAcquisition,
  hashBuild, parseLoadingProbeArgs, runMultiplayerLoadingBuildProbe } from './multiplayer-loading-build-probe.mjs';

let passed = 0;
async function test(name, run) { await run(); passed++; console.log(`ok ${passed} - ${name}`); }
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

function nativeReceipt() {
  return { ok: true, signalingTransport: 'local-loopback', browserLaunch: { verified: true },
    browserHealth: { browserDisconnected: false, peers: [{}, {}] },
    cleanup: { browserClosed: true, roomCleanupVerified: true },
    entry: { peers: ['host', 'guest'].map(role => ({ role, observation: {
      countdown: [5, 4, 3, 2, 1], foregroundCountdown: role === 'host' ? [5, 4, 3, 2, 1] : [],
      transitions: [{ countdown: 5, at: 100 }, { rollout: true, at: 5100 }],
      readiness: { loaderHidden: true, reveal: { primed: true } },
      networkLoad: { status: 'complete', blackCheck: { before: 18, after: null, error: false, rescued: false } },
      framesDropped: 0, transitionsDropped: 0, longTasksDropped: 0, maxRafGapMs: 150,
    } })) } };
}

function fixture() {
  const events = [], controller = new AbortController();
  const service = { store: { rooms: new Map() }, async listen() { events.push('listen'); } };
  const server = { httpServer: { address: () => ({ port: 32123 }) } };
  let now = 0, options;
  const deps = {
    now: () => now,
    createLock: () => ({ async acquire(timeout) {
      assert.equal(timeout, CAPTURE_QUEUE_TIMEOUT_MS); events.push('lock'); now += 600000;
    }, refresh() {}, release() { events.push('release'); } }),
    assertPortUnused: () => events.push('port-check'),
    createSignaling: () => { events.push('signal'); return service; },
    startPreview: async (dist, retain) => { events.push('preview'); retain(server); return server; },
    closePreview: async owner => { assert.equal(owner, server); events.push('preview-close'); },
    closeSignaling: async owner => { assert.equal(owner, service); events.push('signal-close'); },
    verify: async config => {
      options = config; events.push('verify'); service.store.rooms.set('owned', {});
      config.onStage('ready_and_launch'); service.store.rooms.clear();
      events.push('native-cleanup'); now += 15000; return nativeReceipt();
    },
  };
  return { events, controller, service, server, deps, get options() { return options; },
    advance: milliseconds => { now += milliseconds; },
    run: () => acquireLoadingEvidence('/immutable/dist', { signal: controller.signal }, deps) };
}

await test('existing native helper only; FIFO wait is excluded from the 300-second scenario', async () => {
  const f = fixture(), report = await f.run();
  assert.equal(report.ok, true); assert.equal(report.captureQueueWaitMs, 600000);
  assert.equal(report.scenarioDurationMs, 15000);
  assert.deepEqual(f.events, ['lock', 'port-check', 'signal', 'listen', 'preview', 'verify', 'native-cleanup', 'preview-close', 'signal-close', 'release']);
  assert.deepEqual(Object.keys(f.options).sort(), ['entryProfile', 'localSignaling', 'onStage', 'timeoutMs', 'url']);
  assert.equal(f.options.entryProfile, 'timings'); assert.equal(f.options.localSignaling, true);
  assert.equal(f.options.url, 'http://127.0.0.1:32123'); assert.equal(f.options.timeoutMs, 290000);
  assert.deepEqual(report.acquisitions, { admitted: 3, retained: 3, rejected: 0, drainedBeforeResourceCleanup: true });
  assert.equal(report.entry.peers[1].countdownToRolloutMs, 5000);
});

await test('pre-aborted admission starts neither FIFO ticket nor service', async () => {
  const f = fixture(); f.controller.abort(); const report = await f.run();
  assert.equal(report.cancelled, true); assert.equal(report.ok, false);
  assert.deepEqual(f.events, ['release']); assert.equal(report.acquisitions.admitted, 0);
});

await test('cancellation while queued drains late lock and refuses every later resource', async () => {
  const f = fixture(), gate = deferred(), started = deferred();
  f.deps.createLock = () => ({ acquire() { f.events.push('lock'); started.resolve(); return gate.promise; },
    refresh() {}, release() { f.events.push('release'); } });
  let completed = false; const pending = f.run().then(report => { completed = true; return report; });
  await started.promise; f.controller.abort(); await Promise.resolve(); assert.equal(completed, false);
  gate.resolve(); const report = await pending;
  assert.deepEqual(f.events, ['lock', 'release']); assert.equal(report.cleanup.lockReleased, true);
  assert.equal(report.acquisitions.retained, 1); assert.equal(report.scenarioDurationMs, null);
});

await test('failed FIFO admission still drains ticket producer with no service admission', async () => {
  const f = fixture(); f.deps.createLock = () => ({ acquire: async () => { throw new Error('private provider text'); }, refresh() {}, release() {} });
  const report = await f.run(); assert.equal(report.ok, false); assert.equal(report.acquisitions.rejected, 1);
  assert.equal(JSON.stringify(report).includes('private provider text'), false); assert.deepEqual(f.events, []);
});

await test('foreign port listener fails before creation and is never used or killed', async () => {
  const f = fixture(); f.deps.assertPortUnused = () => { throw new Error('occupied'); };
  const report = await f.run(); assert.equal(report.ok, false);
  assert.deepEqual(f.events, ['lock', 'release']); assert.equal(report.cleanup.signalingClosed, true);
});

await test('listen race failure closes the already-retained exact service', async () => {
  const f = fixture(); f.service.listen = async () => { throw Object.assign(new Error('occupied'), { code: 'EADDRINUSE' }); };
  const report = await f.run(); assert.equal(report.ok, false); assert.equal(report.acquisitions.rejected, 1);
  assert.deepEqual(f.events, ['lock', 'port-check', 'signal', 'signal-close', 'release']);
});

await test('preview retained before failure is closed despite rejected acquisition', async () => {
  const f = fixture(); f.deps.startPreview = async (_dist, retain) => { retain(f.server); throw new Error('preview failed'); };
  const report = await f.run(); assert.equal(report.ok, false);
  assert.deepEqual(f.events.slice(-3), ['preview-close', 'signal-close', 'release']);
});

await test('late preview cancellation drains producer before exact cleanup, without browser admission', async () => {
  const f = fixture(), gate = deferred(), started = deferred();
  f.deps.startPreview = async () => { started.resolve(); await gate.promise; return f.server; };
  const pending = f.run(); await started.promise; f.controller.abort(); gate.resolve();
  const report = await pending; assert.equal(report.ok, false); assert.equal(report.acquisitions.retained, 3);
  assert.equal(f.events.includes('verify'), false);
  assert.deepEqual(f.events.slice(-3), ['preview-close', 'signal-close', 'release']);
});

await test('native failure cleanup is retained and completes before server/lock cleanup', async () => {
  const f = fixture(); f.deps.verify = async () => {
    f.events.push('native-cleanup'); throw Object.assign(new Error('secret endpoint'), {
      cleanup: { browserClosed: true, roomCleanupVerified: true } });
  };
  const report = await f.run(); assert.equal(report.cleanup.native.browserClosed, true);
  assert.equal(JSON.stringify(report).includes('secret endpoint'), false);
  assert.deepEqual(f.events.slice(-4), ['native-cleanup', 'preview-close', 'signal-close', 'release']);
});

await test('cleanup failures fail the report but never skip later owned cleanup', async () => {
  const f = fixture(); f.deps.closePreview = async () => { throw new Error('close'); };
  const report = await f.run(); assert.equal(report.ok, false); assert.equal(report.cleanup.previewClosed, false);
  assert.deepEqual(f.events.slice(-2), ['signal-close', 'release']);
});

await test('300-second overrun fails without abandoning the native helper', async () => {
  const f = fixture(), verify = f.deps.verify;
  f.deps.verify = async options => { const result = await verify(options); f.advance(300000); return result; };
  const report = await f.run(); assert.equal(report.withinScenarioBudget, false); assert.equal(report.ok, false);
  assert.equal(report.cleanup.native.browserClosed, true); assert.equal(report.cleanup.signalingClosed, true);
});

await test('missing owned room, browser crash, or cleanup receipt cannot pass', async () => {
  for (const kind of ['room', 'crash', 'cleanup']) {
    const f = fixture(), verify = f.deps.verify;
    f.deps.verify = async options => {
      if (kind === 'room') return nativeReceipt();
      const result = await verify(options);
      if (kind === 'crash') result.browserHealth.peers[0].rendererCrashCount = 1;
      else result.cleanup.browserClosed = false;
      return result;
    };
    assert.equal((await f.run()).ok, false, kind);
  }
});

await test('countdown, nonblack, reveal, and complete observer gates reject missing evidence', () => {
  for (const mutate of [row => { row.countdown = [3, 2, 1]; }, row => { row.networkLoad.blackCheck.before = 0; },
    row => { row.networkLoad.blackCheck.error = true; }, row => { row.readiness.reveal.primed = false; },
    row => { row.transitions = []; }, row => { row.transitions[1].at = 3100; },
    row => { row.transitionsDropped = 1; }]) {
    const receipt = nativeReceipt(); mutate(receipt.entry.peers[1].observation);
    assert.equal(entryEvidence(receipt).complete, false);
  }
  assert.equal(entryEvidence(nativeReceipt()).complete, true);
});

await test('both peers must roll out inside the explicit 4500–6500 ms native countdown window', () => {
  assert.deepEqual(entryEvidence(nativeReceipt()).countdownBoundsMs, { min: 4500, max: 6500 });
  for (const peerIndex of [0, 1]) {
    for (const [durationMs, expected] of [[4499.99, false], [4500, true], [5000, true],
      [6500, true], [6500.01, false], [10255.9, false], [10346.4, false]]) {
      const receipt = nativeReceipt();
      const transitions = receipt.entry.peers[peerIndex].observation.transitions;
      transitions[1].at = transitions[0].at + durationMs;
      assert.equal(entryEvidence(receipt).complete, expected, `peer ${peerIndex}: ${durationMs} ms`);
    }
  }
});

await test('an eventually complete but slow countdown fails acquisition after owned cleanup', async () => {
  const f = fixture(), verify = f.deps.verify;
  f.deps.verify = async options => {
    const result = await verify(options);
    result.entry.peers[0].observation.transitions[1].at = 10446.4;
    return result;
  };
  const report = await f.run();
  assert.equal(report.ok, false); assert.equal(report.entry.complete, false);
  assert.equal(report.errors[0].code, 'entry_evidence_incomplete');
  assert.equal(report.cleanup.native.browserClosed, true);
  assert.deepEqual(f.events.slice(-4), ['native-cleanup', 'preview-close', 'signal-close', 'release']);
});

const temporary = mkdtempSync(join(tmpdir(), 'cot-loading-probe-selftest-'));
try {
  await test('complete build identity includes nested binary assets and rejects links', () => {
    const root = join(temporary, 'build'); mkdirSync(root); mkdirSync(join(root, 'textures'));
    writeFileSync(join(root, 'index.html'), 'index'); writeFileSync(join(root, 'textures/a.bin'), Buffer.from([0, 1, 2]));
    const before = hashBuild(root); writeFileSync(join(root, 'textures/a.bin'), Buffer.from([0, 1, 3]));
    assert.equal(before.files, 2); assert.notEqual(hashBuild(root).sha256, before.sha256);
    symlinkSync(join(root, 'index.html'), join(root, 'link')); assert.throws(() => hashBuild(root), /build_symlink/);
  });
  await test('acquisition fingerprint follows parent and dynamic native TypeScript dependencies', () => {
    const root = join(temporary, 'sources'); mkdirSync(root); mkdirSync(join(root, 'tools'));
    writeFileSync(join(root, 'package.json'), '{}'); writeFileSync(join(root, 'package-lock.json'), '{}');
    writeFileSync(join(root, 'tools/entry.mjs'), "import '../server.ts'; import('./child.mjs');\n");
    writeFileSync(join(root, 'tools/child.mjs'), 'export const n = 1;'); writeFileSync(join(root, 'server.ts'), 'export const n = 2;');
    const before = hashAcquisition(root, join(root, 'tools/entry.mjs'));
    assert.equal(before.files, 5); writeFileSync(join(root, 'server.ts'), 'export const n = 3;');
    assert.notEqual(hashAcquisition(root, join(root, 'tools/entry.mjs')).sha256, before.sha256);
  });
  await test('strict fresh output, explicit approved SHA and immutable identity even before admission cancellation', async () => {
    const dist = join(temporary, 'public'), out = join(temporary, 'report'); mkdirSync(dist);
    const index = '<meta name="application-version" content="v1.0.0+g123456789">';
    writeFileSync(join(dist, 'index.html'), index);
    const expectedBuildIndexHash = createHash('sha256').update(index).digest('hex');
    const controller = new AbortController(); controller.abort();
    await assert.rejects(runMultiplayerLoadingBuildProbe({ dist, out }), /approved_index_sha_required/);
    await assert.rejects(runMultiplayerLoadingBuildProbe({ dist, out, expectedBuildIndexHash: '0'.repeat(64) }), /approved_index_mismatch/);
    await assert.rejects(runMultiplayerLoadingBuildProbe({ dist, out: join(dist, 'output'), expectedBuildIndexHash }), /output_inside_build/);
    const report = await runMultiplayerLoadingBuildProbe({ dist, out, expectedBuildIndexHash, signal: controller.signal });
    assert.equal(report.ok, false); assert.equal(report.identityUnchanged, true);
    assert.equal(report.sourceVersion, 'v1.0.0+g123456789'); assert.equal(report.acquisitions.admitted, 0);
    assert.deepEqual(JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')), report);
    await assert.rejects(runMultiplayerLoadingBuildProbe({ dist, out, expectedBuildIndexHash, signal: controller.signal }), { code: 'EEXIST' });
  });
} finally { rmSync(temporary, { recursive: true, force: true }); }

await test('CLI does not accept endpoint, weather, quality, dwell, secret, or timeout overrides', () => {
  for (const flag of ['url', 'endpoint', 'weather', 'quality', 'wait-for-room-map', 'token', 'timeout-ms']) {
    assert.throws(() => parseLoadingProbeArgs([`--${flag}=value`]));
  }
  assert.throws(() => parseLoadingProbeArgs(['--dist=/a', '--dist=/b']));
  assert.equal(parseLoadingProbeArgs(['--dist=/a', '--out=/b', '--expected-build-index-hash=abc']).dist, '/a');
});
console.log(`multiplayer-loading-build-probe.selftest: ${passed} CPU-only cases passed`);
