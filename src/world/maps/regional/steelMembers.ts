// src/world/maps/regional/steelMembers.ts — rolled and fabricated steel for the polar station's works (the looks lane's r2
// sweep, 2026-10-16; the bunkers r2 bar: "real members", never a square bar standing in for a steel section). The DEW
// Line's billboards, masts and towers were built of hot-rolled angles and tube on concrete piers, clad in insulated panel:
//   - sectionMember: any simple section (u, v points counter-clockwise seen from b) swept from a to b, caps optional;
//   - angleMember: an equal-leg angle (the lattice's legs, chords and webs), its outer square on the member's line, so
//     its hull is the old square bar's and it touches what the bar touched;
//   - tubeMember: an n-sided tube (a pipe column, a guy's turnbuckle, a waveguide);
//   - pier: a round concrete pier and its collar under a footing (a sonotube cast on the permafrost's pad);
//   - shellBody: a clad box as one welded skin with its door and window holes cut through the faces, each cut lined
//     with a reveal and closed by its leaf or its pane set back in it (never a dark plate on a face).
// Every helper draws into the sink as its caller asks (bucket, colour, decor); none draws a stream or keeps state.
import { PartSink, type EmitOptions, type RegionalBucket, type Rgb, type Vec3 } from './geometry.ts';

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v: Vec3): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

/** The member's section frame: d along a → b, e1 and e2 across it (e1 × e2 = d), e2 toward `ref` where it can. */
function sectionFrame(a: Vec3, b: Vec3, ref?: Vec3): { d: Vec3; e1: Vec3; e2: Vec3 } | null {
  const v = sub(b, a);
  if (Math.hypot(v[0], v[1], v[2]) < 1e-4) return null;
  const d = unit(v);
  let r: Vec3 = ref ?? (Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
  if (Math.abs(r[0] * d[0] + r[1] * d[1] + r[2] * d[2]) > 0.98) r = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const e1 = unit(cross(r, d)), e2 = cross(d, e1);
  return { d, e1, e2 };
}

/**
 * A section swept from a to b: `section` (u, v) points counter-clockwise seen from b (u along e1, v along e2), simple; a
 * concave section's first point must see every other (an angle's heel corner), so its caps fan from it.
 */
export function sectionMember(sink: PartSink, bucket: RegionalBucket, a: Vec3, b: Vec3, section: ReadonlyArray<readonly [number, number]>,
  opts: EmitOptions = {}, caps: 'both' | 'a' | 'b' | 'none' = 'both', ref?: Vec3): void {
  const f = sectionFrame(a, b, ref);
  if (!f) return;
  const at = (o: Vec3, p: readonly [number, number]): Vec3 =>
    [o[0] + f.e1[0] * p[0] + f.e2[0] * p[1], o[1] + f.e1[1] * p[0] + f.e2[1] * p[1], o[2] + f.e1[2] * p[0] + f.e2[2] * p[1]];
  const ra = section.map((p) => at(a, p)), rb = section.map((p) => at(b, p));
  const n = section.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sink.quad(bucket, ra[i], ra[j], rb[j], rb[i], opts);
  }
  if (caps === 'both' || caps === 'b') sink.polygon(bucket, rb, opts);
  if (caps === 'both' || caps === 'a') sink.polygon(bucket, [ra[0], ...ra.slice(1).reverse()], opts);
}

/** An equal-leg angle `leg` across, `t` thick, its heel corner at (-leg/2, -leg/2) of the square on the member's line. */
export function angleMember(sink: PartSink, bucket: RegionalBucket, a: Vec3, b: Vec3, leg: number, t: number, opts: EmitOptions = {},
  caps: 'both' | 'a' | 'b' | 'none' = 'none', ref?: Vec3): void {
  const h = leg / 2, k = -h + Math.min(t, leg * 0.4);
  // from the inner corner (it sees the whole section), counter-clockwise
  sectionMember(sink, bucket, a, b, [[k, k], [k, h], [-h, h], [-h, -h], [h, -h], [h, k]], opts, caps, ref);
}

/** An n-sided tube of radius r from a to b (`phase` turns its flats). */
export function tubeMember(sink: PartSink, bucket: RegionalBucket, a: Vec3, b: Vec3, r: number, sides = 6, opts: EmitOptions = {},
  caps: 'both' | 'a' | 'b' | 'none' = 'both', phase = Math.PI / 6): void {
  const sec: Array<[number, number]> = [];
  for (let i = 0; i < sides; i++) { const q = phase + (i / sides) * Math.PI * 2; sec.push([Math.cos(q) * r, Math.sin(q) * r]); }
  sectionMember(sink, bucket, a, b, sec, opts, caps);
}

/**
 * A round concrete pier from `y0` (buried) to `top` at (x, z), radius r, with the pad's collar a hand's breadth wider
 * at the ground `g` (the permafrost pad the piers were cast on: their footings).
 */
