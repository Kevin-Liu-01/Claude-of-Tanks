// src/ui/settings.ts — in-game settings panel (Esc in battle, gear in garage).
//
// CONTROLS tab: every action from src/game/input.ts with three binding chips —
// primary key, secondary key (arrow-key movement ships as default alt), and a
// gamepad button. Click a chip then press any key / mouse button / wheel notch
// (or pad button for the pad column) to rebind; tap Esc to cancel, HOLD Esc to
// bind Escape itself; right-click a chip to clear it. Conflicts highlight both
// rows and offer a swap. GAMEPLAY tab: mouse sensitivity, sniper sensitivity,
// aim smoothing (0 % = raw 1:1 input), invert-Y, AI difficulty (easy/normal/
// hard segmented picker — consumed by game/state.ts via getStoredDifficulty at
// battle setup), controller aim sensitivity — each slider is paired with a
// numeric entry field. SOUND tab: master/engine/gunfire/ambience/UI volume
// sliders (persisted with the gameplay settings; broadcast live over the bus
// as 'ui:volumes' for src/audio/audio.js). All state persists via the input
// layer's localStorage stores. Also owns the fading controls-hint strip
// shown on battle start and the garage gear button, and broadcasts
// 'ui:bindingsChanged' so the HUD's shell/consumable hotkey labels stay honest.
// KILL-CAM aware: while a replay owns the screen ('killcam:begin'/'done' on
// the bus) the panel never auto-opens, never veils, and closes itself — the
// replay's ANY-KEY skip always wins (player death hands off to the death cam
// with a free cursor, like WoT).
// Design language mirrors src/ui/hud.js / garage.js (palette, chamfers, type).
// settings_ui r2 (owner: "make our settings screen look much better too"):
// premium reskin in the garage r9 kit — blurred pause veil + panel enter
// transition (reduced-motion aware), amber-underline segmented tabs, amber
// tick-and-rule section headers, zebra'd rows, keycap binding chips with
// bound/unbound/listening/conflict states, custom amber-fill sliders, ON/OFF
// segmented toggles, plate group-cards, flat-orange chamfered RESUME (r7
// BATTLE plate) + red-outline LEAVE BATTLE, overflow-gated scroll fades.
// Behavior is UNCHANGED: same classes, same rebind/persistence/pause flow.

import { FONT_STACK, ensureFonts } from './fonts.ts';
import { uiIconSVG } from './uiIcons.ts';
import {
  SETTINGS_ACTION_ICONS,
  SETTINGS_OPTION_ICONS,
  type SettingsIconSpec,
} from './settingsIcons.ts';
import { isAnyModalOpen } from './modal.ts';
import { shouldOpenSettingsFromPointerUnlock } from './keyboardOwnership.ts';
import { createElement as el, ensureStyle } from './dom.ts';
import type {
  ActionId,
  AiDifficulty,
  BindingSlot,
  InputLayer,
  InputSettings,
  RmbMode,
} from '../game/input.ts';
import {
  getDeviceTier, getMobilePresetChoice, getStoredChoice,
  MOBILE_PRESET_ORDER, PRESET_ORDER, PRESETS,
  setMobilePresetName, setPresetName,
  type PresetName,
} from '../engine/quality.ts';

type SettingsTab = 'controls' | 'gameplay' | 'sound' | 'graphics';
type BindingSlotKey = BindingSlot | 'pad';
type NumericSettingKey =
  | 'sensitivity'
  | 'sniperSensScale'
  | 'aimSmoothing'
  | 'padSensitivity'
  | 'volMaster'
  | 'volEngine'
  | 'volCombat'
  | 'volAmbience'
  | 'volUi'
  | 'volVoice';
type BooleanSettingKey =
  | 'invertY'
  | 'showPerfMeter'
  | 'showDebugHud'
  | 'armorAimOverlay'
  | 'alarmHeartbeat';
type ActionDefinition = InputLayer['actionDefs'][number];
type TimerHandle = ReturnType<typeof setTimeout>;

interface SettingsEventPayload {
  readonly phase?: string;
  readonly [key: string]: unknown;
}

interface SettingsBus {
  emit(event: string, payload: unknown): unknown;
  on(event: string, handler: (payload: unknown) => void): unknown;
}

export interface SettingsOptions {
  readonly input: InputLayer;
  readonly bus?: SettingsBus;
  readonly isBattleActive?: () => boolean;
  readonly canLeaveBattle?: () => boolean;
  readonly onLeaveBattle?: () => void;
  readonly gearVisible?: () => boolean;
  readonly isGamePaused?: () => boolean;
  readonly gear?: HTMLButtonElement;
  readonly registerMenuAction?: boolean;
}

export interface SettingsRuntime {
  readonly root: HTMLDivElement;
  readonly gear: HTMLButtonElement;
  open(): void;
  close(options?: { noRelock?: boolean }): void;
  toggle(): void;
  isOpen(): boolean;
  showHints(): void;
}

interface SliderOptions {
  readonly toDisp?: (value: number) => number;
  readonly fromDisp?: (value: number) => number;
  readonly digits?: number;
  readonly step?: string;
  readonly dispStep?: string;
  readonly unit?: string;
  readonly onChange?: () => void;
  readonly blipOnCommit?: boolean;
}

interface CaptureState {
  readonly actionId: ActionId;
  readonly slot: BindingSlotKey;
  readonly chip: HTMLButtonElement;
}

type ConflictState =
  | {
      readonly pad: false;
      readonly actionId: ActionId;
      readonly slot: BindingSlot;
      readonly otherId: ActionId;
      readonly otherSlot: BindingSlot;
      readonly code: string;
    }
  | {
      readonly pad: true;
      readonly actionId: ActionId;
      readonly slot: 'pad';
      readonly otherId: ActionId;
      readonly otherSlot: 'pad';
      readonly code: number;
    };

interface ActionBindingRow {
  readonly row: HTMLDivElement;
  readonly chips: {
    readonly 0: HTMLButtonElement;
    readonly 1: HTMLButtonElement;
    readonly pad: HTMLButtonElement;
  };
}

function requiredElement<ElementType extends Element>(
  parent: ParentNode,
  selector: string,
): ElementType {
  const element = parent.querySelector<ElementType>(selector);
  if (!element) throw new Error(`[settings] missing required element: ${selector}`);
  return element;
}

