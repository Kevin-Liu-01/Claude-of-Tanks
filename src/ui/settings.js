// src/ui/settings.js — in-game settings panel (Esc in battle, gear in garage).
//
// CONTROLS tab: every action from src/game/input.js with three binding chips —
// primary key, secondary key (arrow-key movement ships as default alt), and a
// gamepad button. Click a chip then press any key / mouse button / wheel notch
// (or pad button for the pad column) to rebind; tap Esc to cancel, HOLD Esc to
// bind Escape itself; right-click a chip to clear it. Conflicts highlight both
// rows and offer a swap. GAMEPLAY tab: mouse sensitivity, sniper sensitivity,
// aim smoothing (0 % = raw 1:1 input), invert-Y, AI difficulty (easy/normal/
// hard segmented picker — consumed by game/state.js via getStoredDifficulty at
// battle setup), controller aim sensitivity — each slider is paired with a
// numeric entry field. SOUND tab: master/engine/gunfire/ambience/UI volume
// sliders (persisted with the gameplay settings; broadcast live over the bus
// as 'ui:volumes' for src/audio/audio.js). All state persists via the input
// layer's localStorage stores. Also owns the fading controls-hint strip
// shown on battle start and the garage gear button, and broadcasts
// 'ui:bindingsChanged' so the HUD's shell/consumable hotkey labels stay honest.
// Design language mirrors src/ui/hud.js / garage.js (palette, chamfers, type).

import { FONT_STACK, ensureFonts } from './fonts.js';
import { getStoredChoice, setPresetName, PRESET_ORDER, PRESETS } from '../engine/quality.js';

