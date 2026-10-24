// The landing's fleet wall (bui01/src/pages/03-landing-fleet-wall). Copyright © 2026 Kevin B. Liu.
// publicPages.ts loads this module beside a page that has the wall (#fleet), so the other public pages and the landing's
// first bytes carry none of it: the featured plate that follows pointing and focus, the playing take's progress and the
// nation and class chips and search (their vehicles and matching load later still, with fleetWall.ts).
import { t } from '../ui/i18n.ts';

type MediaReady = Promise<typeof import('./mediaPlayer.ts')> | null;
type VideoLabels = (playing: boolean, video: HTMLVideoElement) => string;

interface FleetFeature {
  readonly name: string; readonly flag: string; readonly tier: string; readonly cal: number; readonly pen: number;
  readonly crew: number; readonly weight: string; readonly speed: number;
  readonly tank: readonly [string, string]; readonly banner: readonly [string, string]; readonly place: string;
  readonly anatomy: string; readonly drive: string;
}

// The landing's fleet wall (03): pointing at or focusing a tank's take shows its hero card, flag and facts on the
// featured plate; the take itself opens the vehicle's Gallery dossier. The plate's box never changes size.
export function mountFleet(section: HTMLElement, media: MediaReady, labels: VideoLabels): void {
  const plate = section.querySelector<HTMLElement>('[data-fleet-feature]');
  const wall = section.querySelector<HTMLElement>('[data-fleet-wall]');
  const tiles = (): HTMLAnchorElement[] => [...section.querySelectorAll<HTMLAnchorElement>('a[data-feature]')];
  if (!plate || !wall || !tiles().length) return;
  const fact = <T extends Element>(name: string): T | null => plate.querySelector<T>(`[data-fact="${name}"]`);
  const show = (tile: HTMLAnchorElement): void => {
    let feature: FleetFeature;
    try { feature = JSON.parse(tile.dataset.feature || '') as FleetFeature; } catch { return; }
    for (const other of tiles()) other.classList.toggle('is-featured', other === tile);
    fact<HTMLSourceElement>('banner-set')?.setAttribute('srcset', feature.banner[0]);
    fact<HTMLImageElement>('banner')?.setAttribute('src', feature.banner[1]);
    fact<HTMLSourceElement>('tank-set')?.setAttribute('srcset', feature.tank[0]);
    const tank = fact<HTMLImageElement>('tank');
    if (tank) { tank.setAttribute('src', feature.tank[1]); tank.setAttribute('style', feature.place); }
    const name = fact<HTMLElement>('name');
    if (name) name.textContent = feature.name;
    plate.querySelector('.fleet-feature__flag use')?.setAttribute('href', `#f-${feature.flag}`);
    const values: Record<string, string> = { tier: feature.tier, caliber: String(feature.cal), penetration: String(feature.pen),
      crew: String(feature.crew), weight: feature.weight, speed: String(feature.speed) };
    for (const [key, value] of Object.entries(values)) { const node = fact<HTMLElement>(key); if (node) node.textContent = value; }
    fact<HTMLAnchorElement>('anatomy')?.setAttribute('href', feature.anatomy);
    fact<HTMLAnchorElement>('drive')?.setAttribute('href', feature.drive);
  };
  // the wall's own tiles and the ones the facets write (fleetWall.ts)
  const pointed = (event: Event): void => {
    const tile = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[data-feature]');
    if (tile && wall.contains(tile) && !tile.classList.contains('is-featured')) show(tile);
  };
  wall.addEventListener('pointerover', pointed);
  wall.addEventListener('focusin', pointed);
  for (const tile of tiles()) mountTakeProgress(tile);
  tiles()[0].classList.add('is-featured');
  mountFleetFacets(section, show, media, labels);
}

type FleetWallModule = typeof import('./fleetWall.ts');
let fleetWall: Promise<FleetWallModule> | null = null;

/**
 * The wall's nation and class chips and its search (03 .facets): one nation and one class at a time, a chip pressed
 * again lets go, All clears both and the search. The vehicles and their matching (fleetWall.ts) load with the first
 * press or keystroke; the first tile that answers takes the plate.
 */
function mountFleetFacets(section: HTMLElement, show: (tile: HTMLAnchorElement) => void, media: MediaReady, labels: VideoLabels): void {
  const facets = section.querySelector<HTMLElement>('.fleet-facets');
  const input = facets?.querySelector<HTMLInputElement>('input[type=search]');
  const status = facets?.querySelector<HTMLElement>('.fleet-count');
  if (!facets || !input || !status) return;
  const chips = [...facets.querySelectorAll<HTMLButtonElement>('button.cot-c-chip')];
  let nation = '', cls = '';
  const apply = (): void => {
    const filter = { nation, cls, query: input.value };
    for (const chip of chips) {
      const pressed = chip.hasAttribute('data-fleet-all') ? !nation && !cls && !input.value.trim()
        : chip.dataset.fleetNation !== undefined ? chip.dataset.fleetNation === nation : chip.dataset.fleetClass === cls;
      chip.setAttribute('aria-pressed', String(pressed));
    }
    void (fleetWall ??= import('./fleetWall.ts')).then(({ applyFleetFilter, isEmptyFilter }) => {
      const { tiles, total } = applyFleetFilter(section, filter);
      status.textContent = isEmptyFilter(filter) ? '' : total ? t('publicPages.fleet.count', { count: total }) : t('publicPages.fleet.none');
      for (const tile of tiles) if (tile.dataset.progress === undefined) mountTakeProgress(tile);
      const videos = tiles.map((tile) => tile.querySelector('video')).filter((video): video is HTMLVideoElement => video !== null);
      void media?.then((module) => module.mountMediaPlayers(videos, labels));
      if (tiles[0]) show(tiles[0]);
    });
  };
  facets.addEventListener('click', (event) => {
    const chip = (event.target as Element | null)?.closest<HTMLButtonElement>('button.cot-c-chip');
    if (!chip) return;
    const { fleetNation, fleetClass } = chip.dataset;
    if (chip.hasAttribute('data-fleet-all')) { nation = ''; cls = ''; input.value = ''; }
    else if (fleetNation !== undefined) nation = nation === fleetNation ? '' : fleetNation;
    else if (fleetClass !== undefined) cls = cls === fleetClass ? '' : fleetClass;
    apply();
  });
  input.addEventListener('input', apply);
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !input.value) return;
    event.preventDefault();
    input.value = '';
    apply();
  });
}

/** A playing take's bar runs at the loop's own length from where the loop is, and restarts as the loop does. */
function mountTakeProgress(tile: HTMLElement): void {
  tile.dataset.progress = '';
  const video = tile.querySelector('video');
  const bar = tile.querySelector<HTMLElement>('.fleet-tile__progress');
  if (!video || !bar) return;
  const run = (): void => {
    if (!(video.duration > 0)) return;
    bar.style.setProperty('--loop-s', `${video.duration}s`);
    bar.style.setProperty('--loop-at', `${-video.currentTime}s`);
    tile.classList.remove('is-playing');
    void bar.offsetWidth; // restarts the bar's animation
    tile.classList.add('is-playing');
  };
  video.addEventListener('playing', run);
  video.addEventListener('seeked', () => { if (!video.paused) run(); });
  for (const type of ['pause', 'emptied', 'ended']) video.addEventListener(type, () => tile.classList.remove('is-playing'));
}
