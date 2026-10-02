// Receipt for the frame-budget measurement (tools/frame-pass-timer.mjs, tools/frame-budget-probe.mjs): the
// per-pass timer's label algebra against a fake WebGL2 timeline (nesting, cascade and simulation refinement, the
// whole-frame cross-check, restoration), the A B B A pair deltas, the pinned roster and the mid-range projection.
import assert from 'node:assert/strict';
import {
  FRAME_PASS_ORDER, MID_RANGE_PROXIES, installFramePassTimer, pairDeltas, projectFrameMs, proxyRatios, stats,
  summarizePassFrames,
} from './frame-pass-timer.mjs';
import { acquireProbeLocks, buildFrameReport, parseFrameProbeArgs, pinnedOpponents } from './frame-budget-probe.mjs';

// ---------------------------------------------------------------------------------------------- fake page

function fakePage() {
  let gpuNs = 0;
  let active = null;
  let nested = 0;
  let flushes = 0;
  const ext = { TIME_ELAPSED_EXT: 0x88bf, GPU_DISJOINT_EXT: 0x8fbb };
  const gl = {
    QUERY_RESULT_AVAILABLE: 0x8867, QUERY_RESULT: 0x8866,
    getExtension: (name) => (name === 'EXT_disjoint_timer_query_webgl2' ? ext : null),
    createQuery: () => ({ start: 0, end: 0, done: false }),
    deleteQuery: () => {},
    beginQuery(_target, q) { if (active) nested++; active = q; q.start = gpuNs; q.done = false; },
    endQuery() { active.end = gpuNs; active.done = true; active = null; },
    getQueryParameter(q, p) { return p === gl.QUERY_RESULT_AVAILABLE ? q.done : q.end - q.start; },
    getParameter(p) { return p === ext.GPU_DISJOINT_EXT ? false : 0; },
    flush() { flushes++; },
  };
  const spend = (ms, calls = 1) => { gpuNs += ms * 1e6; info.render.calls += calls; info.render.triangles += calls * 100; };
  const info = { autoReset: true, render: { calls: 0, triangles: 0 }, reset() { info.render.calls = 0; info.render.triangles = 0; } };
  const shadowMaps = [{ id: 's0' }, { id: 's1' }, { id: 's2' }, { id: 's3' }];
  const lights = shadowMaps.map((map) => ({ shadow: { map } }));
  const renderer = {
    info, getContext: () => gl,
    setRenderTarget(target) { this.target = target; },
    shadowMap: {
      // three's render: one target bind and one cascade's casters per light
      render(lightsArg) { for (const l of lightsArg) { renderer.setRenderTarget(l.shadow.map); spend(1 + lights.indexOf(l) * 0.5, 10); } },
    },
  };
  const pass = (name, ms, body) => ({ name, render() { renderer.setRenderTarget({ texture: { name } }); spend(ms, 2); body?.(); } });
  const sceneAA = pass('scene', 4, () => { renderer.shadowMap.render(lights); renderer.setRenderTarget({ texture: { name: 'scene' } }); spend(3, 50); });
  const aerial = pass('aerial', 0.5), bloom = pass('bloom', 0.7), sunShafts = pass('shafts', 0.2), lensFlare = pass('flare', 0.1);
  const grade = pass('grade', 0.4), smaa = pass('smaa', 0.6), upscaler = pass('fsr', 0.3);
  const passes = [sceneAA, aerial, bloom, sunShafts, lensFlare, grade, smaa, upscaler];
  const post = {
    sceneAA, aerial, bloom, sunShafts, lensFlare, upscaler, composer: { passes },
    render() { window.__DEBUG.scene.userData.volumetricClouds.beforeSceneRender(); for (const p of passes) p.render(); },
  };
  const world = {
    update() {
      renderer.setRenderTarget({ texture: { name: 'waterRipples.b' } }); spend(0.25, 1);
      renderer.setRenderTarget({ texture: { name: 'groundPressure.a' } }); spend(0.05, 1);
      renderer.setRenderTarget(null);
    },
  };
  const clouds = { beforeSceneRender() { renderer.setRenderTarget({ texture: { name: 'clouds' } }); spend(2, 3); } };
  const rafQueue = [];
  globalThis.window = { __DEBUG: { renderer, post, world, lighting: { csm: { lights } }, scene: { userData: { volumetricClouds: clouds } } } };
  globalThis.requestAnimationFrame = (cb) => rafQueue.push(cb);
  let now = 0;
  const realNow = performance.now.bind(performance);
  globalThis.performance.now = () => now;
  const frame = () => {
    now += 1; window.__DEBUG.world.update(); now += 2; window.__DEBUG.post.render(); now += 13;
    for (const cb of rafQueue.splice(0)) cb(now);
  };
  const restore = () => { performance.now = realNow; delete globalThis.window; delete globalThis.requestAnimationFrame; };
  return { frame, restore, renderer, post, world, clouds, passes, nestedCount: () => nested, flushCount: () => flushes };
}

