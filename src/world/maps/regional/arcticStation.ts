// src/world/maps/regional/arcticYard.ts — the arctic kit's industrial-yard builders (props census #3, lane B
// 2026-10-14; extracted from arctic.ts as they were, then rebuilt here): the radar tower on the water tower's plot and
// the Jamesway hut on the container row's plot. The kit's shared parts (the modules, their doors, stairs and windows,
// the radome, the banks) stay in arctic.ts.
import { LocalFrame, PartSink, faceBox, facePoint, rgb, shade, type EmitOptions, type Face, type Rgb, type Vec3 } from './geometry.ts';
import { buildHouse, holedPolygon, type HoleRect, type HouseDialect, type Opening } from './house.ts';
import { recordLattice, type LatticeReading, type LatticeSpec } from './lattice.ts';
import { recordShed } from './shedFall.ts';
import { doorUnit, windowUnit } from './openings.ts';
import { doorCanopy, facadeOn } from './facade.ts';
import { wallLantern } from './dressing.ts';
import type { RegionalBuilder } from './types.ts';
import { angleMember, bandRing, chamferedSection, iBeam, panelSlab, pier, sectionMember, tubeMember } from './steelMembers.ts';
import { GALV, OLIVE, PLY, STEEL_DARK, WINDOW, bank, boxFace, clamp, radome, uvOffset, wallsIn, wave } from './arctic.ts';

/**
 * A four-legged lattice frame (lattice.ts latticeFrame, member for member) in steel sections: the legs, girts and X braces
 * angles, the pads round concrete piers; recorded for the damage reading as latticeFrame records its own.
 */
function angleLattice(sink: PartSink, spec: LatticeSpec, crown: LatticeReading['crown'] = null): void {
  const cx = spec.cx ?? 0, cz = spec.cz ?? 0;
  const corners: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const at = (k: number, y: number): Vec3 => {
    const t = (y - spec.y0) / Math.max(1e-6, spec.y1 - spec.y0), half = spec.foot + (spec.head - spec.foot) * t;
    return [cx + corners[k][0] * half, y, cz + corners[k][1] * half];
  };
  const opts = { ...(spec.colour ? { colour: spec.colour } : {}) };
  const legs: Array<{ foot: Vec3; head: Vec3 }> = [];
  for (let k = 0; k < 4; k++) {
    const foot = at(k, spec.y0), head = at(k, spec.y1);
    const under: Vec3 = [foot[0] + (foot[0] - head[0]) * 0.4 / Math.max(1e-6, spec.y1 - spec.y0), -0.4, foot[2] + (foot[2] - head[2]) * 0.4 / Math.max(1e-6, spec.y1 - spec.y0)];
    // (the heel of each leg's angle to the frame's outside corner)
    angleMember(sink, spec.bucket, spec.pad ? foot : under, head, spec.size, spec.size * 0.16, opts, 'b', [-corners[k][0], 0, -corners[k][1]]);
    if (spec.pad) pier(sink, spec.pad.bucket, foot[0], foot[2], spec.pad.size * 0.56, -0.4, spec.pad.top, 0, { decor: true, shade: 0.9 }, 8);
    legs.push({ foot, head });
  }
  const girts: number[] = [];
  const n = Math.max(1, spec.panels);
  const levels = Array.from({ length: n + 1 }, (_, i) => spec.y0 + (spec.y1 - spec.y0) * (i / n));
  for (let i = 1; i <= n; i++) girts.push(levels[i]);
  sink.dressing(!!spec.mobile, () => {
    for (let i = 1; i <= n; i++) for (let k = 0; k < 4; k++) {
      angleMember(sink, spec.bucket, at(k, levels[i]), at((k + 1) % 4, levels[i]), spec.girt, spec.girt * 0.18, { ...opts, decor: true }, 'none', [0, 1, 0]);
    }
    if (spec.braces !== false) for (let i = 0; i < n; i++) {
      const ya = levels[i] + (i === 0 ? 0.3 : 0), yb = levels[i + 1];
      for (let k = 0; k < 4; k++) {
        const j = (k + 1) % 4;
        angleMember(sink, spec.bucket, at(k, ya), at(j, yb), spec.brace, spec.brace * 0.18, { ...opts, decor: true }, 'none');
        angleMember(sink, spec.bucket, at(j, ya), at(k, yb), spec.brace, spec.brace * 0.18, { ...opts, decor: true }, 'none');
      }
    }
  });
  recordLattice(sink, legs, girts, spec.size, spec.bucket, spec.colour ?? null, crown);
}

/**
 * The radar tower (the water tower's plot): a four-legged lattice tower tapering to a railed platform under the short
 * range radar's radome, the cable ladder up one leg, the equipment hut at its foot.
 */
export const radarTower: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const mobile = ctx.tier === 'mobile';
  const fit = wallsIn(ctx, 0.1, 0.1);
  const B = Math.min(fit.w, fit.d) / 2 - 0.15, T = Math.max(1.0, B * 0.42), H = clamp(ctx.bounds.maxY - 1.8, 9, 13);
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    // (props census #3, lane B 2026-10-14; the judges: "the equipment hut a plain plaster2 span with no door, window or
    // vent; the cable ladder not built; the open lattice falls as solid metal-clad drums") the lattice on its footings
    // (lattice.ts: legs, girts and X braces in every panel), recorded so it folds over as its members with the radome
    // as its crown; the cable ladder up the +x face; the hut a building with its door and window cut
    // (the looks lane's r2 sweep, 2026-10-16: square bars) the frame laid in hot-rolled angles on round piers (angleLattice:
    // lattice.ts latticeFrame's frame and its record, in steel sections)
    angleLattice(sink, { foot: B, head: T, y0: 0.25, y1: H, size: 0.2, girt: 0.09, brace: 0.09, panels: 4, bucket: 'structureMetal', colour: GALV,
      pad: { bucket: 'stone', size: 0.9, top: 0.25 }, mobile },
      { x0: -T - 1.6, x1: T + 1.6, y0: H, y1: H + 0.6 + 2 * clamp(T + 0.4, 1.4, 2.4), z0: -T - 1.6, z1: T + 1.6, bucket: 'structureMetal', tint: GALV });
    sink.dressing(mobile, () => {
      const at = (y: number) => B + (T - B) * ((y - 0.25) / (H - 0.25));
      for (const dz of [-0.2, 0.2]) sink.member('structureMetal', [at(0.4) + 0.14, 0.4, dz], [at(H) + 0.14, H, dz], 0.035, 0.03, [1, 0, 0], { colour: STEEL_DARK, decor: true, exposed: true }, 0);
      for (let y = 0.7; y < H - 0.1; y += 0.32) sink.span('structureMetal', at(y) + 0.13, y - 0.012, -0.2, at(y) + 0.155, y + 0.012, 0.2, { colour: STEEL_DARK, decor: true, fine: true });
      // the cable tray up the -x face beside it
      sink.member('structureMetal', [-(at(0.4) + 0.1), 0.4, 0], [-(at(H) + 0.1), H, 0], 0.14, 0.04, [-1, 0, 0], { colour: shade(STEEL_DARK, 1.2), decor: true, exposed: true }, 0);
    });
    // the platform, its rail, and the radome on it
    sink.span('structureMetal', -T - 0.5, H, -T - 0.5, T + 0.5, H + 0.18, T + 0.5, { colour: GALV });
    if (!mobile) for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]] as const) {
      const r = T + 0.45;
      sink.member('structureMetal', [a[0] * r, H + 1.0, a[1] * r], [b[0] * r, H + 1.0, b[1] * r], 0.05, 0.05, [0, 1, 0], { colour: STEEL_DARK, decor: true, exposed: true });
      // (the connectivity sweep, 217: the rail stood on nothing) its posts from the platform, at the corner and mid-side
      for (const t of [0, 0.5]) {
        const px = (a[0] + (b[0] - a[0]) * t) * r, pz = (a[1] + (b[1] - a[1]) * t) * r;
        sink.member('structureMetal', [px, H + 0.16, pz], [px, H + 1.03, pz], 0.05, 0.05, [1, 0, 0], { colour: STEEL_DARK, decor: true, exposed: true }, 0.025);
      }
    }
    radome(sink, 0, H + 0.6, 0, clamp(T + 0.4, 1.4, 2.4), 14);
    // the equipment hut at the foot between two legs: a framed insulated hut on its pad, its steel door and a window cut,
    // a louvred vent and the cable entry, a flat roof with its fascia
    sink.placed(0, 0, 0, -B + 0.9, () => {
      sink.span('stone', -1.25, -0.4, -0.95, 1.25, 0.15, 0.95, { shade: 0.85 });
      sink.paint = null;
      const hut = buildHouse(sink, {
        w: 2.2, d: 1.6, plinth: null, storeys: [{ h: 2.3, wall: 'plaster2' }],
        roof: { kind: 'flat', pitchDeg: 0, eave: 0.1, verge: 0.1, thickness: 0.15, bucket: 'roof' }, gableBucket: 'plaster2',
        openings: [{ face: 'front', storey: 0, kind: 'door', u: -0.35, w: 0.85, y0: 0.15, h: 1.95 }, { face: 'right', storey: 0, kind: 'window', u: 0, w: 0.6, y0: 1.1, h: 0.5 }],
        chimneys: [], gutters: null, verge: null, reveal: 0.1,
      }, {
        window: (s2, face, o, y0) => windowUnit(s2, face, o.u, y0 + o.y0, o.w, o.h, WINDOW, ctx.rng, 0.3),
        door: (s2, face, o, y0) => doorUnit(s2, face, o.u, y0 + o.y0, o.w, o.h, { leaf: STEEL_DARK, frame: { bucket: 'structureMetal', width: 0.08, out: 0.04, colour: STEEL_DARK }, steps: { bucket: 'stone' }, leafKind: 'panel' }),
      });
      const f = hut.faces.front;
      // (the r2 sweep: a dark plate stuck on the wall) the louvred vent a weather hood standing off the wall, its blades
      // across its open front
      faceBox(sink, 'structureMetal', f, 0.6, 1.7, 0.08, 0.45, 0.35, 0.16, { colour: shade(GALV, 0.8), decor: true });
      for (let y = 1.58; y < 1.85; y += 0.07) faceBox(sink, 'structureMetal', f, 0.6, y, 0.165, 0.4, 0.025, 0.02, { colour: GALV, decor: true, fine: true });
      sink.cylinder('structureMetal', [0.9, 2.3, -0.5], 'y', 0.6, 0.06, 6, { colour: STEEL_DARK, decor: true });
    });
  });
  return sink.finish();
};

