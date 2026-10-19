// Tank hero cards at runtime (a lazy chunk: each surface imports it with its stylesheet, import() of both).
// Each card is the owner's reference composition built from layers: a CSS ground,
// the nation's waving-cloth flag layer under the policy feather (CSS mask-image),
// the vehicle's transparent hero render placed by the policy's placeTank rule in
// CSS container units, then the name and the tier chip the Garage already drew.
// Layers are offline renders (tools/genHeroCards.mjs + hero-cards-compose.mjs,
// changed-only) under public/icons/hero/, named by hero-cards.json. Images load
// lazily (a card hidden by the nation filter fetches nothing) and decode async;
// no WebGL and no canvas reads happen here.
// First-party: Kevin B. Liu (NOTICE.md).

import {
  HERO_GUN_SIDE, HERO_MANIFEST_FILE, HERO_POLICY_VERSION, HERO_PUBLIC_DIR, heroFlagFiles, heroFlagMaskCss, heroTankFiles,
  type HeroFacing,
} from './heroCardPolicy.ts';

interface HeroLayerRow {
  readonly sha: readonly string[];
}

interface HeroTankRow extends HeroLayerRow {
  readonly flag: string;
  /** [cx, cw, ch, cb, fx0, fx1]: the dense core and the whole silhouette, as fractions of the layer width. */
  readonly b: readonly number[];
  /** [bow side, gun side], measured through the card lens (a turretless gun stays on the bow's side). */
  readonly face?: readonly HeroFacing[];
}

export interface HeroManifest {
  readonly policyVersion: number;
  readonly facing: HeroFacing;
  readonly flags: Readonly<Record<string, HeroLayerRow>>;
  readonly tanks: Readonly<Record<string, HeroTankRow>>;
}

const BASE = `/${HERO_PUBLIC_DIR}/`;
let manifestRequest: Promise<HeroManifest | null> | null = null;

function isManifest(value: unknown): value is HeroManifest {
  const candidate = value as Partial<HeroManifest> | null;
  return !!candidate && typeof candidate === 'object' && candidate.policyVersion === HERO_POLICY_VERSION
    && !!candidate.tanks && typeof candidate.tanks === 'object' && !!candidate.flags && typeof candidate.flags === 'object';
}

/** The hero manifest, fetched once per page; null when it is missing, stale or unreadable (callers fall back). */
export function loadHeroManifest(): Promise<HeroManifest | null> {
  manifestRequest ||= fetch(`${BASE}${HERO_MANIFEST_FILE}`)
    .then((response) => (response.ok ? response.json() : null))
    .then((value: unknown) => (isManifest(value) ? value : null))
    .catch(() => null);
  return manifestRequest;
}

/** A layer file's URL; the content hash keeps a re-rendered layer from reading an hour-old cached copy. */
const layerUrl = (file: string, hash: string | undefined): string => `${BASE}${file}${hash ? `?v=${hash.slice(0, 8)}` : ''}`;

/**
 * A lazy <picture>: AVIF at both rungs (the browser picks by `sizes`), the 480 WebP as the fallback.
 * The returned <img> carries the class; the picture element itself takes no box of its own.
 */
function layerPicture(files: readonly string[], row: HeroLayerRow, className: string, sizes: string, priority: boolean): HTMLPictureElement {
  const picture = document.createElement('picture');
  const source = document.createElement('source');
  source.type = 'image/avif';
  source.srcset = `${layerUrl(files[0], row.sha[0])} 480w, ${layerUrl(files[1], row.sha[1])} 960w`;
  source.sizes = sizes;
  const img = document.createElement('img');
  img.className = className;
  img.src = layerUrl(files[2], row.sha[2]);
  img.width = 480;
  img.height = 300;
  img.alt = '';
  img.decoding = 'async';
  img.loading = 'lazy';
  img.draggable = false;
  img.setAttribute('fetchpriority', priority ? 'high' : 'low');
  img.setAttribute('aria-hidden', 'true');
  picture.append(source, img);
  return picture;
}

export interface HeroCardOptions {
  /** `sizes` for the tank layer (its rendered CSS width): the browser picks the 480 or 960 rung. */
  readonly tankSizes: string;
  /** `sizes` for the flag layer. */
  readonly flagSizes: string;
  /** The selected card loads first. */
  readonly priority?: boolean;
  /** A tank layer that fails to load (a missing or blocked file): the caller restores its own portrait. */
  readonly onError?: () => void;
}

