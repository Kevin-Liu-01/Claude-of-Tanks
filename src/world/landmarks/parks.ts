// src/world/landmarks/parks.ts — parks and squares (the landmarks lane, 2026-10-05): the fountain, the bandstand, the
// park gate with its railings, and the square that gathers them — a green with its paths and railing, the props'
// destructible benches and lamps along the paths, and a centre piece (an obelisk, a statue, a fountain, a bandstand).
import { PartSink, rgb, type RegionalBucket, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import { bar, railing, revolve } from './kit.ts';
import type { LandmarkBuilder, LandmarkKind, LandmarkPlacement } from './types.ts';

const IRON = rgb(0x26282a), IRON_GREEN = rgb(0x334a3c), GILT = rgb(0xb8933e), PAINT_WHITE = rgb(0xe6e2d8), PICKET = rgb(0xdedad0);

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];

/**
 * The fountain: a round stone basin (its coping a seat), the water in it, a pedestal rising from the middle with one, two
 * or three bowls, each smaller and higher, and a finial.
 */
export const fountain: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const R = Math.max(2, Number(ctx.params.radius)), tiers = Math.max(1, Math.min(3, Math.round(Number(ctx.params.tiers))));
  const base = -0.6 - ctx.groundFall;
  // the basin wall: a ring with its coping (outer face, top, inner face down to the water)
  revolve(sink, 'stone', 0, 0, [[R, base], [R, 0.55], [R + 0.08, 0.55], [R + 0.08, 0.7], [R - 0.42, 0.7], [R - 0.42, 0.42]], 28);
  // the water (dark glass, the sky in it) and the basin floor under it
  revolve(sink, 'glass', 0, 0, [[R - 0.42, 0.52], [0.3, 0.52]], 28, { decor: true });
  let y = 0.42, r = Math.min(0.5, R * 0.14);
  for (let k = 0; k < tiers; k++) {
    const shaft = 1.0 + (tiers - k) * 0.25, bowl = R * (0.62 - k * 0.17);
    revolve(sink, 'stone', 0, 0, [[r * 1.4, y], [r * 1.2, y + 0.2], [r, y + 0.35], [r * 0.8, y + shaft - 0.2], [r * 1.05, y + shaft]], 12);
    y += shaft;
    // the bowl: its underside swelling out to the lip, the water lying in it
    revolve(sink, 'stone', 0, 0, [[r * 1.05, y], [bowl * 0.55, y + 0.12], [bowl, y + 0.32], [bowl, y + 0.42], [bowl - 0.12, y + 0.42], [bowl - 0.12, y + 0.32]], 20);
    revolve(sink, 'glass', 0, 0, [[bowl - 0.12, y + 0.38], [r * 0.9, y + 0.38]], 20, { decor: true });
    y += 0.32;
    r *= 0.75;
  }
  revolve(sink, 'stone', 0, 0, [[r * 1.3, y], [r * 1.1, y + 0.4], [r * 1.6, y + 0.6], [0, y + 0.95]], 10);
  return { parts: sink.finish() };
};

/**
 * The bandstand (a spa park's or a garrison town's music pavilion): an octagonal plinth with its steps, eight slender
 * cast-iron columns with brackets, a railing between them, and a bell-shaped roof with a finial.
 */
export const bandstand: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const R = Math.max(2.5, Number(ctx.params.radius)), base = -0.6 - ctx.groundFall, deck = 1.0, colH = 3.0;
  const oct = Math.PI / 8, Rc = R / Math.cos(oct);
  revolve(sink, 'stone', 0, 0, [[Rc, base], [Rc, deck - 0.12], [Rc + 0.12, deck - 0.12], [Rc + 0.12, deck], [0.001, deck]], 8, {}, oct);
  // the steps up to the deck on the front facet
  for (let k = 0; k < 4; k++) {
    const y = deck * (k + 1) / 5, z = R + 0.3 * (4 - k);
    sink.span('stone', -0.9, base, R - 0.2, 0.9, y, z);
  }
  const top = deck + colH;
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4 + oct, x = Math.sin(a) * (Rc - 0.2), z = Math.cos(a) * (Rc - 0.2);
    revolve(sink, 'structureMetal', x, z, [[0.14, deck], [0.14, deck + 0.2], [0.07, deck + 0.3], [0.06, top - 0.2], [0.11, top - 0.05], [0.11, top]], 8,
      { colour: IRON_GREEN });
    bar(sink, 'structureMetal', [x, top - 0.7, z], [x * 0.82, top, z * 0.82], 0.05, { colour: IRON_GREEN, decor: true });
    // the railing round the deck, open over the steps
    const b = (i + 1) * Math.PI / 4 + oct;
    if (i !== 7) railing(sink, [x, z], [Math.sin(b) * (Rc - 0.2), Math.cos(b) * (Rc - 0.2)], 0.9, IRON_GREEN, { base: deck, pitch: 1.4 });
  }
  // the roof: an eave ring, the bell-shaped sweep, a lantern and finial
  revolve(sink, 'structureMetal', 0, 0, [[Rc + 0.4, top], [Rc + 0.4, top + 0.16], [Rc * 0.86, top + 0.55], [Rc * 0.55, top + 1.35], [Rc * 0.28, top + 2.0],
    [0.3, top + 2.3], [0.3, top + 2.55], [0.001, top + 2.6]], 8, { colour: IRON_GREEN }, oct);
  revolve(sink, 'structureMetal', 0, 0, [[0.001, top - 0.01], [Rc + 0.4, top - 0.01]], 8, { colour: PAINT_WHITE }, oct);
  revolve(sink, 'structureMetal', 0, 0, [[0.06, top + 2.55], [0.16, top + 2.75], [0.04, top + 3.0], [0.02, top + 3.5]], 8, { colour: GILT, decor: true });
  return { parts: sink.finish() };
};

