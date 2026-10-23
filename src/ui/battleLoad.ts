/**
 * battleLoad.ts — pre-battle loading screen (World of Tanks battle-load
 * identity): map name + biome art, the two team rosters with vehicle names /
 * tiers / icons, a real progress bar, and a countdown into the battle.
 *
 * It is shown the instant BATTLE is pressed and torn down when the battle
 * actually starts, so it also MASKS the remaining world build — the 1 km
 * battlefield (terrain bake + vegetation + props) is no longer built during
 * boot, it is built behind this screen (main.ts ensureWorld → onProgress).
 *
 * Presentation only: main.ts supplies already-resolved rows. Icons come from
 * public/icons/<id>_side_silhouette.png (tools/genIcons.mjs).
 */

import { FONT_STACK, FONT_COND } from './fonts.ts';
import { iconUrl } from './icons.ts';
import { uiIconSVG } from './uiIcons.ts';
import { tierNumeral } from '../vehicles/tier.ts';
import { t } from './i18n.ts';
import { killSourceIdentity } from './killSourceIdentity.ts';
import { ensureStyle } from './styleLayers.ts';
import { isImagePreloaded, preloadImage } from './imagePreload.ts';
import { mapCardFor } from './mapBackdrop.ts';
import { MAP_THUMBS } from './mapThumbs.ts';
import { MAP_ART_TONES, MAP_ART_TONE_DEFAULT } from './mapArtTones.ts';
import { minimapAssetUrl } from './minimapAssetUrl.ts';

// Backward-compatible re-export for main.ts, killcam and end-screen callers.
export { tierNumeral };

// Translate legacy English progress labels written by the various loading
// runtimes. Each entry pairs a known English string with its i18n key; any
// unknown label is left as-is so the loading screen still updates.
const STAGE_LABEL_KEYS: Readonly<Record<string, string>> = Object.freeze({
  'Loading combat interface': 'battleLoad.stage.loadingCombatInterface',
  'Loading battlefield': 'battleLoad.stage.loadingBattlefield',
  'Uploading battlefield textures': 'battleLoad.stage.uploadingTextures',
  'Battlefield ready': 'battleLoad.stage.battlefieldReady',
  'Assembling rosters': 'battleLoad.stage.assemblingRosters',
  'Drawing tactical map': 'battleLoad.stage.drawingTacticalMap',
  'Preparing player vehicle': 'battleLoad.stage.preparingPlayer',
  'Painting vehicles': 'battleLoad.stage.paintingVehicles',
  'Preparing deployment': 'battleLoad.stage.preparingDeployment',
  'Ready': 'battleLoad.stage.ready',
  'Finishing camouflage': 'battleLoad.stage.finishingCamo',
  'Warming suspension terrain': 'battleLoad.stage.warmingSuspension',
  'Priming deployment view': 'battleLoad.stage.primingDeployment',
  'Priming deployment shadows': 'battleLoad.stage.primingShadows',
  'Combat effects ready': 'battleLoad.stage.combatEffectsReady',
  'Loading multiplayer runtime': 'battleLoad.stage.loadingMultiplayer',
  'Opening battle channel': 'battleLoad.stage.openingBattleChannel',
  'Securing match channel': 'battleLoad.stage.securingMatchChannel',
  'Synchronizing authority': 'battleLoad.stage.synchronizingAuthority',
  'Priming wreck variants': 'battleLoad.stage.primingWreckVariants',
  'Surveying terrain': 'battleLoad.stage.surveyingTerrain',
  'Building terrain meshes': 'battleLoad.stage.buildingTerrain',
  'Placing structures': 'battleLoad.stage.placingStructures',
  'Sealing the battlefield': 'battleLoad.stage.sealingBattlefield',
  'Planting vegetation': 'battleLoad.stage.plantingVegetation',
  'Surveying battlefield': 'battleLoad.stage.surveyingBattlefield',
  'Settling actors': 'battleLoad.stage.settlingActors',
  'Studio ready': 'battleLoad.stage.studioReady',
  'Preparing player panel': 'battleLoad.stage.preparingPlayerPanel',
  'Compiling combat shaders': 'battleLoad.stage.compilingCombatShaders',
  'Priming combat effects': 'battleLoad.stage.primingCombatEffects',
});

function translateStageLabel(label: string): string {
  const key = STAGE_LABEL_KEYS[label];
  return key ? t(key) : label;
}

/** A battlefield's gradient from its art's own band colours (tools/map-lqip.mjs), the mean of all maps without one. */
function mapArtGradient(mapId: string | undefined): string {
  const tones = (mapId && Object.hasOwn(MAP_ART_TONES, mapId) ? MAP_ART_TONES[mapId] : null) ?? MAP_ART_TONE_DEFAULT;
  return `linear-gradient(180deg,${tones[0]},${tones[1]} 48%,${tones[2]})`;
}

