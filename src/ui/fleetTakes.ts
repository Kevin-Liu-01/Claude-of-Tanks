/**
 * fleetTakes.ts — every production vehicle's own take, wherever the game or site presents one vehicle.
 *
 * Owner 2026-10-12: "make a special video for all tanks ... on a wider variety of maps and use that everywhere". The
 * media lane renders one silent, seamlessly looping 6.6 s take per vehicle (a 960×540 VP9 webm and a 960×540 jpg
 * poster) and indexes them by vehicle spec id in FLEET_TAKES_INDEX. The Tank Gallery's dossier (src/gallery/inAction.ts),
 * the field manual's fleet reference (src/docs/reference.ts) and the Garage's battle gallery (garage.ts) show the
 * selected vehicle's take through this module; the Studio Director reaches the same takes through its scenes index
 * (studioProductionPanel.ts).
 *
 * Nothing here runs at import, and every surface reaches this module through import() at use. The index is fetched
 * once per document, at the first lookup; a missing index, a malformed entry or a vehicle the index lacks shows
 * nothing. The player names no video source until its frame is on screen and motion is allowed: reduced motion and
 * data saving keep the poster until the viewer presses play, an off-screen or hidden frame pauses, and a paused source
 * is released after a short grace so a scroll reversal does not restart the transfer.
 */
import { getLocale, t, type SupportedLocale } from './i18n.ts';
import { hrefForLocale } from './localeRouting.ts';
import { sceneLinkPath } from '../game/studioSceneLink.ts';

/** The media lane's per-vehicle index, beside the loops and posters it names. */
export const FLEET_TAKES_INDEX = '/media/site50-r14/fleet/index.json';

interface TakeText { readonly en: string; readonly zh: string }

export interface FleetTake {
  readonly vehicle: string;
  readonly take: string;
  readonly map: string;
  readonly title: TakeText;
  readonly short: TakeText;
  readonly loop: string;
  readonly poster: string;
  readonly scene: string;
}

export type FleetTakeIndex = ReadonlyMap<string, FleetTake>;

const NO_TAKES: FleetTakeIndex = new Map();

// A file on this site, never another origin (the rule studioSceneLink.ts applies to scenes).
function sitePath(raw: unknown, extension: RegExp): string | null {
  if (typeof raw !== 'string') return null;
  const path = raw.trim();
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || path.includes('..')) return null;
  return /^\/[\w./-]+$/.test(path) && extension.test(path) ? path : null;
}

function takeText(raw: unknown): TakeText | null {
  if (!raw || typeof raw !== 'object') return null;
  const { en, zh } = raw as Record<string, unknown>;
  if (typeof en !== 'string' || !en.trim()) return null;
  return { en, zh: typeof zh === 'string' && zh.trim() ? zh : en };
}

