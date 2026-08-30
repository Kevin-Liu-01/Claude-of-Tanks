import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startDebugBattle } from './debugBattleEntryRuntime.ts';

const calls = [];
let releaseAcquisition;
const acquisitionGate = new Promise((resolve) => { releaseAcquisition = resolve; });
const acquire = (name) => async () => {
  calls.push(`start:${name}`);
  await acquisitionGate;
  calls.push(`done:${name}`);
};
const ports = {
  getPendingMapId: () => 'verdant',
  resolveMapId: (mapId) => mapId === 'random' ? 'fjord' : mapId,
  ensureFullFleet: acquire('fleet'),
  ensureWorld: async (mapId) => {
    calls.push(`start:world:${mapId}`);
    await acquisitionGate;
    calls.push(`done:world:${mapId}`);
  },
  preloadSoloAuthority: acquire('solo-authority'),
  preloadBattleClient: acquire('battle-client'),
  ensureBattleHud: acquire('hud'),
  ensureTouchControls: acquire('touch'),
  preloadArmorAim: acquire('armor-aim'),
  ensureFx: acquire('fx'),
  ensureKillcam: acquire('killcam'),
  preloadBattleWarm: acquire('battle-warm'),
  preloadBattleStart: acquire('battle-start'),
  prepareWorldServices: () => calls.push('prepare-world-services'),
  startBattle: (specId, mapId, options) => {
    calls.push(`battle:${specId}:${mapId}:${options.fast ? 'fast' : 'normal'}`);
    return 'started';
  },
};

const pending = startDebugBattle(ports, 'm1a2', 'random', { fast: true });
await Promise.resolve();
assert.equal(calls.filter((call) => call.startsWith('start:')).length, 11,
  'every independent QA acquisition must begin before the first one settles');
assert.equal(calls.includes('prepare-world-services'), false,
  'world services cannot attach to a partial acquisition');
releaseAcquisition();
assert.equal(await pending, 'started');
assert.deepEqual(calls.slice(-2), [
  'prepare-world-services',
  'battle:m1a2:fjord:fast',
], 'world services must attach once immediately before the start transaction');

const mainSource = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
assert.match(mainSource, /import\('\.\/dev\/debugBattleEntryRuntime\.ts'\)/,
  'the exhaustive QA acquisition owner must remain demand loaded');
const debugStartBody = mainSource.match(
  /async function debugStartBattle[\s\S]*?\n}\n\n\/\/ Returning from battle/,
)?.[0] || '';
assert.doesNotMatch(debugStartBody, /await Promise\.all\(/,
  'main must not re-own the exhaustive acquisition order');

console.log('[debugBattleEntryRuntime.selftest] PASS');
