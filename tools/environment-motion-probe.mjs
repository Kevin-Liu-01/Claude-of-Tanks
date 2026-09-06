/** Committed Playwright visual regression: one video-owning context per case.
 * Videos include boot/staging. PNGs are read immediately after real game renders.
 * Chromium emulation is not physical Safari or frame-time certification.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { preview } from 'vite';
import { acquireCaptureLock, refreshCaptureLock, releaseCaptureLock } from './capture-lock.mjs';
import { stageHorizonScopeCapture, restoreHorizonArcadeCapture } from './environment-shot-camera.mjs';
import { outputResolution } from '../src/engine/resolutionPolicy.ts';
import { baseDynamicScale, internalPixelRatio } from '../src/engine/renderScalePolicy.ts';
import { PRESETS } from '../src/engine/quality.ts';

export const MOTION_PROTOCOL = 'playwright-live-environment-v2';

export function motionAcquisitionHash() {
  const hash = createHash('sha256');
  for (const file of ['./environment-motion-probe.mjs', './environment-shot-camera.mjs',
    '../src/engine/resolutionPolicy.ts', '../src/engine/renderScalePolicy.ts', '../src/engine/quality.ts']) {
    hash.update(file); hash.update(fs.readFileSync(new URL(file, import.meta.url)));
  }
  return hash.digest('hex');
}

export const MOTION_CASES = Object.freeze([
  ...['mangrove', 'winter', 'oasis', 'urban'].map(mapId => ({ device: 'desktop', mapId,
    width: 1440, height: 900, dpr: 1, tier: 'desktop', preset: 'high', scope: mapId === 'winter' })),
  ...['mangrove', 'winter'].map(mapId => ({ device: 'tablet', mapId,
    width: 1024, height: 768, dpr: 2, tier: 'mobile', preset: 'mobile-high', scope: mapId === 'mangrove' })),
  ...['winter', 'oasis', 'urban'].map(mapId => ({ device: 'phone', mapId,
    width: 390, height: 844, dpr: 3, tier: 'mobile', preset: 'mobile-high', scope: mapId === 'urban' })),
]);

/** Browser-side: retain ordinary battle/world updates; change the camera only. */
export function prepareLivePan({ mapId }) {
  const D = window.__DEBUG, world = D.world, hf = world.heightField;
  if (D.shotMode || D.game.phase !== 'battle' || world.mapId !== mapId
      || D.game.player.specId !== 'm1a2') throw new Error('Live pan needs the requested real M1A2 battle');
  const water = [...(world.config.terrain.lakes || []), ...(world.config.terrain.marshes || [])]
    .sort((a, b) => b.r - a.r)[0];
  const x = water ? water.x - Math.max(22, water.r * 0.92) : -40;
  const z = water ? water.z + Math.max(22, water.r * 0.92) * 0.28 : -96;
  const position = D.camera.position.clone().set(x, hf.getHeightAt(x, z) + 6.2, z);
  const target = position.clone().set(water?.x ?? -40,
    hf.getHeightAt(water?.x ?? -40, water?.z ?? 60) + (water ? 0.5 : 6.0), water?.z ?? 60);
  const direction = target.clone().sub(position);
  const yaw = Math.atan2(direction.x, direction.z);
  const pitch = Math.atan2(direction.y, Math.hypot(direction.x, direction.z));
  window.__ENV_MOTION = { base: position.toArray(), yaw, pitch, durationMs: 8000,
    yawSpan: 40 * Math.PI / 180, lateralM: 6, progress: 0, frames: 0, done: false };
  target.copy(position).add(direction.normalize().multiplyScalar(100));
  // Start at the left edge of the sweep, not the center of its arc.
  const startYaw = yaw - 20 * Math.PI / 180;
  target.set(position.x + Math.sin(startYaw) * Math.cos(pitch) * 100,
    position.y + Math.sin(pitch) * 100, position.z + Math.cos(startYaw) * Math.cos(pitch) * 100);
  D.rig.setExternalPose(position, target, 55);
  return { base: position.toArray(), yaw, pitch, target: target.toArray(), mapId };
}

/** Browser-side: a bounded diagnostic camera RAF, not a replacement renderer. */
export function startLivePan() {
  const D = window.__DEBUG, state = window.__ENV_MOTION;
  if (!state || state.startedAt !== undefined) throw new Error('Pan already started or not prepared');
  const position = D.camera.position.clone(), target = position.clone();
  state.startedAt = performance.now(); state.startTimeS = D.game.timeS;
  function tick(now) {
    const t = Math.min(1, Math.max(0, (now - state.startedAt) / state.durationMs));
    const yaw = state.yaw + (t - 0.5) * state.yawSpan;
    position.set(state.base[0] + Math.cos(state.yaw) * state.lateralM * t,
      state.base[1], state.base[2] - Math.sin(state.yaw) * state.lateralM * t);
    target.set(position.x + Math.sin(yaw) * Math.cos(state.pitch) * 100,
      position.y + Math.sin(state.pitch) * 100,
      position.z + Math.cos(yaw) * Math.cos(state.pitch) * 100);
    D.rig.setExternalPose(position, target, 55);
    state.progress = t; state.frames++;
    if (t < 1) state.raf = requestAnimationFrame(tick);
    else { state.done = true; state.endedAt = now; state.endTimeS = D.game.timeS; }
  }
  state.raf = requestAnimationFrame(tick);
  return { startedAt: state.startedAt, gameTimeS: state.startTimeS };
}

