import type { RuntimeValue } from '../runtimeTypes.ts';
import { t } from '../ui/i18n.ts';
import { createInfoButton } from '../ui/contextInfo.ts';
import type { InfoButton } from '../ui/contextInfo.ts';
import { icon } from '../ui/icons/icon.ts';
import { setRoving, tabs, wireRoving } from '../ui/components/components.ts';
import { dialogSurface } from '../ui/components/surfaceStack.ts';
import { loadCaptureRecipes, recipeForMedia } from './captureRecipes.ts';
import { revealStills } from './revealStills.ts';

const MANIFEST_URL = '/media/site50-r14/archive.json';
/** The manifest's feature names in filter order. */
const FEATURES = ['all', 'studio direction', 'interface', 'killcam', 'gunnery', 'destruction', 'armor impacts', 'track physics', 'world system', 'tank design', 'battlefield atmosphere'];
/** A manifest phrase or file stem as a key's last part ('Rack focus (near)' → rackFocusNear, 'b01-pan-runway' → b01PanRunway). */
const camel = (text: string): string => text.trim().toLowerCase().replace(/[^a-z0-9]+(.)?/g, (_, c: string | undefined) => (c ?? '').toUpperCase());
/** The catalog's line for `key`, or `fallback` where the catalog has none. */
const caption = (key: string, fallback: string): string => {
  const text = t(key);
  return text === key ? fallback : text;
};
/** A filter's feature is worded by mediaArchive.feature.<camelCase>, a frame's or take's technique by
 * mediaArchive.technique.<camelCase> (in the game the Studio's slice: only its Field frames show them). */
const featureLabel = (feature: string): string => caption(
  (FEATURES.includes(normalize(feature)) ? 'mediaArchive.feature.' : 'mediaArchive.technique.') + camel(feature), feature);
interface PresentationShot {
  src: string;
  previewSrc?: string;
  alt: string;
  feature: string;
  /** The battlefield: its id on the battlefield stills, its English name on the frames and takes (with `mapId`). */
  map: string;
  mapId?: string;
  title: string;
  take?: string;
  kind?: string;
  effects?: string[];
  sequence?: number;
}

interface PresentationManifest { shots: PresentationShot[] }

interface ShotWords { title: string; /** the battlefield, '' where the title already names it */ place: string; alt: string }

/** A shot's words in the locale: a battlefield still is its map's name, a take its catalog title, a frame its own line. */
function shotWords(shot: PresentationShot, takeTitle?: MediaArchiveOptions['takeTitle']): ShotWords {
  const map = caption(`map.${shot.mapId ?? shot.map}`, shot.map);
  if (shot.kind === 'battlefield') return { title: map, place: '', alt: t('mediaArchive.card.battlefieldAlt', { map }) };
  const stem = shot.src.slice(shot.src.lastIndexOf('/') + 1).replace(/\.\w+$/, '');
  const title = shot.take ? takeTitle?.(shot.take) ?? shot.title : caption(`mediaArchive.frame.${camel(stem)}`, shot.title);
  // a frame's or take's alt is its title
  return { title, place: map, alt: shot.alt === shot.title ? title : shot.alt };
}

interface MediaArchiveOptions {
  mode?: string;
  kinds?: string[];
  limit?: number;
  pageSize?: number;
  feature?: string;
  filters?: boolean;
  /** A take's title in the locale (mediaArchiveTakes.ts), where the archive shows takes; without it a take keeps its manifest title. */
  takeTitle?: (take: string) => string | null;
}

let manifestPromise: Promise<PresentationManifest> | undefined;

function loadPresentationManifest(): Promise<PresentationManifest> {
  if (!manifestPromise) {
    const archive = fetch(MANIFEST_URL).then((response) => {
      if (!response.ok) throw new Error(`Presentation archive unavailable (${response.status})`);
      return response.json() as Promise<PresentationManifest>;
    });
    // Capture files are optional; the bundled archive remains available on its own.
    const production = fetch('/media/production-r1/manifest.json').then((response) =>
      response.ok ? response.json() as Promise<PresentationManifest> : null,
    ).catch(() => null);
    manifestPromise = Promise.all([archive, production]).then(([base, fresh]) => {
      const refreshedMaps = new Set((fresh?.shots ?? [])
        .filter(shot => shot.kind === 'battlefield').map(shot => shot.map));
      return { shots: [...(fresh?.shots ?? []), ...base.shots.filter(shot =>
        shot.kind !== 'battlefield' || !refreshedMaps.has(shot.map))] };
    });
    // a failed fetch is not kept: the next mount (a Retry, a return online) asks again
    manifestPromise.catch(() => { manifestPromise = undefined; });
  }
  return manifestPromise;
}

