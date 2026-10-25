/**
 * The landing's hero reel (owner 2026-10-25: "have big hero pics always animate and show multiple (like showing videos)").
 *
 * The first clip's poster paints with the document and is the page's LCP; nothing here runs before the page has loaded
 * and gone idle. Then the clips (tools/home-premiere.mjs writes them without a source) take their turns: a clip gets its
 * file (mediaPlayer.ts chooseSource: the phone rung on a phone), decodes while the one before it plays, and crossfades in
 * when that one's turn ends. A clip that is not ready yet holds the turn; the playing one loops meanwhile. Only the
 * playing clip and the next hold a file and a decoder.
 *
 * It never moves by itself under reduced motion or data saving (the poster stays), stops while the hero is off screen or
 * the tab is hidden, and has a pause control (WCAG 2.2.2). The Play hand-off (mediaPlayer.ts abortPageMedia) ends it.
 * Copyright © 2026 Kevin B. Liu.
 */
import { MEDIA_PAUSE_ICON, MEDIA_PLAY_ICON, autoplayAllowed, chooseSource, ladderFromMarkup } from './mediaPlayer.ts';

/** A clip's turn when its file does not say how long it runs. */
const TURN_MS = 6000;
/** The crossfade (home.css .hero__clip transition, --dur-screen) and the margin before a clip's own end. */
const FADE_MS = 700;
const END_MARGIN_MS = 250;
/** The shortest turn, so a short clip still reads. */
const MIN_TURN_MS = 3500;

export interface HeroReelLabels {
  readonly pause: string;
  readonly play: string;
}

export interface HeroReel {
  dispose(): void;
}

const ready = (video: HTMLVideoElement): boolean => video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;

export function mountHeroReel(hero: HTMLElement, labels: () => HeroReelLabels): HeroReel | null {
  const clips = [...hero.querySelectorAll<HTMLVideoElement>('video[data-reel-clip]')];
  const toggle = hero.querySelector<HTMLButtonElement>('[data-reel-toggle]');
  if (!clips.length || !autoplayAllowed()) return null;

  let current = -1;
  let timer = 0;
  // each clip that comes on stacks above the one it covers, so the turn from the last clip back to the first fades too
  let layer = 0;
  let paused = false;
  let visible = true;
  let stopped = false;

  const turnMs = (video: HTMLVideoElement): number => {
    const seconds = Number(video.dataset.seconds) || video.duration || 0;
    return seconds > 0 ? Math.max(MIN_TURN_MS, seconds * 1000 - FADE_MS - END_MARGIN_MS) : TURN_MS;
  };

  /** Give a clip its file and start decoding it; false when this browser plays none of its files. */
  const load = (video: HTMLVideoElement): boolean => {
    if (video.getAttribute('src')) return true;
    const source = chooseSource(video, ladderFromMarkup(video));
    if (!source) return false;
    video.preload = 'auto';
    video.src = source.src;
    video.load();
    return true;
  };

  /** Let a clip go: its file, its decoder and its frame. */
  const release = (video: HTMLVideoElement): void => {
    video.classList.remove('is-on');
    video.pause();
    if (!video.getAttribute('src')) return;
    video.removeAttribute('src');
    video.load();
  };

  const nextIndex = (from: number): number => {
    for (let step = 1; step <= clips.length; step++) {
      const index = (from + step) % clips.length;
      if (load(clips[index])) return index;
    }
    return -1;
  };

  const running = (): boolean => !stopped && !paused && visible && !document.hidden;

  const schedule = (): void => {
    clearTimeout(timer);
    if (!running() || current < 0) return;
    timer = window.setTimeout(advance, turnMs(clips[current]));
  };

  /** Bring a loaded clip on: it fades in over the one playing, which lets go once the fade is done. */
  const bringOn = (index: number): void => {
    const video = clips[index];
    const previous = current >= 0 ? clips[current] : null;
    const onFrame = (): void => {
      video.removeEventListener('playing', onFrame);
      if (stopped) return;
      video.style.zIndex = String(++layer);
      video.classList.add('is-on');
      current = index;
      if (previous && previous !== video) window.setTimeout(() => { if (clips[current] !== previous) release(previous); }, FADE_MS);
      if (toggle) toggle.hidden = false;
      // decode the next turn's clip while this one plays
      nextIndex(index);
      schedule();
    };
    video.addEventListener('playing', onFrame);
    video.currentTime = 0;
    void video.play().catch(() => {
      video.removeEventListener('playing', onFrame);
      schedule();
    });
  };

  function advance(): void {
    if (!running()) return;
    const index = nextIndex(current);
    if (index < 0 || index === current) return;
    const video = clips[index];
    if (ready(video)) {
      bringOn(index);
      return;
    }
    // not decoded yet: the playing clip keeps the turn (it loops) until this one can play through
    const onReady = (): void => {
      video.removeEventListener('canplay', onReady);
      if (running()) bringOn(index);
    };
    video.addEventListener('canplay', onReady);
  }

  const resume = (): void => {
    if (!running()) return;
    if (current < 0) {
      const first = nextIndex(-1);
      if (first >= 0) {
        if (ready(clips[first])) bringOn(first);
        else clips[first].addEventListener('canplay', () => { if (running() && current < 0) bringOn(first); }, { once: true });
      }
      return;
    }
    void clips[current].play().catch(() => {});
    schedule();
  };

  const halt = (): void => {
    clearTimeout(timer);
    if (current >= 0) clips[current].pause();
  };

  const sync = (): void => (running() ? resume() : halt());

  const label = (): void => {
    if (!toggle) return;
    const text = paused ? labels().play : labels().pause;
    toggle.setAttribute('aria-label', text);
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.querySelector('path')?.setAttribute('d', paused ? MEDIA_PLAY_ICON : MEDIA_PAUSE_ICON);
  };
  const onToggle = (): void => {
    paused = !paused;
    label();
    sync();
  };
  toggle?.addEventListener('click', onToggle);

  // a hero scrolled away or a hidden tab stops; coming back resumes the clip it left
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting && entry.intersectionRatio > 0.1;
    sync();
  }, { threshold: [0, 0.1, 0.5] });
  observer.observe(hero);
  const onVisibility = (): void => sync();
  document.addEventListener('visibilitychange', onVisibility);
  // the Play hand-off removed every source already; the reel only stops scheduling
  const onHandoff = (): void => { stopped = true; halt(); };
  window.addEventListener('cot:media-handoff', onHandoff);
  // a page restored from the back-forward cache has its sources back (mediaPlayer.ts): the reel carries on
  const onShow = (event: PageTransitionEvent): void => {
    if (!event.persisted || !stopped) return;
    stopped = false;
    sync();
  };
  window.addEventListener('pageshow', onShow);

  sync();
  return {
    dispose(): void {
      stopped = true;
      halt();
      observer.disconnect();
      toggle?.removeEventListener('click', onToggle);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('cot:media-handoff', onHandoff);
      window.removeEventListener('pageshow', onShow);
      clips.forEach(release);
    },
  };
}
