// src/world/maps/regional/navajo.ts — the navajo kit (Titan Gorge: Monument Valley on the Colorado Plateau, the Navajo
// Nation's Oljato chapter round Goulding's trading post). The hogan, the family's house: eight walls of juniper logs
// saddle-notched at the corners on a sandstone footing, chinked with red mud, the roof cribbed inward in rings of logs
// and heaped with earth, a stovepipe through the smoke hole, its one door facing the sunrise; the shade house (chaha'oh),
// a brush roof on forked juniper posts; the trading post in the manner of Goulding's, two storeys of red sandstone under
// a parapet with the store below, the trader's rooms above reached by an outside stair, a wool room beside it and a
// stockade corral behind; the general store with its false front, porch and gas pump; stone ranch houses under
// corrugated iron or a flat mud roof on vigas; corrugated equipment sheds, wool barns and hay sheds on juniper poles;
// the single-wide trailer on block piers with its porch and swamp cooler; the roadside jewellery stands; the windmill
// over its stock tank and the chapter's water tower; the BIA day school of cut sandstone under a hipped tin roof; and
// the abandoned camps: a roofless stone house, a fallen hogan.
import { PartSink, faceBox, pick, rgb, shade, UV_MEMBER, type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
import { buildHouse, emitRoof, roofGeometry, windowRhythm, type HouseDialect, type HouseFrame, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, windowUnit, type WindowStyle } from './openings.ts';
import { ruinHouse, type RuinHead } from './ruinGrammar.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';
import { sheetHall } from './hall.ts';
import { recordShed } from './shedFall.ts';
import { navajoStands } from './souqs.ts'; // props #23: the roadside stands
import { chamferedBeam, CLADDING, DOOR_PAINT, drum, eastSide, endStacks, equipmentShed, GALV, groundCourse, hayShed, hogan, hoganBody, IRON, JUNIPER, JUNIPER_DARK, OCT, PLANK, PLANK_GREY, pole, RUSTY, STOVEPIPE, trailer, uvOffset, windmill, woodStack } from './navajoR2.ts'; // the looks lane's r2 rebuilds (extract-then-own)

/** Window trim: white, green, blue, red. */
const TRIM: readonly Rgb[] = [0xd6d0c2, 0x4f7a52, 0x3f6f99, 0x8a3a2c].map(rgb);
/** A point on a face: `u` along it, `y` up, `o` out from it. */
function facePoint(f: Face, u: number, y: number, o: number): Vec3 {
  return [f.origin[0] + f.u[0] * u + f.out[0] * o, y, f.origin[2] + f.u[2] * u + f.out[2] * o];
}

/**
 * A pair of plank doors in a wide opening (the wool room, the barns): vertical boards with their joints, two battens
 * and a Z brace on each leaf, strap hinges, the frame round them (gauntlet wave 104: the shared gate's dark wicket
 * read as an unrendered black hole; these leaves are boards all over).
 */
function plankGate(sink: PartSink, face: Face, u: number, y: number, w: number, h: number, leaf: Rgb, frame: { width: number; out: number; colour: Rgb }): void {
  const go = sink.recess > 0 ? -sink.recess + 0.03 : 0.015;
  const lc = { colour: leaf, decor: true, uv: UV_MEMBER };
  const joint = shade(leaf, 0.72), batten = shade(leaf, 0.9);
  for (const side of [-1, 1]) {
    const cu = u + side * w / 4, lw = w / 2 - 0.02, boards = Math.max(3, Math.round(lw / 0.24));
    faceBox(sink, 'structureWood', face, cu, y + h / 2, go, lw, h, 0.05, lc);
    for (let k = 1; k < boards; k++) faceBox(sink, 'structureWood', face, cu - lw / 2 + k * lw / boards, y + h / 2, go + 0.027, 0.025, h - 0.06, 0.008, { colour: joint, decor: true, fine: true });
    for (const t of [0.14, 0.86]) faceBox(sink, 'structureWood', face, cu, y + h * t, go + 0.045, lw - 0.12, 0.14, 0.03, { colour: batten, decor: true, uv: UV_MEMBER });
    // the brace from the lower batten at the hinge side up to the upper batten at the meeting side
    const hu = cu + side * (lw / 2 - 0.12), mu = cu - side * (lw / 2 - 0.12);
    sink.member('structureWood', facePoint(face, hu, y + h * 0.14 + 0.07, go + 0.045), facePoint(face, mu, y + h * 0.86 - 0.07, go + 0.045), 0.12, 0.03, face.out,
      { colour: batten, decor: true, exposed: true }, 0);
    // the strap hinges, black iron across the battens at the hinge side
    for (const t of [0.14, 0.86]) faceBox(sink, 'structureMetal', face, cu + side * (lw / 2 - 0.3), y + h * t, go + 0.065, 0.55, 0.05, 0.01, { colour: IRON, decor: true, fine: true });
  }
  const fo = { decor: true, colour: frame.colour };
  faceBox(sink, 'structureWood', face, u - w / 2 - frame.width / 2, y + h / 2, frame.out / 2, frame.width, h, frame.out, fo);
  faceBox(sink, 'structureWood', face, u + w / 2 + frame.width / 2, y + h / 2, frame.out / 2, frame.width, h, frame.out, fo);
  faceBox(sink, 'structureWood', face, u, y + h + frame.width / 2, frame.out / 2, w + 2 * frame.width, frame.width, frame.out, fo);
}

/** The ground course of a house frame's main body. */
function frameCourse(sink: PartSink, frame: HouseFrame, top = 0.3): void {
  const b = frame.bodies[0];
  groundCourse(sink, b.x0, b.z0, b.x1, b.z1, top);
}
/**
 * The shade house (chaha'oh): four forked juniper posts, two stringers, cross poles and a roof of juniper and
 * cottonwood boughs that lets the sun through in patches. Its posts are the structure; the brush casts a shadow.
 */
function ramadaBody(sink: PartSink, W: number, D: number, H: number, look: () => number): void {
  const post = pick(look, JUNIPER);
  const px = W / 2 - 0.15, pz = D / 2 - 0.15;
  // (the looks lane, 2026-10-16; WORKLIST #26 "ramada posts snap and drop the bough mat") recorded as an open shed
  // (shedFall.ts): a blow passes between its posts; it falls with its posts snapped over their feet and its bough mat
  // down on them in its lengths, not as an adobe heap
  const posts: Array<[number, number, number, number]> = [[-px, -pz, -0.3, H], [px, -pz, -0.3, H], [-px, pz, -0.3, H], [px, pz, -0.3, H]];
  recordShed(sink, posts.map(([x, z, f, h]) => ({ foot: [x, f, z] as Vec3, head: [x, h, z] as Vec3 })), {
    W, D, pitchDeg: 2, eaveY: H + 0.06, eave: 0.3, verge: 0.3, deck: 0.1, post: 0.17, posts, pad: null, timber: post, boards: null, boardW: 0.2,
    back: false, ends: false, roof: { bucket: 'structureWood', colour: [0.42, 0.39, 0.26], shape: 'splinter', lattice: true }, stone: null, pile: 0,
  });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const lean = (look() - 0.5) * 0.12;
    const tone = shade(post, 0.9 + look() * 0.2);
    pole(sink, [sx * px, -0.3, sz * pz], [sx * px + lean, H, sz * pz], 0.085, tone, false);
    // the post's fork, its two tines up round the stringer (dressing: the stringer sat 6 cm over the post's cut top)
    for (const side of [-1, 1]) pole(sink, [sx * px + side * 0.05, H - 0.1, sz * pz], [sx * px + side * 0.05, H + 0.14, sz * pz], 0.03, tone, true);
  }
  for (const sz of [-1, 1]) pole(sink, [-px - 0.25, H + 0.06, sz * pz], [px + 0.25, H + 0.06, sz * pz], 0.075, post, true);
  const n = Math.max(4, Math.round(W / 0.55));
  for (let k = 0; k < n; k++) {
    const x = -W / 2 + 0.1 + (W - 0.2) * (k + 0.5) / n;
    pole(sink, [x, H + 0.19, -pz - 0.3], [x + (look() - 0.5) * 0.1, H + 0.19, pz + 0.3], 0.05, shade(post, 1.05), true);
  }
  // the boughs: a mat of juniper and cottonwood branches laid across the poles in two crossing layers, ragged at the
  // edges and hanging over them, with a few thicker bundles; the sun comes through in patches (they cast a shadow)
  const tone = (): Rgb => [0.40 + look() * 0.14, 0.38 + look() * 0.12, 0.25 + look() * 0.07];
  const dry = (): Rgb => [0.52 + look() * 0.1, 0.45 + look() * 0.08, 0.33 + look() * 0.05];
  for (let layer = 0; layer < 2; layer++) {
    const across = layer === 0, len = across ? D : W, span = across ? W : D, n2 = Math.round(span / 0.16);
    for (let k = 0; k < n2; k++) {
      if (look() < 0.12) continue;
      const t = -span / 2 - 0.15 + (span + 0.3) * (k + look() * 0.6) / n2;
      const over0 = 0.1 + look() * 0.45, over1 = 0.1 + look() * 0.45, y = H + 0.27 + layer * 0.07 + look() * 0.04;
      const a: Vec3 = across ? [t, y, -len / 2 - over0] : [-len / 2 - over0, y, t];
      const b: Vec3 = across ? [t + (look() - 0.5) * 0.3, y + (look() - 0.5) * 0.05, len / 2 + over1] : [len / 2 + over1, y + (look() - 0.5) * 0.05, t + (look() - 0.5) * 0.3];
      bough(sink, a, b, 0.1 + look() * 0.12, 0.05, look() < 0.3 ? dry() : tone(), (look() - 0.5) * 0.12);
    }
  }
  for (let k = 0; k < 7; k++) {
    const x = (look() - 0.5) * (W - 0.8), z = (look() - 0.5) * (D - 0.8), r = 0.35 + look() * 0.35;
    sink.cylinder('structureWood', [x, H + 0.36, z], 'y', 0.18 + look() * 0.12, r, 6, { colour: tone(), decor: true, shadow: true }, r * 0.55, true, look());
  }
  // the hanging ends of the boughs over the eaves
  for (let k = 0; k < 14; k++) {
    const onX = look() < 0.5, s = look() < 0.5 ? -1 : 1, t = (look() - 0.5) * (onX ? W : D);
    // (each hanging end starts on the mat over the poles' ends and falls past the eave: they started 25 cm out in the
    // air beyond the mat)
    // (the looks lane, 2026-10-15: they started 5 cm past the mat's edge, a hair off it) on the mat's last hand
    const x = onX ? t : s * (W / 2 - 0.35), z = onX ? s * (D / 2 - 0.1) : t;
    const dx = onX ? 0 : s * 0.8, dz = onX ? s * 0.65 : 0, drop = 0.25 + look() * 0.35;
    bough(sink, [x, H + 0.27, z], [x + dx, H + 0.27 - drop, z + dz], 0.18 + look() * 0.2, 0.05, tone(), (look() - 0.5) * 0.1);
  }
}

