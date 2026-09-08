import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { productionUiOptions, validateUiProgress, cleanupProductionUi,
  verifyProductionPrivateRoomUi, battleScreenshotAllowed, captureBattleScreenshot,
  measureProductionFeedback } from './production-private-room-ui.mjs';
import * as relayProbe from './production-private-room-ui.mjs';
import { createMultiplayerRenderWorkload } from './multiplayer-render-workload.mjs';
import { nativeBrowserLaunchOptions, verifyNativeBrowserLaunch } from './native-browser-launch.mjs';

const backgroundOverrides = ['--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'];
const requestedLaunch = { headless: true, args: ['--enable-webgl'],
  ignoreDefaultArgs: ['--some-existing-default', backgroundOverrides[0]] };
const savedLaunch = structuredClone(requestedLaunch);
const nativeLaunch = nativeBrowserLaunchOptions(requestedLaunch);
assert.deepEqual(requestedLaunch, savedLaunch, 'normalization cannot mutate caller-owned launch options');
assert.deepEqual(nativeLaunch.args, requestedLaunch.args);
assert.deepEqual(nativeLaunch.ignoreDefaultArgs, ['--some-existing-default', ...backgroundOverrides]);
assert.equal(nativeBrowserLaunchOptions({ ignoreDefaultArgs: true }).ignoreDefaultArgs, true);
assert.deepEqual(nativeBrowserLaunchOptions({ ignoreDefaultArgs: false }).ignoreDefaultArgs, backgroundOverrides);
for (const flag of backgroundOverrides) {
  assert.throws(() => nativeBrowserLaunchOptions({ args: [flag] }), /native_browser_background_override/);
  for (const argument of [flag, `${flag}=false`]) assert.throws(() => verifyNativeBrowserLaunch({
    process: () => ({ spawnargs: ['PRIVATE_EXECUTABLE', argument] }),
  }), /native_browser_background_override/);
}
for (const value of [null, {}, { process: () => null }, { process() { throw new Error('PRIVATE'); } },
  { process: () => ({ spawnargs: [] }) }, { process: () => ({ spawnargs: [7] }) },
  { process: () => ({ spawnargs: Array(513).fill('PRIVATE') }) }]) {
  assert.throws(() => verifyNativeBrowserLaunch(value), /native_browser_launch_unverifiable/);
}
for (const options of [{ args: 'PRIVATE' }, { args: [1] }, { ignoreDefaultArgs: 'PRIVATE' },
  { ignoreDefaultArgs: [1] }]) {
  assert.throws(() => nativeBrowserLaunchOptions(options), /native_browser_launch_options_invalid/);
}
const launchReceipt = verifyNativeBrowserLaunch({ process: () => ({ spawnargs: [
  'PRIVATE_EXECUTABLE', '--user-data-dir=PRIVATE_PATH', 'https://PRIVATE_URL/PRIVATE_TOKEN', '--headless=new',
] }) });
assert.deepEqual(launchReceipt,
  { verified: true, argumentCount: 4, checkedBackgroundFlags: 3, backgroundOverridesPresent: 0 });
assert.doesNotMatch(JSON.stringify(launchReceipt), /PRIVATE|spawnargs|user-data-dir/);
for (const spawnargs of [undefined, ['PRIVATE_EXECUTABLE', backgroundOverrides[1]]]) {
  let closed = 0;
  await assert.rejects(verifyProductionPrivateRoomUi({ url: 'https://game.example.test',
    launchBrowser: async (options) => {
      assert.deepEqual(options.ignoreDefaultArgs, backgroundOverrides);
      return { process: () => ({ spawnargs }),
        async createBrowserContext() { assert.fail('unverified browser must not create or join a room'); },
        async close() { closed++; } };
    },
  }), error => {
    assert.equal(error.stage, 'browser_launch');
    assert.equal(error.diagnosticCode, spawnargs
      ? 'native_browser_background_override' : 'native_browser_launch_unverifiable');
    assert.equal(error.cleanup.browserClosed, true);
    assert.equal(error.cleanup.roomCleanupVerified, true);
    assert.doesNotMatch(JSON.stringify(error), /PRIVATE/);
    return true;
  });
  assert.equal(closed, 1);
}

assert.deepEqual(productionUiOptions({ url: 'https://game.example.test' }),
  { origin: 'https://game.example.test', timeoutMs: 300_000 });
for (const entryProfile of ['host', 'guest', 'timings']) {
  assert.equal(productionUiOptions({ url: 'https://game.example.test', entryProfile }).entryProfile,
    entryProfile, 'entry profiling does not require a combat performance measurement');
}
for (const entryProfile of [null, '', true, 1, 'both', 'PRIVATE_ROLE']) {
  assert.throws(() => productionUiOptions({ url: 'https://game.example.test', entryProfile }),
    /entry profile/);
}
assert.equal(productionUiOptions({ url: 'https://game.example.test', entryProfile: 'timings',
  waitForRoomMap: true }).waitForRoomMap, true);
for (const waitForRoomMap of [null, 0, 1, '', 'true']) {
  assert.throws(() => productionUiOptions({ url: 'https://game.example.test', entryProfile: 'timings',
    waitForRoomMap }), /waiting-room map/);
}
assert.throws(() => productionUiOptions({ url: 'https://game.example.test', waitForRoomMap: true }),
  /entry profile/, 'completed waiting-room attribution requires explicit post-launch observation');
assert.deepEqual(productionUiOptions({ url: 'https://game.example.test', waitForRoomMap: false }),
  { origin: 'https://game.example.test', timeoutMs: 300_000 }, 'the default immediate-start options remain unchanged');

function roomMapPage({ completed = 0, lastMap = null, active = 'winter',
  selectedMap = 'winter', phase = 'garage', visible = true, readError = null } = {}) {
  const stats = { requested: 1, completed, joined: 0, promoted: 0, cancelled: 0,
    skippedCapacity: 0, lastMs: 5, lastMap, active, privateRoom: 'PRIVATE_ROOM' };
  let reads = 0;
  return { stats, get reads() { return reads; }, page: { async evaluate(reader) {
    reads++;
    if (readError) throw readError;
    assert.equal(reader, relayProbe.readProductionRoomMapState);
    return JSON.parse(JSON.stringify(runInNewContext(`(${reader.toString()})()`, {
      window: { __WORLD_PREFETCH: stats, __DEBUG: { game: { phase } } },
      document: { querySelector: (selector) => selector.includes('data-control') ? { value: selectedMap }
        : { getClientRects: () => visible ? [1] : [] } },
    })));
  } } };
}
const finishedRoomMap = () => roomMapPage({ completed: 1, lastMap: 'winter', active: null });
for (const options of [{ completed: 1, lastMap: 'PRIVATE_MAP', active: null },
  { completed: 1, lastMap: 'winter', active: 'PRIVATE_MAP' },
  { completed: 1, lastMap: 'winter', active: null, selectedMap: 'PRIVATE_MAP' },
  { completed: 1, lastMap: 'winter', active: null, phase: 'battle' },
  { completed: 1, lastMap: 'winter', active: null, visible: false },
  { completed: Infinity, lastMap: 'winter', active: null }]) {
  const projected = await roomMapPage(options).page.evaluate(relayProbe.readProductionRoomMapState);
  assert.equal(projected.ready, false, 'only a completed idle Winter build in the actual waiting room qualifies');
  assert.doesNotMatch(JSON.stringify(projected), /PRIVATE|Infinity/);
}
const completedPeers = [finishedRoomMap(), roomMapPage()];
let dwellClock = 0;
const dwellDelays = [];
let retainedDwell;
const dwell = await relayProbe.waitForCompletedRoomMap(completedPeers.map((peer) => peer.page), {
  now: () => dwellClock,
  delay: async (ms) => {
    dwellDelays.push(ms); dwellClock += ms;
    if (dwellClock === 200) Object.assign(completedPeers[1].stats, { completed: 1, lastMap: 'winter', active: null });
  },
  onEvidence: (receipt) => { retainedDwell = receipt; },
});
assert.equal(dwell, retainedDwell);
assert.equal(dwell.timeoutMs, 15_000);
assert.equal(dwell.dwellMs, 200, 'dwell measures observed completion, not a fixed sleep');
assert.deepEqual(dwellDelays, [100, 100]);
assert.equal(dwell.completedBeforeLaunch, true);
assert.equal(dwell.launchVerified, false, 'pre-Start completion alone is not cached-launch proof');
assert.equal(dwell.peers[1].start.counters.completed, 0);
assert.equal(dwell.peers[1].beforeLaunch.counters.completed, 1);
completedPeers[1].stats.completed = 999;
assert.equal(dwell.peers[1].beforeLaunch.counters.completed, 1, 'counter receipts are copies, not live references');
const cachedEntry = { peers: ['host', 'guest'].map((role) => ({ role, observation: {
  worldLoad: { id: 'winter', status: 'complete', cached: true, private: 'PRIVATE_WORLD' },
  worldPrefetch: { launch: { promoted: 0 }, end: { promoted: 0 } },
} })) };
const cachedDwell = relayProbe.recordCompletedRoomMapLaunch(dwell, cachedEntry);
assert.equal(cachedDwell.launchVerified, true);
assert.ok(cachedDwell.peers.every((peer) => peer.afterLaunch.cached && peer.afterLaunch.promotedDelta === 0));
assert.doesNotMatch(JSON.stringify(cachedDwell), /PRIVATE/);
for (const mutate of [
  (row) => { row.worldLoad.cached = false; }, (row) => { row.worldLoad.id = 'PRIVATE_MAP'; },
  (row) => { row.worldLoad.status = 'pending'; }, (row) => { row.worldPrefetch.launch.promoted = 1; },
  (row) => { row.worldPrefetch.end.promoted = 1; }, (row) => { row.worldPrefetch.end.promoted = null; },
]) {
  const entry = structuredClone(cachedEntry);
  mutate(entry.peers[1].observation);
  assert.equal(relayProbe.recordCompletedRoomMapLaunch(dwell, entry).launchVerified, false,
    'both peers need completed cached Winter activation without any promoted delta across launch');
}
assert.equal(relayProbe.recordCompletedRoomMapLaunch(dwell, null).launchVerified, false,
  'failed/unreadable entry observation cannot acquire a cached attribution');
