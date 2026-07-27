// src/game/input.js — rebindable action-map input layer.
//
// Raw KeyboardEvent.code / mouse-button events are translated into named game
// actions ("forward", "fire", ...). Bindings are persisted to localStorage
// (cot.bindings.v1) and editable at runtime (settings panel). Key state is a
// Set of codes, so simultaneous keys never ghost each other. The layer also
// owns pointer-lock helpers, gameplay feel settings (mouse sensitivity /
// invert-Y / sniper sensitivity, cot.settings.v1) and a smoothed, sensitivity-
// scaled mouse-delta accumulator consumed once per render frame.

const BINDINGS_KEY = 'cot.bindings.v1';
const SETTINGS_KEY = 'cot.settings.v1';
const SMOOTH_TAU_S = 0.028; // light EMA on mouse deltas — steadies aim without lag

/** Every rebindable action, grouped for the settings panel. */
export const ACTION_DEFS = [
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
  { id: 'freeCamera', label: 'Free Camera (hold)', group: 'Camera' },
  { id: 'minimapZoom', label: 'Minimap Zoom', group: 'Interface' },
  { id: 'settingsMenu', label: 'Settings Menu', group: 'Interface' },
];

/** Default bindings: WASD move, LMB fire, Shift sniper, RMB free-look,
 *  1/2/3 shells, Space handbrake, Esc menu. Mouse buttons are encoded as
 *  synthetic codes "Mouse0".."Mouse4". */
export const DEFAULT_BINDINGS = {
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
  freeCamera: 'Mouse2',
  minimapZoom: 'KeyM',
  settingsMenu: 'Escape',
};

const DEFAULT_SETTINGS = {
  sensitivity: 1, // 0.2x .. 3x multiplier on mouse aim
  invertY: false,
  sniperSensScale: 1, // extra multiplier while in sniper mode (0.2x .. 3x)
};

const LABEL_SPECIAL = {
  Space: 'SPACE', Escape: 'ESC', Tab: 'TAB', CapsLock: 'CAPS',
  Enter: 'ENTER', NumpadEnter: 'NUM ENTER', Backspace: 'BKSP',
  ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT',
  ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL',
  AltLeft: 'L-ALT', AltRight: 'R-ALT',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB', Mouse3: 'MB4', Mouse4: 'MB5',
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
};

/**
 * Short human label for a KeyboardEvent.code or synthetic MouseN code.
 * @param {string} code
 * @returns {string}
 */
export function labelForCode(code) {
  if (!code) return '—';
  if (LABEL_SPECIAL[code]) return LABEL_SPECIAL[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `NUM ${code.slice(6)}`;
  return code.toUpperCase();
}

function loadJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

function saveJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* private mode */ }
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Create the input layer.
 * @param {{lockElement?: HTMLElement}} [opts] - lockElement: canvas that owns pointer lock.
 * @returns {InputLayer}
 */
