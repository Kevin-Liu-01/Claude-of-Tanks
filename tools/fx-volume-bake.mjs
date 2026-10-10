#!/usr/bin/env node
/**
 * fx-volume-bake.mjs — offline volumetric media flipbooks (destruction-fx lane, 2026-10-07).
 *
 * Why: the battle's smoke and dust were 2D noise blobs (main's fbm flipbooks; FX round 6's lobed metaball clusters,
 * one identical cluster per sheet, lit by fake dome normals that outlined every lobe). Real smoke, dust and explosion
 * clouds are 3D media lit by the sun THROUGH their own density: billows in front shade the ones behind, the sunlit
 * side is bright, the crevices and the far side dark, thin rims glow when the sun is behind them.
 *
 * This tool builds each medium as a 3D VOLUME and RAY-MARCHES every frame into a flipbook tile with the light
 * transport baked in. The volume is a hierarchy of billows (primary masses, secondary lobes that roll over their
 * parents, tertiary lobes that boil in and out of the surface) summed into one smooth density, carved at its surface
 * by a ridged turbulence that rides the billows, and thinned as the medium disperses. Everything moves continuously
 * with the frame clock, so consecutive frames differ by small motions (and the bake records those motions):
 *
 *   sheet A (RGBA8): R = lit from +x (card right), G = lit from +y (above), B = lit from -x (left), A = coverage
 *   sheet B (RGBA8, half resolution): R = lit from -y (below), G = emission (temperature), B/A = motion vectors to
 *                                     the next frame
 *
 * The lighting channels are the in-scattered light of the visible material for a light along that axis (single
 * scattering through the density, softened by a two-octave multiple-scattering term and a light-pass blur),
 * normalised by coverage and stored as sqrt (dark cores keep their 8-bit precision). Light from the camera side and
 * from behind the card follows from coverage alone (uniform-medium transport along the view ray), so the runtime
 * derives those two (src/fx/volumeMedia.ts). The motion vectors (the billows' own velocities, projected) let the
 * runtime blend frames along the flow instead of cross-fading.
 *
 * Every frame is framed on its own cloud (coverage centroid and extent; the extent never shrinks). Frames are spaced
 * in medium time tau = (k / (F-1)); the runtime maps a puff's age onto tau with the medium's gamma (dense early,
 * where a burst changes fastest). All media share one atlas pair (public/fx/vol-media-a.png, -b.png): each medium
 * owns `variants` bands of 8 x 8 tiles, in MEDIA_ORDER — so the runtime draws every medium in one sorted draw call.
 *
 * Deterministic: seeded mulberry32 streams, fixed iteration order, no clock; the same arguments write the same bytes.
 * First-party: the generator is this file; the atlases are its output.
 *
 *   node tools/fx-volume-bake.mjs [--res=96] [--out=public/fx] [--preview=<dir>] [--ledger]
 *                                 [--media=billow,burst] [--frames=N] [--variants=N]   (previews only)
 */
import { deflateSync, crc32 } from 'node:zlib';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------------------------------------------
// The media (lengths in units of the volume box)
// ---------------------------------------------------------------------------------------------------------------

export const VOLUME_MEDIA = Object.freeze({
  // Combustion smoke and fireball bodies: a rising cumulus of soot whose cap rolls outward and down, a hot core that
  // glows early and cools from the outside in.
  billow: Object.freeze({
    id: 'billow', seed: 0x5eed01, variants: 1, frames: 64, tile: 128, gamma: 1.5, sigma: 34,
    centre: [0.5, 0.44, 0.5], primary: 10, secondary: 4, tertiary: 2, primaryR: [0.11, 0.17], spread: [0.6, 1.15],
    secR: 1, upBias: 0.5, flatBottom: 0.3, roll: 1.3, outward: 0.09, grow: 0.22, boil: 1.4,
    detail: { freq: 6.5, amp: 0.6, soft: 0.3, warp: 0.35, octaves: 3 }, thin: 0.25, haze: 0.06, emission: true,
    heatR: 0.27, heatFall: 1.0, ms: [0.45, 0.15],
  }),
  // Dust, soil, powder and spray: a lumpy burst thrown out over the ground that slows, breaks up and hangs, its
  // edges tearing into wisps as it thins.
  burst: Object.freeze({
    // (round 3: plain fractal noise and no boiling lobes — round 2's dust read as pebbled cauliflower up close)
    id: 'burst', seed: 0x5eed02, variants: 1, frames: 64, tile: 128, gamma: 1.8, sigma: 28,
    centre: [0.5, 0.47, 0.5], primary: 6, secondary: 5, tertiary: 0, primaryR: [0.13, 0.2], spread: [0.4, 0.85],
    secR: 0.7, upBias: 0.3, flatBottom: 0.55, roll: 0.9, outward: 0.12, grow: 0.25, boil: 1.1,
    detail: { kind: 'fbm', freq: 8, amp: 1.25, soft: 0.42, warp: 1.0, octaves: 5 }, thin: 0.55, haze: 0.3, emission: false,
    heatR: 0, heatFall: 1.35, ms: [0.5, 0.35],
  }),
});
export const MEDIA_ORDER = Object.freeze(['billow', 'burst']);

// ---------------------------------------------------------------------------------------------------------------
// Seeded noise: improved Perlin gradient noise; each octave in its own rotated frame (no lattice-aligned seams)
// ---------------------------------------------------------------------------------------------------------------

