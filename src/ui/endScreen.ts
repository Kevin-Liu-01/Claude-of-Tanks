import { battleEndArt, shotAccuracy } from './battleReportMedia.ts';
import { battleLoadModeLabel } from './battleLoad.ts';
import { GAME_MODE_DEFINITIONS } from '../sim/gameModeCatalog.ts';
import { reportBackdrop } from './reportBackdrop.ts';
import type { RuntimeValue } from '../runtimeTypes.ts';
/**
 * endScreen.ts — typed cinematic battle end screen (killcam_endscreen r1).
 *
 * Replaces the old shot-info battle report as the end-of-battle surface.
 * Rendered INTO shotInfo's existing full-screen stats host (`.cot-si-stats`,
 * z 71) so every integration seam keeps working untouched: main.ts's
 * veilHud() toggles that exact element around the kill-cam, and the kill-cam
 * CSS parity veil (`body.cot-kc-live .cot-si-stats`) keeps hiding it while a
 * replay owns the screen. The flow is unchanged too — shotInfo buffers
 * `battle:ended` behind its REPORT GATE and calls `show()` when the replay
 * releases the screen (killcam:done), which is exactly when the kill-cam's
 * fade-through-black sits at full black: the staggered entrance below plays
 * as the fade lifts.
 *
 * ADOPTED integration DOM:
 *  - `.cot-end` — endOverlayRuntime.ts's integration overlay. Its verdict/summary lines are
 *    superseded by this screen; the overlay itself is display:none'd on show.
 *  - the overlay's RETURN TO GARAGE button — reparented
 *    into the actions row, restyled via class, its existing click handler
 *    (bus 'ui:click' + enterGarage) kept verbatim.
 *  - BATTLE AGAIN drives the existing garage flow: the adopted button's
 *    handler enters the garage, then the garage's own `.cot-battle` button
 *    is clicked — the full loading-screen entry path, nothing re-implemented.
 *
 * DATA: every number is a resolved-event sum handed over by shotInfo
 * (buildSummary). Nothing here is recomputed or invented; the game has no
 * base-capture mechanic, so no capture stat is fabricated.
 */

import { containModalTab } from './modal.ts';
import { createRichTooltip } from './richTooltip.ts';
import { awardDetails } from './awardDetails.ts';
import { FONT_STACK, FONT_COND, ensureFonts } from './fonts.ts';
import { createElement as el, escapeHtml } from './dom.ts';
import { ensureStyle } from './styleLayers.ts';
import { iconUrl, maskIcon } from './icons.ts';
import { killSourceIdentity } from './killSourceIdentity.ts';
import { uiIconSVG } from './uiIcons.ts';
import { ICON_IDS } from './icons/spriteIndex.ts';
import { moduleName } from './moduleRegistry.ts';
import { layoutBeats, type BattleBeat, type BattleSide, type PlacedBeat } from './battleBeats.ts';
import { getSpec } from '../vehicles/specs.ts';
import type { EventBus } from '../game/stateCore.ts';
import { t, formatNumber } from './i18n.ts';
import type { CampaignDebrief } from '../game/campaignDebrief.ts';
import { finalBlowLine, type FinalBlow } from './finalBlow.ts';
import { ACHIEVEMENTS, MEDALS, type BattleAwards } from '../game/serviceRecord.ts';
import { achievementSVG, medalSVG } from './medalArt.ts';
import type { LobbyPlayer, SerializedLobby } from '../mp/room/lobbyShape.ts';

export type EndScreenResult = '' | 'victory' | 'defeat' | 'draw';

export interface EndScreenTeamRow {
  id: string;
  name?: string | null;
  specId?: string | null;
  /** (ac130-fx-228) flew the AC-130: the aircraft's icon in the silhouette's place */
  aircraft?: boolean;
  dmg: number;
  kills: number;
  /** Deaths this battle (owner 2026-09-21): shown in reviving modes, where `dead` is the state at the end. */
  deaths?: number;
  dead: boolean;
  isPlayer?: boolean;
}

interface EndScreenKillRow {
  id: string;
  name?: string | null;
  specId?: string | null;
  dmg: number;
}

interface EndScreenStats {
  dealt: number;
  received: number;
  blocked: number;
  fired: number;
  hits: number;
  pens: number;
  assist: number;
  modulesDestroyed?: number;
  spotted?: number;
  spotAttributed?: boolean;
}

interface EndScreenBestShot {
  damage: number;
  shellType?: string;
  shellName?: string;
  targetName?: string;
  zone?: string;
  distM?: number;
  destroyed?: boolean;
}

export interface EndScreenSummary {
  result?: EndScreenResult;
  reason?: string | null;
  playerVehicle?: string;
  playerSpecId?: string | null;
  /** (ac130-fx-228) the player flew the AC-130: the debrief's vehicle card shows the aircraft */
  playerAircraft?: boolean;
  playerDead?: boolean;
  /** The player's deaths this battle (owner 2026-09-21: a stat in reviving modes, not a terminal state). */
  playerDeaths?: number;
  playerKills?: number;
  /** The mode revives destroyed vehicles: rows and stats carry death counts, `dead` means dead at the end. */
  revives?: boolean;
  map?: string | null;
  mapId?: string | null;
  /** The battle's mode id: its chip leads the facts under the headline (the direction's 11-end-screen .chips). */
  mode?: string | null;
  timeS: number;
  stats: EndScreenStats;
  kills: EndScreenKillRow[];
  bestShot?: EndScreenBestShot | null;
  allies: EndScreenTeamRow[];
  enemies: EndScreenTeamRow[];
  /** Campaign sortie debrief (Frontline Assault on a ladder map); absent otherwise. */
  campaign?: CampaignDebrief | null;
  /** battle endings (2026-09-25): the blow that ended the battle (finalBlow.ts), absent when nothing fell. */
  finalBlow?: FinalBlow | null;
  /** The Horde wave the last stand fell on. */
  hordeWave?: number | null;
  /** Jev commander (2026-09-25): who commanded each side's bots ('classic' | 'jev'); absent in rooms. */
  brains?: { readonly enemy: string; readonly allies: string } | null;
  /** Medals and achievement tiers this battle earned (serviceRecord.ts). */
  awards?: BattleAwards | null;
  /** The battle's timeline (battleBeats.ts): the player's spot, kills, objectives, losses and death, by battle time. */
  beats?: readonly BattleBeat[] | null;
  /**
   * A watched battle (watch-mode-243): no human side. The head names the winning side, the rosters are Alpha (allies)
   * and Bravo (enemies), the ridden tank's row (isPlayer) is only highlighted, and the beats are the battle's own.
   */
  watched?: boolean;
  /** A watched battle's mode score by side; absent where the battle is scored by its kills. */
  score?: { readonly alpha: number; readonly bravo: number } | null;
}

interface EndScreenRuntime {
  readonly root: HTMLElement;
  readonly visible: boolean;
  show(result: EndScreenResult, summary: EndScreenSummary): void;
  hide(): void;
}

interface EndScreenRoomContext {
  state: SerializedLobby;
  playerId: string;
  role?: string;
}

interface CounterState {
  raf: number;
  done: boolean;
  fin(): void;
}

type NumberFormatter = (value: number) => string;

interface CountUpOptions {
  durMs?: number;
  delayMs?: number;
  fmt?: NumberFormatter;
  prefix?: string;
}

interface TileOptions {
  hot?: boolean;
  /** The tile's short visible label (the full one is its title and accessible name). */
  short?: string;
  icon?: string;
  text?: string;
  value?: number;
  datasetV?: number;
  fmt?: NumberFormatter;
}

interface TeamSummaryInput {
  dead?: boolean;
  kills?: RuntimeValue;
  dmg?: RuntimeValue;
}

interface TeamSummary {
  total: number;
  alive: number;
  kills: number;
  damage: number;
}

// every use is a CSS value (the sheet, inline tints): the Premiere direction's accent, status and ink tokens
const COL = {
  amber: 'var(--accent)',
  amberHi: 'var(--accent-hi)',
  gold: 'var(--accent-hi)',
  green: 'var(--ok)',
  red: 'var(--danger)',
  steel: 'var(--ink-2)',
  text: 'var(--ink-1)',
  dim: 'var(--ink-3)',
};

/**
 * The player's vehicle tile takes its tank hero card (the 3/4 render over its waving flag) from the lazy
 * hero chunk; the packaged angle icon stays until the layers are placed, and for good when they are not.
 */
function showHeroVehicle(card: HTMLElement, specId: string, fallback: HTMLImageElement, name: string): void {
  // the card module with its stylesheet (the one boundary every card surface keeps), the name's policy beside them
  Promise.all([Promise.all([import('./heroCard.ts'), import('./heroCard.css')]), import('./heroCardPolicy.ts')])
    .then(([[hero], policy]) => {
      nameVehicleCard(card, name, policy.nameParts);
      return hero.decorateHeroTile(card, specId, { tankSizes: '220px', flagSizes: '260px', priority: true });
    })
    .then((decorated) => {
      if (!decorated) return;
      card.setAttribute('role', 'img');
      card.setAttribute('aria-label', fallback.alt);
      fallback.remove();
    })
    .catch(() => { /* the angle icon stays */ });
}

/**
 * The vehicle's name under its card: the name solid, its variant (the last word) in the hollow tungsten outline, as the
 * policy's end-screen card sets it (HERO_CARD_LAYOUT.endScreen hollow; owner 2026-10-22: "love the outline text tho").
 */
function nameVehicleCard(card: HTMLElement, name: string, split: (name: string) => { solid: string; variant: string }): void {
  if (!name || card.querySelector('.es-vn')) return;
  const { solid, variant } = split(name);
  const label = el('span', 'es-vn', card);
  label.setAttribute('aria-hidden', 'true');
  label.append(solid);
  if (variant) {
    label.append(' ');
    el('span', 'hv', label).textContent = variant;
  }
}

