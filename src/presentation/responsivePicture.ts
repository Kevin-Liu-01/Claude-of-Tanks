/**
 * responsivePicture.ts — one way to put a still on a public page (brand-ui SPEC 8.3, SHOWCASE §5.3; BUI-F7).
 *
 * - `srcset` + `sizes` over the rungs the still ships in (640 / 1280 / 1920 / 2560), by its collection's naming.
 * - An explicit width and height on every picture, so media never shifts the layout (media CLS ≤ 0.02).
 * - An inline LQIP (≤ 1 KB data URI) or the dominant tone behind the picture, so overlaid text reads before it decodes.
 * - Data saving (Save-Data, 2g/3g) gets the 640 rung and nothing larger.
 *
 * The module imports nothing and runs nothing at import; it never enters the game entry's boot graph.
 */

export interface StillRung {
  readonly src: string;
  /** The file's width in pixels (the srcset descriptor). */
  readonly width: number;
}

/** The web rungs of a still (SPEC 8.3): 640 for thumbs and data saving, 1280, 1920, 2560 for lightboxes and press. */
export const STILL_RUNG_WIDTHS = Object.freeze([640, 1280, 1920, 2560] as const);
/** The rung data saving serves. */
export const DATA_SAVER_WIDTH = 640;
/** The cap on an inline LQIP (SHOWCASE §5.3). */
const LQIP_MAX_BYTES = 1024;

/**
 * The collections whose stills ship more than one rung, and how each names its rungs. A still outside these is one
 * file. tools/media-fallback.selftest.mjs proves every rung named here for a page's still exists on disk.
 */
const RUNG_CONVENTIONS: ReadonlyArray<{ readonly test: RegExp; readonly rungs: ReadonlyArray<readonly [string, number]> }> = [
  // the site fifty's stills and fifty frames (site50-r14): <name>.webp at 1920 and <name>-thumb.webp at 640 (the
  // frames' contact sheets ship one size)
  { test: /^(\/media\/site50-r14\/(?:stills\/[\w-]+?|frames\/b\d+-[\w-]+?))(?<!-thumb)(\.webp)$/, rungs: [['$1-thumb$2', 640]] },
  // the home r2 shots (site50-r14/home): <name>.webp and <name>-640.webp
  { test: /^(\/media\/site50-r14\/home\/(?:features|modes|mechanics)\/[\w-]+?)(?<!-640)(\.webp)$/, rungs: [['$1-640$2', 640]] },
  // the battlefields' map art: /maps/<id>.webp at 3840 and its 1280 card, /maps/cards/<id>.webp
  { test: /^\/maps\/([\w-]+)\.webp$/, rungs: [['/maps/cards/$1.webp', 1280]] },
];

/** The rungs `src` (its largest web file, `width` wide) ships in, smallest first. */
export function stillRungs(src: string, width = 1920): StillRung[] {
  const rungs: StillRung[] = [{ src, width }];
  const convention = RUNG_CONVENTIONS.find(({ test }) => test.test(src));
  for (const [pattern, rungWidth] of convention?.rungs ?? []) {
    if (convention && rungWidth < width) rungs.push({ src: src.replace(convention.test, pattern), width: rungWidth });
  }
  return rungs.sort((a, b) => a.width - b.width);
}

export function srcsetFor(rungs: readonly StillRung[]): string {
  return rungs.map((rung) => `${rung.src} ${rung.width}w`).join(', ');
}

/** The rung data saving shows: the largest at most 640 wide, else the smallest there is. */
export function dataSaverRung(rungs: readonly StillRung[]): StillRung | undefined {
  const sorted = [...rungs].sort((a, b) => a.width - b.width);
  return sorted.filter((rung) => rung.width <= DATA_SAVER_WIDTH).at(-1) ?? sorted[0];
}

interface ConnectionHints { readonly saveData?: boolean; readonly effectiveType?: string }

/** Data saving, as src/presentation/mediaPlayer.ts reads it (Save-Data or a 2g/3g link; the selftest holds them equal). */
export function stillDataSaver(): boolean {
  const hints = typeof navigator === 'undefined' ? undefined
    : (navigator as Navigator & { connection?: ConnectionHints }).connection;
  return !!hints?.saveData || /^(?:slow-2g|2g|3g)$/.test(hints?.effectiveType || '');
}

/** The file a still shows under data saving: its 640 rung where it ships one. */
export function dataSaverSrc(src: string, width = 1920): string {
  return dataSaverRung(stillRungs(src, width))?.src ?? src;
}

