// src/world/maps/regional/house.ts — the shared house grammar of the regional architecture kits (regional-buildings
// lane, 2026-10-03). One rectangular body (plinth, storeys with optional jetties, gable or half-hip or hip or flat
// roof, gable walls, chimneys, gutters) laid out in the building's local frame with the ridge along Z, plus the
// window/door rhythm of each face. A style supplies a dialect: how a window, a door and (for half-timbered regions) a
// framed wall are dressed. Every body is centred on the origin with its base at y = 0, like the props builders.
import {
  PartSink, bodyFaces, facePoint, faceBox, normalize3,
  type Face, type RegionalBucket, type Rgb, type Vec3, type EmitOptions,
} from './geometry.ts';

export type RoofKind = 'gable' | 'halfhip' | 'hip' | 'flat' | 'shed';

export interface RoofSpec {
  kind: RoofKind;
  pitchDeg: number;
  /** horizontal eave overhang past the eaves walls (m) */
  eave: number;
  /** overhang past the gable walls (m) */
  verge: number;
  /** slab thickness (m) */
  thickness: number;
  bucket: RegionalBucket;
  /** half-hip: the fraction of the roof height the hip takes (0.3–0.5) */
  hipFrac?: number;
  /** hip pitch (defaults to the main pitch for a hip, 62° for a half-hip) */
  hipPitchDeg?: number;
  /** ridge cap profile */
  ridge?: 'round' | 'saddle' | null;
  /** flat roof parapet height (m) */
  parapet?: number;
  /** dressing only (a second covering over a structural slab): no collision */
  decor?: boolean;
}

export interface StoreySpec {
  h: number;
  wall: RegionalBucket;
  /** timber-framed storey (the dialect's dressWall runs on it) */
  framed?: boolean;
  /** outward offset of this storey's faces over the one below (front, right, back, left) */
  jetty?: readonly [number, number, number, number];
}

export type FaceName = 'front' | 'right' | 'back' | 'left';

export interface Opening {
  face: FaceName;
  storey: number;
  kind: 'window' | 'door' | 'gate' | 'shopfront' | 'loft';
  /** centre along the face */
  u: number;
  w: number;
  /** bottom above the storey floor */
  y0: number;
  h: number;
}

export interface ChimneySpec {
  /** position in the body frame */
  x: number;
  z: number;
  /** stack section (m) */
  sx: number;
  sz: number;
  /** metres above the local roof surface the stack rises */
  above: number;
  bucket: RegionalBucket;
  /** cap style */
  cap?: 'slab' | 'tile' | 'pots' | 'none';
  /** a gable-end stack standing in the gable wall (Breton): rises from the ground inside the wall */
  inWall?: boolean;
}

export interface HouseSpec {
  w: number;
  d: number;
  plinth: { h: number; out: number; bucket: RegionalBucket } | null;
  storeys: StoreySpec[];
  roof: RoofSpec;
  /** the wall bucket of the gable triangles (defaults to the top storey's wall) */
  gableBucket?: RegionalBucket;
  /** the gable triangles are timber framed */
  gableFramed?: boolean;
  openings: Opening[];
  chimneys: ChimneySpec[];
  gutters?: { colour: Rgb } | null;
  /** verge boards along the gable rakes */
  verge?: { colour: Rgb; bucket: RegionalBucket } | null;
  /** the roof covering's livery when it lies in a vertex-coloured bucket (painted sheet) */
  roofColour?: Rgb;
}

/** What a dialect sees of the house it dresses. */
export interface HouseFrame {
  spec: HouseSpec;
  faces: Record<FaceName, Face>;
  /** storey floor heights (index i → bottom of storey i) and the eave (top of the top storey) */
  floors: number[];
  eaveY: number;
  /** the body half extents of each storey (with jetties) */
  bodies: Array<{ x0: number; x1: number; z0: number; z1: number; y0: number; y1: number }>;
  roof: RoofGeometry;
}