/**
 * A bough of juniper or cottonwood laid on a ramada's poles (the looks lane, 2026-10-15; WORKLIST #26 "ramada posts
 * with a bough mat": the boughs were plain boxes, 93 % of its surface): a flat branch from its butt at `a` to its tip at
 * `b`, `w` across at the butt narrowing to a third at the tip, sagging `sag` at its middle and its spray spread wider
 * there, `t` thick. Three sections, so it bends and tapers; it casts its patch of shadow.
 */
function bough(sink: PartSink, a: Vec3, b: Vec3, w: number, t: number, colour: Rgb, sag: number): void {
  const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1, sx = -dz / l, sz = dx / l;
  const at = (f: number): Vec3 => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f - sag * 4 * f * (1 - f), a[2] + (b[2] - a[2]) * f];
  const widths = [w, w * 1.25, w * 0.35], fs = [0, 0.5, 1];
  const ring = fs.map((f, i): Vec3[] => {
    const c = at(f), hw = widths[i] / 2, ht = t / 2 * (i === 2 ? 0.5 : 1);
    return [[c[0] - sx * hw, c[1] - ht, c[2] - sz * hw], [c[0] + sx * hw, c[1] - ht, c[2] + sz * hw], [c[0] + sx * hw, c[1] + ht, c[2] + sz * hw], [c[0] - sx * hw, c[1] + ht, c[2] - sz * hw]];
  });
  const opts = { colour, decor: true, shadow: true } as const;
  for (let i = 0; i + 1 < ring.length; i++) {
    const p = ring[i], q = ring[i + 1];
    for (let k = 0; k < 4; k++) {
      const j = (k + 1) % 4;
      // each side wound to face out of the branch's axis
      const m: Vec3 = [(p[k][0] + p[j][0] + q[k][0] + q[j][0]) / 4, (p[k][1] + p[j][1] + q[k][1] + q[j][1]) / 4, (p[k][2] + p[j][2] + q[k][2] + q[j][2]) / 4];
      const c = at(fs[i] + 0.25);
      const quad: Vec3[] = [p[k], p[j], q[j], q[k]];
      const e1 = [quad[1][0] - quad[0][0], quad[1][1] - quad[0][1], quad[1][2] - quad[0][2]], e2 = [quad[2][0] - quad[0][0], quad[2][1] - quad[0][1], quad[2][2] - quad[0][2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const outward = n[0] * (m[0] - c[0]) + n[1] * (m[1] - c[1]) + n[2] * (m[2] - c[2]) >= 0;
      sink.quad('structureWood', ...((outward ? quad : [...quad].reverse()) as [Vec3, Vec3, Vec3, Vec3]), opts);
    }
  }
  // the butt's cut end
  sink.polygon('structureWood', ring[0], opts);
}

const ramada: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  // the shade house fills its plot (its posts stand at the plot's corners)
  const b = ctx.bounds;
  const W = Math.max(2.6, b.maxX - b.minX - 0.3), D = Math.max(2.4, b.maxZ - b.minZ - 0.3);
  const H = 2.25 + ctx.rng() * 0.2;
  sink.placed(0, (b.maxX + b.minX) / 2, 0, (b.maxZ + b.minZ) / 2, () => ramadaBody(sink, W, D, H, ctx.variant));
  return sink.finish();
};

/**
 * A stockade corral of juniper posts set close in the ground (the sheep and goat pens of a camp): each run one
 * structural panel at the posts' common height, the posts' ragged tops standing over it as dressing. Runs as
 * [x0, z0, x1, z1] in the building's frame; a gap of `gate` metres at the middle of the first run.
 */
function stockade(sink: PartSink, runs: ReadonlyArray<readonly [number, number, number, number]>, look: () => number, gate = 0): void {
  const H = 1.45, colour = pick(look, JUNIPER);
  runs.forEach(([x0, z0, x1, z1], i) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.5) return;
    const ux = (x1 - x0) / len, uz = (z1 - z0) / len;
    const pieces: Array<[number, number]> = i === 0 && gate > 0 ? [[0, len / 2 - gate / 2], [len / 2 + gate / 2, len]] : [[0, len]];
    for (const [a, b] of pieces) {
      if (b - a < 0.3) continue;
      const yaw = Math.atan2(ux, uz);
      sink.placed(yaw, x0 + ux * (a + b) / 2, 0, z0 + uz * (a + b) / 2, () => {
        sink.span('structureWood', -0.07, -0.3, -(b - a) / 2, 0.07, H, (b - a) / 2, { colour: shade(colour, 0.82) });
        for (let s = -(b - a) / 2 + 0.07; s < (b - a) / 2; s += 0.16 + look() * 0.06) {
          const h = H + 0.05 + look() * 0.42, r = 0.055 + look() * 0.03;
          sink.cylinder('structureWood', [(look() - 0.5) * 0.04, 0.0, s], 'y', h, r, 5, { colour: shade(colour, 0.85 + look() * 0.3), decor: true, uv: UV_MEMBER }, r * 0.8, true, look());
        }
        // a rail of poles bound along the inside
        sink.cylinder('structureWood', [-0.1, 1.05, -(b - a) / 2], 'z', b - a, 0.05, 5, { colour, decor: true, uv: UV_MEMBER });
      });
    }
  });
}

/** Wooden sash windows of the stone and stucco houses: painted trim, a timber lintel, a board sill. */
function sashStyle(trim: Rgb, bars: WindowStyle['bars']): WindowStyle {
  return { frame: trim, frameWidth: 0.07, frameOut: 0.05, bars, surround: null, sill: { bucket: 'structureWood', out: 0.07, colour: PLANK_GREY }, shutters: null };
}

