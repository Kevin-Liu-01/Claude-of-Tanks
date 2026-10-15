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
import { PartSink, faceBox, rgb, shade, type Face, type Rgb, type Vec3 } from './geometry.ts';
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
  if (spec.doors !== 'none') openings.push({ face: 'front', storey: 0, kind: 'gate', u: 0, w: spec.doorW, y0: 0, h: Math.min(spec.doorH, wall - 0.5) });
  if (spec.backDoor !== null) openings.push({ face: 'back', storey: 0, kind: 'door', u: spec.backDoor, w: 1.0, y0: 0, h: 2.2 });
  if (spec.sideDoor !== undefined && spec.sideDoor !== null) openings.push({ face: 'right', storey: 0, kind: 'door', u: spec.sideDoor, w: 1.0, y0: 0, h: 2.2 });
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
      w, d, plinth: spec.kerb > 0 ? { h: spec.kerb, out: 0.05, bucket: 'stone' } : null, storeys: [{ h: wall, wall: 'structureMetal' }],
      roof: { kind: 'gable', pitchDeg: spec.pitchDeg, eave: 0.4, verge: 0.3, thickness: 0.1, bucket: 'roof', ridge: 'saddle' },
      gableBucket: 'structureMetal', openings, chimneys: [], gutters: null, verge: null, reveal: 0, spall: null,
    }, {
      // the lights: translucent sheet in a thin aluminium frame
      window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { frame: shade(spec.trim, 1.3), frameWidth: 0.05, frameOut: 0.03, bars: 'two', surround: null, sill: null, shutters: null }, variant, 0.1),
      door: (s, face, o, y0) => {
        if (o.kind === 'gate') return hallDoors(s, face, o, y0, spec);
        doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: spec.doorLivery, frame: { bucket: 'structureMetal', width: 0.08, out: 0.04, colour: spec.trim }, steps: null, leafKind: 'plank' }, y0 + o.y0);
      },
    });
  } finally { sink.paint = null; }
  const y0 = frame.floors[0], rg = frame.roof, tanP = Math.tan(spec.pitchDeg * Math.PI / 180);
  // the inside, seen through the open doors: the floor, the walls' inner faces and the roof's underside, the portal frames
  const ix = w / 2 - 0.06, iz = d / 2 - 0.06, top = (x: number) => eave + (w / 2 - Math.abs(x)) * tanP - 0.12;
  sink.quad('structureMetal', [-ix, y0 + 0.01, iz], [ix, y0 + 0.01, iz], [ix, y0 + 0.01, -iz], [-ix, y0 + 0.01, -iz], { colour: FLOOR, decor: true });
  sink.quad('structureMetal', [-ix, y0, -iz], [ix, y0, -iz], [ix, eave - 0.05, -iz], [-ix, eave - 0.05, -iz], { colour: INSIDE, decor: true });
  sink.polygon('structureMetal', [[ix, eave - 0.05, -iz], [0, top(0), -iz], [-ix, eave - 0.05, -iz]], { colour: INSIDE, decor: true });
  for (const s of [-1, 1]) {
    const x = s * ix, a: Vec3 = [x, y0, s > 0 ? -iz : iz], b: Vec3 = [x, y0, s > 0 ? iz : -iz];
    sink.quad('structureMetal', a, b, [b[0], eave - 0.05, b[2]], [a[0], eave - 0.05, a[2]], { colour: INSIDE, decor: true });
    // the roof's underside, each slope from the eave to the ridge
    const e: Vec3 = [x, eave - 0.05, -iz], f: Vec3 = [x, eave - 0.05, iz], r0: Vec3 = [0, top(0), iz], r1: Vec3 = [0, top(0), -iz];
    if (s > 0) sink.quad('structureMetal', e, f, r0, r1, { colour: shade(INSIDE, 1.2), decor: true });
    else sink.quad('structureMetal', f, e, r1, r0, { colour: shade(INSIDE, 1.2), decor: true });
  }
  const bays = Math.max(2, Math.round(d / 5));
  for (let k = 1; k < bays; k++) {
    const z = -iz + 2 * iz * k / bays;
    for (const s of [-1, 1]) {
      sink.member('structureMetal', [s * (ix - 0.12), y0, z], [s * (ix - 0.12), eave - 0.2, z], 0.22, 0.14, [s, 0, 0], { colour: FRAME, decor: true }, 0);
      sink.member('structureMetal', [s * (ix - 0.12), eave - 0.2, z], [0, top(0) - 0.12, z], 0.24, 0.12, [0, 1, 0], { colour: FRAME, decor: true }, 0);
    }
  }
  sink.dressing(spec.mobile, () => {
    // the sheet's seams along the long walls and its corner flashings
    for (const name of ['left', 'right'] as const) {
      const f = frame.faces[name];
      for (let u = -f.width / 2 + 1.5; u < f.width / 2 - 0.6; u += 3) faceBox(sink, 'structureMetal', f, u, y0 + wall / 2, -0.02, 0.08, wall, 0.06, { colour: shade(spec.livery, 0.82), decor: true }, 'caps');
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
      const rt = rg.ridgeTopY;
      sink.span('structureMetal', -0.35, rt - 0.08, -d * 0.3, 0.35, rt + 0.35, d * 0.3, { colour: shade(spec.livery, 0.75), decor: true });
      sink.span('structureMetal', -0.55, rt + 0.35, -d * 0.3 - 0.1, 0.55, rt + 0.43, d * 0.3 + 0.1, { colour: shade(spec.livery, 0.9), decor: true });
      for (const s of [-1, 1]) for (let z = -d * 0.3 + 0.2; z < d * 0.3; z += 0.4) {
        sink.span('structureMetal', s * 0.35 - 0.02, rt + 0.02, z - 0.08, s * 0.35 + 0.02, rt + 0.3, z + 0.08, { colour: INSIDE, decor: true, fine: true });
      }
    }
  });
  return frame;
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
  for (const [u, track] of leaves) {
    faceBox(sink, 'structureMetal', face, u, lift + H / 2 + 0.05, track, lw, H + 0.1, 0.1, { colour: spec.doorLivery });
    if (!spec.mobile) {
      for (const f of [0.25, 0.5, 0.75]) faceBox(sink, 'structureMetal', face, u - lw / 2 + lw * f, lift + H / 2, track + 0.07, 0.1, H - 0.3, 0.05, { colour: shade(spec.doorLivery, 0.8), decor: true });
      faceBox(sink, 'structureMetal', face, u, lift + H * 0.45, track + 0.07, lw - 0.2, 0.12, 0.05, { colour: shade(spec.doorLivery, 0.8), decor: true });
    }
  }
  // (the box and track from the opening's left jamb to past the farthest leaf's edge)
  const r0 = o.u - W / 2 - 0.3, r1 = Math.max(o.u + W / 2 + 0.3, leaves[0][0] + lw / 2 + 0.1), rc = (r0 + r1) / 2, rw = r1 - r0;
  faceBox(sink, 'structureMetal', face, rc, lift + H + 0.22, 0.24, rw, 0.34, 0.44, { colour: spec.trim });
  faceBox(sink, 'structureMetal', face, rc, lift + 0.025, 0.24, rw, 0.05, 0.44, { colour: shade(spec.trim, 0.8), decor: true });
}

