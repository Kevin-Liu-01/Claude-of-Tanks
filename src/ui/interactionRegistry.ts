// The interaction registry (INTERACTION-REDESIGN.md, the picker contract and part D; owner 2026-10-26: "make map
// selection much more intituitve, as well as camo, i really mean update all legacy interaction surfaces and systems").
// Copyright © 2026 Kevin B. Liu.
//
// One row per "choose one of a set" site, the way src/ui/surfaceRegistry.ts is one row per on-screen datum. A row's id is
// the picker id the site stamps (data-picker="<id>", one per surface), or will once it is built on the picker; the row
// names what the site chooses, its screen and owner module, how it is built today, the lane that owns its redesign and
// the common path it lies on. Choosing one item from a set is one kit primitive everywhere (src/ui/components/picker.ts,
// and the shared consumers built on it: src/ui/battlefieldPicker.ts); a row passes the bar's line 1 only when it is
// built on it, or when it holds two to five values of a setting, a view, a side count, a difficulty, a team or the
// language on the kit's segmented control.
//
// `marks` are the census's names for the site's constructs (tools/interaction-census.mjs: `picker:<id>`, `select:<tag>`,
// `custom-select:<name>`, `segmented:<tag>`, `radio-group:<tag>`, `listbox:<tag>`, `bespoke:<what it compares>`), in
// the row's owner unless a mark names another file first (`site/gallery.html listbox:#vehicleList`). The census,
// src/ui/interactionRegistry.selftest.mjs, fails on a construct no row claims (a new bespoke grid, select or swatch list),
// on a claim the source no longer has, and on a failing row outside the ratchet baseline
// (tools/interaction-baseline.json), which only shrinks. This table never reaches a bundle: only the census and the tools
// read it.

import type { DATUM_SCREENS } from './surfaceRegistry.ts';

/** The lanes that own a redesign (INTERACTION-REDESIGN.md, Owners). */
export const INTERACTION_LANES = Object.freeze(['premiere-site', 'premiere-battle', 'premiere-gallery-studio', 'lead'] as const);
type Lane = (typeof INTERACTION_LANES)[number];

/** How a site is built today. */
export const SITE_BUILDS = Object.freeze(['picker', 'segmented', 'select', 'custom-select', 'radio-group', 'listbox', 'bespoke'] as const);
type Build = (typeof SITE_BUILDS)[number];

type Screen = (typeof DATUM_SCREENS)[number];

/** What a set holds. The things the bar's line 1 names (a map, a camo, a mode, a tank, equipment, a nation, an hour)
 *  and every other set of things take the picker. */
type Chooses =
  | 'battlefield' | 'mode' | 'camo' | 'tank' | 'equipment' | 'nation' | 'hour' | 'operation' | 'environment' | 'rival'
  | 'shot' | 'take' | 'effect' | 'state' | 'part' | 'media' | 'command' | 'tool' | 'filter' | 'sort'
  | 'sides' | 'difficulty' | 'team' | 'language' | 'view' | 'setting';
/** The sets whose two to five values may stay on the kit's segmented control. */
const SEGMENTED_SETS: ReadonlySet<Chooses> = new Set(['sides', 'difficulty', 'team', 'language', 'view', 'setting']);
const SEGMENTED_MAX = 5;

interface InteractionSite {
  readonly chooses: Chooses;
  /** How many options it offers (the fleet's tanks, the battlefields and Random, a setting's values). */
  readonly options: number;
  readonly screen: Screen;
  /** The module that builds it (repo-relative). */
  readonly owner: string;
  readonly build: Build;
  /** The census marks it claims: in its owner, or in the file a mark names first. A picker row claims `picker:<its id>`. */
  readonly marks: readonly string[];
  readonly lane: Lane;
  /** The common path it lies on. */
  readonly path?: CommonPathId;
}

/** A row passes line 1: built on the picker, or two to five values of a segmented set on the kit's segmented control. */
export function sitePasses(row: InteractionSite): boolean {
  return row.build === 'picker' || (row.build === 'segmented' && SEGMENTED_SETS.has(row.chooses) && row.options <= SEGMENTED_MAX);
}

