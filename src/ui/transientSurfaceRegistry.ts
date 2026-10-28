// The transient-surface registry (owner 2026-10-27: "what if i have equipment open and select consumables, the old surface
// needs to go away while new one comes in"). Copyright © 2026 Kevin B. Liu.
//
// One row per transient surface: every picker, popover, menu, drawer, sheet and dialog that opens over a screen and stands
// on the page's surface stack (src/ui/components/surfaceStack.ts) under its id. A row names its screen, its owner module,
// its box once open, the surface it stands on when it opens from inside one, and how the census opens it in each layout
// ('docked': a desktop's persistent panels; 'folded': the overlay layout of a phone or a short window). The static census
// (transientSurfaceRegistry.selftest.mjs) fails on a surface no row names and on a row whose owner lost its id; the browser
// census (tools/surface-pairs.mjs) opens every pair of surfaces reachable together on a screen, A then B, and fails unless
// A has gone, B is open with the focus in it, and nothing is left behind (a scrim, aria-expanded, inert, a scroll lock).
// This table never reaches a bundle: only the census reads it.

/** The screens whose surfaces the census pairs. */
const SURFACE_SCREENS = Object.freeze(['garage', 'deploy', 'settings', 'gallery', 'battle', 'rooms', 'studio', 'site'] as const);
type Screen = (typeof SURFACE_SCREENS)[number];

/** The census's way in: selectors pressed in turn from the screen at rest; a leading `?` presses one only when it shows. */
type Recipe = readonly string[];

interface TransientSurfaceRow {
  readonly screen: Screen;
  /** The module that opens it (repo-relative). */
  readonly owner: string;
  /** Its box once open (a selector). */
  readonly box: string;
  /** The surface it stands on: it opens from inside that one, which stays open under it (per layout where they differ). */
  readonly on?: string | { readonly docked?: string; readonly folded?: string };
  /** Its own scrim takes the presses outside it. */
  readonly modal?: boolean;
  /** How the census opens it, per layout; a layout without a recipe never shows it. */
  readonly open: { readonly docked?: Recipe; readonly folded?: Recipe };
}

const GARAGE = 'src/ui/garage.ts';
const menuBox = (id: string): string => `.cot-c-menu__pop:has([data-picker="${id}"])`;
const RIVAL_OPEN = ['?[data-compare="off"]', '[data-picker-menu="garage-rival"]'] as const;
const SETTINGS_OPEN = ['.cot-settings-slot button'] as const;
const DEPLOY_OPEN = ['.cot-battle-mode'] as const;

