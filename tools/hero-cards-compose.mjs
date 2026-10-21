// Tank hero cards, CPU part: waving-cloth flag layers (one per nation), the shipped encodes and
// manifest rows, and composed cards and boards from tank layers rendered by tools/genHeroCards.mjs.
// No WebGL, no browser, no capture lock. The numbers live in src/ui/heroCardPolicy.ts.
// First-party tooling and generated images: Kevin B. Liu (NOTICE.md).
//
//   node tools/hero-cards-compose.mjs ship --layers <dir> [--ids=a,b | --plan | --all | --flags-only]
//       encode the given ids' tank layers (and every stale flag layer) into public/icons/hero/ and
//       write their hero-cards.json rows; unchanged rows and files stay byte-identical
//   node tools/hero-cards-compose.mjs sheet --out <png> [--kind=roster] [--font <ttf>] [--data-font <ttf>]
//       a contact sheet of every shipped card, composed from the shipped AVIF layers
//   node tools/hero-cards-compose.mjs board --layers <dir> --out <dir> [--ids=a,b,c] [--strip=...]
//       sample boards: every card size per id, a roster strip, the facing comparison
//   node tools/hero-cards-compose.mjs flags --codes=us,de --out <dir>
//
// The flag art is the shipped flag-icons 4x3 SVG (src/ui/flags.ts); the cloth, shading and fly fade
// are procedural and deterministic, so a flag layer changes only when its SVG bytes or the flag
// policy change.

import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  HERO_CAMERA, HERO_CARD_LAYOUT, HERO_ENCODE, HERO_FLAG_MASK, HERO_FRAME, HERO_GROUND, HERO_GUN_SIDE,
  HERO_NAME_LINE_HEIGHT, HERO_POLICY_VERSION, HERO_POSE, HERO_RUNGS, flagMaskStops, heroFlagFiles, heroFlagPolicy, heroTankFiles, nameParts, placeTank,
} from '../src/ui/heroCardPolicy.ts';
import {
  FLAG_SVG_DIR, HERO_DIR, HERO_MANIFEST_PATH, fleetIds, fleetRecords, flagInputs, flagPolicyKey, planHeroCards,
  readHeroManifest, sha, tankInputs, tankPolicyKey,
} from './hero-cards-plan.mjs';
import { uniqueIds } from './id-list.mjs';

// ---------------------------------------------------------------------------
// Flag art

/** Expand SVG marker-mid references into explicit paths (the US 4x3 art draws its 50 stars as markers). */
export function expandMarkers(svg) {
  const markers = new Map();
  for (const m of svg.matchAll(/<marker id="([^"]+)"[^>]*>([\s\S]*?)<\/marker>/g)) markers.set(m[1], m[2]);
  if (!markers.size) return svg;
  let out = svg.replace(/<marker [\s\S]*?<\/marker>/g, '');
  out = out.replace(/<path([^>]*?)marker-mid="url\(#([^)]+)\)"([^>]*?)d="([^"]+)"([^>]*)\/>/g, (all, a, id, b, d) => {
    const body = markers.get(id);
    if (!body) return all;
    const vertices = pathVertices(d);
    const mids = vertices.slice(1, -1);
    return mids.map(([x, y]) => `<g transform="translate(${x} ${y})">${body}</g>`).join('');
  });
  return out;
}

function pathVertices(d) {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
  const verts = [];
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    switch (cmd) {
      case 'M': x = num(); y = num(); sx = x; sy = y; verts.push([x, y]); cmd = 'L'; break;
      case 'm': x += num(); y += num(); sx = x; sy = y; verts.push([x, y]); cmd = 'l'; break;
      case 'L': x = num(); y = num(); verts.push([x, y]); break;
      case 'l': x += num(); y += num(); verts.push([x, y]); break;
      case 'H': x = num(); verts.push([x, y]); break;
      case 'h': x += num(); verts.push([x, y]); break;
      case 'V': y = num(); verts.push([x, y]); break;
      case 'v': y += num(); verts.push([x, y]); break;
      case 'Z': case 'z': x = sx; y = sy; verts.push([x, y]); break;
      default: throw new Error(`pathVertices: unsupported command ${cmd}`);
    }
  }
  return verts;
}


export async function flagImage(code, width, height) {
  const svg = expandMarkers(readFileSync(resolve(FLAG_SVG_DIR, `${code}.svg`), 'utf8'))
    .replace('<svg ', `<svg width="${width}" height="${height}" preserveAspectRatio="none" `);
  return loadImage(Buffer.from(svg));
}

/**
 * Number of bands when a flag's art is pure horizontal bands (every row one colour: RU, DE, PL, UA), else 0.
 * Rasterised small, so the answer follows the shipped SVG rather than a list of codes.
 */