for (const timeoutMs of [0, 15_001, Infinity, '15000']) {
  await assert.rejects(relayProbe.waitForCompletedRoomMap([{}, {}], { timeoutMs }), TypeError);
}
let timeoutClock = 0;
const timeoutPeers = [finishedRoomMap(), roomMapPage()];
await assert.rejects(relayProbe.waitForCompletedRoomMap(timeoutPeers.map((peer) => peer.page), {
  timeoutMs: 250, now: () => timeoutClock, delay: async (ms) => { timeoutClock += ms; },
}), (error) => {
  const receipt = relayProbe.productionFailureEvidence(error).waitingRoomMap;
  assert.equal(error.stage, 'waiting_room_map');
  assert.equal(error.operationFailure, 'deadline');
  assert.equal(receipt.dwellMs, 250);
  assert.equal(receipt.completedBeforeLaunch, false);
  assert.equal(receipt.peers[0].beforeLaunch.ready, true);
  assert.equal(receipt.peers[1].beforeLaunch.counters.completed, 0);
  assert.doesNotMatch(JSON.stringify(receipt), /PRIVATE/);
  return true;
});
assert.deepEqual(timeoutPeers.map((peer) => peer.reads), [3, 3], 'deadline stops future polls');
const unreadablePeer = roomMapPage({ readError: Object.assign(new Error('PRIVATE_TARGET'), { name: 'TargetCloseError' }) });
await assert.rejects(relayProbe.waitForCompletedRoomMap([finishedRoomMap().page, unreadablePeer.page]), (error) => {
  const receipt = relayProbe.productionFailureEvidence(error).waitingRoomMap;
  assert.equal(receipt.peers[1].readFailure, 'target-closed');
  assert.equal(receipt.peers[0].beforeLaunch.ready, true, 'failure retains the readable peer receipt');
  assert.doesNotMatch(JSON.stringify(error), /PRIVATE/);
  return true;
});
let cancelledDwell = false;
const cancelledPeers = [roomMapPage(), roomMapPage()];
await assert.rejects(relayProbe.waitForCompletedRoomMap(cancelledPeers.map((peer) => peer.page), {
  now: () => 0, isCancelled: () => cancelledDwell, delay: async () => { cancelledDwell = true; },
}));
assert.deepEqual(cancelledPeers.map((peer) => peer.reads), [1, 1], 'outer cancellation forbids another page read');
{
  let clock = 0;
  let cancelled = false;
  let guestReads = 0;
  let releaseRead;
  let signalRead;
  const readStarted = new Promise((resolve) => { signalRead = resolve; });
  const host = roomMapPage();
  const guest = roomMapPage();
  const publications = [];
  let retained;
  const pending = relayProbe.waitForCompletedRoomMap([host.page, { evaluate(reader) {
    guestReads++;
    if (guestReads === 1) { clock = 7; return guest.page.evaluate(reader); }
    return new Promise((resolve) => {
      releaseRead = () => { releaseRead = null; resolve(guest.page.evaluate(reader)); };
      signalRead();
    });
  } }], {
    now: () => clock, isCancelled: () => cancelled,
    delay: async (ms) => {
      assert.equal(retained.dwellMs, 7, 'the retained receipt measures dwell after each completed sample');
      clock += ms;
    },
    onEvidence: (receipt) => { retained = receipt; publications.push(receipt); },
  });
  try {
    assert.ok(retained, 'an outer deadline can retain the owned receipt before the first page await');
    assert.equal(host.reads, 0, 'early receipt publication precedes browser commands');
    assert.equal(retained.dwellMs, 0);
    await Promise.race([readStarted, pending]);
    const outerFailureEvidence = Object.freeze({ waitingRoomMap: retained });
    const firstCounters = Object.freeze(retained.peers[1].start.counters);
    guest.stats.completed = 99;
    clock = 137;
    cancelled = true;
    releaseRead();
    await assert.rejects(pending, (error) => {
      assert.equal(relayProbe.productionFailureEvidence(error).waitingRoomMap,
        outerFailureEvidence.waitingRoomMap, 'final failure completes the same receipt already retained by the outer owner');
      return true;
    });
    assert.equal(outerFailureEvidence.waitingRoomMap.dwellMs, 137);
    assert.equal(outerFailureEvidence.waitingRoomMap.completedBeforeLaunch, false);
    assert.equal(firstCounters.completed, 0, 'updating evidence never mutates an earlier copied counter snapshot');
    assert.ok(publications.every((receipt) => receipt === retained));
    assert.equal(guestReads, 2, 'cancellation while a read is deferred does not schedule another poll');
    assert.doesNotMatch(JSON.stringify(outerFailureEvidence), /PRIVATE/);
  } finally {
    cancelled = true;
    releaseRead?.();
    await pending.catch(() => {});
  }
}
assert.equal(productionUiOptions({ url: 'http://127.0.0.1:5180', localSignaling: true }).localSignaling, true);
assert.throws(() => productionUiOptions({ url: 'https://game.example.test', localSignaling: true }),
  /loopback/, 'local build mode cannot weaken a deployed-origin check');
for (const localSignaling of [null, 1, 'true']) assert.throws(() => productionUiOptions({
  url: 'http://127.0.0.1:5180', localSignaling,
}), /loopback/);
for (const hostname of ['127.0.0.1', 'localhost', '[::1]']) {
  const options = productionUiOptions({ url: `http://${hostname}:5180`, localSignaling: true });
  assert.equal(relayProbe.validateProductionRoomEndpoint('ws://localhost:7777/signal', options), 'local-loopback');
}
for (const endpoint of ['ws://game.example.test/signal', 'wss://localhost/signal',
  'ws://localhost/rooms', 'ws://PRIVATE@localhost/signal', 'ws://localhost/signal?token=PRIVATE',
  'ws://localhost/signal#PRIVATE', 'ws://localhost.example.test/signal']) {
  assert.throws(() => relayProbe.validateProductionRoomEndpoint(endpoint,
    { origin: 'http://127.0.0.1:5180', localSignaling: true }), /UI smoke failed/);
}
assert.throws(() => relayProbe.validateProductionRoomEndpoint('ws://localhost:7777/signal',
  { origin: 'https://game.example.test', localSignaling: true }), /UI smoke failed/);
assert.throws(() => relayProbe.validateProductionRoomEndpoint('ws://localhost:7777/signal',
  { origin: 'http://127.0.0.1:5180' }), /UI smoke failed/, 'strict mode never silently admits local signaling');
assert.equal(relayProbe.validateProductionRoomEndpoint('wss://rooms.example.test/rooms',
  { origin: 'https://game.example.test' }), 'production');
assert.equal(productionUiOptions({ url: 'https://game.example.test',
  measurePerformance: true, forceRelay: true }).forceRelay, true);
assert.throws(() => productionUiOptions({ url: 'https://game.example.test', forceRelay: true }),
  /requires --performance/);
for (const forceRelay of [null, 1, 'true']) assert.throws(() => productionUiOptions({
  url: 'https://game.example.test', measurePerformance: true, forceRelay,
}), TypeError);

for (const renderWorkload of ['dual-render-stress', 'single-foreground']) {
  assert.equal(productionUiOptions({ url: 'https://game.example.test', measurePerformance: true,
    renderWorkload }).renderWorkload, renderWorkload);
  assert.throws(() => productionUiOptions({ url: 'https://game.example.test', renderWorkload }),
    /requires --performance/);
}
for (const renderWorkload of [null, 1, '', 'PRIVATE_MODE']) assert.throws(() => productionUiOptions({
  url: 'https://game.example.test', measurePerformance: true, renderWorkload,
}), TypeError);

const workloadCalls = [];
const workloadOwner = { async dispose() { workloadCalls.push('restore'); return { windowsRestored: true }; } };
const workloadPorts = { async create(pages, options) {
  assert.equal(pages.length, 2); assert.equal(options.mode, 'single-foreground');
  workloadCalls.push('acquire'); return workloadOwner;
}, onOwner(owner) { assert.equal(owner, workloadOwner); workloadCalls.push('owned'); } };
assert.deepEqual(await relayProbe.withProductionRenderWorkload([{}, {}], 'single-foreground', async (owner) => {
  assert.equal(owner, workloadOwner); workloadCalls.push('sample'); return { samples: [1, 2] };
}, workloadPorts), { result: { samples: [1, 2] }, cleanup: { windowsRestored: true } });
assert.deepEqual(workloadCalls, ['acquire', 'owned', 'sample', 'restore']);
const sampleError = new Error('feedback_sample_missing');
await assert.rejects(relayProbe.withProductionRenderWorkload([{}, {}], 'single-foreground',
  async () => { throw sampleError; }, workloadPorts), (error) => error === sampleError);
assert.equal(workloadCalls.at(-1), 'restore', 'measurement failure restores before room teardown');
await assert.rejects(relayProbe.withProductionRenderWorkload([{}, {}], 'single-foreground',
  async () => { assert.fail('late acquisition cannot start sampling after overall cancellation'); },
  { ...workloadPorts, onOwner() { throw sampleError; } }), (error) => error === sampleError);
assert.equal(workloadCalls.at(-1), 'restore', 'late acquired native owner is restored even before collection begins');
const cleanupError = new Error('render_workload_cleanup_failed');
const failedWorkloadPorts = { create: async () => ({ dispose: async () => { throw cleanupError; } }) };
await assert.rejects(relayProbe.withProductionRenderWorkload([{}, {}], undefined,
  async () => { throw sampleError; }, failedWorkloadPorts), (error) => {
  assert.equal(error, sampleError, 'primary measurement error is not replaced by cleanup failure');
  assert.equal(error.cleanupFailed, true);
  return true;
});
await assert.rejects(relayProbe.withProductionRenderWorkload([{}, {}], undefined,
  async () => ({}), failedWorkloadPorts), (error) => error === cleanupError);
for (const code of ['render_workload_start_failed', 'render_workload_admission_failed',
  'render_workload_observation_failed', 'render_workload_cleanup_failed']) {
  assert.equal(relayProbe.productionDiagnosticCode(new Error(code)), code);
  assert.equal(relayProbe.productionDiagnosticCode(new Error(`${code}:PRIVATE_SECRET`)), null);
}
for (const version of ['HeadlessChrome/148.0.7757.4', 'Chrome/148.0.7757.4']) {
  assert.equal(await relayProbe.readProductionBrowserVersion({ version: async () => version }), version);
}
for (const version of ['PRIVATE_VERSION', 'HeadlessChrome/148.0.7757.4?PRIVATE_SECRET',
  'Chrome/148.0.7757.4\n', 'Chrome/148.0.7757', null, { PRIVATE: true }]) {
  assert.equal(await relayProbe.readProductionBrowserVersion({ version: async () => version }), null);
}
assert.equal(await relayProbe.readProductionBrowserVersion({}), null);
assert.equal(await relayProbe.readProductionBrowserVersion({ version: async () => { throw new Error('PRIVATE'); } }), null);

