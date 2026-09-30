/** Matches the scoreboard polygon; the objective clears each bottom corner by 8px. */
export const SCORE_BOTTOM_INSET = 25;
export function objectiveWidth(scoreWidth: number): number {
  return Math.max(0, scoreWidth - 2 * (SCORE_BOTTOM_INSET + 8));
}

/** Bounded side lanes. Reflow on UI/viewport changes, never in the render loop. */
export function battleSideStack(height: number, chat: boolean, toastCount: number) {
  const available = Math.max(0, height);
  const chatReserve = chat ? 62 : 0;
  const toastRows = Math.min(3, toastCount,
    Math.max(0, Math.floor((available - chatReserve - 8 + 5) / 53)));
  const toastHeight = toastRows ? toastRows * 53 - 5 : 0;
  const gap = toastHeight && chat ? 8 : 0;
  return { toastRows, toastHeight, chatOffset: toastHeight + gap,
    chatHeight: Math.max(0, available - toastHeight - gap) };
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
      watchAttributes(node, ['class', 'hidden'], content);
    }
  };
  function leftFloor(height: number, touch: boolean): number {
    const status = read('.cot-dp');
    return Math.min(height - 12,
      status ? status.top - (touch ? 8 : 36) : height,
      read('.cot-spec.show')?.top ?? height,
      touch ? read('.cot-touch.on .joy')?.top ?? height : height,
      touch ? read('.cot-touch.on .fire.alt')?.top ?? height : height,
      read('.cot-drive')?.top ?? height) - 8;
  }
  function rightFloor(height: number, width: number, map: DOMRect | null): number {
    const ammo = read('.cot-shells');
    return Math.min(height - 92,
      ammo && ammo.left > width / 2 ? ammo.top - 8 : height,
      map && map.left > width / 2 ? map.top - 8 : height,
      read('.cot-spec.show')?.top ?? height,
      width < 768 ? read('.cot-drive')?.top ?? height : height);
  }
  function refresh() {
    frame = 0;
    const visible = !!root.getClientRects().length;
    if (document.body.hasAttribute('data-cot-battle-layout') !== visible) {
      document.body.toggleAttribute('data-cot-battle-layout', visible);
    }
    if (!visible) return;
    observe('.cot-ear,.cot-minimap,.cot-dp,.cot-drive,.cot-vehicle-controls,.cot-spec,.cot-top,.cot-mode-status,.cot-prebattle,.cot-touch .mobile-chrome,.cot-shells,.cot-touch .autoaim,.cot-touch .joy,.cot-touch .fire.alt');
    observe('.cot-si-toasthost,.cot-room-chat,.cot-kill-lane', true);
    // The multiplayer v2 network strip (src/ui/multiplayerStatus.ts) lives outside the HUD root; it
    // asks for a relayout when it mounts, and the right roster takes the lane below it.
    observe('.cot-mp-status.battle');
    const height = window.visualViewport?.height || window.innerHeight;
    const width = window.visualViewport?.width || window.innerWidth;
    const touch = document.body.classList.contains('cot-touch-layout');
    const tray = width < 1000 ? 'stacked' : 'inline';
    if (document.body.dataset.hudTray !== tray) document.body.dataset.hudTray = tray;
    const map = read('.cot-minimap');
    const score = read('.cot-top');
    const scoreBottom = score?.bottom || 64;
    const top = Math.max(scoreBottom, read('.cot-mode-status.show')?.bottom || 0);
    const leftAnchor = Math.max(top, read('.cot-ear.l')?.bottom || 0,
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
    const sideWidth = Math.min(300, width / 2 - 20);
    const leftBottom = Math.min(leftFloor(height, touch),
      systemsHeight && systemsLeft < sideWidth + 12 ? systemsTop - 8 : height);
    const countdown = read('.cot-prebattle.on');
    const leftKillBottom = countdown && countdown.left < 12 + Math.min(300, width / 2 - 20)
      && countdown.bottom > leftAnchor ? Math.min(leftBottom, countdown.top - 8) : leftBottom;
    const killHeightLeft = Math.max(0, Math.min(3, Math.floor((leftKillBottom - leftAnchor + 3) / 29)) * 29 - 3);
    const killsLeft = Math.min(killHeightLeft, read('.cot-kill-lane.l')?.height || 0);
    const leftTop = leftAnchor + (killsLeft ? killsLeft + 8 : 0);
    const earRight = read('.cot-ear.r');
    const strip = read('.cot-mp-status.battle');
    // A strip in the right roster's column pushes the roster below it (the roster's own top is otherwise its CSS lane).
    const rosterTopRight = strip && earRight && strip.right > earRight.left && strip.bottom > earRight.top - 8 ? Math.ceil(strip.bottom) + 6 : null;
    const rosterBottomRight = earRight ? (rosterTopRight ?? earRight.top) + (earRight.bottom - earRight.top) : 0;
    const chrome = touch ? read('.cot-touch.on .mobile-chrome') : null;
    const rightAnchor = Math.max(top, rosterBottomRight, chrome?.bottom || 0) + 8;
    const rightBottom = Math.min(rightFloor(height, width, map),
      systemsHeight && systemsLeft + dockWidth > width - sideWidth - 12 ? systemsTop - 8 : height);
    const rightKillBottom = countdown && countdown.right > width - 12 - Math.min(300, width / 2 - 20)
      && countdown.bottom > rightAnchor ? Math.min(rightBottom, countdown.top - 8) : rightBottom;
    const killHeightRight = Math.max(0, Math.min(3, Math.floor((rightKillBottom - rightAnchor + 3) / 29)) * 29 - 3);
    const killsRight = Math.min(killHeightRight, read('.cot-kill-lane.r')?.height || 0);
    const rightTop = rightAnchor + (killsRight ? killsRight + 8 : 0);
    const chat = !!read('.cot-room-chat:not([hidden])');
    const toastCount = root.querySelector('.cot-si-toasthost')?.childElementCount || 0;
    const stack = battleSideStack(leftBottom - leftTop, chat, touch ? Math.min(1, toastCount) : toastCount);
    const properties = {
      'systems-top': systemsTop, 'systems-width': systemsWidth, 'systems-left': systemsLeft,
      'portrait-countdown-top': systemsTop < 391 && systemsTop + systemsHeight > 255 ? systemsTop + systemsHeight + 8 : 255,
      'objective-top': scoreBottom + 2, 'objective-bottom': top,
      'objective-width': objectiveWidth(score?.width || 344),
      'objective-left': score ? score.left + score.width / 2 : width / 2,
      'kill-left-top': leftAnchor, 'kill-right-top': rightAnchor,
      'kill-left-height': killHeightLeft, 'kill-right-height': killHeightRight,
      'left-top': leftTop, 'left-height': Math.max(0, leftBottom - leftTop),
      'right-top': rightTop, 'right-height': Math.max(0, rightBottom - rightTop),
      'toast-height': stack.toastHeight, 'chat-top': leftTop + stack.chatOffset,
      'chat-height': stack.chatHeight,
    };
    for (const [name, value] of Object.entries(properties)) {
      const property = `--hud-${name}`;
      const pixels = `${Math.floor(value)}px`;
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
  watchAttributes(root, ['style'], true);
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
