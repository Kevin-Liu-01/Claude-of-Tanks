import { t } from '../ui/i18n.ts';
import './mediaLibrary.css';

// The media library (2026-10-19): every picture the media rounds made, each round's finals, renders, previz, review
// sheets, candidates and frames, published by collection under /media/library-r1. A collection's index names its sets
// and pictures; a picture's thumbnail is a cell of one of the collection's thumbnail sheets, and its web copy a byte
// range of one of its pack files (the pictures' WebP files end to end, fetched with an HTTP range request, so ten
// thousand pictures ship as a few dozen files). A picture the site already shows elsewhere names that file instead.
const ROOT_URL = '/media/library-r1';
/** [name, width, height, sheet, x, y, thumb width, thumb height, pack, offset, length] or [..., published url] */
type LibraryItem = [string, number, number, number, number, number, number, number, ...(number | string)[]];
interface LibrarySet { key: string; title: string; kind: string; items: LibraryItem[] }
interface LibraryCollection {
  key: string; title: string; blurb: string; count: number;
  packs: string[]; sheets: [string, number, number][]; sets: LibrarySet[];
}
interface LibrarySummary { key: string; title: string; blurb: string; count: number; sets: number; bytes: number }
interface LibraryIndex { version: number; count: number; collections: LibrarySummary[] }

const collections = new Map<string, Promise<LibraryCollection>>();
const pictureUrls = new Map<string, string>();
const PICTURE_CACHE = 40;

function fetchJson<T>(url: string): Promise<T> {
  return fetch(url).then((response) => {
    if (!response.ok) throw new Error(t('mediaLibrary.unavailable', { status: String(response.status) }));
    return response.json() as Promise<T>;
  });
}

function loadCollection(key: string): Promise<LibraryCollection> {
  let promise = collections.get(key);
  if (!promise) {
    promise = fetchJson<LibraryCollection>(`${ROOT_URL}/${key}/index.json`);
    promise.catch(() => collections.delete(key));
    collections.set(key, promise);
  }
  return promise;
}

/** The web copy of one picture: its published file, or its byte range of a pack as an object URL. */
async function pictureUrl(collection: LibraryCollection, item: LibraryItem): Promise<string> {
  const ref = item.slice(8);
  if (typeof ref[0] === 'string') return ref[0];
  const [pack, offset, length] = ref as number[];
  const cacheKey = `${collection.key}/${pack}/${offset}`;
  const cached = pictureUrls.get(cacheKey);
  if (cached) return cached;
  const response = await fetch(`${ROOT_URL}/${collection.key}/${collection.packs[pack]}`, {
    headers: { Range: `bytes=${offset}-${offset + length - 1}` },
  });
  if (!response.ok) throw new Error(t('mediaLibrary.unavailable', { status: String(response.status) }));
  // A server that ignores the range answers 200 with the whole pack: the picture is then its slice of it.
  const bytes = response.status === 206 ? await response.arrayBuffer() : (await response.arrayBuffer()).slice(offset, offset + length);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }));
  pictureUrls.set(cacheKey, url);
  if (pictureUrls.size > PICTURE_CACHE) {
    const [oldest, oldUrl] = pictureUrls.entries().next().value as [string, string];
    pictureUrls.delete(oldest);
    URL.revokeObjectURL(oldUrl);
  }
  return url;
}

const thumbScale = (): number => {
  const width = document.body?.dataset.cotWidth;
  return width === 'phone' ? 0.62 : width === 'compact' ? 0.74 : 1;
};

const pictureTitle = (name: string): string => name.replace(/-/g, ' ');

interface Viewer {
  open(collection: LibraryCollection, set: LibrarySet, index: number): void;
}

function createViewer(): Viewer {
  const dialog = document.createElement('dialog');
  dialog.className = 'media-library-viewer';
  dialog.setAttribute('aria-label', t('mediaLibrary.viewerAria'));
  dialog.innerHTML = `<figure><div class="media-library-stage"><img alt=""><p class="media-library-wait" hidden></p></div>`
    + `<figcaption><div><span data-library-where></span><strong data-library-name></strong><small data-library-size></small></div>`
    + `<div class="media-library-controls"><button type="button" data-library-step="-1" aria-label="${t('mediaLibrary.previousAria')}">‹</button>`
    + `<output data-library-position></output>`
    + `<button type="button" data-library-step="1" aria-label="${t('mediaLibrary.nextAria')}">›</button>`
    + `<button type="button" data-library-close aria-label="${t('mediaLibrary.closeAria')}">×</button></div></figcaption></figure>`;
  document.body.appendChild(dialog);
  const image = dialog.querySelector<HTMLImageElement>('img')!;
  const wait = dialog.querySelector<HTMLElement>('.media-library-wait')!;
  const where = dialog.querySelector<HTMLElement>('[data-library-where]')!;
  const name = dialog.querySelector<HTMLElement>('[data-library-name]')!;
  const size = dialog.querySelector<HTMLElement>('[data-library-size]')!;
  const position = dialog.querySelector<HTMLOutputElement>('[data-library-position]')!;
  let current: { collection: LibraryCollection; set: LibrarySet; index: number } | null = null;
  let request = 0;

  const show = (): void => {
    if (!current) return;
    const { collection, set, index } = current;
    const item = set.items[index];
    const own = ++request;
    where.textContent = `${collection.title} // ${set.title}`;
    name.textContent = pictureTitle(item[0]);
    size.textContent = `${item[1]} × ${item[2]}`;
    position.value = `${index + 1} / ${set.items.length}`;
    image.alt = `${set.title}: ${pictureTitle(item[0])}`;
    image.style.aspectRatio = `${item[1]} / ${item[2]}`;
    wait.hidden = false;
    wait.textContent = t('mediaLibrary.loading');
    pictureUrl(collection, item).then((url) => {
      if (own !== request) return;
      image.src = url;
      wait.hidden = true;
    }).catch((error: unknown) => {
      if (own !== request) return;
      wait.textContent = error instanceof Error ? error.message : String(error);
    });
  };
  const step = (by: number): void => {
    if (!current) return;
    const count = current.set.items.length;
    current.index = (current.index + by + count) % count;
    show();
  };
  dialog.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target === dialog || target?.closest('[data-library-close]')) { dialog.close(); return; }
    const stepButton = target?.closest<HTMLButtonElement>('[data-library-step]');
    if (stepButton) step(Number(stepButton.dataset.libraryStep));
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
  });
  dialog.addEventListener('close', () => { request++; image.removeAttribute('src'); });
  return {
    open(collection, set, index) {
      current = { collection, set, index };
      if (!dialog.open) dialog.showModal();
      show();
    },
  };
}

