import type { RuntimeValue } from '../runtimeTypes.ts';
// src/ui/shotInfo.ts — combat-intelligence panels (WoT damage-log/armor-info
// mod class). Everything rendered here traces 1:1 to RESOLVED sim events on
// the bus (shell:hit / shell:fired / tank:destroyed / battle:ended) — no
// number is ever recomputed in the UI:
//   1. SHOT CARD  — after every player shot that connects: result badge,
//      shell, distance, impact angle, nominal vs effective armor, pen roll,
//      damage dealt vs damage roll, module/crew glyphs, and a mini armor
//      diagram (top + side silhouette renders from public/icons/ with the
//      hull-local hit point + shell-path arrow from the event payload).
//   2. SHOT LOG   — collapsible last-6-shots + per-battle received-damage log
//      (toggled by the rebindable 'shotLog' action → bus 'ui:shotLog').
//   3. INCOMING   — mirrored compact toasts for hits the player receives.
//   4. SESSION STATS — end-of-battle report (bus 'battle:ended').
// Mounted by the clearly-marked SHOT-INFO section in src/ui/hud.ts.

import { FONT_STACK, FONT_COND, ensureFonts } from './fonts.ts';
import { createElement as el, ensureStyle } from './dom.ts';
import {
  hitOutcomeFor, nominalPenFor, shellDisplayName, zoneLabel,
  type HitEventPresentation,
  type HitOutcomePresentation,
} from './hitEventFormat.ts';
import { uiIconSVG } from './uiIcons.ts';
import { maskIcon, iconUrl } from './icons.ts';
import { MODULE_LABEL, CREW_LABEL, STATE_COLOR } from './moduleRegistry.ts';
import {
  createShotDiagramProjection,
  impactForShotDiagram,
  type ShotDiagramEvent,
  type ShotDiagramSpec,
} from './shotDiagramProjection.ts';
import { getSpec } from '../vehicles/specs.ts';
import {
  presentationAnchorFor,
  presentationProjectionFor,
} from '../vehicles/presentationAnchors.generated.ts';
import { getMapConfig } from '../world/maps/index.ts';
// END SCREEN (killcam_endscreen r1): the full-screen battle report is now the
// cinematic end screen in src/ui/endScreen.ts — this module keeps ALL the
// bookkeeping (resolved-event sums, REPORT GATE) and hands a summary over.
import {
  createEndScreen,
  type EndScreenResult,
  type EndScreenSummary,
  type EndScreenTeamRow,
} from './endScreen.ts';
import type { EventBus } from '../game/stateCore.ts';

type EntityId = string;
type TeamSide = 'ally' | 'enemy' | null;
type TimerHandle = ReturnType<typeof setTimeout>;

interface ModuleHit {
  readonly module: string;
  readonly newState: string;
}

interface ShotHitEvent extends HitEventPresentation, ShotDiagramEvent {
  readonly kind: string;
  readonly attackerId?: EntityId | null;
  readonly attackerName?: string | null;
  readonly attackerSpecId?: string | null;
  readonly targetId: EntityId;
  readonly targetName?: string | null;
  readonly targetSpecId?: string | null;
  readonly damage: number;
  readonly dmgRoll?: number;
  readonly effectiveMm?: number;
  readonly physicalMm?: number;
  readonly nominalMm?: number;
  readonly penRollFreshMm?: number;
  readonly penRollMm?: number;
  readonly flightDistM?: number;
  readonly impactAngleDeg?: number;
  readonly timeS?: number;
  readonly targetHpAfter?: number;
  readonly destroyed?: boolean;
  readonly eraPlate?: string | null;
  readonly fireStarted?: boolean;
  readonly modulesHit?: readonly ModuleHit[];
  readonly crewHit?: readonly string[];
  readonly shellType: string;
}

interface ShellFiredEvent {
  readonly isPlayer?: boolean;
  readonly shooterId?: EntityId | null;
  readonly shellType?: string;
}

interface TankSpottedEvent {
  readonly id?: EntityId | null;
  readonly team?: string;
  readonly spotterId?: EntityId | null;
  readonly timeS?: number;
}

interface TankDestroyedEvent {
  readonly id: EntityId;
  readonly killerId?: EntityId | null;
  readonly specId: string;
}

interface EndRosterRow {
  readonly id: EntityId;
  readonly vehicle?: string | null;
  readonly name?: string | null;
  readonly specId?: string | null;
  readonly team?: string;
  readonly alive?: boolean;
  readonly isPlayer?: boolean;
}

interface BattleEndedEvent {
  readonly roster?: readonly EndRosterRow[];
  readonly timeS?: number;
  readonly map?: string | null;
  readonly reason?: string | null;
  readonly result?: EndScreenResult;
}

interface Combatant {
  name: string | null;
  specId: string | null;
  dmg: number;
  kills: number;
  dead: boolean;
}

interface TeamGraphNode {
  p: EntityId;
  r: number;
}

interface ShellStats {
  fired: number;
  hits: number;
  pens: number;
  dmg: number;
}

interface TargetStats {
  name: string | null | undefined;
  specId: string | null | undefined;
  dmg: number;
  hits: number;
  pens: number;
  killed: boolean;
  lastZone: string | null;
  hpLeft: number | null;
}

interface BattleStats {
  fired: number;
  hits: number;
  pens: number;
  dealt: number;
  received: number;
  blocked: number;
  assist: number;
  modulesDestroyed: number;
  perTarget: Map<EntityId, TargetStats>;
  perShell: Map<string, ShellStats>;
  timeline: Array<{ t: number; d: number }>;
}

interface ShotEntry {
  readonly ev: ShotHitEvent;
  readonly cls: HitOutcomePresentation;
}

interface ReceivedEntry {
  readonly t: number;
  readonly dmg: number;
  readonly kind: string;
  readonly aid?: EntityId | null;
  readonly attacker: string;
  readonly shellType: string;
  readonly mods: string;
  readonly outcome: HitOutcomePresentation;
  readonly zone: string;
}

interface EndInfo {
  readonly timeS?: number;
  readonly map: string | null;
  readonly reason: string | null;
}

interface SummaryTeamRow extends EndScreenTeamRow {
  side: TeamSide;
}

interface PresentationTankSpec extends ShotDiagramSpec {
  readonly name: string;
  readonly dims: {
    readonly widthM: number;
    readonly hullLengthM: number;
    readonly overallLengthM: number;
    readonly heightM: number;
  };
}

export interface ShotInfoRuntime {
  readonly root: HTMLDivElement;
  readonly statsRoot: HTMLDivElement;
  warmSchematics(specIds: readonly string[]): void;
  toggleLog(): void;
  setPlayer(id: EntityId | null): void;
  hideStats(): void;
  reset(): void;
}

function eventPayload<Payload>(payload: RuntimeValue): Payload {
  return payload as Payload;
}

function presentationSpec(id: string): PresentationTankSpec {
  return getSpec(id) as PresentationTankSpec;
}

function registryLabel(registry: Readonly<Record<string, string>>, id: string): string {
  return registry[id] || id;
}

function requireCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('[shot-info] Canvas2D context unavailable');
  return context;
}

const COL = {
  green: '#7ee87e',
  red: '#f05a5a',
  yellow: '#f0b04a',
  text: '#e6edf3',
  dim: '#8a97a3',
};

const SHELL_TYPE_COLOR: Readonly<Record<string, string>> = {
  AP: '#ffd27a', APCR: '#e8f4ff', HEAT: '#ff8a5c', HE: '#ffb02e',
  APFSDS: '#ffc46b', HESH: '#ffb02e',
};

// MODULE_LABEL / CREW_LABEL come from ui/moduleRegistry.ts (single source —
// this file's local copy had already drifted to 'Fuel' vs the killcam's
// 'Fuel Tank').

// Crisp 12px module/crew glyphs (currentColor) — same visual language as the
// damage panel's canvas icons, redrawn as inline SVG for DOM cards.
const GLYPH: Record<string, string> = {
  ballistic: uiIconSVG('scope', 10),
  shell: uiIconSVG('shell', 10),
  target: uiIconSVG('autoAim', 10),
  angle: uiIconSVG('scope', 10),
  armor: uiIconSVG('shield', 10),
  damage: uiIconSVG('damage', 10),
  pen: uiIconSVG('penetration', 10),
  trackL: uiIconSVG('track', 12),
  engine: uiIconSVG('engine', 12),
  fuelTank: uiIconSVG('fuelTank', 12),
  ammoRack: uiIconSVG('ammoRack', 12),
  gun: uiIconSVG('gun', 12),
  radio: uiIconSVG('radio', 12),
  optics: uiIconSVG('optics', 12),
  turretRing: uiIconSVG('turretRing', 12),
  gunMount: uiIconSVG('gunMount', 12),
  transmission: uiIconSVG('transmission', 12),
  autoloader: uiIconSVG('autoloader', 12),
  feedSystem: uiIconSVG('feedSystem', 12),
  missileRack: uiIconSVG('missileRack', 12),
  crew: uiIconSVG('crew', 12),
};
GLYPH.trackR = GLYPH.trackL;
// commendation-ribbon glyphs (same 12px currentColor language)
GLYPH.star = uiIconSVG('star', 12);
GLYPH.shield = uiIconSVG('shield', 12);
GLYPH.skull = uiIconSVG('skull', 12);

