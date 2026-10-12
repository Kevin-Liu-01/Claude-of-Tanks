// src/world/maps/lightKitWriter.ts — the light kits' shared writer (the destructible-kits lane, round 5, 2026-10-11): the
// noise, colour, weathering, tile mapping and primitives the member-by-member kits are written with (campKit.ts, the
// camp kits since round 4; townKit.ts, the town and works kits), the part writer that paints and names each part's piece
// (legacyWreck.ts reads the pieces), the wall cladding, windows and doors. Moved here verbatim from campKit.ts.
import * as THREE from 'three';
import { markWorldAperture } from '../worldNightEmissionGeometry.ts';

export type Rng = () => number;
export type V3 = [number, number, number];
/** A part's piece in the settled wreck: what it does when it falls ('kind') and which members fall with it ('name'). */
export type Piece = `${'ground' | 'post' | 'leaf' | 'sheet' | 'block' | 'small'}:${string}`;

// ------------------------------------------------------------------------------------------------ noise and colour

function hash3(x: number, y: number, z: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647) ^ Math.imul(s | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, y: number, z: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number): number => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number): number => hash3(xi + dx, yi + dy, zi + dz, s);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const _color = new THREE.Color();
/** An authored sRGB hex in the renderer's linear working space (THREE.Color.set converts). */
function lin(hex: number): V3 { _color.set(hex); return [_color.r, _color.g, _color.b]; }
const mix = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** How a part's vertex colours weather (amounts 0..1), in the kit's own frame. */
export interface Weather {
  /** the damp, dirty foot: darker toward the ground, to half a metre or so */
  foot?: number;
  /** rain runs and grime down an upright face */
  runs?: number;
  /** rust in patches, and streaks down an upright face (steel) */
  rust?: number;
  /** dust on what faces the sky */
  dust?: number;
  /** sun-bleached high up (canvas, paint) */
  bleach?: number;
  /** a render's or a block wall's broad patches, lighter and darker (round 5) */
  mottle?: number;
}
const RUST = lin(0x6b3f26), GRIME = lin(0x1c1915), DUST = lin(0x8d877a);

// ------------------------------------------------------------------------------------------------ surfaces

/**
 * How a part takes its material's tile (structureDetailTile.ts): 'sheet' the tile at the kit's 0.55 uv/m by the face's
 * plane (the steel's ribs upright on a wall, along z on a face toward the sky); 'roof' the ribs along x on a face toward
 * the sky (down a roof pitched along x); 'hip' down each face of a hipped roof; 'flat' one plain texel of the steel's
 * valley (a frame, a door, a plate, a board: no ribs); 'band' the ribs level across an upright face (a roller shutter's
 * slats). Mapped from the part's placed vertices, so neighbouring panels' ribs and seams run on.
 */
type UvMode = 'sheet' | 'roof' | 'hip' | 'flat' | 'band';
const UV_PER_M = 0.55;
const FLAT_TEXEL: [number, number] = [15.5 / 256, 64.5 / 256];

