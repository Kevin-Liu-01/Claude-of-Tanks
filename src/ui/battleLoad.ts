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

import { FONT_STACK } from './fonts.ts';
import { iconUrl } from './icons.ts';
import { uiIconSVG } from './uiIcons.ts';
import { tierNumeral } from '../techTree/tiers.ts';
import { t } from './i18n.ts';
import { killSourceIdentity } from './killSourceIdentity.ts';
import { ensureStyle } from './styleLayers.ts';
import { isImagePreloaded, preloadImage } from './imagePreload.ts';
import { mapCardFor } from './mapBackdrop.ts';
import { MAP_THUMBS } from './mapThumbs.ts';
import { MAP_ART_TONES, MAP_ART_TONE_DEFAULT } from './mapArtTones.ts';
import { minimapAssetUrl } from './minimapAssetUrl.ts';
import { recordBattleLoad } from '../game/battleLoadEstimate.ts';
import { matchRulesetFor } from '../sim/matchRuleset.ts';
import { GAME_MODE_DEFINITIONS, normalizeGameMode } from '../sim/gameModeCatalog.ts';
import type { GameModeId } from '../sim/matchModes.ts';

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
  if ((mapLqip || mapLqipLoad) && isImagePreloaded(MARK_MOTION_URL)) return;
  const prime = (): void => { void primeMapLqip(); void preloadImage(MARK_MOTION_URL); };
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
  if (typeof idle === 'function') idle(prime, { timeout: 4000 });
  else setTimeout(prime, 1500);
}

// The living mark by the progress (brand-ui 245, the owner's commander rolling along): the brand's own animated master
// (tools/brand-marks.mjs writes public/brand/mark-motion.svg from brandMarkMotion.ts; its reduced-motion rule is inside),
// primed in idle time with the placeholders. As an image it adds no script: importing brandMarkMotion.ts, a lazy chunk
// that needs brandMark.ts, split the boot graph's shared brandMark chunk into one request more.
const MARK_MOTION_URL = '/brand/mark-motion.svg';
/** The mark's height in the foot (its slot is sized from it, so the mark never moves the stage line). */
const MARK_H = 22;

/** The windows the direction's composition is for (bui01/src/pages/10-battle-load.html, 1440 x 900): laptop and desktop
 *  widths, 720 px and taller, with persistent panels; smaller windows keep the compact sheets (responsiveSurfaces.css). */
const WIDE = "body:is([data-cot-width='laptop'],[data-cot-width='desktop']):is([data-cot-height='standard'],[data-cot-height='tall'])"
  + ":not([data-cot-panels='overlay'])";
/** The portrait phones and tablets of standard height and up: the battlefield's plan sits between the rules and the
 *  rosters, in the band the art leaves clear there (the tip stays a wide-layout part). */
const PORTRAIT = "body[data-cot-orientation='portrait']:is([data-cot-width='phone'],[data-cot-width='compact'],[data-cot-width='tablet'])"
  + ":is([data-cot-height='standard'],[data-cot-height='tall'])";
/** A side this size or smaller shows a hero card a tank on the wide layouts (the direction's seven a side). */
const CARD_TEAM_MAX = 7;
/** The narrowest window whose cards hold a 13-character driver and a one-line vehicle name. */
const CARD_MIN_WIDTH = 1680;
/** A name in Latin letters alone (battleLoad's .lat: Chinese's lifted label sizes are for Chinese text). */
const LATIN = /^[\x20-\x7e\u00a0-\u024f]+$/;
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
.cot-bl .hero .scrim{position:absolute;inset:0;background:var(--battle-load-grade-centred);}
/* (the grade follows the name: centred over the rosters, an even grade; the wide composition's, dark from the left under
   its name there: a left grade under a centred title left a dark band down a third of the screen, gauntlet r3) */
${WIDE} .cot-bl .hero .scrim{background:var(--battle-load-grade);}
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
.cot-bl .rules .cot-c-chip[hidden],.cot-bl .rules .gi:empty{display:none;}
/* (every chip's words one size, at the 12 px floor: the count's ran smaller than the mode's on the phones and the type
   scale set them 10 px at 900x700, gauntlet r4) */
.cot-bl .rules .cot-c-chip{font-size:max(var(--battle-fs-12),var(--fs-13));}
.cot-bl .rules .cot-c-chip :is(.kicker,.sv,.v){font-size:inherit;}
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
  font:600 max(var(--fs-floor-12),var(--fs-12))/1 var(--font-ui);letter-spacing:var(--track-label-s);text-transform:uppercase;text-shadow:var(--battle-text-halo);}
