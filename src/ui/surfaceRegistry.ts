// The surface registry (UI-LOCKDOWN part B; owner 2026-10-25: "consolidate surfaces, prevent things like that silly
// double ping indicator from happening again"). Copyright © 2026 Kevin B. Liu.
//
// One row per on-screen datum, the way src/sim/matchRuleset.ts is one table for the modes and
// minimapObjectives.ts + objectiveGlyphs.ts are one derivation and one glyph set for the markers. A row names, for each
// screen the datum shows on, its owning module, the surface that carries it and the states it shows in; on one screen in
// one state a datum has one place. The 2026-10-25 doubled ping (the HUD corner's .cot-net-link beside the network strip's
// ping) is the case this table exists to refuse.
//
// A duplicate is one datum in two readouts at once on one screen and state, or a readout beside a control that shows the
// same value. Not duplicates: a list that names each of its items (a roster, the mode cards, a timeline) beside the
// selected item's readout; a control showing its own value; and what an open modal's scrim veils (the screen behind it).
//
// The owner marks its element through datumAttr() (markup) or markDatum() (a built element), and places the datum's
// glyph through datumGlyph(): the helpers live in src/ui/dom.ts, so this table never reaches a bundle (only the census
// and the tools read it). A static page (index.html, site/*.html) writes data-datum itself. The census,
// src/ui/surfaceRegistry.selftest.mjs, fails on a datum placed outside its owners, a marker with no row, a hand-written
// data-datum in a module, a datum glyph placed by hand and a caption key used outside its owners; tools/datum-census.mjs
// fails a probe or gauntlet capture on two visible elements of one datum or a visible live figure with no data-datum.

import type { IconId } from './icons/icon.ts';
import { DATUM_GLYPHS } from './dom.ts';

/** Every screen a datum can show on. The battle's overlays (pause, killcam, spectate, Watch, AC-130, drone) are states
 *  of 'battle'; the load and end screens, and each menu, are their own. */
export const DATUM_SCREENS = Object.freeze([
  'battle', 'load', 'end', 'garage', 'deploy', 'settings', 'record', 'rooms', 'gallery', 'studio', 'tech-tree', 'boot',
  'site',
] as const);
type DatumScreen = (typeof DATUM_SCREENS)[number];

/** Where one datum shows on one screen. */
interface DatumPlace {
  readonly screen: DatumScreen;
  /** The module that renders it (repo-relative), the only one that may mark it. */
  readonly owner: string;
  /** The element that carries data-datum (its class names and ids are checked against the owner's source). */
  readonly surface: string;
  /** The states it shows in; omitted, every state of the screen. Two places of one datum on one screen name disjoint
   *  states (solo, mp-host, mp-client, metered, tank, gunship, drone, spectate, watch and each screen's own). */
  readonly states?: readonly string[];
  /** The rule that hands the datum to another place, where one does. */
  readonly yields?: string;
}

interface DatumRow {
  /** The glyph that stands for the datum; placed only through datumGlyph() (or a GLYPH_MARKS entry). */
  readonly glyph?: IconId;
  /** Caption keys that name the datum: a module using one renders the datum, so only its owners may. */
  readonly labels?: readonly string[];
  /** The live figure's text (a RegExp source, case-insensitive) the runtime census flags outside any [data-datum]. */
  readonly readout?: string;
  readonly places: readonly DatumPlace[];
}

const HUD = 'src/ui/hud.ts';
const AERIAL = 'src/ui/aerialHud.ts';
const NET = 'src/ui/multiplayerStatus.ts';
const LOAD = 'src/ui/battleLoad.ts';
const END = 'src/ui/endScreen.ts';
const GARAGE = 'src/ui/garage.ts';
const ROOMS = 'src/ui/playMenu.ts';
const TECH = 'src/ui/techTree.ts';
const STUDIO = 'src/ui/studioPanel.ts';
const GALLERY = 'site/gallery.html';
const BOOT = 'index.html';

