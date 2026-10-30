// The kit's reveal (loading states, owner 2026-10-27: "images and video fade in when decoded"). Copyright © 2026 Kevin B. Liu.
//
// A media box holds its final size and its tone (or a skeleton, components.ts skeleton()) from its first paint; its
// image or video stays transparent until it can be drawn whole, then fades in (components.css [data-reveal]). The box
// carries the state, so a stylesheet, a test or the loading census (tools/loading-census.mjs) reads one attribute:
// `data-ready` once drawn, `data-failed` when the file never arrives (the tone stays; nothing broken is shown).

type RevealMedia = HTMLImageElement | HTMLVideoElement;

/** Fade `media` (the box's first image or video) in once it is decoded (an image) or can play through (a video). */
export function revealWhenReady(box: HTMLElement, media: RevealMedia | null = box.querySelector<RevealMedia>('img,video')): void {
  box.setAttribute('data-reveal', '');
  box.removeAttribute('data-ready');
  box.removeAttribute('data-failed');
  const ready = (): void => { box.setAttribute('data-ready', ''); };
  const failed = (): void => { box.setAttribute('data-failed', ''); };
  if (!media) { ready(); return; }
  if (media instanceof HTMLVideoElement) {
    // (HAVE_ENOUGH_DATA: a frame and enough to play on; a poster draws under it until then)
    if (media.readyState >= 4) { ready(); return; }
    media.addEventListener('canplaythrough', ready, { once: true });
    media.addEventListener('error', failed, { once: true });
    return;
  }
  if (media.complete) {
    if (media.naturalWidth > 0) ready(); else if (media.currentSrc || media.getAttribute('src')) failed();
    else media.addEventListener('load', () => media.decode().then(ready, ready), { once: true });
    return;
  }
  // decode() settles once the image can paint without a decode stall; a decode that fails on a loaded image still
  // shows it (ready), an image that fails to load shows the tone (failed)
  media.addEventListener('error', failed, { once: true });
  media.decode().then(ready, () => { if (media.complete && media.naturalWidth > 0) ready(); });
}