.cot-bl .thead .flags{display:inline-flex;align-items:center;gap:4px;}
.cot-bl .team.ally .thead{color:var(--text-own);}
.cot-bl .team.foe .thead{color:var(--text-enemy);flex-direction:row-reverse;}
/* (each side's name on a plate of its own, in its team's ink: red on the pale sky read 1.2:1 with a halo alone, and a
   team-coloured underline was a one-edge stripe, gauntlet r2) */
.cot-bl .team .thead{align-self:flex-start;width:max-content;height:auto;min-height:24px;padding:var(--s1) var(--s3);
  margin:var(--s2) 0 var(--s1);background:var(--hud-plate);border-radius:var(--r1);text-shadow:none;}
.cot-bl .team.foe .thead{margin-left:auto;}
/* the rules row says the sides ("7 v 7"): each heading's count stays for assistive technology alone */
.cot-bl .thead .n{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;}
/* Center each roster as a block. Rows never stretch when a team is small.
   Fixed silhouette boxes keep asset loading from moving the rows. */
/* (a long side's rows give up height, to 16 px, before any row leaves the panel: 14 a side sliced its 12th row at
   1024x600 and its 13th at 844x390, gauntlet r1 and r2) */
.cot-bl .rows{display:grid;grid-template-rows:repeat(var(--bl-count),minmax(min(16px,var(--bl-row-height)),var(--bl-row-height)));align-content:start;
  min-height:0;gap:var(--bl-row-gap);padding-top:var(--bl-row-inset);overflow-y:auto;overscroll-behavior:contain;
  scrollbar-width:none;}
.cot-bl .rows:focus-visible{outline:1px solid var(--accent);outline-offset:-1px}
.cot-bl .rows::-webkit-scrollbar{display:none}
/* A sheet row on the HUD's plate (the art behind it is busy): the side's ink on its outer edge, the nation's flag, the
   vehicle's own side render facing the other side, its name, and who drives it at the row's far end. */
.cot-bl .row{position:relative;display:flex;align-items:center;gap:8px;min-height:0;padding:0 8px;border-radius:var(--r1);
  background:var(--battle-chip-plate);box-shadow:var(--ring-1);}
.cot-bl .team.foe .row{flex-direction:row-reverse;}
.cot-bl .team.ally .row{border-left:2px solid var(--team-own);}
.cot-bl .team.foe .row{border-right:2px solid var(--team-enemy);}
.cot-bl .row.slot{background:var(--fill-faint);box-shadow:none;}
.cot-bl .row.me{background:var(--accent-wash);border-left-color:var(--accent);box-shadow:var(--ring-accent);}
/* the tier only where the battle mixes tiers (a rank every row shares says nothing) */
.cot-bl .row .tier{flex:0 0 22px;text-align:center;font:500 max(var(--fs-floor-11),var(--fs-11))/1 var(--font-mono);color:var(--accent-hi);}
.cot-bl:not(.mixed-tiers) .row .tier{display:none;}
.cot-bl .row .sil{flex:0 0 56px;height:100%;max-height:26px;background-repeat:no-repeat;
  background-image:var(--side-img),radial-gradient(closest-side,var(--fill-scale),transparent);
  background-size:118% auto,100% 100%;background-position:42% 50%,center;filter:brightness(1.18);}