// 2026-10-13 (the perf stream): the battlefields' blurred 48x27 placeholders (tools/map-lqip.mjs, ~15 kB of data URLs)
// live in a lazy chunk the Garage loads in idle time, so the loading screen's first frame shows the map's own picture
// without a request while the boot bundle stays as it was.
let mapLqip: Readonly<Record<string, string>> | null = null;
let mapLqipLoad: Promise<void> | null = null;
/** Load the placeholder chunk (once; a failed fetch may be retried by a later call). */
export function primeMapLqip(): Promise<void> {
  mapLqipLoad ??= import('./mapLqip.ts').then((module) => { mapLqip = module.MAP_LQIP; }, () => { mapLqipLoad = null; });
  return mapLqipLoad;
}
/** The placeholder chunk in the browser's idle time (a short timeout where requestIdleCallback is missing). */
export function primeMapLqipWhenIdle(): void {
  if (mapLqip || mapLqipLoad) return;
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
  if (typeof idle === 'function') idle(() => { void primeMapLqip(); }, { timeout: 4000 });
  else setTimeout(() => { void primeMapLqip(); }, 1500);
}

/** The windows the direction's composition is for (bui01/src/pages/10-battle-load.html, 1440 x 900): laptop and desktop
 *  widths, 720 px and taller, with persistent panels; smaller windows keep the compact sheets (responsiveSurfaces.css). */
const WIDE = "body:is([data-cot-width='laptop'],[data-cot-width='desktop']):is([data-cot-height='standard'],[data-cot-height='tall'])"
  + ":not([data-cot-panels='overlay'])";
/** A side this size or smaller shows a hero card a tank on the wide layouts (the direction's seven a side). */
const CARD_TEAM_MAX = 7;
/** The progress's steps (the direction's five). */
const PROGRESS_STEPS = 5;

