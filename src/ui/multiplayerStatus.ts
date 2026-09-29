/**
 * src/ui/multiplayerStatus.ts — the Multiplayer v2 network status surface.
 *
 * One compact strip (health glyph · ping · seat · seated of 28) that stays on
 * screen in every v2 battle and in the v2 lobby while the room waits for its
 * match; a tap or the network-details action expands it to the whole status
 * model (link, round trip, cadence, buffer, loss, corrections, traffic,
 * reconnects, room, region); a banner names what is happening when the link
 * is degraded, reconnecting ("attempt 2 · next try in 3 s"), stalled, dropped
 * by the server or lost, without ever taking the pointer; the Leave battle
 * control lives in the panel, in the banner once the link is bad, and behind
 * the leave action (armed on the first press, confirmed by a second inside
 * the window). Every rule the surface shows comes from
 * `src/mp/session/networkStatus.ts`; this module only formats and paints,
 * at most at the model's sample cadence. Layout follows the responsive body
 * attributes (no width media queries; the same lanes `.cot-net` uses).
 */
import { createElement, ensureStyle } from './dom.ts';
import { FONT_COND } from './fonts.ts';
import { uiIconSVG } from './uiIcons.ts';
import { t } from './i18n.ts';
import type { NetworkBanner, NetworkHealth, NetworkHealthReason, NetworkStatusSnapshot } from '../mp/session/networkStatus.ts';

const STYLE_ID = 'cot-mp-status-style';
export const MP_STATUS_PANEL_STORAGE_KEY = 'cot.mp.netpanel';
export const LEAVE_CONFIRM_MS = 2500;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type MultiplayerStatusHost = 'battle' | 'lobby';

export interface MultiplayerStatusSurfaceOptions {
  /** `battle`: fixed top-right under the fps/ping plate; `lobby`: inline in `container`. */
  host?: MultiplayerStatusHost;
  container?: HTMLElement | null;
  /** The Leave battle control (absent in the lobby: the lobby has its own leave). */
  onLeave?: (() => void) | null;
  storage?: StorageLike | null;
  now?: () => number;
  leaveConfirmMs?: number;
}

export interface MultiplayerStatusSurface {
  readonly root: HTMLElement;
  readonly panelOpen: boolean;
  /** Paint a sample (the model's cadence, never per frame). */
  set(snapshot: Readonly<NetworkStatusSnapshot>, banner: NetworkBanner, nowMs?: number): void;
  togglePanel(open?: boolean): void;
  /** The leave action: the first press arms the banner, a second press inside the window leaves. */
  pressLeave(): 'armed' | 'left' | 'ignored';
  dispose(): void;
}

// ------------------------------------------------------------ style