{
  const page = fakePage();
  const originals = { post: page.post.render, world: page.world.update, shadow: page.renderer.shadowMap.render,
    srt: page.renderer.setRenderTarget, clouds: page.clouds.beforeSceneRender, scene: page.passes[0].render };
  try {
    const described = installFramePassTimer();
    assert.equal(described.gpuTimer, true);
    assert.deepEqual(described.labels, ['scene', 'aerial', 'bloom', 'sunshafts', 'lensflare', 'grade', 'smaa', 'upscale'],
      'the unexposed grade and SMAA passes take their place between the flare and the upscaler');
    assert.equal(installFramePassTimer().protocol, 'frame-pass-timer-v1', 'a second install is the same controller');
    const pending = window.__FRAME_PASS_TIMER.sample({ frames: 40, block: 10 });
    for (let i = 0; i < 60; i++) page.frame();
    const result = await pending;
    assert.equal(page.nestedCount(), 0, 'no TIME_ELAPSED query is ever begun inside another');
    assert.ok(result.frames.length >= 40);
    const seg = result.frames.find((f) => f.mode === 'segmented');
    const whole = result.frames.find((f) => f.mode === 'whole');
    assert.ok(seg && whole, 'segmented and whole-frame blocks alternate');
    const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);
    near(seg.gpu['world-water'], 0.25, 'the ripple step is charged to world-water');
    near(seg.gpu['world-grass'], 0.05, 'the pressure step is charged to world-grass');
    near(seg.gpu.clouds, 2, 'the cloud march is its own line');
    near(seg.gpu['shadow-c0'], 1, 'cascade 0 by its shadow map');
    near(seg.gpu['shadow-c3'], 2.5, 'cascade 3 by its shadow map');
    near(seg.gpu.scene, 7, 'the scene pass keeps its own work on both sides of the nested shadow maps');
    near(seg.gpu.smaa, 0.6, 'SMAA');
    near(seg.gpuTotal, 0.25 + 0.05 + 2 + 7 + 1 + 1.5 + 2 + 2.5 + 0.5 + 0.7 + 0.2 + 0.1 + 0.4 + 0.6 + 0.3, 'pieces sum');
    near(whole.gpuTotal, seg.gpuTotal, 'the whole-frame query sees the same frame');
    assert.equal(seg.calls['shadow-c2'], 10);
    assert.equal(seg.calls.scene, 52, 'draw calls follow the label too');
    const summary = summarizePassFrames(result);
    assert.equal(summary.segmentedOverWhole, 1, 'the per-pass sum lands on the whole frame');
    assert.deepEqual(Object.keys(summary.passes).slice(0, 4), ['world', 'world-water', 'world-grass', 'between'],
      'labels follow the frame order');
    for (const label of Object.keys(summary.passes)) assert.ok(FRAME_PASS_ORDER.includes(label), `${label} has a canonical place`);
    assert.ok(page.flushCount() > 0, 'segmented pieces commit the command buffer at their boundaries');
    // prefix mode: one query per frame, from its start to the rotating checkpoint; the steps are the passes
    const prefixRun = window.__FRAME_PASS_TIMER.sample({ frames: 66, modes: ['prefix'],
      checkpoints: ['world', 'clouds', 'scene', 'aerial', 'bloom', 'sunshafts', 'lensflare', 'grade', 'smaa', 'upscale'] });
    for (let i = 0; i < 90; i++) page.frame();
    // with the shadow checkpoint (the default list): the nested shadow-map render ends its own step
    const shadowRun = window.__FRAME_PASS_TIMER.sample({ frames: 72, modes: ['prefix'],
      checkpoints: ['world', 'clouds', 'shadow', 'scene', 'aerial', 'bloom', 'sunshafts', 'lensflare', 'grade', 'smaa', 'upscale'] });
    for (let i = 0; i < 96; i++) page.frame();
    const shadowSplit = summarizePassFrames(await shadowRun);
    near(shadowSplit.prefixPasses.shadow.med, 4 + 1 + 1.5 + 2 + 2.5, 'prefix step shadow = the scene pass through its shadow maps');
    near(shadowSplit.prefixPasses.scene.med, 3, 'prefix step scene = the main draw after the maps');
    const prefixResult = await prefixRun;
    assert.equal(page.nestedCount(), 0);
    const ps = summarizePassFrames(prefixResult);
    near(ps.prefixPasses.world.med, 0.3, 'prefix step world = both simulations');
    near(ps.prefixPasses.clouds.med, 2, 'prefix step clouds');
    near(ps.prefixPasses.scene.med, 4 + 1 + 1.5 + 2 + 2.5 + 3, 'prefix step scene = the scene pass with its shadow maps');
    near(ps.prefixPasses.upscale.med, 0.3, 'the last step');
    near(ps.gpuFrame.med, seg.gpuTotal, 'the last checkpoint is a whole frame');
    window.__FRAME_PASS_TIMER.uninstall();
    assert.equal(page.post.render, originals.post);
    assert.equal(page.world.update, originals.world);
    assert.equal(page.renderer.shadowMap.render, originals.shadow);
    assert.equal(page.renderer.setRenderTarget, originals.srt);
    assert.equal(page.clouds.beforeSceneRender, originals.clouds);
    assert.equal(page.passes[0].render, originals.scene);
    assert.equal(window.__FRAME_PASS_TIMER, undefined);
  } finally {
    page.restore();
  }
}

