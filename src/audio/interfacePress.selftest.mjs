// interfacePress.selftest.mjs — the first press anywhere is never late (AU.07, the coordinator 2026-10-13: "a UI click
// that arrives up to 900 ms late feels like input lag, and that is worse than silence").
//   - boot idle, after the first frame, decodes the interface's press sounds with no audio device (the facade's bindBus
//     → the engine module's prepareInterfaceSounds → assetLibrary predecodeAssets);
//   - the engine built at the first press starts with them decoded (the library's seed): that press plays at once;
//   - a press that beat the decode waits for it only while the wait stays within 120 ms of the press, else it is dropped.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFakeContext, fakeBuffer } from './fakeAudioContext.test-support.mjs';
import { createAssetLibrary, predecodeAssets } from './assetLibrary.ts';

// ---- the wiring: main.ts warms the interface in idle time after the first frame; the facade hands it to the module
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
const facade = readFileSync(new URL('./lazyAudio.ts', import.meta.url), 'utf8');
assert.match(main, /a\.bindBus\(bus\)/, 'main.ts binds the facade to the bus at boot (where the facade arms its gesture and its warm)');
assert.match(facade, /nextPaintFrame\(\)\.then\(\(\) => \(globalThis\.requestIdleCallback \?\? setTimeout\)\(\(\) => void preload\(\)\.then\(\(module\) => module\?\.prepareInterfaceSounds\?\.\(\)\)\)\)/,
  'the facade, at boot idle after the first frame, transfers the mixer module and decodes the press sounds');

// ---- a fake network: every shipped file answers, after `delayMs`
let delayMs = 0;
globalThis.fetch = async () => {
  if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(64) };
};
const offlineDecoder = () => ({ decodeAudioData: async () => fakeBuffer(0.3, 24000) });

// ---- the decode with no device, and the library that starts with it
const seed = await predecodeAssets(['ui_click', 'ui_back', 'no_such_asset'], { createDecoder: offlineDecoder });
assert.deepEqual([...seed.keys()].sort(), ['ui_back', 'ui_click'], 'the shipped press sounds decode with no device; an unknown id is left out');
const seeded = createAssetLibrary({ context: createFakeContext(), seed });
assert.ok(seeded.has('ui_click') && seeded.has('ui_back'), 'a library built after the decode has them ready from the start');
assert.ok(!seeded.has('ui_confirm'), 'only what was decoded');

// ---- the engine: a click on a button, through its delegated listener
const clickListeners = [];
globalThis.window = {};
globalThis.document = {
  addEventListener: (type, fn) => { if (type === 'click') clickListeners.push(fn); },
  removeEventListener: () => {},
  activeElement: null,
  body: {},
};
const button = { tagName: 'BUTTON', textContent: 'Garage', type: '', getAttribute: () => null, closest: (sel) => (sel.includes('button') ? button : null) };
const { createAudio, prepareInterfaceSounds } = await import('./audioEngine.ts');

async function engine() {
  const ctx = createFakeContext({ decode: () => fakeBuffer(0.3) });
  const audio = createAudio({ context: ctx, getMapId: () => 'verdant', tier: 'desktop' });
  audio.resume();
  const probe = globalThis.window.__COT_AUDIO;
  // the format probe (one tiny decode) settles; the interface set's own loads are still on the slow network
  await new Promise((resolve) => setTimeout(resolve, 8));
  return { ctx, probe, click: () => clickListeners.at(-1)({ target: button }) };
}
const playedClick = (probe) => probe.sfxLog.some((e) => e.n === 'ui_click');
const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A press whose sound is still decoding 300 ms later is dropped, not played late.
delayMs = 300;
{
  const { probe, click } = await engine();
  click();
  await settle(450);
  assert.ok(!playedClick(probe), 'a click that would land 300 ms late is dropped');
}
// A press whose decode lands within 120 ms plays.
delayMs = 20;
{
  const { probe, click } = await engine();
  click();
  await settle(150);
  assert.ok(playedClick(probe), 'a click whose decode lands within 120 ms plays');
}
// With the boot-idle decode done, the engine built at the first press plays that press at once, whatever the network.
globalThis.OfflineAudioContext = class { decodeAudioData() { return Promise.resolve(fakeBuffer(0.3, 24000)); } };
delayMs = 0;
await prepareInterfaceSounds();
delayMs = 5000;
{
  const { probe, click } = await engine();
  click();
  assert.ok(playedClick(probe), 'the boot-idle decode makes the first press immediate');
}
delayMs = 0;

console.log('interfacePress.selftest: boot-idle decode of the press sounds, a seeded library, immediate first press, late clicks (> 120 ms) dropped');
process.exit(0);
