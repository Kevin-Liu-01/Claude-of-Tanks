// src/world/maps/regional/sheet.ts — how a sheet-clad body breaks (the facades lane, 2026-10-08; docs/DESTRUCTION.md
// §16.3; the coordinator's ruling: warehouses and works get kit-drawn damage, "brick/steel frames bend and expose
// structure").
//
// A hall clad in profiled sheet on a steel frame (a works, a hangar, a store; damage.ts describeShell reads its walls in
// structureMetal) neither spalls nor heaps like masonry: its sheet tears, curls and hangs, and its frame stands, bends
// and sags. The stage builders here dress such a face, written against the anatomy alone, in the building's own buckets:
// - a breach: the sheet torn back round the hole in jagged tongues curled in along the blow, a few flaps hanging into
//   it, the girts and columns behind it crossing the gap (bent in by a blast), the dark hall beyond;
// - the damaged stage: shot holes torn through the sheet and a sheet or two peeled back from a corner, the glass gone;
// - a wall section's fall: the bay's sheet stripped off its frame — the columns and girts standing (a few bent or
//   sagging), a sheet or two hanging from the top rail, the stub's sheet torn ragged at the clamp line, the sheets that
//   came off crumpled on the ground at the foot;
// - the roof's fall: the covering gone through its frame — the rafters and purlins left (some sagging), sheets hanging
//   from them, the rest crumpled on the hall's floor;
// - the collapse: the frame down to bent column stumps and a low tangle of crumpled sheet and steel lying over the
//   sim's mound (never in it: the mound raises the terrain itself).
// Every builder draws only from damageRng(seed) and stays within the writers' caps.
import { STRUCTURE_WALL_STUB_M } from '../../collision.ts';
import {
  damageRng,
  type BreachSpec, type DamageFace, type DamageMeshWriter, type DamagePieceWriter, type DamageStageResult, type FractureSlot, type Rgb,
  type StructureDamageAnatomy, type Vec3,
} from '../../destructionKit.ts';
import {
  CUT_PER_HOLE, FacePen, HEAP_LIFT_M, LIFT, Mesh, REDRAW_PER_CUT, axes, beamBetween, bodyCentre, cross3, extrasOf, faceOf,
  fallbackSurface, heapSkin, norm3, roomBehind, sootField, throwPieceAt, wallPieces, type FacePt, type MoundHeight,
} from './fracture.ts';

type Writers = { mesh: DamageMeshWriter; pieces: DamagePieceWriter };

/** The frame's steel: dark, a little blued (the girts and columns behind a profiled skin). */
const STEEL: Rgb = [0.27, 0.28, 0.3];
/** The sheet's back: galvanised grey under whatever paint its face carries. */
const BACK: Rgb = [0.5, 0.52, 0.54];

/** Whether a face is sheet-clad: its outer layer is sheet metal (a few centimetres at most). */
export function isSheetFace(f: DamageFace | undefined): boolean {
  const l = f?.layers[0];
  return !!l && l.material === 'metal' && l.thicknessM <= 0.05;
}

/** Whether a body is a sheet-clad hall: most of its ground storey's faces are sheet. */
export function isSheetBody(anatomy: StructureDamageAnatomy): boolean {
  const faces = anatomy.storeys[0]?.faces ?? [];
  return faces.filter((f) => isSheetFace(f)).length >= Math.max(1, Math.ceil(faces.length / 2));
}

function steelSlot(f: DamageFace): FractureSlot {
  // the frame in the sheet's own steel bucket (a hall's parts always carry it), darker
  return { material: 'metal', bucket: f.layers[0]?.bucket ?? 'structureMetal', tint: STEEL, thicknessM: 0.2, share: 0 };
}

/** The frame behind a sheet face: columns at the bays (about five metres) and girts every 1.25 m up the face. */
function frameOf(f: DamageFace): { columns: number[]; girts: number[] } {
  const bays = Math.max(1, Math.round(f.width / 5));
  const columns = Array.from({ length: bays + 1 }, (_, k) => -f.width / 2 + (f.width * k) / bays);
  const girts: number[] = [];
  for (let y = 1.1; y < f.height - 0.25; y += 1.25) girts.push(y);
  return { columns, girts };
}

/** A face point (u, y, o) in the body frame. */
const at = (pen: FacePen, u: number, y: number, o: number): Vec3 => [pen.x(u, o), pen.y(y), pen.z(u, o)];

/** A steel member between two face points, set back behind the sheet; a bent one goes through its kink. */
function member(mesh: Mesh, pen: FacePen, a: FacePt, b: FacePt, w: number, d: number, kink: FacePt | null): void {
  const up: Vec3 = [0, 1, 0];
  if (kink) {
    beamBetween(mesh, at(pen, a[0], a[1], a[2]), at(pen, kink[0], kink[1], kink[2]), w, d, up, STEEL);
    beamBetween(mesh, at(pen, kink[0], kink[1], kink[2]), at(pen, b[0], b[1], b[2]), w, d, up, STEEL);
  } else {
    beamBetween(mesh, at(pen, a[0], a[1], a[2]), at(pen, b[0], b[1], b[2]), w, d, up, STEEL);
  }
}