function parseFleetTakes(json: unknown): FleetTakeIndex {
  const vehicles = json && typeof json === 'object' ? (json as Record<string, unknown>).vehicles : null;
  if (!vehicles || typeof vehicles !== 'object' || Array.isArray(vehicles)) return NO_TAKES;
  const takes = new Map<string, FleetTake>();
  for (const [vehicle, raw] of Object.entries(vehicles)) {
    if (!vehicle || !raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;
    const title = takeText(entry.title);
    const loop = sitePath(entry.loop, /\.(?:webm|mp4)$/);
    const poster = sitePath(entry.poster, /\.(?:jpe?g|webp|png)$/);
    const scene = sceneLinkPath(typeof entry.scene === 'string' ? entry.scene : null);
    if (!title || !loop || !poster || !scene || typeof entry.take !== 'string' || !entry.take) continue;
    takes.set(vehicle, {
      vehicle, take: entry.take, map: typeof entry.map === 'string' ? entry.map : '',
      title, short: takeText(entry.short) ?? title, loop, poster, scene,
    });
  }
  return takes;
}

let request: Promise<FleetTakeIndex> | null = null;

/** The fleet's takes by vehicle spec id: fetched once, at the first call; empty while the index is missing or invalid. */
export function loadFleetTakes(): Promise<FleetTakeIndex> {
  if (typeof fetch !== 'function') return Promise.resolve(NO_TAKES);
  request ??= fetch(FLEET_TAKES_INDEX).then(
    (response) => (response.ok ? response.json().then(parseFleetTakes, () => NO_TAKES) : NO_TAKES),
    () => { request = null; return NO_TAKES; }, // offline: a later look tries again
  );
  return request;
}

/** A take's title or short title in the page's language (English where the index has no Chinese). */
export function fleetTakeText(take: FleetTake, field: 'title' | 'short', locale: SupportedLocale = getLocale()): string {
  return locale === 'zh-CN' ? take[field].zh : take[field].en;
}

/** The take's scene opened in the Studio as a scene link (src/game/studioSceneLink.ts), in the page's language. */
export function fleetTakeStudioHref(take: FleetTake, locale: SupportedLocale = getLocale()): string {
  return hrefForLocale(`/studio?scene=${take.scene}`, locale);
}

interface ConnectionHints { readonly saveData?: boolean; readonly effectiveType?: string }

// Reduced motion, data saving and very slow links wait for the viewer's play (as src/presentation/publicPages.ts does).
function manualPlayback(motion: MediaQueryList | null): boolean {
  const connection = typeof navigator === 'undefined' ? undefined
    : (navigator as Navigator & { connection?: ConnectionHints }).connection;
  return !!motion?.matches || !!connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || '');
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const PLAY_ICON = 'M4.5 2.5v11l9-5.5z';
const PAUSE_ICON = 'M4 2.5h3v11H4zM9 2.5h3v11H9z';
// A paused source survives a scroll reversal this long, then its decoder is freed (sooner in a hidden tab).
const RELEASE_MS = 15000;
const HIDDEN_RELEASE_MS = 5000;
// Playback needs a quarter of the frame on screen; the poster loads once the frame is within a quarter screen of it.
const VISIBLE_RATIO = 0.25;

export interface FleetTakePlayer {
  /** Show this take's poster, and its loop once the frame is visible and motion is allowed; null empties the frame. */
  show(take: FleetTake | null): void;
  /** Re-check the surface's own autoplay gate (the Garage calls this once it is playable). */
  sync(): void;
  /** The viewer's play or pause (the frame's control, or a surface's own click). */
  toggle(): void;
  dispose(): void;
}

/**
 * A muted, inline, looping player inside `frame`: a decorative video (the surface's caption names the take) and one
 * play/pause control. `autoplay` is a surface's further gate on starting by itself; the viewer's play bypasses it.
 */
export function createFleetTakePlayer(frame: HTMLElement, autoplay: () => boolean = () => true): FleetTakePlayer {
  const video = document.createElement('video');
  video.className = 'fleet-take-video';
  // The muted property, not only the attribute, lets the browser start a clip without a gesture.
  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'none';
  video.disablePictureInPicture = true;
  video.hidden = true;
  video.tabIndex = -1;
  video.setAttribute('aria-hidden', 'true');
  const control = document.createElement('button');
  control.type = 'button';
  control.className = 'fleet-take-toggle';
  control.hidden = true;
  const icon = document.createElementNS(SVG_NS, 'svg');
  icon.setAttribute('viewBox', '0 0 16 16');
  icon.setAttribute('aria-hidden', 'true');
  const glyph = document.createElementNS(SVG_NS, 'path');
  glyph.setAttribute('fill', 'currentColor');
  icon.append(glyph);
  control.append(icon);
  frame.append(video, control);

  const motion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  let take: FleetTake | null = null;
  let near = typeof IntersectionObserver !== 'function';
  let visible = near;
  let wanted = false; // the viewer pressed play: survives reduced motion, ends with the take
  let held = false; // the viewer pressed pause: holds every later take too
  let source = '';
  let failed = '';
  let releaseTimer: ReturnType<typeof setTimeout> | 0 = 0;

  const release = (): void => {
    if (releaseTimer) clearTimeout(releaseTimer);
    releaseTimer = 0;
    if (!source) return;
    source = '';
    video.pause();
    video.removeAttribute('src');
    video.load();
  };
  const playing = (): boolean => !!take && take.loop !== failed && visible && !document.hidden
    && (wanted || (!held && !manualPlayback(motion) && autoplay()));

  const sync = (): void => {
    if (!take) {
      release();
      control.hidden = true;
      return;
    }
    if (near && video.getAttribute('poster') !== take.poster) video.poster = take.poster;
    const play = playing();
    if (play) {
      if (releaseTimer) clearTimeout(releaseTimer);
      releaseTimer = 0;
      if (source !== take.loop) {
        source = take.loop;
        video.src = source;
      }
      video.play().catch((error: unknown) => {
        // A browser that refuses even a muted start keeps the poster until the viewer presses play.
        if (error instanceof Error && error.name === 'NotAllowedError' && take?.loop === source) {
          wanted = false;
          held = true;
          sync();
        }
      });
    } else if (source) {
      video.pause();
      if (!releaseTimer) releaseTimer = setTimeout(release, document.hidden ? HIDDEN_RELEASE_MS : RELEASE_MS);
    }
    control.hidden = take.loop === failed;
    const label = t(play ? 'media.fleet.pause' : 'media.fleet.play', { title: fleetTakeText(take, 'short') });
    control.setAttribute('aria-label', label);
    control.title = label;
    control.dataset.state = play ? 'playing' : 'paused';
    glyph.setAttribute('d', play ? PAUSE_ICON : PLAY_ICON);
  };

  const toggle = (): void => {
    if (!take) return;
    const play = !playing();
    wanted = play;
    held = !play;
    sync();
  };
  control.addEventListener('click', (event) => {
    event.stopPropagation(); // the frame's own click (the Garage's shot) is the surface's
    toggle();
  });
  // A loop that fails to load leaves the poster and no control; another take still tries its own.
  video.addEventListener('error', () => {
    if (!source || !video.error) return;
    failed = source;
    release();
    sync();
  });

  const watch = (rootMargin: string, update: (entry: IntersectionObserverEntry) => void): IntersectionObserver | null => {
    if (typeof IntersectionObserver !== 'function') return null;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) update(entry);
      sync();
    }, { rootMargin, threshold: [0, VISIBLE_RATIO, 0.75] });
    observer.observe(frame);
    return observer;
  };
  const warmObserver = watch('25% 0px', (entry) => { near = entry.isIntersecting; });
  const viewObserver = watch('0px', (entry) => {
    visible = entry.isIntersecting && entry.intersectionRatio >= VISIBLE_RATIO;
  });
  document.addEventListener('visibilitychange', sync);
  motion?.addEventListener?.('change', sync);

  return {
    show(next) {
      if (next?.loop !== take?.loop) {
        release();
        wanted = false;
      }
      // The poster follows the take as soon as the frame is near the viewport (sync), never an earlier take's.
      if (next?.poster !== take?.poster) video.removeAttribute('poster');
      take = next;
      video.hidden = !next;
      sync();
    },
    sync,
    toggle,
    dispose() {
      warmObserver?.disconnect();
      viewObserver?.disconnect();
      document.removeEventListener('visibilitychange', sync);
      motion?.removeEventListener?.('change', sync);
      take = null;
      release();
      video.remove();
      control.remove();
    },
  };
}

interface FleetTakeFigure {
  readonly root: HTMLElement;
  show(take: FleetTake | null): void;
}

/** A page's figure for one take: the frame (poster, loop and control), the take's title and its Studio link. */
export function createFleetTakeFigure(studioLabel: string): FleetTakeFigure {
  const root = document.createElement('figure');
  root.className = 'fleet-take';
  const frame = document.createElement('div');
  frame.className = 'fleet-take-frame';
  const caption = document.createElement('figcaption');
  const title = document.createElement('span');
  title.className = 'fleet-take-title';
  const studio = document.createElement('a');
  studio.className = 'fleet-take-studio';
  studio.textContent = studioLabel;
  caption.append(title, studio);
  root.append(frame, caption);
  const player = createFleetTakePlayer(frame);
  return {
    root,
    show(take) {
      player.show(take);
      title.textContent = take ? fleetTakeText(take, 'title') : '';
      if (take) studio.href = fleetTakeStudioHref(take);
      else studio.removeAttribute('href');
    },
  };
}
