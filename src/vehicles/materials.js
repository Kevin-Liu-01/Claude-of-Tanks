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

// PERF (performance_budget r5): the per-pixel LCG grain pass was the single
// largest boot cost — bootprobe self-time 2.5 s across the staged vehicle
// bakes (16 MB getImageData + a 4.2 M-iteration clamped-add loop +
// putImageData, per map, per vehicle). Grain is per-texel stochastic noise,
// not a per-vehicle signature, so ONE cached 50 %-gray noise tile per
// (size, amp) bucket composited in 'hard-light' reads identically (at
// mid-tones hard-light adds exactly the same +-128*amp jitter; shadows and
// highlights grain proportionally less, which reads slightly cleaner) and
// runs ~10x faster on the GPU drawImage path.
const _grainTiles = new Map(); // "S:amp" -> canvas
function grainTile(S, amp) {
  const key = S + ':' + amp;
  let cnv = _grainTiles.get(key);
  if (cnv) return cnv;
  cnv = document.createElement('canvas');
  cnv.width = cnv.height = S;
  const c = cnv.getContext('2d');
  const img = c.createImageData(S, S);
  const d = img.data;
  let s0 = 0x9e3779b9;
  for (let i = 0; i < d.length; i += 4) {
    s0 = (s0 * 1664525 + 1013904223) >>> 0;
    const v = 128 + (((s0 >>> 16) & 255) - 128) * amp;
    d[i] = v; d[i + 1] = v; d[i + 2] = v;
    d[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  _grainTiles.set(key, cnv);
  return cnv;
}
function applyGrain(ctx, S, seed, amp) {
  // `seed` is intentionally unused now — see grainTile note above.
  const prevOp = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'hard-light';
  ctx.drawImage(grainTile(S, amp), 0, 0);
  ctx.globalCompositeOperation = prevOp;
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
  // r9: 2-3 joins per tile (was 3-4) — the dense line grid striped big flat
  // plates (Tiger side) into papercraft facets at closeup.
  const nH = 2 + ((rng() * 2) | 0), nV = 2 + ((rng() * 2) | 0);
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
  // r8: 260 chips with bright glints read as white speckle noise at
  // garage distance — halved, and the glint rectangle dimmed below.
  // r10: halved again (140 -> 72) — the survivors still read as flour dust
  // on the IS-3 / Panzer III / M1A2 roof plates under the garage key.
  for (let i = 0; i < 72; i++) {
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
  // camo_spotting r2 (close-orbit edge critique): the r8 wide feather made
  // sprayed patches read hand-painted at ~5 m. Real spray has a HARD core
  // edge (1-2 px feather) with a separate faint overspray halo plus droplet
  // specks riding the border — shared by the 'stripes' and 'nato' schemes.
  const sprayEdge = (p, col, coreA) => {
    ctx.filter = `blur(${(S * 0.0028).toFixed(1)}px)`;
    strokeWrapped(ctx, S, p, rgb(col, 0.18), S * 0.007);       // overspray halo
    ctx.filter = `blur(${Math.max(1, S * 0.0006).toFixed(1)}px)`;
    fillWrapped(ctx, S, p, rgb(col, coreA));                   // hard core, ~1.5px feather
    ctx.filter = 'none';
    ctx.setLineDash([2, 9 + rng() * 8]);                       // droplet specks on the border
    strokeWrapped(ctx, S, p, rgb(col, 0.5), 2.2);
    ctx.setLineDash([]);
  };
  if (scheme === 'stripes' && patches.length) {
    // Dunkelgelb with sprayed Olivgruen/Rotbraun camo: hard-edged angular
    // patches ELONGATED along the band diagonal (crews swept the gun along
    // one direction), linked by long spray bands. Rounded soft-edged blob
    // stamps read as cow spots at garage distance (r7 morphology critique);
    // the overspray rim stays a tight stroke straddling the hard core edge.
    const bandAng = 0.9 + rng() * 0.5;                   // one direction per tank
    const nP0 = Math.round(11 * nK);
    for (let i = 0; i < nP0; i++) {
      const col = mix(patches[i % patches.length], base, 0.24);
      const r = S * wk * (i < nP0 * 0.3 ? 0.085 + rng() * 0.055 : 0.032 + rng() * 0.05);
      const x = rng() * S, y = rng() * S;
      const p = camoPatchPath2D(rng, x, y, r, bandAng + (rng() - 0.5) * 0.5);
      sprayEdge(p, col, 0.88);
    }
    // Spray bands: LONG thin strokes at ONE consistent diagonal per vehicle
    // (small jitter only) — crews swept the spray gun in parallel passes, so
    // the bands read as a directional stripe scheme, never as random daubs
    // (r6 "finger-paint" critique).
    for (let i = 0; i < Math.round(14 * nK); i++) {
      const col = mix(patches[i % patches.length], base, 0.22);
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
      // camo_spotting r2: the r8 full-width feather turned the bands into
      // hand-brushed zebra stripes at close orbit. Sprayed bands keep a wide
      // soft overspray FLANK but a near-hard core stroke.
      ctx.filter = `blur(${(S * 0.0024).toFixed(1)}px)`;
      strokeWrapped(ctx, S, path, rgb(col, 0.15), w * 1.9);      // overspray flanks
      ctx.filter = `blur(${Math.max(1, S * 0.0006).toFixed(1)}px)`;
      strokeWrapped(ctx, S, path, rgb(col, 0.74), w);            // hard band core
      ctx.filter = 'none';
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
      ctx.filter = `blur(${Math.max(1.5, S * 0.0012).toFixed(1)}px)`;   // r8 soft spray edge
      strokeWrapped(ctx, S, p, rgb(mix(col, base, 0.35), 0.40), S * 0.005);
      fillWrapped(ctx, S, p, rgb(col, 0.90));
      ctx.filter = 'none';
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
      const n = 6 + ((rng() * 6) | 0);
      let placed = 0, guard = 0;
      while (placed < n && guard++ < n * 8) {
        const px2 = d.x + (rng() - 0.5) * d.r * 3.6;
        const py2 = d.y + (rng() - 0.5) * d.r * 2.6;
        if (!ctx.isPointInPath(d.p, px2, py2)) continue;
        dotWrap(px2, py2, S * (0.0040 + rng() * 0.0034));
        placed++;
      }
    }
    // dark dots on the base BETWEEN patches (never on the patches — dots on
    // everything is what mushed the scheme into confetti)
    for (let i = 0; i < 110; i++) {
      const x = rng() * S, y = rng() * S;
      let inside = false;
      for (const d of drawn) { if (ctx.isPointInPath(d.p, x, y)) { inside = true; break; } }
      if (inside) continue;
      ctx.fillStyle = rgb(patches[(rng() * patches.length) | 0], 0.88);
      dotWrap(x, y, S * (0.0038 + rng() * 0.0032));
    }
  } else if (scheme === 'nato' && patches.length) {
    // NATO 3-colour (Bundeswehr Gefechtstarnung / MERDC family): angular
    // ELONGATED patches swept along one per-vehicle direction at 2-3 scales —
    // brown field patches first, then sparse black riding the brown
    // boundaries the way the real scheme shadows them. (r7: same-size rounded
    // soft blobs read leopard-print at garage distance.)
    // r10 (critic: "sharp polygonal shards / confetti-sized black chips read
    // as vinyl stickers"): boundaries are FEATHERED like the stripes/ambush
    // schemes (sprayed paint has soft flanks), patch count drops ~30% with
    // larger cores so blobs flow across panel seams, and the minimum black
    // patch is ~2x bigger so no black lands as a confetti chip.
    // tank_models r2 (critic minor: factory/summer "soft-edged ... blobs read
    // airsoft-arcade"): patch scale trimmed ~25% and core alpha raised so the
    // sprayed boundary reads hard at garage distance (NATO/CARC masks are
    // crisp; only a narrow overspray flank stays soft).
    const black = patches[0], brown = patches[1] || patches[0];
    const dirA = rng() * Math.PI;
    const centers = [];
    const nBrown = Math.round(9 * nK);
    for (let i = 0; i < nBrown; i++) {
      const r = S * wk * (i < nBrown * 0.4 ? 0.072 + rng() * 0.042 : 0.040 + rng() * 0.030);
      const x = rng() * S, y = rng() * S;
      const p = camoPatchPath2D(rng, x, y, r, dirA + (rng() - 0.5) * 0.55);
      sprayEdge(p, brown, 0.97);           // r2: hard core + overspray specks
      centers.push([x, y, r]);
    }
    const nBlack = Math.round(5 * nK);
    for (let i = 0; i < nBlack; i++) {
      const r = S * wk * (i < nBlack * 0.4 ? 0.052 + rng() * 0.028 : 0.040 + rng() * 0.022);
      let x = rng() * S, y = rng() * S;
      if ((i & 1) && centers.length) {           // ride a brown patch boundary
        const c2 = centers[(rng() * centers.length) | 0];
        const a2 = rng() * Math.PI * 2;
        x = c2[0] + Math.cos(a2) * c2[2] * 1.2;
        y = c2[1] + Math.sin(a2) * c2[2] * 0.9;
      }
      const p = camoPatchPath2D(rng, x, y, r, dirA + (rng() - 0.5) * 0.7);
      sprayEdge(p, black, 0.95);           // r2: hard core + overspray specks
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
    // r9: pale lift 0.35 -> 0.12 — the extra whitening stacked on the palette
    // highlight and fed the garage-key blowout (see patternVisual 'desert')
    const paleHC = mix(pale, [255, 252, 238], 0.12);
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
    // r8 confetti fix: the pale sand tone used to arrive as ~27 identically
    // sized chips at even density (1/3 of the mid shards + half the small
    // flecks) — leopard-print at garage distance on Tiger/Abrams. The pale
    // highlight is now FEW large elongated bands swept along one per-vehicle
    // diagonal (sprayed desert geometry), and all small flecking clusters
    // around those bands' edges with a 3x+ size spread (overspray language)
    // instead of raining uniformly across the hull.
    const dirD = rng() * Math.PI;
    const paleBands = [];
    // r9: band count 3 -> 2.5 x nK and radius trimmed — pale coverage down
    // ~25% so the highlight reads as sprayed accents, not dazzle chips
    for (let i = 0; i < Math.max(2, Math.round(2.5 * nK)); i++) { // pale bands
      const r = S * wk * (0.085 + rng() * 0.07);
      const x = rng() * S, y = rng() * S;
      const p = camoPatchPath2D(rng, x, y, r, dirD + (rng() - 0.5) * 0.4);
      strokeWrapped(ctx, S, p, rgb(mix(paleHC, base, 0.45), 0.4), S * 0.006);
      fillWrapped(ctx, S, p, rgb(paleHC, 0.93));
      paleBands.push([x, y, r]);
    }
    for (let i = 0; i < Math.round(6 * nK); i++) {                // mid shards (dark/mid only)
      const r = S * wk * (0.045 + rng() * 0.075);
      const col = rng() < 0.5 ? darkHC : mid2;
      fillWrapped(ctx, S, polyPath2D(rng, rng() * S, rng() * S, r, 5, 0.7), rgb(col, 0.94));
    }
    for (const [bx, by, br] of paleBands) {                       // clustered flecks
      const n = 4 + ((rng() * 5) | 0);
      for (let i = 0; i < n; i++) {
        const a3 = rng() * Math.PI * 2;
        const d3 = br * (0.9 + rng() * 1.5);
        const x = bx + Math.cos(a3) * d3, y = by + Math.sin(a3) * d3 * 0.7;
        const r = S * wk * (0.010 + rng() * rng() * 0.040);       // ~3-5x size spread
        fillWrapped(ctx, S, polyPath2D(rng, x, y, r, 4, 0.8),
          rgb(rng() < 0.45 ? darkHC : paleHC, 0.85));
      }
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
    // r8 rework (winter blowout critique): the wash is ~70% cover over the
    // base coat — brighter brushed streaks sit BETWEEN visible grey-green
    // gaps, worn edges show real paint, and the shadow washes went neutral
    // grey (the old blue-tinted radials read as stray pale-blue patches).
    // r10 (critic: winter M1A2 still rendered as blown-out unlit white clay):
    // whitewash albedo is CLAMPED to the ~0.60-0.65 matte-paint band — the
    // palette base dropped a step (see patternVisual 'winter'), the bright
    // brushed strokes are dimmer, worn-through base paint doubles, and a
    // dust-ochre grime pass keyed to the under color masses toward the lower
    // plates so the wash keeps form under the warm garage key.
    for (let i = 0; i < 74; i++) {
      const x0 = rng() * S, y0 = rng() * S;
      const len = S * (0.08 + rng() * 0.2);
      const w = S * (0.012 + rng() * 0.03);
      const path = new Path2D();
      path.moveTo(x0, y0);
      path.quadraticCurveTo(x0 + (rng() - 0.5) * w * 3, y0 + len * 0.5, x0 + (rng() - 0.5) * w * 4, y0 + len);
      strokeWrapped(ctx, S, path, 'rgba(214,217,207,0.16)', w * 1.5);
      strokeWrapped(ctx, S, path, 'rgba(226,228,219,0.20)', w);
    }
    // worn-through patches revealing the base vehicle paint (heavier at r8 —
    // the wash needs visible green bones to avoid the white-mass read)
    for (let i = 0; i < 52; i++) {
      const r = S * (0.012 + rng() * 0.045);
      const p = blobPath2D(rng, rng() * S, rng() * S, r);
      fillWrapped(ctx, S, p, rgb(under, 0.26 + rng() * 0.40));
    }
    // grey streaking down the plates (rain-washed whitewash)
    for (let i = 0; i < 70; i++) {
      const x0 = rng() * S, y0 = rng() * S, len = S * (0.05 + rng() * 0.14);
      const path = new Path2D();
      path.moveTo(x0, y0);
      path.lineTo(x0 + (rng() - 0.5) * 6, y0 + len);
      strokeWrapped(ctx, S, path, `rgba(118,122,110,${0.10 + rng() * 0.12})`, 1.5 + rng() * 4);
    }
    // dust-ochre grime — camo_spotting r2: the mix is now dominated by a
    // FIXED ochre so the pass reads on every hull. Keyed 50% to `under`, a
    // green factory coat (T-34) produced greenish-dark grime that vanished
    // at 0.10 alpha while the Tiger's Dunkelgelb flared warm — same pattern
    // id, one tank grimy, one plastic-clean (r1 winter critique).
    const grime = mix(under, [118, 98, 62], 0.72);
    for (let i = 0; i < 30; i++) {
      const x = rng() * S, y = rng() * S, r = S * (0.03 + rng() * 0.08);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgb(grime, 0.14 + rng() * 0.13));
      g.addColorStop(1, rgb(grime, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // worn-bleed streaking (r2, all hulls): ochre-grey runs dragged down the
    // plates — the Tiger carried this read via its warm feature weeps while
    // green-based hulls stayed toy-clean; now it is part of the scheme.
    for (let i = 0; i < 44; i++) {
      const x0 = rng() * S, y0 = rng() * S, len = S * (0.04 + rng() * 0.12);
      const tone = rng() < 0.5 ? grime : mix(under, [104, 108, 98], 0.55);
      const path = new Path2D();
      path.moveTo(x0, y0);
      path.lineTo(x0 + (rng() - 0.5) * 5, y0 + len);
      strokeWrapped(ctx, S, path, rgb(tone, 0.10 + rng() * 0.14), 2 + rng() * 5);
    }
    // neutral shadow washes so the wash never reads as flat white
    for (let i = 0; i < 18; i++) {
      const x = rng() * S, y = rng() * S, r = S * (0.05 + rng() * 0.12);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(104,108,98,0.13)');
      g.addColorStop(1, 'rgba(104,108,98,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // r2 unification luma ceiling (same treatment as 'fleck'): the tonal /
    // mottle lifts pushed bright texels ~7% over the authored '#9ba18f'
    // whitewash band, which the warm garage key then blew into cream — no
    // texel may exceed the authored base luma +4%.
    {
      const lumaOf = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      const maxL = lumaOf(base) * 1.04;
      const img = ctx.getImageData(0, 0, S, S);
      const dd = img.data;
      for (let i = 0; i < dd.length; i += 4) {
        const l = 0.2126 * dd[i] + 0.7152 * dd[i + 1] + 0.0722 * dd[i + 2];
        if (l > maxL) {
          const k = maxL / l;
          dd[i] *= k; dd[i + 1] *= k; dd[i + 2] *= k;
        }
      }
      ctx.putImageData(img, 0, 0);
    }
  } else if (scheme === 'fleck' && patches.length) {
    // Flecktarn (camo_spotting r2 legibility rework): the r9 specks (6-22 px,
    // ~12% total coverage) were pedestal-illegible on the Tiger — they read
    // as dirt/mold speckle over a light khaki field, not a scheme, while the
    // Russian digital on the T-90M resolved as a proper 3-tone lattice.
    // Vehicle Flecktarn is a DENSE interlocking dapple field: the three patch
    // tones now carry ~45-55% of the surface as ragged multi-speck clusters
    // (~4-5 tone regions per square meter, dapples ~7-20 cm, so 2-3 distinct
    // clusters read per hull panel at 12 m). Geometry rides wk exactly like
    // the digital scheme's cell math so dapples hold the same world size on
    // every tank, and the composited field is luma-clamped to the authored
    // base/weather tones (the winter r10 treatment) so the tonal and mottle
    // layers can never lift the field lighter than the authored '#57604a'.
    for (let pass = 0; pass < patches.length; pass++) {
      const col = patches[pass];
      const nCl = Math.round(13 * nK);
      for (let cl = 0; cl < nCl; cl++) {
        const cx = rng() * S, cy = rng() * S;
        const cr = S * wk * (0.05 + rng() * 0.055);   // tone-region core
        const n = 5 + ((rng() * 5) | 0);
        for (let i = 0; i < n; i++) {
          const a = rng() * Math.PI * 2, d = rng() * cr;
          const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.8;
          const r = S * wk * (0.018 + rng() * 0.032); // ragged dapple
          fillWrapped(ctx, S, polyPath2D(rng, x, y, r, 6, 0.75), rgb(col, 0.92));
        }
      }
      // fine-grain octave: sparse lone flecks between the tone regions
      for (let i = 0; i < Math.round(70 * nK); i++) {
        const r = S * wk * (0.005 + rng() * 0.011);
        fillWrapped(ctx, S, polyPath2D(rng, rng() * S, rng() * S, r, 5, 0.8), rgb(col, 0.85));
      }
    }
    // composited-base luma ceiling: no texel may end up brighter than the
    // authored weather tone (+4%) — the r9 field drifted far lighter than
    // the authored base under the tonal/mottle lifts.
    {
      const lumaOf = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      const maxL = Math.max(lumaOf(base), lumaOf(weather)) * 1.04;
      const img = ctx.getImageData(0, 0, S, S);
      const dd = img.data;
      for (let i = 0; i < dd.length; i += 4) {
        const l = 0.2126 * dd[i] + 0.7152 * dd[i + 1] + 0.0722 * dd[i + 2];
        if (l > maxL) {
          const k = maxL / l;
          dd[i] *= k; dd[i + 1] *= k; dd[i + 2] *= k;
        }
      }
      ctx.putImageData(img, 0, 0);
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
    // r8: `digitalCellK` (palette knob, see patternVisual USSR/Russia)
    // scales the whole cell lattice UP for palettes whose blocks collapsed
    // into speckle at pedestal distance; rect count and fine grain scale
    // DOWN with it so coverage density stays constant.
    const cellK = Math.max(1, visual.digitalCellK || 1);
    const cells = Math.max(Math.round(96 / cellK),
      Math.round(128 / (Math.max(wk, 0.5) * cellK)));
    const cell = S / cells;
    const GRID = 16;
    const perCluster = Math.max(5, Math.round(12 / cellK));
    let ci = 0;
    for (let gy = 0; gy < GRID; gy++) {
      for (let gx = 0; gx < GRID; gx++) {
        const col = patches[ci++ % patches.length];
        const cx = (((gx + rng()) * cells) / GRID) | 0;
        const cy = (((gy + rng()) * cells) / GRID) | 0;
        ctx.fillStyle = rgb(col, 0.92);
        for (let k = 0; k < perCluster; k++) {
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
    for (let i = 0; i < Math.round(700 / (cellK * cellK)); i++) {
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
      ctx.fillStyle = `rgba(0,0,0,${0.028 + 0.022 * rng()})`;
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

  // r10: grain trimmed 0.075 -> 0.055 — part of the "flour-dust white
  // speckle" read on top plates under the warm garage key.
  // tank_models r5: 0.055 -> 0.034 — at pedestal range the survivors still
  // read as rendering noise, not paint. Weathering now leans on the darker
  // low-frequency grime passes below instead of per-pixel salt.
  applyGrain(ctx, S, seed ^ 0x51ab, 0.034);

  // ---- plate feature overlay (matches height/roughness maps) --------------
  const px = (v) => v * S;
  // panel lines: dark recess + light catch-edge below
  ctx.lineCap = 'butt';
  const lw = Math.max(2, S / 800);
  for (const l of feats.hLines) {
    const y = px(l.p);
    for (const [a, b] of lineSegs(l)) {
      // r9: line weight backed off 0.40 -> 0.24 — panel joins should read as
      // machining, not the unbeveled papercraft creases the critic flagged.
      ctx.fillStyle = 'rgba(10,10,8,0.24)'; ctx.fillRect(px(a), y, px(b - a), lw);
      ctx.fillStyle = 'rgba(255,250,235,0.07)'; ctx.fillRect(px(a), y + lw, px(b - a), 1.5);
    }
  }
  for (const l of feats.vLines) {
    const x = px(l.p);
    for (const [a, b] of lineSegs(l)) {
      ctx.fillStyle = 'rgba(10,10,8,0.24)'; ctx.fillRect(x, px(a), lw, px(b - a));
      ctx.fillStyle = 'rgba(255,250,235,0.07)'; ctx.fillRect(x + lw, px(a), 1.5, px(b - a));
    }
  }
  // weld beads: dashed light/dark stitch straddling the line
  const weldDash = (horiz, l) => {
    const p = l.p;
    const step = S / 160;
    for (let t = 0; t < S; t += step) {
      if (inGap(l, t / S)) continue;
      const jit = (rng() - 0.5) * step * 0.3;
      // r10: stitch highlight halved — the bright dashes read as white
      // speckle rows on roof plates ("flour dust" critique).
      const a = 0.09 + rng() * 0.09;
      ctx.fillStyle = `rgba(214,206,188,${a})`;
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
    ctx.fillStyle = 'rgba(216,208,186,0.20)';   // r10: dome glint dimmed (speckle)
    ctx.beginPath(); ctx.arc(x - r * 0.2, y - r * 0.28, r * 0.62, 0, Math.PI * 2); ctx.fill();
  };
  const boltR = Math.max(3, S / 340);
  // r10: modern MBTs are welded composite — full-length rivet/bolt rows made
  // the T-90M read "riveted flat panels" (critic). Rows are WW2-only; hatch
  // bolt RINGS stay for everyone.
  const lineBolts = !visual.modernWelds;
  for (const l of feats.hLines) if (l.bolts && lineBolts) {
    const step = S / 26;
    for (let t = step / 2; t < S; t += step) if (!inGap(l, t / S)) bolt(t, px(l.p) + boltR * 2.4, boltR);
  }
  for (const l of feats.vLines) if (l.bolts && lineBolts) {
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
  // paint chips — dark pit with a worn-metal glint above (from plan).
  // r10 ("flour dust" critique): glints tinted toward dust ochre keyed to the
  // base color and cut ~50% — the old cool near-white pips read as a uniform
  // white powder stipple across every top plate under the garage key.
  const glintCol = rgb(mix(scale3(base, 1.35), [168, 156, 128], 0.55), 0.24);
  for (const c of feats.chips) {
    const x = px(c.x), y = px(c.y), r = Math.max(0.8, px(c.r));
    ctx.fillStyle = c.metal ? 'rgba(96,92,82,0.55)' : 'rgba(25,22,18,0.55)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    if (c.metal) {
      ctx.fillStyle = glintCol;
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

  // rolled-steel / casting undulation: large soft bumps. r9: count/amplitude
  // up so light visibly breaks across big flat plates (cast/rolled-steel
  // normal noise — Tiger papercraft critique).
  for (let i = 0; i < 200; i++) {
    const x = rng() * S, y = rng() * S, r = S * (0.02 + rng() * 0.09);
    const up = rng() < 0.5;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, up ? 'rgba(255,255,255,0.085)' : 'rgba(0,0,0,0.085)');
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
        ctx.fillStyle = 'rgba(255,255,255,0.20)';
        ctx.fillRect(x0, y + phase, x1 - x0, Math.max(1, pitch >> 1));
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
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
      ctx.fillStyle = 'rgba(0,0,0,0.36)';
      if (horiz) ctx.fillRect(px(a), px(l.p), px(b - a), w); else ctx.fillRect(px(l.p), px(a), w, px(b - a));
      ctx.fillStyle = 'rgba(0,0,0,0.13)';
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
  const lineBolts = !visual.modernWelds;   // r10: no rivet rows on modern MBTs
  for (const l of feats.hLines) if (l.bolts && lineBolts) {
    const step = S / 26;
    for (let t = step / 2; t < S; t += step) if (!inGap(l, t / S)) bolt(t, px(l.p) + boltR * 2.4);
  }
  for (const l of feats.vLines) if (l.bolts && lineBolts) {
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
    // Balkenkreuz, mid-war OPEN form (camo_spotting r2): four white corner
    // flanges tracing the inner corners of the cross, thin black edging, and
    // a paint-transparent core so the hull camo shows through the arms. The
    // old solid cross (200 px bars at 0.96 albedo) crossed the 1.55 bloom
    // knee under the garage key and read as a glowing sticker on every
    // pattern; white area drops ~60% here and the flange albedo is clamped
    // to ~0.80 luma (worn field-applied paint, never fresh white).
    const W = 'rgba(203,199,188,0.93)';
    const K = 'rgba(26,26,24,0.88)';
    const t = 17;              // flange band thickness
    const leg = 68;            // flange leg length along each arm edge
    // legs as [x, y, w, h]: horizontal + vertical leg per corner, meeting at
    // the four inner corners of the plus (arm box 96..160 across, 28..228 long)
    const legs = [
      [96 - leg, 96, leg, t], [96, 96 - leg, t, leg],           // top-left
      [160, 96, leg, t], [160 - t, 96 - leg, t, leg],           // top-right
      [96 - leg, 160 - t, leg, t], [96, 160, t, leg],           // bottom-left
      [160, 160 - t, leg, t], [160 - t, 160, t, leg],           // bottom-right
    ];
    ctx.strokeStyle = K;
    ctx.lineWidth = 5;
    for (const [x, y, w, h] of legs) ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = W;
    for (const [x, y, w, h] of legs) ctx.fillRect(x, y, w, h);
    // deterministic wear nicks so the flanges read as brushed-on paint
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 26; i++) {
      const [x, y, w, h] = legs[i % legs.length];
      const px2 = x + ((i * 73) % 97) / 97 * w;
      const py2 = y + ((i * 41) % 89) / 89 * h;
      ctx.globalAlpha = 0.35 + ((i * 29) % 50) / 100;
      ctx.beginPath();
      ctx.arc(px2, py2, 1.5 + ((i * 17) % 30) / 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
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

// r8 exposure trim for the SHARED procedural albedo (not the GLB pattern
// tiles — composeGlbShare applies its own 0.84 multiply): full-brightness
// procedural paint rendered a milky pastel next to the trimmed Abrams GLB
// under the garage spots — the core of the roster-cohesion critique.
function exposureTrim(canvas, k = 0.86) {
  const ctx = canvas.getContext('2d');
  ctx.globalCompositeOperation = 'multiply';
  const v = Math.round(k * 255);
  ctx.fillStyle = `rgb(${v},${v},${v})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-over';
}

const TEX_CACHE = new Map();

function acquireSharedTextures(spec, aniso) {
  const key = spec.id;
  let entry = TEX_CACHE.get(key);
  if (!entry) {
    const patternId = resolveCamoPattern(key);
    // modernWelds: welded-composite hulls draw no rivet/bolt rows (r10)
    const vis = { ...resolveCamoVisual(spec, patternId), modernWelds: spec.era === 'modern' };
    const seed = 0x5eed ^ (key.split('').reduce((a, ch) => (a * 33 + ch.charCodeAt(0)) | 0, 7));
    const rng = mulberry32(seed);
    const feats = genPlateFeatures(rng);
    const camoCanvas = paintCamo(makeCanvas(ALBEDO_SIZE, ALBEDO_SIZE), vis, rng, feats, seed);
    exposureTrim(camoCanvas);
    const heightCanvas = paintHeight(makeCanvas(MAP_SIZE, MAP_SIZE), vis, rng, feats, seed);
    const normalCanvas = heightToNormal(heightCanvas, vis.zimmerit ? 2.6 : 2.6);
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

/**
 * PERF (perf-budget handoff): pre-upload every cached spec's burnt/ember maps
 * so the first kill of a battle doesn't pay a texture-upload stall inside a
 * combat frame (probe measured a 125 ms frame at first blood). Call once at
 * boot after all tanks are built; ~100 MB of uploads amortized off-battle.
 * @param {THREE.WebGLRenderer} renderer
 */
export function warmWreckTextures(renderer) {
  for (const entry of TEX_CACHE.values()) {
    if (entry.burntTex) renderer.initTexture(entry.burntTex);
    if (entry.emberTex) renderer.initTexture(entry.emberTex);
  }
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
  // char levels lifted (multiply #5a5049 + 0.42 near-black overlay -> #7d7268
  // + 0.28): the old stack pushed the wreck albedo to ~0.06 and the hull read
  // as a light-swallowing pure-black silhouette within 2 s of the kill (r6).
  // The wreck must stay CHARRED but keep readable camo/panel structure and
  // catch sun/fire rim light.
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = '#6e645c';
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(24,21,18,0.34)';
  ctx.fillRect(0, 0, S, S);
  // r1 anti-terracotta: kill most of the CAMO HUE under the char — a tan/
  // desert scheme multiplied by the warm char stack rendered the whole
  // sunlit deck as uniform terracotta ("painted clay", destroy_2_5s/4s).
  // Burnt paint is carbon: desaturate hard toward soot grey, keeping the
  // value pattern; the rust/bare-metal accents below re-add local color.
  ctx.globalCompositeOperation = 'saturation';
  ctx.fillStyle = 'rgba(128,128,128,0.72)';
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'source-over';
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
  // r1 scorched-steel variation (critique: wrecks read as featureless black
  // slabs): heat-rust bloom patches where the paint burned through, plus
  // short bright bare-metal scrape highlights along plate edges — the char
  // keeps readable material structure from every angle.
  for (let i = 0; i < 26; i++) {
    const x = rng() * S, y = rng() * S, r = (0.02 + rng() * 0.07) * S;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(122,72,40,${0.16 + rng() * 0.18})`);
    g.addColorStop(0.6, `rgba(96,54,30,${0.08 + rng() * 0.10})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 40; i++) {
    const x = rng() * S, y = rng() * S;
    const len = (0.015 + rng() * 0.05) * S;
    const horiz = rng() < 0.5;
    ctx.fillStyle = `rgba(148,142,130,${0.10 + rng() * 0.16})`;
    if (horiz) ctx.fillRect(x, y, len, 1 + rng() * 2);
    else ctx.fillRect(x, y, 1 + rng() * 2, len);
  }
  entry.burntTex = canvasTex(cv, { aniso, repeat: true });
  // ember emissive mask: mostly black with a few soft hot pockets — the glow
  // reads as embers smoldering in seams, never a uniform lava dip
  const E = 256;
  const ec = makeCanvas(E, E);
  const ectx = ec.getContext('2d');
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, E, E);
  // 11 pockets (was 6) at varied radii/heat so the smolder reads as scattered
  // embers in seams — more variation kills the r6 "featureless black" hull
  // r5: pockets shrunk (14-54 px -> 8-28 px) and dimmed — under the wreck's
  // world-space triplanar sampling the old radii blew up into 0.5-1 m soft
  // red "spotlight" blobs at close range; embers must read as seams/pockets.
  for (let i = 0; i < 13; i++) {
    const x = rng() * E, y = rng() * E, r = 8 + rng() * 20;
    const g = ectx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,${118 + Math.floor(rng() * 60)},48,${0.26 + rng() * 0.32})`);
    g.addColorStop(0.5, 'rgba(140,36,8,0.16)');
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
  // r8: pure solid left the GLB's baked-camo luma showing through on the
  // hull while the turret atlas stayed flat — coverage read inconsistent
  // across one vehicle (r7 factory critique). Tone-on-tone green patches
  // (same family, low contrast) put OUR pattern everywhere so hull, turret
  // and skirts read as one deliberate paint job; still clearly distinct from
  // 'summer's 3-color NATO.
  // r9: light patch desaturated/darkened ~25% — '#586349' rendered as
  // oversaturated lime blobs under the warm garage key ("paintball arena").
  // tank_models r1 (critic: factory/summer "nearly patternless — reads as
  // primer clay"): tone-on-tone was invisible at any distance. Factory is now
  // the roster §6.5 NATO 3-color (green #4c5d43 / black / red-brown) with the
  // black lifted off pure black so lighting still models the patch surface.
  // tank_models r2 (critic minor: factory "soft-edged lime-green + saturated
  // orange-tan blobs read airsoft-arcade"): green pulled down/grayer and the
  // red-brown desaturated a step further; blob scale/edge fixes live in the
  // 'nato' painter.
  m1a2: { scheme: 'nato', base: '#48573f', weather: '#526049', patches: ['#2e2e2e', '#584639'] },
  // tank_models r2: the Abrams VARIANTS must land on the SAME factory
  // woodland as the base m1a2 — their untextured kit parts (ARAT tiles, TUSK
  // shield, muzzle furniture) paint from the per-spec canvas while the baked
  // hull composite uses the shared USA nation tile, and any palette split
  // reads as mismatched toy parts (the r2 "bright-tan pyramid studs" major).
  m1a1: { scheme: 'nato', base: '#48573f', weather: '#526049', patches: ['#2e2e2e', '#584639'] },
  m1a2_tusk: { scheme: 'nato', base: '#48573f', weather: '#526049', patches: ['#2e2e2e', '#584639'] },
  // Hinterhalt tones: the authored '#7a4a35' Rotbraun reads bright orange
  // under the warm garage key light (r7 "orange/green cow spots"); drop both
  // patch tones toward RAL 6003/8017 so the scheme reads olive + chocolate.
  panther_g: { patches: ['#5d6334', '#5e3c29'] },
  // r8: the SAME Rotbraun flare on the Tiger's authored '#6f4530' stripes was
  // missed by the r7 fix (it only patched panther_g). The stripes scheme
  // paints its bands semi-transparent over the light Dunkelgelb, so the brown
  // must be authored DARKER than the panther's ambush fill to land on the
  // same RAL 8017 chocolate on screen (measured: '#5e3c29' still left 6.4%
  // of the hull in saturated orange vs the panther's 3.7%).
  tiger1: { patches: ['#5d6334', '#452c1e'] },
  // (t90m FACTORY needs no override: specs.js r8 authored it as the
  // roster-doc solid dark-forest green; the digital-legibility fix lives on
  // the picker 'digital' palette below, which stays a distinct choice.)
  // r9: the Strv 103's authored '#3f5a3a' brightens through the community-GLB
  // composite (the palette-atlas detail overlay recenters on mid-gray and
  // LIFTS dark tiles) and read lime/acid on the pedestal — brighter and more
  // saturated than every other factory paint. Authored darker + grayer so it
  // lands in the muted Swedish #4c5c44 family AFTER the overlay lift; the
  // '#6b6b47' khaki stripe tone is pulled down with it.
  strv103: { base: '#42503d', weather: '#4a5844', patches: ['#2c3629', '#565440'] },
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
    // the warm garage key (r7); r8 pulls it further off red ('#4c3a2a' still
    // leaned warm on the WW2 Dunkelgelb hulls next to Hinterhalt references)
    // r1: black patch albedo floor lifted #26291f -> #2e2e2e — the old tone
    // clipped to unlit pure black under any key (critic: "NATO black patches
    // clip to pure black with zero material response").
    o = { scheme: 'nato', base: '#4d5940', weather: '#59664a', patches: ['#2e2e2e', '#46392b'] };
  } else if (patternId === 'desert') {
    // 3-tone hard-edged desert geometry (scheme 'desert' in paintCamo):
    // patches = [dark shadow tan, mid earth, pale sand highlight].
    // Widened lightness split (r6: the old tones mipped to a uniform tan
    // wash at garage distance — the geometry has to survive at 12 m).
    // r9: highlight pulled down '#e4d3a8' -> '#d3bf92' — under the warm
    // garage key the old chip blew out toward pure white on tiger1/strv103/
    // m1a2 and the scheme read as high-contrast "chocolate chip" dazzle
    // (coverage is also trimmed ~25% in the desert painter above).
    o = { scheme: 'desert', base: '#b09466', weather: '#c4ad7d', patches: ['#6b5136', '#947c52', '#d3bf92'] };
  } else if (patternId === 'winter') {
    // r8: base dropped off near-white — '#c4c8bf' blew out to a featureless
    // white mass under the garage key (r7 winter critique); a worn grey-green
    // whitewash keeps panel definition and stays inside matte-paint range.
    // r10 (critic: winter still blew out to unlit near-white on the M1A2):
    // base clamped into the ~0.62 dirty-whitewash band — real winter wash is
    // chalky grey over dark paint, never near-white; the painter adds worn
    // base bleed + ochre grime (see the winter scheme in paintCamo).
    o = { scheme: 'winter', base: '#9ba18f', weather: '#7e8476', patches: [v.base || '#4b5320'] };
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
      // r9: brown pulled toward RAL 8031 — '#6b5136' flared orange under the
      // warm garage key (giraffe-dot critique rode partly on the color).
      o = { scheme: 'fleck', base: '#57604a', weather: '#616a53', patches: ['#39492f', '#584a39', '#2b2d26'] };
    } else if (nation === 'USSR' || nation === 'Russia') {
      // three tones (dark, muted khaki, mid-green) so the digital field reads
      // as camouflage rather than sparse tan stickers on flat green (r6).
      // r7: khaki + sage pulled darker — the old #8a7f5a/#55624a pair rendered
      // as minty pastel confetti under the garage key light.
      // r8 legibility: the r7 ladder collapsed at pedestal distance — '#485541'
      // was near-identical to the '#3f5138' base and the khaki too muted, so
      // the T-90M read as flat green with rust speckle. Tones re-spread
      // (near-black / light khaki / light-mid green) + digitalCellK doubles
      // the cell lattice so 2-3 distinct blocks read per hull panel at 12 m.
      o = { scheme: 'digital', base: '#3f5138', weather: '#47593f',
        patches: ['#262a20', '#7d7355', '#54683f'], digitalCellK: 2.2 };
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
// camo_spotting r2: winter running-gear whitewash is clamped ~15% darker than
// the hull wash — crews slop thinner coats on wheels and they shed to grime
// fast; at full hull luma the T-34-85's solid wheel discs rendered as
// near-white plastic toy rims under the warm garage key while the Tiger's
// tire-ringed wheels got away with it (r1 winter-consistency critique).
const wheelRgbOf = (v) => {
  const c = scale3(mix(scale3(hexToRgb(v.base), 0.92), [118, 110, 86], 0.22), 0.88);
  return v.scheme === 'winter' ? scale3(c, 0.85) : c;
};
// Recessed interleaved-row wheels bake their own occlusion: same scheme paint
// dropped toward shadow so the Schachtellaufwerk rows separate (r5). Kept at
// 0.66 — the old 0.5 rendered near-black in the wheel bay and the recessed
// rows read as GAPS between sparse floating wheels (r6 Tiger closeup).
const wheelDarkRgbOf = (v) => scale3(wheelRgbOf(v), 0.66);
const detailRgbOf = (v) => scale3(mix([65, 70, 58], hexToRgb(v.base), 0.5), 0.9);

function repaintEntry(entry, patternId) {
  const vis = { ...patternVisual(entry.spec, patternId), modernWelds: entry.spec.era === 'modern' };
  // pattern-specific rng stream; the shared `feats` plan keeps panel lines,
  // welds and bolts aligned with the (unchanged) normal/roughness maps.
  let ph = 0;
  for (const ch of patternId) ph = (ph * 31 + ch.charCodeAt(0)) | 0;
  paintCamo(entry.camoCanvas, vis, mulberry32(entry.seed ^ ph), entry.feats, entry.seed);
  exposureTrim(entry.camoCanvas);
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
// Per-spec chroma pre-compensation for picker patterns composited through
// the GLB atlas path (see composeGlbShare) — measured against the m1a2
// reference render under the garage key.
const GLB_CHROMA_COMP = { strv103: 0.82 };

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
        // dotted rows the real vehicle doesn't have. r9: floor raised again
        // (92 -> 106) — the surviving dot rows still read as red-tinted rivet
        // noise over brown pattern patches at closeup; broad AO shading sits
        // well above this floor so panel depth survives.
        // tank_models r5 (sandblasted-Abrams major): ceiling 178 -> 150 — the
        // asset's baked pale dust/wear texels overlay-brightened the pattern
        // up to ~2x, reading as a coarse white stipple across decks and cheeks
        // at closeup. 150 keeps highlights a gentle lift (<~1.35x) while AO
        // still darkens; the paint reads as one matte scheme.
        v = v < 106 ? 106 : (v > 150 ? 150 : v);
        dd[i] = dd[i + 1] = dd[i + 2] = v;
      }
      // tank_models r1 (critic: "columns of magenta/pink dot artifacts on the
      // hull side and glacis"): the asset bakes rows of small rivet/decal dots
      // whose remapped luma still punches through the overlay as regularly
      // spaced bright/dark pips — over brown pattern patches they read as
      // pink dots. Despeckle: any texel deviating hard from its 4-neighbor
      // mean is an isolated dot, not AO/panel shading — pull it to the mean.
      {
        const g = new Uint8ClampedArray(w * h);
        for (let p = 0, n = w * h; p < n; p++) g[p] = dd[p * 4];
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const p = y * w + x;
            const m4 = (g[p - 1] + g[p + 1] + g[p - w] + g[p + w]) * 0.25;
            const v0 = g[p];
            if (Math.abs(v0 - m4) > 14) {
              const i4 = p * 4;
              dd[i4] = dd[i4 + 1] = dd[i4 + 2] = m4;
            }
          }
        }
      }
      // mean-neutral detail (camo_spotting r2): the pow-0.6 remap centers the
      // atlas MEAN on 128, but the [106,150] clamp truncates dark-skewed
      // atlases asymmetrically — on the strv103 the layer's average landed
      // well below 1.0x, so the composited pattern rendered a step darker
      // than the identical pattern on the m1a2, and the darker panels picked
      // up proportionally more of the warm garage key ("two different desert
      // paint pots"). Rescale the clamped layer (opaque texels only) so its
      // mean multiplier is exactly 1.0.
      {
        let sum = 0, cnt = 0;
        for (let p = 0, n2 = w * h; p < n2; p++) {
          if (dd[p * 4 + 3] < 8) continue;
          sum += dd[p * 4]; cnt++;
        }
        const k = cnt ? 128 / Math.max(sum / cnt, 1) : 1;
        if (Math.abs(k - 1) > 0.01) {
          for (let p = 0, n2 = w * h; p < n2; p++) {
            let v = dd[p * 4] * k;
            v = v < 106 ? 106 : (v > 150 ? 150 : v);
            dd[p * 4] = dd[p * 4 + 1] = dd[p * 4 + 2] = v;
          }
        }
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
  // 2+3. the asset's baked detail + exposure trim as PURE LUMINANCE
  //    modulation (camo_spotting r2). The old canvas 'overlay' composite of
  //    the grayscale detail layer worked per channel: on a tan pattern texel
  //    (r,g > 128 > b) a dark AO texel darkened the low blue channel
  //    proportionally more than the screen-branch r/g, so every AO-heavy
  //    atlas region drifted MORE saturated and redder than the authored
  //    palette — measured on the strv103 desert: rendered hull sat 0.50 /
  //    hue 38 deg vs 0.39-0.40 / 43-48 deg for the identical pattern on
  //    m1a2/tiger1 ("two different desert paint pots"). The warm
  //    rgb(214,212,206) exposure multiply added another warm-bias step the
  //    procedural fleet's NEUTRAL 0.86 exposureTrim never had. Both are now
  //    a single per-pixel uniform RGB scale — detail m = det/128 (the
  //    detail layer is clamped to [106,150], so m spans 0.83-1.17, the same
  //    mid-tone response the overlay had) x neutral 0.831 exposure — which
  //    preserves hue and saturation EXACTLY: AO/panel shading modulates
  //    brightness only, and one desert paint pot serves the whole roster.
  //  3b. hard luminance ceiling (r6 winter/desert blowout gate) folded into
  //      the same pass: no texel past LUMA_MAX feeds the bloom pass.
  //  3c. palette saturation ceiling kept as a safety net: no composited
  //      texel may exceed the most saturated authored tone (+5% headroom).
  {
    const LUMA_MAX = 198;                          // ~0.78 encoded (r10: winter clay)
    const EXPOSURE = 212 / 255;                    // neutral trim (was warm 214,212,206)
    if (!share.detailData) {
      share.detailData = share.detail.getContext('2d').getImageData(0, 0, w, h).data;
    }
    const det = share.detailData;
    const pv = patternVisual(spec, patternId);
    let satMax = 0;
    for (const hx of [pv.base, pv.weather, ...(pv.patches || [])]) {
      if (!hx) continue;
      const c = hexToRgb(hx);
      const mx = Math.max(c[0], c[1], c[2]);
      const mn = Math.min(c[0], c[1], c[2]);
      if (mx > 0) satMax = Math.max(satMax, (mx - mn) / mx);
    }
    satMax = Math.min(1, satMax + 0.05);
    // per-spec chroma pre-compensation (camo_spotting r2): the Strv 103's
    // low sloped hull takes the warm garage key square-on with little
    // neutral fill, so identical composited palettes RENDER ~+0.08 more
    // saturated / 6 deg redder than on the m1a2 ("two different desert
    // paint pots"). Author the difference away in texture space for the
    // picker patterns; 'factory' keeps its already-compensated r9 tones.
    const chromaComp =
      (patternId !== 'factory' && GLB_CHROMA_COMP[spec.id]) || 1;
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const m = (det[i] / 128) * EXPOSURE;         // luminance-only detail
      let r = d[i] * m, g = d[i + 1] * m, b = d[i + 2] * m;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx > 8) {
        const sat = (mx - mn) / mx;
        const k = (sat > satMax ? satMax / sat : 1) * chromaComp;
        if (k !== 1) {
          const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          r = l + (r - l) * k; g = l + (g - l) * k; b = l + (b - l) * k;
        }
      }
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (lum > LUMA_MAX) {
        const s = LUMA_MAX / lum;
        r *= s; g *= s; b *= s;
      }
      d[i] = r; d[i + 1] = g; d[i + 2] = b;
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
      // scheme like everything else (r6 un-camo'd panel critique).
      // camo_spotting r2: 0.8 -> 0.92 — the 20% leak of arbitrary saturated
      // asset colors was one of the strv103 "second desert paint pot"
      // contributors; keep only a hint of per-part variation.
      rec.m.color.copy(rec.orig).lerp(target, 0.92);
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
      m.customProgramCacheKey = () => 'veh-ambient-floor-v2';
      return m;
    }
    : (m) => {
      // headless/tooling fallback: keep at least the readability floor
      m.onBeforeCompile = vehicleAmbientFloorHook;
      m.customProgramCacheKey = () => 'veh-ambient-floor-v2';
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
      // (recoloring them is what created bright pips on the skirts in r1).
      // Wave-2 (jagdtiger): assets whose whole PAINTED hull bakes near-black
      // opt into a lower skip threshold via visual.glbDarkPaintLuma — named
      // gear (GLB_SKIP_RE above) still keeps its factory look.
      const skipLuma = (spec.visual && spec.visual.glbDarkPaintLuma) ?? 0.10;
      if (share && share.meanLuma < skipLuma) {
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
      // tank_models r1 (critic: "blown-out cream highlight patches with
      // visible ordered-dither checkerboard" on glacis/cheeks): 0.62 GGX +
      // 0.6 env fired a broad clipped sheen across big flat GLB plates under
      // the field sun. Matte CARC: roughness up, env trimmed to the
      // procedural fleet's level.
      own.roughness = 0.74;
      if ('envMapIntensity' in own) own.envMapIntensity = 0.45;
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
      vertexColors: true,   // r8: baked dust/AO (modelLoader.refineCommunityGeometry)
      envMapIntensity: 0.55,
    });
    wheel.onBeforeCompile = vehicleAmbientFloorHook;
    wheel.customProgramCacheKey = () => 'veh-ambient-floor-v2';
    const track = new THREE.MeshStandardMaterial({
      // r2: pulled toward neutral dark iron with the procedural trackLink —
      // the warmer 0x4a453a flared tan under the garage key (T-90A gear)
      name: 'AddOnTrack', color: 0x413d35, roughness: 0.94, metalness: 0.1,
      roughnessMap: entry.roughTex,
      vertexColors: true,   // r8: baked dust/AO (modelLoader.refineCommunityGeometry)
      envMapIntensity: 0.1, // r1: no blue-sky sheen on community track runs
    });
    track.onBeforeCompile = vehicleAmbientFloorHook;
    track.customProgramCacheKey = () => 'veh-ambient-floor-v2';
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
// gameplay_feel r2 (critic MAJOR): the flat floor above was NOT enough — in
// live third-person drive captures the whole hull sat on the shadow side of
// the sun with dark-olive albedo (~0.08 luma), so 0.35×albedo ≈ 0.03 linear
// still crushed to a featureless black silhouette against sunlit grass.
// WoT keeps the player vehicle readable from EVERY bearing. Fix: a
// camera-anchored wrap fill — the indirect-diffuse floor scales with how much
// the surface faces the CAMERA (headlamp-style hemisphere fill), so whatever
// side the chase camera orbits to is lifted into readability while
// silhouette edges and camera-averted faces keep their shading. Applied to
// all vehicles (enemies must stay readable too — WoT does the same); the
// terrain/props keep their deep shadows for contrast. Sunlit response
// (~4.5×albedo direct) still dominates ~3:1, so lit-vs-shade hull form
// survives — verified no washout in tank_closeup_modern/garage/player_view.
// lighting_post r4: 1.45 → 0.55. At 1.45 the camera-facing floor EQUALED the
// full sun response (sun 4.5/π ≈ 1.43×albedo at N·L=1) — "the camera fill has
// erased directional modeling" (critic major). 0.55 ≈ 0.38× sun keeps the
// readability lift while N·L form shading reads again from every bearing.
// NOTE: the tank_models r10 high-albedo rolloff and the gameplay_feel r4
// shadow-band floor below are calibrated against THIS value ("~4x under the
// lit response") — do not raise it back.
const VEHICLE_VIEW_FILL = 0.55; // fill at full camera-facing (linear, ×albedo)
const VEHICLE_VIEW_WRAP = 0.40; // fraction kept at grazing angles (wrap term)

/**
 * Shader hook: clamp `reflectedLight.indirectDiffuse` to an albedo-scaled,
 * view-dependent floor. Chain via `setupShadowMaterial(mat,
 * vehicleAmbientFloorHook)` for CSM materials, or assign directly as
 * `onBeforeCompile` for sourced-GLB materials (see applyCamoToModel's clone
 * re-registration above/below).
 * @param {object} shader onBeforeCompile shader arg
 */
export function vehicleAmbientFloorHook(shader) {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <lights_fragment_end>',
    `#include <lights_fragment_end>
	{
		float vehFacing = saturate( dot( normal, geometryViewDir ) );
		float vehFill = max( ${VEHICLE_AMBIENT_FLOOR.toFixed(3)},
			${VEHICLE_VIEW_FILL.toFixed(3)} * ( ${VEHICLE_VIEW_WRAP.toFixed(3)} + ${(1 - VEHICLE_VIEW_WRAP).toFixed(3)} * vehFacing ) );
		// tank_models r10: high-albedo rolloff — on light paints (winter wash,
		// light greys) a flat albedo-scaled floor pushes the whole hull toward
		// clip and flattens form ("unlit near-white clay"). Cap the fill so the
		// resulting indirect floor never exceeds ~0.30 linear luminance.
		float vehLuma = max( dot( material.diffuseColor, vec3( 0.2126, 0.7152, 0.0722 ) ), 0.001 );
		vehFill = min( vehFill, 0.30 / vehLuma );
		// tank_models r5 (frosted/clay GLB major): the fill is a SHADE
		// readability device, but it ran unconditionally — under the garage
		// spots / field sun it stacked a 0.35-0.55×albedo ambient on top of the
		// full direct response, washing every sourced-GLB tank toward flat
		// pastel clay (light-grey Panzer III, frosted IS-3/Wei He, sandblasted
		// Abrams decks, blown q_heavy turret) and erasing camo pattern contrast
		// at pedestal range. Gate it by RECEIVED direct light, normalized by
		// albedo so dark paint gates the same as light paint: fully lit
		// surfaces keep only 12% of the fill, shaded surfaces (the calibrated
		// gameplay_feel case) keep 100%. The deep-shade floors below are
		// untouched.
		float vehIrrad = dot( reflectedLight.directDiffuse, vec3( 0.2126, 0.7152, 0.0722 ) ) / vehLuma;
		vehFill *= mix( 1.0, 0.12, smoothstep( 0.10, 0.55, vehIrrad ) );
		reflectedLight.indirectDiffuse = max( reflectedLight.indirectDiffuse, material.diffuseColor * vehFill );
		// >>> gameplay_feel r4: shadow-band luminance floor. The albedo-scaled
		// fill above still crushes to near-black when a dark-olive skin
		// (~0.05-0.09 linear albedo) sits sun-opposed inside a terrain/cloud
		// shadow band (r4 drive critique: the hull reads as an unreadable
		// black blob in drive_aim/drive_turn/drive_stop). Clamp the OUTGOING
		// diffuse luminance to a small normal-modulated floor applied along
		// the albedo hue: plates at different angles keep different floors so
		// hull attitude and plate separation survive full shade, and the
		// lighting_post r4 directional-modeling fix is untouched — the floor
		// sits ~4x under the lit response and only engages in deep shade.
		vec3 vehDiff = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
		float vehOutL = dot( vehDiff, vec3( 0.2126, 0.7152, 0.0722 ) );
		// >>> gameplay_feel r5: adaptive deep-canopy lift. At the 0.115 floor a
		// hull parked/driving in DENSE forest shade (direct term ~0) still read
		// as a light-swallowing black silhouette against sunlit foliage at the
		// 13 m chase distance (r5 drive critique, drive_a_uphill/drive_c_rough).
		// Blend the floor toward 0.21 as the received direct light collapses —
		// a camera-anchored hemispheric bounce, WoT-style: sunlit and dappled
		// response (direct luminance > ~0.10) is completely untouched, so the
		// lighting_post r4 directional-modeling calibration holds in the open.
		float vehDirL = dot( reflectedLight.directDiffuse, vec3( 0.2126, 0.7152, 0.0722 ) );
		// tank_models r5 (clay-lift root cause): the shade estimate compared
		// REFLECTED luminance to an absolute 0.02-0.10 window, so dark paint
		// (0.05-0.08 albedo: Panzergrau, 4BO green) tested as "deep shade" even
		// in full sun/garage light, and the absolute 0.115-0.21 output floor
		// then clamped the whole hull to flat light-grey clay, erasing texture
		// contrast (light-grey Panzer III, frosted IS-3 / Wei He, washed GLB
		// decks). Normalize by albedo (-> incident-irradiance estimate, same
		// for dark and light paints) and fade the WHOLE floor out when lit —
		// the deep-shade/canopy behavior gameplay_feel calibrated (direct ~ 0)
		// keeps its 0.21 lift exactly; lit surfaces keep their real shading.
		float vehShade = 1.0 - smoothstep( 0.10, 0.45, vehDirL / vehLuma );
		// tank_models r1 (critic: "flat pale-green clay" GLB hulls, "bone-white
		// chalk" T-90A gear, blue-tinted pastel track links). The r5 shade test
		// only looked at DIRECT light, so every ordinary self-shadowed face of
		// a sunlit/garage-lit tank counted as "deep canopy" and got floored to
		// 0.13-0.21 with a 75%-desaturated tint — dark green washed to pale
		// sage, near-black running gear to chalk. Deep shade means direct AND
		// ambient are both low: fade the floor out as the ambient stack
		// (hemi + IBL, already accumulated in indirectDiffuse) approaches a
		// healthy irradiance, so the canopy case (dim ambient ~0.15-0.30 of
		// albedo) keeps its lift and shadow sides under open sky keep their
		// real shading.
		float vehIndL = dot( reflectedLight.indirectDiffuse, vec3( 0.2126, 0.7152, 0.0722 ) );
		vehShade *= 1.0 - smoothstep( 0.35, 0.75, vehIndL / vehLuma );
		// gameplay_feel r1: shadow-side rim term — grazing plates in DEEP shade
		// keep readable form (0.084 -> ~0.18 luma at vehShade=1) while the lit
		// response and the tank_models r5 clay calibration stay untouched
		// (at vehShade=0 the factor is identical).
		float vehRim = pow( 1.0 - vehFacing, 2.0 );
		float vehFloorL = mix( 0.02, 0.21, vehShade )
			* ( 0.40 + 0.60 * vehFacing + 0.45 * vehRim * vehShade );
		// very dark hardware (rubber, track steel, oily fittings) must stay
		// dark even in deep shade — scale the floor down below ~0.09 albedo
		// luma so gear never lifts to chalk while dark-olive PAINT (the
		// calibrated gameplay_feel case, ~0.05-0.09) keeps most of its lift.
		vehFloorL *= mix( 0.30, 1.0, smoothstep( 0.025, 0.09, vehLuma ) );
		// <<< gameplay_feel r5
		if ( vehOutL < vehFloorL ) {
			vec3 vehTint = material.diffuseColor / vehLuma;
			// r1: 0.75 -> 0.92 hue retention — the washed-white component of
			// the lift is what read as clay/chalk on every GLB vehicle.
			vehTint = mix( vec3( 1.0 ), vehTint, 0.92 );
			reflectedLight.indirectDiffuse += vehTint * ( vehFloorL - vehOutL );
		}
		// <<< gameplay_feel r4
	}`,
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
  // r8: envMapIntensity 0.55 across the painted set — full-strength IBL
  // washed the procedural fleet a milky pastel next to the Abrams GLB
  // (whose composite runs at 0.6), the core of the "CAD clay" cohesion
  // critique. Clearcoat trimmed with it.
  const hull = track(setup(new THREE.MeshPhysicalMaterial({
    map: camoTex, roughnessMap: roughTex, roughness: 0.95, metalness: 0.06,
    normalMap: normalTex, normalScale: new THREE.Vector2(1.3, 1.3),
    // lighting_post r4: sheen without white-deck — NO clearcoatRoughnessMap
    // (map dips spike the lobe and blow flat rear fenders to mirror-white).
    clearcoat: 0.12, clearcoatRoughness: 0.60,
    vertexColors: true, envMapIntensity: 0.55,
  })));

  // CAMO PATTERN SECTION: wheel dishes and fittings are scheme-painted — the
  // colors derive from the ACTIVE pattern (not the factory palette) and the
  // materials register on the shared entry so pattern switches re-tint them
  // live (r1: lime-green road wheels under winter whitewash).
  const patVis = patternVisual(spec, shared.patternId);
  // tank_models r1 (critic: Tiger wheels "blue-black glossy plastic"): the
  // 0.8-roughness base under the multiplying roughnessMap dipped effective
  // GGX to ~0.3 pockets, and envMapIntensity 0.55 mirrored the blue PMREM sky
  // off every dish in the wheel-bay shade. Painted road wheels are dusty
  // matte — roughness up, env cut to the trackLink level.
  const wheels = track(setup(new THREE.MeshStandardMaterial({
    color: new THREE.Color(cssRGB(wheelRgbOf(patVis))),
    roughness: 0.92, metalness: 0.08, roughnessMap: roughTex,
    normalMap: normalTex, normalScale: new THREE.Vector2(0.4, 0.4),
    envMapIntensity: 0.25,
  })));
  // Recessed rows of an interleaved (Schachtellaufwerk) wheel stack: same
  // scheme paint pushed into shadow so the layers separate visually (r5).
  const wheelsRecessed = track(setup(new THREE.MeshStandardMaterial({
    color: new THREE.Color(cssRGB(wheelDarkRgbOf(patVis))),
    roughness: 0.94, metalness: 0.06, roughnessMap: roughTex,
    normalMap: normalTex, normalScale: new THREE.Vector2(0.4, 0.4),
    envMapIntensity: 0.2,
  })));
  const rubber = track(setup(new THREE.MeshStandardMaterial({
    color: 0x1d1d1f, roughness: 0.96, metalness: 0.0,
  })));
  // Accessories must never read as raw #000 blockout: scheme-tinted fittings
  // and gunmetal hardware, both with roughness variation.
  // r9 (camo white-deck major): the old 0.66-roughness/0.28-metalness combo
  // turned every LARGE flat fitting into a sky mirror at grazing angles — the
  // T-34-85 engine access plate and the T-90M deck-grille louvers rendered
  // bare WHITE under the garage key in every pattern (Fresnel -> 1 at grazing
  // + roughnessMap dipping effective GGX to ~0.3), so the scheme tint that
  // repaintEntry applies was invisible. Fittings are brush-painted over steel:
  // matte, same response family as the wheels (0.8/0.1), env trimmed.
  // (Measured: at 0.85/0.10 the grazing Fresnel sheen STILL washed the plate
  // — the hull only survives the same key because it runs roughness 1.0 with
  // a dark map. Fittings paint matches the hull's fully-matte response.)
  const detail = track(setup(new THREE.MeshStandardMaterial({
    color: new THREE.Color(cssRGB(detailRgbOf(patVis))),
    roughness: 1.0, metalness: 0.04, roughnessMap: roughTex,
    normalMap: normalTex, normalScale: new THREE.Vector2(0.35, 0.35),
    envMapIntensity: 0.25,
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
  // r9 (camo white-deck major, second half): default envMapIntensity 1.0 +
  // metalness 0.45 mirrored the bright PMREM zenith off big HORIZONTAL dark
  // plates — the T-90M's engine-deck grille base read light gray from the
  // garage camera while small vertical hardware looked fine. Gunmetal on a
  // fighting vehicle is dusty and near-diffuse; keep the tone, kill the sky
  // mirror.
  const dark = track(setup(new THREE.MeshStandardMaterial({
    color: 0x33383a, roughness: 0.9, metalness: 0.22, roughnessMap: roughTex,
    envMapIntensity: 0.3,
  })));
  // Individual track-link pads: worn dusty steel, clearly lighter than the
  // shadowed band behind them so the run reads as articulated links up close.
  // r7: metalness dropped 0.38 -> 0.16 and roughness raised — under the field
  // sun the old values fired a glossy-black-plastic specular off sprockets
  // and link pads; worn track steel is dusty and near-diffuse.
  // r10 (critic: "blue-violet specular tint on sprocket/idler wraps — reads
  // anodized"): the default envMapIntensity 1.0 mirrored the blue PMREM sky
  // off every link/sprocket. Worn track steel is dusty near-diffuse — env
  // response cut hard, metalness trimmed, color nudged toward dust brown.
  // tank_models r1: color pulled to dust-brown iron and env cut again — the
  // 0.22 sky response still tinted whole link runs blue-violet in wheel-bay
  // shade ("blue-tinted duplo bricks" critique).
  // tank_models r2 (critic major: Leo 2A7 "near-side track renders light
  // desert-tan while the far track is dark steel"): the 0x57503f dust-brown
  // pads flared warm TAN under direct key light while the shaded far side
  // kept the dark band read — one vehicle, two apparent track materials.
  // Neutral dark iron with only a hint of dust keeps both sides in the same
  // family under any lighting.
  const trackLink = track(setup(new THREE.MeshStandardMaterial({
    color: 0x46423a, roughness: 0.94, metalness: 0.08, roughnessMap: roughTex,
    envMapIntensity: 0.1,
  })));
  // Spare track links carried as stowage/armor: dark oily track steel — the
  // light-grey trackLink shade read as unpainted plastic sprue racked on the
  // Tiger turret sides (r6); the live run needs the lighter tone, spares don't.
  const spareTrack = track(setup(new THREE.MeshStandardMaterial({
    color: 0x3c3a33, roughness: 0.85, metalness: 0.15, roughnessMap: roughTex,
    envMapIntensity: 0.1,   // r1: kill the blue sky sheen entirely (see trackLink)
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
    vertexColors: true, envMapIntensity: 0.55,
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
  // r5 WORLD-SPACE TRIPLANAR charred sampling: the burnt swap must work on
  // ANY mesh, including sourced GLBs whose palette-atlas UVs collapse whole
  // faces to a few texels — with plain UV sampling those wrecks rendered as
  // a featureless black slab with the ember pockets magnified into giant
  // soft red "spotlight" blobs (r4 wreck-closeup major). Triplanar in world
  // space gives every wreck the same soot/char frequency regardless of UV
  // layout or model unit scale; wrecks are static, so no texture swim.
  burnt.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBwPos;\nvarying vec3 vBwNrm;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec4 bwp = vec4( transformed, 1.0 );
  vec3 bwn = objectNormal;
  #ifdef USE_INSTANCING
    bwp = instanceMatrix * bwp;
    bwn = mat3( instanceMatrix ) * bwn;
  #endif
  vBwPos = ( modelMatrix * bwp ).xyz;
  vBwNrm = normalize( mat3( modelMatrix ) * bwn );
}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vBwPos;
varying vec3 vBwNrm;
vec4 burntTri( sampler2D m, vec3 p, vec3 n, float sc ) {
  vec3 w = pow( abs( n ), vec3( 3.0 ) );
  w /= ( w.x + w.y + w.z + 1e-4 );
  return texture2D( m, p.zy * sc ) * w.x +
         texture2D( m, p.xz * sc ) * w.y +
         texture2D( m, p.xy * sc ) * w.z;
}`)
      .replace('#include <map_fragment>', `{
  vec4 sampledDiffuseColor = burntTri( map, vBwPos, vBwNrm, 0.34 );
  diffuseColor *= sampledDiffuseColor;
}`)
      .replace('#include <emissivemap_fragment>', `{
  vec4 emissiveColor = burntTri( emissiveMap, vBwPos + vec3( 3.7, 1.3, 8.1 ), vBwNrm, 0.21 );
  totalEmissiveRadiance *= emissiveColor.rgb;
  // r1 wreck ambient floor: shadowed flanks of a wreck read as featureless
  // pure-black slabs (destroy_2s/5s/25s near flank). A small albedo-scaled
  // fill keeps the soot gradients/panel structure readable from any angle
  // while staying far below the sun-lit side's response.
  totalEmissiveRadiance += diffuseColor.rgb * 0.085;
}`);
  };
  burnt.customProgramCacheKey = () => 'burnt-triplanar-r6';

  // Independent L/R track textures so each side scrolls on its own offset.
  const trackTexL = track(canvasTex(shared.trackCanvas, { aniso, repeat: true }));
  const trackTexR = track(canvasTex(shared.trackCanvas, { aniso, repeat: true }));
  // r10: metalness 0.3 + full env fired the blue-sky mirror off the band's
  // grazing faces (anodized-purple wrap critique) — dusty steel instead.
  const trackMatOpts = { roughness: 0.92, metalness: 0.1, envMapIntensity: 0.1 };
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
