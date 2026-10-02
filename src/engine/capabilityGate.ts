/**
 * capabilityGate.ts — the pre-renderer capability probe and its verdict
 * (docs/ENTRY-RESILIENCE.md, phase 0 deliverable 2).
 *
 * Before `createRenderer` pays for the real WebGL2 context, a throwaway
 * context answers the questions whose failures used to surface as two silent
 * reloads and "A game file did not load": is WebGL2 there at all, did the
 * driver refuse a context, how many texture units does the fragment stage
 * expose (the terrain material binds a fixed number), which renderer family
 * is this, is storage usable, can a worker start. Each hard failure maps to
 * one sentence and one action on the inline boot screen and one beacon.
 *
 * The verdict is cached (2026-10-02): a repeat boot of the same browser skips
 * the throwaway context and the worker probe. A record is written only after
 * the real renderer came up and confirmed it (`confirmBootCapability`), is
 * keyed by `CAPABILITY_CACHE_VERSION`, the user agent, the device memory and
 * the texture-unit requirement, expires after `CAPABILITY_CACHE_MAX_AGE_MS`,
 * and is checked again against the real context's unmasked renderer and
 * limits on every boot that used it; a mismatch drops it and re-evaluates
 * the gate on the real context. Hard stops are never cached. `?gate=fresh`
 * forces a probe and clears the record; a renderer that throws after a
 * cached verdict clears it too.
 */
import type { RuntimeValue } from '../runtimeTypes.ts';

/**
 * Samplers the terrain fragment program binds (src/world/terrain.ts, the
 * 16-sampler rule), measured on the linked program in production Chrome
 * (2026-09-25, `gl.getActiveUniform` census): 10 declared by the material —
 * uAlbG/uAlbD/uAlbR/uAlbM, uNrmG/uNrmD/uNrmR/uNrmM, uMask, uNoise — plus
 * three.js's own `envMap` (the scene environment), `dfgLUT` (the PBR
 * split-sum lookup) and `directionalShadowMap[n]`, one per CSM cascade
 * (src/engine/lighting.ts CASCADES = 4 on desktop, 3 on the mobile tier).
 * That is 16 on desktop — exactly the WebGL2 minimum for
 * MAX_TEXTURE_IMAGE_UNITS — and 15 on mobile. The gate runs before the tier
 * is known and asks for the desktop figure: a driver reporting fewer than 16
 * is below the specification and cannot link the terrain either way.
 */
export const TERRAIN_SAMPLERS_DECLARED = 10;
export const TERRAIN_SAMPLERS_BUILTIN_DESKTOP = 1 + 1 + 4;
export const TERRAIN_TEXTURE_UNITS_REQUIRED = TERRAIN_SAMPLERS_DECLARED + TERRAIN_SAMPLERS_BUILTIN_DESKTOP;

type RendererFamily =
  | 'nvidia' | 'amd' | 'intel' | 'apple' | 'arm' | 'qualcomm' | 'imagination' | 'software' | 'unknown';
type MemoryClass = 'low' | 'mid' | 'high' | 'unknown';

interface CapabilityProbe {
  webgl2: boolean;
  /** The exception message when the context request threw, else null. */
  contextError: string | null;
  /** Raw renderer string; kept for the diagnostics overlay, never beaconed. */
  renderer: string;
  rendererFamily: RendererFamily;
  software: boolean;
  maxTextureUnits: number;
  maxTextureSize: number;
  vertexTextureUnits: number;
  colorBufferFloat: boolean;
  storage: boolean;
  worker: boolean;
  memoryClass: MemoryClass;
}

interface CapabilityNotice { code: string; message: string }

type CapabilityVerdict =
  | { kind: 'proceed'; notices: CapabilityNotice[] }
  | { kind: 'stop'; code: string; message: string; action: string; retry: boolean; notices: CapabilityNotice[] };

type Translate = (key: string, vars?: Record<string, string | number>) => string;

interface ProbeCanvasContext {
  getParameter(name: number): RuntimeValue;
  getExtension(name: string): RuntimeValue;
  MAX_TEXTURE_IMAGE_UNITS: number;
  MAX_TEXTURE_SIZE: number;
  MAX_VERTEX_TEXTURE_IMAGE_UNITS: number;
  RENDERER: number;
}

