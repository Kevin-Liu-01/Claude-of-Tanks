/**
 * homePage.ts — the landing's own behaviour (site/home.html), imported by publicPages.ts on the landing alone: the hero
 * reel's start (heroReel.ts), the trailer's dialog and its controls, and the modes rail's switch and arrows.
 * Copyright © 2026 Kevin B. Liu.
 */
import { t } from '../ui/i18n.ts';
import { dialogSurface } from '../ui/components/surfaceStack.ts';
import { importWhenOnline } from '../ui/components/loadFailure.ts';

// The landing's stills under the hero (the bentos, the features, the modes rail's cards) fade in once decoded: publicPages.ts,
// the page's first module, marks their boxes (home.css).
const stills = [...document.querySelectorAll<HTMLImageElement>('.cot-c-media > img[loading="lazy"]')];

// A still that failed (the link dropped after the page arrived) hides over its box's tone, never a broken frame, and loads
// again, quietly, once the browser is back online: the hero's poster and the stills under it alike.
const failed = new Set<HTMLImageElement>();
const fail = (image: HTMLImageElement): void => {
  image.setAttribute('data-failed', '');
  failed.add(image);
};
for (const image of [document.querySelector<HTMLImageElement>('.hero__still'), ...stills]) {
  if (!image) continue;
  if (image.complete && !image.naturalWidth && image.getAttribute('src')) fail(image);
  image.addEventListener('error', () => fail(image));
}
addEventListener('online', () => {
  for (const image of failed) {
    image.removeAttribute('data-failed');
    // the same addresses again: a failed request is fetched anew
    const srcset = image.getAttribute('srcset');
    if (srcset) image.setAttribute('srcset', srcset);
    image.src = image.getAttribute('src') ?? '';
  }
  failed.clear();
});

// The hero reel (heroReel.ts): its clips take their turns once the page has loaded and gone idle, so the poster, the
// page's LCP picture, never shares the pipe with a clip.
const reelHero = document.querySelector<HTMLElement>('[data-hero-reel]');
if (reelHero) {
  // (a reel whose module did not arrive leaves the poster: its chunk is not asked for again in this document)
  const start = (): void => importWhenOnline(() => import('./heroReel.ts').then(({ mountHeroReel }) => mountHeroReel(reelHero,
    () => ({ pause: t('publicPages.reel.pauseAria'), play: t('publicPages.reel.playAria') }))));
  const idle = (): void => {
    if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 2000 });
    else setTimeout(start, 200);
  };
  if (document.readyState === 'complete') idle();
  else addEventListener('load', idle, { once: true });
}