/** The rows. A new on-screen datum gets one here before it renders anywhere. */
export const SURFACE_REGISTRY = Object.freeze({
  link: {
    glyph: DATUM_GLYPHS.link,
    labels: ['hud.net.link', 'hud.net.local', 'hud.net.ms'],
    readout: '^\\d+\\s*ms$',
    places: [
      { screen: 'battle', owner: NET, surface: '.cot-mp-status.battle .unit.ping', states: ['mp-host', 'mp-client'] },
      { screen: 'battle', owner: HUD, surface: '.cot-net-unit.ping', states: ['metered'], yields: 'body.cot-mp-battle hides it (the strip owns the link)' },
    ],
  },
  fps: {
    labels: ['hud.net.fps'],
    readout: '^(\\d+\\s*)?fps$',
    places: [
      { screen: 'battle', owner: HUD, surface: '.cot-net-unit.fps', states: ['metered'], yields: 'body.cot-debug-hud hides the corner (the debug meter is a dev surface)' },
    ],
  },
  score: {
    places: [
      { screen: 'battle', owner: HUD, surface: '.cot-top' },
      { screen: 'end', owner: END, surface: '.es-score' },
    ],
  },
  clock: {
    glyph: DATUM_GLYPHS.clock,
    places: [
      { screen: 'battle', owner: HUD, surface: '.cot-top .tm' },
      { screen: 'load', owner: LOAD, surface: '.cot-c-chip.clock' },
      { screen: 'end', owner: END, surface: '.es-meta' },
    ],
  },
  objective: {
    places: [
      { screen: 'battle', owner: HUD, surface: '.cot-mode-status .mv' },
    ],
  },
  // The Frontline's hostiles still standing: a part of its objective, which on the two smallest touch windows (320x568,
  // 568x256) drops it so DETECTED keeps its row over the sight; the score plate's enemy side carries it there instead,
  // Horde-style (Main 254; battleHudLayout.css). Touch hides the rosters, so these are its only places.
  hostiles: {
    places: [
      { screen: 'battle', owner: HUD, surface: '.cot-mode-status .mv .seg', states: ['frontline'],
        yields: 'the score plate takes it on the smallest touch windows' },
      { screen: 'battle', owner: HUD, surface: '.cot-top .fh', states: ['frontline-smallest-touch'] },
    ],
  },
  'mode-name': {
    places: [
      { screen: 'battle', owner: HUD, surface: '.cot-mode-status .mn', states: ['corner-seat'] },
      { screen: 'load', owner: LOAD, surface: '.cot-c-chip.mode' },
      { screen: 'end', owner: END, surface: '.es-meta .mode' },
      { screen: 'garage', owner: GARAGE, surface: '.cot-battle-mode .sum-mode' },
      { screen: 'deploy', owner: GARAGE, surface: '#cot-deploy-mode-title' },
      { screen: 'rooms', owner: ROOMS, surface: '.room-rules summary' },
    ],
  },
  'map-name': {
    places: [
      { screen: 'battle', owner: HUD, surface: '.cot-mm-hd .nm', states: ['mouse-wide'] },
      { screen: 'load', owner: LOAD, surface: '.mapname' },
      { screen: 'end', owner: END, surface: '.es-meta' },
      { screen: 'garage', owner: GARAGE, surface: '.cot-battle-mode .sum-map' },
      { screen: 'deploy', owner: GARAGE, surface: '.cot-deploy-field-name' },
      { screen: 'rooms', owner: ROOMS, surface: '#cot-room-map-value' },
      { screen: 'studio', owner: STUDIO, surface: '.st-head .pn', states: ['desktop'] },
    ],
  },
  'team-counts': {
    places: [
      { screen: 'battle', owner: 'src/ui/hudTeamPips.ts', surface: '.cot-pips-row', states: ['mouse-wide'] },
      { screen: 'load', owner: LOAD, surface: '.cot-c-chip.sides' },
    ],
  },
  ammo: {
    places: [
      { screen: 'battle', owner: HUD, surface: '.cot-shells', states: ['tank'] },
      { screen: 'battle', owner: AERIAL, surface: '.flight-weapons', states: ['gunship'] },
    ],
  },
  reload: {
    places: [
      { screen: 'battle', owner: HUD, surface: '.cot-ret-text .cot-ret-reload', states: ['tank'] },
    ],
  },
  consumables: {
    places: [
      { screen: 'battle', owner: HUD, surface: '.cot-cons', states: ['tank'] },
    ],
  },
  equipment: {
    places: [
      { screen: 'battle', owner: 'src/ui/damagePanel.ts', surface: '.cot-dp .equiprow', states: ['tank'] },
      { screen: 'garage', owner: GARAGE, surface: '.cot-lt-loadout' },
    ],
  },
  hp: {
    places: [
      { screen: 'battle', owner: 'src/ui/damagePanel.ts', surface: '.cot-dp .hpnum', states: ['tank'] },
    ],
  },
  speed: {
    labels: ['hud.drive.kmh'],
    places: [
      { screen: 'battle', owner: HUD, surface: '.cot-drive .speed', states: ['tank'] },
      { screen: 'battle', owner: AERIAL, surface: '.flight-instrument', states: ['drone'] },
    ],
  },
  hints: {
    places: [
      { screen: 'battle', owner: 'src/ui/settings.ts', surface: '.cot-hints', states: ['tank'] },
      { screen: 'battle', owner: AERIAL, surface: '.flight-hint', states: ['gunship', 'drone'] },
      { screen: 'deploy', owner: 'src/ui/deployScreen.ts', surface: '.cot-deploy-keys' },
      { screen: 'boot', owner: BOOT, surface: '#cot-boot-tip' },
    ],
  },
  notices: {
    places: [
      { screen: 'battle', owner: HUD, surface: '.cot-alert' },
      { screen: 'rooms', owner: ROOMS, surface: '.status' },
      { screen: 'settings', owner: 'src/ui/settings.ts', surface: '.cot-set-conflict' },
      { screen: 'boot', owner: BOOT, surface: '#cot-boot-notice' },
    ],
  },
  /** (item 259, the lead: one datum, one place) What right-click does (rmbMode: Hold to Aim, Toggle Aim, Free Look): one
   *  control, on Controls under the RMB action's binding; Accessibility's Hold or toggle group links to it, never repeats it. */
  'rmb-mode': {
    labels: ['settings.rmb.label'],
    places: [
      { screen: 'settings', owner: 'src/ui/settings.ts', surface: '#cot-set-rmb-mode' },
    ],
  },
  /** (phone-controller-266, docs/PHONE-CONTROLLER.md) The phone controller's link: its state and round trip on the Controls
   *  tab's Phone controller card, and on the phone's own page (/pad, another device's screen). */
  'phone-link': {
    labels: ['settings.phone.state.live'],
    places: [
      { screen: 'settings', owner: 'src/pad/padConnectCard.ts', surface: '.cot-pad-state' },
      { screen: 'site', owner: 'src/pad/padPage.ts', surface: '.pad-link' },
    ],
  },
  /** The battle stands paused: the veil after a focus loss, the tag on Settings opened in a battle. */
  paused: {
    places: [
      { screen: 'battle', owner: 'src/ui/settings.ts', surface: '.cot-resume .rz-title', states: ['pause'] },
      { screen: 'settings', owner: 'src/ui/settings.ts', surface: '.cot-set-paused', states: ['in-battle'] },
    ],
  },
  'kill-feed': {
    places: [
      { screen: 'battle', owner: HUD, surface: '.cot-killfeed' },
    ],
  },
  /** The tank's own fire, modules and crew, with their severity and the repair's fill (UI-LOCKDOWN B2: the damage
   *  panel's plan shows where each module sits, its glyphs a diagram beside the chips, never a word or a figure). */
  'vehicle-status': {
    places: [
      { screen: 'battle', owner: 'src/ui/vehicleStatus.ts', surface: '.cot-vehicle-status' },
    ],
  },
  /** The damage the player's hits deal: the numbers floating over them (UI-LOCKDOWN B16: the shot card keeps the
   *  penetration, the angle, the armour and the outcome). */
  'damage-dealt': {
    places: [
      { screen: 'battle', owner: HUD, surface: '.cot-dmgnum' },
    ],
  },
  /** The battle's toasts, the kit's notices in one region: the pointer lock's notice, a networked battle's banner and the
   *  parked aim chip (UI-LOCKDOWN B14; the centre's alerts are `notices`). */
  toasts: {
    places: [
      { screen: 'battle', owner: 'src/ui/battleNotices.ts', surface: '.cot-battle-notices' },
    ],
  },
  /** The hits the player takes, a row each in the left lane, on the kit's notice queue (UI-LOCKDOWN B14). */
  hits: {
    places: [
      { screen: 'battle', owner: 'src/ui/shotInfo.ts', surface: '.cot-si-toasthost' },
    ],
  },
  /** The medals earned in battle, a card at a time in its seat off the reticle, on the kit's notice queue (UI-LOCKDOWN
   *  B14). */
  medals: {
    places: [
      { screen: 'battle', owner: 'src/ui/medalToast.ts', surface: '.cot-medal-toasts' },
    ],
  },
  /** The killcam's killer card (who destroyed the player, with what). */
  killer: {
    places: [
      { screen: 'battle', owner: 'src/game/killcam.ts', surface: '.cot-kc-killer', states: ['killcam'] },
    ],
  },
  /** The tank a spectator or a Watch viewer rides (its player and vehicle). */
  watched: {
    places: [
      { screen: 'battle', owner: HUD, surface: '.cot-spec .who', states: ['spectate'] },
      { screen: 'battle', owner: 'src/ui/watchHud.ts', surface: '.cot-watch .who', states: ['watch'] },
    ],
  },
  seat: {
    places: [
      { screen: 'battle', owner: NET, surface: '.unit.seat', states: ['mp-host', 'mp-client'] },
    ],
  },
  roster: {
    places: [
      { screen: 'battle', owner: NET, surface: '.unit.roster', states: ['mp-host', 'mp-client'] },
      { screen: 'rooms', owner: ROOMS, surface: '.seats-count' },
    ],
  },
  'tank-name': {
    places: [
      { screen: 'end', owner: END, surface: '.es-sub' },
      { screen: 'garage', owner: GARAGE, surface: '.cot-lt-name' },
      { screen: 'deploy', owner: GARAGE, surface: '.cot-deploy-tank .head' },
      { screen: 'gallery', owner: GALLERY, surface: '#dossierName' },
      { screen: 'studio', owner: STUDIO, surface: '.st-sel-tag' },
      { screen: 'tech-tree', owner: TECH, surface: '.tt-detail-name' },
    ],
  },
  tier: {
    places: [
      { screen: 'garage', owner: GARAGE, surface: '.cot-lt-id .lt-tier' },
      { screen: 'gallery', owner: GALLERY, surface: '#dossierTags' },
      { screen: 'tech-tree', owner: TECH, surface: '.tt-detail-tier' },
    ],
  },
  nation: {
    places: [
      { screen: 'garage', owner: GARAGE, surface: '.cot-lt-id .lt-nation' },
      { screen: 'gallery', owner: GALLERY, surface: '#dossierFlag' },
      { screen: 'tech-tree', owner: TECH, surface: '.tt-title' },
    ],
  },
  'room-code': {
    places: [
      { screen: 'rooms', owner: ROOMS, surface: '.roomhead .code' },
      { screen: 'garage', owner: GARAGE, surface: '.cot-room-reminder', states: ['in-room'] },
      { screen: 'boot', owner: BOOT, surface: '#cot-boot-invite', states: ['invite'] },
    ],
  },
  /** The career count and outcomes (battles, win rate and the split). */
  record: {
    places: [
      { screen: 'garage', owner: GARAGE, surface: '.record-badge' },
      { screen: 'record', owner: 'src/ui/serviceRecordView.ts', surface: '.cot-record-outcomes' },
    ],
  },
  'last-battle': {
    places: [
      { screen: 'record', owner: 'src/ui/serviceRecordView.ts', surface: '.cot-record-plate' },
    ],
  },
  /** The whole load's progress: the load screen's meta line, the boot card's main line. */
  'load-progress': {
    places: [
      { screen: 'load', owner: LOAD, surface: '.foot .fmeta' },
      { screen: 'boot', owner: BOOT, surface: '.cot-boot-bar' },
    ],
  },
  /** The boot's stage progress (owner, 2026-10-26): one segment per stage under the main line, done, current or to come. */
  'load-stage-progress': {
    places: [
      { screen: 'boot', owner: BOOT, surface: '#cot-boot-segs' },
    ],
  },
  /** The boot card's status line (the stage, or the stop state's message). */
  'load-stage': {
    places: [
      { screen: 'boot', owner: BOOT, surface: '#cot-boot-stage' },
    ],
  },
  version: {
    places: [
      { screen: 'boot', owner: BOOT, surface: '.cot-boot-foot' },
    ],
  },
  'github-stars': {
    places: [
      { screen: 'boot', owner: BOOT, surface: '.cot-github-stars' },
      { screen: 'site', owner: 'site/docs.html', surface: '.footer-stars', states: ['docs'] },
    ],
  },
  /** The build's tank, map and mode counts. */
  'fleet-counts': {
    places: [
      { screen: 'site', owner: 'site/home.html', surface: '.hero__stats', states: ['home'] },
      { screen: 'site', owner: 'site/docs.html', surface: '.docs-evidence', states: ['docs'] },
    ],
  },
  /** The Studio's frame and shot position. */
  playhead: {
    places: [
      { screen: 'studio', owner: STUDIO, surface: '.st-fc' },
    ],
  },
} as const satisfies Readonly<Record<string, DatumRow>>);

export type DatumKey = keyof typeof SURFACE_REGISTRY;

/** A datum glyph placed outside datumGlyph(), with why it is not that datum's readout. */
interface GlyphMark {
  readonly owner: string;
  readonly glyph: IconId;
  readonly reason: string;
}
export const GLYPH_MARKS: readonly GlyphMark[] = Object.freeze([
  { owner: GARAGE, glyph: 'clock', reason: "the Deploy campaign list's rows: each operation names its own time limit (a list, not the battle clock)" },
]);