export function mulberry32(a) {
  return function rand() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makePerlin(rand) {
  const p = new Uint8Array(512);
  const perm = new Uint8Array(256);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h, x, y, z) => {
    const g = h & 15;
    const u = g < 8 ? x : y, v = g < 4 ? y : (g === 12 || g === 14 ? x : z);
    return ((g & 1) ? -u : u) + ((g & 2) ? -v : v);
  };
  return (x, y, z) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z, B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    const l = (a, b, t) => a + t * (b - a);
    return l(l(l(grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z), u),
      l(grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z), u), v),
    l(l(grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1), u),
      l(grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1), u), v), w);
  };
}

function randomRotation(rand) {
  let ax = rand() * 2 - 1, ay = rand() * 2 - 1, az = rand() * 2 - 1;
  const al = Math.hypot(ax, ay, az) || 1; ax /= al; ay /= al; az /= al;
  const an = 0.6 + rand() * 1.8, c = Math.cos(an), s = Math.sin(an), t = 1 - c;
  return [t * ax * ax + c, t * ax * ay - s * az, t * ax * az + s * ay,
    t * ax * ay + s * az, t * ay * ay + c, t * ay * az - s * ax,
    t * ax * az - s * ay, t * ay * az + s * ax, t * az * az + c, rand() * 50, rand() * 50, rand() * 50];
}

/**
 * Billowy turbulence 0..1: 1 - |noise| folded per octave (rounded lobes with sharp creases between them), each octave
 * rotated — the cauliflower texture of a cumulus surface.
 */
function makeBillowNoise(rand, octaves) {
  const noise = makePerlin(rand);
  const rots = [];
  for (let o = 0; o < octaves; o++) rots.push(randomRotation(rand));
  let norm = 0;
  for (let o = 0; o < octaves; o++) norm += 0.52 ** o;
  return (x, y, z) => {
    let sum = 0, f = 1, a = 1;
    for (let o = 0; o < octaves; o++) {
      const r = rots[o];
      const n = noise((r[0] * x + r[1] * y + r[2] * z) * f + r[9], (r[3] * x + r[4] * y + r[5] * z) * f + r[10],
        (r[6] * x + r[7] * y + r[8] * z) * f + r[11]);
      sum += (1 - Math.min(1, Math.abs(n) * 1.6)) * a;
      f *= 2.07; a *= 0.52;
    }
    return sum / norm;
  };
}

