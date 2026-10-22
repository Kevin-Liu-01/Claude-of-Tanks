import { installResponsiveLayout } from '../ui/responsiveLayout.ts';
import { t } from '../ui/i18n.ts';

const responsiveLayout = installResponsiveLayout();
const isCompactSurface = (): boolean => {
  const widthBand = responsiveLayout.snapshot()?.widthBand;
  return widthBand === 'phone' || widthBand === 'compact';
};

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

function mountHeroRail(root: Element): void {
  const slides = [...root.querySelectorAll<HTMLImageElement>('[data-hero-slide]')];
  if (slides.length < 2) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const connection = networkConnection();
  let handedOff = false;
  const limitsMotion = (): boolean => handedOff || reducedMotion.matches || isCompactSurface() || savingData();
  let activeIndex = Math.max(0, slides.findIndex((slide) => slide.classList.contains('is-active')));
  let advanceTimer = 0;

  const stopTimer = (): void => {
    clearTimeout(advanceTimer);
    advanceTimer = 0;
  };

  const expose = (index: number): void => {
    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === index;
      slide.classList.toggle('is-active', active);
      slide.setAttribute('aria-hidden', String(!active));
    });
    activeIndex = index;
  };

  const hydrate = async (slide: HTMLImageElement | undefined): Promise<void> => {
    if (!slide?.dataset.src || slide.currentSrc) return;
    slide.src = slide.dataset.src;
    delete slide.dataset.src;
    try { await slide.decode(); } catch (_) {}
  };

  const scheduleAdvance = (): void => {
    stopTimer();
    if (limitsMotion() || document.hidden) return;
    advanceTimer = window.setTimeout(advance, 5600);
  };

  const advance = async (): Promise<void> => {
    stopTimer();
    if (limitsMotion() || document.hidden) return;
    const nextIndex = (activeIndex + 1) % slides.length;
    await hydrate(slides[nextIndex]);
    if (limitsMotion() || document.hidden) return;
    expose(nextIndex);
    scheduleAdvance();
  };

  const applyMotionPreference = (): void => {
    stopTimer();
    if (limitsMotion()) expose(0);
    else scheduleAdvance();
  };
  reducedMotion.addEventListener('change', applyMotionPreference);
  window.addEventListener('cot:layoutchange', applyMotionPreference);
  connection?.addEventListener?.('change', applyMotionPreference);
  document.addEventListener('visibilitychange', applyMotionPreference);
  window.addEventListener('cot:media-handoff', () => { handedOff = true; stopTimer(); });
  expose(activeIndex);
  applyMotionPreference();
}

document.querySelectorAll('[data-hero-rail]').forEach(mountHeroRail);

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
