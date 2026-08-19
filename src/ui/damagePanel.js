// src/ui/damagePanel.js — bottom-left player damage panel, WoT panel
// language. r9 REBUILD (owner: "reflect the actual top down view of the tank,
// and make the hull move correctly"): the plan view is now the REAL vehicle —
// two orthographic top-down masks of the actual built model (tankThumbs.js
// getTopDownMasks: hull layer, turret+gun layer) — and the panel is
// CAMERA-UP: the hull layer rotates with the true hull heading relative to
// the camera yaw, the turret+gun layer with hull+turret, so the panel gun
// points where the real gun points on screen. Module hit-markers are stamped
// in HULL space (turret modules in TURRET space) so they ride their layer.
// Kept from r4-r8: the HEALTHY panel is clean (WoT behavior) — module chips
// (gun/engine/ammo/fuel/optics/radio) and crew chips exist only in their
// damaged states, hit-zone floods come from the real armor model, crew chips
// pop red on knock-outs, and the shared module color language + damage-flash
// pulses are unchanged. No letterforms inside the silhouette, ever (hud_ui
// r2). HP bar and fire indicator.
// Contract: docs/ARCHITECTURE.md §3.7.2 (API preserved; setPose added).

import { FONT_STACK, FONT_COND, ensureFonts } from './fonts.js';
import { ensureStyle } from './dom.js';
import { getTopDownMasks } from './tankThumbs.js';
// EQUIPMENT SYSTEM: quiet mounted-loadout readout at the panel foot — the
// same white-silhouette glyphs as the garage slots, at healthy-pip alpha.
import { equipIconSVG } from './equipIcons.js';
import { uiIconSVG } from './uiIcons.js';
import { EQUIPMENT_BY_ID } from '../game/equipment.js';

// WoT module-state ramp (ORANGE damaged, RED knocked out) + crew order come
// from the shared module registry — one presentation truth across the damage
// panel, shot cards, killcam and HUD alerts (module_hitbox r1).
import { STATE_COLOR, CREW_ORDER } from './moduleRegistry.js';

// distinct micro-icon per crew role (WoT reads roles at a glance):
// commander = binoculars, gunner = crosshair, driver = steering wheel,
// loader = shell
const CREW_SVG = {
  commander: uiIconSVG('crewCommander', 14),
  gunner: uiIconSVG('crewGunner', 14),
  driver: uiIconSVG('crewDriver', 14),
  loader: uiIconSVG('crewLoader', 14),
};

