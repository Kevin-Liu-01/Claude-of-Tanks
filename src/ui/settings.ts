import type { RuntimeValue } from '../runtimeTypes.ts';
import type { PadStatusSource } from '../pad/padReceiver.ts';
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
// a player's first battles show at the rollout (its caps named again on a rebind), and the garage gear button. The
// battle's key caps follow the bindings by themselves (game/battleKeyCaps.ts).
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
import { uiIconIds, uiIconSVG, type UiIconId } from './uiIcons.ts';
import { button, segmented, setRoving, wireRoving, wireRovingKeys } from './components/components.ts';
import {
  CHASE_CAMERA_DEFAULTS, CHASE_CAMERA_RANGES, CHASE_SHOULDERS, type ChaseNumericSetting, type ChaseShoulder,
} from '../engine/chaseFraming.ts';
import { createPickerMenu, type PickerMenu } from './components/pickerMenu.ts';
import { closeSurface, openSurface, type TransientSurface } from './components/surfaceStack.ts';
import { markLoadFailed, pressFailed } from './components/loadFailure.ts';
import type { PickerItem } from './components/picker.ts';
import { pickerText } from './pickerText.ts';
import { readBrainSettings, writeBrainSettings } from '../game/teamArrangement.ts';
import { battleTimeChoicesMarkup, bindBattleTimeChoices } from './battleTimeChoices.ts';
import {
  SETTINGS_ACTION_ICONS,
  SETTINGS_OPTION_ICONS,
  type SettingsIconSpec,
} from './settingsIcons.ts';
import { containModalTab, isAnyModalOpen } from './modal.ts';
import { shouldOpenSettingsFromPointerUnlock } from './keyboardOwnership.ts';
import { createElement as el, datumAttr, markDatum } from './dom.ts';
import { notice } from './components/notice.ts';
import { ensureStyle } from './styleLayers.ts';
import { CREW_VOICE_NATIONS, isCrewVoiceSetting } from '../audio/crewVoice.ts';
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
import { foliageSeeThrough } from '../world/foliageSeeThrough.ts';

/** A key cap that reads in Chinese (the mouse's 左键 and 右键): the hint strip sets it in the labels' face and size. */
const CJK_CAP = /[\u3400-\u9fff]/;

/** A desktop preset's preview (public/media/settings-r1: one Verdant frame per preset, a 640x360 cut at 1:1 pixels). */
const QUALITY_PREVIEWS: ReadonlySet<PresetName> = new Set<PresetName>(['low', 'medium', 'high', 'ultra']);
const qualityPreview = (name: PresetName): string | null =>
  (QUALITY_PREVIEWS.has(name) ? `/media/settings-r1/quality-${name}-640.webp` : null);

