/**
 * structureAureoleBake.ts — 2026-10-17 (the SKY lane, 227 SKY-03; owner 10-09: "shadows are still really badd on maps like
 * whiteout"; the 226 judging at tank eye height: Whiteout's buildings and props "float on a thin dark line").
 *
 * The aureole's soft shadow beside the world's standing solids. A thin deck (CloudscapeConfig.deckBeam) passes deckBeam of
 * the beam straight — the cascades carry it, sharp — and scatters the rest. Cloud droplets scatter forward (g ≈ 0.85), so
 * of what a thin deck transmits from the sun most still arrives from a disc round it: the bright patch a polar stratus
 * shows where the sun is. A source that wide casts a soft shadow: dark at a solid's foot, opening along the shadow into a
 * penumbra metres wide, gone where the solid is narrow beside its distance. The cascades cannot draw it (their kernels
 * span centimetres at a tank's distance), and the ground's sky occlusion (structureGroundOcclusionBake.ts) is the uniform
 * sky's: a ring a few decimetres wide round a crate, physically right and on bright snow nearly invisible.
 *
 * The law. The shadow a convex prism (footprint polygon, bottom y0, top y1, standing on its base) casts on the plane of
 * its base from one direction d is its footprint swept along the segment from (y0 − base)·s to (y1 − base)·s, with
 * s = −(d.x, d.z) / d.y — the Minkowski sum of the footprint and that segment, a convex polygon (the hull of the footprint
 * at both ends). The aureole is AUREOLE_SAMPLES directions on a Vogel disc of AUREOLE_RADIUS_DEG round the sun (each held
 * at or over AUREOLE_MIN_ELEVATION_DEG), and a texel's shadow is the share of them that some solid hides: in each
 * direction a texel counts once however many solids cover it (their union, not their sum), and the directions average.
 * Each footprint is rasterised exactly at the ground occlusion's 0.5 m texel; a shadow fades over the last AUREOLE_FADE of
 * AUREOLE_REACH_M from its solid (a mast's tip at a low sun lands far away and faint), so no edge is drawn.
 *
 * The raster matches the ground occlusion's: RG8 over the playable square, R the shadow in its upper seven bits and in its
 * lowest whether the texel lies inside a standing solid, G the shading solid's base modulo SGO_BASE_WRAP_M (the pass lets
 * only receivers near that base take the term). A covered texel takes the mean of its open neighbours, so the filtered
 * read at a wall line is the wall foot's own value on each side, never the inside's full shadow bleeding onto the sunlit
 * side. The receiver stands on the solid's base (the bake needs no terrain): exact on level ground, and the pass's height
 * gate keeps a slope's far receivers out.
 *
 * No DOM, no WebGL, no three: the worker (structureGroundOcclusionWorker.ts) and the receipt run it as it is.
 */
import {
  SGO_BASE_WRAP_M, SGO_HALF_M, SGO_OVERHANG_M, SGO_SIZE, sgoRectOf, type SgoBakeResult, type SgoRect,
} from './structureGroundOcclusionBake.ts';

/** The aureole's angular radius round the sun (degrees): the soft shadow's source. */
export const AUREOLE_RADIUS_DEG = 8;
/** Directions over the aureole's disc (Vogel): 32 steps across a penumbra, each a 3 % step. */
export const AUREOLE_SAMPLES = 32;
/** No direction lower than this (degrees): the disc's part under it lands at it (a horizon's shadows are infinite). */
export const AUREOLE_MIN_ELEVATION_DEG = 3;
/** A shadow's reach from its solid (m), and the share of it over which the shadow fades out. */
export const AUREOLE_REACH_M = 40;
export const AUREOLE_FADE = 0.4;

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const DEG = Math.PI / 180;

/** The direction toward a sun at an elevation and azimuth (degrees): atmosphere.ts sunDirectionOf without three. */
export function aureoleSunOf(elevationDeg: number, azimuthDeg: number): [number, number, number] {
  const phi = (90 - elevationDeg) * DEG, theta = azimuthDeg * DEG;
  return [Math.sin(phi) * Math.sin(theta), Math.cos(phi), Math.sin(phi) * Math.cos(theta)];
}