/** The house dialect of the kit: sash windows with a timber lintel in the stone, plank or panel doors. */
function dialectOf(rng: () => number, trim: Rgb, door: Rgb, opts: { lit?: number; bars?: WindowStyle['bars']; leaf?: 'plank' | 'panel' | 'glazed' } = {}): HouseDialect {
  const style = sashStyle(trim, opts.bars ?? 'two');
  return {
    window: (s, face, o, y0) => {
      windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, o.kind === 'loft' ? { ...style, bars: 'none', sill: null } : style, rng, o.kind === 'loft' ? 0 : opts.lit ?? 0.5);
      // the lintel: a squared juniper beam over the opening, its ends in the masonry
      faceBox(s, 'structureWood', face, o.u, y0 + o.y0 + o.h + 0.09, 0.025, o.w + 0.36, 0.17, 0.05, { colour: JUNIPER_DARK, decor: true, fineSides: true });
    },
    door: (s, face, o, y0, frame) => {
      if (o.kind === 'gate') {
        plankGate(s, face, o.u, y0 + o.y0, o.w, o.h, PLANK_GREY, { width: 0.16, out: 0.06, colour: JUNIPER_DARK });
        return;
      }
      doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: door, frame: { bucket: 'structureWood', width: 0.1, out: 0.05, colour: trim },
        steps: { bucket: 'stone' }, leafKind: opts.leaf ?? (rng() < 0.5 ? 'plank' : 'panel') }, frame.floors[o.storey] + o.y0);
      faceBox(s, 'structureWood', face, o.u, y0 + o.y0 + o.h + 0.2, 0.025, o.w + 0.5, 0.18, 0.05, { colour: JUNIPER_DARK, decor: true, fineSides: true });
    },
  };
}

/** The flat mud roof's vigas: log ends through the wall below the parapet, a canale spouting off each side. */
function vigaEnds(sink: PartSink, frame: HouseFrame, look: () => number): void {
  const y = frame.eaveY - 0.22, b = frame.bodies[frame.bodies.length - 1];
  const W = b.x1 - b.x0;
  const n = Math.max(3, Math.round(W / 0.75));
  for (const z of [b.z1, b.z0]) for (let k = 0; k < n; k++) {
    const x = b.x0 + 0.35 + (W - 0.7) * (k + 0.5) / n;
    sink.cylinder('structureWood', [x, y, z > 0 ? z - 0.02 : z - 0.32], 'z', 0.34, 0.1, 6, { colour: pick(look, JUNIPER), decor: true, uv: UV_MEMBER });
  }
  for (const side of [-1, 1]) {
    const x = side > 0 ? b.x1 : b.x0;
    sink.span('structureWood', side > 0 ? x : x - 0.6, frame.eaveY + 0.05, -0.12, side > 0 ? x + 0.6 : x, frame.eaveY + 0.2, 0.12, { colour: PLANK, decor: true });
  }
}

interface RanchOptions {
  W: number;
  D: number;
  wall: RegionalBucket;
  flat: boolean;
  porch: boolean;
}

/**
 * A ranch house of the valley: one storey of red sandstone (or stucco) on a footing, sash windows under timber lintels,
 * a low gable of corrugated iron with a stovepipe, or a flat mud roof on vigas behind a parapet; a porch of juniper
 * posts under a tin shed roof along the front. Built at the origin facing +z.
 */
function ranchBody(sink: PartSink, rng: () => number, look: () => number, o: RanchOptions): HouseFrame {
  const { W, D } = o;
  const trim = pick(rng, TRIM), door = pick(rng, DOOR_PAINT);
  const du = (rng() - 0.5) * W * 0.3;
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: du, w: 0.95, y0: 0, h: 2.05 }];
  for (const o2 of windowRhythm('front', 0, W, { w: 0.9, h: 1.2, sill: 0.95, spacing: 2.3, margin: 0.8, max: 3, avoid: [[du - 0.55, du + 0.55]] })) openings.push(o2);
  for (const face of ['left', 'right'] as const) for (const o2 of windowRhythm(face, 0, D, { w: 0.85, h: 1.1, sill: 1.0, spacing: 2.6, margin: 1.0, max: 2 })) openings.push(o2);
  for (const o2 of windowRhythm('back', 0, W, { w: 0.7, h: 0.9, sill: 1.25, spacing: 3.0, margin: 1.2, max: 1 })) openings.push(o2);
  const roof: RoofSpec = o.flat
    ? { kind: 'flat', pitchDeg: 0, eave: 0.04, verge: 0.04, thickness: 0.24, bucket: 'plaster', parapet: 0.32 }
    : { kind: 'gable', pitchDeg: 15 + rng() * 6, eave: 0.38, verge: 0.3, thickness: 0.07, bucket: 'roof', ridge: 'saddle' };
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.32, out: 0.05, bucket: 'stone' }, storeys: [{ h: 2.55 + rng() * 0.25, wall: o.wall }], roof,
    gableBucket: rng() < 0.5 ? o.wall : 'wood', openings,
    chimneys: o.flat ? [] : [{ x: (rng() - 0.5) * W * 0.4, z: -D * 0.25, sx: 0.5, sz: 0.5, above: 0.55, bucket: 'stone', cap: 'slab' }],
    gutters: null, verge: o.flat ? null : { colour: PLANK_GREY, bucket: 'structureWood' }, reveal: o.wall === 'stone' ? 0.3 : 0.18,
    rafters: o.flat ? null : JUNIPER_DARK, spall: o.wall === 'stone' ? null : 'stone',
  }, dialectOf(rng, trim, door));
  frameCourse(sink, frame, 0.36);
  if (o.flat) vigaEnds(sink, frame, look);
  else {
    // a stovepipe through the tin beside the ridge
    const top = frame.roof.topAt(W * 0.22, D * 0.18) ?? frame.roof.ridgeTopY;
    sink.cylinder('structureMetal', [W * 0.22, top - 0.3, D * 0.18], 'y', 1.2, 0.08, 8, { colour: STOVEPIPE, decor: true });
    sink.cylinder('structureMetal', [W * 0.22, top + 0.9, D * 0.18], 'y', 0.12, 0.17, 8, { colour: STOVEPIPE, decor: true }, 0.03);
  }
  if (o.porch) {
    // the porch: juniper posts and a tin shed roof falling away from the front wall
    const y = frame.eaveY - (o.flat ? 0.05 : 0.15), depth = 1.9;
    const n = Math.max(2, Math.round(W / 2.6));
    for (let k = 0; k <= n; k++) {
      const u = -W / 2 + 0.25 + (W - 0.5) * k / n;
      const a: Vec3 = [u, 0.0, D / 2 + depth - 0.12];
      pole(sink, a, [u, y - 0.2, D / 2 + depth - 0.12], 0.08, pick(look, JUNIPER), false);
    }
    const porch: RoofSpec = { kind: 'shed', pitchDeg: 9, eave: 0.12, verge: 0.12, thickness: 0.06, bucket: 'roof' };
    sink.placed(-Math.PI / 2, 0, 0, D / 2 + depth / 2, () => emitRoof(sink, roofGeometry(depth, W, y - 0.25, porch), porch));
    // a plank deck on stones under it
    sink.span('structureWood', -W / 2 + 0.1, 0.0, D / 2 + 0.02, W / 2 - 0.1, 0.22, D / 2 + depth, { colour: PLANK_GREY, decor: true });
  }
  return frame;
}

/** A stone ranch house in a plot (the compound's house, the general store's back house). */
function ranchIn(ctx: RegionalBuildContext): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const wall: RegionalBucket = ctx.wallBucket === 'stone' || rng() < 0.6 ? 'stone' : 'plaster';
  const flat = rng() < 0.35, porch = rng() < 0.6;
  // the house fills the old cottage's reach: its back on the plot's back edge, its front (or its porch's) on the front
  const b = ctx.bounds;
  const W = Math.max(5.2, b.maxX - b.minX - 0.6), D = Math.max(5.6, b.maxZ - b.minZ - 0.6 - (porch ? 1.9 : 0));
  sink.placed(0, (b.maxX + b.minX) / 2, 0, b.minZ + 0.3 + D / 2, () => ranchBody(sink, rng, ctx.variant, { W, D, wall, flat, porch }));
  return sink.finish();
}