/**
 * The Jamesway hut (the container row's plot): an arched hut of insulated canvas over a timber floor on sleepers, its
 * plywood end walls with the door and a small window, the vestibule at its entrance and the boardwalk along its side.
 * Round 5 (gauntlet wave 224: "a uniform green quilted grid texture with no fabric sag, vestibules or weathering, and sits
 * on a brown sill on bare snow with no drift ... a giant green caterpillar"): the canvas in painted sheet (the timber print
 * read as a quilted grid), sagging a hand's breadth between the ribs, each bay its own sun-faded olive; the snow banked
 * along its windward side and against its far end.
 */
export const jamesway: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, mobile = ctx.tier === 'mobile';
  const bb = ctx.bounds;
  const walk = clamp((bb.maxZ - bb.minZ) * 0.22, 1.2, 2.0);
  const x0 = bb.minX + 0.15, x1 = bb.maxX - 0.15, z0 = bb.minZ + 0.15, zH = bb.maxZ - 0.15 - walk;
  const r = (zH - z0) / 2, zc = (z0 + zH) / 2, fl = 0.5, vest = clamp((x1 - x0) * 0.12, 1.6, 2.4);
  const timber = shade(PLY, 0.62);
  // (props census #3, lane B 2026-10-14; the judges: "the floor platform ONE solid wood span ... the vestibule ONE span box
  // under a slab roof, its door a slab standing proud with no opening ... the end window a unit stuck on the plywood")
  // the floor: its deck on joists on sleepers laid on the snow, the deck the structure
  // (the looks lane's r2 sweep, 2026-10-16: plain boxes carried 65 % of the hut) the deck in its plywood sheets, the
  // sleepers and the joists sawn timbers with their arrises eased
  panelSlab(sink, 'wood', x0, 0.36, z0, x1, fl, zH, 1.22, () => [1, 1, 1], [1, 1, 1]);
  sink.dressing(mobile, () => {
    for (let z = z0 + 0.25; z < zH - 0.1; z += 1.1) sectionMember(sink, 'structureWood', [x0 - 0.1, -0.005, z], [x1 + 0.1, -0.005, z], chamferedSection(0.2, 0.29, 0.03), { colour: shade(timber, 0.8), decor: true });
    for (let x = x0 + 0.2; x < x1; x += 0.6) sectionMember(sink, 'structureWood', [x, 0.25, z0 + 0.05], [x, 0.25, zH - 0.05], chamferedSection(0.1, 0.22, 0.02), { colour: timber, decor: true });
    // (the deck's board joints as lines on its top, in board lengths of 3 m: the integrity gate reads a 4 mm line 15 m
    // long as a sliver)
    const jc = { colour: shade(timber, 0.7), decor: true, fine: true };
    for (let z = z0 + 0.12; z < zH; z += 0.15) for (let xa = x0; xa < x1 - 0.01; xa += 3) {
      const xb = Math.min(x1, xa + 3);
      sink.quad('structureWood', [xa, fl + 0.002, z - 0.002], [xa, fl + 0.002, z + 0.002], [xb, fl + 0.002, z + 0.002], [xb, fl + 0.002, z - 0.002], jc);
    }
  });
  // the canvas from the far end to the vestibule, bay by bay between the ribs (in the vertex-coloured steel bucket)
  const vx0 = x1 - vest;
  const bays = Math.max(1, Math.round((vx0 - x0) / 1.2)), bayW = (vx0 - x0) / bays, sag = 0.08;
  for (let k = 0; k < bays; k++) {
    const xa = x0 + k * bayW, tone = shade(OLIVE, 0.88 + 0.24 * wave(k * 1.7, zc));
    sink.cylinder('structureMetal', [xa, fl, zc], 'x', bayW / 2, r, 10, { colour: tone }, r - sag, false, -Math.PI / 2, Math.PI);
    sink.cylinder('structureMetal', [xa + bayW / 2, fl, zc], 'x', bayW / 2, r - sag, 10, { colour: tone }, r, false, -Math.PI / 2, Math.PI);
  }
  // (the r2 sweep: its collapse read the vestibule's house alone and laid a heap over a fifth of the hut) the hut recorded
  // as an open shed on its rib feet (shedFall.ts): it racks over, its canvas down in lengths over the buckled ribs on its
  // floor, its plywood ends down and leaning
  sink.placed(Math.PI / 2, (x0 + vx0) / 2, 0, zc, () => {
    const D = vx0 - x0, posts: Array<[number, number, number, number]> = [];
    for (let k = 0; k <= bays; k++) for (const side of [-1, 1]) posts.push([side * (r - 0.05), -D / 2 + k * (D / bays), fl, fl + r * 0.6]);
    recordShed(sink, posts.map(([x, z, f, h]) => ({ foot: [x, f, z] as Vec3, head: [x, h, z] as Vec3 })), {
      W: 2 * r, D, pitchDeg: 38, eaveY: fl + r * 0.55, eave: 0.05, verge: 0.05, deck: 0.04, post: 0.1, posts, pad: null,
      timber: shade(OLIVE, 0.75), boards: shade(OLIVE, 1.25), boardW: 0.6, back: false, ends: true,
      roof: { bucket: 'structureMetal', colour: OLIVE, shape: 'sheet' }, stone: null, pile: 0, lift: fl, gable: true,
    });
  });
  // the far end wall in plywood with its window cut through it; the entrance end closed round the vestibule
  const endW: Face = { origin: [x0 + 0.06, 0, zc], u: [0, 0, 1], out: [-1, 0, 0], width: 2 * r };
  const pts: Array<[number, number]> = [];
  for (let k = 0; k <= 10; k++) { const a = Math.PI * k / 10; pts.push([Math.cos(a) * r, fl + Math.sin(a) * r]); }
  const winY = fl + r * 0.35;
  holedPolygon(sink, 'structureWood', endW, pts,
    [{ u0: -0.35, u1: 0.35, y0: winY, y1: winY + 0.6 }], 0.05, 0.05, { colour: shade(OLIVE, 1.25) });
  sink.prism('structureWood', pts.map(([u, y]): Vec3 => [vx0 - 0.11, y, zc - u]), [1, 0, 0], 0.05, { colour: shade(OLIVE, 1.25), decor: true });
  // the vestibule: a framed plywood arctic entry, its door cut with a step under it and a canopy over it
  sink.placed(0, (vx0 + x1) / 2, fl, zc, () => {
    const vw = r * 1.24, vd = x1 - vx0;
    sink.paint = shade(PLY, 0.95);
    try {
      buildHouse(sink, {
        w: vd, d: vw, plinth: null, storeys: [{ h: r * 0.95, wall: 'structureWood' }],
        roof: { kind: 'shed', pitchDeg: 8, eave: 0.12, verge: 0.12, thickness: 0.1, bucket: 'roof' }, gableBucket: 'structureWood',
        openings: [{ face: 'right', storey: 0, kind: 'door', u: 0, w: 0.9, y0: 0, h: 1.95 }], chimneys: [], gutters: null, verge: null, reveal: 0.08,
      }, {
        window: () => {},
        door: (s2, face, o, y0) => doorUnit(s2, face, o.u, y0 + o.y0, o.w, o.h, { leaf: shade(PLY, 0.7), frame: { bucket: 'structureWood', width: 0.08, out: 0.04, colour: shade(OLIVE, 0.9) }, steps: null, leafKind: 'plank' }),
      });
    } finally { sink.paint = null; }
    sink.span('structureWood', vd / 2, -fl - 0.05, -0.6, vd / 2 + 0.5, -0.12, 0.6, { colour: timber, decor: true });
    sink.span('structureMetal', vd / 2, 2.15, -0.7, vd / 2 + 0.6, 2.22, 0.7, { colour: OLIVE, decor: true });
    for (const z of [-0.6, 0.6]) sink.member('structureWood', [vd / 2 + 0.02, 1.85, z], [vd / 2 + 0.55, 2.15, z], 0.05, 0.05, [0, 0, 1], { colour: timber, decor: true, exposed: true }, 0);
  });
  // the ribs at the bays' ends, proud of the sagging canvas, the tie-downs to their stakes, the window in the far end and
  // the stovepipe on its guys (dressing a phone draws and drops: the window draws the build stream, which the phone must
  // draw as often as the desktop does)
  sink.dressing(mobile, () => {
    for (let k = 1; k < bays; k++) {
      const x = x0 + k * bayW;
      sink.cylinder('structureWood', [x - 0.04, fl, zc], 'x', 0.08, r + 0.03, 12, { colour: shade(OLIVE, 0.75), decor: true }, r + 0.03, false, -Math.PI / 2, Math.PI);
      for (const side of [-1, 1]) sink.member('structureWood', [x, fl + 0.05, zc + side * (r + 0.02)], [x, -0.05, zc + side * (r + 0.6)], 0.02, 0.02, [1, 0, 0], { colour: rgb(0x8a8270), decor: true, exposed: true, fine: true }, 0);
    }
    sink.recess = 0.05;
    try { windowUnit(sink, endW, 0, winY, 0.7, 0.6, WINDOW, rng, 0.4); } finally { sink.recess = 0; }
    const px = vx0 - bayW * 0.6, py = fl + r + 0.9;
    sink.cylinder('structureMetal', [px, fl + r - 0.1, zc + r * 0.35], 'y', 1.1, 0.08, 8, { colour: STEEL_DARK, decor: true });
    sink.cylinder('structureMetal', [px, py, zc + r * 0.35], 'y', 0.12, 0.16, 8, { colour: STEEL_DARK, decor: true }, 0.04);
    for (const [dx, dz] of [[1.2, 0.6], [-1.2, 0.6], [0, -1.0]] as const) {
      sink.member('structureMetal', [px, py - 0.1, zc + r * 0.35], [px + dx, fl + r * 0.8, zc + r * 0.35 + dz], 0.012, 0.012, [0, 1, 0], { colour: STEEL_DARK, decor: true, exposed: true, fine: true }, 0);
    }
  });
  // the boardwalk along its side: boards on two stringers
  // (the r2 sweep) its boards laid across it, each its own tone, on two sawn stringers
  sink.placed(Math.PI / 2, 0, 0, 0, () => panelSlab(sink, 'wood', -(bb.maxZ - 0.15), fl - 0.2, x0, -zH, fl - 0.15, x1, 0.3, () => [1, 1, 1], [1, 1, 1]));
  sink.dressing(mobile, () => {
    for (const z of [zH + 0.2, bb.maxZ - 0.35]) sectionMember(sink, 'structureWood', [x0, (fl - 0.5) / 2, z], [x1, (fl - 0.5) / 2, z], chamferedSection(0.14, fl - 0.2 + 0.3, 0.02), { colour: shade(timber, 0.85), decor: true });
    for (let x = x0 + 0.15; x < x1; x += 0.3) sink.span('structureWood', x - 0.003, fl - 0.155, zH, x + 0.003, fl - 0.145, bb.maxZ - 0.15, { colour: shade(timber, 0.7), decor: true, fine: true });
  });
  // the banks: along the windward side (away from the boardwalk) and against the far end
  const north = boxFace(x0, z0, x1, zH, 'n'), far = boxFace(x0, z0, x1, zH, 'w');
  bank(sink, north, -north.width / 2 - 0.6, north.width / 2 + 0.6, 1.0, 0.8, 1.8, -0.3, zc + 3.1);
  bank(sink, far, -far.width / 2 - 0.4, far.width / 2 + 0.4, 1.1, 1.1, 1.6, -0.3, zc + 5.3);
  return sink.finish();
};

