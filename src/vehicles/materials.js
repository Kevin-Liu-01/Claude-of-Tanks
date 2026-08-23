// src/vehicles/materials.js — HD procedural camo + surface materials for tankFactory.
// Vehicles-internal (ARCHITECTURE §3.3.3). All albedo canvases are sRGB; every lit
// material passes through engineCtx.setupShadowMaterial.
// 2048px albedo with panel lines / weld seams / bolt rows / chips / rust streaks,
// plus a 1024px detail heightfield that generates matching normal + roughness maps.
// Expensive canvases are cached per spec id (shared between instances, refcounted).
// No top-level side effects — canvases are created inside createTankMaterials.

import * as THREE from 'three';
import {
  CAMO_PATTERN_IDS,
  CAMO_PATTERN_LABEL,
  CUSTOM_CAMO_ID,
  customCamoPatternId,
  factoryThemePatternId,
  isBuiltInCamoId,
  networkCamoId,
  normalizeCustomCamo,
  parseCustomCamoPatternId,
} from './camoPolicy.js';

export { CAMO_PATTERN_IDS, CAMO_PATTERN_LABEL, CUSTOM_CAMO_ID } from './camoPolicy.js';
import { tagVehicleMaterial } from './appearanceAudit.js';
import { drawNationalInsignia, drawTacticalNumber, vehicleMarkingRecord } from './vehicleMarkings.js';
import { isPostwarVehicleEra } from './taxonomy.js';
// MOBILE r1: central texture-resolution lever (quality.js). Every canvas bake
// below allocates through texSize(): desktop tiers get the authored size
// unchanged; the mobile tier halves it and clamps to the device texture cap.
// The painters are all canvas.width-relative, so this is a pure resolution
// change — identical feature plan, quarter the pixels at scale 0.5.
import { texSize } from '../engine/quality.js';

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
const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

function capCanvasLuma(ctx, size, maxLuma) {
  const image = ctx.getImageData(0, 0, size, size);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const pixelLuma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    if (pixelLuma > maxLuma) {
      const scale = maxLuma / pixelLuma;
      data[i] *= scale;
      data[i + 1] *= scale;
      data[i + 2] *= scale;
    }
  }
  ctx.putImageData(image, 0, 0);
}

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
// CAMO PATTERN SECTION (camo r2 edge treatment): `edgeNoise` (0..1, default
// OFF) subdivides each facet with normal-displaced midpoints — the
// camoPatchPath2D spray-boundary treatment — so SPRAYED consumers (desert
// patches, fleck dapples) stop reading as razor-cut vector stickers once a
// GLB atlas island magnifies the canvas (tank_models r7 lineage). MASKED
// hard-edge schemes (splinter, caunter, blocks, dazzle) keep the default 0:
// their ruler edges are the authentic language, and the rng draw order of
// every existing caller is untouched at 0.
function polyPath2D(rng, x, y, r, lobes = 6, jitter = 0.6, edgeNoise = 0) {
  const sx = 1.2 + rng() * 0.9;
  const p = new Path2D();
  const pts = [];
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 + (rng() - 0.5) * (Math.PI / lobes);
    const rr = r * (1 - jitter / 2 + rng() * jitter);
    pts.push([x + Math.cos(a) * rr * sx, y + Math.sin(a) * rr * 0.8]);
  }
  if (!edgeNoise) {
    for (let i = 0; i < lobes; i++) {
      if (i === 0) p.moveTo(pts[i][0], pts[i][1]); else p.lineTo(pts[i][0], pts[i][1]);
    }
    p.closePath();
    return p;
  }
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < lobes; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % lobes];
    const dx = x1 - x0, dy = y1 - y0;
    const elen = Math.hypot(dx, dy) || 1;
    const nx = -dy / elen, ny = dx / elen;
    const amp = Math.min(elen * 0.18, r * 0.22) * edgeNoise;
    for (const f of [0.3, 0.62]) {
      const j = (rng() - 0.5) * 2 * amp;
      p.lineTo(x0 + dx * f + nx * j, y0 + dy * f + ny * j);
    }
    p.lineTo(x1, y1);
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
function camoPatchPath2D(rng, x, y, r, ang, lobeNIn) {
  const p = new Path2D();
  // camo_spotting r3: callers may force the lobe count — the NATO scheme
  // chains 4-6 lobes into one long flowing band (island-blob critique).
  // When omitted the rng draw order is byte-identical to r2.
  const lobeN = lobeNIn || (2 + ((rng() * 3) | 0));
  const step = r * (0.85 + rng() * 0.5);
  let a = ang + (rng() - 0.5) * 0.2;
  let cx = x - Math.cos(a) * step * (lobeN - 1) * 0.5;
  let cy = y - Math.sin(a) * step * (lobeN - 1) * 0.5;
  for (let l = 0; l < lobeN; l++) {
    const lr = r * (0.55 + rng() * 0.55);
    const stretch = 1.5 + rng() * 0.9;           // per-lobe elongation
    const sides = 5 + ((rng() * 3) | 0);
    const cosA = Math.cos(a), sinA = Math.sin(a);
    const pts = [];
    for (let i = 0; i < sides; i++) {
      const t = (i / sides) * Math.PI * 2 + (rng() - 0.5) * (Math.PI / sides);
      let rr = lr * (0.6 + rng() * 0.6);
      if (rng() < 0.16) rr *= 0.5;               // concave notch facet
      const ex = Math.cos(t) * rr * stretch, ey = Math.sin(t) * rr * 0.8;
      pts.push([cx + ex * cosA - ey * sinA, cy + ex * sinA + ey * cosA]);
    }
    // tank_models r7 ("razor-edged geometric triangles that read as vector
    // shapes rather than sprayed paint" — T-80U/T-90A skirts): the straight
    // lineTo polygon sides survive every downstream blur once a GLB atlas
    // island magnifies the canvas. Each side is subdivided with normal-
    // displaced midpoints (~2-4 px noise at reference scale, scales with the
    // patch) so boundaries wander like spray, never ruler lines.
    p.moveTo(pts[0][0], pts[0][1]);
    for (let i = 0; i < sides; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % sides];
      const dx = x1 - x0, dy = y1 - y0;
      const elen = Math.hypot(dx, dy) || 1;
      const nx = -dy / elen, ny = dx / elen;     // edge normal
      const amp = Math.min(elen * 0.18, lr * 0.22);
      for (const f of [0.3, 0.62]) {
        const j = (rng() - 0.5) * 2 * amp;
        p.lineTo(x0 + dx * f + nx * j, y0 + dy * f + ny * j);
      }
      p.lineTo(x1, y1);
    }
    p.closePath();
    a += (rng() - 0.5) * 0.55;                   // spine wanders slightly
    cx += Math.cos(a) * step;
    cy += Math.sin(a) * step;
  }
  return p;
}

