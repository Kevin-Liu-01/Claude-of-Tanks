import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { resolveColdLoadingAsset, createColdImportHold, installColdImportCoverObserver,
  checkColdImportCover } from './solo-cold-import-cover.mjs';

const targetUrl = 'https://fixture.invalid/assets/soloBattleLoadingRuntime-Ab_C12.js';
assert.equal(resolveColdLoadingAsset(['main-ab.js', 'soloBattleLoadingRuntime-Ab_C12.js']), 'soloBattleLoadingRuntime-Ab_C12.js');
for (const names of [[], ['main-ab.js'], ['soloBattleLoadingRuntime.js'],
  ['soloBattleLoadingRuntime-a.js', 'soloBattleLoadingRuntime-b.js'], ['prefix-soloBattleLoadingRuntime-a.js']]) {
  assert.throws(() => resolveColdLoadingAsset(names), /unsupported/);
}
const event = (id = 'target', url = targetUrl) => ({ requestId: id, resourceType: 'Script', request: { url } });
function holdFixture(continueRequest) {
  let now = 1, serial = 0;
  const timers = new Map(), continued = [];
  const hold = createColdImportHold({ targetUrl, now: () => now,
    continueRequest: continueRequest ?? (async id => { continued.push(id); now += 1; }),
    setTimer: (callback, delay) => { assert.equal(delay, 5000); timers.set(++serial, callback); return serial; },
    clearTimer: id => timers.delete(id) });
  return { hold, timers, continued, advance: value => { now = value; } };
}
{
  const f = holdFixture();
  f.hold.arm(); f.hold.pause(event());
  assert.equal((await f.hold.seen).held, true);
  assert.deepEqual(f.continued, [], 'real target remains unresolved while collecting pending-cover evidence');
  assert.equal(f.timers.size, 1);
  f.advance(1200);
  const first = f.hold.release('observed'), second = f.hold.release('cleanup');
  assert.equal(first, second, 'concurrent cleanup/release cannot continue the same native request twice');
  const released = await first;
  assert.deepEqual(f.continued, ['target']);
  assert.equal(released.releaseReason, 'observed');
  assert.equal(released.held, false);
  assert.equal(released.releaseStartedAtMs, 1200);
  assert.equal(released.releasedAtMs, 1201);
  assert.equal(f.timers.size, 0);
  assert.equal((await f.hold.stop()).stopped, true);
  assert.throws(() => f.hold.arm(), /not_pristine/);
}
{
  const f = holdFixture(); f.hold.arm(); f.hold.pause(event());
  await f.hold.stop();
  assert.deepEqual(f.continued, ['target'], 'error cleanup releases the actual pending network request');
  assert.equal(f.hold.snapshot().releaseReason, 'cleanup');
  assert.equal(f.timers.size, 0);
}
{
  const f = holdFixture(); f.hold.arm(); f.hold.pause(event());
  const callback = [...f.timers.values()][0]; callback();
  await f.hold.stop();
  assert.equal(f.hold.snapshot().releaseReason, 'hold-deadline');
  assert.ok(f.hold.snapshot().errors.includes('hold_deadline'));
  assert.deepEqual(f.continued, ['target']);
}
{
  const f = holdFixture(); f.hold.pause(event());
  await f.hold.stop();
  assert.equal(f.hold.snapshot().earlyCount, 1);
  assert.ok(f.hold.snapshot().errors.includes('target_requested_before_click_arm'));
  assert.deepEqual(f.continued, ['target']);
}
{
  const f = holdFixture(); f.hold.arm(); f.hold.pause(event()); f.hold.pause(event('duplicate'));
  await f.hold.stop();
  assert.equal(f.hold.snapshot().targetCount, 2);
  assert.ok(f.hold.snapshot().errors.includes('duplicate_target_interception'));
  assert.deepEqual(f.continued.sort(), ['duplicate', 'target']);
}
{
  const f = holdFixture(); f.hold.arm(); f.hold.pause(event('other', 'https://fixture.invalid/assets/main-ab.js'));
  await f.hold.stop();
  assert.equal(f.hold.snapshot().targetCount, 0);
  assert.ok(f.hold.snapshot().errors.includes('unexpected_interception'));
  assert.deepEqual(f.continued, ['other']);
}
{
  let finish;
  const f = holdFixture(() => new Promise(resolve => { finish = resolve; }));
  f.hold.arm(); f.hold.pause(event());
  let stopped = false;
  const stop = f.hold.stop().then(() => { stopped = true; });
  await Promise.resolve();
  assert.equal(stopped, false, 'stop joins the producer, not merely its caller');
  finish(); await stop; assert.equal(stopped, true);
}
{
  const f = holdFixture(async () => { throw new Error('protocol rejection'); });
  f.hold.arm(); f.hold.pause(event());
  await f.hold.stop();
  assert.ok(f.hold.snapshot().errors.includes('request_continue_failed'), 'release failures cannot pass cleanup');
}
{
  const f = holdFixture(); f.hold.arm();
  assert.equal(f.hold.snapshot().targetCount, 0, 'missing interception is never fabricated');
  await f.hold.stop();
  f.hold.pause(event('late')); await Promise.resolve();
  assert.ok(f.hold.snapshot().errors.includes('interception_after_stop'));
  for (let i = 0; i < 40; i++) f.hold.pause(event(`late-${i}`));
  assert.equal(f.hold.snapshot().errors.length, 16);
  assert.equal(f.hold.snapshot().errorsDropped, 25);
  await f.hold.stop();
}