export interface HouseDialect {
  /** a window unit: frame, pane, sill, shutters */
  window(sink: PartSink, face: Face, o: Opening, y0: number, frame: HouseFrame): void;
  /** a door unit with its threshold and steps (y0 is the floor of the storey) */
  door(sink: PartSink, face: Face, o: Opening, y0: number, frame: HouseFrame): void;
  /** a framed storey wall: the members around its openings */
  dressWall?(sink: PartSink, face: Face, rect: WallRect, openings: Opening[], frame: HouseFrame): void;
  /** a framed gable: the members inside the gable polygon (u, y pairs on the face) */
  dressGable?(sink: PartSink, face: Face, polygon: Array<[number, number]>, frame: HouseFrame): void;
  /** under-jetty beam ends and sill beams */
  dressJetty?(sink: PartSink, face: Face, u0: number, u1: number, y: number, depth: number, frame: HouseFrame): void;
}

export interface WallRect { u0: number; u1: number; y0: number; y1: number }

/** The roof's measured geometry (ridge along Z). */
export interface RoofGeometry {
  kind: RoofKind;
  /** half width of the wall top the roof bears on */
  s: number;
  /** half depth of the body under the roof */
  halfD: number;
  tanP: number;
  eaveY: number;
  /** ridge height of the slab underside, and of its top surface */
  ridgeY: number;
  ridgeTopY: number;
  /** the gable wall polygon on the z = ±halfD planes, as (u, y) pairs with u along x (front face orientation) */
  gable: Array<[number, number]> | null;
  /** half length of the ridge line */
  ridgeHalf: number;
  /** roof top surface height above (x, z), or null outside the roof */
  topAt(x: number, z: number): number | null;
}

const DEG = Math.PI / 180;
const FACE_NAMES: readonly FaceName[] = ['front', 'right', 'back', 'left'];

/** Lay out a roof over a w × d wall top at height eaveY (ridge along Z). */
export function roofGeometry(w: number, d: number, eaveY: number, roof: RoofSpec): RoofGeometry {
  const s = w / 2, halfD = d / 2;
  const tanP = Math.tan(roof.pitchDeg * DEG);
  if (roof.kind === 'flat' || roof.kind === 'shed') {
    const rise = roof.kind === 'shed' ? w * tanP : 0;
    return {
      kind: roof.kind, s, halfD, tanP, eaveY, ridgeY: eaveY + rise, ridgeTopY: eaveY + rise + roof.thickness,
      gable: null, ridgeHalf: halfD,
      topAt: (x, z) => (Math.abs(x) > s + roof.eave + 1e-6 || Math.abs(z) > halfD + roof.verge + 1e-6 ? null
        : eaveY + roof.thickness + (roof.kind === 'shed' ? (s - x) * tanP : 0)),
    };
  }
  const ridgeY = eaveY + s * tanP;
  const cosP = Math.cos(roof.pitchDeg * DEG);
  const tTop = roof.thickness / cosP;
  const D = halfD + roof.verge;
  let gable: Array<[number, number]> | null = null;
  let hipCut = ridgeY, hipRun = 0;
  if (roof.kind === 'halfhip' || roof.kind === 'hip') {
    const hipTan = Math.tan((roof.hipPitchDeg ?? (roof.kind === 'hip' ? roof.pitchDeg : 62)) * DEG);
    if (roof.kind === 'hip') {
      hipCut = eaveY - roof.verge * hipTan; // the hip eave line at z = ±D, level with the side eaves when verge = eave
      hipRun = (ridgeY - hipCut) / hipTan;
    } else {
      const frac = Math.min(0.6, Math.max(0.2, roof.hipFrac ?? 0.38));
      hipCut = ridgeY - (ridgeY - eaveY) * frac;
      hipRun = (ridgeY - hipCut) / hipTan;
    }
    const wallTop = hipCut + roof.verge * hipTan; // the hip underside on the gable wall plane
    if (wallTop > eaveY + 0.05) {
      const xc = Math.max(0, s - (wallTop - eaveY) / tanP);
      gable = [[-s, eaveY], [s, eaveY], [xc, wallTop], [-xc, wallTop]];
    }
  } else {
    gable = [[-s, eaveY], [s, eaveY], [0, ridgeY]];
  }
  const ridgeHalf = Math.max(0, D - hipRun);
  const hipTanFinal = roof.kind === 'gable' ? 0 : (ridgeY - hipCut) / Math.max(1e-6, hipRun);
  return {
    kind: roof.kind, s, halfD, tanP, eaveY, ridgeY, ridgeTopY: ridgeY + tTop, gable, ridgeHalf,
    topAt(x, z) {
      if (Math.abs(x) > s + roof.eave + 1e-6 || Math.abs(z) > D + 1e-6) return null;
      let y = ridgeY - Math.abs(x) * tanP;
      if (roof.kind !== 'gable' && Math.abs(z) > ridgeHalf) y = Math.min(y, ridgeY - (Math.abs(z) - ridgeHalf) * hipTanFinal);
      return y + tTop;
    },
  };
}

