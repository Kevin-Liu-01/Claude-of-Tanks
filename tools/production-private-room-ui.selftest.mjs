import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { productionUiOptions, validateUiProgress, cleanupProductionUi,
  verifyProductionPrivateRoomUi, battleScreenshotAllowed, captureBattleScreenshot,
  measureProductionFeedback } from './production-private-room-ui.mjs';

assert.deepEqual(productionUiOptions({ url: 'https://game.example.test' }),
  { origin: 'https://game.example.test', timeoutMs: 300_000 });
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
const timelineCalls = [];
const timelinePage = {};
const diagnosticPorts = {
  async startTimeline(page) {
    assert.equal(page, timelinePage); timelineCalls.push('start');
    return { async stop() { timelineCalls.push('stop'); return { baselinePageTimeMs: 100, rows: [] }; } };
  },
  async measure(page, duration, slot) {
    assert.equal(page, timelinePage); assert.equal(duration, 20_000); assert.equal(slot, 2);
    timelineCalls.push('measure'); return { sampleStartedAtMs: 120, firing: {} };
  },
};
assert.deepEqual(await measureProductionFeedback(timelinePage, { ammoSlot: 2 }, diagnosticPorts),
  { sampleStartedAtMs: 120, firing: {} });
assert.deepEqual(timelineCalls.splice(0), ['measure'], 'default native sample has no added CDP work');
const diagnostic = await measureProductionFeedback(timelinePage, { ammoSlot: 2, cpuTimeline: true }, diagnosticPorts);
assert.equal(diagnostic.cpuTimeline.sampleStartOffsetMs, 20);
assert.equal(diagnostic.cpuTimeline.diagnosticOverhead, true);
assert.deepEqual(timelineCalls.splice(0), ['start', 'measure', 'stop']);
await assert.rejects(measureProductionFeedback(timelinePage, { cpuTimeline: true }, {
  ...diagnosticPorts, async measure() { timelineCalls.push('measure'); throw new Error('sample failed'); },
}), /sample failed/);
assert.deepEqual(timelineCalls.splice(0), ['start', 'measure', 'stop'], 'failed measurement still closes its CDP owner');

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
const incomplete = await cleanupProductionUi({ roomCreated: true,
  pages: [{ isClosed: () => false, evaluate: async () => { throw new Error('PRIVATE_TOKEN'); } }],
  browser: { async close() { closes++; throw new Error('PRIVATE_BROWSER_TOKEN'); },
    process: () => ({ kill: () => { kills++; } }) } });
assert.deepEqual(incomplete, { roomCleanupVerified: false, browserClosed: false });
assert.equal(kills, 1, 'failed native close still terminates only the browser process owned by this probe');

let launchCalls = 0;
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
assert.match(source, /measurePerformance = false/);
assert.match(source, /await measureProductionFeedback\(page, options\)[\s\S]{0,150}await captureBattleScreenshot/,
  'each screenshot follows the completed timed role sample, not its measurement loop');
assert.match(source, /createBrowserContext\(\)/);
assert.match(source, /page\.click\(selector\)/, 'all room actions use native pointer events');
const child = spawnSync(process.execPath, ['tools/production-private-room-ui.mjs'],
  { encoding: 'utf8', timeout: 5000 });
assert.equal(child.status, 1);
assert.equal(JSON.parse(child.stderr).stage, 'configuration');
for (const args of [['--ammo-slot=2'], ...['0', '4', '2.0', '02', '', 'PRIVATE_TOKEN']
  .map((slot) => ['--performance', `--ammo-slot=${slot}`]), ['--performance', '--ammo-slot']]) {
  const invalid = spawnSync(process.execPath, ['tools/production-private-room-ui.mjs',
    '--url=https://game.example.test', ...args], { encoding: 'utf8', timeout: 5000 });
  assert.equal(invalid.status, 1);
  const receipt = JSON.parse(invalid.stderr);
  assert.equal(receipt.stage, 'configuration');
  assert.equal(receipt.cleanup, null, 'invalid ammo arguments never acquire a browser or room');
  assert.doesNotMatch(invalid.stderr, /PRIVATE_TOKEN/);
}
console.log('production private-room UI smoke selftest passed (deterministic guards and cleanup; not a live receipt)');
