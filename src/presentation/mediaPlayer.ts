/**
 * mediaPlayer.ts — the one playback policy for every web video on the public pages and in the Garage's take panel
 * (brand-ui SPEC 8.3, SHOWCASE §5.4-5.5; BUI-F7). It generalizes what src/ui/fleetTakes.ts did for one vehicle's take
 * and replaces each page's own warm observer.
 *
 * - No source until the frame is within a quarter viewport (`preload="none"` before that); a page loop may start its
 *   transfer there (`warm`), a take starts only when it plays.
 * - Plays at half the frame visible, pauses below a tenth, in a hidden tab and when another player takes its slot
 *   beyond the cap (two playing on a desktop, one on a phone). A paused source is released after ten seconds.
 * - One transfer at a time: a player that wants a source while another downloads waits, and the waiting frame nearest
 *   the viewport centre goes next. The viewer's own play never waits.
 * - Hover players (versus wall, Gallery grid) start 150 ms after a pointer or focus arrives.
 * - Source ladder: AV1 (first, only where MediaCapabilities calls it smooth), then VP9, then H.264, as the markup lists
 *   them; a phone plays its phone rung, a wide screen its wide rung.
 * - Reduced motion and data saving (Save-Data, 2g/3g) never name a source by themselves: the poster stays, with a play
 *   button. Decorative loops are aria-hidden; the control names the video; a loop longer than five seconds shows its
 *   pause control (WCAG 2.2.2).
 * - abortPageMedia() is the landing's Play hand-off: every transfer stops before the game document is requested.
 *
 * The module imports nothing, runs nothing at import and holds no strings: callers pass their localized labels. It
 * reaches the game only through import() (fleetTakes.ts, after the Garage is interactive), never its boot graph.
 */

/** The policy's numbers (SPEC 8.3; hard limits). */
export const MEDIA_POLICY = Object.freeze({
  /** The transfer may start once the frame is within a quarter viewport. */
  nearMargin: '25% 0px',
  /** A player starts at half its frame visible... */
  playRatio: 0.5,
  /** ...and keeps playing until less than a tenth is. */
  pauseRatio: 0.1,
  /** A paused source survives a scroll reversal this long, then its transfer and decoder are released. */
  releaseMs: 10_000,
  /** Hover and focus wait this long before a hover player starts (a cursor sweep starts nothing). */
  hoverDelayMs: 150,
  /** At most this many loops play at once. */
  maxPlayingDesktop: 2,
  maxPlayingPhone: 1,
  /** A loop longer than this shows a pause control (WCAG 2.2.2). */
  pauseControlSeconds: 5,
  /** The phone layout (src/ui/responsiveLayout.ts phone + compact bands) and the wide screens that may play 1920 loops. */
  phoneQuery: '(max-width: 767px)',
  wideQuery: '(min-width: 1280px)',
});

export type MediaRung = 'phone' | 'wide';

/** One file of a video's ladder. `type` may carry codecs (`video/webm; codecs="av01.0.08M.08"`). */
export interface MediaSource {
  readonly src: string;
  readonly type: string;
  /** phone: the phone rung (≤ 960x540, ≤ 1 MB per 6 s); wide: only on wide screens without data saving. */
  readonly rung?: MediaRung;
}

export interface MediaItem {
  /** The ladder in preference order: AV1, VP9, H.264 (and the phone and wide rungs anywhere in it). */
  readonly sources: readonly MediaSource[];
  /** The poster, set on the video once the frame is near (omit when the page draws its own poster picture). */
  readonly poster?: string;
  /** The loop's length when the page knows it (the pause control's rule); else the video's own duration. */
  readonly seconds?: number;
}

/** loop: plays by itself on screen; hover: on pointer or focus; click: only when the viewer plays it. */
export type MediaMode = 'loop' | 'hover' | 'click';

