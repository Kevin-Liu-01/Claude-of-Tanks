import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

// Execute the exact repository-owned main adapter without booting the game.
// No room, network or user source is evaluated.
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
// (2026-10-16, integ/226 triage) the adapter's own closing brace ends it: the port that follows is not this receipt's
// (the network entry's submitPrograms now sits between finalShadows and compile)
const body = main.match(/finalShadows: async \(signal\?: AbortSignal\) => \{([\s\S]*?)\n {10}\},\n/)?.[1];
assert.ok(body, 'the native network shadow adapter must remain testable');
const source = stripTypeScriptTypes(`async function prime(signal?: AbortSignal) {${body}\n}`);
const create = new Function('renderer', 'lighting', 'mainFrame', 'camera',
  'SIM_DT', 'nextPaintFrame', 'graphicsContextLost', 'scene', 'post', 'game', `${source}; return prime;`);

function fixture({ failure, lost = false, postFailure = null, duringPost = null } = {}) {
  const events = [];
  const renderer = { info: {} };
  const camera = { fov: 55 };
  const scene = {};
  const nextPaintFrame = async () => { events.push('paint'); };
  let options;
  const lighting = {
    setStaticPresentationDormant(value) { assert.equal(value, false); events.push('active'); },
    updateFov() { events.push('fov'); },
    update(force, dt) { assert.equal(force, true); assert.equal(dt, 1 / 60); events.push('fit'); },
    async primeShadowMaps(r, s, c, supplied) {
      assert.strictEqual(r, renderer); assert.strictEqual(s, scene); assert.strictEqual(c, camera);
      options = supplied;
      assert.strictEqual(supplied.yieldBeforeCascade, nextPaintFrame);
      assert.strictEqual(supplied.casterWarmup.yieldBeforeBatch, nextPaintFrame);
      events.push('prime');
      if (failure) throw failure;
      supplied.casterWarmup.onBatch({ elapsedMs: 12, casterCount: 8 });
      supplied.casterWarmup.onBatch({ elapsedMs: 3, casterCount: 2 });
      return [7, 4];
    },
  };
  const mainFrame = { noteFovPrimed(fov) { assert.equal(fov, 55); events.push('noted'); } };
  // (battle-spikes-253) the post chain's first frame after the prime, one pass a painted frame (postLazyPasses.ts)
  const post = {
    async warmFirstFrame(yieldBeforePass) {
      events.push('post');
      duringPost?.();
      await yieldBeforePass('LateFxPass');
      if (postFailure) throw postFailure;
      return [{ label: 'LateFxPass', ms: 2 }];
    },
  };
  // (battle-spikes-253) the roster: one actor shown, one held hidden (unspotted), one without a visual
  const shown = { visible: true }, hidden = { visible: false };
  const game = { tankById: new Map([['a', { visual: { root: shown } }], ['b', { visual: { root: hidden } }], ['c', {}]]) };
  return { events, renderer, options: () => options, hidden,
    prime: create(renderer, lighting, mainFrame, camera, 1 / 60, nextPaintFrame, lost, scene, post, game) };
}

for (const withSignal of [true, false]) {
  const f = fixture();
  const signal = withSignal ? new AbortController().signal : undefined;
  const receipt = await f.prime(signal);
  assert.deepEqual(f.events, ['active', 'fov', 'noted', 'fit', 'prime', 'post', 'paint']);
  assert.strictEqual(f.options().signal, signal);
  assert.deepEqual([...f.options().casterWarmup.hiddenRoots()], [f.hidden], 'the warm-up is offered the hidden actors only');
  assert.deepEqual(receipt, { cascadeCount: 2, totalMs: 11, maxMs: 7,
    casterWarmup: { batches: 2, casterCount: 10, batchMs: [12, 3], totalMs: 15, maxMs: 12 },
    postPasses: [{ label: 'LateFxPass', ms: 2 }] });
  assert.equal(f.options().isCurrent(), true);
  f.renderer.info = {};
  assert.equal(f.options().isCurrent(), false, 'the work lease rejects a new renderer lifetime');
}
{
  const f = fixture();
  const abort = new AbortController();
  const reason = new Error('entry cancelled');
  abort.abort(reason);
  await assert.rejects(f.prime(abort.signal), (error) => error === reason);
  assert.deepEqual(f.events, []);
}
{
  const reason = new Error('warm failed');
  const f = fixture({ failure: reason });
  await assert.rejects(f.prime(), (error) => error === reason);
}
{
  // a failed post warm is reported, not thrown: the live frame links what it did not
  const f = fixture({ postFailure: new Error('pass gone') });
  const receipt = await f.prime();
  assert.deepEqual(receipt.postPasses, { failed: 'pass gone' });
}
{
  // a cancellation during the post warm cancels the entry
  const abort = new AbortController();
  const reason = new Error('entry cancelled');
  const f = fixture({ duringPost: () => abort.abort(reason) });
  await assert.rejects(f.prime(abort.signal), (error) => error === reason);
}
{
  const f = fixture({ lost: true });
  await f.prime();
  assert.equal(f.options().isCurrent(), false, 'graphics context loss invalidates the lease');
}
console.log('networkShadowPrimeAdapter: native wiring, separated timing, the post warm after the prime and failure propagation passed');