class NativePeer {
  static nativeMarker = 'native-static';
  constructor(config, constraints) { this.config = config; this.constraints = constraints; }
  getConfiguration() { return this.config; }
}
const relayWindow = { RTCPeerConnection: NativePeer };
const installRelay = () => runInNewContext(`(${relayProbe.installProductionRelayPolicy.toString()})()`,
  { window: relayWindow });
installRelay();
const WrappedPeer = relayWindow.RTCPeerConnection;
installRelay();
assert.equal(relayWindow.RTCPeerConnection, WrappedPeer, 'installation is idempotent');
assert.equal(WrappedPeer.prototype, NativePeer.prototype);
assert.equal(WrappedPeer.name, NativePeer.name);
assert.equal(WrappedPeer.nativeMarker, NativePeer.nativeMarker);
const iceServers = [{ urls: 'turn:PRIVATE_TURN_ENDPOINT', credential: 'PRIVATE_TURN_SECRET' }];
const rtcConfig = { iceServers, iceTransportPolicy: 'all', bundlePolicy: 'max-bundle', iceCandidatePoolSize: 4 };
const constraints = { native: true };
const relayPeer = new WrappedPeer(rtcConfig, constraints);
assert.ok(relayPeer instanceof NativePeer && relayPeer instanceof WrappedPeer);
assert.equal(relayPeer.config.iceServers, iceServers, 'deployed ICE objects are not replaced or copied');
assert.equal(relayPeer.constraints, constraints);
assert.equal(relayPeer.config.iceTransportPolicy, 'relay');
assert.equal(relayPeer.config.bundlePolicy, rtcConfig.bundlePolicy);
assert.equal(relayPeer.config.iceCandidatePoolSize, rtcConfig.iceCandidatePoolSize);
assert.equal(rtcConfig.iceTransportPolicy, 'all', 'the caller-owned configuration is not mutated');
class DerivedPeer extends WrappedPeer {}
assert.ok(new DerivedPeer(rtcConfig) instanceof DerivedPeer, 'native subclass/newTarget semantics survive');

function statsPeer({ type = 'relay', remoteType = 'relay', policy = 'relay', channels = 2, connected = true,
  fail = false, pairState = 'succeeded' } = {}) {
  const stats = new Map([
    ['transport', { type: 'transport', selectedCandidatePairId: 'PRIVATE_PAIR' }],
    ['PRIVATE_PAIR', { type: 'candidate-pair', state: pairState, localCandidateId: 'PRIVATE_LOCAL',
      remoteCandidateId: 'PRIVATE_REMOTE', bytesSent: 400, bytesReceived: 500 }],
    ['PRIVATE_LOCAL', { candidateType: type, address: 'PRIVATE_ADDRESS' }],
    ['PRIVATE_REMOTE', { candidateType: remoteType, address: 'PRIVATE_REMOTE_ADDRESS' }],
  ]);
  for (let index = 0; index < channels; index++) stats.set(`channel${index}`, {
    type: 'data-channel', label: ['cot-match-v1', 'cot-state-v1'][index], state: 'open',
    messagesSent: 10, messagesReceived: 20,
  });
  return { connectionState: connected ? 'connected' : 'closed',
    getConfiguration: () => ({ iceTransportPolicy: policy, credential: 'PRIVATE_SECRET' }),
    async getStats() { if (fail) throw new Error('PRIVATE_STATS_ERROR'); return stats; } };
}
async function readRelay(peers, failures = 0) {
  return runInNewContext(`(${relayProbe.readProductionRelayConnections.toString()})()`, {
    window: { __COT_FORCE_RELAY: true, __COT_FEEDBACK_NETWORK: { peers: new Set(peers), failures } },
  });
}
const safeRelay = await readRelay([statsPeer(), statsPeer()]);
assert.equal(safeRelay.connectedPeers, 2);
assert.equal(safeRelay.openGameChannels, 4);
assert.equal(safeRelay.gameMessagesSent, 40);
assert.equal(safeRelay.gameMessagesReceived, 80);
assert.equal(safeRelay.policy, 'relay');
assert.doesNotMatch(JSON.stringify(safeRelay), /PRIVATE_/);
const reflectedRelay = await readRelay([statsPeer({ remoteType: 'prflx' }), statsPeer()]);
assert.deepEqual(Array.from(reflectedRelay.remoteCandidateTypes), ['prflx', 'relay'],
  'RFC 8445 peer-reflexive remote discovery does not undo the selected local relay');
for (const type of ['host', 'srflx', 'prflx']) {
  await assert.rejects(readRelay([statsPeer({ type, remoteType: 'prflx' })]),
    /relay_verification_failed:pair/, 'every selected local candidate must still be relayed');
}
await assert.rejects(readRelay([statsPeer({ remoteType: 'PRIVATE_UNKNOWN_TYPE' })]), /relay_verification_failed:pair/);
for (const peers of [[], [statsPeer({ type: 'host' })], [statsPeer({ policy: 'all' })],
  [statsPeer(), statsPeer({ type: 'srflx' })], [statsPeer({ channels: 1 })],
  [statsPeer({ connected: false })], [statsPeer({ fail: true })]]) {
  await assert.rejects(readRelay(peers), (error) => !/PRIVATE_/.test(error.message));
}
await assert.rejects(readRelay([statsPeer()], 1));
const disconnectedPeer = statsPeer();
disconnectedPeer.connectionState = 'disconnected';
const invalidCounterPeer = statsPeer();
invalidCounterPeer.getStats = async () => {
  const stats = await statsPeer().getStats();
  stats.get('PRIVATE_PAIR').bytesSent = NaN;
  return stats;
};
for (const [peers, failures, reason] of [[[], 0, 'missing'], [[statsPeer()], 1, 'observer'],
  [[statsPeer({ type: 'host' })], 0, 'pair'], [[statsPeer({ policy: 'all' })], 0, 'policy'],
  [[statsPeer({ channels: 1 })], 0, 'channels'], [[disconnectedPeer], 0, 'disconnected'],
  [[invalidCounterPeer], 0, 'counter'], [[statsPeer({ fail: true })], 0, 'stats']]) {
  await assert.rejects(readRelay(peers, failures), (error) => {
    assert.ok(error.message === `relay_verification_failed:${reason}` ||
      (reason === 'pair' && error.message.startsWith('relay_verification_failed:pair:')));
    const projected = relayProbe.productionDiagnosticDetails(error);
    assert.equal(projected.diagnosticCode, 'relay_verification_failed');
    assert.equal(projected.relayReason, reason);
    assert.doesNotMatch(JSON.stringify(projected), /PRIVATE/);
    return true;
  });
}
for (const [pairState, selectedPairPresent, localType, remoteType] of [
  ['succeeded', true, 'host', 'relay'], ['failed', true, 'relay', 'prflx'],
  ['waiting', true, 'relay', 'relay'], ['frozen', true, 'relay', 'relay'], [null, false, null, null],
  [null, true, null, null],
]) {
  const peer = statsPeer();
  peer.getStats = async () => {
    const stats = await statsPeer().getStats();
    if (!selectedPairPresent) stats.delete('PRIVATE_PAIR');
    else Object.assign(stats.get('PRIVATE_PAIR'), { state: pairState ?? 'PRIVATE_STATE' });
    stats.get('PRIVATE_LOCAL').candidateType = localType ?? 'PRIVATE_TYPE';
    stats.get('PRIVATE_REMOTE').candidateType = remoteType ?? 'PRIVATE_TYPE';
    return stats;
  };
  await assert.rejects(readRelay([peer]), (error) => {
    assert.deepEqual(relayProbe.productionDiagnosticDetails(error).relayPair,
      { pairState, selectedPairPresent, localType, remoteType });
    assert.doesNotMatch(error.message, /PRIVATE/);
    return true;
  });
}