function setSection(collection: LibraryCollection, set: LibrarySet, viewer: Viewer, scale: number): HTMLElement {
  const section = document.createElement('section');
  section.className = 'media-library-set';
  section.dataset.kind = set.kind;
  const heading = document.createElement('h4');
  heading.innerHTML = `<span></span><output></output>`;
  heading.querySelector('span')!.textContent = set.title;
  heading.querySelector('output')!.value = String(set.items.length);
  const grid = document.createElement('div');
  grid.className = 'media-library-grid';
  grid.setAttribute('role', 'list');
  set.items.forEach((item, index) => {
    const [itemName, , , sheet, x, y, tw, th] = item;
    const [sheetName, sheetW, sheetH] = collection.sheets[sheet];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'media-library-thumb';
    button.setAttribute('role', 'listitem');
    button.setAttribute('aria-label', t('mediaLibrary.openAria', { name: pictureTitle(itemName), set: set.title }));
    button.style.width = `${Math.round(tw * scale)}px`;
    button.style.height = `${Math.round(th * scale)}px`;
    button.style.backgroundImage = `url("${ROOT_URL}/${collection.key}/${sheetName}")`;
    button.style.backgroundSize = `${Math.round(sheetW * scale)}px ${Math.round(sheetH * scale)}px`;
    button.style.backgroundPosition = `${-Math.round(x * scale)}px ${-Math.round(y * scale)}px`;
    button.addEventListener('click', () => viewer.open(collection, set, index));
    grid.appendChild(button);
  });
  section.append(heading, grid);
  return section;
}

/** Mount the library: the collections as tabs, the chosen collection's sets of thumbnails, one viewer for all. */
export async function mountMediaLibrary(root: HTMLElement | null | undefined): Promise<void> {
  if (!root || root.dataset.libraryMounted === 'true') return;
  root.dataset.libraryMounted = 'true';
  root.classList.add('media-library');
  root.setAttribute('aria-busy', 'true');
  let index: LibraryIndex;
  try {
    index = await fetchJson<LibraryIndex>(`${ROOT_URL}/index.json`);
  } catch (error) {
    root.dataset.libraryMounted = 'false';
    root.removeAttribute('aria-busy');
    root.replaceChildren(Object.assign(document.createElement('p'), {
      className: 'media-library-wait', textContent: error instanceof Error ? error.message : String(error),
    }));
    return;
  }
  const viewer = createViewer();
  const head = document.createElement('div');
  head.className = 'media-library-head';
  const total = document.createElement('output');
  total.className = 'media-library-total';
  total.value = t('mediaLibrary.total', {
    count: index.count.toLocaleString('en-US'), collections: String(index.collections.length),
  });
  const tabs = document.createElement('div');
  tabs.className = 'media-library-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', t('mediaLibrary.tabsAria'));
  const panel = document.createElement('div');
  panel.className = 'media-library-panel';
  panel.setAttribute('role', 'tabpanel');
  head.append(total, tabs);
  root.replaceChildren(head, panel);
  let active = '';
  const select = (key: string): void => {
    if (key === active) return;
    active = key;
    tabs.querySelectorAll<HTMLButtonElement>('button').forEach((button) =>
      button.setAttribute('aria-selected', String(button.dataset.collection === key)));
    panel.setAttribute('aria-busy', 'true');
    panel.replaceChildren(Object.assign(document.createElement('p'), {
      className: 'media-library-wait', textContent: t('mediaLibrary.loading'),
    }));
    loadCollection(key).then((collection) => {
      if (active !== key) return;
      const scale = thumbScale();
      const intro = document.createElement('header');
      intro.className = 'media-library-intro';
      intro.innerHTML = `<h3></h3><p></p><output></output>`;
      intro.querySelector('h3')!.textContent = collection.title;
      intro.querySelector('p')!.textContent = collection.blurb;
      intro.querySelector('output')!.value = t('mediaLibrary.collectionCount', {
        count: collection.count.toLocaleString('en-US'), sets: String(collection.sets.length),
      });
      panel.replaceChildren(intro, ...collection.sets.map((set) => setSection(collection, set, viewer, scale)));
      panel.removeAttribute('aria-busy');
    }).catch((error: unknown) => {
      if (active !== key) return;
      panel.replaceChildren(Object.assign(document.createElement('p'), {
        className: 'media-library-wait', textContent: error instanceof Error ? error.message : String(error),
      }));
      active = '';
    });
  };
  for (const summary of index.collections) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.dataset.collection = summary.key;
    button.innerHTML = `<span></span><small></small>`;
    button.querySelector('span')!.textContent = summary.title;
    button.querySelector('small')!.textContent = summary.count.toLocaleString('en-US');
    button.addEventListener('click', () => select(summary.key));
    tabs.appendChild(button);
  }
  root.removeAttribute('aria-busy');
  select(index.collections[0]?.key ?? '');
}
