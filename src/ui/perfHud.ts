// Live performance + systems dashboard. The dashboard remains a lazy,
// explicitly enabled surface; input settings own persistence while this
// module owns only presentation and bounded 4 Hz telemetry paint.

import { ensureStyle } from './styleLayers.ts';
import { esc } from './components/escape.ts';
import { openSurfaceIds } from './components/surfaceStack.ts';
import { t as tr } from './i18n.ts';
import { uiIconSVG } from './uiIcons.ts';
import type { CompletedPostFrame } from '../engine/postFrameAccounting.ts';

export { debugModeRequested } from '../dev/debugIntent.ts';

interface RendererDiagnostics {
  info: {
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
  /** The map's air (world/mapAmbience.ts): its layers' instances and draws. */
  ambience?: string | null;
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
  renderScope: 'last-completed-post-frame';
  renderFrameSerial: number | null;
  calls: number | null;
  tris: number | null;
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
  if (!Number.isFinite(n) || n < 0) return MISSING;
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n.toFixed(0)} B`;
}

/** The mark of a readout the telemetry does not carry. */
const MISSING = '–';
const shown = (value: number | string | boolean | null | undefined): string => (value == null || value === '' ? MISSING : String(value));
const fixed = (value: number | string | null | undefined, digits = 0): string => {
  const n = Number(value);
  return value == null || value === '' || !Number.isFinite(n) ? MISSING : n.toFixed(digits);
};
const share = (part: number | string | null | undefined, whole: number | string | null | undefined): string => `${shown(part)} / ${shown(whole)}`;

/** What a fact row reads: a frame's stats, the telemetry's parts and the game's phase. */
interface FactSource {
  s: FrameStats;
  q: QualityTelemetry;
  sim: SimulationTelemetry;
  world: WorldTelemetry;
  shadow: ShadowTelemetry;
  network: NetworkTelemetry;
  phase: string;
}

interface FactRow {
  /** Its label's catalog key is perfHud.fact.<id>. */
  readonly id: string;
  /** Its value, or null where it says nothing (a local battle's network figures): the row stands down. */
  readonly value: (f: FactSource) => string | null;
  /** A value that runs long (the GPU's name, the cascades): the group's whole width. */
  readonly long?: boolean;
}

interface FactGroup {
  /** Its heading's catalog key is perfHud.section.<id>; its grid area is its id. */
  readonly id: string;
  /** Its rows in two columns, across the panel. */
  readonly wide?: boolean;
  readonly rows: readonly FactRow[];
}

const ms = (value: number): string => tr('perfHud.v.ms', { n: value.toFixed(1) });
const online = (network: NetworkTelemetry): boolean => network.connected != null;

function cascadesText(cascades: readonly ShadowCascadeTelemetry[] | undefined): string {
  if (!cascades?.length) return tr('perfHud.v.na');
  return cascades.map((cascade, index) =>
    `C${index} ${shown(cascade.size)}${cascade.allocated ? '' : '…'} r${fixed(cascade.radius, 0)}`).join('  ');
}

/** The readouts, grouped: frame, render, resolution, simulation, world, shadows, network, memory. */
const FACT_GROUPS: readonly FactGroup[] = [
  { id: 'frame', rows: [
    { id: 'fps', value: ({ s }) => tr('perfHud.v.fps', { n: s.fps.toFixed(0) }) },
    { id: 'low', value: ({ s }) => tr('perfHud.v.fps', { n: s.onePctLow.toFixed(0) }) },
    { id: 'p50', value: ({ s }) => ms(s.p50) },
    { id: 'p95', value: ({ s }) => ms(s.p95) },
    { id: 'p99', value: ({ s }) => ms(s.p99) },
    { id: 'stall', value: ({ s }) => (s.worstStall ? tr('perfHud.v.ms', { n: s.worstStall.toFixed(0) }) : tr('perfHud.v.none')) },
    { id: 'sim', value: ({ s }) => (s.simPct >= 0 ? `${s.simPct.toFixed(0)}%` : MISSING) },
  ] },
  { id: 'render', rows: [
    { id: 'calls', value: ({ s }) => (s.calls === null ? MISSING : String(s.calls)) },
    { id: 'tris', value: ({ s }) => (s.tris === null ? MISSING : fmtCount(s.tris)) },
    { id: 'programs', value: ({ s }) => String(s.programs) },
  ] },
  { id: 'memory', rows: [
    { id: 'heap', value: ({ s }) => (s.heapMB >= 0 ? tr('perfHud.v.heap', { used: s.heapMB.toFixed(0), limit: s.heapLimitMB.toFixed(0) }) : tr('perfHud.v.na')) },
    { id: 'geometries', value: ({ s }) => String(s.geometries) },
    { id: 'textures', value: ({ s }) => String(s.textures) },
  ] },
  { id: 'quality', wide: true, rows: [
    { id: 'buffer', value: ({ q }) => shown(q.buffer) },
    { id: 'dpr', value: ({ q }) => shown(q.dpr) },
    { id: 'scale', value: ({ q }) => shown(q.dynScale) },
    { id: 'trim', value: ({ q }) => shown(q.perfTrim) },
    { id: 'preset', value: ({ q }) => shown(q.preset) },
    { id: 'tier', value: ({ q }) => shown(q.tier) },
    { id: 'gpu', long: true, value: ({ q }) => q.gpu || tr('perfHud.v.na') },
  ] },
  { id: 'simulation', rows: [
    { id: 'phase', value: ({ sim, phase }) => shown(sim.phase || phase) },
    { id: 'map', value: ({ sim }) => sim.map || tr('perfHud.v.none') },
    { id: 'time', value: ({ sim }) => tr('perfHud.v.seconds', { n: Number(sim.timeS || 0).toFixed(1) }) },
    { id: 'tanks', value: ({ sim }) => share(sim.alive, sim.tanks) },
    { id: 'shells', value: ({ sim }) => shown(sim.shells) },
  ] },
  { id: 'world', rows: [
    { id: 'obstacles', value: ({ world }) => shown(world.obstacles) },
    { id: 'colliders', value: ({ world }) => shown(world.colliders) },
    { id: 'conceal', value: ({ world }) => shown(world.concealers) },
    { id: 'destruct', value: ({ world }) => shown(world.destructibles) },
    { id: 'wrecks', value: ({ world }) => shown(world.wrecks) },
    { id: 'loose', value: ({ world }) => share(world.looseActive, world.looseTotal) },
    { id: 'air', long: true, value: ({ world }) => world.ambience || null },
  ] },
  { id: 'network', rows: [
    { id: 'link', value: ({ network }) => (!online(network) ? tr('perfHud.v.local')
      : network.connected ? tr('perfHud.v.connected') : tr('perfHud.v.disconnected')) },
    { id: 'rtt', value: ({ network }) => (online(network) ? tr('perfHud.v.ms', { n: fixed(network.rttMs) }) : null) },
    { id: 'jitter', value: ({ network }) => (online(network) ? tr('perfHud.v.ms', { n: fixed(network.jitterMs) }) : null) },
    { id: 'loss', value: ({ network }) => (online(network) ? `${fixed(network.lossPct ?? 0, 1)}%` : null) },
    { id: 'buffered', value: ({ network }) => (online(network) ? fmtBytes(network.bufferedBytes) : null) },
  ] },
  { id: 'shadows', wide: true, rows: [
    { id: 'shadows', value: ({ shadow }) => (!shadow.enabled ? tr('perfHud.v.off')
      : shadow.rescue ? tr('perfHud.v.onRescue', { mode: shadow.rescue }) : tr('perfHud.v.on')) },
    { id: 'far', value: ({ shadow }) => (shadow.maxFar == null ? MISSING : tr('perfHud.v.metres', { n: shadow.maxFar })) },
    { id: 'throttle', value: ({ shadow }) => shown(shadow.throttle) },
    { id: 'shaderErrors', value: ({ shadow }) => String(shadow.shaderErrors ?? 0) },
    { id: 'casters', value: ({ shadow }) => shown(shadow.casters) },
    { id: 'receivers', value: ({ shadow }) => shown(shadow.receivers) },
    { id: 'cascades', long: true, value: ({ shadow }) => cascadesText(shadow.cascades) },
  ] },
];

/* (owner 2026-10-28: "make it look better and have a exit button"): the kit's HUD plate, its type and tokens, the
   readouts in fact rows by group, a close of the kit's own (48 px) and the QA actions as kit buttons. Pointer-transparent
   but for its controls: a battle press goes through it. (Its rows set close: with the QA actions it stood 846 px tall at
   1920x1080, over the minimap's title.) */
const PERF_HUD_CSS = `
/* (a column: the head, the facts and the actions, the facts scrolling where the panel is capped; capped above the minimap
   where the map stands under it, --ph-max: at 1920x1080 and below it covered the map's title and first row) */
#cot-perfhud{position:fixed;top:12px;right:12px;z-index:var(--z-menu);display:flex;flex-direction:column;width:min(420px,calc(100vw - 24px));
  max-height:min(var(--ph-max,100dvh),calc(var(--cot-viewport-height,100dvh) - 24px));box-sizing:border-box;overflow:hidden;
  color:var(--ink-1);background:var(--hud-plate-strong);pointer-events:none}
