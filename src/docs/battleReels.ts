import { t } from '../ui/i18n.ts';

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

export const BATTLE_REELS: readonly BattleReel[] = Object.freeze(REEL_SOURCES.map(([id, titleKey, mapKey]) => Object.freeze({
  id,
  title: t(titleKey),
  map: t(mapKey),
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

  grid.innerHTML = BATTLE_REELS.map((reel, index) => `
    <button class="battle-reel-card" type="button" data-battle-reel-index="${index}" aria-pressed="${index === 0}">
      <img src="${reel.poster}" alt="" loading="lazy" decoding="async">
      <span><b>${reelNumber(index)}</b><strong>${reel.title}</strong><small>${reel.map}</small></span>
    </button>
  `).join('');

  const buttons = [...grid.querySelectorAll<HTMLButtonElement>('[data-battle-reel-index]')];
  let activeIndex = 0;

  const selectReel = (index: number, play = true): void => {
    const reel = BATTLE_REELS[index];
    if (!reel) return;

    buttons.forEach((button, buttonIndex) => {
      button.setAttribute('aria-pressed', String(buttonIndex === index));
    });
    title.textContent = reel.title;
    map.textContent = `${reel.map} // ${t('docs.studio.reelSpec')}`;
    count.textContent = `${reelNumber(index)} / ${BATTLE_REELS.length}`;
    video.setAttribute('aria-label', t('docs.studio.reelAria', { title: reel.title, map: reel.map }));

    if (activeIndex !== index) {
      video.pause();
      source.src = reel.video;
      video.poster = reel.poster;
      video.load();
      activeIndex = index;
    }
    if (play) video.play().catch(() => {});
  };

  grid.addEventListener('click', (event) => {
    const button = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>('[data-battle-reel-index]') : null;
    if (!button) return;
    selectReel(Number(button.dataset.battleReelIndex));
  });

  grid.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const focused = scope.activeElement;
    const current = focused instanceof HTMLButtonElement ? buttons.indexOf(focused) : -1;
    if (current < 0) return;
    event.preventDefault();
    const widthBand = scope.body?.dataset.cotWidth;
    const columns = widthBand === 'phone' || widthBand === 'compact' ? 2 : 4;
    const offset = event.key === 'ArrowLeft' ? -1
      : event.key === 'ArrowRight' ? 1
        : event.key === 'ArrowUp' ? -columns : columns;
    const next = Math.max(0, Math.min(buttons.length - 1, current + offset));
    buttons[next].focus();
  });
}
