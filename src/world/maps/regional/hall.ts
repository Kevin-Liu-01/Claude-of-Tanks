// src/world/maps/regional/hall.ts — the steel-framed sheet hall the kits' depots, warehouses, hangars and goods sheds
// share (props census #4, lane B 2026-10-14; the judges: "a span box of sheet with its doors laid on as plates, its lights
// glass panels stuck on, a painted dark slot for the open leaf", the counter-example class).
//
// A portal-frame hall of profiled sheet on a concrete kerb: the house grammar's walls (house.ts buildHouse, its plan
// registered so the damage reads it as a house), cut by the apron's door opening, the personnel doors and the band of
// lights under the eaves; the doors hung in front of the opening on their tracks — sliding leaves (one run across the
// other where the hall stands open) under a head box, or a roller curtain part raised under its drum; through the gap the
// hall's own inside — its floor, the far wall and the portal frames — not a painted slot. Outside, the sheet's seams and
// corner flashings, gutters and downpipes, roof lights in the slopes and a louvred ridge vent.
import { PartSink, faceBox, facePoint, rgb, shade, type Face, type RegionalBucket, type Rgb, type Vec3 } from './geometry.ts';
import { buildHouse, type HouseFrame, type Opening } from './house.ts';
import { doorUnit, windowUnit } from './openings.ts';

export interface HallSpec {
  /** the body across (x) and along (z), its front (+z) the apron gable; the eave height over the floor */
  w: number;
  d: number;
  eave: number;
  pitchDeg: number;
  /** the concrete kerb wall the sheet stands on (0: on a slab) */
  kerb: number;
  livery: Rgb;
  doorLivery: Rgb;
  trim: Rgb;
  /** the apron door: sliding leaves, a roller curtain or none; its clear width and height; how far it stands open (0..1) */
  doors: 'sliding' | 'roller' | 'none';
  doorW: number;
  doorH: number;
  open: number;
  /** the apron doors' centres along the front (default one, centred) */
  doorAt?: readonly number[];
  /** the apron doors again in the back gable, centred (a drive-through barn); the leaves of planks, not sheet */
  backGate?: boolean;
  leaf?: 'sheet' | 'plank';
  /** a personnel door in the back gable at u (null: none); one in a side wall at u (null: none) */
  backDoor: number | null;
  sideDoor?: number | null;
  /** the band of lights under the eaves along the long sides */
  clerestory: boolean;
  /** translucent sheets in the roof slopes, the louvred ridge vent */
  roofLights: boolean;
  ridgeVent: boolean;
  gutters: boolean;
  /** dressing on desktop only */
  mobile: boolean;
  /** shell holes the war tore in the sheet (face, centre u and y over the floor, width, height): open onto the inside */
  tears?: ReadonlyArray<{ face: 'left' | 'right' | 'back'; u: number; y: number; w: number; h: number }>;
  /** the covering's bucket and paint (default the kit's roof bucket); a long side open in `bays` between posts (a naya) */
  roof?: { bucket: RegionalBucket; colour?: Rgb };
  openSide?: { face: 'left' | 'right'; bays: number; post: number; head: number } | null;
}

const INSIDE = rgb(0x2c2e2f), FLOOR = rgb(0x4a4844), FRAME = rgb(0x3c4144);

/**
 * Lay a sheet hall at the emitting frame's origin (its floor at y = 0 on the kerb's top when it has one). Returns the
 * house frame (its faces, eave and roof) for a kit's own additions.
 */
