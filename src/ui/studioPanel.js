/**
 * studioPanel.js — SCENE STUDIO control panel (src/game/studio.js's UI).
 *
 * Workspace layout: five focused panes (Scene / Actor / FX / Camera / Output)
 * replace the old 2,000 px scroll wall. The panel stays a THIN VIEW over the
 * studio API — every control
 * calls the same window.__STUDIO methods the scripted shoot uses, so
 * anything staged by hand round-trips through state()/load() unchanged.
 *
 * Layout: right workspace dock, top-left phase badge with EXIT,
 * bottom-left key hints + live camera readout.
 */
import { FONT_STACK, ensureFonts } from './fonts.js';
import { iconUrl } from './icons.js';

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
.cot-studio .dock{position:absolute;top:0;right:0;bottom:0;width:360px;pointer-events:auto;
  background:linear-gradient(270deg,rgba(5,8,11,.97) 0%,rgba(5,8,11,.94) 88%,rgba(5,8,11,.15) 100%);
  padding:12px 14px 14px 30px;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;
  scrollbar-color:rgba(230,154,45,.4) transparent;}
.cot-studio .dock::-webkit-scrollbar{width:7px;}
.cot-studio .dock::-webkit-scrollbar-thumb{background:rgba(230,154,45,.35);}
.cot-studio .docknav{position:sticky;top:-12px;z-index:6;display:grid;
  grid-template-columns:repeat(5,1fr);gap:3px;margin:-12px -2px 12px;padding:12px 2px 9px;
  background:linear-gradient(180deg,rgba(5,8,11,1) 74%,rgba(5,8,11,.8) 100%);
  border-bottom:1px solid rgba(190,204,216,.16);}
.cot-studio .docknav button{padding:8px 2px 7px;font-size:8px;letter-spacing:.12em;
  border-color:transparent;border-bottom-color:rgba(190,204,216,.22);background:rgba(10,15,20,.72);}
