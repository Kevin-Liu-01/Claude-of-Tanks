// src/ui/garage.js — full-screen garage/tank-select overlay: dark gradient
// frame with a transparent center band (the 3D pedestal shows through),
// bottom tank carousel, right stats card, top-center BATTLE button.
// Contract: docs/ARCHITECTURE.md §3.7.3.

import { FONT_STACK, ensureFonts } from './fonts.js';
import { flagSVG } from './flags.js';
import { iconUrl } from './icons.js';
import { createTechTree } from './techtree.js';

const NATION_LABEL = { USA: 'USA', Germany: 'GER', USSR: 'USSR', Russia: 'RUS' };

const SHELL_TYPE_COLOR = {
  AP: '#ffd27a', APCR: '#e8f4ff', HEAT: '#ff8a5c', HE: '#ffb02e', APFSDS: '#ffc46b',
};

// roster maxima for normalized stat bars are computed from the actual specs
// passed to createGarage (so bars always spread across the roster range).

const GARAGE_CSS = `
.cot-garage{position:fixed;inset:0;z-index:60;display:none;font-family:${FONT_STACK};
  color:#e6edf3;-webkit-user-select:none;user-select:none;overflow:hidden;}
.cot-garage *{box-sizing:border-box;margin:0;padding:0;}
.cot-garage .band-top{position:absolute;left:0;right:0;top:0;height:26%;
  background:linear-gradient(180deg,rgba(5,8,11,.94) 0%,rgba(5,8,11,.78) 55%,rgba(5,8,11,0) 100%);}
.cot-garage .band-bot{position:absolute;left:0;right:0;bottom:0;height:36%;
  background:linear-gradient(0deg,rgba(5,8,11,.96) 0%,rgba(5,8,11,.82) 55%,rgba(5,8,11,0) 100%);}
.cot-garage .band-l{position:absolute;left:0;top:0;bottom:0;width:14%;
  background:linear-gradient(90deg,rgba(5,8,11,.8),rgba(5,8,11,0));}
.cot-garage .band-r{position:absolute;right:0;top:0;bottom:0;width:30%;
  background:linear-gradient(270deg,rgba(5,8,11,.85) 0%,rgba(5,8,11,.35) 60%,rgba(5,8,11,0) 100%);}
.cot-garage .title{position:absolute;top:22px;left:34px;font-size:17px;font-weight:800;
  letter-spacing:.30em;color:#9fb0bf;text-transform:uppercase;}
.cot-garage .title b{color:#f0a030;}
.cot-garage .selname{position:absolute;top:46px;left:34px;font-size:30px;font-weight:500;
  letter-spacing:-.01em;color:#eef4f9;}
.cot-garage .selsub{position:absolute;top:88px;left:36px;font-size:11px;font-weight:600;
  letter-spacing:.18em;color:#8a97a3;text-transform:uppercase;display:flex;
  align-items:center;gap:8px;}
.cot-garage .selsub svg{display:block;box-shadow:0 1px 4px rgba(0,0,0,.5);}
.cot-tech{position:absolute;top:118px;left:34px;pointer-events:auto;cursor:pointer;
  display:flex;align-items:center;gap:8px;
  font-family:${FONT_STACK};font-size:10.5px;font-weight:800;letter-spacing:.20em;
  color:#c6d2dc;text-transform:uppercase;padding:8px 16px 7px;
  background:rgba(11,15,20,.82);border:1px solid rgba(146,164,180,.35);
  border-bottom:2px solid rgba(146,164,180,.45);
  transition:color .12s,border-color .12s;}
.cot-tech:hover{color:#ffd27a;border-color:rgba(240,176,74,.65);}
.cot-tech .tt-ico{font-size:12px;line-height:1;color:#f0b04a;}
.cot-battle{position:absolute;top:26px;left:50%;transform:translateX(-50%);
  pointer-events:auto;cursor:pointer;border:none;outline:none;
  font-family:${FONT_STACK};font-size:19px;font-weight:800;letter-spacing:.30em;
  color:#fff7ea;text-shadow:0 1px 2px rgba(90,40,0,.6);
  padding:13px 66px 13px 74px;
  background:linear-gradient(180deg,#ffa02e 0%,#f07800 52%,#d95f00 100%);
  border:1px solid #ffc169;border-bottom:2px solid #a34700;
  box-shadow:0 4px 22px rgba(240,120,0,.45),inset 0 1px 0 rgba(255,255,255,.35);
  transition:filter .12s,transform .06s;clip-path:polygon(4% 0,96% 0,100% 50%,96% 100%,4% 100%,0 50%);}
.cot-battle:hover{filter:brightness(1.12);}
.cot-battle:active{transform:translateX(-50%) translateY(1px);}
.cot-garage .stats{position:absolute;right:26px;top:110px;width:300px;
  background:linear-gradient(180deg,rgba(11,15,20,.88),rgba(7,10,13,.92));
  border:1px solid rgba(146,164,180,.28);box-shadow:0 8px 30px rgba(0,0,0,.55);
  padding:16px 18px 14px;pointer-events:auto;}
.cot-garage .stats h3{font-size:15px;font-weight:700;letter-spacing:.02em;color:#eef4f9;}
.cot-garage .stats .sub{font-size:10px;font-weight:700;letter-spacing:.18em;color:#8a97a3;
  text-transform:uppercase;margin:4px 0 12px;display:flex;align-items:center;gap:7px;}
.cot-garage .stats .sub svg{display:block;box-shadow:0 1px 3px rgba(0,0,0,.5);}
.cot-garage .srow{margin-bottom:9px;}
.cot-garage .srow .lr{display:flex;justify-content:space-between;font-size:11px;
  letter-spacing:.08em;color:#9fb0bf;text-transform:uppercase;margin-bottom:3px;}
.cot-garage .srow .lr b{color:#e6edf3;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:.02em;}
.cot-garage .srow .track{height:3px;background:rgba(255,255,255,.08);}
.cot-garage .srow .fill{height:100%;background:linear-gradient(90deg,#c98a2e,#f0b04a);}
.cot-garage .sep{height:1px;background:rgba(146,164,180,.2);margin:12px 0 10px;}
.cot-garage .shellrow{display:flex;justify-content:space-between;align-items:baseline;
  font-size:11.5px;padding:3px 0;color:#c6d2dc;}
.cot-garage .shellrow .ty{font-size:9px;font-weight:800;letter-spacing:.1em;width:52px;}
.cot-garage .shellrow .nm{flex:1;color:#e6edf3;font-weight:600;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap;padding-right:6px;}
.cot-garage .shellrow .pd{font-variant-numeric:tabular-nums;color:#9fb0bf;font-size:10.5px;}
.cot-garage .shellrow .pd b{color:#e6edf3;font-weight:600;}
.cot-garage .armorline{font-size:10.5px;letter-spacing:.06em;color:#9fb0bf;
  text-transform:uppercase;display:flex;justify-content:space-between;padding:2px 0;}
.cot-garage .armorline b{color:#e6edf3;font-weight:600;font-variant-numeric:tabular-nums;}
.cot-carousel{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);
  display:flex;align-items:stretch;gap:8px;pointer-events:auto;max-width:96vw;}
.cot-car-arrow{width:34px;border:1px solid rgba(146,164,180,.3);cursor:pointer;
  background:rgba(11,15,20,.8);color:#9fb0bf;font-size:20px;font-family:${FONT_STACK};
  transition:color .12s,border-color .12s;outline:none;}
.cot-car-arrow:hover{color:#f0b04a;border-color:rgba(240,176,74,.6);}
.cot-cards{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;}
.cot-cards::-webkit-scrollbar{display:none;}
.cot-card{width:132px;flex:0 0 auto;cursor:pointer;position:relative;
  background:linear-gradient(180deg,rgba(13,18,23,.86),rgba(8,11,14,.92));
  border:1px solid rgba(146,164,180,.26);border-top:2px solid rgba(146,164,180,.26);
  padding:9px 10px 8px;transition:border-color .12s,transform .12s,box-shadow .12s;}
.cot-card:hover{border-color:rgba(210,225,240,.5);}
.cot-card.sel{border-color:#f0a030;border-top-color:#f0a030;transform:translateY(-6px);
  box-shadow:0 8px 26px rgba(240,140,20,.28);
  background:linear-gradient(180deg,rgba(32,24,12,.92),rgba(14,10,6,.94));}
.cot-card .flag{display:inline-flex;align-items:center;gap:5px;margin-bottom:5px;
  font-size:8.5px;font-weight:800;letter-spacing:.14em;color:#9fb0bf;}
.cot-card .flag svg{display:block;box-shadow:0 1px 3px rgba(0,0,0,.55);}
.cot-card .flag i{font-style:normal;}
.cot-card.sel .flag{color:#d8c39a;}
.cot-card .era{float:right;font-size:8.5px;font-weight:700;letter-spacing:.12em;
  color:#8a97a3;padding:2px 0;}
.cot-card.sel .era{color:#d8a04c;}
.cot-card .ti{display:block;margin:1px auto 2px;width:106px;height:64px;
  object-fit:contain;filter:drop-shadow(0 3px 5px rgba(0,0,0,.5));}
.cot-card .nm{font-size:10.5px;font-weight:600;color:#eef4f9;letter-spacing:-.01em;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0 -5px;text-align:center;}
.cot-card .cls{font-size:9px;font-weight:700;letter-spacing:.18em;color:#8a97a3;
  text-transform:uppercase;margin-top:2px;}
.cot-garage .hint{position:absolute;bottom:4px;left:50%;transform:translateX(-50%);
  font-size:9.5px;letter-spacing:.14em;color:rgba(138,151,163,.7);text-transform:uppercase;}
/* MAP-CONFIG WIRING: battlefield picker (4 maps + random) */
.cot-maps{position:absolute;left:34px;top:168px;width:196px;pointer-events:auto;}
.cot-maps .mtitle{font-size:10px;font-weight:700;letter-spacing:.24em;color:#8a97a3;
  text-transform:uppercase;margin-bottom:7px;}
.cot-map-card{display:flex;align-items:center;gap:9px;cursor:pointer;margin-bottom:6px;
  background:linear-gradient(180deg,rgba(13,18,23,.82),rgba(8,11,14,.9));
  border:1px solid rgba(146,164,180,.24);border-left:2px solid rgba(146,164,180,.24);
  padding:5px 8px 5px 6px;transition:border-color .12s,background .12s;}
.cot-map-card:hover{border-color:rgba(210,225,240,.5);}
.cot-map-card.sel{border-color:#f0a030;border-left-color:#f0a030;
  background:linear-gradient(180deg,rgba(32,24,12,.9),rgba(14,10,6,.92));}
.cot-map-card .mthumb{width:64px;height:36px;flex:0 0 auto;background-size:cover;
  background-position:center;border:1px solid rgba(0,0,0,.55);}
.cot-map-card .mthumb.verdant{background-color:#3d5a2e;background-image:linear-gradient(135deg,#4c6b38,#2c421f);}
.cot-map-card .mthumb.desert{background-color:#b3925c;background-image:linear-gradient(135deg,#c9a86e,#8f6f42);}
.cot-map-card .mthumb.winter{background-color:#aeb9c4;background-image:linear-gradient(135deg,#cdd6de,#7f8d9b);}
.cot-map-card .mthumb.urban{background-color:#5c6066;background-image:linear-gradient(135deg,#75797e,#3e4247);}
.cot-map-card .mthumb.random{background-image:conic-gradient(#4c6b38 0 25%,#c9a86e 0 50%,#cdd6de 0 75%,#5c6066 0);}
.cot-map-card .mname{font-size:11px;font-weight:600;color:#e6edf3;letter-spacing:.02em;}
.cot-map-card .msub{font-size:8.5px;font-weight:700;letter-spacing:.14em;color:#8a97a3;
  text-transform:uppercase;margin-top:1px;}
.cot-map-card.sel .msub{color:#d8a04c;}
`;