interface CapabilityProbeHost {
  createCanvas(): { getContext(name: string, attributes?: Record<string, RuntimeValue>): RuntimeValue } | null;
  deviceMemory?: number;
  storage?: { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void } | null;
  /** Start and stop a trivial worker; throw or return false when workers are blocked. */
  probeWorker(): boolean;
  /** Part of the cached verdict's key; absent means the verdict is never cached. */
  userAgent?: string;
  /** Wall clock for the record's age (ms). */
  now?(): number;
  /** `?gate=fresh`: probe even when a record exists, and clear it. */
  fresh?: boolean;
}

/** Bump when the probe, the verdict rules or the record shape change: every cached verdict is then ignored. */
export const CAPABILITY_CACHE_VERSION = 1;
const CAPABILITY_CACHE_STORAGE_KEY = 'cot.capability.verdict';
/** A record older than this probes again (a driver, setting or GPU change that keeps the user agent). */
export const CAPABILITY_CACHE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

type CapabilitySource = 'probe' | 'cache' | 'context';

/** The probe fields a record keeps; storage and memory are read fresh on every boot. */
type CachedProbeFields = Pick<CapabilityProbe, 'renderer' | 'maxTextureUnits' | 'maxTextureSize' | 'vertexTextureUnits'
  | 'colorBufferFloat' | 'worker'>;

interface CapabilityRecord {
  v: number;
  key: string;
  savedAt: number;
  probe: CachedProbeFields;
}

/** Everything outside the record that can change the verdict: the gate version, browser, memory class and requirement. */
export function capabilityCacheKey(host: Pick<CapabilityProbeHost, 'userAgent' | 'deviceMemory'>,
  requiredTextureUnits = TERRAIN_TEXTURE_UNITS_REQUIRED): string | null {
  if (typeof host.userAgent !== 'string' || !host.userAgent) return null;
  return JSON.stringify([CAPABILITY_CACHE_VERSION, host.userAgent, classifyMemory(host.deviceMemory), requiredTextureUnits]);
}

const isCount = (value: RuntimeValue): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

/** The record for this key, or null when it is missing, foreign, expired, corrupt or would not proceed. */
export function readCachedCapability(
  host: Pick<CapabilityProbeHost, 'storage' | 'userAgent' | 'deviceMemory' | 'now'>,
  requiredTextureUnits = TERRAIN_TEXTURE_UNITS_REQUIRED,
): CachedProbeFields | null {
  const key = capabilityCacheKey(host, requiredTextureUnits);
  if (!key || !host.storage) return null;
  let raw: string | null = null;
  try { raw = host.storage.getItem(CAPABILITY_CACHE_STORAGE_KEY); } catch (_) { return null; }
  if (!raw) return null;
  let record: Partial<CapabilityRecord> | null = null;
  try { record = JSON.parse(raw) as Partial<CapabilityRecord>; } catch (_) { record = null; }
  const probe = record?.probe as Partial<Record<keyof CachedProbeFields, RuntimeValue>> | undefined;
  const now = host.now?.() ?? Date.now();
  const valid = !!record && record.v === CAPABILITY_CACHE_VERSION && record.key === key
    && typeof record.savedAt === 'number' && record.savedAt <= now && now - record.savedAt < CAPABILITY_CACHE_MAX_AGE_MS
    && !!probe && typeof probe.renderer === 'string' && isCount(probe.maxTextureUnits) && isCount(probe.maxTextureSize)
    && isCount(probe.vertexTextureUnits) && typeof probe.colorBufferFloat === 'boolean' && typeof probe.worker === 'boolean'
    && probe.maxTextureUnits >= requiredTextureUnits;
  if (!valid || !probe) {
    clearCachedCapability(host.storage);
    return null;
  }
  return {
    renderer: probe.renderer as string, maxTextureUnits: probe.maxTextureUnits as number,
    maxTextureSize: probe.maxTextureSize as number, vertexTextureUnits: probe.vertexTextureUnits as number,
    colorBufferFloat: probe.colorBufferFloat as boolean, worker: probe.worker as boolean,
  };
}

