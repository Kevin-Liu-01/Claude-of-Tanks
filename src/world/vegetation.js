// src/world/vegetation.js — instanced vegetation with GPU wind.
// Trees are built from alpha-carded foliage planes (canvas leaf-cluster
// textures) on branched trunks — not cone/blob primitives. Grass is a dense
// camera-centred instanced carpet (cell-cached, deterministic) layered over a
// sparser map-wide midfield scatter.
// Contract: docs/ARCHITECTURE.md §3.2; visuals per docs/research/graphics-aaa.md §8.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sampleSplatNoise, applyTone } from './terrain.js';

export function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

const HALF = 512;
const CHUNKS = 8, CHUNK_SIZE = 128;
// r5 density push: the mid-field carpet was the biggest "camo carpet" tell —
// bare albedo with sparse tufts from ~40 m out. Midfield attempts up ~1.7x
// and the far rolloff eased so the meadow stays three-dimensional to ~200 m.
// r2: 16000 -> 19000 + relaxed midfield cull (makeTuft) — the carpet-to-
// scatter density step at 60-80 m was the visible ground-cover LOD seam
const GRASS_PER_CHUNK = 19000;         // midfield scatter (map-wide, cheap)
const GRASS_FADE_END = 250;            // scale-out ends here (no hard carpet line)
// near carpet: camera-centred cells, dense. Ring 5 pushes the dense band to
// ~77 m so the ground-level view no longer pops to flat albedo at 30-40 m;
// the midfield scatter carries the 70-235 m band beyond it.
const CARPET_CELL = 14;
const CARPET_RING = 5;                 // (2R+1)^2 = 121 cells around the camera
// r6: 680 -> 880 attempts/cell + cap raise — the 0-25 m ring around the tank
// must read as continuous 3D turf (AAA tank games run dense instanced grass
// to 30 m+); at 680 the ground still showed flat albedo between tufts right
// beside the tracks
const CARPET_PER_CELL = 880;           // attempts per cell (filters thin it)
const CARPET_FAR = 95;                 // shader fade distance
const CARPET_CAP = 52000;              // instances per tuft variant
const TREE_NEAR_IN = 260, TREE_NEAR_OUT = 290; // hysteresis band (full-detail radius)

function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function smoothstepJs(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function _mustReplace(src, anchor, replacement) {
  const out = src.replace(anchor, replacement);
  if (out === src) throw new Error(`world/vegetation: shader anchor missing: ${anchor}`);
  return out;
}

// Cards carry hand-authored normals (up for grass, canopy-outward for tree
// foliage); undo the DOUBLE_SIDED faceDirection flip so backfaces don't light
// from below.
function useAttributeNormal(shader) {
  shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <normal_fragment_begin>',
    '#include <normal_fragment_begin>\nnormal = normalize( vNormal );\nnonPerturbedNormal = normal;');
}

// ---------------------------------------------------------------------------
// Canvas textures (grass blade card, leaf-cluster + needle-spray foliage)
// ---------------------------------------------------------------------------

const _cc = new THREE.Color();
function css(h, s, l) { _cc.setHSL(h, s, l); return _cc.getStyle(); }

function finishAlphaTexture(c, ctx, floodR, floodG, floodB, radialFalloff = false, tone = null) {
  // flood transparent texels with the mean foliage tone so mip averaging does
  // not darken distant cards toward black (non-premultiplied-alpha bleed).
  // radialFalloff pulls border alpha to 0 so deep mips average BELOW the
  // alphaTest threshold — otherwise minified cards resolve as solid rectangles.
  const s = c.width;
  const id = ctx.getImageData(0, 0, s, s);
  const d = id.data;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = (y * s + x) * 4;
    if (d[i + 3] < 24) { d[i] = floodR; d[i + 1] = floodG; d[i + 2] = floodB; }
    if (radialFalloff) {
      const rr = Math.hypot(x - s / 2, y - s / 2) / (s / 2);
      d[i + 3] *= clamp((1.08 - rr) / 0.5, 0, 1);
    }
  }
  applyTone(d, tone);
  ctx.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// r2 terrain_environment: procedural bark sheet — vertical fissure striation
