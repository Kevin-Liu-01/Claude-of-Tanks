import { placeTouchActionDock, type TouchDockPlacement, type TouchDockRect } from './touchActionDock.ts';

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
  // The dock clears the fixed touch controls and instruments only. The lanes that make room for the dock (kill feeds,
  // notices, the status strip, the countdown, the aim warning) are placed after it and are never inputs, or the two
  // would chase each other.
  const dockObstacleSelector = '.cot-touch.on .joy,.cot-touch.on .round,.cot-touch.on .mobile-chrome,'
    + '.cot-dp,.cot-drive,.cot-minimap,.cot-top,.cot-mode-status.show,.cot-net,.cot-cons,.cot-shells';
  const dockObstacles: TouchDockRect[] = [];
  const dockSoft: TouchDockRect[] = [];
  let safeProbe: HTMLElement | null = null;
  // Short landscape shows the pre-battle countdown in the centre lane the dock may want. Its box is remembered from
  // the countdown that opens every battle (per viewport size), so the dock keeps clear of it without moving when it ends.
  let countdownSlot: { width: number; height: number; box: TouchDockRect } | null = null;
  function placeDock(row: HTMLElement, width: number, height: number): TouchDockPlacement | null {
    let count = 0;
    for (const child of row.children) if (child.getClientRects().length) count++;
    dockObstacles.length = 0; dockSoft.length = 0;
    let joy: DOMRect | null = null, fire: DOMRect | null = null;
    for (const node of document.querySelectorAll<HTMLElement>(dockObstacleSelector)) {
      if (!node.getClientRects().length || getComputedStyle(node).visibility === 'hidden') continue;
      const box = node.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) continue;
      if (node.classList.contains('cot-shells')) {
        // The touch ammo selector opens leftwards, 56 px per further slot (hudAmmunitionPresentation.ts): the dock
        // keeps clear of the open drawer too, unless the screen is too crowded for that.
        let slots = 0;
        for (const slot of node.children) if (slot.classList.contains('cot-shell') && slot.getClientRects().length) slots++;
        if (slots > 1) dockSoft.push({ x: box.left - 56 * (slots - 1), y: box.top, w: 56 * (slots - 1), h: box.height });
      }
      if (node.classList.contains('joy')) joy = box;
      if (node.classList.contains('fire') && !node.classList.contains('alt')) fire = box;
      dockObstacles.push({ x: box.left, y: box.top, w: box.width, h: box.height });
    }
    const countdown = width > height ? read('.cot-prebattle.on') : null;
    if (countdown) countdownSlot = { width, height, box: { x: countdown.left, y: countdown.top, w: countdown.width, h: countdown.height } };
    if (width > height && countdownSlot?.width === width && countdownSlot.height === height) dockSoft.push(countdownSlot.box);
    if (!safeProbe) {
      safeProbe = document.createElement('div');
      safeProbe.setAttribute('aria-hidden', 'true');
      safeProbe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;'
        + 'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
      document.body.append(safeProbe);
    }
    const safe = getComputedStyle(safeProbe);
    const placement = placeTouchActionDock({ width, height, count, obstacles: dockObstacles, soft: dockSoft,
      anchor: joy && fire ? { x: (joy.left + joy.right + fire.left + fire.right) / 4, y: (joy.top + joy.bottom + fire.top + fire.bottom) / 4 } : null,
      insets: { top: parseFloat(safe.paddingTop) || 0, right: parseFloat(safe.paddingRight) || 0,
        bottom: parseFloat(safe.paddingBottom) || 0, left: parseFloat(safe.paddingLeft) || 0 } });
    for (const [property, value] of [['--hud-systems-columns', placement ? String(placement.columns) : ''],
      ['--hud-systems-tile', placement ? `${placement.tile}px` : '']]) {
      if (document.body.style.getPropertyValue(property) === value) continue;
      if (value) document.body.style.setProperty(property, value);
      else document.body.style.removeProperty(property);
    }
    // No spot even relaxed: the strip styles apply again (the attribute is not observed, so this cannot loop).
    if (document.body.hasAttribute('data-hud-dock') !== !!placement) document.body.toggleAttribute('data-hud-dock', !!placement);
    return placement;
  }
  // The portrait countdown keeps its place under the minimap unless the dock is there; then it takes the first of
  // below or above the dock that clears the dock and the fixed controls, else keeps its place.
  function portraitCountdownTop(dock: TouchDockPlacement, width: number): number {
    const box = read('.cot-prebattle');
    const h = box?.height || 112, w = box?.width || 228, x = (width - w) / 2;
    const clear = (y: number) => [dock, ...dockObstacles].every(o =>
      !(x < o.x + o.w + 4 && x + w > o.x - 4 && y < o.y + o.h + 4 && y + h > o.y - 4));
    for (const y of [255, dock.y + dock.h + 8, dock.y - 8 - h]) if (y >= 12 && clear(y)) return y;
    return 255;
  }
  function refresh() {
    frame = 0;
    const visible = !!root.getClientRects().length;
    if (document.body.hasAttribute('data-cot-battle-layout') !== visible) {
      document.body.toggleAttribute('data-cot-battle-layout', visible);
    }
    if (!visible) return;
    observe('.cot-vehicle-status,.cot-net,.cot-aim-warning,.cot-sixth,.cot-alert,.cot-ear,.cot-minimap,.cot-dp,.cot-drive,.cot-vehicle-controls,.cot-spec,.cot-top,.cot-mode-status,.cot-prebattle,.cot-touch .mobile-chrome,.cot-shells,.cot-touch .autoaim,.cot-touch .joy,.cot-touch .fire.alt');
    // The touch action dock's other fixed obstacles (a ruleset can show or hide the consumables mid-session).
    observe('.cot-cons,.cot-touch .fire,.cot-touch .scope');
    observe('.cot-si-toasthost,.cot-room-chat,.cot-kill-lane,.cot-medal-toasts,.cot-si-cardhost,.cot-si-log', true);
    // The multiplayer v2 network strip (src/ui/multiplayerStatus.ts) lives outside the HUD root; it
    // asks for a relayout when it mounts, and the right roster takes the lane below it.
    observe('.cot-mp-status.battle,.cot-flight-hud,.flight-console');
    const height = window.visualViewport?.height || window.innerHeight;
    const width = window.visualViewport?.width || window.innerWidth;
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
    let systemsHeight = systems?.height ?? 0;
    const ammo = read('.cot-shells');
    let systemsWidth = Math.min(440, width - 24);
    let systemsTop = (ammo?.top ?? height - 80) - systemsHeight - 8;
    const systemsElement = document.querySelector<HTMLElement>('.cot-vehicle-controls');
    const naturalWidth = systemsElement ? systemsElement.scrollWidth + 2 : 0;
    let dockWidth = Math.min(systemsWidth, naturalWidth);
    let systemsLeft = Math.max(12, Math.min(width - dockWidth - 12,
      (ammo ? ammo.left + ammo.width / 2 : width / 2) - dockWidth / 2));
    // Touch: the action dock (touchActionDock.ts) lays the controls out as 48 px tiles at the free spot nearest the
    // thumbs and wraps rather than scrolls. The older strip placement below remains the fallback when nothing fits.
    const dock = touch && systems && systemsElement ? placeDock(systemsElement, width, height) : null;
    if (dock) {
      systemsLeft = dock.x; systemsTop = dock.y; systemsWidth = dockWidth = dock.w; systemsHeight = dock.h;
    } else if (touch && height < 550 && width > height) {
      // Landscape phones have a vertical ammo rail. Use the lower gap between
      // the driving instruments and aim buttons, above the health strip.
      systemsLeft = Math.max(read('.cot-touch.on .joy')?.right || 0, read('.cot-drive')?.right || 0) + 8;
      systemsWidth = Math.max(52, Math.min(440, (read('.cot-touch.on .autoaim')?.left || width - 12) - systemsLeft - 8));
      dockWidth = Math.min(systemsWidth, naturalWidth);
      systemsTop = (read('.cot-dp')?.top || height - 44) - systemsHeight - 8;
    }
    if (!dock && touch && width < height && map && map.left < width / 2 && map.bottom + 8 > systemsTop) {
      systemsLeft = map.right + 8;
      systemsWidth = Math.max(52, width - systemsLeft - 12);
      dockWidth = Math.min(systemsWidth, naturalWidth);
    }
    // Portrait rotation can leave the system strip level with the settings
    // buttons. Keep the touch navigation reachable before placing that strip.
    const touchChrome = touch ? read('.cot-touch.on .mobile-chrome') : null;
    if (!dock && touch && width < height && touchChrome && systemsLeft + dockWidth > touchChrome.left
      && systemsTop < touchChrome.bottom + 8) systemsTop = touchChrome.bottom + 8;
    if (!dock && touch && width < height && ammo && systemsTop + systemsHeight > ammo.top
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
    // Touch dock: the centre notices (detection, the system alert and, where the dock covers its place under the
    // reticle, the gun-limit warning) stack directly above the dock, and while any of them shows the side feeds end
    // above that stack. When the space above is too short the stack goes below the dock instead.
    const aimWarning = read('.cot-aim-warning:not([hidden])');
    const aimDefaultTop = height * .5 + 48, aimHeight = aimWarning?.height ?? 24;
    const aimDocked = !!dock && width < height && aimDefaultTop < dock.y + dock.h + 8 && aimDefaultTop + aimHeight > dock.y - 8
      && width / 2 - 90 < dock.x + dock.w && width / 2 + 90 > dock.x;
    const centerStack = (read('.cot-sixth')?.height ?? 48) + 8 + (read('.cot-alert')?.height ?? 28)
      + (aimDocked && aimWarning ? 8 + aimHeight : 0);
    const dockNoticeTop = dock && dock.y - 8 - centerStack >= Math.max(top + 8, leftAnchor, (touchChrome?.bottom ?? 0) + 8)
      ? dock.y - 8 - centerStack : null;
    const noticeFloor = dockNoticeTop !== null && (read('.cot-sixth.on') || read('.cot-alert.show') || (aimDocked && aimWarning))
      ? dockNoticeTop - 8 : height;
    const leftBottom = Math.min(leftFloor(height, touch), noticeFloor,
      systemsHeight && systemsLeft < sideWidth + 12 ? systemsTop - 8 : height);
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
    const strip = read('.cot-mp-status.battle');
    // A strip in the right roster's column pushes the roster below it (the roster's own top is otherwise its CSS lane).
    const rosterTopRight = strip && earRight && strip.right > earRight.left && strip.bottom > earRight.top - 8 ? Math.ceil(strip.bottom) + 6 : null;
    const rosterBottomRight = earRight ? (rosterTopRight ?? earRight.top) + (earRight.bottom - earRight.top) : 0;
    const chrome = touch ? read('.cot-touch.on .mobile-chrome') : null;
    const rightAnchor = Math.max(top, rosterBottomRight, chrome?.bottom || 0) + 8;
    const rightBottom = Math.min(rightFloor(height, width, map), noticeFloor,
      systemsHeight && systemsLeft + dockWidth > width - sideWidth - 12 ? systemsTop - 8 : height);
    const rosterStart = rosterTopRight ?? earRight?.top ?? scoreBottom + 8;
    const rosterCount = Number(root.querySelector<HTMLElement>('.cot-ear.r')?.dataset.count) || 0;
    const rosterMinimum = earRight ? (root.querySelector('.cot-ear.r.icon-grid') ? 124 : 22 + Math.min(14, rosterCount) * 12) : 0;
    const report = battleReportDock(rightBottom,
      Math.max(top + 12, rosterStart + rosterMinimum + (earRight ? 32 : 0)),
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
    if (systems && !dock && noticeTop < systemsTop + systemsHeight + 8
      && noticeTop + (notice?.height ?? 48) > systemsTop - 8
      && noticeLeft < systemsLeft + dockWidth && width - noticeLeft > systemsLeft) {
      noticeTop = systemsTop + systemsHeight + 8;
    }
    if (dock && noticeTop < dock.y + dock.h + 8 && noticeTop + centerStack > dock.y - 8
      && noticeLeft < dock.x + dock.w && width - noticeLeft > dock.x) {
      noticeTop = dockNoticeTop ?? dock.y + dock.h + 8;
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
      'roster-left-height': battleRosterHeight(height, leftBottom - (read('.cot-ear.l')?.top ?? 52), root.querySelector('.cot-ear.l.icon-grid') ? 124 : 48, Number(root.querySelector<HTMLElement>('.cot-ear.l')?.dataset.count) || 0, root.classList.contains('rosters-expanded')),
      'roster-right-height': Math.min(battleRosterHeight(height, rightBottom - rosterStart, root.querySelector('.cot-ear.r.icon-grid') ? 124 : 48, rosterCount, root.classList.contains('rosters-expanded')), dockReport ? Math.max(0, report.top - rosterStart - 32) : Infinity),
      'systems-top': systemsTop, 'systems-width': systemsWidth, 'systems-left': systemsLeft,
      'portrait-countdown-top': dock ? portraitCountdownTop(dock, width) : systemsTop < 391 && systemsTop + systemsHeight > 255 ? systemsTop + systemsHeight + 8 : 255,
      'aim-warning-dock-top': aimDocked && dock ? dock.y - 8 - aimHeight : 0,
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
    if ((document.body.dataset.hudAimDocked === '1') !== aimDocked) {
      if (aimDocked) document.body.dataset.hudAimDocked = '1'; else delete document.body.dataset.hudAimDocked;
    }
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
  window.visualViewport?.addEventListener('resize', schedule, { passive: true });
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
