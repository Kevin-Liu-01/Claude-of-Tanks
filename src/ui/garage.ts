import type { CustomSelectController } from './customSelect.ts';
import { tankSeedId } from '../vehicles/tankIdAliases.ts';
// Counts only (4.8 kB): the 217 kB mount-geometry inventory stays on the battle path (FE-P2).
import { vehicleActionsFor } from './vehicleActionList.ts';
import type { VehicleActionBinding } from '../game/vehicleActions.ts';
import { movementDispersionFactor } from '../sim/movementDispersion.ts';
import type { RuntimeValue } from '../runtimeTypes.ts';
// src/ui/garage.ts — full-screen garage/tank-select overlay: dark gradient
// frame with a transparent center band (the 3D pedestal shows through),
// bottom tank carousel, right stats card, top-center BATTLE button.
// Contract: docs/ARCHITECTURE.md §3.7.3.

import { ensureFonts } from './fonts.ts';
import { prefersReducedMotion } from './accessibilityPreferences.ts';
import { FEATURED_SHOTS } from './featuredShots.ts';
import { preloadImage } from './imagePreload.ts';
import { flagIconHTML } from './flags.ts';
import { flagIconCode } from './flagCodes.ts';
import { iconUrl } from './icons.ts';
import { ensureTankThumbs, drainTankThumbs, requeueTankThumbs } from './tankThumbs.ts';
import { createCamoSwatchAccess } from './camoSwatchAccess.ts';
import { createCustomCamoStudioAccess } from './customCamoStudioAccess.ts';
import {
  CAMO_TAG_IDS, CAMO_TAG_LABEL, CAMO_COUNTRY_TAG_IDS, CUSTOM_CAMO_ID,
  camoMatchesTag, camoPatternTags, customCamoPatternId, camoInCollection,
  camoCollectionFor,
} from '../vehicles/camoPolicy.ts';
import { createInfoButton } from './contextInfo.ts';
import { containModalTab, createModal, isAnyModalOpen } from './modal.ts';
// EQUIPMENT SYSTEM: full catalog + slot logic (game/equipment.ts), the
// white-silhouette icon set (equipIcons.ts), and the spotting-side math the
// stat card folds into its view/camo rows so the garage can never disagree
// with the battle sim.
import {
  EQUIPMENT_BY_ID, EQUIP_SLOTS, EQUIP_CATEGORIES,
  loadEquipment, saveEquipment, equipmentPicker, computeEquipMults,
} from '../game/equipment.ts';
import type { EquipmentItem, EquipmentLock, EquipmentPickerItem } from '../game/equipment.ts';
import { equipmentHoverPreview, projectEquipmentLoadout } from './equipmentPreview.ts';
import { equipIconSVG } from './equipIcons.ts';
import { uiIconSVG } from './uiIcons.ts';
import { keycap, rules, scale20, wireRoving } from './components/components.ts';
import { BRAND_WORDMARK_HTML, brandMarkSVG } from './brandMark.ts';
import { CAMPAIGN_ENEMY_NATIONS, CAMPAIGN_OPERATIONS, campaignLadder, campaignSummary } from '../game/campaignOperations.ts';
import { mapRegionTags, regionTagIcon } from './regionTags.ts';
import { shellIconSVG } from './shellIcons.ts';
import {
  garageCrewRows, garageGalleryHref, garageModuleRows, garageStatGroup,
  garageTechnicalViews, shellTypeLabel, translateTechnicalView,
} from './garageDossier.ts';
import type { GarageTechnicalViewId } from './garageDossier.ts';
import { createRandomMapMosaic } from './randomPreviews.ts';
import {
  compareCountryThenTierThenName, countryFilterGroups, createGarageCountrySelectionMemory,
  defaultGarageMapId, facetFilteredCountry, horizontalRailEndPad, horizontalRailState, horizontalRailWheelDelta,
} from './garageOrder.ts';
import type { GarageFacetPanel } from './garageFacetPanel.ts';
import { isGarageVisibleTankId } from '../game/matchmaking.ts';
import { tankTier, tierNumeral } from '../vehicles/tier.ts';
import { vehicleEraLabelI18n } from '../vehicles/taxonomy.ts';
import { getPlayerRecord, getRecentBattles } from '../game/profile.ts';
import { battleLoadEstimateS } from '../game/battleLoadEstimate.ts';
import { readFavouriteTanks, writeFavouriteTanks } from '../game/favouriteTanks.ts';
import type { DeployDifficulty, DeployScreen } from './deployScreen.ts';
import type { PhotoStill } from './photoMode.ts';
import { minimapAssetUrl } from './minimapAssetUrl.ts';
import type { GarageHotspots, HotspotFacts, HotspotRoom } from './garageHotspots.ts';
import type { Object3D, PerspectiveCamera } from 'three';
import { mountGitHubStars } from './githubStars.ts';
import {
  viewRangeOf, baseCamoOf, equipViewMult, equipCamoBonus,
} from '../sim/spottingStats.ts';
import { t, formatNumber, getLocale, setLocale } from './i18n.ts';
import { currentLocationHrefForLocale, hrefForLocale } from './localeRouting.ts';
import { normalizeGameMode } from '../sim/gameModeCatalog.ts';
import { testDriveLaunch } from '../game/provingGroundSession.ts';
import {
  isWatchableMode, isWaveMode, matchRulesetFor, modeCopyValues, rulesetReloadMultiplier, rulesetSides, RULESET_SCORE_TARGETS, MARS_CACHE_IDS, MARS_GRAVITY_IDS, SIDES_PRESETS, STANDARD_SIDES, TEAM_ARRANGEMENT_LIMITS, sidesPresetOf,
} from '../sim/matchRuleset.ts';
import { readMarsSettings, readTeamArrangement, writeMarsSettings, writeTeamArrangement } from '../game/teamArrangement.ts';
import { battleTimeChoicesMarkup, bindBattleTimeChoices } from './battleTimeChoices.ts';
import { unseenAwardCount } from '../game/serviceRecord.ts';
import type { RecordViewNames } from './serviceRecordView.ts';
import type { createServiceRecordDialog } from './serviceRecordDialog.ts';
import type { PlayMode } from '../mp/session/playMode.ts';
import { shellAmmunitionCapacity } from '../sim/ammunition.ts';
import type { GameModeId } from '../sim/matchModes.ts';
import type { FleetGunSpec, FleetTankSpec } from '../vehicles/specContracts.ts';
import type { ShellSpec } from '../vehicles/specHelpers.ts';
import type { GarageVariant } from '../game/garageVariants.ts';
import type { CamoTagId, CamoCollectionId, CustomCamo } from '../vehicles/camoPolicy.ts';
import type { CustomCamoStudioAccess } from './customCamoStudioAccess.ts';
import type { ImagePriority } from './imagePreload.ts';
import type { FleetTake, FleetTakeIndex, FleetTakePlayer } from './fleetTakes.ts';
import { countryOfVehicle } from '../sim/countries.ts';

/** What the Garage's photo mode needs from the composition root (main.ts): the stage, its orbit and its capture. */
interface GaragePhotoControl {
  readonly stage: HTMLElement;
  readonly showroom: { hold(on: boolean): void; aim(yawRad: number, pitchRad: number, zoomTo?: number): void; reset(): boolean };
  readonly still: PhotoStill;
}

type BattleMode = PlayMode;
// The fleet takes load with the battle gallery, never with the Garage (see the featured panel).
type FleetTakesModule = typeof import('./fleetTakes.ts');
type StatRangeKey = 'hp' | 'speed' | 'hpt' | 'dmg' | 'reload' | 'aim' | 'view' | 'camo' | 'hull' | 'turret' | 'accuracy' | 'bloom';
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
    readonly fullReloadS?: number;
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
  readonly canSetReady?: boolean;
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
  readonly startSolo?: () => void;
}

