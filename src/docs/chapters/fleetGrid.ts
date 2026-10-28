// The Field Manual's fleet chapter (owner 2026-10-27: "in docs also be able to see and scroll through a grid of literally
// all tanks laid out and filterable with differrent presenntationnn options (likke hero card, tilt anngle, side angle)").
// Copyright © 2026 Kevin B. Liu.
// Every playable tank is one tile (its hero card, its name, its flag and class, its tier chip) linking to its Gallery
// dossier. The tiles, the filter bar (nation, tier, era, class and role on the kit's picker menu, search, the presentation on
// the kit's segmented control) and the options the filters offer are prerendered here in the page's language; the page's
// own code (src/docs/fleetGrid.ts) only filters, switches the presentation and builds the angle and side pictures it is
// asked for. Names, nations, eras and the angle and side renders come from the asset manifest (tools/docsFleetTable.ts),
// tiers from the tier table, classes and roles from the Garage's facet tables. Node only (tools/docs-prerender.mjs).
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  VEHICLE_BATTLE_ROLE_META, VEHICLE_BATTLE_ROLE_ORDER, VEHICLE_CLASS_META, VEHICLE_CLASS_ORDER, VEHICLE_DESIGN_STATUS_META,
  vehicleFacetLabel, vehicleFacetsForId, type VehicleFacetValueMeta,
} from '../../vehicles/vehicleFacets.ts';
import { TANK_IDS } from '../../vehicles/tankIdAliases.ts';
import { flagIconCode } from '../../ui/flagCodes.ts';
import { flagLabel, nationFlags } from '../../gallery/galleryFacets.ts';
import { emptyState, segmented } from '../../ui/components/components.ts';
import { esc } from '../../ui/components/escape.ts';
import { heroTierChipHTML } from '../../ui/heroCardChips.ts';
import { icon, type IconId } from '../../ui/icons/icon.ts';
import { flagMarkup } from '../../presentation/publicShell.ts';
import { getLocale, t } from '../../ui/i18n.ts';
import { hrefForLocale } from '../../ui/localeRouting.ts';
import { fleetTanks, heroCardMarkup, heroFacing, type FleetTank } from './fleet.ts';
import { nameHtml } from '../designations.ts';
import type { RichSection } from './types.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** The presentations, in the segmented control's order: the hero card is the page's first view. */
export const FLEET_VIEWS = ['hero', 'angle', 'side'] as const;
/** The filters, in the bar's order; each is a URL parameter of the same name and a tile's data-<key>. */
export const FLEET_FACETS = ['nation', 'tier', 'era', 'class', 'role'] as const;
type FacetKey = typeof FLEET_FACETS[number];

/** The eras newest first, with their Garage label and glyph (an era the fleet does not use yet is left out). */
const ERAS: ReadonlyArray<readonly [string, string, IconId]> = [
  ['next-generation', 'garage.era.nextGen', 'eraNextGeneration'],
  ['modern', 'garage.era.modern', 'eraModern'],
  ['cold-war', 'garage.era.coldWar', 'eraColdWar'],
  ['ww2', 'garage.era.worldWar2', 'eraWorldWarII'],
  ['interwar', 'garage.era.interwar', 'eraInterwar'],
];
const CLASS_ICONS: Readonly<Record<string, IconId>> = {
  mbt: 'classMbt', medium: 'classMedium', heavy: 'classHeavy', light: 'classLight', ifv: 'classIfv', apc: 'classApc', td: 'classTd', spaa: 'classSpaa',
  'fire-support': 'classFireSupport',
};
const ROLE_ICONS: Readonly<Record<string, IconId>> = {
  breakthrough: 'roleBreakthrough', frontline: 'roleFrontline', flanker: 'roleFlanker', sniper: 'roleSniper', scout: 'roleScout', support: 'roleSupport',
};
/** Each filter's name, its "every value" choice and that choice's glyph. */
const FACET_TEXT: Readonly<Record<FacetKey, readonly [string, string, IconId]>> = {
  nation: ['gallery.archive.filter.nation', 'gallery.archive.filter.allNations', 'globe'],
  tier: ['docs.fleet.tier', 'docs.fleet.allTiers', 'techTree'],
  era: ['docs.fleet.era', 'docs.fleet.allEras', 'clock'],
  class: ['docs.fleet.class', 'docs.fleet.allClasses', 'vehicle'],
  role: ['docs.fleet.role', 'docs.fleet.allRoles', 'team'],
};
/** One choice a filter offers, as the kit picker takes it (src/ui/components/picker.ts PickerItem): an empty id is every
 *  value. `chip` is a nation's roster name, which the page turns into its flag's URL (src/ui/flags.ts). */