export function sheetHall(sink: PartSink, spec: HallSpec, variant: () => number): HouseFrame {
  const { w, d, eave } = spec;
  const wall = eave - spec.kerb;
  const openings: Opening[] = [];
  if (spec.doors !== 'none') for (const u of spec.doorAt ?? [0]) openings.push({ face: 'front', storey: 0, kind: 'gate', u, w: spec.doorW, y0: 0, h: Math.min(spec.doorH, wall - 0.5) });
  if (spec.backGate && spec.doors !== 'none') openings.push({ face: 'back', storey: 0, kind: 'gate', u: 0, w: spec.doorW, y0: 0, h: Math.min(spec.doorH, wall - 0.5) });
  if (spec.backDoor !== null) openings.push({ face: 'back', storey: 0, kind: 'door', u: spec.backDoor, w: 1.0, y0: 0, h: 2.2 });
  if (spec.sideDoor !== undefined && spec.sideDoor !== null) openings.push({ face: 'right', storey: 0, kind: 'door', u: spec.sideDoor, w: 1.0, y0: 0, h: 2.2 });
  if (spec.openSide) {
    // the open side: one hole a bay between the posts the wall leaves standing, up to the head beam under the eave
    const o = spec.openSide, span = d / o.bays;
    for (let k = 0; k < o.bays; k++) {
      const u0 = -d / 2 + k * span + (k === 0 ? o.post : o.post / 2), u1 = -d / 2 + (k + 1) * span - (k === o.bays - 1 ? o.post : o.post / 2);
      openings.push({ face: o.face, storey: 0, kind: 'loft', u: (u0 + u1) / 2, w: u1 - u0, y0: 0, h: wall - o.head });
    }
  }
  for (const t of spec.tears ?? []) openings.push({ face: t.face, storey: 0, kind: 'loft', u: t.u, w: t.w, y0: t.y - t.h / 2, h: t.h });
  if (spec.clerestory) {
    for (const face of ['left', 'right'] as const) {
      for (let u = -d / 2 + 2.2; u < d / 2 - 1.6; u += 4.4) {
        if (face === 'right' && spec.sideDoor !== undefined && spec.sideDoor !== null && Math.abs(u - spec.sideDoor) < 2.2) continue;
        openings.push({ face, storey: 0, kind: 'window', u, w: 3.0, y0: wall - 1.25, h: 0.7 });
      }
    }
  }
  let frame!: HouseFrame;
  sink.paint = spec.livery;
  try {
    frame = buildHouse(sink, {
      w, d, plinth: spec.kerb > 0 ? { h: spec.kerb, out: 0.05, bucket: 'stone', course: false } : null, storeys: [{ h: wall, wall: 'structureMetal' }],
      roof: { kind: 'gable', pitchDeg: spec.pitchDeg, eave: 0.4, verge: 0.3, thickness: 0.1, bucket: spec.roof?.bucket ?? 'roof', ridge: 'saddle' }, ...(spec.roof?.colour ? { roofColour: spec.roof.colour } : {}),
      gableBucket: 'structureMetal', openings, chimneys: [], gutters: null, verge: null, reveal: 0, spall: null, hollow: true,
    }, {
      // the lights: translucent sheet in a thin aluminium frame
      // (the sheet has no reveal: the lights hang 13 cm inside the cut in their lined boxes, the hall's inside behind them —
      // never a plate proud of the sheet over a hole)
      window: (s, face, o, y0) => {
        if (o.kind === 'loft') return;
        s.recess = 0.13;
        try { windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { frame: shade(spec.trim, 1.3), frameWidth: 0.05, frameOut: 0.03, bars: 'two', surround: null, sill: null, shutters: null }, variant, 0.1); }
        finally { s.recess = 0; }
        // the sheet's back, seen from the hall's floor (the pane a single face out to the yard)
        const B = (uu: number, yy: number): Vec3 => facePoint(face, uu, yy, -0.118);
        s.quad('glass', B(o.u + o.w / 2, y0 + o.y0), B(o.u - o.w / 2, y0 + o.y0), B(o.u - o.w / 2, y0 + o.y0 + o.h), B(o.u + o.w / 2, y0 + o.y0 + o.h), { decor: true });
        // the cut's lining: the sheet's flashing round the opening, back to the light's frame
        const c = { colour: shade(spec.trim, 1.15), decor: true };
        for (const sx of [-1, 1]) faceBox(s, 'structureMetal', face, o.u + sx * (o.w / 2 + 0.01), y0 + o.y0 + o.h / 2, -0.055, 0.02, o.h + 0.04, 0.17, c);
        for (const yy of [y0 + o.y0 - 0.01, y0 + o.y0 + o.h + 0.01]) faceBox(s, 'structureMetal', face, o.u, yy, -0.055, o.w, 0.02, 0.17, c);
      },
      door: (s, face, o, y0) => {
        if (o.kind === 'gate') return hallDoors(s, face, o, y0, spec);
        // (a wicket hangs 15 cm in, inside the cut's lining, behind its frame: the reveal the sheet hasn't got)
        s.recess = 0.15;
        try { doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: spec.doorLivery, frame: { bucket: 'structureMetal', width: 0.08, out: 0.04, colour: spec.trim }, steps: null, leafKind: 'plank' }, y0 + o.y0); }
        finally { s.recess = 0; }
        // the leaf's back to the hall (a door unit seated in a wall leaves it out)
        const B = (uu: number, yy: number): Vec3 => facePoint(face, uu, yy, -0.149);
        s.quad('structureWood', B(o.u + o.w / 2, y0 + o.y0), B(o.u - o.w / 2, y0 + o.y0), B(o.u - o.w / 2, y0 + o.y0 + o.h), B(o.u + o.w / 2, y0 + o.y0 + o.h),
          { colour: shade(spec.doorLivery, 0.85), decor: true });
        const c = { colour: shade(spec.trim, 1.15), decor: true };
        for (const sx of [-1, 1]) faceBox(s, 'structureMetal', face, o.u + sx * (o.w / 2 - 0.01), y0 + o.y0 + o.h / 2, -0.06, 0.02, o.h, 0.18, c);
        faceBox(s, 'structureMetal', face, o.u, y0 + o.y0 + o.h - 0.01, -0.06, o.w - 0.04, 0.02, 0.18, c);
      },
    });
  } finally { sink.paint = null; }
  const y0 = frame.floors[0], rg = frame.roof, tanP = Math.tan(spec.pitchDeg * Math.PI / 180);
  // the inside, seen through the open doors: the floor, the walls' inner faces and the roof's underside, the portal frames
  const ix = w / 2 - 0.06, iz = d / 2 - 0.06, top = (x: number) => eave + (w / 2 - Math.abs(x)) * tanP - 0.12;
  sink.quad('structureMetal', [-ix, y0 + 0.01, iz], [ix, y0 + 0.01, iz], [ix, y0 + 0.01, -iz], [-ix, y0 + 0.01, -iz], { colour: FLOOR, decor: true });
  const back = spec.openSide ? shade(spec.livery, 0.55) : INSIDE;
  // (the inner walls cut where the outer ones are: through a light or a door the hall's space, not a wall behind it; a
  // light's cut opens to its lining's outer face, 2 cm round, so the lining's box closes the edge between the two sheets)
  const holesOf = (name: 'left' | 'right' | 'back' | 'front'): Array<[number, number, number, number]> => openings.filter((o) => o.face === name)
    .map((o) => { const m = o.kind === 'window' ? 0.02 : 0; return [-(o.u + o.w / 2) - m, -(o.u - o.w / 2) + m, y0 + o.y0 - m, y0 + o.y0 + o.h + m] as [number, number, number, number]; });
  linerWall(sink, { origin: [0, 0, -iz], u: [1, 0, 0], out: [0, 0, 1], width: 2 * ix }, -ix, ix, y0, eave - 0.05, holesOf('back'), back);
  sink.polygon('structureMetal', [[ix, eave - 0.05, -iz], [0, top(0), -iz], [-ix, eave - 0.05, -iz]], { colour: back, decor: true });
  // (and the apron gable's inside round its doors: through an open side or a door the front wall's back showed)
  linerWall(sink, { origin: [0, 0, iz], u: [-1, 0, 0], out: [0, 0, -1], width: 2 * ix }, -ix, ix, y0, eave - 0.05, holesOf('front'), back);
  sink.polygon('structureMetal', [[-ix, eave - 0.05, iz], [0, top(0), iz], [ix, eave - 0.05, iz]], { colour: back, decor: true });
  // (an open-sided barn takes the day in: its inside a shade of its own sheet, and no liner behind its open side)
  const inside = spec.openSide ? shade(spec.livery, 0.55) : INSIDE;
  for (const s of [-1, 1]) {
    const x = s * ix, a: Vec3 = [x, y0, s > 0 ? -iz : iz], b: Vec3 = [x, y0, s > 0 ? iz : -iz];
    // (an open side's liner too: its posts' and head's backs, the bays cut out of it)
    {
      const lf: Face = { origin: [x, 0, 0], u: [0, 0, s > 0 ? 1 : -1], out: [-s, 0, 0], width: 2 * iz };
      linerWall(sink, lf, -iz, iz, y0, eave - 0.05, holesOf(s > 0 ? 'right' : 'left'), inside);
    }
    void a; void b;
    // the roof's underside, each slope from the eave to the ridge
    const e: Vec3 = [x, eave - 0.05, -iz], f: Vec3 = [x, eave - 0.05, iz], r0: Vec3 = [0, top(0), iz], r1: Vec3 = [0, top(0), -iz];
    if (s > 0) sink.quad('structureMetal', e, f, r0, r1, { colour: shade(back, 1.2), decor: true });
    else sink.quad('structureMetal', f, e, r1, r0, { colour: shade(back, 1.2), decor: true });

  }
  const bays = Math.max(2, Math.round(d / 5));
  for (let k = 1; k < bays; k++) {
    const z = -iz + 2 * iz * k / bays;
    for (const s of [-1, 1]) {
      // (a framing member shows its face and sides, not its back: the column's face into the hall, its back on the
      // liner; the rafter's face down to the floor, its back up under the roof)
      sink.member('structureMetal', [s * (ix - 0.01), y0, z], [s * (ix - 0.01), eave - 0.2, z], 0.22, 0.14, [-s, 0, 0], { colour: FRAME, decor: true }, 0);
      sink.member('structureMetal', [s * (ix - 0.08), eave - 0.08, z], [0, top(0), z], 0.24, 0.12, [0, -1, 0], { colour: FRAME, decor: true }, 0);
    }
  }
  sink.dressing(spec.mobile, () => {
    // the sheet's seams along the long walls and its corner flashings
    for (const name of ['left', 'right'] as const) {
      const f = frame.faces[name];
      for (let u = -f.width / 2 + 1.5; u < f.width / 2 - 0.6; u += 3) faceBox(sink, 'structureMetal', f, u, y0 + wall / 2, 0.01, 0.08, wall, 0.02, { colour: shade(spec.livery, 0.82), decor: true }, 'caps');
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      sink.span('structureMetal', sx * w / 2 - (sx > 0 ? 0.04 : 0.06), y0, sz * d / 2 - (sz > 0 ? 0.04 : 0.06), sx * w / 2 + (sx > 0 ? 0.06 : 0.04), eave, sz * d / 2 + (sz > 0 ? 0.06 : 0.04),
        { colour: shade(spec.trim, 1.1), decor: true });
    }
    // the gutters along the eaves under the roof's edge, a downpipe at each corner to the kerb
    if (spec.gutters) {
      const ex = w / 2 + 0.4 - 0.05, ey = eave - 0.4 * tanP;
      for (const s of [-1, 1]) {
        sink.span('structureMetal', s * ex - 0.08, ey - 0.16, -d / 2 - 0.3, s * ex + 0.08, ey + 0.02, d / 2 + 0.3, { colour: spec.trim, decor: true });
        for (const sz of [-1, 1]) {
          const px = s * (w / 2 + 0.05), pz = sz * (d / 2 - 0.25);
          sink.span('structureMetal', Math.min(px, s * ex) - 0.04, ey - 0.2, pz - 0.04, Math.max(px, s * ex) + 0.04, ey - 0.12, pz + 0.04, { colour: spec.trim, decor: true, fine: true });
          sink.span('structureMetal', px - 0.04, y0 - 0.05, pz - 0.04, px + 0.04, ey - 0.12, pz + 0.04, { colour: spec.trim, decor: true, fine: true });
        }
      }
    }
    // the roof lights: translucent sheets let into each slope every other bay; the louvred vent along the ridge
    const slope = (s: number, z0: number, z1: number, lift: number, colour: Rgb) => {
      const ya = eave + 0.15 * tanP + 0.08 + lift, yb = rg.ridgeY - 0.6 * tanP + 0.08 + lift;
      const xa = s * (w / 2 - 0.15), xb = s * 0.6;
      const p: Vec3[] = [[xa, ya, z0], [xa, ya, z1], [xb, yb, z1], [xb, yb, z0]];
      sink.quad('structureMetal', ...((s > 0 ? [p[0], p[3], p[2], p[1]] : p) as [Vec3, Vec3, Vec3, Vec3]), { colour, decor: true });
    };
    if (spec.roofLights) for (let k = 0; k < bays; k += 2) {
      const z0 = -d / 2 + (k + 0.25) * d / bays, z1 = -d / 2 + (k + 0.75) * d / bays;
      for (const s of [-1, 1]) slope(s, z0, z1, 0.02, rgb(0xcfd3c8));
    }
    if (spec.ridgeVent) {
      // the vent over its slot in the ridge: a kerb, the dark throat standing in the slot, the cap on its end plates, and
      // each side open under the cap but for the louvre blades running its length, 23 cm proud of the throat (the dark
      // between the blades the hall's air, never slats stuck on a box)
      const rt = rg.ridgeTopY, z0 = -d * 0.3, z1 = d * 0.3;
      sink.span('structureMetal', -0.35, rt - 0.08, z0, 0.35, rt + 0.02, z1, { colour: shade(spec.livery, 0.75), decor: true });
      sink.span('structureMetal', -0.12, rt + 0.02, z0, 0.12, rt + 0.35, z1, { colour: INSIDE, decor: true });
      sink.span('structureMetal', -0.55, rt + 0.35, z0 - 0.1, 0.55, rt + 0.43, z1 + 0.1, { colour: shade(spec.livery, 0.9), decor: true });
      for (const z of [z0, z1]) sink.span('structureMetal', -0.37, rt + 0.02, z - 0.01, 0.37, rt + 0.35, z + 0.01, { colour: shade(spec.livery, 0.75), decor: true });
      // (the blades in lengths of at most 6 m: a 15 mm blade 17 m long is a sliver to the integrity gate)
      const nb = Math.max(1, Math.ceil((z1 - z0) / 6));
      for (const s of [-1, 1]) for (const y of [rt + 0.09, rt + 0.18, rt + 0.27]) for (let k = 0; k < nb; k++) {
        const za = z0 + (z1 - z0) * k / nb, zb = z0 + (z1 - z0) * (k + 1) / nb;
        sink.span('structureMetal', s * 0.35 - 0.04, y, za, s * 0.35 + 0.04, y + 0.015, zb, { colour: shade(spec.livery, 0.8), decor: true, fine: true });
      }
    }
  });
  return frame;
}

