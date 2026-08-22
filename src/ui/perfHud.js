// Live performance + systems dashboard. The dashboard is deliberately opt-in
// (`?debug=1` or F8 in development). Player-facing FPS/ping lives in hud.js;
// production never mounts engineering frame-percentile chrome in battle.

const LS_KEY = 'cot.perfhud.v1';
const PROD_BUILD = !!import.meta.env?.PROD;

/** Pure URL gate used by the HUD and its self-test. */
export function debugModeRequested(search = (typeof location !== 'undefined' ? location.search : '')) {
  const qs = new URLSearchParams(search || '');
  if (!qs.has('debug')) return false;
  const value = String(qs.get('debug') ?? '').toLowerCase();
  return value !== '0' && value !== 'false' && value !== 'off';
}

/** Small, shareable report for issue comments; the full trace stays exportable. */
export function buildQaSummary({ traceStats, hudSnapshot, telemetry, capturedAt = new Date().toISOString() } = {}) {
  return {
    capturedAt,
    trace: traceStats || null,
    frame: hudSnapshot?.stats || null,
    telemetry: telemetry || hudSnapshot?.telemetry || null,
  };
}

function fmtCount(value) {
  const n = Number(value) || 0;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}m`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return String(n);
}

function fmtBytes(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n.toFixed(0)} B`;
}