/** A colour preset's swatch for its picker (an SVG data URL): its ally chevron and enemy diamond, as the sample draws them. */
const teamSwatch = (own: string, enemy: string): string => `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 18"><path d="M6 3 11 14H1Z" fill="${own}"/>`
  + `<path d="M18 3l5 6-5 6-5-6Z" fill="${enemy}"/></svg>`)}`;

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
/** (item 259, the owner: "color code settings so its easier") each tab's glyph, in its category's colour (--settings-<tab>) */
const TAB_GLYPHS: Readonly<Record<SettingsTab, UiIconId>> = Object.freeze({
  controls: 'controller', gameplay: 'vehicle', sound: 'sound', graphics: 'gpu', accessibility: 'accessibility', language: 'globe',
});
const tabMarkup = (tab: SettingsTab, selected: boolean): string =>
  `<button class="cot-set-tab${selected ? ' sel' : ''}" data-tab="${tab}" data-settings-tone="${tab}" type="button" role="tab" id="cot-set-tab-${tab}"`
  + ` aria-selected="${selected}" tabindex="${selected ? 0 : -1}" aria-controls="cot-set-tabpanel"><span>`
  + `${uiIconSVG(TAB_GLYPHS[tab], 20, 'currentColor', 'cot-set-tab-glyph')}<span class="cot-set-tab-name">${t(`settings.tab.${tab}`)}</span></span></button>`;

/** A consumable slot's item as Settings shows it: the progression lane's `ui:consumableLoadout` items (CONSUMABLES-259:
 *  `{ slot, action, itemId, nameKey, shortKey, iconId }`), read by their action. */
interface ConsumableSlotItem {
  readonly itemId: string;
  readonly nameKey: string;
  readonly iconId: UiIconId;
}
const CONSUMABLE_SLOT_ACTIONS = ['consumable1', 'consumable2', 'consumable3'] as const satisfies readonly ActionId[];
type ConsumableSlotAction = typeof CONSUMABLE_SLOT_ACTIONS[number];
/** The default trio (260's catalog: DEFAULT_CONSUMABLE_LOADOUT, by its own name keys), each slot's item until the Garage's
 *  loadout says otherwise. */
const DEFAULT_CONSUMABLE_SLOTS: Readonly<Record<ConsumableSlotAction, ConsumableSlotItem>> = Object.freeze({
  consumable1: { itemId: 'repair', nameKey: 'consumable.repair.name', iconId: 'repair' },
  consumable2: { itemId: 'first_aid', nameKey: 'consumable.firstAid.name', iconId: 'medkit' },
  consumable3: { itemId: 'extinguisher', nameKey: 'consumable.extinguisher.name', iconId: 'extinguisher' },
});
const isConsumableSlotAction = (id: string): id is ConsumableSlotAction => (CONSUMABLE_SLOT_ACTIONS as readonly string[]).includes(id);
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
  | 'volVoice'
  | ChaseNumericSetting;
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
  /** The local player's battle facts for a paired phone (docs/PHONE-CONTROLLER.md): ammunition, reload, scope. */
  readonly phoneSource?: () => PadStatusSource | null;
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
/* the panel's reset spares every kit element (buttons, notices, swatches), whose components layer the surfaces layer
   would otherwise override */
.cot-settings :where(:not([class*="cot-c-"])){box-sizing:border-box;margin:0;padding:0;}
.cot-set-panel{position:relative;width:744px;max-width:96vw;height:min(1080px,88vh);max-height:88vh;
  display:flex;flex-direction:column;background:var(--surface-plate);border-radius:var(--plate-radius);box-shadow:var(--e4);}
.cot-set-panel:focus{outline:none;}
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
/* the underline is the label's: a tab's box may be wider (the touch floor) and its label keeps the gutter */
.cot-set-tab>span{position:relative;align-self:stretch;display:flex;align-items:center;}
.cot-set-tab.sel>span::after{content:'';position:absolute;left:0;right:0;bottom:-1px;height:2px;background:var(--settings-ink,var(--accent));}
/* (item 259, the owner: "color code settings so its easier") a tab stands its category's glyph over its name, so the row
   keeps the names' width; the category's colour (--settings-<tab>, settingsColours.selftest) is the tab's glyph and mark,
   the body's headings' rule and its rows' glyphs, never text (the labels, values and the kit's one selected state stay) */
.cot-set-tab>span{flex-direction:column;justify-content:center;gap:3px;padding-block:6px;}
.cot-set-tab-glyph{flex:none;color:var(--settings-ink);}
.cot-settings [data-settings-tone='controls']{--settings-ink:var(--settings-controls);}
.cot-settings [data-settings-tone='gameplay']{--settings-ink:var(--settings-gameplay);}
.cot-settings [data-settings-tone='sound']{--settings-ink:var(--settings-sound);}
.cot-settings [data-settings-tone='graphics']{--settings-ink:var(--settings-graphics);}
.cot-settings [data-settings-tone='accessibility']{--settings-ink:var(--settings-accessibility);}
.cot-settings [data-settings-tone='language']{--settings-ink:var(--settings-language);}
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
.cot-set-group::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,var(--settings-ink,var(--line-1)),var(--line-1) 70%);}
.cot-set-group:first-child{margin-top:var(--s3);}
/* a cluster's plate on the Gameplay, Sound and Graphics tabs */
.cot-set-card{margin:var(--s3) 0 0;padding:var(--s3);background:var(--surface-page);border-radius:var(--plate-radius);
  box-shadow:var(--e1-flush);}
/* the heading sits on the rows' inset: its label starts at the row glyphs and its (i) ends at the controls' edge */
.cot-set-card .cot-set-group{margin:0 0 var(--s1);padding-inline:var(--s2);}
.cot-set-hud-editor,.cot-set-link{margin-left:auto;flex-shrink:0;}
/* a row's rule spans the content column (its padding's inner edges), so rules, headings and controls share one pair of edges */
.cot-set-row{display:flex;align-items:center;justify-content:space-between;gap:var(--s3);min-height:var(--s7);
  padding:var(--s1) var(--s2);background:linear-gradient(var(--line-1),var(--line-1)) center bottom/calc(100% - var(--s2) * 2) 1px no-repeat;
  transition:background-color var(--dur-fast) var(--ease-enter);}
.cot-set-row:not(:has(~ .cot-set-row)){background-image:none;}
/* a disabled row dims its glyph with its label (item 259: the category colour never says "active" on a disabled row) */
.cot-set-row:has(.cot-c-seg__opt:disabled):not(:has(.cot-c-seg__opt:enabled)) :is(.cot-setting-label-text,.cot-setting-icon){color:var(--ink-3);}
.cot-set-row:hover{background-color:var(--fill-faint);}
.cot-set-row .lb{min-width:0;flex:1;display:flex;align-items:center;gap:var(--s2);
  font:500 max(13px,var(--fs-13))/1.3 var(--font-body);color:var(--ink-2);}
.cot-set-crew-field{width:260px;max-width:100%;min-width:0;}
/* a setting's glyph: its category's colour (item 259) */
/* a row's glyph starts on its box's edge, so the glyph, the heading's label and the control under it share one edge */
.cot-setting-icon{position:relative;width:24px;height:24px;flex:0 0 24px;display:grid;place-items:center start;color:var(--settings-ink,var(--ink-2));}
.cot-setting-icon svg{display:block;width:16px;height:16px;overflow:visible;}
.cot-setting-label-text{min-width:0;}
/* a consumable slot's item beside the slot's name (item 259) */
.cot-set-item{min-width:0;color:var(--ink-3);}
/* the rows in a conflict: the notice's warning tone, no stripe */
.cot-set-row.conflict{background-color:color-mix(in srgb,var(--text-warn) 9%,transparent);}
.cot-set-row.conflict .cot-chip{box-shadow:var(--ring-warn);}
.cot-set-row .chips{display:flex;gap:var(--s2);align-items:center;}
.cot-set-colhdr{display:flex;align-items:center;gap:var(--s2);padding:var(--s3) calc(var(--s3) + var(--s2)) var(--s1);}
.cot-set-colhdr span{width:max(92px,calc(92px * var(--cot-type-scale,1)));text-align:center;font:600 max(var(--fs-floor-12),var(--fs-12))/1 var(--font-display);
  letter-spacing:var(--track-label);text-transform:uppercase;color:var(--ink-3);}
.cot-set-colhdr span.act{width:auto;flex:1;padding-left:calc(24px + var(--s2));text-align:left;}
/* binding chips: the kit's key cap (components.css .cot-c-kbd) at the binding's width. States: bound, unbound (dashed),
   listening (the accent, pulsing) and conflict (the danger ring, row-scoped above). */
.cot-chip{width:max(92px,calc(92px * var(--cot-type-scale,1)));height:30px;padding:0 var(--s1);border:0;border-radius:var(--control-radius);cursor:pointer;
  font:500 max(var(--fs-floor-12),var(--fs-12))/1 var(--font-data);color:var(--ink-1);text-align:center;background:var(--surface-raised);
  box-shadow:var(--ring-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  transition:background-color var(--dur-fast) var(--ease-enter),box-shadow var(--dur-fast) var(--ease-enter);}
.cot-chip svg{display:inline-block;width:14px;height:14px;vertical-align:middle;}
.cot-chip:hover{background:var(--surface-hover);}
.cot-chip:active{transform:translateY(var(--btn-press-drop));}
.cot-chip.empty{color:var(--ink-4);background:transparent;box-shadow:none;outline:1px dashed var(--ink-4);outline-offset:-1px;}
.cot-chip.listening{color:var(--ink-1);background:var(--accent-wash);box-shadow:var(--ring-accent);
  animation:cotChipPulse calc(var(--dur-stage) * 1.6) var(--ease-move) infinite;}
.cot-chip:focus,.cot-set-tab:focus,.cot-set-btn:focus,.cot-set-close:focus{outline:none;}
.cot-chip:focus-visible,.cot-set-tab:focus-visible{box-shadow:var(--focus-ring);}
.cot-set-slider input[type=range]:focus{outline:none;}
.cot-set-slider input[type=range]:focus-visible{box-shadow:var(--focus-ring);}
@keyframes cotChipPulse{50%{opacity:.7;}}
/* the binding conflict is the kit's notice (components/notices.css); the panel only places and shows it */
.cot-set-conflict{display:none;margin:var(--s3) var(--s5) 0;}
.cot-set-conflict.show{display:flex;}
.cot-set-conflict b{color:var(--text-warn);font-weight:600;}
/* the footer: Reset on the left, Leave battle and the one primary on the right (the kit's buttons) */
.cot-set-ftr{display:flex;align-items:center;justify-content:flex-end;gap:var(--s3);padding:var(--s3) var(--s5);border-top:1px solid var(--line-1);}
/* reset anchors left and pushes the action pair right (the primary stays flush right with Leave battle hidden) */
.cot-set-btn.reset{margin-right:auto;}
.cot-set-btn[hidden]{display:none;}
/* a footer with nothing to offer (no Reset on this tab, no battle to leave) takes no room */
.cot-set-ftr:not(:has(.cot-set-btn:not([hidden]))){display:none;}
/* sliders: a line track with an ink fill (--f set from JS) and a square knob */
.cot-set-slider{display:flex;align-items:center;gap:var(--s3);}
.cot-set-slider input[type=range]{-webkit-appearance:none;appearance:none;--f:50%;width:190px;height:20px;cursor:pointer;
  background:transparent;}
.cot-set-slider input[type=range]::-webkit-slider-runnable-track{height:4px;border-radius:2px;
  background:linear-gradient(90deg,var(--ink-2) var(--f),var(--ink-4) var(--f));}
.cot-set-slider input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;margin-top:-5px;
  border-radius:var(--control-radius);background:var(--ink-1);box-shadow:var(--e1);
  transition:transform var(--dur-fast) var(--ease-enter);}
.cot-set-slider input[type=range]:hover::-webkit-slider-thumb{transform:scale(1.15);}
.cot-set-slider input[type=range]::-moz-range-track{height:4px;background:var(--ink-4);}
.cot-set-slider input[type=range]::-moz-range-progress{height:4px;background:var(--ink-2);}
.cot-set-slider input[type=range]::-moz-range-thumb{width:14px;height:14px;border:0;border-radius:var(--control-radius);
  background:var(--ink-1);}
.cot-set-slider input[type=number]{width:72px;height:36px;padding:0 22px 0 var(--s2);text-align:right;
  font:500 max(13px,var(--fs-13))/1 var(--font-data);color:var(--ink-1);background:var(--surface-page);border:0;
  border-radius:var(--control-radius);box-shadow:var(--ring-2);-moz-appearance:textfield;appearance:textfield;}
.cot-set-slider input[type=number]:focus{outline:none;box-shadow:var(--ring-accent);}
.cot-set-slider input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;}
/* the unit sits inside its field's end (a multiplier's is empty), so every value field ends on the controls' edge */
.cot-set-slider .unit{width:20px;margin-left:calc(-1 * (var(--s3) + 20px));pointer-events:none;text-align:start;
  font:500 max(var(--fs-floor-12),var(--fs-12))/1 var(--font-data);color:var(--ink-3);}
/* (battle-camera-264) the camera's rows end on their reset, the kit's icon button; the shoulder's segments sit beside it */
.cot-set-reset{flex:none;}
.cot-set-camera-seg{display:flex;align-items:center;gap:var(--s3);}
/* the settings of two to five values (difficulty, right click, a phone's quality, language, On/Off) are the kit's segmented
   control (components.css .cot-c-seg); every inline control is 36 px tall. The sets of six (the desktop's quality, the
   colour presets) and the crew voice are the kit's picker menu, as wide as the crew field. */
.cot-settings .cot-c-seg__opt{height:30px;min-width:48px;}
.cot-set-menu{width:260px;max-width:100%;min-width:0;}
/* time of day (battleTimeChoices.ts): a multi-select, so the kit's chips (each its own pill, a tick when on) rather than
   a segmented control; the legend names the group */
.cot-settings .cot-battle-times{display:flex;flex-wrap:wrap;gap:var(--s2);margin:0;padding:0;border:0;min-width:0;}
.cot-settings .cot-battle-times legend{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;}
.cot-settings .cot-time-choice{flex:none;min-width:0;}
.cot-settings .cot-time-content{display:inline-flex;align-items:center;justify-content:center;gap:var(--s2);min-height:0;height:36px;padding:0 var(--s3);
  border-radius:var(--chip-radius);background:var(--chip-fill);box-shadow:var(--ring-2);color:var(--ink-2);font:500 max(13px,var(--fs-13))/1 var(--font-body);}
.cot-settings .cot-time-content>svg{display:none;}
.cot-settings .cot-time-check{flex:0 0 12px;width:12px;height:12px;border:0;color:var(--ink-1);visibility:hidden;}
@media (hover:hover){.cot-settings .cot-time-choice:hover .cot-time-content{color:var(--ink-1);}}
.cot-settings .cot-time-choice input:checked+.cot-time-content{background:var(--chip-fill-on);box-shadow:var(--ring-accent);color:var(--ink-1);}
.cot-settings .cot-time-choice input:checked+.cot-time-content .cot-time-check{visibility:visible;border:0;background:none;color:var(--ink-1);}
.cot-settings .cot-time-choice input:focus-visible+.cot-time-content{outline:none;box-shadow:var(--focus-ring);}
/* the graphics quality preview (media/settings-r1): the chosen preset's frame at 1:1 pixels, or the one pointed at */
.cot-set-preview{margin:var(--s3) var(--s2) var(--s1);aspect-ratio:16/9;overflow:hidden;border-radius:var(--control-radius);background:var(--surface-scene);box-shadow:var(--ring-2)}
.cot-set-preview[hidden]{display:none}
.cot-set-preview img{display:block;width:100%;height:100%;object-fit:cover}
.cot-set-note{margin:var(--s3) var(--s2) var(--s1);max-width:72ch;font:400 max(13px,var(--fs-13))/1.55 var(--font-body);color:var(--ink-3);text-wrap:pretty;}
.cot-set-note b{color:var(--ink-2);font-weight:600;}
.cot-set-note.keep{text-wrap:pretty;}
:lang(zh-CN) .cot-set-note{word-break:keep-all;overflow-wrap:break-word;}
.cot-set-note.folded{display:none;}
.cot-set-body>.cot-set-note{margin-inline:calc(var(--s3) + var(--s2));}
.cot-settings [data-time-hint]{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;}
.cot-set-card.notes-open .cot-set-note.folded{display:block;}
/* a card's notes button: the kit's ghost icon button at the control floor (44 px on touch), bleeding evenly into its
   heading's line so every heading keeps one height */
/* the (i) is its glyph's size on the line (so it ends where the controls end); its hit area reaches the control floor */
.cot-set-info{--h:16px;order:2;flex:none;margin-block:calc(var(--h) / -2);color:var(--ink-3);}
/* the touch floors size the (i)'s hit area, never its box: a heading with an (i) is as tall as one without */
body.cot-touch-layout .cot-settings .cot-set-info.cot-c-btn,body[data-cot-input='coarse'] .cot-settings .cot-set-info.cot-c-btn{min-height:0;}
.cot-set-info::after{content:'';position:absolute;inset:calc((16px - var(--cot-control-floor,36px)) / 2) calc(-1 * var(--s1));}
/* touch: the 44 px hit area reaches left and stays inside the heading's end padding (nothing drawn past its box) */
body[data-cot-input='coarse'] .cot-set-info::after{inset:calc((16px - var(--cot-control-floor,44px)) / 2) calc(-1 * var(--s2))
  calc((16px - var(--cot-control-floor,44px)) / 2) calc(16px - var(--cot-control-floor,44px) + var(--s2));}
.cot-set-info svg{width:16px;height:16px;}
.cot-set-info[aria-expanded='true']{color:var(--accent);}
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
.cot-hints .hk .cot-c-kbd.cjk{font:500 var(--battle-fs-12)/1 var(--font-ui);}
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
/* (the battle's primary, the end report's AGAIN and the bars' GARAGE and DRIVE: 48 px, its bevel for the kit's lifted shadow;
   56 px and flat here, the same action read as two buttons, gauntlet r13) */
.cot-resume .rz-go{box-shadow:var(--btn-primary-bevel);}
.cot-resume .rz-set .cot-c-kbd{min-width:22px;height:22px;padding:0 var(--s1);box-sizing:border-box;border:0;border-radius:var(--control-radius);background:none;box-shadow:var(--ring-3);font:500 var(--battle-fs-fig-11)/1 var(--font-data);letter-spacing:0;color:var(--ink-2);}

/* ACCESSIBILITY tab (brand-ui BUI-F9; BUI-S4 redesigns it): the live preview draws the team shapes in the team tokens
   and a text and HUD sample in the type tokens, so every choice shows before the player leaves the panel. */
.cot-a11y-preview{display:flex;align-items:center;gap:var(--s4);margin:var(--s3) var(--s2) var(--s2);padding:var(--s2) var(--s3);
  border-radius:var(--plate-radius);background:var(--surface-page);box-shadow:var(--ring-1);color:var(--ink-1);}
.cot-a11y-preview .shape{font-size:var(--fs-24);line-height:1;}
.cot-a11y-preview .own{color:var(--team-own)}.cot-a11y-preview .enemy{color:var(--team-enemy)}
.cot-a11y-preview .squad{color:var(--team-squad);border-radius:50%;outline:var(--team-squad-ring) solid var(--ink-1);}
.cot-a11y-preview .sample{margin-left:auto;font-size:var(--fs-16);font-weight:600;}
.cot-a11y-preview .hudnum{font-size:var(--hud-fs-numeral);font-weight:700;padding:2px var(--s2);background:var(--hud-plate);
  box-shadow:var(--ring-2);}
.cot-a11y-custom{display:flex;align-items:center;gap:var(--s2);}
/* each custom colour beside its team's shape (a team is shape plus colour) */
.cot-a11y-shape{font-size:var(--fs-16);line-height:1;}
.cot-a11y-shape.own{color:var(--team-own);}.cot-a11y-shape.enemy{margin-left:var(--s2);color:var(--team-enemy);}
/* the refusal belongs to the Custom row: under its swatches, above its rule, its glyph and text on the row's glyph and
   label columns */
.cot-set-row:has(> .cot-set-refused:not([hidden])){flex-wrap:wrap;}
/* its first line keeps an unwrapped row's height, so the label and swatches hold their place when the refusal shows */
.cot-set-row:has(> .cot-set-refused:not([hidden]))>.cot-a11y-custom{margin-block:calc(var(--s1) / 2);}
/* the refusal is the Custom row's inline notice: its glyph on the rows' glyph column, its text on their label column */
.cot-set-refused{flex:1 1 100%;align-self:stretch;gap:var(--s2);margin:0 0 var(--s1);}
/* its glyph takes a row glyph's box and size, so it stands in the glyph column and its text on the label column */
.cot-set-refused .cot-c-notice__glyph{width:24px;place-items:center start;}
.cot-set-refused .cot-c-notice__glyph svg{width:16px;height:16px;stroke-width:2;}

/* Touch settings use a true finger-sized target floor in every orientation. */
body.cot-touch-layout .cot-settings button{min-height:44px;}
body[data-cot-input='coarse'] .cot-settings .cot-c-btn{min-height:var(--cot-control-floor,44px);}
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
  const behaviours = (): void => void import('./components/pageBehaviours.ts').then(({ installPageBehaviours }) => installPageBehaviours())
    .catch(() => { /* hover-only behaviours: the page works without them */ });
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
  // the keys a kit control keeps (onPanelKey yields them to it) stop here, short of the game behind the panel
  root.addEventListener('keydown', (event) => { if (open) event.stopPropagation(); });
  root.innerHTML =
    `<div class="cot-set-panel" role="dialog" aria-modal="true" tabindex="-1" aria-label="${t('settings.title')}">` +
    `<div class="cot-set-hdr"><h2>${t('settings.title')}</h2>` +
    `<span class="cot-set-paused"${datumAttr('paused')}>${t('settings.paused')}</span>` +
    `<button class="cot-set-close cot-c-btn cot-c-btn--36 cot-c-btn--icon cot-c-btn--ghost" type="button" aria-label="${t('settings.close.title')}">${uiIconSVG('close', 18)}</button></div>` +
    `<div class="cot-set-tabs" role="tablist" aria-label="${t('settings.title')}">` +
    // every tab is its category's glyph and its name (item 259; the 10-24 sweep took the controls tab's action count)
    (['controls', 'gameplay', 'sound', 'graphics', 'accessibility', 'language'] as const).map((tab) => tabMarkup(tab, tab === 'controls')).join('') +
    `</div>` +
    // a binding conflict: the kit's warning notice with its two actions (its text is set when it shows)
    notice({ severity: 'warning', text: '', className: 'cot-set-conflict', actions: [
      { label: t('settings.conflict.swap'), primary: true, attrs: { 'data-conflict': 'swap' } },
      { label: t('settings.conflict.cancel'), attrs: { 'data-conflict': 'cancel' } },
    ] }) +
    `<div class="cot-set-body" id="cot-set-tabpanel" role="tabpanel" aria-labelledby="cot-set-tab-controls"></div>` +
    `<div class="cot-set-ftr">` +
    `<button class="cot-set-btn reset cot-c-btn cot-c-btn--36 cot-c-btn--secondary" type="button">${t('settings.reset')}</button>` +
    // one close control, the header's (the lead's 250 ruling); Esc and the backdrop close the panel too
    `<button class="cot-set-btn ghost leave cot-c-btn cot-c-btn--36 cot-c-btn--danger" type="button" hidden>${t('settings.leave')}</button></div>` +
    `</div>`;
  document.body.appendChild(root);

  const body = requiredElement<HTMLDivElement>(root, '.cot-set-body');
  const conflictBar = markDatum(requiredElement<HTMLDivElement>(root, '.cot-set-conflict'), 'notices');
  const conflictMsg = requiredElement<HTMLSpanElement>(conflictBar, '.cot-c-notice__text');
  const resetBtn = requiredElement<HTMLButtonElement>(root, '.reset');
  const leaveBtn = requiredElement<HTMLButtonElement>(root, '.leave');

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

  const hints = markDatum(el('div', 'cot-hints'), 'hints');
  document.body.appendChild(hints);

  // Click-to-resume veil (controls_gunnery r2): pointer-lock loss from ALT-TAB
  // / focus loss must NOT throw the options menu at the player (WoT returns
  // you to the battle). The veil relocks inside its own click gesture.
  const resume = el('div', 'cot-resume');
  resume.setAttribute('role', 'dialog');
  resume.setAttribute('aria-labelledby', 'cot-rz-title');
  resume.innerHTML =
    `<div class="rz-plate"><h2 class="rz-title" id="cot-rz-title"${datumAttr('paused')}>${t('settings.pauseTitle')}</h2>` +
    '<div class="rz-actions">' +
    `<button type="button" class="cot-c-btn cot-c-btn--48 cot-c-btn--primary rz-go">${t('settings.pauseResume')}</button>` +
    `<button type="button" class="cot-c-btn cot-c-btn--48 rz-set">${t('settings.title')}<kbd class="cot-c-kbd"></kbd></button>` +
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
  /** The open tab's picker menus (their popovers live in the body): disposed when the tab re-renders. */
  const tabMenus: PickerMenu[] = [];
  // A touch-only device has no keyboard to rebind, so the Controls
  // tab rendered 70+ sub-30px keycap chips (useless, and every one a failed
  // touch target). Hide the tab and land on Gameplay instead.
  if (input.isTouchLayout && input.isTouchLayout()) {
    activeTab = 'gameplay';
    const tb = root.querySelector<HTMLButtonElement>('.cot-set-tab[data-tab="controls"]');
    if (tb) { tb.style.display = 'none'; tb.hidden = true; } // hidden: the roving keys pass it too
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

  // (the battle's caps follow the bindings by themselves: game/battleKeyCaps.ts reads input.bindingsRevision)
  function bindingsMutated() {
    refreshChips();
    refreshHintCaps();
    emit('ui:click', {});
  }

  // --- CONTROLS tab -----------------------------------------------------------
  const rowByAction = new Map<ActionId, ActionBindingRow>();
  /** (item 259, the owner: "update equipment slots in settings") each consumable slot's item: today's three until the
   *  progression lane's `ui:consumableLoadout` names the chosen tank's (CONSUMABLES-259). */
  const consumableSlots: Record<ConsumableSlotAction, ConsumableSlotItem> = { ...DEFAULT_CONSUMABLE_SLOTS };
  const consumableLabels = new Map<ConsumableSlotAction, HTMLSpanElement>();
  /** An action's name: a consumable's is its slot's ("Consumable slot 1"), its item beside it. */
  const actionName = (def: ActionDefinition): string => {
    const slot = CONSUMABLE_SLOT_ACTIONS.indexOf(def.id as ConsumableSlotAction);
    return slot >= 0 ? t('settings.consumableSlot', { n: slot + 1 }) : t(def.label);
  };
  /** A consumable slot's label: its item's glyph, the slot's name and its item's name. */
  function paintConsumableLabel(action: ConsumableSlotAction): void {
    const lb = consumableLabels.get(action);
    if (!lb) return;
    const item = consumableSlots[action];
    const glyph = lb.querySelector<HTMLElement>('.cot-setting-icon');
    if (glyph && glyph.dataset.item !== item.itemId) { glyph.innerHTML = uiIconSVG(item.iconId, 16); glyph.dataset.item = item.itemId; }
    const name = lb.querySelector<HTMLElement>('.cot-set-item');
    if (name) name.textContent = t(item.nameKey);
  }
  function adoptConsumableLoadout(payload: RuntimeValue): void {
    const items = (payload as { items?: unknown } | null)?.items;
    if (!Array.isArray(items)) return;
    const known = new Set<string>(uiIconIds());
    for (const action of CONSUMABLE_SLOT_ACTIONS) {
      const raw = items.find((item: unknown) => (item as { action?: unknown } | null)?.action === action) as
        { itemId?: unknown; nameKey?: unknown; iconId?: unknown } | undefined;
      const fresh = raw && typeof raw.itemId === 'string' && typeof raw.nameKey === 'string'
        ? { itemId: raw.itemId, nameKey: raw.nameKey, iconId: (typeof raw.iconId === 'string' && known.has(raw.iconId) ? raw.iconId : 'shell') as UiIconId }
        : DEFAULT_CONSUMABLE_SLOTS[action]; // an empty slot shows today's item
      consumableSlots[action] = fresh;
      paintConsumableLabel(action);
    }
  }
  /** An arrow key's cap: the sprite's arrow and its spoken name (the input layer labels them ↑ ↓ ← →). */
  const ARROW_KEY_GLYPHS: Readonly<Record<string, readonly [UiIconId, string]>> = {
    '↑': ['moveForward', 'settings.bind.arrowUp'], '↓': ['moveBack', 'settings.bind.arrowDown'],
    '←': ['steerLeft', 'settings.bind.arrowLeft'], '→': ['steerRight', 'settings.bind.arrowRight'],
  };

  function chipText(actionId: ActionId, slotKey: BindingSlotKey): string {
    if (slotKey === 'pad') {
      const label = input.padLabelFor(input.getPadBinding(actionId));
      return label === '—' ? '' : label;
    }
    const label = input.labelFor(input.getBinding(actionId, slotKey));
    return label === '—' ? '' : label; // the input layer's '—' is an unbound slot: an empty cap
  }

  function makeChip(
    def: ActionDefinition,
    slotKey: BindingSlotKey,
    parent: HTMLElement,
  ): HTMLButtonElement {
    const chip = el('button', `cot-chip${slotKey === 'pad' ? ' padcol' : ''}`, parent);
    chip.type = 'button';
    // (its action and slot, for the battle key caps' receipt: tools/battle-key-caps.browser.mjs rebinds through it)
    chip.dataset.bind = `${def.id}:${slotKey}`;
    const labelText = actionName(def);
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

  /** Gunnery r1 (owner): what right-click does — hold-to-aim (default), toggle-aim or the classic gun-lock free look,
   *  persisted as settings.rmbMode (main.ts routes the RMB-bound action per frame). Item 259 (the lead, bar line 13: one
   *  datum, one place): its one control, under the RMB action's binding on Controls; Accessibility links here. */
  function rmbModeRow(parent: HTMLElement): void {
    const row = markDatum(el('div', 'cot-set-row', parent), 'rmb-mode');
    row.id = 'cot-set-rmb-mode';
    settingLabel(row, t('settings.rmb.label'), SETTINGS_OPTION_ICONS.rmbMode);
    const modes: ReadonlyArray<readonly [RmbMode, string]> = [
      ['hold', t('settings.rmb.hold')], ['toggle', t('settings.rmb.toggle')], ['freelook', t('settings.rmb.freelook')],
    ];
    mountSeg(row, segmented({ label: t('settings.rmb.label'), className: 'cot-set-rmb', value: input.getSettings().rmbMode,
      options: modes.map(([value, label]) => ({ value, label })) }),
      () => input.getSettings().rmbMode, (value) => input.setSetting('rmbMode', value));
    el('div', 'cot-set-note', parent).textContent = t('settings.aim.note');
  }

  // --- PHONE CONTROLLER (phone-controller-266, docs/PHONE-CONTROLLER.md) ------------------------------------------
  // The card's button loads the pairing card and its receiver (src/pad/padConnectCard.ts): nothing of it, and no request,
  // until the player asks. Once loaded the card re-renders with the tab and shows the live pairing.
  let padCard: typeof import('../pad/padConnectCard.ts') | null = null;
  const padPorts = () => ({
    input,
    source: () => opts.phoneSource?.() ?? null,
    // the phone's pause is Escape's: in a battle only, and its resume never asks for the pointer without a gesture
    togglePause: () => { if (!isBattleActive()) return; if (open) closePanel({ noRelock: true }); else openPanel(); },
  });
  function phoneCard(parent: HTMLElement): void {
    const host = el('div', '', groupCard(parent, t('settings.phone.title')));
    if (padCard) { padCard.renderPadCard(host, padPorts()); return; }
    const row = el('div', 'cot-set-row', host);
    settingLabel(row, t('settings.phone.label'), { id: 'phone', tone: 'cyan' });
    row.insertAdjacentHTML('beforeend', button({ label: t('settings.phone.connect'), variant: 'secondary', size: 36, icon: 'phone', className: 'cot-pad-action' }));
    const connect = row.lastElementChild as HTMLButtonElement;
    connect.addEventListener('click', () => {
      if (pressFailed(connect)) return;
      void import('../pad/padConnectCard.ts').then((module) => {
        padCard = module;
        if (host.isConnected) module.renderPadCard(host, padPorts(), true);
      }).catch((error: RuntimeValue) => {
        console.error('[settings] phone controller failed to load', error);
        markLoadFailed([connect]);
      });
    });
    el('div', 'cot-set-note', host).textContent = t('settings.phone.note');
  }

  function renderControls() {
    body.textContent = '';
    rowByAction.clear();
    consumableLabels.clear();
    phoneCard(body);
    const colhdr = el('div', 'cot-set-colhdr', body);
    colhdr.innerHTML =
      '<span class="act">' + t('settings.bind.colAction') + '</span><span>' + t('settings.bind.primary') + '</span><span>' + t('settings.bind.secondary') + '</span><span class="pad">' + t('settings.bind.pad') + '</span>';
    let lastGroup = null;
    let card: HTMLDivElement = body;
    for (const def of input.actionDefs) {
      if (def.group !== lastGroup) {
        card = groupCard(body, t(def.group)); // each group a card, as on every other tab
        lastGroup = def.group;
      }
      const row = el('div', 'cot-set-row', card);
      row.dataset.action = def.id;
      const lb = settingLabel(row, actionName(def), SETTINGS_ACTION_ICONS[def.id]);
      if (isConsumableSlotAction(def.id)) {
        el('span', 'cot-set-item', lb);
        consumableLabels.set(def.id, lb);
        paintConsumableLabel(def.id);
      }
      const chipsWrap = el('div', 'chips', row);
      const chips = {
        0: makeChip(def, 0, chipsWrap),
        1: makeChip(def, 1, chipsWrap),
        pad: makeChip(def, 'pad', chipsWrap),
      };
      rowByAction.set(def.id, { row, chips });
      if (def.id === 'freeCamera') rmbModeRow(card);
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
        const text = chipText(def.id, slotKey);
        const empty = text === '';
        const arrow = ARROW_KEY_GLYPHS[text];
        // item 259 (the gauntlet's critics: typed arrows in the wheel's caps, and the word left in English in zh): a wheel
        // notch is the wheel's word and the sprite's arrow
        const wheel = /^WHEEL ([↑↓])$/.exec(text)?.[1];
        // an unbound slot is an empty cap (no dash in view) and an arrow key the sprite's arrow, each named for
        // assistive tech
        if (arrow) chip.innerHTML = uiIconSVG(arrow[0], 14);
        else if (wheel) chip.innerHTML = `${t('settings.bind.wheel')} ${uiIconSVG(wheel === '↑' ? 'moveForward' : 'moveBack', 14)}`;
        else chip.textContent = empty ? '' : text;
        chip.classList.toggle('empty', empty);
        const name = empty ? t('settings.bind.unbound') : arrow ? t(arrow[1])
          : wheel ? t(wheel === '↑' ? 'settings.bind.wheelUp' : 'settings.bind.wheelDown') : '';
        if (name) chip.setAttribute('aria-label', name);
        else chip.removeAttribute('aria-label');
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
  ): { row: HTMLDivElement; wrap: HTMLDivElement; sync(): void } {
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
    el('span', 'unit', wrap).textContent = o.unit || ''; // a multiplier needs no unit mark
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
    return { row, wrap, sync };
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
    mountSeg(row, segmented({ label, className: 'cot-set-onoff', value: input.getSettings()[key] ? 'on' : 'off',
      options: [{ value: 'off', label: t('settings.off') }, { value: 'on', label: t('settings.on') }] }),
      () => (input.getSettings()[key] ? 'on' : 'off'), (value) => { input.setSetting(key, value === 'on'); onChange?.(); });
    return row;
  }

  /** Mount a kit segmented control (its markup from segmented()) at the end of `row`: it shows `current()`, and a new value
   *  goes to `choose`. Returns its group and a sync for a value changed elsewhere. */
  function mountSeg<T extends string>(row: HTMLElement, markup: string, current: () => T, choose: (value: T) => void): { group: HTMLElement; sync(): void } {
    row.insertAdjacentHTML('beforeend', markup);
    const group = row.lastElementChild as HTMLElement;
    const sync = (): void => setRoving(group, current());
    wireRoving(group, (value) => {
      if (value !== current()) { choose(value as T); emit('ui:click', {}); }
      sync();
    });
    sync();
    return { group, sync };
  }

  /** A row's reset to the camera setting's default: the kit's quiet icon button, by its classes as the panel's close is
   *  (the kit's button() would pull its factory into a boot chunk the Gallery shares), named for its row. */
  function cameraReset(host: HTMLElement, label: string, key: ChaseNumericSetting | 'cameraShoulder', sync: () => void): void {
    const reset = el('button', 'cot-c-btn cot-c-btn--36 cot-c-btn--icon cot-c-btn--quiet cot-set-reset', host);
    reset.type = 'button';
    reset.dataset.uiSound = 'press';
    reset.setAttribute('aria-label', t('settings.camera.reset', { label }));
    reset.innerHTML = uiIconSVG('undo', 18);
    reset.addEventListener('click', () => {
      input.setSetting(key, CHASE_CAMERA_DEFAULTS[key]);
      sync();
      emit('ui:click', {});
    });
  }

  /** battle-camera-264 (owner 2026-10-28: "be able to change and alter this camera angle as u like in settins"): the chase
   *  camera over its framing (engine/chaseFraming.ts), each setting with its reset. A change applies at once: in battle the
   *  camera glides to it behind this menu (cameraRig.previewFraming). */
  function cameraCard(parent: HTMLElement): void {
    const card = groupCard(parent, t('settings.camera.title'));
    const slider = (label: string, key: ChaseNumericSetting, o: SliderOptions) => {
      const [min, max] = CHASE_CAMERA_RANGES[key];
      const made = sliderRow(card, label, key, min, max, o);
      cameraReset(made.wrap, label, key, made.sync);
    };
    slider(t('settings.camera.height'), 'cameraHeight', {
      step: '0.1', dispStep: '0.1', digits: 1, unit: t('settings.camera.unitMetres'),
    });
    slider(t('settings.camera.distance'), 'cameraDistance', {
      step: '0.05', dispStep: '5', unit: '%', digits: 0, toDisp: (v) => v * 100, fromDisp: (v) => v / 100,
    });
    const shoulderLabel = t('settings.camera.shoulder');
    const shoulderRow = el('div', 'cot-set-row', card);
    settingLabel(shoulderRow, shoulderLabel, SETTINGS_OPTION_ICONS.cameraShoulder);
    const shoulderNames: Readonly<Record<ChaseShoulder, string>> = {
      left: t('settings.camera.shoulderLeft'), centre: t('settings.camera.shoulderCentre'), right: t('settings.camera.shoulderRight'),
    };
    const controls = el('div', 'cot-set-camera-seg', shoulderRow);
    const shoulder = mountSeg(controls, segmented({ label: shoulderLabel, className: 'cot-set-shoulder', value: input.getSettings().cameraShoulder,
      options: CHASE_SHOULDERS.map((side) => ({ value: side, label: shoulderNames[side] })) }),
    () => input.getSettings().cameraShoulder, (side) => input.setSetting('cameraShoulder', side));
    cameraReset(controls, shoulderLabel, 'cameraShoulder', () => shoulder.sync());
    slider(t('settings.camera.framing'), 'cameraFraming', {
      step: '0.01', dispStep: '1', unit: '%', digits: 0, toDisp: (v) => v * 100, fromDisp: (v) => v / 100,
    });
    slider(t('settings.camera.fov'), 'cameraFov', {
      step: '1', dispStep: '1', digits: 0, unit: t('settings.camera.unitDegrees'),
    });
    el('div', 'cot-set-note', card).textContent = t('settings.camera.note');
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
    cameraCard(body);


    const battle = groupCard(body, t('settings.battle.title'));
    const diffRow = el('div', 'cot-set-row', battle);
    settingLabel(diffRow, t('settings.gameplay.difficultyNext'), SETTINGS_OPTION_ICONS.aiDifficulty);
    mountSeg(diffRow, segmented({ label: t('settings.gameplay.difficultyNext'), className: 'cot-set-tier', value: input.getSettings().aiDifficulty,
      options: (['easy', 'normal', 'hard'] as const satisfies readonly AiDifficulty[]).map((tier) => ({ value: tier, label: t(`settings.difficulty.${tier}`) })) }),
      () => input.getSettings().aiDifficulty, (tier) => { input.setSetting('aiDifficulty', tier); emit('ui:difficulty', { difficulty: tier }); });
    const diffNote = el('div', 'cot-set-note', battle);
    diffNote.textContent = t('settings.difficulty.note');

    const brainRow = el('div', 'cot-set-row', battle);
    const brainLabel = t('settings.gameplay.brainNext');
    settingLabel(brainRow, brainLabel, SETTINGS_OPTION_ICONS.aiDifficulty);
    const brain = mountSeg(brainRow, segmented({ label: brainLabel, className: 'cot-set-brain', value: readBrainSettings().opponent,
      options: (['classic', 'jev'] as const).map((opponent) => ({ value: opponent, label: t(`playMenu.brain.${opponent}`) })) }),
      () => readBrainSettings().opponent, (opponent) => { writeBrainSettings({ opponent }); syncBrain(); });
    const alliesRow = el('div', 'cot-set-row', battle);
    settingLabel(alliesRow, t('settings.gameplay.alliesJev'), { id: 'team' });
    const allies = mountSeg(alliesRow, segmented({ label: t('settings.gameplay.alliesJev'), className: 'cot-set-onoff', value: readBrainSettings().allies ? 'on' : 'off',
      options: [{ value: 'off', label: t('settings.off') }, { value: 'on', label: t('settings.on') }] }),
      () => (readBrainSettings().allies ? 'on' : 'off'), (value) => { writeBrainSettings({ allies: value === 'on' }); syncBrain(); });
    const brainNote = el('div', 'cot-set-note', battle);
    // the allies' brain is Jev's alone: Off and On wait for Jev
    function syncBrain(): void {
      const current = readBrainSettings();
      brain.sync();
      allies.sync();
      for (const option of allies.group.querySelectorAll<HTMLButtonElement>('.cot-c-seg__opt')) option.disabled = current.opponent !== 'jev';
      brainNote.textContent = t('playMenu.brain.sub')
        + (current.opponent === 'jev' ? ' ' + t('playMenu.brain.note') : '');
    }
    syncBrain();

    // time of day: a row like the others, its choices (any one or more) in the segmented look
    const timesRow = el('div', 'cot-set-row', battle);
    settingLabel(timesRow, t('garage.battle.timeOfDay'), SETTINGS_OPTION_ICONS.battleTimes).setAttribute('aria-hidden', 'true');
    const times = el('fieldset', 'cot-battle-times', timesRow);
    times.innerHTML = battleTimeChoicesMarkup('cot-settings-time-hint', 'settings.battle.timeHint');
    bindBattleTimeChoices(times, () => emit('ui:click', {}));

    const iface = groupCard(body, t('settings.interface.title'));
    const hudLayoutRow = el('div', 'cot-set-row', iface);
    settingLabel(hudLayoutRow, t('hudEditor.title'), { id: 'performance', tone: 'cyan' });
    const editHud = el('button', 'cot-set-hud-editor cot-c-btn cot-c-btn--36 cot-c-btn--secondary', hudLayoutRow);
    editHud.type = 'button'; editHud.textContent = t('hudEditor.open');
    editHud.addEventListener('click', async () => {
      // (a chunk that did not arrive is not asked for again in this document: the press reloads the page once online)
      if (pressFailed(editHud)) return;
      editHud.disabled = true;
      try {
        const [{ openHudEditor }] = await Promise.all([import('./hudEditor.ts'), import('./hudEditor.css')]);
        if (open) openHudEditor(editHud);
      } catch {
        editHud.textContent = t('hudEditor.loadError');
        markLoadFailed([editHud], t('hudEditor.loadError'));
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
    crewField.dataset.setting = 'crewVoice';
    const crewItems = (flag?: (nation: string) => string): PickerItem[] => [
      { id: 'national', name: t('settings.crew.national'), glyph: 'globe' },
      ...Object.entries(CREW_VOICE_NATIONS).map(([value, nation]) => ({ id: value, name: t(`nation.${nation}`), chip: flag?.(nation) })),
    ];
    const crewMenu = createPickerMenu(crewField, { id: 'settings-crew-voice', label: t('settings.crew.voice'), items: crewItems(),
      value: input.getSettings().crewVoice, layout: 'list', text: pickerText(),
      onChoose: (item) => {
        if (!isCrewVoiceSetting(item.id)) return;
        input.setSetting('crewVoice', item.id);
        emitVolumes();
        emit('ui:click', {});
      } });
    tabMenus.push(crewMenu);
    // Let the menu's trigger handle keys first, then contain Tab and prevent
    // game shortcuts. The panel's capture listener yields this field below.
    crewField.addEventListener('keydown', event => {
      event.stopPropagation();
      containModalTab(event, root, requiredElement<HTMLButtonElement>(root, '.cot-set-close'));
    });
    // Flag assets are browser-only; retain the settings policy's Node import.
    void import('./flags.ts').then(({ flagIconUrl }) => { if (crewField.isConnected) crewMenu.setItems(crewItems(flagIconUrl)); })
      .catch(() => { /* the crew menu keeps its items without their flags */ });
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
    const mobile = getDeviceTier() === 'mobile';
    const choices: readonly ('auto' | PresetName)[] = mobile
      ? MOBILE_PRESET_ORDER
      : ['auto', ...PRESET_ORDER];
    const presetName = (name: 'auto' | PresetName): string => (name === 'auto'
      ? t('settings.preset.auto')
      : t(PRESET_LABEL_KEYS[name] || 'settings.preset.ultra'));
    const selected = stagedPreset ?? (mobile ? getMobilePresetChoice() : getStoredChoice());
    let chosen: string = selected;
    // a preset is applied when the panel closes (commitGraphics)
    const stage = (name: string): void => { stagedPreset = name; chosen = name; showPreview(name); };
    if (mobile) {
      // a phone's four presets on the segmented control
      mountSeg(row, segmented({ label: t('settings.graphics.label'), className: 'cot-set-quality', value: selected,
        options: choices.map((name) => ({ value: name, label: presetName(name) })) }), () => chosen, stage);
    } else {
      // the desktop's six on the picker menu: the preset under the pointer or the focus shows its still below, and leaving
      // the menu returns it to the chosen one
      tabMenus.push(createPickerMenu(el('div', 'cot-set-menu', row), { id: 'settings-quality', label: t('settings.graphics.label'),
        items: choices.map((name) => ({ id: name, name: presetName(name) })), value: selected, layout: 'list', text: pickerText(),
        onPreview: (item) => showPreview(item?.id ?? chosen),
        onChoose: (item) => { stage(item.id); emit('ui:click', {}); } }));
    }
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

    // item 259 (the owner, 2026-10-26: "disable the thing that lets u see through greenery. it can be an optional thing u
    // can enable in settings"): the camera's foliage fades, off by default; the world takes the choice on its next frame
    const view = groupCard(body, t('settings.graphics.view'));
    const foliageRow = el('div', 'cot-set-row', view);
    settingLabel(foliageRow, t('settings.graphics.foliage'), SETTINGS_OPTION_ICONS.foliageSeeThrough);
    const foliageOn = (): 'on' | 'off' => (foliageSeeThrough.get() ? 'on' : 'off');
    mountSeg(foliageRow, segmented({ label: t('settings.graphics.foliage'), className: 'cot-set-onoff', value: foliageOn(),
      options: [{ value: 'off', label: t('settings.off') }, { value: 'on', label: t('settings.on') }] }),
      foliageOn, (value) => foliageSeeThrough.set(value === 'on'));

    // entry telemetry (2026-09-24): the anonymous load/crash beacon
    // (docs/ENTRY-RESILIENCE.md) is a player choice stored beside the presets.
    const diagnostics = groupCard(body, t('settings.diagnostics.title'));
    const diagRow = el('div', 'cot-set-row', diagnostics);
    settingLabel(diagRow, t('settings.diagnostics.telemetry'), SETTINGS_OPTION_ICONS.showDebugHud);
    const diagStorage = (): Storage | null => { try { return window.localStorage; } catch (_) { return null; } };
    const diagOn = (): 'on' | 'off' => (telemetryOptOutStored(diagStorage()) ? 'off' : 'on');
    mountSeg(diagRow, segmented({ label: t('settings.diagnostics.telemetry'), className: 'cot-set-onoff', value: diagOn(),
      options: [{ value: 'off', label: t('settings.off') }, { value: 'on', label: t('settings.on') }] }),
      diagOn, (value) => setTelemetryOptOut(value === 'off', diagStorage()));
    el('div', 'cot-set-note keep', diagnostics).textContent = t('settings.diagnostics.note');
  }

  // --- ACCESSIBILITY tab (brand-ui SPEC 12.1.6 and 14; the core is accessibilityPreferences.ts, BUI-S4 redesigns this)
  const A11Y_ICONS = {
    textScale: { id: 'zoomIn', tone: 'cyan' },
    hudScale: { id: 'autoAim', tone: 'amber' },
    colors: { id: 'team', tone: 'green' },
    highContrast: { id: 'graphics', tone: 'violet' },
    motion: { id: 'speed', tone: 'cyan' },
    shake: { id: 'toolPhoto', tone: 'amber' },
    flash: { id: 'lightbulb', tone: 'amber' },
    droneStatic: { id: 'modeDrone', tone: 'cyan' },
    rosters: { id: 'team', tone: 'cyan' },
  } as const satisfies Readonly<Record<string, SettingsIconSpec>>;

  /** One setting of two or three values bound to a preference, on the kit's segmented control. */
  function a11ySeg<T extends string>(
    parent: HTMLElement, label: string, icon: SettingsIconSpec,
    options: ReadonlyArray<readonly [T, string]>, current: () => T, choose: (value: T) => void,
  ): void {
    const row = el('div', 'cot-set-row', parent);
    settingLabel(row, label, icon);
    mountSeg(row, segmented({ label, className: 'cot-set-a11y', value: current(), options: options.map(([value, text]) => ({ value, label: text })) }),
      current, choose);
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
    // The colour presets on the picker menu: each by its own ally and enemy colours on the chevron and the diamond (the
    // custom pair as saved), and its name. The preset under the pointer or the focus wears its colours on the sample
    // above; leaving the menu returns the sample to the chosen one.
    const presetColours = (preset: ColorPreset): readonly [string, string] => {
      if (preset === 'custom') return [prefs().customOwn, prefs().customEnemy];
      const cvd = preset === 'default' ? {} : { cvd: preset };
      return [tokenValue('team-own', cvd), tokenValue('team-enemy', cvd)];
    };
    const presetItems = (): PickerItem[] => COLOR_PRESETS.map((preset) => ({
      id: preset, name: t(`settings.a11y.preset.${preset}`), chip: teamSwatch(...presetColours(preset)),
    }));
    const colorsRow = el('div', 'cot-set-row', vision);
    settingLabel(colorsRow, t('settings.a11y.colors'), A11Y_ICONS.colors);
    const colorsMenu = createPickerMenu(el('div', 'cot-set-menu', colorsRow), { id: 'settings-colour-preset', label: t('settings.a11y.colors'),
      items: presetItems(), value: prefs().colorPreset, layout: 'list', text: pickerText(),
      onPreview: (item) => {
        const colours = item ? presetColours(item.id as ColorPreset) : null;
        for (const [i, token] of (['--team-own', '--team-enemy'] as const).entries()) {
          if (colours) preview.style.setProperty(token, colours[i]); else preview.style.removeProperty(token);
        }
      },
      onChoose: (item) => { saveAccessibility({ colorPreset: item.id as ColorPreset }); syncCustom(); emit('ui:click', {}); } });
    tabMenus.push(colorsMenu);
    // Custom: own and enemy pickers; a pair under the colour-vision or contrast floors is refused (colorVision.ts).
    const customRow = el('div', 'cot-set-row', vision);
    settingLabel(customRow, t('settings.a11y.preset.custom'), { id: 'brush' });
    const custom = el('div', 'cot-a11y-custom', customRow);
    const shape = (side: string, entity: string): HTMLSpanElement => {
      const mark = el('span', `cot-a11y-shape ${side}`, custom);
      mark.setAttribute('aria-hidden', 'true');
      mark.innerHTML = entity;
      return mark;
    };
    const ownMark = shape('own', '&#9650;');
    const ownPick = el('input', 'cot-c-swatch', custom);
    ownPick.type = 'color';
    ownPick.setAttribute('aria-label', t('hud.team.ally'));
    const enemyMark = shape('enemy', '&#9670;');
    const enemyPick = el('input', 'cot-c-swatch', custom);
    // each shape wears its picker's colour, so a refused pair shows what was picked
    for (const [mark, pick] of [[ownMark, ownPick], [enemyMark, enemyPick]] as const) {
      for (const type of ['input', 'change']) pick.addEventListener(type, () => mark.style.setProperty('color', pick.value));
    }
    enemyPick.type = 'color';
    enemyPick.setAttribute('aria-label', t('hud.team.enemies'));
    // a refused pair: the kit's inline error notice, its text set when it shows
    customRow.insertAdjacentHTML('beforeend', notice({ severity: 'error', text: '', className: 'cot-c-notice--inline cot-set-refused' }));
    const refused = customRow.lastElementChild as HTMLDivElement;
    const refusedText = requiredElement<HTMLSpanElement>(refused, '.cot-c-notice__text');
    const syncCustom = (): void => {
      ownPick.value = prefs().customOwn;
      for (const mark of [ownMark, enemyMark]) mark.style.removeProperty('color'); // the saved pair: the team tokens again
      enemyPick.value = prefs().customEnemy;
      customRow.hidden = prefs().colorPreset !== 'custom';
      refused.hidden = true;
      for (const pick of [ownPick, enemyPick]) pick.removeAttribute('aria-invalid');
    };
    const tryCustom = (): void => {
      const check = setCustomTeamColours(ownPick.value, enemyPick.value);
      if (check.ok) {
        syncCustom();
        colorsMenu.setItems(presetItems());
        return;
      }
      refused.hidden = false;
      refusedText.textContent = t('settings.a11y.refused');
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
      [['system', t('settings.a11y.system')], ['full', t('settings.off')], ['reduce', t('settings.on')]],
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
    // item 259 (bar line 13: one datum, one place): the RMB action's hold or toggle is its Right click mode on Controls;
    // this row takes the player there (a mouse's choice: touch has neither)
    if (!(input.isTouchLayout && input.isTouchLayout())) {
      const rmbLink = el('div', 'cot-set-row', holds);
      settingLabel(rmbLink, t('action.freeCamera'), SETTINGS_ACTION_ICONS.freeCamera);
      const go = el('button', 'cot-set-link cot-c-btn cot-c-btn--36 cot-c-btn--secondary', rmbLink);
      go.type = 'button';
      el('span', '', go).textContent = t('settings.tab.controls');
      go.insertAdjacentHTML('beforeend', uiIconSVG('chevronRight', 16));
      go.addEventListener('click', () => {
        activeTab = 'controls';
        renderTab();
        const mode = body.querySelector<HTMLElement>('#cot-set-rmb-mode');
        mode?.scrollIntoView({ block: 'center' });
        mode?.querySelector<HTMLElement>('.cot-c-seg__opt[aria-checked="true"]')?.focus();
        emit('ui:click', {});
      });
    }
  }

  // --- LANGUAGE tab -----------------------------------------------------------
  function renderLanguage() {
    body.textContent = '';
    const langCard = groupCard(body, t('settings.language.card'));
    const langRow = el('div', 'cot-set-row', langCard);
    settingLabel(langRow, t('settings.language.label'), { id: 'globe' });
    mountSeg(langRow, segmented({ label: t('settings.language.label'), className: 'cot-set-lang', value: getLocale(),
      options: getSupportedLocales().map((locale) => ({ value: locale, label: t('settings.language.' + (locale === 'zh-CN' ? 'zh' : 'en')) })) }),
      () => getLocale(), (locale) => {
        setLocale(locale);
        // Most screens are constructed once and own translated DOM. Reloading
        // is the only atomic way to avoid a mixed-language Garage or battle.
        window.location.assign(currentLocationHrefForLocale(window.location, locale));
      });
    const langNote = el('div', 'cot-set-note', langCard);
    langNote.textContent = t('settings.language.note');
  }

  function renderTab() {
    for (const menu of tabMenus.splice(0)) menu.dispose();
    cancelCapture();
    clearConflict();
    for (const t of root.querySelectorAll<HTMLButtonElement>('.cot-set-tab')) {
      const on = t.dataset.tab === activeTab;
      t.classList.toggle('sel', on);
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on) root.querySelector('.cot-set-body')?.setAttribute('aria-labelledby', t.id);
    }
    body.dataset.settingsTone = activeTab; // item 259: the tab's colour on its rows' glyphs and headings' rules
    resetBtn.hidden = !(activeTab === 'controls' || activeTab === 'graphics' || activeTab === 'sound' || activeTab === 'accessibility');
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
        const button = el('button', 'cot-set-info cot-c-btn cot-c-btn--icon cot-c-btn--ghost', group) as HTMLButtonElement;
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
      ? (() => { const l = input.padLabelFor(c.code); return l === '—' ? t('settings.bind.unbound') : l; })()
      : (() => { const l = input.labelFor(c.code); return l === '—' ? t('settings.bind.unbound') : l; })();
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

  requiredElement<HTMLButtonElement>(conflictBar, '[data-conflict="swap"]').addEventListener('click', () => {
    if (!conflict) return;
    if (conflict.pad) input.swapPadBindings(conflict.actionId, conflict.otherId, conflict.code);
    else input.swapBindings(conflict.actionId, conflict.slot, conflict.otherId, conflict.otherSlot, conflict.code);
    clearConflict();
    bindingsMutated();
  });
  requiredElement<HTMLButtonElement>(conflictBar, '[data-conflict="cancel"]').addEventListener('click', () => {
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
    // A kit control keeps its own keys: a picker menu's popover (in the body) every key, a segmented control's and a
    // menu trigger's arrows, Home and End, the crew voice's field all but Escape. The panel's bubble listener (and the
    // crew field's) keeps them from the game behind us.
    if (e.target instanceof Element && (e.target.closest('.cot-c-menu__pop')
        || (/^(Arrow(Left|Right|Up|Down)|Home|End)$/.test(e.key) && e.target.closest('.cot-c-seg, .cot-c-menu__trigger'))
        || (e.target.closest('.cot-set-crew-field') && e.code !== 'Escape'))) return;
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

  // a transient surface (components/surfaceStack.ts), modal: opening it closes whatever the page has open (a picker, a menu),
  // its own menus stand on it, and Escape is the stack's, which closes the top one; a key being bound or a conflict to
  // clear keeps its Escape (onPanelKey)
  const surface: TransientSurface = {
    id: 'settings',
    element: () => root.querySelector('.cot-set-panel'),
    close: () => api.close(),
    modal: true,
    keepsEscape: () => !!capture || !!conflict,
  };
  function openPanel() {
    if (open) return;
    open = true;
    openSurface(surface);
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
    leaveBtn.hidden = !canLeave;
    root.classList.add('open');
    requiredElement<HTMLElement>(root, '.cot-set-panel').focus({ preventScroll: true });
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
    for (const menu of tabMenus) menu.close();
    if (o && o.noRelock) relockOnClose = false;
    cancelCapture();
    clearConflict();
    open = false;
    closeSurface(surface);
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
      foliageSeeThrough.set(false);
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
  // the strip is a tab list: arrows, Home and End move between the tabs (the kit's roving keys press each, so the click
  // below switches)
  const tabStrip = root.querySelector<HTMLElement>('.cot-set-tabs');
  if (tabStrip) wireRovingKeys(tabStrip);
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
    bus.on('ui:consumableLoadout', adoptConsumableLoadout); // item 259: the slots show the chosen tank's items
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
    // (a cap in Chinese (左键) at the labels' size in the plain face: at the Latin caps' 11 px figures 键 smeared at 1x,
    // gauntlet r12)
    const kbds = actionIds
      .map((action) => {
        const cap = bindLabel(action);
        return `<kbd class="cot-c-kbd${CJK_CAP.test(cap) ? ' cjk' : ''}" data-key-cap="${action}">${cap}</kbd>`;
      })
      .join('');
    return `<span class="hg" data-group="${id}"><span class="hk">${kbds}</span><span>${label}</span></span>`;
  }
  /** A rebind while the strip shows (mid-battle from the pause menu): its caps name the new keys. */
  function refreshHintCaps(): void {
    for (const kbd of hints.querySelectorAll<HTMLElement>('kbd[data-key-cap]')) {
      const cap = bindLabel(kbd.dataset.keyCap as ActionId);
      if (kbd.textContent !== cap) kbd.textContent = cap;
      kbd.classList.toggle('cjk', CJK_CAP.test(cap));
    }
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

  // Let the audio graph sync its channel levels (the graph also reads cot.settings.v1 directly at build time — this
  // covers a graph that already exists).
  emitVolumes();
  emitPerfMeter(); // HUD net readout follows the persisted preference (default on)
  emitDirectionalHitValues(); // exact incoming values are persisted and default off

  return api;
}
