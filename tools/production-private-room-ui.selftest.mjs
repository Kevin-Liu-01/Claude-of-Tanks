import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { productionUiOptions, validateUiProgress, cleanupProductionUi,
  verifyProductionPrivateRoomUi } from './production-private-room-ui.mjs';

assert.deepEqual(productionUiOptions({ url: 'https://game.example.test' }),
  { origin: 'https://game.example.test', timeoutMs: 300_000 });
for (const url of [undefined, '', 'file:///game', 'https://secret:token@game.example.test',
  'https://game.example.test/path', 'https://game.example.test?signal=override',
  'https://game.example.test#secret']) assert.throws(() => productionUiOptions({ url }), TypeError);
for (const timeoutMs of [0, 29_999, 300_001, 30_000.5, NaN, Infinity]) {
  assert.throws(() => productionUiOptions({ url: 'https://game.example.test', timeoutMs }), TypeError);
}
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
await assert.rejects(verifyProductionPrivateRoomUi({ url: 'https://game.example.test',
  launchBrowser: async () => { throw new Error('PRIVATE_LAUNCH_TOKEN'); } }), (error) => {
  assert.equal(error.stage, 'browser_launch');
  assert.doesNotMatch(JSON.stringify(error), /PRIVATE_LAUNCH_TOKEN/);
  assert.deepEqual(error.cleanup, { roomCleanupVerified: true, browserClosed: true });
  return true;
});
const source = await readFile(new URL('./production-private-room-ui.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(source, /evaluateOnNewDocument|setRequestInterception|\/src\/net\/|signalingClient|\.network\.route/,
  'deployed native UI smoke must not import development code, replace endpoints, or mock network responses');
assert.match(source, /createBrowserContext\(\)/);
assert.match(source, /page\.click\(selector\)/, 'all room actions use native pointer events');
const child = spawnSync(process.execPath, ['tools/production-private-room-ui.mjs'],
  { encoding: 'utf8', timeout: 5000 });
assert.equal(child.status, 1);
assert.equal(JSON.parse(child.stderr).stage, 'configuration');
console.log('production private-room UI smoke selftest passed (deterministic guards and cleanup; not a live receipt)');