/**
 * The park gate: two masonry piers with stone caps and urns, the wrought-iron double gate between them standing open,
 * and a run of railing each side on a dwarf wall to an end pier.
 */
export const parkGate: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const W = Math.max(3, Number(ctx.params.width)), run = Math.max(0, Number(ctx.params.railing));
  const base = -0.6 - ctx.groundFall;
  const pier = (x: number, h: number) => {
    sink.span('stone', x - 0.55, base, -0.55, x + 0.55, h, 0.55);
    sink.span('stone', x - 0.68, h, -0.68, x + 0.68, h + 0.22, 0.68);
    revolve(sink, 'stone', x, 0, [[0.28, h + 0.22], [0.36, h + 0.42], [0.24, h + 0.7], [0.3, h + 0.85], [0.001, h + 1.0]], 10);
  };
  pier(-W / 2 - 0.55, 3.0);
  pier(W / 2 + 0.55, 3.0);
  // the gate leaves, swung open into the park (dressing: a hull passes as through the open gate it is)
  for (const sx of [-1, 1]) {
    const hx = sx * W / 2, leaf = W / 2 - 0.1, open = 1.2;
    const tip: [number, number] = [hx - sx * Math.cos(open) * leaf, -Math.sin(open) * leaf];
    railing(sink, [hx, 0], tip, 2.2, IRON, { pitch: leaf, base: 0.05 });
    sink.member('structureMetal', [hx, 2.35, 0], [tip[0], 2.35, tip[1]], 0.06, 0.06, [0, 1, 0], { colour: GILT, decor: true, exposed: true }, 0.03);
  }
  if (run > 0) {
    for (const sx of [-1, 1]) {
      const x0 = sx * (W / 2 + 1.1), x1 = sx * (W / 2 + 1.1 + run);
      railing(sink, [x0, 0], [x1, 0], 1.5, IRON, { plinth: 'stone', base: 0.4 });
      pier(x1 + sx * 0.45, 1.9);
    }
  }
  return { parts: sink.finish() };
};

/**
 * The square: a green w × d with its gravel paths (a cross, a ring, or diagonals), a railing round it (iron on a dwarf
 * wall, or a painted picket fence) open where the paths leave, benches and lamps along the paths (the props'
 * destructible kinds) and a centre piece (another set piece, placed on the green's centre after it).
 */