export const MP_STATUS_CSS = `.cot-mp-status{position:fixed;z-index:91;top:38px;right:10px;display:flex;flex-direction:column;align-items:flex-end;gap:6px;
  font-family:${FONT_COND};font-variant-numeric:tabular-nums;text-transform:uppercase;text-shadow:0 1px 2px rgba(0,0,0,.85);pointer-events:none}
.cot-mp-status.lobby{position:static;align-items:flex-start;text-shadow:none}
.cot-mp-strip{display:inline-flex;align-items:center;gap:8px;min-height:28px;padding:3px 9px;border:1px solid rgba(174,193,207,.22);border-radius:0;
  background:linear-gradient(180deg,rgba(14,20,25,.86),rgba(5,9,12,.78));box-shadow:0 5px 14px rgba(0,0,0,.22);color:#dce6ed;
  font:inherit;font-size:11px;font-weight:800;letter-spacing:.04em;cursor:pointer;pointer-events:auto}
.cot-mp-strip:focus-visible{outline:2px solid #fff;outline-offset:2px}
.cot-mp-strip .glyph{display:inline-flex;width:16px;height:16px;color:#b9e7c0}
.cot-mp-strip .glyph svg{width:16px;height:16px}
.cot-mp-strip .glyph .b1,.cot-mp-strip .glyph .b2,.cot-mp-strip .glyph .b3{opacity:1}
.cot-mp-strip.degraded .glyph{color:#ffd27a}.cot-mp-strip.degraded .glyph .b3{opacity:.22}
.cot-mp-strip.bad .glyph{color:#ff8c82}.cot-mp-strip.bad .glyph .b2,.cot-mp-strip.bad .glyph .b3{opacity:.22}
.cot-mp-strip.offline .glyph{color:#ff8c82}.cot-mp-strip.offline .glyph .b1,.cot-mp-strip.offline .glyph .b2,.cot-mp-strip.offline .glyph .b3{opacity:.22}
.cot-mp-strip.unknown .glyph{color:#8494a0}.cot-mp-strip.unknown .glyph .b2,.cot-mp-strip.unknown .glyph .b3{opacity:.22}
.cot-mp-strip .unit{display:inline-grid;grid-template-columns:auto auto;align-items:baseline;column-gap:4px}
.cot-mp-strip .unit+.unit{padding-left:8px;border-left:1px solid rgba(171,190,204,.2)}
.cot-mp-strip .unit b{font-size:11px;font-weight:800;line-height:1}
.cot-mp-strip .unit i{font-style:normal;font-size:6.5px;font-weight:800;line-height:1;letter-spacing:.13em;color:#8494a0}
.cot-mp-strip.good .ping b{color:#b9e7c0}.cot-mp-strip.degraded .ping b{color:#ffd27a}.cot-mp-strip.bad .ping b,.cot-mp-strip.offline .ping b{color:#ff8c82}
.cot-mp-strip .unit.host b{color:#ffd27a;letter-spacing:.12em}
.cot-mp-banner.migrating{color:#cbeaff;border-color:rgba(174,193,207,.55)}
.cot-mp-banner{position:fixed;left:50%;top:88px;transform:translate(-50%,0);z-index:91;min-width:220px;max-width:calc(100vw - 32px);box-sizing:border-box;
  padding:8px 16px;border:1px solid rgba(238,166,67,.62);background:rgba(9,13,18,.94);box-shadow:0 12px 36px rgba(0,0,0,.52);color:#f2bd73;
  font:800 11px ${FONT_COND};letter-spacing:.12em;text-align:center;text-transform:uppercase;pointer-events:none}
.cot-mp-banner.lobby{position:static;transform:none;max-width:none}
.cot-mp-banner[hidden]{display:none}
.cot-mp-banner.bad,.cot-mp-banner.offline{color:#ff887b;border-color:rgba(255,103,91,.7)}
.cot-mp-banner .leave{display:none;margin:8px auto 0}
.cot-mp-banner.leaving .leave{display:block}
.cot-mp-leave{min-height:44px;padding:8px 14px;border:1px solid currentColor;border-radius:0;background:#151c24;color:#f0a9a0;
  font:800 11px ${FONT_COND};letter-spacing:.12em;text-transform:uppercase;cursor:pointer;pointer-events:auto}
.cot-mp-leave:hover{color:#ffd0c5;border-color:rgba(239,110,82,.9)}
.cot-mp-leave:focus-visible{outline:2px solid #fff;outline-offset:3px}
.cot-mp-panel{width:300px;max-width:calc(100vw - 20px);box-sizing:border-box;padding:8px 10px 10px;border:1px solid rgba(174,193,207,.22);
  background:rgba(7,11,15,.92);box-shadow:0 12px 36px rgba(0,0,0,.45);color:#cbeaff;font-size:10.5px;font-weight:700;letter-spacing:.04em;pointer-events:auto}
.cot-mp-panel[hidden]{display:none}
.cot-mp-panel .head{display:flex;justify-content:space-between;gap:10px;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid rgba(171,190,204,.2);font-size:11px;color:#dce6ed}
.cot-mp-panel .head .verdict{color:#b9e7c0}.cot-mp-panel.degraded .head .verdict{color:#ffd27a}.cot-mp-panel.bad .head .verdict,.cot-mp-panel.offline .head .verdict{color:#ff8c82}
.cot-mp-panel .row{display:grid;grid-template-columns:minmax(74px,auto) 1fr;column-gap:10px;padding:2px 0;text-transform:none}
.cot-mp-panel .row span{color:#8494a0;text-transform:uppercase;letter-spacing:.1em;font-size:9px;align-self:baseline}
.cot-mp-panel .row b{font-weight:700;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cot-mp-panel .cot-mp-leave{display:block;width:100%;margin-top:8px}
body.cot-touch-layout .cot-mp-strip{min-height:44px;padding:6px 12px}
body.cot-touch-layout[data-cot-panels='overlay'][data-cot-orientation='portrait'] .cot-mp-status{
  top:calc(max(8px,env(safe-area-inset-top)) + 134px);left:calc(max(8px,env(safe-area-inset-left)) + 100px);right:auto;align-items:flex-start}
body.cot-touch-layout[data-cot-panels='overlay'][data-cot-orientation='portrait'] .cot-mp-banner{top:calc(max(8px,env(safe-area-inset-top)) + 240px)}
body.cot-touch-layout[data-cot-height='short'][data-cot-orientation='landscape'] .cot-mp-status{
  top:calc(max(8px,env(safe-area-inset-top)) + 84px);right:max(10px,env(safe-area-inset-right))}
body[data-cot-width='phone'] .cot-mp-panel{width:calc(100vw - (var(--cot-edge) * 2));max-width:none}
body[data-cot-width='phone'] .cot-mp-banner{width:calc(100vw - (var(--cot-edge) * 2));min-width:0}
body.cot-debug-hud .cot-mp-status.battle{display:none!important}`;