.cot-bl .team.foe .row .sil{transform:scaleX(-1);}
/* a flag's box is held before flags.ts fills it (after the rows), so the name beside it never moves when it lands */
.cot-bl .row .fl{display:flex;flex:none;}.cot-bl .row .fl:empty:not([data-nation]){display:none;}
.cot-bl .row .fl[data-nation]{width:16px;height:12px;}
.cot-bl .row .fl .cot-flag{display:block;box-shadow:var(--flag-ring);}
.cot-bl .row .nm{flex:0 1 auto;min-width:0;font:600 max(var(--battle-fs-13),var(--fs-13))/1.2 var(--font-ui);color:var(--ink-1);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cot-bl .team.foe .row .nm{text-align:right;}
.cot-bl .row.me .nm{color:var(--accent-hi);}
/* (the driver in the UI face: the mono ran a callsign a third wider and was a third family, gauntlet r1) */
.cot-bl .row .cs{flex:0 4 auto;min-width:0;margin-left:auto;font:500 max(var(--fs-floor-11),var(--fs-11))/1.2 var(--font-ui);color:var(--ink-3);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cot-bl .team.foe .row .cs{margin-left:0;margin-right:auto;}
.cot-bl .row.me .cs{color:var(--accent-hi);}
/* (a Latin name keeps the Latin sizes in Chinese, whose lift is for Chinese labels: at 13 px "SteppeWolf" lost four letters
   on a card and "HullDown_Hank" its last two in a row, gauntlet r3; battleLoad.ts marks such a name .lat) */
:lang(zh-CN) .cot-bl .lat{--fs-11:calc(11px * var(--cot-type-scale));--fs-12:calc(12px * var(--cot-type-scale));
  --battle-fs-11:11px;--battle-fs-12:12px;--fs-floor-11:11px;--fs-floor-12:12px;}
.cot-bl .vs{display:grid;place-items:center;justify-self:center;align-self:center;
  font:700 var(--fs-28)/1 var(--font-ui);color:var(--accent);}
/* --- footer: the stage, the five-step progress, the countdown ------------- */
.cot-bl .foot{padding-top:clamp(15px,2.5vh,24px);}
.cot-bl .fmeta{display:flex;align-items:center;gap:16px;}
.cot-bl .fstage{flex:0 1 auto;min-width:0;display:flex;align-items:center;gap:8px;font:500 var(--fs-14)/1.3 var(--font-body);
  color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
/* the living mark rolls beside the stage while the battle builds, its slot sized before it lands (no shift) from the
   mark's own viewBox (brandMark.ts BRAND_TANK_VIEWBOX, 184 x 106: imported, its chunk would split off the boot graph) */
.cot-bl .fstage .mk{display:block;flex:none;height:${MARK_H}px;aspect-ratio:184 / 106;color:var(--ink-1);}
.cot-bl .fstage .mk img{display:block;width:100%;height:100%;}
.cot-bl .fbar{flex:1 1 auto;min-width:80px;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;}
.cot-bl .fbar i{position:relative;display:block;height:4px;overflow:hidden;background:var(--fill-scale);}
.cot-bl .fbar i b{position:absolute;inset:0;background:var(--ink-1);transform:scaleX(0);transform-origin:left center;
  transition:transform var(--dur-fast) linear;}
.cot-bl .fbar i.c b{background:var(--accent);}
.cot-bl.on .fbar i b{will-change:transform;}
.cot-bl .fpct{flex:none;min-width:4ch;text-align:right;font:500 max(var(--battle-fs-13),var(--fs-13))/1 var(--font-mono);color:var(--ink-3);}
.cot-bl .count{margin-top:13px;text-align:center;font:700 var(--fs-15)/1 var(--font-ui);line-height:30px;
  letter-spacing:var(--track-label);text-transform:uppercase;color:var(--ink-1);height:30px;}
.cot-bl .count b{color:var(--accent-hi);font-size:var(--fs-24);}
/* --- the wide layouts: the direction's composition ------------------------
   The name and its rules top left, the tip and the battlefield's plan top right, the rosters over the floor (a hero
   card a tank while a side has seven or fewer), the progress under them, letterboxed. */
${WIDE} .cot-bl{place-items:stretch;}
${WIDE} .cot-bl .lb{display:block;position:absolute;left:0;right:0;height:5.5vh;background:var(--surface-scene);}
${WIDE} .cot-bl .lb.t{top:0}${WIDE} .cot-bl .lb.b{bottom:0}
${WIDE} .cot-bl .briefing{width:100%;height:100%;min-height:0;grid-template-columns:minmax(0,1fr) minmax(0,360px);
  grid-template-rows:auto minmax(0,1fr) auto auto;column-gap:48px;padding:14vh 64px calc(5.5vh + 22px);}
${WIDE} .cot-bl .cap{grid-column:1;grid-row:1;align-items:flex-start;text-align:left;gap:16px;padding:0;}
/* (its 128 px at 1920, a third larger at 2560 with the rest of the composition, gauntlet r4) */
${WIDE} .cot-bl .mapname{font-size:clamp(64px,7vw,max(128px,6.67vw));line-height:.84;}
${WIDE} .cot-bl .rules{justify-content:flex-start;}
${WIDE} .cot-bl .side{grid-column:2;grid-row:1 / span 2;display:flex;flex-direction:column;align-items:stretch;gap:12px;min-height:0;}
${WIDE} .cot-bl .map{align-self:flex-end;width:250px;padding:8px;border-radius:var(--r1);background:var(--hud-plate);box-shadow:var(--e2);}
${WIDE} .cot-bl .map[hidden]{display:none;}
${WIDE} .cot-bl .map img{display:block;width:234px;height:234px;object-fit:cover;box-shadow:var(--ring-3);}
.cot-bl .map .mp{position:relative;display:block;}
.cot-bl .map .obj{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;}
${PORTRAIT} .cot-bl .briefing{grid-template-rows:auto auto minmax(0,1fr) auto;}
${PORTRAIT} .cot-bl .side{display:flex;justify-content:center;padding-bottom:clamp(12px,2.5vh,24px);}
${PORTRAIT} .cot-bl .map{width:min(58vw,260px);padding:6px;border-radius:var(--r1);background:var(--hud-plate);box-shadow:var(--e2);}
${PORTRAIT} .cot-bl .map[hidden]{display:none;}
${PORTRAIT} .cot-bl .map img{display:block;width:100%;aspect-ratio:1;object-fit:cover;box-shadow:var(--ring-3);}
/* a portrait sheet is narrow: two lines a row, the vehicle over its driver beside the flag and the render (the tier
   would take the name's room) */
${PORTRAIT} .cot-bl .team{--bl-row-height:36px;--bl-row-gap:4px;}
${PORTRAIT} .cot-bl .row{display:grid;grid-template-columns:auto auto minmax(0,1fr);grid-template-rows:auto auto;
  column-gap:6px;row-gap:2px;align-content:center;}
${PORTRAIT} .cot-bl .team.foe .row{grid-template-columns:minmax(0,1fr) auto auto;}
${PORTRAIT} .cot-bl .row .tier{display:none;}
${PORTRAIT} .cot-bl .row :is(.fl,.sil){grid-row:1 / span 2;}
${PORTRAIT} .cot-bl .row .sil{width:44px;height:22px;}
${PORTRAIT} .cot-bl .team.ally .row .fl{grid-column:1;}${PORTRAIT} .cot-bl .team.ally .row .sil{grid-column:2;}
${PORTRAIT} .cot-bl .team.ally .row :is(.nm,.cs){grid-column:3;}
${PORTRAIT} .cot-bl .team.foe .row .fl{grid-column:3;}${PORTRAIT} .cot-bl .team.foe .row .sil{grid-column:2;}
${PORTRAIT} .cot-bl .team.foe .row :is(.nm,.cs){grid-column:1;text-align:right;}
${PORTRAIT} .cot-bl .row .nm{grid-row:1;}${PORTRAIT} .cot-bl .row .cs{grid-row:2;margin:0;}
${WIDE} .cot-bl .teams{grid-column:1 / -1;grid-row:3;align-items:end;gap:28px;}
/* (a long side's sheets keep a reading width, centred on the VS: at 1920 and up a row ran 840-1160 px with the name and
   the driver 650-1000 px apart, gauntlet r2) */
/* (a long side's sheets span the page's gutters, the driver beside its vehicle rather than at the row's far end: pinned
   to 560 px they ended 83-830 px short of the right gutter, gauntlet r4; at the far end the two sat 650-1000 px apart,
   r2) */
${WIDE} .cot-bl .teams:not(:has(>.team.cards)){grid-template-columns:minmax(0,1fr) 54px minmax(0,1fr);}
${WIDE} .cot-bl .team:not(.cards) .row .cs{flex:0 1 auto;margin-left:var(--s4);}
${WIDE} .cot-bl .team.foe:not(.cards) .row .cs{margin-left:0;margin-right:var(--s4);}
${WIDE} .cot-bl .foot{grid-column:1 / -1;grid-row:4;padding-top:24px;}
${WIDE} .cot-bl .count{position:absolute;left:0;right:0;top:calc(100% + 1.2vh);margin:0;}
${WIDE} .cot-bl .foot{position:relative;}
${WIDE} .cot-bl .team.cards{--bl-row-height:118px;--bl-row-gap:6px;--bl-heading:0px;--bl-row-inset:0px;height:auto;align-self:end;}
${WIDE} .cot-bl .team.cards .thead{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);}
${WIDE} .cot-bl .team.cards .rows{grid-template-rows:var(--bl-row-height);grid-template-columns:repeat(var(--bl-count),minmax(0,1fr));
  gap:var(--bl-row-gap);overflow:visible;}
/* (beside the hero cards the VS stands level with their bands; beside the sheets of a long side it centres between them) */
${WIDE} .cot-bl .teams:has(>.team.cards) .vs{align-self:end;padding-bottom:34px;}
/* A hero card (the live hero card's layers, heroCard.ts): the nation's flag and the vehicle over the card's ground, the
   vehicle's name in the band under it, the side's ink along the floor, the player's card ringed in the accent. */
${WIDE} .cot-bl .team.cards .row.card{display:block;padding:0;overflow:hidden;isolation:isolate;container-type:size;background:var(--surface-raised);
  --hc-band:28px;--hc-share:0.7;--hc-hshare:0.64;--hc-cxr:0.51;}
${WIDE} .cot-bl .team.ally.cards .row.card{border:0;border-bottom:2px solid var(--team-own);}
${WIDE} .cot-bl .team.foe.cards .row.card{border:0;border-bottom:2px solid var(--team-enemy);}
${WIDE} .cot-bl .team.cards .row.card.me{box-shadow:var(--battle-card-me);}
${WIDE} .cot-bl .team.cards .row.card .sil{position:absolute;left:10%;right:10%;top:22%;height:36%;max-height:none;opacity:.5;
  background-image:var(--sil-img);background-size:contain;background-position:center;filter:none;}
/* a card's flag is its hero layer's (the sheet row's seat stays empty there) */
${WIDE} .cot-bl .team.cards .row.card .fl{display:none;}
${WIDE} .cot-bl .team.cards .row.card.cot-hc .sil{display:none;}
${WIDE} .cot-bl .team.cards .row.card::after{content:'';position:absolute;z-index:var(--battle-z-card-fade);left:0;right:0;bottom:0;height:calc(var(--hc-band) + 8px);
  background:var(--media-fade);pointer-events:none;}
${WIDE} .cot-bl .team.cards .row.card .nm{position:absolute;z-index:var(--battle-z-card-text);left:6px;right:6px;bottom:8px;font:600 max(var(--fs-floor-11),var(--fs-11))/1.1 var(--font-ui);
  white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;text-align:left;}
${WIDE} .cot-bl .team.foe.cards .row.card .nm{text-align:left;}
/* the driver under the vehicle's name: the band holds a two-line name and the driver, so the tank keeps clear of all
   three (gauntlet r1: "LEOPARD / 2A5" ran its first line over the tank) */
${WIDE} .cot-bl .team.cards .row.card.has-cs{--hc-band:54px;}
/* (a name hangs from the band's top, so a one-line and a two-line name start on one line, gauntlet r2) */
${WIDE} .cot-bl .team.cards .row.card.has-cs .nm{bottom:auto;top:calc(100% - var(--hc-band) + 4px);}
${WIDE} .cot-bl .team.cards .row.card .cs{position:absolute;z-index:var(--battle-z-card-text);left:6px;right:6px;bottom:7px;margin:0;
  font:500 max(var(--fs-floor-11),var(--fs-11))/1.2 var(--font-ui);color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
${WIDE} .cot-bl .team.cards .row.card.me .cs{color:var(--accent-hi);}
${WIDE} .cot-bl .team.cards .row.card .tier{position:absolute;z-index:var(--battle-z-card-text);top:6px;left:6px;flex:none;padding:2px 4px;border-radius:var(--r1);
  background:var(--glyph-plate);}
/* the hero layers show on the cards alone (a window that narrows to the compact sheets keeps the rows plain) */
.cot-bl .row :is(.hc-flag,.hc-tank){display:none;}
${WIDE} .cot-bl .team.cards .row :is(.hc-flag,.hc-tank){display:block;}
/* (the wide composition scales with the window past 1920, not the name alone: at 2560 the chips, tip, cards and progress
   kept their 1920 sizes under a name twice their scale, gauntlet r3; each step is its 1920 size at 1920 and below) */
${WIDE} .cot-bl .rules .cot-c-chip{height:clamp(34px,1.75vw,44px);padding:0 clamp(12px,.63vw,16px);font-size:clamp(13px,.66vw,16px);}
${WIDE} .cot-bl .briefing{grid-template-columns:minmax(0,1fr) minmax(0,clamp(360px,18.75vw,480px));column-gap:clamp(48px,2.5vw,64px);
  padding-inline:clamp(64px,3.4vw,88px);}
${WIDE} .cot-bl .map{width:clamp(250px,13vw,330px);}${WIDE} .cot-bl .map img{width:clamp(234px,12.2vw,314px);height:clamp(234px,12.2vw,314px);}
${WIDE} .cot-bl .team.cards{--bl-row-height:clamp(118px,6.15vw,156px);}
${WIDE} .cot-bl .team.cards .row.card.has-cs{--hc-band:clamp(54px,2.82vw,68px);}
${WIDE} .cot-bl .team.cards .row.card :is(.nm,.cs){font-size:max(var(--fs-floor-11),var(--fs-11),clamp(11px,.55vw,14px));}
${WIDE} .cot-bl .team:not(.cards){--bl-row-height:clamp(30px,1.56vw,40px);}
${WIDE} .cot-bl .row:not(.card) .nm{font-size:max(var(--battle-fs-13),var(--fs-13),clamp(13px,.66vw,16px));}
${WIDE} .cot-bl .row:not(.card) .cs{font-size:max(var(--fs-floor-11),var(--fs-11),clamp(11px,.55vw,14px));}
${WIDE} .cot-bl .row:not(.card) .sil{flex-basis:clamp(56px,2.9vw,72px);max-height:clamp(26px,1.35vw,34px);}
${WIDE} .cot-bl .team:not(.cards) .thead{font-size:max(var(--fs-floor-12),var(--fs-12),clamp(12px,.6vw,15px));}
${WIDE} .cot-bl .fstage{font-size:clamp(14px,.73vw,18px);}${WIDE} .cot-bl .fpct{font-size:max(var(--battle-fs-13),var(--fs-13),clamp(13px,.7vw,18px));}
${WIDE} .cot-bl .fbar i{height:clamp(4px,.22vw,6px);}
${WIDE} .cot-bl .count{font-size:clamp(15px,.78vw,20px);}${WIDE} .cot-bl .count b{font-size:clamp(24px,1.25vw,32px);}
/* (a portrait phone's progress takes a line of its own under the stage and the share: squeezed between them it read as
   five 20 px dashes, gauntlet r3) */
${PORTRAIT} .cot-bl .fmeta{flex-wrap:wrap;row-gap:8px;}
${PORTRAIT} .cot-bl .fbar{order:3;flex-basis:100%;}
${PORTRAIT} .cot-bl .fpct{margin-left:auto;}
@media (prefers-reduced-motion:reduce){.cot-bl.leaving,.cot-bl .fbar i b{transition-duration:1ms;}}
`;

export interface BattleLoadRosterRow {
  readonly id: string;
  readonly kind?: 'aircraft';
  readonly tier?: string;
  readonly name?: string;
  readonly isPlayer?: boolean;
  /** Who drives it (a room player's name, a bot's callsign as the HUD names it); the viewer's card reads "You". */
  readonly callsign?: string;
  /** The vehicle's nation: its flag on a sheet row (a card carries the hero flag). */
  readonly nation?: string;
}

interface BattleLoadInfo {
  readonly mapName: string;
  readonly thumb?: string;
  readonly biome?: string;
  readonly mode?: string;
  /** The battle's mode id: its opening objectives on the battlefield's plan (deployObjectives.ts), its clock and respawn
   *  on the rules row (sim/matchRuleset.ts). */
  readonly modeId?: string;
  /** A campaign operation keeps its own clock (matchRuleset's campaign input), so its rules row leaves the clock off. */
  readonly campaign?: boolean;
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

/**
 * The rules row's mode chip: the mode alone, as its normalized id names it ("Turbo Ball"; a Standard battle reads
 * "Random Battle · Standard"). The screen names the battlefield in its title, so the chip carries no battlefield
 * subtitle, and the plan's objectives (modeId) are this same mode's.
 */
export function battleLoadModeLabel(modeId: string): string {
  return modeId === 'standard' ? t('battleLoad.randomStandard') : t(`playMenu.matchMode.${modeId}.label`);
}

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
    `<div class="rules"><span class="cot-c-chip mode"><span class="gi"></span><span class="kicker">${t('battleLoad.kicker')}</span></span>` +
    `<span class="cot-c-chip sides" hidden><span class="gi">${uiIconSVG('team', 16)}</span><span class="sv"></span></span>` +
    `<span class="cot-c-chip clock" hidden><span class="gi">${uiIconSVG('clock', 16)}</span><span class="v num"></span></span>` +
    `<span class="cot-c-chip respawn" hidden><span class="gi">${uiIconSVG('rematch', 16)}</span><span class="v num"></span></span></div></div>` +
    `<div class="side"><div class="map" hidden><span class="mp"><img alt="" decoding="async" draggable="false"><canvas class="obj" aria-hidden="true"></canvas></span></div></div>` +
    `<div class="teams">` +
    `<div class="team ally"><div class="thead"><span>${t('battleLoad.allies')}</span><span class="flags" aria-hidden="true"></span><span class="n">0</span></div>` +
    `<div class="rows"></div></div>` +
    `<div class="vs">${t('battleLoad.vs')}</div>` +
    `<div class="team foe"><div class="thead"><span>${t('battleLoad.enemies')}</span><span class="flags" aria-hidden="true"></span><span class="n">0</span></div>` +
    `<div class="rows"></div></div>` +
    `</div>` +
    `<div class="foot" aria-live="polite"><div class="fmeta">` +
    `<div class="fstage"><span class="mk" aria-hidden="true"></span><span class="st">${t('battleLoad.loading')}</span></div>` +
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
  const clockChip = requiredElement<HTMLSpanElement>(root, '.rules .clock');
  const respawnChip = requiredElement<HTMLSpanElement>(root, '.rules .respawn');
  /** The mode's clock and respawn as the direction's chips (10-battle-load .rules: glyph and figure, no words); an entry
   *  without a mode (a pending cover, a room) or a campaign operation (its own clock) leaves them off. */
  function showRules(modeId: string | undefined, campaign: boolean): void {
    const rules = modeId ? matchRulesetFor(modeId as GameModeId) : null;
    const clock = !campaign ? rules?.timeLimitS ?? null : null;
    const respawn = rules?.respawnS ?? null;
    clockChip.hidden = clock == null;
    if (clock != null) {
      requiredElement<HTMLSpanElement>(clockChip, '.v').textContent = `${Math.floor(clock / 60)}:${String(Math.round(clock % 60)).padStart(2, '0')}`;
      clockChip.dataset.tip = t('battleLoad.rule.clock');
    }
    respawnChip.hidden = respawn == null;
    if (respawn != null) {
      requiredElement<HTMLSpanElement>(respawnChip, '.v').textContent = t('battleLoad.rule.respawnValue', { s: respawn });
      respawnChip.dataset.tip = t('battleLoad.rule.respawn');
    }
  }
  const markEl = requiredElement<HTMLSpanElement>(root, '.fstage .mk');
  /** The living mark in its sized slot (primed in idle time; a cold first load paints it on arrival, in place). */
  function seatMark(): void {
    if (markEl.firstChild) return;
    markEl.innerHTML = `<img src="${MARK_MOTION_URL}" alt="" decoding="async" draggable="false">`;
  }
  const mapEl = requiredElement<HTMLDivElement>(root, '.map');
  const mapImg = requiredElement<HTMLImageElement>(root, '.map img');
  const objCanvas = requiredElement<HTMLCanvasElement>(root, '.map .obj');
  let objectivesPass = 0;
  /** The battle's opening objectives over the plan, as the Deploy screen draws them (its lazy module, once the plate is
   *  laid out); a later entry supersedes this one, and an entry without a mode clears them. */
  function drawObjectives(mapId: string | undefined, modeId: string | undefined): void {
    const pass = ++objectivesPass;
    if (!mapId || !modeId) { objCanvas.getContext?.('2d')?.clearRect(0, 0, objCanvas.width, objCanvas.height); return; }
    void import('./deployObjectives.ts').then(({ drawDeployObjectives }) => {
      const draw = (): void => { if (pass === objectivesPass) void drawDeployObjectives(objCanvas, mapId, modeId); };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(draw); else draw();
    }, () => { /* the plan stays bare */ });
  }
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
  const modeGlyphEl = requiredElement<HTMLSpanElement>(root, '.rules .mode .gi');
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
  /** The thumb and battlefield whose art the screen staged last (show() keeps it while the cover stays up). */
  let stagedArt = '';
  // `visible` is the requested open state and flips false when hide() starts.
  // `covering` follows the actual composited surface through its exit fade so
  // battle input cannot steer a camera that is only partly exposed yet.
  let covering = false;
  // the load's first frame, until its countdown (the Deploy button's estimate reads these, battleLoadEstimate.ts)
  let loadStartedAt = 0;
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

  /** Tiers show only where the battle mixes them: a rank every vehicle shares says nothing (less text). */
  function markTiers(allies: readonly BattleLoadRosterRow[], enemies: readonly BattleLoadRosterRow[]): void {
    const tiers = new Set([...allies, ...enemies].filter((row) => row.kind !== 'aircraft').map((row) => row.tier || tierNumeral(row.id)));
    if (tiers.size > 1) root.classList.add('mixed-tiers'); else root.classList.remove('mixed-tiers');
  }

  /** The sheet rows' flags: flags.ts loads with its art once, after the rows (a later fill of this side supersedes it). */
  let rowFlagsPass = 0;
  function fillRowFlags(host: HTMLElement, rows: readonly BattleLoadRosterRow[]): void {
    const pass = String(++rowFlagsPass);
    host.dataset.rowFlagsPass = pass;
    if (!rows.some((row) => row.nation)) return;
    void import('./flags.ts').then(({ flagIconHTML }) => {
      if (host.dataset.rowFlagsPass !== pass) return;
      for (const seat of host.querySelectorAll<HTMLElement>('.fl[data-nation]')) seat.innerHTML = flagIconHTML(seat.dataset.nation || '', 16, 12);
    }, () => { /* the rows keep their silhouettes */ });
  }

  function fillTeam(
    host: HTMLElement,
    countEl2: HTMLElement,
    team: HTMLElement,
    rows: readonly BattleLoadRosterRow[] = [],
    slots = 0,
  ): void {
    const reserved = rows.length ? 0 : Math.max(0, Math.floor(slots));
    // a cover the press already drew (showPending, then the loading owner's first show with the same open slots) keeps
    // its rows: one sheet build in the press's task, not two (click-perf-244)
    if (!rows.length && reserved && host.dataset.pendingSlots === String(reserved) && host.childElementCount === reserved) return;
    if (reserved) host.dataset.pendingSlots = String(reserved); else delete host.dataset.pendingSlots;
    team.style.setProperty('--bl-count', String(Math.max(1, rows.length, reserved)));
    // a side of seven or fewer shows a hero card a tank where the layout is wide (CSS), the rows otherwise; a window under
    // CARD_MIN_WIDTH sets the wide composition's sheets as a long side does, where a card cut its driver (gauntlet r2 and
    // r3: about 7 characters at 1280, 10 at 1440)
    const cards = rows.length > 0 && rows.length <= CARD_TEAM_MAX && (typeof innerWidth !== 'number' || innerWidth >= CARD_MIN_WIDTH);
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
      } else {
        // a sheet row shows the vehicle's own side render, a card its silhouette until the hero layers land; only the
        // one the layout draws is fetched (a box the CSS never paints loads no background)
        sil.style.setProperty('--side-img', `url(${iconUrl(r.id, 'side')})`);
        sil.style.setProperty('--sil-img', `url(${iconUrl(r.id, 'side_silhouette')})`);
      }
      const nm = document.createElement('div');
      nm.className = 'nm';
      nm.textContent = aircraft?.label || r.name || r.id;
      if (LATIN.test(nm.textContent)) nm.classList.add('lat');
      // every vehicle with its flag (owner UI rules): a sheet row's beside its render (a wide card's is its hero layer)
      const flag = document.createElement('span');
      flag.className = 'fl';
      if (r.nation && !aircraft) flag.dataset.nation = r.nation;
      el.append(tier, flag, sil, nm);
      // who drives it: a card names its driver under the vehicle (the direction's 10-battle-load .cs), a row at its end
      const callsign = r.isPlayer ? t('hud.feed.you') : r.callsign;
      if (callsign) {
        const cs = document.createElement('div');
        cs.className = 'cs';
        cs.textContent = callsign;
        if (LATIN.test(callsign)) cs.classList.add('lat');
        el.append(cs);
        if (cards) el.className += ' has-cs';
      }
      host.appendChild(el);
      if (cards && !aircraft) decorated.push([el, r.id]);
    }
    countEl2.textContent = reserved ? '' : String(rows.length);
    decorateCards(host, decorated);
    fillRowFlags(host, rows);
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
      // (the mode's own glyph, as every chip beside it wears one: gauntlet r4)
      const modeGlyph = info.modeId ? GAME_MODE_DEFINITIONS[normalizeGameMode(info.modeId)]?.icon : '';
      modeGlyphEl.innerHTML = modeGlyph ? uiIconSVG(modeGlyph, 16) : '';
      // the art a covered entry already staged stays (the loading owner's first show names the same battlefield)
      const artKey = `${info.thumb ?? ''}|${info.biome ?? ''}`;
      if (!visible || artKey !== stagedArt) stageArt(info.thumb, info.biome);
      stagedArt = artKey;
      // the battlefield's own plan (its baked tactical map, which the battle's minimap loads next)
      mapEl.hidden = !info.biome;
      if (info.biome) mapImg.src = minimapAssetUrl(info.biome);
      drawObjectives(info.biome, info.modeId);
      showRules(info.modeId, !!info.campaign);
      fillTeam(allyRows, allyN, allyTeam, info.allies, info.slots);
      fillTeam(foeRows, foeN, foeTeam, info.enemies, info.slots);
      markTiers(info.allies, info.enemies);
      showSides(info.allies.length, info.enemies.length);
      seatMark();
      // (no tip: a helper sentence is the less-text rule's first cut, gauntlet r4; the battlefield's plan stands alone)
      countEl.textContent = '';
      api.progress(0, t('battleLoad.loading'));
      if (!visible) loadStartedAt = performance.now();
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
      markTiers(allies, enemies);
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
      if (loadStartedAt) { recordBattleLoad((performance.now() - loadStartedAt) / 1000); loadStartedAt = 0; }
      countEl.innerHTML = n > 0
        ? t('battleLoad.countdown', { n }) + ''
        : `<b>${t('battleLoad.go')}</b>`;
    },

    /** Fade out, then drop out of layout. */
    hide() {
      if (!visible) return Promise.resolve();
      visible = false;
      loadStartedAt = 0;
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