const SETTINGS_CSS = `
.cot-settings{position:fixed;inset:0;z-index:80;display:none;align-items:center;justify-content:center;
  background:rgba(4,7,10,.62);font-family:${FONT_STACK};color:#e6edf3;
  -webkit-user-select:none;user-select:none;}
.cot-settings.open{display:flex;}
.cot-settings *{box-sizing:border-box;margin:0;padding:0;}
.cot-set-panel{width:740px;max-width:96vw;max-height:88vh;display:flex;flex-direction:column;
  background:linear-gradient(180deg,rgba(13,18,24,.97),rgba(7,10,13,.98));
  border:1px solid rgba(146,164,180,.32);border-top:2px solid #f0a030;
  box-shadow:0 16px 60px rgba(0,0,0,.75);}
.cot-set-hdr{display:flex;align-items:baseline;justify-content:space-between;padding:15px 22px 10px;}
.cot-set-hdr h2{font-size:15px;font-weight:700;letter-spacing:.32em;color:#9fb0bf;text-transform:uppercase;}
.cot-set-hdr h2 b{color:#f0a030;}
.cot-set-close{cursor:pointer;border:1px solid rgba(146,164,180,.35);background:rgba(11,15,20,.8);
  color:#9fb0bf;font-family:${FONT_STACK};font-size:14px;line-height:1;padding:5px 10px;
  transition:color .12s,border-color .12s;}
.cot-set-close:hover{color:#f0b04a;border-color:rgba(240,176,74,.6);}
.cot-set-tabs{display:flex;gap:2px;padding:0 22px;border-bottom:1px solid rgba(146,164,180,.22);}
.cot-set-tab{cursor:pointer;background:none;border:none;border-bottom:2px solid transparent;
  font-family:${FONT_STACK};font-size:11px;font-weight:700;letter-spacing:.22em;color:#8a97a3;
  text-transform:uppercase;padding:9px 18px 8px;transition:color .12s;}
.cot-set-tab:hover{color:#c6d2dc;}
.cot-set-tab.sel{color:#f0b04a;border-bottom-color:#f0a030;}
.cot-set-body{flex:1;overflow-y:auto;padding:10px 22px 14px;min-height:280px;
  scrollbar-width:thin;scrollbar-color:rgba(146,164,180,.4) transparent;}
.cot-set-group{font-size:9.5px;font-weight:700;letter-spacing:.24em;color:#8a97a3;
  text-transform:uppercase;margin:14px 0 4px;}
.cot-set-group:first-child{margin-top:6px;}
.cot-set-row{display:flex;align-items:center;justify-content:space-between;gap:14px;
  padding:6px 8px;border-bottom:1px solid rgba(146,164,180,.1);}
.cot-set-row .lb{font-size:12.5px;color:#c6d2dc;letter-spacing:.04em;}
.cot-set-row.conflict{background:rgba(240,90,90,.14);box-shadow:inset 0 0 0 1px rgba(240,90,90,.55);}
.cot-set-row .chips{display:flex;gap:6px;align-items:center;}
.cot-set-colhdr{display:flex;justify-content:flex-end;gap:6px;padding:2px 8px 4px;
  border-bottom:1px solid rgba(146,164,180,.22);}
.cot-set-colhdr span{width:92px;text-align:center;font-size:8.5px;font-weight:700;
  letter-spacing:.2em;color:#68747f;text-transform:uppercase;}
.cot-set-colhdr span.pad{width:72px;}
.cot-chip{width:92px;text-align:center;cursor:pointer;font-family:${FONT_STACK};
  font-size:11px;font-weight:700;letter-spacing:.08em;color:#e6edf3;padding:5px 4px;
  background:linear-gradient(180deg,rgba(30,38,46,.9),rgba(16,21,26,.95));
  border:1px solid rgba(146,164,180,.42);border-bottom:2px solid rgba(146,164,180,.55);
  transition:color .12s,border-color .12s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cot-chip.padcol{width:72px;}
.cot-chip:hover{color:#ffd27a;border-color:rgba(240,176,74,.65);}
.cot-chip.empty{color:#5c6771;}
.cot-chip.listening{color:#f0b04a;border-color:#f0a030;animation:cotChipPulse 1.1s ease-in-out infinite;
  font-size:9px;letter-spacing:.05em;}
@keyframes cotChipPulse{0%,100%{box-shadow:0 0 0 rgba(240,160,48,0);}50%{box-shadow:0 0 12px rgba(240,160,48,.55);}}
.cot-set-conflict{display:none;margin:10px 22px 0;padding:9px 14px;align-items:center;gap:12px;
  background:rgba(58,17,15,.9);border:1px solid rgba(240,90,90,.55);font-size:11.5px;
  letter-spacing:.04em;color:#f2b1a8;}
.cot-set-conflict.show{display:flex;}
.cot-set-conflict b{color:#ffd27a;font-weight:700;}
.cot-set-ftr{display:flex;align-items:center;justify-content:space-between;gap:12px;
  padding:12px 22px 16px;border-top:1px solid rgba(146,164,180,.22);}
.cot-set-btn{cursor:pointer;font-family:${FONT_STACK};font-size:11px;font-weight:800;
  letter-spacing:.2em;color:#fff7ea;text-transform:uppercase;padding:9px 24px;
  background:linear-gradient(180deg,#ffa02e 0%,#f07800 52%,#d95f00 100%);
  border:1px solid #ffc169;border-bottom:2px solid #a34700;
  text-shadow:0 1px 2px rgba(90,40,0,.6);transition:filter .12s;}
.cot-set-btn:hover{filter:brightness(1.12);}
.cot-set-btn.ghost{background:rgba(11,15,20,.8);color:#9fb0bf;text-shadow:none;
  border:1px solid rgba(146,164,180,.35);border-bottom:2px solid rgba(146,164,180,.45);}
.cot-set-btn.ghost:hover{color:#f0b04a;border-color:rgba(240,176,74,.6);filter:none;}
.cot-set-slider{display:flex;align-items:center;gap:10px;}
.cot-set-slider input[type=range]{width:190px;accent-color:#f0a030;cursor:pointer;}
.cot-set-slider input[type=number]{width:62px;text-align:right;font-size:12px;font-weight:700;
  color:#ffd27a;font-variant-numeric:tabular-nums;letter-spacing:.03em;padding:3px 6px;
  font-family:${FONT_STACK};background:rgba(11,15,20,.9);
  border:1px solid rgba(146,164,180,.4);border-bottom:2px solid rgba(146,164,180,.5);
  -moz-appearance:textfield;appearance:textfield;}
.cot-set-slider input[type=number]:focus{outline:none;border-color:rgba(240,176,74,.65);}
.cot-set-slider input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;}
.cot-set-slider .unit{width:16px;font-size:11px;font-weight:700;color:#8a97a3;}
.cot-set-seg{display:flex;gap:4px;}
.cot-set-seg button{cursor:pointer;font-family:${FONT_STACK};font-size:10px;font-weight:700;
  letter-spacing:.16em;text-transform:uppercase;color:#8a97a3;padding:6px 16px;
  background:linear-gradient(180deg,rgba(30,38,46,.9),rgba(16,21,26,.95));
  border:1px solid rgba(146,164,180,.42);border-bottom:2px solid rgba(146,164,180,.55);
  transition:color .12s,border-color .12s;}
.cot-set-seg button:hover{color:#c6d2dc;}
.cot-set-seg button.sel{color:#ffd27a;border-color:rgba(240,176,74,.75);
  background:linear-gradient(180deg,rgba(90,54,10,.9),rgba(46,28,8,.95));}
.cot-set-toggle{position:relative;width:44px;height:20px;cursor:pointer;
  background:rgba(11,15,20,.9);border:1px solid rgba(146,164,180,.4);transition:background .15s;}
.cot-set-toggle i{position:absolute;top:2px;left:2px;width:14px;height:14px;
  background:#8a97a3;transition:left .15s,background .15s;}
.cot-set-toggle.on{background:rgba(90,54,10,.9);border-color:rgba(240,176,74,.6);}
.cot-set-toggle.on i{left:26px;background:#f0a030;}
.cot-set-note{font-size:10px;letter-spacing:.06em;color:#68747f;margin-top:12px;line-height:1.5;}
.cot-gear{position:fixed;top:24px;right:342px;z-index:62;width:42px;height:42px;display:none;
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
`;

