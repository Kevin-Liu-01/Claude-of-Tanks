import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  bootCapabilityScreen, capabilitySummary, classifyMemory, classifyRendererFamily, evaluateCapabilityGate,
  presentCapabilityVerdict, probeCapabilities, runBootCapabilityGate, TERRAIN_SAMPLERS_BUILTIN_DESKTOP,
  TERRAIN_SAMPLERS_DECLARED, TERRAIN_TEXTURE_UNITS_REQUIRED,
} from './capabilityGate.ts';
import { createEntryTelemetry } from '../entry/telemetry.ts';
import { validateTelemetryRecord } from '../../server/telemetryRecord.ts';

// The gate is exercised with a fake canvas/context host: every verdict
// (no WebGL2, refused context, too few texture units, software rasteriser,
// blocked storage, blocked worker) is driven end to end into the screen
// targets and the beacon, with no browser.

const t = (key, vars = {}) => `${key}${Object.keys(vars).length ? ' ' + JSON.stringify(vars) : ''}`;

function fakeContext({ units = 16, size = 8192, vertexUnits = 16, renderer = 'ANGLE (Apple, Apple M2, OpenGL 4.1)',
  colorFloat = true, unmasked = true, lost = [] } = {}) {
  const gl = {
    MAX_TEXTURE_IMAGE_UNITS: 0x8872, MAX_TEXTURE_SIZE: 0x0D33, MAX_VERTEX_TEXTURE_IMAGE_UNITS: 0x8B4C, RENDERER: 0x1F01,
    getParameter(name) {
      if (name === 0x8872) return units;
      if (name === 0x0D33) return size;
      if (name === 0x8B4C) return vertexUnits;
      if (name === 0x1F01) return 'WebGL Renderer (masked)';
      if (name === 0x9246) return renderer;
      return null;
    },
    getExtension(name) {
      if (name === 'EXT_color_buffer_float') return colorFloat ? {} : null;
      if (name === 'WEBGL_debug_renderer_info') return unmasked ? { UNMASKED_RENDERER_WEBGL: 0x9246 } : null;
      if (name === 'WEBGL_lose_context') return { loseContext: () => lost.push('lost') };
      return null;
    },
  };
  return gl;
}

function host({ context = fakeContext(), throwOnContext = null, storage = 'ok', worker = 'ok', deviceMemory = 8 } = {}) {
  const store = new Map();
  return {
    createCanvas: () => ({ getContext(name) {
      assert.equal(name, 'webgl2', 'the probe asks for WebGL2 only');
      if (throwOnContext) throw throwOnContext;
      return context;
    } }),
    deviceMemory,
    storage: storage === 'none' ? null : {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => { if (storage === 'blocked') throw new Error('QuotaExceeded'); store.set(key, value); },
      removeItem: (key) => store.delete(key),
    },
    probeWorker: () => { if (worker === 'throws') throw new Error('Worker blocked by CSP'); return worker === 'ok'; },
    store,
  };
}

{
  const lost = [];
  const h = host({ context: fakeContext({ lost }) });
  const probe = probeCapabilities(h);
  assert.deepEqual(probe, {
    webgl2: true, contextError: null, renderer: 'ANGLE (Apple, Apple M2, OpenGL 4.1)', rendererFamily: 'apple',
    software: false, maxTextureUnits: 16, maxTextureSize: 8192, vertexTextureUnits: 16, colorBufferFloat: true,
    storage: true, worker: true, memoryClass: 'high',
  });
  assert.deepEqual(lost, ['lost'], 'the throwaway context is released');
  assert.equal(h.store.size, 0, 'the storage probe leaves nothing behind');
  const verdict = evaluateCapabilityGate(probe, t);
  assert.deepEqual(verdict, { kind: 'proceed', notices: [] });
}

{
  const probe = probeCapabilities(host({ context: null }));
  assert.equal(probe.webgl2, false);
  assert.equal(probe.contextError, null);
  const verdict = evaluateCapabilityGate(probe, t);
  assert.equal(verdict.kind, 'stop');
  assert.equal(verdict.code, 'no_webgl2');
  assert.equal(verdict.message, 'boot.gate.noWebgl2');
  assert.equal(verdict.action, 'boot.gate.actionRetry');
  assert.equal(verdict.retry, true);
}

{
  const probe = probeCapabilities(host({ throwOnContext: new Error('Could not create a WebGL context') }));
  assert.equal(probe.webgl2, false);
  assert.equal(probe.contextError, 'Could not create a WebGL context');
  const verdict = evaluateCapabilityGate(probe, t);
  assert.equal(verdict.code, 'context_refused', 'a throwing context request is a refusal, not a missing feature');
  assert.equal(verdict.retry, true);
}

