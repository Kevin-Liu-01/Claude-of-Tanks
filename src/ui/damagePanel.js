// src/ui/damagePanel.js — bottom-left player damage panel: top-down tank
// silhouette with vector module icons (tracks, engine, fuel, ammo, gun,
// optics, radio, turret ring), crew row, HP bar and fire indicator.
// Contract: docs/ARCHITECTURE.md §3.7.2.

const FONT_STACK = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const STATE_COLOR = { ok: '#7ee87e', yellow: '#f0b04a', red: '#f05a5a' };
const CREW_ORDER = ['commander', 'gunner', 'driver', 'loader'];
const CREW_SHORT = { commander: 'CDR', gunner: 'GNR', driver: 'DRV', loader: 'LDR' };

const CREW_SVG = '<svg viewBox="0 0 12 12" width="12" height="12">' +
  '<circle cx="6" cy="3.6" r="2.5" fill="currentColor"/>' +
  '<path d="M1.4 11.2a4.6 4.6 0 0 1 9.2 0Z" fill="currentColor"/></svg>';

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
.cot-dp .crew{display:flex;justify-content:center;gap:5px;margin-top:6px;}
.cot-dp .cm{width:26px;height:26px;border-radius:3px;border:1px solid rgba(146,164,180,.45);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;
  color:#a9c3d8;background:rgba(20,28,34,.7);}
.cot-dp .cm svg{display:block;}
.cot-dp .cm .rl{font-size:6px;font-weight:800;letter-spacing:.08em;color:#7d8b98;line-height:1;margin-top:1px;}
.cot-dp .cm.dead{color:#f05a5a;border-color:rgba(240,90,90,.7);background:rgba(46,14,14,.7);}
.cot-dp .cm.dead .rl{color:#f28f8f;}
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

// ---------------------------------------------------------------------------
// Vector module icons — each drawn centered at (0,0) in a ~12px box, using
// the module state color. No letters, no text.
// ---------------------------------------------------------------------------
const MODULE_ICON = {
  gun(c, col) {
    // barrel with muzzle brake
    c.fillStyle = col;
    c.fillRect(-1.5, -6, 3, 9.5);
    c.fillRect(-2.5, -6.5, 5, 2);
    c.fillRect(-3, 3.5, 6, 2.5);
  },
  engine(c, col) {
    // engine block with cylinder head bumps
    c.fillStyle = col;
    c.fillRect(-5, -2.5, 10, 7);
    for (let i = 0; i < 3; i++) c.fillRect(-4 + i * 3.2, -4.5, 2, 2.4);
    c.clearRect(-3.2, -0.8, 2.2, 3.4);
    c.clearRect(1, -0.8, 2.2, 3.4);
  },
  fuelTank(c, col) {
    // jerrycan with X emboss
    c.fillStyle = col;
    c.fillRect(-4.5, -4, 9, 9.5);
    c.fillRect(1, -5.5, 2.5, 2);
    c.strokeStyle = 'rgba(8,12,16,0.95)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(-3, -2.5); c.lineTo(3, 4);
    c.moveTo(3, -2.5); c.lineTo(-3, 4);
    c.stroke();
  },
  ammoRack(c, col) {
    // two shells side by side (body + pointed tip + rim)
    c.fillStyle = col;
    for (const x of [-3.4, 1]) {
      c.fillRect(x, -2.5, 2.4, 8);
      c.beginPath();
      c.moveTo(x, -2.5); c.lineTo(x + 1.2, -6.2); c.lineTo(x + 2.4, -2.5);
      c.closePath();
      c.fill();
      c.fillRect(x - 0.5, 4.2, 3.4, 1.6);
    }
  },
  radio(c, col) {
    // box with antenna + signal arcs
    c.fillStyle = col;
    c.fillRect(-5, 1, 10, 4.5);
    c.strokeStyle = col;
    c.lineWidth = 1.3;
    c.beginPath();
    c.moveTo(-2, 1); c.lineTo(-2, -5.5);
    c.stroke();
    c.beginPath(); c.arc(-2, -5.5, 3, -0.5, 1.2); c.stroke();
    c.beginPath(); c.arc(-2, -5.5, 5, -0.3, 1.0); c.stroke();
  },
  optics(c, col) {
    // lens: ring with crosshair notch
    c.strokeStyle = col;
    c.lineWidth = 1.8;
    c.beginPath(); c.arc(0, 0, 4.4, 0, Math.PI * 2); c.stroke();
    c.fillStyle = col;
    c.beginPath(); c.arc(0, 0, 1.6, 0, Math.PI * 2); c.fill();
    c.lineWidth = 1.1;
    c.beginPath();
    c.moveTo(0, -6.3); c.lineTo(0, -4.4);
    c.moveTo(0, 4.4); c.lineTo(0, 6.3);
    c.moveTo(-6.3, 0); c.lineTo(-4.4, 0);
    c.moveTo(4.4, 0); c.lineTo(6.3, 0);
    c.stroke();
  },
  turretRing(c, col) {
    // open ring with gear notches
    c.strokeStyle = col;
    c.lineWidth = 2;
    c.beginPath(); c.arc(0, 0, 4.2, 0.35, Math.PI * 2 - 0.35); c.stroke();
    c.fillStyle = col;
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      c.fillRect(Math.cos(a) * 4.2 - 1, Math.sin(a) * 4.2 - 1, 2, 2);
    }
  },
};

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
  let anchors = null; // module name -> [x, y] canvas anchor (non-overlapping)

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

  // Compute module icon anchors from the armor model, then relax overlaps so
  // every icon stays legible at gameplay size (min 19px separation).
  function computeAnchors() {
    anchors = new Map();
    if (!spec) return;
    const armor = spec.armor || {};
    const tPivot = armor.turretPivot || [0, 1.2, 0];
    const mods = armor.modules || [];
    const pts = [];
    for (const m of mods) {
      if (m.module === 'trackL' || m.module === 'trackR') continue; // strips
      let mx = (m.min[0] + m.max[0]) / 2;
      let mz = (m.min[2] + m.max[2]) / 2;
      if (m.turretLocal) { mx += tPivot[0]; mz += tPivot[2]; }
      pts.push({ name: m.module, x: px(mx), y: py(mz) });
    }
    // relaxation: push apart pairs closer than MIN_D, clamp to canvas
    const MIN_D = 21;
    for (let it = 0; it < 6; it++) {
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i], b = pts[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          let d = Math.hypot(dx, dy);
          if (d >= MIN_D) continue;
          if (d < 0.01) { dx = 1; dy = 0; d = 1; }
          const push = (MIN_D - d) / 2 / d;
          a.x -= dx * push; a.y -= dy * push;
          b.x += dx * push; b.y += dy * push;
        }
      }
      for (const p of pts) {
        p.x = Math.max(11, Math.min(CW - 11, p.x));
        p.y = Math.max(11, Math.min(CH - 11, p.y));
      }
    }
    for (const p of pts) anchors.set(p.name, [p.x, p.y]);
  }

  function draw() {
    ctx.clearRect(0, 0, CW, CH);
    if (!spec) return;
    const d = spec.dims;
    const L = d.hullLengthM, W = d.widthM;
    const armor = spec.armor || {};
    const tPivot = armor.turretPivot || [0, 1.2, 0];

    // tracks (colored by trackL/trackR state) with road-wheel detailing
    const trackW = W * 0.24;
    const trkTop = py(L / 2), trkBot = py(-L / 2);
    const stL = moduleState('trackL'), stR = moduleState('trackR');
    for (const [sideX, st] of [[-W / 2, stL], [W / 2 - trackW, stR]]) {
      ctx.fillStyle = st === 'ok' ? 'rgba(120,140,155,0.30)' : STATE_COLOR[st] + '55';
      roundRect(ctx, px(sideX), trkTop, trackW * scale, trkBot - trkTop, 3);
      ctx.fill();
      ctx.strokeStyle = st === 'ok' ? 'rgba(190,210,225,0.5)' : STATE_COLOR[st];
      ctx.lineWidth = 1.2;
      ctx.stroke();
      // road wheels (small ticks along the strip)
      ctx.fillStyle = st === 'ok' ? 'rgba(190,210,225,0.28)' : STATE_COLOR[st] + '77';
      const n = 6;
      for (let i = 0; i < n; i++) {
        const y = trkTop + ((i + 0.5) / n) * (trkBot - trkTop);
        ctx.beginPath();
        ctx.arc(px(sideX) + trackW * scale / 2, y, trackW * scale * 0.26, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // hull body: pointed glacis, beveled rear
    const hullW = W * 0.56;
    ctx.fillStyle = 'rgba(150,175,195,0.16)';
    ctx.strokeStyle = 'rgba(200,220,235,0.75)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(px(-hullW / 2), py(L / 2 - L * 0.14));
    ctx.lineTo(px(-hullW * 0.22), py(L / 2));
    ctx.lineTo(px(hullW * 0.22), py(L / 2));
    ctx.lineTo(px(hullW / 2), py(L / 2 - L * 0.14));
    ctx.lineTo(px(hullW / 2), py(-L / 2 + L * 0.05));
    ctx.lineTo(px(hullW * 0.38), py(-L / 2));
    ctx.lineTo(px(-hullW * 0.38), py(-L / 2));
    ctx.lineTo(px(-hullW / 2), py(-L / 2 + L * 0.05));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // engine deck vents
    ctx.strokeStyle = 'rgba(200,220,235,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i <= 3; i++) {
      const y = py(-L / 2 + L * 0.07 * i);
      ctx.moveTo(px(-hullW * 0.34), y); ctx.lineTo(px(hullW * 0.34), y);
    }
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

    // turret with mantlet
    const turR = W * 0.30;
    ctx.fillStyle = 'rgba(150,175,195,0.22)';
    ctx.strokeStyle = 'rgba(200,220,235,0.85)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(px(tPivot[0]), py(tPivot[2]), turR * scale, turR * 1.25 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(200,220,235,0.4)';
    ctx.fillRect(px(tPivot[0]) - 4, py(tPivot[2] + turR * 1.1) - 2, 8, 4);

    // module icons at relaxed anchors (chip background + vector glyph)
    if (!anchors) computeAnchors();
    for (const [name, pt] of anchors) {
      const icon = MODULE_ICON[name];
      if (!icon) continue;
      const st = moduleState(name);
      const col = STATE_COLOR[st];
      ctx.save();
      ctx.translate(pt[0], pt[1]);
      roundRect(ctx, -8.5, -8.5, 17, 17, 3);
      ctx.fillStyle = st === 'ok' ? 'rgba(12,18,22,0.88)' : 'rgba(30,14,10,0.92)';
      ctx.fill();
      ctx.strokeStyle = st === 'ok' ? 'rgba(126,232,126,0.55)' : col;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      icon(ctx, col);
      ctx.restore();
    }
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
      e.innerHTML = `${CREW_SVG}<span class="rl">${CREW_SHORT[name] || name.slice(0, 3).toUpperCase()}</span>`;
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
      anchors = null;
      computeAnchors();
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