const SETTINGS_CSS = `
/* settings_ui r2 (owner: "make our settings screen look much better"):
   premium pass in the garage r9 kit — blurred pause veil, amber top strip,
   segmented tabs with amber underline, amber-tick section rules, keycap
   binding chips with bound/unbound/listening/conflict states, custom steel
   sliders with amber fill, ON/OFF segmented toggles, plate group-cards on
   the slider tabs, flat-orange chamfered RESUME (BATTLE-button plate), red
   LEAVE BATTLE, overflow-gated scroll fades. Reskin only — every class the
   probes and main.ts touch keeps its name and open/close semantics. */
.cot-settings{position:fixed;inset:0;z-index:80;display:none;align-items:center;justify-content:center;
  background:radial-gradient(130% 100% at 50% 42%,rgba(4,7,10,.50) 0%,rgba(2,4,6,.76) 100%);
  -webkit-backdrop-filter:blur(8px) saturate(.9);backdrop-filter:blur(8px) saturate(.9);
  font-family:${FONT_STACK};color:#e6edf3;-webkit-user-select:none;user-select:none;}
.cot-settings.open{display:flex;animation:cotSetVeil var(--cot-motion-base) var(--cot-ease-out);}
.cot-settings *{box-sizing:border-box;margin:0;padding:0;}
.cot-set-panel{position:relative;width:744px;max-width:96vw;max-height:88vh;
  display:flex;flex-direction:column;
  background:linear-gradient(180deg,rgba(12,17,22,.96),rgba(6,9,12,.985));
  border:1px solid rgba(146,164,180,.30);
  box-shadow:0 24px 90px rgba(0,0,0,.8),inset 0 1px 0 rgba(235,243,250,.05);}
.cot-settings.open .cot-set-panel{animation:cotSetIn var(--cot-motion-slow) var(--cot-ease-drawer) backwards;}
@keyframes cotSetVeil{from{opacity:0;}}
@keyframes cotSetIn{from{opacity:0;transform:translateY(14px) scale(.985);}}
.cot-set-hdr{display:flex;align-items:center;gap:12px;padding:15px 22px 11px;}
.cot-set-hdr h2{font-size:15px;font-weight:800;letter-spacing:.18em;color:#d5dfe7;
  text-transform:uppercase;margin-right:auto;}
.cot-set-hdr h2::before{content:'';display:inline-block;width:18px;height:3px;
  background:#f0a030;margin-right:12px;vertical-align:3px;}
/* PAUSE: battle-pause tag in the header — shown only while the open panel is
   actually freezing a live battle (root gets .paused; garage Esc never shows
   it). Era-chip plate + slow-pulsing amber lamp instead of the old blinking
   outline chip (settings_ui r2). */
.cot-set-paused{display:none;align-items:center;gap:8px;font-size:9.5px;font-weight:800;
  letter-spacing:.30em;color:#ffd27a;text-transform:uppercase;padding:6px 12px 5px 11px;
  border:1px solid rgba(240,176,74,.6);border-bottom:2px solid #f0a030;
  background:linear-gradient(180deg,rgba(58,40,14,.92),rgba(30,20,8,.95));}
.cot-set-paused::before{content:'';width:6px;height:6px;flex:0 0 auto;background:#f0a030;
  box-shadow:0 0 8px rgba(240,160,48,.8);animation:cotPausedPulse 1.7s ease-in-out infinite;}
.cot-settings.paused .cot-set-paused{display:inline-flex;}
@keyframes cotPausedPulse{0%,100%{opacity:1;}50%{opacity:.3;}}
.cot-set-close{cursor:pointer;width:30px;height:30px;flex:0 0 auto;display:flex;
  align-items:center;justify-content:center;
  border:1px solid rgba(146,164,180,.35);border-bottom:2px solid rgba(146,164,180,.45);
  background:rgba(11,15,20,.7);color:#9fb0bf;font-family:${FONT_STACK};font-size:13px;
  line-height:1;transition:color var(--cot-motion-fast) ease,border-color var(--cot-motion-fast) ease,
    transform var(--cot-motion-fast) var(--cot-ease-out);}
.cot-set-close:active{transform:scale(.96);}
.cot-set-close:hover{color:#f0b04a;border-color:rgba(240,176,74,.6);}
/* segmented tabs: hover plate + amber active underline (garage era-chip kit) */
.cot-set-tabs{display:flex;gap:2px;padding:0 22px;border-bottom:1px solid rgba(146,164,180,.22);
  background:linear-gradient(180deg,rgba(146,164,180,.05),rgba(146,164,180,0));}
.cot-set-tab{position:relative;cursor:pointer;background:none;border:none;
  font-family:${FONT_STACK};font-size:11px;font-weight:700;letter-spacing:.22em;color:#8a97a3;
  text-transform:uppercase;padding:11px 16px 10px;
  transition:color var(--cot-motion-fast) ease,background-color var(--cot-motion-fast) ease;}
.cot-set-tab:hover{color:#c6d2dc;background:rgba(146,164,180,.07);}
.cot-set-tab.sel{color:#ffd27a;background:linear-gradient(180deg,rgba(240,160,48,.10),rgba(240,160,48,0));}
.cot-set-tab.sel::after{content:'';position:absolute;left:6px;right:6px;bottom:-1px;height:2px;
  background:#f0a030;box-shadow:0 -1px 8px rgba(240,160,48,.45);}
.cot-set-tab .ct{margin-left:7px;font-style:normal;font-weight:600;font-size:9.5px;
  color:#6d7a86;letter-spacing:.05em;font-variant-numeric:tabular-nums;}
.cot-set-tab.sel .ct{color:#d8a04c;}
/* scrolling rows area — thin steel scrollbar + overflow-gated fade masks
   (.fade-top/.fade-bot toggled by JS from live scroll position; the garage
   r9 .can-scroll pattern, split per edge) */
.cot-set-body{flex:1;overflow-y:auto;padding:2px 22px 16px;min-height:280px;
  scrollbar-width:thin;scrollbar-color:rgba(146,164,180,.45) rgba(8,11,14,.6);}
.cot-set-body::-webkit-scrollbar{width:6px;}
.cot-set-body::-webkit-scrollbar-track{background:rgba(8,11,14,.6);}
.cot-set-body::-webkit-scrollbar-thumb{background:rgba(146,164,180,.45);}
.cot-set-body::-webkit-scrollbar-thumb:hover{background:rgba(146,164,180,.65);}
.cot-set-body.fade-bot{-webkit-mask-image:linear-gradient(180deg,#000 0,#000 calc(100% - 28px),transparent 100%);
  mask-image:linear-gradient(180deg,#000 0,#000 calc(100% - 28px),transparent 100%);}
.cot-set-body.fade-top{-webkit-mask-image:linear-gradient(180deg,transparent 0,#000 28px,#000 100%);
  mask-image:linear-gradient(180deg,transparent 0,#000 28px,#000 100%);}
.cot-set-body.fade-top.fade-bot{
  -webkit-mask-image:linear-gradient(180deg,transparent 0,#000 28px,#000 calc(100% - 28px),transparent 100%);
  mask-image:linear-gradient(180deg,transparent 0,#000 28px,#000 calc(100% - 28px),transparent 100%);}
/* section header: amber tick + hairline rule running to the right edge
   (the garage r9 .mtitle pattern) */
.cot-set-group{display:flex;align-items:center;gap:8px;font-size:10px;font-weight:700;
  letter-spacing:.24em;color:#8a97a3;text-transform:uppercase;margin:18px 0 6px;}
.cot-set-group::before{content:'';width:8px;height:2px;flex:0 0 auto;background:#f0a030;}
.cot-set-group::after{content:'';flex:1;height:1px;background:rgba(146,164,180,.14);}
.cot-set-group:first-child{margin-top:12px;}
/* plate group-card (garage r9 battlefield/camo plate) — clusters on the
   GAMEPLAY / SOUND / GRAPHICS tabs sit on one industrial plate each */
.cot-set-card{margin:12px 0 0;padding:10px 12px 9px;
  background:linear-gradient(180deg,rgba(9,13,17,.66),rgba(6,9,12,.5));
  border:1px solid rgba(146,164,180,.16);}
.cot-set-card .cot-set-group{margin:0 0 4px;}
.cot-set-row{display:flex;align-items:center;justify-content:space-between;gap:14px;
  padding:7px 10px;border-bottom:1px solid rgba(146,164,180,.08);transition:background .12s;}
.cot-set-row:hover{background:rgba(146,164,180,.06);}
.cot-set-row.alt{background:rgba(146,164,180,.03);}
.cot-set-row.alt:hover{background:rgba(146,164,180,.06);}
.cot-set-row .lb{min-width:0;flex:1;display:flex;align-items:center;gap:9px;
  font-size:12.5px;color:#c6d2dc;letter-spacing:.04em;line-height:1.3;}
.cot-setting-icon{position:relative;width:24px;height:24px;flex:0 0 24px;display:grid;place-items:center;
  color:#91a3b2;background:linear-gradient(180deg,rgba(37,46,54,.72),rgba(16,21,26,.78));
  border:1px solid rgba(146,164,180,.24);box-shadow:inset 0 1px 0 rgba(235,243,250,.05);}
.cot-setting-icon svg{display:block;width:16px;height:16px;overflow:visible;}
.cot-setting-icon.tone-amber{color:#e2a64d;border-color:rgba(226,166,77,.28);}
.cot-setting-icon.tone-red{color:#d9685f;border-color:rgba(217,104,95,.28);}
.cot-setting-icon.tone-green{color:#67bd7d;border-color:rgba(103,189,125,.28);}
.cot-setting-icon.tone-cyan{color:#67b8d8;border-color:rgba(103,184,216,.28);}
.cot-setting-icon.tone-violet{color:#aa8bd3;border-color:rgba(170,139,211,.28);}
.cot-setting-icon[data-badge]::after{content:attr(data-badge);position:absolute;right:-4px;bottom:-4px;
  min-width:11px;height:11px;padding:0 2px;display:grid;place-items:center;font-size:7px;font-weight:900;
  line-height:1;color:#161009;background:#e2a64d;border:1px solid #6d4717;box-shadow:0 1px 3px #000;}
.cot-setting-label-text{min-width:0;}
.cot-set-row.conflict,.cot-set-row.conflict.alt{background:rgba(190,60,50,.12);
  box-shadow:inset 2px 0 0 #c8503c,inset 0 0 0 1px rgba(240,90,90,.35);}
.cot-set-row.conflict .cot-chip{border-color:rgba(240,110,95,.6);
  border-bottom-color:rgba(200,80,60,.85);}
.cot-set-row .chips{display:flex;gap:6px;align-items:center;}
.cot-set-colhdr{display:flex;align-items:center;gap:6px;padding:12px 10px 5px;
  border-bottom:1px solid rgba(146,164,180,.22);}
.cot-set-colhdr span{width:92px;text-align:center;font-size:8.5px;font-weight:700;
  letter-spacing:.2em;color:#68747f;text-transform:uppercase;}
.cot-set-colhdr span.act{width:auto;flex:1;text-align:left;}
.cot-set-colhdr span.pad{width:72px;}
/* binding chips: keycap read — top-light gradient, 1px inner highlight, 2px
   bottom edge. States: bound steel / unbound dashed dim / listening amber
   pulse / conflict red tint (row-scoped above). */
.cot-chip{width:92px;height:26px;text-align:center;cursor:pointer;font-family:${FONT_STACK};
  font-size:11px;font-weight:700;letter-spacing:.08em;color:#e6edf3;padding:5px 5px 4px;
  background:linear-gradient(180deg,rgba(40,49,58,.95) 0%,rgba(24,30,37,.95) 55%,rgba(15,20,25,.97) 100%);
  border:1px solid rgba(146,164,180,.5);border-bottom:2px solid rgba(88,102,115,.95);
  box-shadow:inset 0 1px 0 rgba(235,243,250,.12);
  transition:color .12s,border-color .12s,filter .12s;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cot-chip.padcol{width:72px;}
.cot-chip:hover{color:#ffd27a;border-color:rgba(240,176,74,.7);filter:brightness(1.08);}
.cot-chip:active{transform:translateY(1px);}
.cot-chip.empty{color:#55606a;background:rgba(11,15,20,.5);box-shadow:none;
  border:1px dashed rgba(146,164,180,.26);padding:5px;}
.cot-chip.listening{color:#ffd27a;border:1px solid #f0a030;border-bottom:2px solid #c97f18;
  background:linear-gradient(180deg,rgba(66,42,12,.96),rgba(34,22,8,.97));
  animation:cotChipPulse 1.1s ease-in-out infinite;font-size:9px;letter-spacing:.05em;padding:5px 3px 4px;}
/* controls_gunnery r4 minor: Chromium's default blue focus ring survived on
   chips after a rebind click (visible in the conflict screenshot) and read as
   web-page chrome inside the custom panel. All panel controls drop the UA
   outline; keyboard navigation keeps an on-brand amber ring via
   :focus-visible (mouse clicks set :focus but not :focus-visible, so the
   pointer flow stays clean). */
.cot-chip:focus,.cot-set-tab:focus,.cot-set-btn:focus,.cot-set-close:focus,
.cot-set-seg button:focus{outline:none;}
.cot-chip:focus-visible,.cot-set-tab:focus-visible,.cot-set-btn:focus-visible,
.cot-set-close:focus-visible,.cot-set-seg button:focus-visible{
  outline:1px solid #f0a030;outline-offset:1px;}
.cot-set-slider input[type=range]:focus{outline:none;}
.cot-set-slider input[type=range]:focus-visible{outline:1px solid #f0a030;outline-offset:2px;}
@keyframes cotChipPulse{
  0%,100%{box-shadow:inset 0 1px 0 rgba(255,210,122,.2),0 0 3px rgba(240,160,48,.25);}
  50%{box-shadow:inset 0 1px 0 rgba(255,210,122,.2),0 0 14px rgba(240,160,48,.6);}}
.cot-set-conflict{display:none;margin:10px 22px 0;padding:9px 14px;align-items:center;gap:12px;
  background:linear-gradient(180deg,rgba(52,16,13,.95),rgba(34,11,9,.95));
  border:1px solid rgba(216,92,68,.5);border-left:3px solid #c8503c;font-size:11.5px;
  letter-spacing:.04em;color:#f2b1a8;}
.cot-set-conflict.show{display:flex;}
.cot-set-conflict b{color:#ffd27a;font-weight:700;}
.cot-set-conflict .msg{flex:1;}
/* footer: quiet ghost reset (left) / red-outline LEAVE BATTLE + flat-orange
   chamfered RESUME (right) — the r7 BATTLE plate, no gloss, no bevel */
.cot-set-ftr{display:flex;align-items:center;gap:10px;padding:13px 22px 16px;
  border-top:1px solid rgba(146,164,180,.22);
  background:linear-gradient(180deg,rgba(146,164,180,.04),rgba(146,164,180,0));}
.cot-set-btn{cursor:pointer;font-family:${FONT_STACK};font-size:11px;font-weight:800;
  letter-spacing:.2em;color:#fff8ee;text-transform:uppercase;padding:10px 22px 9px;
  text-shadow:none;background:#ee8912;border:1px solid #8a4a06;border-bottom:2px solid #a85a05;
  transition:filter .12s;}
.cot-set-btn:hover{filter:brightness(1.08);}
.cot-set-btn:active{transform:translateY(1px);}
.cot-set-btn.ghost{background:rgba(11,15,20,.55);color:#9fb0bf;
  border:1px solid rgba(146,164,180,.3);border-bottom:2px solid rgba(146,164,180,.38);}
.cot-set-btn.ghost:hover{color:#f0b04a;border-color:rgba(240,176,74,.6);filter:none;}
/* reset anchors LEFT and pushes the action pair right — margin on RESET (not
   the old margin-left:auto on LEAVE) so the primary stays flush right even
   when LEAVE BATTLE is display:none in the garage context */
.cot-set-btn.reset{margin-right:auto;}
.cot-set-btn.leave{color:#f0a9a0;background:rgba(46,13,10,.55);
  border:1px solid rgba(216,92,68,.55);border-bottom:2px solid rgba(170,56,40,.85);}
.cot-set-btn.leave:hover{color:#ffd0c5;border-color:rgba(239,110,82,.9);
  background:rgba(66,18,14,.7);filter:none;}
.cot-set-btn.resume{width:150px;height:38px;padding:0 0 1px;border:none;text-indent:.24em;
  letter-spacing:.24em;font-size:11.5px;
  background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 150 38'%3E%3Cpath d='M8.4 .5H141.6L149.5 19 141.6 37.5H8.4L.5 19Z' fill='%23ee8912' stroke='%238a4a06' stroke-width='1'/%3E%3Cpath d='M1.3 20.5 8.9 37.1h132.2l7.6-16.6' fill='none' stroke='%23a85a05' stroke-width='2' opacity='.9'/%3E%3C/svg%3E") 0 0/100% 100% no-repeat;}
.cot-set-btn.resume:hover{filter:brightness(1.07);}
/* sliders: steel track, amber fill (--f set from JS), keycap thumb */
.cot-set-slider{display:flex;align-items:center;gap:10px;}
.cot-set-slider input[type=range]{-webkit-appearance:none;appearance:none;--f:50%;
  width:190px;height:16px;cursor:pointer;background:transparent;}
.cot-set-slider input[type=range]::-webkit-slider-runnable-track{height:4px;
  background:linear-gradient(90deg,#c9812a 0,#f0a030 var(--f),rgba(146,164,180,.22) var(--f));
  box-shadow:inset 0 1px 1px rgba(0,0,0,.5);}
.cot-set-slider input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;
  width:11px;height:16px;margin-top:-6px;
  background:linear-gradient(180deg,#4a5866,#232c34);
  border:1px solid rgba(210,225,240,.6);border-bottom:2px solid rgba(70,84,96,.95);
  box-shadow:inset 0 1px 0 rgba(235,243,250,.18),0 1px 3px rgba(0,0,0,.5);
  transition:border-color .12s;}
.cot-set-slider input[type=range]:hover::-webkit-slider-thumb{border-color:rgba(240,176,74,.75);}
.cot-set-slider input[type=range]::-moz-range-track{height:4px;background:rgba(146,164,180,.22);}
.cot-set-slider input[type=range]::-moz-range-progress{height:4px;background:#f0a030;}
.cot-set-slider input[type=range]::-moz-range-thumb{width:11px;height:16px;border-radius:0;
  background:linear-gradient(180deg,#4a5866,#232c34);border:1px solid rgba(210,225,240,.6);}
.cot-set-slider input[type=number]{width:62px;text-align:right;font-size:12px;font-weight:700;
  color:#ffd27a;font-variant-numeric:tabular-nums;letter-spacing:.03em;padding:4px 6px 3px;
  font-family:${FONT_STACK};background:rgba(8,11,15,.85);
  border:1px solid rgba(146,164,180,.4);border-bottom:2px solid rgba(146,164,180,.5);
  -moz-appearance:textfield;appearance:textfield;}
.cot-set-slider input[type=number]:focus{outline:none;border-color:rgba(240,176,74,.65);}
.cot-set-slider input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;}
.cot-set-slider .unit{width:16px;font-size:11px;font-weight:700;color:#8a97a3;}
/* segmented pickers (difficulty / RMB mode / quality) + ON/OFF toggles —
   keycap plates, amber selected (era-chip sel treatment) */
.cot-set-seg{display:flex;gap:4px;}
.cot-set-seg button{cursor:pointer;font-family:${FONT_STACK};font-size:10px;font-weight:700;
  letter-spacing:.16em;text-transform:uppercase;color:#8a97a3;padding:6px 14px 5px;
  background:linear-gradient(180deg,rgba(30,38,46,.9),rgba(16,21,26,.95));
  border:1px solid rgba(146,164,180,.42);border-bottom:2px solid rgba(88,102,115,.8);
  box-shadow:inset 0 1px 0 rgba(235,243,250,.07);
  transition:color var(--cot-motion-fast) ease,border-color var(--cot-motion-fast) ease,
    background-color var(--cot-motion-fast) ease,transform var(--cot-motion-fast) var(--cot-ease-out);}
.cot-set-seg button:active{transform:scale(.97);}
.cot-set-seg button:hover{color:#c6d2dc;border-color:rgba(210,225,240,.55);}
.cot-set-seg button.sel{color:#ffd27a;border-color:rgba(240,176,74,.75);border-bottom-color:#f0a030;
  background:linear-gradient(180deg,rgba(58,40,14,.92),rgba(30,20,8,.95));
  box-shadow:inset 0 1px 0 rgba(255,210,122,.12);}
.cot-set-seg.onoff button{padding:5px 13px 4px;min-width:48px;}
.cot-set-note{font-size:10px;letter-spacing:.05em;color:#68747f;margin:10px 10px 2px;line-height:1.55;}
.cot-set-note b{color:#9fb0bf;font-weight:700;}
/* settings_ui r2: the panel respects reduced motion — enter transition,
   paused lamp and listening pulse all freeze; hover transitions collapse */
@media (prefers-reduced-motion:reduce){
  .cot-settings.open,.cot-settings.open .cot-set-panel{animation:none;}
  .cot-set-paused::before{animation:none;}
  .cot-chip.listening{animation:none;
    box-shadow:inset 0 1px 0 rgba(255,210,122,.2),0 0 10px rgba(240,160,48,.5);}
  .cot-settings *{transition-duration:0s !important;}
}
/* Standalone fallback placement. The garage mounts this settings-owned button
   into its top navigation rail; these coordinates only apply before that
   mount or in a surface that creates settings without the garage. */
.cot-gear{position:fixed;top:60px;right:26px;z-index:62;width:42px;height:42px;display:none;
  align-items:center;justify-content:center;cursor:pointer;
  background:rgba(11,15,20,.8);border:1px solid rgba(146,164,180,.3);
  transition:border-color .12s;pointer-events:auto;}
.cot-gear:hover{border-color:rgba(240,176,74,.6);}
.cot-gear:hover svg path{fill:#f0b04a;}
.cot-hints{position:fixed;left:50%;bottom:100px;transform:translateX(-50%);z-index:45;
  display:none;align-items:center;gap:16px;padding:8px 20px;pointer-events:none;
  background:linear-gradient(180deg,rgba(9,13,17,.82),rgba(7,10,14,.7));
  border:1px solid rgba(146,164,180,.3);box-shadow:0 4px 18px rgba(0,0,0,.45);
  font-family:${FONT_STACK};font-size:10.5px;font-weight:600;letter-spacing:.12em;
  color:#9fb0bf;text-transform:uppercase;white-space:nowrap;
  opacity:1;transition:opacity 1.2s ease;}
.cot-hints .hg{display:flex;align-items:center;gap:5px;}
.cot-hints kbd{font-family:${FONT_STACK};font-size:10px;font-weight:700;color:#e6edf3;
  letter-spacing:.06em;padding:2px 6px;line-height:14px;
  background:linear-gradient(180deg,rgba(34,42,50,.95),rgba(18,23,28,.95));
  border:1px solid rgba(146,164,180,.45);border-bottom:2px solid rgba(146,164,180,.6);}
.cot-resume{position:fixed;inset:0;z-index:79;display:none;align-items:center;justify-content:center;
  flex-direction:column;gap:14px;cursor:pointer;background:rgba(4,7,10,.55);
  font-family:${FONT_STACK};color:#e6edf3;-webkit-user-select:none;user-select:none;}
.cot-resume.show{display:flex;}
.cot-resume .rz-title{font-size:22px;font-weight:800;letter-spacing:.34em;text-transform:uppercase;
  color:#f0b04a;text-shadow:0 2px 14px rgba(0,0,0,.8);}
.cot-resume .rz-sub{font-size:11px;font-weight:600;letter-spacing:.22em;color:#9fb0bf;
  text-transform:uppercase;}

/* Touch settings use a true finger-sized target floor in every orientation. */
body.cot-touch-layout .cot-settings button{min-height:44px;}
body.cot-touch-layout .cot-set-close{width:44px;height:44px;}
`;