{
  const probe = probeCapabilities(host({ context: fakeContext({ units: 8 }) }));
  const verdict = evaluateCapabilityGate(probe, t);
  assert.equal(verdict.kind, 'stop');
  assert.equal(verdict.code, 'texture_units');
  assert.equal(verdict.message, `boot.gate.textureUnits {"units":8,"needed":${TERRAIN_TEXTURE_UNITS_REQUIRED}}`,
    'the sentence names the exposed and the required unit counts');
  assert.equal(verdict.retry, false);
  assert.equal(evaluateCapabilityGate(probe, t, 8).kind, 'proceed', 'the requirement is a port');
  assert.equal(evaluateCapabilityGate(probeCapabilities(host({ context: fakeContext({ units: 16 }) })), t).kind, 'proceed',
    'exactly the required count (the WebGL2 minimum) proceeds');
  assert.equal(evaluateCapabilityGate(probeCapabilities(host({ context: fakeContext({ units: 15 }) })), t).code, 'texture_units',
    'one unit short of the desktop terrain program stops with the reason');
}
assert.equal(TERRAIN_SAMPLERS_DECLARED, 10, 'terrain.ts declares ten samplers (uAlbG/D/R/M, uNrmG/D/R/M, uMask, uNoise)');
assert.equal(TERRAIN_SAMPLERS_BUILTIN_DESKTOP, 6, 'envMap, dfgLUT and four desktop CSM cascade shadow maps (2026-09-25 linked-program census)');
assert.equal(TERRAIN_TEXTURE_UNITS_REQUIRED, 16, 'the desktop terrain fragment stage binds all 16 WebGL2-minimum units');
const terrainSource = await readFile(new URL('../world/terrain.ts', import.meta.url), 'utf8');
const declared = terrainSource.match(/^uniform sampler2D [^;]+;/gm) ?? [];
assert.equal(declared.flatMap((line) => line.replace(/^uniform sampler2D /, '').replace(/;$/, '').split(',')).length,
  TERRAIN_SAMPLERS_DECLARED, 'the declared sampler count tracks terrain.ts');
const lightingSource = await readFile(new URL('./lighting.ts', import.meta.url), 'utf8');
assert.match(lightingSource, /const CASCADES = 4;/, 'the desktop cascade count the requirement assumes');

{
  const probe = probeCapabilities(host({ context: fakeContext({ renderer: 'Google SwiftShader' }), storage: 'blocked',
    worker: 'throws', deviceMemory: 2 }));
  assert.equal(probe.software, true);
  assert.equal(probe.rendererFamily, 'software');
  assert.equal(probe.storage, false);
  assert.equal(probe.worker, false);
  assert.equal(probe.memoryClass, 'low');
  const verdict = evaluateCapabilityGate(probe, t);
  assert.equal(verdict.kind, 'proceed', 'software rendering, blocked storage and blocked workers never stop the boot');
  assert.deepEqual(verdict.notices.map(({ code }) => code), ['software_rendering', 'storage_blocked', 'worker_blocked']);
  const masked = probeCapabilities(host({ context: fakeContext({ unmasked: false, colorFloat: false }), storage: 'none' }));
  assert.equal(masked.renderer, 'WebGL Renderer (masked)');
  assert.equal(masked.rendererFamily, 'unknown');
  assert.equal(masked.colorBufferFloat, false);
  assert.equal(masked.storage, false, 'no storage object at all is a blocked store');
}

