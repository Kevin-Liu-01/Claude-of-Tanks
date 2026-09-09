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
  const resize = new ResizeObserver(schedule);
  const changes = new MutationObserver(schedule);
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
      changes.observe(node, { attributes: true, attributeFilter: ['class', 'hidden'], childList: content });
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
    document.body.toggleAttribute('data-cot-battle-layout', !!root.getClientRects().length);
    if (!root.getClientRects().length) return;
    observe('.cot-ear,.cot-minimap,.cot-dp,.cot-drive,.cot-special,.cot-spec,.cot-top,.cot-touch .joy,.cot-touch .fire.alt');
    observe('.cot-si-toasthost,.cot-room-chat', true);
    const height = window.visualViewport?.height || window.innerHeight;
    const width = window.visualViewport?.width || window.innerWidth;
    const touch = document.body.classList.contains('cot-touch-layout');
    document.body.dataset.hudTray = width < 1000 ? 'stacked' : 'inline';
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
      document.body.style.setProperty(`--hud-${name}`, `${Math.floor(value)}px`);
    }
    root.dataset.toastRows = String(stack.toastRows);
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(refresh);
  }
  changes.observe(document.body, { childList: true, attributes: true, attributeFilter: ['class'] });
  changes.observe(root, { childList: true, attributes: true, attributeFilter: ['style'] });
  window.addEventListener('resize', schedule, { passive: true });
  window.visualViewport?.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('cot:layoutchange', schedule);
  schedule();
}