/** Emit the roof slabs, ridge and hip caps. */
export function emitRoof(sink: PartSink, rg: RoofGeometry, roof: RoofSpec, colour?: Rgb): void {
  const { s, halfD, tanP, eaveY, ridgeY } = rg;
  const t = roof.thickness;
  const bucket = roof.bucket;
  // a vertex-coloured covering (painted sheet in structureMetal) takes its livery here
  const dec: EmitOptions = { ...(roof.decor ? { decor: true } : {}), ...(colour ? { colour } : {}) };
  if (roof.kind === 'flat') {
    const e = roof.eave;
    sink.span(bucket, -s - e, eaveY, -halfD - e, s + e, eaveY + t, halfD + e, dec);
    if (roof.parapet) {
      const p = roof.parapet, th = 0.22, top = eaveY + t + p;
      sink.span(bucket === 'roof' ? 'plaster' : bucket, -s - e, eaveY, halfD + e - th, s + e, top, halfD + e);
      sink.span(bucket === 'roof' ? 'plaster' : bucket, -s - e, eaveY, -halfD - e, s + e, top, -halfD - e + th);
      sink.span(bucket === 'roof' ? 'plaster' : bucket, s + e - th, eaveY, -halfD - e + th, s + e, top, halfD + e - th);
      sink.span(bucket === 'roof' ? 'plaster' : bucket, -s - e, eaveY, -halfD - e + th, -s - e + th, top, halfD + e - th);
    }
    return;
  }
  const e = roof.eave, D = halfD + roof.verge;
  const lo = eaveY - e * tanP;
  if (roof.kind === 'shed') {
    // one plane rising from +x (low) to -x (high)
    const hi = eaveY + (2 * s) * tanP + e * tanP;
    const n = normalize3([tanP, 1, 0]);
    const pts: Vec3[] = [[s + e, lo, D], [s + e, lo, -D], [-s - e, hi, -D], [-s - e, hi, D]];
    sink.prism(bucket, pts, n, t, dec, { kind: 'plane', origin: [-s - e, hi, 0], u: [0, 0, 1], v: normalize3([1, -tanP, 0]) });
    return;
  }
  const cosP = Math.cos(Math.atan(tanP)), sinP = Math.sin(Math.atan(tanP));
  const ridgeHalf = rg.ridgeHalf;
  // the hip cut on the verge plane (z = ±D) and its x on the main slope
  let yC = ridgeY, xC = 0;
  if (roof.kind !== 'gable' && ridgeHalf < D - 1e-6) {
    const hipTan = (roof.kind === 'hip') ? Math.tan((roof.hipPitchDeg ?? roof.pitchDeg) * DEG)
      : Math.tan((roof.hipPitchDeg ?? 62) * DEG);
    yC = ridgeY - (D - ridgeHalf) * hipTan;
    xC = Math.min(s + e, (ridgeY - yC) / tanP);
  }
  for (const side of [1, -1]) {
    const pts: Vec3[] = [];
    pts.push([side * (s + e), lo, side * D]);
    pts.push([side * (s + e), lo, -side * D]);
    if (xC > 1e-4 && xC < s + e - 1e-4) pts.push([side * xC, yC, -side * D]);
    pts.push([0, ridgeY, -side * ridgeHalf]);
    if (ridgeHalf > 1e-4) pts.push([0, ridgeY, side * ridgeHalf]);
    if (xC > 1e-4 && xC < s + e - 1e-4) pts.push([side * xC, yC, side * D]);
    const n = normalize3([side * sinP, cosP, 0]);
    // thatch combs down the slope: the straw tile's stalks run along its u, so a straw roof swaps the axes
    const along: Vec3 = [0, 0, side], down = normalize3([side * cosP, -sinP, 0]);
    sink.prism(bucket, pts, n, t, dec, {
      kind: 'plane', origin: [0, ridgeY + t / cosP, 0], u: bucket === 'straw' ? down : along, v: bucket === 'straw' ? along : down,
    });
  }
  if (roof.kind !== 'gable' && ridgeHalf < D - 1e-6) {
    for (const end of [1, -1]) {
      const pts: Vec3[] = end > 0
        ? [[-xC, yC, D], [xC, yC, D], [0, ridgeY, ridgeHalf]]
        : [[xC, yC, -D], [-xC, yC, -D], [0, ridgeY, -ridgeHalf]];
      const rise = ridgeY - yC, run = D - ridgeHalf;
      const len = Math.hypot(rise, run) || 1;
      const n = normalize3([0, run / len, end * rise / len]);
      const hipAlong: Vec3 = [end, 0, 0], hipDown = normalize3([0, -rise, end * run]);
      sink.prism(bucket, pts, n, t, dec, {
        kind: 'plane', origin: [0, ridgeY, end * ridgeHalf], u: bucket === 'straw' ? hipDown : hipAlong, v: bucket === 'straw' ? hipAlong : hipDown,
      });
      // hip caps along both hip lines
      for (const sx of [1, -1]) {
        const a: Vec3 = [0, ridgeY + t / cosP + 0.02, end * ridgeHalf];
        const b: Vec3 = [sx * xC, yC + t + 0.02, end * D];
        sink.member(bucket, a, b, 0.2, 0.1, normalize3([sx * 0.3, 1, end * 0.3]), { ...dec, uv: { kind: 'member' }, exposed: true }, 0.05);
      }
    }
  }
  // ridge cap
  const rt = ridgeY + t / cosP;
  const ridgeLen = ridgeHalf > 1e-4 ? ridgeHalf : 0;
  if (roof.ridge !== null && ridgeLen > 0) {
    const half = roof.ridge === 'round' ? 0.13 : 0.16;
    const capPts: Vec3[] = [[-half, rt - 0.06, -ridgeLen - (roof.kind === 'gable' ? roof.verge * 0 : 0)],
      [half, rt - 0.06, -ridgeLen], [half, rt + 0.04, -ridgeLen], [0, rt + 0.11, -ridgeLen], [-half, rt + 0.04, -ridgeLen]];
    // extrude the cap profile along z (points ccw seen from +z)
    sink.prism(bucket, capPts, [0, 0, 1], 2 * ridgeLen, dec, { kind: 'plane', origin: [0, rt, 0], u: [1, 0, 0], v: [0, 0, 1] });
  }
}

