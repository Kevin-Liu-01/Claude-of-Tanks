import { t } from '../ui/i18n.ts';
import type { RuntimeValue } from '../runtimeTypes.ts';
import { mountBattleReels } from './battleReels.ts';
import { mountDocsIcons } from './docsIcons.ts';

mountDocsIcons();

// The index's search: the field loads the manual's index with its first use (docsSearch.ts); ⌘K or Ctrl K focuses it.
const searchHost = document.querySelector<HTMLElement>('[data-docs-search]');
const searchInput = searchHost?.querySelector<HTMLInputElement>('input');
if (searchHost && searchInput) {
  searchInput.addEventListener('focus', () => { void import('./docsSearch.ts').then(({ mountDocsSearch }) => mountDocsSearch(searchHost, searchInput)); }, { once: true });
  document.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey) || event.altKey) return;
    event.preventDefault();
    searchInput.focus();
    searchInput.select();
  });
  const kbd = searchHost.querySelector('kbd');
  if (kbd && !/Mac|iP(?:hone|ad|od)/.test(navigator.platform)) kbd.textContent = 'Ctrl K';
}

let toastTimer = 0;
function announce(message: string): void {
  const toast = document.querySelector<HTMLElement>('#docsToast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 1600);
}

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