export function createInput(opts = {}) {
  const lockElement = opts.lockElement || null;

  // --- bindings ---------------------------------------------------------------
  const bindings = { ...DEFAULT_BINDINGS };
  const stored = loadJson(BINDINGS_KEY);
  if (stored && typeof stored === 'object') {
    for (const def of ACTION_DEFS) {
      if (typeof stored[def.id] === 'string' && stored[def.id]) bindings[def.id] = stored[def.id];
    }
  }
  let codeToAction = new Map();
  function rebuildLookup() {
    codeToAction = new Map();
    for (const def of ACTION_DEFS) codeToAction.set(bindings[def.id], def.id);
  }
  rebuildLookup();

  // --- gameplay settings --------------------------------------------------------
  const settings = { ...DEFAULT_SETTINGS };
  const storedSettings = loadJson(SETTINGS_KEY);
  if (storedSettings && typeof storedSettings === 'object') {
    if (typeof storedSettings.sensitivity === 'number') settings.sensitivity = clamp(storedSettings.sensitivity, 0.2, 3);
    if (typeof storedSettings.invertY === 'boolean') settings.invertY = storedSettings.invertY;
    if (typeof storedSettings.sniperSensScale === 'number') settings.sniperSensScale = clamp(storedSettings.sniperSensScale, 0.2, 3);
  }

  // --- live state -----------------------------------------------------------------
  const down = new Set(); // active codes — Set semantics kill key-ghosting
  const actionHandlers = new Map(); // actionId -> Set<cb(code)>
  const state = {};
  for (const def of ACTION_DEFS) state[def.id] = false;
  let enabled = true;
  let rawDX = 0;
  let rawDY = 0;
  let smDX = 0;
  let smDY = 0;

  function firePress(actionId, code) {
    const set = actionHandlers.get(actionId);
    if (!set) return;
    for (const cb of set) cb(code);
  }

  function press(code, evt) {
    if (!enabled) return;
    const actionId = codeToAction.get(code);
    if (actionId && evt && evt.cancelable &&
        (code === 'Space' || code.startsWith('Arrow') || code === 'Tab')) {
      evt.preventDefault(); // keep bound nav keys from scrolling/refocusing
    }
    const wasDown = down.has(code);
    down.add(code);
    if (actionId && !wasDown) firePress(actionId, code);
  }

  function release(code) {
    down.delete(code);
  }

  // --- DOM listeners ------------------------------------------------------------
  const onKeyDown = (e) => { if (!e.repeat) press(e.code, e); else if (enabled) down.add(e.code); };
  const onKeyUp = (e) => release(e.code);
  const onMouseDown = (e) => press(`Mouse${e.button}`, null);
  const onMouseUp = (e) => release(`Mouse${e.button}`);
  const onMouseMove = (e) => {
    if (lockElement && document.pointerLockElement === lockElement) {
      rawDX += e.movementX;
      rawDY += e.movementY;
    }
  };
  const onBlurClear = () => down.clear();
  const onContextMenu = (e) => e.preventDefault();

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('blur', onBlurClear);
  document.addEventListener('visibilitychange', () => { if (document.hidden) onBlurClear(); });
  window.addEventListener('contextmenu', onContextMenu);

  const api = {
    /** Ordered action metadata for UI listings. */
    actionDefs: ACTION_DEFS,

    /** @param {string} code @returns {string} display label */
    labelFor: labelForCode,

    /** Snapshot of every action's held state (cached object, no allocation). */
    getState() {
      for (const def of ACTION_DEFS) state[def.id] = down.has(bindings[def.id]);
      return state;
    },

    /** @param {string} actionId @returns {boolean} action currently held */
    isDown(actionId) {
      return enabled && down.has(bindings[actionId]);
    },

    /**
     * Subscribe to an action's press edge (key-repeat filtered).
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

    /** @returns {Record<string,string>} copy of the current bindings */
    getBindings() { return { ...bindings }; },

    /** @param {string} actionId @returns {string} bound code */
    getBinding(actionId) { return bindings[actionId]; },

    /**
     * Which action (other than excludeId) already uses `code`.
     * @returns {?string} conflicting actionId or null
     */
    findConflict(code, excludeId) {
      const owner = codeToAction.get(code);
      return owner && owner !== excludeId ? owner : null;
    },

    /** Bind `code` to `actionId` and persist. Caller resolves conflicts first. */
    setBinding(actionId, code) {
      bindings[actionId] = code;
      rebuildLookup();
      saveJson(BINDINGS_KEY, bindings);
    },

    /** Conflict resolution: `actionId` takes `code`, `otherId` inherits actionId's old key. */
    swapBindings(actionId, otherId, code) {
      const old = bindings[actionId];
      bindings[otherId] = old;
      bindings[actionId] = code;
      rebuildLookup();
      saveJson(BINDINGS_KEY, bindings);
    },

    /** Restore DEFAULT_BINDINGS and persist. */
    resetBindings() {
      Object.assign(bindings, DEFAULT_BINDINGS);
      rebuildLookup();
      saveJson(BINDINGS_KEY, bindings);
    },

    /** @returns {{sensitivity:number,invertY:boolean,sniperSensScale:number}} live settings object */
    getSettings() { return settings; },

    /** Set + clamp + persist one gameplay setting. */
    setSetting(key, value) {
      if (key === 'invertY') settings.invertY = !!value;
      else if (key === 'sensitivity') settings.sensitivity = clamp(+value || 1, 0.2, 3);
      else if (key === 'sniperSensScale') settings.sniperSensScale = clamp(+value || 1, 0.2, 3);
      saveJson(SETTINGS_KEY, settings);
    },

    /**
     * Drain this frame's mouse delta: EMA-smoothed, sensitivity-scaled,
     * invert-Y applied, extra sniper scaling when `sniper` is true.
     * @param {{x:number,y:number}} out
     * @param {number} dt - render delta seconds
     * @param {boolean} [sniper=false]
     * @returns {{x:number,y:number}} out
     */
    consumeMouseDelta(out, dt, sniper = false) {
      const k = dt > 0 ? 1 - Math.exp(-dt / SMOOTH_TAU_S) : 1;
      smDX += (rawDX - smDX) * k;
      smDY += (rawDY - smDY) * k;
      rawDX = 0; rawDY = 0;
      if (Math.abs(smDX) < 0.005) smDX = 0;
      if (Math.abs(smDY) < 0.005) smDY = 0;
      const s = settings.sensitivity * (sniper ? settings.sniperSensScale : 1);
      out.x = smDX * s;
      out.y = smDY * s * (settings.invertY ? -1 : 1);
      return out;
    },

    /** Gate the whole layer (settings menu open). Disabling clears held state. */
    setEnabled(v) {
      enabled = !!v;
      if (!enabled) { down.clear(); rawDX = 0; rawDY = 0; smDX = 0; smDY = 0; }
    },

    /** @returns {boolean} pointer currently locked to the game canvas */
    isLocked() {
      return !!lockElement && document.pointerLockElement === lockElement;
    },

    /** Acquire pointer lock on the game canvas (must run inside a user gesture). */
    requestLock() {
      if (!lockElement || api.isLocked()) return;
      try {
        const p = lockElement.requestPointerLock();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (_) { /* denied — user can click the canvas to retry */ }
    },

    /** Release pointer lock if held. */
    releaseLock() {
      if (api.isLocked() && document.exitPointerLock) document.exitPointerLock();
    },
  };

  return api;
}