/** Store a proceeding probe under this browser's key; false when storage refuses (never throws). */
export function writeCachedCapability(
  host: Pick<CapabilityProbeHost, 'storage' | 'userAgent' | 'deviceMemory' | 'now'>,
  probe: CapabilityProbe,
  requiredTextureUnits = TERRAIN_TEXTURE_UNITS_REQUIRED,
): boolean {
  const key = capabilityCacheKey(host, requiredTextureUnits);
  if (!key || !host.storage || !probe.webgl2) return false;
  const record: CapabilityRecord = {
    v: CAPABILITY_CACHE_VERSION, key, savedAt: host.now?.() ?? Date.now(),
    probe: { renderer: probe.renderer, maxTextureUnits: probe.maxTextureUnits, maxTextureSize: probe.maxTextureSize,
      vertexTextureUnits: probe.vertexTextureUnits, colorBufferFloat: probe.colorBufferFloat, worker: probe.worker },
  };
  try { host.storage.setItem(CAPABILITY_CACHE_STORAGE_KEY, JSON.stringify(record)); return true; } catch (_) { return false; }
}

/** Remove the record (never throws). */
export function clearCachedCapability(storage: CapabilityProbeHost['storage']): void {
  try { storage?.removeItem(CAPABILITY_CACHE_STORAGE_KEY); } catch (_) { /* nothing cached is the safe state */ }
}

/** The probe a cached record stands for: its GPU fields, with storage and memory read now. */
function cachedProbe(cached: CachedProbeFields, host: CapabilityProbeHost): CapabilityProbe {
  const rendererFamily = classifyRendererFamily(cached.renderer);
  return {
    webgl2: true, contextError: null, renderer: cached.renderer, rendererFamily, software: rendererFamily === 'software',
    maxTextureUnits: cached.maxTextureUnits, maxTextureSize: cached.maxTextureSize, vertexTextureUnits: cached.vertexTextureUnits,
    colorBufferFloat: cached.colorBufferFloat, storage: probeStorage(host.storage), worker: cached.worker,
    memoryClass: classifyMemory(host.deviceMemory),
  };
}

export function classifyRendererFamily(renderer: string): RendererFamily {
  const text = String(renderer || '').toLowerCase();
  if (!text) return 'unknown';
  if (/swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen|lavapipe/.test(text)) return 'software';
  if (/nvidia|geforce|quadro|rtx/.test(text)) return 'nvidia';
  if (/amd|radeon/.test(text)) return 'amd';
  if (/intel|iris|uhd graphics|hd graphics/.test(text)) return 'intel';
  if (/apple|m[1-4]\b/.test(text)) return 'apple';
  if (/mali|arm\b/.test(text)) return 'arm';
  if (/adreno|qualcomm/.test(text)) return 'qualcomm';
  if (/powervr|imagination/.test(text)) return 'imagination';
  return 'unknown';
}

export function classifyMemory(deviceMemory: number | undefined): MemoryClass {
  if (typeof deviceMemory !== 'number' || !Number.isFinite(deviceMemory)) return 'unknown';
  if (deviceMemory <= 2) return 'low';
  if (deviceMemory <= 4) return 'mid';
  return 'high';
}

function readInt(gl: ProbeCanvasContext, name: number, fallback: number): number {
  try {
    const value = gl.getParameter(name);
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  } catch (_) {
    return fallback;
  }
}

function probeStorage(storage: CapabilityProbeHost['storage']): boolean {
  if (!storage) return false;
  try {
    storage.setItem('cot.capability.probe', '1');
    storage.removeItem('cot.capability.probe');
    return true;
  } catch (_) {
    return false;
  }
}