/**
 * The family camp (a compound plot): the hogan at one end, door to the east; a stone ranch house at the other; the
 * shade house between them in front; a stockade sheep corral behind; a woodpile and the water drums.
 */
const camp: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  // the camp fills the old compound's reach: the hogan and the house at its two ends, the shade house on its front
  // edge, the corral along its back (no lane opens through the plot's ends)
  const b = ctx.bounds;
  const W = b.maxX - b.minX, D = b.maxZ - b.minZ, cx = (b.maxX + b.minX) / 2, cz = (b.maxZ + b.minZ) / 2;
  const flip = rng() < 0.5 ? -1 : 1;
  const R = Math.max(2.5, Math.min(3.1, D / 2 - 1.2));
  const A = R * Math.cos(OCT / 2) + 0.06;
  const hx = cx + flip * (W / 2 - A - 0.15), hz = cz - D / 2 + A + 0.9;
  // the hogan's door: its east side in the camp's frame (the camp turns with the plot)
  sink.placed(0, hx, 0, hz, () => hoganBody(sink, rng, look, { r: R, door: eastSide(ctx.yaw) }));
  const rw = Math.min(7.6, W * 0.32), rd = Math.min(6.2, D * 0.45);
  sink.placed(0, cx - flip * (W / 2 - rw / 2 - 0.2), 0, cz - D / 2 + rd / 2 + 0.25, () => {
    const wall: RegionalBucket = ctx.wallBucket === 'stone' || rng() < 0.65 ? 'stone' : 'plaster';
    ranchBody(sink, rng, look, { W: rw, D: rd, wall, flat: rng() < 0.4, porch: false });
  });
  // the shade house on the front edge between them
  const rDw = 4.2, rDd = 3.4;
  sink.placed(0, cx + flip * W * 0.05, 0, cz + D / 2 - rDd / 2 - 0.15, () => ramadaBody(sink, rDw, rDd, 2.3, look));
  // the sheep corral behind, between the houses
  const cx0 = cx - flip * (W / 2 - rw - 0.6), cx1 = hx - flip * (A + 0.6);
  const za = cz - D / 2 + 0.3, zb = cz - D / 2 + 4.2;
  if (Math.abs(cx1 - cx0) > 3) stockade(sink, [[cx0, zb, cx1, zb], [cx1, zb, cx1, za], [cx1, za, cx0, za], [cx0, za, cx0, zb]], look, 1.6);
  // a cord of juniper along the front by the hogan
  woodStack(sink, hx - flip * 0.4, cz + D / 2 - 0.45, 0, Math.min(2.6, A * 0.9), 1.15, look, 0.6);
  sink.dressing(ctx.tier === 'mobile', () => {
    drum(sink, hx - flip * (A + 0.35), hz + A * 0.6, look);
    drum(sink, hx - flip * (A + 0.95), hz + A * 0.7, look);
  });
  return sink.finish();
};

/**
 * The trading post in the manner of Goulding's (a caravanserai plot): two storeys of red sandstone under a parapet,
 * the store's doors and windows under a juniper-post porch with its sign board, the trader's rooms above reached by an
 * outside stair; a one-storey stone wool room beside it; a stockade corral behind; a gas pump at the porch's end.
 */
const tradingPost: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  // the post, its wool room and its corral fill the old caravanserai's reach (its measured bounds)
  const bb = ctx.bounds, PW = bb.maxX - bb.minX, PD = bb.maxZ - bb.minZ;
  const W1 = Math.max(8.4, Math.min(10.2, PW * 0.46)), D1 = Math.max(7.2, Math.min(8.6, PD * 0.42));
  const x1 = bb.minX + W1 / 2 + 1.4, z1 = bb.maxZ - D1 / 2 - 2.45;
  const trim = pick(rng, TRIM), door = pick(rng, DOOR_PAINT);
  sink.placed(0, x1, 0, z1, () => {
    const openings: Opening[] = [
      { face: 'front', storey: 0, kind: 'door', u: 0, w: 1.5, y0: 0, h: 2.3 },
      { face: 'left', storey: 1, kind: 'door', u: D1 / 2 - 1.1, w: 0.9, y0: 0, h: 2.0 },
    ];
    for (const u of [-W1 * 0.3, W1 * 0.3]) openings.push({ face: 'front', storey: 0, kind: 'window', u, w: 1.5, h: 1.5, y0: 0.75 });
    for (const o of windowRhythm('front', 1, W1, { w: 0.85, h: 1.15, sill: 0.8, spacing: 2.4, margin: 1.0, max: 3 })) openings.push(o);
    for (const o of windowRhythm('right', 0, D1, { w: 0.8, h: 1.0, sill: 1.3, spacing: 2.6, margin: 1.2, max: 2 })) openings.push(o);
    for (const o of windowRhythm('right', 1, D1, { w: 0.8, h: 1.1, sill: 0.8, spacing: 2.6, margin: 1.0, max: 2 })) openings.push(o);
    for (const o of windowRhythm('left', 1, D1, { w: 0.8, h: 1.1, sill: 0.8, spacing: 2.6, margin: 1.0, max: 1, avoid: [[D1 / 2 - 1.7, D1 / 2]] })) openings.push(o);
    for (const o of windowRhythm('back', 1, W1, { w: 0.8, h: 1.1, sill: 0.8, spacing: 2.8, margin: 1.2, max: 2 })) openings.push(o);
    const frame = buildHouse(sink, {
      w: W1, d: D1, plinth: { h: 0.35, out: 0.06, bucket: 'stone' }, storeys: [{ h: 3.3, wall: 'stone' }, { h: 2.9, wall: 'stone' }],
      roof: { kind: 'flat', pitchDeg: 0, eave: 0.05, verge: 0.05, thickness: 0.25, bucket: 'plaster', parapet: 0.6 }, gableBucket: 'stone',
      openings, chimneys: [], gutters: null, verge: null, reveal: 0.34,
    }, dialectOf(rng, trim, door, { lit: 0.5, leaf: 'glazed' }));
    frameCourse(sink, frame, 0.42);
    vigaEnds(sink, frame, look);
    // the porch across the store front: juniper posts, a tin roof, the plank deck, the sign board on the parapet
    const y = 3.0, depth = 2.2;
    for (let k = 0; k <= 3; k++) {
      const u = -W1 / 2 + 0.3 + (W1 - 0.6) * k / 3;
      pole(sink, [u, 0, D1 / 2 + depth - 0.15], [u, y, D1 / 2 + depth - 0.15], 0.1, pick(look, JUNIPER), false);
    }
    const porch: RoofSpec = { kind: 'shed', pitchDeg: 8, eave: 0.15, verge: 0.2, thickness: 0.07, bucket: 'roof' };
    sink.placed(-Math.PI / 2, 0, 0, D1 / 2 + depth / 2, () => emitRoof(sink, roofGeometry(depth, W1, y, porch), porch));
    sink.span('structureWood', -W1 / 2 + 0.1, 0.0, D1 / 2 + 0.02, W1 / 2 - 0.1, 0.36, D1 / 2 + depth, { colour: PLANK_GREY, decor: true });
    const f = frame.faces.front, top = frame.eaveY + 0.25;
    faceBox(sink, 'structureWood', f, 0, top + 0.3, 0.05, W1 * 0.7, 0.8, 0.06, { colour: rgb(0xe4ddcc), decor: true });
    // the lettering read at range: two dark bars of capitals and a red rule under them
    for (const [yy, w] of [[top + 0.48, 0.62], [top + 0.18, 0.48]] as const) faceBox(sink, 'structureWood', f, 0, yy, 0.085, W1 * w, 0.17, 0.02, { colour: rgb(0x3a2a22), decor: true });
    faceBox(sink, 'structureWood', f, 0, top - 0.02, 0.085, W1 * 0.6, 0.05, 0.02, { colour: rgb(0x9a2e24), decor: true });
    // the outside stair up the west wall to the trader's rooms: stringers, treads and a rail (structure: the stringer)
    const sx = -W1 / 2 - 0.55, floor1 = frame.floors[1];
    const z0 = D1 / 2 - 1.1 - 0.5, run = Math.min(D1 - 1.4, floor1 * 1.15);
    const slope = Math.hypot(run, floor1);
    sink.member('structureWood', [sx, 0.0, z0 - run], [sx, floor1, z0], 0.9, 0.2, [0, run / slope, -floor1 / slope], { colour: PLANK, exposed: true }, 0);
    const steps = Math.round(floor1 / 0.2);
    for (let k = 1; k <= steps; k++) {
      const yy = floor1 * k / steps, zz = z0 - run + run * k / steps;
      sink.span('structureWood', sx - 0.48, yy - 0.05, zz - 0.14, sx + 0.48, yy + 0.02, zz + 0.1, { colour: PLANK_GREY, decor: true });
    }
    sink.span('structureWood', sx - 0.5, floor1 - 0.08, z0 - 0.05, sx + 0.5, floor1 + 0.02, D1 / 2 - 0.4, { colour: PLANK_GREY });
    sink.member('structureWood', [sx - 0.47, 0.9, z0 - run], [sx - 0.47, floor1 + 0.95, z0], 0.06, 0.06, [1, 0, 0], { colour: PLANK, decor: true, exposed: true }, 0);
    // (the buildings stream, 2026-10-12, the integrity check: the handrail ran up beside the stair on nothing) its posts
    // from the stair's string at the foot, the middle and the head
    for (const f of [0, 0.5, 1]) {
      const yy = floor1 * f, zz = z0 - run + run * f;
      sink.span('structureWood', sx - 0.5, yy - 0.05, zz - 0.03, sx - 0.44, yy + 0.92 + 0.05 * f, zz + 0.03, { colour: PLANK, decor: true });
    }
  });
  // the wool room: one storey of the same stone, a wide plank door on the front, small high windows
  const W2 = Math.max(5.6, Math.min(9.6, PW - W1 - 2.9)), D2 = Math.max(6.4, Math.min(10, PD * 0.48));
  const x2 = x1 + W1 / 2 + 0.9 + W2 / 2, z2 = z1 + D1 / 2 - D2 / 2 - 0.2;
  sink.placed(0, x2, 0, z2, () => {
    const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'gate', u: 0, w: 2.2, y0: 0, h: 2.4 }];
    for (const o of windowRhythm('right', 0, D2, { w: 0.7, h: 0.5, sill: 2.0, spacing: 2.4, margin: 1.0 })) openings.push({ ...o, kind: 'loft' });
    const frame = buildHouse(sink, {
      w: W2, d: D2, plinth: { h: 0.3, out: 0.05, bucket: 'stone' }, storeys: [{ h: 3.0, wall: 'stone' }],
      roof: { kind: 'flat', pitchDeg: 0, eave: 0.05, verge: 0.05, thickness: 0.24, bucket: 'plaster', parapet: 0.35 }, gableBucket: 'stone',
      openings, chimneys: [], gutters: null, verge: null, reveal: 0.3,
    }, dialectOf(rng, trim, door, { lit: 0 }));
    frameCourse(sink, frame, 0.38);
    vigaEnds(sink, frame, look);
  });
  // the stockade corral behind the buildings, and the gas pump at the porch's east end
  const zc = Math.min(z1 - D1 / 2, z2 - D2 / 2) - 0.6;
  const cz0 = bb.minZ + 0.45, xa = bb.minX + 0.45, xb = bb.maxX - 0.45;
  if (zc - cz0 > 3) stockade(sink, [[xa, zc, xa, cz0], [xa, cz0, xb, cz0], [xb, cz0, xb, zc]], look);
  const gx = x1 + W1 / 2 + 1.5, gz = bb.maxZ - 1.2;
  sink.span('stone', gx - 0.9, -0.2, gz - 0.55, gx + 0.9, 0.18, gz + 0.55, { decor: true });
  sink.span('structureMetal', gx - 0.3, 0.18, gz - 0.25, gx + 0.3, 1.75, gz + 0.25, { colour: rgb(0xb8302a) });
  sink.cylinder('structureMetal', [gx, 1.75, gz], 'y', 0.42, 0.24, 10, { colour: rgb(0xe8e2d4), decor: true });
  return sink.finish();
};

