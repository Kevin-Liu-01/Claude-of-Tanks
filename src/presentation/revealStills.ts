/**
 * revealStills.ts — the public pages' stills under the kit's reveal (ui/components/reveal.ts): each picture fades in
 * over its box's own tone once decoded; one that failed leaves the tone (never a broken frame) and loads again, quietly,
 * once the browser is back online (the loading census, 2026-10-28: the manual's cards, banners and the 404's figures
 * popped in, and drew broken frames offline). The box is the picture's parent, the element the kit's sheet fades.
 * Stills a page renders again (the archive's wall) call it again; one listener serves them all.
 * Copyright © 2026 Kevin B. Liu.
 */
import { revealWhenReady } from '../ui/components/reveal.ts';

const stills = new Map<HTMLImageElement, HTMLElement>();
let listening = false;

export function revealStills(images: Iterable<HTMLImageElement>): void {
  for (const image of stills.keys()) if (!image.isConnected) stills.delete(image); // (a wall rendered again drops its old cards)
  for (const image of images) {
    const box = image.parentElement;
    if (!box || stills.has(image)) continue;
    stills.set(image, box);
    revealWhenReady(box, image);
  }
  if (listening || !stills.size) return;
  listening = true;
  addEventListener('online', () => {
    for (const [image, box] of stills) {
      if (!image.isConnected || !box.hasAttribute('data-failed')) continue;
      // the same addresses again: a failed request is fetched anew
      const srcset = image.getAttribute('srcset');
      if (srcset) image.setAttribute('srcset', srcset);
      image.src = image.getAttribute('src') ?? '';
      revealWhenReady(box, image);
    }
  });
}
