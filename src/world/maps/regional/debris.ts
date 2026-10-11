// src/world/maps/regional/debris.ts — the house kits' debris pieces (the facades lane, 2026-10-07; docs/DESTRUCTION.md
// §16.3 Writers, destructionKit.ts StructureDamageKit.piece): one small mesh per (bucket, shape, variant), built once per
// world, that the presentation instances for every piece a stage throws. A piece is unit-sized (inside the cube
// [-0.5, 0.5]^3) and the instance's scale gives it its size: a brick 0.24 x 0.07 x 0.115, a block of the wall's own
// course, a splinter, a curved plain tile. Each variant is its own irregular cut of the shape (chipped corners, a
// ragged outline), from the piece's own stream, so a pile of the same shape never repeats. Normals are flat per face;
// uvs a box projection, so the bucket's texture reads on every side; a white colour attribute for the vertex-coloured
// buckets (the instance tint carries the building's weather).
import * as THREE from 'three';
import type { DebrisShape } from '../../destructionKit.ts';

type P3 = [number, number, number];

class PieceBuilder {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly uv: number[] = [];
  /** a convex planar polygon, its corners counter-clockwise seen from outside */
  poly(pts: P3[]): void {
    if (pts.length < 3) return;
    const [a, b, c] = pts;
    let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    const uvOf = (p: P3): [number, number] => (ax >= ay && ax >= az ? [p[2] + 0.5, p[1] + 0.5] : ay >= az ? [p[0] + 0.5, p[2] + 0.5] : [p[0] + 0.5, p[1] + 0.5]);
    for (let i = 1; i + 1 < pts.length; i++) {
      for (const p of [pts[0], pts[i], pts[i + 1]]) {
        this.pos.push(p[0], p[1], p[2]);
        this.nor.push(nx, ny, nz);
        const [u, v] = uvOf(p);
        this.uv.push(u * 0.5, v * 0.5);
      }
    }
  }
  /** a hexahedron from its eight corners (x−y−z−, x+y−z−, x+y+z−, x−y+z−, then the same at z+) */
  hexa(c: P3[]): void {
    const f = (i: number[]) => this.poly(i.map((k) => c[k]));
    f([0, 3, 2, 1]); f([4, 5, 6, 7]); f([0, 1, 5, 4]); f([3, 7, 6, 2]); f([0, 4, 7, 3]); f([1, 2, 6, 5]);
  }
  /** a prism from a convex outline (x, z) counter-clockwise from above, between y0 and y1 */
  prism(outline: Array<[number, number]>, y0: number, y1: number): void {
    const n = outline.length;
    this.poly(outline.map(([x, z]) => [x, y1, z] as P3).reverse());
    this.poly(outline.map(([x, z]) => [x, y0, z] as P3));
    for (let i = 0; i < n; i++) {
      const [x0, z0] = outline[i], [x1, z1] = outline[(i + 1) % n];
      this.poly([[x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0]]);
    }
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(this.pos.length).fill(1), 3));
    g.computeBoundingSphere();
    return g;
  }
}

/** A box's eight corners, each pulled in by up to `chip` (an irregular, chipped cut of it). */
function chippedBox(rng: () => number, chip: number): P3[] {
  const c: P3[] = [];
  for (const z of [-0.5, 0.5]) for (const [x, y] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]] as Array<[number, number]>) {
    c.push([x * (1 - rng() * chip), y * (1 - rng() * chip), z * (1 - rng() * chip)]);
  }
  return c;
}