const SI_CSS = `
.cot-si{position:absolute;z-index:var(--hud-layer-status,18);inset:0;pointer-events:none;font-family:${FONT_STACK};color:${COL.text};}
.cot-si *{box-sizing:border-box;margin:0;padding:0;}
.cot-si-cardhost{position:absolute;right:16px;top:var(--cot-si-card-top,var(--cot-si-roster-bottom,272px));width:320px;display:flex;
  flex-direction:column;gap:6px;align-items:stretch;contain:layout style;}
.cot-si-card{position:relative;min-height:0;overflow:hidden;contain:layout paint style;
  background:linear-gradient(145deg,rgba(16,23,29,.96),rgba(7,11,15,.96) 64%,rgba(11,16,21,.98));
  border:1px solid rgba(174,192,205,.3);border-right:3px solid rgba(146,164,180,.3);
  box-shadow:0 12px 34px rgba(0,0,0,.58),inset 0 1px rgba(255,255,255,.035);
  padding:0 0 4px;transition:opacity .8s ease;}
.cot-si-card.out{opacity:0;}
.cot-si-hd{min-height:38px;display:flex;align-items:center;justify-content:space-between;
  padding:4px 9px 3px;border-bottom:1px solid rgba(146,164,180,.2);}
.cot-si-state{display:flex;min-width:0;flex-direction:column;gap:3px;}
.cot-si-kicker{font-family:${FONT_COND};font-size:7px;font-weight:800;line-height:1;
  letter-spacing:.2em;color:#778692;text-transform:uppercase;display:flex;align-items:center;gap:4px;}
.cot-si-kicker svg{width:9px;height:9px;flex:0 0 auto;}
.cot-si-badge{font-family:${FONT_COND};font-weight:800;
  font-size:12px;line-height:1;letter-spacing:.13em;white-space:nowrap;
  display:flex;align-items:center;gap:5px;}
.cot-si-badge svg{width:11px;height:11px;flex:0 0 auto;}
.cot-si-dmg{min-width:62px;text-align:right;font-family:${FONT_COND};letter-spacing:-.02em;font-weight:800;font-size:20px;
  font-variant-numeric:tabular-nums;color:#ffd166;display:flex;justify-content:flex-end;align-items:center;gap:4px;}
.cot-si-dmg svg{width:12px;height:12px;flex:0 0 auto;}
.cot-si-sub{height:21px;padding:3px 9px;font-size:9px;color:#c6d2dc;letter-spacing:.03em;
  display:grid;grid-template-columns:minmax(0,1fr) minmax(80px,1fr);align-items:center;gap:8px;
  background:rgba(149,168,184,.045);font-variant-numeric:tabular-nums;}
.cot-si-sub>span{min-width:0;display:flex;align-items:center;gap:4px;overflow:hidden;white-space:nowrap;}
.cot-si-sub>span:last-child{text-align:right;color:#e4ebf0;font-weight:700;}
.cot-si-sub>span:last-child{justify-content:flex-end;}
.cot-si-sub svg{width:9px;height:9px;flex:0 0 auto;color:#81909d;}
.cot-si-sub .cot-si-subtext{min-width:0;overflow:hidden;text-overflow:ellipsis;}
.cot-si-sub .ty{font-weight:800;font-size:9px;letter-spacing:.08em;
  font-family:${FONT_COND};display:inline-flex;align-items:center;gap:3px;}
.cot-si-sub .ty svg{color:inherit;}
.cot-si-body{display:flex;flex-direction:column;gap:3px;padding:4px 9px 0;}
.cot-si-rows{padding:0;display:grid;grid-template-columns:1fr;gap:1px;}
.cot-si-kv{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);gap:7px;
  align-items:center;font-size:9px;line-height:1.15;color:${COL.dim};font-variant-numeric:tabular-nums;letter-spacing:.045em;}
.cot-si-kv .cot-si-k{display:flex;align-items:center;gap:4px;}
.cot-si-kv .cot-si-k svg{width:9px;height:9px;flex:0 0 auto;color:#7f8f9c;}
.cot-si-kv b{min-width:0;text-align:right;color:#dbe6ef;font-weight:750;font-family:${FONT_COND};
  letter-spacing:-.005em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
/* r8: the pen row spans the card on ONE line (the 'Pen roll' label broke
   across two lines and the value wrapped, r7 critic); the ERA/screens
   qualifier is an unbreakable suffix chip and a dim caption legends the
   'fresh → after screens / nominal' format once. */
.cot-si-kv.w{grid-column:1/-1;}
.cot-si-kv.pen{margin-top:2px;padding-top:3px;border-top:1px solid rgba(146,164,180,.24);}
.cot-si-kv.pen b{white-space:nowrap;}
.cot-si-kv b .q{display:inline-block;margin-left:5px;padding:0 3px 1px;
  border:1px solid currentColor;font-size:7.5px;letter-spacing:.12em;
  vertical-align:1px;line-height:1.25;font-weight:800;}
.cot-si-kv.armor{padding:2px 0;border-top:1px solid rgba(146,164,180,.12);border-bottom:1px solid rgba(146,164,180,.12);}
.cot-si-kv.result b{color:#f2c06d;letter-spacing:.06em;}
.cot-si-pencap{grid-column:1/-1;font-size:7.5px;color:#687683;letter-spacing:.07em;
  text-align:right;margin-top:-2px;text-transform:uppercase;}
.cot-si-diag{display:grid;grid-template-columns:90px 172px;gap:9px;align-items:center;
  justify-content:center;width:100%;margin:0;padding:4px 5px;border:1px solid rgba(146,164,180,.16);
  background:linear-gradient(110deg,rgba(146,164,180,.075),rgba(146,164,180,.018));}
.cot-si-diag .box{position:relative;flex:0 0 auto;}
.cot-si-diag .box:first-child{width:90px!important;height:90px!important;}
.cot-si-diag .box:nth-child(2){width:172px!important;height:86px!important;}
.cot-si-diag .box::after{content:attr(data-view);position:absolute;left:2px;bottom:0;
  font:800 6.5px/1 ${FONT_COND};letter-spacing:.14em;color:#758491;text-transform:uppercase;}
.cot-si-diag .sil{position:absolute;inset:0;}
/* shaded per-tank plan-form render (icons pipeline <id>_top/_side.png)
   layered over the silhouette base: a canvas-baked NEUTRAL-GRAY schematic
   (luminance-normalized, see schematicUrl) carries the turret/barrel/fender
   read the flat mask lacked (r7: top view parsed as a generic rounded box).
   r2: full grayscale(1) fallback while the bake lands — grayscale(.85)+
   brightness(2) left bright camo a fuzzy yellow-green blob at compact sizes. The
   layer is slightly translucent so the zone glow now drawn UNDER it tints
   through without burying the plan shape. */
.cot-si-diag .pf{position:absolute;inset:0;background-size:contain;
  background-position:center;background-repeat:no-repeat;opacity:.86;
  filter:grayscale(1) brightness(1.5) contrast(1.4);}
.cot-si-diag svg.ov{position:absolute;inset:0;overflow:visible;}
.cot-si-diag svg.ov .wdg{animation:cotSiWedge 1.6s ease-in-out infinite;}
@keyframes cotSiWedge{0%,100%{opacity:.5;}50%{opacity:1;}}
.cot-si-zone{min-width:0;font-size:8.5px;color:#f2ca82;font-weight:800;letter-spacing:.07em;
  text-transform:uppercase;font-family:${FONT_COND};text-align:right;line-height:1.3;}
.cot-si-zone .cap{display:block;color:#778692;font-weight:800;letter-spacing:.15em;font-size:7px;}
.cot-si-mods{display:flex;flex-wrap:wrap;gap:4px;padding:5px 10px 0;}
.cot-si-mod{display:flex;align-items:center;gap:3px;font-size:8.5px;font-weight:800;
  letter-spacing:.06em;font-family:${FONT_COND};text-transform:uppercase;
  border:1px solid currentColor;padding:1.5px 4px 1.5px 3px;line-height:1;}
.cot-si-mod svg{width:11px;height:11px;display:block;}
.cot-si-log{position:absolute;right:16px;top:clamp(272px,30vh,336px);width:340px;display:none;
  pointer-events:auto;background:linear-gradient(180deg,rgba(10,14,18,.92),rgba(6,9,12,.94));
  border:1px solid rgba(146,164,180,.3);box-shadow:0 6px 22px rgba(0,0,0,.55);
  max-height:calc(100vh - 560px);min-height:120px;overflow-y:auto;}
.cot-si-log.open{display:block;}
.cot-si-log .sec{font-size:9.5px;font-weight:800;letter-spacing:.18em;color:${COL.dim};
  font-family:${FONT_COND};text-transform:uppercase;
  padding:6px 9px 3px;display:flex;justify-content:space-between;
  border-bottom:1px solid rgba(146,164,180,.16);}
.cot-si-lrow{display:flex;align-items:baseline;gap:6px;padding:3px 9px;font-size:10px;
  color:#c6d2dc;font-variant-numeric:tabular-nums;border-bottom:1px solid rgba(146,164,180,.08);}
.cot-si-lrow .b{font-family:${FONT_COND};font-weight:800;
  font-size:8.5px;letter-spacing:.06em;width:92px;flex:0 0 auto;white-space:nowrap;}
.cot-si-lrow .d{font-weight:800;color:#ffd166;width:36px;flex:0 0 auto;text-align:right;
  font-family:${FONT_COND};letter-spacing:-.01em;}
.cot-si-lrow .n{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cot-si-lrow .z{color:${COL.dim};font-size:9px;flex:0 0 auto;}
.cot-si-empty{padding:6px 9px;font-size:9.5px;color:${COL.dim};letter-spacing:.04em;}
.cot-si-toasthost{position:absolute;left:16px;bottom:452px;width:270px;min-height:164px;
  display:flex;flex-direction:column;justify-content:flex-end;gap:5px;contain:layout style;}
.cot-si-toasthost:not(:empty)::before{content:"INCOMING FIRE";align-self:flex-start;
  padding-left:8px;font:800 7.5px/1 ${FONT_COND};letter-spacing:.2em;color:#c06f66;}
.cot-si-toast{height:48px;overflow:hidden;contain:layout paint style;
  background:linear-gradient(100deg,rgba(38,12,12,.94),rgba(11,10,12,.84) 78%,rgba(8,10,13,.3));
  border:1px solid rgba(240,90,90,.2);border-left:3px solid ${COL.red};padding:6px 10px 6px;
  box-shadow:0 6px 18px rgba(0,0,0,.3);transition:opacity .7s ease;text-shadow:0 1px 2px rgba(0,0,0,.85);}
.cot-si-toast.deflected{
  background:linear-gradient(100deg,rgba(22,31,39,.94),rgba(10,14,18,.84) 78%,rgba(8,10,13,.3));
  border-color:rgba(159,176,191,.22);box-shadow:0 6px 18px rgba(0,0,0,.25);}
.cot-si-toast.out{opacity:0;}
.cot-si-toast .l1{height:18px;display:flex;justify-content:space-between;align-items:baseline;gap:6px;
  font-size:11px;font-weight:750;color:#f2c6bf;}
.cot-si-toast .l1 span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cot-si-toast .l1 b{color:#ff8f80;font-family:${FONT_COND};letter-spacing:-.01em;
  font-variant-numeric:tabular-nums;font-size:13px;display:flex;align-items:center;gap:4px;
  white-space:nowrap;}
.cot-si-toast .l1 b svg{width:11px;height:11px;flex:0 0 auto;}
.cot-si-toast .l2{height:16px;font-size:9px;color:#c9a9a2;letter-spacing:.04em;display:flex;
  justify-content:space-between;gap:6px;font-variant-numeric:tabular-nums;}
.cot-si-toast .l2>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cot-si-toast .l2 .m{font-weight:800;text-transform:uppercase;
  font-family:${FONT_COND};letter-spacing:.07em;text-align:right;}
.cot-si-stats{position:fixed;inset:0;z-index:71;display:none;pointer-events:none;
  flex-direction:column;align-items:center;justify-content:center;
  padding:2vh 0 4vh;overflow:hidden;
  font-family:${FONT_STACK};color:${COL.text};
  background:linear-gradient(180deg,rgba(5,8,12,.9),rgba(4,7,10,.8) 42%,rgba(3,5,8,.92));}
.cot-si-stats.show{display:flex;}
.cot-si-stats *{box-sizing:border-box;margin:0;padding:0;}
/* While the battle report is up, the integration end-overlay underneath
   (endOverlayRuntime.ts .cot-end, z-index 70) must not stack a second verdict banner
   mid-screen — the report renders its own. Its RETURN TO GARAGE button is
   kept and pinned as the report footer, directly under the last panel
   (--cot-si-endpad is measured in pinFooter(); the r6 report left the button
   floating in an empty black bottom half). The earnings line is hidden too:
   the econ strip above renders the same payout with its formula caption. */
body.cot-si-report .cot-end>div:first-child{display:none;}
body.cot-si-report .cot-end>div:nth-child(2){display:none;}
body.cot-si-report .cot-end{align-items:center !important;
  justify-content:flex-end !important;
  padding-bottom:var(--cot-si-endpad,3.2vh) !important;
  z-index:72 !important;background:transparent !important;}
/* Clean cinematic results screen: no battle-HUD chrome may bleed through the
   report backdrop (r6: kill-feed rows and dimmed team panels overlapped the
   VICTORY banner). Hidden only while body.cot-si-report is set — hideStats()
   and reset() restore everything for the next battle. */
body.cot-si-report .cot-killfeed,body.cot-si-report .cot-ear,
body.cot-si-report .cot-top,
body.cot-si-report .cot-alert,
body.cot-si-report .cot-sixth,body.cot-si-report .cot-tgt,
body.cot-si-report .cot-net,body.cot-si-report .cot-camoind,
body.cot-si-report .cot-shells,body.cot-si-report .cot-minimap,
body.cot-si-report .cot-hpbars,body.cot-si-report .cot-dmglayer,
body.cot-si-report .cot-dp,body.cot-si-report .cot-si-log,
body.cot-si-report .cot-ret{display:none !important;}
.cot-si-ban{font-family:${FONT_COND};font-weight:800;font-size:56px;
  letter-spacing:.34em;text-indent:.34em;line-height:1;text-shadow:0 2px 22px rgba(0,0,0,.85);}
.cot-si-ban.v{color:#7ee87e;}.cot-si-ban.d{color:#f05a5a;}.cot-si-ban.n{color:#cfd9e2;}
.cot-si-bansub{font-size:10px;letter-spacing:.32em;color:${COL.dim};margin:7px 0 2.6vh;
  text-transform:uppercase;font-family:${FONT_COND};font-weight:800;}
.cot-si-hdr{font-size:10.5px;letter-spacing:.2em;color:#a9b6c2;margin:0 0 2.2vh;
  text-transform:uppercase;font-family:${FONT_COND};font-weight:700;
  font-variant-numeric:tabular-nums;}
.cot-si-hdr b{color:#dbe6ef;font-weight:800;}
.cot-si-cols{display:flex;gap:16px;width:1120px;max-width:94vw;align-items:stretch;
  min-height:220px;}
.cot-si-panel{background:linear-gradient(180deg,rgba(10,14,18,.92),rgba(6,9,12,.95));
  border:1px solid rgba(146,164,180,.3);box-shadow:0 10px 40px rgba(0,0,0,.5);
  padding:14px 20px 16px;min-height:0;overflow:hidden;}
.cot-si-panel .ph{font-size:9.5px;font-weight:800;letter-spacing:.22em;color:${COL.dim};
  text-transform:uppercase;font-family:${FONT_COND};
  padding-bottom:6px;border-bottom:1px solid rgba(146,164,180,.2);margin-bottom:7px;
  display:flex;justify-content:space-between;}
.cot-si-pl{flex:1.15;}
.cot-si-pr{flex:1;}
.cot-si-you{display:flex;align-items:center;gap:8px;font-size:11px;padding:3px 0 6px;
  font-variant-numeric:tabular-nums;border-bottom:1px solid rgba(146,164,180,.14);
  margin-bottom:5px;}
.cot-si-you .si{width:62px;height:24px;flex:0 0 auto;}
.cot-si-you .n{flex:1;color:#f2f7fb;font-weight:800;font-family:${FONT_COND};
  letter-spacing:.1em;}
.cot-si-meta{margin-top:12px;font-size:9.5px;letter-spacing:.2em;color:${COL.dim};
  text-transform:uppercase;font-family:${FONT_COND};
  font-weight:700;text-align:center;}
.cot-si-you .s{color:${COL.dim};font-size:10px;}
.cot-si-you .dm{color:#ffd166;font-weight:800;font-family:${FONT_COND};letter-spacing:-.01em;
  width:60px;text-align:right;}
.cot-si-ribbons{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px;}
.cot-si-rib{border:1px solid rgba(214,178,94,.75);color:#e8c86a;font-family:${FONT_COND};
  font-weight:800;font-size:9px;letter-spacing:.14em;
  padding:3px 8px;text-transform:uppercase;background:rgba(120,90,20,.16);
  display:inline-flex;align-items:center;gap:5px;}
.cot-si-rib svg{width:12px;height:12px;display:block;flex:0 0 auto;}
.cot-si-tlwrap{width:1120px;max-width:94vw;margin-top:14px;}
.cot-si-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px 16px;margin-bottom:12px;}
.cot-si-grid.c5{grid-template-columns:repeat(5,1fr);}
.cot-si-stat{text-align:center;}
.cot-si-stat .v{font-size:28px;font-weight:800;font-family:${FONT_COND};letter-spacing:-.01em;
  font-variant-numeric:tabular-nums;color:#f2f7fb;line-height:1.1;}
.cot-si-econ{display:flex;gap:16px;width:1120px;max-width:94vw;margin-bottom:14px;}
.cot-si-ecoitem{flex:1;display:flex;flex-direction:column;
  background:linear-gradient(180deg,rgba(10,14,18,.92),rgba(6,9,12,.95));
  border:1px solid rgba(146,164,180,.3);box-shadow:0 10px 40px rgba(0,0,0,.5);
  padding:10px 16px 11px;}
.cot-si-ecoitem .et{display:flex;align-items:baseline;justify-content:center;gap:10px;}
.cot-si-ecoitem .ek{font-size:9.5px;font-weight:800;letter-spacing:.22em;color:${COL.dim};
  text-transform:uppercase;font-family:${FONT_COND};}
.cot-si-ecoitem .ev{font-size:30px;font-weight:800;font-family:${FONT_COND};letter-spacing:-.01em;
  font-variant-numeric:tabular-nums;line-height:1;}
.cot-si-ecoitem.cr .ev{color:#ffd166;}
.cot-si-ecoitem.xp .ev{color:#9fd0ff;}
.cot-si-ecoitem .eb{font-size:9px;color:${COL.dim};letter-spacing:.05em;
  font-variant-numeric:tabular-nums;}
/* itemized earnings receipt (r4, WoT detailed-results depth): one line item
   per source, each printing its exact inputs x rate — the strip total above
   MUST reconcile with the visible rows (rounding stated on the total row) */
.cot-si-erows{margin-top:7px;border-top:1px solid rgba(146,164,180,.16);
  padding-top:5px;display:flex;flex-direction:column;gap:1px;}
.cot-si-erows>div{display:flex;justify-content:space-between;font-size:9.5px;
  color:${COL.dim};font-variant-numeric:tabular-nums;letter-spacing:.03em;}
.cot-si-erows b{color:#cfdae4;font-weight:700;font-family:${FONT_COND};letter-spacing:-.01em;
  }
.cot-si-erows .tot{border-top:1px solid rgba(146,164,180,.22);margin-top:3px;
  padding-top:3px;}
.cot-si-ecoitem.cr .tot b{color:#ffd166;}
.cot-si-ecoitem.xp .tot b{color:#9fd0ff;}
/* expandable enemy rows (r4): click reveals the per-shot exchange ledger —
   the same resolved events the floating cards / toasts already showed */
.cot-si-kill.x{pointer-events:auto;cursor:pointer;}
.cot-si-kill.x:hover{background:rgba(146,164,180,.07);}
.cot-si-kill .ex{color:${COL.dim};font-size:8px;width:10px;flex:0 0 auto;
  transition:transform .15s ease;}
.cot-si-kill.open .ex{transform:rotate(90deg);}
.cot-si-xd{display:none;background:rgba(8,12,16,.6);
  border-bottom:1px solid rgba(146,164,180,.08);
  padding:3px 6px 4px 24px;max-height:96px;overflow-y:auto;pointer-events:auto;}
.cot-si-xd.open{display:block;}
.cot-si-xd .xr{display:flex;gap:7px;align-items:baseline;font-size:9.5px;
  color:#b9c6d2;font-variant-numeric:tabular-nums;padding:1px 0;}
.cot-si-xd .xr .t{color:${COL.dim};width:30px;flex:0 0 auto;}
.cot-si-xd .xr .w{font-family:${FONT_COND};font-weight:800;
  font-size:8.5px;letter-spacing:.08em;width:52px;flex:0 0 auto;}
.cot-si-xd .xr .d{color:#ffd166;font-weight:700;width:34px;text-align:right;
  flex:0 0 auto;font-family:${FONT_COND};letter-spacing:-.01em;}
.cot-si-xd .xr .z{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  color:#93a2af;}
/* roster clicks must reach the report — the transparent integration overlay
   (.cot-end, z 72) sits above it solely to host its RETURN button */
body.cot-si-report .cot-end{pointer-events:none !important;}
body.cot-si-report .cot-end button{pointer-events:auto !important;}
.cot-si-stat .k{font-size:8.5px;font-weight:700;letter-spacing:.16em;color:${COL.dim};
  text-transform:uppercase;font-family:${FONT_COND};}
.cot-si-shell{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;margin-bottom:8px;
  font-size:9.5px;color:${COL.dim};font-variant-numeric:tabular-nums;letter-spacing:.05em;}
.cot-si-shell b{color:#dbe6ef;font-family:${FONT_COND};letter-spacing:-.01em;font-weight:800;}
.cot-si-shell .ty{font-weight:800;font-family:${FONT_COND};
  letter-spacing:.08em;font-size:9px;}
.cot-si-tl{margin-bottom:9px;}
.cot-si-tl svg{display:block;width:100%;height:58px;}
.cot-si-tl .cap{font-size:8px;letter-spacing:.14em;color:${COL.dim};text-transform:uppercase;
  font-family:${FONT_COND};font-weight:700;text-align:center;margin-top:2px;}
.cot-si-kills{padding-top:2px;margin-bottom:6px;}
.cot-si-kill{display:flex;align-items:center;gap:8px;font-size:11.5px;padding:3px 0;
  font-variant-numeric:tabular-nums;border-bottom:1px solid rgba(146,164,180,.08);}
.cot-si-kill .si{width:34px;height:14px;flex:0 0 auto;}
.cot-si-kill .n{flex:1;color:#dbe6ef;font-weight:600;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;}
.cot-si-kill .n .you{color:#ffd166;font-family:${FONT_COND};
  font-weight:800;font-size:9px;letter-spacing:.12em;border:1px solid rgba(255,209,102,.6);
  padding:0 4px 1px;margin-right:4px;vertical-align:1px;}
.cot-si-kill .kd{color:${COL.red};font-weight:800;font-size:9px;letter-spacing:.12em;
  font-family:${FONT_COND};width:38px;text-align:right;flex:0 0 auto;}
.cot-si-kill .al{color:${COL.green};font-weight:800;font-size:9px;letter-spacing:.12em;
  font-family:${FONT_COND};width:38px;text-align:right;flex:0 0 auto;
  opacity:.75;}
.cot-si-kill .s{color:${COL.dim};font-size:10px;}
.cot-si-kill .k{color:#dbe6ef;font-weight:800;font-family:${FONT_COND};letter-spacing:-.01em;
  width:30px;text-align:right;font-size:10px;flex:0 0 auto;}
.cot-si-kill .dm{color:#ffd166;font-weight:800;font-family:${FONT_COND};letter-spacing:-.01em;
  width:48px;text-align:right;flex:0 0 auto;}
/* roster column micro-captions (r6): the right-hand figure is the
   combatant's TOTAL battle damage output — un-headed it read as damage
   done to you next to 'no engagement with you' */
.cot-si-kill.cap{padding:0 0 1px;border-bottom:none;}
.cot-si-kill.cap span{color:${COL.dim} !important;font-size:7.5px;font-weight:700;
  letter-spacing:.12em;text-transform:uppercase;font-family:${FONT_COND};
  }
/* The game owns an explicit touch-layout state; do not make battle UI depend
   on browser pointer heuristics alone (desktop emulation and hybrid tablets
   can report a fine pointer while touch controls are active). */
/* Touch battles already show a reticle hit-confirm and resolved damage number.
   The desktop analysis dossier duplicates that feedback while obscuring a
   third of a phone battlefield, so it is intentionally desktop-only. */
body.cot-touch-layout .cot-si-cardhost,
body.cot-touch-layout .cot-si-log{display:none!important;}
/* Incoming fire remains actionable, but as one compact reading below the
   minimap—not a stack over the ammo tray or the steering/aim controls. */
body.cot-touch-layout .cot-si-toasthost{top:calc(max(8px,env(safe-area-inset-top)) + 108px);
  bottom:auto;left:max(8px,env(safe-area-inset-left));right:auto;width:min(200px,48vw);min-height:41px;}
body.cot-touch-layout .cot-si-toast:nth-last-of-type(n+2){display:none;}
body.cot-touch-layout .cot-si-toast{height:41px;padding:4px 7px;}
body.cot-touch-layout .cot-si-toast .l1{height:17px;font-size:9.5px;}
body.cot-touch-layout .cot-si-toast .l1 b{font-size:11px;}
body.cot-touch-layout .cot-si-toast .l2{height:14px;font-size:7.5px;}
@media (prefers-reduced-motion:reduce){
  .cot-si-card,.cot-si-toast,.cot-si-diag svg.ov .wdg{animation:none;transition:none;}
}
`;

