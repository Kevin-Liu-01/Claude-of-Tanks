/**
 * revealStills.ts — the public pages' stills under the kit's reveal (ui/components/reveal.ts): each picture fades in
 * over its box's own tone once decoded; one that failed leaves the tone (never a broken frame) and loads again, quietly,
 * once the browser is back online (the loading census, 2026-10-28: the manual's cards, banners and the 404's figures
 * popped in, and drew broken frames offline). The box is the picture's parent, the element the kit's sheet fades.
 * Copyright © 2026 Kevin B. Liu.
 */
import { revealWhenReady } from '../ui/components/reveal.ts';

export function revealStills(images: Iterable<HTMLImageElement>): void {
  const boxes = [...images].flatMap((image) => (image.parentElement ? [[image.parentElement, image] as const] : []));
  for (const [box, image] of boxes) revealWhenReady(box, image);
  if (!boxes.length) return;
  addEventListener('online', () => {
    for (const [box, image] of boxes) {
      if (!box.hasAttribute('data-failed')) continue;
      // the same addresses again: a failed request is fetched anew
      const srcset = image.getAttribute('srcset');
      if (srcset) image.setAttribute('srcset', srcset);
      image.src = image.getAttribute('src') ?? '';
      revealWhenReady(box, image);
    }
  });
}
