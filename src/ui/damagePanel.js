// src/ui/damagePanel.js — bottom-left player damage panel: the VEHICLE'S OWN
// top-down silhouette (pre-rendered from the shipped model, public/icons/
// <id>_top_silhouette.png) with module hit-zones and vector module icons
// (tracks, engine, fuel, ammo, gun, optics, radio, turret ring) that stay a
// dim ghost while healthy and light yellow/red when damaged — WoT panel
// language, no text labels. Crew row, HP bar and fire indicator.
// Contract: docs/ARCHITECTURE.md §3.7.2.

import { FONT_STACK, FONT_COND, ensureFonts } from './fonts.js';
import { iconUrl } from './icons.js';

// WoT module-state ramp: WHITE while functional, ORANGE damaged, RED knocked
// out. (ok-white is what the glyphs render in on a healthy vehicle.)
const STATE_COLOR = { ok: '#eef4f9', yellow: '#f0952e', red: '#f05a5a' };
const CREW_ORDER = ['commander', 'gunner', 'driver', 'loader'];
const CREW_SHORT = { commander: 'CDR', gunner: 'GNR', driver: 'DRV', loader: 'LDR' };

// distinct micro-icon per crew role (WoT reads roles at a glance):
// commander = binoculars, gunner = crosshair, driver = steering wheel,
// loader = shell
const CREW_SVG = {
  commander: '<svg viewBox="0 0 12 12" width="12" height="12">' +
    '<circle cx="3.4" cy="7.4" r="2.6" fill="currentColor"/>' +
    '<circle cx="8.6" cy="7.4" r="2.6" fill="currentColor"/>' +
    '<rect x="4.8" y="6.4" width="2.4" height="1.6" fill="currentColor"/>' +
    '<rect x="2.4" y="2.6" width="2" height="2.6" fill="currentColor"/>' +
    '<rect x="7.6" y="2.6" width="2" height="2.6" fill="currentColor"/></svg>',
  gunner: '<svg viewBox="0 0 12 12" width="12" height="12">' +
    '<circle cx="6" cy="6" r="3.4" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
    '<circle cx="6" cy="6" r="1" fill="currentColor"/>' +
    '<path d="M6 .8v2.4M6 8.8v2.4M.8 6h2.4M8.8 6h2.4" stroke="currentColor" stroke-width="1.2"/></svg>',
  driver: '<svg viewBox="0 0 12 12" width="12" height="12">' +
    '<circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
    '<circle cx="6" cy="6" r="1.4" fill="currentColor"/>' +
    '<path d="M6 7.2v3.2M2 4.6l2.8 1.2M10 4.6 7.2 5.8" stroke="currentColor" stroke-width="1.2"/></svg>',
  loader: '<svg viewBox="0 0 12 12" width="12" height="12">' +
    '<path d="M4.4 4.6 6 1.2l1.6 3.4Z" fill="currentColor"/>' +
    '<rect x="4.4" y="4.6" width="3.2" height="4.6" fill="currentColor"/>' +
    '<rect x="3.9" y="9.6" width="4.2" height="1.4" fill="currentColor"/></svg>',
};

