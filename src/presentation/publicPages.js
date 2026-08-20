import './mediaArchive.css';
import { autoMountMediaArchives } from './mediaArchive.js';

autoMountMediaArchives();

function mountHeroRail(root) {
  const slides = [...root.querySelectorAll('[data-hero-slide]')];
  if (slides.length < 2) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
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

  const scheduleAdvance = () => {
    stopTimer();
    if (reducedMotion.matches || document.hidden) return;
    advanceTimer = window.setTimeout(advance, 5600);
  };

  const advance = () => {
    stopTimer();
    if (reducedMotion.matches || document.hidden) return;
    const nextIndex = (activeIndex + 1) % slides.length;
    expose(nextIndex);
    scheduleAdvance();
  };

  const applyMotionPreference = () => {
    stopTimer();
    if (reducedMotion.matches) expose(0);
    else scheduleAdvance();
  };
  reducedMotion.addEventListener('change', applyMotionPreference);
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

function mountViewportVideo(video) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let visible = false;

  const sync = () => {
    if (!visible || reducedMotion.matches || document.hidden) {
      video.pause();
      return;
    }
    video.play().catch(() => {});
  };

  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting && entry.intersectionRatio >= 0.18;
    if (visible && video.preload === 'none') video.preload = 'metadata';
    sync();
  }, { threshold: [0, 0.18, 0.55] });

  observer.observe(video);
  reducedMotion.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
}

document.querySelectorAll('[data-autoplay-video]').forEach(mountViewportVideo);