function relayMonitorPorts(overrides = {}) {
  const scheduled = new Map();
  let handle = 0;
  let count = 0;
  const ports = { scheduled,
    schedule(callback, delay) { assert.equal(delay, 1000); scheduled.set(++handle, callback); return handle; },
    cancel(id) { scheduled.delete(id); },
    async sample() { count++; return [0, 1].map(() => ({ policy: 'relay', connectedPeers: 1,
      openGameChannels: 2, remoteCandidateTypes: ['relay'], observedPairStates: ['succeeded'], succeededPeers: 1,
      bytesSent: count * 300, bytesReceived: count * 400,
      gameMessagesSent: count * 10, gameMessagesReceived: count * 20 })); },
    async tick() {
      const [id, callback] = scheduled.entries().next().value;
      scheduled.delete(id); await callback();
    }, ...overrides };
  return ports;
}
const gameplayResult = { samples: [0, 1].map(() => ({ firing: { confirmed: { count: 2 } } })) };
const ports = relayMonitorPorts();
const preparationError = Object.assign(new Error('feedback_native_input_preparation_failed'), {
  nativePreparation: { nativeClickAttempts: 1, nativeClickCompleted: true, fireActions: 1,
    predictedShots: 1, confirmedShots: 0, overflow: false, ammoBefore: [24, 4, 6, 'PRIVATE'],
    ammoAfter: [23, 4, 6, 'PRIVATE'], durationMs: 400, ready: false, PRIVATE_TOKEN: 'PRIVATE_SECRET' },
});
await assert.rejects(relayProbe.withProductionRelayValidation([{}, {}], async () => { throw preparationError; },
  relayMonitorPorts()), (error) => {
  assert.equal(relayProbe.productionDiagnosticCode(error), 'feedback_native_input_preparation_failed');
  const receipt = relayProbe.productionFailureEvidence(error).nativePreparation;
  assert.equal(receipt.nativeClickAttempts, 1);
  assert.equal(receipt.predictedShots, 1);
  assert.equal(receipt.confirmedShots, 0, 'unconfirmed preparation is not represented as successful firing');
  assert.deepEqual(receipt.ammoAfter, [23, 4, 6]);
  assert.doesNotMatch(JSON.stringify(receipt), /PRIVATE/);
  return true;
});
assert.equal(relayProbe.productionDiagnosticCode(new Error('feedback_native_input_preparation_failed:PRIVATE')), null);
const unavailablePages = [0, 1].map(() => ({ evaluate: async () => { throw new Error('PRIVATE_PAGE'); } }));
const unavailableWorkload = await createMultiplayerRenderWorkload(unavailablePages);
let workloadError;
try { await unavailableWorkload.begin('host'); } catch (error) { workloadError = error; }
await unavailableWorkload.dispose();
await assert.rejects(relayProbe.withProductionRelayValidation([{}, {}], async () => { throw workloadError; },
  relayMonitorPorts()), (error) => {
  assert.equal(relayProbe.productionDiagnosticCode(error), 'render_workload_admission_failed');
  assert.equal(relayProbe.productionFailureEvidence(error).renderWorkload.measuredRole, 'host');
  assert.doesNotMatch(JSON.stringify(relayProbe.productionFailureEvidence(error)), /PRIVATE/);
  return true;
});
const monitored = await relayProbe.withProductionRelayValidation([{}, {}], async () => {
  await ports.tick(); await ports.tick(); return gameplayResult;
}, ports);
assert.equal(monitored.relay.sampleCount, 4, 'start, periodic samples and final sample cover gameplay');
assert.equal(monitored.relay.sampleIntervalMs, 1000);
assert.equal(monitored.relay.policyOverride, 'tool-only-force-relay');
assert.equal(monitored.relay.gameplayConfirmed, true);
assert.equal(monitored.relay.localCandidateType, 'relay');
assert.deepEqual(monitored.relay.peers.map((peer) => peer.remoteCandidateTypes), [['relay'], ['relay']]);
assert.equal(monitored.relay.candidateTypes, undefined, 'no false symmetric relay/relay claim');
assert.equal(monitored.result, gameplayResult);
assert.equal(ports.scheduled.size, 0, 'successful sample leaves no polling timer');
function consentPage({ states = ['in-progress', 'succeeded', 'in-progress'], traffic = true } = {}) {
  let polls = 0;
  const peer = statsPeer();
  const browserState = { peers: new Set([peer]), failures: 0 };
  const browser = { __COT_FORCE_RELAY: true, __COT_FEEDBACK_NETWORK: browserState };
  return { browserState, peer, async evaluate(fn, options) {
    const active = [...browserState.peers][0];
    const stats = await active.getStats();
    stats.get('PRIVATE_PAIR').state = states[Math.min(polls, states.length - 1)];
    const counter = traffic ? ++polls * 10 : 10;
    Object.assign(stats.get('PRIVATE_PAIR'), { bytesSent: counter, bytesReceived: counter });
    for (const row of stats.values()) if (row.type === 'data-channel') {
      row.messagesSent = counter; row.messagesReceived = counter;
    }
    return runInNewContext(`(${fn.toString()})(${JSON.stringify(options)})`, { window: browser });
  } };
}
const consentPages = [consentPage(), consentPage()];
const consentPorts = relayMonitorPorts();
const consentReceipt = await relayProbe.withProductionRelayValidation(consentPages, async () => {
  await consentPorts.tick(); return gameplayResult;
}, { schedule: consentPorts.schedule, cancel: consentPorts.cancel });
for (const peer of consentReceipt.relay.peers) {
  assert.deepEqual(peer.observedPairStates, ['in-progress', 'succeeded']);
  assert.equal(peer.succeededPeers, peer.connectedPeers);
}
const resetConsentPorts = relayMonitorPorts();
await assert.rejects(relayProbe.withProductionRelayValidation(consentPages, async () => {
  await resetConsentPorts.tick(); return gameplayResult;
}, { schedule: resetConsentPorts.schedule, cancel: resetConsentPorts.cancel }),
(error) => error.stage === 'relay_gameplay', 'a new observation interval cannot inherit a previous successful check');
for (const options of [{ states: ['in-progress'] }, { states: ['succeeded'], traffic: false }]) {
  const noProofPorts = relayMonitorPorts();
  await assert.rejects(relayProbe.withProductionRelayValidation([consentPage(options), consentPage(options)],
    async () => { await noProofPorts.tick(); return gameplayResult; },
    { schedule: noProofPorts.schedule, cancel: noProofPorts.cancel }), (error) => error.stage === 'relay_gameplay',
  'in-progress alone or non-advancing channels cannot prove live relay gameplay');
}
const replacedPages = [consentPage({ states: ['succeeded', 'in-progress'] }), consentPage()];
const replacementPorts = relayMonitorPorts();
await assert.rejects(relayProbe.withProductionRelayValidation(replacedPages, async () => {
  replacedPages[0].browserState.peers.clear();
  replacedPages[0].browserState.peers.add(statsPeer());
  await replacementPorts.tick(); return gameplayResult;
}, { schedule: replacementPorts.schedule, cancel: replacementPorts.cancel }),
(error) => error.stage === 'relay_gameplay', 'a replacement peer cannot inherit a predecessor successful check');
const unavailableSelection = statsPeer({ pairState: 'in-progress' });
(await unavailableSelection.getStats()).get('transport').selectedCandidatePairId = undefined;
await assert.rejects(readRelay([unavailableSelection]), /relay_verification_failed:pair/);
const consentDisconnected = statsPeer({ pairState: 'in-progress' });
consentDisconnected.connectionState = 'disconnected';
await assert.rejects(readRelay([consentDisconnected]), /relay_verification_failed:disconnected/);
const midReadDisconnect = statsPeer({ pairState: 'in-progress' });
const connectedStats = midReadDisconnect.getStats;
midReadDisconnect.getStats = async () => {
  midReadDisconnect.connectionState = 'disconnected'; return connectedStats();
};
await assert.rejects(readRelay([midReadDisconnect]), /relay_verification_failed:disconnected/);
await assert.rejects(readRelay([statsPeer({ pairState: 'in-progress', channels: 1 })]),
  /relay_verification_failed:channels/);
const staleChannels = statsPeer({ pairState: 'in-progress' });
(await staleChannels.getStats()).get('channel1').state = 'closed';
await assert.rejects(readRelay([staleChannels]), /relay_verification_failed:channels/);
let nativePolls = 0;
const nativePagePorts = relayMonitorPorts();
const nativePages = [0, 1].map((index) => ({ async evaluate() {
  if (index === 0) nativePolls++;
  if (index === 1 && nativePolls === 2) throw new Error('relay_verification_failed:pair');
  return { policy: 'relay', connectedPeers: 1, openGameChannels: 2, remoteCandidateTypes: ['relay'],
    observedPairStates: ['succeeded'], succeededPeers: 1,
    bytesSent: 10, bytesReceived: 10,
    gameMessagesSent: 10, gameMessagesReceived: 10 };
} }));
await assert.rejects(relayProbe.withProductionRelayValidation(nativePages, async () => {
  await nativePagePorts.tick(); return gameplayResult;
}, { schedule: nativePagePorts.schedule, cancel: nativePagePorts.cancel }), (error) => {
  assert.equal(error.diagnosticCode, 'relay_verification_failed');
  assert.equal(error.relayReason, 'pair');
  assert.equal(error.relayRole, 'guest');
  assert.equal(error.relaySampleCount, 1, 'partial receipts count only completed whole-roster polls');
  assert.equal(error.partialRelay.verified, false);
  assert.equal(error.partialRelay.sampleCount, 1);
  assert.equal(error.partialRelay.peers.length, 2);
  assert.equal(error.partialRelay.peers[0].messagesSent, 0);
  return true;
});
assert.equal(nativePagePorts.scheduled.size, 0);
const remoteDiscoveryPorts = relayMonitorPorts();
const discoverySample = remoteDiscoveryPorts.sample;
let discoveries = 0;
remoteDiscoveryPorts.sample = async () => {
  const rows = await discoverySample();
  if (++discoveries === 2) rows[1].remoteCandidateTypes = ['prflx'];
  return rows;
};
const discoveryReceipt = await relayProbe.withProductionRelayValidation([{}, {}], async () => {
  await remoteDiscoveryPorts.tick(); return gameplayResult;
}, remoteDiscoveryPorts);
assert.deepEqual(discoveryReceipt.relay.peers[1].remoteCandidateTypes, ['prflx', 'relay'],
  'retain safe remote candidate observations across the whole interval, not only endpoints');
const switchedPorts = relayMonitorPorts();
let routeSamples = 0;
const sampleRoute = switchedPorts.sample;
switchedPorts.sample = async () => {
  const rows = await sampleRoute();
  if (++routeSamples === 2) rows[1].policy = 'all';
  return rows;
};
await assert.rejects(relayProbe.withProductionRelayValidation([{}, {}], async () => {
  await switchedPorts.tick(); return gameplayResult;
}, switchedPorts), (error) => error.stage === 'relay_gameplay');
assert.equal(switchedPorts.scheduled.size, 0, 'a mid-game policy change cannot pass on good endpoint samples');
const failedPorts = relayMonitorPorts();
await assert.rejects(relayProbe.withProductionRelayValidation([{}, {}], async () => {
  await failedPorts.tick(); throw new Error('PRIVATE_SAMPLE_ERROR');
}, failedPorts), (error) => error.stage === 'relay_gameplay');
assert.equal(failedPorts.scheduled.size, 0, 'failed gameplay cancels relay polling');
const wrongRoutePorts = relayMonitorPorts({ async sample() { throw new Error('PRIVATE_ROUTE_ERROR'); } });
await assert.rejects(relayProbe.withProductionRelayValidation([{}, {}], async () => gameplayResult,
  wrongRoutePorts), (error) => error.stage === 'relay_gameplay' && !JSON.stringify(error).includes('PRIVATE_'));
assert.equal(wrongRoutePorts.scheduled.size, 0);
const emptyGameplayPorts = relayMonitorPorts();
await assert.rejects(relayProbe.withProductionRelayValidation([{}, {}], async () => ({ samples: [] }),
  emptyGameplayPorts), (error) => error.stage === 'relay_gameplay');
