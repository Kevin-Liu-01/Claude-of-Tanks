// src/ui/damagePanel.js — bottom-left player damage panel: top-down tank
// silhouette with module state dots, crew row, HP bar and fire indicator.
// Contract: docs/ARCHITECTURE.md §3.7.2.

const FONT_STACK = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const STATE_COLOR = { ok: '#7ee87e', yellow: '#f0b04a', red: '#f05a5a' };
const MODULE_LETTER = {
  engine: 'E', fuelTank: 'F', ammoRack: 'A', gun: 'G',
  turretRing: 'T', radio: 'R', optics: 'O',
};
const CREW_ORDER = ['commander', 'gunner', 'driver', 'loader'];
const CREW_LETTER = { commander: 'C', gunner: 'G', driver: 'D', loader: 'L' };

const DP_CSS = `
.cot-dp{position:absolute;left:16px;bottom:16px;width:196px;pointer-events:none;
  font-family:${FONT_STACK};color:#e6edf3;background:linear-gradient(180deg,rgba(10,14,18,.72),rgba(6,9,12,.8));
  border:1px solid rgba(146,164,180,.25);box-shadow:0 6px 22px rgba(0,0,0,.5);
  padding:8px 10px 9px;-webkit-user-select:none;user-select:none;}
.cot-dp *{box-sizing:border-box;margin:0;padding:0;}
.cot-dp .hprow{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;}
.cot-dp .hplabel{font-size:9.5px;font-weight:700;letter-spacing:.16em;color:#8a97a3;}
.cot-dp .hpnum{font-size:12.5px;font-weight:600;color:#d6e2ec;font-variant-numeric:tabular-nums;}
.cot-dp .hptrack{height:6px;background:rgba(4,6,8,.75);border:1px solid rgba(0,0,0,.6);margin-bottom:6px;}
.cot-dp .hpfill{height:100%;width:100%;transition:width .15s linear;}
.cot-dp canvas{display:block;margin:0 auto;}
.cot-dp .crew{display:flex;justify-content:center;gap:6px;margin-top:6px;}
.cot-dp .cm{width:22px;height:22px;border-radius:50%;border:1px solid rgba(146,164,180,.45);
  display:flex;align-items:center;justify-content:center;font-size:10.5px;font-weight:700;
  color:#cfe3f4;background:rgba(20,28,34,.7);}
.cot-dp .cm.dead{color:#f05a5a;border-color:rgba(240,90,90,.7);background:rgba(46,14,14,.7);
  text-decoration:line-through;}
.cot-dp .fire{position:absolute;top:40px;right:12px;font-size:9.5px;font-weight:800;
  letter-spacing:.14em;color:#ff6a3c;text-shadow:0 0 8px rgba(255,80,30,.8);display:none;
  animation:cotFirePulse .7s ease-in-out infinite alternate;}
@keyframes cotFirePulse{from{opacity:.55}to{opacity:1}}
`;

function ensureStyle(id, css) {
  if (!document.getElementById(id)) {
    const s = document.createElement('style');
    s.id = id;
    s.textContent = css;
    document.head.appendChild(s);
  }
}

function hpColor(frac) {
  return frac > 0.5 ? '#7ee87e' : frac > 0.25 ? '#f0b04a' : '#f05a5a';
}

/**
 * Create the player damage panel (silhouette + modules + crew + HP + fire).
 * The root is not attached to the document — hud.setDamagePanel mounts it.
 * @returns {{root:HTMLElement,setTank:Function,update:Function,setState:Function}} Panel
 */
