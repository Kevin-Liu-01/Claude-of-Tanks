import { layoutViewportSize } from './responsiveLayout.ts';
import { addSightFurniture, clearSightFurniture, settleSightFurniture } from './sightFurniture.ts';

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
/** The left lane's feeds, which the scope's vision switch keeps clear of in its mirror seat (seatScopeVision). */
const LEFT_LANE = '.cot-kill-lane.l .cot-kf:not([hidden]),.cot-si-toasthost .cot-si-toast:not([hidden]),.cot-room-chat:not([hidden])';
/** What covers the vision switch's seat right of the sight on a mouse layout (critic r9: under about 1200 px wide): a shot
 *  report's host, which takes the pointer over its whole box while it holds a card, and the open combat log. */
const RIGHT_LANE_COVERS = '.cot-si-cardhost:not(:empty),.cot-si-log.open';

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
  /** Measures the furniture the reticle keeps clear of (sightFurniture.ts), once per relayout. */
  function publishSightFurniture(): void {
    clearSightFurniture();
    for (const node of document.querySelectorAll(SIGHT_FURNITURE)) {
      const box = shownBox(node);
      if (box) addSightFurniture(box.left, box.top, box.right, box.bottom);
    }
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
  function refresh() {
    frame = 0;
    const visible = !!root.getClientRects().length;
    if (document.body.hasAttribute('data-cot-battle-layout') !== visible) {
      document.body.toggleAttribute('data-cot-battle-layout', visible);
    }
    if (!visible) {
      clearSightFurniture();
      settleSightFurniture();
      return;
    }
    observe('.cot-vehicle-status,.cot-net,.cot-aim-warning,.cot-sixth,.cot-alert,.cot-ear,.cot-minimap,.cot-dp,.cot-drive,.cot-vehicle-controls,.cot-spec,.cot-top,.cot-mode-status,.cot-prebattle,.cot-touch .mobile-chrome,.cot-shells,.cot-touch .autoaim,.cot-touch .joy,.cot-touch .fire.alt');
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
    const tray = width < 1000 ? 'stacked' : 'inline';
    const sideNotices = !touch && width < 768;
    const activeAlert = read('.cot-alert.show');
    const noticeReserve = sideNotices && (read('.cot-sixth.on') || activeAlert)
      ? (read('.cot-sixth')?.height ?? 48) + (activeAlert ? activeAlert.height + 8 : 0) + 16 : 0;
    if (document.body.dataset.hudTray !== tray) document.body.dataset.hudTray = tray;
    const map = read('.cot-minimap');
    const score = read('.cot-top');
    const scoreBottom = score?.bottom || 64;
    const top = Math.max(scoreBottom, read('.cot-mode-status.show')?.bottom || 0);
    const telemetry = read('.cot-net');
    const leftAnchor = Math.max(top, read('.cot-ear.l')?.bottom || 0,
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
      systemsHeight && systemsLeft < sideWidth + 12 ? Math.min(laneSystemsTop, systemsTop) - 8 : height);
    const countdown = read('.cot-prebattle.on');
    const leftKillBottom = countdown && countdown.left < sideWidth
      && countdown.bottom > leftAnchor ? Math.min(leftBottom - noticeReserve, countdown.top - 8) : leftBottom - noticeReserve;
    const leftSpace = Math.max(0, leftKillBottom - leftAnchor);
    // Keep incoming damage and an open chat usable during a burst of kills.
    const chatReserve = chat ? Math.min(leftSpace, Math.max(62, Math.min(140, leftSpace * .4))) : 0;
    const damageReserve = toastCount ? Math.min(116, Math.max(0, (leftSpace - chatReserve) * .45)) : 0;
    const killRowsLeft = battleNotificationRows(leftSpace - chatReserve - damageReserve - (chat || toastCount ? 8 : 0), killLeft?.childElementCount || 0);
    setRows(killLeft, killRowsLeft);
    const killHeightLeft = Math.max(0, killRowsLeft * 29 - 3);
    const killsLeft = Math.min(killHeightLeft, read('.cot-kill-lane.l')?.height || 0);
    const leftTop = leftAnchor + (killsLeft ? killsLeft + 8 : 0);
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
    const rightAnchor = Math.max(top, rosterBottomRight, chrome?.bottom || 0, networkBottom) + 8;
    const rightBottom = Math.min(rightFloor(height, width, map),
      systemsHeight && systemsLeft + dockWidth > width - sideWidth - 12 ? Math.min(laneSystemsTop, systemsTop) - 8 : height);
    const rosterStart = rosterTopRight ?? earRight?.top ?? scoreBottom + 8;
    const rosterCount = Number(root.querySelector<HTMLElement>('.cot-ear.r')?.dataset.count) || 0;
    const rosterMinimum = earRight ? (root.querySelector('.cot-ear.r.icon-grid') ? 124 : 22 + Math.min(14, rosterCount) * 12) : 0;
    const report = battleReportDock(rightBottom,
      Math.max(top + 12, rosterStart + rosterMinimum + (earRight ? 32 : 0), networkBottom + 8),
      root.classList.contains('compact-shot-report'));
    const dockReport = !touch;
    root.classList.toggle('tight-shot-report', dockReport && report.height < 220);
    const rightKillFloor = dockReport ? report.top - 8 : rightBottom;
    const rightKillBottom = countdown && countdown.right > width - sideWidth
      && countdown.bottom > rightAnchor ? Math.min(rightBottom, countdown.top - 8) : rightBottom;
    const killRowsRight = battleNotificationRows(Math.min(rightKillBottom, rightKillFloor) - rightAnchor, killRight?.childElementCount || 0);
    setRows(killRight, killRowsRight);
    const killHeightRight = Math.max(0, killRowsRight * 29 - 3);
    const killsRight = Math.min(killHeightRight, read('.cot-kill-lane.r')?.height || 0);
    const rightTop = dockReport ? report.top : rightAnchor + (killsRight ? killsRight + 8 : 0);
    const notice = read('.cot-sixth');
    // Center notices below the score. On narrow screens their horizontal
    // footprint also crosses the team feeds, so clear those occupied lanes.
    const noticeLeft = (width - (notice?.width ?? 248)) / 2;
    let noticeTop = Math.max(top + 8, height * .12);
    if (noticeLeft < sideWidth + 14) noticeTop = Math.max(noticeTop, leftTop, rightAnchor + (killsRight ? killsRight + 8 : 0));
    if (systems && noticeTop < systemsTop + systemsHeight + 8
      && noticeTop + (notice?.height ?? 48) > systemsTop - 8
      && noticeLeft < systemsLeft + dockWidth && width - noticeLeft > systemsLeft) {
      noticeTop = systemsTop + systemsHeight + 8;
    }
    const stack = battleSideStack(leftBottom - noticeReserve - leftTop, chat, toastCount);
    setRows(toastHost, stack.toastRows);
    if (touch && width > height && height <= 340) noticeTop = Math.max(top + 16, scoreBottom + 52);
    if (sideNotices) noticeTop = Math.max(top + 8, leftBottom - noticeReserve + 8);
    // Awards use the center lane only when the actual visible HUD leaves room.
    // Keep the card measurable while deferred; no per-frame polling is needed.
    const banner = document.querySelector<HTMLElement>('.cot-medal-toasts');
    let bannerTop = Math.ceil(top + 16);
    if (banner?.childElementCount) {
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
    const reportBounds = read('.cot-si-cardhost');
    const properties = {
      'status-lift': Math.max(5, (read('.cot-dp')?.top ?? 0) - (statusDockBottom() ?? height)),
      'center-notice-width': !touch && width >= 768 && reportBounds ? Math.max(136, Math.min(248, (reportBounds.left - width / 2 - 12) * 2)) : 248,
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
      'notice-top': noticeTop, 'alert-top': noticeTop + (notice?.height ?? 48) + 8,
      'objective-top': scoreBottom, 'objective-bottom': top, 'banner-top': bannerTop,
      'objective-width': objectiveWidth(score?.width || 344) - (touch && network && width > height ? 52 : 0),
      'objective-left': score ? score.left + score.width / 2 : width / 2,
      'kill-left-top': leftAnchor, 'kill-right-top': rightAnchor,
      'kill-left-height': killHeightLeft, 'kill-right-height': killHeightRight,
      'left-top': leftTop, 'left-height': Math.max(0, leftBottom - noticeReserve - leftTop),
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
    const rosterProperty = '--hud-roster-top-right';
    const rosterPixels = rosterTopRight === null ? '' : `${rosterTopRight}px`;
    if (document.body.style.getPropertyValue(rosterProperty) !== rosterPixels) {
      if (rosterPixels) document.body.style.setProperty(rosterProperty, rosterPixels);
      else document.body.style.removeProperty(rosterProperty);
    }
    const toastRows = String(stack.toastRows);
    if (root.dataset.toastRows !== toastRows) root.dataset.toastRows = toastRows;
    seatScopeVision(width, height, touch);
    publishSightFurniture();
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