/**
 * An inner wall's face (decor, facing into the hall) from (u0, y0) to (u1, y1), less its holes [u0, u1, y0, y1]: in
 * columns between the holes' sides, each column the wall less the holes that cross it.
 */
function linerWall(sink: PartSink, face: Face, u0: number, u1: number, y0: number, y1: number, holes: ReadonlyArray<readonly [number, number, number, number]>, colour: Rgb): void {
  const cuts = [...new Set([u0, u1, ...holes.flatMap((h) => [Math.max(u0, Math.min(u1, h[0])), Math.max(u0, Math.min(u1, h[1]))])])].sort((p, q) => p - q);
  const p = (u: number, y: number): Vec3 => [face.origin[0] + face.u[0] * u, y, face.origin[2] + face.u[2] * u];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i], b = cuts[i + 1];
    if (b - a < 1e-3) continue;
    const mid = (a + b) / 2;
    const gaps = holes.filter((h) => h[0] < mid && h[1] > mid).map((h) => [Math.max(y0, h[2]), Math.min(y1, h[3])] as [number, number]).sort((q, r) => q[0] - r[0]);
    let y = y0;
    for (const [g0, g1] of [...gaps, [y1, y1] as [number, number]]) {
      if (g0 - y > 1e-3) sink.quad('structureMetal', p(a, y), p(b, y), p(b, g0), p(a, g0), { colour, decor: true });
      y = Math.max(y, g1);
    }
  }
}

