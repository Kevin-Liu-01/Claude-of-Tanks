/**
 * studioPanel.js — SCENE STUDIO control panel (src/game/studio.js's UI).
 *
 * Dark military chrome matching the garage/HUD language: near-black panels,
 * hairline steel borders, amber accent, condensed uppercase labels. The panel
 * is a THIN VIEW over the studio API — every control calls the same
 * window.__STUDIO methods the scripted shoot uses, so anything staged by hand
 * round-trips through state()/load() unchanged.
 *
 * Layout: right dock (scene / actors / selected-actor / effects / time /
 * camera / capture+save), top-left phase badge with EXIT, bottom-left key
 * hints + live camera readout.
 */
import { FONT_STACK, ensureFonts } from './fonts.js';

const CSS = `
.cot-studio{position:fixed;inset:0;z-index:58;display:none;pointer-events:none;
  font-family:${FONT_STACK};color:#e6edf3;-webkit-user-select:none;user-select:none;}
.cot-studio *{box-sizing:border-box;margin:0;padding:0;}
.cot-studio .badge{position:absolute;top:16px;left:20px;pointer-events:auto;display:flex;
  align-items:center;gap:10px;padding:8px 12px;background:rgba(6,9,12,.85);
  border:1px solid rgba(190,204,216,.28);border-left:3px solid #e69a2d;backdrop-filter:blur(4px);}
.cot-studio .badge .bm{width:18px;height:18px;object-fit:contain;display:block;}
.cot-studio .badge .t{font-size:12px;font-weight:800;letter-spacing:.26em;color:#ffd27a;}
.cot-studio .badge .m{font-size:10px;font-weight:700;letter-spacing:.14em;color:#8a97a3;}
.cot-studio .busy{position:absolute;top:16px;left:50%;transform:translateX(-50%);
  padding:8px 18px;background:rgba(6,9,12,.88);border:1px solid rgba(230,154,45,.5);
  color:#ffd27a;font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;display:none;}
.cot-studio .dock{position:absolute;top:0;right:0;bottom:0;width:302px;pointer-events:auto;
  background:linear-gradient(270deg,rgba(5,8,11,.93) 0%,rgba(5,8,11,.88) 82%,rgba(5,8,11,0) 100%);
  padding:14px 14px 14px 26px;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;
  scrollbar-color:rgba(230,154,45,.4) transparent;}
.cot-studio .sec{margin-bottom:13px;border:1px solid rgba(190,204,216,.16);
  background:rgba(9,13,17,.55);padding:9px 10px;}
.cot-studio .sec>.h{font-size:10px;font-weight:800;letter-spacing:.22em;color:#9fb0bf;
  text-transform:uppercase;margin-bottom:8px;border-bottom:1px solid rgba(190,204,216,.14);
  padding-bottom:5px;display:flex;justify-content:space-between;align-items:center;}
.cot-studio .row{display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap;}
.cot-studio label.k{font-size:9px;font-weight:700;letter-spacing:.12em;color:#8a97a3;
  text-transform:uppercase;min-width:52px;}
.cot-studio input[type=range]{flex:1;accent-color:#e69a2d;height:14px;min-width:60px;}
.cot-studio input[type=number],.cot-studio input[type=text]{width:58px;background:rgba(4,7,10,.9);
  border:1px solid rgba(190,204,216,.25);color:#ffd27a;font-family:${FONT_STACK};
  font-size:11px;font-weight:700;padding:3px 5px;}
.cot-studio input[type=text]{width:100%;}
.cot-studio select{background:rgba(4,7,10,.9);border:1px solid rgba(190,204,216,.25);
  color:#e6edf3;font-family:${FONT_STACK};font-size:11px;font-weight:600;padding:4px 5px;flex:1;min-width:0;}
.cot-studio button{cursor:pointer;background:rgba(20,27,34,.9);color:#d8e0e7;
  border:1px solid rgba(190,204,216,.3);font-family:${FONT_STACK};font-size:9.5px;
  font-weight:800;letter-spacing:.1em;text-transform:uppercase;padding:5px 8px;}
.cot-studio button:hover{border-color:#e69a2d;color:#ffd27a;}
.cot-studio button.on{background:linear-gradient(180deg,#8a5a14,#5c3a0a);
  border-color:#ffc169;color:#fff2d9;}
.cot-studio button.prime{background:linear-gradient(180deg,#ffa02e,#d95f00);
  border-color:#ffc169;color:#fff7ea;font-size:11px;padding:8px 10px;width:100%;}
.cot-studio button.warn{border-color:rgba(240,90,90,.55);color:#f0a0a0;}
.cot-studio .grid{display:grid;grid-template-columns:1fr 1fr;gap:5px;}
.cot-studio .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;}
.cot-studio .alist{max-height:150px;overflow-y:auto;scrollbar-width:thin;margin-bottom:6px;}
.cot-studio .arow{display:flex;align-items:center;gap:6px;padding:4px 6px;cursor:pointer;
  border:1px solid transparent;border-left:2px solid rgba(190,204,216,.2);margin-bottom:3px;
  background:rgba(14,19,24,.6);}
.cot-studio .arow:hover{border-color:rgba(230,154,45,.4);}
.cot-studio .arow.sel{border-color:#e69a2d;border-left-color:#ffd27a;background:rgba(52,36,12,.55);}
.cot-studio .arow .nm{flex:1;font-size:11px;font-weight:700;color:#e6edf3;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;}
.cot-studio .arow .st{font-size:8px;font-weight:800;letter-spacing:.08em;color:#8a97a3;
  text-transform:uppercase;}
.cot-studio .arow .del{padding:1px 6px;font-size:10px;}
.cot-studio .foot{position:absolute;left:20px;bottom:14px;pointer-events:none;
  font-size:10px;font-weight:600;letter-spacing:.08em;color:#9fb0bf;
  text-shadow:0 1px 4px rgba(0,0,0,.9);line-height:1.7;}
.cot-studio .foot .cam{color:#ffd27a;font-weight:700;}
.cot-studio .val{font-size:10px;font-weight:800;color:#ffd27a;min-width:34px;text-align:right;}
`;

