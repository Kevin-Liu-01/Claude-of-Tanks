import { installResponsiveLayout } from '../ui/responsiveLayout.ts';
import { t } from '../ui/i18n.ts';
import '../ui/i18nCatalog.ts';

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
  deviceMemory?: number;
}

const deviceNavigator = navigator as NavigatorWithDeviceHints;
const networkConnection = (): NetworkInformation | undefined =>
  deviceNavigator.connection || deviceNavigator.mozConnection || deviceNavigator.webkitConnection;

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
  const limitsMotion = (): boolean => reducedMotion.matches || isCompactSurface() || !!connection?.saveData;
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

function mountDeferredImage(image: HTMLImageElement): void {
  const observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    image.src = image.dataset.src || '';
    delete image.dataset.src;
    observer.disconnect();
  }, { rootMargin: '80px 20%' });
  observer.observe(image);
}

document.querySelectorAll<HTMLImageElement>('img[data-deferred-src]').forEach((image) => {
  image.dataset.src = image.dataset.deferredSrc || '';
  delete image.dataset.deferredSrc;
  mountDeferredImage(image);
});

function mountViewportVideo(video: HTMLVideoElement): void {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const connection = networkConnection();
  const source = video.querySelector<HTMLSourceElement>('source[data-src]');
  if (!source) return;

  const lowPowerDevice = typeof deviceNavigator.deviceMemory === 'number'
    && Number.isFinite(deviceNavigator.deviceMemory) && deviceNavigator.deviceMemory <= 4;
  const releaseGraceMs = (): number => {
    if (document.hidden) return 5000;
    if (lowPowerDevice || connection?.saveData) return 8000;
    return isCompactSurface() ? 15000 : 30000;
  };
  const manualPlayback = (): boolean => reducedMotion.matches || !!connection?.saveData
    || /(^|-)2g$/.test(connection?.effectiveType || '')
    || (isCompactSurface() && lowPowerDevice);
  let visible = false;
  let loaded = false;
  let releaseTimer = 0;
  let control: HTMLButtonElement | null = null;

  const setControlVisible = (show: boolean): void => {
    if (control) control.hidden = !show;
  };

  const loadSource = (): void => {
    if (loaded) return;
    const mobileSource = isCompactSurface() ? source.dataset.mobileSrc : undefined;
    source.src = mobileSource || source.dataset.src || '';
    source.type = mobileSource ? (source.dataset.mobileType || 'video/mp4') : (source.dataset.type || '');
    video.load();
    loaded = true;
  };

  const releaseSource = (): void => {
    clearTimeout(releaseTimer);
    releaseTimer = 0;
    video.pause();
    source.removeAttribute('src');
    video.load();
    loaded = false;
    video.classList.remove('is-playing');
    setControlVisible(manualPlayback());
  };

  const sync = (): void => {
    clearTimeout(releaseTimer);
    releaseTimer = 0;
    if (!visible || document.hidden) {
      video.pause();
      // A 1.2 s teardown made normal scroll reversals repeatedly reset the
      // fetch/demux/decode pipeline. Retain the paused source through a human
      // scroll-back window, then reclaim it sooner on constrained devices.
      if (loaded) releaseTimer = window.setTimeout(releaseSource, releaseGraceMs());
      return;
    }
    if (manualPlayback()) {
      setControlVisible(!loaded || video.paused);
      return;
    }
    loadSource();
    video.play().catch(() => {});
  };

  const warmObserver = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    if (video.dataset.poster && !video.poster) {
      video.poster = video.dataset.poster;
    }
    // Begin transfer just before the section reaches the viewport, but keep
    // playback on the separate true-viewport observer below. One expanded
    // observer cannot do both: its threshold may be crossed before the real
    // viewport and never fire again at the screen edge.
    if (!loaded && !manualPlayback()) loadSource();
  }, { rootMargin: '25% 0px', threshold: 0 });

  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting && entry.intersectionRatio >= 0.12;
    sync();
  }, { threshold: [0, 0.12, 0.55] });

  if (manualPlayback()) {
    control = document.createElement('button');
    control.type = 'button';
    control.className = 'v5-video-control';
    control.textContent = t('publicPages.video.playButton');
    const videoLabel = video.dataset.label || 'video';
    control.setAttribute('aria-label', t('publicPages.video.playAria', { label: videoLabel }));
    control.addEventListener('click', () => {
      loadSource();
      video.play().then(() => setControlVisible(false)).catch(() => setControlVisible(true));
    });
    video.parentElement?.append(control);
  }

  warmObserver.observe(video);
  observer.observe(video);
  video.addEventListener('play', () => video.classList.add('is-playing'));
  video.addEventListener('pause', () => video.classList.remove('is-playing'));
  reducedMotion.addEventListener('change', sync);
  window.addEventListener('cot:layoutchange', sync);
  document.addEventListener('visibilitychange', sync);
}

document.querySelectorAll<HTMLVideoElement>('[data-autoplay-video]').forEach(mountViewportVideo);