const CSS = `
.cot-bl{position:fixed;inset:0;z-index:150;display:none;place-items:center;
  --bl-edge:clamp(18px,4vw,64px);
  font-family:${FONT_STACK};color:var(--ink-1);-webkit-user-select:none;user-select:none;
  background:var(--surface-scene);opacity:1;overflow:hidden;isolation:isolate;}
.cot-bl.on{display:grid;opacity:1;}
.cot-bl.leaving{display:grid;opacity:0;transition:opacity var(--cot-motion-base) var(--cot-ease-out);}
.cot-bl *{box-sizing:border-box;margin:0;padding:0;}
/* Full-bleed map art under the direction's grade (bui01/src/pages/10-battle-load.html .grade): dark from the left for
   the battlefield's name and from the floor for the rosters, the battlefield itself clear in the upper right. */
.cot-bl .hero{position:absolute;inset:0;z-index:-1;overflow:hidden;}
.cot-bl .hero .art{position:absolute;inset:0;background-size:cover;background-position:center;
  background-image:${mapArtGradient(undefined)};}
/* 2026-10-12/13 (the perf stream; owner: "loading into some maps still shows a black screen at first"): .art carries
   the map's own mid-tones (its art's band colours) and, once the lazy placeholder chunk is resident, the map's blurred
   48x27 picture from the first frame; the art is decoded before it is shown over it, so an uncached 1.5 MB hero never
   leaves the screen near-black while it downloads; the picker thumb and the 1280 px card stand in until it is ready. */
.cot-bl .hero .art-img{position:absolute;inset:0;background-size:cover;background-position:center;opacity:0;
  transition:opacity var(--dur-fast) var(--ease-enter);}
.cot-bl .hero .art-img.ready{opacity:1;}
.cot-bl .hero .scrim{position:absolute;inset:0;background:var(--battle-load-grade);}
.cot-bl .lb{display:none;}
.cot-bl .briefing{position:relative;z-index:1;width:min(1180px,calc(100vw - (var(--bl-edge) * 2)));
  height:min(800px,88dvh);min-height:520px;
  display:grid;grid-template-rows:auto minmax(0,1fr) auto;grid-template-columns:minmax(0,1fr);align-items:stretch;
  padding:clamp(20px,3vh,34px) clamp(18px,2.5vw,34px) clamp(16px,2.2vh,26px);
  background:transparent;border:0;box-shadow:none;}
/* The battlefield's name, its first word solid and the rest hollow (the direction's title), over the rules: the mode
   and the sides. */
.cot-bl .cap{display:flex;flex-direction:column;align-items:center;gap:12px;padding-bottom:clamp(15px,2.5vh,27px);
  min-width:0;text-align:center;}
.cot-bl .mapname{max-width:100%;font:700 clamp(30px,4.1vw,52px)/.9 var(--font-ui);text-transform:uppercase;color:var(--ink-1);}
.cot-bl .mapname .ho{color:transparent;-webkit-text-stroke:var(--hollow-stroke) var(--hollow-ink);}
:lang(zh-CN) .cot-bl .mapname .ho{color:var(--ink-1);-webkit-text-stroke:0;}
.cot-bl .rules{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;}
.cot-bl .rules .cot-c-chip{height:34px;padding:0 12px;background:var(--battle-chip-plate);color:var(--ink-1);}
.cot-bl .rules .cot-c-chip[hidden]{display:none;}
.cot-bl .rules .gi{display:flex;color:var(--accent);}
/* The tip and the battlefield's plan: the wide layouts' upper right (below). */
.cot-bl .side{display:none;}
/* --- rosters ------------------------------------------------------------- */
.cot-bl .teams{min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 54px minmax(0,1fr);
  align-items:stretch;gap:clamp(16px,3vw,42px);}
.cot-bl .team{--bl-count:1;--bl-row-height:30px;--bl-row-gap:3px;--bl-row-inset:7px;--bl-heading:28px;min-width:0;min-height:0;align-self:center;
  height:min(100%,calc(var(--bl-count) * (var(--bl-row-height) + var(--bl-row-gap)) + var(--bl-heading) + var(--bl-row-inset) - var(--bl-row-gap)));
  display:grid;grid-template-rows:auto minmax(0,1fr);}
.cot-bl .thead{height:var(--bl-heading);display:flex;align-items:center;gap:9px;padding:0 8px 8px;
  font:600 var(--fs-12)/1 var(--font-ui);letter-spacing:var(--track-label-s);text-transform:uppercase;}
.cot-bl .thead .flags{display:inline-flex;align-items:center;gap:4px;}
.cot-bl .team.ally .thead{color:var(--text-own);border-bottom:1px solid var(--team-own);}
.cot-bl .team.foe .thead{color:var(--text-enemy);border-bottom:1px solid var(--team-enemy);flex-direction:row-reverse;}
.cot-bl .thead .n{margin-left:auto;color:var(--ink-3);}
.cot-bl .team.foe .thead .n{margin-left:0;margin-right:auto;}
/* Center each roster as a block. Rows never stretch when a team is small.
   Fixed silhouette boxes keep asset loading from moving the rows. */
.cot-bl .rows{display:grid;grid-template-rows:repeat(var(--bl-count),var(--bl-row-height));align-content:start;
  min-height:0;gap:var(--bl-row-gap);padding-top:var(--bl-row-inset);overflow-y:auto;overscroll-behavior:contain;
  scrollbar-width:none;}
.cot-bl .rows:focus-visible{outline:1px solid var(--accent);outline-offset:-1px}
.cot-bl .rows::-webkit-scrollbar{display:none}
.cot-bl .row{position:relative;display:flex;align-items:center;gap:10px;min-height:0;padding:0 8px;border-radius:var(--r1);
  background:var(--fill-quiet);outline:1px solid var(--line-1);outline-offset:-1px;}
.cot-bl .team.foe .row{flex-direction:row-reverse;}
.cot-bl .team.ally .row{border-left:2px solid var(--team-own);}
.cot-bl .team.foe .row{border-right:2px solid var(--team-enemy);}
.cot-bl .row.slot{background:var(--fill-faint);}
.cot-bl .row.me{background:var(--accent-wash);border-left-color:var(--accent);box-shadow:var(--ring-accent);outline:0;}
.cot-bl .row .tier{flex:0 0 26px;text-align:center;font:500 var(--fs-11)/1 var(--font-mono);color:var(--accent-hi);}
.cot-bl .row .sil{flex:0 0 52px;height:100%;max-height:24px;background-repeat:no-repeat;
  background-position:center;background-size:contain;}
.cot-bl .team.foe .row .sil{transform:scaleX(-1);}
.cot-bl .row .nm{flex:1 1 auto;min-width:0;font:600 var(--fs-13)/1.2 var(--font-ui);color:var(--ink-1);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cot-bl .team.foe .row .nm{text-align:right;}
.cot-bl .row.me .nm{color:var(--accent-hi);}
.cot-bl .vs{display:grid;place-items:center;justify-self:center;align-self:center;
  font:700 var(--fs-28)/1 var(--font-ui);color:var(--accent);}
/* --- footer: the stage, the five-step progress, the countdown ------------- */
.cot-bl .foot{padding-top:clamp(15px,2.5vh,24px);}
.cot-bl .fmeta{display:flex;align-items:center;gap:16px;}
.cot-bl .fstage{flex:0 1 auto;min-width:0;display:flex;align-items:center;gap:8px;font:500 var(--fs-14)/1.3 var(--font-body);
  color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cot-bl .fstage .gi{display:flex;flex:none;color:var(--accent);}
.cot-bl .fbar{flex:1 1 auto;min-width:80px;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;}
.cot-bl .fbar i{position:relative;display:block;height:4px;overflow:hidden;background:var(--fill-scale);}
.cot-bl .fbar i b{position:absolute;inset:0;background:var(--ink-1);transform:scaleX(0);transform-origin:left center;
  transition:transform var(--dur-fast) linear;}
.cot-bl .fbar i.c b{background:var(--accent);}
.cot-bl.on .fbar i b{will-change:transform;}
.cot-bl .fpct{flex:none;min-width:4ch;text-align:right;font:500 var(--fs-13)/1 var(--font-mono);color:var(--ink-3);}
.cot-bl .count{margin-top:13px;text-align:center;font:700 var(--fs-15)/1 var(--font-ui);line-height:30px;
  letter-spacing:var(--track-label);text-transform:uppercase;color:var(--ink-1);height:30px;}
.cot-bl .count b{color:var(--accent-hi);font-size:var(--fs-24);}
.cot-bl .tip{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:var(--r1);
  background:var(--battle-tip-plate);box-shadow:var(--e1);font:400 var(--fs-14)/1.4 var(--font-body);color:var(--ink-2);}
.cot-bl .tip .gi{display:flex;flex:none;color:var(--accent);}
/* --- the wide layouts: the direction's composition ------------------------
   The name and its rules top left, the tip and the battlefield's plan top right, the rosters over the floor (a hero
   card a tank while a side has seven or fewer), the progress under them, letterboxed. */
${WIDE} .cot-bl{place-items:stretch;}
${WIDE} .cot-bl .lb{display:block;position:absolute;left:0;right:0;height:5.5vh;background:var(--surface-scene);}
${WIDE} .cot-bl .lb.t{top:0}${WIDE} .cot-bl .lb.b{bottom:0}
${WIDE} .cot-bl .briefing{width:100%;height:100%;min-height:0;grid-template-columns:minmax(0,1fr) minmax(0,360px);
  grid-template-rows:auto minmax(0,1fr) auto auto;column-gap:48px;padding:14vh 64px calc(5.5vh + 22px);}
${WIDE} .cot-bl .cap{grid-column:1;grid-row:1;align-items:flex-start;text-align:left;gap:16px;padding:0;}
${WIDE} .cot-bl .mapname{font-size:clamp(64px,7vw,128px);line-height:.84;}
${WIDE} .cot-bl .rules{justify-content:flex-start;}
${WIDE} .cot-bl .side{grid-column:2;grid-row:1 / span 2;display:flex;flex-direction:column;align-items:stretch;gap:12px;min-height:0;}
${WIDE} .cot-bl .map{align-self:flex-end;width:250px;padding:8px;border-radius:var(--r1);background:var(--hud-plate);box-shadow:var(--e2);}
${WIDE} .cot-bl .map[hidden]{display:none;}
${WIDE} .cot-bl .map img{display:block;width:234px;height:234px;object-fit:cover;box-shadow:var(--ring-3);}
${WIDE} .cot-bl .teams{grid-column:1 / -1;grid-row:3;align-items:end;gap:28px;}
${WIDE} .cot-bl .foot{grid-column:1 / -1;grid-row:4;padding-top:24px;}
${WIDE} .cot-bl .count{position:absolute;left:0;right:0;top:calc(100% + 1.2vh);margin:0;}
${WIDE} .cot-bl .foot{position:relative;}
${WIDE} .cot-bl .team.cards{--bl-row-height:104px;--bl-row-gap:6px;--bl-heading:0px;--bl-row-inset:0px;height:auto;align-self:end;}
${WIDE} .cot-bl .team.cards .thead{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);}
${WIDE} .cot-bl .team.cards .rows{grid-template-rows:var(--bl-row-height);grid-template-columns:repeat(var(--bl-count),minmax(0,1fr));
  gap:var(--bl-row-gap);overflow:visible;}
${WIDE} .cot-bl .vs{align-self:end;padding-bottom:34px;}
/* A hero card (the live hero card's layers, heroCard.ts): the nation's flag and the vehicle over the card's ground, the
   vehicle's name in the band under it, the side's ink along the floor, the player's card ringed in the accent. */
${WIDE} .cot-bl .team.cards .row.card{display:block;padding:0;overflow:hidden;isolation:isolate;container-type:size;background:var(--surface-raised);
  --hc-band:28px;--hc-share:0.7;--hc-hshare:0.64;--hc-cxr:0.51;}
${WIDE} .cot-bl .team.ally.cards .row.card{border:0;border-bottom:2px solid var(--team-own);}
${WIDE} .cot-bl .team.foe.cards .row.card{border:0;border-bottom:2px solid var(--team-enemy);}
${WIDE} .cot-bl .team.cards .row.card.me{box-shadow:var(--battle-card-me);}
${WIDE} .cot-bl .team.cards .row.card .sil{position:absolute;left:10%;right:10%;top:22%;height:36%;max-height:none;opacity:.5;}
${WIDE} .cot-bl .team.cards .row.card.cot-hc .sil{display:none;}
${WIDE} .cot-bl .team.cards .row.card::after{content:'';position:absolute;z-index:var(--battle-z-card-fade);left:0;right:0;bottom:0;height:calc(var(--hc-band) + 8px);
  background:var(--media-fade);pointer-events:none;}
${WIDE} .cot-bl .team.cards .row.card .nm{position:absolute;z-index:var(--battle-z-card-text);left:8px;right:8px;bottom:8px;font:600 var(--fs-11)/1.1 var(--font-ui);
  text-transform:uppercase;white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;text-align:left;}
${WIDE} .cot-bl .team.foe.cards .row.card .nm{text-align:left;}
${WIDE} .cot-bl .team.cards .row.card .tier{position:absolute;z-index:var(--battle-z-card-text);top:6px;left:6px;flex:none;padding:2px 4px;border-radius:var(--r1);
  background:var(--glyph-plate);}
/* the hero layers show on the cards alone (a window that narrows to the compact sheets keeps the rows plain) */
.cot-bl .row :is(.hc-flag,.hc-tank){display:none;}
${WIDE} .cot-bl .team.cards .row :is(.hc-flag,.hc-tank){display:block;}
@media (prefers-reduced-motion:reduce){.cot-bl.leaving,.cot-bl .fbar i b{transition-duration:1ms;}}
`;