/**
 * A sheet strip in the body frame, both sides: corners a b c d (a → b across it, a → d down it), its face toward `n`
 * in the sheet's own bucket and tint, its back galvanised; uv across and down it at the sheet's scale.
 */
function sheetQuad(mesh: Mesh, a: Vec3, b: Vec3, c: Vec3, d: Vec3, tint: Rgb): void {
  const e1: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2: Vec3 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  let n = norm3(cross3(e2, e1));
  if (!Number.isFinite(n[0])) return;
  // the painted side up or out (a lying sheet shows its face; a hanging one its face to the street)
  if (n[1] < -0.2) n = [-n[0], -n[1], -n[2]];
  const back: Vec3 = [-n[0], -n[1], -n[2]], off = 0.008;
  const shift = (p: Vec3): Vec3 => [p[0] + back[0] * off, p[1] + back[1] * off, p[2] + back[2] * off];
  mesh.quadUvAlong(a, b, c, d, n, 0, tint);
  mesh.quadUvAlong(shift(b), shift(a), shift(d), shift(c), back, 0, BACK);
}

/**
 * A sheet lying crumpled: `segments` bends down its length from `origin` along `dir` (horizontal), `width` across, each
 * bend's ridge or trough a little over the surface `ground` (body-frame height at x, z).
 */
export function crumpledSheet(mesh: Mesh, rng: () => number, origin: Vec3, dir: Vec3, width: number, length: number, segments: number,
  ground: (x: number, z: number) => number, tint: Rgb): void {
  const across: Vec3 = norm3([-dir[2], 0, dir[0]]);
  const pts: Array<[Vec3, Vec3]> = [];
  for (let k = 0; k <= segments; k++) {
    const t = (k / segments) * length, twist = (rng() - 0.5) * 0.25;
    const cx = origin[0] + dir[0] * t, cz = origin[2] + dir[2] * t;
    const lift = k === 0 || k === segments ? 0.04 + rng() * 0.08 : 0.08 + rng() * 0.45;
    const lx = cx - across[0] * width / 2, lz = cz - across[2] * width / 2, rx = cx + across[0] * width / 2, rz = cz + across[2] * width / 2;
    pts.push([[lx, ground(lx, lz) + lift * (1 + twist), lz], [rx, ground(rx, rz) + lift * (1 - twist), rz]]);
  }
  for (let k = 0; k < segments; k++) sheetQuad(mesh, pts[k][0], pts[k][1], pts[k + 1][1], pts[k + 1][0], tint);
}

/** A sheet hanging from a hinge (u0..u1 at height y on the face, o out of it), swung out (or in) about it. */
function hangingSheet(mesh: Mesh, pen: FacePen, u0: number, u1: number, y: number, o: number, length: number, swing: number, twist: number,
  tint: Rgb): void {
  const f = pen.f, sw = Math.sin(swing), cw = Math.cos(swing);
  const a = at(pen, u0, y, o), b = at(pen, u1, y, o);
  // the free edge: down by length·cos, out along the face normal by length·sin (twisted a little along the hinge)
  const drop = (s: number): Vec3 => {
    const along = length * (1 + s * twist);
    return [f.out[0] * along * sw, -along * cw, f.out[2] * along * sw];
  };
  const da = drop(-1), db = drop(1);
  sheetQuad(mesh, a, b, [b[0] + db[0], b[1] + db[1], b[2] + db[2]], [a[0] + da[0], a[1] + da[1], a[2] + da[2]], tint);
}

function emptyResult(): DamageStageResult { return { cuts: [], hides: [] }; }

// ---------------------------------------------------------------------------------------------------- the breach

/**
 * A breach in sheet (DESTRUCTION.md §16.3 Breach): the cut takes a disc of the cladding; the builder redraws the sheet
 * round it torn back in jagged tongues, curled in along a blast (a shot's edge barely so), a few flaps hanging into the
 * gap, the frame's girts and columns behind it crossing the hole (a blast bends them in), the dark hall beyond.
 */