export interface MediaPlayerOptions {
  /** The control's accessible name for the state it would change to (play when paused, pause when playing). */
  readonly label: (playing: boolean) => string;
  readonly mode?: MediaMode;
  /** Start the transfer within the near margin instead of when the frame plays (page loops). */
  readonly warm?: boolean;
  /** The surface's own gate on starting by itself (the Garage waits until it is playable); the viewer's play bypasses it. */
  readonly gate?: () => boolean;
  /** The element observed for visibility and distance (default: the video). */
  readonly frame?: HTMLElement;
  /** Where the control goes (default: the frame's parent for a video frame, else the frame). */
  readonly controlParent?: HTMLElement | null;
  readonly controlClass?: string;
  /** auto: shown when motion waits for the viewer or the loop runs longer than five seconds; always; none. */
  readonly control?: 'auto' | 'always' | 'none';
  /** The element whose hover or focus plays a hover player (default: the frame). */
  readonly hoverTarget?: HTMLElement;
  /**
   * The video shows its own controls: once near, its source is named without a transfer (preload none) so the viewer's
   * play can start it under reduced motion or data saving, and the viewer's own play and pause steer the policy.
   */
  readonly native?: boolean;
}

export interface MediaPlayer {
  readonly video: HTMLVideoElement;
  readonly control: HTMLButtonElement | null;
  /** Show this item (null empties the player). A new item releases the last one's source at once. */
  show(item: MediaItem | null): void;
  /** Re-check every gate (the surface's own, the motion preference, the connection). */
  sync(): void;
  /** The viewer's play or pause. */
  toggle(): void;
  dispose(): void;
}

interface ConnectionHints extends EventTarget { readonly saveData?: boolean; readonly effectiveType?: string }

const connection = (): ConnectionHints | undefined => (typeof navigator === 'undefined' ? undefined
  : (navigator as Navigator & { connection?: ConnectionHints }).connection);
const query = (media: string): MediaQueryList | null => (typeof matchMedia === 'function' ? matchMedia(media) : null);

/** Data saving: the Save-Data preference, or a 2g/3g link. Such a visitor gets no video source unless they press play. */
export function dataSaver(): boolean {
  const hints = connection();
  return !!hints?.saveData || /^(?:slow-2g|2g|3g)$/.test(hints?.effectiveType || '');
}

function reducedMotion(): boolean {
  return !!query('(prefers-reduced-motion: reduce)')?.matches;
}

/** Motion that starts by itself is allowed (not reduced motion, not data saving). */
export function autoplayAllowed(): boolean {
  return !reducedMotion() && !dataSaver();
}

const phoneLayout = (): boolean => !!query(MEDIA_POLICY.phoneQuery)?.matches;
const wideLayout = (): boolean => !!query(MEDIA_POLICY.wideQuery)?.matches;

/** The concurrency cap for this layout. */
export function maxPlaying(): number {
  return phoneLayout() ? MEDIA_POLICY.maxPlayingPhone : MEDIA_POLICY.maxPlayingDesktop;
}

// --- source selection -------------------------------------------------------------------------------------------

const AV1 = /av01/i;
const smooth = new Map<string, boolean>();

/** Ask MediaCapabilities whether an AV1 file decodes smoothly here; until it answers, AV1 is skipped for VP9. */
function probe(type: string): void {
  if (!AV1.test(type) || smooth.has(type)) return;
  const capabilities = typeof navigator === 'undefined' ? undefined
    : (navigator as Navigator & { mediaCapabilities?: MediaCapabilities }).mediaCapabilities;
  if (!capabilities?.decodingInfo) {
    smooth.set(type, false);
    return;
  }
  smooth.set(type, false);
  capabilities.decodingInfo({
    type: 'file',
    video: { contentType: type, width: 1920, height: 1080, bitrate: 4_000_000, framerate: 30 },
  }).then((info) => { smooth.set(type, info.supported && info.smooth); }, () => { smooth.set(type, false); });
}

function playable(video: HTMLVideoElement, source: MediaSource): boolean {
  if (typeof video.canPlayType === 'function' && video.canPlayType(source.type) === '') return false;
  return !AV1.test(source.type) || smooth.get(source.type) === true;
}

