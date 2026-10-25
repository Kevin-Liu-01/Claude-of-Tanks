import type { RuntimeValue } from '../runtimeTypes.ts';
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
// sliders, the crew voices (national crews / one nation's pack) and the
// concussion toggle (persisted with the gameplay settings; broadcast live over
// the bus as 'ui:volumes' for src/audio/audioEngine.ts). All state persists via the input
// layer's localStorage stores. Also owns the pause veil, the fading controls-hint strip
// a player's first battles show at the rollout, and the garage gear button, and broadcasts
// 'ui:bindingsChanged' so the HUD's shell/consumable hotkey labels stay honest.
// KILL-CAM aware: while a replay owns the screen ('killcam:begin'/'done' on
// the bus) the panel never auto-opens, never veils, and closes itself — the
// replay's ANY-KEY skip always wins (player death hands off to the death cam
// with a free cursor, like WoT).
// Design language mirrors src/ui/hud.ts / garage.ts (palette, chamfers, type).
// settings_ui r2 (owner: "make our settings screen look much better too"):
// premium reskin in the garage r9 kit — blurred pause veil + panel enter
// transition (reduced-motion aware), amber-underline segmented tabs, amber
// tick-and-rule section headers, zebra'd rows, keycap binding chips with
// bound/unbound/listening/conflict states, custom amber-fill sliders, ON/OFF
// segmented toggles, plate group-cards, flat-orange chamfered RESUME (r7
// BATTLE plate) + red-outline LEAVE BATTLE, overflow-gated scroll fades.
// Behavior is UNCHANGED: same classes, same rebind/persistence/pause flow.

import { installHudCustomization } from './hudCustomization.ts';
import { installBattleUiVisibility } from './battleUiVisibility.ts';
import { ensureFonts } from './fonts.ts';
import { uiIconSVG } from './uiIcons.ts';
import { readBrainSettings, writeBrainSettings } from '../game/teamArrangement.ts';
import { battleTimeChoicesMarkup, bindBattleTimeChoices } from './battleTimeChoices.ts';
import {
  SETTINGS_ACTION_ICONS,
  SETTINGS_OPTION_ICONS,
  type SettingsIconSpec,
} from './settingsIcons.ts';
import { containModalTab, isAnyModalOpen } from './modal.ts';
import { shouldOpenSettingsFromPointerUnlock } from './keyboardOwnership.ts';
import { createElement as el } from './dom.ts';
import { ensureStyle } from './styleLayers.ts';
import { CREW_VOICE_NATIONS, isCrewVoiceSetting } from '../audio/crewVoice.ts';
import type { CustomSelectController } from './customSelect.ts';
import {
  getLocale,
  getSupportedLocales,
  setLocale,
  t,
} from './i18n.ts';
import { currentLocationHrefForLocale } from './localeRouting.ts';
import type {
  ActionId,
  AiDifficulty,
  BindingSlot,
  InputLayer,
  RmbMode,
} from '../game/input.ts';
import {
  getDeviceTier, getMobilePresetChoice, getStoredChoice,
  MOBILE_PRESET_ORDER, PRESET_ORDER,
  resolvePresetName, setMobilePresetName, setPresetName,
  type PresetName,
} from '../engine/quality.ts';
// entry telemetry (2026-09-24): the anonymous crash/load beacon is a player choice
import { setTelemetryOptOut, telemetryOptOutStored } from '../entry/telemetry.ts';
import {
  COLOR_PRESETS, DEFAULT_ACCESSIBILITY, HOLD_ACTIONS, RANGES, accessibilityPreferences, saveAccessibility, setCustomTeamColours,
  type AccessibilityChange, type ColorPreset, type HoldAction, type MotionMode,
} from './accessibilitySettings.ts';
import { tokenValue } from './tokens/tokens.ts';

/** A desktop preset's preview (public/media/settings-r1: one Verdant frame per preset, a 640x360 cut at 1:1 pixels). */
const QUALITY_PREVIEWS: ReadonlySet<PresetName> = new Set<PresetName>(['low', 'medium', 'high', 'ultra']);
const qualityPreview = (name: PresetName): string | null =>
  (QUALITY_PREVIEWS.has(name) ? `/media/settings-r1/quality-${name}-640.webp` : null);

const PRESET_LABEL_KEYS: Readonly<Record<PresetName, string>> = Object.freeze({
  ultra: 'settings.preset.ultra',
  high: 'settings.preset.high',
  medium: 'settings.preset.medium',
  low: 'settings.preset.low',
  ultralow: 'settings.preset.ultraLow', // 2026-10-13: below Low (quality.ts)
  'mobile-ultralow': 'settings.preset.mobileUltraLow',
  'mobile-low': 'settings.preset.mobileLow',
  mobile: 'settings.preset.mobile',
  'mobile-high': 'settings.preset.mobileHigh',
});

type SettingsTab = 'controls' | 'gameplay' | 'sound' | 'graphics' | 'accessibility' | 'language';
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
  | 'hideBattleUi'
  | 'isometricView'
  | 'showDebugHud'
  | 'showDirectionalHitValues'
  | 'armorAimOverlay'
  | 'alarmHeartbeat'
  | 'audioConcussion';
type ActionDefinition = InputLayer['actionDefs'][number];
type TimerHandle = ReturnType<typeof setTimeout>;

interface SettingsEventPayload {
  readonly phase?: string;
  readonly [key: string]: RuntimeValue;
}

interface SettingsBus {
  emit(event: string, payload: RuntimeValue): RuntimeValue;
  on(event: string, handler: (payload: RuntimeValue) => void): RuntimeValue;
}

