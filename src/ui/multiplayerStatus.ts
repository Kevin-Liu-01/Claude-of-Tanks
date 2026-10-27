/**
 * src/ui/multiplayerStatus.ts — the Multiplayer v2 network status surface.
 *
 * One compact strip (health glyph · ping · seat · seated of 28) that stays on
 * screen in every v2 battle and in the v2 lobby while the room waits for its
 * match; a tap or the network-details action expands it to the whole status
 * model (link, round trip, cadence, buffer, loss, corrections, traffic,
 * reconnects, room, region); a banner names what is happening when the link
 * is degraded, reconnecting ("attempt 2 · next try in 3 s"), stalled, dropped
 * by the server or lost, without ever taking the pointer (in battle the kit's
 * notice in the battle's region, battleNotices.ts); the Leave battle
 * control lives in the panel, in the banner once the link is bad, and behind
 * the leave action (armed on the first press, confirmed by a second inside
 * the window). Every rule the surface shows comes from
 * `src/mp/session/networkStatus.ts`; this module only formats and paints,
 * at most at the model's sample cadence. Layout follows the responsive body
 * attributes (no width media queries; the same lanes `.cot-net` uses).
 */
import { createElement, datumGlyph, markDatum } from './dom.ts';
import { ensureStyle } from './styleLayers.ts';
import { FONT_COND } from './fonts.ts';
import { t } from './i18n.ts';
import { battleNotices, type BattleNoticePort } from './battleNotices.ts';
import type { NetworkBanner, NetworkHealth, NetworkHealthReason, NetworkStatusSnapshot } from '../mp/session/networkStatus.ts';

const STYLE_ID = 'cot-mp-status-style';
/** The body class a battle's strip holds while it is up: the one link readout (hud.ts drops its corner chip under it). */
const MP_LINK_CLASS = 'cot-mp-battle';
/** The battle strips up now (the class leaves with the last of them). */
let linkHolders = 0;
export const MP_STATUS_PANEL_STORAGE_KEY = 'cot.mp.netpanel';
export const LEAVE_CONFIRM_MS = 2500;
/** The battle banner's id in the battle's notice region. */
const BATTLE_NOTICE_ID = 'cot-mp-banner';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

type MultiplayerStatusHost = 'battle' | 'lobby';

interface MultiplayerStatusSurfaceOptions {
  /** `battle`: fixed bare text in the top-right corner row, beside the fps/ping plate; `lobby`: inline in `container`. */
  host?: MultiplayerStatusHost;
  container?: HTMLElement | null;
  /** The Leave battle control (absent in the lobby: the lobby has its own leave). */
  onLeave?: (() => void) | null;
  storage?: StorageLike | null;
  now?: () => number;
  leaveConfirmMs?: number;
  /** Where the battle host's banner shows (the battle's notice region by default; a receipt passes its own). */
  notices?: BattleNoticePort;
}

