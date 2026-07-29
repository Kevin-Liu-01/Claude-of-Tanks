// src/ui/damagePanel.js — bottom-left player damage panel, WoT panel
// language. TOP-DOWN hull schematic — the vehicle's own top_silhouette.png
// (nose up) drawn as a solid light-steel plan view with its two TRACK RAILS
// ticked in. r4: the HEALTHY panel is clean (WoT behavior) — module chips
// (gun/engine/ammo/fuel/optics/radio) and crew chips exist only in their
// damaged states: crisp orange/red icon chips, per-side rail floods for
// de-tracks, hit-zone floods from the real armor model, red crew chips on
// knock-outs. (The r6-r8 persistent ~25%-alpha pips measured ~1.2:1
// contrast and read as illegible smudges.) No letterforms inside the
// silhouette, ever (hud_ui r2). HP bar and fire indicator.
// Contract: docs/ARCHITECTURE.md §3.7.2.

import { FONT_STACK, FONT_COND, ensureFonts } from './fonts.js';
import { iconUrl } from './icons.js';

// WoT module-state ramp: ORANGE damaged, RED knocked out. Healthy modules
// show as dim ~25%-alpha pips — present but quiet.
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
/* crew strip (r4): HIDDEN while healthy — WoT shows crew only when someone
   is knocked out; the r8 persistent ~25%-alpha role chips read as muddy
   smudges under the schematic. A casualty pops in as a full red chip. */
.cot-dp .crew{display:flex;justify-content:center;gap:4px;}
.cot-dp .cm{display:none;width:24px;height:21px;border-radius:2px;
  align-items:center;justify-content:center;color:#cfd9e2;
  border:1px solid rgba(146,164,180,.5);background:rgba(9,13,17,.55);}
.cot-dp .cm.dead{display:flex;margin-top:5px;color:#f05a5a;
  border-color:rgba(240,90,90,.7);background:rgba(46,14,14,.75);
  animation:cotDmgPop .22s ease-out;}
.cot-dp .cm svg{display:block;width:14px;height:14px;}
@keyframes cotDmgPop{from{transform:scale(.55);opacity:0}to{transform:scale(1);opacity:1}}
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
// Vehicle-specific TOP-DOWN silhouette: the generated
// <id>_top_silhouette.png (flat white alpha plan of the ACTUAL model, nose
// up, gun overhang included) is loaded once per spec, its opaque bounding
// box measured, and two tinted copies cached — a dark rim pass (drawn with
// 1px offsets as a contour) and a light-steel body pass. NOTE: no
// thin-feature opening here — the nose-up gun barrel is itself a thin
// vertical and would be eaten by the side-view antenna filter.
// ---------------------------------------------------------------------------
const silCache = new Map(); // specId -> { img, bbox:[x,y,w,h], body, rim } | 'pending'
function tintCanvas(img, color) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}
function topSilhouette(specId, onReady) {
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
    const sx2 = (img.naturalWidth || img.width) / P;
    const sy2 = (img.naturalHeight || img.height) / P;
    const entry = {
      img,
      bbox: [x0 * sx2, y0 * sy2, (x1 - x0 + 1) * sx2, (y1 - y0 + 1) * sy2],
      // solid light-steel plan view (WoT's filled tinted schematic) over a
      // thin dark contour
      rim: tintCanvas(img, 'rgba(9,14,19,0.9)'),
      body: tintCanvas(img, '#9aa5ad'),
    };
    silCache.set(specId, entry);
    if (onReady) onReady();
  };
  img.onerror = () => { silCache.set(specId, 'failed'); };
  img.src = iconUrl(specId, 'top_silhouette');
  return null;
}

// ---------------------------------------------------------------------------
// Vector module icons — each drawn centered at (0,0) in a ~12px box, using
// the module state color.
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

// r4: no persistent healthy-module pips — every module icon appears only
// once damaged (WoT panel behavior; see drawPip).