// ------------------------------------------------------------ pure formatting (receipt-tested)

export function healthLabel(health: NetworkHealth): string {
  return t(`mpStatus.health.${health}`);
}

export function reasonLabel(reason: NetworkHealthReason): string {
  return t(`mpStatus.reason.${reason}`);
}

const DROP_COPY: ReadonlySet<string> = new Set(['replaced', 'idle_timeout', 'room_closed', 'server_drain', 'capacity', 'token_expired', 'rate_limited']);

export function dropReasonLabel(reason: string): string {
  return DROP_COPY.has(reason) ? t(`mpStatus.drop.${reason}`) : t('mpStatus.drop.other', { reason });
}

const pingOf = (s: Readonly<NetworkStatusSnapshot>): number | null => (s.attached ? s.rttMs : s.roomRttMs);
const round = (value: number): number => Math.round(value);
const kb = (bytesPerS: number): string => (bytesPerS / 1024).toFixed(1);

export interface StripText {
  health: NetworkHealth;
  ping: string;
  pingUnit: string;
  seat: string;
  roster: string;
  /** The host badge ("HOST") when this seat runs the authority, else empty. */
  host: string;
  aria: string;
}

/** The strip's four cells and its accessible summary. */
export function formatStrip(s: Readonly<NetworkStatusSnapshot>): StripText {
  const ping = pingOf(s);
  const pingText = ping === null ? '—' : String(Math.max(0, Math.min(999, round(ping))));
  const seat = s.seat === null ? '' : t('mpStatus.seat', { seat: s.seat });
  const roster = `${s.rosterCount}/${s.rosterCapacity}`;
  const host = s.role === 'host' ? t('mpStatus.hostBadge') : '';
  return {
    health: s.health,
    ping: pingText,
    pingUnit: ping === null ? '' : t('hud.net.ms'),
    seat,
    roster,
    host,
    aria: (host ? `${t('mpStatus.hostingAria', { count: s.peersConnected })} · ` : '') +
      t('mpStatus.stripAria', { health: healthLabel(s.health), ping: pingText, seat: s.seat === null ? '—' : s.seat, count: s.rosterCount, capacity: s.rosterCapacity }),
  };
}

/** The banner's sentence for a banner fact (null: nothing to say). */
export function formatBanner(banner: NetworkBanner): string {
  if (!banner) return '';
  switch (banner.kind) {
    case 'reconnecting':
      if (banner.scope === 'room') {
        return banner.nextRetryS > 0
          ? t('mpStatus.banner.roomReconnecting', { attempt: banner.attempt, seconds: banner.nextRetryS })
          : t('mpStatus.banner.roomReconnectingNow', { attempt: banner.attempt });
      }
      return banner.nextRetryS > 0
        ? t('mpStatus.banner.reconnecting', { attempt: banner.attempt, seconds: banner.nextRetryS })
        : t('mpStatus.banner.reconnectingNow', { attempt: banner.attempt });
    case 'migrating': return banner.self ? t('mpStatus.banner.migratingSelf') : t('mpStatus.banner.migrating', { host: banner.host });
    case 'stalled': return t('mpStatus.banner.stalled');
    case 'dropped': return t('mpStatus.banner.dropped', { reason: dropReasonLabel(banner.reason) });
    case 'failed': return t('mpStatus.banner.failed');
    case 'degraded': return t('mpStatus.banner.degraded', { reason: reasonLabel(banner.reason) });
    default: return '';
  }
}

