// src/ui/settings.js — in-game settings panel (Esc in battle, gear in garage).
//
// CONTROLS tab: every action from src/game/input.js with its bound key as a
// clickable chip — click, press any key/mouse button to rebind (Esc cancels);
// conflicts highlight both rows and offer a swap. GAMEPLAY tab: mouse
// sensitivity (0.2x–3x), invert-Y, sniper sensitivity scaling. All state
// persists via the input layer's localStorage stores. Also owns the fading
// controls-hint strip shown on battle start and the garage gear button.
// Design language mirrors src/ui/hud.js / garage.js (palette, chamfers, type).

const FONT_STACK = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const SETTINGS_CSS = `
.cot-settings{position:fixed;inset:0;z-index:80;display:none;align-items:center;justify-content:center;
  background:rgba(4,7,10,.62);font-family:${FONT_STACK};color:#e6edf3;
  -webkit-user-select:none;user-select:none;}
.cot-settings.open{display:flex;}
.cot-settings *{box-sizing:border-box;margin:0;padding:0;}
.cot-set-panel{width:620px;max-width:94vw;max-height:86vh;display:flex;flex-direction:column;
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
.cot-chip{min-width:72px;text-align:center;cursor:pointer;font-family:${FONT_STACK};
  font-size:11px;font-weight:700;letter-spacing:.08em;color:#e6edf3;padding:5px 12px;
  background:linear-gradient(180deg,rgba(30,38,46,.9),rgba(16,21,26,.95));
  border:1px solid rgba(146,164,180,.42);border-bottom:2px solid rgba(146,164,180,.55);
  transition:color .12s,border-color .12s;}
.cot-chip:hover{color:#ffd27a;border-color:rgba(240,176,74,.65);}
.cot-chip.listening{color:#f0b04a;border-color:#f0a030;animation:cotChipPulse 1.1s ease-in-out infinite;}
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
.cot-set-slider input[type=range]{width:210px;accent-color:#f0a030;cursor:pointer;}
.cot-set-slider .val{width:56px;text-align:right;font-size:12px;font-weight:700;color:#ffd27a;
  font-variant-numeric:tabular-nums;letter-spacing:.03em;}
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
`;