// ------------------------------------------------------------------------------- moved from arctic.ts (the r2 sweep)
// (the colours, the kit's paints and the rust runs the moved builders use, copied from arctic.ts as they stand there)
const STEEL = rgb(0x5d6266);
const WHITE = rgb(0xe8e9e6), ORANGE = rgb(0xc4602b), BLUE = rgb(0x6f8796);
/** (round 5) the reflector's painted panels, a multiplier over the kit's white render (regionalPlaster takes it direct) */
const PANEL: Rgb = [0.97, 0.975, 0.97];
/** The renders of the kit (its tones): white panels, safety orange, a pale blue-grey. */
type Paint = 'plaster' | 'plaster2' | 'plaster3';
const PAINT_RGB: Readonly<Record<Paint, Rgb>> = { plaster: WHITE, plaster2: ORANGE, plaster3: BLUE };

/**
 * Rust run down painted steel (round 3, gauntlet wave 130: "uniformly clean with no rust streaking ... for decades-old
 * Arctic infrastructure"): thin streaks from under the eaves and the sills, each its own length, a few to a face. Dressing.
 */
const RUST = rgb(0x6a4630);
/** A dressing-only stream of its own (seeded from a part's place), so the streaks never shift the build or look streams. */
function rustStream(seed: number): () => number {
  let a = (Math.floor(seed * 1000) ^ 0x5bd1e995) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function rustStreaks(sink: PartSink, face: Face, top: number, look: () => number, per = 0.35, holes: readonly HoleRect[] = []): void {
  const n = Math.max(1, Math.round(face.width * per));
  for (let k = 0; k < n; k++) {
    const u = (look() - 0.5) * (face.width - 0.6), run = 0.5 + look() * 1.8, w = 0.03 + look() * 0.05;
    const colour = shade(RUST, 0.8 + look() * 0.4);
    // (a run a dozen times as long as it is wide at the least: a short dark tab reads as a slot, never as a rust run)
    const len = Math.max(run, 14 * w);
    // a run stops at the head of an opening cut under it (it ran round it; never across the cut); cut short, a stub is
    // left out (a dark tab over the head would read as a slot)
    let foot = top - len;
    for (const h of holes) if (u + w / 2 > h.u0 - 0.02 && u - w / 2 < h.u1 + 0.02 && h.y1 > foot && h.y0 < top) foot = Math.max(foot, h.y1 + 0.01);
    if (top - foot >= (foot > top - len ? Math.max(0.12, 14 * w) : 0.12)) faceBox(sink, 'structureMetal', face, u, (top + foot) / 2, 0.005, w, top - foot, 0.008, { colour, decor: true, fine: true });
  }
}

/**
 * A module on its piles: the steel columns and the beams under its edges, the insulated box with its panel seams and
 * the coloured fascia band, a flat roof; `floor` is the height of its underside above the ground.
 */
function module(sink: PartSink, x0: number, z0: number, x1: number, z1: number, floor: number, h: number, paint: Paint,
  band: Paint, mobile: boolean, piles = true, holes: Partial<Record<'n' | 's' | 'e' | 'w', readonly HoleRect[]>> = {}, rng: () => number = () => 0.5): void {
  if (piles) {
    const stepZ = Math.max(2.4, (z1 - z0 - 0.4) / Math.max(1, Math.round((z1 - z0 - 0.4) / 3)));
    for (const x of [x0 + 0.25, x1 - 0.25]) {
      const zs: number[] = [];
      // (the looks lane's r2 sweep, 2026-10-16) the piles steel pipe, the beam on them a rolled I-section
      for (let z = z0 + 0.2; z <= z1 - 0.19; z += stepZ) { zs.push(z); tubeMember(sink, 'structureMetal', [x, -0.4, z], [x, floor - 0.28, z], 0.14, 8, { colour: STEEL_DARK }, 'none'); }
      iBeam(sink, 'structureMetal', [x, floor - 0.15, z0], [x, floor - 0.15, z1], 0.3, 0.32, 0.03, 0.02, { colour: STEEL });
      // (round 3, wave 130: "sits directly on the snow like a barracks block, with none of the steel piles") the raised
      // floor's piles braced in X between each pair, the way the line's trains stand clear of the snow
      if (!mobile && floor > 1.6) {
        for (let k = 0; k + 1 < zs.length; k++) {
          const a: Vec3 = [x, 0.15, zs[k]], b: Vec3 = [x, floor - 0.4, zs[k + 1]];
          const c: Vec3 = [x, floor - 0.4, zs[k]], d: Vec3 = [x, 0.15, zs[k + 1]];
          sink.member('structureMetal', a, b, 0.06, 0.06, [1, 0, 0], { colour: STEEL_DARK, decor: true, exposed: true });
          sink.member('structureMetal', d, c, 0.06, 0.06, [1, 0, 0], { colour: STEEL_DARK, decor: true, exposed: true });
        }
      }
    }
    // (round 5, wave 224: "under the module on piles the snow is as bright as the open plain, with no ... scour or drift
    // around the piles") the snow heaped round every pile's foot; the black slab that stood for the scoured void under the
    // floor is gone (buried where the ground rose, a hard dark mark where it fell)
    for (const x of [x0 + 0.25, x1 - 0.25]) {
      for (let z = z0 + 0.2; z <= z1 - 0.19; z += stepZ) sink.cylinder('plaster', [x, -0.3, z], 'y', 0.6, 0.55, 8, { decor: true }, 0.14, false);
    }
    // (round 4, gauntlet wave 175: drifts banked against the trains) the windward drift along the west piles, leaning
    // a metre and more up them and tailing out three metres, past both ends; the lee side scoured
    if (floor > 1.6) {
      const hz = 1.0 + 0.4 * (0.5 + 0.5 * Math.sin(x0 * 0.37 + z0 * 0.21)), foot = -0.3, out = 3.0, za = z0 - 1.2, zb = z1 + 1.2;
      // (the looks lane's r2 sweep, 2026-10-16) its crest wandering: a station at each end and one between, each its own
      // height up the piles (wave: no draw)
      const zs = [za, (za + zb) / 2, zb], hs = [hz, hz * (0.82 + 0.36 * wave(zb, x0 + z0)), hz];
      const T = zs.map((z, k): Vec3 => [x0 + 0.1, hs[k], z]), O = zs.map((z): Vec3 => [x0 - out, foot, z]), F = zs.map((z): Vec3 => [x0 + 1.2, foot, z]);
      // the windward slope, the short lee face under the floor and the two ends (each wound to face out)
      for (let k = 0; k < 2; k++) {
        sink.polygon('plaster', [T[k], O[k], O[k + 1], T[k + 1]], { decor: true });
        sink.polygon('plaster', [T[k], T[k + 1], F[k + 1], F[k]], { decor: true });
      }
      sink.polygon('plaster', [T[0], F[0], O[0]], { decor: true });
      sink.polygon('plaster', [T[2], O[2], F[2]], { decor: true });
    }
  }
  // the box: a house of its own on its piles (props census #13, lane B 2026-10-15: each module a body that breaks and
  // falls into its own heap; the train went down to the default kit's bounding-box spalls), its doors and windows cut
  // through its skin by the house grammar with their units at the back of the reveals (they were laid on a solid box),
  // its flat roof the old slab
  const openings: Opening[] = [];
  for (const [side, face] of [['s', 'front'], ['e', 'right'], ['n', 'back'], ['w', 'left']] as const) {
    for (const c of holes[side] ?? []) {
      openings.push({ face, storey: 0, kind: c.y1 - c.y0 > 1.5 ? 'door' : 'window', u: (c.u0 + c.u1) / 2, w: c.u1 - c.u0, y0: c.y0 - floor, h: c.y1 - c.y0 });
    }
  }
  const units: HouseDialect = {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, WINDOW, rng, 0.5),
    door: (s, face, o, y0) => moduleDoor(s, face, o.u, y0 + o.y0),
  };
  sink.placed(0, (x0 + x1) / 2, floor, (z0 + z1) / 2, () => buildHouse(sink, {
    w: x1 - x0, d: z1 - z0, plinth: null, storeys: [{ h, wall: paint }],
    // (the r2 sweep: the house's flat slab was one plain box) the roof laid below in its insulated panels
    roof: { kind: 'flat', pitchDeg: 0, eave: 0.12, verge: 0.12, thickness: 0, bucket: 'roof' }, openings, chimneys: [],
    gutters: null, verge: null, reveal: MODULE_REVEAL, rafters: null, spall: null,
  }, units));
  // the flat roof in its insulated panels across the module, its eaves 12 cm over the walls
  panelSlab(sink, 'roof', x0 - 0.12, floor + h, z0 - 0.12, x1 + 0.12, floor + h + 0.22, z1 + 0.12, 1.2, () => [1, 1, 1], [1, 1, 1]);
  // the fascia band: a ring round the walls (it was a slab through the body)
  bandRing(sink, band, x0, floor + h - 0.5, z0, x1, floor + h - 0.1, z1, 0.03);
  if (facadeOn()) moduleDoorCraft(sink, x0, z0, x1, z1, floor + h - 0.5, holes);
  if (mobile) return;
  // the panel seams down every face
  const seam = { colour: shade(PAINT_RGB[paint], 0.8), decor: true, fine: true } as const;
  for (const side of ['n', 's', 'e', 'w'] as const) {
    const f = boxFace(x0, z0, x1, z1, side), cuts = holes[side] ?? [];
    // a seam or a collar runs up the skin round the cuts (the pieces under and over an opening it crosses)
    const upFace = (u: number, w: number, y0: number, y1: number, o: number, d: number, opts: EmitOptions) => {
      const across = cuts.filter((c) => u + w / 2 > c.u0 - 0.03 && u - w / 2 < c.u1 + 0.03).sort((a, b) => a.y0 - b.y0);
      let from = y0;
      for (const c of across) {
        if (c.y0 - 0.03 - from > 0.05) faceBox(sink, 'structureMetal', f, u, (from + c.y0 - 0.03) / 2, o, w, c.y0 - 0.03 - from, d, opts, 'caps');
        from = Math.max(from, c.y1 + 0.03);
      }
      if (y1 - from > 0.05) faceBox(sink, 'structureMetal', f, u, (from + y1) / 2, o, w, y1 - from, d, opts, 'caps');
    };
    for (let u = -f.width / 2 + 1.2; u < f.width / 2 - 0.3; u += 1.2) upFace(u, 0.04, floor + 0.025, floor + h - 0.525, 0.01, 0.02, seam);
    // (round 3: "a long train of joined modules") the joint between one module and the next, every 4.2 m, a steel
    // collar proud of the skin; and the rust run from under the eaves
    if (piles && (side === 'e' || side === 'w')) {
      for (let u = -f.width / 2 + 4.2; u < f.width / 2 - 1.0; u += 4.2) upFace(u, 0.16, floor - 0.05, floor + h + 0.05, 0.04, 0.08, { colour: STEEL, decor: true });
    }
    if (piles) rustStreaks(sink, f, floor + h - 0.55, rustStream(x0 * 3.1 + z0 * 7.7 + x1 + z1 * 0.37 + side.charCodeAt(0)), 0.25, cuts);
  }
}