export interface FleetOption { readonly id: string; readonly name: string; readonly count: number; readonly glyph?: IconId; readonly chip?: string }
export interface FleetFacet { readonly key: FacetKey; readonly label: string; readonly options: readonly FleetOption[] }
/** What the page's script reads (#dmFleetData): the filters' choices and words in the page's language, the search words
 *  each choice answers (both languages, so either finds a tank on either page) and the counts' templates. */
export interface FleetGridData {
  readonly total: number;
  readonly facets: readonly FleetFacet[];
  readonly words: Readonly<Record<string, string>>;
  readonly text: { readonly count: string; readonly total: string };
}

interface Tile {
  readonly tank: FleetTank;
  readonly code: string;
  readonly facets: Readonly<Record<FacetKey, string>>;
  readonly classLabel: string;
}

let zh: Readonly<Record<string, string>> | null = null;
/** The other language's words for a key (the search answers both on either page). */
const both = (key: string, vars?: Record<string, string>): string => {
  zh ??= JSON.parse(readFileSync(join(ROOT, 'src/ui/i18nCatalog.zh-CN.json'), 'utf8')) as Record<string, string>;
  const other = (zh[key] ?? '').replace(/\{(\w+)\}/g, (_, name: string) => vars?.[name] ?? '');
  return `${t(key, vars)} ${other}`;
};
const facetWords = (meta: VehicleFacetValueMeta): string => [meta.label, meta.shortLabel, ...meta.aliases,
  both(meta.labelKey), both(meta.shortKey)].join(' ');
/** The count, a readout: its figures in the data face (.num, figures only), its words in the reading face (fleetGrid.ts
 *  writes it the same way as the filters change). */
const countMarkup = (template: string, values: Record<string, number>): string => template.split(/(\{\w+\})/)
  .map((part) => (/^\{\w+\}$/.test(part) ? `<span class="num">${values[part.slice(1, -1)] ?? ''}</span>` : esc(part))).join('');
const fold = (text: string): string => [...new Set(text.toLocaleLowerCase('en-US').split(/\s+/).filter(Boolean))].join(' ');

let tiles: readonly Tile[] | null = null;
/** Every tank in the grid's order: by nation (most tanks first, the Gallery's flag order), then tier, highest first, then
 *  name. */
function fleetTiles(): readonly Tile[] {
  if (tiles) return tiles;
  const fleet = [...fleetTanks().values()];
  const { codes } = nationFlags(fleet);
  const made = fleet.map((tank): Tile => {
    const facets = vehicleFacetsForId(tank.id);
    if (!facets) throw new Error(`fleetGrid: ${tank.id} has no class or role (src/vehicles/vehicleFacets.ts)`);
    if (!ERAS.some(([era]) => era === tank.era)) throw new Error(`fleetGrid: ${tank.id} is of an era the grid does not know (${tank.era})`);
    if (!tank.views.angle || !tank.views.side || !tank.views.angleThumb) throw new Error(`fleetGrid: ${tank.id} is missing a view render`);
    return {
      tank, code: flagIconCode(tank.nation),
      facets: { nation: flagIconCode(tank.nation), tier: String(tank.tier), era: tank.era, class: facets.vehicleClass, role: facets.battleRole },
      classLabel: vehicleFacetLabel(VEHICLE_CLASS_META[facets.vehicleClass], t, { short: true }),
    };
  });
  tiles = made.sort((a, b) => codes.indexOf(a.code) - codes.indexOf(b.code) || b.tank.tier - a.tank.tier
    || a.tank.displayName.localeCompare(b.tank.displayName, 'en'));
  return tiles;
}