// albedo + matching normal map shared by every trunk/branch material. The
// untextured vertex-tinted cylinders were the "branchless faceted prism"
// tell: with a striated map + normal relief the trunks read as bark at
// gameplay range. U wraps the trunk circumference (texture wraps in x);
// mean luminance sits ~0.72 so the per-species vertex tints keep their role.
function _nrmFromHeight(h, s, strength) {
  const px = new Uint8ClampedArray(s * s * 4);
  const H = (x, y) => h[((y + s) % s) * s + ((x + s) % s)];
  const v = new THREE.Vector3();
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
    const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
    v.set(-dx * strength, -dy * strength, 1).normalize();
    const i = (y * s + x) * 4;
    px[i] = v.x * 127.5 + 127.5; px[i + 1] = v.y * 127.5 + 127.5; px[i + 2] = v.z * 127.5 + 127.5; px[i + 3] = 255;
  }
  const c = document.createElement('canvas');
  c.width = c.height = s;
  c.getContext('2d').putImageData(new ImageData(px, s, s), 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
function makeBarkTexture(seed) {
  const s = 256;
  const rng = mulberry32(seed);
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#aea89f'; // near-neutral: species vertex tints own the hue (birch stays pale)
  ctx.fillRect(0, 0, s, s);
  // broad plate tone variation
  for (let b = 0; b < 46; b++) {
    const x = rng() * s, y = rng() * s;
    const w = 14 + rng() * 30, h = 30 + rng() * 70;
    ctx.globalAlpha = 0.16 + rng() * 0.18;
    const l = 0.58 + (rng() - 0.5) * 0.26;
    _cc.setHSL(0.075 + (rng() - 0.5) * 0.02, 0.07 + rng() * 0.05, l);
    ctx.fillStyle = _cc.getStyle();
    for (const ox of [-s, 0, s]) ctx.fillRect(x - w / 2 + ox, y - h / 2, w, h);
  }
  ctx.globalAlpha = 1;
  // vertical wandering fissures: dark cracks with a lit right edge
  ctx.lineCap = 'round';
  for (let f = 0; f < 30; f++) {
    let x = rng() * s;
    const wob = 2 + rng() * 5;
    const wdt = 1.4 + rng() * 2.6;
    const dark = 0.30 + rng() * 0.12;
    const pts = [];
    for (let y = -8; y <= s + 8; y += 12) pts.push([x + Math.sin(y * 0.05 + rng() * 6) * wob + (rng() - 0.5) * 3, y]);
    for (const [pass, styleL, w2, ox0] of [[0, dark, wdt + 1.6, 0], [1, 0.86, wdt * 0.6, wdt * 0.9]]) {
      _cc.setHSL(0.07, pass ? 0.06 : 0.10, styleL);
      ctx.strokeStyle = _cc.getStyle();
      ctx.lineWidth = w2;
      ctx.globalAlpha = pass ? 0.5 : 0.9;
      for (const ox of [-s, 0, s]) {
        ctx.beginPath();
        ctx.moveTo(pts[0][0] + ox + ox0, pts[0][1]);
        for (let q = 1; q < pts.length; q++) ctx.lineTo(pts[q][0] + ox + ox0, pts[q][1]);
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;
  // short horizontal scar checks breaking the pure verticality
  for (let k = 0; k < 60; k++) {
    const x = rng() * s, y = rng() * s, len = 4 + rng() * 12;
    _cc.setHSL(0.07, 0.08, 0.40 + rng() * 0.16);
    ctx.strokeStyle = _cc.getStyle();
    ctx.lineWidth = 1 + rng();
    ctx.globalAlpha = 0.5;
    for (const ox of [-s, 0, s]) {
      ctx.beginPath();
      ctx.moveTo(x + ox, y);
      ctx.lineTo(x + ox + len, y + (rng() - 0.5) * 4);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  const id = ctx.getImageData(0, 0, s, s);
  const hgt = new Float32Array(s * s);
  for (let i = 0; i < s * s; i++) {
    hgt[i] = (id.data[i * 4] * 0.5 + id.data[i * 4 + 1] * 0.35 + id.data[i * 4 + 2] * 0.15) / 255;
  }
  const albedo = new THREE.CanvasTexture(c);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.wrapS = albedo.wrapT = THREE.RepeatWrapping;
  albedo.anisotropy = 4;
  return { albedo, normal: _nrmFromHeight(hgt, s, 2.2) };
}

// Two tuft variants: 0 = lush meadow tuft, 1 = drier mixed tuft. Dense at the
// root line, ragged at the top so minified mips fade the card edges instead of
// exposing a translucent rectangle.
function makeGrassCardTexture(rng, variant, tone = null) {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  // r7: fewer, dimmer dry blades (the bright dry tips read as white speckle
  // dust over the dark carpet in player_view) + livelier green tips so near
  // tufts read as lit 3D turf instead of murky moss
  const dryChance = variant === 0 ? 0.08 : 0.26;
  const nBlades = variant === 0 ? 46 : 38;
  for (let b = 0; b < nBlades; b++) {
    const dry = rng() < dryChance;
    const bx = 8 + rng() * (s - 16);
    const bw = 5 + rng() * 7;
    const tall = rng();
    const tipX = bx + (rng() - 0.5) * (variant === 0 ? 90 : 130);
    const tipY = s - (0.35 + 0.62 * tall) * s;
    const cpX = bx + (tipX - bx) * (0.25 + rng() * 0.3);
    const cpY = s - (s - tipY) * (0.45 + rng() * 0.2);
    const grad = ctx.createLinearGradient(0, s, 0, tipY);
    if (dry) {
      grad.addColorStop(0, css(0.105, 0.28, 0.15 + rng() * 0.05));
      grad.addColorStop(1, css(0.115, 0.32, 0.30 + rng() * 0.07));
    } else {
      // r2: tips desaturated + narrowed (0.46/0.38+0.13 -> 0.40/0.35+0.08) —
      // the hot lime blade tips read as radioactive speckle against the dark
      // blade bases in the near field
      grad.addColorStop(0, css(0.24, 0.40, 0.12 + rng() * 0.04));
      grad.addColorStop(0.6, css(0.225, 0.42, 0.25 + rng() * 0.05));
      grad.addColorStop(1, css(0.20 + rng() * 0.04, 0.40, 0.35 + rng() * 0.08));
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(bx - bw / 2, s + 2);
    ctx.quadraticCurveTo(cpX - bw * 0.3, cpY, tipX, tipY);
    ctx.quadraticCurveTo(cpX + bw * 0.3, cpY, bx + bw / 2, s + 2);
    ctx.closePath();
    ctx.fill();
  }
  // r2: sparse wildflower heads on the lush variant — tiny meadow color
  // accents (yarrow white / buttercup) that break the golf-course monotone
  if (variant === 0) {
    for (let f = 0; f < 9; f++) {
      const fx = 12 + rng() * (s - 24), fy = s - (0.45 + 0.4 * rng()) * s;
      const warm = rng() < 0.55;
      ctx.fillStyle = warm ? css(0.13, 0.75, 0.62) : css(0.14, 0.12, 0.86);
      for (let p = 0; p < 4; p++) {
        ctx.beginPath();
        ctx.arc(fx + (rng() - 0.5) * 5, fy + (rng() - 0.5) * 4, 1.1 + rng() * 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  return finishAlphaTexture(c, ctx, 74, 88, 42, false, tone);
}

// Broadleaf foliage card: dozens of small leaf-ellipse clumps, centre-heavy so
// card silhouettes stay ragged; brighter toward the top (sun side).
function makeLeafClusterTexture(rng, tone = null) {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  const cx = s / 2, cy = s / 2;
  // r8: three distinct clump FAMILIES on the one atlas (sun-bleached yellow-
  // green tips / mid olive / dark blue-green shadow foliage) with varied leaf
  // sizes — the single-family clumps read as "one repeated leaf texture"
  // stamped across every crown (critique). Family mix keyed per clump so
  // cards cut from different atlas regions carry visibly different foliage.
  for (let k = 0; k < 105; k++) {
    const a = rng() * Math.PI * 2;
    const rr = Math.pow(rng(), 0.62) * 0.45 * s;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    const sun = 1 - y / s;
    const famRoll = rng();
    let hue, sat, l;
    if (famRoll < 0.30) {        // sun-bleached tips
      // lighting_post r2: cap the bleached family — 0.48 HSL-lightness
      // clipped to lime-white under the 4.5 sun key; ~0.41 rolls off inside
      // the grade shoulder.
      hue = 0.170 + rng() * 0.035; sat = 0.21 + rng() * 0.07;
      l = 0.22 + sun * 0.12 + rng() * 0.07;
    } else if (famRoll < 0.78) { // mid olive body
      hue = 0.215 + rng() * 0.045; sat = 0.19 + rng() * 0.08;
      l = 0.17 + sun * 0.15 + rng() * 0.10;
    } else {                     // dark shadow foliage
      hue = 0.26 + rng() * 0.045; sat = 0.15 + rng() * 0.06;
      l = 0.12 + sun * 0.10 + rng() * 0.07;
    }
    const sizeMul = 0.7 + rng() * 0.9; // per-clump leaf scale spread
    const nl = 5 + (rng() * 6) | 0;
    for (let j = 0; j < nl; j++) {
      const lx = x + (rng() - 0.5) * 15, ly = y + (rng() - 0.5) * 15;
      const lw = (3.2 + rng() * 4.2) * sizeMul, lh = (2.0 + rng() * 2.8) * sizeMul;
      const rot = rng() * Math.PI;
      // r2: PER-LEAF value/hue spread (was one flat fill per clump — the
      // "acrylic paint daub" tell) + a lit sliver on the upper edge of ~half
      // the leaves so crowns carry leaf-scale speckle and specular breakup
      const ll = l * (0.78 + rng() * 0.55);
      ctx.fillStyle = css(hue + (rng() - 0.5) * 0.022, sat, ll);
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.ellipse(0, 0, lw, lh, 0, 0, Math.PI * 2);
      ctx.fill();
      if (rng() < 0.5) {
        ctx.fillStyle = css(hue - 0.012, sat * 0.85, Math.min(0.62, ll + 0.11 + sun * 0.05));
        ctx.beginPath();
        ctx.ellipse(-lw * 0.18, -lh * 0.30, lw * 0.55, lh * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
  // r2: punch small sky-holes through the foliage mass — solid card interiors
  // were the flat-splat giveaway; alpha gaps let light break through crowns
  ctx.globalCompositeOperation = 'destination-out';
  for (let hle = 0; hle < 46; hle++) {
    const a = rng() * Math.PI * 2;
    const rr = Math.pow(rng(), 0.7) * 0.42 * s;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    ctx.beginPath();
    ctx.arc(x, y, 1.5 + rng() * 3.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  return finishAlphaTexture(c, ctx, 70, 78, 40, true, tone);
}

// Conifer foliage card: fanned needle sprays, muted olive-green.
function makeNeedleSprayTexture(rng, tone = null) {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  const cx = s / 2, cy = s / 2;
  ctx.lineCap = 'round';
  for (let k = 0; k < 95; k++) {
    const a = rng() * Math.PI * 2;
    const rr = Math.pow(rng(), 0.6) * 0.44 * s;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    const sun = 1 - y / s;
    const dir = rng() * Math.PI * 2;
    const n = 8 + (rng() * 8) | 0;
    ctx.strokeStyle = css(0.30 + rng() * 0.035, 0.18 + rng() * 0.08, 0.15 + sun * 0.12 + rng() * 0.07);
    ctx.lineWidth = 1.5 + rng() * 0.9;
    for (let j = 0; j < n; j++) {
      const na = dir + (rng() - 0.5) * 1.5;
      const len = 9 + rng() * 12;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(na) * len, y + Math.sin(na) * len + len * 0.25);
      ctx.stroke();
    }
  }
  return finishAlphaTexture(c, ctx, 52, 68, 48, true, tone);
}

// Palm frond card: ONE feather-shaped frond filling the card, v axis = frond
// length (base at the bottom). Dense overlapping leaflets fill a contiguous
// silhouette with a serrated edge so the frond reads as a mass, not sparse
// scribbles; dry tips, darker underside strokes for depth.
function makePalmFrondTexture(rng, tone = null) {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  const bx = s / 2;
  // two passes: dark under-layer slightly wider, lit top layer
  for (let pass = 0; pass < 2; pass++) {
    const n = 42;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const ry = s - 4 - (s - 12) * t;
      const rx = bx + Math.sin(t * 2.6) * 5;
      // feather envelope: widest just below mid, tapering to the tip
      const env = Math.sin(Math.min(1, t * 1.12) * Math.PI);
      const len = (14 + env * 88) * (pass === 0 ? 1.08 : 1.0);
      const dry = t > 0.78 ? (t - 0.78) * 3.6 : 0;
      const droop = 18 + t * 26;
      for (const side of [-1, 1]) {
        for (let l = 0; l < 4; l++) { // overlapping leaflets per station
          // r9: thicker, one extra leaflet per station — the frond silhouette
          // must stay a CONTIGUOUS feather through minification; the old thin
          // strokes mip-averaged below the alpha test by ~150 m and whole
          // crowns degenerated into sparse scribble stars (critique: "jagged
          // green starburst scribbles")
          const lw = 7.2 - t * 2.6 - l * 0.9;
          if (lw <= 1.0) continue;
          const jit = (rng() - 0.5) * 7;
          // r6: sat 0.40 -> 0.30, hue pulled toward olive — the frond sheet
          // itself fed the lime-plastic read, not just the vertex tint
          const lum = pass === 0
            ? 0.13 + rng() * 0.05
            : 0.19 + t * 0.11 + rng() * 0.07 + dry * 0.10;
          const sat = pass === 0 ? 0.28 : 0.30 - dry * 0.12;
          const hue = 0.21 - dry * 0.10 + (rng() - 0.5) * 0.02;
          ctx.strokeStyle = css(hue, sat, lum);
          ctx.lineWidth = lw;
          ctx.lineCap = 'round';
          const ex = rx + side * len * (0.9 + rng() * 0.2);
          const ey = ry - len * 0.30 + droop * (0.4 + rng() * 0.3) + jit;
          ctx.beginPath();
          ctx.moveTo(rx, ry + l * 2.2);
          ctx.quadraticCurveTo(rx + side * len * 0.5, ry - len * 0.24 + jit * 0.5, ex, ey);
          ctx.stroke();
        }
      }
    }
  }
  // central rib on top
  ctx.strokeStyle = css(0.13, 0.34, 0.30);
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  ctx.moveTo(bx, s - 2);
  ctx.quadraticCurveTo(bx + 4, s * 0.5, bx + Math.sin(2.6) * 5, 10);
  ctx.stroke();
  return finishAlphaTexture(c, ctx, 55, 76, 38, false, tone);
}

// Bare-twig card (winter birch crowns / bare shrubs): dark branching strokes.
function makeTwigTexture(rng, tone = null) {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  ctx.lineCap = 'round';
  // r9: soft twig-HAZE underlay first — real winter birch crowns read as a
  // purple-brown gauze of thousands of sub-pixel twigs, not as separable
  // black scribbles on the sky. Translucent blobs + a dense pass of fine
  // strokes give the card body; the branch skeleton draws on top.
  for (let b = 0; b < 18; b++) {
    const x = s / 2 + (rng() - 0.5) * 130, y = s / 2 + (rng() - 0.5) * 130;
    const r = 16 + rng() * 30;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(88,84,86,0.22)'); // cool grey — brown read autumnal
    gr.addColorStop(1, 'rgba(88,84,86,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  for (let f = 0; f < 150; f++) { // fine-twig strokes: the haze texture
    const x = s / 2 + (rng() - 0.5) * 150, y = s / 2 + (rng() - 0.5) * 150;
    const a = rng() * Math.PI * 2, len = 8 + rng() * 16;
    ctx.strokeStyle = css(0.045 + rng() * 0.03, 0.05 + rng() * 0.05, 0.26 + rng() * 0.16);
    ctx.lineWidth = 0.8 + rng() * 0.9;
    ctx.globalAlpha = 0.55 + rng() * 0.35;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + (rng() - 0.5) * 5,
      y + Math.sin(a) * len * 0.5 - rng() * 4, x + Math.cos(a) * len, y + Math.sin(a) * len - len * 0.2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  function branch(x, y, a, len, w, depth) {
    if (depth <= 0 || len < 5) return;
    const nx = x + Math.cos(a) * len, ny = y + Math.sin(a) * len;
    // r9: lifted from near-black (0.14-0.24 -> 0.22-0.34) — pure-dark strokes
    // against snow albedo read as glitch scribbles at any distance; sat cut
    // toward grey so the crown reads winter-purple-grey, not autumn brown
    ctx.strokeStyle = css(0.05 + rng() * 0.02, 0.08, 0.22 + rng() * 0.12);
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
    const forks = 2 + ((rng() * 2) | 0);
    for (let k = 0; k < forks; k++) {
      branch(nx, ny, a + (rng() - 0.5) * 1.5, len * (0.55 + rng() * 0.25), w * 0.62, depth - 1);
    }
  }
  for (let b = 0; b < 9; b++) {
    const a = rng() * Math.PI * 2;
    branch(s / 2 + (rng() - 0.5) * 60, s / 2 + (rng() - 0.5) * 60, a, 26 + rng() * 22, 2.4, 4);
  }
  return finishAlphaTexture(c, ctx, 82, 72, 66, true, tone);
}

// ---------------------------------------------------------------------------
// Tree geometry — branched trunk (opaque) + foliage cards (alpha-tested)
// ---------------------------------------------------------------------------

const _c = new THREE.Color();
const _v3 = new THREE.Vector3();
const _e = new THREE.Euler();
const _qq = new THREE.Quaternion();
const _m = new THREE.Matrix4();

function paintFlat(geo, color, flex) {
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  const fl = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b;
    fl[i] = flex;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aFlex', new THREE.BufferAttribute(fl, 1));
  return geo;
}

// one foliage card: plane transformed into place, vertex colour = AO/tint,
// normal = canopy-outward blend so lighting wraps the crown as one volume
function foliageCard(w, h, px, py, pz, euler, shade, hue, sat, flex, canopyCx, canopyCy, canopyCz, upBias = 1.55) {
  const g = new THREE.PlaneGeometry(w, h);
  _qq.setFromEuler(euler);
  _m.compose(_v3.set(px, py, pz), _qq, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(_m);
  const n = g.attributes.position.count;
  _c.setHSL(hue, sat, 0.5, THREE.SRGBColorSpace); // tint via HSL, applied as multiplier around 1
  const col = new Float32Array(n * 3);
  const fl = new Float32Array(n);
  const nd = _v3.set(px - canopyCx, (py - canopyCy) * 0.65, pz - canopyCz);
  if (nd.lengthSq() < 1e-6) nd.set(0, 1, 0);
  nd.normalize();
  // up-bias: canopy reads sunlit, not backlit-black. r2: parameterized —
  // squat bushes need a LOWER bias (0.75) or every card normal collapses to
  // straight-up and the whole shrub lights as one flat unlit sheet.
  nd.y += upBias; nd.normalize();
  const nrm = g.attributes.normal;
  for (let i = 0; i < n; i++) {
    col[i * 3] = _c.r * 1.7 * shade; col[i * 3 + 1] = _c.g * 1.7 * shade; col[i * 3 + 2] = _c.b * 1.7 * shade;
    fl[i] = flex;
    nrm.setXYZ(i, nd.x, nd.y, nd.z);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aFlex', new THREE.BufferAttribute(fl, 1));
  return g;
}

function mergeParts(parts) {
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}

// trunk + a few real branch cylinders reaching into the canopy
function buildBroadleafTrunk(rng) {
  const parts = [];
  const trunkH = 3.1 + rng() * 0.5;
  // r2: 9 radial segs (was 7 — the "faceted prism" tell) + lifted tint
  // (x~1.35, the striated bark map now multiplies in at ~0.72 mean)
  const trunk = new THREE.CylinderGeometry(0.17, 0.30, trunkH, 9, 2);
  const tp = trunk.attributes.position;
  for (let i = 0; i < tp.count; i++) tp.setX(i, tp.getX(i) + tp.getY(i) * (rng() * 0.08));
  trunk.computeVertexNormals();
  trunk.translate(0, trunkH / 2, 0);
  _c.setHSL(0.07, 0.26, 0.22 + rng() * 0.06, THREE.SRGBColorSpace);
  parts.push(paintFlat(trunk, _c.clone(), 0));
  // r2: root flare — the trunk widens into the ground instead of poking out
  // of it like a dowel; the root decal disc carries the contact shadow
  {
    const flare = new THREE.CylinderGeometry(0.30, 0.55, 0.55, 9, 1);
    const fp = flare.attributes.position;
    for (let i = 0; i < fp.count; i++) { // ribbed, slightly irregular flare
      const x = fp.getX(i), z = fp.getZ(i);
      const aF = Math.atan2(z, x);
      const rib = 1 + Math.abs(Math.sin(aF * 3.5 + 0.7)) * 0.22 * (0.5 - fp.getY(i));
      fp.setX(i, x * rib); fp.setZ(i, z * rib);
    }
    flare.computeVertexNormals();
    flare.translate(0, 0.24, 0);
    _c.setHSL(0.07, 0.25, 0.20 + rng() * 0.05, THREE.SRGBColorSpace);
    parts.push(paintFlat(flare, _c.clone(), 0));
  }
  // r8: more + BIGGER primary branches reaching well into the canopy volume
  // (critique: "bare cylinder trunks that never connect to the canopy via
  // branches") — 4-6 limbs, thicker and longer (up to ~3.4 m, canopy center
  // sits at 4.35 m), plus a forked secondary on most of them so the trunk-to-
  // crown transition reads as real branch structure through card gaps.
  const nBr = 4 + (rng() * 3) | 0;
  for (let b = 0; b < nBr; b++) {
    const len = 2.0 + rng() * 1.4;
    const rotZ = 0.45 + rng() * 0.6;
    const rotY = (b / nBr) * Math.PI * 2 + rng() * 0.8;
    const y0 = trunkH * (0.58 + rng() * 0.34);
    const br = new THREE.CylinderGeometry(0.05, 0.13, len, 5, 1);
    br.translate(0, len / 2, 0);
    br.rotateZ(rotZ);
    br.rotateY(rotY);
    br.translate(0, y0, 0);
    _c.setHSL(0.07, 0.24, 0.20 + rng() * 0.05, THREE.SRGBColorSpace);
    parts.push(paintFlat(br, _c.clone(), 0.15));
    if (rng() < 0.75) { // forked secondary off the limb tip
      const len2 = 0.9 + rng() * 0.8;
      const br2 = new THREE.CylinderGeometry(0.03, 0.055, len2, 4, 1);
      br2.translate(0, len2 / 2, 0);
      br2.rotateZ(rotZ + (rng() - 0.2) * 0.7);
      br2.rotateY(rotY + (rng() - 0.5) * 0.9);
      // limb tip position (approx): rotate (0,len,0) by Z then Y
      const tx = Math.sin(rotZ) * len, ty = Math.cos(rotZ) * len;
      br2.translate(Math.cos(rotY) * tx, y0 + ty, -Math.sin(rotY) * tx);
      _c.setHSL(0.07, 0.22, 0.22 + rng() * 0.05, THREE.SRGBColorSpace);
      parts.push(paintFlat(br2, _c.clone(), 0.25));
    }
  }
  return mergeParts(parts);
}

function buildBroadleafCards(rng, nCards, sizeMul, pal = {}) {
  // r7: sat 0.24 -> 0.19 + hue pulled off pure green — default oaks rendered
  // as "over-saturated lime puffballs" against the graded field
  const hue0 = pal.cardHue ?? 0.228, sat0 = pal.cardSat ?? 0.19;
  // content_breadth r4: optional palette luminance floor — winter birch
  // stands rendered near-black against snow because the card luminance was
  // hardcoded and palette lifts could not reach it
  const l0 = pal.cardL0 ?? 0.30;
  const cy = 4.35, rx = 2.35, ry = 1.75, rz = 2.35;
  // multi-lobe crown: cards cluster around 2-3 offset sub-lobes so the canopy
  // silhouette reads as a broken broadleaf mass, not one lollipop ball
  const lobes = [[0, cy, 0]];
  const nLobes = 2 + ((rng() * 2) | 0);
  for (let li = 1; li < nLobes; li++) {
    const la = rng() * Math.PI * 2;
    lobes.push([Math.cos(la) * (1.2 + rng() * 0.7), cy + (rng() - 0.35) * 1.3,
      Math.sin(la) * (1.2 + rng() * 0.7)]);
  }
  const parts = [];
  for (let i = 0; i < nCards; i++) {
    const lobe = lobes[(rng() * lobes.length) | 0];
    const lr = lobe === lobes[0] ? 1.0 : 0.62; // satellites are smaller
    // direction on a squashed sphere, radius biased outward
    let dx = rng() * 2 - 1, dy = rng() * 2 - 1, dz = rng() * 2 - 1;
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;
    const rad = Math.pow(0.22 + 0.78 * rng(), 0.75);
    const px = lobe[0] + dx * rad * rx * lr;
    const py = lobe[1] + dy * rad * ry * lr * (dy > 0 ? 1 : 0.8);
    const pz = lobe[2] + dz * rad * rz * lr;
    const wsz = (1.55 + rng() * 0.9) * sizeMul;
    _e.set(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI, 'YXZ');
    const distC = Math.hypot(px, py - cy, pz) / Math.max(rx, ry);
    // r6: deeper interior AO + wider hue/value jitter per card — flat
    // one-tone crowns were the "broccoli blob" mid-distance tell.
    // lighting_post r3: core floor 0.42 -> 0.50 so oaks meet the shared
    // 0.30-0.45 linear albedo band pines/palms target (cross-species match)
    // r7: vertical gradient deepened (0.86+0.28 -> 0.72+0.42) — the canopy
    // darkens toward the ground plane like a real shaded understory, so the
    // crown reads grounded instead of a uniformly lit floating ball
    // r8: floors lifted (core 0.50 -> 0.58, vertical 0.72 -> 0.80) — the
    // stacked AO gradients drove shadowed canopy undersides to near-black
    // paint blobs in the chase view (critique); real crowns keep skylight
    // bounce in the skirt. Hue jitter widened ±0.025 -> ±0.045: with one
    // shared leaf atlas, per-card hue/value spread is what breaks the
    // "single repeated leaf texture" read.
    const shade = (0.58 + 0.42 * clamp(distC, 0, 1)) // dark core, lit shell
      * (0.80 + 0.34 * clamp((py - cy) / ry * 0.5 + 0.5, 0, 1)) * (0.92 + rng() * 0.16);
    parts.push(foliageCard(wsz, wsz * 0.82, px, py, pz, _e, shade,
      hue0 + (rng() - 0.5) * 0.09, sat0 + rng() * 0.08, l0 + rad * 0.65, 0, cy, 0));
  }
  // a couple of low cards hanging near the branch collar
  for (let i = 0; i < Math.max(2, nCards >> 4); i++) {
    const a = rng() * Math.PI * 2, rr = 0.9 + rng() * 0.9;
    _e.set(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI, 'YXZ');
    parts.push(foliageCard(1.3 * sizeMul, 1.0 * sizeMul, Math.cos(a) * rr, 2.9 + rng() * 0.6, Math.sin(a) * rr,
      _e, 0.5, hue0 + 0.005, sat0 + 0.02, 0.35, 0, cy, 0));
  }
  return mergeParts(parts);
}

function buildPineTrunk(rng) {
  const parts = [];
  const trunkH = 5.9 + rng() * 0.6;
  // r2: 9 segs + root flare + lifted tint (bark map compensation) — see oak
  const trunk = new THREE.CylinderGeometry(0.10, 0.26, trunkH, 9, 1);
  trunk.translate(0, trunkH / 2, 0);
  _c.setHSL(0.06, 0.30, 0.19 + rng() * 0.05, THREE.SRGBColorSpace);
  parts.push(paintFlat(trunk, _c.clone(), 0));
  const flare = new THREE.CylinderGeometry(0.26, 0.46, 0.5, 9, 1);
  flare.translate(0, 0.22, 0);
  _c.setHSL(0.06, 0.28, 0.17 + rng() * 0.04, THREE.SRGBColorSpace);
  parts.push(paintFlat(flare, _c.clone(), 0));
  return mergeParts(parts);
}

function buildPineCards(rng, tierStep, sizeMul, pal = {}) {
  // lighting_post r3: pine defaults 0.325/0.23 -> 0.30/0.18 — pines sat
  // brighter + more cyan than oaks (hue0 0.235); pull both into one band
  const hue0 = pal.cardHue ?? 0.30, sat0 = pal.cardSat ?? 0.18;
  const l0 = pal.cardL0 ?? 0.15; // content_breadth r4: palette luminance floor
  const topY = 6.4;
  const parts = [];
  for (let y = 1.55; y < topY - 0.3; y += tierStep * (0.85 + rng() * 0.3)) {
    const t = (y - 1.2) / (topY - 1.2);
    const rr = (1.0 - t) * 1.65 + 0.30;
    const m = Math.max(4, Math.round(2.8 + rr * 2.7)); // denser tiers: no see-through crowns
    const a0 = rng() * Math.PI * 2;
    for (let k = 0; k < m; k++) {
      const a = a0 + (k / m) * Math.PI * 2 + (rng() - 0.5) * 0.7;
      // cap card width — oversized bottom-tier quads mip into solid diamonds
      const w = Math.min(rr * 1.15 + 0.75, 2.4) * sizeMul, h = (0.9 + rr * 0.45) * sizeMul;
      _e.set(-Math.PI / 2 + 0.55 + rng() * 0.25, -a + Math.PI / 2, (rng() - 0.5) * 0.3, 'YXZ');
      // r6: wider per-card value/hue spread — one uniform saturated green
      // across every card was the "model railroad pine" tell at 30-80 m
      // r7: base 0.50 -> 0.42 — lower tiers shade toward the ground plane
      // r8: 0.42 -> 0.48 — bottom tiers went to black paint in chase shadow
      const shade = 0.48 + t * 0.40 + rng() * 0.26;
      parts.push(foliageCard(w, h, Math.cos(a) * rr * 0.55, y + rng() * 0.25, Math.sin(a) * rr * 0.55,
        _e, shade, hue0 + (rng() - 0.5) * 0.045, sat0 + rng() * 0.07, l0 + Math.pow(t, 1.5) * 0.65,
        0, y - 0.6, 0));
    }
  }
  // vertical leader cards at the top
  for (let k = 0; k < 2; k++) {
    _e.set(0, rng() * Math.PI, 0, 'YXZ');
    parts.push(foliageCard(1.0 * sizeMul, 1.7 * sizeMul, 0, topY - 0.55, 0, _e, 0.9,
      hue0, sat0 + 0.03, 0.8, 0, topY - 1.6, 0));
  }
  return mergeParts(parts);
}

// --- palm: curved warm-brown trunk + a crown of ARCHED drooping fronds
// (bent tapered planes, dense frond texture) + coconut cluster ---
function buildPalmGeometry(rng, pal = {}) {
  // r6: frond tint is PALETTE-DRIVEN and defaults desaturated olive — the
  // old hardcoded HSL(0.228, 0.32, 0.5) x 1.55 rendered saturated lime
  // plastic against the desert sand (top critique item)
  const fr = pal.frond || {};
  const frondHue = fr.hue ?? 0.205, frondSat = fr.sat ?? 0.22, frondLum = fr.l ?? 0.44;
  const trunkParts = [];
  const H = 5.6 + rng() * 1.4;
  const leanA = rng() * Math.PI * 2;
  const lean = 0.5 + rng() * 0.5; // total top offset in meters
  const NSEG = 6;
  let px = 0, pz = 0;
  for (let i = 0; i < NSEG; i++) {
    const t0 = i / NSEG, t1 = (i + 1) / NSEG;
    const x0 = Math.cos(leanA) * lean * t0 * t0, z0 = Math.sin(leanA) * lean * t0 * t0;
    const x1 = Math.cos(leanA) * lean * t1 * t1, z1 = Math.sin(leanA) * lean * t1 * t1;
    const segLen = Math.hypot(H / NSEG, x1 - x0, z1 - z0) * 1.04;
    const seg = new THREE.CylinderGeometry(
      0.13 + (1 - t1) * 0.10, 0.14 + (1 - t0) * 0.10, segLen, 7, 1);
    // ring-band illusion: alternating leaf-scar bands in warm brown
    _c.setHSL(0.072, 0.30, (i % 2 ? 0.34 : 0.43) + rng() * 0.03, THREE.SRGBColorSpace); // r2: bark-map compensation
    seg.rotateZ(Math.atan2(x1 - x0, H / NSEG) * -1);
    seg.rotateY(-leanA);
    seg.translate((x0 + x1) / 2, (t0 + t1) * 0.5 * H, (z0 + z1) / 2);
    trunkParts.push(paintFlat(seg, _c.clone(), t1 * 0.2));
    px = x1; pz = z1;
  }
  // fiber collar under the crown
  const collar = new THREE.CylinderGeometry(0.30, 0.19, 0.6, 7, 1);
  collar.translate(px, H - 0.15, pz);
  _c.setHSL(0.082, 0.32, 0.29, THREE.SRGBColorSpace);
  trunkParts.push(paintFlat(collar, _c.clone(), 0.2));
  // coconut cluster nestled at the crown base
  for (let k = 0; k < 4 + ((rng() * 3) | 0); k++) {
    const a = rng() * Math.PI * 2;
    const nut = new THREE.IcosahedronGeometry(0.13 + rng() * 0.05, 0);
    nut.translate(px + Math.cos(a) * (0.22 + rng() * 0.14), H + 0.02 + rng() * 0.16,
      pz + Math.sin(a) * (0.22 + rng() * 0.14));
    _c.setHSL(0.09, 0.38, 0.28 + rng() * 0.09, THREE.SRGBColorSpace);
    trunkParts.push(paintFlat(nut, _c.clone(), 0.3));
  }

  // arched frond: tapered plane bent along its length — rises from the crown,
  // arcs over and droops at the tip. Built per-frond so the canopy is a mass.
  function frond(a, phi0, phiTip, len, wBase, shade, dead) {
    const SEGS = 6;
    const g = new THREE.PlaneGeometry(1, 1, 1, SEGS);
    const p = g.attributes.position;
    // bend: integrate the frond direction along the arc; x stays width axis
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) + 0.5; // 0..1 along the frond
      const w = (1 - t * 0.8) * wBase; // taper toward the tip
      let ry = 0, rf = 0;
      const steps = 12;
      const dl = (len * t) / steps;
      for (let sIt = 0; sIt < steps; sIt++) {
        const tt = ((sIt + 0.5) / steps) * t;
        const ph = phi0 + (phiTip - phi0) * tt * tt;
        rf += Math.cos(ph) * dl;
        ry += Math.sin(ph) * dl;
      }
      p.setXYZ(i, p.getX(i) * w, ry, rf);
    }
    g.computeVertexNormals();
    const rotY = new THREE.Matrix4().makeRotationY(a);
    g.applyMatrix4(rotY);
    g.translate(px, H + 0.18, pz);
    const nv = p.count;
    const col = new Float32Array(nv * 3);
    const fl = new Float32Array(nv);
    if (dead) _c.setHSL(0.095, 0.30, 0.28, THREE.SRGBColorSpace);
    else _c.setHSL(frondHue + (rng() - 0.5) * 0.035, frondSat, frondLum, THREE.SRGBColorSpace);
    const uvA = g.attributes.uv;
    for (let i = 0; i < nv; i++) {
      const t = uvA.getY(i); // 0..1 along the frond length
      const m = dead ? 1 : 1.38 * shade;
      col[i * 3] = _c.r * m; col[i * 3 + 1] = _c.g * m; col[i * 3 + 2] = _c.b * m;
      fl[i] = dead ? 0.25 : 0.30 + t * 0.45;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aFlex', new THREE.BufferAttribute(fl, 1));
    // sky-lit normals: outward + strong up bias, like the other canopies
    const nrm = g.attributes.normal;
    _v3.set(Math.sin(a) * 0.45, 1.35, Math.cos(a) * 0.45).normalize();
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, _v3.x, _v3.y, _v3.z);
    return g;
  }

  const cardParts = [];
  // r9: 13-17 fronds (was 11-14) — the crown must read as one massed canopy
  // dome at mid distance, not separable spikes
  const n = 13 + ((rng() * 5) | 0);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rng() * 0.45;
    // alternate steep/shallow launch angles => layered dome-shaped crown
    const steep = k % 2 === 0;
    const phi0 = steep ? 0.95 + rng() * 0.25 : 0.55 + rng() * 0.25; // up from horizontal
    const phiTip = -(0.5 + rng() * 0.7); // tips droop below horizontal
    const len = 3.4 + rng() * 1.2;
    const shade = 0.7 + (steep ? 0.3 : 0.12) + rng() * 0.1;
    // r6: blade width 1.9 -> 1.4 m — the fat planes read as banana leaves up
    // close AND cast solid strap shadows (the star-blob shadow tell)
    // r9: 1.4 -> 1.55 with the denser frond texture — coverage, not strap
    cardParts.push(frond(a, phi0, phiTip, len, 1.55, shade, false));
  }
  // r6: 4-5 hanging dead fronds — a proper dry skirt under the crown pulls
  // the palette toward khaki and breaks the all-green crown ball
  for (let k = 0; k < 4 + ((rng() * 2) | 0); k++) {
    const a = rng() * Math.PI * 2;
    cardParts.push(frond(a, -0.9 - rng() * 0.3, -1.45, 2.3 + rng() * 0.5, 1.05, 0.6, true));
  }
  return { trunk: mergeParts(trunkParts), cards: mergeParts(cardParts) };
}

// --- birch: pale banded trunk, upward branches, sparse bare-twig cards ---
function buildBirchGeometry(rng) {
  const trunkParts = [];
  const H = 5.6 + rng() * 1.6;
  const trunk = new THREE.CylinderGeometry(0.07, 0.17, H, 7, 3);
  const tp = trunk.attributes.position;
  for (let i = 0; i < tp.count; i++) tp.setX(i, tp.getX(i) + tp.getY(i) * (rng() * 0.03));
  trunk.computeVertexNormals();
  trunk.translate(0, H / 2, 0);
  // banded bark via vertex colours: pale white with darker patches
  {
    const nv = trunk.attributes.position.count;
    const col = new Float32Array(nv * 3);
    const fl = new Float32Array(nv);
    for (let i = 0; i < nv; i++) {
      const y = trunk.attributes.position.getY(i);
      const band = Math.sin(y * 5.1 + rng() * 0.3) > 0.72 ? 0.32 : 1;
      _c.setHSL(0.09, 0.04, (0.80 + rng() * 0.10) * band + (band < 1 ? 0.08 : 0), THREE.SRGBColorSpace); // r2: bark-map compensation
      col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
      fl[i] = 0;
    }
    trunk.setAttribute('color', new THREE.BufferAttribute(col, 3));
    trunk.setAttribute('aFlex', new THREE.BufferAttribute(fl, 1));
    trunkParts.push(trunk);
  }
  const nBr = 12 + ((rng() * 5) | 0); // r5: doubled — "white pole with 3 twigs" tell
  for (let b = 0; b < nBr; b++) {
    // r9: shorter, paler branches that stay INSIDE the twig-card cloud — the
    // long dark 3 m limbs poked past the crown as black antenna spikes
    const len = 0.9 + rng() * 1.2;
    const br = new THREE.CylinderGeometry(0.015, 0.045, len, 4, 1);
    br.translate(0, len / 2, 0);
    br.rotateZ(0.35 + rng() * 0.55); // reach upward
    br.rotateY(rng() * Math.PI * 2);
    br.translate(0, H * (0.45 + rng() * 0.42), 0);
    _c.setHSL(0.06, 0.07, 0.40 + rng() * 0.10, THREE.SRGBColorSpace);
    trunkParts.push(paintFlat(br, _c.clone(), 0.3));
  }
  // twig cards forming the bare crown silhouette. r9: ~1.7x density AND
  // bigger cards on a wider crown — the r5 count still resolved as a white
  // pole with a few dark stickers in the winter establishing shot; the crown
  // must read as one continuous twig-haze volume
  const cardParts = [];
  const cy = H * 0.76;
  const nc = 30 + ((rng() * 9) | 0);
  for (let i = 0; i < nc; i++) {
    let dx = rng() * 2 - 1, dy = rng() * 2 - 1, dz = rng() * 2 - 1;
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;
    const rad = Math.pow(0.3 + 0.7 * rng(), 0.8);
    const w = 1.5 + rng() * 1.0;
    _e.set(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI, 'YXZ');
    cardParts.push(foliageCard(w, w * 0.9, dx * rad * 1.6, cy + dy * rad * H * 0.22, dz * rad * 1.6,
      _e, 0.9 + rng() * 0.3, 0.08, 0.06, 0.45, 0, cy, 0));
  }
  return { trunk: mergeParts(trunkParts), cards: mergeParts(cardParts) };
}

// --- far-LOD trees: OPAQUE canopy lobes (no alpha cards). Beyond ~260 m the
// card mips would resolve to solid rectangles; opaque jittered lobes give
// clean massed silhouettes for ridgelines and the rim forest instead. ---

function jitterRadial(geo, rng, amount) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    if (Math.hypot(x, z) > 1e-4) {
      const f = 1 + (rng() - 0.5) * 2 * amount;
      pos.setX(i, x * f); pos.setZ(i, z * f);
      pos.setY(i, pos.getY(i) + (rng() - 0.5) * amount * 0.8);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

// Sphere-project the normals of a canopy lobe (centered on cx/cy/cz, in the
// geometry's local space) with an up-bias, mirroring the near-LOD foliage
// cards: the crown lights as one smooth sunlit volume instead of a shattered
// pile of self-shadowing face normals. Call BEFORE translating the lobe.
function sphereNormals(geo, cx, cy, cz, upBias) {
  const pos = geo.attributes.position, nrm = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    _v3.set(pos.getX(i) - cx, (pos.getY(i) - cy) * 0.7, pos.getZ(i) - cz);
    if (_v3.lengthSq() < 1e-6) _v3.set(0, 1, 0);
    _v3.normalize();
    _v3.y += upBias;
    _v3.normalize();
    nrm.setXYZ(i, _v3.x, _v3.y, _v3.z);
  }
  return geo;
}

// vertical light gradient + speckle baked into vertex colours
function paintCanopy(geo, hue, sat, l0, l1, y0, y1, rng, flexTop) {
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const fl = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const t = clamp((pos.getY(i) - y0) / (y1 - y0), 0, 1);
    _c.setHSL(hue + (rng() - 0.5) * 0.02, sat, (l0 + (l1 - l0) * t) * (0.9 + rng() * 0.2), THREE.SRGBColorSpace);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
    fl[i] = t * flexTop;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aFlex', new THREE.BufferAttribute(fl, 1));
  return geo;
}

// Far builders return { trunk, canopy } so the canopy can use its own lit
// material (no shadow reception, boosted sky ambient) — the old single-mesh
// bark material rendered canopies as near-black shattered shards at 8x zoom.
function buildOakFarGeometry(rng, pal = {}) {
  const cp = pal.canopy || {};
  const hue = cp.hue ?? 0.24, sat = cp.sat ?? 0.30, l0 = cp.l0 ?? 0.235, l1 = cp.l1 ?? 0.36;
  const trunkParts = [], canopyParts = [];
  const trunkH = 2.9;
  // r6: thicker far trunk (0.20/0.36 -> 0.32/0.55) — sub-pixel trunks at
  // 400 m+ vanished and rim-forest crowns read as floating saucers
  const trunk = new THREE.CylinderGeometry(0.32, 0.55, trunkH, 5, 1);
  trunk.translate(0, trunkH / 2, 0);
  _c.setHSL(0.07, 0.26, 0.23, THREE.SRGBColorSpace);
  trunkParts.push(paintFlat(trunk, _c, 0));
  // 6-8 unequal lobes with strong offsets (r5, up from 4-5): broken
  // asymmetric broadleaf mass with satellite tufts poking off the crown so
  // the silhouette carries card-like raggedness even at range, with a deeper
  // shade gradient bottom -> crown
  const nLobes = 6 + ((rng() * 3) | 0);
  for (let b = 0; b < nLobes; b++) {
    const big = b === 0 ? 1 : (b < 3 ? 0.62 + rng() * 0.32 : 0.30 + rng() * 0.26);
    const blob = new THREE.IcosahedronGeometry((1.25 + rng() * 0.6) * big, 1);
    jitterRadial(blob, rng, b < 3 ? 0.34 : 0.46);
    blob.scale(1.1 + rng() * 0.3, 0.72 + rng() * 0.25, 1.1 + rng() * 0.3);
    sphereNormals(blob, 0, 0, 0, 1.0); // smooth sunlit crown, no black facets
    const spread = b < 3 ? 2.2 : 3.4; // small satellites reach past the mass
    blob.translate((rng() - 0.5) * spread, 4.15 + (rng() - 0.45) * 1.7 - (1 - big) * 0.7 + (b >= 3 ? rng() * 0.9 : 0),
      (rng() - 0.5) * spread);
    canopyParts.push(paintCanopy(blob, hue, sat, l0 * 0.82, l1, 2.3, 5.9, rng, 0.3));
  }
  return { trunk: mergeParts(trunkParts), canopy: mergeParts(canopyParts) };
}

function buildPineFarGeometry(rng, pal = {}) {
  const cp = pal.canopy || {};
  const hue = cp.hue ?? 0.315, sat = cp.sat ?? 0.26, l0 = cp.l0 ?? 0.215, l1 = cp.l1 ?? 0.33;
  const trunkParts = [], canopyParts = [];
  const trunk = new THREE.CylinderGeometry(0.22, 0.40, 2.2, 5, 1); // r6: see oak far trunk
  trunk.translate(0, 1.1, 0);
  _c.setHSL(0.06, 0.28, 0.19, THREE.SRGBColorSpace);
  trunkParts.push(paintFlat(trunk, _c, 0));
  // r7: randomized tier count/placement + deeper jitter — the fixed 3-tier
  // table stamped the same lathe-perfect stacked-cone silhouette on every
  // instance ("dozens of identical stacked cones" critique)
  const nTier = 3 + ((rng() * 2) | 0);
  const baseY = 1.2 + rng() * 0.5;
  const topYf = 5.6 + rng() * 0.9;
  for (let ti = 0; ti < nTier; ti++) {
    const tt = ti / (nTier - 1);
    const y = baseY + (topYf - baseY) * tt * (0.9 + rng() * 0.2) - 0.5;
    const r = ((1 - tt) * 1.35 + 0.45) * (0.8 + rng() * 0.45);
    const h = 1.6 + (1 - tt) * 1.2 + rng() * 0.5;
    const cone = new THREE.ConeGeometry(r, h, 8, 2);
    jitterRadial(cone, rng, 0.36);
    sphereNormals(cone, 0, h * -0.25, 0, 0.75); // radial+up: lit side / sky-filled side
    cone.translate((rng() - 0.5) * 0.55, y + h / 2, (rng() - 0.5) * 0.55);
    canopyParts.push(paintCanopy(cone, hue, sat, l0, l1, 1.2, 6.6, rng, 0.35));
  }
  // r5: a few branch-tuft satellites poking through the tier line so the far
  // pine silhouette is ragged like the near card LOD, not a lathe object
  for (let b = 0; b < 4; b++) {
    const a = rng() * Math.PI * 2, ty = 1.8 + rng() * 3.4;
    const t = (ty - 1.2) / 5.4;
    const rr = (1.0 - t) * 1.5 + 0.35;
    const tuft = new THREE.IcosahedronGeometry(0.38 + rng() * 0.3, 0);
    jitterRadial(tuft, rng, 0.4);
    tuft.scale(1.3, 0.7, 1.3);
    sphereNormals(tuft, 0, 0, 0, 0.85);
    tuft.translate(Math.cos(a) * rr, ty, Math.sin(a) * rr);
    canopyParts.push(paintCanopy(tuft, hue, sat, l0, l1, 1.2, 6.6, rng, 0.3));
  }
  return { trunk: mergeParts(trunkParts), canopy: mergeParts(canopyParts) };
}

function buildPalmFarGeometry(rng, pal = {}) {
  // The old far palm was a straight pole + one flat jittered disc — at
  // establishing distance whole oases read as glitched grey scaffolding
  // topped with green starbursts. Rebuilt: gently curved tapered trunk and a
  // crown of ARCHED drooping frond blades around a dome core, so the range
  // silhouette matches the near LOD's real palm shape.
  const cp = pal.canopy || {};
  const trunkParts = [], canopyParts = [];
  const H = 6.2;
  const leanA = rng() * Math.PI * 2;
  const lean = 0.55 + rng() * 0.45; // total top offset in meters
  const NSEG = 3;
  let px = 0, pz = 0;
  for (let i = 0; i < NSEG; i++) {
    const t0 = i / NSEG, t1 = (i + 1) / NSEG;
    const x0 = Math.cos(leanA) * lean * t0 * t0, z0 = Math.sin(leanA) * lean * t0 * t0;
    const x1 = Math.cos(leanA) * lean * t1 * t1, z1 = Math.sin(leanA) * lean * t1 * t1;
    const segLen = Math.hypot(H / NSEG, x1 - x0, z1 - z0) * 1.04;
    const seg = new THREE.CylinderGeometry(
      0.13 + (1 - t1) * 0.11, 0.15 + (1 - t0) * 0.11, segLen, 5, 1);
    seg.rotateZ(-Math.atan2(x1 - x0, H / NSEG));
    seg.rotateY(-leanA);
    seg.translate((x0 + x1) / 2, (t0 + t1) * 0.5 * H, (z0 + z1) / 2);
    _c.setHSL(0.074, 0.28, 0.37 + (i % 2) * 0.05, THREE.SRGBColorSpace);
    trunkParts.push(paintFlat(seg, _c.clone(), t1 * 0.15));
    px = x1; pz = z1;
  }
  // crown core: dome where the frond bases overlap. r9: MUCH bigger (0.62 ->
  // 1.15 radius, wider squash) — at 300+ m the blades are sub-pixel and the
  // core is all that survives; a real date-palm crown reads as a ~3 m fluffy
  // mass, and the tiny r8 core left only a spiky star (the "glitched
  // scaffolding" establishing-shot read)
  const core = new THREE.IcosahedronGeometry(1.15, 1);
  jitterRadial(core, rng, 0.28);
  core.scale(1.35, 0.62, 1.35);
  sphereNormals(core, 0, 0, 0, 1.2);
  core.translate(px, H + 0.1, pz);
  canopyParts.push(paintCanopy(core, cp.hue ?? 0.232, cp.sat ?? 0.30,
    (cp.l0 ?? 0.21) * 0.85, cp.l1 ?? 0.33, H - 0.5, H + 0.6, rng, 0.25));
  // dead-frond skirt: a ring of drooping khaki mass under the crown — the
  // second value the range silhouette needs so it reads palm, not asterisk
  const skirt = new THREE.IcosahedronGeometry(0.85, 1);
  jitterRadial(skirt, rng, 0.3);
  skirt.scale(1.25, 0.45, 1.25);
  sphereNormals(skirt, 0, 0, 0, 0.7);
  skirt.translate(px, H - 0.45, pz);
  canopyParts.push(paintCanopy(skirt, 0.10, 0.20, 0.20, 0.30, H - 0.9, H + 0.1, rng, 0.2));
  // radial arched fronds: bent tapered blades that rise, arc over and droop —
  // the star-of-fronds crown a real palm shows at range (opaque planes; the
  // far canopy material is DoubleSide for exactly this builder)
  const nF = 13 + ((rng() * 4) | 0); // r5: denser crown — sparse far palms read as sticks
  for (let k = 0; k < nF; k++) {
    const a = (k / nF) * Math.PI * 2 + rng() * 0.5;
    const len = 3.0 + rng() * 1.0;
    const phi0 = 0.55 + rng() * 0.5;            // launch angle up from horizontal
    const phiTip = -(0.55 + rng() * 0.5);       // tip droops below horizontal
    const g = new THREE.PlaneGeometry(1, 1, 1, 4);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) + 0.5; // 0..1 along the frond
      // r9: blades widened ~40% — sub-pixel blades were the starburst tell
      const w = (1.0 - t * 0.62) * (1.28 + rng() * 0.2); // taper to the tip
      let ry = 0, rf = 0;
      const steps = 8, dl = (len * t) / steps;
      for (let sIt = 0; sIt < steps; sIt++) {
        const tt = ((sIt + 0.5) / steps) * t;
        const ph = phi0 + (phiTip - phi0) * tt * tt;
        rf += Math.cos(ph) * dl;
        ry += Math.sin(ph) * dl;
      }
      p.setXYZ(i, p.getX(i) * w, ry, rf);
    }
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(a));
    g.translate(px, H + 0.14, pz);
    // outward+up sky-lit normals, matching the near-LOD frond treatment
    const nrm = g.attributes.normal;
    _v3.set(Math.sin(a) * 0.5, 1.25, Math.cos(a) * 0.5).normalize();
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, _v3.x, _v3.y, _v3.z);
    canopyParts.push(paintCanopy(g, (cp.hue ?? 0.232) + (rng() - 0.5) * 0.02,
      cp.sat ?? 0.32, cp.l0 ?? 0.21, cp.l1 ?? 0.35, H - 1.4, H + 1.5, rng, 0.4));
  }
  return { trunk: mergeParts(trunkParts), canopy: mergeParts(canopyParts) };
}

function buildBirchFarGeometry(rng, pal = {}) {
  const cp = pal.canopy || {};
  const trunkParts = [], canopyParts = [];
  const H = 5.4;
  const trunk = new THREE.CylinderGeometry(0.06, 0.16, H, 5, 1);
  trunk.translate(0, H / 2, 0);
  _c.setHSL(0.09, 0.04, 0.82, THREE.SRGBColorSpace);
  trunkParts.push(paintFlat(trunk, _c, 0));
  // r5: real winter birch crowns are a broken haze of twig masses around
  // upward branches, not 2 lobes on a pole — 4-5 lobes + branch cylinders
  const nBr = 4 + ((rng() * 2) | 0);
  for (let b = 0; b < nBr; b++) {
    const len = 1.6 + rng() * 1.4;
    const br = new THREE.CylinderGeometry(0.02, 0.06, len, 4, 1);
    br.translate(0, len / 2, 0);
    br.rotateZ(0.35 + rng() * 0.55);
    br.rotateY(rng() * Math.PI * 2);
    br.translate(0, H * (0.55 + rng() * 0.35), 0);
    _c.setHSL(0.08, 0.06, 0.55 + rng() * 0.1, THREE.SRGBColorSpace);
    trunkParts.push(paintFlat(br, _c.clone(), 0.25));
  }
  // r9: more lobes, lifted default luminance (0.16/0.26 -> 0.26/0.38) — far
  // birch crowns minified to near-black ink blots against the snowfield
  for (let b = 0; b < 5 + ((rng() * 3) | 0); b++) {
    const blob = new THREE.IcosahedronGeometry(0.65 + rng() * 0.45, 1);
    jitterRadial(blob, rng, 0.45);
    blob.scale(0.9, 1.35 + rng() * 0.4, 0.9);
    sphereNormals(blob, 0, 0, 0, 1.0);
    blob.translate((rng() - 0.5) * 2.1, H * 0.74 + (rng() - 0.4) * 1.7, (rng() - 0.5) * 2.1);
    canopyParts.push(paintCanopy(blob, cp.hue ?? 0.06, cp.sat ?? 0.07,
      cp.l0 ?? 0.26, cp.l1 ?? 0.38, H * 0.4, H, rng, 0.35));
  }
  return { trunk: mergeParts(trunkParts), canopy: mergeParts(canopyParts) };
}

// squat card clump for hedgerow/field bushes.
// r2 terrain_environment: the roadside shrubs were the loudest "flat acrylic
// splat" tell at 10-40 m — more, smaller cards (16 vs 11) for a ragged
// silhouette, a LOW normal up-bias (0.75) so the sides of the clump actually
// shade around the volume, a deeper core->rim AO ramp, and a vertical
// understory gradient so the skirt sits dark against the lit crown.
function buildBushCards(rng, pal = {}) {
  const hue0 = pal.cardHue ?? 0.24, sat0 = pal.cardSat ?? 0.26;
  const parts = [];
  const cy = 0.55;
  for (let i = 0; i < 16; i++) {
    let dx = rng() * 2 - 1, dy = rng() * 2 - 1, dz = rng() * 2 - 1;
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;
    const rad = Math.pow(0.3 + 0.7 * rng(), 0.8);
    const w = 0.72 + rng() * 0.55;
    _e.set(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI, 'YXZ');
    const vGrad = 0.78 + 0.42 * clamp(dy * 0.5 + 0.5, 0, 1); // lit top, shaded skirt
    const shade = (0.34 + 0.62 * rad) * vGrad * (0.9 + rng() * 0.2);
    parts.push(foliageCard(w, w * 0.8, dx * rad * 0.85, cy + dy * rad * 0.38, dz * rad * 0.85,
      _e, shade, hue0 + (rng() - 0.5) * 0.055, sat0 + rng() * 0.06, 0.22, 0, cy, 0, 0.75));
  }
  return mergeParts(parts);
}

// ---------------------------------------------------------------------------
// createVegetation
// ---------------------------------------------------------------------------

/**
 * Create instanced grass and trees with GPU wind.
 * @param {object} heightField HeightField from terrain.createHeightField
 * @param {object} engineCtx EngineCtx (ARCHITECTURE §2.8)
 * @param {number} [seed=2001] vegetation seed
 * @param {?object} [cfg=null] map config (uses cfg.vegetation); null = classic verdant set
 * @returns {{group:THREE.Group, update:function(number,THREE.Vector3):void,
 *   setWindTime:function(number):void, treeObstacles:Array<{min:number[],max:number[]}>}}
 */
export function createVegetation(heightField, engineCtx, seed = 2001, cfg = null) {
  const veg = {
    species: ['pine', 'oak'],
    clusterMix: [['pine', 0.55], ['oak', 0.45]],
    loneMix: [['pine', 0.5], ['oak', 0.5]],
    rimMix: [['pine', 0.7], ['oak', 0.3]],
    clusterCount: 46, loneCount: 95, rimCount: 58,
    grassDensity: 1, bushCount: 1, bushSpecies: 'oak',
    grassTexTone: null, tuftTone: null, parks: null, palettes: {},
    ...((cfg && cfg.vegetation) || {}),
  };
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  group.name = 'vegetation';
  const L = heightField._layout;
  const v = L.village;
  const noVeg = heightField._noVeg || (() => false);
  const grassPerChunk = Math.round(GRASS_PER_CHUNK * veg.grassDensity);
  const carpetPerCell = Math.round(CARPET_PER_CELL * veg.grassDensity);

  const uWindTime = { value: 0 };
  const uCamPos = { value: new THREE.Vector3(0, 0, 0) };
  // gameplay_feel r2: camera->tank occlusion-fade focus point (y=-9999 = off)
  const uFocusPos = { value: new THREE.Vector3(0, -9999, 0) };
  // Sniper near-grass suppression (0 = arcade, 1 = sniper): with the camera at
  // the gun trunnion, meter-tall blades otherwise flood the lower half of the
  // scope. WoT hides near grass in sniper mode by default — fade tufts inside
  // ~15 m of the camera while the rig is in SNIPER. Eased over ~0.1 s in
  // update() so mode switches don't pop.
  const uSniperFade = { value: 0 };
  let sniperFadeTarget = 0;
  // HIGH-ZOOM SCOPE HARD-CUT (controls_gunnery r4): at x4/x8 the screen-door
  // dither of the scope-corridor fade magnifies into a full-frame halftone
  // stipple (the r3 critic's "blanketed in dither"). Below ~15° FOV the
  // corridor fade goes BINARY — faded fragments discard cleanly, kept ones
  // render full-opacity — so the zoomed sight picture is crisp edge to edge.
  const uScopeHard = { value: 0 };
  // SCOPE CORRIDOR LENGTH (controls_gunnery r5): how far along the scope ray
  // the foliage cull reaches, in meters. Driven from the live server-aim
  // distance (rig.aimDist) through setSniperFade — the r4 corridor died at a
  // fixed 40-70 m, so any bush 100-320 m out on the sight line still blinded
  // the x4/x8 scope (r5 critique: target IS-2 100% hidden at 320 m).
  const uScopeDist = { value: 70 };
  // Camera forward (unit) — drives the sniper center-cone grass clear-out.
  const uCamFwd = { value: new THREE.Vector3(0, 0, 1) };

  // ---- grass materials (shared hook, per-material fade distance) ----
  const grassWindHook = (farDist) => (shader) => {
    shader.uniforms.uWindTime = uWindTime;
    shader.uniforms.uCamPos = uCamPos;
    shader.uniforms.uGrassFar = { value: farDist };
    shader.uniforms.uSniperFade = uSniperFade;
    shader.uniforms.uCamFwd = uCamFwd;
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <common>',
      '#include <common>\nuniform float uWindTime;\nuniform vec3 uCamPos;\nuniform float uGrassFar;\nuniform float uSniperFade;\nuniform vec3 uCamFwd;');
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <begin_vertex>', /* glsl */`
      #include <begin_vertex>
      {
        vec4 giw = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float dCam = distance(giw.xyz, uCamPos);
        // wide scale-out band (last ~third of the range): tufts shrink away
        // gradually instead of cutting to flat albedo on a visible line
        float gfade = 1.0 - smoothstep(uGrassFar * 0.66, uGrassFar, dCam);
        // sniper scope (WoT keeps the scoped picture clean): the trunnion-
        // height camera stares OVER meter-tall blades, so the old 7-15 m
        // suppression still let midfield grass flood 30-60% of the sight at
        // x2-x8. Widen the near band to 30 m AND clear a center cone — blades
        // within ~3-6 m of the view ray out to ~90 m shrink away; off-axis
        // and far grass keeps the meadow context around the scope edges.
        float nearBand = smoothstep(12.0, 30.0, dCam);
        float dRay = length(cross(giw.xyz - uCamPos, uCamFwd));
        float rayBand = 1.0 - (1.0 - smoothstep(2.6, 6.0, dRay)) * (1.0 - smoothstep(90.0, 130.0, dCam));
        gfade *= mix(1.0, nearBand * rayBand, uSniperFade);
        transformed *= gfade;
        float sway = uv.y * uv.y;
        float phase = giw.x * 0.35 + giw.z * 0.28;
        transformed.x += sway * (0.12 * sin(uWindTime * 1.6 + phase) + 0.05 * sin(uWindTime * 3.7 + phase * 2.3));
        transformed.z += sway * 0.08 * cos(uWindTime * 1.3 + phase);
      }`);
    useAttributeNormal(shader);
  };

  // tuft geometry: 3 crossed planes, root sunk slightly for ground blend
  function makeTuftGeometry(w, h) {
    const planes = [];
    for (let k = 0; k < 3; k++) {
      const p = new THREE.PlaneGeometry(w, h, 1, 2);
      p.translate(0, h / 2 - 0.03, 0);
      p.rotateY((k / 3) * Math.PI);
      planes.push(p);
    }
    const geo = mergeGeometries(planes, false);
    const nrm = geo.attributes.normal;
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
    return geo;
  }

  const grassTex = [
    makeGrassCardTexture(mulberry32(seed + 41), 0, veg.grassTexTone),
    makeGrassCardTexture(mulberry32(seed + 42), 1, veg.grassTexTone),
  ];
  function makeGrassMaterial(tex, farDist, cacheKey) {
    const mat = new THREE.MeshStandardMaterial({
      map: tex, alphaTest: 0.44, side: THREE.DoubleSide,
      roughness: 1.0, metalness: 0.0,
    });
    mat.envMapIntensity = 0.35; // kill white env-specular sparkle on distant blades
    engineCtx.setupShadowMaterial(mat, grassWindHook(farDist));
    mat.customProgramCacheKey = () => cacheKey;
    return mat;
  }
  const grassVariants = [];
  for (let gv = 0; gv < 2; gv++) {
    // r7: taller tuft cards (0.60/0.48 -> 0.74/0.58) — WoT-scale near grass
    // must clearly break the ground plane beside the tracks, not read as a
    // 2 cm moss carpet
    const w = gv === 0 ? 0.92 : 1.14, h = gv === 0 ? 0.74 : 0.58;
    grassVariants.push({
      geo: makeTuftGeometry(w, h),
      matMid: makeGrassMaterial(grassTex[gv], GRASS_FADE_END, 'world-grass-wind-v5'),
      matNear: makeGrassMaterial(grassTex[gv], CARPET_FAR, 'world-grass-carpet-v5'),
    });
  }

  const _m4 = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _pv = new THREE.Vector3();
  const _sv = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);

  // shared placement filter/tint for a tuft candidate; returns null or
  // [x, y, z, yaw, sxz, sy, r, g, b, variant].
  // PERF (GC): the returned array is a REUSED module scratch — callers must
  // copy the values out (slice() at init time, flat-pack for carpet cells)
  // before calling makeTuft again. This ran hot enough to top the allocation
  // profile while driving (new carpet cells stream in as the camera moves).
  const _tuftScratch = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  function makeTuft(x, z, crng, carpet) {
    if (Math.max(Math.abs(x), Math.abs(z)) > 474) return null;
    const roll = crng(), yaw = crng() * Math.PI * 2;
    const sxz = 0.74 + crng() * 0.62;
    let sy = 0.55 + crng() * 0.85;
    const hueJ = crng(), lumJ = crng(), varJ = crng(), clJ = crng();
    if (noVeg(x, z)) return null;
    const gt = heightField.getGroundType(x, z);
    if (gt === 'hard' || heightField._roadDist(x, z) < 4.2) return null;
    let dry = 0;
    if (gt === 'soft') { if (roll > 0.3) return null; sy *= 1.5; dry = 0.5; } // sparse marsh reeds
    if (heightField._villageMask(x, z) > 0.35 && roll > (carpet ? 0.35 : 0.15)) return null;
    if (heightField.getNormalAt(x, z).y < 0.78) return null;
    // splat-aware thinning: drier + thinner on dirt patches, dense in meadows
    const sn = sampleSplatNoise(x, z);
    // (thresholds track the shader's `worn` band — r6: 0.60/0.82 + warp)
    const dirtPatch = smoothstepJs(0.60, 0.82, sn.n2 + (sn.n1 - 0.5) * 0.45);
    if (dirtPatch > 0.35 && clJ < dirtPatch * 0.9) dry = Math.max(dry, 0.55);
    // r7: carpet cull 0.6 -> 0.4 — the near dirt patches punched hard bald
    // holes in the hero grass ring and the exposed albedo read as "flat
    // mottled texture up to the tracks"; keep them THINNER, not bare
    if (dirtPatch > 0.55 && roll < (carpet ? 0.4 : 0.75)) return null;
    if (!carpet) { // midfield scatter keeps the clumpy meadow look
      // r2: cull relaxed 0.42 -> 0.38 and midfield tufts run ~15% wider —
      // the dense near carpet used to step down to a visibly thinner band at
      // 60-80 m (the LOD seam across the midfield); more + wider coverage
      // per instance carries the 3D read deeper without new allocations
      if (sn.n1 < 0.38 && clJ > 0.25 + sn.n1) return null;
    }
    // sparse-biome ecology (desert scrub / winter litter): confetti-uniform
    // scatter reads as noise dots — gate placement behind a low-frequency
    // mask so growth clusters in hollows and along moisture lines, with only
    // stray outliers between the clumps
    let sxzMul = 1, syMul = 1;
    if (veg.grassDensity < 0.5) {
      // r6 two-scale Poisson-style clustering: the r5 single macro mask still
      // passed ~40% of candidates over half the map — near-constant density,
      // the "pepper noise" critique. Now a BIOME belt (~150 m moisture lines)
      // gates a THICKET field (~10-20 m clump cores): dense growth knots
      // inside the belts, clean open ground between, ~3% stray outliers.
      const biome = smoothstepJs(0.42, 0.70, sn.n2);
      const thicket = smoothstepJs(0.44, 0.78, sn.n1);
      const clump = biome * (0.12 + 0.88 * thicket);
      if (clJ > clump * 0.97 + 0.03) return null;
      // size keyed to the clump core — big established growth at centers,
      // stunted stragglers at the fringe. r7: syMul capped at 1.35 (was up
      // to 1.75): the tallest outliers stacked with sy up to 2.4x card
      // height and single sun-bleached blades read as white geometry
      // slivers poking over dune crests in the desert establishing shot
      sxzMul = 0.5 + clump * 0.85 + roll * 0.7;
      syMul = Math.min(1.35, 0.55 + clump * 0.65 + varJ * 0.55);
    }
    const vv = varJ < (0.75 - dry * 0.5) ? 0 : 1;
    const y = heightField.getHeightAt(x, z);
    // toned to sit on the terrain grass albedo so the far scale-out is
    // invisible (tufts must NOT read brighter than the ground they stand on)
    // r2: per-tuft variance REDUCED (hue 0.075 -> 0.05, lum 0.19 -> 0.12)
    // and a low-frequency meadow unifier keyed to the shared splat field —
    // adjacent tufts now drift together like one sward instead of the
    // radioactive lime-vs-dark confetti the critique flagged
    let th = 0.225 + (hueJ - 0.5) * 0.05 - dry * 0.08;
    let ts = 0.30 - dry * 0.11;
    let tl = 0.44 + (lumJ - 0.5) * 0.12 + (sn.n2 - 0.5) * 0.10 + dry * 0.04;
    if (veg.tuftTone) [th, ts, tl] = veg.tuftTone(th, ts, tl);
    _c.setHSL(((th % 1) + 1) % 1, clamp(ts, 0, 1), clamp(tl, 0, 1));
    const t = _tuftScratch;
    // r2: midfield (non-carpet) tufts run ~15% wider — see the cull note above
    t[0] = x; t[1] = y - 0.03; t[2] = z; t[3] = yaw;
    t[4] = sxz * sxzMul * (carpet ? 1 : 1.15); t[5] = sy * syMul;
    t[6] = _c.r; t[7] = _c.g; t[8] = _c.b; t[9] = vv;
    return t;
  }

  // write a tuft stored at offset o of an indexable array (flat-packed cells)
  function writeTuftAt(mesh, i, t, o) {
    _q.setFromAxisAngle(_up, t[o + 3]);
    _m4.compose(_pv.set(t[o], t[o + 1], t[o + 2]), _q, _sv.set(t[o + 4], t[o + 5], t[o + 4]));
    mesh.setMatrixAt(i, _m4);
    _c.setRGB(t[o + 6], t[o + 7], t[o + 8]);
    mesh.setColorAt(i, _c);
  }
  function writeTuft(mesh, i, t) { writeTuftAt(mesh, i, t, 0); }

  // ---- midfield grass scatter (map-wide chunks, unchanged system) ----
  const grassChunks = [];
  for (let cz = 0; cz < CHUNKS; cz++) for (let cx = 0; cx < CHUNKS; cx++) {
    const crng = mulberry32((seed ^ (cx * 73856093) ^ (cz * 19349663)) >>> 0);
    const x0 = -HALF + cx * CHUNK_SIZE, z0 = -HALF + cz * CHUNK_SIZE;
    const tufts = [[], []];
    for (let i = 0; i < grassPerChunk; i++) {
      const t = makeTuft(x0 + crng() * CHUNK_SIZE, z0 + crng() * CHUNK_SIZE, crng, false);
      if (t) tufts[t[9]].push(t.slice()); // copy — makeTuft returns a scratch
    }
    const chunkMeshes = [];
    for (let vv = 0; vv < 2; vv++) {
      if (tufts[vv].length === 0) continue;
      const mesh = new THREE.InstancedMesh(grassVariants[vv].geo, grassVariants[vv].matMid, tufts[vv].length);
      for (let i = 0; i < tufts[vv].length; i++) writeTuft(mesh, i, tufts[vv][i]);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false; // visibility handled per-chunk in update()
      mesh.visible = false;
      mesh.matrixAutoUpdate = false;
      mesh.userData.aoExclude = true; // GTAO override prepass ignores alphaTest
      group.add(mesh);
      chunkMeshes.push({ mesh, total: tufts[vv].length });
    }
    if (chunkMeshes.length > 0) {
      grassChunks.push({ meshes: chunkMeshes, cx: x0 + CHUNK_SIZE / 2, cz: z0 + CHUNK_SIZE / 2 });
    }
  }

  // ---- near grass carpet (camera-centred, dense, cell-cached) ----
  // PERF (performance_budget r5): DOUBLE-BUFFERED. A rebuild used to
  // bufferSubData 3.9 MB into the instance buffers the GPU was still reading
  // — on ANGLE's Metal backend that is a fence wait, profiled at 22-224 ms
  // per rebuild while driving (the certification p99/p1 killer). Each rebuild
  // now writes the INACTIVE mesh pair (idle for >=180 ms, no in-flight
  // references, so the upload is a plain memcpy) and flips visibility. Ranged
  // uploads keep the transfer at the live prefix, not the 52 k cap.
  const carpetSets = []; // per variant: { meshes: [a, b], active: 0 }
  const _zeroScaleM4 = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let vv = 0; vv < 2; vv++) {
    const pair = [];
    for (let half = 0; half < 2; half++) {
      const mesh = new THREE.InstancedMesh(grassVariants[vv].geo, grassVariants[vv].matNear, CARPET_CAP);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      // boot with ONE zero-scale instance visible: an invisible mesh never
      // reaches WebGLAttributes.update, so its 3.3 MB GPU buffer would
      // otherwise be created by the FIRST in-battle flip — a one-shot
      // bufferData hitch inside the certification window. Zero scale
      // rasterizes nothing; the first real rebuild overwrites slot 0.
      mesh.count = 1;
      mesh.visible = true;
      mesh.setMatrixAt(0, _zeroScaleM4);
      mesh.matrixAutoUpdate = false;
      mesh.userData.aoExclude = true; // GTAO override prepass ignores alphaTest
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, new THREE.Color(1, 1, 1)); // allocate instanceColor now
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      group.add(mesh);
      pair.push(mesh);
    }
    carpetSets.push({ meshes: pair, active: 0 });
  }
  // PERF (GC): each cached cell is ONE flat Float32Array (10 floats per tuft)
  // instead of ~a hundred small JS arrays — cell streaming while driving was
  // the top per-frame allocation source in the heap profile.
  const carpetCache = new Map(); // "ix,iz" -> Float32Array (len = 10 * count)
  const _cellScratch = new Float32Array(1024 * 10); // packs one cell before sizing
  function carpetCell(ix, iz) {
    const key = ix + ',' + iz;
    let cell = carpetCache.get(key);
    if (cell) return cell;
    const crng = mulberry32((seed ^ 0x51ab ^ (ix * 374761393) ^ (iz * 668265263)) >>> 0);
    const x0 = ix * CARPET_CELL, z0 = iz * CARPET_CELL;
    let n = 0;
    for (let i = 0; i < carpetPerCell; i++) {
      const t = makeTuft(x0 + crng() * CARPET_CELL, z0 + crng() * CARPET_CELL, crng, true);
      if (t && (n + 1) * 10 <= _cellScratch.length) {
        t[4] *= 0.96; t[5] *= 1.04; // r7: near carpet no longer shrunk — it is the hero grass
        _cellScratch.set(t, n * 10);
        n++;
      }
    }
    cell = _cellScratch.slice(0, n * 10);
    carpetCache.set(key, cell);
    if (carpetCache.size > 420) carpetCache.delete(carpetCache.keys().next().value);
    return cell;
  }
  const _carpetLast = new THREE.Vector3(1e9, 0, 0);
  let _carpetLastMs = -1e9;
  function rebuildCarpet(camPos) {
    const cix = Math.floor(camPos.x / CARPET_CELL), ciz = Math.floor(camPos.z / CARPET_CELL);
    const counts = [0, 0];
    // write into the inactive half of each variant's A/B pair (see above)
    const targets = [
      carpetSets[0].meshes[1 - carpetSets[0].active],
      carpetSets[1].meshes[1 - carpetSets[1].active],
    ];
    for (let dz = -CARPET_RING; dz <= CARPET_RING; dz++) {
      for (let dx = -CARPET_RING; dx <= CARPET_RING; dx++) {
        const cell = carpetCell(cix + dx, ciz + dz);
        for (let o = 0; o < cell.length; o += 10) {
          const vv = cell[o + 9];
          if (counts[vv] >= CARPET_CAP) continue;
          writeTuftAt(targets[vv], counts[vv]++, cell, o);
        }
      }
    }
    for (let vv = 0; vv < 2; vv++) {
      const set = carpetSets[vv];
      const fresh = targets[vv];
      const stale = set.meshes[set.active];
      fresh.count = counts[vv];
      fresh.visible = counts[vv] > 0;
      // upload only the written prefix — the 52 k cap is rarely full
      fresh.instanceMatrix.clearUpdateRanges();
      fresh.instanceMatrix.addUpdateRange(0, counts[vv] * 16);
      fresh.instanceMatrix.needsUpdate = true;
      if (fresh.instanceColor) {
        fresh.instanceColor.clearUpdateRanges();
        fresh.instanceColor.addUpdateRange(0, counts[vv] * 3);
        fresh.instanceColor.needsUpdate = true;
      }
      // A never-filled half holds only the boot zero-scale instance (draws
      // nothing) — LEAVE it visible so its GPU buffers get created by the
      // next rendered frame instead of by its first mid-battle flip.
      if (stale.userData.carpetFilled) stale.visible = false;
      fresh.userData.carpetFilled = true;
      set.active = 1 - set.active;
    }
  }

  // ---- trees ----
  // Every tree material carries the per-instance occlusion fade (aFadeI,
  // 0 = solid → 1 = dithered to ~12%) plus a near-camera dissolve: WoT fades
  // any tree standing between the chase camera and the vehicle — without it,
  // forest routes hide the player tank behind full-screen canopy walls, and
  // cards inside the orbit radius degrade to giant flat unlit sheets.
  // camo_spotting r3: per-hook near-camera dissolve — trunks keep the tight
  // 1.5-4.2 m band (a trunk 5 m away SHOULD block the view), CANOPY fragments
  // (leaf cards + far-LOD lobes) dissolve out to ~8 m so the in-clump chase
  // camera is never smothered by unfaded sheets.
  // r2: wrap is now an AMOUNT (0 = off). Trunks get a moderate 0.30 wrap so
  // the bark terminator rolls off softly instead of the hard two-tone
  // lit/shadow split the critique flagged; canopy keeps the strong 0.62.
  // fullFade (was keyed off wrap) controls the occlusion-fade keep floor.
  const makeTreeWindHook = (nearD0, nearD1, wrap = 0, fullFade = false) => (shader) => {
    shader.uniforms.uWindTime = uWindTime;
    // SNIPER SCOPE CORRIDOR (controls_gunnery r3): while scoped, EVERY tree
    // part (trunk, near cards, far canopy — this hook is shared by all of
    // them, and foliageWindHook chains through it for leaf cards + bushes)
    // crossing a ~4.5 m radius cylinder along the scope ray for the first
    // ~60 m dithers down to a 0.16 keep-floor. WoT fades intervening crowns
    // in sniper mode; without this, leaf cards and trunks 5-60 m out walled
    // off the whole sight picture (a locked 415 m target was 100% invisible).
    shader.uniforms.uCamPos = uCamPos;
    shader.uniforms.uCamFwd = uCamFwd;
    shader.uniforms.uSniperFade = uSniperFade;
    shader.uniforms.uScopeHard = uScopeHard;
    shader.uniforms.uScopeDist = uScopeDist; // r5: corridor length = aim dist
    shader.uniforms.uFocusPos = uFocusPos;   // r2: occlusion-fade sight capsule
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <common>',
      '#include <common>\nuniform float uWindTime;\nuniform vec3 uCamPos;\nuniform vec3 uCamFwd;\nuniform float uSniperFade;\nuniform float uScopeDist;\nuniform vec3 uFocusPos;\nattribute float aFlex;\nattribute float aFadeI;\nvarying float vFadeI;\nvarying float vScopeKeep;');
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <begin_vertex>', /* glsl */`
      #include <begin_vertex>
      {
        vec4 tiw = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float ph = tiw.x * 0.043 + tiw.z * 0.051;
        float amp = aFlex * 0.14;
        transformed.x += amp * (sin(uWindTime * 1.15 + ph) + 0.45 * sin(uWindTime * 2.63 + ph * 1.7));
        transformed.z += amp * 0.7 * cos(uWindTime * 0.97 + ph * 1.3);
        vec4 tvw = instanceMatrix * vec4(transformed, 1.0);
        // gameplay_feel r2: occlusion fade only near the camera->tank sight
        // capsule — canopy crossing open sky stays solid (no dither
        // curtains smearing crowns half-off the sight line). uFocusPos.y is
        // parked at -9999 while the corridor is off, zeroing the fade.
        {
          vec3 seg = uFocusPos - uCamPos;
          float segL2 = dot(seg, seg);
          float tt = segL2 > 1e-4 ? clamp(dot(tvw.xyz - uCamPos, seg) / segL2, 0.0, 1.0) : 0.0;
          float dSeg = length(tvw.xyz - (uCamPos + seg * tt));
          vFadeI = aFadeI * (1.0 - smoothstep(3.0, 6.5, dSeg));
        }
        // sniper scope-ray corridor keep (per vertex — tall trunks fade only
        // where they actually cross the sight line)
        vec3 tRel = tvw.xyz - uCamPos;
        float tAlong = dot(tRel, uCamFwd);
        float tDRay = length(tRel - uCamFwd * max(tAlong, 0.0));
        // >>> gameplay_feel r4 / controls_gunnery r5: FULL suppression inside
        // the aiming corridor. The r4 corridor culled canopy within ~5.5 m of
        // the scope ray but only for the first 40-70 m along it — a bush
        // sitting at 100-320 m on the sight line still hid an aimed-at,
        // SPOTTED target completely (r5 critique: IS-2 at 320 m, 100% blind
        // x4 scope). The corridor now runs the whole way to the server-aim
        // distance (uScopeDist, from rig.aimDist): near foliage keeps the
        // wide 5.5-9 m clearance, far foliage narrows to a 2.5-5 m tunnel so
        // long shots open a scope-sized window instead of carving a canyon
        // through the forest. Composes with the fragment-side uScopeHard
        // high-zoom binary cut: keep 0 discards under both.
        float tBand = smoothstep(30.0, 60.0, tAlong);
        float tCorr = 1.0 - (1.0 - smoothstep(mix(5.5, 2.5, tBand),
                                              mix(9.0, 5.0, tBand), tDRay))
                          * (1.0 - smoothstep(uScopeDist, uScopeDist + 30.0, tAlong));
        vScopeKeep = mix(1.0, tCorr, uSniperFade);
        // <<< gameplay_feel r4 / controls_gunnery r5
      }`);
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <common>',
      '#include <common>\nuniform float uScopeHard;\nvarying float vFadeI;\nvarying float vScopeKeep;');
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <alphatest_fragment>', /* glsl */`
      #include <alphatest_fragment>
      {
        // camera-occlusion fade (per-instance) + near-camera card dissolve
        // + sniper scope corridor. Screen-space dither keeps the opaque/
        // alpha-tested pipeline (depth writes stay correct — no sorting,
        // no blend halos).
        // gameplay_feel r5: canopy fades FULLY (WoT fades the whole occluder
        // corridor — the old 0.12 keep-floor stippled a haze over the tank);
        // trunks keep the 12% ghost so the forest still reads.
        float fadeKeep = 1.0 - ${fullFade ? '1.0' : '0.88'} * vFadeI;
        fadeKeep *= smoothstep(${nearD0.toFixed(2)}, ${nearD1.toFixed(2)}, length(vViewPosition));
        fadeKeep = min(fadeKeep, vScopeKeep);
        if (uScopeHard > 0.5) {
          // high-zoom scope (FOV <= 15°): dither magnified by the optics
          // reads as halftone stipple — cut binary instead (r4): corridor
          // foliage vanishes cleanly, everything else is full-opacity.
          if (fadeKeep < 0.55) discard;
        } else if (fadeKeep < 0.9995) {
          // lighting_post r2: decorrelated hash instead of IGN — IGN at mid
          // keep-rates resolves as a checkerboard in 1080p stills; hash
          // noise reads as film grain.
          float ign = fract( sin( dot( gl_FragCoord.xy, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
          if (ign > fadeKeep) discard;
        }
      }`);
    // lighting_post r3: wrap-diffuse on canopy materials — crowns get a lit
    // side -> occluded interior ramp under the CSM sun instead of reading as
    // unshaded texture at distance. Cards carry canopy-outward normals.
    if (wrap > 0) {
      // r8: wrap 0.45 -> 0.62 — shadowed canopy undersides still crushed to
      // black paint in the chase view; the stronger wrap plays the leaf
      // translucency/skylight bounce a real crown skirt shows
      const w = wrap.toFixed(2);
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_physical_pars_fragment>',
        THREE.ShaderChunk.lights_physical_pars_fragment.replace(
          'float dotNL = saturate( dot( normal, directLight.direction ) );',
          `float dotNL = saturate( ( dot( normal, directLight.direction ) + ${w} ) / ${(1 + wrap).toFixed(2)} );`));
    }
  };
  const treeWindHook = makeTreeWindHook(1.5, 4.2, 0.30);          // trunks/bark
  const canopyWindHook = makeTreeWindHook(2.5, 8.0, 0.62, true);  // canopy sheets + cards
  const foliageWindHook = (shader) => {
    canopyWindHook(shader);
    useAttributeNormal(shader);
    // SNIPER FOLIAGE FADE (controls_gunnery r2): WoT fades the bush the
    // player is scoped inside — screen-door-dither leaf fragments within
    // ~10 m of the camera while uSniperFade > 0 (same eased uniforms as the
    // grass suppression; zero cost in arcade mode where vFolKeep == 1.0).
    // The r3 scope-ray corridor lives in makeTreeWindHook (shared with trunks
    // and far canopies) — this hook only adds the inside-a-bush dissolve.
    // (uCamPos/uSniperFade uniforms + declarations already added upstream.)
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <common>',
      '#include <common>\nvarying float vFolKeep;');
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <project_vertex>', /* glsl */`
      {
        vec4 fiw = instanceMatrix * vec4(transformed, 1.0);
        vFolKeep = mix(1.0, smoothstep(4.0, 10.0, distance(fiw.xyz, uCamPos)), uSniperFade);
      }
      #include <project_vertex>`);
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <common>',
      '#include <common>\nvarying float vFolKeep;');
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <alphatest_fragment>', /* glsl */`
      #include <alphatest_fragment>
      if (uScopeHard > 0.5) {
        if (vFolKeep < 0.55) discard; // r4: binary at high zoom — no stipple
      } else if (vFolKeep < 0.999) {
        float fdit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        if (fdit >= vFolKeep) discard;
      }`);
  };
  // r2: striated bark albedo+normal on every trunk/branch (see makeBarkTexture)
  // — vertex colors still carry the per-species tint, lifted ~1.35x below to
  // compensate for the ~0.72-mean map multiplying in.
  const barkTex = makeBarkTexture(seed + 97);
  const barkMat = new THREE.MeshStandardMaterial({
    map: barkTex.albedo, normalMap: barkTex.normal,
    vertexColors: true, roughness: 0.92, metalness: 0.0,
  });
  barkMat.normalScale.set(0.85, 0.85);
  barkMat.envMapIntensity = 0.85;
  engineCtx.setupShadowMaterial(barkMat, treeWindHook);
  barkMat.customProgramCacheKey = () => 'world-tree-bark-v6';

  // far canopy: own material — strong sky/env fill acts as the fake-SSS
  // backlight term so shaded crown sides stay green, never crushed black
  const canopyFarMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1.0, metalness: 0.0 });
  // DoubleSide: the far palm crown is built from open arched frond blades —
  // FrontSide culled half of them at any azimuth (closed lobe canopies are
  // unaffected beyond a little overdraw)
  canopyFarMat.side = THREE.DoubleSide;
  canopyFarMat.envMapIntensity = 1.35;
  engineCtx.setupShadowMaterial(canopyFarMat, canopyWindHook);
  canopyFarMat.customProgramCacheKey = () => 'world-tree-canopyfar-v8';

  // species registry: texture + near/far geometry builders, seed bases keep
  // the classic verdant set bit-identical to the pre-config build
  const SPECIES = {
    pine: {
      texSeed: 52, nearSeed: 61, farSeed: 71,
      tex: (r, pal) => makeNeedleSprayTexture(r, pal.texTone || null),
      near: (k, pal) => ({
        trunk: buildPineTrunk(mulberry32(seed + 61 + k)),
        cards: buildPineCards(mulberry32(seed + 63 + k), 0.60, 1.0, pal),
      }),
      far: (r, pal) => buildPineFarGeometry(r, pal),
    },
    oak: {
      texSeed: 51, nearSeed: 65, farSeed: 73,
      tex: (r, pal) => makeLeafClusterTexture(r, pal.texTone || null),
      near: (k, pal) => ({
        trunk: buildBroadleafTrunk(mulberry32(seed + 65 + k)),
        cards: buildBroadleafCards(mulberry32(seed + 67 + k), 58, 1.0, pal),
      }),
      far: (r, pal) => buildOakFarGeometry(r, pal),
    },
    palm: {
      texSeed: 53, nearSeed: 81, farSeed: 75,
      tex: (r, pal) => makePalmFrondTexture(r, pal.texTone || null),
      near: (k, pal) => buildPalmGeometry(mulberry32(seed + 81 + k), pal),
      far: (r, pal) => buildPalmFarGeometry(r, pal),
    },
    birch: {
      texSeed: 54, nearSeed: 85, farSeed: 77,
      tex: (r, pal) => makeTwigTexture(r, pal.texTone || null),
      near: (k, pal) => buildBirchGeometry(mulberry32(seed + 85 + k)),
      far: (r, pal) => buildBirchFarGeometry(r, pal),
    },
  };
  const speciesList = veg.species.filter((sp) => SPECIES[sp]);
  const bushSpecies = speciesList.includes(veg.bushSpecies) ? veg.bushSpecies : speciesList[0];
  const palOf = (sp) => veg.palettes[sp] || {};

  const foliageTex = {};
  const foliageMats = {};
  const foliageDepthMats = {};
  for (const sp of speciesList) {
    foliageTex[sp] = SPECIES[sp].tex(mulberry32(seed + SPECIES[sp].texSeed), palOf(sp));
    const fm = new THREE.MeshStandardMaterial({
      map: foliageTex[sp], alphaTest: 0.38, side: THREE.DoubleSide,
      vertexColors: true, roughness: 1.0, metalness: 0.0,
    });
    fm.envMapIntensity = 0.85; // keep ambient on shaded leaves — no black cards
    engineCtx.setupShadowMaterial(fm, foliageWindHook);
    fm.customProgramCacheKey = () => 'world-tree-foliage-v8-' + sp;
    foliageMats[sp] = fm;
    // alpha-tested shadow casting: without this every card shadows as a quad.
    // r6: palm gets a HIGHER shadow alphaTest — its frond texture covers most
    // of the card, so at shadow-map mip levels the averaged alpha stayed
    // above 0.38 across the whole quad and every frond shadowed as a solid
    // 1.9 m strap; the crown projected a giant star-shaped blob several times
    // its own size (desert critique). 0.62 keeps only the dense frond core.
    foliageDepthMats[sp] = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking, map: foliageTex[sp],
      alphaTest: sp === 'palm' ? 0.62 : 0.38,
    });
  }

  // r7: 3 near variants + 2 far variants per species (was 2/1) — "dozens of
  // identical stacked-cone pines" was a top critique; every stand now mixes
  // three distinct crowns near and two silhouettes at range, on top of the
  // per-instance rotation/scale/tint jitter.
  const NEAR_VARIANTS = 3, FAR_VARIANTS = 2;
  const treeGeo = {};
  const treeGeoFar = {};
  for (const sp of speciesList) {
    treeGeo[sp] = [0, 1, 2].map((k) => SPECIES[sp].near(k * 7, palOf(sp)));
    treeGeoFar[sp] = [0, 1].map(
      (k) => SPECIES[sp].far(mulberry32(seed + SPECIES[sp].farSeed + k * 101), palOf(sp)));
  }

  // weighted species pick from a [ [species, weight], ... ] mix
  function pickSpecies(mix, roll) {
    let tot = 0;
    for (const [sp, w] of mix) if (treeGeo[sp]) tot += w;
    let acc = 0;
    for (const [sp, w] of mix) {
      if (!treeGeo[sp]) continue;
      acc += w / tot;
      if (roll <= acc) return sp;
    }
    return speciesList[0];
  }

  // placement: clusters + lone trees + horizon rim forest
  const clusters = [];
  const trees = []; // { x,z,species,variant, mat: Matrix4, tint: Color, near: bool }
  const treeObstacles = [];
  // SPOTTING WIRING: concealment discs {x,z,r,add} sampled by the spotting
  // sim (src/sim/spotting.js) — bushes conceal strongly, tree canopies mildly.
  const concealers = [];
  function siteOk(x, z, margin) {
    if (Math.max(Math.abs(x), Math.abs(z)) > 455) return false;
    if (x > v.x0 - 24 && x < v.x1 + 24 && z > v.z0 - 24 && z < v.z1 + 24) return false;
    if (heightField._roadDist(x, z) < 9 + margin) return false;
    if (heightField.getGroundType(x, z) === 'soft' || noVeg(x, z)) return false;
    if (veg.parks) { // town maps: trees only inside the park belts
      let inPark = false;
      for (const p of veg.parks) {
        if (Math.hypot(x - p.x, z - p.z) < p.r) { inPark = true; break; }
      }
      if (!inPark) return false;
    }
    for (const s of [L.spawns.player, ...L.spawns.enemies]) {
      if (Math.hypot(x - s.x, z - s.z) < 26) return false;
    }
    return heightField.getNormalAt(x, z).y > 0.82;
  }
  function pushTree(x, z, species, scMin, scMax, withObstacle) {
    const y = heightField.getHeightAt(x, z);
    const sc = scMin + rng() * (scMax - scMin);
    _q.setFromAxisAngle(_up, rng() * Math.PI * 2);
    // height variance clamped tight (no needle-thin scaling-bug giants)
    _m4.compose(_pv.set(x, y - 0.06, z), _q, _sv.set(sc, sc * (0.92 + rng() * 0.16), sc));
    // per-tree hue/value jitter, WIDE: identical-sibling canopies are the
    // loudest mid-distance tell, so value swings ~2x and hue drifts between
    // yellow-green and blue-green per instance
    const vj = 0.58 + rng() * 0.42;
    _c.setRGB(vj * (0.88 + rng() * 0.26), vj * (0.96 + rng() * 0.22), vj * (0.84 + rng() * 0.24));
    trees.push({
      x, z, species, variant: (rng() * 3) | 0, fv: (rng() * 2) | 0,
      mat: _m4.clone(), tint: _c.clone(), near: false,
      // occlusion-fade bookkeeping: canopy proxy sphere (world center/radius,
      // generous enough for every species' card spread), eased fade 0..1 and
      // the instance slot assigned by the current near partition (-1 = far).
      // fslot mirrors slot for the far partition (incremental repartition).
      cy: y + 4.4 * sc, cr: 2.9 * sc, fade: 0, slot: -1, fslot: -1,
      dr: (species === 'pine' || species === 'birch' ? 1.3 : 1.8) * sc, // root-decal radius
    });
    if (withObstacle) {
      treeObstacles.push({ min: [x - 0.55, y, z - 0.55], max: [x + 0.55, y + 3.2 * sc, z + 0.55] });
      // camo_spotting r3 forest balance: 0.13 stacked any clump to the bush
      // cap — bloom-hot forest campers at 250 m+ never lit up. Canopies
      // soft-conceal (0.08); bushes (0.35) stay the real hides. Pairs with
      // MAX_BUSH_BONUS 0.6 -> 0.5 in src/sim/spotting.js (already applied).
      concealers.push({ x, z, r: 2.3 * sc, add: 0.08 }); // canopy soft-conceals
    }
  }
  function addTree(x, z, species) {
    if (!siteOk(x, z, 0)) return false;
    pushTree(x, z, species, 0.95, 1.7, true); // wide size spread per stand
    return true;
  }
  let attempts = 0;
  while (clusters.length < veg.clusterCount && attempts++ < 2200) {
    const x = (rng() * 2 - 1) * 430, z = (rng() * 2 - 1) * 430;
    if (!siteOk(x, z, 6)) continue;
    let far = true;
    for (const c of clusters) if (Math.hypot(x - c.x, z - c.z) < c.r + 26) { far = false; break; }
    if (!far) continue;
    const r = 16 + rng() * 26;
    const species = pickSpecies(veg.clusterMix, rng());
    // r5: ~1.7x trees per stand — designated forest strips must read DENSE
    // (closed canopy) next to WoT tree lines, not as loose orchards
    const n = 24 + (rng() * 34) | 0;
    let placed = 0;
    for (let i = 0; i < n * 3 && placed < n; i++) {
      const a = rng() * Math.PI * 2, rr = r * Math.sqrt(rng());
      const sp = rng() < 0.8 ? species : pickSpecies(veg.loneMix, rng());
      if (addTree(x + Math.cos(a) * rr, z + Math.sin(a) * rr, sp)) placed++;
    }
    if (placed > 2) clusters.push({ x, z, r });
  }
  for (let i = 0, placed = 0; i < 700 && placed < veg.loneCount; i++) { // lone trees + pairs
    const x = (rng() * 2 - 1) * 460, z = (rng() * 2 - 1) * 460;
    if (addTree(x, z, pickSpecies(veg.loneMix, rng()))) {
      placed++;
      if (rng() < 0.4) { // companion tree — lone lollipops read fake
        const a2 = rng() * Math.PI * 2, r2 = 4 + rng() * 7;
        if (addTree(x + Math.cos(a2) * r2, z + Math.sin(a2) * r2, pickSpecies(veg.loneMix, rng()))) placed++;
      }
    }
  }
  // horizon rim forest: dense clustered blocks on the raised map border so
  // distant ridgelines carry massed silhouettes instead of scattered lollipops
  for (let c = 0; c < veg.rimCount; c++) {
    const a = (c / Math.max(1, veg.rimCount)) * Math.PI * 2 + rng() * 0.11;
    const rad = 442 + rng() * 52;
    const cx = Math.cos(a) * rad, cz = Math.sin(a) * rad;
    if (Math.max(Math.abs(cx), Math.abs(cz)) > 502) continue;
    const species = pickSpecies(veg.rimMix, rng());
    // r7: denser, tighter rim blocks (12-26 over 56 m -> 18-36 over 46 m) —
    // the border ridge must read as a closed forested tree line bridging the
    // near field to the horizon ring, not scattered lollipop specks
    const n = 18 + (rng() * 18) | 0;
    for (let i = 0; i < n; i++) {
      const x = cx + (rng() - 0.5) * 46, z = cz + (rng() - 0.5) * 46;
      if (Math.max(Math.abs(x), Math.abs(z)) > 506) continue;
      pushTree(x, z, rng() < 0.85 ? species : pickSpecies(veg.rimMix, rng()), 1.5, 2.1, false);
    }
  }

  // near/far instanced meshes (partition rewritten on camera movement, hysteresis).
  // Each LOD is a trunk mesh (opaque bark) + a card mesh (alpha foliage) sharing
  // the same instance matrices.
  const _whiteScratch = new THREE.Color(1, 1, 1);
  function makeTreeMesh(geo, mat, sp, isFoliage) {
    // per-instance occlusion fade — EVERY geometry drawn with the tree hooks
    // must carry the attribute (near meshes are updated live; far meshes stay
    // zero — a tree within camera range is always in the near partition)
    if (!geo.getAttribute('aFadeI')) {
      const fadeAttr = new THREE.InstancedBufferAttribute(new Float32Array(trees.length), 1);
      fadeAttr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aFadeI', fadeAttr);
    }
    const m = new THREE.InstancedMesh(geo, mat, trees.length);
    // PERF (performance_budget r5): near/far partitions are rewritten while
    // the camera drives (repartitionTrees) — StaticDrawUsage instance buffers
    // sync-stall ANGLE-Metal on re-upload (see carpet note). Dynamic usage on
    // everything repartition touches.
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.setColorAt(0, _whiteScratch);
    m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = true;
    // cards do NOT receive shadows: per-card CSM self-shadowing turns half the
    // canopy pitch-black; the baked vertex-colour AO carries that job instead
    m.receiveShadow = !isFoliage;
    m.frustumCulled = false;
    m.count = 0;
    m.matrixAutoUpdate = false;
    if (isFoliage) {
      m.customDepthMaterial = foliageDepthMats[sp];
      // GTAO's override-material prepass ignores alphaTest — cards would
      // composite as huge dark floating quads over the canopy
      m.userData.aoExclude = true;
    }
    group.add(m);
    return m;
  }
  const nearMeshes = {}, farMeshes = {};
  // PERF NOTE (performance_budget r5): a cascade shadow-proxy LOD for the
  // near-tree canopy cards was prototyped here and MEASURED NET-NEGATIVE:
  // the cards' whole cascade share is only ~0.29 M tris/frame, while a
  // colorWrite-off proxy (three r185 has no shadow-only flag — an invisible
  // material skips the shadow pass too, verified) re-renders its geometry
  // into the main pass AND every cascade for +0.9 M (far-LOD lobes) or ~±0
  // (low-poly blobs, with a visible dappled->solid shadow change). The real
  // shadow-triangle mass is props/buildings (-0.66 M measured with props
  // castShadow off) — see docs/handoff/performance_budget-r5.md §3.
  for (const sp of speciesList) {
    nearMeshes[sp] = treeGeo[sp].map((g) => [
      makeTreeMesh(g.trunk, barkMat, sp, false),
      makeTreeMesh(g.cards, foliageMats[sp], sp, true),
    ]);
    // r7: far LOD is now a 2-variant array (silhouette variety at range)
    farMeshes[sp] = treeGeoFar[sp].map((g) => {
      const farCanopy = makeTreeMesh(g.canopy, canopyFarMat, sp, false);
      farCanopy.receiveShadow = false; // CSM self-shadow at range = black crowns
      const pair = [makeTreeMesh(g.trunk, barkMat, sp, false), farCanopy];
      // PERF (perf-budget r3): far-partition trees (beyond ~260 m) do NOT cast
      // shadows — a tree shadow out there is subpixel at 1080p (see lighting.js
      // far-cascade rationale) yet every lobe/trunk was re-rasterized by the
      // CSM cascade passes; with the density boost this alone was millions of
      // tris/frame of invisible shadow work.
      for (const m of pair) m.castShadow = false;
      return pair;
    });
  }

  // ---- tree root decals (r7) ---------------------------------------------
  // Terrain-conformed dark elliptical blend discs under every trunk: the
  // trunk-meets-ground contact was a hard unshaded seam and trees read as
  // pasted on. One merged static mesh, radial-gradient canvas texture,
  // polygon-offset over the terrain like the props.js building skirts.
  if (trees.length > 0) {
    const ds = 128;
    const dc = document.createElement('canvas');
    dc.width = dc.height = ds;
    const dctx = dc.getContext('2d');
    const dg = dctx.createRadialGradient(ds / 2, ds / 2, 0, ds / 2, ds / 2, ds / 2);
    dg.addColorStop(0, 'rgba(24,22,13,0.88)');
    dg.addColorStop(0.34, 'rgba(33,31,18,0.66)');
    dg.addColorStop(0.68, 'rgba(42,40,24,0.30)');
    dg.addColorStop(1, 'rgba(46,44,27,0)');
    dctx.fillStyle = dg;
    dctx.fillRect(0, 0, ds, ds);
    const decTex = new THREE.CanvasTexture(dc);
    decTex.colorSpace = THREE.SRGBColorSpace;
    const segs = 12, rings = [0.5, 1.0];
    const drng = mulberry32((seed ^ 0xdeca) >>> 0);
    const pos = [], uv2 = [], idx = [];
    let vb = 0;
    for (const t of trees) {
      const r = t.dr;
      pos.push(t.x, heightField.getHeightAt(t.x, t.z) + 0.05, t.z);
      uv2.push(0.5, 0.5);
      const a0 = drng() * Math.PI * 2;
      for (let ri = 0; ri < rings.length; ri++) {
        for (let k = 0; k < segs; k++) {
          const a = a0 + (k / segs) * Math.PI * 2;
          const rr = r * rings[ri] * (ri === 1 ? 0.85 + drng() * 0.3 : 1);
          const px = t.x + Math.cos(a) * rr, pz = t.z + Math.sin(a) * rr;
          pos.push(px, heightField.getHeightAt(px, pz) + 0.05, pz);
          uv2.push(0.5 + Math.cos(a) * 0.5 * rings[ri], 0.5 + Math.sin(a) * 0.5 * rings[ri]);
        }
      }
      for (let k = 0; k < segs; k++) idx.push(vb, vb + 1 + k, vb + 1 + ((k + 1) % segs));
      for (let k = 0; k < segs; k++) {
        const k1 = (k + 1) % segs;
        const a0i = vb + 1 + k, a1i = vb + 1 + k1;
        const b0i = vb + 1 + segs + k, b1i = vb + 1 + segs + k1;
        idx.push(a0i, b0i, a1i, a1i, b0i, b1i);
      }
      vb += 1 + segs * 2;
    }
    const dgeo = new THREE.BufferGeometry();
    dgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    dgeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv2), 2));
    dgeo.setIndex(idx);
    dgeo.computeVertexNormals();
    const dmat = new THREE.MeshStandardMaterial({
      map: decTex, transparent: true, depthWrite: false,
      roughness: 0.97, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    engineCtx.setupShadowMaterial(dmat);
    const dmesh = new THREE.Mesh(dgeo, dmat);
    dmesh.receiveShadow = true;
    dmesh.castShadow = false;
    dmesh.matrixAutoUpdate = false;
    dmesh.renderOrder = 1;
    dmesh.userData.aoExclude = true;
    group.add(dmesh);
  }

  // ---- bushes (hedgerow / field-edge cover, purely visual) ----
  {
    const bushPal = palOf(bushSpecies);
    const bushGeos = [buildBushCards(mulberry32(seed + 31), bushPal), buildBushCards(mulberry32(seed + 32), bushPal)];
    const bushPlacements = [[], []];
    function addBush(x, z) {
      if (Math.max(Math.abs(x), Math.abs(z)) > 470) return;
      if (rng() > veg.bushCount) return; // per-map density scale
      if (heightField._roadDist(x, z) < 6) return;
      if (heightField.getGroundType(x, z) === 'soft' || noVeg(x, z)) return;
      if (heightField.getNormalAt(x, z).y < 0.78) return;
      let clump = 1;
      if (veg.bushCount < 1) {
        // r6 two-scale clustering (matches makeTuft): biome moisture belts x
        // thicket cores — shrubs knot into dense washes/hollow thickets with
        // clean ground between, instead of the r5 near-uniform pepper noise
        const sb = sampleSplatNoise(x, z);
        const biome = smoothstepJs(0.42, 0.70, sb.n2);
        const thicket = smoothstepJs(0.44, 0.78, sb.n1);
        clump = biome * (0.12 + 0.88 * thicket);
        if (rng() > clump * 0.95 + 0.05) return;
      }
      const y = heightField.getHeightAt(x, z);
      // hull-height concealers: foliage reaches ~2.5-3 m so a parked tank is
      // genuinely occluded (knee-high shrubs sold zero visual concealment)
      // r5: size keyed to the clump core — 2-3x spread, big growth at centers
      const sc = (1.6 + rng() * 1.6) * (0.7 + clump * 0.45);
      _q.setFromAxisAngle(_up, rng() * Math.PI * 2);
      _m4.compose(_pv.set(x, y - 0.05, z), _q, _sv.set(sc, sc * (1.05 + rng() * 0.35), sc));
      bushPlacements[(rng() * 2) | 0].push(_m4.clone());
      concealers.push({ x, z, r: 2.0 * sc, add: 0.35 }); // SPOTTING WIRING: bush cover
    }
    for (const c of clusters) { // fringe bushes around each tree cluster
      const n = 5 + (rng() * 6) | 0;
      for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2, rr = c.r * (1.05 + rng() * 0.5);
        addBush(c.x + Math.cos(a) * rr, c.z + Math.sin(a) * rr);
      }
    }
    for (let i = 0; i < 470; i++) { // scattered field bushes, mild roadside bias
      const x = (rng() * 2 - 1) * 455, z = (rng() * 2 - 1) * 455;
      const rd = heightField._roadDist(x, z);
      if (rd > 26 && rng() > 0.55) continue;
      addBush(x, z);
    }
    // midfield concealment clumps: 4-6 bushes over a ~10-12 m spread so a
    // parked tank is at least half-occluded from ground level
    for (let c = 0; c < 58; c++) {
      const x = (rng() * 2 - 1) * 420, z = (rng() * 2 - 1) * 420;
      const n = 4 + (rng() * 3) | 0;
      for (let i = 0; i < n; i++) {
        addBush(x + (rng() - 0.5) * 11, z + (rng() - 0.5) * 11);
      }
    }
    for (let bv = 0; bv < 2; bv++) {
      if (bushPlacements[bv].length === 0) continue;
      // bushes share the hooked foliage material → need the fade attribute
      // too (all zeros: bushes are hull-height cover, never camera-occluders)
      bushGeos[bv].setAttribute('aFadeI',
        new THREE.InstancedBufferAttribute(new Float32Array(bushPlacements[bv].length), 1));
      const m = new THREE.InstancedMesh(bushGeos[bv], foliageMats[bushSpecies], bushPlacements[bv].length);
      for (let i = 0; i < bushPlacements[bv].length; i++) {
        m.setMatrixAt(i, bushPlacements[bv][i]);
        // darker, near-neutral multipliers: the old 0.8-1.1 range let lit
        // bushes glow saturated pure green against the graded terrain and
        // read as pasted-in — sit them INTO the field tone instead
        const bj = 0.52 + rng() * 0.34;
        _c.setRGB(bj * (0.94 + rng() * 0.14), bj * (0.98 + rng() * 0.14), bj * (0.90 + rng() * 0.16));
        m.setColorAt(i, _c);
      }
      m.castShadow = true;
      m.receiveShadow = false; // baked card AO, no per-card CSM self-shadow
      m.matrixAutoUpdate = false;
      m.customDepthMaterial = foliageDepthMats[bushSpecies];
      m.userData.aoExclude = true; // GTAO override prepass ignores alphaTest
      m.computeBoundingSphere();
      group.add(m);
    }
  }

  // ---- chase-camera foliage occlusion fade -------------------------------
  // WoT behavior: any tree standing between the camera and the player's tank
  // fades to near-transparency so the third-person loop stays readable on
  // forest routes. Each frame the pivot→camera segment is swept against every
  // near tree's canopy proxy sphere; intersecting trees ease toward fade = 1
  // (dithered to ~12% in the shader), everything else eases back to 0.
  const OCCL_TAU_S = 0.13;  // ease time constant (≈150 ms feel, like uSniperFade)
  // gameplay_feel r5: 1.1 → 2.6. The thin segment-vs-sphere test only faded
  // crowns whose proxy sphere the exact camera→pivot line pierced — driving a
  // forest corridor left mid-corridor crowns just off the line filling 60-90%
  // of the frame (drive_b_turn: tank fully hidden for seconds). The wider pad
  // turns the test into a fat occlusion capsule, WoT-style.
  const OCCL_PAD_M = 2.6;   // capsule radius pad around camera→pivot
  const OCCL_BOX_PAD = 14;  // XZ broadphase reject (max near-tree cr + pad)
  let occlAny = false;      // skip the sweep entirely once everything settled
  const _dirtyFadeAttrs = new Set();
  function writeTreeFade(t) {
    for (const m of nearMeshes[t.species][t.variant]) {
      const attr = m.geometry.attributes.aFadeI;
      attr.array[t.slot] = t.fade;
      // PERF (performance_budget r5): ranged upload — the full 20 KB fade
      // array re-upload was fence-stalling with the rest (see repartition).
      attr.addUpdateRange(t.slot, 1);
      _dirtyFadeAttrs.add(attr);
    }
  }
  function updateOcclusionFade(dt, camPos, focusPos) {
    const active = focusPos !== null && focusPos !== undefined;
    // gameplay_feel r2: feed the camera->tank sight capsule to the vertex
    // shader — the fade only dithers fragments near the sight line, so
    // canopy half-off the corridor stays solid against open sky.
    if (active) uFocusPos.value.copy(focusPos);
    else uFocusPos.value.set(0, -9999, 0); // corridor off
    if (!active && !occlAny) return;
    // dt = 0 (shot mode / deterministic captures) snaps: harness stays exact.
    const k = dt > 0 ? 1 - Math.exp(-dt / OCCL_TAU_S) : 1;
    let any = false;
    let ax = 0, ay = 0, az = 0, dx = 0, dy = 0, dz = 0, segLen2 = 0;
    let minX = 0, maxX = 0, minZ = 0, maxZ = 0;
    if (active) {
      ax = focusPos.x; ay = focusPos.y; az = focusPos.z;
      dx = camPos.x - ax; dy = camPos.y - ay; dz = camPos.z - az;
      segLen2 = dx * dx + dy * dy + dz * dz;
      minX = Math.min(ax, camPos.x) - OCCL_BOX_PAD;
      maxX = Math.max(ax, camPos.x) + OCCL_BOX_PAD;
      minZ = Math.min(az, camPos.z) - OCCL_BOX_PAD;
      maxZ = Math.max(az, camPos.z) + OCCL_BOX_PAD;
    }
    for (const t of trees) {
      let target = 0;
      if (active && t.near && t.x > minX && t.x < maxX && t.z > minZ && t.z < maxZ) {
        // closest point on the pivot→camera segment to the canopy center
        let s = segLen2 > 1e-6
          ? ((t.x - ax) * dx + (t.cy - ay) * dy + (t.z - az) * dz) / segLen2
          : 0;
        s = s < 0 ? 0 : (s > 1 ? 1 : s);
        const px = ax + dx * s - t.x;
        const py = ay + dy * s - t.cy;
        const pz = az + dz * s - t.z;
        const rr = t.cr + OCCL_PAD_M;
        if (px * px + py * py + pz * pz < rr * rr) target = 1;
      }
      if (t.fade !== target) {
        t.fade += (target - t.fade) * k;
        if (Math.abs(t.fade - target) < 0.02) t.fade = target;
        if (t.slot >= 0) writeTreeFade(t);
      }
      if (t.fade !== 0) any = true;
    }
    occlAny = any;
    if (_dirtyFadeAttrs.size > 0) {
      for (const attr of _dirtyFadeAttrs) attr.needsUpdate = true;
      _dirtyFadeAttrs.clear();
    }
  }

  const _lastCam = new THREE.Vector3(1e9, 0, 0);
  let _partitionBuilt = false;
  // hud_ui r6 (MAJOR): while scoped at high zoom, far-LOD billboard trees
  // inside the AIM CORRIDOR promote to full meshes — the x8 sight picture
  // magnified the cross-quad impostors on the target ridge into obvious
  // paper-cutout forests. Radius scales with zoom (capped at the 640 m max
  // engagement range); the corridor hugs the scope frustum, so the extra
  // full-detail trees stay in the low hundreds and only exist while scoped.
  let scopeZoomR = 0; // promotion radius in m (0 = arcade, no promotion)
  let scopeRepartitionPending = false;
  function scopePromoted(t, camPos) {
    if (scopeZoomR <= 0) return false;
    let fx = uCamFwd.value.x, fz = uCamFwd.value.z;
    const fl = Math.hypot(fx, fz) || 1;
    fx /= fl; fz /= fl;
    const dx = t.x - camPos.x, dz = t.z - camPos.z;
    const along = dx * fx + dz * fz;
    if (along < 0 || along > scopeZoomR) return false;
    // corridor half-width: x8 horizontal half-FOV (~0.107 rad) plus margin
    return Math.abs(dx * fz - dz * fx) < 24 + along * 0.14;
  }
  // PERF (performance_budget r5): repartition is now INCREMENTAL. The old
  // full rewrite flagged every near/far instance buffer for re-upload on any
  // camera step that moved one tree across the hysteresis band — with the
  // buffers allocated at trees.length capacity that was ~12 MB of
  // gl.bufferSubData per event, and on ANGLE's Metal backend each upload into
  // a buffer still referenced by in-flight GPU work is a fence wait (profiled
  // 22-224 ms — the certification p99/p1 killer). Now a crossing tree is
  // swap-removed from its old group and appended to its new one, and only the
  // two touched slots upload via addUpdateRange (tens of floats, no stall).
  const nearSlots = {}, farSlots = {};
  for (const sp of speciesList) {
    nearSlots[sp] = Array.from({ length: NEAR_VARIANTS }, () => []);
    farSlots[sp] = Array.from({ length: FAR_VARIANTS }, () => []);
  }
  /** Flag one instance slot's matrix/color/fade for a ranged GPU upload. */
  function markSlotDirty(m, slot) {
    m.instanceMatrix.addUpdateRange(slot * 16, 16);
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) {
      m.instanceColor.addUpdateRange(slot * 3, 3);
      m.instanceColor.needsUpdate = true;
    }
    const fa = m.geometry.attributes.aFadeI;
    if (fa) { fa.addUpdateRange(slot, 1); fa.needsUpdate = true; }
  }
  /** Write tree t into `slot` of every mesh in the group. Far groups render
   * fade 0 (opaque): occlusion fade only ever applies inside camera range. */
  function writeTreeSlot(meshes, slot, t, fade) {
    for (const m of meshes) {
      m.setMatrixAt(slot, t.mat);
      m.setColorAt(slot, t.tint);
      const fa = m.geometry.attributes.aFadeI;
      if (fa) fa.array[slot] = fade;
      markSlotDirty(m, slot);
    }
  }
  function removeFromGroup(meshes, slots, t, key, fade) {
    const i = t[key];
    const last = slots.pop();
    if (last !== t) {
      slots[i] = last;
      last[key] = i;
      writeTreeSlot(meshes, i, last, fade ? last.fade : 0);
    }
    t[key] = -1;
    for (const m of meshes) { m.count = slots.length; m.visible = slots.length > 0; }
  }
  function addToGroup(meshes, slots, t, key, fade) {
    const i = slots.length;
    slots.push(t);
    t[key] = i;
    writeTreeSlot(meshes, i, t, fade ? t.fade : 0);
    for (const m of meshes) { m.count = slots.length; m.visible = true; }
  }
  function repartitionTrees(camPos) {
    if (!_partitionBuilt) { rebuildPartitionFull(camPos); return; }
    for (const t of trees) {
      const d = Math.hypot(t.x - camPos.x, t.z - camPos.z);
      const promo = scopePromoted(t, camPos); // scope corridor mesh promotion
      if (t.near) {
        if (d > TREE_NEAR_OUT && !promo) {
          t.near = false;
          removeFromGroup(nearMeshes[t.species][t.variant], nearSlots[t.species][t.variant], t, 'slot', true);
          addToGroup(farMeshes[t.species][t.fv], farSlots[t.species][t.fv], t, 'fslot', false);
        }
      } else if (d < TREE_NEAR_IN || promo) {
        t.near = true;
        removeFromGroup(farMeshes[t.species][t.fv], farSlots[t.species][t.fv], t, 'fslot', false);
        addToGroup(nearMeshes[t.species][t.variant], nearSlots[t.species][t.variant], t, 'slot', true);
      }
    }
  }
  /** One-time full partition build (map load / world rebuild): plain full
   * uploads, and seeds the slot bookkeeping the incremental path maintains. */
  function rebuildPartitionFull(camPos) {
    _partitionBuilt = true;
    for (const sp of speciesList) {
      for (const a of nearSlots[sp]) a.length = 0;
      for (const a of farSlots[sp]) a.length = 0;
    }
    for (const t of trees) {
      const d = Math.hypot(t.x - camPos.x, t.z - camPos.z);
      t.near = d < TREE_NEAR_IN || (t.near && d <= TREE_NEAR_OUT) ||
        scopePromoted(t, camPos);
      if (t.near) {
        const slots = nearSlots[t.species][t.variant];
        t.slot = slots.length;
        t.fslot = -1;
        slots.push(t);
        for (const m of nearMeshes[t.species][t.variant]) {
          m.setMatrixAt(t.slot, t.mat);
          m.setColorAt(t.slot, t.tint);
          m.geometry.attributes.aFadeI.array[t.slot] = t.fade;
        }
      } else {
        const slots = farSlots[t.species][t.fv];
        t.fslot = slots.length;
        t.slot = -1;
        slots.push(t);
        for (const m of farMeshes[t.species][t.fv]) {
          m.setMatrixAt(t.fslot, t.mat);
          m.setColorAt(t.fslot, t.tint);
          const fa = m.geometry.attributes.aFadeI;
          if (fa) fa.array[t.fslot] = 0;
        }
      }
    }
    for (const sp of speciesList) {
      for (let vi = 0; vi < NEAR_VARIANTS; vi++) {
        for (const m of nearMeshes[sp][vi]) {
          m.count = nearSlots[sp][vi].length;
          m.instanceMatrix.clearUpdateRanges();
          m.instanceMatrix.needsUpdate = true;
          if (m.instanceColor) { m.instanceColor.clearUpdateRanges(); m.instanceColor.needsUpdate = true; }
          const fa = m.geometry.attributes.aFadeI;
          fa.clearUpdateRanges();
          fa.needsUpdate = true;
          m.visible = m.count > 0;
        }
      }
      for (let fi = 0; fi < FAR_VARIANTS; fi++) {
        for (const m of farMeshes[sp][fi]) {
          m.count = farSlots[sp][fi].length;
          m.instanceMatrix.clearUpdateRanges();
          m.instanceMatrix.needsUpdate = true;
          if (m.instanceColor) { m.instanceColor.clearUpdateRanges(); m.instanceColor.needsUpdate = true; }
          m.visible = m.count > 0;
        }
      }
    }
  }

  function update(dt, camPos, camFwd = null, focusPos = null) {
    uWindTime.value += dt;
    uCamPos.value.copy(camPos);
    if (camFwd) uCamFwd.value.copy(camFwd);
    uSniperFade.value += (sniperFadeTarget - uSniperFade.value) *
      (1 - Math.exp(-(dt || 0) / 0.08));
    for (const gc of grassChunks) {
      const d = Math.max(0, Math.hypot(camPos.x - gc.cx, camPos.z - gc.cz) - CHUNK_SIZE * 0.71);
      // continuous density rolloff (no stepped 1 -> 0.45 pop at 64 m);
      // eased 0.52 -> 0.36 (r5): the far half of the meadow kept its tufts
      let frac = d < GRASS_FADE_END ? 1 - 0.30 * smoothstepJs(62, 215, d) : 0;
      for (const cm of gc.meshes) {
        const count = Math.floor(cm.total * frac);
        cm.mesh.visible = count > 0;
        if (count > 0) cm.mesh.count = count;
      }
    }
    // PERF (performance_budget r5): stagger the two rebuild classes so a
    // carpet re-upload and a tree repartition never land on the same frame
    // (each is a multi-MB instance-buffer upload; pairing them doubled the
    // spike). Carpet additionally rate-limits on wall clock — at top speed the
    // 7 m trigger fired ~2x/s and each rebuild is the priciest upload we have.
    const nowMs = (typeof performance !== 'undefined' ? performance.now() : 0);
    let uploadedThisFrame = false;
    if (_carpetLast.distanceToSquared(camPos) > 49 && nowMs - _carpetLastMs > 180) {
      _carpetLast.copy(camPos);
      _carpetLastMs = nowMs;
      rebuildCarpet(camPos);
      uploadedThisFrame = true;
    }
    if (!uploadedThisFrame &&
        (_lastCam.distanceToSquared(camPos) > 9 || scopeRepartitionPending)) {
      scopeRepartitionPending = false;
      _lastCam.copy(camPos);
      repartitionTrees(camPos);
    }
    updateOcclusionFade(dt, camPos, focusPos);
  }

  function setWindTime(t) { uWindTime.value = t; }

  /**
   * Drive sniper near-grass suppression (0 = arcade, 1 = sniper). The value
   * eases in update(); pass `immediate` to snap (deterministic screenshots).
   * @param {number} f target fade 0..1
   * @param {boolean} [immediate=false] skip the ease
   * @param {number} [fovDeg] live camera FOV. While scoped at ≤15° (x4/x8)
   *   the corridor/bush fades switch from screen-door dither to a binary
   *   cut (uScopeHard) so the magnified picture carries no stipple.
   */
  function setSniperFade(f, immediate = false, fovDeg = null, aimDistM = null) {
    sniperFadeTarget = clamp(f, 0, 1);
    if (immediate) uSniperFade.value = sniperFadeTarget;
    if (sniperFadeTarget < 0.5) uScopeHard.value = 0;
    else if (fovDeg != null) uScopeHard.value = fovDeg <= 15 ? 1 : 0;
    // r5: scope-ray corridor reaches the aimed point (see uScopeDist). The
    // 70 m floor keeps the r4 near-field behavior when aiming at a close
    // wall; the 640 m cap covers the max fire range with margin.
    if (aimDistM != null) uScopeDist.value = clamp(Math.max(70, aimDistM - 4), 70, 640);
    // hud_ui r6: zoom-scaled impostor→mesh promotion radius (aim corridor)
    const wasR = scopeZoomR;
    scopeZoomR = (sniperFadeTarget >= 0.5 && fovDeg != null && fovDeg <= 15)
      ? Math.min(640, TREE_NEAR_IN * clamp(24 / fovDeg, 1, 2.5)) : 0;
    if (Math.abs(scopeZoomR - wasR) > 1) scopeRepartitionPending = true;
  }

  return { group, update, setWindTime, setSniperFade, treeObstacles, concealers, _clusters: clusters };
}