/**
 * Over each door of a module, where its fascia band leaves the room (the looks lane, 227, BLD-04; facade craft, desktop,
 * decor): the steel hood the line hung over a door at a stair head, and the vapour-proof lamp on its bracket beside it on
 * the side away from the stair (the flight runs down to +u).
 */
function moduleDoorCraft(sink: PartSink, x0: number, z0: number, x1: number, z1: number, bandY: number,
  holes: Partial<Record<'n' | 's' | 'e' | 'w', readonly HoleRect[]>>): void {
  for (const side of ['n', 's', 'e', 'w'] as const) {
    for (const c of holes[side] ?? []) {
      if (c.y1 - c.y0 <= 1.5 || bandY - c.y1 < 0.38) continue;
      const f = boxFace(x0, z0, x1, z1, side), u = (c.u0 + c.u1) / 2, w = c.u1 - c.u0, lamp = u - (w + 0.7) / 2 - 0.2;
      doorCanopy(sink, f, u, c.y1 - 0.04, w, { kind: 'shed', bucket: 'structureMetal', colour: STEEL, timber: STEEL_DARK, depth: 0.85 });
      if (Math.abs(lamp) + 0.15 < f.width / 2) wallLantern(sink, f, lamp, c.y1 + 0.05);
    }
  }
}