const GEAR_SVG =
  '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="#9fb0bf" d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Zm9.4 5.3-2.1 1.7c.05-.4.08-.8.08-1.2s-.03-.8-.08-1.2l2.1-1.7a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.61-.22l-2.5 1a7.7 7.7 0 0 0-2.06-1.2l-.38-2.65A.5.5 0 0 0 13.45 3h-4a.5.5 0 0 0-.5.43l-.37 2.65c-.75.3-1.44.7-2.06 1.2l-2.5-1a.5.5 0 0 0-.61.22l-2 3.46a.5.5 0 0 0 .12.64l2.11 1.65a7.9 7.9 0 0 0 0 2.42l-2.1 1.65a.5.5 0 0 0-.13.64l2 3.46c.13.22.4.31.61.22l2.5-1c.62.5 1.31.9 2.06 1.2l.37 2.65c.04.25.25.43.5.43h4c.25 0 .46-.18.5-.43l.37-2.65a7.7 7.7 0 0 0 2.06-1.2l2.5 1c.22.09.48 0 .61-.22l2-3.46a.5.5 0 0 0-.12-.64Z" transform="translate(-1.45 -0.5)"/></svg>';

const ESC_HOLD_MS = 700; // hold Esc this long during capture to bind Escape itself
const PAD_START_BUTTON = 9; // START closes the panel for controller players
const MAX_PAD_BUTTONS = 17;

function ensureStyle(id, css) {
  if (!document.getElementById(id)) {
    const s = document.createElement('style');
    s.id = id;
    s.textContent = css;
    document.head.appendChild(s);
  }
}