const ES_CSS = `
.cot-es{position:fixed;inset:0;z-index:71;display:none;pointer-events:none;
  flex-direction:column;align-items:center;justify-content:center;
  padding:2.2vh 0 2.6vh;overflow:hidden;font-family:${FONT_STACK};color:${COL.text};
  background:
    radial-gradient(110% 80% at 50% -10%,var(--accent-wash),transparent 48%),
    linear-gradient(180deg,rgba(5,8,12,.985),rgba(4,7,10,.955) 44%,rgba(3,5,8,.99));}
.cot-es.show{display:flex;}
.cot-es.es-sheet-wait{visibility:hidden;}
.cot-es *{box-sizing:border-box;margin:0;padding:0;}
.cot-es::before{content:"";position:fixed;left:0;right:0;top:0;height:4px;
  background:linear-gradient(90deg,transparent 8%,${COL.amber} 50%,transparent 92%);
  box-shadow:0 0 22px oklch(from var(--accent) l c h / .5);}
.cot-es.result-victory::before{background:linear-gradient(90deg,transparent 8%,${COL.green} 50%,transparent 92%);}
.cot-es.result-defeat::before{background:linear-gradient(90deg,transparent 8%,${COL.red} 50%,transparent 92%);}
.cot-es .es-hero{position:relative;width:1160px;max-width:96vw;flex:0 0 auto;overflow:hidden;}
/* staggered entrance: hero first, tallies cascade, buttons last (--i steps) */
@keyframes cotEsIn{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:none;}}
@keyframes cotEsHero{from{opacity:0;transform:translateY(-10px) scale(.96);letter-spacing:.5em;}
  to{opacity:1;transform:none;}}
.cot-es .es-in{opacity:0;animation:cotEsIn var(--cot-motion-slow) var(--cot-ease-out) forwards;
  animation-delay:calc(var(--i,0)*45ms);}
/* --- hero ----------------------------------------------------------------- */
/* The report's name stays for assistive technology; on screen the result banner leads (owner UI rule 2: no kicker
   above a heading). */
.cot-es .es-kick{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;
  font-family:${FONT_COND};font-weight:500;font-size:var(--battle-fs-13);letter-spacing:0;color:var(--ink-2);text-align:center;}
.cot-es .es-ban{margin-top:6px;font-weight:700;font-size:clamp(44px,5.8vw,68px);
  line-height:1;letter-spacing:.18em;text-indent:.18em;text-align:center;
  text-transform:uppercase;opacity:0;
  animation:cotEsHero var(--cot-motion-scene) var(--cot-ease-soft) forwards;
  text-shadow:0 3px 30px oklch(from var(--surface-scene) l c h / .85);}
.cot-es .es-ban.v{color:var(--ink-1);text-shadow:0 0 34px oklch(from var(--ok) l c h / .35),0 3px 30px oklch(from var(--surface-scene) l c h / .85);}
.cot-es .es-ban.d{color:var(--ink-1);text-shadow:0 0 34px oklch(from var(--danger) l c h / .32),0 3px 30px oklch(from var(--surface-scene) l c h / .85);}
.cot-es .es-ban.n{color:${COL.steel};}
.cot-es .es-rule{width:132px;height:2px;margin:var(--s3) auto 0;
  background:linear-gradient(90deg,transparent,var(--accent) 30%,var(--accent-hi) 50%,var(--accent) 70%,transparent);
  box-shadow:0 0 12px oklch(from var(--accent) l c h / .55);}
.cot-es .es-ban.v+.es-rule{background:linear-gradient(90deg,transparent,var(--ok) 30%,oklch(from var(--ok) .89 .111 h) 50%,var(--ok) 70%,transparent);box-shadow:0 0 12px oklch(from var(--ok) l c h / .5);}
.cot-es .es-ban.d+.es-rule{background:linear-gradient(90deg,transparent,var(--danger) 30%,oklch(from var(--danger) .83 .094 h) 50%,var(--danger) 70%,transparent);box-shadow:0 0 12px oklch(from var(--danger) l c h / .5);}
.cot-es .es-sub{margin-top:11px;text-align:center;font-size:14.5px;font-weight:500;
  color:${COL.steel};letter-spacing:.04em;}
.cot-es .es-sub b{color:oklch(from var(--accent-hi) .93 .073 h);font-weight:700;}
/* battle endings (2026-09-25): the final blow under the verdict line */
.cot-es .es-blow{margin-top:var(--s2);text-align:center;font-family:${FONT_COND};font-weight:700;font-size:12.5px;
  letter-spacing:var(--track-label);text-transform:uppercase;color:var(--accent-hi);display:flex;align-items:center;justify-content:center;gap:var(--s2);}
.cot-es .es-blow svg{flex:0 0 auto;color:var(--accent-hi);}
.cot-es .es-meta{margin-top:var(--s1);text-align:center;font-family:${FONT_COND};
  font-weight:700;font-size:var(--battle-fs-12);letter-spacing:.14em;color:var(--ink-2);
  text-transform:uppercase;display:flex;align-items:center;justify-content:center;gap:18px;}
.cot-es .es-meta span{display:flex;align-items:center;gap:7px}.cot-es .es-meta svg{color:var(--ink-3)}
.cot-es .es-meta b{color:var(--ink-2);font-weight:700;}
.cot-es .es-campaign{margin:var(--s3) auto 0;width:min(560px,92vw);padding:10px 14px 11px;text-align:center;
  border:1px solid oklch(from var(--accent) l c h / .5);border-left:3px solid var(--accent);border-radius:4px;background:var(--battle-chip-plate);}
.cot-es .es-campaign .ck{font-family:${FONT_COND};font-size:var(--battle-fs-11);font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:var(--accent);}
.cot-es .es-campaign .ct{margin-top:3px;font-family:${FONT_COND};font-size:19px;font-weight:700;letter-spacing:var(--battle-track-status);text-transform:uppercase;color:var(--ink-1);}
.cot-es .es-campaign .cs{margin-top:5px;font-size:12.5px;color:var(--ink-2);}
.cot-es .es-campaign .cs b{color:oklch(from var(--accent-hi) .93 .073 h);font-weight:700;}
.cot-es .es-campaign .stars{display:inline-flex;gap:var(--s1);margin:6px 0 0;line-height:0;}
.cot-es .es-campaign .stars i{color:var(--ink-4);}
.cot-es .es-campaign .stars i.on{color:var(--accent);}.cot-es .es-campaign .stars i.on svg{fill:currentColor}
.cot-es .es-campaign .cn{margin-top:6px;font-family:${FONT_COND};font-size:var(--battle-fs-11);font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-3);}
.cot-es .ss .seg{white-space:nowrap;}
/* --- two-column debrief --------------------------------------------------- */
.cot-es .es-report{display:grid;grid-template-columns:minmax(0,.92fr) minmax(0,1.08fr);
  align-items:stretch;gap:var(--s3);width:1160px;max-width:96vw;height:clamp(300px,45vh,390px);
  flex:0 0 clamp(300px,45vh,390px);margin-top:var(--s3);min-height:0;}
.cot-es .es-debrief{display:flex;flex-direction:column;min-width:0;min-height:0;height:100%;
  overflow:hidden;background:linear-gradient(155deg,var(--hud-plate-strong),var(--hud-plate-strong));
  border:1px solid var(--line-3);box-shadow:0 12px 36px oklch(from var(--surface-scene) l c h / .42);pointer-events:auto;}
.cot-es .es-dh{display:flex;align-items:center;justify-content:space-between;gap:var(--s3);
  min-height:41px;padding:9px 14px;border-bottom:1px solid var(--line-3);}
.cot-es .es-dh .titleline{display:flex;align-items:center;gap:9px}.cot-es .es-dh .titleline svg{flex:0 0 auto;opacity:.92}
.cot-es .es-dh .ey{font:700 var(--battle-fs-12) ${FONT_COND};letter-spacing:.18em;text-transform:uppercase;color:${COL.amberHi};}
.cot-es .es-dh .context{font:700 var(--battle-fs-11) ${FONT_COND};letter-spacing:.03em;color:var(--ink-3);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cot-es .es-debrief.teams .es-dh .ey{color:oklch(from var(--team-own) .88 .103 h);}
.cot-es .es-stat-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;
  background:oklch(from var(--ink-2) l c h / .15);border-bottom:1px solid var(--line-2);}
.cot-es .es-stat-grid.has-vehicle{grid-template-columns:minmax(112px,.72fr) repeat(2,minmax(0,1fr));}
.cot-es .es-vehicle-card{position:relative;display:grid;place-items:center;min-width:0;min-height:80px;
  overflow:hidden;background:radial-gradient(100% 85% at 50% 35%,var(--accent-wash),var(--hud-plate-strong) 72%);}
.cot-es .es-vehicle-card img{display:block;width:100%;height:76px;padding:var(--s1) 7px 7px;object-fit:contain;
  object-position:center;opacity:.84;filter:grayscale(.12) contrast(1.12) drop-shadow(0 9px 11px oklch(from var(--surface-scene) l c h / .72));}
.cot-es .es-tal{display:flex;flex-direction:column;justify-content:center;gap:3px;min-width:0;
  min-height:80px;text-align:left;padding:var(--s3) var(--s4);background:var(--hud-plate-strong);}
.cot-es .es-tal .v{font-family:${FONT_COND};font-weight:700;font-size:23px;
  letter-spacing:-.01em;color:var(--ink-1);line-height:1.05;text-align:left;}
.cot-es .es-tal .v i{font-style:normal;font-size:var(--battle-fs-14);color:${COL.dim};font-weight:700;}
.cot-es .es-tal .k{order:-1;display:flex;align-items:center;gap:7px;font-size:var(--battle-fs-11);font-weight:700;letter-spacing:.1em;
  color:var(--ink-2);text-transform:uppercase;font-family:${FONT_COND};}
.cot-es .es-tal .k svg{flex:0 0 auto;color:${COL.amberHi}}
.cot-es .es-tal.hot{background:linear-gradient(135deg,oklch(from var(--accent-hi) l c h / .13),oklch(from var(--accent-hi) l c h / .025));}
.cot-es .es-tal .v,.cot-es .es-tal.hot .v{font-size:34px}.cot-es .es-tal.hot .v{color:${COL.gold};}
.cot-es .es-stat-secondary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));
  border-bottom:1px solid var(--line-2);}
.cot-es .es-mini{min-width:0;padding:10px 14px;border-right:1px solid var(--line-2);}
.cot-es .es-mini:last-child{border-right:0}.cot-es .es-mini .mk{display:flex;align-items:center;gap:6px;font:700 var(--battle-fs-11) ${FONT_COND};letter-spacing:.02em;
  text-transform:uppercase;color:var(--ink-3)}.cot-es .es-mini .mk svg{flex:0 0 auto}.cot-es .es-mini .mv{margin-top:5px;font:700 21px ${FONT_COND};
  color:var(--ink-1);}.cot-es .es-mini .md{margin-top:2px;font-size:var(--battle-fs-11);color:var(--ink-3);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cot-es .es-best{display:grid;grid-template-columns:auto auto minmax(0,1fr);align-items:center;gap:9px;
  min-height:48px;padding:var(--s2) 14px;background:linear-gradient(90deg,var(--accent-wash),oklch(from var(--accent) l c h / .015) 78%);
  border-bottom:1px solid oklch(from var(--accent) l c h / .3);}
.cot-es .es-best .bk{font-family:${FONT_COND};font-weight:700;font-size:var(--battle-fs-11);
  letter-spacing:.11em;color:${COL.amberHi};text-transform:uppercase;flex:0 0 auto;display:flex;align-items:center;gap:7px;}
.cot-es .es-best .bd{font-family:${FONT_COND};font-weight:700;font-size:var(--battle-fs-20);
  color:${COL.gold};flex:0 0 auto;letter-spacing:-.01em;}
.cot-es .es-best .bt{font-size:var(--battle-fs-12);color:${COL.steel};letter-spacing:.02em;flex:1;
  min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  }
.cot-es .es-best .bt b{color:var(--ink-1);font-weight:700;}
.cot-es .es-best .bt small{display:block;margin-top:2px;font-size:var(--battle-fs-11);color:var(--ink-3);}
.cot-es .es-awards{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:10px;
  min-height:46px;padding:6px 14px;border-bottom:1px solid var(--line-2);
  background:linear-gradient(90deg,oklch(from var(--accent-hi) l c h / .08),transparent 70%);}
.cot-es .es-awards .ak{display:flex;align-items:center;gap:7px;font:700 var(--battle-fs-11) ${FONT_COND};letter-spacing:.11em;
  text-transform:uppercase;color:${COL.amberHi};}
.cot-es .es-awards .ak svg{flex:0 0 auto;}
.cot-es .es-awards .al{display:flex;flex-wrap:wrap;gap:5px 6px;min-width:0;}
.cot-es .es-awards .aw{display:flex;flex:0 0 auto;align-items:center;gap:6px;padding:3px 9px 3px var(--s1);
  background:var(--battle-chip-plate);border:1px solid var(--line-3);}
.cot-es .es-awards .aw.icon{padding:3px var(--s1);}
.cot-es .es-awards .aw.signature{border-color:oklch(from var(--accent) l c h / .65);background:var(--accent-wash);}
.cot-es .es-awards .aw b{font:700 var(--battle-fs-11) ${FONT_COND};letter-spacing:.02em;text-transform:uppercase;color:var(--ink-1);white-space:nowrap;}
.cot-es .es-awards .aw.tier b{color:var(--ink-2);}
.cot-es .es-awards svg{display:block;flex:0 0 auto;}
.cot-es .es-kill-block{display:flex;flex:1;min-height:0;flex-direction:column;padding:0 var(--s3) 10px;}
.cot-es .es-kill-list{min-height:0;overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(240,160,48,.45) transparent;}
/* the legacy integration overlay may flash its old button/earnings line in
   the frames between endOverlayRuntime.show() and the report flush — armed on
   battle:ended, this suppresses it outright (the end screen owns the frame;
   !important beats the integration overlay's inline display:flex) */
body.cot-es-armed .cot-end{display:none !important;}
.cot-es .es-ph{font-size:var(--battle-fs-11);font-weight:700;letter-spacing:.1em;color:var(--ink-2);
  text-transform:uppercase;font-family:${FONT_COND};padding:9px 2px 7px;
  border-bottom:1px solid var(--line-3);margin-bottom:var(--s1);
  display:flex;justify-content:space-between;}
.cot-es .es-ph .ph-title{display:flex;align-items:center;gap:7px}.cot-es .es-ph svg{flex:0 0 auto}
.cot-es .es-ph.ally{color:var(--text-own);border-bottom-color:oklch(from var(--team-own) l c h / .35);}
.cot-es .es-ph.foe{color:var(--text-enemy);border-bottom-color:oklch(from var(--team-enemy) l c h / .35);}
.cot-es .es-scoreboard{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;min-height:86px;
  padding:10px 22px;border-bottom:1px solid var(--line-2);background:var(--battle-chip-plate);}
.cot-es .es-score-side{display:grid;grid-template-columns:1fr auto;align-items:center;gap:var(--s3);}
.cot-es .es-score-side.foe{text-align:right;grid-template-columns:auto 1fr}.cot-es .es-score-copy{min-width:0}
.cot-es .es-score-side .sl{font:700 var(--battle-fs-12) ${FONT_COND};letter-spacing:var(--track-label);text-transform:uppercase;}
.cot-es .es-score-side .sl{display:flex;align-items:center;gap:7px}.cot-es .es-score-side.foe .sl{justify-content:flex-end}
/* (each side in its team's ink: Alpha read mint green beside its blue flag and title, gauntlet r1) */
.cot-es .es-score-side.ally .sl{color:var(--text-own)}.cot-es .es-score-side.foe .sl{color:var(--text-enemy)}
.cot-es .es-score-side .ss{margin-top:5px;font-size:var(--battle-fs-11);color:var(--ink-3);}
.cot-es .es-score-side .sn{font:700 38px ${FONT_COND};color:var(--ink-1);line-height:1;}
.cot-es .es-score-dash{padding:0 18px;font:500 24px ${FONT_COND};color:var(--ink-4);}
.cot-es .es-rosters{display:grid;grid-template-columns:1fr 1fr;gap:var(--s3);flex:1;min-height:0;padding:var(--s3);}
.cot-es .es-roster{display:flex;min-width:0;min-height:0;flex-direction:column;}
.cot-es .es-roster-cols{display:grid;grid-template-columns:minmax(0,1fr) 58px;gap:var(--s2);padding:0 28px 6px 54px;
  font:700 var(--battle-fs-11) ${FONT_COND};letter-spacing:.04em;text-transform:uppercase;color:oklch(from var(--ink-4) .58 c h);}
.cot-es .es-roster-cols span:last-child{text-align:right;}
.cot-es .es-roster-list{flex:1;min-height:0;padding-top:7px;overflow-y:auto;border-top:1px solid var(--line-3);
  scrollbar-width:thin;scrollbar-color:rgba(166,184,199,.38) transparent;}
.cot-es .es-roster-list:focus-visible{outline:2px solid ${COL.amberHi};outline-offset:-2px;}
.cot-es .es-roster.ally .es-roster-list{border-top-color:oklch(from var(--team-own) l c h / .38)}
.cot-es .es-roster.foe .es-roster-list{border-top-color:oklch(from var(--team-enemy) l c h / .38)}
/* team rows: one readable identity line, one natural-language result line */
.cot-es .es-tr{display:flex;align-items:center;gap:var(--s2);height:43px;padding:0 var(--s2);
  background:oklch(from var(--ink-1) l c h / .024);border-left:2px solid var(--line-3);
  margin-bottom:var(--s1);}
.cot-es .es-tr.ally{border-left-color:oklch(from var(--team-own) l c h / .45);}
.cot-es .es-tr.foe{border-left-color:oklch(from var(--team-enemy) l c h / .45);}
.cot-es .es-tr.me{background:linear-gradient(90deg,oklch(from var(--accent) l c h / .18),oklch(from var(--accent) l c h / .03));
  border-left-color:${COL.amber};}
.cot-es .es-tr .tier{display:none}.cot-es .es-tr .si{flex:0 0 44px;height:19px;}
.cot-es .es-tr .identity{flex:1;min-width:0}.cot-es .es-tr .nm{display:block;min-width:0;font-size:var(--battle-fs-12);font-weight:700;color:var(--ink-1);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cot-es .es-tr .nm .you{color:${COL.gold};font-family:${FONT_COND};font-weight:700;
  font-size:var(--battle-fs-11);letter-spacing:.01em;margin-right:5px;vertical-align:1px;}
.cot-es .es-tr .veh{display:block;margin-top:2px;font-size:var(--battle-fs-11);color:var(--ink-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cot-es .es-tr .veh b{color:${COL.gold};font-weight:700}
.cot-es .es-tr .output{display:flex;flex:0 0 58px;min-width:0;flex-direction:column;gap:3px;align-items:stretch;}
.cot-es .es-tr .ov{text-align:right;font:700 11.5px ${FONT_COND};line-height:1;color:var(--ink-1);
  letter-spacing:-.01em;}
.cot-es .es-tr .obar{display:block;height:2px;background:oklch(from var(--ink-3) l c h / .16);overflow:hidden;}
.cot-es .es-tr .obar i{display:block;height:100%;background:var(--team-own);}
.cot-es .es-tr.foe .obar i{background:var(--team-enemy);}.cot-es .es-tr.me .obar i{background:${COL.gold};}
.cot-es .es-tr.me .ov{color:${COL.gold};}
.cot-es .es-tr .st{display:grid;place-items:center;flex:0 0 18px;
  color:${COL.green};filter:drop-shadow(0 0 5px oklch(from var(--ok) l c h / .3));}
/* Dead rows remain legible; status color carries the state instead of a
   line-through that made player/tank names needlessly difficult to scan. */
.cot-es .es-tr.dead{opacity:.78;background:oklch(from var(--danger) .38 .125 h / .1);}
.cot-es .es-tr.dead .nm{color:var(--ink-2);}
.cot-es .es-tr.dead .st{color:${COL.red};filter:none;opacity:1;}
.cot-es .es-tr.dead .si{opacity:.75;}
/* your kill rows */
.cot-es .es-kr{display:flex;align-items:center;gap:10px;height:39px;padding:0 7px;
  border-bottom:1px solid var(--line-1);}
.cot-es .es-kr .si{flex:0 0 50px;height:20px;}.cot-es .es-kr .nm{flex:1;min-width:0;font-size:var(--battle-fs-13);font-weight:700;color:var(--ink-1);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cot-es .es-kr .dm{flex:0 0 52px;text-align:right;font-family:${FONT_COND};font-weight:700;
  font-size:var(--battle-fs-13);color:${COL.gold};letter-spacing:-.01em;}
.cot-es .es-none{padding:9px 5px;font-size:var(--battle-fs-11);color:${COL.dim};letter-spacing:.02em;}
/* persistent private/LAN room: results are one round inside a social session */
.cot-es .es-rematch{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:0;width:1160px;
  max-width:96vw;margin-top:var(--s3);padding:0;background:linear-gradient(100deg,var(--hud-plate-strong),var(--hud-plate-strong));
  border:1px solid oklch(from var(--accent) l c h / .45);border-left:3px solid ${COL.amber};pointer-events:auto;overflow:hidden;flex:0 0 auto}
.cot-es .es-room-info{min-width:0;padding:13px var(--s4)}.cot-es .es-room-head{display:grid;grid-template-columns:36px minmax(0,1fr) auto;
  align-items:center;gap:11px}.cot-es .es-room-mode-icon{display:grid;place-items:center;width:36px;height:36px;color:${COL.amberHi};
  background:var(--accent-wash);border:1px solid oklch(from var(--accent) l c h / .32)}
.cot-es .es-room-title{min-width:0}.cot-es .es-room-title span{display:block;font:700 var(--battle-fs-11) ${FONT_COND};letter-spacing:.07em;
  text-transform:uppercase;color:${COL.amberHi}}.cot-es .es-room-title b{display:block;margin-top:2px;font:700 19px ${FONT_COND};
  letter-spacing:var(--track-label);color:var(--ink-1)}.cot-es .es-room-round{display:flex;align-items:center;gap:7px;font:700 var(--battle-fs-11) ${FONT_COND};
  letter-spacing:var(--track-label-s);text-transform:uppercase;color:var(--ink-2)}.cot-es .es-room-round svg{color:${COL.amberHi}}
.cot-es .es-room-players{display:flex;gap:var(--s2);flex-wrap:wrap;margin-top:10px}.cot-es .es-room-player{display:grid;
  grid-template-columns:44px minmax(100px,1fr) auto;align-items:center;gap:9px;min-width:245px;height:50px;padding:5px 10px;
  background:var(--battle-veil);border-left:2px solid oklch(from var(--accent) l c h / .65)}
.cot-es .es-room-player.ready{border-left-color:${COL.green}}.cot-es .es-room-player .ri{width:44px;height:21px}
.cot-es .es-room-player .room-copy{min-width:0}.cot-es .es-room-player .rn{display:block;min-width:0;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap;font-size:var(--battle-fs-12);font-weight:700}.cot-es .es-room-player .rv{display:block;margin-top:2px;
  font-size:var(--battle-fs-11);color:var(--ink-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cot-es .es-room-player .rs{display:flex;
  align-items:center;gap:5px;font:700 var(--battle-fs-11) ${FONT_COND};letter-spacing:0em;color:var(--accent)}.cot-es .es-room-player .rs svg{flex:0 0 auto}
.cot-es .es-room-player.ready .rs{color:${COL.green}}.cot-es .es-room-actions{display:flex;flex-direction:column;align-items:stretch;
  justify-content:center;gap:var(--s2);padding:13px 14px;background:var(--battle-chip-plate);border-left:1px solid oklch(from var(--accent) l c h / .22)}
.cot-es .es-ready-meter{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:var(--s2);margin-bottom:2px;color:var(--ink-3)}
.cot-es .es-ready-meter .meter-label{font:700 var(--battle-fs-11) ${FONT_COND};letter-spacing:.04em;text-transform:uppercase}.cot-es .es-ready-meter b{
  font:700 var(--battle-fs-13) ${FONT_COND};color:var(--ink-1);}.cot-es .es-ready-track{grid-column:1/-1;height:3px;
  background:oklch(from var(--ink-3) l c h / .16);overflow:hidden}.cot-es .es-ready-fill{display:block;height:100%;background:${COL.green};
  box-shadow:0 0 10px oklch(from var(--ok) l c h / .45);transition:width var(--dur-base) ease}.cot-es .es-room-actions .es-action{width:100%;min-width:0}
.cot-es .es-action.ready-now{color:var(--text-ok);box-shadow:var(--ring-ok)}
@keyframes cotEsReadyPulse{50%{box-shadow:0 0 0 5px oklch(from var(--accent) l c h / .16),0 0 26px oklch(from var(--accent) l c h / .42)}}
.cot-es .es-action.can-start,.cot-es .es-action.needs-ready:not(:disabled){animation:cotEsReadyPulse 1.35s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){
  .cot-es .es-in,.cot-es .es-ban,.cot-es .es-action.can-start,
  .cot-es .es-action.needs-ready:not(:disabled){animation:none!important;opacity:1;transform:none;}
}
/* --- actions -------------------------------------------------------------- */
.cot-es .es-actions{display:flex;gap:14px;margin-top:1.8vh;padding:var(--s1) 10px;
  flex:0 0 auto;pointer-events:auto;z-index:2;}
/* the actions are the kit's buttons (.cot-c-btn); their width and padding in the row: endScreenPresentation.css */
`;