/** Scalar receipts only; no retained scene, texture, or renderer objects. */
export function motionReceipt() {
  const D = window.__DEBUG, camera = D.camera, canvas = D.renderer.domElement;
  const rect = canvas.getBoundingClientRect(), gl = D.renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return { timestamp: performance.now(), timeOrigin: performance.timeOrigin, wallTimeMs: Date.now(),
    mapId: D.world.mapId, phase: D.game.phase,
    shotMode: D.shotMode, gameTimeS: D.game.timeS, preBattleS: D.game.preBattleS,
    playerSpecId: D.game.player?.specId, externalActive: D.rig.externalActive,
    pan: window.__ENV_MOTION ? { ...window.__ENV_MOTION } : null,
    viewport: [innerWidth, innerHeight], dpr: devicePixelRatio,
    layout: browserLayoutReceipt(),
    canvasCss: [rect.width, rect.height], backing: [canvas.width, canvas.height],
    aspect: camera.aspect, projection: camera.projectionMatrix.toArray(),
    position: camera.position.toArray(), quaternion: camera.quaternion.toArray(),
    fov: camera.fov, zoom: camera.zoom, near: camera.near, far: camera.far,
    view: camera.view ? { ...camera.view } : null, filmOffset: camera.filmOffset,
    scoped: camera.userData.scoped === true, rigMode: D.rig.mode, rigZoom: D.rig.zoom,
    terrainClearance: camera.position.y - D.world.heightField.getHeightAt(camera.position.x, camera.position.z),
    requested: window.__ENV_REQUEST, preset: D.quality.resolvePresetName(),
    output: D.renderer.userData.outputResolution,
    outputPixelRatio: D.renderer.getPixelRatio(),
    renderScale: Number(canvas.dataset.renderScale), dynScale: D.post.dynScale,
    perfTrim: D.post.perfTrim, postAA: canvas.dataset.postAa,
    renderFrame: D.renderer.info.render.frame, contextLost: gl.isContextLost(),
    gpuUnmasked: !!ext, glVersion: gl.getParameter(gl.VERSION),
    gpu: gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
  };
}

/** Measure all viewport owners without changing CSS, camera, or renderer. */
export function browserLayoutReceipt() {
  const canvas = window.__DEBUG?.renderer?.domElement;
  const box = element => element ? {
    client: [element.clientWidth, element.clientHeight],
    rect: element.getBoundingClientRect().toJSON(),
    computed: { width: getComputedStyle(element).width, height: getComputedStyle(element).height },
  } : null;
  return {
    inner: [innerWidth, innerHeight], outer: [outerWidth, outerHeight], dpr: devicePixelRatio,
    visualViewport: visualViewport ? { width: visualViewport.width, height: visualViewport.height,
      scale: visualViewport.scale, offsetLeft: visualViewport.offsetLeft, offsetTop: visualViewport.offsetTop } : null,
    document: box(document.documentElement), body: box(document.body), app: box(document.getElementById('app')),
    canvas: box(canvas), output: window.__DEBUG?.renderer?.userData.outputResolution ?? null,
    cameraAspect: window.__DEBUG?.camera.aspect ?? null,
    storedDesktopPreset: localStorage.getItem('cot.gfxPreset'),
    storedMobilePreset: localStorage.getItem('cot.gfxMobilePreset'),
    actualPreset: window.__DEBUG?.quality.resolvePresetName() ?? null,
    url: location.href,
  };
}