export function createDamagePanel() {
  ensureStyle('cot-dp-style', DP_CSS);

  const root = document.createElement('div');
  root.className = 'cot-dp';
  root.innerHTML =
    `<div class="hprow"><span class="hplabel">HIT POINTS</span><span class="hpnum">—</span></div>` +
    `<div class="hptrack"><div class="hpfill"></div></div>` +
    `<div class="fire">ON FIRE</div>`;
  const hpNum = root.querySelector('.hpnum');
  const hpFill = root.querySelector('.hpfill');
  const fireEl = root.querySelector('.fire');

  const CW = 150, CH = 200;
  const dprC = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
  const canvas = document.createElement('canvas');
  canvas.width = CW * dprC; canvas.height = CH * dprC;
  canvas.style.width = `${CW}px`; canvas.style.height = `${CH}px`;
  root.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dprC, 0, 0, dprC, 0, 0);

  const crewRow = document.createElement('div');
  crewRow.className = 'crew';
  root.appendChild(crewRow);
  const crewEls = new Map();

  let spec = null;
  let combat = null;
  let lastHpText = '';
  let lastFireOn = null;

  // --- top-down mapping: world x -> canvas x, world +Z (forward) -> canvas up ---
  let scale = 20, cx = CW / 2, czOffset = 0;
  function computeLayout() {
    const d = spec.dims;
    const L = d.hullLengthM, overall = Math.max(d.overallLengthM, L);
    scale = (CH - 26) / overall;
    cx = CW / 2;
    // drawn extent: z in [-L/2, overall - L/2]; center it vertically
    czOffset = (overall - L) / 2; // world-z of extent center
  }
  function px(x) { return cx + x * scale; }
  function py(z) { return CH / 2 - (z - czOffset) * scale; }

  function roundRect(c, x, y, wdt, hgt, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + wdt, y, x + wdt, y + hgt, r);
    c.arcTo(x + wdt, y + hgt, x, y + hgt, r);
    c.arcTo(x, y + hgt, x, y, r);
    c.arcTo(x, y, x + wdt, y, r);
    c.closePath();
  }

  function moduleState(name) {
    if (!combat || !combat.modules || !combat.modules[name]) return 'ok';
    return combat.modules[name].state || 'ok';
  }

  function draw() {
    ctx.clearRect(0, 0, CW, CH);
    if (!spec) return;
    const d = spec.dims;
    const L = d.hullLengthM, W = d.widthM;
    const armor = spec.armor || {};
    const tPivot = armor.turretPivot || [0, 1.2, 0];

    // tracks (colored by trackL/trackR state)
    const trackW = W * 0.24;
    const trkTop = py(L / 2), trkBot = py(-L / 2);
    const stL = moduleState('trackL'), stR = moduleState('trackR');
    ctx.fillStyle = stL === 'ok' ? 'rgba(120,140,155,0.30)' : STATE_COLOR[stL] + '55';
    roundRect(ctx, px(-W / 2), trkTop, trackW * scale, trkBot - trkTop, 3);
    ctx.fill();
    ctx.strokeStyle = stL === 'ok' ? 'rgba(190,210,225,0.5)' : STATE_COLOR[stL];
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = stR === 'ok' ? 'rgba(120,140,155,0.30)' : STATE_COLOR[stR] + '55';
    roundRect(ctx, px(W / 2 - trackW), trkTop, trackW * scale, trkBot - trkTop, 3);
    ctx.fill();
    ctx.strokeStyle = stR === 'ok' ? 'rgba(190,210,225,0.5)' : STATE_COLOR[stR];
    ctx.stroke();

    // hull body
    const hullW = W * 0.56;
    ctx.fillStyle = 'rgba(150,175,195,0.16)';
    ctx.strokeStyle = 'rgba(200,220,235,0.75)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    // pointed nose wedge
    ctx.moveTo(px(-hullW / 2), py(L / 2 - L * 0.12));
    ctx.lineTo(px(0), py(L / 2));
    ctx.lineTo(px(hullW / 2), py(L / 2 - L * 0.12));
    ctx.lineTo(px(hullW / 2), py(-L / 2));
    ctx.lineTo(px(-hullW / 2), py(-L / 2));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // gun barrel (from turret pivot to overall-length muzzle)
    const muzzleZ = d.overallLengthM - L / 2;
    const gunSt = moduleState('gun');
    ctx.strokeStyle = gunSt === 'ok' ? 'rgba(200,220,235,0.85)' : STATE_COLOR[gunSt];
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px(tPivot[0]), py(tPivot[2]));
    ctx.lineTo(px(tPivot[0]), py(muzzleZ));
    ctx.stroke();
    ctx.lineCap = 'butt';

    // turret
    const turR = W * 0.30;
    ctx.fillStyle = 'rgba(150,175,195,0.22)';
    ctx.strokeStyle = 'rgba(200,220,235,0.85)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(px(tPivot[0]), py(tPivot[2]), turR * scale, turR * 1.25 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // module dots at armor-model positions
    const mods = armor.modules || [];
    ctx.font = `700 7px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < mods.length; i++) {
      const m = mods[i];
      if (m.module === 'trackL' || m.module === 'trackR') continue; // drawn as strips
      let mx = (m.min[0] + m.max[0]) / 2;
      let mz = (m.min[2] + m.max[2]) / 2;
      if (m.turretLocal) { mx += tPivot[0]; mz += tPivot[2]; }
      const st = moduleState(m.module);
      const col = STATE_COLOR[st];
      ctx.beginPath();
      ctx.arc(px(mx), py(mz), 6, 0, Math.PI * 2);
      ctx.fillStyle = st === 'ok' ? 'rgba(20,32,24,0.85)' : col + 'cc';
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.fillStyle = st === 'ok' ? col : '#10161a';
      ctx.fillText(MODULE_LETTER[m.module] || '?', px(mx), py(mz) + 0.5);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  function rebuildCrewRow() {
    crewRow.textContent = '';
    crewEls.clear();
    const crewBoxes = (spec && spec.armor && spec.armor.crew) || [];
    const present = new Set(crewBoxes.map((c) => c.crew));
    const list = present.size ? CREW_ORDER.filter((c) => present.has(c)) : CREW_ORDER;
    for (const name of list) {
      const e = document.createElement('div');
      e.className = 'cm';
      e.textContent = CREW_LETTER[name];
      e.title = name;
      crewRow.appendChild(e);
      crewEls.set(name, e);
    }
  }

  function refreshDom() {
    if (!combat) return;
    const frac = Math.max(0, Math.min(1, combat.hp / combat.maxHp));
    const txt = `${Math.max(0, Math.round(combat.hp))} / ${Math.round(combat.maxHp)}`;
    if (txt !== lastHpText) {
      hpNum.textContent = txt;
      hpFill.style.width = `${(frac * 100).toFixed(1)}%`;
      hpFill.style.background = hpColor(frac);
      lastHpText = txt;
    }
    const burning = !!(combat.fire && combat.fire.burning);
    if (burning !== lastFireOn) {
      fireEl.style.display = burning ? 'block' : 'none';
      lastFireOn = burning;
    }
    for (const [name, e] of crewEls) {
      const alive = !combat.crew || combat.crew[name] !== false;
      e.classList.toggle('dead', !alive);
    }
  }

  /** Build a fully-healthy CombatState-shaped object for this spec. */
  function healthyCombat() {
    const modules = {};
    const mods = (spec && spec.armor && spec.armor.modules) || [];
    for (const m of mods) modules[m.module] = { hp: 1, maxHp: 1, state: 'ok', repairT: 0 };
    const crew = {};
    const crewBoxes = (spec && spec.armor && spec.armor.crew) || [];
    for (const c of crewBoxes) crew[c.crew] = true;
    return {
      hp: spec ? spec.hp : 1, maxHp: spec ? spec.hp : 1, destroyed: false,
      modules, crew, fire: { burning: false, tickTimer: 0, ticksLeft: 0 },
    };
  }

  return {
    root,

    /**
     * Set the tank whose silhouette/modules the panel shows.
     * @param {TankSpec} s
     */
    setTank(s) {
      spec = s;
      combat = healthyCombat();
      lastHpText = '';
      lastFireOn = null;
      computeLayout();
      rebuildCrewRow();
      refreshDom();
      draw();
    },

    /**
     * Refresh the panel from the live combat state (call every frame).
     * @param {CombatState} c
     */
    update(c) {
      combat = c;
      refreshDom();
      draw();
    },

    /**
     * Deterministic screenshot hook: display a sample state. Accepts either a
     * full CombatState or a compact sample:
     * { hpFrac?, modules?: {name:'ok'|'yellow'|'red'}, crew?: {name:boolean}, burning?: boolean }.
     * @param {object} sample
     */
    setState(sample) {
      if (!sample) return;
      if (sample.maxHp != null && sample.modules && typeof Object.values(sample.modules)[0] === 'object') {
        combat = sample; // full CombatState
      } else {
        const c = healthyCombat();
        if (sample.hpFrac != null) c.hp = c.maxHp * Math.max(0, Math.min(1, sample.hpFrac));
        if (sample.hp != null) c.hp = sample.hp;
        if (sample.modules) {
          for (const k of Object.keys(sample.modules)) {
            const v = sample.modules[k];
            c.modules[k] = typeof v === 'string'
              ? { hp: v === 'ok' ? 1 : v === 'yellow' ? 0.5 : 0, maxHp: 1, state: v, repairT: 0 }
              : v;
          }
        }
        if (sample.crew) for (const k of Object.keys(sample.crew)) c.crew[k] = sample.crew[k];
        if (sample.burning != null) c.fire.burning = !!sample.burning;
        combat = c;
      }
      lastHpText = '';
      lastFireOn = null;
      refreshDom();
      draw();
    },
  };
}