const BATTLE_TIPS: ReadonlyArray<readonly [string, string]> = [
  ['battleLoad.tip.opening.heading', 'battleLoad.tip.opening.body'],
  ['battleLoad.tip.trade.heading', 'battleLoad.tip.trade.body'],
  ['battleLoad.tip.team.heading', 'battleLoad.tip.team.body'],
  ['battleLoad.tip.minimap.heading', 'battleLoad.tip.minimap.body'],
];

/** Resolve a BATTLE_TIPS entry into its localized heading and body. */
function localizedTip(
  entry: readonly [string, string],
): readonly [string, string] {
  return [t(entry[0]), t(entry[1])];
}

export interface BattleLoadRosterRow {
  readonly id: string;
  readonly kind?: 'aircraft';
  readonly tier?: string;
  readonly name?: string;
  readonly isPlayer?: boolean;
}

interface BattleLoadInfo {
  readonly mapName: string;
  readonly thumb?: string;
  readonly biome?: string;
  readonly mode?: string;
  readonly allies: readonly BattleLoadRosterRow[];
  readonly enemies: readonly BattleLoadRosterRow[];
  /** Rows each empty team sheet holds open until rosters() fills it (a solo entry: the default split). */
  readonly slots?: number;
}

/**
 * The default solo split (src/sim/matchRuleset.ts: the player and six allies against seven): a solo entry reserves this
 * many rows per side from its first frame, so the sheets fill in place instead of growing when the roster arrives
 * (2026-10-22, nav-perf-240: the sheets grew from one row to seven and moved up 99 px about 20 s into the load).
 */