export async function horizontalBands(code) {
  const w = 64, h = 48;
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.drawImage(await flagImage(code, w, h), 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  let bands = 0, prev = null;
  for (let y = 0; y < h; y++) {
    const k0 = y * w * 4;
    for (let x = 1; x < w; x++) {
      const k = k0 + x * 4;
      if (Math.abs(px[k] - px[k0]) + Math.abs(px[k + 1] - px[k0 + 1]) + Math.abs(px[k + 2] - px[k0 + 2]) > 24) return 0;
    }
    const rgb = [px[k0], px[k0 + 1], px[k0 + 2]];
    // Antialiased boundary rows blend two bands: count a band only where the colour holds for two rows.
    if (!prev || Math.abs(rgb[0] - prev[0]) + Math.abs(rgb[1] - prev[1]) + Math.abs(rgb[2] - prev[2]) > 24) {
      const next = y + 1 < h ? [px[k0 + w * 4], px[k0 + w * 4 + 1], px[k0 + w * 4 + 2]] : rgb;
      if (Math.abs(next[0] - rgb[0]) + Math.abs(next[1] - rgb[1]) + Math.abs(next[2] - rgb[2]) <= 24) bands++;
    }
    prev = rgb;
  }
  return bands;
}

// ---------------------------------------------------------------------------
// Cloth

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const hexRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/**
 * Render a nation's waving flag layer (RGBA, policy size, no feather: the card masks it).
 * The cloth is a height field z(u, v) of travelling waves whose amplitude grows from the
 * hoist to the fly; the projection foreshortens the cloth where it tilts (cumulative cos),
 * droops the fly and lifts crests; normals are analytic. `layout` 'reverse' samples the
 * art mirrored (the flag's reverse face); 'stream' bakes the old patch feather.
 */
export async function renderFlagLayer(code, policy = heroFlagPolicy(), overrides = {}) {
  const p = { ...policy, ...overrides };
  const W = p.width, H = p.height;
  const FW = W * p.flagWidth;
  let FH = FW * p.flagAspect;
  const bands = p.bandFit ? await horizontalBands(code) : 0;
  if (bands >= 2) FH = Math.min(FH, (p.bandFit.lowestBandCentreY - p.topY) * H * bands / (bands - 0.5));
  const reverse = p.layout === 'reverse';
  const x0 = reverse ? W * (1 - p.hoistX) : W * p.hoistX; // hoist edge (the reverse face hoists on the right)
  const y0 = H * p.topY;
  const texW = Math.ceil(FW * 1.25), texH = Math.ceil(FH * 1.25);
  const art = await flagImage(code, texW, texH);
  const texCanvas = createCanvas(texW, texH);
  const tctx = texCanvas.getContext('2d');
  tctx.drawImage(art, 0, 0, texW, texH);
  const tex = tctx.getImageData(0, 0, texW, texH).data;

  // Height field tables over u in [0, 1.05], v in [0, 1].
  const NU = 520, NV = 340;
  const Z = new Float32Array((NU + 1) * (NV + 1));
  const ZU = new Float32Array(Z.length);
  const ZV = new Float32Array(Z.length);
  const C = new Float32Array(Z.length);
  const uMax = 1.05;
  const waves = p.flat ? [] : p.waves;
  for (let j = 0; j <= NV; j++) {
    const v = j / NV;
    let acc = 0;
    let prevSlope = 0;
    for (let i = 0; i <= NU; i++) {
      const u = (i / NU) * uMax;
      const grow = p.ampBase + (1 - p.ampBase) * Math.pow(u, p.ampGrowth);
      const growU = (1 - p.ampBase) * p.ampGrowth * Math.pow(Math.max(u, 1e-6), p.ampGrowth - 1);
      let z = 0, zu = 0, zv = 0;
      for (const w of waves) {
        const arg = 2 * Math.PI * (w.freq * u + w.slant * v - w.phase);
        const s = Math.sin(arg), c = Math.cos(arg);
        z += w.amp * grow * s;
        zu += w.amp * (growU * s + grow * 2 * Math.PI * w.freq * c);
        zv += w.amp * grow * 2 * Math.PI * w.slant * c;
      }
      const k = j * (NU + 1) + i;
      Z[k] = z; ZU[k] = zu; ZV[k] = zv;
      const slope = 1 - 1 / Math.sqrt(1 + zu * zu);
      if (i > 0) acc += 0.5 * (slope + prevSlope) * (uMax / NU);
      prevSlope = slope;
      C[k] = acc;
    }
  }
  const sampleTable = (T, u, v) => {
    const fu = Math.min(NU - 1e-4, Math.max(0, (u / uMax) * NU));
    const fv = Math.min(NV - 1e-4, Math.max(0, v * NV));
    const i = fu | 0, j = fv | 0, a = fu - i, b = fv - j;
    const k = j * (NU + 1) + i;
    return (T[k] * (1 - a) + T[k + 1] * a) * (1 - b) + (T[k + NU + 1] * (1 - a) + T[k + NU + 2] * a) * b;
  };
  const tilt = p.tilt;
  const L = p.light;
  const ll = Math.hypot(L[0], L[1], L[2]);
  // The height field lives in flag space (u toward the fly); the reverse face runs u toward screen-left.
  const lx = (reverse ? -L[0] : L[0]) / ll, ly = L[1] / ll, lz = L[2] / ll;
  const hx = lx, hy = ly, hz = lz + 1;
  const hl = Math.hypot(hx, hy, hz);
  const flatShade = p.ambient + p.diffuse * lz;
  const ground = hexRgb(p.groundHex || HERO_GROUND.mid);
  const zMax = waves.reduce((sum, w) => sum + w.amp, 0) || 1;
  const stream = p.layout === 'stream';

  const out = createCanvas(W, H);
  const octx = out.getContext('2d');
  const img = octx.createImageData(W, H);
  const data = img.data;
  const SS = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
  for (let Y = 0; Y < H; Y++) {
    const fadeBottom = stream ? 1 - smooth(p.feather.bottom[0] * H, p.feather.bottom[1] * H, Y) : 1;
    if (fadeBottom <= 0) continue;
    for (let X = 0; X < W; X++) {
      const fadeRight = stream ? 1 - smooth(p.feather.right[0] * W, p.feather.right[1] * W, X) : 1;
      if (fadeRight <= 0) continue;
      let r = 0, g = 0, b = 0, cover = 0, hoistFade = 0;
      for (const [ox, oy] of SS) {
        const s = (reverse ? x0 - (X + ox) : (X + ox) - x0) / FW;
        const t = (Y + oy - y0) / FH;
        if (s < -0.05 || s > 1.05 || t < -0.1 || t > 1.1) continue;
        let u = s, v = t;
        for (let it = 0; it < 4; it++) {
          const c = sampleTable(C, u, v);
          const z = sampleTable(Z, u, v);
          u = s + c;
          v = t - (p.droop * u * u + tilt * z * (FW / FH));
        }
        if (u < 0 || u > 1 || v < 0 || v > 1) continue;
        const z = sampleTable(Z, u, v);
        const zu = sampleTable(ZU, u, v);
        const zv = sampleTable(ZV, u, v) * (FW / FH);
        const nl = Math.hypot(zu, zv, 1);
        const nx = -zu / nl, ny = -zv / nl, nz = 1 / nl;
        const diff = Math.max(0, nx * lx + ny * ly + nz * lz);
        const spec = Math.pow(Math.max(0, (nx * hx + ny * hy + nz * hz) / hl), p.shininess) * p.specular;
        const trough = 1 - p.troughDarken * Math.max(0, -z / zMax);
        // Relative to the flat cloth: shadows at full depth, highlights at `highlightGain`
        // (the sheen supplies the bright ridges, so lit colour never washes toward pink).
        const rel = (p.ambient + p.diffuse * diff) / flatShade;
        const shade = (rel > 1 ? 1 + (rel - 1) * (p.highlightGain ?? 1) : 1 - (1 - rel) * (p.shadowGain ?? 1)) * trough;
        // Bilinear texel. u runs from the hoist; the reverse face is mirrored on screen by s.
        const tx = u * (texW - 1), ty = v * (texH - 1);
        const ix = Math.min(texW - 2, tx | 0), iy = Math.min(texH - 2, ty | 0);
        const ax = tx - ix, ay = ty - iy;
        const k00 = (iy * texW + ix) * 4, k10 = k00 + 4, k01 = k00 + texW * 4, k11 = k01 + 4;
        for (let ch = 0; ch < 3; ch++) {
          const val = (tex[k00 + ch] * (1 - ax) + tex[k10 + ch] * ax) * (1 - ay)
            + (tex[k01 + ch] * (1 - ax) + tex[k11 + ch] * ax) * ay;
          const lit = val * shade + 255 * spec;
          if (ch === 0) r += lit; else if (ch === 1) g += lit; else b += lit;
        }
        cover += 1;
        // The hoist always fades; the fly fades only where a layout keeps it inside the card (mirrorRight).
        hoistFade += smooth(0, p.hoistFeather ?? 0.05, u) * smooth(0, 0.006, v)
          * (p.flyFeather ? 1 - smooth(1 - p.flyFeather, 1, u) : 1);
      }
      if (!cover) continue;
      r /= cover; g /= cover; b /= cover;
      // Grade: saturation and level, then a soft shoulder so white cloth stays a backdrop.
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = (lum + (r - lum) * p.saturation) * p.brightness;
      g = (lum + (g - lum) * p.saturation) * p.brightness;
      b = (lum + (b - lum) * p.saturation) * p.brightness;
      const ceiling = 255 * (p.whiteCeiling ?? 1);
      const knee = ceiling * 0.7;
      const lum2 = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (lum2 > knee) {
        const over = lum2 - knee;
        const range = ceiling - knee;
        const mapped = knee + range * (1 - Math.exp(-over / range));
        const k = mapped / lum2;
        r *= k; g *= k; b *= k;
      }
      // Black fields (DE, KR trigrams) keep a dark-grey floor so their folds still read on the ground.
      const floor = 255 * (p.blackFloor ?? 0);
      r = floor + r * (1 - floor / 255); g = floor + g * (1 - floor / 255); b = floor + b * (1 - floor / 255);
      r = r * (1 - p.haze) + ground[0] * p.haze;
      g = g * (1 - p.haze) + ground[1] * p.haze;
      b = b * (1 - p.haze) + ground[2] * p.haze;
      const alpha = (cover / 4) * (hoistFade / cover) * fadeRight * fadeBottom * (p.maxAlpha ?? 1);
      const k = (Y * W + X) * 4;
      data[k] = Math.min(255, r); data[k + 1] = Math.min(255, g); data[k + 2] = Math.min(255, b);
      data[k + 3] = Math.round(Math.min(1, alpha) * 255);
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}


// ---------------------------------------------------------------------------
// Masks and cards

/**
 * Apply HERO_FLAG_MASK to a flag already drawn on `ctx` (w x h flag box): an ellipse anchored at
 * the rear-top corner, opaque inside `inner`, smoothstep to clear at its rim. The same stops drive
 * the runtime card's CSS mask-image (heroFlagMaskCss).
 */
export function applyFlagMask(ctx, w, h, { facing = HERO_CAMERA.facing, mask = HERO_FLAG_MASK, opacity = mask.opacity } = {}) {
  const ax = (facing === 'right' ? 1 - mask.anchorX : mask.anchorX) * w;
  const ay = mask.anchorY * h;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.translate(ax, ay);
  ctx.scale(mask.radiusX * w, mask.radiusY * h);
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const [t, a] of flagMaskStops(mask)) grad.addColorStop(t, `rgba(0,0,0,${(a * opacity).toFixed(4)})`);
  ctx.fillStyle = grad;
  ctx.fillRect(-4, -4, 8, 8);
  ctx.restore();
}

export function groundFill(ctx, w, h, ground = HERO_GROUND) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, ground.top);
  grad.addColorStop(0.55, ground.mid);
  grad.addColorStop(1, ground.bottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // A soft lift behind the hull, so dark running gear separates from the ground.
  const lift = ctx.createRadialGradient(w * 0.5, h * 0.55, 0, w * 0.5, h * 0.55, Math.max(w, h) * 0.62);
  lift.addColorStop(0, ground.lift);
  lift.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = lift;
  ctx.fillRect(0, 0, w, h);
}

const INK = '#F6F3EC';
const TUNGSTEN = '#F0A030';

/** A tank layer's placement bounds (fractions of the layer width) from the renderer's meta. */
export function boundsFromMeta(meta, layerWidth = HERO_FRAME.width) {
  const c = meta.coreBounds, f = meta.fullBounds, W = layerWidth;
  return { cx: (c.x0 + c.x1) / 2 / W, cw: (c.x1 - c.x0) / W, ch: (c.bottom - c.y0) / W, cb: c.bottom / W, fx0: f.x0 / W, fx1: f.x1 / W };
}

/** Manifest form of the bounds: [cx, cw, ch, cb, fx0, fx1], four decimals. */
export const boundsArray = (b) => [b.cx, b.cw, b.ch, b.cb, b.fx0, b.fx1].map((v) => Number(v.toFixed(4)));
export const boundsOf = ([cx, cw, ch, cb, fx0, fx1]) => ({ cx, cw, ch, cb, fx0, fx1 });

/**
 * Bounds measured from a transparent layer: portraitFraming's alpha-weighted quantiles for the dense
 * core (blind to the barrel and whips) and every column with alpha > 8 for the whole silhouette.
 */
export function measureBounds(image) {
  const w = image.width, h = image.height;
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const px = ctx.getImageData(0, 0, w, h).data;
  const xs = new Float64Array(w), ys = new Float64Array(h);
  let total = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = px[(y * w + x) * 4 + 3];
      if (a <= 48) continue;
      xs[x] += a; ys[y] += a; total += a;
    }
  }
  const q = (weights, f) => {
    let acc = 0;
    for (let i = 0; i < weights.length; i++) { acc += weights[i]; if (acc >= total * f) return i; }
    return weights.length - 1;
  };
  const x0 = q(xs, 0.06), x1 = q(xs, 0.94) + 1, y0 = q(ys, 0.03), bottom = q(ys, 0.985) + 1;
  let fx0 = w, fx1 = -1;
  for (let x = 0; x < w; x++) {
    let any = false;
    for (let y = 0; y < h && !any; y++) any = px[(y * w + x) * 4 + 3] > 8;
    if (any) { if (x < fx0) fx0 = x; fx1 = x; }
  }
  return { cx: (x0 + x1) / 2 / w, cw: (x1 - x0) / w, ch: (bottom - y0) / w, cb: bottom / w, fx0: fx0 / w, fx1: (fx1 + 1) / w };
}