export function pier(sink: PartSink, bucket: RegionalBucket, x: number, z: number, r: number, y0: number, top: number, g: number,
  opts: EmitOptions = {}, sides = 8): void {
  sink.cylinder(bucket, [x, y0, z], 'y', top - y0, r, sides, opts, r, true, Math.PI / sides);
  if (g + 0.08 > y0 && g + 0.08 < top) sink.cylinder(bucket, [x, y0, z], 'y', g + 0.08 - y0, r + 0.12, sides, opts, r + 0.04, true, Math.PI / sides);
}

/** A hole in one of a shell body's faces: its face, its span along the face's u (left to right seen from outside), up. */
export interface ShellHole {
  face: 'n' | 's' | 'e' | 'w';
  u0: number; u1: number; y0: number; y1: number;
  /** what closes it, set back `inset` in the reveal: a leaf (a door) or a pane */
  fill: 'leaf' | 'glass';
  /** the leaf's colour (a coloured bucket's paint) */
  leaf?: Rgb;
  /** a leaf's two pressed panels (default true; a roller door's slats are its caller's) */
  panels?: boolean;
}

/**
 * A clad box (a module, a hut, an operations block) from (x0, y0, z0) to (x1, y1, z1) as one skin: its six faces welded
 * at their edges, every hole cut through its face with a reveal `reveal` deep lining the cut, the leaf or the pane set
 * back `inset` into the reveal; an optional `frame` (a steel frame) round each cut, proud of the face. Faces: 's' +z,
 * 'n' -z, 'e' +x, 'w' -x (u runs left to right seen from outside). The skin is `opts`' (structure unless decor); the
 * reveal and the fills are dressing.
 */