export function validateMotionReceipt(receipt, testCase, { live = true } = {}) {
  const errors = [];
  const dimensions = [testCase.width, testCase.height];
  const same = value => JSON.stringify(value) === JSON.stringify(dimensions);
  if (receipt.mapId !== testCase.mapId || receipt.playerSpecId !== 'm1a2') errors.push('map/player mismatch');
  if (receipt.phase !== 'battle' || (live && (receipt.shotMode !== false
      || receipt.externalActive !== true || receipt.scoped !== false))) errors.push('not live battle');
  if (!same(receipt.viewport) || receipt.dpr !== testCase.dpr) errors.push('viewport/DPR mismatch');
  const layout = receipt.layout;
  if (!same(receipt.canvasCss) || !same(layout?.document?.client) || !same(layout?.app?.client)
      || !same(layout?.canvas?.client)) errors.push('CSS viewport owner mismatch');
  const vv = layout?.visualViewport;
  if (!vv || !Number.isFinite(vv.width) || !Number.isFinite(vv.height)
      || Math.abs(vv.width - testCase.width) > 0.01 || Math.abs(vv.height - testCase.height) > 0.01
      || vv.scale !== 1 || vv.offsetLeft !== 0 || vv.offsetTop !== 0) errors.push('visual viewport mismatch');
  if (!Number.isFinite(receipt.aspect)
      || Math.abs(receipt.aspect - testCase.width / testCase.height) > 1e-8) errors.push('camera aspect mismatch');
  const yScale = 1 / Math.tan(receipt.fov * Math.PI / 360);
  const expectedProjection = [yScale / receipt.aspect, 0, 0, 0, 0, yScale, 0, 0, 0, 0,
    -(receipt.far + receipt.near) / (receipt.far - receipt.near), -1,
    0, 0, -2 * receipt.far * receipt.near / (receipt.far - receipt.near), 0];
  if (receipt.zoom !== 1 || (receipt.view !== null && receipt.view?.enabled !== false) || receipt.filmOffset !== 0
      || receipt.fov !== (live ? 55 : 7.5) || receipt.near !== 0.5 || receipt.far !== 4000
      || receipt.projection?.length !== 16 || receipt.projection.some((n, i) => !Number.isFinite(n)
        || Math.abs(n - expectedProjection[i]) > 1e-8)) errors.push('projection contract mismatch');
  if (receipt.preset !== testCase.preset) errors.push('requested/effective quality mismatch (downgrade preserved)');
  if (receipt.requested?.preset !== testCase.preset
      || layout?.storedDesktopPreset !== 'high' || layout?.storedMobilePreset !== 'mobile-high') {
    errors.push('preboot requested settings missing');
  }
  if (receipt.contextLost !== false) errors.push('WebGL context unknown or lost');
  if (receipt.gpuUnmasked !== true || typeof receipt.gpu !== 'string' || !receipt.gpu.trim()
      || /swiftshader|llvmpipe|softpipe|software|basic render|lavapipe/i.test(receipt.gpu)) {
    errors.push('Missing native hardware GPU evidence');
  }
  const policy = outputResolution({ width: testCase.width, height: testCase.height,
    devicePixelRatio: testCase.dpr, mobile: testCase.tier === 'mobile' });
  if (Object.entries(policy).some(([key, value]) => receipt.output?.[key] !== value)
      || JSON.stringify(receipt.backing) !== JSON.stringify([policy.bufferWidth, policy.bufferHeight])) {
    errors.push('canonical output policy/backing mismatch');
  }
  errors.push(...validateEffectiveQuality(receipt, testCase));
  if (!Number.isFinite(receipt.terrainClearance) || receipt.terrainClearance < 0.5) errors.push('camera intersects terrain');
  return errors;
}

/** Compare real effective state to the source-owned ordinary preset policy. */
export function validateEffectiveQuality(state, testCase) {
  const errors = [];
  const preset = PRESETS[testCase.preset];
  const ratio = outputResolution({ width: testCase.width, height: testCase.height,
    devicePixelRatio: testCase.dpr, mobile: testCase.tier === 'mobile' }).pixelRatio;
  if (state.preset !== testCase.preset || state.perfTrim !== 0 || state.postAA !== 'smaa-high+fsr1') {
    errors.push('Effective preset/trim/AA differs from requested quality');
  }
  const base = baseDynamicScale(ratio, preset);
  if (state.outputPixelRatio !== ratio || !Number.isFinite(state.dynScale)
      || state.dynScale < base - 1e-10 || state.dynScale > 1) errors.push('Dynamic scale outside ordinary base-to-ceiling policy');
  // post.ts publishes this diagnostic with toFixed(3), not full precision.
  const expected = internalPixelRatio(ratio, preset, state.dynScale);
  if (!Number.isFinite(state.renderScale) || Math.abs(state.renderScale - expected) > 0.000500001) {
    errors.push('Internal render ratio disagrees with canonical policy');
  }
  return errors;
}

export function validateScopeReceipt(receipt, testCase) {
  const errors = validateMotionReceipt(receipt, testCase, { live: false });
  if (receipt.shotMode !== true || receipt.scoped !== true || receipt.rigMode !== 'SNIPER'
      || receipt.rigZoom !== 8) errors.push('Missing actual x8 scope');
  return errors;
}

/** Browser-side: three bounded canvas readbacks, after production post.render.
 * Do not await a remote screenshot at t=4s. Capture those pixels in that frame.
 * The wrapper never renders or changes dt, policy, dimensions, or quality.
 */