assert.equal(emptyGameplayPorts.scheduled.size, 0);
const limitedPorts = relayMonitorPorts();
await assert.rejects(relayProbe.withProductionRelayValidation([{}, {}], async () => {
  for (let index = 0; index < 90; index++) {
    if (limitedPorts.scheduled.size) await limitedPorts.tick();
  }
  return gameplayResult;
}, limitedPorts), (error) => error.stage === 'relay_gameplay');
assert.equal(limitedPorts.scheduled.size, 0, 'relay monitoring has a hard sample bound');

const weatherDebug = { battleAtmosphere: { current: { weather: { condition: 'snow', timeOfDay: 'night',
  precipitationIntensity: 0.5, seed: 'PRIVATE_SEED' } } },
  scene: { children: [{ name: 'battle-precipitation', visible: true, geometry: { instanceCount: 192 } }] },
  quality: { resolvePresetName: () => 'high' }, post: { dynScale: 0.75 } };
function readContext(debug) {
  return JSON.parse(JSON.stringify(runInNewContext(`(${relayProbe.readProductionRenderingContext.toString()})()`,
    { window: { __DEBUG: debug } })));
}
const unknownGpu = { gpu: null, gpuVendor: null, gpuUnmasked: false, glVersion: null, gpuBackend: 'unknown' };
assert.deepEqual(readContext(weatherDebug), { condition: 'snow', timeOfDay: 'night',
  precipitationIntensity: 0.5, particleCount: 192, preset: 'high', renderScale: 0.75, ...unknownGpu });
assert.doesNotMatch(JSON.stringify(readContext(weatherDebug)), /PRIVATE_SEED/);
assert.deepEqual(readContext({}), { condition: null, timeOfDay: null, precipitationIntensity: null,
  particleCount: null, preset: null, renderScale: null, ...unknownGpu });
const unknownWeather = { ...weatherDebug, battleAtmosphere: { current: { weather: {
  condition: 'PRIVATE_CONDITION', timeOfDay: 'PRIVATE_TIME', precipitationIntensity: NaN } } },
  quality: { resolvePresetName: () => 'PRIVATE_PRESET' }, post: { dynScale: Infinity }, scene: { children: [] } };
assert.deepEqual(readContext(unknownWeather), { condition: null, timeOfDay: null, precipitationIntensity: null,
  particleCount: 0, preset: null, renderScale: null, ...unknownGpu });
const gpuWeather = readContext(weatherDebug);
const gpuVersion = 'WebGL 2.0 (OpenGL ES 3.0 Chromium)';
function gpuFixture(rendererName, overrides = {}) {
  const queries = [];
  const gl = {
    VERSION: 1, RENDERER: 2, VENDOR: 3,
    isContextLost: () => false,
    getExtension(name) {
      queries.push(name);
      assert.equal(name, 'WEBGL_debug_renderer_info');
      return { UNMASKED_RENDERER_WEBGL: 4, UNMASKED_VENDOR_WEBGL: 5 };
    },
    getParameter(key) {
      queries.push(key);
      assert.ok([1, 4, 5].includes(key), 'never query a masked identity as hardware evidence');
      return new Map([[1, gpuVersion], [4, rendererName], [5, ' GPU vendor ']]).get(key);
    },
    ...overrides,
  };
  return { queries, debug: { ...weatherDebug, renderer: { getContext: () => gl } } };
}
for (const name of ['ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Max)',
  'ANGLE (NVIDIA, NVIDIA GeForce RTX 4090)', 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics)',
  'ANGLE (ARM, Mali-G78)']) {
  const fixture = gpuFixture(` ${name} `);
  assert.deepEqual(readContext(fixture.debug), { ...gpuWeather, gpu: name, gpuVendor: 'GPU vendor',
    gpuUnmasked: true, glVersion: gpuVersion, gpuBackend: 'hardware-like' });
  assert.deepEqual(fixture.queries, [1, 'WEBGL_debug_renderer_info', 4, 5]);
}
for (const name of ['ANGLE (Google, SwiftShader Device)', 'llvmpipe (LLVM 15.0.7)', 'softpipe',
  'lavapipe', 'Software Rasterizer', 'Microsoft Basic Render Driver', 'D3D11 WARP',
  'Mesa swrast', 'OSMesa', 'GDI Generic', 'Apple software renderer']) {
  assert.equal(readContext(gpuFixture(name).debug).gpuBackend, 'software', name);
}
for (const name of ['WebKit WebGL', 'ANGLE', 'Generic GPU']) {
  assert.equal(readContext(gpuFixture(name).debug).gpuBackend, 'unknown',
    'generic or privacy-limited strings are not hardware proof');
}
for (const name of [null, undefined, '', '   ', 42, { toString() { assert.fail('no identity coercion'); } },
  `Apple ${'x'.repeat(256)} SwiftShader`, 'Apple\u0000GPU']) {
  const receipt = readContext(gpuFixture(name).debug);
  assert.equal(receipt.gpu, null);
  assert.equal(receipt.gpuUnmasked, false);
  assert.equal(receipt.gpuBackend, 'unknown');
}
for (const getContext of [() => null, () => undefined, () => { throw new Error('PRIVATE_CONTEXT'); }]) {
  assert.deepEqual(readContext({ ...weatherDebug, renderer: { getContext } }), gpuWeather);
}
const privateGpu = gpuFixture('Apple M5', { getExtension: () => null });
assert.deepEqual(readContext(privateGpu.debug), { ...gpuWeather, glVersion: gpuVersion });
assert.deepEqual(privateGpu.queries, [1], 'privacy extension absence cannot fall back to masked labels');
for (const overrides of [{ getExtension() { throw new Error('PRIVATE_EXTENSION'); } },
  { getExtension: () => ({}) }]) {
  assert.deepEqual(readContext(gpuFixture('Apple M5', overrides).debug), { ...gpuWeather, glVersion: gpuVersion });
}
for (const overrides of [{ isContextLost: () => true },
  { isContextLost() { throw new Error('PRIVATE_LOST'); } },
  { getParameter() { throw new Error('PRIVATE_PARAMETER'); } },
  { getParameter: () => 'x'.repeat(257) }]) {
  assert.deepEqual(readContext(gpuFixture('Apple M5', overrides).debug), gpuWeather,
    'unavailable identity and version preserve the other context diagnostics');
}
for (const url of [undefined, '', 'file:///game', 'https://secret:token@game.example.test',
  'https://game.example.test/path', 'https://game.example.test?signal=override',
  'https://game.example.test#secret']) assert.throws(() => productionUiOptions({ url }), TypeError);
for (const timeoutMs of [0, 29_999, 300_001, 30_000.5, NaN, Infinity]) {
  assert.throws(() => productionUiOptions({ url: 'https://game.example.test', timeoutMs }), TypeError);
}
assert.deepEqual(productionUiOptions({ url: 'https://game.example.test', measurePerformance: true,
  screenshots: '/private/tmp/task-artifacts/battle/' }), {
  origin: 'https://game.example.test', timeoutMs: 300_000, screenshots: '/private/tmp/task-artifacts/battle/',
});
for (const screenshots of ['', '.', 'artifacts', '/', '/private/tmp/../battle', null, true]) {
  assert.throws(() => productionUiOptions({ url: 'https://game.example.test', measurePerformance: true, screenshots }),
    TypeError);
}
assert.throws(() => productionUiOptions({ url: 'https://game.example.test', screenshots: '/private/tmp/artifacts' }),
  /require --performance/, 'screenshots are allowed only after the optional timed measurement');
for (const ammoSlot of [1, 2, 3]) {
  assert.equal(productionUiOptions({ url: 'https://game.example.test', measurePerformance: true,
    ammoSlot }).ammoSlot, ammoSlot);
  assert.throws(() => productionUiOptions({ url: 'https://game.example.test', ammoSlot }),
    /requires --performance/);
}
for (const ammoSlot of [0, 4, -1, 1.5, NaN, Infinity, null, true, '2']) {
  assert.throws(() => productionUiOptions({ url: 'https://game.example.test', measurePerformance: true,
    ammoSlot }), TypeError);
}

assert.throws(() => productionUiOptions({ url: 'https://game.example.test', cpuTimeline: true }),
  /requires --performance/);
for (const cpuTimeline of [null, 1, 'true']) assert.throws(() => productionUiOptions({
  url: 'https://game.example.test', measurePerformance: true, cpuTimeline,
}), TypeError);
assert.equal(productionUiOptions({ url: 'https://game.example.test', measurePerformance: true,
  cpuTimeline: true }).cpuTimeline, true);
assert.equal(productionUiOptions({ url: 'https://game.example.test', measurePerformance: true,
  frameTrace: true }).frameTrace, true);
assert.throws(() => productionUiOptions({ url: 'https://game.example.test', frameTrace: true }),
  /requires --performance/);
assert.throws(() => productionUiOptions({ url: 'https://game.example.test', measurePerformance: true,
  frameTrace: true, cpuTimeline: true }), /mutually exclusive/);
for (const frameTrace of [null, 1, 'true']) assert.throws(() => productionUiOptions({
  url: 'https://game.example.test', measurePerformance: true, frameTrace,
}), TypeError);
for (const sourceProfile of ['host', 'guest']) {
  assert.equal(productionUiOptions({ url: 'https://game.example.test', measurePerformance: true,
    sourceProfile }).sourceProfile, sourceProfile);
  assert.throws(() => productionUiOptions({ url: 'https://game.example.test', sourceProfile }),
    /requires --performance/);
  for (const conflicting of ['cpuTimeline', 'frameTrace']) assert.throws(() => productionUiOptions({
    url: 'https://game.example.test', measurePerformance: true, sourceProfile, [conflicting]: true,
  }), /mutually exclusive/);
}
for (const sourceProfile of [null, '', true, 1, 'both', 'PRIVATE_ROLE']) assert.throws(() => productionUiOptions({
  url: 'https://game.example.test', measurePerformance: true, sourceProfile,
}), TypeError);
const timelineCalls = [];
const timelinePage = {};
const diagnosticPorts = {
  async startTimeline(page) {
    assert.equal(page, timelinePage); timelineCalls.push('start');
    return { async stop() { timelineCalls.push('stop'); return { baselinePageTimeMs: 100, rows: [] }; } };
  },
  async measure(page, duration, slot, capture) {
    assert.equal(page, timelinePage); assert.equal(duration, 20_000); assert.equal(slot, 2);
    timelineCalls.push('ready');
    if (capture?.beforeSample) await capture.beforeSample();
    if (capture?.afterSampleStarted) await capture.afterSampleStarted();
    timelineCalls.push('measure');
    if (capture?.afterSample) await capture.afterSample(140);
    return { sampleStartedAtMs: 120, firing: {} };
  },
};
assert.deepEqual(await measureProductionFeedback(timelinePage, { ammoSlot: 2 }, diagnosticPorts),
  { sampleStartedAtMs: 120, firing: {} });
