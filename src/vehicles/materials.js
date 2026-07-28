// src/vehicles/materials.js — HD procedural camo + surface materials for tankFactory.
// Vehicles-internal (ARCHITECTURE §3.3.3). All albedo canvases are sRGB; every lit
// material passes through engineCtx.setupShadowMaterial.
// 2048px albedo with panel lines / weld seams / bolt rows / chips / rust streaks,
// plus a 1024px detail heightfield that generates matching normal + roughness maps.
// Expensive canvases are cached per spec id (shared between instances, refcounted).
// No top-level side effects — canvases are created inside createTankMaterials.

import * as THREE from 'three';

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

const ALBEDO_SIZE = 2048;
const MAP_SIZE = 1024;

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

// Smooth rounded organic blob as a reusable Path2D (quadratic midpoint spline),
// horizontally stretched like real NATO splotches.
function blobPath2D(rng, x, y, r, lobes = 9, jitter = 0.55) {
  const sx = 1.25 + rng() * 0.6;
  const pts = [];
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2;
    const rr = r * (1 - jitter / 2 + rng() * jitter);
    pts.push([x + Math.cos(a) * rr * sx, y + Math.sin(a) * rr * 0.78]);
  }
  const p = new Path2D();
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let m = mid(pts[lobes - 1], pts[0]);
  p.moveTo(m[0], m[1]);
  for (let i = 0; i < lobes; i++) {
    const n = mid(pts[i], pts[(i + 1) % lobes]);
    p.quadraticCurveTo(pts[i][0], pts[i][1], n[0], n[1]);
  }
  p.closePath();
  return p;
}

// Angular straight-edged blob (Path2D) — desert/splinter patch language.
// Same wrap contract as blobPath2D but with hard polygonal facets.
function polyPath2D(rng, x, y, r, lobes = 6, jitter = 0.6) {
  const sx = 1.2 + rng() * 0.9;
  const p = new Path2D();
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 + (rng() - 0.5) * (Math.PI / lobes);
    const rr = r * (1 - jitter / 2 + rng() * jitter);
    const px = x + Math.cos(a) * rr * sx, py = y + Math.sin(a) * rr * 0.8;
    if (i === 0) p.moveTo(px, py); else p.lineTo(px, py);
  }
  p.closePath();
  return p;
}

// Elongated multi-lobe ANGULAR camo patch (Path2D): 2-4 straight-edged lobes
// strung along one direction, each lobe itself stretched — the sprayed
// military patch silhouette (NATO Gefechtstarnung / MERDC / Hinterhalt):
// directional, angular, hard-edged, with concave bites where lobes meet.
// Replaces the single rounded blob stamps that read as leopard/cow spots at
// garage distance (r7 factory/summer morphology critique). Overlapping
// same-winding subpaths union under the default nonzero fill rule.
function camoPatchPath2D(rng, x, y, r, ang) {
  const p = new Path2D();
  const lobeN = 2 + ((rng() * 3) | 0);
  const step = r * (0.85 + rng() * 0.5);
  let a = ang + (rng() - 0.5) * 0.2;
  let cx = x - Math.cos(a) * step * (lobeN - 1) * 0.5;
  let cy = y - Math.sin(a) * step * (lobeN - 1) * 0.5;
  for (let l = 0; l < lobeN; l++) {
    const lr = r * (0.55 + rng() * 0.55);
    const stretch = 1.5 + rng() * 0.9;           // per-lobe elongation
    const sides = 5 + ((rng() * 3) | 0);
    const cosA = Math.cos(a), sinA = Math.sin(a);
    for (let i = 0; i < sides; i++) {
      const t = (i / sides) * Math.PI * 2 + (rng() - 0.5) * (Math.PI / sides);
      let rr = lr * (0.6 + rng() * 0.6);
      if (rng() < 0.16) rr *= 0.5;               // concave notch facet
      const ex = Math.cos(t) * rr * stretch, ey = Math.sin(t) * rr * 0.8;
      const px = cx + ex * cosA - ey * sinA;
      const py = cy + ex * sinA + ey * cosA;
      if (i === 0) p.moveTo(px, py); else p.lineTo(px, py);
    }
    p.closePath();
    a += (rng() - 0.5) * 0.55;                   // spine wanders slightly
    cx += Math.cos(a) * step;
    cy += Math.sin(a) * step;
  }
  return p;
}

// Fill a Path2D 9 times (3x3 tile offsets) so the pattern wraps seamlessly.
function fillWrapped(ctx, S, path, style) {
  ctx.fillStyle = style;
  for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
    ctx.save(); ctx.translate(dx, dy); ctx.fill(path); ctx.restore();
  }
}
function strokeWrapped(ctx, S, path, style, width) {
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
    ctx.save(); ctx.translate(dx, dy); ctx.stroke(path); ctx.restore();
  }
}