// Fill a Path2D 9 times (3x3 tile offsets) so the pattern wraps seamlessly.
function fillWrapped(ctx, S, path, style, fillRule) {
  ctx.fillStyle = style;
  for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
    ctx.save(); ctx.translate(dx, dy);
    // fillRule 'evenodd' lets brand marks keep punched-out counters (the
    // Claude Code glyph's eyes) — same-winding subpaths fill solid otherwise
    if (fillRule) ctx.fill(path, fillRule); else ctx.fill(path);
    ctx.restore();
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

// Official Claude Code pixel mark (24x24 viewBox, verbatim from the published
// icon) — the 'claude' house camo stamps it as a monogram. Two trailing
// subpaths are the punched-out eyes: fill with 'evenodd' or they close up.
export const CLAUDE_CODE_MARK =
  'M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9' +
  'V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949z' +
  'M6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z';

// Official Claude spark (24x24 viewBox, verbatim from the published icon) —
// the 'spark' camo scatters it from sprinkle to hero scale. One closed
// outline, plain nonzero fill.
export const CLAUDE_SPARK_MARK =
  'm4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.' +
  '6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4' +
  '797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.' +
  '0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714' +
  '-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925' +
  '.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.27' +
  '33-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.46' +
  '74-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018' +
  ' 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.70' +
  '6.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797' +
  '.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.' +
  '9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.12' +
  '93-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.' +
  '1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278' +
  '.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457' +
  '.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6' +
  '393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.80' +
  '92 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1' +
  '.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.607' +
  '1.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.6' +
  '74 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-' +
  '1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.967' +
  '2-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889' +
  ' 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1' +
  '.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z';

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
  // tank_models r3 (critic major: T-90M factory solid renders as "one flat
  // untextured green — plastic toy response, no roughness/weathering
  // variation"): SOLID schemes lean entirely on the two passes above, which
  // vanish under a bright key. Single-color vehicles get an extra patina
  // quilt — big soft fields of sun-faded and oil-darkened paint at low
  // contrast, the multi-tone base every real monotone tank carries.
  if ((visual.scheme || 'solid') === 'solid') {
    // Per-vehicle control for unusually clean factory finishes. Keep the
    // fleet default byte-for-byte at 1; T-72B3M uses a restrained value so
    // the warm garage key cannot turn the large procedural patina fields
    // into disconnected mint/light-olive armor islands.
    const solidWeatheringIntensity = Math.max(0,
      Math.min(1, visual.solidWeatheringIntensity ?? 1));
    for (let i = 0; i < 14; i++) {
      const x = rng() * S, y = rng() * S, r = S * (0.09 + rng() * 0.20);
      const warm = rng() < 0.5;
      // tank_models r7 ("pastel-flat" WWII solids): sun-fade blobs pulled
      // down — the bright [150,142,108] dust mix at 1.18x base was a big
      // slice of the minty lift on 4BO/olive hulls under the warm key.
      const tone = warm
        ? mix(scale3(base, 1.10), [126, 120, 94], 0.16)      // sun-faded, dust-warmed
        : scale3(mix(base, weather, 0.5), 0.84);             // oil/soot-deepened
      const p = blobPath2D(rng, x, y, r, 8, 0.5);
      ctx.filter = `blur(${(S * 0.004).toFixed(1)}px)`;
      fillWrapped(ctx, S, p, rgb(tone, 0.15 * solidWeatheringIntensity));
      ctx.filter = 'none';
    }
  }

  const scheme = visual.scheme || 'solid';
  // camo_spotting r2 (close-orbit edge critique): the r8 wide feather made
  // sprayed patches read hand-painted at ~5 m. Real spray has a HARD core
  // edge (1-2 px feather) with a separate faint overspray halo plus droplet
  // specks riding the border — shared by the 'stripes' and 'nato' schemes.
  // camo_spotting r3: `specks` optional — the 2px droplet dash blew up into
  // confetti-scale chips on GLB skirt UV islands (NATO topology critique);
  // the NATO/masked schemes now skip it while WW2 sprayed schemes keep it.
  const sprayEdge = (p, col, coreA, specks = true) => {
    ctx.filter = `blur(${(S * 0.0028).toFixed(1)}px)`;
    strokeWrapped(ctx, S, p, rgb(col, 0.18), S * 0.007);       // overspray halo
    ctx.filter = `blur(${Math.max(1, S * 0.0006).toFixed(1)}px)`;
    fillWrapped(ctx, S, p, rgb(col, coreA));                   // hard core, ~1.5px feather
    ctx.filter = 'none';
    if (!specks) return;
    ctx.setLineDash([2, 9 + rng() * 8]);                       // droplet specks on the border
    strokeWrapped(ctx, S, p, rgb(col, 0.5), 2.2);
    ctx.setLineDash([]);
  };
  if (scheme === 'drawn' && patches.length) {
    // Device-local vector tile authored in the Garage. The drawing is baked
    // once with the rest of the material, so custom paint adds no draw calls,
    // runtime canvases, or per-frame work.
    const repeatX = Math.max(1, Math.min(8, visual.drawRepeatX || 1));
    const repeatY = Math.max(1, Math.min(8, visual.drawRepeatY || 1));
    const cellW = S / repeatX;
    const cellH = S / repeatY;
    const angle = (visual.drawRotation || 0) * Math.PI / 180;
    const strokes = visual.drawStrokes || [];
    for (let gy = -1; gy <= repeatY; gy++) {
      for (let gx = -1; gx <= repeatX; gx++) {
        ctx.save();
        ctx.translate((gx + 0.5) * cellW, (gy + 0.5) * cellH);
        ctx.rotate(angle);
        if (visual.drawMirror && ((gx + gy) & 1)) ctx.scale(-1, 1);
        ctx.translate(-cellW / 2, -cellH / 2);
        for (const stroke of strokes) {
          const points = stroke.points || [];
          if (!points.length) continue;
          ctx.strokeStyle = rgb(patches[stroke.color === 1 ? 1 : 0] || patches[0], 0.97);
          ctx.fillStyle = ctx.strokeStyle;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.lineWidth = Math.max(1, (stroke.size || 8) / 100 * Math.min(cellW, cellH));
          if (points.length === 1) {
            ctx.beginPath();
            ctx.arc(points[0][0] / 100 * cellW, points[0][1] / 100 * cellH,
              ctx.lineWidth / 2, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.moveTo(points[0][0] / 100 * cellW, points[0][1] / 100 * cellH);
            for (let i = 1; i < points.length; i++) {
              ctx.lineTo(points[i][0] / 100 * cellW, points[i][1] / 100 * cellH);
            }
            ctx.stroke();
          }
        }
        ctx.restore();
      }
    }
  } else if (scheme === 'stripes' && patches.length) {
    // tank_models r5 REWRITE ("2-tone tan/brown leopard spots instead of the
    // roster Dunkelgelb + olive-green + red-brown soft-edge stripes"): the
    // 1943 factory scheme is BROAD sprayed BANDS — 20-40 cm wide sweeping
    // strokes of Olivgruen AND Rotbraun over Dunkelgelb, soft sprayed edges,
    // one dominant diagonal per vehicle, branching once or twice. No discrete
    // patch stamps at all: the small angular patches + thin streaks are what
    // read as leopard spots at closeup.
    const bandAng = visual.bandAngle != null
      ? visual.bandAngle + (rng() - 0.5) * 0.24          // pinned (naval waves)
      : 0.85 + rng() * 0.55;                             // one direction per tank
    const band = (col, w, len, alpha) => {
      const x0 = rng() * S, y0 = rng() * S;
      const ang = bandAng + (rng() - 0.5) * 0.30;
      const bend = (rng() - 0.5) * w * 2.2;
      const mx = x0 + Math.cos(ang) * len * 0.5 - Math.sin(ang) * bend;
      const my = y0 + Math.sin(ang) * len * 0.5 + Math.cos(ang) * bend;
      const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
      const path = new Path2D();
      path.moveTo(x0, y0);
      path.quadraticCurveTo(mx, my, x1, y1);
      // soft sprayed edge: wide low-alpha overspray flank + blurred core
      ctx.filter = `blur(${(S * 0.006).toFixed(1)}px)`;
      strokeWrapped(ctx, S, path, rgb(col, 0.20), w * 1.45);
      ctx.filter = `blur(${(S * 0.0032).toFixed(1)}px)`;
      strokeWrapped(ctx, S, path, rgb(col, alpha), w);
      ctx.filter = 'none';
      return { x0, y0, x1, y1, ang };
    };
    // main broad bands: alternate the two patch tones so BOTH read (the old
    // painter's green mixed 24% toward dunkelgelb and vanished — 2-tone read)
    // camo r8: visual.bandAngle (palette knob) pins the band direction — the
    // 'naval' pattern runs its wave bands HORIZONTAL. rng draw order is
    // identical in both arms, so authored schemes stay byte-stable.
    const nB = Math.max(4, Math.round(5 * nK));
    for (let i = 0; i < nB; i++) {
      const col = mix(patches[i % patches.length], base, 0.10);
      const w = S * wk * (0.085 + rng() * 0.075);        // ~0.15-0.27 m wide
      const len = S * wk * (0.65 + rng() * 0.5);
      const b = band(col, w, len, 0.80);
      // occasional branch fork off the main band
      if (rng() < 0.6) {
        const col2 = mix(patches[(i + 1) % patches.length], base, 0.10);
        const bl = len * (0.35 + rng() * 0.25);
        const ba = b.ang + (rng() < 0.5 ? 0.7 : -0.7) + (rng() - 0.5) * 0.3;
        const px2 = b.x0 + Math.cos(b.ang) * len * (0.3 + rng() * 0.4);
        const py2 = b.y0 + Math.sin(b.ang) * len * (0.3 + rng() * 0.4);
        const path = new Path2D();
        path.moveTo(px2, py2);
        path.lineTo(px2 + Math.cos(ba) * bl, py2 + Math.sin(ba) * bl);
        ctx.filter = `blur(${(S * 0.005).toFixed(1)}px)`;
        strokeWrapped(ctx, S, path, rgb(col2, 0.62), S * wk * (0.06 + rng() * 0.05));
        ctx.filter = 'none';
      }
    }
    // a few narrower connector strokes keep the field from reading as bars
    for (let i = 0; i < Math.round(4 * nK); i++) {
      const col = mix(patches[i % patches.length], base, 0.14);
      band(col, S * wk * (0.038 + rng() * 0.03), S * wk * (0.35 + rng() * 0.3), 0.66);
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
    // camo_spotting r3 (critic: "patch topology reads island-blob ... real
    // NATO 3-color flows in connected anchor-point bands"): brown is now FEW
    // LONG bands — 4-6 chained lobes each, spanning a third to half the tile
    // — and ~40% of bands ANCHOR their start on a previous band's spine so
    // the field connects into the flowing anchor-point network of the real
    // scheme instead of scattered same-size islands. Black rides the brown
    // boundaries as elongated shadow bars (never free confetti chips), and
    // the droplet-speck dash is off for both (confetti on skirt UV islands).
    // camo_spotting r6: `pk`/`blackK` (visual.patchK / visual.blackK, both
    // default 1 — rng draw order untouched at 1) let the GLB atlas path
    // rescale the scheme where its UV world density differs from the boxUV
    // reference: the m1a2's summer patches grow ~14% and the black shadow
    // bars gain weight ("two greens read monotone olive at mid distance,
    // black underweighted" critique) while the Tiger's boxUV summer — which
    // already reads — stays byte-identical.
    const pk = visual.patchK || 1;
    const black = patches[0], brown = patches[1] || patches[0];
    const dirA = rng() * Math.PI;
    const centers = [];
    const nBrown = Math.max(4, Math.round(6 * nK / pk));
    for (let i = 0; i < nBrown; i++) {
      const r = S * wk * pk * (i < nBrown * 0.4 ? 0.082 + rng() * 0.046 : 0.052 + rng() * 0.034);
      let x = rng() * S, y = rng() * S;
      if (i > 0 && rng() < 0.4) {                // anchor on an earlier band
        const c2 = centers[(rng() * centers.length) | 0];
        x = c2[0] + (rng() - 0.5) * c2[2] * 2.4;
        y = c2[1] + (rng() - 0.5) * c2[2] * 1.8;
      }
      const lobes = 4 + ((rng() * 3) | 0);       // 4-6 lobes = one long band
      const p = camoPatchPath2D(rng, x, y, r, dirA + (rng() - 0.5) * 0.55, lobes);
      sprayEdge(p, brown, 0.97, false);          // hard core, no confetti dash
      centers.push([x, y, r]);
    }
    const nBlack = Math.max(3, Math.round(4 * nK * (visual.blackK || 1) / pk));
    for (let i = 0; i < nBlack; i++) {
      const r = S * wk * pk * (i < nBlack * 0.4 ? 0.050 + rng() * 0.026 : 0.040 + rng() * 0.020);
      let x = rng() * S, y = rng() * S;
      if (centers.length && rng() < 0.75) {      // ride a brown band boundary
        const c2 = centers[(rng() * centers.length) | 0];
        const a2 = rng() * Math.PI * 2;
        x = c2[0] + Math.cos(a2) * c2[2] * 1.15;
        y = c2[1] + Math.sin(a2) * c2[2] * 0.85;
      }
      const lobes = 3 + ((rng() * 2) | 0);       // elongated shadow bars
      const p = camoPatchPath2D(rng, x, y, r, dirA + (rng() - 0.5) * 0.7, lobes);
      sprayEdge(p, black, 0.95, false);
    }
  } else if (scheme === 'desert' && patches.length) {
    // Desert: hard-edged multi-scale 3-tone geometry — broad low-contrast
    // diagonal wind bands under angular polygon patches at three scales plus
    // thin dark streaks. Replaces the r1 same-size-ellipse "cheetah print".
    // camo_spotting r6: `pk` (visual.patchK, default 1 — rng draw order is
    // untouched at 1) rescales the patch geometry for consumers whose UV
    // world density differs from the boxUV reference: the GLB atlas path
    // shrinks the big modern hulls' blobs ~30% (m1a2 "dazzle/giraffe patches
    // at large scale" critique) while counts scale 1/pk so overall coverage
    // eases down with the size rather than ballooning.
    const pk = visual.patchK || 1;
    const dark = patches[0], mid2 = patches[1] || patches[0];
    const pale = patches[2] || mix(base, [255, 250, 235], 0.35);
    for (let i = 0; i < 5; i++) {                                 // band layer
      const y0 = rng() * S, slope = (rng() - 0.5) * 0.6;
      const w = S * wk * pk * (0.10 + rng() * 0.10);
      const path = new Path2D();
      path.moveTo(-S * 0.1, y0);
      path.quadraticCurveTo(S * 0.5, y0 + slope * S * 0.5 + (rng() - 0.5) * S * 0.09,
        S * 1.1, y0 + slope * S);
      strokeWrapped(ctx, S, path, rgb(mix(rng() < 0.5 ? mid2 : pale, base, 0.45), 0.30), w);
    }
    // Large patches near-opaque at three scales. History: r6 pushed contrast
    // here (darkHC 0.74x, paleHC white lift) so the geometry survived mipping
    // at garage distance — but stacked on the widened r9 palette that became
    // the m1a2 "near-white cream blobs vs mid-brown dazzle" (camo_spotting r6
    // critique). The authored palette now carries the whole ladder: darkHC/
    // paleHC are the palette stops themselves, and the low-contrast read is
    // the point (real Sinai-family schemes are subtle).
    const darkHC = dark;
    const paleHC = pale;
    // patch geometry rides wk/nK so the 3-tone shapes stay hull-scale on
    // every tank (r7: on the T-34 the tile spans ~3 m and single patches
    // swallowed the whole flank -> flat tan wash)
    // camo r2 edge treatment: the large/mid desert patches are SPRAYED, not
    // masked — polyPath2D edgeNoise wanders their facets ~2-4 px like the
    // camoPatchPath2D boundaries, so magnified GLB atlas islands stop
    // rendering them as razor-cut vector shards (tank_models r7 lineage).
    const nBig = Math.round(4 * nK / pk);
    for (let i = 0; i < nBig; i++) {                              // large angular patches
      const r = S * wk * pk * (0.16 + rng() * 0.10);
      const x = rng() * S, y = rng() * S;
      const col = i % 2 ? mid2 : darkHC;
      fillWrapped(ctx, S, polyPath2D(rng, x, y, r * 1.04, 7, 0.55, 0.8), rgb(mix(col, base, 0.5), 0.5));
      fillWrapped(ctx, S, polyPath2D(rng, x, y, r, 7, 0.55, 0.8), rgb(col, 0.96));
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
    for (let i = 0; i < Math.max(2, Math.round(2.5 * nK / pk)); i++) { // pale bands
      const r = S * wk * pk * (0.085 + rng() * 0.07);
      const x = rng() * S, y = rng() * S;
      const p = camoPatchPath2D(rng, x, y, r, dirD + (rng() - 0.5) * 0.4);
      strokeWrapped(ctx, S, p, rgb(mix(paleHC, base, 0.45), 0.4), S * 0.006);
      fillWrapped(ctx, S, p, rgb(paleHC, 0.93));
      paleBands.push([x, y, r]);
    }
    for (let i = 0; i < Math.round(6 * nK / pk); i++) {           // mid shards (dark/mid only)
      const r = S * wk * pk * (0.045 + rng() * 0.075);
      const col = rng() < 0.5 ? darkHC : mid2;
      fillWrapped(ctx, S, polyPath2D(rng, rng() * S, rng() * S, r, 5, 0.7, 0.8), rgb(col, 0.94));
    }
    for (const [bx, by, br] of paleBands) {                       // clustered flecks
      const n = 4 + ((rng() * 5) | 0);
      for (let i = 0; i < n; i++) {
        const a3 = rng() * Math.PI * 2;
        const d3 = br * (0.9 + rng() * 1.5);
        const x = bx + Math.cos(a3) * d3, y = by + Math.sin(a3) * d3 * 0.7;
        const r = S * wk * pk * (0.010 + rng() * rng() * 0.040);  // ~3-5x size spread
        fillWrapped(ctx, S, polyPath2D(rng, x, y, r, 4, 0.8, 0.6),
          rgb(rng() < 0.45 ? darkHC : paleHC, 0.85));
      }
    }
    for (let i = 0; i < Math.round(14 * nK / pk); i++) {          // thin streaks
      const x0 = rng() * S, y0 = rng() * S, len = S * wk * pk * (0.05 + rng() * 0.1);
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
    // r3: stroke count 74 -> 92 — pairs with the show-through cut below so
    // whitewash coverage rises toward the real ~80% wash (the luma ceiling
    // at the end of this scheme still caps the brightest texels).
    // camo_spotting r5: stroke tones cooled with the palette — the old
    // (214,217,207)/(226,228,219) brushwork carried the same warm bias the
    // base did and fed the cream/tan read under the garage key.
    for (let i = 0; i < 92; i++) {
      const x0 = rng() * S, y0 = rng() * S;
      const len = S * (0.08 + rng() * 0.2);
      const w = S * (0.012 + rng() * 0.03);
      const path = new Path2D();
      path.moveTo(x0, y0);
      path.quadraticCurveTo(x0 + (rng() - 0.5) * w * 3, y0 + len * 0.5, x0 + (rng() - 0.5) * w * 4, y0 + len);
      strokeWrapped(ctx, S, path, 'rgba(207,214,217,0.16)', w * 1.5);
      strokeWrapped(ctx, S, path, 'rgba(219,226,229,0.20)', w);
    }
    // worn-through patches revealing the base vehicle paint (heavier at r8 —
    // the wash needs visible green bones to avoid the white-mass read).
    // camo_spotting r3 (critic: "M1A2 winter retains ~40% green blotch share
    // on upward-facing deck surfaces — roof reads green-spotted rather than
    // whitewashed"): show-through cut from 52 large strong blobs to 30
    // smaller, more translucent ones (~15-20% coverage); the green bones now
    // lean on the streaking passes below, which read as brushed wear rather
    // than spotting. Coverage is texture-global (boxUV has no up-facing
    // knowledge), so decks and flanks whiten together.
    for (let i = 0; i < 30; i++) {
      const r = S * (0.010 + rng() * 0.032);
      const p = blobPath2D(rng, rng() * S, rng() * S, r);
      fillWrapped(ctx, S, p, rgb(under, 0.20 + rng() * 0.28));
    }
    // grey streaking down the plates (rain-washed whitewash) — r5: cooled
    for (let i = 0; i < 70; i++) {
      const x0 = rng() * S, y0 = rng() * S, len = S * (0.05 + rng() * 0.14);
      const path = new Path2D();
      path.moveTo(x0, y0);
      path.lineTo(x0 + (rng() - 0.5) * 6, y0 + len);
      strokeWrapped(ctx, S, path, `rgba(111,119,123,${0.10 + rng() * 0.12})`, 1.5 + rng() * 4);
    }
    // dust-ochre grime — camo_spotting r2: the mix is now dominated by a
    // FIXED ochre so the pass reads on every hull. Keyed 50% to `under`, a
    // green factory coat (T-34) produced greenish-dark grime that vanished
    // at 0.10 alpha while the Tiger's Dunkelgelb flared warm — same pattern
    // id, one tank grimy, one plastic-clean (r1 winter critique).
    // camo_spotting r5 (winter-reads-tan MAJOR): the ochre [118,98,62] at
    // 0.14-0.27 alpha x30 blobs was the single biggest warm contributor —
    // grime drops to a muted cold-brown, thinner and sparser; the missing
    // wear mass moves to the cold-grey metal streaking pass below so wear
    // reads as whitewash scrubbed off steel, not tan paint.
    const grime = mix(under, [106, 96, 74], 0.72);
    for (let i = 0; i < 20; i++) {
      const x = rng() * S, y = rng() * S, r = S * (0.03 + rng() * 0.08);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgb(grime, 0.09 + rng() * 0.09));
      g.addColorStop(1, rgb(grime, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // worn-bleed streaking (r2, all hulls): grime-grey runs dragged down the
    // plates — the Tiger carried this read via its warm feature weeps while
    // green-based hulls stayed toy-clean; now it is part of the scheme.
    for (let i = 0; i < 40; i++) {
      const x0 = rng() * S, y0 = rng() * S, len = S * (0.04 + rng() * 0.12);
      const tone = rng() < 0.4 ? grime : mix(under, [98, 105, 108], 0.55);
      const path = new Path2D();
      path.moveTo(x0, y0);
      path.lineTo(x0 + (rng() - 0.5) * 5, y0 + len);
      strokeWrapped(ctx, S, path, rgb(tone, 0.10 + rng() * 0.14), 2 + rng() * 5);
    }
    // cold-grey metal wear (camo_spotting r5): whitewash is a chalk layer
    // over dark STEEL — scrub streaks and edge rubs read blue-grey, never
    // ochre. Dragged steel-grey runs + short cold dashes give the wash the
    // worn-over-metal read the critic asked for.
    for (let i = 0; i < 30; i++) {
      const x0 = rng() * S, y0 = rng() * S, len = S * (0.05 + rng() * 0.13);
      const path = new Path2D();
      path.moveTo(x0, y0);
      path.lineTo(x0 + (rng() - 0.5) * 5, y0 + len);
      strokeWrapped(ctx, S, path, `rgba(88,96,102,${0.09 + rng() * 0.11})`, 1.5 + rng() * 3.5);
    }
    for (let i = 0; i < 26; i++) {
      const x0 = rng() * S, y0 = rng() * S, len = S * (0.015 + rng() * 0.035);
      const a2 = rng() * Math.PI;
      const path = new Path2D();
      path.moveTo(x0, y0);
      path.lineTo(x0 + Math.cos(a2) * len, y0 + Math.sin(a2) * len * 0.4);
      strokeWrapped(ctx, S, path, `rgba(96,104,110,${0.12 + rng() * 0.12})`, 1.2 + rng() * 2.4);
    }
    // neutral shadow washes so the wash never reads as flat white (r5: cooled)
    for (let i = 0; i < 18; i++) {
      const x = rng() * S, y = rng() * S, r = S * (0.05 + rng() * 0.12);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(99,106,110,0.13)');
      g.addColorStop(1, 'rgba(99,106,110,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // r2 unification luma ceiling (same treatment as 'fleck'): the tonal /
    // mottle lifts pushed bright texels ~7% over the authored whitewash band
    // ('#99a1a2' since the r5 cooling), which the warm garage key then blew
    // into cream — no texel may exceed the authored base luma +4%.
    capCanvasLuma(ctx, S, luma(base) * 1.04);
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
          // camo r2 edge treatment: dapples are sprayed dabs — edge noise
          // keeps them ragged at closeup instead of vector-crisp (the lone
          // fine-grain flecks below stay plain: at 5-11 px the noise is
          // sub-texel and only costs rng draws)
          fillWrapped(ctx, S, polyPath2D(rng, x, y, r, 6, 0.75, 0.7), rgb(col, 0.92));
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
    capCanvasLuma(ctx, S, Math.max(luma(base), luma(weather)) * 1.04);
    // ===================== END CAMO PATTERN SECTION =================
  } else if (scheme === 'digital' && patches.length) {
    // ===================== CAMO PATTERN SECTION =====================
    // TWO-SCALE digital (camo_spotting r5). The old painter was a single
    // 16x16 lattice of small rect clusters — at garage range it covered the
    // hull as uniform micro pixel noise ("wallpapered TV static", critic
    // r5): no macro structure, so it read as a printed fabric, not a
    // vehicle scheme. Real digital camo is LARGE organic patches whose
    // EDGES resolve into pixel steps. Rebuilt exactly that way:
    //   1. MACRO: 3-4 elongated multi-lobe patches per tone (hull-scale,
    //      the same organic language the NATO painter uses) are laid out as
    //      Path2D shapes...
    //   2. ...then RASTERIZED onto the pixel grid: each grid cell samples
    //      the path with a jittered point, so patch interiors fill as solid
    //      color masses while the boundary staircases into ragged 1-cell
    //      steps (the jitter is the quantization dither).
    //   3. FINE octave: a sparse sprinkle of lone pixels between patches
    //      keeps the field from reading as clean vector blobs.
    // Pixel pitch is ~2x the old cell (48/64 vs 96/128 cells per tile) so
    // the steps survive mipping at pedestal distance. Cell math: one repeat
    // tile spans 1/camoScale meters; cells scale with wk to hold world size
    // across tanks, and digitalCellK (palette knob) still scales the pitch.
    const cellK = Math.max(1, visual.digitalCellK || 1);
    const cells = Math.max(Math.round(48 / cellK),
      Math.round(64 / (Math.max(wk, 0.5) * cellK)));
    const cell = S / cells;
    // Macro-patch builder: the same elongated multi-lobe language as
    // camoPatchPath2D, but with the vertices tracked so the rasterizer gets
    // an EXACT bbox (the shared helper's lobes can wander ~5r from the
    // anchor — a guessed box either clips lobes or scans half the tile).
    const mkPatch = () => {
      const lobeN = 2 + ((rng() * 3) | 0);
      const r0 = S * wk * (0.10 + rng() * 0.09);
      const step = r0 * (0.85 + rng() * 0.5);
      let a = rng() * Math.PI;
      let cx2 = rng() * S - Math.cos(a) * step * (lobeN - 1) * 0.5;
      let cy2 = rng() * S - Math.sin(a) * step * (lobeN - 1) * 0.5;
      const path = new Path2D();
      let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
      for (let l = 0; l < lobeN; l++) {
        const lr = r0 * (0.55 + rng() * 0.55);
        const stretch = 1.5 + rng() * 0.9;
        const sides = 5 + ((rng() * 3) | 0);
        const cosA = Math.cos(a), sinA = Math.sin(a);
        for (let i = 0; i < sides; i++) {
          const t = (i / sides) * Math.PI * 2 + (rng() - 0.5) * (Math.PI / sides);
          let rr = lr * (0.6 + rng() * 0.6);
          if (rng() < 0.16) rr *= 0.5;               // concave notch facet
          const ex = Math.cos(t) * rr * stretch, ey = Math.sin(t) * rr * 0.8;
          const px = cx2 + ex * cosA - ey * sinA;
          const py = cy2 + ex * sinA + ey * cosA;
          if (i === 0) path.moveTo(px, py); else path.lineTo(px, py);
          if (px < mnx) mnx = px;
          if (px > mxx) mxx = px;
          if (py < mny) mny = py;
          if (py > mxy) mxy = py;
        }
        path.closePath();
        a += (rng() - 0.5) * 0.55;                   // spine wanders slightly
        cx2 += Math.cos(a) * step;
        cy2 += Math.sin(a) * step;
      }
      return { path, mnx, mny, mxx, mxy };
    };
    for (let pi = 0; pi < patches.length; pi++) {
      const col = patches[pi];
      ctx.fillStyle = rgb(col, 0.94);
      const nP = 3 + (rng() < 0.5 ? 1 : 0);
      for (let p = 0; p < nP; p++) {
        const pt = mkPatch();
        // rasterize onto the cell grid; grid coords may run past the tile
        // edge — the fill position wraps them back in, which is exactly the
        // 3x3 seamless-tiling contract the vector painters get from
        // fillWrapped.
        const cx0 = Math.floor(pt.mnx / cell), cx1 = Math.ceil(pt.mxx / cell);
        const cy0 = Math.floor(pt.mny / cell), cy1 = Math.ceil(pt.mxy / cell);
        for (let gy = cy0; gy <= cy1; gy++) {
          for (let gx = cx0; gx <= cx1; gx++) {
            const sx2 = (gx + 0.5) * cell + (rng() - 0.5) * cell * 0.9;
            const sy2 = (gy + 0.5) * cell + (rng() - 0.5) * cell * 0.9;
            if (!ctx.isPointInPath(pt.path, sx2, sy2)) continue;
            const qx = (((gx % cells) + cells) % cells) * cell;
            const qy = (((gy % cells) + cells) % cells) * cell;
            ctx.fillRect(qx, qy, cell + 0.5, cell + 0.5);
          }
        }
      }
    }
    // fine-grain octave: sparse cell noise between the macro patches.
    // camo r2 (starter pattern-quality): ~half the budget now lands as short
    // 2-4 cell RUNS with an occasional perpendicular kink (the L/I dither
    // strokes real pixel schemes quantize into) instead of pure lone pixels —
    // uniform singles read as sensor noise at closeup while runs read as
    // deliberate quantization. Total cell budget unchanged (~170/cellK).
    {
      let budget = Math.round(170 / cellK);
      while (budget > 0) {
        const col = patches[(rng() * patches.length) | 0];
        ctx.fillStyle = rgb(col, 0.85);
        let gx = (rng() * cells) | 0, gy = (rng() * cells) | 0;
        const run = rng() < 0.5 ? 1 : 2 + ((rng() * 3) | 0);
        const horiz = rng() < 0.5;
        for (let k2 = 0; k2 < run && budget > 0; k2++, budget--) {
          const qx = (((gx % cells) + cells) % cells) * cell;
          const qy = (((gy % cells) + cells) % cells) * cell;
          ctx.fillRect(qx, qy, cell + 0.5, cell + 0.5);
          if (horiz) gx++; else gy++;
          if (run > 1 && rng() < 0.3) {            // perpendicular kink
            if (horiz) gy += rng() < 0.5 ? 1 : -1; else gx += rng() < 0.5 ? 1 : -1;
          }
        }
      }
    }
    // ===================== END CAMO PATTERN SECTION =================
  } else if (scheme === 'merdc' && patches.length) {
    // ===================== CAMO PATTERN SECTION =====================
    // MERDC (US 4-color, camo r8): TWO DOMINANT tones split the hull in
    // large flowing multi-lobe fields (base carries one, patches[0] the
    // other at ~40-45%), while the two ACCENT tones — sand + black, ~5%
    // each — ride the dominant-field boundaries as narrow elongated bars.
    // Same camoPatchPath2D band language as 'nato' (it IS the same family)
    // but with a LIGHT second dominant instead of dark chips, so the two
    // schemes never read as one another at range: nato = dark chips on
    // green, MERDC = interlocking light/dark green fields.
    const pk = visual.patchK || 1;
    const dom = patches[0];
    const sand = patches[1] || mix(base, [220, 205, 160], 0.5);
    const black = patches[2] || [43, 43, 40];
    const dirA = rng() * Math.PI;
    const fields = [];
    const nF = Math.max(3, Math.round(5 * nK / pk));
    for (let i = 0; i < nF; i++) {
      const r = S * wk * pk * (i < nF * 0.4 ? 0.105 + rng() * 0.055 : 0.065 + rng() * 0.04);
      let x = rng() * S, y = rng() * S;
      if (i > 0 && rng() < 0.45) {               // chain onto an earlier field
        const c2 = fields[(rng() * fields.length) | 0];
        x = c2[0] + (rng() - 0.5) * c2[2] * 2.6;
        y = c2[1] + (rng() - 0.5) * c2[2] * 2.0;
      }
      const p = camoPatchPath2D(rng, x, y, r, dirA + (rng() - 0.5) * 0.5, 4 + ((rng() * 3) | 0));
      sprayEdge(p, dom, 0.95, false);
      fields.push([x, y, r]);
    }
    // sand: few narrow winding bands bridging the field boundaries
    for (let i = 0; i < Math.max(2, Math.round(3 * nK / pk)); i++) {
      const r = S * wk * pk * (0.034 + rng() * 0.022);
      let x = rng() * S, y = rng() * S;
      if (fields.length && rng() < 0.7) {
        const c2 = fields[(rng() * fields.length) | 0];
        const a2 = rng() * Math.PI * 2;
        x = c2[0] + Math.cos(a2) * c2[2] * 1.2;
        y = c2[1] + Math.sin(a2) * c2[2] * 0.9;
      }
      const p = camoPatchPath2D(rng, x, y, r, dirA + (rng() - 0.5) * 0.6, 4 + ((rng() * 2) | 0));
      sprayEdge(p, sand, 0.92, false);
    }
    // black: thin elongated shadow bars anchored on field boundaries (the
    // nato scheme's proven anti-confetti rule — never free-floating chips)
    for (let i = 0; i < Math.max(2, Math.round(3 * nK * (visual.blackK || 1) / pk)); i++) {
      const r = S * wk * pk * (0.028 + rng() * 0.018);
      let x = rng() * S, y = rng() * S;
      if (fields.length && rng() < 0.8) {
        const c2 = fields[(rng() * fields.length) | 0];
        const a2 = rng() * Math.PI * 2;
        x = c2[0] + Math.cos(a2) * c2[2] * 1.1;
        y = c2[1] + Math.sin(a2) * c2[2] * 0.8;
      }
      const p = camoPatchPath2D(rng, x, y, r, dirA + (rng() - 0.5) * 0.7, 3);
      sprayEdge(p, black, 0.9, false);
    }
  } else if (scheme === 'blotch' && patches.length) {
    // Dense rounded blotch field (tropic/jungle + autumn palettes, camo r8):
    // large SOFT rounded masses at ~50-60% coverage, each with a small
    // satellite-dapple cluster — canopy language, deliberately zero angular
    // facets so it separates from nato/merdc geometry at battle range.
    // camo r2 (starter pattern-quality): two splotch-shape upgrades.
    //   1. The LARGE masses union a second offset lobe — single blobPath2D
    //      stamps read as same-recipe cookie-cutter ellipses once three sit
    //      on one flank; a two-lobe union gives each mass a waist/branch
    //      silhouette like real foliage masses.
    //   2. Satellites drift along ONE per-vehicle direction (dirB) instead
    //      of ringing the rim uniformly — canopy dapple trails off masses
    //      with the light, it doesn't halo them.
    const pk = visual.patchK || 1;
    const dirB = rng() * Math.PI * 2;              // shared satellite drift
    for (let pi = 0; pi < patches.length; pi++) {
      const col = patches[pi];
      const nB = Math.max(3, Math.round((5 - pi) * nK / pk));
      for (let i = 0; i < nB; i++) {
        const r = S * wk * pk * (pi === 0 ? 0.085 + rng() * 0.055 : 0.05 + rng() * 0.04);
        const x = rng() * S, y = rng() * S;
        const p = blobPath2D(rng, x, y, r, 9, 0.5);
        if (pi === 0) {                            // second lobe on the big masses
          const a3 = rng() * Math.PI * 2;
          p.addPath(blobPath2D(rng, x + Math.cos(a3) * r * (0.75 + rng() * 0.35),
            y + Math.sin(a3) * r * (0.6 + rng() * 0.3), r * (0.55 + rng() * 0.3), 9, 0.5));
        }
        sprayEdge(p, col, 0.93, false);
        const nSat = 2 + ((rng() * 2) | 0);        // dapple trail off the rim
        for (let k2 = 0; k2 < nSat; k2++) {
          const a2 = dirB + (rng() - 0.5) * 1.5;
          const sp = blobPath2D(rng, x + Math.cos(a2) * r * (1.3 + rng() * 0.7),
            y + Math.sin(a2) * r * (1.0 + rng() * 0.6), r * (0.22 + rng() * 0.22), 7, 0.55);
          ctx.filter = `blur(${Math.max(1, S * 0.0006).toFixed(1)}px)`;
          fillWrapped(ctx, S, sp, rgb(col, 0.88));
          ctx.filter = 'none';
        }
      }
    }
  } else if (scheme === 'blocks' && patches.length) {
    // Urban block (Berlin-brigade language, camo r8): CRISP axis-aligned
    // rectangles in flat greys — geometry so architectural it can never be
    // mistaken for a foliage scheme. Big panels first, then a course of
    // half-size blocks; edges stay unblurred (masked hard-line paint), the
    // only hard-vector scheme by design.
    const pk = visual.patchK || 1;
    const rect = (x, y, w2, h2, col, a) => {
      const p = new Path2D();
      p.rect(x - w2 / 2, y - h2 / 2, w2, h2);
      fillWrapped(ctx, S, p, rgb(col, a));
    };
    const nBig = Math.max(4, Math.round(6 * nK / pk));
    for (let i = 0; i < nBig; i++) {
      const col = patches[i % patches.length];
      rect(rng() * S, rng() * S,
        S * wk * pk * (0.13 + rng() * 0.12), S * wk * pk * (0.10 + rng() * 0.10), col, 0.95);
    }
    for (let i = 0; i < Math.round(10 * nK / pk); i++) {
      const col = patches[(rng() * patches.length) | 0];
      rect(rng() * S, rng() * S,
        S * wk * pk * (0.05 + rng() * 0.06), S * wk * pk * (0.04 + rng() * 0.05), col, 0.92);
    }
  } else if (scheme === 'washworn') {
    // Field-expedient whitewash, HEAVILY worn (camo r8) — distinct from
    // 'winter' (a maintained near-full wash): this one was slopped on
    // mid-campaign and half scrubbed off. Broad opaque chalk swathes leave
    // CONNECTED bands of the factory paint exposed (~25-30%), wear gathers
    // along one abrasion diagonal, and the winter luma ceiling caps the
    // brightest texels so the wash stays in the matte chalk band.
    const under = patches.length ? patches[0] : [70, 80, 55];
    for (let i = 0; i < Math.round(9 * nK); i++) {   // crew mop-work swathes
      const r = S * wk * (0.09 + rng() * 0.07);
      const p = camoPatchPath2D(rng, rng() * S, rng() * S, r, rng() * Math.PI, 3 + ((rng() * 3) | 0));
      ctx.filter = `blur(${Math.max(1.5, S * 0.0016).toFixed(1)}px)`;
      fillWrapped(ctx, S, p, rgb(mix(base, [255, 255, 255], 0.05), 0.85));
      ctx.filter = 'none';
    }
    // exposed factory paint: connected multi-lobe bands along one diagonal
    const dirW = rng() * Math.PI;
    for (let i = 0; i < Math.round(6 * nK); i++) {
      const r = S * wk * (0.05 + rng() * 0.05);
      const p = camoPatchPath2D(rng, rng() * S, rng() * S, r, dirW + (rng() - 0.5) * 0.5, 3 + ((rng() * 2) | 0));
      ctx.filter = `blur(${Math.max(1, S * 0.0009).toFixed(1)}px)`;
      fillWrapped(ctx, S, p, rgb(under, 0.45 + rng() * 0.30));
      ctx.filter = 'none';
    }
    // scrub streaks + cold slush grime (winter's steel-wear language, heavier)
    for (let i = 0; i < 60; i++) {
      const x0 = rng() * S, y0 = rng() * S, len = S * (0.05 + rng() * 0.14);
      const tone = rng() < 0.5 ? mix(under, [96, 104, 108], 0.5) : [88, 96, 102];
      const path = new Path2D();
      path.moveTo(x0, y0);
      path.lineTo(x0 + (rng() - 0.5) * 6, y0 + len);
      strokeWrapped(ctx, S, path, rgb(tone, 0.10 + rng() * 0.12), 1.5 + rng() * 4);
    }
    capCanvasLuma(ctx, S, luma(base) * 1.04);
  } else if (scheme === 'caunter' && patches.length) {
    // British Caunter-family stone scheme (camo r8): PARALLEL hard-edged
    // diagonal bands, all sharing the vehicle's one angle — the disciplined
    // ruler-laid Middle-East look, nothing sprayed. Slate blue-grey + dark
    // earth over the desert-pink base; a gentle mid-band bend follows plate
    // breaks so long hull sides never read as printed tape.
    const pk = visual.patchK || 1;
    const ang = (rng() < 0.5 ? 1 : -1) * (0.55 + rng() * 0.35);   // ~30-50 deg
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const nx = -sa, ny = ca;
    const nB2 = Math.max(4, Math.round(6 * nK / pk));
    for (let i = 0; i < nB2; i++) {
      const col = patches[i % patches.length];
      const w2 = S * wk * pk * (0.07 + rng() * 0.065);
      // camo r2 (starter pattern-quality): bands taper to ~half width along
      // their run — the real Caunter panels are CONVERGING wedges laid to
      // false-perspective the hull, and the old constant-width strips read
      // as printed tape at pedestal range. Same one-angle discipline.
      const wEnd = w2 * (0.45 + rng() * 0.4);
      const wMid = (w2 + wEnd) / 2;
      const cx = rng() * S, cy = rng() * S;
      const len = S * 1.55;
      const bend = (rng() - 0.5) * w2 * 1.6;
      const p = new Path2D();
      const x0 = cx - ca * len / 2, y0 = cy - sa * len / 2;
      const x1 = cx + nx * bend, y1 = cy + ny * bend;
      const x2 = cx + ca * len / 2, y2 = cy + sa * len / 2;
      p.moveTo(x0 + nx * w2 / 2, y0 + ny * w2 / 2);
      p.lineTo(x1 + nx * wMid / 2, y1 + ny * wMid / 2);
      p.lineTo(x2 + nx * wEnd / 2, y2 + ny * wEnd / 2);
      p.lineTo(x2 - nx * wEnd / 2, y2 - ny * wEnd / 2);
      p.lineTo(x1 - nx * wMid / 2, y1 - ny * wMid / 2);
      p.lineTo(x0 - nx * w2 / 2, y0 - ny * w2 / 2);
      p.closePath();
      fillWrapped(ctx, S, p, rgb(col, 0.94));
    }
  } else if (scheme === 'splinter' && patches.length) {
    // Splittertarn (hard-edge WWII German, camo r8): interlocking
    // straight-edged polygon wedges of green + red-brown over the tan base,
    // plus the signature Regenstreifen — short parallel rain strokes in one
    // fixed diagonal laid across everything.
    const pk = visual.patchK || 1;
    const nP2 = Math.max(5, Math.round(8 * nK / pk));
    for (let i = 0; i < nP2; i++) {
      const col = patches[i % patches.length];
      const r = S * wk * pk * (i < nP2 * 0.4 ? 0.10 + rng() * 0.065 : 0.055 + rng() * 0.045);
      const p = polyPath2D(rng, rng() * S, rng() * S, r, 4 + ((rng() * 3) | 0), 0.5);
      fillWrapped(ctx, S, p, rgb(col, 0.95));
    }
    // camo r2: `rainK` palette knob (default 1 — rng draw order untouched)
    // scales the Regenstreifen density. The Nordic M90-family scheme ('m90')
    // is the same interlocking hard-wedge geometry WITHOUT rain strokes —
    // rainK 0 skips the pass (ra/rainCol still draw so authored splinter
    // layouts stay byte-stable).
    const rainK = visual.rainK == null ? 1 : visual.rainK;
    const ra = 1.1 + (rng() - 0.5) * 0.3;          // one rain direction per tank
    const rainCol = mix(patches[0], [40, 44, 38], 0.55);
    for (let i = 0; i < Math.round(90 * nK * rainK); i++) {
      const x0 = rng() * S, y0 = rng() * S;
      const len = S * wk * (0.025 + rng() * 0.045);
      const path = new Path2D();
      path.moveTo(x0, y0);
      path.lineTo(x0 + Math.cos(ra) * len, y0 + Math.sin(ra) * len);
      strokeWrapped(ctx, S, path, rgb(rainCol, 0.55 + rng() * 0.25), 1.2 + rng() * 1.6);
    }
  } else if (scheme === 'dazzle' && patches.length) {
    // Dazzle (camo r8): long straight HARD-EDGE wedge bands crossing the
    // hull at two alternating diagonal families — disruption by geometry,
    // not blending. Bands are tapered polygon strips (no spray blur; the
    // camoPatchPath2D midpoint jitter is deliberately absent — dazzle IS
    // ruler-edged). Tones alternate through the patch list so no two
    // neighboring bands share a value.
    const pk = visual.patchK || 1;
    const a0 = rng() * Math.PI;
    const a1 = a0 + Math.PI / 2 + (rng() - 0.5) * 0.5;
    const nB = Math.max(5, Math.round(7 * nK / pk));
    for (let i = 0; i < nB; i++) {
      const col = patches[i % patches.length];
      const ang = (i % 3 === 2 ? a1 : a0) + (rng() - 0.5) * 0.22;
      const len = S * wk * pk * (0.7 + rng() * 0.6);
      const w0 = S * wk * pk * (0.05 + rng() * 0.075);
      const w1 = w0 * (0.25 + rng() * 0.5);        // taper -> wedge read
      const cx = rng() * S, cy = rng() * S;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const nx = -sa, ny = ca;
      const p = new Path2D();
      p.moveTo(cx - ca * len / 2 + nx * w0 / 2, cy - sa * len / 2 + ny * w0 / 2);
      p.lineTo(cx + ca * len / 2 + nx * w1 / 2, cy + sa * len / 2 + ny * w1 / 2);
      p.lineTo(cx + ca * len / 2 - nx * w1 / 2, cy + sa * len / 2 - ny * w1 / 2);
      p.lineTo(cx - ca * len / 2 - nx * w0 / 2, cy - sa * len / 2 - ny * w0 / 2);
      p.closePath();
      fillWrapped(ctx, S, p, rgb(col, 0.96));
    }
    // short counter-chevrons break the band rhythm on big flat plates
    for (let i = 0; i < Math.round(3 * nK / pk); i++) {
      const col = patches[(i + 1) % patches.length];
      const ang = a1 + (rng() - 0.5) * 0.3;
      const len = S * wk * pk * (0.22 + rng() * 0.18);
      const w0 = S * wk * pk * (0.04 + rng() * 0.04);
      const cx = rng() * S, cy = rng() * S;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const nx = -sa, ny = ca;
      const p = new Path2D();
      p.moveTo(cx - ca * len / 2 + nx * w0 / 2, cy - sa * len / 2 + ny * w0 / 2);
      p.lineTo(cx + ca * len / 2 + nx * w0 * 0.3, cy + sa * len / 2 + ny * w0 * 0.3);
      p.lineTo(cx + ca * len / 2 - nx * w0 * 0.3, cy + sa * len / 2 - ny * w0 * 0.3);
      p.lineTo(cx - ca * len / 2 - nx * w0 / 2, cy - sa * len / 2 - ny * w0 / 2);
      p.closePath();
      fillWrapped(ctx, S, p, rgb(col, 0.94));
    }
    // ===================== END CAMO PATTERN SECTION =================
  } else if (scheme === 'tigerstripe' && patches.length) {
    // ===================== CAMO PATTERN SECTION =====================
    // Tiger stripe (SEA gunship lineage, camo r2 expansion): long JAGGED
    // near-horizontal bands — thick dark stripes with sharp tapered claw
    // ends and per-segment width jitter, thin pale interstripes riding
    // between them, over a mid-green field. Brush-applied HARD edges (~1px
    // feather only), never sprayed — the crisp sawtooth silhouette is the
    // signature, so no camoPatchPath2D/sprayEdge here. patches = [dark
    // stripe, pale interstripe, optional mid-green underband].
    const dark = patches[0];
    const pale = patches[1] || mix(base, [214, 208, 168], 0.4);
    const mid2 = patches[2] || null;
    // one near-horizontal flow per vehicle (bandAngle knob can repose it)
    const flow = (visual.bandAngle != null ? visual.bandAngle : 0.14) + (rng() - 0.5) * 0.18;
    const stripe = (col, w0, len, alpha) => {
      const segs = 7;
      const dirA = flow + (rng() - 0.5) * 0.28;
      const x0 = rng() * S, y0 = rng() * S;
      const step = len / segs;
      const spine = [];
      let cx = x0 - Math.cos(dirA) * len / 2, cy = y0 - Math.sin(dirA) * len / 2;
      let a = dirA;
      for (let i = 0; i <= segs; i++) {
        spine.push([cx, cy]);
        a = dirA + (rng() - 0.5) * 0.6;            // spine wanders
        cx += Math.cos(a) * step;
        cy += Math.sin(a) * step;
      }
      const nx = -Math.sin(dirA), ny = Math.cos(dirA);
      const p = new Path2D();
      const half = (i) => {                        // sharp taper + jagged width
        const t = i / segs;
        const taper = Math.pow(Math.sin(Math.PI * t), 0.55);
        return (w0 / 2) * taper * (0.6 + rng() * 0.8);
      };
      for (let i = 0; i <= segs; i++) {
        const w2 = half(i);
        const px2 = spine[i][0] + nx * w2, py2 = spine[i][1] + ny * w2;
        if (i === 0) p.moveTo(px2, py2); else p.lineTo(px2, py2);
      }
      for (let i = segs; i >= 0; i--) {
        const w2 = half(i);
        p.lineTo(spine[i][0] - nx * w2, spine[i][1] - ny * w2);
      }
      p.closePath();
      // claw spur: a short tapered branch off a random spine point
      if (rng() < 0.55) {
        const k2 = 1 + ((rng() * (segs - 2)) | 0);
        const sa2 = dirA + (rng() < 0.5 ? 1 : -1) * (0.9 + rng() * 0.5);
        const sl = len * (0.10 + rng() * 0.10);
        const [bx, by] = spine[k2];
        p.moveTo(bx + nx * w0 * 0.2, by + ny * w0 * 0.2);
        p.lineTo(bx + Math.cos(sa2) * sl, by + Math.sin(sa2) * sl);
        p.lineTo(bx - nx * w0 * 0.2, by - ny * w0 * 0.2);
        p.closePath();
      }
      ctx.filter = `blur(${Math.max(1, S * 0.0007).toFixed(1)}px)`;
      fillWrapped(ctx, S, p, rgb(col, alpha));
      ctx.filter = 'none';
    };
    if (mid2) {                                    // soft mid-green underbands
      for (let i = 0; i < Math.round(4 * nK); i++) {
        stripe(mix(mid2, base, 0.25), S * wk * (0.09 + rng() * 0.06),
          S * wk * (0.5 + rng() * 0.4), 0.55);
      }
    }
    for (let i = 0; i < Math.round(5 * nK); i++) { // thin pale interstripes
      stripe(pale, S * wk * (0.020 + rng() * 0.018), S * wk * (0.4 + rng() * 0.35), 0.85);
    }
    for (let i = 0; i < Math.round(7 * nK); i++) { // dominant dark claws
      stripe(dark, S * wk * (0.045 + rng() * 0.04), S * wk * (0.55 + rng() * 0.45), 0.94);
    }
    // ===================== END CAMO PATTERN SECTION =================
  } else if (scheme === 'chip6' && patches.length) {
    // ===================== CAMO PATTERN SECTION =====================
    // US 6-color desert 'chocolate chip' (camo r2 expansion): broad wavy
    // horizontal wind bands in two earth tones over the tan base, then the
    // signature COOKIE clusters — pale rounded blobs with small black-rock
    // chips riding their rims. Band geometry shares the desert scheme's
    // world-size discipline (wk/nK); cookies stay clustered so they never
    // rain as uniform confetti (the r8 desert lesson). patches = [broad
    // dark earth, broad pale sand, cookie pale, chip black].
    const bDark = patches[0];
    const bPale = patches[1] || mix(base, [235, 226, 196], 0.4);
    const cookie = patches[2] || mix(base, [228, 232, 230], 0.55);
    const chip = patches[3] || [51, 52, 47];
    for (let i = 0; i < Math.round(5 * nK); i++) { // wavy horizontal bands
      const y0 = rng() * S;
      const w = S * wk * (0.09 + rng() * 0.09);
      const col = i % 2 ? bDark : bPale;
      const path = new Path2D();
      path.moveTo(-S * 0.1, y0);
      path.bezierCurveTo(
        S * 0.28, y0 + (rng() - 0.5) * S * 0.16,
        S * 0.62, y0 + (rng() - 0.5) * S * 0.16,
        S * 1.1, y0 + (rng() - 0.5) * S * 0.12);
      ctx.filter = `blur(${Math.max(1, S * 0.0009).toFixed(1)}px)`;
      strokeWrapped(ctx, S, path, rgb(mix(col, base, 0.12), 0.88), w);
      ctx.filter = 'none';
    }
    const nCl = Math.round(8 * nK);                // cookie clusters
    for (let i = 0; i < nCl; i++) {
      const ccx = rng() * S, ccy = rng() * S;
      const n = 1 + ((rng() * 3) | 0);
      for (let k2 = 0; k2 < n; k2++) {
        const x = ccx + (rng() - 0.5) * S * wk * 0.11;
        const y = ccy + (rng() - 0.5) * S * wk * 0.08;
        const r = S * wk * (0.019 + rng() * 0.019);
        const p = blobPath2D(rng, x, y, r, 8, 0.4);
        ctx.filter = `blur(${Math.max(1, S * 0.0006).toFixed(1)}px)`;
        fillWrapped(ctx, S, p, rgb(cookie, 0.94));
        ctx.filter = 'none';
        const nk2 = 2 + ((rng() * 3) | 0);         // black chips hug the rim
        for (let j = 0; j < nk2; j++) {
          const a2 = rng() * Math.PI * 2;
          const px2 = x + Math.cos(a2) * r * (0.55 + rng() * 0.55);
          const py2 = y + Math.sin(a2) * r * (0.45 + rng() * 0.45) * 0.8;
          const rr = r * (0.16 + rng() * 0.15);
          fillWrapped(ctx, S, polyPath2D(rng, px2, py2, rr, 5, 0.6), rgb(chip, 0.9));
        }
      }
    }
    // ===================== END CAMO PATTERN SECTION =================
  } else if (scheme === 'brush' && patches.length) {
    // ===================== CAMO PATTERN SECTION =====================
    // UK DPM brush-stroke (camo r2 expansion): layered directional strokes —
    // each tone swept along ONE shared flow with occasional perpendicular
    // counterstrokes, round brush ends, hard masked edge (~1px feather).
    // Strokes stack green -> brown -> black so the black always reads as the
    // top drawing layer, the DPM signature. patches = [green, brown, black].
    const flow = rng() * Math.PI;
    const strokeOne = (col, w, len, alpha) => {
      const x0 = rng() * S, y0 = rng() * S;
      const a = flow + (rng() - 0.5) * 0.6 + (rng() < 0.18 ? Math.PI / 2 : 0);
      const bend = (rng() - 0.5) * w * 3;
      const path = new Path2D();
      path.moveTo(x0, y0);
      path.quadraticCurveTo(
        x0 + Math.cos(a) * len * 0.5 - Math.sin(a) * bend,
        y0 + Math.sin(a) * len * 0.5 + Math.cos(a) * bend,
        x0 + Math.cos(a) * len, y0 + Math.sin(a) * len);
      ctx.filter = `blur(${Math.max(1, S * 0.0007).toFixed(1)}px)`;
      strokeWrapped(ctx, S, path, rgb(col, alpha), w);
      ctx.filter = 'none';
    };
    const green = patches[0];
    const brown = patches[1] || patches[0];
    const black = patches[2] || null;
    for (let i = 0; i < Math.round(8 * nK); i++) {
      strokeOne(green, S * wk * (0.045 + rng() * 0.05), S * wk * (0.30 + rng() * 0.35), 0.92);
    }
    for (let i = 0; i < Math.round(7 * nK); i++) {
      strokeOne(brown, S * wk * (0.040 + rng() * 0.045), S * wk * (0.28 + rng() * 0.30), 0.92);
    }
    if (black) {
      for (let i = 0; i < Math.round(5 * nK); i++) {
        strokeOne(black, S * wk * (0.022 + rng() * 0.028), S * wk * (0.24 + rng() * 0.28), 0.90);
      }
    }
    // ===================== END CAMO PATTERN SECTION =================
  } else if (scheme === 'claude' && patches.length) {
    // ===================== CAMO PATTERN SECTION =====================
    // The HOUSE SCHEME (camo r5, owner ask: "remove the black and orange
    // dots... massive versions of the claude guys themselves in black and
    // orange"). The r4 terra/slate field lobes still read as dots under the
    // monogram, so the fields are GONE — same composition language as
    // 'spark': soft clay washes for depth, then the official Claude Code
    // creature stamped from sprinkle to hero scale, ink alternating
    // terracotta/slate straight on the ivory. patches = [terracotta, slate].
    const terra = patches[0];
    const slate = patches[1] || '#3d3b37';
    for (let i = 0; i < Math.max(2, Math.round(3 * nK)); i++) {
      // broad low-alpha clay washes so the ivory field isn't flat
      const x = rng() * S, y = rng() * S;
      const r = S * wk * (0.16 + rng() * 0.09);
      ctx.filter = `blur(${Math.max(2, S * 0.004).toFixed(1)}px)`;
      fillWrapped(ctx, S, blobPath2D(rng, x, y, r, 8, 0.3),
        rgb(mix(terra, base, 0.62), 0.5));
      ctx.filter = 'none';
    }
    const codeSrc = new Path2D(CLAUDE_CODE_MARK);
    const guy = (x, y, s, rot, ink, a) => {
      const p = new Path2D();
      // 24x24 source box, visual mass centered near (12, 12.5); s/24 spans
      // s units. evenodd keeps the punched eyes open. Rotations stay small —
      // the creature reads upright, unlike the any-angle starburst.
      const m = new DOMMatrix().translate(x, y).rotate((rot * 180) / Math.PI)
        .scale(s / 24, s / 24).translate(-12, -12.5);
      p.addPath(codeSrc, m);
      fillWrapped(ctx, S, p, rgb(ink, a), 'evenodd');
    };
    guy(S * (0.3 + rng() * 0.4), S * (0.3 + rng() * 0.4),
      S * (0.52 + rng() * 0.12), (rng() - 0.5) * 0.5, terra, 0.94); // the hero guy
    const cell = S / 2;
    for (let gy = 0; gy < 2; gy++) {
      for (let gx = 0; gx < 2; gx++) {
        const x = (gx + 0.5 + (rng() - 0.5) * 0.6) * cell;
        const y = (gy + 0.5 + (rng() - 0.5) * 0.6) * cell;
        guy(x, y, cell * (0.44 + rng() * 0.14), (rng() - 0.5) * 0.5,
          (gx + gy) % 2 ? slate : terra, 0.9);
      }
    }
    for (let i = 0; i < Math.round(7 * nK); i++) {  // sprinkle guys
      guy(rng() * S, rng() * S, S * (0.05 + rng() * 0.04),
        (rng() - 0.5) * 0.7, rng() < 0.4 ? slate : terra, 0.62);
    }
    // ===================== END CAMO PATTERN SECTION =================
  } else if (scheme === 'spark' && patches.length) {
    // ===================== CAMO PATTERN SECTION =====================
    // CLAUDE SPARK camo (camo r4, owner ask): the official starburst from
    // sprinkle to hero scale over warm ivory with soft clay wash fields. One
    // giant spark anchors the tile, mediums alternate terracotta/slate, a
    // terracotta sprinkle fills the field. patches = [terracotta, slate].
    const terra = patches[0];
    const slate = patches[1] || '#3a3733';
    for (let i = 0; i < Math.max(2, Math.round(3 * nK)); i++) {
      // broad low-alpha clay washes so the ivory field isn't flat
      const x = rng() * S, y = rng() * S;
      const r = S * wk * (0.16 + rng() * 0.09);
      ctx.filter = `blur(${Math.max(2, S * 0.004).toFixed(1)}px)`;
      fillWrapped(ctx, S, blobPath2D(rng, x, y, r, 8, 0.3),
        rgb(mix(terra, base, 0.62), 0.5));
      ctx.filter = 'none';
    }
    const sparkSrc = new Path2D(CLAUDE_SPARK_MARK);
    const spark = (x, y, s, rot, ink, a) => {
      const p = new Path2D();
      const m = new DOMMatrix().translate(x, y).rotate((rot * 180) / Math.PI)
        .scale(s / 24, s / 24).translate(-12, -12);
      p.addPath(sparkSrc, m);
      fillWrapped(ctx, S, p, rgb(ink, a));
    };
    spark(S * (0.3 + rng() * 0.4), S * (0.3 + rng() * 0.4),
      S * (0.5 + rng() * 0.12), rng() * Math.PI * 2, terra, 0.94); // the hero
    const cell = S / 2;
    for (let gy = 0; gy < 2; gy++) {
      for (let gx = 0; gx < 2; gx++) {
        const x = (gx + 0.5 + (rng() - 0.5) * 0.6) * cell;
        const y = (gy + 0.5 + (rng() - 0.5) * 0.6) * cell;
        spark(x, y, cell * (0.42 + rng() * 0.14), rng() * Math.PI * 2,
          (gx + gy) % 2 ? slate : terra, 0.9);
      }
    }
    for (let i = 0; i < Math.round(7 * nK); i++) {  // sprinkle
      spark(rng() * S, rng() * S, S * (0.045 + rng() * 0.035),
        rng() * Math.PI * 2, rng() < 0.3 ? slate : terra, 0.6);
    }
    // ===================== END CAMO PATTERN SECTION =================
  } else if (scheme === 'ducky' && patches.length) {
    // ===================== CAMO PATTERN SECTION =====================
    // RUBBER DUCKY (camo r6, owner ask: fun set): a hero duck and its
    // flotilla in bath-toy gold on pond gray, slate wing/eye/beak accents,
    // faint ripple lines for water. patches = [gold, slate].
    const gold = patches[0];
    const ink = patches[1] || '#2e3338';
    for (let i = 0; i < Math.round(4 * nK); i++) {   // ripples
      const y0 = rng() * S;
      const path = new Path2D();
      path.moveTo(-S * 0.1, y0);
      path.bezierCurveTo(S * 0.3, y0 + (rng() - 0.5) * S * 0.05,
        S * 0.7, y0 + (rng() - 0.5) * S * 0.05, S * 1.1, y0);
      strokeWrapped(ctx, S, path, rgb(mix(base, [255, 255, 255], 0.2), 0.45),
        Math.max(2, S * 0.005));
    }
    const duck = (x, y, s, flip, a) => {
      const m = new DOMMatrix().translate(x, y).scale(flip ? -s : s, s);
      const body = new Path2D();
      const q = new Path2D();
      q.ellipse(0.02, 0.10, 0.46, 0.33, 0, 0, Math.PI * 2);      // hull
      q.ellipse(-0.30, -0.28, 0.22, 0.21, 0, 0, Math.PI * 2);    // head
      q.moveTo(-0.48, -0.36); q.lineTo(-0.68, -0.26); q.lineTo(-0.48, -0.18);
      q.closePath();                                             // beak
      q.moveTo(0.34, -0.02); q.quadraticCurveTo(0.58, -0.22, 0.46, 0.08);
      q.closePath();                                             // tail flick
      body.addPath(q, m);
      fillWrapped(ctx, S, body, rgb(gold, a));
      const detail = new Path2D();
      const q2 = new Path2D();
      q2.ellipse(0.08, 0.12, 0.17, 0.10, -0.35, 0, Math.PI * 2); // wing
      q2.moveTo(-0.31, -0.31); q2.arc(-0.34, -0.31, 0.035, 0, Math.PI * 2); // eye
      detail.addPath(q2, m);
      fillWrapped(ctx, S, detail, rgb(ink, a * 0.85));
    };
    duck(S * (0.3 + rng() * 0.4), S * (0.3 + rng() * 0.4),
      S * (0.26 + rng() * 0.06), rng() < 0.5, 0.95);             // hero duck
    for (let i = 0; i < 3; i++) {
      duck(rng() * S, rng() * S, S * (0.12 + rng() * 0.05), rng() < 0.5, 0.92);
    }
    for (let i = 0; i < Math.round(6 * nK); i++) {               // ducklings
      duck(rng() * S, rng() * S, S * (0.045 + rng() * 0.03), rng() < 0.5, 0.8);
    }
    // ===================== END CAMO PATTERN SECTION =================
  } else if (scheme === 'suits' && patches.length) {
    // ===================== CAMO PATTERN SECTION =====================
    // HIGH ROLLER (camo r6): playing-card suits scattered over aged ivory —
    // hearts/diamonds in red, spades/clubs in black, casino-felt wash.
    // patches = [red, black].
    const red = patches[0];
    const blk = patches[1] || '#2b2b2e';
    const suit = (kind, x, y, s, rot, a) => {
      const q = new Path2D();
      if (kind === 0) {          // heart (24x24 box)
        q.moveTo(12, 21);
        q.bezierCurveTo(4, 13, 2, 9, 2, 6.5);
        q.bezierCurveTo(2, 3.5, 4.2, 2, 6.5, 2);
        q.bezierCurveTo(8.6, 2, 10.8, 3.2, 12, 5.6);
        q.bezierCurveTo(13.2, 3.2, 15.4, 2, 17.5, 2);
        q.bezierCurveTo(19.8, 2, 22, 3.5, 22, 6.5);
        q.bezierCurveTo(22, 9, 20, 13, 12, 21);
        q.closePath();
      } else if (kind === 1) {   // diamond
        q.moveTo(12, 1); q.lineTo(19.5, 12); q.lineTo(12, 23);
        q.lineTo(4.5, 12); q.closePath();
      } else if (kind === 2) {   // spade
        q.moveTo(12, 2);
        q.bezierCurveTo(20, 10, 22, 12.5, 22, 15);
        q.bezierCurveTo(22, 18, 19.8, 19.5, 17.5, 19.5);
        q.bezierCurveTo(16, 19.5, 14.6, 18.9, 13.6, 17.8);
        q.lineTo(15.2, 23); q.lineTo(8.8, 23); q.lineTo(10.4, 17.8);
        q.bezierCurveTo(9.4, 18.9, 8, 19.5, 6.5, 19.5);
        q.bezierCurveTo(4.2, 19.5, 2, 18, 2, 15);
        q.bezierCurveTo(2, 12.5, 4, 10, 12, 2);
        q.closePath();
      } else {                   // club
        q.arc(12, 7, 5.2, 0, Math.PI * 2);
        q.moveTo(11.6, 14); q.arc(6.4, 14, 5.2, 0, Math.PI * 2);
        q.moveTo(22.8, 14); q.arc(17.6, 14, 5.2, 0, Math.PI * 2);
        q.moveTo(15.2, 23); q.lineTo(8.8, 23); q.lineTo(10.8, 16);
        q.lineTo(13.2, 16); q.closePath();
      }
      const p = new Path2D();
      p.addPath(q, new DOMMatrix().translate(x, y)
        .rotate((rot * 180) / Math.PI).scale(s / 24, s / 24).translate(-12, -12));
      fillWrapped(ctx, S, p, rgb(kind < 2 ? red : blk, a));
    };
    suit((rng() * 4) | 0, S * (0.3 + rng() * 0.4), S * (0.3 + rng() * 0.4),
      S * (0.42 + rng() * 0.12), (rng() - 0.5) * 0.5, 0.94);     // hero suit
    const cell = S / 2;
    let k6 = (rng() * 4) | 0;
    for (let gy = 0; gy < 2; gy++) {
      for (let gx = 0; gx < 2; gx++) {
        k6++;
        suit(k6 % 4, (gx + 0.5 + (rng() - 0.5) * 0.6) * cell,
          (gy + 0.5 + (rng() - 0.5) * 0.6) * cell,
          cell * (0.34 + rng() * 0.12), (rng() - 0.5) * 0.5, 0.9);
      }
    }
    for (let i = 0; i < Math.round(8 * nK); i++) {
      suit((rng() * 4) | 0, rng() * S, rng() * S,
        S * (0.05 + rng() * 0.04), (rng() - 0.5) * 0.7, 0.65);
    }
    // ===================== END CAMO PATTERN SECTION =================
  } else if (scheme === 'flames' && patches.length) {
    // ===================== CAMO PATTERN SECTION =====================
    // HOT ROD (camo r6): flame licks sweeping one shared diagonal over
    // near-black — deep red under orange under gold cores, drawn as chains
    // of shrinking lobes with a whip tip. patches = [red, orange, gold].
    const fr = patches[0];
    const fo = patches[1] || patches[0];
    const fg = patches[2] || fo;
    const flow = -0.5 + rng() * 0.25;
    const licks = [];
    for (let i = 0; i < Math.round(7 * nK); i++) {
      licks.push({ x: rng() * S, y: rng() * S, ang: flow + (rng() - 0.5) * 0.4,
        len: S * (0.22 + rng() * 0.2), w: S * (0.045 + rng() * 0.035), j: rng() * 9 });
    }
    const drawLayer = (col, kScale, alpha) => {
      for (const L of licks) {
        const p = new Path2D();
        const steps = 4;
        for (let k2 = 0; k2 < steps; k2++) {
          const t = k2 / steps;
          const wob = Math.sin(L.j + t * 7) * L.w * 0.5;
          p.addPath(blobPath2D(mulberry32((L.j * 1e4) | 0), 0, 0,
            L.w * kScale * (1 - t * 0.72), 7, 0.3),
          new DOMMatrix().translate(
            L.x + Math.cos(L.ang) * L.len * t - Math.sin(L.ang) * wob,
            L.y + Math.sin(L.ang) * L.len * t + Math.cos(L.ang) * wob));
        }
        const tip = new Path2D();                    // whip tip
        tip.moveTo(L.x + Math.cos(L.ang) * L.len * 0.9,
          L.y + Math.sin(L.ang) * L.len * 0.9);
        tip.quadraticCurveTo(
          L.x + Math.cos(L.ang) * L.len * 1.15 - Math.sin(L.ang) * L.w,
          L.y + Math.sin(L.ang) * L.len * 1.15 + Math.cos(L.ang) * L.w,
          L.x + Math.cos(L.ang) * L.len * (1.3 + kScale * 0.2),
          L.y + Math.sin(L.ang) * L.len * (1.3 + kScale * 0.2));
        ctx.filter = `blur(${Math.max(1, S * 0.0008).toFixed(1)}px)`;
        fillWrapped(ctx, S, p, rgb(col, alpha));
        strokeWrapped(ctx, S, tip, rgb(col, alpha * 0.9), L.w * kScale * 0.5);
        ctx.filter = 'none';
      }
    };
    drawLayer(fr, 1, 0.95);
    drawLayer(fo, 0.66, 0.95);
    drawLayer(fg, 0.34, 0.9);
    // ===================== END CAMO PATTERN SECTION =================
  } else if (scheme === 'leopardprint' && patches.length) {
    // ===================== CAMO PATTERN SECTION =====================
    // LEOPARD PRINT (camo r6): fashion rosettes — amber patch under a broken
    // black ring of arc chips, solid pips between. patches = [amber, black].
    const amber = patches[0];
    const blk = patches[1] || '#2e2a26';
    for (let i = 0; i < Math.round(24 * nK); i++) {
      const x = rng() * S, y = rng() * S;
      const r = S * (0.035 + rng() * 0.028);
      ctx.filter = `blur(${Math.max(1, S * 0.0007).toFixed(1)}px)`;
      fillWrapped(ctx, S, blobPath2D(rng, x, y, r * 0.8, 7, 0.35), rgb(amber, 0.85));
      ctx.filter = 'none';
      const n = 3 + ((rng() * 3) | 0);
      const a0 = rng() * Math.PI * 2;
      for (let k2 = 0; k2 < n; k2++) {
        const a1 = a0 + (k2 / n) * Math.PI * 2 + (rng() - 0.5) * 0.35;
        const chip = new Path2D();
        chip.arc(x, y, r * (0.95 + rng() * 0.2), a1, a1 + 0.5 + rng() * 0.5);
        strokeWrapped(ctx, S, chip, rgb(blk, 0.92), r * (0.4 + rng() * 0.2));
      }
    }
    for (let i = 0; i < Math.round(16 * nK); i++) {  // solid pips between
      fillWrapped(ctx, S, blobPath2D(rng, rng() * S, rng() * S,
        S * (0.008 + rng() * 0.01), 6, 0.4), rgb(blk, 0.85));
    }
    // ===================== END CAMO PATTERN SECTION =================
  } else if (scheme === 'bolt' && patches.length) {
    // ===================== CAMO PATTERN SECTION =====================
    // THUNDERBOLT (camo r6): comic lightning bolts, gold heroes with ink
    // counter-bolts on storm gray; soft cloud washes behind.
    // patches = [gold, ink].
    const gold = patches[0];
    const ink = patches[1] || '#26292d';
    for (let i = 0; i < Math.round(3 * nK); i++) {   // cloud washes
      ctx.filter = `blur(${Math.max(2, S * 0.004).toFixed(1)}px)`;
      fillWrapped(ctx, S, blobPath2D(rng, rng() * S, rng() * S,
        S * wk * (0.14 + rng() * 0.08), 8, 0.3),
      rgb(mix(base, [255, 255, 255], 0.14), 0.5));
      ctx.filter = 'none';
    }
    const bolt = (x, y, s, rot, col, a) => {
      const q = new Path2D();
      q.moveTo(0.06, -0.5); q.lineTo(0.26, -0.5); q.lineTo(0.03, -0.09);
      q.lineTo(0.2, -0.09); q.lineTo(-0.14, 0.5); q.lineTo(-0.02, 0.05);
      q.lineTo(-0.2, 0.05); q.closePath();
      const p = new Path2D();
      p.addPath(q, new DOMMatrix().translate(x, y)
        .rotate((rot * 180) / Math.PI).scale(s, s));
      fillWrapped(ctx, S, p, rgb(col, a));
    };
    bolt(S * (0.3 + rng() * 0.4), S * (0.3 + rng() * 0.4),
      S * (0.5 + rng() * 0.14), (rng() - 0.5) * 0.7, gold, 0.95);  // hero bolt
    const cell = S / 2;
    for (let gy = 0; gy < 2; gy++) {
      for (let gx = 0; gx < 2; gx++) {
        bolt((gx + 0.5 + (rng() - 0.5) * 0.6) * cell,
          (gy + 0.5 + (rng() - 0.5) * 0.6) * cell,
          cell * (0.4 + rng() * 0.14), (rng() - 0.5) * 0.8,
          (gx + gy) % 2 ? ink : gold, 0.9);
      }
    }
    for (let i = 0; i < Math.round(7 * nK); i++) {
      bolt(rng() * S, rng() * S, S * (0.05 + rng() * 0.045),
        rng() * Math.PI * 2, rng() < 0.35 ? ink : gold, 0.7);
    }
    // ===================== END CAMO PATTERN SECTION =================
  } else if (scheme === 'stars' && patches.length) {
    // ===================== CAMO PATTERN SECTION =====================
    // STARFALL (camo r6): five-point stars from dust to hero on night navy,
    // cream heroes with gold satellites. patches = [cream, gold].
    const cream = patches[0];
    const gold = patches[1] || patches[0];
    const star = (x, y, s, rot, col, a) => {
      const q = new Path2D();
      for (let k2 = 0; k2 < 10; k2++) {
        const rr = k2 % 2 ? 0.21 : 0.5;
        const aa = -Math.PI / 2 + (k2 * Math.PI) / 5;
        const px = Math.cos(aa) * rr, py = Math.sin(aa) * rr;
        if (k2) q.lineTo(px, py); else q.moveTo(px, py);
      }
      q.closePath();
      const p = new Path2D();
      p.addPath(q, new DOMMatrix().translate(x, y)
        .rotate((rot * 180) / Math.PI).scale(s, s));
      fillWrapped(ctx, S, p, rgb(col, a));
    };
    star(S * (0.3 + rng() * 0.4), S * (0.3 + rng() * 0.4),
      S * (0.46 + rng() * 0.12), (rng() - 0.5) * 0.6, cream, 0.94); // hero star
    const cell = S / 2;
    for (let gy = 0; gy < 2; gy++) {
      for (let gx = 0; gx < 2; gx++) {
        star((gx + 0.5 + (rng() - 0.5) * 0.6) * cell,
          (gy + 0.5 + (rng() - 0.5) * 0.6) * cell,
          cell * (0.32 + rng() * 0.14), rng() * Math.PI,
          (gx + gy) % 2 ? gold : cream, 0.9);
      }
    }
    for (let i = 0; i < Math.round(14 * nK); i++) {  // star dust
      star(rng() * S, rng() * S, S * (0.02 + rng() * 0.035),
        rng() * Math.PI, rng() < 0.5 ? gold : cream, 0.7);
    }
    // ===================== END CAMO PATTERN SECTION =================
  } else if (scheme === 'daisy' && patches.length) {
    // ===================== CAMO PATTERN SECTION =====================
    // FLOWER POWER (camo r6): sixties daisies — six cream petal ellipses
    // around a terracotta button, hero to sprinkle on olive drab.
    // patches = [cream, center].
    const cream = patches[0];
    const button = patches[1] || '#c96a3a';
    const daisy = (x, y, s, rot, a) => {
      for (let k2 = 0; k2 < 6; k2++) {
        const aa = rot + (k2 * Math.PI) / 3;
        const q = new Path2D();
        q.ellipse(x + Math.cos(aa) * s * 0.3, y + Math.sin(aa) * s * 0.3,
          s * 0.21, s * 0.115, aa, 0, Math.PI * 2);
        fillWrapped(ctx, S, q, rgb(cream, a));
      }
      const c2 = new Path2D();
      c2.arc(x, y, s * 0.145, 0, Math.PI * 2);
      fillWrapped(ctx, S, c2, rgb(button, Math.min(1, a + 0.05)));
    };
    daisy(S * (0.3 + rng() * 0.4), S * (0.3 + rng() * 0.4),
      S * (0.4 + rng() * 0.1), rng() * Math.PI, 0.93);            // hero daisy
    const cell = S / 2;
    for (let gy = 0; gy < 2; gy++) {
      for (let gx = 0; gx < 2; gx++) {
        daisy((gx + 0.5 + (rng() - 0.5) * 0.6) * cell,
          (gy + 0.5 + (rng() - 0.5) * 0.6) * cell,
          cell * (0.3 + rng() * 0.12), rng() * Math.PI, 0.9);
      }
    }
    for (let i = 0; i < Math.round(8 * nK); i++) {
      daisy(rng() * S, rng() * S, S * (0.045 + rng() * 0.035),
        rng() * Math.PI, 0.75);
    }
    // ===================== END CAMO PATTERN SECTION =================
  } else if (scheme === 'circuit' && patches.length) {
    // ===================== CAMO PATTERN SECTION =====================
    // CIRCUIT BOARD (camo r6): mint traces with 45-degree jogs, gold via
    // dots and pads, a few IC packages, on PCB green.
    // patches = [pad gold, trace mint].
    const pad = patches[0];
    const trace = patches[1] || patches[0];
    const via = (x, y, r) => {
      const q = new Path2D();
      q.arc(x, y, r, 0, Math.PI * 2);
      fillWrapped(ctx, S, q, rgb(pad, 0.92));
    };
    for (let i = 0; i < Math.round(16 * nK); i++) {  // traces
      let x = rng() * S, y = rng() * S;
      const p = new Path2D();
      p.moveTo(x, y);
      via(x, y, S * 0.011);
      let dir = ((rng() * 4) | 0) * (Math.PI / 2);
      const segs = 2 + ((rng() * 3) | 0);
      for (let k2 = 0; k2 < segs; k2++) {
        const len = S * (0.07 + rng() * 0.13);
        x += Math.cos(dir) * len; y += Math.sin(dir) * len;
        p.lineTo(x, y);
        dir += (rng() < 0.5 ? 1 : -1) * (Math.PI / 4) * (1 + ((rng() * 2) | 0));
      }
      strokeWrapped(ctx, S, p, rgb(trace, 0.8), Math.max(2, S * 0.006));
      via(x, y, S * 0.011);
    }
    for (let i = 0; i < Math.round(4 * nK); i++) {   // IC packages
      const x = rng() * S, y = rng() * S;
      const w = S * (0.06 + rng() * 0.05), h = w * (0.55 + rng() * 0.5);
      const q = new Path2D();
      q.rect(x - w / 2, y - h / 2, w, h);
      fillWrapped(ctx, S, q, rgb(mix(base, [0, 0, 0], 0.45), 0.95));
      for (let k2 = 0; k2 < 4; k2++) {               // legs
        via(x - w / 2 - S * 0.008, y - h / 2 + (k2 + 0.5) * (h / 4), S * 0.006);
        via(x + w / 2 + S * 0.008, y - h / 2 + (k2 + 0.5) * (h / 4), S * 0.006);
      }
    }
    for (let i = 0; i < Math.round(10 * nK); i++) via(rng() * S, rng() * S, S * 0.009);
    // ===================== END CAMO PATTERN SECTION =================
  } else if (scheme === 'racing' && patches.length) {
    // ===================== CAMO PATTERN SECTION =====================
    // RACING TEAM (camo r6): twin rally stripes with a keyline down one
    // shared diagonal, plus number roundels. patches = [red, black].
    const red = patches[0];
    const blk = patches[1] || '#26282c';
    const ang = -0.35 + (rng() - 0.5) * 0.2;
    const band = (offX, offY, w, col, alpha) => {
      const path = new Path2D();
      const len = S * 1.6;
      path.moveTo(offX - Math.cos(ang) * len * 0.5, offY - Math.sin(ang) * len * 0.5);
      path.lineTo(offX + Math.cos(ang) * len * 0.5, offY + Math.sin(ang) * len * 0.5);
      strokeWrapped(ctx, S, path, rgb(col, alpha), w);
    };
    const cx = rng() * S, cy = rng() * S;
    const nx = -Math.sin(ang), ny = Math.cos(ang);   // stripe normal
    band(cx, cy, S * 0.11, red, 0.94);               // main stripe
    band(cx + nx * S * 0.095, cy + ny * S * 0.095, S * 0.035, red, 0.94);
    band(cx - nx * S * 0.075, cy - ny * S * 0.075, S * 0.012, blk, 0.9);
    const num = String(1 + ((rng() * 98) | 0));
    const roundel = (x, y, r) => {
      const disc = new Path2D();
      disc.arc(x, y, r, 0, Math.PI * 2);
      fillWrapped(ctx, S, disc, rgb(mix(base, [255, 255, 255], 0.55), 0.96));
      const ring = new Path2D();
      ring.arc(x, y, r * 0.94, 0, Math.PI * 2);
      strokeWrapped(ctx, S, ring, rgb(blk, 0.92), r * 0.09);
      ctx.save();
      ctx.font = `900 ${Math.round(r * 1.15)}px 'ABC Monument Grotesk', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = rgb(blk, 0.94);
      for (const dx of [-S, 0, S]) {
        for (const dy of [-S, 0, S]) {
          ctx.save(); ctx.translate(dx, dy); ctx.fillText(num, x, y * 1.02); ctx.restore();
        }
      }
      ctx.restore();
    };
    roundel(cx + nx * S * (0.26 + rng() * 0.06), cy + ny * S * 0.26, S * (0.13 + rng() * 0.03));
    roundel(cx - nx * S * (0.3 + rng() * 0.06), cy - ny * S * 0.3, S * (0.09 + rng() * 0.03));
    for (let i = 0; i < Math.round(3 * nK); i++) {   // sponsor-ish ticks
      const x = rng() * S, y = rng() * S;
      const q = new Path2D();
      q.rect(x, y, S * (0.05 + rng() * 0.05), S * 0.014);
      fillWrapped(ctx, S, q, rgb(rng() < 0.5 ? red : blk, 0.7));
    }
    // ===================== END CAMO PATTERN SECTION =================
  } else if (scheme === 'paintball' && patches.length) {
    // ===================== CAMO PATTERN SECTION =====================
    // PAINTBALL (camo r6): multicolor splats — irregular core, radial
    // droplet spray, occasional drip run — on primer gray.
    // patches = [blue, red, green, yellow].
    for (let i = 0; i < Math.round(9 * nK); i++) {
      const col = patches[(rng() * patches.length) | 0];
      const x = rng() * S, y = rng() * S;
      const r = S * (0.05 + rng() * 0.065);
      ctx.filter = `blur(${Math.max(1, S * 0.0006).toFixed(1)}px)`;
      fillWrapped(ctx, S, blobPath2D(rng, x, y, r, 11, 0.55), rgb(col, 0.9));
      ctx.filter = 'none';
      const nd = 4 + ((rng() * 6) | 0);
      for (let k2 = 0; k2 < nd; k2++) {              // droplet spray
        const aa = rng() * Math.PI * 2;
        const d = r * (1.15 + rng() * 1.5);
        const q = new Path2D();
        q.arc(x + Math.cos(aa) * d, y + Math.sin(aa) * d * 0.85,
          r * (0.06 + rng() * 0.13), 0, Math.PI * 2);
        fillWrapped(ctx, S, q, rgb(col, 0.85));
      }
      if (rng() < 0.45) {                            // drip run
        const drip = new Path2D();
        drip.moveTo(x + (rng() - 0.5) * r, y + r * 0.5);
        drip.lineTo(x + (rng() - 0.5) * r, y + r * (1.6 + rng() * 1.6));
        strokeWrapped(ctx, S, drip, rgb(col, 0.82), r * (0.1 + rng() * 0.08));
      }
    }
    // ===================== END CAMO PATTERN SECTION =================
  } else if (scheme === 'star' && patches.length) {
    // ===================== CAMO PATTERN SECTION =====================
    // INVASION STAR (camo r7 loadout set): olive field with ONE hero circled
    // white star + a plain satellite star + registration stencils — the
    // Normandy air-recognition language. patches = [white].
    const white = patches[0];
    const star = (x, y, s, rot, a, ring) => {
      const q = new Path2D();
      for (let k2 = 0; k2 < 10; k2++) {
        const rr = k2 % 2 ? 0.19 : 0.5;
        const aa = -Math.PI / 2 + (k2 * Math.PI) / 5;
        if (k2) q.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr);
        else q.moveTo(Math.cos(aa) * rr, Math.sin(aa) * rr);
      }
      q.closePath();
      const p = new Path2D();
      p.addPath(q, new DOMMatrix().translate(x, y)
        .rotate((rot * 180) / Math.PI).scale(s, s));
      fillWrapped(ctx, S, p, rgb(white, a));
      if (ring) {                                    // broken invasion circle
        const c2 = new Path2D();
        c2.arc(x, y, s * 0.62, 0.25, Math.PI * 2 - 0.2);
        strokeWrapped(ctx, S, c2, rgb(white, a * 0.9), s * 0.055);
      }
    };
    star(S * (0.3 + rng() * 0.4), S * (0.3 + rng() * 0.4),
      S * (0.3 + rng() * 0.06), (rng() - 0.5) * 0.4, 0.9, true);   // hero
    star(rng() * S, rng() * S, S * (0.12 + rng() * 0.04),
      (rng() - 0.5) * 0.5, 0.85, false);
    // camo r8 detailing: repainted-panel modulation (large soft tonal
    // rects), hard-edged OD touch-up patches, and a real registration
    // serial — the crafted-paint read, not decals on a flat coat.
    for (let i = 0; i < Math.round(5 * nK); i++) {
      const q = new Path2D();
      q.rect(rng() * S, rng() * S, S * (0.14 + rng() * 0.2), S * (0.1 + rng() * 0.16));
      ctx.filter = `blur(${Math.max(2, S * 0.006).toFixed(1)}px)`;
      fillWrapped(ctx, S, q, rgb(mix(base, [0, 0, 0], 0.16), 0.3 + rng() * 0.2));
      ctx.filter = 'none';
    }
    for (let i = 0; i < Math.round(4 * nK); i++) {   // hard touch-up patches
      const q = new Path2D();
      const w2 = S * (0.05 + rng() * 0.07), h2 = S * (0.04 + rng() * 0.05);
      q.rect(rng() * S, rng() * S, w2, h2);
      fillWrapped(ctx, S, q, rgb(mix(base, [20, 26, 14], 0.35), 0.55));
    }
    ctx.save();                                      // registration serial
    ctx.font = `700 ${Math.round(S * 0.028)}px 'ABC Monument Grotesk', sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = rgb(white, 0.8);
    const serial = `U.S.A. 30${100000 + ((rng() * 899999) | 0)}`;
    const sx = rng() * S, sy = rng() * S;
    for (const dx of [-S, 0, S]) {
      for (const dy of [-S, 0, S]) {
        ctx.save(); ctx.translate(dx, dy); ctx.fillText(serial, sx, sy); ctx.restore();
      }
    }
    ctx.restore();
    // ===================== END CAMO PATTERN SECTION =================
  } else if (scheme === 'idband' && patches.length) {
    // ===================== CAMO PATTERN SECTION =====================
    // BERLIN ID BAND (camo r7 loadout set): the white air-recognition band
    // crossing the 4BO field, plus a big white tactical number stencil.
    // patches = [white].
    const white = patches[0];
    const y0 = S * (0.25 + rng() * 0.5);
    const band = new Path2D();
    band.moveTo(-S * 0.1, y0);
    band.lineTo(S * 1.1, y0);
    strokeWrapped(ctx, S, band, rgb(white, 0.88), S * 0.045);
    const x1 = S * (0.2 + rng() * 0.6);              // crossing vertical band
    const band2 = new Path2D();
    band2.moveTo(x1, -S * 0.1);
    band2.lineTo(x1, S * 1.1);
    strokeWrapped(ctx, S, band2, rgb(white, 0.82), S * 0.035);
    const num = String(100 + ((rng() * 899) | 0));   // tactical number
    ctx.save();
    ctx.font = `900 ${Math.round(S * 0.17)}px 'ABC Monument Grotesk', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = rgb(white, 0.9);
    const nx = S * (0.25 + rng() * 0.5), ny = (y0 + S * 0.55) % S;
    for (const dx of [-S, 0, S]) {
      for (const dy of [-S, 0, S]) {
        ctx.save(); ctx.translate(dx, dy); ctx.fillText(num, nx, ny); ctx.restore();
      }
    }
    ctx.restore();
    // camo r8 detailing: the band is field paint, not a sticker — eat its
    // edges with base-tone dabs, add the diagonal assault slash and a
    // Guards star outline.
    for (let i = 0; i < Math.round(26 * nK); i++) {  // band wear
      const q = new Path2D();
      const bx = rng() * S;
      const edge = y0 + (rng() < 0.5 ? -1 : 1) * S * 0.0225;
      q.arc(bx, edge + (rng() - 0.5) * S * 0.008, S * (0.003 + rng() * 0.007), 0, Math.PI * 2);
      fillWrapped(ctx, S, q, rgb(base, 0.85));
    }
    const slash = new Path2D();                      // assault slash
    const sx2 = rng() * S, sy2 = rng() * S;
    slash.moveTo(sx2 - S * 0.07, sy2 + S * 0.1);
    slash.lineTo(sx2 + S * 0.07, sy2 - S * 0.1);
    strokeWrapped(ctx, S, slash, rgb(white, 0.85), S * 0.02);
    const gs = new Path2D();                         // Guards star outline
    const gx2 = rng() * S, gy2 = rng() * S, gr = S * (0.05 + rng() * 0.02);
    for (let k2 = 0; k2 < 10; k2++) {
      const rr = (k2 % 2 ? 0.42 : 1) * gr;
      const aa = -Math.PI / 2 + (k2 * Math.PI) / 5;
      if (k2) gs.lineTo(gx2 + Math.cos(aa) * rr, gy2 + Math.sin(aa) * rr);
      else gs.moveTo(gx2 + Math.cos(aa) * rr, gy2 + Math.sin(aa) * rr);
    }
    gs.closePath();
    strokeWrapped(ctx, S, gs, rgb(white, 0.85), gr * 0.14);
    // ===================== END CAMO PATTERN SECTION =================
  } else if (scheme === 'brushwash' && patches.length) {
    // ===================== CAMO PATTERN SECTION =====================
    // ARDENNES BRUSH WASH (camo r8): whitewash slopped on with a wide
    // brush — long directional strokes, olive drab dragging through in
    // streaks, re-dabbed white over the worst gaps. Crisp stroke language,
    // zero soft blobs. patches = [show-through OD, grime].
    const od = patches[0];
    const grime = patches[1] || patches[0];
    const flow = (rng() - 0.5) * 0.3;                // near-horizontal brush
    const strokeAt = (col, w, alpha, len) => {
      const x0 = rng() * S, y0b = rng() * S;
      const a = flow + (rng() - 0.5) * 0.18;
      const bend = (rng() - 0.5) * w * 2;
      const path = new Path2D();
      path.moveTo(x0, y0b);
      path.quadraticCurveTo(
        x0 + Math.cos(a) * len * 0.5 - Math.sin(a) * bend,
        y0b + Math.sin(a) * len * 0.5 + Math.cos(a) * bend,
        x0 + Math.cos(a) * len, y0b + Math.sin(a) * len);
      strokeWrapped(ctx, S, path, rgb(col, alpha), w);
    };
    for (let i = 0; i < Math.round(26 * nK); i++) {  // OD dragging through
      strokeAt(od, S * (0.006 + rng() * 0.016), 0.2 + rng() * 0.3,
        S * (0.2 + rng() * 0.35));
    }
    for (let i = 0; i < Math.round(10 * nK); i++) {  // grime streaks
      strokeAt(grime, S * (0.004 + rng() * 0.01), 0.25 + rng() * 0.2,
        S * (0.15 + rng() * 0.25));
    }
    for (let i = 0; i < Math.round(12 * nK); i++) {  // fresh re-dabs
      strokeAt(mix(base, [255, 255, 255], 0.2), S * (0.02 + rng() * 0.03),
        0.4 + rng() * 0.25, S * (0.1 + rng() * 0.18));
    }
    // ===================== END CAMO PATTERN SECTION =================
  } else if (scheme === 'usmc' && patches.length) {
    // ===================== CAMO PATTERN SECTION =====================
    // PACIFIC '45 (camo r8): USMC forest green under HARD-EDGED black wave
    // bands, a white hull number and coral-dust stipple — sharp painted
    // shapes, not blobs. patches = [black, coral dust, stencil white].
    const blk = patches[0];
    const dust = patches[1] || patches[0];
    const white = patches[2] || '#e3ded1';
    const flow = -0.4 + rng() * 0.25;
    for (let i = 0; i < Math.round(5 * nK); i++) {   // black wave bands
      const x0 = rng() * S, y0b = rng() * S;
      const len = S * (0.5 + rng() * 0.4);
      const w = S * wk * (0.045 + rng() * 0.045);
      const path = new Path2D();
      path.moveTo(x0, y0b);
      const seg = 4;
      for (let k2 = 1; k2 <= seg; k2++) {
        const t = k2 / seg;
        path.quadraticCurveTo(
          x0 + Math.cos(flow) * len * (t - 0.5 / seg) - Math.sin(flow) * w * (k2 % 2 ? 1.4 : -1.4),
          y0b + Math.sin(flow) * len * (t - 0.5 / seg) + Math.cos(flow) * w * (k2 % 2 ? 1.4 : -1.4),
          x0 + Math.cos(flow) * len * t, y0b + Math.sin(flow) * len * t);
      }
      strokeWrapped(ctx, S, path, rgb(blk, 0.92), w);
    }
    for (let i = 0; i < Math.round(6 * nK); i++) {   // coral-dust stipple
      const cx2 = rng() * S, cy2 = rng() * S, cr = S * (0.05 + rng() * 0.09);
      const nd = 16 + ((rng() * 22) | 0);
      for (let k2 = 0; k2 < nd; k2++) {
        const aa = rng() * Math.PI * 2, d = Math.sqrt(rng()) * cr;
        const q = new Path2D();
        q.arc(cx2 + Math.cos(aa) * d, cy2 + Math.sin(aa) * d * 0.8,
          S * (0.0015 + rng() * 0.004), 0, Math.PI * 2);
        fillWrapped(ctx, S, q, rgb(dust, 0.4 + rng() * 0.25));
      }
    }
    ctx.save();                                      // hull number
    const num2 = String(10 + ((rng() * 89) | 0));
    ctx.font = `900 ${Math.round(S * 0.13)}px 'ABC Monument Grotesk', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = rgb(white, 0.88);
    const hx = rng() * S, hy = rng() * S;
    for (const dx of [-S, 0, S]) {
      for (const dy of [-S, 0, S]) {
        ctx.save(); ctx.translate(dx, dy); ctx.fillText(num2, hx, hy); ctx.restore();
      }
    }
    ctx.restore();
    // ===================== END CAMO PATTERN SECTION =================
  } else if (scheme === 'erdl' && patches.length) {
    // ===================== CAMO PATTERN SECTION =====================
    // ERDL LEAF (camo r8, the anti-blob flagship): interlocking HARD-EDGED
    // organic islands — dark-green masses, brown mids riding their borders,
    // thin black branch squiggles threading between. No blur anywhere; the
    // shapes are high-irregularity multi-lobe unions so edges wander like
    // the printed leaf pattern. patches = [dark green, brown, black].
    const dk = patches[0];
    const br = patches[1] || patches[0];
    const bk = patches[2] || '#262a24';
    const leafIsland = (x, y, r, lobes) => {
      const p = blobPath2D(rng, x, y, r, 11, 0.62);
      for (let k2 = 0; k2 < lobes; k2++) {
        const aa = rng() * Math.PI * 2;
        p.addPath(blobPath2D(rng, x + Math.cos(aa) * r * (0.8 + rng() * 0.5),
          y + Math.sin(aa) * r * (0.7 + rng() * 0.4),
          r * (0.45 + rng() * 0.4), 10, 0.6));
      }
      return p;
    };
    const dkIslands = [];
    for (let i = 0; i < Math.round(8 * nK); i++) {   // dark-green masses
      const x = rng() * S, y = rng() * S;
      const r = S * wk * (0.05 + rng() * 0.055);
      dkIslands.push([x, y, r]);
      fillWrapped(ctx, S, leafIsland(x, y, r, 2), rgb(dk, 0.95));
    }
    for (let i = 0; i < Math.round(7 * nK); i++) {   // brown mids ride borders
      const host = dkIslands[(rng() * dkIslands.length) | 0];
      const aa = rng() * Math.PI * 2;
      const x = host[0] + Math.cos(aa) * host[2] * (1 + rng() * 0.5);
      const y = host[1] + Math.sin(aa) * host[2] * (0.9 + rng() * 0.5);
      fillWrapped(ctx, S, leafIsland(x, y, S * wk * (0.03 + rng() * 0.035), 1),
        rgb(br, 0.93));
    }
    for (let i = 0; i < Math.round(11 * nK); i++) {  // black branch squiggles
      let x = rng() * S, y = rng() * S;
      let a = rng() * Math.PI * 2;
      const path = new Path2D();
      path.moveTo(x, y);
      const seg = 2 + ((rng() * 2) | 0);
      for (let k2 = 0; k2 < seg; k2++) {
        const len = S * (0.03 + rng() * 0.05);
        const mx = x + Math.cos(a) * len * 0.5 - Math.sin(a) * len * (rng() - 0.5) * 0.8;
        const my = y + Math.sin(a) * len * 0.5 + Math.cos(a) * len * (rng() - 0.5) * 0.8;
        x += Math.cos(a) * len; y += Math.sin(a) * len;
        path.quadraticCurveTo(mx, my, x, y);
        a += (rng() - 0.5) * 1.4;
      }
      strokeWrapped(ctx, S, path, rgb(bk, 0.92), S * (0.007 + rng() * 0.008));
      if (rng() < 0.5) {                             // leaf chip at the tip
        fillWrapped(ctx, S, blobPath2D(rng, x, y, S * (0.008 + rng() * 0.008), 7, 0.5),
          rgb(bk, 0.92));
      }
    }
    // ===================== END CAMO PATTERN SECTION =================
  } else if (scheme === 'mudwash' && patches.length) {
    // ===================== CAMO PATTERN SECTION =====================
    // RASPUTITSA (camo r8): mud as an EVENT, not blobs — directional
    // spatter clusters (dense core, sparse fringe), dragged smears along
    // one flow, crusted dry patches with dark rims, panel grime lines.
    // patches = [wet mud, dry mud, dark spatter].
    const wet = patches[0];
    const dry = patches[1] || patches[0];
    const dark = patches[2] || '#332a20';
    const flow = (rng() - 0.5) * 0.5;
    for (let i = 0; i < Math.round(4 * nK); i++) {   // crusted dry patches
      const x = rng() * S, y = rng() * S;
      const r = S * wk * (0.045 + rng() * 0.04);
      const p = blobPath2D(rng, x, y, r, 10, 0.5);
      fillWrapped(ctx, S, p, rgb(dry, 0.85));
      strokeWrapped(ctx, S, p, rgb(dark, 0.7), r * 0.09); // cracked rim
    }
    for (let i = 0; i < Math.round(9 * nK); i++) {   // dragged smears
      const x0 = rng() * S, y0b = rng() * S;
      const a = flow + (rng() - 0.5) * 0.4;
      const len = S * (0.08 + rng() * 0.18);
      const w = S * (0.008 + rng() * 0.018);
      const path = new Path2D();
      path.moveTo(x0, y0b);
      path.quadraticCurveTo(
        x0 + Math.cos(a) * len * 0.5 - Math.sin(a) * w * 1.5,
        y0b + Math.sin(a) * len * 0.5 + Math.cos(a) * w * 1.5,
        x0 + Math.cos(a) * len, y0b + Math.sin(a) * len);
      strokeWrapped(ctx, S, path, rgb(wet, 0.35 + rng() * 0.3), w);
      if (rng() < 0.5) {                             // droplet at the tail
        const q = new Path2D();
        q.arc(x0 + Math.cos(a) * len * 1.12, y0b + Math.sin(a) * len * 1.12,
          w * (0.5 + rng() * 0.4), 0, Math.PI * 2);
        fillWrapped(ctx, S, q, rgb(wet, 0.6));
      }
    }
    for (let i = 0; i < Math.round(7 * nK); i++) {   // spatter clusters
      const cx2 = rng() * S, cy2 = rng() * S;
      const cr = S * (0.03 + rng() * 0.07);
      const nd = 14 + ((rng() * 20) | 0);
      for (let k2 = 0; k2 < nd; k2++) {
        const aa = rng() * Math.PI * 2, d = Math.sqrt(rng()) * cr;
        const q = new Path2D();
        q.arc(cx2 + Math.cos(aa) * d, cy2 + Math.sin(aa) * d * 0.85,
          S * (0.0015 + rng() * 0.005), 0, Math.PI * 2);
        fillWrapped(ctx, S, q, rgb(rng() < 0.3 ? dark : wet, 0.5 + rng() * 0.3));
      }
    }
    for (let i = 0; i < Math.round(6 * nK); i++) {   // panel grime lines
      const path = new Path2D();
      const x0 = rng() * S, y0b = rng() * S, len = S * (0.06 + rng() * 0.1);
      const vert = rng() < 0.5;
      path.moveTo(x0, y0b);
      path.lineTo(x0 + (vert ? 0 : len), y0b + (vert ? len : 0));
      strokeWrapped(ctx, S, path, rgb(dark, 0.4), S * 0.0035);
    }
    // ===================== END CAMO PATTERN SECTION =================
  } else if (scheme === 'amoeba' && patches.length) {
    // ===================== CAMO PATTERN SECTION =====================
    // Soviet WW2 amoeba/kumovka (camo r2 expansion): FEW very large rounded
    // masses over 4BO green — each a union of 2-3 overlapping soft blobs so
    // the silhouette flows with waists and branches (single stamps read as
    // leopard spots — the r7 morphology lesson), plus sparse medium
    // satellites and optional ochre accents. Near-hard brushed edge.
    // patches = [dark amoeba tone, optional ochre accent].
    const dark = patches[0];
    const ochre = patches[1] || null;
    const nBig = Math.max(3, Math.round(4 * nK));
    for (let i = 0; i < nBig; i++) {
      const x = rng() * S, y = rng() * S;
      const r = S * wk * (0.095 + rng() * 0.06);
      const p = blobPath2D(rng, x, y, r, 9, 0.4);
      const nL = 1 + ((rng() * 2) | 0);            // 1-2 extra lobes union in
      let lx = x, ly = y;
      for (let l = 0; l < nL; l++) {
        const a2 = rng() * Math.PI * 2;
        lx += Math.cos(a2) * r * 0.9;
        ly += Math.sin(a2) * r * 0.7;
        p.addPath(blobPath2D(rng, lx, ly, r * (0.6 + rng() * 0.4), 9, 0.4));
      }
      ctx.filter = `blur(${Math.max(1.2, S * 0.0009).toFixed(1)}px)`;
      fillWrapped(ctx, S, p, rgb(dark, 0.92));
      ctx.filter = 'none';
    }
    for (let i = 0; i < Math.round(3 * nK); i++) { // medium satellites
      const r = S * wk * (0.045 + rng() * 0.04);
      const p = blobPath2D(rng, rng() * S, rng() * S, r, 9, 0.45);
      ctx.filter = `blur(${Math.max(1.2, S * 0.0009).toFixed(1)}px)`;
      fillWrapped(ctx, S, p, rgb(dark, 0.90));
      ctx.filter = 'none';
    }
    if (ochre) {
      for (let i = 0; i < Math.round(3 * nK); i++) {
        const r = S * wk * (0.028 + rng() * 0.028);
        const p = blobPath2D(rng, rng() * S, rng() * S, r, 8, 0.5);
        ctx.filter = `blur(${Math.max(1, S * 0.0008).toFixed(1)}px)`;
        fillWrapped(ctx, S, p, rgb(ochre, 0.85));
        ctx.filter = 'none';
      }
    }
    // ===================== END CAMO PATTERN SECTION =================
  } else if (scheme === 'hexfield' && patches.length) {
    // ===================== CAMO PATTERN SECTION =====================
    // Modern experimental hex mesh (camo r2 expansion — Barracuda-net
    // language): a honeycomb cell field where ~55% of cells fill from two
    // tones and the rest let the base breathe, plus 2-3 broad soft dark
    // fields underneath so the mesh carries macro structure and never reads
    // as flat printed fabric (the digital r5 lesson). Cell pitch is
    // quantized so an INTEGER number of columns/rows fits the tile — the
    // hexes stretch a few % anisotropically, invisible at paint scale, and
    // the pattern wraps exactly (3x3 fillWrapped contract).
    const tones = [patches[0], patches[1] || patches[0]];
    // macro disruption first, under the mesh
    for (let i = 0; i < 3; i++) {
      const x = rng() * S, y = rng() * S, r = S * (0.16 + rng() * 0.12);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgb(mix(base, tones[0], 0.55), 0.5));
      g.addColorStop(1, rgb(base, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const hexR0 = S * wk * 0.034 * (visual.digitalCellK || 1);
    let nCol = Math.max(6, Math.round(S / (hexR0 * 1.5)));
    if (nCol % 2) nCol++;                          // even count: the odd-column
    // stagger keeps alternating across the wrap seam (3x3 tile contract)
    const cw = S / nCol;                           // column pitch (= 1.5 hexR)
    const hexRx = cw / 1.5;
    const nRow = Math.max(6, Math.round(S / (hexR0 * Math.sqrt(3))));
    const rh = S / nRow;                           // row pitch (= 2 * hw)
    const hw = rh / 2;
    for (let gy = 0; gy < nRow; gy++) {
      for (let gx = 0; gx < nCol; gx++) {
        const v = rng();
        if (v < 0.45) continue;                    // base shows through
        const x = gx * cw;
        const y = gy * rh + (gx % 2 ? hw : 0);
        const col = v < 0.75 ? tones[0] : tones[1];
        const p = new Path2D();
        for (let k2 = 0; k2 < 6; k2++) {
          const a2 = (k2 / 6) * Math.PI * 2;
          const px2 = x + Math.cos(a2) * hexRx * 0.94;
          const py2 = y + Math.sin(a2) * hw * 1.085;
          if (k2 === 0) p.moveTo(px2, py2); else p.lineTo(px2, py2);
        }
        p.closePath();
        fillWrapped(ctx, S, p, rgb(col, 0.9));
      }
    }
    // ===================== END CAMO PATTERN SECTION =================
  } else if (scheme === 'solid') {
    // ===================== CAMO PATTERN SECTION =====================
    // camo_spotting r3 (critic: t90m factory "single flat parade green ...
    // reads as clay render"): monotone factory coats get an explicit
    // weathered-panel pass — patterned schemes carry tonal variety in their
    // patches, but a solid coat only had the (weather-tone-dependent) soft
    // lifts above, which vanish when the palette authors weather ~= base.
    // Sun-fade patches toward a fixed dusty drift of the weather tone,
    // darker oil/soot pooling, and fine dust-run streaks keep the paint
    // reading as a maintained field vehicle, never parade clay. All alphas
    // stay low so the coat remains clean at distance.
    const solidWeatheringIntensity = Math.max(0,
      Math.min(1, visual.solidWeatheringIntensity ?? 1));
    const fade = mix(weather, [172, 162, 124], 0.16);
    for (let i = 0; i < 26; i++) {                 // sun-fade / repaint panels
      const x = rng() * S, y = rng() * S, r = S * (0.05 + rng() * 0.13);
      const tone = i % 3 === 2 ? scale3(base, 0.80) : fade;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgb(tone,
        (0.15 + rng() * 0.13) * solidWeatheringIntensity));
      g.addColorStop(1, rgb(tone, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 80; i++) {                 // dust runs down the plates
      const x0 = rng() * S, y0 = rng() * S, len = S * (0.04 + rng() * 0.10);
      const tone = rng() < 0.4 ? scale3(base, 0.76) : mix(base, [150, 140, 106], 0.42);
      const path = new Path2D();
      path.moveTo(x0, y0);
      path.lineTo(x0 + (rng() - 0.5) * 7, y0 + len);
      strokeWrapped(ctx, S, path, rgb(tone,
        (0.07 + rng() * 0.09) * solidWeatheringIntensity), 1.5 + rng() * 3.5);
    }
    // ===================== END CAMO PATTERN SECTION =================
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
function* heightToNormalSteps(hCanvas, strength = 1.6) {
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
    // A 1024-row Sobel pass was one several-hundred-millisecond task during
    // battle/garage entry. Async prebakes can now yield every 32 rows while
    // the synchronous authoring path drains the identical generator.
    if ((y & 31) === 31 && y + 1 < S) yield;
  }
  octx.putImageData(img, 0, 0);
  return out;
}

// Roughness map (1024) sharing the same feature plan: matte paint base, rough
// dust patches, smooth bare-metal chips/scuffs, slightly rough recesses.
// camo_spotting r4: base 0.78 -> 0.84 — the multiplying map put effective
// hull GGX at ~0.61 mean, and up-tilted plates at the sun↔camera mirror
// angle rendered a pale specular film that washed the camo (t34 glacis /
// m1a2 chamfer cream). Field paint over dust is duller than 0.78.
function paintRoughness(canvas, rng, feats, base = 0.84) {
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
  // camo_spotting r4: floor 0.30 -> 0.42 — with the multiplying hull base the
  // old dips fired sparkle pockets under the garage key.
  for (const c of feats.chips) {
    if (!c.metal) continue;
    const g = ((0.42 + rng() * 0.12) * 255) | 0;
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

// ===================== CAMO PATTERN SECTION =====================
// camo_spotting r4: pattern-keyed roughness modulation. Every pattern was an
// ALBEDO-only repaint — one constant-response roughness field under all
// patches, so at garage range camo read as printed vinyl, and big flat plates
// at the sun↔camera mirror angle fired ONE uniform specular sheet that washed
// the pattern to cream (m1a2 turret chamfer; t34 glacis — proven by live
// spec-kill A/B: with roughness 1 / env 0 the "cream rectangle" is fully
// patterned paint). Field-applied paint batches differ: each pattern TONE now
// carries a deterministic roughness offset (±0.045), patch BOUNDARIES get a
// rougher overspray rim (+0.035 — the edge-response hint), plus fine speckle.
// Patch classification runs at half res and is index-sampled by the full-res
// add so the whole pass stays ~10-20 ms (boot-path budget).
function paintPatchRoughness(roughCanvas, camoCanvas, visual) {
  const S = roughCanvas.width;
  const tones = [];
  for (const hx of [visual.base, visual.weather, ...(visual.patches || [])]) {
    if (!hx) continue;
    const c = hexToRgb(hx);
    if (!tones.some((t) => t[0] === c[0] && t[1] === c[1] && t[2] === c[2])) tones.push(c);
  }
  if (tones.length < 2) return;            // monotone coat: keep base response
  // per-tone deterministic offset in ±0.045 (keyed to the tone itself so the
  // same paint always answers light the same way on every vehicle)
  const offs = tones.map((c) => ((((c[0] * 3 + c[1] * 5 + c[2] * 7) % 97) / 96) * 2 - 1) * 0.045);
  const Sd = S >> 1;                       // half-res classification grid
  const down = makeCanvas(Sd, Sd);
  const dctx = down.getContext('2d', { willReadFrequently: true });
  dctx.drawImage(camoCanvas, 0, 0, Sd, Sd);
  const cd = dctx.getImageData(0, 0, Sd, Sd).data;
  const cls = new Uint8Array(Sd * Sd);
  for (let p = 0, n = Sd * Sd; p < n; p++) {
    const r = cd[p * 4], g = cd[p * 4 + 1], b = cd[p * 4 + 2];
    let best = 0, bd = Infinity;
    for (let t = 0; t < tones.length; t++) {
      const dr = r - tones[t][0], dg = g - tones[t][1], db = b - tones[t][2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bd) { bd = d; best = t; }
    }
    cls[p] = best;
  }
  const rctx = roughCanvas.getContext('2d', { willReadFrequently: true });
  const rimg = rctx.getImageData(0, 0, S, S);
  const rd = rimg.data;
  let s0 = 0x51ab7 ^ S;
  for (let y = 0; y < S; y++) {
    const yc = (y >> 1) * Sd;
    const ycE = (((y >> 1) + 2) % Sd) * Sd;                // wraps: tileable
    for (let x = 0; x < S; x++) {
      const xc = x >> 1;
      const k = cls[yc + xc];
      let dv = offs[k];
      // tone boundary → overspray rim catches dust, reads rougher
      if (cls[yc + ((xc + 2) % Sd)] !== k || cls[ycE + xc] !== k) dv += 0.035;
      s0 = (s0 * 1664525 + 1013904223) >>> 0;
      dv += (((s0 >>> 16) & 255) / 255 - 0.5) * 0.024;     // paint-batch speckle
      const i4 = (y * S + x) * 4;
      let v = rd[i4] + dv * 255;
      v = v < 0 ? 0 : (v > 255 ? 255 : v);
      rd[i4] = rd[i4 + 1] = rd[i4 + 2] = v;
    }
  }
  rctx.putImageData(rimg, 0, 0);
}
// ===================== END CAMO PATTERN SECTION =================

// One track texture: 4 link rows per repeat, chevron/waffle grousers.
function paintTrack(rng) {
  const S = texSize(512); // shared/repeating track tile keeps the world-scale budget
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  // r3 (critic: Tiger "track links are bright sparkly silver-gray instead of
  // dark manganese steel", T-90M idler "navy-blue sparkle"): the old cool
  // blue-grey ramp read as polished silver under the field sun. Warm dark
  // manganese-iron ramp with an earth cast; wear highlights cut below.
  ctx.fillStyle = '#332f2a';
  ctx.fillRect(0, 0, S, S);
  const rows = 4, rh = S / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * rh;
    // link body shading
    const g = ctx.createLinearGradient(0, y, 0, y + rh);
    g.addColorStop(0, '#494439');
    g.addColorStop(0.45, '#3a362e');
    g.addColorStop(0.5, '#211f1a');
    g.addColorStop(0.55, '#3c382f');
    g.addColorStop(1, '#302d26');
    ctx.fillStyle = g;
    ctx.fillRect(0, y + 4, S, rh - 8);
    // pin gap + end-connector bumps
    ctx.fillStyle = '#0d0c0a';
    ctx.fillRect(0, y, S, 6);
    ctx.fillStyle = '#403c33';
    for (let x = 0; x < S; x += S / 8) ctx.fillRect(x + 4, y, S / 16, 5);
    // chevron grouser
    ctx.strokeStyle = '#524d40';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(S * 0.08, y + rh * 0.72);
    ctx.lineTo(S * 0.5, y + rh * 0.3);
    ctx.lineTo(S * 0.92, y + rh * 0.72);
    ctx.stroke();
    ctx.strokeStyle = '#211f19';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(S * 0.08, y + rh * 0.78);
    ctx.lineTo(S * 0.5, y + rh * 0.36);
    ctx.lineTo(S * 0.92, y + rh * 0.78);
    ctx.stroke();
    // guide horn shadow (center)
    ctx.fillStyle = '#0f0e0b';
    ctx.fillRect(S * 0.46, y + rh * 0.15, S * 0.08, rh * 0.5);
    // wear highlights on contact ridge — dull burnished steel, not silver
    // sparkle (r3: alpha halved, count trimmed, warm dust tint)
    ctx.fillStyle = 'rgba(148,138,118,0.26)';
    for (let i = 0; i < 20; i++) ctx.fillRect(rng() * S, y + rh * (0.28 + rng() * 0.1), 5 + rng() * 14, 3);
    // mud/rust — heavier, the run should read dragged through earth
    ctx.fillStyle = 'rgba(92,70,44,0.32)';
    for (let i = 0; i < 52; i++) {
      ctx.beginPath(); ctx.arc(rng() * S, y + rng() * rh, 2 + rng() * 8, 0, Math.PI * 2); ctx.fill();
    }
  }
  return c;
}

// Transparent marking decal canvases.
function paintDecal(kind, text, marking) {
  const c = makeCanvas(256, 256);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  if (kind === 'insignia') {
    drawNationalInsignia(ctx, marking.insignia, 128, 128, 210);
  } else if (kind === 'designation') {
    const draw = () => {
      ctx.clearRect(0, 0, 256, 256);
      drawTacticalNumber(ctx, marking, { x: 2, y: 34, width: 252, height: 188 });
    };
    draw();
    if (document.fonts && !document.fonts.check("bold 16px 'ABC Monument Grotesk'")) {
      document.fonts.ready.then(draw).catch(() => {});
    }
  } else if (kind === 'star') {
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
    // Balkenkreuz REDRAW (tank_models r4 — critic: "malformed brackets
    // instead of an outlined cross"): the r2 open form's 8 disconnected
    // flange rectangles never read as a cross at any distance. This is the
    // classic 1943 vehicle form: BLACK straight-armed cross core with a
    // white outline border on every edge (including the arm ends). The dark
    // core stays far under the bloom knee, and the white border area is
    // smaller than the old solid cross, so the r2 "glowing sticker" concern
    // stays solved; white clamped to ~0.78 luma worn paint.
    const W = 'rgba(201,197,186,0.94)';
    const K = 'rgba(30,30,28,0.92)';
    const S0 = 38, S1 = 218;   // cross arm span
    const a0 = 97, a1 = 159;   // arm thickness band (62 px)
    const b = 15;              // white border width
    // white cross (full size)
    ctx.fillStyle = W;
    ctx.fillRect(S0, a0, S1 - S0, a1 - a0);
    ctx.fillRect(a0, S0, a1 - a0, S1 - S0);
    // black core cross (inset by the border on every edge)
    ctx.fillStyle = K;
    ctx.fillRect(S0 + b, a0 + b, S1 - S0 - 2 * b, a1 - a0 - 2 * b);
    ctx.fillRect(a0 + b, S0 + b, a1 - a0 - 2 * b, S1 - S0 - 2 * b);
    // deterministic wear nicks so it reads as brushed-on field paint
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 20; i++) {
      const px2 = S0 + ((i * 73) % 97) / 97 * (S1 - S0);
      const py2 = S0 + ((i * 41) % 89) / 89 * (S1 - S0);
      ctx.globalAlpha = 0.3 + ((i * 29) % 45) / 100;
      ctx.beginPath();
      ctx.arc(px2, py2, 1.2 + ((i * 17) % 26) / 10, 0, Math.PI * 2);
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
    // font mandate: hull numbers bake in Inter. The canvas holds nothing but
    // this text, so a clear + redraw on fonts.ready is loss-free if the decal
    // baked before the webfont resolved (decal() flips needsUpdate).
    const drawText = () => {
      ctx.clearRect(0, 0, 256, 256);
      ctx.font = `bold ${Math.min(120, Math.floor(380 / len))}px 'ABC Monument Grotesk', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 10;
      ctx.strokeStyle = 'rgba(20,20,20,0.55)';
      ctx.strokeText(text || '', 128, 128);
      // ~0.68 gray, not near-white: at 200-400 m white hull numbers resolved to
      // single blown pixels scattered across the midfield (r2 terrain critique).
      ctx.fillStyle = 'rgba(174,172,162,0.92)';
      ctx.fillText(text || '', 128, 128);
    };
    drawText();
    if (document.fonts && !document.fonts.check("bold 16px 'ABC Monument Grotesk'")) {
      document.fonts.ready.then(drawText).catch(() => {});
    }
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

function sharedTextureIdentity(specId, selection = null) {
  if (selection == null) return { key: specId, patternId: resolveCamoPattern(specId), fixed: false };
  const patternId = resolveMultiplayerCamoPattern(specId, selection);
  return { key: `${specId}::${patternId}`, patternId, fixed: true };
}

// PERF (performance_budget r3): per-spec bake quality tiers. The generated
// set (2048² albedo + 2x 1024² data maps ≈ 35 MB with mips) is hero-grade
// texel density for a vehicle the camera orbits at 4-6 m — the final garage
// pedestal upgrade. Player previews use the next tier during battle entry;
// AI roster vehicles are viewed at
// 20-500 m where even a 512²/256² set exceeds their normal projected size, yet a
// full battle held 5-7 hero sets (scene texture estimate 666-685 MB vs the
// FROZEN 512 MB gate) and each boot-path bake burned 250-350 ms of 2048²
// canvas painting. The painters are all canvas.width-relative, so lower
// tiers retain the identical feature plan; if the player later selects a
// cached spec, bakeSharedCanvases repaints the SAME canvases in place at full
// size — live materials update through texture.needsUpdate, exactly like
// the camo repaint path below.
const QUALITY_SIZES = {
  high: { albedo: ALBEDO_SIZE, map: MAP_SIZE },
  // Garage previews and authored close-up contracts retain the former AI
  // tier. Ordinary battle bots rarely exceed ~150 screen pixels, so their
  // backing maps use the lower tier below; 1024/512 there oversampled the
  // projection while making every roster build a visible long task.
  preview: { albedo: ALBEDO_SIZE / 2, map: MAP_SIZE / 2 },
  ai: { albedo: ALBEDO_SIZE / 4, map: MAP_SIZE / 4 },
  // World dressing bakes a live tank only long enough to collapse its posed
  // geometry into vertex-coloured static wreck meshes; none of these maps
  // ever render. wrecks.js has requested `low` since its introduction, but
  // the missing tier silently fell through to hero 2048/1024. Keep the
  // painter contract with a tiny transient set; wrecks.js discards every
  // texture after collapsing the posed model to vertex-coloured geometry.
  low: { albedo: 256, map: 128 },
};

export function normalizeMaterialTextureQuality(quality) {
  return Object.prototype.hasOwnProperty.call(QUALITY_SIZES, quality) ? quality : 'high';
}

export function materialTextureDimensions(quality) {
  const sizes = QUALITY_SIZES[normalizeMaterialTextureQuality(quality)];
  return { albedo: sizes.albedo, map: sizes.map };
}

function bakeSharedCanvases(entry, quality) {
  const g = bakeSharedCanvasesSteps(entry, quality);
  let r = g.next();
  while (!r.done) r = g.next();
}

// perf-r4b (play-session 'Painting vehicles' rows): the one-call family bake
// was a 0.3-4.7 s painter atom behind the loading bar. The generator yields
// between painter stages so the pre-battle prebake path can breathe; the sync
// wrapper above drains it whole — every existing caller (acquire, hero
// upgrade) is byte-identical, same rng draw order.
function* bakeSharedCanvasesSteps(entry, quality) {
  // Tier scale is applied at the one place every shared vehicle bake sizes
  // itself; burnt/ember/camo repaints all derive from these canvases.
  const szq = QUALITY_SIZES[normalizeMaterialTextureQuality(quality)];
  // Preserve extra texels only for the selected/close vehicle. Distant AI is
  // already authored at its own compact tier and remains on the stricter
  // world scale so a 14-tank entry does not multiply paint time or residency.
  const textureClass = quality === 'high' || quality === 'preview'
    ? 'vehicle' : 'world';
  const sz = {
    albedo: texSize(szq.albedo, textureClass),
    map: texSize(szq.map, textureClass),
  };
  const { spec, seed } = entry;
  // Welded-composite hulls draw no rivet/bolt rows.
  const vis = { ...resolveCamoVisual(spec, entry.patternId), modernWelds: isPostwarVehicleEra(spec.era) };
  const rng = mulberry32(seed);
  entry.feats = genPlateFeatures(rng);
  // tank_models r5 ("hull sides show a grid of panel seams on what are single
  // plates"): big single-plate hulls (Tiger) opt out of the tiled panel-join
  // grid entirely — rings/chips/streak weathering stay, the repeating
  // hLine/vLine lattice goes.
  if (vis.plateLines === false || spec.visual.plateLines === false) {
    entry.feats.hLines = [];
    entry.feats.vLines = [];
  }
  entry.camoCanvas.width = entry.camoCanvas.height = sz.albedo;
  paintCamo(entry.camoCanvas, vis, rng, entry.feats, seed);
  yield;
  exposureTrim(entry.camoCanvas);
  yield;
  const heightCanvas = paintHeight(makeCanvas(sz.map, sz.map), vis, rng, entry.feats, seed);
  yield;
  const normalSrc = yield* heightToNormalSteps(heightCanvas, vis.zimmerit ? 2.6 : 2.6);
  yield;
  entry.normalCanvas.width = entry.normalCanvas.height = sz.map;
  entry.normalCanvas.getContext('2d').drawImage(normalSrc, 0, 0, sz.map, sz.map);
  entry.roughCanvas.width = entry.roughCanvas.height = sz.map;
  paintRoughness(entry.roughCanvas, rng, entry.feats);
  yield;
  // camo_spotting r4: per-patch paint response rides the pattern (see
  // paintPatchRoughness) — repainted with the albedo on pattern switches.
  paintPatchRoughness(entry.roughCanvas, entry.camoCanvas, vis);
  entry.quality = quality;
}

function acquireSharedTextures(spec, aniso, quality = 'high', selection = null) {
  const identity = sharedTextureIdentity(spec.id, selection);
  const { key } = identity;
  let entry = TEX_CACHE.get(key);
  if (!entry) {
    const { patternId } = identity;
    const seed = 0x5eed ^ (key.split('').reduce((a, ch) => (a * 33 + ch.charCodeAt(0)) | 0, 7));
    entry = {
      refs: 0,
      // CAMO PATTERN SECTION: kept so applyCamoPatterns() can repaint the
      // shared albedo in place (all live instances update through the texture).
      // paintable: per-instance solid-color materials (road-wheel dishes,
      // fittings) that must follow the scheme on repaint (r1: lime-green
      // wheels under winter whitewash).
      cacheKey: key, fixedPattern: identity.fixed, spec, seed, feats: null, patternId, paintable: new Set(),
      quality,
      camoCanvas: makeCanvas(4, 4),
      normalCanvas: makeCanvas(4, 4),
      roughCanvas: makeCanvas(4, 4),
      trackCanvas: paintTrack(mulberry32(seed + 17)),
    };
    bakeSharedCanvases(entry, quality);
    entry.camoTex = canvasTex(entry.camoCanvas, { aniso, repeat: true });
    entry.normalTex = canvasTex(entry.normalCanvas, { srgb: false, aniso, repeat: true });
    entry.roughTex = canvasTex(entry.roughCanvas, { srgb: false, aniso, repeat: true });
    TEX_CACHE.set(key, entry);
  } else if (isMaterialTextureQualityUpgrade(entry.quality, quality)) {
    // in-place hero upgrade (garage selection of an AI-baked spec)
    upgradeEntry(entry, quality);
  }
  entry.refs++;
  return entry;
}

// camo r8 REPAINT BUG (audit finding: "tiger1 never repaints — hull kept the
// factory bake through every picker click while its wheels re-tinted"): the
// ai->high upgrade RESIZES the backing canvases (1024->2048 albedo,
// 512->1024 maps). The WebGL2 texture was allocated with IMMUTABLE storage
// (texStorage2D) at the old dimensions, so every post-resize needsUpdate
// re-upload fails silently (GL error, GPU keeps the stale bake) — the
// upgrade itself AND every later repaintEntry appeared to do nothing on any
// spec that had been AI-baked first (pedestal LRU heroes, staged bots).
// dispose() drops the GL object so the next bind re-allocates at the new
// size; the THREE.Texture object identity is untouched, so every live
// material keeps working.
const QUALITY_RANK = { low: -1, ai: 0, preview: 1, high: 2 };
export function isMaterialTextureQualityUpgrade(current, requested) {
  return QUALITY_RANK[normalizeMaterialTextureQuality(requested)]
    > QUALITY_RANK[normalizeMaterialTextureQuality(current)];
}
function upgradeEntry(entry, quality = 'high') {
  bakeSharedCanvases(entry, quality);
  finalizeEntryResize(entry);
}

/** Post-resize texture ritual shared by the sync hero upgrade and the chunked
 * prebake upgrade (see the camo r8 immutable-storage note above). */
function finalizeEntryResize(entry) {
  entry.camoTex.dispose();
  entry.normalTex.dispose();
  entry.roughTex.dispose();
  entry.camoTex.needsUpdate = true;
  entry.normalTex.needsUpdate = true;
  entry.roughTex.needsUpdate = true;
  // burnt/ember derive from the albedo — rebuild lazily at next wreck
  if (entry.burntTex) { entry.burntTex.dispose(); entry.burntTex = null; }
  if (entry.emberTex) { entry.emberTex.dispose(); entry.emberTex = null; }
}

/**
 * perf-r4b: bake (or upgrade) a spec's shared texture entry BEFORE the visual
 * build acquires it, yielding between painter stages — the pre-battle
 * 'Painting vehicles' loop awaits this per roster tank so a 2048² family bake
 * stops being a 0.3-4.7 s atomic task under the loading bar. The subsequent
 * acquireSharedTextures call is then a pure cache hit. Refcounts unchanged
 * (a prebaked-but-never-acquired entry behaves exactly like a released one).
 * @param {object} spec TankSpec
 * @param {number} aniso engineCtx.anisotropy
 * @param {string} quality 'ai' | 'preview' | 'high' — must match what the build will ask
 * @param {?function(): (Promise<void>|void)} tick awaited between stages
 */
export async function prebakeSharedTextures(spec, aniso, quality = 'ai', tick = null, selection = null) {
  const identity = sharedTextureIdentity(spec.id, selection);
  const { key } = identity;
  const run = async (g) => {
    let r = g.next();
    while (!r.done) {
      if (tick) await tick();
      r = g.next();
    }
  };
  let entry = TEX_CACHE.get(key);
  if (entry) {
    // mirror acquire's only upgrade case; anything else is already adequate
    if (isMaterialTextureQualityUpgrade(entry.quality, quality)) {
      await run(bakeSharedCanvasesSteps(entry, quality));
      finalizeEntryResize(entry);
    }
    return;
  }
  const { patternId } = identity;
  const seed = 0x5eed ^ (key.split('').reduce((a, ch) => (a * 33 + ch.charCodeAt(0)) | 0, 7));
  entry = {
    refs: 0,
    cacheKey: key, fixedPattern: identity.fixed, spec, seed, feats: null, patternId, paintable: new Set(),
    quality,
    camoCanvas: makeCanvas(4, 4),
    normalCanvas: makeCanvas(4, 4),
    roughCanvas: makeCanvas(4, 4),
    trackCanvas: paintTrack(mulberry32(seed + 17)),
  };
  await run(bakeSharedCanvasesSteps(entry, quality));
  entry.camoTex = canvasTex(entry.camoCanvas, { aniso, repeat: true });
  entry.normalTex = canvasTex(entry.normalCanvas, { srgb: false, aniso, repeat: true });
  entry.roughTex = canvasTex(entry.roughCanvas, { srgb: false, aniso, repeat: true });
  TEX_CACHE.set(key, entry);
}

/**
 * Upgrade a live spec's shared bake from the AI tier to hero quality without
 * blocking one frame. Live materials retain the old bake until finalization.
 * re-bake to 'high' was a ~0.9 s ATOM landing ~350 ms after every pedestal
 * reveal of an 'ai'-baked spec (owner: "switching between tanks laggy").
 * Yields between painter stages; live materials keep showing the 'ai' bake
 * until the finalize flips the textures.
 * @param {string} specId spec whose cached entry should be re-baked
 * @param {?function(): (Promise<void>|void)} tick awaited between stages
 * @returns {Promise<boolean>} true when an upgrade ran
 */
export async function upgradeSharedTexturesChunked(specId, tick = null) {
  const entry = TEX_CACHE.get(specId);
  if (!entry || entry.refs <= 0 || entry.quality === 'high') return false;
  const g = bakeSharedCanvasesSteps(entry, 'high');
  let r = g.next();
  while (!r.done) {
    if (tick) await tick();
    r = g.next();
  }
  finalizeEntryResize(entry);
  return true;
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

function releaseSharedTextures(shared) {
  const entry = shared && TEX_CACHE.get(shared.cacheKey);
  if (!entry) return;
  if (--entry.refs <= 0) {
    entry.camoTex.dispose();
    entry.normalTex.dispose();
    entry.roughTex.dispose();
    if (entry.burntTex) entry.burntTex.dispose();
    if (entry.emberTex) entry.emberTex.dispose();
    if (entry.kitTex) entry.kitTex.dispose();
    TEX_CACHE.delete(entry.cacheKey);
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
  const g = burntBakeSteps(entry, aniso);
  let r = g.next();
  while (!r.done) r = g.next();
}

/**
 * perf-r5: chunked burnt/ember prebake for one spec — the char bake is a
 * 150-900 ms painter atom that otherwise lands on the warm dance (or, for
 * drain-deadline stragglers, inside the COUNTDOWN). The warm pipeline
 * yield*s this per fielded family so each stage gets its own slice; the
 * kill-time ensureBurntTextures path then always hits the cache.
 * @param {string} specId @param {number} aniso
 */
export function* prebakeBurntSteps(specId, aniso, selection = null) {
  const entry = TEX_CACHE.get(sharedTextureIdentity(specId, selection).key);
  if (!entry || entry.burntTex) return;
  yield* burntBakeSteps(entry, aniso);
}

function* burntBakeSteps(entry, aniso) {
  if (entry.burntTex) return;
  const S = texSize(1024); // transient wreck treatment keeps the world-scale budget
  const cv = makeCanvas(S, S);
  const ctx = cv.getContext('2d');
  ctx.drawImage(entry.camoCanvas, 0, 0, S, S);
  // char the paint toward scorched near-black, camo faintly readable under it
  // char levels lifted (multiply #5a5049 + 0.42 near-black overlay -> #7d7268
  // + 0.28): the old stack pushed the wreck albedo to ~0.06 and the hull read
  // as a light-swallowing pure-black silhouette within 2 s of the kill (r6).
  // The wreck must stay CHARRED but keep readable camo/panel structure and
  // catch sun/fire rim light.
  // effects_combat r5 (critic critical: "wreck albedo so dark it reads as a
  // black hole against sunlit grass — zero deck detail, no charred browns/
  // ash grays"): char stack lifted again (#6e645c*0.34 -> #877c70*0.22).
  // The wreck must read as charred UMBER/ASH steel in sunlight — the
  // turret/hull silhouettes have to separate tonally or the kill reads as
  // a turretless cutout.
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = '#877c70';
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(28,25,21,0.22)';
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
  yield; // char stack composited
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
  yield; // soot blotches done
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
  // effects_combat r6 (critic minor: "wreck road wheels show salmon/pink
  // rims"): the warm rust blobs — multiplied by the burnt material's 1.5
  // color lift and lit by the warm sun/blast light — tone-mapped to salmon
  // on curved rims. Red channel dropped ~40% toward grey-brown scorch.
  for (let i = 0; i < 26; i++) {
    const x = rng() * S, y = rng() * S, r = (0.02 + rng() * 0.07) * S;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(84,58,38,${0.14 + rng() * 0.14})`);
    g.addColorStop(0.6, `rgba(66,48,32,${0.07 + rng() * 0.08})`);
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
  yield; // streaks/rust/scrapes painted
  entry.burntTex = canvasTex(cv, { aniso, repeat: true });
  yield; // burnt albedo uploaded-ready; ember canvas next
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
// rebuilding geometry. A pattern grants the small concealment bonus (see
// src/sim/spotting.js CAMO_PAINT_BONUS) only when it MATCHES the active
// battlefield biome — hasCamoPaint() below; AUTO always matches.
// ===========================================================================

// camo r8: the picker grew from 6 to 16 patterns. ORDER CONTRACT: the first
// six ids stay exactly as shipped — tools (spotting-check) click by index and
// players' persisted picks key by id. New ids append after 'digital', grouped
// by season family (green field / desert / winter / urban / style-only).
// camo r2 (expansion round): 16 -> 29. Same append-only contract — the r8
// block keeps its exact order, the r2 block appends after 'dazzle' grouped
// the same way (green field / desert / winter / urban / autumn / style-only).
const CAMO_LS_PREFIX = 'cot.camo.';
const CUSTOM_CAMO_LS_PREFIX = 'cot.camoCustom.v1.';
// 'urban' is an INTERNAL pattern id (gray digital) reachable only through
// AUTO biome resolution — a green flecktarn in a gray rubble city defeated
// the point of biome matching (r1). Direct picker selection keeps the
// nation-flavored green 'digital'.
// camo r8: the map roster grew to eight — every mapId resolves AUTO to the
// scheme that matches its dominant field: Amberford (autumn) wears the new
// autumn blotch, Saltmere Bay's green headlands stay summer (a parade of
// grey-blue AUTO bots on grass would defeat biome matching — naval is the
// deliberate coastal pick, see PATTERN_SEASON), hay-gold Tarkhan Steppe
// reads tan (desert family), Cinder Junction is industrial grey (urban).
// Unknown mapIds still fall back to verdant inside setCamoBiome.
// camo r2 (expansion round): each biome now carries a POOL of matching
// schemes and AUTO resolves to a per-spec deterministic pick (hash of
// specId+biome, see resolveCamoPattern) — an AUTO battle roster wears varied
// but always biome-appropriate paint instead of one parade scheme (the r5
// bot-biome-camo intent, extended). Element 0 stays the r8 canonical scheme.
// EVERY pool member must belong on its biome field — the coastal pool stays
// green-family for exactly the r8 reason above.
const BIOME_PATTERN = {
  verdant: ['summer', 'flecktarn', 'amoeba', 'dpm', 'tigerstripe', 'merdc'],
  desert: ['desert', 'chocchip', 'digitaldesert', 'pinkdesert'],
  winter: ['winter', 'washworn', 'winterbands', 'merdcwinter'],
  urban: ['urban', 'urbanblock', 'berlin'],
  autumn: ['autumn', 'oakleaf'],
  coastal: ['summer', 'dpm', 'merdc'],
  steppe: ['desert', 'digitaldesert', 'chocchip'],
  railyard: ['urban', 'urbanblock', 'berlin'],
};
let activeBiome = 'verdant';

/** Persisted camo pattern selection for a tank ('factory' when unset). */
export function getCamoSelection(specId) {
  try {
    const v = localStorage.getItem(CAMO_LS_PREFIX + specId);
    if (isBuiltInCamoId(v)) return v;
    if (v === CUSTOM_CAMO_ID && localStorage.getItem(CUSTOM_CAMO_LS_PREFIX + specId)) {
      return CUSTOM_CAMO_ID;
    }
    return 'factory';
  } catch (e) { return 'factory'; }
}

/** Persist a camo pattern selection for a tank. */
export function setCamoSelection(specId, patternId) {
  if (!isBuiltInCamoId(patternId)) return;
  try { localStorage.setItem(CAMO_LS_PREFIX + specId, patternId); } catch (e) { /* private mode */ }
}

/** Device-local custom painter settings for one vehicle. */
export function getCustomCamoSelection(specId) {
  try {
    const value = JSON.parse(localStorage.getItem(CUSTOM_CAMO_LS_PREFIX + specId) || 'null');
    return normalizeCustomCamo(value);
  } catch (_) { return normalizeCustomCamo(); }
}

/** Save and activate a custom pattern. It is intentionally never match-safe. */
export function setCustomCamoSelection(specId, value) {
  const next = normalizeCustomCamo(value);
  try {
    localStorage.setItem(CUSTOM_CAMO_LS_PREFIX + specId, JSON.stringify(next));
    localStorage.setItem(CAMO_LS_PREFIX + specId, CUSTOM_CAMO_ID);
  } catch (_) { /* private mode */ }
  return next;
}

/** Public lobby/ranked selection; custom local paint degrades to Factory. */
export function getMultiplayerCamoSelection(specId) {
  return networkCamoId(getCamoSelection(specId));
}

// BOT BIOME CAMO (camo_spotting r5): runtime per-spec pattern overrides.
// AI roster tanks kept factory green on snow/dunes while the player's AUTO
// paint matched the biome — fields of parade-green bots flagged the maps as
// artificial (critic minor). state.js setupBattle rolls a per-battle chance
// per NON-PLAYER participant and points its spec here (usually at 'auto',
// which tracks the active biome); the garage picker and localStorage are
// untouched, so the player's own selections never see these. The player's
// spec is never overridden — setupBattle only rolls for bots, and a spec id
// appears at most once per battle (entities are keyed by spec id).
const CAMO_OVERRIDE = new Map(); // specId -> patternId ('auto' allowed)
export function setCamoOverride(specId, patternId) {
  if (patternId == null) { CAMO_OVERRIDE.delete(specId); return; }
  if (isBuiltInCamoId(patternId) || patternId === 'urban') {
    CAMO_OVERRIDE.set(specId, patternId);
  }
}
export function clearCamoOverrides() { CAMO_OVERRIDE.clear(); }

/** Point 'auto' selections at a battlefield biome (call before a battle). */
export function setCamoBiome(mapId) {
  activeBiome = BIOME_PATTERN[mapId] ? mapId : 'verdant';
}

/** Concrete pattern id for a tank right now ('auto' resolved per biome). */
function resolveCamoPattern(specId) {
  const sel = CAMO_OVERRIDE.get(specId) || getCamoSelection(specId);
  if (sel === CUSTOM_CAMO_ID) return customCamoPatternId(getCustomCamoSelection(specId));
  if (sel !== 'auto') return sel;
  // camo r2: deterministic per-(spec, biome) pick from the biome pool — the
  // same tank always resolves the same scheme on the same map (garage AUTO
  // preview, battle paint and repaint caching all agree), while a roster of
  // AUTO tanks fans out across the pool.
  const pool = BIOME_PATTERN[activeBiome];
  let h = 0;
  const key = `${specId}:${activeBiome}`;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return pool[(h >>> 0) % pool.length];
}

/** Resolve a match-owned built-in choice without consulting local storage. */
function resolveMultiplayerCamoPattern(specId, selection) {
  const safe = networkCamoId(selection);
  if (safe !== 'auto') return safe;
  const pool = BIOME_PATTERN[activeBiome];
  let h = 0;
  const key = `${specId}:${activeBiome}`;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return pool[(h >>> 0) % pool.length];
}

// camo r8: season tags per pattern (WoT model — the paint bonus needs the
// camo SEASON to match the map biome, not the exact auto pattern). For the
// original six this is behavior-identical to the old `pat ===
// BIOME_PATTERN[activeBiome]` check (summer<->verdant, desert<->desert,
// winter<->winter, internal urban<->urban; digital never matched and still
// never does). New schemes join the family their palette belongs to, so a
// hand-picked MERDC earns the bonus on grass exactly like 'summer' does,
// desert-family paints earn on the hay-gold steppe, urban paints in the
// railyard, and 'naval' has its niche on the coastal map. Style-only schemes
// (digital, dazzle, splinter, ambushdot — dun/grey paints with no clear
// biome) never qualify, like 'digital' always behaved.
const PATTERN_SEASON = {
  summer: ['verdant', 'coastal'], merdc: ['verdant', 'coastal'], tropic: ['verdant'],
  desert: ['desert', 'steppe'], pinkdesert: ['desert', 'steppe'],
  winter: ['winter'], washworn: ['winter'],
  urban: ['urban', 'railyard'], urbanblock: ['urban', 'railyard'],
  autumn: ['autumn'], naval: ['coastal'],
  // camo r2 expansion — each new scheme joins its palette's family (the r8
  // rule). hexfield/midnight are style-only (no clear biome) and never
  // qualify, exactly like digital/dazzle/splinter/ambushdot.
  flecktarn: ['verdant'], amoeba: ['verdant'], dpm: ['verdant', 'coastal'],
  tigerstripe: ['verdant'], m90: ['verdant'],
  chocchip: ['desert', 'steppe'], digitaldesert: ['desert', 'steppe'],
  merdcwinter: ['winter'], winterbands: ['winter'],
  berlin: ['urban', 'railyard'], oakleaf: ['autumn'],
};

/**
 * True when the tank's resolved pattern MATCHES the active battlefield biome
 * (spotting camo paint bonus — state.js getCamoBonus consumes this).
 * camo_spotting r3: WoT grants the paint bonus only when the camo season
 * matches the map type — that is what makes AUTO strategically meaningful.
 * AUTO always qualifies: it resolves to a member of the
 * BIOME_PATTERN[activeBiome] pool, and the second clause below grants pool
 * members on their own biome even where the biome is not in the pattern's
 * season list (a green-grass coastal map auto-resolves inside the green
 * pool; the pick must still earn its +3.5%).
 * A mismatched manual pick (winter paint on the desert map) still repaints
 * the tank but earns no concealment bonus; 'factory' never qualifies.
 */
export function hasCamoPaint(specId) {
  const pat = resolveCamoPattern(specId);
  if (pat === 'factory') return false;
  // second clause: pool membership (camo r2 — BIOME_PATTERN rows are pools
  // now). AUTO always resolves to a pool member, so AUTO always qualifies;
  // a hand-picked pool scheme earns on its own biome the same way.
  return (PATTERN_SEASON[pat] || []).includes(activeBiome)
    || (BIOME_PATTERN[activeBiome] || []).includes(pat);
}

// Nation-flavored palettes. Marking/number/zimmerit/camoScale stay authored —
// only scheme/base/weather/patches are overridden, so the plate-feature and
// weathering layers (painted by paintCamo on top) are fully respected.
// Per-model corrections for already-distinct authored factory schemes. Plain
// green factory visuals are handled by factoryThemePatternId(), so they never
// need one-off palette exceptions here.
const FACTORY_OVERRIDE = {
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
  // camo_spotting r3 (critic: t90m factory "flat parade clay"): the authored
  // weather '#4a5c42' sat too close to the '#3f5138' base for the tonal
  // layer to register — the hull rendered as one unmodulated green. Weather
  // pushed toward sun-faded dusty olive (clearly lighter, slightly warmer)
  // so the tonal/mottle passes + the new solid-scheme weathering block in
  // paintCamo read at garage range; base stays the roster-doc forest green.
  t90m: { weather: '#5d6549' },
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
  const custom = parseCustomCamoPatternId(patternId);
  if (custom) {
    const base = hexToRgb(custom.base);
    const weather = scale3(base, 1.10).map((channel) => Math.min(255, channel));
    const scheme = custom.style === 'blotch' ? 'nato' : custom.style;
    return {
      ...v,
      scheme,
      base: custom.base,
      weather: `#${weather.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`,
      patches: [custom.colorA, custom.colorB],
      // Higher repeat means smaller, more frequent shapes on the hull.
      camoScale: 0.72 - (custom.repeat / 100) * 0.47,
      patternRepeat: custom.repeat,
      drawStrokes: custom.strokes,
      drawRepeatX: custom.repeatX,
      drawRepeatY: custom.repeatY,
      drawRotation: custom.rotation,
      drawMirror: custom.mirror,
    };
  }
  if (patternId === 'factory') {
    const fo = FACTORY_OVERRIDE[spec.id];
    const authored = fo ? { ...v, ...fo } : v;
    const themedPattern = factoryThemePatternId({ ...spec, visual: authored });
    return themedPattern
      ? patternVisual({ ...spec, visual: authored }, themedPattern)
      : authored;
  }
  let o = null;
  if (patternId === 'summer') {
    // brown dropped toward NATO chocolate — '#54402e' flared orange under
    // the warm garage key (r7); r8 pulls it further off red ('#4c3a2a' still
    // leaned warm on the WW2 Dunkelgelb hulls next to Hinterhalt references)
    // r1: black patch albedo floor lifted #26291f -> #2e2e2e — the old tone
    // clipped to unlit pure black under any key (critic: "NATO black patches
    // clip to pure black with zero material response").
    // camo_spotting r3: red-brown desaturated/cooled another step ('#46392b'
    // sat 0.39 drifted pinkish/salmon on WWII turrets under the warm garage
    // key — t34_85 summer turret critique); '#423a30' keeps the earth-brown
    // read at sat ~0.27 without the red flare.
    // camo_spotting r4 (critic: T-34-85 'summer' "reads as faded/winterized
    // MERDC rather than a Soviet summer scheme where 4BO green should
    // dominate"): USSR/Russia vehicles get a 4BO-dominant summer — green
    // field base with a darker green shadow tone and one muted earth accent
    // (the NATO black chip is a Western signature). Other nations keep the
    // NATO 3-color, pulled a half-step deeper with the m1a2 factory greens.
    // camo_spotting r6 (critic: m1a2 summer "reads monotone olive at mid
    // distance, black component underweighted"): black '#2e2e2e'->'#292929'
    // and brown '#423a30'->'#3e352a' — one value step down each so both
    // pattern tones separate from the green base at 50-150 m. Still well off
    // the '#26291f' floor that clipped to unlit pure black (r1); the m1a2's
    // Keep the Tiger's already-good summer patch geometry unchanged.
    if (spec.nation === 'USSR' || spec.nation === 'Russia') {
      o = { scheme: 'nato', base: '#4a5638', weather: '#556042', patches: ['#333d2a', '#4a3f2e'] };
    } else {
      o = { scheme: 'nato', base: '#49543e', weather: '#545f47', patches: ['#292929', '#3e352a'] };
    }
  } else if (patternId === 'desert') {
    // 3-tone hard-edged desert geometry (scheme 'desert' in paintCamo):
    // patches = [dark shadow tan, mid earth, pale sand highlight].
    // Widened lightness split (r6: the old tones mipped to a uniform tan
    // wash at garage distance — the geometry has to survive at 12 m).
    // r9: highlight pulled down '#e4d3a8' -> '#d3bf92' — under the warm
    // garage key the old chip blew out toward pure white on tiger1/strv103/
    // m1a2 and the scheme read as high-contrast "chocolate chip" dazzle
    // (coverage is also trimmed ~25% in the desert painter above).
    // camo_spotting r6 (critic: m1a2 desert "near-white cream blobs against
    // mid-brown ... read as dazzle/giraffe patches rather than a low-contrast
    // military desert scheme"): the AUTHORED ladder is now the ON-TEXTURE
    // ladder — the painter's darkHC 0.74x push and paleHC white lift are
    // retired (they widened the delta the palette had just been tuned to).
    // pale '#d3bf92'->'#cbb489' (sand, not cream) and dark '#6b5136'->
    // '#7a5f43' land an even ~26-step luma ladder (100/126/151/182): the
    // pale-vs-dark delta drops ~39% to Sinai-scheme territory while all four
    // tones still separate at garage distance.
    o = { scheme: 'desert', base: '#b09466', weather: '#c4ad7d', patches: ['#7a5f43', '#947c52', '#cbb489'] };
  } else if (patternId === 'winter') {
    // r8: base dropped off near-white — '#c4c8bf' blew out to a featureless
    // white mass under the garage key (r7 winter critique); a worn grey-green
    // whitewash keeps panel definition and stays inside matte-paint range.
    // r10 (critic: winter still blew out to unlit near-white on the M1A2):
    // base clamped into the ~0.62 dirty-whitewash band — real winter wash is
    // chalky grey over dark paint, never near-white; the painter adds worn
    // base bleed + ochre grime (see the winter scheme in paintCamo).
    // camo_spotting r5 (critic MAJOR: the wash was authored WARM — '#9ba18f'
    // is a green-yellow grey that the warm garage key pushed to cream/tan,
    // and the AUTO T-90M read ivory against the cool blue snow): base and
    // weather cooled ~15-20 units toward neutral/blue-grey at the SAME luma
    // (#9ba18f -> #99a1a2, B +19 / R −2), so under a warm key the wash lands
    // on neutral chalk-white and on the winter field it sits inside the
    // snow's cool cast. The painter's stroke/grime tones cool with it.
    o = { scheme: 'winter', base: '#99a1a2', weather: '#7b8384', patches: [v.base || '#4b5320'] };
  } else if (patternId === 'urban') {
    // biome-resolved only (see BIOME_PATTERN): urban gray 3-tone.
    // History: r7 found pure concrete gray alien on the green approach
    // fields, r4 pulled it toward moss — and the r5 critic showed the moss
    // hybrid GRADES OUT TO OLIVE under the town map's warm/green grade (a
    // player T-90M turret crop read near-identical to 'summer', defeating
    // the biome-specific scheme). The palette is now TRUE NEUTRAL GRAY:
    // green-channel bias killed (|G−B| <= 3 on every tone vs 12-21 before)
    // and the luminance ladder widened (dark 56 / base 95 / light 133) so
    // the scheme still separates from summer after the map grade pushes it
    // warm. The opening-meadow mismatch is accepted — an urban scheme's job
    // is the town core, and AUTO's +3.5% is a sim bonus, not a promise the
    // paint works on grass.
    o = { scheme: 'nato', base: '#5d605e', weather: '#6a6d6a', patches: ['#36383a', '#838685'] };
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
  } else if (patternId === 'merdc') {
    // MERDC US 4-color (Summer Verdant table): forest-green field + light
    // green second dominant, sand + black accents. Light green kept muted
    // ('#5f6a4c' family — the calibrated factory-patch value from the m1a2
    // work) so the warm garage key can't push it minty; sand sits a step
    // under the desert mid so it reads accent, never highlight bloom.
    o = { scheme: 'merdc', base: '#44513a', weather: '#4e5b41',
      patches: ['#5f6a4c', '#8f8259', '#2b2e28'] };
  } else if (patternId === 'tropic') {
    // Deep jungle blotch: two greens darker than every 'summer' tone plus a
    // rotted-earth accent — the darkest green family in the picker so it
    // separates from summer/merdc at a glance.
    o = { scheme: 'blotch', base: '#3d4a33', weather: '#46543a',
      patches: ['#262f1e', '#535f3c', '#3a3126'] };
  } else if (patternId === 'autumn') {
    // Autumn foliage blotch (pre-staged for the autumn map): faded tan-olive
    // field with rust + olive-brown masses — the only warm-green/orange
    // ladder in the set. Rust kept at '#6e4527' (well under the '#7a4a35'
    // Rotbraun that flared orange in r7) so the warm key reads leaf-brown.
    o = { scheme: 'blotch', base: '#6f6242', weather: '#7c6f4b',
      patches: ['#6e4527', '#4c482e', '#33291d'] };
  } else if (patternId === 'urbanblock') {
    // Selectable urban geometry (Berlin-brigade blocks) — distinct from the
    // AUTO-only 'urban' nato-grey: TRUE NEUTRAL greys (|G-B|<=3, the r5
    // urban lesson — green bias grades to olive under the town map's warm
    // grade) on an architectural rectangle field.
    o = { scheme: 'blocks', base: '#6e716f', weather: '#787b79',
      patches: ['#494c4b', '#8b8d8b', '#303233'] };
  } else if (patternId === 'washworn') {
    // Field whitewash, heavily worn — the campaign-weary sibling of
    // 'winter' (which reads as a maintained wash). Base a step dirtier than
    // winter's '#99a1a2' at the same cool cast (the r5 warm-drift lesson);
    // patches[0] carries the factory paint that shows through, same
    // contract as 'winter'.
    o = { scheme: 'washworn', base: '#8f9694', weather: '#767d7c',
      patches: [v.base || '#4b5320'] };
  } else if (patternId === 'pinkdesert') {
    // British desert pink (Caunter-family): stone-pink base under parallel
    // slate blue-grey + dark earth diagonals. Pink kept at sat ~0.25 so the
    // warm key lands on dusty stone, not salmon (the r3 salmon lesson).
    o = { scheme: 'caunter', base: '#b49a7d', weather: '#c2a98a',
      patches: ['#68757d', '#5c5442'] };
  } else if (patternId === 'splinter') {
    // WWII German Splittertarn: green + red-brown hard wedges over tan.
    // Tones ride the calibrated Hinterhalt family (olivgruen '#4c5a3c'
    // cousin, Rotbraun kept chocolate-dark per the tiger1 r8 lesson).
    o = { scheme: 'splinter', base: '#9c8a5f', weather: '#a89468',
      patches: ['#49573a', '#54372a'] };
  } else if (patternId === 'ambushdot') {
    // Hinterhalt-Tarnung as a PICKER choice (the ambush painter was
    // factory-only on panther_g/tiger1 until now): Dunkelgelb field, RAL
    // 6003/8017 patches — the calibrated panther_g values verbatim.
    o = { scheme: 'ambush', base: '#a08b5e', weather: '#8f7c52',
      patches: ['#5d6334', '#553826'] };
  } else if (patternId === 'naval') {
    // Coastal/naval grey-blue: the 'stripes' sprayed-band painter pinned
    // HORIZONTAL (bandAngle 0.06 ~ sea-line waves) in two blue-greys over
    // mid grey-blue. The only cool-blue family in the picker.
    o = { scheme: 'stripes', base: '#5d666d', weather: '#67707a',
      patches: ['#39434d', '#7d868e'], bandAngle: 0.06 };
  } else if (patternId === 'dazzle') {
    // Angular high-contrast dazzle: near-black / pale grey / slate wedges.
    // Pale chip '#b4bac0' (~luma 183) stays under the 198 composite ceiling
    // and inside the matte band after the 0.86 exposure trim.
    o = { scheme: 'dazzle', base: '#667077', weather: '#5d666d',
      patches: ['#2b2e32', '#b4bac0', '#46525f'] };
  } else if (patternId === 'flecktarn') {
    // camo r2: universal German spot-cluster dapple (the 'fleck' painter was
    // Germany-only through 'digital' until now). Tones sit half a step off
    // the German digital palette — RAL-B-variant field green a touch darker
    // — so a German tank owning both still reads two distinct paints.
    // Brown obeys the RAL 8031 warm-key lesson (sat ~0.25, never orange).
    o = { scheme: 'fleck', base: '#525a45', weather: '#5c644e',
      patches: ['#36452c', '#594b3b', '#2a2d25'] };
  } else if (patternId === 'amoeba') {
    // camo r2: Soviet WW2 kumovka — huge rounded black-green amoebas + a
    // sparse ochre accent over 4BO (the calibrated USSR-summer green family,
    // so the base coat sits exactly where Soviet factory paint already
    // renders well under the garage key).
    o = { scheme: 'amoeba', base: '#4a5638', weather: '#535f41',
      patches: ['#2e3325', '#655a35'] };
  } else if (patternId === 'dpm') {
    // camo r2: UK brush-stroke DPM — green/brown/black strokes over khaki.
    // Brown '#4f3d2c' keeps sat ~0.28 (the r3 salmon lesson); black rides
    // the '#2e2e2e'-family floor so it never clips unlit (r1 lesson).
    o = { scheme: 'brush', base: '#7d7350', weather: '#877d59',
      patches: ['#4c5738', '#4f3d2c', '#2c2e28'] };
  } else if (patternId === 'tigerstripe') {
    // camo r2: SEA gunship tiger stripe — near-black claws + pale khaki
    // interstripes over mid olive. Dark stripe '#272b22' stays a step above
    // the pure-black clip floor; pale '#6c7050' is the calibrated muted
    // khaki family (never minty under the warm key).
    o = { scheme: 'tigerstripe', base: '#4d5340', weather: '#575d47',
      patches: ['#272b22', '#6c7050', '#3b4530'] };
  } else if (patternId === 'm90') {
    // camo r2: Nordic M90-family splinter — the interlocking hard-wedge
    // painter with rainK 0 (no Regenstreifen) and LARGER fields (patchK),
    // in cool Nordic greens: light-green wedges + deep green + cold
    // black-grey over the mid field. The K2/Strv hard-edge crowd.
    o = { scheme: 'splinter', base: '#47523c', weather: '#505b44',
      patches: ['#2b3728', '#26292b', '#5d6852'], rainK: 0, patchK: 1.3 };
  } else if (patternId === 'chocchip') {
    // camo r2: US 6-color desert. Base/bands stay in the calibrated desert
    // tan family; the cookie pale '#c3c7c6' (~luma 197) holds under the 198
    // composite ceiling and lands matte after the 0.86 exposure trim; chips
    // ride the '#2e2e2e'-family black floor, slightly warm.
    o = { scheme: 'chip6', base: '#b39c72', weather: '#c1ab80',
      patches: ['#8a6f4e', '#c7b68c', '#c3c7c6', '#33342f'] };
  } else if (patternId === 'digitaldesert') {
    // camo r2: tan digital (MARPAT-desert counterpart of the green
    // 'digital'). Three-stop tan ladder ~26 luma steps apart (the desert r6
    // even-ladder rule) so the pixel field survives mipping at 12 m without
    // reading as dazzle; same two-scale painter as 'digital'.
    o = { scheme: 'digital', base: '#a8905f', weather: '#b59d6d',
      patches: ['#c6b487', '#7a6041', '#57503f'], digitalCellK: 1.5 };
  } else if (patternId === 'merdcwinter') {
    // camo r2: MERDC Winter Verdant — the 'merdc' two-dominant painter with
    // whitewash carrying the base half and forest green the patch half,
    // sand + black accents. Wash tones sit in winter's cooled neutral band
    // (the r5 warm-drift lesson): '#939a9b' is a step dirtier than winter's
    // '#99a1a2' at the same cool cast.
    o = { scheme: 'merdc', base: '#939a9b', weather: '#7d8486',
      patches: ['#46523e', '#8b7f5c', '#2c2f2a'] };
  } else if (patternId === 'winterbands') {
    // camo r2: field-expedient whitewash BANDS sprayed over the factory
    // green — the streak variant between 'winter' (full maintained wash)
    // and 'washworn' (scrubbed-off wash): broad cool-white sprayed bands
    // with the green showing between. Wash tones cool/neutral (r5 lesson);
    // base is the calibrated NATO-green family so the exposed paint reads
    // like the fleet's own.
    o = { scheme: 'stripes', base: '#43503a', weather: '#4b5842',
      patches: ['#a8adad', '#909698'] };
  } else if (patternId === 'berlin') {
    // camo r2: Berlin Brigade urban blocks — the architectural rectangle
    // painter in the TRUE-COOL ladder: white / blue-grey / mid grey over
    // light grey. The white '#c0c4c7' (~luma 195) holds under the 198
    // ceiling; the blue-grey may bias B>G (the r5 urban lesson only bans
    // GREEN bias, which grades to olive under the town map's warm grade).
    o = { scheme: 'blocks', base: '#9aa0a3', weather: '#8b9195',
      patches: ['#c0c4c7', '#5f6a74', '#7f868c'] };
  } else if (patternId === 'oakleaf') {
    // camo r2: autumn oak-leaf dapple — the 'fleck' cluster painter in the
    // autumn warm ladder (rust kept at the '#6e4527'-family sat that read
    // leaf-brown, not orange, in r7). Distinct from 'autumn' (big soft
    // blotch masses) by texture: leaf-scale dapple clusters.
    o = { scheme: 'fleck', base: '#6b5f40', weather: '#776a49',
      patches: ['#6e4a2b', '#4d4a2e', '#3a2f20'] };
  } else if (patternId === 'hexfield') {
    // camo r2: modern experimental hex mesh (Barracuda-net language) in the
    // muted green-grey family. Style-only — no biome bonus, like digital.
    o = { scheme: 'hexfield', base: '#4b5443', weather: '#535c4a',
      patches: ['#333c30', '#5f6852'] };
  } else if (patternId === 'midnight') {
    // camo r2: night-ops graphite — the 'nato' elongated-patch painter at
    // LOW contrast in near-black greys. Every tone sits at or above the
    // '#26...' floor that still models light (the summer-black lesson);
    // style-only, no biome bonus.
    o = { scheme: 'nato', base: '#33373a', weather: '#3a3e41',
      patches: ['#26292c', '#41464a'] };
  } else if (patternId === 'claude') {
    // camo r3/r5 (owner asks): the HOUSE SCHEME — the Claude Code creature
    // itself, sprinkle to hero scale, in terracotta + slate on weathered
    // ivory (r5 dropped the disruptive field masses: they read as dots).
    // Ivory held at dirty-whitewash luma (the winter near-white blowout
    // lesson), terracotta desaturated a step so the warm garage key can't
    // flare it orange (the summer-brown lesson). Style-only — no biome
    // bonus, like dazzle/midnight.
    o = { scheme: 'claude', base: '#d3ccbc', weather: '#c2b9a7',
      patches: ['#b25a3d', '#3d3b37'] };
  } else if (patternId === 'spark') {
    // camo r4 (owner ask): the Claude spark at hero scale on warm ivory with
    // soft clay washes. Terracotta held a step below the app icon's #d97757
    // so the warm garage key can't flare it orange (the summer-brown
    // lesson). Style-only, no biome bonus.
    o = { scheme: 'spark', base: '#d8cbb5', weather: '#c6b8a0',
      patches: ['#b4593a', '#3a3733'] };
  } else if (patternId === 'ducky') {
    // camo r6 fun set: bath-toy gold on pond gray-blue, slate accents. All
    // ten r6 palettes respect the established ladders — light bases under
    // the ~198 whitewash ceiling, dark bases at or above the '#26' floor.
    o = { scheme: 'ducky', base: '#8798a3', weather: '#7b8c97',
      patches: ['#d9b13f', '#2e3338'] };
  } else if (patternId === 'suits') {
    o = { scheme: 'suits', base: '#d6cdbd', weather: '#c5bba9',
      patches: ['#9e3a3a', '#2b2b2e'] };
  } else if (patternId === 'flames') {
    o = { scheme: 'flames', base: '#292a2e', weather: '#303136',
      patches: ['#a83226', '#d97b35', '#e0b23f'] };
  } else if (patternId === 'leopardprint') {
    o = { scheme: 'leopardprint', base: '#c2a878', weather: '#b39a6c',
      patches: ['#8a5f38', '#2e2a26'] };
  } else if (patternId === 'bolt') {
    o = { scheme: 'bolt', base: '#4a4f57', weather: '#42474e',
      patches: ['#d9b13f', '#26292d'] };
  } else if (patternId === 'stars') {
    o = { scheme: 'stars', base: '#3a4254', weather: '#333b4c',
      patches: ['#e2d7ba', '#d9b13f'] };
  } else if (patternId === 'daisy') {
    o = { scheme: 'daisy', base: '#5a6b46', weather: '#52623f',
      patches: ['#e6ded0', '#c96a3a'] };
  } else if (patternId === 'circuit') {
    o = { scheme: 'circuit', base: '#2b4536', weather: '#263d30',
      patches: ['#c9a53f', '#86b096'] };
  } else if (patternId === 'racing') {
    o = { scheme: 'racing', base: '#c9c7bd', weather: '#b9b7ab',
      patches: ['#a83430', '#26282c'] };
  } else if (patternId === 'paintball') {
    o = { scheme: 'paintball', base: '#b9b9b2', weather: '#a9a9a2',
      patches: ['#3f7fbf', '#c9503f', '#58a05a', '#d9b13f'] };
  } else if (patternId === 'normandy44') {
    // camo r7 loadout set: US olive drab with the white invasion star.
    o = { scheme: 'star', base: '#57603f', weather: '#4e5738',
      patches: ['#ded8c8'] };
  } else if (patternId === 'berlin45') {
    // Soviet 4BO with the white air-recognition band + tactical number.
    o = { scheme: 'idband', base: '#4a5138', weather: '#525a3e',
      patches: ['#e0dccb'] };
  } else if (patternId === 'ardennes44') {
    // camo r8: dedicated brush-applied whitewash — directional strokes with
    // the olive drab dragging through in streaks (no soft blobs). patches =
    // [show-through OD, grime].
    o = { scheme: 'brushwash', base: '#9aa09c', weather: '#878d89',
      patches: ['#4c5539', '#6e6f64'] };
  } else if (patternId === 'pacific45') {
    // camo r8: late-war USMC — forest green under hard-edged black wave
    // bands, white hull number, coral-dust stipple. patches = [black band,
    // coral dust, stencil white].
    o = { scheme: 'usmc', base: '#46543d', weather: '#3e4b36',
      patches: ['#282e26', '#c2ab84', '#e3ded1'] };
  } else if (patternId === 'jungleops') {
    // camo r8: ERDL leaf language — interlocking HARD-EDGED organic islands
    // in four tones with black branch squiggles between. patches = [dark
    // green, brown, black].
    o = { scheme: 'erdl', base: '#5d6b44', weather: '#556240',
      patches: ['#3a4931', '#5a4632', '#262a24'] };
  } else if (patternId === 'rasputitsa') {
    // camo r8: mud SEASON, not mud blobs — washed 4BO under directional
    // spatter clusters, dragged smears and crusted dry patches. patches =
    // [wet mud, dry mud, dark spatter].
    o = { scheme: 'mudwash', base: '#575843', weather: '#4e4f3c',
      patches: ['#4a3b2a', '#6b5a42', '#332a20'] };
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
// camo_spotting r3: running gear follows the PATTERN FIELD, not the base
// coat alone. On patch-dominant schemes (digital/fleck cover most of the
// tile) base-only tinting left the T-34-85's wheel dishes reading as
// untouched factory 4BO right under a fully digital fender line ("mismatched
// kit seam" critique). The tint now blends the base toward the mean patch
// tone — heavily for digital/fleck, lightly for banded schemes — so wheels
// land inside the scheme's rendered tonal family. Winter keeps base (its
// patches[0] is the show-through UNDER color, not a top coat); solid has no
// patches.
const wheelToneOf = (v) => {
  const base = hexToRgb(v.base);
  const pats = (v.patches || []).map(hexToRgb);
  // camo r8: 'washworn' shares winter's contract — patches[0] is the
  // show-through UNDER color, not a top coat, so gear follows the wash base.
  if (!pats.length || v.scheme === 'winter' || v.scheme === 'washworn'
    || v.scheme === 'solid') return base;
  let mr = 0, mg = 0, mb = 0;
  for (const p of pats) { mr += p[0]; mg += p[1]; mb += p[2]; }
  const mean = scale3([mr, mg, mb], 1 / pats.length);
  const k = (v.scheme === 'digital' || v.scheme === 'fleck') ? 0.6 : 0.3;
  return mix(base, mean, k);
};
const wheelRgbOf = (v) => {
  // r3: dust-mix cut 0.22 -> 0.12 and darkened — painted gear leaned BEIGE
  // under a warm key (the T-90M idler "beige rim" read); wheels now stay in
  // the scheme's tonal family with only a hint of dust.
  // camo_spotting r5: winter gear mixes toward cold slush-grey instead of
  // warm road dust — whitewashed wheels rode the same tan drift as the hull.
  const wash = v.scheme === 'winter' || v.scheme === 'washworn'; // camo r8
  const dust = wash ? [102, 107, 110] : [118, 110, 86];
  const c = scale3(mix(scale3(wheelToneOf(v), 0.92), dust, 0.12), 0.84);
  return wash ? scale3(c, 0.85) : c;
};
// Recessed interleaved-row wheels bake their own occlusion: same scheme paint
// dropped toward shadow so the Schachtellaufwerk rows separate (r5). Kept at
// 0.66 — the old 0.5 rendered near-black in the wheel bay and the recessed
// rows read as GAPS between sparse floating wheels (r6 Tiger closeup).
const wheelDarkRgbOf = (v) => scale3(wheelRgbOf(v), 0.66);
const detailRgbOf = (v) => scale3(mix([65, 70, 58], wheelToneOf(v), 0.5), 0.9);
const canvasRgbOf = (v) => scale3(detailRgbOf(v), 0.68);

function repaintEntry(entry, patternId) {
  const vis = { ...patternVisual(entry.spec, patternId), modernWelds: isPostwarVehicleEra(entry.spec.era) };
  // pattern-specific rng stream; the shared `feats` plan keeps panel lines,
  // welds and bolts aligned with the (unchanged) normal map.
  let ph = 0;
  for (const ch of patternId) ph = (ph * 31 + ch.charCodeAt(0)) | 0;
  paintCamo(entry.camoCanvas, vis, mulberry32(entry.seed ^ ph), entry.feats, entry.seed);
  exposureTrim(entry.camoCanvas);
  entry.camoTex.needsUpdate = true;
  // camo_spotting r4: the roughness map follows the repaint so each pattern's
  // per-patch paint response lands with it (albedo-only repaints read as
  // printed vinyl — critic r4). Same `feats` plan keeps chips/lines aligned
  // with the normal map; the stochastic dust layer redraws from a
  // pattern-keyed stream, which is invisible at paint scale.
  paintRoughness(entry.roughCanvas, mulberry32(entry.seed ^ ph ^ 0x9e37), entry.feats);
  paintPatchRoughness(entry.roughCanvas, entry.camoCanvas, vis);
  entry.roughTex.needsUpdate = true;
  entry.patternId = patternId;
  retintEntryFittings(entry, vis);
  // camo r4: memoize the finished bake — the next visit to this
  // (spec, pattern) pair restores in a couple of blits instead of repainting.
  snapshotBake(entry, patternId);
}

// Wheels, sprockets, fittings and the solid kit canvas follow every repaint
// and memoized restore through this one tint gate.
function retintEntryFittings(entry, vis) {
  for (const rec of entry.paintable) {
    const c = rec.kind === 'wheels' ? wheelRgbOf(vis)
      : rec.kind === 'wheelsDark' ? wheelDarkRgbOf(vis)
        : rec.kind === 'canvas' ? canvasRgbOf(vis) : detailRgbOf(vis);
    rec.m.color.set(cssRGB(c));
  }
  if (entry.kitCanvas) {
    paintKitCanvas(entry.kitCanvas, vis);
    entry.kitTex.needsUpdate = true;
  }
}

// ---- camo r4: instant pattern switching (owner ask 2026-08-07) ------------
// "switching between camos should be instant". A picker click used to run the
// full painter chain — paintCamo on a 2048^2 hero albedo + exposureTrim +
// both roughness passes — measured 0.3-1.4 s of main-thread canvas work per
// switch. Repaints are now MEMOIZED: every finished bake is snapshotted to
// compressed blobs (the webp encode runs off the main thread and toBlob
// captures at-call, so a later repaint can't tear the snapshot) and the
// picker restores a cached pattern with two drawImage blits + GPU re-upload.
// Blobs, not live canvases: a spec's 30-pattern roster held as RGBA canvases
// would be ~0.5 GB at hero size; as webp it sits near ~15 MB.
const BAKE_CACHE = new Map(); // `${specId}|${patternId}` -> {camo,rough:Blob,w}
const BAKE_CACHE_MAX = 64;    // ~2 specs' full pattern rosters
const bakeKey = (specId, pid) => `${specId}|${pid}`;
function bakeStore(key, camo, rough, w) {
  if (!camo || !rough || BAKE_CACHE.has(key)) return;
  while (BAKE_CACHE.size >= BAKE_CACHE_MAX) {
    BAKE_CACHE.delete(BAKE_CACHE.keys().next().value); // insertion-order LRU
  }
  BAKE_CACHE.set(key, { camo, rough, w });
}
function canvasToBlob(canvas, cb) {
  // lossy webp at q0.92 is invisible under the weathering/grain stack and
  // ~8x smaller than png; a null blob (no webp encoder) falls back to png.
  try {
    canvas.toBlob((b) => {
      if (b) cb(b);
      else canvas.toBlob((p) => cb(p || null), 'image/png');
    }, 'image/webp', 0.92);
  } catch (_) { cb(null); }
}
function snapshotBake(entry, patternId) {
  const key = bakeKey(entry.spec.id, patternId);
  if (BAKE_CACHE.has(key)) return;
  const w = entry.camoCanvas.width;
  let camo = null, rough = null, n = 0;
  const done = () => { if (++n === 2) bakeStore(key, camo, rough, w); };
  canvasToBlob(entry.camoCanvas, (b) => { camo = b; done(); });
  canvasToBlob(entry.roughCanvas, (b) => { rough = b; done(); });
}
/**
 * Restore a memoized bake onto the entry's live canvases. Resolves true on a
 * cache hit (canvases, fittings and patternId updated — or a newer selection
 * superseded this one mid-decode and owns the entry now), false when this
 * (spec, pattern) pair was never baked at the current canvas size (caller
 * falls back to repaintEntry).
 */
async function restoreBake(entry, patternId) {
  const key = bakeKey(entry.spec.id, patternId);
  const bake = BAKE_CACHE.get(key);
  if (!bake) return false;
  if (bake.w !== entry.camoCanvas.width) { // baked at another quality tier
    BAKE_CACHE.delete(key);
    return false;
  }
  BAKE_CACHE.delete(key); BAKE_CACHE.set(key, bake); // LRU touch
  let cb, rb;
  try {
    [cb, rb] = await Promise.all([
      createImageBitmap(bake.camo), createImageBitmap(bake.rough)]);
  } catch (_) {
    BAKE_CACHE.delete(key); // undecodable — bake fresh on the fallback path
    return false;
  }
  if (resolveCamoPattern(entry.spec.id) !== patternId
    || entry.patternId === patternId) {
    // superseded (or already landed) while the bitmaps decoded — the newer
    // selection's own restore/repaint owns the entry, don't fight it.
    cb.close(); rb.close();
    return true;
  }
  const blit = (canvas, bmp) => {
    const c2 = canvas.getContext('2d');
    c2.save();
    c2.setTransform(1, 0, 0, 1, 0, 0);
    c2.globalAlpha = 1;
    c2.globalCompositeOperation = 'source-over';
    c2.filter = 'none';
    c2.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    c2.restore();
  };
  blit(entry.camoCanvas, cb); cb.close();
  blit(entry.roughCanvas, rb); rb.close();
  entry.camoTex.needsUpdate = true;
  entry.roughTex.needsUpdate = true;
  entry.patternId = patternId;
  retintEntryFittings(entry, patternVisual(entry.spec, patternId));
  return true;
}

/**
 * Repaint every cached tank albedo whose resolved pattern changed (after a
 * selection change or a biome switch). Cheap when nothing changed.
 * @param {?string} onlySpecId limit to one tank
 */
export function applyCamoPatterns(onlySpecId = null) {
  for (const entry of TEX_CACHE.values()) {
    if (entry.fixedPattern || (onlySpecId && entry.spec.id !== onlySpecId)) continue;
    const pid = resolveCamoPattern(entry.spec.id);
    if (entry.patternId !== pid) repaintEntry(entry, pid);
  }
}


// perf-r2f (journey probe): the no-arg sweep above repaints EVERY stale cache
// entry in one task — a biome flip with a warm 7-tank cache is ~0.3-1.4 s of
// canvas painting PER ENTRY, which froze the garage on a map pick and pinned
// the battle loading bar for many seconds on a rematch. This variant yields a
// real painted frame between entries and re-resolves each pattern AT PAINT
// TIME, so overlapping drains (rapid map-card scrubbing) converge on the last
// selection instead of painting stale patterns. A newer drain cancels the
// remainder of an older one outright (the newer pass owns every stale entry).
let _camoSweepGen = 0;
/**
 * Chunked equivalent of applyCamoPatterns(): one repaint per macrotask.
 * @param {{priorityIds?: string[],onlySpecIds?: string[]}} [opts] specs to
 *   repaint first, optionally restricting the sweep to currently relevant
 *   vehicles (pedestal hero or the fielded battle roster)
 * @returns {Promise<void>} resolves when every stale entry is repainted (or
 *   a newer sweep took over the remainder)
 */
export async function applyCamoPatternsChunked(opts = null) {
  const gen = ++_camoSweepGen;
  const prio = (opts && opts.priorityIds) || [];
  const only = opts?.onlySpecIds?.length ? new Set(opts.onlySpecIds) : null;
  const keys = [...TEX_CACHE.keys()]
    .filter((key) => !only || only.has(TEX_CACHE.get(key)?.spec.id))
    .sort((a, b) => {
      const ae = TEX_CACHE.get(a), be = TEX_CACHE.get(b);
      return (prio.indexOf(ae?.spec.id) < 0 ? 1 : 0) - (prio.indexOf(be?.spec.id) < 0 ? 1 : 0);
    });
  for (const key of keys) {
    if (gen !== _camoSweepGen) return; // superseded — the newer drain finishes
    const entry = TEX_CACHE.get(key);
    if (!entry || entry.fixedPattern) continue; // immutable match variants never repaint
    const pid = resolveCamoPattern(entry.spec.id);
    if (entry.patternId === pid) continue;
    // yield BEFORE painting: the triggering click/frame paints first, and the
    // loading bar gets a frame between consecutive entry repaints.
    await new Promise((r) => setTimeout(r, 32));
    if (gen !== _camoSweepGen) return;
    const cur = TEX_CACHE.get(key);
    if (!cur) continue;
    const nowPid = resolveCamoPattern(cur.spec.id);
    if (cur.patternId !== nowPid) {
      // camo r4: memoized bakes short-circuit the painter chain — a biome
      // flip back onto patterns this session has already worn costs blits,
      // not repaints. The restore re-checks resolution after its decode
      // awaits, so a drain that got superseded mid-entry stays correct.
      if (await restoreBake(cur, nowPid)) continue;
      if (gen !== _camoSweepGen) return;
      const c2 = TEX_CACHE.get(key);
      if (!c2) continue;
      const p2 = resolveCamoPattern(c2.spec.id);
      if (c2.patternId !== p2) {
        const vis = {
          ...patternVisual(c2.spec, p2),
          modernWelds: isPostwarVehicleEra(c2.spec.era),
        };
        let ph = 0;
        for (const ch of p2) ph = (ph * 31 + ch.charCodeAt(0)) | 0;

        // A repaint used to be one 0.3-2.1 s task: albedo painter, exposure
        // scan, both roughness passes, fittings, and snapshot all ran without
        // returning to the browser. Preserve the exact painter/RNG output but
        // split the independent passes into paintable tasks. A superseding
        // sweep aborts between passes; its fresh albedo pass then owns the
        // same canvases from that point onward.
        paintCamo(c2.camoCanvas, vis, mulberry32(c2.seed ^ ph), c2.feats, c2.seed);
        await new Promise((r) => setTimeout(r, 16));
        if (gen !== _camoSweepGen) return;
        exposureTrim(c2.camoCanvas);
        c2.camoTex.needsUpdate = true;
        await new Promise((r) => setTimeout(r, 16));
        if (gen !== _camoSweepGen) return;
        paintRoughness(c2.roughCanvas, mulberry32(c2.seed ^ ph ^ 0x9e37), c2.feats);
        await new Promise((r) => setTimeout(r, 16));
        if (gen !== _camoSweepGen) return;
        paintPatchRoughness(c2.roughCanvas, c2.camoCanvas, vis);
        c2.roughTex.needsUpdate = true;
        c2.patternId = p2;
        retintEntryFittings(c2, vis);
        snapshotBake(c2, p2);
      }
    }
  }
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

// tank_models r7: solid scheme-tone paint for bolt-on kit (ARAT ERA tiles,
// stowage boxes) — monotone like real CARC'd add-on armor, in the ACTIVE
// pattern's tonal family, with a hint of mottle so plates don't read as one
// dead constant. Canvas-backed so pattern switches repaint every live clone.
function paintKitCanvas(canvas, vis) {
  const ctx = canvas.getContext('2d');
  const S = canvas.width;
  const base = wheelRgbOf(vis);
  ctx.fillStyle = cssRGB(base);
  ctx.fillRect(0, 0, S, S);
  const rng = mulberry32(0x6b17);
  for (let i = 0; i < 6; i++) {
    const x = rng() * S, y = rng() * S, r = S * (0.2 + rng() * 0.3);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, cssRGB(scale3(base, rng() < 0.5 ? 0.93 : 1.07)));
    g.addColorStop(1, cssRGB(base));
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;
}

/**
 * Shared per-spec solid kit-paint texture (see paintKitCanvas). Lives on the
 * TEX_CACHE entry so repaintEntry restyles it with every pattern switch.
 * @param {object} spec TankSpec
 * @returns {THREE.Texture}
 */
export function getKitPaintTexture(spec) {
  const entry = TEX_CACHE.get(spec.id) || acquireSharedTextures(spec, 4);
  if (!entry.kitTex) {
    entry.kitCanvas = makeCanvas(64, 64);
    paintKitCanvas(entry.kitCanvas, patternVisual(spec, entry.patternId));
    entry.kitTex = canvasTex(entry.kitCanvas, { aniso: 2, repeat: true });
  }
  return entry.kitTex;
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
 * `onBeforeCompile` in renderer stubs used by thumbnails and headless tools.
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

// Renderer stubs expose setupShadowMaterial but ignore its hook argument.
// Probe each context once so every material takes the correct registration
// path without duplicating capability checks at material creation sites.
const SHADOW_CONTEXT_SUPPORT = new WeakMap();
function supportsShadowHook(engineCtx) {
  if (!engineCtx || (typeof engineCtx !== 'object' && typeof engineCtx !== 'function')
      || typeof engineCtx.setupShadowMaterial !== 'function') return false;
  if (SHADOW_CONTEXT_SUPPORT.has(engineCtx)) return SHADOW_CONTEXT_SUPPORT.get(engineCtx);

  const probe = new THREE.MeshStandardMaterial();
  let supported = false;
  try {
    engineCtx.setupShadowMaterial(probe);
    supported = !!probe.defines?.USE_CSM;
  } catch {
    // A tooling stub that rejects real materials uses the direct hook path.
  }
  probe.dispose();
  SHADOW_CONTEXT_SUPPORT.set(engineCtx, supported);
  return supported;
}

/**
 * Build the full material set for one tank.
 * @param {object} spec TankSpec (reads spec.visual palette hints)
 * @param {object} engineCtx EngineCtx (§2.8) — setupShadowMaterial + anisotropy
 * @param {number} camoSeed deterministic seed (stowage jitter etc.; textures are per-spec)
 * @returns {object} { hull, wheels, rubber, detail, dark, glass, barrel, canvasCloth,
 *   wood, trackL, trackR, trackTexL, trackTexR, trackLinkM, decal(kind), burnt, dispose() }
 */
export function createTankMaterials(spec, engineCtx, camoSeed, quality = 'high', camoPattern = null) {
  const setup = supportsShadowHook(engineCtx)
    ? (m) => {
      engineCtx.setupShadowMaterial(m, vehicleAmbientFloorHook);
      m.customProgramCacheKey = () => 'veh-ambient-floor-v2';
      return m;
    }
    : (m) => {
      m.onBeforeCompile = vehicleAmbientFloorHook;
      m.customProgramCacheKey = () => 'veh-ambient-floor-v2';
      return m;
    };
  const aniso = (engineCtx && engineCtx.anisotropy) || 8;

  const disposables = [];
  const track = (r) => { disposables.push(r); return r; };

  // PERF r3: static wreck, battle AI, player, and garage-preview tiers are
  // resolution-bounded in QUALITY_SIZES; only the final hero upgrade keeps
  // the full tier. Keep `low` explicit here: falling through to `high` made
  // every transient world-wreck collapse bake 2048/1024 canvases that were
  // immediately discarded.
  const shared = acquireSharedTextures(
    spec,
    aniso,
    normalizeMaterialTextureQuality(quality),
    camoPattern,
  );
  const { camoTex, normalTex, roughTex } = shared;

  // Matte military paint over rolled steel: normal map carries panel lines /
  // welds / bolts / casting; a whisper of clearcoat lets sky light streak
  // across big plates; vertex colors carry the baked dust/AO gradient.
  // r8: envMapIntensity 0.55 across the painted set — full-strength IBL
  // washed the procedural fleet a milky pastel next to the Abrams GLB
  // (whose composite runs at 0.6), the core of the "CAD clay" cohesion
  // critique. Clearcoat trimmed with it.
  // lighting_post r3 (round 3, major #1b): hulls rendered ~2 stops darker
  // than terrain under the new denser shadows — roughness 0.95 -> 0.78
  // (CARC paint sheen under strong keys) and envMapIntensity 0.55 -> 0.75 so
  // the IBL share follows the ambient stack. (The companion camo-palette
  // luminance raise is deferred to the materials owner — the camo_spotting
  // r3 palette rework landed this same round and must not be double-tuned.)
  // camo_spotting r4 (critic: T-34-85 summer "dominated by pale cream on the
  // entire upper hull", factory/summer greens "light and minty"): measured by
  // live A/B on the garage pedestal — with roughness 1 / env 0 / clearcoat 0
  // the same "cream" glacis renders as fully saturated patterned paint, so
  // the wash was never in the palette: the 0.12 clearcoat + 0.75 IBL + GGX
  // (roughnessMap dips to ~0.23 effective) laid a white specular film over
  // every up-facing plate under the warm key. Matte field paint: clearcoat
  // down to a trace, base roughness up a step, env trimmed toward the r8
  // level. Shade readability no longer needs the extra IBL — the
  // gameplay_feel r4/r5 view-fill + shadow floors in vehicleAmbientFloorHook
  // now guarantee it (they postdate the lighting_post r3 env raise).
  const hull = track(setup(new THREE.MeshPhysicalMaterial({
    map: camoTex, roughnessMap: roughTex, roughness: 0.88, metalness: 0.05,
    normalMap: normalTex, normalScale: new THREE.Vector2(1.3, 1.3),
    // lighting_post r4: sheen without white-deck — NO clearcoatRoughnessMap
    // (map dips spike the lobe and blow flat rear fenders to mirror-white).
    clearcoat: 0.05, clearcoatRoughness: 0.65,
    specularIntensity: 0.55,               // r4: grazing F90 film off up-tilted plates
    vertexColors: true, envMapIntensity: 0.5,
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
  // camo_spotting r3: lifted off near-black so lighting models tire rings
  // instead of silhouetting them (Tiger bullseye critique).
  const rubber = track(setup(new THREE.MeshStandardMaterial({
    color: 0x292a28, roughness: 0.96, metalness: 0.0,
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
    // r3: hue pulled off the blue-grey — 0x33383a leaned navy under the sky
    // env and cool key light; neutral warm gunmetal keeps fittings in the
    // same family as the dust/steel gear.
    color: 0x36342f, roughness: 0.9, metalness: 0.18, roughnessMap: roughTex,
    envMapIntensity: 0.22,
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
  // tank_models r4 (Leo 2A7 "desert-tan rear track against dark track
  // elsewhere on the same vehicle"): 0x46423a link pads bounced to pale sand
  // under direct sun while the band texture stayed near-black — one run read
  // as two materials. Pads pulled down into the band's own tonal family.
  const trackLink = track(setup(new THREE.MeshStandardMaterial({
    color: 0x353634, roughness: 0.95, metalness: 0.08, roughnessMap: roughTex,
    envMapIntensity: 0.08,
  })));
  // Spare track links carried as stowage/armor: dark oily track steel — the
  // light-grey trackLink shade read as unpainted plastic sprue racked on the
  // Tiger turret sides (r6); the live run needs the lighter tone, spares don't.
  const spareTrack = track(setup(new THREE.MeshStandardMaterial({
    // r3: roughness floor raised / metalness cut — with the multiplying
    // roughnessMap the 0.85 base dipped to sparkling flecks on idler/sprocket
    // recess faces (the T-90M "navy sparkle" read under the closeup key).
    color: 0x353634, roughness: 0.94, metalness: 0.08, roughnessMap: roughTex,
    envMapIntensity: 0.06,
  })));
  // Optics / headlight lenses: smooth glass with a dark blue-grey tint.
  const glass = track(setup(new THREE.MeshStandardMaterial({
    color: 0x2a3540, roughness: 0.12, metalness: 0.85,
  })));
  // Gun tube: painted in the vehicle scheme like the hull — crews paint the
  // tube, only the muzzle brake stays bare steel (routed to the dark bucket).
  // Uses the same box-projected camo map as the shell so it never reads as an
  // untextured black prop, with a gentle normal so sleeve clamps still catch.
  // camo_spotting r4: same matte-paint family as the hull (the tube is
  // scheme-painted) — the 0.72 base fired the hull's specular film along the
  // top of the tube under the garage key.
  const barrel = track(setup(new THREE.MeshStandardMaterial({
    map: camoTex, roughness: 0.8, metalness: 0.08, roughnessMap: roughTex,
    normalMap: normalTex, normalScale: new THREE.Vector2(0.5, 0.5),
    vertexColors: true, envMapIntensity: 0.45,
  })));
  // tank_models r7 (critic: "solid cream rectangular prism" stowage on the
  // Challenger 2 bustle/deck + K2 turret side): 0x59543f is warm-biased —
  // under the ~4.5x warm key + ACES it tonemapped to flat CREAM while the
  // hull camo stayed green, so every canvas bundle read as an unpainted
  // placeholder primitive. OD canvas is duller, darker and green-biased.
  const usesSchemeTintedCanvas = spec.id === 't72b3m' || spec.id === 'bmpt_terminator2';
  const canvasCloth = track(setup(new THREE.MeshStandardMaterial({
    color: usesSchemeTintedCanvas
      ? new THREE.Color(cssRGB(canvasRgbOf(patVis)))
      : 0x42452f,
    roughness: 0.97, metalness: 0.0,
    bumpMap: roughTex, bumpScale: 0.5, envMapIntensity: 0.25,
  })));
  // The T-72B3M family uses broad modeled canvas aprons and bustle packs.
  // Keep those surfaces map-free (the profile owns that rule), but tint the
  // dedicated cloth material with every active camouflage so winter/desert
  // paints do not leave factory-green rectangles behind. The darker solid
  // tint preserves a readable canvas-vs-armor hierarchy without repeating a
  // full camouflage atlas on each local-UV bag or panel.
  if (usesSchemeTintedCanvas) {
    paintableRecs.push({ m: canvasCloth, kind: 'canvas' });
  }
  for (const rec of paintableRecs) shared.paintable.add(rec);
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
  // effects_combat r3: lift the charred albedo floor ~1.3x (color multiplier
  // above white) so wrecks read as scorched steel rather than a silhouette
  // in overcast/shadowed framings.
  // r5: 1.3 -> 1.5 with the lifted char stack above — scorched steel, not a
  // light-swallowing silhouette (r4 "black hole against sunlit grass").
  // r7 (critic critical: wreck reads "bone-white/cream" where this fallback
  // is sunlit): 1.5 over the pale scorched-camo bake rendered lit panels as
  // bleached bone. 0.72 puts the rare fallback swap in the same charcoal
  // family as the shader burn mask (real wrecks char DARK).
  burnt.color.setScalar(0.72);
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
  totalEmissiveRadiance += diffuseColor.rgb * 0.125; // r5: shadow-side floor up
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

  const marking = vehicleMarkingRecord(spec);
  const decalCache = new Map();
  const decal = (kind, text) => {
    const key = `${marking.markingCode}:${kind}:${text || ''}`;
    if (!decalCache.has(key)) {
      const t = track(canvasTex(paintDecal(kind, text, marking), { aniso }));
      // number decals re-bake on fonts.ready (paintDecal registered first, so
      // its redraw runs before this) — push the fresh canvas to the GPU.
      if (document.fonts && !document.fonts.check("bold 16px 'ABC Monument Grotesk'")) {
        document.fonts.ready.then(() => { t.needsUpdate = true; }).catch(() => {});
      }
      const m = track(setup(new THREE.MeshStandardMaterial({
        map: t, transparent: true, roughness: 0.8, metalness: 0.1,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
        depthWrite: false,
      })));
      decalCache.set(key, m);
    }
    return decalCache.get(key);
  };

  // One semantic material vocabulary for builders, live audits and asset
  // generation. Names are diagnostic only; roles are the stable contract.
  // In particular, wheel paint and camouflage guards stay distinct from
  // working track steel/rubber so palette cleanup cannot erase side armor.
  tagVehicleMaterial(hull, 'armorPaint', 'armor-paint');
  tagVehicleMaterial(wheels, 'wheelPaint', 'wheel-paint');
  tagVehicleMaterial(wheelsRecessed, 'wheelPaint', 'wheel-paint-recessed');
  tagVehicleMaterial(rubber, 'tireRubber', 'tire-rubber');
  tagVehicleMaterial(detail, 'fittingPaint', 'fitting-paint');
  tagVehicleMaterial(dark, 'gunmetal', 'gunmetal');
  tagVehicleMaterial(shadow, 'gearShadow', 'gear-shadow');
  tagVehicleMaterial(trackLink, 'trackSteel', 'track-steel');
  tagVehicleMaterial(spareTrack, 'trackSteel', 'spare-track-steel');
  tagVehicleMaterial(glass, 'opticGlass', 'optic-glass');
  tagVehicleMaterial(barrel, 'armorPaint', 'barrel-paint');
  tagVehicleMaterial(canvasCloth, 'canvas', 'canvas');
  tagVehicleMaterial(wood, 'wood', 'wood');
  tagVehicleMaterial(burnt, 'burnt', 'burnt');
  tagVehicleMaterial(trackL, 'trackBand', 'track-band-left');
  tagVehicleMaterial(trackR, 'trackBand', 'track-band-right');

  return {
    hull, wheels, wheelsRecessed, rubber, detail, dark, shadow, trackLink, spareTrack, glass, barrel,
    canvasCloth, wood, burnt,
    trackL, trackR, trackTexL, trackTexR,
    trackLinkM: 0.165 * 4, // meters of track per full texture repeat (4 links)
    decal,
    dispose() {
      for (const rec of paintableRecs) shared.paintable.delete(rec);
      for (const r of disposables) r.dispose();
      releaseSharedTextures(shared);
    },
  };
}

// ---------------------------------------------------------------------------
// Shader-driven wreck burn mask (effects_combat r6)
// ---------------------------------------------------------------------------
// The r5 wreck pipeline swapped whole meshes to the shared `burnt` material on
// a staggered timer (charQueue). The critic verdict: "staged char swap pops
// per-mesh with a hard boundary — half coal-black, half pristine camo split on
// a mesh seam — and by 2.5 s the wreck is a matte black void", plus the popped
// turret flew as "a flat unlit pure-black cutout with a pristine painted
// barrel still attached" (the swap staging is per-mesh and random, so a barrel
// could stay painted while its turret charred).
//
// This factory replaces the binary swap with a CONTINUOUS burn front computed
// in the fragment shader ON CLONES OF THE TANK'S OWN MATERIALS:
//  - world-space value noise + a top-down height ramp drive a single ignition
//    front that sweeps the whole vehicle over ~2.1 s — it crosses mesh seams
//    smoothly, so there is never a half-and-half wreck;
//  - the sweeping front itself GLOWS ember-hot (uBurnGlow, decays over ~2 s):
//    panels visibly scorch while burning, and the airborne popped turret is
//    fire-lit from within instead of reading as an unlit silhouette;
//  - the final char keeps ~30% of panels at partial burn (noise-capped mask):
//    desaturated darkened paint remnants — a burnt VEHICLE, not a coal cutout;
//  - ember pockets throb in fully-charred seams via uBurnEmber (driven by the
//    wreck ember timer in tankFactory.syncFromState).
// One shared uniforms object per tank drives every clone, so the whole wreck
// animates in lockstep and stepped/frozen captures land mid-sweep correctly.

const BURN_COMMON_GLSL = `
uniform float uBurnT;
uniform float uBurnSeed;
uniform float uBurnLo;
uniform float uBurnHi;
uniform float uBurnGlow;
uniform float uBurnEmber;
varying vec3 vBrnW;
float brnHash( vec3 p ) { return fract( sin( dot( p, vec3( 17.13, 113.7, 41.7 ) ) ) * 43758.5453 ); }
float brnNoise( vec3 p ) {
  vec3 i = floor( p ), f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  float n000 = brnHash( i );
  float n100 = brnHash( i + vec3( 1.0, 0.0, 0.0 ) );
  float n010 = brnHash( i + vec3( 0.0, 1.0, 0.0 ) );
  float n110 = brnHash( i + vec3( 1.0, 1.0, 0.0 ) );
  float n001 = brnHash( i + vec3( 0.0, 0.0, 1.0 ) );
  float n101 = brnHash( i + vec3( 1.0, 0.0, 1.0 ) );
  float n011 = brnHash( i + vec3( 0.0, 1.0, 1.0 ) );
  float n111 = brnHash( i + vec3( 1.0, 1.0, 1.0 ) );
  return mix( mix( mix( n000, n100, f.x ), mix( n010, n110, f.x ), f.y ),
              mix( mix( n001, n101, f.x ), mix( n011, n111, f.x ), f.y ), f.z );
}
`;

const BURN_DIFFUSE_GLSL = `
float brnM = 0.0;
float brnBand = 0.0;
float brnKeep = 0.0;
if ( uBurnT >= 0.0 ) {
  vec3 bp = vBrnW * 1.9 + vec3( uBurnSeed );
  float brnN = brnNoise( bp ) * 0.62 + brnNoise( bp * 2.9 + 11.3 ) * 0.38;
  // 0 at the turret roof -> 1 at the tracks: fire starts topside (the blast
  // and the rack cook-off live there) and eats DOWN the hull
  float brnH = clamp( ( uBurnHi - vBrnW.y ) / max( uBurnHi - uBurnLo, 0.5 ), 0.0, 1.0 );
  // sweep tune (r6 verify): /2.1 with a 0.60 height span charred the whole
  // deck by 0.6 s and put half the hull inside the glow band at once — the
  // staged explosion showed BLEACHED pale flanks. /2.4 + 0.80 span keeps the
  // front spatially tight: deck chars under the fireball, flanks follow over
  // ~1.5 s, running gear last (~3 s).
  float brnProg = uBurnT / 2.4;
  float brnX = brnProg - ( brnH * 0.80 + brnN * 0.50 - 0.12 );
  brnM = smoothstep( 0.0, 0.24, brnX );
  // the ignition FRONT: a NARROW ragged glowing edge right where the sweep
  // is eating (wide band + flat gain was the pale-flank wash)
  brnBand = smoothstep( -0.035, 0.005, brnX ) * ( 1.0 - smoothstep( 0.02, 0.14, brnX ) )
    * ( 0.25 + 0.75 * smoothstep( 0.35, 0.78, brnNoise( vBrnW * 5.7 + vec3( uBurnSeed * 2.9 ) ) ) );
  // ~30% survivor panels: low-frequency noise caps the char so patches of
  // desaturated scorched paint survive the full burn (WoT wreck read)
  brnKeep = smoothstep( 0.60, 0.86, brnNoise( vBrnW * 0.85 + vec3( uBurnSeed * 1.7 + 5.1 ) ) );
  brnM *= 1.0 - 0.46 * brnKeep;
  if ( brnM > 0.001 ) {
    float brnLum = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
    // r7 char rework (critic: "real wrecks char DARK while retaining surface
    // detail"): the char MULTIPLIES the panel's own albedo toward charcoal
    // instead of replacing it with flat noise — camo edges, panel lines,
    // bolts and the normal/roughness response all survive under the soot,
    // just compressed dark. A low-frequency soot-tone noise varies the
    // multiplier panel to panel (patchy burn), and a small additive ash
    // floor guarantees no region ever clips to lightless black. Typical
    // paint (0.10-0.35 linear luma) lands at ~0.035-0.075 — charcoal-dark
    // in sun, still self-similar in shade.
    float brnTone = brnNoise( vBrnW * 3.1 + vec3( uBurnSeed * 2.3 ) );
    vec3 brnChar = diffuseColor.rgb * mix( vec3( 0.105, 0.090, 0.078 ), vec3( 0.27, 0.235, 0.20 ), brnTone )
      + vec3( 0.021, 0.018, 0.015 );
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( brnLum ) * 0.62, brnM * 0.55 );
    diffuseColor.rgb = mix( diffuseColor.rgb, brnChar, brnM );
  }
}
`;

const BURN_EMISSIVE_GLSL = `
if ( uBurnT >= 0.0 ) {
  // sweeping ignition edge: ember-hot rim light on the panel being eaten
  totalEmissiveRadiance += vec3( 1.35, 0.38, 0.065 ) * brnBand * uBurnGlow
    * ( 0.45 + 0.55 * brnNoise( vBrnW * 6.3 + vec3( uBurnSeed * 3.1 ) ) );
  // fireball wash: while the blast burns, charred surfaces carry a warm fill
  // so the popped turret / fresh wreck reads fire-lit, never a black cutout.
  // lighting_post r5 (critic MAJOR: "flying turret is a solid black
  // silhouette over the fireball"): the linear-in-brnM wash peaked at ~0.05
  // luminance — invisible after the ACES toe. pow(brnM,0.4)*0.62 lands
  // fully-charred faces at ~0.26 luminance (clearly fire-lit orange, under
  // bloom threshold) and reaches partially-charred panels early, while
  // staying exactly zero on unburned paint (keep it a brnM product — a
  // brnM-independent base term regressed a GLB deck to black).
  // r7: 0.62 -> 0.34 — against the darker multiply-char albedo the old gain
  // FLOODED the whole wreck uniform orange for seconds (probe destroy_2_5s);
  // the wash must fire-light the toss beat, then hand the surface back to
  // the charred diffuse (uBurnGlow also decays 1.5 s -> 0.9 s, tankFactory).
  totalEmissiveRadiance += vec3( 0.95, 0.34, 0.10 ) * uBurnGlow * 0.34 * pow( brnM, 0.4 );
  // ember pockets smoldering in seams of the finished char (throb + cool)
  // r7: tighter pocket gate + ~half gain — pockets are seams, not a coat
  float brnPk = smoothstep( 0.80, 0.97, brnNoise( vBrnW * 4.7 + vec3( uBurnSeed * 4.9 + 3.7 ) ) );
  totalEmissiveRadiance += vec3( 0.72, 0.16, 0.028 ) * brnPk * brnM * uBurnEmber * ( 1.0 - brnKeep );
  // shadow-side albedo floor: charred flanks keep their soot/panel gradients
  // readable from any angle (matches the old burnt material's wreck floor)
  // r7: 0.11 -> 0.19 — with the darker multiply-char albedo the shaded side
  // of a wreck needs a touch more ambient fill so soot gradients stay
  // readable from any bearing (never a lightless region, never a wash).
  totalEmissiveRadiance += diffuseColor.rgb * 0.19 * brnM;
}
`;

/**
 * Shared burn-driver uniforms for one tank visual. uBurnT < 0 disables the
 * whole mask (the clone renders identically to its source material).
 * @param {number} seed
 * @returns {object} uniform refs shared by every burn clone of the tank
 */
export function makeBurnUniforms(seed) {
  return {
    uBurnT: { value: -1 },
    uBurnSeed: { value: (seed % 1000) * 0.37 + 3.1 },
    uBurnLo: { value: 0 },
    uBurnHi: { value: 2.6 },
    uBurnGlow: { value: 0 },
    uBurnEmber: { value: 0 },
  };
}

/**
 * Wrap `mat` IN PLACE with the burn mask, chaining its existing
 * onBeforeCompile stack (CSM cascade patch, GLB camo overlay, ambient-floor
 * hook) so the material keeps its full live look until uBurnT rises past 0.
 *
 * In place, not a clone: vehicle materials are built per visual (procedural
 * set + per-tank GLB camo clones), the GLB camo overlay exists only as a
 * shader hook (a clone loses the paint — r6 verify: pale raw-bake M1A2
 * wreck), and three's CSM keys its uniform registry by the material captured
 * in the hook closure, so only the original object can chain it safely. The
 * mask idles at zero cost when uBurnT < 0 (resetDestroyed), so the wrap can
 * persist for the visual's lifetime.
 *
 * @param {THREE.Material} mat MeshStandardMaterial (or derived), per-visual
 * @param {object} burnU shared uniforms from makeBurnUniforms
 * @returns {boolean} true when the material now carries THIS tank's burn
 *   driver; false when not patchable (or owned by another visual's driver —
 *   caller falls back to the shared burnt material)
 */
export function applyBurnHook(mat, burnU) {
  if (!mat || !mat.isMeshStandardMaterial) return false;
  // shared-material guard: if some cache path ever hands two visuals the
  // same material instance, only the first owns the burn driver — the
  // second visual must not hijack it (its wreck falls back to mats.burnt).
  if (mat.userData.__burnU) return mat.userData.__burnU === burnU;
  mat.userData.__burnU = burnU;
  const prevHook = typeof mat.onBeforeCompile === 'function' ? mat.onBeforeCompile : null;
  const prevKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = function (shader, renderer) {
    if (prevHook) prevHook.call(this, shader, renderer);
    Object.assign(shader.uniforms, burnU);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBrnW;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec4 brnP = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    brnP = instanceMatrix * brnP;
  #endif
  vBrnW = ( modelMatrix * brnP ).xyz;
}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${BURN_COMMON_GLSL}`)
      .replace('#include <roughnessmap_fragment>',
        `${BURN_DIFFUSE_GLSL}\n#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, 0.95, brnM );`)
      .replace('#include <metalnessmap_fragment>',
        '#include <metalnessmap_fragment>\nmetalnessFactor = mix( metalnessFactor, 0.06, brnM );')
      .replace('#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>\n${BURN_EMISSIVE_GLSL}`);
  };
  // the wrapped shader string differs from unwrapped materials sharing the
  // old cache key — suffix it so the program cache never aliases them
  mat.customProgramCacheKey = function () {
    return (typeof prevKey === 'function' ? prevKey.call(this) : '') + '|burn-r6';
  };
  mat.needsUpdate = true;
  return true;
}