/** The filters' choices, each value with its tank count, in the facet's own order. */
export function fleetGridData(): FleetGridData {
  const all = fleetTiles();
  const count = (key: FacetKey, value: string): number => all.filter((tile) => tile.facets[key] === value).length;
  const { codes, nations } = nationFlags(all.map((tile) => tile.tank));
  const tiers = [...new Set(all.map((tile) => tile.tank.tier))].sort((a, b) => b - a);
  const numeral = (tier: number): string => all.find((tile) => tile.tank.tier === tier)!.tank.tierNumeral;
  // a flag several roster nations share reads by its short pair (Russia / USSR), so a filter's trigger holds it on one line
  // in a column of the tiles' width; one nation reads by its name
  const nationName = (code: string): string => {
    const key = `docs.fleet.nation.${code}`;
    return (nations.get(code)?.length ?? 0) > 1 && t(key) !== key ? t(key) : flagLabel(code, nations, t);
  };
  const values: Record<FacetKey, FleetOption[]> = {
    nation: codes.map((code) => ({ id: code, name: nationName(code), count: count('nation', code), chip: nations.get(code)![0] })),
    tier: tiers.map((tier) => ({ id: String(tier), name: t('garage.card.tier', { tier: numeral(tier) }), count: count('tier', String(tier)) })),
    era: ERAS.filter(([era]) => count('era', era)).map(([era, key, glyph]) => ({ id: era, name: t(key), count: count('era', era), glyph })),
    // a class by its short name (MBT, IFV, SPAA), as the tiles name it: a filter's trigger holds its choice on one line
    class: VEHICLE_CLASS_ORDER.filter((cls) => count('class', cls))
      .map((cls) => ({ id: cls, name: vehicleFacetLabel(VEHICLE_CLASS_META[cls], t, { short: true }), count: count('class', cls), glyph: CLASS_ICONS[cls] })),
    role: VEHICLE_BATTLE_ROLE_ORDER.filter((role) => count('role', role))
      .map((role) => ({ id: role, name: vehicleFacetLabel(VEHICLE_BATTLE_ROLE_META[role], t), count: count('role', role), glyph: ROLE_ICONS[role] })),
  };
  const facets = FLEET_FACETS.map((key): FleetFacet => {
    const [label, every, glyph] = FACET_TEXT[key];
    return { key, label: t(label), options: [{ id: '', name: t(every), count: all.length, glyph }, ...values[key]] };
  });
  // the words each choice answers in a search: its names in both languages and the Garage's aliases
  const words: Record<string, string> = {};
  for (const code of codes) {
    const list = nations.get(code) ?? [];
    words[`nation:${code}`] = fold([code, ...list, ...list.map((nation) => both(`nation.${nation}`))].join(' '));
  }
  for (const tier of tiers) words[`tier:${tier}`] = fold(`${tier} ${numeral(tier)} ${both('garage.card.tier', { tier: numeral(tier) })}`);
  for (const [era, key] of ERAS) words[`era:${era}`] = fold(`${era.replace(/-/g, ' ')} ${both(key)}`);
  for (const cls of VEHICLE_CLASS_ORDER) words[`class:${cls}`] = fold(facetWords(VEHICLE_CLASS_META[cls]));
  for (const role of VEHICLE_BATTLE_ROLE_ORDER) words[`role:${role}`] = fold(facetWords(VEHICLE_BATTLE_ROLE_META[role]));
  for (const status of Object.keys(VEHICLE_DESIGN_STATUS_META) as Array<keyof typeof VEHICLE_DESIGN_STATUS_META>) {
    words[`status:${status}`] = fold(facetWords(VEHICLE_DESIGN_STATUS_META[status]));
  }
  return {
    total: all.length, facets, words,
    text: { count: t('docs.fleet.count'), total: t('docs.fleet.total') },
  };
}

/** A filter's trigger as the kit's picker menu draws it closed (pickerMenu.ts paint): the page's script mounts the menu
 *  over it in place, so nothing moves when it does. */
function triggerMarkup(facet: FleetFacet): string {
  const every = facet.options[0];
  return `<div class="dm-fleet__menu" data-fleet-facet="${facet.key}"><button type="button" class="cot-c-menu__trigger" aria-haspopup="listbox"`
    + ` aria-expanded="false" data-picker-menu="docs-fleet-filter" data-ui-sound="press" aria-label="${esc(`${facet.label}: ${every.name}`)}">`
    + `<span class="cot-c-menu__glyph">${icon(every.glyph!, { size: 18 })}</span>`
    + `<span class="cot-c-menu__words"><span class="cot-c-menu__name">${esc(every.name)}</span></span>`
    + `<span class="cot-c-menu__chev">${icon('chevronDown', { size: 16 })}</span></button></div>`;
}