/** Lay out a regular window rhythm on one storey of one face, leaving room for doors. */
export function windowRhythm(face: FaceName, storey: number, width: number, opts: {
  w: number; h: number; sill: number; spacing: number; margin?: number; avoid?: Array<[number, number]>;
  kind?: Opening['kind']; max?: number; centre?: boolean;
}): Opening[] {
  const margin = opts.margin ?? 0.9;
  const span = width - 2 * margin;
  if (span < opts.w) return [];
  let n = Math.max(1, Math.floor((span + opts.spacing - opts.w) / opts.spacing));
  if (opts.max) n = Math.min(n, opts.max);
  const out: Opening[] = [];
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0 : -span / 2 + opts.w / 2 + (span - opts.w) * i / (n - 1);
    if (opts.avoid?.some(([a, b]) => u + opts.w / 2 + 0.25 > a && u - opts.w / 2 - 0.25 < b)) continue;
    out.push({ face, storey, kind: opts.kind ?? 'window', u, w: opts.w, y0: opts.sill, h: opts.h });
  }
  return out;
}

/**
 * Build one house body into the sink. Returns the frame the dialect dressed (roof geometry, floors, faces) so a
 * style can add its own signature parts (stairs, balconies, dormers, porches) afterwards.
 */
export function buildHouse(sink: PartSink, spec: HouseSpec, dialect: HouseDialect): HouseFrame {
  const floors: number[] = [];
  const bodies: HouseFrame['bodies'] = [];
  let y = spec.plinth ? spec.plinth.h : 0;
  const jet = [0, 0, 0, 0];
  if (spec.plinth) {
    const p = spec.plinth;
    sink.span(p.bucket, -spec.w / 2 - p.out, -0.6, -spec.d / 2 - p.out, spec.w / 2 + p.out, p.h, spec.d / 2 + p.out);
  }
  spec.storeys.forEach((storey) => {
    if (storey.jetty) for (let k = 0; k < 4; k++) jet[k] += storey.jetty[k];
    const body = { x0: -spec.w / 2 - jet[3], x1: spec.w / 2 + jet[1], z0: -spec.d / 2 - jet[2], z1: spec.d / 2 + jet[0], y0: y, y1: y + storey.h };
    sink.span(storey.wall, body.x0, body.y0, body.z0, body.x1, body.y1, body.z1);
    floors.push(y);
    bodies.push(body);
    y += storey.h;
  });
  const eaveY = y;
  const top = bodies[bodies.length - 1];
  // the roof bears on the top storey's body; a jettied body is offset, so lay the roof out centred and move it
  const roofW = top.x1 - top.x0, roofD = top.z1 - top.z0;
  const roofCx = (top.x0 + top.x1) / 2, roofCz = (top.z0 + top.z1) / 2;
  const rg = roofGeometry(roofW, roofD, eaveY, spec.roof);
  const frameFaces = (b: typeof top): Record<FaceName, Face> => {
    const f = bodyFaces(b.x1 - b.x0, b.z1 - b.z0);
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    for (const name of FACE_NAMES) f[name].origin = [f[name].origin[0] + cx, 0, f[name].origin[2] + cz];
    return f;
  };
  const faces = frameFaces(bodies[0]);
  const frame: HouseFrame = { spec, faces, floors, eaveY, bodies, roof: rg };
  // the roof and gables in the top body's frame
  const moveRoof = (fn: () => void) => (Math.abs(roofCx) < 1e-6 && Math.abs(roofCz) < 1e-6 ? fn() : sink.placed(0, roofCx, 0, roofCz, fn));
  moveRoof(() => {
    emitRoof(sink, rg, spec.roof, spec.roofColour);
    if (rg.gable) {
      const gableBucket = spec.gableBucket ?? spec.storeys[spec.storeys.length - 1].wall;
      const f = bodyFaces(roofW, roofD);
      for (const name of ['front', 'back'] as const) {
        const face = f[name];
        // the gable polygon is symmetric in u, and each face's own u axis mirrors it into place
        const poly = rg.gable.map(([u, yy]): [number, number] => [u, yy]);
        // a gable hung with roof slate or tile courses its tiles downward (roof UVs run v down the slope)
        wallPolygon(sink, gableBucket, face, poly, 0.32, gableBucket === 'roof'
          ? { uv: { kind: 'plane', origin: facePoint(face, 0, 0, 0), u: face.u, v: [0, -1, 0] } } : {});
        if (spec.gableFramed && dialect.dressGable) dialect.dressGable(sink, face, poly, frame);
      }
      if (spec.verge) {
        for (const end of [1, -1]) for (const side of [1, -1]) {
          const z = end * (roofD / 2 + spec.roof.verge - 0.03);
          const a: Vec3 = [side * (rg.s + spec.roof.eave) * 0.999, eaveY - spec.roof.eave * rg.tanP - 0.02, z];
          const b: Vec3 = [0, rg.ridgeY - 0.02, z];
          if (rg.kind === 'gable') sink.member(spec.verge.bucket, a, b, 0.22, 0.05, [0, 0, end], { colour: spec.verge.colour, decor: true, ends: true });
        }
      }
    }
  });
  // the storeys' openings and dressing
  for (let i = 0; i < spec.storeys.length; i++) {
    const storey = spec.storeys[i];
    const sf = frameFaces(bodies[i]);
    for (const name of FACE_NAMES) {
      const face = sf[name];
      const own = spec.openings.filter((o) => o.face === name && o.storey === i);
      if (storey.framed && dialect.dressWall) {
        dialect.dressWall(sink, face, { u0: -face.width / 2, u1: face.width / 2, y0: bodies[i].y0, y1: bodies[i].y1 }, own, frame);
      }
      for (const o of own) {
        if (o.kind === 'door' || o.kind === 'gate' || o.kind === 'shopfront') dialect.door(sink, face, o, bodies[i].y0, frame);
        else dialect.window(sink, face, o, bodies[i].y0, frame);
      }
    }
    // jetty dressing on the faces this storey oversails
    if (i > 0 && storey.jetty && dialect.dressJetty) {
      FACE_NAMES.forEach((name, k) => {
        const depth = storey.jetty![k];
        if (depth <= 0.01) return;
        dialect.dressJetty!(sink, sf[name], -sf[name].width / 2, sf[name].width / 2, bodies[i].y0, depth, frame);
      });
    }
  }
  // chimneys
  for (const c of spec.chimneys) {
    const roofY = rg.topAt(c.x - roofCx, c.z - roofCz);
    const topY = (roofY ?? rg.ridgeTopY) + c.above;
    const baseY = c.inWall ? 0 : Math.max(eaveY - 0.4, (roofY ?? eaveY) - 1.2);
    sink.span(c.bucket, c.x - c.sx / 2, baseY, c.z - c.sz / 2, c.x + c.sx / 2, topY, c.z + c.sz / 2);
    const cap = c.cap ?? 'slab';
    if (cap === 'slab' || cap === 'pots') sink.span(c.bucket, c.x - c.sx / 2 - 0.07, topY, c.z - c.sz / 2 - 0.07, c.x + c.sx / 2 + 0.07, topY + 0.1, c.z + c.sz / 2 + 0.07);
    if (cap === 'tile') {
      // a little gabled tile hood on corner piers (Dalmatian / Mediterranean)
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        sink.span(c.bucket, c.x + sx * c.sx / 2 - (sx > 0 ? 0.1 : 0), topY, c.z + sz * c.sz / 2 - (sz > 0 ? 0.1 : 0),
          c.x + sx * c.sx / 2 + (sx < 0 ? 0.1 : 0), topY + 0.28, c.z + sz * c.sz / 2 + (sz < 0 ? 0.1 : 0));
      }
      const hood = roofGeometry(c.sx + 0.16, c.sz + 0.16, 0, { kind: 'gable', pitchDeg: 24, eave: 0.06, verge: 0.06, thickness: 0.05, bucket: 'roof', ridge: null });
      sink.placed(0, c.x, topY + 0.28, c.z, () => emitRoof(sink, hood, { kind: 'gable', pitchDeg: 24, eave: 0.06, verge: 0.06, thickness: 0.05, bucket: 'roof', ridge: null }));
    }
    if (cap === 'pots') {
      for (const k of [-1, 1]) sink.span('roof', c.x + k * c.sx * 0.22 - 0.09, topY + 0.1, c.z - 0.09, c.x + k * c.sx * 0.22 + 0.09, topY + 0.42, c.z + 0.09);
    }
  }
  // gutters and downpipes on the eaves sides (+x, -x)
  if (spec.gutters && spec.roof.kind !== 'flat') {
    const colour = spec.gutters.colour;
    const ex = rg.s + spec.roof.eave - 0.06, gy = eaveY - spec.roof.eave * rg.tanP - 0.1;
    const gz = roofD / 2 + (rg.kind === 'gable' ? spec.roof.verge : spec.roof.verge) - 0.05;
    moveRoof(() => {
      for (const side of [1, -1]) sink.span('structureMetal', side * ex - 0.07, gy - 0.07, -gz, side * ex + 0.07, gy + 0.05, gz, { colour, decor: true });
    });
    // downpipes stand on the ground storey's face; a swan-neck run joins each to the gutter
    const g0 = bodies[0];
    for (const side of [1, -1]) for (const end of [1, -1]) {
      const pz = end > 0 ? g0.z1 - 0.2 : g0.z0 + 0.2;
      const px = side > 0 ? g0.x1 + 0.08 : g0.x0 - 0.08;
      const gx = roofCx + side * ex;
      sink.span('structureMetal', Math.min(px, gx) - 0.04, gy - 0.13, pz - 0.04, Math.max(px, gx) + 0.04, gy - 0.05, pz + 0.04, { colour, decor: true });
      const baseY = spec.plinth ? spec.plinth.h * 0.5 : 0.15;
      sink.span('structureMetal', px - 0.045, baseY, pz - 0.045, px + 0.045, gy - 0.07, pz + 0.045, { colour, decor: true });
    }
  }
  return frame;
}

