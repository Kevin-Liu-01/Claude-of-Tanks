import type { RuntimeValue } from '../runtimeTypes.ts';
// src/ui/garage.ts — full-screen garage/tank-select overlay: dark gradient
// frame with a transparent center band (the 3D pedestal shows through),
// bottom tank carousel, right stats card, top-center BATTLE button.
// Contract: docs/ARCHITECTURE.md §3.7.3.

import { ensureFonts } from './fonts.ts';
import { FEATURED_SHOTS } from './featuredShots.ts';
import { preloadImage } from './imagePreload.ts';
import { flagIconHTML, flagIconUrl } from './flags.ts';
import { flagIconCode } from './flagCodes.ts';
import { iconUrl } from './icons.ts';
import { ensureTankThumbs, drainTankThumbs, requeueTankThumbs } from './tankThumbs.ts';
import { createCamoSwatchAccess } from './camoSwatchAccess.ts';
import { createCustomCamoStudioAccess } from './customCamoStudioAccess.ts';
import {
  CAMO_TAG_IDS, CAMO_TAG_LABEL, CUSTOM_CAMO_ID,
  camoMatchesTag, camoPatternTags, customCamoPatternId,
} from '../vehicles/camoPolicy.ts';
import { createInfoButton } from './contextInfo.ts';
import { createModal } from './modal.ts';
// EQUIPMENT SYSTEM: full catalog + slot logic (game/equipment.ts), the
// white-silhouette icon set (equipIcons.ts), and the spotting-side math the
// stat card folds into its view/camo rows so the garage can never disagree
// with the battle sim.
import {
  EQUIPMENT_CATALOG, EQUIPMENT_BY_ID, EQUIP_SLOTS, EQUIP_CATEGORIES,
  loadEquipment, saveEquipment, equipEligible, computeEquipMults,
} from '../game/equipment.ts';
import type { EquipmentItem } from '../game/equipment.ts';
import { equipIconSVG } from './equipIcons.ts';
import { uiIconSVG } from './uiIcons.ts';
import { shellIconSVG } from './shellIcons.ts';
import {
  garageCrewRows, garageGalleryHref, garageModuleRows, garageSpecialSystem, garageStatGroup,
  garageTechnicalViews,
} from './garageDossier.ts';
import type { GarageTechnicalViewId } from './garageDossier.ts';
import { createRandomMapMosaic } from './randomPreviews.ts';
import {
  compareCountryThenTierThenName, countryFilterGroups, createGarageCountrySelectionMemory,
  defaultGarageMapId, horizontalRailState, horizontalRailWheelDelta,
} from './garageOrder.ts';
import { isGarageVisibleTankId } from '../game/matchmaking.ts';
import { tankTier, tierNumeral } from '../vehicles/tier.ts';
import { vehicleEraLabel } from '../vehicles/taxonomy.ts';
import { getPlayerRecord } from '../game/profile.ts';
import { mountGitHubStars } from './githubStars.ts';
import {
  viewRangeOf, baseCamoOf, equipViewMult, equipCamoBonus,
} from '../sim/spotting.ts';
import { normalizeGameMode } from '../sim/matchModes.ts';
import { shellAmmunitionCapacity } from '../sim/ammunition.ts';
import type { GameModeId } from '../sim/matchModes.ts';
import type { FleetGunSpec, FleetTankSpec } from '../vehicles/specContracts.ts';
import type { ShellSpec } from '../vehicles/specHelpers.ts';
import type { GarageVariant } from '../game/garageVariants.ts';
import type { CamoTagId, CustomCamo } from '../vehicles/camoPolicy.ts';
import type { CustomCamoStudioAccess } from './customCamoStudioAccess.ts';
import type { ImagePriority } from './imagePreload.ts';

type BattleMode = 'solo' | 'private' | 'lan' | 'ranked';
type StatRangeKey = 'hp' | 'speed' | 'hpt' | 'dmg' | 'reload' | 'aim' | 'view' | 'camo';
type StatRange = Record<StatRangeKey, [number, number]>;

interface GarageTankSpec extends FleetTankSpec {
  readonly gun: GarageGunSpec;
  readonly label?: {
    readonly displayName?: string;
    readonly shortName?: string;
  };
  readonly markings?: {
    readonly designation?: string;
    readonly filterLabel?: string;
    readonly countryLabel?: string;
  };
  readonly roster?: {
    readonly developmentOnly?: boolean;
    readonly tag?: string;
  };
}

interface GarageShellSpec extends ShellSpec {
  readonly guided?: boolean;
  readonly reloadS?: number;
}

interface GarageGunSpec extends FleetGunSpec {
  readonly autoloader?: {
    readonly magazineSize: number;
    readonly intraClipS: number;
  };
  readonly primaryGuided?: boolean;
  readonly shells: GarageShellSpec[];
}

interface GarageMap {
  readonly id: string;
  readonly name: string;
  readonly blurb?: string;
  readonly thumb?: string;
  readonly hero?: string;
}

interface GarageVariantView extends GarageVariant {
  readonly thumb?: string;
  readonly hero?: string;
}

interface GarageCamoOptions {
  readonly patterns: readonly string[];
  readonly label: Readonly<Record<string, string>>;
  get(specId: string): string;
  set(specId: string, patternId: string): void;
  getCustom?(specId: string): CustomCamo;
  setCustom?(specId: string, value: CustomCamo): void;
  prewarm?(specId: string): void;
}

interface GarageRoomStatus {
  readonly ready?: boolean;
  readonly readyCount?: number;
  readonly total?: number;
  readonly mode?: string;
  readonly roomCode?: string;
}

interface PlayRequest {
  readonly mode: BattleMode;
  readonly gameMode: GameModeId;
  readonly specId: string;
  readonly mapId: string;
  readonly startSolo: () => void;
}

export interface GarageOptions {
  readonly specs: GarageTankSpec[];
  readonly bus?: { emit(event: string, payload: RuntimeValue): void };
  readonly onSelect?: (specId: string) => void;
  readonly onBattle?: (
    specId: string,
    mapId: string,
    options: { readonly gameMode: GameModeId },
  ) => void;
  readonly onPlayRequest?: (request: PlayRequest) => void;
  readonly onPlayModeIntent?: (mode: BattleMode) => void;
  readonly onBattleIntent?: (request: { readonly specId: string; readonly mapId: string }) => void;
  readonly onStudioIntent?: () => void;
  readonly onTankIntent?: (specId: string) => void;
  readonly maps?: readonly GarageMap[];
  readonly garageVariants?: readonly GarageVariantView[];
  readonly selectedGarageVariantId?: string;
  readonly onGarageVariantMenuIntent?: () => void;
  readonly onGarageVariantIntent?: (variantId: string) => void;
  readonly onGarageVariantSelect?: (variantId: string) => void;
  readonly camo?: GarageCamoOptions;
  readonly onMapSelect?: (mapId: string) => void;
}

export interface GarageRuntime {
  readonly root: HTMLElement;
  isOpen: boolean;
  show(selected?: string): void;
  hide(): void;
  drainThumbs(): void;
  getStageRect(): { x: number; y: number; w: number; h: number };
  setSelected(specId: string): void;
  getSelected(): string;
  getSelectedGarageVariant(): string;
  setSelectedGarageVariant(variantId: string): boolean;
  getNeighborIds(radius?: number): string[];
  setRoomStatus(status?: GarageRoomStatus | null): void;
  isVehicleLocked(): boolean;
  attachSettingsControl(control: HTMLElement): void;
  getSelectedMap(): string;
  startSolo(): void;
  setSelectedMap(mapId: string): void;
}

function requiredElement<T extends Element>(parent: ParentNode, selector: string): T {
  const element = parent.querySelector<T>(selector);
  if (!element) throw new Error(`Garage markup is missing ${selector}`);
  return element;
}

function eventNode(event: Event): Node | null {
  return event.target instanceof Node ? event.target : null;
}

function eventElement(event: Event): Element | null {
  return event.target instanceof Element ? event.target : null;
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] || character);
}

function equipmentAvailabilityCopy(
  itemId: string,
  locked: boolean,
  spec: GarageTankSpec | undefined,
  openSlot: number,
): string {
  if (!locked) return `Equip in Slot ${openSlot + 1}`;
  if (itemId === 'rammer' && spec?.gun?.autoloader) {
    return 'Unavailable · autoloaders cannot mount a gun rammer';
  }
  return 'Unavailable · modern vehicles only';
}

function equipmentCategoryButtons(activeCategory: string): string {
  return EQUIP_CATEGORIES.map((category) => (
    `<button type="button" class="chip${category.id === activeCategory ? ' sel' : ''}" ` +
    `data-cat="${category.id}">${category.label}</button>`
  )).join('');
}

function equipmentTileClass(locked: boolean, fittedAt: number, openSlot: number): string[] {
  const classes = ['cot-eqtile'];
  if (locked) classes.push('locked');
  else if (fittedAt === openSlot) classes.push('sel');
  else if (fittedAt >= 0) classes.push('inother');
  return classes;
}

function equipmentTileTag(item: EquipmentItem, locked: boolean, fittedAt: number, openSlot: number): string {
  if (locked) return `<span class="tag">${item.era}</span>`;
  if (fittedAt === openSlot) return '<span class="tag">Fitted</span>';
  if (fittedAt >= 0) return `<span class="tag">Slot ${fittedAt + 1}</span>`;
  return '';
}

function equipmentTileActionCopy(
  item: EquipmentItem,
  locked: boolean,
  fittedAt: number,
  openSlot: number,
  spec: GarageTankSpec | undefined,
): string {
  if (locked) return equipmentAvailabilityCopy(item.id, true, spec, openSlot);
  if (fittedAt === openSlot) return 'Currently fitted; activate to remove';
  if (fittedAt >= 0) return `Fitted in Slot ${fittedAt + 1}; activate to move to Slot ${openSlot + 1}`;
  return `Activate to equip in Slot ${openSlot + 1}`;
}

function equipmentTileMarkup(
  item: EquipmentItem,
  spec: GarageTankSpec | undefined,
  currentLoadout: readonly string[],
  openSlot: number,
): string {
  const locked = !equipEligible(item, spec);
  const fittedAt = currentLoadout.indexOf(item.id);
  const cls = equipmentTileClass(locked, fittedAt, openSlot);
  const tag = equipmentTileTag(item, locked, fittedAt, openSlot);
  const availability = equipmentTileActionCopy(item, locked, fittedAt, openSlot, spec);
  const ariaLabel = escapeHtmlAttribute(`${item.name}. ${item.desc}. ${availability}`);
  return `<button type="button" class="${cls.join(' ')}" data-eq="${locked ? '' : item.id}" ` +
    `data-eq-id="${item.id}" data-eq-cat="${item.cat}" aria-label="${ariaLabel}" ` +
    `aria-pressed="${fittedAt === openSlot ? 'true' : 'false'}" aria-disabled="${locked ? 'true' : 'false'}">` +
    `${tag}${equipIconSVG(item.id, 38)}<span class="n">${item.name}</span>` +
    `<span class="e">${item.desc}</span></button>`;
}

function equipmentPickerTiles(
  spec: GarageTankSpec | undefined,
  currentLoadout: readonly string[],
  openSlot: number,
  activeCategory: string,
): string {
  const emptyLabel = escapeHtmlAttribute(
    `Empty Slot — remove the equipment fitted in Slot ${openSlot + 1}`,
  );
  const emptyTile =
    `<button type="button" class="cot-eqtile remove" data-eq="" data-eq-id="" ` +
    `aria-label="${emptyLabel}">` +
    `${uiIconSVG('close', 34, 'rgba(238,244,250,.86)')}` +
    '<span class="n">Empty</span><span class="e">remove equipment from this slot</span></button>';
  const itemTiles = EQUIPMENT_CATALOG
    .filter((item) => activeCategory === 'all' || item.cat === activeCategory)
    .map((item) => equipmentTileMarkup(item, spec, currentLoadout, openSlot))
    .join('');
  return emptyTile + itemTiles;
}

const NATION_LABEL: Readonly<Record<string, string>> = {
  USA: 'USA', Germany: 'GER', USSR: 'USSR', Russia: 'RUS', 'USSR/Russia': 'RUS',
  Sweden: 'SWE', Community: 'COM', UK: 'UK', France: 'FRA', Israel: 'ISR',
  China: 'CHN', 'South Korea': 'KOR', Japan: 'JPN', Italy: 'ITA',
  Poland: 'POL', Ukraine: 'UKR',
};

// One unified historical/modern catalog. Country flags are the only primary
// filter; within each country the owner-facing order is highest tier first,
// then reverse name order, with a few explicit same-tier hero runs.
// USSR / USSR-Russia / Russia intentionally share the RU flag block.
const NATION_RANK = new Map([
  ['USA', 0], ['Germany', 1],
  ['USSR', 2], ['USSR/Russia', 2], ['Russia', 2],
  ['UK', 3], ['France', 4], ['China', 5], ['Italy', 6], ['Japan', 7],
  ['Poland', 8], ['South Korea', 9], ['Sweden', 10], ['Community', 11],
  ['Israel', 12], ['Ukraine', 13],
]);
function catalogCompare(a: GarageTankSpec, b: GarageTankSpec): number {
  return compareCountryThenTierThenName(a, b, NATION_RANK, tankTier);
}
const countryCodeOf = (spec: GarageTankSpec): string => flagIconCode(spec.nation);

const SHELL_TYPE_COLOR: Readonly<Record<string, string>> = {
  AP: '#ffd27a', APCR: '#e8f4ff', HEAT: '#ff8a5c', HE: '#ffb02e', APFSDS: '#ffc46b',
};

// roster maxima for normalized stat bars are computed from the actual specs
// passed to createGarage (so bars always spread across the roster range).



// garage_ui: one shared accessibility gate for the WAAPI micro-transitions
// (the CSS entrance set is gated by the same media query in garage.css).
const REDUCED_MOTION = typeof matchMedia === 'function' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches;


// --- CAMO PICKER SECTION: demand-loaded exact swatch painter -----------------
// This renderer is decorative and used to add ~700 lines of canvas pattern
// code to the garage-critical chunk. Give every tile a deterministic painted
// placeholder immediately, then replace it with the exact existing renderer
// during an idle window. Pointer/focus intent promotes the shared request, so
// opening the camouflage surface never waits for the idle deadline.
const camoSwatchPaintVersion = new WeakMap();
const camoSwatchAccess = createCamoSwatchAccess({
  load: () => import('./camoSwatchPainter.ts'),
  isPlayable: () => window.__GAME_READY === true,
});

function scheduleCamoSwatchLoad(immediate = false) {
  return camoSwatchAccess.preload({ immediate });
}

function paintCamoSwatchPlaceholder(
  canvas: HTMLCanvasElement,
  spec: GarageTankSpec,
  pid: string,
): void {
  const W = 128;
  const H = 44;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  let hash = 2166136261;
  for (const ch of `${spec?.id || 'tank'}:${pid || 'factory'}`) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const hue = ((hash >>> 0) % 46) + 72;
  ctx.fillStyle = `hsl(${hue} 22% 25%)`;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate((hash >>> 8) % 19, 0);
  ctx.rotate(-0.34);
  ctx.fillStyle = 'rgba(18,23,20,.36)';
  for (let x = -H; x < W + H; x += 30) ctx.fillRect(x, -H, 13, H * 3);
  ctx.restore();
  const light = ctx.createLinearGradient(0, 0, 0, H);
  light.addColorStop(0, 'rgba(255,255,255,.10)');
  light.addColorStop(1, 'rgba(0,0,0,.18)');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, W, H);
}

function queueExactCamoSwatch(
  canvas: HTMLCanvasElement,
  spec: GarageTankSpec,
  pid: string,
  auto = false,
): void {
  const version = (camoSwatchPaintVersion.get(canvas) || 0) + 1;
  camoSwatchPaintVersion.set(canvas, version);
  paintCamoSwatchPlaceholder(canvas, spec, auto ? 'auto' : pid);
  scheduleCamoSwatchLoad(false).then((loaded) => {
    if (!loaded || camoSwatchPaintVersion.get(canvas) !== version) return;
    if (auto) loaded.paintAutoCamoSwatch(canvas, spec);
    else loaded.paintCamoSwatch(canvas, spec, pid);
  }).catch(() => { /* placeholder remains; the next intent retries */ });
}

function paintCamoSwatch(canvas: HTMLCanvasElement, spec: GarageTankSpec, pid: string): void {
  queueExactCamoSwatch(canvas, spec, pid, false);
}

function paintAutoCamoSwatch(canvas: HTMLCanvasElement, spec: GarageTankSpec): void {
  queueExactCamoSwatch(canvas, spec, 'auto', true);
}
// --- END CAMO PICKER SECTION -------------------------------------------------


interface GarageArmorPlate {
  readonly name?: string;
  readonly kind?: string;
  readonly keMm?: number;
  readonly physicalMm?: number;
}

function frontArmorMm(
  plates: readonly GarageArmorPlate[] | undefined,
  keys: readonly string[],
): number | null {
  if (!plates || !plates.length) return null;
  let best = null;
  for (const p of plates) {
    const n = (p.name || '').toLowerCase();
    const match = keys.some((k) => n.includes(k));
    if (match && p.kind === 'main') best = Math.max(best || 0, p.keMm || p.physicalMm || 0);
  }
  if (best == null) for (const p of plates) if (p.kind === 'main') best = Math.max(best || 0, p.keMm || 0);
  return best;
}

/**
 * Create the garage/tank-select screen. Appends its root to document.body (hidden).
 * @param {{specs:TankSpec[],bus:{emit:Function},onSelect:Function,onBattle:Function,
 *   onPlayRequest?:Function,onPlayModeIntent?:Function,onBattleIntent?:Function,
 *   onStudioIntent?:Function,onTankIntent?:Function}} opts
 * @returns {{show:Function,hide:Function,isOpen:boolean,setSelected:Function,root:HTMLElement}} Garage
 */
