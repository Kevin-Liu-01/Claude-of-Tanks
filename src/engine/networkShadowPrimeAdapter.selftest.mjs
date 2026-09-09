import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

// Execute the exact repository-owned main adapter without booting the game.
// No room, network or user source is evaluated.
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
const body = main.match(/finalShadows: async \(signal\?: AbortSignal\) => \{([\s\S]*?)\n {10}\},\n {10}compile:/)?.[1];
assert.ok(body, 'the native network shadow adapter must remain testable');
const source = stripTypeScriptTypes(`async function prime(signal?: AbortSignal) {${body}\n}`);
const create = new Function('renderer', 'lighting', 'mainFrame', 'camera',
  'SIM_DT', 'nextPaintFrame', 'graphicsContextLost', 'scene', `${source}; return prime;`);

function fixture({ failure, lost = false } = {}) {
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
  return { events, renderer, options: () => options,
    prime: create(renderer, lighting, mainFrame, camera, 1 / 60, nextPaintFrame, lost, scene) };
}

for (const withSignal of [true, false]) {
  const f = fixture();
  const signal = withSignal ? new AbortController().signal : undefined;
  const receipt = await f.prime(signal);
  assert.deepEqual(f.events, ['active', 'fov', 'noted', 'fit', 'prime']);
  assert.strictEqual(f.options().signal, signal);
  assert.deepEqual(receipt, { cascadeCount: 2, totalMs: 11, maxMs: 7,
    casterWarmup: { batches: 2, casterCount: 10, batchMs: [12, 3], totalMs: 15, maxMs: 12 } });
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
  const f = fixture({ lost: true });
  await f.prime();
  assert.equal(f.options().isCurrent(), false, 'graphics context loss invalidates the lease');
}
console.log('networkShadowPrimeAdapter: native wiring, separated timing and failure propagation passed');