// A serialized self-contained observer sees real-owner-shaped DOM only.
let at = 10, serial = 0;
const frames = new Map(), listeners = new Map();
const state = { visible: false, leaving: false, opacity: '1', phase: 'garage', rows: 0, hidden: false, focused: true };
const child = {};
const root = { classList: { contains: name => name === 'on' && state.visible },
  getBoundingClientRect: () => ({ left: 0, top: 0, right: 1280, bottom: 720 }),
  getClientRects: () => state.visible || state.leaving ? [{}] : [], contains: element => element === child,
  querySelector: selector => ({ textContent: selector === '.mapname' ? 'Preparing battle' : 'Loading' }),
  querySelectorAll: () => Array(state.rows).fill({}) };
class Element { closest(selector) { return selector === '.cot-battle' ? this : null; } }
const win = { __DEBUG: { game: { phase: 'garage', battleCount: 0, preBattleS: 0, result: null } } };
const doc = { querySelector: () => root, elementFromPoint: () => state.visible ? child : {},
  get hidden() { return state.hidden; }, hasFocus: () => state.focused,
  addEventListener: (type, callback, capture) => { assert.equal(capture, true); listeners.set(type, callback); },
  removeEventListener: (type, callback) => { assert.equal(listeners.get(type), callback); listeners.delete(type); } };
const context = vm.createContext({ window: win, document: doc, Element, innerWidth: 1280, innerHeight: 720,
  getComputedStyle: () => ({ display: state.visible || state.leaving ? 'grid' : 'none', visibility: 'visible', opacity: state.opacity }),
  performance: { now: () => at }, requestAnimationFrame: callback => { frames.set(++serial, callback); return serial; },
  cancelAnimationFrame: id => frames.delete(id) });
vm.runInContext(`(${installColdImportCoverObserver.toString()})()`, context);
const observer = win.__COLD_IMPORT_COVER;
observer.arm();
listeners.get('click')({ target: new Element(), isTrusted: true });
state.visible = true; at = 30;
const tick = () => { const [id, callback] = frames.entries().next().value; frames.delete(id); callback(); };
tick();
let observed = observer.read();
assert.equal(observed.clicks.length, 1);
assert.equal(observed.current.visible, true);
assert.equal(observed.current.viewportCovered, true);
assert.equal(observed.current.topmostAtCenter, true);
assert.equal(observed.current.allyRows, 0);
const rootId = observed.current.rootId;
state.rows = 7; at = 1600; tick();
assert.equal(observer.read().current.rootId, rootId, 'enrichment keeps the actual existing root identity');
assert.equal(observer.read().current.allyRows, 7);
state.opacity = '0.4'; assert.equal(observer.read().current.visible, false);
state.visible = false; state.leaving = true;
assert.equal(observer.read().current.displayed, true, 'removing .on does not dismiss the rendered exit-fade cover');
state.leaving = false;
assert.equal(observer.read().current.displayed, false, 'only actual layout dismissal completes reveal');
for (let i = 0; i < 150; i++) tick();
observed = observer.read();
assert.equal(observed.samples.length, 128);
assert.ok(observed.dropped > 0);
observer.stop();
assert.equal(frames.size, 0); assert.equal(listeners.size, 0);

