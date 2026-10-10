// src/world/maps/regional/ruin.ts — a ruin (the facades lane, 2026-10-08; docs/DESTRUCTION.md §16.3; the coordinator's
// order of work: compounds, containers, then ruins: 58 on the maps, 39 of them in Steinburg).
//
// A ruin is what is left of a house: its walls standing to ragged tops, its roof gone, a few charred timbers. Its kit
// merges the masonry into one geometry a bucket, and its anatomy (damage.ts describeRuin) is the sim's box round the
// walls left. The builders here find the wall piece a blow reaches and break that piece as a house's wall breaks
// (fracture.ts), so a hole never opens where the wall has already fallen:
// - a breach: the ray from the event's point on the ruin's face to the first piece it meets under that piece's own top;
//   the hole on that piece's face;
// - the damaged stage: spalls on two pieces;
// - a wall section's fall: every piece on that side broken down through its upper part (a wide ragged gap);
// - the collapse: every piece down to a low ragged stub over the heap banked against it, the heap of its masonry over the
//   sim's mound, its timbers charred in it.
import {
  damageRng,
  type BreachSpec, type DamageFace, type DamageMeshWriter, type DamagePieceWriter, type DamageStageResult, type FaceName,
  type FractureSlot, type Rgb, type StructureDamageAnatomy, type Vec3,
} from '../../destructionKit.ts';
import {
  FacePen, HEAP_LIFT_M, Mesh, beamBetween, bodyCentre, breachHouse, damagedHouse, fallbackSurface, heapChunk, heapSkin, remnantWall,
  type MoundHeight,
} from './fracture.ts';

type Writers = { mesh: DamageMeshWriter; pieces: DamagePieceWriter };

/** The writers with no dark room behind a hole: a ruin is open to the sky, its holes show the ground inside it. */
function openSky(out: Writers): Writers {
  const w = out.mesh;
  const mesh: DamageMeshWriter = {
    begin: (bucket, role) => (role === 'room' ? false : w.begin(bucket, role)),
    vertex: (px, py, pz, nx, ny, nz, u, v, r, g, b) => w.vertex(px, py, pz, nx, ny, nz, u, v, r, g, b),
    triangle: (a, b, c) => w.triangle(a, b, c),
    end: () => w.end(),
    get vertices() { return w.vertices; },
    get capacity() { return w.capacity; },
  };
  return { mesh, pieces: out.pieces };
}

/** A wall piece of a ruin (shell.ts readWallPieces): its base's middle, its axes, half its length and thickness, its top. */
interface RuinPiece {
  c: Vec3;
  along: Vec3;
  out: Vec3;
  hl: number;
  ht: number;
  top: readonly number[];
  bucket: string;
}

export function ruinPiecesOf(anatomy: StructureDamageAnatomy): readonly RuinPiece[] | null {
  const k = anatomy.kitPlan as { damage?: { ruin?: readonly RuinPiece[] } } | undefined;
  return k?.damage?.ruin ?? null;
}

/** A piece's top over its base at `u` along it (from its middle), between the samples. */
function topAt(p: RuinPiece, u: number): number {
  const n = p.top.length, t = Math.max(0, Math.min(n - 1, ((u + p.hl) / (2 * p.hl)) * n - 0.5));
  const i = Math.floor(t), j = Math.min(n - 1, i + 1), f = t - i;
  return p.top[i] * (1 - f) + p.top[j] * f;
}

