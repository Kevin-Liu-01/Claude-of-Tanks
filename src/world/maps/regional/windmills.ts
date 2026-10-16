// src/world/maps/regional/windmills.ts — the regional kits' windmills at the props census standard (#22, Lane C
// 2026-10-16), built on the mill works (millWorks.ts: the lattice sails on their crossing stocks, the lapped
// weatherboards, free beams) and the house grammar (house.ts: every opening cut through its wall with a reveal).
//
//  - the post mill (Kolkhoz, Verdant): the buck — its weatherboarded body on the crown tree and its two sills over the
//    post, the quarterbars down to the crosstrees on their piers — with its door and ladder at the back, a small window
//    in each side, the windshaft's neck cut through the breast over the breast beam; the tail pole under the ladder to
//    its stone.
//  - the smock mill (Polder, Polders): the octagonal brick base cut by its door and two windows with reveals, the
//    thatched body with its framed lights, the stage on its struts, the boat cap, and the tail (staart) down to the stage
//    with its braces and its winding wheel (kruirad).
// Both keep their former collision: the trestle or the base and the body stand in the records; the sails, the stage
// and the tail are dressing.
import {
  PartSink, faceBox, rgb, shade,
  type Face, type RegionalParts, type Rgb, type Vec3,
} from './geometry.ts';
import { buildHouse, emitRoof, holedFace, roofGeometry, type HoleRect, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, windowUnit, type WindowStyle } from './openings.ts';
import { beam, latticeSails, ringSolid, weatherboards } from './millWorks.ts';
import type { RegionalBuildContext } from './types.ts';

const IRON = rgb(0x1e1e1e);

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

export interface PostMillPalette {
  /** the buck's boards and sails, the frame's darker oak */
  timber: Rgb;
  dark: Rgb;
}