/** The rung groups in preference order: what may start by itself, then what the viewer's play may reach. */
function rungOrder(manual: boolean): ReadonlyArray<MediaRung | undefined> {
  if (phoneLayout()) return manual ? ['phone', undefined, 'wide'] : ['phone'];
  const wide = wideLayout() && !dataSaver();
  if (manual) return wide ? ['wide', undefined, 'phone'] : [undefined, 'wide', 'phone'];
  return wide ? ['wide', undefined, 'phone'] : [undefined, 'phone'];
}

/** The file this browser plays from a ladder: AV1 → VP9 → H.264 by canPlayType and MediaCapabilities; null if none. */
export function chooseSource(video: HTMLVideoElement, sources: readonly MediaSource[], manual = false,
  failed?: ReadonlySet<string>): MediaSource | null {
  for (const rung of rungOrder(manual)) {
    for (const source of sources) {
      if (source.rung !== rung || failed?.has(source.src)) continue;
      if (playable(video, source)) return source;
    }
  }
  return null;
}

/** The MIME type a file name implies (a ladder written without explicit types). */
export function mediaType(src: string): string {
  return /\.mp4(?:$|\?)/i.test(src) ? 'video/mp4' : 'video/webm';
}

// --- the page's scheduler ---------------------------------------------------------------------------------------

interface Core {
  readonly frame: HTMLElement;
  crowded: boolean;
  sync(): void;
  halt(): void;
}

const players = new Set<Core>();
const playingNow: Core[] = [];
const crowdedOut = new Set<Core>();
const waiting = new Set<Core>();
let downloader: Core | null = null;
let handedOff = false;
let lifecycleInstalled = false;

function claimSlot(core: Core): void {
  if (!playingNow.includes(core)) playingNow.push(core);
  while (playingNow.length > maxPlaying()) { // (the cap shrinks when a desktop window narrows to a phone layout)
    const oldest = playingNow.shift();
    if (!oldest) break;
    oldest.crowded = true;
    crowdedOut.add(oldest);
    oldest.sync();
  }
}

function vacateSlot(core: Core): void {
  const at = playingNow.indexOf(core);
  if (at < 0) return;
  playingNow.splice(at, 1);
  for (const queued of [...crowdedOut]) {
    if (playingNow.length >= maxPlaying()) break;
    crowdedOut.delete(queued);
    queued.crowded = false;
    queued.sync();
  }
}

const centreDistance = (core: Core): number => {
  const rect = core.frame.getBoundingClientRect?.();
  const height = typeof innerHeight === 'number' ? innerHeight : 0;
  return rect ? Math.abs(rect.top + rect.height / 2 - height / 2) : 0;
};

/** May this player start a transfer now? One at a time; a refused player queues and is called back in turn. */
function requestTransfer(core: Core): boolean {
  if (handedOff) return false;
  if (downloader === core || !downloader) {
    downloader = core;
    waiting.delete(core);
    return true;
  }
  waiting.add(core);
  return false;
}

/** The transfer ended (buffered enough, stalled, failed or released): the queued frame nearest the centre goes next. */
function endTransfer(core: Core): void {
  waiting.delete(core);
  if (downloader !== core) return;
  downloader = null;
  const next = [...waiting].sort((a, b) => centreDistance(a) - centreDistance(b))[0];
  if (next) next.sync();
}

/** A video transfer is in flight on this page (the Play hand-off prefetches nothing while one is). */
export function mediaDownloading(): boolean {
  return downloader !== null;
}

// What the hand-off removed, put back if the page returns from the back-forward cache.
const stashed = new Map<Element, { src: string | null; srcset: string | null }>();
const stash = (element: Element): void => {
  stashed.set(element, { src: element.getAttribute('src'), srcset: element.getAttribute('srcset') });
  element.removeAttribute('srcset');
  element.removeAttribute('src');
};

/**
 * The landing's Play hand-off (SPEC 8.3): stop every player, remove every video source and call load() (which cancels
 * the transfer), stop images that are still loading and drop media prefetches, all before the navigation starts, so
 * the game's boot gets the whole pipe. A page restored from the back-forward cache gets its media back.
 */