/** Draw the masked flag layer into a w x h box (cover, anchored at the rear-top corner). */
export function drawFlag(ctx, flag, x, y, w, h, { facing = HERO_CAMERA.facing, selected = false } = {}) {
  if (!flag) return;
  const box = createCanvas(Math.round(w), Math.round(h));
  const bctx = box.getContext('2d');
  const s = Math.max(w / flag.width, h / flag.height);
  const fw = flag.width * s, fh = flag.height * s;
  bctx.drawImage(flag, facing === 'right' ? 0 : w - fw, 0, fw, fh);
  applyFlagMask(bctx, w, h, { facing, opacity: selected ? HERO_FLAG_MASK.selectedOpacity : HERO_FLAG_MASK.opacity });
  ctx.drawImage(box, x, y, w, h);
}

/** Draw a tank layer placed by the policy's placeTank (the runtime card's CSS evaluates the same rule). */
export function drawTank(ctx, tank, bounds, box) {
  const placed = placeTank(bounds, box);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(tank, placed.dx, placed.dy, placed.k, placed.k * (tank.height / tank.width));
  return placed;
}

function fitFont(ctx, text, family, weight, size, maxWidth, minSize) {
  let s = size;
  for (; s > minSize; s -= 0.5) {
    ctx.font = `${weight} ${s}px "${family}"`;
    if (ctx.measureText(text).width <= maxWidth) break;
  }
  ctx.font = `${weight} ${s}px "${family}"`;
  return s;
}

