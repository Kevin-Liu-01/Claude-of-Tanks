import { installResponsiveLayout } from '../ui/responsiveLayout.ts';
import { t } from '../ui/i18n.ts';
import { importWhenOnline, markLoadFailed, pressFailed } from '../ui/components/loadFailure.ts';

installResponsiveLayout();

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
/** A video's name in the page's language: its catalog key with its own variables (a matchup's vehicles), else its label. */
function videoName(video: HTMLVideoElement): string {
  if (!video.dataset.i18nLabel) return video.dataset.label || '';
  let vars: Record<string, string> | undefined;
  try { vars = video.dataset.i18nVars ? JSON.parse(video.dataset.i18nVars) as Record<string, string> : undefined; } catch { vars = undefined; }
  return t(video.dataset.i18nLabel, vars);
}
const videoLabels = (playing: boolean, video: HTMLVideoElement): string => t(playing ? 'publicPages.video.pauseAria'
  : 'publicPages.video.playAria', { label: videoName(video) });
const videoTips = (playing: boolean): string => t(playing ? 'publicPages.video.pauseTip' : 'publicPages.video.playTip');
if (pageVideos.length) {
  // (a player that did not arrive leaves the posters: its chunk is not asked for again in this document)
  importWhenOnline(() => Promise.all([import('./mediaPlayer.ts'), import('./mediaPlayer.css')]).then(([module]) => {
    media = module;
    module.mountMediaPlayers(pageVideos, videoLabels, videoTips);
  }));
}
const savingPictures = savingData() ? import('./responsivePicture.ts') : null;
void savingPictures?.then(({ applyDataSaverStills }) => applyDataSaverStills(document, true));

// The media archive is used by docs, not the landing page. Keep its manifest,
// rendering code, and CSS out of the home critical path.
if (document.querySelector('[data-media-archive]')) {
  // (an archive whose module did not arrive keeps its served markup: its chunk is not asked for again in this document)
  const mountArchives = (): void => importWhenOnline(() => Promise.all([
    import('./mediaArchive.css'),
    import('./mediaArchive.ts'),
  ]).then(([, { autoMountMediaArchives }]) => autoMountMediaArchives()));
  mountArchives();
}




// The landing's stills (the hero still over its inline preview, the bentos, the features, the modes rail's cards and the
// trailer button's thumb) fade in once decoded, over their box's own tone or preview (home.css hides them from the first
// paint), so none paints in half-drawn as it streams (owner 2026-10-27: "lets ensure we have good loadin gstates for
// everything"). They are marked here, in the page's first module, so a still that arrives before the landing's own module
// still fades (the loading census, round 6: the phone's lead duel and the thumb popped in; the slow-load critic: the hero
// came in in bands). A still that failed keeps its box's tone until it loads (homePage.ts asks for it again online). The
// box carries data-ready (the loading census's mark).
const showStill = (image: HTMLImageElement): void => {
  if (!image.naturalWidth || image.parentElement?.hasAttribute('data-ready')) return;
  void image.decode().catch(() => undefined).then(() => image.parentElement?.setAttribute('data-ready', ''));
};
for (const image of document.querySelectorAll<HTMLImageElement>('.home .hero > .hero__still, .home .cot-c-media > img[loading="lazy"], .home .hero__thumb > img')) {
  if (image.complete) showStill(image);
  image.addEventListener('load', () => showStill(image));
}

// The landing's own behaviour (homePage.ts: the reel, the trailer's controls, the modes rail) loads with the landing
// alone, so the manual, the Gallery and the other public pages carry neither its code nor its strings.
// A landing whose module did not arrive keeps its served markup: its chunk is not asked for again in this document, so the
// trailer's button, the one opener it holds, keeps the kit's error state and its next press reloads the page once online.
if (document.querySelector('[data-hero-reel]')) {
  importWhenOnline(() => import('./homePage.ts'), () => {
    const openers = [...document.querySelectorAll('[data-trailer-open]')];
    markLoadFailed(openers);
    for (const opener of openers) opener.addEventListener('click', () => pressFailed(opener));
  });
}

// Play now (Enter): Enter anywhere on the landing that is not a control follows the hero's Play link.
const heroPlay = document.querySelector<HTMLAnchorElement>('[data-hero-play]');
if (heroPlay) {
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target && target !== document.body && target.closest('a,button,input,select,textarea,summary,video,[contenteditable],[tabindex]')) return;
    heroPlay.click();
  });
}

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