// The trailer plays in the hero's dialog with its sound, on the viewer's press: its files are named only then. Its controls
// are the page's own (play, the scrubber, the time, mute, full screen); Space, K, M, F and the arrows work inside the dialog.
const clockOf = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
function mountFilm(dialog: HTMLDialogElement, video: HTMLVideoElement): void {
  const play = dialog.querySelector<HTMLButtonElement>('[data-film-play]');
  const mute = dialog.querySelector<HTMLButtonElement>('[data-film-mute]');
  const full = dialog.querySelector<HTMLButtonElement>('[data-film-full]');
  const scrub = dialog.querySelector<HTMLInputElement>('[data-film-scrub]');
  const time = dialog.querySelector<HTMLElement>('[data-film-time]');
  if (!play || !mute || !full || !scrub || !time) return;
  // each toggle holds both its glyphs (tools/home-premiere.mjs): data-on shows the other one
  const set = (button: HTMLButtonElement, on: boolean, key: string): void => {
    button.toggleAttribute('data-on', on);
    button.setAttribute('aria-label', t(key));
  };
  let scrubbing = false;
  const progress = (): void => {
    const length = video.duration || 0;
    const share = length ? video.currentTime / length : 0;
    if (!scrubbing) scrub.value = String(Math.round(share * 1000));
    scrub.style.setProperty('--fill', `${(share * 100).toFixed(2)}%`);
    const now = `${clockOf(video.currentTime)} / ${clockOf(length)}`;
    time.textContent = now;
    scrub.setAttribute('aria-valuetext', now);
  };
  const toggle = (): void => { if (video.paused) void video.play().catch(() => {}); else video.pause(); };
  const fullscreen = (): void => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (dialog.requestFullscreen) void dialog.requestFullscreen().catch(() => {});
    else (video as HTMLVideoElement & { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen?.();
  };
  video.addEventListener('play', () => set(play, true, 'publicPages.film.pause'));
  video.addEventListener('pause', () => set(play, false, 'publicPages.film.play'));
  video.addEventListener('volumechange', () => set(mute, video.muted, video.muted ? 'publicPages.film.unmute' : 'publicPages.film.mute'));
  video.addEventListener('timeupdate', progress);
  video.addEventListener('loadedmetadata', progress);
  document.addEventListener('fullscreenchange', () => full.setAttribute('aria-label',
    t(document.fullscreenElement ? 'publicPages.film.exitFullscreen' : 'publicPages.film.fullscreen')));
  play.addEventListener('click', toggle);
  video.addEventListener('click', toggle);
  mute.addEventListener('click', () => { video.muted = !video.muted; });
  full.addEventListener('click', fullscreen);
  scrub.addEventListener('input', () => {
    scrubbing = true;
    if (video.duration) video.currentTime = (Number(scrub.value) / 1000) * video.duration;
  });
  scrub.addEventListener('change', () => { scrubbing = false; });
  dialog.addEventListener('keydown', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('button') && (event.key === ' ' || event.key === 'Enter')) return;
    const step = event.key === 'ArrowRight' ? 5 : event.key === 'ArrowLeft' ? -5 : 0;
    if (step && target !== scrub) { video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + step)); event.preventDefault(); return; }
    const key = event.key.toLowerCase();
    if (key === ' ' || key === 'k') { toggle(); event.preventDefault(); }
    else if (key === 'm') { video.muted = !video.muted; event.preventDefault(); }
    else if (key === 'f') { fullscreen(); event.preventDefault(); }
  });
}

const trailerDialog = document.querySelector<HTMLDialogElement>('[data-trailer-dialog]');
const trailerVideo = trailerDialog?.querySelector<HTMLVideoElement>('video[data-trailer]') ?? null;
if (trailerDialog && trailerVideo) {
  mountFilm(trailerDialog, trailerVideo);
  // While the film buffers the dialog is busy (its poster shows); a film that cannot load (the link dropped, or a file
  // that never arrives) says so over its poster with the kit's Retry, which loads it again (the loading census: the dialog
  // waited seconds with nothing announced, and offline it never said the film could not load).
  const failedNote = trailerDialog.querySelector<HTMLElement>('[data-film-failed]');
  const busy = (on: boolean): void => { if (on) trailerDialog.setAttribute('aria-busy', 'true'); else trailerDialog.removeAttribute('aria-busy'); };
  const fail = (): void => {
    if (!trailerDialog.open || !failedNote) return;
    busy(false);
    failedNote.hidden = false;
  };
  trailerVideo.addEventListener('canplay', () => busy(false));
  trailerVideo.addEventListener('error', fail);
  // (every source failing ends on the last one's error, not the video's)
  trailerVideo.querySelector('source:last-of-type')?.addEventListener('error', fail);
  addEventListener('offline', () => { if (trailerVideo.readyState < 3) fail(); });
  failedNote?.querySelector('button')?.addEventListener('click', () => {
    failedNote.hidden = true;
    busy(true);
    trailerVideo.load();
    void trailerVideo.play().catch(() => {});
  });
  // on the page's surface stack while open (it closes the open nav menu as it opens; Escape is the stack's)
  dialogSurface(trailerDialog, 'home-trailer');
  document.querySelectorAll<HTMLButtonElement>('[data-trailer-open]').forEach((button) => button.addEventListener('click', () => {
    const named = [...trailerVideo.querySelectorAll<HTMLSourceElement>('source[data-src]')];
    for (const source of named) {
      source.src = source.dataset.src || '';
      delete source.dataset.src;
    }
    if (trailerVideo.dataset.poster && !trailerVideo.poster) trailerVideo.poster = trailerVideo.dataset.poster;
    if (named.length) trailerVideo.load();
    trailerDialog.showModal();
    if (trailerVideo.readyState < 3) busy(true);
    if (!navigator.onLine && trailerVideo.readyState < 3) fail();
    void trailerVideo.play().catch(() => {});
  }));
  trailerDialog.querySelector('[data-trailer-close]')?.addEventListener('click', () => trailerDialog.close());
  // a press on the backdrop closes it too
  trailerDialog.addEventListener('click', (event) => { if (event.target === trailerDialog) trailerDialog.close(); });
  trailerDialog.addEventListener('close', () => {
    busy(false);
    if (failedNote) failedNote.hidden = true;
    trailerVideo.pause();
    if (document.fullscreenElement) void document.exitFullscreen();
  });
}

