// The map-borders lane (2026-10-03, gauntlet wave 1: "the empty middle distance" — the field boundaries past the edge
// carried their hedgerows as ring-forest trees standing 20-40 m apart, which from the square read as a dotted line of
// lollipops at best and as nothing past 300 m; WoT's border shots and the bocage photographs read their country by its
// hedges: continuous dark bands of bush layered in depth). The hedges as geometry: along every hedged stretch of a
// field boundary past the edge (the landform's own field system, borderLandform.ts traceHedgeLines, or a map's land
// use), a bush line seated on the ring's own surface. One merged, vertex-coloured mesh in the ring forest's broadleaf
// palette: one draw and one far-cascade shadow draw; the standards (the trees in the hedge) stay the ring forest's.
//
// (the borders lane, 2026-10-08, the PR head's border census: Verdant's hedges stood in the middle distance as "dark
// flat slabs" — (40, 55, 57) against a shaded crown's (51, 73, 57) — and Tarkhan's as smooth lime-green tubes lying
// on the gold steppe) A bush line is a string of crowns, not a prism: round crowns 4.5-9 m apart, each its own height
// and shade, over the hedge's body and its slower swell, drawn on stations every 2 m near the edge (4 m farther out);
// its section rounded — foot, a shoulder bulging at three fifths of the height, the crest — and every run closed at
// its ends; its normals turned out and up from the line as a crown's are (a shaded side keeps the sky's light, the
// lumps catch the sun along the crest); its tone a crown's: darker at the foot and between the bushes, lit at the
// crest, each bush its own shade.
import * as THREE from 'three';
import { SHADOW_CASTER_LAST_CASCADE, setShadowCasterCascades } from '../engine/renderLayers.ts';

/** A hedged stretch: world points ~8 m apart along a field boundary, each with the hedge's presence (0..1). A line may
 * carry its own height and girth factors (a woods edge's mantle, horizonVista.ts: taller and broader bushes). */
export interface HedgeLine { xs: number[]; zs: number[]; w: number[]; heightK?: number; girthK?: number }

export interface HedgePalette { hue: number; sat: number; l0: number; l1: number }

export interface BorderHedgerowOptions {
  seed: number;
  lines: readonly HedgeLine[];
  /** The rendered ground at (x, z) (the ring's seated surface); NaN where there is none. */
  groundAt(x: number, z: number): number;
  /** The ring forest's broadleaf palette (sRGB HSL): the hedge takes its crowns' green. */
  palette: HedgePalette;
  /** Bush crest height range (m). */
  heightM?: readonly [number, number];
  /**
   * 'hedge' (the default): a bush line. 'wall': a karst field's dry stone wall — 0.9-1.3 m of grey limestone, 0.9 m
   * across at its foot, its crest barely lumpy (the palette is then the stone's).
   */
  kind?: 'hedge' | 'wall';
}

const PRESENCE = 0.32;
/** The hedge's evergreen undergrowth (sRGB hue): an olive green. */
const HEDGE_EVERGREEN_HUE = 0.21;
const HALF_FOOT_M = 1.3;
/** A hedge's stations: the traced line's points (~8 m) cut in four (every 2 m, so a crown's round top is drawn) where the
 * run passes within HEDGE_FINE_OUT_M of the square's edge, in two (every 4 m, its crowns no narrower than a station's
 * reach) farther out, where a crown is a few pixels across from anywhere a tank can stand. */
const HEDGE_SUBDIVIDE_NEAR = 4;
const HEDGE_SUBDIVIDE_FAR = 2;
const HEDGE_FINE_OUT_M = 260;
const SQUARE_EDGE_M = 512;

function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const _color = new THREE.Color();

/** The hedgerows' merged mesh, or null when no stretch is hedged. The caller joins its material to the cascades. */
export function buildBorderHedgerows(options: BorderHedgerowOptions): THREE.Mesh | null {
  return options.kind === 'wall' ? buildWalls(options) : buildHedges(options);
}

/** A station of a bush line: the line point, its across direction, the ground, the crest and the girth. */
interface HedgeStation { x: number; z: number; nx: number; nz: number; tx: number; tz: number; g: number; crest: number; half: number; lean: number; shade: number; hue: number; sat: number }