export function captureRenderedFrames({ pan = false, label = 'frame', timeoutMs = 20000 } = {}) {
  const D = window.__DEBUG, original = D.post.render;
  if (window.__ENV_CAPTURE_CLEANUP) throw new Error('A frame capture is already active');
  const result = window.__ENV_CAPTURE_RESULT = { frames: [], quality: [], submittedFrames: 0, positiveDtS: 0 };
  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => {
      if (D.post.render === wrapped) D.post.render = original;
      clearTimeout(timer);
      if (pan && window.__ENV_MOTION?.raf) cancelAnimationFrame(window.__ENV_MOTION.raf);
      delete window.__ENV_CAPTURE_CLEANUP;
    };
    const fail = error => { result.error = String(error); cleanup(); reject(error); };
    const take = name => {
      const receipt = motionReceipt();
      const png = D.renderer.domElement.toDataURL('image/png');
      result.frames.push({ label: name, receipt, png, capturedAfterRealRender: true });
    };
    function wrapped(...args) {
      try {
        original.apply(this, args);
        const dt = args[0];
        result.submittedFrames++;
        if (dt > 0) result.positiveDtS += dt;
        const canvas = D.renderer.domElement;
        // Every submitted pan frame is audited, including transient relief
        // that recovers before the three PNG checkpoints. Scalar-only, bounded.
        if (result.quality.length >= 4096) throw new Error('Frame evidence budget exceeded');
        result.quality.push({ preset: D.quality.resolvePresetName(), perfTrim: D.post.perfTrim,
          dynScale: D.post.dynScale, renderScale: Number(canvas.dataset.renderScale), postAA: canvas.dataset.postAa,
          outputPixelRatio: D.renderer.getPixelRatio(), frame: result.submittedFrames,
          renderFrame: D.renderer.info.render.frame, dt, timestamp: performance.now() });
        if (!result.frames.length) {
          take(pan ? 'start' : label);
          if (pan) startLivePan();
          else { cleanup(); resolve(result); }
        } else if (result.frames.length === 1 && window.__ENV_MOTION.progress >= 0.5) {
          take('mid');
        } else if (result.frames.length === 2 && window.__ENV_MOTION.done) {
          take('end'); cleanup(); resolve(result);
        }
      } catch (error) { fail(error); }
    }
    window.__ENV_CAPTURE_CLEANUP = () => fail(new Error('Frame capture cancelled'));
    timer = setTimeout(() => fail(new Error('Actual rendered-frame acquisition timeout')), timeoutMs);
    D.post.render = wrapped;
  });
}

export function validateLiveSequence(capture, testCase) {
  if (!capture || !Array.isArray(capture.frames) || !Array.isArray(capture.quality)) return ['Missing live capture evidence'];
  if (capture.quality.length > 4096) return ['Frame evidence budget exceeded'];
  const errors = capture.frames.flatMap(frame => validateMotionReceipt(frame.receipt, testCase));
  if (capture.frames.map(frame => frame.label).join(',') !== 'start,mid,end'
      || capture.frames.some(frame => frame.capturedAfterRealRender !== true)) return [...errors, 'Missing actual rendered frames'];
  const [start, mid, end] = capture.frames.map(frame => frame.receipt);
  if (![start.pan, mid.pan, end.pan].every(Boolean)) return [...errors, 'Missing pan state'];
  if (start.pan.progress !== 0 || start.pan.done !== false || end.pan.progress !== 1
      || [start, mid, end].some(frame => frame.pan.durationMs !== 8000)) errors.push('Incorrect authored pan interval');
  if (![start.gameTimeS, mid.gameTimeS, end.gameTimeS, start.renderFrame, mid.renderFrame, end.renderFrame,
    end.pan.startTimeS, end.pan.endTimeS, end.pan.frames].every(Number.isFinite)) errors.push('Unknown live counters');
  if (!Number.isFinite(mid.pan.progress) || mid.pan.progress < 0.5 || mid.pan.progress > 0.8) errors.push('Midpoint acquisition missed the live pan window');
  if (end.pan.done !== true || end.pan.endTimeS <= end.pan.startTimeS || end.pan.frames < 2
      || end.gameTimeS <= start.gameTimeS || !(start.gameTimeS < mid.gameTimeS && mid.gameTimeS < end.gameTimeS)
      || !(start.renderFrame < mid.renderFrame && mid.renderFrame < end.renderFrame)
      || !Number.isFinite(end.pan.endedAt - end.pan.startedAt) || end.pan.endedAt - end.pan.startedAt < 8000
      || !Number.isFinite(capture.positiveDtS) || capture.positiveDtS <= 0) {
    errors.push('No actual live simulation/render progress');
  }
  if (!Number.isInteger(capture.submittedFrames) || capture.submittedFrames < 3
      || capture.quality.length !== capture.submittedFrames) errors.push('Missing per-render effective quality evidence');
  let positiveDtS = 0;
  for (const [index, state] of capture.quality.entries()) {
    errors.push(...validateEffectiveQuality(state, testCase));
    if (state.frame !== index + 1 || !Number.isFinite(state.dt) || !Number.isFinite(state.timestamp)
        || !Number.isInteger(state.renderFrame) || (index > 0
          && (state.renderFrame <= capture.quality[index - 1].renderFrame
            || state.timestamp < capture.quality[index - 1].timestamp))) errors.push('Invalid actual-frame sequence');
    if (state.dt > 0) positiveDtS += state.dt;
  }
  if (Math.abs(positiveDtS - capture.positiveDtS) > 1e-8) errors.push('Submitted dt total mismatch');
  for (const frame of [start, mid, end]) {
    const state = capture.quality.find(value => value.renderFrame === frame.renderFrame);
    if (!state || ['preset', 'perfTrim', 'dynScale', 'renderScale', 'postAA', 'outputPixelRatio']
      .some(key => state[key] !== frame[key])) errors.push('PNG/per-render effective state disagreement');
  }
  return errors;
}