/** (227 v2) The disc's directions as unit vectors toward them (y up), the elevation floor held: the hulls' aureole. */
export function aureoleDirections(sun: readonly number[], radiusDeg = AUREOLE_RADIUS_DEG, samples = 8): Float64Array {
  const off = aureoleOffsets(sun, radiusDeg, samples);
  const out = new Float64Array(samples * 3);
  for (let k = 0; k < samples; k++) {
    // a ground offset s = −(d.x, d.z) / d.y back to the unit direction d
    const sx = off[2 * k], sz = off[2 * k + 1], l = Math.hypot(sx, sz, 1);
    out[3 * k] = -sx / l; out[3 * k + 1] = 1 / l; out[3 * k + 2] = -sz / l;
  }
  return out;
}

/**
 * The aureole's directions as ground displacements: per direction the (x, z) a point one metre over the plane casts its
 * shadow at, relative to its foot. `sun` is the direction toward the sun (y up).
 */
export function aureoleOffsets(sun: readonly number[], radiusDeg = AUREOLE_RADIUS_DEG, samples = AUREOLE_SAMPLES): Float64Array {
  const len = Math.hypot(sun[0], sun[1], sun[2]) || 1;
  const sx = sun[0] / len, sy = sun[1] / len, sz = sun[2] / len;
  // a tangent frame round the sun: e1 horizontal (the sun's azimuth turned a right angle), e2 = sun × e1
  let e1x = -sz, e1z = sx;
  const e1l = Math.hypot(e1x, e1z);
  if (e1l < 1e-6) { e1x = 1; e1z = 0; } else { e1x /= e1l; e1z /= e1l; }
  const e2x = sy * e1z, e2y = sz * e1x - sx * e1z, e2z = -sy * e1x;
  const minY = Math.sin(AUREOLE_MIN_ELEVATION_DEG * DEG);
  const out = new Float64Array(samples * 2);
  const rad = Math.max(0, radiusDeg) * DEG;
  for (let k = 0; k < samples; k++) {
    const r = rad * Math.sqrt((k + 0.5) / samples), th = k * GOLDEN_ANGLE;
    const c = Math.cos(r), s = Math.sin(r), ct = Math.cos(th), st = Math.sin(th);
    let dx = sx * c + (e1x * ct + e2x * st) * s;
    let dy = sy * c + (e2y * st) * s;
    let dz = sz * c + (e1z * ct + e2z * st) * s;
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;
    if (dy < minY) {
      // held at the floor's elevation on its own azimuth
      const h = Math.hypot(dx, dz) || 1, ch = Math.sqrt(1 - minY * minY);
      dx = (dx / h) * ch; dz = (dz / h) * ch; dy = minY;
    }
    out[2 * k] = -dx / dy;
    out[2 * k + 1] = -dz / dy;
  }
  return out;
}

/**
 * Visit the texels whose centres lie inside a convex polygon (x z pairs), clipped to [i0, i1) × [j0, j1): `visit(i, j)`.
 */
function rasterConvex(
  poly: ArrayLike<number>, i0: number, j0: number, i1: number, j1: number, texel: number, half: number,
  visit: (i: number, j: number) => void,
): void {
  const n = poly.length / 2;
  if (n < 3) return;
  let minZ = Infinity, maxZ = -Infinity;
  for (let k = 0; k < n; k++) { const z = poly[2 * k + 1]; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z; }
  const ja = Math.max(j0, Math.ceil((minZ + half) / texel - 0.5)), jb = Math.min(j1 - 1, Math.floor((maxZ + half) / texel - 0.5));
  for (let j = ja; j <= jb; j++) {
    const z = -half + (j + 0.5) * texel;
    let xa = Infinity, xb = -Infinity;
    for (let k = 0; k < n; k++) {
      const m = (k + 1) % n;
      const za = poly[2 * k + 1], zb = poly[2 * m + 1];
      if ((z < za) === (z < zb)) continue;
      const x = poly[2 * k] + ((z - za) / (zb - za)) * (poly[2 * m] - poly[2 * k]);
      if (x < xa) xa = x; if (x > xb) xb = x;
    }
    if (!(xb >= xa)) continue;
    const ia = Math.max(i0, Math.ceil((xa + half) / texel - 0.5)), ib = Math.min(i1 - 1, Math.floor((xb + half) / texel - 0.5));
    for (let i = ia; i <= ib; i++) visit(i, j);
  }
}

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Bake the aureole's shadow raster (or one rectangle of it) from packed occluders (structureGroundOcclusionBake.ts
 * packOccluders) and the direction toward the sun. A rectangle is computed in full: every solid whose shadow reaches it
 * contributes, so a re-bake around a destroyed solid matches a full bake there.
 */
