// src/game/input.ts — rebindable action-map input layer.
//
// Raw KeyboardEvent.code / mouse-button / mouse-wheel / gamepad events are
// translated into named game actions ("forward", "fire", ...). Every action
// has a primary and a secondary keyboard/mouse binding plus an optional
// gamepad-button binding; all three persist to localStorage and are editable
// at runtime (settings panel). Key state is a Set of codes, so simultaneous
// keys never ghost each other. The layer also owns pointer-lock helpers —
// including the CURSOR-AIM FALLBACK for environments that deny pointer lock
// (isCursorAim/getCursorNdc/onLockDenied: sandboxed iframes and embedded
// panes aim with the real cursor instead; battle input never requires the
// lock) —
// gameplay feel settings (mouse sensitivity / invert-Y / sniper sensitivity /
// aim smoothing / pad sensitivity / sound mix, cot.settings.v1) and a
// smoothed, sensitivity-scaled mouse-delta accumulator consumed once per
// render frame. The `fire` action is special-cased: a click is a buffered
// press edge (one shot), and HOLDING the control is full-auto — the gun
// refires whenever the reload completes (see FIRE_PRESS_BUFFER_MS).
//
// Gamepad model (standard mapping): left stick drives (throttle/steer are
// synthesized as held forward/back/left/right actions past a deadzone),
// right stick aims (merged into consumeMouseDelta with its own sensitivity
// and a squared response curve), buttons map to the same action ids as keys.
// The mobile HUD feeds the same layer through the virtual-control methods at
// the bottom of the public API; it never writes directly into simulation state.

const BINDINGS_KEY = 'cot.bindings.v1'; // primary keyboard/mouse map (v1 compatible)
const BINDINGS2_KEY = 'cot.bindings2.v1'; // secondary keyboard/mouse map
const BINDINGS_LAYOUT_KEY = 'cot.bindings.layout.v3'; // Shift aim + Caps free-look migration receipt
const PAD_KEY = 'cot.padBindings.v1'; // gamepad button map (standard-mapping indices)
const SETTINGS_KEY = 'cot.settings.v1';

// Aim smoothing: the EMA time constant is player-tunable (0 = raw 1:1 deltas).
// settings.aimSmoothing 0..1 maps linearly to 0..MAX_SMOOTH_TAU_S; the default
// 0.5 reproduces the classic 28 ms feel.
const MAX_SMOOTH_TAU_S = 0.056;

const PAD_DEADZONE = 0.18; // stick deadzone (raw axis units)
const PAD_MOVE_THRESHOLD = 0.35; // stick deflection that counts as a held move action
const PAD_AIM_RATE = 760; // mouse-pixel-equivalents per second at full stick deflection
const PAD_TRIGGER_THRESHOLD = 0.5; // analog trigger "pressed" level
const PAD_ACTIVE_WINDOW_MS = 4000; // recent-activity window for padActive()
const PAD_MAX_BUTTONS = 17;

/** Every rebindable action, grouped for the settings panel. */
const ACTION_DEFS = [
  { id: 'forward', label: 'Move Forward', group: 'Movement' },
  { id: 'back', label: 'Move Back', group: 'Movement' },
  { id: 'left', label: 'Steer Left', group: 'Movement' },
  { id: 'right', label: 'Steer Right', group: 'Movement' },
  { id: 'handbrake', label: 'Handbrake', group: 'Movement' },
  { id: 'fire', label: 'Fire Gun', group: 'Combat' },
  { id: 'sniperToggle', label: 'Sniper Mode', group: 'Combat' },
  { id: 'shell1', label: 'Shell Slot 1', group: 'Combat' },
  { id: 'shell2', label: 'Shell Slot 2', group: 'Combat' },
  { id: 'shell3', label: 'Shell Slot 3', group: 'Combat' },
  { id: 'specialAction', label: 'Special Action', group: 'Combat' },
  { id: 'reloadMagazine', label: 'Reload Magazine', group: 'Combat' },
  { id: 'consumable1', label: 'Repair Kit', group: 'Consumables' },
  { id: 'consumable2', label: 'First Aid Kit', group: 'Consumables' },
  { id: 'consumable3', label: 'Fire Extinguisher', group: 'Consumables' },
  { id: 'freeLook', label: 'Free Look (Hold)', group: 'Camera' },
  // gunnery r1: RMB's FUNCTION is picked by settings.rmbMode (hold-to-aim /
  // toggle-aim / free-look classic); this action owns the physical binding.
  { id: 'freeCamera', label: 'Aim / Free Look (RMB)', group: 'Camera' },
  { id: 'zoomIn', label: 'Zoom In', group: 'Camera' },
  { id: 'zoomOut', label: 'Zoom Out', group: 'Camera' },
  { id: 'minimapZoom', label: 'Minimap Zoom', group: 'Interface' },
  { id: 'shotLog', label: 'Shot Info Log', group: 'Interface' }, // SHOT-INFO (shotInfo.js)
  { id: 'perfHud', label: 'Performance Overlay', group: 'Interface' }, // FEEL r12 (perfHud.ts)
  { id: 'settingsMenu', label: 'Settings Menu', group: 'Interface' },
] as const;

export type ActionId = (typeof ACTION_DEFS)[number]['id'];
export type BindingSlot = 0 | 1;
export type AiDifficulty = 'easy' | 'normal' | 'hard';
export type RmbMode = 'hold' | 'toggle' | 'freelook';

export interface InputVector {
  x: number;
  y: number;
}

export interface InputSettings {
  sensitivity: number;
  invertY: boolean;
  sniperSensScale: number;
  aimSmoothing: number;
  padSensitivity: number;
  rmbMode: RmbMode;
  aiDifficulty: AiDifficulty;
  showPerfMeter: boolean;
  showDebugHud: boolean;
  armorAimOverlay: boolean;
  volMaster: number;
  volEngine: number;
  volCombat: number;
  volAmbience: number;
  volUi: number;
  volVoice: number;
  alarmHeartbeat: boolean;
}

type BindingMap = Record<ActionId, string | null>;
type PadBindingMap = Record<ActionId, number | null>;
type InputState = Record<ActionId, boolean>;
type ActionHandler = (code: string) => void;
type VolumeSettingKey =
  | 'volMaster'
  | 'volEngine'
  | 'volCombat'
  | 'volAmbience'
  | 'volUi'
  | 'volVoice';

export interface InputLayer {
  readonly actionDefs: typeof ACTION_DEFS;
  labelFor(code: string | null): string;
  padLabelFor(index: number | null): string;
  getState(): InputState;
  isDown(actionId: ActionId): boolean;
  onAction(actionId: ActionId, callback: ActionHandler): () => void;
  getBindings(slot?: BindingSlot): BindingMap;
  getBinding(actionId: ActionId, slot?: BindingSlot): string | null;
  findConflict(
    code: string,
    excludeId: ActionId | null,
    excludeSlot?: BindingSlot,
  ): { actionId: ActionId; slot: BindingSlot } | null;
  setBinding(actionId: ActionId, code: string | null, slot?: BindingSlot): void;
  swapBindings(
    actionId: ActionId,
    slot: BindingSlot,
    otherId: ActionId,
    otherSlot: BindingSlot,
    code: string,
  ): void;
  getPadBinding(actionId: ActionId): number | null;
  findPadConflict(index: number | null, excludeId: ActionId): { actionId: ActionId } | null;
  setPadBinding(actionId: ActionId, index: number | null): void;
  swapPadBindings(actionId: ActionId, otherId: ActionId, index: number | null): void;
  resetBindings(): void;
  isPadConnected(): boolean;
  padActive(): boolean;
  getPadMove(out: InputVector): InputVector;
  setVirtualMove(x: number, y: number): void;
  getVirtualMove(out: InputVector): boolean;
  addVirtualAim(dx: number, dy: number): void;
  pressVirtual(actionId: ActionId): void;
  releaseVirtual(actionId: ActionId): void;
  tapVirtual(actionId: ActionId): void;
  virtualActive(): boolean;
  isTouchLayout(): boolean;
  getSettings(): InputSettings;
  setSetting(key: keyof InputSettings, value: unknown): void;
  consumeMouseDelta(out: InputVector, dt: number, sniper?: boolean): InputVector;
  setEnabled(enabled: boolean): void;
  isLocked(): boolean;
  requestLock(): void;
  isCursorAim(): boolean;
  onLockDenied(callback: () => void): () => void;
  onLockRestored(callback: () => void): () => void;
  getCursorNdc(out: InputVector): InputVector;
  releaseLock(): void;
}