const DP_CSS = `
.cot-dp{position:absolute;left:12px;bottom:12px;width:148px;pointer-events:none;
  font-family:${FONT_STACK};color:#e6edf3;background:linear-gradient(180deg,rgba(10,14,18,.72),rgba(6,9,12,.8));
  border:1px solid rgba(146,164,180,.25);box-shadow:0 6px 22px rgba(0,0,0,.5);
  padding:7px 8px 8px;-webkit-user-select:none;user-select:none;}
.cot-dp *{box-sizing:border-box;margin:0;padding:0;}
.cot-dp .hprow{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px;}
.cot-dp .hplabel{font-size:9px;font-weight:700;letter-spacing:.14em;color:#8a97a3;
  font-family:${FONT_COND};font-stretch:condensed;}
.cot-dp .hpnum{font-size:12px;font-weight:700;color:#d6e2ec;font-variant-numeric:tabular-nums;
  font-family:${FONT_COND};font-stretch:condensed;}
.cot-dp .hptrack{height:5px;background:rgba(4,6,8,.75);border:1px solid rgba(0,0,0,.6);margin-bottom:5px;}
.cot-dp .hpfill{height:100%;width:100%;transition:width .15s linear;}
.cot-dp canvas{display:block;margin:0 auto;}
.cot-dp .crew{display:flex;justify-content:center;gap:4px;margin-top:5px;}
.cot-dp .cm{width:24px;height:24px;border-radius:3px;border:1px solid rgba(146,164,180,.45);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;
  color:#a9c3d8;background:rgba(20,28,34,.7);}
.cot-dp .cm svg{display:block;width:11px;height:11px;}
.cot-dp .cm .rl{font-size:6px;font-weight:800;letter-spacing:.08em;color:#7d8b98;line-height:1;margin-top:1px;}
.cot-dp .cm.dead{color:#f05a5a;border-color:rgba(240,90,90,.7);background:rgba(46,14,14,.7);}
.cot-dp .cm.dead .rl{color:#f28f8f;}
.cot-dp .fire{position:absolute;top:34px;right:10px;font-size:9px;font-weight:800;
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
// Vehicle-specific top-down silhouette: the generated <id>_top_silhouette.png
// (flat white alpha shape of the ACTUAL model) is loaded once per spec, its
// opaque bounding box measured, and two tinted copies cached — a pale rim
// pass (drawn with 1px offsets as an outline) and a dark steel body pass.
// ---------------------------------------------------------------------------
const topSilCache = new Map(); // specId -> { img, bbox:[x,y,w,h], body, rim } | 'pending'
function tintCanvas(img, color) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}
function topSilhouette(specId, onReady) {
  const e = topSilCache.get(specId);
  if (e === 'pending' || e === 'failed') return null;
  if (e) return e;
  topSilCache.set(specId, 'pending');
  const img = new Image();
  img.onload = () => {
    // measure the opaque content box on a 128px probe (cheap, alpha only)
    const P = 128;
    const probe = document.createElement('canvas');
    probe.width = P; probe.height = P;
    const px2 = probe.getContext('2d');
    px2.drawImage(img, 0, 0, P, P);
    const d = px2.getImageData(0, 0, P, P).data;
    let x0 = P, y0 = P, x1 = 0, y1 = 0;
    for (let y = 0; y < P; y++) {
      for (let x = 0; x < P; x++) {
        if (d[(y * P + x) * 4 + 3] > 24) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    if (x1 <= x0 || y1 <= y0) { x0 = 0; y0 = 0; x1 = P - 1; y1 = P - 1; }
    const sx = img.naturalWidth / P, sy = img.naturalHeight / P;
    const entry = {
      img,
      bbox: [x0 * sx, y0 * sy, (x1 - x0 + 1) * sx, (y1 - y0 + 1) * sy],
      rim: tintCanvas(img, 'rgba(232,242,250,0.96)'),
      body: tintCanvas(img, '#2c343c'),
    };
    topSilCache.set(specId, entry);
    if (onReady) onReady();
  };
  img.onerror = () => { topSilCache.set(specId, 'failed'); };
  img.src = iconUrl(specId, 'top_silhouette');
  return null;
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
  ensureFonts();
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

  // single compact top-down silhouette (WoT panel scale — one vehicle map,
  // module hit-zones drawn onto it; no redundant second profile)
  const CW = 118, CH = 152;
  const dprC = 2; // fixed 2x internal resolution — crisp at devicePixelRatio 1
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

  // Tint a module's actual armor-model box footprint (engine bay, ammo rack,
  // fuel tank) so damage states light up real hit-zones on the silhouette.
  // WoT panel language: zones are INVISIBLE while healthy — the clean vehicle
  // shape is the "all systems fine" read — and flood yellow/red on damage.
  // No text labels anywhere.
  const REGION_MODULES = ['engine', 'ammoRack', 'fuelTank'];
  function drawModuleRegions(tPivot) {
    const mods = (spec.armor && spec.armor.modules) || [];
    for (const m of mods) {
      if (REGION_MODULES.indexOf(m.module) < 0 || !m.min || !m.max) continue;
      const st = moduleState(m.module);
      if (st === 'ok') continue;
      let x0 = m.min[0], x1 = m.max[0], z0 = m.min[2], z1 = m.max[2];
      if (m.turretLocal) { x0 += tPivot[0]; x1 += tPivot[0]; z0 += tPivot[2]; z1 += tPivot[2]; }
      const rx = px(x0), ry = py(z1);
      const rw = (x1 - x0) * scale, rh = (z1 - z0) * scale;
      ctx.fillStyle = STATE_COLOR[st] + '46';
      ctx.strokeStyle = STATE_COLOR[st];
      ctx.lineWidth = 1;
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeRect(rx, ry, rw, rh);
    }
  }

  // Vector stand-in for the first few frames while the silhouette PNG decodes
  // (kept minimal: dim hull wedge + turret + gun, no module dressing).
  function drawVectorFallback(d, L, W, tPivot) {
    const modern = spec.era !== 'ww2';
    const hullW = W * 0.56;
    const nose = modern ? 0.19 : 0.12;
    ctx.fillStyle = 'rgba(64,76,88,0.8)';
    ctx.strokeStyle = 'rgba(200,220,235,0.55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(px(-hullW / 2), py(L / 2 - L * nose));
    ctx.lineTo(px(-hullW * (modern ? 0.16 : 0.22)), py(L / 2));
    ctx.lineTo(px(hullW * (modern ? 0.16 : 0.22)), py(L / 2));
    ctx.lineTo(px(hullW / 2), py(L / 2 - L * nose));
    ctx.lineTo(px(hullW / 2), py(-L / 2 + L * 0.05));
    ctx.lineTo(px(hullW * 0.38), py(-L / 2));
    ctx.lineTo(px(-hullW * 0.38), py(-L / 2));
    ctx.lineTo(px(-hullW / 2), py(-L / 2 + L * 0.05));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const muzzleZ = d.overallLengthM - L / 2;
    ctx.strokeStyle = 'rgba(200,220,235,0.6)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px(tPivot[0]), py(tPivot[2]));
    ctx.lineTo(px(tPivot[0]), py(muzzleZ));
    ctx.stroke();
    ctx.lineCap = 'butt';
    const turR = W * 0.30;
    ctx.fillStyle = 'rgba(84,98,110,0.85)';
    ctx.beginPath();
    ctx.ellipse(px(tPivot[0]), py(tPivot[2]), turR * scale, turR * 1.25 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw() {
    ctx.clearRect(0, 0, CW, CH);
    if (!spec) return;
    const d = spec.dims;
    const L = d.hullLengthM, W = d.widthM;
    const armor = spec.armor || {};
    const tPivot = armor.turretPivot || [0, 1.2, 0];

    // --- base: the vehicle's REAL top-down silhouette (own model render) ---
    // Fit the icon's opaque content box to the dims extent so the armor-model
    // module anchors line up with the drawn hull (z exact, aspect preserved).
    const sil = topSilhouette(spec.id, () => draw());
    if (sil) {
      const [bx, by, bw, bh] = sil.bbox;
      const top = py(d.overallLengthM - L / 2);
      const bot = py(-L / 2);
      const destH = bot - top;
      const destW = destH * (bw / bh);
      const destX = cx - destW / 2;
      // crisp bright contour: eight offset passes of the near-white tint at
      // ~full alpha build a sharp 1.5px outline (WoT's white schematic edge)
      ctx.globalAlpha = 0.92;
      for (const [ox, oy] of [
        [-1.5, 0], [1.5, 0], [0, -1.5], [0, 1.5],
        [-1, -1], [1, -1], [-1, 1], [1, 1],
      ]) {
        ctx.drawImage(sil.rim, bx, by, bw, bh, destX + ox, top + oy, destW, destH);
      }
      // dark steel body over the rim passes — high edge contrast
      ctx.globalAlpha = 0.97;
      ctx.drawImage(sil.body, bx, by, bw, bh, destX, top, destW, destH);
      ctx.globalAlpha = 1;
    } else {
      drawVectorFallback(d, L, W, tPivot);
    }

    // --- damaged running gear: track strips flood yellow/red over the base --
    const trackW = W * 0.24;
    const trkTop = py(L / 2), trkBot = py(-L / 2);
    for (const [sideX, st] of [[-W / 2, moduleState('trackL')], [W / 2 - trackW, moduleState('trackR')]]) {
      if (st === 'ok') continue;
      ctx.fillStyle = STATE_COLOR[st] + '52';
      ctx.strokeStyle = STATE_COLOR[st];
      ctx.lineWidth = 1.2;
      roundRect(ctx, px(sideX), trkTop, trackW * scale, trkBot - trkTop, 2);
      ctx.fill();
      ctx.stroke();
    }
    // damaged gun: the barrel line re-draws in its state color
    const gunSt = moduleState('gun');
    if (gunSt !== 'ok') {
      const muzzleZ = d.overallLengthM - L / 2;
      ctx.strokeStyle = STATE_COLOR[gunSt];
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(px(tPivot[0]), py(tPivot[2]));
      ctx.lineTo(px(tPivot[0]), py(muzzleZ));
      ctx.stroke();
      ctx.lineCap = 'butt';
    }

    // module hit-zones from the real armor model — invisible until damaged
    drawModuleRegions(tPivot);

    // module icons at relaxed anchors — WoT state ramp: crisp WHITE glyph
    // while functional, then an orange/red lit plate once damaged/destroyed.
    if (!anchors) computeAnchors();
    for (const [name, pt] of anchors) {
      const icon = MODULE_ICON[name];
      if (!icon) continue;
      const st = moduleState(name);
      ctx.save();
      ctx.translate(pt[0], pt[1]);
      if (st === 'ok') {
        // white glyph with a dark halo — legible on the dark hull at 1080p
        ctx.shadowColor = 'rgba(4,7,10,0.95)';
        ctx.shadowBlur = 3;
        ctx.globalAlpha = 0.88;
        icon(ctx, STATE_COLOR.ok);
        ctx.shadowBlur = 0;
      } else {
        const col = STATE_COLOR[st];
        roundRect(ctx, -8.5, -8.5, 17, 17, 3);
        ctx.fillStyle = 'rgba(30,14,10,0.92)';
        ctx.fill();
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        icon(ctx, col);
      }
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
      e.innerHTML = `${CREW_SVG[name] || CREW_SVG.loader}<span class="rl">${CREW_SHORT[name] || name.slice(0, 3).toUpperCase()}</span>`;
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
