// The loading-surface registry (owner 2026-10-27: "lets ensure we have good loadin gstates for everything").
// Copyright © 2026 Kevin B. Liu.
//
// One row per surface whose content arrives after its box: a document's first view, a panel a press opens, a section a
// reader scrolls to. A row names its page and path, its lane and owner module (where a finding routes), its box once
// painted, what "ready" means for it, and how the census reaches it from the page at rest. tools/loading-census.mjs
// loads every row on a built dist under a slow network (Fast 3G, a 4x CPU, a cold cache) and offline, and holds the
// less-is-more-web rules on each: a painted box is never bare (a skeleton, a poster or its text), no layout shift, no
// media popping in at full opacity, no spinner where a skeleton fits, every wait over a second announced, nothing over
// the navigation, and offline a quiet retry state instead of a blank or a broken frame. The static half
// (loadingSurfaceRegistry.selftest.mjs) holds that each row's owner exists and still builds its box.
// This table never reaches a bundle: only the census reads it.

/** The lanes a loading finding routes to (INTERACTION-REDESIGN.md Owners, plus the boot and loading lane). */
export const LOADING_LANES = Object.freeze(['boot-loading', 'lead', 'premiere-site', 'premiere-gallery-studio', 'premiere-battle', 'canvas-ui'] as const);
type Lane = (typeof LOADING_LANES)[number];

/** The rules the census holds a row to (tools/loading-census.mjs). */
export const LOADING_RULES = Object.freeze(['bare', 'spinner', 'shift', 'pop', 'silent', 'blocked', 'late', 'no-retry', 'broken'] as const);
type Rule = (typeof LOADING_RULES)[number];

/** The documents the census loads, each in a fresh browser context. */
export const LOADING_PAGES = Object.freeze(['game', 'studio', 'home', 'docs', 'docs-topic', 'docs-fleet', 'gallery', '404'] as const);
type Page = (typeof LOADING_PAGES)[number];

/** The census's way in: selectors pressed in turn from the page at rest; a leading `?` presses one only when it shows. */
type Recipe = readonly string[];
/** A recipe, or one per layout where they differ (a layout without one never shows the row). */
type Recipes = Recipe | { readonly desktop?: Recipe; readonly phone?: Recipe };

interface LoadingSurfaceRow {
  readonly page: Page;
  /** The document's path (the rows of one page share its first row's). */
  readonly path: string;
  readonly lane: Lane;
  /** The module that builds the box (repo-relative). */
  readonly owner: string;
  /** Its box once painted (a selector). */
  readonly box: string;
  /** Its content is in: a selector in view, `loaded:<sel>` (every image in view under it decoded), `frame:<sel>` (a
   *  video with a frame) or `gone:<sel>` (nothing matching in view). */
  readonly ready: string;
  /** Presses from the page at rest, per layout where they differ; none: the document's own first view. */
  readonly open?: Recipes;
  /** Scroll the box to the window's middle before watching (a section below the fold): on every layout, or only on a
   *  phone, where the box stands below its first view. */
  readonly scroll?: true | 'phone';
  /** A debug-surface expression that reaches the state (a battle's end), run instead of presses. */
  readonly debug?: string;
  /** The page at rest, before its in-app rows (a selector in view). */
  readonly rest?: string;
  /** The box covers the screen by design (a modal, the battle's load card): it may stand over the navigation. */
  readonly modal?: boolean;
  /** Its content is all in the first bytes: the offline pass has nothing to hold. */
  readonly offline?: false;
  /** A longer wait than the condition's default (ms). */
  readonly timeoutMs?: number;
  /** Presses that return to the page at rest after the row (Escape is pressed first, while a surface it opened stands). */
  readonly leave?: Recipes;
  /** The next row starts from this one's state: no Escape after it (a battle the next row ends). */
  readonly stays?: true;
  /** A finding the row keeps by a ruling the census cannot see, with the ruling as its reason. */
  readonly allow?: Readonly<Partial<Record<Rule, string>>>;
}

const GARAGE = 'src/ui/garage.ts';
const HOME = 'src/presentation/homePage.ts';
const DOCS = 'src/docs/docs.ts';
const TOPICS = 'src/docs/topics.ts';
const GALLERY = 'src/gallery/gallery.ts';
// (the desktop nav's Deploy, or the battle mode control where the nav folds away: the room census's way in)
const DEPLOY_OPEN = ['[data-nav="deploy"] || .cot-battle-mode'] as const;
const GARAGE_REST = '.cot-garage .cot-cards';
const SHEET = '.cot-garage[data-garage-panel="equipment"] .stats';
const SHEET_CLOSE = ['?.cot-garage[data-garage-panel="equipment"] .stats .cot-dossier-close'] as const;

