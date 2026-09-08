import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';
import { LateFxPass } from './post.ts';
import { SceneAAPass, SceneAerialPass } from './sceneSourcePass.ts';
import { AdaptiveQualityPolicy } from './adaptiveQualityPolicy.ts';
import { baseDynamicScale, dynamicScaleFloor, internalPixelRatio } from './renderScalePolicy.ts';
import { MAX_CALIBRATED_FRAME_BUDGET_MS, presentationFrameBudgetMs } from './frameLoopScheduler.ts';
import { PRESETS } from './quality.ts';

// Source-execute the production owner, preset-scaled pass wrappers, temporal
// invalidator and reset entrypoints. Three's actual composer and render targets
// run in Node; only GPU allocation/native canvas dimensions are renderer ports.
const source = readFileSync(new URL('./post.ts', import.meta.url), 'utf8');
function sourceBetween(start, end) {
  const first = source.indexOf(start);
  assert.notEqual(first, -1, `missing production start: ${start}`);
  const last = source.indexOf(end, first + start.length);
  assert.notEqual(last, -1, `missing production end: ${end}`);
  return source.slice(first, last);
}
const method = start => sourceBetween(`    ${start}`, '\n    },') + '\n    }';
const declarations = sourceBetween('  let cssW = 0;', '\n  // --- Dynamic resolution governor');
const applySize = sourceBetween('  function applySize(', '\n  function applyAdaptiveQualityAction(');
const reset = sourceBetween('  function resetGovernorState()', '\n  function updateAerialZoom(');
const aoEnabled = sourceBetween('  function applyAoEnabled()', '\n  function setPerfTrim(');
const aoHistory = sourceBetween('    let emaLastMs = ', '\n    const prevViewProj');
const aoSize = sourceBetween('    const origSetSize = gtao.setSize.bind(gtao);', '\n    gtao.render = function');
const bloomSize = sourceBetween('    const origSetSize = bloom.setSize.bind(bloom);', '\n  }\n  composer.addPass(bloom)');
const presetChange = sourceBetween('  onPresetChange((p) => {', '\n\n  return {');
const samplesForPreset = sourceBetween('  const samplesForPreset = ', '\n  let msaaSamples');
const targetMs = source.match(/const DYN_TARGET_MS = ([^;]+);/)?.[0];
assert.ok(targetMs, 'production cadence target exists');

const createSizing = new Function(stripTypeScriptTypes(`
function createSizing(ports) {
  const { renderer, composer, gtao, bloom, sceneAA, aerial, upscaler, size, THREE,
    AdaptiveQualityPolicy, baseDynamicScale, internalPixelRatio, dynamicScaleFloor,
    MAX_CALIBRATED_FRAME_BUDGET_MS, presentationFrameBudgetMs, initialPreset, scale, emaPrev, emaCur, emaMat } = ports;
  let preset = initialPreset;
  const maxSamples = 4;
  ${samplesForPreset}
  let msaaSamples = samplesForPreset(preset);
  let resetTemporalAoHistory = (): void => {};
  ${aoHistory}
  { ${aoSize} }
  { ${bloomSize} }
  ${declarations}
  const qualityPolicy = new AdaptiveQualityPolicy(scale);
  let quality = 'high', adaptiveSuspended = false;
  let dynPin = null, dynClock = 17, dynEma = 19, dynRingN = 4, dynRingI = 3;
  let dynWinFrames = 6, dynWinMisses = 2, dynBudgetMs = 3, dynBestCadenceMs = 4, dynLastDecision = 1;
  ${targetMs}
  ${aoEnabled}
  ${applySize}
  ${reset}
  const post = {
    ${method('setSize(w, h) {')},
    ${method('setAdaptiveSuspended(suspended) {')},
    ${method('resetAdaptiveResolution() {')},
    ${method('pinDynScale(v) {')}
  };
  let onPreset;
  const onPresetChange = fn => { onPreset = fn; };
  const applyAoSampling = () => {};
  const publishAAState = () => {};
  ${presetChange}
  return { post, policy: qualityPolicy, changePreset: p => onPreset(p),
    seedHistory: () => { emaLastMs = 100; }, history: () => emaLastMs,
    governor: () => ({ dynPin, dynEma, dynRingN, dynRingI, dynWinFrames, dynWinMisses,
      dynBudgetMs, dynBestCadenceMs, dynLastDecision }),
  };
}
`) + '\nreturn createSizing;')();

