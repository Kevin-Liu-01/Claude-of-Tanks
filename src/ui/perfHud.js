// FEEL r12 (owner: "show fps and ping and so on in a corner"): live perf
// overlay — FPS, frame-time p95, worst recent stall, draw calls, shader
// program count, JS heap, and SIM% (game-time vs wall-time ratio, the
// throttle tell). Toggled with the 'perfHud' action (default F8), state
// persisted. pointer-events:none — it can never block game input.
//
// This is also the honest-identification fix for the QA loop: the Lap's
// long-task budgets went green while steady frame time sat at 20-26 ms
// (~40-50 fps) — the overlay makes frame RATE a first-class, always-visible
// signal for the owner and for probes (window.__PERF_HUD.stats()).

const LS_KEY = 'cot.perfhud.v1';
const COMPACT_LS_KEY = 'cot.perfcompact.v1';
const PROD_BUILD = import.meta.env.PROD;

export function createPerfHud({ renderer, game }) {
  const el = document.createElement('div');
  el.id = 'cot-perfhud';
  el.style.cssText = [
    'position:fixed', 'top:64px', 'right:8px', 'z-index:60',
    'font:10px/1.5 ui-monospace,Menlo,monospace', 'color:#cfe3cf',
    'background:rgba(8,12,8,0.55)', 'padding:5px 8px', 'border-radius:4px',
    'pointer-events:none', 'white-space:pre', 'text-align:right',
    'text-shadow:0 1px 2px rgba(0,0,0,0.8)',
  ].join(';');
  document.body.appendChild(el);

  // The shipped HUD carries only the two numbers players can act on. It is
  // mounted against the damage panel so it sits beside the live tank plan and
  // automatically follows that panel's battle/spectator visibility.
  const compactEl = document.createElement('div');
  compactEl.id = 'cot-perf-compact';
  compactEl.setAttribute('aria-label', 'Frame performance');
  compactEl.style.cssText = [
    'position:absolute', 'left:calc(100% + 9px)', 'top:58px', 'z-index:1',
    'display:none', 'grid-template-columns:auto auto', 'gap:1px 7px',
    'min-width:72px', 'padding:4px 6px',
    'font:9px/1.45 ui-monospace,Menlo,monospace', 'letter-spacing:.08em',
    'font-variant-numeric:tabular-nums', 'white-space:nowrap',
    'color:#d3dde5', 'background:rgba(7,10,14,.44)',
    'border-left:1px solid rgba(146,164,180,.32)',
    'text-shadow:0 1px 2px rgba(0,0,0,.9)', 'pointer-events:none',
  ].join(';');
  compactEl.innerHTML =
    '<span style="color:#84919d">FPS</span><b data-fps>—</b>' +
    '<span style="color:#84919d">P95</span><b data-p95>—</b>';
  const compactFps = compactEl.querySelector('[data-fps]');
  const compactP95 = compactEl.querySelector('[data-p95]');

  // frame-time ring (240 frames ≈ 4 s @60), long-task observer (5 s window)
  const ring = new Float32Array(240);
  let ri = 0, rn = 0;
  const stalls = [];
  try {
    new PerformanceObserver((list) => {
      const now = performance.now();
      for (const e of list.getEntries()) stalls.push({ t: now, d: e.duration });
    }).observe({ entryTypes: ['longtask'] });
  } catch (_) { /* older engines: stall line reads n/a */ }

  let simT0 = 0, wall0 = 0, simPct = -1;
  let lastDom = 0;
  let visible = !PROD_BUILD && (() => {
    try { return localStorage.getItem(LS_KEY) !== '0'; } catch (_) { return true; }
  })();
  let compactVisible = PROD_BUILD && (() => {
    try { return localStorage.getItem(COMPACT_LS_KEY) !== '0'; } catch (_) { return true; }
  })();
  let captureHidden = false;
  el.style.display = visible ? 'block' : 'none';

  const sorted = new Float32Array(240);

  function stats() {
    const n = rn;
    if (!n) return null;
    sorted.set(ring.subarray(0, n));
    const view = sorted.subarray(0, n).sort();
    let sum = 0;
    for (let i = 0; i < n; i++) sum += view[i];
    const avg = sum / n;
    return {
      fps: avg > 0 ? 1000 / avg : 0,
      p95: view[Math.min(n - 1, Math.floor(n * 0.95))],
      worstStall: stalls.reduce((a, s) => Math.max(a, s.d), 0),
      calls: renderer.info.render.calls,
      tris: renderer.info.render.triangles,
      programs: (renderer.info.programs || []).length,
      heapMB: performance.memory
        ? performance.memory.usedJSHeapSize / 1048576 : -1,
      simPct,
    };
  }

  return {
    el,
    /** Call once per rAF, AFTER the render (dtMs = frame delta). */
    update(dtMs) {
      if (dtMs > 0 && dtMs < 1000) { ring[ri] = dtMs; ri = (ri + 1) % ring.length; if (rn < ring.length) rn++; }
      const now = performance.now();
      // SIM% over a 1 s window (battle only; garage shows —)
      if (game.phase === 'battle' && game.timeS > 0) {
        if (!wall0) { wall0 = now; simT0 = game.timeS; }
        else if (now - wall0 >= 1000) {
          simPct = ((game.timeS - simT0) / ((now - wall0) / 1000)) * 100;
          wall0 = now; simT0 = game.timeS;
        }
      } else { simPct = -1; wall0 = 0; }
      while (stalls.length && now - stalls[0].t > 5000) stalls.shift();
      if (now - lastDom < 250) return;
      lastDom = now;
      const s = stats();
      if (!s) return;
      if (PROD_BUILD) {
        compactFps.textContent = s.fps.toFixed(0);
        compactP95.textContent = `${s.p95.toFixed(1)} ms`;
        compactEl.style.display = compactVisible && !captureHidden ? 'grid' : 'none';
      } else if (visible && !captureHidden) {
        el.textContent =
          `${s.fps.toFixed(0).padStart(3)} fps  ${s.p95.toFixed(1)} ms p95\n` +
          `stall ${s.worstStall ? s.worstStall.toFixed(0) + ' ms' : '—'} (5s)\n` +
          `${s.calls} calls  ${(s.tris / 1000).toFixed(0)}k tri\n` +
          `${s.programs} prog  ${s.heapMB >= 0 ? s.heapMB.toFixed(0) + ' MB' : ''}\n` +
          (s.simPct >= 0 ? `sim ${s.simPct.toFixed(0)}%` : 'sim —');
      }
    },
    toggle() {
      if (PROD_BUILD) {
        compactVisible = !compactVisible;
        compactEl.style.display = compactVisible && !captureHidden ? 'grid' : 'none';
        try { localStorage.setItem(COMPACT_LS_KEY, compactVisible ? '1' : '0'); } catch (_) { /* fine */ }
      } else {
        visible = !visible;
        el.style.display = visible && !captureHidden ? 'block' : 'none';
        try { localStorage.setItem(LS_KEY, visible ? '1' : '0'); } catch (_) { /* fine */ }
      }
    },
    /** Keep developer/player diagnostics out of deterministic capture art. */
    setCaptureHidden(hidden) {
      captureHidden = !!hidden;
      el.style.display = visible && !captureHidden ? 'block' : 'none';
      compactEl.style.display = compactVisible && !captureHidden ? 'grid' : 'none';
    },
    /** Mount the production readout beside the damage-panel tank plan. */
    mountCompact(parent) {
      if (parent && compactEl.parentNode !== parent) parent.appendChild(compactEl);
    },
    /** probe hook: window.__PERF_HUD.stats() */
    stats,
  };
}
