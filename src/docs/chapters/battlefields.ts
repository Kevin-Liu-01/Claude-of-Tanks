// The Field Manual's battlefields chapter. Copyright © 2026 Kevin B. Liu.
// Every battlefield from the game's map list (src/world/maps/mapIds.ts) with its card art, its landscape tags
// (src/ui/regionTags.ts) and its name in the reader's locale; the random rotation, the gravity worlds, the time-of-day
// weights (src/engine/battleWeatherPolicy.ts) and the Proving Ground's lanes and plate rack (PROVING_GROUND_RULES) are
// the game's own. Node only (tools/docs-prerender.mjs).
import { MAP_IDS, RANDOM_BATTLE_MAP_IDS } from '../../world/maps/mapIds.ts';
import { mapRegionTags, regionTagIcon } from '../../ui/regionTags.ts';
import { BATTLE_TIMES, TIME_WEIGHTS } from '../../engine/battleWeatherPolicy.ts';
import { MARS_GRAVITY_OPTIONS, PROVING_GROUND_RULES } from '../../sim/matchRuleset.ts';
import { pictureMarkup } from '../../presentation/responsivePicture.ts';
import { icon, type IconId } from '../../ui/icons/icon.ts';
import { t } from '../../ui/i18n.ts';
import type { RichSection } from './types.ts';

const esc = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

const TIME_ICONS: Readonly<Record<string, IconId>> = { day: 'timeDay', sunset: 'timeSunset', night: 'regionNight' };

function mapCard(id: string): string {
  const tags = mapRegionTags(id);
  const art = pictureMarkup({ src: `/maps/cards/${id}.webp`, width: 1280, height: 720, alt: '', sizes: '(width < 768px) 50vw, (width < 1440px) 33vw, 22vw',
    rungs: [{ src: `/maps/thumbs/${id}.webp`, width: 512 }, { src: `/maps/cards/${id}.webp`, width: 1280 }] }, false);
  return `<li class="dm-map" id="map-${id}">${art}<span class="dm-map__name"><b>${esc(t(`map.${id}`))}</b>`
    + `<span class="dm-map__tags">${tags.map((tag) => `<span title="${esc(t(`camoTag.${tag}`))}">${icon(regionTagIcon(tag) as IconId, { size: 14 })}</span>`).join('')}</span></span></li>`;
}

function landscapes(): string {
  const counts = new Map<ReturnType<typeof mapRegionTags>[number], number>();
  for (const id of MAP_IDS) for (const tag of mapRegionTags(id)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return `<ul class="dm-chips dm-chips--icons">${[...counts].sort((a, b) => b[1] - a[1]).map(([tag, n]) => `<li>${icon(regionTagIcon(tag) as IconId, { size: 14 })}`
    + `<span>${esc(t(`camoTag.${tag}`))}</span><b>${n}</b></li>`).join('')}</ul>`;
}

function timeOfDay(): string {
  const total = BATTLE_TIMES.reduce((sum, time) => sum + TIME_WEIGHTS[time], 0);
  const bars = BATTLE_TIMES.map((time) => `<li>${icon(TIME_ICONS[time] ?? 'clock', { size: 16 })}<b>${esc(t(`atmosphere.${time}`))}</b>`
    + `<span class="dm-bar" style="--dm-bar:${(TIME_WEIGHTS[time] / Math.max(...BATTLE_TIMES.map((x) => TIME_WEIGHTS[x]))).toFixed(3)}"></span>`
    + `<span class="num">${Math.round((TIME_WEIGHTS[time] / total) * 100)} %</span></li>`).join('');
  const still = pictureMarkup({ src: '/media/site50-r14/home/mechanics/time-of-day.webp', width: 1280, height: 720, alt: t('docs.battlefields.timeAlt'),
    sizes: '(width < 1100px) 100vw, 50vw', rungs: [{ src: '/media/site50-r14/home/mechanics/time-of-day-640.webp', width: 640 },
      { src: '/media/site50-r14/home/mechanics/time-of-day.webp', width: 1280 }] }, false);
  return `<p>${esc(t('docs.battlefields.timeLede'))}</p><ul class="dm-bars">${bars}</ul><figure class="dm-figure">${still}</figure>`;
}

function provingGround(): string {
  const rules = PROVING_GROUND_RULES;
  const lanes = rules.lanes.map((lane) => `<li><b>${lane.rangeM} m</b><span>${esc(t('docs.battlefields.lane', { angle: String(lane.presentDeg) }))}</span></li>`).join('');
  const plates = rules.plateRack.plates.map((plate) => `<li>${plate.mm} mm${plate.angleDeg ? ` · ${plate.angleDeg}°` : ''}</li>`).join('');
  return `<p>${esc(t('docs.battlefields.provingLede', { map: t(`map.${rules.mapId}`), lanes: String(rules.lanes.length) }))}</p>`
    + `<div class="dm-pair"><div><h3>${esc(t('docs.battlefields.lanes'))}</h3><ul class="dm-facts dm-facts--lanes">${lanes}</ul></div>`
    + `<div><h3>${esc(t('docs.battlefields.plates'))}</h3><ul class="dm-chips">${plates}</ul></div></div>`;
}

/** What the battlefield gives way to: the landing's names and stills (home.mechanics.*), the manual's own lines
 * (docs.battlefields.breakLine.*: the landing shows names only since 246), and what cover stops. */
const BREAKS: ReadonlyArray<readonly [string, string]> = [['buildings', 'buildings'], ['crushing', 'crushing'], ['mapVehicles', 'map-vehicles']];
function breaksSection(): string {
  const tiles = BREAKS.map(([key, still]) => `<li>${pictureMarkup({ src: `/media/site50-r14/home/mechanics/${still}.webp`, width: 1280, height: 720, alt: '',
    sizes: '(width < 768px) 100vw, (width < 1440px) 33vw, 24vw', rungs: [{ src: `/media/site50-r14/home/mechanics/${still}-640.webp`, width: 640 },
      { src: `/media/site50-r14/home/mechanics/${still}.webp`, width: 1280 }] }, false)}`
    + `<div><b>${esc(t(`home.mechanics.${key}.title`))}</b><p>${esc(t(`docs.battlefields.breakLine.${key}`))}</p></div></li>`).join('');
  return `<ul class="dm-tiles">${tiles}</ul><ul class="dm-facts"><li>${esc(t('docs.battlefields.cover'))}</li></ul>`;
}

export function battlefieldsSections(): RichSection[] {
  const gravity = Object.entries(MARS_GRAVITY_OPTIONS).map(([id, option]) => `${t(`docs.battlefields.gravity.${id}`)} ${option.gravityScale} g`).join(' · ');
  const sections: Array<[string, string, string]> = [
    ['maps', t('docs.battlefields.maps'), `<p>${esc(t('docs.battlefields.mapsLede', { maps: String(MAP_IDS.length), random: String(RANDOM_BATTLE_MAP_IDS.length) }))}</p>`
      + `${landscapes()}<ul class="dm-maps">${MAP_IDS.map(mapCard).join('')}</ul>`],
    ['breaks', t('docs.battlefields.breaks'), breaksSection()],
    ['gravity', t('docs.battlefields.gravity'), `<p>${esc(t('docs.battlefields.gravityLede', { options: gravity }))}</p>`],
    ['time', t('docs.battlefields.time'), timeOfDay()],
    ['proving', t('docs.battlefields.proving'), provingGround()],
  ];
  return sections.map(([id, title, html]) => ({ id, title, html, text: plain(html) }));
}