/** A steel stair up to a module's door: the landing on its post and the flight down to the ground along the face. */
function stair(sink: PartSink, face: Face, u: number, floor: number, mobile: boolean): void {
  const c = { colour: STEEL } as const;
  const land = facePoint(face, u, floor - 0.1, 0.75);
  sink.box('structureMetal', land, [0.8, 0.06, 0.75], c, new LocalFrame(face.u, [0, 1, 0], face.out, land));
  const post = facePoint(face, u, (floor - 0.4) / 2 - 0.2, 1.35);
  sink.box('structureMetal', post, [0.07, (floor + 0.2) / 2, 0.07], c, new LocalFrame(face.u, [0, 1, 0], face.out, post));
  const n = Math.max(2, Math.round(floor / 0.2)), rise = floor / n;
  for (let k = 1; k < n; k++) {
    const p = facePoint(face, u + 0.8 + k * 0.26, floor - 0.1 - k * rise, 0.75);
    sink.box('structureMetal', p, [0.13, 0.03, 0.55], c, new LocalFrame(face.u, [0, 1, 0], face.out, p));
  }
  // (the connectivity sweep, 217: the treads hung a riser apart in air) the two stringers they rest on, along their
  // centre line from under the landing's edge to the ground, and the handrail on posts over the outer one
  const line = (uu: number): number => floor - 0.1 - (uu - u - 0.8) / 0.26 * rise;
  const uTop = u + 0.75, uFoot = u + 0.8 + (floor - 0.05) / rise * 0.26;
  const string = { colour: STEEL_DARK, decor: true, exposed: true } as const;
  for (const [o, embed] of [[0.2, 0.04], [1.3, 0.02]] as const) {
    sink.member('structureMetal', facePoint(face, uTop, line(uTop), o), facePoint(face, uFoot, line(uFoot), o), 0.2, 0.06, face.out, string, embed);
  }
  if (!mobile) {
    const rail = 0.9, posts = [uTop, (uTop + uFoot) / 2, uFoot - 0.2];
    for (const pu of posts) sink.member('structureMetal', facePoint(face, pu, line(pu), 1.31), facePoint(face, pu, line(pu) + rail, 1.31), 0.05, 0.05, face.out, string, 0.025);
    for (let k = 0; k + 1 < posts.length; k++) {
      sink.member('structureMetal', facePoint(face, posts[k], line(posts[k]) + rail, 1.31), facePoint(face, posts[k + 1], line(posts[k + 1]) + rail, 1.31), 0.05, 0.05, face.out, string, 0.025);
    }
  }
}

/**
 * A small window and a steel door in a module's skin: cut through it (module's `holes`: MODULE_WINDOW / MODULE_DOOR give
 * the cut at (u, y)), the pane and the leaf at the back of the reveal, the door's frame round the cut on the face.
 */
const MODULE_REVEAL = 0.12;

const MODULE_WINDOW = (u: number, y: number): HoleRect => ({ u0: u - 0.45, u1: u + 0.45, y0: y, y1: y + 0.7 });

const MODULE_DOOR = (u: number, y: number): HoleRect => ({ u0: u - 0.5, u1: u + 0.5, y0: y, y1: y + 2.1 });

function moduleDoor(sink: PartSink, face: Face, u: number, y: number): void {
  faceBox(sink, 'structureMetal', face, u, y + 1.05, -sink.recess + 0.025, 1.0, 2.1, 0.04, { colour: STEEL, decor: true });
  const fo = { colour: STEEL_DARK, decor: true };
  for (const s of [-1, 1]) faceBox(sink, 'structureMetal', face, u + s * 0.54, y + 1.085, 0.02, 0.08, 2.17, 0.04, fo);
  faceBox(sink, 'structureMetal', face, u, y + 2.135, 0.02, 1.0, 0.07, 0.04, fo);
}

/**
 * The module train (the office's plot): two rows of insulated modules on steel piles, side by side and joined by a
 * covered link, the upper control level over one end, steel stairs to the doors, small windows; on most plots the
 * radar's white radome on its ring beam over the upper level, the roof's vents and the whip antennas.
 */