#cot-perfhud *{box-sizing:border-box}
#cot-perfhud .ph-head{flex:none;display:flex;align-items:center;gap:var(--s2);min-height:52px;
  padding:2px 2px 2px var(--s4);background:var(--hud-plate-strong);border-bottom:1px solid var(--line-2)}
#cot-perfhud .ph-title{flex:1 1 auto;min-width:0;margin:0;font:700 var(--fs-14)/1.2 var(--font-ui);letter-spacing:var(--track-label-s);
  text-transform:uppercase;color:var(--ink-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#cot-perfhud .ph-state{flex:none}
#cot-perfhud .ph-head .cot-c-btn{flex:none;pointer-events:auto}
#cot-perfhud .ph-mobile-toggle{display:none}
#cot-perfhud .ph-mobile-toggle svg{transition:transform var(--dur-fast) var(--cot-ease-out)}
#cot-perfhud.mobile-expanded .ph-mobile-toggle svg{transform:rotate(180deg)}
#cot-perfhud .ph-grid{flex:0 1 auto;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;
  display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:var(--s5);padding:var(--s1) var(--s4) var(--s3);
  grid-template-areas:"frame render" "frame memory" "quality quality" "simulation world" "network world" "shadows shadows"}
/* (the facts take the pointer only while they scroll: elsewhere a press goes through the panel to the page under it,
   the Garage's Deploy under a ?debug=1 panel at 1280x720, a battle's free cursor) */