const owned = [];
function fixture(initialPreset = PRESETS.high, scale = 1, ratio = 1) {
  let width = 1440, height = 900;
  const calls = [], allocations = [];
  const renderer = {
    info: {}, domElement: { dataset: {} },
    getPixelRatio: () => ratio,
    getSize: target => target.set(width, height),
    getDrawingBufferSize: target => target.set(Math.floor(width * ratio), Math.floor(height * ratio)),
    initRenderTarget: target => allocations.push(target),
  };
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y);
  const sceneTarget = new THREE.WebGLRenderTarget(size.x, size.y, {
    depthTexture: new THREE.DepthTexture(size.x, size.y), samples: Math.min(initialPreset.msaaSamples, 4),
  });
  const lateTarget = sceneTarget.clone();
  const composer = new EffectComposer(renderer, target);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const sceneAA = new SceneAAPass(scene, camera, sceneTarget);
  const aerial = new SceneAerialPass(CopyShader, sceneTarget);
  aerial.uniforms.uInvSize = { value: new THREE.Vector2() };
  const gtao = new GTAOPass(scene, camera, size.x, size.y);
  const bloom = new UnrealBloomPass(size.clone());
  const softState = { uSceneDepth: { value: null }, uSoftViewport: { value: new THREE.Vector2() },
    uCameraNear: { value: 0 }, uCameraFar: { value: 0 }, isActive: () => true };
  const lateFx = new LateFxPass(scene, camera, sceneTarget, lateTarget, softState);
  const output = new THREE.Vector2();
  const upscaler = { setOutputSize: (w, h) => output.set(w, h) };
  const emaPrev = gtao.pdRenderTarget.clone(), emaCur = gtao.pdRenderTarget.clone();
  const emaMat = { uniforms: { uTexel: { value: new THREE.Vector2() } } };
  const owner = createSizing({ renderer, composer, gtao, bloom, sceneAA, aerial, upscaler,
    size, THREE, AdaptiveQualityPolicy, baseDynamicScale, internalPixelRatio, dynamicScaleFloor,
    MAX_CALIBRATED_FRAME_BUDGET_MS, presentationFrameBudgetMs, initialPreset, scale, emaPrev, emaCur, emaMat });
  const passes = [sceneAA, aerial, gtao, lateFx, bloom];
  for (const [index, pass] of passes.entries()) {
    const original = pass.setSize;
    pass.setSize = function (w, h) { calls.push([index, w, h]); return original.call(this, w, h); };
    composer.addPass(pass);
  }
  calls.length = 0;
  const resize = (w = width, h = height, pixelRatio = ratio) => {
    width = w; height = h; ratio = pixelRatio; owner.post.setSize(w, h);
  };
  const prepare = () => { allocations.length = 0; lateFx.prepare(renderer); return allocations.length; };
  const dimensions = () => ({
    color: [composer.renderTarget1.width, composer.renderTarget1.height],
    scene: [sceneTarget.width, sceneTarget.height], late: [lateTarget.width, lateTarget.height],
    ao: [gtao.pdRenderTarget.width, gtao.pdRenderTarget.height],
    history: [emaPrev.width, emaPrev.height, emaCur.width, emaCur.height],
    bloom: [bloom.renderTargetBright.width, bloom.renderTargetBright.height],
    inverse: aerial.uniforms.uInvSize.value.toArray(), output: output.toArray(),
  });
  const result = { ...owner, renderer, composer, sceneAA, lateFx, gtao, bloom, calls, allocations,
    resize, prepare, dimensions, output, clear: () => { calls.length = 0; allocations.length = 0; } };
  owned.push(() => {
    composer.dispose(); gtao.dispose(); bloom.dispose();
    for (const resource of [sceneTarget, lateTarget, emaPrev, emaCur, sceneAA.copyMaterial,
      sceneAA.copyQuad, aerial, lateFx.copyMaterial, lateFx.copyQuad]) resource.dispose();
  });
  return result;
}
function traversals(f, expected, label) {
  assert.equal(f.calls.length, expected * 5, `${label}: real composer pass traversal count`);
  for (let offset = 0; offset < f.calls.length; offset += 5) {
    assert.deepEqual(f.calls.slice(offset, offset + 5).map(call => call[0]), [0, 1, 2, 3, 4],
      `${label}: canonical pass order`);
  }
}