/** Ask a throwaway WebGL2 context and the host what this browser can do. */
export function probeCapabilities(host: CapabilityProbeHost): CapabilityProbe {
  const probe: CapabilityProbe = {
    webgl2: false, contextError: null, renderer: '', rendererFamily: 'unknown', software: false,
    maxTextureUnits: 0, maxTextureSize: 0, vertexTextureUnits: 0, colorBufferFloat: false,
    storage: probeStorage(host.storage), worker: false, memoryClass: classifyMemory(host.deviceMemory),
  };
  try { probe.worker = host.probeWorker() === true; } catch (_) { probe.worker = false; }
  let gl: ProbeCanvasContext | null = null;
  try {
    const canvas = host.createCanvas();
    const context = canvas?.getContext('webgl2', { failIfMajorPerformanceCaveat: false, powerPreference: 'high-performance' });
    gl = context && typeof context === 'object' && 'getParameter' in context ? context as ProbeCanvasContext : null;
  } catch (error) {
    probe.contextError = error instanceof Error && error.message ? error.message : String(error || 'context refused');
  }
  if (!gl) return probe;
  probe.webgl2 = true;
  Object.assign(probe, readContextFields(gl));
  probe.rendererFamily = classifyRendererFamily(probe.renderer);
  probe.software = probe.rendererFamily === 'software';
  try {
    const lose = gl.getExtension('WEBGL_lose_context') as { loseContext?: () => void } | null;
    lose?.loseContext?.();
  } catch (_) { /* the throwaway context is garbage anyway */ }
  return probe;
}

/** The limits, float-target support and unmasked renderer of a live WebGL2 context (the probe's or the real one). */
function readContextFields(gl: ProbeCanvasContext): Omit<CachedProbeFields, 'worker'> {
  let colorBufferFloat = false;
  try { colorBufferFloat = !!gl.getExtension('EXT_color_buffer_float'); } catch (_) { /* optional */ }
  let renderer = '';
  try {
    const info = gl.getExtension('WEBGL_debug_renderer_info') as { UNMASKED_RENDERER_WEBGL?: number } | null;
    const reported = info && typeof info.UNMASKED_RENDERER_WEBGL === 'number'
      ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    renderer = typeof reported === 'string' ? reported : '';
  } catch (_) { renderer = ''; }
  return {
    renderer,
    maxTextureUnits: readInt(gl, gl.MAX_TEXTURE_IMAGE_UNITS, 0),
    maxTextureSize: readInt(gl, gl.MAX_TEXTURE_SIZE, 0),
    vertexTextureUnits: readInt(gl, gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS, 0),
    colorBufferFloat,
  };
}

/** Map a probe to one verdict: proceed, proceed with notices, or stop with one sentence and one action. */
export function evaluateCapabilityGate(
  probe: CapabilityProbe,
  translate: Translate,
  requiredTextureUnits = TERRAIN_TEXTURE_UNITS_REQUIRED,
): CapabilityVerdict {
  const notices: CapabilityNotice[] = [];
  if (!probe.storage) notices.push({ code: 'storage_blocked', message: translate('boot.gate.storageBlocked') });
  if (!probe.worker) notices.push({ code: 'worker_blocked', message: translate('boot.gate.workerBlocked') });
  if (!probe.webgl2) {
    return probe.contextError
      ? { kind: 'stop', code: 'context_refused', message: translate('boot.gate.contextRefused'),
        action: translate('boot.gate.actionRetry'), retry: true, notices }
      : { kind: 'stop', code: 'no_webgl2', message: translate('boot.gate.noWebgl2'),
        action: translate('boot.gate.actionRetry'), retry: true, notices };
  }
  if (probe.maxTextureUnits < requiredTextureUnits) {
    return { kind: 'stop', code: 'texture_units',
      message: translate('boot.gate.textureUnits', { units: probe.maxTextureUnits, needed: requiredTextureUnits }),
      action: translate('boot.gate.actionOtherBrowser'), retry: false, notices };
  }
  if (probe.software) notices.unshift({ code: 'software_rendering', message: translate('boot.gate.software') });
  return { kind: 'proceed', notices };
}

/** The anonymous capability summary the beacon carries (family, limits and classes only). */
export function capabilitySummary(
  probe: CapabilityProbe,
  { tier = 'unknown', autoTier = 'unknown', requiredTextureUnits = TERRAIN_TEXTURE_UNITS_REQUIRED }:
  { tier?: string; autoTier?: string; requiredTextureUnits?: number } = {},
): Record<string, string | number | boolean> {
  return {
    webgl2: probe.webgl2,
    rendererFamily: probe.rendererFamily,
    software: probe.software,
    maxTextureUnits: probe.maxTextureUnits,
    maxTextureSize: probe.maxTextureSize,
    vertexTextureUnits: probe.vertexTextureUnits,
    colorBufferFloat: probe.colorBufferFloat,
    storage: probe.storage,
    worker: probe.worker,
    memoryClass: probe.memoryClass,
    tier,
    autoTier,
    requiredTextureUnits,
  };
}

