/**
 * The landing's hero reel (owner 2026-10-25: "have big hero pics always animate and show multiple (like showing videos)").
 *
 * The first clip's poster paints with the document and is the page's LCP; nothing here runs before the page has loaded
 * and gone idle. Then the clips (tools/home-premiere.mjs writes them without a source) take their turns: a clip gets its
 * file (mediaPlayer.ts chooseSource: the phone rung on a phone), buffers while the one before it plays, and crossfades in
 * from its first frame when that one's turn ends and it can play through to its end (owner 2026-10-27: "make em load fast
 * and transition in since its the first load and might take a while"): the first clip fades in over the poster, which is
 * its own first frame, only then. A clip that cannot play through yet holds the turn; the playing one loops meanwhile.
 * Only the playing clip and the next hold a file and a decoder. A clip on screen carries data-ready (the loading
 * census's mark).
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

/** A clip comes on only once it can play through to its end: on a slow link the still holds instead of a stalling film. */
const ready = (video: HTMLVideoElement): boolean => video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA;

export function mountHeroReel(hero: HTMLElement, labels: () => HeroReelLabels): HeroReel | null {
  const clips = [...hero.querySelectorAll<HTMLVideoElement>('video[data-reel-clip]')];
  const toggle = hero.querySelector<HTMLButtonElement>('[data-reel-toggle]');
  // each clip's caption (tools/home-premiere.mjs): the one on screen names its shot; the poster's shows until the first turn
  const shots = [...hero.querySelectorAll<HTMLElement>('[data-reel-shot]')];
  if (!clips.length || !autoplayAllowed()) return null;
  // the pause control is the kit's square icon button on its opaque plate, as every loop on the page has
  // (mediaPlayer.ts MEDIA_TOGGLE_CLASS); the markup holds it hidden, in its slot, until the reel shows it

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
    video.removeAttribute('data-ready');
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
    // its first frame is up: a paused clip says so as it plays, one already buffering by playing as its rewind lands, and
    // either one only once it can play through again from there (a rewind drops what it can play: the /home r2 harness
    // caught a clip coming on at HAVE_METADATA)
    const onFrame = (): void => {
      video.removeEventListener('playing', onFrame);
      video.removeEventListener('seeked', onFrame);
      if (stopped) return;
      if (video.seeking || !ready(video)) {
        // whichever comes next: the seek landing (with what it can play already in) or the clip able to play through
        const retry = (): void => {
          video.removeEventListener('seeked', retry);
          video.removeEventListener('canplaythrough', retry);
          onFrame();
        };
        video.addEventListener('seeked', retry);
        video.addEventListener('canplaythrough', retry);
        return;
      }
      video.style.zIndex = String(++layer);
      video.classList.add('is-on');
      video.setAttribute('data-ready', '');
      for (const shot of shots) shot.classList.toggle('is-on', shot.dataset.reelShot === video.dataset.shot);
      current = index;
      if (previous && previous !== video) window.setTimeout(() => { if (clips[current] !== previous) release(previous); }, FADE_MS);
      if (toggle) toggle.hidden = false;
      // decode the next turn's clip while this one plays
      nextIndex(index);
      schedule();
    };
    video.addEventListener(video.paused ? 'playing' : 'seeked', onFrame);
    video.currentTime = 0;
    void video.play().catch(() => {
      video.removeEventListener('playing', onFrame);
      video.removeEventListener('seeked', onFrame);
      schedule();
    });
  };

  /** The clip buffering for its turn: it plays muted and unseen (a browser that holds back a preload, Safari's, buffers
   *  only what plays) until it can play through, then comes on from its first frame. */
  let pending: HTMLVideoElement | null = null;
  const await_ = (index: number, when: () => boolean): void => {
    const video = clips[index];
    if (pending !== video) {
      pending?.pause();
      pending = video;
      const onReady = (): void => {
        video.removeEventListener('canplaythrough', onReady);
        if (pending === video) pending = null;
        if (running() && when()) bringOn(index);
        else video.pause();
      };
      video.addEventListener('canplaythrough', onReady);
    }
    void video.play().catch(() => {});
  };

  function advance(): void {
    if (!running()) return;
    const index = nextIndex(current);
    if (index < 0 || index === current) return;
    if (ready(clips[index])) {
      bringOn(index);
      return;
    }
    // not able to play through yet: the playing clip keeps the turn (it loops) until this one can
    await_(index, () => true);
  }

  const resume = (): void => {
    if (!running()) return;
    if (current < 0) {
      const first = nextIndex(-1);
      if (first >= 0) {
        if (ready(clips[first])) bringOn(first);
        else await_(first, () => current < 0);
      }
      return;
    }
    void clips[current].play().catch(() => {});
    schedule();
  };

  const halt = (): void => {
    clearTimeout(timer);
    if (current >= 0) clips[current].pause();
    pending?.pause();
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