/** A piece as an anatomy of its own: one storey to its highest top, its four sides in the ruin's layers. */
function pieceAnatomy(anatomy: StructureDamageAnatomy, p: RuinPiece): StructureDamageAnatomy {
  const h = Math.max(...p.top), y0 = p.c[1];
  const layers = anatomy.storeys[0].faces[0].layers.map((l) => ({ ...l, bucket: l.bucket === anatomy.storeys[0].faces[0].bucket ? p.bucket : l.bucket,
    thicknessM: Math.max(0.1, Math.min(l.thicknessM, 2 * p.ht)) }));
  const neg = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]];
  const at = (k: number, along: number): Vec3 => [p.c[0] + p.out[0] * k * p.ht + p.along[0] * along, y0, p.c[2] + p.out[2] * k * p.ht + p.along[2] * along];
  // front on the out side (its u along the piece: u × out points down, as house.ts), back opposite, the two ends
  const sides: ReadonlyArray<{ name: FaceName; u: Vec3; out: Vec3; width: number; origin: Vec3 }> = [
    { name: 'front', u: neg(p.along), out: p.out, width: 2 * p.hl, origin: at(1, 0) },
    { name: 'right', u: neg(p.out), out: neg(p.along), width: 2 * p.ht, origin: at(0, -p.hl) },
    { name: 'back', u: p.along, out: neg(p.out), width: 2 * p.hl, origin: at(-1, 0) },
    { name: 'left', u: p.out, out: p.along, width: 2 * p.ht, origin: at(0, p.hl) },
  ];
  const faces: DamageFace[] = sides.map((s, f) => ({
    name: s.name, section: f, u: s.u, out: s.out, origin: s.origin, width: s.width, height: h,
    bucket: p.bucket, layers: layers.map((l) => ({ ...l })), openings: [], members: [], masonry: null,
  }));
  return {
    ...anatomy, w: 2 * p.hl, d: 2 * p.ht, h: y0 + h, plinth: null, roof: null, chimneys: [],
    storeys: [{ index: 0, y0, y1: y0 + h, jetty: [0, 0, 0, 0], framed: false, faces, floor: null }],
    interior: { color: anatomy.interior.color, open: true },
    kitPlan: undefined,
  };
}

/** The first piece a ray from `p` along the horizontal `d` meets under its own top: the piece, its side, the point. */
function rayPiece(pieces: readonly RuinPiece[], p: Vec3, d: Vec3, maxT: number): { piece: RuinPiece; side: number; at: Vec3; u: number } | null {
  let best: { piece: RuinPiece; side: number; at: Vec3; u: number } | null = null, bestT = maxT;
  for (const w of pieces) {
    const rx = p[0] - w.c[0], rz = p[2] - w.c[2];
    const slabs: ReadonlyArray<[number, number, number, number, number]> = [
      [rx * w.along[0] + rz * w.along[2], d[0] * w.along[0] + d[2] * w.along[2], w.hl, 3, 1],
      [rx * w.out[0] + rz * w.out[2], d[0] * w.out[0] + d[2] * w.out[2], w.ht, 2, 0],
    ];
    let t0 = -Infinity, t1 = Infinity, enter = -1;
    for (const [o, v, half, minus, plus] of slabs) {
      if (Math.abs(v) < 1e-9) { if (Math.abs(o) > half) { t0 = Infinity; break; } continue; }
      const ta = (-half - o) / v, tb = (half - o) / v, near = Math.min(ta, tb), far = Math.max(ta, tb);
      if (near > t0) { t0 = near; enter = v > 0 ? minus : plus; }
      t1 = Math.min(t1, far);
    }
    if (t0 > t1 || t1 < 0 || enter < 0) continue;
    const t = Math.max(0, t0), at: Vec3 = [p[0] + d[0] * t, p[1], p[2] + d[2] * t];
    const u = (at[0] - w.c[0]) * w.along[0] + (at[2] - w.c[2]) * w.along[2];
    if (p[1] < w.c[1] + 0.1 || p[1] > w.c[1] + topAt(w, u) - 0.15) continue;
    if (t < bestT) { bestT = t; best = { piece: w, side: enter, at, u }; }
  }
  return best;
}

/** A breach in a ruin: on the wall piece the blow reaches, under that piece's own ragged top. */
export function breachRuin(anatomy: StructureDamageAnatomy, hole: BreachSpec, out: Writers): DamageStageResult {
  const pieces = ruinPiecesOf(anatomy);
  const st = anatomy.storeys[hole.storey], f = st?.faces.find((x) => x.section === hole.section);
  if (!pieces || !st || !f) return { cuts: [], hides: [] };
  const p: Vec3 = [f.origin[0] + f.u[0] * hole.u + f.out[0] * 0.3, st.y0 + hole.y, f.origin[2] + f.u[2] * hole.u + f.out[2] * 0.3];
  const hit = rayPiece(pieces, p, [-f.out[0], 0, -f.out[2]], Math.max(anatomy.w, anatomy.d) + 1);
  if (!hit || hit.side % 2 === 1) return { cuts: [], hides: [] };
  const proxy = pieceAnatomy(anatomy, hit.piece), cf = proxy.storeys[0].faces[hit.side];
  const u = (hit.at[0] - cf.origin[0]) * cf.u[0] + (hit.at[2] - cf.origin[2]) * cf.u[2];
  const top = topAt(hit.piece, hit.u);
  const r = Math.min(hole.radiusM, cf.width / 2 - 0.2, (top - 0.3) / 2);
  if (r < 0.15) return { cuts: [], hides: [] };
  return breachHouse(proxy, { ...hole, section: cf.section, storey: 0, face: cf.name,
    u: Math.max(-cf.width / 2 + r + 0.1, Math.min(cf.width / 2 - r - 0.1, u)),
    y: Math.max(r + 0.1, Math.min(top - r - 0.15, hit.at[1] - hit.piece.c[1])), radiusM: r }, openSky(out));
}

