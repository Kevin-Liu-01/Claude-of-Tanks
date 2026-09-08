import assert from 'node:assert/strict';
import { sampleRenderedFrames } from './render-frame-sampler.mjs';

const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
let draws = 0;
let finishes = 0;
let throwRender = false;
const info = { autoReset: true, render: { calls: 0, triangles: 0 },
  reset() { this.render.calls = 0; this.render.triangles = 0; } };
const post = { render() {
  assert.equal(info.autoReset, false, 'probe accumulates all passes within a submitted frame');
  if (throwRender) throw new Error('render failed');
  draws++;
  info.render.calls += 12;
  info.render.triangles += 180;
} };
const original = post.render;
Object.defineProperty(globalThis, 'window', { configurable: true, value: {
  __DEBUG: { post, renderer: { info, getContext: () => ({ finish() { finishes++; } }) } },
} });
try {
  const pending = sampleRenderedFrames({ count: 3, syncGpu: true, timeoutMs: 1000 });
  // Arbitrary callback work does not count as a game render.
  await Promise.resolve();
  assert.equal(draws, 0);
  for (let frame = 0; frame < 11; frame++) post.render(1 / 60);
  const result = await pending;
  assert.equal(result.samples.length, 3, 'only post transactions after eight warm frames count');
  assert.equal(finishes, 11, 'GPU completion is synchronized only when explicitly requested');
  assert.ok(result.samples.every((frame) => frame.calls === 12 && frame.triangles === 180));
  assert.ok(result.samples.every((frame) => frame.intervalMs >= 0 && frame.renderMs >= 0));
  assert.equal(post.render, original, 'successful sampling restores the live renderer');
  assert.equal(info.autoReset, true);

  const timedOut = sampleRenderedFrames({ count: 1, timeoutMs: 1 });
  await assert.rejects(timedOut, /Only 0\/1 game frames/);
  assert.equal(post.render, original, 'stalled frame delivery cannot leave instrumentation installed');

  throwRender = true;
  const failed = sampleRenderedFrames({ count: 1, timeoutMs: 1000 });
  assert.throws(() => post.render(), /render failed/);
  await assert.rejects(failed, /render failed/);
  assert.equal(post.render, original);
  assert.equal(info.autoReset, true, 'exception cleanup restores renderer counter policy');
} finally {
  if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
  else delete globalThis.window;
}
console.log('render-frame-sampler: actual frames, complete counters, GPU opt-in and cleanup passed');