try {
  {
    const f = fixture();
    f.resize(); traversals(f, 1, 'initial identical dimensions still replay patched passes');
    assert.equal(f.prepare(), 2);
    f.seedHistory(); f.clear(); f.resize();
    traversals(f, 0, 'ordinary unchanged viewport');
    assert.equal(f.history(), 100, 'no-op viewport preserves useful temporal history');
    assert.equal(f.prepare(), 0, 'no-op viewport retains prepared LateFX targets');
    assert.deepEqual(f.dimensions().color, [1440, 900]);
    f.clear(); f.resize(1000, 600); traversals(f, 1, 'CSS-only resize');
    assert.deepEqual(f.dimensions().color, [1000, 600]);
    assert.equal(f.history(), -1e9); assert.equal(f.prepare(), 2);
    f.clear(); f.resize(1000, 600, 2); traversals(f, 1, 'ratio-only resize');
    assert.deepEqual(f.dimensions().color, [1500, 900]);
    f.clear(); f.resize(800, 500, 1); traversals(f, 2, 'simultaneous CSS and ratio change');
    assert.deepEqual(f.dimensions().color, [800, 500]);
    assert.deepEqual(f.calls.filter(call => call[0] === 0), [[0, 1000, 600], [0, 800, 500]],
      'public ratio setter uses old CSS size before final size setter');
  }
  {
    const f = fixture(PRESETS.high, 0.91, 2);
    f.policy.forceTrim(1, 1); f.resize(); traversals(f, 2, 'native-sized explicit-target construction');
    assert.equal(f.policy.dynamicScale, 0.91);
    assert.equal(f.renderer.domElement.dataset.renderScale, '1.365');
    const { scale: oldScale, ...evidence } = { ...f.policy };
    assert.equal(oldScale, 0.91);
    f.clear(); f.resize(1440, 900, 1); traversals(f, 1, 'DPR floor reconciliation');
    assert.equal(f.policy.dynamicScale, 1);
    const { scale: newScale, ...retainedEvidence } = { ...f.policy };
    assert.equal(newScale, 1); assert.deepEqual(retainedEvidence, evidence);
    assert.equal(f.renderer.domElement.dataset.dynScale, '1.000');
    assert.deepEqual(f.dimensions().inverse, [1 / 1440, 1 / 900]);
    assert.deepEqual(f.output.toArray(), [1440, 900]);
    f.clear(); f.resize(1440, 900, 2); traversals(f, 1, 'restored retina density');
    assert.equal(f.policy.performanceTrim, 1);
    f.prepare(); f.seedHistory(); f.clear(); f.resize(1440, 900, 3);
    traversals(f, 0, 'capped internal raster with changed native output');
    assert.deepEqual(f.output.toArray(), [4320, 2700]);
    assert.equal(f.history(), 100); assert.equal(f.prepare(), 0);
    const before = f.dimensions(); f.policy.setDynamicScale(0.5); f.clear(); f.resize();
    traversals(f, 1, 'policy scale changes effective raster');
    assert.notDeepEqual(f.dimensions().color, before.color);
  }
  {
    const base = 1.25 / 1.4;
    const f = fixture(PRESETS.mobile, base, 3); f.resize();
    assert.equal(f.policy.dynamicScale, base);
    assert.equal(f.renderer.domElement.dataset.renderScale, '1.250');
  }
  {
    const p = { ...PRESETS.high, aoScale: 0.5, bloomScale: 0.5, msaaSamples: 2 };
    const f = fixture(p); f.resize(); f.prepare(); f.seedHistory(); f.clear();
    f.changePreset({ ...p, aoScale: 0.75, bloomScale: 1 });
    traversals(f, 1, 'preset-scaled effects with identical outer raster');
    assert.deepEqual(f.dimensions().ao, [1080, 675]);
    assert.deepEqual(f.dimensions().history, [1080, 675, 1080, 675]);
    assert.deepEqual(f.dimensions().bloom, [720, 450]);
    assert.equal(f.history(), -1e9); assert.equal(f.prepare(), 2);
    f.clear(); f.changePreset({ ...p, aoScale: 0.75, bloomScale: 1, msaaSamples: 4 });
    traversals(f, 1, 'same-size scene MSAA reallocation invalidates LateFX preparation');
    assert.equal(f.sceneAA.sceneTarget.samples, 4); assert.equal(f.prepare(), 2);
    f.seedHistory(); f.clear(); f.changePreset({ ...p, aoScale: 0.75, bloomScale: 1, msaaSamples: 4 });
    traversals(f, 0, 'identical preset shape keeps physical targets');
    assert.equal(f.history(), -1e9, 'preset reset still rejects preceding temporal history');
    f.clear(); f.changePreset({ ...p, aoScale: 0, bloomScale: 0 });
    traversals(f, 1, 'zero-scale fallback retains existing wrapper semantics');
    assert.deepEqual(f.dimensions().ao, [1440, 900]);
    assert.deepEqual(f.dimensions().bloom, [720, 450]);
    assert.equal(f.gtao.enabled, false);
  }
  {
    const f = fixture(); f.resize(); f.prepare(); f.seedHistory(); f.clear();
    f.post.resetAdaptiveResolution(); traversals(f, 0, 'phase reset without physical resize');
    assert.equal(f.history(), -1e9); assert.equal(f.prepare(), 0);
    assert.deepEqual(f.governor(), { dynPin: null, dynEma: 0, dynRingN: 0, dynRingI: 0,
      dynWinFrames: 0, dynWinMisses: 0, dynBudgetMs: presentationFrameBudgetMs(0),
      dynBestCadenceMs: MAX_CALIBRATED_FRAME_BUDGET_MS, dynLastDecision: 17 });
    f.seedHistory(); f.post.setAdaptiveSuspended(true); traversals(f, 0, 'enter opaque loading');
    assert.equal(f.history(), -1e9);
    f.seedHistory(); f.post.setAdaptiveSuspended(true);
    assert.equal(f.history(), 100, 'repeated suspension keeps the original no-op contract');
    f.post.setAdaptiveSuspended(false); assert.equal(f.history(), -1e9);
    f.seedHistory(); f.renderer.info = {}; f.clear(); f.resize();
    traversals(f, 1, 'renewed renderer lifetime at unchanged dimensions');
    assert.equal(f.history(), -1e9); assert.equal(f.prepare(), 2);
    f.clear(); f.post.resetAdaptiveResolution(); traversals(f, 0, 'post-restore phase reset reuses repaired size');
    const g = fixture(PRESETS.high, 1, 2); g.resize(); g.clear();
    g.post.pinDynScale(0.8); traversals(g, 1, 'resolution governor applies real relief');
    g.clear(); g.post.resetAdaptiveResolution(); traversals(g, 1, 'phase reset restores original sharp raster');
    assert.equal(g.policy.dynamicScale, 1);
  }
  {
    const f = fixture(); f.resize();
    const original = f.bloom.setSize;
    const error = new Error('size failed'); let reject = true;
    f.bloom.setSize = function (...args) { if (reject) throw error; return original.apply(this, args); };
    assert.throws(() => f.resize(900, 600, 2), problem => problem === error);
    reject = false; f.clear(); f.resize(900, 600, 2);
    assert.deepEqual(f.dimensions().color, [1350, 900], 'partial setter failure cannot publish a stale sizing receipt');
    assert.ok(f.calls.length > 0, 'failed transaction is replayed');
    f.clear(); f.resize(900, 600, 2); traversals(f, 0, 'successful retry becomes reusable');
  }
  {
    const f = fixture(); f.resize(); f.prepare(); f.seedHistory(); f.clear();
    // Negative control uses the original pair of public calls on the same real
    // composer: this is precisely the behavior the old fake failed to model.
    f.composer.setPixelRatio(1); f.composer.setSize(1440, 900);
    traversals(f, 2, 'original duplicate-size negative control');
    assert.equal(f.history(), -1e9); assert.equal(f.prepare(), 2);
  }
  console.log('postViewportScale.selftest: real composer traversal, viewport/DPR/preset/lifetime sizing, temporal reset, native output and failure retry pass');
} finally { for (const dispose of owned) dispose(); }