/** The panel's rows, label then value, in display order. */
export function formatPanelRows(s: Readonly<NetworkStatusSnapshot>): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  if (s.attached) {
    const link = t(`mpStatus.link.${s.link}`);
    rows.push([t('mpStatus.row.link'), s.transport === 'reconnecting' ? `${link} · ${t('mpStatus.value.attempt', { attempt: s.reconnectAttempt })}` : link]);
    rows.push([t('mpStatus.row.rtt'), s.rttMs === null ? '—' : t('mpStatus.value.rtt', { ms: round(s.rttMs), median: round(s.rttMedianMs ?? s.rttMs), jitter: round(s.rttJitterMs) })]);
    rows.push([t('mpStatus.row.updates'), t('mpStatus.value.hz', { hz: s.snapshotHz.toFixed(1), expected: s.expectedSnapshotHz })]);
    rows.push([t('mpStatus.row.age'), t('mpStatus.value.ago', { ms: round(s.snapshotAgeMs) })]);
    rows.push([t('mpStatus.row.buffer'), t('mpStatus.value.buffer', { ms: round(s.interpolationDelayMs), frames: s.bufferedFrames })]);
    rows.push([t('mpStatus.row.loss'), `${(s.lossRate * 100).toFixed(1)} %`]);
    rows.push([t('mpStatus.row.corrections'), t('mpStatus.value.perSecond', { value: s.correctionsPerS.toFixed(1) })]);
    rows.push([t('mpStatus.row.traffic'), t('mpStatus.value.traffic', { down: kb(s.bytesInPerS), up: kb(s.bytesOutPerS) })]);
    rows.push([t('mpStatus.row.reconnects'), String(s.reconnects)]);
    if (s.role) {
      // Peer-to-peer (P2 client lane): who runs the authority, how the traffic gets there, what the host's uplink carries.
      rows.push([t('mpStatus.row.role'), s.role === 'host' ? t('mpStatus.value.hosting', { count: s.peersConnected }) : t('mpStatus.role.peer')]);
      const path = s.candidateType ? t(`mpStatus.path.${s.candidateType}`) : s.role === 'host' ? t('mpStatus.path.local') : '—';
      rows.push([t('mpStatus.row.path'), s.viaTurn ? `${path} · ${t('mpStatus.value.viaTurn')}` : path]);
      if (s.role === 'host') rows.push([t('mpStatus.row.uplink'), t('mpStatus.value.uplink', { kbps: round(s.hostUplinkKbps) })]);
      rows.push([t('mpStatus.row.generation'), String(s.generation)]);
    }
  }
  const room = t(`mpStatus.room.${s.room}`);
  const roomPhase = s.roomPhase ? ` · ${t(`mpStatus.roomPhase.${s.roomPhase}`)}` : '';
  rows.push([t('mpStatus.row.room'), s.roomRttMs === null ? `${room}${roomPhase}` : `${room}${roomPhase} · ${t('mpStatus.value.ms', { ms: round(s.roomRttMs) })}`]);
  rows.push([t('mpStatus.row.region'), s.roomRegion ?? '—']);
  rows.push([t('mpStatus.row.seat'), s.seat === null ? '—' : String(s.seat)]);
  rows.push([t('mpStatus.row.roster'), `${s.rosterCount} / ${s.rosterCapacity}`]);
  return rows;
}

/** The leave key's two-press confirmation, pure (the surface owns the copy). */
export function createLeaveArming({ now, confirmMs = LEAVE_CONFIRM_MS }: { now: () => number; confirmMs?: number }) {
  let armedUntilMs = -Infinity;
  return {
    /** Arm on the first press; confirm on a second press inside the window. */
    press(): 'armed' | 'left' {
      const at = now();
      if (at <= armedUntilMs) { armedUntilMs = -Infinity; return 'left'; }
      armedUntilMs = at + confirmMs;
      return 'armed';
    },
    armed(at: number = now()): boolean { return at <= armedUntilMs; },
    disarm(): void { armedUntilMs = -Infinity; },
  };
}

