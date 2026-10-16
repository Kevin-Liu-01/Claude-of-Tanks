// src/game/objectivePosts.ts — the physical post at the heart of a capture zone (props lane A, family #28, 2026-10-15;
// WORKLIST.md #28 mode:objective-markers: "Replace the bare core pillar with a physical objective post per map, coloured
// by its owner through a pennant or flag rather than a translucent material: a sandbagged field-telephone post with a
// survey pole, the sector pennant and a numbered sector board on the WWII maps; a comms mast on a guyed tripod with a
// battery box and a camouflage net on the modern maps; a stone cairn with a flagpole on the desert maps; a survey beacon
// on a tripod with a solar panel on mars and moon").
//
// The ring, the area disc, the progress arc, the badge and the light column stay the UI layer
// (matchModeWorldPresentation.ts); the post is a lit object on the ground at the zone's centre: its body one geometry
// in vertex colour, its pennant or flag one geometry the presentation tints by the zone's owner. Built in the post's own
// frame (its foot at y 0, a little sunk), from a fixed seed: no stream is read. Boot-light: no world module imported.
import * as THREE from 'three';

export type ObjectivePostForm = 'field' | 'mast' | 'cairn' | 'beacon';

/** The post by the map's place and year (maps/periodClutterKit.ts MAP_SETTING_YEAR, mirrored: this module boots light). */
const FORM_OF: Readonly<Record<string, ObjectivePostForm>> = Object.freeze({
  // the Second World War's maps (1937-45): a field-telephone post in its sandbags
  blackglass: 'field', fjord: 'field', longleaf: 'field', verdant: 'field', autumn: 'field', monsoon: 'field',
  polders: 'field', reservoir: 'field', alpine: 'field', foundry: 'field', winter: 'field',
  // the deserts and the canyon country: a stone cairn with a flagpole
  desert: 'cairn', oasis: 'cairn', badlands: 'cairn', titan_gorge: 'cairn', skybridge: 'cairn',
  // the airless and the far: a survey beacon
  moon: 'beacon', mars: 'beacon',
});

/** A map's objective post (the comms mast on every Cold War and modern map not named). */
export function objectivePostFormOf(mapId: string | null | undefined): ObjectivePostForm {
  return (mapId && FORM_OF[mapId]) || 'mast';
}

export type V3 = readonly [number, number, number];
export type Rgb = readonly [number, number, number];
export const srgb = (hex: number): Rgb => {
  const l = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return [l(((hex >> 16) & 255) / 255), l(((hex >> 8) & 255) / 255), l((hex & 255) / 255)];
};
const BAG = srgb(0x8a7a58), BAG_DARK = srgb(0x5e5240), WOOD = srgb(0x6e5438), OLIVE = srgb(0x4a5034), OLIVE_DARK = srgb(0x2e3220);
const BAND_RED = srgb(0xb0322a), BAND_WHITE = srgb(0xd8d4c8), BOARD = srgb(0x3e4a2e), BOARD_EDGE = srgb(0xc8c4b0);
const STEEL = srgb(0x7a7e7a), STEEL_DARK = srgb(0x3a3c3a), NET = srgb(0x3c4428), NET_LIGHT = srgb(0x5a6038);
const STONE = srgb(0xa89070), STONE_DARK = srgb(0x7a6650), PANEL = srgb(0x1e2a3e), FRAME = srgb(0xb8bcc0), LAMP = srgb(0xe8c050);