export function shellBody(sink: PartSink, bucket: RegionalBucket, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number,
  holes: readonly ShellHole[], opts: EmitOptions = {}, finish: { reveal?: number; inset?: number; revealBucket?: RegionalBucket; revealColour?: Rgb;
    frame?: { bucket: RegionalBucket; colour: Rgb; width: number; out: number } } = {}): void {
  const reveal = finish.reveal ?? 0.12, inset = finish.inset ?? 0.07;
  const faces = {
    s: { o: [(x0 + x1) / 2, 0, z1] as Vec3, u: [1, 0, 0] as Vec3, out: [0, 0, 1] as Vec3, w: x1 - x0 },
    n: { o: [(x0 + x1) / 2, 0, z0] as Vec3, u: [-1, 0, 0] as Vec3, out: [0, 0, -1] as Vec3, w: x1 - x0 },
    e: { o: [x1, 0, (z0 + z1) / 2] as Vec3, u: [0, 0, -1] as Vec3, out: [1, 0, 0] as Vec3, w: z1 - z0 },
    w: { o: [x0, 0, (z0 + z1) / 2] as Vec3, u: [0, 0, 1] as Vec3, out: [-1, 0, 0] as Vec3, w: z1 - z0 },
  } as const;
  const P = (name: keyof typeof faces, u: number, y: number, o = 0): Vec3 => {
    const f = faces[name];
    return [f.o[0] + f.u[0] * u + f.out[0] * o, y, f.o[2] + f.u[2] * u + f.out[2] * o];
  };
  // top and bottom
  sink.quad(bucket, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], opts);
  sink.quad(bucket, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], opts);
  const ro: EmitOptions = { ...opts, decor: true, colour: finish.revealColour ?? opts.colour, shade: 0.7 };
  for (const name of ['s', 'n', 'e', 'w'] as const) {
    const f = faces[name], hw = f.w / 2;
    const cuts = holes.filter((h) => h.face === name).map((h) => ({ ...h, u0: Math.max(-hw + 0.05, h.u0), u1: Math.min(hw - 0.05, h.u1), y0: Math.max(y0 + 0.02, h.y0), y1: Math.min(y1 - 0.02, h.y1) }))
      .filter((h) => h.u1 - h.u0 > 0.05 && h.y1 - h.y0 > 0.05).sort((a, b) => a.u0 - b.u0);
    // the face in vertical runs between the cuts' edges: a run over a cut is split under and over it
    // (every cut's edges split the face into columns; a column runs up between the cuts it crosses)
    const us = [...new Set([-hw, ...cuts.flatMap((c) => [c.u0, c.u1]), hw])].sort((a, b) => a - b);
    for (let i = 0; i + 1 < us.length; i++) {
      const ua = us[i], ub = us[i + 1];
      if (ub - ua < 1e-4) continue;
      const over = cuts.filter((c) => c.u0 <= ua + 1e-6 && c.u1 >= ub - 1e-6).sort((a, b) => a.y0 - b.y0);
      let from = y0;
      for (const c of over) {
        if (c.y0 - from > 1e-4) sink.quad(bucket, P(name, ua, from), P(name, ub, from), P(name, ub, c.y0), P(name, ua, c.y0), opts);
        from = Math.max(from, c.y1);
      }
      if (y1 - from > 1e-4) sink.quad(bucket, P(name, ua, from), P(name, ub, from), P(name, ub, y1), P(name, ua, y1), opts);
    }
    for (const c of cuts) {
      // the reveal: the cut's four sides into the wall, to its back
      const rb = finish.revealBucket ?? bucket;
      // (each lining faces into the cut: the sill up, the head down, the jambs toward each other)
      sink.quad(rb, P(name, c.u1, c.y0), P(name, c.u1, c.y0, -reveal), P(name, c.u0, c.y0, -reveal), P(name, c.u0, c.y0), ro);
      sink.quad(rb, P(name, c.u0, c.y1), P(name, c.u0, c.y1, -reveal), P(name, c.u1, c.y1, -reveal), P(name, c.u1, c.y1), ro);
      sink.quad(rb, P(name, c.u0, c.y0), P(name, c.u0, c.y0, -reveal), P(name, c.u0, c.y1, -reveal), P(name, c.u0, c.y1), ro);
      sink.quad(rb, P(name, c.u1, c.y1), P(name, c.u1, c.y1, -reveal), P(name, c.u1, c.y0, -reveal), P(name, c.u1, c.y0), ro);
      // the fill set back in it: a leaf (a skin of its own, its edges a little inside the reveal) or the pane
      const e = 0.004, d = -inset;
      if (c.fill === 'glass') sink.quad('glass', P(name, c.u0 + e, c.y0 + e, d), P(name, c.u1 - e, c.y0 + e, d), P(name, c.u1 - e, c.y1 - e, d), P(name, c.u0 + e, c.y1 - e, d), { decor: true });
      else {
        const lo: EmitOptions = { decor: true, colour: c.leaf ?? opts.colour };
        sink.quad('structureMetal', P(name, c.u0 + e, c.y0 + e, d), P(name, c.u1 - e, c.y0 + e, d), P(name, c.u1 - e, c.y1 - e, d), P(name, c.u0 + e, c.y1 - e, d), lo);
        // its stiles and rails as the leaf's panel moulding (a pressed steel door: two panels)
        const mid = (c.y0 + c.y1) / 2, m = { ...lo, colour: c.leaf ? [c.leaf[0] * 0.8, c.leaf[1] * 0.8, c.leaf[2] * 0.8] as Rgb : undefined, fine: true };
        if (c.panels !== false) for (const [ya, yb] of [[c.y0 + 0.12, mid - 0.06], [mid + 0.06, c.y1 - 0.12]] as const) {
          const ua = c.u0 + 0.12, ub = c.u1 - 0.12;
          if (ub - ua > 0.1 && yb - ya > 0.1) sink.quad('structureMetal', P(name, ua, ya, d + 0.012), P(name, ub, ya, d + 0.012), P(name, ub, yb, d + 0.012), P(name, ua, yb, d + 0.012), m);
        }
      }
      // the frame round the cut, proud of the face
      const fr = finish.frame;
      if (fr) {
        const fo: EmitOptions = { colour: fr.colour, decor: true };
        const w = fr.width, o = fr.out;
        const bar = (ua: number, ya: number, ub: number, yb: number) => {
          sink.quad(fr.bucket, P(name, ua, ya, o), P(name, ub, ya, o), P(name, ub, yb, o), P(name, ua, yb, o), fo);
          sink.quad(fr.bucket, P(name, ua, yb, o), P(name, ub, yb, o), P(name, ub, yb, 0), P(name, ua, yb, 0), fo);
          sink.quad(fr.bucket, P(name, ua, ya, 0), P(name, ub, ya, 0), P(name, ub, ya, o), P(name, ua, ya, o), fo);
          sink.quad(fr.bucket, P(name, ua, ya, 0), P(name, ua, ya, o), P(name, ua, yb, o), P(name, ua, yb, 0), fo);
          sink.quad(fr.bucket, P(name, ub, ya, o), P(name, ub, ya, 0), P(name, ub, yb, 0), P(name, ub, yb, o), fo);
        };
        bar(c.u0 - w, c.y0 - (c.fill === 'glass' ? w : 0), c.u0, c.y1 + w);
        bar(c.u1, c.y0 - (c.fill === 'glass' ? w : 0), c.u1 + w, c.y1 + w);
        bar(c.u0, c.y1, c.u1, c.y1 + w);
        if (c.fill === 'glass') bar(c.u0, c.y0 - w, c.u1, c.y0);
      }
    }
  }
}

