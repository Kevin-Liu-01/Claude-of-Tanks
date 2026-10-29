import { onLocaleChange, t } from '../ui/i18n.ts';
import { designationHtml, holdNameText } from './designations.ts';
import { importWhenOnline, markLoadFailed, pressFailed } from '../ui/components/loadFailure.ts';
import type { PickerItem } from '../ui/components/picker.ts';

const MEDIA_ROOT = '/media/site50-r14/reels';

export interface BattleReel {
  id: string;
  title: string;
  map: string;
  video: string;
  poster: string;
}

// [take id, its title's catalog key, its battlefield's catalog key]: twenty of the site fifty's takes, 720p with their
// sound (tools/media-r5/site-media/picks.json)
const REEL_SOURCES: ReadonlyArray<readonly [string, string, string]> = [
  ['s01-main-street-push', 'media.site50.short.s01MainStreetPush', 'map.urban'],
  ['s04-column-under-fire', 'media.site50.short.s04ColumnUnderFire', 'map.verdant'],
  ['s05-barn-advance', 'media.site50.short.s05BarnAdvance', 'map.verdant'],
  ['s06-farm-charge', 'media.site50.short.s06FarmCharge', 'map.verdant'],
  ['s07-lake-shellfire', 'media.site50.short.s07LakeShellfire', 'map.alpine'],
  ['s08-market-push', 'media.site50.short.s08MarketPush', 'map.oasis'],
  ['s11-container-rows', 'media.site50.short.s11ContainerRows', 'map.railyard'],
  ['s18-street-knockout', 'media.site50.short.s18StreetKnockout', 'map.urban'],
  ['s19-roof-tiles', 'media.site50.short.s19RoofTiles', 'map.urban'],
  ['s20-road-return-fire', 'media.site50.short.s20RoadReturnFire', 'map.verdant'],
  ['s21-fields-assault', 'media.site50.short.s21FieldsAssault', 'map.verdant'],
  ['s23-village-crossroads', 'media.site50.short.s23VillageCrossroads', 'map.verdant'],
  ['s24-ice-duel', 'media.site50.short.s24IceDuel', 'map.alpine'],
  ['s26-minaret-fire', 'media.site50.short.s26MinaretFire', 'map.oasis'],
  ['s27-caravanserai-kill', 'media.site50.short.s27CaravanseraiKill', 'map.oasis'],
  ['s29-fjord-road-kill', 'media.site50.short.s29FjordRoadKill', 'map.fjord'],
  ['s33-water-tower', 'media.site50.short.s33WaterTower', 'map.railyard'],
  ['s34-furnace-salvo', 'media.site50.short.s34FurnaceSalvo', 'map.foundry'],
  ['s38-church-knockout', 'media.site50.short.s38ChurchKnockout', 'map.winter'],
  ['s39-lakeside-village', 'media.site50.short.s39LakesideVillage', 'map.reservoir'],
  ['s225-verdant-duel', 'media.site50.short.s225VerdantDuel', 'map.verdant'],
  ['s226-church-duel', 'media.site50.short.s226ChurchDuel', 'map.winter'],
  ['s227-oasis-duel', 'media.site50.short.s227OasisDuel', 'map.oasis'],
  ['s228-street-1v2', 'media.site50.short.s228Street1v2', 'map.urban'],
];

// The names resolve on read: this list is built when the module loads, before a Chinese page's catalog has arrived.
export const BATTLE_REELS: readonly BattleReel[] = Object.freeze(REEL_SOURCES.map(([id, titleKey, mapKey]) => Object.freeze({
  id,
  get title() { return t(titleKey); },
  get map() { return t(mapKey); },
  video: `${MEDIA_ROOT}/${id}.mp4`,
  poster: `${MEDIA_ROOT}/${id}.webp`,
})));

function reelNumber(index: number): string {
  return String(index + 1).padStart(2, '0');
}