/**
 * One report action in the kit's vocabulary (.cot-c-btn, 48 tall): its icon, then its label. data-es-action names it
 * for the spectator bar's Garage and the probes; `state` adds the room's ready / start states.
 */
function action(parent: HTMLElement, variant: 'primary' | 'secondary', name: string, iconId: string, label: string,
  state = ''): HTMLButtonElement {
  const button = el('button', `cot-c-btn cot-c-btn--${variant} cot-c-btn--48 es-action${state ? ` ${state}` : ''}`, parent);
  button.type = 'button';
  button.dataset.esAction = name;
  button.dataset.uiSound = variant === 'primary' ? 'confirm' : 'press';
  button.innerHTML = `${uiIconSVG(iconId, 18)}<span class="cot-c-btn__label">${label}</span>`;
  return button;
}

const fmtTime = (s: number): string => {
  const t = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
const fmtN = (n: number): string => formatNumber(Math.round(n));

export function summarizeTeam(rows: TeamSummaryInput[] = []): TeamSummary {
  return rows.reduce<TeamSummary>((summary, row) => {
    summary.total += 1;
    if (!row.dead) summary.alive += 1;
    summary.kills += Math.max(0, Number(row.kills) || 0);
    summary.damage += Math.max(0, Number(row.dmg) || 0);
    return summary;
  }, { total: 0, alive: 0, kills: 0, damage: 0 });
}

/**
 * A watched battle's head: the winning side (the verdict reads Alpha's seat, so a victory is Alpha's and a defeat
 * Bravo's) and the score by side, the mode's where it keeps one, else each side's kills.
 */
export function watchedResult(
  result: EndScreenResult,
  sum: Pick<EndScreenSummary, 'allies' | 'enemies' | 'score'>,
): { readonly winner: BattleSide | null; readonly alpha: number; readonly bravo: number } {
  const winner = result === 'victory' ? 'alpha' : result === 'defeat' ? 'bravo' : null;
  if (sum.score) return { winner, alpha: sum.score.alpha, bravo: sum.score.bravo };
  return { winner, alpha: summarizeTeam(sum.allies).kills, bravo: summarizeTeam(sum.enemies).kills };
}

export function damageComparisonPercent(damage: RuntimeValue, maxDamage: RuntimeValue): number {
  const value = Math.max(0, Number(damage) || 0);
  const ceiling = Math.max(0, Number(maxDamage) || 0);
  if (ceiling <= 0) return 0;
  return Math.round(Math.min(1, value / ceiling) * 1000) / 10;
}

/**
 * Roster-row detail lines after the vehicle name: the kill count, and in a reviving mode the death count
 * (owner 2026-09-21: "in respawn modes youre registered as dead even if you respawned at end" — deaths are
 * a stat there, the skull is the state at the end). Non-reviving modes never show a death line.
 */
export function rosterRowDetails(row: Pick<EndScreenTeamRow, 'kills' | 'deaths'>, revives: boolean): string[] {
  const details: string[] = [];
  if (row.kills > 0) details.push(t('endScreen.kills', { count: row.kills }));
  const deaths = Math.max(0, Math.floor(Number(row.deaths) || 0));
  if (revives && deaths > 0) details.push(t('endScreen.deaths', { count: deaths }));
  return details;
}

function isRecord(value: RuntimeValue): value is Record<string, RuntimeValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isRoomPlayer(value: RuntimeValue): value is LobbyPlayer {
  return isRecord(value) && typeof value.id === 'string';
}

function readRoomContext(value: RuntimeValue): EndScreenRoomContext | null {
  if (!isRecord(value) || typeof value.playerId !== 'string' ||
      !isRecord(value.state) || !Array.isArray(value.state.players) ||
      !value.state.players.every(isRoomPlayer)) return null;
  return {
    // The room's own lobby shape (the composition's `network:roomState`): the guard above checked the players.
    state: { ...value.state, players: value.state.players } as unknown as SerializedLobby,
    playerId: value.playerId,
    ...(typeof value.role === 'string' ? { role: value.role } : {}),
  };
}

function requiredDescendant<T extends Element>(root: ParentNode, selector: string): T {
  const result = root.querySelector<T>(selector);
  if (!result) throw new Error(`end screen requires ${selector}`);
  return result;
}

function vehicleNation(specId: string | null | undefined): string {
  if (!specId) return '';
  try {
    const spec: RuntimeValue = getSpec(specId);
    return isRecord(spec) && typeof spec.nation === 'string' ? spec.nation : '';
  } catch {
    return '';
  }
}

/** A flag's seat; fillFlags() loads the flag art (flags.ts, its SVG assets) once the screen is up. */
const flagSeat = (specId: string | null | undefined): string => {
  const nation = vehicleNation(specId);
  return nation ? `<span class="fl" data-nation="${escapeHtml(nation)}"></span>` : '';
};

/** A module's glyph from the shared set (the two tracks share one); anything else draws the damage glyph. */
const moduleGlyph = (id: string): string =>
  /^track[LR]$/.test(id) ? 'track' : (ICON_IDS as readonly string[]).includes(id) ? id : 'damage';

function vehicleName(specId: string | null | undefined): string {
  if (!specId) return '';
  try {
    const spec: RuntimeValue = getSpec(specId);
    return isRecord(spec) && typeof spec.name === 'string' ? spec.name : specId;
  } catch {
    return specId;
  }
}

/**
 * Create the end screen controller.
 * @param {{on:Function,emit:Function}} bus game event bus
 * @param {HTMLElement} host shotInfo's stats root (`.cot-si-stats`) — reused
 *   so main.ts's veilHud/statsRoot seams keep addressing the live surface
 * @returns {{show:Function,hide:Function,visible:boolean,root:HTMLElement}}
 */
/** A " · " line as its parts: a wrapped line starts with its dot, never ends on one (gauntlet r1: "5 / 21 survived ·" over
 *  "111,300 damage"). */
function dotLine(text: string): string {
  return text.split(' · ').map((part, index) => `<span class="seg">${index ? '·\u00a0' : ''}${escapeHtml(part)}</span>`).join(' ');
}

export function createEndScreen(bus: EventBus, host: HTMLElement): EndScreenRuntime {
  ensureFonts();
  ensureStyle('cot-es-style', ES_CSS, 'surfaces');
  host.classList.add('cot-es');
  // the report's presentation sheet is its own CSS chunk, off the game's boot CSS: it loads with the screen (the battle
  // HUD's start, minutes before a report); a report that beats it stays hidden until it lands, never unstyled
  let sheetLoaded = false;
  const sheetDone = (): void => { sheetLoaded = true; host.classList.remove('es-sheet-wait'); };
  void import('./endScreenPresentation.css').then(sheetDone, sheetDone);
  host.setAttribute('role', 'dialog');
  host.setAttribute('aria-modal', 'true');
  host.setAttribute('aria-label', t('endScreen.resultsAria'));
  host.setAttribute('aria-hidden', 'true');

  const awardTooltip = createRichTooltip(host, '[data-medal-tip],[data-achievement-tip]', awardDetails);
  /** A report column that scrolls (the wide windows' side-by-side record) fades at its foot while more lies below. */
  const markMore = (panel: HTMLElement): void => {
    panel.classList.toggle('more', panel.scrollHeight - panel.scrollTop - panel.clientHeight > 2);
  };
  // the column's box (a resize) and its sections (late art, the hero tile, a tab's swap) change what lies below
  const moreObserver = typeof ResizeObserver === 'function'
    ? new ResizeObserver((entries) => {
      for (const entry of entries) {
        const panel = (entry.target as HTMLElement).closest<HTMLElement>('.es-debrief');
        if (panel) markMore(panel);
        // (the narrower windows scroll the report itself: its foot fades as the columns' do, gauntlet r2)
        const report = (entry.target as HTMLElement).closest<HTMLElement>('.es-report');
        if (report) markMore(report);
      }
    })
    : null;
  host.classList.add('cot-es--record');
  host.addEventListener('keydown', event => { if (host.classList.contains('show')) containModalTab(event,host,host.querySelector<HTMLButtonElement>('button') || host); });
  let visible = false;
  let garageBtn: HTMLButtonElement | null = null;
  let roomContext: EndScreenRoomContext | null = null;
  let rematchPanel: HTMLElement | null = null;
  const counters: CounterState[] = [];
  let api: EndScreenRuntime;

  // arm the legacy-overlay suppressor the moment the battle is decided —
    // endOverlayRuntime.show() runs later in the same tick and must never flash the
  // old button/earnings line before the end screen takes the frame
  bus.on('battle:ended', () => document.body.classList.add('cot-es-armed'));
  // any path into a fresh battle retires the screen — including the debug
  // __DEBUG.startBattle flow, which skips the garage's ui:battleStart (the
  // garage path also lands here via hud.setMode -> shotInfo.hideStats)
  bus.on('phase:change', (payload) => {
    if (isRecord(payload) && payload.phase === 'battle') api.hide();
  });
  bus.on('network:roomState', (context) => {
    roomContext = readRoomContext(context);
    if (rematchPanel) renderRematchPanel(rematchPanel);
  });

  /** Animated count-up on an element (finalizes exactly on target). */
  function countUp(
    elm: HTMLElement,
    target: number,
    { durMs = 1050, delayMs = 0, fmt = fmtN, prefix = '' }: CountUpOptions = {},
  ): void {
    const fin = () => { elm.textContent = prefix + fmt(target); };
    if (typeof document !== 'undefined' && document.hidden) { fin(); return; } // headless/throttled: no dead counters
    const state = { raf: 0, done: false, fin };
    counters.push(state);
    const t0 = performance.now() + delayMs;
    const tick = (now: number): void => {
      if (state.done) return;
      const u = Math.min(1, Math.max(0, (now - t0) / durMs));
      const k = 1 - Math.pow(1 - u, 3); // ease-out cubic
      elm.textContent = prefix + fmt(target * k);
      if (u >= 1) { state.done = true; fin(); return; }
      state.raf = requestAnimationFrame(tick);
    };
    elm.textContent = prefix + fmt(0);
    state.raf = requestAnimationFrame(tick);
  }

  function stopCounters(): void {
    for (const c of counters) {
      if (!c.done) { cancelAnimationFrame(c.raf); c.done = true; c.fin(); }
    }
    counters.length = 0;
  }

  /**
   * Adopt the integration end overlay: hide `.cot-end` (this screen owns the
   * frame) and reparent its RETURN TO GARAGE button — existing handler kept.
   * @param {HTMLElement} actions actions row to mount the button into
   */
  function adoptEndOverlay(actions: HTMLElement): HTMLButtonElement | null {
    const overlay = document.querySelector<HTMLElement>('.cot-end');
    if (overlay) {
      const btn = overlay.querySelector<HTMLButtonElement>('button');
      if (btn) {
        btn.removeAttribute('style');
        btn.className = 'cot-c-btn cot-c-btn--secondary cot-c-btn--48 es-action';
        btn.dataset.esAction = 'garage';
        btn.innerHTML = `${uiIconSVG('garage', 18)}<span class="cot-c-btn__label">${t('endScreen.returnToGarage')}</span>`;
        garageBtn = btn;
      }
      overlay.style.display = 'none';
    }
    if (garageBtn) actions.appendChild(garageBtn);
    return garageBtn;
  }

  let seq = 0; // entrance stagger index
  const nextI = () => String(seq++);
  // a watched battle's report (show() sets it): the sides by name, no "You", the battle's own line
  let watchedView = false;
  const sideName = (side: BattleSide): string => t(`endScreen.side.${side}`);
  const sideFlag = (side: BattleSide): string => `<span class="fg ${side}">${uiIconSVG('modeFlag', 24, 'currentColor')}</span>`;

  function tile(
    parent: HTMLElement,
    key: string | null,
    label: string,
    opts: TileOptions = {},
  ): HTMLElement {
    const t = el('div', `es-tal es-in${opts.hot ? ' hot' : ''}`, parent);
    t.style.setProperty('--i', nextI());
    const v = el('div', 'v', t);
    const k = el('div', 'k', t);
    k.innerHTML = `${opts.icon ? uiIconSVG(opts.icon, 16) : ''}<span>${opts.short ?? label}</span>`;
    // the wide record shows the glyph and the figure alone (page 11's .me .k), a phone the short label: the full label
    // stays in the hover tip and for assistive technology
    t.dataset.tip = label;
    if (opts.short) k.setAttribute('aria-label', label);
    if (opts.text != null) v.textContent = opts.text;
    else countUp(v, opts.value || 0, { delayMs: 260 + seq * 60, fmt: opts.fmt });
    if (key) host.dataset[key] = String(opts.datasetV != null ? opts.datasetV : Math.round(opts.value || 0));
    return t;
  }

  function renderRoomHeading(
    parent: HTMLElement,
    state: SerializedLobby,
    nextRound: number,
  ): void {
    const mode = state.mode === 'lan' ? t('endScreen.lan') : t('endScreen.private');
    const head = el('div', 'es-room-head', parent);
    const modeIcon = el('span', 'es-room-mode-icon', head);
    modeIcon.innerHTML = uiIconSVG(state.mode === 'lan' ? 'battleLan' : 'battlePrivate', 21);
    const roomTitle = el('span', 'es-room-title', head);
    roomTitle.innerHTML = `<span>${mode}</span><b>${state.roomCode || ''}</b>`;
    const round = el('span', 'es-room-round', head);
    round.innerHTML = `${uiIconSVG('rematch', 16)}<span>${t('endScreen.round', { n: nextRound })}</span>`;
  }

  function renderRoomPlayer(
    parent: HTMLElement,
    player: LobbyPlayer,
    playerId: string,
  ): void {
    const row = el('div', `es-room-player${player.ready ? ' ready' : ''}`, parent);
    const icon = el('span', 'ri', row);
    if (player.specId) {
      maskIcon(icon, player.specId, 'side_silhouette',
        player.ready ? 'var(--ok)' : 'var(--ink-2)');
    }
    const copy = el('span', 'room-copy', row);
    const name = el('span', 'rn', copy);
    const vehicle = vehicleName(player.specId) || t('endScreen.noVehicle');
    name.textContent = `${player.name || t('playMenu.commander.fallback')}${player.id === playerId ? t('endScreen.you') : ''}`;
    el('span', 'rv', copy).textContent = vehicle;
    const status = el('span', 'rs', row);
    const statusIcon = player.team === 'spectator' ? 'scope' : player.ready ? 'check' : 'clock';
    const statusText = player.team === 'spectator' ? t('endScreen.watching') : player.ready ? t('endScreen.ready') : t('endScreen.notReady');
    status.innerHTML = `${uiIconSVG(statusIcon, 13)}<span>${statusText}</span>`;
  }

  function renderRoomPlayers(
    parent: HTMLElement,
    state: SerializedLobby,
    playerId: string,
  ): void {
    const players = el('div', 'es-room-players', parent);
    for (const player of state.players) renderRoomPlayer(players, player, playerId);
  }

  function renderReadyMeter(
    controls: HTMLElement,
    nextRound: number,
    readyCount: number,
    activeCount: number,
  ): void {
    const meter = el('div', 'es-ready-meter', controls);
    const readyPct = activeCount ? Math.round((readyCount / activeCount) * 100) : 0;
    meter.innerHTML = `${uiIconSVG('check', 15)}<span class="meter-label">${t('endScreen.readyForRound', { n: nextRound })}</span>` +
      `<b class="num">${readyCount} / ${activeCount}</b><span class="es-ready-track"><span class="es-ready-fill" style="width:${readyPct}%"></span></span>`;
  }

  function renderReadyButton(
    controls: HTMLElement,
    state: SerializedLobby,
    me: LobbyPlayer | undefined,
  ): void {
    if (!me || me.team === 'spectator') return;
    const ready = action(controls, me.ready ? 'secondary' : 'primary', 'ready', me.ready ? 'close' : 'check',
      me.ready ? t('endScreen.notReady') : t('endScreen.readyNext'), me.ready ? 'ready-now' : 'needs-ready');
    ready.disabled = state.phase !== 'waiting' || me.connected === false || !me.specId;
    ready.setAttribute('aria-pressed', String(!!me.ready));
    ready.setAttribute('aria-label', me.ready ? t('playMenu.ready.markNotReady') : t('playMenu.ready.markReady'));
    ready.addEventListener('click', () => {
      bus.emit('ui:click', {});
      bus.emit('ui:roomReady', { ready: !me.ready });
    });
  }

  function renderHostStartButton(
    controls: HTMLElement,
    state: SerializedLobby,
    everyoneReady: boolean,
  ): void {
    const start = action(controls, 'secondary', 'start', everyoneReady ? 'rematch' : 'clock',
      everyoneReady ? t('endScreen.startNext') : t('endScreen.waitingTeam'), everyoneReady ? 'can-start' : '');
    start.disabled = state.phase !== 'waiting' || !everyoneReady;
    start.addEventListener('click', () => {
      bus.emit('ui:click', {});
      bus.emit('ui:roomStart', {});
    });
  }

  function renderRoomActions(
    panel: HTMLElement,
    context: EndScreenRoomContext,
    me: LobbyPlayer | undefined,
    activeCount: number,
    readyCount: number,
    nextRound: number,
  ): void {
    const controls = el('div', 'es-room-actions', panel);
    const everyoneReady = activeCount > 0 && readyCount === activeCount;
    renderReadyMeter(controls, nextRound, readyCount, activeCount);
    renderReadyButton(controls, context.state, me);
    if (context.role === 'host') renderHostStartButton(controls, context.state, everyoneReady);
  }

  function renderRematchPanel(panel: HTMLElement): void {
    panel.textContent = '';
    const context = roomContext;
    if (!context?.state) {
      panel.remove();
      rematchPanel = null;
      return;
    }
    const { state, playerId } = context;
    const me = state.players.find((player) => player.id === playerId);
    const active = state.players.filter((player) => player.team !== 'spectator');
    const readyCount = active.filter((player) => player.ready).length;
    const nextRound = (Number(state.round) || 0) + 1;
    const info = el('div', 'es-room-info', panel);
    renderRoomHeading(info, state, nextRound);
    renderRoomPlayers(info, state, playerId);
    renderRoomActions(panel, context, me, active.length, readyCount, nextRound);
  }

  function renderTeamRosterRow(
    listRoot: HTMLElement,
    result: EndScreenTeamRow,
    hostile: boolean,
    maxDamage: number,
    revives: boolean,
  ): void {
    const row = el('div', `es-tr ${hostile ? 'foe' : 'ally'}${result.isPlayer ? ' me' : ''}${result.dead ? ' dead' : ''}`, listRoot);
    row.setAttribute('role', 'listitem');
    // (ac130-fx-228) a gunship pilot's row: the AC-130, not the garage tank under the gunship's guns
    const vehicle = result.aircraft ? killSourceIdentity('ac130')?.label ?? '' : vehicleName(result.specId);
    const details = rosterRowDetails(result, revives);
    // one table row on the wide windows (the direction's 11-end-screen .row): the name and its vehicle on one line, the
    // kills (and a reviving battle's deaths) in their own columns; the narrow sheets keep the counts as words
    row.innerHTML =
      `${result.aircraft ? '' : flagSeat(result.specId)}<span class="si"></span>` +
      `<span class="identity"><span class="nm">${result.isPlayer && !watchedView ? `<b class="you">${t('endScreen.you')}</b>` : ''}${escapeHtml(result.name || result.id)}</span>` +
      `<span class="veh">${escapeHtml(vehicle)}${details.length ? `<span class="dt"> · ${details.map(escapeHtml).join(' · ')}</span>` : ''}</span></span>` +
      `<span class="kc num" data-tip="${escapeHtml(t('endScreen.tile.kills'))}">${Math.max(0, Math.floor(Number(result.kills) || 0))}</span>` +
      (revives ? `<span class="dc num" data-tip="${escapeHtml(t('endScreen.deaths'))}">${Math.max(0, Math.floor(Number(result.deaths) || 0))}</span>` : '') +
      '<span class="output"><span class="ov"></span><span class="obar" aria-hidden="true"><i></i></span></span>' +
      `<span class="st">${uiIconSVG(result.dead ? 'skull' : 'check', 16)}</span>`;
    const damage = Math.max(0, Number(result.dmg) || 0);
    const output = requiredDescendant<HTMLElement>(row, '.output');
    output.setAttribute('role', 'meter');
    output.setAttribute('aria-label', t('endScreen.damageAria'));
    output.setAttribute('aria-valuemin', '0');
    output.setAttribute('aria-valuemax', String(Math.max(1, Math.round(maxDamage))));
    output.setAttribute('aria-valuenow', String(Math.round(damage)));
    output.setAttribute('aria-valuetext', t('endScreen.damageValueAria', { value: fmtN(damage) }));
    output.dataset.tip = t('endScreen.damageValueAria', { value: fmtN(damage) });
    requiredDescendant<HTMLElement>(row, '.ov').textContent = fmtN(damage);
    requiredDescendant<HTMLElement>(row, '.obar i').style.width =
      `${damageComparisonPercent(damage, maxDamage)}%`;
    const stateMark = requiredDescendant<HTMLElement>(row, '.st');
    stateMark.setAttribute('role', 'img');
    stateMark.setAttribute('aria-label', result.dead ? t('endScreen.destroyed') : t('endScreen.survived'));
    stateMark.dataset.tip = result.dead ? t('endScreen.destroyed') : t('endScreen.survived');
    const silhouette = requiredDescendant<HTMLElement>(row, '.si');
    if (result.aircraft) {
      silhouette.innerHTML = uiIconSVG('modeAc130', 16, result.dead ? 'var(--danger)' : 'var(--ink-2)');
      silhouette.style.display = 'inline-flex'; silhouette.style.alignItems = 'center'; silhouette.style.justifyContent = 'center';
    } else maskIcon(silhouette, result.specId || result.id,
      'side_silhouette', result.dead ? 'var(--danger)' : 'var(--ink-2)');
  }

  function renderTeamRoster(
    rosters: HTMLElement,
    title: string,
    list: EndScreenTeamRow[],
    hostile: boolean,
    maxDamage: number,
    revives: boolean,
  ): void {
    const panel = el('div', `es-roster ${hostile ? 'foe' : 'ally'}`, rosters);
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', title);
    // the side's name and its kills in its ink over glyph column heads (the direction's 11-end-screen .tbl head): the
    // wide windows' rosters stand in for the scoreboard, the narrow sheets keep the words
    const side = summarizeTeam(list);
    const columns = el('div', 'es-roster-cols', panel);
    const glyphHead = (icon: string, label: string, cls: string): string =>
      `<span class="ch ${cls}" data-tip="${escapeHtml(label)}">${uiIconSVG(icon, 14)}<span class="sr">${escapeHtml(label)}</span></span>`;
    columns.innerHTML = `<span class="side"><b>${escapeHtml(title)}</b><span class="tot num">${fmtN(side.kills)}</span>` +
      `<span class="alive num" data-tip="${escapeHtml(t('endScreen.survivors'))}">${uiIconSVG('check', 12)}${side.alive}/${side.total}</span></span>` +
      `<span class="word">${t('endScreen.roster.colCombatant')}</span>` +
      glyphHead('skull', t('endScreen.tile.kills'), 'kc') + (revives ? glyphHead('rematch', t('endScreen.deaths'), 'dc') : '') +
      glyphHead('damage', t('endScreen.damage'), 'dg') + `<span class="ch st" aria-hidden="true"></span>`;
    const listRoot = el('div', 'es-roster-list', panel);
    listRoot.setAttribute('role', 'list');
    listRoot.setAttribute('aria-label', t('endScreen.roster.damageResults', { title }));
    listRoot.tabIndex = 0;
    if (!list.length) {
      el('div', 'es-none', listRoot).textContent = t('endScreen.noCombatants');
      return;
    }
    for (const result of list) renderTeamRosterRow(listRoot, result, hostile, maxDamage, revives);
  }

  function outcomeLine(result: EndScreenResult, sum: EndScreenSummary): string {
    if (sum.reason === 'network_disconnect') {
      return t('endScreen.outcome.disconnect');
    }
    // Infected's own endings (the outbreak took every survivor; the survivors held out to extraction)
    if (sum.reason === 'outbreak_complete') return t('endScreen.outcome.outbreak');
    if (sum.reason === 'survivors_extracted') return t('endScreen.outcome.extracted');
    if (result === 'victory') {
      return sum.playerDead
        ? t('endScreen.outcome.victory.survived')
        : t('endScreen.outcome.victory.alive');
    }
    if (result === 'defeat') {
      return sum.reason === 'time_limit' ? t('endScreen.outcome.defeat.time') : t('endScreen.outcome.defeat');
    }
    if (result !== 'draw') return '';
    return sum.reason === 'time_limit'
      ? t('endScreen.outcome.draw.time')
      : t('endScreen.outcome.draw.stalemate');
  }

  function renderReportHero(result: EndScreenResult, sum: EndScreenSummary): void {
    // perf-246: the report covers the scene (the Garage warms on the canvas behind it): the battlefield's end still
    // (battle-end-r1) under the direction's grade, else the battle's frozen last frame (src/ui/reportBackdrop.ts)
    const backdrop = reportBackdrop(battleEndArt(sum.mapId));
    host.style.setProperty('--report-map', backdrop ? `url("${backdrop}")` : 'none');
    const hero = el('div', 'es-hero', host);
    const kick = el('div', 'es-kick es-in', hero);
    kick.style.setProperty('--i', nextI());
    kick.textContent = t('endScreen.kicker');
    if (watchedView) {
      renderWatchedHead(hero, result, sum);
      return;
    }
    const bannerClass = result === 'victory' ? 'v' : result === 'defeat' ? 'd' : 'n';
    const bannerText = result === 'victory' ? t('endScreen.victory')
      : result === 'defeat' ? t('endScreen.defeat')
        : result === 'draw' ? t('endScreen.draw') : t('endScreen.battleOver');
    // the direction's head (11-end-screen .head h1): the result as the display headline, the score beside it, the sides'
    // kills, own solid and enemy hollow in the team inks
    const headline = el('div', 'es-headline', hero);
    const banner = el('div', `es-ban ${bannerClass}`, headline);
    banner.textContent = bannerText;
    host.dataset.banner = bannerText;
    if (sum.allies.length || sum.enemies.length) {
      const own = fmtN(summarizeTeam(sum.allies).kills), enemy = fmtN(summarizeTeam(sum.enemies).kills);
      const score = el('div', 'es-score', headline);
      score.setAttribute('role', 'img');
      score.setAttribute('aria-label', t('endScreen.scoreAria', { own, enemy }));
      score.innerHTML = `<span class="o">${own}</span><span class="sep" aria-hidden="true">–</span><span class="e">${enemy}</span>`;
    }
    el('div', 'es-rule', hero);
    const sub = el('div', 'es-sub es-in', hero);
    sub.style.setProperty('--i', nextI());
    sub.innerHTML = `${sum.playerVehicle ? `<b>${escapeHtml(sum.playerVehicle)}</b>` : ''}` +
      `<span class="es-why">${outcomeLine(result, sum)}</span>`;
    if (sum.finalBlow) {
      const blow = el('div', 'es-blow es-in', hero);
      blow.style.setProperty('--i', nextI());
      blow.innerHTML = `${uiIconSVG(sum.finalBlow.cause === 'ammorack' ? 'ammoRack' : sum.finalBlow.cause === 'ram' ? 'killRam' : 'skull', 18)}<span>${escapeHtml(finalBlowLine(sum.finalBlow))}</span>`;
      host.dataset.finalBlow = `${sum.finalBlow.cause}:${sum.finalBlow.attacker || ''}>${sum.finalBlow.target}`;
    } else {
      delete host.dataset.finalBlow;
    }
    renderReportMetadata(hero, sum);
    if (sum.campaign) renderCampaignDebrief(hero, sum.campaign);
  }

  /**
   * A watched battle's head (watch-mode-243): nobody won or lost, so the headline is the winning side's flag and name
   * (a draw says so), the score is by side in the battle's inks (Alpha solid, Bravo hollow, as the HUD drew them), and
   * the final blow and the meta strip follow; no line about a player's tank.
   */
  function renderWatchedHead(hero: HTMLElement, result: EndScreenResult, sum: EndScreenSummary): void {
    const { winner, alpha, bravo } = watchedResult(result, sum);
    const headline = el('div', 'es-headline', hero);
    const banner = el('div', `es-ban w ${winner ?? 'n'}`, headline);
    const word = winner ? t('endScreen.watch.wins', { side: sideName(winner) })
      : result === 'draw' ? t('endScreen.draw') : t('endScreen.battleOver');
    banner.innerHTML = `${winner ? sideFlag(winner) : ''}<span>${escapeHtml(word)}</span>`;
    host.dataset.banner = word;
    host.dataset.winner = winner ?? 'none';
    const score = el('div', 'es-score', headline);
    score.setAttribute('role', 'img');
    score.setAttribute('aria-label', t('endScreen.watch.scoreAria', { alpha: fmtN(alpha), bravo: fmtN(bravo) }));
    score.innerHTML = `<span class="o">${fmtN(alpha)}</span><span class="sep" aria-hidden="true">–</span><span class="e">${fmtN(bravo)}</span>`;
    host.dataset.score = `${Math.round(alpha)}:${Math.round(bravo)}`;
    el('div', 'es-rule', hero);
    if (sum.finalBlow) {
      const blow = el('div', 'es-blow es-in', hero);
      blow.style.setProperty('--i', nextI());
      blow.innerHTML = `${uiIconSVG(sum.finalBlow.cause === 'ammorack' ? 'ammoRack' : sum.finalBlow.cause === 'ram' ? 'killRam' : 'skull', 18)}<span>${escapeHtml(finalBlowLine(sum.finalBlow))}</span>`;
      host.dataset.finalBlow = `${sum.finalBlow.cause}:${sum.finalBlow.attacker || ''}>${sum.finalBlow.target}`;
    } else {
      delete host.dataset.finalBlow;
    }
    renderReportMetadata(hero, sum);
  }

  function renderReportMetadata(hero: HTMLElement, sum: EndScreenSummary): void {
    const meta = el('div', 'es-meta es-in', hero);
    meta.style.setProperty('--i', nextI());
    const bits: string[] = [];
    const mode = sum.mode && Object.hasOwn(GAME_MODE_DEFINITIONS, sum.mode)
      ? GAME_MODE_DEFINITIONS[sum.mode as keyof typeof GAME_MODE_DEFINITIONS] : null;
    if (mode) bits.push(`<span class="mode">${uiIconSVG(mode.icon, 14)}<b>${escapeHtml(battleLoadModeLabel(mode.id))}</b></span>`);
    if (sum.map) bits.push(`<span>${uiIconSVG('map', 14)}<b>${escapeHtml(sum.map)}</b></span>`);
    if (sum.timeS > 0) {
      bits.push(`<span>${uiIconSVG('clock', 14)}<b>${fmtTime(sum.timeS)}</b></span>`);
    }
    if (sum.hordeWave != null && Number.isFinite(sum.hordeWave)) {
      bits.push(`<span>${uiIconSVG('modeHorde', 14)}<b>${t('endScreen.horde.wave', { wave: String(Math.max(1, Math.floor(sum.hordeWave))) })}</b></span>`);
      host.dataset.hordeWave = String(Math.floor(sum.hordeWave));
    }
    // Jev commander (2026-09-25): the report says who commanded the bots when it was not the classic brain
    if (sum.brains && (sum.brains.enemy === 'jev' || sum.brains.allies === 'jev')) {
      const brainName = (id: string): string => t(id === 'jev' ? 'brain.jev' : 'brain.classic');
      bits.push(`<span>${uiIconSVG('battleBots', 14)}<b>${t('endScreen.brain.enemy', { brain: brainName(sum.brains.enemy) })}</b></span>`);
      if (sum.brains.allies === 'jev') {
        bits.push(`<span>${uiIconSVG('battleBots', 14)}<b>${t('endScreen.brain.allies', { brain: brainName('jev') })}</b></span>`);
      }
      host.dataset.brains = `${sum.brains.enemy}/${sum.brains.allies}`;
    } else {
      delete host.dataset.brains;
    }
    meta.innerHTML = bits.join('');
    if (sum.map) host.dataset.map = sum.map;
    if (sum.timeS > 0) host.dataset.durationS = String(Math.floor(sum.timeS));
  }

  // batch 19 (2026-09-14): a Frontline Assault sortie on a ladder map debriefs the operation —
  // sectors, the stars this sortie earned (held / under par / no ally lost) and what opens next
  function renderCampaignDebrief(hero: HTMLElement, debrief: CampaignDebrief): void {
    const block = el('div', 'es-campaign es-in', hero);
    block.style.setProperty('--i', nextI());
    block.dataset.campaignOperation = debrief.operation.id;
    block.dataset.campaignStars = String(debrief.stars);
    const kicker = el('div', 'ck', block);
    kicker.textContent = t('endScreen.campaign.kicker', { index: String(debrief.operation.index), total: '6' });
    const title = el('div', 'ct', block);
    title.textContent = t(`campaign.op.${debrief.operation.id}.title`);
    const summary = el('div', 'cs', block);
    const timeBits = debrief.durationS != null
      ? t('endScreen.campaign.time', { time: fmtTime(debrief.durationS), par: fmtTime(debrief.parTimeS) }) : '';
    summary.innerHTML = `${t(debrief.cleared ? 'endScreen.campaign.cleared' : 'endScreen.campaign.lost', {
      taken: `<b>${debrief.sectorsTaken}</b>`, total: String(debrief.sectorsTotal),
    })}${timeBits ? ` · ${timeBits}` : ''}`;
    const stars = el('div', 'stars', block);
    stars.setAttribute('role', 'img');
    stars.setAttribute('aria-label', t('endScreen.campaign.starsAria', { stars: String(debrief.stars) }));
    const labels = ['endScreen.campaign.star.held', 'endScreen.campaign.star.par', 'endScreen.campaign.star.allies'];
    const lit = [debrief.cleared, debrief.underPar, debrief.noAllyLost];
    labels.forEach((key, index) => {
      const star = el('i', lit[index] ? 'on' : '', stars);
      star.innerHTML = uiIconSVG('star', 20); // the sprite's star, filled when earned
      star.dataset.tip = t(key);
    });
    const next = el('div', 'cn', block);
    next.textContent = !debrief.cleared
      ? t('endScreen.campaign.retryHint')
      : debrief.next
        ? t('endScreen.campaign.nextHint', { title: t(`campaign.op.${debrief.next.id}.title`) })
        : t('endScreen.campaign.complete');
  }

  function renderMiniStat(
    parent: HTMLElement,
    icon: string,
    key: string | null,
    label: string,
    value: string,
    detail = '',
  ): void {
    const item = el('div', 'es-mini', parent);
    item.dataset.tip = label;
    item.innerHTML = `<div class="mk">${uiIconSVG(icon, 14)}<span>${label}</span></div>` +
      `<div class="mv">${value}</div>${detail ? `<div class="md">${detail}</div>` : ''}`;
    if (key) host.dataset[key] = value;
  }

  /** The combat details' figures (the tiles carry the six that lead: damage, kills, accuracy, spotted, assist, blocked). */
  function renderSecondaryStats(parent: HTMLElement, stats: EndScreenStats, deaths: number | null): void {
    const penetrationRate = stats.hits > 0
      ? Math.round((stats.pens / stats.hits) * 100) : 0;
    renderMiniStat(parent, 'penetration', null, t('endScreen.penetrations'),
      `${stats.pens} / ${stats.hits}`, t('endScreen.penetrationPercent', { percent: penetrationRate }));
    renderMiniStat(parent, 'repair', null, t('endScreen.modules'), String(stats.modulesDestroyed ?? 0));
    renderMiniStat(parent, 'damage', 'received', t('endScreen.damageReceived'), fmtN(stats.received));
    // owner 2026-09-21: in a reviving mode deaths are a stat of the battle, not the player's end state
    if (deaths != null) renderMiniStat(parent, 'skull', 'deaths', t('endScreen.deaths'), String(deaths));
    host.dataset.hits = String(stats.hits);
    host.dataset.pens = String(stats.pens);
    host.dataset.received = String(Math.round(stats.received));
    host.dataset.fired = String(stats.fired);
    host.dataset.assist = String(Math.round(stats.assist));
  }

  function renderBestShot(parent: HTMLElement, bestShot: EndScreenBestShot | null | undefined): void {
    if (!bestShot || (bestShot.damage || 0) <= 0) return;
    const strip = el('div', 'es-best', parent);
    strip.style.setProperty('--i', nextI());
    const details = [
      bestShot.zone,
      bestShot.distM ? `${Math.round(bestShot.distM)} m` : '',
      bestShot.destroyed ? t('endScreen.killConfirmed') : '',
    ].filter(Boolean).join(' · ');
    strip.innerHTML =
      `<span class="bk">${uiIconSVG('autoAim', 16)}<span>${t('endScreen.bestShot')}</span></span>` +
      `<span class="bd">${fmtN(bestShot.damage)}</span>` +
      `<span class="bt"><b>${escapeHtml(bestShot.targetName || t('endScreen.enemyVehicle'))}</b><small>${escapeHtml(details)}</small></span>`;
    host.dataset.bestShot = String(Math.round(bestShot.damage));
  }

  function renderAwards(parent: HTMLElement, awards: BattleAwards | null | undefined): void {
    const medals = (awards?.medals ?? []).map((id) => MEDALS.find((medal) => medal.id === id)).filter((medal) => medal != null);
    const tiers = (awards?.achievements ?? []).map((award) => ({
      def: ACHIEVEMENTS.find((achievement) => achievement.id === award.id), tier: award.tier,
    })).filter((entry) => entry.def != null);
    host.dataset.medals = String(medals.length);
    if (!medals.length && !tiers.length) return;
    const strip = el('div', 'es-awards', parent);
    strip.setAttribute('aria-label', t('endScreen.medals.aria'));
    strip.style.setProperty('--i', nextI());
    const attr = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    strip.innerHTML = `<div class="ak">${uiIconSVG('gold', 20)}<span>${t('endScreen.medals.heading')}</span><small>${medals.length + tiers.length}</small></div>` +
      `<div class="al">${medals.map(medal => `<button type="button" class="aw${medal.tier==='signature'?' signature':''}" data-award-earned="true" data-medal-tip="${medal.id}" aria-label="${attr(t(`service.medal.${medal.id}.name`))}">${medalSVG(medal,60)}<b>${t(`service.medal.${medal.id}.name`)}</b></button>`).join('')}` +
      `${tiers.map(({def,tier})=>`<button type="button" class="aw tier" data-achievement-tip="${def!.id}" data-award-tier="${tier}" aria-label="${attr(t(`service.achievement.${def!.id}.name`))}">${achievementSVG(def!,tier,60)}<b>${t(`service.achievement.${def!.id}.name`)} ${['','I','II','III'][tier]}</b></button>`).join('')}</div>`;
  }

  /**
   * The battle's timeline (the direction's 11-end-screen .beat): one line from the start to the result, a diamond at
   * each beat (the enemy's ink for what the player lost), the label above it (the beat's glyph; a kill's flag,
   * silhouette and callsign) and its battle time under it; battleBeats.ts layoutBeats() picks the labels.
   */
  function renderBattleBeats(result: EndScreenResult, sum: EndScreenSummary): void {
    const beats = layoutBeats(sum.beats ?? [], sum.timeS, watchedView);
    if (!beats.length) return;
    const strip = el('section', 'es-beat es-in', host);
    strip.setAttribute('aria-label', t('endScreen.beat.aria'));
    strip.style.setProperty('--i', nextI());
    el('i', 'ln', strip);
    const rows = [...sum.enemies, ...sum.allies];
    for (const beat of beats) {
      const mark = el('div', `ev k-${beat.kind}${beat.side ? ` s-${beat.side}` : ''}`, strip);
      mark.style.left = `${(beat.x * 100).toFixed(2)}%`;
      if (beat.labelled) mark.style.setProperty('--room', beat.room.toFixed(3));
      if (beat.labelled) mark.insertAdjacentHTML('beforeend', `<span class="lb">${beatLabel(beat, rows)}</span>`);
      else mark.dataset.tip = beatText(beat, rows);
      el('i', `d${beatIsLoss(beat) ? ' loss' : ''}`, mark);
      if (beat.labelled) el('span', 't num', mark).textContent = fmtTime(beat.t);
      if (beat.kind === 'kill' && beat.labelled) {
        const silhouette = mark.querySelector<HTMLElement>('.si');
        if (silhouette) maskIcon(silhouette, beat.specId || beat.id || '', 'side_silhouette', 'currentColor');
      }
    }
    const end = el('div', 'ev end', strip);
    end.style.left = '100%';
    if (watchedView) {
      // the line ends on the winning side's flag and name (a draw's mark otherwise), in that side's ink
      const { winner } = watchedResult(result, sum);
      if (winner) end.classList.add(`s-${winner}`);
      end.insertAdjacentHTML('beforeend', `<span class="lb">${winner ? sideFlag(winner) : uiIconSVG('statDraw', 16)}` +
        `<span class="tx">${escapeHtml(winner ? sideName(winner) : t('garage.record.draw'))}</span></span>`);
      el('i', 'd', end);
      el('span', 't num', end).textContent = fmtTime(sum.timeS);
      host.dataset.beats = String(beats.length);
      return;
    }
    const glyph = result === 'victory' ? 'statVictory' : result === 'defeat' ? 'statDefeat' : 'statDraw';
    // the result in sentence case, as the service record names it (the headline's own copy is set in capitals)
    const word = result === 'victory' ? t('garage.record.victory') : result === 'defeat' ? t('garage.record.defeat')
      : result === 'draw' ? t('garage.record.draw') : host.dataset.banner || '';
    end.insertAdjacentHTML('beforeend', `<span class="lb">${uiIconSVG(glyph, 16)}<span class="tx">${escapeHtml(word)}</span></span>`);
    el('i', `d${result === 'defeat' ? ' loss' : ''}`, end);
    el('span', 't num', end).textContent = fmtTime(sum.timeS);
    host.dataset.beats = String(beats.length);
  }

  function beatIsLoss(beat: PlacedBeat): boolean {
    // a battle beat carries its side's ink instead (endScreenPresentation.css .s-alpha / .s-bravo)
    if (beat.side) return false;
    return beat.kind === 'loss' || beat.kind === 'death' || (beat.own === false);
  }

  function beatText(beat: PlacedBeat, rows: readonly EndScreenTeamRow[]): string {
    switch (beat.kind) {
      case 'kill': {
        const row = rows.find((candidate) => String(candidate.id) === beat.id);
        return row?.name || vehicleName(beat.specId) || t('endScreen.enemyVehicle');
      }
      case 'zone': return beat.side ? t('endScreen.beat.sideZone', { side: sideName(beat.side), zone: beat.label ?? '' })
        : t(beat.own ? 'endScreen.beat.zoneTaken' : 'endScreen.beat.zoneLost', { zone: beat.label ?? '' });
      case 'flag': return beat.side ? t('endScreen.beat.sideFlag', { side: sideName(beat.side) })
        : t(beat.own ? 'endScreen.beat.flagTaken' : 'endScreen.beat.flagLost');
      case 'goal': return beat.side ? t('endScreen.beat.sideGoal', { side: sideName(beat.side) })
        : t(beat.own ? 'endScreen.beat.goal' : 'endScreen.beat.goalConceded');
      case 'loss': return moduleName(beat.id ?? '');
      case 'death': return t('endScreen.beat.destroyed');
      case 'spot': return t('endScreen.beat.spot');
    }
  }

  function beatLabel(beat: PlacedBeat, rows: readonly EndScreenTeamRow[]): string {
    const glyph = beat.kind === 'kill' ? 'autoAim' : beat.kind === 'zone' ? 'modeZones' : beat.kind === 'flag' ? 'modeFlag'
      : beat.kind === 'goal' ? 'modeTurbo' : beat.kind === 'loss' ? moduleGlyph(beat.id ?? '') : beat.kind === 'death' ? 'skull'
        : 'optics';
    const identity = beat.kind === 'kill' ? `${flagSeat(beat.specId)}<span class="si"></span>` : '';
    return `${uiIconSVG(glyph, 16)}${identity}<span class="tx">${escapeHtml(beatText(beat, rows))}</span>`;
  }

  /** The flags of this render (roster rows, kill beats): flags.ts loads with its art once, after the screen is up. */
  let flagsPass = 0;
  function fillFlags(): void {
    const pass = String(++flagsPass);
    host.dataset.flagsPass = pass;
    if (!host.querySelector('.fl[data-nation]')) return;
    void import('./flags.ts').then(({ flagIconHTML }) => {
      if (host.dataset.flagsPass !== pass) return; // a later report took the screen
      for (const seat of host.querySelectorAll<HTMLElement>('.fl[data-nation]')) {
        seat.innerHTML = flagIconHTML(seat.dataset.nation || '', 16, 12);
      }
    }, () => {});
  }

  function renderKillList(
    parent: HTMLElement,
    result: EndScreenResult,
    kills: EndScreenKillRow[],
  ): void {
    const killBlock = el('div', 'es-kill-block', parent);
    const killHead = el('div', 'es-ph', killBlock);
    killHead.innerHTML = `<span class="ph-title">${uiIconSVG('skull', 15)}` +
      `<span>${t('endScreen.killsHeading')}</span></span><span>${kills.length}</span>`;
    const killList = el('div', 'es-kill-list', killBlock);
    if (!kills.length) {
      el('div', 'es-none', killList).textContent = result === 'victory'
        ? t('endScreen.noKillsVictory') : t('endScreen.noKillsBattle');
    }
    for (const kill of kills) {
      const row = el('div', 'es-kr', killList);
      row.innerHTML = '<span class="si"></span>' +
        `<span class="nm">${escapeHtml(kill.name || kill.id)}</span>` +
        `<span class="dm">${kill.dmg > 0 ? fmtN(kill.dmg) : ''}</span>`;
      maskIcon(requiredDescendant<HTMLElement>(row, '.si'), kill.specId || kill.id,
        'side_silhouette', 'var(--accent-hi)');
    }
  }

  function renderPersonalDebrief(
    report: HTMLElement,
    result: EndScreenResult,
    sum: EndScreenSummary,
  ): void {
    const personal = el('section', 'es-debrief personal', report);
    personal.setAttribute('aria-label', t('endScreen.personal.aria'));
    const heading = el('div', 'es-dh', personal);
    heading.innerHTML = `<span class="titleline">${uiIconSVG('battleRecord', 18)}` +
      `<span class="ey">${t('endScreen.personal.title')}</span></span>`;
    const statGrid = el('div', 'es-stat-grid', personal);
    if (sum.playerAircraft) {
      // (ac130-fx-228) the AC-130's icon in the vehicle card's place
      statGrid.classList.add('has-vehicle');
      const vehicleCard = el('div', 'es-vehicle-card', statGrid);
      const aircraft = killSourceIdentity('ac130');
      vehicleCard.innerHTML = uiIconSVG(aircraft?.icon ?? 'modeAc130', 56, 'var(--ink-1)');
      vehicleCard.setAttribute('role', 'img');
      vehicleCard.setAttribute('aria-label', t('endScreen.vehicle.alt', { name: aircraft?.label ?? '' }));
    } else if (sum.playerSpecId) {
      statGrid.classList.add('has-vehicle');
      const vehicleCard = el('div', 'es-vehicle-card', statGrid);
      const vehicle = el('img', '', vehicleCard);
      vehicle.src = iconUrl(sum.playerSpecId, 'angle');
      vehicle.alt = sum.playerVehicle ? t('endScreen.vehicle.alt', { name: sum.playerVehicle }) : t('endScreen.vehicle.altFallback');
      showHeroVehicle(vehicleCard, sum.playerSpecId, vehicle, sum.playerVehicle || '');
    }
    tile(statGrid, 'dealt', t('endScreen.tile.dealt'), {
      value: Math.round(sum.stats.dealt), hot: true, icon: 'damage', short: t('endScreen.tile.short.dealt'),
    });
    tile(statGrid, 'kills', t('endScreen.tile.kills'), {
      value: sum.playerKills ?? sum.kills.length, datasetV: sum.playerKills ?? sum.kills.length, icon: 'skull',
    });
    tile(statGrid, 'accuracy', t('garage.record.accuracy'), {
      value: shotAccuracy(sum.stats.hits, sum.stats.fired), icon: 'scope',
    });
    statGrid.lastElementChild?.setAttribute('data-stat','accuracy');
    // the direction's six (11-end-screen .me .k): the three that lead, then what the player lit, helped and turned away
    tile(statGrid, null, t('endScreen.spotted'), { value: sum.stats.spotted ?? 0, icon: 'optics', short: t('endScreen.tile.short.spotted') });
    tile(statGrid, 'assist', t('endScreen.assist'), { value: Math.round(sum.stats.assist), icon: 'team', short: t('endScreen.tile.short.assist') });
    tile(statGrid, 'blocked', t('endScreen.damageBlocked'), { value: Math.round(sum.stats.blocked), icon: 'shield', short: t('endScreen.tile.short.blocked') });
    renderAwards(personal, sum.awards);
    renderBestShot(personal, sum.bestShot);
    const detail = el('details', 'es-combat-details', personal);
    const toggle = el('summary', '', detail);toggle.tabIndex=0;toggle.textContent = t('endScreen.combatDetails');
    const blow = host.querySelector('.es-blow'); if (blow) personal.insertBefore(blow, detail);
    renderSecondaryStats(el('div', 'es-stat-secondary', detail), sum.stats,
      sum.revives ? Math.max(0, Math.floor(Number(sum.playerDeaths) || 0)) : null);
    renderKillList(detail, result, sum.kills);
  }

  // the teams' titles: yours and the enemy's, or in a watched battle the sides by name
  const allyTitle = (): string => watchedView ? sideName('alpha') : t('endScreen.team.ally');
  const enemyTitle = (): string => watchedView ? sideName('bravo') : t('endScreen.team.enemy');

  function renderTeamDebrief(report: HTMLElement, sum: EndScreenSummary): void {
    const teams = el('section', 'es-debrief teams', report);
    teams.setAttribute('aria-label', t('endScreen.team.aria'));
    const allyStats = summarizeTeam(sum.allies);
    const enemyStats = summarizeTeam(sum.enemies);
    const heading = el('div', 'es-dh', teams);
    heading.innerHTML = `<span class="titleline">${uiIconSVG('team', 19)}` +
      `<span class="ey">${t('endScreen.team.outcome')}</span></span>`;
    const scoreboard = el('div', 'es-scoreboard', teams);
    scoreboard.innerHTML =
      '<div class="es-score-side ally"><div class="es-score-copy">' +
      `<div class="sl">${watchedView ? sideFlag('alpha') : uiIconSVG('team', 16)}<span>${allyTitle()}</span></div>` +
      `<div class="ss">${dotLine(t('endScreen.team.survived', { alive: allyStats.alive, total: allyStats.total, damage: fmtN(allyStats.damage) }))}</div>` +
      `</div><div class="sn">${fmtN(allyStats.kills)}</div></div>` +
      '<div class="es-score-dash">—</div>' +
      `<div class="es-score-side foe"><div class="sn">${fmtN(enemyStats.kills)}</div>` +
      `<div class="es-score-copy"><div class="sl"><span>${enemyTitle()}</span>${watchedView ? sideFlag('bravo') : uiIconSVG('team', 16)}</div>` +
      `<div class="ss">${dotLine(t('endScreen.team.survived', { alive: enemyStats.alive, total: enemyStats.total, damage: fmtN(enemyStats.damage) }))}</div>` +
      '</div></div>';
    const rosters = el('div', 'es-rosters', teams);
    const maxDamage = Math.max(0, ...sum.allies.map((row) => Number(row.dmg) || 0),
      ...sum.enemies.map((row) => Number(row.dmg) || 0));
    const revives = !!sum.revives;
    renderTeamRoster(rosters, allyTitle(), sum.allies, false, maxDamage, revives);
    renderTeamRoster(rosters, enemyTitle(), sum.enemies, true, maxDamage, revives);
    host.dataset.revives = revives ? '1' : '0';
    host.dataset.rosterAllies = String(sum.allies.length);
    host.dataset.rosterEnemies = String(sum.enemies.length);
    host.dataset.damageRows = String(sum.allies.length + sum.enemies.length);
    host.dataset.maxVehicleDamage = String(Math.round(maxDamage));
  }

  function renderEndRematch(parent: HTMLElement): void {
    if (!roomContext?.state) {
      rematchPanel = null;
      return;
    }
    rematchPanel = el('section', 'es-rematch es-in', parent);
    rematchPanel.style.setProperty('--i', String(seq + 1));
    renderRematchPanel(rematchPanel);
  }

  function renderEndActions(sum: EndScreenSummary | null = null): void {
    const actions = el('div', 'es-actions es-in', host);
    actions.style.setProperty('--i', String(seq + 3));
    if (!roomContext?.state && sum?.campaign?.next) {
      // campaign ladder: the next (or the same, after a loss) operation is one click away
      const debrief = sum.campaign;
      const next = debrief.next!;
      const cta = action(actions, 'primary', 'campaign', 'modeZones',
        t(debrief.cleared ? 'endScreen.campaign.next' : 'endScreen.campaign.retry', { title: t(`campaign.op.${next.id}.title`) }));
      cta.dataset.campaignNext = next.id;
      cta.addEventListener('click', () => {
        bus.emit('ui:click', {});
        bus.emit('ui:campaignNext', { operationId: next.id, mapId: next.mapId });
      });
    }
    if (!roomContext?.state) {
      const again = action(actions, 'primary', 'again', 'rematch', t('endScreen.battleAgain'));
      again.addEventListener('click', () => {
        bus.emit('ui:click', {});
        bus.emit('ui:battleAgain', {});
        // The covered return transaction owns dismissal. If entry is still
        // pending or acquisition fails, this report must remain usable.
      });
    }
    adoptEndOverlay(actions);
    // the commander mark signs the report at the row's far end: the brand's own still master (tools/brand-marks.mjs),
    // sized and lazy (imported, brandMark.ts's chunk would split off the boot graph)
    const mark = el('img', 'es-mark', actions);
    mark.src = '/brand/mark.svg';
    mark.alt = '';
    mark.width = 45;
    mark.height = 26;
    mark.decoding = 'async';
    mark.loading = 'lazy';
    mark.setAttribute('aria-hidden', 'true');
  }

  api = {
    root: host,
    get visible() { return visible; },

    /**
     * Render and reveal the end screen.
     * @param {''|'victory'|'defeat'|'draw'} result battle verdict
     * @param {object} sum shotInfo.buildSummary() bundle (resolved-event sums)
     */
    show(result: EndScreenResult, sum: EndScreenSummary): void {
      awardTooltip.hide();
      stopCounters();
      seq = 0;
      visible = true;
      // detach the adopted button BEFORE the innerHTML wipe would orphan it
      if (garageBtn && garageBtn.parentNode) garageBtn.parentNode.removeChild(garageBtn);
      host.textContent = '';

      const res = result || '';
      // a slow sheet holds the report back at most 1.5 s (a failed one shows it at once)
      if (!sheetLoaded) {
        host.classList.add('es-sheet-wait');
        setTimeout(() => host.classList.remove('es-sheet-wait'), 1500);
      }
      watchedView = !!sum.watched;
      host.classList.remove('result-victory', 'result-defeat', 'result-draw');
      host.classList.add(`result-${res === 'victory' || res === 'defeat' || res === 'draw' ? res : 'draw'}`);
      host.classList.toggle('watched', watchedView);
      if (!watchedView) {
        delete host.dataset.winner;
        delete host.dataset.score;
      }

      renderReportHero(res, sum);
      if (watchedView) {
        // a watched battle has no personal debrief: the report is the battle's, its sides and the ridden tank's row
        const report = el('div', 'es-report es-in', host);
        report.style.setProperty('--i', nextI());
        renderTeamDebrief(report, sum);
        renderBattleBeats(res, sum);
        renderEndActions(sum);
        fillFlags();
        host.classList.add('show');
        host.setAttribute('aria-hidden', 'false');
        document.body.classList.add('cot-si-report');
        return;
      }

      // Summary and complete teams share one readable panel, keeping rewards prominent.
      const tabs = el('div', 'es-view-tabs', host);tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label',t('endScreen.reportViews'));
      for (const [id,key,icon] of [['personal','endScreen.personal.title','battleRecord'],['teams','endScreen.team.outcome','team']] as const) {
        const button=el('button','',tabs);button.type='button';button.dataset.reportView=id;button.id=`es-tab-${id}`;button.setAttribute('role','tab');button.setAttribute('aria-controls',`es-panel-${id}`);
        button.innerHTML=`${uiIconSVG(icon,18)}<span>${t(key)}</span>`;
        button.onclick=()=>selectView(id);
        button.onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?'personal':event.key==='End'?'teams':id==='personal'?'teams':'personal';selectView(next);tabs.querySelector<HTMLButtonElement>(`[data-report-view="${next}"]`)?.focus();}};
      }
      function selectView(id:string) {
        awardTooltip.hide();
        for(const panel of host.querySelectorAll<HTMLElement>('.es-debrief')){const name=panel.classList.contains('personal')?'personal':'teams';panel.hidden=name!==id;panel.id=`es-panel-${name}`;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',`es-tab-${name}`);}
        for(const button of tabs.querySelectorAll<HTMLButtonElement>('button')){const active=button.dataset.reportView===id;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;}
      }
      const report = el('div', 'es-report es-in', host);
      report.style.setProperty('--i', nextI());

      renderPersonalDebrief(report, res, sum);
      renderTeamDebrief(report, sum);
      selectView('personal');

      renderEndRematch(report);
      if (rematchPanel) report.prepend(rematchPanel);
      renderBattleBeats(res, sum);
      moreObserver?.disconnect();
      for (const panel of report.querySelectorAll<HTMLElement>('.es-debrief')) {
        panel.addEventListener('scroll', () => markMore(panel), { passive: true });
        moreObserver?.observe(panel);
        for (const section of panel.children) moreObserver?.observe(section);
        markMore(panel); // at once too: the observer's first word waits on a rendering step
      }
      report.addEventListener('scroll', () => markMore(report), { passive: true });
      moreObserver?.observe(report);
      markMore(report);
      renderEndActions(sum);
      fillFlags();

      host.classList.add('show');
      host.setAttribute('aria-hidden', 'false');
      // battle-HUD chrome must not bleed through the results backdrop — the
      // class shotInfo's CSS already keys every chrome hide off
      document.body.classList.add('cot-si-report');
    },

    /** Hide + finalize counters (garage entry, battle restart). */
    hide(): void {
      awardTooltip.hide();
      document.body.classList.remove('cot-es-armed'); // legacy overlay usable again
      if (!visible && !host.classList.contains('show')) return;
      visible = false;
      rematchPanel = null;
      stopCounters();
      host.classList.remove('show');
      host.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('cot-si-report');
    },
  };
  return api;
}
