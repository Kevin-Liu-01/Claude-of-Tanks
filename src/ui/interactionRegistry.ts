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
  | 'battlefield' | 'mode' | 'camo' | 'tank' | 'equipment' | 'consumable' | 'nation' | 'hour' | 'operation' | 'environment' | 'rival'
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
  /** A room's lobby (the host): the battlefield trigger, a battlefield on the picker. */
  'rooms-map': { from: 'rooms', presses: 2 },
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
  'garage-rival': { chooses: 'rival', options: 12, screen: 'garage', owner: GARAGE, build: 'picker', marks: ['picker:garage-rival'], lane: 'premiere-gallery-studio' },
  'garage-equipment': { chooses: 'equipment', options: 26, screen: 'garage', owner: GARAGE, build: 'picker', marks: ['picker:garage-equipment'], lane: 'premiere-gallery-studio', path: 'equip-item' },
  // the consumable catalog (2026-10-26): each slot opens the kit picker over the thirteen items (garageConsumables.ts)
  'garage-consumables': { chooses: 'consumable', options: 13, screen: 'garage', owner: 'src/ui/garageConsumables.ts', build: 'picker', marks: ['picker:garage-consumables'], lane: 'premiere-gallery-studio' },
  'garage-paint-band': { chooses: 'camo', options: 4, screen: 'garage', owner: GARAGE, build: 'picker', marks: ['picker:garage-paint-band'], lane: 'premiere-gallery-studio' },
  // INTERACTION-REDESIGN B: the every-paint sheet is the kit picker (camoPicker.ts); its kinds are the picker's own filter
  // chips (the old nation collections and tag bar went with it), Auto leads and "Make your own" is its last swatch
  'garage-camo': { chooses: 'camo', options: 175, screen: 'garage', owner: GARAGE, build: 'picker', marks: ['picker:garage-camo'], lane: 'premiere-gallery-studio', path: 'wear-camo' },
  // (261) the lab's brushes, tones and stencils: three segmented controls of at most five
  'camo-lab-tools': { chooses: 'setting', options: 5, screen: 'garage', owner: 'src/ui/customCamoStudio.ts', build: 'segmented', marks: ['segmented:.cot-custom-brushes', 'segmented:.cot-custom-tones', 'segmented:.cot-custom-assets'], lane: 'premiere-gallery-studio' },
  // INTERACTION-REDESIGN C: the staging area is the kit's picker menu over its ten picture cards (the hand-rolled listbox went)
  // the battle card's corner control (owner 10-26): the mode, then the battlefield, on the kit's picker menus
  'garage-quick-mode': { chooses: 'mode', options: 13, screen: 'garage', owner: GARAGE, build: 'picker', marks: ['picker:garage-quick-mode'], lane: 'premiere-gallery-studio' },
  'garage-quick-battlefield': { chooses: 'battlefield', options: BATTLEFIELDS, screen: 'garage', owner: GARAGE, build: 'picker', marks: ['picker:garage-quick-battlefield'], lane: 'premiere-gallery-studio' },
  'garage-staging': { chooses: 'environment', options: 10, screen: 'garage', owner: GARAGE, build: 'picker', marks: ['picker:garage-staging'], lane: 'premiere-gallery-studio' },
  // drawings-overhaul-259: the guide's view switch is the technical drawing viewer's tabs now (technicalDrawing.ts), still
  // bespoke and in the ratchet baseline; the segmented control is its owed build
  // (261) the technical drawing's views and kinds (the guides' steps are the kit's tabs, navigation, no mark)
  'guide-drawing': { chooses: 'view', options: 3, screen: 'garage', owner: 'src/ui/technicalDrawing.ts', build: 'segmented', marks: ['segmented:.cot-td__views', 'segmented:.cot-td__kinds'], lane: 'premiere-gallery-studio' },
  'photo-framing': { chooses: 'view', options: 5, screen: 'garage', owner: 'src/ui/photoMode.ts', build: 'segmented', marks: ['segmented:.cot-photo-views'], lane: 'premiere-gallery-studio' },
  'tech-tree-build': { chooses: 'view', options: 4, screen: 'tech-tree', owner: 'src/ui/techTree.ts', build: 'segmented', marks: ['segmented:.tt-builds', 'bespoke:id===chosen'], lane: 'premiere-gallery-studio' },

  // ---- Deploy (premiere-site)
  'deploy-mode': { chooses: 'mode', options: 14, screen: 'deploy', owner: GARAGE, build: 'picker', marks: ['picker:deploy-mode'], lane: 'premiere-site' },
  'deploy-battlefield': { chooses: 'battlefield', options: BATTLEFIELDS, screen: 'deploy', owner: GARAGE, build: 'picker', marks: ['picker:deploy-battlefield'], lane: 'premiere-site', path: 'map-deploy' },
  'deploy-sides': { chooses: 'sides', options: 3, screen: 'deploy', owner: GARAGE, build: 'segmented', marks: ['segmented:.cot-battle-sides'], lane: 'premiere-site' },
  'deploy-difficulty': { chooses: 'difficulty', options: 3, screen: 'deploy', owner: 'src/ui/deployScreen.ts', build: 'segmented', marks: ['segmented:.cot-deploy-tier'], lane: 'premiere-site' },
  'deploy-mars': { chooses: 'setting', options: 3, screen: 'deploy', owner: GARAGE, build: 'segmented', marks: ['segmented:.cot-deploy-mars'], lane: 'premiere-site' },
  // the counts and the winning score (up to 14 values) on the picker menu; the settings of two to five on the segmented control
  'deploy-arrangement': { chooses: 'setting', options: 14, screen: 'deploy', owner: 'src/ui/battleArrangementPanel.ts', build: 'picker', marks: ['picker:deploy-arrangement', 'segmented:.cot-arrange-seg'], lane: 'premiere-site' },
  'deploy-team-nations': { chooses: 'team', options: 2, screen: 'deploy', owner: 'src/ui/teamNationsControl.ts', build: 'segmented', marks: ['segmented:.cot-teams-seg'], lane: 'premiere-site' },
  'nation-dropdown': { chooses: 'nation', options: 15, screen: 'deploy', owner: 'src/ui/nationSelect.ts', build: 'picker', marks: ['picker:nation-dropdown'], lane: 'premiere-site' },

  // ---- Settings and the HUD editor (premiere-site)
  'settings-right-click': { chooses: 'setting', options: 3, screen: 'settings', owner: SETTINGS, build: 'segmented', marks: ['segmented:.cot-set-rmb'], lane: 'premiere-site' },
  'settings-difficulty': { chooses: 'difficulty', options: 3, screen: 'settings', owner: SETTINGS, build: 'segmented', marks: ['segmented:.cot-set-tier'], lane: 'premiere-site' },
  'settings-brain': { chooses: 'setting', options: 2, screen: 'settings', owner: SETTINGS, build: 'segmented', marks: ['segmented:.cot-set-brain'], lane: 'premiere-site' },
  'settings-crew-voice': { chooses: 'nation', options: 14, screen: 'settings', owner: SETTINGS, build: 'picker', marks: ['picker:settings-crew-voice'], lane: 'premiere-site' },
  // a desktop's six presets on the picker menu, a phone's four on the segmented control
  'settings-quality': { chooses: 'setting', options: 6, screen: 'settings', owner: SETTINGS, build: 'picker', marks: ['picker:settings-quality', 'segmented:.cot-set-quality'], lane: 'premiere-site' },
  'settings-accessibility': { chooses: 'setting', options: 3, screen: 'settings', owner: SETTINGS, build: 'segmented', marks: ['segmented:.cot-set-a11y'], lane: 'premiere-site' },
  'settings-colour-preset': { chooses: 'setting', options: 6, screen: 'settings', owner: SETTINGS, build: 'picker', marks: ['picker:settings-colour-preset'], lane: 'premiere-site' },
  // every On/Off setting (the alarms, the HUD, the allies' brain, the telemetry)
  'settings-on-off': { chooses: 'setting', options: 2, screen: 'settings', owner: SETTINGS, build: 'segmented', marks: ['segmented:.cot-set-onoff'], lane: 'premiere-site' },
  'settings-language': { chooses: 'language', options: 2, screen: 'settings', owner: SETTINGS, build: 'segmented', marks: ['segmented:.cot-set-lang'], lane: 'premiere-site' },
  // battle-camera-264: the chase camera's shoulder (left, centre, right) beside its sliders
  'settings-camera-shoulder': { chooses: 'setting', options: 3, screen: 'settings', owner: SETTINGS, build: 'segmented', marks: ['segmented:.cot-set-shoulder'], lane: 'premiere-site' },
  // the parts on the picker's list; the preview's own parts select by a press or a drag (direct manipulation)
  'hud-editor-part': { chooses: 'part', options: 25, screen: 'settings', owner: 'src/ui/hudEditor.ts', build: 'picker', marks: ['picker:hud-editor-part', 'bespoke:key===id'], lane: 'premiere-site' },
  'hud-editor-profile': { chooses: 'view', options: 3, screen: 'settings', owner: 'src/ui/hudEditor.ts', build: 'segmented', marks: ['segmented:.hud-edit-profiles'], lane: 'premiere-site' },

  // ---- Rooms (the lead)
  'rooms-kind': { chooses: 'setting', options: 2, screen: 'rooms', owner: ROOMS, build: 'segmented', marks: ['segmented:.modes'], lane: 'lead', path: 'start-room' },
  'rooms-create-size': { chooses: 'setting', options: 5, screen: 'rooms', owner: ROOMS, build: 'segmented', marks: ['segmented:.create-size'], lane: 'lead' },
  'rooms-battlefield': { chooses: 'battlefield', options: BATTLEFIELDS, screen: 'rooms', owner: ROOMS, build: 'picker', marks: ['picker:rooms-battlefield'], lane: 'lead', path: 'rooms-map' },
  /** The campaign operation: the kit's picker menu over the lobby's <select>, its storage (selectPickerMenu.ts, 261). */
  'rooms-operation': { chooses: 'operation', options: 7, screen: 'rooms', owner: ROOMS, build: 'picker', marks: ['picker:rooms-operation', 'select:[data-control]'], lane: 'lead' },
  'rooms-tank': { chooses: 'tank', options: FLEET, screen: 'rooms', owner: ROOMS, build: 'picker', marks: ['picker:rooms-tank'], lane: 'lead' },
  'rooms-team': { chooses: 'team', options: 3, screen: 'rooms', owner: ROOMS, build: 'segmented', marks: ['segmented:.room-team'], lane: 'lead' },
  // the lobby's hand-rolled dropdown (bindMenuSelect) writes every list's selection: claimed here
  'rooms-size': { chooses: 'setting', options: 5, screen: 'rooms', owner: ROOMS, build: 'segmented', marks: ['segmented:.room-size'], lane: 'lead' },
  'rooms-mode': { chooses: 'mode', options: 13, screen: 'rooms', owner: ROOMS, build: 'picker', marks: ['picker:rooms-mode'], lane: 'lead' },
  'rooms-rules-mode': { chooses: 'mode', options: 13, screen: 'rooms', owner: ROOMS, build: 'picker', marks: ['picker:rooms-rules-mode'], lane: 'lead' },
  'rooms-sides': { chooses: 'sides', options: 3, screen: 'rooms', owner: ROOMS, build: 'segmented', marks: ['segmented:.sides-seg'], lane: 'lead' },
  'rooms-brain': { chooses: 'setting', options: 2, screen: 'rooms', owner: ROOMS, build: 'segmented', marks: ['segmented:.brain-seg'], lane: 'lead' },
  // the arrangement's counts and teams: the kit's picker menu over their <select>s (selectPickerMenu.ts, 261)
  'rooms-arrangement': { chooses: 'setting', options: 6, screen: 'rooms', owner: ROOMS, build: 'picker', marks: ['picker:rooms-arrangement', 'select:[data-arrange]'], lane: 'lead' },

  // ---- the battle (premiere-battle)
  'scope-vision': { chooses: 'view', options: 4, screen: 'battle', owner: 'src/ui/aerialHud.ts', build: 'segmented', marks: ['segmented:.cot-scope-vision-seg'], lane: 'premiere-battle' },
  /** After a death, the ally the camera watches: the plate's picker over the spectator bar (Q and E still step). */
  'spectate-ally': { chooses: 'tank', options: 13, screen: 'battle', owner: 'src/ui/spectatorSwitcher.ts', build: 'picker', marks: ['picker:spectate-ally'], lane: 'premiere-battle' },

  // ---- the Studio (premiere-gallery-studio)
  'studio-format': { chooses: 'setting', options: 4, screen: 'studio', owner: STUDIO, build: 'segmented', marks: ['segmented:formatSeg'], lane: 'premiere-gallery-studio' },
  'studio-controls': { chooses: 'setting', options: 2, screen: 'studio', owner: STUDIO, build: 'segmented', marks: ['segmented:modeSeg', 'bespoke:dataset.value'], lane: 'premiere-gallery-studio' },
  'studio-battlefield': { chooses: 'battlefield', options: 35, screen: 'studio', owner: STUDIO, build: 'picker', marks: ['picker:studio-battlefield'], lane: 'premiere-gallery-studio' },
  'studio-hour': { chooses: 'hour', options: 7, screen: 'studio', owner: STUDIO, build: 'picker', marks: ['picker:studio-hour'], lane: 'premiere-gallery-studio' },
  'studio-snap': { chooses: 'setting', options: 3, screen: 'studio', owner: STUDIO, build: 'segmented', marks: ['segmented:snapSeg'], lane: 'premiere-gallery-studio' },
  'studio-state': { chooses: 'state', options: 6, screen: 'studio', owner: STUDIO, build: 'picker', marks: ['picker:studio-state'], lane: 'premiere-gallery-studio' },
  'studio-camo': { chooses: 'camo', options: 174, screen: 'studio', owner: STUDIO, build: 'picker', marks: ['picker:studio-camo'], lane: 'premiere-gallery-studio' },
  'studio-camera': { chooses: 'setting', options: 2, screen: 'studio', owner: STUDIO, build: 'segmented', marks: ['segmented:camModeSeg', 'bespoke:c.mode'], lane: 'premiere-gallery-studio' },
  'studio-output': { chooses: 'setting', options: 5, screen: 'studio', owner: STUDIO, build: 'segmented', marks: ['segmented:group'], lane: 'premiere-gallery-studio' },
  'studio-transition': { chooses: 'setting', options: 5, screen: 'studio', owner: STUDIO, build: 'segmented', marks: ['segmented:transition', 'bespoke:id===shot.transition'], lane: 'premiere-gallery-studio' },
  // the look and the aperture on the picker menu, the matte and the sensor (four each) on the segmented control (261)
  'studio-picture': { chooses: 'view', options: 11, screen: 'studio', owner: 'src/ui/studioPicturePanel.ts', build: 'picker', marks: ['picker:studio-picture', 'segmented:.studio-picture-seg'], lane: 'premiere-gallery-studio' },
  // the Director's frame (4) and lens (3): one segmented helper (studioProductionPanel.ts segments) serves both
  'studio-production-format': { chooses: 'setting', options: 4, screen: 'studio', owner: PRODUCTION, build: 'segmented', marks: ['segmented:group', 'bespoke:option.dataset[key]'], lane: 'premiere-gallery-studio' },
  'studio-featured-tank': { chooses: 'tank', options: FLEET, screen: 'studio', owner: PRODUCTION, build: 'picker', marks: ['picker:studio-featured-tank'], lane: 'premiere-gallery-studio' },
  // (261) the tanks to add to a scene: the kit's picker menu, each tank's portrait (a hand-made list until then)
  'studio-actor': { chooses: 'tank', options: FLEET, screen: 'studio', owner: STUDIO, build: 'picker', marks: ['picker:studio-actor'], lane: 'premiere-gallery-studio' },
  /** The template browser (owner 2026-10-27): every sequence, scene and tank's take, with a preview beside the cards. */
  'studio-templates': { chooses: 'take', options: 214, screen: 'studio', owner: 'src/ui/studioTemplateSheet.ts', build: 'picker', marks: ['picker:studio-templates'], lane: 'premiere-gallery-studio' },

  // ---- the Tank Gallery (premiere-gallery-studio)
  'gallery-sort': { chooses: 'sort', options: 28, screen: 'gallery', owner: GALLERY, build: 'picker', marks: ['picker:gallery-sort'], lane: 'premiere-gallery-studio' },
  'gallery-layout': { chooses: 'view', options: 2, screen: 'gallery', owner: GALLERY_PAGE, build: 'segmented', marks: ['segmented:.layout-switch', `${GALLERY} bespoke:dataset.value`], lane: 'premiere-gallery-studio' },
  'gallery-rival': { chooses: 'rival', options: FLEET, screen: 'gallery', owner: GALLERY, build: 'picker', marks: ['picker:gallery-rival'], lane: 'premiere-gallery-studio' },
  'gallery-peer-scale': { chooses: 'view', options: 2, screen: 'gallery', owner: GALLERY_PAGE, build: 'segmented', marks: ['segmented:.peer-switch'], lane: 'premiere-gallery-studio' },
  'gallery-drawing': { chooses: 'view', options: 3, screen: 'gallery', owner: GALLERY_PAGE, build: 'segmented', marks: ['segmented:#diagramSwitch', `${GALLERY} bespoke:view===diagram`], lane: 'premiere-gallery-studio' },
  'gallery-layer': { chooses: 'view', options: 5, screen: 'gallery', owner: GALLERY, build: 'segmented', marks: ['segmented:.layers'], lane: 'premiere-gallery-studio' },
  'gallery-camera-view': { chooses: 'view', options: 8, screen: 'gallery', owner: GALLERY, build: 'picker', marks: ['picker:gallery-camera-view'], lane: 'premiere-gallery-studio' },
  'gallery-armor-metric': { chooses: 'view', options: 3, screen: 'gallery', owner: 'src/gallery/anatomyView.ts', build: 'segmented', marks: ['segmented:seg', 'bespoke:metric===value'], lane: 'premiere-gallery-studio' },
  'damage-lab-target': { chooses: 'part', options: 20, screen: 'gallery', owner: 'src/gallery/damageWorkbench.ts', build: 'picker', marks: ['picker:damage-lab-target'], lane: 'premiere-gallery-studio' },
  'markup-operation': { chooses: 'setting', options: 4, screen: 'gallery', owner: GALLERY_PAGE, build: 'segmented', marks: ['segmented:.markup-operation-grid', 'src/gallery/surfaceMarkup.ts bespoke:dataset.markupOperation'], lane: 'premiere-gallery-studio' },
  // (261, the dropdown audit) the scope's two values on the segmented control, the primitive's six on the picker menu over its <select>
  'markup-scope': { chooses: 'setting', options: 2, screen: 'gallery', owner: GALLERY_PAGE, build: 'segmented', marks: ['segmented:#markupScope'], lane: 'premiere-gallery-studio' },
  'markup-primitive': { chooses: 'setting', options: 6, screen: 'gallery', owner: GALLERY_PAGE, build: 'picker', marks: ['select:#markupPrimitive', 'src/gallery/surfaceMarkup.ts picker:markup-primitive'], lane: 'premiere-gallery-studio' },

  // ---- the public pages: /home (the lead), the Field Manual (premiere-site)
  'docs-battle-reel': { chooses: 'take', options: 24, screen: 'site', owner: 'src/docs/battleReels.ts', build: 'picker', marks: ['picker:docs-battle-reel'], lane: 'premiere-site' },
  'docs-filming-stage': { chooses: 'view', options: 6, screen: 'site', owner: 'src/docs/filming.ts', build: 'picker', marks: ['picker:docs-filming-stage'], lane: 'premiere-site' },
  'docs-filming-take': { chooses: 'take', options: 8, screen: 'site', owner: 'src/docs/filming.ts', build: 'picker', marks: ['picker:docs-filming-take'], lane: 'premiere-site' },
  // (262) the fleet chapter's grid: its five filters (nation, tier, era, class, role, each with its every-value choice) are
  // one site on the kit's picker menu, its three presentations the segmented control (src/docs/chapters/fleetGrid.ts draws
  // them, fleetGrid.ts wires them)
  'docs-fleet-filter': { chooses: 'filter', options: 14, screen: 'site', owner: 'src/docs/fleetGrid.ts', build: 'picker', marks: ['picker:docs-fleet-filter'], lane: 'premiere-site' },
  'docs-fleet-view': { chooses: 'view', options: 3, screen: 'site', owner: 'src/docs/chapters/fleetGrid.ts', build: 'segmented', marks: ['segmented:.dm-fleet__views', 'site/docs-fleet.html segmented:.dm-fleet__views'], lane: 'premiere-site' },
  // (2026-10-26) the archive's feature filter and the library's collections are the kit's tabs: each switches the view
  // under it (the archive's grid, the library's panel), navigation the census does not count as a choice
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
  { owner: 'src/ui/infoGuides.ts', mark: 'bespoke:dataset.part', reason: "the guide figure lights the part its chosen step (the kit's tabs) names: a readout of the tab, nothing to choose" },
  // 261: the lead's ruling on the census rows (navigation, direct manipulation, readouts, filter sets, launch cards)
  { owner: GARAGE, mark: 'listbox:.cot-cards', reason: "the Garage's roster carousel (owner-ratified): a press stages and warms a tank; navigation through the fleet, not a set's choice" },
  { owner: GARAGE, mark: 'bespoke:chipById', reason: "the roster's nation flags: navigation within the ratified carousel, flag-only tabs the kit's tabs cannot draw" },
  { owner: GARAGE, mark: 'bespoke:id===countryId', reason: "the roster's nation flags: navigation within the ratified carousel, flag-only tabs the kit's tabs cannot draw" },
  { owner: 'src/ui/garageFacetPanel.ts', mark: 'bespoke:state[group]', reason: "the roster's Filter panel: class, role and era filters any number of which may be on, not a choose-one" },
  { owner: GARAGE, mark: 'bespoke:k===i', reason: "the featured still's dots show which picture of the slideshow is up: a readout, nothing to choose" },
  { owner: GALLERY_PAGE, mark: 'listbox:#vehicleList', reason: "the Gallery's roster: master-detail navigation, a row opens its tank's dossier (and its ?id=)" },
  { owner: GALLERY, mark: 'bespoke:dataset.id', reason: "the Gallery's roster: master-detail navigation, a row opens its tank's dossier (and its ?id=)" },
  { owner: 'src/gallery/galleryFacets.ts', mark: 'bespoke:selected===code', reason: "the archive's filter rows: filters a reader stacks, not a choose-one (their chips are the kit's)" },
  { owner: 'src/gallery/galleryFacets.ts', mark: 'bespoke:selected===id', reason: "the archive's filter rows: filters a reader stacks, not a choose-one (their chips are the kit's)" },
  { owner: GALLERY, mark: 'bespoke:browse.era', reason: "the archive's era filter: a filter a reader stacks with the others, not a choose-one" },
  { owner: GALLERY, mark: 'bespoke:browse.role', reason: "the archive's role filter: a filter a reader stacks with the others, not a choose-one" },
  { owner: 'src/gallery/anatomyView.ts', mark: 'bespoke:dataset.anatomyPart', reason: "the callouts pinned to the model's parts: pressing one is pressing the part on the model, direct manipulation" },
  { owner: 'src/gallery/surfaceMarkup.ts', mark: 'bespoke:annotation.id', reason: "the reader's own annotations: an editor's list of what they made (select, delete), not a set to choose from" },
  { owner: 'src/ui/infoGuidePhoto.ts', mark: 'bespoke:i===index', reason: "the guide photo's numbered pins: hotspots on the picture that mirror the guide's steps" },
  { owner: 'src/ui/techTree.ts', mark: 'bespoke:dataset.tree', reason: "the tech tree's nation rail (a nav, aria-current): navigation between trees" },
  { owner: 'src/ui/techTree.ts', mark: 'bespoke:node.id', reason: "the tech tree's nodes on a board one pans and zooms: navigation of a laid-out diagram" },
  { owner: 'src/ui/studioCommands.ts', mark: 'listbox:list', reason: "the Studio's command palette: a press runs an action and nothing stays chosen" },
  { owner: 'src/ui/studioCommands.ts', mark: 'bespoke:index===current', reason: "the Studio's command palette: a press runs an action and nothing stays chosen" },
  { owner: STUDIO, mark: 'listbox:fxStack', reason: "the scene's placed effects: an editor's layer list of what the scene holds, not a set to choose from" },
  { owner: PRODUCTION, mark: 'bespoke:template.id', reason: "the Studio shelf's launch cards (sequences and scenes): a press stages one; the whole choice is the studio-templates picker" },
  { owner: PRODUCTION, mark: 'bespoke:cardId===id', reason: "the Studio shelf's launch cards (sequences and scenes): a press stages one; the whole choice is the studio-templates picker" },
]);
