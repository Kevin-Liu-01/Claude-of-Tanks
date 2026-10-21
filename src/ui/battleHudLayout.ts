import { layoutViewportSize } from './responsiveLayout.ts';
import {
  mouseAlertBox, mouseMedalWaits, planMouseNotices, type MouseNoticeInput, type MouseNoticePlan, type PlanLane, type PlanRect,
} from './mouseNoticePlan.ts';
import { addSightFurniture, clearSightFurniture, setSightNotice, settleSightFurniture } from './sightFurniture.ts';
import { planTouchNotices, type TouchBox, type TouchSize } from './touchNoticePlan.ts';

/** A resize whose sizes arrive closer than this is still in progress. */
const RESIZE_SETTLE_MS = 150;
/** The phone-width network strip's folded ping (multiplayerStatus.ts), at most. */
const PHONE_STRIP_WIDTH = 96, PHONE_STRIP_HEIGHT = 30;
/** A measured box, as getBoundingClientRect gives one. */
type PlanBox = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;
/** The scope flag hud.ts sets on the document element (not on the observed HUD root: a scope toggle relayouts nothing,
 *  unless a queued medal card waits on it). */
const SCOPED_ATTRIBUTE = 'data-cot-scoped';
/** A planned x rounded away from the screen's centre line: a place beside the scope's centre-line arm keeps its margin. */
const outward = (x: number, width: number) => x < width / 2 ? Math.floor(x) : x > width / 2 ? Math.ceil(x) : x;

/** Matches the scoreboard polygon; the objective clears each bottom corner by 8px. */
export const SCORE_BOTTOM_INSET = 25;
export function objectiveWidth(scoreWidth: number): number {
  return Math.max(0, scoreWidth - 2 * (SCORE_BOTTOM_INSET + 8));
}

export const MAX_BATTLE_NOTIFICATIONS = 8;
/** Whole 26px rows, separated by 3px, within the available lane. */
export function battleNotificationRows(height: number, count = MAX_BATTLE_NOTIFICATIONS): number {
  return Math.min(MAX_BATTLE_NOTIFICATIONS, Math.max(0, count), Math.max(0, Math.floor((height + 3) / 29)));
}

/** Keep space for kill notices and the side's combat readout. */
export function battleRosterHeight(viewportHeight: number, available: number, minimum = 48, count = 0, expanded = false): number {
  const space = Math.max(0, available);
  if (count > 0 && count <= 14) {
    const reserve = Math.min(232, Math.max(112, space - (22 + count * 16)));
    const wanted = 22 + count * (expanded ? 30 : 24);
    return Math.min(space, Math.max(Math.min(22, space), Math.min(wanted, space - reserve)));
  }
  return Math.min(space, Math.max(minimum, Math.min(viewportHeight * .28,
    space - 92 - Math.min(240, space * .45))));
}

/** Bounded side lanes. Reflow on UI/viewport changes, never in the render loop. */
export function battleSideStack(height: number, chat: boolean, toastCount: number) {
  const available = Math.max(0, height);
  const chatReserve = chat ? 62 : 0;
  const toastRows = battleNotificationRows(available - chatReserve - (chat ? 8 : 0), toastCount);
  const toastHeight = toastRows ? toastRows * 29 - 3 : 0;
  const gap = toastHeight && chat ? 8 : 0;
  return { toastRows, toastHeight, chatOffset: toastHeight + gap,
    chatHeight: Math.max(0, available - toastHeight - gap) };
}

export const REPORT_MAP_GAP = 12;
/** The network strip's corner row (multiplayerStatus.ts: `top:8px`, level with the fps/ping plate) and its edge gap. */
const NETWORK_CORNER_TOP = 8;
const NETWORK_CORNER_RIGHT = 10;
/** A bottom-anchored report budget; notification counts never enter this policy. */
export function battleReportDock(bottom: number, ceiling: number, compact: boolean) {
  const height = Math.min(compact ? 160 : 260, Math.max(0, bottom - ceiling));
  return { top: bottom - height, height, bottom };
}

/** The reticle's band around the screen-centre sight (hud.ts paints it at the centre): above, the dispersion ring
 * (RET_CEIL_FRAC caps it near 58 px on a phone); below, the reload countdown under the autoloader rack, the struck
 * empty round and the aim warning (battleHudLayout.css: 50% + 48 px, 24 px tall). Through the scope the ammunition
 * readout and zoom plate run lower (hud.ts sniperAmmoReadoutY: up to 108 px down, the plate 24 px under it). */
export const SIGHT_BAND_ABOVE = 64;
export const SIGHT_BAND_BELOW = 80;
export const SCOPE_BAND_BELOW = 140;
/**
 * Owner 2026-10-17 (out of ammo, critic r3): a portrait phone parks the systems row above its ammo tray, which on
 * tall phones lands it across the sight — the countdown, the rack and the struck empty round painted over its labels.
 * A row crossing the sight's band moves below the scope's band too when the lower cluster leaves room above `floor`,
 * else above the ring when it fits below `ceiling` (the map, the touch chrome), else it stays. A row already clear of
 * the sight keeps its place (a tablet's row sits under the battle furniture, where it always was).
 */
export function portraitSightClearTop(top: number, height: number, centerY: number, floor: number, ceiling: number): number {
  if (top >= centerY + SIGHT_BAND_BELOW || top + height <= centerY - SIGHT_BAND_ABOVE) return top;
  const below = centerY + SCOPE_BAND_BELOW;
  if (below + height <= floor) return below;
  const above = centerY - SIGHT_BAND_ABOVE - height;
  return above >= ceiling ? above : top;
}

/** What the reticle's marks keep clear of (sightFurniture.ts): the HUD panels and controls that can sit near the sight. The
 *  touch warning chip the reticle seats under the sight itself (data-seat, hud.ts) is one of the reticle's marks. A shot
 *  report, the open combat log and the centre notices are passing overlays the reticle never dodges, or its marks would
 *  jump as they come and go (only the vision switch keeps clear of the right lane's: seatScopeVision). */
const SIGHT_FURNITURE = ['.cot-vehicle-controls>button', '.cot-shell', '.cot-con', '.cot-touch.on .round', '.cot-touch.on .joy',
  '.cot-touch.on .quick', '.cot-touch-aim.on .aimhint', '.cot-dp', '.cot-drive', '.cot-minimap', '.cot-top', '.cot-mode-status.show',
  '.cot-scope-vision', '.cot-aim-warning:not([hidden]):not([data-seat])', '.flight-identity', '.cot-ear'].join(',');
/** What a touch layout's centre notices, countdown and medal card keep clear of besides the reticle's footprint
 *  (touchNoticePlan.ts): the controls, the ammunition and consumables, the instruments, the vision plate, the warning
 *  chip (seated or parked) and a shot report or open combat log (the systems row by its new place); and the score and
 *  the objective, the rosters, the network readouts and the feed lanes (`soft`; the map apart, touchNoticePlan `map`). */
const TOUCH_NOTICE_OBSTACLES = '.cot-vehicle-controls>button,.cot-shell,.cot-con,.cot-touch.on .round,.cot-touch.on .joy,'
  + '.cot-touch.on .quick,.cot-touch-aim.on .aimhint,.cot-dp,.cot-drive,.cot-scope-vision,'
  + '.cot-aim-warning:not([hidden]),.flight-identity,.cot-touch.on .mobile-chrome,.cot-touch.on .autoaim,'
  + '.cot-touch.on .scope,.cot-touch.on .fire,.cot-shells,.cot-cons,.cot-si-cardhost:not(:empty),.cot-si-log.open';
/** The round buttons' labels hung under them (r10g: the alert sat on AUTO AIM and SCOPE at 375x667; touchNoticePlan
 *  `labels`). */
const TOUCH_NOTICE_LABELS = '.cot-touch.on .round>.lb';
const TOUCH_NOTICE_SOFT = '.cot-top,.cot-mode-status.show,.cot-ear,.cot-net,.cot-mp-status.battle,'
  + '.cot-si-toasthost,.cot-room-chat:not([hidden]),.cot-spec.show';
/** The alert's height while none shows (two lines at the touch type size in the detection's width), so places hold. */
const TOUCH_ALERT_RESERVE_H = 40;
/** Below this height a portrait phone's systems row leaves the band over the sight for the top slot (r10g). */
const PORTRAIT_SIGHT_ROOM_H = 720;
/** Where a touch layout parks the gun travel chip under the map instead of seating it by the sight (hud.ts
 *  touchWarningSeated): a short landscape, and a portrait phone 340 px wide or less (r10g: every seat by the sight met the
 *  left FIRE button, the map or the speedometer at 320x568). */
