/** Bounded side lanes. Reflow on UI/viewport changes, never in the render loop. */
export function battleSideStack(height: number, chat: boolean, toastCount: number) {
  const available = Math.max(0, height);
  const chatReserve = chat ? 62 : 0;
  const toastRows = Math.min(3, toastCount,
    Math.max(0, Math.floor((available - chatReserve - 18) / 53)));
  const toastHeight = toastRows ? 18 + toastRows * 53 : 0;
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
    return Math.min(height - 92,
      map && map.left > width / 2 ? map.top - 8 : height,
      read('.cot-spec.show')?.top ?? height,
      width < 768 ? read('.cot-drive')?.top ?? height : height,
      width < 768 ? read('.cot-special.show')?.top ?? height : height);
  }
  function refresh() {
    frame = 0;
    const visible = !!root.getClientRects().length;
    if (document.body.hasAttribute('data-cot-battle-layout') !== visible) {
      document.body.toggleAttribute('data-cot-battle-layout', visible);
    }
    if (!visible) return;
    observe('.cot-ear,.cot-minimap,.cot-dp,.cot-drive,.cot-special,.cot-spec,.cot-top,.cot-touch .joy,.cot-touch .fire.alt');
    observe('.cot-si-toasthost,.cot-room-chat', true);
    const height = window.visualViewport?.height || window.innerHeight;
    const width = window.visualViewport?.width || window.innerWidth;
    const touch = document.body.classList.contains('cot-touch-layout');
    const tray = width < 1000 ? 'stacked' : 'inline';
    if (document.body.dataset.hudTray !== tray) document.body.dataset.hudTray = tray;
    const map = read('.cot-minimap');
    const top = read('.cot-top')?.bottom || 64;
    const leftTop = Math.max(top, read('.cot-ear.l')?.bottom || 0,
      map && map.left < width / 2 ? map.bottom : 0) + 8;
    const leftBottom = leftFloor(height, touch);
    const rightTop = Math.max(top, read('.cot-ear.r')?.bottom || 0) + 8;
    const rightBottom = rightFloor(height, width, map);
    const chat = !!read('.cot-room-chat:not([hidden])');
    const toastCount = root.querySelector('.cot-si-toasthost')?.childElementCount || 0;
    const stack = battleSideStack(leftBottom - leftTop, chat, touch ? Math.min(1, toastCount) : toastCount);
    const properties = {
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
    const toastRows = String(stack.toastRows);
    if (root.dataset.toastRows !== toastRows) root.dataset.toastRows = toastRows;
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(refresh);
  }
  watchAttributes(document.body, ['class'], true);
  watchAttributes(root, ['style'], true);
  window.addEventListener('resize', schedule, { passive: true });
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