/**
 * Build the studio panel.
 * @param {object} S the studio API (createStudio's `api`)
 * @returns {object} { root, show, hide, tick, setBusy, setSelected,
 *   setPlaceArmed, refreshActors, refreshSelected, refreshCamera,
 *   refreshTime, refreshAll }
 */
export function createStudioPanel(S) {
  ensureFonts();
  if (!document.getElementById('cot-studio-css')) {
    const st = document.createElement('style');
    st.id = 'cot-studio-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  const root = el('div', 'cot-studio');
  document.body.appendChild(root);

  // --- top badge -------------------------------------------------------------
  const badge = el('div', 'badge');
  const badgeMark = document.createElement('img');
  badgeMark.className = 'bm';
  badgeMark.src = '/brand/nav/studio.png'; // the owner's gate-diff studio mark
  badgeMark.alt = '';
  badgeMark.draggable = false;
  const badgeTitle = el('div', 't', 'SCENE STUDIO');
  const badgeMap = el('div', 'm', '');
  const exitBtn = el('button', null, 'EXIT (F8)');
  exitBtn.addEventListener('click', () => S.exit());
  badge.append(badgeMark, badgeTitle, badgeMap, exitBtn);
  root.appendChild(badge);

  const busy = el('div', 'busy');
  root.appendChild(busy);

  // --- right dock --------------------------------------------------------------
  const dock = el('div', 'dock');
  root.appendChild(dock);
  // keep canvas drag-look from firing when interacting with the dock
  for (const evName of ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'keydown']) {
    dock.addEventListener(evName, (e) => e.stopPropagation());
  }

  // === SCENE section ===
  const secScene = section('Battlefield');
  const mapRow = el('div', 'grid');
  const mapBtns = {};
  for (const id of S.MAP_IDS) {
    const b = el('button', null, id.toUpperCase());
    b.addEventListener('click', () => S.setMap(id));
    mapBtns[id] = b;
    mapRow.appendChild(b);
  }
  secScene.appendChild(mapRow);
  dock.appendChild(secScene);

  // === ACTORS section ===
  const secActors = section('Actors');
  const addRow = el('div', 'row');
  const specSel = document.createElement('select');
  {
    const core = document.createElement('optgroup');
    core.label = 'Core roster';
    const rest = document.createElement('optgroup');
    rest.label = 'Extended roster';
    S.TANK_IDS.forEach((id, i) => {
      const o = document.createElement('option');
      o.value = id;
      let nm = id;
      try { nm = S.getSpecInfo(id).name; } catch (_) { /* keep id */ }
      o.textContent = nm;
      (i < 8 ? core : rest).appendChild(o);
    });
    specSel.append(core, rest);
    specSel.value = 'm1a2';
  }
  addRow.appendChild(specSel);
  secActors.appendChild(addRow);
  const addRow2 = el('div', 'grid');
  const addAtMarker = el('button', null, 'ADD @ MARKER');
  addAtMarker.addEventListener('click', () => {
    const p = S._internal.markerPos;
    S.addActor({ id: specSel.value, pos: [p.x, p.z] });
  });
  const placeBtn = el('button', null, 'CLICK TO PLACE');
  placeBtn.addEventListener('click', () => {
    S._internal.placeArmed = S._internal.placeArmed ? null : specSel.value;
    api.setPlaceArmed(S._internal.placeArmed);
  });
  addRow2.append(addAtMarker, placeBtn);
  secActors.appendChild(addRow2);
  const alist = el('div', 'alist');
  secActors.appendChild(alist);
  dock.appendChild(secActors);

  // === SELECTED ACTOR section ===
  const secSel = section('Selected actor');
  const selName = el('div', null, '');
  selName.style.cssText = 'font-size:12px;font-weight:800;color:#ffd27a;margin-bottom:7px;letter-spacing:.06em;';
  secSel.appendChild(selName);
  const facing = sliderRow('Facing', 0, 360, 1, (v) => patchSel({ facingDeg: v }));
  const turret = sliderRow('Turret', -180, 180, 1, (v) => patchSel({ turretDeg: v }));
  const gun = sliderRow('Gun', -10, 25, 0.5, (v) => patchSel({ gunDeg: v }));
  secSel.append(facing.row, turret.row, gun.row);
  const posRow = el('div', 'row');
  posRow.appendChild(el('label', 'k', 'Pos X/Z'));
  const px = numInput((v) => patchSel({ x: v }));
  const pz = numInput((v) => patchSel({ z: v }));
  posRow.append(px, pz);
  secSel.appendChild(posRow);
  const camoRow = el('div', 'row');
  camoRow.appendChild(el('label', 'k', 'Camo'));
  const camoSel = document.createElement('select');
  for (const cid of ['inherit', ...S.CAMO_PATTERN_IDS]) {
    const o = document.createElement('option');
    o.value = cid;
    o.textContent = cid === 'inherit' ? '(garage pick)' : cid.toUpperCase();
    camoSel.appendChild(o);
  }
  camoSel.addEventListener('change', () => patchSel({ camo: camoSel.value === 'inherit' ? null : camoSel.value }));
  camoRow.appendChild(camoSel);
  secSel.appendChild(camoRow);
  const stateRow = el('div', 'row');
  stateRow.appendChild(el('label', 'k', 'State'));
  const stateSel = document.createElement('select');
  for (const sid of S.ACTOR_STATES) {
    const o = document.createElement('option');
    o.value = sid;
    o.textContent = sid.toUpperCase();
    stateSel.appendChild(o);
  }
  stateSel.addEventListener('change', () => {
    const a = S._internal.selected;
    if (a) S.setActorState(a, stateSel.value);
  });
  stateRow.appendChild(stateSel);
  secSel.appendChild(stateRow);
  const delRow = el('div', 'grid');
  const recoilBtn = el('button', null, 'RECOIL POSE');
  recoilBtn.addEventListener('click', () => patchSel({ recoilAgeS: 0.05 }));
  const delBtn = el('button', 'warn', 'REMOVE');
  delBtn.addEventListener('click', () => { const a = S._internal.selected; if (a) S.removeActor(a); });
  delRow.append(recoilBtn, delBtn);
  secSel.appendChild(delRow);
  dock.appendChild(secSel);

  // === EFFECTS section ===
  const secFx = section('Effects', 'sel actor · else marker');
  const fxGrid = el('div', 'grid');
  const fxBtn = (label, fn, wide = false) => {
    const b = el('button', null, label);
    if (wide) b.style.gridColumn = '1 / -1';
    b.addEventListener('click', fn);
    fxGrid.appendChild(b);
    return b;
  };
  const selOr = (fn, needActor = false) => {
    const a = S._internal.selected;
    if (needActor && !a) { flashBusy('SELECT AN ACTOR FIRST'); return null; }
    return fn(a);
  };
  fxBtn('FIRE GUN', () => selOr((a) => S.effect({ type: 'fire', actor: a.uid }), true));
  fxBtn('MUZZLE FLASH', () => selOr((a) => S.effect(a
    ? { type: 'muzzle_flash', actor: a.uid } : { type: 'muzzle_flash' })));
  fxBtn('TANK KILL', () => selOr((a) => S.effect({ type: 'tank_kill', actor: a.uid }), true));
  fxBtn('DETRACK R', () => selOr((a) => S.effect({ type: 'detrack', actor: a.uid, params: { side: 'R' } }), true));
  fxBtn('EXPL SMALL', () => S.effect({ type: 'explosion', params: { size: 'small' } }));
  fxBtn('EXPL MEDIUM', () => S.effect({ type: 'explosion', params: { size: 'medium' } }));
  fxBtn('EXPL LARGE', () => S.effect({ type: 'explosion', params: { size: 'large' } }));
  fxBtn('IMPACT PEN', () => S.effect({ type: 'impact', params: { kind: 'pen' } }));
  fxBtn('SPARKS', () => S.effect({ type: 'sparks' }));
  fxBtn('DUST BURST', () => selOr((a) => S.effect(a
    ? { type: 'dust', actor: a.uid } : { type: 'dust' })));
  fxBtn('ENGINE SMOKE', () => selOr((a) => S.effect({ type: 'engine_smoke', actor: a.uid }), true));
  fxBtn('SET BURNING', () => selOr((a) => S.effect({ type: 'burning', actor: a.uid }), true));
  fxBtn('FIRING MOMENT (frozen 50 ms)', () => selOr((a) => S.effect({ type: 'firing_moment', actor: a.uid, params: { ageS: 0.05 } }), true), true);
  fxBtn('TRACER  MARKER → ACTOR', () => selOr((a) => {
    const m = S._internal.markerPos;
    const t = a.state.pos;
    S.effect({
      type: 'tracer',
      from: [m.x, m.y + 1.8, m.z],
      to: [t.x, t.y + a.spec.dims.heightM * 0.6, t.z],
      params: { shellType: 'APFSDS' },
    });
  }, true), true);
  secFx.appendChild(fxGrid);
  dock.appendChild(secFx);

  // === TIME section ===
  const secTime = section('FX time');
  const ts = sliderRow('Scale', 0, 2, 0.05, (v) => S.setTimeScale(v));
  secTime.appendChild(ts.row);
  const timeRow = el('div', 'grid3');
  const pauseBtn = el('button', null, 'FREEZE');
  pauseBtn.addEventListener('click', () => S.setTimeScale(S.timeScale === 0 ? 1 : 0));
  const step1 = el('button', null, '+16 MS');
  step1.addEventListener('click', () => S.advanceFx(16.7));
  const step2 = el('button', null, '+250 MS');
  step2.addEventListener('click', () => S.advanceFx(250));
  timeRow.append(pauseBtn, step1, step2);
  secTime.appendChild(timeRow);
  const clockLine = el('div', null, '');
  clockLine.style.cssText = 'font-size:10px;font-weight:700;color:#8a97a3;margin-top:5px;letter-spacing:.1em;';
  secTime.appendChild(clockLine);
  const resetFxBtn = el('button', 'warn', 'RESET FX TIMELINE');
  resetFxBtn.style.cssText = 'width:100%;margin-top:6px;';
  resetFxBtn.addEventListener('click', () => S.clearEffects());
  secTime.appendChild(resetFxBtn);
  dock.appendChild(secTime);

  // === CAMERA section ===
  const secCam = section('Camera');
  const camModeRow = el('div', 'grid');
  const flyBtn = el('button', null, 'FREE-FLY');
  const orbBtn = el('button', null, 'ORBIT');
  flyBtn.addEventListener('click', () => { S.setCamera({ mode: 'fly' }); api.refreshCamera(); });
  orbBtn.addEventListener('click', () => {
    const a = S._internal.selected;
    const m = S._internal.markerPos;
    const t = a ? a.state.pos : m;
    S.setCamera({ mode: 'orbit', lookAt: [t.x, t.y + 1.6, t.z] });
    api.refreshCamera();
  });
  camModeRow.append(flyBtn, orbBtn);
  secCam.appendChild(camModeRow);
  const fov = sliderRow('FOV', 15, 100, 1, (v) => S.setCamera({ fov: v }));
  const roll = sliderRow('Roll', -45, 45, 0.5, (v) => S.setCamera({ rollDeg: v }));
  const spd = sliderRow('Speed', 2, 60, 1, (v) => { S._internal.cam.speed = v; });
  secCam.append(fov.row, roll.row, spd.row);
  dock.appendChild(secCam);

  // === CAPTURE + SAVE section ===
  const secCap = section('Capture · Scene');
  const capRow = el('div', 'row');
  capRow.appendChild(el('label', 'k', 'Width'));
  const capSel = document.createElement('select');
  for (const [label, w] of [['2560 px', 2560], ['3200 px', 3200], ['3840 px', 3840], ['5120 px', 5120]]) {
    const o = document.createElement('option');
    o.value = String(w);
    o.textContent = label;
    capSel.appendChild(o);
  }
  capRow.appendChild(capSel);
  secCap.appendChild(capRow);
  const capBtn = el('button', 'prime', 'CAPTURE PNG');
  capBtn.addEventListener('click', () => {
    S.capture({ width: parseInt(capSel.value, 10), download: true });
  });
  secCap.appendChild(capBtn);
  const svRow = el('div', 'grid3');
  svRow.style.marginTop = '6px';
  const saveBtn = el('button', null, 'SAVE JSON');
  saveBtn.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(S.state(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `studio_scene_${S.mapId || 'map'}_${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });
  const loadBtn = el('button', null, 'LOAD JSON');
  const fileIn = document.createElement('input');
  fileIn.type = 'file';
  fileIn.accept = 'application/json,.json';
  fileIn.style.display = 'none';
  fileIn.addEventListener('change', () => {
    const f = fileIn.files && fileIn.files[0];
    if (!f) return;
    f.text().then((txt) => S.load(JSON.parse(txt)))
      .catch((err) => flashBusy(`LOAD FAILED: ${err.message}`));
    fileIn.value = '';
  });
  loadBtn.addEventListener('click', () => fileIn.click());
  const copyBtn = el('button', null, 'COPY JSON');
  copyBtn.addEventListener('click', () => {
    const txt = JSON.stringify(S.state());
    if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(() => {});
    flashBusy('SCENE JSON COPIED');
  });
  svRow.append(saveBtn, loadBtn, copyBtn);
  secCap.append(svRow, fileIn);
  // localStorage slots
  const slotRow = el('div', 'grid3');
  slotRow.style.marginTop = '5px';
  for (let i = 1; i <= 3; i++) {
    const b = el('button', null, `SLOT ${i}`);
    b.title = 'Click: load · Shift-click: save';
    b.addEventListener('click', (e) => {
      const key = `cot.studio.slot${i}.v1`;
      if (e.shiftKey) {
        try {
          localStorage.setItem(key, JSON.stringify(S.state()));
          flashBusy(`SAVED SLOT ${i}`);
        } catch (_) { flashBusy('SAVE FAILED'); }
      } else {
        const txt = localStorage.getItem(key);
        if (!txt) { flashBusy(`SLOT ${i} EMPTY (shift-click saves)`); return; }
        S.load(JSON.parse(txt)).catch((err) => flashBusy(`LOAD FAILED: ${err.message}`));
      }
    });
    slotRow.appendChild(b);
  }
  secCap.appendChild(slotRow);
  dock.appendChild(secCap);

  // --- footer hints ------------------------------------------------------------
  const foot = el('div', 'foot');
  const footCam = el('div', 'cam', '');
  const footHint = el('div', null,
    'LMB-drag look · WASD fly · Q/E height · Shift fast · wheel dolly · ' +
    'click terrain = marker · click tank = select · drag tank = move · Space freeze · F8 exit');
  foot.append(footCam, footHint);
  root.appendChild(foot);

  // --- helpers -------------------------------------------------------------------
  function el(tag, cls, text) {
    const d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text != null) d.textContent = text;
    return d;
  }
  function section(title, sub) {
    const s = el('div', 'sec');
    const h = el('div', 'h', title);
    if (sub) {
      const sb = el('span', null, sub);
      sb.style.cssText = 'font-size:8px;color:#5f6b76;letter-spacing:.08em;';
      h.appendChild(sb);
    }
    s.appendChild(h);
    return s;
  }
  function sliderRow(label, min, max, step, onInput) {
    const row = el('div', 'row');
    row.appendChild(el('label', 'k', label));
    const r = document.createElement('input');
    r.type = 'range';
    r.min = String(min);
    r.max = String(max);
    r.step = String(step);
    const val = el('div', 'val', '');
    r.addEventListener('input', () => {
      val.textContent = r.value;
      onInput(parseFloat(r.value));
    });
    row.append(r, val);
    return {
      row, input: r,
      set(v) { r.value = String(v); val.textContent = String(Math.round(v * 10) / 10); },
      setRange(mn, mx) { r.min = String(mn); r.max = String(mx); },
    };
  }
  function numInput(onChange) {
    const n = document.createElement('input');
    n.type = 'number';
    n.step = '1';
    n.addEventListener('change', () => onChange(parseFloat(n.value) || 0));
    return n;
  }
  function patchSel(patch) {
    const a = S._internal.selected;
    if (a) { S.updateActor(a, patch); }
  }
  let busyTimer = 0;
  function flashBusy(text) {
    api.setBusy(text);
    clearTimeout(busyTimer);
    busyTimer = setTimeout(() => api.setBusy(null), 1600);
  }

  // --- public panel API -------------------------------------------------------
  let refreshAcc = 0;
  const api = {
    root,
    show() { root.style.display = 'block'; api.refreshAll(); },
    hide() { root.style.display = 'none'; },
    setBusy(text) {
      busy.style.display = text ? 'block' : 'none';
      if (text) busy.textContent = text;
    },
    setPlaceArmed(specId) {
      placeBtn.classList.toggle('on', !!specId);
      placeBtn.textContent = specId ? `CLICK MAP TO PLACE ${specId.toUpperCase()}` : 'CLICK TO PLACE';
    },
    setSelected() { api.refreshActors(); api.refreshSelected(); },
    refreshActors() {
      alist.textContent = '';
      const sel = S._internal.selected;
      S._internal.actors.forEach((a) => {
        const row = el('div', 'arow' + (a === sel ? ' sel' : ''));
        row.appendChild(el('div', 'nm', `${a.name ? a.name + ' · ' : ''}${a.spec.name}`));
        row.appendChild(el('div', 'st', a.stateName));
        const del = el('button', 'del', '✕');
        del.addEventListener('click', (e) => { e.stopPropagation(); S.removeActor(a); });
        row.appendChild(del);
        row.addEventListener('click', () => S.selectActor(a.uid));
        alist.appendChild(row);
      });
      api.refreshSelected();
    },
    refreshSelected() {
      const a = S._internal.selected;
      secSel.style.opacity = a ? '1' : '0.35';
      if (!a) { selName.textContent = 'NONE — CLICK A TANK'; return; }
      selName.textContent = `${a.spec.name}  ·  ${a.uid}`;
      gun.setRange(-(a.spec.gunDepressionDeg ?? 10), a.spec.gunElevationDeg ?? 20);
      facing.set(a.pose.facingDeg);
      turret.set(a.pose.turretDeg);
      gun.set(a.pose.gunDeg);
      px.value = String(Math.round(a.pose.x * 10) / 10);
      pz.value = String(Math.round(a.pose.z * 10) / 10);
      camoSel.value = a.camo || 'inherit';
      stateSel.value = a.stateName;
    },
    refreshCamera() {
      const c = S.getCamera();
      fov.set(c.fov);
      roll.set(c.rollDeg);
      spd.set(S._internal.cam.speed);
      flyBtn.classList.toggle('on', c.mode === 'fly');
      orbBtn.classList.toggle('on', c.mode === 'orbit');
    },
    refreshTime() {
      ts.set(S.timeScale);
      pauseBtn.textContent = S.timeScale === 0 ? 'PLAY' : 'FREEZE';
      pauseBtn.classList.toggle('on', S.timeScale === 0);
      clockLine.textContent = `T = ${(S.fxTimeMs / 1000).toFixed(2)} s  ·  ×${S.timeScale.toFixed(2)}`;
    },
    refreshMap() {
      const id = S.mapId;
      badgeMap.textContent = id ? id.toUpperCase() : '';
      for (const [mid, b] of Object.entries(mapBtns)) b.classList.toggle('on', mid === id);
    },
    refreshAll() {
      api.refreshMap();
      api.refreshActors();
      api.refreshCamera();
      api.refreshTime();
    },
    tick(dt) {
      refreshAcc += dt;
      if (refreshAcc < 0.25) return;
      refreshAcc = 0;
      const c = S.getCamera();
      footCam.textContent =
        `CAM ${c.pos.map((v) => v.toFixed(1)).join(', ')}  ·  yaw ${c.yawDeg.toFixed(1)}°  ` +
        `pitch ${c.pitchDeg.toFixed(1)}°  ·  fov ${c.fov.toFixed(0)}  ·  T ${(S.fxTimeMs / 1000).toFixed(2)}s`;
      api.refreshTime();
    },
  };
  return api;
}
