import { getLocale, onLocaleChange, t } from '../ui/i18n.ts';
import { icon } from '../ui/icons/icon.ts';
import { setRoving, tabs as kitTabs, wireRoving } from '../ui/components/components.ts';
import { dialogSurface } from '../ui/components/surfaceStack.ts';

// The media library: every finished picture of the media rounds' current takes (library-r3, 2026-10-21: r2's one final
// a subject left out "so many pictures"; r1's 11,215, every render, review sheet and candidate, were "way too much"),
// published by collection under /media/library-r3. A collection's index names its sets and pictures; a picture's
// thumbnail is a cell of one of the collection's thumbnail sheets, and its web copy a byte range of one of its pack
// files (the pictures' WebP files end to end, fetched with an HTTP range request). A picture the site already shows
// elsewhere names that file instead. The collections are grouped by what the pictures show (battle scenes by
// battlefield, vehicles by country...), and every picture has a caption in each locale: its title, a line about it,
// and its shot (close-up, another moment...).
const ROOT_URL = '/media/library-r3';
/** [name, width, height, sheet, x, y, thumb width, thumb height, pack, offset, length] or [..., published url] */
type LibraryItem = [string, number, number, number, number, number, number, number, ...(number | string)[]];
/** A text in each locale, or one string that reads the same in all of them (a vehicle's name). */
type LibraryText = string | Partial<Record<string, string>>;
/** [title, about, shot] */
type LibraryCaption = [LibraryText, LibraryText | null, LibraryText | null];
interface LibrarySet { key: string; title: LibraryText; kind: string; items: LibraryItem[]; captions?: LibraryCaption[] }
interface LibraryCollection {
  key: string; title: LibraryText; blurb: LibraryText; count: number;
  packs: string[]; sheets: [string, number, number][]; sets: LibrarySet[];
}
interface LibrarySummary { key: string; title: LibraryText; blurb: LibraryText; count: number; sets: number; bytes: number }
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

/** The thumbnails' scale: a row of 16:9 cells (240 px in the sheets, 8 px apart: mediaLibrary.css, var(--s2)) fills the
 *  panel's width. */
const THUMB_CELL = 240;
const THUMB_GAP = 8;
const thumbScale = (width: number): number => {
  if (!(width > 0)) return 1;
  const columns = Math.max(2, Math.ceil((width + THUMB_GAP) / (THUMB_CELL + THUMB_GAP)));
  // half a pixel of slack a row, so rounded widths never push a full row onto two lines while it ends on the column's edge
  return Math.min(1.25, (width - (columns - 1) * THUMB_GAP - 0.5) / (columns * THUMB_CELL));
};

const say = (text: LibraryText | null | undefined): string =>
  text == null ? '' : typeof text === 'string' ? text : text[getLocale()] ?? text['en-US'] ?? '';
const pictureTitle = (set: LibrarySet, index: number): string =>
  say(set.captions?.[index]?.[0]) || set.items[index][0].replace(/-/g, ' ');

interface Viewer {
  open(collection: LibraryCollection, set: LibrarySet, index: number): void;
  /** Re-word the open picture's caption in the current locale. */
  refresh(): void;
}

function createViewer(): Viewer {
  const dialog = document.createElement('dialog');
  dialog.className = 'media-library-viewer';
  dialogSurface(dialog, 'media-library');
  dialog.setAttribute('aria-label', t('mediaLibrary.viewerAria'));
  dialog.innerHTML = `<figure><div class="media-library-stage"><img alt=""><p class="media-library-wait" hidden></p></div>`
    + `<figcaption><div><strong data-library-name></strong><p data-library-about></p></div>`
    + `<div class="media-library-controls"><button type="button" data-library-step="-1" aria-label="${t('mediaLibrary.previousAria')}">${icon('chevronLeft', { size: 20 })}</button>`
    + `<output data-library-position></output>`
    + `<button type="button" data-library-step="1" aria-label="${t('mediaLibrary.nextAria')}">${icon('chevronRight', { size: 20 })}</button>`
    + `<button type="button" data-library-close aria-label="${t('mediaLibrary.closeAria')}">${icon('close', { size: 20 })}</button></div></figcaption></figure>`;
  document.body.appendChild(dialog);
  const image = dialog.querySelector<HTMLImageElement>('img')!;
  const wait = dialog.querySelector<HTMLElement>('.media-library-wait')!;
  const name = dialog.querySelector<HTMLElement>('[data-library-name]')!;
  const about = dialog.querySelector<HTMLElement>('[data-library-about]')!;
  const position = dialog.querySelector<HTMLOutputElement>('[data-library-position]')!;
  let current: { collection: LibraryCollection; set: LibrarySet; index: number } | null = null;
  let request = 0;

  const caption = (): void => {
    if (!current) return;
    const { set, index } = current;
    const [, aboutText] = set.captions?.[index] ?? [];
    name.textContent = pictureTitle(set, index);
    about.textContent = say(aboutText);
    position.value = `${index + 1} / ${set.items.length}`;
    image.alt = [pictureTitle(set, index), say(aboutText)].filter(Boolean).join(': ');
  };
  const show = (): void => {
    if (!current) return;
    const { collection, set, index } = current;
    const item = set.items[index];
    const own = ++request;
    caption();
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
    refresh: caption,
  };
}

