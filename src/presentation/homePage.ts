/**
 * homePage.ts — the landing's own behaviour (site/home.html), imported by publicPages.ts on the landing alone: the hero
 * reel's start (heroReel.ts), the trailer's dialog and its controls, and the modes rail's switch and arrows.
 * Copyright © 2026 Kevin B. Liu.
 */
import { t } from '../ui/i18n.ts';

// The hero reel (heroReel.ts): its clips take their turns once the page has loaded and gone idle, so the poster, the
// page's LCP picture, never shares the pipe with a clip.
const reelHero = document.querySelector<HTMLElement>('[data-hero-reel]');
if (reelHero) {
  const start = (): void => {
    void import('./heroReel.ts').then(({ mountHeroReel }) => mountHeroReel(reelHero,
      () => ({ pause: t('publicPages.reel.pauseAria'), play: t('publicPages.reel.playAria') })));
  };
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
  const set = (button: HTMLButtonElement, icon: string, key: string): void => {
    button.querySelector('use')?.setAttribute('href', `#i-${icon}`);
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
  video.addEventListener('play', () => set(play, 'pause', 'publicPages.film.pause'));
  video.addEventListener('pause', () => set(play, 'play', 'publicPages.film.play'));
  video.addEventListener('volumechange', () => set(mute, video.muted ? 'soundOff' : 'sound', video.muted ? 'publicPages.film.unmute' : 'publicPages.film.mute'));
  video.addEventListener('timeupdate', progress);
  video.addEventListener('loadedmetadata', progress);
  document.addEventListener('fullscreenchange', () => set(full, 'fullscreen',
    document.fullscreenElement ? 'publicPages.film.exitFullscreen' : 'publicPages.film.fullscreen'));
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
  document.querySelectorAll<HTMLButtonElement>('[data-trailer-open]').forEach((button) => button.addEventListener('click', () => {
    const named = [...trailerVideo.querySelectorAll<HTMLSourceElement>('source[data-src]')];
    for (const source of named) {
      source.src = source.dataset.src || '';
      delete source.dataset.src;
    }
    if (trailerVideo.dataset.poster && !trailerVideo.poster) trailerVideo.poster = trailerVideo.dataset.poster;
    if (named.length) trailerVideo.load();
    trailerDialog.showModal();
    void trailerVideo.play().catch(() => {});
  }));
  trailerDialog.querySelector('[data-trailer-close]')?.addEventListener('click', () => trailerDialog.close());
  // a press on the backdrop closes it too
  trailerDialog.addEventListener('click', (event) => { if (event.target === trailerDialog) trailerDialog.close(); });
  trailerDialog.addEventListener('close', () => {
    trailerVideo.pause();
    if (document.fullscreenElement) void document.exitFullscreen();
  });
}

// The landing's segmented control (the kit's cot-c-seg, a radio group): a click or an arrow key picks an option, the
// group keeps one tab stop on the picked option.
function mountSegment(group: HTMLElement, pick: (option: HTMLButtonElement) => void): void {
  const options = [...group.querySelectorAll<HTMLButtonElement>('.cot-c-seg__opt')];
  const choose = (option: HTMLButtonElement, focus = false): void => {
    for (const other of options) {
      other.setAttribute('aria-checked', String(other === option));
      other.tabIndex = other === option ? 0 : -1;
    }
    if (focus) option.focus();
    pick(option);
  };
  options.forEach((option, i) => {
    option.tabIndex = option.getAttribute('aria-checked') === 'true' ? 0 : -1;
    option.addEventListener('click', () => choose(option));
    option.addEventListener('keydown', (event) => {
      const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      choose(options[(i + step + options.length) % options.length], true);
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