export function abortPageMedia(root: ParentNode = document): number {
  handedOff = true;
  let stopped = 0;
  for (const core of [...players]) core.halt();
  for (const video of root.querySelectorAll('video')) {
    const sources = [...video.querySelectorAll('source')].filter((source) => source.hasAttribute('src'));
    if (!video.hasAttribute('src') && !sources.length) continue;
    video.pause();
    if (video.hasAttribute('src')) stash(video);
    for (const source of sources) stash(source);
    video.load();
    stopped++;
  }
  for (const image of root.querySelectorAll('img')) {
    if (image.complete || !(image.getAttribute('src') || image.getAttribute('srcset'))) continue;
    stash(image);
    stopped++;
  }
  for (const link of root.querySelectorAll('link[data-cot-media-prefetch]')) link.remove();
  if (typeof dispatchEvent === 'function' && typeof Event === 'function') dispatchEvent(new Event('cot:media-handoff'));
  return stopped;
}

/** Prefetch the game's entry chunk (the Play button's hover or focus): never while a video downloads or data is saved. */
export function prefetchGameEntry(href: string | null | undefined): boolean {
  if (!href || handedOff || downloader || dataSaver() || typeof document === 'undefined') return false;
  if ([...document.querySelectorAll('link[rel="prefetch"]')].some((link) => link.getAttribute('href') === href)) return true;
  const link = document.createElement('link');
  link.setAttribute('rel', 'prefetch');
  link.setAttribute('href', href);
  link.setAttribute('data-cot-game-entry', '');
  document.head.append(link);
  return true;
}

function installLifecycle(): void {
  if (lifecycleInstalled || typeof addEventListener !== 'function') return;
  lifecycleInstalled = true;
  const resync = (): void => { for (const core of [...players]) core.sync(); };
  addEventListener('pageshow', (event) => {
    if (!(event as PageTransitionEvent).persisted || !handedOff) return;
    handedOff = false;
    for (const [element, { src, srcset }] of stashed) {
      if (srcset) element.setAttribute('srcset', srcset);
      if (src) element.setAttribute('src', src);
      const video = element.closest('video');
      if (video && element.localName !== 'img') video.load();
    }
    stashed.clear();
    resync();
  });
  connection()?.addEventListener?.('change', resync);
  for (const media of [MEDIA_POLICY.phoneQuery, MEDIA_POLICY.wideQuery, '(prefers-reduced-motion: reduce)']) {
    query(media)?.addEventListener?.('change', resync);
  }
}

// --- one player -------------------------------------------------------------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg';
const MEDIA_PLAY_ICON = 'M4.5 2.5v11l9-5.5z';
const MEDIA_PAUSE_ICON = 'M4 2.5h3v11H4zM9 2.5h3v11H9z';
const TRANSFER_DONE = ['canplaythrough', 'suspend', 'stalled'] as const;

/** A frame's visible share: of the viewport for a frame taller than it, else of the frame. */
function visibleShare(entry: IntersectionObserverEntry): number {
  if (!entry.isIntersecting) return 0;
  const box = entry.boundingClientRect?.height;
  const root = entry.rootBounds?.height;
  const seen = entry.intersectionRect?.height;
  if (box && root && seen !== undefined) return Math.min(1, seen / Math.min(box, root));
  return entry.intersectionRatio;
}