.cot-studio .docknav button.on{background:rgba(92,58,10,.72);border-color:rgba(230,154,45,.45);
  border-bottom-color:#ffd27a;color:#fff2d9;}
.cot-studio .sec[data-pane]{display:none;}
.cot-studio[data-pane="scene"] .sec[data-pane="scene"],
.cot-studio[data-pane="actor"] .sec[data-pane="actor"],
.cot-studio[data-pane="fx"] .sec[data-pane="fx"],
.cot-studio[data-pane="camera"] .sec[data-pane="camera"],
.cot-studio[data-pane="output"] .sec[data-pane="output"]{display:block;}
.cot-studio .sec{position:relative;margin-bottom:12px;border:1px solid rgba(190,204,216,.18);
  background:rgba(9,13,17,.6);padding:10px 10px 9px;}
.cot-studio .sec::before{content:'';position:absolute;top:-1px;left:-1px;width:3px;height:17px;
  background:#e69a2d;}
.cot-studio .sec>.h{font-size:10px;font-weight:800;letter-spacing:.24em;color:#c9d4dd;
  text-transform:uppercase;margin-bottom:9px;border-bottom:1px solid rgba(190,204,216,.16);
  padding-bottom:6px;padding-left:7px;display:flex;justify-content:space-between;align-items:baseline;}
.cot-studio .sec>.h .sub{font-size:8px;color:#5f6b76;letter-spacing:.1em;font-weight:700;}
.cot-studio .row{display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap;}
.cot-studio label.k{font-size:9px;font-weight:700;letter-spacing:.12em;color:#8a97a3;
  text-transform:uppercase;min-width:52px;}
.cot-studio input[type=range]{flex:1;-webkit-appearance:none;appearance:none;height:16px;
  min-width:60px;background:transparent;}
.cot-studio input[type=range]::-webkit-slider-runnable-track{height:3px;
  background:linear-gradient(90deg,rgba(230,154,45,.55),rgba(190,204,216,.22));}
.cot-studio input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:11px;height:13px;
  margin-top:-5px;background:linear-gradient(180deg,#ffc169,#e69a2d);border:1px solid #0b0f12;}
.cot-studio input[type=range]::-moz-range-track{height:3px;background:rgba(190,204,216,.22);}
.cot-studio input[type=range]::-moz-range-thumb{width:10px;height:12px;border-radius:0;
  background:#e69a2d;border:1px solid #0b0f12;}
.cot-studio input[type=number],.cot-studio input[type=text]{width:58px;background:rgba(4,7,10,.9);
  border:1px solid rgba(190,204,216,.25);color:#ffd27a;font-family:${FONT_STACK};
  font-size:11px;font-weight:700;padding:3px 5px;}
.cot-studio input[type=text]{width:100%;}
.cot-studio select{background:rgba(4,7,10,.9);border:1px solid rgba(190,204,216,.25);
  color:#e6edf3;font-family:${FONT_STACK};font-size:11px;font-weight:600;padding:4px 5px;flex:1;min-width:0;}
.cot-studio button{cursor:pointer;background:linear-gradient(180deg,rgba(26,34,42,.95),rgba(15,21,27,.95));
  color:#d8e0e7;border:1px solid rgba(190,204,216,.3);font-family:${FONT_STACK};font-size:9.5px;
  font-weight:800;letter-spacing:.1em;text-transform:uppercase;padding:5px 8px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.05);}
.cot-studio button:hover{border-color:#e69a2d;color:#ffd27a;}
.cot-studio button:focus-visible,.cot-studio input:focus-visible,.cot-studio select:focus-visible{
  outline:2px solid #ffd27a;outline-offset:1px;}
.cot-studio button.on{background:linear-gradient(180deg,#8a5a14,#5c3a0a);
  border-color:#ffc169;color:#fff2d9;}
.cot-studio button.prime{background:linear-gradient(180deg,#ffa02e,#d95f00);
  border-color:#ffc169;color:#fff7ea;font-size:11px;padding:8px 10px;width:100%;
  letter-spacing:.2em;}
.cot-studio button.warn{border-color:rgba(240,90,90,.55);color:#f0a0a0;}
.cot-studio .grid{display:grid;grid-template-columns:1fr 1fr;gap:5px;}
.cot-studio .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;}
/* tank silhouette icon (public/icons/<id>_side_silhouette.png, mask-tinted) */
.cot-studio .tic{flex:none;background:#cfd9e2;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;
  -webkit-mask-position:center;mask-position:center;-webkit-mask-size:contain;mask-size:contain;}
/* --- tank picker ------------------------------------------------------------ */
.cot-studio .pick{position:relative;width:100%;}
.cot-studio .pickBtn{display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;
  text-align:left;letter-spacing:.06em;font-size:10.5px;}
.cot-studio .pickBtn .tic{width:44px;height:17px;}
.cot-studio .pickBtn .nm{flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}
.cot-studio .pickBtn .ar{color:#8a97a3;font-size:8px;}
.cot-studio .pickPop{position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:5;display:none;
  background:rgba(5,8,11,.98);border:1px solid rgba(230,154,45,.45);max-height:328px;
  box-shadow:0 14px 40px rgba(0,0,0,.7);}
.cot-studio .pickPop.open{display:flex;flex-direction:column;}
.cot-studio .pickPop .flt{margin:7px;width:calc(100% - 14px);}
.cot-studio .pickPop .lst{overflow-y:auto;scrollbar-width:thin;
  scrollbar-color:rgba(230,154,45,.4) transparent;}
.cot-studio .pickPop .lst::-webkit-scrollbar{width:7px;}
.cot-studio .pickPop .lst::-webkit-scrollbar-thumb{background:rgba(230,154,45,.35);}
.cot-studio .prow{display:flex;align-items:center;gap:8px;padding:4px 8px;cursor:pointer;
  border-left:2px solid transparent;}
.cot-studio .prow:hover{background:rgba(52,36,12,.55);border-left-color:#e69a2d;}
.cot-studio .prow.cur{background:rgba(52,36,12,.4);border-left-color:#ffd27a;}
.cot-studio .prow .tic{width:46px;height:17px;}
.cot-studio .prow .nm{flex:1;font-size:10.5px;font-weight:700;color:#e6edf3;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;}
.cot-studio .prow .era{font-size:7.5px;font-weight:800;letter-spacing:.12em;color:#8a97a3;
  border:1px solid rgba(190,204,216,.25);padding:1px 4px;text-transform:uppercase;}
.cot-studio .pgh{padding:5px 8px 3px;font-size:8px;font-weight:800;letter-spacing:.2em;
  color:#e69a2d;text-transform:uppercase;border-bottom:1px solid rgba(190,204,216,.12);}
/* --- actor list -------------------------------------------------------------- */
.cot-studio .alist{max-height:168px;overflow-y:auto;scrollbar-width:thin;margin-bottom:6px;}
.cot-studio .arow{display:flex;align-items:center;gap:7px;padding:4px 6px;cursor:pointer;
  border:1px solid transparent;border-left:2px solid rgba(190,204,216,.2);margin-bottom:3px;
  background:rgba(14,19,24,.6);}
.cot-studio .arow:hover{border-color:rgba(230,154,45,.4);}
.cot-studio .arow.sel{border-color:#e69a2d;border-left-color:#ffd27a;background:rgba(52,36,12,.55);}
.cot-studio .arow .tic{width:40px;height:15px;}
.cot-studio .arow.st-bad .tic{background:#e0766a;}
.cot-studio .arow.st-warn .tic{background:#e0b46a;}
.cot-studio .arow .nm{flex:1;font-size:10.5px;font-weight:700;color:#e6edf3;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;}
.cot-studio .arow .st{font-size:7.5px;font-weight:800;letter-spacing:.08em;color:#8a97a3;
  text-transform:uppercase;}
.cot-studio .arow.st-bad .st{color:#e0766a;}
.cot-studio .arow.st-warn .st{color:#e0b46a;}
.cot-studio .arow .del{padding:1px 6px;font-size:10px;}
/* --- selected actor header ---------------------------------------------------- */
.cot-studio .selhead{display:flex;align-items:center;gap:9px;margin-bottom:8px;
  padding:6px 8px;background:rgba(14,19,24,.7);border:1px solid rgba(190,204,216,.16);}
.cot-studio .selhead .tic{width:56px;height:21px;background:#ffd27a;}
.cot-studio .selhead .nm{flex:1;min-width:0;}
.cot-studio .selhead .nm .n1{font-size:12px;font-weight:800;color:#ffd27a;letter-spacing:.05em;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cot-studio .selhead .nm .n2{font-size:8px;font-weight:700;color:#8a97a3;letter-spacing:.14em;
  text-transform:uppercase;}
/* --- effects board ------------------------------------------------------------ */
.cot-studio .fxg{margin-bottom:8px;}
.cot-studio .fxg:last-child{margin-bottom:0;}
.cot-studio .fxg .gh{font-size:8px;font-weight:800;letter-spacing:.22em;color:#e69a2d;
  text-transform:uppercase;margin-bottom:5px;display:flex;align-items:center;gap:6px;}
.cot-studio .fxg .gh::after{content:'';flex:1;height:1px;background:rgba(230,154,45,.25);}
.cot-studio .foot{position:absolute;left:20px;bottom:14px;pointer-events:none;
  font-size:10px;font-weight:600;letter-spacing:.08em;color:#9fb0bf;
  text-shadow:0 1px 4px rgba(0,0,0,.9);line-height:1.7;}
.cot-studio .foot .cam{color:#ffd27a;font-weight:700;}
.cot-studio .val{font-size:10px;font-weight:800;color:#ffd27a;min-width:34px;text-align:right;}
@media(max-width:720px){
  .cot-studio .badge{top:8px;left:8px;right:8px;gap:6px;padding:6px 8px;}
  .cot-studio .badge .t{font-size:10px;letter-spacing:.16em;}
  .cot-studio .badge button{font-size:8px;padding:5px 6px;}
  .cot-studio .dock{top:48%;width:100%;padding:10px 10px 16px;background:rgba(5,8,11,.97);
    border-top:1px solid rgba(230,154,45,.45);}
  .cot-studio .docknav{top:-10px;margin:-10px 0 10px;padding-top:10px;}
  .cot-studio .foot{display:none;}
  .cot-studio .busy{top:64px;max-width:calc(100vw - 24px);white-space:nowrap;overflow:hidden;
    text-overflow:ellipsis;}
}
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
  root.dataset.pane = 'scene';
  document.body.appendChild(root);

  /** Tinted side-silhouette icon for a tank id (mask, so one PNG serves any tint). */
  function tankIcon(id, cls = 'tic') {
    const d = el('div', cls);
    const u = `url(${iconUrl(id, 'side_silhouette')})`;
    d.style.webkitMaskImage = u;
    d.style.maskImage = u;
    return d;
  }

  // --- top badge -------------------------------------------------------------
  const badge = el('div', 'badge');
  const badgeMark = document.createElement('img');
  badgeMark.className = 'bm';
  badgeMark.src = '/brand/nav/studio.png'; // the owner's gate-diff studio mark
  badgeMark.alt = '';
  badgeMark.draggable = false;
  const badgeTitle = el('div', 't', 'SCENE STUDIO');
  const badgeMap = el('div', 'm', '');
  const galleryBtn = el('button', null, 'TANK GALLERY');
  galleryBtn.addEventListener('click', () => {
    const id = S._internal.selected?.spec?.id;
    window.location.href = id ? `/gallery?id=${encodeURIComponent(id)}` : '/gallery';
  });
  const exitBtn = el('button', null, 'EXIT (F8)');
  exitBtn.addEventListener('click', () => S.exit());
  badge.append(badgeMark, badgeTitle, badgeMap, galleryBtn, exitBtn);
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

  const dockNav = el('div', 'docknav');
  dockNav.setAttribute('role', 'tablist');
  const tabButtons = new Map();
  const activatePane = (pane) => {
    root.dataset.pane = pane;
    for (const [id, button] of tabButtons) {
      const on = id === pane;
      button.classList.toggle('on', on);
      button.setAttribute('aria-selected', String(on));
    }
    dock.scrollTop = 0;
  };
  for (const [id, label] of [
    ['scene', 'Scene'], ['actor', 'Actor'], ['fx', 'FX'],
    ['camera', 'Camera'], ['output', 'Output'],
  ]) {
    const button = el('button', id === 'scene' ? 'on' : null, label);
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(id === 'scene'));
    button.addEventListener('click', () => activatePane(id));
    tabButtons.set(id, button);
    dockNav.appendChild(button);
  }
  dock.appendChild(dockNav);

  // === SCENE section ===
  const secScene = section('Battlefield');
  secScene.dataset.pane = 'scene';
  const mapRow = el('div', 'row');
  mapRow.appendChild(el('label', 'k', 'Map'));
  const mapSelect = document.createElement('select');
  for (const id of S.MAP_IDS) {
    const option = document.createElement('option');
    option.value = id;
    const info = S.getMapInfo ? S.getMapInfo(id) : { name: id };
    option.textContent = `${info.name || id} · ${id.toUpperCase()}`;
    mapSelect.appendChild(option);
  }
  mapSelect.addEventListener('change', () => {
    mapSelect.disabled = true;
    Promise.resolve(S.setMap(mapSelect.value))
      .catch((error) => flashBusy(`MAP FAILED: ${error.message}`))
      .finally(() => {
        mapSelect.disabled = false;
        api.refreshMap();
      });
  });
  mapRow.appendChild(mapSelect);
  secScene.appendChild(mapRow);
  dock.appendChild(secScene);

  // === ACTORS section ===
  const secActors = section('Actors', 'the shipped roster');
  secActors.dataset.pane = 'scene';
  // -- tank picker (icon rows, filterable) --
  let pickedId = 'm1a2';
  const pick = el('div', 'pick');
  const pickBtn = el('button', 'pickBtn');
  const pickIcon = tankIcon(pickedId);
  const pickName = el('span', 'nm', '');
  const pickArrow = el('span', 'ar', '▼');
  pickBtn.append(pickIcon, pickName, pickArrow);
  const pickPop = el('div', 'pickPop');
  const pickFlt = document.createElement('input');
  pickFlt.type = 'text';
  pickFlt.className = 'flt';
  pickFlt.placeholder = 'FILTER…';
  const pickList = el('div', 'lst');
  pickPop.append(pickFlt, pickList);
  pick.append(pickBtn, pickPop);
  secActors.appendChild(pick);

  const specInfo = (id) => {
    try { return S.getSpecInfo(id); } catch (_) { return { id, name: id, era: '' }; }
  };
  function setPicked(id) {
    pickedId = id;
    const info = specInfo(id);
    pickName.textContent = info.name;
    const u = `url(${iconUrl(id, 'side_silhouette')})`;
    pickIcon.style.webkitMaskImage = u;
    pickIcon.style.maskImage = u;
  }
  function buildPickList(filter = '') {
    pickList.textContent = '';
    const f = filter.trim().toLowerCase();
    const groups = [['Core roster', S.TANK_IDS.slice(0, 8)], ['Extended roster', S.TANK_IDS.slice(8)]];
    for (const [label, ids] of groups) {
      const hits = ids.filter((id) => {
        if (!f) return true;
        const info = specInfo(id);
        return id.toLowerCase().includes(f) || String(info.name).toLowerCase().includes(f);
      });
      if (!hits.length) continue;
      pickList.appendChild(el('div', 'pgh', label));
      for (const id of hits) {
        const info = specInfo(id);
        const row = el('div', 'prow' + (id === pickedId ? ' cur' : ''));
        row.appendChild(tankIcon(id));
        row.appendChild(el('span', 'nm', info.name));
        if (info.era) row.appendChild(el('span', 'era', String(info.era)));
        row.addEventListener('click', () => {
          setPicked(id);
          togglePick(false);
        });
        pickList.appendChild(row);
      }
    }
  }
  function togglePick(open) {
    const o = open != null ? open : !pickPop.classList.contains('open');
    pickPop.classList.toggle('open', o);
    if (o) {
      pickFlt.value = '';
      buildPickList();
      pickFlt.focus();
    }
  }
  pickBtn.addEventListener('click', () => togglePick());
  pickFlt.addEventListener('input', () => buildPickList(pickFlt.value));
  pickFlt.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') togglePick(false);
    if (e.key === 'Enter') {
      const first = pickList.querySelector('.prow');
      if (first) first.click();
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (pickPop.classList.contains('open') && !pick.contains(e.target)) togglePick(false);
  });
  setPicked(pickedId);

  const addRow2 = el('div', 'grid');
  addRow2.style.marginTop = '6px';
  const addAtMarker = el('button', null, 'ADD IN VIEW');
  addAtMarker.title = 'Uses the terrain marker when set; otherwise places at the camera focus';
  addAtMarker.addEventListener('click', () => {
    const point = S._internal.markerActive
      ? S._internal.markerPos
      : (() => {
        const camera = S.getCamera();
        return { x: camera.lookAt[0], z: camera.lookAt[2] };
      })();
    S.addActor({ id: pickedId, pos: [point.x, point.z] });
  });
  const placeBtn = el('button', null, 'CLICK TO PLACE');
  placeBtn.addEventListener('click', () => {
    S._internal.placeArmed = S._internal.placeArmed ? null : pickedId;
    api.setPlaceArmed(S._internal.placeArmed);
  });
  addRow2.append(addAtMarker, placeBtn);
  secActors.appendChild(addRow2);
  const alist = el('div', 'alist');
  alist.style.marginTop = '6px';
  secActors.appendChild(alist);
  dock.appendChild(secActors);

  // === SELECTED ACTOR section ===
  const secSel = section('Selected actor');
  secSel.dataset.pane = 'actor';
  const selHead = el('div', 'selhead');
  const selIcon = tankIcon('m1a2');
  const selNames = el('div', 'nm');
  const selN1 = el('div', 'n1', '');
  const selN2 = el('div', 'n2', '');
  selNames.append(selN1, selN2);
  selHead.append(selIcon, selNames);
  secSel.appendChild(selHead);
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
  secFx.dataset.pane = 'fx';
  const selOr = (fn, needActor = false) => {
    const a = S._internal.selected;
    if (needActor && !a) { flashBusy('SELECT AN ACTOR FIRST'); return null; }
    return fn(a);
  };
  /** actor-anchored when one is selected, marker-anchored otherwise */
  const impactFx = (kind, hFrac = 0.55, caliberMm = 120) => selOr((a) => S.effect(a
    ? { type: 'impact', actor: a.uid, hFrac, params: { kind, caliberMm } }
    : { type: 'impact', params: { kind, caliberMm } }));
  function fxGroup(title, defs) {
    const g = el('div', 'fxg');
    g.appendChild(el('div', 'gh', title));
    const grid = el('div', 'grid');
    for (const [label, fn, wide] of defs) {
      const b = el('button', null, label);
      if (wide) b.style.gridColumn = '1 / -1';
      b.addEventListener('click', fn);
      grid.appendChild(b);
    }
    g.appendChild(grid);
    secFx.appendChild(g);
  }
  fxGroup('Gunnery', [
    ['FIRE GUN', () => selOr((a) => S.effect({ type: 'fire', actor: a.uid }), true)],
    ['MUZZLE FLASH', () => selOr((a) => S.effect(a
      ? { type: 'muzzle_flash', actor: a.uid } : { type: 'muzzle_flash' }))],
    ['MG BURST', () => selOr((a) => S.effect({ type: 'mg_burst', actor: a.uid }), true)],
    ['RECOIL + FLASH', () => selOr((a) => S.effect({ type: 'firing_moment', actor: a.uid, params: { ageS: 0.05 } }), true)],
    ['TRACER  MARKER → ACTOR', () => selOr((a) => {
      const m = S._internal.markerPos;
      const t = a.state.pos;
      S.effect({
        type: 'tracer',
        from: [m.x, m.y + 1.8, m.z],
        to: [t.x, t.y + a.spec.dims.heightM * 0.6, t.z],
        params: { shellType: 'APFSDS' },
      });
    }, true), true],
  ]);
  fxGroup('Strikes · at marker', [
    ['EXPL SMALL', () => S.effect({ type: 'explosion', params: { size: 'small' } })],
    ['EXPL MEDIUM', () => S.effect({ type: 'explosion', params: { size: 'medium' } })],
    ['EXPL LARGE', () => S.effect({ type: 'explosion', params: { size: 'large' } })],
    ['BARRAGE ×5', () => S.effect({ type: 'barrage', params: { count: 5, radiusM: 10 } })],
    ['DUST BURST', () => selOr((a) => S.effect(a
      ? { type: 'dust', actor: a.uid } : { type: 'dust' }))],
    ['SPARKS', () => S.effect({ type: 'sparks' })],
  ]);
  fxGroup('Armor hits · sel actor', [
    ['IMPACT PEN', () => impactFx('pen', 0.55)],
    ['NON-PEN', () => impactFx('nonpen', 0.5)],
    ['RICOCHET', () => impactFx('ricochet', 0.72)],
    ['HE SPLASH', () => impactFx('he_splash', 0.5, 152)],
    ['ERA POP', () => impactFx('era', 0.45)],
    ['ARMOR SCARS', () => selOr((a) => S.effect({ type: 'armor_scar', actor: a.uid }), true)],
  ]);
  fxGroup('Vehicle state', [
    ['KILL · AMMO-RACK', () => selOr((a) => S.effect({ type: 'tank_kill', actor: a.uid }), true)],
    ['KILL · BURN-OUT', () => selOr((a) => S.effect({ type: 'tank_kill', actor: a.uid, params: { cause: 'fire', pop: false } }), true)],
    ['DETRACK L', () => selOr((a) => S.effect({ type: 'detrack', actor: a.uid, params: { side: 'L' } }), true)],
    ['DETRACK R', () => selOr((a) => S.effect({ type: 'detrack', actor: a.uid, params: { side: 'R' } }), true)],
    ['EXHAUST BELCH', () => selOr((a) => S.effect({ type: 'exhaust', actor: a.uid }), true)],
    ['ENGINE SMOKE', () => selOr((a) => S.effect({ type: 'engine_smoke', actor: a.uid }), true)],
    ['SET BURNING', () => selOr((a) => S.effect({ type: 'burning', actor: a.uid }), true)],
    ['EXTINGUISH', () => selOr((a) => {
      S.effect({ type: 'burning', actor: a.uid, params: { off: true } });
      S.effect({ type: 'engine_smoke', actor: a.uid, params: { off: true } });
    }, true)],
  ]);
  dock.appendChild(secFx);

  // === TIME section ===
  const secTime = section('FX time');
  secTime.dataset.pane = 'camera';
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
  secCam.dataset.pane = 'camera';
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
  secCap.dataset.pane = 'output';
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
    if (sub) h.appendChild(el('span', 'sub', sub));
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
  /** amber/red tinting class for an actor row by damage state */
  function stateClass(name) {
    if (name === 'engine-smoking') return ' st-warn';
    if (name === 'burning' || name === 'wrecked' || name === 'wrecked-burnt'
      || name === 'turret-popped') return ' st-bad';
    return '';
  }

  // --- public panel API -------------------------------------------------------
  let refreshAcc = 0;
  const api = {
    root,
    show() { root.style.display = 'block'; api.refreshAll(); },
    hide() { root.style.display = 'none'; togglePick(false); },
    setBusy(text) {
      busy.style.display = text ? 'block' : 'none';
      if (text) busy.textContent = text;
    },
    setPlaceArmed(specId) {
      placeBtn.classList.toggle('on', !!specId);
      placeBtn.textContent = specId ? `CLICK MAP TO PLACE ${specId.toUpperCase()}` : 'CLICK TO PLACE';
    },
    setSelected(actor) {
      api.refreshActors();
      if (actor) activatePane('actor');
    },
    refreshActors() {
      alist.textContent = '';
      const sel = S._internal.selected;
      S._internal.actors.forEach((a) => {
        const row = el('div', 'arow' + (a === sel ? ' sel' : '') + stateClass(a.stateName));
        row.appendChild(tankIcon(a.spec.id));
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
      if (!a) {
        selN1.textContent = 'NONE — CLICK A TANK';
        selN2.textContent = 'or add one from the roster above';
        selIcon.style.visibility = 'hidden';
        return;
      }
      selIcon.style.visibility = 'visible';
      const u = `url(${iconUrl(a.spec.id, 'side_silhouette')})`;
      selIcon.style.webkitMaskImage = u;
      selIcon.style.maskImage = u;
      selN1.textContent = a.spec.name;
      selN2.textContent = `${a.name ? a.name + ' · ' : ''}${a.uid} · ${a.stateName}`;
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
      const scale = S.timeScale;
      if (Number(ts.input.value) !== scale) ts.set(scale);
      const pauseLabel = scale === 0 ? 'PLAY' : 'FREEZE';
      if (pauseBtn.textContent !== pauseLabel) pauseBtn.textContent = pauseLabel;
      pauseBtn.classList.toggle('on', S.timeScale === 0);
      const text = `T = ${(S.fxTimeMs / 1000).toFixed(2)} s  ·  ×${scale.toFixed(2)}`;
      if (clockLine.textContent !== text) clockLine.textContent = text;
    },
    refreshMap() {
      const id = S.mapId;
      badgeMap.textContent = id ? id.toUpperCase() : '';
      if (id && mapSelect.value !== id) mapSelect.value = id;
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