export function bakeStructureAureole(
  packed: Float32Array, sun: readonly number[], rect: SgoRect | null = null, radiusDeg = AUREOLE_RADIUS_DEG,
  size = SGO_SIZE, half = SGO_HALF_M,
): SgoBakeResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const texel = (2 * half) / size;
  const [ri0, rj0, ri1, rj1] = rect ?? [0, 0, size, size];
  // the ring round the rectangle for the covered texels' neighbours
  const i0 = Math.max(0, ri0 - 1), j0 = Math.max(0, rj0 - 1), i1 = Math.min(size, ri1 + 1), j1 = Math.min(size, rj1 + 1);
  const w = i1 - i0, h = j1 - j0;
  const offsets = aureoleOffsets(sun, radiusDeg);
  const samples = offsets.length / 2;
  // per texel: the summed weight (0..255 a direction), the direction that last wrote it and its weight there, the base
  const acc = new Uint16Array(w * h);
  const stamp = new Uint8Array(w * h);
  const last = new Uint8Array(w * h);
  const baseByte = new Uint8Array(w * h);
  const covered = new Uint8Array(w * h);
  const wrap = (y: number) => {
    const m = ((y % SGO_BASE_WRAP_M) + SGO_BASE_WRAP_M) % SGO_BASE_WRAP_M;
    return Math.round((m / SGO_BASE_WRAP_M) * 256) & 255;
  };
  // the parts once: footprint, heights, centroid, bounds
  interface Part { o: number; n: number; lo: number; hi: number; base: number; cx: number; cz: number; standing: boolean;
    minX: number; minZ: number; maxX: number; maxZ: number }
  const parts: Part[] = [];
  for (let o = 0; o < packed.length;) {
    const n = packed[o], y0 = packed[o + 1], y1 = packed[o + 2], base = packed[o + 3], po = o + 4;
    o = po + 2 * n;
    const hi = y1 - base;
    if (!(hi > 0)) continue;
    let cx = 0, cz = 0, minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (let k = 0; k < n; k++) {
      const x = packed[po + 2 * k], z = packed[po + 2 * k + 1];
      cx += x; cz += z;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const reach = AUREOLE_REACH_M;
    // a part whose shadow cannot reach the rectangle stays out
    const [pi0, pj0, pi1, pj1] = sgoRectOf(minX - reach, minZ - reach, maxX + reach, maxZ + reach, size, half);
    if (Math.max(pi0, i0) >= Math.min(pi1, i1) || Math.max(pj0, j0) >= Math.min(pj1, j1)) continue;
    parts.push({ o: po, n, lo: Math.max(0, y0 - base), hi, base, cx: cx / n, cz: cz / n, standing: y0 - base < SGO_OVERHANG_M,
      minX, minZ, maxX, maxZ });
  }
  // the standing footprints: covered texels (the pass holds them to receivers at the base itself)
  for (const p of parts) {
    if (!p.standing) continue;
    const poly = Array.from(packed.subarray(p.o, p.o + 2 * p.n));
    rasterConvex(poly, i0, j0, i1, j1, texel, half, (i, j) => {
      const idx = (j - j0) * w + (i - i0);
      covered[idx] = 1;
      baseByte[idx] = wrap(p.base);
    });
  }
  const fadeFrom = AUREOLE_REACH_M * (1 - AUREOLE_FADE);
  // the swept polygon, built in place (the Minkowski sum of a convex footprint and a segment: each corner at the near end,
  // the far end or both, by whether its two edges face along the sweep), at most 2n corners
  let maxN = 3;
  for (const p of parts) if (p.n > maxN) maxN = p.n;
  const poly = new Float64Array(4 * maxN);
  for (let k = 0; k < samples; k++) {
    const ox = offsets[2 * k], oz = offsets[2 * k + 1];
    const ol = Math.hypot(ox, oz);
    const ux = ol > 1e-9 ? ox / ol : 0, uz = ol > 1e-9 ? oz / ol : 0;
    const dirId = k + 1;
    for (const p of parts) {
      const far = Math.min(p.hi * ol, AUREOLE_REACH_M), near = Math.min(p.lo * ol, far);
      const n = p.n, po = p.o;
      let m = 0, ext = -Infinity;
      for (let q = 0; q < n; q++) {
        const qp = (q + n - 1) % n, qn = (q + 1) % n;
        const x = packed[po + 2 * q], z = packed[po + 2 * q + 1];
        // outward normals of a counter-clockwise footprint's edges (qp→q) and (q→qn): (ez, −ex)
        const fPrev = (z - packed[po + 2 * qp + 1]) * ux - (x - packed[po + 2 * qp]) * uz > 0;
        const fNext = (packed[po + 2 * qn + 1] - z) * ux - (packed[po + 2 * qn] - x) * uz > 0;
        if (!fPrev && !fNext) { poly[m++] = x + ux * near; poly[m++] = z + uz * near; }
        else if (fPrev && fNext) { poly[m++] = x + ux * far; poly[m++] = z + uz * far; }
        else if (fNext) { poly[m++] = x + ux * near; poly[m++] = z + uz * near; poly[m++] = x + ux * far; poly[m++] = z + uz * far; }
        else { poly[m++] = x + ux * far; poly[m++] = z + uz * far; poly[m++] = x + ux * near; poly[m++] = z + uz * near; }
        const e = (x - p.cx) * ux + (z - p.cz) * uz;
        if (e > ext) ext = e;
      }
      const corners = m / 2;
      const bw = wrap(p.base);
      // the fade is needed only where the sweep passes fadeFrom past the solid
      const fades = far > fadeFrom;
      let minZ = Infinity, maxZ = -Infinity;
      for (let q = 0; q < corners; q++) { const z = poly[2 * q + 1]; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z; }
      const ja = Math.max(j0, Math.ceil((minZ + half) / texel - 0.5)), jb = Math.min(j1 - 1, Math.floor((maxZ + half) / texel - 0.5));
      for (let j = ja; j <= jb; j++) {
        const z = -half + (j + 0.5) * texel;
        let xa = Infinity, xb = -Infinity;
        for (let q = 0; q < corners; q++) {
          const r = q + 1 === corners ? 0 : q + 1;
          const za = poly[2 * q + 1], zb = poly[2 * r + 1];
          if ((z < za) === (z < zb)) continue;
          const x = poly[2 * q] + ((z - za) / (zb - za)) * (poly[2 * r] - poly[2 * q]);
          if (x < xa) xa = x; if (x > xb) xb = x;
        }
        if (!(xb >= xa)) continue;
        const ia = Math.max(i0, Math.ceil((xa + half) / texel - 0.5)), ib = Math.min(i1 - 1, Math.floor((xb + half) / texel - 0.5));
        const row = (j - j0) * w - i0;
        for (let i = ia; i <= ib; i++) {
          const idx = row + i;
          let wt = 255;
          if (fades) {
            const along = (-half + (i + 0.5) * texel - p.cx) * ux + (z - p.cz) * uz - ext;
            if (along > fadeFrom) {
              wt = Math.round(255 * (1 - smoothstep(fadeFrom, AUREOLE_REACH_M, along)));
              if (wt <= 0) continue;
            }
          }
          if (stamp[idx] !== dirId) {
            stamp[idx] = dirId;
            last[idx] = wt;
            acc[idx] += wt;
            if (!covered[idx] && wt >= 128) baseByte[idx] = bw;
          } else if (wt > last[idx]) {
            acc[idx] += wt - last[idx];
            last[idx] = wt;
          }
        }
      }
    }
  }
  const ow = ri1 - ri0, oh = rj1 - rj0;
  const rg = new Uint8Array(ow * oh * 2);
  const enc = (v: number, cov: boolean) => (Math.max(0, Math.min(127, Math.round(v * 127))) << 1) | (cov ? 1 : 0);
  const share = (idx: number) => acc[idx] / (255 * samples);
  for (let j = rj0; j < rj1; j++) {
    for (let i = ri0; i < ri1; i++) {
      const idx = (j - j0) * w + (i - i0);
      let v = share(idx);
      if (covered[idx]) {
        let sum = 0, cnt = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ii = i + di - i0, jj = j + dj - j0;
            if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
            const k = jj * w + ii;
            if (covered[k]) continue;
            sum += share(k); cnt++;
          }
        }
        v = cnt ? sum / cnt : 0;
      }
      const q = ((j - rj0) * ow + (i - ri0)) * 2;
      rg[q] = enc(v, covered[idx] === 1);
      rg[q + 1] = v > 0 || covered[idx] ? baseByte[idx] : 0;
    }
  }
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return { rg, rect: [ri0, rj0, ri1, rj1], parts: parts.length, ms: t1 - t0 };
}
