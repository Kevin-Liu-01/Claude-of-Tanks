/**
 * The mark rolls under the pointer (owner, 2026-10-24: "hovering over claude of tanks guy should play our rumbling
 * animation"): resting the pointer on a commander mark, or on the link or button that holds it (the nav and footer
 * lockups, the Garage bar, the Studio), plays the living mark's loop once, then the still drawing returns. The svg keeps
 * its box, so nothing around it moves. Once per hover: a hover during the roll does not restart it. Under reduced motion,
 * and on touch, nothing plays. The boot card's mark is the living one already.
 *
 * The living drawing is a file, public/brand/mark-motion-inline.svg (tools/brand-marks.mjs writes it from
 * brandMarkMotion.ts with its loop's rules), fetched on the first hover and inlined: importing brandMarkMotion.ts here
 * would split the boot graph's brandMark chunk into one request more (src/ui/battleLoad.ts met the same split).
 * Copyright © 2026 Kevin B. Liu.
 */
const STILL = 'svg.cot-mark:not(.cot-mark--motion):not(.cot-mark--bust)';
const MOTION_URL = '/brand/mark-motion-inline.svg';
/** A roll ends on its first loop (the wheels' animationiteration); this bounds it if no animation runs. */
const ROLL_CAP_MS = 2400;
let installed = false;
let living: Promise<string> | null = null;

function markOf(target: EventTarget | null): { host: Element; mark: SVGSVGElement } | null {
  if (!(target instanceof Element)) return null;
  const own = target.closest<SVGSVGElement>(STILL);
  const host = target.closest('a, button, [data-mark-roll]') ?? own;
  const mark = own ?? host?.querySelector<SVGSVGElement>(STILL) ?? null;
  return host && mark ? { host, mark } : null;
}

/** The living mark's inner markup (its rules and its drawing), fetched once. */
function livingBody(): Promise<string> {
  living ??= fetch(MOTION_URL).then((response) => (response.ok ? response.text() : Promise.reject(new Error(MOTION_URL))))
    .then((text) => text.slice(text.indexOf('>') + 1, text.lastIndexOf('</svg>')));
  living.catch(() => { living = null; });
  return living;
}

async function roll(mark: SVGSVGElement): Promise<void> {
  mark.dataset.rolling = '';
  try {
    const body = await livingBody();
    const still = mark.innerHTML;
    mark.innerHTML = body;
    mark.classList.add('cot-mark--motion');
    await new Promise<void>((done) => {
      const cap = setTimeout(done, ROLL_CAP_MS);
      mark.addEventListener('animationiteration', (event) => {
        if (!(event.target instanceof Element) || !event.target.classList.contains('mk-wheel')) return;
        clearTimeout(cap);
        done();
      });
    });
    mark.classList.remove('cot-mark--motion');
    mark.innerHTML = still;
  } catch { /* the still mark stays */ } finally {
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