/** A timber's section, w × h with its four arrises chamfered `c` (a sawn sleeper, a dressed joist): for sectionMember. */
export function chamferedSection(w: number, h: number, c: number): Array<[number, number]> {
  const hw = w / 2, hh = h / 2;
  return [[hw, -hh + c], [hw, hh - c], [hw - c, hh], [-hw + c, hh], [-hw, hh - c], [-hw, -hh + c], [-hw + c, -hh], [hw - c, -hh]];
}

/**
 * A slab laid in panels (a hut's plywood floor in its 4 × 8 ft sheets, a deck in its boards): the box from (x0, y0, z0)
 * to (x1, y1, z1) as one welded skin, its top in panels `pitch` long along z, each its own tone, its edges in `side`.
 */
export function panelSlab(sink: PartSink, bucket: RegionalBucket, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number,
  pitch: number, top: (k: number) => Rgb, side: Rgb, opts: EmitOptions = {}): void {
  const n = Math.max(1, Math.round((z1 - z0) / pitch));
  for (let k = 0; k < n; k++) {
    const za = z0 + (z1 - z0) * k / n, zb = z0 + (z1 - z0) * (k + 1) / n;
    sink.quad(bucket, [x0, y1, zb], [x1, y1, zb], [x1, y1, za], [x0, y1, za], { ...opts, colour: top(k) });
  }
  const so = { ...opts, colour: side };
  sink.quad(bucket, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], so);
  sink.quad(bucket, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], so);
  sink.quad(bucket, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], so);
  sink.quad(bucket, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], so);
  sink.quad(bucket, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], so);
}

/**
 * A rolled I-beam (a module's floor beam on its piles) from a to b, `h` deep, `b` wide, flange `tf` and web `tw` thick, its
 * web upright (toward `up`): its section swept and its ends closed flange by flange and the web.
 */
export function iBeam(sink: PartSink, bucket: RegionalBucket, a: Vec3, b: Vec3, h: number, w: number, tf: number, tw: number, opts: EmitOptions = {},
  up: Vec3 = [0, 1, 0]): void {
  const hh = h / 2, hw = w / 2, ht = tw / 2;
  // counter-clockwise seen from b (u across, v up): the bottom flange, the web, the top flange
  const sec: Array<[number, number]> = [[-hw, -hh], [hw, -hh], [hw, -hh + tf], [ht, -hh + tf], [ht, hh - tf], [hw, hh - tf], [hw, hh], [-hw, hh],
    [-hw, hh - tf], [-ht, hh - tf], [-ht, -hh + tf], [-hw, -hh + tf]];
  sectionMember(sink, bucket, a, b, sec, opts, 'none', up);
  const f = sectionFrame(a, b, up);
  if (!f) return;
  const at = (o: Vec3, p: readonly [number, number]): Vec3 =>
    [o[0] + f.e1[0] * p[0] + f.e2[0] * p[1], o[1] + f.e1[1] * p[0] + f.e2[1] * p[1], o[2] + f.e1[2] * p[0] + f.e2[2] * p[1]];
  const rects: Array<Array<[number, number]>> = [[[-hw, -hh], [hw, -hh], [hw, -hh + tf], [-hw, -hh + tf]], [[-ht, -hh + tf], [ht, -hh + tf], [ht, hh - tf], [-ht, hh - tf]],
    [[-hw, hh - tf], [hw, hh - tf], [hw, hh], [-hw, hh]]];
  for (const r of rects) {
    sink.polygon(bucket, r.map((p) => at(b, p)), opts);
    sink.polygon(bucket, r.map((p) => at(a, p)).reverse(), opts);
  }
}

/**
 * A band round a box's walls (a module's coloured fascia), `out` proud of the walls from (x0, z0) to (x1, z1), y0 to y1:
 * its four faces and the ledges over and under them, one welded ring (no hidden slab through the body).
 */
export function bandRing(sink: PartSink, bucket: RegionalBucket, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, out: number,
  opts: EmitOptions = {}): void {
  const o = [[x0 - out, z0 - out], [x1 + out, z0 - out], [x1 + out, z1 + out], [x0 - out, z1 + out]] as const;
  const i = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]] as const;
  for (let k = 0; k < 4; k++) {
    const j = (k + 1) % 4;
    // the face (seen from outside, the ring runs counter-clockwise from above: its outward normal on its right)
    sink.quad(bucket, [o[j][0], y0, o[j][1]], [o[k][0], y0, o[k][1]], [o[k][0], y1, o[k][1]], [o[j][0], y1, o[j][1]], opts);
    sink.quad(bucket, [o[k][0], y1, o[k][1]], [i[k][0], y1, i[k][1]], [i[j][0], y1, i[j][1]], [o[j][0], y1, o[j][1]], opts);
    sink.quad(bucket, [o[j][0], y0, o[j][1]], [i[j][0], y0, i[j][1]], [i[k][0], y0, i[k][1]], [o[k][0], y0, o[k][1]], opts);
  }
}