/** A muted, inline, looping player on `video` under the shared policy. */
export function createMediaPlayer(video: HTMLVideoElement, options: MediaPlayerOptions): MediaPlayer {
  const mode = options.mode ?? 'loop';
  const frame = options.frame ?? video;
  const gate = options.gate ?? (() => true);
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  if (mode !== 'click') video.loop = true;
  video.preload = 'none';
  video.disablePictureInPicture = true;

  let control: HTMLButtonElement | null = null;
  let glyph: SVGPathElement | null = null;
  if (options.control !== 'none') {
    control = document.createElement('button');
    control.type = 'button';
    control.className = options.controlClass ?? 'cot-media-toggle';
    control.hidden = true;
    const icon = document.createElementNS(SVG_NS, 'svg');
    icon.setAttribute('viewBox', '0 0 16 16');
    icon.setAttribute('aria-hidden', 'true');
    glyph = document.createElementNS(SVG_NS, 'path') as SVGPathElement;
    glyph.setAttribute('fill', 'currentColor');
    icon.append(glyph);
    control.append(icon);
    const parent = options.controlParent === undefined
      ? (frame === video ? video.parentElement : frame) : options.controlParent;
    parent?.append(control);
  }

  let item: MediaItem | null = null;
  let near = typeof IntersectionObserver !== 'function';
  let visible = near;
  let hovered = false;
  let hoverTimer: ReturnType<typeof setTimeout> | 0 = 0;
  let wanted = false; // the viewer pressed play: survives reduced motion and data saving, ends with the item
  let held = false; // the viewer pressed pause: holds every later item too
  let source = '';
  const failed = new Set<string>();
  let releaseTimer: ReturnType<typeof setTimeout> | 0 = 0;
  let expectPlaying = false; // what the player last asked of the element (a native control's play or pause is the viewer's)

  const manual = (): boolean => !autoplayAllowed();
  const clearRelease = (): void => {
    if (releaseTimer) clearTimeout(releaseTimer);
    releaseTimer = 0;
  };
  const release = (): void => {
    clearRelease();
    endTransfer(core);
    if (!source) return;
    source = '';
    expectPlaying = false;
    video.pause();
    video.removeAttribute('src');
    video.load();
  };

  const core: Core = {
    frame,
    crowded: false,
    sync: () => sync(),
    halt: () => {
      vacateSlot(core);
      crowdedOut.delete(core);
      core.crowded = false;
      release();
      render(false);
    },
  };

  /** What the player would play now: what may start by itself, else (for the viewer) anything playable. */
  const pick = (byViewer: boolean): MediaSource | null => (item
    ? chooseSource(video, item.sources, byViewer || manual(), failed) : null);
  const onScreen = (): boolean => visible && !(typeof document !== 'undefined' && document.hidden);

  const shouldPlay = (): boolean => {
    if (!item || handedOff || !onScreen() || core.crowded) return false;
    if (wanted) return !!pick(true);
    if (held || manual() || mode === 'click' || (mode === 'hover' && !hovered) || !gate()) return false;
    return !!pick(false);
  };

  const render = (playing: boolean): void => {
    if (!control || !glyph) return;
    const reachable = !!item && !!pick(true);
    const seconds = item?.seconds ?? (Number.isFinite(video.duration) && video.duration > 0 ? video.duration : Infinity);
    // auto: a pause disc on a playing loop over five seconds; a play disc whenever the loop waits for the viewer
    // (reduced motion, data saving, their own pause, a slot another loop took); nothing while it is about to start
    // by itself (off screen, or its transfer queued), so no play disc flashes ahead of every loop
    const waitsForViewer = manual() || held || wanted || core.crowded || mode !== 'loop';
    const show = options.control === 'always' ? reachable
      : reachable && (playing ? seconds > MEDIA_POLICY.pauseControlSeconds : waitsForViewer);
    control.hidden = !show;
    const label = options.label(playing);
    control.setAttribute('aria-label', label);
    control.title = label;
    control.dataset.state = playing ? 'playing' : 'paused';
    glyph.setAttribute('d', playing ? MEDIA_PAUSE_ICON : MEDIA_PLAY_ICON);
  };

  const sync = (): void => {
    if (!item) {
      vacateSlot(core);
      crowdedOut.delete(core);
      core.crowded = false;
      release();
      render(false);
      return;
    }
    if (near && item.poster && video.getAttribute('poster') !== item.poster) video.poster = item.poster;
    const play = shouldPlay();
    if (play) claimSlot(core);
    else vacateSlot(core);
    const playingNowToo = play && !core.crowded;
    const warmNow = !playingNowToo && !!options.warm && near && !handedOff && !held && !manual() && mode === 'loop' && gate();
    const target = playingNowToo || warmNow ? pick(wanted) : null;
    if (target) {
      clearRelease();
      if (source !== target.src) {
        if (!wanted && !requestTransfer(core)) { // another frame is downloading: wait for its turn (the poster stays)
          if (source) {
            expectPlaying = false;
            video.pause();
          }
          render(false);
          return;
        }
        if (wanted && downloader !== core) waiting.delete(core); // the viewer's play never waits for the queue
        source = target.src;
        video.preload = 'auto';
        video.src = source;
      }
      if (playingNowToo) {
        expectPlaying = true;
        video.play().catch((error: unknown) => {
          // A browser that refuses even a muted start keeps the poster until the viewer presses play.
          if (error instanceof Error && error.name === 'NotAllowedError' && source === target.src) {
            wanted = false;
            held = true;
            sync();
          }
        });
      } else {
        expectPlaying = false;
        video.pause();
      }
    } else {
      waiting.delete(core);
      const named = options.native && near && !handedOff ? pick(true) : null;
      if (named && source !== named.src) { // the viewer's own control can start it; nothing transfers before that
        clearRelease();
        source = named.src;
        video.preload = 'none';
        video.src = source;
      } else if (source) {
        expectPlaying = false;
        video.pause();
        if (!named && !releaseTimer) releaseTimer = setTimeout(release, MEDIA_POLICY.releaseMs);
      }
    }
    render(playingNowToo);
  };

  const toggle = (): void => {
    if (!item) return;
    const play = !shouldPlay();
    wanted = play;
    held = !play;
    if (play) {
      crowdedOut.delete(core);
      core.crowded = false;
      if (!onScreen()) visible = true; // the viewer pressed play on a frame the observer has not reported yet
    }
    sync();
  };

  const onControl = (event: Event): void => {
    event.stopPropagation(); // a surface's own click on the frame (the Garage's shot) stays the surface's
    toggle();
  };
  control?.addEventListener('click', onControl);
  for (const type of TRANSFER_DONE) video.addEventListener(type, () => endTransfer(core));
  // A file that fails leaves the poster; the ladder's next file is tried, and a ladder with none left hides the control.
  video.addEventListener('error', () => {
    if (!source || !video.error) return;
    failed.add(source);
    release();
    sync();
  });
  video.addEventListener('loadedmetadata', () => render(!video.paused));
  if (options.native) {
    video.addEventListener('play', () => {
      if (expectPlaying || !item) return;
      expectPlaying = true;
      wanted = true;
      held = false;
      crowdedOut.delete(core);
      core.crowded = false;
      visible = true;
      sync();
    });
    video.addEventListener('pause', () => {
      if (!expectPlaying || video.ended || !item) return;
      expectPlaying = false;
      wanted = false;
      held = true;
      sync();
    });
  }

  const observers: IntersectionObserver[] = [];
  if (typeof IntersectionObserver === 'function') {
    const nearObserver = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) near = entry.isIntersecting;
      sync();
    }, { rootMargin: MEDIA_POLICY.nearMargin, threshold: 0 });
    const viewObserver = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) {
        const share = visibleShare(entry);
        if (share >= MEDIA_POLICY.playRatio) visible = true;
        else if (share < MEDIA_POLICY.pauseRatio) visible = false;
      }
      sync();
    }, { threshold: [0, MEDIA_POLICY.pauseRatio, 0.25, MEDIA_POLICY.playRatio, 0.75, 1] });
    nearObserver.observe(frame);
    viewObserver.observe(frame);
    observers.push(nearObserver, viewObserver);
  }

  const hoverTarget = options.hoverTarget ?? frame;
  const hoverOn = (event: Event): void => {
    if ((event as PointerEvent).pointerType === 'touch') return;
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => { hoverTimer = 0; hovered = true; sync(); }, MEDIA_POLICY.hoverDelayMs);
  };
  const hoverOff = (): void => {
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = 0;
    if (!hovered) return;
    hovered = false;
    sync();
  };
  if (mode === 'hover') {
    hoverTarget.addEventListener('pointerenter', hoverOn);
    hoverTarget.addEventListener('focusin', hoverOn);
    hoverTarget.addEventListener('pointerleave', hoverOff);
    hoverTarget.addEventListener('focusout', hoverOff);
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', sync);
  const motion = query('(prefers-reduced-motion: reduce)');
  motion?.addEventListener?.('change', sync);
  players.add(core);
  installLifecycle();

  return {
    video,
    control,
    show(next) {
      const sameFiles = !!next && !!item && next.sources.length === item.sources.length
        && next.sources.every((entry, index) => entry.src === item?.sources[index]?.src);
      if (!sameFiles) {
        release();
        wanted = false;
        failed.clear();
        for (const entry of next?.sources ?? []) probe(entry.type);
      }
      // The poster follows the item as soon as the frame is near the viewport (sync), never an earlier item's.
      if (next?.poster !== item?.poster) video.removeAttribute('poster');
      item = next;
      sync();
    },
    sync,
    toggle,
    dispose() {
      for (const observer of observers) observer.disconnect();
      if (hoverTimer) clearTimeout(hoverTimer);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', sync);
      motion?.removeEventListener?.('change', sync);
      hoverTarget.removeEventListener('pointerenter', hoverOn);
      hoverTarget.removeEventListener('focusin', hoverOn);
      hoverTarget.removeEventListener('pointerleave', hoverOff);
      hoverTarget.removeEventListener('focusout', hoverOff);
      item = null;
      vacateSlot(core);
      crowdedOut.delete(core);
      release();
      players.delete(core);
      control?.remove();
    },
  };
}

