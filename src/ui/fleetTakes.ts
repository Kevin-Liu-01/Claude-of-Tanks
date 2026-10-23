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
 * nothing, never another vehicle's take. The player is the site's shared one (src/presentation/mediaPlayer.ts, brand-ui
 * SPEC 8.3): no video source until its frame is on screen and motion is allowed; reduced motion and data saving keep
 * the poster until the viewer presses play; an off-screen or hidden frame pauses; a paused source is released after ten
 * seconds so a scroll reversal does not restart the transfer.
 */
import { getLocale, t, type SupportedLocale } from './i18n.ts';
import { hrefForLocale } from './localeRouting.ts';
import { sceneLinkPath } from '../game/studioSceneLink.ts';
import { resolveTankId } from '../vehicles/tankIdAliases.ts';
import { createMediaPlayer, mediaType } from '../presentation/mediaPlayer.ts';

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
  // The index names vehicles under the tank id schema it was written in (`tankIdSchema`, missing = 1): read every key
  // in today's spelling, so a renamed vehicle keeps its take and a swapped id never shows another vehicle's (SSOT 2.19).
  const schema = (json as Record<string, unknown>).tankIdSchema;
  const takes = new Map<string, FleetTake>();
  for (const [written, raw] of Object.entries(vehicles)) {
    if (!written || !raw || typeof raw !== 'object') continue;
    const vehicle = resolveTankId(written, schema);
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
 * play/pause control, under the site's one playback policy (src/presentation/mediaPlayer.ts: a source only on screen,
 * one transfer at a time, two playing at most, release after ten seconds, reduced motion and data saving wait for the
 * viewer). `autoplay` is a surface's further gate on starting by itself; the viewer's play bypasses it.
 */
export function createFleetTakePlayer(frame: HTMLElement, autoplay: () => boolean = () => true): FleetTakePlayer {
  const video = document.createElement('video');
  video.className = 'fleet-take-video';
  video.hidden = true;
  video.tabIndex = -1;
  video.setAttribute('aria-hidden', 'true');
  frame.append(video);
  let take: FleetTake | null = null;
  const player = createMediaPlayer(video, {
    frame,
    controlParent: frame,
    controlClass: 'fleet-take-toggle',
    control: 'always',
    gate: autoplay,
    label: (playing) => (take ? t(playing ? 'media.fleet.pause' : 'media.fleet.play', { title: fleetTakeText(take, 'short') }) : ''),
  });
  return {
    show(next) {
      take = next;
      video.hidden = !next;
      // A take is one silent loop and its poster (the index names no other rung yet); the player picks nothing a
      // browser cannot play, and leaves the poster.
      player.show(next ? { sources: [{ src: next.loop, type: mediaType(next.loop) }], poster: next.poster } : null);
    },
    sync: player.sync,
    toggle: player.toggle,
    dispose() {
      take = null;
      player.dispose();
      video.remove();
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