/** A fixed hash (0..1) of three integers. */
export function hash(a: number, b: number, c: number): number {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0; h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Flat-shaded triangles in vertex colour, each wound to face its `out` (modeObjects.ts builds with it too). */
export class Writer {
  readonly p: number[] = []; readonly n: number[] = []; readonly c: number[] = [];
  tri(a: V3, b: V3, c: V3, out: V3, col: Rgb): void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    if (nx * out[0] + ny * out[1] + nz * out[2] < 0) { [b, c] = [c, b]; nx = -nx; ny = -ny; nz = -nz; }
    const l = Math.hypot(nx, ny, nz) || 1;
    for (const q of [a, b, c]) { this.p.push(q[0], q[1], q[2]); this.n.push(nx / l, ny / l, nz / l); this.c.push(col[0], col[1], col[2]); }
  }
  quad(a: V3, b: V3, c: V3, d: V3, out: V3, col: Rgb): void { this.tri(a, b, c, out, col); this.tri(a, c, d, out, col); }
  /** A box `[hx, hy, hz]` half extents about `o`, turned `yaw` about y; `top`/`side` colours. */
  box(o: V3, h: V3, yaw: number, side: Rgb, top: Rgb = side): void {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const at = (x: number, y: number, z: number): V3 => [o[0] + x * cy + z * sy, o[1] + y, o[2] - x * sy + z * cy];
    const [X, Y, Z] = h;
    const out = (x: number, y: number, z: number): V3 => [x * cy + z * sy, y, -x * sy + z * cy];
    this.quad(at(-X, Y, -Z), at(X, Y, -Z), at(X, Y, Z), at(-X, Y, Z), [0, 1, 0], top);
    this.quad(at(-X, -Y, Z), at(X, -Y, Z), at(X, Y, Z), at(-X, Y, Z), out(0, 0, 1), side);
    this.quad(at(-X, -Y, -Z), at(X, -Y, -Z), at(X, Y, -Z), at(-X, Y, -Z), out(0, 0, -1), side);
    this.quad(at(X, -Y, -Z), at(X, -Y, Z), at(X, Y, Z), at(X, Y, -Z), out(1, 0, 0), side);
    this.quad(at(-X, -Y, -Z), at(-X, -Y, Z), at(-X, Y, Z), at(-X, Y, -Z), out(-1, 0, 0), side);
  }
  /** A round member from `a` to `b`, radius `r0` at a and `r1` at b, `sides` around; `col(t)` along it (0 at a). */
  rod(a: V3, b: V3, r0: number, r1: number, sides: number, col: (t: number) => Rgb, rings = 1): void {
    const ax = b[0] - a[0], ay = b[1] - a[1], az = b[2] - a[2], len = Math.hypot(ax, ay, az) || 1;
    const d: V3 = [ax / len, ay / len, az / len];
    const ref: V3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let ux = d[1] * ref[2] - d[2] * ref[1], uy = d[2] * ref[0] - d[0] * ref[2], uz = d[0] * ref[1] - d[1] * ref[0];
    const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
    const vx = d[1] * uz - d[2] * uy, vy = d[2] * ux - d[0] * uz, vz = d[0] * uy - d[1] * ux;
    const ring = (t: number, r: number) => Array.from({ length: sides }, (_, k) => {
      const th = (k / sides) * Math.PI * 2, cx = Math.cos(th) * r, sx = Math.sin(th) * r;
      return [a[0] + ax * t + ux * cx + vx * sx, a[1] + ay * t + uy * cx + vy * sx, a[2] + az * t + uz * cx + vz * sx] as V3;
    });
    for (let j = 0; j < rings; j++) {
      const t0 = j / rings, t1 = (j + 1) / rings, p0 = ring(t0, r0 + (r1 - r0) * t0), p1 = ring(t1, r0 + (r1 - r0) * t1), c = col((t0 + t1) / 2);
      for (let k = 0; k < sides; k++) {
        const k1 = (k + 1) % sides, th = ((k + 0.5) / sides) * Math.PI * 2;
        const out: V3 = [ux * Math.cos(th) + vx * Math.sin(th), uy * Math.cos(th) + vy * Math.sin(th), uz * Math.cos(th) + vz * Math.sin(th)];
        this.quad(p0[k], p0[k1], p1[k1], p1[k], out, c);
      }
    }
    const capR = ring(1, r1), top: V3 = [b[0], b[1], b[2]];
    for (let k = 0; k < sides; k++) this.tri(capR[k], capR[(k + 1) % sides], top, d, col(1));
  }
  /** A lumpy body (an octahedron's faces subdivided once, pushed in and out by `seed`), half extents `h` about `o`. */
  lump(o: V3, h: V3, seed: number, col: Rgb, dark: Rgb): void {
    const dirs: V3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    const faces = [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]];
    const at = (v: V3, salt: number): V3 => {
      const l = Math.hypot(v[0], v[1], v[2]) || 1, k = 0.82 + 0.3 * hash(Math.round(v[0] * 9) + salt, Math.round(v[1] * 9), Math.round(v[2] * 9) + seed);
      return [o[0] + (v[0] / l) * h[0] * k, o[1] + (v[1] / l) * h[1] * k, o[2] + (v[2] / l) * h[2] * k];
    };
    for (const [i, j, k] of faces) {
      const A = dirs[i], B = dirs[j], Cc = dirs[k];
      const ab: V3 = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2], bc: V3 = [(B[0] + Cc[0]) / 2, (B[1] + Cc[1]) / 2, (B[2] + Cc[2]) / 2];
      const ca: V3 = [(Cc[0] + A[0]) / 2, (Cc[1] + A[1]) / 2, (Cc[2] + A[2]) / 2];
      for (const [p, q, r] of [[A, ab, ca], [ab, B, bc], [ca, bc, Cc], [ab, bc, ca]] as const) {
        const m: V3 = [(p[0] + q[0] + r[0]) / 3, (p[1] + q[1] + r[1]) / 3, (p[2] + q[2] + r[2]) / 3];
        const shade = m[1] > 0.2 ? col : dark;
        this.tri(at(p, 1), at(q, 1), at(r, 1), m, shade);
      }
    }
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    return g;
  }
}

