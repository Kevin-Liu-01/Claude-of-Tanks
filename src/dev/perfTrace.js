// Bounded gameplay/performance flight recorder. Development enables it by
// default; optimized production builds load it only for the explicit
// `?debug=1` device-QA path selected in main.js.
//
// Event objects are bounded and frames use typed columns so the recorder does
// not manufacture the GC stalls it is meant to find. Normal production never
// imports this module and therefore installs no observers/listeners.

const VITE_DEV = !!import.meta.env?.DEV;
export const DEV_TRACE_ACTIVE = typeof window !== 'undefined' && VITE_DEV;

const PHASES = ['unknown', 'garage', 'battle', 'ended', 'shot', 'studio'];
const PHASE_CODE = new Map(PHASES.map((name, i) => [name, i]));
const FRAME_SCHEMA = [
  'tMs', 'gapMs', 'dtMs', 'simS', 'preBattleS', 'phase', 'flags',
  'renderFrame', 'calls', 'triangles', 'programs', 'geometries', 'textures',
  'heapMB', 'renderScale', 'throttle', 'steer', 'fire',
];
const FLAGS = {
  hidden: 1 << 0, unfocused: 1 << 1, paused: 1 << 2, countdown: 1 << 3,
  result: 1 << 4, killcam: 1 << 5, shot: 1 << 6, studio: 1 << 7,
};

const defaultNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function ring(capacity) {
  const values = new Array(capacity);
  let next = 0, size = 0, dropped = 0;
  return {
    push(value) {
      if (size === capacity) dropped++; else size++;
      values[next] = value;
      next = (next + 1) % capacity;
    },
    ordered() {
      const out = new Array(size);
      const start = size === capacity ? next : 0;
      for (let i = 0; i < size; i++) out[i] = values[(start + i) % capacity];
      return out;
    },
    clear() { values.fill(undefined); next = size = dropped = 0; },
    get size() { return size; },
    get dropped() { return dropped; },
  };
}

// Bus hot paths reuse payload objects, so snapshot immediately at emit time.
function cloneSafe(value, depth = 0, seen = new WeakSet()) {
  if (value == null || ['string', 'boolean'].includes(typeof value)) return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[Circular]';
  if (depth >= 4) return `[${value.constructor?.name || 'Object'}]`;
  seen.add(value);
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    const n = Math.min(value.length ?? 0, 64);
    const out = Array.from({ length: n }, (_, i) => cloneSafe(value[i], depth + 1, seen));
    if ((value.length ?? 0) > n) out.push(`[+${value.length - n} items]`);
    return out;
  }
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack || '' };
  const out = {};
  const keys = Object.keys(value);
  for (const key of keys.slice(0, 40)) {
    try { out[key] = cloneSafe(value[key], depth + 1, seen); }
    catch (e) { out[key] = `[unreadable: ${e?.message || e}]`; }
  }
  if (keys.length > 40) out.__truncatedKeys = keys.length - 40;
  return out;
}

function inert() {
  const noop = () => {};
  return {
    enabled: false, active: false, event: noop, action: noop, frame: noop,
    mark: noop, configure: noop, clear: noop, start: noop, stop: noop,
    console: noop, download: () => null, exportJson: () => '{}', tail: () => [],
    snapshot: () => ({ enabled: false }), stats: () => ({ enabled: false }),
  };
}

function gpuInfo(renderer) {
  try {
    const gl = renderer?.getContext?.();
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    };
  } catch (_) { return null; }
}

const pct = (a, q) => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * q))] : 0;