function el(tag, cls, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

/**
 * Create the settings panel + garage gear button + battle controls-hint strip.
 *
 * @param {{
 *   input: import('../game/input.js').InputLayer,
 *   bus?: {emit:Function,on:Function},
 *   isBattleActive?: () => boolean,   // battle running (phase battle, no result)
 *   gearVisible?: () => boolean,      // gear button should currently show
 * }} opts
 * @returns {{open:Function,close:Function,toggle:Function,isOpen:()=>boolean,
 *   showHints:Function,root:HTMLElement}}
 */
export function createSettings(opts) {
  ensureFonts();
  const { input, bus } = opts;
  const isBattleActive = opts.isBattleActive || (() => false);
  const gearVisible = opts.gearVisible || (() => false);
  const emit = (ev, payload) => { if (bus && bus.emit) bus.emit(ev, payload); };

  ensureStyle('cot-settings-style', SETTINGS_CSS);

  // --- DOM ---------------------------------------------------------------------
  const root = el('div', 'cot-settings');
  root.innerHTML =
    `<div class="cot-set-panel">` +
    `<div class="cot-set-hdr"><h2>SET<b>TINGS</b></h2>` +
    `<button class="cot-set-close" type="button" title="Close">&#10005;</button></div>` +
    `<div class="cot-set-tabs">` +
    `<button class="cot-set-tab sel" data-tab="controls" type="button">Controls</button>` +
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
    `<button class="cot-set-btn resume" type="button">Resume</button></div>` +
    `</div>`;
  document.body.appendChild(root);

  const body = root.querySelector('.cot-set-body');
  const conflictBar = root.querySelector('.cot-set-conflict');
  const conflictMsg = conflictBar.querySelector('.msg');
  const resetBtn = root.querySelector('.reset');

  const gear = el('div', 'cot-gear');
  gear.innerHTML = GEAR_SVG;
  gear.title = 'Settings';
  document.body.appendChild(gear);

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
  let activeTab = 'controls';
  let capture = null; // { actionId, slot: 0|1|'pad', chip }
  let escHoldTimer = null; // pending hold-Esc-to-bind timer during capture
  let conflict = null; // { actionId, slot, otherId, otherSlot, code, pad }
  let relockOnClose = false;
  let hintTimer = null;
  let hintFadeTimer = null;
  let panelRaf = 0; // gamepad poll while the panel is open
  const panelPadPrev = new Array(MAX_PAD_BUTTONS).fill(true);

  const SLOT_NAME = { 0: 'primary', 1: 'secondary' };
  const bindLabel = (id) =>
    input.labelFor(input.getBinding(id, 0) || input.getBinding(id, 1));

  /** Broadcast current shell/consumable hotkey labels so the HUD tray never
   *  shows a stale (or hardcoded) key. */
  function emitBindings() {
    emit('ui:bindingsChanged', {
      shells: ['shell1', 'shell2', 'shell3'].map(bindLabel),
      consumables: ['consumable1', 'consumable2', 'consumable3'].map(bindLabel),
    });
  }

  function bindingsMutated() {
    refreshChips();
    emitBindings();
    emit('ui:click', {});
  }

  // --- CONTROLS tab -----------------------------------------------------------
  const rowByAction = new Map(); // actionId -> { row, chips: {0,1,pad} }

  function chipText(actionId, slotKey) {
    if (slotKey === 'pad') return input.padLabelFor(input.getPadBinding(actionId));
    return input.labelFor(input.getBinding(actionId, slotKey));
  }

  function makeChip(def, slotKey, parent) {
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
    colhdr.innerHTML = '<span>Primary</span><span>Secondary</span><span class="pad">Pad</span>';
    let lastGroup = null;
    for (const def of input.actionDefs) {
      if (def.group !== lastGroup) {
        el('div', 'cot-set-group', body).textContent = def.group;
        lastGroup = def.group;
      }
      const row = el('div', 'cot-set-row', body);
      row.dataset.action = def.id;
      const lb = el('span', 'lb', row);
      lb.textContent = def.label;
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
      'Controller: left stick drives, right stick aims, START opens this menu.';
    refreshChips();
  }

  function refreshChips() {
    for (const def of input.actionDefs) {
      const r = rowByAction.get(def.id);
      if (!r) continue;
      for (const slotKey of [0, 1, 'pad']) {
        const chip = r.chips[slotKey];
        if (capture && capture.chip === chip) continue; // keep listening label
        const t = chipText(def.id, slotKey);
        chip.textContent = t;
        chip.classList.toggle('empty', t === '—');
      }
    }
  }

  // --- GAMEPLAY tab -----------------------------------------------------------
  function sliderRow(parent, label, key, min, max, o = {}) {
    const toD = o.toDisp || ((v) => v);
    const fromD = o.fromDisp || ((v) => v);
    const digits = o.digits != null ? o.digits : 2;
    const row = el('div', 'cot-set-row', parent);
    el('span', 'lb', row).textContent = label;
    const wrap = el('div', 'cot-set-slider', row);
    const range = el('input', '', wrap);
    range.type = 'range';
    range.min = String(min);
    range.max = String(max);
    range.step = o.step || '0.05';
    const num = el('input', '', wrap);
    num.type = 'number';
    num.min = String(toD(min));
    num.max = String(toD(max));
    num.step = o.dispStep || '0.05';
    el('span', 'unit', wrap).textContent = o.unit || '×';
    const sync = () => {
      const v = input.getSettings()[key];
      range.value = String(v);
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

  function renderGameplay() {
    body.textContent = '';
    el('div', 'cot-set-group', body).textContent = 'Mouse';
    sliderRow(body, 'Mouse sensitivity', 'sensitivity', 0.2, 3);
    sliderRow(body, 'Sniper sensitivity scale', 'sniperSensScale', 0.2, 3);
    sliderRow(body, 'Aim smoothing (0% = raw input)', 'aimSmoothing', 0, 1, {
      step: '0.01', dispStep: '1', unit: '%', digits: 0,
      toDisp: (v) => v * 100, fromDisp: (v) => v / 100,
    });

    const row = el('div', 'cot-set-row', body);
    el('span', 'lb', row).textContent = 'Invert vertical aim (Y axis)';
    const tog = el('div', `cot-set-toggle${input.getSettings().invertY ? ' on' : ''}`, row);
    el('i', '', tog);
    tog.addEventListener('click', () => {
      input.setSetting('invertY', !input.getSettings().invertY);
      tog.classList.toggle('on', input.getSettings().invertY);
      emit('ui:click', {});
    });

    el('div', 'cot-set-group', body).textContent = 'Battle';
    const diffRow = el('div', 'cot-set-row', body);
    el('span', 'lb', diffRow).textContent = 'AI difficulty (next battle)';
    const seg = el('div', 'cot-set-seg', diffRow);
    const diffBtns = [];
    for (const tier of ['easy', 'normal', 'hard']) {
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
    const diffNote = el('div', 'cot-set-note', body);
    diffNote.textContent =
      'Easy bots aim slower, react later and engage closer; Hard bots hunt weak spots. ' +
      'Takes effect when the next battle starts.';

    el('div', 'cot-set-group', body).textContent = 'Controller';
    sliderRow(body, 'Controller aim sensitivity', 'padSensitivity', 0.2, 3);
    const padNote = el('div', 'cot-set-note', body);
    padNote.textContent = input.isPadConnected()
      ? 'Controller detected — left stick drives, right stick aims (squared response for fine aim).'
      : 'No controller detected. Plug in any standard gamepad and press a button.';

    const note = el('div', 'cot-set-note', body);
    note.textContent =
      'Sniper sensitivity stacks with the per-zoom reduction, so high zoom always aims finer. ' +
      'Type exact values in the number fields for precise tuning.';
  }

  // --- SOUND tab ---------------------------------------------------------------
  const VOLUME_DEFS = [
    ['volMaster', 'Master volume'],
    ['volEngine', 'Engine volume'],
    ['volCombat', 'Gunfire & impacts volume'],
    ['volAmbience', 'Ambience volume (wind, birds)'],
    ['volUi', 'Interface volume'],
  ];

  /** Broadcast the whole mix so the audio graph re-levels its channel buses. */
  function emitVolumes() {
    const s = input.getSettings();
    emit('ui:volumes', {
      master: s.volMaster,
      engine: s.volEngine,
      combat: s.volCombat,
      ambience: s.volAmbience,
      ui: s.volUi,
    });
  }

  function renderSound() {
    body.textContent = '';
    el('div', 'cot-set-group', body).textContent = 'Volume';
    for (const [key, label] of VOLUME_DEFS) {
      sliderRow(body, label, key, 0, 1, {
        step: '0.01', dispStep: '1', unit: '%', digits: 0,
        toDisp: (v) => v * 100, fromDisp: (v) => v / 100,
        onChange: emitVolumes, blipOnCommit: true,
      });
    }
    const note = el('div', 'cot-set-note', body);
    note.textContent =
      'All audio is synthesized in real time — no samples. Engine, gunfire, ambience and ' +
      'interface mix under the master fader; changes apply instantly and persist. ' +
      'Release a slider to hear a reference blip at the new level.';
  }

  // --- GRAPHICS tab -----------------------------------------------------------
  function renderGraphics() {
    body.textContent = '';
    el('div', 'cot-set-group', body).textContent = 'Quality';
    const row = el('div', 'cot-set-row', body);
    el('span', 'lb', row).textContent = 'Graphics quality';
    const seg = el('div', 'cot-set-seg', row);
    const btns = [];
    for (const name of ['auto', ...PRESET_ORDER]) {
      const b = el('button', '', seg);
      b.type = 'button';
      b.textContent = name === 'auto' ? 'auto' : PRESETS[name].label.toLowerCase();
      b.dataset.name = name;
      b.addEventListener('click', () => {
        setPresetName(name); // persists + live-applies (post chain resize, shadow RT realloc)
        for (const x of btns) x.classList.toggle('sel', x.dataset.name === name);
        emit('ui:click', {});
      });
      btns.push(b);
    }
    for (const x of btns) x.classList.toggle('sel', x.dataset.name === getStoredChoice());
    const note = el('div', 'cot-set-note', body);
    note.textContent =
      'Auto picks High on retina/HiDPI displays and Ultra otherwise. High renders the 3D scene at a ' +
      'capped internal resolution with half-resolution ambient occlusion; Medium/Low also reduce bloom ' +
      'and shadow resolution. Applies instantly, no restart.';
  }

  function renderTab() {
    cancelCapture();
    clearConflict();
    for (const t of root.querySelectorAll('.cot-set-tab')) {
      t.classList.toggle('sel', t.dataset.tab === activeTab);
    }
    resetBtn.style.visibility =
      activeTab === 'controls' || activeTab === 'graphics' || activeTab === 'sound'
        ? 'visible' : 'hidden';
    if (activeTab === 'controls') renderControls();
    else if (activeTab === 'graphics') renderGraphics();
    else if (activeTab === 'sound') renderSound();
    else renderGameplay();
  }

  // --- rebind capture ------------------------------------------------------------
  function beginCapture(actionId, slot, chip) {
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

  function finishCapture(code) {
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

  function finishPadCapture(index) {
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

  function onCaptureMouse(e) {
    if (!capture || capture.slot === 'pad') return;
    e.preventDefault();
    e.stopPropagation();
    finishCapture(`Mouse${e.button}`);
  }

  function onCaptureWheel(e) {
    if (!capture || capture.slot === 'pad' || e.deltaY === 0) return;
    e.preventDefault();
    e.stopPropagation();
    finishCapture(e.deltaY < 0 ? 'WheelUp' : 'WheelDown');
  }

  // --- conflict handling -----------------------------------------------------------
  function showConflict(c) {
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

  conflictBar.querySelector('.swap').addEventListener('click', () => {
    if (!conflict) return;
    if (conflict.pad) input.swapPadBindings(conflict.actionId, conflict.otherId, conflict.code);
    else input.swapBindings(conflict.actionId, conflict.slot, conflict.otherId, conflict.otherSlot, conflict.code);
    clearConflict();
    bindingsMutated();
  });
  conflictBar.querySelector('.dismiss').addEventListener('click', () => {
    clearConflict();
    emit('ui:click', {});
  });

  // --- panel-wide key handling (capture phase; the input layer is disabled) -------
  function onPanelKey(e) {
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

  function onPanelKeyUp(e) {
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
  function openPanel() {
    if (open) return;
    open = true;
    hideResumeVeil(); // the panel supersedes the click-to-resume veil
    relockOnClose = isBattleActive(); // resume grabs the pointer again
    input.setEnabled(false); // menu owns the keyboard; also clears held keys
    input.releaseLock();
    hideHints();
    // Reopen on the tab the player was last tuning (session-sticky): closing
    // the panel mid-iteration on sensitivity or volume no longer bounces the
    // player back to CONTROLS every time.
    renderTab();
    root.classList.add('open');
    window.addEventListener('keydown', onPanelKey, true);
    window.addEventListener('keyup', onPanelKeyUp, true);
    panelPadSnapshot();
    if (!panelRaf) panelRaf = requestAnimationFrame(panelPadTick);
    updateGear();
    emit('ui:click', {});
  }

  function closePanel() {
    if (!open) return;
    cancelCapture();
    clearConflict();
    open = false;
    root.classList.remove('open');
    window.removeEventListener('keydown', onPanelKey, true);
    window.removeEventListener('keyup', onPanelKeyUp, true);
    if (panelRaf) { cancelAnimationFrame(panelRaf); panelRaf = 0; }
    input.setEnabled(true);
    if (relockOnClose && isBattleActive()) input.requestLock();
    updateGear();
    emit('ui:click', {});
  }

  root.addEventListener('mousedown', (e) => e.stopPropagation()); // keep clicks off the game layer
  root.querySelector('.cot-set-close').addEventListener('click', () => api.close());
  root.querySelector('.resume').addEventListener('click', () => api.close());
  resetBtn.addEventListener('click', () => {
    cancelCapture();
    clearConflict();
    if (activeTab === 'graphics') {
      setPresetName('auto');
      renderTab();
      return;
    }
    if (activeTab === 'sound') {
      input.setSetting('volMaster', 0.8);
      for (const key of ['volEngine', 'volCombat', 'volAmbience', 'volUi']) {
        input.setSetting(key, 1);
      }
      emitVolumes();
      renderTab();
      emit('ui:click', {});
      return;
    }
    input.resetBindings();
    bindingsMutated();
  });
  for (const t of root.querySelectorAll('.cot-set-tab')) {
    t.addEventListener('click', () => {
      activeTab = t.dataset.tab;
      renderTab();
      emit('ui:click', {});
    });
  }

  // Esc (or the rebound menu key / pad START) opens the panel whenever the
  // layer is live.
  input.onAction('settingsMenu', () => { if (!open) openPanel(); });

  // WoT behavior: pressing Esc under pointer lock is swallowed by the browser
  // as the unlock gesture — detect the unexpected unlock mid-battle and treat
  // it as "open the menu". Intentional releases flip phase/result first.
  // controls_gunnery r2: ONLY when the page still owns the keyboard — an
  // unlock caused by alt-tab / focus loss shows the click-to-resume veil
  // instead (WoT does not open the options menu after an alt-tab). The
  // focus check runs a tick later: on some platforms pointerlockchange
  // fires before the blur that caused it lands.
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement || open || !isBattleActive()) return;
    setTimeout(() => {
      if (document.pointerLockElement || open || !isBattleActive()) return;
      if (document.hasFocus() && !document.hidden) openPanel();
      else showResumeVeil();
    }, 0);
  });
  // Focus regained with the pointer still unlocked (alt-tab round trip that
  // never fired another pointerlockchange): offer the resume veil.
  window.addEventListener('focus', () => {
    if (!open && isBattleActive() && !input.isLocked()) showResumeVeil();
  });

  // --- gear button (garage) --------------------------------------------------------
  // Event-driven (phase changes + battle start + panel open/close) with a slow
  // interval as a safety net for un-evented flows.
  function updateGear() {
    gear.style.display = !open && gearVisible() ? 'flex' : 'none';
    // Safety net (r2): the resume veil must never outlive the battle — a
    // result can land without a phase:change (end overlay is z 70, veil 79).
    if (!isBattleActive()) hideResumeVeil();
  }
  gear.addEventListener('click', () => { if (!open) openPanel(); });
  if (bus && bus.on) {
    bus.on('phase:change', (ev) => {
      updateGear();
      // leaving battle (garage / result) always clears the resume veil
      if (!ev || ev.phase !== 'battle') hideResumeVeil();
    });
    bus.on('ui:battleStart', updateGear);
  }
  setInterval(updateGear, 150); // fallback only — events above hide/show instantly
  updateGear();

  // --- controls hint strip -----------------------------------------------------------
  function hintGroup(label, actionIds) {
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
    hints.innerHTML =
      hintGroup('Move', ['forward', 'left', 'back', 'right']) +
      hintGroup('Fire', ['fire']) +
      hintGroup('Sniper', ['sniperToggle']) +
      hintGroup('Shells', ['shell1', 'shell2', 'shell3']) +
      hintGroup('Repairs', ['consumable1', 'consumable2', 'consumable3']) +
      hintGroup('Handbrake', ['handbrake']) +
      hintGroup('Menu', ['settingsMenu']);
    hints.style.display = 'flex';
    hints.style.opacity = '1';
    hintTimer = setTimeout(() => {
      hints.style.opacity = '0';
      hintFadeTimer = setTimeout(() => { hints.style.display = 'none'; }, 1300);
    }, 8000);
  }

  const api = {
    root,
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

  return api;
}