/** One tank: its hero card (the angle and side pictures are built when asked for, from data-v) and its tier chip, its name,
 *  its flag and class, all one link to its dossier, named as the Garage names a card ("Tier X AbramsX, United States"). */
function tileMarkup({ tank, code, facets, classLabel }: Tile, gallery: string, stamp: string): string {
  const data = FLEET_FACETS.map((key) => ` data-${key}="${esc(facets[key])}"`).join('');
  const status = vehicleFacetsForId(tank.id)!.designStatus;
  // the aliases' words a search needs beyond the name's (never an id)
  const named = new Set(tank.displayName.toLocaleLowerCase('en-US').split(/\s+/));
  const aliases = [...new Set(tank.aliases.filter((alias) => !alias.includes('_')).join(' ').toLocaleLowerCase('en-US').split(/\s+/))]
    .filter((word) => word && !named.has(word) && !word.includes(tank.id)).join(' ');
  const nation = flagLabel(code, new Map([[code, [tank.nation]]]), t);
  const name = `${t('garage.card.aria', { tier: tank.tierNumeral, name: tank.displayName, nation })}, ${classLabel}`;
  return `<li class="dm-fleet__tile" data-id="${tank.id}"${data} data-status="${status}" data-v="${tank.views.angle} ${tank.views.angleThumb} ${tank.views.side}"`
    + `${aliases ? ` data-aliases="${esc(aliases)}"` : ''}>`
    + `<a class="dm-fleet__card" href="${gallery}?id=${tank.id}${stamp ? `&amp;${stamp}` : ''}" aria-label="${esc(name)}">`
    + `<span class="dm-fleet__media cot-hc" data-hero-facing="${heroFacing()}">`
    + `${heroCardMarkup(tank.id, '', { chip: false, className: 'dm-fleet__layer', attrs: 'data-layer="hero"' })}${heroTierChipHTML(tank.id)}</span>`
    + `<span class="dm-fleet__words"><span class="dm-fleet__name">${nameHtml(tank.displayName)}</span>`
    + `<span class="dm-fleet__meta">${flagMarkup(code, 'cot-c-flag cot-c-flag--sm')}<span>${esc(classLabel)}</span></span></span></a></li>`;
}

export function fleetGridSections(): RichSection[] {
  const data = fleetGridData();
  const gallery = hrefForLocale('/gallery', getLocale());
  const stamp = TANK_IDS.linkParam();
  const views = segmented({
    label: t('docs.fleet.view.label'), value: 'hero', className: 'dm-fleet__views', attrs: { 'data-fleet-views': '' },
    options: FLEET_VIEWS.map((view) => ({ value: view, label: t(`docs.fleet.view.${view}`) })),
  });
  const search = `<label class="dm-search__field dm-fleet__search">${icon('search', { size: 16 })}`
    + `<input type="search" data-fleet-search placeholder="${esc(t('docs.fleet.searchLabel'))}" aria-label="${esc(t('docs.fleet.searchLabel'))}"`
    + ` autocomplete="off" spellcheck="false" enterkeyhint="search"></label>`;
  const count = `<span class="dm-fleet__count" role="status" data-fleet-count>${countMarkup(data.text.total, { total: data.total })}</span>`;
  const bar = `<div class="dm-fleet__bar">${search}<div class="dm-fleet__menus">${data.facets.map(triggerMarkup).join('')}</div>${views}${count}</div>`;
  const empty = emptyState({ text: t('docs.fleet.empty'), icon: 'search', className: 'dm-fleet__empty',
    action: { label: t('picker.clear'), attrs: { 'data-fleet-clear': '' } } }).replace('class="cot-c-empty', 'hidden class="cot-c-empty');
  const list = `<div class="dm-fleet__grid"><ul class="dm-fleet__list" data-fleet-list>${fleetTiles().map((tile) => tileMarkup(tile, gallery, stamp)).join('')}</ul>${empty}</div>`;
  // the data a script reads, never markup: </ in a string is escaped so it cannot end the element
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const html = `<div class="dm-fleet" data-fleet data-view="hero">${bar}${list}<script type="application/json" id="dmFleetData">${json}</script></div>`;
  const text = fleetTiles().map(({ tank }) => tank.displayName).join(', ');
  return [{ id: 'fleet', title: t('docs.fleet.title'), html, text }];
}
