// Live performance + systems dashboard. The dashboard remains a lazy,
// explicitly enabled surface; input settings own persistence while this
// module owns only presentation and bounded 4 Hz telemetry paint.

import { ensureStyle } from './dom.ts';
import { FONT_COND } from './fonts.ts';
import { uiIconSVG } from './uiIcons.ts';
import { t as tr } from './i18n.ts';

export { debugModeRequested } from '../dev/debugIntent.ts';

interface RendererDiagnostics {
  info: {
    render: { calls: number; triangles: number };
    programs?: object[] | null;
    memory: { geometries: number; textures: number };
  };
}

interface DebugGameState {
  phase: string;
  timeS: number;
}

interface PerfTracePort {
  enabled?: boolean;
  mark(name: string, payload: object): void;
  stats(): object;
  download(): string | null | undefined;
}

interface QualityTelemetry {
  buffer?: string;
  dpr?: number | string;
  dynScale?: number | string;
  preset?: string;
  tier?: string;
  perfTrim?: number | string;
  gpu?: string;
}

interface SimulationTelemetry {
  phase?: string;
  map?: string;
  timeS?: number;
  alive?: number | string;
  tanks?: number | string;
  shells?: number | string;
}

interface WorldTelemetry {
  obstacles?: number | string;
  colliders?: number | string;
  concealers?: number | string;
  destructibles?: number | string;
  wrecks?: number | string;
  looseActive?: number | string;
  looseTotal?: number | string;
}

interface ShadowCascadeTelemetry {
  size?: number | string;
  allocated?: boolean;
  radius?: number;
}

interface ShadowTelemetry {
  enabled?: boolean;
  rescue?: string;
  maxFar?: number | string;
  throttle?: number | string;
  cascades?: ShadowCascadeTelemetry[];
  casters?: number | string;
  receivers?: number | string;
  shaderErrors?: number;
}

interface NetworkTelemetry {
  connected?: boolean;
  rttMs?: number;
  jitterMs?: number;
  lossPct?: number;
  bufferedBytes?: number;
}

interface MemoryTelemetry { drawBuffer?: string }

interface DebugTelemetry {
  error?: string;
  quality?: QualityTelemetry;
  simulation?: SimulationTelemetry;
  world?: WorldTelemetry;
  shadows?: ShadowTelemetry;
  network?: NetworkTelemetry;
  memory?: MemoryTelemetry;
}

interface FrameStats {
  fps: number;
  onePctLow: number;
  p50: number;
  p95: number;
  p99: number;
  worstStall: number;
  calls: number;
  tris: number;
  programs: number;
  geometries: number;
  textures: number;
  heapMB: number;
  heapLimitMB: number;
  simPct: number;
}

interface QaSummaryOptions {
  traceStats?: object;
  hudSnapshot?: { stats?: FrameStats | null; telemetry?: DebugTelemetry | null } | null;
  telemetry?: DebugTelemetry | null;
  capturedAt?: string;
}

