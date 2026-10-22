import { t } from '../ui/i18n.ts';
import type { RuntimeValue } from '../runtimeTypes.ts';
import { mountBattleReels } from './battleReels.ts';
import { mountDocsIcons } from './docsIcons.ts';

mountDocsIcons();

const navLinks = [...document.querySelectorAll<HTMLAnchorElement>('.docs-toc a[href^="#"]')];
const sections = navLinks.map((link) => {
  const encodedId = link.hash.slice(1);
  if (!encodedId) return null;
  try {
    return document.getElementById(decodeURIComponent(encodedId));
  } catch {
    return null;
  }
})
  .filter((section): section is HTMLElement => section !== null);

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
      button.textContent = t('contextInfo.copied');
      announce(t('contextInfo.copied'));
      setTimeout(() => { button.textContent = original; }, 1400);
    } catch (_) {
      announce(t('gallery.toast.clipboardUnavailable'));
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
let archiveMountPromise: Promise<RuntimeValue> | null = null;
let archiveMotionPromise: Promise<RuntimeValue> | null = null;

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
      const item = video.closest<HTMLElement>('.docs-motion-item');
      if (!item || item.dataset.recipeInfo !== undefined) return;
      const source = video.currentSrc || video.querySelector<HTMLSourceElement>('source')?.dataset.src
        || video.dataset.poster || video.poster;
      const recipe = recipeForMedia(catalog, source);
      if (!recipe) return;
      item.dataset.recipeInfo = '';
      const poster = video.poster || video.dataset.poster || '';
      item.append(createInfoButton({
        label: t('fieldGuide.recipeLabel', { name: t('fieldGuide.videoTitle') }),
        title: t('fieldGuide.videoTitle'),
        guide: 'recipe',
        json: recipe,
        image: poster ? {
          src: poster,
          fit: 'contain',
          alt: t('fieldGuide.videoFrame'),
          caption: t('fieldGuide.videoFrame'),
        } : null,
      }));
    });
  }).catch((error: RuntimeValue) => {
    archiveMotionPromise = null;
    announce(error instanceof Error ? error.message : String(error));
  });
}

archiveOpen?.addEventListener('click', () => {
  if (!archiveDialog) return;
  // The dialog's loops play under the site's one policy (publicPages.ts mounts them through mediaPlayer.ts): once the
  // dialog shows them, two at most, one transfer at a time, never under reduced motion or data saving.
  archiveDialog.showModal();
  archiveMountPromise ??= import('../presentation/mediaArchive.ts')
    .then(({ mountMediaArchive }) => mountMediaArchive(
      document.querySelector('#docsArchiveBody'),
      { mode: 'wall', limit: 330, filters: false },
    ))
    .catch((error: RuntimeValue) => {
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