export function breachSheet(anatomy: StructureDamageAnatomy, hole: BreachSpec, out: Writers): DamageStageResult {
  const f = faceOf(anatomy, hole);
  if (!f || !f.layers.length) return emptyResult();
  const rng = damageRng(hole.seed);
  const pen = new FacePen(f, extrasOf(anatomy)?.surfaces.get(f.section) ?? fallbackSurface(f));
  const mesh = new Mesh(out.mesh);
  const sheet = f.layers[0], blast = hole.cause !== 'kinetic';
  const { n, inward } = axes(f);
  const cu = hole.u, cy = hole.y, r = Math.max(0.15, hole.radiusM);
  const N = Math.max(10, Math.min(20, Math.round(10 + r * 5)));
  // the torn edge: ragged by tongue, a few long tears; how far each tongue curls in
  const rho = Array.from({ length: N }, () => r * (0.72 + rng() * 0.36) * (rng() < 0.2 ? 1.28 : 1));
  const curl = Array.from({ length: N }, () => (blast ? 0.08 + rng() * 0.3 : 0.02 + rng() * 0.07) * r);
  const far = Math.max(...rho);
  const R = far * CUT_PER_HOLE, ROUT = R * REDRAW_PER_CUT;
  const ang = (i: number): number => ((i % N) / N) * Math.PI * 2;
  const pt = (i: number, rad: number, o: number): FacePt => [cu + Math.cos(ang(i)) * rad, cy + Math.sin(ang(i)) * rad, o];
  // 1. the sheet round the hole: an outer band flat on the wall out to the redraw's edge, an inner band curling in to
  //    the torn edge (each band's pieces kept on the face and off its openings), both sides
  if (mesh.begin(sheet.bucket, 'rim', true)) {
    if (blast) mesh.soot = sootField(cu, cy, far * 0.9, ROUT);
    for (let i = 0; i < N; i++) {
      const j = i + 1;
      const mid = (k: number): number => rho[k % N] + 0.4 * (ROUT - rho[k % N]);
      const outer: FacePt[] = [pt(i, ROUT, LIFT), pt(j, ROUT, LIFT), pt(j, mid(j), LIFT), pt(i, mid(i), LIFT)];
      const inner: FacePt[] = [pt(i, mid(i), LIFT), pt(j, mid(j), LIFT), pt(j, rho[j % N], -curl[j % N]), pt(i, rho[i], -curl[i])];
      for (const band of [outer, inner]) {
        for (const piece of wallPieces(f, band)) {
          mesh.facePoly(pen, sheet.bucket, piece, n, sheet.tint, 1);
          mesh.facePoly(pen, sheet.bucket, piece.map((p) => [p[0], p[1], p[2] - 0.01] as FacePt), inward, BACK, 0.8);
        }
      }
    }
    mesh.soot = null;
    // a few tongues torn loose: flaps hanging from the edge into the gap, drooping
    const flaps = blast ? 2 + Math.floor(rng() * 4) : Math.floor(rng() * 2);
    for (let k = 0; k < flaps; k++) {
      const i = Math.floor(rng() * N), j = i + 1;
      const a = pt(i, rho[i], -curl[i]), b = pt(j, rho[j % N], -curl[j % N]);
      const reach = (0.35 + rng() * 0.4) * r, droop = (0.2 + rng() * 0.4) * r;
      const th = ang(i) + Math.PI / N; // the tongue's own middle angle
      const tip: FacePt = [(a[0] + b[0]) / 2 - Math.cos(th) * reach, (a[1] + b[1]) / 2 - Math.sin(th) * reach - droop, -curl[i] - (0.15 + rng() * 0.35) * r];
      if (Math.abs(tip[0]) > f.width / 2 - 0.05 || tip[1] < 0.05 || tip[1] > f.height - 0.05) continue;
      mesh.facePoly(pen, sheet.bucket, [a, b, tip], n, sheet.tint, 0.85);
      mesh.facePoly(pen, sheet.bucket, [b, a, tip].map((p) => [p[0], p[1], p[2] - 0.01] as FacePt), inward, BACK, 0.75);
    }
  }
  // 2. the frame behind the gap: the girts and columns the hole reaches, set back behind the sheet, a blast bending
  //    them in at the hole (a body with no frame, a shipping container (container.ts), shows none)
  const { columns, girts } = frameOf(f);
  const set = -0.12;
  const frameless = !!(anatomy.kitPlan as { damage?: { frameless?: boolean } } | undefined)?.damage?.frameless;
  if (!frameless && mesh.begin(steelSlot(f).bucket, 'rim')) {
    for (const gy of girts) {
      if (Math.abs(gy - cy) > R * 0.9) continue;
      const half = Math.sqrt(Math.max(0, ROUT * ROUT - (gy - cy) ** 2));
      const u0 = Math.max(-f.width / 2, cu - half), u1 = Math.min(f.width / 2, cu + half);
      if (u1 - u0 < 0.3) continue;
      const kink: FacePt | null = blast && rng() < 0.75 ? [cu + (rng() - 0.5) * r * 0.5, gy - rng() * 0.12, set - (0.12 + rng() * 0.3)] : null;
      member(mesh, pen, [u0, gy, set], [u1, gy, set], 0.07, 0.14, kink);
    }
    for (const cu0 of columns) {
      if (Math.abs(cu0 - cu) > R * 0.9) continue;
      const half = Math.sqrt(Math.max(0, ROUT * ROUT - (cu0 - cu) ** 2));
      const y0 = Math.max(0.02, cy - half), y1 = Math.min(f.height - 0.02, cy + half);
      if (y1 - y0 < 0.3) continue;
      const kink: FacePt | null = blast && rng() < 0.5 ? [cu0, cy + (rng() - 0.5) * r * 0.4, set - (0.08 + rng() * 0.18)] : null;
      member(mesh, pen, [cu0, y0, set - 0.05], [cu0, y1, set - 0.05], 0.18, 0.2, kink);
    }
  }
  // 3. the dark hall behind
  roomBehind(mesh, anatomy, pen, hole.storey, cu, cy, R, 0.16);
  mesh.end();
  // 4. the sheet that went: torn pieces along the blow
  const speed = blast ? 8 : 5;
  for (let k = 0; k < 8 && out.pieces.count < out.pieces.capacity; k++) {
    const th = rng() * Math.PI * 2, rad = rng() * far;
    const p = at(pen, cu + Math.cos(th) * rad, cy + Math.sin(th) * rad, -0.05);
    if (!throwPieceAt(out.pieces, rng, sheet.bucket, 'sheet', p, [0.35 + rng() * 0.5, 0.012, 0.3 + rng() * 0.4], sheet.tint, speed)) break;
  }
  return {
    cuts: [{ x: pen.x(cu, 0), y: pen.y(cy), z: pen.z(cu, 0), nx: f.out[0], nz: f.out[2], radiusM: R, depthM: 0.3, outsideM: 0.06 }],
    hides: [],
  };
}