interface BrowserPerformanceMemory {
  usedJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface PerformanceWithMemory extends Performance {
  memory?: BrowserPerformanceMemory;
}

const PERF_HUD_CSS = `
#cot-perfhud{position:fixed;top:12px;right:12px;z-index:360;
  width:min(386px,calc(100vw - 24px));max-height:calc(100dvh - 24px);box-sizing:border-box;
  overflow:auto;padding:0;font:10px/1.42 ui-monospace,SFMono-Regular,Menlo,monospace;
  font-variant-numeric:tabular-nums;color:#dce6ed;background:rgba(5,9,12,.96);
  border:1px solid rgba(176,195,209,.3);border-top-color:rgba(240,176,74,.66);
  box-shadow:0 18px 52px rgba(0,0,0,.55),inset 0 1px rgba(255,255,255,.035);
  text-shadow:0 1px 2px #000;pointer-events:none;}
#cot-perfhud *{box-sizing:border-box}
#cot-perfhud .ph-head{position:sticky;top:0;z-index:2;display:grid;
  grid-template-columns:32px minmax(0,1fr) auto auto;align-items:center;min-height:48px;padding:7px 10px;
  background:linear-gradient(180deg,#151e24,#091015);border-bottom:1px solid rgba(177,196,210,.22);}
#cot-perfhud .ph-icon{width:28px;height:28px;display:grid;place-items:center;color:#f0b04a;
  border:1px solid rgba(240,176,74,.3);background:rgba(240,160,48,.07)}
#cot-perfhud .ph-icon svg{display:block;width:17px;height:17px}
#cot-perfhud .ph-title{font-family:${FONT_COND};font-size:11px;font-weight:800;line-height:1;
  letter-spacing:.18em;text-transform:uppercase;color:#f2f6f9}
#cot-perfhud .ph-sub{margin-top:5px;font-family:${FONT_COND};font-size:7px;font-weight:700;
  letter-spacing:.14em;text-transform:uppercase;color:#7e8e99}
#cot-perfhud .ph-state{display:flex;align-items:center;gap:6px;font-family:${FONT_COND};font-size:8px;
  font-weight:800;letter-spacing:.14em;color:#9ee0b0}
#cot-perfhud .ph-state::before{content:"";width:6px;height:6px;background:#78d491;
  box-shadow:0 0 8px rgba(120,212,145,.5)}
#cot-perfhud .ph-mobile-toggle{display:none;width:44px;height:44px;margin:-5px -8px -5px 4px;
  place-items:center;border:0;border-left:1px solid rgba(177,196,210,.2);background:transparent;
  color:#ffd27a;cursor:pointer;pointer-events:auto}
#cot-perfhud .ph-mobile-toggle::before{content:"";width:9px;height:9px;border-right:2px solid currentColor;
  border-bottom:2px solid currentColor;transform:translateY(-2px) rotate(45deg);transition:transform 120ms ease}
#cot-perfhud.mobile-expanded .ph-mobile-toggle::before{transform:translateY(2px) rotate(225deg)}
#cot-perfhud .ph-mobile-toggle:focus-visible{outline:2px solid #ffd27a;outline-offset:-3px}
#cot-perfhud.has-error .ph-state{color:#ff9b91}#cot-perfhud.has-error .ph-state::before{background:#ef6157}
#cot-perfhud [data-grid]{display:grid;grid-template-columns:1fr 1fr;gap:1px;padding:1px;
  background:rgba(177,196,210,.1)}
#cot-perfhud .ph-section{min-width:0;padding:9px 10px;background:rgba(8,13,17,.98)}
#cot-perfhud .ph-section.wide{grid-column:1/-1}
#cot-perfhud .ph-label{margin-bottom:5px;font-family:${FONT_COND};font-size:7px;font-weight:800;
  letter-spacing:.17em;color:#8ca09e;text-transform:uppercase}
#cot-perfhud .ph-value{white-space:pre-wrap;color:#d7e0e4}
#cot-perfhud .ph-actions{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,1fr);gap:6px;
  padding:8px;background:#080d11;pointer-events:auto}
#cot-perfhud .ph-action{min-height:44px;padding:7px;border:1px solid rgba(240,176,74,.34);border-radius:2px;
  background:linear-gradient(180deg,rgba(240,160,48,.12),rgba(240,160,48,.045));color:#ffd796;
  font:800 8px/1 ${FONT_COND};letter-spacing:.11em;cursor:pointer;
  transition:transform 90ms ease-out,border-color 90ms ease,background-color 90ms ease}
#cot-perfhud .ph-action:active{transform:scale(.97)}
#cot-perfhud .ph-action:focus-visible{outline:2px solid #ffd27a;outline-offset:2px}
#cot-perfhud .ph-action-status{grid-column:1/-1;min-height:14px;color:#8eaaa5;text-align:right}
@media (hover:hover) and (pointer:fine){#cot-perfhud .ph-action:hover{border-color:rgba(240,176,74,.7);background:rgba(240,160,48,.17)}}
@media (prefers-reduced-motion:reduce){#cot-perfhud .ph-action{transition:none}}
`;

/** Small, shareable report for issue comments; the full trace stays exportable. */
export function buildQaSummary({
  traceStats,
  hudSnapshot,
  telemetry,
  capturedAt = new Date().toISOString(),
}: QaSummaryOptions = {}) {
  return {
    capturedAt,
    trace: traceStats || null,
    frame: hudSnapshot?.stats || null,
    telemetry: telemetry || hudSnapshot?.telemetry || null,
  };
}

function fmtCount(value: number | string | null | undefined): string {
  const n = Number(value) || 0;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}m`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return String(n);
}

function fmtBytes(value: number | string | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n.toFixed(0)} B`;
}