/** A cloth hung from a pole at `x0` (its hoist), `w` long and `h` deep, its top at `y`; a swallowtail or a plain flag. */
export function cloth(w: Writer, x0: number, y: number, len: number, h: number, swallow: boolean): void {
  const steps = 4, white: Rgb = [1, 1, 1];
  for (let s = 0; s < steps; s++) {
    const t0 = s / steps, t1 = (s + 1) / steps;
    // a slight wave across the fly (z), the cloth narrowing to the swallowtail's notch
    const z = (t: number) => Math.sin(t * Math.PI * 1.5) * 0.08 * t;
    const bot = (t: number) => y - h + (swallow ? h * 0.25 * t : 0);
    w.quad([x0 + len * t0, y, z(t0)], [x0 + len * t1, y, z(t1)], [x0 + len * t1, bot(t1), z(t1)], [x0 + len * t0, bot(t0), z(t0)], [0, 0, 1], white);
    w.quad([x0 + len * t0, y, z(t0) - 0.004], [x0 + len * t1, y, z(t1) - 0.004], [x0 + len * t1, bot(t1), z(t1) - 0.004], [x0 + len * t0, bot(t0), z(t0) - 0.004], [0, 0, -1], white);
  }
  if (swallow) {
    // the notch: the fly's two tails
    const xe = x0 + len, notch = x0 + len * 0.82, ym = y - h * 0.62;
    for (const back of [false, true]) {
      const dz = back ? -0.004 : 0, out: V3 = [0, 0, back ? -1 : 1];
      w.tri([xe, y, 0.12 + dz], [notch, ym, 0.1 + dz], [xe, y - h * 0.75, 0.12 + dz], out, white);
    }
  }
}

/** A sandbag: a filled sack 0.52 x 0.21 x 0.32 m laid along `yaw`, its body a slightly bulged block (its top a pillow
 *  over its sides), its tone its own. */
export function bag(w: Writer, x: number, y: number, z: number, yaw: number, seed: number): void {
  const k = 0.9 + 0.2 * hash(seed, 5, 9), side = [BAG[0] * k, BAG[1] * k, BAG[2] * k] as const;
  w.box([x, y + 0.1, z], [0.26, 0.1, 0.16], yaw, BAG_DARK, side);
  w.box([x, y + 0.2, z], [0.22, 0.025, 0.13], yaw, side, side);
}

/** The field-telephone post: a ring of sandbags open to the rear, the survey pole and its pennant, the sector board,
 *  the telephone on the bags and its cable reel. */
