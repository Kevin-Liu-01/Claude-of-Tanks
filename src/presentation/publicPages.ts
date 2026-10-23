import { installResponsiveLayout } from '../ui/responsiveLayout.ts';
import { t } from '../ui/i18n.ts';

installResponsiveLayout();

interface NetworkInformation extends EventTarget {
  saveData?: boolean;
  effectiveType?: string;
}

interface NavigatorWithDeviceHints extends Navigator {
  connection?: NetworkInformation;
  mozConnection?: NetworkInformation;
  webkitConnection?: NetworkInformation;
}

const deviceNavigator = navigator as NavigatorWithDeviceHints;
const networkConnection = (): NetworkInformation | undefined =>
  deviceNavigator.connection || deviceNavigator.mozConnection || deviceNavigator.webkitConnection;
// Data saving (Save-Data or a 2g/3g link; brand-ui SPEC 8.3): no video source, the 640 stills, no rotation prefetch.
const savingData = (): boolean => {
  const connection = networkConnection();
  return !!connection?.saveData || /^(?:slow-2g|2g|3g)$/.test(connection?.effectiveType || '');
};

// The site's one playback policy (mediaPlayer.ts) and the data-saving stills (responsivePicture.ts) load beside the
// page, never in its first bytes: a page with no video, and a visitor not saving data, fetch neither.
type MediaPlayerModule = typeof import('./mediaPlayer.ts');
let media: MediaPlayerModule | null = null;
const pageVideos = document.querySelectorAll<HTMLVideoElement>('video[data-media-player], video[data-autoplay-video]');
if (pageVideos.length) {
  void Promise.all([import('./mediaPlayer.ts'), import('./mediaPlayer.css')]).then(([module]) => {
    media = module;
    module.mountMediaPlayers(pageVideos, (playing, video) => t(playing ? 'publicPages.video.pauseAria'
      : 'publicPages.video.playAria', { label: video.dataset.i18nLabel ? t(video.dataset.i18nLabel) : video.dataset.label || '' }));
  });
}
const savingPictures = savingData() ? import('./responsivePicture.ts') : null;
void savingPictures?.then(({ applyDataSaverStills }) => applyDataSaverStills(document, true));

// The media archive is used by docs, not the landing page. Keep its manifest,
// rendering code, and CSS out of the home critical path.
if (document.querySelector('[data-media-archive]')) {
  Promise.all([
    import('./mediaArchive.css'),
    import('./mediaArchive.ts'),
  ]).then(([, { autoMountMediaArchives }]) => autoMountMediaArchives());
}


function mountShotRail(rail: HTMLElement): void {
  const section = rail.closest<HTMLElement>('.v5-authored');
  const cards = [...rail.querySelectorAll<HTMLElement>('figure')];
  const previous = section?.querySelector<HTMLButtonElement>('[data-shot-previous]');
  const next = section?.querySelector<HTMLButtonElement>('[data-shot-next]');
  const position = section?.querySelector<HTMLElement>('[data-shot-position]');
  const progress = section?.querySelector<HTMLElement>('[data-shot-progress]');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  if (!section || cards.length < 2 || !previous || !next || !position || !progress) return;

  let activeIndex = 0;
  let updateFrame = 0;

  const nearestCardIndex = (): number => cards.reduce((nearest, card, index) => (
    Math.abs(card.offsetLeft - rail.scrollLeft) < Math.abs(cards[nearest].offsetLeft - rail.scrollLeft)
      ? index
      : nearest
  ), 0);

  const update = (): void => {
    updateFrame = 0;
    activeIndex = nearestCardIndex();
    const maxScroll = Math.max(1, rail.scrollWidth - rail.clientWidth);
    const minimum = 1 / cards.length;
    const ratio = minimum + Math.min(1, rail.scrollLeft / maxScroll) * (1 - minimum);
    position.textContent = `${activeIndex + 1} / ${cards.length}`;
    progress.style.transform = `scaleX(${ratio})`;
    previous.disabled = rail.scrollLeft <= 2;
    next.disabled = rail.scrollLeft >= maxScroll - 2;
  };

  const requestUpdate = (): void => {
    if (updateFrame) return;
    updateFrame = requestAnimationFrame(update);
  };

  const showCard = (index: number): void => {
    activeIndex = Math.max(0, Math.min(cards.length - 1, index));
    rail.scrollTo({
      left: cards[activeIndex].offsetLeft,
      behavior: reducedMotion.matches ? 'auto' : 'smooth',
    });
  };

  previous.addEventListener('click', () => showCard(nearestCardIndex() - 1));
  next.addEventListener('click', () => showCard(nearestCardIndex() + 1));
  rail.addEventListener('scroll', requestUpdate, { passive: true });
  rail.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    showCard(nearestCardIndex() + (event.key === 'ArrowRight' ? 1 : -1));
  });
  window.addEventListener('resize', requestUpdate, { passive: true });
  update();
}