/** Plain fractal noise 0..1 (each octave rotated): the fine grain of a dust cloud. */
function makeFbm(rand, octaves) {
  const noise = makePerlin(rand);
  const rots = [];
  for (let o = 0; o < octaves; o++) rots.push(randomRotation(rand));
  let norm = 0;
  for (let o = 0; o < octaves; o++) norm += 0.5 ** o;
  return (x, y, z) => {
    let sum = 0, f = 1, a = 1;
    for (let o = 0; o < octaves; o++) {
      const r = rots[o];
      sum += noise((r[0] * x + r[1] * y + r[2] * z) * f + r[9], (r[3] * x + r[4] * y + r[5] * z) * f + r[10],
        (r[6] * x + r[7] * y + r[8] * z) * f + r[11]) * a;
      f *= 2.03; a *= 0.5;
    }
    return Math.min(1, Math.max(0, 0.5 + 0.75 * sum / norm));
  };
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------------------------------------------
// The billow hierarchy
// ---------------------------------------------------------------------------------------------------------------

function unitRand(rand, upBias) {
  // uniform direction, then biased upward (a burst throws up more than down; smoke rises)
  for (;;) {
    const x = rand() * 2 - 1, y = rand() * 2 - 1, z = rand() * 2 - 1;
    const l = Math.hypot(x, y, z);
    if (l < 1e-3 || l > 1) continue;
    let ux = x / l, uy = y / l, uz = z / l;
    uy = uy * (1 - upBias) + upBias * Math.abs(uy) * 0.9 + upBias * 0.1;
    const m = Math.hypot(ux, uy, uz);
    ux /= m; uy /= m; uz /= m;
    return [ux, uy, uz];
  }
}

function rotateAbout(v, axis, angle, out) {
  // Rodrigues
  const [kx, ky, kz] = axis;
  const c = Math.cos(angle), s = Math.sin(angle);
  const dot = kx * v[0] + ky * v[1] + kz * v[2];
  out[0] = v[0] * c + (ky * v[2] - kz * v[1]) * s + kx * dot * (1 - c);
  out[1] = v[1] * c + (kz * v[0] - kx * v[2]) * s + ky * dot * (1 - c);
  out[2] = v[2] * c + (kx * v[1] - ky * v[0]) * s + kz * dot * (1 - c);
  return out;
}

/** Seed one variant's billows: primary masses, the lobes that roll over them, the small lobes that boil. */
function seedBillows(spec, rand) {
  const prim = [];
  for (let i = 0; i < spec.primary; i++) {
    const u = unitRand(rand, spec.upBias);
    if (u[1] < -0.2) u[1] *= (1 - spec.flatBottom);
    const ul = Math.hypot(u[0], u[1], u[2]); u[0] /= ul; u[1] /= ul; u[2] /= ul;
    // the first mass is the core: it sits at the centre and swells, so the cloud never opens a hole as the outer
    // masses travel out
    const core = i === 0;
    const r = core ? spec.primaryR[1] * 1.15 : spec.primaryR[0] + rand() * (spec.primaryR[1] - spec.primaryR[0]);
    const p = {
      u, d: core ? 0 : r * (spec.spread[0] + rand() * (spec.spread[1] - spec.spread[0])), r,
      out: core ? spec.outward * 0.25 : spec.outward * (0.5 + rand()),
      grow: core ? spec.grow * 2.2 : spec.grow * (0.6 + 0.8 * rand()),
      w: 0.8 + 0.4 * rand(), children: [],
    };
    for (let j = 0; j < spec.secondary; j++) {
      const v = unitRand(rand, spec.upBias * 0.5);
      // the secondary lies on the parent's outward side
      const sx = v[0] + p.u[0] * 0.9, sy = v[1] + p.u[1] * 0.9, sz = v[2] + p.u[2] * 0.9;
      const sl = Math.hypot(sx, sy, sz) || 1;
      const dir = [sx / sl, sy / sl, sz / sl];
      // roll axis: tangent, so the lobe rolls outward over its parent (up and over for smoke)
      let ax = dir[1] * 0 - dir[2] * 1, ay = 0, az = dir[0] * 1 - 0;
      const al = Math.hypot(ax, ay, az);
      if (al < 1e-3) { ax = 1; ay = 0; az = 0; } else { ax /= al; az /= al; }
      const q = {
        dir, axis: [ax, ay, az], omega: spec.roll * (0.5 + rand()) * (rand() < 0.5 ? -1 : 1) * 0.6,
        rk: (0.36 + 0.2 * rand()) * (spec.secR ?? 1), pulse: 0.12 + 0.12 * rand(), phase: rand(), w: 0.85 + 0.15 * rand(),
        children: [],
      };
      for (let k = 0; k < spec.tertiary; k++) {
        const t = unitRand(rand, 0);
        const tx = t[0] + dir[0], ty = t[1] + dir[1], tz = t[2] + dir[2];
        const tl = Math.hypot(tx, ty, tz) || 1;
        q.children.push({ dir: [tx / tl, ty / tl, tz / tl], rk: 0.42 + 0.18 * rand(), freq: spec.boil * (0.7 + 0.8 * rand()),
          phase: rand(), w: 0.55 + 0.25 * rand() });
      }
      p.children.push(q);
    }
    prim.push(p);
  }
  // fit the whole hierarchy inside the box at its largest (a lobe cut by the box edge draws a straight rim)
  let reach = 0;
  for (const p of prim) {
    const pr = p.r * (1 + p.grow);
    const sec = pr * (0.96 + 0.56 * 1.24) + pr * 0.56 * 1.24 * 0.6;
    const vertical = spec.centre[1] + p.u[1] * (p.d + p.out);
    const rr = Math.max(p.d + p.out + Math.max(pr, sec), Math.abs(vertical - 0.5) + Math.max(pr, sec));
    if (rr > reach) reach = rr;
  }
  const k = Math.min(1, 0.43 / Math.max(1e-3, reach));
  for (const p of prim) { p.d *= k; p.out *= k; p.r *= k; }
  return prim;
}

/**
 * Visit every lobe of the hierarchy at medium time tau (0..1): visit(x, y, z, r, w, vx, vy) in box units, with the
 * lobe's velocity per unit tau (for the motion vectors).
 */
function forEachLobe(spec, prim, tau, visit) {
  const e = 1 - (1 - tau) ** 2.2;          // eased expansion
  const de = 2.2 * (1 - tau) ** 1.2;       // its rate
  const [cx, cy, cz] = spec.centre;
  const tmp = [0, 0, 0];
  for (const p of prim) {
    const d = p.d + p.out * e;
    const pr = p.r * (1 + p.grow * e);
    const px = cx + p.u[0] * d, py = cy + p.u[1] * d, pz = cz + p.u[2] * d;
    const pvx = p.u[0] * p.out * de, pvy = p.u[1] * p.out * de;
    visit(px, py, pz, pr, p.w, pvx, pvy);
    for (const q of p.children) {
      const ang = q.omega * tau * Math.PI;
      rotateAbout(q.dir, q.axis, ang, tmp);
      const sdx = tmp[0], sdy = tmp[1], sdz = tmp[2];
      const off = pr * (0.86 + 0.1 * e);
      const sr = pr * q.rk * (1 + q.pulse * Math.sin((tau * 1.3 + q.phase) * Math.PI * 2));
      const sx = px + sdx * off, sy = py + sdy * off, sz = pz + sdz * off;
      // rolling velocity: omega x offset (the tangent of the roll)
      const rv = q.omega * Math.PI * off;
      const tvx = q.axis[1] * sdz - q.axis[2] * sdy, tvy = q.axis[2] * sdx - q.axis[0] * sdz;
      visit(sx, sy, sz, sr, q.w * p.w, pvx + tvx * rv, pvy + tvy * rv);
      for (const t of q.children) {
        const life = (tau * t.freq + t.phase) % 1;
        const grow = Math.sin(Math.PI * life) ** 0.7;
        const tr = sr * t.rk * grow;
        const toff = sr * (0.62 + 0.12 * life);
        // the boil rolls with its parent
        rotateAbout(t.dir, q.axis, ang, tmp);
        visit(sx + tmp[0] * toff, sy + tmp[1] * toff, sz + tmp[2] * toff, tr, t.w * q.w * p.w, pvx + tvx * rv, pvy + tvy * rv);
      }
    }
  }
}

/** The cube (box units) that holds every lobe at tau, with a margin: the frame's voxel grid. */
function lobeBox(spec, prim, tau) {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  forEachLobe(spec, prim, tau, (x, y, z, r) => {
    if (r <= 1e-4) return;
    if (x - r < x0) x0 = x - r; if (x + r > x1) x1 = x + r;
    if (y - r < y0) y0 = y - r; if (y + r > y1) y1 = y + r;
    if (z - r < z0) z0 = z - r; if (z + r > z1) z1 = z + r;
  });
  const size = Math.max(x1 - x0, y1 - y0, z1 - z0) * 1.12;
  return { x0: (x0 + x1) / 2 - size / 2, y0: (y0 + y1) / 2 - size / 2, z0: (z0 + z1) / 2 - size / 2, size };
}

/**
 * Splat the billows at medium time tau into the frame's voxel grid (box = its cube in box units), with their
 * velocities into the flow grids. Lobes splat only over their own bounding boxes; overlapping lobes merge by a
 * probabilistic union, so the density stays bounded (a SUM of a hundred overlapping lobes is one opaque block whose
 * silhouette is their envelope, not their billows).
 */
function splatBillows(spec, prim, tau, N, box, dens, vx, vy, wsum) {
  dens.fill(0); vx.fill(0); vy.fill(0); wsum.fill(0);
  const h = box.size / N;
  forEachLobe(spec, prim, tau, (px, py, pz, r, w, velX, velY) => {
    if (r <= 1e-4 || w <= 0) return;
    const i0 = Math.max(0, Math.floor((px - r - box.x0) / h)), i1 = Math.min(N - 1, Math.ceil((px + r - box.x0) / h));
    const j0 = Math.max(0, Math.floor((py - r - box.y0) / h)), j1 = Math.min(N - 1, Math.ceil((py + r - box.y0) / h));
    const k0 = Math.max(0, Math.floor((pz - r - box.z0) / h)), k1 = Math.min(N - 1, Math.ceil((pz + r - box.z0) / h));
    const ir2 = 1 / (r * r);
    for (let k = k0; k <= k1; k++) {
      const dz = box.z0 + (k + 0.5) * h - pz;
      for (let j = j0; j <= j1; j++) {
        const dy = box.y0 + (j + 0.5) * h - py;
        const dyz = dy * dy + dz * dz;
        if (dyz * ir2 >= 1) continue;
        let o = i0 + N * (j + N * k);
        for (let i = i0; i <= i1; i++, o++) {
          const dx = box.x0 + (i + 0.5) * h - px;
          const q = (dx * dx + dyz) * ir2;
          if (q >= 1) continue;
          const b = Math.min(0.995, (1 - q) * (1 - q) * w);
          dens[o] = 1 - (1 - dens[o]) * (1 - b);
          vx[o] += b * velX; vy[o] += b * velY; wsum[o] += b;
        }
      }
    }
  });
}

/** Carve the surface with the billow noise, add the thin haze, thin the whole as the medium disperses. */
function carve(spec, tau, N, box, dens, out, noise, nrot) {
  const D = spec.detail;
  const e = 1 - (1 - tau) ** 2.2;
  const thin = 1 - spec.thin * tau;
  const amp = D.amp * (0.8 + 0.6 * tau);
  const fr = D.freq / (1 + 0.45 * e);       // the texture grows with the cloud
  const [cx, cy, cz] = spec.centre;
  const a = nrot * tau;
  const ca = Math.cos(a), sa = Math.sin(a);
  const h = box.size / N;
  let o = 0;
  for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++, o++) {
    const v = dens[o];
    if (v <= 0.002) { out[o] = 0; continue; }
    const x = box.x0 + (i + 0.5) * h - cx, y = box.y0 + (j + 0.5) * h - cy, z = box.z0 + (k + 0.5) * h - cz;
    // a slow turn of the texture about the vertical (the cloud churns)
    const rx = x * ca - z * sa, rz = x * sa + z * ca;
    // a domain warp drags the texture into torn, fibrous edges (a lower-frequency read of the same noise)
    const wq = D.warp ?? 0;
    const wx = wq ? (noise(rx * fr * 0.37 + 11.3, y * fr * 0.37, rz * fr * 0.37) - 0.5) * wq * 2 : 0;
    const wy = wq ? (noise(rx * fr * 0.37, y * fr * 0.37 + 7.7, rz * fr * 0.37) - 0.5) * wq * 2 : 0;
    const n = noise(rx * fr + wx, y * fr - tau * 0.6 + wy, rz * fr - wx * 0.5);
    // where the noise is high the cloud reaches further; where low, it is carved — only near the surface
    const level = v + amp * (n - 0.55) * (1 - smoothstep(0.55, 0.98, v));
    const body = smoothstep(0.18, 0.18 + D.soft, level) * Math.min(1, level);
    // the haze rides only where the billows are already substantial, so it never fills their bounding spheres
    const haze = spec.haze * smoothstep(0.06, 0.32, v) * smoothstep(0.35, 0.75, n) * (0.4 + 0.8 * tau);
    out[o] = Math.max(body, haze) * thin;
  }
}

