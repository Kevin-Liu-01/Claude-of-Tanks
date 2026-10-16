import { t } from './i18n.ts';
import { touchAimKeepOut, touchAimWarningSlot, type TouchDockPlacement, type TouchDockRect } from './touchActionDock.ts';
import { alertReserve, planTouchCentre, type NoticeSize, type TouchCentrePlan } from './centreNotices.ts';
import type { DockYield, DockYieldTile } from './touchDockYield.ts';

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

/** How far a touch on a docked tile may travel and still be a tap (Android's touch slop is 8 dp). */
const TILE_TAP_SLOP_PX = 10;

// Tap or swipe (verifier 2026-10-14: a docked tile acted on touch-down, so a swipe to aim that began on a tile in
// the aim pad's half fired the control instead). Capture phase, ahead of each tile's own pointerdown: a touch press
// on a docked tile waits. Lifted within TILE_TAP_SLOP_PX it acts through the tile's keyboard path (click(), detail 0,
// which every row control and More already answer); moved farther, it acts on nothing and, when it began over the
// aim pad, becomes the pad's swipe from where it began. A mouse keeps acting on press.
// One gate per document, however many HUDs install a layout owner (the HUD editor's preview is a second one).
let tileGateInstalled = false;
function installTileGate(): void {
  if (tileGateInstalled) return;
  tileGateInstalled = true;
  let heldTile: { id: number; tile: HTMLButtonElement; x: number; y: number } | null = null;
  const forwardToAimPad = (pad: Element, type: string, from: PointerEvent, x: number, y: number) => {
    pad.dispatchEvent(new PointerEvent(type, { pointerId: from.pointerId, pointerType: from.pointerType,
      isPrimary: from.isPrimary, clientX: x, clientY: y, bubbles: true, cancelable: true }));
  };
  document.addEventListener('pointerdown', (event) => {
    if (heldTile || event.pointerType === 'mouse' || !document.body.hasAttribute('data-hud-dock')) return;
    const tile = (event.target as Element | null)?.closest?.<HTMLButtonElement>('.cot-vehicle-controls>button');
    if (!tile) return;
    event.preventDefault();
    event.stopPropagation();
    heldTile = { id: event.pointerId, tile, x: event.clientX, y: event.clientY };
  }, true);
  document.addEventListener('pointermove', (event) => {
    if (!heldTile || event.pointerId !== heldTile.id
      || Math.hypot(event.clientX - heldTile.x, event.clientY - heldTile.y) <= TILE_TAP_SLOP_PX) return;
    const { x, y } = heldTile;
    heldTile = null;
    const pad = document.querySelector('.cot-touch-aim.on .aimpad');
    const box = pad?.getBoundingClientRect();
    if (!pad || !box || x < box.left || x > box.right || y < box.top || y > box.bottom) return;
    forwardToAimPad(pad, 'pointerdown', event, x, y);
    forwardToAimPad(pad, 'pointermove', event, event.clientX, event.clientY);
  }, true);
  const liftTile = (event: PointerEvent) => {
    if (!heldTile || event.pointerId !== heldTile.id) return;
    const { tile } = heldTile;
    heldTile = null;
    if (event.type === 'pointerup') tile.click();
  };
  document.addEventListener('pointerup', liftTile, true);
  document.addEventListener('pointercancel', liftTile, true);
}