document.querySelectorAll<HTMLElement>('[data-shot-rail]').forEach(mountShotRail);

// The landing's versus wall (brand-ui BUI-W2): the time-of-day buttons show the duels filmed at that hour.
function mountVersusFilter(section: HTMLElement): void {
  const buttons = [...section.querySelectorAll<HTMLButtonElement>('[data-versus-filter]')];
  const tiles = [...section.querySelectorAll<HTMLElement>('.vs-tile[data-hour]')];
  for (const button of buttons) {
    button.addEventListener('click', () => {
      const hour = button.dataset.versusFilter || 'all';
      for (const other of buttons) other.setAttribute('aria-pressed', String(other === button));
      for (const tile of tiles) tile.hidden = hour !== 'all' && tile.dataset.hour !== hour;
    });
  }
}

document.querySelectorAll<HTMLElement>('#versus').forEach(mountVersusFilter);

interface FleetFeature {
  readonly name: string; readonly flag: string; readonly tier: string; readonly cal: number; readonly pen: number;
  readonly poster: string; readonly gallery: string; readonly drive: string;
}

// The landing's fleet wall: pointing at or focusing a tank's card shows its take, flag and facts in the feature panel;
// the card itself opens the vehicle's Gallery dossier. The panel's box never changes size.
function mountFleetFeature(section: HTMLElement): void {
  const panel = section.querySelector<HTMLElement>('[data-fleet-feature]');
  const cards = [...section.querySelectorAll<HTMLAnchorElement>('a[data-feature]')];
  if (!panel || !cards.length) return;
  const fact = <T extends Element>(name: string): T | null => panel.querySelector<T>(`[data-fact="${name}"]`);
  const show = (card: HTMLAnchorElement): void => {
    let feature: FleetFeature;
    try { feature = JSON.parse(card.dataset.feature || '') as FleetFeature; } catch { return; }
    for (const other of cards) other.classList.toggle('is-featured', other === card);
    const poster = fact<HTMLImageElement>('poster');
    if (poster && poster.getAttribute('src') !== feature.poster) poster.src = feature.poster;
    const name = fact<HTMLElement>('name');
    if (name) name.textContent = feature.name;
    panel.querySelector('.fleet-feature__flag use')?.setAttribute('href', `#f-${feature.flag}`);
    const values: Record<string, string> = { tier: feature.tier, caliber: String(feature.cal), penetration: String(feature.pen) };
    for (const [key, value] of Object.entries(values)) { const node = fact<HTMLElement>(key); if (node) node.textContent = value; }
    fact<HTMLAnchorElement>('gallery')?.setAttribute('href', feature.gallery);
    fact<HTMLAnchorElement>('drive')?.setAttribute('href', feature.drive);
  };
  for (const card of cards) {
    card.addEventListener('pointerenter', () => show(card));
    card.addEventListener('focus', () => show(card));
  }
  cards[0].classList.add('is-featured');
}

document.querySelectorAll<HTMLElement>('#fleet').forEach(mountFleetFeature);