/** The rows, document rows first within each page. */
export const LOADING_SURFACES = Object.freeze({
  // the game document: its boot, then the Garage at rest, then each surface a press opens
  // (the turning wheels are the owner's living mark, 2026-10-24: "an animated version where hes rolling along with each
  // bit chugging"; the card's progress line, its stage segments and its stage status carry the wait)
  'boot': { page: 'game', path: '/', lane: 'lead', owner: 'src/ui/bootScreen.ts', box: '#cot-boot', ready: 'gone:#cot-boot', offline: false,
    rest: GARAGE_REST, allow: { spinner: "the owner's living mark (2026-10-24) beside the progress line" } },
  'garage-roster': { page: 'game', path: '/', lane: 'premiere-gallery-studio', owner: GARAGE, box: '.cot-garage .cot-cards', ready: 'loaded:.cot-garage .cot-cards',
    offline: false },
  // (a desktop's dossier stands in the docked Garage at rest: an empty recipe; a phone opens it as a sheet over the stage,
  // its head on top and its overview scrolled below)
  'garage-dossier': { page: 'game', path: '/', lane: 'premiere-gallery-studio', owner: GARAGE, box: '.cot-garage .stats',
    ready: '.cot-garage .stats .cot-headline', open: { desktop: [] } },
  'garage-dossier-sheet': { page: 'game', path: '/', lane: 'premiere-gallery-studio', owner: GARAGE, box: SHEET, modal: true,
    ready: `${SHEET} .cot-dossier-title h3:not(:empty)`, open: { phone: ['.cot-overview-more'] }, leave: { phone: SHEET_CLOSE } },
  // (a desktop's drawing stands at the Protection station; a phone's in the dossier sheet)
  'garage-drawing': { page: 'game', path: '/', lane: 'premiere-gallery-studio', owner: GARAGE, box: '.cot-technical-viewer', modal: true,
    ready: 'loaded:.cot-technical-viewer [data-technical-modal-image]',
    open: { desktop: ['.cot-station[data-station="protection"]', '[data-technical-expand]'], phone: ['.cot-overview-more', '[data-technical-expand]'] },
    leave: { desktop: ['.cot-station[data-station="overview"]'], phone: SHEET_CLOSE } },
  'deploy': { page: 'game', path: '/', lane: 'premiere-site', owner: GARAGE, box: '#cot-battle-menu.open', modal: true, ready: 'loaded:#cot-battle-menu.open',
    open: [...DEPLOY_OPEN] },
  'deploy-battlefield': { page: 'game', path: '/', lane: 'premiere-site', owner: GARAGE, box: '[data-deploy-field-pop]',
    ready: 'loaded:[data-deploy-field-pop]', open: [...DEPLOY_OPEN, '#cot-battle-menu.open [data-deploy-field]'] },
  'rooms': { page: 'game', path: '/', lane: 'premiere-site', owner: 'src/ui/playMenu.ts', box: '.cot-play .panel', modal: true,
    ready: '.cot-play .panel .modes', open: [...DEPLOY_OPEN, '#cot-battle-menu.open [data-deploy-room="private"]'] },
  'tech-tree': { page: 'game', path: '/', lane: 'premiere-gallery-studio', owner: 'src/ui/techTree.ts', box: '.cot-tt', modal: true, ready: 'loaded:.cot-tt',
    open: { desktop: ['.cot-techtree-trigger'] } },
  'service-record': { page: 'game', path: '/', lane: 'premiere-gallery-studio', owner: 'src/ui/serviceRecordDialog.ts', box: '#cot-record-modal', modal: true,
    ready: '#cot-record-modal .cot-record-tab', open: { desktop: ['.cot-record-trigger'] } },
  'settings': { page: 'game', path: '/', lane: 'premiere-site', owner: 'src/ui/settings.ts', box: '.cot-set-panel', modal: true, ready: '.cot-set-panel [role="tab"]',
    open: ['.cot-settings-slot button'] },
  // the battle last: its entry from Deploy, its load card the loading state, then its end
  'battle-entry': { page: 'game', path: '/', lane: 'premiere-battle', owner: 'src/ui/battleLoad.ts', box: '.cot-bl', modal: true, ready: 'gone:.cot-bl',
    open: [...DEPLOY_OPEN, '#cot-battle-menu.open [data-battle-launch]'], timeoutMs: 900_000, stays: true },
  'end-screen': { page: 'game', path: '/', lane: 'premiere-battle', owner: 'src/ui/endScreen.ts', box: '.cot-es', modal: true, ready: 'loaded:.cot-es',
    debug: 'window.__DEBUG.slayEnemies()', timeoutMs: 120_000, offline: false },

  // the Studio document (/studio boots the game in studio mode)
  'studio': { page: 'studio', path: '/studio', lane: 'premiere-gallery-studio', owner: 'src/ui/studioPanel.ts', box: '.cot-studio', ready: '.cot-studio button',
    offline: false, timeoutMs: 900_000 },

  // the landing
  'home-hero': { page: 'home', path: '/home', lane: 'premiere-site', owner: HOME, box: '.hero', ready: 'loaded:.hero__still', offline: false },
  'home-duels': { page: 'home', path: '/home', lane: 'premiere-site', owner: HOME, box: '.bento--duels', ready: 'loaded:.bento--duels .bento__grid', scroll: true },
  'home-features': { page: 'home', path: '/home', lane: 'premiere-site', owner: HOME, box: '.features', ready: 'loaded:.features', scroll: true },
  'home-trailer': { page: 'home', path: '/home', lane: 'premiere-site', owner: HOME, box: 'dialog[open]', modal: true, ready: 'frame:dialog[open] video',
    open: ['[data-trailer-open]'] },

  // the manual's index and two topics (a prerendered one with figures, and Filming's late viewer)
  'docs-index': { page: 'docs', path: '/docs', lane: 'premiere-site', owner: DOCS, box: '.docs-hero', ready: '.docs-hero-copy', offline: false },
  'docs-chapters': { page: 'docs', path: '/docs', lane: 'premiere-site', owner: DOCS, box: '.docs-chapter-grid', ready: 'loaded:.docs-chapter-grid', scroll: true },
  'docs-reels': { page: 'docs', path: '/docs', lane: 'premiere-site', owner: 'src/docs/battleReels.ts', box: '#battle-reels', ready: 'loaded:#battle-reels .battle-reel-grid',
    scroll: true },
  'docs-archive': { page: 'docs', path: '/docs', lane: 'premiere-site', owner: 'src/presentation/mediaArchive.ts', box: '#docsArchive', modal: true,
    ready: 'frame:#docsArchive video', open: ['#docsArchiveOpen'] },
  'docs-topic-tanks': { page: 'docs-topic', path: '/docs/tanks', lane: 'premiere-site', owner: TOPICS, box: '.dm-banner', ready: 'loaded:.dm-banner', offline: false },
  'docs-tanks-reference': { page: 'docs-topic', path: '/docs/tanks', lane: 'premiere-site', owner: 'src/docs/reference.ts', box: '#reference',
    ready: '#reference .manual-record', scroll: true },

  // the fleet grid (every playable tank's hero card, prerendered): its first view, then its middle scrolled into view
  'docs-fleet': { page: 'docs-fleet', path: '/docs/fleet', lane: 'premiere-site', owner: 'src/docs/chapters/fleetGrid.ts',
    box: '.dm-fleet__grid', ready: 'loaded:.dm-fleet__grid', offline: false },
  'docs-fleet-lower': { page: 'docs-fleet', path: '/docs/fleet', lane: 'premiere-site', owner: 'src/docs/chapters/fleetGrid.ts',
    box: '.dm-fleet__grid', ready: 'loaded:.dm-fleet__grid', scroll: true },

  // the Gallery: its list, its viewer and its dossier, from the document's start (a phone stacks the list and the dossier
  // under the viewer)
  'gallery-list': { page: 'gallery', path: '/gallery', lane: 'premiere-gallery-studio', owner: GALLERY, box: '#vehicleList', ready: '#vehicleList .it', offline: false,
    scroll: 'phone' },
  'gallery-viewer': { page: 'gallery', path: '/gallery', lane: 'premiere-gallery-studio', owner: GALLERY, box: '#viewport', ready: 'gone:#loadingState', offline: false,
    timeoutMs: 600_000 },
  'gallery-dossier': { page: 'gallery', path: '/gallery', lane: 'premiere-gallery-studio', owner: GALLERY, box: '.dossier', ready: 'loaded:#dossierTake', offline: false,
    scroll: 'phone' },

  // the 404
  'not-found': { page: '404', path: '/no-such-page', lane: 'premiere-site', owner: 'src/presentation/notFound.ts', box: '.not-found', ready: 'loaded:.not-found__still',
    offline: false },
} satisfies Record<string, LoadingSurfaceRow>);