function frameStatsText(stats: FrameStats): string {
  const stall = stats.worstStall ? `${stats.worstStall.toFixed(0)} ms` : '—';
  const simulation = stats.simPct >= 0 ? `${stats.simPct.toFixed(0)}%` : '—';
  return `${stats.fps.toFixed(0)} fps   1% low ${stats.onePctLow.toFixed(0)}\n` +
    `${stats.p50.toFixed(1)} / ${stats.p95.toFixed(1)} / ${stats.p99.toFixed(1)} ms\n` +
    `stall ${stall}   sim ${simulation}`;
}

function renderStatsText(stats: FrameStats): string {
  return `${stats.calls} calls   ${fmtCount(stats.tris)} tri\n` +
    `${stats.programs} programs\n${stats.geometries} geo   ${stats.textures} tex`;
}

function qualityText(quality: QualityTelemetry): string {
  return `${quality.buffer || '—'} buffer  dpr ${quality.dpr ?? '—'}  scale ${quality.dynScale ?? '—'}\n` +
    `${quality.preset || '—'} / ${quality.tier || '—'}   trim ${quality.perfTrim ?? '—'}   ${quality.gpu || 'GPU unavailable'}`;
}

function simulationText(simulation: SimulationTelemetry, gamePhase: string): string {
  return `${simulation.phase || gamePhase || '—'}   ${simulation.map || 'no map'}\n` +
    `${Number(simulation.timeS || 0).toFixed(1)} s   tanks ${simulation.alive ?? '—'}/${simulation.tanks ?? '—'}   shells ${simulation.shells ?? '—'}`;
}

function worldText(world: WorldTelemetry): string {
  return `${world.obstacles ?? '—'} obstacles   ${world.colliders ?? '—'} colliders\n` +
    `${world.concealers ?? '—'} conceal   ${world.destructibles ?? '—'} destruct\n` +
    `${world.wrecks ?? '—'} wreck sites   loose ${world.looseActive ?? '—'}/${world.looseTotal ?? '—'} awake`;
}

function cascadeText(cascades: readonly ShadowCascadeTelemetry[]): string {
  if (!cascades.length) return 'cascade telemetry unavailable';
  return cascades.map((cascade, index) =>
    `C${index} ${cascade.size ?? '—'}${cascade.allocated ? '✓' : '…'} r${Number(cascade.radius || 0).toFixed(2)}`,
  ).join('   ');
}

function shadowText(shadow: ShadowTelemetry): string {
  const rescue = shadow.rescue ? ` · rescue ${shadow.rescue}` : '';
  const cascades = Array.isArray(shadow.cascades) ? shadow.cascades : [];
  return `${shadow.enabled ? 'ON' : 'OFF'}${rescue}   far ${shadow.maxFar ?? '—'}m   throttle ${shadow.throttle ?? '—'}\n` +
    cascadeText(cascades) +
    `\n${shadow.casters ?? '—'} casters   ${shadow.receivers ?? '—'} receivers   shader errors ${shadow.shaderErrors ?? 0}`;
}

function networkText(network: NetworkTelemetry): string {
  if (network.connected == null) return 'local / offline\nno transport overhead';
  return `${network.connected ? 'connected' : 'disconnected'}   RTT ${Number(network.rttMs || 0).toFixed(0)} ms\n` +
    `jitter ${Number(network.jitterMs || 0).toFixed(0)} ms   loss ${Number(network.lossPct || 0).toFixed(1)}%\n` +
    `buffer ${fmtBytes(network.bufferedBytes)}`;
}

function memoryText(stats: FrameStats, memory: MemoryTelemetry, quality: QualityTelemetry): string {
  const heap = stats.heapMB >= 0
    ? `${stats.heapMB.toFixed(0)} / ${stats.heapLimitMB.toFixed(0)} MB JS`
    : 'JS heap unavailable';
  return `${heap}\n${memory.drawBuffer || quality.buffer || '—'} draw buffer`;
}