/**
 * The general store (a souk compound plot): one storey of stone or stucco behind a stepped false front with its sign,
 * a porch with a bench, the gas island under a canopy, a stone storeroom behind.
 */
const generalStore: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  // the store, its gas island and its storeroom fill the old souk compound's reach (no lane opens at its ends)
  const bb = ctx.bounds, PW = bb.maxX - bb.minX, PD = bb.maxZ - bb.minZ, bx = (bb.maxX + bb.minX) / 2, bz = (bb.maxZ + bb.minZ) / 2;
  const W = Math.max(9, PW - 4.6), D = Math.max(7.5, Math.min(9.5, PD - 5.2));
  const x0 = bx - PW / 2 + W / 2 + 0.2, z0 = bz + PD / 2 - D / 2 - 2.4;
  const wall: RegionalBucket = ctx.wallBucket === 'stone' || rng() < 0.5 ? 'stone' : 'plaster';
  const trim = pick(rng, TRIM), door = pick(rng, DOOR_PAINT);
  sink.placed(0, x0, 0, z0, () => {
    const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.6, y0: 0, h: 2.3 }];
    for (const u of [-W * 0.3, W * 0.3]) openings.push({ face: 'front', storey: 0, kind: 'window', u, w: 1.8, h: 1.6, y0: 0.7 });
    for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 0, D, { w: 0.8, h: 0.9, sill: 1.4, spacing: 2.8, margin: 1.2, max: 2 })) openings.push(o);
    const H = 3.5;
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.3, out: 0.05, bucket: 'stone' }, storeys: [{ h: H, wall }],
      roof: { kind: 'flat', pitchDeg: 0, eave: 0.05, verge: 0.05, thickness: 0.22, bucket: 'plaster', parapet: 0.35 }, gableBucket: wall,
      openings, chimneys: [], gutters: null, verge: null, reveal: wall === 'stone' ? 0.3 : 0.18,
    }, dialectOf(rng, trim, door, { lit: 0.45, leaf: 'glazed' }));
    frameCourse(sink, frame, 0.3);
    // the false front: the street wall carried up in a stepped parapet over the roof line
    const top = frame.eaveY + 0.22, step = 0.55 + rng() * 0.3;
    const zf = D / 2 - 0.25;
    // (its three tiers the wall's own masonry, their arrises worn: no bare boxes)
    const zm = (zf + D / 2) / 2, hz = (D / 2 - zf) / 2;
    chamferedBeam(sink, wall, 'x', -W / 2, W / 2, zm, top + 0.325, hz, 0.325, 0.02, {});
    chamferedBeam(sink, wall, 'x', -W * 0.32, W * 0.32, zm, top + 0.65 + step / 2, hz, step / 2, 0.02, {});
    chamferedBeam(sink, wall, 'x', -W * 0.14, W * 0.14, zm, top + 0.8 + step, hz, 0.15, 0.02, {});
    // (the looks lane, 2026-10-15; WORKLIST #26) each step of the false front capped by a coping of dressed stone, its
    // arrises worn round, a hand proud of the wall either side
    for (const [hx, yc] of [[W / 2, top + 0.65], [W * 0.32, top + 0.65 + step], [W * 0.14, top + 0.95 + step]] as const) {
      chamferedBeam(sink, 'stone', 'x', -hx - 0.06, hx + 0.06, (zf + D / 2) / 2, yc + 0.05, (D / 2 - zf + 0.12) / 2, 0.05, 0.025, { decor: true });
    }
    const f = frame.faces.front;
    faceBox(sink, 'structureWood', f, 0, top + 0.6, 0.04, W * 0.56, 0.7, 0.05, { colour: rgb(0xe8e1d0), decor: true });
    faceBox(sink, 'structureWood', f, 0, top + 0.66, 0.072, W * 0.46, 0.24, 0.02, { colour: rgb(0x9a2e24), decor: true });
    faceBox(sink, 'structureWood', f, 0, top + 0.38, 0.072, W * 0.3, 0.12, 0.02, { colour: rgb(0x2f3e5a), decor: true });
    // the porch, its bench and the hitching rail
    const depth = 2.1, py = H - 0.1;
    for (let k = 0; k <= 4; k++) {
      const u = -W / 2 + 0.3 + (W - 0.6) * k / 4;
      pole(sink, [u, 0, D / 2 + depth - 0.12], [u, py, D / 2 + depth - 0.12], 0.09, pick(look, JUNIPER), false);
    }
    const porch: RoofSpec = { kind: 'shed', pitchDeg: 7, eave: 0.12, verge: 0.15, thickness: 0.07, bucket: 'roof' };
    sink.placed(-Math.PI / 2, 0, 0, D / 2 + depth / 2, () => emitRoof(sink, roofGeometry(depth, W, py, porch), porch));
    // the porch deck: its sill log and the boards laid across the joists, each its own, a finger's gap between
    sink.span('structureWood', -W / 2 + 0.1, 0.0, D / 2 + 0.02, W / 2 - 0.1, 0.22, D / 2 + depth, { colour: shade(PLANK_GREY, 0.7) });
    for (let x = -W / 2 + 0.1, k = 0; x < W / 2 - 0.15; x += 0.21, k++) {
      const x1 = Math.min(W / 2 - 0.1, x + 0.2);
      chamferedBeam(sink, 'structureWood', 'z', D / 2 + 0.02, D / 2 + depth, (x + x1) / 2, 0.26, (x1 - x - 0.008) / 2, 0.04, 0.012,
        { colour: shade(PLANK_GREY, 0.88 + ((k * 7919) % 11) / 11 * 0.24), decor: true, uv: UV_MEMBER });
    }
    faceBox(sink, 'structureWood', f, -W * 0.3, 0.75, 0.42, 2.0, 0.08, 0.4, { colour: PLANK, decor: true });
    // (the integrity check, 2026-10-12: the bench's seat hung over the porch boards on nothing) its legs to the boards
    for (const e of [-0.9, 0.9]) faceBox(sink, 'structureWood', f, -W * 0.3 + e, 0.5, 0.42, 0.07, 0.44, 0.34, { colour: PLANK, decor: true });
  });
  // the gas island under its canopy east of the store
  const gx = bx + PW / 2 - 1.75, gz = bz + PD / 2 - 2.6;
  {
    sink.span('stone', gx - 0.6, -0.2, gz - 1.6, gx + 0.6, 0.18, gz + 1.6);
    for (const dz of [-1.1, 1.1]) pole(sink, [gx, 0.18, gz + dz], [gx, 3.6, gz + dz], 0.09, IRON, false);
    chamferedBeam(sink, 'structureMetal', 'z', gz - 2.0, gz + 2.0, gx, 3.725, 1.6, 0.125, 0.03, { colour: rgb(0xe2ddd0) });
    chamferedBeam(sink, 'structureMetal', 'z', gz - 2.02, gz + 2.02, gx, 3.67, 1.62, 0.05, 0.015, { colour: rgb(0x9a2e24), decor: true });
    for (const dz of [-0.45, 0.45]) {
      sink.span('structureMetal', gx - 0.25, 0.18, gz + dz - 0.2, gx + 0.25, 1.6, gz + dz + 0.2, { colour: pick(look, [rgb(0xb8302a), rgb(0x2f6a9a), rgb(0xd8d2c4)]) });
      sink.cylinder('structureMetal', [gx, 1.6, gz + dz], 'y', 0.3, 0.18, 8, { colour: rgb(0xe8e2d4), decor: true });
    }
  }
  // the storeroom behind: a lean stone box under a tin shed roof
  const sw = Math.min(6.5, W * 0.6), sd = Math.max(2.4, Math.min(6.0, (z0 - D / 2) - (bz - PD / 2) - 0.25));
  {
    sink.placed(0, x0 - W / 2 + sw / 2 + 0.3, 0, z0 - D / 2 - sd / 2 - 0.05, () => {
      const sf = buildHouse(sink, {
        w: sw, d: sd, plinth: null, storeys: [{ h: 2.5, wall: 'stone' }],
        roof: { kind: 'flat', pitchDeg: 0, eave: 0.15, verge: 0.15, thickness: 0.08, bucket: 'roof' }, gableBucket: 'stone',
        openings: [{ face: 'left', storey: 0, kind: 'door', u: 0, w: 0.9, y0: 0, h: 1.95 }], chimneys: [], gutters: null, verge: null, reveal: 0.25,
      }, dialectOf(rng, trim, door, { lit: 0 }));
      frameCourse(sink, sf, 0.24);
    });
  }
  return sink.finish();
};