export const moduleTrain: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
  const fit = wallsIn(ctx, 0.15, 0.15);
  const W = clamp(fit.w, 8, 16), D = clamp(fit.d, 9, 18);
  const paint: Paint = look() < 0.75 ? 'plaster' : 'plaster3', band: Paint = look() < 0.6 ? 'plaster2' : 'plaster3';
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    // (round 3, wave 130: "sits directly on the snow like a barracks block") the floor 2.1 m up on its braced piles, the
    // void under it in shade (was 1.25 m, where the snow banked to the floor hid the piles)
    const floor = 2.1, h = 3.0, gap = 1.2, mw = (W - gap) / 2;
    const ax0 = -W / 2, ax1 = -W / 2 + mw, bx0 = W / 2 - mw, bx1 = W / 2;
    // the rows stop short of the plot's +z edge: the stairs to their doors stand in front of them
    // the doors at the rows' ends, windows down the long faces between the modules' joints (two to a module)
    const winUs = (width: number): number[] => {
      const us: number[] = [];
      for (let a = -width / 2; a < width / 2 - 1.5; a += 4.2) {
        const b = Math.min(width / 2, a + 4.2), mid = (a + b) / 2;
        if (b - a >= 3.2) us.push(mid - 1.0, mid + 1.0); else us.push(mid);
      }
      return us;
    };
    const lenA = D / 2 - 1.6 + D / 2, lenB = D / 2 - 2.4 + D / 2, doorA = -(ax1 - ax0) * 0.18, doorB = -(bx1 - bx0) * 0.18;
    module(sink, ax0, -D / 2, ax1, D / 2 - 1.6, floor, h, paint, band, mobile, true,
      { s: [MODULE_DOOR(doorA, floor)], w: winUs(lenA).map((u) => MODULE_WINDOW(u, floor + 1.25)) }, rng);
    module(sink, bx0, -D / 2, bx1, D / 2 - 2.4, floor, h, paint, band, mobile, true,
      { s: [MODULE_DOOR(doorB, floor)], e: winUs(lenB).map((u) => MODULE_WINDOW(u, floor + 1.25)) }, rng);
    // the covered link between the rows
    module(sink, ax1 - 0.05, -1.4, bx0 + 0.05, 1.4, floor, h - 0.4, paint, band, mobile, false);
    // the upper control level over the north end of the second row, and the radome over it
    const uz0 = -D / 2 + 0.4, uz1 = uz0 + Math.min(7, D * 0.45);
    module(sink, bx0 + 0.3, uz0, bx1 - 0.3, uz1, floor + h + 0.22, 2.7, paint, band, mobile, false);
    const top = floor + h + 0.22 + 2.7 + 0.22;
    if (look() < 0.7) radome(sink, (bx0 + bx1) / 2, top + 0.4, (uz0 + uz1) / 2, clamp(mw * 0.62, 2.6, 4.6), 16);
    else for (const s of [-1, 1]) sink.member('structureMetal', [(bx0 + bx1) / 2 + s * 1.2, top, (uz0 + uz1) / 2], [(bx0 + bx1) / 2 + s * 1.2, top + 5.5, (uz0 + uz1) / 2], 0.08, 0.08, [0, 0, 1], { colour: STEEL_DARK, decor: true, exposed: true });
    // the stairs to the doors
    const sa = boxFace(ax0, -D / 2, ax1, D / 2 - 1.6, 's'), sb = boxFace(bx0, -D / 2, bx1, D / 2 - 2.4, 's');
    for (const f of [sa, sb]) stair(sink, f, -f.width * 0.18, floor, mobile);
    // the roof's vents and stacks
    if (!mobile) {
      for (let k = 0; k < 3; k++) {
        const z = -D / 2 + 2 + k * (D - 4) / 2;
        sink.span('structureMetal', ax0 + mw * 0.3, floor + h + 0.22, z - 0.35, ax0 + mw * 0.3 + 0.7, floor + h + 0.9, z + 0.35, { colour: STEEL, decor: true });
      }
      sink.cylinder('structureMetal', [ax1 - 0.8, floor + h + 0.22, D / 2 - 2.8], 'y', 2.2, 0.16, 8, { colour: STEEL_DARK, decor: true });
    }
  });
  return sink.finish();
};

/**
 * The tropospheric-scatter antenna (the fire station's plot): one great billboard reflector across the plot's long side,
 * wider than tall, a parabolic cylinder of steel panels concave to the next station over the horizon; the space truss
 * behind it; the feed horn at its focus on its own tower; the transmitter module beside it. (Round 3, gauntlet wave 130:
 * "two tall white slabs ... lacking the wide curved dish, lattice backing, feed-horn boom and scale". Round 5, wave 224:
 * from the front "a flat drive-in-movie screen: only its top rail curves ... the feed is a tiny black box on a tripod
 * almost touching the face"; from behind "a closed cylindrical scaffold cage ... reading like a gasholder frame, with no
 * deep back truss, raked legs or footings"; from the side "a thin billboard on a cage that seems to hover above the snow".)
 * Round 5: the sag a sixth of the width, so the focus (f = w² / 16 sag) stands some 6 m out, the feed horn on a lattice
 * tower there; the panels a shade darker toward the edges, their joints holding at range; the truss's rear frame a flat
 * plane braced in X (the truss deepens toward the edges as the face curves forward), tied to the face by webs and
 * diagonals, raked back to concrete footings; the transmitter module off to one side at the front.
 */
