// Receipt for the frame-budget measurement (tools/frame-pass-timer.mjs, tools/frame-budget-probe.mjs): the
// per-pass timer's label algebra against a fake WebGL2 timeline (nesting, cascade and simulation refinement, the
// whole-frame cross-check, restoration), the A B B A pair deltas, the pinned roster and the mid-range projection; the
// pages' agreement (judgeScenes: twins on triangles, draws within their wander, another build's delta only once a staging
// repeats it, the report's VOID).
import assert from 'node:assert/strict';
import {
  FRAME_PASS_ORDER, MID_RANGE_PROXIES, installFramePassTimer, pairDeltas, projectFrameMs, proxyRatios, stats,
  summarizePassFrames,
} from './frame-pass-timer.mjs';
import * as THREE from 'three';
import {
  acquireProbeLocks, borderAdditionsToggle, buildFrameReport, buildProfileReport, chunkOfUrl, judgeScenes, parseFrameProbeArgs, pinnedOpponents,
  profileSelfByChunk,
} from './frame-budget-probe.mjs';
import { compareCaptureSet, crc32, decodeLum, encodeLum, encodeRgbPng, interiorChanges } from './frame-capture-compare.mjs';

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
  assert.deepEqual(parseFrameProbeArgs(['--roots=a', '--maps=verdant', '--pattern=A', '--views=chase,chase@7']).views, ['chase', 'chase@7'],
    'a moving view glides at <m/s>');
  assert.throws(() => parseFrameProbeArgs(['--roots=a', '--maps=verdant', '--pattern=A', '--views=chase@0']), /moving view/);
  // the pages' agreement: the coordinator's defaults (twins' triangles 3 %, draws 10 %, a delta repeated within 1 %), on
  assert.deepEqual([o.twinTrisTol, o.drawsTol, o.stableTol, o.sceneCheck], [3, 10, 1, true]);
  const t = parseFrameProbeArgs(['--roots=a', '--maps=verdant', '--pattern=A', '--twin-tris-tol=2', '--draws-tol=12', '--stable-tol=0.5', '--scene-check=off']);
  assert.deepEqual([t.twinTrisTol, t.drawsTol, t.stableTol, t.sceneCheck], [2, 12, 0.5, false]);
  assert.throws(() => parseFrameProbeArgs(['--roots=a', '--maps=verdant', '--pattern=A', '--draws-tol=x']), /percentages/);
}
{
  // the pages' agreement (judgeScenes): hold 51's three pages, each staged once — the base (h) 685 draws / 3.50 M triangles,
  // the change (f) 340 / 3.15 M, the base's twin (the same dist) 369 / 3.20 M
  const P = (key, root, ...h) => ({ key, root, history: h.map(([calls, tris], i) => ({ calls, tris, seq: i })) });
  let j = judgeScenes([P('A', 'h', [685, 3498047]), P('B', 'f', [340, 3146550]), P('C', 'h', [369, 3200971])]);
  assert.equal(j.verdict, 'restage');
  assert.deepEqual(j.restage, ['A'], 'the twins disagree on triangles (9 %): the one with more is staged again, and nothing else is judged by them');
  // A staged again comes back at its twin's scene: the change's page agrees (1.7 % triangles, 8 % draws)
  j = judgeScenes([P('A', 'h', [685, 3498047], [366, 3199000]), P('B', 'f', [340, 3146550]), P('C', 'h', [369, 3200971])]);
  assert.equal(j.verdict, 'agree', j.notes.join('; '));
  // the twins still apart at the third reading: void
  j = judgeScenes([P('A', 'h', [685, 3498047], [690, 3497000], [684, 3499000]), P('B', 'f', [340, 3146550]), P('C', 'h', [369, 3200971])]);
  assert.equal(j.verdict, 'void');
  // draws wander 6 % within one dist from dynamic culling while the triangles hold: agree
  j = judgeScenes([P('A', 'h', [340, 3130000]), P('B', 'c', [361, 3135000]), P('C', 'h', [322, 3128000])]);
  assert.equal(j.verdict, 'agree', j.notes.join('; '));
  // the change adds 5 % triangles: staged again until a staging repeats it within 1 %, then its own geometry
  j = judgeScenes([P('A', 'h', [340, 3130000]), P('B', 'c', [345, 3290000]), P('C', 'h', [342, 3131000])]);
  assert.deepEqual([j.verdict, j.restage], ['restage', ['B']]);
  j = judgeScenes([P('A', 'h', [340, 3130000]), P('B', 'c', [345, 3290000], [350, 3295000]), P('C', 'h', [342, 3131000])]);
  assert.equal(j.verdict, 'agree');
  assert.deepEqual(j.accepted.map((a) => [a.key, a.trisPct]), [['B', 5.25]]);
  // ... and moving between stagings: staged again, then void
  j = judgeScenes([P('A', 'h', [340, 3130000]), P('B', 'c', [345, 3290000], [345, 3390000]), P('C', 'h', [342, 3131000])]);
  assert.equal(j.verdict, 'restage');
  j = judgeScenes([P('A', 'h', [340, 3130000]), P('B', 'c', [345, 3290000], [345, 3390000], [345, 3490000]), P('C', 'h', [342, 3131000])]);
  assert.equal(j.verdict, 'void');
  // A B B A slots, one staging each, judged as they come: B1 off the base waits for B2 (expectMore), B2 repeating it is
  // the build's delta; B2 moving is staged again; an A2 over A1 is staged again; A2 under an over-drawn A1 sends A1 back
  const S = (key, root, seq, calls, tris) => ({ key, root, history: [{ calls, tris, seq }] });
  j = judgeScenes([S('s0', 'h', 0, 340, 3130000), S('s1', 'c', 1, 345, 3290000)], { expectMore: ['c', 'h'] });
  assert.deepEqual([j.verdict, j.pending], ['agree', ['s1']]);
  j = judgeScenes([S('s0', 'h', 0, 340, 3130000), S('s1', 'c', 1, 345, 3290000), S('s2', 'c', 2, 349, 3300000)], { expectMore: ['h'] });
  assert.deepEqual([j.verdict, j.accepted.map((a) => a.key)], ['agree', ['s1', 's2']]);
  j = judgeScenes([S('s0', 'h', 0, 340, 3130000), S('s1', 'c', 1, 345, 3290000), S('s2', 'c', 2, 349, 3360000)], { expectMore: ['h'] });
  assert.deepEqual([j.verdict, j.restage], ['restage', ['s2']], 'B2 2 % off B1: past the 1 % a delta must repeat by');
  j = judgeScenes([S('s0', 'h', 0, 340, 3130000), S('s1', 'h', 1, 690, 3490000)]);
  assert.deepEqual(j.restage, ['s1']);
  j = judgeScenes([S('s0', 'h', 0, 690, 3490000), S('s3', 'h', 3, 340, 3130000)]);
  assert.deepEqual(j.restage, ['s0'], 'the over-drawn earlier slot is the one sent back');
  // tolerances are parameters
  assert.equal(judgeScenes([P('A', 'h', [340, 3130000]), P('C', 'h', [342, 3190000])], { twinTris: 1 }).verdict, 'restage');
  assert.equal(judgeScenes([P('A', 'h', [340, 3130000]), P('C', 'h', [400, 3131000])], { draws: 20 }).verdict, 'agree');
}
{
  // the report's agreement per pose: twins apart void the row; a delta repeated across its two slots is accepted; a slot
  // the gate voided voids its map's rows
  const rec = (label, order, gpu, calls, tris, extra = {}) => ({ mapId: 'verdant', label, key: `verdant-s${order}-${label}`, ...extra,
    samples: [{ viewport: '1600x900', view: 'chase', scene: { calls, tris, all: calls + 150 },
      summary: { gpuFrame: { med: gpu, p25: gpu - 1 }, cpuFrame: { med: 5 }, calls: { med: calls + 150 }, tris: { med: tris },
        passes: { scene: { gpu: { med: gpu / 2 }, cpu: { med: 1 }, calls: { med: calls }, tris: { med: tris } } } } }] });
  let row = buildFrameReport([rec('base', 0, 36, 685, 3498047), rec('new', 1, 32, 340, 3146550), rec('new', 2, 32, 341, 3147000),
    rec('base', 3, 27, 369, 3200971)], ['base', 'new'])['verdant 1600x900 chase'];
  assert.ok(row.void?.length && /twins/.test(row.void.join()), 'hold 51 as a report: VOID');
  row = buildFrameReport([rec('base', 0, 20, 340, 3130000), rec('new', 1, 21, 345, 3290000), rec('new', 2, 21, 349, 3300000),
    rec('base', 3, 20, 342, 3131000)], ['base', 'new'])['verdant 1600x900 chase'];
  assert.equal(row.void, undefined);
  assert.deepEqual(row.scene.accepted.map((a) => a.key), ['new s1', 'new s2'], "the change's own 5 % triangles, repeated");
  row = buildFrameReport([rec('base', 0, 20, 340, 3130000), { mapId: 'verdant', label: 'new', key: 'verdant-s1-new', void: 'pages disagree: x', samples: [] },
    rec('base', 3, 20, 342, 3131000)], ['base', 'new'])['verdant 1600x900 chase'];
  assert.ok(row.void?.some((v) => /verdant-s1-new/.test(v)), 'a gate-voided slot voids the rows of its map');
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
  // the mutex's holder is queued behind us: the turn goes back at once, and we re-enter under our first ticket
  const calls = [];
  let free = false;
  const lock = {
    lastTicket: null,
    acquire: async (_ms, opts = {}) => { calls.push(opts.ticket ?? 'new'); lock.lastTicket = opts.ticket ?? 'T1'; },
    release: () => calls.push('release'), refresh: () => {},
  };
  const logs = [];
  const held = await acquireProbeLocks({ sessionMutex: '/m', lock, log: (l) => logs.push(l), mutexWaitMs: 10_000, pause: async () => { free = true; },
    tryMutex: () => free && calls.length > 2, releaseMutex: () => {}, mutexBusy: () => !free, holderQueued: () => !free });
  assert.equal(held.round, 2);
  assert.deepEqual(calls, ['new', 'release', 'T1'], 'given back without waiting, then the original ticket');
  assert.match(logs[0], /queued behind us/);
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

// cross-build captures: a build difference counts only where both builds reproduce themselves across two loads
{
  const a1 = Uint8Array.from([10, 10, 50, 90, 200, 7]);
  const a2 = Uint8Array.from([10, 10, 58, 90, 200, 7]); // pixel 2 animates (the cloud history, water)
  const b1 = Uint8Array.from([10, 20, 70, 90, 196, 7]);
  const b2 = Uint8Array.from([10, 20, 51, 91, 196, 9]); // pixel 5 differs within B: excluded
  const r = compareCaptureSet(a1, a2, b1, b2, 1);
  assert.equal(r.floorA, 1); assert.equal(r.floorB, 2);
  assert.equal(r.stable, 4, 'pixels 0, 1, 3, 4 reproduce in both builds');
  assert.equal(r.changed, 2, 'pixel 1 (brighter) and pixel 4 (darker) are the change; pixel 3 moved one level only');
  assert.equal(r.darker, 1); assert.equal(r.maxChanged, 10);
  assert.deepEqual([...r.classes], [0, 3, 1, 0, 2, 1]);
  // 6 x 1: pixel 1 sits next to the unstable pixel 2, pixel 4 next to 5: neither is inside a stable region
  assert.deepEqual(interiorChanges(r.classes, 6, 1, a1, b1, 1), { count: 0, max: 0 });
  const wide = Uint8Array.from([3, 0, 0, 0, 0, 1]);
  assert.deepEqual(interiorChanges(wide, 6, 1, Uint8Array.from([10, 0, 0, 0, 0, 0]), Uint8Array.from([25, 0, 0, 0, 0, 0]), 2),
    { count: 1, max: 15 }, 'a change four pixels from the nearest unstable one is inside');
  const lum = decodeLum(encodeLum({ width: 3, height: 2, b64: Buffer.from(a1).toString('base64') }));
  assert.equal(lum.width, 3); assert.deepEqual([...lum.data], [...a1]);
  assert.equal(crc32(Buffer.from('IEND', 'ascii')), 0xae426082, 'PNG chunk CRC');
  const png = encodeRgbPng(2, 1, Uint8Array.from([255, 0, 0, 0, 255, 0]));
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(png.readUInt32BE(16), 2, 'IHDR width');
}

// CPU profile attribution: self time per chunk, each sample charged the delta to the next
{
  assert.equal(chunkOfUrl('http://127.0.0.1:5395/assets/audioEngine-ab12cd34.js'), 'audioEngine');
  assert.equal(chunkOfUrl('http://127.0.0.1:5395/assets/three.core-k9f8d7s6.js'), 'three.core');
  assert.equal(chunkOfUrl('', '(garbage collector)'), '(garbage collector)');
  const byChunk = profileSelfByChunk({ nodes: [{ id: 1, callFrame: { url: '', functionName: '(root)' } },
    { id: 2, callFrame: { url: '/assets/main-aaaaaaaa.js' } }, { id: 3, callFrame: { url: '/assets/audioEngine-bbbbbbbb.js' } }],
  samples: [2, 3, 3, 2], timeDeltas: [0, 1000, 2000, 500, 0] });
  assert.deepEqual(byChunk, [{ chunk: 'audioEngine', ms: 2.5 }, { chunk: 'main', ms: 1 }]);
  const profiles = buildProfileReport([
    { mapId: 'verdant', label: 'new', cpuProfile: { byChunk: [{ chunk: 'audioEngine', perFrameMs: 0.2 }], audio: { perFrameMs: 0.2 } } },
    { mapId: 'verdant', label: 'new', cpuProfile: { byChunk: [{ chunk: 'audioEngine', perFrameMs: 0.4 }], audio: { perFrameMs: 0.4 } } },
  ]);
  assert.equal(profiles.verdant.new.slots, 2);
  assert.equal(profiles.verdant.new.audio, 0.2, 'the lower median of two');
}

{
  // the border-additions toggle: the farmsteads and hedgerows hidden, each ring forest pool drawn without its row trees
  // (placements keyed below zero, matched by position), every instanced attribute moved with its instance, once
  const scene = new THREE.Scene();
  const forest = new THREE.Group();
  const spots = [[600, 10], [610, -40], [-620, 5], [5, 640], [-30, -700]], keys = [0.4, -1.2, 0.1, -1.7, 0.9];
  const placements = new Float32Array(spots.length * 10);
  spots.forEach(([x, z], i) => { placements[i * 10] = x + 0.37; placements[i * 10 + 2] = z - 0.11; placements[i * 10 + 8] = keys[i]; });
  forest.userData.horizonForest = { placements };
  const geometry = new THREE.PlaneGeometry(1, 1);
  const tags = new THREE.InstancedBufferAttribute(new Float32Array([10, 11, 12, 13, 14]), 1);
  geometry.setAttribute('aImpRow', tags);
  const pool = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), spots.length);
  const matrix = new THREE.Matrix4();
  spots.forEach((_, i) => {
    pool.setMatrixAt(i, matrix.makeTranslation(placements[i * 10], 3, placements[i * 10 + 2]));
    pool.setColorAt(i, new THREE.Color(i / 10, 0, 0));
  });
  forest.add(pool);
  const farms = new THREE.Mesh(), hedges = new THREE.Mesh();
  farms.name = 'border-farmsteads'; hedges.name = 'border-hedgerows';
  scene.add(forest, farms, hedges);
  const saved = globalThis.window;
  globalThis.window = { __DEBUG: { scene } };
  try {
    const xAt = (j) => pool.instanceMatrix.array[j * 16 + 12];
    const off = (0, eval)(borderAdditionsToggle(false));
    assert.deepEqual(off, { farms: 1, hedges: 1, rows: 2, pools: 1, hidden: 2, impostors: 0 });
    assert.equal(pool.count, 3, 'the two row trees drop out of the draw');
    assert.deepEqual([0, 1, 2].map(xAt), [0, 2, 4].map((i) => placements[i * 10]), 'the stands first, in their order');
    assert.deepEqual([...tags.array], [10, 12, 14, 11, 13], 'an instanced attribute moves with its instance');
    assert.equal(pool.instanceColor.array[3], Math.fround(0.2), 'and the instance colour (the stand that was third)');
    assert.equal(farms.visible || hedges.visible, false);
    assert.equal(globalThis.window.__SHADOW_DEBUG.noStaticCache, true, 'both sides redraw every caster');
    const on = (0, eval)(borderAdditionsToggle(true));
    assert.equal(on.hidden, 0);
    assert.equal(pool.count, 5);
    assert.equal(farms.visible && hedges.visible, true);
    (0, eval)(borderAdditionsToggle(false));
    assert.deepEqual([...tags.array], [10, 12, 14, 11, 13], 'the order is set once');
    assert.equal(pool.count, 3);
  } finally {
    globalThis.window = saved;
  }
}

console.log('frame-budget probe: per-pass timer label algebra, whole-frame check, restore, pair deltas, roster pin, lock order, projection, border-additions toggle, the pages\' agreement (gate and report) PASS');