/**
 * The roadside stands (a market row plot): three booths of juniper posts and plywood under brush and plywood shade,
 * their counters laid with the jewellers' boards, the painted signs along the top.
 */
const roadsideStands: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  // (props census #23, the looks lane 2026-10-15) member-built in souqs.ts, in the old row's reach (its bounds' centre)
  sink.placed(0, (ctx.bounds.maxX + ctx.bounds.minX) / 2, 0, (ctx.bounds.maxZ + ctx.bounds.minZ) / 2, () => {
    navajoStands(sink, ctx, { pole, juniper: JUNIPER, plank: PLANK });
  });
  return sink.finish();
};
/**
 * The chapter's water tank (a minaret plot): a squat galvanised steel tank under a shallow cone roof on a trestle of
 * four straight steel legs, X-braced, the walkway round the tank's floor, a ladder up one leg; rust streaks down from
 * its seams. (Gauntlet wave 104: the first tank, tall and pale with a red band on tapering legs, read as a seaside
 * lighthouse; this one is wider than its legs and the colour of the iron.)
 */
const waterTank: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant;
  const b = ctx.bounds, P = Math.max(3.2, Math.min(b.maxX - b.minX, b.maxZ - b.minZ) - 0.2);
  const legH = 7.2 + ctx.rng() * 1.2, tankR = Math.min(2.4, P / 2 + 0.55), tankH = 3.4;
  const steel = pick(look, [GALV, rgb(0x8f9390), rgb(0x9a9a92)]);
  const lb = P / 2 - 0.15, lt = lb * 0.92;
  sink.placed(0, (b.maxX + b.minX) / 2, 0, (b.maxZ + b.minZ) / 2, () => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      sink.member('structureMetal', [sx * lb, -0.4, sz * lb], [sx * lt, legH, sz * lt], 0.2, 0.2, [sx, 0, 0], { colour: shade(steel, 0.78), exposed: true }, 0);
      // its concrete pier (dressing)
      sink.span('stone', sx * lb - 0.35, -0.3, sz * lb - 0.35, sx * lb + 0.35, 0.4, sz * lb + 0.35, { decor: true, shade: 0.8 });
    }
    groundCourse(sink, -lb, -lb, lb, lb, 0, false, 0.7);
    // the X braces between the legs, two bays to a face, and the girt at the bay line (dressing)
    const at = (y: number) => lb + (lt - lb) * y / legH;
    for (const [y0, y1] of [[0.3, legH * 0.5], [legH * 0.5, legH - 0.25]] as const) {
      const r0 = at(y0), r1 = at(y1);
      for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]] as const) {
        const out: Vec3 = [ax === bx ? ax : 0, 0, az === bz ? az : 0];
        sink.member('structureMetal', [ax * r0, y0, az * r0], [bx * r1, y1, bz * r1], 0.05, 0.05, out, { colour: shade(steel, 0.7), decor: true, exposed: true }, 0);
        sink.member('structureMetal', [bx * r0, y0, bz * r0], [ax * r1, y1, az * r1], 0.05, 0.05, out, { colour: shade(steel, 0.7), decor: true, exposed: true }, 0);
        sink.member('structureMetal', [ax * r1, y1, az * r1], [bx * r1, y1, bz * r1], 0.08, 0.08, [0, 1, 0], { colour: shade(steel, 0.75), decor: true, exposed: true }, 0);
      }
    }
    // the tank: its floor's ring beam, the shell, the seams and the rust run down from them, the shallow cone roof
    sink.cylinder('structureMetal', [0, legH, 0], 'y', 0.3, tankR * 0.82, 20, { colour: shade(steel, 0.72) }, tankR);
    sink.cylinder('structureMetal', [0, legH + 0.3, 0], 'y', tankH, tankR, 24, { colour: steel });
    for (let k = 1; k < 4; k++) sink.cylinder('structureMetal', [0, legH + 0.3 + tankH * k / 4, 0], 'y', 0.06, tankR + 0.015, 24, { colour: shade(steel, 0.82), decor: true }, tankR + 0.015, false);
    for (let k = 0; k < 5; k++) {
      const a = look() * Math.PI * 2, len = 0.8 + look() * 1.6, top = legH + 0.3 + tankH * (0.5 + look() * 0.5);
      const f: Face = { origin: [Math.cos(a) * (tankR + 0.012), 0, Math.sin(a) * (tankR + 0.012)], u: [Math.sin(a), 0, -Math.cos(a)], out: [Math.cos(a), 0, Math.sin(a)], width: 1 };
      // (props census #5: a streak 12-22 cm wide read as a dark plate on the tank) the rust runs down in threads under 5 cm
      // wide, the streak's width their spread
      const spread = 0.12 + look() * 0.1, colour = shade(RUSTY, 0.9 + look() * 0.2);
      for (const [du, k] of [[-0.5, 1], [0, 0.8], [0.5, 0.6]] as const) {
        faceBox(sink, 'structureMetal', f, du * spread, top - len * k / 2, 0.004, 0.035, len * k, 0.004, { colour, decor: true, fine: true });
      }
    }
    sink.cylinder('structureMetal', [0, legH + 0.3 + tankH, 0], 'y', 0.6, tankR + 0.06, 24, { colour: shade(steel, 0.9) }, 0.3);
    sink.cylinder('structureMetal', [0, legH + 0.9 + tankH, 0], 'y', 0.35, 0.18, 8, { colour: shade(steel, 0.8), decor: true }, 0.12);
    // the walkway round the tank's floor and its rail
    sink.cylinder('structureMetal', [0, legH + 0.22, 0], 'y', 0.06, tankR + 0.6, 24, { colour: IRON, decor: true });
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2;
      sink.member('structureMetal', [Math.cos(a) * (tankR + 0.55), legH + 0.28, Math.sin(a) * (tankR + 0.55)], [Math.cos(a) * (tankR + 0.55), legH + 1.2, Math.sin(a) * (tankR + 0.55)],
        0.03, 0.03, [Math.cos(a), 0, Math.sin(a)], { colour: IRON, decor: true, exposed: true, fine: true }, 0);
    }
    // the ladder up one leg to the walkway
    for (const dz of [-0.22, 0.22]) sink.member('structureMetal', [lb + 0.12, 0.0, dz], [lt + 0.12, legH + 0.25, dz], 0.04, 0.04, [1, 0, 0], { colour: IRON, decor: true, exposed: true }, 0);
  });
  return sink.finish();
};