const touchChipParked = (width: number, height: number) => (width > height && height < 550) || (height >= width && width <= 340);
/** A touch target's least side (battle-hud-layout.browser.mjs) and the systems row's gap (battleHudLayout.css). */
const TOUCH_TARGET = 44;
const SYSTEMS_GAP = 3;
/** How far a mouse layout's inline tray keeps from the drive gauge: the damage panel's gap to it (r10f). */
const TRAY_GAUGE_GAP = 12;
/** The sixth-sense notice, which a touch layout's seated warning chip yields to (sightFurniture.ts sightNotice). */
const SIXTH_SENSE = '.cot-sixth.on';
/** The properties whose transition end measures a furniture again (installBattleHudLayout): a fade decides whether it is
 *  furniture at all (shownBox); a slide or a press is measured as it lands by the pass its own change asks for. */
const FURNITURE_SETTLES = new Set(['opacity', 'visibility']);
/** The vertical part of an element's transform, in CSS px (0 when it has none). */
function translationY(node: Element): number {
  const transform = getComputedStyle(node).transform;
  return transform && transform !== 'none' && typeof DOMMatrixReadOnly === 'function' ? new DOMMatrixReadOnly(transform).m42 : 0;
}
/** The left lane's feeds, which the scope's vision switch keeps clear of in its mirror seat (seatScopeVision). */
const LEFT_LANE = '.cot-kill-lane.l .cot-kf:not([hidden]),.cot-si-toasthost .cot-si-toast:not([hidden]),.cot-room-chat:not([hidden])';
/** What covers the vision switch's seat right of the sight on a mouse layout (critic r9: under about 1200 px wide): a shot
 *  report's host, which takes the pointer over its whole box while it holds a card, and the open combat log. */
const RIGHT_LANE_COVERS = '.cot-si-cardhost:not(:empty),.cot-si-log.open';