function ensureStyle(id, css) {
  if (!document.getElementById(id)) {
    const s = document.createElement('style');
    s.id = id;
    s.textContent = css;
    document.head.appendChild(s);
  }
}


function frontArmorMm(plates, keys) {
  if (!plates || !plates.length) return null;
  let best = null;
  for (const p of plates) {
    const n = (p.name || '').toLowerCase();
    const match = keys.some((k) => n.includes(k));
    if (match && p.kind === 'main') best = Math.max(best || 0, p.keMm || p.physicalMm || 0);
  }
  if (best == null) for (const p of plates) if (p.kind === 'main') best = Math.max(best || 0, p.keMm || 0);
  return best;
}

/**
 * Create the garage/tank-select screen. Appends its root to document.body (hidden).
 * @param {{specs:TankSpec[],bus:{emit:Function},onSelect:Function,onBattle:Function}} opts
 * @returns {{show:Function,hide:Function,isOpen:boolean,setSelected:Function,root:HTMLElement}} Garage
 */
export function createGarage(opts) {
  const { specs, bus, onSelect, onBattle } = opts;
  ensureFonts();
  ensureStyle('cot-garage-style', GARAGE_CSS);

  const root = document.createElement('div');
  root.className = 'cot-garage';
  root.innerHTML =
    `<div class="band-top"></div><div class="band-bot"></div>` +
    `<div class="band-l"></div><div class="band-r"></div>` +
    `<div class="title">CLAUDE <b>OF TANKS</b></div>` +
    `<div class="selname"></div><div class="selsub"></div>` +
    `<button class="cot-tech" type="button"><span class="tt-ico">&#9776;</span>TECH TREE</button>` +
    `<button class="cot-battle" type="button">BATTLE</button>` +
    `<div class="stats"></div>` +
    `<div class="cot-carousel">` +
    `<button class="cot-car-arrow prev" type="button">&#8249;</button>` +
    `<div class="cot-cards"></div>` +
    `<button class="cot-car-arrow next" type="button">&#8250;</button>` +
    `</div>` +
    `<div class="cot-maps"></div>` +
    `<div class="hint">&#8592; &#8594; select &nbsp;&middot;&nbsp; enter to battle</div>`;
  document.body.appendChild(root);

  const selName = root.querySelector('.selname');
  const selSub = root.querySelector('.selsub');
  const statsEl = root.querySelector('.stats');
  const cardsEl = root.querySelector('.cot-cards');
  const battleBtn = root.querySelector('.cot-battle');
  const mapsEl = root.querySelector('.cot-maps');

  let selectedId = specs.length ? specs[0].id : null;
  const cardById = new Map();
  const specById = new Map();
  for (const s of specs) specById.set(s.id, s);

  const emit = (ev, payload) => { if (bus && bus.emit) bus.emit(ev, payload); };

  // --- MAP-CONFIG WIRING: battlefield picker (maps come from createGarage
  // opts.maps = [{id,name,blurb,thumb}]; 'random' rolls at battle start) ---
  const maps = opts.maps || [];
  let selectedMapId = maps.length ? maps[0].id : 'verdant';
  const mapCardById = new Map();
  if (maps.length) {
    const title = document.createElement('div');
    title.className = 'mtitle';
    title.textContent = 'Battlefield';
    mapsEl.appendChild(title);
    for (const m of maps) {
      const card = document.createElement('div');
      card.className = 'cot-map-card';
      const thumb = document.createElement('div');
      thumb.className = `mthumb ${m.id}`;
      if (m.thumb) thumb.style.backgroundImage = `url(${m.thumb})`;
      const label = document.createElement('div');
      const nm = document.createElement('div');
      nm.className = 'mname';
      nm.textContent = m.name;
      const sub = document.createElement('div');
      sub.className = 'msub';
      sub.textContent = m.sub || '';
      label.append(nm, sub);
      card.append(thumb, label);
      card.addEventListener('click', () => {
        emit('ui:click', {});
        api.setSelectedMap(m.id);
      });
      mapsEl.appendChild(card);
      mapCardById.set(m.id, card);
    }
  }

  // roster maxima for normalized stat bars
  const MAXES = {
    hp: 1, speed: 1, hpt: 1, pen: 1,
  };
  for (const s of specs) {
    MAXES.hp = Math.max(MAXES.hp, s.hp);
    MAXES.speed = Math.max(MAXES.speed, s.topSpeedKmh);
    MAXES.hpt = Math.max(MAXES.hpt, s.enginePowerHp / s.weightTons);
    const shells = (s.gun && s.gun.shells) || [];
    for (const sh of shells) MAXES.pen = Math.max(MAXES.pen, sh.pen100Mm || 0);
  }

  // --- build carousel cards ---
  for (const s of specs) {
    const card = document.createElement('div');
    card.className = 'cot-card';
    card.innerHTML =
      `<span class="era">${s.era === 'ww2' ? 'WWII' : 'MODERN'}</span>` +
      `<span class="flag">${flagSVG(s.nation, s.era, 18, 12)}<i>${NATION_LABEL[s.nation] || s.nation}</i></span>` +
      `<img class="ti" src="${iconUrl(s.id, 'angle')}" alt="">` +
      `<div class="nm"></div>` +
      `<div class="cls">${s.class}</div>`;
    card.querySelector('.nm').textContent = s.name;
    card.addEventListener('click', () => {
      emit('ui:click', {});
      api.setSelected(s.id);
    });
    cardsEl.appendChild(card);
    cardById.set(s.id, card);
  }

  function statBar(label, valueText, frac) {
    const pct = Math.max(2, Math.min(100, frac * 100)).toFixed(1);
    return `<div class="srow"><div class="lr"><span>${label}</span><b>${valueText}</b></div>` +
      `<div class="track"><div class="fill" style="width:${pct}%"></div></div></div>`;
  }

  function renderStats(spec) {
    const hpT = spec.enginePowerHp / spec.weightTons;
    const shells = (spec.gun && spec.gun.shells) || [];
    let shellRows = '';
    for (const sh of shells) {
      const col = SHELL_TYPE_COLOR[sh.type] || '#9fb0bf';
      // penetration at point blank / at 1 km
      const pen = sh.type === 'HE' ? `${sh.pen100Mm}` : `${sh.pen100Mm} / ${sh.pen1000Mm}`;
      shellRows += `<div class="shellrow"><span class="ty" style="color:${col}">${sh.type}</span>` +
        `<span class="nm">${sh.name}</span>` +
        `<span class="pd"><b>${pen}</b> mm &nbsp;<b>${sh.dmg}</b> hp</span></div>`;
    }
    const hullMm = frontArmorMm(spec.armor && spec.armor.hullPlates, ['glacis', 'front', 'driver']);
    const turMm = frontArmorMm(spec.armor && spec.armor.turretPlates, ['front', 'cheek', 'mantlet']);
    const bestPen = shells.length ? Math.max(...shells.map((s) => s.pen100Mm || 0)) : 0;
    statsEl.innerHTML =
      `<h3></h3><div class="sub">${flagSVG(spec.nation, spec.era, 20, 13)}<span>${spec.nation} &middot; ${spec.class} &middot; ${spec.era === 'ww2' ? 'WWII' : 'MODERN'}</span></div>` +
      statBar('Hit points', `${spec.hp}`, spec.hp / MAXES.hp) +
      statBar('Top speed', `${spec.topSpeedKmh} km/h`, spec.topSpeedKmh / MAXES.speed) +
      statBar('Power / weight', `${hpT.toFixed(1)} hp/t`, hpT / MAXES.hpt) +
      statBar('Reload', `${spec.gun.reloadS.toFixed(1)} s`, 1 - Math.min(1, spec.gun.reloadS / 15)) +
      statBar('Penetration', `${bestPen} mm`, bestPen / MAXES.pen) +
      `<div class="sep"></div>` + shellRows +
      `<div class="sep"></div>` +
      `<div class="armorline"><span>Hull front</span><b>${hullMm != null ? `${Math.round(hullMm)} mm` : '&mdash;'}</b></div>` +
      `<div class="armorline"><span>Turret front</span><b>${turMm != null ? `${Math.round(turMm)} mm` : '&mdash;'}</b></div>` +
      `<div class="armorline"><span>Gun</span><b>${spec.gun.caliberMm} mm</b></div>` +
      `<div class="armorline"><span>Depression</span><b>&minus;${spec.gunDepressionDeg}&deg; / +${spec.gunElevationDeg}&deg;</b></div>`;
    statsEl.querySelector('h3').textContent = spec.name;
  }

  function applySelection(specId) {
    const spec = specById.get(specId);
    if (!spec) return false;
    selectedId = specId;
    for (const [id, card] of cardById) card.classList.toggle('sel', id === specId);
    const card = cardById.get(specId);
    if (card && card.scrollIntoView) {
      card.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }
    selName.textContent = spec.name;
    selSub.innerHTML = `${flagSVG(spec.nation, spec.era, 22, 14)}<span></span>`;
    selSub.querySelector('span').textContent =
      `${spec.nation} · ${spec.class} · ${spec.era === 'ww2' ? 'WWII' : 'MODERN'}`;
    renderStats(spec);
    return true;
  }

  function step(dir) {
    const idx = specs.findIndex((s) => s.id === selectedId);
    const next = specs[(idx + dir + specs.length) % specs.length];
    emit('ui:click', {});
    api.setSelected(next.id);
  }

  function battle() {
    if (!selectedId) return;
    emit('ui:click', {});
    emit('ui:battleStart', { specId: selectedId, mapId: selectedMapId });
    if (onBattle) onBattle(selectedId, selectedMapId); // MAP-CONFIG WIRING
  }

  battleBtn.addEventListener('click', battle);
  root.querySelector('.prev').addEventListener('click', () => step(-1));
  root.querySelector('.next').addEventListener('click', () => step(1));

  // --- tech tree (research screen layered over the garage) ---
  const techtree = createTechTree({
    specs,
    bus,
    onPick: (specId) => { api.setSelected(specId); },
    onClose: () => {},
  });
  const NATION_TAB = { USA: 'usa', Germany: 'germany', USSR: 'ussr', Russia: 'ussr' };
  root.querySelector('.cot-tech').addEventListener('click', () => {
    emit('ui:click', {});
    const sel = specById.get(selectedId);
    techtree.show(sel ? NATION_TAB[sel.nation] || 'usa' : 'usa');
  });

  function onKey(e) {
    if (!api.isOpen || techtree.isOpen) return;
    if (e.code === 'ArrowLeft') { step(-1); e.preventDefault(); }
    else if (e.code === 'ArrowRight') { step(1); e.preventDefault(); }
    else if (e.code === 'Enter' || e.code === 'NumpadEnter') { battle(); e.preventDefault(); }
  }

  const api = {
    root,
    isOpen: false,

    /**
     * Open the garage screen.
     * @param {string} [selectedId='m1a2'] - initially highlighted tank id.
     */
    show(selected = 'm1a2') {
      root.style.display = 'block';
      if (!api.isOpen) window.addEventListener('keydown', onKey);
      api.isOpen = true;
      api.setSelected(specById.has(selected) ? selected : selectedId);
    },

    /** Close the garage screen (and any tech tree layered over it). */
    hide() {
      root.style.display = 'none';
      if (techtree.isOpen) techtree.hide();
      if (api.isOpen) window.removeEventListener('keydown', onKey);
      api.isOpen = false;
    },

    /** The research screen (created/owned by the garage). */
    techtree,

    /**
     * Open the tech tree over the garage (used by the screenshot harness).
     * @param {string} [nation='usa'] 'usa' | 'germany' | 'ussr'
     */
    showTechTree(nation = 'usa') {
      techtree.show(nation);
    },

    /**
     * Highlight a tank in the carousel and refresh the stats card; calls onSelect.
     * @param {string} specId
     */
    setSelected(specId) {
      if (applySelection(specId) && onSelect) onSelect(specId);
    },

    // --- MAP-CONFIG WIRING ---
    /** Currently selected battlefield id ('random' allowed). @returns {string} */
    getSelectedMap() { return selectedMapId; },

    /**
     * Highlight a battlefield in the map picker.
     * @param {string} mapId map id or 'random'
     */
    setSelectedMap(mapId) {
      if (!mapCardById.has(mapId)) return;
      selectedMapId = mapId;
      for (const [id, card] of mapCardById) card.classList.toggle('sel', id === mapId);
    },
  };

  if (mapCardById.size) api.setSelectedMap(selectedMapId);

  if (selectedId) applySelection(selectedId);
  return api;
}