function mapUv(geo: THREE.BufferGeometry, mode: UvMode): void {
  const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    let u = FLAT_TEXEL[0], v = FLAT_TEXEL[1];
    if (mode !== 'flat') {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
      if (ay >= ax && ay >= az) {
        const alongX = mode === 'roof' || (mode === 'hip' && ax >= az);
        u = (alongX ? z : x) * UV_PER_M; v = (alongX ? x : z) * UV_PER_M;
      } else if (mode === 'band') { u = y * UV_PER_M; v = (ax >= az ? z : x) * UV_PER_M; }
      else if (ax >= az) { u = z * UV_PER_M; v = y * UV_PER_M; }
      else { u = x * UV_PER_M; v = y * UV_PER_M; }
    }
    uv[i * 2] = u; uv[i * 2 + 1] = v;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** A box w x h x d about its centre; `s` > 0 subdivides it about every `s` metres (its weathering's resolution). */
export function bx(w: number, h: number, d: number, s = 0): THREE.BufferGeometry {
  const n = (L: number): number => (s > 0 ? Math.max(1, Math.round(L / s)) : 1);
  return new THREE.BoxGeometry(w, h, d, n(w), n(h), n(d));
}
/** An upright cylinder (y) about its centre. */
export function cyl(rTop: number, rBottom: number, h: number, sides: number): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(rTop, rBottom, h, sides, 1);
}
/** A prism: the polygon (x, y; counter-clockwise) extruded along z from z0 to z1. */
export function prism(poly: readonly (readonly [number, number])[], z0: number, z1: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(poly[0][0], poly[0][1]);
  for (let i = 1; i < poly.length; i++) shape.lineTo(poly[i][0], poly[i][1]);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: z1 - z0, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, z0);
  const flat = g.index ? g.toNonIndexed() : g;
  if (flat !== g) g.dispose();
  flat.clearGroups();
  flat.computeVertexNormals();
  return flat;
}
/** A bar from a to b, its section w across (level) by h (in the upright plane through it). */
export function bar(a: V3, b: V3, w: number, h: number): THREE.BufferGeometry {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const g = bx(w, h, d.length());
  const zAxis = d.clone().normalize();
  const side = Math.abs(zAxis.y) > 0.999 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0).cross(zAxis).normalize();
  const up = zAxis.clone().cross(side).normalize();
  g.applyMatrix4(new THREE.Matrix4().makeBasis(side, up, zAxis));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return g;
}
/** A glass pane (its outward face lit at night): `w` across the opening, `h` high, facing `outward` (an axis). */
export function pane(w: number, h: number, outward: V3): THREE.BufferGeometry {
  const alongX = Math.abs(outward[0]) > 0.5;
  return markWorldAperture(bx(alongX ? 0.012 : w, h, alongX ? w : 0.012), outward);
}

// ------------------------------------------------------------------------------------------------ the writer

/**
 * How a part is painted: its tile mapping, its weathering, its colour jitter; `inner` for a part the shell hides (a
 * cabin's dark room, a tent's poles): drawn after the shell, so the depth test throws its fragments out rather than
 * shading them under the cladding.
 */
interface Paint { uv?: UvMode; w?: Weather; jitter?: number; inner?: boolean }

/** One kit's parts: each mapped, painted, weathered and given its piece, then certified and merged by the context. */
export class Kit {
  private readonly shell: THREE.BufferGeometry[] = [];
  private readonly inside: THREE.BufferGeometry[] = [];
  /** The parts in draw order: the shell first, then what it hides. */
  get out(): THREE.BufferGeometry[] { return [...this.shell, ...this.inside]; }
  readonly rng: Rng;
  readonly salt: number;
  constructor(rng: Rng, salt: number) { this.rng = rng; this.salt = salt; }