export function installBattleHudLayout(root: HTMLElement): void {
  let frame = 0;
  const observed = new Set<Element>();
  const attributes = new WeakMap<Element, Map<string, string | null>>();
  // Relayouts caused only by kill rows, toasts, chat, the shot log and report, the medal card or the notices themselves
  // leave the mouse notice plan's inputs as they were: those reuse the plan without measuring its inputs again.
  let planInputs = true;
  /** Some systems button sits beside the touch chrome (the top slot's overflow: data-slot-beside). */
  let besideMarked = false;
  /** A queued medal card whose place clears the battle sight only: the scope flag decides whether it shows. */
  let medalScopeSensitive = false;
  const transientParts = ['cot-kill-lane', 'cot-si-toasthost', 'cot-room-chat', 'cot-si-log', 'cot-si-cardhost', 'cot-medal-toasts', 'cot-sixth', 'cot-alert'];
  const planInput = (target: Element) => { if (!transientParts.some((part) => target.classList?.contains(part))) planInputs = true; };
  const movesPlanInputs = new Set(['fps-top', 'network-top', 'network-corner-right', 'roster-left-height', 'roster-right-height',
    'systems-top', 'systems-width', 'systems-left', 'objective-top', 'objective-bottom', 'objective-width', 'objective-left',
    'report-right', 'flight-right-clearance', 'tray-shift']);
  const resize = new ResizeObserver((entries) => {
    if (entries?.length) for (const entry of entries) planInput(entry.target);
    else planInputs = true;
    schedule();
  });
  // DOMTokenList.remove() still emits an attribute record when the class was
  // already absent (the special-action HUD clears `pending` every frame).
  // A pulse can also remove then re-add the same class within one task. Compare
  // the final delivered value with the previous batch, not each intermediate
  // oldValue. Seed at registration so the very first such batch is a no-op too.
  const changes = new MutationObserver(records => {
    let changed = false;
    for (const record of records) {
      if (record.type === 'childList') { changed = true; planInput(record.target as Element); continue; }
      const name = record.attributeName;
      if (name === null) continue;
      const target = record.target as Element;
      // the scope flag moves nothing; it matters only to a queued medal card placed clear of the battle sight only
      if (target === document.documentElement) { if (medalScopeSensitive) changed = true; continue; }
      const previous = attributes.get(target);
      const value = target.getAttribute(name);
      if (previous?.get(name) !== value) { changed = true; planInput(target); }
      previous?.set(name, value);
    }
    // Process every record, even after finding a real change, so another
    // watched attribute cannot retain a stale baseline into the next batch.
    if (changed) schedule();
  });
  const watchAttributes = (target: Element, names: string[], childList = false) => {
    let previous = attributes.get(target);
    if (!previous) { previous = new Map(); attributes.set(target, previous); }
    for (const name of names) previous.set(name, target.getAttribute(name));
    changes.observe(target, { attributes: true,
      attributeFilter: names, childList });
  };
  // Mouse relayouts read each fixed instrument once: nothing a relayout writes moves these before it reads them again.
  const steadyReads = new Set(['.cot-dp', '.cot-drive', '.cot-spec.show', '.cot-cons', '.cot-shells', '.cot-minimap', '.cot-si-cardhost',
    '.cot-vehicle-controls', '.cot-vehicle-status:not([hidden])', '.cot-flight-hud:not([hidden]) .flight-console']);
  const readsThisPass = new Map<string, DOMRect | null>();
  let reuseReads = false;
  const read = (selector: string) => {
    const keep = reuseReads && steadyReads.has(selector);
    if (keep) { const seen = readsThisPass.get(selector); if (seen !== undefined) return seen; }
    const node = document.querySelector<HTMLElement>(selector);
    const box = !node || !node.getClientRects().length || getComputedStyle(node).visibility === 'hidden' ? null : node.getBoundingClientRect();
    if (keep) readsThisPass.set(selector, box);
    return box;
  };
  const observe = (selector: string, content = false) => {
    for (const node of document.querySelectorAll(selector)) {
      if (observed.has(node)) continue;
      observed.add(node);
      resize.observe(node);
      watchAttributes(node, ['class', 'hidden', 'data-count'], content);
    }
  };
  function statusDockBottom(): number | null {
    const panel = read('.cot-dp');
    const strip = read('.cot-vehicle-status:not([hidden])');
    if (!panel || !strip) return null;
    let bottom = panel.top - 5;
    for (const selector of ['.cot-vehicle-controls', '.cot-drive', '.cot-touch.on .joy', '.cot-touch.on .mobile-chrome']) {
      const box = read(selector);
      if (box && strip.left < box.right + 8 && strip.right > box.left - 8
        && bottom > box.top - 8 && bottom - strip.height < box.bottom + 8) bottom = box.top - 8;
    }
    return bottom;
  }
  /** The left lane's floor; `steady`: without the vehicle-status strip (it comes and goes with damage), for the plan. */
  function leftFloor(height: number, touch: boolean, steady = false): number {
    const status = read('.cot-dp');
    return Math.min(height - 12,
      status ? Math.min(status.top - (touch ? 8 : 36), steady ? height : (statusDockBottom() ?? height) - (read('.cot-vehicle-status:not([hidden])')?.height ?? 0)) : height,
      read('.cot-spec.show')?.top ?? height,
      touch ? read('.cot-touch.on .joy')?.top ?? height : height,
      touch ? read('.cot-touch.on .fire.alt')?.top ?? (height <= 340 ? height - 206 : height) : height,
      read('.cot-drive')?.top ?? height) - 8;
  }
  /** A node's box when it shows (laid out, not hidden or transparent), else null. */
  const shownBox = (node: Element): DOMRect | null => {
    if (!node.getClientRects().length) return null;
    const style = getComputedStyle(node);
    return style.visibility === 'hidden' || style.opacity === '0' ? null : node.getBoundingClientRect();
  };
  const apart = (a: { left: number; top: number; right: number; bottom: number }, b: DOMRect) =>
    Math.max(a.left - b.right, b.left - a.right, a.top - b.bottom, b.top - a.bottom);
  /**
   * The scope's vision switch sits right of the sight on a mouse layout (aerialHud.css). A shot report or the open combat
   * log in the right lane covers that seat on a window under about 1200 px wide (critic r9: 900x700, 640x720, 800x400):
   * the switch then takes the mirror seat left of the sight where that keeps 3 px from every panel and feed there, and
   * otherwise waits hidden until the lane clears (its key still cycles the view). Touch seats it left of the sight already.
   */
  function seatScopeVision(width: number, height: number, touch: boolean): void {
    const vision = document.querySelector<HTMLElement>('.cot-scope-vision');
    let seat = '';
    if (vision && !vision.hidden && !touch) {
      const reach = Math.max(Math.min(width, height) * 0.15 + 8, 80);
      const edge = width < 540 ? 112 : 180;
      const w = vision.offsetWidth;
      const h = vision.offsetHeight;
      const right = { left: Math.min(width / 2 + reach, width - edge), top: height / 2 - h / 2, right: 0, bottom: height / 2 + h / 2 };
      right.right = right.left + w;
      let covered = false;
      for (const node of document.querySelectorAll(RIGHT_LANE_COVERS)) {
        const box = shownBox(node);
        if (box && apart(right, box) < 3) covered = true;
      }
      if (covered) {
        const left = { left: 0, top: right.top, right: Math.max(width / 2 - reach, edge), bottom: right.bottom };
        left.left = left.right - w;
        seat = 'left';
        for (const node of document.querySelectorAll(`${SIGHT_FURNITURE},${LEFT_LANE},.cot-sixth.on,.cot-alert.show`)) {
          if (node === vision || node.contains(vision)) continue;
          const box = shownBox(node);
          if (box && apart(left, box) < 3) seat = 'none';
        }
      }
    }
    if ((document.body.dataset.scopeVision ?? '') !== seat) {
      if (seat) document.body.dataset.scopeVision = seat;
      else delete document.body.dataset.scopeVision;
    }
  }
  /** Measures the furniture the reticle keeps clear of (sightFurniture.ts), once per relayout, and on a touch layout the
   *  sixth-sense notice its seated warning chip yields to. */
  function publishSightFurniture(touch: boolean): void {
    clearSightFurniture();
    for (const node of document.querySelectorAll(SIGHT_FURNITURE)) {
      const box = shownBox(node);
      if (box) addSightFurniture(box.left, box.top, box.right, box.bottom);
    }
    // (the notice's settled box: it slides 6 px down as it shows (cotDetectedIn) and fades in from nothing, and a pass can
    // land on any frame of that, its first included; r10e)
    const notice = touch ? document.querySelector<HTMLElement>(SIXTH_SENSE) : null;
    if (notice && notice.getClientRects().length && getComputedStyle(notice).visibility !== 'hidden') {
      const box = notice.getBoundingClientRect();
      const slide = translationY(notice);
      setSightNotice(true, box.left, box.top - slide, box.right, box.bottom - slide);
    } else setSightNotice(false);
    settleSightFurniture();
  }
  // The multiplayer v2 network strip with every cell shown, measured whenever it is not folded to its ping.
  let networkFullWidth = 0;
  /**
   * The mouse layouts' network strip: bare text in the top-right corner row, left of the fps/ping plate when the
   * plate holds that row, folded to its ping when the row between the score and the corner is too narrow for all of
   * its cells. Returns its right offset. Touch layouts give the strip a lane beside the map instead, and a phone-width
   * mouse window (no corner beside its score) folds it into the right lane under the objective.
   */
  function networkCornerRight(width: number, touch: boolean, telemetry: DOMRect | null, score: DOMRect | null): number {
    const network = document.querySelector<HTMLElement>('.cot-mp-status.battle');
    const corner = !touch && document.body.dataset.cotWidth !== 'phone';
    const cells = network && corner ? read('.cot-mp-status.battle .cot-mp-strip') : null;
    if (!network || !cells) return NETWORK_CORNER_RIGHT;
    const folded = network.hasAttribute('data-compact');
    if (!folded) networkFullWidth = cells.width;
    let right = NETWORK_CORNER_RIGHT;
    if (telemetry && telemetry.top < NETWORK_CORNER_TOP + cells.height && telemetry.bottom > NETWORK_CORNER_TOP
      && telemetry.right > width - right - networkFullWidth - 8) right = Math.ceil(width - telemetry.left) + 16;
    const fold = width - right - networkFullWidth < (score?.right ?? width / 2) + 8;
    if (fold !== folded) network.toggleAttribute('data-compact', fold);
    return right;
  }
  function rightFloor(height: number, width: number, map: DOMRect | null): number {
    const ammo = read('.cot-shells');
    const flight = read('.cot-flight-hud:not([hidden]) .flight-console');
    const reportLeft = (map && map.left > width / 2 ? map.right : width - 12) - Math.min(300, width / 2 - 24);
    return Math.min(height - 92,
      flight && flight.right > reportLeft ? flight.top - REPORT_MAP_GAP : height,
      ammo && ammo.left > width / 2 ? ammo.top - 8 : height,
      map && map.left > width / 2 ? map.top - REPORT_MAP_GAP : height,
      read('.cot-spec.show')?.top ?? height,
      width < 768 ? read('.cot-drive')?.top ?? height : height);
  }
  // The mouse plan, cached by its inputs: kill rows, toasts, chat and the notices' own text never enter them, so a
  // burst of kills cannot move a notice. The plan itself is DOM-free (mouseNoticePlan.ts); the last few are kept, so
  // a toggle (minimap zoom, spectator tray, the network strip) and back costs nothing.
  let planned: MouseNoticePlan | null = null;
  let plannedSize = -1;
  const planKey: number[] = [];
  const nextKey: number[] = [];
  const recentPlans: { key: number[]; size: number; plan: MouseNoticePlan }[] = [];
  // A window being resized (sizes arriving within RESIZE_SETTLE_MS of each other) replans once it settles, while nothing
  // planned is on screen; a single change (a keyboard, a rotation) replans at once.
  let settleTimer: ReturnType<typeof setTimeout> | 0 = 0, settled = false, lastSize = -1, lastSizeAt = -Infinity, inRun = false;
  // The rosters as they stand without Tab, for this window and these rosters: the plan sees them while Tab is held, so
  // holding it moves nothing (the held rosters stop short of what is shown instead).
  let restingEars: { size: number; left: DOMRect | null; right: DOMRect | null; counts: number } | null = null;
  /** Whether anything the plan places (or the Tab rosters it bounds) is on screen. */
  const planShown = () => root.classList.contains('rosters-expanded') || !!root.querySelector('.cot-sixth.on,.cot-alert.show,.cot-prebattle.on,.cot-revive.on')
    || !!document.querySelector('.cot-medal-toasts')?.childElementCount;
  function mouseNoticePlan(width: number, height: number, top: number, seen: readonly (PlanBox | null)[], net: DOMRect | null, map: DOMRect | null,
    rosters: readonly [PlanBox | null, number, PlanBox | null, number],
    systemsLeft: number, systemsTop: number, systemsWidth: number, systemsHeight: number, sideWidth: number,
    leftTop: number, leftBottom: number, rightTop: number, rightBottom: number,
    report: { top: number; height: number }): MouseNoticePlan {
    const size = width * 65536 + height;
    const now = performance.now();
    // a size that came hard on the last one starts (or continues) a run; the run lasts until sizes stop coming, and the
    // settled window is measured once more (instruments that only move, not resize, report no change of their own)
    if (size !== lastSize) {
      inRun = now - lastSizeAt < RESIZE_SETTLE_MS; lastSize = size; lastSizeAt = now;
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => { settleTimer = 0; settled = true; planInputs = true; schedule(); }, RESIZE_SETTLE_MS);
    }
    const resizing = inRun && now - lastSizeAt < RESIZE_SETTLE_MS;
    // The key: the size, the countdown's and revive count's boxes, then each fixed box (x, y, w, h), then the lanes. A
    // relayout whose key matches the last plan's builds nothing more.
    nextKey.length = 0;
    const countdown = root.querySelector<HTMLElement>('.cot-prebattle');
    const revive = root.querySelector<HTMLElement>('.cot-revive');
    nextKey.push(width, height, Math.round(top), countdown?.offsetWidth ?? 0, countdown?.offsetHeight ?? 0, revive?.offsetWidth ?? 0, revive?.offsetHeight ?? 0);
    // each box [x, y, w, h, role]: 0 an instrument the notices keep off, 2 a panel or control the reticle's marks keep clear
    // of (SIGHT_FURNITURE, as publishSightFurniture measures it), 1 both
    const box = (x: number, y: number, w: number, h: number, role = 0) => {
      if (w > 0 && h > 0) nextKey.push(Math.round(x), Math.round(y), Math.round(w), Math.round(h), role);
    };
    const add = (r: PlanBox | null, role = 0) => { if (r) box(r.left, r.top, r.width, r.height, role); };
    // score, objective and minimap, then the ammunition rail and the network strip, as refresh() read them
    for (let i = 0; i < seen.length; i++) add(seen[i], i < 3 ? 1 : 0);
    // each roster down to its height while Tab is held (its width then stops short of anything shown)
    for (let side = 0; side < 4; side += 2) {
      const ear = rosters[side] as DOMRect | null;
      if (ear) box(ear.left, ear.top, ear.width, Math.max(ear.height, rosters[side + 1] as number), 1);
    }
    const panel = read('.cot-dp');
    add(panel, 1);
    // the damage panel's status strip rises into the 36 px above it (leftFloor keeps the same band)
    if (panel) box(panel.left, Math.round(panel.top) - 36, panel.width, 36);
    add(read('.cot-drive'), 1);
    if (systemsHeight > 0) box(systemsLeft, systemsTop, systemsWidth, systemsHeight);
    add(read('.cot-cons'));
    // The marks keep clear of the controls row's buttons, the tray's shells and the consumables (not of the strip's or the
    // rail's spare width): each where this pass puts it (the buttons move with the strip, whose place is written below).
    const strip = read('.cot-vehicle-controls');
    const dx = strip ? systemsLeft - strip.left : 0, dy = strip ? systemsTop - strip.top : 0;
    for (const node of document.querySelectorAll('.cot-vehicle-controls>button')) {
      const b = shownBox(node);
      if (b) box(b.left + dx, b.top + dy, b.width, b.height, 2);
    }
    for (const node of document.querySelectorAll('.cot-shell,.cot-con,.flight-identity')) {
      const b = shownBox(node);
      if (b) box(b.left, b.top, b.width, b.height, 2);
    }
    const host = read('.cot-si-cardhost');
    if (host && report.height > 0) box(host.left, report.top, host.width, report.height);
    // The fps/ping readout: below 768 px its place is fixed under the objective (battleHudLayout.css, 88 x 20 at
    // --hud-network-left), kept whether it shows or not (it is opt-in, and hides for 30 frames on a sight change);
    // wider, it sits in the top-right corner row, by the score
    if (width < 768) box(width > height ? Math.max(122, (map?.right ?? 104) + 8) : (map?.right ?? 104) + 8, top + 8, 88, 20);
    else add(net);
    add(read('.cot-spec.show'));
    // the drone's and the gunship's flight console while their view is up (a view change, like the spectator tray),
    // where keeping off it costs no reticle clearance (below)
    const plain = nextKey.length;
    add(read('.cot-flight-hud:not([hidden]) .flight-console'));
    const boxesEnd = nextKey.length;
    const laneKey = (x: number, from: number, to: number) => {
      if (to - from >= 26) nextKey.push(Math.round(x), Math.round(sideWidth), Math.round(from), Math.round(to));
      else nextKey.push(-1, -1, -1, -1);
    };
    laneKey(0, leftTop, leftBottom);
    laneKey(width - sideWidth, rightTop, rightBottom);
    const same = (key: readonly number[]) => {
      if (key.length !== nextKey.length) return false;
      for (let i = 0; i < key.length; i++) if (key[i] !== nextKey[i]) return false;
      return true;
    };
    if (planned && same(planKey)) return planned;
    const kept = recentPlans.find((entry) => same(entry.key));
    if (kept) {
      planned = kept.plan; plannedSize = kept.size;
    } else {
      // Mid-resize, with nothing planned on screen, the last plan stands until the window settles.
      if (planned && plannedSize !== size && resizing && !settled && !planShown()) {
        planInputs = true;
        return planned;
      }
      const obstacles: PlanRect[] = [], furniture: PlanRect[] = [];
      let plainObstacles = 0;
      for (let i = 7; i < boxesEnd; i += 5) {
        const r = { x: nextKey[i], y: nextKey[i + 1], w: nextKey[i + 2], h: nextKey[i + 3] }, role = nextKey[i + 4];
        if (role !== 2) { obstacles.push(r); if (i < plain) plainObstacles++; }
        if (role) furniture.push(r);
      }
      const lane = (i: number): PlanLane | null => nextKey[i] < 0 && nextKey[i + 1] < 0 ? null
        : { x: nextKey[i], w: nextKey[i + 1], top: nextKey[i + 2], bottom: nextKey[i + 3] };
      const input: MouseNoticeInput = {
        width, height, top: nextKey[2], obstacles, furniture, lanes: [lane(boxesEnd), lane(boxesEnd + 4)],
        smallAlert: height <= 550 || width <= 480, compactDetection: height <= 550,
        countdown: countdown ? { w: nextKey[3], h: nextKey[4] } : null,
        revive: revive ? { w: nextKey[5], h: nextKey[6] } : null,
        // medalToast.ts: the full card up to 380 px wide (84 px tall with its description; 74 without it at <= 640),
        // the compact card 250
        medal: { w: Math.min(380, width - 32), h: width > 640 ? 85 : 76 },
        medalCompact: { w: Math.min(250, width - 24), h: 40 },
      };
      planned = planMouseNotices(input);
      if (boxesEnd > plain && planned.clearance < 2) {
        const without = planMouseNotices({ ...input, obstacles: obstacles.slice(0, plainObstacles) });
        if (without.clearance > planned.clearance) planned = without;
      }
      plannedSize = size;
      recentPlans.unshift({ key: nextKey.slice(), size, plan: planned });
      if (recentPlans.length > 4) recentPlans.pop();
    }
    settled = false;
    planKey.length = 0;
    for (const v of nextKey) planKey.push(v);
    return planned;
  }
  function setBodyVar(name: string, value: string) {
    if (document.body.style.getPropertyValue(name) !== value) document.body.style.setProperty(name, value);
  }
  /** Writes the plan; the countdown, the revive count and the medal card only while they are up (`up`), as the plan
   *  places those when first read. */
  function writeMousePlan(plan: MouseNoticePlan, up: { countdown: boolean; revive: boolean; medal: boolean }, width: number,
    medalWaits: boolean, medalFeedWait: boolean) {
    const { detection, alert } = plan;
    // (centres and inner edges round away from the centre line, never into a keep-out's margin)
    setBodyVar('--hud-notice-x', `${outward(detection.x + detection.w / 2, width)}px`);
    setBodyVar('--hud-alert-x', `${alert.anchor === 'start' ? Math.ceil(alert.x) : alert.anchor === 'end' ? Math.floor(alert.x) : outward(alert.x, width)}px`);
    setBodyVar('--hud-alert-width', `${Math.floor(alert.w)}px`);
    setBodyVar('--hud-alert-shift', alert.anchor === 'start' ? '0%' : alert.anchor === 'end' ? '-100%' : '-50%');
    const medal = up.medal ? plan.medal : null;
    if (up.medal) setBodyVar('--hud-banner-x', medal ? `${outward(medal.x + medal.w / 2, width)}px` : '50%');
    // The keep-out each element clears (mouseNoticePlan.ts tiers: 2 everything the reticle draws, 1 the battle sight at
    // full bloom, 0 the resting sight, - none, ? not up; s: it shares a notice's place; w: the medal card waits, f: on a
    // kill row of a lane its place cuts), for the browser receipt.
    const tier = (shown: boolean, place: { clearance: number; sharesNotices: boolean } | null) =>
      !shown ? '?' : place ? `${place.clearance}${place.sharesNotices ? 's' : ''}` : '-';
    const tiers = `d${plan.clearance} a${plan.clearance} c${tier(up.countdown, up.countdown ? plan.countdown : null)} r${tier(up.revive, up.revive ? plan.revive : null)} m${tier(up.medal, medal)}${medal && medalWaits ? `w${medalFeedWait ? 'f' : ''}` : ''}`;
    if (document.body.dataset.hudNoticeTiers !== tiers) document.body.dataset.hudNoticeTiers = tiers;
    for (const name of ['countdown', 'revive'] as const) {
      if (!up[name]) continue;
      const place = plan[name];
      setBodyVar(`--hud-${name}-top`, place ? `${Math.round(place.y)}px` : name === 'countdown' ? '22%' : '30%');
      setBodyVar(`--hud-${name}-x`, place ? `${outward(place.x + place.w / 2, width)}px` : '50%');
      setBodyVar(`--hud-${name}-scale`, place ? String(place.scale) : '1');
    }
  }
  function refresh() {
    frame = 0;
    const visible = !!root.getClientRects().length;
    if (document.body.hasAttribute('data-cot-battle-layout') !== visible) {
      document.body.toggleAttribute('data-cot-battle-layout', visible);
    }
    if (!visible) {
      clearSightFurniture();
      setSightNotice(false);
      settleSightFurniture();
      return;
    }
    observe('.cot-vehicle-status,.cot-net,.cot-aim-warning,.cot-sixth,.cot-alert,.cot-ear,.cot-minimap,.cot-dp,.cot-drive,.cot-vehicle-controls,.cot-spec,.cot-top,.cot-mode-status,.cot-prebattle,.cot-touch .mobile-chrome,.cot-shells,.cot-touch .autoaim,.cot-touch .joy,.cot-touch .fire.alt');
    // the revive count is placed (mouse) as it shows
    if (!document.body.classList.contains('cot-touch-layout')) observe('.cot-revive');
    observe('.cot-si-toasthost,.cot-room-chat,.cot-kill-lane,.cot-medal-toasts,.cot-si-cardhost,.cot-si-log', true);
    // The multiplayer v2 network strip (src/ui/multiplayerStatus.ts) lives outside the HUD root; it
    // asks for a relayout when it mounts, and the lanes seat it in the corner row (networkCornerRight).
    observe('.cot-mp-status.battle,.cot-flight-hud,.flight-console');
    // the scope's vision switch (shown and hidden with the scope) and the consumables, which the reticle keeps clear of
    observe('.cot-scope-vision,.cot-cons,.cot-touch-aim');
    // The lanes are placed in layout-viewport coordinates (getBoundingClientRect, fixed positioning), so they
    // measure the same viewport the HUD root is sized to: a pinch leaves both unchanged.
    const { width, height } = layoutViewportSize(window);
    const touch = document.body.classList.contains('cot-touch-layout');
    readsThisPass.clear();
    reuseReads = !touch;
    // a new window size (a resize, a keyboard, a toolbar) is a new plan input
    if (width * 65536 + height !== lastSize) planInputs = true;
    const tray = width < 1000 ? 'stacked' : 'inline';
    if (document.body.dataset.hudTray !== tray) document.body.dataset.hudTray = tray;
    // r10f (the notices critic: the drive gauge 2 px from the APFSDS slot at 1024 wide): a mouse layout's inline tray,
    // centred, moves right until it keeps the gap the damage panel keeps from the gauge (TRAY_GAUGE_GAP)
    let trayShift = 0;
    if (!touch && tray === 'inline') {
      const gauge = read('.cot-drive');
      const shells = read('.cot-shells');
      const shifted = parseFloat(document.body.style.getPropertyValue('--hud-tray-shift')) || 0;
      if (gauge && shells) trayShift = Math.max(0, Math.ceil(gauge.right + TRAY_GAUGE_GAP - (shells.left - shifted)));
    }
    // The mouse layout's centre notices are planned off the reticle (mouseNoticePlan.ts); touch keeps its own rules.
    if (document.body.hasAttribute('data-hud-notices') === touch) document.body.toggleAttribute('data-hud-notices', !touch);
    const map = read('.cot-minimap');
    const score = read('.cot-top');
    const scoreBottom = score?.bottom || 64;
    const objective = read('.cot-mode-status.show');
    const top = Math.max(scoreBottom, objective?.bottom || 0);
    const telemetry = read('.cot-net');
    const earLeft = read('.cot-ear.l');
    let leftAnchor = Math.max(top, earLeft?.bottom || 0,
      !touch && width < 768 && telemetry && telemetry.top < height / 2 ? telemetry.bottom : 0,
      touch && touchChipParked(width, height) ? read('.cot-aim-warning:not([hidden])')?.bottom || 0 : 0,
      map && map.left < width / 2 ? map.bottom : 0) + 8;
    const systems = read('.cot-vehicle-controls');
    let systemsHeight = systems?.height ?? 0;
    const ammo = read('.cot-shells');
    let systemsWidth = Math.min(440, width - 24);
    let systemsTop = (ammo?.top ?? height - 80) - systemsHeight - 8;
    const systemsElement = document.querySelector<HTMLElement>('.cot-vehicle-controls');
    const naturalWidth = systemsElement ? systemsElement.scrollWidth + 2 : 0;
    let dockWidth = Math.min(systemsWidth, naturalWidth);
    let systemsLeft = Math.max(12, Math.min(width - dockWidth - 12,
      (ammo ? ammo.left + ammo.width / 2 : width / 2) - dockWidth / 2));
    if (touch && height < 550 && width > height) {
      // Landscape phones have a vertical ammo rail. Use the lower gap between
      // the driving instruments and aim buttons, above the health strip.
      systemsLeft = Math.max(read('.cot-touch.on .joy')?.right || 0, read('.cot-drive')?.right || 0) + 8;
      systemsWidth = Math.max(52, Math.min(440, (read('.cot-touch.on .autoaim')?.left || width - 12) - systemsLeft - 8));
      dockWidth = Math.min(systemsWidth, naturalWidth);
      systemsTop = (read('.cot-dp')?.top || height - 44) - systemsHeight - 8;
    }
    if (touch && width < height && map && map.left < width / 2 && map.bottom + 8 > systemsTop) {
      systemsLeft = map.right + 8;
      systemsWidth = Math.max(52, width - systemsLeft - 12);
      dockWidth = Math.min(systemsWidth, naturalWidth);
    }
    // Portrait rotation can leave the system strip level with the settings
    // buttons. Keep the touch navigation reachable before placing that strip.
    const touchChrome = touch ? read('.cot-touch.on .mobile-chrome') : null;
    if (touch && width < height && touchChrome && systemsLeft + dockWidth > touchChrome.left
      && systemsTop < touchChrome.bottom + 8) systemsTop = touchChrome.bottom + 8;
    // The side lanes keep the floor the row's natural place gives them (a row moved below the sight lends them nothing).
    const laneSystemsTop = systemsTop;
    if (touch && width < height && systemsHeight) {
      const floor = Math.min(read('.cot-drive')?.top ?? height, read('.cot-touch.on .fire.alt')?.top ?? height,
        read('.cot-touch.on .joy')?.top ?? height, read('.cot-touch-aim.on .aimhint')?.top ?? height) - 8;
      const ceiling = Math.max(map?.bottom ?? 0, touchChrome?.bottom ?? 0, top) + 8;
      const clearTop = portraitSightClearTop(systemsTop, systemsHeight, height / 2, floor, ceiling);
      if (clearTop !== systemsTop) {
        systemsTop = clearTop;
        // Level with the ammo tray: the row sits left of it, whole, rather than scrolling under it.
        if (ammo && systemsTop + systemsHeight > ammo.top && systemsTop < ammo.bottom) {
          systemsLeft = Math.max(12, ammo.left - 8 - dockWidth);
        }
      }
    }
    // r10g (the r10e critic at 320x568 and 360x640: the scope's readouts on the systems row's labels, the warning chip set
    // over the sight on its key badges; the row clipped at 320 wide): the marks r10 sets over the ring (the readout row,
    // the chip, a rack) reach past SIGHT_BAND_ABOVE, so on a portrait phone under PORTRAIT_SIGHT_ROOM_H tall the row takes
    // the top slot right of the map, under the touch chrome, in its compact form (icons over labels, no key badges, the
    // slot's width shared: battleHudLayout.css data-systems-slot), wherever that slot is higher than its own place (with
    // an objective panel the chrome drops under it, and the slot is as high as the row already was: compact there, it
    // no longer runs off the screen). Its buttons keep the 44 px touch target, as many a row as the slot's width holds,
    // the rows balanced (a five-control kit at 320 wide takes two), 4 px under the chrome (at 8 px a 44 px row left the
    // scope's notices no clear band under it at 360x640).
    let systemsSlot = '';
    let systemsPerRow = 0;
    if (touch && width < height && height < PORTRAIT_SIGHT_ROOM_H && systemsHeight && map && map.left < width / 2) {
      const slotTop = Math.max(touchChrome?.bottom ?? 0, top) + 4;
      if (slotTop <= systemsTop) {
        systemsSlot = 'top';
        systemsTop = slotTop;
        systemsLeft = map.right + 8;
        systemsWidth = dockWidth = Math.max(52, width - systemsLeft - 12);
      }
    }
    let systemsCount = 0;
    // (what one row cannot hold sits beside the touch chrome, left of it and level with it, where that leaves a 44 px
    // place: a five-control kit at 320 wide, whose second row met the ammo drawer's open shells; else balanced rows)
    let systemsBeside = 0;
    const besideRoom = touchChrome ? touchChrome.left - 8 - (map ? map.right + 8 : 0) : 0;
    const besideFits = besideRoom >= TOUCH_TARGET ? Math.floor((besideRoom + SYSTEMS_GAP) / (TOUCH_TARGET + SYSTEMS_GAP)) : 0;
    const slotRows = () => {
      const fits = Math.max(1, Math.floor((systemsWidth + SYSTEMS_GAP) / (TOUCH_TARGET + SYSTEMS_GAP)));
      systemsBeside = systemsCount > fits && systemsCount - fits <= besideFits ? systemsCount - fits : 0;
      const inRow = systemsCount - systemsBeside;
      const rows = Math.max(1, Math.ceil(inRow / fits));
      systemsPerRow = Math.max(1, Math.ceil(inRow / rows));
      systemsHeight = rows * TOUCH_TARGET + (rows - 1) * SYSTEMS_GAP;
    };
    if (systemsSlot) {
      for (const button of systemsElement?.children ?? []) if (button.checkVisibility()) systemsCount++;
      slotRows();
    }
    if ((document.body.dataset.systemsSlot ?? '') !== systemsSlot) {
      if (systemsSlot) document.body.dataset.systemsSlot = systemsSlot;
      else delete document.body.dataset.systemsSlot;
    }
    if (touch && width < height && ammo && systemsTop + systemsHeight > ammo.top
      && systemsTop < ammo.bottom && systemsLeft < ammo.left) {
      systemsWidth = Math.max(52, ammo.left - systemsLeft - 8);
      dockWidth = Math.min(systemsWidth, naturalWidth);
      // (the top slot's rows in the width the ammo column leaves it)
      if (systemsSlot) { dockWidth = systemsWidth; slotRows(); }
    }
    // (the buttons beside the chrome: the row's last ones, each 44 px, from the slot's left edge; the marks cleared once
    // none sits there)
    if (systemsElement && (systemsBeside || besideMarked)) {
      besideMarked = systemsBeside > 0;
      let index = 0;
      let beside = 0;
      const buttons = systemsElement.children;
      for (let i = 0; i < buttons.length; i++) {
        const button = buttons[i] as HTMLElement;
        const shown = systemsBeside > 0 && button.checkVisibility();
        const place = shown && index++ >= systemsCount - systemsBeside ? String(beside++) : '';
        if ((button.dataset.slotBeside ?? '') !== place) {
          if (place) button.dataset.slotBeside = place;
          else delete button.dataset.slotBeside;
        }
      }
    }
    const sideWidth = Math.min(400, width / 2 - 24);
    const chat = !!read('.cot-room-chat:not([hidden])');
    const toastHost = root.querySelector<HTMLElement>('.cot-si-toasthost');
    const toastCount = toastHost?.childElementCount || 0;
    const setRows = (host: Element | null, rows: number) => {
      if (!host) return;
      for (let index = 0; index < host.children.length; index++) {
        const item = host.children[index] as HTMLElement;
        item.hidden = index >= rows;
      }
    };
    const killLeft = root.querySelector('.cot-kill-lane.l');
    const killRight = root.querySelector('.cot-kill-lane.r');
    const leftBottom = Math.min(leftFloor(height, touch),
      systemsHeight && systemsLeft < sideWidth + 12 ? Math.min(laneSystemsTop, systemsTop) - 8 : height);
    const earRight = read('.cot-ear.r');
    const networkRight = networkCornerRight(width, touch, telemetry, score);
    const strip = read('.cot-mp-status.battle');
    // The strip's corner row stays above the right roster's lane. Only its open details reader reaches into the
    // roster's column, and then the roster takes the lane below it (the roster's own top is otherwise its CSS lane).
    const rosterTopRight = strip && earRight && strip.right > earRight.left && strip.bottom > earRight.top - 8 ? Math.ceil(strip.bottom) + 6 : null;
    const rosterBottomRight = earRight ? (rosterTopRight ?? earRight.top) + (earRight.bottom - earRight.top) : 0;
    const chrome = touch ? read('.cot-touch.on .mobile-chrome') : null;
    // A phone-width mouse window has no roster above the right-hand feeds: they start below the strip's lane, which
    // follows the objective's bottom measured in this pass.
    const networkBottom = strip && !touch && document.body.dataset.cotWidth === 'phone' ? top + 8 + strip.height : 0;
    let rightAnchor = Math.max(top, rosterBottomRight, chrome?.bottom || 0, networkBottom) + 8;
    const rightBottom = Math.min(rightFloor(height, width, map),
      systemsHeight && systemsLeft + dockWidth > width - sideWidth - 12 ? Math.min(laneSystemsTop, systemsTop) - 8 : height);
    const rosterStart = rosterTopRight ?? earRight?.top ?? scoreBottom + 8;
    const rosterCount = Number(root.querySelector<HTMLElement>('.cot-ear.r')?.dataset.count) || 0;
    const rosterMinimum = earRight ? (root.querySelector('.cot-ear.r.icon-grid') ? 124 : 22 + Math.min(14, rosterCount) * 12) : 0;
    const report = battleReportDock(rightBottom,
      Math.max(top + 12, rosterStart + rosterMinimum + (earRight ? 32 : 0), networkBottom + 8),
      root.classList.contains('compact-shot-report'));
    const dockReport = !touch;
    const rightKillFloor = dockReport ? report.top - 8 : rightBottom;
    const countdown = read('.cot-prebattle.on');
    // Mouse: one plan from the viewport, the fixed instruments and the lanes' bands (mouseNoticePlan.ts).
    const banner = document.querySelector<HTMLElement>('.cot-medal-toasts');
    const expanded = root.classList.contains('rosters-expanded');
    let plan: MouseNoticePlan | null = null;
    if (!touch && !planInputs && planned) plan = planned;
    else if (!touch) {
      planInputs = false;
      const rosterCountLeft = Number(root.querySelector<HTMLElement>('.cot-ear.l')?.dataset.count) || 0;
      const size = width * 65536 + height, counts = rosterCountLeft * 4096 + rosterCount;
      if (!expanded) restingEars = { size, left: earLeft, right: earRight, counts };
      else if (!(restingEars?.size === size && restingEars.counts === counts)) {
        // The first plan for this window and these rosters is made while Tab is held: the rosters at rest are read with
        // the class lifted for the read (no frame between; the observers see the same final class), so the plan is the
        // one releasing Tab keeps.
        root.classList.remove('rosters-expanded');
        restingEars = { size, left: read('.cot-ear.l'), right: read('.cot-ear.r'), counts };
        root.classList.add('rosters-expanded');
      }
      const resting = expanded ? restingEars : null;
      // the left lane's floor without the vehicle-status strip, which comes and goes with damage
      const planLeftBottom = Math.min(leftFloor(height, touch, true), systemsHeight && systemsLeft < sideWidth + 12 ? Math.min(laneSystemsTop, systemsTop) - 8 : height);
      // The rosters at rest: their place and width as measured at rest, their height as this pass sizes them at rest
      // (the height variables are written after these reads, so a pass just after Tab's release still measures the held
      // height, 30 px a row against 24)
      const iconLeft = !!root.querySelector('.cot-ear.l.icon-grid'), iconRight = !!root.querySelector('.cot-ear.r.icon-grid');
      const atRest = (ear: PlanBox | null, h: number): PlanBox | null => ear && { left: ear.left, top: ear.top, width: ear.width, height: h };
      const restLeft = resting ? resting.left : earLeft, restRight = resting ? resting.right : earRight;
      const planLeft = atRest(restLeft, restLeft ? battleRosterHeight(height, planLeftBottom - restLeft.top, iconLeft ? 124 : 48, rosterCountLeft, false) : 0);
      const planRight = atRest(restRight, Math.min(battleRosterHeight(height, rightBottom - rosterStart, iconRight ? 124 : 48, rosterCount, false),
        Math.max(0, report.top - rosterStart - 32)));
      // the lanes as they start below the resting rosters
      const planLeftAnchor = Math.max(top, planLeft ? planLeft.top + planLeft.height : 0,
        width < 768 && telemetry && telemetry.top < height / 2 ? telemetry.bottom : 0, map && map.left < width / 2 ? map.bottom : 0) + 8;
      // A phone-width window keeps the network strip's corner of the right lane for it, there or not (multiplayerStatus.ts:
      // its folded ping under the objective), so the strip coming and going (a reconnect) moves no notice.
      const phone = document.body.dataset.cotWidth === 'phone';
      const stripLane: PlanBox | null = phone ? { left: width - NETWORK_CORNER_RIGHT - PHONE_STRIP_WIDTH, top: top + 8, width: PHONE_STRIP_WIDTH, height: PHONE_STRIP_HEIGHT } : null;
      const planNetworkBottom = phone ? Math.max(networkBottom, top + 8 + PHONE_STRIP_HEIGHT) : networkBottom;
      const planRightAnchor = Math.max(top, planRight ? (rosterTopRight ?? planRight.top) + planRight.height : 0, planNetworkBottom) + 8;
      plan = mouseNoticePlan(width, height, top, [score, objective, map, ammo, phone ? stripLane : strip], telemetry, map,
        [planLeft, planLeft ? battleRosterHeight(height, planLeftBottom - planLeft.top, iconLeft ? 124 : 48, rosterCountLeft, true) : 0,
          planRight, planRight ? Math.min(battleRosterHeight(height, rightBottom - rosterStart, iconRight ? 124 : 48, rosterCount, true),
            Math.max(0, report.top - rosterStart - 32)) : 0],
        systemsLeft, systemsTop, dockWidth, systemsHeight, sideWidth, planLeftAnchor, planLeftBottom, planRightAnchor, Math.min(rightBottom, rightKillFloor), report);
    }
    // The medal card waits (keeping its time) where it has no place, while anything shown meets its place (a notice
    // whose place it shares, the revive count) and while the scope is up where its place clears the battle sight only
    // (a short window: hud.ts flags the scope on the document element, which relayouts only while such a card waits).
    let medalReady = false, medalWaiting = false, medalFeedWait = false;
    medalScopeSensitive = false;
    if (plan && banner?.childElementCount) {
      medalWaiting = mouseMedalWaits(plan, { detection: !!root.querySelector('.cot-sixth.on'), alert: !!root.querySelector('.cot-alert.show'),
        revive: !!root.querySelector('.cot-revive.on'), scoped: document.documentElement.hasAttribute(SCOPED_ATTRIBUTE),
        feeds: [!!killLeft?.childElementCount, !!killRight?.childElementCount] });
      medalReady = !medalWaiting;
      medalScopeSensitive = !!plan.medal && plan.medal.clearance < 2;
      // (for the receipt: a lane the card's place cuts shows a kill row, the one wait that comes from the feed)
      medalFeedWait = !!plan.medal && ((plan.medal.cutsLanes[0] && !!killLeft?.childElementCount) || (plan.medal.cutsLanes[1] && !!killRight?.childElementCount));
    }
    // A placed element crossing a side lane takes the lane's band from the plan while it shows (its rows start below it
    // or end above it); the lanes hold all their rows while nothing is up. Held Tab rosters stop short of it too.
    let leftEnd = leftBottom, rightEnd = Math.min(rightBottom, rightKillFloor);
    let wideLeft = Infinity, wideRight = Infinity;
    if (plan) {
      const shown = [root.querySelector('.cot-sixth.on') && plan.detection, root.querySelector('.cot-alert.show') && plan.alert,
        countdown && plan.countdown, root.querySelector('.cot-revive.on') && plan.revive, medalReady && plan.medal];
      for (const place of shown) {
        if (!place) continue;
        const [lt, lb, rt, rb] = place.giveWay;
        if (lt === lt) leftAnchor = Math.max(leftAnchor, lt);
        if (lb === lb) leftEnd = Math.min(leftEnd, lb);
        if (rt === rt) rightAnchor = Math.max(rightAnchor, rt);
        if (rb === rb) rightEnd = Math.min(rightEnd, rb);
        if (!expanded) continue;
        const box = place === plan.alert ? mouseAlertBox(plan.alert) : place;
        if (earLeft && box.y < earLeft.bottom + 8 && box.y + box.h > earLeft.top - 8) wideLeft = Math.min(wideLeft, box.x - 8 - earLeft.left);
        if (earRight && box.y < earRight.bottom + 8 && box.y + box.h > earRight.top - 8) wideRight = Math.min(wideRight, earRight.right - box.x - box.w - 8);
      }
      setBodyVar('--hud-roster-wide-left', wideLeft < Infinity ? `${Math.floor(wideLeft)}px` : '');
      setBodyVar('--hud-roster-wide-right', wideRight < Infinity ? `${Math.floor(wideRight)}px` : '');
    }
    // (on mouse the plan's countdown band above already keeps the lanes off it)
    const leftKillBottom = !plan && countdown && countdown.left < sideWidth
      && countdown.bottom > leftAnchor ? Math.min(leftEnd, countdown.top - 8) : leftEnd;
    const leftSpace = Math.max(0, leftKillBottom - leftAnchor);
    // Keep incoming damage and an open chat usable during a burst of kills.
    const chatReserve = chat ? Math.min(leftSpace, Math.max(62, Math.min(140, leftSpace * .4))) : 0;
    const damageReserve = toastCount ? Math.min(116, Math.max(0, (leftSpace - chatReserve) * .45)) : 0;
    const killRowsLeft = battleNotificationRows(leftSpace - chatReserve - damageReserve - (chat || toastCount ? 8 : 0), killLeft?.childElementCount || 0);
    setRows(killLeft, killRowsLeft);
    const killHeightLeft = Math.max(0, killRowsLeft * 29 - 3);
    const killsLeft = Math.min(killHeightLeft, read('.cot-kill-lane.l')?.height || 0);
    const leftTop = leftAnchor + (killsLeft ? killsLeft + 8 : 0);

    root.classList.toggle('tight-shot-report', dockReport && report.height < 220);
    const rightKillBottom = !plan && countdown && countdown.right > width - sideWidth
      && countdown.bottom > rightAnchor ? Math.min(rightBottom, countdown.top - 8) : rightBottom;
    const killRowsRight = battleNotificationRows(Math.min(rightKillBottom, rightKillFloor, rightEnd) - rightAnchor, killRight?.childElementCount || 0);
    setRows(killRight, killRowsRight);
    const killHeightRight = Math.max(0, killRowsRight * 29 - 3);
    const killsRight = Math.min(killHeightRight, read('.cot-kill-lane.r')?.height || 0);
    const rightTop = dockReport ? report.top : rightAnchor + (killsRight ? killsRight + 8 : 0);
    const notice = read('.cot-sixth');
    let noticeTop: number, alertTop: number;
    if (plan) {
      noticeTop = plan.detection.y;
      alertTop = plan.alert.y;
    } else {
      // Center notices below the score. On narrow screens their horizontal
      // footprint also crosses the team feeds, so clear those occupied lanes.
      const noticeLeft = (width - (notice?.width ?? 248)) / 2;
      noticeTop = Math.max(top + 8, height * .12);
      if (noticeLeft < sideWidth + 14) noticeTop = Math.max(noticeTop, leftTop, rightAnchor + (killsRight ? killsRight + 8 : 0));
      if (systems && noticeTop < systemsTop + systemsHeight + 8
        && noticeTop + (notice?.height ?? 48) > systemsTop - 8
        && noticeLeft < systemsLeft + dockWidth && width - noticeLeft > systemsLeft) {
        noticeTop = systemsTop + systemsHeight + 8;
      }
      if (touch && width > height && height <= 340) noticeTop = Math.max(top + 16, scoreBottom + 52);
      alertTop = noticeTop + (notice?.height ?? 48) + 8;
    }
    const stack = battleSideStack(leftEnd - leftTop, chat, toastCount);
    setRows(toastHost, stack.toastRows);
    // r10e: a touch layout's centre notices and medal card keep off the reticle's footprint and the HUD's panels
    // (touchNoticePlan.ts); integ's place stays wherever it keeps clear
    let touchPlan = null;
    if (touch) {
      const boxes = (selector: string): TouchBox[] => {
        const out: TouchBox[] = [];
        for (const node of document.querySelectorAll(selector)) {
          const box = shownBox(node);
          if (box) out.push({ x0: box.left, y0: box.top, x1: box.right, y1: box.bottom });
        }
        return out;
      };
      const obstacles = boxes(TOUCH_NOTICE_OBSTACLES);
      if (systems) obstacles.push({ x0: systemsLeft, y0: systemsTop, x1: systemsLeft + dockWidth, y1: systemsTop + systemsHeight });
      // (the countdown's own box, unscaled: the plan sets its scale)
      const countdownNode = document.querySelector<HTMLElement>('.cot-prebattle.on');
      const touchCountdown = countdownNode && shownBox(countdownNode) ? { w: countdownNode.offsetWidth, h: countdownNode.offsetHeight } : null;
      // (the alert's slot is the detection's width; its wrapped height measured there, while it shows in that form)
      const compactNow = document.body.dataset.touchNotices ?? '';
      const noticeSize: TouchSize = !compactNow.includes('notice-compact') && notice ? { w: notice.width, h: notice.height } : { w: 214, h: 48 };
      const alertBox = compactNow.includes('alert-compact') ? null : read('.cot-alert.show');
      // (the card's layout box: it enters scaled)
      const bannerBox = banner?.childElementCount ? { width: banner.offsetWidth, height: banner.offsetHeight } : null;
      // (the kill lanes by the places and heights this pass gives them, while they hold a row)
      const soft = boxes(TOUCH_NOTICE_SOFT);
      if (killsLeft) soft.push({ x0: 0, y0: leftAnchor, x1: sideWidth, y1: leftAnchor + killHeightLeft });
      if (killsRight) soft.push({ x0: width - sideWidth, y0: rightAnchor, x1: width, y1: rightAnchor + killHeightRight });
      // (the map apart: through the scope a notice that finds no clear place covers it before the sight's readouts)
      touchPlan = planTouchNotices({ width, height, top, obstacles, soft, labels: boxes(TOUCH_NOTICE_LABELS),
        map: map ? { x0: map.left, y0: map.top, x1: map.right, y1: map.bottom } : null,
        scope: !!read('.cot-scope-vision'), seated: !touchChipParked(width, height), notice: noticeSize,
        alert: { w: noticeSize.w, h: alertBox?.height ?? TOUCH_ALERT_RESERVE_H },
        countdown: touchCountdown,
        banner: bannerBox ? { w: bannerBox.width, h: bannerBox.height } : null, fallbackTop: noticeTop });
      noticeTop = touchPlan.noticeTop;
      alertTop = touchPlan.alertTop;
    }
    const touchNotices = touchPlan ? ['plan', touchPlan.noticeCompact ? 'notice-compact' : '', touchPlan.alertCompact ? 'alert-compact' : '',
      touchPlan.cleared ? '' : 'uncleared'].filter(Boolean).join(' ') : '';
    if ((document.body.dataset.touchNotices ?? '') !== touchNotices) {
      if (touchNotices) document.body.dataset.touchNotices = touchNotices;
      else delete document.body.dataset.touchNotices;
    }
    // Awards use the center lane only when the actual visible HUD leaves room.
    // Keep the card measurable while deferred; no per-frame polling is needed.
    let bannerTop = Math.ceil(touchPlan ? touchPlan.bannerTop : top + 16);
    if (plan) {
      // Mouse: the card has its own place off the reticle (medalReady above), placed once a card is queued.
      const slot = banner?.childElementCount ? plan.medal : null;
      if (slot) bannerTop = slot.y;
      const size = slot?.compact ? 'compact' : '';
      if (banner && (banner.dataset.size ?? '') !== size) {
        if (size) banner.dataset.size = size; else delete banner.dataset.size;
      }
      if (banner?.childElementCount) {
        const placement = medalReady ? 'ready' : 'deferred';
        if (banner.dataset.placement !== placement) {
          banner.dataset.placement = placement;
          banner.dispatchEvent(new Event('cot-banner-placement'));
        }
      }
    } else if (banner?.childElementCount && touchPlan) {
      // Touch: the card's place off the reticle and the notices (touchNoticePlan.ts), or it waits
      const placement = touchPlan.bannerReady ? 'ready' : 'deferred';
      if (banner.dataset.placement !== placement) {
        banner.dataset.placement = placement;
        banner.dispatchEvent(new Event('cot-banner-placement'));
      }
    } else if (banner?.childElementCount) {
      const bounds = banner.getBoundingClientRect();
      const crosses = (box: DOMRect) => bounds.left < box.right + 8 && bounds.right > box.left - 8;
      for (const selector of ['.cot-kill-lane.l', '.cot-kill-lane.r', '.cot-sixth.on', '.cot-alert.show']) {
        const box = read(selector);
        if (box && crosses(box) && bannerTop < box.bottom + 12 && bannerTop + bounds.height > box.top - 12) {
          bannerTop = Math.ceil(box.bottom + 12);
        }
      }
      let fits = bannerTop + bounds.height <= height - 8;
      for (const selector of ['.cot-vehicle-controls', '.cot-shells', '.cot-dp', '.cot-minimap',
        '.cot-touch.on .joy', '.cot-touch.on .autoaim', '.cot-touch.on .scope', '.cot-touch.on .fire', '.cot-cons']) {
        const box = read(selector);
        if (box && crosses(box) && bannerTop < box.bottom + 8 && bannerTop + bounds.height > box.top - 8) fits = false;
      }
      const placement = fits ? 'ready' : 'deferred';
      if (banner.dataset.placement !== placement) {
        banner.dataset.placement = placement;
        banner.dispatchEvent(new Event('cot-banner-placement'));
      }
    }
    const network = !!read('.cot-mp-status.battle');
    const properties = {
      'status-lift': Math.max(5, (read('.cot-dp')?.top ?? 0) - (statusDockBottom() ?? height)),
      'center-notice-width': plan ? plan.detection.w : 248,
      'flight-right-clearance': map && map.left > width / 2 && map.bottom > height / 2 ? width - map.left + 12 : 12,
      'network-left': width > height ? Math.max(122, (map?.right ?? 104) + 8) : (map?.right ?? 104) + 8,
      'aim-warning-top': width > height || touchChipParked(width, height) ? (map?.bottom ?? 114) + 4 : height * .5 + 48,
      'fps-top': (read('.cot-spec.show')?.top ?? 36) - 28,
      'network-top': width > height ? scoreBottom + 4 : (chrome?.top ?? top + 8),
      'network-corner-right': networkRight,
      'roster-left-height': battleRosterHeight(height, leftBottom - (read('.cot-ear.l')?.top ?? 52), root.querySelector('.cot-ear.l.icon-grid') ? 124 : 48, Number(root.querySelector<HTMLElement>('.cot-ear.l')?.dataset.count) || 0, root.classList.contains('rosters-expanded')),
      'roster-right-height': Math.min(battleRosterHeight(height, rightBottom - rosterStart, root.querySelector('.cot-ear.r.icon-grid') ? 124 : 48, rosterCount, root.classList.contains('rosters-expanded')), dockReport ? Math.max(0, report.top - rosterStart - 32) : Infinity),
      'systems-top': systemsTop, 'systems-width': systemsWidth, 'systems-left': systemsLeft,
      'systems-beside-dy': systemsBeside && touchChrome ? touchChrome.top - systemsTop : 0,
      'portrait-countdown-top': systemsTop < 391 && systemsTop + systemsHeight > 255 ? systemsTop + systemsHeight + 8 : 255,
      'notice-top': noticeTop, 'alert-top': alertTop,
      // (the touch plan's own names: the mouse layout's planner writes its own, on its side of the split)
      'touch-notice-cx': touchPlan?.noticeCx ?? width / 2, 'touch-alert-cx': touchPlan?.alertCx ?? width / 2,
      'touch-alert-w': touchPlan?.alertW ?? width - 24, 'touch-banner-cx': touchPlan?.bannerCx ?? width / 2,
      'touch-countdown-cx': touchPlan?.countdownCx ?? width / 2, 'touch-countdown-top': touchPlan?.countdownTop ?? top + 8,
      'objective-top': scoreBottom, 'objective-bottom': top, 'banner-top': bannerTop, 'tray-shift': trayShift,
      'objective-width': objectiveWidth(score?.width || 344) - (touch && network && width > height ? 52 : 0),
      'objective-left': score ? score.left + score.width / 2 : width / 2,
      'kill-left-top': leftAnchor, 'kill-right-top': rightAnchor,
      'kill-left-height': killHeightLeft, 'kill-right-height': killHeightRight,
      'left-top': leftTop, 'left-height': Math.max(0, leftEnd - leftTop),
      'right-top': rightTop, 'right-height': Math.max(0, rightBottom - rightTop),
      'report-right': map && map.left > width / 2 && map.bottom > height / 2 ? width - map.right : 12,
      'toast-height': stack.toastHeight, 'chat-top': leftTop + stack.chatOffset,
      'chat-height': stack.chatHeight,
    };
    for (const [name, value] of Object.entries(properties)) {
      const property = `--hud-${name}`;
      const pixels = `${name === 'objective-top' ? value : Math.floor(value)}px`;
      if (document.body.style.getPropertyValue(property) !== pixels) {
        document.body.style.setProperty(property, pixels);
        // an instrument the mouse plan keeps off moves with this write: the next relayout measures its inputs again
        if (movesPlanInputs.has(name)) planInputs = true;
      }
    }
    if (plan) writeMousePlan(plan, { countdown: !!countdown, revive: !!root.querySelector('.cot-revive.on'), medal: !!banner?.childElementCount }, width, medalWaiting, medalFeedWait);
    // (the touch countdown's scale and the top slot's buttons a row, unitless)
    const countdownScale = String(touchPlan?.countdownScale ?? 1);
    if (document.body.style.getPropertyValue('--hud-touch-countdown-scale') !== countdownScale) {
      document.body.style.setProperty('--hud-touch-countdown-scale', countdownScale);
    }
    const perRow = systemsPerRow ? String(systemsPerRow) : '';
    if (document.body.style.getPropertyValue('--hud-systems-per-row') !== perRow) {
      if (perRow) document.body.style.setProperty('--hud-systems-per-row', perRow);
      else document.body.style.removeProperty('--hud-systems-per-row');
    }
    const rosterProperty = '--hud-roster-top-right';
    const rosterPixels = rosterTopRight === null ? '' : `${rosterTopRight}px`;
    if (document.body.style.getPropertyValue(rosterProperty) !== rosterPixels) {
      if (rosterPixels) document.body.style.setProperty(rosterProperty, rosterPixels);
      else document.body.style.removeProperty(rosterProperty);
    }
    const toastRows = String(stack.toastRows);
    if (root.dataset.toastRows !== toastRows) root.dataset.toastRows = toastRows;
    seatScopeVision(width, height, touch);
    publishSightFurniture(touch);
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(refresh);
  }
  watchAttributes(document.body, ['class'], true);
  watchAttributes(root, ['style', 'class'], true);
  changes.observe(document.documentElement, { attributes: true, attributeFilter: [SCOPED_ATTRIBUTE] });
  window.addEventListener('resize', schedule, { passive: true });
  // (a relayout request may come from anything, the network strip mounting outside the HUD root among them: it is a new
  // plan input too)
  window.addEventListener('cot-hud-relayout', () => { planInputs = true; });
  window.addEventListener('cot-hud-relayout', schedule);
  // Keyboard and toolbar changes of the visible height arrive here once responsiveLayout.ts has resized the root.
  window.addEventListener('cot:layoutchange', schedule);
  // Transforms (notably the spectator tray's entrance) do not resize the
  // border box. Measure the settled position without polling its animation.
  // A pass that lands mid-fade measures the reticle's furniture where its fade has it, so the end of a furniture's own fade
  // measures it again (r10e: the touch tray's two collapsed shell slots, fading out behind the selected one, stayed
  // published until some later relayout). Only the furniture's own opacity or visibility: a child's transition bubbling
  // up, or any other property (the same slots' slower scale, which ended inside the layout receipt's idle window), asks
  // for nothing, and every end in a frame shares its one relayout.
  const transitionFinished = (event: Event) => {
    const target = event.target as Element;
    if (observed.has(target)
      || (FURNITURE_SETTLES.has((event as TransitionEvent).propertyName) && target.matches?.(SIGHT_FURNITURE))) {
      planInput(target);
      schedule();
    }
  };
  window.addEventListener('transitionend', transitionFinished);
  window.addEventListener('transitioncancel', transitionFinished);
  schedule();
}