const GEAR_SVG = uiIconSVG('settings', 22, '#9fb0bf');

const ESC_HOLD_MS = 700; // hold Esc this long during capture to bind Escape itself
const PAD_START_BUTTON = 9; // START closes the panel for controller players
const MAX_PAD_BUTTONS = 17;
// controls_gunnery r7: menu-suppression grace after a kill-cam replay
// releases the screen. The ANY-KEY skip that finishes a replay is handled by
// the kill-cam's CAPTURE-phase keydown listener, which emits 'killcam:done'
// synchronously — the input layer's BUBBLE-phase listener then sees the very
// same keydown and would fire the settingsMenu action with the replay flag
// already cleared, opening the options menu on the skip press itself. The
// grace window absorbs that same-event race (sub-ms in practice); a human
// deliberately opening the menu after a skip is always slower than 250 ms.
const KC_DONE_GRACE_MS = 250;

/** Canonical compact battle-control reference, shared by the hint UI and tests. */
export function battleControlHintGroups(rmbMode: RmbMode = 'hold'): Array<[string, ActionId[]]> {
  return [
    ['Move', ['forward', 'left', 'back', 'right']],
    ['Fire', ['fire']],
    ['Sniper', ['sniperToggle']],
    ['Gun Hold', ['freeLook']],
    [rmbMode === 'freelook' ? 'Gun Hold' : 'Aim', ['freeCamera']],
    ['Shells', ['shell1', 'shell2', 'shell3']],
    ['Repairs', ['consumable1', 'consumable2', 'consumable3']],
    ['Handbrake', ['handbrake']],
    ['Menu', ['settingsMenu']],
  ];
}