/**
 * The common paths, with the presses each takes today from where the player is (`from`). tools/interaction-steps.mjs
 * replays each through the click-timeline recorder and counts its presses; tools/interaction-baseline.json pins the
 * counts, which only fall.
 */
export const COMMON_PATHS = Object.freeze({
  /** Garage: Deploy, the battlefield card, a map, DEPLOY. */
  'map-deploy': { from: 'garage', presses: 4 },
  /** Garage: every paint, a paint from the sheet. */
  'wear-camo': { from: 'garage', presses: 2 },
  /** Garage: a slot, an item. */
  'equip-item': { from: 'garage', presses: 2 },
  /** Garage: Deploy, Private, Create room. */
  'start-room': { from: 'garage', presses: 3 },
} as const satisfies Readonly<Record<string, { readonly from: Screen; readonly presses: number }>>);
type CommonPathId = keyof typeof COMMON_PATHS;

const GARAGE = 'src/ui/garage.ts';
const ROOMS = 'src/ui/playMenu.ts';
const SETTINGS = 'src/ui/settings.ts';
const STUDIO = 'src/ui/studioPanel.ts';
const PRODUCTION = 'src/ui/studioProductionPanel.ts';
const GALLERY = 'src/gallery/gallery.ts';
const GALLERY_PAGE = 'site/gallery.html';
const FLEET = 221;
const BATTLEFIELDS = 34;