for (const [renderer, family] of [
  ['ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'nvidia'],
  ['ANGLE (AMD, AMD Radeon Pro 5500M, OpenGL 4.1)', 'amd'],
  ['ANGLE (Intel, Intel(R) Iris(TM) Plus Graphics 640, OpenGL 4.1)', 'intel'],
  ['Apple GPU', 'apple'], ['Mali-G78 MP14', 'arm'], ['Adreno (TM) 650', 'qualcomm'], ['PowerVR Rogue GE8320', 'imagination'],
  ['Google SwiftShader', 'software'], ['llvmpipe (LLVM 15.0.7, 256 bits)', 'software'], ['', 'unknown'], ['Something new', 'unknown'],
]) assert.equal(classifyRendererFamily(renderer), family, renderer);
assert.deepEqual([classifyMemory(undefined), classifyMemory(1), classifyMemory(4), classifyMemory(8)], ['unknown', 'low', 'mid', 'high']);

{
  const probe = probeCapabilities(host());
  const summary = capabilitySummary(probe, { tier: 'desktop', autoTier: 'high' });
  assert.deepEqual(summary, {
    webgl2: true, rendererFamily: 'apple', software: false, maxTextureUnits: 16, maxTextureSize: 8192,
    vertexTextureUnits: 16, colorBufferFloat: true, storage: true, worker: true, memoryClass: 'high',
    tier: 'desktop', autoTier: 'high', requiredTextureUnits: 16,
  }, 'the beacon summary carries families, limits and classes only');
  assert.equal('renderer' in summary, false, 'the raw renderer string never reaches the beacon');
  // Telemetry v2 (2026-09-25): the capability summary rides inside the one session record; the shared validator keeps it whole.
  const bodies = [];
  const client = createEntryTelemetry({
    build: 'dev', sessionId: 'sess_capability', now: () => 10_000,
    endpoints: { session: '/api/telemetry', error: '/api/telemetry' },
    transport: (endpoint, body) => { bodies.push(JSON.parse(body)); return true; }, schedule: () => 1, cancel: () => {},
  });
  assert.equal(client.send({ kind: 'capability', outcome: 'ok', capability: summary }), true);
  client.flush();
  const validation = validateTelemetryRecord(bodies[0]);
  assert.equal(validation.ok, true, `the shared validator accepts the session record: ${JSON.stringify(validation)}`);
  assert.deepEqual(validation.record.cap, summary, 'the server keeps every summary field');
}

{
  const screen = (present = true) => present ? {
    stage: { textContent: 'Starting engine' },
    retry: { textContent: 'Retry loading', classes: [], classList: { add(name) { screen.last.retry.classes.push(name); } }, onclick: null },
    notice: { textContent: '', classes: [], classList: { add(name) { screen.last.notice.classes.push(name); } } },
  } : { stage: null, retry: null, notice: null };
  const s = screen(); screen.last = s;
  let reloads = 0;
  presentCapabilityVerdict({ kind: 'stop', code: 'no_webgl2', message: 'no webgl2', action: 'Retry', retry: true,
    notices: [{ code: 'storage_blocked', message: 'storage blocked' }] }, s, () => { reloads += 1; });
  assert.equal(s.stage.textContent, 'no webgl2', 'the sentence replaces the stage line');
  assert.equal(s.retry.textContent, 'Retry');
  assert.deepEqual(s.retry.classes, ['on']);
  s.retry.onclick();
  assert.equal(reloads, 1, 'a retryable stop reloads through the action button');
  assert.equal(s.notice.textContent, 'storage blocked');
  assert.deepEqual(s.notice.classes, ['on']);
  const noRetry = screen(); screen.last = noRetry;
  presentCapabilityVerdict({ kind: 'stop', code: 'texture_units', message: 'few units', action: 'Other browser', retry: false,
    notices: [] }, noRetry, () => assert.fail('a non-retryable stop must not reload'));
  assert.equal(noRetry.retry.onclick, null);
  presentCapabilityVerdict({ kind: 'proceed', notices: [{ code: 'software_rendering', message: 'software' }] }, screen(false),
    () => {});
  const stripped = bootCapabilityScreen({ getElementById: () => null });
  assert.deepEqual(stripped, { stage: null, retry: null, notice: null }, 'a stripped document has no targets and no throw');
}

{
  const sent = [];
  const halts = [];
  const screenState = { stage: { textContent: '' }, retry: { textContent: '', classList: { add() {} }, onclick: null },
    notice: { textContent: '', classList: { add() {} } } };
  const stopped = runBootCapabilityGate({
    translate: t, send: (event) => sent.push(event), screen: screenState, host: host({ context: null }),
    halt: (code, message) => halts.push([code, message]), reload: () => {},
  });
  let settled = false;
  stopped.then(() => { settled = true; }, () => { settled = true; });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(settled, false, 'a hard stop never resolves: the module body stops on the boot screen instead of throwing');
  assert.deepEqual(halts, [['no_webgl2', 'boot.gate.noWebgl2']], 'the inline watchdog is told the boot is deliberately halted');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].kind, 'capability');
  assert.equal(sent[0].outcome, 'halted');
  assert.equal(sent[0].code, 'no_webgl2');
  assert.equal(sent[0].capability.webgl2, false);
  assert.equal(screenState.stage.textContent, 'boot.gate.noWebgl2');
  const proceed = await runBootCapabilityGate({
    translate: t, send: () => assert.fail('a clean probe sends nothing from the gate'), screen: screenState,
    host: host(), halt: () => assert.fail('a clean probe never halts'), reload: () => {},
  });
  assert.equal(proceed.verdict.kind, 'proceed');
  assert.equal(proceed.probe.maxTextureUnits, 16);
}

const mainSource = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
const gateIndex = mainSource.indexOf('await runBootCapabilityGate({');
const rendererIndex = mainSource.indexOf('createRenderer(container)');
assert.ok(gateIndex > 0 && rendererIndex > gateIndex, 'the gate runs before the real renderer is constructed');
assert.match(mainSource.slice(gateIndex, rendererIndex), /halt: \(code, message\) => window\.__COT_BOOT_RECOVERY\?\.halt\?\.\(code, message\)/,
  'a hard stop halts the inline chunk-recovery watchdog');
const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
assert.match(html, /id="cot-boot-notice"/, 'the boot screen carries the one-line notice target');
assert.match(html, /function halt\(code, message\)/, 'the inline watchdog exposes halt()');

console.log('capabilityGate.selftest: probe, verdicts, notices, beacon summary and halting stop pass');