function fieldPost(body: Writer, flag: Writer): number {
  // three courses of bags in a horseshoe 2.4 m across, open toward -z, each course laid over the joints below
  for (let course = 0; course < 3; course++) {
    const n = 12 - course;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + Math.PI * 0.18 + (Math.PI * 1.64 * (i + (course % 2 ? 0.5 : 0))) / 12;
      bag(body, Math.cos(a) * 1.2, course * 0.21 - 0.05, Math.sin(a) * 1.2 + 0.2, -a + Math.PI / 2, 31 * i + course);
    }
  }
  // the survey pole: red and white bands every 0.5 m, 4.5 m, driven in
  body.rod([0, -0.4, 0.2], [0, 4.5, 0.2], 0.045, 0.035, 8, (t) => (Math.floor(t * 9.8) % 2 ? BAND_WHITE : BAND_RED), 10);
  // the sector board on two stakes in front of the bags (its letter is the badge overhead)
  for (const s of [-1, 1]) body.rod([s * 0.42, -0.3, 1.75], [s * 0.42, 1.25, 1.75], 0.03, 0.03, 6, () => WOOD);
  body.box([0, 1.0, 1.72], [0.55, 0.36, 0.025], 0, BOARD, BOARD);
  body.box([0, 1.0, 1.745], [0.5, 0.31, 0.004], 0, BOARD_EDGE, BOARD_EDGE);
  body.box([0, 1.0, 1.75], [0.44, 0.25, 0.004], 0, BOARD, BOARD);
  // the field telephone (its leather case) on the bags and its cable drum on a stake
  body.box([0.62, 0.72, 0.95], [0.14, 0.1, 0.08], 0.4, OLIVE, OLIVE_DARK);
  body.rod([-0.7, 0.32, 0.9], [-0.7, 0.52, 0.9], 0.14, 0.14, 10, () => OLIVE_DARK);
  // the pennant at the pole's head
  cloth(flag, 0.04, 4.45, 1.2, 0.5, true);
  for (let i = 2; i < flag.p.length; i += 3) flag.p[i] += 0.2;
  return 4.5;
}

/** The comms mast: a sectioned mast on a guyed tripod, the guys to their pegs, a battery box under a camouflage net, the
 *  flag at its head. */
function mastPost(body: Writer, flag: Writer): number {
  const H = 7.2;
  // the tripod at its foot and the mast in three sections (a ferrule at each joint)
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    body.rod([Math.cos(a) * 0.9, -0.1, Math.sin(a) * 0.9], [0, 1.4, 0], 0.03, 0.025, 5, () => STEEL_DARK);
  }
  body.rod([0, -0.1, 0], [0, H, 0], 0.055, 0.04, 8, (t) => (t > 0.97 ? STEEL_DARK : STEEL), 3);
  for (const y of [H / 3, (2 * H) / 3]) body.rod([0, y - 0.06, 0], [0, y + 0.06, 0], 0.07, 0.07, 8, () => STEEL_DARK);
  // the guys from two thirds up to three pegs 3.6 m out, each peg driven in
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 3, px = Math.cos(a) * 3.6, pz = Math.sin(a) * 3.6;
    body.rod([0, (2 * H) / 3, 0], [px, 0.05, pz], 0.008, 0.008, 3, () => STEEL_DARK);
    body.rod([px, -0.2, pz], [px, 0.12, pz], 0.025, 0.02, 4, () => STEEL);
  }
  // the battery box at the foot under its camouflage net (a draped low pyramid, its hem pegged)
  body.box([1.3, 0.22, -0.6], [0.32, 0.22, 0.22], 0.3, OLIVE, OLIVE_DARK);
  const ap: V3 = [1.3, 0.75, -0.6];
  const hem = Array.from({ length: 6 }, (_, k) => {
    const a = (k / 6) * Math.PI * 2 + 0.2, r = 0.95 + 0.2 * hash(k, 3, 7);
    return [1.3 + Math.cos(a) * r, 0.02, -0.6 + Math.sin(a) * r] as V3;
  });
  for (let k = 0; k < 6; k++) {
    const a = hem[k], b = hem[(k + 1) % 6], mid: V3 = [(a[0] + b[0]) / 2 - 1.3, 0.4, (a[2] + b[2]) / 2 + 0.6];
    body.tri(ap, a, b, mid, k % 2 ? NET : NET_LIGHT);
  }
  // a whip at the head and the flag below it
  body.rod([0, H, 0], [0, H + 1.6, 0], 0.012, 0.006, 4, () => STEEL_DARK);
  cloth(flag, 0.05, H - 0.1, 1.3, 0.85, false);
  return H;
}