/** Temperature: the hot core (below the billows' centre) glows early and cools from the outside in. */
function heatField(spec, tau, N, box, dens, out, noise) {
  const [cx, cy, cz] = spec.centre;
  const heat = Math.max(0, 1 - tau * (spec.heatFall ?? 1.35));
  const r = spec.heatR * (0.6 + 0.8 * heat);
  const h = box.size / N;
  let o = 0;
  for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++, o++) {
    if (dens[o] <= 0.01 || heat <= 0) { out[o] = 0; continue; }
    const x = box.x0 + (i + 0.5) * h - cx, y = box.y0 + (j + 0.5) * h - (cy - 0.04), z = box.z0 + (k + 0.5) * h - cz;
    const rr = Math.sqrt(x * x + y * y + z * z) / Math.max(1e-3, r);
    const n = noise(x * 6, y * 6 + tau * 1.2, z * 6);
    out[o] = heat * smoothstep(1.15, 0.2, rr + 0.35 * (0.5 - n)) * Math.min(1, dens[o] * 1.4);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Light transport and the flipbook frame
// ---------------------------------------------------------------------------------------------------------------

/** Trilinear sample of an N^3 cell field at cell-centred coordinates (cell (i,j,k) at (i+.5, j+.5, k+.5)). */
function sC(F, N, x, y, z) {
  x -= 0.5; y -= 0.5; z -= 0.5;
  if (x < 0) x = 0; else if (x > N - 1.0001) x = N - 1.0001;
  if (y < 0) y = 0; else if (y > N - 1.0001) y = N - 1.0001;
  if (z < 0) z = 0; else if (z > N - 1.0001) z = N - 1.0001;
  const i = x | 0, j = y | 0, k = z | 0;
  const tx = x - i, ty = y - j, tz = z - k;
  const NN = N * N;
  const o = i + N * j + NN * k;
  const a = F[o], b = F[o + 1], c = F[o + N], d = F[o + N + 1];
  const e = F[o + NN], f = F[o + NN + 1], g = F[o + NN + N], h = F[o + NN + N + 1];
  const ab = a + (b - a) * tx, cd = c + (d - c) * tx, ef = e + (f - e) * tx, gh = g + (h - g) * tx;
  const l0 = ab + (cd - ab) * ty, l1 = ef + (gh - ef) * ty;
  return l0 + (l1 - l0) * tz;
}

/** A separable box blur (radius 1) of a cell field into dst (the light pass reads a softened density). */
function blur3(N, src, dst, tmp) {
  const NN = N * N;
  let o = 0;
  for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++, o++) {
    tmp[o] = (src[o] * 2 + (i > 0 ? src[o - 1] : 0) + (i < N - 1 ? src[o + 1] : 0)) * 0.25;
  }
  o = 0;
  for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++, o++) {
    dst[o] = (tmp[o] * 2 + (j > 0 ? tmp[o - N] : 0) + (j < N - 1 ? tmp[o + N] : 0)) * 0.25;
  }
  o = 0;
  for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++, o++) {
    tmp[o] = (dst[o] * 2 + (k > 0 ? dst[o - NN] : 0) + (k < N - 1 ? dst[o + NN] : 0)) * 0.25;
  }
  dst.set(tmp);
}

