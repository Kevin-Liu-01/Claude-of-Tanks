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
const videoLabels = (playing: boolean, video: HTMLVideoElement): string => t(playing ? 'publicPages.video.pauseAria'
  : 'publicPages.video.playAria', { label: video.dataset.i18nLabel ? t(video.dataset.i18nLabel) : video.dataset.label || '' });
const videoTips = (playing: boolean): string => t(playing ? 'publicPages.video.pauseTip' : 'publicPages.video.playTip');
const mediaModule = pageVideos.length
  ? Promise.all([import('./mediaPlayer.ts'), import('./mediaPlayer.css')]).then(([module]) => {
    media = module;
    module.mountMediaPlayers(pageVideos, videoLabels, videoTips);
    return module;
  })
  : null;
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



// The landing's segmented controls (the kit's cot-c-seg, a radio group): a click or an arrow key picks an option, the
// group keeps one tab stop on the picked option.
function mountSegment(group: HTMLElement, pick: (option: HTMLButtonElement) => void): void {
  const options = [...group.querySelectorAll<HTMLButtonElement>('.cot-c-seg__opt')];
  const choose = (option: HTMLButtonElement, focus = false): void => {
    for (const other of options) {
      other.setAttribute('aria-checked', String(other === option));
      other.tabIndex = other === option ? 0 : -1;
    }
    if (focus) option.focus();
    pick(option);
  };
  options.forEach((option, i) => {
    option.tabIndex = option.getAttribute('aria-checked') === 'true' ? 0 : -1;
    option.addEventListener('click', () => choose(option));
    option.addEventListener('keydown', (event) => {
      const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      choose(options[(i + step + options.length) % options.length], true);
    });
  });
}

// The landing's versus wall (02): the time-of-day options show the duels filmed at that hour.
function mountVersusFilter(section: HTMLElement): void {
  const group = section.querySelector<HTMLElement>('.cot-c-seg');
  const tiles = [...section.querySelectorAll<HTMLElement>('.vs-tile[data-hour]')];
  if (!group) return;
  mountSegment(group, (option) => {
    const hour = option.dataset.versusFilter || 'all';
    for (const tile of tiles) tile.hidden = hour !== 'all' && tile.dataset.hour !== hour;
  });
}

document.querySelectorAll<HTMLElement>('#versus').forEach(mountVersusFilter);

// The landing's fleet wall (03): its plate, the playing take's progress and the facets load beside the page
// (homeFleet.ts), so the other public pages and the landing's first bytes carry none of it.
const fleetSection = document.querySelector<HTMLElement>('#fleet');
if (fleetSection) void import('./homeFleet.ts').then(({ mountFleet }) => mountFleet(fleetSection, mediaModule, videoLabels));

// The battlefields rail (03): the landscape options show the maps of that landscape, the first of them leading.
function mountMapFilter(section: HTMLElement): void {
  const group = section.querySelector<HTMLElement>('.cot-c-seg');
  const rail = section.querySelector<HTMLElement>('[data-map-rail]');
  const cards = [...section.querySelectorAll<HTMLElement>('.bf-card[data-regions]')];
  if (!group || !rail) return;
  mountSegment(group, (option) => {
    const region = option.dataset.mapFilter || 'all';
    let lead = true;
    for (const card of cards) {
      card.hidden = region !== 'all' && !(card.dataset.regions || '').split(' ').includes(region);
      card.classList.toggle('is-lead', !card.hidden && lead);
      if (!card.hidden) lead = false;
    }
    rail.scrollLeft = 0;
  });
}

document.querySelectorAll<HTMLElement>('#battlefields').forEach(mountMapFilter);

// The modes and mechanics: the switch shows one set of tiles; a hidden set's lazy pictures load when it first shows.
function mountPlayTabs(section: HTMLElement): void {
  const group = section.querySelector<HTMLElement>('.cot-c-seg');
  const panels = [...section.querySelectorAll<HTMLElement>('[data-play-panel]')];
  if (!group) return;
  mountSegment(group, (option) => {
    const tab = option.dataset.playTab || 'modes';
    for (const panel of panels) panel.hidden = panel.dataset.playPanel !== tab;
  });
}

document.querySelectorAll<HTMLElement>('#modes').forEach(mountPlayTabs);

// The screenshots strip: its arrows step it by most of a screen and rest at its ends. The markup opens with the previous
// arrow disabled; the strip's own scroll keeps both current, so nothing reads layout as the page loads.
function mountShotsRail(section: HTMLElement): void {
  const rail = section.querySelector<HTMLElement>('[data-shots-rail]');
  const previous = section.querySelector<HTMLButtonElement>('[data-rail-prev]');
  const next = section.querySelector<HTMLButtonElement>('[data-rail-next]');
  if (!rail || !previous || !next) return;
  let frame = 0;
  const update = (): void => {
    frame = 0;
    previous.disabled = rail.scrollLeft <= 2;
    next.disabled = rail.scrollLeft >= rail.scrollWidth - rail.clientWidth - 2;
  };
  const step = (direction: number): void => rail.scrollBy({ left: direction * rail.clientWidth * 0.8,
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  previous.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  rail.addEventListener('scroll', () => { if (!frame) frame = requestAnimationFrame(update); }, { passive: true });
}

document.querySelectorAll<HTMLElement>('#screenshots').forEach(mountShotsRail);

// Play now (Enter): Enter anywhere on the landing that is not a control follows the hero's Play link.
const heroPlay = document.querySelector<HTMLAnchorElement>('[data-hero-play]');
if (heroPlay) {
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target && target !== document.body && target.closest('a,button,input,select,textarea,summary,video,[contenteditable],[tabindex]')) return;
    heroPlay.click();
  });
}

// The landing's motion stage: the reel loops muted until a cut button swaps in that trailer cut, which plays with its
// sound on that click (controls, preload none: nothing of a trailer loads before then, its poster as it shows).
function mountTrailerStage(stage: HTMLElement): void {
  const reel = stage.querySelector<HTMLVideoElement>('video[data-autoplay-video]');
  const cuts = [...stage.querySelectorAll<HTMLButtonElement>('[data-trailer-cut]')];
  const videos = [...stage.querySelectorAll<HTMLVideoElement>('video[data-trailer]')];
  const show = (index: number): HTMLVideoElement => {
    cuts.forEach((cut, i) => cut.setAttribute('aria-pressed', String(i === index)));
    videos.forEach((video, i) => {
      if (i === index) return;
      video.pause();
      video.hidden = true;
    });
    if (reel) {
      reel.pause();
      reel.hidden = true;
    }
    stage.classList.add('has-cut');
    const video = videos[index];
    if (video.dataset.poster && !video.poster) video.poster = video.dataset.poster;
    video.hidden = false;
    return video;
  };
  cuts.forEach((cut, i) => cut.addEventListener('click', () => void show(i).play().catch(() => {})));
  for (const video of videos) {
    video.addEventListener('play', () => stage.classList.add('is-playing'));
    video.addEventListener('pause', () => stage.classList.remove('is-playing'));
  }
}

document.querySelectorAll<HTMLElement>('[data-trailer-stage]').forEach(mountTrailerStage);

// The hero's trailer button plays the trailer on the motion stage (its first cut: a click, so it plays with its sound).
document.querySelectorAll<HTMLAnchorElement>('[data-trailer-open]').forEach((link) => {
  link.addEventListener('click', (event) => {
    const cut = document.querySelector<HTMLButtonElement>('#trailers [data-trailer-cut]');
    if (!cut) return;
    event.preventDefault();
    cut.closest('figure')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    cut.click();
  });
});

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