// ---------------------------------------------------------------------------------------------------- damaged

/**
 * The damaged stage on sheet: shot holes torn through the cladding on the ground storey's faces (each a small jagged
 * hole curled in, the hall dark behind), a sheet or two peeled back from a bottom corner, the glass gone.
 */
export function damagedSheet(anatomy: StructureDamageAnatomy, seed: number, out: Writers): DamageStageResult {
  const rng = damageRng(seed);
  const cuts: DamageStageResult['cuts'] = [];
  const st = anatomy.storeys[0];
  if (!st) return emptyResult();
  const faces = st.faces.filter((f) => isSheetFace(f) && f.width > 2);
  for (let k = 0; k < Math.min(4, faces.length * 2); k++) {
    const f = faces[Math.floor(rng() * faces.length)];
    const r = 0.12 + rng() * 0.16, u = (rng() - 0.5) * (f.width - 1.2), y = 0.6 + rng() * Math.max(0.2, f.height - 1.4);
    if (f.openings.some((o) => Math.abs(u - o.u) < o.w / 2 + r * 2 && y > o.y0 - r * 2 && y < o.y0 + o.h + r * 2)) continue;
    const res = breachSheet(anatomy, { section: f.section, storey: st.index, face: f.name, hole: 0, u, y, radiusM: r,
      dirX: -f.out[0], dirZ: -f.out[2], munition: null, cause: 'kinetic', seed: Math.floor(rng() * 0x7fffffff) }, out);
    cuts.push(...res.cuts);
  }
  // a sheet peeled back from a bottom corner, swung out on its top edge
  const mesh = new Mesh(out.mesh);
  for (let k = 0; k < Math.min(2, faces.length); k++) {
    const f = faces[Math.floor(rng() * faces.length)];
    const pen = new FacePen(f, extrasOf(anatomy)?.surfaces.get(f.section) ?? fallbackSurface(f));
    const sheet = f.layers[0];
    const side = rng() < 0.5 ? -1 : 1, u1 = side * (f.width / 2 - 0.05), u0 = u1 - side * (0.9 + rng() * 0.3);
    const top = Math.min(f.height - 0.2, 1.6 + rng() * 1.2);
    if (f.openings.some((o) => Math.abs((u0 + u1) / 2 - o.u) < o.w / 2 + 0.6 && o.y0 < top)) continue;
    if (mesh.begin(sheet.bucket, 'rim')) hangingSheet(mesh, pen, Math.min(u0, u1), Math.max(u0, u1), top, 0.03, top - 0.1, 0.25 + rng() * 0.45, (rng() - 0.5) * 0.3, sheet.tint);
  }
  mesh.end();
  return { cuts, hides: [{ section: null, partClass: 'glass' }] };
}

// ---------------------------------------------------------------------------------------------------- a wall section falls

/**
 * A sheet wall's section falls (DESTRUCTION.md §3.4, §16.3): the bay's cladding strips off its frame. The columns and
 * girts stand (a few bent, a girt or two sagging or gone), a sheet or two hangs from the top rail, the stub's sheet is
 * torn ragged along the clamp line (the presentation keeps the wall below it), and the sheets that came off lie
 * crumpled at the foot.
 */