export function decodeFramePng(frame) {
  if (!frame.png?.startsWith('data:image/png;base64,')) throw new Error('Missing PNG frame');
  const buffer = Buffer.from(frame.png.slice(22), 'base64');
  if (buffer.length < 33 || buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
      || buffer.readUInt32BE(16) !== frame.receipt.backing[0]
      || buffer.readUInt32BE(20) !== frame.receipt.backing[1]) throw new Error('PNG/output dimensions mismatch');
  return buffer;
}

export function contextOptions(testCase, base, videoDir) {
  const videoSize = testCase.device === 'desktop' ? { width: testCase.width, height: testCase.height }
    : { width: Math.max(testCase.width, testCase.height), height: Math.max(testCase.width, testCase.height) };
  return { viewport: { width: testCase.width, height: testCase.height }, deviceScaleFactor: testCase.dpr,
    isMobile: testCase.tier === 'mobile', hasTouch: testCase.tier === 'mobile',
    recordVideo: { dir: videoDir, size: videoSize },
    storageState: { cookies: [], origins: [{ origin: base, localStorage: [
      { name: 'cot.lastTank.v1', value: 'm1a2' }, { name: 'cot.gfxPreset', value: 'high' },
      { name: 'cot.gfxMobilePreset', value: 'mobile-high' },
    ] }] } };
}

export function validateOneCaseGate(report, hash, evidenceRoot, acquisitionHash = motionAcquisitionHash()) {
  if (!report || report.protocol !== MOTION_PROTOCOL || report.buildIndexHash !== hash || report.complete !== true
      || report.acquisitionHash !== acquisitionHash || report.browserClosed !== true || report.serverClosed !== true
      || report.lockReleased !== true || report.browserCleanup?.closed !== true || report.browserCleanup?.forced !== false
      || !Array.isArray(report.errors) || report.errors.length || report.cases?.length !== 1) {
    throw new Error('Full matrix requires a passing desktop/winter acquisition from this build');
  }
  const row = report.cases[0], testCase = MOTION_CASES.find(value => value.device === 'desktop' && value.mapId === 'winter');
  if (row.id !== 'desktop/winter' || row.livePass !== true || row.contextClosed !== true
      || !Array.isArray(row.errors) || row.errors.length || !Array.isArray(row.receipts)) throw new Error('Missing successful case ownership');
  if (row.receipts.map(frame => frame.label).join(',') !== 'start,mid,end,scope8,resize-alternate,resize-restored') {
    throw new Error('Missing raw pan/scope/resize evidence');
  }
  const errors = validateLiveSequence({ frames: row.receipts.slice(0, 3), quality: row.quality,
    positiveDtS: row.positiveDtS, submittedFrames: row.submittedFrames }, testCase);
  const scope = row.receipts[3].receipt;
  errors.push(...validateScopeReceipt(scope, testCase));
  if (row.scope?.mapId !== 'winter' || row.scope.mode !== 'SNIPER' || row.scope.zoom !== 8
      || row.scope.fov !== 7.5 || row.scope.scoped !== true) errors.push('Missing source-owned scope contract');
  if (row.resizes?.length !== 2) errors.push('Missing DPR round trip');
  for (const [index, expected] of [{ ...testCase, dpr: 2 }, testCase].entries()) {
    const frame = row.receipts[index + 4];
    errors.push(...validateMotionReceipt(frame.receipt, expected));
    if (JSON.stringify(row.resizes?.[index]) !== JSON.stringify(frame.receipt)) errors.push('Resize receipt disagreement');
  }
  if (errors.length) throw new Error(`Saved one-case evidence fails revalidation: ${errors.join('; ')}`);
  verifyCaseArtifacts(row, evidenceRoot);
}

function verifyCaseArtifacts(row, evidenceRoot) {
  if (typeof evidenceRoot !== 'string' || !path.isAbsolute(evidenceRoot)) throw new Error('Missing original artifact directory');
  for (const frame of row.receipts) {
    if (frame.capturedAfterRealRender !== true || frame.png?.file !== `${row.id}-${frame.label}.png`) {
      throw new Error('Missing native PNG provenance');
    }
    const buffer = fs.readFileSync(path.join(evidenceRoot, frame.png.file));
    if (buffer.length !== frame.png.bytes || buffer.length < 33
        || createHash('sha256').update(buffer).digest('hex') !== frame.png.sha256
        || buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
        || buffer.readUInt32BE(16) !== frame.receipt.backing[0]
        || buffer.readUInt32BE(20) !== frame.receipt.backing[1]) throw new Error('Native PNG provenance mismatch');
  }
  const video = row.video, stream = video?.metadata?.streams?.[0];
  if (video?.file !== `${row.id}.webm` || video.verified !== true || !(video.bytes > 0)
      || !(Number(video.metadata?.format?.duration) >= 8) || stream?.width !== 1440 || stream?.height !== 900) {
    throw new Error('Missing video evidence');
  }
  const buffer = fs.readFileSync(path.join(evidenceRoot, video.file));
  if (buffer.length !== video.bytes || createHash('sha256').update(buffer).digest('hex') !== video.sha256) {
    throw new Error('Video provenance mismatch');
  }
}