interface MultiplayerStatusSurface {
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

export const MP_STATUS_CSS = `.cot-mp-status{position:fixed;z-index:91;top:8px;right:var(--hud-network-corner-right,10px);display:flex;flex-direction:column;align-items:flex-end;gap:6px;
  font-family:${FONT_COND};text-transform:uppercase;text-shadow:0 1px 2px rgba(0,0,0,.85);pointer-events:none}
.cot-mp-status.lobby{position:static;align-items:flex-start;text-shadow:none}
.cot-mp-strip{display:inline-flex;align-items:center;gap:8px;min-height:28px;padding:3px 9px;border:1px solid rgba(174,193,207,.22);border-radius:0;
  background:linear-gradient(180deg,rgba(14,20,25,.86),rgba(5,9,12,.78));box-shadow:0 5px 14px rgba(0,0,0,.22);color:#dce6ed;
  font:inherit;font-size:11px;font-weight:700;letter-spacing:.04em;cursor:pointer;pointer-events:auto}
.cot-mp-strip:focus-visible{outline:2px solid #fff;outline-offset:2px}
.cot-mp-strip .glyph{display:inline-flex;width:16px;height:16px;color:var(--text-ok)}
.cot-mp-strip .glyph svg{width:16px;height:16px}
.cot-mp-strip.degraded .glyph{color:var(--text-warn);--i-b3:.22}
.cot-mp-strip.bad .glyph{color:var(--text-danger);--i-b2:.22;--i-b3:.22}
.cot-mp-strip.offline .glyph{color:var(--text-danger);--i-b1:.22;--i-b2:.22;--i-b3:.22}
.cot-mp-strip.unknown .glyph{color:var(--ink-3);--i-b2:.22;--i-b3:.22}
.cot-mp-strip .unit{display:inline-grid;grid-template-columns:auto auto;align-items:baseline;column-gap:4px}
.cot-mp-strip .unit+.unit{padding-left:8px;border-left:1px solid rgba(171,190,204,.2)}
.cot-mp-strip .unit b{font-size:11px;font-weight:700;line-height:1}
.cot-mp-strip .unit i{font-style:normal;font-size:11px;font-weight:700;line-height:1;letter-spacing:.03em;color:var(--ink-3)}
.cot-mp-strip.good .ping b{color:var(--text-ok)}.cot-mp-strip.degraded .ping b{color:var(--text-warn)}.cot-mp-strip.bad .ping b,.cot-mp-strip.offline .ping b{color:var(--text-danger)}
/* (the strip's tones are the HUD's tokens: a mint ping and a pale-yellow HOST were colours of their own, gauntlet r7; the
   host badge is a role, in the accent, not a warning) */
.cot-mp-strip .unit.host b{color:var(--accent-hi);letter-spacing:.12em}
.cot-mp-strip .unit[hidden]{display:none!important}
/* In battle the strip is bare HUD text (no box, no border). On mouse layouts it sits in the top-right
   corner row: the HUD's measured lanes (battleHudLayout.ts) set its right edge beside the fps/ping
   plate and fold it to the ping when that row is too narrow, so the enemies roster keeps its own
   lane below it. Touch layouts keep its 44 px control beside the map. */
.cot-mp-status.battle .cot-mp-strip{gap:10px;padding:3px 0;border:0;background:none;box-shadow:none;text-shadow:0 1px 3px #000,0 0 5px #000}
.cot-mp-status.battle .cot-mp-strip .glyph svg{filter:drop-shadow(0 1px 2px #000)}
.cot-mp-status.battle .cot-mp-strip .unit{display:inline-flex;align-items:baseline;gap:3px}
.cot-mp-status.battle .cot-mp-strip .unit+.unit{padding-left:0;border-left:0}
.cot-mp-status.battle .cot-mp-strip .unit i{color:var(--ink-2)}
.cot-mp-status.battle[data-compact] .unit:not(.ping){display:none}
/* (beside the corner plate of a mouse layout with room beside the score (battleHudLayout.css .cot-net) the strip is the
   band's next plate: hung from the top as the plate, its height, its edges slanted as the plate's left one and 4 px off it
   (battleHudLayout.ts NETWORK_PLATE_TUCK); bare text, it was the top row's one datum on no plate, gauntlet r12) */
body[data-cot-battle-layout]:not(.cot-touch-layout):not([data-cot-width='phone']):not([data-cot-width='compact']) .cot-mp-status.battle{top:0}
body[data-cot-battle-layout]:not(.cot-touch-layout):not([data-cot-width='phone']):not([data-cot-width='compact']) .cot-mp-status.battle .cot-mp-strip{
  box-sizing:border-box;height:var(--hud-band-h,44px);padding:0 calc(var(--s3) + 16px);background:var(--hud-plate);
  clip-path:polygon(0 0,calc(100% - 16px) 0,100% 100%,16px 100%);text-shadow:none}
/* A phone-width mouse window has no room beside the score: the folded strip takes the right lane under it. */
body:not(.cot-touch-layout)[data-cot-width='phone'] .cot-mp-status.battle{top:calc(var(--hud-objective-bottom,64px) + 8px)}
body:not(.cot-touch-layout)[data-cot-width='phone'] .cot-mp-status.battle .unit:not(.ping){display:none}
.cot-mp-banner.migrating{color:#cbeaff;border-color:rgba(174,193,207,.55)}
.cot-mp-banner{box-sizing:border-box;min-width:220px;
  padding:8px 16px;border:1px solid rgba(238,166,67,.62);background:rgba(9,13,18,.94);box-shadow:0 12px 36px rgba(0,0,0,.52);color:#f2bd73;
  font:700 11px ${FONT_COND};letter-spacing:.12em;text-align:center;text-transform:uppercase;pointer-events:none}
.cot-mp-banner[hidden]{display:none}
.cot-mp-banner.bad,.cot-mp-banner.offline{color:var(--text-danger);border-color:rgba(255,103,91,.7)}
.cot-mp-banner .leave{display:none;margin:8px auto 0}
.cot-mp-banner.leaving .leave{display:block}
.cot-mp-leave{min-height:44px;padding:8px 14px;border:1px solid currentColor;border-radius:0;background:#151c24;color:#f0a9a0;
  font:700 11px ${FONT_COND};letter-spacing:.12em;text-transform:uppercase;cursor:pointer;pointer-events:auto}
.cot-mp-leave:hover{color:#ffd0c5;border-color:rgba(239,110,82,.9)}
.cot-mp-leave:focus-visible{outline:2px solid #fff;outline-offset:3px}
.cot-mp-panel{width:300px;max-width:calc(100vw - 20px);box-sizing:border-box;padding:8px 10px 10px;border:1px solid rgba(174,193,207,.22);
  background:rgba(7,11,15,.92);box-shadow:0 12px 36px rgba(0,0,0,.45);color:#cbeaff;font-size:11px;font-weight:700;letter-spacing:.02em;pointer-events:auto}
.cot-mp-panel[hidden]{display:none}
.cot-mp-panel .notice{margin:0 0 8px;font-size:12px;line-height:1.5;text-transform:none;color:#f2bd73}
.cot-mp-panel .head{display:flex;justify-content:space-between;gap:10px;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid rgba(171,190,204,.2);font-size:11px;color:#dce6ed}
.cot-mp-panel .head .verdict{color:var(--text-ok)}.cot-mp-panel.degraded .head .verdict{color:var(--text-warn)}.cot-mp-panel.bad .head .verdict,.cot-mp-panel.offline .head .verdict{color:var(--text-danger)}
.cot-mp-panel .row{display:grid;grid-template-columns:minmax(74px,auto) 1fr;column-gap:10px;padding:2px 0;text-transform:none}
.cot-mp-panel .row span{color:var(--ink-3);text-transform:uppercase;letter-spacing:.03em;font-size:11px;align-self:baseline}
.cot-mp-panel .row b{font-weight:700;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cot-mp-panel .cot-mp-leave{display:block;width:100%;margin-top:8px}
body.cot-touch-layout .cot-mp-strip{min-height:44px;padding:6px 12px}
body.cot-touch-layout[data-cot-panels='overlay'][data-cot-orientation='portrait'] .cot-mp-status{
  top:calc(max(8px,env(safe-area-inset-top)) + 134px);left:calc(max(8px,env(safe-area-inset-left)) + 100px);right:auto;align-items:flex-start}
body.cot-touch-layout[data-cot-height='short'][data-cot-orientation='landscape'] .cot-mp-status{
  top:calc(max(8px,env(safe-area-inset-top)) + 84px);right:max(10px,env(safe-area-inset-right))}
body[data-cot-width='phone'] .cot-mp-panel{width:calc(100vw - (var(--cot-edge) * 2));max-width:none}
body[data-cot-width='phone'] .cot-mp-banner{width:calc(100vw - (var(--cot-edge) * 2));min-width:0}
/* Touch keeps a named signal button beside the map. Details are a bounded
   reader; an outage is announced and also named on the button itself. */
body.cot-touch-layout[data-cot-width][data-cot-height] .cot-mp-status.battle{
  left:var(--hud-network-left,116px);top:var(--hud-network-top,112px);right:auto;align-items:flex-start}
/* (a column sized to its widest line, 44 px at least: zh's "42 毫秒" broke 秒 out of the fixed 44 px tile, gauntlet r8;
   the notice takes the tile's width, never widens it) */
/* (the touch chrome's 48 px, the row it shares on a portrait phone: at 44 it ended 4 px over the chrome's foot, gauntlet r12) */
body.cot-touch-layout .cot-mp-status.battle .cot-mp-strip{box-sizing:border-box;min-width:44px;height:48px;padding:3px;gap:2px;flex-direction:column;justify-content:center;font-size:11px}
body.cot-touch-layout .cot-mp-status.battle .unit:not(.ping){display:none}
/* (the touch tile on the HUD's plate with the touch tiles' ring, its ping with its unit: a bare "42" floated beside the map,
   gauntlet r7) */
body.cot-touch-layout .cot-mp-status.battle .cot-mp-strip{border-radius:var(--r1);background:var(--hud-plate);box-shadow:var(--hud-plate-ring);text-shadow:none}
body.cot-touch-layout .cot-mp-status.battle .unit.ping{align-items:baseline;gap:1px;white-space:nowrap}
body.cot-touch-layout .cot-mp-status.battle .unit.ping i{font-size:var(--battle-fs-11);color:var(--ink-2)}
body.cot-touch-layout .cot-mp-status.battle .glyph{width:100%;justify-content:center}
.cot-mp-strip .notice{display:none}
body.cot-touch-layout .cot-mp-status.battle .notice:not(:empty){display:block;width:0;min-width:100%;font-size:11px;line-height:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
body.cot-touch-layout .cot-mp-status.battle .cot-mp-panel{position:fixed;right:max(8px,env(safe-area-inset-right));top:calc(var(--hud-network-top,112px) + 50px);width:min(300px,calc(100vw - 16px));max-width:calc(100vw - 16px);max-height:calc(100dvh - var(--hud-network-top,112px) - 58px);overflow:auto;overscroll-behavior:contain}
/* (touch names an outage on the tile itself: the battle's notice is read out, never drawn, and its leave stays in the panel) */
body.cot-touch-layout .cot-battle-notices .cot-mp-notice{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
body.cot-touch-layout .cot-battle-notices .cot-mp-notice .cot-c-notice__acts{display:none}
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

interface StripText {
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

/** The panel's rows, label then value, in display order. With `stripCells` (the strip shows its seat and seated cells
 *  beside the ping) the panel leaves those to it, and gives the round trip's median and spread, not its figure again
 *  (UI-LOCKDOWN B12); a folded strip shows its ping alone, and the panel keeps them. */
export function formatPanelRows(s: Readonly<NetworkStatusSnapshot>, stripCells = false): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  if (s.attached) {
    const link = t(`mpStatus.link.${s.link}`);
    rows.push([t('mpStatus.row.link'), s.transport === 'reconnecting' ? `${link} · ${t('mpStatus.value.attempt', { attempt: s.reconnectAttempt })}` : link]);
    rows.push([t('mpStatus.row.rtt'), s.rttMs === null ? '—' : stripCells
      ? t('mpStatus.value.rttSpread', { median: round(s.rttMedianMs ?? s.rttMs), jitter: round(s.rttJitterMs) })
      : t('mpStatus.value.rtt', { ms: round(s.rttMs), median: round(s.rttMedianMs ?? s.rttMs), jitter: round(s.rttJitterMs) })]);
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
  if (stripCells) return rows;
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
  notices = battleNotices,
}: MultiplayerStatusSurfaceOptions = {}): MultiplayerStatusSurface {
  ensureStyle(STYLE_ID, MP_STATUS_CSS, 'surfaces');
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
  glyph.innerHTML = datumGlyph('link', 16);
  const pingUnitNode = createElement('span', 'unit ping', strip);
  // (the battle's one link readout: the datum receipts find a second one, UI-LOCKDOWN part C)
  markDatum(pingUnitNode, 'link');
  const pingValue = createElement('b', 'num', pingUnitNode);
  pingValue.textContent = '—';
  const pingUnit = createElement('i', '', pingUnitNode);
  const hostUnit = createElement('span', 'unit host', strip);
  hostUnit.hidden = true;
  const hostValue = createElement('b', '', hostUnit);
  const seatUnit = createElement('span', 'unit seat', strip);
  markDatum(seatUnit, 'seat');
  seatUnit.hidden = true;
  const seatValue = createElement('b', '', seatUnit);
  const rosterUnit = createElement('span', 'unit roster', strip);
  markDatum(rosterUnit, 'roster');
  const rosterValue = createElement('b', '', rosterUnit);
  rosterValue.textContent = '0/28';
  const touchNotice = createElement('span', 'notice', strip);
  // (the battle's banner is the kit's notice in the battle's region: a fixed box of its own sat at the centre top over the
  // pointer lock's notice and the objective, and the killcam's veil left it showing, UI-LOCKDOWN B14; the lobby's stays
  // inline in its root)
  const banner = host === 'battle' ? null : createElement('div', `cot-mp-banner ${host}`, root);
  banner?.setAttribute('role', 'status');
  banner?.setAttribute('aria-live', 'polite');
  if (banner) banner.hidden = true;
  const bannerText = banner && createElement('span', 'text', banner);
  const bannerLeave = banner && createElement('button', 'cot-mp-leave leave', banner);
  if (bannerLeave) {
    bannerLeave.type = 'button';
    bannerLeave.textContent = t('mpStatus.leave');
  }
  const panel = createElement('div', 'cot-mp-panel unknown', root);
  panel.id = 'cot-mp-panel';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', t('mpStatus.panelAria'));
  panel.hidden = true;
  const panelHead = createElement('div', 'head', panel);
  const panelTitle = createElement('span', 'title', panelHead);
  panelTitle.textContent = t('mpStatus.panelAria');
  const panelVerdict = createElement('span', 'verdict', panelHead);
  const panelNotice = createElement('p', 'notice', panel);
  panelNotice.hidden = true;
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
  /** The battle notice as last raised ('' when none shows). */
  let noticeKey = '';
  let lastHealth: NetworkHealth | null = null;
  let disposed = false;

  const write = (node: HTMLElement, text: string): void => { if (node.textContent !== text) node.textContent = text; };

  const setHealthClass = (node: HTMLElement, base: string, health: NetworkHealth): void => {
    const next = `${base} ${health}`;
    if (node.className !== next) node.className = next;
  };

  function paintPanel(s: Readonly<NetworkStatusSnapshot>): void {
    write(panelVerdict, `${healthLabel(s.health)} · ${reasonLabel(s.healthReason)}`);
    // (the strip's seat cell shown beside its ping: not folded to the ping alone, multiplayerStatus's data-compact)
    const rows = formatPanelRows(s, (seatUnit.getClientRects?.().length ?? 0) > 0);
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
    panelNotice.hidden = !shown;
    if (panelNotice.textContent !== text) panelNotice.textContent = text;
    // (while the panel is open its notice holds the text, never the banner as well: UI-LOCKDOWN B13)
    const bannerShown = shown && !panelOpen;
    const severe = armed || s.health === 'bad' || s.health === 'offline';
    const migrating = fact?.kind === 'migrating' && !armed;
    const leaving = severe && !!onLeave && !migrating;
    if (!banner || !bannerText) { paintNotice(bannerShown ? text : '', fact, armed, migrating, leaving); return; }
    if (banner.hidden === bannerShown) banner.hidden = !bannerShown;
    if (!shown) { lastBannerText = ''; return; }
    if (text !== lastBannerText) { lastBannerText = text; bannerText.textContent = text; }
    const className = `cot-mp-banner ${host} ${s.health}${migrating ? ' migrating' : ''}${leaving ? ' leaving' : ''}`;
    if (banner.className !== className) banner.className = className;
  }

  // The battle's banner: raised again only when its sentence, its tone or its leave changes (the countdown's second).
  function paintNotice(text: string, fact: NetworkBanner, armed: boolean, migrating: boolean, leaving: boolean): void {
    if (!text) {
      if (noticeKey) { noticeKey = ''; notices.dismiss(BATTLE_NOTICE_ID); }
      return;
    }
    // (a link the match has let go is the kit's error; a new host its information; the rest, the link's state, its warning)
    const severity = migrating ? 'info' : !armed && (fact?.kind === 'dropped' || fact?.kind === 'failed') ? 'error' : 'warning';
    const key = `${severity} ${leaving ? 1 : 0} ${text}`;
    if (key === noticeKey) return;
    noticeKey = key;
    notices.show({
      id: BATTLE_NOTICE_ID, className: 'cot-mp-notice', severity, text, durationMs: null, dismissible: false, priority: 1,
      actions: leaving ? [{ label: t('mpStatus.leave'), keep: true, run: leaveNow }] : [],
    });
  }

  function set(s: Readonly<NetworkStatusSnapshot>, fact: NetworkBanner, nowMs: number = now()): void {
    if (disposed) return;
    lastSnapshot = s;
    lastBanner = fact;
    const shortNotice = fact ? healthLabel(s.health) : '';
    if (touchNotice.textContent !== shortNotice) touchNotice.textContent = shortNotice;
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
    if (lastSnapshot) paintBanner(lastSnapshot, lastBanner, now());
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
  root.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape' && panelOpen) { event.preventDefault(); event.stopPropagation(); togglePanel(false); strip.focus(); }
  });
  panelLeave.addEventListener('click', leaveNow);
  bannerLeave?.addEventListener('click', leaveNow);
  strip.setAttribute('title', t('mpStatus.toggleAria.show'));
  let remembered = false;
  try { remembered = storage?.getItem(MP_STATUS_PANEL_STORAGE_KEY) === '1'; } catch { remembered = false; }
  if (remembered) togglePanel(true);
  // The HUD's measured lanes (battleHudLayout.ts) take the strip into account once told it is there.
  const relayout = (): void => {
    if (typeof window === 'undefined' || typeof CustomEvent !== 'function') return;
    window.dispatchEvent(new CustomEvent('cot-hud-relayout'));
  };
  // (the strip owns the battle's link readout while it is up: the HUD's corner drops its own, hud.ts body.cot-mp-battle;
  // owner 2026-10-25, "the ping or wifi is duplicated in the top right")
  if (host === 'battle') {
    if (linkHolders++ === 0) document.body?.classList?.add(MP_LINK_CLASS);
    relayout();
  }

  return {
    root,
    get panelOpen() { return panelOpen; },
    set,
    togglePanel,
    pressLeave,
    dispose() {
      if (disposed) return;
      disposed = true;
      banner?.remove();
      if (noticeKey) { noticeKey = ''; notices.dismiss(BATTLE_NOTICE_ID); }
      root.remove();
      if (host === 'battle') {
        if (--linkHolders === 0) document.body?.classList?.remove(MP_LINK_CLASS);
        relayout();
      }
    },
  };
}