/** The desert cairn: stones stacked to a waist-high cone round a wooden flagpole, the flag at its head. */
function cairnPost(body: Writer, flag: Writer): number {
  const stones = [[0, 0.18, 0, 0.62, 0.22, 0.6], [0.35, 0.2, 0.3, 0.3, 0.2, 0.26], [-0.38, 0.17, 0.22, 0.28, 0.17, 0.3],
    [0.1, 0.18, -0.42, 0.3, 0.18, 0.26], [-0.25, 0.15, -0.3, 0.24, 0.15, 0.22], [0.05, 0.5, 0.05, 0.46, 0.18, 0.44],
    [0.25, 0.52, -0.1, 0.22, 0.15, 0.2], [-0.2, 0.55, 0.15, 0.22, 0.14, 0.2], [0, 0.78, 0, 0.32, 0.15, 0.3],
    [0.08, 0.98, -0.05, 0.22, 0.12, 0.2], [-0.05, 1.14, 0.04, 0.16, 0.1, 0.15]] as const;
  stones.forEach(([x, y, z, hx, hy, hz], i) => body.lump([x, y - 0.05, z], [hx, hy, hz], 101 + i * 17, STONE, STONE_DARK));
  body.rod([0.05, 0, 0.02], [0.05, 5.2, 0.02], 0.04, 0.03, 6, () => WOOD);
  cloth(flag, 0.09, 5.1, 1.4, 0.9, false);
  return 5.2;
}

/** The survey beacon: a tripod, its mast with the lamp at its head, a solar panel on a stub arm, a pennant. */
function beaconPost(body: Writer, flag: Writer): number {
  const H = 3.4;
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    body.rod([Math.cos(a) * 1.3, -0.1, Math.sin(a) * 1.3], [0, 2.2, 0], 0.035, 0.03, 6, () => FRAME);
    body.box([Math.cos(a) * 1.3, 0.02, Math.sin(a) * 1.3], [0.14, 0.04, 0.14], a, STEEL_DARK);
  }
  body.rod([0, 0.4, 0], [0, H, 0], 0.05, 0.045, 8, () => FRAME, 2);
  body.rod([0, H, 0], [0, H + 0.35, 0], 0.12, 0.1, 10, () => LAMP);
  body.rod([0, H + 0.35, 0], [0, H + 0.42, 0], 0.13, 0.04, 10, () => STEEL_DARK);
  // the solar panel on its arm, tilted to the sun
  body.rod([0, 1.9, 0], [0.7, 1.9, 0], 0.025, 0.025, 5, () => FRAME);
  const pc: V3 = [0.95, 2.0, 0], tilt = 0.5;
  const cornerAt = (u: number, v: number): V3 => [pc[0] + v * Math.sin(tilt), pc[1] + v * Math.cos(tilt), pc[2] + u];
  body.quad(cornerAt(-0.45, -0.3), cornerAt(0.45, -0.3), cornerAt(0.45, 0.3), cornerAt(-0.45, 0.3), [Math.sin(tilt), Math.cos(tilt), 0], PANEL);
  body.quad(cornerAt(-0.45, -0.3), cornerAt(0.45, -0.3), cornerAt(0.45, 0.3), cornerAt(-0.45, 0.3), [-Math.sin(tilt), -Math.cos(tilt), 0], FRAME);
  cloth(flag, 0.05, H - 0.4, 0.8, 0.4, true);
  return H + 0.42;
}

export interface ObjectivePostGeometry {
  form: ObjectivePostForm;
  /** the post itself in vertex colour (lit) */
  body: THREE.BufferGeometry;
  /** the pennant or flag (white: its material carries the owner's colour) */
  flag: THREE.BufferGeometry;
  /** the height of its top over the ground (m) */
  height: number;
}

/** The objective post of a map's form, in its frame (its foot at y 0). */
export function buildObjectivePost(form: ObjectivePostForm): ObjectivePostGeometry {
  const body = new Writer(), flag = new Writer();
  const height = form === 'field' ? fieldPost(body, flag) : form === 'cairn' ? cairnPost(body, flag)
    : form === 'beacon' ? beaconPost(body, flag) : mastPost(body, flag);
  const b = body.geometry(), f = flag.geometry();
  b.name = `objective-post-${form}`; f.name = `objective-post-${form}-flag`;
  f.deleteAttribute('color');
  return { form, body: b, flag: f, height };
}