export async function bounded(promise, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timeout (${timeoutMs}ms)`)), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

/** BrowserServer is an explicit owned process, not a discovered shared daemon. */
export async function closeBrowserOwner(owner, timeoutMs = 15000) {
  try {
    await bounded(owner.close(), timeoutMs, 'owned Chromium close');
    return { closed: true, forced: false };
  } catch (error) {
    await bounded(owner.kill(), 10000, 'owned Chromium kill');
    return { closed: true, forced: true, gracefulCloseError: String(error) };
  }
}

// Serialize these source-owned regression helpers together; production has no probe dependency.
const expression = (fn, argument) => `(() => {
  const browserLayoutReceipt = ${browserLayoutReceipt.toString()};
  const motionReceipt = ${motionReceipt.toString()};
  const startLivePan = ${startLivePan.toString()};
  return (${fn.toString()})(${JSON.stringify(argument)});
})()`;

async function acquireCase(page, context, testCase, base, row, saveCapture, write) {
  const evaluate = (fn, arg, timeout = 30000) => bounded(page.evaluate(expression(fn, arg)), timeout, fn.name);
  await page.addInitScript(value => { window.__ENV_REQUEST = value; }, testCase);
  await page.goto(`${base}/?debug=1&nosplash=1&tier=${testCase.tier}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__GAME_READY === true && !!window.__DEBUG?.beginSoloBattle);
  row.boot = await evaluate(browserLayoutReceipt); write(`${row.id}-boot.json`, row.boot);
  await evaluate(() => window.__DEBUG.bus.emit('ui:debugHud', { on: false }));
  await evaluate(({ mapId }) => window.__DEBUG.beginSoloBattle({ specId: 'm1a2', mapId, randomRoster: false }), testCase, 180000);
  await page.waitForFunction(() => window.__DEBUG.game.phase === 'battle'
    && window.__DEBUG.game.preBattleS <= 0 && window.__DEBUG.game.timeS > 0);
  await evaluate(async () => {
    const state = window.__DEBUG.world.minimapTextureState;
    if (!state?.promise) throw new Error('Missing authored photo readiness');
    await state.promise;
    if (!state.settled || !state.results?.length || state.results.some(r => !r.applied || r.failures.length)) {
      throw new Error('Sourced textures did not apply');
    }
  }, undefined, 90000);
  row.selection = await evaluate(prepareLivePan, testCase);
  await page.waitForTimeout(1500); // Fixed pre-pan settle, never warm-until-pass.
  const capture = await evaluate(captureRenderedFrames, { pan: true }, 25000);
  saveCapture(capture);
  row.quality = capture.quality;
  row.submittedFrames = capture.submittedFrames; row.positiveDtS = capture.positiveDtS;
  row.errors.push(...validateLiveSequence(capture, testCase));
  if (row.errors.length) return;
  row.livePass = true;
  if (!testCase.scope) return;
  await evaluate(() => { window.__DEBUG.shotMode = true; });
  try {
    row.scope = await evaluate(stageHorizonScopeCapture, { mapId: testCase.mapId, ndcX: 0, ndcY: 0 });
    const scope = await evaluate(captureRenderedFrames, { label: 'scope8' }); saveCapture(scope);
    const receipt = scope.frames[0].receipt;
    write(`${row.id}-scope8.contract.json`, { ...row.scope, receipt, cadenceEvidence: false });
    row.errors.push(...validateScopeReceipt(receipt, testCase));
  } finally {
    if (row.scope) await evaluate(restoreHorizonArcadeCapture, row.scope.arcade);
    await evaluate(() => { window.__DEBUG.shotMode = false; });
    await evaluate(prepareLivePan, testCase);
  }
  if (row.errors.length) return;
  row.resizes = [];
  const alternate = testCase.device === 'desktop' ? { ...testCase, dpr: 2 }
    : { ...testCase, width: testCase.height, height: testCase.width };
  const cdp = await context.newCDPSession(page);
  try {
    for (const [label, size] of [['alternate', alternate], ['restored', testCase]]) {
      await page.setViewportSize({ width: size.width, height: size.height });
      if (testCase.device === 'desktop') {
        // Change browser DPR, not renderer dimensions or runtime adaptation.
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height,
          deviceScaleFactor: size.dpr, mobile: false });
      }
      await page.waitForTimeout(1000);
      const resize = await evaluate(captureRenderedFrames, { label: `resize-${label}` }); saveCapture(resize);
      const receipt = resize.frames[0].receipt;
      row.resizes.push(receipt); row.errors.push(...validateMotionReceipt(receipt, size));
    }
  } finally { await cdp.detach(); }
}