/** The rows. A new transient surface gets one here, with its id on the stack, before it renders anywhere. */
export const TRANSIENT_SURFACES = Object.freeze({
  // ---- the Garage
  'garage-equipment': { screen: 'garage', owner: GARAGE, box: '.cot-eqpick:not(.cot-cspick)',
    open: { docked: ['.cot-lt-loadout .eqslot[data-slot="0"]'], folded: ['.cot-lt-loadout .eqslot[data-slot="0"]'] } },
  'garage-consumables': { screen: 'garage', owner: 'src/ui/garageConsumables.ts', box: '.cot-cspick',
    open: { docked: ['.cot-lt-consumables .csslot[data-slot="0"]'], folded: ['.cot-lt-consumables .csslot[data-slot="0"]'] } },
  'garage-paint-sheet': { screen: 'garage', owner: GARAGE, box: '.cot-leftcol', open: { docked: ['.cot-lt-paint-all'], folded: ['.cot-lt-paint-all'] } },
  // (folded, the overview's figures stand in the corner at rest: the dossier is that card opened over the stage)
  'garage-dossier': { screen: 'garage', owner: GARAGE, box: '.cot-garage[data-garage-panel="equipment"] .stats', modal: true,
    open: { folded: ['button[data-garage-panel="equipment"]'] } },
  // (a folded layout shows no Compare row: showroom.css)
  'garage-rival': { screen: 'garage', owner: GARAGE, box: menuBox('garage-rival'), open: { docked: RIVAL_OPEN } },
  'garage-staging': { screen: 'garage', owner: GARAGE, box: menuBox('garage-staging'), open: { docked: ['[data-picker-menu="garage-staging"]'] } },
  'garage-quick-mode': { screen: 'garage', owner: GARAGE, box: menuBox('garage-quick-mode'), open: { docked: ['[data-battle-quick]'], folded: ['[data-battle-quick]'] } },
  'garage-quick-battlefield': { screen: 'garage', owner: GARAGE, box: menuBox('garage-quick-battlefield'), open: {} },
  'garage-filters': { screen: 'garage', owner: 'src/ui/garageFacetPanel.ts', box: '.cot-facet-panel', open: { docked: ['.cot-facet-toggle'], folded: ['.cot-facet-toggle'] } },
  'garage-mobile-nav': { screen: 'garage', owner: GARAGE, box: '.cot-mobile-nav-menu', open: { folded: ['.cot-mobile-nav-trigger'] } },
  'tech-tree': { screen: 'garage', owner: 'src/ui/techTree.ts', box: '.cot-tt', modal: true, open: { docked: ['.cot-techtree-trigger'] } },
  'garage-technical': { screen: 'garage', owner: GARAGE, box: '.cot-technical-viewer', modal: true, open: {} },
  // the room's panel opens from Deploy's private room (its pickers need a room: the census reaches the panel alone)
  'rooms': { screen: 'deploy', owner: 'src/ui/playMenu.ts', box: '.cot-play .panel', modal: true,
    open: { docked: [...DEPLOY_OPEN, '[data-deploy-room="private"]'], folded: [...DEPLOY_OPEN, '[data-deploy-room="private"]'] } },
  'garage-return-failure': { screen: 'garage', owner: 'src/ui/garageReturnFailure.ts', box: '.cot-modal', modal: true, open: {} },
  'battle-entry-failure': { screen: 'garage', owner: 'src/ui/garageReturnFailure.ts', box: '.cot-modal', modal: true, open: {} },
  'service-record': { screen: 'garage', owner: 'src/ui/serviceRecordDialog.ts', box: '.cot-modal', modal: true, open: {} },
  'camo-studio': { screen: 'garage', owner: 'src/ui/customCamoStudio.ts', box: '.cot-modal', modal: true, on: 'garage-paint-sheet', open: {} },
  'context-info': { screen: 'garage', owner: 'src/ui/contextInfo.ts', box: '.cot-modal', modal: true, open: {} },
  'modal': { screen: 'garage', owner: 'src/ui/modal.ts', box: '.cot-modal', modal: true, open: {} },

  // ---- Deploy
  'deploy': { screen: 'deploy', owner: GARAGE, box: '.cot-battle-menu', modal: true, open: { docked: DEPLOY_OPEN, folded: DEPLOY_OPEN } },
  'deploy-battlefield': { screen: 'deploy', owner: GARAGE, box: '[data-deploy-field-pop]', on: 'deploy',
    open: { docked: [...DEPLOY_OPEN, '[data-deploy-field]'], folded: [...DEPLOY_OPEN, '[data-deploy-field]'] } },
  'deploy-arrangement': { screen: 'deploy', owner: 'src/ui/battleArrangementPanel.ts', box: menuBox('deploy-arrangement'), on: 'deploy', open: {} },
  'nation-dropdown': { screen: 'deploy', owner: 'src/ui/nationSelect.ts', box: menuBox('nation-dropdown'), on: 'deploy', open: {} },

  // ---- Settings (over the Garage or the battle) and the HUD editor
  'settings': { screen: 'settings', owner: 'src/ui/settings.ts', box: '.cot-set-panel', modal: true, open: { docked: SETTINGS_OPEN, folded: SETTINGS_OPEN } },
  'settings-quality': { screen: 'settings', owner: 'src/ui/settings.ts', box: menuBox('settings-quality'), on: 'settings',
    open: { docked: [...SETTINGS_OPEN, '[data-tab="graphics"]', '[data-picker-menu="settings-quality"]'] } },
  'settings-colour-preset': { screen: 'settings', owner: 'src/ui/settings.ts', box: menuBox('settings-colour-preset'), on: 'settings',
    open: { docked: [...SETTINGS_OPEN, '[data-tab="accessibility"]', '[data-picker-menu="settings-colour-preset"]'],
      folded: [...SETTINGS_OPEN, '[data-tab="accessibility"]', '[data-picker-menu="settings-colour-preset"]'] } },
  'settings-crew-voice': { screen: 'settings', owner: 'src/ui/settings.ts', box: menuBox('settings-crew-voice'), on: 'settings',
    open: { docked: [...SETTINGS_OPEN, '[data-tab="sound"]', '[data-picker-menu="settings-crew-voice"]'],
      folded: [...SETTINGS_OPEN, '[data-tab="sound"]', '[data-picker-menu="settings-crew-voice"]'] } },
  'hud-editor': { screen: 'settings', owner: 'src/ui/hudEditor.ts', box: '.cot-modal', modal: true, on: 'settings', open: {} },

  // ---- the Tank Gallery and the public pages
  'gallery-rival': { screen: 'gallery', owner: 'src/gallery/gallery.ts', box: menuBox('gallery-rival'), open: { docked: ['[data-picker-menu="gallery-rival"]'], folded: ['[data-picker-menu="gallery-rival"]'] } },
  'gallery-sort': { screen: 'gallery', owner: 'src/gallery/gallery.ts', box: menuBox('gallery-sort'), open: { docked: ['[data-picker-menu="gallery-sort"]'], folded: ['[data-picker-menu="gallery-sort"]'] } },
  // (261) the camera's eight framings over the stage
  'gallery-camera-view': { screen: 'gallery', owner: 'src/gallery/gallery.ts', box: menuBox('gallery-camera-view'), open: { docked: ['[data-picker-menu="gallery-camera-view"]'], folded: ['[data-picker-menu="gallery-camera-view"]'] } },
  'gallery-drawing': { screen: 'gallery', owner: 'src/gallery/gallery.ts', box: 'figure.diagram.is-zoomed', modal: true, open: { docked: ['#dossierTabs [data-tab="anatomy"]', '#diagramImage'], folded: ['#dossierTabs [data-tab="anatomy"]', '#diagramImage'] } },
  'markup-primitive': { screen: 'gallery', owner: 'src/gallery/surfaceMarkup.ts', box: menuBox('markup-primitive'),
    open: { docked: ['.layers [data-value="markup"]', '[data-markup-operation="add"]', '[data-picker-menu="markup-primitive"]'] } },
  'public-nav-menu': { screen: 'gallery', owner: 'src/presentation/publicNav.ts', box: '#public-nav-menu', open: { folded: ['.public-nav__menu-trigger'] } },

  // the public pages' native dialogs (components/surfaceStack.ts dialogSurface)
  'home-trailer': { screen: 'site', owner: 'src/presentation/homePage.ts', box: 'dialog[open]', modal: true,
    open: { docked: ['[data-trailer-open]'], folded: ['[data-trailer-open]'] } },
  'docs-archive': { screen: 'site', owner: 'src/docs/docs.ts', box: 'dialog[open]', modal: true, open: {} },
  // the manual's fleet filters (era, class, role, nation: one id, four triggers; the census's site screen is /home)
  'docs-fleet-filter': { screen: 'site', owner: 'src/docs/fleetGrid.ts', box: menuBox('docs-fleet-filter'), open: {} },
  'media-library': { screen: 'site', owner: 'src/presentation/mediaLibrary.ts', box: 'dialog[open]', modal: true, open: {} },
  'media-archive': { screen: 'site', owner: 'src/presentation/mediaArchive.ts', box: 'dialog[open]', modal: true, open: {} },

  // ---- the battle
  'spectate-ally': { screen: 'battle', owner: 'src/ui/spectatorSwitcher.ts', box: '.cot-spec-pop', open: {} },
  // the touch layout's ammunition rack, opened from its slot
  'hud-ammo-rack': { screen: 'battle', owner: 'src/ui/hud.ts', box: '.cot-shells.touch-open', open: {} },

  // ---- Rooms (the panel and its pickers over the Garage)
  'rooms-tank': { screen: 'rooms', owner: 'src/ui/playMenu.ts', box: '.vehicle-pick', on: 'rooms', open: {} },
  'rooms-battlefield': { screen: 'rooms', owner: 'src/ui/playMenu.ts', box: '.battlefield-pick', on: 'rooms', open: {} },
  'rooms-mode': { screen: 'rooms', owner: 'src/ui/playMenu.ts', box: '.mode-pick', on: 'rooms', open: {} },
  'rooms-operation': { screen: 'rooms', owner: 'src/ui/playMenu.ts', box: menuBox('rooms-operation'), on: 'rooms', open: {} },
  'rooms-arrangement': { screen: 'rooms', owner: 'src/ui/playMenu.ts', box: menuBox('rooms-arrangement'), on: 'rooms', open: {} },

  // ---- the Studio
  'studio-actor': { screen: 'studio', owner: 'src/ui/studioPanel.ts', box: menuBox('studio-actor'), open: {} },
  'studio-featured-tank': { screen: 'studio', owner: 'src/ui/studioProductionPanel.ts', box: menuBox('studio-featured-tank'), open: {} },
  'studio-picture': { screen: 'studio', owner: 'src/ui/studioPicturePanel.ts', box: menuBox('studio-picture'), open: {} },
  'studio-battlefield': { screen: 'studio', owner: 'src/ui/studioPanel.ts', box: '.cot-studio .mapPop.open', open: {} },
  // (261) the time of day and the selected tank's state: picker menus in the inspector (the census has no Studio page yet)
  'studio-hour': { screen: 'studio', owner: 'src/ui/studioPanel.ts', box: menuBox('studio-hour'), open: {} },
  'studio-state': { screen: 'studio', owner: 'src/ui/studioPanel.ts', box: menuBox('studio-state'), open: {} },
  'studio-queue': { screen: 'studio', owner: 'src/ui/studioPanel.ts', box: '.st-queue', open: {} },
  'studio-commands': { screen: 'studio', owner: 'src/ui/studioCommands.ts', box: '.st-cmd-box', modal: true, open: {} },
  // the template browser (owner 2026-10-27): every sequence, scene and tank's take, from the Director's door
  'studio-templates': { screen: 'studio', owner: 'src/ui/studioTemplateSheet.ts', box: '.cot-studio-templates', modal: true, open: {} },
} as const satisfies Readonly<Record<string, TransientSurfaceRow>>);