function ensureLightbox(): HTMLDialogElement {
  let dialog = document.querySelector<HTMLDialogElement>('.media-lightbox');
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.className = 'media-lightbox';
  dialogSurface(dialog, 'media-archive');
  dialog.innerHTML = `<figure><img alt=""><figcaption><div><span></span><strong></strong><small></small></div><button type="button" aria-label="${t('mediaArchive.lightbox.closeAria')}">${icon('close', { size: 20 })}</button></figcaption></figure>`;
  const closeButton = dialog.querySelector<HTMLButtonElement>('button');
  if (!closeButton) throw new Error('media lightbox close control is unavailable');
  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  document.body.appendChild(dialog);
  return dialog;
}

function openShot(shot: PresentationShot, words: ShotWords): void {
  const dialog = ensureLightbox();
  const image = dialog.querySelector<HTMLImageElement>('img');
  const feature = dialog.querySelector<HTMLElement>('span');
  const title = dialog.querySelector<HTMLElement>('strong');
  const effects = dialog.querySelector<HTMLElement>('small');
  if (!image || !feature || !title || !effects) throw new Error('media lightbox is incomplete');
  image.src = shot.src;
  image.alt = words.alt;
  feature.textContent = words.place ? `${featureLabel(shot.feature)} // ${words.place}` : featureLabel(shot.feature);
  title.textContent = words.title;
  effects.textContent = shot.effects?.length ? shot.effects.join(' · ').replaceAll('_', ' ') : t('mediaArchive.lightbox.fallbackCaption');
  dialog.showModal();
}

function shotCard(shot: PresentationShot, index: number, recipe: RuntimeValue, takeTitle?: MediaArchiveOptions['takeTitle']): HTMLElement {
  const card = document.createElement('article');
  card.className = 'media-archive-card';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'media-archive-card-open';
  const words = shotWords(shot, takeTitle);
  button.setAttribute('aria-label', t('mediaArchive.card.openAria', { title: words.title }));
  const image = document.createElement('img');
  image.src = shot.previewSrc || shot.src;
  image.alt = words.alt;
  image.loading = index < 3 ? 'eager' : 'lazy';
  image.decoding = 'async';
  const copy = document.createElement('span');
  copy.className = 'media-archive-card-copy';
  copy.innerHTML = `<span><span>${featureLabel(shot.feature)}</span><strong>${words.title}</strong></span>${words.place ? `<small>${words.place}</small>` : ''}`;
  const count = document.createElement('span');
  count.className = 'media-archive-card-index';
  count.textContent = String(shot.sequence || index + 1).padStart(2, '0');
  button.append(image, copy, count);
  button.addEventListener('click', () => openShot(shot, words));
  card.appendChild(button);
  if (recipe) {
    card.appendChild(createInfoButton({
      label: t('fieldGuide.recipeLabel', { name: words.title }),
      title: t('fieldGuide.recipeTitle', { name: words.title }),
      guide: 'recipe',
      json: recipe,
      className: 'media-archive-recipe',
      image: {
        src: shot.src,
        alt: words.alt || t('mediaArchive.recipe.fallbackAlt', { title: words.title }),
        caption: words.place ? `${words.title} // ${words.place}` : words.title,
      },
    }));
  }
  return card;
}

function normalize(value: RuntimeValue): string {
  return String(value || '').trim().toLowerCase();
}