async function runCase(browser, testCase, base, output, report, write) {
  const id = `${testCase.device}/${testCase.mapId}`;
  fs.mkdirSync(path.join(output, testCase.device), { recursive: true });
  const row = { ...testCase, id, startedAt: new Date().toISOString(), receipts: [], errors: [] };
  report.cases.push(row);
  const options = contextOptions(testCase, base, path.join(output, testCase.device, `raw-${testCase.mapId}`));
  const context = await browser.newContext(options);
  let page, video;
  const logs = [];
  const saveCapture = capture => {
    if (capture.frames[0]?.label === 'start') {
      row.quality = capture.quality; row.submittedFrames = capture.submittedFrames; row.positiveDtS = capture.positiveDtS;
    }
    for (const frame of capture.frames) {
      if (row.receipts.some(receipt => receipt.label === frame.label)) continue;
      const buffer = decodeFramePng(frame), file = `${id}-${frame.label}.png`;
      fs.writeFileSync(path.join(output, file), buffer);
      write(`${id}-${frame.label}.json`, frame.receipt);
      row.receipts.push({ label: frame.label, receipt: frame.receipt, capturedAfterRealRender: frame.capturedAfterRealRender,
        png: { file, bytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex') } });
    }
  };
  try {
    context.setDefaultTimeout(180000); context.setDefaultNavigationTimeout(180000);
    row.pageCreationHostMs = Date.now();
    page = await context.newPage(); video = page.video();
    row.pageCreatedHostMs = Date.now();
    page.on('console', message => {
      logs.push({ type: message.type(), text: message.text(), timestamp: Date.now(), location: message.location() });
      if (message.type() === 'error') row.errors.push(`console: ${message.text()}`);
    });
    page.on('pageerror', error => { logs.push({ type: 'pageerror', text: String(error), timestamp: Date.now() }); row.errors.push(String(error)); });
    page.on('crash', () => row.errors.push('Page crashed'));
    page.on('requestfailed', request => row.errors.push(`request failed: ${request.url()}: ${request.failure()?.errorText}`));
    page.on('response', response => { if (response.status() >= 400) row.errors.push(`HTTP ${response.status()}: ${response.url()}`); });
    console.log(`[motion] pid=${process.pid} ${id} context/video owned`);
    await bounded(acquireCase(page, context, testCase, base, row, saveCapture, write), 420000, id);
  } catch (error) { row.errors.push(String(error)); }
  finally {
    if (page && !page.isClosed()) {
      try {
        const partial = await bounded(page.evaluate(() => window.__ENV_CAPTURE_RESULT ?? null), 5000, 'partial frames');
        if (partial) saveCapture(partial);
        row.finalLayout = await bounded(page.evaluate(expression(browserLayoutReceipt)), 5000, 'final layout');
      } catch (error) { row.errors.push(`partial evidence: ${error}`); }
    }
    // Context close owns both page disposal and video finalization. No CLI recorder state exists.
    try { await bounded(context.close(), 30000, 'context/video close'); row.contextClosed = true; }
    catch (error) { row.errors.push(String(error)); }
    if (video && row.contextClosed) {
      try {
        const target = path.join(output, `${id}.webm`);
        // saveAs is the supported artifact transfer for BrowserType.connect;
        // video.path intentionally throws for a connected browser.
        await bounded(video.saveAs(target), 30000, 'video save');
        const metadata = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries',
          'format=duration:stream=codec_name,width,height', '-of', 'json', target], { encoding: 'utf8', timeout: 10000 }));
        row.video = { path: target, file: `${id}.webm`, bytes: fs.statSync(target).size, metadata,
          sha256: createHash('sha256').update(fs.readFileSync(target)).digest('hex'),
          size: options.recordVideo.size, includesBootStaging: true, recordedAtCssResolution: true };
        const stream = metadata.streams[0];
        row.video.verified = row.video.bytes > 0 && Number(metadata.format.duration) >= 8
          && stream.width === options.recordVideo.size.width && stream.height === options.recordVideo.size.height;
        if (!row.video.verified) row.errors.push('Video dimensions/duration invalid');
      } catch (error) { row.errors.push(`video evidence: ${error}`); }
    } else row.errors.push('Missing finalized recording');
    row.endedAt = new Date().toISOString(); write(`${id}-console.json`, logs);
    write('receipts.json', report);
    console.log(`[motion] ${id} ${row.errors.length ? 'FAIL ' + row.errors.join('; ') : 'acquired'}`);
  }
  return row;
}