/** How many lines the name takes on a card (the hollow kinds and a name that fits keep one line). */
function nameLines(ctx, name, { size, maxWidth, font, hollow }) {
  const { variant } = nameParts(name);
  if (hollow || !variant) return 1;
  ctx.font = `600 ${size}px "${font}"`;
  return ctx.measureText(name).width <= maxWidth ? 1 : 2;
}

function drawName(ctx, name, { x, y, size, minSize, maxWidth, font, hollow, scale }) {
  const { solid, variant } = nameParts(name);
  ctx.textBaseline = 'alphabetic';
  if (hollow && variant) {
    const s = fitFont(ctx, `${solid} ${variant}`, font, 600, size, maxWidth, minSize);
    ctx.fillStyle = INK;
    ctx.fillText(solid, x, y);
    const sw = ctx.measureText(`${solid} `).width;
    ctx.lineWidth = Math.max(scale, s / 24);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = TUNGSTEN;
    ctx.strokeText(variant, x + sw, y);
    return;
  }
  ctx.font = `600 ${size}px "${font}"`;
  ctx.fillStyle = INK;
  if (ctx.measureText(name).width <= maxWidth || !variant) {
    fitFont(ctx, name, font, 600, size, maxWidth, minSize);
    ctx.fillText(name, x, y);
    return;
  }
  // Two lines, never truncated (the runtime card wraps the same way).
  const lines = [solid, variant];
  const s2 = Math.max(...lines.map((line) => fitFont(ctx, line, font, 600, size, maxWidth, minSize)));
  ctx.font = `600 ${Math.min(size, s2)}px "${font}"`;
  ctx.fillText(solid, x, y - Math.min(size, s2) * 1.05);
  ctx.fillText(variant, x, y);
}