/** The damaged stage on a ruin: spalls on two of its longer pieces. */
export function damagedRuin(anatomy: StructureDamageAnatomy, seed: number, out: Writers): DamageStageResult {
  const pieces = [...(ruinPiecesOf(anatomy) ?? [])].sort((a, b) => b.hl - a.hl).slice(0, 4);
  const rng = damageRng(seed);
  const cuts: DamageStageResult['cuts'] = [];
  for (let k = 0; k < Math.min(2, pieces.length); k++) {
    cuts.push(...damagedHouse(pieceAnatomy(anatomy, pieces[Math.floor(rng() * pieces.length)]), Math.floor(rng() * 0x7fffffff), openSky(out)).cuts);
  }
  return { cuts, hides: [] };
}

/**
 * A ruin's wall section falls: every piece standing on that side, within a metre and a half of the ruin's face and in the
 * band, broken down through its upper part (a wide ragged gap high in it, the earth of it at its foot).
 */
export function sectionDownRuin(anatomy: StructureDamageAnatomy, section: number, seed: number, out: Writers): DamageStageResult {
  const pieces = ruinPiecesOf(anatomy) ?? [];
  const st = anatomy.storeys[Math.floor(section / 4)], f = st?.faces.find((x) => x.section === section);
  if (!st || !f) return { cuts: [], hides: [] };
  const rng = damageRng(seed);
  const cuts: DamageStageResult['cuts'] = [];
  const plane = f.origin[0] * f.out[0] + f.origin[2] * f.out[2];
  for (const w of pieces) {
    const proxy = pieceAnatomy(anatomy, w);
    let side = 0, best = -Infinity;
    proxy.storeys[0].faces.forEach((cf, k) => { const dot = cf.out[0] * f.out[0] + cf.out[2] * f.out[2]; if (dot > best) { best = dot; side = k; } });
    const cf = proxy.storeys[0].faces[side];
    if (best < 0.6 || side % 2 === 1 || plane - (cf.origin[0] * f.out[0] + cf.origin[2] * f.out[2]) > 1.5) continue;
    // the piece broken down from its head: a cut over its top, as wide as the piece and more (a ruin's piers are narrow),
    // its lower third of the way down the piece
    const u = (rng() - 0.5) * cf.width * 0.3, top = topAt(w, -u * (side === 0 ? 1 : -1));
    if (w.c[1] + top < st.y0 + 0.6 || w.c[1] > st.y1 || top < 0.8) continue;
    const r = Math.max(0.45, Math.min(1.1, cf.width / 2 + 0.2, top * 0.45));
    cuts.push(...breachHouse(proxy, { section: cf.section, storey: 0, face: cf.name, hole: 255, u, y: top - r * 0.35, radiusM: r,
      dirX: -f.out[0], dirZ: -f.out[2], munition: null, cause: 'blast', seed: Math.floor(rng() * 0x7fffffff) }, openSky(out)).cuts);
  }
  return { cuts, hides: [] };
}

/** Charred timber: a burnt house's beams, near black with a brown cast. */
const CHAR: Rgb = [0.11, 0.09, 0.08];

/**
 * A ruin comes down: every piece to a low ragged stub over the heap banked against it (never higher than it stood), the
 * heap of its masonry over the sim's mound (its skin dust-coated, chunks of its walls over it), its timbers charred in it.
 */