const fmtTime = (s: number): string => {
  const t = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

// ---------------------------------------------------------------------------
// Plan-form schematic bake (r2 minor): the raw icons-pipeline top render is a
// CAMO paint job — a CSS grayscale(.85)+brightness(2) declutter left bright
// winter/NATO schemes as a fuzzy yellow-green blob at compact sizes (Leopard 2A4
// evidence). Bake a NEUTRAL-GRAY schematic once per icon: full luminance
// desaturation, then normalization around the sprite's own mean luminance so
// every tank lands at the same light-gray tone whatever its paint, with the
// local contrast (turret ring, barrel, fenders, engine deck) stretched back
// in. Cached per id/view; async — callers show the raw icon under the CSS
// fallback filter and swap in the bake when it lands (same-origin PNG, so
// canvas readback is always allowed; any failure keeps the fallback).
const schemCache = new Map<string, Promise<string | null>>();
// Card box sizes (shared with warmSchematics so the pre-warm hits the exact
// cache keys the live cards request).
const CARD_TOP_S = 96;
const CARD_SIDE_W = 184, CARD_SIDE_H = 92;

function normalizeSchematicSource(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const context = requireCanvasContext(canvas);
  context.drawImage(img, 0, 0);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = image.data;
  let sum = 0;
  let count = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 16) continue;
    sum += pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
    count += 1;
  }
  const mean = count ? sum / count : 128;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] === 0) continue;
    const luminance = pixels[index] * 0.2126
      + pixels[index + 1] * 0.7152
      + pixels[index + 2] * 0.0722;
    const value = Math.max(24, Math.min(250, 178 + (luminance - mean) * 2.1));
    pixels[index] = pixels[index + 1] = pixels[index + 2] = value;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function sharpenSchematic(
  pixels: Uint8ClampedArray,
  source: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  const amount = 0.55;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      if (source[index + 3] < 8) continue;
      for (let channel = 0; channel < 3; channel += 1) {
        const center = source[index + channel];
        const neighbor = (offset: number): number => (
          source[index + offset + 3] >= 8 ? source[index + offset + channel] : center
        );
        pixels[index + channel] = center * (1 + 4 * amount)
          - amount * (
            neighbor(-4) + neighbor(4)
            + neighbor(-width * 4) + neighbor(width * 4)
          );
      }
    }
  }
}