/**
 * Create the settings panel + garage gear button + battle controls-hint strip.
 *
 * @param {{
 *   input: import('../game/input.ts').InputLayer,
 *   bus?: {emit:Function,on:Function},
 *   isBattleActive?: () => boolean,   // battle running (phase battle, no result)
 *   canLeaveBattle?: () => boolean,   // any battle/spectator state
 *   onLeaveBattle?: () => void,
 *   gearVisible?: () => boolean,      // gear button should currently show
 *   isGamePaused?: () => boolean,     // opening the panel freezes a live battle
 *   gear?: HTMLButtonElement,          // demand-boundary-owned trigger
 *   registerMenuAction?: boolean,      // access owner may register the lazy action
 * }} opts
 * @returns {{open:Function,close:(opts?:{noRelock?:boolean})=>void,
 *   toggle:Function,isOpen:()=>boolean,showHints:Function,root:HTMLElement}}
 */
export function createSettings(opts: SettingsOptions): SettingsRuntime {
  ensureFonts();
  const { input, bus } = opts;
  const isBattleActive = opts.isBattleActive || (() => false);
  const canLeaveBattle = opts.canLeaveBattle || isBattleActive;
  const onLeaveBattle = opts.onLeaveBattle || null;
  const gearVisible = opts.gearVisible || (() => false);
  // PAUSE: main.ts supplies the live-battle predicate; the PAUSED header tag
  // shows exactly when the open panel is what froze the sim (garage Esc and
  // the end-overlay Esc keep the plain settings header).
  const isGamePaused = opts.isGamePaused || (() => false);
  const emit = (event: string, payload: SettingsEventPayload = {}) => {
    bus?.emit(event, payload);
  };

  ensureStyle('cot-settings-style', SETTINGS_CSS);

  // --- DOM ---------------------------------------------------------------------
  const root = el('div', 'cot-settings');
  root.innerHTML =
    `<div class="cot-set-panel">` +
    `<div class="cot-set-hdr"><h2>Settings</h2>` +
    `<span class="cot-set-paused">Paused</span>` +
    `<button class="cot-set-close" type="button" title="Close">&#10005;</button></div>` +
    `<div class="cot-set-tabs">` +
    // settings_ui r2: CONTROLS carries its action count (era-chip .ct read);
    // the other tabs stay clean — a count of sliders is noise, not signal.
    `<button class="cot-set-tab sel" data-tab="controls" type="button">Controls<i class="ct">${input.actionDefs.length}</i></button>` +
    `<button class="cot-set-tab" data-tab="gameplay" type="button">Gameplay</button>` +
    `<button class="cot-set-tab" data-tab="sound" type="button">Sound</button>` +
    `<button class="cot-set-tab" data-tab="graphics" type="button">Graphics</button>` +
    `</div>` +
    `<div class="cot-set-conflict"><span class="msg"></span>` +
    `<button class="cot-set-btn swap" type="button">Swap</button>` +
    `<button class="cot-set-btn ghost dismiss" type="button">Cancel</button></div>` +
    `<div class="cot-set-body"></div>` +
    `<div class="cot-set-ftr">` +
    `<button class="cot-set-btn ghost reset" type="button">Reset to defaults</button>` +
    `<button class="cot-set-btn ghost leave" type="button">Leave Battle</button>` +
    `<button class="cot-set-btn resume" type="button">Resume</button></div>` +
    `</div>`;
  document.body.appendChild(root);

  const body = requiredElement<HTMLDivElement>(root, '.cot-set-body');
  const conflictBar = requiredElement<HTMLDivElement>(root, '.cot-set-conflict');
  const conflictMsg = requiredElement<HTMLSpanElement>(conflictBar, '.msg');
  const resetBtn = requiredElement<HTMLButtonElement>(root, '.reset');
  const leaveBtn = requiredElement<HTMLButtonElement>(root, '.leave');
  const resumeBtn = requiredElement<HTMLButtonElement>(root, '.resume');

  // settings_ui r2: overflow-gated scroll fades on the rows area (garage r9
  // .can-scroll pattern, split per edge so the top fade only appears once the
  // list is actually scrolled and the bottom one drops at the end).
  function updateScrollFades() {
    const canTop = body.scrollTop > 4;
    const canBot = body.scrollTop < body.scrollHeight - body.clientHeight - 4;
    body.classList.toggle('fade-top', canTop);
    body.classList.toggle('fade-bot', canBot);
  }
  body.addEventListener('scroll', updateScrollFades, { passive: true });
  window.addEventListener('resize', () => { if (open) updateScrollFades(); });

  // settings_ui r2: subtle zebra on the rows, restarting at each section
  // header so the alternation never carries a stripe across group breaks.
  function applyZebra() {
    let i = 0;
    for (const n of body.querySelectorAll('.cot-set-group,.cot-set-row')) {
      if (n.classList.contains('cot-set-group')) { i = 0; continue; }
      n.classList.toggle('alt', (i++ % 2) === 1);
    }
  }

  /** A compact, decorative vector plate that keeps the setting text as the
   *  accessible label. Icon maps are exhaustive over ActionId/InputSettings,
   *  so adding a new setting fails typecheck until it receives a glyph. */
  function settingLabel(parent: HTMLElement, label: string, spec: SettingsIconSpec): HTMLSpanElement {
    const lb = el('span', 'lb', parent);
    const icon = el('span', `cot-setting-icon tone-${spec.tone || 'steel'}`, lb);
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = uiIconSVG(spec.id, 16);
    if (spec.badge) icon.dataset.badge = spec.badge;
    el('span', 'cot-setting-label-text', lb).textContent = label;
    return lb;
  }

  const gear = opts.gear || el('button', 'cot-gear');
  gear.type = 'button';
  gear.setAttribute('aria-label', 'Settings');
  gear.innerHTML = GEAR_SVG;
  gear.title = 'Settings';
  if (!gear.parentNode) document.body.appendChild(gear);

  const hints = el('div', 'cot-hints');
  document.body.appendChild(hints);

  // Click-to-resume veil (controls_gunnery r2): pointer-lock loss from ALT-TAB
  // / focus loss must NOT throw the options menu at the player (WoT returns
  // you to the battle). The veil relocks inside its own click gesture.
  const resume = el('div', 'cot-resume');
  resume.innerHTML =
    '<div class="rz-title">Battle paused</div>' +
    '<div class="rz-sub">Click to resume &mdash; Esc for settings</div>';
  document.body.appendChild(resume);

  function showResumeVeil() {
    if (open || resume.classList.contains('show')) return;
    // KILL-CAM: the replay owns the screen — a veil on top would sit over the
    // cinematic and its mousedown would eat the click players aim at the
    // 'ANY KEY — SKIP' prompt.
    if (kcReplay) return;
    // CURSOR-AIM FALLBACK: the veil exists to re-grab pointer lock inside a
    // fresh click gesture after focus loss. With the lock unavailable the aim
    // never depended on it — showing the veil would only swallow the next
    // battle click (input.isCursorAim() means every lock attempt is denied).
    if (input.isCursorAim && input.isCursorAim()) return;
    resume.classList.add('show');
    emit('ui:click', {});
  }

  function hideResumeVeil() {
    resume.classList.remove('show');
  }

  resume.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    hideResumeVeil();
    if (isBattleActive()) input.requestLock(); // inside the click gesture
    emit('ui:click', {});
  });

  // --- state ---------------------------------------------------------------------
  let open = false;
  // KILL-CAM awareness (controls_gunnery r7 MAJOR): every player death while
  // pointer-locked used to throw this panel open ON TOP of the death replay.
  // The death branch in main.ts calls document.exitPointerLock() with the
  // battle still live (allies keep fighting), and the unlock heuristic below
  // read that as an Esc press. Track the replay via the bus — killcam:begin
  // is emitted synchronously in the same JS task as that exitPointerLock
  // call, so the flag is ALWAYS set by the time the (async) pointerlockchange
  // event lands. While a replay owns the screen, nothing here may auto-open,
  // veil, or capture keys: the replay's ANY-KEY skip must win.
  let kcReplay = false;
  let kcDoneMs = -Infinity; // when the last replay released the screen
  const nowMs = () =>
    (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const replayOwnsScreen = () => kcReplay || nowMs() - kcDoneMs < KC_DONE_GRACE_MS;
  let activeTab: SettingsTab = 'controls';
  // A touch-only device has no keyboard to rebind, so the Controls
  // tab rendered 70+ sub-30px keycap chips (useless, and every one a failed
  // touch target). Hide the tab and land on Gameplay instead.
  if (input.isTouchLayout && input.isTouchLayout()) {
    activeTab = 'gameplay';
    const tb = root.querySelector<HTMLButtonElement>('.cot-set-tab[data-tab="controls"]');
    if (tb) tb.style.display = 'none';
  }
  let capture: CaptureState | null = null; // { actionId, slot: 0|1|'pad', chip }
  let escHoldTimer: TimerHandle | null = null; // pending hold-Esc-to-bind timer during capture
  let conflict: ConflictState | null = null; // binding collision awaiting swap/cancel
  let relockOnClose = false;
  let hintTimer: TimerHandle | null = null;
  let hintFadeTimer: TimerHandle | null = null;
  let panelRaf = 0; // gamepad poll while the panel is open
  const panelPadPrev = new Array(MAX_PAD_BUTTONS).fill(true);

  const SLOT_NAME: Readonly<Record<BindingSlot, string>> = { 0: 'primary', 1: 'secondary' };
  const bindLabel = (id: ActionId): string =>
    input.labelFor(input.getBinding(id, 0) || input.getBinding(id, 1));

  /** Broadcast current shell/consumable hotkey labels so the HUD tray never
   *  shows a stale (or hardcoded) key. */
  function emitBindings() {
    emit('ui:bindingsChanged', {
      shells: (['shell1', 'shell2', 'shell3'] as const).map(bindLabel),
      consumables: (['consumable1', 'consumable2', 'consumable3'] as const).map(bindLabel),
      specialAction: bindLabel('specialAction'),
    });
  }

  function bindingsMutated() {
    refreshChips();
    emitBindings();
    emit('ui:click', {});
  }

  // --- CONTROLS tab -----------------------------------------------------------
  const rowByAction = new Map<ActionId, ActionBindingRow>();

  function chipText(actionId: ActionId, slotKey: BindingSlotKey): string {
    if (slotKey === 'pad') return input.padLabelFor(input.getPadBinding(actionId));
    return input.labelFor(input.getBinding(actionId, slotKey));
  }

  function makeChip(
    def: ActionDefinition,
    slotKey: BindingSlotKey,
    parent: HTMLElement,
  ): HTMLButtonElement {
    const chip = el('button', `cot-chip${slotKey === 'pad' ? ' padcol' : ''}`, parent);
    chip.type = 'button';
    chip.title = slotKey === 'pad'
      ? `${def.label} — controller button. Right-click to clear.`
      : `${def.label} — ${SLOT_NAME[slotKey]} key. Right-click to clear.`;
    chip.addEventListener('click', () => {
      emit('ui:click', {});
      beginCapture(def.id, slotKey, chip);
    });
    chip.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      cancelCapture();
      clearConflict();
      if (slotKey === 'pad') input.setPadBinding(def.id, null);
      else input.setBinding(def.id, null, slotKey);
      bindingsMutated();
    });
    return chip;
  }

  function renderControls() {
    body.textContent = '';
    rowByAction.clear();
    const colhdr = el('div', 'cot-set-colhdr', body);
    colhdr.innerHTML =
      '<span class="act">Action</span><span>Primary</span><span>Secondary</span><span class="pad">Pad</span>';
    let lastGroup = null;
    for (const def of input.actionDefs) {
      if (def.group !== lastGroup) {
        el('div', 'cot-set-group', body).textContent = def.group;
        lastGroup = def.group;
      }
      const row = el('div', 'cot-set-row', body);
      row.dataset.action = def.id;
      settingLabel(row, def.label, SETTINGS_ACTION_ICONS[def.id]);
      const chipsWrap = el('div', 'chips', row);
      const chips = {
        0: makeChip(def, 0, chipsWrap),
        1: makeChip(def, 1, chipsWrap),
        pad: makeChip(def, 'pad', chipsWrap),
      };
      rowByAction.set(def.id, { row, chips });
    }
    const note = el('div', 'cot-set-note', body);
    note.innerHTML =
      'Click a chip, then press any key, mouse button or wheel notch to rebind — pad chips listen for a ' +
      'controller button. Tap Esc to cancel; <b>hold Esc</b> to bind Escape itself. Right-click a chip to clear it.<br>' +
      'What <b>Aim / Free Look (RMB)</b> does (hold-to-aim, toggle-aim or classic free look) is picked on the ' +
      'GAMEPLAY tab. <b>Gun Hold (Free Aim)</b> preserves the current turret and gun lay while ' +
      'the sight keeps moving. Controller: left stick drives, right stick aims, RB holds the gun, ' +
      'START opens this menu.';
    refreshChips();
  }

  function refreshChips() {
    for (const def of input.actionDefs) {
      const r = rowByAction.get(def.id);
      if (!r) continue;
      for (const slotKey of [0, 1, 'pad'] as const satisfies readonly BindingSlotKey[]) {
        const chip = r.chips[slotKey];
        if (capture && capture.chip === chip) continue; // keep listening label
        const t = chipText(def.id, slotKey);
        chip.textContent = t;
        chip.classList.toggle('empty', t === '—');
      }
    }
  }

  // --- GAMEPLAY tab -----------------------------------------------------------
  function sliderRow(
    parent: HTMLElement,
    label: string,
    key: NumericSettingKey,
    min: number,
    max: number,
    o: SliderOptions = {},
  ): void {
    const toD = o.toDisp || ((value: number) => value);
    const fromD = o.fromDisp || ((value: number) => value);
    const digits = o.digits != null ? o.digits : 2;
    const row = el('div', 'cot-set-row', parent);
    settingLabel(row, label, SETTINGS_OPTION_ICONS[key]);
    const wrap = el('div', 'cot-set-slider', row);
    const range = el('input', '', wrap);
    range.type = 'range';
    range.setAttribute('aria-label', label);
    range.min = String(min);
    range.max = String(max);
    range.step = o.step || '0.05';
    const num = el('input', '', wrap);
    num.type = 'number';
    num.setAttribute('aria-label', `${label} value`);
    num.min = String(toD(min));
    num.max = String(toD(max));
    num.step = o.dispStep || '0.05';
    el('span', 'unit', wrap).textContent = o.unit || '×';
    const sync = () => {
      const v = input.getSettings()[key];
      range.value = String(v);
      // settings_ui r2: amber fill runs to the live position (CSS --f percent
      // consumed by the track gradient — accent-color can't do a filled track)
      const pct = ((v - min) / (max - min)) * 100;
      range.style.setProperty('--f', `${Math.max(0, Math.min(100, pct)).toFixed(1)}%`);
      num.value = String(parseFloat(toD(v).toFixed(digits)));
    };
    sync();
    range.addEventListener('input', () => {
      input.setSetting(key, parseFloat(range.value));
      sync();
      if (o.onChange) o.onChange();
    });
    num.addEventListener('change', () => {
      const d = parseFloat(num.value);
      if (Number.isFinite(d)) input.setSetting(key, fromD(d));
      sync();
      if (o.onChange) o.onChange();
      emit('ui:click', {});
    });
    if (o.blipOnCommit) {
      // audible reference blip on slider release, so volume changes can be
      // judged without leaving the panel
      range.addEventListener('change', () => emit('ui:click', {}));
    }
  }

  /** settings_ui r2: plate group-card — a cluster (title + rows + notes) on
   *  one industrial plate (garage r9 battlefield/camo treatment). */
  function groupCard(parent: HTMLElement, title: string): HTMLDivElement {
    const card = el('div', 'cot-set-card', parent);
    el('div', 'cot-set-group', card).textContent = title;
    return card;
  }

  /** settings_ui r2: WoT-style ON/OFF segmented chip pair (replaces the old
   *  knob switch). Same persistence path: input.setSetting(key, bool). */
  function onOffRow(
    parent: HTMLElement,
    label: string,
    key: BooleanSettingKey,
    onChange?: () => void,
  ): HTMLDivElement {
    const row = el('div', 'cot-set-row', parent);
    settingLabel(row, label, SETTINGS_OPTION_ICONS[key]);
    const seg = el('div', 'cot-set-seg onoff', row);
    const btns: HTMLButtonElement[] = [];
    const sync = () => {
      const on = !!input.getSettings()[key];
      btns[0].classList.toggle('sel', !on);
      btns[1].classList.toggle('sel', on);
      btns[0].setAttribute('aria-pressed', String(!on));
      btns[1].setAttribute('aria-pressed', String(on));
    };
    for (const [val, txt] of [[false, 'Off'], [true, 'On']] as const) {
      const b = el('button', '', seg);
      b.type = 'button';
      b.textContent = txt;
      b.setAttribute('aria-label', `${label}: ${txt}`);
      b.addEventListener('click', () => {
        if (!!input.getSettings()[key] === val) return; // no-op re-click
        input.setSetting(key, val);
        sync();
        if (onChange) onChange();
        emit('ui:click', {});
      });
      btns.push(b);
    }
    sync();
    return row;
  }

  function renderGameplay() {
    body.textContent = '';
    const touchLayout = !!(input.isTouchLayout && input.isTouchLayout());
    // settings_ui r2: each cluster sits on its own plate card
    const aim = groupCard(body, touchLayout ? 'Touch aim' : 'Mouse');
    sliderRow(aim, touchLayout ? 'Swipe sensitivity' : 'Mouse sensitivity', 'sensitivity', 0.2, 3);
    sliderRow(aim, 'Sniper sensitivity scale', 'sniperSensScale', 0.2, 3);
    sliderRow(aim, 'Aim smoothing (0% = raw input)', 'aimSmoothing', 0, 1, {
      step: '0.01', dispStep: '1', unit: '%', digits: 0,
      toDisp: (v) => v * 100, fromDisp: (v) => v / 100,
    });
    onOffRow(aim, 'Invert vertical aim (Y axis)', 'invertY');

    // gunnery r1 (owner): what right-click does — hold-to-aim (default),
    // toggle-aim, or the classic gun-lock free look. Persisted as
    // settings.rmbMode; main.ts routes the RMB-bound action per frame.
    const RMB_MODE_DEFS: ReadonlyArray<readonly [RmbMode, string]> = [
      ['hold', 'hold-to-aim'],
      ['toggle', 'toggle-aim'],
      ['freelook', 'free look'],
    ];
    if (!touchLayout) {
      const rmbRow = el('div', 'cot-set-row', aim);
      settingLabel(rmbRow, 'Right click (RMB)', SETTINGS_OPTION_ICONS.rmbMode);
      const rmbSeg = el('div', 'cot-set-seg', rmbRow);
      const rmbBtns: HTMLButtonElement[] = [];
      for (const [value, label] of RMB_MODE_DEFS) {
        const b = el('button', '', rmbSeg);
        b.type = 'button';
        b.textContent = label;
        b.dataset.mode = value;
        b.addEventListener('click', () => {
          input.setSetting('rmbMode', value);
          for (const x of rmbBtns) x.classList.toggle('sel', x.dataset.mode === value);
          emit('ui:click', {});
        });
        rmbBtns.push(b);
      }
      for (const x of rmbBtns) x.classList.toggle('sel', x.dataset.mode === input.getSettings().rmbMode);
      const rmbNote = el('div', 'cot-set-note', aim);
      rmbNote.textContent =
        'Hold-to-aim: hold RMB to zoom into sniper, release to return to your previous view ' +
        '(aim pitch is preserved both ways). Toggle-aim: tap RMB to enter or leave sniper. ' +
        'Gun hold: hold RMB to preserve the current turret and gun lay while freely moving the sight. ' +
        'Caps Lock is always the dedicated gun-hold action; Left Alt remains its secondary default. ' +
        'Release to let the gun catch up. Shift toggles sniper mode.';
    }

    const battle = groupCard(body, 'Battle');
    const diffRow = el('div', 'cot-set-row', battle);
    settingLabel(diffRow, 'AI difficulty (next battle)', SETTINGS_OPTION_ICONS.aiDifficulty);
    const seg = el('div', 'cot-set-seg', diffRow);
    const diffBtns: HTMLButtonElement[] = [];
    for (const tier of ['easy', 'normal', 'hard'] as const satisfies readonly AiDifficulty[]) {
      const b = el('button', '', seg);
      b.type = 'button';
      b.textContent = tier;
      b.addEventListener('click', () => {
        input.setSetting('aiDifficulty', tier);
        for (const x of diffBtns) x.classList.toggle('sel', x.textContent === tier);
        emit('ui:difficulty', { difficulty: tier });
        emit('ui:click', {});
      });
      diffBtns.push(b);
    }
    for (const x of diffBtns) x.classList.toggle('sel', x.textContent === input.getSettings().aiDifficulty);
    const diffNote = el('div', 'cot-set-note', battle);
    diffNote.textContent =
      'Easy bots aim slower, react later and engage closer; Hard bots hunt weak spots. ' +
      'Takes effect when the next battle starts.';

    const iface = groupCard(body, 'Interface');
    onOffRow(
      iface,
      'Scoped armor flashlight · penetration gradient (default on)',
      'armorAimOverlay',
    );
    onOffRow(iface, 'FPS / ping readout (top-right · default on)', 'showPerfMeter',
      emitPerfMeter);
    onOffRow(iface, 'Debug telemetry dashboard (top-right)', 'showDebugHud',
      emitDebugHud);
    const armorNote = el('div', 'cot-set-note', iface);
    armorNote.textContent =
      'In sniper view, aimed enemy armor is shaded from red (blocked) through amber to green ' +
      '(high penetration chance). The calculation follows the selected shell, range, angle, ' +
      'ricochet rules, ERA, tracks, and spaced armor.';
    const debugNote = el('div', 'cot-set-note', iface);
    debugNote.textContent =
      'Debug telemetry folds FPS, latency, frame pacing, render load, resolution, simulation, ' +
      'world, shadow, network, and memory diagnostics into one 4 Hz dashboard. It loads only when enabled.';

    const pad = groupCard(body, 'Controller');
    sliderRow(pad, 'Controller aim sensitivity', 'padSensitivity', 0.2, 3);
    const padNote = el('div', 'cot-set-note', pad);
    padNote.textContent = input.isPadConnected()
      ? 'Controller detected — left stick drives, right stick aims (squared response for fine aim).'
      : 'No controller detected. Plug in any standard gamepad and press a button.';

    const note = el('div', 'cot-set-note', body);
    note.textContent = touchLayout
      ? 'Swipe sensitivity and smoothing apply directly to the battlefield aim pad. Sniper sensitivity stacks with each zoom step.'
      : 'Sniper sensitivity stacks with the per-zoom reduction, so high zoom always aims finer. ' +
        'Type exact values in the number fields for precise tuning.';
  }

  // --- SOUND tab ---------------------------------------------------------------
  const VOLUME_DEFS = [
    ['volMaster', 'Master volume'],
    ['volEngine', 'Engine & mechanical volume'],
    ['volCombat', 'Gunfire & impacts volume'],
    ['volAmbience', 'Ambience volume (wind, birds, garage)'],
    ['volUi', 'Interface & music volume'],
    ['volVoice', 'Crew voices & alarms volume'],
  ] as const satisfies ReadonlyArray<readonly [NumericSettingKey, string]>;

  /** Broadcast the persisted FPS/ping preference (default on, user opt-out). */
  function emitPerfMeter() {
    emit('ui:perfMeter', { on: !!input.getSettings().showPerfMeter });
  }

  /** Lazy engineering telemetry follows one persisted Interface setting. */
  function emitDebugHud() {
    emit('ui:debugHud', { on: !!input.getSettings().showDebugHud });
  }

  /** Broadcast the whole mix so the audio graph re-levels its channel buses. */
  function emitVolumes() {
    const s = input.getSettings();
    emit('ui:volumes', {
      master: s.volMaster,
      engine: s.volEngine,
      combat: s.volCombat,
      ambience: s.volAmbience,
      ui: s.volUi,
      voice: s.volVoice,
      alarmHeartbeat: !!s.alarmHeartbeat,
    });
  }

  function renderSound() {
    body.textContent = '';
    const vol = groupCard(body, 'Volume');
    for (const [key, label] of VOLUME_DEFS) {
      sliderRow(vol, label, key, 0, 1, {
        step: '0.01', dispStep: '1', unit: '%', digits: 0,
        toDisp: (v) => v * 100, fromDisp: (v) => v / 100,
        onChange: emitVolumes, blipOnCommit: true,
      });
    }
    const alarms = groupCard(body, 'Alarms');
    onOffRow(alarms, 'Critical-damage heartbeat pulse', 'alarmHeartbeat', emitVolumes);

    const note = el('div', 'cot-set-note', body);
    note.textContent =
      'Effects, engines and music are synthesized in real time; the crew radio lines are ' +
      'original voice takes generated offline (no third-party recordings). Everything mixes ' +
      'under the master fader; changes apply instantly and persist. Release a slider to hear ' +
      'a reference blip at the new level. The heartbeat pulse plays a short low throb when ' +
      'your tank drops below quarter health.';
  }

  // --- GRAPHICS tab -----------------------------------------------------------
  function renderGraphics() {
    body.textContent = '';
    const card = groupCard(body, 'Quality');
    const row = el('div', 'cot-set-row', card);
    settingLabel(row, 'Graphics quality', SETTINGS_OPTION_ICONS.graphicsQuality);
    const seg = el('div', 'cot-set-seg', row);
    const btns: HTMLButtonElement[] = [];
    const mobile = getDeviceTier() === 'mobile';
    const choices: readonly ('auto' | PresetName)[] = mobile
      ? MOBILE_PRESET_ORDER
      : ['auto', ...PRESET_ORDER];
    for (const name of choices) {
      const b = el('button', '', seg);
      b.type = 'button';
      b.textContent = name === 'auto' ? 'auto' : PRESETS[name].label.toLowerCase();
      b.dataset.name = name;
      b.addEventListener('click', () => {
        if (mobile) setMobilePresetName(name);
        else setPresetName(name); // live-applies post resize + shadow RT realloc
        for (const x of btns) x.classList.toggle('sel', x.dataset.name === name);
        emit('ui:click', {});
      });
      btns.push(b);
    }
    const selected = mobile ? getMobilePresetChoice() : getStoredChoice();
    for (const x of btns) x.classList.toggle('sel', x.dataset.name === selected);
    const note = el('div', 'cot-set-note', card);
    note.textContent = mobile
      ? 'Performance, Balanced and Quality stay inside the mobile texture budget. They resize raster, ' +
        'anti-aliasing and shadow buffers instantly without reloading the battlefield.'
      : 'Auto uses adaptive High quality with full-resolution final-frame SMAA: real geometry, foliage, ' +
        'and shader edges stay smooth. It raises 3D resolution when there is GPU headroom and scales only ' +
        'the 3D frame when needed; the reticle and HUD remain native-sharp. Medium/Low reduce GPU cost. ' +
        'Applies instantly.';
  }

  function renderTab() {
    cancelCapture();
    clearConflict();
    for (const t of root.querySelectorAll<HTMLButtonElement>('.cot-set-tab')) {
      t.classList.toggle('sel', t.dataset.tab === activeTab);
    }
    resetBtn.style.visibility =
      activeTab === 'controls' || activeTab === 'graphics' || activeTab === 'sound'
        ? 'visible' : 'hidden';
    if (activeTab === 'controls') renderControls();
    else if (activeTab === 'graphics') renderGraphics();
    else if (activeTab === 'sound') renderSound();
    else renderGameplay();
    applyZebra();
    updateScrollFades(); // fades follow the fresh content's real overflow
  }

  // --- rebind capture ------------------------------------------------------------
  function beginCapture(
    actionId: ActionId,
    slot: BindingSlotKey,
    chip: HTMLButtonElement,
  ): void {
    cancelCapture();
    clearConflict();
    capture = { actionId, slot, chip };
    chip.classList.add('listening');
    if (slot === 'pad') {
      chip.textContent = 'PRESS PAD…';
      // pad button edges are picked up by the panel's gamepad poll loop
    } else {
      chip.textContent = 'PRESS KEY…';
      window.addEventListener('mousedown', onCaptureMouse, true);
      window.addEventListener('wheel', onCaptureWheel, { capture: true, passive: false });
    }
  }

  function cancelCapture() {
    if (escHoldTimer) { clearTimeout(escHoldTimer); escHoldTimer = null; }
    if (!capture) return;
    capture.chip.classList.remove('listening');
    capture = null;
    window.removeEventListener('mousedown', onCaptureMouse, true);
    window.removeEventListener('wheel', onCaptureWheel, { capture: true });
    refreshChips();
  }

  function finishCapture(code: string): void {
    if (!capture || capture.slot === 'pad') return;
    const { actionId, slot } = capture;
    cancelCapture();
    if (code === input.getBinding(actionId, slot)) return; // no-op rebind
    const other = input.findConflict(code, actionId, slot);
    if (other && other.actionId === actionId) {
      // Same action, other column — just move the key across, no ceremony.
      input.setBinding(actionId, null, other.slot);
      input.setBinding(actionId, code, slot);
      bindingsMutated();
      return;
    }
    if (other) {
      showConflict({ actionId, slot, otherId: other.actionId, otherSlot: other.slot, code, pad: false });
      return;
    }
    input.setBinding(actionId, code, slot);
    bindingsMutated();
  }

  function finishPadCapture(index: number): void {
    if (!capture || capture.slot !== 'pad') return;
    const { actionId } = capture;
    cancelCapture();
    if (index === input.getPadBinding(actionId)) return;
    const other = input.findPadConflict(index, actionId);
    if (other) {
      showConflict({ actionId, slot: 'pad', otherId: other.actionId, otherSlot: 'pad', code: index, pad: true });
      return;
    }
    input.setPadBinding(actionId, index);
    bindingsMutated();
  }

  function onCaptureMouse(e: MouseEvent): void {
    if (!capture || capture.slot === 'pad') return;
    e.preventDefault();
    e.stopPropagation();
    finishCapture(`Mouse${e.button}`);
  }

  function onCaptureWheel(e: WheelEvent): void {
    if (!capture || capture.slot === 'pad' || e.deltaY === 0) return;
    e.preventDefault();
    e.stopPropagation();
    finishCapture(e.deltaY < 0 ? 'WheelUp' : 'WheelDown');
  }

  // --- conflict handling -----------------------------------------------------------
  function showConflict(c: ConflictState): void {
    conflict = c;
    const defA = input.actionDefs.find((d) => d.id === c.actionId);
    const defB = input.actionDefs.find((d) => d.id === c.otherId);
    const codeLabel = c.pad ? input.padLabelFor(c.code) : input.labelFor(c.code);
    const slotTag = c.pad ? '' : ` (${SLOT_NAME[c.otherSlot]})`;
    conflictMsg.innerHTML =
      `<b>${codeLabel}</b>&nbsp; is already bound to &nbsp;<b>${defB ? defB.label : c.otherId}</b>${slotTag}` +
      `&nbsp;&mdash; swap it with ${defA ? defA.label : c.actionId}?`;
    conflictBar.classList.add('show');
    for (const id of [c.actionId, c.otherId]) {
      const r = rowByAction.get(id);
      if (r) r.row.classList.add('conflict');
    }
  }

  function clearConflict() {
    if (!conflict) return;
    conflict = null;
    conflictBar.classList.remove('show');
    for (const { row } of rowByAction.values()) row.classList.remove('conflict');
  }

  requiredElement<HTMLButtonElement>(conflictBar, '.swap').addEventListener('click', () => {
    if (!conflict) return;
    if (conflict.pad) input.swapPadBindings(conflict.actionId, conflict.otherId, conflict.code);
    else input.swapBindings(conflict.actionId, conflict.slot, conflict.otherId, conflict.otherSlot, conflict.code);
    clearConflict();
    bindingsMutated();
  });
  requiredElement<HTMLButtonElement>(conflictBar, '.dismiss').addEventListener('click', () => {
    clearConflict();
    emit('ui:click', {});
  });

  // --- panel-wide key handling (capture phase; the input layer is disabled) -------
  function onPanelKey(e: KeyboardEvent): void {
    if (!open) return;
    if (capture) {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        if (capture.slot === 'pad') { cancelCapture(); return; }
        // Tap = cancel (on keyup), hold = bind Escape itself.
        if (!escHoldTimer && !e.repeat) {
          capture.chip.textContent = 'HOLD FOR ESC…';
          escHoldTimer = setTimeout(() => {
            escHoldTimer = null;
            if (capture) finishCapture('Escape');
          }, ESC_HOLD_MS);
        }
        return;
      }
      if (capture.slot === 'pad') return; // pad chip only listens to the controller
      if (!e.repeat) finishCapture(e.code);
      return;
    }
    // While the panel is open it owns the keyboard: nothing leaks to the HUD
    // shell hotkeys or the garage's Enter-to-battle handler behind it.
    e.stopPropagation();
    if (e.code === 'Escape') {
      e.preventDefault();
      if (conflict) clearConflict();
      else api.close();
    }
  }

  function onPanelKeyUp(e: KeyboardEvent): void {
    if (!open) return;
    if (capture && e.code === 'Escape' && escHoldTimer) {
      // released before the hold threshold: plain cancel
      clearTimeout(escHoldTimer);
      escHoldTimer = null;
      cancelCapture();
      e.preventDefault();
      e.stopPropagation();
    }
  }

  // --- gamepad poll while the panel is open ---------------------------------------
  // Handles pad-chip capture edges and lets controller players close the panel
  // with START. Runs on rAF only while open; the game's input layer is
  // disabled meanwhile, so nothing double-fires.
  function panelPadSnapshot() {
    panelPadPrev.fill(true); // "held" until proven released — no instant triggers
    const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const n = Math.min(p.buttons.length, MAX_PAD_BUTTONS);
      for (let i = 0; i < n; i++) {
        panelPadPrev[i] = p.buttons[i].pressed || p.buttons[i].value > 0.5;
      }
      break;
    }
  }

  function panelPadTick() {
    if (!open) { panelRaf = 0; return; }
    const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
    let pad = null;
    for (const p of pads) {
      if (p && p.connected) { pad = p; break; }
    }
    if (pad) {
      const n = Math.min(pad.buttons.length, MAX_PAD_BUTTONS);
      for (let i = 0; i < n; i++) {
        const pressed = pad.buttons[i].pressed || pad.buttons[i].value > 0.5;
        const was = panelPadPrev[i];
        panelPadPrev[i] = pressed;
        if (!pressed || was) continue;
        if (capture && capture.slot === 'pad') {
          finishPadCapture(i);
        } else if (i === PAD_START_BUTTON) {
          api.close();
          return; // closePanel stops the loop
        }
      }
    }
    panelRaf = requestAnimationFrame(panelPadTick);
  }

  // --- open/close -----------------------------------------------------------------
  /** PAUSE: sync the header tag + root class to "open panel froze a live
   *  battle". Cheap; re-run by updateGear's event/interval sweep so the tag
   *  follows leave-battle / result transitions while the panel is up. */
  function refreshPausedTag() {
    root.classList.toggle('paused', open && isGamePaused());
  }

  function openPanel() {
    if (open) return;
    open = true;
    hideResumeVeil(); // the panel supersedes the click-to-resume veil
    relockOnClose = isBattleActive(); // resume grabs the pointer again
    input.setEnabled(false); // menu owns the keyboard; also clears held keys
    input.releaseLock();
    refreshPausedTag(); // PAUSE: battle Esc reads as a pause, garage Esc not
    hideHints();
    // Reopen on the tab the player was last tuning (session-sticky): closing
    // the panel mid-iteration on sensitivity or volume no longer bounces the
    // player back to CONTROLS every time.
    renderTab();
    const canLeave = !!(canLeaveBattle() && onLeaveBattle);
    leaveBtn.style.display = canLeave ? 'block' : 'none';
    // settings_ui r2: the footer primary reads RESUME only where there is a
    // battle to resume — the garage gear context labels the same button CLOSE.
    resumeBtn.textContent = canLeave ? 'Resume' : 'Close';
    root.classList.add('open');
    updateScrollFades(); // measured after display flips — 0x0 while hidden
    window.addEventListener('keydown', onPanelKey, true);
    window.addEventListener('keyup', onPanelKeyUp, true);
    panelPadSnapshot();
    if (!panelRaf) panelRaf = requestAnimationFrame(panelPadTick);
    updateGear();
    emit('ui:click', {});
  }

  /**
   * Close the panel. Resuming into a live battle re-requests pointer lock
   * (relockOnClose); a denied request is retried by the next canvas click.
   * @param {{noRelock?: boolean}} [o] noRelock: battle entry/exit paths close
   *   the panel programmatically — they must never fire a gesture-less lock
   *   request (a denial there would feed the cursor-aim denial streak).
   */
  function closePanel(o: { noRelock?: boolean } = {}): void {
    if (!open) return;
    if (o && o.noRelock) relockOnClose = false;
    cancelCapture();
    clearConflict();
    open = false;
    root.classList.remove('open');
    root.classList.remove('paused'); // PAUSE: tag never outlives the panel
    window.removeEventListener('keydown', onPanelKey, true);
    window.removeEventListener('keyup', onPanelKeyUp, true);
    if (panelRaf) { cancelAnimationFrame(panelRaf); panelRaf = 0; }
    input.setEnabled(true);
    if (relockOnClose && isBattleActive()) input.requestLock();
    updateGear();
    emit('ui:click', {});
  }

  root.addEventListener('mousedown', (e) => e.stopPropagation()); // keep clicks off the game layer
  requiredElement<HTMLButtonElement>(root, '.cot-set-close').addEventListener('click', () => api.close());
  resumeBtn.addEventListener('click', () => api.close());
  leaveBtn.addEventListener('click', () => {
    if (!onLeaveBattle || !canLeaveBattle()) return;
    relockOnClose = false;
    closePanel();
    onLeaveBattle();
  });
  resetBtn.addEventListener('click', () => {
    cancelCapture();
    clearConflict();
    if (activeTab === 'graphics') {
      if (getDeviceTier() === 'mobile') setMobilePresetName('mobile');
      else setPresetName('auto');
      renderTab();
      return;
    }
    if (activeTab === 'sound') {
      input.setSetting('volMaster', 0.8);
      for (const key of [
        'volEngine',
        'volCombat',
        'volAmbience',
        'volUi',
        'volVoice',
      ] as const satisfies readonly NumericSettingKey[]) {
        input.setSetting(key, 1);
      }
      input.setSetting('alarmHeartbeat', true);
      emitVolumes();
      renderTab();
      emit('ui:click', {});
      return;
    }
    input.resetBindings();
    bindingsMutated();
  });
  for (const t of root.querySelectorAll<HTMLButtonElement>('.cot-set-tab')) {
    t.addEventListener('click', () => {
      const tab = t.dataset.tab;
      if (tab === 'controls' || tab === 'gameplay' || tab === 'sound' || tab === 'graphics') {
        activeTab = tab;
      }
      renderTab();
      emit('ui:click', {});
    });
  }

  // Esc (or the rebound menu key / pad START) opens the panel whenever the
  // layer is live. NOT while a kill-cam replay owns the screen: there Esc is
  // just another ANY-KEY skip (the replay handles it in capture phase), and
  // the done-grace absorbs the skip keypress itself — see KC_DONE_GRACE_MS.
  if (opts.registerMenuAction !== false) {
    input.onAction('settingsMenu', () => {
      if (!open && !replayOwnsScreen() && !isAnyModalOpen()) openPanel();
    });
  }

  // WoT behavior: pressing Esc under pointer lock is swallowed by the browser
  // as the unlock gesture — detect the unexpected unlock mid-battle and treat
  // it as "open the menu". Intentional releases flip phase/result first.
  // controls_gunnery r2: ONLY when the page still owns the keyboard — an
  // unlock caused by alt-tab / focus loss shows the click-to-resume veil
  // instead (WoT does not open the options menu after an alt-tab). The
  // focus check runs a tick later: on some platforms pointerlockchange
  // fires before the blur that caused it lands.
  // controls_gunnery r7 (MAJOR — settings menu over the death kill-cam):
  // the player-death branch in main.ts exits pointer lock with the battle
  // still live, and this heuristic read that as an Esc press — every
  // pointer-locked death ended in an options menu nobody opened, with
  // onPanelKey swallowing the replay's ANY-KEY skip. Bail while a replay
  // owns the screen (bus-tracked, set synchronously before the unlock event
  // can land) — and main.ts's isBattleActive callback now also reports false
  // once the local player is destroyed, so the no-replay death (straight to
  // the death cam) hands off with a free cursor too, exactly like WoT.
  const settingsOwnsPointerUnlock = () => shouldOpenSettingsFromPointerUnlock({
    pointerLocked: !!document.pointerLockElement,
    settingsOpen: open,
    battleActive: isBattleActive(),
    replayActive: replayOwnsScreen(),
    activeElement: document.activeElement,
  });
  document.addEventListener('pointerlockchange', () => {
    // Enter opens room chat by focusing its field and intentionally releasing
    // pointer lock. A focused editor owns that unlock; only an otherwise
    // unclaimed in-battle unlock (the browser's swallowed Esc gesture) opens
    // Settings.
    if (!settingsOwnsPointerUnlock()) return;
    setTimeout(() => {
      if (!settingsOwnsPointerUnlock()) return;
      if (document.hasFocus() && !document.hidden) openPanel();
      else showResumeVeil();
    }, 0);
  });
  // Focus regained with the pointer still unlocked (alt-tab round trip that
  // never fired another pointerlockchange): offer the resume veil.
  window.addEventListener('focus', () => {
    if (!open && isBattleActive() && !input.isLocked() && !replayOwnsScreen() &&
        shouldOpenSettingsFromPointerUnlock({
          battleActive: true,
          activeElement: document.activeElement,
        })) showResumeVeil();
  });

  // --- gear button (garage) --------------------------------------------------------
  // Event-driven (phase changes + battle start + panel open/close) with a slow
  // interval as a safety net for un-evented flows.
  function updateGear() {
    gear.style.display = !open && gearVisible() ? 'flex' : 'none';
    // Safety net (r2): the resume veil must never outlive the battle — a
    // result can land without a phase:change (end overlay is z 70, veil 79).
    if (!isBattleActive()) hideResumeVeil();
    refreshPausedTag(); // PAUSE: tag follows phase/result while the panel is up
  }
  gear.addEventListener('click', () => { if (!open) openPanel(); });
  if (bus) {
    bus.on('phase:change', (ev) => {
      updateGear();
      // leaving battle (garage / result) always clears the resume veil
      const phase = typeof ev === 'object' && ev !== null && 'phase' in ev
        ? Reflect.get(ev, 'phase')
        : undefined;
      if (phase !== 'battle') hideResumeVeil();
      // belt for the kill-cam flag: killcam.cancel() only emits killcam:done
      // while a replay is live, so a phase flip is the reset of last resort
      kcReplay = false;
    });
    bus.on('ui:battleStart', updateGear);
    // KILL-CAM ownership window (controls_gunnery r7 MAJOR — see kcReplay).
    // begin() emits synchronously in the same task as the death branch's
    // exitPointerLock, ahead of any pointerlockchange this panel could react
    // to. While live: no auto-open, no resume veil, no Esc-menu — and a panel
    // the player left open must not sit over the replay swallowing its
    // ANY-KEY skip (onPanelKey is a capture-phase stopPropagation handler).
    bus.on('killcam:begin', () => {
      kcReplay = true;
      hideResumeVeil();
      // never relock out of this close — the cursor must stay free for the
      // replay (and a gesture-less requestLock denial would falsely latch
      // the cursor-aim fallback)
      if (open) { relockOnClose = false; closePanel(); }
    });
    bus.on('killcam:done', () => {
      kcReplay = false;
      kcDoneMs = nowMs();
    });
  }
  setInterval(updateGear, 150); // fallback only — events above hide/show instantly
  updateGear();

  // --- controls hint strip -----------------------------------------------------------
  function hintGroup(label: string, actionIds: readonly ActionId[]): string {
    const kbds = actionIds
      .map((id) => `<kbd>${bindLabel(id)}</kbd>`)
      .join('');
    return `<span class="hg">${kbds}<span>${label}</span></span>`;
  }

  function hideHints() {
    if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
    if (hintFadeTimer) { clearTimeout(hintFadeTimer); hintFadeTimer = null; }
    hints.style.display = 'none';
  }

  function showHints() {
    hideHints();
    hints.innerHTML = battleControlHintGroups(input.getSettings().rmbMode)
      .map(([label, actionIds]) => hintGroup(label, actionIds))
      .join('');
    hints.style.display = 'flex';
    hints.style.opacity = '1';
    hintTimer = setTimeout(() => {
      hints.style.opacity = '0';
      hintFadeTimer = setTimeout(() => { hints.style.display = 'none'; }, 1300);
    }, 8000);
  }

  const api = {
    root,
    gear,
    open: openPanel,
    close: closePanel,
    toggle() { if (open) closePanel(); else openPanel(); },
    /** @returns {boolean} panel currently open (battle pauses while true) */
    isOpen: () => open,
    /** Show the controls hint strip (current bindings); fades after 8 s. */
    showHints,
  };

  // Let the HUD sync its hotkey labels to the persisted bindings at boot, and
  // the audio graph its channel levels (the graph also reads cot.settings.v1
  // directly at build time — this covers a graph that already exists).
  emitBindings();
  emitVolumes();
  emitPerfMeter(); // HUD net readout follows the persisted preference (default on)

  return api;
}