// --- declarative players (the public pages' markup) -------------------------------------------------------------

const RUNGS = new Set<string>(['phone', 'wide']);

/**
 * A page video's ladder from its markup. The current form lists one `<source data-src type [data-rung]>` per file in
 * ladder order; the earlier form (site/home.html's loops) named one file with `data-fallback-src` (its H.264 twin) and
 * `data-mobile-src` (the phone rung).
 */
export function ladderFromMarkup(video: HTMLVideoElement): MediaSource[] {
  const ladder: MediaSource[] = [];
  for (const element of video.querySelectorAll<HTMLSourceElement>('source[data-src]')) {
    const data = element.dataset;
    if (!data.src) continue;
    const rung = RUNGS.has(data.rung || '') ? data.rung as MediaRung : undefined;
    ladder.push({ src: data.src, type: element.getAttribute('type') || data.type || mediaType(data.src), ...(rung ? { rung } : {}) });
    if (data.fallbackSrc) ladder.push({ src: data.fallbackSrc, type: data.fallbackType || mediaType(data.fallbackSrc) });
    if (data.mobileSrc) ladder.push({ src: data.mobileSrc, type: data.mobileType || mediaType(data.mobileSrc), rung: 'phone' });
  }
  return ladder;
}

/** A page player's control label in the page's language, for the state it would change to; it names the video. */
export type MediaLabels = (playing: boolean, video: HTMLVideoElement) => string;

