// src/ui/hud.js — battle HUD overlay: reticle, reload ring, shell selector,
// penetration indicator, sniper scope, enemy HP bars, minimap, kill feed,
// damage numbers, hit-direction indicator. DOM/canvas only — no scene objects.
// Contract: docs/ARCHITECTURE.md §3.7.1.
import * as THREE from 'three';

// --- palette (locked colors per ARCHITECTURE §3.7.1) ---
const PEN_GREEN = '#7ee87e';
const PEN_ORANGE = '#f0b04a';
const PEN_RED = '#f05a5a';
const PEN_NONE = 'rgba(236,242,248,0.95)';
const FONT_STACK = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// module-scope scratch (no per-frame allocation)
const _mInv = new THREE.Matrix4();
const _cs = new THREE.Vector3();
const _ndc = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _fwd = new THREE.Vector3();

// Default shell card data (used only when a forced screenshot aim view arrives
// before any live frame — matches the m1a2 default player loadout).
const DEFAULT_SHELLS = [
  { name: 'M829A4', type: 'APFSDS', dmg: 540, penLabel: '750 mm' },
  { name: 'M830A1', type: 'HEAT', dmg: 480, penLabel: '600 mm' },
  { name: 'M1147', type: 'HE', dmg: 600, penLabel: '60 mm' },
];

const SHELL_TYPE_COLOR = {
  AP: '#ffd27a', APCR: '#e8f4ff', HEAT: '#ff8a5c', HE: '#ffb02e', APFSDS: '#ffc46b',
};

const CAUSE_LABEL = { shot: '', fire: 'FIRE', ammorack: 'AMMO RACK' };

const HUD_CSS = `
.cot-hud{position:fixed;inset:0;pointer-events:none;z-index:40;font-family:${FONT_STACK};
  -webkit-user-select:none;user-select:none;color:#e6edf3;overflow:hidden;}
.cot-hud *{box-sizing:border-box;margin:0;padding:0;}
.cot-ret{position:absolute;inset:0;width:100%;height:100%;display:block;}
.cot-killfeed{position:absolute;top:16px;right:18px;display:flex;flex-direction:column;
  gap:5px;align-items:flex-end;max-width:420px;}
.cot-kf{display:flex;gap:7px;align-items:baseline;padding:5px 12px 5px 16px;font-size:12.5px;
  letter-spacing:.03em;background:linear-gradient(90deg,rgba(8,12,16,0) 0%,rgba(8,12,16,.82) 26%);
  border-right:2px solid #f05a5a;text-shadow:0 1px 2px rgba(0,0,0,.8);
  transition:opacity .9s ease;opacity:1;}
.cot-kf.out{opacity:0;}
.cot-kf .k{color:#cfe3f4;font-weight:600;}
.cot-kf .v{color:#f28f8f;font-weight:600;}
.cot-kf .d{color:#8a97a3;font-weight:400;font-size:11.5px;text-transform:uppercase;letter-spacing:.08em;}
.cot-kf .c{color:#f0b04a;font-size:10px;letter-spacing:.1em;font-weight:700;}
.cot-dmglayer{position:absolute;inset:0;}
.cot-dmgnum{position:absolute;font-weight:700;font-size:18px;color:#ffd166;white-space:nowrap;
  text-shadow:0 1px 1px rgba(0,0,0,.95),0 0 12px rgba(0,0,0,.5);
  animation:cotFloat 1.7s cubic-bezier(.2,.6,.3,1) forwards;will-change:transform,opacity;}
.cot-dmgnum.miss{color:#bcc8d2;font-size:13px;font-weight:600;letter-spacing:.12em;}
.cot-dmgnum .crit{font-size:10px;letter-spacing:.14em;color:#ff8a5c;vertical-align:super;margin-left:4px;}
@keyframes cotFloat{0%{opacity:0;transform:translate(-50%,-30%)}10%{opacity:1}
  70%{opacity:.95}100%{opacity:0;transform:translate(-50%,-190%)}}
.cot-alert{position:absolute;left:50%;bottom:23%;transform:translateX(-50%);font-size:14px;
  font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#f0b04a;
  text-shadow:0 1px 3px rgba(0,0,0,.9);opacity:0;transition:opacity .25s ease;}
.cot-alert.red{color:#f05a5a;}
.cot-alert.show{opacity:1;}
.cot-shells{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);display:flex;
  gap:7px;pointer-events:auto;}
.cot-shell{width:148px;padding:7px 10px 6px;background:linear-gradient(180deg,rgba(14,19,24,.82),rgba(8,11,14,.88));
  border:1px solid rgba(146,164,180,.28);border-bottom:2px solid rgba(146,164,180,.28);
  cursor:pointer;position:relative;transition:border-color .12s,background .12s;}
.cot-shell:hover{border-color:rgba(210,225,240,.5);}
.cot-shell.sel{border-color:#f0a030;border-bottom-color:#f0a030;
  background:linear-gradient(180deg,rgba(34,26,12,.9),rgba(18,13,7,.92));
  box-shadow:0 0 14px rgba(240,160,48,.25);}
.cot-shell .key{position:absolute;top:4px;left:7px;font-size:10px;font-weight:700;color:#8a97a3;
  border:1px solid rgba(146,164,180,.4);padding:0 4px;line-height:14px;}
.cot-shell.sel .key{color:#f0b04a;border-color:rgba(240,176,74,.6);}
.cot-shell .nm{font-size:12.5px;font-weight:600;color:#e6edf3;text-align:center;letter-spacing:.02em;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 14px;}
.cot-shell .ty{font-size:9.5px;font-weight:700;letter-spacing:.14em;text-align:center;margin-top:1px;}
.cot-shell .st{display:flex;justify-content:space-between;font-size:10px;color:#9fb0bf;
  margin-top:4px;letter-spacing:.04em;}
.cot-shell .st b{color:#d6e2ec;font-weight:600;}
.cot-hpbars{position:absolute;inset:0;}
.cot-hpb{position:absolute;width:96px;transform:translate(-50%,-100%);text-align:center;will-change:transform;}
.cot-hpb .nm{font-size:11px;font-weight:600;letter-spacing:.05em;color:#ffb3b3;
  text-shadow:0 1px 2px rgba(0,0,0,.95);margin-bottom:2px;white-space:nowrap;}
.cot-hpb .tr{height:4px;background:rgba(6,8,10,.72);border:1px solid rgba(0,0,0,.6);
  box-shadow:0 1px 2px rgba(0,0,0,.5);}
.cot-hpb .fl{height:100%;background:linear-gradient(180deg,#ff7a6e,#d63a30);transition:width .15s linear;}
.cot-minimap{position:absolute;right:16px;bottom:16px;width:220px;height:220px;
  border:1px solid rgba(210,225,240,.28);box-shadow:0 6px 22px rgba(0,0,0,.55);
  background:#0d1310;}
.cot-minimap canvas{display:block;width:220px;height:220px;}
.cot-zoom{position:absolute;left:50%;top:calc(50% + 64px);transform:translateX(-50%);
  font-size:15px;font-weight:600;letter-spacing:.1em;color:rgba(220,232,244,.9);
  text-shadow:0 1px 3px rgba(0,0,0,.9);display:none;}
`;