const DP_CSS = `
.cot-dp{position:absolute;left:12px;bottom:12px;width:136px;pointer-events:none;
  font-family:${FONT_STACK};color:#e6edf3;background:linear-gradient(180deg,rgba(10,14,18,.72),rgba(6,9,12,.8));
  border:1px solid rgba(146,164,180,.25);box-shadow:0 6px 22px rgba(0,0,0,.5);
  padding:7px 8px 8px;-webkit-user-select:none;user-select:none;}
.cot-dp *{box-sizing:border-box;margin:0;padding:0;}
.cot-dp .hprow{display:flex;justify-content:space-between;align-items:baseline;
  gap:6px;margin-bottom:3px;}
.cot-dp .hplabel{font-size:9px;font-weight:700;letter-spacing:.12em;color:#8a97a3;
  font-family:${FONT_COND};white-space:nowrap;}
.cot-dp .hpnum{font-size:11px;font-weight:700;color:#d6e2ec;font-variant-numeric:tabular-nums;
  font-family:${FONT_COND};letter-spacing:-.01em;white-space:nowrap;}
.cot-dp .hptrack{height:5px;background:rgba(4,6,8,.75);border:1px solid rgba(0,0,0,.6);margin-bottom:5px;}
.cot-dp .hpfill{height:100%;width:100%;transition:width .15s linear;}
.cot-dp canvas{display:block;margin:0 auto;}
/* crew strip (r6-2, round critique "no ghosted crew affordances"): the four
   role chips are PERSISTENT ghosts — dim icons in dark sockets under the
   schematic (good contrast on the panel plate, unlike the r8 bare 25%-alpha
   icons on the light hull) — and a casualty floods its chip red. */
.cot-dp .crew{display:flex;justify-content:center;gap:4px;margin-top:5px;}
.cot-dp .cm{display:flex;width:23px;height:20px;border-radius:2px;
  align-items:center;justify-content:center;color:rgba(199,211,222,.52);
  border:1px solid rgba(146,164,180,.3);background:rgba(9,13,17,.5);}
.cot-dp .cm.dead{color:#f05a5a;
  border-color:rgba(240,90,90,.7);background:rgba(46,14,14,.75);
  animation:cotDmgPop .22s ease-out;}
.cot-dp .cm svg{display:block;width:14px;height:14px;}
@keyframes cotDmgPop{from{transform:scale(.55);opacity:0}to{transform:scale(1);opacity:1}}
/* EQUIPMENT SYSTEM: mounted-loadout readout — three quiet glyphs at healthy-
   pip alpha under the crew row; hides itself when the tank runs empty. */
.cot-dp .equiprow{display:flex;justify-content:center;gap:8px;margin-top:6px;
  padding-top:5px;border-top:1px solid rgba(146,164,180,.16);}
.cot-dp .equiprow:empty{display:none;}
.cot-dp .equiprow .eq{display:flex;opacity:.5;}
.cot-dp .equiprow .eq svg{display:block;}
.cot-dp .fire{position:absolute;top:34px;right:10px;font-size:9px;font-weight:800;
  letter-spacing:.14em;color:#ff6a3c;text-shadow:0 0 8px rgba(255,80,30,.8);display:none;
  animation:cotFirePulse .7s ease-in-out infinite alternate;}
@keyframes cotFirePulse{from{opacity:.55}to{opacity:1}}
`;

function hpColor(frac) {
  return frac > 0.5 ? '#7ee87e' : frac > 0.25 ? '#f0b04a' : '#f05a5a';
}