/** The tier badge, written "Tier X" in the data face: the word in muted ink, the numeral in tungsten. */
function drawTierChip(ctx, tier, { x, right, y, size, font, scale }) {
  ctx.font = `500 ${size}px "${font}"`;
  const word = 'Tier ';
  const ww = ctx.measureText(word).width;
  const tw = ww + ctx.measureText(tier).width;
  const bh = Math.round(size * 1.55), bw = Math.round(tw + size * 0.9);
  if (x == null) x = right - bw;
  ctx.fillStyle = 'rgba(11,14,17,0.72)';
  ctx.fillRect(x, y, bw, bh);
  ctx.strokeStyle = 'rgba(246,243,236,0.20)';
  ctx.lineWidth = scale;
  ctx.strokeRect(x + scale / 2, y + scale / 2, bw - scale, bh - scale);
  ctx.textBaseline = 'middle';
  const tx = x + (bw - tw) / 2, ty = y + bh / 2 + scale * 0.5;
  ctx.fillStyle = 'rgba(246,243,236,0.72)';
  ctx.fillText(word, tx, ty);
  ctx.fillStyle = TUNGSTEN;
  ctx.fillText(tier, tx + ww, ty);
  ctx.textBaseline = 'alphabetic';
}

/**
 * Compose one card at `scale` (device pixel ratio): ground, masked flag, tank, then the name in the
 * band under the contact line (never over the hull), the tier chip in the bow-side top corner (the flag
 * holds the rear-top corner) and the frame. No eyebrow, no nation text: the flag is the nation. `gunSide`
 * is the layer's measured gun side (the turret swung past the lens points it away from the bow).
 */
export function composeCard(kind, { tank, bounds, flag, name, tier, font = 'Chakra Petch', dataFont = 'IBM Plex Mono', selected = false, facing = HERO_CAMERA.facing, gunSide = HERO_GUN_SIDE, ground = HERO_GROUND }, scale = 2) {
  const L = HERO_CARD_LAYOUT[kind];
  const w = L.width * scale, h = L.height * scale;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  groundFill(ctx, w, h, ground);
  const band = L.nameBand * scale;
  const pad = L.pad * scale;
  const nameBox = { size: L.nameSize * scale, minSize: L.minName * scale, maxWidth: w - pad * 2, font, hollow: L.hollow };
  // A second name line lifts the art box by one line (the runtime card's .hc-n2 --hc-lift).
  const lift = nameLines(ctx, name, nameBox) === 2 ? L.nameSize * scale * HERO_NAME_LINE_HEIGHT : 0;
  drawFlag(ctx, flag, 0, 0, w, h - band * HERO_FLAG_MASK.bandInset, { facing, selected });
  const artH = h - band - lift;
  drawTank(ctx, tank, bounds, {
    w, artH, baseline: artH + 2 * scale, coreShare: L.coreShare, coreHeight: L.coreHeight, centerX: L.centerX, gunSide,
  });
  // A quiet floor under the name so the type never fights the flag's last fade.
  const floorTop = h - band - lift - 6 * scale;
  const floor = ctx.createLinearGradient(0, floorTop, 0, h);
  floor.addColorStop(0, 'rgba(11,14,17,0)');
  floor.addColorStop(0.5, 'rgba(11,14,17,0.5)');
  floor.addColorStop(1, 'rgba(11,14,17,0.8)');
  ctx.fillStyle = floor;
  ctx.fillRect(0, floorTop, w, h - floorTop);
  drawName(ctx, name, { x: pad, y: h - pad * 0.95, ...nameBox, scale });
  if (L.tier && tier) {
    const inset = Math.round(pad * 0.7);
    drawTierChip(ctx, tier, {
      x: facing === 'right' ? null : inset, right: w - inset, y: inset, size: Math.round(L.tierSize * scale), font: dataFont, scale,
    });
  }
  ctx.lineWidth = selected ? 2 * scale : scale;
  ctx.strokeStyle = selected ? TUNGSTEN : 'rgba(246,243,236,0.13)';
  const inset = ctx.lineWidth / 2;
  ctx.strokeRect(inset, inset, w - 2 * inset, h - 2 * inset);
  return canvas;
}

/**
 * 1200x630 social card: the tank with its gun into the open side, the flag behind its rear, the name
 * large in the bow-side top corner (variant hollow), the bottom lockup zone kept clear.
 */
