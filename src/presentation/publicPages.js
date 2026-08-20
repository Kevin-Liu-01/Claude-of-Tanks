import './mediaArchive.css';
import { autoMountMediaArchives } from './mediaArchive.js';

autoMountMediaArchives();

function mountHeroRail(root) {
  const videos = [...root.querySelectorAll('video')];
  if (videos.length === 0) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  if (videos.length === 1) {
    const [video] = videos;
    const applyMotionPreference = () => {
      if (reducedMotion.matches || document.hidden) {
        video.pause();
        video.currentTime = 0;
        return;
      }
      video.play().catch(() => {});
    };
    reducedMotion.addEventListener('change', applyMotionPreference);
    document.addEventListener('visibilitychange', applyMotionPreference);
    applyMotionPreference();
    return;
  }

  let activeIndex = Math.max(0, videos.findIndex((video) => video.classList.contains('is-active')));
  let advanceTimer = 0;
  let transitionToken = 0;

  const stopTimer = () => {
    clearTimeout(advanceTimer);
    advanceTimer = 0;
  };

  const expose = (index) => {
    videos.forEach((video, videoIndex) => {
      const active = videoIndex === index;
      video.classList.toggle('is-active', active);
      video.setAttribute('aria-hidden', String(!active));
      if (!active) video.pause();
    });
    activeIndex = index;
  };

  const scheduleAdvance = () => {
    stopTimer();
    if (reducedMotion.matches || document.hidden) return;
    const current = videos[activeIndex];
    const remainingMs = Number.isFinite(current.duration)
      ? Math.max(800, (current.duration - current.currentTime) * 1000)
      : 6000;
    advanceTimer = window.setTimeout(() => advance(), remainingMs + 80);
  };

  const advance = async () => {
    stopTimer();
    if (reducedMotion.matches || document.hidden) return;
    const token = ++transitionToken;
    const nextIndex = (activeIndex + 1) % videos.length;
    const next = videos[nextIndex];
    next.currentTime = 0;
    next.preload = 'auto';
    try {
      await next.play();
      if (token !== transitionToken) return;
      expose(nextIndex);
      scheduleAdvance();
    } catch {
      window.setTimeout(advance, 800);
    }
  };

  videos.forEach((video) => {
    video.addEventListener('ended', advance);
    video.addEventListener('playing', () => {
      if (video === videos[activeIndex]) scheduleAdvance();
    });
  });

  const applyMotionPreference = () => {
    transitionToken += 1;
    stopTimer();
    if (reducedMotion.matches) {
      videos.forEach((video) => video.pause());
      videos[activeIndex].currentTime = 0;
      return;
    }
    videos[activeIndex].play().then(scheduleAdvance).catch(() => {});
  };
  reducedMotion.addEventListener('change', applyMotionPreference);
  document.addEventListener('visibilitychange', applyMotionPreference);
  expose(activeIndex);
  applyMotionPreference();
}

document.querySelectorAll('[data-hero-rail]').forEach(mountHeroRail);
