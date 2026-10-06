/** A single reusable, viewport-clamped tooltip for delegated hover/focus/tap targets. */
let serial = 0;
export function createRichTooltip(host: HTMLElement, selector: string, content: (target: HTMLElement) => HTMLElement | null) {
  const tip = document.createElement('div');
  tip.className = 'cot-rich-tooltip'; tip.id = `cot-rich-tooltip-${++serial}`;
  tip.setAttribute('role', 'tooltip'); tip.setAttribute('popover', 'manual'); tip.hidden = true;
  document.body.append(tip);
  let anchor: HTMLElement | null = null, timer = 0;
  let previousDescription: string | null = null;
  let dismissing = false;
  const targetOf = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>(selector) : null;
  function hide() {
    clearTimeout(timer);
    if (anchor) {
      if (previousDescription === null) anchor.removeAttribute('aria-describedby');
      else anchor.setAttribute('aria-describedby', previousDescription);
    }
    anchor = null;
    dismissing = true;
    if (tip.matches(':popover-open')) tip.hidePopover();
    tip.hidden = true; dismissing = false;
  }
  function position() {
    if (!anchor) return;
    const bounds = anchor.getBoundingClientRect();
    const w = window.visualViewport?.width || innerWidth, h = window.visualViewport?.height || innerHeight;
    const above = Math.max(0, bounds.top - 18), belowSpace = Math.max(0, h - bounds.bottom - 18);
    const useBelow = belowSpace >= above;
    tip.style.maxHeight = `${Math.max(48, useBelow ? belowSpace : above)}px`;
    const rect = tip.getBoundingClientRect();
    const x = Math.max(8, Math.min(w - rect.width - 8, bounds.left + bounds.width / 2 - rect.width / 2));
    const below = bounds.bottom + 10;
    const y = useBelow ? Math.min(h - rect.height - 8, below) : Math.max(8, bounds.top - rect.height - 10);
    tip.style.left = `${x}px`; tip.style.top = `${y}px`;
  }
  function show(target: HTMLElement) {
    clearTimeout(timer);
    if (anchor === target) return;
    const body = content(target); if (!body) return;
    hide(); anchor = target; previousDescription = target.getAttribute('aria-describedby');
    target.setAttribute('aria-describedby', [previousDescription, tip.id].filter(Boolean).join(' '));
    tip.replaceChildren(body); tip.hidden = false; tip.showPopover(); position();
  }
  const scroll = () => {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect(), bounds = host.getBoundingClientRect();
    if (rect.bottom < bounds.top || rect.top > bounds.bottom) hide(); else position();
  };
  const leave = () => { clearTimeout(timer); timer = window.setTimeout(() => {
    if (anchor?.matches(':hover,:focus-within') || tip.matches(':hover')) return;
    hide();
  }, 140); };
  const enter = (event: PointerEvent) => { if (event.pointerType !== 'touch') { const target = targetOf(event.target); if (target) show(target); } };
  const focus = (event: FocusEvent) => { if (dismissing) return; const target = targetOf(event.target); if (target) show(target); };
  const click = (event: MouseEvent) => { const target = targetOf(event.target); if (target) { event.preventDefault(); show(target); } };
  const outside = (event: PointerEvent) => { if (anchor && !anchor.contains(event.target as Node) && !tip.contains(event.target as Node)) hide(); };
  const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && anchor) { hide(); event.preventDefault(); event.stopImmediatePropagation(); } };
  host.addEventListener('pointerover', enter); host.addEventListener('pointerout', leave);
  host.addEventListener('focusin', focus); host.addEventListener('focusout', leave); host.addEventListener('click', click);
  tip.addEventListener('pointerenter', () => clearTimeout(timer)); tip.addEventListener('pointerleave', leave);
  window.addEventListener('pointerdown', outside, true); window.addEventListener('keydown', key, true);
  window.addEventListener('resize', hide); host.addEventListener('scroll', scroll, true);
  return { hide, dispose() {
    hide(); tip.remove(); host.removeEventListener('pointerover', enter); host.removeEventListener('pointerout', leave);
    host.removeEventListener('focusin', focus); host.removeEventListener('focusout', leave); host.removeEventListener('click', click);
    window.removeEventListener('pointerdown', outside, true); window.removeEventListener('keydown', key, true);
    window.removeEventListener('resize', hide); host.removeEventListener('scroll', scroll, true);
  } };
}