/** A ragged convex outline: `n` corners round a circle of radius 0.5, each at its own radius. */
function raggedOutline(rng: () => number, n: number, jag: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const phase = rng() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2, r = 0.5 * (1 - rng() * jag);
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

/** An irregular stone: an octahedron's eight faces over six jittered tips. */
function lump(b: PieceBuilder, rng: () => number, jag: number): void {
  const tip = (x: number, y: number, z: number): P3 => [x * (1 - rng() * jag), y * (1 - rng() * jag), z * (1 - rng() * jag)];
  const px = tip(0.5, 0, 0), nx = tip(-0.5, 0, 0), py = tip(0, 0.5, 0), ny = tip(0, -0.5, 0), pz = tip(0, 0, 0.5), nz = tip(0, 0, -0.5);
  // the eight faces (counter-clockwise from outside)
  b.poly([px, py, pz]); b.poly([py, nx, pz]); b.poly([nx, ny, pz]); b.poly([ny, px, pz]);
  b.poly([py, px, nz]); b.poly([nx, py, nz]); b.poly([ny, nx, nz]); b.poly([px, ny, nz]);
}

/** One debris piece's mesh (unit-sized; the instance scales it). */
export function debrisPiece(shape: DebrisShape, variant: number, rng: () => number): THREE.BufferGeometry {
  const b = new PieceBuilder();
  // each variant its own cut: draw the stream forward by the variant
  for (let i = 0; i < variant * 7; i++) rng();
  switch (shape) {
    case 'brick': case 'block': case 'slate': b.hexa(chippedBox(rng, shape === 'brick' ? 0.12 : shape === 'slate' ? 0.08 : 0.2)); break;
    case 'chunk': b.hexa(chippedBox(rng, 0.45)); break;
    case 'stone': case 'clod': lump(b, rng, shape === 'clod' ? 0.45 : 0.3); break;
    case 'plate': case 'sheet': b.prism(raggedOutline(rng, 6, shape === 'plate' ? 0.4 : 0.15), -0.5, 0.5); break;
    case 'shard': {
      const o = raggedOutline(rng, 3, 0.3);
      b.prism(o, -0.5, 0.5);
      break;
    }
    case 'splinter': {
      // a long sliver tapering to points at both ends (along y)
      const w = 0.5, t = 0.5;
      const mid: P3[] = [[-w, 0, -t], [w, 0, -t], [w, 0, t], [-w, 0, t]];
      const top: P3 = [(rng() - 0.5) * 0.4, 0.5, (rng() - 0.5) * 0.4], bot: P3 = [(rng() - 0.5) * 0.4, -0.5, (rng() - 0.5) * 0.4];
      for (let i = 0; i < 4; i++) {
        const a = mid[i], c = mid[(i + 1) % 4];
        b.poly([a, c, top]);
        b.poly([c, a, bot]);
      }
      break;
    }
    case 'beam': {
      // a timber along x, its four long faces, each end broken to a splintered point (a pyramid off the end's face)
      const y = 0.5, z = 0.5;
      b.poly([[-0.5, -y, z], [0.5, -y, z], [0.5, y, z], [-0.5, y, z]]);
      b.poly([[0.5, -y, -z], [-0.5, -y, -z], [-0.5, y, -z], [0.5, y, -z]]);
      b.poly([[-0.5, y, z], [0.5, y, z], [0.5, y, -z], [-0.5, y, -z]]);
      b.poly([[-0.5, -y, -z], [0.5, -y, -z], [0.5, -y, z], [-0.5, -y, z]]);
      for (const end of [-1, 1]) {
        const x = end * 0.5, jut: P3 = [end * (0.5 + 0.1 + 0.25 * rng()), (rng() - 0.5) * 0.5, (rng() - 0.5) * 0.5];
        const ring: P3[] = [[x, -y, -z], [x, y, -z], [x, y, z], [x, -y, z]];
        for (let i = 0; i < 4; i++) {
          const a = ring[i], c = ring[(i + 1) % 4];
          b.poly(end > 0 ? [a, c, jut] : [c, a, jut]);
        }
      }
      break;
    }
    case 'tile': {
      // a plain tile's gentle camber across it (x), flat along it (z), its tail rounded (four facets)
      const seg = 4, t = 0.5;
      for (let i = 0; i < seg; i++) {
        const x0 = -0.5 + i / seg, x1 = -0.5 + (i + 1) / seg;
        const y0 = Math.cos(x0 * Math.PI) * 0.3 - 0.15, y1 = Math.cos(x1 * Math.PI) * 0.3 - 0.15;
        b.poly([[x0, y0 + t * 0.4, -0.5], [x0, y0 + t * 0.4, 0.5], [x1, y1 + t * 0.4, 0.5], [x1, y1 + t * 0.4, -0.5]]);
        b.poly([[x1, y1 - t * 0.4, -0.5], [x1, y1 - t * 0.4, 0.5], [x0, y0 - t * 0.4, 0.5], [x0, y0 - t * 0.4, -0.5]]);
      }
      break;
    }
    case 'straw': case 'rebar': {
      const sides = shape === 'straw' ? 6 : 5;
      const outline: Array<[number, number]> = [];
      for (let i = 0; i < sides; i++) outline.push([Math.cos((i / sides) * Math.PI * 2) * 0.5, Math.sin((i / sides) * Math.PI * 2) * 0.5]);
      b.prism(outline, -0.5, 0.5);
      break;
    }
  }
  return b.geometry();
}