assert.deepEqual(timelineCalls.splice(0), ['ready', 'measure'], 'default native sample has no added CDP work');
const sourceProfileOptions = { origin: 'https://game.example.test', ammoSlot: 2, sourceProfile: 'guest' };
const sourcePorts = { ...diagnosticPorts, role: 'host',
  async startSourceProfile(page, settings) {
    assert.equal(page, timelinePage);
    assert.deepEqual(settings, { origin: sourceProfileOptions.origin });
    timelineCalls.push('source-start');
    return { async stop() { timelineCalls.push('source-stop'); return {
      baselinePageTimeMs: 100, startBeforePageTimeMs: 99, startAfterPageTimeMs: 101,
      profileDurationMs: 30, diagnosticOverhead: true, functions: [], bins: [], binMs: 100,
    }; } };
  },
};
for (const diagnosis of [{}, { cpuTimeline: true }, { frameTrace: true }, { sourceProfile: 'guest' }]) {
  await measureProductionFeedback(timelinePage, { origin: sourceProfileOptions.origin, ammoSlot: 2,
    renderWorkload: 'single-foreground', ...diagnosis }, { ...sourcePorts, role: 'guest',
    startTrace: diagnosticPorts.startTimeline,
    async measure(...args) {
      assert.equal(args[3].nativePreflight, true,
        'single-foreground restores legitimate native pointer capture before every diagnostic variant');
      return diagnosticPorts.measure(...args);
    },
  });
}
for (const renderWorkload of [undefined, 'dual-render-stress']) {
  await measureProductionFeedback(timelinePage, { ammoSlot: 2, renderWorkload }, {
    ...diagnosticPorts, async measure(...args) {
      assert.equal(args.length, 3, 'default and explicit dual stress retain original sample invocation');
      return diagnosticPorts.measure(...args);
    },
  });
}
timelineCalls.splice(0);
await measureProductionFeedback(timelinePage, sourceProfileOptions, sourcePorts);
assert.deepEqual(timelineCalls.splice(0), ['ready', 'measure'], 'unselected role does not acquire any profiler');
const sourceDiagnostic = await measureProductionFeedback(timelinePage, sourceProfileOptions,
  { ...sourcePorts, role: 'guest' });
assert.deepEqual(timelineCalls.splice(0), ['ready', 'source-start', 'measure', 'source-stop']);
assert.equal(sourceDiagnostic.sourceProfile.sampleStartOffsetMs, 20);
assert.equal(sourceDiagnostic.sourceProfile.sampleFullyCovered, false, 'missing sample duration cannot claim coverage');
assert.equal(sourceDiagnostic.sourceProfile.captureComplete, true);
for (const durationMs of [8, 10]) {
  const measured = await measureProductionFeedback(timelinePage, sourceProfileOptions, {
    ...sourcePorts, role: 'guest', async measure(_page, _duration, _slot, capture) {
      await capture.afterSampleStarted(); await capture.afterSample(120 + durationMs);
      return { sampleStartedAtMs: 120, durationMs };
    },
  });
  assert.equal(measured.sourceProfile.sampleFullyCovered, durationMs === 8,
    'coverage uses the conservative start bracket, not midpoint optimism');
}
timelineCalls.splice(0);
await assert.rejects(measureProductionFeedback(timelinePage, sourceProfileOptions, {
  ...sourcePorts, role: 'guest', async measure(_page, _duration, _slot, capture) {
    await capture.afterSampleStarted(); throw new Error('feedback_sample_missing');
  },
}), /feedback_sample_missing/);
assert.deepEqual(timelineCalls.splice(0), ['source-start', 'source-stop'], 'measurement failure still stops the source profiler');
await assert.rejects(measureProductionFeedback(timelinePage, sourceProfileOptions, {
  role: 'guest', async startSourceProfile() { return { async stop() {
    throw Object.assign(new Error('source_profile_stop_failed'), { cleanupFailed: true });
  } }; },
  async measure(_page, _duration, _slot, capture) { await capture.afterSampleStarted(); throw new Error('feedback_sample_missing'); },
}), (error) => error.diagnosticCode === 'source_profile_stop_failed' &&
  error.measurementDiagnosticCode === 'feedback_sample_missing' && error.cleanupFailed === true);
const diagnostic = await measureProductionFeedback(timelinePage, { ammoSlot: 2, cpuTimeline: true }, diagnosticPorts);
assert.equal(diagnostic.cpuTimeline.sampleStartOffsetMs, 20);
assert.equal(diagnostic.cpuTimeline.diagnosticOverhead, true);
assert.deepEqual(timelineCalls.splice(0), ['ready', 'start', 'measure', 'stop']);
await assert.rejects(measureProductionFeedback(timelinePage, { cpuTimeline: true }, {
  ...diagnosticPorts, async measure(_page, _duration, _slot, capture) {
    await capture.beforeSample(); timelineCalls.push('measure'); throw new Error('sample failed');
  },
}), /sample failed/);
assert.deepEqual(timelineCalls.splice(0), ['start', 'measure', 'stop'], 'failed measurement still closes its CDP owner');
await assert.rejects(measureProductionFeedback(timelinePage, { frameTrace: true }, {
  async startTrace() { assert.fail('no trace acquisition before native readiness'); },
  async measure() { throw new Error('feedback_ammo_selection_timeout'); },
}), /feedback_ammo_selection_timeout/);
await assert.rejects(measureProductionFeedback(timelinePage, { frameTrace: true }, {
  async startTrace() { throw new Error('frame_trace_start_failed'); },
  async measure(_page, _duration, _slot, capture) { await capture.beforeSample(); assert.fail('no sample after failed start'); },
}), /frame_trace_start_failed/);
const traceCalls = [];
const tracePorts = { ...diagnosticPorts, async startTrace() {
  traceCalls.push('start');
  return { async stop() { traceCalls.push('stop'); return { baselinePageTimeMs: 100,
    complete: false, dataLossOccurred: false, rowsDropped: 0, malformed: 0,
    stackOverflow: 0, openDurationEvents: 1, rows: [{ kind: 'task', startOffsetMs: 5, durationMs: 9, thread: 0 }] }; } };
} };
const frameDiagnostic = await measureProductionFeedback(timelinePage, { ammoSlot: 2, frameTrace: true }, tracePorts);
assert.equal(frameDiagnostic.frameTrace.sampleStartOffsetMs, 20);
assert.equal(frameDiagnostic.frameTrace.complete, false);
assert.equal(frameDiagnostic.frameTrace.attributionValid, false);
assert.equal(frameDiagnostic.frameTrace.rows.length, 1, 'partial trace evidence is retained, not silently discarded');
assert.equal(frameDiagnostic.frameTrace.diagnosticOverhead, true);
assert.deepEqual(traceCalls.splice(0), ['start', 'stop']);
await assert.rejects(measureProductionFeedback(timelinePage, { frameTrace: true }, {
  ...tracePorts, async measure(_page, _duration, _slot, capture) {
    await capture.beforeSample(); throw new Error('failed measurement');
  },
}), /failed measurement/);
assert.deepEqual(traceCalls, ['start', 'stop'], 'trace owner stops after a failed native measurement');
const traceFailure = Object.assign(new Error('frame_trace_stop_failed'), {
  traceStage: 'flush', traceFailure: 'timeout', completeBeforeStop: false,
});
await assert.rejects(measureProductionFeedback(timelinePage, { frameTrace: true }, {
  async startTrace() { return { async stop() { throw traceFailure; } }; },
  async measure(_page, _duration, _slot, capture) {
    await capture.beforeSample(); throw new Error('feedback_sample_missing');
  },
}), (error) => {
  assert.equal(error.measurementDiagnosticCode, 'feedback_sample_missing',
    'trace shutdown cannot erase the earlier measurement failure');
  assert.equal(relayProbe.productionDiagnosticCode(error), 'frame_trace_stop_failed');
  assert.equal(error.traceStage, 'flush');
  assert.equal(error.traceFailure, 'timeout');
  assert.equal(error.completeBeforeStop, false);
  return true;
});
for (const [changes, covered, complete] of [[{}, true, true],
  [{ captureEndPageTimeMs: 139 }, false, false], [{ baselinePageTimeMs: 121 }, false, false],
  [{ clockDriftMs: 2.01 }, true, false], [{ complete: false }, true, false]]) {
  const capture = { baselinePageTimeMs: 100, captureEndPageTimeMs: 140, clockDriftMs: 0,
    complete: true, dataLossOccurred: false, rowsDropped: 0, malformed: 0, stackOverflow: 0,
    openDurationEvents: 0, stopReason: 'manual', rows: [], ...changes };
  const measured = await measureProductionFeedback(timelinePage, { frameTrace: true }, {
    async startTrace() { return { async stop() { return capture; } }; },
    async measure(_page, _duration, _slot, capture) {
      await capture.beforeSample(); return { sampleStartedAtMs: 120, durationMs: 20 };
    },
  });
  assert.equal(measured.frameTrace.sampleFullyCovered, covered);
  assert.equal(measured.frameTrace.complete, complete);
  assert.equal(measured.frameTrace.attributionValid, complete);
  assert.equal(measured.frameTrace.captureComplete, capture.complete,
    'keep collector completion separate from whole-sample attribution validity');
}

const captureCalls = [];
const imageBytes = new Uint8Array([1, 2, 3]);
const imageIo = { async mkdir(path, options) { captureCalls.push(['mkdir', path, options]); },
  async writeFile(path, bytes, options) { captureCalls.push(['write', path, bytes, options]); } };
const capturePage = { async evaluate(fn) {
  assert.equal(fn, battleScreenshotAllowed); captureCalls.push(['guard']); return true;
}, async screenshot(options) { captureCalls.push(['capture', options]); return imageBytes; } };
assert.deepEqual(await captureBattleScreenshot(capturePage, '/private/tmp/artifacts', 'host', imageIo),
  { role: 'host', filename: 'host-battle.png', capturedAfterSample: true, viewportOnly: true });