// ---------------------------------------------------------------------------------------------- host helpers

assert.deepEqual(stats([3, 1, 2, null, 4]), { n: 4, med: 3, p10: 1, p25: 2, p75: 4, p90: 4, mean: 2.5 });
assert.equal(stats([]).med, null);
{
  const seq = [{ label: 'a', value: 10 }, { label: 'b', value: 8 }, { label: 'b', value: 9 }, { label: 'a', value: 12 }];
  const d = pairDeltas(seq, 'a', 'b');
  assert.deepEqual(d.deltas, [-2, -3], 'A1 B1 | B2 A2 pair as B1-A1 and B2-A2');
  assert.equal(d.pairs, 2);
  assert.equal(d.min, -3);
}
{
  const p = projectFrameMs({ gpuMs: 6, cpuMs: 5 }, { gpuRatio: 0.34, cpuRatio: 0.62 });
  assert.equal(p.bound, 'gpu');
  assert.equal(p.gpuMs, 17.65);
  assert.equal(p.frameMs, 17.65);
  assert.throws(() => projectFrameMs({ gpuMs: 1, cpuMs: 1 }, { gpuRatio: 0, cpuRatio: 1 }), RangeError);
  const r = proxyRatios(MID_RANGE_PROXIES['rtx4050-laptop']);
  assert.equal(r.gpuRatio, 0.342, 'the conservative GPU ratio is Wild Life Extreme 13,488 / 39,389');
  assert.deepEqual(r.gpuRatioRange, [0.342, 0.448]);
  assert.equal(r.cpuRatio, 0.624);
  assert.ok(proxyRatios(MID_RANGE_PROXIES.radeon780m).gpuRatio < 0.13, 'the 780M is a different class: about 1/8');
}
{
  const ids = Array.from({ length: 60 }, (_, i) => `t${String(i).padStart(2, '0')}`);
  const picked = pinnedOpponents([...ids].reverse(), 't05', 27);
  assert.equal(picked.length, 27);
  assert.ok(!picked.includes('t05'));
  assert.deepEqual(picked, pinnedOpponents(ids, 't05', 27), 'the pick depends on the catalog, not its order');
  assert.equal(new Set(picked).size, 27);
  assert.throws(() => pinnedOpponents(ids.slice(0, 10), 't05', 27), /opponents/);
}
{
  const o = parseFrameProbeArgs(['--roots=a,b', '--labels=x,y', '--maps=verdant', '--toggle=shadow-cache']);
  assert.equal(o.pattern, 'ABBA');
  assert.deepEqual(o.viewports, ['1600x900', '1920x1080']);
  assert.equal(o.port, 5395);
  assert.throws(() => parseFrameProbeArgs(['--roots=a', '--maps=verdant', '--pattern=AB']), /no root/);
  assert.throws(() => parseFrameProbeArgs(['--roots=a', '--maps=verdant', '--pattern=A', '--toggle=nope']), /toggle/);
  assert.throws(() => parseFrameProbeArgs(['--roots=a', '--maps=verdant', '--pattern=A', '--sides=14']), /sides/);
}
{
  // the lock order: FIFO first; a busy session mutex gives the FIFO back before queueing again
  const events = [];
  const lock = { acquire: async () => events.push('fifo'), release: () => events.push('fifo-release'), refresh: () => {} };
  let attempts = 0;
  const held = await acquireProbeLocks({ sessionMutex: '/m', lock, mutexWaitMs: 5, pause: async () => {},
    tryMutex: () => (++attempts > 3 ? (events.push('mutex'), true) : false), releaseMutex: () => events.push('mutex-release') });
  held.release();
  assert.equal(events[0], 'fifo');
  assert.ok(events.indexOf('mutex') > events.indexOf('fifo'), 'the mutex is only ever taken while the FIFO is ours');
  assert.deepEqual(events.slice(-2), ['mutex-release', 'fifo-release']);
}
{
  const slot = (label, order, gpu) => ({ mapId: 'verdant', label, key: `verdant-s${order}-${label}`, samples: [{ viewport: '1600x900', view: 'chase',
    summary: { gpuFrame: { med: gpu, p25: gpu - 1 }, cpuFrame: { med: 5 }, calls: { med: 600 }, tris: { med: 1 }, segmentedOverWhole: 1,
      passes: { scene: { gpu: { med: gpu / 2 }, cpu: { med: 1 }, calls: { med: 300 } } } } }] });
  const withPrefix = (record, shadow) => {
    record.samples[0].prefixSummary = { prefixPasses: { world: { med: 0.3, p25: 0.2 }, shadow: { med: shadow, p25: shadow - 0.5 }, scene: { med: 4, p25: 3.5 } } };
    record.samples[0].summary.passes['shadow-c0'] = { gpu: { med: null }, cpu: { med: 0.4 }, calls: { med: 90 } };
    record.samples[0].summary.passes['shadow-c1'] = { gpu: { med: null }, cpu: { med: 0.2 }, calls: { med: shadow * 10 } };
    return record;
  };
  const report = buildFrameReport([withPrefix(slot('base', 0, 20), 5), withPrefix(slot('new', 1, 17), 2), withPrefix(slot('new', 2, 18), 2.5),
    withPrefix(slot('base', 3, 21), 5.5)], ['base', 'new']);
  const row = report['verdant 1600x900 chase'];
  assert.deepEqual(row.deltas.gpuFrame.deltas, [-3, -3]);
  assert.equal(row.byLabel.base.gpuFrame, 20);
  assert.deepEqual(row.stepNames, ['world', 'shadow', 'scene'], 'the per-pass GPU rows are the prefix steps');
  assert.deepEqual(row.deltas.steps.shadow.gpu.deltas, [-3, -3], 'a step pairs A B B A like the frame');
  assert.equal(row.byLabel.base.steps.shadow.cpu, 0.6, 'a step charges the CPU of every label it covers (the cascades)');
  assert.equal(row.byLabel.base.steps.shadow.calls, 140);
  // a toggle's blocks (off, on, on, off) pair inside the slot
  const block = (side, gpu, shadow) => ({ side, state: {}, summary: { gpuFrame: { med: gpu, p25: gpu }, cpuFrame: { med: 4 }, calls: { med: 500 },
    tris: { med: 1 }, passes: {}, prefixPasses: { shadow: { med: shadow, p25: shadow } } } });
  const toggled = buildFrameReport([{ mapId: 'monsoon', label: 'new', key: 'monsoon-s0-new', samples: [{ viewport: '1600x900', view: 'chase',
    toggle: 'shadow-cache', blocks: [block('off', 20, 6), block('on', 18, 3), block('on', 18.5, 3.2), block('off', 21, 6.4)] }] }]);
  const t = toggled['monsoon 1600x900 chase toggle:shadow-cache'];
  assert.deepEqual(t.deltas.gpuFrame.deltas, [-2, -2.5]);
  assert.deepEqual(t.deltas.steps.shadow.gpu.deltas, [-3, -3.2]);
  assert.equal(t.byLabel.off.n, 2);
}

console.log('frame-budget probe: per-pass timer label algebra, whole-frame check, restore, pair deltas, roster pin, lock order, projection PASS');