/**
 * Create the player damage panel (top-down schematic + modules + crew + HP + fire).
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

  // single compact TOP-DOWN plan view (WoT panel scale). CH is the CURRENT
  // canvas height — it tightens to the artwork once the silhouette's aspect
  // is known.
  const CW = 132, CH_MAX = 96;
  let CH = CH_MAX;
  const dprC = 2; // fixed 2x internal resolution — crisp at devicePixelRatio 1
  const canvas = document.createElement('canvas');
  canvas.width = CW * dprC; canvas.height = CH * dprC;
  canvas.style.width = `${CW}px`; canvas.style.height = `${CH}px`;
  root.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dprC, 0, 0, dprC, 0, 0);
  function fitCanvasHeight(hgt) {
    const want = Math.round(Math.max(48, Math.min(CH_MAX, hgt)));
    if (want === CH) return;
    CH = want;
    canvas.height = CH * dprC; // resize clears — callers redraw right after
    canvas.style.height = `${CH}px`;
    ctx.setTransform(dprC, 0, 0, dprC, 0, 0);
    anchors = null;
  }

  const crewRow = document.createElement('div');
  crewRow.className = 'crew';
  root.appendChild(crewRow);
  const crewEls = new Map();

  let spec = null;
  let combat = null;
  let lastHpText = '';
  let lastFireOn = null;
  let anchors = null; // module name -> [x, y] canvas anchor (non-overlapping)
  // plan-view destination box of the silhouette on the canvas (set per draw)
  let destX = 46, destY = 4, destW = 40, destH = CH - 8;
  // live turret bearing (rad, hull-relative) — the schematic's turret +
  // barrel rotate with it (WoT's signature damage-panel behavior). Fed every
  // frame by hud.update via setTurretYaw.
  let turretYawDisp = 0;

  // --- top mapping: world +X (lateral) -> canvas right, +Z (forward) -> up.
  // Horizontal span destX..destX+destW covers x in [-W/2, W/2]; vertical
  // span covers z in [-hullL/2, overall - hullL/2] (rear at bottom, muzzle
  // at top — matching the nose-up artwork).
  function vehWidthM() {
    const d = spec.dims;
    return d.widthM || Math.max(2.2, d.hullLengthM * 0.45);
  }
  function sxT(x) {
    return destX + destW * (0.5 + x / vehWidthM());
  }
  function syT(z) {
    const d = spec.dims;
    const overall = Math.max(d.overallLengthM, d.hullLengthM);
    return destY + destH * (1 - (z + d.hullLengthM / 2) / overall);
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

  // --- track rails: the plan view's running-gear bands ----------------------
  // canvas y-range of the hull (track run) — excludes the gun overhang
  function hullBandY() {
    const d = spec.dims;
    return [syT(d.hullLengthM / 2), syT(-d.hullLengthM / 2)];
  }
  // which rail carries trackL/trackR — from the armor box's lateral center
  function railSideFor(name) {
    const mods = (spec.armor && spec.armor.modules) || [];
    for (const m of mods) {
      if (m.module === name && m.min && m.max) {
        return (m.min[0] + m.max[0]) / 2 < 0 ? -1 : 1;
      }
    }
    return name === 'trackL' ? -1 : 1;
  }
  function railRect(side) {
    const [y0, y1] = hullBandY();
    const rw = Math.max(7, destW * 0.22);
    const x0 = side < 0 ? destX - 0.5 : destX + destW + 0.5 - rw;
    return [x0, y0, rw, y1 - y0];
  }
  // persistent WoT read: hull plan flanked by its two ticked track rails —
  // clipped to the silhouette so the treads follow the artwork's edge
  function drawTrackRails() {
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    for (const side of [-1, 1]) {
      const [x0, y0, rw, rh] = railRect(side);
      ctx.fillStyle = 'rgba(18,26,34,0.32)';
      ctx.fillRect(x0, y0, rw, rh);
      ctx.strokeStyle = 'rgba(10,16,22,0.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, rw - 1, rh - 1);
      ctx.strokeStyle = 'rgba(10,16,22,0.3)';
      ctx.beginPath();
      for (let y = y0 + 3; y < y0 + rh - 2; y += 4.5) {
        ctx.moveTo(x0 + 1.5, y); ctx.lineTo(x0 + rw - 1.5, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // Compute module icon anchors from the armor model projected into the plan
  // view (module box center: x -> screen x, z -> screen y), then relax
  // overlaps so every pip stays legible.
  function computeAnchors() {
    anchors = new Map();
    if (!spec) return;
    const armor = spec.armor || {};
    const tPivot = armor.turretPivot || [0, 1.2, 0];
    const mods = armor.modules || [];
    const pts = [];
    for (const m of mods) {
      if (m.module === 'trackL' || m.module === 'trackR') continue; // rails
      if (!m.min || !m.max) continue;
      let mx = (m.min[0] + m.max[0]) / 2;
      let mz = (m.min[2] + m.max[2]) / 2;
      if (m.turretLocal) { mx += tPivot[0] || 0; mz += tPivot[2] || 0; }
      pts.push({ name: m.module, x: sxT(mx), y: syT(mz) });
    }
    // relaxation: push apart pairs closer than MIN_D, clamp to canvas
    const MIN_D = 17;
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
        p.y = Math.max(9, Math.min(CH - 9, p.y));
      }
    }
    for (const p of pts) anchors.set(p.name, [p.x, p.y]);
  }

  // One module pip — DAMAGED STATES ONLY (r4, WoT panel behavior): healthy
  // modules render nothing at all. The r6-r8 persistent ~25%-alpha slots
  // measured ~1.2:1 contrast on the grey schematic and read as illegible
  // smudges (critique) — WoT keeps the healthy panel clean and pops crisp
  // orange/red state chips only when something breaks.
  function drawPip(name, pt, st) {
    const icon = MODULE_ICON[name];
    if (!icon || st === 'ok') return;
    ctx.save();
    ctx.translate(pt[0], pt[1]);
    const col = STATE_COLOR[st];
    roundRect(ctx, -8.5, -8.5, 17, 17, 3);
    ctx.fillStyle = 'rgba(30,14,10,0.92)';
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    icon(ctx, col);
    ctx.restore();
  }

  // Tint a module's armor-model box footprint (engine bay, ammo rack, fuel
  // tank) projected into the plan view, so damage states light up real
  // hit-zones on the schematic. Zones are invisible while healthy — the
  // persistent pips carry the healthy geography.
  const REGION_MODULES = ['engine', 'ammoRack', 'fuelTank'];
  function drawModuleRegions(tPivot) {
    const mods = (spec.armor && spec.armor.modules) || [];
    for (const m of mods) {
      if (REGION_MODULES.indexOf(m.module) < 0 || !m.min || !m.max) continue;
      const st = moduleState(m.module);
      if (st === 'ok') continue;
      let x0 = m.min[0], x1 = m.max[0], z0 = m.min[2], z1 = m.max[2];
      if (m.turretLocal) {
        x0 += tPivot[0] || 0; x1 += tPivot[0] || 0;
        z0 += tPivot[2] || 0; z1 += tPivot[2] || 0;
      }
      const rx = sxT(x0), ry = syT(z1);
      ctx.fillStyle = STATE_COLOR[st] + '5c';
      ctx.strokeStyle = STATE_COLOR[st];
      ctx.lineWidth = 1;
      ctx.fillRect(rx, ry, sxT(x1) - rx, syT(z0) - ry);
      ctx.strokeRect(rx, ry, sxT(x1) - rx, syT(z0) - ry);
    }
  }

  // Vector stand-in for the first few frames while the silhouette PNG
  // decodes: minimal clean plan view (hull + rails) in the same schematic
  // language — drawTurretAndGun adds the rotating turret + barrel on top.
  function drawVectorFallback() {
    const [yT, yB] = hullBandY();
    const rw = Math.max(7, destW * 0.22);
    ctx.fillStyle = 'rgba(154,165,173,0.82)';
    ctx.strokeStyle = 'rgba(9,14,19,0.6)';
    ctx.lineWidth = 1.2;
    roundRect(ctx, destX + rw * 0.5, yT, destW - rw, yB - yT, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(126,136,144,0.92)';
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? destX : destX + destW - rw;
      roundRect(ctx, x0, yT + 1, rw, yB - yT - 2, 2.5);
      ctx.fill();
    }
  }

  // --- rotating turret + gun barrel (WoT's signature panel element) --------
  // The turret is a distinct plan-view shape (elongated dome + rear bustle)
  // in a LIGHTER steel than the hull so it reads as a separate part; the
  // barrel runs from the ring to the artwork's muzzle line. Both rotate
  // about the armor model's turret pivot with the live turret bearing, and
  // both flood their module state color when damaged (gun / turretRing).
  function drawTurretAndGun(tPivot) {
    const px = sxT(tPivot[0] || 0);
    const py = syT(tPivot[2] || 0);
    // barrel length: pivot to the plan's muzzle line (artwork top), with a
    // floor so rear-turret designs still show a credible overhang
    const barrelL = Math.max(py - destY + 1, destH * 0.30);
    const gunSt = moduleState('gun');
    const ringSt = moduleState('turretRing');
    const barrelCol = gunSt === 'ok' ? '#c6cfd7' : STATE_COLOR[gunSt];
    const turretFill = ringSt === 'ok' ? '#b3bdc5' : STATE_COLOR[ringSt] + 'd8';
    const rx = destW * 0.31; // turret half-width (across the gun axis)
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(turretYawDisp); // nose-up plan: +yaw swings the gun right
    // barrel: dark contour under a light steel run + muzzle tip
    ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(9,14,19,0.85)';
    ctx.lineWidth = 4.6;
    ctx.beginPath();
    ctx.moveTo(0.5, -rx * 0.4);
    ctx.lineTo(0.5, -barrelL);
    ctx.stroke();
    ctx.strokeStyle = barrelCol;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(0.5, -rx * 0.4);
    ctx.lineTo(0.5, -barrelL + 1);
    ctx.stroke();
    // muzzle reference tick
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0.5, -barrelL + 1);
    ctx.lineTo(0.5, -barrelL + 3.4);
    ctx.stroke();
    // turret: squat plan-form (tapered face, wide cheeks, flat-ish bustle) —
    // deliberately WIDER than tall so it reads "turret", not "egg"
    ctx.beginPath();
    ctx.moveTo(-rx * 0.58, -rx * 0.74);
    ctx.quadraticCurveTo(0, -rx * 1.0, rx * 0.58, -rx * 0.74); // tapered face
    ctx.quadraticCurveTo(rx * 1.06, -rx * 0.22, rx * 0.88, rx * 0.42);
    ctx.quadraticCurveTo(rx * 0.5, rx * 0.88, 0, rx * 0.88); // rear bustle
    ctx.quadraticCurveTo(-rx * 0.5, rx * 0.88, -rx * 0.88, rx * 0.42);
    ctx.quadraticCurveTo(-rx * 1.06, -rx * 0.22, -rx * 0.58, -rx * 0.74);
    ctx.closePath();
    ctx.fillStyle = turretFill;
    ctx.strokeStyle = 'rgba(9,14,19,0.8)';
    ctx.lineWidth = 1.2;
    ctx.fill();
    ctx.stroke();
    // mantlet block where the barrel meets the turret face
    ctx.fillStyle = barrelCol;
    ctx.fillRect(-2.6, -rx * 0.98, 5.2, 4);
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, CW, CH);
    if (!spec) return;
    const armor = spec.armor || {};
    const tPivot = armor.turretPivot || [0, 1.2, 0];

    // --- base: the vehicle's REAL top-down silhouette (own model) ----------
    const sil = topSilhouette(spec.id, () => { anchors = null; draw(); });
    if (sil) {
      const [bx, by, bw, bh] = sil.bbox;
      // top-down artwork is TALL: height-fit first, clamp the width so the
      // pips relaxed off the hull sides keep breathing room
      destH = CH_MAX - 6;
      destW = destH * (bw / bh);
      if (destW > CW - 48) { destW = CW - 48; destH = destW * (bh / bw); }
      fitCanvasHeight(destH + 6);
      ctx.clearRect(0, 0, CW, CH);
      destX = (CW - destW) / 2;
      destY = (CH - destH) / 2;
      // the artwork's HULL region only — its baked nose-up gun overhang is
      // clipped off (the vector barrel below rotates with the live turret
      // bearing; keeping the baked one would show two guns off-center)
      const yHullTop = syT(spec.dims.hullLengthM / 2);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, yHullTop - 0.5, CW, CH - yHullTop + 0.5);
      ctx.clip();
      // thin dark contour (four 1px offset passes) grounds the light fill
      ctx.globalAlpha = 0.6;
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        ctx.drawImage(sil.rim, bx, by, bw, bh, destX + ox, destY + oy, destW, destH);
      }
      // solid light-steel plan at ~80% alpha — WoT's filled tinted schematic
      ctx.globalAlpha = 0.82;
      ctx.drawImage(sil.body, bx, by, bw, bh, destX, destY, destW, destH);
      ctx.globalAlpha = 1;
      drawTrackRails();
      ctx.restore();
    } else {
      destW = 44; destH = CH - 8;
      destX = (CW - destW) / 2; destY = 4;
      drawVectorFallback();
    }

    // --- de-tracked running gear: the SIDE's rail floods yellow/red --------
    for (const name of ['trackL', 'trackR']) {
      const st = moduleState(name);
      if (st === 'ok') continue;
      const [x0, y0, rw, rh] = railRect(railSideFor(name));
      ctx.fillStyle = STATE_COLOR[st] + '52';
      ctx.strokeStyle = STATE_COLOR[st];
      ctx.lineWidth = 1.2;
      roundRect(ctx, x0, y0, rw, rh, 3);
      ctx.fill();
      ctx.stroke();
    }
    // rotating turret + gun barrel over the hull plan (state-colored when
    // the gun / turret ring is damaged)
    drawTurretAndGun(tPivot);

    // module hit-zones from the real armor model — invisible until damaged
    drawModuleRegions(tPivot);

    // module state chips at relaxed anchors — damaged modules only (r4,
    // WoT behavior; drawPip no-ops on 'ok')
    if (!anchors) computeAnchors();
    for (const [name, pt] of anchors) {
      if (!MODULE_ICON[name]) continue;
      drawPip(name, pt, moduleState(name));
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
    // crew chips: persistent dim while alive, red pop when knocked out
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
     * Set the tank whose schematic/modules the panel shows.
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
     * Feed the live hull-relative turret bearing (rad) — the schematic's
     * turret + barrel rotate with it. Stored only; the per-frame update()
     * draw picks it up (hud.update calls this right before main's
     * damagePanel.update in the same frame).
     * @param {number} yaw
     */
    setTurretYaw(yaw) {
      if (yaw != null && isFinite(yaw)) turretYawDisp = yaw;
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