/** A wall polygon (u, y pairs, counter-clockwise seen from outside) on a face, `depth` thick inward. */
export function wallPolygon(sink: PartSink, bucket: RegionalBucket, face: Face, poly: Array<[number, number]>, depth: number, opts: EmitOptions = {}): void {
  const pts = poly.map(([u, yy]) => facePoint(face, u, yy, 0));
  const inward: Vec3 = [-face.out[0], -face.out[1], -face.out[2]];
  // prism(): points ccw seen from +dir (from inside) — the outside-ccw polygon reversed
  sink.prism(bucket, pts.reverse(), inward, depth, opts);
}

/** Small helpers shared by the dialects. */
export const H = {
  faceBox,
  facePoint,
  /** a vertical post on a face from y0 to y1 at u, protruding `out` */
  post(sink: PartSink, bucket: RegionalBucket, face: Face, u: number, y0: number, y1: number, width: number, out: number, opts: EmitOptions): void {
    if (y1 - y0 < 0.02) return;
    sink.member(bucket, facePoint(face, u, y0), facePoint(face, u, y1), width, out, face.out, opts);
  },
  /** a horizontal rail on a face from u0 to u1 at y */
  rail(sink: PartSink, bucket: RegionalBucket, face: Face, u0: number, u1: number, y: number, height: number, out: number, opts: EmitOptions & { ends?: boolean }): void {
    if (u1 - u0 < 0.02) return;
    sink.member(bucket, facePoint(face, u0, y), facePoint(face, u1, y), height, out, face.out, opts);
  },
  /** a diagonal brace between two face points */
  brace(sink: PartSink, bucket: RegionalBucket, face: Face, u0: number, y0: number, u1: number, y1: number, width: number, out: number, opts: EmitOptions): void {
    sink.member(bucket, facePoint(face, u0, y0), facePoint(face, u1, y1), width, out, face.out, opts);
  },
};