export function installBattleHudLayout(root: HTMLElement, dockYield?: DockYield): void {
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
  // Touch buttons and the vehicle-controls tiles change the layout only by appearing, disappearing or resizing, all of
  // which the ResizeObserver reports. Their classes are press and toggle state (FIRE's down/aiming/autofire on every
  // shot, a tile's active/cooling), so watching them would relayout the HUD on every press.
  const observeSize = (selector: string) => {
    for (const node of document.querySelectorAll(selector)) {
      if (observed.has(node)) continue;
      observed.add(node);
      resize.observe(node);
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
  // The touch centre plan's inputs (centreNotices.ts planTouchCentre, touchActionDock.ts): the touch controls nothing
  // placed here ever covers; the instruments (and the open ammo drawer) the dock never covers and the notices keep
  // clear of; the gun-limit warning's place, a lane for all of them; the aim keep-out (everything the reticle draws in
  // any sight at any bloom), which neither the dock nor its panel ever covers; and the natural sizes of the notices and
  // the countdown. The feeds and the status strip make room afterwards and are never inputs, or they would chase.
  const dockControlSelector = '.cot-touch.on .joy,.cot-touch.on .round,.cot-touch.on .mobile-chrome,.cot-cons,.cot-shells';
  const dockInstrumentSelector = '.cot-dp,.cot-drive,.cot-minimap,.cot-top,.cot-mode-status.show,.cot-net';
  const dockControls: TouchDockRect[] = [];
  const dockInstruments: TouchDockRect[] = [];
  // The measured instruments lead dockInstruments; the open drawer and the reserved lanes follow them.
  let instrumentCount = 0;
  // A press scales FIRE, the scope and the other round buttons (.down / :active, scale .94 about their centre): a
  // pressed control keeps the box it had at rest, so holding FIRE through a relayout (a hit notice, a kill) never
  // reads as a moved control, re-places the dock or closes an open More panel.
  const restingBoxes = new WeakMap<Element, TouchDockRect>();
  let safeProbe: HTMLElement | null = null;
  // The last placement and the inputs it was solved from: a relayout that changes none of them (a kill notice, a
  // roster row, a tile's cooldown) reuses it instead of searching again.
  const dockKey: number[] = [];
  let dockInputs: number[] = [];
  let centrePlan: TouchCentrePlan | null = null;
  let moreTile: HTMLButtonElement | null = null;
  // The tiles last published to the live yield (touchDockYield.ts): republished only when the placement or the row's
  // controls change.
  let yieldPlacement: TouchDockPlacement | null = null;
  let yieldNodes: Element[] = [];
  function publishYield(placement: TouchDockPlacement | null, controls: readonly HTMLElement[], more: HTMLElement | null): void {
    if (!dockYield) return;
    const nodes = placement && more ? [...controls, more] : [];
    if (placement === yieldPlacement && nodes.length === yieldNodes.length && nodes.every((node, i) => node === yieldNodes[i])) return;
    yieldPlacement = placement;
    yieldNodes = nodes;
    const tiles: DockYieldTile[] = [];
    if (placement && more) {
      for (const [i, el] of controls.entries()) {
        const slot = i < placement.shown ? placement.tiles[i] : placement.flyout[i - placement.shown];
        if (slot) tiles.push({ el, x: slot.x, y: slot.y, w: slot.w, h: slot.h, panel: i >= placement.shown });
      }
      const moreSlot = placement.more ? placement.tiles[placement.shown] : null;
      if (moreSlot) tiles.push({ el: more, x: moreSlot.x, y: moreSlot.y, w: moreSlot.w, h: moreSlot.h, panel: false });
    }
    dockYield.setTiles(tiles);
  }
  const MORE_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="5" cy="12" r="2.1" fill="currentColor"/>'
    + '<circle cx="12" cy="12" r="2.1" fill="currentColor"/><circle cx="19" cy="12" r="2.1" fill="currentColor"/></svg>';
  installTileGate();
  function setDockOpen(open: boolean): void {
    dockYield?.setOpen(open);
    if (document.body.hasAttribute('data-hud-dock-open') !== open) document.body.toggleAttribute('data-hud-dock-open', open);
    if (moreTile && moreTile.getAttribute('aria-expanded') !== String(open)) moreTile.setAttribute('aria-expanded', String(open));
  }
  // The More tile: the dock's last slot when the whole row does not fit. A tap opens the rest beside it; the next tap
  // anywhere (one of those controls, More again, the joystick, FIRE) closes it, after that control has acted.
  function ensureMoreTile(row: HTMLElement): HTMLButtonElement {
    if (moreTile?.parentElement === row) return moreTile;
    moreTile = document.createElement('button');
    moreTile.type = 'button';
    moreTile.className = 'cot-dock-more';
    moreTile.hidden = true;
    moreTile.setAttribute('aria-expanded', 'false');
    moreTile.innerHTML = `<span class="si">${MORE_ICON}</span><span class="sl"></span>`;
    const toggle = () => setDockOpen(!document.body.hasAttribute('data-hud-dock-open'));
    moreTile.addEventListener('pointerdown', (event) => { event.preventDefault(); event.stopPropagation(); toggle(); });
    moreTile.addEventListener('click', (event) => { event.stopPropagation(); if (event.detail === 0) toggle(); });
    // Capture phase: the tiles stop their own pointerdown, and a closing tap must still reach the control it lands on.
    const close = (event: Event) => {
      if (!document.body.hasAttribute('data-hud-dock-open') || moreTile?.contains(event.target as Node)) return;
      if (event.type === 'click' && (event as MouseEvent).detail !== 0) return;
      setDockOpen(false);
    };
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('click', close, true);
    row.append(moreTile);
    return moreTile;
  }
  function setStyle(node: HTMLElement, property: string, value: string): void {
    if (node.style.getPropertyValue(property) === value) return;
    if (value) node.style.setProperty(property, value); else node.style.removeProperty(property);
  }
  function placeTouchCentre(row: HTMLElement, width: number, height: number, top: number): TouchCentrePlan | null {
    const more = ensureMoreTile(row);
    // A control behind More stays laid out (visibility only), so it still counts here.
    const controls: HTMLElement[] = [];
    for (const child of row.children) if (child !== more && child.getClientRects().length) controls.push(child as HTMLElement);
    dockControls.length = 0;
    dockInstruments.length = 0;
    let joy: TouchDockRect | null = null, fire: TouchDockRect | null = null, drawer: TouchDockRect | null = null;
    for (const node of document.querySelectorAll<HTMLElement>(`${dockControlSelector},${dockInstrumentSelector}`)) {
      if (!node.getClientRects().length || getComputedStyle(node).visibility === 'hidden') continue;
      const box = node.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) continue;
      let rect: TouchDockRect = { x: box.left, y: box.top, w: box.width, h: box.height };
      if (node.matches(dockInstrumentSelector)) { dockInstruments.push(rect); continue; }
      if (node.matches('.down,:active')) rect = restingBoxes.get(node) ?? rect; else restingBoxes.set(node, rect);
      if (node.classList.contains('cot-shells')) {
        // The touch ammo selector opens leftwards, 56 px per further slot (hudAmmunitionPresentation.ts).
        let slots = 0;
        for (const slot of node.children) if (slot.classList.contains('cot-shell') && slot.getClientRects().length) slots++;
        if (slots > 1) drawer = { x: box.left - 56 * (slots - 1), y: box.top, w: 56 * (slots - 1), h: box.height };
      }
      if (node.classList.contains('joy')) joy = rect;
      if (node.classList.contains('fire') && !node.classList.contains('alt')) fire = rect;
      dockControls.push(rect);
    }
    instrumentCount = dockInstruments.length;
    if (drawer) dockInstruments.push(drawer);
    const minimapBottom = read('.cot-minimap')?.bottom ?? 114;
    const warning = touchAimWarningSlot(width, height, minimapBottom);
    // The network strip (multiplayerStatus.ts) lives outside the HUD; the notices keep clear of it too.
    const strip = read('.cot-mp-status.battle');
    const noticeObstacles = strip ? [...dockInstruments.slice(0, instrumentCount), { x: strip.left, y: strip.top, w: strip.width, h: strip.height }]
      : dockInstruments.slice(0, instrumentCount);
    const sizes = naturalCentreSizes(width, height);
    if (!safeProbe) {
      safeProbe = document.createElement('div');
      safeProbe.setAttribute('aria-hidden', 'true');
      safeProbe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;'
        + 'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
      document.body.append(safeProbe);
    }
    const safe = getComputedStyle(safeProbe);
    const insets = { top: parseFloat(safe.paddingTop) || 0, right: parseFloat(safe.paddingRight) || 0,
      bottom: parseFloat(safe.paddingBottom) || 0, left: parseFloat(safe.paddingLeft) || 0 };
    const anchor = joy && fire ? { x: (joy.x * 2 + joy.w + fire.x * 2 + fire.w) / 4, y: (joy.y * 2 + joy.h + fire.y * 2 + fire.h) / 4 } : null;
    dockKey.length = 0;
    dockKey.push(width, height, top, controls.length, insets.top, insets.right, insets.bottom, insets.left, anchor?.x ?? -1, anchor?.y ?? -1,
      sizes.detection.w, sizes.detection.h, sizes.alert.w, sizes.alert.h, sizes.countdown.w, sizes.countdown.h);
    for (const list of [dockControls, dockInstruments, noticeObstacles]) {
      dockKey.push(list.length);
      for (const o of list) dockKey.push(o.x, o.y, o.w, o.h);
    }
    if (dockKey.length !== dockInputs.length || dockKey.some((value, i) => value !== dockInputs[i])) {
      dockInputs = dockKey.slice();
      centrePlan = planTouchCentre({ width, height, top: top + 8, count: controls.length, controls: dockControls,
        instruments: noticeObstacles, drawer: dockInstruments.slice(instrumentCount), lanes: [warning],
        keepOut: touchAimKeepOut(width, height, minimapBottom), anchor, insets,
        detection: sizes.detection, alert: sizes.alert, countdown: sizes.countdown });
      setDockOpen(false);
    }
    const plan = centrePlan;
    const placement = plan?.dock ?? null;
    applyCentre(plan);
    setStyle(document.body, '--hud-systems-tile', placement ? `${placement.tile}px` : '');
    // Each tile sits at its slot (bottom row first); a control behind More sits at its place in the open panel.
    for (const [i, control] of controls.entries()) {
      const slot = placement ? (i < placement.shown ? placement.tiles[i] : placement.flyout[i - placement.shown]) : null;
      setStyle(control, '--dock-x', slot && placement ? `${slot.x - placement.x}px` : '');
      setStyle(control, '--dock-y', slot && placement ? `${slot.y - placement.y}px` : '');
      const behindMore = !!placement && i >= placement.shown;
      if (control.hasAttribute('data-dock-overflow') !== behindMore) control.toggleAttribute('data-dock-overflow', behindMore);
    }
    const moreSlot = placement?.more ? placement.tiles[placement.shown] : null;
    more.hidden = !moreSlot;
    setStyle(more, '--dock-x', moreSlot && placement ? `${moreSlot.x - placement.x}px` : '');
    setStyle(more, '--dock-y', moreSlot && placement ? `${moreSlot.y - placement.y}px` : '');
    if (moreSlot && placement) {
      const hidden = controls.length - placement.shown;
      const caption = `+${hidden}`;
      const label = more.querySelector('.sl');
      if (label && label.textContent !== caption) label.textContent = caption;
      const name = t('systems.more', { count: hidden });
      if (more.getAttribute('aria-label') !== name) more.setAttribute('aria-label', name);
    } else setDockOpen(false);
    // No spot for even one tile: the strip styles apply again (the attribute is not observed, so this cannot loop).
    if (document.body.hasAttribute('data-hud-dock') !== !!placement) document.body.toggleAttribute('data-hud-dock', !!placement);
    // Standing in a notices' lane (568 x 256): a notice shown there draws over the dock (battleHudLayout.css).
    if (document.body.hasAttribute('data-hud-dock-lane') !== !!placement?.inLane) document.body.toggleAttribute('data-hud-dock-lane', !!placement?.inLane);
    publishYield(placement, controls, more);
    return plan;
  }
  // The natural boxes of detection, the alert and the countdown at this viewport (centreNotices.ts places them; the
  // compact notices and countdown are its fallback, so these are read with them off and remembered per viewport, or a
  // compact box would feed back into the next placement). The alert's box is a reserve, not its current text
  // (alertReserve), so the lane never moves with the copy.
  let centreSizes: { width: number; height: number; detection: NoticeSize; alert: NoticeSize; countdown: NoticeSize } | null = null;
  function naturalCentreSizes(width: number, height: number): NonNullable<typeof centreSizes> {
    if (centreSizes?.width === width && centreSizes.height === height) return centreSizes;
    const body = document.body;
    for (const name of ['data-hud-notices', 'data-hud-countdown']) if (body.hasAttribute(name)) body.toggleAttribute(name, false);
    const sixth = root.querySelector<HTMLElement>('.cot-sixth'), alert = root.querySelector<HTMLElement>('.cot-alert');
    const countdown = root.querySelector<HTMLElement>('.cot-prebattle');
    centreSizes = { width, height,
      detection: { w: sixth?.offsetWidth || Math.min(248, width - 28), h: sixth?.offsetHeight || 48 },
      alert: alertReserve(width, alert?.offsetHeight || 38),
      countdown: { w: countdown?.offsetWidth || Math.min(390, width - 32), h: countdown?.offsetHeight || 136 } };
    return centreSizes;
  }
  // Where the plan puts the notices and the countdown (battleHudLayout.css body[data-hud-notices] /
  // [data-hud-countdown]): each notice's centre x, top and width, flanking or compact; the countdown's centre x, top
  // and scale, or its compact line.
  function applyCentre(plan: TouchCentrePlan | null): void {
    const body = document.body;
    const notices = plan?.notices ?? null, countdown = plan?.countdown ?? null;
    const attribute = (name: string, value: string | null) => {
      if (value === null) { if (body.hasAttribute(name)) body.toggleAttribute(name, false); } else if (body.getAttribute(name) !== value) body.setAttribute(name, value);
    };
    attribute('data-hud-notices', notices ? notices.compact ? 'compact' : 'full' : null);
    attribute('data-hud-notices-flank', notices?.arrangement === 'flank' ? '' : null);
    const px = (value: number | undefined) => value === undefined ? '' : `${Math.round(value * 10) / 10}px`;
    setStyle(body, '--hud-notice-x', px(notices ? notices.detection.x + notices.detection.w / 2 : undefined));
    setStyle(body, '--hud-notice-w', px(notices?.detection.w));
    setStyle(body, '--hud-alert-x', px(notices ? notices.arrangement === 'flank' ? notices.alert.x : notices.alert.x + notices.alert.w / 2 : undefined));
    setStyle(body, '--hud-alert-w', px(notices?.alert.w));
    attribute('data-hud-countdown', countdown ? countdown.compact ? 'compact' : 'full' : null);
    setStyle(body, '--hud-countdown-x', px(countdown ? countdown.x + countdown.w / 2 : undefined));
    setStyle(body, '--hud-countdown-top', px(countdown?.y));
    setStyle(body, '--hud-countdown-w', px(countdown?.compact ? countdown.w : undefined));
    setStyle(body, '--hud-countdown-scale', countdown && !countdown.compact ? String(countdown.scale) : '');
  }

  function refresh() {
    frame = 0;
    const visible = !!root.getClientRects().length;
    if (document.body.hasAttribute('data-cot-battle-layout') !== visible) {
      document.body.toggleAttribute('data-cot-battle-layout', visible);
    }
    if (!visible) { setDockOpen(false); return; }
    observe('.cot-vehicle-status,.cot-net,.cot-aim-warning,.cot-sixth,.cot-alert,.cot-ear,.cot-minimap,.cot-dp,.cot-drive,.cot-vehicle-controls,.cot-spec,.cot-top,.cot-mode-status,.cot-prebattle,.cot-touch .mobile-chrome,.cot-shells');
    // The joystick, FIRE, scope, auto-aim, the consumables (a ruleset can hide them mid-session) and each tile of the
    // vehicle-controls row: by size only, so a press never relayouts the HUD.
    observeSize('.cot-touch .joy,.cot-touch .round,.cot-cons,.cot-vehicle-controls>button');
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
    // Touch: the action dock (touchActionDock.ts) lays the controls out as tiles (48 px, never under 44) at the free
    // spot nearest the thumbs, clear of the crosshair, and never scrolls; when the whole row does not fit its last
    // tile is More. The older strip placement below remains only for a screen without room for a single tile.
    const centre = touch && systems && systemsElement ? placeTouchCentre(systemsElement, width, height, top) : null;
    if (!centre) { publishYield(null, [], null); applyCentre(null); }
    const dock = centre?.dock ?? null;
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
    // Touch: the centre notices own the lane centreNotices.ts gave them, clear of the reticle (they are never pushed
    // down by the feeds, which used to put them on the crosshair of most phones); while one shows, a side feed whose
    // column reaches that lane ends above it.
    const alertShown = read('.cot-alert.show');
    const noticeShown = !!(read('.cot-sixth.on') || alertShown);
    const noticeLane = centre?.notices ?? null;
    let noticeFloorLeft = height, noticeFloorRight = height;
    if (noticeLane && noticeShown) {
      for (const box of [noticeLane.detection, noticeLane.alert]) {
        if (box.x < sideWidth + 12) noticeFloorLeft = Math.min(noticeFloorLeft, box.y - 8);
        if (box.x + box.w > width - sideWidth - 12) noticeFloorRight = Math.min(noticeFloorRight, box.y - 8);
      }
    }
    const leftBottom = Math.min(leftFloor(height, touch), noticeFloorLeft,
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
    const rightBottom = Math.min(rightFloor(height, width, map), noticeFloorRight,
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
    const stack = battleSideStack(leftBottom - noticeReserve - leftTop, chat, toastCount);
    setRows(toastHost, stack.toastRows);
    if (touch && width > height && height <= 340) noticeTop = Math.max(top + 16, scoreBottom + 52);
    if (sideNotices) noticeTop = Math.max(top + 8, leftBottom - noticeReserve + 8);
    // Touch: the lane centreNotices.ts placed (applyCentre set each notice's centre x and width).
    const alertTop = noticeLane ? noticeLane.alert.y : noticeTop + (notice?.height ?? 48) + 8;
    if (noticeLane) noticeTop = noticeLane.detection.y;
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
      'systems-top': systemsTop, 'systems-width': systemsWidth, 'systems-left': systemsLeft, 'systems-height': systemsHeight,
      'portrait-countdown-top': systemsTop < 391 && systemsTop + systemsHeight > 255 ? systemsTop + systemsHeight + 8 : 255,
      'notice-top': noticeTop, 'alert-top': alertTop,
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