export function sectionDownSheet(anatomy: StructureDamageAnatomy, section: number, seed: number, out: Writers): DamageStageResult {
  const si = Math.floor(section / 4), st = anatomy.storeys[si];
  const f = st?.faces.find((x) => x.section === section);
  if (!st || !f || !f.layers.length) return emptyResult();
  const rng = damageRng(seed);
  const pen = new FacePen(f, extrasOf(anatomy)?.surfaces.get(f.section) ?? fallbackSurface(f));
  const mesh = new Mesh(out.mesh);
  const sheet = f.layers[0], half = f.width / 2, H = f.height;
  const { n, inward } = axes(f);
  // the clamp line: the ground storey keeps a metre over the base (collision's stub), an upper storey its floor line
  const clampY = si === 0 ? Math.max(0, STRUCTURE_WALL_STUB_M - f.origin[1]) : 0;
  // 1. the stub's top torn ragged: a band of sheet from the clamp line up to a jagged edge, its top curled out
  if (clampY > 0.05 && mesh.begin(sheet.bucket, 'remnant', true)) {
    const steps = Math.max(4, Math.round(f.width / 0.45));
    let prev = clampY + 0.05 + rng() * 0.35;
    for (let i = 0; i < steps; i++) {
      const u0 = -half + (f.width * i) / steps, u1 = -half + (f.width * (i + 1)) / steps, next = clampY + 0.05 + rng() * 0.35;
      for (const piece of wallPieces(f, [[u0, clampY - 0.02, LIFT], [u1, clampY - 0.02, LIFT], [u1, next, 0.02 + rng() * 0.08], [u0, prev, 0.02]])) {
        mesh.facePoly(pen, sheet.bucket, piece, n, sheet.tint, 1);
        mesh.facePoly(pen, sheet.bucket, piece.map((p) => [p[0], p[1], p[2] - 0.01] as FacePt), inward, BACK, 0.8);
      }
      prev = next;
    }
  }
  // 2. the frame of the bay: its columns standing (an inner one leaning), its girts between them (some sagging, a few
  //    gone); the hall's dark inside shows between
  const { columns, girts } = frameOf(f);
  const set = -0.12;
  if (mesh.begin(steelSlot(f).bucket, 'remnant')) {
    for (let c = 0; c < columns.length; c++) {
      const u = columns[c], inner = c > 0 && c < columns.length - 1;
      const lean = inner && rng() < 0.4 ? (rng() - 0.3) * 0.5 : 0;
      member(mesh, pen, [u, Math.max(0, clampY - 0.05), set - 0.05], [u, H, set - 0.05 + lean], 0.18, 0.2, null);
    }
    for (const gy of girts) {
      if (gy < clampY + 0.1) continue;
      for (let c = 0; c + 1 < columns.length; c++) {
        if (rng() < 0.22) continue;
        const u0 = columns[c] + 0.1, u1 = columns[c + 1] - 0.1;
        const sag: FacePt | null = rng() < 0.4 ? [(u0 + u1) / 2 + (rng() - 0.5) * 0.6, gy - 0.1 - rng() * 0.35, set + (rng() - 0.5) * 0.3] : null;
        member(mesh, pen, [u0, gy, set], [u1, gy, set], 0.07, 0.14, sag);
      }
    }
  }
  // 3. a sheet or two still hanging from the top rail, swung out
  if (mesh.begin(sheet.bucket, 'remnant')) {
    const hanging = 1 + Math.floor(rng() * 3);
    for (let k = 0; k < hanging; k++) {
      const w = 0.9 + rng() * 0.25, u0 = -half + 0.2 + rng() * Math.max(0.1, f.width - w - 0.4);
      hangingSheet(mesh, pen, u0, u0 + w, H - 0.15, 0.02, Math.min(H - clampY - 0.3, 1.2 + rng() * 1.6), 0.12 + rng() * 0.5, (rng() - 0.5) * 0.4, sheet.tint);
    }
  }
  // 4. the sheets that came off, crumpled at the foot (on the ground, outside)
  if (mesh.begin(sheet.bucket, 'rubble')) {
    // (the body frame's ground: the face's foot sits on it at the placement, whatever storey fell)
    const groundY = -f.origin[1], count = Math.min(9, 3 + Math.round(f.width / 2.5));
    for (let k = 0; k < count; k++) {
      const u = -half + rng() * f.width, o = 0.4 + rng() * Math.min(3.5, H * 0.6), turn = (rng() - 0.5) * 1.1;
      const base = at(pen, u, groundY, o);
      // lying roughly along the face, turned a little
      const along: Vec3 = norm3([f.u[0] * Math.cos(turn) + f.out[0] * Math.sin(turn), 0, f.u[2] * Math.cos(turn) + f.out[2] * Math.sin(turn)]);
      crumpledSheet(mesh, rng, base, along, 0.9 + rng() * 0.2, 1.6 + rng() * 1.6, 2 + Math.floor(rng() * 2), () => 0, sheet.tint);
    }
  }
  mesh.end();
  // 5. the fall: sheets off the frame, out and down
  for (let k = 0; k < out.pieces.capacity; k++) {
    const p = at(pen, (rng() - 0.5) * f.width, clampY + rng() * (H - clampY), 0.1);
    const shape = k % 5 === 0 ? 'splinter' : 'sheet', spin = rng() * Math.PI * 2;
    const ok = out.pieces.push(sheet.bucket, shape, Math.floor(rng() * 4), p[0], p[1], p[2], 0, Math.sin(spin / 2), 0, Math.cos(spin / 2),
      0.5 + rng() * 0.6, 0.012, 0.4 + rng() * 0.5, sheet.tint[0], sheet.tint[1], sheet.tint[2],
      f.out[0] * (0.5 + rng() * 2), -0.5 - rng(), f.out[2] * (0.5 + rng() * 2));
    if (!ok || k > 40) break;
  }
  return { cuts: [], hides: [{ section, partClass: null }] };
}