function penColor(r) {
  if (r == null || !isFinite(r)) return PEN_NONE;
  return r >= 1.15 ? PEN_GREEN : r >= 0.85 ? PEN_ORANGE : PEN_RED;
}

function ensureStyle(id, css) {
  if (!document.getElementById(id)) {
    const s = document.createElement('style');
    s.id = id;
    s.textContent = css;
    document.head.appendChild(s);
  }
}

function el(tag, cls, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

/**
 * Create the battle HUD overlay and subscribe it to the event bus.
 * @param {{on:Function,off:Function,emit:Function}} bus - injected event bus (§1.5).
 * @returns {{setMode:Function,update:Function,buildMinimap:Function,setDamagePanel:Function,forceAimDisplay:Function,root:HTMLElement}} Hud
 */
export function initHud(bus) {
  ensureStyle('cot-hud-style', HUD_CSS);

  const root = el('div', 'cot-hud');
  document.body.appendChild(root);

  // --- layers ---
  const retCanvas = el('canvas', 'cot-ret', root);
  const ctx = retCanvas.getContext('2d');
  const hpLayer = el('div', 'cot-hpbars', root);
  const dmgLayer = el('div', 'cot-dmglayer', root);
  const killfeed = el('div', 'cot-killfeed', root);
  const alertEl = el('div', 'cot-alert', root);
  const zoomEl = el('div', 'cot-zoom', root);
  zoomEl.textContent = '×8.0';

  // --- shell selector ---
  const shellBox = el('div', 'cot-shells', root);
  const slotEls = [];
  for (let i = 0; i < 3; i++) {
    const s = el('div', 'cot-shell', shellBox);
    s.innerHTML = `<div class="key">${i + 1}</div><div class="nm"></div><div class="ty"></div>` +
      `<div class="st"><span>PEN <b class="p"></b></span><span>DMG <b class="d"></b></span></div>`;
    s.addEventListener('click', () => {
      selectSlot(i);
      bus.emit('ui:shellSelect', { slot: i });
      bus.emit('ui:click', {});
    });
    slotEls.push(s);
  }

  // --- minimap ---
  const mmWrap = el('div', 'cot-minimap', root);
  const mmCanvas = el('canvas', '', mmWrap);
  const MM = 220;
  const mmDpr = Math.min(window.devicePixelRatio || 1, 2);
  mmCanvas.width = MM * mmDpr; mmCanvas.height = MM * mmDpr;
  const mmCtx = mmCanvas.getContext('2d');
  mmCtx.setTransform(mmDpr, 0, 0, mmDpr, 0, 0);
  let mmBg = null; // offscreen background canvas

  // --- internal state ---
  let mode = 'hidden';
  let w = 1, h = 1, dpr = 1;
  let scopeGrad = null;
  let lastCamera = null;
  let lastTimeS = 0;
  let playerId = null;
  let smoothRadPx = 40;
  let localSlot = 0;
  let forced = null; // partial FrameInfo.aim override (cleared by next update)
  let lastShells = DEFAULT_SHELLS;
  let alertTimer = null;
  const nameById = new Map();
  const hitDirs = []; // { ang, t0 } — screen-relative hit indicators
  const hpPool = new Map(); // tank id -> { root, fill, nm, lastFrac }
  let mapWorldSize = 1024;

  function resize() {
    w = root.clientWidth || window.innerWidth;
    h = root.clientHeight || window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    retCanvas.width = Math.round(w * dpr);
    retCanvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scopeGrad = null;
  }
  window.addEventListener('resize', resize);
  resize();
  root.style.display = 'none'; // starts hidden until setMode/update

  window.addEventListener('keydown', (e) => {
    if (mode === 'hidden') return;
    if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') {
      const slot = Number(e.code.slice(-1)) - 1;
      selectSlot(slot);
      bus.emit('ui:shellSelect', { slot });
      bus.emit('ui:click', {});
    }
  });

  function selectSlot(i) {
    localSlot = i;
    for (let k = 0; k < 3; k++) slotEls[k].classList.toggle('sel', k === i);
  }

  // ---------- projection ----------
  let _sx = 0, _sy = 0, _sVisible = false, _sDist = 0;
  function project(camera, x, y, z) {
    _cs.set(x, y, z).applyMatrix4(_mInv);
    _sDist = -_cs.z;
    if (_cs.z > -0.3) { _sVisible = false; return; }
    _ndc.copy(_cs).applyMatrix4(camera.projectionMatrix);
    _sx = (_ndc.x * 0.5 + 0.5) * w;
    _sy = (-_ndc.y * 0.5 + 0.5) * h;
    _sVisible = _sx > -200 && _sx < w + 200 && _sy > -200 && _sy < h + 200;
  }

  function pxPerMeterAt(camera, dist) {
    const fov = (camera && camera.fov ? camera.fov : 60) * Math.PI / 180;
    return (h * 0.5) / (Math.tan(fov * 0.5) * Math.max(dist, 1));
  }

  // ---------- reticle / scope canvas ----------
  function drawScope() {
    if (!scopeGrad) {
      const r = Math.hypot(w, h) * 0.5;
      scopeGrad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.26, w / 2, h / 2, r);
      scopeGrad.addColorStop(0, 'rgba(4,6,8,0)');
      scopeGrad.addColorStop(0.5, 'rgba(4,6,8,0.55)');
      scopeGrad.addColorStop(0.82, 'rgba(2,3,4,0.9)');
      scopeGrad.addColorStop(1, 'rgba(1,2,3,0.97)');
    }
    ctx.fillStyle = scopeGrad;
    ctx.fillRect(0, 0, w, h);
    // scope ring
    ctx.strokeStyle = 'rgba(180,200,215,0.28)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.42, 0, Math.PI * 2);
    ctx.stroke();
    // hairlines with center gap
    const cx = w / 2, cy = h / 2, gap = 30;
    ctx.strokeStyle = 'rgba(210,225,240,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, cy + 0.5); ctx.lineTo(cx - gap, cy + 0.5);
    ctx.moveTo(cx + gap, cy + 0.5); ctx.lineTo(w, cy + 0.5);
    ctx.moveTo(cx + 0.5, 0); ctx.lineTo(cx + 0.5, cy - gap);
    ctx.moveTo(cx + 0.5, cy + gap); ctx.lineTo(cx + 0.5, h);
    ctx.stroke();
    // mil ticks on horizontal line
    ctx.strokeStyle = 'rgba(210,225,240,0.35)';
    ctx.beginPath();
    for (let i = 1; i <= 6; i++) {
      const d = gap + 26 * i;
      ctx.moveTo(cx - d, cy - 4); ctx.lineTo(cx - d, cy + 4);
      ctx.moveTo(cx + d, cy - 4); ctx.lineTo(cx + d, cy + 4);
    }
    ctx.stroke();
  }

  function drawHitIndicators(timeS) {
    const R = Math.min(w, h) * 0.17;
    for (let i = hitDirs.length - 1; i >= 0; i--) {
      const e = hitDirs[i];
      const age = timeS - e.t0;
      if (age > 3 || age < 0) { hitDirs.splice(i, 1); continue; }
      const a = age < 0.3 ? 1 : 1 - (age - 0.3) / 2.7;
      ctx.strokeStyle = `rgba(240,70,60,${(0.85 * a).toFixed(3)})`;
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      // e.ang: 0 = camera-forward (screen up), positive clockwise
      const c = e.ang - Math.PI / 2;
      ctx.arc(w / 2, h / 2, R, c - 0.26, c + 0.26);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  function drawReticle(view, dt) {
    const col = penColor(view.penRatio);
    const cx = view.cx, cy = view.cy;
    // bloom/shrink smoothing toward target pixel radius
    const k = 1 - Math.exp(-14 * dt);
    smoothRadPx += (view.radPx - smoothRadPx) * k;
    const r = Math.max(7, Math.min(smoothRadPx, Math.min(w, h) * 0.42));

    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = 1.6;
    // dispersion circle
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // cardinal ticks (inward)
    ctx.beginPath();
    for (let q = 0; q < 4; q++) {
      const a = q * Math.PI / 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      ctx.moveTo(cx + ca * r, cy + sa * r);
      ctx.lineTo(cx + ca * (r - 8), cy + sa * (r - 8));
    }
    ctx.stroke();
    // center dot + fine cross
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 12, cy + 0.5); ctx.lineTo(cx - 5, cy + 0.5);
    ctx.moveTo(cx + 5, cy + 0.5); ctx.lineTo(cx + 12, cy + 0.5);
    ctx.moveTo(cx + 0.5, cy - 12); ctx.lineTo(cx + 0.5, cy - 5);
    ctx.moveTo(cx + 0.5, cy + 5); ctx.lineTo(cx + 0.5, cy + 12);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // gun marker (where the barrel actually points)
    if (view.gunX != null) {
      ctx.strokeStyle = view.atGunLimit ? PEN_RED : 'rgba(215,228,240,0.8)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(view.gunX, view.gunY, 5, 0, Math.PI * 2);
      ctx.moveTo(view.gunX - 9, view.gunY); ctx.lineTo(view.gunX - 3, view.gunY);
      ctx.moveTo(view.gunX + 3, view.gunY); ctx.lineTo(view.gunX + 9, view.gunY);
      ctx.stroke();
    }

    // reload ring + countdown
    const rl = view.reload;
    if (rl && rl.totalS > 0 && rl.t > 0.001) {
      const frac = 1 - rl.t / rl.totalS;
      const rr = 26;
      ctx.lineWidth = 4.5;
      ctx.strokeStyle = 'rgba(10,14,18,0.55)';
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#f0a030';
      ctx.beginPath(); ctx.arc(cx, cy, rr, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#f0b04a';
      ctx.font = `600 13px ${FONT_STACK}`;
      ctx.textAlign = 'center';
      ctx.fillText(rl.t.toFixed(1), cx, cy + 48);
      ctx.font = `600 9px ${FONT_STACK}`;
      ctx.fillStyle = 'rgba(240,176,74,0.75)';
      ctx.fillText('R E L O A D I N G', cx, cy + 61);
    }

    // distance readout
    if (view.distM != null && isFinite(view.distM)) {
      ctx.fillStyle = 'rgba(214,226,236,0.85)';
      ctx.font = `600 12px ${FONT_STACK}`;
      ctx.textAlign = 'left';
      ctx.fillText(`${Math.round(view.distM)} m`, cx + r + 12, cy + 4);
    }
    ctx.textAlign = 'left';
  }

  // ---------- shell selector ----------
  function renderShells(shells, slot) {
    for (let i = 0; i < 3; i++) {
      const sp = shells && shells[i] ? shells[i] : DEFAULT_SHELLS[i];
      const s = slotEls[i];
      s.querySelector('.nm').textContent = sp.name || '—';
      const ty = s.querySelector('.ty');
      ty.textContent = sp.type || '';
      ty.style.color = SHELL_TYPE_COLOR[sp.type] || '#9fb0bf';
      s.querySelector('.p').textContent = sp.penLabel != null ? sp.penLabel : '—';
      s.querySelector('.d').textContent = sp.dmg != null ? String(sp.dmg) : '—';
      s.classList.toggle('sel', i === slot);
    }
    localSlot = slot;
  }

  // ---------- enemy HP bars ----------
  function updateHpBars(frame) {
    const camera = frame.camera;
    const seen = updateHpBars._seen || (updateHpBars._seen = new Set());
    seen.clear();
    const tanks = frame.tanks || [];
    for (let i = 0; i < tanks.length; i++) {
      const t = tanks[i];
      if (!t || t.isPlayer || !t.combat || t.combat.destroyed) continue;
      if (t.visual && t.visual.turretTopWorld) {
        t.visual.turretTopWorld(_tmp);
      } else if (t.state && t.state.pos) {
        _tmp.copy(t.state.pos);
        _tmp.y += (t.spec && t.spec.dims ? t.spec.dims.heightM : 2.5);
      } else continue;
      project(camera, _tmp.x, _tmp.y + 2, _tmp.z);
      if (!_sVisible || _sDist > 500) continue;
      seen.add(t.id);
      let bar = hpPool.get(t.id);
      if (!bar) {
        const rootEl = el('div', 'cot-hpb', hpLayer);
        rootEl.innerHTML = `<div class="nm"></div><div class="tr"><div class="fl"></div></div>`;
        bar = { root: rootEl, nm: rootEl.querySelector('.nm'), fill: rootEl.querySelector('.fl'), lastFrac: -1, lastName: '' };
        hpPool.set(t.id, bar);
      }
      bar.root.style.transform = `translate(${_sx - 48}px,${_sy - 24}px)`;
      bar.root.style.display = 'block';
      const nm = t.spec ? t.spec.name : t.id;
      if (bar.lastName !== nm) { bar.nm.textContent = nm; bar.lastName = nm; }
      const frac = Math.max(0, Math.min(1, t.combat.hp / t.combat.maxHp));
      if (Math.abs(frac - bar.lastFrac) > 0.001) {
        bar.fill.style.width = `${(frac * 100).toFixed(1)}%`;
        bar.lastFrac = frac;
      }
    }
    for (const [id, bar] of hpPool) {
      if (!seen.has(id)) bar.root.style.display = 'none';
    }
  }

  // ---------- minimap ----------
  function worldToMap(x, z) {
    // +X right, +Z up (north)
    const half = mapWorldSize / 2;
    return [((x + half) / mapWorldSize) * MM, ((half - z) / mapWorldSize) * MM];
  }

  function buildMinimapBg(heightField, features) {
    mapWorldSize = heightField && heightField.size ? heightField.size : 1024;
    const N = 176; // sample grid
    const bg = document.createElement('canvas');
    bg.width = N; bg.height = N;
    const bctx = bg.getContext('2d');
    const img = bctx.createImageData(N, N);
    const data = img.data;
    const half = mapWorldSize / 2;
    const step = mapWorldSize / N;
    const minY = heightField.minY, maxY = heightField.maxY;
    const range = Math.max(1e-3, maxY - minY);
    for (let j = 0; j < N; j++) {
      const z = half - (j + 0.5) * step; // top row = +Z
      for (let i = 0; i < N; i++) {
        const x = -half + (i + 0.5) * step;
        const hgt = heightField.getHeightAt(x, z);
        // hillshade via central differences, light from NW-above
        const hx = heightField.getHeightAt(x + step, z) - heightField.getHeightAt(x - step, z);
        const hz = heightField.getHeightAt(x, z + step) - heightField.getHeightAt(x, z - step);
        const shade = Math.max(0.35, Math.min(1.25, 0.85 - hx * 0.06 + hz * 0.06));
        const tone = (hgt - minY) / range;
        const gt = heightField.getGroundType(x, z);
        let r, g, b;
        if (gt === 'hard') { r = 96; g = 88; b = 74; }
        else if (gt === 'soft') { r = 44; g = 62; b = 48; }
        else { r = 62; g = 82; b = 50; }
        r = (r + tone * 46) * shade; g = (g + tone * 46) * shade; b = (b + tone * 34) * shade;
        const o = (j * N + i) * 4;
        data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
      }
    }
    bctx.putImageData(img, 0, 0);

    // compose at display resolution with features + grid
    const out = document.createElement('canvas');
    out.width = MM * mmDpr; out.height = MM * mmDpr;
    const octx = out.getContext('2d');
    octx.setTransform(mmDpr, 0, 0, mmDpr, 0, 0);
    octx.imageSmoothingEnabled = true;
    octx.drawImage(bg, 0, 0, MM, MM);

    const f = features || {};
    // soft/water patches
    if (f.waterOrSoft) {
      octx.fillStyle = 'rgba(46,74,72,0.55)';
      for (const p of f.waterOrSoft) {
        const [px, py] = worldToMap(p.x, p.z);
        octx.beginPath();
        octx.arc(px, py, (p.r / mapWorldSize) * MM, 0, Math.PI * 2);
        octx.fill();
      }
    }
    // tree clusters
    if (f.treeClusters) {
      octx.fillStyle = 'rgba(30,58,30,0.6)';
      for (const p of f.treeClusters) {
        const [px, py] = worldToMap(p.x, p.z);
        octx.beginPath();
        octx.arc(px, py, Math.max(2, (p.r / mapWorldSize) * MM), 0, Math.PI * 2);
        octx.fill();
      }
    }
    // roads
    if (f.roads) {
      octx.strokeStyle = 'rgba(178,164,132,0.85)';
      octx.lineWidth = 1.6;
      octx.lineJoin = 'round';
      for (const line of f.roads) {
        octx.beginPath();
        for (let i = 0; i < line.length; i++) {
          const [px, py] = worldToMap(line[i][0], line[i][1]);
          if (i === 0) octx.moveTo(px, py); else octx.lineTo(px, py);
        }
        octx.stroke();
      }
    }
    // buildings
    if (f.buildings) {
      octx.fillStyle = 'rgba(200,200,205,0.9)';
      for (const b of f.buildings) {
        const [px, py] = worldToMap(b.x, b.z);
        octx.save();
        octx.translate(px, py);
        octx.rotate(-(b.rot || 0));
        const bw = Math.max(2, (b.w / mapWorldSize) * MM);
        const bd = Math.max(2, (b.d / mapWorldSize) * MM);
        octx.fillRect(-bw / 2, -bd / 2, bw, bd);
        octx.restore();
      }
    }
    // grid 10x10
    octx.strokeStyle = 'rgba(230,240,250,0.08)';
    octx.lineWidth = 1;
    octx.beginPath();
    for (let i = 1; i < 10; i++) {
      octx.moveTo(i * MM / 10 + 0.5, 0); octx.lineTo(i * MM / 10 + 0.5, MM);
      octx.moveTo(0, i * MM / 10 + 0.5); octx.lineTo(MM, i * MM / 10 + 0.5);
    }
    octx.stroke();
    // inner vignette edge
    octx.strokeStyle = 'rgba(0,0,0,0.45)';
    octx.lineWidth = 2;
    octx.strokeRect(1, 1, MM - 2, MM - 2);
    mmBg = out;
  }

  function drawMinimap(frame) {
    if (mmBg) {
      mmCtx.drawImage(mmBg, 0, 0, MM, MM);
    } else {
      mmCtx.fillStyle = '#141b16';
      mmCtx.fillRect(0, 0, MM, MM);
    }
    const tanks = frame.tanks || [];
    const player = frame.player;
    // enemy / ally blips
    for (let i = 0; i < tanks.length; i++) {
      const t = tanks[i];
      if (!t || !t.state || t.isPlayer) continue;
      const [px, py] = worldToMap(t.state.pos.x, t.state.pos.z);
      if (t.combat && t.combat.destroyed) {
        mmCtx.strokeStyle = 'rgba(140,140,140,0.85)';
        mmCtx.lineWidth = 1.4;
        mmCtx.beginPath();
        mmCtx.moveTo(px - 3.5, py - 3.5); mmCtx.lineTo(px + 3.5, py + 3.5);
        mmCtx.moveTo(px + 3.5, py - 3.5); mmCtx.lineTo(px - 3.5, py + 3.5);
        mmCtx.stroke();
      } else {
        mmCtx.fillStyle = t.team === 'player' ? '#7ee87e' : '#f05a5a';
        mmCtx.save();
        mmCtx.translate(px, py);
        mmCtx.rotate(Math.PI / 4);
        mmCtx.fillRect(-3, -3, 6, 6);
        mmCtx.restore();
      }
    }
    // player: view wedge + arrow
    if (player && player.state) {
      const st = player.state;
      const [px, py] = worldToMap(st.pos.x, st.pos.z);
      if (frame.camera) {
        _fwd.set(0, 0, -1).transformDirection(frame.camera.matrixWorld);
        const camAng = Math.atan2(-_fwd.z, _fwd.x); // canvas angle (y down, +Z up on map)
        mmCtx.fillStyle = 'rgba(235,245,255,0.16)';
        mmCtx.beginPath();
        mmCtx.moveTo(px, py);
        mmCtx.arc(px, py, 30, camAng - 0.42, camAng + 0.42);
        mmCtx.closePath();
        mmCtx.fill();
      }
      const yawAng = Math.atan2(-Math.cos(st.yaw), Math.sin(st.yaw)); // canvas angle of hull forward
      mmCtx.save();
      mmCtx.translate(px, py);
      mmCtx.rotate(yawAng + Math.PI / 2);
      mmCtx.fillStyle = '#7ee87e';
      mmCtx.beginPath();
      mmCtx.moveTo(0, -5.5); mmCtx.lineTo(4, 4.5); mmCtx.lineTo(-4, 4.5);
      mmCtx.closePath();
      mmCtx.fill();
      mmCtx.restore();
      // turret direction line
      const tAng = st.yaw + st.turretYaw;
      mmCtx.strokeStyle = 'rgba(126,232,126,0.7)';
      mmCtx.lineWidth = 1.2;
      mmCtx.beginPath();
      mmCtx.moveTo(px, py);
      mmCtx.lineTo(px + Math.sin(tAng) * 14, py - Math.cos(tAng) * 14);
      mmCtx.stroke();
    }
  }

  // ---------- bus feeds ----------
  function pushKill(payload) {
    const killer = nameById.get(payload.killerId) || 'Enemy';
    const victim = nameById.get(payload.id) || payload.specId || 'Tank';
    const item = el('div', 'cot-kf', killfeed);
    const cause = CAUSE_LABEL[payload.cause] || '';
    item.innerHTML = `<span class="k"></span><span class="d">destroyed</span><span class="v"></span>` +
      (cause ? `<span class="c">${cause}</span>` : '');
    item.querySelector('.k').textContent = killer;
    item.querySelector('.v').textContent = victim;
    killfeed.prepend(item);
    while (killfeed.children.length > 5) killfeed.lastChild.remove();
    setTimeout(() => item.classList.add('out'), 5200);
    setTimeout(() => { if (item.parentNode) item.remove(); }, 6200);
  }

  function pushDamageNumber(hit) {
    if (!lastCamera || mode === 'hidden') return;
    project(lastCamera, hit.pos[0], hit.pos[1] + 1.5, hit.pos[2]);
    if (!_sVisible) return;
    const d = el('div', 'cot-dmgnum', dmgLayer);
    if (hit.kind === 'ricochet') { d.classList.add('miss'); d.textContent = 'RICOCHET'; }
    else if (hit.kind === 'nonpen') { d.classList.add('miss'); d.textContent = 'NO PENETRATION'; }
    else if (hit.kind === 'spaced_absorb' || hit.kind === 'era') { d.classList.add('miss'); d.textContent = 'ABSORBED'; }
    else if (hit.damage > 0) {
      d.textContent = `-${Math.round(hit.damage)}`;
      if (hit.modulesHit && hit.modulesHit.length) {
        const c = el('span', 'crit', d);
        c.textContent = 'CRIT';
      }
    } else { d.remove(); return; }
    d.style.left = `${_sx.toFixed(0)}px`;
    d.style.top = `${_sy.toFixed(0)}px`;
    setTimeout(() => { if (d.parentNode) d.remove(); }, 1800);
  }

  function pushHitDirection(hit, playerEnt) {
    if (!playerEnt || !playerEnt.state || !lastCamera) return;
    const dx = hit.pos[0] - playerEnt.state.pos.x;
    const dz = hit.pos[2] - playerEnt.state.pos.z;
    _fwd.set(0, 0, -1).transformDirection(lastCamera.matrixWorld);
    const camYaw = Math.atan2(_fwd.x, _fwd.z);
    const hitYaw = Math.atan2(dx, dz);
    hitDirs.push({ ang: hitYaw - camYaw, t0: lastTimeS });
    if (hitDirs.length > 6) hitDirs.shift();
  }

  function showAlert(text, red) {
    alertEl.textContent = text;
    alertEl.classList.toggle('red', !!red);
    alertEl.classList.add('show');
    if (alertTimer) clearTimeout(alertTimer);
    alertTimer = setTimeout(() => alertEl.classList.remove('show'), 2400);
  }

  let playerRef = null;
  bus.on('tank:destroyed', (p) => { pushKill(p); });
  bus.on('shell:hit', (hit) => {
    if (playerId != null && hit.attackerId === playerId && hit.targetId && hit.targetId !== playerId) {
      pushDamageNumber(hit);
    }
    if (playerId != null && hit.targetId === playerId) {
      pushHitDirection(hit, playerRef);
    }
  });
  bus.on('module:state', (p) => {
    if (playerId == null || p.id !== playerId || p.state === 'ok') return;
    const label = p.module === 'trackL' || p.module === 'trackR' ? 'TRACK'
      : p.module === 'ammoRack' ? 'AMMO RACK'
      : p.module === 'fuelTank' ? 'FUEL TANK'
      : p.module === 'turretRing' ? 'TURRET RING'
      : p.module.toUpperCase();
    showAlert(p.state === 'red' ? `${label} DESTROYED` : `${label} DAMAGED`, p.state === 'red');
  });

  // ---------- aim view assembly ----------
  const aimView = {
    cx: 0, cy: 0, radPx: 40, penRatio: null, distM: null,
    gunX: null, gunY: null, atGunLimit: false,
    reload: { t: 0, totalS: 1 }, zoom: 1,
  };

  function assembleAimView(camera, aim) {
    aimView.penRatio = aim.penRatio != null ? aim.penRatio : null;
    aimView.distM = aim.distM != null ? aim.distM : null;
    aimView.atGunLimit = !!aim.atGunLimit;
    aimView.reload = aim.reload || aimView.reload;
    aimView.zoom = aim.zoom || 1;
    aimView.gunX = null; aimView.gunY = null;
    let placed = false;
    if (camera && aim.point && aim.point.isVector3) {
      project(camera, aim.point.x, aim.point.y, aim.point.z);
      if (_sVisible) {
        aimView.cx = _sx; aimView.cy = _sy;
        const dist = aim.distM != null ? aim.distM : _sDist;
        const ppm = pxPerMeterAt(camera, dist);
        aimView.radPx = (aim.dispersionRadM != null ? aim.dispersionRadM : 1.5) * ppm;
        placed = true;
      }
    }
    if (!placed) {
      aimView.cx = w / 2; aimView.cy = h / 2;
      if (aim.dispersionRadM != null && aim.distM != null) {
        aimView.radPx = aim.dispersionRadM * pxPerMeterAt(camera, aim.distM);
      } else {
        aimView.radPx = Math.min(w, h) * 0.05;
      }
    }
    if (camera && aim.gunMarker && aim.gunMarker.isVector3) {
      project(camera, aim.gunMarker.x, aim.gunMarker.y, aim.gunMarker.z);
      if (_sVisible) { aimView.gunX = _sx; aimView.gunY = _sy; }
    }
  }

  function renderCanvas(dt) {
    ctx.clearRect(0, 0, w, h);
    if (mode === 'hidden') return;
    if (mode === 'sniper') drawScope();
    drawHitIndicators(lastTimeS);
    drawReticle(aimView, dt);
  }

  function applyMode() {
    root.style.display = mode === 'hidden' ? 'none' : 'block';
    zoomEl.style.display = mode === 'sniper' ? 'block' : 'none';
  }

  // ---------- public API ----------
  const hud = {
    root,

    /**
     * Switch overall HUD mode.
     * @param {'battle'|'sniper'|'hidden'} m
     */
    setMode(m) {
      mode = m;
      applyMode();
      if (m === 'hidden') ctx.clearRect(0, 0, w, h);
    },

    /**
     * Per-render-frame HUD refresh.
     * @param {FrameInfo} frame - see ARCHITECTURE §3.7.1.
     */
    update(frame) {
      forced = null; // a live frame supersedes any forced screenshot display
      const camera = frame.camera;
      lastCamera = camera || lastCamera;
      const dt = Math.max(0, Math.min(0.1, frame.timeS - lastTimeS)) || 1 / 60;
      lastTimeS = frame.timeS;
      if (frame.mode && frame.mode !== mode) { mode = frame.mode; applyMode(); }
      playerRef = frame.player || playerRef;
      if (frame.player) playerId = frame.player.id;
      const tanks = frame.tanks || [];
      for (let i = 0; i < tanks.length; i++) {
        const t = tanks[i];
        if (t && t.spec) nameById.set(t.id, t.spec.name);
      }
      if (mode === 'hidden') { ctx.clearRect(0, 0, w, h); return; }
      if (camera) { camera.updateMatrixWorld(); _mInv.copy(camera.matrixWorld).invert(); }

      const aim = frame.aim || {};
      assembleAimView(camera, aim);
      if (aim.shells) lastShells = aim.shells;
      renderShells(lastShells, aim.shellSlot != null ? aim.shellSlot : localSlot);
      if (mode === 'sniper') zoomEl.textContent = `×${(aim.zoom || 1).toFixed(1)}`;
      renderCanvas(dt);
      if (camera) updateHpBars(frame);
      drawMinimap(frame);
    },

    /**
     * Render the static minimap background once at battle start.
     * @param {HeightField} heightField
     * @param {{roads:Array,buildings:Array,treeClusters:Array,waterOrSoft:Array}} features - World.getMinimapFeatures() result.
     */
    buildMinimap(heightField, features) {
      buildMinimapBg(heightField, features);
      mmCtx.drawImage(mmBg, 0, 0, MM, MM);
    },

    /**
     * Mount the damage panel instance into the HUD layer.
     * @param {{root:HTMLElement}} panel - createDamagePanel() result.
     */
    setDamagePanel(panel) {
      if (panel && panel.root && panel.root.parentNode !== root) {
        root.appendChild(panel.root);
      }
    },

    /**
     * Deterministic screenshot hook: immediately display the given partial aim
     * state (reticle centered on screen if no world point/camera is known).
     * Stays until the next update(frame).
     * @param {object} f - partial FrameInfo.aim.
     */
    forceAimDisplay(f) {
      forced = Object.assign({}, f);
      assembleAimView(lastCamera, forced);
      smoothRadPx = aimView.radPx; // no bloom animation in a forced still
      if (forced.shells) lastShells = forced.shells;
      renderShells(lastShells, forced.shellSlot != null ? forced.shellSlot : localSlot);
      if (mode === 'sniper') zoomEl.textContent = `×${(forced.zoom || 8).toFixed(1)}`;
      renderCanvas(1);
    },
  };

  return hud;
}