/** The post mill (see the head of the file), its sails on the +z breast, its door and ladder at the back. */
export function buildPostMill(ctx: RegionalBuildContext, p: PostMillPalette): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const { timber, dark } = p;
  const bw = 3.4, bd = 4.2, bh = 4.4, lift = 3.4;
  const crownTop = lift - 0.3, postTop = crownTop - 0.36;
  // the trestle: crosstrees on stone piers, the post, quarterbars up to the post under the crown tree
  for (const [x, z] of [[-2.2, 0], [2.2, 0], [0, -2.2], [0, 2.2]] as const) sink.span('stone', x - 0.35, -0.4, z - 0.35, x + 0.35, 0.45, z + 0.35);
  sink.span('structureWood', -2.4, 0.45, -0.17, 2.4, 0.8, 0.17, { colour: dark });
  sink.span('structureWood', -0.17, 0.45, -2.4, 0.17, 0.8, 2.4, { colour: dark });
  sink.span('structureWood', -0.22, 0.45, -0.22, 0.22, postTop, 0.22, { colour: dark });
  for (const [x, z] of [[-2.0, 0], [2.0, 0], [0, -2.0], [0, 2.0]] as const) {
    sink.member('structureWood', [x, 0.8, z], [x * 0.08, postTop - 0.5, z * 0.08], 0.16, 0.16, [x !== 0 ? 0 : 1, 0, x !== 0 ? 1 : 0], { colour: dark, exposed: true });
  }
  // the crown tree across the post's head, the buck's two sills on it, the floor's joist ends between them
  sink.span('structureWood', -bw / 2 + 0.1, postTop, -0.2, bw / 2 - 0.1, crownTop, 0.2, { colour: shade(dark, 0.9) });
  for (const sx of [-1, 1]) sink.span('structureWood', sx * (bw / 2 - 0.22) - 0.14, crownTop, -bd / 2 - 0.12, sx * (bw / 2 - 0.22) + 0.14, lift, bd / 2 + 0.12, { colour: dark });
  for (let z = -bd / 2 + 0.3; z < bd / 2 - 0.2; z += 0.6) sink.span('structureWood', -bw / 2 + 0.36, lift - 0.16, z - 0.06, bw / 2 - 0.36, lift, z + 0.06, { colour: shade(dark, 1.1), decor: true });
  // the buck: weatherboarded, its door and a light at the back, a window in each side by the stones, the shaft's neck
  const hubRel = bh * 0.82, hubY = lift + hubRel, hubZ = bd / 2 + 0.55;
  const openings: Opening[] = [
    { face: 'back', storey: 0, kind: 'door', u: 0, w: 0.9, y0: 0, h: 1.8 },
    { face: 'back', storey: 0, kind: 'window', u: 0, w: 0.5, h: 0.55, y0: 2.6 },
    { face: 'left', storey: 0, kind: 'window', u: 0.7, w: 0.5, h: 0.6, y0: 1.5 },
    { face: 'right', storey: 0, kind: 'window', u: -0.7, w: 0.5, h: 0.6, y0: 1.5 },
    { face: 'front', storey: 0, kind: 'loft', u: 0, w: 0.5, h: 0.5, y0: hubRel - 0.25 },
  ];
  const light: WindowStyle = {
    frame: shade(timber, 0.8), frameWidth: 0.05, frameOut: 0.03, bars: 'cross',
    surround: { bucket: 'structureWood', width: 0.08, out: 0.05, colour: dark }, sill: { bucket: 'structureWood', out: 0.06, colour: dark },
    shutters: { colour: shade(timber, 0.95), kind: 'plank', closed: 0.4 },
  };
  sink.placed(0, 0, lift, 0, () => {
    const frame = buildHouse(sink, {
      w: bw, d: bd, plinth: null, storeys: [{ h: bh, wall: 'wood' }],
      roof: { kind: 'gable', pitchDeg: 35, eave: 0.2, verge: 0.25, thickness: 0.1, bucket: 'roof', ridge: 'saddle' },
      gableBucket: 'wood', openings, chimneys: [], gutters: null, verge: null, reveal: 0.12, spall: null,
    }, {
      window: (s, face, o, y0) => {
        if (o.kind === 'loft') faceBox(s, 'dark', face, o.u, y0 + o.y0 + o.h / 2, -s.recess + 0.01, o.w, o.h, 0.02, { decor: true });
        else windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, light, rng, 0);
      },
      door: (s, face, o, y0) => doorUnit(s, face, o.u, y0, o.w, o.h, {
        leaf: timber, frame: { bucket: 'structureWood', width: 0.1, out: 0.04, colour: dark }, steps: null, leafKind: 'plank',
      }),
    });
    for (const [name, face] of Object.entries(frame.faces)) {
      const own = openings.filter((o) => o.face === name);
      weatherboards(sink, face, 0.02, bh, own.map((o) => ({ u0: o.u - o.w / 2 - 0.1, u1: o.u + o.w / 2 + 0.1, y0: o.y0 - 0.1, y1: o.y0 + o.h + 0.1 })),
        0.22, timber, rng);
    }
    // the corner boards over the courses' ends, and the breast beam under the windshaft's neck
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      sink.span('structureWood', sx * bw / 2 - 0.06, 0, sz * bd / 2 - 0.06, sx * bw / 2 + 0.06, bh, sz * bd / 2 + 0.06, { colour: dark, decor: true });
    }
    faceBox(sink, 'structureWood', frame.faces.front, 0, hubRel - 0.42, 0.1, bw + 0.12, 0.24, 0.2, { colour: dark, decor: true });
  });
  // the windshaft out of the neck to the poll end, the two stocks and their lattice sails
  sink.cylinder('structureWood', [0, hubY, bd / 2 - 0.3], 'z', hubZ - bd / 2 + 0.5, 0.18, 8, { colour: dark, decor: true });
  sink.placed(0, 0, hubY, hubZ, () => latticeSails(sink, {
    length: 7.2, heel: 2.0, pitch: 0.62, trailing: 0.95, leading: 0.32, phase: Math.PI / 4, stock: timber, lattice: timber, iron: IRON, stockW: 0.2,
  }));
  // the ladder from the door's sill to the ground, and the tail pole under it from the buck's sills to its stone
  const run = 4.2, lt: Vec3 = [0, lift + 0.02, -bd / 2 - 0.02], lb: Vec3 = [0, 0.05, -bd / 2 - run];
  for (const sx of [-0.45, 0.45]) sink.member('structureWood', [sx, lt[1], lt[2]], [sx, lb[1], lb[2]], 0.12, 0.1, [1, 0, 0], { colour: dark, exposed: true, decor: true });
  for (let t = 0.08; t < 0.97; t += 0.075) {
    const y = lt[1] + (lb[1] - lt[1]) * t, z = lt[2] + (lb[2] - lt[2]) * t;
    sink.member('structureWood', [-0.44, y, z], [0.5, y, z], 0.06, 0.05, [0, 1, 0], { colour: dark, exposed: true, decor: true, fine: true }, 0.025);
  }
  const slope = (lt[1] - lb[1]) / run, poleEnd = (lift - 0.25 - 0.32) / slope;
  beam(sink, 'structureWood', [0, lift - 0.25, -bd / 2 + 0.1], [0, lift - 0.25 - slope * (poleEnd + 0.1), -bd / 2 - poleEnd], 0.2, { colour: dark, decor: true });
  sink.span('stone', -0.3, -0.3, -bd / 2 - poleEnd - 0.3, 0.3, 0.32, -bd / 2 - poleEnd + 0.3, { decor: true });
  return sink.finish();
}

export interface SmockMillPalette {
  tar: Rgb;
  white: Rgb;
  /** the door's and the shutters' paint */
  door: Rgb;
}