assert.deepEqual(captureCalls.map(([kind]) => kind), ['guard', 'capture', 'guard', 'mkdir', 'write']);
assert.deepEqual(captureCalls[1][1], { type: 'png', fullPage: false, captureBeyondViewport: false });
assert.equal(captureCalls.at(-1)[1], '/private/tmp/artifacts/host-battle.png');
assert.deepEqual(captureCalls.at(-1)[3], { flag: 'wx' }, 'existing screenshots are never overwritten');
assert.equal((await captureBattleScreenshot(capturePage, '/private/tmp/artifacts', 'guest', imageIo)).filename,
  'guest-battle.png');
let guardCalls = 0;
let captured = 0;
const privatePage = { async evaluate() { return ++guardCalls === 1; },
  async screenshot() { captured++; return imageBytes; } };
const beforePrivate = captureCalls.length;
await assert.rejects(captureBattleScreenshot(privatePage, '/private/tmp/artifacts', 'host', imageIo),
  (error) => error.stage === 'screenshot_battle_guard');
assert.equal(captured, 1);
assert.equal(captureCalls.length, beforePrivate, 'a menu/room-code transition during capture is not saved');
await assert.rejects(captureBattleScreenshot(capturePage, '/private/tmp/artifacts', '../private', imageIo),
  (error) => error.stage === 'screenshot_role');

function screenshotPermission(change = {}) {
  const world = { URL, location: { href: 'https://game.example.test/?room=ABCDEF' },
    window: { __DEBUG: { game: { phase: 'battle', result: null, player: { id: 'private_player_id' }, tanks: [] },
      network: { connected: true } } }, document: { hidden: false, hasFocus: () => true,
      body: { innerText: 'Winter battlefield 60 FPS' }, querySelectorAll: () => [] },
    getComputedStyle: () => ({ visibility: 'visible' }) };
  change.apply?.(world);
  return runInNewContext(`(${battleScreenshotAllowed.toString()})()`, world);
}
assert.equal(screenshotPermission(), true);
for (const apply of [
  (world) => { world.window.__DEBUG.game.phase = 'garage'; },
  (world) => { world.window.__DEBUG.game.result = 'victory'; },
  (world) => { world.window.__DEBUG.network.connected = false; },
  (world) => { world.window.__COT_FEEDBACK_SAMPLE = { disposed: false }; },
  (world) => { world.document.body.innerText = 'ROOM CODE abcdef'; },
  (world) => { world.document.body.innerText = 'private_player_id'; },
  (world) => { world.document.hidden = true; },
  (world) => { world.document.querySelectorAll = () => [{ getClientRects: () => [1] }]; },
]) assert.equal(screenshotPermission({ apply }), false, 'unsafe or active-timed capture is denied');
const first = { phase: 'battle', connected: true, loadingVisible: false,
  snapshotPacketsReceived: 8, inputPacketsSubmitted: 10 };
const second = { ...first, snapshotPacketsReceived: 16, inputPacketsSubmitted: 22 };
assert.deepEqual(validateUiProgress([first, first], [second, second]), [
  { role: 'host', phase: 'battle', connected: true, snapshotIncrease: 8, inputIncrease: 12 },
  { role: 'guest', phase: 'battle', connected: true, snapshotIncrease: 8, inputIncrease: 12 },
]);
for (const changed of [{ phase: 'garage' }, { connected: false }, { loadingVisible: true },
  { snapshotPacketsReceived: 8 }, { inputPacketsSubmitted: 10 }]) {
  assert.throws(() => validateUiProgress([first, first], [second, { ...second, ...changed }]));
}
assert.throws(() => validateUiProgress([], []));
assert.doesNotMatch(JSON.stringify(validateUiProgress([first, first],
  [{ ...second, secret: 'PRIVATE_SECRET' }, second])), /PRIVATE_SECRET/);

let closes = 0;
let kills = 0;
assert.deepEqual(await cleanupProductionUi({ roomCreated: false, pages: [], browser: {
  async close() { closes++; },
} }), { roomCleanupVerified: true, browserClosed: true });
assert.equal(closes, 1);
function garageReady({ phase = 'garage', control = '.cot-battle', cover = null, hidden = false } = {}) {
  return runInNewContext(`(${relayProbe.readProductionGarageReadiness.toString()})()`, {
    window: { __DEBUG: { game: { phase } } },
    document: { querySelector: (selector) => selector === control || selector === cover
      ? { getClientRects: () => hidden ? [] : [1] } : null },
    getComputedStyle: () => ({ visibility: 'visible' }),
  });
}
assert.equal(garageReady(), true);
assert.equal(garageReady({ control: '.cot-play.show [data-action="leave"]' }), true);
for (const options of [{ phase: 'battle' }, { cover: '.cot-trans.on' },
  { cover: '.cot-bl.on' }, { hidden: true }, { control: null }]) {
  assert.equal(garageReady(options), false, 'Garage readiness requires real uncovered controls');
}
function cleanupPage({ failAt = null, remoteClose = null } = {}) {
  const state = { phase: 'battle', cover: false, garage: false, settings: false,
    room: true, lobby: false, pendingLobby: false, network: null };
  const calls = [];
  function element(selector) {
    const shown = (selector === '.cot-battle' && state.garage) ||
      (selector.includes('[data-action="leave"]') && state.lobby) ||
      (selector === '.cot-settings.open .leave' && state.settings) ||
      (selector.includes('.cot-trans.on') && state.cover);
    return shown ? { getClientRects: () => [1] } : null;
  }
  function run(predicate) {
    return runInNewContext(`(${predicate.toString()})()`, { URL,
      window: { __DEBUG: { game: { phase: state.phase }, network: state.network } },
      location: { href: `https://game.example.test/${state.room ? '?room=PRIVATE' : ''}` },
      document: { querySelector: element }, getComputedStyle: () => ({ visibility: 'visible' }) });
  }
  return { state, calls, page: {
    isClosed: () => false, async bringToFront() {},
    keyboard: { async press() {
      if (remoteClose) {
        state.phase = remoteClose === 'phase-battle' ? 'battle' : 'garage';
        state.room = remoteClose === 'url-retained';
        state.network = remoteClose === 'network-retained' ? { connected: false } : null;
        state.settings = false;
        return;
      }
      state.settings = !state.settings;
    } },
    async evaluate(predicate) {
      if (predicate.name === 'readUiState') return { phase: state.phase, hasRoomUrl: state.room };
      return run(predicate);
    },
    async $eval(selector, predicate) {
      const node = element(selector); if (!node) throw new Error('PRIVATE_MISSING_ELEMENT');
      return predicate(node);
    },
    async waitForSelector(selector) {
      if (state.pendingLobby) { state.pendingLobby = false; state.lobby = true; }
      assert.ok(element(selector), 'native target is visibly ready');
    },
    async click(selector) {
      calls.push(selector);
      if (selector === '.cot-settings.open .leave') {
        state.settings = false; state.phase = 'garage'; state.cover = true; state.garage = true;
      } else if (selector === '.cot-battle') {
        assert.equal(state.cover, false, 'Garage controls must not be clicked during its covered return');
        state.pendingLobby = true;
      } else if (selector.includes('[data-action="leave"]')) {
        state.lobby = false; state.room = false;
      }
    },
    async waitForFunction(predicate) {
      if (predicate.name === 'readProductionGarageReadiness') {
        calls.push('garage_ready');
        assert.equal(run(predicate), false, 'phase and visible Garage alone do not prove an uncovered return');
        if (failAt === 'garage_ready') throw new Error('PRIVATE_READY_TIMEOUT');
        state.cover = false;
      }
      assert.equal(run(predicate), true);
    },
  } };
}
const coveredReturn = cleanupPage();
const coveredReceipt = await cleanupProductionUi({ roomCreated: true, pages: [coveredReturn.page] });
assert.equal(coveredReceipt.roomCleanupVerified, true,
  'wait for uncovered Garage and the asynchronously opened retained lobby before native Leave');
assert.deepEqual(coveredReceipt.roomCleanup, [{ role: 'host', closed: true, stage: 'complete' }]);
assert.deepEqual(coveredReturn.calls, ['.cot-settings.open .leave', 'garage_ready', '.cot-battle',
  '.cot-play.show [data-action="leave"]']);
const stuckReturn = cleanupPage({ failAt: 'garage_ready' });
const stuckReceipt = await cleanupProductionUi({ roomCreated: true, pages: [stuckReturn.page] });
assert.deepEqual(stuckReceipt.roomCleanup, [{ role: 'host', closed: false, stage: 'garage_ready' }]);
assert.doesNotMatch(JSON.stringify(stuckReceipt), /PRIVATE/);
const remoteReturn = cleanupPage({ remoteClose: 'complete' });
assert.equal((await cleanupProductionUi({ roomCreated: true, pages: [remoteReturn.page] }))
  .roomCleanupVerified, true, 'host-initiated closure may finish while guest is opening its native Leave menu');
for (const remoteClose of ['phase-battle', 'url-retained', 'network-retained']) {
  const unfinished = cleanupPage({ remoteClose });
  assert.equal((await cleanupProductionUi({ roomCreated: true, pages: [unfinished.page] }))
    .roomCleanupVerified, false, 'a missing menu is not cleanup proof while any room owner remains');
}
const incomplete = await cleanupProductionUi({ roomCreated: true,
  pages: [{ isClosed: () => false, evaluate: async () => { throw new Error('PRIVATE_TOKEN'); } }],
  browser: { async close() { closes++; throw new Error('PRIVATE_BROWSER_TOKEN'); },
    process: () => ({ kill: () => { kills++; } }) } });
assert.deepEqual(incomplete, { roomCleanupVerified: false, browserClosed: false,
  roomCleanup: [{ role: 'host', closed: false, stage: 'state_read' }] });
assert.equal(kills, 1, 'failed native close still terminates only the browser process owned by this probe');

