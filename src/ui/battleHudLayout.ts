import { layoutViewportSize } from './responsiveLayout.ts';
import { planMouseNotices, type MouseNoticeInput, type MouseNoticePlan, type PlanLane, type PlanRect } from './mouseNoticePlan.ts';

/** A resize whose sizes arrive closer than this is still in progress. */
const RESIZE_SETTLE_MS = 150;
const alertBox = (a: MouseNoticePlan['alert']): PlanRect =>
  ({ x: a.anchor === 'centre' ? a.x - a.w / 2 : a.anchor === 'start' ? a.x : a.x - a.w, y: a.y, w: a.w, h: a.h });

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

export function installBattleHudLayout(root: HTMLElement): void {
  let frame = 0;
  const observed = new Set<Element>();
  const attributes = new WeakMap<Element, Map<string, string | null>>();
  const resize = new ResizeObserver(schedule);
  // DOMTokenList.remove() still emits an attribute record when the class was
  // already absent (the special-action HUD clears `pending` every frame).
  // A pulse can also remove then re-add the same class within one task. Compare
  // the final delivered value with the previous batch, not each intermediate
  // oldValue. Seed at registration so the very first such batch is a no-op too.
  const changes = new MutationObserver(records => {
    let changed = false;
    for (const record of records) {
      if (record.type === 'childList') { changed = true; continue; }
      const name = record.attributeName;
      if (name === null) continue;
      const target = record.target as Element;
      const previous = attributes.get(target);
      const value = target.getAttribute(name);
      if (previous?.get(name) !== value) changed = true;
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
  const read = (selector: string) => {
    const node = document.querySelector<HTMLElement>(selector);
    if (!node || !node.getClientRects().length || getComputedStyle(node).visibility === 'hidden') return null;
    return node.getBoundingClientRect();
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
  function leftFloor(height: number, touch: boolean): number {
    const status = read('.cot-dp');
    return Math.min(height - 12,
      status ? Math.min(status.top - (touch ? 8 : 36), (statusDockBottom() ?? height) - (read('.cot-vehicle-status:not([hidden])')?.height ?? 0)) : height,
      read('.cot-spec.show')?.top ?? height,
      touch ? read('.cot-touch.on .joy')?.top ?? height : height,
      touch ? read('.cot-touch.on .fire.alt')?.top ?? (height <= 340 ? height - 206 : height) : height,
      read('.cot-drive')?.top ?? height) - 8;
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
  let settleTimer: ReturnType<typeof setTimeout> | 0 = 0, settled = false, lastSize = -1, lastSizeAt = -Infinity;
  // The live readout hides for 30 frames on every sight change (hud.ts setMode): plan with its last place.
  let readout: PlanRect | null = null, readoutSize = 0;
  const rect = (box: DOMRect): PlanRect => ({ x: Math.round(box.left), y: Math.round(box.top), w: Math.round(box.width), h: Math.round(box.height) });
  // The rosters as they stand without Tab, for this window and these rosters: the plan sees them while Tab is held, so
  // holding it moves nothing (the held rosters stop short of what is shown instead).
  let restingEars: { size: number; left: DOMRect | null; right: DOMRect | null; counts: number } | null = null;
  /** Whether anything the plan places (or the Tab rosters it bounds) is on screen. */
  const planShown = () => root.classList.contains('rosters-expanded') || !!root.querySelector('.cot-sixth.on,.cot-alert.show,.cot-prebattle.on,.cot-revive.on')
    || !!document.querySelector('.cot-medal-toasts')?.childElementCount;
  function mouseNoticePlan(width: number, height: number, top: number, seen: readonly (DOMRect | null)[], net: DOMRect | null,
    rosters: readonly [DOMRect | null, number, DOMRect | null, number],
    systemsLeft: number, systemsTop: number, systemsWidth: number, systemsHeight: number, sideWidth: number,
    leftTop: number, leftBottom: number, rightTop: number, rightBottom: number,
    report: { top: number; height: number }): MouseNoticePlan {
    const size = width * 65536 + height;
    const now = performance.now();
    const resizing = size !== lastSize && now - lastSizeAt < RESIZE_SETTLE_MS;
    if (size !== lastSize) { lastSize = size; lastSizeAt = now; }
    const obstacles: PlanRect[] = [];
    const add = (box: DOMRect | null) => { if (box && box.width > 0 && box.height > 0) obstacles.push(rect(box)); };
    // score, objective, minimap, ammunition rail and network strip, as refresh() read them
    for (const box of seen) add(box);
    // each roster down to its height while Tab is held (its width then stops short of anything shown: rosterCaps)
    for (let side = 0; side < 4; side += 2) {
      const ear = rosters[side] as DOMRect | null, wide = rosters[side + 1] as number;
      if (ear && ear.width > 0 && ear.height > 0) obstacles.push({ x: Math.round(ear.left), y: Math.round(ear.top), w: Math.round(ear.width), h: Math.round(Math.max(ear.height, wide)) });
    }
    const panel = read('.cot-dp');
    add(panel);
    // the damage panel's status strip rises into the 36 px above it (leftFloor keeps the same band)
    if (panel) obstacles.push({ x: Math.round(panel.left), y: Math.round(panel.top) - 36, w: Math.round(panel.width), h: 36 });
    add(read('.cot-drive'));
    if (systemsHeight > 0) obstacles.push({ x: Math.round(systemsLeft), y: Math.round(systemsTop), w: Math.round(systemsWidth), h: Math.round(systemsHeight) });
    add(read('.cot-cons'));
    const host = read('.cot-si-cardhost');
    if (host && report.height > 0) obstacles.push({ x: Math.round(host.left), y: Math.round(report.top), w: Math.round(host.width), h: Math.round(report.height) });
    if (readoutSize !== size) { readout = null; readoutSize = size; }
    if (net && net.width > 0 && net.height > 0) readout = rect(net);
    if (readout) obstacles.push(readout);
    add(read('.cot-spec.show'));
    // the drone's and the gunship's flight console while their view is up (a view change, like the spectator tray)
    add(read('.cot-flight-hud:not([hidden]) .flight-console'));
    const lane = (x: number, from: number, to: number): PlanLane | null =>
      to - from >= 26 ? { x: Math.round(x), w: Math.round(sideWidth), top: Math.round(from), bottom: Math.round(to) } : null;
    const lanes: [PlanLane | null, PlanLane | null] = [lane(0, leftTop, leftBottom), lane(width - sideWidth, rightTop, rightBottom)];
    const countdown = root.querySelector<HTMLElement>('.cot-prebattle');
    const revive = root.querySelector<HTMLElement>('.cot-revive');
    const countdownW = countdown?.offsetWidth ?? 0, countdownH = countdown?.offsetHeight ?? 0;
    const reviveW = revive?.offsetWidth ?? 0, reviveH = revive?.offsetHeight ?? 0;
    nextKey.length = 0;
    nextKey.push(width, height, Math.round(top), countdownW, countdownH, reviveW, reviveH);
    for (const o of obstacles) nextKey.push(o.x, o.y, o.w, o.h);
    for (const l of lanes) nextKey.push(l ? l.x : -1, l ? l.w : -1, l ? l.top : -1, l ? l.bottom : -1);
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
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(() => { settleTimer = 0; settled = true; schedule(); }, RESIZE_SETTLE_MS);
        return planned;
      }
      const input: MouseNoticeInput = {
        width, height, top: Math.round(top), obstacles, lanes,
        smallAlert: height <= 550 || width <= 480, compactDetection: height <= 550,
        countdown: countdown ? { w: countdownW, h: countdownH } : null,
        revive: revive ? { w: reviveW, h: reviveH } : null,
        // medalToast.ts: the full card up to 380 px (no description and 270 at most at <= 640), the compact card 250
        medal: width > 640 ? { w: Math.min(380, width - 32), h: 85 } : { w: Math.min(270, width - 32), h: 75 },
        medalCompact: { w: Math.min(250, width - 24), h: 40 },
      };
      planned = planMouseNotices(input);
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
  function writeMousePlan(plan: MouseNoticePlan, up: { countdown: boolean; revive: boolean; medal: boolean }) {
    const { detection, alert } = plan;
    setBodyVar('--hud-notice-x', `${Math.round(detection.x + detection.w / 2)}px`);
    setBodyVar('--hud-alert-x', `${Math.round(alert.x)}px`);
    setBodyVar('--hud-alert-width', `${Math.floor(alert.w)}px`);
    setBodyVar('--hud-alert-shift', alert.anchor === 'start' ? '0%' : alert.anchor === 'end' ? '-100%' : '-50%');
    const medal = up.medal ? plan.medal : null;
    if (up.medal) setBodyVar('--hud-banner-x', medal ? `${Math.round(medal.x + medal.w / 2)}px` : '50%');
    // The keep-out each element clears (mouseNoticePlan.ts tiers: 2 everything the reticle draws, 1 the battle sight at
    // full bloom, 0 the resting sight, - none, ? not up; s: it shares a notice's place), for the browser receipt.
    const tier = (shown: boolean, place: { clearance: number; sharesNotices: boolean } | null) =>
      !shown ? '?' : place ? `${place.clearance}${place.sharesNotices ? 's' : ''}` : '-';
    const tiers = `d${plan.clearance} a${plan.clearance} c${tier(up.countdown, up.countdown ? plan.countdown : null)} r${tier(up.revive, up.revive ? plan.revive : null)} m${tier(up.medal, medal)}`;
    if (document.body.dataset.hudNoticeTiers !== tiers) document.body.dataset.hudNoticeTiers = tiers;
    for (const name of ['countdown', 'revive'] as const) {
      if (!up[name]) continue;
      const place = plan[name];
      setBodyVar(`--hud-${name}-top`, place ? `${Math.round(place.y)}px` : name === 'countdown' ? '22%' : '30%');
      setBodyVar(`--hud-${name}-x`, place ? `${Math.round(place.x + place.w / 2)}px` : '50%');
      setBodyVar(`--hud-${name}-scale`, place ? String(place.scale) : '1');
    }
  }
  function refresh() {
    frame = 0;
    const visible = !!root.getClientRects().length;
    if (document.body.hasAttribute('data-cot-battle-layout') !== visible) {
      document.body.toggleAttribute('data-cot-battle-layout', visible);
    }
    if (!visible) return;
    observe('.cot-vehicle-status,.cot-net,.cot-aim-warning,.cot-sixth,.cot-alert,.cot-ear,.cot-minimap,.cot-dp,.cot-drive,.cot-vehicle-controls,.cot-spec,.cot-top,.cot-mode-status,.cot-prebattle,.cot-touch .mobile-chrome,.cot-shells,.cot-touch .autoaim,.cot-touch .joy,.cot-touch .fire.alt');
    observe('.cot-si-toasthost,.cot-room-chat,.cot-kill-lane,.cot-medal-toasts,.cot-si-cardhost,.cot-si-log', true);
    // The multiplayer v2 network strip (src/ui/multiplayerStatus.ts) lives outside the HUD root; it
    // asks for a relayout when it mounts, and the lanes seat it in the corner row (networkCornerRight).
    observe('.cot-mp-status.battle,.cot-flight-hud,.flight-console');
    // The lanes are placed in layout-viewport coordinates (getBoundingClientRect, fixed positioning), so they
    // measure the same viewport the HUD root is sized to: a pinch leaves both unchanged.
    const { width, height } = layoutViewportSize(window);
    const touch = document.body.classList.contains('cot-touch-layout');
    const tray = width < 1000 ? 'stacked' : 'inline';
    if (document.body.dataset.hudTray !== tray) document.body.dataset.hudTray = tray;
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
      touch && width > height ? read('.cot-aim-warning:not([hidden])')?.bottom || 0 : 0,
      map && map.left < width / 2 ? map.bottom : 0) + 8;
    const systems = read('.cot-vehicle-controls');
    const systemsHeight = systems?.height ?? 0;
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
    if (touch && width < height && ammo && systemsTop + systemsHeight > ammo.top
      && systemsTop < ammo.bottom && systemsLeft < ammo.left) {
      systemsWidth = Math.max(52, ammo.left - systemsLeft - 8);
      dockWidth = Math.min(systemsWidth, naturalWidth);
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
      systemsHeight && systemsLeft < sideWidth + 12 ? systemsTop - 8 : height);
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
      systemsHeight && systemsLeft + dockWidth > width - sideWidth - 12 ? systemsTop - 8 : height);
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
    if (!touch) {
      const rosterCountLeft = Number(root.querySelector<HTMLElement>('.cot-ear.l')?.dataset.count) || 0;
      const size = width * 65536 + height, counts = rosterCountLeft * 4096 + rosterCount;
      if (!expanded) restingEars = { size, left: earLeft, right: earRight, counts };
      const resting = expanded && restingEars?.size === size && restingEars.counts === counts ? restingEars : null;
      const planLeft = resting ? resting.left : earLeft, planRight = resting ? resting.right : earRight;
      // the lanes as they start below the resting rosters
      const planLeftAnchor = planLeft === earLeft ? leftAnchor : Math.max(top, planLeft?.bottom || 0,
        width < 768 && telemetry && telemetry.top < height / 2 ? telemetry.bottom : 0, map && map.left < width / 2 ? map.bottom : 0) + 8;
      const planRightAnchor = planRight === earRight ? rightAnchor : Math.max(top, planRight ? (rosterTopRight ?? planRight.top) + planRight.height : 0, networkBottom) + 8;
      plan = mouseNoticePlan(width, height, top, [score, objective, map, ammo, strip], telemetry,
        [planLeft, planLeft ? battleRosterHeight(height, leftBottom - planLeft.top, root.querySelector('.cot-ear.l.icon-grid') ? 124 : 48, rosterCountLeft, true) : 0,
          planRight, planRight ? Math.min(battleRosterHeight(height, rightBottom - rosterStart, root.querySelector('.cot-ear.r.icon-grid') ? 124 : 48, rosterCount, true),
            Math.max(0, report.top - rosterStart - 32)) : 0],
        systemsLeft, systemsTop, dockWidth, systemsHeight, sideWidth, planLeftAnchor, leftBottom, planRightAnchor, Math.min(rightBottom, rightKillFloor), report);
    }
    // The medal card waits (keeping its time) while a notice whose place it shares is up, and where it has no place.
    let medalReady = false;
    if (plan && banner?.childElementCount) {
      const slot = plan.medal;
      medalReady = !!slot;
      if (slot?.sharesNotices) {
        for (const selector of ['.cot-sixth.on', '.cot-alert.show']) {
          const box = read(selector);
          if (box && box.left < slot.x + slot.w + 8 && box.right > slot.x - 8
            && box.top < slot.y + slot.h + 8 && box.bottom > slot.y - 8) medalReady = false;
        }
      }
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
        const box = place === plan.alert ? alertBox(plan.alert) : place;
        if (earLeft && box.y < earLeft.bottom + 8 && box.y + box.h > earLeft.top - 8) wideLeft = Math.min(wideLeft, box.x - 8 - earLeft.left);
        if (earRight && box.y < earRight.bottom + 8 && box.y + box.h > earRight.top - 8) wideRight = Math.min(wideRight, earRight.right - box.x - box.w - 8);
      }
      setBodyVar('--hud-roster-wide-left', wideLeft < Infinity ? `${Math.floor(wideLeft)}px` : '');
      setBodyVar('--hud-roster-wide-right', wideRight < Infinity ? `${Math.floor(wideRight)}px` : '');
    }
    const leftKillBottom = countdown && countdown.left < sideWidth
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
    const rightKillBottom = countdown && countdown.right > width - sideWidth
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
    // Awards use the center lane only when the actual visible HUD leaves room.
    // Keep the card measurable while deferred; no per-frame polling is needed.
    let bannerTop = Math.ceil(top + 16);
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
      'aim-warning-top': width > height ? (map?.bottom ?? 114) + 4 : height * .5 + 48,
      'fps-top': (read('.cot-spec.show')?.top ?? 36) - 28,
      'network-top': width > height ? scoreBottom + 4 : (chrome?.top ?? top + 8),
      'network-corner-right': networkRight,
      'roster-left-height': battleRosterHeight(height, leftBottom - (read('.cot-ear.l')?.top ?? 52), root.querySelector('.cot-ear.l.icon-grid') ? 124 : 48, Number(root.querySelector<HTMLElement>('.cot-ear.l')?.dataset.count) || 0, root.classList.contains('rosters-expanded')),
      'roster-right-height': Math.min(battleRosterHeight(height, rightBottom - rosterStart, root.querySelector('.cot-ear.r.icon-grid') ? 124 : 48, rosterCount, root.classList.contains('rosters-expanded')), dockReport ? Math.max(0, report.top - rosterStart - 32) : Infinity),
      'systems-top': systemsTop, 'systems-width': systemsWidth, 'systems-left': systemsLeft,
      'portrait-countdown-top': systemsTop < 391 && systemsTop + systemsHeight > 255 ? systemsTop + systemsHeight + 8 : 255,
      'notice-top': noticeTop, 'alert-top': alertTop,
      'objective-top': scoreBottom, 'objective-bottom': top, 'banner-top': bannerTop,
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
      }
    }
    if (plan) writeMousePlan(plan, { countdown: !!countdown, revive: !!root.querySelector('.cot-revive.on'), medal: !!banner?.childElementCount });
    const rosterProperty = '--hud-roster-top-right';
    const rosterPixels = rosterTopRight === null ? '' : `${rosterTopRight}px`;
    if (document.body.style.getPropertyValue(rosterProperty) !== rosterPixels) {
      if (rosterPixels) document.body.style.setProperty(rosterProperty, rosterPixels);
      else document.body.style.removeProperty(rosterProperty);
    }
    const toastRows = String(stack.toastRows);
    if (root.dataset.toastRows !== toastRows) root.dataset.toastRows = toastRows;
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(refresh);
  }
  watchAttributes(document.body, ['class'], true);
  watchAttributes(root, ['style', 'class'], true);
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('cot-hud-relayout', schedule);
  // Keyboard and toolbar changes of the visible height arrive here once responsiveLayout.ts has resized the root.
  window.addEventListener('cot:layoutchange', schedule);
  // Transforms (notably the spectator tray's entrance) do not resize the
  // border box. Measure the settled position without polling its animation.
  const transitionFinished = (event: Event) => {
    if (observed.has(event.target as Element)) schedule();
  };
  window.addEventListener('transitionend', transitionFinished);
  window.addEventListener('transitioncancel', transitionFinished);
  schedule();
}