  add(geo: THREE.BufferGeometry, hex: number, piece: Piece, { uv = 'flat', w = {}, jitter = 0.04, inner = false }: Paint = {}): THREE.BufferGeometry {
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    mapUv(geo, uv);
    const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal');
    const base = lin(hex), s = this.salt;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), ny = nor.getY(i);
      const j = 1 + (this.rng() - 0.5) * 2 * jitter;
      let c: V3 = [base[0] * j, base[1] * j, base[2] * j];
      if (w.foot) {
        const top = 0.3 + vnoise(x * 1.3, 0.5, z * 1.3, s + 3) * 0.32;
        c = mix(c, mix(c, GRIME, 0.6), (1 - smooth(0.0, top, y)) * w.foot);
      }
      if (w.runs && Math.abs(ny) < 0.5) {
        const run = vnoise((x + z) * 2.4, y * 0.45, 0.5, s + 7);
        c = mix(c, GRIME, smooth(0.58, 0.9, run) * 0.3 * w.runs);
      }
      if (w.rust) {
        const patch = smooth(0.6, 0.85, vnoise(x * 1.9, y * 1.9, z * 1.9, s + 11) * 0.7 + vnoise(x * 4.1, y * 4.1, z * 4.1, s + 13) * 0.3);
        const streak = Math.abs(ny) < 0.5 ? smooth(0.64, 0.93, vnoise((x + z) * 3.3, y * 0.4, 1.5, s + 17)) : 0;
        c = mix(c, RUST, Math.min(1, patch * 0.5 + streak * 0.35) * w.rust);
      }
      if (w.dust && ny > 0.5) c = mix(c, DUST, (ny - 0.5) * 2 * 0.35 * w.dust);
      if (w.mottle) {
        const m = vnoise(x * 0.9, y * 0.9, z * 0.9, s + 23) * 0.65 + vnoise(x * 2.6, y * 2.6, z * 2.6, s + 29) * 0.35 - 0.5;
        c = [c[0] * (1 + m * 0.22 * w.mottle), c[1] * (1 + m * 0.22 * w.mottle), c[2] * (1 + m * 0.2 * w.mottle)];
      }
      if (w.bleach) {
        const g = (c[0] + c[1] + c[2]) / 3 * 1.18;
        c = mix(c, [g, g * 0.985, g * 0.95], Math.min(1, Math.max(0, (y - 0.6) / 2.4)) * 0.3 * w.bleach);
      }
      col[i * 3] = Math.min(1, c[0]); col[i * 3 + 1] = Math.min(1, c[1]); col[i * 3 + 2] = Math.min(1, c[2]);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.userData.piece = piece;
    (inner ? this.inside : this.shell).push(geo);
    return geo;
  }
}

/** An opening in a wall: [a0, a1] along it, [y0, y1] up it. */
export interface Opening { a0: number; a1: number; y0: number; y1: number }

/**
 * Clad one wall: `axis` the wall's normal axis, `face` its outer plane's coordinate (the panels lie inside it, `t`
 * thick), `top(a)` the wall's head along it. The face is cut at the openings' edges into columns; each column runs from
 * `y0` to the head less its openings. Panels are subdivided about every `s` metres for their weathering.
 */
export function cladWall(k: Kit, piece: Piece, hex: number, w: Weather, axis: 'x' | 'z', face: number, t: number,
  a0: number, a1: number, y0: number, top: (a: number) => number, holes: readonly Opening[], s = 0.45, uv: UvMode = 'sheet'): void {
  const plane = face + (face > 0 ? -1 : 1) * t / 2;
  const cuts = [...new Set([a0, a1, ...holes.flatMap((h) => [h.a0, h.a1])])].filter((a) => a >= a0 && a <= a1).sort((p, q) => p - q);
  for (let c = 0; c + 1 < cuts.length; c++) {
    const c0 = cuts[c], c1 = cuts[c + 1], cm = (c0 + c1) / 2;
    if (c1 - c0 < 1e-3) continue;
    let y = y0;
    const spans: [number, number | null][] = [];
    for (const h of holes.filter((o) => cm > o.a0 && cm < o.a1).sort((p, q) => p.y0 - q.y0)) {
      if (h.y0 > y + 1e-3) spans.push([y, h.y0]);
      y = h.y1;
    }
    spans.push([y, null]);
    for (const [s0, s1] of spans) {
      if (s1 === null && Math.abs(top(c0) - top(c1)) > 1e-3) {
        // under a pitched head: trapezoids, in strips for its weathering (a z wall's run is x; an x wall's is z)
        const strips = Math.max(1, Math.round((c1 - c0) / s));
        for (let i = 0; i < strips; i++) {
          const u0 = c0 + (c1 - c0) * i / strips, u1 = c0 + (c1 - c0) * (i + 1) / strips;
          // (an x wall: the prism's x is the run along z and its z the wall's normal, turned a quarter about y — rotateY(-pi/2)
          // takes x to z and z to -x, so it is extruded about -plane)
          const poly: [number, number][] = [[u0, s0], [u1, s0], [u1, top(u1)], [u0, top(u0)]];
          const g = axis === 'x' ? prism(poly, -plane - t / 2, -plane + t / 2).rotateY(-Math.PI / 2) : prism(poly, plane - t / 2, plane + t / 2);
          k.add(g, hex, piece, { uv, w });
        }
        continue;
      }
      const yTop = s1 ?? top(c0);
      if (yTop - s0 < 1e-3) continue;
      const g = axis === 'x'
        ? bx(t, yTop - s0, c1 - c0, s).translate(plane, (s0 + yTop) / 2, cm)
        : bx(c1 - c0, yTop - s0, t, s).translate(cm, (s0 + yTop) / 2, plane);
      k.add(g, hex, piece, { uv, w });
    }
  }
}

