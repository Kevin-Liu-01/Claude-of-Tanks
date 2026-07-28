// src/ui/damagePanel.js — bottom-left player damage panel, WoT panel
// language: a single CLEAN side-profile silhouette of the vehicle (its own
// pre-rendered side_silhouette.png — turret + hull + running gear outline)
// with NOTHING else while healthy. Module and crew state only APPEARS on
// damage: lit orange/red module icons at fixed anchors on the hull, hit-zone
// floods, and red crew chips. No letterforms inside the silhouette, ever
// (hud_ui r2: the always-on white glyphs read as illegible glyph soup).
// Crew row, HP bar and fire indicator.
// Contract: docs/ARCHITECTURE.md §3.7.2.

import { FONT_STACK, FONT_COND, ensureFonts } from './fonts.js';
import { iconUrl } from './icons.js';

// WoT module-state ramp: ORANGE damaged, RED knocked out. (Healthy modules
// draw nothing at all — the clean silhouette IS the "all systems fine" read.)
const STATE_COLOR = { ok: '#eef4f9', yellow: '#f0952e', red: '#f05a5a' };
const CREW_ORDER = ['commander', 'gunner', 'driver', 'loader'];

// distinct micro-icon per crew role (WoT reads roles at a glance):
// commander = binoculars, gunner = crosshair, driver = steering wheel,
// loader = shell
const CREW_SVG = {
  commander: '<svg viewBox="0 0 12 12" width="14" height="14">' +
    '<circle cx="3.4" cy="7.4" r="2.6" fill="currentColor"/>' +
    '<circle cx="8.6" cy="7.4" r="2.6" fill="currentColor"/>' +
    '<rect x="4.8" y="6.4" width="2.4" height="1.6" fill="currentColor"/>' +
    '<rect x="2.4" y="2.6" width="2" height="2.6" fill="currentColor"/>' +
    '<rect x="7.6" y="2.6" width="2" height="2.6" fill="currentColor"/></svg>',
  gunner: '<svg viewBox="0 0 12 12" width="14" height="14">' +
    '<circle cx="6" cy="6" r="3.4" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
    '<circle cx="6" cy="6" r="1" fill="currentColor"/>' +
    '<path d="M6 .8v2.4M6 8.8v2.4M.8 6h2.4M8.8 6h2.4" stroke="currentColor" stroke-width="1.2"/></svg>',
  driver: '<svg viewBox="0 0 12 12" width="14" height="14">' +
    '<circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
    '<circle cx="6" cy="6" r="1.4" fill="currentColor"/>' +
    '<path d="M6 7.2v3.2M2 4.6l2.8 1.2M10 4.6 7.2 5.8" stroke="currentColor" stroke-width="1.2"/></svg>',
  loader: '<svg viewBox="0 0 12 12" width="14" height="14">' +
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
/* crew strip: EMPTY (collapsed) while the crew is unharmed — WoT only
   surfaces crew state on injury. Dead members appear as red icon chips. */
.cot-dp .crew{display:none;justify-content:center;gap:4px;margin-top:5px;}
.cot-dp .crew.someharm{display:flex;}
.cot-dp .cm{width:24px;height:24px;border-radius:3px;display:none;
  align-items:center;justify-content:center;
  color:#f05a5a;border:1px solid rgba(240,90,90,.7);background:rgba(46,14,14,.75);}
.cot-dp .cm.dead{display:flex;}
.cot-dp .cm svg{display:block;width:14px;height:14px;}
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
// Vehicle-specific SIDE-PROFILE silhouette: the generated
// <id>_side_silhouette.png (flat white alpha shape of the ACTUAL model, nose
// screen-right) is loaded once per spec, its opaque bounding box measured,
// and two tinted copies cached — a pale rim pass (drawn with 1px offsets as
// an outline) and a dark steel body pass.
// ---------------------------------------------------------------------------
const silCache = new Map(); // specId -> { img, bbox:[x,y,w,h], body, rim } | 'pending'
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
function sideSilhouette(specId, onReady) {
  const e = silCache.get(specId);
  if (e === 'pending' || e === 'failed') return null;
  if (e) return e;
  silCache.set(specId, 'pending');
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
    silCache.set(specId, entry);
    if (onReady) onReady();
  };
  img.onerror = () => { silCache.set(specId, 'failed'); };
  img.src = iconUrl(specId, 'side_silhouette');
  return null;
}

// ---------------------------------------------------------------------------
// Vector module icons — each drawn centered at (0,0) in a ~12px box, using
// the module state color. Only ever rendered on a DAMAGED module.
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
  track(c, col) {
    // tread link run: two road wheels inside a track loop
    c.strokeStyle = col;
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(-5.4, -2.6); c.lineTo(5.4, -2.6);
    c.arc(5.4, 0.2, 2.8, -Math.PI / 2, Math.PI / 2);
    c.lineTo(-5.4, 3);
    c.arc(-5.4, 0.2, 2.8, Math.PI / 2, Math.PI * 1.5);
    c.closePath();
    c.stroke();
    c.fillStyle = col;
    for (const x of [-2.4, 2.4]) {
      c.beginPath(); c.arc(x, 0.2, 1.5, 0, Math.PI * 2); c.fill();
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

  // single compact SIDE-PROFILE silhouette (WoT panel scale — one clean
  // vehicle profile; module state lights up ON it, never beside it)
  const CW = 132, CH = 74;
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
  // side-view destination box of the silhouette on the canvas (set per draw)
  let destX = 4, destY = 4, destW = CW - 8, destH = CH - 8;

  // --- side mapping: world +Z (forward) -> canvas right, world +Y -> up ----
  // Horizontal span destX..destX+destW covers z in [-L/2, overall - L/2]
  // (rear to muzzle); vertical span covers y in [0, heightM].
  function sx(z) {
    const d = spec.dims;
    const overall = Math.max(d.overallLengthM, d.hullLengthM);
    return destX + ((z + d.hullLengthM / 2) / overall) * destW;
  }
  function sy(y) {
    const Hm = spec.dims.heightM || 2.6;
    return destY + destH - (y / Hm) * destH;
  }

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

  // Compute module icon anchors from the armor model projected into the side
  // view (module box center: z -> screen x, y -> screen y), then relax
  // overlaps so every icon that lights up stays legible (min 20px apart).
  function computeAnchors() {
    anchors = new Map();
    if (!spec) return;
    const armor = spec.armor || {};
    const tPivot = armor.turretPivot || [0, 1.2, 0];
    const mods = armor.modules || [];
    const pts = [];
    for (const m of mods) {
      if (m.module === 'trackL' || m.module === 'trackR') continue; // strip + shared icon
      if (!m.min || !m.max) continue;
      let mz = (m.min[2] + m.max[2]) / 2;
      let my = (m.min[1] + m.max[1]) / 2;
      if (m.turretLocal) { mz += tPivot[2]; my += tPivot[1]; }
      pts.push({ name: m.module, x: sx(mz), y: sy(my) });
    }
    // shared running-gear anchor (front-lower hull, WoT's de-track read)
    pts.push({ name: 'track', x: destX + destW * 0.30, y: destY + destH * 0.86 });
    // relaxation: push apart pairs closer than MIN_D, clamp to canvas
    const MIN_D = 20;
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
        p.x = Math.max(10, Math.min(CW - 10, p.x));
        p.y = Math.max(10, Math.min(CH - 10, p.y));
      }
    }
    for (const p of pts) anchors.set(p.name, [p.x, p.y]);
  }

  // Tint a module's armor-model box footprint (engine bay, ammo rack, fuel
  // tank) projected into the side view, so damage states light up real
  // hit-zones on the silhouette. Zones are INVISIBLE while healthy.
  const REGION_MODULES = ['engine', 'ammoRack', 'fuelTank'];
  function drawModuleRegions(tPivot) {
    const mods = (spec.armor && spec.armor.modules) || [];
    for (const m of mods) {
      if (REGION_MODULES.indexOf(m.module) < 0 || !m.min || !m.max) continue;
      const st = moduleState(m.module);
      if (st === 'ok') continue;
      let z0 = m.min[2], z1 = m.max[2], y0 = m.min[1], y1 = m.max[1];
      if (m.turretLocal) { z0 += tPivot[2]; z1 += tPivot[2]; y0 += tPivot[1]; y1 += tPivot[1]; }
      const rx = sx(z0), ry = sy(y1);
      const rw = sx(z1) - rx, rh = sy(y0) - ry;
      ctx.fillStyle = STATE_COLOR[st] + '46';
      ctx.strokeStyle = STATE_COLOR[st];
      ctx.lineWidth = 1;
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeRect(rx, ry, rw, rh);
    }
  }

  // Vector stand-in for the first few frames while the silhouette PNG
  // decodes: minimal clean side profile (hull wedge + turret + gun), no
  // dressing — same "healthy = empty" language.
  function drawVectorFallback() {
    const d = spec.dims;
    const Hm = d.heightM || 2.6;
    const tPivot = (spec.armor && spec.armor.turretPivot) || [0, 1.2, 0];
    const hullTop = Hm * 0.62;
    ctx.fillStyle = 'rgba(64,76,88,0.85)';
    ctx.strokeStyle = 'rgba(210,226,240,0.75)';
    ctx.lineWidth = 1.2;
    // hull side profile with glacis nose
    ctx.beginPath();
    ctx.moveTo(sx(-d.hullLengthM / 2), sy(Hm * 0.16));
    ctx.lineTo(sx(-d.hullLengthM / 2), sy(hullTop * 0.85));
    ctx.lineTo(sx(d.hullLengthM * 0.22), sy(hullTop));
    ctx.lineTo(sx(d.hullLengthM / 2), sy(hullTop * 0.6));
    ctx.lineTo(sx(d.hullLengthM / 2), sy(Hm * 0.16));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // turret + gun
    ctx.fillStyle = 'rgba(84,98,110,0.9)';
    ctx.beginPath();
    ctx.moveTo(sx(tPivot[2] - d.hullLengthM * 0.18), sy(hullTop));
    ctx.lineTo(sx(tPivot[2] - d.hullLengthM * 0.10), sy(Hm * 0.97));
    ctx.lineTo(sx(tPivot[2] + d.hullLengthM * 0.14), sy(Hm * 0.97));
    ctx.lineTo(sx(tPivot[2] + d.hullLengthM * 0.20), sy(hullTop));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(210,226,240,0.75)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(sx(tPivot[2]), sy(Hm * 0.78));
    ctx.lineTo(sx(d.overallLengthM - d.hullLengthM / 2), sy(Hm * 0.78));
    ctx.stroke();
    // running gear: wheels
    ctx.fillStyle = 'rgba(52,62,72,0.9)';
    for (let i = 0; i < 5; i++) {
      const z = -d.hullLengthM * 0.38 + i * d.hullLengthM * 0.19;
      ctx.beginPath();
      ctx.arc(sx(z), sy(Hm * 0.11), destH * 0.10, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function draw() {
    ctx.clearRect(0, 0, CW, CH);
    if (!spec) return;
    const armor = spec.armor || {};
    const tPivot = armor.turretPivot || [0, 1.2, 0];

    // --- base: the vehicle's REAL side-profile silhouette (own model) -----
    const sil = sideSilhouette(spec.id, () => { anchors = null; draw(); });
    if (sil) {
      const [bx, by, bw, bh] = sil.bbox;
      // fit the content box inside the canvas with a small margin
      destW = CW - 10;
      destH = destW * (bh / bw);
      if (destH > CH - 8) { destH = CH - 8; destW = destH * (bw / bh); }
      destX = (CW - destW) / 2;
      destY = (CH - destH) / 2;
      // crisp bright contour: eight offset passes of the near-white tint at
      // ~full alpha build a sharp 1.5px outline (WoT's white schematic edge)
      ctx.globalAlpha = 0.92;
      for (const [ox, oy] of [
        [-1.5, 0], [1.5, 0], [0, -1.5], [0, 1.5],
        [-1, -1], [1, -1], [-1, 1], [1, 1],
      ]) {
        ctx.drawImage(sil.rim, bx, by, bw, bh, destX + ox, destY + oy, destW, destH);
      }
      // dark steel body over the rim passes — high edge contrast
      ctx.globalAlpha = 0.97;
      ctx.drawImage(sil.body, bx, by, bw, bh, destX, destY, destW, destH);
      ctx.globalAlpha = 1;
    } else {
      destW = CW - 10; destH = CH - 20;
      destX = 5; destY = 10;
      drawVectorFallback();
    }

    // --- damaged running gear: the track band floods yellow/red ------------
    const stL = moduleState('trackL'), stR = moduleState('trackR');
    const trackSt = stL === 'red' || stR === 'red' ? 'red'
      : stL === 'yellow' || stR === 'yellow' ? 'yellow' : 'ok';
    if (trackSt !== 'ok') {
      ctx.fillStyle = STATE_COLOR[trackSt] + '52';
      ctx.strokeStyle = STATE_COLOR[trackSt];
      ctx.lineWidth = 1.2;
      roundRect(ctx, destX + 1, destY + destH * 0.72, destW - 2, destH * 0.28, 3);
      ctx.fill();
      ctx.stroke();
    }
    // damaged gun: the barrel run re-draws in its state color
    const gunSt = moduleState('gun');
    if (gunSt !== 'ok') {
      const d = spec.dims;
      const gy = sy(Math.min((d.heightM || 2.6) * 0.76, tPivot[1] + 0.55));
      ctx.strokeStyle = STATE_COLOR[gunSt];
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sx(tPivot[2]), gy);
      ctx.lineTo(sx(d.overallLengthM - d.hullLengthM / 2) - 1, gy);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }

    // module hit-zones from the real armor model — invisible until damaged
    drawModuleRegions(tPivot);

    // module icons at relaxed anchors — DAMAGED ONLY (WoT: a healthy vehicle
    // shows nothing but its clean profile; orange/red lit plates on damage)
    if (!anchors) computeAnchors();
    for (const [name, pt] of anchors) {
      const icon = MODULE_ICON[name];
      if (!icon) continue;
      const st = name === 'track' ? trackSt : moduleState(name);
      if (st === 'ok') continue;
      const col = STATE_COLOR[st];
      ctx.save();
      ctx.translate(pt[0], pt[1]);
      roundRect(ctx, -8.5, -8.5, 17, 17, 3);
      ctx.fillStyle = 'rgba(30,14,10,0.92)';
      ctx.fill();
      ctx.strokeStyle = col;
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
      e.innerHTML = CREW_SVG[name] || CREW_SVG.loader;
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
    // crew chips: only knocked-out members surface (red icon chip); the whole
    // strip collapses while everyone is fine
    let anyDead = false;
    for (const [name, e] of crewEls) {
      const alive = !combat.crew || combat.crew[name] !== false;
      e.classList.toggle('dead', !alive);
      if (!alive) anyDead = true;
    }
    crewRow.classList.toggle('someharm', anyDead);
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
      anchors = null;
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