/**
 * The BIA day school (a factory plot): one long storey of rough-laid red sandstone on a footing under a low hipped
 * roof of galvanised or rusting iron, tall sash windows in a strict rhythm under stone lintels, a gabled porch over the
 * steps on the front end, a stovepipe flue at each end; the flagpole by the steps. (Titan round 3, gauntlet wave 119:
 * the two-storey block under a green hip with a bell cupola read as "a red-brick schoolhouse" from somewhere else; the
 * reservation's day schools of the 1930s-50s are long single storeys of local stone under tin.)
 */
const daySchool: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  // the school fills the old factory's reach (its bounds): its back wall on the back edge, its porch to the front
  const bb = ctx.bounds;
  const W = Math.max(9, bb.maxX - bb.minX - 1.0), D = Math.max(14, bb.maxZ - bb.minZ - 3.1);
  const trim = rgb(0xd8d2c4), door = pick(rng, [rgb(0x3d8a86), rgb(0x8a3a2c), rgb(0x3f6f99)]);
  const roofPaint = pick(rng, [GALV, rgb(0x8f9390), RUSTY]);
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.7, y0: 0, h: 2.6 }];
  for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 0, D, { w: 1.05, h: 1.9, sill: 0.9, spacing: 2.4, margin: 1.2 })) openings.push(o);
  for (const o of windowRhythm('front', 0, W, { w: 1.0, h: 1.8, sill: 0.9, spacing: 2.6, margin: 1.2, max: 3, avoid: [[-1.2, 1.2]] })) openings.push(o);
  for (const o of windowRhythm('back', 0, W, { w: 1.0, h: 1.8, sill: 0.9, spacing: 2.6, margin: 1.2, max: 3 })) openings.push(o);
  const style: WindowStyle = { frame: trim, frameWidth: 0.07, frameOut: 0.05, bars: 'six', surround: { bucket: 'stone', width: 0.16, out: 0.05, lintel: 0.28 },
    sill: { bucket: 'stone', out: 0.08 }, shutters: null };
  sink.placed(0, (bb.maxX + bb.minX) / 2, 0, bb.minZ + 0.45 + D / 2, () => {
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.55, out: 0.08, bucket: 'stone' }, storeys: [{ h: 3.9, wall: 'stone' }],
    roof: { kind: 'hip', pitchDeg: 22, eave: 0.55, verge: 0.55, thickness: 0.08, bucket: 'structureMetal', ridge: 'saddle' }, roofColour: roofPaint,
    gableBucket: 'stone', openings,
    chimneys: [],
    gutters: { colour: shade(roofPaint, 0.8) }, verge: null, reveal: 0.38, rafters: rgb(0x6a5a48),
  }, {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, style, rng, 0.55),
    door: (s, face, o, y0, fr) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: door, frame: { bucket: 'stone', width: 0.22, out: 0.08, arch: true },
      transom: true, steps: { bucket: 'stone' }, leafKind: 'panel' }, fr.floors[o.storey] + o.y0),
  });
  frameCourse(sink, frame, 0.62);
  // the porch on the front end: two posts, a gabled roof over the steps, its gable boarded white
  const pd = 2.4, pw = 3.6, py = 3.5;
  for (const s of [-1, 1]) sink.span('structureWood', s * (pw / 2 - 0.15) - 0.13, 0.0, D / 2 + pd - 0.3, s * (pw / 2 - 0.15) + 0.13, py, D / 2 + pd - 0.04, { colour: trim });
  const pr: RoofSpec = { kind: 'gable', pitchDeg: 30, eave: 0.2, verge: 0.15, thickness: 0.08, bucket: 'structureMetal', ridge: null };
  sink.placed(Math.PI / 2, 0, 0, D / 2 + pd / 2, () => emitRoof(sink, roofGeometry(pd + 0.1, pw, py, pr), pr, roofPaint));
  {
    const rise = (pw / 2) * Math.tan(30 * Math.PI / 180);
    sink.prism('structureWood', [[0, py + rise, D / 2 + pd - 0.05], [pw / 2, py, D / 2 + pd - 0.05], [-pw / 2, py, D / 2 + pd - 0.05]], [0, 0, -1], 0.08, { colour: trim, decor: true });
  }
  // the stovepipe flues through the tin at each end of the classrooms
  for (const end of [-1, 1]) {
    const fx = W * 0.22 * end, fz = D * 0.3 * end;
    const top = frame.roof.topAt(fx, fz) ?? frame.roof.ridgeTopY;
    sink.cylinder('structureMetal', [fx, top - 0.3, fz], 'y', 1.5, 0.1, 8, { colour: STOVEPIPE, decor: true });
    sink.cylinder('structureMetal', [fx, top + 1.2, fz], 'y', 0.14, 0.2, 8, { colour: STOVEPIPE, decor: true }, 0.04);
  }
  // the flagpole by the steps
  sink.cylinder('structureMetal', [pw / 2 + 1.0, 0, D / 2 + pd + 0.6], 'y', 9.5, 0.06, 8, { colour: rgb(0xd8d8d4), decor: true }, 0.035);
  });
  return sink.finish();
};

/**
 * The trading post's wool and hay barn (a warehouse plot): a dry-laid sandstone base, walls of corrugated iron over it,
 * a low gable of the same, big plank sliding doors on the gable ends, a loading dock in front, small windows high up.
 */