/**
 * A window in a wall: its casing proud of the face (head, jambs) and a deeper sill, its mullions and the pane set back
 * on the room behind. `axis` the wall's normal axis, `face` the outer plane, [a0, a1] x [y0, y1] the opening, `back`
 * the reveal's depth (the room's face behind).
 */
export function windowIn(k: Kit, piece: Piece, frameHex: number, glassHex: number, w: Weather, axis: 'x' | 'z', face: number,
  o: Opening, lights: number, back: number): void {
  const out = face > 0 ? 1 : -1, cs = 0.07, proud = 0.03;
  const at = (a: number, y: number, n: number, wa: number, h: number, dn: number): THREE.BufferGeometry => (axis === 'x'
    ? bx(dn, h, wa).translate(n, y, a) : bx(wa, h, dn).translate(a, y, n));
  const { a0, a1, y0, y1 } = o, am = (a0 + a1) / 2, ym = (y0 + y1) / 2, nf = face + out * (proud / 2 - 0.005);
  k.add(at(am, y1 + cs / 2, nf, a1 - a0 + 2 * cs, cs, proud + 0.01), frameHex, piece, { w });
  k.add(at(am, y0 - 0.025, face + out * 0.035, a1 - a0 + 2 * cs + 0.06, 0.05, 0.08), frameHex, piece, { w });
  for (const a of [a0 - cs / 2, a1 + cs / 2]) k.add(at(a, ym, nf, cs, y1 - y0, proud + 0.01), frameHex, piece, { w });
  for (let i = 1; i < lights; i++) {
    const a = a0 + (a1 - a0) * i / lights;
    k.add(at(a, ym, face - out * (back / 2 - 0.002), 0.045, y1 - y0, back + 0.004), frameHex, piece, {});
  }
  // (a pane a light, between its mullions)
  const n = face - out * (back - 0.004), lw = (a1 - a0) / lights;
  for (let i = 0; i < lights; i++) {
    const g = pane(lights > 1 ? lw - 0.03 : lw, y1 - y0, axis === 'x' ? [out, 0, 0] : [0, 0, out]), ac = a0 + lw * (i + 0.5);
    k.add(axis === 'x' ? g.translate(n, ym, ac) : g.translate(ac, ym, n), glassHex, piece, { jitter: 0.015 });
  }
}

/** The caster's solids as one plain geometry (position, normal, a zero uv): no colours, no stream. */
export function solid(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  const pos: number[] = [], nor: number[] = [];
  for (const p of flat) {
    for (const v of p.getAttribute('position').array as Float32Array) pos.push(v);
    for (const v of p.getAttribute('normal').array as Float32Array) nor.push(v);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  for (const p of new Set([...parts, ...flat])) p.dispose();
  return g;
}

// ------------------------------------------------------------------------------------------------ shared shapes

/** A box with its own segment counts along each axis. */
export function bxn(w: number, h: number, d: number, nw: number, nh: number, nd: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d, Math.max(1, nw), Math.max(1, nh), Math.max(1, nd));
}
/** An open ring (a hoop): radius r, height h, about the y axis. */
export function hoop(r: number, h: number, sides: number): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(r, r, h, sides, 1, true);
}
/** A hipped roof: four faces from a w x w eave square (its base at y 0) up h to a point, lit face by face. */
export function hipRoof(w: number, h: number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(w / Math.SQRT2, h, 4, 1);
  g.rotateY(Math.PI / 4);
  g.translate(0, h / 2, 0);
  const flat = g.toNonIndexed();
  g.dispose();
  flat.computeVertexNormals();
  return flat;
}
/**
 * A hipped roof as four thin faces (each `t` thick under its outer plane) from a w x w eave square (its eaves at y 0) up
 * h to a point: a shell open beneath, so a broken piece of it is a piece of roof, not a solid wedge.
 */