const GEAR_SVG =
  '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="#9fb0bf" d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Zm9.4 5.3-2.1 1.7c.05-.4.08-.8.08-1.2s-.03-.8-.08-1.2l2.1-1.7a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.61-.22l-2.5 1a7.7 7.7 0 0 0-2.06-1.2l-.38-2.65A.5.5 0 0 0 13.45 3h-4a.5.5 0 0 0-.5.43l-.37 2.65c-.75.3-1.44.7-2.06 1.2l-2.5-1a.5.5 0 0 0-.61.22l-2 3.46a.5.5 0 0 0 .12.64l2.11 1.65a7.9 7.9 0 0 0 0 2.42l-2.1 1.65a.5.5 0 0 0-.13.64l2 3.46c.13.22.4.31.61.22l2.5-1c.62.5 1.31.9 2.06 1.2l.37 2.65c.04.25.25.43.5.43h4c.25 0 .46-.18.5-.43l.37-2.65a7.7 7.7 0 0 0 2.06-1.2l2.5 1c.22.09.48 0 .61-.22l2-3.46a.5.5 0 0 0-.12-.64Z" transform="translate(-1.45 -0.5)"/></svg>';

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

  // --- state ---------------------------------------------------------------------
  let open = false;
  let activeTab = 'controls';
  let capture = null; // { actionId, chip }
  let conflict = null; // { actionId, otherId, code }
  let relockOnClose = false;
  let hintTimer = null;
  let hintFadeTimer = null;

  // --- CONTROLS tab -----------------------------------------------------------
  const rowByAction = new Map();
  function renderControls() {
    body.textContent = '';
    rowByAction.clear();
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
      const chip = el('button', 'cot-chip', row);
      chip.type = 'button';
      chip.textContent = input.labelFor(input.getBinding(def.id));
      chip.addEventListener('click', () => {
        emit('ui:click', {});
        beginCapture(def.id, chip);
      });
      rowByAction.set(def.id, { row, chip });
    }
    const note = el('div', 'cot-set-note', body);
    note.textContent = 'Click a key chip, then press any key or mouse button to rebind. Esc cancels.';
  }

  function refreshChips() {
    for (const def of input.actionDefs) {
      const r = rowByAction.get(def.id);
      if (r) r.chip.textContent = input.labelFor(input.getBinding(def.id));
    }
  }

  // --- GAMEPLAY tab -----------------------------------------------------------
  function sliderRow(parent, label, key, min, max, fmt) {
    const row = el('div', 'cot-set-row', parent);
    el('span', 'lb', row).textContent = label;
    const wrap = el('div', 'cot-set-slider', row);
    const range = el('input', '', wrap);
    range.type = 'range';
    range.min = String(min);
    range.max = String(max);
    range.step = '0.05';
    range.value = String(input.getSettings()[key]);
    const val = el('span', 'val', wrap);
    val.textContent = fmt(input.getSettings()[key]);
    range.addEventListener('input', () => {
      input.setSetting(key, parseFloat(range.value));
      val.textContent = fmt(input.getSettings()[key]);
    });
  }

  function renderGameplay() {
    body.textContent = '';
    el('div', 'cot-set-group', body).textContent = 'Mouse';
    const fmt = (v) => `${v.toFixed(2)}×`;
    sliderRow(body, 'Mouse sensitivity', 'sensitivity', 0.2, 3, fmt);
    sliderRow(body, 'Sniper sensitivity scale', 'sniperSensScale', 0.2, 3, fmt);

    const row = el('div', 'cot-set-row', body);
    el('span', 'lb', row).textContent = 'Invert vertical aim (Y axis)';
    const tog = el('div', `cot-set-toggle${input.getSettings().invertY ? ' on' : ''}`, row);
    el('i', '', tog);
    tog.addEventListener('click', () => {
      input.setSetting('invertY', !input.getSettings().invertY);
      tog.classList.toggle('on', input.getSettings().invertY);
      emit('ui:click', {});
    });

    const note = el('div', 'cot-set-note', body);
    note.textContent = 'Sniper sensitivity stacks with the per-zoom reduction, so high zoom always aims finer.';
  }

  function renderTab() {
    cancelCapture();
    clearConflict();
    for (const t of root.querySelectorAll('.cot-set-tab')) {
      t.classList.toggle('sel', t.dataset.tab === activeTab);
    }
    resetBtn.style.visibility = activeTab === 'controls' ? 'visible' : 'hidden';
    if (activeTab === 'controls') renderControls();
    else renderGameplay();
  }

  // --- rebind capture ------------------------------------------------------------
  function beginCapture(actionId, chip) {
    cancelCapture();
    clearConflict();
    capture = { actionId, chip };
    chip.classList.add('listening');
    chip.textContent = 'PRESS KEY…';
    window.addEventListener('mousedown', onCaptureMouse, true);
  }

  function cancelCapture() {
    if (!capture) return;
    capture.chip.classList.remove('listening');
    capture = null;
    window.removeEventListener('mousedown', onCaptureMouse, true);
    refreshChips();
  }

  function finishCapture(code) {
    const { actionId } = capture;
    cancelCapture();
    if (code === input.getBinding(actionId)) return; // no-op rebind
    const otherId = input.findConflict(code, actionId);
    if (otherId) {
      showConflict(actionId, otherId, code);
      return;
    }
    input.setBinding(actionId, code);
    refreshChips();
    emit('ui:click', {});
  }

  function onCaptureMouse(e) {
    if (!capture) return;
    e.preventDefault();
    e.stopPropagation();
    finishCapture(`Mouse${e.button}`);
  }

  // --- conflict handling -----------------------------------------------------------
  function showConflict(actionId, otherId, code) {
    conflict = { actionId, otherId, code };
    const defA = input.actionDefs.find((d) => d.id === actionId);
    const defB = input.actionDefs.find((d) => d.id === otherId);
    conflictMsg.innerHTML =
      `<b>${input.labelFor(code)}</b>&nbsp; is already bound to &nbsp;<b>${defB ? defB.label : otherId}</b>` +
      `&nbsp;&mdash; swap it with ${defA ? defA.label : actionId}?`;
    conflictBar.classList.add('show');
    for (const id of [actionId, otherId]) {
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
    input.swapBindings(conflict.actionId, conflict.otherId, conflict.code);
    clearConflict();
    refreshChips();
    emit('ui:click', {});
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
      if (e.code === 'Escape') cancelCapture();
      else if (!e.repeat) finishCapture(e.code);
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

  // --- open/close -----------------------------------------------------------------
  function openPanel() {
    if (open) return;
    open = true;
    relockOnClose = isBattleActive(); // resume grabs the pointer again
    input.setEnabled(false); // menu owns the keyboard; also clears held keys
    input.releaseLock();
    hideHints();
    activeTab = 'controls';
    renderTab();
    root.classList.add('open');
    window.addEventListener('keydown', onPanelKey, true);
    emit('ui:click', {});
  }

  function closePanel() {
    if (!open) return;
    cancelCapture();
    clearConflict();
    open = false;
    root.classList.remove('open');
    window.removeEventListener('keydown', onPanelKey, true);
    input.setEnabled(true);
    if (relockOnClose && isBattleActive()) input.requestLock();
    emit('ui:click', {});
  }

  root.addEventListener('mousedown', (e) => e.stopPropagation()); // keep clicks off the game layer
  root.querySelector('.cot-set-close').addEventListener('click', () => api.close());
  root.querySelector('.resume').addEventListener('click', () => api.close());
  resetBtn.addEventListener('click', () => {
    cancelCapture();
    clearConflict();
    input.resetBindings();
    refreshChips();
    emit('ui:click', {});
  });
  for (const t of root.querySelectorAll('.cot-set-tab')) {
    t.addEventListener('click', () => {
      activeTab = t.dataset.tab;
      renderTab();
      emit('ui:click', {});
    });
  }

  // Esc (or the rebound menu key) opens the panel whenever the layer is live.
  input.onAction('settingsMenu', () => { if (!open) openPanel(); });

  // WoT behavior: pressing Esc under pointer lock is swallowed by the browser
  // as the unlock gesture — detect the unexpected unlock mid-battle and treat
  // it as "open the menu". Intentional releases flip phase/result first.
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && !open && isBattleActive()) openPanel();
  });

  // --- gear button (garage) --------------------------------------------------------
  gear.addEventListener('click', () => { if (!open) openPanel(); });
  setInterval(() => {
    gear.style.display = !open && gearVisible() ? 'flex' : 'none';
  }, 300);

  // --- controls hint strip -----------------------------------------------------------
  function hintGroup(label, actionIds) {
    const kbds = actionIds
      .map((id) => `<kbd>${input.labelFor(input.getBinding(id))}</kbd>`)
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
  return api;
}
