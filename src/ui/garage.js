// src/ui/garage.js — full-screen garage/tank-select overlay: dark gradient
// frame with a transparent center band (the 3D pedestal shows through),
// bottom tank carousel, right stats card, top-center BATTLE button.
// Contract: docs/ARCHITECTURE.md §3.7.3.

const FONT_STACK = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const NATION_BADGE = {
  USA: { bg: '#2f5d8f', fg: '#dce9f7', label: 'USA' },
  Germany: { bg: '#4a4f55', fg: '#e3e7ea', label: 'GER' },
  USSR: { bg: '#8f3030', fg: '#f7dcdc', label: 'USSR' },
  Russia: { bg: '#7a2d35', fg: '#f7dcdc', label: 'RUS' },
};
const DEFAULT_BADGE = { bg: '#54606b', fg: '#e3e7ea', label: '—' };

const SHELL_TYPE_COLOR = {
  AP: '#ffd27a', APCR: '#e8f4ff', HEAT: '#ff8a5c', HE: '#ffb02e', APFSDS: '#ffc46b',
};

// roster maxima for normalized stat bars
const MAX_HP = 2600, MAX_SPEED = 68, MAX_HPT = 23.5, MAX_PEN = 760;

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
.cot-garage .title{position:absolute;top:22px;left:34px;font-size:17px;font-weight:700;
  letter-spacing:.34em;color:#9fb0bf;text-transform:uppercase;}
.cot-garage .title b{color:#f0a030;}
.cot-garage .selname{position:absolute;top:46px;left:34px;font-size:30px;font-weight:300;
  letter-spacing:.06em;color:#eef4f9;}
.cot-garage .selsub{position:absolute;top:86px;left:36px;font-size:11.5px;font-weight:600;
  letter-spacing:.22em;color:#8a97a3;text-transform:uppercase;}
.cot-battle{position:absolute;top:26px;left:50%;transform:translateX(-50%);
  pointer-events:auto;cursor:pointer;border:none;outline:none;
  font-family:${FONT_STACK};font-size:19px;font-weight:800;letter-spacing:.3em;
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
.cot-garage .stats h3{font-size:15px;font-weight:600;letter-spacing:.05em;color:#eef4f9;}
.cot-garage .stats .sub{font-size:10px;font-weight:700;letter-spacing:.18em;color:#8a97a3;
  text-transform:uppercase;margin:3px 0 12px;}
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
.cot-card .flag{display:inline-block;font-size:8.5px;font-weight:800;letter-spacing:.12em;
  padding:2px 6px;border-radius:2px;margin-bottom:5px;}
.cot-card .era{float:right;font-size:8.5px;font-weight:700;letter-spacing:.12em;
  color:#8a97a3;padding:2px 0;}
.cot-card.sel .era{color:#d8a04c;}
.cot-card .nm{font-size:12.5px;font-weight:600;color:#eef4f9;letter-spacing:.02em;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cot-card .cls{font-size:9px;font-weight:700;letter-spacing:.18em;color:#8a97a3;
  text-transform:uppercase;margin-top:2px;}
.cot-garage .hint{position:absolute;bottom:4px;left:50%;transform:translateX(-50%);
  font-size:9.5px;letter-spacing:.14em;color:rgba(138,151,163,.7);text-transform:uppercase;}
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
  ensureStyle('cot-garage-style', GARAGE_CSS);

  const root = document.createElement('div');
  root.className = 'cot-garage';
  root.innerHTML =
    `<div class="band-top"></div><div class="band-bot"></div>` +
    `<div class="band-l"></div><div class="band-r"></div>` +
    `<div class="title">CLAUDE <b>OF TANKS</b></div>` +
    `<div class="selname"></div><div class="selsub"></div>` +
    `<button class="cot-battle" type="button">BATTLE</button>` +
    `<div class="stats"></div>` +
    `<div class="cot-carousel">` +
    `<button class="cot-car-arrow prev" type="button">&#8249;</button>` +
    `<div class="cot-cards"></div>` +
    `<button class="cot-car-arrow next" type="button">&#8250;</button>` +
    `</div>` +
    `<div class="hint">&#8592; &#8594; select &nbsp;&middot;&nbsp; enter to battle</div>`;
  document.body.appendChild(root);

  const selName = root.querySelector('.selname');
  const selSub = root.querySelector('.selsub');
  const statsEl = root.querySelector('.stats');
  const cardsEl = root.querySelector('.cot-cards');
  const battleBtn = root.querySelector('.cot-battle');

  let selectedId = specs.length ? specs[0].id : null;
  const cardById = new Map();
  const specById = new Map();
  for (const s of specs) specById.set(s.id, s);

  const emit = (ev, payload) => { if (bus && bus.emit) bus.emit(ev, payload); };

  // --- build carousel cards ---
  for (const s of specs) {
    const badge = NATION_BADGE[s.nation] || DEFAULT_BADGE;
    const card = document.createElement('div');
    card.className = 'cot-card';
    card.innerHTML =
      `<span class="era">${s.era === 'ww2' ? 'WWII' : 'MODERN'}</span>` +
      `<span class="flag" style="background:${badge.bg};color:${badge.fg}">${badge.label}</span>` +
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
      const pen = sh.type === 'HE' ? `${sh.pen100Mm}` : `${sh.pen100Mm}&#8250;${sh.pen1000Mm}`;
      shellRows += `<div class="shellrow"><span class="ty" style="color:${col}">${sh.type}</span>` +
        `<span class="nm">${sh.name}</span>` +
        `<span class="pd"><b>${pen}</b> mm &nbsp;<b>${sh.dmg}</b> hp</span></div>`;
    }
    const hullMm = frontArmorMm(spec.armor && spec.armor.hullPlates, ['glacis', 'front', 'driver']);
    const turMm = frontArmorMm(spec.armor && spec.armor.turretPlates, ['front', 'cheek', 'mantlet']);
    const bestPen = shells.length ? Math.max(...shells.map((s) => s.pen100Mm || 0)) : 0;
    statsEl.innerHTML =
      `<h3></h3><div class="sub">${spec.nation} &middot; ${spec.class} &middot; ${spec.era === 'ww2' ? 'WWII' : 'MODERN'}</div>` +
      statBar('Hit points', `${spec.hp}`, spec.hp / MAX_HP) +
      statBar('Top speed', `${spec.topSpeedKmh} km/h`, spec.topSpeedKmh / MAX_SPEED) +
      statBar('Power / weight', `${hpT.toFixed(1)} hp/t`, hpT / MAX_HPT) +
      statBar('Reload', `${spec.gun.reloadS.toFixed(1)} s`, 1 - Math.min(1, spec.gun.reloadS / 15)) +
      statBar('Penetration', `${bestPen} mm`, bestPen / MAX_PEN) +
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
    selSub.textContent = `${spec.nation} · ${spec.class} · ${spec.era === 'ww2' ? 'WWII' : 'MODERN'}`;
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
    emit('ui:battleStart', { specId: selectedId });
    if (onBattle) onBattle(selectedId);
  }

  battleBtn.addEventListener('click', battle);
  root.querySelector('.prev').addEventListener('click', () => step(-1));
  root.querySelector('.next').addEventListener('click', () => step(1));

  function onKey(e) {
    if (!api.isOpen) return;
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

    /** Close the garage screen. */
    hide() {
      root.style.display = 'none';
      if (api.isOpen) window.removeEventListener('keydown', onKey);
      api.isOpen = false;
    },

    /**
     * Highlight a tank in the carousel and refresh the stats card; calls onSelect.
     * @param {string} specId
     */
    setSelected(specId) {
      if (applySelection(specId) && onSelect) onSelect(specId);
    },
  };

  if (selectedId) applySelection(selectedId);
  return api;
}