const woolBarn: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  // the barn fills the old warehouse's reach (its measured bounds, dock and canopy included): a shorter barn opened a
  // tank-wide gap to its neighbour that the bots drove through (Titan's pacing: three of four matches over by 160 s)
  const b = ctx.bounds;
  const W = Math.max(10, Math.min(17, b.maxX - b.minX - 0.3)), D = Math.max(16, Math.min(28, b.maxZ - b.minZ - 1.2));
  const xc = (b.maxX + b.minX) / 2, zc = b.minZ + 0.15 + D / 2;
  const baseH = 1.1 + rng() * 0.3, H = 4.8 + rng() * 0.6;
  // (props census #4, lane B 2026-10-14; the judges: "plank doors and glass laid on the tin") the shared sheet hall
  // (hall.ts): the corrugated iron on its sandstone base at a lorry bed's height, the plank leaves sliding on their
  // tracks over openings cut in both gables onto the barn's floor and frames, its lights high in the sides; the dock
  // along the front door, the wool bales stacked against the north side
  sink.placed(0, xc, 0, zc, () => {
    const tin = pick(rng, CLADDING);
    sheetHall(sink, { w: W, d: D, eave: H, pitchDeg: 17, kerb: baseH, livery: tin, doorLivery: shade(PLANK_GREY, 0.95 + look() * 0.1), trim: shade(tin, 0.7),
      doors: 'sliding', leaf: 'plank', doorW: Math.min(4.2, W * 0.36), doorH: 3.6, open: look() * 0.5, backGate: true, backDoor: null,
      clerestory: true, roofLights: false, ridgeVent: false, gutters: false, mobile: ctx.tier === 'mobile' }, look);
    groundCourse(sink, -W / 2, -D / 2, W / 2, D / 2, 0, false, 0.9);
    sink.span('stone', -3.0, -0.4, D / 2 - 0.05, 3.0, baseH, D / 2 + 0.9);
    // bales stacked against the north side
    if (ctx.tier !== 'mobile') {
      for (let k = 0; k < 6; k++) {
        const x = -W / 2 - 0.6, z = -D / 2 + 1.5 + k * 1.1;
        for (let r = 0; r < (k % 3 === 0 ? 3 : 2); r++) sink.span('straw', x - 0.45, r * 0.45, z - 0.5, x + 0.45, r * 0.45 + 0.45, z + 0.5, { decor: true });
      }
    }
  });
  return sink.finish();
};
/**
 * An abandoned camp (a ruin plot): either a roofless stone house, its walls broken down to the window sills in places,
 * a fallen lintel and a doorway, or a hogan whose roof has fallen in.
 */
const ruin: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  // the ruin fills the old ruin's reach (its bounds)
  const bb = ctx.bounds, cx = (bb.maxX + bb.minX) / 2, cz = (bb.maxZ + bb.minZ) / 2;
  const W = Math.max(5.0, bb.maxX - bb.minX - 0.6), D = Math.max(6.0, bb.maxZ - bb.minZ - 0.6);
  if (rng() < 0.4) {
    // the fallen hogan, the logs of its roof stacked in cords at the plot's ends
    const R = Math.max(2.4, Math.min(3.45, Math.min(W, D) / (2 * Math.cos(OCT / 2)) - 0.12));
    const door = eastSide(ctx.yaw);
    sink.placed(0, cx, 0, cz, () => hoganBody(sink, rng, look, { r: R, door, fallen: true }));
    endStacks(sink, bb, cz, R, door, look, 0.95);
    return sink.finish();
  }
  // (props census #7, lane B 2026-10-14; the judges: "span slices to random tops round a slab") the ruin grammar: the
  // stone house's own walls broken down toward the middle of each run and standing at the corners' piers, its doorway
  // and windows cut through, the vigas and the mud roof's earth fallen in
  sink.placed(0, cx, 0, cz, () => {
    const H = 2.6;
    const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.0, y0: 0, h: 2.0 }];
    for (const face of ['right', 'left', 'back'] as const) openings.push({ face, storey: 0, kind: 'window', u: (rng() - 0.5) * 1.6, w: 0.8, y0: 0.9, h: 0.9 });
    const head = (): RuinHead => ({ a: H * (0.8 + rng() * 0.25), b: H * (0.8 + rng() * 0.25), at: 0.3 + rng() * 0.4, dip: 0.45 + rng() * 0.3, ragged: 0.3 });
    const r = ruinHouse(sink, {
      w: W, d: D, t: 0.42, wall: 'stone', plinth: { h: 0.25, out: 0.05, bucket: 'stone' }, storeys: [H], openings,
      heads: { front: head(), right: head(), back: head(), left: head() }, stub: 0.4,
      lintel: { bucket: 'structureWood', colour: pick(look, JUNIPER) }, roof: { bucket: 'plaster2', piece: [0.8, 0.6, 0.08] }, timber: pick(look, JUNIPER),
      mobile: ctx.tier === 'mobile',
    }, rng, look);
    groundCourse(sink, -W / 2, -D / 2, W / 2, D / 2, 0, false, 0.6);
    // the vigas across the floor, each from the floor up onto the heap
    for (let k = 0; k < 2; k++) {
      const z = (k - 0.5) * D * 0.4, x1 = W / 2 - 0.6;
      sink.member('structureWood', [-W / 2 + 0.6, r.floor, z + (rng() - 0.5)], [x1, r.restOn(x1, z) + 0.1, z + (rng() - 0.5) * 1.5], 0.22, 0.22, [0, 1, 0],
        { colour: pick(look, JUNIPER), decor: true, exposed: true }, 0);
    }
  });
  return sink.finish();
};

export const NAVAJO_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  adobe: hogan,
  compound: camp,
  caravanserai: tradingPost,
  compoundSouk: generalStore,
  marketRow: roadsideStands,
  watertower: windmill,
  minaret: waterTank,
  factory: daySchool,
  warehouse: woolBarn,
  depot: equipmentShed,
  containerRow: trailer,
  gantry: hayShed,
  ruin,
  // the yard's outbuilding by each hogan
  ramada,
  // a ranch house wherever a plan names a cottage
  cottage: ranchIn,
});

export const NAVAJO_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'navajo',
  region: 'Monument Valley, Four Corners (the Navajo Nation round Oljato and Goulding\'s): log-and-earth hogans facing east, a sandstone trading post, stone ranch houses under tin, juniper corrals and windmills',
  surfaces: {
    // corrugated iron, galvanised and rusting; the valley's red de Chelly sandstone laid as field stone in mud
    // (Titan round 3, gauntlet wave 119: the coursed sandstone's even blocks read as red brick, "a red-brick
    // schoolhouse", "oversized tiled block textures": Goulding's and the valley's stone houses are rough-laid field
    // stone; round 3b: the rubble kind's pale joints still drew a brick grid at range, so big blocks in red mud mortar)
    roof: { kind: 'sheet', tint: [0.66, 0.66, 0.63] },
    stone: { kind: 'fieldstone', tint: [0.72, 0.47, 0.35] },
    sourced: { plaster: false, wood: true },
    // (the facades lane, round 11; waves 319/320: the walls' procedural canvas read as "speckle", "sponge", "cork",
    // "camouflage noise": its 6 cm bumps shade as dots from the street, as Steinburg's did before round 8) the walls
    // painted as the region renders them (regionalSurfaces.ts paintLimeRender), every family under the kit's and the map's
    // tones
    render: { kind: 'limeRender', seed: 0x5c0d },
    tones: {
      // stucco the colour of the sand, the red earth of the hogan roofs and the mud chinking, a white-painted trim
      plaster: (_h, s, l) => [0.075, Math.min(1, s * 0.9 + 0.2), Math.min(1, l * 1.02 + 0.1)],
      plaster2: (_h, s, l) => [0.045, Math.min(1, s * 1.1 + 0.34), Math.min(1, l * 0.86 + 0.05)],
      plaster3: (_h, s, l) => [0.11, Math.min(1, s * 0.3), Math.min(1, l * 1.25 + 0.12)],
    },
  },
  builders: NAVAJO_BUILDERS,
  // the desert's dry air: little splash or damp at the wall foot, no moss; the red earth and the stucco a shade apart
  weather: {
    plaster: [[1, 1, 1], [1.04, 1.0, 0.95], [0.95, 0.92, 0.87], [1.02, 0.98, 0.94]],
    stone: [[1, 1, 1], [0.94, 0.9, 0.87], [1.05, 1.0, 0.95], [0.9, 0.87, 0.85]],
    roof: [[1, 1, 1], [0.9, 0.84, 0.78], [1.04, 1.0, 0.96], [0.84, 0.78, 0.72]],
    damp: 0.4, moss: 0.03,
  },
  wear: 0.15,
  // the hogans' yards: a brush corral round the camp's ground, a gate, the shade house in a corner
  yard: { kinds: ['adobe'], fence: 'fencewattle', gate: 'gatewattle', shed: 'ramada', shedSize: [4.0, 3.2], garden: false },
});
