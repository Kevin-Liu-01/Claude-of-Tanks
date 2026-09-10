import assert from 'node:assert/strict';
import { installPerfDrawAttribution } from './perfprobe-draw-attribution.mjs';

const saved = Object.getOwnPropertyDescriptor(globalThis, 'window');
function fixture({ inherited = false, locked = false, missing = false } = {}) {
  const camera = {}, scene = { name: 'LateFX borrowed', type: 'Scene' }, geometry = {};
  const material = { name: 'smoke', type: 'ShaderMaterial' }, parent = { name: 'fx' };
  const mesh = { name: 'smoke-quads', type: 'Mesh', parent }, args = [camera, scene, geometry, material, mesh, null];
  const info = { render: { calls: 0 } }, received = [], answer = {};
  let delta = 1, failure = null, sideEffect = null;
  function native(...values) {
    received.push({ receiver: this, args: values }); info.render.calls += delta;
    sideEffect?.(); if (failure) throw failure; return answer;
  }
  const renderer = inherited ? Object.create({ renderBufferDirect: native }) : {};
  renderer.info = info;
  if (!inherited && !missing) Object.defineProperty(renderer, 'renderBufferDirect', {
    value: native, writable: !locked, configurable: !locked, enumerable: false,
  });
  const descriptor = Object.getOwnPropertyDescriptor(renderer, 'renderBufferDirect');
  const host = { __DEBUG: { renderer, lighting: { csm: { lights: [{ shadow: { camera } }] } } } };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: host });
  // Serialization must not depend on module closures/imports.
  new Function(`return (${installPerfDrawAttribution.toString()})();`)();
  return { renderer, native, descriptor, info, received, answer, args, host, api: host.__PERF_DRAW_ATTRIBUTION,
    setDelta: value => { delta = value; }, setFailure: value => { failure = value; },
    effect: value => { sideEffect = value; }, draw: (...values) => renderer.renderBufferDirect(...(values.length ? values : args)) };
}