export const PENDING_ROSTER_SLOTS = 7;

/** The battlefield a pending entry is about to load, known before its loading owner is imported. */
export interface PendingBattlefield {
  readonly mapId: string;
  readonly mapName?: string;
  readonly thumb?: string;
}

/**
 * TEAM NATIONS (gameplay-modes-228): each side's country (a spec nation for its flag) and the countries that filled it
 * ("+UK"), or null for RANDOM / no country.
 */
interface BattleLoadTeams {
  readonly allied: string | null;
  readonly enemy: string | null;
  readonly alliedFills: readonly string[];
  readonly enemyFills: readonly string[];
}

export interface BattleLoadScreen {
  readonly root: HTMLElement;
  readonly visible: boolean;
  readonly covering: boolean;
  showPending(map?: string | PendingBattlefield | null): void;
  show(info: BattleLoadInfo): void;
  rosters(
    allies: readonly BattleLoadRosterRow[],
    enemies: readonly BattleLoadRosterRow[],
    teams?: BattleLoadTeams | null,
  ): void;
  progress(fraction: number, label?: string): void;
  countdown(seconds: number): void;
  hide(): Promise<void>;
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Battle loading screen is missing ${selector}`);
  return element;
}

/**
 * Create the pre-battle loading screen.
 * @returns {{show:(info:object)=>void, rosters:(allies:Array,enemies:Array)=>void,
 *   progress:(f:number,label?:string)=>void,
 *   countdown:(n:number)=>void, hide:()=>Promise<void>, readonly visible:boolean,
 *   readonly covering:boolean,
 *   root:HTMLElement}}
 */
export function createBattleLoadScreen(): BattleLoadScreen {
  ensureStyle('cot-bl-style', CSS, 'surfaces');
  const root = document.createElement('div');
  root.className = 'cot-bl';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-label', t('battleLoad.preparing'));
  root.innerHTML =
    `<div class="hero" aria-hidden="true"><div class="art none"></div><div class="art-img"></div><div class="scrim"></div></div>` +
    `<i class="lb t" aria-hidden="true"></i><i class="lb b" aria-hidden="true"></i>` +
    `<main class="briefing"><div class="cap"><h1 class="mapname"></h1>` +
    `<div class="rules"><span class="cot-c-chip"><span class="kicker">${t('battleLoad.kicker')}</span></span>` +
    `<span class="cot-c-chip sides" hidden><span class="gi">${uiIconSVG('team', 16)}</span><span class="sv"></span></span></div></div>` +
    `<div class="side"><div class="tip"></div><div class="map" hidden><img alt="" decoding="async" draggable="false"></div></div>` +
    `<div class="teams">` +
    `<div class="team ally"><div class="thead"><span>${t('battleLoad.allies')}</span><span class="flags" aria-hidden="true"></span><span class="n">0</span></div>` +
    `<div class="rows"></div></div>` +
    `<div class="vs">${t('battleLoad.vs')}</div>` +
    `<div class="team foe"><div class="thead"><span>${t('battleLoad.enemies')}</span><span class="flags" aria-hidden="true"></span><span class="n">0</span></div>` +
    `<div class="rows"></div></div>` +
    `</div>` +
    `<div class="foot" aria-live="polite"><div class="fmeta">` +
    `<div class="fstage"><span class="gi">${uiIconSVG('map', 16)}</span><span class="st">${t('battleLoad.loading')}</span></div>` +
    `<div class="fbar" role="progressbar" aria-label="${t('battleLoad.loading')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">` +
    `${'<i><b></b></i>'.repeat(PROGRESS_STEPS)}</div><div class="fpct num">0%</div></div>` +
    `<div class="count"></div></div></main>`;
  document.body.appendChild(root);

  const artEl = requiredElement<HTMLDivElement>(root, '.art');
  const artImgEl = requiredElement<HTMLDivElement>(root, '.art-img');
  // the map art in flight: a later show() supersedes it; a sharper image replaces a softer one, never the reverse
  let artToken = 0;
  let artRank = 0;
  const showArt = (url: string, rank: number): void => {
    if (rank <= artRank) return;
    artRank = rank;
    artImgEl.style.backgroundImage = `url(${url})`;
    artImgEl.classList.add('ready');
  };
  /** The map's gradient and blurred placeholder at once, then the sharpest of its picker thumb (cached by the Garage's
   * battlefield list), its 1280 px card and its hero that has decoded, each replacing the softer one. */
  const stageArt = (thumb: string | undefined, biome: string | undefined): void => {
    const token = ++artToken;
    artRank = 0;
    artEl.className = `art ${biome || 'none'}`;
    const placeholder = biome && mapLqip && Object.hasOwn(mapLqip, biome) ? mapLqip[biome] : '';
    const gradient = mapArtGradient(biome);
    artEl.style.backgroundImage = placeholder ? `url(${placeholder}),${gradient}` : gradient;
    if (!mapLqip) void primeMapLqip();
    artImgEl.classList.remove('ready');
    artImgEl.style.backgroundImage = '';
    const final = thumb || '';
    if (!final) return;
    const card = biome ? mapCardFor(biome) : null;
    const pick = biome ? MAP_THUMBS[biome as keyof typeof MAP_THUMBS] ?? '' : '';
    const steps: [string, number][] = [[final, 3]];
    if (card && card !== final) steps.push([card, 2]);
    if (pick && pick !== final && pick !== card) steps.push([pick, 1]);
    for (const [url, rank] of steps) {
      if (isImagePreloaded(url)) { showArt(url, rank); continue; }
      void preloadImage(url, { priority: rank === 3 ? 'high' : 'auto' }).then((loaded) => {
        if (loaded && token === artToken) showArt(loaded, rank);
      });
    }
  };
  const nameEl = requiredElement<HTMLHeadingElement>(root, '.mapname');
  const sidesChip = requiredElement<HTMLSpanElement>(root, '.rules .sides');
  const sidesEl = requiredElement<HTMLSpanElement>(root, '.rules .sv');
  const mapEl = requiredElement<HTMLDivElement>(root, '.map');
  const mapImg = requiredElement<HTMLImageElement>(root, '.map img');
  /** The battlefield's name: its first word solid, the rest hollow (the direction's title; zh-CN stays solid). */
  const setMapName = (name: string): void => {
    const space = name.indexOf(' ');
    nameEl.textContent = space < 0 ? name : name.slice(0, space + 1);
    if (space < 0) return;
    const rest = document.createElement('span');
    rest.className = 'ho';
    rest.textContent = name.slice(space + 1);
    nameEl.append(rest);
  };
  const kickEl = requiredElement<HTMLDivElement>(root, '.kicker');
  const allyTeam = requiredElement<HTMLDivElement>(root, '.team.ally');
  const foeTeam = requiredElement<HTMLDivElement>(root, '.team.foe');
  const allyRows = requiredElement<HTMLDivElement>(root, '.team.ally .rows');
  const foeRows = requiredElement<HTMLDivElement>(root, '.team.foe .rows');
  for (const [list, label] of [[allyRows, t('battleLoad.allies')], [foeRows, t('battleLoad.enemies')]] as const) {
    list.tabIndex = 0;
    list.setAttribute('role', 'region');
    list.setAttribute('aria-label', label);
  }
  const allyN = requiredElement<HTMLSpanElement>(root, '.team.ally .n');
  const foeN = requiredElement<HTMLSpanElement>(root, '.team.foe .n');
  const stageEl = requiredElement<HTMLSpanElement>(root, '.fstage .st');
  const pctEl = requiredElement<HTMLDivElement>(root, '.fpct');
  const progressEl = requiredElement<HTMLDivElement>(root, '.fbar');
  const stepEls = Array.from({ length: PROGRESS_STEPS }, (_, step) => requiredElement<HTMLElement>(root, `.fbar i:nth-child(${step + 1})`));
  const stepFills = stepEls.map((_, step) => requiredElement<HTMLElement>(root, `.fbar i:nth-child(${step + 1}) b`));
  const countEl = requiredElement<HTMLDivElement>(root, '.count');
  const tipEl = requiredElement<HTMLDivElement>(root, '.tip');

  /** The live hero card's layers (heroCard.ts, its lazy chunk and sheet, the Garage's): once per page, null where they
   *  cannot load (a Node receipt, a blocked chunk), and the cards keep their silhouettes. */
  let heroCards: Promise<typeof import('./heroCard.ts') | null> | null = null;
  let cardsPass = 0;
  function decorateCards(host: HTMLElement, cards: readonly (readonly [HTMLElement, string])[]): void {
    const pass = String(++cardsPass);
    host.dataset.cardsPass = pass;
    if (!cards.length) return;
    heroCards ??= Promise.all([import('./heroCard.ts'), import('./heroCard.css')]).then(([module]) => module, () => null);
    void heroCards.then(async (hero) => {
      const manifest = hero ? await hero.loadHeroManifest() : null;
      if (!hero || !manifest || host.dataset.cardsPass !== pass) return; // a later roster took this side
      host.style.setProperty('--hc-flag-mask', hero.heroCardFlagMask(manifest));
      for (const [card, id] of cards) hero.decorateHeroCard(card, id, manifest, { tankSizes: '120px', flagSizes: '140px' });
    });
  }

  let visible = false;
  // `visible` is the requested open state and flips false when hide() starts.
  // `covering` follows the actual composited surface through its exit fade so
  // battle input cannot steer a camera that is only partly exposed yet.
  let covering = false;
  let shownFill = '';
  const shownSteps: string[] = [];
  let shownPercent = -1;
  let shownStage = '';

  const allyFlags = requiredElement<HTMLSpanElement>(root, '.team.ally .flags');
  const foeFlags = requiredElement<HTMLSpanElement>(root, '.team.foe .flags');
  /**
   * A side's country flag and its fills, small (owner UI rules: flags over words). The flag module (its SVG assets) is
   * the garage's, already loaded in the browser; it is imported on demand so this screen's module stays Node-loadable.
   */
  let flagsPass = 0;
  function fillFlags(host: HTMLElement, nation: string | null, fills: readonly string[]): void {
    const pass = String(++flagsPass);
    host.dataset.flagsPass = pass;
    if (!nation) { host.innerHTML = ''; return; }
    void import('./flags.ts').then(({ flagIconHTML }) => {
      if (host.dataset.flagsPass !== pass) return; // a later roster took this side
      host.innerHTML = flagIconHTML(nation, 18, 13) + fills.map((fill) => flagIconHTML(fill, 14, 10)).join('');
    });
  }

  function fillTeam(
    host: HTMLElement,
    countEl2: HTMLElement,
    team: HTMLElement,
    rows: readonly BattleLoadRosterRow[] = [],
    slots = 0,
  ): void {
    const reserved = rows.length ? 0 : Math.max(0, Math.floor(slots));
    team.style.setProperty('--bl-count', String(Math.max(1, rows.length, reserved)));
    // a side of seven or fewer shows a hero card a tank where the layout is wide (CSS), the rows otherwise
    const cards = rows.length > 0 && rows.length <= CARD_TEAM_MAX;
    if (cards) team.classList.add('cards'); else team.classList.remove('cards');
    const decorated: [HTMLElement, string][] = [];
    host.textContent = '';
    for (let slot = 0; slot < reserved; slot += 1) {
      const el = document.createElement('div');
      el.className = 'row slot';
      el.setAttribute('aria-hidden', 'true');
      host.appendChild(el);
    }
    for (const r of rows) {
      const el = document.createElement('div');
      el.className = 'row' + (cards ? ' card' : '') + (r.isPlayer ? ' me' : '');
      const tier = document.createElement('div');
      tier.className = 'tier';
      tier.textContent = r.kind === 'aircraft' ? '' : r.tier || tierNumeral(r.id);
      const sil = document.createElement('div');
      sil.className = 'sil';
      // (ac130-fx-228) an aircraft row: the AC-130's one identity (its name and icon), as every kill surface shows it
      const aircraft = r.kind === 'aircraft' ? killSourceIdentity('ac130') : null;
      if (aircraft) {
        sil.innerHTML = uiIconSVG(aircraft.icon, 25);
        sil.style.display = 'grid'; sil.style.placeItems = 'center';
      } else sil.style.backgroundImage = `url(${iconUrl(r.id, 'side_silhouette')})`;
      const nm = document.createElement('div');
      nm.className = 'nm';
      nm.textContent = aircraft?.label || r.name || r.id;
      el.append(tier, sil, nm);
      host.appendChild(el);
      if (cards && !aircraft) decorated.push([el, r.id]);
    }
    countEl2.textContent = reserved ? '' : String(rows.length);
    decorateCards(host, decorated);
  }

  /** The sides on the rules row ("7 v 7"), once both are known. */
  function showSides(allies: number, enemies: number): void {
    sidesChip.hidden = !allies && !enemies;
    sidesEl.textContent = t('battleLoad.sides', { allies, enemies });
  }

  const api: BattleLoadScreen = {
    root,
    get visible() { return visible; },
    get covering() { return covering; },

    /** Own the existing opaque surface before a cold loading-owner import; a chosen battlefield's name, tones,
     * placeholder and art are up from this first frame (2026-10-13: a slow first entry read "BATTLEFIELD" for ~1.8 s
     * while the loading owner downloaded). */
    showPending(map?: string | PendingBattlefield | null) {
      const pending = typeof map === 'string' ? { mapId: map } : map ?? null;
      const chosen: PendingBattlefield | null = pending?.mapId && pending.mapId !== 'random' ? pending : null;
      api.show({
        mapName: chosen?.mapName ?? '',
        mode: t('battleLoad.kicker'),
        ...(chosen ? { biome: chosen.mapId } : {}),
        ...(chosen?.thumb ? { thumb: chosen.thumb } : {}),
        allies: [],
        enemies: [],
        slots: PENDING_ROSTER_SLOTS,
      });
    },

    /**
     * Stage and show the screen.
     * @param {{mapName:string, thumb?:string, biome?:string,
     *   mode?:string, allies:Array, enemies:Array}} info
     */
    show(info: BattleLoadInfo) {
      setMapName(info.mapName || t('battleLoad.fallbackMapName'));
      if (info.mode) kickEl.textContent = info.mode;
      stageArt(info.thumb, info.biome);
      // the battlefield's own plan (its baked tactical map, which the battle's minimap loads next)
      mapEl.hidden = !info.biome;
      if (info.biome) mapImg.src = minimapAssetUrl(info.biome);
      fillTeam(allyRows, allyN, allyTeam, info.allies, info.slots);
      fillTeam(foeRows, foeN, foeTeam, info.enemies, info.slots);
      showSides(info.allies.length, info.enemies.length);
      // the tip's body alone (less text): its glyph says what it is
      const [, body] = localizedTip(
        BATTLE_TIPS[Math.floor(Math.random() * BATTLE_TIPS.length)],
      );
      tipEl.innerHTML = `<span class="gi">${uiIconSVG('shield', 22)}</span><span>${body}</span>`;
      countEl.textContent = '';
      api.progress(0, t('battleLoad.loading'));
      visible = true;
      covering = true;
      // Entry is a safety cover, not an animation: it must own the very next
      // composited frame on slower guests. Only the exit is allowed to fade.
      root.classList.remove('leaving');
      root.style.display = '';
      root.classList.add('on');
    },

    /** Update the team sheets without resetting the progress bar or tip. */
    rosters(
      allies: readonly BattleLoadRosterRow[],
      enemies: readonly BattleLoadRosterRow[],
      teams: BattleLoadTeams | null = null,
    ) {
      fillTeam(allyRows, allyN, allyTeam, allies);
      fillTeam(foeRows, foeN, foeTeam, enemies);
      showSides(allies.length, enemies.length);
      fillFlags(allyFlags, teams?.allied ?? null, teams?.alliedFills ?? []);
      fillFlags(foeFlags, teams?.enemy ?? null, teams?.enemyFills ?? []);
    },

    /**
     * Real load progress.
     * @param {number} f 0..1
     * @param {string} [label] stage name
     */
    progress(f: number, label?: string) {
      const v = Number.isNaN(f) ? 0 : Math.max(0, Math.min(1, f));
      const fill = v.toFixed(3);
      const percent = Math.round(v * 100);
      // Progress is event-driven; tween the fill without animating layout or
      // repeatedly replacing unchanged live-region text at fine checkpoints.
      if (fill !== shownFill) {
        shownFill = fill;
        // the direction's five steps: each fills its fifth, the step in progress in the accent
        for (let step = 0; step < PROGRESS_STEPS; step++) {
          const share = Math.max(0, Math.min(1, v * PROGRESS_STEPS - step));
          const scale = `scaleX(${share.toFixed(3)})`;
          if (shownSteps[step] === scale) continue;
          shownSteps[step] = scale;
          stepFills[step].style.transform = scale;
          if (share > 0 && share < 1) stepEls[step].classList.add('c'); else stepEls[step].classList.remove('c');
        }
      }
      if (percent !== shownPercent) {
        shownPercent = percent;
        pctEl.textContent = `${percent}%`;
        progressEl.setAttribute('aria-valuenow', String(percent));
      }
      if (label) {
        const stage = translateStageLabel(label);
        if (stage !== shownStage) {
          shownStage = stage;
          stageEl.textContent = stage;
        }
      }
    },

    /** Countdown line. @param {number} n seconds left (0 clears to "GO") */
    countdown(n: number) {
      countEl.innerHTML = n > 0
        ? t('battleLoad.countdown', { n }) + ''
        : `<b>${t('battleLoad.go')}</b>`;
    },

    /** Fade out, then drop out of layout. */
    hide() {
      if (!visible) return Promise.resolve();
      visible = false;
      // hold display through the opacity transition (.on carries display:flex,
      // so removing it alone would cut the fade to a hard pop)
      root.classList.add('leaving');
      root.classList.remove('on');
      return new Promise<void>((resolve) => setTimeout(() => {
        if (!visible) {
          root.classList.remove('leaving');
          covering = false;
        }
        resolve();
      }, 230));
    },
  };
  return api;
}