/** The rows. A new choose-one gets one here, built on the picker, before it renders anywhere. */
export const INTERACTION_SITES = Object.freeze({
  // ---- the Garage (premiere-gallery-studio)
  'garage-tank': { chooses: 'tank', options: FLEET, screen: 'garage', owner: GARAGE, build: 'listbox', marks: ['listbox:.cot-cards'], lane: 'premiere-gallery-studio' },
  'garage-nation': { chooses: 'nation', options: 15, screen: 'garage', owner: GARAGE, build: 'bespoke', marks: ['bespoke:chipById'], lane: 'premiere-gallery-studio' },
  'garage-facets': { chooses: 'filter', options: 12, screen: 'garage', owner: 'src/ui/garageFacetPanel.ts', build: 'bespoke', marks: ['bespoke:state[group]'], lane: 'premiere-gallery-studio' },
  'garage-rival': { chooses: 'rival', options: 12, screen: 'garage', owner: GARAGE, build: 'select', marks: ['select:[data-rival]'], lane: 'premiere-gallery-studio' },
  'garage-equipment-category': { chooses: 'filter', options: 6, screen: 'garage', owner: GARAGE, build: 'bespoke', marks: ['bespoke:category.id'], lane: 'premiere-gallery-studio', path: 'equip-item' },
  'garage-equipment': { chooses: 'equipment', options: 26, screen: 'garage', owner: GARAGE, build: 'bespoke', marks: ['bespoke:fittedAt===openSlot'], lane: 'premiere-gallery-studio', path: 'equip-item' },
  'garage-paint-band': { chooses: 'camo', options: 4, screen: 'garage', owner: GARAGE, build: 'bespoke', marks: ['bespoke:index===0'], lane: 'premiere-gallery-studio' },
  'garage-camo': { chooses: 'camo', options: 173, screen: 'garage', owner: GARAGE, build: 'bespoke', marks: ['bespoke:patternId===selectedPatternId'], lane: 'premiere-gallery-studio', path: 'wear-camo' },
  'garage-camo-collection': { chooses: 'filter', options: 14, screen: 'garage', owner: GARAGE, build: 'bespoke', marks: ['bespoke:id===activeCamoCollection'], lane: 'premiere-gallery-studio', path: 'wear-camo' },
  'garage-camo-tag': { chooses: 'filter', options: 13, screen: 'garage', owner: GARAGE, build: 'bespoke', marks: ['bespoke:tagId===activeCamoTag'], lane: 'premiere-gallery-studio', path: 'wear-camo' },
  'camo-lab-tools': { chooses: 'tool', options: 12, screen: 'garage', owner: 'src/ui/customCamoStudio.ts', build: 'bespoke', marks: ['bespoke:dataset.customTone', 'bespoke:dataset.customBrushType', 'bespoke:dataset.customAsset'], lane: 'premiere-gallery-studio' },
  'garage-staging': { chooses: 'environment', options: 10, screen: 'garage', owner: GARAGE, build: 'listbox', marks: ['listbox:#cot-garage-variant-menu', 'bespoke:id===selected.id'], lane: 'premiere-gallery-studio' },
  'garage-featured-still': { chooses: 'media', options: 6, screen: 'garage', owner: GARAGE, build: 'bespoke', marks: ['bespoke:k===i'], lane: 'premiere-gallery-studio' },
  'guide-steps': { chooses: 'view', options: 3, screen: 'garage', owner: 'src/ui/infoGuides.ts', build: 'bespoke', marks: ['bespoke:view===views[0]', 'bespoke:other===button', 'bespoke:i===index', 'bespoke:dataset.part'], lane: 'premiere-gallery-studio' },
  'guide-pins': { chooses: 'part', options: 3, screen: 'garage', owner: 'src/ui/infoGuidePhoto.ts', build: 'bespoke', marks: ['bespoke:i===index'], lane: 'premiere-gallery-studio' },
  'photo-framing': { chooses: 'view', options: 5, screen: 'garage', owner: 'src/ui/photoMode.ts', build: 'bespoke', marks: ["bespoke:id==='hero'", 'bespoke:dataset.view'], lane: 'premiere-gallery-studio' },
  'tech-tree-node': { chooses: 'tank', options: 40, screen: 'tech-tree', owner: 'src/ui/techTree.ts', build: 'bespoke', marks: ['bespoke:node.id'], lane: 'premiere-gallery-studio' },
  'tech-tree-nation': { chooses: 'nation', options: 13, screen: 'tech-tree', owner: 'src/ui/techTree.ts', build: 'bespoke', marks: ['bespoke:dataset.tree'], lane: 'premiere-gallery-studio' },
  'tech-tree-build': { chooses: 'view', options: 4, screen: 'tech-tree', owner: 'src/ui/techTree.ts', build: 'segmented', marks: ['segmented:.tt-builds', 'bespoke:id===chosen'], lane: 'premiere-gallery-studio' },

  // ---- Deploy (premiere-site)
  'deploy-mode': { chooses: 'mode', options: 13, screen: 'deploy', owner: GARAGE, build: 'bespoke', marks: ['bespoke:dataset.mode', 'bespoke:dataset.gameMode'], lane: 'premiere-site' },
  'deploy-battlefield': { chooses: 'battlefield', options: BATTLEFIELDS, screen: 'deploy', owner: GARAGE, build: 'bespoke', marks: ['bespoke:id===mapId'], lane: 'premiere-site', path: 'map-deploy' },
  'deploy-sides': { chooses: 'sides', options: 3, screen: 'deploy', owner: GARAGE, build: 'bespoke', marks: ['bespoke:dataset.sides'], lane: 'premiere-site' },
  'deploy-difficulty': { chooses: 'difficulty', options: 3, screen: 'deploy', owner: 'src/ui/deployScreen.ts', build: 'bespoke', marks: ['bespoke:dataset.diff'], lane: 'premiere-site' },
  'deploy-mars': { chooses: 'setting', options: 3, screen: 'deploy', owner: GARAGE, build: 'custom-select', marks: ['select:[data-mars-field]', 'custom-select:marsDropdowns'], lane: 'premiere-site' },
  'deploy-arrangement': { chooses: 'setting', options: 6, screen: 'deploy', owner: 'src/ui/battleArrangementPanel.ts', build: 'custom-select', marks: ['select:select', 'custom-select:field.select'], lane: 'premiere-site' },
  'deploy-team-nations': { chooses: 'team', options: 2, screen: 'deploy', owner: 'src/ui/teamNationsControl.ts', build: 'segmented', marks: ['segmented:group', 'bespoke:dataset.teamNations'], lane: 'premiere-site' },
  'nation-dropdown': { chooses: 'nation', options: 15, screen: 'deploy', owner: 'src/ui/nationSelect.ts', build: 'custom-select', marks: ['custom-select:select'], lane: 'premiere-site' },

  // ---- Settings and the HUD editor (premiere-site)
  'settings-right-click': { chooses: 'setting', options: 3, screen: 'settings', owner: SETTINGS, build: 'bespoke', marks: ['bespoke:dataset.mode'], lane: 'premiere-site' },
  'settings-difficulty': { chooses: 'difficulty', options: 3, screen: 'settings', owner: SETTINGS, build: 'bespoke', marks: ['bespoke:dataset.tier'], lane: 'premiere-site' },
  'settings-brain': { chooses: 'setting', options: 2, screen: 'settings', owner: SETTINGS, build: 'bespoke', marks: ['bespoke:dataset.brainOpponent', 'bespoke:dataset.brainAllies'], lane: 'premiere-site' },
  'settings-crew-voice': { chooses: 'nation', options: 14, screen: 'settings', owner: SETTINGS, build: 'select', marks: ['select:crewSelect'], lane: 'premiere-site' },
  'settings-quality': { chooses: 'setting', options: 6, screen: 'settings', owner: SETTINGS, build: 'bespoke', marks: ['bespoke:dataset.name'], lane: 'premiere-site' },
  'settings-accessibility': { chooses: 'setting', options: 6, screen: 'settings', owner: SETTINGS, build: 'bespoke', marks: ['bespoke:dataset.value'], lane: 'premiere-site' },
  'settings-language': { chooses: 'language', options: 2, screen: 'settings', owner: SETTINGS, build: 'bespoke', marks: ['bespoke:dataset.locale'], lane: 'premiere-site' },
  'hud-editor-part': { chooses: 'part', options: 25, screen: 'settings', owner: 'src/ui/hudEditor.ts', build: 'bespoke', marks: ['bespoke:key===id', 'bespoke:dataset.part', 'bespoke:part.id'], lane: 'premiere-site' },
  'hud-editor-profile': { chooses: 'view', options: 3, screen: 'settings', owner: 'src/ui/hudEditor.ts', build: 'bespoke', marks: ['bespoke:profile===id'], lane: 'premiere-site' },

  // ---- Rooms (the lead)
  'rooms-kind': { chooses: 'setting', options: 2, screen: 'rooms', owner: ROOMS, build: 'bespoke', marks: ['bespoke:dataset.mode', 'bespoke:item===button'], lane: 'lead', path: 'start-room' },
  'rooms-create-size': { chooses: 'setting', options: 5, screen: 'rooms', owner: ROOMS, build: 'listbox', marks: ['listbox:#cot-create-size-list'], lane: 'lead' },
  'rooms-battlefield': { chooses: 'battlefield', options: BATTLEFIELDS, screen: 'rooms', owner: ROOMS, build: 'picker', marks: ['picker:rooms-battlefield'], lane: 'lead' },
  /** The pre-picker battlefield dropdown's list, still in the lobby's markup beside the picker that replaced it. */
  'rooms-battlefield-list': { chooses: 'battlefield', options: BATTLEFIELDS, screen: 'rooms', owner: ROOMS, build: 'listbox', marks: ['listbox:#cot-room-map-list'], lane: 'lead' },
  'rooms-operation': { chooses: 'operation', options: 7, screen: 'rooms', owner: ROOMS, build: 'custom-select', marks: ['select:[data-control]', 'custom-select:operationDropdown'], lane: 'lead' },
  'rooms-tank': { chooses: 'tank', options: FLEET, screen: 'rooms', owner: ROOMS, build: 'listbox', marks: ['listbox:#cot-room-vehicle-list'], lane: 'lead' },
  'rooms-team': { chooses: 'team', options: 3, screen: 'rooms', owner: ROOMS, build: 'listbox', marks: ['listbox:#cot-room-team-list'], lane: 'lead' },
  // the lobby's hand-rolled dropdown (bindMenuSelect) writes every list's selection: claimed here
  'rooms-size': { chooses: 'setting', options: 5, screen: 'rooms', owner: ROOMS, build: 'listbox', marks: ['listbox:#cot-room-size-list', 'bespoke:item===option'], lane: 'lead' },
  'rooms-mode': { chooses: 'mode', options: 13, screen: 'rooms', owner: ROOMS, build: 'bespoke', marks: ['bespoke:dataset.gameMode'], lane: 'lead' },
  'rooms-sides': { chooses: 'sides', options: 3, screen: 'rooms', owner: ROOMS, build: 'bespoke', marks: ['bespoke:dataset.sides'], lane: 'lead' },
  'rooms-brain': { chooses: 'setting', options: 2, screen: 'rooms', owner: ROOMS, build: 'bespoke', marks: ['bespoke:dataset.brainOpponent'], lane: 'lead' },
  'rooms-arrangement': { chooses: 'setting', options: 6, screen: 'rooms', owner: ROOMS, build: 'custom-select', marks: ['select:[data-arrange]', 'custom-select:select'], lane: 'lead' },

  // ---- the battle (premiere-battle)
  'scope-vision': { chooses: 'view', options: 4, screen: 'battle', owner: 'src/ui/aerialHud.ts', build: 'bespoke', marks: ['bespoke:dataset.view'], lane: 'premiere-battle' },

  // ---- the Studio (premiere-gallery-studio)
  'studio-format': { chooses: 'setting', options: 4, screen: 'studio', owner: STUDIO, build: 'segmented', marks: ['segmented:formatSeg'], lane: 'premiere-gallery-studio' },
  'studio-controls': { chooses: 'setting', options: 2, screen: 'studio', owner: STUDIO, build: 'segmented', marks: ['segmented:modeSeg', 'bespoke:dataset.value'], lane: 'premiere-gallery-studio' },
  'studio-battlefield': { chooses: 'battlefield', options: 35, screen: 'studio', owner: STUDIO, build: 'listbox', marks: ['listbox:mapPop', 'bespoke:cardId===id'], lane: 'premiere-gallery-studio' },
  'studio-hour': { chooses: 'hour', options: 7, screen: 'studio', owner: STUDIO, build: 'segmented', marks: ['segmented:timeSeg', 'bespoke:time===light.time'], lane: 'premiere-gallery-studio' },
  'studio-snap': { chooses: 'setting', options: 3, screen: 'studio', owner: STUDIO, build: 'segmented', marks: ['segmented:snapSeg'], lane: 'premiere-gallery-studio' },
  'studio-state': { chooses: 'state', options: 6, screen: 'studio', owner: STUDIO, build: 'segmented', marks: ['segmented:stateSeg', 'bespoke:sid===a.stateName'], lane: 'premiere-gallery-studio' },
  'studio-camo': { chooses: 'camo', options: 174, screen: 'studio', owner: STUDIO, build: 'bespoke', marks: ["bespoke:a.camo||'inherit'"], lane: 'premiere-gallery-studio' },
  'studio-effect': { chooses: 'effect', options: 33, screen: 'studio', owner: STUDIO, build: 'listbox', marks: ['listbox:fxStack'], lane: 'premiere-gallery-studio' },
  'studio-camera': { chooses: 'setting', options: 2, screen: 'studio', owner: STUDIO, build: 'segmented', marks: ['segmented:camModeSeg', 'bespoke:c.mode'], lane: 'premiere-gallery-studio' },
  'studio-output': { chooses: 'setting', options: 5, screen: 'studio', owner: STUDIO, build: 'select', marks: ['select:select'], lane: 'premiere-gallery-studio' },
  'studio-transition': { chooses: 'setting', options: 5, screen: 'studio', owner: STUDIO, build: 'select', marks: ['select:transition'], lane: 'premiere-gallery-studio' },
  'studio-picture': { chooses: 'view', options: 11, screen: 'studio', owner: 'src/ui/studioPicturePanel.ts', build: 'select', marks: ['select:select', 'select:format'], lane: 'premiere-gallery-studio' },
  'studio-commands': { chooses: 'command', options: 60, screen: 'studio', owner: 'src/ui/studioCommands.ts', build: 'listbox', marks: ['listbox:list', 'bespoke:index===current'], lane: 'premiere-gallery-studio' },
  'studio-sequence': { chooses: 'shot', options: 8, screen: 'studio', owner: PRODUCTION, build: 'bespoke', marks: ['bespoke:cardId===id'], lane: 'premiere-gallery-studio' },
  'studio-production-format': { chooses: 'setting', options: 4, screen: 'studio', owner: PRODUCTION, build: 'select', marks: ['select:frame'], lane: 'premiere-gallery-studio' },
  'studio-featured-tank': { chooses: 'tank', options: FLEET, screen: 'studio', owner: PRODUCTION, build: 'select', marks: ['select:tanks'], lane: 'premiere-gallery-studio' },
  'studio-lens': { chooses: 'setting', options: 3, screen: 'studio', owner: PRODUCTION, build: 'select', marks: ['select:lens'], lane: 'premiere-gallery-studio' },
  'studio-site-take': { chooses: 'take', options: 63, screen: 'studio', owner: PRODUCTION, build: 'bespoke', marks: ['bespoke:take.id'], lane: 'premiere-gallery-studio' },
  'studio-fleet-take': { chooses: 'take', options: 130, screen: 'studio', owner: PRODUCTION, build: 'bespoke', marks: ['bespoke:id===take.id'], lane: 'premiere-gallery-studio' },

  // ---- the Tank Gallery (premiere-gallery-studio)
  'gallery-tank': { chooses: 'tank', options: FLEET, screen: 'gallery', owner: GALLERY, build: 'listbox', marks: [`${GALLERY_PAGE} listbox:#vehicleList`, 'bespoke:dataset.id'], lane: 'premiere-gallery-studio' },
  'gallery-facets': { chooses: 'filter', options: 23, screen: 'gallery', owner: 'src/gallery/galleryFacets.ts', build: 'bespoke', marks: ['bespoke:selected===code', 'bespoke:selected===id', `${GALLERY} bespoke:browse.era`, `${GALLERY} bespoke:browse.role`], lane: 'premiere-gallery-studio' },
  'gallery-sort': { chooses: 'sort', options: 28, screen: 'gallery', owner: GALLERY_PAGE, build: 'select', marks: ['select:#gallerySort'], lane: 'premiere-gallery-studio' },
  'gallery-layout': { chooses: 'view', options: 2, screen: 'gallery', owner: GALLERY_PAGE, build: 'segmented', marks: ['segmented:.layout-switch', `${GALLERY} bespoke:dataset.value`], lane: 'premiere-gallery-studio' },
  'gallery-rival': { chooses: 'rival', options: FLEET, screen: 'gallery', owner: GALLERY_PAGE, build: 'select', marks: ['select:#rivalSelect'], lane: 'premiere-gallery-studio' },
  'gallery-peer-scale': { chooses: 'view', options: 2, screen: 'gallery', owner: GALLERY_PAGE, build: 'segmented', marks: ['segmented:.peer-switch'], lane: 'premiere-gallery-studio' },
  'gallery-drawing': { chooses: 'view', options: 3, screen: 'gallery', owner: GALLERY_PAGE, build: 'segmented', marks: ['segmented:#diagramSwitch', `${GALLERY} bespoke:view===diagram`], lane: 'premiere-gallery-studio' },
  'gallery-layer': { chooses: 'view', options: 5, screen: 'gallery', owner: GALLERY, build: 'bespoke', marks: ['bespoke:dataset.mode'], lane: 'premiere-gallery-studio' },
  'gallery-camera-view': { chooses: 'view', options: 8, screen: 'gallery', owner: GALLERY, build: 'bespoke', marks: ['bespoke:dataset.view'], lane: 'premiere-gallery-studio' },
  'gallery-armor-metric': { chooses: 'view', options: 3, screen: 'gallery', owner: 'src/gallery/anatomyView.ts', build: 'segmented', marks: ['segmented:seg', 'bespoke:metric===value'], lane: 'premiere-gallery-studio' },
  'gallery-part': { chooses: 'part', options: 20, screen: 'gallery', owner: 'src/gallery/anatomyView.ts', build: 'bespoke', marks: ['bespoke:dataset.anatomyPart'], lane: 'premiere-gallery-studio' },
  'damage-lab-kind': { chooses: 'filter', options: 4, screen: 'gallery', owner: 'src/gallery/damageWorkbench.ts', build: 'bespoke', marks: ['bespoke:kind===value'], lane: 'premiere-gallery-studio' },
  'damage-lab-target': { chooses: 'part', options: 20, screen: 'gallery', owner: 'src/gallery/damageWorkbench.ts', build: 'bespoke', marks: ['bespoke:lab!.selected'], lane: 'premiere-gallery-studio' },
  'markup-operation': { chooses: 'setting', options: 4, screen: 'gallery', owner: GALLERY_PAGE, build: 'segmented', marks: ['segmented:.markup-operation-grid', 'src/gallery/surfaceMarkup.ts bespoke:dataset.markupOperation'], lane: 'premiere-gallery-studio' },
  'markup-scope': { chooses: 'setting', options: 2, screen: 'gallery', owner: GALLERY_PAGE, build: 'select', marks: ['select:#markupScope'], lane: 'premiere-gallery-studio' },
  'markup-primitive': { chooses: 'setting', options: 6, screen: 'gallery', owner: GALLERY_PAGE, build: 'select', marks: ['select:#markupPrimitive'], lane: 'premiere-gallery-studio' },
  'markup-annotation': { chooses: 'part', options: 12, screen: 'gallery', owner: 'src/gallery/surfaceMarkup.ts', build: 'bespoke', marks: ['bespoke:annotation.id'], lane: 'premiere-gallery-studio' },

  // ---- the public pages: /home (the lead), the Field Manual (premiere-site)
  'docs-battle-reel': { chooses: 'take', options: 24, screen: 'site', owner: 'src/docs/battleReels.ts', build: 'bespoke', marks: ['bespoke:index===0', 'bespoke:buttonIndex===index'], lane: 'premiere-site' },
  'docs-filming-stage': { chooses: 'view', options: 6, screen: 'site', owner: 'src/docs/filming.ts', build: 'bespoke', marks: ['bespoke:own===stage'], lane: 'premiere-site' },
  'docs-archive-filter': { chooses: 'filter', options: 11, screen: 'site', owner: 'src/presentation/mediaArchive.ts', build: 'bespoke', marks: ['bespoke:dataset.feature', 'bespoke:feature===active'], lane: 'premiere-site' },
  'docs-media-collection': { chooses: 'media', options: 8, screen: 'site', owner: 'src/presentation/mediaLibrary.ts', build: 'bespoke', marks: ['bespoke:dataset.collection'], lane: 'premiere-site' },
} as const satisfies Readonly<Record<string, InteractionSite>>);