/** Default primary bindings: WASD move, LMB fire, Shift sniper, Caps free look, RMB aim,
 *  1/2/3 shells, E special action, 4/5/6 consumables, wheel zoom,
 *  Space handbrake, Esc menu.
 *  Shift toggles sniper mode. Caps Lock is the always-available gun-lock /
 *  free-look hold: it moves the camera without rotating the turret or hull.
 *  Default RMB hold, wheel-in, controller LT, and the mobile scope control
 *  also enter sniper. RMB keeps the context-sensitive `freeCamera` binding slot
 *  (`hold`, `toggle`, or `freelook` via settings.rmbMode).
 *  Mouse buttons are encoded as synthetic codes "Mouse0".."Mouse4"; the wheel
 *  as "WheelUp"/"WheelDown". `null` means unbound. */
export const DEFAULT_BINDINGS: Partial<Record<ActionId, string>> = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  handbrake: 'Space',
  fire: 'Mouse0',
  sniperToggle: 'ShiftLeft',
  shell1: 'Digit1',
  shell2: 'Digit2',
  shell3: 'Digit3',
  specialAction: 'KeyE',
  reloadMagazine: 'KeyC',
  consumable1: 'Digit4',
  consumable2: 'Digit5',
  consumable3: 'Digit6',
  freeLook: 'CapsLock',
  freeCamera: 'Mouse2',
  zoomIn: 'WheelUp',
  zoomOut: 'WheelDown',
  minimapZoom: 'KeyM',
  shotLog: 'KeyL', // SHOT-INFO: toggle the shot-info / received-damage log
  perfHud: 'F8', // FEEL r12: fps / frame-time / stall overlay
  settingsMenu: 'Escape',
};

/** Default secondary bindings: arrow keys as alternate movement (WoT staple). */
const DEFAULT_BINDINGS2: Partial<Record<ActionId, string>> = {
  forward: 'ArrowUp',
  back: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  freeLook: 'AltLeft',
};

/** Default gamepad buttons (standard mapping): RT fire, LT sniper, A handbrake,
 *  LB special action, RB dedicated free-look, d-pad shells, BACK minimap, START menu. Sticks are fixed:
 *  left = drive, right = aim. */
const DEFAULT_PAD_BINDINGS: Partial<Record<ActionId, number>> = {
  fire: 7, // RT
  sniperToggle: 6, // LT
  handbrake: 0, // A
  freeLook: 5, // RB
  shell1: 12, // D-UP
  shell2: 14, // D-LEFT
  shell3: 15, // D-RIGHT
  specialAction: 4, // LB
  reloadMagazine: 13, // D-DOWN
  consumable1: 2, // X
  consumable2: 3, // Y
  consumable3: 1, // B
  minimapZoom: 8, // BACK
  settingsMenu: 9, // START
};

const PAD_BUTTON_LABELS = [
  'A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'BACK', 'START',
  'LS', 'RS', 'D-UP', 'D-DOWN', 'D-LEFT', 'D-RIGHT', 'GUIDE',
];

const DEFAULT_SETTINGS: InputSettings = {
  sensitivity: 1, // 0.2x .. 3x multiplier on mouse aim
  invertY: false,
  sniperSensScale: 1, // extra multiplier while in sniper mode (0.2x .. 3x)
  aimSmoothing: 0.5, // 0 = raw 1:1 deltas, 1 = heavy (56 ms EMA); 0.5 = classic 28 ms
  padSensitivity: 1, // 0.2x .. 3x multiplier on right-stick aim
  // gunnery r1 (owner): what the RMB-bound 'freeCamera' action DOES —
  // 'hold' = hold-to-aim (enter sniper while held, release restores the
  // prior arcade zoom + preserved aim pitch; the owner-mandated default),
  // 'toggle' = tap toggles sniper, 'freelook' = classic WoT
  // gun-lock free look. Routed per frame by main.ts; cameraRig owns the
  // hold/exit semantics (CamInput.aimHold).
  rmbMode: 'hold',
  aiDifficulty: 'normal', // bot tier for the NEXT battle: 'easy'|'normal'|'hard'
  // FPS/ping readout (hud.js cot-net top-right element). It is useful live
  // connection/performance feedback, so new profiles start with it enabled;
  // the Interface switch remains available as an explicit opt-out.
  showPerfMeter: true,
  // The engineering dashboard is intentionally off for players and lazy-
  // loads only after an explicit Interface toggle or F8 press.
  showDebugHud: false,
  // Scoped armor flashlight (official WoT/Blitz convention): new profiles
  // start with the shot-dependent red/amber/green surface overlay enabled;
  // players can opt out in Gameplay → Interface.
  armorAimOverlay: true,
  // Sound mix (settings panel SOUND tab). The synth audio stack
  // (src/audio/audio.js) reads these at graph build and live-follows the
  // 'ui:volumes' bus event the panel emits on every slider change.
  volMaster: 0.8, // final output gain 0..1
  volEngine: 1, // engine loops
  volCombat: 1, // gunfire / impacts / explosions
  volAmbience: 1, // wind + birds bed / garage workshop room tone
  volUi: 1, // UI clicks + garage stings / battle horn / result fanfares
  volVoice: 1, // crew radio voice lines + tank alarms (SOUND overhaul)
  // Critical-HP heartbeat alarm (short pulse window per threshold crossing).
  // Optional per the sound-system spec; some players find HP alarms stressful.
  alarmHeartbeat: true,
};

const VOLUME_KEYS: readonly VolumeSettingKey[] = [
  'volMaster', 'volEngine', 'volCombat', 'volAmbience', 'volUi', 'volVoice',
];

// Fire semantics (full-auto rework — owner order): a CLICK is a press edge
// good for one shot; a HELD control is full-auto — getState() keeps
// reporting fire while the hold lasts, so the gun refires the instant each
// reload completes (autocannon IFVs stream their 0.4-0.5 s bursts; an MBT
// held down refires on seat). The edge/hold is only honored when the press
// could legitimately fire (pointer locked, a gamepad pull, a touch fire
// button, or — in cursor-aim mode — a press on the game canvas itself):
// fireHoldLegit latches WITH the edge and dies with the release, so a mouse
// button held down from a garage/menu click can never walk into a battle
// firing.
//
// r2 CRITICAL FIX (41.7% click-to-fire): the edge is NOT consumed by a
// getState() read. The render loop samples getState() once per rAF and
// overwrites player input.fire each frame, but the fixed-step sim may run
// ZERO steps on any given rAF (whenever rAF outpaces the 60 Hz sim — every
// 120/144 Hz display). A read-consumed edge raised on a zero-step frame was
// erased by the next frame's read before tryFire ever sampled it, silently
// dropping ~half of all clicks. The latch now stays hot for the full buffer
// window so at least one sim step is guaranteed to see it (worst-case rAF
// gap is orders of magnitude under 250 ms). Reload times (>> 250 ms for
// every gun in the roster) make a double fire from one click impossible:
// the shot that consumes the window starts a multi-second reload, and
// tryFire refuses while reload.t > 0.
const FIRE_PRESS_BUFFER_MS = 250;

