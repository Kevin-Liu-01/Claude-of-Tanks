import { mountBattleReels } from './battleReels.js';

const navLinks = [...document.querySelectorAll('.docs-toc a[href^="#"]')];
const sections = navLinks.map((link) => document.querySelector(link.hash)).filter(Boolean);

const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    navLinks.forEach((link) => {
      const active = link.hash === `#${entry.target.id}`;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
}, { rootMargin: '-16% 0px -73%' });
sections.forEach((section) => observer.observe(section));

let toastTimer = 0;
function announce(message) {
  const toast = document.querySelector('#docsToast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1600);
}

document.querySelectorAll('[data-copy]').forEach((button) => {
  button.addEventListener('click', async () => {
    const target = document.querySelector(button.dataset.copy);
    if (!target) return;
    try {
      await navigator.clipboard.writeText(target.textContent.trim());
      const original = button.textContent;
      button.textContent = 'Copied';
      announce('Copied to clipboard');
      setTimeout(() => { button.textContent = original; }, 1400);
    } catch (_) {
      announce('Clipboard permission unavailable');
    }
  });
});

document.querySelector('#docsMenu')?.addEventListener('click', () => {
  const toc = document.querySelector('.docs-toc');
  const open = toc.classList.toggle('open');
  document.querySelector('#docsMenu').setAttribute('aria-expanded', String(open));
});

navLinks.forEach((link) => link.addEventListener('click', () => {
  document.querySelector('.docs-toc').classList.remove('open');
  document.querySelector('#docsMenu')?.setAttribute('aria-expanded', 'false');
}));

const archiveDialog = document.querySelector('#docsArchive');
const archiveOpen = document.querySelector('#docsArchiveOpen');
const archiveClose = document.querySelector('#docsArchiveClose');
let archiveMountPromise = null;
let archiveMotionPromise = null;

function stopArchiveMotion() {
  archiveDialog?.querySelectorAll('video').forEach((video) => video.pause());
}

function mountArchiveMotionInfo() {
  archiveMotionPromise ??= Promise.all([
    import('../presentation/captureRecipes.ts'),
    import('../ui/contextInfo.ts'),
  ]).then(async ([{ loadCaptureRecipes, recipeForMedia }, { createInfoButton }]) => {
    const catalog = await loadCaptureRecipes();
    archiveDialog.querySelectorAll('.docs-motion-grid video').forEach((video) => {
      if (video.parentElement?.classList.contains('docs-motion-item')) return;
      const source = video.currentSrc || video.querySelector('source')?.src || video.poster;
      const recipe = recipeForMedia(catalog, source);
      if (!recipe) return;
      const wrap = document.createElement('div');
      wrap.className = 'docs-motion-item';
      video.replaceWith(wrap);
      wrap.append(video, createInfoButton({
        label: 'Show the Scene Studio JSON for this video',
        title: 'Replicate this Studio video',
        json: recipe,
        image: video.poster ? {
          src: video.poster,
          alt: 'Scene Studio video frame',
          caption: 'Game-rendered Studio frame',
        } : null,
      }));
    });
  }).catch((error) => {
    archiveMotionPromise = null;
    announce(error.message);
  });
}

archiveOpen?.addEventListener('click', () => {
  archiveDialog.showModal();
  archiveDialog.querySelectorAll('video').forEach((video) => {
    video.play().catch(() => {});
  });
  archiveMountPromise ??= import('../presentation/mediaArchive.ts')
    .then(({ mountMediaArchive }) => mountMediaArchive(
      document.querySelector('#docsArchiveBody'),
      { mode: 'wall', limit: 88, filters: false },
    ))
    .catch((error) => {
      archiveMountPromise = null;
      announce(error.message);
    });
  mountArchiveMotionInfo();
});
archiveClose?.addEventListener('click', () => archiveDialog.close());
archiveDialog?.addEventListener('close', stopArchiveMotion);
archiveDialog?.addEventListener('click', (event) => {
  if (event.target === archiveDialog) archiveDialog.close();
});

mountBattleReels();
