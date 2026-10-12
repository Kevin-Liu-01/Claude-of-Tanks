// clip-motion.mjs — the destruction-fx strip runner's motion receipt (scratch, never staged; coordinator rule
// 2026-10-08, PROTOCOL.md): a clip whose second half changes less than 1 % of its effect's pixels per second while the
// effect should still be evolving is void (b4/b5's column-60 filmed a Studio timeline stopped at 12 s: 0.4 %/s).
// The effect's region is every pixel that ever differs from the clip's first frame; the rate is the share of that
// region changing between frames ~1 s apart in the clip's second half, per second.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

/** A minimal PNG decoder: 8-bit RGB or RGBA, not interlaced (the Studio's captures). */
export function decodePng(buf) {
  if (buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('not a png');
  let off = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), kind = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (kind === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8 || interlace !== 0 || (type !== 6 && type !== 2)) throw new Error(`unsupported png (depth ${depth}, type ${type})`);
  const bpp = type === 6 ? 4 : 3, stride = w * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++], row = y * stride, prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[row + x - bpp] : 0, b = y > 0 ? out[prev + x] : 0;
      const c = x >= bpp && y > 0 ? out[prev + x - bpp] : 0;
      let v = raw[p++];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[row + x] = v & 255;
    }
  }
  return { w, h, bpp, data: out };
}

/** Luma box-averaged over step x step blocks (isolated flicker — a spark, a blade — averages out). */
function lumaGrid(file, step) {
  const { w, h, bpp, data } = decodePng(readFileSync(file));
  const gw = Math.floor(w / step), gh = Math.floor(h / step);
  const g = new Float32Array(gw * gh);
  const k = 1 / (step * step);
  for (let y = 0; y < gh * step; y++) {
    const gy = Math.floor(y / step) * gw;
    for (let x = 0; x < gw * step; x++) {
      const o = (y * w + x) * bpp;
      g[gy + Math.floor(x / step)] += (0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]) * k;
    }
  }
  return { g, gw, gh };
}

/**
 * The clip's motion receipt over what the packet shows: the region the effect ever changes (against the first frame)
 * framed as the packers crop it (1-99 percentile box, padded 1.3x; the whole frame when nothing changed), and the
 * second half's change rate there (% of the crop's blocks changing per second, mean over frame pairs ~1 s apart).
 * `evolveUntilMs`: past it, stillness is allowed (null: the effect evolves to the clip's end).
 */
export function clipMotion(dir, frames, { step = 4, threshold = 8, evolveUntilMs = null } = {}) {
  if (frames.length < 4) return { cropPct: null, ratePct: null, pairs: 0, checked: false, still: false };
  const t0 = frames[0].tMs, tEnd = frames[frames.length - 1].tMs;
  const tMid = t0 + (tEnd - t0) / 2;
  const pick = (dtMs, from) => {
    const out = [];
    let next = from;
    for (const f of frames) if (f.tMs >= next - 1e-6) { out.push(f); next = f.tMs + dtMs; }
    if (out[out.length - 1] !== frames[frames.length - 1]) out.push(frames[frames.length - 1]);
    return out;
  };
  const cache = new Map();
  const grid = (f) => { if (!cache.has(f.file)) cache.set(f.file, lumaGrid(path.join(dir, f.file), step)); return cache.get(f.file); };
  const first = grid(frames[0]);
  const { gw, gh } = first;
  const active = new Uint8Array(gw * gh);
  for (const f of pick(500, t0)) {
    const { g } = grid(f);
    for (let i = 0; i < g.length; i++) if (Math.abs(g[i] - first.g[i]) > threshold * 1.5) active[i] = 1;
  }
  const xs = [], ys = [];
  for (let i = 0; i < active.length; i++) if (active[i]) { xs.push(i % gw); ys.push(Math.floor(i / gw)); }
  let x0 = 0, y0 = 0, x1 = gw, y1 = gh;
  if (xs.length >= 30) {
    const pct = (v, q) => { const s = [...v].sort((p, r) => p - r); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
    const cx = (pct(xs, 0.01) + pct(xs, 0.99)) / 2, cy = (pct(ys, 0.01) + pct(ys, 0.99)) / 2;
    const w = Math.max(pct(xs, 0.99) - pct(xs, 0.01), 40) * 1.3, h = Math.max(pct(ys, 0.99) - pct(ys, 0.01), 30) * 1.3;
    x0 = Math.max(0, Math.floor(cx - w / 2)); x1 = Math.min(gw, Math.ceil(cx + w / 2));
    y0 = Math.max(0, Math.floor(cy - h / 2)); y1 = Math.min(gh, Math.ceil(cy + h / 2));
  }
  const cropN = (x1 - x0) * (y1 - y0);
  const half = pick(1000, tMid);
  let sum = 0, pairs = 0;
  for (let k = 0; k + 1 < half.length; k++) {
    const a = grid(half[k]).g, b = grid(half[k + 1]).g;
    const dt = (half[k + 1].tMs - half[k].tMs) / 1000;
    if (dt < 0.25) continue;
    let changed = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * gw + x; if (Math.abs(a[i] - b[i]) > threshold) changed++; }
    sum += (100 * changed) / cropN / dt;
    pairs++;
  }
  const ratePct = pairs ? sum / pairs : null;
  const checked = pairs > 0 && (evolveUntilMs == null || evolveUntilMs > tMid);
  return { cropPct: +((100 * cropN) / (gw * gh)).toFixed(2), ratePct: ratePct == null ? null : +ratePct.toFixed(3), pairs,
    checked, still: checked && (ratePct ?? 0) < 1 };
}