// The landing's switch of rails: the kit's segmented look over tabs (it shows one panel of several, a tab's work): a
// click, an arrow, Home or End picks a tab, and the list keeps one tab stop on the picked tab.
function mountSegment(group: HTMLElement, pick: (option: HTMLButtonElement) => void): void {
  const options = [...group.querySelectorAll<HTMLButtonElement>('.cot-c-seg__opt')];
  const choose = (option: HTMLButtonElement, focus = false): void => {
    for (const other of options) {
      other.setAttribute('aria-selected', String(other === option));
      other.tabIndex = other === option ? 0 : -1;
    }
    if (focus) option.focus();
    pick(option);
  };
  options.forEach((option, i) => {
    option.addEventListener('click', () => choose(option));
    option.addEventListener('keydown', (event) => {
      const to = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
        : event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (i + 1) % options.length
          : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (i - 1 + options.length) % options.length : -1;
      if (to < 0) return;
      event.preventDefault();
      choose(options[to], true);
    });
  });
}

// How it plays: the switch shows one rail (the modes or a set of mechanics); the arrows step the shown rail by most of a
// screen and rest at its ends. The markup opens with the previous arrow disabled; the rail's own scroll keeps both current,
// so nothing reads layout as the page loads.
function mountPlay(section: HTMLElement): void {
  const group = section.querySelector<HTMLElement>('.cot-c-seg');
  const rails = [...section.querySelectorAll<HTMLElement>('[data-play-panel]')];
  const previous = section.querySelector<HTMLButtonElement>('[data-rail-prev]');
  const next = section.querySelector<HTMLButtonElement>('[data-rail-next]');
  if (!group || !previous || !next) return;
  let shown = rails.find((rail) => !rail.hidden) ?? rails[0];
  let frame = 0;
  const update = (): void => {
    frame = 0;
    previous.disabled = shown.scrollLeft <= 2;
    next.disabled = shown.scrollLeft >= shown.scrollWidth - shown.clientWidth - 2;
    // the rail's edge fades follow its ends (home.css .play-rail)
    shown.toggleAttribute('data-scrolled', !previous.disabled);
    shown.toggleAttribute('data-end', next.disabled);
  };
  const step = (direction: number): void => shown.scrollBy({ left: direction * shown.clientWidth * 0.8,
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  previous.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  for (const rail of rails) rail.addEventListener('scroll', () => { if (rail === shown && !frame) frame = requestAnimationFrame(update); }, { passive: true });
  mountSegment(group, (option) => {
    const tab = option.dataset.playTab || 'modes';
    for (const rail of rails) rail.hidden = rail.dataset.playPanel !== tab;
    shown = rails.find((rail) => !rail.hidden) ?? shown;
    shown.scrollLeft = 0;
    update();
  });
}

document.querySelectorAll<HTMLElement>('#modes').forEach(mountPlay);
