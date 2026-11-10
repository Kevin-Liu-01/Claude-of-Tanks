import assert from 'node:assert/strict';
import { runBootCapabilityGate } from './capabilityGate.ts';

// 2026-11-02 audit R3 (capability gate): a real worker's refusal turns this boot's probe to `worker: false` and drops
// any record "so the next boot answers again". When the refusal lands before `confirm()` (the renderer is created in
// between), confirm used to write the record anyway, now carrying `worker: false`: the notice then stood for the
// cache's 14 days. A refusal is this boot's answer only, whichever side of confirm it lands on.

const t = (key) => key;
const RENDERER = 'ANGLE (Apple, Apple M2, OpenGL 4.1)';

function context({ renderer = RENDERER } = {}) {
  return {
    MAX_TEXTURE_IMAGE_UNITS: 0x8872, MAX_TEXTURE_SIZE: 0x0D33, MAX_VERTEX_TEXTURE_IMAGE_UNITS: 0x8B4C, RENDERER: 0x1F01,
    getParameter(name) {
      return { 0x8872: 16, 0x0D33: 8192, 0x8B4C: 16, 0x1F01: 'WebGL Renderer (masked)', 0x9246: renderer }[name] ?? null;
    },
    getExtension(name) {
      if (name === 'EXT_color_buffer_float') return {};
      if (name === 'WEBGL_debug_renderer_info') return { UNMASKED_RENDERER_WEBGL: 0x9246 };
      if (name === 'WEBGL_lose_context') return { loseContext() {} };
      return null;
    },
  };
}

function watchingHost() {
  const store = new Map();
  const watchers = [];
  return {
    store, watchers,
    userAgent: 'test-agent', now: () => 1_000, deviceMemory: 8,
    createCanvas: () => ({ getContext: () => context() }),
    storage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => { store.set(key, value); },
      removeItem: (key) => { store.delete(key); },
    },
    hasWorkerApi: () => true,
    probeWorker: () => true,
    watchWorkerRefusal: (refused) => watchers.push(refused),
  };
}

const screen = () => ({ stage: { textContent: '' }, retry: { textContent: '', classList: { add() {} }, onclick: null },
  notice: { textContent: '', classList: { add() {} } } });
const gate = (h) => runBootCapabilityGate({ translate: t, send: () => assert.fail('no halt'), screen: screen(), host: h,
  halt: () => assert.fail('no halt'), reload: () => {} });

{
  // a probed boot: the refusal arrives between the gate and confirm (matching real context)
  const h = watchingHost();
  const result = await gate(h);
  assert.equal(result.source, 'probe');
  h.watchers[0]();
  assert.equal(result.probe.worker, false);
  await result.confirm(context());
  assert.equal(h.store.size, 0, 'a refusal seen before confirm writes no record: the next boot answers again');
  assert.equal(result.verdict.notices.some(({ code }) => code === 'worker_blocked'), true, 'this boot keeps the notice');
}

{
  // a probed boot whose real context differs: the re-evaluated verdict is not recorded either
  const h = watchingHost();
  const result = await gate(h);
  h.watchers[0]();
  await result.confirm(context({ renderer: 'ANGLE (Apple, Apple M3, OpenGL 4.1)' }));
  assert.equal(result.source, 'context');
  assert.equal(h.store.size, 0, 'the real-context re-run keeps the refusal out of the record');
  assert.equal(result.probe.worker, false);
}

{
  // the unrefused boot still records (the cache keeps working)
  const h = watchingHost();
  const result = await gate(h);
  await result.confirm(context());
  assert.equal(h.store.size, 1);
  const [, raw] = [...h.store.entries()][0];
  assert.equal(JSON.parse(raw).worker ?? JSON.parse(raw).probe?.worker, true, 'the record carries the working worker');
  h.watchers[0]();
  assert.equal(h.store.size, 0, 'a refusal after confirm still drops the record');
}

console.log('capabilityGateRefusal selftest: ok');