export async function mountMediaArchive(
  root: HTMLElement | null | undefined,
  options: MediaArchiveOptions = {},
) {
  if (!root || root.dataset.mediaMounted === 'true') return null;
  root.dataset.mediaMounted = 'true';
  root.classList.add('media-archive');
  if (options.mode) root.classList.add(`media-archive--${options.mode}`);
  const [manifest, recipes] = await Promise.all([
    loadPresentationManifest(),
    loadCaptureRecipes().catch(() => ({ media: {}, recipes: {} })),
  ]).catch((error: RuntimeValue) => {
    // the archive that never arrived is not mounted: a Retry mounts it again (the loading census: the mark set before
    // this wait and the kept failed manifest left the docs archive's Retry with nothing to do)
    delete root.dataset.mediaMounted;
    throw error;
  });
  const allowedKinds = options.kinds?.length ? new Set(options.kinds.map(normalize)) : null;
  const source = manifest.shots.filter((shot) => !allowedKinds || allowedKinds.has(normalize(shot.kind)));
  const limit = typeof options.limit === 'number' && Number.isFinite(options.limit)
    ? options.limit : source.length;
  const pageSize = typeof options.pageSize === 'number' && Number.isFinite(options.pageSize)
    ? Math.max(1, options.pageSize) : limit;
  let visibleLimit = Math.min(pageSize, limit);
  let active = normalize(options.feature || 'all');

  const toolbar = document.createElement('div');
  toolbar.className = 'media-archive-toolbar';
  const filters = document.createElement('div');
  filters.className = 'media-archive-filters';
  const count = document.createElement('output');
  count.className = 'media-archive-count';
  const status = document.createElement('div');
  status.className = 'media-archive-status';
  const loadMore = document.createElement('button');
  loadMore.type = 'button';
  loadMore.className = 'media-archive-more';
  const grid = document.createElement('div');
  grid.className = 'media-archive-grid';

  const available = new Set(source.map((shot) => normalize(shot.feature)));
  const features = FEATURES.filter((feature) => feature === 'all' || available.has(feature));
  function render(): void {
    grid.querySelectorAll<InfoButton>('.cot-info-trigger').forEach((button) => button.disposeInfo());
    const filtered = source.filter((shot) => active === 'all' || normalize(shot.feature) === active).slice(0, limit);
    const visible = filtered.slice(0, visibleLimit);
    grid.replaceChildren(...visible.map((shot, index) =>
      shotCard(shot, index, recipeForMedia(recipes, shot.src), options.takeTitle)));
    // each card's still fades in once decoded; one the link dropped keeps the card's tone and loads again online
    revealStills(grid.querySelectorAll<HTMLImageElement>('.media-archive-card-open > img'));
    count.value = t('mediaArchive.count', {
      shown: String(visible.length).padStart(2, '0'),
      total: String(filtered.length).padStart(2, '0'),
    });
    const remaining = filtered.length - visible.length;
    loadMore.hidden = remaining <= 0;
    loadMore.textContent = remaining > 0 ? t('mediaArchive.loadMore', { count: Math.min(pageSize, remaining) }) : '';
    if (options.filters !== false) setRoving(filters.firstElementChild as HTMLElement, active);
  }
  if (options.filters !== false) {
    // the features are the kit's underline tabs over the grid: each shows the archive's shots of one feature
    filters.innerHTML = tabs({ label: t('mediaArchive.filterAria'), selected: active,
      tabs: features.map((feature) => ({ id: feature, label: featureLabel(feature) })) });
    wireRoving(filters.firstElementChild as HTMLElement, (feature) => {
      if (feature === active) return;
      active = feature; visibleLimit = Math.min(pageSize, limit); render();
    });
  }
  loadMore.addEventListener('click', () => { visibleLimit = Math.min(limit, visibleLimit + pageSize); render(); });
  status.append(count, loadMore);
  toolbar.append(filters, status);
  root.replaceChildren(toolbar, grid);
  render();
  return { manifest, render, root };
}

export function autoMountMediaArchives(scope: ParentNode = document): void {
  for (const root of scope.querySelectorAll<HTMLElement>('[data-media-archive]')) {
    const kinds = root.dataset.kinds ? root.dataset.kinds.split(',') : undefined;
    mountMediaArchive(root, {
      mode: root.dataset.mode || undefined,
      limit: root.dataset.limit ? Number(root.dataset.limit) : undefined,
      pageSize: root.dataset.pageSize ? Number(root.dataset.pageSize) : undefined,
      feature: root.dataset.feature || undefined,
      kinds,
      filters: root.dataset.filters !== 'false',
    }).catch((error: RuntimeValue) => {
      const message = error instanceof Error ? error.message : String(error);
      root.innerHTML = `<p class="media-archive-count">${message}</p>`;
    });
  }
}