export function collapseRuin(anatomy: StructureDamageAnatomy, seed: number, out: Writers, mound: MoundHeight): DamageStageResult {
  const pieces = ruinPiecesOf(anatomy) ?? [];
  const rng = damageRng(seed);
  const mesh = new Mesh(out.mesh);
  const [cx, cz] = bodyCentre(anatomy);
  const heapTop = (x: number, z: number): number => { const m = mound(x, z); return m + HEAP_LIFT_M * Math.max(0, Math.min(1, (m - 0.12) / 0.5)); };
  // 1. the stubs: both faces of each piece, ragged, over the heap against them, no higher than the piece stood
  for (const w of pieces) {
    const proxy = pieceAnatomy(anatomy, w);
    const lobes = Array.from({ length: 4 }, () => [rng() * 2 - 1, rng() * Math.PI * 2]);
    for (const f of [proxy.storeys[0].faces[0], proxy.storeys[0].faces[2]]) {
      const sign = f === proxy.storeys[0].faces[0] ? -1 : 1; // (front's u runs against the piece's along)
      const line = (u: number): number => {
        let v = 0;
        for (let k = 0; k < lobes.length; k++) v += lobes[k][0] * Math.sin(u * sign * (k + 1) * 1.2 + lobes[k][1]) / (k + 1);
        const banked = Math.max(0, heapTop(f.origin[0] + f.u[0] * u, f.origin[2] + f.u[2] * u) - f.origin[1]);
        return Math.min(topAt(w, u * sign), f.height, Math.max(0.25, banked + 0.45 + 0.4 * (1 + v)));
      };
      remnantWall(mesh, new FacePen(f, fallbackSurface(f)), proxy, rng, line);
    }
  }
  // 2. the heap: its skin over the mound in the walls' masonry, chunks of it over the skin where it stands high
  const slots = anatomy.rubble.filter((s) => s.share > 0.005);
  const reach = heapSkin(mesh, anatomy, slots, heapTop, cx, cz, rng);
  const crown = Math.max(0.05, mound(cx, cz));
  const budget = Math.max(40, Math.min(320, Math.floor((out.mesh.capacity - out.mesh.vertices) * 0.6 / 26)));
  for (const slot of slots) {
    const count = Math.round(budget * slot.share);
    if (count < 1 || !mesh.begin(slot.bucket, 'rubble')) continue;
    for (let i = 0; i < count; i++) {
      let x = cx, z = cz;
      for (let t = 0; t < 8; t++) {
        const a = rng() * Math.PI * 2, r = Math.sqrt(rng());
        const px = cx + Math.cos(a) * r * reach[0], pz = cz + Math.sin(a) * r * reach[1];
        if (rng() * crown < mound(px, pz)) { x = px; z = pz; break; }
      }
      const sx = 0.12 + rng() * 0.26, sy = 0.08 + rng() * 0.18, sz = 0.1 + rng() * 0.22;
      heapChunk(mesh, slot, x, heapTop(x, z) + sy * 0.35, z, sx, sy, sz, rng() * Math.PI, (rng() - 0.5) * 0.9, rng);
    }
  }
  // 3. its timbers charred in the heap: a few across it, one end propped
  if (mesh.begin('structureWood', 'rubble')) {
    const n = Math.min(6, 2 + Math.round((anatomy.w + anatomy.d) / 6));
    for (let k = 0; k < n; k++) {
      const len = 1.6 + rng() * 2.2, ang = rng() * Math.PI;
      const mx = cx + (rng() - 0.5) * anatomy.w * 0.5, mz = cz + (rng() - 0.5) * anatomy.d * 0.5;
      const dx = Math.cos(ang) * len / 2, dz = Math.sin(ang) * len / 2;
      const a: Vec3 = [mx - dx, heapTop(mx - dx, mz - dz) + 0.05, mz - dz];
      const b: Vec3 = [mx + dx, heapTop(mx + dx, mz + dz) + 0.2 + rng() * 0.6, mz + dz];
      beamBetween(mesh, a, b, 0.14, 0.16, [0, 1, 0], CHAR);
    }
  }
  mesh.end();
  return { cuts: [], hides: [{ section: null, partClass: null }] };
}

/** A slot of a ruin's masonry: a piece's bucket and tint, its share by the piece's wall area. */
export function ruinRubble(pieces: readonly { hl: number; top: readonly number[]; bucket: string; tint: Rgb }[], material: FractureSlot['material']): FractureSlot[] {
  const by = new Map<string, FractureSlot>();
  for (const p of pieces) {
    const area = 2 * p.hl * (p.top.reduce((a, y) => a + y, 0) / p.top.length);
    const had = by.get(p.bucket);
    if (had) had.share += area; else by.set(p.bucket, { material, bucket: p.bucket, tint: p.tint, thicknessM: 0.4, share: area });
  }
  const total = [...by.values()].reduce((a, s) => a + s.share, 0) || 1;
  return [...by.values()].map((s) => ({ ...s, share: s.share / total }));
}