function outlineSchematic(
  pixels: Uint8ClampedArray,
  source: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  const outlineRadius = 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (source[index + 3] < 8) continue;
      let edge = false;
      for (let dy = -outlineRadius; dy <= outlineRadius && !edge; dy += 1) {
        for (let dx = -outlineRadius; dx <= outlineRadius && !edge; dx += 1) {
          const neighborX = x + dx;
          const neighborY = y + dy;
          edge = neighborX < 0 || neighborY < 0 || neighborX >= width || neighborY >= height
            || source[(neighborY * width + neighborX) * 4 + 3] < 8;
        }
      }
      if (!edge) continue;
      pixels[index] = pixels[index + 1] = pixels[index + 2] = 36;
      pixels[index + 3] = Math.max(pixels[index + 3], 216);
    }
  }
}

function bakeSchematic(img: HTMLImageElement, outW: number, outH: number): string {
  const sourceCanvas = normalizeSchematicSource(img);
  const target = document.createElement('canvas');
  target.width = outW;
  target.height = outH;
  const context = requireCanvasContext(target);
  const fit = Math.min(outW / sourceCanvas.width, outH / sourceCanvas.height);
  const width = sourceCanvas.width * fit;
  const height = sourceCanvas.height * fit;
  context.imageSmoothingQuality = 'high';
  context.drawImage(sourceCanvas, (outW - width) / 2, (outH - height) / 2, width, height);
  const image = context.getImageData(0, 0, outW, outH);
  const source = new Uint8ClampedArray(image.data);
  sharpenSchematic(image.data, source, outW, outH);
  outlineSchematic(image.data, source, outW, outH);
  context.putImageData(image, 0, 0);
  return target.toDataURL();
}

function schematicUrl(
  id: string,
  view: string,
  outW: number,
  outH: number,
): Promise<string | null> {
  const key = `${id}|${view}|${outW}x${outH}`;
  let p = schemCache.get(key);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          resolve(bakeSchematic(img, outW, outH));
        } catch (_) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = iconUrl(id, view);
    });
    schemCache.set(key, p);
  }
  return p;
}

/** Plan-form layer: raw icon + CSS fallback now, baked schematic on arrival. */
function planForm(
  parent: HTMLElement,
  specId: string,
  view: string,
  boxW: number,
  boxH: number,
): HTMLDivElement {
  const pf = el('div', 'pf', parent);
  pf.style.backgroundImage = `url(${iconUrl(specId, view)})`;
  schematicUrl(specId, view, boxW * 2, boxH * 2).then((u) => {
    if (u && pf.isConnected !== false) {
      pf.style.backgroundImage = `url(${u})`;
      pf.style.filter = 'none';
    }
  });
  return pf;
}

interface PenetrationPresentation {
  readonly html: string;
  readonly qualifier: string;
  readonly legend: string;
}

function setShotCardTrace(
  card: HTMLDivElement,
  ev: ShotHitEvent,
  cls: HitOutcomePresentation,
): void {
  card.dataset.kind = ev.kind;
  card.dataset.damage = String(Math.round(ev.damage || 0));
  card.dataset.dmgroll = String(Math.round(ev.dmgRoll || 0));
  card.dataset.eff = String(Math.round(ev.effectiveMm || 0));
  card.dataset.pen = String(Math.round(ev.penRollMm || 0));
  card.dataset.nominal = String(Math.round(ev.nominalMm || 0));
  card.dataset.dist = String(Math.round(ev.flightDistM || 0));
  card.dataset.angle = String(Math.round(ev.impactAngleDeg || 0));
  card.dataset.zone = ev.zone || '';
  card.dataset.outcome = cls.id;
  card.style.borderRightColor = cls.color;
}

function appendShotCardHeader(
  card: HTMLDivElement,
  ev: ShotHitEvent,
  cls: HitOutcomePresentation,
): void {
  const header = el('div', 'cot-si-hd', card);
  const state = el('div', 'cot-si-state', header);
  const kicker = el('span', 'cot-si-kicker', state);
  kicker.innerHTML = `${GLYPH.ballistic}<span>Ballistic readout</span>`;
  const badge = el('span', 'cot-si-badge', state);
  badge.innerHTML = `${uiIconSVG(cls.icon, 11)}<span>${cls.label}</span>`;
  badge.style.color = cls.color;
  const damage = el('span', 'cot-si-dmg', header);
  damage.innerHTML = `${GLYPH.damage}<span>${ev.damage > 0 ? `−${Math.round(ev.damage)}` : '0'}</span>`;
  if (!(ev.damage > 0)) damage.style.color = COL.dim;
}

function appendShotCardSubtitle(card: HTMLDivElement, ev: ShotHitEvent): void {
  const subtitle = el('div', 'cot-si-sub', card);
  const typeColor = SHELL_TYPE_COLOR[ev.shellType] || '#9fb0bf';
  subtitle.innerHTML =
    `<span><span class="ty" style="color:${typeColor}">${GLYPH.shell}${ev.shellType}</span>` +
    `<span class="cot-si-subtext">${shellDisplayName(ev)}</span></span>` +
    `<span>${GLYPH.target}<span class="cot-si-subtext">${ev.targetName || ''}</span></span>`;
}

function armorPresentation(ev: ShotHitEvent): string {
  if (ev.kind === 'screen_pierce') {
    return ev.physicalMm && ev.physicalMm > 0
      ? `${Math.round(ev.physicalMm)} mm screen`
      : 'screen';
  }
  const hasArmor = (ev.nominalMm || 0) > 0 || (ev.effectiveMm || 0) > 0;
  if (hasArmor) {
    return `${Math.round(ev.nominalMm || 0)} → ${Math.round(ev.effectiveMm || 0)} mm eff.`;
  }
  const external = !!ev.zone
    && ['optics', 'gun', 'gun_barrel', 'trackL', 'trackR'].includes(ev.zone);
  return external ? 'external — no armor' : '—';
}

function penetrationQualifier(
  ev: ShotHitEvent,
  nominal: number,
  roll: number,
  fresh: number,
): string {
  if (ev.eraPlate) return 'ERA';
  const cut = fresh > roll + 1;
  return roll > 0 && (cut || (nominal > 0 && roll < nominal * 0.75 - 2))
    ? 'SCREENS'
    : '';
}