/** The apron doors over their cut opening: sliding leaves on their tracks under a head box, or a roller curtain. */
function hallDoors(sink: PartSink, face: Face, o: Opening, y0: number, spec: HallSpec): void {
  const W = o.w, H = o.h, lift = y0;
  if (spec.doors === 'roller') {
    // the drum's box over the opening, the guides each side, the curtain down from it to where it stands
    const down = H * (1 - spec.open);
    faceBox(sink, 'structureMetal', face, o.u, lift + H + 0.3, 0.25, W + 0.4, 0.6, 0.5, { colour: shade(spec.doorLivery, 0.85) });
    for (const s of [-1, 1]) faceBox(sink, 'structureMetal', face, o.u + s * (W / 2 + 0.08), lift + H / 2, 0.08, 0.16, H, 0.16, { colour: spec.trim });
    if (down > 0.05) {
      faceBox(sink, 'structureMetal', face, o.u, lift + H - down / 2, 0.06, W, down, 0.04, { colour: spec.doorLivery });
      if (!spec.mobile) for (let y = lift + H - 0.12; y > lift + H - down; y -= 0.12) faceBox(sink, 'structureMetal', face, o.u, y, 0.085, W, 0.015, 0.01, { colour: shade(spec.doorLivery, 0.78), decor: true, fine: true });
      faceBox(sink, 'structureMetal', face, o.u, lift + H - down + 0.04, 0.09, W, 0.08, 0.06, { colour: shade(spec.doorLivery, 0.7), decor: true });
    }
    return;
  }
  // two leaves, each half the opening and a hand wider: the right closed on the inner track, the left run across it on
  // the outer track by `open` of its width; the head box over them, the bottom track along the apron
  const lw = W / 2 + 0.15, open = spec.open;
  const leaves: Array<[number, number]> = [[o.u - W / 4 + open * lw, 0.32], [o.u + W / 4, 0.12]];
  const lb: RegionalBucket = spec.leaf === 'plank' ? 'structureWood' : 'structureMetal';
  for (const [u, track] of leaves) {
    faceBox(sink, lb, face, u, lift + H / 2 + 0.05, track, lw, H + 0.1, 0.1, { colour: spec.doorLivery });
    if (!spec.mobile && lb === 'structureWood') {
      // a plank leaf: its ledges across and the braces between them, the boards' joints down it
      const c = { colour: shade(spec.doorLivery, 0.85), decor: true };
      for (const t of [0.12, 0.5, 0.88]) faceBox(sink, lb, face, u, lift + H * t, track + 0.07, lw - 0.1, 0.16, 0.04, c);
      for (const [a, b] of [[0.12, 0.5], [0.5, 0.88]] as const) {
        const p0 = facePoint(face, u - lw / 2 + 0.15, lift + H * a + 0.08, track + 0.07), p1 = facePoint(face, u + lw / 2 - 0.15, lift + H * b - 0.08, track + 0.07);
        sink.member(lb, p0, p1, 0.12, 0.035, face.out, c, 0.015);
      }
      for (let j = 1; j < Math.round(lw / 0.22); j++) faceBox(sink, lb, face, u - lw / 2 + j * lw / Math.round(lw / 0.22), lift + H / 2 + 0.05, track + 0.051, 0.012, H + 0.06, 0.004, { colour: shade(spec.doorLivery, 0.6), decor: true, fine: true }, 'caps');
    } else if (!spec.mobile) {
      for (const f of [0.25, 0.5, 0.75]) faceBox(sink, 'structureMetal', face, u - lw / 2 + lw * f, lift + H / 2, track + 0.07, 0.1, H - 0.3, 0.05, { colour: shade(spec.doorLivery, 0.8), decor: true });
      faceBox(sink, 'structureMetal', face, u, lift + H * 0.45, track + 0.07, lw - 0.2, 0.12, 0.05, { colour: shade(spec.doorLivery, 0.8), decor: true });
    }
  }
  // (the box and track from the opening's left jamb to past the farthest leaf's edge)
  const r0 = o.u - W / 2 - 0.3, r1 = Math.max(o.u + W / 2 + 0.3, leaves[0][0] + lw / 2 + 0.1), rc = (r0 + r1) / 2, rw = r1 - r0;
  faceBox(sink, 'structureMetal', face, rc, lift + H + 0.22, 0.24, rw, 0.34, 0.44, { colour: spec.trim });
  faceBox(sink, 'structureMetal', face, rc, lift + 0.025, 0.24, rw, 0.05, 0.44, { colour: shade(spec.trim, 0.8), decor: true });
}