/**
 * Mount the page's players: `video[data-media-player]` (`loop` by default, `hover` or `click`) and the earlier
 * `video[data-autoplay-video]` loops. Each keeps its poster in `data-poster` until it is near the viewport.
 */
export function mountMediaPlayers(videos: Iterable<HTMLVideoElement>, labels: MediaLabels): MediaPlayer[] {
  const mounted: MediaPlayer[] = [];
  for (const video of videos) {
    if (video.dataset.mediaMounted) continue;
    video.dataset.mediaMounted = '';
    const requested = video.dataset.mediaPlayer;
    const mode: MediaMode = requested === 'hover' || requested === 'click' ? requested : 'loop';
    const seconds = Number(video.dataset.duration);
    const player = createMediaPlayer(video, {
      mode,
      warm: mode === 'loop',
      label: (playing) => labels(playing, video),
      controlClass: video.dataset.controlClass || 'cot-media-toggle',
    });
    player.show({
      sources: ladderFromMarkup(video),
      ...(video.dataset.poster ? { poster: video.dataset.poster } : {}),
      ...(seconds > 0 ? { seconds } : {}),
    });
    video.addEventListener('play', () => video.classList.add('is-playing'));
    video.addEventListener('pause', () => video.classList.remove('is-playing'));
    // A frame is on screen from its first played frame until its source is released (a page poster shows through
    // until then: the topic headers draw their own).
    video.addEventListener('playing', () => video.classList.add('has-frame'));
    video.addEventListener('emptied', () => video.classList.remove('has-frame'));
    mounted.push(player);
  }
  return mounted;
}