let launchCalls = 0;
for (const diagnosticCode of ['frame_trace_start_failed', 'frame_trace_stop_failed',
  'frame_trace_cleanup_failed', 'feedback_qa_unavailable', 'feedback_sample_missing',
  'feedback_ammo_selection_timeout', 'predicted_feedback_confirmation_mismatch',
  'cpu_timeline_start_failed', 'cpu_timeline_sample_failed', 'cpu_timeline_cleanup_failed']) {
  await assert.rejects(verifyProductionPrivateRoomUi({ url: 'https://game.example.test',
    launchBrowser: async () => { throw new Error(diagnosticCode); } }), (error) => {
    assert.equal(error.diagnosticCode, diagnosticCode, 'the outer failure retains only the known diagnostic enum');
    assert.deepEqual(error.cleanup, { roomCleanupVerified: true, browserClosed: true });
    return true;
  });
}
for (const error of [new Error('PRIVATE_TOKEN'), new Error('frame_trace_stop_failed https://PRIVATE_TOKEN'),
  { code: 'https://PRIVATE_TOKEN' }, { diagnosticCode: 'PRIVATE_TOKEN' }, null]) {
  assert.equal(relayProbe.productionDiagnosticCode(error), null, 'arbitrary errors are never reflected into receipts');
}
const diagnosticRelayPorts = relayMonitorPorts();
await assert.rejects(relayProbe.withProductionRelayValidation([{}, {}], async () => {
  throw Object.assign(traceFailure, { measurementDiagnosticCode: 'feedback_ammo_selection_timeout' });
}, diagnosticRelayPorts), (error) => {
  assert.equal(error.diagnosticCode, 'frame_trace_stop_failed');
  assert.equal(error.measurementDiagnosticCode, 'feedback_ammo_selection_timeout');
  assert.equal(error.traceStage, 'flush');
  assert.equal(error.traceFailure, 'timeout');
  assert.equal(error.completeBeforeStop, false);
  return true;
});
assert.equal(diagnosticRelayPorts.scheduled.size, 0);
for (const traceStage of ['end-mark', 'end-command', 'flush']) {
  for (const traceFailure of ['timeout', 'not-started', 'protocol-or-target-error']) {
    await assert.rejects(verifyProductionPrivateRoomUi({ url: 'https://game.example.test',
      launchBrowser: async () => { throw Object.assign(new Error('frame_trace_stop_failed'), {
        traceStage, traceFailure, completeBeforeStop: true, cleanupFailed: true,
        measurementDiagnosticCode: 'feedback_ammo_selection_timeout',
      }); } }), (error) => {
      assert.equal(error.traceStage, traceStage);
      assert.equal(error.traceFailure, traceFailure);
      assert.equal(error.completeBeforeStop, true);
      assert.equal(error.cleanupFailed, true, 'cleanup failure does not erase the primary trace diagnostic');
      assert.equal(error.measurementDiagnosticCode, 'feedback_ammo_selection_timeout');
      return true;
    });
  }
}
assert.deepEqual(relayProbe.productionDiagnosticDetails({ diagnosticCode: 'frame_trace_stop_failed',
  traceStage: 'https://PRIVATE_TOKEN', traceFailure: 'PRIVATE_TOKEN', completeBeforeStop: 'PRIVATE_TOKEN',
  cleanupFailed: 'PRIVATE_TOKEN',
  measurementDiagnosticCode: 'feedback_ammo_selection_timeout PRIVATE_TOKEN',
  relayReason: 'pair PRIVATE_TOKEN', relayRole: 'PRIVATE_TOKEN', relaySampleCount: 91 }), {
  diagnosticCode: 'frame_trace_stop_failed', operationFailure: 'unknown', traceStage: null, traceFailure: null,
  completeBeforeStop: null, cleanupFailed: null, measurementDiagnosticCode: null,
  relayReason: null, relayRole: null, relaySampleCount: null, relayPair: null,
}, 'structured diagnostic fields also use exact allowlists');
for (const message of ['relay_verification_failed:pair PRIVATE_TOKEN',
  'relay_verification_failed:PRIVATE_TOKEN', 'https://PRIVATE_TOKEN/relay_verification_failed:pair']) {
  assert.equal(relayProbe.productionDiagnosticCode(new Error(message)), null);
  assert.equal(relayProbe.productionDiagnosticDetails(new Error(message)).relayReason, null);
}
assert.equal(relayProbe.productionDiagnosticDetails(new Error(
  'relay_verification_failed:pair:succeeded:1:relay:PRIVATE_TYPE')).relayPair, null);
assert.deepEqual(relayProbe.productionFailureEvidence({ performance: { secret: 'PRIVATE' },
  partialRelay: { secret: 'PRIVATE' } }), { performance: null, partialRelay: null },
'only internally constructed failure evidence can be reflected');
await assert.rejects(verifyProductionPrivateRoomUi({ url: 'https://game.example.test',
  launchBrowser: async () => { throw Object.assign(new Error('relay_verification_failed:channels'), {
    relayRole: 'host', relaySampleCount: 8,
  }); } }), (error) => {
  assert.equal(error.diagnosticCode, 'relay_verification_failed');
  assert.equal(error.relayReason, 'channels');
  assert.equal(error.relayRole, 'host');
  assert.equal(error.relaySampleCount, 8);
  return true;
});
await assert.rejects(verifyProductionPrivateRoomUi({ url: 'https://PRIVATE:TOKEN@game.example.test',
  launchBrowser: async () => { launchCalls++; } }), TypeError);
assert.equal(launchCalls, 0, 'unsafe URLs cannot launch browsers or contact production');
await assert.rejects(verifyProductionPrivateRoomUi({ url: 'https://game.example.test', ammoSlot: 2,
  launchBrowser: async () => { launchCalls++; } }), TypeError);
assert.equal(launchCalls, 0, 'ammo selection without performance fails before browser acquisition');
await assert.rejects(verifyProductionPrivateRoomUi({ url: 'https://game.example.test',
  launchBrowser: async () => { throw new Error('PRIVATE_LAUNCH_TOKEN'); } }), (error) => {
  assert.equal(error.stage, 'browser_launch');
  assert.doesNotMatch(JSON.stringify(error), /PRIVATE_LAUNCH_TOKEN/);
  assert.deepEqual(error.cleanup, { roomCleanupVerified: true, browserClosed: true });
  return true;
});
const source = await readFile(new URL('./production-private-room-ui.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(source, /setRequestInterception|\/src\/net\/|signalingClient|\.network\.route/,
  'deployed native UI smoke must not import development code, replace endpoints, or mock network responses');
assert.match(source, /if \(measurePerformance\) await page\.evaluateOnNewDocument\(installFeedbackPeerObserver\)/,
  'the optional performance observer is not installed for the unchanged smoke path');
assert.match(source, /if \(forceRelay\) await page\.evaluateOnNewDocument\(installProductionRelayPolicy\)/,
  'relay-only is an explicit pre-navigation option, not the native default');
assert.match(source, /forceRelay: process\.argv\.includes\('--force-relay'\)/);
assert.match(source, /frameTrace: process\.argv\.includes\('--frame-trace'\)/);
assert.match(source, /\.\.\.productionDiagnosticDetails\(error\)/,
  'CLI failures project the same diagnostic allowlist, not an arbitrary message');
assert.match(source, /withProductionRelayValidation\(owners\.pages/,
  'actual deployed gameplay is monitored, not merely an isolated allocation probe');
assert.match(source, /completedPerformance = receipt;[\s\S]{0,50}return receipt/,
  'completed native measurements are retained before relay validation may throw');
assert.match(source, /performance: completedPerformance/,
  'outer failure keeps locally generated measurements, never arbitrary error payloads');
assert.match(source, /measurePerformance = false/);
assert.match(source, /await measureProductionFeedback\(page, options, \{ role \}\)[\s\S]{0,100}await workload\.finish\(role\)[\s\S]{0,150}await captureBattleScreenshot/,
  'whole-sample workload observation precedes screenshots and the next role switch');
assert.match(source, /twoLoadedContextsSameMachine: true/);
assert.match(source, /27_000 \+ \(renderWorkload === 'single-foreground' \? 12_000 : 2_000\)/,
  'overall timeout reserves bounded native restoration in addition to room/browser cleanup');
assert.match(source, /requestedRenderWorkload: options\.renderWorkload \?\? 'dual-render-stress'/);
assert.match(source, /options\.renderWorkload === 'single-foreground' \? \{\} : \{ twoRenderedContextsSameMachine: true \}/,
  'legacy dual-render configuration is not mislabeled as the native single-foreground workload');
assert.match(source, /createBrowserContext\(\)/);
assert.match(source, /page\.click\(selector\)/, 'all room actions use native pointer events');
const child = spawnSync(process.execPath, ['tools/production-private-room-ui.mjs'],
  { encoding: 'utf8', timeout: 5000 });
assert.equal(child.status, 1);
assert.equal(JSON.parse(child.stderr).stage, 'configuration');
for (const args of [['--ammo-slot=2'], ...['0', '4', '2.0', '02', '', 'PRIVATE_TOKEN']
  .map((slot) => ['--performance', `--ammo-slot=${slot}`]), ['--performance', '--ammo-slot'],
  ['--force-relay'], ['--frame-trace'], ['--performance', '--frame-trace', '--cpu-timeline'],
  ['--source-profile=host'], ['--performance', '--source-profile'], ['--performance', '--source-profile='],
  ['--entry-profile'], ['--entry-profile='], ['--entry-profile=both'], ['--entry-profile=PRIVATE_TOKEN'],
  ['--wait-for-room-map'], ['--entry-profile=timings', '--wait-for-room-map=true'],
  ['--entry-profile=timings', '--wait-for-room-map=PRIVATE_TOKEN'],
  ['--performance', '--source-profile=PRIVATE_TOKEN'],
  ['--performance', '--source-profile=host', '--cpu-timeline'],
  ['--performance', '--source-profile=guest', '--frame-trace'],
  ['--render-workload=single-foreground'], ['--render-workload=dual-render-stress'],
  ['--performance', '--render-workload'], ['--performance', '--render-workload='],
  ['--performance', '--render-workload=PRIVATE_TOKEN']]) {
  const invalid = spawnSync(process.execPath, ['tools/production-private-room-ui.mjs',
    '--url=https://game.example.test', ...args], { encoding: 'utf8', timeout: 5000 });
  assert.equal(invalid.status, 1);
  const receipt = JSON.parse(invalid.stderr);
  assert.equal(receipt.stage, 'configuration');
  assert.equal(receipt.cleanup, null, 'invalid ammo arguments never acquire a browser or room');
  assert.doesNotMatch(invalid.stderr, /PRIVATE_TOKEN/);
}
console.log('production private-room UI smoke selftest passed (deterministic guards and cleanup; not a live receipt)');