export function hipShell(w: number, h: number, t: number): THREE.BufferGeometry[] {
  const a = w / 2, L = Math.hypot(a, h), faces: THREE.BufferGeometry[] = [];
  const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, h / L, -a / L), new THREE.Vector3(0, a / L, h / L));
  for (let q = 0; q < 4; q++) {
    faces.push(prism([[-a, 0], [a, 0], [0, L]], -t, 0).applyMatrix4(basis).translate(0, 0, a).rotateY(q * Math.PI / 2));
  }
  return faces;
}
/** Moves every vertex by `f` (in the part's own frame) and relights it (canvas billowing, sagging between its frame). */
export function displace(g: THREE.BufferGeometry, f: (x: number, y: number, z: number) => V3): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const d = f(pos.getX(i), pos.getY(i), pos.getZ(i));
    pos.setXYZ(i, pos.getX(i) + d[0], pos.getY(i) + d[1], pos.getZ(i) + d[2]);
  }
  g.computeVertexNormals();
  return g;
}

/** A door in a wall: its frame proud of the face, the leaf a little in with its vision panel, kick plate, handle, hinges. */
export function doorIn(k: Kit, piece: Piece, axis: 'x' | 'z', face: number, o: Opening, w: Weather, leafW: Weather,
  pal: { frame: number; door: number; glass: number; kick: number; handle: number; ink: number }): void {
  const out = face > 0 ? 1 : -1, cs = 0.07;
  const at = (a: number, y: number, n: number, wa: number, h: number, dn: number): THREE.BufferGeometry => (axis === 'x'
    ? bx(dn, h, wa).translate(n, y, a) : bx(wa, h, dn).translate(a, y, n));
  const { a0, a1, y0, y1 } = o, am = (a0 + a1) / 2, ym = (y0 + y1) / 2, nf = face + out * 0.01, leaf = face - out * 0.03;
  k.add(at(am, y1 + cs / 2, nf, a1 - a0 + 2 * cs, cs, 0.04), pal.frame, piece, { w });
  for (const a of [a0 - cs / 2, a1 + cs / 2]) k.add(at(a, ym, nf, cs, y1 - y0, 0.04), pal.frame, piece, { w });
  k.add(at(am, ym, leaf, a1 - a0, y1 - y0, 0.045), pal.door, piece, { w: leafW });
  const g = pane(0.3, 0.36, axis === 'x' ? [out, 0, 0] : [0, 0, out]), pn = leaf + out * 0.024;
  k.add(axis === 'x' ? g.translate(pn, y1 - 0.45, am) : g.translate(am, y1 - 0.45, pn), pal.glass, piece, { jitter: 0.015 });
  k.add(at(am, y0 + 0.14, leaf + out * 0.026, a1 - a0 - 0.08, 0.24, 0.008), pal.kick, piece, { w: { foot: 1, rust: 0.5 } });
  k.add(at(a1 - 0.14, y0 + 0.98, leaf + out * 0.042, 0.14, 0.03, 0.04), pal.handle, piece);
  k.add(at(a1 - 0.08, y0 + 0.98, leaf + out * 0.035, 0.05, 0.11, 0.035), pal.ink, piece);
  for (const y of [y0 + 0.32, y1 - 0.32]) k.add(at(a0 + 0.012, y, leaf + out * 0.025, 0.035, 0.13, 0.055), pal.frame, piece);
}
