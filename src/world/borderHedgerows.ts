// The map-borders lane (2026-10-03, gauntlet wave 1: "the empty middle distance" — the field boundaries past the edge
// carried their hedgerows as ring-forest trees standing 20-40 m apart, which from the square read as a dotted line of
// lollipops at best and as nothing past 300 m; WoT's border shots and the bocage photographs read their country by its
// hedges: continuous dark bands of bush layered in depth). The hedges as geometry: along every hedged stretch of a
// field boundary past the edge (the landform's own field system, borderLandform.ts traceHedgeLines, or a map's land
// use), a bush line — a low prism 2.6 m across at its foot, 2.4-4.6 m high with a lumpy crest, tapered where a gap or
// a gate opens — seated on the ring's own surface. One merged, vertex-coloured mesh in the ring forest's broadleaf
// palette: one draw and one far-cascade shadow draw; the standards (the trees in the hedge) stay the ring forest's.
import * as THREE from 'three';
import { SHADOW_CASTER_LAST_CASCADE, setShadowCasterCascades } from '../engine/renderLayers.ts';

/** A hedged stretch: world points ~8 m apart along a field boundary, each with the hedge's presence (0..1). */
export interface HedgeLine { xs: number[]; zs: number[]; w: number[] }

export interface HedgePalette { hue: number; sat: number; l0: number; l1: number }

export interface BorderHedgerowOptions {
  seed: number;
  lines: readonly HedgeLine[];
  /** The rendered ground at (x, z) (the ring's seated surface); NaN where there is none. */
  groundAt(x: number, z: number): number;
  /** The ring forest's broadleaf palette (sRGB HSL): the hedge is a shade darker and denser. */
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
const HALF_FOOT_M = 1.3;

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
  const wall = options.kind === 'wall';
  const [hLo, hHi] = options.heightM ?? (wall ? [0.9, 1.3] : [2.4, 4.6]);
  const halfFoot = wall ? 0.45 : HALF_FOOT_M;
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
      // a run: consecutive points where the hedge stands
      while (i < n && !(line.w[i] > PRESENCE)) i++;
      const start = i;
      while (i < n && line.w[i] > PRESENCE) i++;
      const end = i; // exclusive
      if (end - start < 2) continue;
      const tint = rng() * 2 - 1, phase = rng() * 100, lean = 0.6 + rng() * 0.8;
      // the cross-sections: foot either side, crest on the line
      type Section = { lx: number; lz: number; rx: number; rz: number; cx: number; cz: number; foot: number; crest: number; nx: number; nz: number };
      const sections: Section[] = [];
      for (let k = start; k < end; k++) {
        const x = line.xs[k], z = line.zs[k];
        const g = options.groundAt(x, z);
        if (!Number.isFinite(g)) { sections.push(null as unknown as Section); continue; }
        const kp = Math.max(start, k - 1), kn = Math.min(end - 1, k + 1);
        let tx = line.xs[kn] - line.xs[kp], tz = line.zs[kn] - line.zs[kp];
        const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        const nx = -tz, nz = tx; // across the line
        // the crest: lumpy along the line, tapered at the run's ends and by the hedge's own presence
        const s = (k - start) * 8 + phase;
        const lump = wall ? 0.5 + 0.18 * Math.sin(s * 0.13) + 0.08 * Math.sin(s * 0.9 + 1.7)
          : 0.5 + 0.28 * Math.sin(s * 0.21) + 0.14 * Math.sin(s * 0.57 + 1.7) + 0.08 * Math.sin(s * 1.31 + 0.4);
        const endTaper = Math.min(1, (k - start + 0.6) / 1.6, (end - 1 - k + 0.6) / 1.6);
        const presence = Math.min(1, (line.w[k] - PRESENCE) / (1 - PRESENCE) * 1.6);
        const crest = (hLo + (hHi - hLo) * lump) * (0.35 + 0.65 * endTaper) * (0.55 + 0.45 * presence);
        const half = halfFoot * (0.8 + 0.4 * lump) * (0.6 + 0.4 * endTaper);
        // the crest leans a little off the line (wind-cut; a wall stands straight), the foot sinks under the ground's slope
        const offset = wall ? 0 : (lump - 0.5) * 0.5 * lean;
        sections.push({ lx: x + nx * half, lz: z + nz * half, rx: x - nx * half, rz: z - nz * half,
          cx: x + nx * offset, cz: z + nz * offset, foot: g - (wall ? 0.35 : 0.7), crest: g + crest, nx, nz });
      }
      const base = col(pal.l0 * 0.78, tint), mid = col((pal.l0 + pal.l1) * 0.5 * 0.86, tint), top = col(pal.l1 * 0.9, tint);
      for (let k = 0; k + 1 < sections.length; k++) {
        const a = sections[k], b = sections[k + 1];
        if (!a || !b) continue;
        for (const side of [1, -1]) {
          // the side face: foot to crest, its normal across the line and up (lit as a bush mass, not a wall)
          const ax = side > 0 ? a.lx : a.rx, az = side > 0 ? a.lz : a.rz, bx = side > 0 ? b.lx : b.rx, bz = side > 0 ? b.lz : b.rz;
          const nxa = a.nx * side * 0.78, nza = a.nz * side * 0.78, nxb = b.nx * side * 0.78, nzb = b.nz * side * 0.78;
          const up = 0.62;
          // two triangles: (a foot, b foot, b crest), (a foot, b crest, a crest)
          pushV(ax, a.foot, az, nxa, up, nza, base); pushV(bx, b.foot, bz, nxb, up, nzb, base); pushV(b.cx, b.crest, b.cz, nxb * 0.4, 0.92, nzb * 0.4, top);
          pushV(ax, a.foot, az, nxa, up, nza, base); pushV(b.cx, b.crest, b.cz, nxb * 0.4, 0.92, nzb * 0.4, top); pushV(a.cx, a.crest, a.cz, nxa * 0.4, 0.92, nza * 0.4, top);
          void mid;
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
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide });
  // (2026-10-08: the full sky, as the battlefield's shrubs take it; the 0.85 it authored never applied, materialEnvIntensity.ts)
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'border-hedgerows';
  mesh.userData.borderHedgerows = { triangles: positions.length / 9 };
  mesh.userData.aoExclude = true;
  mesh.castShadow = true;
  setShadowCasterCascades(mesh, SHADOW_CASTER_LAST_CASCADE);
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = false;
  return mesh;
}
