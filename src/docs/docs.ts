import { t } from '../ui/i18n.ts';
import { noticeRegion, notify } from '../ui/components/notice.ts';
import type { RuntimeValue } from '../runtimeTypes.ts';
import { mountBattleReels } from './battleReels.ts';
import { mountDocsIcons } from './docsIcons.ts';

mountDocsIcons();

// The index's search: the field loads the manual's index with its first use (docsSearch.ts); Cmd K or Ctrl K focuses it.
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
  if (kbd) kbd.textContent = t(/Mac|iP(?:hone|ad|od)/.test(navigator.platform) ? 'docs.search.shortcutMac' : 'docs.search.shortcut');
}

/** The archive failed to load: the kit's error notice inside the open dialog (the top layer hides a page toast), with a
 *  Retry that runs the same load again. */
function loadFailed(retry: () => Promise<unknown>): void {
  if (archiveDialog) noticeRegion('docs-archive', { host: archiveDialog, placement: 'bottom', limit: 1 });
  notify({ id: 'docs-archive-load', region: archiveDialog?.open ? 'docs-archive' : 'menu', severity: 'error',
    text: t('docs.archive.loadFailed'), retry });
}

const archiveDialog = document.querySelector<HTMLDialogElement>('#docsArchive');
const archiveOpen = document.querySelector<HTMLButtonElement>('#docsArchiveOpen');
const archiveClose = document.querySelector<HTMLButtonElement>('#docsArchiveClose');
let archiveMountPromise: Promise<RuntimeValue> | null = null;
let archiveMotionPromise: Promise<RuntimeValue> | null = null;

function stopArchiveMotion(): void {
  archiveDialog?.querySelectorAll<HTMLVideoElement>('video').forEach((video) => video.pause());
}

function mountArchiveMotionInfo(): Promise<unknown> {
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
  });
  return archiveMotionPromise.catch((error: RuntimeValue) => { archiveMotionPromise = null; throw error; });
}

/** The archive's wall (its sheet loads with its module: nothing on the page's first paint waits for it). */
function mountArchiveBody(): Promise<unknown> {
  archiveMountPromise ??= Promise.all([import('../presentation/mediaArchive.ts'), import('../presentation/mediaArchive.css')])
    .then(([{ mountMediaArchive }]) => mountMediaArchive(
      document.querySelector('#docsArchiveBody'),
      { mode: 'wall', limit: 330, filters: false },
    ));
  return archiveMountPromise.catch((error: RuntimeValue) => { archiveMountPromise = null; throw error; });
}
const loadArchive = (): Promise<unknown> => Promise.all([mountArchiveBody(), mountArchiveMotionInfo()]);

archiveOpen?.addEventListener('click', () => {
  if (!archiveDialog) return;
  // The dialog's loops play under the site's one policy (publicPages.ts mounts them through mediaPlayer.ts): once the
  // dialog shows them, two at most, one transfer at a time, never under reduced motion or data saving.
  archiveDialog.showModal();
  void loadArchive().catch(() => loadFailed(loadArchive));
});
archiveClose?.addEventListener('click', () => archiveDialog?.close());
archiveDialog?.addEventListener('close', stopArchiveMotion);
archiveDialog?.addEventListener('click', (event) => {
  if (event.target === archiveDialog) archiveDialog.close();
});

mountBattleReels();