export const tropo: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, mobile = ctx.tier === 'mobile';
  const bb = ctx.bounds;
  const pcx = (bb.minX + bb.maxX) / 2, pcz = (bb.minZ + bb.maxZ) / 2;
  // (round 4, gauntlet wave 175: still "a flat screen on one mast"): the billboard turned across the plot's long side —
  // wider than tall, as a real one is — in a frame turned a quarter (local x along the plot's depth, the face concave to
  // local +z, the plot's width)
  const span = bb.maxZ - bb.minZ, depth = bb.maxX - bb.minX;
  sink.placed(Math.PI / 2, pcx, 0, pcz, () => {
    const cx = 0, z0 = -depth / 2 + 0.2, z1 = depth / 2 - 0.2;
    const bw = span - 0.3, H = clamp(bw * 0.84, 11, 14), foot = 1.4;
    const SAG = clamp(bw * 0.16, 2.0, 2.8);
    // the rear frame 2.2 m into the plot so its raking legs stay in it (regionalArchitecture: collision-bearing parts at
    // most PLOT_SLACK past the plot) and the feed tower at the front edge
    const rear = z0 + 2.2, back = rear + 2.2;
    const curve = (t: number): number => back + 4 * SAG * t * t;
    const fz = Math.min(back + (bw * bw) / (16 * SAG), z1 - 1.0), fy = foot + H * 0.5;
    const crest = foot + H + 0.8;
    // the panels: 28 vertical strips that overlap into one curved sheet, each a shade darker toward the edges (the curve
    // reads in the light the strips take); solid, the same on every tier
    const n = 28;
    // (the looks lane's r2 sweep, 2026-10-16: the face was 28 loose boxes) one welded skin 12 cm thick on the parabola,
    // its 28 panels each a shade darker toward the edges, closed along its head, foot and edges
    const skin = (t: number, y: number, o: number): Vec3 => [cx + t * bw, y, curve(t) + o];
    for (let k = 0; k < n; k++) {
      const ta = k / n - 0.5, tb = (k + 1) / n - 0.5, tm = (ta + tb) / 2, yb = foot, yt = foot + H;
      const o = { colour: shade(PANEL, 0.84 + 0.16 * (1 - 4 * tm * tm)) };
      sink.quad('regionalPlaster', skin(ta, yb, 0.06), skin(tb, yb, 0.06), skin(tb, yt, 0.06), skin(ta, yt, 0.06), o);
      sink.quad('regionalPlaster', skin(tb, yb, -0.06), skin(ta, yb, -0.06), skin(ta, yt, -0.06), skin(tb, yt, -0.06), o);
      sink.quad('regionalPlaster', skin(ta, yt, 0.06), skin(tb, yt, 0.06), skin(tb, yt, -0.06), skin(ta, yt, -0.06), o);
      sink.quad('regionalPlaster', skin(ta, yb, -0.06), skin(tb, yb, -0.06), skin(tb, yb, 0.06), skin(ta, yb, 0.06), o);
    }
    for (const [t, e] of [[-0.5, -1], [0.5, 1]] as const) {
      const a = skin(t, foot, 0.06), b = skin(t, foot, -0.06), c = skin(t, foot + H, -0.06), d = skin(t, foot + H, 0.06);
      sink.quad('regionalPlaster', ...(e > 0 ? [a, b, c, d] : [b, a, d, c]) as [Vec3, Vec3, Vec3, Vec3], { colour: shade(PANEL, 0.84) });
    }
    // the panels' stiffeners down the back of the skin at every joint (angles: the purlins the panels are bolted to)
    for (let k = 1; k < n; k++) {
      const t = k / n - 0.5;
      angleMember(sink, 'structureMetal', [cx + t * bw, foot, curve(t) - 0.11], [cx + t * bw, foot + H, curve(t) - 0.11], 0.1, 0.02, { colour: STEEL, decor: true }, 'none', [0, 0, -1]);
    }
    // the panel joints: across the face every sixth of its height and down it every fourth strip, a darker grey that
    // holds at range (not fine joinery)
    const joint = { colour: shade(WHITE, 0.62), decor: true } as const;
    for (let j = 1; j < 6; j++) {
      const y = foot + H * j / 6;
      for (let k = 0; k + 1 < n; k++) {
        const ta = (k + 0.5) / n - 0.5, tb = (k + 1.5) / n - 0.5;
        sink.member('structureMetal', [cx + ta * bw, y, curve(ta) + 0.07], [cx + tb * bw, y, curve(tb) + 0.07], 0.09, 0.03, [0, 0, 1], joint);
      }
    }
    for (let k = 4; k < n; k += 4) {
      const t = k / n - 0.5;
      sink.member('structureMetal', [cx + t * bw, foot, curve(t) + 0.07], [cx + t * bw, foot + H, curve(t) + 0.07], 0.08, 0.03, [0, 0, 1], joint);
    }
    // the edge ribs, and the rails along the head and the foot of the face
    for (const t of [-0.5, 0.5]) {
      const x = cx + t * bw;
      angleMember(sink, 'structureMetal', [x, foot - 0.2, curve(t) + 0.1], [x, foot + H + 0.2, curve(t) + 0.1], 0.24, 0.04, { colour: STEEL }, 'both', [0, 0, 1]);
    }
    for (const y of [foot - 0.1, foot + H + 0.1]) for (let k = 0; k < n; k++) {
      const ta = k / n - 0.5, tb = (k + 1) / n - 0.5;
      angleMember(sink, 'structureMetal', [cx + ta * bw, y, curve(ta) + 0.1], [cx + tb * bw, y, curve(tb) + 0.1], 0.2, 0.035, { colour: STEEL, decor: true }, 'none', [0, 1, 0]);
    }
    // the space truss: the rear frame a flat plane 2.2 m behind the vertex, verticals at nine stations front and rear on
    // concrete footings, six levels of chords, webs from the rear to the face at every station and level, the rear plane
    // braced in X bay by bay, a diagonal through the depth of every bay
    const stations = [-0.5, -0.375, -0.25, -0.125, 0, 0.125, 0.25, 0.375, 0.5];
    const front = (t: number): number => curve(t) - 0.14;
    const sx = (t: number): number => cx + t * bw * 0.98;
    const truss = { colour: STEEL, exposed: true } as const, light = { colour: STEEL_DARK, decor: true, exposed: true } as const;
    const levels: number[] = [];
    for (let l = 0; l <= 5; l++) levels.push(foot - 0.6 + (crest - foot + 0.6) * l / 5);
    for (const t of stations) {
      const x = sx(t);
      // (the r2 sweep: hot-rolled angles on round concrete piers, where square bars stood on blocks)
      angleMember(sink, 'structureMetal', [x, -0.3, rear], [x, crest, rear], 0.28, 0.035, truss, 'b', [0, 0, 1]);
      angleMember(sink, 'structureMetal', [x, -0.3, front(t)], [x, crest, front(t)], 0.2, 0.03, truss, 'b', [0, 0, 1]);
      for (const z of [rear, front(t)]) pier(sink, 'stone', x, z, 0.42, -0.4, 0.25, 0, { decor: true }, 6);
      for (const y of levels) angleMember(sink, 'structureMetal', [x, y, rear], [x, y, front(t)], 0.1, 0.02, light, 'none', [1, 0, 0]);
    }
    for (let j = 0; j + 1 < stations.length; j++) {
      const ta = stations[j], tb = stations[j + 1], xa = sx(ta), xb = sx(tb);
      for (let l = 0; l < levels.length; l++) {
        const y = levels[l];
        angleMember(sink, 'structureMetal', [xa, y, rear], [xb, y, rear], 0.14, 0.025, light, 'none', [0, 1, 0]);
        angleMember(sink, 'structureMetal', [xa, y, front(ta)], [xb, y, front(tb)], 0.12, 0.022, light, 'none', [0, 1, 0]);
        if (l + 1 < levels.length) {
          const y2 = levels[l + 1];
          angleMember(sink, 'structureMetal', [xa, y, rear], [xb, y2, rear], 0.09, 0.02, light, 'none', [0, 0, 1]);
          angleMember(sink, 'structureMetal', [xb, y, rear], [xa, y2, rear], 0.09, 0.02, light, 'none', [0, 0, 1]);
          if (!mobile) {
            const xs = (j + l) % 2 === 0 ? xa : xb, ts = (j + l) % 2 === 0 ? ta : tb;
            angleMember(sink, 'structureMetal', [xs, y, rear], [xs, y2, front(ts)], 0.08, 0.018, light, 'none', [1, 0, 0]);
          }
        }
      }
    }
    // (props census #13, lane B 2026-10-15) the truss recorded as an open frame, its eighteen verticals the legs and its
    // levels the girts, the reflector its crown: the billboard falls as its members beside the transmitter module (it
    // went down to the default kit's bounding-box spalls, and the module's own reading would have dropped it)
    recordLattice(sink, stations.flatMap((t) => [{ foot: [sx(t), -0.3, rear] as Vec3, head: [sx(t), crest, rear] as Vec3 },
      { foot: [sx(t), -0.3, front(t)] as Vec3, head: [sx(t), crest, front(t)] as Vec3 }]), levels, 0.28, 'structureMetal', STEEL,
    { x0: cx - bw / 2, x1: cx + bw / 2, y0: foot, y1: foot + H, z0: back, z1: curve(0.5) + 0.12, bucket: 'regionalPlaster', tint: PANEL });
    // the raking legs: A-frames from footings 2.6 m behind the rear frame up to it at three fifths of the height
    for (const t of [-0.5, -0.25, 0.25, 0.5]) {
      const x = sx(t);
      angleMember(sink, 'structureMetal', [x, -0.3, rear - 2.6], [x, foot + H * 0.6, rear], 0.24, 0.035, truss, 'none', [1, 0, 0]);
      pier(sink, 'stone', x, rear - 2.6, 0.48, -0.4, 0.25, 0, { decor: true }, 6);
    }
    // the feed horn at the focus on its own tower: four tapering legs braced in X, a platform, the pyramidal horn's mouth
    // turned to the reflector, the waveguide down the tower
    const tw = 0.85, tz = fz + 0.9, legTop = fy - 0.7;
    const legAt = (s: number, y: number): number => s * tw * (1 - 0.4 * (y + 0.3) / (legTop + 0.3));
    for (const ox of [-1, 1]) for (const oz of [-1, 1]) {
      angleMember(sink, 'structureMetal', [cx + legAt(ox, -0.3), -0.3, tz + legAt(oz, -0.3)], [cx + legAt(ox, legTop), legTop, tz + legAt(oz, legTop)],
        0.16, 0.025, { colour: GALV }, 'none', [ox, 0, oz]);
    }
    if (!mobile) for (let y = 0.6; y + 2.4 < legTop; y += 2.4) {
      for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]] as const) {
        angleMember(sink, 'structureMetal', [cx + legAt(ax, y), y, tz + legAt(az, y)], [cx + legAt(bx, y + 2.4), y + 2.4, tz + legAt(bz, y + 2.4)],
          0.06, 0.012, { colour: GALV, decor: true }, 'none', [0, 1, 0]);
      }
    }
    sink.span('structureMetal', cx - 0.8, legTop - 0.1, tz - 0.8, cx + 0.8, legTop + 0.05, tz + 0.8, { colour: GALV });
    sink.cylinder('structureMetal', [cx, fy, fz - 1.9], 'z', 1.9, 1.1, 4, { colour: STEEL_DARK }, 0.32);
    sink.span('structureMetal', cx - 0.45, fy - 0.45, fz, cx + 0.45, fy + 0.45, fz + 0.8, { colour: STEEL });
    sink.member('structureMetal', [cx + 0.35, fy - 0.45, fz + 0.5], [cx + 0.35, 0.9, tz + 0.5], 0.14, 0.1, [1, 0, 0], { colour: STEEL_DARK, decor: true, exposed: true });
    // the transmitter module beside the feed tower at the front, clear of the face, on its piles, its door and stair
    const mz1 = z1 - 1.6, mz0 = mz1 - 2.8, mx0 = cx + bw / 2 - 5.9, mx1 = cx + bw / 2 - 1.7;
    const modW = mx1 - mx0;
    module(sink, mx0, mz0, mx1, mz1, 1.1, 2.8, 'plaster', 'plaster2', mobile, true, { s: [MODULE_DOOR(-modW * 0.25, 1.1), MODULE_WINDOW(modW * 0.2, 2.3)] }, rng);
    stair(sink, boxFace(mx0, mz0, mx1, mz1, 's'), -modW * 0.25, 1.1, mobile);
  });
  return sink.finish();
};