#cot-perfhud.ph-scrolls .ph-grid{pointer-events:auto}
#cot-perfhud .ph-group{min-width:0;padding:var(--s2) 0 var(--s1);border-top:1px solid var(--line-1)}
#cot-perfhud .ph-group[data-group=frame],#cot-perfhud .ph-group[data-group=render]{border-top:0}
${FACT_GROUPS.map(({ id }) => `#cot-perfhud .ph-group[data-group=${id}]{grid-area:${id}}`).join('\n')}
#cot-perfhud .ph-cap{margin:0 0 2px;font:600 max(var(--fs-floor-11),var(--fs-11))/1.3 var(--font-ui);letter-spacing:var(--track-label-s);
  text-transform:uppercase;color:var(--ink-3)}
#cot-perfhud .ph-facts{margin:0;display:grid;grid-template-columns:minmax(0,1fr);column-gap:var(--s5)}
#cot-perfhud .ph-group.wide .ph-facts{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
#cot-perfhud .ph-fact{display:flex;align-items:baseline;justify-content:space-between;gap:var(--s2);min-width:0}
#cot-perfhud .ph-fact[hidden]{display:none}
#cot-perfhud .ph-fact.long{grid-column:1/-1}
#cot-perfhud .ph-fact dt{flex:none;font:500 max(var(--fs-floor-12),var(--fs-12))/1.3 var(--font-ui);color:var(--ink-2);white-space:nowrap}
#cot-perfhud .ph-fact dd{min-width:0;margin:0;font:500 max(var(--fs-floor-12),var(--fs-12))/1.3 var(--font-data);
  color:var(--ink-1);text-align:right;overflow-wrap:anywhere}