export interface SettingsOptions {
  readonly input: InputLayer;
  readonly bus?: SettingsBus;
  readonly isBattleActive?: () => boolean;
  readonly isSpectating?: () => boolean;
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
/* The settings panel on the Premiere tokens (brand-ui 247, the consistency pass): one plate over a dimmed scene, the
   kit's tabs, segmented controls, key caps and buttons, read from the same tokens as src/ui/components/components.css,
   so the colour, contrast and motion presets reach it with no code. Sizes are max(px, token): the type tokens follow the
   game's UI scale and the zh floor, and the px keeps the 11 px floor on a small window. Every class the probes and
   main.ts touch keeps its name and open/close semantics. */
.cot-settings{position:fixed;inset:0;z-index:80;display:none;align-items:center;justify-content:center;
  background:oklch(from var(--scrim) l c h / .7);font-family:var(--font-ui);color:var(--ink-1);
  -webkit-user-select:none;user-select:none;}
.cot-settings.open{display:flex;animation:cotSetVeil var(--dur-base) var(--ease-enter);}
/* the panel's reset spares the kit's buttons, whose layer the surfaces layer would otherwise override */
.cot-settings :where(:not(.cot-c-btn)){box-sizing:border-box;margin:0;padding:0;}
.cot-set-panel{position:relative;width:744px;max-width:96vw;height:min(880px,88vh);max-height:88vh;
  display:flex;flex-direction:column;background:var(--surface-plate);border-radius:var(--plate-radius);box-shadow:var(--e4);}
.cot-settings.open .cot-set-panel{animation:cotSetIn var(--dur-screen) var(--ease-enter) backwards;}
@keyframes cotSetVeil{from{opacity:0;}}
@keyframes cotSetIn{from{opacity:0;transform:translateY(14px);}}
.cot-set-hdr{display:flex;align-items:center;gap:var(--s3);padding:var(--s4) var(--s5) var(--s2);}
.cot-set-hdr h2{margin-right:auto;font:600 max(20px,var(--fs-20))/1.15 var(--font-display);letter-spacing:var(--track-title);
  color:var(--ink-1);}
/* PAUSE: the battle-pause tag in the header, shown only while the open panel freezes a live battle (root gets .paused;
   the Garage's Esc never shows it): a chip with the accent's lamp */
.cot-set-paused{display:none;align-items:center;gap:var(--s2);padding:0 var(--s3);height:28px;
  font:600 max(var(--fs-floor-11),var(--fs-11))/1 var(--font-display);letter-spacing:var(--track-label);text-transform:uppercase;
  color:var(--ink-1);background:var(--accent-wash);box-shadow:var(--ring-accent);border-radius:var(--control-radius);}
.cot-set-paused::before{content:'';width:6px;height:6px;flex:0 0 auto;border-radius:50%;background:var(--accent);
  animation:cotPausedPulse calc(var(--dur-stage) * 2.4) var(--ease-move) infinite;}
.cot-settings.paused .cot-set-paused{display:inline-flex;}
@keyframes cotPausedPulse{0%,100%{opacity:1;}50%{opacity:.3;}}
/* the close glyph: the kit's ghost icon button (one close glyph, no frame) */
.cot-set-close svg{width:18px;height:18px;}
/* tabs: the kit's tabs (components.css .cot-c-tabs) on the panel's own state class */
.cot-set-tabs{display:flex;gap:var(--s5);padding:0 var(--s5);border-bottom:1px solid var(--line-1);}
.cot-set-tab{position:relative;display:inline-flex;align-items:center;min-height:44px;padding:0;border:0;background:none;
  cursor:pointer;color:var(--ink-3);font:600 max(15px,var(--fs-15))/1 var(--font-display);white-space:nowrap;
  transition:color var(--dur-fast) var(--ease-enter);}
.cot-set-tab:hover{color:var(--ink-2);}
.cot-set-tab.sel{color:var(--ink-1);}
.cot-set-tab.sel::after{content:'';position:absolute;left:0;right:0;bottom:-1px;height:2px;background:var(--accent);}
/* scrolling rows: a thin scrollbar and overflow-gated fade masks (.fade-top/.fade-bot set from the scroll position) */
.cot-set-body{flex:1;overflow-y:auto;padding:var(--s1) var(--s5) var(--s4);min-height:280px;
  scrollbar-width:thin;scrollbar-color:var(--line-3) transparent;}
.cot-set-body::-webkit-scrollbar{width:6px;}
.cot-set-body::-webkit-scrollbar-track{background:transparent;}
.cot-set-body::-webkit-scrollbar-thumb{background:var(--line-3);}
.cot-set-body.fade-bot{-webkit-mask-image:linear-gradient(180deg,#000 0,#000 calc(100% - 28px),transparent 100%);
  mask-image:linear-gradient(180deg,#000 0,#000 calc(100% - 28px),transparent 100%);}
.cot-set-body.fade-top{-webkit-mask-image:linear-gradient(180deg,transparent 0,#000 28px,#000 100%);
  mask-image:linear-gradient(180deg,transparent 0,#000 28px,#000 100%);}
.cot-set-body.fade-top.fade-bot{
  -webkit-mask-image:linear-gradient(180deg,transparent 0,#000 28px,#000 calc(100% - 28px),transparent 100%);
  mask-image:linear-gradient(180deg,transparent 0,#000 28px,#000 calc(100% - 28px),transparent 100%);}
/* a section's header: the plate header's label and rule (no tick) */
.cot-set-group{display:flex;align-items:center;gap:var(--s3);margin:var(--s4) 0 var(--s1);
  font:600 max(var(--fs-floor-12),var(--fs-12))/1 var(--font-display);letter-spacing:var(--track-label);text-transform:uppercase;color:var(--ink-3);}
.cot-set-group::after{content:'';flex:1;height:1px;background:var(--line-1);}
.cot-set-group:first-child{margin-top:var(--s3);}
/* a cluster's plate on the Gameplay, Sound and Graphics tabs */
.cot-set-card{margin:var(--s3) 0 0;padding:var(--s3);background:var(--surface-page);border-radius:var(--plate-radius);
  box-shadow:var(--e1);}
.cot-set-card .cot-set-group{margin:0 0 var(--s1);}
.cot-set-hud-editor{margin-left:auto;flex-shrink:0;}
.cot-set-row{display:flex;align-items:center;justify-content:space-between;gap:var(--s3);min-height:44px;
  padding:var(--s1) var(--s2);border-bottom:1px solid var(--line-1);transition:background-color var(--dur-fast) var(--ease-enter);}
.cot-set-row:last-child{border-bottom:0;}
.cot-set-row:hover{background:var(--fill-faint);}
.cot-set-row .lb{min-width:0;flex:1;display:flex;align-items:center;gap:var(--s2);
  font:500 max(13px,var(--fs-13))/1.3 var(--font-body);color:var(--ink-2);}
.cot-set-crew-field{width:260px;max-width:100%;min-width:0;}
/* a setting's glyph: one grey, the accent only on a shell slot's number */
.cot-setting-icon{position:relative;width:24px;height:24px;flex:0 0 24px;display:grid;place-items:center;color:var(--ink-3);}
.cot-setting-icon svg{display:block;width:16px;height:16px;overflow:visible;}
.cot-setting-icon[data-badge]::after{content:attr(data-badge);position:absolute;right:-4px;bottom:-4px;
  min-width:12px;height:12px;padding:0 2px;display:grid;place-items:center;border-radius:2px;
  font:600 max(var(--fs-floor-11),var(--fs-11))/1 var(--font-data);color:var(--ink-on-accent);background:var(--accent);}
.cot-setting-label-text{min-width:0;}
.cot-set-row.conflict{background:oklch(from var(--danger) l c h / .12);box-shadow:inset 2px 0 0 var(--danger);}
.cot-set-row.conflict .cot-chip{box-shadow:var(--ring-danger);}
.cot-set-row .chips{display:flex;gap:var(--s2);align-items:center;}
.cot-set-colhdr{display:flex;align-items:center;gap:var(--s2);padding:var(--s3) var(--s2) var(--s1);border-bottom:1px solid var(--line-1);}
.cot-set-colhdr span{width:92px;text-align:center;font:600 max(var(--fs-floor-11),var(--fs-11))/1 var(--font-display);
  letter-spacing:var(--track-label);text-transform:uppercase;color:var(--ink-4);}
.cot-set-colhdr span.act{width:auto;flex:1;text-align:left;}
.cot-set-colhdr span.pad{width:72px;}
/* binding chips: the kit's key cap (components.css .cot-c-kbd) at the binding's width. States: bound, unbound (dashed),
   listening (the accent, pulsing) and conflict (the danger ring, row-scoped above). */
.cot-chip{width:92px;height:30px;padding:0 var(--s1);border:0;border-radius:var(--control-radius);cursor:pointer;
  font:500 max(var(--fs-floor-12),var(--fs-12))/1 var(--font-data);color:var(--ink-1);text-align:center;background:var(--surface-raised);
  box-shadow:var(--ring-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  transition:background-color var(--dur-fast) var(--ease-enter),box-shadow var(--dur-fast) var(--ease-enter);}
.cot-chip.padcol{width:72px;}
.cot-chip:hover{background:var(--surface-hover);}
.cot-chip:active{transform:translateY(var(--btn-press-drop));}
.cot-chip.empty{color:var(--ink-4);background:transparent;box-shadow:inset 0 0 0 1px var(--line-1);}
.cot-chip.listening{color:var(--ink-1);background:var(--accent-wash);box-shadow:var(--ring-accent);
  animation:cotChipPulse calc(var(--dur-stage) * 1.6) var(--ease-move) infinite;}
.cot-chip:focus,.cot-set-tab:focus,.cot-set-btn:focus,.cot-set-close:focus,.cot-set-seg button:focus{outline:none;}
.cot-chip:focus-visible,.cot-set-tab:focus-visible,.cot-set-seg button:focus-visible{box-shadow:var(--focus-ring);}
.cot-set-slider input[type=range]:focus{outline:none;}
.cot-set-slider input[type=range]:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}
@keyframes cotChipPulse{50%{opacity:.7;}}
.cot-set-conflict{display:none;margin:var(--s3) var(--s5) 0;padding:var(--s2) var(--s3);align-items:center;gap:var(--s3);
  background:oklch(from var(--danger) l c h / .12);box-shadow:inset 3px 0 0 var(--danger);border-radius:var(--control-radius);
  font:500 max(13px,var(--fs-13))/1.4 var(--font-body);color:var(--ink-1);}
.cot-set-conflict.show{display:flex;}
.cot-set-conflict b{color:var(--text-danger);font-weight:600;}
.cot-set-conflict .msg{flex:1;}
/* the footer: Reset on the left, Leave battle and the one primary on the right (the kit's buttons) */
.cot-set-ftr{display:flex;align-items:center;gap:var(--s3);padding:var(--s3) var(--s5) var(--s4);border-top:1px solid var(--line-1);}
/* reset anchors left and pushes the action pair right (the primary stays flush right with Leave battle hidden) */
.cot-set-btn.reset{margin-right:auto;}
/* sliders: a line track with the accent's fill (--f set from JS) and a square knob */
.cot-set-slider{display:flex;align-items:center;gap:var(--s3);}
.cot-set-slider input[type=range]{-webkit-appearance:none;appearance:none;--f:50%;width:190px;height:20px;cursor:pointer;
  background:transparent;}
.cot-set-slider input[type=range]::-webkit-slider-runnable-track{height:4px;border-radius:2px;
  background:linear-gradient(90deg,var(--accent) var(--f),var(--line-2) var(--f));}
.cot-set-slider input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;margin-top:-5px;
  border-radius:var(--control-radius);background:var(--ink-1);box-shadow:var(--e1);
  transition:transform var(--dur-fast) var(--ease-enter);}
.cot-set-slider input[type=range]:hover::-webkit-slider-thumb{transform:scale(1.15);}
.cot-set-slider input[type=range]::-moz-range-track{height:4px;background:var(--line-2);}
.cot-set-slider input[type=range]::-moz-range-progress{height:4px;background:var(--accent);}
.cot-set-slider input[type=range]::-moz-range-thumb{width:14px;height:14px;border:0;border-radius:var(--control-radius);
  background:var(--ink-1);}
.cot-set-slider input[type=number]{width:62px;height:30px;padding:0 var(--s2);text-align:right;
  font:500 max(13px,var(--fs-13))/1 var(--font-data);color:var(--ink-1);background:var(--surface-page);border:0;
  border-radius:var(--control-radius);box-shadow:var(--ring-2);-moz-appearance:textfield;appearance:textfield;}
.cot-set-slider input[type=number]:focus{outline:none;box-shadow:var(--ring-accent);}
.cot-set-slider input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;}
.cot-set-slider .unit{width:16px;font:500 max(var(--fs-floor-12),var(--fs-12))/1 var(--font-data);color:var(--ink-3);}
/* segmented pickers (difficulty, right click, quality, language) and On/Off: the kit's segmented control
   (components.css .cot-c-seg) on the panel's own state class */
.cot-set-seg{display:inline-flex;gap:0;padding:3px;border-radius:var(--control-radius);background:var(--fill-quiet);
  box-shadow:var(--ring-1);}
.cot-set-seg button{display:inline-flex;align-items:center;justify-content:center;min-width:32px;height:32px;padding:0 13px;
  border:0;border-radius:var(--control-radius);background:transparent;cursor:pointer;white-space:nowrap;
  color:var(--ink-3);font:500 max(13px,var(--fs-13))/1 var(--font-body);
  transition:color var(--dur-fast) var(--ease-enter),background-color var(--dur-fast) var(--ease-enter);}
.cot-set-seg button:hover{color:var(--ink-1);}
.cot-set-seg button.sel{background:var(--surface-hover);color:var(--ink-1);box-shadow:var(--seg-on-shadow);}
.cot-set-seg button:disabled{color:var(--ink-4);cursor:not-allowed;}
.cot-set-seg.onoff button{min-width:48px;}
/* the graphics quality preview (media/settings-r1): the chosen preset's frame at 1:1 pixels, or the one pointed at */
.cot-set-preview{margin:10px 10px 4px;max-width:640px;aspect-ratio:16/9;overflow:hidden;border-radius:var(--control-radius);background:var(--surface-scene);box-shadow:var(--ring-2)}
.cot-set-preview[hidden]{display:none}
.cot-set-preview img{display:block;width:100%;height:100%;object-fit:cover}
.cot-set-note{margin:var(--s3) var(--s2) var(--s1);max-width:72ch;font:400 max(13px,var(--fs-13))/1.55 var(--font-body);color:var(--ink-3);text-wrap:pretty;}
.cot-set-note b{color:var(--ink-2);font-weight:600;}
.cot-set-note.folded{display:none;}
.cot-settings [data-time-hint]{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;}
.cot-set-card.notes-open .cot-set-note.folded{display:block;}
.cot-set-info{order:2;display:inline-grid;place-items:center;width:28px;height:28px;flex:none;margin:-6px -4px -6px 0;padding:0;
  border:0;border-radius:var(--control-radius);background:transparent;color:var(--ink-3);cursor:pointer;}
.cot-set-info[aria-expanded='true']{color:var(--accent);}
@media (hover:hover){.cot-set-info:hover{color:var(--ink-1);background:var(--fill-quiet);}}
.cot-set-info:focus-visible{outline:2px solid var(--focus-bracket-color);outline-offset:1px;}
/* settings_ui r2: the panel respects reduced motion — enter transition,
   paused lamp and listening pulse all freeze; hover transitions collapse */
@media (prefers-reduced-motion:reduce){
  .cot-settings.open,.cot-settings.open .cot-set-panel{animation:none;}
  .cot-set-paused::before{animation:none;}
  .cot-chip.listening{animation:none;}
  .cot-settings *{transition-duration:0s !important;}
}
/* Standalone fallback placement. The garage mounts this settings-owned button
   into its top navigation rail; these coordinates only apply before that
   mount or in a surface that creates settings without the garage. */
.cot-gear{position:fixed;top:60px;right:26px;z-index:62;width:42px;height:42px;display:none;
  align-items:center;justify-content:center;cursor:pointer;border:0;border-radius:var(--control-radius);
  background:var(--surface-plate);box-shadow:var(--ring-2);color:var(--ink-3);pointer-events:auto;
  transition:color var(--dur-fast) var(--ease-enter),box-shadow var(--dur-fast) var(--ease-enter);}
.cot-gear:hover{color:var(--ink-1);box-shadow:var(--ring-3);}
/* The strip's seat (owner 2026-10-25: "fix the wasd bar ... above stuff"): the band over the vehicle-controls row, which
   battleHudLayout.ts writes as --hud-systems-top (the tray's top less the row), on the centre line; under the sight's
   notices, which the planner keeps over the reticle. A fixed box at left:50% shrinks to half the viewport, so
   max-content keeps one row until the edge clamps it. */
.cot-hints{position:fixed;left:var(--hud-hints-x,50%);top:var(--hud-hints-bottom,calc(var(--hud-systems-top,calc(100vh - 132px)) - var(--s2)));
  transform:translate(-50%,-100%);z-index:45;width:max-content;max-width:var(--hud-hints-width,calc(100vw - 32px));
  display:none;flex-wrap:wrap;justify-content:center;align-items:center;gap:var(--s2) var(--s5);padding:var(--s2) var(--s4);
  pointer-events:none;background:var(--hud-plate);box-shadow:var(--e1);
  font:600 var(--battle-fs-12)/1 var(--font-display);letter-spacing:var(--track-label-s);color:var(--ink-2);
  text-transform:uppercase;white-space:nowrap;transition:opacity var(--dur-base) var(--ease-exit);}
.cot-hints.show{display:flex;}
.cot-hints.fade{opacity:0;}
.cot-hints .hg{display:flex;align-items:center;gap:var(--s2);transition:opacity var(--dur-base) var(--ease-exit);}
.cot-hints .hg.done{opacity:0;}
.cot-hints .hk{display:flex;gap:2px;}
/* (its caps are the battle's key caps, the vehicle-controls row's: battleHudLayout.css .sk) */
.cot-hints .hk .cot-c-kbd{min-width:20px;height:20px;padding:0 var(--s1);box-sizing:border-box;border:0;border-radius:var(--control-radius);background:none;box-shadow:var(--ring-3);font:500 var(--battle-fs-fig-11)/1 var(--font-data);letter-spacing:0;color:var(--ink-2);}
/* never over the scope, a flight (a drone, the gunship flies on other keys: the class is hud.ts's), Watch or a
   spectated battle (owner 2026-10-25) */
body.cot-hud-aerial .cot-hints,html[data-cot-scoped] .cot-hints,html[data-watch] .cot-hints,body.cot-spectating .cot-hints{display:none;}
/* The pause veil (247): one plate over a dimmed battle. The whole veil resumes (a click inside the gesture relocks);
   Settings, the Esc menu, is its one other way out. */
.cot-resume{position:fixed;inset:0;z-index:79;display:none;place-items:center;cursor:pointer;
  background:oklch(from var(--scrim) l c h / .5);color:var(--ink-1);-webkit-user-select:none;user-select:none;}
.cot-resume.show{display:grid;animation:cot-rz-in var(--dur-base) var(--ease-enter);}
@keyframes cot-rz-in{from{opacity:0}}
.cot-resume .rz-plate{display:grid;justify-items:center;gap:var(--s5);padding:var(--s6) var(--s7);
  background:var(--hud-plate);box-shadow:var(--e2);}
.cot-resume .rz-title{margin:0;font:600 var(--fs-28)/1 var(--font-display);letter-spacing:var(--track-title);
  text-transform:uppercase;}
.cot-resume .rz-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:var(--s3);}
/* (the two ways out at one width, and Settings' cap the battle's key cap at the 11 px floor, as the controls strip's:
   the kit's cap scaled to 8 px at 1280 and down, gauntlet r2) */
.cot-resume .rz-actions>.cot-c-btn{min-width:184px;justify-content:center;}
.cot-resume .rz-set .cot-c-kbd{min-width:22px;height:22px;padding:0 var(--s1);box-sizing:border-box;border:0;border-radius:var(--control-radius);background:none;box-shadow:var(--ring-3);font:500 var(--battle-fs-fig-11)/1 var(--font-data);letter-spacing:0;color:var(--ink-2);}

/* ACCESSIBILITY tab (brand-ui BUI-F9; BUI-S4 redesigns it): the live preview draws the team shapes in the team tokens
   and a text and HUD sample in the type tokens, so every choice shows before the player leaves the panel. */
.cot-a11y-preview{display:flex;align-items:center;gap:18px;margin:4px 10px 8px;padding:10px 14px;
  background:var(--surface-page);border:1px solid var(--line-control);color:var(--ink-1);}
.cot-a11y-preview .shape{font-size:var(--fs-24);line-height:1;}
.cot-a11y-preview .own{color:var(--team-own)}.cot-a11y-preview .enemy{color:var(--team-enemy)}
.cot-a11y-preview .squad{color:var(--team-squad);border-radius:50%;outline:var(--team-squad-ring) solid var(--ink-1);}
.cot-a11y-preview .sample{margin-left:auto;font-size:var(--fs-16);font-weight:600;}
.cot-a11y-preview .hudnum{font-size:var(--hud-fs-numeral);font-weight:700;padding:2px 8px;background:var(--hud-plate);
  border:1px solid var(--line-3);}
.cot-set-seg.wrap{flex-wrap:wrap;justify-content:flex-end;}
.cot-set-seg .sw{display:inline-flex;gap:2px;margin-right:6px;}
.cot-set-seg .sw i{font-style:normal;color:var(--o)}.cot-set-seg .sw i+i{color:var(--e)}
.cot-a11y-custom{display:flex;align-items:center;gap:10px;}
.cot-a11y-custom input[type=color]{width:44px;height:32px;padding:0;border:1px solid var(--line-control);background:none;cursor:pointer;}
.cot-a11y-custom input[type=color]:focus-visible{outline:2px solid var(--focus-bracket-color);outline-offset:2px;}
.cot-a11y-custom input[aria-invalid=true]{border-color:var(--danger);}
.cot-set-note.refused{color:var(--text-danger);}

/* Touch settings use a true finger-sized target floor in every orientation. */
body.cot-touch-layout .cot-settings button{min-height:44px;}
body.cot-touch-layout .cot-set-close{width:44px;height:44px;}
`;

const GEAR_SVG = uiIconSVG('settings', 22);

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

/** The first-battle controls strip (247): driving, the gun, the right button's role, the sight and the menu. The shell
 *  and consumable keys stay off it, since the HUD tray's tiles carry their own caps. */
export function battleControlHintGroups(rmbMode: RmbMode = 'hold'): Array<[string, ActionId[]]> {
  return [
    [t('settings.group.move'), ['forward', 'left', 'back', 'right']],
    [t('settings.group.fire'), ['fire']],
    [rmbMode === 'freelook' ? t('settings.group.gunHold') : t('settings.group.aim'), ['freeCamera']],
    [t('settings.group.sniper'), ['sniperToggle']],
    // (ESC opens the settings: the pause veil's cap names the same word, gauntlet r1)
    [t('settings.title'), ['settingsMenu']],
  ];
}

/** The strip's groups by id, in battleControlHintGroups' order (each one leaves the strip once its control is used). */
const HINT_GROUP_IDS = ['move', 'fire', 'aim', 'sniper', 'menu'] as const;
type HintGroupId = typeof HINT_GROUP_IDS[number];
/** A keyboard player's first HINT_BATTLES battles show the controls strip as the tanks roll out, while a group's control
 *  is still unused (owner 2026-10-25: "only make it come up when its needed"). The browser keeps the count and what was
 *  learned (v1 kept the count alone, read as the count here). */
const HINTS_KEY = 'cot.battle.hints.v2';
const HINTS_KEY_V1 = 'cot.battle.hints.v1';
const HINT_BATTLES = 3;
/** The strip's longest stay when its controls are not all used (it leaves sooner at the first engagement). */
const HINT_STAY_MS = 30000;

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
  // the game document's shared behaviours (the kit's hover tip, the mark's roll) install with the panel every screen has,
  // once the boot is idle: they act only on a hover, so they stay off the game's entry
  const behaviours = (): void => void import('./components/pageBehaviours.ts').then(({ installPageBehaviours }) => installPageBehaviours());
  if (typeof requestIdleCallback === 'function') requestIdleCallback(behaviours, { timeout: 4000 });
  else setTimeout(behaviours, 1000);
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

  ensureStyle('cot-settings-style', SETTINGS_CSS, 'surfaces');

  // --- DOM ---------------------------------------------------------------------
  const root = el('div', 'cot-settings');
  root.innerHTML =
    `<div class="cot-set-panel" role="dialog" aria-modal="true" aria-label="${t('settings.title')}">` +
    `<div class="cot-set-hdr"><h2>${t('settings.title')}</h2>` +
    `<span class="cot-set-paused">${t('settings.paused')}</span>` +
    `<button class="cot-set-close cot-c-btn cot-c-btn--36 cot-c-btn--icon cot-c-btn--ghost" type="button" aria-label="${t('settings.close.title')}">${uiIconSVG('close', 18)}</button></div>` +
    `<div class="cot-set-tabs">` +
    // every tab is its name alone (the 10-24 sweep: the controls tab's action count was one more number to read)
    `<button class="cot-set-tab sel" data-tab="controls" type="button">${t('settings.tab.controls')}</button>` +
    `<button class="cot-set-tab" data-tab="gameplay" type="button">${t('settings.tab.gameplay')}</button>` +
    `<button class="cot-set-tab" data-tab="sound" type="button">${t('settings.tab.sound')}</button>` +
    `<button class="cot-set-tab" data-tab="graphics" type="button">${t('settings.tab.graphics')}</button>` +
    `<button class="cot-set-tab" data-tab="accessibility" type="button">${t('settings.tab.accessibility')}</button>` +
    `<button class="cot-set-tab" data-tab="language" type="button">${t('settings.tab.language')}</button>` +
    `</div>` +
    `<div class="cot-set-conflict"><span class="msg"></span>` +
    `<button class="cot-set-btn swap cot-c-btn cot-c-btn--36 cot-c-btn--primary" type="button">${t('settings.conflict.swap')}</button>` +
    `<button class="cot-set-btn ghost dismiss cot-c-btn cot-c-btn--36 cot-c-btn--ghost" type="button">${t('settings.conflict.cancel')}</button></div>` +
    `<div class="cot-set-body"></div>` +
    `<div class="cot-set-ftr">` +
    `<button class="cot-set-btn ghost reset cot-c-btn cot-c-btn--ghost" type="button">${t('settings.reset')}</button>` +
    `<button class="cot-set-btn ghost leave cot-c-btn cot-c-btn--danger" type="button">${t('settings.leave')}</button>` +
    `<button class="cot-set-btn resume cot-c-btn cot-c-btn--primary" type="button">${t('settings.resume')}</button></div>` +
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
  // (click-perf-244) a press that shows or rebuilds the panel measures its overflow at the next frame, after the
  // panel's own layout, so the press never forces that layout itself
  let fadesRaf = 0;
  const scheduleScrollFades = (): void => {
    if (fadesRaf) return;
    fadesRaf = requestAnimationFrame(() => { fadesRaf = 0; updateScrollFades(); });
  };
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
  gear.setAttribute('aria-label', t('settings.gearAria'));
  gear.innerHTML = GEAR_SVG;
  if (!gear.parentNode) document.body.appendChild(gear);

  installHudCustomization();
  const battleUiVisibility = installBattleUiVisibility({
    hidden: () => input.getSettings().hideBattleUi,
    setHidden: (hidden) => input.setSetting('hideBattleUi', hidden),
    shortcutsBlocked: () => open || isAnyModalOpen(),
  });
  battleUiVisibility.setBattle(isBattleActive());

  const hints = el('div', 'cot-hints');
  document.body.appendChild(hints);

  // Click-to-resume veil (controls_gunnery r2): pointer-lock loss from ALT-TAB
  // / focus loss must NOT throw the options menu at the player (WoT returns
  // you to the battle). The veil relocks inside its own click gesture.
  const resume = el('div', 'cot-resume');
  resume.setAttribute('role', 'dialog');
  resume.setAttribute('aria-labelledby', 'cot-rz-title');
  resume.innerHTML =
    `<div class="rz-plate"><h2 class="rz-title" id="cot-rz-title">${t('settings.pauseTitle')}</h2>` +
    '<div class="rz-actions">' +
    `<button type="button" class="cot-c-btn cot-c-btn--56 cot-c-btn--primary rz-go">${t('settings.pauseResume')}</button>` +
    `<button type="button" class="cot-c-btn cot-c-btn--56 rz-set">${t('settings.title')}<kbd class="cot-c-kbd"></kbd></button>` +
    '</div></div>';
  const resumeSettings = requiredElement<HTMLButtonElement>(resume, '.rz-set');
  const resumeSettingsKey = requiredElement<HTMLElement>(resume, '.rz-set kbd');
  document.body.appendChild(resume);
  let relockRetry: TimerHandle | null = null; // see relockRefused

  /** `relock`: the browser refused a pointer relock (aim-focus 243); `pause`: the battle lost the page (a focus loss, a
   *  background tab, an app switch) and waits for the player. Touch never locks, so it never shows the first; it does show
   *  the second, with the touch line (Watch 243: a touch layout taps). */
  function showResumeVeil(trigger: 'relock' | 'pause' = 'pause') {
    if (open || resume.classList.contains('show')) return;
    // KILL-CAM: the replay owns the screen — a veil on top would sit over the
    // cinematic and its mousedown would eat the click players aim at the
    // 'ANY KEY — SKIP' prompt.
    if (kcReplay) return;
    // CURSOR-AIM FALLBACK: the veil exists to re-grab pointer lock inside a
    // fresh click gesture after focus loss. With the lock unavailable the aim
    // never depended on it — showing the veil would only swallow the next
    // battle click (input.isCursorAim() means every lock attempt is denied).
    // A touch layout never holds the lock either.
    if (input.isCursorAim && input.isCursorAim()) return;
    if (trigger === 'relock' && input.isTouchLayout && input.isTouchLayout()) return;
    // Settings carries the menu's current key (the cap hides on a touch layout: Watch 243, a touch layout taps)
    resumeSettingsKey.textContent = bindLabel('settingsMenu');
    hideHints();
    resume.classList.add('show');
    emit('ui:click', {});
  }

  function hideResumeVeil() {
    resume.classList.remove('show');
    if (relockRetry !== null) clearTimeout(relockRetry);
    relockRetry = null;
  }

  // aim-focus 243: a relock the browser refused leaves this veil up instead of
  // a dead mouse (the refusal never latches cursor aim: input.ts). Chrome
  // refuses every relock for 1250 ms after the player's Esc; a RESUME click in
  // that window still carries user activation (5 s), so ask once more as the
  // window closes. Outside it (an Esc-closed panel asks with no activation)
  // the veil waits for a click.
  function relockRefused(retryInMs: number): void {
    if (open || !isBattleActive()) return;
    showResumeVeil('relock');
    if (retryInMs <= 0 || relockRetry !== null || !resume.classList.contains('show')) return;
    if (typeof navigator !== 'undefined' && navigator.userActivation && !navigator.userActivation.isActive) return;
    relockRetry = setTimeout(() => {
      relockRetry = null;
      if (open || !isBattleActive() || !resume.classList.contains('show')) return;
      input.requestLock({ fromUi: true });
    }, retryInMs);
  }

  function resumeBattle() {
    hideResumeVeil();
    if (isBattleActive()) input.requestLock({ onRefused: relockRefused }); // inside the click gesture
    emit('ui:click', {});
  }
  resume.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    if (e.target instanceof Element && e.target.closest('.rz-set')) return; // Settings opens on its click
    resumeBattle();
  });
  // a keyboard press on Resume (a pointer press resumed on mousedown, so the veil is gone by its click)
  requiredElement<HTMLButtonElement>(resume, '.rz-go').addEventListener('click', () => {
    if (resume.classList.contains('show')) resumeBattle();
  });
  resumeSettings.addEventListener('click', () => {
    emit('ui:click', {});
    openPanel();
  });

  // --- state ---------------------------------------------------------------------
  let open = false;
  // Replays own skip input; their done grace absorbs the finishing keypress.
  // A spectator keeps mouse capture until Esc explicitly releases it.
  let kcReplay = false;
  let kcDoneMs = -Infinity; // when the last replay released the screen
  const nowMs = () =>
    (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const replayOwnsScreen = () => kcReplay || nowMs() - kcDoneMs < KC_DONE_GRACE_MS;
  let activeTab: SettingsTab = 'controls';
  let crewSelectController: CustomSelectController | null = null;
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

  const SLOT_NAME: Readonly<Record<BindingSlot, string>> = {
    0: t('settings.bind.primary'),
    1: t('settings.bind.secondary'),
  };
  const bindLabel = (id: ActionId): string =>
    input.labelFor(input.getBinding(id, 0) || input.getBinding(id, 1));

  /** Broadcast current shell/consumable/map hotkey labels so the HUD tray and the map plate never
   *  show a stale (or hardcoded) key. */
  function emitBindings() {
    emit('ui:bindingsChanged', {
      shells: (['shell1', 'shell2', 'shell3'] as const).map(bindLabel),
      consumables: (['consumable1', 'consumable2', 'consumable3'] as const).map(bindLabel),
      specialAction: bindLabel('specialAction'),
      minimapZoom: bindLabel('minimapZoom'),
      settingsMenu: bindLabel('settingsMenu'),
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
    if (slotKey === 'pad') {
      const label = input.padLabelFor(input.getPadBinding(actionId));
      return label === '—' ? t('settings.bind.empty') : label;
    }
    const label = input.labelFor(input.getBinding(actionId, slotKey));
    return label === '—' ? t('settings.bind.empty') : label;
  }

  function makeChip(
    def: ActionDefinition,
    slotKey: BindingSlotKey,
    parent: HTMLElement,
  ): HTMLButtonElement {
    const chip = el('button', `cot-chip${slotKey === 'pad' ? ' padcol' : ''}`, parent);
    chip.type = 'button';
    const labelText = t(def.label);
    chip.dataset.tip = slotKey === 'pad'
      ? `${labelText}, ${t('settings.bind.pad')}. ${t('settings.bind.rightClickClear')}`
      : `${labelText}, ${SLOT_NAME[slotKey]} ${t('settings.bind.key')}. ${t('settings.bind.rightClickClear')}`;
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
      '<span class="act">' + t('settings.bind.colAction') + '</span><span>' + t('settings.bind.primary') + '</span><span>' + t('settings.bind.secondary') + '</span><span class="pad">' + t('settings.bind.pad') + '</span>';
    let lastGroup = null;
    for (const def of input.actionDefs) {
      if (def.group !== lastGroup) {
        el('div', 'cot-set-group', body).textContent = t(def.group);
        lastGroup = def.group;
      }
      const row = el('div', 'cot-set-row', body);
      row.dataset.action = def.id;
      settingLabel(row, t(def.label), SETTINGS_ACTION_ICONS[def.id]);
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
      t('settings.controls.note.part1') +
      '<br>' +
      t('settings.controls.note.part2');
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
    const num = el('input', 'num', wrap);
    num.type = 'number';
    num.setAttribute('aria-label', t('settings.valueAria', { label }));
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
    for (const [val, txt] of [[false, t('settings.off')], [true, t('settings.on')]] as const) {
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
    const aim = groupCard(body, touchLayout ? t('settings.aim.touch') : t('settings.aim.mouse'));
    sliderRow(aim, touchLayout ? t('settings.touch.swipeSensitivity') : t('settings.mouse.sensitivity'), 'sensitivity', 0.2, 3);
    sliderRow(aim, t('settings.mouse.sniperScale'), 'sniperSensScale', 0.2, 3);
    sliderRow(aim, t('settings.mouse.aimSmoothing'), 'aimSmoothing', 0, 1, {
      step: '0.01', dispStep: '1', unit: '%', digits: 0,
      toDisp: (v) => v * 100, fromDisp: (v) => v / 100,
    });
    onOffRow(aim, t('settings.mouse.invertY'), 'invertY');
    onOffRow(aim, t('settings.camera.isometric'), 'isometricView');
    const isometricNote = el('div', 'cot-set-note', aim);
    isometricNote.textContent = t('settings.camera.isometricNote');

    // gunnery r1 (owner): what right-click does — hold-to-aim (default),
    // toggle-aim, or the classic gun-lock free look. Persisted as
    // settings.rmbMode; main.ts routes the RMB-bound action per frame.
    const RMB_MODE_DEFS: ReadonlyArray<readonly [RmbMode, string]> = [
      ['hold', t('settings.rmb.hold')],
      ['toggle', t('settings.rmb.toggle')],
      ['freelook', t('settings.rmb.freelook')],
    ];
    if (!touchLayout) {
      const rmbRow = el('div', 'cot-set-row', aim);
      settingLabel(rmbRow, t('settings.rmb.label'), SETTINGS_OPTION_ICONS.rmbMode);
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
      rmbNote.textContent = t('settings.aim.note');
    }

    const battle = groupCard(body, t('settings.battle.title'));
    const diffRow = el('div', 'cot-set-row', battle);
    settingLabel(diffRow, t('settings.gameplay.difficultyNext'), SETTINGS_OPTION_ICONS.aiDifficulty);
    const seg = el('div', 'cot-set-seg', diffRow);
    const diffBtns: HTMLButtonElement[] = [];
    for (const tier of ['easy', 'normal', 'hard'] as const satisfies readonly AiDifficulty[]) {
      const b = el('button', '', seg);
      b.type = 'button';
      b.textContent = t(`settings.difficulty.${tier}`);
      b.addEventListener('click', () => {
        input.setSetting('aiDifficulty', tier);
        for (const x of diffBtns) x.classList.toggle('sel', x.dataset.tier === tier);
        emit('ui:difficulty', { difficulty: tier });
        emit('ui:click', {});
      });
      b.dataset.tier = tier;
      diffBtns.push(b);
    }
    for (const x of diffBtns) x.classList.toggle('sel', x.dataset.tier === input.getSettings().aiDifficulty);
    const diffNote = el('div', 'cot-set-note', battle);
    diffNote.textContent = t('settings.difficulty.note');

    const brainRow = el('div', 'cot-set-row', battle);
    const brainLabel = t('settings.gameplay.brainNext');
    settingLabel(brainRow, brainLabel, SETTINGS_OPTION_ICONS.aiDifficulty);
    const brainSeg = el('div', 'cot-set-seg', brainRow);
    brainSeg.setAttribute('role', 'group');
    brainSeg.setAttribute('aria-label', brainLabel);
    const brainButtons: HTMLButtonElement[] = [];
    const alliesRow = el('div', 'cot-set-row', battle);
    settingLabel(alliesRow, t('playMenu.brain.allies'), SETTINGS_OPTION_ICONS.aiDifficulty);
    const alliesSeg = el('div', 'cot-set-seg onoff', alliesRow);
    const alliesButtons: HTMLButtonElement[] = [];
    const brainNote = el('div', 'cot-set-note', battle);
    const syncBrain = () => {
      const current = readBrainSettings();
      for (const b of brainButtons) {
        const selected = b.dataset.brainOpponent === current.opponent;
        b.classList.toggle('sel', selected);
        b.setAttribute('aria-pressed', String(selected));
      }
      for (const b of alliesButtons) {
        const selected = (b.dataset.brainAllies === 'true') === current.allies;
        b.disabled = current.opponent !== 'jev';
        b.classList.toggle('sel', selected);
        b.setAttribute('aria-pressed', String(selected));
      }
      brainNote.textContent = t('playMenu.brain.sub')
        + (current.opponent === 'jev' ? ' ' + t('playMenu.brain.note') : '');
    };
    for (const opponent of ['classic', 'jev'] as const) {
      const b = el('button', '', brainSeg);
      b.type = 'button';
      b.dataset.brainOpponent = opponent;
      b.textContent = t(`playMenu.brain.${opponent}`);
      b.addEventListener('click', () => {
        writeBrainSettings({ opponent });
        syncBrain();
        emit('ui:click', {});
      });
      brainButtons.push(b);
    }
    for (const on of [false, true]) {
      const b = el('button', '', alliesSeg);
      b.type = 'button';
      b.dataset.brainAllies = String(on);
      b.textContent = t(on ? 'settings.on' : 'settings.off');
      b.setAttribute('aria-label', `${t('playMenu.brain.allies')}: ${b.textContent}`);
      b.addEventListener('click', () => {
        writeBrainSettings({ allies: on });
        syncBrain();
        emit('ui:click', {});
      });
      alliesButtons.push(b);
    }
    syncBrain();

    const times = el('fieldset', 'cot-battle-times', battle);
    times.innerHTML = battleTimeChoicesMarkup('cot-settings-time-hint', 'settings.battle.timeHint');
    bindBattleTimeChoices(times, () => emit('ui:click', {}));

    const iface = groupCard(body, t('settings.interface.title'));
    const hudLayoutRow = el('div', 'cot-set-row', iface);
    settingLabel(hudLayoutRow, t('hudEditor.title'), { id: 'performance', tone: 'cyan' });
    const editHud = el('button', 'cot-set-hud-editor cot-c-btn cot-c-btn--36', hudLayoutRow);
    editHud.type = 'button'; editHud.textContent = t('hudEditor.open');
    editHud.addEventListener('click', async () => {
      editHud.disabled = true;
      try {
        const [{ openHudEditor }] = await Promise.all([import('./hudEditor.ts'), import('./hudEditor.css')]);
        if (open) openHudEditor(editHud);
      } catch {
        editHud.textContent = t('hudEditor.loadError');
      } finally { editHud.disabled = false; }
    });
    onOffRow(iface, t('settings.interface.hideBattleUi'), 'hideBattleUi', battleUiVisibility.refresh);
    const cleanViewNote = el('div', 'cot-set-note', iface);
    cleanViewNote.textContent = t('settings.interface.hideBattleUiNote');
    onOffRow(
      iface,
      t('settings.interface.armorOverlay'),
      'armorAimOverlay',
    );
    onOffRow(iface, t('settings.gameplay.showPerfMeter'), 'showPerfMeter',
      emitPerfMeter);
    onOffRow(
      iface,
      t('settings.interface.hitValues'),
      'showDirectionalHitValues',
      emitDirectionalHitValues,
    );
    onOffRow(iface, t('settings.interface.debugHud'), 'showDebugHud',
      emitDebugHud);
    const armorNote = el('div', 'cot-set-note', iface);
    armorNote.textContent = t('settings.interface.armorNote');
    const hitValueNote = el('div', 'cot-set-note', iface);
    hitValueNote.textContent = t('settings.interface.hitValueNote');
    const debugNote = el('div', 'cot-set-note', iface);
    debugNote.textContent = t('settings.interface.debugNote');

    const pad = groupCard(body, t('settings.pad.title'));
    sliderRow(pad, t('settings.gameplay.aimPad'), 'padSensitivity', 0.2, 3);
    const padNote = el('div', 'cot-set-note keep', pad);
    padNote.textContent = input.isPadConnected()
      ? t('settings.pad.detected')
      : t('settings.pad.absent');

    const note = el('div', 'cot-set-note', body);
    note.textContent = touchLayout
      ? t('settings.aim.sniper.touch')
      : t('settings.aim.sniper.mouse');
  }

  // --- SOUND tab ---------------------------------------------------------------
  const VOLUME_DEFS = [
    ['volMaster', t('settings.sound.master')],
    ['volEngine', t('settings.sound.engine')],
    ['volCombat', t('settings.sound.combat')],
    ['volAmbience', t('settings.sound.ambience')],
    ['volUi', t('settings.sound.ui')],
    ['volVoice', t('settings.sound.voice')],
  ] as const satisfies ReadonlyArray<readonly [NumericSettingKey, string]>;

  /** Broadcast the persisted FPS/ping preference (default on, user opt-out). */
  function emitPerfMeter() {
    emit('ui:perfMeter', { on: !!input.getSettings().showPerfMeter });
  }

  /** Lazy engineering telemetry follows one persisted Interface setting. */
  function emitDebugHud() {
    emit('ui:debugHud', { on: !!input.getSettings().showDebugHud });
  }

  /** Optional blocked-shot values update the live HUD immediately. */
  function emitDirectionalHitValues() {
    emit('ui:directionalHitValues', {
      on: !!input.getSettings().showDirectionalHitValues,
    });
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
      crewVoice: s.crewVoice,
      concussion: !!s.audioConcussion,
    });
  }

  function renderSound() {
    body.textContent = '';
    const vol = groupCard(body, t('settings.sound.title'));
    for (const [key, label] of VOLUME_DEFS) {
      sliderRow(vol, label, key, 0, 1, {
        step: '0.01', dispStep: '1', unit: '%', digits: 0,
        toDisp: (v) => v * 100, fromDisp: (v) => v / 100,
        onChange: emitVolumes, blipOnCommit: true,
      });
    }
    // One flag dropdown: national crews, or a fixed pack for every vehicle.
    const crew = groupCard(body, t('settings.crew.title'));
    const crewRow = el('div', 'cot-set-row cot-set-crew-row', crew);
    settingLabel(crewRow, t('settings.crew.voice'), SETTINGS_OPTION_ICONS.crewVoice);
    const crewField = el('div', 'cot-set-crew-field', crewRow);
    const crewSelect = el('select', '', crewField);
    crewSelect.dataset.setting = 'crewVoice';
    crewSelect.setAttribute('aria-label', t('settings.crew.voice'));
    crewSelect.add(new Option(t('settings.crew.national'), 'national'));
    for (const [value, nation] of Object.entries(CREW_VOICE_NATIONS)) {
      crewSelect.add(new Option(t(`nation.${nation}`), value));
    }
    crewSelect.value = input.getSettings().crewVoice;
    crewSelect.addEventListener('change', () => {
      if (!isCrewVoiceSetting(crewSelect.value)) return;
      input.setSetting('crewVoice', crewSelect.value);
      emitVolumes();
      emit('ui:click', {});
    });
    // Let the shared dropdown handle keys first, then contain Tab and prevent
    // game shortcuts. The panel's capture listener yields this field below.
    crewField.addEventListener('keydown', event => {
      event.stopPropagation();
      containModalTab(event, root, requiredElement<HTMLButtonElement>(root, '.cot-set-close'));
    });
    // Flag assets are browser-only; retain the settings policy's Node import.
    void import('./nationSelect.ts').then(({ createNationSelect }) => {
      if (!crewSelect.isConnected) return;
      crewSelectController = createNationSelect(crewSelect, t('settings.crew.voice'), value =>
        isCrewVoiceSetting(value) && value !== 'national' ? CREW_VOICE_NATIONS[value] : undefined);
    });
    const crewNote = el('div', 'cot-set-note', crew);
    crewNote.textContent = t('settings.crew.note');
    const alarms = groupCard(body, t('settings.alarms.title'));
    onOffRow(alarms, t('settings.alarms.heartbeat'), 'alarmHeartbeat', emitVolumes);
    onOffRow(alarms, t('settings.alarms.concussion'), 'audioConcussion', emitVolumes);

    const note = el('div', 'cot-set-note keep', body);
    note.textContent = t('settings.sound.note');
  }

  // --- GRAPHICS tab -----------------------------------------------------------
  // A graphics preset waits for the panel to close (owner, 2026-10-24: "changing graphics should only apply once we
  // press resume"): the picker stages it and closing the panel applies it, by Resume back into the battle or by the
  // Garage's close. Applying resizes the frame and reallocates the shadow targets, so it never runs under the menu.
  let stagedPreset: string | null = null;
  function commitGraphics(): void {
    const name = stagedPreset;
    stagedPreset = null;
    if (name === null) return;
    if (getDeviceTier() === 'mobile') { if (name !== getMobilePresetChoice()) setMobilePresetName(name); }
    else if (name !== getStoredChoice()) setPresetName(name);
  }

  function renderGraphics() {
    body.textContent = '';
    const card = groupCard(body, t('settings.graphics.title'));
    const row = el('div', 'cot-set-row', card);
    settingLabel(row, t('settings.graphics.label'), SETTINGS_OPTION_ICONS.graphicsQuality);
    const seg = el('div', 'cot-set-seg', row);
    const btns: HTMLButtonElement[] = [];
    const mobile = getDeviceTier() === 'mobile';
    const choices: readonly ('auto' | PresetName)[] = mobile
      ? MOBILE_PRESET_ORDER
      : ['auto', ...PRESET_ORDER];
    for (const name of choices) {
      const b = el('button', '', seg);
      b.type = 'button';
      b.textContent = name === 'auto'
        ? t('settings.preset.auto')
        : t(PRESET_LABEL_KEYS[name] || 'settings.preset.ultra').toLowerCase();
      b.dataset.name = name;
      b.addEventListener('click', () => {
        stagedPreset = name; // applied when the panel closes (commitGraphics)
        for (const x of btns) x.classList.toggle('sel', x.dataset.name === name);
        chosen = name;
        showPreview(name);
        emit('ui:click', {});
      });
      // the preview shows the preset a pointer or the focus is on, then returns to the chosen one
      b.addEventListener('pointerenter', () => showPreview(name));
      b.addEventListener('focus', () => showPreview(name));
      btns.push(b);
    }
    const selected = stagedPreset ?? (mobile ? getMobilePresetChoice() : getStoredChoice());
    let chosen: string = selected;
    for (const x of btns) x.classList.toggle('sel', x.dataset.name === selected);
    seg.addEventListener('pointerleave', () => showPreview(chosen));
    seg.addEventListener('focusout', (event) => { if (!seg.contains(event.relatedTarget as Node | null)) showPreview(chosen); });
    // the desktop presets' preview (phones keep the picker alone): Auto shows the preset it resolves to
    const preview = mobile ? null : el('figure', 'cot-set-preview', card);
    const previewImage = preview ? el('img', '', preview) : null;
    if (previewImage) {
      previewImage.width = 640;
      previewImage.height = 360;
      previewImage.alt = '';
      previewImage.decoding = 'async';
    }
    function showPreview(choice: string): void {
      if (!preview || !previewImage) return;
      const src = qualityPreview(choice === 'auto' ? resolvePresetName('auto') : choice as PresetName);
      preview.hidden = !src;
      if (src && previewImage.getAttribute('src') !== src) previewImage.src = src;
    }
    showPreview(selected);

    // entry telemetry (2026-09-24): the anonymous load/crash beacon
    // (docs/ENTRY-RESILIENCE.md) is a player choice stored beside the presets.
    const diagnostics = groupCard(body, t('settings.diagnostics.title'));
    const diagRow = el('div', 'cot-set-row', diagnostics);
    settingLabel(diagRow, t('settings.diagnostics.telemetry'), SETTINGS_OPTION_ICONS.showDebugHud);
    const diagSeg = el('div', 'cot-set-seg onoff', diagRow);
    const diagBtns: HTMLButtonElement[] = [];
    const diagStorage = (): Storage | null => { try { return window.localStorage; } catch (_) { return null; } };
    const syncDiag = () => {
      const on = !telemetryOptOutStored(diagStorage());
      diagBtns[0].classList.toggle('sel', !on);
      diagBtns[1].classList.toggle('sel', on);
      diagBtns[0].setAttribute('aria-pressed', String(!on));
      diagBtns[1].setAttribute('aria-pressed', String(on));
    };
    for (const [val, txt] of [[false, t('settings.off')], [true, t('settings.on')]] as const) {
      const b = el('button', '', diagSeg);
      b.type = 'button';
      b.textContent = txt;
      b.setAttribute('aria-label', `${t('settings.diagnostics.telemetry')}: ${txt}`);
      b.addEventListener('click', () => {
        if (!telemetryOptOutStored(diagStorage()) === val) return;
        setTelemetryOptOut(!val, diagStorage());
        syncDiag();
        emit('ui:click', {});
      });
      diagBtns.push(b);
    }
    syncDiag();
    el('div', 'cot-set-note keep', diagnostics).textContent = t('settings.diagnostics.note');
  }

  // --- ACCESSIBILITY tab (brand-ui SPEC 12.1.6 and 14; the core is accessibilityPreferences.ts, BUI-S4 redesigns this)
  const A11Y_ICONS = {
    textScale: { id: 'zoomIn', tone: 'cyan' },
    hudScale: { id: 'autoAim', tone: 'amber' },
    colors: { id: 'team', tone: 'green' },
    highContrast: { id: 'graphics', tone: 'violet' },
    motion: { id: 'speed', tone: 'cyan' },
    shake: { id: 'damage', tone: 'amber' },
    flash: { id: 'lightbulb', tone: 'amber' },
    droneStatic: { id: 'modeDrone', tone: 'cyan' },
    rosters: { id: 'team', tone: 'cyan' },
  } as const satisfies Readonly<Record<string, SettingsIconSpec>>;

  /** One segmented choice bound to a preference (aria-pressed on each option). */
  function a11ySeg<T extends string>(
    parent: HTMLElement, label: string, icon: SettingsIconSpec,
    options: ReadonlyArray<readonly [T, string]>, current: () => T, choose: (value: T) => void, wrap = false,
  ): HTMLButtonElement[] {
    const row = el('div', 'cot-set-row', parent);
    settingLabel(row, label, icon);
    const seg = el('div', `cot-set-seg${wrap ? ' wrap' : ''}${options.length === 2 ? ' onoff' : ''}`, row);
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', label);
    const buttons = options.map(([value, text]) => {
      const b = el('button', '', seg);
      b.type = 'button';
      b.dataset.value = value;
      b.textContent = text;
      b.addEventListener('click', () => {
        if (current() === value) return;
        choose(value);
        sync();
        emit('ui:click', {});
      });
      return b;
    });
    const sync = (): void => {
      for (const b of buttons) {
        const on = b.dataset.value === current();
        b.classList.toggle('sel', on);
        b.setAttribute('aria-pressed', String(on));
      }
    };
    sync();
    return buttons;
  }

  /** A percentage slider bound to a numeric preference (the range and its number field, as the other tabs). */
  function a11ySlider(
    parent: HTMLElement, label: string, icon: SettingsIconSpec,
    key: 'textScale' | 'hudScale' | 'shake' | 'flash', [min, max]: readonly [number, number],
  ): void {
    const row = el('div', 'cot-set-row', parent);
    settingLabel(row, label, icon);
    const wrap = el('div', 'cot-set-slider', row);
    const range = el('input', '', wrap);
    range.type = 'range';
    range.setAttribute('aria-label', label);
    range.min = String(min);
    range.max = String(max);
    range.step = '0.05';
    const num = el('input', '', wrap);
    num.type = 'number';
    num.setAttribute('aria-label', label);
    num.min = String(Math.round(min * 100));
    num.max = String(Math.round(max * 100));
    num.step = '5';
    el('span', 'unit', wrap).textContent = '%';
    const sync = (): void => {
      const v = accessibilityPreferences()[key];
      range.value = String(v);
      range.style.setProperty('--f', `${(((v - min) / (max - min)) * 100).toFixed(1)}%`);
      num.value = String(Math.round(v * 100));
    };
    const set = (value: number): void => {
      if (Number.isFinite(value)) saveAccessibility({ [key]: Math.round(value * 100) / 100 } as AccessibilityChange);
      sync();
    };
    sync();
    range.addEventListener('input', () => set(parseFloat(range.value)));
    num.addEventListener('change', () => { set(parseFloat(num.value) / 100); emit('ui:click', {}); });
    range.addEventListener('change', () => emit('ui:click', {}));
  }

  function renderAccessibility(): void {
    body.textContent = '';
    const prefs = accessibilityPreferences;
    const vision = groupCard(body, t('settings.a11y.vision'));
    const preview = el('div', 'cot-a11y-preview', vision);
    preview.setAttribute('aria-hidden', 'true');
    preview.innerHTML = '<span class="shape own">&#9650;</span><span class="shape enemy">&#9670;</span>'
      + '<span class="shape squad">&#9679;</span><span class="sample">' + t('settings.a11y.sample') + '</span><span class="hudnum num">88</span>';
    a11ySlider(vision, t('settings.a11y.textScale'), A11Y_ICONS.textScale, 'textScale', RANGES.textScale);
    a11ySlider(vision, t('settings.a11y.hudScale'), A11Y_ICONS.hudScale, 'hudScale', RANGES.hudScale);
    // Each preset shows its own ally and enemy colours on the chevron and diamond, so the choice is seen, not read.
    const presetButtons = a11ySeg(vision, t('settings.a11y.colors'), A11Y_ICONS.colors,
      COLOR_PRESETS.map((preset) => [preset, t(`settings.a11y.preset.${preset}`)] as const),
      () => prefs().colorPreset, (preset: ColorPreset) => { saveAccessibility({ colorPreset: preset }); syncCustom(); }, true);
    const swatch = (button: HTMLButtonElement, own: string, enemy: string): void => {
      const sw = document.createElement('span');
      sw.className = 'sw';
      sw.setAttribute('aria-hidden', 'true');
      sw.style.setProperty('--o', own);
      sw.style.setProperty('--e', enemy);
      sw.innerHTML = '<i>&#9650;</i><i>&#9670;</i>';
      button.prepend(sw);
    };
    for (const button of presetButtons) {
      const preset = button.dataset.value as ColorPreset;
      if (preset === 'custom') swatch(button, prefs().customOwn, prefs().customEnemy);
      else {
        const cvd = preset === 'default' ? {} : { cvd: preset };
        swatch(button, tokenValue('team-own', cvd), tokenValue('team-enemy', cvd));
      }
    }
    // Custom: own and enemy pickers; a pair under the colour-vision or contrast floors is refused (colorVision.ts).
    const customRow = el('div', 'cot-set-row', vision);
    settingLabel(customRow, t('settings.a11y.preset.custom'), A11Y_ICONS.colors);
    const custom = el('div', 'cot-a11y-custom', customRow);
    const ownPick = el('input', '', custom);
    ownPick.type = 'color';
    ownPick.setAttribute('aria-label', t('hud.team.ally'));
    const enemyPick = el('input', '', custom);
    enemyPick.type = 'color';
    enemyPick.setAttribute('aria-label', t('hud.team.enemies'));
    const refused = el('div', 'cot-set-note refused', vision);
    refused.setAttribute('role', 'status');
    const syncCustom = (): void => {
      ownPick.value = prefs().customOwn;
      enemyPick.value = prefs().customEnemy;
      customRow.hidden = prefs().colorPreset !== 'custom';
      refused.hidden = true;
      for (const pick of [ownPick, enemyPick]) pick.removeAttribute('aria-invalid');
    };
    const tryCustom = (): void => {
      const check = setCustomTeamColours(ownPick.value, enemyPick.value);
      if (check.ok) {
        syncCustom();
        const sw = presetButtons.find((b) => b.dataset.value === 'custom')?.querySelector<HTMLElement>('.sw');
        sw?.style.setProperty('--o', ownPick.value);
        sw?.style.setProperty('--e', enemyPick.value);
        return;
      }
      refused.hidden = false;
      refused.textContent = t('settings.a11y.refused');
      const blames = (side: string): boolean => check.failures.some((f) => f.check.split(/[~ ]/)[0] === side
        || f.check.endsWith(`~${side}`));
      ownPick.setAttribute('aria-invalid', String(blames('own')));
      enemyPick.setAttribute('aria-invalid', String(blames('enemy')));
    };
    ownPick.addEventListener('change', tryCustom);
    enemyPick.addEventListener('change', tryCustom);
    syncCustom();
    a11ySeg(vision, t('settings.a11y.highContrast'), A11Y_ICONS.highContrast,
      [['off', t('settings.off')], ['on', t('settings.on')]] as const,
      () => (prefs().highContrast ? 'on' : 'off'), (v) => { saveAccessibility({ highContrast: v === 'on' }); });

    const motion = groupCard(body, t('settings.a11y.motion'));
    a11ySeg<MotionMode>(motion, t('settings.a11y.reduceMotion'), A11Y_ICONS.motion,
      [['system', t('settings.a11y.system')], ['reduce', t('settings.on')], ['full', t('settings.off')]],
      () => prefs().motion, (mode) => { saveAccessibility({ motion: mode }); });
    a11ySlider(motion, t('settings.a11y.shake'), A11Y_ICONS.shake, 'shake', RANGES.shake);
    a11ySlider(motion, t('settings.a11y.flash'), A11Y_ICONS.flash, 'flash', RANGES.flash);
    a11ySeg(motion, t('settings.a11y.droneStatic'), A11Y_ICONS.droneStatic,
      [['off', t('settings.off')], ['on', t('settings.on')]] as const,
      () => (prefs().droneStatic ? 'on' : 'off'), (v) => { saveAccessibility({ droneStatic: v === 'on' }); });

    // Every hold action can latch on one press and release on the next (src/game/input.ts, the HUD's roster key).
    const holds = groupCard(body, t('settings.a11y.holds'));
    const holdLabel = (action: HoldAction): string => (action === 'rosters' ? t('settings.a11y.hold.rosters')
      : t(input.actionDefs.find((def) => def.id === action)?.label ?? 'settings.a11y.holds'));
    for (const action of HOLD_ACTIONS) {
      a11ySeg(holds, holdLabel(action), action === 'rosters' ? A11Y_ICONS.rosters : SETTINGS_ACTION_ICONS[action],
        [['hold', t('settings.a11y.hold')], ['toggle', t('settings.a11y.toggle')]] as const,
        () => (prefs().toggles.includes(action) ? 'toggle' : 'hold'),
        (mode) => {
          const others = prefs().toggles.filter((a) => a !== action);
          saveAccessibility({ toggles: mode === 'toggle' ? [...others, action] : others });
        });
    }
  }

  // --- LANGUAGE tab -----------------------------------------------------------
  function renderLanguage() {
    body.textContent = '';
    const langCard = groupCard(body, t('settings.language.title'));
    const langRow = el('div', 'cot-set-row', langCard);
    settingLabel(langRow, t('settings.language.label'), SETTINGS_OPTION_ICONS.graphicsQuality);
    const langSeg = el('div', 'cot-set-seg', langRow);
    const langBtns: HTMLButtonElement[] = [];
    const currentLocale = getLocale();
    for (const locale of getSupportedLocales()) {
      const b = el('button', '', langSeg);
      b.type = 'button';
      b.dataset.locale = locale;
      b.textContent = t('settings.language.' + (locale === 'zh-CN' ? 'zh' : 'en'));
      b.addEventListener('click', () => {
        if (locale === getLocale()) return;
        setLocale(locale);
        emit('ui:click', {});
        // Most screens are constructed once and own translated DOM. Reloading
        // is the only atomic way to avoid a mixed-language Garage or battle.
        window.location.assign(currentLocationHrefForLocale(window.location, locale));
      });
      langBtns.push(b);
    }
    for (const x of langBtns) x.classList.toggle('sel', x.dataset.locale === currentLocale);
    const langNote = el('div', 'cot-set-note', langCard);
    langNote.textContent = t('settings.language.note');
  }

  function renderTab() {
    crewSelectController?.close();
    crewSelectController = null;
    cancelCapture();
    clearConflict();
    for (const t of root.querySelectorAll<HTMLButtonElement>('.cot-set-tab')) {
      t.classList.toggle('sel', t.dataset.tab === activeTab);
    }
    resetBtn.style.visibility =
      activeTab === 'controls' || activeTab === 'graphics' || activeTab === 'sound' || activeTab === 'accessibility'
        ? 'visible' : 'hidden';
    if (activeTab === 'controls') renderControls();
    else if (activeTab === 'graphics') renderGraphics();
    else if (activeTab === 'accessibility') renderAccessibility();
    else if (activeTab === 'sound') renderSound();
    else if (activeTab === 'language') renderLanguage();
    else renderGameplay();
    applyZebra();
    foldNotes();
    scheduleScrollFades(); // fades follow the fresh content's real overflow
  }

  // (owner, the 10-24 UI sweep: no helper text in view) a card's explanations fold behind one info button in its
  // title, which shows and hides them; a live status, the sound credits and the privacy disclosure (.keep) and a refusal
  // stay in view. A note outside any card (the controls tab's) folds without a button: the chips' titles carry it.
  let noteSerial = 0;
  function foldNotes(): void {
    for (const note of body.querySelectorAll<HTMLElement>('.cot-set-note:not(.keep):not(.refused)')) {
      note.id ||= `cot-set-note-${++noteSerial}`;
      note.classList.add('folded');
      const card = note.closest<HTMLElement>('.cot-set-card');
      const group = card?.querySelector<HTMLElement>(':scope > .cot-set-group');
      if (!card || !group) continue;
      let info = group.querySelector<HTMLButtonElement>('.cot-set-info');
      if (!info) {
        const button = el('button', 'cot-set-info', group) as HTMLButtonElement;
        button.type = 'button';
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-label', t('settings.notes.toggle'));
        button.innerHTML = uiIconSVG('info', 16);
        button.addEventListener('click', () => {
          const open = !card.classList.contains('notes-open');
          card.classList.toggle('notes-open', open);
          button.setAttribute('aria-expanded', String(open));
          emit('ui:click', {});
          scheduleScrollFades();
        });
        info = button;
      }
      info.setAttribute('aria-controls', [info.getAttribute('aria-controls'), note.id].filter(Boolean).join(' '));
    }
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
      chip.textContent = t('settings.bind.pressPad');
      // pad button edges are picked up by the panel's gamepad poll loop
    } else {
      chip.textContent = t('settings.bind.press');
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
    // ctrl+wheel is a trackpad pinch, not a wheel notch: it never binds WheelUp/WheelDown (the pinch guard
    // still keeps it from zooming the page)
    if (!capture || capture.slot === 'pad' || e.deltaY === 0 || e.ctrlKey) return;
    e.preventDefault();
    e.stopPropagation();
    finishCapture(e.deltaY < 0 ? 'WheelUp' : 'WheelDown');
  }

  // --- conflict handling -----------------------------------------------------------
  function showConflict(c: ConflictState): void {
    conflict = c;
    const defA = input.actionDefs.find((d) => d.id === c.actionId);
    const defB = input.actionDefs.find((d) => d.id === c.otherId);
    const codeLabel = c.pad
      ? (() => { const l = input.padLabelFor(c.code); return l === '—' ? t('settings.bind.empty') : l; })()
      : (() => { const l = input.labelFor(c.code); return l === '—' ? t('settings.bind.empty') : l; })();
    const slotTag = c.pad ? '' : ` (${SLOT_NAME[c.otherSlot]})`;
    conflictMsg.innerHTML =
      t('settings.conflict.message', {
        codeLabel,
        otherLabel: defB ? t(defB.label) : c.otherId,
        slotTag,
        thisLabel: defA ? t(defA.label) : c.actionId,
      });
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
          capture.chip.textContent = t('settings.bind.holdForEsc');
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
    // The dropdown consumes arrows, typeahead and its first Escape. Its field
    // contains bubbling keys so they still cannot reach the game behind us.
    if (e.target instanceof Element && e.target.closest('.cot-set-crew-field') &&
        (e.code !== 'Escape' || root.querySelector('.cot-custom-select-list:popover-open'))) return;
    if (isAnyModalOpen()) return; // The HUD editor owns focus and Escape above Settings.
    // While the panel is open it owns the keyboard: nothing leaks to the HUD
    // shell hotkeys or the garage's Enter-to-battle handler behind it.
    e.stopPropagation();
    containModalTab(e, root, requiredElement<HTMLButtonElement>(root, '.cot-set-close'));
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
        if (!pressed || was || isAnyModalOpen()) continue;
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
    resumeBtn.textContent = canLeave ? t('settings.resume') : t('settings.close.title');
    root.classList.add('open');
    requiredElement<HTMLButtonElement>(root, '.cot-set-close').focus({ preventScroll: true });
    scheduleScrollFades(); // measured once the panel has laid out — 0x0 while hidden
    window.addEventListener('keydown', onPanelKey, true);
    window.addEventListener('keyup', onPanelKeyUp, true);
    panelPadSnapshot();
    if (!panelRaf) panelRaf = requestAnimationFrame(panelPadTick);
    updateGear();
    emit('ui:click', {});
  }

  /**
   * Close the panel. Resuming into a live battle re-requests pointer lock
   * (relockOnClose); a refused request leaves the click-to-resume veil
   * (relockRefused).
   * @param {{noRelock?: boolean}} [o] noRelock: battle entry/exit paths close
   *   the panel programmatically — they must never fire a gesture-less lock
   *   request (a denial there would feed the cursor-aim denial streak).
   */
  function closePanel(o: { noRelock?: boolean } = {}): void {
    if (!open) return;
    commitGraphics();
    crewSelectController?.close();
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
    if (relockOnClose && isBattleActive()) input.requestLock({ fromUi: true, onRefused: relockRefused });
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
      stagedPreset = getDeviceTier() === 'mobile' ? 'mobile' : 'auto';
      renderTab();
      return;
    }
    if (activeTab === 'accessibility') {
      const { customOwn: _own, customEnemy: _enemy, ...defaults } = DEFAULT_ACCESSIBILITY;
      saveAccessibility(defaults);
      renderTab();
      emit('ui:click', {});
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
      input.setSetting('audioConcussion', true);
      input.setSetting('crewVoice', 'national');
      emitVolumes();
      renderTab();
      emit('ui:click', {});
      return;
    }
    input.resetBindings();
    bindingsMutated();
  });
  const SETTINGS_TABS: readonly SettingsTab[] = ['controls', 'gameplay', 'sound', 'graphics', 'accessibility', 'language'];
  for (const t of root.querySelectorAll<HTMLButtonElement>('.cot-set-tab')) {
    t.addEventListener('click', () => {
      const tab = SETTINGS_TABS.find((id) => id === t.dataset.tab);
      // click-perf-244: Accessibility was missing here, so its tab never opened; pressing the open tab rebuilt it.
      if (!tab || tab === activeTab) return;
      activeTab = tab;
      renderTab();
      emit('ui:click', {});
    });
  }

  // Esc (or the rebound menu key / pad START) opens the panel whenever the
  // layer is live. NOT while a kill-cam replay owns the screen: there Esc is
  // just another ANY-KEY skip (the replay handles it in capture phase), and
  // the done-grace absorbs the skip keypress itself — see KC_DONE_GRACE_MS.
  if (opts.registerMenuAction !== false) {
    input.onAction('settingsMenu', (code) => {
      if (code === 'Escape' && opts.isSpectating?.()) { input.releaseLock(); return; }
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
  // Replays and destroyed-player spectator views do not turn cursor release
  // into a Settings request. Only a controllable player owns that shortcut.
  const settingsOwnsPointerUnlock = () => shouldOpenSettingsFromPointerUnlock({
    pointerLocked: !!document.pointerLockElement,
    settingsOpen: open,
    battleActive: isBattleActive(),
    replayActive: replayOwnsScreen(),
    activeElement: document.activeElement,
  });
  document.addEventListener('pointerlockchange', () => {
    if (input.isLocked()) { hideResumeVeil(); return; } // a relock (relockRefused's retry) resumes the battle
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
  const offerPauseVeil = () => {
    if (!open && isBattleActive() && !input.isLocked() && !replayOwnsScreen() &&
        shouldOpenSettingsFromPointerUnlock({
          battleActive: true,
          activeElement: document.activeElement,
        })) showResumeVeil('pause');
  };
  window.addEventListener('focus', offerPauseVeil);
  // A phone back from another app or a background tab (244): the page shows again, and a touch layout, which never
  // locks, gets the pause veil with the touch line; a tap resumes.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && input.isTouchLayout && input.isTouchLayout()) offerPauseVeil();
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
      battleUiVisibility.setBattle(phase === 'battle');
      if (phase !== 'battle') { hideResumeVeil(); hideHints(); }
      // belt for the kill-cam flag: killcam.cancel() only emits killcam:done
      // while a replay is live, so a phase flip is the reset of last resort
      kcReplay = false;
    });
    bus.on('ui:battleStart', () => { battleUiVisibility.setBattle(true); updateGear(); });
    bus.on('battle:ended', () => { battleUiVisibility.setBattle(false); hideHints(); });
    bus.on('battle:rollout', () => { if (!open && takeFirstBattleHint()) showHints(); });
    // the player's first hit given or taken this battle (hud.ts): the strip has done its work
    bus.on('ui:playerEngaged', () => fadeHints());
    // KILL-CAM ownership window (controls_gunnery r7 MAJOR — see kcReplay).
    // begin() emits synchronously in the same task as the death branch's
    // exitPointerLock, ahead of any pointerlockchange this panel could react
    // to. While live: no auto-open, no resume veil, no Esc-menu — and a panel
    // the player left open must not sit over the replay swallowing its
    // ANY-KEY skip (onPanelKey is a capture-phase stopPropagation handler).
    bus.on('killcam:begin', () => {
      kcReplay = true;
      hideResumeVeil();
      hideHints();
      // never relock out of this close — the cursor must stay free for the
      // replay (and a gesture-less requestLock denial would falsely latch
      // the cursor-aim fallback)
      if (open) { relockOnClose = false; closePanel(); }
    });
    bus.on('killcam:done', () => {
      kcReplay = false;
      kcDoneMs = nowMs();
    });
    // battle endings (2026-09-25): the director's camera beats own the screen the same way — their
    // any-key skip must win over the Esc menu and the resume veil
    bus.on('ending:begin', () => {
      kcReplay = true;
      hideResumeVeil();
      if (open) { relockOnClose = false; closePanel(); }
    });
    bus.on('ending:done', () => {
      kcReplay = false;
      kcDoneMs = nowMs();
    });
  }
  setInterval(updateGear, 150); // fallback only — events above hide/show instantly
  updateGear();

  // --- controls hint strip -----------------------------------------------------------
  function hintGroup(label: string, actionIds: readonly ActionId[], id: HintGroupId): string {
    const kbds = actionIds
      .map((action) => `<kbd class="cot-c-kbd">${bindLabel(action)}</kbd>`)
      .join('');
    return `<span class="hg" data-group="${id}"><span class="hk">${kbds}</span><span>${label}</span></span>`;
  }

  // First-battle hints (247; owner 2026-10-25): a keyboard and mouse player's first HINT_BATTLES battles show the strip at
  // the rollout, solo and network alike, while any group's control is still unused. Each group leaves as its control is
  // pressed (and stays learned), the strip once every group has, at the player's first engagement (hud.ts
  // ui:playerEngaged), a kill cam, the battle's end, or after HINT_STAY_MS. A touch layout and a connected pad show none
  // (the caps name keyboard keys); a storage the browser refuses keeps the record for this page. Its seat is the band
  // over the vehicle-controls row (battleHudLayout.ts --hud-systems-top), and the scope, a flight, Watch and a
  // spectated battle hide it (the sheet above).
  let hintRecord: { battles: number; learned: Set<HintGroupId> } | null = null;
  function hintsRecord(): { battles: number; learned: Set<HintGroupId> } {
    if (hintRecord) return hintRecord;
    hintRecord = { battles: 0, learned: new Set() };
    try {
      const raw = window.localStorage.getItem(HINTS_KEY);
      if (raw) {
        const stored = JSON.parse(raw) as { battles?: number; learned?: string[] };
        hintRecord.battles = Math.max(0, Number(stored.battles) || 0);
        for (const id of stored.learned ?? []) if ((HINT_GROUP_IDS as readonly string[]).includes(id)) hintRecord.learned.add(id as HintGroupId);
      } else {
        hintRecord.battles = Math.max(0, Number(window.localStorage.getItem(HINTS_KEY_V1)) || 0);
      }
    } catch { /* a refused or unreadable record starts fresh for this page */ }
    return hintRecord;
  }
  function saveHintsRecord(): void {
    const record = hintsRecord();
    try { window.localStorage.setItem(HINTS_KEY, JSON.stringify({ battles: record.battles, learned: [...record.learned] })); } catch { /* the record lasts this page */ }
  }
  function takeFirstBattleHint(): boolean {
    if (input.isTouchLayout?.() || input.isPadConnected()) return false;
    const record = hintsRecord();
    if (record.battles >= HINT_BATTLES || HINT_GROUP_IDS.every((id) => record.learned.has(id))) return false;
    record.battles += 1;
    saveHintsRecord();
    return true;
  }

  let hintListeners: Array<() => void> = [];
  function hideHints() {
    if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
    if (hintFadeTimer) { clearTimeout(hintFadeTimer); hintFadeTimer = null; }
    for (const off of hintListeners.splice(0)) off();
    hints.classList.remove('show', 'fade');
  }
  function fadeHints() {
    if (!hints.classList.contains('show')) return;
    for (const off of hintListeners.splice(0)) off();
    hints.classList.add('fade');
    hintFadeTimer = setTimeout(() => { hints.classList.remove('show', 'fade'); }, 400);
  }
  /** A group's control was used: it leaves the strip (and the record), and the strip with the last of them. */
  function learnHint(id: HintGroupId) {
    const record = hintsRecord();
    if (!record.learned.has(id)) { record.learned.add(id); saveHintsRecord(); }
    const group = hints.querySelector<HTMLElement>(`.hg[data-group="${id}"]`);
    if (group && !group.classList.contains('done')) {
      group.classList.add('done');
      setTimeout(() => group.remove(), 240);
    }
    if (!hints.querySelector('.hg:not(.done)')) fadeHints();
  }

  function showHints() {
    hideHints();
    // its caps name keyboard keys: a touch layout never shows it, whoever asks (takeFirstBattleHint guards the rollout)
    if (input.isTouchLayout?.()) return;
    const record = hintsRecord();
    const groups = battleControlHintGroups(input.getSettings().rmbMode)
      .map(([label, actionIds], index) => ({ id: HINT_GROUP_IDS[index], label, actionIds }))
      .filter(({ id }) => !record.learned.has(id));
    if (!groups.length) return;
    hints.innerHTML = groups.map(({ id, label, actionIds }) => hintGroup(label, actionIds, id)).join('');
    for (const { id, actionIds } of groups) {
      for (const action of actionIds) hintListeners.push(input.onAction(action, () => learnHint(id)));
    }
    hints.classList.add('show');
    hintTimer = setTimeout(fadeHints, HINT_STAY_MS);
  }

  const api = {
    root,
    gear,
    open: openPanel,
    close: closePanel,
    toggle() { if (open) closePanel(); else openPanel(); },
    /** @returns {boolean} panel currently open (battle pauses while true) */
    isOpen: () => open,
    /** Show the controls hint strip: its groups not yet used, with the current bindings (each leaves as its control is
     *  pressed; the strip at the first engagement or after HINT_STAY_MS). */
    showHints,
  };

  // Let the HUD sync its hotkey labels to the persisted bindings at boot, and
  // the audio graph its channel levels (the graph also reads cot.settings.v1
  // directly at build time — this covers a graph that already exists).
  emitBindings();
  emitVolumes();
  emitPerfMeter(); // HUD net readout follows the persisted preference (default on)
  emitDirectionalHitValues(); // exact incoming values are persisted and default off

  return api;
}
