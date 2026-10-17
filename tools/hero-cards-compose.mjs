// Tank hero cards, CPU part: waving-cloth flag layers (one per nation) and the
// composed cards (roster, deploy, Gallery browse, end screen, OG) from a tank layer
// rendered by tools/genHeroCards.mjs. No WebGL, no browser, no capture lock.
// First-party tooling and generated images: Kevin B. Liu (NOTICE.md).
//
//   node tools/hero-cards-compose.mjs flags --codes=us,de,ru --out <dir>
//   node tools/hero-cards-compose.mjs board --layers <dir> --flags <dir> --out <dir> [--font <ttf>]
//
// The flag art is the shipped flag-icons 4x3 SVG (src/ui/flags.ts); the cloth,
// shading and feather are procedural and deterministic, so a flag layer changes
// only when its SVG bytes or HERO_POLICY_VERSION change.

import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { HERO_FLAG, HERO_FLAG_MASK, HERO_GROUND, HERO_GROUNDS, HERO_CARD_SIZES, HERO_RUNGS } from './hero-card-policy.mjs';

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

const FLAG_DIR = 'node_modules/flag-icons/flags/4x3';

export async function flagImage(code, width, height) {
  const svg = expandMarkers(readFileSync(resolve(FLAG_DIR, `${code}.svg`), 'utf8'))
    .replace('<svg ', `<svg width="${width}" height="${height}" preserveAspectRatio="none" `);
  return loadImage(Buffer.from(svg));
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
export async function renderFlagLayer(code, policy = HERO_FLAG, overrides = {}) {
  const p = { ...policy, ...overrides };
  const W = p.width, H = p.height;
  const FW = W * p.flagWidth;
  const FH = FW * p.flagAspect;
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
        const shade = (rel > 1 ? 1 + (rel - 1) * (p.highlightGain ?? 1) : rel) * trough;
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
        hoistFade += smooth(0, p.hoistFeather ?? 0.05, u) * smooth(0, 0.006, v);
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

/** The sample boards' alternative flag layouts (the shipped layer is HERO_FLAG as is). */
export const FLAG_LAYOUTS = Object.freeze({
  mirror: Object.freeze({}),
  // The same obverse cloth for a right-facing card: hoist off the left edge, as in the owner's reference.
  mirrorRight: Object.freeze({ hoistX: -0.06 }),
  reverse: Object.freeze({ layout: 'reverse', hoistX: -0.04, flagWidth: 0.80, topY: -0.06 }),
  stream: Object.freeze({
    layout: 'stream', hoistX: 0.36, topY: 0.035, flagWidth: 0.80, hoistFeather: 0.12, maxAlpha: 0.92,
    feather: Object.freeze({ right: [0.62, 1.0], bottom: [0.48, 0.94] }),
  }),
});

/**
 * Apply HERO_FLAG_MASK to a flag already drawn on `ctx` (w x h card box): an ellipse
 * anchored at the rear-top corner, opaque inside `inner`, smoothstep to clear at its
 * rim. The same stops drive the Garage's CSS mask-image (heroFlagMaskCss).
 */
export function applyFlagMask(ctx, w, h, { facing = 'left', mask = HERO_FLAG_MASK, opacity = mask.opacity } = {}) {
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

/** Mask stops: [t along the ellipse radius, alpha], a smoothstep from `inner` to the rim. */
export function flagMaskStops(mask = HERO_FLAG_MASK) {
  const stops = [[0, 1]];
  for (let i = 0; i <= 8; i++) {
    const t = mask.inner + (1 - mask.inner) * (i / 8);
    const x = i / 8;
    stops.push([Number(t.toFixed(4)), Number((1 - x * x * (3 - 2 * x)).toFixed(4))]);
  }
  return stops;
}

/** The Garage card's CSS for the same mask (the flag layer sits in a ::before). */
export function heroFlagMaskCss(mask = HERO_FLAG_MASK, facing = 'left') {
  const ax = (facing === 'right' ? 1 - mask.anchorX : mask.anchorX) * 100;
  const stops = flagMaskStops(mask).map(([t, a]) => `rgba(0,0,0,${a}) ${(t * 100).toFixed(1)}%`).join(',');
  return `radial-gradient(ellipse ${mask.radiusX * 100}% ${mask.radiusY * 100}% at ${ax}% ${mask.anchorY * 100}%,${stops})`;
}

// ---------------------------------------------------------------------------
// Cards

function groundFill(ctx, w, h, ground = HERO_GROUND) {
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

/** Split a display name into a solid part and a variant part (the last token) for the hollow treatment. */
export function nameParts(name) {
  const tokens = name.trim().split(/\s+/);
  if (tokens.length < 2) return { solid: name, variant: '' };
  return { solid: tokens.slice(0, -1).join(' '), variant: tokens[tokens.length - 1] };
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

/**
 * Card layouts (CSS px live in HERO_CARD_SIZES). coreShare: the tank's dense core as a share
 * of the card width; centerX: core centre (mirrored for facing 'right'), leaving the gun its
 * room; nameSize/minName: the display name; hollow: the variant suffix in tungsten outline.
 */
const CARD_LAYOUT = Object.freeze({
  roster: { coreShare: 0.74, coreHeight: 0.78, centerX: 0.56, nameSize: 14, minName: 10.5, pad: 9, hollow: false, tier: true },
  rosterCompact: { coreShare: 0.78, coreHeight: 0.80, centerX: 0.55, nameSize: 10.5, minName: 8, pad: 6, hollow: false, tier: false },
  galleryBrowse: { coreShare: 0.70, coreHeight: 0.76, centerX: 0.56, nameSize: 18, minName: 12, pad: 12, hollow: false, tier: true },
  deploy: { coreShare: 0.66, coreHeight: 0.74, centerX: 0.56, nameSize: 30, minName: 20, pad: 16, hollow: true, tier: true },
  endScreen: { coreShare: 0.64, coreHeight: 0.72, centerX: 0.56, nameSize: 50, minName: 32, pad: 24, hollow: true, tier: true },
});

const INK = '#F6F3EC';
const TUNGSTEN = '#F0A030';

/** Dense-core bounds of a transparent tank layer (portraitFraming's alpha quantiles, node side). */
export function measureCore(image) {
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
  const x0 = q(xs, 0.06), x1 = q(xs, 0.94), y0 = q(ys, 0.03), y1 = q(ys, 0.985);
  // The complete silhouette (alpha > 8 in a column): the gun and the stowage decide the horizontal fit.
  let fx0 = w, fx1 = -1;
  for (let x = 0; x < w; x++) {
    let any = false;
    for (let y = 0; y < h && !any; y++) any = px[(y * w + x) * 4 + 3] > 8 && y < y1 + 2;
    if (any) { if (x < fx0) fx0 = x; fx1 = x; }
  }
  return { x0, x1, y0, bottom: y1 + 1, width: x1 - x0 + 1, height: y1 - y0 + 1, centerX: (x0 + x1 + 1) / 2,
    full: { x0: fx0, x1: fx1 + 1 } };
}

/** Draw the masked flag layer into a w x h box (cover, anchored at the rear-top corner). */
export function drawFlag(ctx, flag, x, y, w, h, { facing = 'left', selected = false } = {}) {
  if (!flag) return;
  const box = createCanvas(Math.round(w), Math.round(h));
  const bctx = box.getContext('2d');
  const s = Math.max(w / flag.width, h / flag.height);
  const fw = flag.width * s, fh = flag.height * s;
  bctx.drawImage(flag, facing === 'right' ? 0 : w - fw, 0, fw, fh);
  applyFlagMask(bctx, w, h, { facing, opacity: selected ? HERO_FLAG_MASK.selectedOpacity : HERO_FLAG_MASK.opacity });
  ctx.drawImage(box, x, y, w, h);
}

/** Place a tank layer so its dense core spans `coreShare` of `w`, its contact line on `baseline`. */
export function drawTank(ctx, tank, core, { w, artH, baseline, coreShare, coreHeight, centerX, facing = 'left', sideMargin = 0.035 }) {
  // The core fills its share unless the whole tank (muzzle to rear stowage) would leave the card: the gun is
  // never cut. Thin whips may run off the top, as on the turntable.
  const margin = w * sideMargin;
  const fullW = core.full ? core.full.x1 - core.full.x0 : core.width;
  const scale = Math.min((w * coreShare) / core.width, (artH * coreHeight) / core.height, (w - 2 * margin) / fullW);
  const cx = (facing === 'right' ? 1 - centerX : centerX) * w;
  let dx = cx - core.centerX * scale;
  if (core.full) {
    dx = Math.min(dx, w - margin - core.full.x1 * scale);
    dx = Math.max(dx, margin - core.full.x0 * scale);
  }
  const dy = baseline - core.bottom * scale;
  ctx.drawImage(tank, dx, dy, tank.width * scale, tank.height * scale);
  return { scale, dx, dy };
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
  const s = fitFont(ctx, name, font, 600, size, maxWidth, minSize);
  ctx.fillStyle = INK;
  if (ctx.measureText(name).width <= maxWidth || !variant) { ctx.fillText(name, x, y); return; }
  // Two lines, never truncated.
  const s2 = fitFont(ctx, solid, font, 600, Math.min(s, minSize * 1.1), maxWidth, minSize * 0.85);
  ctx.fillText(solid, x, y - s2 * 1.04);
  ctx.fillText(variant, x, y);
}

function drawTierChip(ctx, tier, { x, y, size, font, scale }) {
  ctx.font = `600 ${size}px "${font}"`;
  const tw = ctx.measureText(tier).width;
  const bh = Math.round(size * 1.5), bw = Math.max(bh, Math.round(tw + size * 0.9));
  ctx.fillStyle = 'rgba(11,14,17,0.74)';
  ctx.fillRect(x, y, bw, bh);
  ctx.strokeStyle = 'rgba(246,243,236,0.22)';
  ctx.lineWidth = scale;
  ctx.strokeRect(x + scale / 2, y + scale / 2, bw - scale, bh - scale);
  ctx.fillStyle = TUNGSTEN;
  ctx.textBaseline = 'middle';
  ctx.fillText(tier, x + (bw - tw) / 2, y + bh / 2 + scale * 0.5);
  ctx.textBaseline = 'alphabetic';
}

/**
 * Compose one card at `scale` (device pixel ratio): ground, masked flag, tank, then the
 * name in the band under the contact line (never over the hull), the tier chip and the
 * frame. No eyebrow, no nation text: the flag is the nation.
 */
export function composeCard(kind, { tank, core, flag, name, tier, font = 'Chakra Petch', selected = false, facing = 'left', ground = HERO_GROUND }, scale = 2) {
  const size = HERO_CARD_SIZES[kind];
  const layout = CARD_LAYOUT[kind];
  const w = size.width * scale, h = size.height * scale;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  groundFill(ctx, w, h, ground);
  const band = size.nameBandPx * scale;
  drawFlag(ctx, flag, 0, 0, w, h - band * 0.35, { facing, selected });
  const artH = h - band;
  drawTank(ctx, tank, core || measureCore(tank), {
    w, artH, baseline: artH + scale * 2, coreShare: layout.coreShare, coreHeight: layout.coreHeight,
    centerX: layout.centerX, facing,
  });
  // A quiet floor under the name so the type never fights the flag's last fade.
  const floor = ctx.createLinearGradient(0, h - band - 6 * scale, 0, h);
  floor.addColorStop(0, 'rgba(11,14,17,0)');
  floor.addColorStop(0.5, 'rgba(11,14,17,0.5)');
  floor.addColorStop(1, 'rgba(11,14,17,0.8)');
  ctx.fillStyle = floor;
  ctx.fillRect(0, h - band - 6 * scale, w, band + 6 * scale);
  const pad = layout.pad * scale;
  drawName(ctx, name, {
    x: pad, y: h - pad * 0.95, size: layout.nameSize * scale, minSize: layout.minName * scale,
    maxWidth: w - pad * 2, font, hollow: layout.hollow, scale,
  });
  if (layout.tier && tier) {
    const ts = Math.round((kind === 'roster' ? 9.5 : kind === 'galleryBrowse' ? 11 : kind === 'deploy' ? 13 : 16) * scale);
    drawTierChip(ctx, tier, { x: Math.round(pad * 0.7), y: Math.round(pad * 0.7), size: ts, font, scale });
  }
  ctx.lineWidth = selected ? 2 * scale : scale;
  ctx.strokeStyle = selected ? TUNGSTEN : 'rgba(246,243,236,0.13)';
  const inset = ctx.lineWidth / 2;
  ctx.strokeRect(inset, inset, w - 2 * inset, h - 2 * inset);
  return canvas;
}

/**
 * 1200x630 social card: the tank right of centre with its gun into the open left, the flag
 * top-right behind its rear, the name large top-left (variant hollow), the bottom-left
 * lockup zone (360 x 120) kept clear.
 */
export function composeOg({ tank, core, flag, name, font = 'Chakra Petch', facing = 'left', ground = HERO_GROUND }) {
  const w = 1200, h = 630;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  groundFill(ctx, w, h, ground);
  drawFlag(ctx, flag, w * 0.18, 0, w * 0.82, h * 0.92, { facing });
  drawTank(ctx, tank, core || measureCore(tank), {
    w, artH: h * 0.80, baseline: h * 0.88, coreShare: 0.64, coreHeight: 0.70, centerX: 0.60, facing,
  });
  const { solid, variant } = nameParts(name);
  const pad = 64;
  const s = fitFont(ctx, solid, font, 600, 92, 460, 52);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK;
  ctx.fillText(solid, pad, 60 + s);
  if (variant) {
    ctx.lineWidth = Math.max(1.5, s / 26);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = TUNGSTEN;
    ctx.strokeText(variant, pad, 60 + s * 2.02);
  }
  return canvas;
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

function tankRecords() {
  // Names, tiers and nations from the checked tank-asset manifest (read once; the
  // shipped runtime reads specs instead).
  const manifest = JSON.parse(readFileSync(resolve('public/icons/tank-assets.json'), 'utf8'));
  return manifest.tanks;
}

async function flagLayerCached(code, dir, layout = 'mirror') {
  const file = resolve(dir, layout === 'mirror' ? `flag-${code}.png` : `flag-${code}-${layout}.png`);
  if (!existsSync(file)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, (await renderFlagLayer(code, HERO_FLAG, FLAG_LAYOUTS[layout])).toBuffer('image/png'));
  }
  return loadImage(file);
}

function label(ctx, text, x, y, size = 22) {
  ctx.font = `500 ${size}px "Chakra Petch"`;
  ctx.fillStyle = '#9A9A95';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
}

function sheetOf(width, height) {
  const sheet = createCanvas(width, height);
  const ctx = sheet.getContext('2d');
  ctx.fillStyle = '#07090B';
  ctx.fillRect(0, 0, width, height);
  return { sheet, ctx };
}

/**
 * Shipped encodes. @napi-rs/canvas's AVIF `quality` is a quantizer (0 best, 100 worst; measured 2026-10-17:
 * 40 -> 8.9 KB, 30 -> 11.5 KB, 10 -> 15.9 KB for a 504 px layer) and toBuffer ignores the options, so the
 * encode goes through encodeSync. 30 is visually clean at 2x; WebP 82 is the fallback.
 */
export const HERO_ENCODE = Object.freeze({ avifQuantizer: 30, avifSpeed: 5, webpQuality: 82 });
function encodeReport(canvas) {
  const avif = canvas.encodeSync('avif', { quality: HERO_ENCODE.avifQuantizer, alphaQuality: HERO_ENCODE.avifQuantizer, speed: HERO_ENCODE.avifSpeed });
  const webp = canvas.toBuffer('image/webp', HERO_ENCODE.webpQuality);
  return { avif, webp };
}

/**
 * Sample boards: the final compositions per tank, the angle study, the flag and ground study,
 * a Garage roster strip, the owner's reference beside ours, and the layer byte weights.
 *   --layers <dir>  tank layers (<id>__<pick>.png + tank-layers.json) from genHeroCards
 *   --pick az48     the job suffix the finals and the strip use
 *   --angles <id>   the id whose every layer job goes on the angle board
 */
async function board() {
  const layersDir = resolve(opt('layers'));
  const out = resolve(opt('out'));
  const flagsDir = resolve(opt('flags', resolve(out, 'flags')));
  mkdirSync(out, { recursive: true });
  const font = opt('font');
  if (font) GlobalFonts.registerFromPath(font, 'Chakra Petch');
  const records = tankRecords();
  const pick = opt('pick', 'az48');
  const ids = opt('ids', 'm1a2_abrams_sepv3,leo2a7v,t90m').split(',');
  const strip = opt('strip', '').split(',').filter(Boolean);
  const angleId = opt('angles', ids[0]);
  const reference = opt('reference');
  const meta = existsSync(resolve(layersDir, 'tank-layers.json')) ? JSON.parse(readFileSync(resolve(layersDir, 'tank-layers.json'), 'utf8')) : {};
  const weights = {};
  const load = async (id, job = `${id}__${pick}`, layout = 'mirror') => {
    const r = records[id];
    const tank = await loadImage(resolve(layersDir, `${job}.png`));
    const facingRight = meta[job]?.facing === 'right';
    const flag = await flagLayerCached(r.countryCode, flagsDir, facingRight && layout === 'mirror' ? 'mirrorRight' : layout);
    const core = measureCore(tank);
    // The renderer's vehicle-only silhouette (measured without the shadow catcher) wins over the layer scan.
    const fb = meta[job]?.fullBounds;
    if (fb) core.full = { x0: fb.x0, x1: fb.x1 };
    return { r, tank, core, flag, name: r.label.displayName, tier: r.tierNumeral, facing: meta[job]?.facing || 'left' };
  };

  // 1. Final compositions, every size per tank.
  const kinds = ['endScreen', 'deploy', 'galleryBrowse', 'roster', 'rosterCompact'];
  const finals = [];
  for (const id of ids) {
    const card = await load(id);
    const set = {};
    for (const kind of kinds) {
      set[kind] = composeCard(kind, { ...card, selected: kind === 'roster' }, 2);
      writeFileSync(resolve(out, `${id}__${kind}@2x.png`), set[kind].toBuffer('image/png'));
    }
    set.rosterIdle = composeCard('roster', card, 2);
    set.og = composeOg(card);
    writeFileSync(resolve(out, `${id}__og.jpg`), set.og.toBuffer('image/jpeg', 86));
    // Shipped layer weights: the transparent tank layer at each rung, the flag layer once per nation.
    for (const width of HERO_RUNGS.tank) {
      const height = Math.round(width / 1.6);
      const c = createCanvas(width, height);
      c.getContext('2d').drawImage(card.tank, 0, 0, width, height);
      const { avif, webp } = encodeReport(c);
      weights[`${id}:tank@${width}`] = { avif: avif.length, webp: webp.length };
      writeFileSync(resolve(out, `${id}__tank-${width}.avif`), avif);
      writeFileSync(resolve(out, `${id}__tank-${width}.webp`), webp);
    }
    for (const width of HERO_RUNGS.flag) {
      const height = Math.round(width / 1.6);
      const c = createCanvas(width, height);
      c.getContext('2d').drawImage(card.flag, 0, 0, width, height);
      const { avif, webp } = encodeReport(c);
      weights[`${card.r.countryCode}:flag@${width}`] = { avif: avif.length, webp: webp.length };
    }
    weights[`${id}:og.jpg`] = { jpg: set.og.toBuffer('image/jpeg', 86).length };
    finals.push({ id, card, set });
  }
  {
    const gap = 40;
    const rowW = 2 * (560 + 360 + 264 + 168) + 5 * gap;
    const rowH = 2 * 360 + 90 + 2 * 630 * 0.5 + 70;
    const { sheet, ctx } = sheetOf(rowW, finals.length * rowH + gap);
    let y = gap;
    for (const { card, set } of finals) {
      label(ctx, `${card.name}  ·  end screen 560, deploy 360, Gallery 264, roster 168 selected / idle / compact 112  ·  2x`, gap, y + 4);
      y += 24;
      let x = gap;
      for (const kind of ['endScreen', 'deploy', 'galleryBrowse']) { ctx.drawImage(set[kind], x, y); x += set[kind].width + gap; }
      ctx.drawImage(set.roster, x, y);
      ctx.drawImage(set.rosterIdle, x, y + set.roster.height + 16);
      ctx.drawImage(set.rosterCompact, x, y + 2 * set.roster.height + 32);
      y += 2 * 360 + 50;
      ctx.drawImage(set.og, gap, y, 600, 315);
      label(ctx, 'OG 1200x630 (shown at half size; the bottom-left lockup zone stays clear)', gap + 640, y + 30);
      y += 315 + 76;
    }
    writeFileSync(resolve(out, 'board-final-compositions.png'), sheet.toBuffer('image/png'));
  }

  // 2. Angle study: deploy cards for every layer job of one id.
  const angleJobs = readdirSync(layersDir).filter((f) => f.startsWith(`${angleId}__`) && f.endsWith('.png')).map((f) => basename(f, '.png')).sort();
  if (angleJobs.length > 1) {
    const cols = 4, cw = 2 * 360, ch = 2 * 240, gap = 36;
    const { sheet, ctx } = sheetOf(cols * (cw + gap) + gap, Math.ceil(angleJobs.length / cols) * (ch + 76) + gap);
    for (const [index, job] of angleJobs.entries()) {
      const card = await load(angleId, job);
      const x = gap + (index % cols) * (cw + gap), y = gap + Math.floor(index / cols) * (ch + 76);
      ctx.drawImage(composeCard('deploy', card, 2), x, y);
      const m = meta[job]?.camera;
      label(ctx, `${job.split('__')[1]}${m ? `   az ${m.azimuthDeg}°  el ${m.elevationDeg}°  fov ${m.fovDeg}°  gun +${m.gunElevationDeg}°` : ''}${card.facing === 'right' ? '   FACING RIGHT' : ''}`, x, y + ch + 32);
    }
    writeFileSync(resolve(out, 'board-angle-study.png'), sheet.toBuffer('image/png'));
  }

  // 3. Flag and ground study (deploy cards of the first id).
  {
    const base = await load(ids[0]);
    const today = createCanvas(1600, 1000);
    {
      const fc = today.getContext('2d');
      fc.globalAlpha = 0.24;
      fc.drawImage(await flagImage(base.r.countryCode, 1600, 1200), 0, -100, 1600, 1200);
    }
    const variants = [
      ['mirror (shipped): obverse, fades toward the gun and the floor', { flag: base.flag }],
      ['reverse: the reference mirrored outright (reverse face)', { flag: await flagLayerCached(base.r.countryCode, flagsDir, 'reverse') }],
      ['stream: a free patch, visible hoist', { flag: await flagLayerCached(base.r.countryCode, flagsDir, 'stream'), raw: true }],
      ["today's full-card flag at 24 %", { flag: today, raw: true }],
      ['ground: graphite (Premiere)', { flag: base.flag, ground: HERO_GROUNDS.graphite }],
      ['ground: reference flat #014061', { flag: base.flag, ground: HERO_GROUNDS.reference }],
      ['no flag', { flag: null }],
      ['selected (flag at full opacity, tungsten frame)', { flag: base.flag, selected: true }],
    ];
    const cols = 4, cw = 2 * 360, ch = 2 * 240, gap = 36;
    const { sheet, ctx } = sheetOf(cols * (cw + gap) + gap, Math.ceil(variants.length / cols) * (ch + 76) + gap);
    for (const [index, [title, v]] of variants.entries()) {
      let card;
      if (v.raw) {
        // Patch layouts carry their own feather: draw unmasked.
        card = composeCard('deploy', { ...base, flag: null, ground: v.ground }, 2);
        const under = createCanvas(card.width, card.height);
        const uctx = under.getContext('2d');
        groundFill(uctx, card.width, card.height, v.ground || HERO_GROUND);
        const s = Math.max(card.width / v.flag.width, card.height / v.flag.height);
        uctx.drawImage(v.flag, card.width - v.flag.width * s, 0, v.flag.width * s, v.flag.height * s);
        const top = composeCard('deploy', { ...base, flag: null, ground: { top: 'rgba(0,0,0,0)', mid: 'rgba(0,0,0,0)', bottom: 'rgba(0,0,0,0)', lift: 'rgba(0,0,0,0)' } }, 2);
        uctx.drawImage(top, 0, 0);
        card = under;
      } else {
        card = composeCard('deploy', { ...base, flag: v.flag, ground: v.ground, selected: v.selected }, 2);
      }
      const x = gap + (index % cols) * (cw + gap), y = gap + Math.floor(index / cols) * (ch + 76);
      ctx.drawImage(card, x, y);
      label(ctx, title, x, y + ch + 32);
    }
    writeFileSync(resolve(out, 'board-flag-study.png'), sheet.toBuffer('image/png'));
  }

  // 4. Garage roster strip (168 px cards; the first selected), at 1x and 2x.
  if (strip.length) {
    const cards = [];
    for (const [index, id] of strip.entries()) cards.push(composeCard('roster', { ...(await load(id)), selected: index === 0 }, 2));
    const step = 2 * 168 + 16;
    const { sheet, ctx } = sheetOf(cards.length * step + 48, 2 * 132 + 64 + 132 + 60);
    cards.forEach((card, index) => ctx.drawImage(card, 32 + index * step, index === 0 ? 20 : 32));
    const y1 = 2 * 132 + 76;
    cards.forEach((card, index) => ctx.drawImage(card, 32 + index * (168 + 8), y1, 168, 132));
    label(ctx, '1x (as the strip shows them on a 1x display)', 32 + cards.length * (168 + 8) + 20, y1 + 70);
    writeFileSync(resolve(out, 'board-roster-strip.png'), sheet.toBuffer('image/png'));
  }

  // 5. The owner's reference beside ours (end-screen size).
  if (reference && existsSync(reference)) {
    const ref = await loadImage(reference);
    const ours = finals[0].set.endScreen;
    const h = ours.height;
    const rw = Math.round(ref.width * (h / ref.height));
    const { sheet, ctx } = sheetOf(rw + ours.width + 3 * 40, h + 110);
    ctx.drawImage(ref, 40, 40, rw, h);
    ctx.drawImage(ours, rw + 80, 40);
    label(ctx, "owner's reference (faces right)", 40, h + 82, 24);
    label(ctx, 'ours: mirrored for the Garage (faces left), own render and own flag art', rw + 80, h + 82, 24);
    writeFileSync(resolve(out, 'board-reference-compare.png'), sheet.toBuffer('image/png'));
  }
  writeFileSync(resolve(out, 'weights.json'), `${JSON.stringify(weights, null, 2)}\n`);
  console.log(`[hero-board] ${out}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = args[0];
  if (mode === 'flags') {
    const out = resolve(opt('out'));
    mkdirSync(out, { recursive: true });
    for (const code of opt('codes', 'us').split(',')) {
      const t0 = Date.now();
      const layer = await renderFlagLayer(code);
      writeFileSync(resolve(out, `flag-${code}.png`), layer.toBuffer('image/png'));
      console.log(`[hero-flags] ${code} ${Date.now() - t0} ms`);
    }
  } else if (mode === 'board') {
    await board();
  } else {
    console.error('usage: hero-cards-compose.mjs flags --codes=us,de --out <dir> | board --layers <dir> --out <dir> [--font <ttf>]');
    process.exit(1);
  }
}

export { CARD_LAYOUT, groundFill };
