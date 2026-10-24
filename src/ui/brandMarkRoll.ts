/**
 * The mark rolls under the pointer (owner, 2026-10-24: "hovering over claude of tanks guy should play our rumbling
 * animation"): resting the pointer on a commander mark, or on the link or button that holds it (the nav and footer
 * lockups, the Garage bar, the Studio), plays the living mark's loop once (brandMarkMotion.ts), then the still drawing
 * returns. The svg keeps its box, so nothing around it moves. Once per hover: a hover during the roll does not restart
 * it. Under reduced motion, and on touch, nothing plays. The motion's module and rules load on the first hover; the boot
 * card's mark is the living one already. Copyright © 2026 Kevin B. Liu.
 */
import { ensureStyle } from './styleLayers.ts';

const STILL = 'svg.cot-mark:not(.cot-mark--motion):not(.cot-mark--bust)';
let installed = false;
let motion: Promise<typeof import('./brandMarkMotion.ts')> | null = null;

function markOf(target: EventTarget | null): { host: Element; mark: SVGSVGElement } | null {
  if (!(target instanceof Element)) return null;
  const own = target.closest<SVGSVGElement>(STILL);
  const host = target.closest('a, button, [data-mark-roll]') ?? own;
  const mark = own ?? host?.querySelector<SVGSVGElement>(STILL) ?? null;
  return host && mark ? { host, mark } : null;
}

async function roll(mark: SVGSVGElement): Promise<void> {
  mark.dataset.rolling = '';
  try {
    const { BRAND_MOTION_CSS, LOOP_S, brandMarkMotionSVG } = await (motion ??= import('./brandMarkMotion.ts'));
    ensureStyle('cot-mark-motion', BRAND_MOTION_CSS, 'components');
    const still = mark.innerHTML;
    const height = Number(mark.getAttribute('height')) || 24;
    mark.innerHTML = brandMarkMotionSVG(height).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
    mark.classList.add('cot-mark--motion');
    await new Promise((done) => setTimeout(done, LOOP_S * 1000));
    mark.classList.remove('cot-mark--motion');
    mark.innerHTML = still;
  } finally {
    delete mark.dataset.rolling;
  }
}

export function installMarkRoll(doc: Document = document): void {
  if (installed || typeof doc.addEventListener !== 'function') return;
  installed = true;
  const reduced = doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)');
  doc.addEventListener('pointerover', (event) => {
    if (event.pointerType === 'touch' || reduced?.matches) return;
    const found = markOf(event.target);
    if (!found || 'rolling' in found.mark.dataset) return;
    // a move between the host's own parts is the same hover
    if (event.relatedTarget instanceof Node && found.host.contains(event.relatedTarget)) return;
    void roll(found.mark);
  });
}