const sample = { atMs: 200, clickedAtMs: 100, visible: true, viewportCovered: true, topmostAtCenter: true,
  hidden: false, focused: true, phase: 'garage', battleOrdinal: 0, allyRows: 0, enemyRows: 0, rootId: 1 };
const receipt = { coverLimitMs: 500, targetAssetSha256: 'a'.repeat(64),
  heldRequest: { targetCount: 1, earlyCount: 0, held: true, releaseStartedAtMs: null, errors: [] },
  heldCover: { clicks: [{ atMs: 100, trusted: true, before: { phase: 'garage', battleOrdinal: 0 } }], current: sample, samples: [sample] },
  screenshotWhileHeld: true, heldScreenshotSha256: 'b'.repeat(64),
  enrichedCover: { ...sample, atMs: 1800, allyRows: 7, enemyRows: 7 },
  releasedRequest: { targetCount: 1, held: false, releaseReason: 'observed', errors: [] },
  targetResponseCount: 1, targetResponse: { status: 200, sha256: 'a'.repeat(64) },
  completed: { phase: 'battle', battleOrdinal: 1, preBattleS: 0, resultPresent: false, visible: false, displayed: false } };
assert.deepEqual(checkColdImportCover(receipt), []);
assert.ok(checkColdImportCover(null).length);
for (const mutate of [
  r => { r.heldRequest.targetCount = 0; }, r => { r.heldRequest.targetCount = 2; },
  r => { r.heldRequest.earlyCount = 1; }, r => { r.heldRequest.held = false; },
  r => { r.heldRequest.releaseStartedAtMs = 200; }, r => { r.heldRequest.errors = ['failure']; },
  r => { r.heldCover.clicks[0].trusted = false; }, r => { r.heldCover.clicks.push(r.heldCover.clicks[0]); },
  r => { r.heldCover.current.visible = false; }, r => { r.heldCover.current.viewportCovered = false; },
  r => { r.heldCover.current.topmostAtCenter = false; }, r => { r.heldCover.current.hidden = true; },
  r => { r.heldCover.current.focused = false; }, r => { r.heldCover.current.allyRows = 1; },
  r => { r.heldCover.samples = []; }, r => { r.heldCover.samples[0].atMs = 601; },
  r => { r.screenshotWhileHeld = false; }, r => { r.heldScreenshotSha256 = null; },
  r => { r.enrichedCover.rootId = 2; }, r => { r.enrichedCover.allyRows = 0; },
  r => { r.releasedRequest.releaseReason = 'hold-deadline'; }, r => { r.releasedRequest.held = true; },
  r => { r.targetResponse.sha256 = 'wrong'; }, r => { r.targetResponse.status = 500; },
  r => { r.targetResponseCount = 2; }, r => { r.completed.battleOrdinal = 2; },
  r => { r.completed.preBattleS = 5; }, r => { r.completed.resultPresent = true; },
  r => { r.completed.displayed = true; }, r => { r.completed.preBattleS = null; },
]) {
  const changed = structuredClone(receipt); mutate(changed);
  assert.ok(checkColdImportCover(changed).length, `reject ${mutate}`);
}
const source = await readFile(new URL('./solo-cold-import-cover-probe.mjs', import.meta.url), 'utf8');
assert.match(source, /createCaptureLock\(\)/);
assert.match(source, /await lock\.acquire\(/);
assert.ok(source.indexOf("process.on('SIGINT'") > source.indexOf('await lock.acquire('),
  'queued interruption retains normal OS termination; handlers own only an admitted lease');
assert.match(source, /page\.click\('\.cot-battle'\)/);
assert.match(source, /Fetch\.continueRequest/);
assert.doesNotMatch(source, /Fetch\.fulfillRequest|request\.respond|new AudioContext|sampleRate|sinkId|__DEBUG\.(beginBattleEntry|beginSoloBattle|startBattle)/);
assert.ok(source.indexOf("cdp.send('Fetch.enable'") < source.indexOf('page.goto('), 'the target is observed from pristine boot');
assert.ok(source.indexOf("hold.release('observed')") > source.indexOf('held-import.png'), 'screenshot is acquired before releasing the real module request');
console.log('solo cold import cover: target resolution, native-request ownership/deadlines, passive loader identity and fail-closed gates pass');