// Fast inline-LCG per-pixel grain (rng() call per pixel is too slow at 2048²).
function applyGrain(ctx, S, seed, amp) {
  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;
  let s0 = (seed >>> 0) || 1;
  for (let i = 0; i < d.length; i += 4) {
    s0 = (s0 * 1664525 + 1013904223) >>> 0;
    const n = (((s0 >>> 16) & 255) - 128) * amp;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------------------
// Plate feature plan — one deterministic description shared by the albedo,
// height, and roughness painters so panel lines / welds / bolts line up
// across all three maps. Coordinates are 0..1 of the repeat tile.
// ---------------------------------------------------------------------------
function genPlateFeatures(rng) {
  const f = { hLines: [], vLines: [], rings: [], chips: [], streaks: [] };
  // Panel joins are sparse and broken (1-2 gaps per run) so plates don't read
  // as a uniform tile grid across big hull sides.
  const mkGaps = () => {
    const gaps = [];
    const n = 1 + ((rng() * 2) | 0);
    for (let k = 0; k < n; k++) {
      const s = 0.12 + rng() * 0.66;
      gaps.push([s, Math.min(0.92, s + 0.08 + rng() * 0.18)]);
    }
    return gaps.sort((a, b) => a[0] - b[0]);
  };
  const nH = 3 + ((rng() * 2) | 0), nV = 3 + ((rng() * 2) | 0);
  for (let i = 0; i < nH; i++) {
    f.hLines.push({ p: (i + 0.12 + rng() * 0.76) / nH, weld: rng() < 0.42, bolts: rng() < 0.45, gaps: mkGaps() });
  }
  for (let i = 0; i < nV; i++) {
    f.vLines.push({ p: (i + 0.12 + rng() * 0.76) / nV, weld: rng() < 0.42, bolts: rng() < 0.35, gaps: mkGaps() });
  }
  // bolt rings (hatch / plate access circles)
  const nR = 2 + ((rng() * 3) | 0);
  for (let i = 0; i < nR; i++) {
    f.rings.push({ x: 0.1 + rng() * 0.8, y: 0.1 + rng() * 0.8, r: 0.022 + rng() * 0.03, n: 8 + ((rng() * 6) | 0) });
  }
  // chips clustered near lines and edges
  for (let i = 0; i < 260; i++) {
    let x = rng(), y = rng();
    if (rng() < 0.55) {                     // snap toward a random line
      if (rng() < 0.5 && f.hLines.length) { y = f.hLines[(rng() * f.hLines.length) | 0].p + (rng() - 0.5) * 0.02; }
      else if (f.vLines.length) { x = f.vLines[(rng() * f.vLines.length) | 0].p + (rng() - 0.5) * 0.02; }
    }
    f.chips.push({ x, y, r: 0.0008 + rng() * 0.0028, metal: rng() < 0.42 });
  }
  // rust weep sources — some at bolts, some free
  for (let i = 0; i < 16; i++) {
    f.streaks.push({ x: rng(), y: rng(), len: 0.02 + rng() * 0.06, w: 0.001 + rng() * 0.002 });
  }
  return f;
}

// Un-gapped spans of a panel line, as [start, end] fractions.
function lineSegs(line) {
  const segs = [];
  let cur = 0;
  for (const [g0, g1] of line.gaps || []) {
    if (g0 > cur) segs.push([cur, g0]);
    cur = Math.max(cur, g1);
  }
  if (cur < 1) segs.push([cur, 1]);
  return segs;
}
const inGap = (line, t) => (line.gaps || []).some(([g0, g1]) => t >= g0 && t <= g1);

// ---------------------------------------------------------------------------
// Albedo (2048) — camo scheme base + feature overlay + weathering.
// ---------------------------------------------------------------------------
function paintCamo(canvas, visual, rng, feats, seed) {
  const ctx = canvas.getContext('2d');
  const S = canvas.width;
  const base = hexToRgb(visual.base);
  const weather = hexToRgb(visual.weather || visual.base);
  const patches = (visual.patches || []).map(hexToRgb);

  // World-size normalization (r7): camoScale is UV repeats per meter (boxUV
  // in tankFactory), so a tank at the 0.34 default spreads one tile over ~3 m
  // and reference-size patches balloon past the hull flank height — desert /
  // summer mushed into a near-uniform tint wash on the T-34. `wk` rescales
  // patch geometry so patches cover the SAME world meters everywhere
  // (authored against the 0.5 repeats/m reference; capped at 1 so the
  // hand-tuned 0.55/0.6 tanks keep their look), and `nK` adds patches back as
  // they shrink so coverage density stays constant.
  const wk = Math.min(1, (visual.camoScale != null ? visual.camoScale : 0.34) / 0.5);
  const nK = Math.min(2.2, 1 / (wk * wk));

  ctx.fillStyle = rgb(base);
  ctx.fillRect(0, 0, S, S);

  // Large soft tonal variation toward the weathered tone.
  for (let i = 0; i < 30; i++) {
    const x = rng() * S, y = rng() * S, r = S * (0.10 + rng() * 0.22);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const t = 0.25 + rng() * 0.45;
    g.addColorStop(0, rgb(mix(base, weather, t), 0.5));
    g.addColorStop(1, rgb(base, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Mid-frequency mottle so large plates never read as one flat color.
  for (let i = 0; i < 90; i++) {
    const x = rng() * S, y = rng() * S, r = S * (0.015 + rng() * 0.04);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dir = rng() < 0.5 ? 0.92 : 1.07;
    g.addColorStop(0, rgb(scale3(base, dir), 0.22));
    g.addColorStop(1, rgb(base, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const scheme = visual.scheme || 'solid';
  if (scheme === 'stripes' && patches.length) {
    // Dunkelgelb with sprayed Olivgruen/Rotbraun camo: hard-edged angular
    // patches ELONGATED along the band diagonal (crews swept the gun along
    // one direction), linked by long spray bands. Rounded soft-edged blob
    // stamps read as cow spots at garage distance (r7 morphology critique);
    // the overspray rim stays a tight stroke straddling the hard core edge.
    const bandAng = 0.9 + rng() * 0.5;                   // one direction per tank
    const nP0 = Math.round(11 * nK);
    for (let i = 0; i < nP0; i++) {
      const col = mix(patches[i % patches.length], base, 0.10);
      const r = S * wk * (i < nP0 * 0.3 ? 0.085 + rng() * 0.055 : 0.032 + rng() * 0.05);
      const x = rng() * S, y = rng() * S;
      const p = camoPatchPath2D(rng, x, y, r, bandAng + (rng() - 0.5) * 0.5);
      strokeWrapped(ctx, S, p, rgb(col, 0.28), S * 0.006);   // tight overspray rim
      fillWrapped(ctx, S, p, rgb(col, 0.93));
    }
    // Spray bands: LONG thin strokes at ONE consistent diagonal per vehicle
    // (small jitter only) — crews swept the spray gun in parallel passes, so
    // the bands read as a directional stripe scheme, never as random daubs
    // (r6 "finger-paint" critique).
    for (let i = 0; i < Math.round(20 * nK); i++) {
      const col = mix(patches[i % patches.length], base, 0.12);
      const x0 = rng() * S, y0 = rng() * S;
      const ang = bandAng + (rng() - 0.5) * 0.22;
      const len = S * wk * (0.20 + rng() * 0.24);
      const w = S * wk * (0.013 + rng() * 0.014);
      const bend = (rng() - 0.5) * w * 6;
      const mx = x0 + Math.cos(ang) * len * 0.5 - Math.sin(ang) * bend;
      const my = y0 + Math.sin(ang) * len * 0.5 + Math.cos(ang) * bend;
      const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
      const path = new Path2D();
      path.moveTo(x0, y0);
      path.quadraticCurveTo(mx, my, x1, y1);
      strokeWrapped(ctx, S, path, rgb(col, 0.20), w * 1.8);      // overspray halo
      strokeWrapped(ctx, S, path, rgb(col, 0.8), w);
    }
  } else if (scheme === 'ambush' && patches.length) {
    // Hinterhalt-Tarnung (the Panther 'ambush' factory scheme): angular
    // Olivgruen/Rotbraun patches elongated along one spray direction over
    // Dunkelgelb, with LIGHT Dunkelgelb dots INSIDE the dark patches and dark
    // dots on the light base between them — the historical dappled-canopy
    // language. (r7: uniform rounded blobs + random confetti dots everywhere
    // read as orange/green cow spots.)
    const dirA = rng() * Math.PI;
    const drawn = [];
    const nP = Math.round(14 * nK);
    for (let i = 0; i < nP; i++) {
      const col = mix(patches[i % patches.length], base, 0.06);
      const r = S * wk * (i < nP * 0.35 ? 0.080 + rng() * 0.050 : 0.042 + rng() * 0.038);
      const x = rng() * S, y = rng() * S;
      const p = camoPatchPath2D(rng, x, y, r, dirA + (rng() - 0.5) * 0.55);
      strokeWrapped(ctx, S, p, rgb(mix(col, base, 0.35), 0.45), S * 0.0045);
      fillWrapped(ctx, S, p, rgb(col, 0.94));
      drawn.push({ p, x, y, r });
    }
    const dotWrap = (x, y, r2) => {
      for (const ox of [-S, 0, S]) {
        for (const oy of [-S, 0, S]) {
          ctx.beginPath(); ctx.arc(x + ox, y + oy, r2, 0, Math.PI * 2); ctx.fill();
        }
      }
    };
    // light dots INSIDE the dark patches (sun dapple on the dark tones)
    ctx.fillStyle = rgb(mix(base, [235, 224, 178], 0.18), 0.92);
    for (const d of drawn) {
      const n = 12 + ((rng() * 12) | 0);
      let placed = 0, guard = 0;
      while (placed < n && guard++ < n * 8) {
        const px2 = d.x + (rng() - 0.5) * d.r * 3.6;
        const py2 = d.y + (rng() - 0.5) * d.r * 2.6;
        if (!ctx.isPointInPath(d.p, px2, py2)) continue;
        dotWrap(px2, py2, S * (0.0028 + rng() * 0.0032));
        placed++;
      }
    }
    // dark dots on the base BETWEEN patches (never on the patches — dots on
    // everything is what mushed the scheme into confetti)
    for (let i = 0; i < 240; i++) {
      const x = rng() * S, y = rng() * S;
      let inside = false;
      for (const d of drawn) { if (ctx.isPointInPath(d.p, x, y)) { inside = true; break; } }
      if (inside) continue;
      ctx.fillStyle = rgb(patches[(rng() * patches.length) | 0], 0.88);
      dotWrap(x, y, S * (0.0026 + rng() * 0.0030));
    }
  } else if (scheme === 'nato' && patches.length) {
    // NATO 3-colour (Bundeswehr Gefechtstarnung / MERDC family): angular
    // ELONGATED patches swept along one per-vehicle direction at 2-3 scales —
    // brown field patches first, then sparse black riding the brown
    // boundaries the way the real scheme shadows them. Hard cores with a
    // tight sprayed rim. (r7: same-size rounded soft blobs read leopard-print
    // at garage distance.)
    const black = patches[0], brown = patches[1] || patches[0];
    const dirA = rng() * Math.PI;
    const centers = [];
    const nBrown = Math.round(11 * nK);
    for (let i = 0; i < nBrown; i++) {
      const r = S * wk * (i < nBrown * 0.4 ? 0.080 + rng() * 0.050 : 0.036 + rng() * 0.034);
      const x = rng() * S, y = rng() * S;
      const p = camoPatchPath2D(rng, x, y, r, dirA + (rng() - 0.5) * 0.55);
      strokeWrapped(ctx, S, p, rgb(mix(brown, base, 0.30), 0.45), S * 0.0045);
      fillWrapped(ctx, S, p, rgb(brown, 0.97));
      centers.push([x, y, r]);
    }
    const nBlack = Math.round(8 * nK);
    for (let i = 0; i < nBlack; i++) {
      const r = S * wk * (i < nBlack * 0.3 ? 0.055 + rng() * 0.035 : 0.026 + rng() * 0.026);
      let x = rng() * S, y = rng() * S;
      if ((i & 1) && centers.length) {           // ride a brown patch boundary
        const c2 = centers[(rng() * centers.length) | 0];
        const a2 = rng() * Math.PI * 2;
        x = c2[0] + Math.cos(a2) * c2[2] * 1.2;
        y = c2[1] + Math.sin(a2) * c2[2] * 0.9;
      }
      const p = camoPatchPath2D(rng, x, y, r, dirA + (rng() - 0.5) * 0.7);
      strokeWrapped(ctx, S, p, rgb(mix(black, base, 0.30), 0.45), S * 0.0045);
      fillWrapped(ctx, S, p, rgb(black, 0.95));
    }
  } else if (scheme === 'desert' && patches.length) {
    // Desert: hard-edged multi-scale 3-tone geometry — broad low-contrast
    // diagonal wind bands under angular polygon patches at three scales plus
    // thin dark streaks. Replaces the r1 same-size-ellipse "cheetah print".
    const dark = patches[0], mid2 = patches[1] || patches[0];
    const pale = patches[2] || mix(base, [255, 250, 235], 0.35);
    for (let i = 0; i < 5; i++) {                                 // band layer
      const y0 = rng() * S, slope = (rng() - 0.5) * 0.6;
      const w = S * wk * (0.10 + rng() * 0.10);
      const path = new Path2D();
      path.moveTo(-S * 0.1, y0);
      path.quadraticCurveTo(S * 0.5, y0 + slope * S * 0.5 + (rng() - 0.5) * S * 0.09,
        S * 1.1, y0 + slope * S);
      strokeWrapped(ctx, S, path, rgb(mix(rng() < 0.5 ? mid2 : pale, base, 0.45), 0.30), w);
    }
    // Large patches at ~2x the r5 scale and near-opaque, with a stronger
    // lightness split between tones: the 3-tone geometry has to survive
    // mipping at garage distance instead of washing to a uniform tan
    // (r6 "near-uniform tan wash" critique).
    const darkHC = scale3(dark, 0.74);                            // push contrast
    const paleHC = mix(pale, [255, 252, 238], 0.35);
    // patch geometry rides wk/nK so the 3-tone shapes stay hull-scale on
    // every tank (r7: on the T-34 the tile spans ~3 m and single patches
    // swallowed the whole flank -> flat tan wash)
    const nBig = Math.round(4 * nK);
    for (let i = 0; i < nBig; i++) {                              // large angular patches
      const r = S * wk * (0.16 + rng() * 0.10);
      const x = rng() * S, y = rng() * S;
      const col = i % 2 ? mid2 : darkHC;
      fillWrapped(ctx, S, polyPath2D(rng, x, y, r * 1.04, 7, 0.55), rgb(mix(col, base, 0.5), 0.5));
      fillWrapped(ctx, S, polyPath2D(rng, x, y, r, 7, 0.55), rgb(col, 0.96));
    }
    for (let i = 0; i < Math.round(7 * nK); i++) {                // mid shards
      const r = S * wk * (0.06 + rng() * 0.06);
      const col = [darkHC, mid2, paleHC][(rng() * 3) | 0];
      fillWrapped(ctx, S, polyPath2D(rng, rng() * S, rng() * S, r, 5, 0.7), rgb(col, 0.94));
    }
    for (let i = 0; i < Math.round(20 * nK); i++) {               // small flecks
      const r = S * wk * (0.012 + rng() * 0.02);
      fillWrapped(ctx, S, polyPath2D(rng, rng() * S, rng() * S, r, 4, 0.8),
        rgb(rng() < 0.5 ? darkHC : paleHC, 0.85));
    }
    for (let i = 0; i < Math.round(14 * nK); i++) {               // thin streaks
      const x0 = rng() * S, y0 = rng() * S, len = S * wk * (0.05 + rng() * 0.1);
      const a2 = rng() * Math.PI;
      const path = new Path2D();
      path.moveTo(x0, y0);
      path.lineTo(x0 + Math.cos(a2) * len, y0 + Math.sin(a2) * len * 0.5);
      strokeWrapped(ctx, S, path, rgb(dark, 0.6), 1.5 + rng() * 3);
    }
  } else if (scheme === 'winter') {
    // ===================== CAMO PATTERN SECTION =====================
    // Winter wash: streaky hand-brushed whitewash over the factory paint.
    // patches[0] carries the underlying factory color that shows through
    // worn edges; broad translucent vertical strokes read as brush work.
    const under = patches.length ? patches[0] : [70, 80, 55];
    for (let i = 0; i < 90; i++) {
      const x0 = rng() * S, y0 = rng() * S;
      const len = S * (0.08 + rng() * 0.2);
      const w = S * (0.012 + rng() * 0.03);
      const path = new Path2D();
      path.moveTo(x0, y0);
      path.quadraticCurveTo(x0 + (rng() - 0.5) * w * 3, y0 + len * 0.5, x0 + (rng() - 0.5) * w * 4, y0 + len);
      strokeWrapped(ctx, S, path, 'rgba(235,238,232,0.22)', w * 1.5);
      strokeWrapped(ctx, S, path, 'rgba(244,246,240,0.30)', w);
    }
    // worn-through patches revealing the base vehicle paint
    for (let i = 0; i < 26; i++) {
      const r = S * (0.012 + rng() * 0.035);
      const p = blobPath2D(rng, rng() * S, rng() * S, r);
      fillWrapped(ctx, S, p, rgb(under, 0.28 + rng() * 0.4));
    }
    // cold grey-blue shadow washes so the wash never reads as flat white
    for (let i = 0; i < 18; i++) {
      const x = rng() * S, y = rng() * S, r = S * (0.05 + rng() * 0.12);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(120,130,138,0.14)');
      g.addColorStop(1, 'rgba(120,130,138,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  } else if (scheme === 'fleck' && patches.length) {
    // Flecktarn: dense small hard-edged dapples of every patch color, with a
    // sparse second pass of larger blotches to break the dot uniformity.
    for (let pass = 0; pass < patches.length; pass++) {
      const col = patches[pass];
      ctx.fillStyle = rgb(col, 0.9);
      for (let i = 0; i < 620; i++) {
        const x = rng() * S, y = rng() * S;
        const r = S * (0.0035 + rng() * 0.007);
        ctx.beginPath();
        ctx.ellipse(x, y, r * (0.7 + rng() * 0.8), r * (0.6 + rng() * 0.7), rng() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < 14; i++) {
        const r = S * (0.016 + rng() * 0.03);
        fillWrapped(ctx, S, blobPath2D(rng, rng() * S, rng() * S, r), rgb(col, 0.75));
      }
    }
    // ===================== END CAMO PATTERN SECTION =================
  } else if (scheme === 'digital' && patches.length) {
    // Blocky digital-edge clusters, 2-3 octave. r7 pixel-scale fix: the old
    // 12x12 grid of 30-rect clusters merged into ~30 cm mega-pixels that read
    // as cartoon confetti at garage distance. Real digital schemes resolve at
    // ~8-12 cm per visual cluster: tighter 16x16 stratified grid, ±2-cell
    // spread, fewer rects per cluster, plus a sparse fine-grain octave. Cell
    // math: one repeat tile spans 1/camoScale meters, so cellsPerTile scales
    // with wk to hold world size across tanks.
    const cells = Math.max(96, Math.round(128 / Math.max(wk, 0.5)));
    const cell = S / cells;
    const GRID = 16;
    let ci = 0;
    for (let gy = 0; gy < GRID; gy++) {
      for (let gx = 0; gx < GRID; gx++) {
        const col = patches[ci++ % patches.length];
        const cx = (((gx + rng()) * cells) / GRID) | 0;
        const cy = (((gy + rng()) * cells) / GRID) | 0;
        ctx.fillStyle = rgb(col, 0.92);
        for (let k = 0; k < 12; k++) {
          const dx = ((rng() * 5) | 0) - 2, dy = ((rng() * 5) | 0) - 2;
          const px2 = ((((cx + dx) * cell) % S) + S) % S;
          const py2 = ((((cy + dy) * cell) % S) + S) % S;
          const rw = cell * (1 + ((rng() * 2) | 0));
          for (const ox of [0, -S]) {
            for (const oy of [0, -S]) ctx.fillRect(px2 + ox, py2 + oy, rw, cell);
          }
        }
      }
    }
    // fine-grain octave: lone cells peppered between clusters
    for (let i = 0; i < 700; i++) {
      const col = patches[(rng() * patches.length) | 0];
      ctx.fillStyle = rgb(col, 0.85);
      const px2 = ((rng() * cells) | 0) * cell, py2 = ((rng() * cells) | 0) * cell;
      ctx.fillRect(px2, py2, cell, cell);
    }
  }

  // Zimmerit: barely-there albedo modulation only — the ridge relief lives in
  // the normal map. (Strong albedo stripes read as corduroy/knit fabric at
  // closeup range — r5 critique.)
  if (visual.zimmerit) {
    // r7 scale fix: ridges at ~1/3 the old pitch — real zimmerit rows are
    // ~1 cm; the S/340 rows read as corrugated cardboard at pedestal range.
    const pitch = Math.max(2, (S / 900) | 0);
    for (let y = 0; y < S; y += pitch) {
      ctx.fillStyle = `rgba(0,0,0,${0.012 + 0.015 * rng()})`;
      ctx.fillRect(0, y, S, 1);
    }
    // faint vertical trowel-section seams so the coating reads as applied
    // in hand-worked strips rather than machine-knit rows
    let x = 0;
    while (x < S) {
      x += (S / 22) * (0.7 + rng() * 0.8);
      ctx.fillStyle = 'rgba(0,0,0,0.035)';
      ctx.fillRect(x, 0, 1.2, S);
    }
  }

  applyGrain(ctx, S, seed ^ 0x51ab, 0.075);

  // ---- plate feature overlay (matches height/roughness maps) --------------
  const px = (v) => v * S;
  // panel lines: dark recess + light catch-edge below
  ctx.lineCap = 'butt';
  const lw = Math.max(2, S / 800);
  for (const l of feats.hLines) {
    const y = px(l.p);
    for (const [a, b] of lineSegs(l)) {
      ctx.fillStyle = 'rgba(10,10,8,0.40)'; ctx.fillRect(px(a), y, px(b - a), lw);
      ctx.fillStyle = 'rgba(255,250,235,0.12)'; ctx.fillRect(px(a), y + lw, px(b - a), 1.5);
    }
  }
  for (const l of feats.vLines) {
    const x = px(l.p);
    for (const [a, b] of lineSegs(l)) {
      ctx.fillStyle = 'rgba(10,10,8,0.40)'; ctx.fillRect(x, px(a), lw, px(b - a));
      ctx.fillStyle = 'rgba(255,250,235,0.12)'; ctx.fillRect(x + lw, px(a), 1.5, px(b - a));
    }
  }
  // weld beads: dashed light/dark stitch straddling the line
  const weldDash = (horiz, l) => {
    const p = l.p;
    const step = S / 160;
    for (let t = 0; t < S; t += step) {
      if (inGap(l, t / S)) continue;
      const jit = (rng() - 0.5) * step * 0.3;
      const a = 0.16 + rng() * 0.14;
      ctx.fillStyle = `rgba(225,220,205,${a})`;
      if (horiz) ctx.fillRect(t + jit, px(p) - S / 700, step * 0.55, S / 350);
      else ctx.fillRect(px(p) - S / 700, t + jit, S / 350, step * 0.55);
      ctx.fillStyle = `rgba(20,18,14,${a * 0.8})`;
      if (horiz) ctx.fillRect(t + jit + step * 0.3, px(p) + S / 700, step * 0.3, 1.5);
      else ctx.fillRect(px(p) + S / 700, t + jit + step * 0.3, 1.5, step * 0.3);
    }
  };
  for (const l of feats.hLines) if (l.weld) weldDash(true, l);
  for (const l of feats.vLines) if (l.weld) weldDash(false, l);
  // bolts along lines: dome highlight + drop shadow
  const bolt = (x, y, r) => {
    ctx.fillStyle = 'rgba(8,8,6,0.5)';
    ctx.beginPath(); ctx.arc(x + r * 0.25, y + r * 0.4, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(230,226,210,0.32)';
    ctx.beginPath(); ctx.arc(x - r * 0.2, y - r * 0.28, r * 0.62, 0, Math.PI * 2); ctx.fill();
  };
  const boltR = Math.max(3, S / 340);
  for (const l of feats.hLines) if (l.bolts) {
    const step = S / 26;
    for (let t = step / 2; t < S; t += step) if (!inGap(l, t / S)) bolt(t, px(l.p) + boltR * 2.4, boltR);
  }
  for (const l of feats.vLines) if (l.bolts) {
    const step = S / 26;
    for (let t = step / 2; t < S; t += step) if (!inGap(l, t / S)) bolt(px(l.p) + boltR * 2.4, t, boltR);
  }
  for (const ring of feats.rings) {
    for (let k = 0; k < ring.n; k++) {
      const a = (k / ring.n) * Math.PI * 2;
      bolt(px(ring.x) + Math.cos(a) * px(ring.r), px(ring.y) + Math.sin(a) * px(ring.r), boltR * 0.9);
    }
  }

  // Weathering: soft grime blotches.
  for (let i = 0; i < 16; i++) {
    const x = rng() * S, y = rng() * S, r = S * (0.05 + rng() * 0.12);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(18,16,12,0.13)');
    g.addColorStop(1, 'rgba(18,16,12,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // dust + dark oil streaks (canvas +y == world down on side plates).
  // Light dust streaks stay near the base hue and low alpha: 240 strokes of
  // brightened weather tone at 0.13 glazed a pastel film over the pattern —
  // desert/summer flanks bleached toward one flat tint (r7 wash critique).
  const dustCol = rgb(scale3(mix(weather, base, 0.4), 1.14), 0.09);
  for (let i = 0; i < 240; i++) {
    const x = rng() * S, y = rng() * S, len = S * (0.03 + rng() * 0.12);
    ctx.strokeStyle = rng() < 0.45 ? 'rgba(30,26,20,0.13)' : dustCol;
    ctx.lineWidth = 1 + rng() * 3;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rng() - 0.5) * 8, y + len); ctx.stroke();
  }
  // paint chips — dark pit with a bright bare-metal glint above (from plan).
  for (const c of feats.chips) {
    const x = px(c.x), y = px(c.y), r = Math.max(0.8, px(c.r));
    ctx.fillStyle = c.metal ? 'rgba(112,110,102,0.72)' : 'rgba(25,22,18,0.55)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    if (c.metal) {
      ctx.fillStyle = 'rgba(205,200,185,0.75)';
      ctx.fillRect(x - r * 0.55, y - r - 1.2, r * 1.1, 1.8);
    }
  }
  // rust weeps from plan sources + below some bolts.
  const weep = (x, y, len, w) => {
    const g = ctx.createLinearGradient(x, y, x, y + len);
    g.addColorStop(0, 'rgba(122,64,28,0.42)');
    g.addColorStop(1, 'rgba(122,64,28,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, Math.max(1.4, w), len);
  };
  for (const s of feats.streaks) weep(px(s.x), px(s.y), px(s.len), px(s.w));
  for (const ring of feats.rings) {
    if (rng() < 0.6) weep(px(ring.x) + px(ring.r) * 0.6, px(ring.y) + px(ring.r), S * (0.02 + rng() * 0.04), 2);
  }
  return canvas;
}

// ---------------------------------------------------------------------------
// Detail heightfield (1024) — the source for the normal map. Mid-gray base,
// casting noise, plate offsets, panel-line grooves, weld beads, bolt domes,
// chips, optional zimmerit ridging.
// ---------------------------------------------------------------------------
function paintHeight(canvas, visual, rng, feats, seed) {
  const ctx = canvas.getContext('2d');
  const S = canvas.width;
  ctx.fillStyle = 'rgb(128,128,128)';
  ctx.fillRect(0, 0, S, S);

  // rolled-steel / casting undulation: large soft bumps
  for (let i = 0; i < 130; i++) {
    const x = rng() * S, y = rng() * S, r = S * (0.02 + rng() * 0.09);
    const up = rng() < 0.5;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, up ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)');
    g.addColorStop(1, 'rgba(128,128,128,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // subtle per-panel height offsets so plates read as separate facets
  const px = (v) => v * S;
  const hs = [0, ...feats.hLines.map((l) => l.p), 1].sort((a, b) => a - b);
  const vs = [0, ...feats.vLines.map((l) => l.p), 1].sort((a, b) => a - b);
  for (let i = 0; i < hs.length - 1; i++) {
    for (let j = 0; j < vs.length - 1; j++) {
      const o = (rng() - 0.5) * 12;
      ctx.fillStyle = o > 0 ? `rgba(255,255,255,${o / 255})` : `rgba(0,0,0,${-o / 255})`;
      ctx.fillRect(px(vs[j]), px(hs[i]), px(vs[j + 1] - vs[j]), px(hs[i + 1] - hs[i]));
    }
  }

  // zimmerit: fine horizontal ridging broken into hand-worked vertical strips
  // (waffle sections with phase offsets), plus chipped-off patches — subtle
  // high-frequency normal relief, not albedo stripes (r5 critique)
  if (visual.zimmerit) {
    // r7 scale fix: ~1/3 the old ridge pitch (real rows ~1 cm) and softer
    // relief — the coating should read as fine trowel texture, not cardboard.
    const pitch = Math.max(2, (S / 450) | 0);
    // vertical strip plan: ~22 hand-worked columns (~15 cm at hull scale)
    const cols = [];
    let cx = 0;
    while (cx < S) {
      const w = (S / 22) * (0.7 + rng() * 0.8);
      cols.push([cx, Math.min(cx + w, S), (rng() * pitch) | 0]);
      cx += w;
    }
    for (const [x0, x1, phase] of cols) {
      for (let y = -pitch; y < S; y += pitch) {
        ctx.fillStyle = 'rgba(255,255,255,0.11)';
        ctx.fillRect(x0, y + phase, x1 - x0, Math.max(1, pitch >> 1));
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(x0, y + phase + (pitch >> 1), x1 - x0, Math.max(1, pitch >> 1));
      }
      // groove between strips
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(x1 - 1, 0, 1.5, S);
    }
    for (let i = 0; i < 10; i++) {                      // chipped-off patches
      ctx.fillStyle = 'rgba(110,110,110,0.9)';
      ctx.fillRect(rng() * S, rng() * S, S * (0.015 + rng() * 0.035), S * (0.012 + rng() * 0.02));
    }
  }

  // grooves (dark) with soft shoulders, honoring the gap plan
  const groove = (horiz, l) => {
    const w = Math.max(2, S / 480);
    for (const [a, b] of lineSegs(l)) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      if (horiz) ctx.fillRect(px(a), px(l.p), px(b - a), w); else ctx.fillRect(px(l.p), px(a), w, px(b - a));
      ctx.fillStyle = 'rgba(0,0,0,0.20)';
      if (horiz) { ctx.fillRect(px(a), px(l.p) - w, px(b - a), w); ctx.fillRect(px(a), px(l.p) + w, px(b - a), w); }
      else { ctx.fillRect(px(l.p) - w, px(a), w, px(b - a)); ctx.fillRect(px(l.p) + w, px(a), w, px(b - a)); }
    }
  };
  for (const l of feats.hLines) groove(true, l);
  for (const l of feats.vLines) groove(false, l);

  // weld beads: bright stitch bumps
  const weld = (horiz, l) => {
    const step = S / 160, r = Math.max(1.6, S / 620);
    for (let t = 0; t < S; t += step) {
      if (inGap(l, t / S)) continue;
      ctx.fillStyle = `rgba(255,255,255,${0.30 + rng() * 0.25})`;
      ctx.beginPath();
      if (horiz) ctx.arc(t + (rng() - 0.5) * step * 0.4, px(l.p), r, 0, Math.PI * 2);
      else ctx.arc(px(l.p), t + (rng() - 0.5) * step * 0.4, r, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  for (const l of feats.hLines) if (l.weld) weld(true, l);
  for (const l of feats.vLines) if (l.weld) weld(false, l);

  // bolt domes: bright circles with dark rim
  const boltR = Math.max(2, S / 340);
  const bolt = (x, y) => {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.arc(x, y, boltR * 1.25, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.arc(x, y, boltR * 0.7, 0, Math.PI * 2); ctx.fill();
  };
  for (const l of feats.hLines) if (l.bolts) {
    const step = S / 26;
    for (let t = step / 2; t < S; t += step) if (!inGap(l, t / S)) bolt(t, px(l.p) + boltR * 2.4);
  }
  for (const l of feats.vLines) if (l.bolts) {
    const step = S / 26;
    for (let t = step / 2; t < S; t += step) if (!inGap(l, t / S)) bolt(px(l.p) + boltR * 2.4, t);
  }
  for (const ring of feats.rings) {
    for (let k = 0; k < ring.n; k++) {
      const a = (k / ring.n) * Math.PI * 2;
      bolt(px(ring.x) + Math.cos(a) * px(ring.r), px(ring.y) + Math.sin(a) * px(ring.r));
    }
  }
  // chips: small pits
  for (const c of feats.chips) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.arc(px(c.x), px(c.y), Math.max(0.8, px(c.r) * 0.8), 0, Math.PI * 2); ctx.fill();
  }
  applyGrain(ctx, S, seed ^ 0x77e1, 0.05);
  return canvas;
}

// Sobel the heightfield into a tangent-space normal map (wrapping edges).
function heightToNormal(hCanvas, strength = 1.6) {
  const S = hCanvas.width;
  const src = hCanvas.getContext('2d').getImageData(0, 0, S, S).data;
  const out = makeCanvas(S, S);
  const octx = out.getContext('2d');
  const img = octx.createImageData(S, S);
  const d = img.data;
  const h = (x, y) => src[(((y + S) % S) * S + ((x + S) % S)) * 4];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) / 255;
      const dy = (h(x, y + 1) - h(x, y - 1)) / 255;
      let nx = -dx * strength, ny = dy * strength, nz = 1;
      const il = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= il; ny *= il; nz *= il;
      const i = (y * S + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

// Roughness map (1024) sharing the same feature plan: matte paint base, rough
// dust patches, smooth bare-metal chips/scuffs, slightly rough recesses.
function paintRoughness(canvas, rng, feats, base = 0.78) {
  const ctx = canvas.getContext('2d');
  const S = canvas.width;
  const v = (base * 255) | 0;
  ctx.fillStyle = `rgb(${v},${v},${v})`;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 700; i++) {
    const g = ((base + (rng() - 0.5) * 0.2) * 255) | 0;
    ctx.fillStyle = `rgba(${g},${g},${g},0.35)`;
    const r = 2 + rng() * 30;
    ctx.beginPath(); ctx.arc(rng() * S, rng() * S, r, 0, Math.PI * 2); ctx.fill();
  }
  // dust patches: rougher
  for (let i = 0; i < 60; i++) {
    const x = rng() * S, y = rng() * S, r = S * (0.02 + rng() * 0.07);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(240,240,240,0.35)');
    g.addColorStop(1, 'rgba(240,240,240,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const px = (u) => u * S;
  // recess lines slightly rougher (dust settles)
  ctx.fillStyle = 'rgba(235,235,235,0.5)';
  for (const l of feats.hLines) ctx.fillRect(0, px(l.p) - 1, S, Math.max(2, S / 480) + 2);
  for (const l of feats.vLines) ctx.fillRect(px(l.p) - 1, 0, Math.max(2, S / 480) + 2, S);
  // bare-metal chips + scuffs: smooth (dark)
  for (const c of feats.chips) {
    if (!c.metal) continue;
    const g = ((0.3 + rng() * 0.14) * 255) | 0;
    ctx.fillStyle = `rgba(${g},${g},${g},0.85)`;
    ctx.beginPath(); ctx.arc(px(c.x), px(c.y), Math.max(1, px(c.r)), 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 0; i < 200; i++) {
    const g = ((0.34 + rng() * 0.15) * 255) | 0;
    ctx.fillStyle = `rgba(${g},${g},${g},0.6)`;
    ctx.fillRect(rng() * S, rng() * S, 2 + rng() * 9, 1 + rng() * 2.5);
  }
  return canvas;
}

// One track texture: 4 link rows per repeat, chevron/waffle grousers.
function paintTrack(rng) {
  const S = 512;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#37373d';
  ctx.fillRect(0, 0, S, S);
  const rows = 4, rh = S / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * rh;
    // link body shading
    const g = ctx.createLinearGradient(0, y, 0, y + rh);
    g.addColorStop(0, '#53535a');
    g.addColorStop(0.45, '#404046');
    g.addColorStop(0.5, '#232327');
    g.addColorStop(0.55, '#424248');
    g.addColorStop(1, '#35353a');
    ctx.fillStyle = g;
    ctx.fillRect(0, y + 4, S, rh - 8);
    // pin gap + end-connector bumps
    ctx.fillStyle = '#0d0d0f';
    ctx.fillRect(0, y, S, 6);
    ctx.fillStyle = '#48484f';
    for (let x = 0; x < S; x += S / 8) ctx.fillRect(x + 4, y, S / 16, 5);
    // chevron grouser
    ctx.strokeStyle = '#5c5c64';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(S * 0.08, y + rh * 0.72);
    ctx.lineTo(S * 0.5, y + rh * 0.3);
    ctx.lineTo(S * 0.92, y + rh * 0.72);
    ctx.stroke();
    ctx.strokeStyle = '#232328';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(S * 0.08, y + rh * 0.78);
    ctx.lineTo(S * 0.5, y + rh * 0.36);
    ctx.lineTo(S * 0.92, y + rh * 0.78);
    ctx.stroke();
    // guide horn shadow (center)
    ctx.fillStyle = '#101012';
    ctx.fillRect(S * 0.46, y + rh * 0.15, S * 0.08, rh * 0.5);
    // wear highlights on contact ridge
    ctx.fillStyle = 'rgba(168,166,158,0.5)';
    for (let i = 0; i < 34; i++) ctx.fillRect(rng() * S, y + rh * (0.28 + rng() * 0.1), 5 + rng() * 14, 3);
    // mud/rust
    ctx.fillStyle = 'rgba(96,74,48,0.25)';
    for (let i = 0; i < 40; i++) {
      ctx.beginPath(); ctx.arc(rng() * S, y + rng() * rh, 2 + rng() * 7, 0, Math.PI * 2); ctx.fill();
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
  } else if (kind === 'soot') {
    // Exhaust soot smudge: dark core fading out plus streak fingers running
    // down the plate. Deterministic (no rng needed — decals are cached).
    const g = ctx.createRadialGradient(128, 108, 8, 128, 116, 118);
    g.addColorStop(0, 'rgba(22,20,17,0.72)');
    g.addColorStop(0.55, 'rgba(26,23,19,0.36)');
    g.addColorStop(1, 'rgba(26,23,19,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 12; i++) {
      const x = 34 + i * 17 + ((i * 37) % 9);
      const len = 60 + ((i * 53) % 78);
      const sg = ctx.createLinearGradient(0, 110, 0, 110 + len);
      sg.addColorStop(0, 'rgba(20,18,15,0.5)');
      sg.addColorStop(1, 'rgba(20,18,15,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(x, 110, 4 + (i % 3) * 3, len);
    }
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
    // ~0.68 gray, not near-white: at 200-400 m white hull numbers resolved to
    // single blown pixels scattered across the midfield (r2 terrain critique).
    ctx.fillStyle = 'rgba(174,172,162,0.92)';
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

// ---------------------------------------------------------------------------
// Per-spec texture cache: painting 2048px canvases + the Sobel pass is the
// expensive part, and every instance of a tank type can share the results.
// Refcounted so dispose() only frees GPU memory when the last user is gone.
// ---------------------------------------------------------------------------
const TEX_CACHE = new Map();

function acquireSharedTextures(spec, aniso) {
  const key = spec.id;
  let entry = TEX_CACHE.get(key);
  if (!entry) {
    const patternId = resolveCamoPattern(key);
    const vis = resolveCamoVisual(spec, patternId);
    const seed = 0x5eed ^ (key.split('').reduce((a, ch) => (a * 33 + ch.charCodeAt(0)) | 0, 7));
    const rng = mulberry32(seed);
    const feats = genPlateFeatures(rng);
    const camoCanvas = paintCamo(makeCanvas(ALBEDO_SIZE, ALBEDO_SIZE), vis, rng, feats, seed);
    const heightCanvas = paintHeight(makeCanvas(MAP_SIZE, MAP_SIZE), vis, rng, feats, seed);
    const normalCanvas = heightToNormal(heightCanvas, vis.zimmerit ? 2.0 : 2.6);
    const roughCanvas = paintRoughness(makeCanvas(MAP_SIZE, MAP_SIZE), rng, feats);
    const trackCanvas = paintTrack(mulberry32(seed + 17));
    entry = {
      refs: 0,
      // CAMO PATTERN SECTION: kept so applyCamoPatterns() can repaint the
      // shared albedo in place (all live instances update through the texture).
      // paintable: per-instance solid-color materials (road-wheel dishes,
      // fittings) that must follow the scheme on repaint (r1: lime-green
      // wheels under winter whitewash).
      spec, seed, feats, camoCanvas, patternId, paintable: new Set(),
      camoTex: canvasTex(camoCanvas, { aniso, repeat: true }),
      normalTex: canvasTex(normalCanvas, { srgb: false, aniso, repeat: true }),
      roughTex: canvasTex(roughCanvas, { srgb: false, aniso, repeat: true }),
      trackCanvas,
    };
    TEX_CACHE.set(key, entry);
  }
  entry.refs++;
  return entry;
}

function releaseSharedTextures(spec) {
  const entry = TEX_CACHE.get(spec.id);
  if (!entry) return;
  if (--entry.refs <= 0) {
    entry.camoTex.dispose();
    entry.normalTex.dispose();
    entry.roughTex.dispose();
    if (entry.burntTex) entry.burntTex.dispose();
    if (entry.emberTex) entry.emberTex.dispose();
    TEX_CACHE.delete(spec.id);
  }
}

/**
 * Charred variant of the shared camo albedo + a patchy ember emissive map,
 * built lazily and cached with the per-spec textures. The wreck keeps faint
 * camo/panel variation under heavy char with noise blotches and rising soot
 * streaks — never a flat clay color swap.
 * @param {object} entry TEX_CACHE entry @param {number} aniso
 */
function ensureBurntTextures(entry, aniso) {
  if (entry.burntTex) return;
  const S = 1024;
  const cv = makeCanvas(S, S);
  const ctx = cv.getContext('2d');
  ctx.drawImage(entry.camoCanvas, 0, 0, S, S);
  // char the paint toward scorched near-black, camo faintly readable under it
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = '#5a5049';
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(22,19,16,0.42)';
  ctx.fillRect(0, 0, S, S);
  const rng = mulberry32((entry.seed ^ 0xb0217) >>> 0);
  // sooty blotches: char-black pockets and ash-grey burn-through patches
  for (let i = 0; i < 80; i++) {
    const x = rng() * S, y = rng() * S, r = (0.03 + rng() * 0.12) * S;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    if (rng() < 0.62) g.addColorStop(0, `rgba(12,10,9,${0.26 + rng() * 0.3})`);
    else g.addColorStop(0, `rgba(104,96,84,${0.08 + rng() * 0.15})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // rising soot streaks (heat streaking up plates from hatches/seams)
  for (let i = 0; i < 52; i++) {
    const x = rng() * S;
    const y0 = rng() * S * 0.75;
    const len = (0.10 + rng() * 0.30) * S;
    const w = (0.005 + rng() * 0.020) * S;
    const g = ctx.createLinearGradient(x, y0 + len, x, y0);
    g.addColorStop(0, `rgba(8,7,6,${0.18 + rng() * 0.30})`);
    g.addColorStop(1, 'rgba(8,7,6,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - w / 2, y0, w, len);
  }
  entry.burntTex = canvasTex(cv, { aniso, repeat: true });
  // ember emissive mask: mostly black with a few soft hot pockets — the glow
  // reads as embers smoldering in seams, never a uniform lava dip
  const E = 256;
  const ec = makeCanvas(E, E);
  const ectx = ec.getContext('2d');
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, E, E);
  for (let i = 0; i < 6; i++) {
    const x = rng() * E, y = rng() * E, r = 22 + rng() * 34;
    const g = ectx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,132,48,${0.35 + rng() * 0.35})`);
    g.addColorStop(0.5, 'rgba(140,36,8,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ectx.fillStyle = g;
    ectx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  entry.emberTex = canvasTex(ec, { aniso: 2, repeat: true });
}

// ===========================================================================
// CAMO PATTERN SECTION — per-tank paintable camo schemes (garage picker).
//
// Selection is persisted per tank id in localStorage ('cot.camo.<specId>'):
//   'factory' — the authored historical spec.visual (default)
//   'summer'  — 3-color NATO/olive summer
//   'desert'  — desert tan wash
//   'winter'  — whitewash over the factory paint
//   'digital' — nation-flavored digital/flecktarn
//   'auto'    — resolves per active battlefield biome (set via setCamoBiome)
//
// Patterns repaint the SHARED per-spec albedo canvas in place, so the garage
// pedestal, battle tanks, and any sourced-GLB overlay all update live without
// rebuilding geometry. Non-factory patterns grant a small concealment bonus
// (see src/sim/spotting.js CAMO_PAINT_BONUS) via hasCamoPaint().
// ===========================================================================

export const CAMO_PATTERN_IDS = ['auto', 'factory', 'summer', 'desert', 'winter', 'digital'];
export const CAMO_PATTERN_LABEL = {
  auto: 'Auto (map)', factory: 'Factory', summer: 'Summer',
  desert: 'Desert', winter: 'Winter', digital: 'Digital',
};

const CAMO_LS_PREFIX = 'cot.camo.';
// 'urban' is an INTERNAL pattern id (gray digital) reachable only through
// AUTO biome resolution — a green flecktarn in a gray rubble city defeated
// the point of biome matching (r1). Direct picker selection keeps the
// nation-flavored green 'digital'.
const BIOME_PATTERN = { verdant: 'summer', desert: 'desert', winter: 'winter', urban: 'urban' };
let activeBiome = 'verdant';

/** Persisted camo pattern selection for a tank ('factory' when unset). */
export function getCamoSelection(specId) {
  try {
    const v = localStorage.getItem(CAMO_LS_PREFIX + specId);
    return CAMO_PATTERN_IDS.includes(v) ? v : 'factory';
  } catch (e) { return 'factory'; }
}

/** Persist a camo pattern selection for a tank. */
export function setCamoSelection(specId, patternId) {
  if (!CAMO_PATTERN_IDS.includes(patternId)) return;
  try { localStorage.setItem(CAMO_LS_PREFIX + specId, patternId); } catch (e) { /* private mode */ }
}

/** Point 'auto' selections at a battlefield biome (call before a battle). */
export function setCamoBiome(mapId) {
  activeBiome = BIOME_PATTERN[mapId] ? mapId : 'verdant';
}

/** Concrete pattern id for a tank right now ('auto' resolved per biome). */
export function resolveCamoPattern(specId) {
  const sel = getCamoSelection(specId);
  return sel === 'auto' ? BIOME_PATTERN[activeBiome] : sel;
}

/** True when the tank wears a non-factory pattern (spotting camo bonus). */
export function hasCamoPaint(specId) {
  return resolveCamoPattern(specId) !== 'factory';
}

// Nation-flavored palettes. Marking/number/zimmerit/camoScale stay authored —
// only scheme/base/weather/patches are overridden, so the plate-feature and
// weathering layers (painted by paintCamo on top) are fully respected.
//
// FACTORY_OVERRIDE (r7 major): the m1a2's authored 'nato' factory visual made
// FACTORY and SUMMER two near-identical green 3-tone choices on the flagship
// tank. US armor ships in monotone CARC Green 383 — factory is now a solid
// green (panel-tone variation comes from the tonal/mottle layers + the GLB's
// baked detail overlay), keeping the 3-color NATO look exclusive to 'summer'.
const FACTORY_OVERRIDE = {
  m1a2: { scheme: 'solid', base: '#4c5741', weather: '#5a6650', patches: [] },
  // Hinterhalt tones: the authored '#7a4a35' Rotbraun reads bright orange
  // under the warm garage key light (r7 "orange/green cow spots"); drop both
  // patch tones toward RAL 6003/8017 so the scheme reads olive + chocolate.
  panther_g: { patches: ['#5d6334', '#5e3c29'] },
};
function patternVisual(spec, patternId) {
  const v = spec.visual || { base: '#5a6b46', weather: '#6f7d55', scheme: 'solid', patches: [] };
  if (patternId === 'factory') {
    const fo = FACTORY_OVERRIDE[spec.id];
    return fo ? { ...v, ...fo } : v;
  }
  let o = null;
  if (patternId === 'summer') {
    // brown dropped toward NATO chocolate — '#54402e' flared orange under
    // the warm garage key (r7)
    o = { scheme: 'nato', base: '#4d5940', weather: '#59664a', patches: ['#26291f', '#4c3a2a'] };
  } else if (patternId === 'desert') {
    // 3-tone hard-edged desert geometry (scheme 'desert' in paintCamo):
    // patches = [dark shadow tan, mid earth, pale sand highlight].
    // Widened lightness split (r6: the old tones mipped to a uniform tan
    // wash at garage distance — the geometry has to survive at 12 m).
    o = { scheme: 'desert', base: '#b09466', weather: '#c4ad7d', patches: ['#6b5136', '#947c52', '#e4d3a8'] };
  } else if (patternId === 'winter') {
    o = { scheme: 'winter', base: '#c4c8bf', weather: '#a8ad9f', patches: [v.base || '#4b5320'] };
  } else if (patternId === 'urban') {
    // biome-resolved only (see BIOME_PATTERN): gray-biased GREEN NATO blend.
    // Pure concrete digital read conspicuously alien on the green approach
    // fields around the Steinburg spawns — exactly where engagements start
    // (r7); a gray-green 3-tone sits believably on both the rubble blocks
    // and the grass midfield.
    o = { scheme: 'nato', base: '#626857', weather: '#707668', patches: ['#3a3e34', '#83867a'] };
  } else if (patternId === 'digital') {
    const nation = spec.nation;
    if (nation === 'Germany') {
      o = { scheme: 'fleck', base: '#57604a', weather: '#616a53', patches: ['#39492f', '#6b5136', '#2b2d26'] };
    } else if (nation === 'USSR' || nation === 'Russia') {
      // three tones (dark, muted khaki, mid-green) so the digital field reads
      // as camouflage rather than sparse tan stickers on flat green (r6).
      // r7: khaki + sage pulled darker — the old #8a7f5a/#55624a pair rendered
      // as minty pastel confetti under the garage key light.
      o = { scheme: 'digital', base: '#3f5138', weather: '#47593f', patches: ['#2b2d26', '#6e654a', '#485541'] };
    } else {
      o = { scheme: 'digital', base: '#4a5442', weather: '#525c49', patches: ['#333d30', '#79806a', '#23261f'] };
    }
  }
  return o ? { ...v, ...o } : v;
}

/** Resolved visual (spec.visual with the active pattern applied). */
export function resolveCamoVisual(spec, patternId = resolveCamoPattern(spec.id)) {
  return patternVisual(spec, patternId);
}

// Scheme-painted running gear + fittings: real crews paint wheels and hull
// hardware in the vehicle scheme, so these solid colors derive from the
// ACTIVE pattern base, not the authored factory palette.
const cssRGB = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const wheelRgbOf = (v) => mix(scale3(hexToRgb(v.base), 0.92), [118, 110, 86], 0.22);
// Recessed interleaved-row wheels bake their own occlusion: same scheme paint
// dropped toward shadow so the Schachtellaufwerk rows separate (r5). Kept at
// 0.66 — the old 0.5 rendered near-black in the wheel bay and the recessed
// rows read as GAPS between sparse floating wheels (r6 Tiger closeup).
const wheelDarkRgbOf = (v) => scale3(wheelRgbOf(v), 0.66);
const detailRgbOf = (v) => mix([65, 70, 58], hexToRgb(v.base), 0.5);

function repaintEntry(entry, patternId) {
  const vis = patternVisual(entry.spec, patternId);
  // pattern-specific rng stream; the shared `feats` plan keeps panel lines,
  // welds and bolts aligned with the (unchanged) normal/roughness maps.
  let ph = 0;
  for (const ch of patternId) ph = (ph * 31 + ch.charCodeAt(0)) | 0;
  paintCamo(entry.camoCanvas, vis, mulberry32(entry.seed ^ ph), entry.feats, entry.seed);
  entry.camoTex.needsUpdate = true;
  entry.patternId = patternId;
  // wheels / sprockets / fittings follow the repaint live
  for (const rec of entry.paintable) {
    const c = rec.kind === 'wheels' ? wheelRgbOf(vis)
      : rec.kind === 'wheelsDark' ? wheelDarkRgbOf(vis) : detailRgbOf(vis);
    rec.m.color.set(cssRGB(c));
  }
}

/**
 * Repaint every cached tank albedo whose resolved pattern changed (after a
 * selection change or a biome switch). Cheap when nothing changed.
 * @param {?string} onlySpecId limit to one tank
 */
export function applyCamoPatterns(onlySpecId = null) {
  for (const [key, entry] of TEX_CACHE) {
    if (onlySpecId && key !== onlySpecId) continue;
    const pid = resolveCamoPattern(key);
    if (entry.patternId !== pid) repaintEntry(entry, pid);
  }
  retintGlbModels();
}

// ---- sourced-GLB hook (modelLoader.js) ------------------------------------
// GLB assets arrive with their own baked albedo maps. The old approach — a
// 0.45 color lerp over the map — was invisible (summer/desert/winter were
// pixel-identical) and blew bright pips out of dark hardware, so patterns are
// now COMPOSITED in texture space:
//   albedo' = camo pattern tile (full paintCamo language, no plate features)
//             ⊕ overlay( grayscale(albedo), mean-luma normalized )  — keeps
//               the asset's baked AO / panel shading / weathering
//             ∩ alpha(albedo)                                        — keeps cutouts
// Composited canvases are shared per source texture (every instance of a spec
// reuses one GPU texture) and recomposed in place on pattern switches.
// Materials are classified by GLB name: rubber / lights / optics / radiators /
// screws / tracks keep their factory look (tinting those produced the r1
// "LED fairy light" bolt-pip artifacts); untextured hull-paint materials fall
// back to a strong base tint; 'factory' restores the original maps/colors.
const GLB_TINTED = [];            // registered models: { specId, spec, mats: [rec] }
let GLB_ENGINE_CTX = null;        // EngineCtx captured by createTankMaterials (CSM registration)
const GLB_CTX_PROBED = new WeakSet(); // ctx objects already probed (stub vs real CSM)

// Capture only a REAL CSM-registering context: the tank-thumbnail booth
// (ui/tankThumbs.js) passes a stub `setupShadowMaterial: (m) => m` that would
// otherwise clobber the capture and silently un-CSM every later GLB clone
// (= the r6 supernova returning through the side door). Probe each distinct
// ctx once with a throwaway material and keep it only if it stamps USE_CSM.
function captureGlbEngineCtx(engineCtx) {
  if (!engineCtx || typeof engineCtx.setupShadowMaterial !== 'function') return;
  if (GLB_ENGINE_CTX === engineCtx || GLB_CTX_PROBED.has(engineCtx)) return;
  GLB_CTX_PROBED.add(engineCtx);
  const probe = new THREE.MeshStandardMaterial();
  try { engineCtx.setupShadowMaterial(probe); } catch (e) { /* stub/booth ctx */ }
  if (probe.defines && probe.defines.USE_CSM) GLB_ENGINE_CTX = engineCtx;
  probe.dispose();
}
const GLB_MAP_SHARE = new Map();  // srcTex.uuid -> { src, meanLuma, canvas, tex, key } | null
const GLB_TILE_CACHE = new Map(); // nation:patternId -> pattern tile canvas
// 'addon' covers modelLoader's procedural correction parts — they already
// carry the shared camo canvas directly and must not be re-composited.
const GLB_SKIP_RE = /rubber|tire|light|lens|glass|optic|radiator|screw|track|wheel|gear|addon/i;

function glbPatternTile(spec, patternId) {
  const key = `${spec.nation || 'x'}:${patternId}`;
  let tile = GLB_TILE_CACHE.get(key);
  if (!tile) {
    let ph = 7;
    for (const ch of key) ph = (ph * 31 + ch.charCodeAt(0)) | 0;
    // no plate features on the tile — the GLB carries its own panel detail.
    // camoScale pinned to the 0.5 reference: GLB atlas tiling is 2x2 across
    // the sheet (not boxUV), so the wk world-size normalization in paintCamo
    // must not rescale these tiles.
    const feats = { hLines: [], vLines: [], rings: [], chips: [], streaks: [] };
    tile = paintCamo(makeCanvas(1024, 1024),
      { ...patternVisual(spec, patternId), camoScale: 0.5 },
      mulberry32(ph), feats, ph);
    GLB_TILE_CACHE.set(key, tile);
  }
  return tile;
}

// Bake one source texture to a canvas (≤1024) + measure mean luminance.
// Returns null when the image is unreadable (compressed formats) — those
// materials degrade to the plain-tint path.
function acquireGlbShare(srcTex) {
  if (GLB_MAP_SHARE.has(srcTex.uuid)) return GLB_MAP_SHARE.get(srcTex.uuid);
  let share = null;
  const img = srcTex.image;
  if (img && img.width > 0 && img.height > 0) {
    try {
      const w = Math.min(img.width, 1024), h = Math.min(img.height, 1024);
      const src = makeCanvas(w, h);
      src.getContext('2d').drawImage(img, 0, 0, w, h);
      const probe = makeCanvas(16, 16);
      const pctx = probe.getContext('2d');
      pctx.drawImage(src, 0, 0, 16, 16);
      const d = pctx.getImageData(0, 0, 16, 16).data;
      let lum = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 8) continue;
        lum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        n++;
      }
      const canvas = makeCanvas(w, h);
      const tex = new THREE.CanvasTexture(canvas);
      tex.flipY = srcTex.flipY;                    // GLTF textures: flipY=false
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = srcTex.wrapS; tex.wrapT = srcTex.wrapT;
      tex.anisotropy = srcTex.anisotropy || 4;
      tex.offset.copy(srcTex.offset); tex.repeat.copy(srcTex.repeat);
      tex.rotation = srcTex.rotation; tex.center.copy(srcTex.center);
      tex.channel = srcTex.channel;
      const meanLuma = n ? lum / (n * 255) : 0.5;
      // Pre-baked BOUNDED detail layer for the overlay pass: grayscale luma
      // remapped around mid-gray relative to the atlas mean, clamped to
      // [84, 186]. CSS brightness()+contrast() filters could not lift the
      // asset's pit-dark atlas strips (engine deck, rear panels) out of the
      // toe — they composited as near-black "navy" plates that ignored every
      // camo pattern (r6 critique). A one-off per-pixel remap bounds how far
      // any baked texel can push the pattern in either direction while
      // keeping the AO/panel shading that sells the model.
      const detail = makeCanvas(w, h);
      const dctx = detail.getContext('2d');
      dctx.drawImage(src, 0, 0, w, h);
      const dimg = dctx.getImageData(0, 0, w, h);
      const dd = dimg.data;
      const invMean = 1 / Math.max(meanLuma * 255, 12);
      for (let i = 0; i < dd.length; i += 4) {
        const l = 0.2126 * dd[i] + 0.7152 * dd[i + 1] + 0.0722 * dd[i + 2];
        let v = 128 * Math.pow(l * invMean, 0.6);
        // r7: clamp tightened 84/186 -> 92/178 — baked rivet-dot decals along
        // the m1a2 glacis/skirt seams punched through the pattern as dark
        // dotted rows the real vehicle doesn't have
        v = v < 92 ? 92 : (v > 178 ? 178 : v);
        dd[i] = dd[i + 1] = dd[i + 2] = v;
      }
      dctx.putImageData(dimg, 0, 0);
      share = { src, detail, meanLuma, canvas, tex, key: null };
    } catch (e) { share = null; }
  }
  GLB_MAP_SHARE.set(srcTex.uuid, share);
  return share;
}

function composeGlbShare(share, spec, patternId) {
  const key = `${spec.id}:${patternId}`;
  if (share.key === key) return;                   // already composed for this pattern
  const { src, canvas } = share;
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  // 1. pattern base — ~3 tile repeats across the atlas so blobs land at
  //    believable hull scale through arbitrary UV islands (r7: at 2 repeats
  //    the m1a2's woodland blobs went cartoon-large above the fender line)
  const tile = glbPatternTile(spec, patternId);
  const tw = Math.ceil(w / 3), th = Math.ceil(h / 3);
  for (const ox of [0, tw, tw * 2]) for (const oy of [0, th, th * 2]) ctx.drawImage(tile, ox, oy, tw, th);
  // 2. the asset's baked detail back on top via the precomputed BOUNDED
  //    grayscale layer (see acquireGlbShare): luma recentered on mid-gray
  //    relative to the atlas mean and clamped to [84, 186], so AO/panel
  //    shading modulates the pattern but no baked strip can crush it to
  //    black (r6 "navy deck") or punch through as a glowing decal.
  ctx.globalCompositeOperation = 'overlay';
  ctx.drawImage(share.detail, 0, 0, w, h);
  // 3. global exposure trim — matches the vertex-dirt darkening the
  //    procedural fleet gets from bakeDirt, keeps paint out of bloom range
  ctx.filter = 'none';
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgb(214,212,206)';
  ctx.fillRect(0, 0, w, h);
  // 3b. hard luminance ceiling (r6 winter/desert blowout gate): overlay of a
  //     bright baked pixel onto a bright pattern tile (whitewash, pale sand)
  //     can still stack past matte-paint range; soft-clamp any texel whose
  //     encoded luma exceeds LUMA_MAX so no paint texel can feed the bloom
  //     pass under the garage spots. One ImageData pass, pattern switches only.
  {
    const LUMA_MAX = 214;                          // ~0.84 encoded
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      if (lum > LUMA_MAX) {
        const s = LUMA_MAX / lum;
        d[i] *= s; d[i + 1] *= s; d[i + 2] *= s;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  // 4. restore the source alpha exactly (cutout skirts, decal sheets)
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(src, 0, 0, w, h);
  ctx.restore();
  share.key = key;
  share.tex.needsUpdate = true;
}

function applyGlbEntry(entry) {
  const pid = resolveCamoPattern(entry.specId);
  const vis = patternVisual(entry.spec, pid);
  const target = new THREE.Color(vis.base || '#5a6b46');
  for (const rec of entry.mats) {
    if (rec.kind === 'skip') continue;
    if (rec.kind === 'tex') {
      // 'factory' composites too: the raw asset's baked albedo mixes a
      // woodland hull with a flat-olive turret and a bare-metal gun tube —
      // only the generated pattern makes the vehicle read as ONE paint job
      // (r5: "two different tanks welded together").
      composeGlbShare(rec.share, entry.spec, pid);
      rec.m.map = rec.share.tex;
      rec.m.color.copy(rec.orig);                  // never tint textured mats
      rec.m.needsUpdate = true;
    } else {                                       // 'plain': untextured hull paint
      // factory tints too — the asset's untextured paint colors are arbitrary
      // (navy-ish breech/deck fittings on the m1a2) and must follow the
      // scheme like everything else (r6 un-camo'd panel critique)
      rec.m.color.copy(rec.orig).lerp(target, 0.8);
    }
  }
}

function retintGlbModels() {
  for (const e of GLB_TINTED) applyGlbEntry(e);
}

/**
 * Apply the active camo pattern to a sourced-GLB tank model (texture-space
 * pattern composite; the asset's baked AO/weathering is preserved as an
 * overlay layer). Called by modelLoader.applyGlbModel after its material
 * upgrade pass; registered so later pattern switches recompose live.
 * @param {THREE.Object3D} root normalized GLB scene
 * @param {object} spec TankSpec
 */
export function applyCamoToModel(root, spec) {
  const entry = { specId: spec.id, spec, mats: [] };
  // CSM registration for the cloned GLB materials (r6 winter/desert supernova
  // ROOT CAUSE): the cascaded-shadow rig adds one directional light PER
  // CASCADE to the scene. Materials that went through
  // engineCtx.setupShadowMaterial (the whole procedural fleet) are patched to
  // take exactly ONE cascade per fragment; unpatched materials receive ALL
  // cascade suns at once — N x the sun on the whole GLB body. Dark factory
  // paint hid the overshoot; bright winter/desert paint crossed the bloom
  // threshold and rendered as a nuclear-white/gold light source (proven by
  // probe: an unregistered mid-gray sphere at pedestal height blooms white
  // while CSM-registered tanks with brighter albedo stay matte).
  const ctx = GLB_ENGINE_CTX;
  const setup = ctx && typeof ctx.setupShadowMaterial === 'function'
    ? (m) => {
      ctx.setupShadowMaterial(m, vehicleAmbientFloorHook);
      m.customProgramCacheKey = () => 'veh-ambient-floor-v1';
      return m;
    }
    : (m) => {
      // headless/tooling fallback: keep at least the readability floor
      m.onBeforeCompile = vehicleAmbientFloorHook;
      m.customProgramCacheKey = () => 'veh-ambient-floor-v1';
      return m;
    };
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (let i = 0; i < mats.length; i++) {
      const m = mats[i];
      if (!m || !m.color) continue;
      // clone: GLTF clones share materials with the loader cache.
      // Material.clone() drops onBeforeCompile/customProgramCacheKey, so the
      // clone is re-registered with the CSM rig + readability floor above —
      // 'skip' materials included (they were equally over-lit).
      const own = setup(m.clone());
      if (Array.isArray(o.material)) o.material[i] = own; else o.material = own;
      if (GLB_SKIP_RE.test(own.name || '')) {
        entry.mats.push({ m: own, kind: 'skip' });
        continue;
      }
      const share = own.map ? acquireGlbShare(own.map) : null;
      // very dark sheets are bare hardware/track runs — leave them unpainted
      // (recoloring them is what created bright pips on the skirts in r1)
      if (share && share.meanLuma < 0.10) {
        entry.mats.push({ m: own, kind: 'skip' });
        continue;
      }
      // Painted plates respond like the procedural fleet's matte CARC, not
      // like the asset's baked metallicRoughness. The baked maps push
      // metalness ~0.35 across the whole body, so every plate mirrored the
      // bright PMREM sky: dark camo patches sheened navy-teal ("bare primer"
      // r6 critique). The composited albedo already carries the baked
      // AO/weathering, so dropping the maps loses nothing.
      own.metalnessMap = null;
      own.roughnessMap = null;
      own.metalness = 0.08;
      own.roughness = 0.82;
      if ('envMapIntensity' in own) own.envMapIntensity = 0.6;
      // The asset also bakes KHR_materials_clearcoat 0.37-1.0 into its
      // MeshPhysicalMaterials — a near-mirror lacquer lobe that ignores the
      // base roughness/metalness clamps. Under the garage spots + sky IBL it
      // detonated winter into a nuclear-white light source and desert into
      // gold plating (r6 critical; proven by bisect: flat mid-gray albedo
      // with clearcoat intact still bloomed white). Military paint has no
      // clearcoat — strip the whole layer on painted plates.
      if ('clearcoat' in own) {
        own.clearcoat = 0;
        own.clearcoatMap = null;
        own.clearcoatRoughnessMap = null;
        own.clearcoatNormalMap = null;
      }
      if ('sheen' in own) own.sheen = 0;
      entry.mats.push(share
        ? { m: own, kind: 'tex', share, origMap: own.map, orig: own.color.clone() }
        : { m: own, kind: 'plain', orig: own.color.clone() });
    }
  });
  GLB_TINTED.push(entry);
  applyGlbEntry(entry);
}

/**
 * Shared per-spec generated camo albedo for external consumers (modelLoader's
 * procedural add-on parts wear it directly, so they restyle live with pattern
 * switches exactly like the composited GLB plates and the procedural fleet).
 * @param {object} spec TankSpec
 * @returns {THREE.Texture} the live repaintable camo canvas texture
 */
export function getSharedCamoTexture(spec) {
  const entry = TEX_CACHE.get(spec.id) || acquireSharedTextures(spec, 4);
  return entry.camoTex;
}

/**
 * Shared per-spec roughness map for external consumers (community GLB camo
 * hulls take it so big untextured CAD plates get micro roughness variation
 * instead of one waxy constant — r7 "waxy single-color scan" critique).
 * @param {object} spec TankSpec
 * @returns {THREE.Texture}
 */
export function getSharedRoughnessTexture(spec) {
  const entry = TEX_CACHE.get(spec.id) || acquireSharedTextures(spec, 4);
  return entry.roughTex;
}

/**
 * COMMUNITY TANKS: scheme-painted running-gear materials for sourced GLBs —
 * wheel dishes take the active pattern's solid wheel paint (registered on the
 * shared entry so garage repaints re-tint them live, exactly like the
 * procedural fleet's dishes), track runs take worn dark steel. One shared
 * pair per spec. (r7: CAD/low-poly models rendered tracks, rubber and hull
 * as one uniform color — "no material separation".)
 * @param {object} spec TankSpec
 * @returns {{ wheel: THREE.Material, track: THREE.Material }}
 */
export function getCommunityGearMaterials(spec) {
  const entry = TEX_CACHE.get(spec.id) || acquireSharedTextures(spec, 4);
  if (!entry.gearMats) {
    const vis = patternVisual(spec, entry.patternId);
    // shadowed wheel tone (wheelDarkRgbOf): low-poly assets often bake the
    // whole wheel run as one flat strip — full scheme paint read as a pink
    // slab on the Quaternius heavy
    const wheel = new THREE.MeshStandardMaterial({
      name: 'AddOnWheel', color: new THREE.Color(cssRGB(wheelDarkRgbOf(vis))),
      roughness: 0.82, metalness: 0.10, roughnessMap: entry.roughTex,
    });
    wheel.onBeforeCompile = vehicleAmbientFloorHook;
    wheel.customProgramCacheKey = () => 'veh-ambient-floor-v1';
    const track = new THREE.MeshStandardMaterial({
      name: 'AddOnTrack', color: 0x43453f, roughness: 0.88, metalness: 0.14,
      roughnessMap: entry.roughTex,
    });
    track.onBeforeCompile = vehicleAmbientFloorHook;
    track.customProgramCacheKey = () => 'veh-ambient-floor-v1';
    // live repaint hook: wheel dishes follow the pattern like procedural ones
    entry.paintable.add({ m: wheel, kind: 'wheelsDark' });
    entry.gearMats = { wheel, track };
  }
  return entry.gearMats;
}

// ======================= END CAMO PATTERN SECTION ==========================

// WoT-style vehicle readability floor (gameplay_feel r2: driving through tree
// shadow crushed the player hull to a featureless black silhouette — camo and
// detail invisible). Floor the indirect-diffuse term at a small fraction of
// the albedo so vehicles stay readable in full CSM/canopy shade; the max()
// only engages when the ambient stack (hemi + IBL) drops below the floor, so
// sunlit response and the key:fill ratio are untouched. Vehicles ONLY — the
// world keeps its deep shadows for contrast.
// 0.35 ≈ 2× the hemi+IBL ambient response: a clear lift out of black-crush
// while staying far under the ~4.5-intensity sunlit response (0.16 sat AT the
// ambient level and was invisible after ACES).
const VEHICLE_AMBIENT_FLOOR = 0.35;

/**
 * Shader hook: clamp `reflectedLight.indirectDiffuse` to an albedo-scaled
 * floor. Chain via `setupShadowMaterial(mat, vehicleAmbientFloorHook)` for
 * CSM materials, or assign directly as `onBeforeCompile` for sourced-GLB
 * materials (see applyCamoToModel's clone re-registration above/below).
 * @param {object} shader onBeforeCompile shader arg
 */
export function vehicleAmbientFloorHook(shader) {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <lights_fragment_end>',
    `#include <lights_fragment_end>
	reflectedLight.indirectDiffuse = max( reflectedLight.indirectDiffuse, material.diffuseColor * ${VEHICLE_AMBIENT_FLOOR.toFixed(3)} );`,
  );
}

/**
 * Build the full material set for one tank.
 * @param {object} spec TankSpec (reads spec.visual palette hints)
 * @param {object} engineCtx EngineCtx (§2.8) — setupShadowMaterial + anisotropy
 * @param {number} camoSeed deterministic seed (stowage jitter etc.; textures are per-spec)
 * @returns {object} { hull, wheels, rubber, detail, dark, glass, barrel, canvasCloth,
 *   wood, trackL, trackR, trackTexL, trackTexR, trackLinkM, decal(kind), burnt, dispose() }
 */
export function createTankMaterials(spec, engineCtx, camoSeed) {
  // CAMO PATTERN SECTION: remember the engine context so applyCamoToModel can
  // CSM-register the sourced-GLB material clones (tankFactory always builds
  // the procedural material set before the GLB swap fires, so this is set by
  // the time any GLB clone needs it). See the r6 supernova note there.
  captureGlbEngineCtx(engineCtx);
  const setup = engineCtx && typeof engineCtx.setupShadowMaterial === 'function'
    ? (m) => engineCtx.setupShadowMaterial(m)
    : (m) => m;
  const aniso = (engineCtx && engineCtx.anisotropy) || 8;

  const disposables = [];
  const track = (r) => { disposables.push(r); return r; };

  const shared = acquireSharedTextures(spec, aniso);
  const { camoTex, normalTex, roughTex } = shared;

  // Matte military paint over rolled steel: normal map carries panel lines /
  // welds / bolts / casting; a whisper of clearcoat lets sky light streak
  // across big plates; vertex colors carry the baked dust/AO gradient.
  const hull = track(setup(new THREE.MeshPhysicalMaterial({
    map: camoTex, roughnessMap: roughTex, roughness: 1.0, metalness: 0.06,
    normalMap: normalTex, normalScale: new THREE.Vector2(1.3, 1.3),
    clearcoat: 0.07, clearcoatRoughness: 0.55, clearcoatRoughnessMap: roughTex,
    vertexColors: true,
  })));

  // CAMO PATTERN SECTION: wheel dishes and fittings are scheme-painted — the
  // colors derive from the ACTIVE pattern (not the factory palette) and the
  // materials register on the shared entry so pattern switches re-tint them
  // live (r1: lime-green road wheels under winter whitewash).
  const patVis = patternVisual(spec, shared.patternId);
  const wheels = track(setup(new THREE.MeshStandardMaterial({
    color: new THREE.Color(cssRGB(wheelRgbOf(patVis))),
    roughness: 0.8, metalness: 0.1, roughnessMap: roughTex,
    normalMap: normalTex, normalScale: new THREE.Vector2(0.4, 0.4),
  })));
  // Recessed rows of an interleaved (Schachtellaufwerk) wheel stack: same
  // scheme paint pushed into shadow so the layers separate visually (r5).
  const wheelsRecessed = track(setup(new THREE.MeshStandardMaterial({
    color: new THREE.Color(cssRGB(wheelDarkRgbOf(patVis))),
    roughness: 0.88, metalness: 0.08, roughnessMap: roughTex,
    normalMap: normalTex, normalScale: new THREE.Vector2(0.4, 0.4),
  })));
  const rubber = track(setup(new THREE.MeshStandardMaterial({
    color: 0x1d1d1f, roughness: 0.96, metalness: 0.0,
  })));
  // Accessories must never read as raw #000 blockout: scheme-tinted fittings
  // and gunmetal hardware, both with roughness variation.
  const detail = track(setup(new THREE.MeshStandardMaterial({
    color: new THREE.Color(cssRGB(detailRgbOf(patVis))),
    roughness: 0.66, metalness: 0.28, roughnessMap: roughTex,
    normalMap: normalTex, normalScale: new THREE.Vector2(0.35, 0.35),
  })));
  // Wheel-bay / sponson-underside ambient occlusion: near-black matte panels
  // that give running gear a shadowed pocket to read against (r5 hard gate).
  const shadow = track(setup(new THREE.MeshStandardMaterial({
    color: 0x0b0c0a, roughness: 0.98, metalness: 0.0,
  })));
  const paintableRecs = [
    { m: wheels, kind: 'wheels' },
    { m: wheelsRecessed, kind: 'wheelsDark' },
    { m: detail, kind: 'detail' },
  ];
  for (const rec of paintableRecs) shared.paintable.add(rec);
  // Gun-metal (muzzle brake / bare-steel fittings): roughness floor raised
  // 0.55 -> 0.70 (lighting_post r1) — with the multiplying roughnessMap the
  // old base dipped the effective GGX roughness to ~0.25-0.3 and the barrel
  // top blew to a clipped pure-white specular spike under the field sun.
  const dark = track(setup(new THREE.MeshStandardMaterial({
    color: 0x33383a, roughness: 0.70, metalness: 0.45, roughnessMap: roughTex,
  })));
  // Individual track-link pads: worn dusty steel, clearly lighter than the
  // shadowed band behind them so the run reads as articulated links up close.
  // r7: metalness dropped 0.38 -> 0.16 and roughness raised — under the field
  // sun the old values fired a glossy-black-plastic specular off sprockets
  // and link pads; worn track steel is dusty and near-diffuse.
  const trackLink = track(setup(new THREE.MeshStandardMaterial({
    color: 0x50524d, roughness: 0.85, metalness: 0.16, roughnessMap: roughTex,
  })));
  // Spare track links carried as stowage/armor: dark oily track steel — the
  // light-grey trackLink shade read as unpainted plastic sprue racked on the
  // Tiger turret sides (r6); the live run needs the lighter tone, spares don't.
  const spareTrack = track(setup(new THREE.MeshStandardMaterial({
    color: 0x3a3d38, roughness: 0.78, metalness: 0.32, roughnessMap: roughTex,
  })));
  // Optics / headlight lenses: smooth glass with a dark blue-grey tint.
  const glass = track(setup(new THREE.MeshStandardMaterial({
    color: 0x2a3540, roughness: 0.12, metalness: 0.85,
  })));
  // Gun tube: painted in the vehicle scheme like the hull — crews paint the
  // tube, only the muzzle brake stays bare steel (routed to the dark bucket).
  // Uses the same box-projected camo map as the shell so it never reads as an
  // untextured black prop, with a gentle normal so sleeve clamps still catch.
  const barrel = track(setup(new THREE.MeshStandardMaterial({
    map: camoTex, roughness: 0.72, metalness: 0.10, roughnessMap: roughTex,
    normalMap: normalTex, normalScale: new THREE.Vector2(0.5, 0.5),
    vertexColors: true,
  })));
  const canvasCloth = track(setup(new THREE.MeshStandardMaterial({
    color: 0x59543f, roughness: 0.96, metalness: 0.0,
    bumpMap: roughTex, bumpScale: 0.5,
  })));
  const wood = track(setup(new THREE.MeshStandardMaterial({
    color: 0x6b543a, roughness: 0.88, metalness: 0.0,
    bumpMap: roughTex, bumpScale: 0.3,
  })));
  // Charred wreck: a baked scorched variant of the CAMO map (soot blotches +
  // rising streaks over the darkened pattern) instead of the r2 flat clay
  // color — plus a patchy ember emissiveMap that tankFactory pulses/cools
  // over the first ~20 s of the wreck (emissiveIntensity is animated there).
  ensureBurntTextures(shared, aniso);
  const burnt = track(setup(new THREE.MeshStandardMaterial({
    map: shared.burntTex, roughness: 0.94, metalness: 0.16, roughnessMap: roughTex,
    normalMap: normalTex, normalScale: new THREE.Vector2(0.9, 0.9),
    emissive: 0xff5a18, emissiveIntensity: 0.018, emissiveMap: shared.emberTex,
  })));

  // Independent L/R track textures so each side scrolls on its own offset.
  const trackTexL = track(canvasTex(shared.trackCanvas, { aniso, repeat: true }));
  const trackTexR = track(canvasTex(shared.trackCanvas, { aniso, repeat: true }));
  const trackMatOpts = { roughness: 0.85, metalness: 0.3 };
  const trackL = track(setup(new THREE.MeshStandardMaterial({
    map: trackTexL, bumpMap: trackTexL, bumpScale: 0.5, ...trackMatOpts })));
  const trackR = track(setup(new THREE.MeshStandardMaterial({
    map: trackTexR, bumpMap: trackTexR, bumpScale: 0.5, ...trackMatOpts })));

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
    hull, wheels, wheelsRecessed, rubber, detail, dark, shadow, trackLink, spareTrack, glass, barrel,
    canvasCloth, wood, burnt,
    trackL, trackR, trackTexL, trackTexR,
    trackLinkM: 0.165 * 4, // meters of track per full texture repeat (4 links)
    decal,
    dispose() {
      for (const rec of paintableRecs) shared.paintable.delete(rec);
      for (const r of disposables) r.dispose();
      releaseSharedTextures(spec);
    },
  };
}