interface GarageOptions {
  readonly specs: GarageTankSpec[];
  readonly bus?: { emit(event: string, payload: RuntimeValue): void };
  readonly onSelect?: (specId: string) => void;
  readonly onGameModeSelect?: (mode: GameModeId) => void;
  readonly onGameModeIntent?: () => void;
  readonly onBattle?: (
    specId: string,
    mapId: string,
    options: { readonly gameMode: GameModeId; readonly campaignOperationId?: string; readonly watch?: boolean },
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
  /** The stage's overlay (the callouts) changed while the showroom is still: one frame places it (main.ts: the Garage
   *  renders on demand, so a still stage draws nothing until asked). */
  readonly onOverlayChange?: () => void;
  /** The player's own key for a vehicle action's binding (main.ts: the input layer's label), for the actions row. */
  readonly actionKeyFor?: (binding: VehicleActionBinding) => string | null | undefined;
}

export interface GarageRuntime {
  readonly root: HTMLElement;
  /** Place the stage's numbered hotspots for this Garage frame (the frame runtime calls it after the showroom moves). */
  frameHotspots(camera: PerspectiveCamera, model: Object3D | null): void;
  isOpen: boolean;
  show(selected?: string): void;
  hide(): void;
  drainThumbs(): void;
  setDecorativeWorkGate(covered: () => boolean): void;
  getStageRect(centred?: boolean): { x: number; y: number; w: number; h: number };
  setSelected(specId: string): void;
  getSelected(): string;
  getSelectedGarageVariant(): string;
  setSelectedGarageVariant(variantId: string): boolean;
  getNeighborIds(radius?: number): string[];
  setRoomStatus(status?: GarageRoomStatus | null): void;
  isVehicleLocked(): boolean;
  attachSettingsControl(control: HTMLElement): void;
  /** The next battle's bot tier, for the Deploy screen's picker (the input settings own it; attached once they exist). */
  attachDifficulty(control: DeployDifficulty): void;
  /** The photo mode's stage, orbit and capture (attached once the renderer and its post chain exist). */
  attachPhoto(control: GaragePhotoControl): void;
  getSelectedMap(): string;
  startSolo(): void;
  /** Test drive a vehicle (default: the selected one) on the proving ground; false when it cannot launch now. */
  testDrive(specId?: string | null): boolean;
  setSelectedMap(mapId: string): void;
}

/** Each battle rule's glyph (src/ui/icons): the Deploy screen's choices and the Deploy button read this one table. */
const MODE_GLYPH: Readonly<Partial<Record<GameModeId, string>>> = Object.freeze({
  zone_control: 'modeZones', capture_the_flag: 'modeFlag', frontline_assault: 'modeFrontline', turbo_ball: 'modeTurbo',
  gun_game: 'modeGunGame', mars: 'modeMars', juggernaut: 'modeJuggernaut', infected: 'modeInfected',
  endless_horde: 'modeHorde', realistic: 'modeRealistic', drone: 'modeDrone', ac130: 'modeAc130',
});

/** The showroom's stations (brand-ui S2, the 245 redesign): the readout's five views of the selected tank, keys 1 to 5.
 *  The paint left the stations for the band under the name, where it is always in view. */
/** The paints the band offers beside the one the tank wears, in this order (those the catalog carries). */
/**
 * A scrolling grid stands a whole number of its rows tall, so a sheet or picker never ends on a sliced row (the gauntlet
 * 10-25); its `can-scroll` fade on the last row says more waits below. Read on a resize or a redraw, never in a scroll.
 */
function fitWholeRows(grid: HTMLElement): void {
  grid.style.maxHeight = '';
  const style = getComputedStyle(grid);
  const cell = [...grid.children].find((child): child is HTMLElement => child instanceof HTMLElement && child.offsetHeight > 0);
  if (cell && grid.scrollHeight > grid.clientHeight + 1 && style.overflowY !== 'visible') {
    const gap = parseFloat(style.rowGap) || 0;
    const pad = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    const rows = Math.floor((grid.clientHeight - pad + gap) / (cell.offsetHeight + gap));
    if (rows >= 1) grid.style.maxHeight = `${rows * (cell.offsetHeight + gap) - gap + pad}px`;
  }
  grid.classList.toggle('can-scroll', grid.scrollHeight > grid.clientHeight + 1);
}

const BAND_PAINT_PICKS: readonly string[] = Object.freeze(['factory', 'auto', 'summer', 'desert', 'winter', 'digital']);
const GARAGE_STATIONS = Object.freeze([
  ['overview', 'performance'], ['firepower', 'gun'], ['mobility', 'speed'],
  ['protection', 'shield'], ['crew', 'crew'],
] as const);
type GarageStation = (typeof GARAGE_STATIONS)[number][0];

/** A core mode's picture on the Deploy screen (public/media/deploy-r1, the direction's pick for each card). */
const deployCardArt = (id: string): string =>
  `<img class="cot-deploy-card-art" src="/media/deploy-r1/${id}-640.webp" alt="" width="640" height="360" loading="lazy" decoding="async">`;

/** Another mode's tile picture (public/media/deploy-r1: a battle frame of that mode, HUD hidden; Proving Ground's range too). */
const deployTileArt = (id: string): string =>
  `<img class="cot-deploy-tile-art" src="/media/deploy-r1/${id}-480.webp" alt="" width="480" height="270" loading="lazy" decoding="async">`;

/**
 * The Deploy screen's rule choices (the Premiere direction's 04-deploy page): the four core modes as picture cards, the
 * glyph on a plate and the rules the ruleset sets at the foot (renderDeployChips); the rest as picture tiles in the same
 * grammar on a wide screen (rows, a glyph well, the name and its rules, on a folded one).
 */
function deployCardsHTML(ids: readonly GameModeId[], card: boolean): string {
  return ids.map((id) => {
    const name = `<span class="choice-name">${t(`playMenu.matchMode.${id}.label`)}</span><span class="cot-deploy-chips" data-deploy-chips="${id}"></span>`;
    return `<button class="cot-battle-choice${card ? ' cot-deploy-card' : ''}" type="button" data-game-mode="${id}" data-mode-tone="${id}" ` +
      `aria-pressed="false">${card ? deployCardArt(id) : deployTileArt(id)}<span class="choice-icon">${uiIconSVG(MODE_GLYPH[id] || 'modeStandard', 21)}</span>` +
      `<span class="cot-deploy-choice-t">${name}</span></button>`;
  }).join('');
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

/** Why a tile is shut, from equipmentPicker's lock (the gates spawn and the multiplayer authority run too). */
function equipmentLockCopy(itemId: string, lock: EquipmentLock | null): string {
  switch (lock) {
    case 'manualLoader':
      return t(itemId === 'rammer' ? 'garage.equipment.unavailable.autoloader' : 'garage.equipment.unavailable.manualLoader');
    case 'autoloader': return t('garage.equipment.unavailable.needsAutoloader');
    case 'turret': return t('garage.equipment.unavailable.turret');
    case 'mode': return t('garage.equipment.unavailable.mode');
    default: return t('garage.equipment.unavailable.modernOnly');
  }
}

function equipmentMetricIcon(metricId: string): string {
  const icons: Readonly<Record<string, string>> = {
    reload: 'clock',
    aim: 'scope',
    bloom: 'aimSmoothing',
    hullTraverse: 'speed',
    turretTraverse: 'turretRing',
    view: 'optics',
    camo: 'camouflage',
    repair: 'repair',
    trackDurability: 'track',
    heSplash: 'shield',
    crewHe: 'crew',
    ammoRackDurability: 'ammoRack',
    fuelTankDurability: 'fuelTank',
    engineDurability: 'engine',
    transmissionDurability: 'transmission',
    turretRingDurability: 'turretRing',
    gunMountDurability: 'gunMount',
    gunDurability: 'gun',
    opticsDurability: 'optics',
    autoloaderDurability: 'autoloader',
    engineFire: 'engine',
    fireDuration: 'extinguisher',
    extinguish: 'extinguisher',
  };
  return icons[metricId] || 'performance';
}

function equipmentCategoryButtons(activeCategory: string): string {
  return EQUIP_CATEGORIES.map((category) => (
    `<button type="button" class="cot-c-chip chip" aria-pressed="${category.id === activeCategory}" ` +
    `data-cat="${category.id}">${t(`garage.equipment.cat.${category.id}`)}</button>`
  )).join('');
}

function equipmentLabel(id: string): string {
  return t(`equipment.${id}.name`);
}

function equipmentDesc(id: string): string {
  return t(`equipment.${id}.desc`);
}

function equipmentEraTag(item: EquipmentItem): string {
  if (item.era === 'modern') return `<span class="tag">${t('equipment.era.modern')}</span>`;
  return '';
}

function equipmentTileClass(locked: boolean, fittedAt: number, openSlot: number): string[] {
  const classes = ['cot-eqtile'];
  if (locked) classes.push('locked');
  else if (fittedAt === openSlot) classes.push('sel');
  else if (fittedAt >= 0) classes.push('inother');
  return classes;
}

function equipmentTileTag(item: EquipmentItem, lock: EquipmentLock | null, fittedAt: number, openSlot: number): string {
  if (lock) return lock === 'era' ? equipmentEraTag(item) : '';
  if (fittedAt === openSlot) return `<span class="tag">${t('garage.equipment.tag.fitted')}</span>`;
  if (fittedAt >= 0) return `<span class="tag">${t('garage.equipment.tag.slot', { slot: fittedAt + 1 })}</span>`;
  return '';
}

function equipmentTileActionCopy(
  item: EquipmentItem,
  lock: EquipmentLock | null,
  fittedAt: number,
  openSlot: number,
): string {
  if (lock) return equipmentLockCopy(item.id, lock);
  if (fittedAt === openSlot) return t('garage.equipment.action.fitted');
  if (fittedAt >= 0) return t('garage.equipment.action.fittedIn', { from: fittedAt + 1, to: openSlot + 1 });
  return t('garage.equipment.action.equipIn', { slot: openSlot + 1 });
}

function equipmentTileMarkup({ item, lock, fittedSlot: fittedAt }: EquipmentPickerItem, openSlot: number): string {
  const locked = lock !== null;
  const cls = equipmentTileClass(locked, fittedAt, openSlot);
  const tag = equipmentTileTag(item, lock, fittedAt, openSlot);
  const availability = equipmentTileActionCopy(item, lock, fittedAt, openSlot);
  const name = equipmentLabel(item.id);
  const desc = equipmentDesc(item.id);
  const ariaLabel = escapeHtmlAttribute(`${name}. ${desc}. ${availability}`);
  // the tile carries the short name (10 characters at most, the slot caption's); the full name reads in its label and tip
  return `<button type="button" class="${cls.join(' ')}" data-eq="${locked ? '' : item.id}" ` +
    `data-eq-id="${item.id}" data-eq-cat="${item.cat}"${lock ? ` data-eq-lock="${lock}"` : ''} aria-label="${ariaLabel}" ` +
    `aria-pressed="${fittedAt === openSlot ? 'true' : 'false'}" aria-disabled="${locked ? 'true' : 'false'}">` +
    `${tag}${equipIconSVG(item.id, 38)}<span class="n">${t(`equipment.${item.id}.short`)}</span>` +
    `<span class="e">${desc}</span></button>`;
}

function equipmentPickerTiles(
  spec: GarageTankSpec | undefined,
  currentLoadout: readonly string[],
  openSlot: number,
  activeCategory: string,
): string {
  const emptyLabel = escapeHtmlAttribute(
    t('garage.equipment.empty.aria', { slot: openSlot + 1 }),
  );
  const emptyTile =
    `<button type="button" class="cot-eqtile remove" data-eq="" data-eq-id="" ` +
    `aria-label="${emptyLabel}">` +
    `${uiIconSVG('close', 34)}` +
    `<span class="n">${t('garage.equipment.empty.name')}</span>` +
    `<span class="e">${t('garage.equipment.empty.desc')}</span></button>`;
  // the lead's equipmentPicker (equipment 249): one group per category in catalog order, each tile's lock and fitted slot
  const itemTiles = equipmentPicker(spec, currentLoadout)
    .filter((group) => activeCategory === 'all' || group.category.id === activeCategory)
    .flatMap((group) => group.items.map((entry) => equipmentTileMarkup(entry, openSlot)))
    .join('');
  return emptyTile + itemTiles;
}

/** The roster card's tier chip, "Tier X": the word in the data face, the numeral in tungsten. */
function tierChipHTML(numeral: string): string {
  const text = t('garage.card.tier', { tier: numeral });
  const at = text.lastIndexOf(numeral);
  return at < 0 ? text : `${text.slice(0, at)}<b>${numeral}</b>${text.slice(at + numeral.length)}`;
}

/** A nation's short name beside its flag (cards and filter chips): `nation.short.<nation>`, a code in en-US and the
 *  country's name in zh-CN (BUI-F8: no Latin codes in Chinese). */
const nationShort = (nation: string): string => t(`nation.short.${nation}`);
const NATION_FULL_LABEL: Readonly<Record<string, string>> = {
  USA: 'United States', Germany: 'Germany', USSR: 'Soviet Union', Russia: 'Russia',
  'USSR/Russia': 'Russia', Sweden: 'Sweden', Community: 'Community', UK: 'United Kingdom',
  France: 'France', Israel: 'Israel', China: 'China', 'South Korea': 'South Korea',
  Japan: 'Japan', Italy: 'Italy', Poland: 'Poland', Ukraine: 'Ukraine',
};
const CAMO_TAG_NATION: Readonly<Partial<Record<CamoTagId, string>>> = Object.freeze({
  usa: 'USA', de: 'Germany', ru: 'Russia', uk: 'UK', fr: 'France', cn: 'China',
  it: 'Italy', jp: 'Japan', pl: 'Poland', kr: 'South Korea', se: 'Sweden',
  il: 'Israel', ua: 'Ukraine',
});
function nationFullLabel(nation: string): string {
  return NATION_FULL_LABEL[nation] || nation;
}
function tNation(nation: string): string {
  const translated = t(`nation.${nation}`);
  return translated !== `nation.${nation}` ? translated : nationFullLabel(nation);
}

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



// garage_ui: one shared accessibility gate for the WAAPI micro-transitions and smooth scrolls: the player's Reduce
// motion choice, or the OS while they follow it (the CSS entrance set's media query follows the same choice,
// accessibilityPreferences.ts).


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
  for (const ch of `${spec?.id ? tankSeedId(spec.id) : 'tank'}:${pid || 'factory'}`) { // schema-1 spelling (SSOT 2.19)
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

// 2026-10-13 (the perf stream): the picker's cold swatches drain only while the Garage is open and uncovered
// (camoSwatchPainter.ts setCamoSwatchDrainGate); main.ts adds the battle loader's cover through setDecorativeWorkGate.
let garageSwatchOpen = false;
let garageSwatchCover: () => boolean = () => false;
let swatchGateInstalled = false;
const swatchDrainOpen = (): boolean => garageSwatchOpen && !garageSwatchCover();

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
    if (!swatchGateInstalled) {
      swatchGateInstalled = true;
      loaded.setCamoSwatchDrainGate(swatchDrainOpen);
    }
    // Round 35: the exact swatch is a crop of the REAL pattern tile (4.5 ms a cold tile); resident recipes paint
    // at once, cold ones drain under the painter's per-frame budget so opening the picker never stalls.
    loaded.queueCamoSwatch(canvas, spec, pid, auto);
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
    label: nationShort(representative.nation),
    name: t(`nation.${representative.nation}`),
  }));
  const technicalViews = garageTechnicalViews();
  const technicalViewById = new Map(technicalViews.map((view) => [view.id, view]));
  const currentLocale = getLocale();
  const nextLocale = currentLocale === 'zh-CN' ? 'en-US' : 'zh-CN';
  const localeSwitchLabel = t(nextLocale === 'zh-CN'
    ? 'publicNav.language.switchToChinese'
    : 'publicNav.language.switchToEnglish');
  ensureFonts();
  const root = document.createElement('div');
  root.className = 'cot-garage';
  root.innerHTML =
    `<div class="band-top"></div><div class="band-bot"></div>` +
    `<div class="band-l"></div><div class="band-r"></div>` +
    // The game bar (brand-ui S2, SPEC 12.1.2): the mark and wordmark (home), then every destination with its key.
    `<div class="cot-brand-rail">` +
    `<button class="cot-wordmark" data-nav="home" type="button" aria-label="${t('garage.nav.home')}">` +
    `${brandMarkSVG(28)}${BRAND_WORDMARK_HTML}</button>` +
    `<nav class="cot-gbar cot-header-nav" aria-label="${t('garage.nav.garage')}">` +
    `<button class="nv on cot-nav-desktop" data-nav="garage" type="button" aria-current="page" aria-label="${t('garage.nav.garage')}" data-tip="${t('garage.nav.garage')} (G)">` +
    `${uiIconSVG('garage', 16, 'currentColor', 'nvi nvi-product')}<span class="nav-label">${t('garage.nav.garage')}</span>${keycap('G')}</button>` +
    `<button class="nv cot-nav-desktop" data-nav="deploy" type="button" aria-haspopup="dialog" aria-controls="cot-battle-menu" aria-label="${t('garage.battle')}" data-tip="${t('garage.battle')} (B)">` +
    `${uiIconSVG('deploy', 16, 'currentColor', 'nvi nvi-product')}<span class="nav-label">${t('garage.battle')}</span>${keycap('B')}</button>` +
    `<button class="nv cot-nav-desktop" data-nav="gallery" type="button" aria-label="${t('garage.nav.gallery')}" data-tip="${t('garage.nav.gallery')} (V)">` +
    `${uiIconSVG('gallery', 16, 'currentColor', 'nvi nvi-product')}<span class="nav-label">${t('garage.nav.gallery')}</span>${keycap('V')}</button>` +
    `<button class="nv cot-nav-desktop" data-nav="studio" type="button" aria-label="${t('garage.nav.studio')}" data-tip="${t('garage.nav.studio')} (F8)">` +
    `${uiIconSVG('studio', 16, 'currentColor', 'nvi nvi-product')}<span class="nav-label">${t('garage.nav.studio')}</span>${keycap('F8')}</button>` +
    `<button class="nv cot-nav-desktop cot-record-trigger" type="button" aria-label="${t('garage.nav.record')}" data-tip="${t('garage.nav.record')} (R)" ` +
    `aria-haspopup="dialog" aria-expanded="false" aria-controls="cot-record-modal">` +
    `${uiIconSVG('record', 16, 'currentColor', 'nvi')}<span class="nav-label">${t('garage.nav.record')}</span>` +
    `<span class="record-badge" aria-hidden="true">0</span><span class="record-new" aria-hidden="true" hidden></span>${keycap('R')}</button>` +
    `<button class="nv cot-nav-desktop" data-nav="docs" type="button" aria-label="${t('garage.nav.docs')}" data-tip="${t('garage.nav.docs')} (F1)">` +
    `${uiIconSVG('manual', 16, 'currentColor', 'nvi nvi-product')}<span class="nav-label">${t('garage.nav.docs')}</span>${keycap('F1')}</button>` +
    `</nav></div>` +
    `<nav class="cot-nav cot-header-nav" aria-label="${t('garage.nav.menu')}">` +
    `<div class="cot-locale-credit-wrap cot-nav-desktop">` +
    `<button class="nv cot-locale-switcher" data-nav="locale" type="button" ` +
    `aria-label="${localeSwitchLabel}">` +
    `${uiIconSVG('globe', 15, 'currentColor', 'nvi')}` +
    `<span class="cot-locale-options" aria-hidden="true">` +
    `<span${currentLocale === 'en-US' ? ' class="is-current"' : ''}>EN</span><i>/</i>` +
    `<span${currentLocale === 'zh-CN' ? ' class="is-current"' : ''}>中文</span></span></button>` +
    `<a class="cot-locale-credit" href="https://generaltranslation.com/" target="_blank" rel="noreferrer" ` +
    `aria-label="${t('publicNav.language.creditEyebrow')} ${t('publicNav.language.creditName')}">` +
    `<img src="/brand/partners/general-translation.png" alt="" draggable="false">` +
    `<span><small>${t('publicNav.language.creditEyebrow')}</small>` +
    `<strong>${t('publicNav.language.creditName')}</strong></span></a></div>` +
    `<a class="nv cot-github" data-nav="github" href="https://github.com/Kevin-Liu-01/Claude-of-Tanks" ` +
    `target="_blank" rel="noopener noreferrer" aria-label="${t('garage.nav.githubAria')}">` +
    `${uiIconSVG('github', 15, 'currentColor', 'nvi')}` +
    `<span class="nav-label">${t('garage.nav.github')}</span><span class="github-stars" data-github-stars data-github-stars-state="loading" aria-busy="true" aria-label="${t('githubStars.loadingLabel')}"></span></a>` +
    `<div class="cot-settings-slot"></div>` +
    `<button class="nv cot-mobile-nav-trigger" type="button" aria-label="${t('garage.nav.menu')}" ` +
    `aria-expanded="false" aria-controls="cot-mobile-nav-menu">` +
    `${uiIconSVG('menu', 17, 'currentColor', 'nvi')}<span class="nav-label">${t('garage.nav.menu')}</span></button>` +
    `<div class="cot-mobile-nav-menu" id="cot-mobile-nav-menu" role="group" aria-label="${t('garage.nav.menu')}" hidden>` +
    `<button type="button" data-mobile-nav="home">` +
    `${uiIconSVG('home', 20)}<span class="cot-mobile-nav-copy">` +
    `<strong>${t('garage.nav.home')}</strong></span></button>` +
    `<button type="button" data-mobile-nav="garage" aria-current="page">` +
    `${uiIconSVG('garage', 20)}<span class="cot-mobile-nav-copy">` +
    `<strong>${t('garage.nav.garage')}</strong></span></button>` +
    `<button type="button" data-mobile-nav="studio">` +
    `${uiIconSVG('studio', 20)}<span class="cot-mobile-nav-copy">` +
    `<strong>${t('garage.nav.studio')}</strong></span></button>` +
    `<button type="button" data-mobile-nav="gallery">` +
    `${uiIconSVG('gallery', 20)}<span class="cot-mobile-nav-copy">` +
    `<strong>${t('garage.nav.gallery')}</strong></span></button>` +
    `<button type="button" data-mobile-nav="docs">` +
    `${uiIconSVG('manual', 20)}<span class="cot-mobile-nav-copy">` +
    `<strong>${t('garage.nav.docs')}</strong></span></button>` +
    `<button type="button" data-mobile-nav="locale" aria-label="${localeSwitchLabel}">` +
    `${uiIconSVG('globe', 20, 'currentColor')}<span class="cot-mobile-nav-copy">` +
    `<strong>${t('settings.language.title')}</strong><small>EN / 中文</small></span></button>` +
    `<button type="button" data-mobile-nav="record">` +
    `${uiIconSVG('record', 20, 'currentColor')}<span class="cot-mobile-nav-copy">` +
    `<strong>${t('garage.nav.record')}</strong></span></button>` +
    `<button type="button" data-mobile-nav="environment">` +
    `${uiIconSVG('garage', 20, 'currentColor')}<span class="cot-mobile-nav-copy">` +
    `<strong>${t('garage.nav.stagingArea')}</strong></span></button></div></nav>` +
    `<div class="cot-battle-control">` +
    `<button class="cot-battle" type="button" data-ui-sound="deploy" aria-label="${t('garage.battle.startBots')}">` +
    `<span class="battle-active-icon">${uiIconSVG('modeStandard', 20)}</span>` +
    `<span class="battle-word">${t('garage.battle')}</span>${keycap(t('garage.key.enter'))}</button>` +
    `<button class="cot-battle-mode" type="button" aria-haspopup="dialog" aria-expanded="false" ` +
    `aria-controls="cot-battle-menu" aria-label="${t('garage.battle.menuTypeBots')}">` +
    // the battle card (the 245 redesign): the battlefield it deploys to as a picture, its name, and the mode
    `<span class="sum-pic" data-deploy-pic aria-hidden="true"></span>` +
    `<span class="sum-icon">${uiIconSVG('modeStandard', 16)}</span><span class="sum-mode">${t('garage.battle.soloLabel')}</span>` +
    `<span class="sum-map" data-deploy-map></span></button>` +
    // The Deploy screen (brand-ui S3, SPEC 12.1.4): the battle menu opens as one full screen. Its head returns to the
    // Garage and holds the four ways to play; the modes sit on the left as four cards and a grid of rows, each with its
    // glyph and the rules its ruleset sets; the plate on the right holds the selected mode, its six rules, the sides,
    // the time, the tank and one Deploy button. Private and LAN rooms open the play menu as before.
    `<div class="cot-battle-menu" id="cot-battle-menu" role="dialog" aria-modal="true" aria-labelledby="cot-deploy-title">` +
    `<header class="cot-deploy-head">` +
    `<button type="button" class="cot-deploy-back" data-battle-close data-ui-sound="back" aria-label="${t('garage.battle.closeSetup')}">` +
    `${uiIconSVG('chevronLeft', 18)}<span>${t('garage.nav.garage')}</span>${keycap('Esc')}</button>` +
    `<h2 class="cot-deploy-title" id="cot-deploy-title">${t('garage.battle')}</h2>` +
    `<nav class="cot-deploy-tabs" aria-label="${t('garage.battle.menuAria')}">` +
    `<div class="cot-deploy-tablist" role="tablist" aria-label="${t('garage.battle.menuAria')}">` +
    `<button type="button" class="cot-deploy-tab" role="tab" id="cot-deploy-tab-quick" data-tab="quick" aria-selected="true" aria-controls="cot-deploy-quick">` +
    `${uiIconSVG('battleBots', 18)}${t('garage.deploy.quick')}</button>` +
    `<button type="button" class="cot-deploy-tab" role="tab" id="cot-deploy-tab-campaign" data-tab="campaign" aria-selected="false" aria-controls="cot-deploy-campaign" tabindex="-1">` +
    `${uiIconSVG('modeFrontline', 18)}${t('campaign.heading')}<span class="cot-deploy-count num" data-deploy-campaign-count></span></button></div>` +
    `<button type="button" class="cot-deploy-tab" data-deploy-room="private">${uiIconSVG('battlePrivate', 18)}${t('garage.battle.typePrivate')}</button>` +
    `<button type="button" class="cot-deploy-tab" data-deploy-room="lan">${uiIconSVG('battleLan', 18)}${t('garage.battle.typeLan')}</button>` +
    `</nav></header>` +
    `<div class="cot-battle-menu-scroll">` +
    `<section class="cot-battle-mode-list cot-deploy-panel" id="cot-deploy-quick" role="tabpanel" aria-labelledby="cot-deploy-tab-quick" data-deploy-panel="quick">` +
    `<div class="cot-deploy-cards">` +
    `<button class="cot-battle-choice cot-deploy-card" type="button" data-mode="solo" data-mode-tone="standard" aria-pressed="true">` +
    `${deployCardArt('standard')}<span class="choice-icon">${uiIconSVG('modeStandard', 21)}</span>` +
    `<span class="cot-deploy-choice-t"><span class="choice-name">${t('garage.battle.soloLabel')}</span>` +
    `<span class="cot-deploy-chips" data-deploy-chips="standard"></span></span></button>` +
    deployCardsHTML(['zone_control', 'capture_the_flag', 'frontline_assault'], true) +
    `</div><div class="cot-deploy-rows">` +
    deployCardsHTML(['turbo_ball', 'gun_game', 'mars', 'juggernaut', 'infected', 'endless_horde', 'realistic', 'drone', 'ac130'], false) +
    // the proving ground (2026-10-20): the selected tank straight onto the range, one press from the Deploy screen
    `<button class="cot-battle-choice" type="button" data-proving data-mode-tone="proving">` +
    `${deployTileArt('proving_ground')}<span class="choice-icon">${uiIconSVG('modeProving', 21)}</span>` +
    `<span class="cot-deploy-choice-t"><span class="choice-name">${t('playMenu.matchMode.proving_ground.label')}</span></span></button>` +
    // the lower band: the campaign's next operation and the player's recent battles (renderDeployLower)
    `</div><div class="cot-deploy-lower" data-deploy-lower></div></section>` +
    `<section class="cot-deploy-panel cot-deploy-campaign" id="cot-deploy-campaign" role="tabpanel" aria-labelledby="cot-deploy-tab-campaign" data-deploy-panel="campaign" hidden>` +
    `<div class="cot-deploy-ops" role="list" data-deploy-ops></div></section>` +
    `<aside class="cot-deploy-plate" aria-labelledby="cot-deploy-mode-title" aria-describedby="cot-deploy-mode-about">` +
    // the campaign tab's plate: the operation in focus (deployScreen.ts brief)
    `<section class="cot-deploy-brief" data-deploy-brief aria-live="polite"></section>` +
    `<div class="cot-battle-details">` +
    `<div class="cot-battle-preview"><span class="cot-battle-preview-icon" data-setup-icon aria-hidden="true"></span>` +
    `<h3 id="cot-deploy-mode-title" data-setup-title></h3>` +
    `<p id="cot-deploy-mode-about" data-setup-description hidden></p></div>` +
    `<dl class="cot-deploy-rules" data-deploy-rules></dl>` +
    // the battlefield (the direction's .bfield): its art, name and region over a fade, the tactical map beside it; the
    // card opens the Garage's map picker over the plate
    `<div class="cot-deploy-field"><button type="button" class="cot-deploy-field-card" data-deploy-field aria-expanded="false" ` +
    `aria-controls="cot-deploy-field-pop" aria-label="${t('garage.tools.battlefields')}"><span class="cot-deploy-field-thumb" data-deploy-field-thumb aria-hidden="true"></span>` +
    `<span class="cot-deploy-field-nm"><span class="cot-deploy-field-name" data-deploy-field-name></span>` +
    `<span class="cot-deploy-field-tags" data-deploy-field-tags></span></span>` +
    `<span class="cot-c-chip cot-deploy-field-all" data-deploy-field-all aria-hidden="true"></span></button>` +
    `<span class="cot-deploy-field-mm" aria-hidden="true"><img data-deploy-field-mm alt="" width="256" height="256" decoding="async" hidden></span>` +
    `<div class="cot-deploy-field-pop" id="cot-deploy-field-pop" data-deploy-field-pop hidden></div></div>` +
    `<div class="cot-battle-solo-options" data-solo-options>` +
    `<div data-team-options>` +
    // sides (owner 2026-09-18): "a switch that's default set to 7v7 but then switching it does 14v14 and you can also
    // enter custom numbers of allies and enemies" — one setting for the symmetric solo modes (game/teamArrangement.ts)
    `<div class="cot-battle-menu-label">${t('garage.battle.sides')}</div>` +
    `<div class="cot-battle-sides" role="group" aria-label="${t('garage.battle.sidesAria')}">` +
    `<button class="cot-sides-choice" type="button" data-sides="7v7" aria-pressed="true">${t('garage.battle.sides7')}</button>` +
    `<button class="cot-sides-choice" type="button" data-sides="14v14" aria-pressed="false">${t('garage.battle.sides14')}</button>` +
    `<button class="cot-sides-choice" type="button" data-sides="custom" aria-pressed="false">${t('garage.battle.sidesCustom')}</button>` +
    `</div><div class="cot-battle-sides-custom" data-sides-custom hidden>` +
    `<label><span>${t('garage.battle.sidesAllies')}</span><input type="number" inputmode="numeric" step="1" ` +
    `min="${TEAM_ARRANGEMENT_LIMITS.allies.standard[0]}" max="${TEAM_ARRANGEMENT_LIMITS.allies.standard[1]}" data-sides-field="allies"></label>` +
    `<label><span>${t('garage.battle.sidesEnemies')}</span><input type="number" inputmode="numeric" step="1" ` +
    `min="${TEAM_ARRANGEMENT_LIMITS.enemies.standard[0]}" max="${TEAM_ARRANGEMENT_LIMITS.enemies.standard[1]}" data-sides-field="enemies"></label>` +
    `<b class="cot-sides-readout" data-sides-readout></b>` +
    `</div>` +
    `</div><fieldset class="cot-battle-times" data-time-options aria-describedby="cot-time-hint">` +
    battleTimeChoicesMarkup('cot-time-hint') + `</fieldset>` +
    `<div class="cot-battle-galaxy" data-galaxy-sky hidden>${uiIconSVG('regionNight', 24)}` +
    `<strong>${t('garage.battle.galaxySky')}</strong></div>` +
    // Mars settings (owner 2026-09-18 "give it a bunch of boosts and settings"): the gravity world and the
    // boost-cache cadence, shown while Mars is the selected rule (game/teamArrangement.ts readMarsSettings)
    `<div class="cot-battle-menu-label" data-mars-label hidden>${t('garage.battle.marsSettings')}</div>` +
    `<div class="cot-battle-mars" role="group" aria-label="${t('garage.battle.marsAria')}" data-mars-settings hidden>` +
    `<label><span>${t('garage.battle.marsGravity')}</span><select data-mars-field="gravity">` +
    MARS_GRAVITY_IDS.map((id) => `<option value="${id}">${t(`mars.gravity.${id}`)}</option>`).join('') + `</select></label>` +
    `<label><span>${t('garage.battle.marsCaches')}</span><select data-mars-field="caches">` +
    MARS_CACHE_IDS.map((id) => `<option value="${id}">${t(`mars.caches.${id}`)}</option>`).join('') + `</select></label></div>` +
    `</div></div>` +
    // the foot (the direction's .tank and .deploy): the tank you deploy with, its rounds and fittings, then Deploy
    `<div class="cot-battle-menu-foot"><div class="cot-deploy-tank" data-deploy-tank></div>` +
    // Watch (watch-mode-243) beside Deploy: the selected mode, map and sides with every seat a bot's, from the drone
    `<span data-setup-selection hidden></span><div class="cot-deploy-acts">` +
    `<button type="button" data-battle-watch data-ui-sound="deploy" aria-label="${t('watch.entry')}">` +
    `${uiIconSVG('freeLook', 20)}<span>${t('watch.entry')}</span></button>` +
    `<button type="button" data-battle-launch data-ui-sound="deploy">` +
    `<span class="cot-deploy-go">${uiIconSVG('deploy', 20)}<span>${t('garage.battle')}</span></span>` +
    // the launch's estimate and the key hints load with deployScreen.ts (972c9575b3); the extra </div> closes Watch's .cot-deploy-acts
    `<span class="cot-deploy-end">${keycap(t('garage.key.enter'))}</span></button></div></div>` +
    `</aside></div></div>` +
    `<button class="cot-multiplayer-entry" type="button" aria-haspopup="dialog">` +
    `${uiIconSVG('team', 17)}<span>${t('garage.multiplayer.open')}</span></button>` +
    `<div class="cot-room-controls" role="group" aria-label="${t('garage.battle.roomReadiness')}">` +
    `<button class="cot-room-reminder" type="button" aria-label="${t('garage.battle.roomReminder')}">` +
    `<span class="rr-dot"></span><span class="rr-copy" aria-live="polite"></span></button>` +
    `<button class="cot-room-ready" type="button" disabled aria-pressed="false">${t('playMenu.ready.iAmReady')}</button></div></div>` +
    // a phone held upright (the direction's 91 page): the tab bar, under the Garage and the Deploy screen alike
    `<nav class="cot-tabbar" aria-label="${t('garage.nav.menu')}">` +
    `<button type="button" data-tabbar="garage" aria-current="page">${uiIconSVG('garage', 22)}<span>${t('garage.nav.garage')}</span></button>` +
    `<button type="button" data-tabbar="deploy">${uiIconSVG('deploy', 22)}<span>${t('garage.battle')}</span></button>` +
    `<button type="button" data-tabbar="gallery">${uiIconSVG('gallery', 22)}<span>${t('garage.nav.gallery')}</span></button>` +
    `<button type="button" data-tabbar="record">${uiIconSVG('record', 22)}<span>${t('garage.nav.record')}</span></button>` +
    `<button type="button" data-tabbar="more">${uiIconSVG('menu', 22)}<span>${t('garage.nav.more')}</span></button></nav>` +
    `<button class="cot-garage-panel-scrim" type="button" aria-label="${t('garage.tools.close')}"></button>` +
    `<div class="stats" id="cot-garage-dossier" data-locked="${t('garage.vehicleLocked')}"></div>` +
    `<div class="cot-country-rail">` +
    `<button class="cot-country-edge prev is-unavailable" type="button" disabled aria-hidden="true" ` +
    `aria-label="${t('garage.country.scrollLeft')}">${uiIconSVG('chevronLeft', 14)}</button>` +
    `<div class="cot-country-chips" role="group" aria-label="${t('garage.country.filterAria')}"></div>` +
    `<button class="cot-country-edge next is-unavailable" type="button" disabled aria-hidden="true" ` +
    `aria-label="${t('garage.country.scrollRight')}">${uiIconSVG('chevronRight', 14)}</button>` +
    `</div>` +
    `<div class="cot-carousel">` +
    `<button class="cot-car-arrow prev is-unavailable" type="button" disabled aria-hidden="true" aria-label="${t('garage.carousel.prev')}">` +
    `${uiIconSVG('chevronLeft', 15)}</button>` +
    `<div class="cot-cards" role="listbox" tabindex="0" aria-label="${t('garage.carousel.listAria')}"></div>` +
    `<div class="cot-cards-empty" role="status" hidden><span>${t('garage.roster.empty')}</span>` +
    `<button type="button" class="cot-c-btn cot-c-btn--36" data-roster-clear>${t('garage.roster.clear')}</button></div>` +
    `<button class="cot-car-arrow next is-unavailable" type="button" disabled aria-hidden="true" aria-label="${t('garage.carousel.next')}">` +
    `${uiIconSVG('chevronRight', 15)}</button>` +
    `</div>` +
    `<div class="cot-leftcol">` +
    `<div class="cot-drawer-heading"><strong></strong><button type="button" class="cot-c-btn cot-c-btn--icon cot-c-btn--ghost cot-drawer-close" aria-label="${t('garage.tools.close')}">${uiIconSVG('close', 18)}</button></div>` +
    `<div class="cot-garage-variant-control">` +
    `<button class="cot-garage-variant-trigger" type="button" aria-label="${t('garage.tools.chooseStaging')}" ` +
    `aria-haspopup="listbox" aria-expanded="false" ` +
    `aria-controls="cot-garage-variant-menu">` +
    `<img class="cot-garage-variant-trigger-thumb" alt="" draggable="false">` +
    `<span class="cot-garage-variant-trigger-copy">` +
    `<strong class="cot-garage-variant-label">${t('garage.tools.environments')}</strong></span>` +
    `<span class="cot-garage-variant-action">` +
    `${uiIconSVG('chevronRight', 16, 'currentColor', 'cot-garage-variant-chevron')}</span></button></div>` +
    `<div class="cot-maps" id="cot-garage-maps"></div>` +
    `<div class="cot-camos" id="cot-garage-camos"></div></div>` +
    `<div class="cot-garage-variant-menu" id="cot-garage-variant-menu" role="listbox" data-heading="${t('garage.tools.stagingAreas')}" ` +
    `aria-label="${t('garage.tools.environments')}" hidden></div>` +
    // The showroom's lower third (brand-ui S2): the selected tank's name, once and large, over its identity as a flag and
    // glyphs. Desktop shows it beside the stage; layouts that fold the panels keep the name in the dossier's head instead.
    // The band under the name (the 245 redesign): the three equipment slots, the paint (what the tank wears, three more to
    // try and every paint) and the stage's acts, always in view, so nothing about the tank hides behind a tab.
    `<section class="cot-lower-third"><div class="cot-lt-head" aria-live="polite"><h2 class="cot-lt-name"></h2><div class="cot-lt-id"></div></div>` +
    `<div class="cot-lt-band"><div class="cot-lt-group"><span class="cot-lt-cap" aria-hidden="true">${t('garage.band.equipment')}</span>` +
    `<div class="cot-lt-loadout eqrow" role="group" aria-label="${t('garage.dossier.equipment.heading')}"></div></div>` +
    `<div class="cot-lt-group"><span class="cot-lt-cap" aria-hidden="true">${t('garage.band.paint')}</span>` +
    `<div class="cot-lt-paint" role="group" aria-label="${t('garage.tools.camos')}"></div></div>` +
    `<div class="cot-lt-acts"><button type="button" class="cot-c-btn cot-lt-act" data-lt-callouts aria-pressed="false" ` +
    `aria-keyshortcuts="I" data-tip="${t('garage.act.calloutsTip')} (I)">${uiIconSVG('info', 18)}<span>${t('garage.act.callouts')}</span></button>` +
    `<button type="button" class="cot-c-btn cot-lt-act" data-lt-anatomy ` +
    `data-tip="${t('garage.act.anatomyTip')}">${uiIconSVG('layerXray', 18)}<span>${t('garage.act.anatomy')}</span></button>` +
    `<button type="button" class="cot-c-btn cot-lt-act" data-lt-test-drive ` +
    `data-tip="${t('garage.act.testDriveTip')}">${uiIconSVG('modeProving', 18)}<span>${t('garage.act.drive')}</span></button>` +
    `<button type="button" class="cot-c-btn cot-lt-act" data-lt-photo hidden aria-keyshortcuts="P" ` +
    `data-tip="${t('garage.act.photoTip')} (P)">${uiIconSVG('toolPhoto', 18)}<span>${t('garage.photo.open')}</span></button></div></div></section>` +
    // the readout's station tabs (the 245 redesign): one row of glyphs over the readout, each named under its glyph
    `<nav class="cot-stations" aria-label="${t('garage.station.aria')}"><div class="cot-stations-list" role="tablist" aria-orientation="horizontal" aria-label="${t('garage.station.aria')}">` +
    GARAGE_STATIONS.map(([id, glyph], index) => `<button type="button" class="cot-station" role="tab" data-tab="${id}" data-station="${id}" ` +
      `aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}" aria-controls="cot-garage-dossier" aria-keyshortcuts="${index + 1}">` +
      `${uiIconSVG(glyph, 18)}<span>${t(`garage.station.${id}`)}</span></button>`).join('') + `</div></nav>`;
  document.body.appendChild(root);
  mountGitHubStars(root);

  // The Service Record dialog renders only while open: a garage return after battle
  // refreshes just the button's badges, never a hidden tab of medal artwork.
  let serviceRecord: ReturnType<typeof createServiceRecordDialog> | null = null;
  let recordOpening = false;
  let recordOpenRevision = 0;
  const recordNames: RecordViewNames = {
    vehicle: (id) => {
      const vehicle = allSpecs.find((spec) => spec.id === id);
      return vehicle?.label?.displayName || vehicle?.name || id || t('garage.record.unknownVehicle');
    },
    map: (id) => (opts.maps || []).find((entry) => entry.id === id)?.name || id || t('garage.record.unknownMap'),
    modeIcon: (mode) => battleRuleMeta[mode as GameModeId]?.icon || 'modeStandard',
  };
  function refreshServiceRecord() {
    const record = getPlayerRecord();
    const badge = root.querySelector<HTMLElement>('.cot-record-trigger .record-badge');
    if (badge) badge.textContent = record.matches > 999 ? '999+' : formatNumber(record.matches);
    const fresh = unseenAwardCount();
    const dot = root.querySelector<HTMLElement>('.cot-record-trigger .record-new');
    if (dot) dot.hidden = fresh === 0;
    root.querySelector('.cot-record-trigger')?.setAttribute('aria-label',
      fresh ? t('garage.record.triggerNew', { count: formatNumber(fresh) }) : t('garage.nav.record'));
    serviceRecord?.refresh();
  }

  // --- MARKETING FEATURED PANEL: rotating in-engine action stills ------------
  // Assets + captions are the site fifty's stills (public/media/site50-r14/stills, picked in
  // tools/media-r5/site-media/picks.json; captions from the catalog). The panel is
  // created programmatically so the main markup block stays untouched; it
  // crossfades every 8 s, click advances, hover pauses. Images lazy-load —
  // a missing set simply never shows the panel's layers (gradient card).
  // r9.5: the list moved to featuredShots.ts — ONE copy shared with the boot
  // splash and the transition screens (hand-synced copies drifted from disk
  // twice; r9.1 was the "always the same picture" bug that caused).
  // The selected tank's own take (owner 2026-10-12, fleetTakes.ts): once the
  // Garage is playable (or on intent) and the panel is on screen, the fleet
  // index loads; while it has the selected tank, the panel shows that take's
  // poster and silent loop in place of the rotation, which returns for a tank
  // without one. Nothing loads and no video decodes while the panel is hidden
  // (short or narrow layouts, battle): its loop pauses, then is released.
  const featuredPanel = (() => {
    const col = root.querySelector<HTMLElement>('.cot-leftcol');
    if (!col || !FEATURED_SHOTS.length) return null;
    const panel = document.createElement('div');
    panel.className = 'cot-featured';
    // the take names itself by its pictures and caption; the region keeps the gallery's name for assistive technology
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', t('garage.gallery.title'));
    panel.innerHTML =
      `<div class="fshot"><div class="fly"></div><div class="fly"></div>` +
      `<button class="fnav prev" type="button" aria-label="${t('garage.gallery.prevShot')}">&#8249;</button>` +
      `<button class="fnav next" type="button" aria-label="${t('garage.gallery.nextShot')}">&#8250;</button>` +
      `<div class="fcap"></div></div>` +
      `<div class="ftitle cot-sidebar-section-title"><span class="fdots">` +
      FEATURED_SHOTS.map(() => '<span></span>').join('') +
      `</span></div>`;
    root.appendChild(panel);
    const layers = panel.querySelectorAll<HTMLElement>('.fly');
    const capEl = requiredElement<HTMLElement>(panel, '.fcap');
    const dots = panel.querySelectorAll<HTMLElement>('.fdots span');
    const shotEl = requiredElement<HTMLElement>(panel, '.fshot');
    let idx = -1;
    let front = 0;
    let timer: ReturnType<typeof setInterval> | 0 = 0;
    let engaged = false;
    let vehicleId = '';
    let vehicleTake: FleetTake | null = null;
    let fleet: FleetTakesModule | null = null;
    let fleetIndex: FleetTakeIndex | null = null;
    let fleetRequest: Promise<void> | null = null;
    let player: FleetTakePlayer | null = null;
    const show = (i: number, imageUrl = FEATURED_SHOTS[i].img): void => {
      front ^= 1;
      layers[front].style.backgroundImage = `url("${imageUrl}")`;
      layers[front].classList.add('on');
      layers[front ^ 1].classList.remove('on');
      capEl.textContent = t(FEATURED_SHOTS[i].capKey, FEATURED_SHOTS[i].capVars);
      dots.forEach((d, k) => d.classList.toggle('on', k === i));
      idx = i;
    };
    const preload = (i: number, cb: (url: string) => void, priority: ImagePriority = 'low'): void => {
      preloadImage(FEATURED_SHOTS[i].img, { priority }).then((url) => {
        if (url) cb(url);
      });
    };
    const jump = (i: number, priority: ImagePriority = 'high') => preload(i, (url) => {
      if (!vehicleTake) show(i, url);
    }, priority);
    const advance = (priority: ImagePriority = 'low') => {
      if (!vehicleTake) jump((idx + 1) % FEATURED_SHOTS.length, priority);
    };
    const arm = () => { if (!timer && !vehicleTake) timer = setInterval(advance, 8000); };
    // r9.1: manual browse resets the auto-rotate clock so it never snatches
    // the frame away right after the user picked one
    const rearm = () => { if (timer) { clearInterval(timer); timer = 0; } arm(); };
    // The compact Garage panel starts with the dedicated 44 kB preview of the
    // same full-quality shot. Full-resolution gallery media and rotation begin
    // only on user intent, so a pristine Garage never decodes hundreds of kB
    // of unrelated marketing art while its 3D scene becomes interactive.
    const first = 0;
    let activated = false;
    const showFirst = (priority: ImagePriority): void => {
      const preview = FEATURED_SHOTS[first].bootImg || FEATURED_SHOTS[first].img;
      preloadImage(preview, { priority }).then((url) => { if (url && !vehicleTake && idx < 0) show(first, url); });
    };
    const applyVehicleTake = (): void => {
      const take = fleetIndex?.get(vehicleId) ?? null;
      if (take === vehicleTake) return;
      vehicleTake = take;
      panel.classList.toggle('vehicle', !!take);
      if (take && fleet) {
        if (timer) { clearInterval(timer); timer = 0; }
        player ??= fleet.createFleetTakePlayer(shotEl, () => activated);
        capEl.textContent = fleet.fleetTakeText(take, 'short');
        shotEl.dataset.tip = fleet.fleetTakeText(take, 'title');
      } else {
        shotEl.removeAttribute('title');
        if (idx >= 0) capEl.textContent = t(FEATURED_SHOTS[idx].capKey, FEATURED_SHOTS[idx].capVars);
        else if (activated) showFirst('low');
        if (engaged) arm();
      }
      player?.show(take);
    };
    // The panel is on screen only on tall layouts while the Garage is open.
    let panelVisible = typeof IntersectionObserver !== 'function';
    const requestFleetTakes = (): Promise<void> => {
      if (!panelVisible) return Promise.resolve();
      fleetRequest ??= import('./fleetTakes.ts').then(async (module) => {
        fleet = module;
        fleetIndex = await module.loadFleetTakes();
        applyVehicleTake();
      }, () => { fleetRequest = null; });
      return fleetRequest;
    };
    if (typeof IntersectionObserver === 'function') {
      new IntersectionObserver((entries) => {
        panelVisible = entries.some((entry) => entry.isIntersecting);
        if (panelVisible && activated) void requestFleetTakes();
      }).observe(shotEl);
    }
    const activate = (priority: ImagePriority = 'low') => {
      if (activated) return;
      activated = true;
      void requestFleetTakes().then(() => {
        if (vehicleTake) player?.sync(); // the tank's own take stands in for the stills
        else showFirst(priority);
      });
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
    const engageGallery = () => { engaged = true; activate('high'); arm(); };
    shotEl.addEventListener('pointerenter', engageGallery, { once: true });
    shotEl.addEventListener('focusin', engageGallery, { once: true });
    shotEl.addEventListener('click', () => {
      activate('high');
      if (vehicleTake) { player?.toggle(); return; }
      advance('high');
      rearm();
    });
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
    return {
      /** The selected tank changed: its own take where the index has one, the rotation otherwise. */
      setVehicle(specId: string): void {
        vehicleId = specId;
        applyVehicleTake();
      },
    };
  })();

  const statsEl = requiredElement<HTMLElement>(root, '.stats');
  // the band under the name: the equipment slots and the paint, re-drawn for each tank (renderStats, refreshCamoSel)
  const loadoutEl = requiredElement<HTMLElement>(root, '.cot-lt-loadout');
  const paintEl = requiredElement<HTMLElement>(root, '.cot-lt-paint');
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
  // the Deploy screen's second half (deployScreen.ts), mounted with its sheet before the screen first shows
  let deployScreen: DeployScreen | null = null;
  let difficulty: DeployDifficulty | null = null;
  // The Deploy screen fills the viewport, so it lives at the Garage root, outside the Deploy button's transformed box.
  root.appendChild(battleMenu);
  const battleMenuScroll = requiredElement<HTMLElement>(battleMenu, '.cot-battle-menu-scroll');
  const battleChoices = [...root.querySelectorAll<HTMLButtonElement>('.cot-battle-choice[data-mode]')];
  const battleRuleChoices = [...root.querySelectorAll<HTMLButtonElement>('.cot-battle-choice[data-game-mode]')];
  const roomReminder = requiredElement<HTMLButtonElement>(root, '.cot-room-reminder');
  const roomControls = requiredElement<HTMLElement>(root, '.cot-room-controls');
  const roomReady = requiredElement<HTMLButtonElement>(root, '.cot-room-ready');
  const mapsEl = requiredElement<HTMLElement>(root, '.cot-maps');
  const recordTrigger = requiredElement<HTMLButtonElement>(root, '.cot-record-trigger');
  const garageVariantTrigger = requiredElement<HTMLButtonElement>(root, '.cot-garage-variant-trigger');
  const garageVariantMenu = requiredElement<HTMLElement>(root, '.cot-garage-variant-menu');
  const garageVariantLabel = requiredElement<HTMLElement>(root, '.cot-garage-variant-label');
  const garageVariantThumb = requiredElement<HTMLImageElement>(root, '.cot-garage-variant-trigger-thumb');
  const mobileNavTrigger = requiredElement<HTMLButtonElement>(root, '.cot-mobile-nav-trigger');
  const mobileNavMenu = requiredElement<HTMLElement>(root, '.cot-mobile-nav-menu');
  const garagePanelScrim = requiredElement<HTMLButtonElement>(root, '.cot-garage-panel-scrim');

  // --- STATIONS (brand-ui S2): the rail's six views of the selected tank (keys 1 to 6). Each shows its dossier sections;
  // Protection and Crew open the matching technical view; Appearance takes the column for the paint and the staging area.
  const stationTabs = requiredElement<HTMLElement>(root, '.cot-stations-list');
  let station: GarageStation = 'overview';
  root.dataset.station = station;
  function setStation(next: GarageStation, { sound = true } = {}): void {
    station = next;
    root.dataset.station = next;
    if (calloutsShown) opts.onOverlayChange?.(); // the callouts show on the overview alone
    for (const tab of stationTabs.querySelectorAll<HTMLElement>('[role=tab]')) {
      const on = tab.dataset.station === next;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
    }
    const layer = next === 'protection' ? 'armor' : next === 'crew' ? 'crew' : null;
    const view = layer ? statsEl.querySelector<HTMLButtonElement>(`.cot-technical-tab[data-technical-layer="${layer}"]`) : null;
    if (view && view.getAttribute('aria-selected') !== 'true') activateTechnicalTab(view);
    queueReadoutFit(false, true);
    if (sound) emit('ui:click', {});
  }
  wireRoving(stationTabs, (id) => setStation(id as GarageStation));
  // The readout never scrolls (the 245 redesign): a docked column steps its station through four densities (showroom.css)
  // until it fits. Each density carries the lighter ones as tokens ("1 2 3"), so a rule names the lightest density it
  // belongs to. The fit runs in the frame's callback, before that frame paints, so a press (a station, a tank) reads no
  // layout of its own (click-perf-244); a station, tank and window it has fitted before takes its density from memory.
  const READOUT_DENSITY = Object.freeze(['0', '1', '1 2', '1 2 3', '1 2 3 4']);
  const readoutDensities = new Map<string, number>();
  function fitReadout(force = false): void {
    if (document.body.dataset.cotPanels === 'overlay') { delete statsEl.dataset.density; return; }
    const key = `${station}|${statsFor}|${window.innerWidth}x${window.innerHeight}`;
    const known = force ? undefined : readoutDensities.get(key);
    // a remembered density is checked once (the frame lays the readout out to paint it anyway): the same tank's readout
    // can grow after it was fitted (its actions row, a late key cap), and one that no longer fits steps on from there
    let density = known ?? 0;
    statsEl.dataset.density = READOUT_DENSITY[density];
    while (density < 4 && statsEl.scrollHeight > statsEl.clientHeight + 1) statsEl.dataset.density = READOUT_DENSITY[++density];
    if (readoutDensities.size > 64) readoutDensities.clear();
    readoutDensities.set(key, density);
  }
  let readoutFitQueued = false;
  let readoutFitForced = false;
  let readoutScrollReset = false;
  // `toTop` puts the readout at its top in the same callback: a scroll write lays out what it scrolls, so a press that
  // rebuilds the dossier and then resets its scroll laid the whole Garage out inside the press (click-perf-248).
  const queueReadoutFit = (force = false, toTop = false): void => {
    readoutFitForced ||= force;
    readoutScrollReset ||= toTop;
    if (readoutFitQueued) return;
    readoutFitQueued = true;
    requestAnimationFrame(() => {
      const forced = readoutFitForced, reset = readoutScrollReset;
      readoutFitQueued = false;
      readoutFitForced = false;
      readoutScrollReset = false;
      // a window that unfolds shows the dossier whole
      renderStaleDossier();
      fitReadout(forced);
      if (reset) statsEl.scrollTop = 0;
    });
  };
  window.addEventListener('resize', () => queueReadoutFit());
  window.addEventListener('cot:layoutchange', () => queueReadoutFit(true));
  // the technical drawing loads after its station opens: its arrival is measured afresh
  statsEl.addEventListener('load', () => queueReadoutFit(true), true);
  // the display and data faces settle the readout's line heights: what was fitted before they arrived is fitted again
  void document.fonts?.ready.then(() => { readoutDensities.clear(); queueReadoutFit(true); });

  // --- OVERVIEW (brand-ui S2): the headline rows against a rival of the same tier and class, both on the tank's own peer
  // scale, so a tick on the 20 cells is the rival and the delta is the gap.
  let rivalChoice: string | null = null;
  // the comparison is a chip the player turns on (owner 10-24: "change the vs"): off, the readout carries no rival, no
  // deltas and no rival marks; on, the rival's picker stands beside the chip and each figure shows its gap. Per session.
  const COMPARE_KEY = 'cot.garage.compare';
  let compareOn = false;
  try { compareOn = sessionStorage.getItem(COMPARE_KEY) === '1'; } catch (_) { /* this page only */ }
  const rivalPeers = (spec: GarageTankSpec): GarageTankSpec[] => {
    const group = statGroupOf(spec);
    return specs.filter((other) => other.id !== spec.id && statGroupOf(other) === group)
      .sort((a, b) => (a.label?.displayName || a.name).localeCompare(b.label?.displayName || b.name));
  };
  const rivalFor = (spec: GarageTankSpec): GarageTankSpec | null => {
    const peers = rivalPeers(spec);
    const chosen = peers.find((other) => other.id === rivalChoice);
    if (chosen) return chosen;
    // by default the nearest foreign peer in weight and calibre: a main battle tank meets a main battle tank
    const gap = (other: GarageTankSpec) => Math.abs(other.weightTons - spec.weightTons) / spec.weightTons
      + Math.abs(other.gun.caliberMm - spec.gun.caliberMm) / spec.gun.caliberMm;
    const foreign = peers.filter((other) => other.nation !== spec.nation);
    // ...that differs in at least two headline figures (the gauntlet 10-25: a sibling on the same template compared
    // even on every row, so Compare showed nothing)
    const mine = headlineOf(spec);
    const differs = (other: GarageTankSpec): number => {
      const theirs = headlineOf(other);
      return (['dmg', 'reload', 'speed', 'hpt', 'hp', 'turret'] as const).filter((key) => Math.abs(theirs[key] - mine[key]) > 1e-3).length;
    };
    const pool = (foreign.length ? foreign : peers).slice().sort((a, b) => gap(a) - gap(b));
    return pool.find((other) => differs(other) >= 2) ?? pool[0] ?? null;
  };
  const headlineOf = (spec: GarageTankSpec, reloadMult = 1, turretMult = 1) => ({
    dmg: Math.max(0, ...(spec.gun.shells || []).map((shell) => shell.dmg || 0)),
    reload: (spec.gun.autoloader?.fullReloadS || spec.gun.reloadS) * reloadMult,
    speed: spec.topSpeedKmh, hpt: spec.enginePowerHp / spec.weightTons, hp: spec.hp,
    turret: spec.turretTraverseDegS * turretMult,
  });
  function overviewSection(spec: GarageTankSpec, eqM: ReturnType<typeof computeEquipMults>,
    shells: readonly GarageShellSpec[]): string {
    const group = statGroupOf(spec);
    const rival = compareOn ? rivalFor(spec) : null;
    const mine = headlineOf(spec, eqM.reload, eqM.turret);
    const theirs = rival ? headlineOf(rival) : null;
    const cells = (key: StatRangeKey, value: number, lowerBetter: boolean) =>
      Math.max(1, Math.round(statFrac(group, key, value, lowerBetter) * 20));
    const row = (glyph: string, label: string, key: keyof typeof mine & StatRangeKey, unit: string, digits: number, lowerBetter = false) => {
      const value = mine[key];
      const other = theirs?.[key];
      const gap = other == null ? null : Number((value - other).toFixed(digits));
      // an even figure carries no gap: only a difference is news
      const delta = gap == null || gap === 0 ? '' : `<em class="num${(lowerBetter ? gap < 0 : gap > 0) ? ' up' : ' dn'}">` +
        `${gap > 0 ? '+' : '−'}${Math.abs(gap).toFixed(digits)}</em>`;
      return `<div class="cot-hrow">${uiIconSVG(glyph, 18)}<span class="k">${label}</span>` +
        `<span class="v"><b class="num">${value.toFixed(digits)}</b>${unit ? `<small>${unit}</small>` : ''}${delta}</span>` +
        scale20(cells(key, value, lowerBetter), other == null ? undefined : cells(key, other, lowerBetter)) + `</div>`;
    };
    const peers = rival ? rivalPeers(spec) : [];
    const picker = `<div class="cot-compare">` + (rival
      ? `<label class="cot-rival">${flagIconHTML(rival.nation, 22, 16)}` +
        `<select data-rival aria-label="${t('garage.rival.aria')}">${peers.map((other) =>
          `<option value="${other.id}"${other.id === rival.id ? ' selected' : ''}>${escapeHtmlAttribute(other.label?.displayName || other.name)}</option>`).join('')}` +
        `</select>${uiIconSVG('chevronDown', 14)}</label>`
      : '') +
      `<button type="button" class="cot-c-chip cot-compare-toggle" data-compare aria-pressed="${compareOn}">` +
      `<span class="cot-c-chip__label">${t('garage.compare')}</span></button></div>`;
    const turretless = spec.armor.turretless && spec.hydropneumaticAim;
    return `<section class="cot-stat-section cot-overview-section cot-primary" data-stations="overview">${picker}<div class="cot-headline">` +
      row('damage', t('garage.dossier.stat.damage'), 'dmg', 'hp', 0) +
      row('clock', spec.gun.autoloader ? t('garage.stat.magazineReload') : t('garage.stat.reload'), 'reload', 's', 1, true) +
      row('speed', t('garage.dossier.stat.speed'), 'speed', 'km/h', 0) +
      row('engine', t('garage.dossier.stat.hpt'), 'hpt', 'hp/t', 1) +
      row('shield', t('garage.dossier.stat.hp'), 'hp', '', 0) +
      (turretless ? '' : row('turretRing', t('garage.equipment.metric.turretTraverse'), 'turret', '°/s', 1)) +
      `</div>${magazineFigures(spec.gun, eqM.reload)}${actionsRow(spec)}<div class="cot-ammo-tiles">${shells.map((shell) => `<div class="cot-ammo-tile">${shellIconSVG(shell.type, 28)}` +
        `<b class="num">${shell.pen100Mm}<small>mm</small></b><span class="ft"><span>${shellTypeLabel(shell.type)}</span>` +
        `<span class="num">${shell.dmg}</span></span></div>`).join('')}</div>` +
      // a folded layout shows three of the rows; this opens the whole dossier
      `<button type="button" class="cot-overview-more" data-garage-panel="equipment" aria-expanded="false" aria-controls="cot-garage-dossier" ` +
      `aria-label="${t('garage.dossier.vehicleDossier')}">${uiIconSVG('chevronRight', 18)}</button></section>`;
  }
  statsEl.addEventListener('click', (event) => {
    if (!(event.target as Element | null)?.closest('[data-compare]')) return;
    compareOn = !compareOn;
    try { sessionStorage.setItem(COMPARE_KEY, compareOn ? '1' : '0'); } catch (_) { /* this page only */ }
    emit('ui:click', {});
    const spec = specById.get(selectedId);
    if (spec) renderStats(spec);
    // the chip keeps the focus through the rebuild
    statsEl.querySelector<HTMLElement>('[data-compare]')?.focus({ preventScroll: true });
  });
  statsEl.addEventListener('change', (event) => {
    const select = (event.target as Element | null)?.closest<HTMLSelectElement>('[data-rival]');
    if (!select) return;
    rivalChoice = select.value;
    emit('ui:click', {});
    const spec = specById.get(selectedId);
    if (spec) renderStats(spec);
  });

  let selectedId = specs[0]?.id || '';
  let battleMode: BattleMode = 'solo';
  let battleGameMode: GameModeId = 'standard';
  let vehicleLocked = false;
  let roomStatus: GarageRoomStatus | null = null;
  const garageVariants = Array.isArray(opts.garageVariants) ? opts.garageVariants : [];
  let selectedGarageVariantId = garageVariants.some((variant) =>
    variant.id === opts.selectedGarageVariantId)
    ? opts.selectedGarageVariantId : garageVariants[0]?.id || '';
  const garageVariantButtons = new Map<string, HTMLButtonElement>();
  const cardById = new Map<string, HTMLElement>();
  const cardsByCountry = new Map<string, HTMLElement[]>();
  const specsByCountry = new Map<string, GarageTankSpec[]>();
  // the roster's every-nation strip (the direction's All chip): one more key in the national maps, so the strip, the
  // count, the filter's fallback and the arrows read it as they read a nation
  const ALL_COUNTRIES = 'all';
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
    specsByCountry.set(ALL_COUNTRIES, [...specs]);
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
    const variantDisplayName = t(`garage.variant.${selected.id}`) || selected.name;
    const variantLocation = t(`garageVariant.${selected.id}.location`) || selected.location;
    garageVariantLabel.textContent = variantDisplayName;
    garageVariantThumb.src = selected.thumb || selected.hero || '';
    garageVariantThumb.hidden = !garageVariantThumb.src;
    garageVariantTrigger.dataset.tip = `${variantDisplayName} · ${variantLocation}`;
    garageVariantTrigger.setAttribute('aria-label',
      t('garage.tools.environmentAria', { name: variantDisplayName }));
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
      name.textContent = t(`garage.variant.${variant.id}`) || variant.name;
      const location = document.createElement('small');
      location.textContent = t(`garageVariant.${variant.id}.location`) || variant.location;
      const description = document.createElement('em');
      description.textContent = t(`garageVariant.${variant.id}.description`) || variant.description;
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
    window.location.href = hrefForLocale(garageGalleryHref(selectedId, layer), getLocale());
  };
  const isRecordOpen = () => serviceRecord?.isOpen() || recordOpening;
  const openServiceRecord = async () => {
    if (recordOpening) return;
    closeGarageVariantMenu(); setGaragePanel('');
    const revision = ++recordOpenRevision;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : recordTrigger;
    recordOpening = true;
    try {
      const [{ createServiceRecordDialog }] = await Promise.all([
        import('./serviceRecordDialog.ts'), import('./serviceRecord.css'), import('./richTooltip.css'),
      ]);
      if (revision !== recordOpenRevision) return;
      serviceRecord ??= createServiceRecordDialog(recordNames, () => {
        recordTrigger.setAttribute('aria-expanded', 'false'); refreshServiceRecord();
      });
      serviceRecord.open(trigger); recordTrigger.setAttribute('aria-expanded', 'true'); refreshServiceRecord();
    } catch { recordTrigger.dataset.tip = t('garage.record.loadError'); }
    finally { recordOpening = false; }
  };
  const closeServiceRecord = ({ restoreFocus = true } = {}) => {
    recordOpenRevision++; serviceRecord?.close({ restoreFocus });
  };
  const isMobileNavigationOpen = () => !mobileNavMenu.hidden;
  const closeMobileNavigation = ({ restoreFocus = false } = {}) => {
    if (!isMobileNavigationOpen()) return;
    mobileNavMenu.hidden = true;
    mobileNavTrigger.setAttribute('aria-expanded', 'false');
    mobileNavTrigger.setAttribute('aria-label', t('garage.mobileNav.openAria'));
    if (restoreFocus) mobileNavTrigger.focus();
  };
  const isOverlayPanelLayout = () => document.body.dataset.cotPanels === 'overlay';
  const openGaragePanel = () => root.dataset.garagePanel || '';
  // a folded layout shows the overview's figures until its dossier opens: the rest of the dossier waits for that press
  // (click-perf-248: rebuilding the hidden dossier was most of a phone's tank switch)
  let dossierStale = false;
  const dossierFolded = (): boolean => isOverlayPanelLayout() && openGaragePanel() !== 'equipment';
  const renderStaleDossier = (): void => {
    const spec = dossierStale && !dossierFolded() ? specById.get(selectedId) : null;
    if (spec) renderStats(spec);
  };
  const setGaragePanel = (panel = '', { restoreFocus = false } = {}) => {
    const previous = openGaragePanel();
    // every paint (the band's last swatch) opens over the stage in a docked layout too; the other panels fold away there
    const next = panel && (isOverlayPanelLayout() || panel === 'appearance') ? panel : '';
    if (next) root.dataset.garagePanel = next;
    else delete root.dataset.garagePanel;
    if (next === 'equipment') renderStaleDossier();
    if (next === 'appearance' && previous !== next) refreshCamoSel(); // the swatches it left for the drawer
    for (const [element, active, label] of [
      [statsEl, next === 'equipment', t('garage.dossier.vehicleDossier')],
      [requiredElement<HTMLElement>(root, '.cot-leftcol'), next === 'maps' || next === 'appearance',
        t(next === 'maps' ? 'garage.tools.battlefields' : 'garage.tools.camos')],
    ] as const) {
      if (active) {
        element.setAttribute('role', 'dialog');
        element.setAttribute('aria-modal', 'true');
        element.setAttribute('aria-label', label);
      } else {
        element.removeAttribute('role');
        element.removeAttribute('aria-modal');
        element.removeAttribute('aria-label');
      }
    }
    const drawerTitle = root.querySelector<HTMLElement>('.cot-drawer-heading strong');
    if (drawerTitle) drawerTitle.textContent = t(next === 'maps' ? 'garage.tools.battlefields' : 'garage.tools.camos');
    root.querySelectorAll<HTMLButtonElement>('[data-garage-panel]').forEach((button) => {
      const expanded = button.dataset.garagePanel === next;
      button.setAttribute('aria-expanded', String(expanded));
    });
    if (restoreFocus && previous) {
      // the panel's visible trigger (the band's every-paint swatch, the figures' more button, a folded tool card)
      [...root.querySelectorAll<HTMLButtonElement>(`button[data-garage-panel="${previous}"]`)]
        .find((button) => button.getClientRects().length > 0)?.focus();
    }
    requestAnimationFrame(() => {
      syncSidebarPanelHeight();
      queueCountryRailAffordances();
      if (next && previous !== next && openGaragePanel() === next) {
        root.querySelector<HTMLElement>(next === 'equipment' ? '.cot-dossier-close' : '.cot-drawer-close')?.focus({ preventScroll: true });
      }
    });
  };
  let technicalExpandTrigger: HTMLButtonElement | null = null;
  const technicalModal = createModal({
    title: t('garage.dossier.vehicleDossier'),
    size: 'wide',
    className: 'cot-technical-viewer',
    closeLabel: t('garage.dossier.closeTechnical'),
    onClose: () => {
      technicalExpandTrigger?.setAttribute('aria-expanded', 'false');
      technicalExpandTrigger = null;
    },
  });
  technicalModal.panel.id = 'cot-technical-viewer-dialog';
  technicalModal.body.innerHTML =
    `<div class="cot-technical-viewer-tabs" role="tablist" aria-label="${t('garage.dossier.tabs.aria')}">` +
    technicalViews.map((view, index) => {
      const translated = translateTechnicalView(view);
      return `<button class="cot-technical-viewer-tab" type="button" role="tab" ` +
      `id="cot-technical-viewer-tab-${view.id}" aria-controls="cot-technical-viewer-panel" ` +
      `aria-selected="${index === 0 ? 'true' : 'false'}" tabindex="${index === 0 ? '0' : '-1'}" ` +
      `data-technical-modal-view="${view.id}">${translated.label}</button>`;
    }).join('') + `</div>` +
    `<figure class="cot-technical-viewer-figure" id="cot-technical-viewer-panel" role="tabpanel" ` +
    `aria-labelledby="cot-technical-viewer-tab-armor">` +
    `<img data-technical-modal-image alt="" draggable="false" decoding="async">` +
    `<figcaption><span data-technical-modal-caption></span>` +
    `<small>${t('garage.dossier.anatomyGenerated')}</small></figcaption></figure>`;
  const technicalModalImage = requiredElement<HTMLImageElement>(technicalModal.body, '[data-technical-modal-image]');
  const technicalModalCaption = requiredElement<HTMLElement>(technicalModal.body, '[data-technical-modal-caption]');
  const technicalModalPanel = requiredElement<HTMLElement>(technicalModal.body, '#cot-technical-viewer-panel');
  const technicalModalTabs = [...technicalModal.body.querySelectorAll<HTMLButtonElement>('[data-technical-modal-view]')];

  const selectTechnicalModalView = (viewId: GarageTechnicalViewId): void => {
    const view = technicalViewById.get(viewId);
    const spec = specById.get(selectedId);
    if (!view || !spec) return;
    const translated = translateTechnicalView(view);
    const name = spec.label?.displayName || spec.name;
    technicalModal.setTitle(`${name} — ${translated.label}`);
    technicalModal.setSubtitle(translated.caption);
    technicalModalImage.src = iconUrl(spec.id, view.assetView);
    technicalModalImage.alt = `${name} ${translated.caption.toLowerCase()}`;
    technicalModalCaption.textContent = translated.caption;
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
  garagePanelScrim.addEventListener('click', () => setGaragePanel('', { restoreFocus: true }));
  root.querySelector('.cot-drawer-close')?.addEventListener('click', () => setGaragePanel('', { restoreFocus: true }));
  window.addEventListener('cot:layoutchange', () => {
    if (!isOverlayPanelLayout()) setGaragePanel('');
    syncSidebarPanelHeight();
  });
  // a docked layout has no scrim under every paint: a press anywhere else closes it (in capture, before the stage's drag)
  document.addEventListener('pointerdown', (event) => {
    if (isOverlayPanelLayout() || openGaragePanel() !== 'appearance') return;
    const target = eventElement(event);
    if (target?.closest('.cot-leftcol, .cot-garage-variant-menu, button[data-garage-panel="appearance"], .cot-modal-root')) return;
    setGaragePanel('');
  }, true);
  const openMobileNavigation = () => {
    closeBattleMenu();
    setGaragePanel('');
    mobileNavMenu.hidden = false;
    mobileNavTrigger.setAttribute('aria-expanded', 'true');
    mobileNavTrigger.setAttribute('aria-label', t('garage.mobileNav.closeAria'));
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
    if (!openGaragePanel() || event.code !== 'Escape' || isAnyModalOpen() || eqOpenSlot >= 0) return;
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
  // The card strip and the flags snap each stop to an item's start (owner 10-24: no card or flag cut at the left edge).
  // Their last stop needs the end padding that lands it on one too, measured only when a rail's width or items change.
  const railEndKeys = new WeakMap<HTMLElement, string>();
  // The cards take the width that fits a whole number of them in the strip (within a fifth of their own), so a strip at
  // rest never shows part of a card at either edge (the gauntlet 10-25: a cut card's clipped name under the arrows).
  const fitCards = (): void => {
    cardsEl.removeAttribute('data-fit');
    const card = [...cardsEl.children].find((child): child is HTMLElement => child instanceof HTMLElement && child.offsetWidth > 0);
    if (!card) return;
    const cs = getComputedStyle(cardsEl);
    const gap = parseFloat(cs.columnGap) || 0;
    const room = cardsEl.clientWidth - 2 * (parseFloat(cs.paddingLeft) || 0); // the right pad's base is the left's
    const base = card.offsetWidth;
    // the whole count either side of the natural fit, whichever keeps the cards nearest their own width
    const exact = (room + gap) / (base + gap);
    let width = 0;
    for (const count of [Math.floor(exact), Math.ceil(exact)]) {
      if (count < 1) continue;
      const fit = (room - (count - 1) * gap) / count;
      if (fit > base * 0.8 && fit < base * 1.3 && (!width || Math.abs(fit - base) < Math.abs(width - base))) width = fit;
    }
    if (width) {
      cardsEl.style.setProperty('--card-fit', `${width.toFixed(2)}px`);
      cardsEl.setAttribute('data-fit', '');
    }
  };
  const settleRailEnd = (rail: HTMLElement): void => {
    const extra = parseFloat(rail.style.getPropertyValue('--rail-end')) || 0;
    if (railEndKeys.get(rail) === `${rail.clientWidth}|${rail.scrollWidth - extra}`) return;
    if (rail === cardsEl) fitCards();
    const natural = rail.scrollWidth - extra;
    railEndKeys.set(rail, `${rail.clientWidth}|${natural}`);
    const line = rail.getBoundingClientRect().left + rail.clientLeft - rail.scrollLeft +
      (parseFloat(getComputedStyle(rail).scrollPaddingLeft) || 0);
    const stops: number[] = [];
    for (const item of rail.children) {
      const box = item.getBoundingClientRect();
      if (box.width > 0) stops.push(box.left - line);
    }
    const pad = horizontalRailEndPad(natural - rail.clientWidth, stops);
    if (pad !== extra) rail.style.setProperty('--rail-end', pad ? `${pad}px` : '');
  };
  // A rail moved by script (a wheel's vertical pan, a flick's coast) runs free of its snap stops, which would pull each
  // small step back, and settles on the nearest stop once it rests.
  const railRest = new WeakMap<HTMLElement, number>();
  const freeRail = (rail: HTMLElement): void => {
    rail.classList.add('free');
    clearTimeout(railRest.get(rail));
    railRest.set(rail, window.setTimeout(() => rail.classList.remove('free'), 160));
  };
  // Show an edge affordance only while cards actually remain beyond it.
  // Keep unavailable buttons in layout (visibility:hidden) so the strip does
  // not jump sideways as the user reaches either end.
  const syncCarouselAffordances = () => {
    settleRailEnd(cardsEl);
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
  // the strip's own width also settles without a window resize (the bar's fonts, the battle card beside it), and the fit
  // follows it
  if (typeof ResizeObserver === 'function') new ResizeObserver(queueCarouselAffordances).observe(cardsEl);
  // a resize (a phone turned, a window dragged) re-snaps each rail to its first item; the selected tank and its flag
  // come back into view once it settles
  let resizeRevealTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeRevealTimer);
    resizeRevealTimer = window.setTimeout(() => {
      if (!api.isOpen) return;
      cardById.get(selectedId)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      chipById.get(countryFilter)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }, 160);
  });

  // Country flags use the same honest overflow contract as the vehicle strip:
  // the edge buttons appear only where hidden content really exists.
  const syncCountryRailAffordances = () => {
    settleRailEnd(chipsEl);
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
    chipsEl.scrollBy({ left: direction * distance, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };
  chipsEl.addEventListener('scroll', syncCountryRailAffordances, { passive: true });
  chipsEl.addEventListener('wheel', (event) => {
    // ctrl+wheel is a trackpad pinch: the app-wide pinch guard owns it, so the rail never scrolls on one
    if (event.ctrlKey) return;
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
    freeRail(chipsEl);
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
  // The selected battlefield on the battle card and the Deploy screen's field.
  function refreshBattlefield(): void {
    const selected = maps.find((map) => map.id === selectedMapId) || maps[0];
    if (!selected) return;
    requiredElement<HTMLElement>(root, '[data-deploy-map]').textContent = selected.name;
    // the battle card's picture: the battlefield's 512 px still (never its 4K hero), or every battlefield for Random
    const deployPic = requiredElement<HTMLElement>(root, '[data-deploy-pic]');
    deployPic.style.backgroundImage = selected.id !== 'random' && selected.thumb ? `url("${selected.thumb.replace(/"/g, '%22')}")` : '';
    deployPic.replaceChildren();
    if (selected.id === 'random') deployPic.appendChild(createRandomMapMosaic(maps));
    requiredElement<HTMLElement>(root, '[data-deploy-field-name]').textContent = selected.name;
    // the battlefield's region, its tactical map and how many there are to choose from (the direction's .bfield)
    requiredElement<HTMLElement>(root, '[data-deploy-field-tags]').innerHTML = rules(mapRegionTags(selected.id)
      .map((tag) => [regionTagIcon(tag) || 'map', t(`camoTag.${tag}`)] as const));
    requiredElement<HTMLElement>(root, '[data-deploy-field-all]').innerHTML =
      `${uiIconSVG('map', 15)}${t('garage.deploy.allMaps', { count: maps.filter((map) => map.id !== 'random').length })}`;
    const fieldMap = requiredElement<HTMLImageElement>(root, '[data-deploy-field-mm]');
    fieldMap.hidden = selected.id === 'random';
    if (!fieldMap.hidden) fieldMap.src = minimapAssetUrl(selected.id);
    const fieldThumb = requiredElement<HTMLElement>(root, '[data-deploy-field-thumb]');
    fieldThumb.style.backgroundImage = selected.thumb ? `url("${selected.thumb.replace(/"/g, '%22')}")` : '';
    fieldThumb.replaceChildren();
    if (selected.id === 'random') fieldThumb.appendChild(createRandomMapMosaic(maps));
    deployScreen?.drawObjectives();
    closeDeployField();
  }
  function initializeMapPicker(): void {
    if (!maps.length) return;
    const title = document.createElement('div');
    title.className = 'mtitle cot-sidebar-section-title';
    title.innerHTML = `${uiIconSVG('map', 13)}<span>${t('garage.battlefield.heading')}</span>`;
    title.appendChild(createInfoButton({
      label: t('garage.battlefield.about'),
      title: t('garage.battlefield.heading'),
      text: t('garage.battlefield.aboutText'),
      guide: 'maps',
      sections: [
        { icon: 'map', title: t('garage.info.soloDeploymentTitle'), text: t('garage.info.soloDeploymentText') },
        { icon: 'team', title: t('garage.info.multiplayerTitle'), text: t('garage.info.multiplayerText') },
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
      const selectMap = document.createElement('button');
      selectMap.type = 'button';
      selectMap.className = 'cot-map-select';
      selectMap.setAttribute('aria-label', m.name);
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
      selectMap.append(thumb, nm);
      card.append(selectMap);
      const regions = mapRegionTags(m.id);
      if (regions.length) {
        const tags = document.createElement('div');
        tags.className = 'cot-map-regions';
        for (const region of regions) {
          const tag = document.createElement('span');
          tag.className = 'cot-map-region';
          tag.dataset.region = region;
          tag.innerHTML = uiIconSVG(regionTagIcon(region)!, 12);
          const label = document.createElement('span');
          label.textContent = t(`camoTag.${region}`);
          tag.appendChild(label);
          tags.appendChild(tag);
        }
        thumb.appendChild(tags);
      }
      const previewMap = (trigger: HTMLElement) => {
        if (selectedMapId !== m.id) return;
        void import('./mapPreview.ts').then(({ openMapPreview }) => {
          if (selectedMapId === m.id) openMapPreview(m, trigger, () => api.setSelectedMap(m.id));
        });
      };
      if (m.id !== 'random') {
        const inspect = document.createElement('button');
        inspect.type = 'button'; inspect.className = 'cot-map-inspect';
        inspect.disabled = true;
        inspect.setAttribute('aria-label', t('garage.map.inspect', { name: m.name }));
        inspect.innerHTML = uiIconSVG('zoomIn', 18);
        inspect.addEventListener('click', (event) => {
          event.stopPropagation();
          previewMap(inspect);
        });
        card.append(inspect);
      }
      selectMap.addEventListener('click', () => {
        emit('ui:click', {});
        if (m.id !== 'random' && selectedMapId === m.id) {
          previewMap(selectMap);
          return;
        }
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
  // A scrolling paint grid stands a whole number of rows tall, so the sheet never ends on a sliced row (the gauntlet
  // 10-25); the fade on its last row says more waits below. Read when the sheet or the window changes size, and after
  // the grid is drawn, never in a scroll.
  const fitCamoRows = (): void => {
    const cg = root.querySelector<HTMLElement>('.cot-camos .cgrid.camo');
    if (cg) fitWholeRows(cg);
  };
  window.addEventListener('resize', fitCamoRows);
  window.addEventListener('resize', () => {
    const grid = root.querySelector<HTMLElement>('.cot-eqpick.open .pgrid');
    if (grid) fitWholeRows(grid);
  });
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
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => requestAnimationFrame(fitCamoRows)).observe(camosEl);
  const promoteCamoSwatches = () => {
    scheduleCamoSwatchLoad(true).catch(() => { /* next interaction retries */ });
  };
  camosEl.addEventListener('pointerenter', promoteCamoSwatches, { once: true });
  camosEl.addEventListener('focusin', promoteCamoSwatches, { once: true });
  camosEl.addEventListener('touchstart', promoteCamoSwatches, { once: true, passive: true });
  const camoCardById = new Map<string, HTMLElement>();
  const camoTagButtonById = new Map<CamoTagId, HTMLButtonElement>();
  const camoCollectionButtons = new Map<CamoCollectionId, HTMLButtonElement>();
  let activeCamoCollection: CamoCollectionId = 'default';
  let activeCamoTag: CamoTagId = 'all';
  let customCamoStudioAccess: CustomCamoStudioAccess | null = null;
  function bindCamoStripScroll(strip: HTMLElement): void {
    strip.addEventListener('wheel', (event) => {
      // Native horizontal trackpad gestures pan the strip themselves. ctrl+wheel is a trackpad pinch: the
      // app-wide pinch guard owns it (ui/pinchZoomGuard.ts), so the strip must not scroll on it.
      if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      const maxScroll = strip.scrollWidth - strip.clientWidth;
      if (maxScroll <= 1) return;
      const delta = horizontalRailWheelDelta(event.deltaX, event.deltaY, event.deltaMode, strip.clientWidth);
      const target = Math.max(0, Math.min(maxScroll, strip.scrollLeft + delta));
      if (Math.abs(target - strip.scrollLeft) < 0.5) return;
      event.preventDefault();
      strip.scrollLeft = target;
    }, { passive: false });
  }
  function initializeCamoPicker(): void {
    if (!camoOpts?.patterns?.length) return;
    const title = document.createElement('div');
    title.className = 'ctitle cot-sidebar-section-title';
    title.innerHTML = `${uiIconSVG('camouflage', 13)}<span>${t('garage.camo.heading')}</span>`;
    const titleActions = document.createElement('div');
    titleActions.className = 'cot-camo-title-actions';
    titleActions.appendChild(createInfoButton({
      label: t('garage.camo.about'),
      title: t('garage.camo.aboutTitle'),
      text: () => {
        return activeCamoCollection === 'default'
          ? t('garage.camo.defaultDescription')
          : t('garage.camo.countryDescription', { country: tNation(CAMO_TAG_NATION[activeCamoCollection] || '') });
      },
      guide: 'camo',
      vehicle: () => { const spec = specById.get(selectedId); return spec ? { id: spec.id, name: spec.name } : null; },
      sections: [
        { icon: 'brush', title: t('garage.info.localStudioTitle'), text: t('garage.info.localStudioText') },
      ],
    }));
    let customOpenButton: HTMLButtonElement | null = null;
    if (typeof camoOpts.getCustom === 'function' && typeof camoOpts.setCustom === 'function') {
      customOpenButton = document.createElement('button');
      customOpenButton.type = 'button';
      customOpenButton.className = 'cot-custom-open';
      customOpenButton.innerHTML = `${uiIconSVG('brush', 12)}<span>${t('garage.camo.create')}</span>`;
      customOpenButton.setAttribute('aria-label', t('garage.camo.createAria'));
      customOpenButton.setAttribute('aria-haspopup', 'dialog');
      customOpenButton.setAttribute('aria-expanded', 'false');
      titleActions.appendChild(customOpenButton);
    }
    title.appendChild(titleActions);
    camosEl.appendChild(title);
    const collections = document.createElement('div');
    collections.className = 'cot-camo-collections';
    bindCamoStripScroll(collections);
    collections.setAttribute('role', 'group');
    collections.setAttribute('aria-label', t('garage.camo.collections'));
    for (const id of ['default', ...CAMO_COUNTRY_TAG_IDS] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cot-camo-collection';
      button.dataset.camoCollection = id;
      const nation = id === 'default' ? null : CAMO_TAG_NATION[id];
      const label = nation ? tNation(nation) : t('garage.camo.defaultCollection');
      if (nation) button.innerHTML = flagIconHTML(nation, 22);
      else button.textContent = label;
      button.setAttribute('aria-label', label);
      button.addEventListener('click', () => {
        emit('ui:click', {});
        activeCamoCollection = id;
        activeCamoTag = 'all';
        refreshCamoTagFilters();
        const spec = specById.get(selectedId);
        if (spec) repaintTankCamoSwatches(spec);
        grid.scrollTop = 0;
      });
      collections.appendChild(button);
      camoCollectionButtons.set(id, button);
    }
    camosEl.appendChild(collections);
    const tagBar = document.createElement('div');
    tagBar.className = 'cot-camo-tags';
    bindCamoStripScroll(tagBar);
    tagBar.setAttribute('role', 'toolbar');
    tagBar.setAttribute('aria-label', t('garage.camo.filterByTag'));
    for (const tagId of CAMO_TAG_IDS) {
      // Nations are primary collections; factory/signature are organization,
      // not useful secondary filters inside those collections.
      if (CAMO_TAG_NATION[tagId] || tagId === 'factory' || tagId === 'signature') continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cot-camo-tag';
      button.dataset.camoTag = tagId;
      const tagLabel = t(`camoTag.${tagId}`) || CAMO_TAG_LABEL[tagId];
      const regionIcon = regionTagIcon(tagId);
      if (regionIcon) button.innerHTML = uiIconSVG(regionIcon, 13);
      const label = document.createElement('span');
      label.textContent = tagLabel;
      button.appendChild(label);
      button.dataset.tip = t('garage.camo.showTag', { tag: tagLabel });
      button.setAttribute('aria-label', t('garage.camo.showTag', { tag: tagLabel }));
      button.setAttribute('aria-pressed', String(tagId === activeCamoTag));
      button.addEventListener('click', () => {
        emit('ui:click', {});
        activeCamoTag = activeCamoTag === tagId && tagId !== 'all' ? 'all' : tagId;
        refreshCamoTagFilters();
        const spec = specById.get(selectedId);
        if (spec) repaintTankCamoSwatches(spec);
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
    for (const pid of ['factory', ...camoOpts.patterns.filter(id => id !== 'factory')]) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'cot-camo-card';
      card.dataset.pid = pid; // camo r8: stable hook for tools + tests
      card.innerHTML = pid === 'auto'
        ? `<div class="sw auto"><canvas></canvas></div><div class="cl"></div>`
        : `<div class="sw"><canvas></canvas></div><div class="cl"></div>`;
      requiredElement<HTMLElement>(card, '.cl').textContent =
        (camoOpts.label && camoOpts.label[pid]) || pid;
      card.dataset.tip = (camoOpts.label && camoOpts.label[pid]) || pid;
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
          delete button.dataset.tip;
        } catch (error) {
          button.dataset.loadError = 'true';
          button.dataset.tip = t('garage.camo.customStudioRetryTitle');
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
  eqpickEl.setAttribute('role', 'dialog');
  eqpickEl.setAttribute('aria-modal', 'true');
  eqpickEl.setAttribute('aria-label', t('garage.dossier.equipment.heading'));
  eqpickEl.tabIndex = -1;
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
    const fitsRight = pickerRect.right + gap + tipRect.width <= window.innerWidth - viewportPad;
    // beside the picker where there is room; a picker as wide as the window keeps the tip beside its tile, never over it
    const toLeft = fitsLeft || (!fitsRight && anchorRect.left + anchorRect.width / 2 > window.innerWidth / 2);
    let left = fitsLeft ? pickerRect.left - tipRect.width - gap
      : fitsRight ? pickerRect.right + gap
        : toLeft ? anchorRect.left - tipRect.width - gap : anchorRect.right + gap;
    let top = anchorRect.top + anchorRect.height / 2 - tipRect.height / 2;
    left = Math.max(viewportPad, Math.min(left, window.innerWidth - tipRect.width - viewportPad));
    top = Math.max(viewportPad, Math.min(top, window.innerHeight - tipRect.height - viewportPad));
    eqTooltipEl.dataset.side = toLeft ? 'left' : 'right';
    eqTooltipEl.style.left = `${Math.round(left)}px`;
    eqTooltipEl.style.top = `${Math.round(top)}px`;
  }

  function populateEquipmentTooltipMetrics(
    metrics: HTMLElement,
    preview: ReturnType<typeof equipmentHoverPreview>,
    specName: string,
  ): void {
    if (!preview.metrics.length) return;
    const metricHeading = document.createElement('span');
    metricHeading.className = 'metrics-heading';
    metricHeading.textContent = t('garage.equipment.valuesHeading', { name: specName });
    metrics.appendChild(metricHeading);
    for (const metric of preview.metrics) {
      const row = document.createElement('span');
      row.className = `metric ${metric.outcome}`;
      const icon = document.createElement('span');
      icon.className = 'metric-icon';
      icon.innerHTML = uiIconSVG(equipmentMetricIcon(metric.id), 12);
      const label = document.createElement('span');
      label.className = 'metric-label';
      label.textContent = metric.labelKey ? t(metric.labelKey) : metric.label;
      const values = document.createElement('span');
      values.className = 'metric-values';
      const active = document.createElement('b');
      active.textContent = metric.projected;
      values.appendChild(active);
      row.append(icon, label, values);
      metrics.appendChild(row);
    }
  }

  function equipmentTooltipCategory(item: EquipmentItem | null | undefined): string {
    if (!item) return t('garage.equipment.slotAction');
    return t(`garage.equipment.cat.${item.cat}`);
  }

  function equipmentTooltipState(item: EquipmentItem | null | undefined, lock: EquipmentLock | null, fittedAt: number): string {
    if (!item) return t('garage.equipment.clearSlot', { slot: eqOpenSlot + 1 });
    if (lock) return equipmentLockCopy(item.id, lock);
    if (fittedAt === eqOpenSlot) return t('garage.equipment.fittedClickRemove');
    if (fittedAt >= 0) return t('garage.equipment.fittedInClickMove', { slot: fittedAt + 1 });
    return t('garage.equipment.action.equipIn', { slot: eqOpenSlot + 1 });
  }

  function showEqTooltip(anchor: HTMLElement): void {
    if (!equipmentTooltipAllowed() || !eqpickEl.classList.contains('open') || !anchor.isConnected) return;
    const itemId = anchor.dataset.eqId || '';
    const item = itemId ? EQUIPMENT_BY_ID.get(itemId) : null;
    const lock = (anchor.dataset.eqLock || null) as EquipmentLock | null;
    const locked = lock !== null;
    const currentLoadout = curLoadout();
    const fittedAt = item ? currentLoadout.indexOf(item.id) : -1;
    const spec = selectedId ? specById.get(selectedId) : undefined;
    const category = equipmentTooltipCategory(item);
    const state = equipmentTooltipState(item, lock, fittedAt);

    const eyebrow = document.createElement('span');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = category;
    const name = document.createElement('strong');
    name.textContent = item ? equipmentLabel(item.id) : t('garage.equipment.emptySlot');
    const detail = document.createElement('span');
    detail.className = 'detail';
    detail.textContent = item ? equipmentDesc(item.id) : t('garage.equipment.removeFitted');
    const preview = spec
      ? equipmentHoverPreview(spec, currentLoadout, item?.id || null, eqOpenSlot, !locked)
      : null;
    const summary = document.createElement('span');
    summary.className = 'summary';
    summary.textContent = preview?.summary || t('garage.equipment.emptyStat');
    const metrics = document.createElement('span');
    metrics.className = 'metrics';
    metrics.setAttribute('aria-label', t('garage.equipment.projectedStatsAria'));
    if (preview) populateEquipmentTooltipMetrics(metrics, preview, spec?.name || t('garage.equipment.fallbackTank'));
    const action = document.createElement('span');
    action.className = 'action';
    action.textContent = state;
    eqTooltipEl.replaceChildren(eyebrow, name, detail, summary, metrics, action);
    eqTooltipEl.dataset.category = item?.cat || 'action';
    eqTooltipEl.setAttribute('aria-hidden', 'false');
    eqTooltipEl.classList.add('show');
    eqTooltipAnchor = anchor;
    anchor.setAttribute('aria-describedby', eqTooltipEl.id);
    positionEqTooltip(anchor);
  }

  function equipmentTooltipAllowed(): boolean {
    if (document.body.dataset.cotWidth === 'phone') return false;
    return !window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  }

  function queueEqTooltip(anchor: HTMLElement, keyboard = false): void {
    if (!equipmentTooltipAllowed()) {
      hideEqTooltip(false);
      return;
    }
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
    const projected = projectEquipmentLoadout(cur, itemId, eqOpenSlot);
    saveEquipment(selectedId, projected, spec);
    const slot = eqOpenSlot;
    closeEqPicker();
    renderStats(spec); // slots + modified stat bars
    loadoutEl.querySelector<HTMLElement>(`.eqslot[data-slot="${slot}"]`)?.focus({ preventScroll: true });
  }

  function renderEqPicker() {
    if (!selectedId || eqOpenSlot < 0) return;
    hideEqTooltip(false);
    const spec = specById.get(selectedId);
    const cur = curLoadout();
    const chips = equipmentCategoryButtons(eqCat);
    const tiles = equipmentPickerTiles(spec, cur, eqOpenSlot, eqCat);
    eqpickEl.innerHTML =
      `<div class="ph"><span class="t">${t('garage.equipment.tag.slot', { slot: eqOpenSlot + 1 })}</span>` +
      `<button type="button" class="cot-c-btn cot-c-btn--icon cot-c-btn--36 cot-c-btn--ghost x" aria-label="${t('garage.equipment.headingClose')}">` +
      `${uiIconSVG('close', 18)}</button></div>` +
      `<div class="chips">${chips}</div>` +
      `<div class="pgrid">${tiles}</div>`;
    // a picker that scrolls ends on a whole row of tiles, never a sliced one
    requestAnimationFrame(() => { const grid = eqpickEl.querySelector<HTMLElement>('.pgrid'); if (grid) fitWholeRows(grid); });
    // slot highlight on the card
    for (const el of loadoutEl.querySelectorAll<HTMLElement>('.eqslot')) {
      el.classList.toggle('open', Number(el.dataset.slot) === eqOpenSlot);
    }
  }

  function openEqPicker(slot: number): void {
    if (vehicleLocked) return;
    eqOpenSlot = slot;
    eqpickEl.classList.add('open');
    root.classList.add('picker-open');
    renderEqPicker();
    eqpickEl.querySelector<HTMLButtonElement>('.ph .x')?.focus({ preventScroll: true });
    document.addEventListener('keydown', eqKeydown);
    document.addEventListener('mousedown', eqOutside, true);
  }
  function closeEqPicker() {
    if (eqOpenSlot < 0) return;
    const slot = eqOpenSlot;
    hideEqTooltip(false);
    eqOpenSlot = -1;
    eqpickEl.classList.remove('open');
    root.classList.remove('picker-open');
    for (const el of loadoutEl.querySelectorAll<HTMLElement>('.eqslot')) el.classList.remove('open');
    document.removeEventListener('keydown', eqKeydown);
    document.removeEventListener('mousedown', eqOutside, true);
    loadoutEl.querySelector<HTMLElement>(`.eqslot[data-slot="${slot}"]`)?.focus({ preventScroll: true });
  }
  function eqKeydown(e: KeyboardEvent): void {
    containModalTab(e, eqpickEl, eqpickEl);
    if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); closeEqPicker(); }
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

  statsEl.addEventListener('click', (e) => {
    const target = eventElement(e);
    const equipmentTrigger = target?.closest<HTMLButtonElement>('.cot-compact-equipment-trigger, .cot-overview-more');
    if (equipmentTrigger) {
      emit('ui:click', {});
      const closing = openGaragePanel() === 'equipment';
      setGaragePanel(closing ? '' : 'equipment', { restoreFocus: closing });
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
    if (target?.closest('[data-test-drive]')) {
      startTestDrive(selectedId);
      return;
    }
    const galleryLink = target?.closest<HTMLElement>('[data-gallery-layer]');
    if (galleryLink) openSelectedInGallery(galleryLink.dataset.galleryLayer || 'appearance');
  });
  // slot boxes are re-created by every renderStats — delegate their clicks
  loadoutEl.addEventListener('click', (e) => {
    const slot = eventElement(e)?.closest<HTMLElement>('.eqslot');
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
      if (!camoInCollection(pid, activeCamoCollection)) continue;
      for (const tagId of camoPatternTags(pid, spec.nation)) available.add(tagId);
    }
    for (const [id, button] of camoCollectionButtons) {
      button.setAttribute('aria-pressed', String(id === activeCamoCollection));
    }
    if (!available.has(activeCamoTag)) activeCamoTag = 'all';
    for (const [tagId, button] of camoTagButtonById) {
      button.hidden = tagId !== 'all' && !available.has(tagId);
      button.setAttribute('aria-pressed', String(tagId === activeCamoTag));
    }
    for (const [pid, card] of camoCardById) {
      const tags = camoPatternTags(pid, spec.nation);
      card.hidden = !camoInCollection(pid, activeCamoCollection) || !camoMatchesTag(pid, spec.nation, activeCamoTag);
      card.dataset.tags = tags.join(' ');
      const originalLabel = camoOpts.label?.[pid] || pid;
      const genericKey = `garage.camo.generic.${pid}`;
      const genericLabel = t(genericKey);
      const label = genericLabel !== genericKey ? genericLabel : originalLabel;
      requiredElement<HTMLElement>(card, '.cl').textContent = label;
      card.setAttribute('aria-label', label);
      // the complete pattern name, when the single line truncates or the grid shows swatches alone
      card.dataset.tip = label;
    }
    requestAnimationFrame(syncScrollFades);
    requestAnimationFrame(fitCamoRows);
  }

  function syncCamoCardSelection(selectedPatternId: string): void {
    for (const [patternId, card] of camoCardById) {
      const selected = patternId === selectedPatternId;
      card.classList.toggle('sel', selected);
      card.setAttribute('aria-pressed', String(selected));
      // The grid scrolls, so restoring a persisted selection must keep its
      // active card visible without disturbing a deliberately filtered list.
      if (selected && !card.hidden && openGaragePanel() === 'appearance') card.scrollIntoView?.({ block: 'nearest' });
    }
  }

  function repaintTankCamoSwatches(spec: GarageTankSpec): void {
    for (const [patternId, card] of camoCardById) {
      if (card.hidden || card.dataset.swatchSpec === spec.id) continue;
      const canvas = card.querySelector<HTMLCanvasElement>('.sw canvas');
      if (!canvas) continue;
      if (patternId === 'auto') paintAutoCamoSwatch(canvas, spec);
      else paintCamoSwatch(canvas, spec, patternId);
      card.dataset.swatchSpec = spec.id;
    }
  }

  const camoPatternLabel = (patternId: string): string => {
    const genericKey = `garage.camo.generic.${patternId}`;
    const genericLabel = t(genericKey);
    return genericLabel !== genericKey ? genericLabel : camoOpts?.label?.[patternId] || patternId || t('camoPattern.factory');
  };
  const paintBandSwatch = (canvas: HTMLCanvasElement, spec: GarageTankSpec, patternId: string): void => {
    if (patternId === 'auto') { paintAutoCamoSwatch(canvas, spec); return; }
    paintCamoSwatch(canvas, spec, patternId === CUSTOM_CAMO_ID && camoOpts?.getCustom
      ? customCamoPatternId(camoOpts.getCustom(spec.id)) : patternId);
  };
  // The band's paint (the 245 redesign): what the tank wears, named, then three more to try in one press and every paint.
  function refreshBandPaint(spec: GarageTankSpec, selectedPatternId: string): void {
    if (!camoOpts) { paintEl.hidden = true; return; }
    const patterns = camoOpts.patterns;
    const picks = [selectedPatternId, ...BAND_PAINT_PICKS.filter((id) => id !== selectedPatternId && patterns.includes(id))].slice(0, 4);
    const allLabel = t('garage.tools.appearanceHint');
    paintEl.innerHTML = picks.map((patternId, index) => {
      const label = escapeHtmlAttribute(camoPatternLabel(patternId));
      return `<button type="button" class="cot-lt-swatch${index ? '' : ' is-on'}" data-lt-paint="${escapeHtmlAttribute(patternId)}" ` +
        `aria-pressed="${index === 0}" aria-label="${label}"><canvas width="${index ? 48 : 96}" height="48"></canvas>` +
        (index ? '' : `<span class="nm">${label}</span>`) + `</button>`;
    }).join('') +
      `<button type="button" class="cot-c-btn cot-c-btn--icon cot-lt-paint-all" data-garage-panel="appearance" aria-expanded="${openGaragePanel() === 'appearance'}" ` +
      `aria-controls="cot-garage-camos" aria-label="${escapeHtmlAttribute(allLabel)}">${uiIconSVG('camouflage', 18)}</button>`;
    paintEl.querySelectorAll<HTMLButtonElement>('[data-lt-paint]').forEach((button) => {
      const canvas = button.querySelector('canvas');
      if (canvas) paintBandSwatch(canvas, spec, button.dataset.ltPaint || selectedPatternId);
    });
  }
  paintEl.addEventListener('click', (event) => {
    const target = eventElement(event);
    if (target?.closest('[data-garage-panel]')) {
      emit('ui:click', {});
      setGaragePanel(openGaragePanel() === 'appearance' ? '' : 'appearance');
      return;
    }
    const swatch = target?.closest<HTMLButtonElement>('[data-lt-paint]');
    const patternId = swatch?.dataset.ltPaint;
    if (!patternId || !camoOpts || !selectedId || vehicleLocked) return;
    emit('ui:click', {});
    if (camoOpts.get(selectedId) === patternId) return;
    camoOpts.set(selectedId, patternId);
    refreshCamoSel();
    requeueTankThumbs(selectedId);
    paintEl.querySelector<HTMLButtonElement>('[data-lt-paint]')?.focus({ preventScroll: true });
  });

  function refreshCamoSel() {
    if (!camoOpts || !selectedId) return;
    const selectedPatternId = camoOpts.get(selectedId);
    if (swatchesFor !== selectedId) {
      activeCamoCollection = camoCollectionFor(selectedPatternId);
      activeCamoTag = 'all';
    }
    customCamoStudioAccess?.peek()?.syncSelected();
    refreshCamoTagFilters();
    syncCamoCardSelection(selectedPatternId);
    const spec = specById.get(selectedId);
    if (!spec) return;
    refreshBandPaint(spec, selectedPatternId);
    // repaint swatch tiles for THIS tank (factory palette + nation digital
    // differ per vehicle — the preview must show what the hull will wear)
    if (swatchesFor === selectedId) return;
    // The catalog lives in the every-paint drawer in every layout (the 245 redesign): it repaints when that opens, not on
    // every press (click-perf-244).
    if (openGaragePanel() !== 'appearance') return;
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
          camo: [Infinity, -Infinity], hull: [Infinity, -Infinity], turret: [Infinity, -Infinity],
          accuracy: [Infinity, -Infinity], bloom: [Infinity, -Infinity],
        };
        ranges.set(group, range);
      }
      const add = (key: StatRangeKey, value: number | null | undefined): void => {
        if (value == null || !isFinite(value)) return;
        if (value < range[key][0]) range[key][0] = value;
        if (value > range[key][1]) range[key][1] = value;
      };
      add('hull', spec.hullTraverseDegS);
      add('turret', spec.turretTraverseDegS);
      add('accuracy', spec.gun.baseAccuracy);
      add('bloom', spec.gun.bloom.move);
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
  // A flag less than half inside the track hides (critic 236: slivers of a flag or a count read as stray glyphs beside
  // the Filter toggle); a flag cut by the edge but mostly shown stays as the cue that the rail continues.
  const chipSliverObserver = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((entries) => {
      for (const entry of entries) entry.target.classList.toggle('is-sliver', entry.intersectionRatio < 0.5);
    }, { root: chipsEl, threshold: [0.5] })
    : null;
  function initializeCountryChips(): void {
    const all = document.createElement('button');
    all.type = 'button';
    all.className = 'cot-country-chip cot-country-all';
    all.dataset.country = ALL_COUNTRIES;
    all.setAttribute('aria-label', t('garage.country.allAria'));
    all.innerHTML = `<span class="lbl">${t('garage.country.all')}</span><span class="ct num">${specs.length}</span>`;
    // every nation keeps the selected tank where it is
    all.addEventListener('click', () => {
      emit('ui:click', {});
      applyCountryFilter(ALL_COUNTRIES);
      requestAnimationFrame(() => cardById.get(selectedId)?.scrollIntoView({ block: 'nearest', inline: 'center' }));
    });
    chipsEl.appendChild(all);
    chipById.set(ALL_COUNTRIES, all);
    for (const group of countryGroups) {
      const count = group.count;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'cot-country-chip';
      chip.dataset.country = group.id;
      chip.dataset.tip = t('garage.country.chipTitle', { name: group.name, count });
      chip.setAttribute('aria-label', t('garage.country.chipAria', { name: group.name }));
      // The flag names the nation (owner UI rule 3); the chip keeps its name for assistive technology and its count.
      chip.innerHTML = `${flagIconHTML(group.nation, 28, 21)}<span class="ct num">${count}</span>`;
      chip.addEventListener('click', () => {
        emit('ui:click', {});
        applyCountryFilter(group.id);
        // Return to this nation's last selected vehicle. A nation without a
        // remembered choice opens on its highest-tier, far-left card.
        const preferred = countrySelection.preferredSpec(group.id);
        // Under a roster filter, a remembered vehicle the filter hides yields to the nation's first match.
        const firstMatch = preferred && !facetVisible(preferred.id)
          ? (specsByCountry.get(group.id) || []).find((spec) => facetVisible(spec.id)) : undefined;
        if (firstMatch) api.setSelected(firstMatch.id);
        else if (preferred) api.setSelected(preferred.id);
      });
      chipsEl.appendChild(chip);
      chipById.set(group.id, chip);
      chipSliverObserver?.observe(chip);
    }
  }
  initializeCountryChips();

  // --- ROSTER FILTER (class, role, era, search) -----------------------------
  // The Filter toggle leads the flag rail in its own slot, outside the scrolling flag track. Its panel and the fleet facet tables load on the first press
  // (garageFacetPanel.ts), never on the game entry; the panel hands back a visible-card predicate that narrows
  // every national strip, re-counts the flags and keeps the strip on a nation with a match.
  let rosterFacetMatch: ((specId: string) => boolean) | null = null;
  // The inline search narrows with the Filter panel: one predicate, so every count and strip agrees with both.
  let rosterQuery = '';
  const rosterNames = new Map(allSpecs.map((spec) => [spec.id,
    `${spec.label?.displayName || ''} ${spec.label?.shortName || ''} ${spec.name} ${spec.id.replace(/_/g, ' ')}`.toLowerCase()]));
  // the favourites (shared with the Tank Gallery, favouriteTanks.ts) narrow the same predicate while their chip is on
  const favouriteTanks = readFavouriteTanks();
  let favouritesOnly = false;
  const facetVisible = (specId: string): boolean => (!rosterFacetMatch || rosterFacetMatch(specId))
    && (!rosterQuery || (rosterNames.get(specId) || '').includes(rosterQuery))
    && (!favouritesOnly || favouriteTanks.has(specId));
  const facetToggle = document.createElement('button');
  facetToggle.type = 'button';
  facetToggle.className = 'cot-facet-toggle';
  facetToggle.setAttribute('aria-haspopup', 'dialog');
  facetToggle.setAttribute('aria-expanded', 'false');
  facetToggle.setAttribute('aria-label', t('fleet.filter.toggleAria'));
  // Icon only (blind critic 2026-10-21: a text chip cost the flag rail a quarter of a phone's width); the name rides in
  // aria-label and title, and the badge counts the active filters.
  facetToggle.innerHTML = `${uiIconSVG('filter', 16)}<span class="ct num" hidden></span>`;
  countryRailEl.insertBefore(facetToggle, chipsEl);
  const rosterSearch = document.createElement('label');
  rosterSearch.className = 'cot-roster-search';
  rosterSearch.innerHTML = `${uiIconSVG('search', 16)}<input type="search" data-roster-search autocomplete="off" ` +
    `spellcheck="false" enterkeyhint="search" aria-label="${t('garage.search.aria')}" ` +
    `placeholder="${escapeHtmlAttribute(t('garage.search.short'))}">${keycap('/')}`;
  countryRailEl.insertBefore(rosterSearch, facetToggle);
  // how many of the fleet the strip shows under the nation, the filter and the search (the direction's "18 of 220")
  const rosterCount = document.createElement('span');
  rosterCount.className = 'cot-roster-count num';
  countryRailEl.append(rosterCount);
  // the favourites chip (the direction's star chip): their count; pressed, the strip shows only them. F marks the
  // selected tank, and each favourite's card carries the star.
  const favouritesChip = document.createElement('button');
  favouritesChip.type = 'button';
  favouritesChip.className = 'cot-c-chip cot-roster-fav';
  favouritesChip.setAttribute('aria-label', t('garage.roster.favouritesAria'));
  countryRailEl.insertBefore(favouritesChip, rosterCount);
  function renderFavourites(): void {
    favouritesChip.innerHTML = `${uiIconSVG('star', 15)}<span class="num">${favouriteTanks.size}</span>`;
    favouritesChip.hidden = favouriteTanks.size === 0 && !favouritesOnly;
    favouritesChip.setAttribute('aria-pressed', String(favouritesOnly));
    for (const [id, card] of cardById) card.classList.toggle('is-fav', favouriteTanks.has(id));
  }
  favouritesChip.addEventListener('click', () => {
    emit('ui:click', {});
    favouritesOnly = !favouritesOnly;
    renderFavourites();
    setRosterFacetFilter(rosterFacetMatch);
  });
  function toggleFavourite(specId: string): void {
    if (!specId) return;
    if (!favouriteTanks.delete(specId)) favouriteTanks.add(specId);
    writeFavouriteTanks(favouriteTanks);
    emit('ui:click', {});
    if (favouritesOnly && favouriteTanks.size === 0) favouritesOnly = false;
    renderFavourites();
    if (favouritesOnly) setRosterFacetFilter(rosterFacetMatch);
  }
  // an empty fleet says so and offers the way back (owner 10-25 gauntlet: a search that matches nothing left a blank strip)
  const rosterEmptyEl = requiredElement<HTMLElement>(root, '.cot-cards-empty');
  const updateRosterCount = (): void => {
    const shown = (specsByCountry.get(countryFilter) || []).filter((spec) => facetVisible(spec.id)).length;
    rosterCount.textContent = t('garage.roster.count', { shown, total: allSpecs.length });
    rosterEmptyEl.hidden = shown > 0;
    rosterEmptyEl.parentElement?.classList.toggle('is-empty', shown === 0);
  };
  rosterEmptyEl.querySelector('[data-roster-clear]')?.addEventListener('click', () => {
    emit('ui:click', {});
    rosterSearchInput.value = '';
    rosterQuery = '';
    favouritesOnly = false;
    renderFavourites();
    setRosterFacetFilter(rosterFacetMatch);
    void facetPanel?.then((panel) => panel.clear(), () => {});
  });
  const rosterSearchInput = requiredElement<HTMLInputElement>(rosterSearch, 'input');
  rosterSearchInput.addEventListener('input', () => {
    rosterQuery = rosterSearchInput.value.trim().toLowerCase();
    setRosterFacetFilter(rosterFacetMatch);
  });
  rosterSearchInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    if (rosterSearchInput.value) { rosterSearchInput.value = ''; rosterQuery = ''; setRosterFacetFilter(rosterFacetMatch); }
    else rosterSearchInput.blur();
  });
  function setRosterFacetFilter(match: ((specId: string) => boolean) | null): void {
    rosterFacetMatch = match;
    for (const group of [{ id: ALL_COUNTRIES }, ...countryGroups]) {
      const pool = specsByCountry.get(group.id) || [];
      const shown = pool.filter((spec) => facetVisible(spec.id)).length;
      const chip = chipById.get(group.id);
      const countEl = chip?.querySelector<HTMLElement>('.ct');
      if (countEl) countEl.textContent = String(shown);
      chip?.classList.toggle('is-facet-empty', shown === 0);
    }
    const hasMatch = (countryId: string) => (specsByCountry.get(countryId) || []).some((spec) => facetVisible(spec.id));
    applyCountryFilter(facetFilteredCountry(countryFilter, countryGroups.map((group) => group.id), hasMatch)
      || countryFilter);
    updateRosterCount();
    // The stage never shows a vehicle the filter hides: once the filter settles (typing stays cheap), the strip's first
    // match takes the pedestal.
    if (facetSelectTimer !== null) clearTimeout(facetSelectTimer);
    facetSelectTimer = setTimeout(() => {
      facetSelectTimer = null;
      if (facetVisible(selectedId) || vehicleLocked) return;
      const first = (specsByCountry.get(countryFilter) || []).find((spec) => facetVisible(spec.id));
      if (first) api.setSelected(first.id);
    }, 320);
  }
  let facetSelectTimer: ReturnType<typeof setTimeout> | null = null;
  let facetPanel: Promise<GarageFacetPanel> | null = null;
  facetToggle.addEventListener('click', () => {
    emit('ui:click', {});
    // (the panel's strings load beside it: it mounts once they are resident, so it never shows a raw key)
    facetPanel ??= Promise.all([import('./garageFacetPanel.ts'), import('./garageFacetPanel.css'),
      import('./fleetStrings.ts').then((strings) => strings.ensureFleetStrings())])
      .then(([{ mountGarageFacetPanel }]) => mountGarageFacetPanel({
        anchor: countryRailEl,
        toggle: facetToggle,
        specs,
        setFilter: setRosterFacetFilter,
        click: () => emit('ui:click', {}),
        onOpenChange: (open) => root.classList.toggle('facets-open', open),
      }));
    facetPanel.then((panel) => panel.toggle(), () => { facetPanel = null; });
  });
  // --- END roster filter ------------------------------------------------------

  function applyCountryFilter(countryId: string): void {
    const previousCountry = renderedCountryFilter;
    countryFilter = countryId;
    updateRosterCount();
    if (previousCountry !== countryId) chipById.get(previousCountry || '')?.classList.remove('sel');
    chipById.get(countryId)?.classList.add('sel');
    // Programmatic tank selection can cross national groups. Keep the active
    // flag fully visible rather than leaving its highlight under an edge fade.
    const activeChip = chipById.get(countryId);
    requestAnimationFrame(() => {
      if (api.isOpen && activeChip) activeChip.scrollIntoView({
        block: 'nearest', inline: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
      syncCountryRailAffordances();
    });
    if (previousCountry && previousCountry !== countryId) {
      for (const card of cardsByCountry.get(previousCountry) || []) card.style.display = 'none';
    }
    for (const card of cardsByCountry.get(countryId) || []) {
      card.style.display = facetVisible(card.dataset.specId || '') ? '' : 'none';
    }
    renderedCountryFilter = countryId;
    // One compositor animation replaces a Web Animation per vehicle. The old
    // stagger created a burst of animation objects and style flushes on every
    // nation switch, precisely while portraits were also decoding.
    if (previousCountry && previousCountry !== countryId && api.isOpen &&
        cardsEl.animate && !prefersReducedMotion()) {
      cardsEl.animate([{ opacity: 0.76 }, { opacity: 1 }],
        { duration: 140, easing: 'ease-out' });
    }
    // the strip returns to its start in the frame's callback, ahead of the selection's reveal (queued after it): a
    // scroll write here laid the strip out inside the press (click-perf-248)
    requestAnimationFrame(() => { cardsEl.scrollLeft = 0; });
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
  // the strip listens once for every card (perf 249: 221 cards carried five listeners each); a drag's trailing click
  // stops in the strip's capture phase before it reaches here
  const cardFrom = (target: EventTarget | null): HTMLElement | null =>
    target instanceof Element ? target.closest<HTMLElement>('.cot-card[data-spec-id]') : null;
  const crossesCard = (event: PointerEvent): HTMLElement | null => {
    const card = cardFrom(event.target);
    return card && !(event.relatedTarget instanceof Node && card.contains(event.relatedTarget)) ? card : null;
  };
  cardsEl.addEventListener('pointerover', (event) => {
    const card = crossesCard(event);
    if (card) signalTankIntent(card.dataset.specId || '');
  }, { passive: true });
  cardsEl.addEventListener('pointerout', (event) => {
    const card = crossesCard(event);
    if (card) clearTankIntent(card.dataset.specId || '');
  }, { passive: true });
  cardsEl.addEventListener('focusin', (event) => {
    const card = cardFrom(event.target);
    if (card) signalTankIntent(card.dataset.specId || '', true);
  });
  for (const type of ['touchstart', 'pointerdown'] as const) {
    cardsEl.addEventListener(type, (event) => {
      const card = cardFrom(event.target);
      if (card) signalTankIntent(card.dataset.specId || '', true);
    }, { passive: true });
  }
  cardsEl.addEventListener('click', (event) => {
    const card = cardFrom(event.target);
    if (!card?.dataset.specId) return;
    emit('ui:click', {});
    api.setSelected(card.dataset.specId);
  });
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
      const tier = tierNumeral(spec.id) || '';
      const nationName = t(`nation.${spec.nation}`);
      card.setAttribute('aria-label', `${tier
        ? t('garage.card.aria', { tier, name: displayName, nation: nationName })
        : t('garage.card.ariaUntiered', { name: displayName, nation: nationName })}${developmentOnly ? t('garage.card.developmentVehicle') : ''}`);
      // Tank hero card (owner, 2026-10-17): the vehicle's 3/4 hero render over its waving national flag,
      // added by the lazy heroCard.ts from offline layers; the box, the tier chip and the untruncated
      // name are here. No era or nation text: the cloth flag is the nation.
      card.innerHTML =
        (tier ? `<span class="hc-tier" aria-hidden="true">${tierChipHTML(tier)}</span>` : '') +
        (developmentOnly ? `<span class="dev-tag">${spec.roster?.tag || t('garage.card.devTag')}</span>` : '') +
        `<div class="nm"><span class="nmt"></span></div><span class="cot-fav" aria-hidden="true">${uiIconSVG('star', 14)}</span>`;
      requiredElement<HTMLElement>(card, '.nmt').textContent = shortName;
      cardsEl.appendChild(card);
      cardById.set(spec.id, card);
      const countryCards = cardsByCountry.get(cardCountry) || [];
      countryCards.push(card);
      cardsByCountry.set(cardCountry, countryCards);
      const allCards = cardsByCountry.get(ALL_COUNTRIES) || [];
      allCards.push(card);
      cardsByCountry.set(ALL_COUNTRIES, allCards);
    }
  }
  initializeTankCards();
  renderFavourites();
  applyCountryFilter(countryFilter);
  // Hero layers arrive with the lazy heroCard chunk and its manifest. A vehicle without a hero row (or
  // every vehicle, when the chunk or the manifest is unavailable) keeps the packaged portrait and a
  // flag chip: no per-card WebGL either way.
  let heroCards: typeof import('./heroCard.ts') | null = null;
  const legacyPortraits = (ids: readonly string[]): void => {
    if (!ids.length) return;
    for (const id of ids) {
      const card = cardById.get(id);
      const spec = specById.get(id);
      if (!card || !spec || card.querySelector('.ti')) continue;
      card.insertAdjacentHTML('afterbegin',
        `<span class="flag">${flagIconHTML(spec.nation, 20)}</span>` +
        `<img class="ti" data-cot-thumb="${spec.id}" alt="" width="256" height="256" loading="lazy" decoding="async" fetchpriority="low">`);
    }
    ensureTankThumbs(allSpecs, { canWork: () => api.isOpen });
  };
  // The card module and its stylesheet load together at this lazy boundary (no static CSS import in a graph).
  Promise.all([import('./heroCard.ts'), import('./heroCard.css')])
    .then(([module]) => {
      heroCards = module;
      return module.mountRosterHeroCards(cardsEl, cardById, selectedId, (id) => legacyPortraits([id]));
    })
    .then(legacyPortraits, () => legacyPortraits([...cardById.keys()]));

  const GARAGE_INFO = Object.freeze({
    Performance: t('garage.info.Performance'),
    'Special system': t('garage.info.SpecialSystem'),
    Ammunition: t('garage.info.Ammunition'),
    Protection: t('garage.info.Protection'),
    Armament: t('garage.info.Armament'),
    Modules: t('garage.info.Modules'),
    Crew: t('garage.info.Crew'),
    Equipment: t('garage.info.Equipment'),
  });
  type GarageInfoLabel = keyof typeof GARAGE_INFO;
  interface StatBarOptions {
    readonly mod?: boolean;
    readonly stock?: string;
    readonly title?: string;
    readonly icon?: string;
  }
  interface DisposableInfoTrigger extends HTMLElement {
    disposeInfo?: () => void;
  }

  function statSectionTitle(icon: string, label: string, meta: string, infoId: GarageInfoLabel): string {
    return `<div class="cot-stat-title cot-sidebar-section-title" data-stat-info="${infoId}">${uiIconSVG(icon, 13)}` +
      `<span>${label}</span>${meta ? `<small>${meta}</small>` : ''}</div>`;
  }

  function statBar(
    label: string,
    valueText: string,
    frac: number,
    opts: StatBarOptions = {},
  ): string {
    const pct = Math.max(2, Math.min(100, frac * 100)).toFixed(1);
    // Show the equipped result; stock values remain available in the tooltip.
    const value = opts.mod ? `<span class="eqmod">${valueText}</span>` : valueText;
    const title = opts && opts.title ? ` data-tip="${opts.title}"` : '';
    const icon = opts?.icon || 'speed';
    // The fixed 20-cell scale (brand-ui SPEC 6.2): the raw value above, the peer-normalised rating as lit cells.
    return `<div class="srow"${title}><span class="sicon">${uiIconSVG(icon, 16)}</span>` +
      `<div class="lr"><span>${label}</span>` +
      `<b class="num">${value}</b></div>${scale20(Math.round(Number(pct) / 5))}</div>`;
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
      specById.get(selectedId || '')?.name || t('garage.dossier.selectedVehicleFallback');
    image.alt = `${name} ${tab.dataset.technicalAlt || t('garage.dossier.technicalSchematicAlt')}`;
    caption.textContent = tab.dataset.technicalCaption || '';
    galleryLink.dataset.galleryLayer = tab.dataset.technicalLayer || 'appearance';
    expandButton.dataset.technicalExpand = tab.dataset.technicalView || 'armor';
    expandButton.setAttribute('aria-label', t('garage.dossier.expand.aria', { name, view: tab.textContent || t('garage.dossier.technicalFallback') }));
  }

  let statsFor: string | null = null; // last spec rendered — gates the swap micro-fade

  function animateStatsSwap(vehicleChanged: boolean): void {
    const shouldAnimate = vehicleChanged
      && statsFor !== null
      && typeof statsEl.animate === 'function'
      && !prefersReducedMotion();
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
      const inventory = t('garage.dossier.shell.carried', { n: shellAmmunitionCapacity(shell) });
      const detail = [inventory, reload].filter(Boolean).join(' &middot; ');
      return `<div class="shellrow" style="--shell-color:${color}">` +
        `<span class="shellkind">${shellIconSVG(shell.type, 24)}<span class="ty">${shell.type}</span></span>` +
        `<span class="nm">${shell.name}<small>${detail}</small></span>` +
        `<span class="shellmetric"><b class="num">${penetration}</b>mm</span>` +
        `<span class="shellmetric"><b class="num">${shell.dmg}</b>hp</span></div>`;
    }).join('');
  }

  function equipmentSlots(equipmentIds: readonly string[]): string {
    const slots: string[] = [];
    for (let index = 0; index < EQUIP_SLOTS; index++) {
      const item = equipmentIds[index] ? EQUIPMENT_BY_ID.get(equipmentIds[index]) : null;
      const slotLabel = item
        ? t('garage.equipment.slot.filledAria', { slot: index + 1, name: equipmentLabel(item.id), desc: equipmentDesc(item.id) })
        : t('garage.equipment.slot.emptyAria', { slot: index + 1 });
      const tooltip = item ? slotLabel : t('garage.dossier.equipment.emptyTip');
      slots.push(item
        ? `<button type="button" class="eqslot" data-slot="${index}" ` +
          `aria-label="${escapeHtmlAttribute(slotLabel)}" data-tip="${escapeHtmlAttribute(slotLabel)}">` +
          `${equipIconSVG(item.id, 26)}<span class="sl">${t(`equipment.${item.id}.short`) || item.short}</span></button>`
        : `<button type="button" class="eqslot empty" data-slot="${index}" ` +
          `aria-label="${escapeHtmlAttribute(slotLabel)}" data-tip="${escapeHtmlAttribute(tooltip)}">` +
          `<span class="plus" aria-hidden="true">+</span><span class="sl">${t('garage.equipment.empty.name')}</span></button>`);
    }
    return slots.join('');
  }

  /**
   * The selected vehicle's actions (owner 10-25: "be able to see the actions u can do with tank"): the battle's
   * vehicle-action table read for it (vehicleActionsFor), each with its glyph, name and key in the table's order, its
   * use in the hover tip. The chips wrap, never truncate.
   */
  function actionsRow(spec: GarageTankSpec): string {
    const keyFor = (binding: VehicleActionBinding): string | null | undefined => {
      try { return opts.actionKeyFor?.(binding); } catch (_) { return null; } // the input layer boots after the Garage
    };
    const actions = vehicleActionsFor(spec, {}, keyFor);
    if (!actions.length) return '';
    return `<div class="cot-actions" role="list" aria-label="${t('garage.actions.heading')}">` + actions.map((action) =>
      `<span class="cot-c-chip cot-action" role="listitem" data-tip="${escapeHtmlAttribute(action.help)}">` +
      `${uiIconSVG(action.glyph, 15)}<span>${action.label}</span><kbd class="cot-c-kbd">${action.key}</kbd></span>`).join('') +
      `</div>`;
  }

  /**
   * A clip- or salvo-fed gun's magazine (owner 10-24: "show the clips somewhere properly"): the rounds a clip holds and
   * the interval between them, beside the reload row that already carries the whole clip's reload. Timed as a battle
   * times them (damage.ts): an autoloader's interval runs at the gun's own pace; a salvo's takes the loadout and the
   * battle card's mode (its ruleset's reload scale).
   */
  function magazineFigures(gun: FleetGunSpec, loadoutReload: number): string {
    const { autoloader, launcherSalvo: salvo } = gun;
    if (!autoloader && !salvo) return '';
    const rounds = autoloader ? autoloader.magazineSize : salvo!.rounds;
    const between = autoloader ? autoloader.intraClipS : salvo!.intervalS * loadoutReload *
      rulesetReloadMultiplier(matchRulesetFor(battleGameMode, null, readTeamArrangement(battleGameMode)));
    const cell = (value: string, unit: string, label: string): string =>
      `<div class="cot-mag-cell"><span>${label}</span><b class="num">${value}${unit ? `<small>${unit}</small>` : ''}</b></div>`;
    return `<div class="cot-mag" role="group" aria-label="${t('garage.mag.heading')}">` +
      cell(String(rounds), '', t(autoloader ? 'garage.mag.perClip' : 'garage.mag.perSalvo')) +
      cell(between.toFixed(between < 1 ? 2 : 1), 's', t('garage.mag.between')) + `</div>`;
  }

  const ERA_GLYPH: Readonly<Record<string, string>> = Object.freeze({
    'next-generation': 'eraNextGeneration', modern: 'eraModern', 'cold-war': 'eraColdWar', ww2: 'eraWorldWarII', interwar: 'eraInterwar',
  });
  const lowerThird = requiredElement<HTMLElement>(root, '.cot-lower-third');
  // the stage's numbered hotspots (the direction's 05-garage page): the selected tank's gun, turret, powerpack and
  // running gear, each with its real values, a dot on its part and a plate off the tank. They wait for their act (owner
  // 10-24: "dont show all the little info boxes over tanks until we press a certain button"), and the choice lasts the
  // session. Until the first press the module never loads and no frame projects anything; the latest facts wait for it.
  const CALLOUTS_KEY = 'cot.garage.callouts';
  let calloutsShown = false;
  try { calloutsShown = sessionStorage.getItem(CALLOUTS_KEY) === '1'; } catch (_) { /* this page only */ }
  let hotspots: GarageHotspots | null = null;
  let hotspotsLoading = false;
  // where the plates may stand: the stage the tank is framed in, less the name, its identity and the band under them
  const hotspotRoom: HotspotRoom = { stage: () => api.getStageRect(false),
    avoid: () => [...lowerThird.querySelectorAll('.cot-lt-name, .cot-lt-id, .cot-lt-band > *'), root.querySelector('.cot-eqpick.open')] };
  let hotspotFacts: HotspotFacts | null = null;
  const setHotspotFacts = (facts: HotspotFacts | null): void => {
    hotspotFacts = facts;
    if (calloutsShown && hotspots) { hotspots.setFacts(facts); opts.onOverlayChange?.(); }
  };
  const loadHotspots = (): void => {
    if (hotspots || hotspotsLoading) return;
    if (window.__GAME_READY !== true) { setTimeout(loadHotspots, 300); return; }
    hotspotsLoading = true;
    // the hotspots' sheet rides with their module, off the Garage's first paint
    void Promise.all([import('./garageHotspots.ts'), import('./garageHotspots.css')]).then(([{ createGarageHotspots }]) => {
      // over the Garage's edge bands (which dim the scene), under every panel
      hotspots = createGarageHotspots(root, hotspotRoom, root.querySelector('.band-r')?.nextElementSibling ?? null);
      hotspots.setFacts(calloutsShown ? hotspotFacts : null);
      opts.onOverlayChange?.();
    }, () => { hotspotsLoading = false; });
  };
  const calloutsButton = requiredElement<HTMLButtonElement>(root, '[data-lt-callouts]');
  function setCallouts(on: boolean): void {
    calloutsShown = on;
    calloutsButton.setAttribute('aria-pressed', String(on));
    try { sessionStorage.setItem(CALLOUTS_KEY, on ? '1' : '0'); } catch (_) { /* this page only */ }
    if (!on) hotspots?.setFacts(null);
    else if (hotspots) hotspots.setFacts(hotspotFacts);
    else loadHotspots();
    opts.onOverlayChange?.();
  }
  calloutsButton.addEventListener('click', () => { emit('ui:click', {}); setCallouts(!calloutsShown); });
  if (calloutsShown) setCallouts(true);
  const lowerName = requiredElement<HTMLElement>(lowerThird, '.cot-lt-name');
  const lowerId = requiredElement<HTMLElement>(lowerThird, '.cot-lt-id');
  let lowerClassFor = '';
  /** The name once, in the display voice: a short trailing designation (3, 2A6, HC, SEPv3) in the accent. */
  function renderLowerThird(spec: GarageTankSpec, crew: number): void {
    const name = spec.label?.displayName || spec.name;
    const at = name.lastIndexOf(' ');
    const tail = at > 0 ? name.slice(at + 1) : '';
    lowerName.textContent = tail && tail.length <= 5 ? name.slice(0, at + 1) : name;
    if (tail && tail.length <= 5) {
      const accent = document.createElement('span');
      accent.className = 'acc';
      accent.textContent = tail;
      lowerName.append(accent);
    }
    lowerName.classList.toggle('is-long', name.length > 16);
    const tier = tierNumeral(spec.id) || '';
    lowerId.innerHTML =
      `<span class="lt-nation">${flagIconHTML(spec.nation, 32, 24)}<span>${tNation(spec.nation)}</span></span>` +
      `<span>${uiIconSVG(ERA_GLYPH[spec.era] || 'eraModern', 18)}<span>${vehicleEraLabelI18n(spec.era, t)}</span></span>` +
      (tier ? `<span class="lt-tier">${tierChipHTML(tier)}</span>` : '') +
      `<span data-tip="${escapeHtmlAttribute(t('garage.dossier.section.crew'))}">${uiIconSVG('crew', 18)}<span class="num">${crew}</span></span>` +
      `<span class="lt-class" hidden></span>`;
    // The class glyph and name ride with the facet tables, loaded beside the stage (never in the boot graph); the slot
    // closes the row, so its arrival moves nothing.
    lowerClassFor = spec.id;
    // The class names live in the Filter panel's demand-loaded catalog slice (fleetStrings.ts), so they load here too.
    void Promise.all([import('../vehicles/vehicleFacets.ts'), import('./vehicleFacetIcons.ts'),
      import('./fleetStrings.ts').then((strings) => strings.ensureFleetStrings())]).then(([facets, icons]) => {
      if (lowerClassFor !== spec.id) return;
      const value = facets.vehicleClassForId(spec.id);
      const slot = lowerId.querySelector<HTMLElement>('.lt-class');
      if (!value || !slot) return;
      slot.innerHTML = `${icons.vehicleClassGlyphSVG(value, 18)}<span>${facets.vehicleFacetLabel(facets.VEHICLE_CLASS_META[value], t, { short: true })}</span>`;
      slot.dataset.tip = facets.vehicleFacetLabel(facets.VEHICLE_CLASS_META[value], t);
      slot.hidden = false;
    }).catch(() => {});
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
    // spotting.ts), so the card IS the loadout preview. Show stock > equipped
    // inline, keeping only the arrow and improved value green.
    // §5.31b PRINT VIEWER: print cards show STOCK stats — no loadout is
    // read (or ever written) for a view-only 'print:<id>' pseudo-spec.
    const eqIds = loadEquipment(spec.id, spec);
    const eqM = computeEquipMults(eqIds);
    const eqNames = eqIds.map((id) => EQUIPMENT_BY_ID.get(id)?.name || id).join(', ');
    const autoloader = spec.gun.autoloader;
    const stockReloadS = autoloader?.fullReloadS || spec.gun.reloadS;
    const reloadS = stockReloadS * eqM.reload;
    const reloadLabel = autoloader ? t('garage.stat.magazineReload') : t('garage.stat.reload');
    const aimS = spec.gun.aimTimeS * eqM.aimTime;
    const head = headlineOf(spec, eqM.reload, eqM.turret);
    setHotspotFacts({
      gun: { lead: `${spec.gun.caliberMm} mm`, more: t('garage.hotspot.reload', { value: head.reload.toFixed(1) }) },
      turret: { lead: `${head.turret.toFixed(0)} °/s`, more: `+${spec.gunElevationDeg} / −${spec.gunDepressionDeg}°` },
      engine: { lead: `${Math.round(spec.enginePowerHp)} hp`, more: `${head.hpt.toFixed(1)} hp/t` },
      tracks: { lead: `${Math.round(spec.topSpeedKmh)} km/h`, more: `${spec.weightTons.toFixed(0)} t` },
    });
    // Small equipment bonuses should not round into a misleading 1.4 > 1.4.
    const aimPrecision = eqM.aimTime !== 1 ? 2 : 1;
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
    const movingDispersion = (coefficient: number, rate: number) => spec.gun.baseAccuracy *
      movementDispersionFactor(coefficient, 0, 0, rate, 0, 0, eqM.bloom);
    const initialTechnicalView = technicalViews[0];
    const initialTechnicalViewLabel = translateTechnicalView(initialTechnicalView).label;
    const initialTechnicalViewCaption = translateTechnicalView(initialTechnicalView).caption;
    const technicalTabs = technicalViews.map((view, index) => {
      const translated = translateTechnicalView(view);
      return `<button class="cot-technical-tab" type="button" role="tab" ` +
      `aria-selected="${index === 0 ? 'true' : 'false'}" ` +
      `aria-controls="cot-technical-schematic-panel" tabindex="${index === 0 ? '0' : '-1'}" ` +
      `data-technical-view="${view.id}" data-technical-src="${iconUrl(spec.id, view.assetView)}" ` +
      `data-technical-caption="${translated.caption}" data-technical-alt="${translated.caption.toLowerCase()}" ` +
      `data-technical-layer="${view.galleryLayer}">${translated.label}</button>`;
    }).join('');
    const dossierHeader =
      `<div class="cot-dossier-head">` +
      `<img class="stats-ti" src="${iconUrl(spec.id, 'side_silhouette')}" alt="">` +
      `<div class="cot-dossier-title"><span class="cot-tier-plate">${tierNumeral(spec.id) || '&mdash;'}</span><h3></h3></div>` +
      `<div class="sub">${flagIconHTML(spec.nation, 20)}<span>${tNation(spec.nation)} &middot; ${vehicleEraLabelI18n(spec.era, t)}</span></div>` +
      `<button class="cot-compact-equipment-trigger" type="button" data-garage-panel="equipment" ` +
      `aria-label="${t('garage.dossier.vehicleDossier')}" ` +
      `aria-expanded="${openGaragePanel() === 'equipment'}" aria-controls="cot-garage-dossier">` +
      `${uiIconSVG('performance', 20)}<span>${t('garage.dossier.vehicleDossier')}</span></button>` +
      `<button class="cot-c-btn cot-c-btn--icon cot-c-btn--ghost cot-dossier-close" type="button" aria-label="${t('garage.tools.close')}">${uiIconSVG('close', 18)}</button></div>`;
    const technicalSection =
      `<section class="cot-stat-section cot-technical-section">` +
      dossierHeader +
      `<div class="cot-technical-tabs" role="tablist" aria-label="${t('garage.dossier.tabs.aria')}">${technicalTabs}</div>` +
      `<figure class="cot-technical-figure" id="cot-technical-schematic-panel" role="tabpanel" ` +
      `aria-label="${t('garage.dossier.panel.aria')}">` +
      `<button class="cot-technical-expand" type="button" data-technical-expand="${initialTechnicalView.id}" ` +
      `aria-haspopup="dialog" aria-expanded="false" aria-controls="cot-technical-viewer-dialog" ` +
      `aria-label="${t('garage.dossier.expand.aria', { name: spec.label?.displayName || spec.name, view: initialTechnicalViewLabel })}">` +
      `<img src="${iconUrl(spec.id, initialTechnicalView.assetView)}" alt="" ` +
      `data-technical-image draggable="false" loading="lazy" decoding="async" fetchpriority="low">` +
      `<span class="cot-technical-expand-label">${uiIconSVG('zoomIn', 16)}<span>${t('garage.dossier.drawing')}</span></span></button>` +
      `<figcaption data-technical-caption-output>${initialTechnicalViewCaption}</figcaption></figure>` +
      `<button class="cot-gallery-link cot-technical-gallery" type="button" ` +
      `data-gallery-layer="${initialTechnicalView.galleryLayer}" data-technical-gallery>` +
      `${uiIconSVG('gallery', 15)}<span>${t('garage.dossier.inspectGallery')}</span>` +
      `<span class="go">&#8250;</span></button>` +
      // the proving ground (v2 progression, 2026-10-17): this vehicle on the measured range, one press from its dossier
      `<button class="cot-gallery-link cot-test-drive" type="button" data-test-drive ` +
      `aria-label="${escapeHtmlAttribute(t('garage.dossier.testDrive.aria', { name: spec.label?.displayName || spec.name }))}">` +
      `${uiIconSVG('modeProving', 15)}<span>${t('garage.dossier.testDrive')}</span>` +
      `<span class="go">&#8250;</span></button></section>`;
    const moduleRows = garageModuleRows(spec);
    const crewRows = garageCrewRows(spec);
    const moduleChips = moduleRows.map((row) =>
      `<div class="cot-module-chip" data-tip="${t('garage.module.tooltip', { name: row.label })}">` +
      `<span class="mi">${uiIconSVG(row.icon, 16)}</span><span>${row.label}</span></div>`).join('');
    const crewChips = crewRows.map((row) =>
      `<div class="cot-crew-chip"><span>${uiIconSVG(row.icon, 16)}</span><span>${row.label}</span></div>`).join('');
    // the slots live in the band under the name, in every layout; their picker opens over the stage
    loadoutEl.innerHTML = equipmentSlots(eqIds);
    if (dossierFolded()) {
      statsEl.innerHTML = overviewSection(spec, eqM, shells);
      renderLowerThird(spec, crewRows.length);
      dossierStale = true;
      queueReadoutFit(false, vehicleChanged);
      requestAnimationFrame(syncScrollFades);
      return;
    }
    dossierStale = false;
    // the overview follows the dossier head, which folded layouts keep at the top of their column
    statsEl.innerHTML =
      technicalSection.replace('<section class="cot-stat-section', '<section data-stations="protection crew" class="cot-stat-section') +
      overviewSection(spec, eqM, shells) +
      `<section class="cot-stat-section cot-performance-section cot-primary" data-stations="firepower">${statSectionTitle('gun', t('garage.station.firepower'), `${spec.gun.caliberMm} mm`, 'Performance')}` +
      magazineFigures(spec.gun, eqM.reload) +
      `<div class="cot-performance-grid">` +
      statBar(reloadLabel, `${reloadS.toFixed(1)} s`, statFrac(grp, 'reload', reloadS, true),
        { icon: 'clock', mod: eqM.reload !== 1, stock: stockReloadS.toFixed(1), title: eqTitle(`${stockReloadS.toFixed(1)} s`) }) +
      statBar(t('garage.dossier.stat.aim'), `${aimS.toFixed(aimPrecision)} s`, statFrac(grp, 'aim', aimS, true),
        { icon: 'scope', mod: eqM.aimTime !== 1, stock: spec.gun.aimTimeS.toFixed(aimPrecision), title: eqTitle(`${spec.gun.aimTimeS.toFixed(1)} s`) }) +
      statBar(t('garage.stat.accuracy'), `${spec.gun.baseAccuracy.toFixed(2)} m`,
        statFrac(grp, 'accuracy', spec.gun.baseAccuracy, true), { icon: 'scope', title: t('garage.stat.accuracyHint') }) +
      statBar(t('garage.stat.movementBloom'), `${movingDispersion(spec.gun.bloom.move, 30).toFixed(2)} m`,
        1 / (1 + movingDispersion(spec.gun.bloom.move, 30)), { icon: 'scope', mod: eqM.bloom !== 1, title: t('garage.stat.bloomHint') }) +
      statBar(t('garage.stat.hullBloom'), `${movingDispersion(spec.gun.bloom.hullRot, 20).toFixed(2)} m`,
        1 / (1 + movingDispersion(spec.gun.bloom.hullRot, 20)), { icon: 'track', mod: eqM.bloom !== 1, title: t('garage.stat.bloomHint') }) +
      (spec.armor.turretless && spec.hydropneumaticAim ? '' : statBar(t(spec.armor.turretless ? 'garage.stat.gunBloom' : 'garage.stat.turretBloom'), `${movingDispersion(spec.gun.bloom.turret, 20).toFixed(2)} m`,
        1 / (1 + movingDispersion(spec.gun.bloom.turret, 20)), { icon: 'turretRing', mod: eqM.bloom !== 1, title: t('garage.stat.bloomHint') })) +
      statBar(t('garage.dossier.stat.damage'), `${bestDmg} hp`, statFrac(grp, 'dmg', bestDmg), { icon: 'damage' }) +
      `</div></section>` +
      `<section class="cot-stat-section" data-stations="firepower">${statSectionTitle('shell', t('garage.dossier.section.ammunition'), `${shells.length} ${t('garage.dossier.ammunition.types')}`, 'Ammunition')}` +
      `<div class="shellhead"><span>${t('garage.dossier.shell.type')}</span><span>${t('garage.dossier.shell.round')}</span><span>${t('garage.dossier.shell.pen')}</span><span>${t('garage.dossier.shell.damage')}</span></div>` +
      shellRows + `</section>` +
      `<section class="cot-stat-section" data-stations="firepower">${statSectionTitle('gun', t('garage.dossier.section.armament'), `${spec.gun.caliberMm} mm`, 'Armament')}` +
      `<div class="armor-grid">` +
      `<div class="armorline">${uiIconSVG('gun', 19)}<span>${t('garage.dossier.armament.gun')}</span><b class="num">${spec.gun.caliberMm} mm</b></div>` +
      `<div class="armorline">${uiIconSVG('scope', 19)}<span>${t('garage.dossier.armament.arc')}</span><b class="num">&minus;${spec.gunDepressionDeg}&deg; / +${spec.gunElevationDeg}&deg;</b></div></div></section>` +
      `<section class="cot-stat-section cot-performance-section cot-primary" data-stations="mobility">${statSectionTitle('speed', t('garage.station.mobility'), `${spec.weightTons.toFixed(1)} t`, 'Performance')}` +
      `<div class="cot-performance-grid">` +
      statBar(t('garage.dossier.stat.speed'), `${spec.topSpeedKmh} km/h`, statFrac(grp, 'speed', spec.topSpeedKmh), { icon: 'speed' }) +
      statBar(t('garage.dossier.stat.hpt'), `${hpT.toFixed(1)} hp/t`, statFrac(grp, 'hpt', hpT), { icon: 'engine' }) +
      statBar(t('garage.equipment.metric.hullTraverse'), `${(spec.hullTraverseDegS * eqM.traverse).toFixed(1)} °/s`,
        statFrac(grp, 'hull', spec.hullTraverseDegS * eqM.traverse), { icon: 'track', mod: eqM.traverse !== 1 }) +
      (spec.armor.turretless && spec.hydropneumaticAim ? '' : statBar(t(spec.armor.turretless ? 'garage.stat.gunTraverse' : 'garage.equipment.metric.turretTraverse'), `${(spec.turretTraverseDegS * eqM.turret).toFixed(1)} °/s`,
        statFrac(grp, 'turret', spec.turretTraverseDegS * eqM.turret), { icon: 'turretRing', mod: eqM.turret !== 1 })) +
      statBar(t('garage.dossier.stat.view'), viewText, statFrac(grp, 'view', vrMove),
        { icon: 'optics', mod: vrMove > vrBase || vrStill > vrMove + 0.5, stock: `${Math.round(vrBase)}`,
          title: vrStill > vrMove + 0.5 ? `${t('garage.dossier.view.movingStationary')} &middot; stock ${vrBase} m`
            : eqTitle(`${vrBase} m`) }) +
      statBar(t('garage.dossier.stat.camo'), `${Math.round(camoStill * 100)} / ${Math.round(camoMove * 100)} %`,
        statFrac(grp, 'camo', camoStill),
        { icon: 'camouflage', mod: camoModded,
          stock: `${Math.round(baseCamoOf(spec, false) * 100)} / ${Math.round(baseCamoOf(spec, true) * 100)}`, title: t('garage.dossier.stat.moving') +
          (camoModded ? ` &middot; stock ${Math.round(baseCamoOf(spec, false) * 100)} %` : '') }) +
      `</div></section>` +
      `<section class="cot-stat-section cot-performance-section" data-stations="protection"><div class="cot-performance-grid">` +
      statBar(t('garage.dossier.stat.hp'), `${spec.hp}`, statFrac(grp, 'hp', spec.hp), { icon: 'shield' }) +
      `</div></section>` +
      `<section class="cot-stat-section cot-primary" data-stations="protection">${statSectionTitle('shield', t('garage.dossier.section.protection'), '', 'Protection')}` +
      `<div class="armor-grid">` +
      `<div class="armorline">${uiIconSVG('shield', 19)}<span>${t('garage.dossier.protection.hull')}</span><b class="num">${hullMm != null ? `${Math.round(hullMm)} mm` : '&mdash;'}</b></div>` +
      `<div class="armorline">${uiIconSVG('turretRing', 19)}<span>${t('garage.dossier.protection.turret')}</span><b class="num">${turMm != null ? `${Math.round(turMm)} mm` : '&mdash;'}</b></div></div>` +
      `<button class="cot-layer-link" type="button" data-gallery-layer="armor">${uiIconSVG('shield', 13)}${t('garage.dossier.protection.inspect')}</button></section>` +
      `<section class="cot-stat-section" data-stations="crew">${statSectionTitle('engine', t('garage.dossier.section.modules'), `${moduleRows.length} ${t('garage.dossier.modules.systems')}`, 'Modules')}` +
      `<div class="cot-module-grid">${moduleChips}</div>` +
      `<button class="cot-layer-link" type="button" data-gallery-layer="modules">${uiIconSVG('gallery', 13)}${t('garage.dossier.modules.open')}</button></section>` +
      `<section class="cot-stat-section cot-primary" data-stations="crew">${statSectionTitle('crew', t('garage.dossier.section.crew'), `${crewRows.length} ${t('garage.dossier.crew.stations')}`, 'Crew')}` +
      `<div class="cot-crew-grid">${crewChips}</div></section>`;
    renderLowerThird(spec, crewRows.length);
    const dossierName = requiredElement<HTMLElement>(statsEl, 'h3');
    dossierName.textContent = spec.label?.displayName || spec.name;
    // a long name sets a step smaller and may take a third line, so the compact phone head holds it whole (garage.css)
    dossierName.classList.toggle('is-long', dossierName.textContent.length > 18);
    const technicalImage = statsEl.querySelector<HTMLImageElement>('[data-technical-image]');
    if (technicalImage) technicalImage.alt = `${spec.label?.displayName || spec.name} ${initialTechnicalViewCaption.toLowerCase()}`;
    const dossierHead = statsEl.querySelector('.cot-dossier-head');
    dossierHead?.appendChild(createInfoButton({
      label: t('garage.dossier.dossier.about'),
      title: t('garage.dossier.dossier.title'),
      text: t('garage.dossier.dossier.text'),
      guide: 'dossier', vehicle: { id: spec.id, name: spec.label?.displayName || spec.name },
      sections: [
        { icon: 'shield', title: t('garage.dossier.dossier.authData'), text: t('garage.dossier.dossier.authDataText') },
        { icon: 'gallery', title: t('garage.dossier.dossier.techViews'), text: t('garage.dossier.dossier.techViewsText') },
      ],
    }));
    statsEl.querySelectorAll<HTMLElement>('[data-stat-info]').forEach((heading) => {
      const label = heading.dataset.statInfo;
      const text = label && label in GARAGE_INFO ? GARAGE_INFO[label as GarageInfoLabel] : '';
      if (text) heading.appendChild(createInfoButton({
        label: t('garage.dossier.aboutStat', { stat: heading.querySelector('span')?.textContent || '' }),
        title: heading.querySelector('span')?.textContent || t('garage.dossier.aboutVehicle'),
        text,
        vehicle: { id: spec.id, name: spec.label?.displayName || spec.name },
        guide: ({ Performance: 'performance', 'Special system': 'special', Ammunition: 'ammunition', Protection: 'protection', Armament: 'armament', Modules: 'modules', Crew: 'crew', Equipment: 'equipment' } as const)[label as GarageInfoLabel],
      }));
    });
    if (station === 'protection' || station === 'crew') setStation(station, { sound: false });
    else queueReadoutFit(false, vehicleChanged);
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
    if (cardById.has(specId) && countryFilter !== ALL_COUNTRIES && countryCodeOf(spec) !== countryFilter) {
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
      // It runs in the frame's own callback, after this selection's writes (the dossier below), so the reveal and the
      // paint share one layout (click-perf-244: it forced one before the rebuild).
      requestAnimationFrame(() => {
        if (selectedId === specId) card.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'auto' });
      });
    }
    queueCarouselAffordances();
    renderStats(spec);
    featuredPanel?.setVehicle(specId); // the battle gallery shows this tank's own take where there is one
    battleBtn.disabled = false;
    requiredElement<HTMLElement>(battleBtn, '.battle-word').textContent = t('garage.battle');
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
    // Arrows walk the active national fleet only, as the roster filter shows it.
    const pool = (specsByCountry.get(countryFilter) || []).filter((s) => facetVisible(s.id));
    if (!pool.length) return;
    const idx = pool.findIndex((s) => s.id === selectedId);
    const next = idx < 0 ? pool[dir > 0 ? 0 : pool.length - 1] : pool[(idx + dir + pool.length) % pool.length];
    emit('ui:click', {});
    api.setSelected(next.id);
  }

  function launchBattle(
    specId: string,
    mapId: string,
    { emitClick = true, gameMode = battleGameMode, campaignOperationId, watch = false }: {
      emitClick?: boolean;
      gameMode?: GameModeId;
      campaignOperationId?: string;
      watch?: boolean;
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
    if (onBattle) onBattle(specId, mapId, campaignOperationId ? { gameMode, campaignOperationId } : watch ? { gameMode, watch } : { gameMode }); // MAP-CONFIG WIRING
  }

  /** The proving ground with this vehicle (the dossier's button, the Gallery's link): never inside a room's lobby. */
  function startTestDrive(specId: string | null | undefined): boolean {
    if (vehicleLocked || !specId || !specById.has(specId)) return false;
    if (specId !== selectedId) {
      if (!applySelection(specId)) return false;
      onSelect?.(specId);
    }
    closeBattleMenu();
    setGaragePanel('');
    const launch = testDriveLaunch(specId);
    launchBattle(launch.specId, launch.mapId, { gameMode: launch.gameMode });
    return true;
  }

  function openMultiplayer(mode: 'private' | 'lan' = 'private'): void {
    closeBattleMenu();
    closeMobileNavigation();
    setGaragePanel('');
    emit('ui:click', {});
    opts.onPlayRequest?.({ mode, specId: selectedId, mapId: selectedMapId, gameMode: battleGameMode });
  }

  function battle(watch = false) {
    if (!selectedId) return;
    const specId = selectedId;
    const mapId = selectedMapId;
    closeBattleMenu();
    if (opts.onPlayRequest) {
      try { emit('ui:click', {}); } catch (_) { /* presentation-only */ }
      opts.onPlayRequest({
        mode: watch ? 'solo' : battleMode,
        gameMode: battleGameMode,
        specId,
        mapId,
        startSolo: () => launchBattle(specId, mapId, {
          emitClick: false,
          gameMode: battleGameMode,
          watch,
        }),
      });
      return;
    }
    launchBattle(specId, mapId, { watch });
  }

  // A campaign operation is a Frontline Assault sortie on its own map, through the same play request as Deploy.
  function deployCampaign(operationId: string, mapId: string): void {
    if (!selectedId) return;
    const specId = selectedId;
    closeBattleMenu();
    const start = () => launchBattle(specId, mapId, { emitClick: false, gameMode: 'frontline_assault', campaignOperationId: operationId });
    if (opts.onPlayRequest) {
      try { emit('ui:click', {}); } catch (_) { /* presentation-only */ }
      opts.onPlayRequest({ mode: 'solo', gameMode: 'frontline_assault', specId, mapId, startSolo: start });
      return;
    }
    start();
  }

  interface BattleChoiceMeta {
    readonly label: string;
    readonly icon: string;
  }
  // The toggle under Deploy names its mode in full, as the Deploy screen does: never a code (BUI-F8, SPEC 12.1.4).
  const battleModeMeta: Readonly<Record<BattleMode, BattleChoiceMeta>> = {
    solo: { label: t('garage.battle.soloLabel'), icon: 'modeStandard' },
    private: { label: t('garage.battle.privateLabel'), icon: 'battlePrivate' },
    lan: { label: t('garage.battle.lanLabel'), icon: 'battleLan' },
  };
  const battleRuleMeta = Object.fromEntries(Object.entries(MODE_GLYPH).map(([id, icon]) => [id, {
    label: t(`playMenu.matchMode.${id}.label`), icon,
  }])) as Partial<Record<GameModeId, BattleChoiceMeta>>;
  function openDeployField(): void {
    const pop = requiredElement<HTMLElement>(root, '[data-deploy-field-pop]');
    pop.append(mapsEl);
    pop.hidden = false;
    requiredElement<HTMLElement>(root, '[data-deploy-field]').setAttribute('aria-expanded', 'true');
    mapsEl.querySelector<HTMLElement>('.cot-map-card.sel button, .cot-map-card.sel')?.scrollIntoView({ block: 'nearest' });
  }
  function closeDeployField(): void {
    const pop = root.querySelector<HTMLElement>('[data-deploy-field-pop]');
    if (!pop || pop.hidden) return;
    pop.hidden = true;
    camosEl.before(mapsEl);
    root.querySelector<HTMLElement>('[data-deploy-field]')?.setAttribute('aria-expanded', 'false');
  }
  /** The phone's tab bar marks the screen that shows (the Garage or Deploy). */
  function markTabbar(current: 'garage' | 'deploy'): void {
    for (const tab of root.querySelectorAll<HTMLElement>('.cot-tabbar [data-tabbar]')) {
      if (tab.dataset.tabbar === current) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
    }
  }
  function closeBattleMenu({ restoreFocus = false } = {}) {
    markTabbar('garage');
    closeDeployField();
    arrangementPanel?.close();
    marsDropdowns.forEach(dropdown => dropdown.close());
    battleMenu.classList.remove('open');
    battleModeBtn.setAttribute('aria-expanded', 'false');
    if (restoreFocus) battleModeBtn.focus();
  }
  // Deploy's sheet (deploy.css) rides off the game entry: it loads once the Garage is playable and idle, or at the first
  // open, which waits for it, so the screen never paints unstyled (a failed load still opens it).
  let deployStyles: Promise<void> | null = null;
  let deployStyled = false;
  const ensureDeployStyles = (): Promise<void> => (deployStyles ??= Promise.all([import('./deploy.css'), import('./deployScreen.ts')])
    .then(([, { mountDeployScreen }]) => {
      deployScreen = mountDeployScreen({
        menu: battleMenu, options: soloOptions, mapIds: new Set(maps.map((map) => map.id)),
        modeOf(stored) {
          const mode = normalizeGameMode(stored);
          const meta = battleRuleMeta[mode];
          return meta ? { mode, label: meta.label } : null;
        },
        selectedMap: () => selectedMapId, selectedMode: () => battleGameMode,
        again(mode, mapId) {
          battleMenu.querySelector<HTMLButtonElement>(mode === 'standard' ? '.cot-deploy-cards [data-mode="solo"]' : `[data-game-mode="${mode}"]`)?.click();
          api.setSelectedMap(mapId);
          battle();
        },
        difficulty: () => difficulty,
        lastBattle: () => getRecentBattles()[0], loadEstimateS: battleLoadEstimateS, keycap,
        click: () => emit('ui:click', {}),
        // the campaign tab's plate: the operation in focus, as facts the screen sets (the next to play by default)
        ops: deployOps,
        operation(id) {
          const ladder = campaignLadder();
          const entry = ladder.find((step) => step.operation.id === id)
            ?? ladder.find((step) => step.status === 'ready') ?? ladder.find((step) => step.status !== 'locked') ?? ladder[0];
          if (!entry) return null;
          const { operation, status, stars } = entry;
          return { id: operation.id, index: operation.index, mapId: operation.mapId, status, stars, difficulty: operation.difficulty,
            difficulties: CAMPAIGN_OPERATIONS.length, clock: clockText(operation.timeLimitS), enemy: CAMPAIGN_ENEMY_NATIONS[operation.enemy][0] };
        },
        operationIds: CAMPAIGN_OPERATIONS.map((operation) => operation.id),
        flag: (nation) => flagIconHTML(nation, 24, 18), rules, minimap: minimapAssetUrl,
      });
      if (battleMenu.dataset.deployTab === 'campaign') deployScreen.brief();
      deployStyled = true;
    }));
  const preloadDeployStyles = (): void => {
    if (window.__GAME_READY !== true) { setTimeout(preloadDeployStyles, 250); return; }
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => { void ensureDeployStyles(); }, { timeout: 2000 });
    else setTimeout(() => { void ensureDeployStyles(); }, 800);
  };
  preloadDeployStyles();
  function openBattleMenu(): void {
    if (!deployStyled) {
      void ensureDeployStyles().then(openBattleMenu, () => { deployStyled = true; openBattleMenu(); });
      return;
    }
    closeMobileNavigation();
    setGaragePanel('');
    renderBattleOptions();
    renderDeployTank();
    renderDeployLower();
    for (const tab of deployTabs.querySelectorAll<HTMLElement>('[role=tab]')) {
      const on = tab.dataset.tab === 'quick';
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
    }
    showDeployTab('quick');
    const campaign = campaignSummary();
    deployCampaignCount.textContent = `${campaign.cleared} / ${campaign.total}`;
    markTabbar('deploy');
    battleMenu.classList.add('open');
    deployScreen?.drawObjectives();
    battleModeBtn.setAttribute('aria-expanded', 'true');
    const activeRule = battleMode !== 'solo' || battleGameMode === 'standard' ? null
      : battleRuleChoices.find((choice) => choice.dataset.gameMode === battleGameMode);
    const scroller = battleMenuScroll;
    scroller.scrollTop = 0;
    const selectedChoice = activeRule || battleChoices.find((choice) => choice.dataset.mode === battleMode);
    const scrollBounds = scroller.getBoundingClientRect();
    const selectedBounds = selectedChoice?.getBoundingClientRect();
    const visibleChoice = selectedBounds && selectedBounds.top >= scrollBounds.top
      && selectedBounds.bottom <= scrollBounds.bottom ? selectedChoice : null;
    (visibleChoice || requiredElement<HTMLButtonElement>(battleMenu, '[data-battle-close]'))
      .focus({ preventScroll: true });
  }
  function setBattleMode(nextMode: string | undefined): void {
    if (!nextMode || !(nextMode in battleModeMeta)) return;
    const mode = nextMode as BattleMode;
    const meta = battleModeMeta[mode];
    battleMode = mode;
    if (mode === 'solo') {
      battleGameMode = 'standard';
      try { localStorage.setItem('cot.game.mode.v1', 'standard'); } catch (_) { /* session-only */ }
    }
    if (mode !== 'solo' && opts.onPlayModeIntent) {
      try { opts.onPlayModeIntent(mode); } catch (_) { /* optional warm path */ }
    }
    requiredElement<HTMLElement>(battleModeBtn, '.sum-mode').textContent = meta.label;
    requiredElement<HTMLElement>(battleModeBtn, '.sum-icon').innerHTML = uiIconSVG(meta.icon, 16);
    requiredElement<HTMLElement>(battleBtn, '.battle-active-icon').innerHTML = uiIconSVG(meta.icon, 20);
    battleModeBtn.setAttribute('aria-label', t('garage.battle.typeAria', { label: meta.label }));
    battleBtn.setAttribute('aria-label', t('garage.battle.startRulesAria', { label: meta.label }));
    for (const choice of battleChoices) {
      choice.setAttribute('aria-pressed', String(choice.dataset.mode === mode));
    }
    for (const choice of battleRuleChoices) choice.setAttribute('aria-pressed', 'false');
    renderBattleOptions();
    opts.onGameModeSelect?.(battleGameMode);
  }
  let renderBattleOptions: () => void = () => {};
  function setBattleGameMode(nextMode: RuntimeValue): void {
    const id = normalizeGameMode(nextMode);
    const meta = battleRuleMeta[id];
    if (!meta) return;
    battleMode = 'solo';
    battleGameMode = id;
    opts.onGameModeSelect?.(id);
    try { localStorage.setItem('cot.game.mode.v1', id); } catch (_) { /* session-only */ }
    requiredElement<HTMLElement>(battleModeBtn, '.sum-mode').textContent = meta.label;
    requiredElement<HTMLElement>(battleModeBtn, '.sum-icon').innerHTML = uiIconSVG(meta.icon, 16);
    requiredElement<HTMLElement>(battleBtn, '.battle-active-icon').innerHTML = uiIconSVG(meta.icon, 20);
    battleModeBtn.setAttribute('aria-label', t('garage.battle.rulesAria', { label: meta.label }));
    battleBtn.setAttribute('aria-label', t('garage.battle.startRulesAria', { label: meta.label }));
    for (const choice of battleChoices) choice.setAttribute('aria-pressed', 'false');
    for (const choice of battleRuleChoices) {
      choice.setAttribute('aria-pressed', String(choice.dataset.gameMode === id));
    }
    renderBattleOptions();
  }

  // every return to the Garage (the head's back control, the tank card's change control) closes the screen
  battleMenu.addEventListener('click', (event) => {
    if ((event.target as Element | null)?.closest('[data-battle-close]')) closeBattleMenu({ restoreFocus: true });
  });
  const leavesDeploy = (event: FocusEvent) => event.relatedTarget instanceof Node
    && !battleControl.contains(event.relatedTarget) && !battleMenu.contains(event.relatedTarget);
  battleControl.addEventListener('focusout', (event) => { if (leavesDeploy(event)) closeBattleMenu(); });
  battleMenu.addEventListener('focusout', (event) => { if (leavesDeploy(event)) closeBattleMenu(); });
  const multiplayerEntry = requiredElement<HTMLButtonElement>(root, '.cot-multiplayer-entry');
  multiplayerEntry.addEventListener('click', () => openMultiplayer());
  const warmMultiplayer = () => opts.onPlayModeIntent?.('private');
  multiplayerEntry.addEventListener('pointerenter', warmMultiplayer, { passive: true });
  multiplayerEntry.addEventListener('focus', warmMultiplayer);
  battleBtn.addEventListener('click', () => battle());
  requiredElement<HTMLButtonElement>(battleMenu, '[data-battle-launch]').addEventListener('click', () => battle());
  // (click-perf-244) the warm work starts after the press has painted, in an idle slot (a timer where there is none),
  // and once however many intents arrive first: on a phone the touch that signals it is the first press on the Deploy
  // screen, and the prep and the HUD chunk it pulls ran about 0.2 s of long tasks inside it
  let battleIntentQueued = false;
  const signalBattleIntent = (event: Event) => {
    if (event.target instanceof Node && multiplayerEntry.contains(event.target)) return;
    if (!selectedId || battleIntentQueued) return;
    battleIntentQueued = true;
    const warm = (): void => {
      battleIntentQueued = false;
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
    if (typeof requestIdleCallback === 'function') requestIdleCallback(warm, { timeout: 600 });
    else setTimeout(warm, 120);
  };
  // Choosing rules is not deployment intent. Preparing an entire battlefield
  // here competed with the selected mode's Garage preview and tank shaders.
  for (const launch of [battleBtn, requiredElement<HTMLButtonElement>(battleMenu, '[data-battle-launch]')]) {
    launch.addEventListener('pointerenter', signalBattleIntent, { passive: true });
    launch.addEventListener('focusin', signalBattleIntent);
    launch.addEventListener('touchstart', signalBattleIntent, { passive: true });
  }
  roomReminder.addEventListener('click', () => emit('ui:roomOpen', {}));
  roomReady.addEventListener('click', () => {
    if (!roomStatus?.canSetReady) return;
    emit('ui:click', {});
    emit('ui:roomReady', { ready: !roomStatus.ready });
  });
  // Transfer only the optional preview code on selector intent, never the fleet.
  for (const event of ['pointerenter', 'focus', 'touchstart']) {
    battleModeBtn.addEventListener(event, () => opts.onGameModeIntent?.(), { passive: true });
  }
  battleModeBtn.addEventListener('click', () => {
    emit('ui:click', {});
    if (battleMenu.classList.contains('open')) closeBattleMenu();
    else openBattleMenu();
  });
  for (const choice of battleChoices) choice.addEventListener('click', () => {
    emit('ui:click', {});
    if (choice.dataset.mode === 'private' || choice.dataset.mode === 'lan') {
      openMultiplayer(choice.dataset.mode);
    } else setBattleMode(choice.dataset.mode);
  });
  requiredElement<HTMLButtonElement>(root, '.cot-battle-choice[data-proving]').addEventListener('click', () => {
    emit('ui:click', {});
    startTestDrive(selectedId);
  });
  for (const choice of battleRuleChoices) choice.addEventListener('click', () => {
    emit('ui:click', {});
    setBattleGameMode(choice.dataset.gameMode);
  });
  // sides (owner 2026-09-18): the battle menu's 7v7 / 14v14 / custom switch stores one sides setting for the
  // symmetric modes (game/teamArrangement.ts writeTeamArrangement, clamped by the ruleset); the menu stays open while the
  // player types, and the wave modes arrange their allied bots and pool in the play menu instead
  const sidesChoices = [...battleMenu.querySelectorAll<HTMLButtonElement>('.cot-sides-choice')];
  const sidesCustom = requiredElement<HTMLElement>(battleMenu, '[data-sides-custom]');
  const sidesField = (name: string) => requiredElement<HTMLInputElement>(sidesCustom, `input[data-sides-field="${name}"]`);
  const sidesReadout = requiredElement<HTMLElement>(sidesCustom, '[data-sides-readout]');
  let sidesCustomOpen = false;
  function renderSides(): void {
    const sides = rulesetSides(matchRulesetFor(battleGameMode, null, readTeamArrangement(battleGameMode)));
    const preset = sidesPresetOf(sides);
    const custom = sidesCustomOpen || preset === 'custom';
    for (const choice of sidesChoices) choice.setAttribute('aria-pressed', String(choice.dataset.sides === (custom ? 'custom' : preset)));
    sidesCustom.hidden = !custom;
    sidesField('allies').value = String(sides.allies);
    sidesField('enemies').value = String(sides.enemies);
    sidesReadout.textContent = t('garage.battle.sidesReadout', { allies: String(sides.allies + 1), enemies: String(sides.enemies) });
  }
  for (const choice of sidesChoices) choice.addEventListener('click', () => {
    emit('ui:click', {});
    const id = choice.dataset.sides;
    if (id === 'custom') sidesCustomOpen = true;
    else if (id === '7v7' || id === '14v14') { sidesCustomOpen = false; writeTeamArrangement(battleGameMode, { ...readTeamArrangement(battleGameMode), ...SIDES_PRESETS[id] }); }
    renderBattleOptions();
  });
  sidesCustom.addEventListener('change', () => {
    const allies = Number(sidesField('allies').value), enemies = Number(sidesField('enemies').value);
    writeTeamArrangement(battleGameMode, {
      ...readTeamArrangement(battleGameMode),
      allies: Number.isFinite(allies) ? allies : STANDARD_SIDES.allies,
      enemies: Number.isFinite(enemies) ? enemies : STANDARD_SIDES.enemies,
    });
    renderBattleOptions();
  });
  renderSides();
  // Mars settings: two selects on the mars arrangement (game/teamArrangement.ts), visible while Mars is the rule
  const marsLabel = requiredElement<HTMLElement>(battleMenu, '[data-mars-label]');
  const marsSettings = requiredElement<HTMLElement>(battleMenu, '[data-mars-settings]');
  const marsField = (name: string) => requiredElement<HTMLSelectElement>(marsSettings, `select[data-mars-field="${name}"]`);
  // The Mars selects' dropdowns load with the battle menu's first render, like the TEAMS control below (232 bundle diet:
  // the custom select left the game's boot graph); until then the native selects stand in.
  let marsDropdowns: CustomSelectController[] = [];
  let marsDropdownsLoad: Promise<void> | null = null;
  const loadMarsDropdowns = (): void => {
    marsDropdownsLoad ??= import('./customSelect.ts').then(({ createCustomSelect }) => {
      marsDropdowns = ['gravity', 'caches'].map(name => createCustomSelect(marsField(name)));
      marsDropdowns.forEach(dropdown => { if (marsSettings.hidden) dropdown.close(); dropdown.refresh(); });
    });
  };
  const soloOptions = requiredElement<HTMLElement>(battleMenu, '[data-solo-options]');
  const teamOptions = requiredElement<HTMLElement>(battleMenu, '[data-team-options]');
  const refreshBattleTimes = bindBattleTimeChoices(battleMenu, () => emit('ui:click', {}));
  const timeHint = requiredElement<HTMLElement>(battleMenu, '[data-time-hint]');
  const timeOptions = requiredElement<HTMLElement>(battleMenu, '[data-time-options]');
  const galaxySky = requiredElement<HTMLElement>(battleMenu, '[data-galaxy-sky]');
  const setupTitle = requiredElement<HTMLElement>(battleMenu, '[data-setup-title]');
  const setupDescription = requiredElement<HTMLElement>(battleMenu, '[data-setup-description]');
  const setupIcon = requiredElement<HTMLElement>(battleMenu, '[data-setup-icon]');
  const setupSelection = requiredElement<HTMLElement>(battleMenu, '[data-setup-selection]');
  const setupLaunch = requiredElement<HTMLButtonElement>(battleMenu, '[data-battle-launch]');
  const setupWatch = requiredElement<HTMLButtonElement>(battleMenu, '[data-battle-watch]');
  setupWatch.addEventListener('click', () => { if (!setupWatch.disabled) battle(true); });
  // The mode settings and the TEAMS switch load with the battle menu's first render (round 2, the critic's E3: the TEAMS
  // control grew the game's entry chunk); MONO's switch leads with the selected vehicle's flag
  let arrangementPanel: { render(mode: GameModeId): void; close(): void } | null = null;
  let arrangementPanelLoad: Promise<void> | null = null;
  const renderArrangementPanel = (): void => {
    if (arrangementPanel) { arrangementPanel.render(battleGameMode); return; }
    arrangementPanelLoad ??= import('./battleArrangementPanel.ts').then(({ createBattleArrangementPanel }) => {
      arrangementPanel = createBattleArrangementPanel(soloOptions, {
        playerCountry: () => countryOfVehicle(selectedId, specs.find((spec) => spec.id === selectedId)?.nation),
      });
      arrangementPanel.render(battleGameMode);
    });
  };
  // The Deploy screen (brand-ui S3). Every chip and rule reads the mode's ruleset (sim/matchRuleset.ts), so the screen
  // never promises a rule the battle does not keep.
  const deployRules = requiredElement<HTMLElement>(battleMenu, '[data-deploy-rules]');
  const deployTank = requiredElement<HTMLElement>(battleMenu, '[data-deploy-tank]');
  const deployOps = requiredElement<HTMLElement>(battleMenu, '[data-deploy-ops]');
  const deployLower = requiredElement<HTMLElement>(battleMenu, '[data-deploy-lower]');
  const deployCampaignCount = requiredElement<HTMLElement>(battleMenu, '[data-deploy-campaign-count]');
  const deployTabs = requiredElement<HTMLElement>(battleMenu, '.cot-deploy-tablist');
  const deployPanels = [...battleMenu.querySelectorAll<HTMLElement>('[data-deploy-panel]')];
  const clockText = (seconds: number | null): string => seconds == null ? '∞'
    : `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
  function deployFacts(mode: GameModeId) {
    const ruleset = matchRulesetFor(mode, null, readTeamArrangement(mode));
    const sides = rulesetSides(ruleset);
    // the goal the battle plays to: the arranged one, else the mode's own (as the battle and the arrangement panel read it)
    const target = ruleset.scoreTarget ?? RULESET_SCORE_TARGETS[mode] ?? null;
    return {
      teams: t('garage.deploy.sides', { allies: String(sides.allies + 1), enemies: String(sides.enemies) }),
      clock: clockText(ruleset.timeLimitS),
      respawn: ruleset.respawnS == null ? null : t('garage.deploy.seconds', { value: String(ruleset.respawnS) }),
      victory: target == null ? null : String(target),
      gravity: ruleset.gravityScale === 1 ? null : `${Math.round(ruleset.gravityScale * 100) / 100} g`,
      speed: ruleset.speedMultiplier === 1 ? null : `×${Math.round(ruleset.speedMultiplier * 100) / 100}`,
      boss: ruleset.juggernaut ? `×${ruleset.juggernaut.hpScale}` : null,
      equipment: ruleset.equipmentSlots ? String(ruleset.equipmentSlots) : t('garage.deploy.none'),
      ammo: t(`garage.deploy.ammo.${ruleset.ammo}`),
    };
  }
  type DeployFacts = ReturnType<typeof deployFacts>;
  const DEPLOY_FACT_ICON = {
    teams: 'team', clock: 'clock', respawn: 'rematch', victory: 'statVictory', equipment: 'eqToolbox', ammo: 'shell',
    gravity: 'modeMars', speed: 'speed', boss: 'shield',
  } as const;
  function renderDeployChips(): void {
    for (const row of battleMenu.querySelectorAll<HTMLElement>('[data-deploy-chips]')) {
      const facts = deployFacts(normalizeGameMode(row.dataset.deployChips));
      const shown = (['gravity', 'speed', 'boss', 'respawn', 'victory', 'teams', 'clock'] as const).filter((key) => facts[key] != null).slice(0, 2);
      row.innerHTML = shown.map((key) => `<span>${uiIconSVG(DEPLOY_FACT_ICON[key], 14)}${facts[key]}</span>`).join('');
    }
  }
  function renderDeployRules(): void {
    const facts: DeployFacts = deployFacts(battleGameMode);
    deployRules.innerHTML = (['teams', 'clock', 'respawn', 'victory', 'equipment', 'ammo'] as const).map((key) =>
      `<div class="cot-deploy-rule">${uiIconSVG(DEPLOY_FACT_ICON[key], 18)}<dt>${t(`garage.deploy.rule.${key}`)}</dt>` +
      `<dd${key === 'clock' ? ' class="num"' : ''}>${facts[key] ?? (key === 'victory' ? t('garage.deploy.elimination') : t('garage.deploy.none'))}</dd></div>`).join('');
  }
  /** A roster card's copy for another surface: its hero render over its flag, decorative and inert. */
  function heroCopy(id: string): HTMLElement | null {
    const card = cardById.get(id);
    if (!card) return null;
    const copy = card.cloneNode(true) as HTMLElement;
    copy.classList.remove('sel');
    // the roster hides the cards its nation and filters leave out; a copy shows wherever it is set
    copy.style.removeProperty('display');
    copy.removeAttribute('title');
    copy.setAttribute('aria-hidden', 'true');
    copy.inert = true;
    // the hero render shows once it has loaded (heroCard.ts marks the card); a copy taken before that keeps its own
    // watch, and outside the roster strip it carries the strip's flag feather itself
    const tank = copy.querySelector<HTMLImageElement>('img.hc-tank');
    if (tank && !copy.classList.contains('hc-loaded')) {
      if (tank.complete && tank.naturalWidth) copy.classList.add('hc-loaded');
      else tank.addEventListener('load', () => copy.classList.add('hc-loaded'), { once: true });
      tank.loading = 'eager';
    }
    const feather = cardsEl.style.getPropertyValue('--hc-flag-mask');
    if (feather) copy.style.setProperty('--hc-flag-mask', feather);
    return copy;
  }
  // the tank you deploy with (the direction's .tank): its hero card, its name over its flag, its rounds and fittings,
  // and the control that returns to the roster to change it
  function renderDeployTank(): void {
    const spec = selectedId ? specById.get(selectedId) : null;
    const copy = selectedId ? heroCopy(selectedId) : null;
    if (!copy || !spec) { deployTank.replaceChildren(); return; }
    deployTank.replaceChildren(copy);
    const shells = (spec.gun.shells || []).map((shell) =>
      `<span class="sh">${shellIconSVG(shell.type, 24)}${shell.count == null ? '' : `<span class="num">${shell.count}</span>`}</span>`).join('');
    const fittings = loadEquipment(spec.id, spec).map((id) => `<span class="eq">${equipIconSVG(id, 15)}</span>`).join('');
    deployTank.insertAdjacentHTML('beforeend', `<div class="info"><b>${flagIconHTML(spec.nation, 22, 16)}` +
      `<span>${escapeHtmlAttribute(spec.label?.displayName || spec.name)}</span></b><div class="load">${shells}${fittings}` +
      `${vehicleLocked ? '' : `<span class="ok">${uiIconSVG('check', 14)}${t('garage.deploy.ready')}</span>`}</div></div>` +
      `<button type="button" class="cot-c-btn cot-c-btn--36 cot-c-btn--icon chg" data-battle-close data-ui-sound="back" ` +
      `aria-label="${escapeHtmlAttribute(t('garage.deploy.changeTank'))}">${uiIconSVG('garage', 18)}</button>`);
  }
  // the lower band (the direction's .lower): the campaign's next operation over its battlefield, then the player's
  // recent battles, each with its tank's hero card, the result, the battlefield and the kills and damage
  function renderDeployLower(): void {
    const ladder = campaignLadder();
    const next = ladder.find((step) => step.status === 'ready') ?? ladder.find((step) => step.status !== 'locked') ?? ladder[0];
    const parts: string[] = [];
    if (next) {
      const { operation, status } = next;
      const thumb = maps.find((map) => map.id === operation.mapId)?.thumb;
      parts.push(`<article class="cot-deploy-camp">${thumb ? `<img src="${escapeHtmlAttribute(thumb)}" alt="" decoding="async">` : ''}` +
        `<div class="t"><div class="op" role="img" aria-label="${escapeHtmlAttribute(t('campaign.starsAria', { stars: ladder.filter((step) => step.status === 'cleared').length, max: ladder.length }))}">${
          ladder.map((step) => `<i class="${step.status === 'cleared' ? 'd' : step === next ? 'c' : ''}"></i>`).join('')}</div>` +
        `<b>${t(`campaign.op.${operation.id}.title`)}</b>${rules([['map', t(`map.${operation.mapId}`)]])}` +
        `<button type="button" class="cot-c-btn cot-c-btn--36" data-campaign-launch="${operation.id}" data-map-id="${operation.mapId}"` +
        `${status === 'locked' ? ' disabled' : ''}>${t(status === 'cleared' ? 'campaign.replay' : 'campaign.launch')}${uiIconSVG('chevronRight', 16)}</button></div></article>`);
    }
    deployLower.innerHTML = parts.join('');
    for (const battle of getRecentBattles()) {
      const copy = heroCopy(battle.vehicleId);
      if (!copy) continue;
      const won = battle.result === 'victory';
      const result = document.createElement('article');
      result.className = 'cot-deploy-rec';
      result.append(copy);
      result.insertAdjacentHTML('beforeend', `<div class="res"><span class="w ${won ? 'v' : battle.result === 'draw' ? 'n' : 'd'}">` +
        `${uiIconSVG(won ? 'statVictory' : 'close', 15)}${t(`garage.record.${battle.result}`)}</span>` +
        `${rules([['map', battle.mapId ? t(`map.${battle.mapId}`) : '–'], ['skull', String(battle.kills)], ['damage', String(battle.damage)]])}</div>`);
      deployLower.append(result);
    }
  }
  function renderDeployCampaign(): void {
    deployOps.innerHTML = campaignLadder().map(({ operation, status, progress, stars }) => {
      const title = t(`campaign.op.${operation.id}.title`);
      const action = status === 'locked'
        ? `<span class="cot-deploy-op-lock" data-tip="${escapeHtmlAttribute(t('campaign.lockedHint', { index: operation.index - 1 }))}">${uiIconSVG('battlePrivate', 20)}</span>`
        : `<button class="cot-deploy-op-launch" type="button" data-campaign-launch="${operation.id}" data-map-id="${operation.mapId}">${
          t(status === 'cleared' ? 'campaign.replay' : 'campaign.launch')}</button>`;
      // the operation's battlefield, as the Garage's map cards show it
      const thumb = maps.find((map) => map.id === operation.mapId)?.thumb;
      return `<article class="cot-deploy-op ${status}" role="listitem" aria-label="${escapeHtmlAttribute(title)}">` +
        `<span class="cot-deploy-op-index" aria-hidden="true">${String(operation.index).padStart(2, '0')}</span>` +
        `<span class="cot-deploy-op-map" aria-hidden="true"${thumb ? ` style="background-image:url(&quot;${escapeHtmlAttribute(thumb)}&quot;)"` : ''}></span>` +
        `<span><b class="cot-deploy-op-name">${title}</b><span class="cot-deploy-op-meta">` +
        `<span>${uiIconSVG('map', 14)}${t(`map.${operation.mapId}`)}</span><span>${uiIconSVG('clock', 14)}${clockText(operation.timeLimitS)}</span>` +
        `<span class="cot-deploy-op-stars" role="img" aria-label="${escapeHtmlAttribute(t('campaign.starsAria', { stars, max: 3 }))}">${
          [0, 1, 2].map((slot) => `<i class="${slot < stars ? 'on' : ''}">${uiIconSVG('star', 14)}</i>`).join('')}</span>` +
        `<span class="cot-deploy-op-diff" role="img" aria-label="${escapeHtmlAttribute(t('garage.deploy.difficulty', { value: operation.difficulty, max: CAMPAIGN_OPERATIONS.length }))}">${
          CAMPAIGN_OPERATIONS.map((_, slot) => `<i class="${slot < operation.difficulty ? 'on' : ''}"></i>`).join('')}</span>` +
        (progress ? `<span>${t('campaign.best', { best: progress.bestLine, total: progress.total })}</span>` : '') +
        `</span></span>${action}</article>`;
    }).join('');
  }
  function showDeployTab(id: string): void {
    battleMenu.dataset.deployTab = id;
    for (const panel of deployPanels) panel.hidden = panel.dataset.deployPanel !== id;
    if (id === 'campaign') { renderDeployCampaign(); deployScreen?.brief(); }
  }
  wireRoving(deployTabs, (id) => { emit('ui:click', {}); showDeployTab(id); });
  for (const room of battleMenu.querySelectorAll<HTMLButtonElement>('[data-deploy-room]')) {
    room.addEventListener('click', () => openMultiplayer(room.dataset.deployRoom === 'lan' ? 'lan' : 'private'));
  }
  requiredElement<HTMLButtonElement>(battleMenu, '[data-deploy-field]').addEventListener('click', () => {
    emit('ui:click', {});
    if (requiredElement<HTMLElement>(battleMenu, '[data-deploy-field-pop]').hidden) openDeployField(); else closeDeployField();
  });
  for (const host of [deployOps, deployLower, requiredElement<HTMLElement>(battleMenu, '[data-deploy-brief]')]) host.addEventListener('click', (event) => {
    const launch = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-campaign-launch]');
    if (launch?.dataset.campaignLaunch && launch.dataset.mapId) deployCampaign(launch.dataset.campaignLaunch, launch.dataset.mapId);
  });
  renderBattleOptions = () => {
    battleMenu.dataset.rule = battleGameMode;
    renderArrangementPanel();
    loadMarsDropdowns();
    renderSides();
    const solo = battleMode === 'solo';
    const shown = solo && battleGameMode === 'mars';
    const meta = (solo && battleRuleMeta[battleGameMode]) || battleModeMeta[battleMode];
    setupTitle.textContent = meta.label;
    setupSelection.textContent = meta.label;
    setupIcon.innerHTML = uiIconSVG(meta.icon, 24);
    // a mode's numbers come from its ruleset (modeCopyValues), never from the copy
    setupDescription.textContent = t(shown ? 'garage.battle.marsSetupDescription'
      : solo ? `playMenu.matchMode.${battleGameMode}.desc`
      : `garage.battle.${battleMode}SetupDescription`, solo ? modeCopyValues(battleGameMode) : undefined);
    setupLaunch.setAttribute('aria-label', battleBtn.getAttribute('aria-label') || meta.label);
    // a mode whose human seat no bot plays (the AC-130's gunship) or a room cannot be watched (WATCH_RULES)
    setupWatch.disabled = !solo || !isWatchableMode(battleGameMode);
    timeOptions.hidden = shown;
    galaxySky.hidden = !shown;
    soloOptions.hidden = !solo;
    teamOptions.hidden = isWaveMode(battleGameMode);
    refreshBattleTimes(shown);
    timeHint.textContent = t(shown ? 'garage.battle.nightGalaxy' : 'garage.battle.timeHint');
    marsLabel.hidden = !shown;
    marsSettings.hidden = !shown;
    const settings = readMarsSettings();
    marsField('gravity').value = settings.gravity;
    marsField('caches').value = settings.caches;
    marsDropdowns.forEach(dropdown => { if (!shown) dropdown.close(); dropdown.refresh(); });
    renderDeployRules();
    renderDeployChips();
    deployScreen?.render();
  };
  marsSettings.addEventListener('change', () => {
    emit('ui:click', {});
    writeMarsSettings({ gravity: marsField('gravity').value, caches: marsField('caches').value });
    renderBattleOptions();
  });
  renderBattleOptions();
  // batch 19 (2026-09-14): the Garage and the play menu share the remembered rule set — a mode picked
  // in the play menu (or last session) is what BATTLE launches instead of silently reverting to Standard
  try {
    const remembered = localStorage.getItem('cot.game.mode.v1');
    if (remembered && remembered !== 'standard' && battleRuleMeta[normalizeGameMode(remembered)]) {
      setBattleGameMode(remembered);
    }
  } catch (_) { /* session-only */ }
  root.addEventListener('pointerdown', (event) => {
    const node = eventNode(event);
    if (!battleControl.contains(node) && !battleMenu.contains(node)) closeBattleMenu();
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
        freeRail(cardsEl);
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
      // a pointer that rested before release has a stale flick — don't coast
      const flick = performance.now() - lastT < 90 && Math.abs(vel) > COAST_MIN;
      if (flick) freeRail(cardsEl);
      cardsEl.classList.remove('dragging');
      try { cardsEl.releasePointerCapture(e.pointerId); } catch (_) { /* released */ }
      if (flick) coast();
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
      // ctrl+wheel is a trackpad pinch (the app-wide pinch guard owns it), never a sideways pan
      if (e.ctrlKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      stopCoast();
      freeRail(cardsEl);
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
  const openStudio = () => {
    emit('ui:click', {});
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F8' }));
  };
  const openDocs = () => {
    emit('ui:click', {});
    window.location.href = hrefForLocale('/docs', getLocale());
  };
  const openHome = () => {
    emit('ui:click', {});
    window.location.href = hrefForLocale('/home', getLocale());
  };
  const switchLocale = () => {
    emit('ui:click', {});
    setLocale(nextLocale);
    window.location.assign(currentLocationHrefForLocale(window.location, nextLocale));
  };
  requiredElement<HTMLElement>(root, '[data-nav="studio"]').addEventListener('click', openStudio);
  requiredElement<HTMLElement>(root, '[data-nav="gallery"]').addEventListener('click', () => openSelectedInGallery());
  requiredElement<HTMLElement>(root, '[data-nav="docs"]').addEventListener('click', openDocs);
  // the phone's tab bar: the Garage, Deploy, the Gallery, the record, and the rest of the menu
  requiredElement<HTMLElement>(root, '.cot-tabbar').addEventListener('click', (event) => {
    const tab = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-tabbar]')?.dataset.tabbar;
    if (tab === 'deploy' && !battleMenu.classList.contains('open')) { emit('ui:click', {}); openBattleMenu(); }
    else if (tab === 'garage' && battleMenu.classList.contains('open')) closeBattleMenu({ restoreFocus: true });
    else if (tab === 'gallery') openSelectedInGallery();
    else if (tab === 'record') recordTrigger.click();
    else if (tab === 'more') mobileNavTrigger.click();
  });
  requiredElement<HTMLElement>(root, '[data-nav="locale"]').addEventListener('click', switchLocale);
  requiredElement<HTMLElement>(root, '[data-nav="home"]').addEventListener('click', openHome);
  requiredElement<HTMLElement>(root, '[data-nav="deploy"]').addEventListener('click', () => { emit('ui:click', {}); openBattleMenu(); });
  requiredElement<HTMLElement>(root, '[data-lt-anatomy]').addEventListener('click', () => { emit('ui:click', {}); openSelectedInGallery('armor'); });
  requiredElement<HTMLElement>(root, '[data-lt-test-drive]').addEventListener('click', () => { emit('ui:click', {}); startTestDrive(selectedId); });
  // photo mode (the direction's Photo action): loaded at its first use, off the game entry
  const photoButton = requiredElement<HTMLButtonElement>(root, '[data-lt-photo]');
  let photo: GaragePhotoControl | null = null;
  let photoMode: Promise<typeof import('./photoMode.ts')> | null = null;
  function openPhoto(): void {
    if (!photo || !api.isOpen || battleMenu.classList.contains('open')) return;
    const control = photo;
    emit('ui:click', {});
    // the photo mode's sheet loads beside its module, at the boundary (the runtime-styles rule: only main.ts imports CSS statically)
    photoMode ??= Promise.all([import('./photoMode.ts'), import('./photoMode.css')]).then(([mode]) => mode);
    void photoMode.then(({ openPhotoMode }) => openPhotoMode({
      stage: control.stage, showroom: control.showroom, still: control.still, keycap,
      fileName: () => `claude-of-tanks_${selectedId || 'garage'}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`,
      click: () => emit('ui:click', {}), onClose: () => photoButton.focus(),
    })).catch(() => { photoMode = null; });
  }
  photoButton.addEventListener('click', openPhoto);
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
      else if (destination === 'locale') switchLocale();
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
    if (eqOpenSlot >= 0) return; // The nested equipment picker owns its keyboard boundary.
    if (openGaragePanel()) {
      const drawer = openGaragePanel() === 'equipment' ? statsEl : requiredElement<HTMLElement>(root, '.cot-leftcol');
      containModalTab(e, drawer, drawer);
      if (e.code === 'Escape') {
        setGaragePanel('', { restoreFocus: true });
        e.preventDefault();
      }
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
    const typing = target?.closest('input,select,textarea,[contenteditable="true"]');
    // The Deploy screen covers the showroom: behind it only Enter (deploy) and Escape (above) act.
    const deployOpen = battleMenu.classList.contains('open');
    if (!typing && !deployOpen && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const stationKey = /^Digit([1-5])$/.exec(e.code);
      if (e.key === '/') { rosterSearchInput.focus(); e.preventDefault(); return; }
      if (stationKey && document.body.dataset.cotPanels === 'persistent') {
        setStation(GARAGE_STATIONS[Number(stationKey[1]) - 1][0]);
        e.preventDefault();
        return;
      }
      if (e.code === 'KeyB') { emit('ui:click', {}); openBattleMenu(); e.preventDefault(); return; }
      if (e.code === 'KeyV') { openSelectedInGallery(); e.preventDefault(); return; }
      if (e.code === 'KeyF') { toggleFavourite(selectedId); e.preventDefault(); return; }
      if (e.code === 'KeyP' && photo) { openPhoto(); e.preventDefault(); return; }
      if (e.code === 'KeyI' && document.body.dataset.cotPanels === 'persistent') {
        emit('ui:click', {});
        setCallouts(!calloutsShown);
        e.preventDefault();
        return;
      }
      if (e.code === 'KeyR') { recordTrigger.click(); e.preventDefault(); return; }
      if (e.code === 'F1') { openDocs(); e.preventDefault(); return; }
    }
    if (typing) return;
    // (only from the mode list or the bare screen: a dropdown or a segmented control keeps its own arrows)
    if (deployOpen && /^Arrow(Left|Right|Up|Down)$/.test(e.code) && !e.metaKey && !e.ctrlKey && !e.altKey
      && (!target || target === document.body || target === battleMenu || target.closest('.cot-deploy-panel'))) {
      deployScreen?.move(e.code, target);
      e.preventDefault();
      return;
    }
    if (deployOpen && e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
    if (e.code === 'ArrowLeft') { step(-1); e.preventDefault(); }
    else if (e.code === 'ArrowRight') { step(1); e.preventDefault(); }
    else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      // on the Deploy screen a focused mode deploys (the arrows chose it); every other control keeps its own Enter
      if (target?.closest('button,input,select,a,[role="button"]')
        && !(deployOpen && target.closest('.cot-deploy-panel .cot-battle-choice:not([data-proving])'))) return;
      battle();
      e.preventDefault();
    }
  }

  let hasPresented = false;
  const api: GarageRuntime = {
    root,
    isOpen: false,
    // the hotspots show on the docked overview, never over Deploy, a panel or a folded layout
    frameHotspots(camera, model) {
      if (!calloutsShown || !hotspots) return;
      hotspots.frame(camera, model, api.isOpen && document.body.dataset.cotPanels === 'persistent'
        && root.dataset.station === 'overview' && !battleMenu.classList.contains('open'));
    },

    /**
     * Open the garage screen.
     * @param {string} [selectedId] - initially highlighted tank id.
     */
    show(selected = selectedId) {
      // The full play menu also owns mode selection; reconcile it on return.
      try {
        const remembered = localStorage.getItem('cot.game.mode.v1');
        if (remembered && normalizeGameMode(remembered) !== battleGameMode) setBattleGameMode(remembered);
      } catch (_) { /* session-only mode choice */ }
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
      garageSwatchOpen = true;
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
      void facetPanel?.then((panel) => panel.close(), () => {});
      root.style.display = 'none';
      if (api.isOpen) window.removeEventListener('keydown', onKey);
      api.isOpen = false;
      garageSwatchOpen = false;
    },

    /** Normalize packaged tank portraits (screenshot compatibility). */
    drainThumbs() { drainTankThumbs(); heroCards?.drainHeroCards(cardsEl); },

    /** 2026-10-13: decorative Garage work (the picker's cold swatches) also holds while `covered()` is true. */
    setDecorativeWorkGate(covered: () => boolean) { garageSwatchCover = covered; },

    /** UI-free rectangle reserved for the 3D showroom hero (CSS pixels); `centred: false` is the whole free area (the
     *  callouts' room) rather than the hero's centred frame. */
    getStageRect(centred = true) {
      // photo mode (photoMode.ts) puts every panel away: the stage is the whole screen
      if (document.body.classList.contains('cot-photo-on')) return { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
      // The stage (the 245 redesign): the docked layout frames the tank between the left edge and the readout's column,
      // over the band's controls (the name may stand on the floor in front of it); a phone held upright frames it over its
      // name, and one on its side between the left edge and the column, over the fleet.
      const rr = root.getBoundingClientRect();
      const stats = statsEl.getBoundingClientRect();
      const carousel = root.querySelector('.cot-carousel')?.getBoundingClientRect();
      const band = lowerThird.querySelector('.cot-lt-band')?.getBoundingClientRect();
      const head = lowerThird.querySelector('.cot-lt-head')?.getBoundingClientRect();
      const docked = !isOverlayPanelLayout();
      const sideways = !docked && document.body.dataset.cotOrientation === 'landscape';
      const column = sideways ? lowerThird.getBoundingClientRect() : null;
      let x0 = rr.left + 18;
      let x1 = docked && stats.width ? stats.left - 14 : column && column.width ? column.left - 14 : rr.right - 18;
      // Docked, the hero stands on the screen's own centre line where the readout leaves it room (owner 10-25: "not
      // forcing the actual tank to be uncentered in screen and in top left"); where that would keep it under seven
      // tenths of the free width (a narrow window), it slides toward the column instead.
      if (docked && centred) {
        const free = x1 - x0, mid = (rr.left + rr.right) / 2;
        let half = Math.min(mid - x0, x1 - mid), cx = mid;
        if (2 * half < 0.7 * free) { half = 0.35 * free; cx = x1 - half; }
        x0 = cx - half;
        x1 = cx + half;
      }
      const y0 = rr.top + (docked ? 78 : 66);
      const floor = docked ? band : sideways ? countryRailEl.getBoundingClientRect() : head;
      const y1 = Math.min(rr.bottom, floor && floor.height ? floor.top - 10
        : carousel && carousel.height ? carousel.top - 14 : rr.bottom - 190);
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
      roomStatus = status;
      requiredElement<HTMLElement>(battleBtn, '.battle-word').textContent = t(status ? 'garage.multiplayer.room' : 'garage.battle');
      battleBtn.setAttribute('aria-label', status ? t('garage.battle.roomReminder')
        : t('garage.battle.startRulesAria', { label: (battleRuleMeta[battleGameMode] || battleModeMeta.solo).label }));
      root.classList.toggle('has-room', !!status);
      roomControls.classList.toggle('show', !!status);
      roomReady.disabled = !status?.canSetReady;
      roomReady.textContent = status?.ready ? t('playMenu.ready.notReady') : t('playMenu.ready.iAmReady');
      roomReady.setAttribute('aria-pressed', String(!!status?.ready));
      roomReady.setAttribute('aria-label', status?.ready ? t('playMenu.ready.markNotReady') : t('playMenu.ready.markReady'));
      roomReady.dataset.tip = status?.canSetReady
        ? (status.ready ? t('garage.battle.readyCancelLoadout') : t('garage.battle.readyForNextBattle'))
        : t('garage.battle.readinessWaitingOnly');
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
      const roomCode = status.roomCode || '';
      const mode = t(status.mode === 'lan' ? 'playMenu.mode.lan.name' : 'playMenu.mode.private.name');
      const readiness = t(ready
        ? 'garage.roomReminder.statusReady'
        : 'garage.roomReminder.statusNotReady');
      const identity = document.createElement('b');
      identity.textContent = `${mode}${roomCode ? ` ${roomCode}` : ''}`;
      requiredElement<HTMLElement>(roomReminder, '.rr-copy').replaceChildren(
        identity,
        document.createTextNode(` · ${readiness} · ${t('garage.roomReminder.readyCount', { count, total })}`),
      );
      roomReminder.classList.add('show');
      roomReminder.classList.toggle('ready', ready);
      roomReminder.setAttribute('aria-label', t('garage.roomReminder.aria', {
        code: roomCode,
        status: readiness,
        count,
        total,
      }));
      vehicleLocked = ready;
      root.classList.toggle('vehicle-locked', vehicleLocked);
      closeEqPicker();
    },

    isVehicleLocked() { return vehicleLocked; },

    attachPhoto(control) {
      photo = control;
      photoButton.hidden = false;
    },

    attachDifficulty(control) {
      difficulty = control;
      deployScreen?.render();
    },

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

    testDrive(specId?: string | null) {
      return startTestDrive(specId ?? selectedId);
    },

    /**
     * Highlight a battlefield in the map picker.
     * @param {string} mapId map id or 'random'
     */
    setSelectedMap(mapId: string) {
      if (!mapCardById.has(mapId)) return;
      selectedMapId = mapId;
      for (const [id, card] of mapCardById) {
        card.classList.toggle('sel', id === mapId);
        const inspect = card.querySelector<HTMLButtonElement>('.cot-map-inspect');
        if (inspect) inspect.disabled = id !== mapId;
      }
      refreshBattlefield();
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
