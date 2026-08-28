import { installResponsiveLayout } from '../ui/responsiveLayout.ts';

const responsiveLayout = installResponsiveLayout();
const isCompactSurface = () => ['phone', 'compact'].includes(responsiveLayout.snapshot()?.widthBand);

// The media archive is used by docs, not the landing page. Keep its manifest,
// rendering code, and CSS out of the home critical path.
if (document.querySelector('[data-media-archive]')) {
  Promise.all([
    import('./mediaArchive.css'),
    import('./mediaArchive.js'),
  ]).then(([, { autoMountMediaArchives }]) => autoMountMediaArchives());
}

function mountHeroRail(root) {
  const slides = [...root.querySelectorAll('[data-hero-slide]')];
  if (slides.length < 2) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const limitsMotion = () => reducedMotion.matches || isCompactSurface() || connection?.saveData;
  let activeIndex = Math.max(0, slides.findIndex((slide) => slide.classList.contains('is-active')));
  let advanceTimer = 0;

  const stopTimer = () => {
    clearTimeout(advanceTimer);
    advanceTimer = 0;
  };

  const expose = (index) => {
    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === index;
      slide.classList.toggle('is-active', active);
      slide.setAttribute('aria-hidden', String(!active));
    });
    activeIndex = index;
  };

  const hydrate = async (slide) => {
    if (!slide?.dataset.src || slide.currentSrc) return;
    slide.src = slide.dataset.src;
    delete slide.dataset.src;
    try { await slide.decode(); } catch (_) {}
  };

  const scheduleAdvance = () => {
    stopTimer();
    if (limitsMotion() || document.hidden) return;
    advanceTimer = window.setTimeout(advance, 5600);
  };

  const advance = async () => {
    stopTimer();
    if (limitsMotion() || document.hidden) return;
    const nextIndex = (activeIndex + 1) % slides.length;
    await hydrate(slides[nextIndex]);
    if (limitsMotion() || document.hidden) return;
    expose(nextIndex);
    scheduleAdvance();
  };

  const applyMotionPreference = () => {
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

function mountShotRail(rail) {
  const section = rail.closest('.v5-authored');
  const cards = [...rail.querySelectorAll('figure')];
  const previous = section?.querySelector('[data-shot-previous]');
  const next = section?.querySelector('[data-shot-next]');
  const position = section?.querySelector('[data-shot-position]');
  const progress = section?.querySelector('[data-shot-progress]');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  if (!section || cards.length < 2 || !previous || !next || !position || !progress) return;

  let activeIndex = 0;
  let updateFrame = 0;

  const nearestCardIndex = () => cards.reduce((nearest, card, index) => (
    Math.abs(card.offsetLeft - rail.scrollLeft) < Math.abs(cards[nearest].offsetLeft - rail.scrollLeft)
      ? index
      : nearest
  ), 0);

  const update = () => {
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

  const requestUpdate = () => {
    if (updateFrame) return;
    updateFrame = requestAnimationFrame(update);
  };

  const showCard = (index) => {
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

document.querySelectorAll('[data-shot-rail]').forEach(mountShotRail);

function mountDeferredImage(image) {
  const observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    image.src = image.dataset.src;
    delete image.dataset.src;
    observer.disconnect();
  }, { rootMargin: '80px 20%' });
  observer.observe(image);
}

document.querySelectorAll('img[data-deferred-src]').forEach((image) => {
  image.dataset.src = image.dataset.deferredSrc;
  delete image.dataset.deferredSrc;
  mountDeferredImage(image);
});

function mountViewportVideo(video) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const source = video.querySelector('source[data-src]');
  if (!source) return;

  const lowPowerDevice = Number.isFinite(navigator.deviceMemory) && navigator.deviceMemory <= 4;
  const releaseGraceMs = () => {
    if (document.hidden) return 5000;
    if (lowPowerDevice || connection?.saveData) return 8000;
    return isCompactSurface() ? 15000 : 30000;
  };
  const manualPlayback = () => reducedMotion.matches || connection?.saveData
    || /(^|-)2g$/.test(connection?.effectiveType || '')
    || (isCompactSurface() && lowPowerDevice);
  let visible = false;
  let loaded = false;
  let releaseTimer = 0;
  let control = null;

  const setControlVisible = (show) => {
    if (control) control.hidden = !show;
  };

  const loadSource = () => {
    if (loaded) return;
    const useMobileProxy = isCompactSurface() && source.dataset.mobileSrc;
    source.src = useMobileProxy ? source.dataset.mobileSrc : source.dataset.src;
    source.type = useMobileProxy ? (source.dataset.mobileType || 'video/mp4') : source.dataset.type;
    video.load();
    loaded = true;
  };

  const releaseSource = () => {
    clearTimeout(releaseTimer);
    releaseTimer = 0;
    video.pause();
    source.removeAttribute('src');
    video.load();
    loaded = false;
    video.classList.remove('is-playing');
    setControlVisible(manualPlayback());
  };

  const sync = () => {
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
    control.textContent = 'Play video';
    control.setAttribute('aria-label', `Play ${video.dataset.label || 'video'}`);
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

document.querySelectorAll('[data-autoplay-video]').forEach(mountViewportVideo);