/** The smock mill (see the head of the file), its sails and door on +z, its tail down to the stage at the back. */
export function buildSmockMill(ctx: RegionalBuildContext, p: SmockMillPalette): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const R0 = 3.0, baseH = 2.6, bodyH = 8.2, R1 = 1.7, reveal = 0.3, sill = 0.35;
  // the plinth course round the base's foot
  sink.cylinder('stone', [0, -0.4, 0], 'y', sill + 0.4, R0 + 0.14, 8, {}, R0 + 0.1, true, Math.PI / 8);
  // the brick base: eight faces, the door on +z and a window either side cut through them with their reveals
  const ap = R0 * Math.cos(Math.PI / 8), side = 2 * R0 * Math.sin(Math.PI / 8);
  const pane: WindowStyle = {
    frame: p.white, frameWidth: 0.05, frameOut: 0.03, bars: 'cross', surround: null, sill: { bucket: 'stone', out: 0.06 },
    shutters: { colour: p.door, kind: 'plank', closed: 0 },
  };
  for (let k = 0; k < 8; k++) {
    const phi = (k * Math.PI) / 4, ox = Math.cos(phi), oz = Math.sin(phi);
    const face: Face = { origin: [ox * ap, 0, oz * ap], u: [oz, 0, -ox], out: [ox, 0, oz], width: side };
    const holes: HoleRect[] = [];
    if (k === 2) holes.push({ u0: -0.55, u1: 0.55, y0: sill, y1: sill + 2.0 });
    if (k === 0 || k === 4) holes.push({ u0: -0.3, u1: 0.3, y0: 1.2, y1: 1.95 });
    holedFace(sink, 'stone', face, { u0: -side / 2, u1: side / 2, y0: -0.4, y1: baseH }, holes, reveal);
    if (!holes.length) continue;
    sink.recess = reveal;
    try {
      if (k === 2) {
        doorUnit(sink, face, 0, sill, 1.1, 2.0, { leaf: p.door, frame: { bucket: 'structureWood', width: 0.1, out: 0.05, colour: p.white },
          steps: { bucket: 'stone' }, leafKind: 'plank' }, sill);
      } else windowUnit(sink, face, 0, 1.2, 0.6, 0.75, pane, rng, 0.2);
    } finally { sink.recess = 0; }
  }
  const top: Vec3[] = [];
  for (let k = 0; k < 8; k++) {
    const a = -((k + 0.5) * Math.PI) / 4;
    top.push([Math.cos(a) * R0, baseH, Math.sin(a) * R0]);
  }
  sink.polygon('stone', top);
  // the thatched body, and its two framed lights standing out of the thatch, each under a straw hood
  sink.cylinder('straw', [0, baseH, 0], 'y', bodyH, R0 - 0.05, 8, {}, R1, true, Math.PI / 8);
  for (const [phi, y] of [[0, baseH + 3.2], [Math.PI, baseH + 5.6]] as const) {
    const r = (R0 - 0.05) + (R1 - (R0 - 0.05)) * (y - baseH) / bodyH, a = r * Math.cos(Math.PI / 8);
    const ox = Math.cos(phi), oz = Math.sin(phi);
    const f: Face = { origin: [ox * a, 0, oz * a], u: [oz, 0, -ox], out: [ox, 0, oz], width: 1 };
    const fc = { colour: p.white, decor: true } as const;
    for (const s of [-1, 1]) faceBox(sink, 'structureWood', f, s * 0.34, y + 0.4, 0.025, 0.07, 0.88, 0.45, fc);
    faceBox(sink, 'structureWood', f, 0, y + 0.875, 0.025, 0.75, 0.07, 0.45, fc);
    faceBox(sink, 'structureWood', f, 0, y - 0.035, 0.05, 0.82, 0.07, 0.5, fc);
    faceBox(sink, 'glass', f, 0, y + 0.42, 0.1, 0.62, 0.8, 0.02, { decor: true });
    faceBox(sink, 'structureWood', f, 0, y + 0.42, 0.12, 0.03, 0.8, 0.02, { ...fc, fine: true });
    faceBox(sink, 'straw', f, 0, y + 0.99, 0.12, 1.0, 0.16, 0.6, { decor: true });
  }
  // the stage at the base's top: a timber deck ring on struts and a rail
  const stageY = baseH + 0.1, sr = R0 + 1.5;
  for (let k = 0; k < 8; k++) {
    const a0 = ((k + 0.5) / 8) * Math.PI * 2, a1 = ((k + 1.5) / 8) * Math.PI * 2;
    const p0: Vec3 = [Math.cos(a0) * sr, stageY, Math.sin(a0) * sr], p1: Vec3 = [Math.cos(a1) * sr, stageY, Math.sin(a1) * sr];
    sink.member('structureWood', p0, p1, 0.16, 0.16, [0, 1, 0], { colour: p.tar, decor: true, exposed: true });
    sink.member('structureWood', [p0[0], stageY + 1.0, p0[2]], [p1[0], stageY + 1.0, p1[2]], 0.08, 0.08, [0, 1, 0], { colour: p.white, decor: true, exposed: true });
    sink.member('structureWood', [Math.cos(a0) * (R0 - 0.1), stageY - 1.6, Math.sin(a0) * (R0 - 0.1)], p0, 0.14, 0.14, [-Math.sin(a0), 0, Math.cos(a0)], { colour: p.tar, decor: true, exposed: true });
    sink.member('structureWood', p0, [p0[0], stageY + 1.0, p0[2]], 0.08, 0.08, [Math.cos(a0), 0, Math.sin(a0)], { colour: p.white, decor: true, exposed: true });
  }
  for (let k = 0; k < 8; k++) {
    const a0 = ((k + 0.5) / 8) * Math.PI * 2, a1 = ((k + 1.5) / 8) * Math.PI * 2;
    const pts: Vec3[] = [[Math.cos(a0) * sr, stageY + 0.08, Math.sin(a0) * sr], [Math.cos(a1) * sr, stageY + 0.08, Math.sin(a1) * sr],
      [Math.cos(a1) * (R0 + 0.05), stageY + 0.08, Math.sin(a1) * (R0 + 0.05)], [Math.cos(a0) * (R0 + 0.05), stageY + 0.08, Math.sin(a0) * (R0 + 0.05)]];
    sink.prism('structureWood', pts, [0, -1, 0], 0.08, { colour: p.tar, decor: true });
  }
  // the cap: a boat-shaped thatched hood on its boarded body and curb
  const capY = baseH + bodyH;
  const cap: RoofSpec = { kind: 'gable', pitchDeg: 55, eave: 0.3, verge: 0.4, thickness: 0.25, bucket: 'straw', ridge: 'round' };
  const capRg = roofGeometry(R1 * 2.1, R1 * 2.4, capY, cap);
  emitRoof(sink, capRg, cap);
  if (capRg.gable) sink.prism('structureWood', capRg.gable.map(([u, yy]): Vec3 => [u, yy, -capRg.halfD]), [0, 0, 1], 2 * capRg.halfD, { colour: p.tar, decor: true });
  sink.cylinder('structureWood', [0, capY - 0.2, 0], 'y', 0.4, R1 + 0.05, 8, { colour: p.tar }, R1 + 0.05, true, Math.PI / 8);
  // the tail from the cap's back down to the stage, its two braces from the cap's sides, the winding wheel at its foot
  const tailTop: Vec3 = [0, capY + 0.2, -R1 - 0.1], tailFoot: Vec3 = [0, stageY + 1.15, -(sr - 0.3)];
  beam(sink, 'structureWood', tailTop, tailFoot, 0.22, { colour: p.tar, decor: true });
  const along = (t: number): Vec3 => [0, tailTop[1] + (tailFoot[1] - tailTop[1]) * t, tailTop[2] + (tailFoot[2] - tailTop[2]) * t];
  for (const s of [-1, 1]) beam(sink, 'structureWood', [s * (R1 + 0.1), capY + 0.05, -0.5], along(0.42), 0.14, { colour: p.tar, decor: true });
  const wc: Vec3 = [0.16, tailFoot[1], tailFoot[2]];
  ringSolid(sink, 'structureWood', wc, [1, 0, 0], [0, 1, 0], [0, 0, 1], 0.72, 0.84, 0.08, 16, { colour: p.tar, decor: true });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI, c = Math.cos(a), s2 = Math.sin(a);
    beam(sink, 'structureWood', [0.2, wc[1] - c * 0.74, wc[2] - s2 * 0.74], [0.2, wc[1] + c * 0.74, wc[2] + s2 * 0.74], 0.06, { colour: p.tar, decor: true });
  }
  sink.cylinder('structureMetal', [-0.12, wc[1], wc[2]], 'x', 0.42, 0.06, 8, { colour: IRON, decor: true });
  // the windshaft out of the cap's breast to the poll end, the two stocks and their lattice sails
  const hubY = capY + 0.9, hubZ = R1 + 0.9;
  sink.cylinder('structureWood', [0, hubY, R1 - 0.2], 'z', 1.2, 0.24, 8, { colour: p.tar, decor: true });
  sink.placed(0, 0, hubY, hubZ, () => latticeSails(sink, {
    length: 11.5, heel: 2.6, pitch: 0.7, trailing: 1.1, leading: 0.36, phase: Math.PI / 4 + 0.12, stock: p.tar, lattice: p.white, iron: IRON, stockW: 0.26,
  }));
  return sink.finish();
}