export function mountBattleReels(scope: Document = document): void {
  const root = scope.querySelector<HTMLElement>('[data-battle-reels]');
  if (!root) return;

  const video = root.querySelector<HTMLVideoElement>('[data-battle-reel-video]');
  const source = video?.querySelector<HTMLSourceElement>('source');
  const grid = root.querySelector<HTMLElement>('[data-battle-reel-grid]');
  const title = root.querySelector<HTMLElement>('[data-battle-reel-title]');
  const map = root.querySelector<HTMLElement>('[data-battle-reel-map]');
  const count = root.querySelector<HTMLElement>('[data-battle-reel-count]');
  if (!video || !source || !grid || !title || !map || !count) return;
  // The player sits far below the fold: its poster loads as it nears the viewport, never before a scroll (SPEC 8.3).
  const deferredPoster = video.dataset.poster;
  if (deferredPoster && !video.poster) {
    if (typeof IntersectionObserver !== 'function') video.poster = deferredPoster;
    else {
      const near = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        if (!video.poster) video.poster = deferredPoster;
        near.disconnect();
      }, { rootMargin: '25% 0px' });
      near.observe(video);
    }
  }

  let activeIndex = 0;
  // the takes are the kit's picker (cards), loaded with its sheet when the library nears the screen: each by its poster,
  // its title and its battlefield; one press plays it
  let reels: { setItems(items: readonly PickerItem[], value?: string | null): void; setValue(id: string | null): void } | null = null;
  const reelItems = (): PickerItem[] => BATTLE_REELS.map((reel) => ({ id: reel.id, name: holdNameText(reel.title), facts: [reel.map], media: { poster: reel.poster } }));
  let picked = false;
  // (asked once, never while offline: a module that did not arrive is not asked for again in this document, so the
  // player keeps its opening take, the grid keeps the kit's error state and its next press reloads the page once online)
  const mountPicker = (): void => {
    importWhenOnline(() => Promise.all([import('../ui/components/picker.ts'), import('../ui/pickerText.ts'), import('./docsPickers.css')])
      .then(([{ createPicker }, { pickerText }]) => {
        reels = createPicker(grid, {
          id: 'docs-battle-reel', label: t('docs.studio.reelsGridAria'), items: reelItems(), value: BATTLE_REELS[activeIndex].id,
          layout: 'cards', text: pickerText(),
          // the take under the pointer or the focus shows its poster on the player while it is not playing
          onPreview: (item) => {
            if (video.paused) video.poster = (BATTLE_REELS.find((reel) => reel.id === item?.id) ?? BATTLE_REELS[activeIndex]).poster;
          },
          onChoose: (item) => selectReel(BATTLE_REELS.findIndex((reel) => reel.id === item.id)),
        });
      }), () => {
      markLoadFailed([grid]);
      grid.addEventListener('click', () => pressFailed(grid));
    });
  };
  // ... or once the page has loaded and gone idle, whichever comes first: the grid grows from its search bar to two dozen
  // cards as it mounts, and a mount at the near margin moved what follows it on screen after a fast scroll (the loading
  // census: CLS 0.113 on a phone). Its cards' pictures still wait for the screen (the picker's own lazy loading).
  const mountOnce = (): void => {
    if (picked) return;
    picked = true;
    mountPicker();
  };
  if (typeof IntersectionObserver !== 'function') mountOnce();
  else {
    const near = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      near.disconnect();
      mountOnce();
    }, { rootMargin: '600px 0px' });
    near.observe(grid);
    const idle = (): void => {
      if ('requestIdleCallback' in window) requestIdleCallback(() => { near.disconnect(); mountOnce(); }, { timeout: 3000 });
      else setTimeout(() => { near.disconnect(); mountOnce(); }, 1500);
    };
    if (document.readyState === 'complete') idle();
    else addEventListener('load', idle, { once: true });
  }

  const caption = (index: number): void => {
    const reel = BATTLE_REELS[index];
    // a designation (T-90M, 2A7V) never breaks inside: the caption wraps before it
    title.innerHTML = designationHtml(reel.title);
    map.textContent = `${reel.map} · ${t('docs.studio.reelSpec')}`;
    count.textContent = `${reelNumber(index)} / ${BATTLE_REELS.length}`;
    video.setAttribute('aria-label', t('docs.studio.reelAria', { title: reel.title, map: reel.map }));
  };
  caption(0); // the page's static caption is the English one the media wiring writes
  // A Chinese page's catalog can land after the mount: the cards and the caption follow it.
  onLocaleChange(() => {
    reels?.setItems(reelItems(), BATTLE_REELS[activeIndex].id);
    caption(activeIndex);
  });

  const selectReel = (index: number, play = true): void => {
    const reel = BATTLE_REELS[index];
    if (!reel) return;

    reels?.setValue(reel.id);
    caption(index);

    if (activeIndex !== index) {
      video.pause();
      source.src = reel.video;
      video.poster = reel.poster;
      video.load();
      activeIndex = index;
    }
    if (play) video.play().catch(() => {});
  };

}