export function composeOg({ tank, bounds, flag, name, font = 'Chakra Petch', facing = HERO_CAMERA.facing, gunSide = HERO_GUN_SIDE, ground = HERO_GROUND }) {
  const w = 1200, h = 630;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  groundFill(ctx, w, h, ground);
  drawFlag(ctx, flag, facing === 'right' ? 0 : w * 0.18, 0, w * 0.82, h * 0.92, { facing });
  drawTank(ctx, tank, bounds, { w, artH: h * 0.80, baseline: h * 0.88, coreShare: 0.64, coreHeight: 0.70, centerX: 0.60, gunSide });
  const { solid, variant } = nameParts(name);
  const pad = 64;
  const s = fitFont(ctx, solid, font, 600, 92, 460, 52);
  const x = facing === 'right' ? w - pad - Math.max(ctx.measureText(solid).width, variant ? ctx.measureText(variant).width : 0) : pad;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK;
  ctx.fillText(solid, x, 60 + s);
  if (variant) {
    ctx.lineWidth = Math.max(1.5, s / 26);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = TUNGSTEN;
    ctx.strokeText(variant, x, 60 + s * 2.02);
  }
  return canvas;
}

// ---------------------------------------------------------------------------
// Encodes

/** A layer resampled to `width` (aspect kept), stepping down from the master for clean edges. */
function rung(image, width) {
  const height = Math.round(width * (image.height / image.width));
  const c = createCanvas(width, height);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, width, height);
  return c;
}

/** @napi-rs/canvas's AVIF `quality` is a quantizer and toBuffer ignores options, so AVIF goes through encodeSync. */
const encodeAvif = (canvas) => canvas.encodeSync('avif', { quality: HERO_ENCODE.avifQuantizer, alphaQuality: HERO_ENCODE.avifQuantizer, speed: HERO_ENCODE.avifSpeed });
const encodeWebp = (canvas) => canvas.toBuffer('image/webp', HERO_ENCODE.webpQuality);

/** [480 AVIF, 960 AVIF, 480 WebP] buffers of one layer (the order of heroTankFiles / heroFlagFiles). */
function encodeLayer(image) {
  const [small, large] = HERO_RUNGS.tank;
  const big = rung(image, large);
  const little = rung(big, small);
  return [encodeAvif(little), encodeAvif(big), encodeWebp(little)];
}

function writeLayerFiles(names, buffers) {
  mkdirSync(HERO_DIR, { recursive: true });
  names.forEach((name, index) => writeFileSync(resolve(HERO_DIR, name), buffers[index]));
  return { sha: buffers.map((buffer) => sha(buffer)), bytes: buffers.map((buffer) => buffer.length) };
}

/** The manifest as written: stable key order, one tank or flag per line, so a changed-only ship diffs by row. */
export function formatHeroManifest(manifest) {
  const row = (value) => JSON.stringify(value);
  const block = (record) => Object.keys(record).sort().map((key) => `  ${JSON.stringify(key)}: ${row(record[key])}`).join(',\n');
  return `{\n "schema": ${manifest.schema},\n "policyVersion": ${manifest.policyVersion},\n "facing": ${row(manifest.facing)},\n` +
    ` "tankPolicyKey": ${row(manifest.tankPolicyKey)},\n "flagPolicyKey": ${row(manifest.flagPolicyKey)},\n` +
    ` "flags": {\n${block(manifest.flags)}\n },\n "tanks": {\n${block(manifest.tanks)}\n }\n}\n`;
}

// ---------------------------------------------------------------------------
// CLI