/**
 * Light reaching each cell along the four in-plane axes (the light COMES FROM +x, -x, +y, -y), through the softened
 * density, with a two-octave multiple-scattering term: L = (e^-tau + 0.6 e^-tau/4) / 1.6. sigmaCell: extinction per
 * cell at unit density.
 */
function lightFields(N, dens, sigmaCell, out, ms = [0.6, 0]) {
  const NN = N * N;
  const h = sigmaCell;
  // three octaves of transport (Wrenninge): single scattering, and two softer, deeper-reaching terms standing for the
  // light scattered many times inside the medium (dust, with an albedo near 0.9, is mostly the latter)
  const w1 = ms[0], w2 = ms[1], wn = 1 + w1 + w2;
  const att = (t) => (Math.exp(-t) + w1 * Math.exp(-0.25 * t) + w2 * Math.exp(-0.08 * t)) / wn;
  for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) {
    let t = 0;
    for (let i = N - 1; i >= 0; i--) { const o = i + N * j + NN * k; t += 0.5 * h * dens[o]; out.px[o] = att(t); t += 0.5 * h * dens[o]; }
    t = 0;
    for (let i = 0; i < N; i++) { const o = i + N * j + NN * k; t += 0.5 * h * dens[o]; out.nx[o] = att(t); t += 0.5 * h * dens[o]; }
  }
  for (let k = 0; k < N; k++) for (let i = 0; i < N; i++) {
    let t = 0;
    for (let j = N - 1; j >= 0; j--) { const o = i + N * j + NN * k; t += 0.5 * h * dens[o]; out.py[o] = att(t); t += 0.5 * h * dens[o]; }
    t = 0;
    for (let j = 0; j < N; j++) { const o = i + N * j + NN * k; t += 0.5 * h * dens[o]; out.ny[o] = att(t); t += 0.5 * h * dens[o]; }
  }
}