/**
 * A module stripped and left to the wind (the ruin's plot): the piles and the floor frame standing, a wall of panels and
 * its door frame, the others down in the snow, the roof gone. Round 5 (gauntlet wave 224: "just a flat white deck on four
 * legs with two posts, reading as a table"): the module keeps its frame — the long wall standing to the eaves at its door
 * end and broken to half its height beyond a window gap, the door frame under its lintel and the end panel beside it, a
 * corner post and two roof joists still up, a third fallen to the deck; its panels down leaning on the open side's piles,
 * and the snow drifted in against the standing wall.
 */
export const derelict: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant;
  const fit = wallsIn(ctx, 0.1, 0.1);
  const W = fit.w, D = fit.d, floor = 1.1;
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    for (const x of [-W / 2 + 0.25, W / 2 - 0.25]) {
      // (the looks lane's r2 sweep, 2026-10-16) the piles steel pipe, the beam on them a rolled I-section, the deck in its
      // floor cassettes
      for (let z = -D / 2 + 0.2; z <= D / 2 - 0.19; z += (D - 0.4) / Math.max(1, Math.round((D - 0.4) / 2.6))) {
        tubeMember(sink, 'structureMetal', [x, -0.4, z], [x, floor - 0.28, z], 0.14, 8, { colour: STEEL_DARK }, 'none');
      }
      iBeam(sink, 'structureMetal', [x, floor - 0.15, -D / 2], [x, floor - 0.15, D / 2], 0.3, 0.32, 0.03, 0.02, { colour: STEEL });
    }
    panelSlab(sink, 'wood', -W / 2, floor, -D / 2, W / 2, floor + 0.2, D / 2, 1.2, () => [1, 1, 1], [1, 1, 1]);
    const hWall = 1.6 + look() * 0.8, deck = floor + 0.2, top = deck + 2.6, zSplit = -D / 2 + D * 0.4;
    // (the map-content L2 receipts: a ruin breaks piece by piece, its pieces read off its standing walls) the walls stand
    // as their insulated panels, some 1.2 m each, every other one a little recessed at its joints, so each panel is a
    // piece of its own whose ragged top a blow can open under; `height` the panel's over the deck, `across` the run's
    // wall line (x for the long walls, z for the end wall)
    const panels = (a0: number, a1: number, alongX: boolean, across: number, height: (k: number, n: number) => number): void => {
      const n = Math.max(1, Math.round((a1 - a0) / 1.2)), pw = (a1 - a0) / n;
      // (the r2 sweep: each panel a plain box) each an insulated sandwich panel, its edges rolled (a chamfered section),
      // standing from the deck to its ragged top
      for (let k = 0; k < n; k++) {
        const t0 = across + (k % 2 ? 0.02 : 0), t1 = across + (k % 2 ? 0.18 : 0.2), ya = deck + height(k, n);
        const m = a0 + (k + 0.5) * pw, tm = (t0 + t1) / 2, sec = chamferedSection(pw, t1 - t0, 0.025);
        if (alongX) sectionMember(sink, 'plaster3', [m, deck, tm], [m, ya, tm], sec, {}, 'both', [0, 0, 1]);
        else sectionMember(sink, 'plaster3', [tm, deck, m], [tm, ya, m], sec, {}, 'both', [1, 0, 0]);
      }
    };
    // the long wall to the eaves at the door end, its last panel sheared; beyond the window gap broken down toward the
    // open end
    panels(-D / 2, zSplit, false, -W / 2, (k, n) => (k === n - 1 ? 2.1 : 2.6));
    panels(zSplit + 1.1, D / 2 - 1.2, false, -W / 2, (k, n) => Math.max(0.7, (hWall - 0.2) * (1 - 0.5 * k / Math.max(1, n - 1)) * (k % 3 === 1 ? 0.86 : 1)));
    // the door end: the frame's posts and lintel, the end panel beside it, the corner post at the open side
    for (const s of [-1, 1]) sink.span('structureMetal', -W / 2 + 0.15 + 0.6 * (s + 1), deck, -D / 2, -W / 2 + 0.27 + 0.6 * (s + 1), floor + 2.3, -D / 2 + 0.12, { colour: STEEL });
    sink.span('structureMetal', -W / 2 + 0.15, floor + 2.3, -D / 2, -W / 2 + 1.47, floor + 2.42, -D / 2 + 0.12, { colour: STEEL });
    panels(-W / 2 + 1.5, W / 2 - 0.4, true, -D / 2, (k, n) => (k === n - 1 && n > 2 ? 1.7 : 2.6));
    sink.span('structureMetal', W / 2 - 0.4, deck, -D / 2, W / 2 - 0.22, top, -D / 2 + 0.18, { colour: STEEL });
    // the joists: two still up across the door end, a third fallen from the broken wall's head to the deck
    const joist = { colour: STEEL, exposed: true } as const;
    for (const z of [-D / 2 + 0.1, -D / 2 + 1.5]) sink.member('structureMetal', [-W / 2 + 0.1, top + 0.1, z], [W / 2 - 0.3, top + 0.1, z], 0.12, 0.2, [0, 1, 0], joist);
    // (the connectivity sweep, 217: both joists lay 8 cm over the wall heads, the second's far end on nothing) a packing
    // plate under each end on the wall head and the corner post, and a steel prop from the deck under the second's far end
    for (const z of [-D / 2 + 0.1, -D / 2 + 1.5]) {
      sink.span('structureMetal', -W / 2 + 0.02, top - 0.6, z - 0.08, -W / 2 + 0.2, top + 0.09, z + 0.08, { colour: STEEL_DARK, decor: true });
      if (z < -D / 2 + 0.2) sink.span('structureMetal', W / 2 - 0.4, top - 0.02, z - 0.08, W / 2 - 0.22, top + 0.09, z + 0.08, { colour: STEEL_DARK, decor: true });
      else sink.span('structureMetal', W / 2 - 0.38, deck - 0.02, z - 0.07, W / 2 - 0.24, top + 0.09, z + 0.07, { colour: STEEL, decor: true });
    }
    sink.member('structureMetal', [-W / 2 + 0.1, floor + hWall + 0.05, zSplit + 1.6], [W / 2 - 0.6, deck + 0.02, zSplit + 2.4], 0.12, 0.2, [0, 1, 0], { ...joist, decor: true });
    // the panels down, leaning on the open side's piles (their draws round 4's three on the snow)
    for (let k = 0; k < 3; k++) {
      const z = -D / 2 + 1.4 + k * (D - 2.8) / 2 + (look() - 0.5) * 0.6;
      const a: Vec3 = [W / 2 + 1.25, -0.15, z], b: Vec3 = [W / 2 + 0.2, floor + 0.12, z];
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
      sink.member('plaster3', a, b, 1.15, 0.08, [dy / len, -dx / len, 0], { decor: true, exposed: true });
    }
    // the snow drifted onto the deck against the standing wall
    const inner: Face = { origin: [-W / 2 + 0.2, deck, (-D / 2 + zSplit) / 2], u: [0, 0, -1], out: [1, 0, 0], width: zSplit + D / 2 };
    bank(sink, inner, -inner.width / 2 + 0.2, inner.width / 2, 0.9, 0.5, 1.5, -0.04, W + D);
  });
  return sink.finish();
};