/**
 * Give one card its flag and tank layers. The card supplies the box, the ground, the name and the
 * tier chip (its CSS holds the policy's per-kind shares); this inserts the two pictures under them.
 * Returns false when the manifest has no row for the id (the caller keeps its fallback portrait).
 */
export function decorateHeroCard(card: HTMLElement, specId: string, manifest: HeroManifest, options: HeroCardOptions): boolean {
  const row = manifest.tanks[specId];
  const flagRow = row ? manifest.flags[row.flag] : null;
  if (!row || !flagRow || row.b.length !== 6) return false;
  const [cx, cw, ch, cb, fx0, fx1] = row.b;
  const flag = layerPicture(heroFlagFiles(row.flag), flagRow, 'hc-flag', options.flagSizes, !!options.priority);
  const tank = layerPicture(heroTankFiles(specId), row, 'hc-tank', options.tankSizes, !!options.priority);
  const tankImg = tank.querySelector('img');
  if (tankImg) {
    // placeTank's per-vehicle inputs; the per-kind shares and the name band come from the card's CSS, whose
    // core centre is written for the policy's gun side: a gun on the other side (a turretless mount keeps it
    // on the bow's side) mirrors it (--hc-gs:-1), leaving the open side to the gun.
    const mirrored = (row.face?.[1] ?? HERO_GUN_SIDE) !== HERO_GUN_SIDE;
    tankImg.style.cssText = `--hc-cx:${cx};--hc-cw:${cw};--hc-ch:${ch};--hc-cb:${cb};--hc-fx0:${fx0};--hc-fx1:${fx1};--hc-fw:${Number((fx1 - fx0).toFixed(4))}${mirrored ? ';--hc-gs:-1' : ''}`;
    tankImg.addEventListener('load', () => card.classList.add('hc-loaded'), { once: true });
    if (options.onError) tankImg.addEventListener('error', options.onError, { once: true });
  }
  card.prepend(flag, tank);
  card.classList.add('cot-hc');
  card.dataset.heroFacing = manifest.facing;
  return true;
}

/**
 * Decorate the Garage roster strip. Sets the policy's flag feather once on the strip, then gives every
 * card its layers. Resolves to the ids that have no hero row (or every id when the manifest is
 * unavailable), which keep the Garage's packaged portrait instead.
 */
export async function mountRosterHeroCards(
  strip: HTMLElement,
  cards: ReadonlyMap<string, HTMLElement>,
  selectedId: string | null,
  onError: (specId: string) => void,
): Promise<string[]> {
  const manifest = await loadHeroManifest();
  if (!manifest) return [...cards.keys()];
  strip.style.setProperty('--hc-flag-mask', heroCardFlagMask(manifest));
  const missing: string[] = [];
  for (const [specId, card] of cards) {
    const decorated = decorateHeroCard(card, specId, manifest, {
      tankSizes: '180px',
      flagSizes: '240px',
      priority: specId === selectedId,
      onError: () => onError(specId),
    });
    if (!decorated) missing.push(specId);
  }
  return missing;
}

/** The policy's flag feather as a CSS mask-image, for a host list that holds many cards. */
export function heroCardFlagMask(manifest: HeroManifest): string {
  return heroFlagMaskCss(undefined, manifest.facing);
}

/**
 * Decorate one stand-alone tile (the end screen's vehicle tile) whose height follows its grid row: the
 * layers go in a host that fills the tile (container units need a box whose height is not content-sized),
 * with the policy feather on it. Resolves to false when there is no manifest or no row (the caller keeps
 * its own image).
 */
export async function decorateHeroTile(tile: HTMLElement, specId: string, options: HeroCardOptions): Promise<boolean> {
  const manifest = await loadHeroManifest();
  if (!manifest) return false;
  const host = document.createElement('span');
  host.className = 'hc-host';
  host.style.setProperty('--hc-flag-mask', heroCardFlagMask(manifest));
  if (!decorateHeroCard(host, specId, manifest, options)) return false;
  tile.append(host);
  return true;
}

/** Screenshot harness: load every displayed card's layers now instead of on approach. */
export function drainHeroCards(root: ParentNode = document): void {
  for (const img of root.querySelectorAll<HTMLImageElement>('img.hc-tank, img.hc-flag')) {
    if (img.loading === 'lazy') img.loading = 'eager';
  }
}