/** Injectable core is exported for the node selftest. */
export function createDevTraceCore(options = {}) {
  if (!(options.enabled ?? DEV_TRACE_ACTIVE)) return inert();
  const now = options.now || defaultNow;
  const eventCap = options.eventCapacity || 20000;
  const frameCap = options.frameCapacity || 72000; // 20 min at 60 fps
  const events = ring(eventCap);
  const f = {
    t: new Float64Array(frameCap), gap: new Float32Array(frameCap), dt: new Float32Array(frameCap),
    sim: new Float32Array(frameCap), pre: new Float32Array(frameCap), phase: new Uint8Array(frameCap),
    flags: new Uint16Array(frameCap), renderFrame: new Uint32Array(frameCap),
    calls: new Uint32Array(frameCap), tris: new Uint32Array(frameCap), programs: new Uint16Array(frameCap),
    geometries: new Uint16Array(frameCap), textures: new Uint16Array(frameCap),
    heap: new Float32Array(frameCap), renderScale: new Float32Array(frameCap), throttle: new Float32Array(frameCap),
    steer: new Float32Array(frameCap), fire: new Uint8Array(frameCap),
  };
  const startedPerf = now(), startedWall = Date.now();
  const traceMode = options.traceMode || (VITE_DEV ? 'development' : 'qa');
  let traceZero = startedPerf;
  const sessionId = `${startedWall.toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const counts = Object.create(null);
  let refs = options.renderer ? { renderer: options.renderer } : {};
  let active = true, consoleAll = false, inputBound = false;
  let seq = 0, eventNext = 0, lastEventName = '';
  let gpuCaptured = false, cachedGpu = null;
  let frameNext = 0, frameSize = 0, frameDropped = 0, lastFrameAt = 0;
  let maxGap = 0, spikes = 0, freezes = 0, longTasks = 0, longTaskMs = 0;
  let lastPhase = 'unknown', lastSim = NaN, lastSimAt = 0, simFrozenAt = 0;
  let lastRender = -1, lastRenderAt = 0, renderFrozenAt = 0;

  const rel = (t = now()) => +(t - traceZero).toFixed(3);
  function push(kind, name, data, at = now()) {
    if (!active) return null;
    const row = {
      seq: ++seq, tMs: rel(at), kind, name,
      phase: refs.game?.phase || lastPhase,
      simS: Number.isFinite(refs.game?.timeS) ? +refs.game.timeS.toFixed(4) : null,
      data: cloneSafe(data),
    };
    events.push(row);
    if (kind === 'bus') {
      eventNext = row.seq; lastEventName = name; counts[name] = (counts[name] || 0) + 1;
    }
    if (consoleAll) console.info(`[COT trace ${row.tMs}ms] ${kind}:${name}`, row.data);
    return row;
  }
  function anomaly(name, data, at = now()) {
    return push('anomaly', name, { ...data, lastEventSeq: eventNext, lastEventName }, at);
  }
  function context() {
    try { return refs.getContext?.() || {}; }
    catch (e) { return { contextError: e?.message || String(e) }; }
  }
  function flagBits(game, ctx) {
    let bits = 0;
    if (typeof document !== 'undefined' && document.hidden) bits |= FLAGS.hidden;
    if (typeof document !== 'undefined' && document.hasFocus && !document.hasFocus()) bits |= FLAGS.unfocused;
    if (ctx.paused) bits |= FLAGS.paused;
    if (Number.isFinite(game?.preBattleS) && game.preBattleS > 0) bits |= FLAGS.countdown;
    if (game?.result) bits |= FLAGS.result;
    if (ctx.killcam) bits |= FLAGS.killcam;
    if (ctx.shotMode) bits |= FLAGS.shot;
    if (ctx.studio) bits |= FLAGS.studio;
    return bits;
  }
  function frame(dtMs = 0) {
    if (!active) return;
    const at = now();
    const gap = lastFrameAt ? Math.max(0, at - lastFrameAt) : Math.max(0, dtMs);
    lastFrameAt = at; maxGap = Math.max(maxGap, gap);
    const game = refs.game, info = refs.renderer?.info, ctx = context();
    const phase = ctx.studio ? 'studio' : (game?.phase || 'unknown');
    const sim = Number.isFinite(game?.timeS) ? game.timeS : 0;
    const pre = Number.isFinite(game?.preBattleS) ? game.preBattleS : -1;
    const bits = flagBits(game, ctx);
    const rf = info?.render?.frame || 0;
    const inp = game?.player?.input;
    const i = frameNext;
    f.t[i] = rel(at); f.gap[i] = gap; f.dt[i] = dtMs; f.sim[i] = sim; f.pre[i] = pre;
    f.phase[i] = PHASE_CODE.get(phase) ?? 0; f.flags[i] = bits; f.renderFrame[i] = rf;
    f.calls[i] = info?.render?.calls || 0; f.tris[i] = info?.render?.triangles || 0;
    f.programs[i] = Math.min((info?.programs || []).length, 65535);
    f.geometries[i] = Math.min(info?.memory?.geometries || 0, 65535);
    f.textures[i] = Math.min(info?.memory?.textures || 0, 65535);
    f.heap[i] = typeof performance !== 'undefined' && performance.memory
      ? performance.memory.usedJSHeapSize / 1048576 : -1;
    f.renderScale[i] = Number.isFinite(ctx.renderScale) ? ctx.renderScale : -1;
    f.throttle[i] = Number(inp?.throttle) || 0; f.steer[i] = Number(inp?.steer) || 0; f.fire[i] = inp?.fire ? 1 : 0;
    if (frameSize === frameCap) frameDropped++; else frameSize++;
    frameNext = (frameNext + 1) % frameCap;

    const hidden = !!(bits & (FLAGS.hidden | FLAGS.unfocused));
    if (gap >= 250) {
      freezes++; anomaly(hidden ? 'frame:hidden-gap' : 'screen:freeze', { gapMs: +gap.toFixed(2), dtMs, phase, simS: sim, renderFrame: rf }, at);
    } else if (gap >= 50) {
      spikes++; anomaly(hidden ? 'frame:hidden-spike' : 'frame:spike', { gapMs: +gap.toFixed(2), dtMs, phase, simS: sim, renderFrame: rf }, at);
    }

    const live = phase === 'battle' && pre <= 0 && !(bits &
      (FLAGS.hidden | FLAGS.unfocused | FLAGS.paused | FLAGS.result | FLAGS.killcam));
    if (phase !== lastPhase || !live) {
      lastPhase = phase; lastSim = sim; lastSimAt = at; simFrozenAt = 0;
      lastRender = rf; lastRenderAt = at; renderFrozenAt = 0; return;
    }
    if (!Number.isFinite(lastSim) || sim > lastSim + 1e-6) {
      if (simFrozenAt) anomaly('sim:resume', { frozenMs: +(at - simFrozenAt).toFixed(2), simS: sim }, at);
      lastSim = sim; lastSimAt = at; simFrozenAt = 0;
    } else if (!simFrozenAt && at - lastSimAt >= 750) {
      simFrozenAt = lastSimAt; anomaly('sim:freeze', { frozenMs: +(at - lastSimAt).toFixed(2), simS: sim }, at);
    }
    if (rf !== lastRender) {
      if (renderFrozenAt) anomaly('render:resume', { frozenMs: +(at - renderFrozenAt).toFixed(2), renderFrame: rf }, at);
      lastRender = rf; lastRenderAt = at; renderFrozenAt = 0;
    } else if (!renderFrozenAt && at - lastRenderAt >= 750) {
      renderFrozenAt = lastRenderAt; anomaly('render:freeze', { frozenMs: +(at - lastRenderAt).toFixed(2), renderFrame: rf }, at);
    }
  }
  function rows() {
    const out = new Array(frameSize), start = frameSize === frameCap ? frameNext : 0;
    for (let n = 0; n < frameSize; n++) {
      const i = (start + n) % frameCap;
      out[n] = [
        +f.t[i].toFixed(3), +f.gap[i].toFixed(3), +f.dt[i].toFixed(3), +f.sim[i].toFixed(4),
        +f.pre[i].toFixed(3), PHASES[f.phase[i]], f.flags[i], f.renderFrame[i], f.calls[i],
        f.tris[i], f.programs[i], f.geometries[i], f.textures[i], +f.heap[i].toFixed(2),
        +f.renderScale[i].toFixed(3), +f.throttle[i].toFixed(3), +f.steer[i].toFixed(3), f.fire[i],
      ];
    }
    return out;
  }
  function stats() {
    const gaps = new Array(frameSize), start = frameSize === frameCap ? frameNext : 0;
    for (let n = 0; n < frameSize; n++) gaps[n] = f.gap[(start + n) % frameCap];
    gaps.sort((a, b) => a - b);
    return {
      enabled: true, active, traceMode, sessionId, durationMs: rel(), frames: frameSize,
      framesDropped: frameDropped, events: events.size, eventsDropped: events.dropped,
      eventCounts: { ...counts }, gapP50: +pct(gaps, .5).toFixed(3),
      gapP95: +pct(gaps, .95).toFixed(3), gapP99: +pct(gaps, .99).toFixed(3),
      maxGapMs: +maxGap.toFixed(3), spikes, freezes, longTasks,
      longTaskMs: +longTaskMs.toFixed(3), consoleAll,
    };
  }
  function environment(includeGpu = true) {
    const nav = typeof navigator !== 'undefined' ? navigator : {};
    if (includeGpu && !gpuCaptured) {
      cachedGpu = gpuInfo(refs.renderer);
      gpuCaptured = true;
    }
    return {
      url: typeof location !== 'undefined' ? location.href : '', userAgent: nav.userAgent || '',
      platform: nav.platform || '', hardwareConcurrency: nav.hardwareConcurrency ?? null,
      deviceMemoryGB: nav.deviceMemory ?? null,
      dpr: typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : null,
      viewport: typeof innerWidth !== 'undefined' ? [innerWidth, innerHeight] : null,
      gpu: includeGpu ? cachedGpu : null, mode: import.meta.env?.MODE || 'unknown', traceMode,
    };
  }
  function snapshot(options = {}) {
    return {
      version: 1, sessionId, startedAt: new Date(startedWall).toISOString(),
      timeOrigin: typeof performance !== 'undefined' ? performance.timeOrigin : null,
      environment: environment(options.gpu !== false),
      telemetry: (() => {
        try { return cloneSafe(refs.getTelemetry?.() || null); }
        catch (error) { return { error: String(error?.message || error) }; }
      })(),
      stats: stats(), frameSchema: FRAME_SCHEMA,
      frames: options.frames === false ? [] : rows(),
      events: options.events === false ? [] : events.ordered(),
    };
  }
  function clear() {
    traceZero = now();
    events.clear(); frameNext = frameSize = frameDropped = 0;
    for (const v of Object.values(f)) v.fill(0);
    for (const key of Object.keys(counts)) delete counts[key];
    seq = eventNext = 0; lastEventName = ''; lastFrameAt = maxGap = spikes = freezes = 0;
    longTasks = longTaskMs = 0; lastPhase = 'unknown'; lastSim = NaN;
    lastSimAt = simFrozenAt = 0; lastRender = -1; lastRenderAt = renderFrozenAt = 0;
  }

  const api = {
    enabled: true, get active() { return active; },
    event: (name, data) => push('bus', name, data),
    action: (name, data) => push('action', name, data), frame,
    mark: (name, data = {}) => push('mark', name, data),
    configure(next = {}) {
      refs = { ...refs, ...next };
      if (refs.input && !inputBound) {
        inputBound = true;
        for (const def of refs.input.actionDefs || []) refs.input.onAction(def.id, (code) => api.action(def.id, { code }));
      }
      // GPU driver queries can serialize with software rasterizers. Keep them
      // out of startup and sample once, lazily, when a snapshot is exported.
      push('trace', 'configured', { refs: Object.keys(next), environment: environment(false) });
      return api;
    },
    clear, start() { active = true; push('trace', 'started', {}); },
    stop() { push('trace', 'stopped', {}); active = false; },
    console(on = true) { consoleAll = !!on; return consoleAll; }, stats, snapshot,
    exportJson(pretty = false, snapshotOptions = {}) {
      return JSON.stringify(snapshot(snapshotOptions), null, pretty ? 2 : 0);
    },
    download(filename = `cot-${traceMode === 'production-qa' ? 'qa' : 'dev'}-trace-${sessionId}.json`) {
      if (typeof document === 'undefined') return null;
      const url = URL.createObjectURL(new Blob([api.exportJson(false)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); return filename;
    },
    tail(n = 100, kind = null) {
      const a = events.ordered().filter((row) => !kind || row.kind === kind);
      return a.slice(Math.max(0, a.length - Math.max(0, n | 0)));
    },
  };

  if (typeof PerformanceObserver !== 'undefined') {
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (!active) continue;
          longTasks++; longTaskMs += e.duration;
          anomaly('longtask', {
            startTime: +e.startTime.toFixed(3), duration: +e.duration.toFixed(3),
            attribution: (e.attribution || []).map((a) => ({
              name: a.name, containerType: a.containerType,
              containerName: a.containerName, containerSrc: a.containerSrc,
            })),
          });
        }
      }).observe({ entryTypes: ['longtask'] });
    } catch (_) { /* unsupported */ }
  }
  if (typeof window !== 'undefined') {
    const life = (name) => (e) => push('lifecycle', name, {
      persisted: e?.persisted, hidden: document.hidden, visibilityState: document.visibilityState,
      focused: document.hasFocus(), viewport: [innerWidth, innerHeight],
    });
    for (const name of ['freeze', 'resume', 'pagehide', 'pageshow', 'resize', 'orientationchange']) {
      window.addEventListener(name, life(name), { passive: true });
    }
    document.addEventListener('visibilitychange', life('visibilitychange'), { passive: true });
    document.addEventListener('pointerlockchange', life('pointerlockchange'), { passive: true });
    window.addEventListener('error', (e) => push('error', 'window:error', {
      message: e.message, filename: e.filename, lineno: e.lineno, colno: e.colno, error: e.error,
    }));
    window.addEventListener('unhandledrejection', (e) => push('error', 'unhandledrejection', { reason: e.reason }));
    const canvas = refs.renderer?.domElement;
    canvas?.addEventListener('webglcontextlost', (e) => anomaly('webgl:context-lost', { statusMessage: e.statusMessage || '' }));
    canvas?.addEventListener('webglcontextrestored', () => push('lifecycle', 'webglcontextrestored', {}));
    window.__DEV_TRACE = api; // backwards-compatible probe name
    window.__QA_TRACE = api;
  }
  push('trace', 'created', { sessionId, eventCap, frameCap });
  return api;
}

export function createDevTrace(options = {}) {
  return createDevTraceCore({ ...options, enabled: options.enabled ?? DEV_TRACE_ACTIVE });
}