function penetrationPresentation(
  card: HTMLDivElement,
  ev: ShotHitEvent,
): PenetrationPresentation {
  if (ev.kind === 'screen_pierce') {
    return { html: 'passed through', qualifier: '', legend: '' };
  }
  const nominal = nominalPenFor(ev);
  const roll = Math.round(ev.penRollMm || 0);
  const fresh = Math.round(ev.penRollFreshMm || 0);
  card.dataset.pennom = String(nominal);
  card.dataset.penfresh = String(fresh);
  const cut = fresh > roll + 1;
  const qualifier = penetrationQualifier(ev, nominal, roll, fresh);
  const arrow = cut ? `${fresh} → ` : '';
  const legend = cut
    ? `fresh → after ${qualifier === 'ERA' ? 'ERA' : 'screens'} / nominal`
    : roll > 0 && nominal > 0 ? 'roll / nominal' : '';
  if (roll <= 0 || nominal <= 0) {
    return {
      html: roll > 0 ? `${arrow}${roll} mm` : '—',
      qualifier,
      legend,
    };
  }
  const verdict = (cut ? fresh : roll) >= nominal ? COL.green : COL.red;
  return {
    html: `<span style="color:${verdict}">${arrow}${roll}</span> / ${nominal} mm`,
    qualifier,
    legend,
  };
}

function addDiagramZoneTint(
  parent: HTMLElement,
  specId: string,
  view: string,
  x: number,
  y: number,
  radius: number,
  color: string,
): void {
  const tint = el('div', 'sil', parent);
  maskIcon(tint, specId, view, 'transparent');
  tint.style.background =
    `radial-gradient(circle ${radius}px at ${x.toFixed(1)}px ${y.toFixed(1)}px,` +
    `${color}ff 0%,${color}c0 55%,${color}00 100%)`;
}

function diagramImpactWedge(
  direction: readonly number[] | null,
  hitX: number,
  hitY: number,
  color: string,
): string {
  if (!direction) return '';
  const length = Math.hypot(direction[0], direction[2]);
  if (length <= 1e-4) return '';
  const x = direction[0] / length;
  const y = direction[2] / length;
  const radius = 17;
  const rotate = (vx: number, vy: number, angle: number): [number, number] => [
    vx * Math.cos(angle) - vy * Math.sin(angle),
    vx * Math.sin(angle) + vy * Math.cos(angle),
  ];
  const [x1, y1] = rotate(x, y, 0.46);
  const [x2, y2] = rotate(x, y, -0.46);
  return `<path class="wdg" d="M${hitX.toFixed(1)} ${hitY.toFixed(1)}` +
    ` L${(hitX + x1 * radius).toFixed(1)} ${(hitY + y1 * radius).toFixed(1)}` +
    ` L${(hitX + x * radius * 1.12).toFixed(1)} ${(hitY + y * radius * 1.12).toFixed(1)}` +
    ` L${(hitX + x2 * radius).toFixed(1)} ${(hitY + y2 * radius).toFixed(1)} Z"` +
    ` fill="${color}" fill-opacity="0.5" stroke="${color}" stroke-width="0.8"/>`;
}

function clampDiagramArrowTail(
  hitX: number,
  hitY: number,
  tailX: number,
  tailY: number,
  size: number,
): readonly [number, number] {
  const padding = 2;
  const dx = tailX - hitX;
  const dy = tailY - hitY;
  let scale = 1;
  if (dx > 0) scale = Math.min(scale, (size - padding - hitX) / dx);
  else if (dx < 0) scale = Math.min(scale, (padding - hitX) / dx);
  if (dy > 0) scale = Math.min(scale, (size - padding - hitY) / dy);
  else if (dy < 0) scale = Math.min(scale, (padding - hitY) / dy);
  scale = Math.max(0, scale);
  return [hitX + dx * scale, hitY + dy * scale];
}

function diagramImpactArrow(
  direction: readonly number[] | null,
  point: readonly number[],
  hitX: number,
  hitY: number,
  topPoint: (x: number, z: number) => number[],
  size: number,
): string {
  if (!direction) return '';
  const tail = topPoint(point[0] - direction[0] * 2.2, point[2] - direction[2] * 2.2);
  const [x, y] = clampDiagramArrowTail(hitX, hitY, tail[0], tail[1], size);
  return `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" ` +
    `x2="${hitX.toFixed(1)}" y2="${hitY.toFixed(1)}" ` +
    'stroke="#ff8a5c" stroke-width="2.2" marker-end="url(#cotsiarw)"/>';
}

function diagramFacingCue(
  armor: PresentationTankSpec['armor'] | null,
  dims: PresentationTankSpec['dims'],
  topPoint: (x: number, z: number) => number[],
  topScale: number,
): string {
  if (!armor?.turretPivot) return '';
  const [centerX, centerY] = topPoint(armor.turretPivot[0], armor.turretPivot[2]);
  const ringRadius = Math.min(dims.widthM * 0.3, 1.05) * topScale;
  const barrelLength = armor.gunBarrel?.lengthM || dims.overallLengthM * 0.45;
  const [gunX, gunY] = topPoint(
    armor.turretPivot[0],
    armor.turretPivot[2] + barrelLength,
  );
  return `<circle cx="${centerX.toFixed(1)}" cy="${centerY.toFixed(1)}" ` +
    `r="${ringRadius.toFixed(1)}" fill="none" stroke="rgba(232,242,252,0.8)" ` +
    'stroke-width="1.6"/>' +
    `<line x1="${centerX.toFixed(1)}" y1="${centerY.toFixed(1)}" ` +
    `x2="${gunX.toFixed(1)}" y2="${gunY.toFixed(1)}" ` +
    'stroke="rgba(232,242,252,0.8)" stroke-width="2.5" stroke-linecap="round"/>';
}

/**
 * Create the combat-intelligence UI bundle. All data arrives via bus events;
 * hud.ts mounts `root` and forwards player identity / lifecycle.
 * @param {{on:Function,emit:Function}} bus event bus (§1.5)
 * @returns {{root:HTMLElement,statsRoot:HTMLElement,setPlayer:Function,reset:Function,hideStats:Function,toggleLog:Function}}
 */