/** White mask canvas -> solid-tint copy (r9: layers are tinted per state). */
function tintCanvas(src, color) {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const x = c.getContext('2d');
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

// layer color language (r6-2 three-tone read, kept): mid-steel hull under a
// clearly LIGHTER turret; near-black contour ink.
const HULL_BODY = '#a2adb6';
const TURRET_BODY = '#ccd6de';
const RIM_INK = 'rgba(6,10,14,0.98)';

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
  transmission(c, col) {
    c.fillStyle = col;
    c.fillRect(-5.5, -3.4, 11, 6.8);
    c.fillStyle = 'rgba(8,12,16,0.82)';
    for (const x of [-3, 3]) {
      c.beginPath(); c.arc(x, 0, 2, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = col;
    c.fillRect(-7, -1, 1.8, 2); c.fillRect(5.2, -1, 1.8, 2);
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
  autoloader(c, col) {
    c.strokeStyle = col; c.lineWidth = 1.7;
    c.beginPath(); c.arc(0, 0.8, 5, 0, Math.PI * 2); c.stroke();
    c.fillStyle = col;
    c.beginPath(); c.moveTo(0, -6); c.lineTo(2, -2); c.lineTo(-2, -2); c.closePath(); c.fill();
    c.fillRect(-1.4, -2, 2.8, 7);
  },
  feedSystem(c, col) {
    c.strokeStyle = col; c.lineWidth = 1.5;
    c.strokeRect(-6, -3.5, 12, 7);
    c.fillStyle = col;
    for (const x of [-3.5, 0, 3.5]) { c.beginPath(); c.arc(x, 0, 1.4, 0, Math.PI * 2); c.fill(); }
  },
  missileRack(c, col) {
    c.fillStyle = col;
    for (const x of [-3, 3]) {
      c.fillRect(x - 1.2, -3, 2.4, 8);
      c.beginPath(); c.moveTo(x - 1.2, -3); c.lineTo(x, -6); c.lineTo(x + 1.2, -3); c.closePath(); c.fill();
    }
  },
};
MODULE_ICON.gunMount = MODULE_ICON.turretRing;

// r4: no persistent healthy-module pips — every module icon appears only
// once damaged (WoT panel behavior; see drawPip).

/**
 * Create the player damage panel (top-down plan layers + modules + crew + HP + fire).
 * The root is not attached to the document — hud.setDamagePanel mounts it.
 * @returns {{root:HTMLElement,setTank:Function,update:Function,setPose:Function,setTurretYaw:Function,setEquipment:Function,setState:Function}} Panel
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

  // r9: FIXED SQUARE stage — the whole plan rotates (camera-up panel), so the
  // canvas is sized for the vehicle's rotation circle instead of the old
  // tight nose-up box. 130px also keeps '1750 / 1750'-class HP lines on one
  // row of the header above.
  const CW = 130, CH = 124;
  const dprC = 2; // fixed 2x internal resolution — crisp at devicePixelRatio 1
  const canvas = document.createElement('canvas');
  canvas.width = CW * dprC; canvas.height = CH * dprC;
  canvas.style.width = `${CW}px`; canvas.style.height = `${CH}px`;
  root.appendChild(canvas);
  root.style.width = `${CW + 18}px`; // padding 8+8 + 1px borders
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dprC, 0, 0, dprC, 0, 0);
  const cx = CW / 2, cy = CH / 2;

  const crewRow = document.createElement('div');
  crewRow.className = 'crew';
  root.appendChild(crewRow);
  const crewEls = new Map();

  // EQUIPMENT SYSTEM: loadout readout row (populated via setEquipment)
  const equipRow = document.createElement('div');
  equipRow.className = 'equiprow';
  root.appendChild(equipRow);

  let spec = null;
  let combat = null;
  let lastHpText = '';
  let lastFireOn = null;

  // --- r9 pose: the panel is CAMERA-UP ---------------------------------------
  // hud.update feeds hull yaw, hull-relative turret yaw and camera yaw every
  // frame (setPose). Layer rotations use the project yaw convention
  // forwardAxis(yaw)=[sin,0,cos] with screen-right = -world-x: a nose-up
  // sprite must be canvas-rotated by (camYaw - worldYaw).
  let hullYawW = 0;    // hull world yaw
  let turretYawH = 0;  // turret yaw, hull-relative
  let camYawW = 0;     // camera world yaw
  const hullPhi = () => camYawW - hullYawW;
  const gunPhi = () => camYawW - hullYawW - turretYawH;

  // --- r9 mask layers ---------------------------------------------------------
  let masks = null;       // tankThumbs.getTopDownMasks entry
  let maskSourceVisual = null;
  let tints = null;       // per-entry tinted copies {hullBody,hullRim,turretRim,turretBody:{state:canvas}}
  let scaleS = 8;         // panel px per meter (fit at mask arrival)
  let anchors = null;     // [{name, x, z, turretLocal}] hull/turret meters, relaxed

  function adoptMasks(entry) {
    masks = entry;
    tints = {
      hullBody: tintCanvas(entry.hull.canvas, HULL_BODY),
      hullRim: tintCanvas(entry.hull.canvas, RIM_INK),
      turretRim: tintCanvas(entry.turret.canvas, RIM_INK),
      turretBody: { ok: tintCanvas(entry.turret.canvas, TURRET_BODY) },
    };
    // fit: hull swept circle AND pivot-offset + turret swept circle
    const po = pivotOffM();
    const reach = Math.max(
      entry.hull.radiusM,
      Math.hypot(po[0], po[1]) + entry.turret.radiusM);
    scaleS = (Math.min(CW, CH) / 2 - 4) / Math.max(1.5, reach);
    anchors = null;
  }
  function turretBodyTint(st) {
    if (!tints) return null;
    if (!tints.turretBody[st]) {
      tints.turretBody[st] = tintCanvas(masks.turret.canvas, STATE_COLOR[st]);
    }
    return tints.turretBody[st];
  }
  function requestMasks() {
    if (!spec) return;
    const entry = getTopDownMasks(spec, () => {
      // The first-party mask is ready — re-adopt if this is still the tank.
      const e2 = getTopDownMasks(spec, null);
      if (e2 && spec) { adoptMasks(e2); lastDrawSig = null; draw(); }
    }, maskSourceVisual);
    if (entry) adoptMasks(entry);
  }

  // hull-space pivot offset from the HULL LAYER's content center (meters)
  function pivotOffM() {
    if (!masks) return [0, 0];
    return [masks.pivot[0] - masks.hull.cx, masks.pivot[1] - masks.hull.cz];
  }

  // meters -> panel px. Hull space: offset from hull content center rotated
  // by hullPhi about the panel center. Turret space: offset from the pivot
  // rotated by gunPhi about the pivot's panel point.
  function panelPtHull(mx, mz, out = [0, 0]) {
    const hc = masks ? masks.hull : { cx: 0, cz: 0 };
    const lx = -(mx - hc.cx) * scaleS;
    const ly = -(mz - hc.cz) * scaleS;
    const p = hullPhi();
    const c = Math.cos(p), s = Math.sin(p);
    out[0] = cx + lx * c - ly * s;
    out[1] = cy + lx * s + ly * c;
    return out;
  }
  function panelPtTurret(mx, mz, out = [0, 0]) {
    const piv = masks ? masks.pivot : [0, 0];
    const pp = panelPtHull(piv[0], piv[1]);
    const lx = -mx * scaleS;
    const ly = -mz * scaleS;
    const p = gunPhi();
    const c = Math.cos(p), s = Math.sin(p);
    out[0] = pp[0] + lx * c - ly * s;
    out[1] = pp[1] + lx * s + ly * c;
    return out;
  }

  // Canvas dirty signature (module_hitbox r1, extended r9): the plan depends
  // on the non-ok module states and the (quantized ~0.5°) LAYER rotations —
  // repaint only when one of them actually changes. null forces a draw.
  let lastDrawSig = null;
  function drawSignature() {
    let s = `${Math.round(hullPhi() / 0.008)}|${Math.round(gunPhi() / 0.008)}|${masks ? 'm' : 'v'}|`;
    if (combat && combat.modules) {
      for (const k in combat.modules) {
        const st = combat.modules[k].state;
        if (st && st !== 'ok') s += `${k}:${st};`;
      }
    }
    return s;
  }

  function moduleState(name) {
    if (!combat || !combat.modules || !combat.modules[name]) return 'ok';
    return combat.modules[name].state || 'ok';
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

  // Module anchor points in VEHICLE space (meters, relaxed apart so chips
  // stay legible when two modules share a bay). turretLocal boxes keep their
  // turret-relative coordinates and ride the turret layer.
  function computeAnchors() {
    anchors = [];
    if (!spec) return;
    const mods = (spec.armor && spec.armor.modules) || [];
    const pts = [];
    for (const m of mods) {
      if (m.module === 'trackL' || m.module === 'trackR') continue; // floods
      if (!m.min || !m.max || !MODULE_ICON[m.module]) continue;
      pts.push({
        name: m.module,
        x: (m.min[0] + m.max[0]) / 2,
        z: (m.min[2] + m.max[2]) / 2,
        turretLocal: !!m.turretLocal,
      });
    }
    // relax overlaps in meters (chip ~15 px -> MIN_D px/scale meters); only
    // pairs within the SAME space relax against each other — cross-space
    // pairs move relative to each other with the turret anyway.
    const MIN_D = 15 / Math.max(2, scaleS);
    for (let it = 0; it < 6; it++) {
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i], b = pts[j];
          if (a.turretLocal !== b.turretLocal) continue;
          let dx = b.x - a.x, dz = b.z - a.z;
          let d = Math.hypot(dx, dz);
          if (d >= MIN_D) continue;
          if (d < 0.01) { dx = 1; dz = 0; d = 1; }
          const push = (MIN_D - d) / 2 / d;
          a.x -= dx * push; a.z -= dz * push;
          b.x += dx * push; b.z += dz * push;
        }
      }
    }
    anchors = pts;
  }

  // One damaged-module chip (r4: healthy modules draw NOTHING — the clean
  // WoT panel; the socket look returns only in the damaged state).
  function drawPip(name, px, py, st) {
    const icon = MODULE_ICON[name];
    if (!icon || st === 'ok') return;
    const col = STATE_COLOR[st];
    ctx.save();
    ctx.translate(px, py);
    roundRect(ctx, -8, -8, 16, 16, 3);
    ctx.fillStyle = 'rgba(24,12,8,0.9)';
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.scale(0.92, 0.92);
    icon(ctx, col);
    ctx.restore();
  }

  // Rotated hull-space rect flood (de-tracks + engine/ammo/fuel hit-zones):
  // drawn INSIDE the hull layer's rotation frame so it rides the hull.
  function floodHullRect(x0, z0, x1, z1, st, r = 2.5) {
    const hc = masks ? masks.hull : { cx: 0, cz: 0 };
    const ax = -(Math.max(x0, x1) - hc.cx) * scaleS; // x flips: use max first
    const bx = -(Math.min(x0, x1) - hc.cx) * scaleS;
    const az = -(Math.max(z0, z1) - hc.cz) * scaleS;
    const bz = -(Math.min(z0, z1) - hc.cz) * scaleS;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(hullPhi());
    ctx.fillStyle = STATE_COLOR[st] + '55';
    ctx.strokeStyle = STATE_COLOR[st];
    ctx.lineWidth = 1.2;
    roundRect(ctx, ax, az, bx - ax, bz - az, r);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // --- layer painters ---------------------------------------------------------
  // Contour ink first (offset passes in SCREEN space for an even rim), then
  // the tinted body. `about` = panel point the layer rotates around; the
  // draw origin inside the rotated frame is the mask-space anchor.
  function drawLayer(body, rim, aboutX, aboutY, phi, originPx, originPy, pxPerM) {
    const k = scaleS / pxPerM;
    const w = body.width * k, h = body.height * k;
    const dx = -originPx * k, dy = -originPy * k;
    const paint = (img, ox, oy, alpha) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(aboutX + ox, aboutY + oy);
      ctx.rotate(phi);
      ctx.drawImage(img, dx, dy, w, h);
      ctx.restore();
    };
    ctx.save();
    // soft spread then crisp ink (r6-2 full-strength contour)
    for (const [ox, oy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) paint(rim, ox, oy, 0.35);
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1],
      [-1, -1], [1, -1], [-1, 1], [1, 1]]) paint(rim, ox, oy, 0.9);
    paint(body, 0, 0, 1);
    ctx.restore();
  }

  function drawHullLayer() {
    const H = masks.hull;
    const pxPerM = H.canvas.width / (H.halfM * 2);
    // hull content center in mask px (camera sat at world 0,0)
    const ox = H.canvas.width / 2 - H.cx * pxPerM;
    const oy = H.canvas.height / 2 - H.cz * pxPerM;
    drawLayer(tints.hullBody, tints.hullRim, cx, cy, hullPhi(), ox, oy, pxPerM);
  }

  function drawTurretLayer() {
    const T = masks.turret;
    const pxPerM = T.canvas.width / (T.halfM * 2);
    const pp = panelPtHull(masks.pivot[0], masks.pivot[1]);
    const ringSt = moduleState('turretRing');
    const body = ringSt === 'ok' ? tints.turretBody.ok : turretBodyTint(ringSt);
    drawLayer(body, tints.turretRim, pp[0], pp[1], gunPhi(),
      T.canvas.width / 2, T.canvas.height / 2, pxPerM);
    // damaged gun: state-colored run along the REAL barrel on the mask
    const gunSt = moduleState('gun');
    if (gunSt !== 'ok') {
      const reach = Math.max(2, masks.turret.radiusM * scaleS - 2);
      ctx.save();
      ctx.translate(pp[0], pp[1]);
      ctx.rotate(gunPhi());
      ctx.strokeStyle = STATE_COLOR[gunSt];
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(0, -Math.min(6, reach * 0.2));
      ctx.lineTo(0, -reach);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Vector stand-in while the masks build (first frames / harness contexts):
  // same schematic language — rounded hull plate + rails + turret dome +
  // barrel — under the SAME camera-up rotation as the real layers.
  function drawVectorFallback() {
    const d = (spec && spec.dims) || {};
    const hullL = d.hullLengthM || 6.5;
    const hullW = d.widthM || 3.2;
    const overall = Math.max(d.overallLengthM || hullL, hullL);
    scaleS = (Math.min(CW, CH) / 2 - 6) / (overall * 0.62);
    const hw = hullW * scaleS / 2, hl = hullL * scaleS / 2;
    const rw = Math.max(5, hw * 0.42);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(hullPhi());
    ctx.fillStyle = 'rgba(154,165,173,0.85)';
    ctx.strokeStyle = 'rgba(9,14,19,0.7)';
    ctx.lineWidth = 1.4;
    roundRect(ctx, -hw + rw * 0.5, -hl, (hw - rw * 0.5) * 2, hl * 2, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(120,130,138,0.95)';
    for (const side of [-1, 1]) {
      roundRect(ctx, side < 0 ? -hw : hw - rw, -hl + 1, rw, hl * 2 - 2, 2.5);
      ctx.fill();
    }
    // turret + barrel about the armor pivot, rotated by the gun bearing
    const tp = (spec && spec.armor && spec.armor.turretPivot) || [0, 0, 0];
    ctx.translate(-tp[0] * scaleS, -tp[2] * scaleS);
    ctx.rotate(-turretYawH);
    const tr = hw * 0.62;
    const barrel = (overall / 2 - tp[2]) * scaleS;
    ctx.strokeStyle = 'rgba(9,14,19,0.85)';
    ctx.lineWidth = 4.4;
    ctx.beginPath(); ctx.moveTo(0, -tr * 0.4); ctx.lineTo(0, -barrel); ctx.stroke();
    ctx.strokeStyle = '#d2dce4';
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(0, -tr * 0.4); ctx.lineTo(0, -barrel + 1); ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, tr, tr * 1.18, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#c8d2da';
    ctx.strokeStyle = 'rgba(9,14,19,0.8)';
    ctx.lineWidth = 1.2;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  const REGION_MODULES = ['engine', 'transmission', 'ammoRack', 'fuelTank'];

  function draw() {
    ctx.clearRect(0, 0, CW, CH);
    if (!spec) return;

    if (masks && tints) drawHullLayer();
    else drawVectorFallback();

    // de-tracked running gear + module hit-zones flood their REAL armor-model
    // boxes, stamped in hull space so they ride the hull layer (r9). Zones
    // are invisible while healthy — the clean panel carries no letterforms.
    if (masks) {
      const mods = (spec.armor && spec.armor.modules) || [];
      for (const m of mods) {
        if (!m.min || !m.max || m.turretLocal) continue;
        const isTrack = m.module === 'trackL' || m.module === 'trackR';
        if (!isTrack && REGION_MODULES.indexOf(m.module) < 0) continue;
        const st = moduleState(m.module);
        if (st === 'ok') continue;
        floodHullRect(m.min[0], m.min[2], m.max[0], m.max[2], st, isTrack ? 3 : 2);
      }
      drawTurretLayer();
    }

    // damaged-module chips at their vehicle-space anchors (hull chips ride
    // the hull layer, turret chips the turret layer)
    if (!anchors) computeAnchors();
    const pt = [0, 0];
    for (const a of anchors) {
      const st = moduleState(a.name);
      if (st === 'ok') continue;
      if (a.turretLocal) panelPtTurret(a.x, a.z, pt);
      else panelPtHull(a.x, a.z, pt);
      pt[0] = Math.max(9, Math.min(CW - 9, pt[0]));
      pt[1] = Math.max(9, Math.min(CH - 9, pt[1]));
      drawPip(a.name, pt[0], pt[1], st);
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
     * Set the tank whose plan/modules the panel shows. Kicks the offscreen
     * top-down mask build for the ACTUAL vehicle (tankThumbs rig); the
     * vector stand-in covers the first frames.
     * @param {TankSpec} s
     * @param {?object} sourceVisual already-built visual to clone for the mask
     */
    setTank(s, sourceVisual = null) {
      spec = s;
      maskSourceVisual = sourceVisual;
      combat = healthyCombat();
      lastHpText = '';
      lastFireOn = null;
      masks = null;
      tints = null;
      anchors = null;
      lastDrawSig = null;
      rebuildCrewRow();
      refreshDom();
      requestMasks();
      draw();
    },

    /**
     * Refresh the panel from the live combat state (call every frame).
     * DOM (HP bar, fire, crew chips) refreshes cheaply every call; the canvas
     * plan repaints only when its dirty signature (module states + quantized
     * layer rotations) actually changes.
     * @param {CombatState} c
     */
    update(c) {
      combat = c;
      refreshDom();
      const sig = drawSignature();
      if (sig !== lastDrawSig) {
        lastDrawSig = sig;
        draw();
      }
    },

    /**
     * Feed the live pose (rad). The panel is CAMERA-UP: the hull layer
     * rotates with the hull heading relative to the camera bearing and the
     * turret+gun layer with hull+turret, so the panel gun points where the
     * real gun points on screen. Stored only; the per-frame update() draw
     * picks it up (hud.update calls this right before main's
     * damagePanel.update in the same frame).
     * @param {number} hullYaw world hull yaw
     * @param {number} turretYaw hull-relative turret yaw
     * @param {number} camYaw world camera yaw
     */
    setPose(hullYaw, turretYaw, camYaw) {
      if (hullYaw != null && isFinite(hullYaw)) hullYawW = hullYaw;
      if (turretYaw != null && isFinite(turretYaw)) turretYawH = turretYaw;
      if (camYaw != null && isFinite(camYaw)) camYawW = camYaw;
    },

    /**
     * Back-compat shim (pre-r9 callers): live hull-relative turret bearing
     * only — hull/camera stay wherever the last setPose put them.
     * @param {number} yaw
     */
    setTurretYaw(yaw) {
      if (yaw != null && isFinite(yaw)) turretYawH = yaw;
    },

    /**
     * EQUIPMENT SYSTEM: show the mounted loadout (call with the player's
     * equip ids after setTank; null/[] clears the row and it collapses).
     * @param {?Array<string>} ids equipment ids (game/equipment.js catalog)
     */
    setEquipment(ids) {
      let html = '';
      for (const id of Array.isArray(ids) ? ids : []) {
        const it = EQUIPMENT_BY_ID.get(id);
        if (!it) continue;
        html += `<span class="eq" title="${it.name} — ${it.desc}">${equipIconSVG(id, 15)}</span>`;
      }
      equipRow.innerHTML = html;
    },

    /** Probe/tooling introspection (E2E gates): mask readiness + live pose.
     *  @returns {{masksReady:boolean,hullPhi:number,gunPhi:number,specId:?string}} */
    debugState() {
      return {
        masksReady: !!(masks && tints),
        hullPhi: hullPhi(),
        gunPhi: gunPhi(),
        specId: spec ? spec.id : null,
      };
    },

    /**
     * Deterministic screenshot hook: display a sample state. Accepts either a
     * full CombatState or a compact sample:
     * { hpFrac?, modules?: {name:'ok'|'yellow'|'red'}, crew?: {name:boolean},
     *   burning?: boolean, pose?: {hull,turret,cam} }.
     * @param {object} sample
     */
    setState(sample) {
      if (!sample) return;
      if (sample.pose) {
        this.setPose(sample.pose.hull, sample.pose.turret, sample.pose.cam);
      }
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
      lastDrawSig = null;
      refreshDom();
      draw();
    },
  };
}