export function createPerfHud({ renderer, game, trace = null }) {
  const debugRequested = debugModeRequested();
  const el = document.createElement('aside');
  el.id = 'cot-perfhud';
  el.setAttribute('aria-label', 'COT debug telemetry');
  el.style.cssText = [
    'position:fixed', 'top:14px', 'right:14px', 'z-index:360',
    'width:min(390px,calc(100vw - 28px))', 'max-height:calc(100vh - 28px)',
    'box-sizing:border-box', 'overflow:auto', 'padding:12px',
    'font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace',
    'font-variant-numeric:tabular-nums', 'color:#e8edf2',
    'background:linear-gradient(145deg,rgba(9,14,18,.96),rgba(15,22,27,.91))',
    'border:1px solid rgba(143,185,172,.34)', 'border-radius:10px',
    'box-shadow:0 18px 55px rgba(0,0,0,.45),inset 0 1px rgba(255,255,255,.04)',
    'backdrop-filter:blur(14px)', 'pointer-events:none', 'text-shadow:0 1px 2px #000',
  ].join(';');
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div><b style="font:700 12px/1 system-ui,sans-serif;letter-spacing:.12em;color:#f3f6f7">COT TELEMETRY</b>
        <span data-status style="margin-left:7px;color:#75d5ab">LIVE</span></div>
      <span style="color:#77868f">F8</span>
    </div>
    <div data-grid style="display:grid;grid-template-columns:1fr 1fr;gap:8px"></div>`;
  const grid = el.querySelector('[data-grid]');
  const statusEl = el.querySelector('[data-status]');
  const sectionEls = new Map();
  const makeSection = (id, title, wide = false) => {
    const section = document.createElement('section');
    section.style.cssText = [
      wide ? 'grid-column:1/-1' : '', 'min-width:0', 'padding:8px 9px',
      'background:rgba(255,255,255,.035)', 'border:1px solid rgba(255,255,255,.07)',
      'border-radius:6px',
    ].filter(Boolean).join(';');
    section.innerHTML = `<div style="margin-bottom:5px;font:700 9px/1 system-ui,sans-serif;letter-spacing:.14em;color:#8eaaa5">${title}</div><div data-value style="white-space:pre-wrap;color:#d7e0e4"></div>`;
    grid.appendChild(section);
    const value = section.querySelector('[data-value]');
    sectionEls.set(id, value);
    return value;
  };
  makeSection('frame', 'FRAME');
  makeSection('render', 'RENDER');
  makeSection('quality', 'RESOLUTION + QUALITY', true);
  makeSection('simulation', 'SIMULATION');
  makeSection('world', 'WORLD');
  makeSection('shadows', 'SHADOWS', true);
  makeSection('network', 'NETWORK');
  makeSection('memory', 'MEMORY');
  if (trace?.enabled) {
    const actions = document.createElement('div');
    actions.style.cssText = 'grid-column:1/-1;display:grid;grid-template-columns:repeat(3,1fr);gap:7px;pointer-events:auto';
    const action = (label, title) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.title = title;
      button.style.cssText = [
        'min-height:44px', 'padding:8px', 'border:1px solid rgba(117,213,171,.42)',
        'border-radius:5px', 'background:rgba(117,213,171,.09)', 'color:#c9f4df',
        'font:700 9px/1 system-ui,sans-serif', 'letter-spacing:.12em', 'cursor:pointer',
      ].join(';');
      actions.appendChild(button);
      return button;
    };
    const markButton = action('MARK ISSUE', 'Mark this moment in the QA trace');
    const copyButton = action('COPY SUMMARY', 'Copy a compact performance report');
    const exportButton = action('EXPORT JSON', 'Download the complete bounded QA trace');
    const actionStatus = document.createElement('div');
    actionStatus.setAttribute('role', 'status');
    actionStatus.style.cssText = 'grid-column:1/-1;min-height:14px;color:#8eaaa5;text-align:right';
    actions.appendChild(actionStatus);
    grid.appendChild(actions);

    const setStatus = (message, error = false) => {
      actionStatus.textContent = message;
      actionStatus.style.color = error ? '#ff9d7c' : '#8fe0bd';
      setTimeout(() => { if (actionStatus.textContent === message) actionStatus.textContent = ''; }, 3500);
    };
    markButton.addEventListener('click', () => {
      trace.mark('tester:issue', { hud: stats(), telemetry: latestTelemetry });
      setStatus('Issue moment marked');
    });
    copyButton.addEventListener('click', async () => {
      const report = buildQaSummary({
        traceStats: trace.stats(), hudSnapshot: { stats: stats(), telemetry: latestTelemetry },
      });
      const text = JSON.stringify(report, null, 2);
      try {
        await navigator.clipboard.writeText(text);
        setStatus('Summary copied');
      } catch (_) {
        const field = document.createElement('textarea');
        field.value = text;
        field.style.cssText = 'position:fixed;left:-9999px';
        document.body.appendChild(field);
        field.select();
        const copied = document.execCommand('copy');
        field.remove();
        setStatus(copied ? 'Summary copied' : 'Copy unavailable', !copied);
      }
    });
    exportButton.addEventListener('click', () => {
      const filename = trace.download();
      setStatus(filename ? `Saved ${filename}` : 'Export unavailable', !filename);
    });
  }
  document.body.appendChild(el);

  // Frame-time ring (240 frames ≈ 4 s @60), long-task observer (5 s window).
  const ring = new Float32Array(240);
  const sorted = new Float32Array(240);
  let ri = 0;
  let rn = 0;
  const stalls = [];
  try {
    new PerformanceObserver((list) => {
      const now = performance.now();
      for (const entry of list.getEntries()) stalls.push({ t: now, d: entry.duration });
    }).observe({ entryTypes: ['longtask'] });
  } catch (_) { /* older engines: stall line reads n/a */ }

  let simT0 = 0;
  let wall0 = 0;
  let simPct = -1;
  let lastDom = 0;
  let telemetryProvider = null;
  let latestTelemetry = null;
  let visible = debugRequested || (!PROD_BUILD && (() => {
    try { return localStorage.getItem(LS_KEY) === '1'; } catch (_) { return false; }
  })());
  let captureHidden = false;
  el.style.display = visible ? 'block' : 'none';

  function stats() {
    const n = rn;
    if (!n) return null;
    sorted.set(ring.subarray(0, n));
    const view = sorted.subarray(0, n).sort();
    let sum = 0;
    for (let i = 0; i < n; i++) sum += view[i];
    const avg = sum / n;
    const at = (p) => view[Math.min(n - 1, Math.floor((n - 1) * p))];
    return {
      fps: avg > 0 ? 1000 / avg : 0,
      onePctLow: at(0.99) > 0 ? 1000 / at(0.99) : 0,
      p50: at(0.50),
      p95: at(0.95),
      p99: at(0.99),
      worstStall: stalls.reduce((a, stall) => Math.max(a, stall.d), 0),
      calls: renderer.info.render.calls,
      tris: renderer.info.render.triangles,
      programs: (renderer.info.programs || []).length,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      heapMB: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : -1,
      heapLimitMB: performance.memory ? performance.memory.jsHeapSizeLimit / 1048576 : -1,
      simPct,
    };
  }

  function renderDashboard(s) {
    let t = latestTelemetry;
    if (telemetryProvider) {
      try { t = telemetryProvider() || null; } catch (error) { t = { error: String(error?.message || error) }; }
      latestTelemetry = t;
    }
    const q = t?.quality || {};
    const sim = t?.simulation || {};
    const world = t?.world || {};
    const shadow = t?.shadows || {};
    const network = t?.network || {};
    const memory = t?.memory || {};
    const cascades = Array.isArray(shadow.cascades) ? shadow.cascades : [];
    statusEl.textContent = t?.error ? 'PROVIDER ERROR' : 'LIVE';
    statusEl.style.color = t?.error ? '#ff9d7c' : '#75d5ab';
    sectionEls.get('frame').textContent =
      `${s.fps.toFixed(0)} fps   1% low ${s.onePctLow.toFixed(0)}\n` +
      `${s.p50.toFixed(1)} / ${s.p95.toFixed(1)} / ${s.p99.toFixed(1)} ms\n` +
      `stall ${s.worstStall ? `${s.worstStall.toFixed(0)} ms` : '—'}   sim ${s.simPct >= 0 ? `${s.simPct.toFixed(0)}%` : '—'}`;
    sectionEls.get('render').textContent =
      `${s.calls} calls   ${fmtCount(s.tris)} tri\n` +
      `${s.programs} programs\n${s.geometries} geo   ${s.textures} tex`;
    sectionEls.get('quality').textContent =
      `${q.buffer || '—'} buffer  dpr ${q.dpr ?? '—'}  scale ${q.dynScale ?? '—'}\n` +
      `${q.preset || '—'} / ${q.tier || '—'}   trim ${q.perfTrim ?? '—'}   ${q.gpu || 'GPU unavailable'}`;
    sectionEls.get('simulation').textContent =
      `${sim.phase || game.phase || '—'}   ${sim.map || 'no map'}\n` +
      `${Number(sim.timeS || 0).toFixed(1)} s   tanks ${sim.alive ?? '—'}/${sim.tanks ?? '—'}   shells ${sim.shells ?? '—'}`;
    sectionEls.get('world').textContent =
      `${world.obstacles ?? '—'} obstacles   ${world.colliders ?? '—'} colliders\n` +
      `${world.concealers ?? '—'} conceal   ${world.destructibles ?? '—'} destruct\n` +
      `${world.wrecks ?? '—'} wreck sites   loose ${world.looseActive ?? '—'}/${world.looseTotal ?? '—'} awake`;
    sectionEls.get('shadows').textContent =
      `${shadow.enabled ? 'ON' : 'OFF'}${shadow.rescue ? ` · rescue ${shadow.rescue}` : ''}   far ${shadow.maxFar ?? '—'}m   throttle ${shadow.throttle ?? '—'}\n` +
      (cascades.length
        ? cascades.map((c, i) => `C${i} ${c.size ?? '—'}${c.allocated ? '✓' : '…'} r${Number(c.radius || 0).toFixed(2)}`).join('   ')
        : 'cascade telemetry unavailable') +
      `\n${shadow.casters ?? '—'} casters   ${shadow.receivers ?? '—'} receivers   shader errors ${shadow.shaderErrors ?? 0}`;
    sectionEls.get('network').textContent = network.connected == null
      ? 'local / offline\nno transport overhead'
      : `${network.connected ? 'connected' : 'disconnected'}   RTT ${Number(network.rttMs || 0).toFixed(0)} ms\n` +
        `jitter ${Number(network.jitterMs || 0).toFixed(0)} ms   loss ${Number(network.lossPct || 0).toFixed(1)}%\n` +
        `buffer ${fmtBytes(network.bufferedBytes)}`;
    sectionEls.get('memory').textContent =
      `${s.heapMB >= 0 ? `${s.heapMB.toFixed(0)} / ${s.heapLimitMB.toFixed(0)} MB JS` : 'JS heap unavailable'}\n` +
      `${memory.drawBuffer || q.buffer || '—'} draw buffer`;
  }

  return {
    el,
    /** Call once per rAF, AFTER the render (dtMs = frame delta). */
    update(dtMs) {
      if (dtMs > 0 && dtMs < 1000) {
        ring[ri] = dtMs;
        ri = (ri + 1) % ring.length;
        if (rn < ring.length) rn++;
      }
      const now = performance.now();
      if (game.phase === 'battle' && game.timeS > 0) {
        if (!wall0) { wall0 = now; simT0 = game.timeS; }
        else if (now - wall0 >= 1000) {
          simPct = ((game.timeS - simT0) / ((now - wall0) / 1000)) * 100;
          wall0 = now;
          simT0 = game.timeS;
        }
      } else { simPct = -1; wall0 = 0; }
      while (stalls.length && now - stalls[0].t > 5000) stalls.shift();
      if (now - lastDom < 250) return;
      lastDom = now;
      const s = stats();
      if (!s) return;
      if (visible && !captureHidden) renderDashboard(s);
    },
    toggle() {
      if (debugRequested || !PROD_BUILD) {
        visible = !visible;
        el.style.display = visible && !captureHidden ? 'block' : 'none';
        try { localStorage.setItem(LS_KEY, visible ? '1' : '0'); } catch (_) { /* fine */ }
      }
    },
    setTelemetryProvider(provider) {
      telemetryProvider = typeof provider === 'function' ? provider : null;
    },
    /** Keep developer/player diagnostics out of deterministic capture art. */
    setCaptureHidden(hidden) {
      captureHidden = !!hidden;
      el.style.display = visible && !captureHidden ? 'block' : 'none';
    },
    /** Probe hooks used by performance and map-audit tooling. */
    stats,
    snapshot() { return { stats: stats(), telemetry: latestTelemetry }; },
  };
}
