import { mountBattleReels } from './battleReels.ts';

const navLinks = [...document.querySelectorAll<HTMLAnchorElement>('.docs-toc a[href^="#"]')];
const sections = navLinks.map((link) => document.querySelector(link.hash))
  .filter((section): section is Element => section !== null);

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
function announce(message: string): void {
  const toast = document.querySelector<HTMLElement>('#docsToast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 1600);
}

document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((button) => {
  button.addEventListener('click', async () => {
    const selector = button.dataset.copy;
    if (!selector) return;
    const target = document.querySelector<HTMLElement>(selector);
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
  const toc = document.querySelector<HTMLElement>('.docs-toc');
  if (!toc) return;
  const open = toc.classList.toggle('open');
  document.querySelector<HTMLElement>('#docsMenu')?.setAttribute('aria-expanded', String(open));
});

navLinks.forEach((link) => link.addEventListener('click', () => {
  document.querySelector<HTMLElement>('.docs-toc')?.classList.remove('open');
  document.querySelector('#docsMenu')?.setAttribute('aria-expanded', 'false');
}));

const archiveDialog = document.querySelector<HTMLDialogElement>('#docsArchive');
const archiveOpen = document.querySelector<HTMLButtonElement>('#docsArchiveOpen');
const archiveClose = document.querySelector<HTMLButtonElement>('#docsArchiveClose');
let archiveMountPromise: Promise<unknown> | null = null;
let archiveMotionPromise: Promise<unknown> | null = null;

function stopArchiveMotion(): void {
  archiveDialog?.querySelectorAll<HTMLVideoElement>('video').forEach((video) => video.pause());
}

function mountArchiveMotionInfo(): void {
  archiveMotionPromise ??= Promise.all([
    import('../presentation/captureRecipes.ts'),
    import('../ui/contextInfo.ts'),
  ]).then(async ([{ loadCaptureRecipes, recipeForMedia }, { createInfoButton }]) => {
    const catalog = await loadCaptureRecipes();
    archiveDialog?.querySelectorAll<HTMLVideoElement>('.docs-motion-grid video').forEach((video) => {
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
  }).catch((error: unknown) => {
    archiveMotionPromise = null;
    announce(error instanceof Error ? error.message : String(error));
  });
}

archiveOpen?.addEventListener('click', () => {
  if (!archiveDialog) return;
  archiveDialog.showModal();
  archiveDialog.querySelectorAll<HTMLVideoElement>('video').forEach((video) => {
    video.play().catch(() => {});
  });
  archiveMountPromise ??= import('../presentation/mediaArchive.ts')
    .then(({ mountMediaArchive }) => mountMediaArchive(
      document.querySelector('#docsArchiveBody'),
      { mode: 'wall', limit: 88, filters: false },
    ))
    .catch((error: unknown) => {
      archiveMountPromise = null;
      announce(error instanceof Error ? error.message : String(error));
    });
  mountArchiveMotionInfo();
});
archiveClose?.addEventListener('click', () => archiveDialog?.close());
archiveDialog?.addEventListener('close', stopArchiveMotion);
archiveDialog?.addEventListener('click', (event) => {
  if (event.target === archiveDialog) archiveDialog.close();
});

mountBattleReels();