/** A census mark that is not a choose-one, with why. */
interface InteractionExempt {
  readonly owner: string;
  readonly mark: string;
  readonly reason: string;
}
export const INTERACTION_EXEMPT: readonly InteractionExempt[] = Object.freeze([
  { owner: GALLERY, mark: 'bespoke:dataset.tab', reason: "the dossier's tabs (role=tab in site/gallery.html): navigation, not a choice" },
  { owner: 'src/ui/endScreen.ts', mark: 'bespoke:dataset.reportView', reason: "the report's Personal and Teams tabs: navigation, not a choice" },
  { owner: 'src/ui/hud.ts', mark: "bespoke:action==='roofGun'", reason: "the systems row's roof gun and lights show their own on state: toggles, not a set" },
  { owner: 'src/gallery/damageWorkbench.ts', mark: "bespoke:action==='hitboxes'", reason: 'the Hitboxes and Probe tools show their own on state: toggles, not a set' },
  { owner: STUDIO, mark: 'bespoke:light.override?.sunElevationDeg', reason: "the sun elevation's Auto chip shows whether the map's own elevation holds: a toggle" },
  { owner: 'src/presentation/heroReel.ts', mark: 'bespoke:dataset.reelShot', reason: "the hero reel's caption follows the playing shot: a readout, nothing to choose" },
  { owner: 'src/presentation/homePage.ts', mark: 'bespoke:other===option', reason: "the landing's rail switch: tabs over its panels (role=tab, tabpanel): navigation, not a choice" },
]);