export function createGarage(opts: GarageOptions): GarageRuntime {
  const { bus, onSelect, onBattle } = opts;
  const allSpecs = opts.specs || [];
  // One combined fleet: country first, then descending tier and name. Cards,
  // arrow stepping and flag-chip hand-offs all use this single sorted array.
  const specs = allSpecs.filter((s) => isGarageVisibleTankId(s.id)).sort(catalogCompare);
  const countrySelection = createGarageCountrySelectionMemory(specs, countryCodeOf);
  const countryGroups = countryFilterGroups(specs, countryCodeOf).map(({ id, representative, count }) => ({
    id,
    count,
    nation: representative.nation,
    label: representative.markings?.filterLabel || NATION_LABEL[representative.nation] || id.toUpperCase(),
    name: representative.markings?.countryLabel || representative.nation,
  }));
  const technicalViews = garageTechnicalViews();
  const technicalViewById = new Map(technicalViews.map((view) => [view.id, view]));
  ensureFonts();
  const root = document.createElement('div');
  root.className = 'cot-garage';
  root.innerHTML =
    `<div class="band-top"></div><div class="band-bot"></div>` +
    `<div class="band-l"></div><div class="band-r"></div>` +
    `<div class="cot-brand-rail"><div class="title">` +
    // brand mark (tank + Claude Code commander) so the garage brand matches
    // the entry screen; master copy public/brand/logo-mark.svg
    `<img class="mark" src="/brand/logo-mark.svg" alt="" draggable="false">` +
    `<span>CLAUDE <b>OF TANKS</b></span></div>` +
    `<div class="cot-brand-utilities cot-header-nav" aria-label="Home and player record">` +
    `<button class="nv" data-nav="home" type="button" aria-label="Home" title="Home">` +
    `<img class="nvi nvi-product" src="/brand/nav/home.svg" alt="" draggable="false">` +
    `<span class="nav-label">Home</span></button>` +
    `<button class="nv cot-record-trigger" type="button" aria-label="Open local service record" ` +
    `title="Local service record" aria-haspopup="dialog" aria-expanded="false" aria-controls="cot-record-modal">` +
    `${uiIconSVG('battleRecord', 15, 'currentColor', 'nvi')}` +
    `<span class="nav-label">Record</span><span class="record-badge" aria-hidden="true">0</span></button>` +
    `<div class="cot-garage-variant-control">` +
    `<button class="nv cot-garage-variant-trigger" type="button" aria-label="Choose staging area" ` +
    `title="Garage environment" aria-haspopup="listbox" aria-expanded="false" ` +
    `aria-controls="cot-garage-variant-menu">${uiIconSVG('garage', 15, 'currentColor', 'nvi')}` +
    `<span class="nav-label cot-garage-variant-label">Staging Area</span>` +
    `${uiIconSVG('chevronRight', 10, 'currentColor', 'cot-garage-variant-chevron')}</button></div>` +
    `</div></div>` +
    `<div class="cot-garage-variant-menu" id="cot-garage-variant-menu" role="listbox" ` +
    `aria-label="Garage environments" hidden></div>` +
    `<nav class="cot-nav cot-header-nav" aria-label="Garage navigation">` +
    `<button class="nv on cot-nav-desktop" data-nav="garage" type="button" aria-label="Garage" title="Garage">` +
    `<img class="nvi nvi-product" src="/brand/nav/garage.svg" alt="" draggable="false">` +
    `<span class="nav-label">Garage</span></button>` +
    `<button class="nv cot-nav-desktop" data-nav="studio" type="button" aria-label="Studio" title="Studio">` +
    `<img class="nvi nvi-product" src="/brand/nav/studio.svg" alt="" draggable="false">` +
    `<span class="nav-label">Studio</span></button>` +
    `<button class="nv cot-nav-desktop" data-nav="gallery" type="button" aria-label="Tank Gallery" title="Tank Gallery">` +
    `<img class="nvi nvi-product" src="/brand/nav/tank-gallery.svg" alt="" draggable="false">` +
    `<span class="nav-label">Gallery</span></button>` +
    `<button class="nv cot-nav-desktop" data-nav="docs" type="button" aria-label="Documentation" title="Documentation">` +
    `<img class="nvi nvi-product" src="/brand/nav/docs.svg" alt="" draggable="false">` +
    `<span class="nav-label">Docs</span></button>` +
    `<a class="nv cot-github" data-nav="github" href="https://github.com/Kevin-Liu-01/Claude-of-Tanks" ` +
    `target="_blank" rel="noopener noreferrer" aria-label="View Claude of Tanks on GitHub" title="GitHub">` +
    `${uiIconSVG('github', 15, 'currentColor', 'nvi')}` +
    `<span class="nav-label">GitHub</span><span class="github-stars" data-github-stars data-github-stars-state="loading" aria-busy="true" aria-label="Loading GitHub star count"></span></a>` +
    `<div class="cot-settings-slot"></div>` +
    `<button class="nv cot-mobile-nav-trigger" type="button" aria-label="Open navigation menu" ` +
    `title="Menu" aria-expanded="false" aria-controls="cot-mobile-nav-menu">` +
    `${uiIconSVG('menu', 17, 'currentColor', 'nvi')}<span class="nav-label">Menu</span></button>` +
    `<div class="cot-mobile-nav-menu" id="cot-mobile-nav-menu" role="group" aria-label="Game pages" hidden>` +
    `<button type="button" data-mobile-nav="home">` +
    `<img src="/brand/nav/home.svg" alt="" draggable="false"><span class="cot-mobile-nav-copy">` +
    `<strong>Home</strong><small>Public showcase</small></span></button>` +
    `<button type="button" data-mobile-nav="garage" aria-current="page">` +
    `<img src="/brand/nav/garage.svg" alt="" draggable="false"><span class="cot-mobile-nav-copy">` +
    `<strong>Garage</strong><small>Current page</small></span></button>` +
    `<button type="button" data-mobile-nav="studio">` +
    `<img src="/brand/nav/studio.svg" alt="" draggable="false"><span class="cot-mobile-nav-copy">` +
    `<strong>Studio</strong><small>Scene tools</small></span></button>` +
    `<button type="button" data-mobile-nav="gallery">` +
    `<img src="/brand/nav/tank-gallery.svg" alt="" draggable="false"><span class="cot-mobile-nav-copy">` +
    `<strong>Gallery</strong><small>Fleet dossiers</small></span></button>` +
    `<button type="button" data-mobile-nav="docs">` +
    `<img src="/brand/nav/docs.svg" alt="" draggable="false"><span class="cot-mobile-nav-copy">` +
    `<strong>Docs</strong><small>Game handbook</small></span></button>` +
    `<button type="button" data-mobile-nav="record">` +
    `${uiIconSVG('battleRecord', 20, 'currentColor')}<span class="cot-mobile-nav-copy">` +
    `<strong>Record</strong><small>Local career stats</small></span></button>` +
    `<button type="button" data-mobile-nav="environment">` +
    `${uiIconSVG('garage', 20, 'currentColor')}<span class="cot-mobile-nav-copy">` +
    `<strong>Staging Area</strong><small>Choose battlefield location</small></span></button></div></nav>` +
    `<div class="cot-record-modal" id="cot-record-modal" role="dialog" aria-modal="true" ` +
    `aria-labelledby="cot-record-title" aria-describedby="cot-record-description" hidden>` +
    `<section class="cot-record-dialog">` +
    `<header class="cot-record-head"><div><div class="eyebrow">Local commander profile</div>` +
    `<h2 id="cot-record-title">Service Record</h2>` +
    `<p id="cot-record-description">Career totals stored on this device</p></div>` +
    `<button class="cot-record-close" type="button" aria-label="Close service record">&times;</button></header>` +
    `<div class="cot-record-body"></div></section></div>` +
    `<div class="cot-battle-control">` +
    `<button class="cot-battle" type="button" aria-label="Start Bots battle">` +
    `<span class="battle-active-icon">${uiIconSVG('battleBots', 20)}</span>` +
    `<span class="battle-word">BATTLE</span></button>` +
    `<button class="cot-battle-mode" type="button" aria-haspopup="menu" aria-expanded="false" ` +
    `aria-controls="cot-battle-menu" aria-label="Battle type: Bots. Change battle type">` +
    `<span>BOTS</span></button>` +
    `<div class="cot-battle-menu" id="cot-battle-menu" role="menu" aria-label="Battle type">` +
    `<button class="cot-battle-choice" type="button" role="menuitemradio" data-mode="solo" aria-checked="true">` +
    `<span class="choice-icon">${uiIconSVG('battleBots', 17)}</span>` +
    `<span class="choice-name">Bots</span><small>Solo</small></button>` +
    `<button class="cot-battle-choice" type="button" role="menuitemradio" data-mode="private" aria-checked="false">` +
    `<span class="choice-icon">${uiIconSVG('battlePrivate', 17)}</span>` +
    `<span class="choice-name">Private</span><small>Code</small></button>` +
    `<button class="cot-battle-choice" type="button" role="menuitemradio" data-mode="lan" aria-checked="false">` +
    `<span class="choice-icon">${uiIconSVG('battleLan', 17)}</span>` +
    `<span class="choice-name">LAN</span><small>Wi-Fi</small></button>` +
    `<button class="cot-battle-choice" type="button" role="menuitemradio" data-mode="ranked" aria-checked="false">` +
    `<span class="choice-icon">${uiIconSVG('battleRanked', 17)}</span>` +
    `<span class="choice-name">Ranked</span><small>ELO</small></button>` +
    `<div class="cot-battle-menu-label">Solo rules</div>` +
    `<button class="cot-battle-choice" type="button" role="menuitemradio" data-game-mode="capture_the_flag" aria-checked="false">` +
    `<span class="choice-icon">${uiIconSVG('modeFlag', 17)}</span>` +
    `<span class="choice-name">Capture Flag</span><small>CTF</small></button>` +
    `<button class="cot-battle-choice" type="button" role="menuitemradio" data-game-mode="zone_control" aria-checked="false">` +
    `<span class="choice-icon">${uiIconSVG('modeZones', 17)}</span>` +
    `<span class="choice-name">Zone Control</span><small>1000</small></button>` +
    `<button class="cot-battle-choice" type="button" role="menuitemradio" data-game-mode="turbo_ball" aria-checked="false">` +
    `<span class="choice-icon">${uiIconSVG('modeTurbo', 17)}</span>` +
    `<span class="choice-name">Turbo Ball</span><small>Goals</small></button>` +
    `<button class="cot-battle-choice" type="button" role="menuitemradio" data-game-mode="endless_horde" aria-checked="false">` +
    `<span class="choice-icon">${uiIconSVG('modeHorde', 17)}</span>` +
    `<span class="choice-name">Endless Horde</span><small>Waves</small></button>` +
    `</div><button class="cot-room-reminder" type="button" aria-label="Open active room">` +
    `<span class="rr-dot"></span><span class="rr-copy"></span></button></div>` +
    `<nav class="cot-garage-tools" aria-label="Garage setup previews">` +
    `<button class="cot-garage-tool cot-garage-preview-card" type="button" data-garage-panel="maps" ` +
    `aria-label="Open battlefield selection" aria-expanded="false" aria-controls="cot-garage-maps">` +
    `<span class="cot-garage-preview-head">${uiIconSVG('map', 15)}<strong>Battlefield</strong><small>Selected</small></span>` +
    `<span class="cot-garage-map-preview" aria-hidden="true"></span>` +
    `<span class="cot-garage-preview-foot"><span data-garage-map-name></span>` +
    `<small>Change ${uiIconSVG('chevronRight', 9)}</small></span></button>` +
    `<button class="cot-garage-tool cot-garage-preview-card" type="button" data-garage-panel="appearance" ` +
    `aria-label="Open camouflage selection" aria-expanded="false" aria-controls="cot-garage-camos">` +
    `<span class="cot-garage-preview-head">${uiIconSVG('camouflage', 15)}<strong>Camouflage</strong><small>Selected</small></span>` +
    `<span class="cot-garage-camo-preview" aria-hidden="true">` +
    `<canvas width="64" height="44"></canvas><canvas width="64" height="44"></canvas>` +
    `<canvas width="64" height="44"></canvas><canvas width="64" height="44"></canvas></span>` +
    `<span class="cot-garage-preview-foot"><span data-garage-camo-name></span>` +
    `<small>Change ${uiIconSVG('chevronRight', 9)}</small></span></button></nav>` +
    `<button class="cot-garage-panel-scrim" type="button" aria-label="Close garage panel"></button>` +
    `<div class="stats" id="cot-garage-dossier"></div>` +
    `<div class="cot-country-rail">` +
    `<button class="cot-country-edge prev is-unavailable" type="button" disabled aria-hidden="true" ` +
    `aria-label="Scroll countries left">${uiIconSVG('chevronLeft', 14)}</button>` +
    `<div class="cot-country-chips" role="group" aria-label="Filter vehicles by country"></div>` +
    `<button class="cot-country-edge next is-unavailable" type="button" disabled aria-hidden="true" ` +
    `aria-label="Scroll countries right">${uiIconSVG('chevronRight', 14)}</button>` +
    `</div>` +
    `<div class="cot-carousel">` +
    `<button class="cot-car-arrow prev is-unavailable" type="button" disabled aria-hidden="true" aria-label="Previous vehicle">` +
    `${uiIconSVG('chevronLeft', 15)}</button>` +
    `<div class="cot-cards" role="listbox" tabindex="0" aria-label="Vehicle catalog"></div>` +
    `<button class="cot-car-arrow next is-unavailable" type="button" disabled aria-hidden="true" aria-label="Next vehicle">` +
    `${uiIconSVG('chevronRight', 15)}</button>` +
    `</div>` +
    `<div class="cot-leftcol"><div class="cot-maps" id="cot-garage-maps"></div>` +
    `<div class="cot-camos" id="cot-garage-camos"></div></div>` +
    `<div class="hint">&#8592; &#8594; select &nbsp;&middot;&nbsp; enter to battle</div>`;
  document.body.appendChild(root);
  mountGitHubStars(root);

  function refreshServiceRecord() {
    const record = getPlayerRecord();
    const badge = root.querySelector<HTMLElement>('.cot-record-trigger .record-badge');
    if (badge) badge.textContent = record.matches > 999 ? '999+' : record.matches.toLocaleString('en-US');

    const body = root.querySelector<HTMLElement>('.cot-record-body');
    if (!body) return;
    const pct = record.matches ? Math.round((record.wins / record.matches) * 100) : 0;
    const avgDamage = record.matches ? Math.round(record.damage / record.matches) : 0;
    const avgKills = record.matches ? record.kills / record.matches : 0;
    const num = (value: number) => value.toLocaleString('en-US');
    const safe = (value: RuntimeValue) => String(value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    } as Record<string, string>)[char] ?? char);
    const metric = (label: string, value: string, note: string) => `<div class="cot-record-metric"><span>${label}</span>` +
      `<strong>${value}</strong><small>${note}</small></div>`;
    let lastBattle = `<div class="cot-record-empty">Complete a battle to begin your local service history.</div>`;
    if (record.lastBattle) {
      const last = record.lastBattle;
      const vehicle = allSpecs.find((spec) => spec.id === last.vehicleId);
      const map = (opts.maps || []).find((entry) => entry.id === last.mapId);
      const durationM = Math.floor(last.durationS / 60);
      const durationS = String(last.durationS % 60).padStart(2, '0');
      const completed = last.completedAt ? new Date(last.completedAt) : null;
      const completedLabel = completed && !Number.isNaN(completed.getTime())
        ? completed.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
        : 'Local session';
      lastBattle = `<div class="cot-last-battle"><div class="cot-last-battle-head">` +
        `<strong>${safe(last.result)}</strong><time>${safe(completedLabel)}</time></div>` +
        `<div class="cot-last-battle-grid">` +
        `<div><span>Deployment</span><b>${safe(vehicle?.label?.displayName || vehicle?.name || last.vehicleId || 'Unknown vehicle')} · ${safe(map?.name || last.mapId || 'Unknown map')}</b></div>` +
        `<div><span>Damage</span><b>${num(last.damage)}</b></div>` +
        `<div><span>Destroyed</span><b>${num(last.kills)}</b></div>` +
        `<div><span>Duration</span><b>${durationM}:${durationS}</b></div></div></div>`;
    }
    body.innerHTML = `<div class="cot-record-overview">` +
      `<div class="cot-record-ring" style="--record-pct:${pct}"><div class="cot-record-ring-copy">` +
      `<strong>${record.matches ? `${pct}%` : '—'}</strong><span>Win rate</span></div></div>` +
      `<div><div class="cot-record-outcomes">` +
      `<div class="cot-record-outcome win"><span>Victories</span><strong>${num(record.wins)}</strong></div>` +
      `<div class="cot-record-outcome"><span>Defeats</span><strong>${num(record.losses)}</strong></div>` +
      `<div class="cot-record-outcome"><span>Draws</span><strong>${num(record.draws)}</strong></div></div>` +
      `<div class="cot-record-metrics">` +
      metric('Battles', num(record.matches), 'Completed locally') +
      metric('Destroyed', num(record.kills), `${avgKills.toFixed(2)} per battle`) +
      metric('Total damage', num(record.damage), 'Career output') +
      metric('Average damage', num(avgDamage), 'Per battle') +
      metric('Best damage', num(record.bestDamage), 'Single battle') +
      metric('Decisive results', num(record.wins + record.losses), 'Non-draw battles') +
      `</div></div></div>${lastBattle}`;
  }

  // --- MARKETING FEATURED PANEL: rotating in-engine action stills ------------
  // Assets + captions come from the marketing-shots pipeline
  // (tools/marketing-shots, encoded to public/media/featured/). The panel is
  // created programmatically so the main markup block stays untouched; it
  // crossfades every 8 s, click advances, hover pauses. Images lazy-load —
  // a missing set simply never shows the panel's layers (gradient card).
  // r9.5: the list moved to featuredShots.ts — ONE copy shared with the boot
  // splash and the transition screens (hand-synced copies drifted from disk
  // twice; r9.1 was the "always the same picture" bug that caused).
  (() => {
    const col = root.querySelector<HTMLElement>('.cot-leftcol');
    if (!col || !FEATURED_SHOTS.length) return;
    const panel = document.createElement('div');
    panel.className = 'cot-featured';
    panel.innerHTML =
      `<div class="ftitle cot-sidebar-section-title"><span>${uiIconSVG('gallery', 13)}Battle gallery</span><span class="fdots">` +
      FEATURED_SHOTS.map(() => '<span></span>').join('') +
      `</span></div>` +
      `<div class="fshot"><div class="fly"></div><div class="fly"></div>` +
      `<button class="fnav prev" type="button" aria-label="Previous shot">&#8249;</button>` +
      `<button class="fnav next" type="button" aria-label="Next shot">&#8250;</button>` +
      `<div class="fcap"></div></div>`;
    col.appendChild(panel);
    const layers = panel.querySelectorAll<HTMLElement>('.fly');
    const capEl = requiredElement<HTMLElement>(panel, '.fcap');
    const dots = panel.querySelectorAll<HTMLElement>('.fdots span');
    const shotEl = requiredElement<HTMLElement>(panel, '.fshot');
    let idx = -1;
    let front = 0;
    let timer: ReturnType<typeof setInterval> | 0 = 0;
    const show = (i: number, imageUrl = FEATURED_SHOTS[i].img): void => {
      front ^= 1;
      layers[front].style.backgroundImage = `url("${imageUrl}")`;
      layers[front].classList.add('on');
      layers[front ^ 1].classList.remove('on');
      capEl.textContent = FEATURED_SHOTS[i].cap;
      dots.forEach((d, k) => d.classList.toggle('on', k === i));
      idx = i;
    };
    const preload = (i: number, cb: (url: string) => void, priority: ImagePriority = 'low'): void => {
      preloadImage(FEATURED_SHOTS[i].img, { priority }).then((url) => {
        if (url) cb(url);
      });
    };
    const jump = (i: number, priority: ImagePriority = 'high') => preload(i, (url) => show(i, url), priority);
    const advance = (priority: ImagePriority = 'low') => jump(
      (idx + 1) % FEATURED_SHOTS.length, priority);
    const arm = () => { if (!timer) timer = setInterval(advance, 8000); };
    // r9.1: manual browse resets the auto-rotate clock so it never snatches
    // the frame away right after the user picked one
    const rearm = () => { if (timer) { clearInterval(timer); timer = 0; } arm(); };
    // The compact Garage panel starts with the dedicated 44 kB preview of the
    // same full-quality shot. Full-resolution gallery media and rotation begin
    // only on user intent, so a pristine Garage never decodes hundreds of kB
    // of unrelated marketing art while its 3D scene becomes interactive.
    const first = 0;
    let activated = false;
    const activate = (priority: ImagePriority = 'low') => {
      if (activated) return;
      activated = true;
      const preview = FEATURED_SHOTS[first].bootImg || FEATURED_SHOTS[first].img;
      preloadImage(preview, { priority }).then((url) => { if (url) show(first, url); });
    };
    const activateWhenPlayable = () => {
      if (window.__GAME_READY === true) {
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(() => activate('low'), { timeout: 1400 });
        } else setTimeout(() => activate('low'), 500);
        return;
      }
      setTimeout(activateWhenPlayable, 120);
    };
    activateWhenPlayable();
    const engageGallery = () => { activate('high'); arm(); };
    shotEl.addEventListener('pointerenter', engageGallery, { once: true });
    shotEl.addEventListener('focusin', engageGallery, { once: true });
    shotEl.addEventListener('click', () => { activate('high'); advance('high'); rearm(); });
    requiredElement<HTMLButtonElement>(panel, '.fnav.prev').addEventListener('click', (e) => {
      e.stopPropagation();
      jump((idx - 1 + FEATURED_SHOTS.length) % FEATURED_SHOTS.length);
      rearm();
    });
    requiredElement<HTMLButtonElement>(panel, '.fnav.next').addEventListener('click', (e) => {
      e.stopPropagation(); advance(); rearm();
    });
    dots.forEach((d, k) => d.addEventListener('click', () => { jump(k); rearm(); }));
    shotEl.addEventListener('mouseenter', () => { if (timer) { clearInterval(timer); timer = 0; } });
    shotEl.addEventListener('mouseleave', arm);
  })();

  const statsEl = requiredElement<HTMLElement>(root, '.stats');
  const cardsEl = requiredElement<HTMLElement>(root, '.cot-cards');
  const countryRailEl = requiredElement<HTMLElement>(root, '.cot-country-rail');
  const chipsEl = requiredElement<HTMLElement>(root, '.cot-country-chips');
  const prevCountryBtn = requiredElement<HTMLButtonElement>(root, '.cot-country-edge.prev');
  const nextCountryBtn = requiredElement<HTMLButtonElement>(root, '.cot-country-edge.next');
  const prevVehicleBtn = requiredElement<HTMLButtonElement>(root, '.cot-car-arrow.prev');
  const nextVehicleBtn = requiredElement<HTMLButtonElement>(root, '.cot-car-arrow.next');
  const battleControl = requiredElement<HTMLElement>(root, '.cot-battle-control');
  const battleBtn = requiredElement<HTMLButtonElement>(root, '.cot-battle');
  const battleModeBtn = requiredElement<HTMLButtonElement>(root, '.cot-battle-mode');
  const battleMenu = requiredElement<HTMLElement>(root, '.cot-battle-menu');
  const battleChoices = [...root.querySelectorAll<HTMLButtonElement>('.cot-battle-choice[data-mode]')];
  const battleRuleChoices = [...root.querySelectorAll<HTMLButtonElement>('.cot-battle-choice[data-game-mode]')];
  const roomReminder = requiredElement<HTMLButtonElement>(root, '.cot-room-reminder');
  const mapsEl = requiredElement<HTMLElement>(root, '.cot-maps');
  const recordTrigger = requiredElement<HTMLButtonElement>(root, '.cot-record-trigger');
  const garageVariantTrigger = requiredElement<HTMLButtonElement>(root, '.cot-garage-variant-trigger');
  const garageVariantMenu = requiredElement<HTMLElement>(root, '.cot-garage-variant-menu');
  const garageVariantLabel = requiredElement<HTMLElement>(root, '.cot-garage-variant-label');
  const recordModal = requiredElement<HTMLElement>(root, '.cot-record-modal');
  const recordClose = requiredElement<HTMLButtonElement>(root, '.cot-record-close');
  const mobileNavTrigger = requiredElement<HTMLButtonElement>(root, '.cot-mobile-nav-trigger');
  const mobileNavMenu = requiredElement<HTMLElement>(root, '.cot-mobile-nav-menu');
  const compactMapPreview = requiredElement<HTMLElement>(root, '.cot-garage-map-preview');
  const compactMapName = requiredElement<HTMLElement>(root, '[data-garage-map-name]');
  const compactCamoPreviews = [...root.querySelectorAll<HTMLCanvasElement>('.cot-garage-camo-preview canvas')];
  const compactCamoName = requiredElement<HTMLElement>(root, '[data-garage-camo-name]');
  const garagePanelButtons = [...root.querySelectorAll<HTMLButtonElement>('.cot-garage-tool')];
  const garagePanelScrim = requiredElement<HTMLButtonElement>(root, '.cot-garage-panel-scrim');

  let selectedId = specs[0]?.id || '';
  let battleMode: BattleMode = 'solo';
  let battleGameMode: GameModeId = 'standard';
  let vehicleLocked = false;
  const garageVariants = Array.isArray(opts.garageVariants) ? opts.garageVariants : [];
  let selectedGarageVariantId = garageVariants.some((variant) =>
    variant.id === opts.selectedGarageVariantId)
    ? opts.selectedGarageVariantId : garageVariants[0]?.id || '';
  const garageVariantButtons = new Map<string, HTMLButtonElement>();
  const cardById = new Map<string, HTMLElement>();
  const cardsByCountry = new Map<string, HTMLElement[]>();
  const specsByCountry = new Map<string, GarageTankSpec[]>();
  const specById = new Map<string, GarageTankSpec>();
  // specById covers the FULL roster so direct tooling can still inspect a
  // delisted vehicle without exposing it in the player-facing carousel.
  function indexGarageSpecs(): void {
    for (const spec of allSpecs) specById.set(spec.id, spec);
    for (const spec of specs) {
      const countryId = countryCodeOf(spec);
      const group = specsByCountry.get(countryId) || [];
      group.push(spec);
      specsByCountry.set(countryId, group);
    }
  }
  indexGarageSpecs();

  const emit = (ev: string, payload: RuntimeValue): void => { if (bus?.emit) bus.emit(ev, payload); };
  const selectedGarageVariant = () => garageVariants.find((variant) =>
    variant.id === selectedGarageVariantId) || garageVariants[0] || null;
  const isGarageVariantMenuOpen = () => !garageVariantMenu.hidden;
  const closeGarageVariantMenu = ({ restoreFocus = false } = {}) => {
    if (!isGarageVariantMenuOpen()) return;
    garageVariantMenu.hidden = true;
    garageVariantTrigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) garageVariantTrigger.focus();
  };
  const openGarageVariantMenu = () => {
    if (!garageVariants.length) return;
    try { opts.onGarageVariantMenuIntent?.(); } catch (_) { /* optional warm path */ }
    closeBattleMenu();
    closeMobileNavigation();
    garageVariantMenu.hidden = false;
    garageVariantTrigger.setAttribute('aria-expanded', 'true');
    garageVariantButtons.get(selectedGarageVariantId)?.focus();
  };
  const refreshGarageVariantUi = () => {
    const selected = selectedGarageVariant();
    if (!selected) {
      garageVariantTrigger.hidden = true;
      return;
    }
    garageVariantLabel.textContent = selected.name;
    garageVariantTrigger.title = `${selected.name} · ${selected.location}`;
    garageVariantTrigger.setAttribute('aria-label',
      `Garage environment: ${selected.name}. Choose another environment`);
    root.dataset.garageVariant = selected.id;
    for (const [id, button] of garageVariantButtons) {
      const active = id === selected.id;
      button.classList.toggle('sel', active);
      button.setAttribute('aria-selected', String(active));
    }
  };
  const selectGarageVariant = (variantId: string, { notify = true } = {}) => {
    if (!garageVariantButtons.has(variantId)) return false;
    selectedGarageVariantId = variantId;
    refreshGarageVariantUi();
    closeGarageVariantMenu({ restoreFocus: true });
    if (notify) opts.onGarageVariantSelect?.(variantId);
    return true;
  };
  function initializeGarageVariantPicker(): void {
    for (const variant of garageVariants) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cot-garage-variant-card';
      button.setAttribute('role', 'option');
      button.dataset.variantId = variant.id;
      const image = document.createElement('img');
      image.src = variant.thumb || variant.hero || '';
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      const copy = document.createElement('span');
      copy.className = 'cot-garage-variant-copy';
      const name = document.createElement('strong');
      name.textContent = variant.name;
      const location = document.createElement('small');
      location.textContent = variant.location;
      const description = document.createElement('em');
      description.textContent = variant.description;
      copy.append(name, location, description);
      const check = document.createElement('span');
      check.className = 'cot-garage-variant-check';
      check.innerHTML = uiIconSVG('check', 12);
      button.append(image, copy, check);
      const signalVariantIntent = () => {
        try { opts.onGarageVariantIntent?.(variant.id); } catch (_) { /* optional warm path */ }
      };
      button.addEventListener('pointerenter', signalVariantIntent, { passive: true });
      button.addEventListener('focusin', signalVariantIntent);
      button.addEventListener('touchstart', signalVariantIntent, { passive: true });
      button.addEventListener('pointerdown', signalVariantIntent, { passive: true });
      button.addEventListener('click', () => {
        emit('ui:click', {});
        selectGarageVariant(variant.id);
      });
      garageVariantMenu.appendChild(button);
      garageVariantButtons.set(variant.id, button);
    }
    refreshGarageVariantUi();
  }
  initializeGarageVariantPicker();
  const signalVariantMenuIntent = () => {
    try { opts.onGarageVariantMenuIntent?.(); } catch (_) { /* optional warm path */ }
  };
  garageVariantTrigger.addEventListener('pointerenter', signalVariantMenuIntent, { passive: true });
  garageVariantTrigger.addEventListener('focusin', signalVariantMenuIntent);
  garageVariantTrigger.addEventListener('touchstart', signalVariantMenuIntent, { passive: true });
  garageVariantTrigger.addEventListener('pointerdown', signalVariantMenuIntent, { passive: true });
  const openSelectedInGallery = (layer = 'appearance') => {
    emit('ui:click', {});
    window.location.href = garageGalleryHref(selectedId, layer);
  };
  let recordRestoreFocus: HTMLElement | null = null;
  const isRecordOpen = () => recordModal.classList.contains('open');
  const openServiceRecord = () => {
    closeGarageVariantMenu();
    setGaragePanel('');
    refreshServiceRecord();
    recordRestoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    recordModal.hidden = false;
    recordModal.classList.add('open');
    recordTrigger.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => recordClose.focus());
  };
  const closeServiceRecord = ({ restoreFocus = true } = {}) => {
    if (!isRecordOpen()) return;
    recordModal.classList.remove('open');
    recordModal.hidden = true;
    recordTrigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) (recordRestoreFocus || recordTrigger).focus?.();
    recordRestoreFocus = null;
  };
  const isMobileNavigationOpen = () => !mobileNavMenu.hidden;
  const closeMobileNavigation = ({ restoreFocus = false } = {}) => {
    if (!isMobileNavigationOpen()) return;
    mobileNavMenu.hidden = true;
    mobileNavTrigger.setAttribute('aria-expanded', 'false');
    mobileNavTrigger.setAttribute('aria-label', 'Open navigation menu');
    if (restoreFocus) mobileNavTrigger.focus();
  };
  const isOverlayPanelLayout = () => document.body.dataset.cotPanels === 'overlay';
  const openGaragePanel = () => root.dataset.garagePanel || '';
  const setGaragePanel = (panel = '', { restoreFocus = false } = {}) => {
    const previous = openGaragePanel();
    const next = isOverlayPanelLayout() && panel ? panel : '';
    if (next) root.dataset.garagePanel = next;
    else delete root.dataset.garagePanel;
    root.querySelectorAll<HTMLButtonElement>('[data-garage-panel]').forEach((button) => {
      const expanded = button.dataset.garagePanel === next;
      button.setAttribute('aria-expanded', String(expanded));
    });
    if (restoreFocus && previous) {
      root.querySelector<HTMLButtonElement>(`[data-garage-panel="${previous}"]`)?.focus();
    }
    requestAnimationFrame(() => {
      syncSidebarPanelHeight();
      queueCountryRailAffordances();
    });
  };
  let technicalExpandTrigger: HTMLButtonElement | null = null;
  const technicalModal = createModal({
    title: 'Technical schematic',
    eyebrow: 'Vehicle dossier',
    subtitle: 'Expanded generated vehicle diagram',
    size: 'wide',
    className: 'cot-technical-viewer',
    closeLabel: 'Close expanded technical schematic',
    onClose: () => {
      technicalExpandTrigger?.setAttribute('aria-expanded', 'false');
      technicalExpandTrigger = null;
    },
  });
  technicalModal.panel.id = 'cot-technical-viewer-dialog';
  technicalModal.body.innerHTML =
    `<div class="cot-technical-viewer-tabs" role="tablist" aria-label="Expanded vehicle technical schematics">` +
    technicalViews.map((view, index) =>
      `<button class="cot-technical-viewer-tab" type="button" role="tab" ` +
      `id="cot-technical-viewer-tab-${view.id}" aria-controls="cot-technical-viewer-panel" ` +
      `aria-selected="${index === 0 ? 'true' : 'false'}" tabindex="${index === 0 ? '0' : '-1'}" ` +
      `data-technical-modal-view="${view.id}">${view.label}</button>`).join('') + `</div>` +
    `<figure class="cot-technical-viewer-figure" id="cot-technical-viewer-panel" role="tabpanel" ` +
    `aria-labelledby="cot-technical-viewer-tab-armor">` +
    `<img data-technical-modal-image alt="" draggable="false" decoding="async">` +
    `<figcaption><span data-technical-modal-caption></span>` +
    `<small>Generated from the playable vehicle anatomy</small></figcaption></figure>`;
  const technicalModalImage = requiredElement<HTMLImageElement>(technicalModal.body, '[data-technical-modal-image]');
  const technicalModalCaption = requiredElement<HTMLElement>(technicalModal.body, '[data-technical-modal-caption]');
  const technicalModalPanel = requiredElement<HTMLElement>(technicalModal.body, '#cot-technical-viewer-panel');
  const technicalModalTabs = [...technicalModal.body.querySelectorAll<HTMLButtonElement>('[data-technical-modal-view]')];

  const selectTechnicalModalView = (viewId: GarageTechnicalViewId): void => {
    const view = technicalViewById.get(viewId);
    const spec = specById.get(selectedId);
    if (!view || !spec) return;
    const name = spec.label?.displayName || spec.name;
    technicalModal.setTitle(`${name} — ${view.label}`);
    technicalModal.setSubtitle(view.caption);
    technicalModalImage.src = iconUrl(spec.id, view.assetView);
    technicalModalImage.alt = `${name} ${view.caption.toLowerCase()}`;
    technicalModalCaption.textContent = view.caption;
    technicalModalPanel.setAttribute('aria-labelledby', `cot-technical-viewer-tab-${view.id}`);
    for (const tab of technicalModalTabs) {
      const active = tab.dataset.technicalModalView === view.id;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      tab.toggleAttribute('autofocus', active);
    }
  };
  const openTechnicalViewer = (viewId: GarageTechnicalViewId, trigger: HTMLButtonElement): void => {
    closeGarageVariantMenu();
    closeMobileNavigation();
    closeBattleMenu();
    setGaragePanel('');
    technicalExpandTrigger?.setAttribute('aria-expanded', 'false');
    technicalExpandTrigger = trigger;
    technicalExpandTrigger.setAttribute('aria-expanded', 'true');
    selectTechnicalModalView(viewId);
    technicalModal.open({ trigger });
  };
  function bindTechnicalViewerTabs(): void {
    for (const tab of technicalModalTabs) {
      tab.addEventListener('click', () => {
        const viewId = tab.dataset.technicalModalView as GarageTechnicalViewId | undefined;
        if (!viewId) return;
        emit('ui:click', {});
        selectTechnicalModalView(viewId);
      });
    }
  }
  bindTechnicalViewerTabs();
  technicalModal.body.addEventListener('keydown', (event) => {
    const tab = eventElement(event)?.closest<HTMLButtonElement>('[data-technical-modal-view]');
    if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = Math.max(0, technicalModalTabs.indexOf(tab));
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? technicalModalTabs.length - 1
      : (current + (event.key === 'ArrowRight' ? 1 : -1) + technicalModalTabs.length) % technicalModalTabs.length;
    technicalModalTabs[next].focus();
    selectTechnicalModalView(technicalModalTabs[next].dataset.technicalModalView as GarageTechnicalViewId);
  });
  garagePanelButtons.forEach((button) => button.addEventListener('click', () => {
    emit('ui:click', {});
    const panel = button.dataset.garagePanel;
    setGaragePanel(openGaragePanel() === panel ? '' : panel);
  }));
  garagePanelScrim.addEventListener('click', () => setGaragePanel('', { restoreFocus: true }));
  window.addEventListener('cot:layoutchange', () => {
    if (!isOverlayPanelLayout()) setGaragePanel('');
    syncSidebarPanelHeight();
  });
  const openMobileNavigation = () => {
    closeBattleMenu();
    setGaragePanel('');
    mobileNavMenu.hidden = false;
    mobileNavTrigger.setAttribute('aria-expanded', 'true');
    mobileNavTrigger.setAttribute('aria-label', 'Close navigation menu');
  };
  mobileNavTrigger.addEventListener('click', () => {
    emit('ui:click', {});
    if (isMobileNavigationOpen()) closeMobileNavigation();
    else openMobileNavigation();
  });
  document.addEventListener('pointerdown', (event) => {
    const target = eventNode(event);
    if (isGarageVariantMenuOpen() && event.target !== garageVariantTrigger &&
      !garageVariantTrigger.contains(target) && !garageVariantMenu.contains(target)) {
      closeGarageVariantMenu();
    }
    if (isMobileNavigationOpen() && event.target !== mobileNavTrigger &&
      !mobileNavTrigger.contains(target) && !mobileNavMenu.contains(target)) {
      closeMobileNavigation();
    }
  });
  // Escape belongs to the open disclosure. Capture it before the game's
  // rebindable input layer so closing navigation cannot also open Settings.
  window.addEventListener('keydown', (event) => {
    if (!isGarageVariantMenuOpen() || event.code !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closeGarageVariantMenu({ restoreFocus: true });
  }, true);
  window.addEventListener('keydown', (event) => {
    if (!isMobileNavigationOpen() || event.code !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closeMobileNavigation({ restoreFocus: true });
  }, true);
  window.addEventListener('keydown', (event) => {
    if (!openGaragePanel() || event.code !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setGaragePanel('', { restoreFocus: true });
  }, true);
  window.addEventListener('keydown', (event) => {
    if (!battleMenu.classList.contains('open') || event.code !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closeBattleMenu({ restoreFocus: true });
  }, true);
  // Capture before the global rebindable input layer is created. Escape must
  // close this modal without also firing the settings-menu action behind it.
  window.addEventListener('keydown', (event) => {
    if (!isRecordOpen()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.code === 'Escape') closeServiceRecord();
    else if (event.code === 'Tab') recordClose.focus();
  }, true);

  // Show an edge affordance only while cards actually remain beyond it.
  // Keep unavailable buttons in layout (visibility:hidden) so the strip does
  // not jump sideways as the user reaches either end.
  const syncCarouselAffordances = () => {
    const maxScroll = Math.max(0, cardsEl.scrollWidth - cardsEl.clientWidth);
    const hasLeft = maxScroll > 1 && cardsEl.scrollLeft > 2;
    const hasRight = maxScroll > 1 && cardsEl.scrollLeft < maxScroll - 2;
    cardsEl.classList.toggle('has-more-left', hasLeft);
    cardsEl.classList.toggle('has-more-right', hasRight);
    const affordances: Array<[HTMLButtonElement, boolean]> = [
      [prevVehicleBtn, hasLeft], [nextVehicleBtn, hasRight],
    ];
    for (const [button, available] of affordances) {
      button.disabled = !available;
      button.classList.toggle('is-unavailable', !available);
      button.setAttribute('aria-hidden', String(!available));
    }
  };
  const queueCarouselAffordances = () => requestAnimationFrame(syncCarouselAffordances);
  cardsEl.addEventListener('scroll', syncCarouselAffordances, { passive: true });
  window.addEventListener('resize', queueCarouselAffordances);

  // Country flags use the same honest overflow contract as the vehicle strip:
  // fixed edge fades/buttons appear only where hidden content really exists.
  const syncCountryRailAffordances = () => {
    const { hasLeft, hasRight } = horizontalRailState(
      chipsEl.scrollLeft, chipsEl.scrollWidth, chipsEl.clientWidth,
    );
    countryRailEl.classList.toggle('has-more-left', hasLeft);
    countryRailEl.classList.toggle('has-more-right', hasRight);
    const affordances: Array<[HTMLButtonElement, boolean]> = [
      [prevCountryBtn, hasLeft], [nextCountryBtn, hasRight],
    ];
    for (const [button, available] of affordances) {
      button.disabled = !available;
      button.classList.toggle('is-unavailable', !available);
      button.setAttribute('aria-hidden', String(!available));
    }
  };
  const queueCountryRailAffordances = () => requestAnimationFrame(syncCountryRailAffordances);
  const scrollCountries = (direction: number): void => {
    const distance = Math.max(180, chipsEl.clientWidth * 0.72);
    chipsEl.scrollBy({ left: direction * distance, behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
  };
  chipsEl.addEventListener('scroll', syncCountryRailAffordances, { passive: true });
  chipsEl.addEventListener('wheel', (event) => {
    const { maxScroll } = horizontalRailState(
      chipsEl.scrollLeft, chipsEl.scrollWidth, chipsEl.clientWidth,
    );
    if (maxScroll <= 1) return;
    const delta = horizontalRailWheelDelta(
      event.deltaX, event.deltaY, event.deltaMode, chipsEl.clientWidth,
    );
    if (!delta) return;
    const before = chipsEl.scrollLeft;
    const target = Math.max(0, Math.min(maxScroll, before + delta));
    if (Math.abs(target - before) < 0.5) return;
    event.preventDefault();
    chipsEl.scrollLeft = target;
    syncCountryRailAffordances();
  }, { passive: false });
  prevCountryBtn.addEventListener('click', () => {
    emit('ui:click', {});
    scrollCountries(-1);
  });
  nextCountryBtn.addEventListener('click', () => {
    emit('ui:click', {});
    scrollCountries(1);
  });
  window.addEventListener('resize', queueCountryRailAffordances);

  // --- MAP-CONFIG WIRING: battlefield picker (maps come from createGarage
  // opts.maps = [{id,name,blurb,thumb}]; 'random' rolls at battle start) ---
  const maps = opts.maps || [];
  let selectedMapId = defaultGarageMapId(maps);
  const mapCardById = new Map<string, HTMLElement>();
  function refreshCompactMapPreview(): void {
    const selected = maps.find((map) => map.id === selectedMapId) || maps[0];
    if (!selected) return;
    compactMapName.textContent = selected.name;
    compactMapPreview.className = `cot-garage-map-preview ${selected.id}`;
    compactMapPreview.style.removeProperty('background-image');
    compactMapPreview.replaceChildren();
    if (selected.id === 'random') compactMapPreview.appendChild(createRandomMapMosaic(maps));
    else if (selected.thumb) {
      compactMapPreview.style.backgroundImage = `url("${selected.thumb.replace(/"/g, '%22')}")`;
    }
  }
  function initializeMapPicker(): void {
    if (!maps.length) return;
    const title = document.createElement('div');
    title.className = 'mtitle cot-sidebar-section-title';
    title.innerHTML = `${uiIconSVG('map', 13)}<span>Battlefield</span>`;
    title.appendChild(createInfoButton({
      label: 'About battlefield selection',
      title: 'Battlefield',
      text: 'Choose the terrain used by the next battle. Random rolls from the full available battlefield roster when deployment begins; room hosts make the final selection for multiplayer matches.',
      images: () => {
        const selected = maps.find((map) => map.id === selectedMapId && map.thumb)
          || maps.find((map) => map.thumb);
        if (!selected) return [];
        const action = FEATURED_SHOTS.find((shot) => shot.maps?.includes(selected.id));
        return [{
          src: selected.hero || selected.thumb,
          alt: `${selected.name} battlefield preview`,
          caption: `${selected.name} // battlefield preview`,
        }, action ? {
          src: action.img,
          alt: action.cap,
          caption: `${action.cap} // live game capture`,
        } : null].filter(Boolean);
      },
      sections: [
        { icon: 'map', title: 'Solo deployment', text: 'Your selection is resolved when the battle begins.' },
        { icon: 'team', title: 'Multiplayer rooms', text: 'The room host owns the final battlefield choice.' },
      ],
    }));
    mapsEl.appendChild(title);
    const mapScroll = document.createElement('div');
    mapScroll.className = 'cot-map-scroll';
    mapsEl.appendChild(mapScroll);
    const mapGrid = document.createElement('div');
    mapGrid.className = 'cot-map-grid';
    mapScroll.appendChild(mapGrid);
    const mapThumbLoaders = new WeakMap<Element, () => void>();
    const mapThumbObserver = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          mapThumbLoaders.get(entry.target)?.();
          mapThumbObserver?.unobserve(entry.target);
        }
      }, { root: mapScroll, rootMargin: '120px' })
      : null;
    for (const m of maps) {
      const card = document.createElement('div');
      card.className = 'cot-map-card';
      card.title = m.name;
      const thumb = document.createElement('div');
      thumb.className = `mthumb ${m.id}`;
      const loadThumb = () => {
        if (thumb.dataset.loaded === 'true') return;
        thumb.dataset.loaded = 'true';
        if (m.id === 'random') thumb.appendChild(createRandomMapMosaic(maps));
        else if (m.thumb) thumb.style.backgroundImage = `url("${m.thumb.replace(/"/g, '%22')}")`;
      };
      mapThumbLoaders.set(thumb, loadThumb);
      if (mapThumbObserver) mapThumbObserver.observe(thumb);
      else loadThumb();
      const nm = document.createElement('div');
      nm.className = 'mname';
      nm.textContent = m.name;
      card.append(thumb, nm);
      card.addEventListener('click', () => {
        emit('ui:click', {});
        api.setSelectedMap(m.id);
        if (isOverlayPanelLayout()) setGaragePanel('');
      });
      mapGrid.appendChild(card);
      mapCardById.set(m.id, card);
    }
  }
  initializeMapPicker();
  // Scroll masks are affordances, not decoration: the head appears only after
  // content moves above the viewport, while the tail appears only while more
  // remains below. Both depths collapse near their respective ends so the
  // first and last cards resolve to full opacity instead of hitting a shelf.
  const syncScrollFades = () => {
    const mapScroll = mapsEl.querySelector('.cot-map-scroll');
    if (mapScroll) mapScroll.classList.toggle('can-scroll', mapScroll.scrollHeight > mapScroll.clientHeight + 1);
    const cg = root.querySelector('.cot-camos .cgrid.camo');
    if (cg) cg.classList.toggle('can-scroll', cg.scrollHeight > cg.clientHeight + 1);
    const dossierPassed = Math.max(0, statsEl.scrollTop);
    const dossierRemaining = Math.max(0,
      statsEl.scrollHeight - statsEl.clientHeight - statsEl.scrollTop);
    const hasDossierHead = dossierPassed > 1;
    const hasDossierTail = statsEl.scrollHeight > statsEl.clientHeight + 1 && dossierRemaining > 1;
    statsEl.classList.toggle('has-scroll-head', hasDossierHead);
    statsEl.classList.toggle('has-scroll-tail', hasDossierTail);
    statsEl.classList.toggle('has-scroll-mask', hasDossierHead || hasDossierTail);
    if (hasDossierHead) {
      statsEl.style.setProperty('--cot-dossier-head-fade', `${Math.min(64, dossierPassed)}px`);
    } else {
      statsEl.style.removeProperty('--cot-dossier-head-fade');
    }
    if (hasDossierTail) {
      statsEl.style.setProperty('--cot-dossier-tail-fade', `${Math.min(64, dossierRemaining)}px`);
    } else {
      statsEl.style.removeProperty('--cot-dossier-tail-fade');
    }
  };
  window.addEventListener('resize', syncScrollFades);
  statsEl.addEventListener('scroll', syncScrollFades, { passive: true });
  requestAnimationFrame(syncScrollFades);
  // The map roster now exceeds the short-viewport column. Its flex height
  // can settle after the first animation frame (once the camo grid measures),
  // so window resize alone is insufficient to keep the fade affordance true.
  function observeScrollFadeSize(): void {
    if (typeof ResizeObserver !== 'function') return;
    const scrollFadeObserver = new ResizeObserver(syncScrollFades);
    const mapScroll = mapsEl.querySelector('.cot-map-scroll');
    if (mapScroll) scrollFadeObserver.observe(mapScroll);
    scrollFadeObserver.observe(statsEl);
  }
  observeScrollFadeSize();

  // --- CAMO PICKER SECTION: per-tank paint pattern -------------------------
  // opts.camo = { patterns: string[], label: {id:label}, get(specId),
  //               set(specId, patternId) } (main.ts injects the materials.js
  //               persistence + live-repaint hooks). Selection is per tank,
  //               shown on the pedestal immediately, and persists via
  //               localStorage inside opts.camo.set.
  const camoOpts = opts.camo || null;
  const camosEl = requiredElement<HTMLElement>(root, '.cot-camos');
  const promoteCamoSwatches = () => {
    scheduleCamoSwatchLoad(true).catch(() => { /* next interaction retries */ });
  };
  camosEl.addEventListener('pointerenter', promoteCamoSwatches, { once: true });
  camosEl.addEventListener('focusin', promoteCamoSwatches, { once: true });
  camosEl.addEventListener('touchstart', promoteCamoSwatches, { once: true, passive: true });
  const camoCardById = new Map<string, HTMLElement>();
  const camoTagButtonById = new Map<CamoTagId, HTMLButtonElement>();
  let activeCamoTag: CamoTagId = 'all';
  let customCamoStudioAccess: CustomCamoStudioAccess | null = null;
  function initializeCamoPicker(): void {
    if (!camoOpts?.patterns?.length) return;
    const title = document.createElement('div');
    title.className = 'ctitle cot-sidebar-section-title';
    title.innerHTML = `${uiIconSVG('camouflage', 13)}<span>Camouflage</span>`;
    const titleActions = document.createElement('div');
    titleActions.className = 'cot-camo-title-actions';
    titleActions.appendChild(createInfoButton({
      label: 'About camouflage concealment',
      title: 'Camouflage concealment',
      text: '+3.5% concealment on matching maps. Auto always selects a matching seasonal pattern; manually selected camouflage only receives the bonus on compatible battlefields.',
      images: () => {
        const selected = specById.get(selectedId);
        if (!selected) return [];
        const tile = document.createElement('canvas');
        tile.width = 480;
        tile.height = 180;
        const current = camoOpts.get(selected.id);
        paintCamoSwatch(tile, selected, current === CUSTOM_CAMO_ID && camoOpts.getCustom
          ? customCamoPatternId(camoOpts.getCustom(selected.id)) : current);
        return [{
          src: tile.toDataURL('image/png'),
          alt: 'Selected camouflage pattern tile',
          caption: 'Current paint // material swatch',
        }, {
          src: iconUrl(selected.id, 'angle'),
          alt: `${selected.label?.displayName || selected.name} camouflage reference`,
          fit: 'contain',
          caption: `${selected.label?.displayName || selected.name} // vehicle application`,
        }];
      },
      sections: [
        { icon: 'camouflage', title: 'Matching biome', text: 'Compatible seasonal paint adds 3.5% concealment.' },
        { icon: 'brush', title: 'Local studio', text: 'Custom recipes are device-local and convert to Factory paint online.' },
      ],
    }));
    let customOpenButton: HTMLButtonElement | null = null;
    if (typeof camoOpts.getCustom === 'function' && typeof camoOpts.setCustom === 'function') {
      customOpenButton = document.createElement('button');
      customOpenButton.type = 'button';
      customOpenButton.className = 'cot-custom-open';
      customOpenButton.innerHTML = `${uiIconSVG('brush', 12)}<span>Create</span>`;
      customOpenButton.setAttribute('aria-label', 'Create custom camouflage');
      customOpenButton.setAttribute('aria-haspopup', 'dialog');
      customOpenButton.setAttribute('aria-expanded', 'false');
      titleActions.appendChild(customOpenButton);
    }
    title.appendChild(titleActions);
    camosEl.appendChild(title);
    const tagBar = document.createElement('div');
    tagBar.className = 'cot-camo-tags';
    tagBar.setAttribute('role', 'toolbar');
    tagBar.setAttribute('aria-label', 'Filter camouflage by tag');
    for (const tagId of CAMO_TAG_IDS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cot-camo-tag';
      button.dataset.camoTag = tagId;
      button.textContent = CAMO_TAG_LABEL[tagId];
      button.title = `Show ${CAMO_TAG_LABEL[tagId]} camouflage`;
      button.setAttribute('aria-pressed', String(tagId === activeCamoTag));
      button.addEventListener('click', () => {
        emit('ui:click', {});
        activeCamoTag = activeCamoTag === tagId && tagId !== 'all' ? 'all' : tagId;
        refreshCamoTagFilters();
      });
      tagBar.appendChild(button);
      camoTagButtonById.set(tagId, button);
    }
    camosEl.appendChild(tagBar);
    const grid = document.createElement('div');
    // camo r8: 'camo' modifier — the pattern roster grew 6 -> 16, so THIS
    // grid scrolls (max-height in css) while the equipment grid below stays
    // static. Tools query `.cot-camos .cgrid` first-match as before.
    grid.className = 'cgrid camo';
    camosEl.appendChild(grid);
    for (const pid of camoOpts.patterns) {
      const card = document.createElement('div');
      card.className = 'cot-camo-card';
      card.dataset.pid = pid; // camo r8: stable hook for tools + tests
      card.innerHTML = pid === 'auto'
        ? `<div class="sw auto"><canvas></canvas></div><div class="cl"></div>`
        : `<div class="sw"><canvas></canvas></div><div class="cl"></div>`;
      requiredElement<HTMLElement>(card, '.cl').textContent =
        (camoOpts.label && camoOpts.label[pid]) || pid;
      card.title = (camoOpts.label && camoOpts.label[pid]) || pid;
      card.addEventListener('click', () => {
        emit('ui:click', {});
        if (!selectedId) return;
        camoOpts.set(selectedId, pid);
        refreshCamoSel();
        if (isOverlayPanelLayout()) setGaragePanel('');
        // Keep the packaged portrait healthy; the live pedestal is the
        // authoritative camouflage preview.
        requeueTankThumbs(selectedId);
      });
      grid.appendChild(card);
      camoCardById.set(pid, card);
    }
    if (typeof camoOpts.getCustom === 'function' && typeof camoOpts.setCustom === 'function') {
      const button = requiredElement<HTMLButtonElement>(titleActions, '.cot-custom-open');
      const getCustom = camoOpts.getCustom;
      const setCustom = camoOpts.setCustom;
      customCamoStudioAccess = createCustomCamoStudioAccess(async () => {
        const { createCustomCamoStudio } = await import('./customCamoStudio.ts');
        return createCustomCamoStudio({
          button,
          camo: { getCustom, setCustom },
          selectedId: () => selectedId,
          selectedSpec: () => (selectedId ? specById.get(selectedId) : null),
          paintPreview: (canvas, _spec, patternId) => {
            const selected = specById.get(selectedId);
            if (selected) paintCamoSwatch(canvas, selected, patternId);
          },
          emitClick: () => emit('ui:click', {}),
          refreshSelection: refreshCamoSel,
          requeueThumb: requeueTankThumbs,
        });
      });
      const preloadStudio = () => {
        customCamoStudioAccess?.preload().catch(() => { /* the click path retries */ });
      };
      button.addEventListener('pointerenter', preloadStudio, { once: true });
      button.addEventListener('focus', preloadStudio, { once: true });
      button.addEventListener('click', async () => {
        button.setAttribute('aria-busy', 'true');
        button.removeAttribute('data-load-error');
        try {
          await customCamoStudioAccess?.open();
          button.removeAttribute('title');
        } catch (error) {
          button.dataset.loadError = 'true';
          button.title = 'Custom studio could not load. Click to retry.';
          console.warn('[garage] custom camouflage studio failed to load', error);
        } finally {
          button.removeAttribute('aria-busy');
        }
      });
    }
  }
  initializeCamoPicker();
  // Battlefield and camouflage form one balanced pair. They share the
  // available vertical budget, grow together, and stop once the taller
  // section can show all of its content. Any excess room remains below the
  // pair for Battle Gallery rather than stretching either plate into a void.
  function syncSidebarPanelHeight() {
    const leftcol = root.querySelector<HTMLElement>('.cot-leftcol');
    if (!leftcol || isOverlayPanelLayout() || getComputedStyle(mapsEl).display === 'none') {
      leftcol?.style.removeProperty('--cot-sidebar-panel-height');
      return;
    }
    const style = getComputedStyle(leftcol);
    const gap = Number.parseFloat(style.rowGap || style.gap) || 8;
    const fixedChildren = [...leftcol.children]
      .filter((child): child is HTMLElement => child instanceof HTMLElement &&
        child !== mapsEl && child !== camosEl && getComputedStyle(child).display !== 'none');
    const fixedHeight = fixedChildren.reduce((sum, child) => sum + child.offsetHeight, 0);
    const gapHeight = gap * Math.max(0, leftcol.children.length - 1);
    const pairBudget = Math.max(216, leftcol.clientHeight - fixedHeight - gapHeight);
    const mapTitle = mapsEl.querySelector<HTMLElement>('.mtitle');
    const mapGrid = mapsEl.querySelector<HTMLElement>('.cot-map-grid');
    const camoTitle = camosEl.querySelector<HTMLElement>('.ctitle');
    const camoGrid = camosEl.querySelector<HTMLElement>('.cgrid.camo');
    const mapIntrinsic = (mapTitle?.offsetHeight || 0) + (mapGrid?.scrollHeight || 0) + 25;
    const camoIntrinsic = (camoTitle?.offsetHeight || 0) + (camoGrid?.scrollHeight || 0) + 25;
    const contentCap = Math.max(108, mapIntrinsic, camoIntrinsic);
    const height = Math.floor(Math.min(pairBudget / 2, contentCap));
    const next = `${height}px`;
    if (leftcol.style.getPropertyValue('--cot-sidebar-panel-height') !== next) {
      leftcol.style.setProperty('--cot-sidebar-panel-height', next);
      requestAnimationFrame(syncScrollFades);
    }
  }
  window.addEventListener('resize', syncSidebarPanelHeight);
  requestAnimationFrame(syncSidebarPanelHeight);
  function observeSidebarSize(): void {
    if (typeof ResizeObserver !== 'function') return;
    const sidebarSizeObserver = new ResizeObserver(syncSidebarPanelHeight);
    sidebarSizeObserver.observe(requiredElement<HTMLElement>(root, '.cot-leftcol'));
  }
  observeSidebarSize();
  // --- EQUIPMENT SYSTEM: slot boxes on the stats card + item picker --------
  // Catalog/persistence/era-gating live in game/equipment.ts (localStorage
  // `cot.equip.<specId>`, read battle-side by game/state.ts at spawn). The
  // three slot boxes are rendered INTO the stats card by renderStats (the
  // card rebuilds its innerHTML per vehicle), so slot clicks are delegated
  // from statsEl here; the picker is a side panel anchored next to the card.
  const eqpickEl = document.createElement('div');
  eqpickEl.className = 'cot-eqpick';
  root.appendChild(eqpickEl);
  const eqTooltipEl = document.createElement('div');
  eqTooltipEl.id = 'cot-equipment-tooltip';
  eqTooltipEl.className = 'cot-eqtooltip';
  eqTooltipEl.setAttribute('role', 'tooltip');
  eqTooltipEl.setAttribute('aria-hidden', 'true');
  root.appendChild(eqTooltipEl);
  let eqOpenSlot = -1;   // -1 = picker closed
  let eqCat = 'all';     // active category chip
  let eqTooltipTimer: ReturnType<typeof setTimeout> | null = null;
  let eqTooltipAnchor: HTMLElement | null = null;
  let eqTooltipWarmUntil = 0;

  const curLoadout = () =>
    selectedId ? loadEquipment(selectedId, specById.get(selectedId)) : [];

  function hideEqTooltip(primeNext = true): void {
    if (eqTooltipTimer !== null) {
      clearTimeout(eqTooltipTimer);
      eqTooltipTimer = null;
    }
    if (eqTooltipAnchor) eqTooltipAnchor.removeAttribute('aria-describedby');
    if (primeNext && eqTooltipEl.classList.contains('show')) {
      eqTooltipWarmUntil = performance.now() + 900;
    }
    eqTooltipAnchor = null;
    eqTooltipEl.classList.remove('show');
    eqTooltipEl.setAttribute('aria-hidden', 'true');
  }

  function positionEqTooltip(anchor: HTMLElement): void {
    const anchorRect = anchor.getBoundingClientRect();
    const pickerRect = eqpickEl.getBoundingClientRect();
    const tipRect = eqTooltipEl.getBoundingClientRect();
    const gap = 12;
    const viewportPad = 10;
    const fitsLeft = pickerRect.left - tipRect.width - gap >= viewportPad;
    let left = fitsLeft
      ? pickerRect.left - tipRect.width - gap
      : pickerRect.right + gap;
    let top = anchorRect.top + anchorRect.height / 2 - tipRect.height / 2;
    left = Math.max(viewportPad, Math.min(left, window.innerWidth - tipRect.width - viewportPad));
    top = Math.max(viewportPad, Math.min(top, window.innerHeight - tipRect.height - viewportPad));
    eqTooltipEl.dataset.side = fitsLeft ? 'left' : 'right';
    eqTooltipEl.style.left = `${Math.round(left)}px`;
    eqTooltipEl.style.top = `${Math.round(top)}px`;
  }

  function showEqTooltip(anchor: HTMLElement): void {
    if (!eqpickEl.classList.contains('open') || !anchor.isConnected) return;
    const itemId = anchor.dataset.eqId || '';
    const item = itemId ? EQUIPMENT_BY_ID.get(itemId) : null;
    const locked = anchor.classList.contains('locked');
    const fittedAt = item ? curLoadout().indexOf(item.id) : -1;
    const spec = selectedId ? specById.get(selectedId) : undefined;
    const category = item
      ? EQUIP_CATEGORIES.find((candidate) => candidate.id === item.cat)?.label || 'Equipment'
      : 'Slot action';
    const state = !item
      ? `Clear Slot ${eqOpenSlot + 1}`
      : locked
        ? equipmentAvailabilityCopy(item.id, true, spec, eqOpenSlot)
        : fittedAt === eqOpenSlot
          ? 'Currently fitted · click to remove'
          : fittedAt >= 0
            ? `Fitted in Slot ${fittedAt + 1} · click to move here`
            : equipmentAvailabilityCopy(item.id, false, spec, eqOpenSlot);

    const eyebrow = document.createElement('span');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = category;
    const name = document.createElement('strong');
    name.textContent = item?.name || 'Empty Slot';
    const detail = document.createElement('span');
    detail.className = 'detail';
    detail.textContent = item?.desc || 'Remove the equipment fitted in this slot.';
    const action = document.createElement('span');
    action.className = 'action';
    action.textContent = state;
    eqTooltipEl.replaceChildren(eyebrow, name, detail, action);
    eqTooltipEl.dataset.category = item?.cat || 'action';
    eqTooltipEl.setAttribute('aria-hidden', 'false');
    eqTooltipEl.classList.add('show');
    eqTooltipAnchor = anchor;
    anchor.setAttribute('aria-describedby', eqTooltipEl.id);
    positionEqTooltip(anchor);
  }

  function queueEqTooltip(anchor: HTMLElement, keyboard = false): void {
    if (eqTooltipAnchor === anchor && eqTooltipEl.classList.contains('show')) return;
    hideEqTooltip(false);
    eqTooltipAnchor = anchor;
    const delay = performance.now() < eqTooltipWarmUntil ? 0 : keyboard ? 160 : 360;
    eqTooltipTimer = setTimeout(() => {
      eqTooltipTimer = null;
      if (eqTooltipAnchor === anchor) showEqTooltip(anchor);
    }, delay);
  }

  /** Assign/remove an item in the open slot, persist, refresh the card. */
  function eqAssign(itemId: string | null): void {
    if (vehicleLocked || !selectedId || eqOpenSlot < 0) return;
    const spec = specById.get(selectedId);
    if (!spec) return;
    const cur = curLoadout();
    const prev = itemId ? cur.indexOf(itemId) : -1;
    if (itemId && prev === eqOpenSlot) {
      // re-picking the item already in this slot = unequip it
      cur.splice(eqOpenSlot, 1);
    } else if (itemId) {
      if (prev >= 0) cur.splice(prev, 1); // moving from another slot
      if (eqOpenSlot < cur.length) cur.splice(eqOpenSlot, 1, itemId);
      else cur.push(itemId);
    } else if (eqOpenSlot < cur.length) {
      cur.splice(eqOpenSlot, 1); // REMOVE tile
    }
    saveEquipment(selectedId, cur, spec);
    closeEqPicker();
    renderStats(spec); // slots + modified stat bars
  }

  function renderEqPicker() {
    if (!selectedId || eqOpenSlot < 0) return;
    hideEqTooltip(false);
    const spec = specById.get(selectedId);
    const cur = curLoadout();
    const chips = equipmentCategoryButtons(eqCat);
    const tiles = equipmentPickerTiles(spec, cur, eqOpenSlot, eqCat);
    eqpickEl.innerHTML =
      `<div class="ph"><span class="t">Equipment &middot; <i>Slot ${eqOpenSlot + 1}</i></span>` +
      `<button type="button" class="x" aria-label="Close">&#10005;</button></div>` +
      `<div class="chips">${chips}</div>` +
      `<div class="pgrid">${tiles}</div>`;
    // slot highlight on the card
    for (const el of statsEl.querySelectorAll<HTMLElement>('.eqslot')) {
      el.classList.toggle('open', Number(el.dataset.slot) === eqOpenSlot);
    }
  }

  function openEqPicker(slot: number): void {
    if (vehicleLocked) return;
    eqOpenSlot = slot;
    eqpickEl.classList.add('open');
    renderEqPicker();
    document.addEventListener('keydown', eqKeydown);
    document.addEventListener('mousedown', eqOutside, true);
  }
  function closeEqPicker() {
    if (eqOpenSlot < 0) return;
    hideEqTooltip(false);
    eqOpenSlot = -1;
    eqpickEl.classList.remove('open');
    for (const el of statsEl.querySelectorAll<HTMLElement>('.eqslot')) el.classList.remove('open');
    document.removeEventListener('keydown', eqKeydown);
    document.removeEventListener('mousedown', eqOutside, true);
  }
  function eqKeydown(e: KeyboardEvent): void {
    if (e.code === 'Escape') { e.stopPropagation(); closeEqPicker(); }
  }
  function eqOutside(e: MouseEvent): void {
    const target = eventElement(e);
    if (!eqpickEl.contains(target) && !target?.closest('.eqslot')) closeEqPicker();
  }

  eqpickEl.addEventListener('click', (e) => {
    const target = eventElement(e);
    const chip = target?.closest<HTMLElement>('.chip');
    if (chip) {
      emit('ui:click', {});
      eqCat = chip.dataset.cat || 'all';
      renderEqPicker();
      return;
    }
    if (target?.closest('.x')) { emit('ui:click', {}); closeEqPicker(); return; }
    const tile = target?.closest<HTMLElement>('.cot-eqtile');
    if (!tile || tile.classList.contains('locked')) return;
    hideEqTooltip(false);
    emit('ui:click', {});
    eqAssign(tile.dataset.eq || null);
  });

  eqpickEl.addEventListener('pointerover', (e) => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const tile = eventElement(e)?.closest<HTMLElement>('.cot-eqtile');
    if (!tile) return;
    const from = e.relatedTarget;
    if (from instanceof Node && tile.contains(from)) return;
    queueEqTooltip(tile);
  });
  eqpickEl.addEventListener('pointerout', (e) => {
    const tile = eventElement(e)?.closest<HTMLElement>('.cot-eqtile');
    if (!tile) return;
    const to = e.relatedTarget;
    if (to instanceof Node && tile.contains(to)) return;
    hideEqTooltip();
  });
  eqpickEl.addEventListener('focusin', (e) => {
    const tile = eventElement(e)?.closest<HTMLElement>('.cot-eqtile');
    if (tile) queueEqTooltip(tile, true);
  });
  eqpickEl.addEventListener('focusout', (e) => {
    const tile = eventElement(e)?.closest<HTMLElement>('.cot-eqtile');
    if (!tile) return;
    const to = e.relatedTarget;
    if (to instanceof Node && tile.contains(to)) return;
    hideEqTooltip();
  });
  eqpickEl.addEventListener('scroll', () => hideEqTooltip(false), true);

  // slot boxes are re-created by every renderStats — delegate their clicks
  statsEl.addEventListener('click', (e) => {
    const target = eventElement(e);
    const equipmentTrigger = target?.closest<HTMLButtonElement>('.cot-compact-equipment-trigger');
    if (equipmentTrigger) {
      emit('ui:click', {});
      setGaragePanel(openGaragePanel() === 'equipment' ? '' : 'equipment');
      return;
    }
    const technicalExpand = target?.closest<HTMLButtonElement>('[data-technical-expand]');
    if (technicalExpand) {
      const viewId = technicalExpand.dataset.technicalExpand as GarageTechnicalViewId | undefined;
      if (!viewId || !technicalViewById.has(viewId)) return;
      emit('ui:click', {});
      openTechnicalViewer(viewId, technicalExpand);
      return;
    }
    const technicalTab = target?.closest<HTMLButtonElement>('[data-technical-view]');
    if (technicalTab) {
      activateTechnicalTab(technicalTab);
      return;
    }
    const galleryLink = target?.closest<HTMLElement>('[data-gallery-layer]');
    if (galleryLink) {
      openSelectedInGallery(galleryLink.dataset.galleryLayer || 'appearance');
      return;
    }
    const slot = target?.closest<HTMLElement>('.eqslot');
    if (!slot) return;
    emit('ui:click', {});
    const idx = Number(slot.dataset.slot);
    if (idx === eqOpenSlot) closeEqPicker();
    else openEqPicker(idx);
  });

  statsEl.addEventListener('keydown', (e) => {
    const tab = eventElement(e)?.closest<HTMLButtonElement>('[data-technical-view]');
    if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const tabs = [...(tab.closest('[role="tablist"]')?.querySelectorAll<HTMLButtonElement>('[role="tab"]') || [])];
    if (!tabs.length) return;
    e.preventDefault();
    e.stopPropagation();
    const current = Math.max(0, tabs.indexOf(tab));
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1
      : (current + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus();
    activateTechnicalTab(tabs[next]);
  });

  /** Tank switch: the card re-renders its own slots; just drop a stale picker. */
  function refreshEquipSel() {
    closeEqPicker();
  }
  // --- END EQUIPMENT SYSTEM -------------------------------------------------
  let swatchesFor: string | null = null; // spec id the swatches are currently painted for
  function refreshCamoTagFilters() {
    if (!camoOpts || !selectedId) return;
    const spec = specById.get(selectedId);
    if (!spec) return;
    const available = new Set<CamoTagId>(['all']);
    for (const pid of camoOpts.patterns) {
      for (const tagId of camoPatternTags(pid, spec.nation)) available.add(tagId);
    }
    if (!available.has(activeCamoTag)) activeCamoTag = 'all';
    for (const [tagId, button] of camoTagButtonById) {
      button.hidden = tagId !== 'all' && !available.has(tagId);
      button.setAttribute('aria-pressed', String(tagId === activeCamoTag));
    }
    for (const [pid, card] of camoCardById) {
      const tags = camoPatternTags(pid, spec.nation);
      card.hidden = !camoMatchesTag(pid, spec.nation, activeCamoTag);
      card.dataset.tags = tags.join(' ');
      const label = (camoOpts.label && camoOpts.label[pid]) || pid;
      card.title = `${label} · ${tags.map((tagId) => CAMO_TAG_LABEL[tagId]).join(', ')}`;
    }
    requestAnimationFrame(syncScrollFades);
  }

  function syncCamoCardSelection(selectedPatternId: string): void {
    for (const [patternId, card] of camoCardById) {
      const selected = patternId === selectedPatternId;
      card.classList.toggle('sel', selected);
      // The grid scrolls, so restoring a persisted selection must keep its
      // active card visible without disturbing a deliberately filtered list.
      if (selected && !card.hidden) card.scrollIntoView?.({ block: 'nearest' });
    }
  }

  function repaintTankCamoSwatches(spec: GarageTankSpec): void {
    for (const [patternId, card] of camoCardById) {
      const canvas = card.querySelector<HTMLCanvasElement>('.sw canvas');
      if (!canvas) continue;
      if (patternId === 'auto') paintAutoCamoSwatch(canvas, spec);
      else paintCamoSwatch(canvas, spec, patternId);
    }
  }

  function refreshCompactCamoPreview(spec: GarageTankSpec, selectedPatternId: string): void {
    compactCamoName.textContent = camoOpts?.label?.[selectedPatternId] || selectedPatternId || 'Factory';
    const patternIds = [selectedPatternId, ...(camoOpts?.patterns || [])]
      .filter((patternId, index, ids) => ids.indexOf(patternId) === index);
    while (patternIds.length < compactCamoPreviews.length) patternIds.push(selectedPatternId);
    compactCamoPreviews.forEach((canvas, index) => {
      const patternId = patternIds[index] || selectedPatternId;
      canvas.dataset.camoPattern = patternId;
      if (patternId === 'auto') {
        paintAutoCamoSwatch(canvas, spec);
        return;
      }
      const previewPattern = patternId === CUSTOM_CAMO_ID && camoOpts?.getCustom
        ? customCamoPatternId(camoOpts.getCustom(spec.id)) : patternId;
      paintCamoSwatch(canvas, spec, previewPattern);
    });
  }

  function refreshCamoSel() {
    if (!camoOpts || !selectedId) return;
    const selectedPatternId = camoOpts.get(selectedId);
    customCamoStudioAccess?.peek()?.syncSelected();
    refreshCamoTagFilters();
    syncCamoCardSelection(selectedPatternId);
    const spec = specById.get(selectedId);
    if (!spec) return;
    refreshCompactCamoPreview(spec, selectedPatternId);
    // repaint swatch tiles for THIS tank (factory palette + nation digital
    // differ per vehicle — the preview must show what the hull will wear)
    if (swatchesFor === selectedId) return;
    repaintTankCamoSwatches(spec);
    swatchesFor = selectedId;
  }
  // --- END CAMO PICKER SECTION ---------------------------------------------

  // ERA is still used for stat-peer normalization, but it is not a catalog
  // partition. Modern, Cold War and WWII vehicles share each country fleet.

  // PER-ERA stat ranges for the normalized bars. r6-2 (round critique:
  // "6.0 s reload renders ~90% full / bars carry no comparative scale"): the
  // r5-2 per-era ranges let the IFV autocannons (sub-second reload, ~50 hp
  // alpha) stretch every modern range so far that MBT bars parked at
  // arbitrary-looking lengths. Bars now normalize min→max within the
  // vehicle's own matchmaking tier + ERA peer group, higher-is-better on
  // every row (reload inverted: faster = fuller). The tier boundary keeps a
  // tier-VII M60 and tier-X Abrams off the same scale without reintroducing a
  // public vehicle-class taxonomy.
  const statGroupOf = garageStatGroup;
  function buildStatRanges(): Map<string, StatRange> {
    const ranges = new Map<string, StatRange>();
    for (const spec of allSpecs) {
      const group = statGroupOf(spec);
      let range = ranges.get(group);
      if (!range) {
        range = {
          hp: [Infinity, -Infinity], speed: [Infinity, -Infinity],
          hpt: [Infinity, -Infinity], dmg: [Infinity, -Infinity],
          reload: [Infinity, -Infinity],
          // EQUIPMENT SYSTEM rows: aim time + the spotting pair, so optics/
          // nets/rammers visibly move their bars against the same peer group
          aim: [Infinity, -Infinity], view: [Infinity, -Infinity],
          camo: [Infinity, -Infinity],
        };
        ranges.set(group, range);
      }
      const add = (key: StatRangeKey, value: number | null | undefined): void => {
        if (value == null || !isFinite(value)) return;
        if (value < range[key][0]) range[key][0] = value;
        if (value > range[key][1]) range[key][1] = value;
      };
      add('hp', spec.hp);
      add('speed', spec.topSpeedKmh);
      add('hpt', spec.enginePowerHp / spec.weightTons);
      add('reload', spec.gun.reloadS);
      add('aim', spec.gun.aimTimeS);
      add('view', viewRangeOf(spec));
      add('camo', baseCamoOf(spec, false));
      const shells = spec.gun?.shells || [];
      add('dmg', shells.length ? Math.max(...shells.map((shell) => shell.dmg || 0)) : null);
    }
    return ranges;
  }
  const STAT_RANGES = buildStatRanges(); // tier/era -> {hp,speed,hpt,dmg,reload:[lo,hi]}
  // min→0.14 stub, max→1.0 full; degenerate spans (single-vehicle group)
  // park at a neutral 0.72 so the card never shows an all-stub column
  function statFrac(
    group: string,
    key: StatRangeKey,
    v: number | null | undefined,
    invert = false,
  ): number {
    const r = STAT_RANGES.get(group);
    if (!r || v == null || !isFinite(v)) return 0.6;
    const [lo, hi] = r[key];
    const span = hi - lo;
    if (!(span > Math.max(1e-6, Math.abs(hi) * 0.02))) return 0.72;
    let f = (v - lo) / span;
    if (invert) f = 1 - f;
    return 0.14 + Math.max(0, Math.min(1, f)) * 0.86;
  }

  // --- COUNTRY FILTER CHIPS -------------------------------------------------
  // The row is an explicit national flag selector. USSR and Russia share RU;
  // every historical era stays together inside its country fleet.
  let countryFilter = countryGroups[0]?.id || 'us';
  let renderedCountryFilter: string | null = null;
  const chipById = new Map<string, HTMLButtonElement>();
  function initializeCountryChips(): void {
    for (const group of countryGroups) {
      const count = group.count;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'cot-country-chip';
      chip.dataset.country = group.id;
      chip.title = `${group.name} · ${count} vehicles`;
      chip.setAttribute('aria-label', `Show ${group.name} vehicles`);
      chip.innerHTML = `${flagIconHTML(group.nation, 22)}` +
        `<span class="code">${group.label}</span><span class="ct">${count}</span>`;
      chip.addEventListener('click', () => {
        emit('ui:click', {});
        applyCountryFilter(group.id);
        // Return to this nation's last selected vehicle. A nation without a
        // remembered choice opens on its highest-tier, far-left card.
        const preferred = countrySelection.preferredSpec(group.id);
        if (preferred) api.setSelected(preferred.id);
      });
      chipsEl.appendChild(chip);
      chipById.set(group.id, chip);
    }
  }
  initializeCountryChips();
  function applyCountryFilter(countryId: string): void {
    const previousCountry = renderedCountryFilter;
    countryFilter = countryId;
    if (previousCountry !== countryId) chipById.get(previousCountry || '')?.classList.remove('sel');
    chipById.get(countryId)?.classList.add('sel');
    // Programmatic tank selection can cross national groups. Keep the active
    // flag fully visible rather than leaving its highlight under an edge fade.
    const activeChip = chipById.get(countryId);
    requestAnimationFrame(() => {
      if (api.isOpen && activeChip) activeChip.scrollIntoView({
        block: 'nearest', inline: 'center', behavior: REDUCED_MOTION ? 'auto' : 'smooth',
      });
      syncCountryRailAffordances();
    });
    if (previousCountry && previousCountry !== countryId) {
      for (const card of cardsByCountry.get(previousCountry) || []) card.style.display = 'none';
    }
    for (const card of cardsByCountry.get(countryId) || []) card.style.display = '';
    renderedCountryFilter = countryId;
    // One compositor animation replaces a Web Animation per vehicle. The old
    // stagger created a burst of animation objects and style flushes on every
    // nation switch, precisely while portraits were also decoding.
    if (previousCountry && previousCountry !== countryId && api.isOpen &&
        cardsEl.animate && !REDUCED_MOTION) {
      cardsEl.animate([{ opacity: 0.76 }, { opacity: 1 }],
        { duration: 140, easing: 'ease-out' });
    }
    cardsEl.scrollLeft = 0;
    queueCarouselAffordances();
    queueCountryRailAffordances();
  }
  // --- END country filter chips --------------------------------------------

  // --- build carousel cards ---
  // Pointer sweeps across a dense carousel must not transfer half the fleet.
  // A short dwell is enough to distinguish a deliberate target; focus/touch/
  // press are already explicit and signal immediately. The eventual click
  // joins the same builder/texture promise in main.ts.
  let tankIntentTimer: ReturnType<typeof setTimeout> | 0 = 0;
  let tankIntentId = '';
  const clearTankIntent = (specId = ''): void => {
    if (specId && tankIntentId !== specId) return;
    if (tankIntentTimer) clearTimeout(tankIntentTimer);
    tankIntentTimer = 0;
    tankIntentId = '';
  };
  const signalTankIntent = (specId: string, immediate = false): void => {
    if (!opts.onTankIntent || !specId || specId === selectedId) return;
    const onTankIntent = opts.onTankIntent;
    clearTankIntent();
    if (immediate) {
      try { onTankIntent(specId); } catch (_) { /* optional warm path */ }
      return;
    }
    tankIntentId = specId;
    tankIntentTimer = setTimeout(() => {
      tankIntentTimer = 0;
      tankIntentId = '';
      try { onTankIntent(specId); } catch (_) { /* optional warm path */ }
    }, 90);
  };
  function initializeTankCards(): void {
    for (const spec of specs) {
      const card = document.createElement('div');
      const developmentOnly = Boolean(spec.roster?.developmentOnly);
      card.className = `cot-card${developmentOnly ? ' dev-only' : ''}`;
      card.dataset.specId = spec.id; // switch-desync r1: stable hook for tools/tests
      card.id = `cot-garage-tank-${spec.id}`;
      card.setAttribute('role', 'option');
      card.setAttribute('aria-selected', 'false');
      const cardCountry = countryCodeOf(spec);
      card.style.display = cardCountry === countryFilter ? '' : 'none';
      const displayName = spec.label?.displayName || spec.name;
      const shortName = spec.label?.shortName || displayName;
      card.title = developmentOnly ? `${displayName} — local development vehicle` : displayName;
      card.setAttribute('aria-label', `${tierNumeral(spec.id) || ''} ${displayName}${developmentOnly ? ', development vehicle' : ''}`.trim());
      card.style.setProperty('--nation-flag', `url("${flagIconUrl(spec.nation)}")`);
      // Stable pre-rendered 3/4 portrait generated from the final first-party
      // procedural build; no live renderer or model swap is needed here.
      card.innerHTML =
        `<span class="card-era">${vehicleEraLabel(spec.era, { short: true })}</span>` +
        (developmentOnly ? `<span class="dev-tag">${spec.roster?.tag || 'DEV'}</span>` : '') +
        `<span class="flag">${flagIconHTML(spec.nation, 20)}<i>${NATION_LABEL[spec.nation] || spec.nation}</i></span>` +
        `<img class="ti" data-cot-thumb="${spec.id}" alt="${displayName}" width="256" height="256" ` +
        `loading="lazy" decoding="async" fetchpriority="low">` +
        `<div class="nm"><b class="tiern">${tierNumeral(spec.id) || ''}</b><span class="nmt"></span></div>`;
      requiredElement<HTMLElement>(card, '.nmt').textContent = shortName;
      card.addEventListener('pointerenter', () => signalTankIntent(spec.id), { passive: true });
      card.addEventListener('pointerleave', () => clearTankIntent(spec.id), { passive: true });
      card.addEventListener('focusin', () => signalTankIntent(spec.id, true));
      card.addEventListener('touchstart', () => signalTankIntent(spec.id, true), { passive: true });
      card.addEventListener('pointerdown', () => signalTankIntent(spec.id, true), { passive: true });
      card.addEventListener('click', () => {
        emit('ui:click', {});
        api.setSelected(spec.id);
      });
      cardsEl.appendChild(card);
      cardById.set(spec.id, card);
      const countryCards = cardsByCountry.get(cardCountry) || [];
      countryCards.push(card);
      cardsByCountry.set(cardCountry, countryCards);
    }
  }
  initializeTankCards();
  applyCountryFilter(countryFilter);
  // Packaged PNGs avoid per-card WebGL contexts and remain deterministic
  // across the garage carousel and screenshot harness.
  ensureTankThumbs(allSpecs, { canWork: () => api.isOpen });

  const GARAGE_INFO = Object.freeze({
    Performance: 'Core mobility, survivability, vision, and concealment values. Bars compare this vehicle with others in the same tier and battlefield role; green values include mounted equipment.',
    'Special system': 'A vehicle-specific combat mechanic. The card shows its activation key, effect, and runtime limitations.',
    Ammunition: 'Every authored ammunition channel with carried capacity, point-blank / 1 km penetration, and average damage. Guided missiles, shell-specific reloads, and autoloaders retain their own timing and inventory rules.',
    Protection: 'Nominal frontal hull and turret armor from the simulation profile. Angle, impact location, normalization, and shell type still determine the actual result.',
    Armament: 'Gun caliber and the authored vertical gun arc used by the aiming and ballistics simulation.',
    Modules: 'Damageable internal systems represented by this vehicle. The Gallery module overlay shows their authored placement.',
    Crew: 'Crew stations used by the vehicle damage model. Disabled crew affect the systems associated with their roles.',
    Equipment: 'Three persistent vehicle-specific loadout slots. Choose a slot to mount eligible handling, mobility, vision, survivability, or module equipment; the adjusted values above are the values used in battle.',
  });
  type GarageInfoLabel = keyof typeof GARAGE_INFO;
  interface StatBarOptions {
    readonly mod?: boolean;
    readonly title?: string;
    readonly icon?: string;
  }
  interface DisposableInfoTrigger extends HTMLElement {
    disposeInfo?: () => void;
  }

  function statSectionTitle(icon: string, label: string, meta = ''): string {
    return `<div class="cot-stat-title cot-sidebar-section-title" data-stat-info="${label}">${uiIconSVG(icon, 13)}` +
      `<span>${label}</span>${meta ? `<small>${meta}</small>` : ''}</div>`;
  }

  function statBar(
    label: string,
    valueText: string,
    frac: number,
    opts: StatBarOptions = {},
  ): string {
    const pct = Math.max(2, Math.min(100, frac * 100)).toFixed(1);
    // EQUIPMENT SYSTEM: values changed by the mounted loadout render in the
    // boost tint with the stock value + contributing items in the tooltip.
    const mod = opts && opts.mod;
    const title = opts && opts.title ? ` title="${opts.title}"` : '';
    const icon = opts?.icon || 'speed';
    return `<div class="srow"${title}><span class="sicon">${uiIconSVG(icon, 16)}</span>` +
      `<div class="lr"><span>${label}</span>` +
      `<b${mod ? ' class="eqmod"' : ''}>${valueText}</b></div>` +
      `<div class="track"><div class="fill" style="width:${pct}%"></div></div></div>`;
  }

  function garageInfoImages(spec: GarageTankSpec, label: string) {
    const name = spec.label?.displayName || spec.name;
    const technicalViews: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
      'Vehicle dossier': [
        ['angle', 'Procedural vehicle render'], ['armor_side', 'Armor protection diagram'],
        ['modules_side', 'Internal module diagram'], ['crew_side', 'Crew-station diagram'],
      ],
      Performance: [['angle', 'Vehicle profile'], ['side', 'Mobility silhouette']],
      'Special system': [['modules_side', 'Special system placement'], ['angle', 'Vehicle profile']],
      Protection: [['armor_side', 'Armor protection diagram'], ['side', 'Protection profile']],
      Modules: [['modules_side', 'Internal module diagram'], ['crew_side', 'Crew-station context']],
      Crew: [['crew_side', 'Crew-station diagram'], ['modules_side', 'Internal module context']],
      Armament: [['side', 'Armament profile'], ['top', 'Weapon plan view']],
      Ammunition: [['side', 'Ammunition platform profile'], ['modules_side', 'Ammunition and module layout']],
      Equipment: [['modules_side', 'Equipment integration diagram'], ['angle', 'Vehicle profile']],
    };
    return (technicalViews[label] || [['angle', 'Procedural vehicle render']]).map(([view, caption]) => ({
      src: iconUrl(spec.id, view),
      alt: `${name} ${caption.toLowerCase()}`,
      fit: 'contain',
      caption: `${name} // ${caption}`,
    }));
  }

  function activateTechnicalTab(tab: HTMLButtonElement): void {
    const section = tab.closest<HTMLElement>('.cot-technical-section');
    const image = section?.querySelector<HTMLImageElement>('[data-technical-image]');
    const caption = section?.querySelector<HTMLElement>('[data-technical-caption-output]');
    const galleryLink = section?.querySelector<HTMLElement>('[data-technical-gallery]');
    const expandButton = section?.querySelector<HTMLButtonElement>('[data-technical-expand]');
    if (!section || !image || !caption || !galleryLink || !expandButton) return;
    section.querySelectorAll<HTMLButtonElement>('[role="tab"]').forEach((candidate) => {
      const active = candidate === tab;
      candidate.setAttribute('aria-selected', active ? 'true' : 'false');
      candidate.tabIndex = active ? 0 : -1;
    });
    const src = tab.dataset.technicalSrc;
    if (src && image.getAttribute('src') !== src) image.src = src;
    const name = specById.get(selectedId || '')?.label?.displayName ||
      specById.get(selectedId || '')?.name || 'Selected vehicle';
    image.alt = `${name} ${tab.dataset.technicalAlt || 'technical schematic'}`;
    caption.textContent = tab.dataset.technicalCaption || '';
    galleryLink.dataset.galleryLayer = tab.dataset.technicalLayer || 'appearance';
    expandButton.dataset.technicalExpand = tab.dataset.technicalView || 'armor';
    expandButton.setAttribute('aria-label', `Expand ${name} ${tab.textContent || 'technical'} schematic`);
  }

  let statsFor: string | null = null; // last spec rendered — gates the swap micro-fade

  function animateStatsSwap(vehicleChanged: boolean): void {
    const shouldAnimate = vehicleChanged
      && statsFor !== null
      && typeof statsEl.animate === 'function'
      && !REDUCED_MOTION;
    if (!shouldAnimate) return;
    statsEl.animate(
      [{ opacity: 0.25, transform: 'translateY(5px)' }, { opacity: 1, transform: 'none' }],
      { duration: 190, easing: 'ease-out' },
    );
  }

  function ammunitionRows(shells: readonly GarageShellSpec[], baseReloadS: number): string {
    return shells.map((shell) => {
      const color = SHELL_TYPE_COLOR[shell.type] || '#9fb0bf';
      const penetration = shell.type === 'HE'
        ? `${shell.pen100Mm}`
        : `${shell.pen100Mm} / ${shell.pen1000Mm}`;
      const hasOwnReload = !!shell.reloadS && Math.abs(shell.reloadS - baseReloadS) > 0.01;
      const reload = hasOwnReload
        ? `${shell.reloadS?.toFixed((shell.reloadS || 0) < 10 ? 1 : 0)} s reload`
        : '';
      const inventory = `${shellAmmunitionCapacity(shell)} carried`;
      const detail = [inventory, reload].filter(Boolean).join(' &middot; ');
      return `<div class="shellrow" style="--shell-color:${color}">` +
        `<span class="shellkind">${shellIconSVG(shell.type, 24)}<span class="ty">${shell.type}</span></span>` +
        `<span class="nm">${shell.name}<small>${detail}</small></span>` +
        `<span class="shellmetric"><b>${penetration}</b>mm</span>` +
        `<span class="shellmetric"><b>${shell.dmg}</b>hp</span></div>`;
    }).join('');
  }

  function equipmentSlots(equipmentIds: readonly string[]): string {
    const slots: string[] = [];
    for (let index = 0; index < EQUIP_SLOTS; index++) {
      const item = equipmentIds[index] ? EQUIPMENT_BY_ID.get(equipmentIds[index]) : null;
      const slotLabel = item
        ? `Slot ${index + 1}: ${item.name}. ${item.desc}`
        : `Slot ${index + 1}: Empty. Mount equipment`;
      slots.push(item
        ? `<button type="button" class="eqslot" data-slot="${index}" ` +
          `aria-label="${escapeHtmlAttribute(slotLabel)}" title="${escapeHtmlAttribute(slotLabel)}">` +
          `${equipIconSVG(item.id, 26)}<span class="sl">${item.short}</span></button>`
        : `<button type="button" class="eqslot empty" data-slot="${index}" ` +
          `aria-label="${escapeHtmlAttribute(slotLabel)}" title="Mount equipment">` +
          `<span class="plus">+</span><span class="sl">Empty</span></button>`);
    }
    return slots.join('');
  }

  function renderStats(spec: GarageTankSpec): void {
    if (technicalModal.isOpen()) technicalModal.close({ restoreFocus: false, immediate: true });
    statsEl.querySelectorAll<HTMLElement>('.cot-info-trigger').forEach((button) => {
      const trigger: DisposableInfoTrigger = button;
      trigger.disposeInfo?.();
    });
    const vehicleChanged = statsFor !== spec.id;
    // garage_ui: vehicle-switch micro-fade — the stats card content used to
    // teleport; a 190 ms fade/rise sells the swap without delaying the data.
    animateStatsSwap(vehicleChanged);
    statsFor = spec.id;
    const hpT = spec.enginePowerHp / spec.weightTons;
    const shells = (spec.gun && spec.gun.shells) || [];
    const shellRows = ammunitionRows(shells, spec.gun.reloadS);
    const hullMm = frontArmorMm(spec.armor && spec.armor.hullPlates, ['glacis', 'front', 'driver']);
    const turMm = frontArmorMm(spec.armor && spec.armor.turretPlates, ['front', 'cheek', 'mantlet']);
    // headline DAMAGE (alpha) — penetration lives in the per-shell rows only
    // (r3: a vehicle-level pen number duplicated the shell table; no AAA tank
    // game headlines a single pen figure)
    const bestDmg = Math.max(0, ...shells.map((shell) => shell.dmg || 0));
    // Every bar normalizes within the vehicle's OWN tier+class peer
    // group, higher-is-better (reload inverted) — see STAT_RANGES above
    const grp = statGroupOf(spec);
    // EQUIPMENT SYSTEM: fold the mounted loadout into the displayed stats —
    // the same multipliers/tables the battle sim reads (equipment.ts +
    // spotting.ts), so the card IS the loadout preview. Modified values tint
    // green with the stock number in the tooltip.
    // §5.31b PRINT VIEWER: print cards show STOCK stats — no loadout is
    // read (or ever written) for a view-only 'print:<id>' pseudo-spec.
    const eqIds = loadEquipment(spec.id, spec);
    const eqM = computeEquipMults(eqIds);
    const eqNames = eqIds.map((id) => EQUIPMENT_BY_ID.get(id)?.name || id).join(', ');
    const reloadS = spec.gun.reloadS * eqM.reload;
    const autoloader = spec.gun.autoloader;
    const reloadLabel = autoloader ? 'Magazine reload' : 'Reload';
    const magazineSpec = autoloader
      ? `<div class="magazine-spec"><span>Magazine autoloader</span>` +
        `<b>${autoloader.magazineSize} rounds &middot; ${autoloader.intraClipS.toFixed(1)} s cycle &middot; ` +
        `${reloadS.toFixed(1)} s full reload</b></div>`
      : '';
    const aimS = spec.gun.aimTimeS * eqM.aimTime;
    const vrBase = viewRangeOf(spec);
    const vrMove = vrBase * equipViewMult(eqIds, true);   // always-on items
    const vrStill = vrBase * equipViewMult(eqIds, false); // + binoculars
    const camoStill = Math.min(0.95, baseCamoOf(spec, false) + equipCamoBonus(eqIds, false));
    const camoMove = Math.min(0.95, baseCamoOf(spec, true) + equipCamoBonus(eqIds, true));
    const camoModded = equipCamoBonus(eqIds, false) > 0;
    const viewText = vrStill > vrMove + 0.5
      ? `${Math.round(vrMove)} / ${Math.round(vrStill)} m`
      : `${Math.round(vrMove)} m`;
    const eqTitle = (base: string): string => `Stock ${base} &middot; ${eqNames}`;
    const special = garageSpecialSystem(spec, reloadS);
    const specialCard = special
      ? `<section class="cot-stat-section cot-special-section">` +
        statSectionTitle(special.icon, 'Special system', 'E key') +
        `<div class="cot-special-card"><span class="cot-special-icon">${uiIconSVG(special.icon, 24)}</span>` +
        `<div class="cot-special-copy"><b>${special.label}</b><p>${special.detail}</p>` +
        `<small>${special.meta}</small></div><kbd>E</kbd></div></section>`
      : '';
    const initialTechnicalView = technicalViews[0];
    const technicalTabs = technicalViews.map((view, index) =>
      `<button class="cot-technical-tab" type="button" role="tab" ` +
      `aria-selected="${index === 0 ? 'true' : 'false'}" ` +
      `aria-controls="cot-technical-schematic-panel" tabindex="${index === 0 ? '0' : '-1'}" ` +
      `data-technical-view="${view.id}" data-technical-src="${iconUrl(spec.id, view.assetView)}" ` +
      `data-technical-caption="${view.caption}" data-technical-alt="${view.caption.toLowerCase()}" ` +
      `data-technical-layer="${view.galleryLayer}">${view.label}</button>`).join('');
    const dossierHeader =
      `<div class="cot-dossier-head">` +
      `<img class="stats-ti" src="${iconUrl(spec.id, 'side_silhouette')}" alt="">` +
      `<div class="cot-dossier-title"><span class="cot-tier-plate">${tierNumeral(spec.id) || '&mdash;'}</span><h3></h3></div>` +
      `<div class="sub">${flagIconHTML(spec.nation, 20)}<span>${spec.nation} &middot; ${vehicleEraLabel(spec.era)}</span></div>` +
      `<button class="cot-compact-equipment-trigger" type="button" data-garage-panel="equipment" ` +
      `aria-label="Edit equipment loadout" title="Edit equipment loadout" ` +
      `aria-expanded="${openGaragePanel() === 'equipment'}" aria-controls="cot-garage-dossier">` +
      `${uiIconSVG('repair', 13)}<span>Loadout</span></button></div>`;
    const technicalSection =
      `<section class="cot-stat-section cot-technical-section">` +
      dossierHeader +
      `<div class="cot-technical-tabs" role="tablist" aria-label="Vehicle technical schematics">${technicalTabs}</div>` +
      `<figure class="cot-technical-figure" id="cot-technical-schematic-panel" role="tabpanel" ` +
      `aria-label="Selected vehicle technical schematic">` +
      `<button class="cot-technical-expand" type="button" data-technical-expand="${initialTechnicalView.id}" ` +
      `aria-haspopup="dialog" aria-expanded="false" aria-controls="cot-technical-viewer-dialog" ` +
      `aria-label="Expand ${spec.label?.displayName || spec.name} ${initialTechnicalView.label} schematic">` +
      `<img src="${iconUrl(spec.id, initialTechnicalView.assetView)}" alt="" ` +
      `data-technical-image draggable="false" loading="lazy" decoding="async" fetchpriority="low">` +
      `<span class="cot-technical-expand-label">${uiIconSVG('zoomIn', 14)}Expand view</span></button>` +
      `<figcaption data-technical-caption-output>${initialTechnicalView.caption}</figcaption></figure>` +
      `<button class="cot-gallery-link cot-technical-gallery" type="button" ` +
      `data-gallery-layer="${initialTechnicalView.galleryLayer}" data-technical-gallery>` +
      `${uiIconSVG('gallery', 15)}<span>Inspect in Gallery</span>` +
      `<span class="go">&#8250;</span></button></section>`;
    const moduleRows = garageModuleRows(spec);
    const crewRows = garageCrewRows(spec);
    const moduleChips = moduleRows.map((row) =>
      `<div class="cot-module-chip" title="Damageable module: ${row.label}">` +
      `<span class="mi">${uiIconSVG(row.icon, 16)}</span><span>${row.label}</span></div>`).join('');
    const crewChips = crewRows.map((row) =>
      `<div class="cot-crew-chip"><span>${uiIconSVG(row.icon, 16)}</span><span>${row.label}</span></div>`).join('');
    const slotBoxes = equipmentSlots(eqIds);
    const equipmentSection =
      `<section class="cot-stat-section cot-loadout-section">` +
      `<div class="eqhead cot-sidebar-section-title">${uiIconSVG('repair', 13)}` +
      `<span>Equipment loadout</span></div>` +
      `<div class="eqrow">${slotBoxes}</div></section>`;
    statsEl.innerHTML =
      technicalSection +
      equipmentSection +
      `<section class="cot-stat-section cot-performance-section">${statSectionTitle('speed', 'Performance', `${spec.weightTons.toFixed(1)} t`)}` +
      `<div class="cot-performance-grid">` +
      statBar('Hit points', `${spec.hp}`, statFrac(grp, 'hp', spec.hp), { icon: 'shield' }) +
      statBar('Top speed', `${spec.topSpeedKmh} km/h`, statFrac(grp, 'speed', spec.topSpeedKmh), { icon: 'speed' }) +
      statBar('Power / weight', `${hpT.toFixed(1)} hp/t`, statFrac(grp, 'hpt', hpT), { icon: 'engine' }) +
      statBar(reloadLabel, `${reloadS.toFixed(1)} s`, statFrac(grp, 'reload', reloadS, true),
        { icon: 'clock', mod: eqM.reload !== 1, title: eqTitle(`${spec.gun.reloadS.toFixed(1)} s`) }) +
      statBar('Aim time', `${aimS.toFixed(1)} s`, statFrac(grp, 'aim', aimS, true),
        { icon: 'scope', mod: eqM.aimTime !== 1, title: eqTitle(`${spec.gun.aimTimeS.toFixed(1)} s`) }) +
      statBar('Damage', `${bestDmg} hp`, statFrac(grp, 'dmg', bestDmg), { icon: 'damage' }) +
      statBar('View range', viewText, statFrac(grp, 'view', vrMove),
        { icon: 'optics', mod: vrMove > vrBase || vrStill > vrMove + 0.5,
          title: vrStill > vrMove + 0.5 ? `Moving / stationary &middot; stock ${vrBase} m`
            : eqTitle(`${vrBase} m`) }) +
      statBar('Camouflage', `${Math.round(camoStill * 100)} / ${Math.round(camoMove * 100)} %`,
        statFrac(grp, 'camo', camoStill),
        { icon: 'camouflage', mod: camoModded, title: 'Stationary / moving' +
          (camoModded ? ` &middot; stock ${Math.round(baseCamoOf(spec, false) * 100)} %` : '') }) +
      `</div></section>` +
      specialCard +
      `<section class="cot-stat-section">${statSectionTitle('shell', 'Ammunition', `${shells.length} types`)}` +
      magazineSpec +
      `<div class="shellhead"><span>Type</span><span>Round</span><span>Pen</span><span>Damage</span></div>` +
      shellRows + `</section>` +
      `<section class="cot-stat-section">${statSectionTitle('shield', 'Protection')}` +
      `<div class="armor-grid">` +
      `<div class="armorline">${uiIconSVG('shield', 19)}<span>Hull front</span><b>${hullMm != null ? `${Math.round(hullMm)} mm` : '&mdash;'}</b></div>` +
      `<div class="armorline">${uiIconSVG('turretRing', 19)}<span>Turret front</span><b>${turMm != null ? `${Math.round(turMm)} mm` : '&mdash;'}</b></div></div>` +
      `<button class="cot-layer-link" type="button" data-gallery-layer="armor">${uiIconSVG('shield', 13)}Inspect armor overlay</button></section>` +
      `<section class="cot-stat-section">${statSectionTitle('gun', 'Armament', `${spec.gun.caliberMm} mm`)}` +
      `<div class="armor-grid">` +
      `<div class="armorline">${uiIconSVG('gun', 19)}<span>Gun</span><b>${spec.gun.caliberMm} mm</b></div>` +
      `<div class="armorline">${uiIconSVG('scope', 19)}<span>Gun arc</span><b>&minus;${spec.gunDepressionDeg}&deg; / +${spec.gunElevationDeg}&deg;</b></div></div></section>` +
      `<section class="cot-stat-section">${statSectionTitle('engine', 'Modules', `${moduleRows.length} systems`)}` +
      `<div class="cot-module-grid">${moduleChips}</div>` +
      `<button class="cot-layer-link" type="button" data-gallery-layer="modules">${uiIconSVG('gallery', 13)}Open module overlay</button></section>` +
      `<section class="cot-stat-section">${statSectionTitle('crew', 'Crew', `${crewRows.length} stations`)}` +
      `<div class="cot-crew-grid">${crewChips}</div></section>`;
    requiredElement<HTMLElement>(statsEl, 'h3').textContent = spec.label?.displayName || spec.name;
    const technicalImage = statsEl.querySelector<HTMLImageElement>('[data-technical-image]');
    if (technicalImage) technicalImage.alt = `${spec.label?.displayName || spec.name} ${initialTechnicalView.caption.toLowerCase()}`;
    const dossierHead = statsEl.querySelector('.cot-dossier-head');
    dossierHead?.appendChild(createInfoButton({
      label: 'About the vehicle dossier',
      title: 'Vehicle dossier',
      text: 'This panel is built from the selected vehicle’s authoritative gameplay specification. Tier, origin, combat values, ammunition, modules, crew, and equipment all update with the selected vehicle.',
      images: garageInfoImages(spec, 'Vehicle dossier'),
      sections: [
        { icon: 'shield', title: 'Authoritative data', text: 'Armor, modules, crew, shells, and mobility come from the playable vehicle specification.' },
        { icon: 'gallery', title: 'Technical views', text: 'Open Tank Gallery for interactive armor, module, and appearance layers.' },
      ],
    }));
    statsEl.querySelectorAll<HTMLElement>('[data-stat-info]').forEach((heading) => {
      const label = heading.dataset.statInfo;
      const text = label && label in GARAGE_INFO ? GARAGE_INFO[label as GarageInfoLabel] : '';
      if (text) heading.appendChild(createInfoButton({
        label: `About ${label}`,
        title: label || 'Vehicle information',
        text,
        images: garageInfoImages(spec, label || 'Vehicle dossier'),
      }));
    });
    const equipmentHead = statsEl.querySelector('.eqhead');
    equipmentHead?.appendChild(createInfoButton({
      label: 'About equipment', title: 'Equipment', text: GARAGE_INFO.Equipment,
      images: garageInfoImages(spec, 'Equipment'),
    }));
    if (vehicleChanged) statsEl.scrollTop = 0;
    requestAnimationFrame(syncScrollFades);
  }

  function applySelection(specId: string, { remember = true } = {}): boolean {
    if (vehicleLocked && specId !== selectedId) return false;
    const spec = specById.get(specId);
    if (!spec) return false;
    const previousSelectedId = selectedId;
    selectedId = specId;
    // Direct selection from another country (for example a screenshot
    // harness) switches the visible strip to that national fleet.
    if (cardById.has(specId) && countryCodeOf(spec) !== countryFilter) {
      applyCountryFilter(countryCodeOf(spec));
    }
    // Remember one independent selection per nation. This also adopts valid
    // selections restored by the app on first presentation or battle return.
    if (remember && cardById.has(specId)) countrySelection.remember(specId);
    if (previousSelectedId !== specId) {
      const previousCard = cardById.get(previousSelectedId);
      previousCard?.classList.remove('sel');
      previousCard?.setAttribute('aria-selected', 'false');
    }
    const card = cardById.get(specId);
    card?.classList.add('sel');
    card?.setAttribute('aria-selected', 'true');
    if (card) cardsEl.setAttribute('aria-activedescendant', card.id);
    if (card && card.scrollIntoView) {
      // Selection may jump between distant remembered cards when a nation
      // opens. Reveal it before the next paint instead of animating
      // through every intermediate card (which also exposed clipped cards
      // during the sweep).
      card.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'auto' });
    }
    queueCarouselAffordances();
    renderStats(spec);
    battleBtn.disabled = false;
    requiredElement<HTMLElement>(battleBtn, '.battle-word').textContent = 'BATTLE';
    camosEl.style.display = '';
    refreshCamoSel(); // CAMO PICKER SECTION: highlight this tank's pattern
    // camo r4: warm this tank's pattern bakes in the background so picker
    // clicks restore instantly instead of running the painter chain.
    if (camoOpts && camoOpts.prewarm) camoOpts.prewarm(specId);
    refreshEquipSel(); // EQUIPMENT PICKER: highlight this tank's loadout
    return true;
  }

  function step(dir: number): void {
    if (vehicleLocked) return;
    // Arrows walk the active national fleet only.
    const pool = specsByCountry.get(countryFilter) || [];
    if (!pool.length) return;
    const idx = pool.findIndex((s) => s.id === selectedId);
    const next = pool[(idx + dir + pool.length) % pool.length];
    emit('ui:click', {});
    api.setSelected(next.id);
  }

  function launchBattle(
    specId: string,
    mapId: string,
    { emitClick = true, gameMode = battleGameMode }: {
      emitClick?: boolean;
      gameMode?: GameModeId;
    } = {},
  ): void {
    // Battle entry must be unstoppable: the pre-battle emits fan out to five+
    // subscribers (audio click, pointer-lock grab, killcam/shot-log resets…)
    // and any one of them throwing in an exotic environment would silently
    // block onBattle — a BATTLE button that does nothing is the worst failure
    // mode. Contain their failures; the phase flip always runs.
    try {
      if (emitClick) emit('ui:click', {});
      emit('ui:battleStart', { specId, mapId });
    } catch (err) {
      console.error('[garage] battle-start listener failed:', err);
    }
    if (onBattle) onBattle(specId, mapId, { gameMode }); // MAP-CONFIG WIRING
  }

  function battle() {
    if (!selectedId) return;
    const specId = selectedId;
    const mapId = selectedMapId;
    closeBattleMenu();
    if (opts.onPlayRequest) {
      try { emit('ui:click', {}); } catch (_) { /* presentation-only */ }
      opts.onPlayRequest({
        mode: battleMode,
        gameMode: battleGameMode,
        specId,
        mapId,
        startSolo: () => launchBattle(specId, mapId, {
          emitClick: false,
          gameMode: battleGameMode,
        }),
      });
      return;
    }
    launchBattle(specId, mapId);
  }

  interface BattleChoiceMeta {
    readonly short: string;
    readonly label: string;
    readonly icon: string;
  }
  const battleModeMeta: Readonly<Record<BattleMode, BattleChoiceMeta>> = {
    solo: { short: 'BOTS', label: 'Bots', icon: 'battleBots' },
    private: { short: 'CODE', label: 'Private', icon: 'battlePrivate' },
    lan: { short: 'LAN', label: 'LAN', icon: 'battleLan' },
    ranked: { short: 'RANK', label: 'Ranked', icon: 'battleRanked' },
  };
  const battleRuleMeta: Partial<Record<GameModeId, BattleChoiceMeta>> = {
    capture_the_flag: { short: 'CTF', label: 'Capture the Flag', icon: 'modeFlag' },
    zone_control: { short: '1000', label: 'Zone Control', icon: 'modeZones' },
    turbo_ball: { short: 'BALL', label: 'Turbo Ball', icon: 'modeTurbo' },
    endless_horde: { short: 'WAVE', label: 'Endless Horde', icon: 'modeHorde' },
  };
  function closeBattleMenu({ restoreFocus = false } = {}) {
    battleMenu.classList.remove('open');
    battleModeBtn.setAttribute('aria-expanded', 'false');
    if (restoreFocus) battleModeBtn.focus();
  }
  function openBattleMenu() {
    closeMobileNavigation();
    setGaragePanel('');
    battleMenu.classList.add('open');
    battleModeBtn.setAttribute('aria-expanded', 'true');
    const activeRule = battleGameMode === 'standard' ? null
      : battleRuleChoices.find((choice) => choice.dataset.gameMode === battleGameMode);
    (activeRule || battleChoices.find((choice) => choice.dataset.mode === battleMode))?.focus();
  }
  function setBattleMode(nextMode: string | undefined): void {
    if (!nextMode || !(nextMode in battleModeMeta)) return;
    const mode = nextMode as BattleMode;
    const meta = battleModeMeta[mode];
    battleMode = mode;
    if (mode === 'solo') battleGameMode = 'standard';
    if (mode !== 'solo' && opts.onPlayModeIntent) {
      try { opts.onPlayModeIntent(mode); } catch (_) { /* optional warm path */ }
    }
    requiredElement<HTMLElement>(battleModeBtn, 'span').textContent = meta.short;
    requiredElement<HTMLElement>(battleBtn, '.battle-active-icon').innerHTML = uiIconSVG(meta.icon, 20);
    battleModeBtn.setAttribute('aria-label', `Battle type: ${meta.label}. Change battle type`);
    battleBtn.setAttribute('aria-label', `Start ${meta.label} battle`);
    for (const choice of battleChoices) {
      choice.setAttribute('aria-checked', String(choice.dataset.mode === mode));
    }
    for (const choice of battleRuleChoices) choice.setAttribute('aria-checked', 'false');
  }
  function setBattleGameMode(nextMode: RuntimeValue): void {
    const id = normalizeGameMode(nextMode);
    const meta = battleRuleMeta[id];
    if (!meta) return;
    battleMode = 'solo';
    battleGameMode = id;
    try { localStorage.setItem('cot.game.mode.v1', id); } catch (_) { /* session-only */ }
    requiredElement<HTMLElement>(battleModeBtn, 'span').textContent = meta.short;
    requiredElement<HTMLElement>(battleBtn, '.battle-active-icon').innerHTML = uiIconSVG(meta.icon, 20);
    battleModeBtn.setAttribute('aria-label', `Battle rules: ${meta.label}. Change battle type`);
    battleBtn.setAttribute('aria-label', `Start ${meta.label}`);
    for (const choice of battleChoices) choice.setAttribute('aria-checked', 'false');
    for (const choice of battleRuleChoices) {
      choice.setAttribute('aria-checked', String(choice.dataset.gameMode === id));
    }
  }

  battleBtn.addEventListener('click', battle);
  const signalBattleIntent = () => {
    if (!selectedId) return;
    try {
      if (battleMode === 'solo') {
        opts.onBattleIntent?.({ specId: selectedId, mapId: selectedMapId });
      } else {
        // Opening a room is not solo-battle intent. Warming the bot roster and
        // current garage map here made the lobby compete with irrelevant
        // terrain generation; transfer only the selected network path.
        opts.onPlayModeIntent?.(battleMode);
      }
    } catch (_) { /* optional warm path */ }
  };
  battleControl.addEventListener('pointerenter', signalBattleIntent, { passive: true });
  battleControl.addEventListener('focusin', signalBattleIntent);
  battleControl.addEventListener('touchstart', signalBattleIntent, { passive: true });
  roomReminder.addEventListener('click', () => emit('ui:roomOpen', {}));
  battleModeBtn.addEventListener('click', () => {
    emit('ui:click', {});
    if (battleMenu.classList.contains('open')) closeBattleMenu();
    else openBattleMenu();
  });
  for (const choice of battleChoices) choice.addEventListener('click', () => {
    emit('ui:click', {});
    setBattleMode(choice.dataset.mode);
    closeBattleMenu({ restoreFocus: true });
  });
  for (const choice of battleRuleChoices) choice.addEventListener('click', () => {
    emit('ui:click', {});
    setBattleGameMode(choice.dataset.gameMode);
    closeBattleMenu({ restoreFocus: true });
  });
  root.addEventListener('pointerdown', (event) => {
    if (!battleControl.contains(eventNode(event))) closeBattleMenu();
  });
  prevVehicleBtn.addEventListener('click', () => step(-1));
  nextVehicleBtn.addEventListener('click', () => step(1));

  // --- DRAG-SCROLL CAROUSEL (garage_ui) -------------------------------------
  // The strip pans 1:1 with a held pointer and coasts with momentum on
  // release; a press that moves less than DRAG_MIN_PX still reads as a plain
  // card click (no accidental drag-selects). Mouse/pen get the JS drag; touch
  // keeps the browser's native pan+fling (touch-action: pan-x in the CSS —
  // the browser takes the gesture over via pointercancel, which lands in the
  // same end handler). Arrows and wheel behavior stay.
  {
    const DRAG_MIN_PX = 5;      // movement below this stays a click
    const COAST_TAU_S = 0.32;   // momentum decay time constant
    const COAST_MAX = 3600;     // px/s flick velocity clamp
    const COAST_MIN = 40;       // px/s — coast ends below this
    let ptrId = -1;
    let startX = 0, startScroll = 0;
    let engaged = false;        // true once the drag threshold is crossed
    let suppressClick = false;  // swallow the click that follows a real drag
    let vel = 0, lastX = 0, lastT = 0;
    let coastRaf = 0;

    const stopCoast = () => {
      if (coastRaf) { cancelAnimationFrame(coastRaf); coastRaf = 0; }
    };
    const coast = () => {
      let prev = performance.now();
      const frame = (now: number): void => {
        coastRaf = 0;
        const dt = Math.min(0.05, Math.max(0.001, (now - prev) / 1000));
        prev = now;
        const before = cardsEl.scrollLeft;
        cardsEl.scrollLeft = before - vel * dt;
        vel *= Math.exp(-dt / COAST_TAU_S);
        // hitting either end of the strip kills the coast (no rubber-band)
        if (cardsEl.scrollLeft === before) vel = 0;
        if (Math.abs(vel) > COAST_MIN) coastRaf = requestAnimationFrame(frame);
      };
      coastRaf = requestAnimationFrame(frame);
    };

    cardsEl.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      stopCoast();
      ptrId = e.pointerId;
      startX = lastX = e.clientX;
      startScroll = cardsEl.scrollLeft;
      lastT = performance.now();
      vel = 0;
      engaged = false;
      suppressClick = false;
    });
    cardsEl.addEventListener('pointermove', (e) => {
      if (e.pointerId !== ptrId) return;
      const dx = e.clientX - startX;
      if (!engaged) {
        if (Math.abs(dx) < DRAG_MIN_PX) return;
        engaged = true;
        cardsEl.classList.add('dragging');
        try { cardsEl.setPointerCapture(ptrId); } catch (_) { /* embedded panes */ }
      }
      cardsEl.scrollLeft = startScroll - dx;  // 1:1 strip follow
      const now = performance.now();
      const dt = Math.max(4, now - lastT) / 1000;
      // EMA over the last ~2-3 pointer events → release flick velocity
      const inst = (e.clientX - lastX) / dt;
      vel = Math.max(-COAST_MAX, Math.min(COAST_MAX, vel * 0.55 + inst * 0.45));
      lastX = e.clientX;
      lastT = now;
    });
    const endStripDrag = (e: PointerEvent): void => {
      if (e.pointerId !== ptrId) return;
      ptrId = -1;
      if (!engaged) return;
      engaged = false;
      suppressClick = true;
      cardsEl.classList.remove('dragging');
      try { cardsEl.releasePointerCapture(e.pointerId); } catch (_) { /* released */ }
      // a pointer that rested before release has a stale flick — don't coast
      if (performance.now() - lastT < 90 && Math.abs(vel) > COAST_MIN) coast();
    };
    cardsEl.addEventListener('pointerup', endStripDrag);
    cardsEl.addEventListener('pointercancel', endStripDrag);
    // pointer capture retargets the post-drag click at cardsEl itself in most
    // engines, but not all — swallow it in the capture phase either way.
    cardsEl.addEventListener('click', (e) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.stopPropagation();
      e.preventDefault();
    }, true);
    // vertical trackpad/mouse wheel pans the strip too (horizontal deltas
    // already pan natively via overflow-x; that path is untouched)
    cardsEl.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      stopCoast();
      cardsEl.scrollLeft += e.deltaY;
      e.preventDefault();
    }, { passive: false });
  }
  // --- END DRAG-SCROLL CAROUSEL ---------------------------------------------

  // r9.1 header nav — Studio rides the exact F8 production path (studio.ts
  // listens on window keydown and gates on game.phase === 'garage'); Home and
  // Docs use their public pretty routes. Garage is the current screen.
  garageVariantTrigger.addEventListener('click', () => {
    emit('ui:click', {});
    if (isGarageVariantMenuOpen()) closeGarageVariantMenu({ restoreFocus: true });
    else openGarageVariantMenu();
  });
  recordTrigger.addEventListener('click', () => {
    emit('ui:click', {});
    if (isRecordOpen()) closeServiceRecord();
    else openServiceRecord();
  });
  recordClose.addEventListener('click', () => {
    emit('ui:click', {});
    closeServiceRecord();
  });
  recordModal.addEventListener('click', (event) => {
    if (event.target === recordModal) closeServiceRecord();
  });
  const openStudio = () => {
    emit('ui:click', {});
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F8' }));
  };
  const openDocs = () => {
    emit('ui:click', {});
    window.location.href = '/docs'; // pretty route (vite.config.ts rewrite)
  };
  const openHome = () => {
    emit('ui:click', {});
    window.location.href = '/home'; // pretty route (vite.config.ts rewrite)
  };
  requiredElement<HTMLElement>(root, '[data-nav="studio"]').addEventListener('click', openStudio);
  requiredElement<HTMLElement>(root, '[data-nav="gallery"]').addEventListener('click', () => openSelectedInGallery());
  requiredElement<HTMLElement>(root, '[data-nav="docs"]').addEventListener('click', openDocs);
  requiredElement<HTMLElement>(root, '[data-nav="home"]').addEventListener('click', openHome);
  requiredElement<HTMLElement>(root, '[data-nav="github"]').addEventListener('click', () => {
    emit('ui:click', {});
  });
  for (const studioIntent of root.querySelectorAll(
    '[data-nav="studio"], [data-mobile-nav="studio"]',
  )) {
    const signalStudioIntent = () => {
      try { opts.onStudioIntent?.(); } catch (_) { /* optional warm path */ }
    };
    studioIntent.addEventListener('pointerenter', signalStudioIntent, { passive: true });
    studioIntent.addEventListener('focusin', signalStudioIntent);
    studioIntent.addEventListener('touchstart', signalStudioIntent, { passive: true });
  }
  for (const item of root.querySelectorAll<HTMLElement>('[data-mobile-nav]')) {
    item.addEventListener('click', () => {
      const destination = item.dataset.mobileNav;
      closeMobileNavigation();
      if (destination === 'home') openHome();
      else if (destination === 'garage') emit('ui:click', {});
      else if (destination === 'studio') openStudio();
      else if (destination === 'gallery') openSelectedInGallery();
      else if (destination === 'docs') openDocs();
      else if (destination === 'record') {
        emit('ui:click', {});
        openServiceRecord();
      } else if (destination === 'environment') {
        emit('ui:click', {});
        openGarageVariantMenu();
      }
    });
  }
  requiredElement<HTMLElement>(root, '.cot-settings-slot').addEventListener('pointerdown', () => {
    setGaragePanel('');
  });
  function onKey(e: KeyboardEvent): void {
    if (!api.isOpen) return;
    const target = eventElement(e);
    if (target?.closest('.cot-modal')) return;
    if (e.code === 'Escape' && openGaragePanel()) {
      setGaragePanel('', { restoreFocus: true });
      e.preventDefault();
      return;
    }
    if (e.code === 'Escape' && isMobileNavigationOpen()) {
      closeMobileNavigation({ restoreFocus: true });
      e.preventDefault();
      return;
    }
    if (e.code === 'Escape' && battleMenu.classList.contains('open')) {
      closeBattleMenu({ restoreFocus: true });
      e.preventDefault();
      return;
    }
    if (e.code === 'ArrowLeft') { step(-1); e.preventDefault(); }
    else if (e.code === 'ArrowRight') { step(1); e.preventDefault(); }
    else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      if (target?.closest('button,input,select,a,[role="button"]')) return;
      battle();
      e.preventDefault();
    }
  }

  let hasPresented = false;
  const api: GarageRuntime = {
    root,
    isOpen: false,

    /**
     * Open the garage screen.
     * @param {string} [selectedId] - initially highlighted tank id.
     */
    show(selected = selectedId) {
      refreshServiceRecord();
      closeGarageVariantMenu();
      setGaragePanel('');
      root.style.display = 'block';
      const firstPresentation = !hasPresented;
      if (firstPresentation && document.getElementById('cot-boot')) {
        root.classList.add('awaiting-boot');
        document.addEventListener('cot:boot-dismiss', () => {
          root.classList.remove('awaiting-boot');
        }, { once: true });
      }
      // The first Garage is already revealed by the boot fade. Replaying its
      // entrance underneath that splash made a cold visit look like the UI
      // loaded twice. Re-arm chrome motion only for a genuine later reopen.
      // Do not force `offsetWidth` here: after a battle that synchronously
      // lays out the complete hidden garage (fleet cards, dossiers, pickers,
      // service record) and has produced multi-second transition freezes.
      // The transition veil already gives us a frame boundary, so re-attach
      // the animation class on that boundary instead.
      const reopening = !firstPresentation && !api.isOpen;
      hasPresented = true;
      root.classList.remove('enter');
      if (reopening) {
        requestAnimationFrame(() => {
          if (api.isOpen) root.classList.add('enter');
        });
      }
      if (!api.isOpen) window.addEventListener('keydown', onKey);
      api.isOpen = true;
      api.setSelected(specById.has(selected) ? selected : selectedId);
      statsEl.scrollTop = 0;
      // The hidden garage reports a zero-width rail during initial creation.
      // Re-measure after display:block so the first visible frame gets honest
      // left/right fades and controls without waiting for a resize or scroll.
      queueCountryRailAffordances();
    },

    /** Close the garage screen. */
    hide() {
      customCamoStudioAccess?.peek()?.close({ restoreFocus: false, immediate: true });
      technicalModal.close({ restoreFocus: false, immediate: true });
      closeServiceRecord({ restoreFocus: false });
      closeMobileNavigation();
      closeGarageVariantMenu();
      closeBattleMenu();
      setGaragePanel('');
      root.style.display = 'none';
      if (api.isOpen) window.removeEventListener('keydown', onKey);
      api.isOpen = false;
    },

    /** Normalize packaged tank portraits (screenshot compatibility). */
    drainThumbs() { drainTankThumbs(); },

    /** UI-free rectangle reserved for the 3D showroom hero (CSS pixels). */
    getStageRect() {
      const rr = root.getBoundingClientRect();
      const left = root.querySelector('.cot-leftcol')?.getBoundingClientRect();
      const stats = statsEl.getBoundingClientRect();
      const carousel = root.querySelector('.cot-carousel')?.getBoundingClientRect();
      const reservePanels = !isOverlayPanelLayout();
      const x0 = reservePanels && left && left.width ? left.right + 14 : rr.left + 18;
      const x1 = reservePanels && stats.width ? stats.left - 14 : rr.right - 18;
      const y0 = rr.top + (isOverlayPanelLayout() ? 66 : 78);
      const y1 = Math.min(rr.bottom, carousel && carousel.height ? carousel.top - 14 : rr.bottom - 190);
      return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
    },

    /**
     * Highlight a tank in the carousel and refresh the stats card; calls onSelect.
     * @param {string} specId
     */
    setSelected(specId: string) {
      if (vehicleLocked) {
        if (specId === selectedId) applySelection(specId);
        return;
      }
      if (applySelection(specId) && onSelect) onSelect(specId);
    },

    /** Currently highlighted vehicle id (probe/tooling hook). @returns {?string} */
    getSelected() { return selectedId; },

    /** Current persisted workshop environment id. */
    getSelectedGarageVariant() { return selectedGarageVariantId; },

    /** Select a workshop without conflating it with the next battle map. */
    setSelectedGarageVariant(variantId: string) { return selectGarageVariant(variantId); },

    /** Adjacent cards in the active national carousel, forward then back. */
    getNeighborIds(radius = 2) {
      const selected = specById.get(selectedId);
      if (!selected) return [];
      const pool = specsByCountry.get(countryCodeOf(selected)) || [];
      const index = pool.findIndex((spec) => spec.id === selectedId);
      if (index < 0 || pool.length < 2) return [];
      const result: string[] = [];
      for (let distance = 1; distance <= Math.min(radius, pool.length - 1); distance++) {
        for (const offset of [distance, -distance]) {
          const id = pool[(index + offset + pool.length) % pool.length]?.id;
          if (id && id !== selectedId && !result.includes(id)) result.push(id);
        }
      }
      return result;
    },

    /** Reflect persistent multiplayer membership beneath the main battle action. */
    setRoomStatus(status: GarageRoomStatus | null = null) {
      if (!status) {
        roomReminder.classList.remove('show', 'ready');
        requiredElement<HTMLElement>(roomReminder, '.rr-copy').textContent = '';
        vehicleLocked = false;
        root.classList.remove('vehicle-locked');
        return;
      }
      const ready = !!status.ready;
      const count = Math.max(0, Number(status.readyCount) || 0);
      const total = Math.max(0, Number(status.total) || 0);
      requiredElement<HTMLElement>(roomReminder, '.rr-copy').innerHTML =
        `<b>${status.mode === 'lan' ? 'LAN' : 'PRIVATE'} ROOM ${status.roomCode || ''}</b> · ` +
        `${ready ? 'READY' : 'NOT READY'} · ${count}/${total} READY`;
      roomReminder.classList.add('show');
      roomReminder.classList.toggle('ready', ready);
      roomReminder.setAttribute('aria-label',
        `Open room ${status.roomCode || ''}. You are ${ready ? 'ready' : 'not ready'}. ${count} of ${total} ready.`);
      vehicleLocked = ready;
      root.classList.toggle('vehicle-locked', vehicleLocked);
      closeEqPicker();
    },

    isVehicleLocked() { return vehicleLocked; },

    /** Move the settings-owned gear into the garage navigation rail. */
    attachSettingsControl(control: HTMLElement) {
      requiredElement<HTMLElement>(root, '.cot-settings-slot').replaceChildren(control);
    },

    // --- MAP-CONFIG WIRING ---
    /** Currently selected battlefield id ('random' allowed). @returns {string} */
    getSelectedMap() { return selectedMapId; },

    /** Enter the currently selected solo battle without reopening the play menu. */
    startSolo() {
      if (selectedId) launchBattle(selectedId, selectedMapId);
    },

    /**
     * Highlight a battlefield in the map picker.
     * @param {string} mapId map id or 'random'
     */
    setSelectedMap(mapId: string) {
      if (!mapCardById.has(mapId)) return;
      selectedMapId = mapId;
      for (const [id, card] of mapCardById) card.classList.toggle('sel', id === mapId);
      refreshCompactMapPreview();
      if (opts.onMapSelect) opts.onMapSelect(mapId);   // CAMO WIRING: AUTO preview
      // Keep packaged portraits healthy after the biome/camo transition.
      requeueTankThumbs();
    },
  };

  if (mapCardById.size) api.setSelectedMap(selectedMapId);

  applyCountryFilter(countryFilter);
  // Paint the hidden initial dossier without overwriting a persisted choice
  // for the first nation before show() adopts the app's real selection.
  if (selectedId) applySelection(selectedId, { remember: false });
  return api;
}