interface CapabilityScreen {
  stage: { textContent: string | null } | null;
  retry: { textContent: string | null; classList: { add(name: string): void }; onclick: (() => void) | null } | null;
  notice: { textContent: string | null; classList: { add(name: string): void } } | null;
}

/** Write the verdict onto the inline boot screen: the sentence on the stage line, the action on the retry button. */
export function presentCapabilityVerdict(
  verdict: CapabilityVerdict,
  screen: CapabilityScreen,
  onRetry: () => void,
): void {
  if (verdict.kind === 'stop') {
    if (screen.stage) screen.stage.textContent = verdict.message;
    if (screen.retry) {
      screen.retry.textContent = verdict.action;
      screen.retry.classList.add('on');
      screen.retry.onclick = verdict.retry ? onRetry : null;
    }
  }
  if (verdict.notices.length && screen.notice) {
    screen.notice.textContent = verdict.notices.map(({ message }) => message).join(' ');
    screen.notice.classList.add('on');
  }
}

interface BootCapabilityGateOptions {
  translate: Translate;
  send(event: { kind: 'capability'; outcome: 'halted'; code: string; reason: string;
    capability: Record<string, string | number | boolean> }): void;
  screen: CapabilityScreen;
  host: CapabilityProbeHost;
  /** Tell the inline watchdog the boot is deliberately stopped so it never auto-reloads. */
  halt(code: string, message: string): void;
  reload(): void;
  requiredTextureUnits?: number;
}

interface BootCapabilityVerdict {
  probe: CapabilityProbe;
  verdict: CapabilityVerdict;
  /** 'probe': the throwaway context ran; 'cache': a confirmed record stood in for it; 'context': re-read from the real renderer. */
  source: CapabilitySource;
}

interface BootCapabilityGateResult extends BootCapabilityVerdict {
  /**
   * Call once with the real renderer's context: confirms (and records) the verdict, or re-runs the gate on
   * that context when a cached record no longer matches it. Updates this result in place; never resolves on a stop.
   */
  confirm(gl: RuntimeValue): Promise<BootCapabilityVerdict>;
}

function stopBoot(options: BootCapabilityGateOptions, probe: CapabilityProbe,
  verdict: Extract<CapabilityVerdict, { kind: 'stop' }>): Promise<never> {
  options.send({ kind: 'capability', outcome: 'halted', code: verdict.code, reason: verdict.code,
    capability: capabilitySummary(probe, { requiredTextureUnits: options.requiredTextureUnits }) });
  options.halt(verdict.code, verdict.message);
  return new Promise<never>(() => {});
}

/**
 * Run the gate on the boot screen. On a hard stop the sentence and action are
 * on screen, the beacon is sent, the watchdog is halted and the returned
 * promise never resolves: the module body stops here on purpose instead of
 * throwing into the chunk-recovery reload loop. A confirmed record of this
 * browser's earlier proceeding verdict replaces the throwaway context and the
 * worker probe; `confirmBootCapability` must then check it on the real context.
 */
export function runBootCapabilityGate(options: BootCapabilityGateOptions): Promise<BootCapabilityGateResult> {
  const { host } = options;
  if (host.fresh) clearCachedCapability(host.storage);
  const cached = host.fresh ? null : readCachedCapability(host, options.requiredTextureUnits);
  const probe = cached ? cachedProbe(cached, host) : probeCapabilities(host);
  const verdict = evaluateCapabilityGate(probe, options.translate, options.requiredTextureUnits);
  presentCapabilityVerdict(verdict, options.screen, options.reload);
  if (verdict.kind === 'stop') return stopBoot(options, probe, verdict);
  const result: BootCapabilityGateResult = {
    probe, verdict, source: cached ? 'cache' : 'probe',
    confirm: (gl) => confirmBootCapability(result, gl, options).then((next) => Object.assign(result, next)),
  };
  return Promise.resolve(result);
}