// The hero's trailer button plays the trailer where the trailers row shows it (a click, so it plays with its sound).
document.querySelectorAll<HTMLAnchorElement>('[data-trailer-open]').forEach((link) => {
  link.addEventListener('click', (event) => {
    const video = document.querySelector<HTMLVideoElement>('#trailers video[data-trailer]');
    if (!video) return;
    event.preventDefault();
    video.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    if (video.dataset.poster && !video.poster) video.poster = video.dataset.poster;
    void video.play().catch(() => {});
  });
});

// The landing page's trailers row: each trailer plays on a click (controls, preload none) with its sound, so nothing of
// it loads before the row nears the viewport, when its poster does; starting one pauses the others.
function mountTrailerRow(row: HTMLElement): void {
  const videos = [...row.querySelectorAll<HTMLVideoElement>('video[data-trailer]')];
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const video = entry.target as HTMLVideoElement;
      if (video.dataset.poster && !video.poster) video.poster = video.dataset.poster;
      observer.unobserve(video);
    }
  }, { rootMargin: '25% 0px' });
  for (const video of videos) {
    observer.observe(video);
    video.addEventListener('play', () => {
      for (const other of videos) if (other !== video) other.pause();
      video.closest('figure')?.classList.add('is-playing');
    });
    video.addEventListener('pause', () => video.closest('figure')?.classList.remove('is-playing'));
  }
}

document.querySelectorAll<HTMLElement>('[data-trailer-row]').forEach(mountTrailerRow);

function mountDeferredImage(image: HTMLImageElement): void {
  const observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    const src = image.dataset.src || '';
    delete image.dataset.src;
    observer.disconnect();
    if (savingPictures) void savingPictures.then(({ dataSaverSrc }) => { image.src = dataSaverSrc(src); });
    else image.src = src;
  }, { rootMargin: '80px 20%' });
  observer.observe(image);
}

document.querySelectorAll<HTMLImageElement>('img[data-deferred-src]').forEach((image) => {
  image.dataset.src = image.dataset.deferredSrc || '';
  delete image.dataset.deferredSrc;
  mountDeferredImage(image);
});

// The home page's mode cards carry the battle setup's own mode icons (as GAME_MODE_DEFINITIONS in src/sim/matchModes.ts
// names them) in [data-ui-icon] slots, which the shared public nav (publicNav.ts) fills from the shared icon set.

// The Play hand-off (brand-ui SPEC 8.3): a plain click on a link into the game (/ or /cn/) stops every media transfer
// before the navigation starts, so the game's boot gets the whole pipe; hover or focus on one prefetches the game's
// entry chunk (named at build in <meta name="cot-game-entry">), never while a video downloads or data is saved.
const gameEntryChunk = document.querySelector<HTMLMetaElement>('meta[name="cot-game-entry"]')?.content || '';
const gameLink = (target: EventTarget | null): HTMLAnchorElement | null => {
  const link = target instanceof Element ? target.closest<HTMLAnchorElement>('a[href]') : null;
  if (!link || (link.target && link.target !== '_self')) return null;
  const url = new URL(link.href, location.href);
  return url.origin === location.origin && /^\/(?:cn\/?)?$/.test(url.pathname) ? link : null;
};
let gameEntryPrefetched = false;
const prefetchGameEntry = (event: Event): void => {
  if (gameEntryPrefetched || !gameEntryChunk || !gameLink(event.target)) return;
  if (media ? !media.prefetchGameEntry(gameEntryChunk) : savingData()) return;
  if (!media) {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = gameEntryChunk;
    document.head.append(link);
  }
  gameEntryPrefetched = true;
};
document.addEventListener('pointerover', prefetchGameEntry, { passive: true });
document.addEventListener('focusin', prefetchGameEntry);
document.addEventListener('click', (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (!gameLink(event.target)) return;
  if (media) media.abortPageMedia();
  else window.dispatchEvent(new Event('cot:media-handoff'));
});