function buildHedges(options: BorderHedgerowOptions): THREE.Mesh | null {
  const [hLo, hHi] = options.heightM ?? [2.4, 4.6];
  const rng = mulberry32((options.seed ^ 0x4ED6E) >>> 0);
  const pal = options.palette;
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
  const col = (l: number, hueShift: number, satK: number, out: number[]): void => {
    _color.setHSL(pal.hue + hueShift, Math.min(1, pal.sat * 0.92 * satK), Math.min(0.9, l), THREE.SRGBColorSpace);
    out[0] = _color.r; out[1] = _color.g; out[2] = _color.b;
  };
  // (the round's census, Amberford's corner from 60 m: one tone a crown and smooth shading read as clay — sandbags,
  // not leaves) each vertex its own breath of light and of tilt, as the clumps of a bush's leaves catch the sky
  const jitter = (k: number, slot: number): number => {
    const v = Math.sin(k * 12.9898 + slot * 78.233 + tintSeed) * 43758.5453;
    return v - Math.floor(v);
  };
  let tintSeed = 0;
  const cFoot = [0, 0, 0], cShoulder = [0, 0, 0], cCrest = [0, 0, 0];
  let vertex = 0;
  const pushV = (x: number, y: number, z: number, nx: number, ny: number, nz: number, c: number[]): number => {
    const l = Math.hypot(nx, ny, nz) || 1;
    positions.push(x, y, z); normals.push(nx / l, ny / l, nz / l); colors.push(c[0], c[1], c[2]);
    return vertex++;
  };
  for (const line of options.lines) {
    const n = line.xs.length;
    const heightK = line.heightK ?? 1, girthK = line.girthK ?? 1;
    let i = 0;
    while (i < n) {
      // a run: consecutive points where the hedge stands
      while (i < n && !(line.w[i] > PRESENCE)) i++;
      const start = i;
      while (i < n && line.w[i] > PRESENCE) i++;
      const end = i; // exclusive
      if (end - start < 2) continue;
      const tint = rng() * 2 - 1, phase = rng() * 100, leanK = 0.6 + rng() * 0.8;
      tintSeed = phase;
      // the stations: each traced point and the midpoints between them, the presence interpolated
      const pts: { x: number; z: number; w: number }[] = [];
      let nearest = Infinity;
      for (let k = start; k < end; k++) nearest = Math.min(nearest, Math.max(Math.abs(line.xs[k]), Math.abs(line.zs[k])) - SQUARE_EDGE_M);
      const sub = nearest < HEDGE_FINE_OUT_M ? HEDGE_SUBDIVIDE_NEAR : HEDGE_SUBDIVIDE_FAR;
      for (let k = start; k < end; k++) {
        for (let q = 0; q < sub; q++) {
          if (k === end - 1 && q > 0) break;
          const f = q / sub, k1 = Math.min(end - 1, k + 1);
          pts.push({ x: line.xs[k] + (line.xs[k1] - line.xs[k]) * f, z: line.zs[k] + (line.zs[k1] - line.zs[k]) * f,
            w: line.w[k] + (line.w[k1] - line.w[k]) * f });
        }
      }
      const m = pts.length, step = 8 / sub;
      // the crowns along the run: a bush every 4.5-9 m, its round top (a half-ellipse over 50-70 % of the spacing either side)
      // on the hedge's body (half the crest), each its own height and shade
      // (each crown its own species' turn of the palette: a little greener or browner, a little duller or brighter; and a
      // third of them the hedge's evergreen undergrowth — bramble, holly, ivy — an olive green whatever the season, so an
      // autumn hedge reads rust and olive, not one dusty pink: Amberford's corner, the round's census)
      const crowns: { c: number; r: number; h: number; shade: number; hue: number; sat: number }[] = [];
      for (let c = rng() * 4; c < (m - 1) * step + 6; c += 4.5 + rng() * 4.5) {
        const gap = 4.5 + rng() * 4.5;
        const evergreen = rng() < 0.33;
        // (never under 1.6 stations either side: a narrower one is drawn as a spike)
        crowns.push({ c, r: Math.max(1.6 * step, gap * (0.5 + rng() * 0.2)), h: 0.80 + rng() * 0.42, shade: 0.86 + rng() * 0.30,
          hue: evergreen ? (HEDGE_EVERGREEN_HUE - pal.hue) * 0.85 : (rng() - 0.5) * 0.07, sat: evergreen ? 1.0 : 0.8 + rng() * 0.3 });
      }
      const crownAt = (sArc: number): { lift: number; shade: number; hue: number; sat: number } => {
        let lift = 0.5, shade = 0.92, hue = 0, sat = 0.9;
        for (const cr of crowns) {
          const d = (sArc - cr.c) / cr.r;
          if (d <= -1 || d >= 1) continue;
          const top = cr.h * Math.sqrt(1 - d * d);
          if (top > lift) { lift = top; shade = cr.shade; hue = cr.hue; sat = cr.sat; }
        }
        return { lift, shade, hue, sat };
      };
      const stations: (HedgeStation | null)[] = [];
      for (let k = 0; k < m; k++) {
        const p = pts[k];
        const g = options.groundAt(p.x, p.z);
        if (!Number.isFinite(g)) { stations.push(null); continue; }
        const kp = Math.max(0, k - 1), kn = Math.min(m - 1, k + 1);
        let tx = pts[kn].x - pts[kp].x, tz = pts[kn].z - pts[kp].z;
        const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        // the slow swell along the line (tens of metres) and each bush's own crown over it
        const s = k * step + phase;
        const swell = 0.5 + 0.30 * Math.sin(s * 0.19) + 0.16 * Math.sin(s * 0.071 + 1.7);
        const endTaper = Math.min(1, (k * step + 2) / 10, ((m - 1 - k) * step + 2) / 10);
        const presence = Math.min(1, (p.w - PRESENCE) / (1 - PRESENCE) * 1.6);
        // (the crest a string of crowns 4.5-9 m apart over the hedge's body, not a wavy embankment: the PR head's census and
        // this lane's render at 120 and 300 m)
        const { lift, shade, hue: crownHue, sat: crownSat } = crownAt(k * step);
        const crest = (hLo + (hHi - hLo) * swell) * lift * (0.30 + 0.70 * endTaper) * (0.55 + 0.45 * presence) * heightK;
        const half = HALF_FOOT_M * (0.75 + 0.35 * swell) * (0.70 + 0.36 * lift) * (0.45 + 0.55 * endTaper) * girthK;
        stations.push({ x: p.x, z: p.z, nx: -tz, nz: tx, tx, tz, g, crest, half, lean: (swell - 0.5) * 0.5 * leanK + (rng() - 0.5) * 0.25,
          shade: shade * (0.95 + 0.10 * rng()), hue: crownHue, sat: crownSat });
      }
      // the rings of five vertices — left foot, left shoulder, crest, right shoulder, right foot — and the closing tips
      let prev: number[] | null = null;
      const tipAt = (st: HedgeStation, dir: number): number => {
        // the run's end closes on a low point a station's half-step beyond, the foliage's dark at the ground
        col(pal.l0 * 0.92, tint * 0.025, 1, cFoot);
        return pushV(st.x + st.tx * dir * step * 0.5, st.g + 0.3, st.z + st.tz * dir * step * 0.5, st.tx * dir, 0.8, st.tz * dir, cFoot);
      };
      for (let k = 0; k < m; k++) {
        const st = stations[k];
        if (!st) { prev = null; continue; }
        const nb = stations[Math.min(m - 1, k + 1)] ?? st, pb = stations[Math.max(0, k - 1)] ?? st;
        // the crest's slope along the line tilts its normal so the lumps catch the light on their sunward flank
        const dCrest = ((nb.g + nb.crest) - (pb.g + pb.crest)) / (2 * step);
        const ax = -st.tx * dCrest * 0.9, az = -st.tz * dCrest * 0.9;
        const hue = tint * 0.025 + (st.shade - 1) * 0.04 + st.hue;
        // (the ring forest's crowns run l0 at their foot to l1 at their top, horizonVista.ts paintCanopy; a hedge's crowns
        // face the sky and the sun far more than a tree's lobes do, so at the crowns' own tones the bush lines read as
        // light moss mounds over the sward — (88-102, 118-134, 72-74) beside crowns at (53-69, 80-86, 63-70), the round's
        // first b1 census: they keep 0.8-0.92 of those tones, a breath less saturated)
        col(pal.l0 * 0.80 * st.shade, hue, st.sat, cFoot);
        const foot = st.g - 0.7, top = st.g + st.crest, shoulderY = st.g + st.crest * 0.6;
        const cx = st.x + st.nx * st.lean, cz = st.z + st.nz * st.lean;
        const ring: number[] = [];
        for (const side of [1, -1]) {
          const sx = st.nx * side, sz = st.nz * side;
          ring.push(pushV(st.x + sx * st.half * 0.78, foot, st.z + sz * st.half * 0.78, sx * 0.85 + ax, 0.55, sz * 0.85 + az, cFoot));
          const js = jitter(k, side > 0 ? 1 : 2), jt = jitter(k, side > 0 ? 3 : 4) - 0.5;
          col((pal.l0 + pal.l1) * 0.5 * 0.90 * st.shade * (0.90 + 0.20 * js), hue, st.sat, cShoulder);
          ring.push(pushV(cx + sx * st.half, shoulderY, cz + sz * st.half,
            sx * 0.70 + ax + st.tx * jt * 0.36, 0.70, sz * 0.70 + az + st.tz * jt * 0.36, cShoulder));
        }
        // the order round the section: left foot 0, left shoulder 1, crest 2, right shoulder 3, right foot 4
        const jc = jitter(k, 5), jx = jitter(k, 6) - 0.5, jz = jitter(k, 7) - 0.5;
        col(pal.l1 * 0.92 * st.shade * (0.88 + 0.24 * jc), hue, st.sat, cCrest);
        const crestV = pushV(cx, top, cz, st.nx * 0.12 + ax * 1.4 + jx * 0.36, 1.0, st.nz * 0.12 + az * 1.4 + jz * 0.36, cCrest);
        const section = [ring[0], ring[1], crestV, ring[3], ring[2]];
        if (!prev) {
          // a run's first station (or the first after a gap in the ground): close it with a tip behind it
          const tip = tipAt(st, -1);
          for (let q = 0; q < 4; q++) indices.push(tip, section[q], section[q + 1]);
          indices.push(tip, section[4], section[0]);
        } else {
          for (let q = 0; q < 4; q++) {
            const a0 = prev[q], a1 = prev[q + 1], b0 = section[q], b1 = section[q + 1];
            indices.push(a0, b0, b1, a0, b1, a1); // (front faces outward: along the line, then over the section)
          }
        }
        const next = k + 1 < m ? stations[k + 1] : null;
        if (!next) {
          const tip = tipAt(st, 1);
          for (let q = 0; q < 4; q++) indices.push(tip, section[q + 1], section[q]);
          indices.push(tip, section[0], section[4]);
        }
        prev = section;
      }
    }
  }
  if (positions.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(vertex > 65535 ? new THREE.Uint32BufferAttribute(indices, 1) : new THREE.Uint16BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return finish(geometry, indices.length / 3);
}

/** A karst field's dry stone walls: the low prism along every boundary, grey limestone (unchanged from the hedges' first form). */
function buildWalls(options: BorderHedgerowOptions): THREE.Mesh | null {
  const [hLo, hHi] = options.heightM ?? [0.9, 1.3];
  const halfFoot = 0.45;
  const rng = mulberry32((options.seed ^ 0x4ED6E) >>> 0);
  const positions: number[] = [], normals: number[] = [], colors: number[] = [];
  const pal = options.palette;
  const col = (l: number, tint: number): [number, number, number] => {
    _color.setHSL(pal.hue + tint * 0.025, pal.sat * (0.9 + 0.2 * Math.abs(tint)), l, THREE.SRGBColorSpace);
    return [_color.r, _color.g, _color.b];
  };
  const pushV = (x: number, y: number, z: number, nx: number, ny: number, nz: number, c: [number, number, number]): void => {
    positions.push(x, y, z); normals.push(nx, ny, nz); colors.push(c[0], c[1], c[2]);
  };
  for (const line of options.lines) {
    const n = line.xs.length;
    let i = 0;
    while (i < n) {
      while (i < n && !(line.w[i] > PRESENCE)) i++;
      const start = i;
      while (i < n && line.w[i] > PRESENCE) i++;
      const end = i;
      if (end - start < 2) continue;
      const tint = rng() * 2 - 1, phase = rng() * 100;
      rng();
      type Section = { lx: number; lz: number; rx: number; rz: number; cx: number; cz: number; foot: number; crest: number; nx: number; nz: number };
      const sections: (Section | null)[] = [];
      for (let k = start; k < end; k++) {
        const x = line.xs[k], z = line.zs[k];
        const g = options.groundAt(x, z);
        if (!Number.isFinite(g)) { sections.push(null); continue; }
        const kp = Math.max(start, k - 1), kn = Math.min(end - 1, k + 1);
        let tx = line.xs[kn] - line.xs[kp], tz = line.zs[kn] - line.zs[kp];
        const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        const nx = -tz, nz = tx;
        const s = (k - start) * 8 + phase;
        const lump = 0.5 + 0.18 * Math.sin(s * 0.13) + 0.08 * Math.sin(s * 0.9 + 1.7);
        const endTaper = Math.min(1, (k - start + 0.6) / 1.6, (end - 1 - k + 0.6) / 1.6);
        const presence = Math.min(1, (line.w[k] - PRESENCE) / (1 - PRESENCE) * 1.6);
        const crest = (hLo + (hHi - hLo) * lump) * (0.35 + 0.65 * endTaper) * (0.55 + 0.45 * presence);
        const half = halfFoot * (0.8 + 0.4 * lump) * (0.6 + 0.4 * endTaper);
        sections.push({ lx: x + nx * half, lz: z + nz * half, rx: x - nx * half, rz: z - nz * half,
          cx: x, cz: z, foot: g - 0.35, crest: g + crest, nx, nz });
      }
      const base = col(pal.l0 * 0.78, tint), top = col(pal.l1 * 0.9, tint);
      for (let k = 0; k + 1 < sections.length; k++) {
        const a = sections[k], b = sections[k + 1];
        if (!a || !b) continue;
        for (const side of [1, -1]) {
          const ax = side > 0 ? a.lx : a.rx, az = side > 0 ? a.lz : a.rz, bx = side > 0 ? b.lx : b.rx, bz = side > 0 ? b.lz : b.rz;
          const nxa = a.nx * side * 0.78, nza = a.nz * side * 0.78, nxb = b.nx * side * 0.78, nzb = b.nz * side * 0.78;
          const up = 0.62;
          pushV(ax, a.foot, az, nxa, up, nza, base); pushV(bx, b.foot, bz, nxb, up, nzb, base); pushV(b.cx, b.crest, b.cz, nxb * 0.4, 0.92, nzb * 0.4, top);
          pushV(ax, a.foot, az, nxa, up, nza, base); pushV(b.cx, b.crest, b.cz, nxb * 0.4, 0.92, nzb * 0.4, top); pushV(a.cx, a.crest, a.cz, nxa * 0.4, 0.92, nza * 0.4, top);
        }
      }
    }
  }
  if (positions.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const nrm = new Float32Array(normals);
  for (let i = 0; i < nrm.length; i += 3) {
    const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1;
    nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l;
  }
  geometry.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return finish(geometry, positions.length / 9);
}

function finish(geometry: THREE.BufferGeometry, triangles: number): THREE.Mesh {
  // (a bush line is closed and wound outward, so its back faces never show; it stays double-sided all the same, the
  // program the farmsteads' material shares — borderFarmsteads.ts — rather than a variant of its own)
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide });
  material.envMapIntensity = 0.85;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'border-hedgerows';
  mesh.userData.borderHedgerows = { triangles };
  mesh.userData.aoExclude = true;
  mesh.castShadow = true;
  setShadowCasterCascades(mesh, SHADOW_CASTER_LAST_CASCADE);
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = false;
  return mesh;
}