export interface PictureOptions {
  /** The still's largest web file. */
  readonly src: string;
  /** Its intrinsic size (the aspect ratio every rung shares). */
  readonly width: number;
  readonly height: number;
  readonly alt: string;
  /** The rungs (default: the collection's, from `src`). */
  readonly rungs?: readonly StillRung[];
  /** The layout width the picture takes (default the full viewport). */
  readonly sizes?: string;
  /** The page's LCP: fetched at once and first; every other picture is lazy. */
  readonly eager?: boolean;
  readonly className?: string;
  /** An inline LQIP data URI (≤ 1 KB) drawn behind the picture until it decodes. */
  readonly lqip?: string;
  /** The still's dominant tone, behind the LQIP (or alone). */
  readonly tone?: string;
  /** What data saving shows instead (default the 640 rung): a still that never swaps into a video may be another frame. */
  readonly saveData?: StillRung;
  /** What a phone layout shows instead, whatever its pixel density (the page's phone pre-scroll budget). */
  readonly phone?: StillRung;
}

/** The phone layout (src/ui/responsiveLayout.ts phone + compact bands), as src/presentation/mediaPlayer.ts reads it. */
export const PHONE_MEDIA = '(max-width: 767px)';

const escapeAttribute = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The attributes of one responsive picture, in markup order. */
function pictureAttributes(options: PictureOptions, saving = stillDataSaver()): Array<readonly [string, string]> {
  const rungs = options.rungs ?? stillRungs(options.src, options.width);
  const attributes: Array<readonly [string, string]> = [];
  if (options.className) attributes.push(['class', options.className]);
  const saved = saving ? options.saveData ?? dataSaverRung(rungs) : undefined;
  if (saved) {
    attributes.push(['src', saved.src]);
  } else {
    attributes.push(['src', options.src]);
    if (rungs.length > 1) {
      attributes.push(['srcset', srcsetFor(rungs)]);
      attributes.push(['sizes', options.sizes ?? '100vw']);
    }
  }
  attributes.push(['width', String(options.width)], ['height', String(options.height)], ['alt', options.alt]);
  attributes.push(['decoding', 'async']);
  if (options.eager) attributes.push(['fetchpriority', 'high']);
  else attributes.push(['loading', 'lazy']);
  if (options.lqip && options.lqip.length > LQIP_MAX_BYTES * 1.4) {
    throw new Error(`responsivePicture: the LQIP for ${options.src} is over ${LQIP_MAX_BYTES} B`);
  }
  const backdrop = [options.lqip ? `url("${options.lqip}") center/cover no-repeat` : '', options.tone ?? '']
    .filter(Boolean).join(' ');
  if (backdrop) attributes.push(['style', `background:${backdrop}`]);
  return attributes;
}

/** One responsive picture as markup (pages that render HTML strings: the manual's topics). A phone still makes it a
 *  `<picture>` whose phone source wins on narrow layouts. */
export function pictureMarkup(options: PictureOptions, saving = stillDataSaver()): string {
  const image = `<img ${pictureAttributes(options, saving).map(([name, value]) => `${name}="${escapeAttribute(value)}"`).join(' ')}>`;
  if (!options.phone || saving) return image;
  return `<picture><source media="${PHONE_MEDIA}" srcset="${escapeAttribute(options.phone.src)}">${image}</picture>`;
}

/** One responsive picture as an element (`<picture>` when it has a phone still). */
export function createPicture(options: PictureOptions, saving = stillDataSaver()): HTMLElement {
  const image = document.createElement('img');
  for (const [name, value] of pictureAttributes(options, saving)) image.setAttribute(name, value);
  if (!options.phone || saving) return image;
  const picture = document.createElement('picture');
  const source = document.createElement('source');
  source.setAttribute('media', PHONE_MEDIA);
  source.setAttribute('srcset', options.phone.src);
  picture.append(source, image);
  return picture;
}

/** The smallest-enough candidate of a `srcset`: the largest at most 640 wide, else the narrowest. */
export function dataSaverCandidate(srcset: string): string | null {
  const candidates = srcset.split(',').map((part) => part.trim().split(/\s+/))
    .map(([url, descriptor]) => ({ url: url ?? '', width: Number.parseInt(descriptor ?? '', 10) }))
    .filter((candidate) => candidate.url && Number.isFinite(candidate.width));
  if (!candidates.length) return null;
  return dataSaverRung(candidates.map((candidate) => ({ src: candidate.url, width: candidate.width })))?.src ?? null;
}

/**
 * Data saving on a page already written: every lazy picture that has not loaded yet drops to its 640 candidate, or
 * (without a srcset) to its collection's 640 rung (the page's eager LCP still loads before any script can see it).
 * Returns how many pictures changed.
 */
export function applyDataSaverStills(root: ParentNode = document, saving = stillDataSaver()): number {
  if (!saving) return 0;
  let changed = 0;
  for (const image of root.querySelectorAll<HTMLImageElement>('img[loading="lazy"]')) {
    if (image.complete && image.currentSrc) continue;
    const srcset = image.getAttribute('srcset');
    const src = image.getAttribute('src') || '';
    const small = srcset ? dataSaverCandidate(srcset) : dataSaverSrc(src);
    if (!small || (!srcset && small === src)) continue;
    image.removeAttribute('srcset');
    image.removeAttribute('sizes');
    image.setAttribute('src', small);
    changed++;
  }
  return changed;
}