// ------------------------------------------------------------ the surface

export function createMultiplayerStatusSurface({
  host = 'battle',
  container = null,
  onLeave = null,
  storage = null,
  now = () => performance.now(),
  leaveConfirmMs = LEAVE_CONFIRM_MS,
}: MultiplayerStatusSurfaceOptions = {}): MultiplayerStatusSurface {
  ensureStyle(STYLE_ID, MP_STATUS_CSS);
  const parent = container ?? document.body;
  const root = createElement('div', `cot-mp-status ${host}`, parent);
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', t('mpStatus.aria'));
  const strip = createElement('button', 'cot-mp-strip unknown', root);
  strip.type = 'button';
  strip.setAttribute('aria-expanded', 'false');
  strip.setAttribute('aria-controls', 'cot-mp-panel');
  // Built node by node (never queried back out of markup) so the Node receipt drives the real lifecycle on a stub document.
  const glyph = createElement('span', 'glyph', strip);
  glyph.innerHTML = uiIconSVG('signal', 16);
  const pingUnitNode = createElement('span', 'unit ping', strip);
  const pingValue = createElement('b', '', pingUnitNode);
  pingValue.textContent = '—';
  const pingUnit = createElement('i', '', pingUnitNode);
  const hostUnit = createElement('span', 'unit host', strip);
  hostUnit.hidden = true;
  const hostValue = createElement('b', '', hostUnit);
  const seatUnit = createElement('span', 'unit seat', strip);
  seatUnit.hidden = true;
  const seatValue = createElement('b', '', seatUnit);
  const rosterUnit = createElement('span', 'unit roster', strip);
  const rosterValue = createElement('b', '', rosterUnit);
  rosterValue.textContent = '0/28';
  const banner = createElement('div', `cot-mp-banner ${host}`, host === 'battle' ? document.body : root);
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');
  banner.hidden = true;
  const bannerText = createElement('span', 'text', banner);
  const bannerLeave = createElement('button', 'cot-mp-leave leave', banner);
  bannerLeave.type = 'button';
  bannerLeave.textContent = t('mpStatus.leave');
  const panel = createElement('div', 'cot-mp-panel unknown', root);
  panel.id = 'cot-mp-panel';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', t('mpStatus.panelAria'));
  panel.hidden = true;
  const panelHead = createElement('div', 'head', panel);
  const panelTitle = createElement('span', 'title', panelHead);
  panelTitle.textContent = t('mpStatus.panelAria');
  const panelVerdict = createElement('span', 'verdict', panelHead);
  const panelRows = createElement('div', 'rows', panel);
  const panelLeave = createElement('button', 'cot-mp-leave', panel);
  panelLeave.type = 'button';
  panelLeave.textContent = t('mpStatus.leave');
  panelLeave.hidden = !onLeave;
  const rowNodes: Array<{ label: HTMLElement; value: HTMLElement }> = [];
  const arming = createLeaveArming({ now, confirmMs: leaveConfirmMs });
  let panelOpen = false;
  let lastSnapshot: Readonly<NetworkStatusSnapshot> | null = null;
  let lastBanner: NetworkBanner = null;
  let lastBannerText = '';
  let lastHealth: NetworkHealth | null = null;
  let disposed = false;

  const write = (node: HTMLElement, text: string): void => { if (node.textContent !== text) node.textContent = text; };

  const setHealthClass = (node: HTMLElement, base: string, health: NetworkHealth): void => {
    const next = `${base} ${health}`;
    if (node.className !== next) node.className = next;
  };

  function paintPanel(s: Readonly<NetworkStatusSnapshot>): void {
    write(panelVerdict, `${healthLabel(s.health)} · ${reasonLabel(s.healthReason)}`);
    const rows = formatPanelRows(s);
    while (rowNodes.length < rows.length) {
      const row = createElement('div', 'row', panelRows);
      rowNodes.push({ label: createElement('span', '', row), value: createElement('b', '', row) });
    }
    for (let index = 0; index < rowNodes.length; index++) {
      const node = rowNodes[index]!;
      const row = rows[index];
      const parentRow = node.label.parentElement as HTMLElement;
      if (!row) { parentRow.hidden = true; continue; }
      parentRow.hidden = false;
      write(node.label, row[0]);
      write(node.value, row[1]);
    }
  }

  function paintBanner(s: Readonly<NetworkStatusSnapshot>, fact: NetworkBanner, nowMs: number): void {
    const armed = arming.armed(nowMs);
    const text = armed ? t('mpStatus.banner.leaveArmed') : formatBanner(fact);
    const shown = text.length > 0;
    if (banner.hidden === shown) banner.hidden = !shown;
    if (!shown) { lastBannerText = ''; return; }
    if (text !== lastBannerText) { lastBannerText = text; bannerText.textContent = text; }
    const severe = armed || s.health === 'bad' || s.health === 'offline';
    const migrating = fact?.kind === 'migrating' && !armed;
    const className = `cot-mp-banner ${host} ${s.health}${migrating ? ' migrating' : ''}${severe && onLeave && !migrating ? ' leaving' : ''}`;
    if (banner.className !== className) banner.className = className;
  }

  function set(s: Readonly<NetworkStatusSnapshot>, fact: NetworkBanner, nowMs: number = now()): void {
    if (disposed) return;
    lastSnapshot = s;
    lastBanner = fact;
    const text = formatStrip(s);
    if (text.health !== lastHealth) {
      lastHealth = text.health;
      setHealthClass(strip, 'cot-mp-strip', text.health);
      setHealthClass(panel, 'cot-mp-panel', text.health);
    }
    write(pingValue, text.ping);
    write(pingUnit, text.pingUnit);
    if (hostUnit.hidden !== !text.host) hostUnit.hidden = !text.host;
    write(hostValue, text.host);
    if (seatUnit.hidden !== !text.seat) seatUnit.hidden = !text.seat;
    write(seatValue, text.seat);
    write(rosterValue, text.roster);
    strip.setAttribute('aria-label', text.aria);
    if (panelOpen) paintPanel(s);
    paintBanner(s, fact, nowMs);
  }

  function togglePanel(open: boolean = !panelOpen): void {
    if (disposed || open === panelOpen) return;
    panelOpen = open;
    panel.hidden = !open;
    strip.setAttribute('aria-expanded', open ? 'true' : 'false');
    strip.setAttribute('title', t(open ? 'mpStatus.toggleAria.hide' : 'mpStatus.toggleAria.show'));
    try { storage?.setItem(MP_STATUS_PANEL_STORAGE_KEY, open ? '1' : '0'); } catch { /* storage may be blocked */ }
    if (open && lastSnapshot) paintPanel(lastSnapshot);
  }

  function pressLeave(): 'armed' | 'left' | 'ignored' {
    if (disposed || !onLeave) return 'ignored';
    const result = arming.press();
    if (result === 'left') { onLeave(); return 'left'; }
    if (lastSnapshot) paintBanner(lastSnapshot, lastBanner, now());
    return 'armed';
  }

  const leaveNow = (): void => { if (!disposed && onLeave) { arming.disarm(); onLeave(); } };
  strip.addEventListener('click', () => togglePanel());
  panelLeave.addEventListener('click', leaveNow);
  bannerLeave.addEventListener('click', leaveNow);
  strip.setAttribute('title', t('mpStatus.toggleAria.show'));
  let remembered = false;
  try { remembered = storage?.getItem(MP_STATUS_PANEL_STORAGE_KEY) === '1'; } catch { remembered = false; }
  if (remembered) togglePanel(true);
  // The HUD's measured lanes (battleHudLayout.ts) take the strip into account once told it is there.
  const relayout = (): void => {
    if (typeof window === 'undefined' || typeof CustomEvent !== 'function') return;
    window.dispatchEvent(new CustomEvent('cot-hud-relayout'));
  };
  if (host === 'battle') relayout();

  return {
    root,
    get panelOpen() { return panelOpen; },
    set,
    togglePanel,
    pressLeave,
    dispose() {
      if (disposed) return;
      disposed = true;
      banner.remove();
      root.remove();
      if (host === 'battle') relayout();
    },
  };
}