try {
  const f = fixture(); f.api.start();
  const receiver = {};
  assert.equal(Reflect.apply(f.renderer.renderBufferDirect, receiver, f.args), f.answer);
  assert.equal(f.received[0].receiver, receiver);
  f.received[0].args.forEach((value, index) => assert.equal(value, f.args[index]));
  f.api.start(); // First RAF discards the sustained-mode pre-window render.
  f.info.render.calls = 0;
  for (const delta of [0, 1, 2]) { f.setDelta(delta); f.draw(); }
  f.api.frame(10, 3); f.info.render.calls = 0;
  f.setDelta(1); f.draw(); f.api.frame(20, 1); f.info.render.calls = 0;
  f.setDelta(2); f.draw(); // The terminal callback is excluded by the owning sampler.
  const result = f.api.finish();
  assert.equal(result.pass, true);
  assert.deepEqual([result.frames, result.expectedCalls, result.observedCalls, result.entries], [2, 4, 4, 4]);
  assert.deepEqual([result.zeroCallEntries, result.multiCallEntries, result.preWindowDiscardedCalls], [1, 1, 1]);
  assert.equal(result.outOfWindow.calls, 2);
  assert.equal(result.peak.expectedCalls, 3); assert.equal(result.peak.rows.length, 1);
  assert.equal(result.peak.rows[0].calls, 3); assert.equal(result.peak.rows[0].shadowCascade, 0);
  assert.equal(result.peak.rows[0].ancestorPath, 'fx/smoke-quads');
  assert.equal(result.peak.rows[0].sceneName, 'LateFX borrowed');
  assert.equal(f.api.finish(), result);
  assert.equal(f.api.stop().restored, true); assert.equal(f.api.stop(), f.api.stop());
  assert.deepEqual(Object.getOwnPropertyDescriptor(f.renderer, 'renderBufferDirect'), f.descriptor);
  assert.equal('__PERF_DRAW_ATTRIBUTION' in f.host, false);

  for (const inherited of [false, true]) {
    const f = fixture({ inherited }); f.api.start(); const failure = {};
    f.setFailure(failure); assert.throws(() => f.draw(), value => value === failure);
    f.api.frame(1, 1); assert.equal(f.api.finish().pass, false);
    assert.equal(f.api.stop().restored, true);
    assert.deepEqual(Object.getOwnPropertyDescriptor(f.renderer, 'renderBufferDirect'), f.descriptor);
  }
  {
    const f = fixture(); f.api.start(); f.draw(); f.api.frame(1, 2);
    assert.equal(f.api.finish().mismatchFrames, 1); assert.equal(f.api.finish().pass, false); f.api.stop();
  }
  {
    const f = fixture(); f.api.start(); f.setDelta(0); f.draw(); f.api.frame(1, 0);
    assert.equal(f.api.finish().pass, true); assert.equal(f.api.finish().peak.rows.length, 0); f.api.stop();
  }
  for (const mode of ['missing', 'locked']) {
    const f = fixture({ [mode]: true }); f.api.start(); f.api.frame(1, 0);
    assert.equal(f.api.finish().pass, false); assert.equal(f.api.stop().restored, true);
    assert.deepEqual(Object.getOwnPropertyDescriptor(f.renderer, 'renderBufferDirect'), f.descriptor);
  }
  {
    const f = fixture(); f.api.start(); const foreign = () => {};
    f.effect(() => { f.renderer.renderBufferDirect = foreign; }); f.draw(); f.api.frame(1, 1);
    assert.equal(f.api.finish().pass, false); assert.equal(f.api.stop().restored, false);
    assert.equal(f.renderer.renderBufferDirect, foreign);
  }
  {
    const f = fixture(); f.api.start(); f.draw(); f.info.render.calls = NaN; f.api.frame(1, 1);
    f.draw(); f.api.frame(2, 0); assert.equal(f.api.finish().pass, false); f.api.stop();
  }
  {
    const f = fixture(); f.api.start();
    for (let index = 0; index < 4097; index++) f.draw(...f.args.slice(0, 4), { name: `mesh-${index}` }, null);
    f.api.frame(1, 4097); const r = f.api.finish();
    assert.equal(r.identities, 4096); assert.equal(r.identityDrops, 1); assert.equal(r.pass, false);
    assert.equal(r.peak.rows.length, 4096); assert.equal(r.peak.droppedCalls, 1);
    assert.equal(r.peak.rows.reduce((sum, row) => sum + row.calls, 0), 4096); f.api.stop();
  }
  {
    const f = fixture(); f.api.start(); f.draw(); f.api.frame(1, 1);
    const otherScene = { name: 'forward', type: 'Scene' };
    f.draw(f.args[0], otherScene, ...f.args.slice(2)); f.draw(); f.api.frame(2, 2);
    const r = f.api.finish(); assert.equal(r.pass, true); assert.equal(r.peak.rows.length, 2);
    assert.notEqual(r.peak.rows[0].sceneId, r.peak.rows[1].sceneId); f.api.stop();
  }
  {
    const f = fixture(); f.api.stop();
    const foreign = {};
    Object.defineProperty(f.host, '__PERF_DRAW_ATTRIBUTION', {
      value: foreign, configurable: false, writable: false,
    });
    assert.throws(() => installPerfDrawAttribution(), TypeError);
    assert.equal(f.host.__PERF_DRAW_ATTRIBUTION, foreign);
    assert.deepEqual(Object.getOwnPropertyDescriptor(f.renderer, 'renderBufferDirect'), f.descriptor,
      'failed global publication rolls back the otherwise unreachable draw observer');
  }
} finally {
  if (saved) Object.defineProperty(globalThis, 'window', saved); else delete globalThis.window;
}
console.log('perfprobe-draw-attribution: exact forwarding, 0/1/multi counters, reconciliation, bounded peak, terminal exclusion and restoration passed');