const AI_DIFFICULTIES: readonly AiDifficulty[] = ['easy', 'normal', 'hard'];
const RMB_MODES: readonly RmbMode[] = ['hold', 'toggle', 'freelook']; // gunnery r1: see rmbMode

/**
 * AI difficulty persisted with the other gameplay settings (cot.settings.v1,
 * editable in the settings panel's GAMEPLAY tab). Pure localStorage read — no
 * input instance needed, so game/state.js can call it at battle setup.
 * @returns {'easy'|'normal'|'hard'}
 */
export function getStoredDifficulty() {
  const s = loadJson(SETTINGS_KEY);
  const d = isRecord(s) ? s.aiDifficulty : null;
  return typeof d === 'string' && isAiDifficulty(d) ? d : 'normal';
}

const LABEL_SPECIAL: Record<string, string> = {
  Space: 'SPACE', Escape: 'ESC', Tab: 'TAB', CapsLock: 'CAPS',
  Enter: 'ENTER', NumpadEnter: 'NUM ENTER', Backspace: 'BKSP',
  ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT',
  ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL',
  AltLeft: 'L-ALT', AltRight: 'R-ALT',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB', Mouse3: 'MB4', Mouse4: 'MB5',
  WheelUp: 'WHEEL ↑', WheelDown: 'WHEEL ↓',
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
};

/**
 * Short human label for a KeyboardEvent.code or synthetic MouseN/Wheel code.
 * `null`/empty (unbound) renders as an em-dash.
 * @param {?string} code
 * @returns {string}
 */
function labelForCode(code: string | null) {
  if (!code) return '—';
  if (LABEL_SPECIAL[code]) return LABEL_SPECIAL[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `NUM ${code.slice(6)}`;
  return code.toUpperCase();
}

/**
 * Short human label for a gamepad button index (standard mapping).
 * @param {?number} index
 * @returns {string}
 */
function labelForPadButton(index: number | null) {
  if (index == null || index < 0) return '—';
  return PAD_BUTTON_LABELS[index] || `PAD ${index}`;
}

function loadJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed;
  } catch (_) { return null; }
}

function saveJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* private mode */ }
}