export function createPerfHud({
  renderer,
  game,
  trace = null,
}: {
  renderer: RendererDiagnostics;
  game: DebugGameState;
  trace?: PerfTracePort | null;
}) {
  ensureStyle('cot-perfhud-style', PERF_HUD_CSS);
  const el = document.createElement('aside');
  el.id = 'cot-perfhud';
  el.setAttribute('aria-label', tr('perfHud.ariaLabel'));
  el.innerHTML = `
    <header class="ph-head"><span class="ph-icon" aria-hidden="true">${uiIconSVG('graphics', 18)}</span>
      <div><div class="ph-title">${tr('perfHud.title')}</div><div class="ph-sub">${tr('perfHud.sub')}</div></div>
      <span class="ph-state" data-status>${tr('perfHud.state.live')}</span>
      <button class="ph-mobile-toggle" type="button" aria-label="${tr('perfHud.expand')}" aria-expanded="false" aria-controls="cot-perfhud-grid"></button></header>
    <div id="cot-perfhud-grid" data-grid></div>`;
  const gridNode = el.querySelector<HTMLElement>('[data-grid]');
  const statusNode = el.querySelector<HTMLElement>('[data-status]');
  const mobileToggle = el.querySelector<HTMLButtonElement>('.ph-mobile-toggle');
  if (!gridNode || !statusNode || !mobileToggle) throw new Error('performance HUD template is incomplete');
  const grid: HTMLElement = gridNode;
  const statusEl: HTMLElement = statusNode;
  mobileToggle.addEventListener('click', () => {
    const expanded = el.classList.toggle('mobile-expanded');
    mobileToggle.setAttribute('aria-expanded', String(expanded));
    mobileToggle.setAttribute('aria-label', expanded ? tr('perfHud.collapse') : tr('perfHud.expand'));
  });
  const sectionEls = new Map<string, HTMLElement>();
  const sectionValue = (id: string): HTMLElement => {
    const value = sectionEls.get(id);
    if (!value) throw new Error(`performance HUD section ${id} is unavailable`);
    return value;
  };
  const makeSection = (id: string, title: string, wide = false): HTMLElement => {
    const section = document.createElement('section');
    section.className = `ph-section${wide ? ' wide' : ''}`;
    section.innerHTML = `<div class="ph-label">${title}</div><div class="ph-value" data-value></div>`;
    grid.appendChild(section);
    const value = section.querySelector<HTMLElement>('[data-value]');
    if (!value) throw new Error(`performance HUD section ${id} is incomplete`);
    sectionEls.set(id, value);
    return value;
  };
  makeSection('frame', tr('perfHud.section.frame'));
  makeSection('render', tr('perfHud.section.render'));
  makeSection('quality', tr('perfHud.section.quality'), true);
  makeSection('simulation', tr('perfHud.section.simulation'));
  makeSection('world', tr('perfHud.section.world'));
  makeSection('shadows', tr('perfHud.section.shadows'), true);
  makeSection('network', tr('perfHud.section.network'));
  makeSection('memory', tr('perfHud.section.memory'));
  if (trace?.enabled) {
    const actions = document.createElement('div');
    actions.className = 'ph-actions';
    const action = (label: string, title: string): HTMLButtonElement => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.title = title;
      button.className = 'ph-action';
      actions.appendChild(button);
      return button;
    };
    const markButton = action(tr('perfHud.markIssue'), tr('perfHud.markIssueTitle'));
    const copyButton = action(tr('perfHud.copySummary'), tr('perfHud.copySummaryTitle'));
    const exportButton = action(tr('perfHud.exportJson'), tr('perfHud.exportJsonTitle'));
    const actionStatus = document.createElement('div');
    actionStatus.setAttribute('role', 'status');
    actionStatus.className = 'ph-action-status';
    actions.appendChild(actionStatus);
    grid.appendChild(actions);

    const setStatus = (message: string, error = false): void => {
      actionStatus.textContent = message;
      actionStatus.style.color = error ? '#ff9d7c' : '#8fe0bd';
      setTimeout(() => { if (actionStatus.textContent === message) actionStatus.textContent = ''; }, 3500);
    };
    markButton.addEventListener('click', () => {
      trace.mark('tester:issue', { hud: stats(), telemetry: latestTelemetry });
      setStatus(tr('perfHud.issueMarked'));
    });
    copyButton.addEventListener('click', async () => {
      const report = buildQaSummary({
        traceStats: trace.stats(), hudSnapshot: { stats: stats(), telemetry: latestTelemetry },
      });
      const text = JSON.stringify(report, null, 2);
      try {
        await navigator.clipboard.writeText(text);
        setStatus(tr('perfHud.copy.success'));
      } catch (_) {
        const field = document.createElement('textarea');
        field.value = text;
        field.style.cssText = 'position:fixed;left:-9999px';
        document.body.appendChild(field);
        field.select();
        const copied = document.execCommand('copy');
        field.remove();
        setStatus(copied ? tr('perfHud.copy.success') : tr('perfHud.copy.unavailable'), !copied);
      }
    });
    exportButton.addEventListener('click', () => {
      const filename = trace.download();
      setStatus(filename ? tr('perfHud.export.saved', { filename }) : tr('perfHud.export.unavailable'), !filename);
    });
  }
  document.body.appendChild(el);

  // Frame-time ring (240 frames ≈ 4 s @60), long-task observer (5 s window).
  const ring = new Float32Array(240);
  const sorted = new Float32Array(240);
  let ri = 0;
  let rn = 0;
  const stalls: Array<{ t: number; d: number }> = [];
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
  let telemetryProvider: (() => DebugTelemetry | null | undefined) | null = null;
  let latestTelemetry: DebugTelemetry | null = null;
  let visible = false;
  let captureHidden = false;
  const applyVisibility = () => {
    const painted = visible && !captureHidden;
    el.style.display = painted ? 'block' : 'none';
    document.body.classList.toggle('cot-debug-hud', painted);
  };
  applyVisibility();

  function stats(): FrameStats | null {
    const n = rn;
    if (!n) return null;
    sorted.set(ring.subarray(0, n));
    const view = sorted.subarray(0, n).sort();
    let sum = 0;
    for (let i = 0; i < n; i++) sum += view[i];
    const avg = sum / n;
    const at = (p: number): number => view[Math.min(n - 1, Math.floor((n - 1) * p))];
    const memory = (performance as PerformanceWithMemory).memory;
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
      heapMB: memory ? memory.usedJSHeapSize / 1048576 : -1,
      heapLimitMB: memory ? memory.jsHeapSizeLimit / 1048576 : -1,
      simPct,
    };
  }

  function renderDashboard(s: FrameStats): void {
    let t = latestTelemetry;
    if (telemetryProvider) {
      try {
        t = telemetryProvider() || null;
      } catch (error) {
        t = { error: error instanceof Error ? error.message : String(error) };
      }
      latestTelemetry = t;
    }
    const q = t?.quality || {};
    const sim = t?.simulation || {};
    const world = t?.world || {};
    const shadow = t?.shadows || {};
    const network = t?.network || {};
    const memory = t?.memory || {};
    statusEl.textContent = t?.error ? tr('perfHud.state.error') : tr('perfHud.state.live');
    el.classList.toggle('has-error', !!t?.error);
    sectionValue('frame').textContent = frameStatsText(s);
    sectionValue('render').textContent = renderStatsText(s);
    sectionValue('quality').textContent = qualityText(q);
    sectionValue('simulation').textContent = simulationText(sim, game.phase);
    sectionValue('world').textContent = worldText(world);
    sectionValue('shadows').textContent = shadowText(shadow);
    sectionValue('network').textContent = networkText(network);
    sectionValue('memory').textContent = memoryText(s, memory, q);
  }

  return {
    el,
    /** Call once per rAF, AFTER the render (dtMs = frame delta). */
    update(dtMs: number) {
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
    toggle() { visible = !visible; applyVisibility(); },
    setVisible(next: boolean) { visible = next; applyVisibility(); },
    isVisible: () => visible,
    setTelemetryProvider(provider: (() => DebugTelemetry | null | undefined) | null) {
      telemetryProvider = typeof provider === 'function' ? provider : null;
    },
    /** Keep developer/player diagnostics out of deterministic capture art. */
    setCaptureHidden(hidden: boolean) {
      captureHidden = hidden;
      applyVisibility();
    },
    /** Probe hooks used by performance and map-audit tooling. */
    stats,
    snapshot() { return { stats: stats(), telemetry: latestTelemetry }; },
  };
}