function setSection(collection: LibraryCollection, set: LibrarySet, viewer: Viewer, scale: number): HTMLElement {
  const section = document.createElement('section');
  section.className = 'media-library-set';
  section.dataset.kind = set.kind;
  const heading = document.createElement('h4');
  heading.textContent = say(set.title);
  const grid = document.createElement('div');
  grid.className = 'media-library-grid';
  grid.setAttribute('role', 'list');
  set.items.forEach((item, index) => {
    const [, , , sheet, x, y, tw, th] = item;
    const [sheetName, sheetW, sheetH] = collection.sheets[sheet];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'media-library-thumb';
    button.setAttribute('role', 'listitem');
    button.setAttribute('aria-label', t('mediaLibrary.openAria', { name: pictureTitle(set, index), set: say(set.title) }));
    button.dataset.tip = pictureTitle(set, index);
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
  // the collections are the kit's underline tabs (each switches the panel under them; arrows rove between them)
  head.innerHTML = kitTabs({ label: t('mediaLibrary.tabsAria'), className: 'media-library-tabs', selected: index.collections[0]?.key ?? '',
    tabs: index.collections.map((summary) => ({ id: summary.key, label: say(summary.title) })) });
  const tabs = head.firstElementChild as HTMLElement;
  // a strip longer than the column scrolls sideways: its more button steps it on and turns back at its end
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'cot-c-btn cot-c-btn--36 cot-c-btn--icon cot-c-btn--secondary media-library-more';
  more.setAttribute('aria-label', t('picker.more'));
  more.innerHTML = icon('chevronRight', { size: 16 });
  head.append(more);
  const syncMore = (): void => {
    const over = tabs.scrollWidth > tabs.clientWidth + 1;
    tabs.classList.toggle('is-over', over);
    more.hidden = !over;
    more.classList.toggle('is-back', over && tabs.scrollLeft + tabs.clientWidth >= tabs.scrollWidth - 1);
  };
  more.addEventListener('click', () => {
    tabs.scrollLeft = more.classList.contains('is-back') ? 0 : tabs.scrollLeft + tabs.clientWidth * 0.8;
  });
  tabs.addEventListener('scroll', syncMore, { passive: true });
  if (typeof ResizeObserver === 'function') new ResizeObserver(syncMore).observe(tabs);
  const panel = document.createElement('div');
  panel.className = 'media-library-panel';
  panel.setAttribute('role', 'tabpanel');
  root.replaceChildren(head, panel);
  let active = '';
  const select = (key: string, again = false): void => {
    if (key === active && !again) return;
    active = key;
    setRoving(tabs, key);
    panel.setAttribute('aria-busy', 'true');
    panel.replaceChildren(Object.assign(document.createElement('p'), {
      className: 'media-library-wait', textContent: t('mediaLibrary.loading'),
    }));
    loadCollection(key).then((collection) => {
      if (active !== key) return;
      const scale = thumbScale(panel.clientWidth);
      panel.replaceChildren(...collection.sets.map((set) => setSection(collection, set, viewer, scale)));
      panel.removeAttribute('aria-busy');
    }).catch((error: unknown) => {
      if (active !== key) return;
      panel.replaceChildren(Object.assign(document.createElement('p'), {
        className: 'media-library-wait', textContent: error instanceof Error ? error.message : String(error),
      }));
      active = '';
    });
  };
  wireRoving(tabs, (key) => select(key));
  // the words in the current locale; a language switch re-words the head, the open collection and the viewer
  const words = (): void => {
    tabs.setAttribute('aria-label', t('mediaLibrary.tabsAria'));
    index.collections.forEach((summary, k) => {
      const name = tabs.children[k]?.querySelector('span');
      if (name) name.textContent = say(summary.title);
    });
  };
  words();
  onLocaleChange(() => {
    words();
    syncMore();
    if (active) select(active, true);
    viewer.refresh();
  });
  root.removeAttribute('aria-busy');
  select(index.collections[0]?.key ?? '');
}