#cot-perfhud.has-error .ph-group dd{color:var(--ink-3)}
/* (the actions share the row by their words and wrap whole: a third of the panel each cut "Copy summary" at 1920) */
#cot-perfhud .ph-actions{flex:none;display:flex;flex-wrap:wrap;gap:var(--s2);padding:var(--s2) var(--s4) var(--s3);
  border-top:1px solid var(--line-2);pointer-events:auto}
#cot-perfhud .ph-actions .cot-c-btn{flex:1 1 auto;padding-inline:var(--s3)}
#cot-perfhud .ph-action-status{flex:1 0 100%;min-height:16px;font:500 max(var(--fs-floor-12),var(--fs-12))/1.3 var(--font-ui);
  color:var(--text-ok);text-align:right}
#cot-perfhud .ph-action-status.error{color:var(--text-danger)}
body[data-cot-width='phone'] #cot-perfhud .ph-grid{grid-template-areas:none}
body[data-cot-width='phone'] #cot-perfhud .ph-group{grid-area:auto}
body:is([data-cot-width='phone'],[data-cot-width='compact']) #cot-perfhud:not(.mobile-expanded) .ph-actions{display:none}
@media (prefers-reduced-motion:reduce){#cot-perfhud .ph-mobile-toggle svg{transition:none}}
`;

export function createPerfHud({
  renderer,
  game,
  trace = null,
  readRenderFrame,
  onClose,
}: {
  renderer: RendererDiagnostics;
  game: DebugGameState;
  trace?: PerfTracePort | null;
  readRenderFrame?: () => CompletedPostFrame | null;
  /** The close (its button, Escape): main.ts turns the saved setting off with it. Without one the panel hides itself. */
  onClose?: () => void;
}) {
  ensureStyle('cot-perfhud-style', PERF_HUD_CSS, 'surfaces');
  const el = document.createElement('aside');
  el.id = 'cot-perfhud';
  el.className = 'cot-c-plate cot-c-plate--hud';
  el.setAttribute('aria-label', tr('perfHud.ariaLabel'));
  // (the phone's fold and the close are the kit's ghost icon buttons, 48 px, as the Garage's closes)
  el.innerHTML = `<header class="ph-head"><h2 class="ph-title">${esc(tr('perfHud.title'))}</h2>`
    + `<span class="cot-c-tag cot-c-tag--ok ph-state">${esc(tr('perfHud.state.live'))}</span>`
    + `<button type="button" class="cot-c-btn cot-c-btn--icon cot-c-btn--ghost ph-mobile-toggle" data-ui-sound="toggle" aria-expanded="false" `
    + `aria-controls="cot-perfhud-grid" aria-label="${esc(tr('perfHud.expand'))}">${uiIconSVG('chevronDown', 18)}</button>`
    + `<button type="button" class="cot-c-btn cot-c-btn--icon cot-c-btn--ghost ph-close" data-ui-sound="back" `
    + `aria-label="${esc(tr('perfHud.close'))}">${uiIconSVG('close', 18)}</button></header>`;
  const statusNode = el.querySelector<HTMLElement>('.ph-state');
  const mobileToggle = el.querySelector<HTMLButtonElement>('.ph-mobile-toggle');
  const closeButton = el.querySelector<HTMLButtonElement>('.ph-close');
  if (!statusNode || !mobileToggle || !closeButton) throw new Error('performance HUD template is incomplete');
  const statusEl: HTMLElement = statusNode;
  mobileToggle.addEventListener('click', () => {
    const expanded = el.classList.toggle('mobile-expanded');
    mobileToggle.setAttribute('aria-expanded', String(expanded));
    mobileToggle.setAttribute('aria-label', expanded ? tr('perfHud.collapse') : tr('perfHud.expand'));
  });
  const grid = document.createElement('div');
  grid.id = 'cot-perfhud-grid';
  grid.className = 'ph-grid';
  grid.setAttribute('data-grid', '');
  el.appendChild(grid);
  // each row's value cell, written only when its text changes (the panel repaints at 4 Hz)
  const factCells: { row: FactRow; fact: HTMLElement; value: HTMLElement }[] = [];
  for (const group of FACT_GROUPS) {
    const section = document.createElement('section');
    section.className = `ph-group${group.wide ? ' wide' : ''}`;
    section.setAttribute('data-group', group.id);
    const heading = document.createElement('h3');
    heading.className = 'ph-cap';
    heading.textContent = tr(`perfHud.section.${group.id}`);
    const list = document.createElement('dl');
    list.className = 'ph-facts';
    for (const row of group.rows) {
      const fact = document.createElement('div');
      fact.className = `ph-fact${row.long ? ' long' : ''}`;
      fact.setAttribute('data-fact', row.id);
      const label = document.createElement('dt');
      label.textContent = tr(`perfHud.fact.${row.id}`);
      const value = document.createElement('dd');
      value.className = 'num';
      value.textContent = MISSING;
      fact.appendChild(label);
      fact.appendChild(value);
      list.appendChild(fact);
      factCells.push({ row, fact, value });
    }
    section.appendChild(heading);
    section.appendChild(list);
    grid.appendChild(section);
  }
  if (trace?.enabled) {
    const actions = document.createElement('div');
    actions.className = 'ph-actions';
    const action = (label: string, title: string): HTMLButtonElement => {
      const control = document.createElement('button');
      control.type = 'button';
      control.className = 'cot-c-btn cot-c-btn--36';
      control.title = title;
      control.setAttribute('data-ui-sound', 'press');
      const text = document.createElement('span');
      text.className = 'cot-c-btn__label';
      text.textContent = label;
      control.appendChild(text);
      actions.appendChild(control);
      return control;
    };
    const markButton = action(tr('perfHud.markIssue'), tr('perfHud.markIssueTitle'));
    const copyButton = action(tr('perfHud.copySummary'), tr('perfHud.copySummaryTitle'));
    const exportButton = action(tr('perfHud.exportJson'), tr('perfHud.exportJsonTitle'));
    const actionStatus = document.createElement('div');
    actionStatus.setAttribute('role', 'status');
    actionStatus.className = 'ph-action-status';
    actions.appendChild(actionStatus);
    el.appendChild(actions);

    const setStatus = (message: string, error = false): void => {
      actionStatus.textContent = message;
      actionStatus.classList.toggle('error', error);
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
  // The panel stops above the minimap where the map stands under it on the right (--ph-max): measured in the map's
  // resize callbacks, where layout is already done, and on a window resize; the map is looked for at the 4 Hz paint
  // until it exists (it is the battle's)
  const MAP_GAP = 8;
  let watchedMap: Element | null = null;
  const fitAboveMap = (): void => {
    const map = watchedMap?.isConnected ? watchedMap.getBoundingClientRect() : null;
    const top = el.getBoundingClientRect().top;
    const room = map && map.height > 0 && map.left > window.innerWidth / 2 && map.top > top ? Math.max(200, Math.floor(map.top - MAP_GAP - top)) : 0;
    const value = room ? `${room}px` : '';
    if (el.style.getPropertyValue('--ph-max') === value) return;
    if (value) el.style.setProperty('--ph-max', value); else el.style.removeProperty('--ph-max');
  };
  const mapResize = typeof ResizeObserver === 'function' ? new ResizeObserver(fitAboveMap) : null;
  const findMap = (): void => {
    if (!mapResize || (watchedMap?.isConnected ?? false)) return;
    const map = typeof document.querySelector === 'function' ? document.querySelector('.cot-minimap') : null;
    if (!map || map === watchedMap) return;
    if (watchedMap) mapResize.unobserve(watchedMap);
    watchedMap = map;
    mapResize.observe(map);
  };
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('resize', () => { if (watchedMap) fitAboveMap(); });
  // whether the facts scroll, read in their own resize callbacks (the body's and each group's)
  const fitScroll = (): void => { el.classList.toggle('ph-scrolls', grid.scrollHeight > grid.clientHeight + 1); };
  const bodyResize = typeof ResizeObserver === 'function' ? new ResizeObserver(fitScroll) : null;
  if (bodyResize) for (const part of [grid, ...grid.children]) bodyResize.observe(part);
  const close = (): void => {
    if (onClose) onClose();
    else { visible = false; applyVisibility(); }
  };
  closeButton.addEventListener('click', close);
  // Escape closes the panel when no surface stands open over the page (the stack's own Escape, surfaceStack.ts, closes
  // its top one first): a battle's Escape takes the panel down before it opens Settings, and never opens the panel
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || event.repeat || event.defaultPrevented || event.isComposing) return;
      if (!visible || captureHidden || openSurfaceIds().length) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    }, true);
  }

  // Frame-time ring (240 frames ≈ 4 s @60), long-task observer (5 s window).
  const ring = new Float32Array(240);
  const sorted = new Float32Array(240);
  let ri = 0;
  let rn = 0;
  const stalls: Array<{ t: number; d: number }> = [];
  try {
    new PerformanceObserver((list) => {
      const now = performance.now();
      // Shot/Studio frames can skip HUD updates; collection must own expiry too.
      while (stalls.length && now - stalls[0].t > 5000) stalls.shift();
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
    el.style.display = painted ? '' : 'none';
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
    const renderFrame = readRenderFrame?.() ?? null;
    return {
      fps: avg > 0 ? 1000 / avg : 0,
      onePctLow: at(0.99) > 0 ? 1000 / at(0.99) : 0,
      p50: at(0.50),
      p95: at(0.95),
      p99: at(0.99),
      worstStall: stalls.reduce((a, stall) => Math.max(a, stall.d), 0),
      renderScope: 'last-completed-post-frame',
      renderFrameSerial: renderFrame?.serial ?? null,
      calls: renderFrame?.calls ?? null,
      tris: renderFrame?.triangles ?? null,
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
    const failed = !!t?.error;
    statusEl.textContent = failed ? tr('perfHud.state.error') : tr('perfHud.state.live');
    statusEl.classList.toggle('cot-c-tag--ok', !failed);
    statusEl.classList.toggle('cot-c-tag--danger', failed);
    el.classList.toggle('has-error', failed);
    const source: FactSource = {
      s, q: t?.quality || {}, sim: t?.simulation || {}, world: t?.world || {}, shadow: t?.shadows || {},
      network: t?.network || {}, phase: game.phase,
    };
    for (const cell of factCells) {
      const text = cell.row.value(source);
      if (cell.fact.hidden !== (text === null)) cell.fact.hidden = text === null;
      if (text !== null && cell.value.textContent !== text) cell.value.textContent = text;
    }
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
      if (visible && !captureHidden) { findMap(); renderDashboard(s); }
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