/** Projected framing in cells: the coverage centroid and the radius that holds every texel above 3 %. */
function measureFraming(N, d, sigmaCell) {
  const NN = N * N;
  const h = sigmaCell;
  let sx = 0, sy = 0, sw = 0;
  const cov = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    let t = 0;
    for (let k = 0; k < N; k++) t += h * d[i + N * j + NN * k];
    const a = 1 - Math.exp(-t);
    cov[i + N * j] = a;
    sx += a * (i + 0.5); sy += a * (j + 0.5); sw += a;
  }
  const cx = sw > 0 ? sx / sw : N / 2, cy = sw > 0 ? sy / sw : N / 2;
  let r = 2;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (cov[i + N * j] > 0.03) { const rr = Math.hypot(i + 0.5 - cx, j + 0.5 - cy) + 1.5; if (rr > r) r = rr; }
  }
  return { cx, cy, r };
}

/**
 * Ray-march one frame into a tile. box = the frame's voxel cube (box units); framing = { cx, cy, span } in box units
 * (span = the tile's width); next = the following frame's framing; the flow grids hold the billows' velocities per
 * unit tau (box units), dtau the frame step. Tile rows are written top-down from the medium's top, so the PNG's top
 * row is the medium's top (an image texture uploads with flipY).
 */