/**
 * After the real renderer exists: a probed verdict is confirmed and recorded;
 * a cached one must match the real context's unmasked renderer and limits, or
 * the record is dropped and the gate is evaluated on the real context instead
 * (a stop then halts the boot exactly like the gate; the promise never
 * resolves). Returns the verdict the boot continues with.
 */
export function confirmBootCapability(
  result: BootCapabilityVerdict,
  gl: RuntimeValue,
  options: BootCapabilityGateOptions,
): Promise<BootCapabilityVerdict> {
  const { host } = options;
  const live = gl && typeof gl === 'object' && 'getParameter' in gl ? readContextFields(gl as ProbeCanvasContext) : null;
  const matches = !!live && live.renderer === result.probe.renderer && live.maxTextureUnits === result.probe.maxTextureUnits
    && live.maxTextureSize === result.probe.maxTextureSize && live.vertexTextureUnits === result.probe.vertexTextureUnits
    && live.colorBufferFloat === result.probe.colorBufferFloat;
  if (matches) {
    if (result.source !== 'cache') writeCachedCapability(host, result.probe, options.requiredTextureUnits);
    return Promise.resolve(result);
  }
  clearCachedCapability(host.storage);
  if (!live) return Promise.resolve(result);
  const rendererFamily = classifyRendererFamily(live.renderer);
  const probe: CapabilityProbe = { ...result.probe, ...live, rendererFamily, software: rendererFamily === 'software' };
  const verdict = evaluateCapabilityGate(probe, options.translate, options.requiredTextureUnits);
  presentCapabilityVerdict(verdict, options.screen, options.reload);
  if (verdict.kind === 'stop') return stopBoot(options, probe, verdict);
  writeCachedCapability(host, probe, options.requiredTextureUnits);
  return Promise.resolve({ probe, verdict, source: 'context' });
}

/**
 * The real renderer threw after a clean probe (a context limit, a driver
 * reset mid-boot): same sentence, one retry, and the same deliberate stop.
 * Any cached verdict is dropped, so the next boot probes again.
 */
export function haltRefusedRenderer({ translate, screen, halt, reload, storage }:
  Pick<BootCapabilityGateOptions, 'translate' | 'screen' | 'halt' | 'reload'> & { storage?: CapabilityProbeHost['storage'] }): Promise<never> {
  clearCachedCapability(storage === undefined ? browserStorage() : storage);
  const verdict: CapabilityVerdict = {
    kind: 'stop', code: 'context_refused', message: translate('boot.gate.contextRefused'),
    action: translate('boot.gate.actionRetry'), retry: true, notices: [],
  };
  presentCapabilityVerdict(verdict, screen, reload);
  halt(verdict.code, verdict.message);
  return new Promise<never>(() => {});
}

function browserStorage(): CapabilityProbeHost['storage'] {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch (_) { return null; }
}

/** `?gate=fresh` (any case) asks for a probe even when a confirmed verdict is cached. */
export function capabilityProbeForced(search: string): boolean {
  try { return new URLSearchParams(search || '').get('gate')?.toLowerCase() === 'fresh'; } catch (_) { return false; }
}

/** The browser host: a detached canvas, navigator memory, localStorage and a blob worker. */
export function browserCapabilityHost(): CapabilityProbeHost {
  return {
    createCanvas: () => document.createElement('canvas'),
    deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    storage: browserStorage(),
    userAgent: typeof navigator.userAgent === 'string' ? navigator.userAgent : '',
    now: () => Date.now(),
    fresh: capabilityProbeForced(typeof location !== 'undefined' ? location.search : ''),
    probeWorker: () => {
      if (typeof Worker !== 'function' || typeof Blob !== 'function' || typeof URL?.createObjectURL !== 'function') return false;
      const url = URL.createObjectURL(new Blob(['self.close()'], { type: 'text/javascript' }));
      try {
        new Worker(url).terminate();
        return true;
      } finally {
        URL.revokeObjectURL(url);
      }
    },
  };
}

/** The inline boot screen's three targets, absent in a stripped document. */
export function bootCapabilityScreen(root: Pick<Document, 'getElementById'>): CapabilityScreen {
  return {
    stage: root.getElementById('cot-boot-stage'),
    retry: root.getElementById('cot-boot-retry') as CapabilityScreen['retry'],
    notice: root.getElementById('cot-boot-notice'),
  };
}