// ---------------------------------------------------------------------------------------------------- the roof falls

/**
 * A sheet roof falls through its frame (§16.3 Roof): its covering hidden; the rafters (or a flat roof's beams) left at
 * the bays, a few sagging; purlins between them, some gone; sheets hanging from them into the hall; the rest crumpled on
 * the hall's floor.
 */
export function roofDownSheet(anatomy: StructureDamageAnatomy, seed: number, out: Writers): DamageStageResult {
  const roof = anatomy.roof;
  if (!roof) return emptyResult();
  const rng = damageRng(seed);
  const mesh = new Mesh(out.mesh);
  const cover = roof.covering;
  const floorY = anatomy.storeys[0]?.y0 ?? 0, [cx, cz] = bodyCentre(anatomy);
  const pitches = roof.kind === 'flat' ? roof.slabs.slice(0, 1) : roof.slabs.slice(0, 2);
  if (mesh.begin(cover.bucket === 'structureMetal' ? cover.bucket : 'structureMetal', 'remnant')) {
    for (const slab of pitches) {
      const [a, b, c, d] = slab.corners;
      const run = Math.hypot(b[0] - a[0], b[2] - a[2]), bays = Math.max(1, Math.round(run / 5));
      const lerp = (p: Vec3, q: Vec3, t: number): Vec3 => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
      const sink = (p: Vec3): Vec3 => [p[0], p[1] - roof.thicknessM - 0.12, p[2]];
      // the rafters at the bays, eave to ridge (a flat roof's beams across), some sagging at their middle
      for (let k = 0; k <= bays; k++) {
        const t = k / bays, foot = sink(lerp(a, b, t)), head = sink(lerp(d, c, t));
        if (rng() < 0.3) {
          const m = lerp(foot, head, 0.4 + rng() * 0.2);
          const drop = 0.3 + rng() * 0.9;
          const mid: Vec3 = [m[0], Math.max(floorY + 0.4, m[1] - drop), m[2]];
          beamBetween(mesh, foot, mid, 0.16, 0.24, [0, 1, 0], STEEL);
          beamBetween(mesh, mid, head, 0.16, 0.24, [0, 1, 0], STEEL);
        } else {
          beamBetween(mesh, foot, head, 0.16, 0.24, [0, 1, 0], STEEL);
        }
      }
      // purlins up the slope between the rafters, a third gone
      const rise = Math.hypot(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
      for (let s = 1.2; s < rise - 0.3; s += 1.4) {
        const t2 = s / rise;
        for (let k = 0; k < bays; k++) {
          if (rng() < 0.33) continue;
          const p = sink(lerp(lerp(a, b, k / bays), lerp(d, c, k / bays), t2)), q = sink(lerp(lerp(a, b, (k + 1) / bays), lerp(d, c, (k + 1) / bays), t2));
          beamBetween(mesh, [p[0], p[1] + 0.12, p[2]], [q[0], q[1] + 0.12, q[2]], 0.07, 0.12, [0, 1, 0], STEEL);
        }
      }
    }
  }
  // sheets hanging from the frame into the hall, and the rest crumpled on its floor
  if (mesh.begin(cover.bucket, 'remnant')) {
    for (const slab of pitches) {
      const [a, b, , d] = slab.corners;
      for (let k = 0; k < 2 + Math.floor(rng() * 2); k++) {
        const t = rng(), s = 0.2 + rng() * 0.6;
        const p: Vec3 = [a[0] + (b[0] - a[0]) * t + (d[0] - a[0]) * s, a[1] + (b[1] - a[1]) * t + (d[1] - a[1]) * s - roof.thicknessM, a[2] + (b[2] - a[2]) * t + (d[2] - a[2]) * s];
        const e = norm3([b[0] - a[0], 0, b[2] - a[2]]), w = 0.9 + rng() * 0.2, len = Math.min(2.6, Math.max(0.6, p[1] - floorY - 0.5)) * (0.5 + rng() * 0.5);
        const p2: Vec3 = [p[0] + e[0] * w, p[1], p[2] + e[2] * w];
        const swingX = (rng() - 0.5) * 0.8, swingZ = (rng() - 0.5) * 0.8;
        sheetQuad(mesh, p, p2, [p2[0] + swingX, p2[1] - len, p2[2] + swingZ], [p[0] + swingX, p[1] - len, p[2] + swingZ], cover.tint);
      }
    }
  }
  if (mesh.begin(cover.bucket, 'rubble')) {
    const count = Math.min(14, 4 + Math.round((anatomy.w * anatomy.d) / 25));
    for (let k = 0; k < count; k++) {
      const x = cx + (rng() - 0.5) * (anatomy.w - 1.5), z = cz + (rng() - 0.5) * (anatomy.d - 1.5), th = rng() * Math.PI;
      crumpledSheet(mesh, rng, [x, floorY, z], [Math.cos(th), 0, Math.sin(th)], 0.9 + rng() * 0.2, 1.8 + rng() * 1.8, 2 + Math.floor(rng() * 2),
        () => floorY, cover.tint);
    }
  }
  mesh.end();
  for (let k = 0; k < Math.min(40, out.pieces.capacity); k++) {
    const slab = pitches[k % Math.max(1, pitches.length)];
    if (!slab) break;
    const [a, b, , d] = slab.corners, t = rng(), s = rng();
    const p: Vec3 = [a[0] + (b[0] - a[0]) * t + (d[0] - a[0]) * s, a[1] + (b[1] - a[1]) * t + (d[1] - a[1]) * s, a[2] + (b[2] - a[2]) * t + (d[2] - a[2]) * s];
    if (!throwPieceAt(out.pieces, rng, cover.bucket, 'sheet', p, [0.6 + rng() * 0.5, 0.012, 0.5 + rng() * 0.4], cover.tint, 2)) break;
  }
  return { cuts: [], hides: [{ section: null, partClass: 'roof' }] };
}

// ---------------------------------------------------------------------------------------------------- the collapse

/**
 * A sheet hall collapses (§16.3 Collapse): the frame down to bent column stumps along its walls, and a low tangle over
 * the sim's mound (a skin of its own sheet a hand over the mound, never in it): crumpled sheets of its walls and roof,
 * rafters and girts lying across, one end propped; the falling sheet thrown from where the walls and roof were.
 */
export function collapseSheet(anatomy: StructureDamageAnatomy, seed: number, out: Writers, mound: MoundHeight): DamageStageResult {
  const rng = damageRng(seed);
  const mesh = new Mesh(out.mesh);
  const st0 = anatomy.storeys[0], [cx, cz] = bodyCentre(anatomy);
  const top = (x: number, z: number): number => {
    const m = mound(x, z);
    return m + HEAP_LIFT_M * Math.max(0, Math.min(1, (m - 0.12) / 0.5));
  };
  const sheetSlot = st0?.faces.find((f) => isSheetFace(f))?.layers[0] ?? anatomy.rubble[0];
  // 1. the skin: the pile's own sheet over the mound, sooted and dulled (the bright sheets lie over it)
  const slots = [...anatomy.rubble.filter((s) => s.share > 0.005)];
  const dull = (t: Rgb): Rgb => [t[0] * 0.42, t[1] * 0.41, t[2] * 0.4];
  heapSkin(mesh, anatomy, sheetSlot ? [{ ...sheetSlot, material: 'plaster', tint: dull(sheetSlot.tint) }, ...slots] : slots, top, cx, cz, rng);
  // 2. the column stumps along the walls, bent over
  const stumps: Array<[Vec3, Vec3]> = [];
  if (st0 && mesh.begin(steelSlot(st0.faces[0]).bucket, 'remnant')) {
    for (const f of st0.faces) {
      const pen = new FacePen(f, fallbackSurface(f));
      for (const u of frameOf(f).columns) {
        const base = at(pen, u, 0, -0.17);
        const h = 0.8 + rng() * 2.2, ang = rng() * Math.PI * 2, bend = 0.15 + rng() * 0.9;
        const kneeH = Math.min(h, 0.6 + rng() * 0.8);
        const knee: Vec3 = [base[0], base[1] + kneeH, base[2]];
        const tip: Vec3 = [knee[0] + Math.cos(ang) * bend, knee[1] + (h - kneeH) * 0.6, knee[2] + Math.sin(ang) * bend];
        beamBetween(mesh, base, knee, 0.18, 0.2, [0, 1, 0], STEEL);
        beamBetween(mesh, knee, tip, 0.18, 0.2, [0, 1, 0], STEEL);
        stumps.push([knee, tip]);
      }
    }
  }
  // 3. crumpled sheet over the heap, walls' and roof's
  const cover = anatomy.roof?.covering ?? sheetSlot;
  const area = anatomy.w * anatomy.d, count = Math.min(40, 12 + Math.round(area / 9));
  if (sheetSlot && mesh.begin(sheetSlot.bucket, 'rubble')) {
    for (let k = 0; k < count; k++) {
      const slot = k % 2 === 0 || !cover ? sheetSlot : cover;
      const x = cx + (rng() - 0.5) * anatomy.w * 0.9, z = cz + (rng() - 0.5) * anatomy.d * 0.9, th = rng() * Math.PI;
      crumpledSheet(mesh, rng, [x, 0, z], [Math.cos(th), 0, Math.sin(th)], 0.9 + rng() * 0.3, 2.6 + rng() * 2.4, 2 + Math.floor(rng() * 3), top, slot.tint);
    }
    // a few sheets left leaning on the bent stumps
    for (const [knee, tip] of stumps) {
      if (rng() < 0.7) continue;
      const fx = knee[0] + (knee[0] - tip[0]) * 1.4, fz = knee[2] + (knee[2] - tip[2]) * 1.4;
      const foot: Vec3 = [fx, top(fx, fz) + 0.05, fz];
      const side = norm3(cross3([tip[0] - foot[0], tip[1] - foot[1], tip[2] - foot[2]], [0, 1, 0]));
      if (!Number.isFinite(side[0])) continue;
      const w = 0.5;
      sheetQuad(mesh, [foot[0] - side[0] * w, foot[1], foot[2] - side[2] * w], [foot[0] + side[0] * w, foot[1], foot[2] + side[2] * w],
        [tip[0] + side[0] * w, tip[1], tip[2] + side[2] * w], [tip[0] - side[0] * w, tip[1], tip[2] - side[2] * w], sheetSlot.tint);
    }
  }
  // 4. rafters and girts lying across it, one end propped on the tangle
  if (mesh.begin(sheetSlot?.bucket ?? 'structureMetal', 'rubble')) {
    const beams = Math.min(12, 4 + Math.round((anatomy.w + anatomy.d) / 4));
    for (let k = 0; k < beams; k++) {
      const len = 2.5 + rng() * Math.min(5, Math.max(anatomy.w, anatomy.d) * 0.5), ang = rng() * Math.PI;
      const mx = cx + (rng() - 0.5) * anatomy.w * 0.6, mz = cz + (rng() - 0.5) * anatomy.d * 0.6;
      const ca = Math.cos(ang), sa = Math.sin(ang), hx = anatomy.w / 2 + 0.5, hz = anatomy.d / 2 + 0.5;
      const half = Math.min(len / 2, Math.abs(ca) > 1e-3 ? (hx - Math.abs(mx - cx)) / Math.abs(ca) : Infinity,
        Math.abs(sa) > 1e-3 ? (hz - Math.abs(mz - cz)) / Math.abs(sa) : Infinity);
      if (half < 0.8) continue;
      const a: Vec3 = [mx - ca * half, top(mx - ca * half, mz - sa * half) + 0.1, mz - sa * half];
      const b: Vec3 = [mx + ca * half, top(mx + ca * half, mz + sa * half) + 0.3 + rng() * 0.6, mz + sa * half];
      beamBetween(mesh, a, b, k % 3 === 0 ? 0.16 : 0.08, k % 3 === 0 ? 0.24 : 0.14, [0, 1, 0], STEEL);
    }
  }
  mesh.end();
  // 5. the fall: sheet from where the walls and the roof were, down and out
  const h = anatomy.roof?.ridgeY ?? anatomy.h;
  for (let i = 0; i < out.pieces.capacity; i++) {
    const slot = i % 3 === 0 && cover ? cover : sheetSlot;
    if (!slot) break;
    const ox = (rng() - 0.5) * anatomy.w, oz = (rng() - 0.5) * anatomy.d, y = 0.8 + rng() * Math.max(0.5, h - 0.8);
    const len = Math.hypot(ox, oz) || 1, sp = 1 + rng() * 2.5, ang = rng() * Math.PI * 2;
    if (!out.pieces.push(slot.bucket, 'sheet', Math.floor(rng() * 4), cx + ox, y, cz + oz, 0, Math.sin(ang / 2), 0, Math.cos(ang / 2),
      0.6 + rng() * 0.6, 0.012, 0.5 + rng() * 0.5, slot.tint[0], slot.tint[1], slot.tint[2], (ox / len) * sp, -1 - rng() * 2, (oz / len) * sp)) break;
  }
  return { cuts: [], hides: [{ section: null, partClass: null }] };
}