function renderTile(N, F, spec, box, framing, next, dtau, tile, outA, outB) {
  const { d, T, vx, vy, w, L } = F;
  const h = box.size / N;
  const sigmaCell = spec.sigma * h;
  const stepL = 0.5;
  const steps = Math.ceil(N / stepL);
  const pxW = framing.span / tile;
  const enc = (x) => Math.round(Math.sqrt(Math.min(1, Math.max(0, x))) * 255);
  for (let py = 0; py < tile; py++) {
    for (let px = 0; px < tile; px++) {
      const wx = framing.cx + (px + 0.5 - tile / 2) * pxW;
      const wy = framing.cy + (py + 0.5 - tile / 2) * pxW;
      const gx = (wx - box.x0) / h, gy = (wy - box.y0) / h;
      let tv = 1, cR = 0, cL = 0, cU = 0, cD = 0, em = 0, fu = 0, fv = 0, wsum = 0;
      if (gx >= 0.5 && gx <= N - 0.5 && gy >= 0.5 && gy <= N - 0.5) {
        for (let s = 0; s < steps; s++) {
          const gz = N - 0.5 - s * stepL;   // camera on +z looking toward -z
          if (gz < 0.5) break;
          const rho = sC(d, N, gx, gy, gz);
          if (rho <= 1e-4) continue;
          const tau = sigmaCell * rho * stepL;
          const a = 1 - Math.exp(-tau);
          const wgt = tv * a;
          cR += wgt * sC(L.px, N, gx, gy, gz);
          cL += wgt * sC(L.nx, N, gx, gy, gz);
          cU += wgt * sC(L.py, N, gx, gy, gz);
          cD += wgt * sC(L.ny, N, gx, gy, gz);
          if (spec.emission) { const t = sC(T, N, gx, gy, gz); em += wgt * t * t; }
          const ws = sC(w, N, gx, gy, gz);
          if (ws > 1e-4) { fu += wgt * sC(vx, N, gx, gy, gz) / ws; fv += wgt * sC(vy, N, gx, gy, gz) / ws; }
          wsum += wgt;
          tv *= Math.exp(-tau);
          if (tv < 0.002) break;
        }
      }
      const alpha = 1 - tv;
      const o = ((tile - 1 - py) * tile + px) * 4;
      const edgePx = Math.min(px, py, tile - 1 - px, tile - 1 - py);
      const border = Math.min(1, edgePx / 2.5);   // a transparent rim: mip levels never bleed into the next tile
      const inv = wsum > 1e-5 ? 1 / wsum : 0;
      outA[o] = enc(cR * inv); outA[o + 1] = enc(cU * inv); outA[o + 2] = enc(cL * inv);
      outA[o + 3] = Math.round(alpha * border * 255);
      outB[o] = enc(cD * inv);
      outB[o + 1] = spec.emission ? Math.round(Math.min(1, Math.sqrt(em * inv)) * 255) : 0;
      let mu = 0, mv = 0;
      if (next && wsum > 1e-5) {
        const nx = wx + fu * inv * dtau, ny = wy + fv * inv * dtau;
        mu = (nx - next.cx) / next.span + 0.5 - (px + 0.5) / tile;
        mv = (ny - next.cy) / next.span + 0.5 - (py + 0.5) / tile;
      }
      outB[o + 2] = Math.round(Math.min(1, Math.max(0, 0.5 + 0.5 * mu / FLOW_SCALE)) * 255);
      outB[o + 3] = Math.round(Math.min(1, Math.max(0, 0.5 + 0.5 * mv / FLOW_SCALE)) * 255);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// PNG (RGBA8, Sub filter)
// ---------------------------------------------------------------------------------------------------------------

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const ro = y * (width * 4 + 1);
    raw[ro] = 1;
    for (let x = 0; x < width * 4; x++) {
      const cur = rgba[y * width * 4 + x];
      const left = x >= 4 ? rgba[y * width * 4 + x - 4] : 0;
      raw[ro + 1 + x] = (cur - left) & 255;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------------------------------------------
// Bake: each variant of each medium is one band of 8 x 8 tiles
// ---------------------------------------------------------------------------------------------------------------

export const ATLAS_COLUMNS = 8;
export const FLOW_SCALE = 0.25; // |motion vector| per frame (tile-uv units) the 8-bit channel spans

/** Bake one variant of a medium into a band: RGBA8 sheets a and b of (8 tiles) x (rows tiles). */
export function bakeBand(spec, variant, { res = 96, frames = spec.frames, tile = spec.tile, log = () => {} } = {}) {
  const rows = Math.ceil(frames / ATLAS_COLUMNS);
  const W = ATLAS_COLUMNS * tile, H = rows * tile;
  const a = new Uint8Array(W * H * 4), b = new Uint8Array(W * H * 4);
  const ta = new Uint8Array(tile * tile * 4), tb = new Uint8Array(tile * tile * 4);
  const N = res;
  const nc = N * N * N;
  const rand = mulberry32((spec.seed + variant * 0x9e3779b1) | 0);
  const prim = seedBillows(spec, rand);
  const noise = (spec.detail.kind === 'fbm' ? makeFbm : makeBillowNoise)(mulberry32((spec.seed * 31 + variant * 977) | 0), spec.detail.octaves);
  const heatNoise = makeBillowNoise(mulberry32((spec.seed * 17 + variant * 131) | 0), 2);
  const nrot = (rand() - 0.5) * 1.2;
  const raw = new Float32Array(nc), vx = new Float32Array(nc), vy = new Float32Array(nc), w = new Float32Array(nc);
  const d = new Float32Array(nc), T = new Float32Array(nc), soft = new Float32Array(nc), tmp = new Float32Array(nc);
  const L = { px: new Float32Array(nc), nx: new Float32Array(nc), py: new Float32Array(nc), ny: new Float32Array(nc) };
  // framing: pass 1 measures every frame (the extent never shrinks), pass 2 renders with the next frame known
  // pass 1 measures every frame's framing (box units; the extent never shrinks), pass 2 renders with the next known
  const framings = [];
  const boxes = [];
  let maxR = 0;
  const dtau = 1 / Math.max(1, frames - 1);
  for (let f = 0; f < frames; f++) {
    const tau = f * dtau;
    const box = lobeBox(spec, prim, tau);
    const h = box.size / N;
    splatBillows(spec, prim, tau, N, box, raw, vx, vy, w);
    carve(spec, tau, N, box, raw, d, noise, nrot);
    const fr = measureFraming(N, d, spec.sigma * h);
    maxR = Math.max(maxR, fr.r * h);
    boxes.push(box);
    framings.push({ cx: box.x0 + fr.cx * h, cy: box.y0 + fr.cy * h, span: maxR * 2.08 });
  }
  for (let f = 0; f < frames; f++) {
    const tau = f * dtau;
    const box = boxes[f];
    const h = box.size / N;
    splatBillows(spec, prim, tau, N, box, raw, vx, vy, w);
    carve(spec, tau, N, box, raw, d, noise, nrot);
    if (spec.emission) heatField(spec, tau, N, box, d, T, heatNoise);
    blur3(N, d, soft, tmp);
    lightFields(N, soft, spec.sigma * h, L, spec.ms);
    renderTile(N, { d, T, vx, vy, w, L }, spec, box, framings[f], f + 1 < frames ? framings[f + 1] : null, dtau, tile, ta, tb);
    const col = f % ATLAS_COLUMNS, row = Math.floor(f / ATLAS_COLUMNS);
    for (let y = 0; y < tile; y++) {
      const dst = ((row * tile + y) * W + col * tile) * 4;
      a.set(ta.subarray(y * tile * 4, (y + 1) * tile * 4), dst);
      b.set(tb.subarray(y * tile * 4, (y + 1) * tile * 4), dst);
    }
    if (f % 16 === 0) log(`  ${spec.id} v${variant} frame ${f}/${frames} span=${framings[f].span.toFixed(3)} box=${box.size.toFixed(3)}`);
  }
  return { a, b, W, H, rows };
}

// ---------------------------------------------------------------------------------------------------------------
// Preview: lit composites (the runtime's lighting law, simplified) for eyeballing a bake
// ---------------------------------------------------------------------------------------------------------------

function previewLit(W, H, A, B, sun, bg, albedo, emission) {
  const out = new Uint8Array(W * H * 4);
  const dec = (x) => (x / 255) ** 2;
  const [sx, sy, sz] = sun;
  const wR = Math.max(0, sx) ** 2, wL = Math.max(0, -sx) ** 2, wU = Math.max(0, sy) ** 2, wD = Math.max(0, -sy) ** 2;
  const wF = Math.max(0, sz) ** 2, wB = Math.max(0, -sz) ** 2;
  const lum = 0.2126 * albedo[0] + 0.7152 * albedo[1] + 0.0722 * albedo[2];
  const ms = 0.55 * smoothstep(0.08, 0.5, lum);
  for (let o = 0; o < W * H * 4; o += 4) {
    const a = A[o + 3] / 255;
    const R = dec(A[o]), U = dec(A[o + 1]), Lf = dec(A[o + 2]), D = dec(B[o]);
    const tau = -Math.log(Math.max(1e-3, 1 - a * 0.995));
    const front = 1 - a / 2;
    const back = a > 1e-3 ? Math.min(1, tau * (1 - a) / a) : 1;
    let sunL = wR * R + wL * Lf + wU * U + wD * D + wF * front + wB * back * 1.6;
    let sky = 0.5 * U + 0.15 * (R + Lf) + 0.2 * front;
    sunL = sunL + (Math.sqrt(sunL) - sunL) * ms;
    sky = sky + (Math.sqrt(sky) - sky) * ms * 0.6;
    const e = emission ? (B[o + 1] / 255) ** 2 : 0;
    for (let c = 0; c < 3; c++) {
      const sunC = [1.0, 0.95, 0.86][c] * 2.4, skyC = [0.42, 0.45, 0.5][c] * 1.0, gnd = [0.16, 0.15, 0.13][c];
      const fire = [1.0, 0.45, 0.12][c] * e * 5;
      const lit = albedo[c] * (sunC * sunL + skyC * sky + gnd * (0.35 * D + 0.1)) + fire;
      const col = lit / (1 + lit);
      out[o + c] = Math.round(Math.min(1, col * a + bg[c] * (1 - a)) * 255);
    }
    out[o + 3] = 255;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------------------------

async function main() {
  const arg = (name, fallback) => {
    const hit = process.argv.find((x) => x.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
  };
  const here = dirname(fileURLToPath(import.meta.url));
  const root = join(here, '..');
  const res = Number(arg('res', '96'));
  const ids = arg('media', MEDIA_ORDER.join(',')).split(',');
  const outDir = arg('out', join(root, 'public', 'fx'));
  const preview = arg('preview', null);
  const framesArg = arg('frames', null);
  const variantsArg = arg('variants', null);
  const writeLedger = process.argv.includes('--ledger');
  const bands = [];
  const ledgerMedia = {};
  for (const id of ids) {
    const spec = VOLUME_MEDIA[id];
    if (!spec) throw new Error(`unknown medium ${id}`);
    const frames = framesArg ? Number(framesArg) : spec.frames;
    const variants = variantsArg ? Number(variantsArg) : spec.variants;
    ledgerMedia[id] = { firstBand: bands.length, variants, frames, gamma: spec.gamma, emission: spec.emission };
    for (let v = 0; v < variants; v++) {
      const started = Date.now();
      const band = bakeBand(spec, v, { res, frames, log: console.log });
      console.log(`${id} v${v}: ${((Date.now() - started) / 1000).toFixed(1)} s`);
      bands.push({ id, band, spec });
    }
  }
  const W = bands[0].band.W;
  const H = bands.reduce((s, x) => s + x.band.H, 0);
  const A = new Uint8Array(W * H * 4), B = new Uint8Array(W * H * 4);
  let y = 0;
  for (const { band } of bands) { A.set(band.a, y * W * 4); B.set(band.b, y * W * 4); y += band.H; }
  mkdirSync(outDir, { recursive: true });
  // sheet B at half resolution (box filter): its responses (light from below, temperature, motion) are smooth
  const hw = W >> 1, hh = H >> 1;
  const Bh = new Uint8Array(hw * hh * 4);
  for (let yy = 0; yy < hh; yy++) for (let xx = 0; xx < hw; xx++) for (let c = 0; c < 4; c++) {
    const s0 = ((2 * yy) * W + 2 * xx) * 4 + c, s1 = s0 + 4, s2 = s0 + W * 4, s3 = s2 + 4;
    Bh[(yy * hw + xx) * 4 + c] = (B[s0] + B[s1] + B[s2] + B[s3] + 2) >> 2;
  }
  const pngA = encodePng(W, H, A), pngB = encodePng(hw, hh, Bh);
  writeFileSync(join(outDir, 'vol-media-a.png'), pngA);
  writeFileSync(join(outDir, 'vol-media-b.png'), pngB);
  console.log(`atlas ${W}x${H}: a ${pngA.length} bytes, b ${pngB.length} bytes`);
  if (preview) {
    mkdirSync(preview, { recursive: true });
    let k = 0;
    for (const { id, band, spec } of bands) {
      const albedo = id === 'billow' ? [0.12, 0.11, 0.1] : [0.6, 0.53, 0.43];
      for (const [name, sun, bg] of [['side', [0.8, 0.45, 0.4], [0.42, 0.55, 0.72]],
        ['top', [0.15, 0.95, 0.25], [0.42, 0.55, 0.72]], ['back', [0.3, 0.35, -0.89], [0.55, 0.62, 0.72]]]) {
        const lit = previewLit(band.W, band.H, band.a, band.b, sun, bg, albedo, spec.emission);
        writeFileSync(join(preview, `${id}-${k}-${name}.png`), encodePng(band.W, band.H, lit));
      }
      k++;
    }
  }
  if (writeLedger) {
    const sha = (buf) => createHash('sha256').update(buf).digest('hex');
    const ledger = {
      note: 'Generated by `node tools/fx-volume-bake.mjs --ledger` (3D billow volumes ray-marched into flipbooks; sheet '
        + 'a = light from +x, +y, -x and coverage; sheet b = light from -y, emission, motion vectors). Checked by '
        + 'src/fx/volumeMedia.selftest.mjs against src/fx/volumeMedia.ts VOLUME_ATLAS.',
      res, columns: ATLAS_COLUMNS, tile: bands[0].spec.tile, flowScale: FLOW_SCALE, width: W, height: H,
      media: ledgerMedia,
      a: [W, H, sha(pngA)], b: [hw, hh, sha(pngB)],
    };
    writeFileSync(join(root, 'src', 'fx', 'volumeAtlases.ledger.json'), `${JSON.stringify(ledger, null, 1)}\n`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