const clamp = (value: number, low: number, high: number) => (
  Math.max(low, Math.min(high, value))
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAiDifficulty(value: string): value is AiDifficulty {
  return (AI_DIFFICULTIES as readonly string[]).includes(value);
}

function isRmbMode(value: string): value is RmbMode {
  return (RMB_MODES as readonly string[]).includes(value);
}

/** Squared response curve past the deadzone — fine aim near center. */
function stickCurve(v: number) {
  const m = Math.abs(v);
  if (m <= PAD_DEADZONE) return 0;
  const n = (m - PAD_DEADZONE) / (1 - PAD_DEADZONE);
  return Math.sign(v) * n * n;
}

/**
 * Upgrade either former default keyboard layout without overwriting intentional
 * custom bindings. Shift returns to sniper toggle and Caps Lock becomes the
 * dedicated hold-to-free-look key. Left Alt remains the secondary free-look
 * key when that slot is free.
 *
 * @param {Record<string, string|null>} primary
 * @param {Record<string, string|null>} secondary
 * @returns {boolean} whether either map changed
 */
export function migrateShiftAimCapsFreeLookBindings(
  primary: Record<string, unknown>,
  secondary: Record<string, unknown>,
) {
  if (!primary || typeof primary !== 'object' ||
      !secondary || typeof secondary !== 'object') return false;

  let changed = false;
  const has = (map: Record<string, unknown>, actionId: string) => (
    Object.prototype.hasOwnProperty.call(map, actionId)
  );
  const ownsOutsideCameraLayout = (code: string) => [primary, secondary].some((map) =>
    Object.entries(map).some(([actionId, binding]) =>
      actionId !== 'sniperToggle' && actionId !== 'freeLook' && binding === code));
  const ownsOutsideFreeLook = (code: string) => [primary, secondary].some((map) =>
    Object.entries(map).some(([actionId, binding]) => actionId !== 'freeLook' && binding === code));
  const shiftFreeLookDefaults = primary.freeLook === 'ShiftLeft' &&
    (!has(primary, 'sniperToggle') || primary.sniperToggle == null);
  const legacyShiftAimDefaults = primary.sniperToggle === 'ShiftLeft' &&
    (!has(primary, 'freeLook') || primary.freeLook === 'AltLeft');

  if ((shiftFreeLookDefaults || legacyShiftAimDefaults) &&
      !ownsOutsideCameraLayout('ShiftLeft') &&
      !ownsOutsideCameraLayout('CapsLock')) {
    primary.sniperToggle = 'ShiftLeft';
    primary.freeLook = 'CapsLock';
    changed = true;
    if (!ownsOutsideFreeLook('AltLeft') &&
        (!has(secondary, 'freeLook') || secondary.freeLook == null)) {
      secondary.freeLook = 'AltLeft';
    }
  }
  return changed;
}

/**
 * Create the input layer.
 * @param {{lockElement?: HTMLElement}} [opts] - lockElement: canvas that owns pointer lock.
 * @returns {InputLayer}
 */
export function createInput(opts: { lockElement?: HTMLElement | null } = {}): InputLayer {
  const lockElement = opts.lockElement ?? null;

  // --- bindings (primary + secondary + pad) ----------------------------------
  // maps[0] = primary (BINDINGS_KEY, v1-compatible), maps[1] = secondary.
  const maps: [BindingMap, BindingMap] = [
    {} as BindingMap,
    {} as BindingMap,
  ];
  for (const def of ACTION_DEFS) {
    maps[0][def.id] = DEFAULT_BINDINGS[def.id] ?? null;
    maps[1][def.id] = DEFAULT_BINDINGS2[def.id] ?? null;
  }
  const storedMaps: unknown[] = [loadJson(BINDINGS_KEY), loadJson(BINDINGS2_KEY)];
  // Existing players commonly have a full copy of the previous defaults in
  // localStorage, so changing DEFAULT_BINDINGS alone would leave Shift on free
  // look. Migrate only recognized default shapes and preserve custom layouts.
  if (loadJson(BINDINGS_LAYOUT_KEY) !== 3 && isRecord(storedMaps[0])) {
    if (!isRecord(storedMaps[1])) storedMaps[1] = {};
    const primary = storedMaps[0];
    const secondary = storedMaps[1];
    if (isRecord(secondary) && migrateShiftAimCapsFreeLookBindings(primary, secondary)) {
      saveJson(BINDINGS_KEY, primary);
      saveJson(BINDINGS2_KEY, secondary);
    }
  }
  saveJson(BINDINGS_LAYOUT_KEY, 3);
  for (let s = 0; s < 2; s++) {
    const stored = storedMaps[s];
    if (isRecord(stored)) {
      for (const def of ACTION_DEFS) {
        const v = stored[def.id];
        if (typeof v === 'string' && v) maps[s][def.id] = v;
        else if (v === null) maps[s][def.id] = null; // explicitly cleared by the player
      }
    }
  }
  // Sanitize: a physical code may own at most one (action, slot). Older saves
  // can collide with newly-added defaults (e.g. Digit4 now = Repair Kit) — the
  // earlier definition wins, the later slot is cleared.
  {
    const used = new Set();
    for (let s = 0; s < 2; s++) {
      for (const def of ACTION_DEFS) {
        const code = maps[s][def.id];
        if (!code) continue;
        if (used.has(code)) maps[s][def.id] = null;
        else used.add(code);
      }
    }
  }

  const padBindings = {} as PadBindingMap;
  for (const def of ACTION_DEFS) {
    padBindings[def.id] = DEFAULT_PAD_BINDINGS[def.id] ?? null;
  }
  const storedPad = loadJson(PAD_KEY);
  if (isRecord(storedPad)) {
    for (const def of ACTION_DEFS) {
      const v = storedPad[def.id];
      if (typeof v === 'number' && v >= 0 && v < PAD_MAX_BUTTONS) padBindings[def.id] = v;
      else if (v === null && Object.prototype.hasOwnProperty.call(storedPad, def.id)) padBindings[def.id] = null;
    }
  }
  // Adding the dedicated free-look action moves the default RB assignment
  // away from the older context-sensitive RMB action. Old saves can contain
  // that prior RB value, so apply the same first-owner dedupe as keyboard
  // bindings; `freeLook` appears first and keeps the physical button.
  {
    const used = new Set();
    for (const def of ACTION_DEFS) {
      const button = padBindings[def.id];
      if (button == null) continue;
      if (used.has(button)) padBindings[def.id] = null;
      else used.add(button);
    }
  }

  let codeToAction = new Map<string, ActionId>(); // code -> actionId (both keyboard slots)
  let padButtonToAction = new Map<number, ActionId>(); // button index -> actionId
  function rebuildLookup() {
    codeToAction = new Map<string, ActionId>();
    for (let s = 0; s < 2; s++) {
      for (const def of ACTION_DEFS) {
        const code = maps[s][def.id];
        if (code && !codeToAction.has(code)) codeToAction.set(code, def.id);
      }
    }
    padButtonToAction = new Map<number, ActionId>();
    for (const def of ACTION_DEFS) {
      const b = padBindings[def.id];
      if (b != null && !padButtonToAction.has(b)) padButtonToAction.set(b, def.id);
    }
  }
  rebuildLookup();

  function persistMaps(slot: BindingSlot) {
    saveJson(slot === 0 ? BINDINGS_KEY : BINDINGS2_KEY, maps[slot]);
  }

  // --- gameplay settings -------------------------------------------------------
  const settings: InputSettings = { ...DEFAULT_SETTINGS };
  const storedSettings = loadJson(SETTINGS_KEY);
  if (isRecord(storedSettings)) {
    if (typeof storedSettings.sensitivity === 'number') settings.sensitivity = clamp(storedSettings.sensitivity, 0.2, 3);
    if (typeof storedSettings.invertY === 'boolean') settings.invertY = storedSettings.invertY;
    if (typeof storedSettings.sniperSensScale === 'number') settings.sniperSensScale = clamp(storedSettings.sniperSensScale, 0.2, 3);
    if (typeof storedSettings.aimSmoothing === 'number') settings.aimSmoothing = clamp(storedSettings.aimSmoothing, 0, 1);
    if (typeof storedSettings.padSensitivity === 'number') settings.padSensitivity = clamp(storedSettings.padSensitivity, 0.2, 3);
    if (typeof storedSettings.aiDifficulty === 'string' && isAiDifficulty(storedSettings.aiDifficulty)) {
      settings.aiDifficulty = storedSettings.aiDifficulty;
    }
    if (typeof storedSettings.rmbMode === 'string' && isRmbMode(storedSettings.rmbMode)) {
      settings.rmbMode = storedSettings.rmbMode;
    }
    if (typeof storedSettings.showPerfMeter === 'boolean') settings.showPerfMeter = storedSettings.showPerfMeter;
    if (typeof storedSettings.showDebugHud === 'boolean') settings.showDebugHud = storedSettings.showDebugHud;
    if (typeof storedSettings.armorAimOverlay === 'boolean') settings.armorAimOverlay = storedSettings.armorAimOverlay;
    if (typeof storedSettings.alarmHeartbeat === 'boolean') settings.alarmHeartbeat = storedSettings.alarmHeartbeat;
    for (const k of VOLUME_KEYS) {
      if (typeof storedSettings[k] === 'number') settings[k] = clamp(storedSettings[k], 0, 1);
    }
  }

  // --- live state ----------------------------------------------------------------
  const down = new Set<string>(); // active codes — Set semantics kill key-ghosting
  const actionHandlers = new Map<ActionId, Set<ActionHandler>>(); // actionId -> Set<cb(code)>
  // Sub-frame tap latch (gameplay_feel r1): isDown() samples a LEVEL once per
  // render frame, so a physical press+release that both land between two
  // frames (fast keyboard tap at low fps; puppeteer keyboard.press) used to
  // vanish — toggle actions randomly ate quick taps. Every press edge
  // latches its actionId here; isDown() consumes the latch and reports the
  // action down for that one query even though the key is already up. Held
  // keys behave exactly as before (the latch is just cleared on first read).
  const pressLatch = new Set<ActionId>();
  const virtualHeld = new Set<ActionId>(); // touch HUD buttons held this frame
  const virtualMove = { x: 0, y: 0 }; // x right, y forward, both -1..1
  let virtualMoveActive = false;
  let virtualLastActiveMs = -Infinity;
  const state = {} as InputState;
  for (const def of ACTION_DEFS) state[def.id] = false;
  let enabled = true;
  let rawDX = 0;
  let rawDY = 0;
  let smDX = 0;
  let smDY = 0;
  let firePressMs = -Infinity; // last legitimate fire press edge (see FIRE_PRESS_BUFFER_MS)
  let fireHoldLegit = false;   // current fire hold began as a legitimate press (full-auto gate)

  // CURSOR-AIM FALLBACK: pointer lock is unavailable in some embeds (sandboxed
  // iframes / embedded panes — requestPointerLock throws a synchronous
  // SecurityError, rejects its promise, or fires 'pointerlockerror'). Latch the
  // denial and expose it: main.ts switches the turret to cursor aim (raycast
  // through the real cursor position) and the fire gate below accepts clicks
  // landing on the game canvas. The latch clears the moment a lock actually
  // engages, so lock-capable browsers are never degraded.
  //
  // lock_retry r1 (owner: "one denial latched cursor-aim for the session"):
  // Chrome denies re-locks for ~1.3 s after an Esc exit, so the settings
  // RESUME click's in-gesture re-lock was routinely denied ONCE and the whole
  // session fell back to cursor aim. The latch is now DURABLE-only:
  //   - a denial that arrives asynchronously (promise rejection or the
  //     'pointerlockerror' event — Chrome's cooldown path) only bumps a
  //     consecutive-denial streak; the primary-button gesture retry in
  //     main.ts keeps re-attempting the lock in the meantime;
  //   - the cursor-aim latch engages only after LOCK_DENY_LATCH_STREAK
  //     consecutive denials, or IMMEDIATELY on a synchronous SecurityError
  //     throw (structurally lock-free environments: sandboxed iframes and
  //     embedded panes throw in-call — retrying those is pure churn, so
  //     requestLock also stops re-attempting after a hard denial);
  //   - any successful lock resets the streak, clears the latch and fires
  //     the onLockRestored handlers (main.ts drops/rearms the toast).
  // One physical attempt can report twice (Chrome rejects the promise AND
  // fires pointerlockerror), and the two signals can land SECONDS apart when
  // a battle-entry world build blocks the main thread between them — so the
  // streak counts at most one denial PER requestLock ATTEMPT (attempt-scoped,
  // not time-windowed).
  const LOCK_DENY_LATCH_STREAK = 3;
  let lockDenied = false;    // durable cursor-aim latch (see above)
  let lockDenyStreak = 0;    // consecutive denied ATTEMPTS since the last lock
  let lockHardDenied = false; // sync SecurityError seen — stop re-attempting
  let lockAttemptSeq = 0;     // bumped by every requestLock() call
  let lockDeniedAttempt = 0;  // attempt id already counted into the streak
  let cursorClientX: number | null = null; // last real cursor position (null = never moved)
  let cursorClientY: number | null = null;
  const lockDeniedHandlers = new Set<() => void>();
  const lockRestoredHandlers = new Set<() => void>();
  // content_breadth r6 (minor: first aggressive click swallowed in no-lock
  // environments): the FIRST canvas click is what TRIGGERS the
  // pointerlockerror -> cursor-aim latch, so at press time lockDenied is
  // still false and the fire edge never latched — the click died and only
  // the SECOND click fired. Remember the last canvas-targeted fire press;
  // when the denial lands (well inside FIRE_PRESS_BUFFER_MS), re-arm that
  // edge retroactively. Lock-CAPABLE browsers are untouched: their
  // lock-acquiring click still never latches (no denial event follows), so
  // re-locking after a pause still can't pop a shot. lock_retry r1: the
  // re-arm runs on EVERY denial (soft ones included) — a battle click whose
  // lock attempt got cooldown-denied still fires.
  let lastCanvasFirePressMs = -Infinity;
  function noteLockDenied(hard: boolean) {
    if (hard) lockHardDenied = true;
    if (lockDeniedAttempt !== lockAttemptSeq) {
      lockDeniedAttempt = lockAttemptSeq; // count each attempt exactly once
      lockDenyStreak += 1;
    }
    if (nowMillis() - lastCanvasFirePressMs < FIRE_PRESS_BUFFER_MS) {
      firePressMs = lastCanvasFirePressMs; // re-arm the swallowed click
      fireHoldLegit = true; // a canvas press still held is full-auto too
    }
    if ((hard || lockDenyStreak >= LOCK_DENY_LATCH_STREAK) && !lockDenied) {
      lockDenied = true;
      for (const cb of [...lockDeniedHandlers]) cb();
    }
  }
  function noteLockEngaged() {
    lockDenyStreak = 0;
    lockHardDenied = false;
    if (lockDenied) {
      lockDenied = false;
      for (const cb of [...lockRestoredHandlers]) cb();
    }
  }

  const nowMillis = () =>
    (typeof performance !== 'undefined' ? performance.now() : Date.now());

  function firePress(actionId: ActionId, code: string, evt?: Event) {
    // Latch the single-shot fire edge. Presses that could never fire anyway —
    // mouse clicks without pointer lock (menus, the lock-acquiring click
    // itself) — are ignored, so re-locking after a pause can't pop a shot.
    // CURSOR-AIM FALLBACK: when pointer lock is unavailable (lockDenied) a
    // click ON THE GAME CANVAS is a legitimate fire press — battle clicks in
    // no-lock environments must fire even though the same mousedown also
    // re-attempts (and re-fails) the lock. Clicks on UI elements (garage
    // BATTLE button, settings panel, end overlay) still never latch: their
    // event target is the UI node, not the canvas. Key presses can't land on
    // overlays, so a keyboard-bound fire always latches in this mode (the
    // settings panel disables the whole layer while open).
    if (actionId === 'fire' &&
        (code.startsWith('Pad') || code.startsWith('Touch') || !lockElement ||
         document.pointerLockElement === lockElement ||
         (lockDenied && evt &&
          (evt.target === lockElement || evt.type === 'keydown')))) {
      firePressMs = nowMillis();
      fireHoldLegit = true; // holding from this press is full-auto
    } else if (actionId === 'fire' && evt && evt.target === lockElement) {
      // content_breadth r6: canvas click before the no-lock latch — remember
      // it so noteLockDenied can re-arm the edge (see lastCanvasFirePressMs).
      lastCanvasFirePressMs = nowMillis();
    }
    pressLatch.add(actionId); // consumed by the next isDown(actionId) query
    const set = actionHandlers.get(actionId);
    if (!set) return;
    for (const cb of set) cb(code);
  }

  function press(code: string, evt?: Event) {
    if (!enabled) return;
    const actionId = codeToAction.get(code);
    if (actionId && evt && evt.cancelable &&
        (code === 'Space' || code === 'Tab' ||
         code === 'CapsLock' || code.startsWith('Arrow') || code.startsWith('Alt'))) {
      evt.preventDefault(); // keep bound nav keys from scrolling/refocusing
    }
    const wasDown = down.has(code);
    down.add(code);
    if (actionId && !wasDown) firePress(actionId, code, evt);
  }

  function release(code: string) {
    down.delete(code);
  }

  // --- gamepad polling -------------------------------------------------------------
  // Polled at most once per few ms from getState()/isDown()/consumeMouseDelta()
  // so the pad behaves exactly like held keys without its own rAF loop.
  const padHeld = new Set<ActionId>(); // actionIds held via pad buttons or move stick
  const padPrevPressed: boolean[] = new Array(PAD_MAX_BUTTONS).fill(false);
  const padAim = { x: 0, y: 0 }; // curved right-stick deflection (-1..1)
  const padMove = { x: 0, y: 0 }; // curved left-stick deflection (-1..1)
  let padConnected = false;
  let padLastActiveMs = -Infinity;
  let padLastPollMs = -1;
  // PERF (GC): navigator.getGamepads() allocates a fresh array every call in
  // Chromium — skip polling entirely until the browser reports a pad. The
  // 'gamepadconnected' event fires on page load too when one is already
  // plugged in, so nothing is missed.
  let padEverConnected = false;
  const onPadConnected = () => { padEverConnected = true; };
  window.addEventListener('gamepadconnected', onPadConnected);

  function pollPad() {
    if (!padEverConnected) return;
    const nowMs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (padLastPollMs >= 0 && nowMs - padLastPollMs < 4) return;
    padLastPollMs = nowMs;
    padHeld.clear();
    padAim.x = 0; padAim.y = 0;
    padMove.x = 0; padMove.y = 0;
    padConnected = false;
    const pads = (typeof navigator !== 'undefined' && navigator.getGamepads)
      ? navigator.getGamepads() : null;
    let pad = null;
    if (pads) {
      for (const p of pads) {
        if (p && p.connected) { pad = p; break; }
      }
    }
    if (!pad) {
      padPrevPressed.fill(false);
      return;
    }
    padConnected = true;

    const ax = pad.axes || [];
    const lx = ax.length > 0 ? ax[0] : 0;
    const ly = ax.length > 1 ? ax[1] : 0;
    const rx = ax.length > 2 ? ax[2] : 0;
    const ry = ax.length > 3 ? ax[3] : 0;
    padMove.x = stickCurve(lx);
    padMove.y = stickCurve(ly);
    padAim.x = stickCurve(rx);
    padAim.y = stickCurve(ry);

    let anyActivity =
      Math.abs(lx) > PAD_DEADZONE || Math.abs(ly) > PAD_DEADZONE ||
      Math.abs(rx) > PAD_DEADZONE || Math.abs(ry) > PAD_DEADZONE;

    // buttons: held state + press edges through the same action pipeline
    const n = Math.min(pad.buttons.length, PAD_MAX_BUTTONS);
    for (let i = 0; i < n; i++) {
      const b = pad.buttons[i];
      const pressed = !!b && (b.pressed || b.value > PAD_TRIGGER_THRESHOLD);
      if (pressed) anyActivity = true;
      const was = padPrevPressed[i];
      padPrevPressed[i] = pressed;
      if (!enabled) continue;
      const actionId = padButtonToAction.get(i);
      if (!actionId) continue;
      if (pressed) padHeld.add(actionId);
      if (pressed && !was) firePress(actionId, `Pad${i}`);
    }
    for (let i = n; i < PAD_MAX_BUTTONS; i++) padPrevPressed[i] = false;

    // left stick -> synthesized held movement actions (digital fallback; the
    // curved analog values stay available via getPadMove for analog throttle)
    if (enabled) {
      if (ly < -PAD_MOVE_THRESHOLD) padHeld.add('forward');
      if (ly > PAD_MOVE_THRESHOLD) padHeld.add('back');
      if (lx < -PAD_MOVE_THRESHOLD) padHeld.add('left');
      if (lx > PAD_MOVE_THRESHOLD) padHeld.add('right');
    }

    if (anyActivity) padLastActiveMs = nowMs;
  }

  // --- DOM listeners ----------------------------------------------------------------
  const onKeyDown = (event: KeyboardEvent) => {
    if (!event.repeat) press(event.code, event);
    else if (enabled) down.add(event.code);
  };
  const onKeyUp = (event: KeyboardEvent) => release(event.code);
  const onMouseDown = (event: MouseEvent) => press(`Mouse${event.button}`, event);
  const onMouseUp = (event: MouseEvent) => release(`Mouse${event.button}`);
  const onMouseMove = (event: MouseEvent) => {
    // real cursor position is tracked always — cursor-aim raycasts through it
    cursorClientX = event.clientX;
    cursorClientY = event.clientY;
    if (lockElement && document.pointerLockElement === lockElement) {
      rawDX += event.movementX;
      rawDY += event.movementY;
    }
  };
  // Wheel notches fire press edges for whatever action WheelUp/WheelDown maps
  // to (zoom by default) — rebindable like any key, no held state. Gated on
  // pointer lock (like fire): without lock the wheel belongs to whatever UI
  // sits under the cursor, so scrolling a menu must never step the gun zoom.
  // CURSOR-AIM FALLBACK: with the lock unavailable, notches over the game
  // canvas itself do step the zoom (menus still own their own scroll).
  const onWheel = (event: WheelEvent) => {
    if (!enabled || event.deltaY === 0) return;
    if (lockElement && document.pointerLockElement !== lockElement &&
        !(lockDenied && event.target === lockElement)) return;
    const code = event.deltaY < 0 ? 'WheelUp' : 'WheelDown';
    const actionId = codeToAction.get(code);
    if (actionId) firePress(actionId, code, event);
  };
  const onBlurClear = () => down.clear();
  const onContextMenu = (event: MouseEvent) => event.preventDefault();

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('wheel', onWheel, { passive: true });
  window.addEventListener('blur', onBlurClear);
  document.addEventListener('visibilitychange', () => { if (document.hidden) onBlurClear(); });
  window.addEventListener('contextmenu', onContextMenu);
  // CURSOR-AIM FALLBACK: browsers that deny the lock asynchronously report it
  // here (no promise, no throw) — a SOFT denial (streak); a successful lock
  // resets the streak and clears/announces the latch (noteLockEngaged).
  document.addEventListener('pointerlockerror', () => noteLockDenied(false));
  document.addEventListener('pointerlockchange', () => {
    if (lockElement && document.pointerLockElement === lockElement) noteLockEngaged();
  });

  const isHeld = (actionId: ActionId) =>
    (maps[0][actionId] !== null && down.has(maps[0][actionId])) ||
    (maps[1][actionId] !== null && down.has(maps[1][actionId])) ||
    padHeld.has(actionId) || virtualHeld.has(actionId);

  const api: InputLayer = {
    /** Ordered action metadata for UI listings. */
    actionDefs: ACTION_DEFS,

    /** @param {?string} code @returns {string} display label */
    labelFor: labelForCode,

    /** @param {?number} index @returns {string} display label for a pad button */
    padLabelFor: labelForPadButton,

    /** Snapshot of every action's held state (cached object, no allocation).
     *  `fire` is press edge OR legitimate hold: a click buffers one shot; a
     *  control still held keeps fire hot, so the gun refires as each reload
     *  completes (full-auto — see FIRE_PRESS_BUFFER_MS block). */
    getState() {
      pollPad();
      for (const def of ACTION_DEFS) state[def.id] = enabled && isHeld(def.id);
      // Edge: NOT consumed by the read (see FIRE_PRESS_BUFFER_MS): it stays
      // hot for the whole buffer window so a fixed sim step is guaranteed to
      // sample it even when this rAF ran zero steps. tryFire's reload gate
      // makes a double fire from one click impossible.
      // Hold: full-auto only while the hold that latched the edge persists —
      // release drops the gate, and a hold that never latched (menu click,
      // lock-acquiring click) never fires.
      const fireHeld = isHeld('fire');
      if (!fireHeld) fireHoldLegit = false;
      state.fire = enabled && ((nowMillis() - firePressMs < FIRE_PRESS_BUFFER_MS) ||
        (fireHoldLegit && fireHeld));
      return state;
    },

    /** @param {string} actionId @returns {boolean} action currently held, OR
     *  tapped since the last query (sub-frame press+release latch — a fast
     *  taps still register even when both key events land between two render
     *  frames; see pressLatch above). */
    isDown(actionId) {
      pollPad();
      if (!enabled) return false;
      if (isHeld(actionId)) {
        pressLatch.delete(actionId);
        return true;
      }
      if (pressLatch.has(actionId)) {
        pressLatch.delete(actionId); // one-shot: report the tap exactly once
        return true;
      }
      return false;
    },

    /**
     * Subscribe to an action's press edge (key-repeat filtered). Fires for
     * primary/secondary keys, bound mouse buttons, wheel notches and pad
     * buttons alike; `code` tells which physical control fired.
     * @param {string} actionId
     * @param {(code:string)=>void} cb
     * @returns {() => void} unsubscribe
     */
    onAction(actionId, cb) {
      let set = actionHandlers.get(actionId);
      if (!set) { set = new Set(); actionHandlers.set(actionId, set); }
      set.add(cb);
      return () => set.delete(cb);
    },

    /** @param {number} [slot=0] @returns {Record<string,?string>} copy of a bindings column */
    getBindings(slot = 0) { return { ...maps[slot] }; },

    /** @param {string} actionId @param {number} [slot=0] @returns {?string} bound code */
    getBinding(actionId, slot = 0) { return maps[slot][actionId]; },

    /**
     * Which (action, slot) other than (excludeId, excludeSlot) already uses `code`.
     * @param {string} code
     * @param {?string} excludeId
     * @param {number} [excludeSlot=0]
     * @returns {?{actionId:string, slot:number}}
     */
    findConflict(code, excludeId, excludeSlot = 0) {
      if (!code) return null;
      for (const s of [0, 1] as const) {
        for (const def of ACTION_DEFS) {
          if (def.id === excludeId && s === excludeSlot) continue;
          if (maps[s][def.id] === code) return { actionId: def.id, slot: s };
        }
      }
      return null;
    },

    /** Bind `code` (or null to clear) to an action's slot and persist. Caller
     *  resolves conflicts first. */
    setBinding(actionId, code, slot = 0) {
      maps[slot][actionId] = code || null;
      rebuildLookup();
      persistMaps(slot);
    },

    /** Conflict resolution: (actionId, slot) takes `code`, the conflicting
     *  (otherId, otherSlot) inherits actionId's old code from that slot. */
    swapBindings(actionId, slot, otherId, otherSlot, code) {
      const old = maps[slot][actionId];
      maps[otherSlot][otherId] = old || null;
      maps[slot][actionId] = code || null;
      rebuildLookup();
      persistMaps(0);
      persistMaps(1);
    },

    /** @param {string} actionId @returns {?number} bound pad button index */
    getPadBinding(actionId) { return padBindings[actionId]; },

    /**
     * Which action other than excludeId already uses pad button `index`.
     * @returns {?{actionId:string}}
     */
    findPadConflict(index, excludeId) {
      if (index == null) return null;
      for (const def of ACTION_DEFS) {
        if (def.id === excludeId) continue;
        if (padBindings[def.id] === index) return { actionId: def.id };
      }
      return null;
    },

    /** Bind pad button `index` (or null to clear) to an action and persist. */
    setPadBinding(actionId, index) {
      padBindings[actionId] = index == null ? null : index;
      rebuildLookup();
      saveJson(PAD_KEY, padBindings);
    },

    /** Pad conflict resolution: actionId takes `index`, otherId inherits the old button. */
    swapPadBindings(actionId, otherId, index) {
      const old = padBindings[actionId];
      padBindings[otherId] = old == null ? null : old;
      padBindings[actionId] = index == null ? null : index;
      rebuildLookup();
      saveJson(PAD_KEY, padBindings);
    },

    /** Restore all default bindings (primary, secondary, pad) and persist. */
    resetBindings() {
      for (const def of ACTION_DEFS) {
        maps[0][def.id] = DEFAULT_BINDINGS[def.id] ?? null;
        maps[1][def.id] = DEFAULT_BINDINGS2[def.id] ?? null;
        padBindings[def.id] = DEFAULT_PAD_BINDINGS[def.id] ?? null;
      }
      rebuildLookup();
      persistMaps(0);
      persistMaps(1);
      saveJson(PAD_KEY, padBindings);
    },

    /** @returns {boolean} a gamepad is connected right now */
    isPadConnected() {
      pollPad();
      return padConnected;
    },

    /** @returns {boolean} a pad was touched in the last few seconds (used to
     *  relax the pointer-lock fire gate for controller players) */
    padActive() {
      pollPad();
      const nowMs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      return padConnected && nowMs - padLastActiveMs < PAD_ACTIVE_WINDOW_MS;
    },

    /** Curved left-stick deflection for analog driving. @param {{x:number,y:number}} out */
    getPadMove(out) {
      pollPad();
      out.x = padMove.x;
      out.y = padMove.y;
      return out;
    },

    /** Set the mobile driving stick. x is screen-right; y is forward. */
    setVirtualMove(x, y) {
      virtualMove.x = clamp(Number(x) || 0, -1, 1);
      virtualMove.y = clamp(Number(y) || 0, -1, 1);
      virtualMoveActive = Math.abs(virtualMove.x) > 0.025 || Math.abs(virtualMove.y) > 0.025;
      virtualLastActiveMs = nowMillis();
    },

    /** Read the mobile driving stick and report whether it is deflected. */
    getVirtualMove(out) {
      out.x = virtualMove.x;
      out.y = virtualMove.y;
      return virtualMoveActive;
    },

    /** Feed a touch-drag aim delta through the same smoothing/sign path as a mouse. */
    addVirtualAim(dx, dy) {
      if (!enabled) return;
      rawDX += Number(dx) || 0;
      rawDY += Number(dy) || 0;
      virtualLastActiveMs = nowMillis();
    },

    /** Press/release/tap a named action from the mobile HUD. */
    pressVirtual(actionId) {
      if (!enabled || !Object.prototype.hasOwnProperty.call(state, actionId)) return;
      const wasDown = virtualHeld.has(actionId);
      virtualHeld.add(actionId);
      virtualLastActiveMs = nowMillis();
      if (!wasDown) firePress(actionId, `Touch:${actionId}`);
    },
    releaseVirtual(actionId) { virtualHeld.delete(actionId); },
    tapVirtual(actionId) {
      api.pressVirtual(actionId);
      api.releaseVirtual(actionId);
    },

    /** Recent touch activity relaxes pointer-lock-only fire gating. A touch
     *  button still held IS current activity — a static full-auto fire hold
     *  must not go stale after the 4 s window (belts empty in 10-100 s). */
    virtualActive() {
      return virtualHeld.size > 0 || virtualMoveActive ||
        nowMillis() - virtualLastActiveMs < PAD_ACTIVE_WINDOW_MS;
    },

    /** Coarse-pointer devices use the Blitz-style touch HUD and skip pointer
     *  lock. The responsive layout contract deliberately separates available
     *  space from interaction mode: a narrow mouse window keeps desktop aim,
     *  while a laptop-width iPad keeps touch controls and overlay panels. */
    isTouchLayout() {
      const responsiveInput = typeof document !== 'undefined'
        ? document.body?.dataset?.cotInput
        : '';
      if (responsiveInput === 'coarse') return true;
      if (responsiveInput === 'fine') return false;

      // Early-boot/test fallback before responsiveLayout has annotated body.
      // Pointer capability—not viewport width—is the control-mode authority.
      const mm = typeof matchMedia === 'function' ? matchMedia : null;
      const coarse = !!mm && mm('(pointer: coarse)').matches;
      const fine = !!mm && mm('(pointer: fine)').matches;
      return coarse && !fine;
    },

    /** @returns {{sensitivity:number,invertY:boolean,sniperSensScale:number,
     *  aimSmoothing:number,padSensitivity:number,aiDifficulty:string,
     *  showPerfMeter:boolean,showDebugHud:boolean,armorAimOverlay:boolean,
     *  rmbMode:('hold'|'toggle'|'freelook')}} live settings object */
    getSettings() { return settings; },

    /** Set + clamp + persist one gameplay setting. Numeric input is parsed
     *  with Number() and CLAMPED into range — typing 0 into a 0.2-minimum
     *  field lands on 0.2, never on the silent default (the old `+value || 1`
     *  treated 0 as falsy and quietly reset the field to 1.0×). The default
     *  is reserved for genuinely non-numeric input (NaN). */
    setSetting(key, value) {
      const num = (fallback: number, lo: number, hi: number) => {
        const n = Number(value);
        return clamp(Number.isFinite(n) ? n : fallback, lo, hi);
      };
      if (key === 'invertY') settings.invertY = !!value;
      else if (key === 'showPerfMeter') settings.showPerfMeter = !!value;
      else if (key === 'showDebugHud') settings.showDebugHud = !!value;
      else if (key === 'armorAimOverlay') settings.armorAimOverlay = !!value;
      else if (key === 'alarmHeartbeat') settings.alarmHeartbeat = !!value;
      else if (key === 'sensitivity') settings.sensitivity = num(1, 0.2, 3);
      else if (key === 'sniperSensScale') settings.sniperSensScale = num(1, 0.2, 3);
      else if (key === 'aimSmoothing') settings.aimSmoothing = num(0.5, 0, 1);
      else if (key === 'padSensitivity') settings.padSensitivity = num(1, 0.2, 3);
      else if (key === 'aiDifficulty') {
        if (typeof value === 'string' && isAiDifficulty(value)) settings.aiDifficulty = value;
      } else if (key === 'rmbMode') {
        if (typeof value === 'string' && isRmbMode(value)) settings.rmbMode = value;
      }
      else if (VOLUME_KEYS.includes(key)) settings[key] = num(0, 0, 1);
      saveJson(SETTINGS_KEY, settings);
    },

    /**
     * Drain this frame's aim delta: EMA-smoothed (player-tunable, 0 = raw),
     * sensitivity-scaled, invert-Y applied, extra sniper scaling when `sniper`
     * is true. Right-stick pad aim is merged in with its own sensitivity.
     *
     * SIGN CONTRACT (controls-sign fix — do not "simplify" this away):
     *   out.x is a WORLD-YAW delta, not a screen-pixel delta. Its consumer is
     *   cameraRig, which integrates it as `aimYaw += mouseDX * sens` (and
     *   `freeYaw += ...` for held free-look), and this project's yaw convention
     *   is forwardAxis(yaw) = [sin yaw, 0, cos yaw] (ARCHITECTURE §1.1). In a
     *   Y-up right-handed world, a camera looking along +Z has screen-right =
     *   world -X (three.js Matrix4.lookAt: x_axis = up × (eye-target)), so
     *   INCREASING yaw swings the view/gun toward screen-LEFT. Feeding raw
     *   movementX straight through therefore panned the camera and slewed the
     *   turret the wrong way on every mouse move (user report: "turning right
     *   with mouse actually turns tank left"; measured before this fix as a
     *   -0.64 NDC-x bore swing for a +240 px movementX on m1a2, -0.40 on
     *   tiger1 — see the direction-aware assertions in tools/controls-probe.mjs).
     *   Hence the negation below: physical mouse-right (movementX > 0) becomes
     *   a yaw DECREASE, which is a screen-RIGHT swing.
     *   out.y stays in screen convention (down-positive) because the rig
     *   already negates it itself (`aimPitch -= mouseDY * sens`) — pitch was
     *   never inverted and must not be touched.
     *   The cursor-aim fallback path does NOT come through here (it raycasts
     *   through getCursorNdc), and it was already correct — see the probe.
     *
     * @param {{x:number,y:number}} out
     * @param {number} dt - render delta seconds
     * @param {boolean} [sniper=false]
     * @returns {{x:number,y:number}} out - x: yaw delta (world-yaw sign),
     *   y: pitch delta (screen sign, down-positive)
     */
    consumeMouseDelta(out, dt, sniper = false) {
      pollPad();
      const tau = settings.aimSmoothing * MAX_SMOOTH_TAU_S;
      if (tau < 0.001) {
        // raw mode: pass deltas through 1:1, keep the EMA state drained
        smDX = rawDX;
        smDY = rawDY;
      } else {
        const k = dt > 0 ? 1 - Math.exp(-dt / tau) : 1;
        smDX += (rawDX - smDX) * k;
        smDY += (rawDY - smDY) * k;
      }
      rawDX = 0; rawDY = 0;
      if (Math.abs(smDX) < 0.005) smDX = 0;
      if (Math.abs(smDY) < 0.005) smDY = 0;
      const sniperScale = sniper ? settings.sniperSensScale : 1;
      const s = settings.sensitivity * sniperScale;
      const inv = settings.invertY ? -1 : 1;
      // -1 on x: screen-right (movementX > 0) is a yaw DECREASE (see the SIGN
      // CONTRACT above). Right-stick aim gets the same flip — a stick pushed
      // right must swing the gun right.
      out.x = -smDX * s;
      out.y = smDY * s * inv;
      if (enabled && (padAim.x !== 0 || padAim.y !== 0)) {
        const ps = PAD_AIM_RATE * dt * settings.padSensitivity * sniperScale;
        out.x -= padAim.x * ps;
        out.y += padAim.y * ps * inv;
      }
      return out;
    },

    /** Gate the whole layer (settings menu open). Disabling clears held state;
     *  any pending fire edge dies on either flank of the toggle. */
    setEnabled(v) {
      enabled = !!v;
      firePressMs = -Infinity;
      fireHoldLegit = false; // a hold never survives a menu open/close
      pressLatch.clear(); // taps must not queue across a menu open/close
      if (!enabled) {
        down.clear();
        padHeld.clear();
        virtualHeld.clear();
        virtualMove.x = 0; virtualMove.y = 0; virtualMoveActive = false;
        rawDX = 0; rawDY = 0; smDX = 0; smDY = 0;
      }
    },

    /** @returns {boolean} pointer currently locked to the game canvas */
    isLocked() {
      return !!lockElement && document.pointerLockElement === lockElement;
    },

    /** Acquire pointer lock on the game canvas (must run inside a user gesture).
     *  Denial classification (lock_retry r1):
     *   - synchronous throw (sandboxed iframes / embedded panes raise
     *     SecurityError in-call) = HARD: latch cursor-aim immediately and
     *     stop re-attempting — the environment structurally cannot lock;
     *   - async rejection / 'pointerlockerror' (Chrome's ~1.3 s post-Esc
     *     cooldown reports this way) = SOFT: bump the consecutive-denial
     *     streak; the latch engages only at LOCK_DENY_LATCH_STREAK. Callers
     *     (canvas mousedown, battle start, settings close) keep retrying
     *     soft-denied locks, and any success self-heals the fallback. */
    requestLock() {
      if (!lockElement || api.isLocked()) return;
      if (lockHardDenied) return; // structurally unavailable — never re-churn
      lockAttemptSeq += 1; // denial reports below count once per attempt
      try {
        const p = lockElement.requestPointerLock();
        if (p && typeof p.catch === 'function') p.catch(() => noteLockDenied(false));
      } catch (_) { noteLockDenied(true); /* hard — cursor-aim takes over */ }
    },

    /** @returns {boolean} pointer lock is DURABLY unavailable here (3
     *  consecutive denials, or a synchronous SecurityError) and not currently
     *  held — aim with the real cursor. Transient denials (Chrome's post-Esc
     *  cooldown) never flip this; gestures keep retrying the lock instead.
     *  Self-healing: any successful lock clears the latch. */
    isCursorAim() {
      return !!lockElement && lockDenied &&
        document.pointerLockElement !== lockElement;
    },

    /**
     * Subscribe to the DURABLE lock-denied transition (fires once when the
     * cursor-aim latch engages: 3 consecutive denials or a synchronous
     * SecurityError; re-arms only after a successful lock). Used for the
     * "cursor aim enabled" toast.
     * @param {() => void} cb
     * @returns {() => void} unsubscribe
     */
    onLockDenied(cb) {
      lockDeniedHandlers.add(cb);
      return () => lockDeniedHandlers.delete(cb);
    },

    /**
     * Subscribe to the latch-released transition: a pointer lock SUCCEEDED
     * after the cursor-aim latch had engaged (fires once per restore; main.ts
     * uses it to drop and re-arm the fallback toast).
     * @param {() => void} cb
     * @returns {() => void} unsubscribe
     */
    onLockRestored(cb) {
      lockRestoredHandlers.add(cb);
      return () => lockRestoredHandlers.delete(cb);
    },

    /**
     * Real cursor position over the lock element in NDC (-1..1, +y up),
     * clamped to the canvas. Falls back to screen center before the first
     * mousemove. @param {{x:number,y:number}} out @returns {{x:number,y:number}}
     */
    getCursorNdc(out) {
      out.x = 0;
      out.y = 0;
      if (!lockElement || cursorClientX === null || cursorClientY === null) return out;
      const r = lockElement.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return out;
      out.x = clamp(((cursorClientX - r.left) / r.width) * 2 - 1, -1, 1);
      out.y = clamp(-(((cursorClientY - r.top) / r.height) * 2 - 1), -1, 1);
      return out;
    },

    /** Release pointer lock if held. */
    releaseLock() {
      if (api.isLocked() && document.exitPointerLock) document.exitPointerLock();
    },
  };

  return api;
}