export function createShotInfo(bus: EventBus): ShotInfoRuntime {
  ensureFonts();
  ensureStyle('cot-si-style', SI_CSS);

  const root = el('div', 'cot-si');
  const cardHost = el('div', 'cot-si-cardhost', root);
  cardHost.setAttribute('role', 'status');
  cardHost.setAttribute('aria-live', 'polite');
  const logPanel = el('div', 'cot-si-log', root);
  const toastHost = el('div', 'cot-si-toasthost', root);
  toastHost.setAttribute('role', 'status');
  toastHost.setAttribute('aria-live', 'polite');
  const statsRoot = el('div', 'cot-si-stats');
  document.body.appendChild(statsRoot);
  // END SCREEN renders into statsRoot so the integration seams keep holding:
  // main.ts veilHud() toggles this exact element around the kill-cam, and
  // the kill-cam parity veil CSS addresses `.cot-si-stats`.
  const endScreen = createEndScreen(bus, statsRoot);

  let playerId: EntityId | null = null;
  let logOpen = false;
  const shotLog: ShotEntry[] = [];      // last 6 outgoing summaries {ev, cls}
  const allShots: ShotEntry[] = [];     // EVERY outgoing hit this battle {ev, cls} — the
                           // report's expandable per-enemy exchange ledger (r4)
  const receivedLog: ReceivedEntry[] = [];  // per-battle incoming entries (full battle)
  const stats = newStats();
  let endInfo: EndInfo | null = null;      // battle:ended report header

  const isTouchBattleLayout = () =>
    document.body.classList.contains('cot-touch-layout');

  // --- spotting assist (r3) --------------------------------------------------
  // Driven purely by the sim's tank:spotted events. When the payload carries
  // spotterId (additive spotting.ts enrichment, see docs/SYSTEMS.md), a rising
  // edge with spotterId === player marks the target "lit by you"; ally
  // (non-player) damage on that target within ASSIST_WINDOW_S then counts as
  // spotting-assist damage — WoT's 'damage upon your spotting'. The window is
  // a fixed convention (falling edges are not broadcast), and the whole stat
  // row only renders once an enriched event has been SEEN (spotAttributed) —
  // a zero from missing data must never masquerade as a real zero.
  const ASSIST_WINDOW_S = 12;
  const spotWindow = new Map<EntityId, number>(); // enemyId -> timeS of last player-spot edge
  const spottedSet = new Set<EntityId>(); // distinct enemies the player lit
  let spotAttributed = false;   // saw a spotterId-carrying event this battle

  // --- team-wide roster bookkeeping (battle report) -------------------------
  // Every combatant seen in ANY bus event (shell:hit fires for AI-vs-AI hits
  // too, enriched with names/specIds by state.ts) — dmg/kills/dead are pure
  // event sums, never re-simulated. Team split: every shell:hit /
  // tank:destroyed edge asserts attacker and target are on OPPOSING teams
  // (symmetric-teams charter: no friendly targeting), so a parity union-find
  // anchored at the player resolves ally/enemy for the whole battle graph.
  // A `battle:ended` payload roster (additive state.ts enrichment, see
  // docs/SYSTEMS.md) overrides with authoritative teams when present.
  const combatants = new Map<EntityId, Combatant>();
  let endRoster: readonly EndRosterRow[] | null = null;
  const tg = new Map<EntityId, TeamGraphNode>();

  function combatant(
    id: EntityId,
    name: string | null | undefined = null,
    specId: string | null | undefined = null,
  ): Combatant {
    let c = combatants.get(id);
    if (!c) {
      c = { name: null, specId: null, dmg: 0, kills: 0, dead: false };
      combatants.set(id, c);
    }
    if (name && !c.name) c.name = name;
    if (specId && !c.specId) {
      c.specId = specId;
      if (!c.name) { try { c.name = presentationSpec(specId).name; } catch (_) { /* raw id */ } }
    }
    return c;
  }

  function tgFind(x: EntityId): { root: EntityId; r: number } {
    let e = tg.get(x);
    if (!e) { e = { p: x, r: 0 }; tg.set(x, e); }
    if (e.p === x) return { root: x, r: 0 };
    const f = tgFind(e.p);
    e.p = f.root;
    e.r = (e.r + f.r) & 1;
    return { root: e.p, r: e.r };
  }

  /** Record that a and b fought — therefore sit on opposing teams. */
  function linkOpposed(a: EntityId | null | undefined, b: EntityId | null | undefined): void {
    if (a == null || b == null || a === b) return;
    const fa = tgFind(a);
    const fb = tgFind(b);
    if (fa.root === fb.root) return;
    const ra = tg.get(fa.root);
    if (!ra) return;
    ra.p = fb.root;
    ra.r = (fa.r + fb.r + 1) & 1;
  }

  /** 'ally' | 'enemy' | null (combatant not connected to the player yet). */
  function sideOf(id: EntityId): TeamSide {
    if (playerId == null) return null;
    if (id === playerId) return 'ally';
    if (!tg.has(id)) return null;
    const fp = tgFind(playerId);
    const fi = tgFind(id);
    if (fi.root !== fp.root) return null;
    return fi.r === fp.r ? 'ally' : 'enemy';
  }

  function newStats(): BattleStats {
    return {
      fired: 0, hits: 0, pens: 0, dealt: 0, received: 0, blocked: 0, assist: 0,
      modulesDestroyed: 0, perTarget: new Map<EntityId, TargetStats>(),
      perShell: new Map<string, ShellStats>(),   // shellType -> {fired,hits,pens,dmg}
      timeline: [],          // dealt-damage events [{t, d}] (battle report strip)
    };
  }

  function perShell(type: string): ShellStats {
    let s = stats.perShell.get(type);
    if (!s) {
      s = { fired: 0, hits: 0, pens: 0, dmg: 0 };
      stats.perShell.set(type, s);
    }
    return s;
  }

  // ---------- armor mini-diagram ----------
  // Icon framing (tools/icons-page.html): bbox-normalized ortho renders with
  // MARGIN 1.07. Hull-local extent approximated from spec.dims exactly like
  // damagePanel.ts: z in [-hullL/2, overallL - hullL/2] -> center (overall-hull)/2.
  function diagramFor(
    ev: ShotHitEvent,
    cls: HitOutcomePresentation,
  ): HTMLDivElement | null {
    const specId = ev.targetSpecId || ev.targetId;
    let dims = null;
    let arm = null;
    try {
      const spec = specId ? presentationSpec(specId) : null;
      dims = spec ? spec.dims : null;
      arm = spec ? spec.armor : null;
    } catch (_) { dims = null; }
    const wrap = el('div', 'cot-si-diag');
    const diagramImpact = impactForShotDiagram(ev, arm || {});
    if (!dims || !diagramImpact) {
      wrap.remove();
      return null;
    }
    const lp = diagramImpact.point;
    const ld = diagramImpact.direction;
    const projection = createShotDiagramProjection({ dims, armor: arm || undefined }, {
      topSize: CARD_TOP_S,
      sideWidth: CARD_SIDE_W,
      sideHeight: CARD_SIDE_H,
      presentationAnchor: presentationAnchorFor(specId) || undefined,
      presentationProjection: presentationProjectionFor(specId) || undefined,
    });
    const badgeCol = (cls && cls.color) || '#ff8a5c';
    // silhouette contrast (r4: the 0.34-alpha mask read as a gray pill):
    // brighter fill + a drop-shadow outline pass that traces the mask edge
    const SIL_FILL = 'rgba(206,222,236,0.55)';
    const SIL_OUTLINE =
      'drop-shadow(0 0 1px rgba(232,242,250,0.9)) drop-shadow(0 0 1px rgba(150,175,195,0.5))';

    // --- top view (96x96; icon: forward = up, screen right = -X world) ---
    const TS = CARD_TOP_S;
    const top = el('div', 'box', wrap);
    top.dataset.view = 'Top';
    top.style.width = `${TS}px`; top.style.height = `${TS}px`;
    const topSil = el('div', 'sil', top);
    maskIcon(topSil, specId, 'top_silhouette', SIL_FILL);
    topSil.style.filter = SIL_OUTLINE;
    const sT = projection.topScale;
    const topPx = projection.topPoint;
    const [hx, hy] = topPx(lp[0], lp[2]);
    // zone glow UNDER the plan-form (r2: painted over it, the orange radial
    // muddied the schematic into a blob); the translucent plan layer lets
    // the tint breathe through while the plan shape stays crisp
    addDiagramZoneTint(top, specId, 'top_silhouette', hx, hy, 24, badgeCol);
    // per-tank plan-form over glow + mask (r7: the flat silhouette read as a
    // generic rounded box) — neutral-gray baked schematic, see schematicUrl
    planForm(top, specId, 'top', TS, TS);
    // hit-sector flash (r3, WoT-mod style): a pulsing wedge opening from the
    // hit point back toward where the shell came FROM (event localDir) — the
    // zone reads from geometry before the text label is even parsed
    const wedge = diagramImpactWedge(ld, hx, hy, badgeCol);
    const arrow = diagramImpactArrow(ld, lp, hx, hy, topPx, TS);
    // facing cues over the (turretless-reading) baked mask: turret ring +
    // gun-barrel line so the top view communicates orientation at a glance
    const facing = diagramFacingCue(arm, dims, topPx, sT);
    const ovT = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ovT.setAttribute('class', 'ov');
    ovT.setAttribute('viewBox', `0 0 ${TS} ${TS}`);
    ovT.innerHTML =
      `<defs><marker id="cotsiarw" viewBox="0 0 8 8" refX="6.5" refY="4" markerWidth="5"
        markerHeight="5" orient="auto"><path d="M0 0L8 4L0 8z" fill="#ff8a5c"/></marker></defs>` +
      wedge +
      facing +
      arrow +
      `<circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="6.2" fill="none" stroke="#fff" stroke-width="1.6"/>` +
      `<circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="3.2" fill="#ff8a5c"/>`;
    top.appendChild(ovT);

    // --- side view (aspect 2:1; icon: front = right, up = +Y) ---
    const SW = CARD_SIDE_W, SH = CARD_SIDE_H;
    const side = el('div', 'box', wrap);
    side.dataset.view = 'Side';
    side.style.width = `${SW}px`; side.style.height = `${SH}px`;
    const sideSil = el('div', 'sil', side);
    maskIcon(sideSil, specId, 'side_silhouette', SIL_FILL);
    sideSil.style.filter = SIL_OUTLINE;
    const [sx, sy] = projection.sidePoint(lp[1], lp[2]);
    addDiagramZoneTint(side, specId, 'side_silhouette', sx, sy, 20, badgeCol);
    planForm(side, specId, 'side', SW, SH);
    const ovS = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ovS.setAttribute('class', 'ov');
    ovS.setAttribute('viewBox', `0 0 ${SW} ${SH}`);
    ovS.innerHTML =
      `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="5.6" fill="none" stroke="#fff" stroke-width="1.6"/>` +
      `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="3" fill="#ff8a5c"/>`;
    side.appendChild(ovS);
    return wrap;
  }

  // ---------- 1. outgoing shot card ----------
  function buildCard(ev: ShotHitEvent, cls: HitOutcomePresentation): HTMLDivElement {
    const card = el('div', 'cot-si-card');
    setShotCardTrace(card, ev, cls);
    appendShotCardHeader(card, ev, cls);
    appendShotCardSubtitle(card, ev);

    const body = el('div', 'cot-si-body', card);
    const rows = el('div', 'cot-si-rows', body);
    const kv = (k: string, v: string, cls = ''): HTMLDivElement => {
      const r = el('div', `cot-si-kv${cls ? ` ${cls}` : ''}`, rows);
      r.innerHTML = `<span class="cot-si-k">${GLYPH[k.toLowerCase()] || ''}<span>${k}</span></span><b>${v}</b>`;
      return r;
    };
    kv('Angle', `${Math.round(ev.impactAngleDeg || 0)}°`, 'w');
    kv('Armor', armorPresentation(ev), 'w armor');
    const penetration = penetrationPresentation(card, ev);
    kv('Damage', `${Math.round(ev.damage || 0)} / ${Math.round(ev.dmgRoll || 0)}`, 'w');
    {
      const r = kv('Pen', penetration.html + (penetration.qualifier
        ? `<span class="q" style="color:${penetration.qualifier === 'ERA' ? COL.yellow : '#9fb0bf'}">${penetration.qualifier}</span>`
        : ''), 'w pen');
      r.title = penetration.legend
        ? `Penetration (mm): ${penetration.legend}`
        : 'Penetration roll at impact';
    }
    const diag = diagramFor(ev, cls);
    if (diag) {
      body.appendChild(diag);
    }
    return card;
  }

  function showCard(ev: ShotHitEvent, cls: HitOutcomePresentation): void {
    // Mobile already has the resolved damage number and reticle confirmation.
    // Do not build diagrams or start image bakes for a surface CSS will hide.
    if (isTouchBattleLayout()) return;
    if (logOpen) return; // the log view replaces floating cards
    while (cardHost.firstChild) cardHost.firstChild.remove();
    const card = buildCard(ev, cls);
    cardHost.appendChild(card);
    // Center the report in the open vertical lane between the ENEMY roster
    // and minimap. These event-time reads keep 1v1 and 7v7 equally balanced
    // without putting layout work in the render loop.
    const rosterBottom = document.querySelector('.cot-ear.r')?.getBoundingClientRect().bottom || 0;
    const minimapTop = document.querySelector('.cot-minimap')?.getBoundingClientRect().top || 0;
    const cardHeight = card.getBoundingClientRect().height;
    if (rosterBottom > 0) {
      const laneTop = rosterBottom + 8;
      const laneBottom = minimapTop > laneTop ? minimapTop - 8 : laneTop + cardHeight;
      const centeredTop = laneTop + Math.max(0, (laneBottom - laneTop - cardHeight) / 2);
      cardHost.style.setProperty('--cot-si-roster-bottom', `${Math.ceil(laneTop)}px`);
      cardHost.style.setProperty('--cot-si-card-top', `${Math.ceil(centeredTop)}px`);
    }
    const fade = setTimeout(() => card.classList.add('out'), 6200);
    setTimeout(() => { clearTimeout(fade); if (card.parentNode) card.remove(); }, 7200);
  }

  // ---------- 2. collapsible log ----------
  function renderLog(): void {
    logPanel.textContent = '';
    const sec1 = el('div', 'sec', logPanel);
    sec1.innerHTML = `<span>Your shots</span><span>last ${shotLog.length}</span>`;
    if (!shotLog.length) el('div', 'cot-si-empty', logPanel).textContent = 'No shots connected yet.';
    for (const it of shotLog) {
      const r = el('div', 'cot-si-lrow', logPanel);
      r.innerHTML =
        `<span class="b" style="color:${it.cls.color}">${it.cls.label}</span>` +
        `<span class="d">${(it.ev.damage || 0) > 0 ? `−${Math.round(it.ev.damage)}` : '·'}</span>` +
        `<span class="n">${it.ev.targetName || it.ev.targetId || ''}</span>` +
        `<span class="z">${zoneLabel(it.ev.zone)} · ${Math.round(it.ev.flightDistM || 0)}m</span>`;
    }
    const total = receivedLog.reduce((a, e) => a + e.dmg, 0);
    const sec2 = el('div', 'sec', logPanel);
    sec2.innerHTML = `<span>Damage received</span><span>−${Math.round(total)}</span>`;
    if (!receivedLog.length) el('div', 'cot-si-empty', logPanel).textContent = 'Nothing received.';
    for (let i = receivedLog.length - 1; i >= 0; i--) {
      const e = receivedLog[i];
      const r = el('div', 'cot-si-lrow', logPanel);
      r.innerHTML =
        `<span class="b" style="color:${e.dmg > 0 ? COL.red : e.outcome.color}">` +
        `${e.dmg > 0 ? fmtTime(e.t) : e.outcome.label}</span>` +
        `<span class="d">${e.dmg > 0 ? `−${Math.round(e.dmg)}` : '·'}</span>` +
        `<span class="n">${e.attacker}</span>` +
        `<span class="z">${e.shellType}${e.mods ? ' · ' + e.mods : ''}</span>`;
    }
  }

  function toggleLog(): void {
    if (isTouchBattleLayout()) {
      logOpen = false;
      logPanel.classList.remove('open');
      return;
    }
    logOpen = !logOpen;
    logPanel.classList.toggle('open', logOpen);
    if (logOpen) {
      while (cardHost.firstChild) cardHost.firstChild.remove();
      renderLog();
    }
  }

  // ---------- 3. incoming toasts ----------
  function showToast(ev: ShotHitEvent, cls: HitOutcomePresentation): void {
    const t = el('div', 'cot-si-toast', toastHost);
    t.dataset.damage = String(Math.round(ev.damage || 0));
    t.dataset.kind = ev.kind;
    // Use the shared state-colored policy — never imply
    // worse: dim for a hit that left the module 'ok', yellow damaged, red
    // destroyed (an 'ok' Track R styled as a red casualty lied, r3 critique).
    // Registry ramp = the damage panel's exact hues (one state, one color).
    const stateCol = (state: string) => (
      state === 'red' ? STATE_COLOR.red : state === 'yellow' ? STATE_COLOR.yellow : COL.dim
    );
    const modsLost = (ev.eraPlate
      ? [`<span style="color:${COL.yellow}">ERA</span>`] : [])
      .concat((ev.modulesHit || [])
        .map((m) => `<span style="color:${stateCol(m.newState)}">` +
          `${registryLabel(MODULE_LABEL, m.module)}${m.newState === 'red' ? ' ✕' : ''}</span>`))
      .concat((ev.crewHit || []).map((c) => `<span style="color:${COL.red}">${registryLabel(CREW_LABEL, c)} ✕</span>`))
      .join(', ');
    t.innerHTML =
      `<div class="l1"><span>${ev.attackerName || 'Enemy'}</span>` +
      `<b>${uiIconSVG((ev.damage || 0) > 0 ? 'damage' : cls.icon, 11)}` +
      `${(ev.damage || 0) > 0 ? `−${Math.round(ev.damage)}` : cls.label}</b></div>` +
      `<div class="l2"><span>${ev.shellType || ''} ${shellDisplayName(ev)} · ${zoneLabel(ev.zone)}</span>` +
      `${modsLost ? `<span class="m">${modsLost}</span>` : ''}</div>`;
    t.dataset.outcome = cls.id;
    if (!(ev.damage > 0)) t.classList.add('deflected');
    t.style.borderLeftColor = (ev.damage || 0) > 0 ? COL.red : cls.color;
    const outcomeValue = t.querySelector<HTMLElement>('.l1 b');
    if (outcomeValue) outcomeValue.style.color = (ev.damage || 0) > 0 ? COL.red : cls.color;
    while (toastHost.children.length > 3) toastHost.firstChild?.remove();
    setTimeout(() => t.classList.add('out'), 4600);
    setTimeout(() => { if (t.parentNode) t.remove(); }, 5500);
  }

  // ---------- 4. session stats -> END SCREEN (killcam_endscreen r1) ----------
  // The full-screen report rendering moved to src/ui/endScreen.ts. This
  // module stays the single bookkeeper: buildSummary() bundles the same
  // resolved-event sums the old report printed — rosters from the
  // authoritative battle:ended payload (parity-graph evidence as fallback),
  // per-kill rows from the tank:destroyed credit, the best shot from the
  // full-battle allShots ledger. Nothing recomputed, nothing invented:
  // side-unconfirmed contacts are OMITTED rather than guessed onto a team,
  // and there is no base-capture stat because the sim has no capture.
  function summaryRows(): Map<EntityId, SummaryTeamRow> {
    const rows = new Map<EntityId, SummaryTeamRow>();
    for (const [id, combatantRow] of combatants) {
      rows.set(id, {
        id,
        name: combatantRow.name,
        specId: combatantRow.specId,
        dmg: Math.round(combatantRow.dmg),
        kills: combatantRow.kills,
        dead: combatantRow.dead,
        side: sideOf(id),
        isPlayer: id === playerId,
      });
    }
    for (const rosterRow of endRoster || []) {
      mergeEndRosterRow(rows, rosterRow);
    }
    return rows;
  }

  function mergeEndRosterRow(
    rows: Map<EntityId, SummaryTeamRow>,
    rosterRow: EndRosterRow,
  ): void {
    let row = rows.get(rosterRow.id);
    if (!row) {
      row = {
        id: rosterRow.id,
        name: null,
        specId: null,
        dmg: 0,
        kills: 0,
        dead: false,
        side: null,
        isPlayer: false,
      };
      rows.set(rosterRow.id, row);
    }
    if (!row.name && (rosterRow.vehicle || rosterRow.name)) {
      row.name = rosterRow.vehicle || rosterRow.name || null;
    }
    if (!row.specId && rosterRow.specId) row.specId = rosterRow.specId;
    if (rosterRow.team) row.side = rosterRow.team === 'enemy' ? 'enemy' : 'ally';
    if (rosterRow.alive === false) row.dead = true;
    if (rosterRow.isPlayer) row.isPlayer = true;
  }

  function summaryTeams(rows: Map<EntityId, SummaryTeamRow>): Readonly<{
    allies: EndScreenTeamRow[];
    enemies: EndScreenTeamRow[];
  }> {
    const allies: EndScreenTeamRow[] = [];
    const enemies: EndScreenTeamRow[] = [];
    for (const row of rows.values()) {
      if (row.side === 'ally') allies.push(row);
      else if (row.side === 'enemy') enemies.push(row);
    }
    const bySort = (left: EndScreenTeamRow, right: EndScreenTeamRow): number => (
      (right.isPlayer ? 1 : 0) - (left.isPlayer ? 1 : 0) || right.dmg - left.dmg
    );
    allies.sort(bySort);
    enemies.sort(bySort);
    return { allies, enemies };
  }

  function summaryKills(): Array<{ id: string; name: string; specId: string; dmg: number }> {
    const kills: Array<{ id: string; name: string; specId: string; dmg: number }> = [];
    for (const [id, target] of stats.perTarget) {
      if (!target.killed) continue;
      kills.push({
        id,
        name: target.name || id,
        specId: target.specId || id,
        dmg: Math.round(target.dmg),
      });
    }
    kills.sort((left, right) => right.dmg - left.dmg);
    return kills;
  }

  function bestShot(): ShotEntry | null {
    let best: ShotEntry | null = null;
    for (const shot of allShots) {
      if (shot.ev.damage > 0 && (!best || shot.ev.damage > best.ev.damage)) best = shot;
    }
    return best;
  }

  function summaryMapName(): string | null {
    let mapName = endInfo?.map || null;
    if (!mapName) return null;
    try {
      mapName = getMapConfig(mapName).name || mapName;
    } catch (_) {
      // Preserve the raw id when a replay references a removed map.
    }
    return mapName;
  }

  function summaryTime(): number {
    if (typeof endInfo?.timeS === 'number' && Number.isFinite(endInfo.timeS)) {
      return endInfo.timeS;
    }
    return Math.max(
      0,
      ...stats.timeline.map((entry) => entry.t),
      ...receivedLog.map((entry) => entry.t),
    );
  }

  function buildSummary(result: EndScreenResult): EndScreenSummary {
    const rows = summaryRows();
    const { allies, enemies } = summaryTeams(rows);
    const kills = summaryKills();
    const best = bestShot();
    const me = playerId === null ? undefined : rows.get(playerId);
    return {
      result,
      reason: endInfo?.reason || null,
      playerVehicle: me?.name || '',
      playerSpecId: me?.specId || null,
      playerDead: !!me?.dead,
      map: summaryMapName(),
      timeS: summaryTime(),
      stats: {
        dealt: stats.dealt,
        received: stats.received,
        blocked: stats.blocked,
        fired: stats.fired,
        hits: stats.hits,
        pens: stats.pens,
        assist: stats.assist,
        modulesDestroyed: stats.modulesDestroyed,
        spotted: spottedSet.size,
        spotAttributed,
      },
      kills,
      bestShot: best ? {
        damage: best.ev.damage,
        shellType: best.ev.shellType || '',
        shellName: shellDisplayName(best.ev),
        targetName: best.ev.targetName || '',
        zone: zoneLabel(best.ev.zone),
        distM: best.ev.flightDistM || 0,
        destroyed: !!best.ev.destroyed,
      } : null,
      allies,
      enemies,
    };
  }

  function renderStats(result: EndScreenResult): void {
    endScreen.show(result, buildSummary(result));
    statsRoot.classList.add('show'); // endScreen owns this too — kept for parity
  }

  // ---------- bookkeeping ----------
  function perTarget(ev: ShotHitEvent): TargetStats {
    let t = stats.perTarget.get(ev.targetId);
    if (!t) {
      t = {
        name: ev.targetName, specId: ev.targetSpecId, dmg: 0, hits: 0, pens: 0,
        killed: false, lastZone: null, hpLeft: null,
      };
      stats.perTarget.set(ev.targetId, t);
    }
    return t;
  }

  function recordHitCombatants(ev: ShotHitEvent): void {
    if (ev.attackerId == null || ev.targetId == null || ev.attackerId === ev.targetId) return;
    const attacker = combatant(ev.attackerId, ev.attackerName, ev.attackerSpecId);
    attacker.dmg += ev.damage || 0;
    const target = combatant(ev.targetId, ev.targetName, ev.targetSpecId);
    if (ev.destroyed) target.dead = true;
    if (ev.kind !== 'he_splash') linkOpposed(ev.attackerId, ev.targetId);
  }

  function recordSpottingAssist(ev: ShotHitEvent): void {
    const spottedAt = spotWindow.get(ev.targetId);
    if (ev.attackerId === playerId || ev.targetId === playerId || ev.damage <= 0) return;
    if (spottedAt === undefined || (ev.timeS || 0) - spottedAt > ASSIST_WINDOW_S) return;
    if (ev.attackerId != null && sideOf(ev.attackerId) === 'ally') stats.assist += ev.damage;
  }

  function recordOutgoingHit(ev: ShotHitEvent): void {
    if (ev.attackerId !== playerId || !ev.targetId || ev.targetId === playerId) return;
    const outcome = hitOutcomeFor(ev);
    stats.hits += 1;
    if (outcome.penetrated) stats.pens += 1;
    stats.dealt += ev.damage || 0;
    const shell = perShell(ev.shellType || '—');
    shell.hits += 1;
    if (outcome.penetrated) shell.pens += 1;
    shell.dmg += ev.damage || 0;
    if (ev.damage > 0) stats.timeline.push({ t: ev.timeS || 0, d: ev.damage });
    stats.modulesDestroyed += (ev.modulesHit || [])
      .filter((module) => module.newState === 'red').length;
    const target = perTarget(ev);
    target.dmg += ev.damage || 0;
    target.hits += 1;
    if (outcome.penetrated) target.pens += 1;
    if (ev.zone) target.lastZone = ev.zone;
    if (typeof ev.targetHpAfter === 'number' && Number.isFinite(ev.targetHpAfter)) {
      target.hpLeft = Math.max(0, Math.round(ev.targetHpAfter));
    }
    if (ev.destroyed) {
      target.killed = true;
      target.hpLeft = 0;
    }
    shotLog.unshift({ ev, cls: outcome });
    if (shotLog.length > 6) shotLog.pop();
    allShots.push({ ev, cls: outcome });
    showCard(ev, outcome);
    if (logOpen) renderLog();
  }

  function recordIncomingHit(ev: ShotHitEvent): void {
    if (ev.targetId !== playerId) return;
    const outcome = hitOutcomeFor(ev);
    stats.received += ev.damage || 0;
    if ((ev.damage || 0) <= 0 && outcome.blocked) stats.blocked += ev.dmgRoll || 0;
    const mods = (ev.modulesHit || [])
      .filter((module) => module.newState === 'red')
      .map((module) => registryLabel(MODULE_LABEL, module.module))
      .join(', ');
    receivedLog.push({
      t: ev.timeS || 0,
      dmg: ev.damage || 0,
      kind: ev.kind,
      aid: ev.attackerId,
      attacker: ev.attackerName || 'Enemy',
      shellType: ev.shellType || '',
      mods,
      outcome,
      zone: ev.zone || '',
    });
    showToast(ev, outcome);
    if (logOpen) renderLog();
  }

  bus.on('shell:fired', (payload) => {
    const p = eventPayload<ShellFiredEvent>(payload);
    if (!p.isPlayer) return;
    // identity hardening (r3 audit): latch the player id from the sim event
    // itself — hud.update only forwards setPlayer once a frame has rendered,
    // which silently dropped a hit resolved before the first post-start
    // frame. main.ts now also sets it synchronously at battle start (see
    // docs/GUNNERY-CAMERA-SPEC.md); this latch covers sim-tick-driven
    // replays that never render at all.
    if (p.shooterId != null) playerId = p.shooterId;
    stats.fired += 1;
    perShell(p.shellType || '—').fired += 1;
  });

  bus.on('tank:spotted', (payload) => {
    const ev = eventPayload<TankSpottedEvent | null>(payload);
    if (!ev || ev.id == null) return;
    // a spot is a sim-asserted cross-team fact: the spotting TEAM ('player'
    // side) opposes the target — feed the parity graph the same way a direct
    // hit would (helps side resolution for combatants that never traded fire)
    if (ev.team === 'player' && playerId != null) linkOpposed(playerId, ev.id);
    if (ev.spotterId == null) return;
    spotAttributed = true;
    if (playerId != null && ev.spotterId === playerId && ev.id !== playerId) {
      spotWindow.set(ev.id, ev.timeS || 0);
      spottedSet.add(ev.id);
    }
  });

  bus.on('shell:hit', (payload) => {
    const ev = eventPayload<ShotHitEvent>(payload);
    recordHitCombatants(ev);
    if (playerId == null) return;
    recordSpottingAssist(ev);
    recordOutgoingHit(ev);
    recordIncomingHit(ev);
  });

  bus.on('tank:destroyed', (payload) => {
    const p = eventPayload<TankDestroyedEvent>(payload);
    // team-wide roster bookkeeping (fire deaths included — no shell:hit fires)
    combatant(p.id, null, p.specId).dead = true;
    if (p.killerId != null && p.killerId !== p.id) {
      combatant(p.killerId).kills += 1;
      linkOpposed(p.killerId, p.id);
    }
    if (playerId == null || p.killerId !== playerId || p.id === playerId) return;
    let t = stats.perTarget.get(p.id);
    if (!t) {
      let name = p.specId;
      try { name = presentationSpec(p.specId).name; } catch (_) { /* keep raw id */ }
      t = {
        name, specId: p.specId, dmg: 0, hits: 0, pens: 0,
        killed: false, lastZone: null, hpLeft: null,
      };
      stats.perTarget.set(p.id, t);
    }
    t.killed = true;
    t.hpLeft = 0;
  });

  // --- REPORT GATE: battle-report rendering deferred past the kill-cam ------
  // state.ts emits battle:ended in the very sim step the player dies, but
  // the composition root starts the kill-cam replay LATER in the same task — rendering
  // the report synchronously buried the still-playing slow-mo flight and the
  // whole 7 s x-ray hold under the full-screen DEFEAT panel (z 71 over the
  // replay's z 60; r6 critical). Stat ACCUMULATION stays on battle:ended;
  // RENDERING is buffered and flushed when the replay releases the screen
  // (killcam:done — emitted by src/game/killcam.ts on finish, skip and cancel
  // alike). The no-replay path flushes after one animation frame + macrotask:
  // killcam:begin is emitted synchronously inside begin(), which runs either
  // in the same task as battle:ended (live loop) or in the next main-loop
  // frame (debug fastForward emitted the event outside the loop), so by
  // decision time "a replay owns the screen" is a settled fact, never a race.
  // A watchdog past the longest possible replay (3.4 s flight + 7 s hold +
  // slack) guarantees a stuck replay can never eat the report.
  let kcReplayActive = false;
  let pendingReport: EndScreenResult | null = null; // buffered battle:ended result ('' is valid)
  let reportFlushTimer: TimerHandle | null = null;
  let reportWatchdog: TimerHandle | null = null;
  const REPORT_MAX_WAIT_MS = 16000;

  function clearReportBuffer(): void {
    pendingReport = null;
    if (reportFlushTimer) { clearTimeout(reportFlushTimer); reportFlushTimer = null; }
    if (reportWatchdog) { clearTimeout(reportWatchdog); reportWatchdog = null; }
  }

  function flushReport(): void {
    if (pendingReport === null) return;
    const result = pendingReport;
    clearReportBuffer();
    renderStats(result);
  }

  function scheduleReportFlush(): void {
    const decide = () => {
      if (pendingReport === null) return;
      if (reportFlushTimer) { clearTimeout(reportFlushTimer); reportFlushTimer = null; }
      if (!kcReplayActive) { flushReport(); return; }
      // replay owns the screen: killcam:done flushes; watchdog backstops
      if (!reportWatchdog) reportWatchdog = setTimeout(flushReport, REPORT_MAX_WAIT_MS);
    };
    // one full frame first (the main loop's end-flow, which starts the
    // replay, runs inside the next animation frame), then a macrotask so the
    // decision runs after that frame's synchronous work completes
    requestAnimationFrame(() => setTimeout(decide, 0));
    // rAF-throttled fallback (hidden tab): decide anyway — a throttled tab
    // renders no replay frames either, so flushing early shows nothing wrong
    if (reportFlushTimer) clearTimeout(reportFlushTimer);
    reportFlushTimer = setTimeout(decide, 600);
  }

  bus.on('killcam:begin', () => { kcReplayActive = true; });
  bus.on('killcam:done', () => {
    kcReplayActive = false;
    if (pendingReport !== null) flushReport();
  });

  bus.on('battle:ended', (payload) => {
    const p = eventPayload<BattleEndedEvent | null>(payload);
    // the floating shot card and incoming toasts must never linger behind the
    // results screen — a dimmed PENETRATION card double-reported the final
    // shot in the corner of the DEFEAT report for up to 7 s (r4 critique)
    while (cardHost.firstChild) cardHost.firstChild.remove();
    while (toastHost.firstChild) toastHost.firstChild.remove();
    // authoritative team roster when the sim provides one (additive payload)
    if (p && Array.isArray(p.roster)) endRoster = p.roster;
    // identity hardening (r3 audit): the roster names the player — latch it
    // in case no rendered frame ever forwarded setPlayer (headless replays)
    if (playerId == null && endRoster) {
      const me = endRoster.find((r) => r.isPlayer);
      if (me && me.id != null) playerId = me.id;
    }
    // report header data (r3): battle duration is the payload's end-of-battle
    // sim clock (setupBattle zeroes it), map id is an additive state.ts
    // enrichment (docs/SYSTEMS.md) — the header simply omits what is absent
    endInfo = p ? { timeS: p.timeS, map: p.map || null, reason: p.reason || null } : null;
    pendingReport = p ? (p.result || '') : '';
    scheduleReportFlush();
  });
  bus.on('ui:shotLog', () => toggleLog());
  bus.on('ui:battleStart', () => api.reset());

  const api: ShotInfoRuntime = {
    /**
     * PERF (perf-r2): pre-bake the plan-form schematics for a roster while
     * the battle loading screen holds the frame. The bake is a synchronous
     * double getImageData + unsharp over a 512² icon — the V8 profile billed
     * ~0.28 s of it to the battle window because the FIRST shot card per
     * enemy type paid the bake on the exact frame the player landed a hit.
     * schematicUrl caches per id/view/size, so warming here makes every
     * in-battle card a cache hit. Fire-and-forget; failures keep the CSS
     * fallback path exactly as before.
     * @param {string[]} specIds fielded roster (both teams)
     */
    warmSchematics(specIds: readonly string[]): void {
      // perf-r3 (play-session probe): a 14-tank roster kicked 28 decodes at
      // once and their onload bakes (two full-image getImageData passes each)
      // landed as one burst of small tasks in the same window — measured as
      // 56 readbacks inside the rematch entry. Kick ONE tank per frame: the
      // warm still finishes far inside the loading screen, spread thin.
      const ids = (specIds || []).filter(Boolean);
      let i = 0;
      const kick = () => {
        if (i >= ids.length) return;
        const id = ids[i++];
        schematicUrl(id, 'top', CARD_TOP_S * 2, CARD_TOP_S * 2);
        schematicUrl(id, 'side', CARD_SIDE_W * 2, CARD_SIDE_H * 2);
        requestAnimationFrame(kick);
      };
      kick();
    },
    root,
    statsRoot,
    toggleLog,

    /** Latch the player entity id (hud.ts forwards it each frame). */
    setPlayer(id: EntityId | null): void { playerId = id; },

    /** Hide the end-of-battle stats card (garage/hidden HUD). */
    hideStats() {
      clearReportBuffer();
      endScreen.hide();
      statsRoot.classList.remove('show');
      document.body.classList.remove('cot-si-report');
    },

    /** Fresh battle: clear cards, toasts, logs and session stats. */
    reset() {
      clearReportBuffer();
      while (cardHost.firstChild) cardHost.firstChild.remove();
      while (toastHost.firstChild) toastHost.firstChild.remove();
      shotLog.length = 0;
      allShots.length = 0;
      receivedLog.length = 0;
      combatants.clear();
      tg.clear();
      endRoster = null;
      endInfo = null;
      spotWindow.clear();
      spottedSet.clear();
      spotAttributed = false;
      Object.assign(stats, newStats());
      stats.perTarget = new Map();
      logOpen = false;
      logPanel.classList.remove('open');
      endScreen.hide();
      statsRoot.classList.remove('show');
      document.body.classList.remove('cot-si-report');
    },
  };
  return api;
}