export const parkSquare: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const W = Math.max(10, Number(ctx.params.width)), D = Math.max(10, Number(ctx.params.depth)), paths = String(ctx.params.paths);
  const fence = ctx.params.railing === false ? 'none' : String(ctx.params.railing) === 'picket' ? 'picket' : 'iron';
  const benches = Math.max(0, Math.round(Number(ctx.params.benches))), lamps = Math.max(0, Math.round(Number(ctx.params.lamps)));
  const centre = String(ctx.params.centre), pw = 2.4;
  const gravel: RegionalBucket = 'plaster3';
  // the gravel paths: shallow beds whose skirts reach into the ground
  const bed = (a: readonly [number, number], b: readonly [number, number], w: number) => {
    sink.member(gravel, [a[0], -0.25, a[1]], [b[0], -0.25, b[1]], w, 0.3, [0, 1, 0], { decor: true, exposed: true }, 0);
  };
  const exits: Array<[number, number]> = [];
  if (paths === 'cross' || paths === 'ring') {
    bed([-W / 2, 0], [W / 2, 0], pw); bed([0, -D / 2], [0, D / 2], pw);
    exits.push([-W / 2, 0], [W / 2, 0], [0, -D / 2], [0, D / 2]);
  }
  if (paths === 'diagonal') {
    bed([-W / 2, -D / 2], [W / 2, D / 2], pw); bed([-W / 2, D / 2], [W / 2, -D / 2], pw);
    exits.push([-W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2], [W / 2, -D / 2]);
  }
  if (paths === 'ring') {
    const rr = Math.min(W, D) * 0.3;
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2, b = (k + 1) / 16 * Math.PI * 2;
      bed([Math.cos(a) * rr, Math.sin(a) * rr], [Math.cos(b) * rr, Math.sin(b) * rr], pw * 0.8);
    }
  }
  // the fence round the green, broken where a path leaves it
  if (fence !== 'none') {
    const corners: Array<[number, number]> = [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]];
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
      // the cuts along this side (exits within a path's half width of the side's line)
      const cuts = exits.map(([x, z]) => (x - a[0]) * ux + (z - a[1]) * uz).filter((t, k) => {
        const [x, z] = exits[k];
        return Math.abs((x - a[0]) * uz - (z - a[1]) * ux) < 0.5 && t > 0.5 && t < len - 0.5;
      }).sort((p, q) => p - q);
      let t0 = 0;
      for (const t of [...cuts, len + pw]) {
        const t1 = Math.min(len, t - pw * 0.75);
        if (t1 - t0 > 0.6) {
          const p0: [number, number] = [a[0] + ux * t0, a[1] + uz * t0], p1: [number, number] = [a[0] + ux * t1, a[1] + uz * t1];
          if (fence === 'iron') railing(sink, p0, p1, 1.1, IRON, { plinth: 'stone', base: 0.35 });
          else picketRun(sink, p0, p1, PICKET);
        }
        t0 = t + pw * 0.75;
      }
    }
  }
  // benches and lamps along the paths (the props' destructibles), facing the paths
  const destructibles: Array<{ kind: string; x: number; z: number; yawDeg: number }> = [];
  // each path's direction out from the centre and how far along it the furniture stands
  const dirs: Array<[number, number, number]> = paths === 'diagonal'
    ? [[W, D], [-W, D], [W, -D], [-W, -D]].map(([a, b]): [number, number, number] => { const l = Math.hypot(a, b); return [a / l, b / l, l * 0.28]; })
    : [[1, 0, W * 0.34], [-1, 0, W * 0.34], [0, 1, D * 0.34], [0, -1, D * 0.34]];
  for (let k = 0; k < benches; k++) {
    const [ux, uz, t] = dirs[k % 4], side = k < 4 ? 1 : -1, off = pw / 2 + 0.9;
    const nx = -uz * side, nz = ux * side;
    destructibles.push({ kind: 'bench', x: ux * t + nx * off, z: uz * t + nz * off, yawDeg: Math.atan2(-nx, -nz) * 180 / Math.PI });
  }
  for (let k = 0; k < lamps; k++) {
    const [ux, uz, t] = dirs[k % 4], off = pw / 2 + 0.5;
    destructibles.push({ kind: 'lamp', x: ux * t * 0.55 + uz * off, z: uz * t * 0.55 - ux * off, yawDeg: Math.atan2(-uz, ux) * 180 / Math.PI });
  }
  const children: LandmarkPlacement[] = [];
  if (centre !== 'none' && centre !== '') children.push({ kind: centre as LandmarkKind, x: 0, z: 0, yawDeg: 0, params: centre === 'obelisk' ? { railing: false } : {} });
  return { parts: sink.finish(), tints: { plaster3: [0.95, 0.86, 0.68] }, destructibles, children };
};

/** A painted picket fence from a to b: posts, two rails and the pickets (fine), a hull's height. */
function picketRun(sink: PartSink, a: readonly [number, number], b: readonly [number, number], colour: Rgb): void {
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  const posts = Math.max(1, Math.round(len / 2.2));
  for (let k = 0; k <= posts; k++) {
    const x = a[0] + dx * k / posts, z = a[1] + dz * k / posts;
    sink.span('structureWood', x - 0.05, -0.2, z - 0.05, x + 0.05, 1.05, z + 0.05, { colour, decor: true });
  }
  for (const y of [0.3, 0.8]) bar(sink, 'structureWood', [a[0], y, a[1]], [b[0], y, b[1]], 0.06, { colour, decor: true });
  const n = Math.floor(len / 0.16);
  for (let k = 1; k < n; k++) {
    const x = a[0] + dx * k / n, z = a[1] + dz * k / n;
    const p: Vec3 = [x, 0.08, z];
    sink.span('structureWood', p[0] - 0.035, 0.08, p[2] - 0.035, p[0] + 0.035, 0.98 + (k % 2) * 0.04, p[2] + 0.035, { colour, decor: true, fine: true });
  }
}
