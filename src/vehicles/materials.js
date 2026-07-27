// src/vehicles/materials.js — procedural camo + surface materials for tankFactory.
// Vehicles-internal (ARCHITECTURE §3.3.3). MeshStandardMaterial only; all albedo
// canvases are sRGB; every lit material passes through engineCtx.setupShadowMaterial.
// No top-level side effects — canvases are created inside createTankMaterials.

import * as THREE from 'three';

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

const TEX_SIZE = 512;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale3 = (c, s) => [c[0] * s, c[1] * s, c[2] * s];

// Irregular blob path around (x,y) with radius r.
function blobPath(ctx, rng, x, y, r, lobes = 7, jitter = 0.45) {
  ctx.beginPath();
  const offs = [];
  for (let i = 0; i < lobes; i++) offs.push(1 - jitter / 2 + rng() * jitter);
  for (let i = 0; i <= lobes; i++) {
    const a = (i / lobes) * Math.PI * 2;
    const rr = r * offs[i % lobes];
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.8;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function paintCamo(canvas, visual, rng) {
  const ctx = canvas.getContext('2d');
  const S = canvas.width;
  const base = hexToRgb(visual.base);
  const weather = hexToRgb(visual.weather || visual.base);
  const patches = (visual.patches || []).map(hexToRgb);

  ctx.fillStyle = rgb(base);
  ctx.fillRect(0, 0, S, S);

  // Large soft tonal variation toward the weathered tone.
  for (let i = 0; i < 26; i++) {
    const x = rng() * S, y = rng() * S, r = S * (0.10 + rng() * 0.22);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const t = 0.25 + rng() * 0.45;
    g.addColorStop(0, rgb(mix(base, weather, t), 0.5));
    g.addColorStop(1, rgb(base, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const scheme = visual.scheme || 'solid';
  if (scheme === 'stripes' && patches.length) {
    // Tiger-style soft-edge diagonal stripe bands.
    for (let i = 0; i < 14; i++) {
      const col = patches[i % patches.length];
      const x = rng() * S * 1.4 - S * 0.2, w = S * (0.03 + rng() * 0.05);
      const tilt = S * (0.25 + rng() * 0.5) * (rng() < 0.5 ? -1 : 1);
      ctx.strokeStyle = rgb(col, 0.75);
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, -S * 0.1);
      ctx.bezierCurveTo(x + tilt * 0.3, S * 0.33, x + tilt * 0.7, S * 0.66, x + tilt, S * 1.1);
      ctx.stroke();
    }
  } else if (scheme === 'ambush' && patches.length) {
    for (let i = 0; i < 16; i++) {
      const col = patches[i % patches.length];
      blobPath(ctx, rng, rng() * S, rng() * S, S * (0.07 + rng() * 0.10));
      ctx.fillStyle = rgb(col, 0.85);
      ctx.fill();
    }
    // Contrasting ambush dots.
    for (let i = 0; i < 220; i++) {
      const x = rng() * S, y = rng() * S, r = S * 0.006 * (0.6 + rng());
      ctx.fillStyle = rgb([base, ...patches][(rng() * (patches.length + 1)) | 0], 0.9);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  } else if (scheme === 'nato' && patches.length) {
    // Hard-edge NATO 3-color polygons.
    for (let i = 0; i < 12; i++) {
      const col = patches[i % patches.length];
      const x = rng() * S, y = rng() * S, r = S * (0.10 + rng() * 0.16);
      ctx.beginPath();
      const n = 5 + ((rng() * 3) | 0);
      for (let k = 0; k <= n; k++) {
        const a = (k / n) * Math.PI * 2 + rng() * 0.5;
        const rr = r * (0.6 + rng() * 0.6);
        const px = x + Math.cos(a) * rr * 1.5, py = y + Math.sin(a) * rr * 0.7;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = rgb(col, 0.95);
      ctx.fill();
    }
  } else if (scheme === 'digital' && patches.length) {
    // Blocky digital-edge clusters.
    const cell = S / 64;
    for (let i = 0; i < 40; i++) {
      const col = patches[i % patches.length];
      const cx = (rng() * 64) | 0, cy = (rng() * 64) | 0;
      ctx.fillStyle = rgb(col, 0.85);
      for (let k = 0; k < 26; k++) {
        const dx = ((rng() * 8) | 0) - 4, dy = ((rng() * 6) | 0) - 3;
        ctx.fillRect((cx + dx) * cell, (cy + dy) * cell, cell * (1 + ((rng() * 2) | 0)), cell);
      }
    }
  }

  // Zimmerit: fine horizontal ridge modulation.
  if (visual.zimmerit) {
    for (let y = 0; y < S; y += 3) {
      ctx.fillStyle = `rgba(0,0,0,${0.05 + 0.05 * rng()})`;
      ctx.fillRect(0, y, S, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(0, y + 1, S, 1);
    }
  }

  // Fine grain noise.
  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * 18;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);

  // Weathering: dust streaks + dark oil streaks + paint chips.
  for (let i = 0; i < 60; i++) {
    const x = rng() * S, y = rng() * S, len = S * (0.04 + rng() * 0.12);
    ctx.strokeStyle = rng() < 0.5 ? 'rgba(30,26,20,0.14)' : `${rgb(scale3(weather, 1.25), 0.12)}`;
    ctx.lineWidth = 1 + rng() * 2.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rng() - 0.5) * 6, y + len); ctx.stroke();
  }
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = rng() < 0.6 ? 'rgba(25,22,18,0.5)' : 'rgba(120,90,55,0.4)';
    const r = 0.5 + rng() * 1.6;
    ctx.beginPath(); ctx.arc(rng() * S, rng() * S, r, 0, Math.PI * 2); ctx.fill();
  }
  return canvas;
}

function paintRoughness(canvas, rng, base = 0.72) {
  const ctx = canvas.getContext('2d');
  const S = canvas.width;
  const v = (base * 255) | 0;
  ctx.fillStyle = `rgb(${v},${v},${v})`;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 400; i++) {
    const g = ((base + (rng() - 0.5) * 0.3) * 255) | 0;
    ctx.fillStyle = `rgba(${g},${g},${g},0.35)`;
    const r = 2 + rng() * 26;
    ctx.beginPath(); ctx.arc(rng() * S, rng() * S, r, 0, Math.PI * 2); ctx.fill();
  }
  return canvas;
}

// One track texture: 4 link rows per repeat, chevron/waffle grousers.
function paintTrack(rng) {
  const S = 256;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#26262a';
  ctx.fillRect(0, 0, S, S);
  const rows = 4, rh = S / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * rh;
    // link body shading
    const g = ctx.createLinearGradient(0, y, 0, y + rh);
    g.addColorStop(0, '#3b3b40');
    g.addColorStop(0.45, '#2c2c30');
    g.addColorStop(0.5, '#17171a');
    g.addColorStop(0.55, '#2e2e33');
    g.addColorStop(1, '#232327');
    ctx.fillStyle = g;
    ctx.fillRect(0, y + 2, S, rh - 4);
    // pin gap
    ctx.fillStyle = '#0d0d0f';
    ctx.fillRect(0, y, S, 3);
    // chevron grouser
    ctx.strokeStyle = '#4a4a50';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(S * 0.08, y + rh * 0.72);
    ctx.lineTo(S * 0.5, y + rh * 0.3);
    ctx.lineTo(S * 0.92, y + rh * 0.72);
    ctx.stroke();
    // guide horn shadow (center)
    ctx.fillStyle = '#101012';
    ctx.fillRect(S * 0.46, y + rh * 0.15, S * 0.08, rh * 0.5);
    // wear highlights on contact ridge
    ctx.fillStyle = 'rgba(150,148,140,0.35)';
    for (let i = 0; i < 14; i++) ctx.fillRect(rng() * S, y + rh * (0.28 + rng() * 0.1), 3 + rng() * 8, 2);
    // mud/rust
    ctx.fillStyle = 'rgba(96,74,48,0.25)';
    for (let i = 0; i < 20; i++) {
      ctx.beginPath(); ctx.arc(rng() * S, y + rng() * rh, 1 + rng() * 4, 0, Math.PI * 2); ctx.fill();
    }
  }
  return c;
}

// Transparent marking decal canvases.
function paintDecal(kind, text) {
  const c = makeCanvas(256, 256);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  if (kind === 'star') {
    ctx.fillStyle = 'rgba(238,238,230,0.92)';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? 110 : 44;
      const x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill();
  } else if (kind === 'cross') {
    // Balkenkreuz: black-outlined open white cross.
    ctx.fillStyle = 'rgba(245,245,240,0.95)';
    ctx.fillRect(28, 96, 200, 64); ctx.fillRect(96, 28, 64, 200);
    ctx.fillStyle = 'rgba(20,20,20,0.95)';
    ctx.fillRect(52, 116, 152, 24); ctx.fillRect(116, 52, 24, 152);
  } else if (kind === 'crossgrey') {
    ctx.strokeStyle = 'rgba(40,40,40,0.9)';
    ctx.lineWidth = 20;
    ctx.strokeRect(48, 108, 160, 40); ctx.strokeRect(108, 48, 40, 160);
  } else { // number / text
    const len = Math.max(1, (text || '').length);
    ctx.font = `bold ${Math.min(120, Math.floor(380 / len))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(20,20,20,0.55)';
    ctx.strokeText(text || '', 128, 128);
    ctx.fillStyle = 'rgba(240,240,232,0.92)';
    ctx.fillText(text || '', 128, 128);
  }
  return c;
}

function canvasTex(canvas, { srgb = true, aniso = 4, repeat = false } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

/**
 * Build the full material set for one tank.
 * @param {object} spec TankSpec (reads spec.visual palette hints)
 * @param {object} engineCtx EngineCtx (§2.8) — setupShadowMaterial + anisotropy
 * @param {number} camoSeed deterministic camo seed
 * @returns {object} { hull, wheels, rubber, detail, dark, canvasCloth, wood,
 *   trackL, trackR, trackTexL, trackTexR, trackLinkM, decal(kind), burnt, dispose() }
 */
export function createTankMaterials(spec, engineCtx, camoSeed) {
  const setup = engineCtx && typeof engineCtx.setupShadowMaterial === 'function'
    ? (m) => engineCtx.setupShadowMaterial(m)
    : (m) => m;
  const aniso = (engineCtx && engineCtx.anisotropy) || 4;
  const rng = mulberry32(camoSeed | 0);
  const vis = spec.visual || { base: '#5a6b46', weather: '#6f7d55', scheme: 'solid', patches: [] };

  const disposables = [];
  const track = (r) => { disposables.push(r); return r; };

  const camoTex = track(canvasTex(paintCamo(makeCanvas(TEX_SIZE, TEX_SIZE), vis, rng), { aniso, repeat: true }));
  const roughTex = track(canvasTex(paintRoughness(makeCanvas(256, 256), rng), { srgb: false, aniso, repeat: true }));

  const hull = track(setup(new THREE.MeshStandardMaterial({
    map: camoTex, roughnessMap: roughTex, roughness: 1.0, metalness: 0.18,
  })));

  const baseRgb = hexToRgb(vis.base);
  const wheels = track(setup(new THREE.MeshStandardMaterial({
    color: new THREE.Color(rgb(scale3(baseRgb, 0.8))).getHex(),
    roughness: 0.62, metalness: 0.3,
  })));
  const rubber = track(setup(new THREE.MeshStandardMaterial({
    color: 0x1b1b1d, roughness: 0.92, metalness: 0.05,
  })));
  const detail = track(setup(new THREE.MeshStandardMaterial({
    color: 0x3c3c40, roughness: 0.5, metalness: 0.65,
  })));
  const dark = track(setup(new THREE.MeshStandardMaterial({
    color: 0x191a1c, roughness: 0.6, metalness: 0.55,
  })));
  const canvasCloth = track(setup(new THREE.MeshStandardMaterial({
    color: 0x6f6a52, roughness: 0.95, metalness: 0.0,
  })));
  const wood = track(setup(new THREE.MeshStandardMaterial({
    color: 0x6b543a, roughness: 0.88, metalness: 0.0,
  })));
  const burnt = track(setup(new THREE.MeshStandardMaterial({
    color: 0x171412, roughness: 0.96, metalness: 0.08,
  })));

  // Independent L/R track textures so each side scrolls on its own offset.
  const trackCanvas = paintTrack(mulberry32((camoSeed | 0) + 17));
  const trackTexL = track(canvasTex(trackCanvas, { aniso, repeat: true }));
  const trackTexR = track(canvasTex(trackCanvas, { aniso, repeat: true }));
  const trackMatOpts = { roughness: 0.78, metalness: 0.5 };
  const trackL = track(setup(new THREE.MeshStandardMaterial({ map: trackTexL, ...trackMatOpts })));
  const trackR = track(setup(new THREE.MeshStandardMaterial({ map: trackTexR, ...trackMatOpts })));

  const decalCache = new Map();
  const decal = (kind, text) => {
    const key = `${kind}:${text || ''}`;
    if (!decalCache.has(key)) {
      const t = track(canvasTex(paintDecal(kind, text), { aniso }));
      const m = track(setup(new THREE.MeshStandardMaterial({
        map: t, transparent: true, roughness: 0.8, metalness: 0.1,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
        depthWrite: false,
      })));
      decalCache.set(key, m);
    }
    return decalCache.get(key);
  };

  return {
    hull, wheels, rubber, detail, dark, canvasCloth, wood, burnt,
    trackL, trackR, trackTexL, trackTexR,
    trackLinkM: 0.165 * 4, // meters of track per full texture repeat (4 links)
    decal,
    dispose() { for (const r of disposables) r.dispose(); },
  };
}