const args = process.argv.slice(2);
function opt(name, fallback = '') {
  const prefix = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

function registerFonts() {
  const font = opt('font');
  if (font) GlobalFonts.registerFromPath(font, 'Chakra Petch');
  const dataFont = opt('data-font');
  if (dataFont) GlobalFonts.registerFromPath(dataFont, 'IBM Plex Mono');
}

/**
 * Ship: encode the requested ids' tank layers and every stale flag layer into public/icons/hero/ and
 * record their manifest rows. Ids not requested keep their rows and files byte-identical. A layer
 * rendered under another tank policy is refused, and a policy change ships only with --all.
 */
async function ship() {
  const layersDir = resolve(opt('layers'));
  const fleet = fleetRecords();
  const plan = planHeroCards();
  let ids;
  if (opt('ids')) ids = uniqueIds(opt('ids').split(',').map((id) => id.trim()).filter(Boolean));
  else if (args.includes('--plan')) ids = plan.stale.map((row) => row.id);
  else if (args.includes('--all')) ids = fleetIds();
  else if (args.includes('--flags-only')) ids = [];
  else throw new Error('ship: pass --ids=<id,...>, --plan, --all or --flags-only');
  const previous = readHeroManifest();
  const policyKey = tankPolicyKey();
  const policyMoved = !!previous && previous.tankPolicyKey !== policyKey;
  if (policyMoved && !args.includes('--all')) throw new Error('ship: the tank policy moved; every card is stale and a full ship needs --all');
  const manifest = {
    schema: 1,
    policyVersion: HERO_POLICY_VERSION,
    facing: HERO_CAMERA.facing,
    tankPolicyKey: policyKey,
    flagPolicyKey: flagPolicyKey(),
    flags: { ...(previous?.flags || {}) },
    tanks: policyMoved ? {} : { ...(previous?.tanks || {}) },
  };
  const t0 = Date.now();
  for (const { code, why } of plan.flags) {
    const t = Date.now();
    const layer = await renderFlagLayer(code);
    const written = writeLayerFiles(heroFlagFiles(code), encodeLayer(layer));
    manifest.flags[code] = { in: flagInputs(code), ...written };
    console.log(`[hero-ship] flag ${code} (${why.join(', ')}) ${written.bytes.join('/')} B  ${Date.now() - t} ms`);
  }
  for (const id of ids) {
    const record = fleet.get(id);
    if (!record) throw new Error(`ship: ${id} is not in the fleet`);
    const metaPath = resolve(layersDir, `${id}.json`);
    if (!existsSync(metaPath)) throw new Error(`ship: no rendered layer for ${id} in ${layersDir}`);
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    if (meta.policyKey !== policyKey) throw new Error(`ship: ${id} was rendered under policy ${meta.policyKey || '-'}, not ${policyKey}`);
    if (meta.facing !== HERO_CAMERA.facing || meta.bowSide !== HERO_CAMERA.facing) throw new Error(`ship: ${id} faces ${meta.facing} (bow measured ${meta.bowSide}), the policy ${HERO_CAMERA.facing}`);
    if (meta.gunSide !== 'left' && meta.gunSide !== 'right') throw new Error(`ship: ${id} has no measured gun side (render it under the current page)`);
    const layer = await loadImage(resolve(layersDir, `${id}.png`));
    const written = writeLayerFiles(heroTankFiles(id), encodeLayer(layer));
    manifest.tanks[id] = {
      flag: record.flag,
      in: tankInputs(record),
      b: boundsArray(boundsFromMeta(meta, layer.width)),
      // Measured by projection through the card lens: [bow side, gun side]; and the pose the layer shows:
      // [unsigned traverse used (deg; 0 = gun on the hull axis), turret yaw (deg), gun pitch (deg)].
      face: [meta.bowSide, meta.gunSide],
      pose: [meta.pose.traverseDeg ?? 0, meta.pose.turretYawDeg, meta.pose.gunPitchDeg],
      // Why a gun did not take the full policy traverse: no turret rig, a turretless mount, or a limited arc.
      ...(!meta.pose.turret ? { mount: 'none' } : meta.pose.turretless ? { mount: 'turretless' }
        : (meta.pose.traverseDeg ?? 0) < HERO_POSE.turretTowardCameraDeg ? { mount: 'arc' } : {}),
      ...written,
      fill: meta.coreFill,
      ...(meta.clipped ? { clipped: true } : {}),
      ...(meta.whipsFaded ? { whips: true } : {}),
      audit: [meta.geometryHash, meta.paintHash],
    };
    console.log(`[hero-ship] ${id} ${written.bytes.join('/')} B${meta.clipped ? '  CLIPPED' : ''}`);
  }
  for (const id of plan.extra) console.warn(`[hero-ship] row ${id} is no longer in the fleet (kept; remove it deliberately)`);
  writeFileSync(HERO_MANIFEST_PATH, formatHeroManifest(manifest));
  console.log(`[hero-ship] ${ids.length} tanks, ${plan.flags.length} flags in ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${HERO_MANIFEST_PATH}`);
}

/** The fleet in the Garage's reading order: nation, then tier (high first), then name. */
function sheetOrder(records) {
  const tierValue = (numeral) => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'].indexOf(numeral) + 1;
  return [...records].sort((a, b) => a.flag.localeCompare(b.flag) || tierValue(b.tierNumeral) - tierValue(a.tierNumeral) || a.name.localeCompare(b.name));
}

/** Contact sheet: every shipped card at one kind, composed from the shipped AVIF layers (what players load). */
async function sheet() {
  registerFonts();
  const manifest = readHeroManifest();
  if (!manifest) throw new Error('sheet: no hero manifest; ship first');
  const kind = opt('kind', 'roster');
  const scale = Number(opt('scale', '1'));
  const L = HERO_CARD_LAYOUT[kind];
  const records = sheetOrder([...fleetRecords().values()].filter((record) => manifest.tanks[record.id]));
  const rungIndex = L.width * scale > 240 ? 1 : 0;
  const flags = new Map();
  const cols = Number(opt('cols', String(Math.min(16, Math.ceil(Math.sqrt(records.length * 1.6))))));
  const gap = 8 * scale, head = 44 * scale;
  const cw = L.width * scale, ch = L.height * scale;
  const rows = Math.ceil(records.length / cols);
  const canvas = createCanvas(cols * (cw + gap) + gap, head + rows * (ch + gap) + gap);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#07090B';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = `500 ${15 * scale}px "Chakra Petch"`;
  ctx.fillStyle = '#9A9A95';
  const gunCounts = records.reduce((acc, record) => { const side = manifest.tanks[record.id].face?.[1] || '?'; acc[side] = (acc[side] || 0) + 1; return acc; }, {});
  ctx.fillText(`Tank hero cards: ${records.length} of ${fleetIds().length} vehicles, ${kind} ${L.width}x${L.height} at ${scale}x, policy v${manifest.policyVersion}, hulls facing ${manifest.facing}, guns ${Object.entries(gunCounts).map(([side, n]) => `${side} ${n}`).join(' / ')}, from the shipped AVIF layers`, gap, 28 * scale);
  for (const [index, record] of records.entries()) {
    const row = manifest.tanks[record.id];
    if (!flags.has(row.flag)) flags.set(row.flag, await loadImage(resolve(HERO_DIR, heroFlagFiles(row.flag)[rungIndex])));
    const tank = await loadImage(resolve(HERO_DIR, heroTankFiles(record.id)[rungIndex]));
    const card = composeCard(kind, {
      tank, bounds: boundsOf(row.b), flag: flags.get(row.flag), name: record.shortName, tier: record.tierNumeral,
      selected: index === 0, facing: manifest.facing, gunSide: row.face?.[1] ?? HERO_GUN_SIDE,
    }, scale);
    ctx.drawImage(card, gap + (index % cols) * (cw + gap), head + Math.floor(index / cols) * (ch + gap));
  }
  const out = resolve(opt('out'));
  writeFileSync(out, canvas.toBuffer('image/png'));
  console.log(`[hero-sheet] ${records.length} cards -> ${out}`);
}

/**
 * Sample boards from master layers (genHeroCards output): every card size per final id plus the OG
 * card, and a roster strip at 2x and 1x.
 */
async function board() {
  registerFonts();
  const layersDir = resolve(opt('layers'));
  const out = resolve(opt('out'));
  mkdirSync(out, { recursive: true });
  const fleet = fleetRecords();
  const ids = uniqueIds(opt('ids', 'm1a2_abrams_sepv3,leo2a7v,t90m').split(','));
  const strip = opt('strip', '').split(',').filter(Boolean);
  const flags = new Map();
  const load = async (id) => {
    const record = fleet.get(id);
    const meta = JSON.parse(readFileSync(resolve(layersDir, `${id}.json`), 'utf8'));
    const tank = await loadImage(resolve(layersDir, `${id}.png`));
    if (!flags.has(record.flag)) flags.set(record.flag, await renderFlagLayer(record.flag));
    return { tank, bounds: boundsFromMeta(meta, tank.width), flag: flags.get(record.flag), name: record.shortName, tier: record.tierNumeral, facing: meta.facing, gunSide: meta.gunSide ?? HERO_GUN_SIDE };
  };
  const gap = 40;
  const kinds = ['endScreen', 'deploy', 'galleryBrowse', 'roster', 'rosterCompact'];
  const rowW = 2 * (HERO_CARD_LAYOUT.endScreen.width + HERO_CARD_LAYOUT.deploy.width + HERO_CARD_LAYOUT.galleryBrowse.width + HERO_CARD_LAYOUT.roster.width) + 5 * gap;
  const rowH = 2 * HERO_CARD_LAYOUT.endScreen.height + gap + 315 + gap;
  const canvas = createCanvas(rowW, ids.length * rowH + gap);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#07090B';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  let y = gap;
  for (const id of ids) {
    const card = await load(id);
    const set = Object.fromEntries(kinds.map((kind) => [kind, composeCard(kind, { ...card, selected: kind === 'roster' }, 2)]));
    let x = gap;
    for (const kind of ['endScreen', 'deploy', 'galleryBrowse']) { ctx.drawImage(set[kind], x, y); x += set[kind].width + gap; }
    ctx.drawImage(set.roster, x, y);
    ctx.drawImage(composeCard('roster', card, 2), x, y + set.roster.height + 16);
    ctx.drawImage(set.rosterCompact, x, y + 2 * set.roster.height + 32);
    const og = composeOg(card);
    writeFileSync(resolve(out, `${id}__og.jpg`), og.toBuffer('image/jpeg', 86));
    ctx.drawImage(og, gap, y + 2 * HERO_CARD_LAYOUT.endScreen.height + gap, 600, 315);
    y += rowH;
  }
  writeFileSync(resolve(out, 'board-final-compositions.png'), canvas.toBuffer('image/png'));
  if (strip.length) {
    const cards = [];
    for (const [index, id] of strip.entries()) cards.push(composeCard('roster', { ...(await load(id)), selected: index === 0 }, 2));
    const L = HERO_CARD_LAYOUT.roster;
    const step = 2 * L.width + 16;
    const s = createCanvas(cards.length * step + 48, 2 * L.height + 64 + L.height + 60);
    const sctx = s.getContext('2d');
    sctx.fillStyle = '#07090B';
    sctx.fillRect(0, 0, s.width, s.height);
    cards.forEach((card, index) => sctx.drawImage(card, 32 + index * step, index === 0 ? 20 : 32));
    cards.forEach((card, index) => sctx.drawImage(card, 32 + index * (L.width + 8), 2 * L.height + 76, L.width, L.height));
    writeFileSync(resolve(out, 'board-roster-strip.png'), s.toBuffer('image/png'));
  }
  console.log(`[hero-board] ${out}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = args[0];
  if (mode === 'ship') await ship();
  else if (mode === 'sheet') await sheet();
  else if (mode === 'board') await board();
  else if (mode === 'flags') {
    const out = resolve(opt('out'));
    mkdirSync(out, { recursive: true });
    for (const code of opt('codes', 'us').split(',')) {
      const layer = await renderFlagLayer(code);
      writeFileSync(resolve(out, `flag-${code}.png`), layer.toBuffer('image/png'));
      console.log(`[hero-flags] ${code}`);
    }
  } else {
    console.error('usage: hero-cards-compose.mjs ship --layers <dir> [--ids=...|--plan|--all] | sheet --out <png> | board --layers <dir> --out <dir> | flags --codes=us --out <dir>');
    process.exit(1);
  }
}