export async function runMotionProbe({ root, output, cases, playwrightModule, expectedBuildIndexHash, oneCaseReport, oneCaseEvidenceDir }) {
  if (fs.existsSync(output)) throw new Error(`Refusing to overwrite evidence directory: ${output}`);
  if (!/^[a-f0-9]{64}$/.test(expectedBuildIndexHash ?? '')) {
    throw new Error('An exact --expected-build-index-hash of the approved dist is required');
  }
  const buildHash = () => createHash('sha256').update(fs.readFileSync(path.join(root, 'dist/index.html'))).digest('hex');
  const hash = buildHash();
  if (expectedBuildIndexHash !== hash) {
    throw new Error('An exact --expected-build-index-hash of the approved dist is required');
  }
  if (cases.length > 1) validateOneCaseGate(oneCaseReport, hash, oneCaseEvidenceDir);
  const { chromium } = await import(playwrightModule ? pathToFileURL(path.resolve(playwrightModule)).href : 'playwright');
  const report = { protocol: MOTION_PROTOCOL, visualOnly: true, physicalSafari: false,
    environment: 'Headless Chromium desktop/mobile emulation; no frame-time or physical-device certification',
    source: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    buildIndexHash: hash, expectedBuildIndexHash, playwrightModule: playwrightModule ?? 'playwright',
    acquisitionHash: motionAcquisitionHash(),
    pid: process.pid, cases: [], errors: [], startedAt: new Date().toISOString() };
  let server, refresh, browser, browserOwner;
  fs.mkdirSync(output, { recursive: true });
  const write = (file, value) => fs.writeFileSync(path.join(output, file), `${JSON.stringify(value, null, 2)}\n`);
  const interrupt = signal => {
    report.errors.push(`Interrupted by ${signal}`);
    if (browser) void browser.close().catch(error => report.errors.push(String(error)));
  };
  const onTerm = () => interrupt('SIGTERM'), onInt = () => interrupt('SIGINT');
  process.once('SIGTERM', onTerm); process.once('SIGINT', onInt);
  try {
    await acquireCaptureLock(20 * 60 * 1000);
    refresh = setInterval(refreshCaptureLock, 60_000); refresh.unref();
    if (report.errors.length || buildHash() !== hash) throw new Error('Interrupted or approved build changed before launch');
    server = await preview({ root, logLevel: 'error', preview: { host: '127.0.0.1', port: 5876, strictPort: true } });
    browserOwner = await chromium.launchServer({ headless: true, channel: 'chromium',
      args: ['--use-gl=angle', '--enable-webgl'], host: '127.0.0.1', timeout: 30000 });
    browser = await chromium.connect(browserOwner.wsEndpoint(), { timeout: 30000 });
    report.browser = { version: browser.version(), executable: chromium.executablePath(),
      channel: 'chromium', headless: 'new', args: ['--use-gl=angle', '--enable-webgl'],
      pid: browserOwner.process().pid };
    console.log(`[motion] pid=${process.pid} browserPid=${report.browser.pid} preview=http://127.0.0.1:5876 browser=${browser.version()}`);
    for (const testCase of cases) {
      const row = await runCase(browser, testCase, 'http://127.0.0.1:5876', output, report, write);
      if (buildHash() !== hash) row.errors.push('Production build changed during capture');
      // Acquisition failures stay failed; never fan them out into eight duplicate cases.
      if (row.errors.length) break;
    }
  } catch (error) { report.errors.push(String(error)); }
  finally {
    try {
      if (browserOwner) report.browserCleanup = await closeBrowserOwner(browserOwner);
      report.browserClosed = true;
      if (report.browserCleanup?.forced) report.errors.push(report.browserCleanup.gracefulCloseError);
    }
    catch (error) { report.errors.push(String(error)); }
    if (server) {
      server.httpServer.closeAllConnections();
      await bounded(new Promise(resolve => server.httpServer.close(resolve)), 10000, 'preview close')
        .then(() => { report.serverClosed = true; }, error => report.errors.push(String(error)));
    }
    clearInterval(refresh); releaseCaptureLock(); report.lockReleased = true;
    process.removeListener('SIGTERM', onTerm); process.removeListener('SIGINT', onInt);
    report.complete = report.cases.length === cases.length && !report.errors.length
      && report.cases.every(row => row.livePass && row.video?.verified && !row.errors.length);
    report.endedAt = new Date().toISOString(); write('receipts.json', report);
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const value = (name, fallback) => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
  const matrix = process.argv.includes('--matrix'), only = value('case', 'desktop/winter');
  const cases = matrix ? MOTION_CASES : MOTION_CASES.filter(row => `${row.device}/${row.mapId}` === only);
  if (!cases.length) throw new Error(`Unknown motion case: ${only}`);
  const oneCasePath = value('one-case-report');
  const report = await runMotionProbe({ root: path.resolve(value('root', process.cwd())),
    output: path.resolve(value('out', 'environment-motion-shots')), cases,
    expectedBuildIndexHash: value('expected-build-index-hash'), playwrightModule: value('playwright-module'),
    oneCaseReport: oneCasePath ? JSON.parse(fs.readFileSync(oneCasePath, 'utf8')) : undefined,
    oneCaseEvidenceDir: oneCasePath ? path.dirname(path.resolve(oneCasePath)) : undefined });
  console.log(`[motion] ${report.complete ? 'ACQUIRED' : 'FAIL'} ${report.cases.length}/${cases.length} cases`);
  if (!report.complete) process.exitCode = 1;
}
