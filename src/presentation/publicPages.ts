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
if (pageVideos.length) {
  void Promise.all([import('./mediaPlayer.ts'), import('./mediaPlayer.css')]).then(([module]) => {
    media = module;
    module.mountMediaPlayers(pageVideos, videoLabels, videoTips);
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



// The landing's segmented control (the kit's cot-c-seg, a radio group): a click or an arrow key picks an option, the
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

// How it plays: the switch shows one rail (the modes or a set of mechanics); the arrows step the shown rail by most of a
// screen and rest at its ends. The markup opens with the previous arrow disabled; the rail's own scroll keeps both current,
// so nothing reads layout as the page loads.
function mountPlay(section: HTMLElement): void {
  const group = section.querySelector<HTMLElement>('.cot-c-seg');
  const rails = [...section.querySelectorAll<HTMLElement>('[data-play-panel]')];
  const previous = section.querySelector<HTMLButtonElement>('[data-rail-prev]');
  const next = section.querySelector<HTMLButtonElement>('[data-rail-next]');
  if (!group || !previous || !next) return;
  let shown = rails.find((rail) => !rail.hidden) ?? rails[0];
  let frame = 0;
  const update = (): void => {
    frame = 0;
    previous.disabled = shown.scrollLeft <= 2;
    next.disabled = shown.scrollLeft >= shown.scrollWidth - shown.clientWidth - 2;
    // the rail's edge fades follow its ends (home.css .play-rail)
    shown.toggleAttribute('data-scrolled', !previous.disabled);
    shown.toggleAttribute('data-end', next.disabled);
  };
  const step = (direction: number): void => shown.scrollBy({ left: direction * shown.clientWidth * 0.8,
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  previous.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  for (const rail of rails) rail.addEventListener('scroll', () => { if (rail === shown && !frame) frame = requestAnimationFrame(update); }, { passive: true });
  mountSegment(group, (option) => {
    const tab = option.dataset.playTab || 'modes';
    for (const rail of rails) rail.hidden = rail.dataset.playPanel !== tab;
    shown = rails.find((rail) => !rail.hidden) ?? shown;
    shown.scrollLeft = 0;
    update();
  });
}

document.querySelectorAll<HTMLElement>('#modes').forEach(mountPlay);

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

// The hero reel (heroReel.ts): its clips take their turns once the page has loaded and gone idle, so the poster, the
// page's LCP picture, never shares the pipe with a clip.
const reelHero = document.querySelector<HTMLElement>('[data-hero-reel]');
if (reelHero) {
  const start = (): void => {
    void import('./heroReel.ts').then(({ mountHeroReel }) => mountHeroReel(reelHero,
      () => ({ pause: t('publicPages.reel.pauseAria'), play: t('publicPages.reel.playAria') })));
  };
  const idle = (): void => {
    if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 2000 });
    else setTimeout(start, 200);
  };
  if (document.readyState === 'complete') idle();
  else addEventListener('load', idle, { once: true });
}

// The trailer plays in the hero's dialog with its sound, on the viewer's press: its files are named only then.
const trailerDialog = document.querySelector<HTMLDialogElement>('[data-trailer-dialog]');
const trailerVideo = trailerDialog?.querySelector<HTMLVideoElement>('video[data-trailer]') ?? null;
if (trailerDialog && trailerVideo) {
  document.querySelectorAll<HTMLButtonElement>('[data-trailer-open]').forEach((button) => button.addEventListener('click', () => {
    const named = [...trailerVideo.querySelectorAll<HTMLSourceElement>('source[data-src]')];
    for (const source of named) {
      source.src = source.dataset.src || '';
      delete source.dataset.src;
    }
    if (trailerVideo.dataset.poster && !trailerVideo.poster) trailerVideo.poster = trailerVideo.dataset.poster;
    if (named.length) trailerVideo.load();
    trailerDialog.showModal();
    void trailerVideo.play().catch(() => {});
  }));
  trailerDialog.querySelector('[data-trailer-close]')?.addEventListener('click', () => trailerDialog.close());
  // a press on the backdrop closes it too
  trailerDialog.addEventListener('click', (event) => { if (event.target === trailerDialog) trailerDialog.close(); });
  trailerDialog.addEventListener('close', () => trailerVideo.pause());
}

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
