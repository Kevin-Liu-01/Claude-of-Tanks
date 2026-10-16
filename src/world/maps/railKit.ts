// src/world/maps/railKit.ts — industrial + maritime landmark builders for the
// maps r1 battlefields (railyard, coastal). Registered into props.ts
// BUILDER_BY_NAME through maps/urbanKit.ts URBAN_BUILDERS (same zero-props.ts-
// change contract as the desert bazaar kit):
//   make<X>(rng, buckets, wallBucket?) -> {w, d, h}
// pushing THREE.BufferGeometry into buckets.{plaster,stone,roof,wood,dark,
// glass,baked}. 'stone' is BRICK on railyard (sourcedTextures swap), 'baked'
// is the matte vertex-colored bucket (containers, tar decks).

import * as THREE from 'three';
import { markWorldLantern } from '../worldNightEmissionGeometry.ts';
import {
  box, gableAttic, gablePrism as createGablePrism, gableSlabSeat, jitterUV, pitchRoofPlane, scaleUV, slabBox,
} from '../propGeometry.ts';
import {
  INDUSTRIAL_CLADDING,
  structureBuildContext,
  type GeometryBuckets,
  type StructureBuilder,
  type StructureDimensions,
} from './exteriorDetailKit.ts';
// (the container rows' own kit: maps/containerRowKit.ts; the row stays in this kit's table and is re-exported)
import { makeContainerRow } from './containerRowKit.ts';
// (the gantry and the shed are rebuilt in their own file: maps/railYardR2.ts; the looks lane's r2 sweep, 2026-10-16)
import { hallPlinth, hallSlab, makeGantry, makeShed } from './railYardR2.ts';
import { terraceLayout, terraceUnits } from './terraceLayout.ts';

const gablePrism = (width: number, height: number, depth: number): THREE.BufferGeometry => (
  createGablePrism(width, height, depth, 0.5)
);

/** Flat vertex paint (with slight per-vertex value jitter) for the matte
 * vertex-colored 'baked' bucket — the container/tar-deck material. */
function paintGeo(
  geo: THREE.BufferGeometry,
  rng: () => number,
  r: number,
  g: number,
  b: number,
  jitter = 0.06,
): THREE.BufferGeometry {
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = 1 + (rng() - 0.5) * jitter * 2;
    col[i * 3] = Math.min(1, r * v);
    col[i * 3 + 1] = Math.min(1, g * v);
    col[i * 3 + 2] = Math.min(1, b * v);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// =============================================================================
// RAIL YARD BUILDERS
// =============================================================================

/** A part new to the builder's stream: it takes no draws from the shared stream (props.ts jitterBuildingUvs). */
function dressing<T extends THREE.BufferGeometry>(geo: T): T {
  geo.userData.uvJitter = 'none';
  return geo;
}

type P3 = readonly [number, number, number];
/** A member from a to b (its section t x d), new to the stream (dressing). */
function memberGeo(a: P3, b: P3, t: number, d = t): THREE.BufferGeometry {
  const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = dir.length();
  const g = box(t, d, Math.max(0.01, len), 1.0);
  // (its length along z turned onto the member's direction: a near-vertical stile keeps its rake)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize()));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return dressing(g);
}
/** A box new to the stream (dressing), centred at (x, y, z). */
function boxAt(w: number, h: number, d: number, x: number, y: number, z: number, uv = 1.0): THREE.BufferGeometry {
  const g = box(w, h, d, uv);
  g.translate(x, y, z);
  return dressing(g);
}
/** A box whose UVs are laid from the world (its faces' own planes, `scale` a metre), new to the stream (dressing): pieces
 *  of one wall keep their courses running on across the joints between them. The face `skip` (the one against the hall's
 *  core) is left out: it would stand on the core's face, a wall turned inward. */
function worldBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, scale: number, skip: 'px' | 'nx' | 'pz' | 'nz' | null = null): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uvs: number[] = [], idx: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], n: number[]) => {
    const base = pos.length / 3;
    for (const p of [a, b, c, d]) {
      pos.push(...p); nor.push(...n);
      const [u, v] = Math.abs(n[0]) > 0.5 ? [p[2], p[1]] : Math.abs(n[2]) > 0.5 ? [p[0], p[1]] : [p[0], p[2]];
      uvs.push(u * scale, v * scale);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  // each face wound counter-clockwise seen from outside
  if (skip !== 'px') quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]);
  if (skip !== 'nx') quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
  if (skip !== 'pz') quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
  if (skip !== 'nz') quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);
  quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]);
  quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return dressing(g);
}

/** A hole through a hall's wall: its centre along the wall (`at`: z on the ±x walls, x on the ±z walls), its width, sill
 *  and head. */
export interface WallHole { at: number; w: number; y0: number; y1: number }

/**
 * A rectangular hall's walls `t` thick round its core, the holes cut through them (props census #13 and #4, lane B
 * 2026-10-15: the plan halls were one solid box with their windows and doors laid on it). Each wall stands in bands
 * between the holes' sills and heads, each band in runs between the holes across it: closed boxes, their UVs laid from
 * the world (the courses run on across the joints), all new to the stream. The core (the room, whose face is the back of
 * every reveal) is returned for the caller to push: it stands in the stream where the old solid stood.
 */
export function cutHall(out: THREE.BufferGeometry[], w: number, d: number, h: number, t: number,
  holes: { px?: readonly WallHole[]; nx?: readonly WallHole[]; pz?: readonly WallHole[]; nz?: readonly WallHole[] }, scale = 0.55): THREE.BufferGeometry {
  cutWalls(out, w, d, h, t, holes, scale);
  return box(w - 2 * t, h, d - 2 * t, scale).translate(0, h / 2, 0);
}

/** cutHall's walls alone (the pieces round the holes), for a builder that lays its core itself. */
function cutWalls(out: THREE.BufferGeometry[], w: number, d: number, h: number, t: number,
  holes: { px?: readonly WallHole[]; nx?: readonly WallHole[]; pz?: readonly WallHole[]; nz?: readonly WallHole[] }, scale = 0.55): void {
  // one wall: along `axis` from a0 to a1, across from c0 to c1
  const wall = (axis: 'x' | 'z', a0: number, a1: number, c0: number, c1: number, inward: 'px' | 'nx' | 'pz' | 'nz', list: readonly WallHole[] = []) => {
    const ys = [...new Set([0, h, ...list.flatMap((o) => [Math.max(0, Math.min(h, o.y0)), Math.max(0, Math.min(h, o.y1))])])].sort((p, q) => p - q);
    for (let i = 0; i + 1 < ys.length; i++) {
      const ya = ys[i], yb = ys[i + 1];
      if (yb - ya < 1e-4) continue;
      const across = list.filter((o) => o.y0 <= ya + 1e-6 && o.y1 >= yb - 1e-6).map((o) => [o.at - o.w / 2, o.at + o.w / 2] as const).sort((p, q) => p[0] - q[0]);
      let from = a0;
      const run = (to: number) => {
        if (to - from < 0.02) return;
        out.push(axis === 'z' ? worldBox(c0, ya, from, c1, yb, to, scale, inward) : worldBox(from, ya, c0, to, yb, c1, scale, inward));
      };
      for (const [u0, u1] of across) { run(Math.max(a0, u0)); from = Math.max(from, Math.min(a1, u1)); }
      run(a1);
    }
  };
  wall('z', -d / 2, d / 2, w / 2 - t, w / 2, 'nx', holes.px);
  wall('z', -d / 2, d / 2, -w / 2, -w / 2 + t, 'px', holes.nx);
  wall('x', -w / 2 + t, w / 2 - t, d / 2 - t, d / 2, 'nz', holes.pz);
  wall('x', -w / 2 + t, w / 2 - t, -d / 2, -d / 2 + t, 'pz', holes.nz);
}

export type HallHoles = { px: WallHole[]; nx: WallHole[]; pz: WallHole[]; nz: WallHole[] };
/** A part a cut hall's opening holds (a pane, a shutter, a catalog plate): laid on the face as the old build laid it (the
 *  catalog pass reads it there) and moved to `offset` before the core's face by settleCatalogCuts. */
export interface HallUnit { g: THREE.BufferGeometry; side: 'px' | 'nx' | 'pz' | 'nz'; offset: number }
type HallSide = keyof HallHoles;
const SIDE_OF = (b: THREE.Box3, w: number, d: number): HallSide | null => {
  const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
  if (Math.abs(cz - d / 2) < 0.35) return 'pz';
  if (Math.abs(cz + d / 2) < 0.35) return 'nz';
  if (Math.abs(cx - w / 2) < 0.35) return 'px';
  if (Math.abs(cx + w / 2) < 0.35) return 'nx';
  return null;
};
const boxOf = (g: THREE.BufferGeometry): THREE.Box3 => { g.computeBoundingBox(); return g.boundingBox!.clone(); };

/**
 * The catalog exterior (exteriorDetailKit addConnectedExterior) on a cut hall (props census #13, lane B 2026-10-15):
 * its plates for openings (the parts `opening` names: an entry door, a back aperture's pane) are holes through the wall
 * (their sills no lower than `sill`), the plates and the parts they carry (their louvres) the hall's units, moved to the
 * back of their cuts by settleCatalogCuts after the catalog pass (it reads them where the old build laid them); the
 * catalog's frames (jambs, heads, sills, hoods) stay round the cuts on the face. `clear` says whether a further hole would
 * meet a catalog part on the face.
 */
export function catalogHoles(cat: GeometryBuckets, w: number, d: number, opening: RegExp, sill: number): {
  holes: HallHoles; clear(side: HallSide, hole: WallHole): boolean; units: HallUnit[];
} {
  const holes: HallHoles = { px: [], nx: [], pz: [], nz: [] }, units: HallUnit[] = [];
  const named = (g: THREE.BufferGeometry): string => String(g.userData?.structureSupport?.part ?? '');
  const plates = new Map<string, HallSide>();
  for (const list of Object.values(cat)) for (const g of list ?? []) {
    if (!opening.test(named(g))) continue;
    const b = boxOf(g), side = SIDE_OF(b, w, d);
    if (!side) continue;
    const along = side === 'pz' || side === 'nz' ? [b.min.x, b.max.x] : [b.min.z, b.max.z];
    holes[side].push({ at: (along[0] + along[1]) / 2, w: along[1] - along[0], y0: Math.max(sill, b.min.y), y1: b.max.y });
    plates.set(named(g), side);
    units.push({ g, side, offset: 0.01 });
  }
  // the parts a plate carries (its louvres) a decimetre before it
  for (const list of Object.values(cat)) for (const g of list ?? []) {
    const side = plates.get(String(g.userData?.structureSupport?.support ?? ''));
    if (side && !plates.has(named(g))) units.push({ g, side, offset: 0.11 });
  }
  // the face-plane reach of a hole on a side, in the catalog's frame
  const meets = (side: HallSide, h: WallHole, b: THREE.Box3): boolean => {
    const along = side === 'pz' || side === 'nz' ? [b.min.x, b.max.x] : [b.min.z, b.max.z];
    const out = side === 'pz' ? b.min.z - d / 2 : side === 'nz' ? -d / 2 - b.max.z : side === 'px' ? b.min.x - w / 2 : -w / 2 - b.max.x;
    const depth = side === 'pz' ? b.max.z - d / 2 : side === 'nz' ? -d / 2 - b.min.z : side === 'px' ? b.max.x - w / 2 : -w / 2 - b.min.x;
    return depth > -0.45 && out < 0.3 && along[1] > h.at - h.w / 2 - 0.04 && along[0] < h.at + h.w / 2 + 0.04 && b.max.y > h.y0 - 0.04 && b.min.y < h.y1 + 0.04;
  };
  return {
    holes, units,
    clear(side, hole) {
      for (const list of Object.values(cat)) for (const g of list ?? []) if (meets(side, hole, boxOf(g))) return false;
      return true;
    },
  };
}

const WAREHOUSE_WALL_T = 0.32;
const CUT_HALL = Symbol('cut-hall');
interface CutHallSpec {
  w: number; d: number; h: number; t: number; holes: HallHoles; pieces: THREE.BufferGeometry[]; bucket: string;
  paint: number | null; units: HallUnit[]; lengths: Record<string, number>;
}

/**
 * The marker of a cut hall's body for the catalog's envelope reading (exteriorDetailKit inferCenteredWallEnvelope reads
 * the largest centred part of the wall buckets): the walls now stand in pieces, so this carries the old solid's bounds,
 * exactly, as two triangles of no area (drawn as nothing), new to the stream. The catalog lays its parts as before.
 */
export function envelopeMarker(w: number, h: number, d: number): THREE.BufferGeometry {
  const b = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
  b.computeBoundingBox();
  const { min, max } = b.boundingBox!;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([min.x, min.y, min.z, min.x, min.y, min.z, min.x, min.y, min.z,
    max.x, max.y, max.z, max.x, max.y, max.z, max.x, max.y, max.z], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from({ length: 6 }, () => [0, 1, 0]).flat(), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
  g.setIndex([0, 1, 2, 3, 4, 5]);
  return dressing(g);
}

/** Tag a plan build's buckets with its cut hall for settleCatalogCuts (after the builder pushed every part). */
export function tagCutHall(buckets: GeometryBuckets, spec: Omit<CutHallSpec, 'lengths'>): void {
  const lengths: Record<string, number> = {};
  for (const key of Object.keys(buckets)) lengths[key] = buckets[key]?.length ?? 0;
  Object.defineProperty(buckets, CUT_HALL, { value: { ...spec, lengths } satisfies CutHallSpec, enumerable: false, configurable: true });
}

/**
 * After the catalog exterior (props.ts addCatalogExterior) on a plan build: a no-op unless the builder cut its hall
 * (makeWarehouse tags its buckets). Then the catalog's openings (its entry door, its back apertures) are cut through the
 * walls where they are clear of the builder's own cuts, their plates (and the louvres they carry) at the back of their
 * cuts, the frames round them on the face; a catalog opening that would meet a cut of the builder's, its frames with it,
 * and every other catalog part standing across a cut (a bay strip, a ladder) is folded into a stand-in sealed in the
 * plinth's margin. No part is added or taken away and none changes its uv draws: the seeded stream, the placements and
 * the court's support parts (the plinth, the dock, the thresholds) are the old build's. (Props census #4/#13, lane B
 * 2026-10-15, with the coordinator's props.ts co-hold for the call.)
 */
export function settleCatalogCuts(tmp: GeometryBuckets): void {
  const spec = (tmp as { [CUT_HALL]?: CutHallSpec })[CUT_HALL];
  if (!spec) return;
  const { w, d, t } = spec;
  const named = (g: THREE.BufferGeometry): string => String(g.userData?.structureSupport?.part ?? '');
  const cat: THREE.BufferGeometry[] = [];
  for (const key of Object.keys(tmp)) for (const g of (tmp[key] ?? []).slice(spec.lengths[key] ?? 0)) cat.push(g);
  const holes: HallHoles = { px: [...spec.holes.px], nx: [...spec.holes.nx], pz: [...spec.holes.pz], nz: [...spec.holes.nz] };
  const overlaps = (a: WallHole, b: WallHole, m: number): boolean => a.at - a.w / 2 < b.at + b.w / 2 + m && b.at - b.w / 2 < a.at + a.w / 2 + m && a.y0 < b.y1 + m && b.y0 < a.y1 + m;
  const holeOf = (g: THREE.BufferGeometry): { side: HallSide; hole: WallHole } | null => {
    const b = boxOf(g), side = SIDE_OF(b, w, d);
    if (!side) return null;
    const along = side === 'pz' || side === 'nz' ? [b.min.x, b.max.x] : [b.min.z, b.max.z];
    return { side, hole: { at: (along[0] + along[1]) / 2, w: along[1] - along[0], y0: Math.max(0.45, b.min.y), y1: b.max.y } };
  };
  const cut = new Set<string>(), hidden = new Set<THREE.BufferGeometry>();
  // the catalog's openings: cut where clear of the builder's cuts (and of each other)
  const plates = cat.filter((g) => /^(entry-door|aperture-pane)/.test(named(g)));
  for (const g of plates) {
    const o = holeOf(g);
    if (o && !holes[o.side].some((h) => overlaps(h, o.hole, 0.3))) { holes[o.side].push(o.hole); cut.add(named(g)); continue; }
    hidden.add(g);
  }
  // the frames of an opening left uncut go with it (the threshold stays: it is the ground's)
  for (const g of plates) if (hidden.has(g)) {
    const n = named(g);
    const group = n.startsWith('entry') ? /^entry-(jamb|lintel|hood|lantern)/ : new RegExp(`^aperture-(left|right|head|sill)${n.slice('aperture-pane'.length)}$`);
    for (const p of cat) if (group.test(named(p)) || String(p.userData?.structureSupport?.support ?? '') === n) hidden.add(p);
  }
  // every other catalog part across a cut in front of the wall
  const across = (g: THREE.BufferGeometry): boolean => {
    const b = boxOf(g);
    for (const side of ['px', 'nx', 'pz', 'nz'] as const) for (const h of holes[side]) {
      const along = side === 'pz' || side === 'nz' ? [b.min.x, b.max.x] : [b.min.z, b.max.z];
      const out = side === 'pz' ? b.min.z - d / 2 : side === 'nz' ? -d / 2 - b.max.z : side === 'px' ? b.min.x - w / 2 : -w / 2 - b.max.x;
      const depth = side === 'pz' ? b.max.z - d / 2 : side === 'nz' ? -d / 2 - b.min.z : side === 'px' ? b.max.x - w / 2 : -w / 2 - b.min.x;
      // (a hood or an awning over a cut's head, a step at its sill, is no part across it)
      if (depth > -0.05 && out < 0.35 && along[1] > h.at - h.w / 2 + 0.02 && along[0] < h.at + h.w / 2 - 0.02 && b.max.y > h.y0 + 0.15 && b.min.y < h.y1 - 0.15) return true;
    }
    return false;
  };
  for (const g of cat) {
    const n = named(g), sup = String(g.userData?.structureSupport?.support ?? '');
    if (hidden.has(g) || cut.has(n) || cut.has(sup) || /threshold/.test(n)) continue;
    if (across(g)) hidden.add(g);
  }
  // the walls again, round every cut
  const list = tmp[spec.bucket]!;
  for (const g of spec.pieces) { const i = list.indexOf(g); if (i >= 0) list.splice(i, 1); }
  const pieces: THREE.BufferGeometry[] = [];
  cutWalls(pieces, w, d, spec.h, t, holes);
  if (spec.paint !== null) { const r = forkRng(0.731); for (const g of pieces) paintHex(g, r, spec.paint, 1, 0.03); }
  list.push(...pieces);
  // the builder's units to the back of their cuts
  const liftOf = (b: THREE.Box3, side: HallSide, off: number): number => (side === 'pz' ? b.min.z - (d / 2 - t + off) : side === 'nz' ? (-d / 2 + t - off) - b.max.z
    : side === 'px' ? b.min.x - (w / 2 - t + off) : (-w / 2 + t - off) - b.max.x);
  for (const u of spec.units) {
    const lift = liftOf(boxOf(u.g), u.side, u.offset), n = u.side === 'pz' ? [0, 0, -1] : u.side === 'nz' ? [0, 0, 1] : u.side === 'px' ? [-1, 0, 0] : [1, 0, 0];
    u.g.translate(n[0] * lift, 0, n[2] * lift);
  }
  // the cut openings' plates to the back of their cuts, their louvres a decimetre before them
  const lifts = new Map<string, { side: HallSide; lift: number }>();
  for (const g of plates) {
    const n = named(g);
    if (!cut.has(n)) continue;
    const b = boxOf(g), side = SIDE_OF(b, w, d)!;
    lifts.set(n, { side, lift: liftOf(b, side, 0.01) });
  }
  for (const g of cat) {
    const own = lifts.get(named(g)), carrier = lifts.get(String(g.userData?.structureSupport?.support ?? ''));
    const m = own ?? (carrier ? { side: carrier.side, lift: carrier.lift - 0.1 } : null);
    if (!m || hidden.has(g)) continue;
    const n = m.side === 'pz' ? [0, 0, -1] : m.side === 'nz' ? [0, 0, 1] : m.side === 'px' ? [-1, 0, 0] : [1, 0, 0];
    g.translate(n[0] * m.lift, 0, n[2] * m.lift);
  }
  // the parts left out: each folded to a 2 cm stand-in sealed in the plinth under the core, on the core's foot (its draws
  // kept)
  let k = 0;
  for (const g of hidden) {
    const b = boxOf(g), c = new THREE.Vector3(), size = new THREE.Vector3();
    b.getCenter(c); b.getSize(size);
    g.translate(-c.x, -c.y, -c.z);
    g.scale(0.02 / Math.max(size.x, 1e-3), 0.02 / Math.max(size.y, 1e-3), 0.02 / Math.max(size.z, 1e-3));
    g.translate(0.3, 0, -d / 2 + t + 0.5 + (k++ % 300) * 0.05);
  }
}

/** A ladder up from y0 to y1 at (x, z): two stiles across `span` along `along` ('x' | 'z'), rungs every 0.35 m. */
function ladderGeos(x: number, z: number, y0: number, y1: number, along: 'x' | 'z', span = 0.45): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const ax = along === 'x' ? span / 2 : 0, az = along === 'z' ? span / 2 : 0;
  for (const s of [-1, 1]) out.push(boxAt(0.05, y1 - y0, 0.05, x + s * ax, (y0 + y1) / 2, z + s * az));
  for (let y = y0 + 0.3; y < y1 - 0.05; y += 0.35) out.push(boxAt(along === 'x' ? span : 0.03, 0.03, along === 'z' ? span : 0.03, x, y, z));
  return out;
}

// follow-up 3 (2026-09-26): the cladding liveries are shared with the other industrial halls (exteriorDetailKit
// INDUSTRIAL_CLADDING) — on a snow map the sheet is frosted pale grey with oxide trims and eave snow ledges
const WAREHOUSE_CLADDING_HEX = INDUSTRIAL_CLADDING.sheet;
const WAREHOUSE_CLADDING_HEX_SNOW = INDUSTRIAL_CLADDING.sheetSnow;
const WAREHOUSE_TRIM_HEX_SNOW = INDUSTRIAL_CLADDING.trimSnow;
const WAREHOUSE_SNOW_HEX = INDUSTRIAL_CLADDING.snow;
const WAREHOUSE_DOOR_HEX = 0x5f6d6a;       // roller shutters, grey-green
const WAREHOUSE_DOOR_HEX_STEEL = 0x8b5a3c; // on a sheet hall the shutters are the oxide red of the plant

/**
 * Freight warehouse: long hall, shallow gable in grey sheeting, roller shutters on the street face over a loading
 * dock, clerestory window band, roof ridge vents. The rail yard's bread-and-butter block. Round 75: the dock gets
 * a skillion canopy on two posts, rubber bumpers and shutter guide posts; the roof gets ridge skylights and eave
 * gutters; the street gable a painted sign board; and on a map that authors industrialCladding 'steel' the walls
 * and gables are corrugated sheet (structureMetal) instead of brick — the plinth, dock and the seeded draws are
 * the same as before (new parts take none; re-bucketed parts keep theirs), so the plan keeps every later placement.
 */
export function makeWarehouse(
  rng: () => number,
  buckets: GeometryBuckets,
): StructureDimensions {
  const context = structureBuildContext(buckets);
  const steelClad = context?.cladding === 'steel' && !!buckets.structureMetal;
  const snowClad = steelClad && !!context?.snowCap;
  const parts: GeometryBuckets = {
    plaster: [], plaster2: [], stone: [], roof: [], wood: [], dark: [], baked: [], structureMetal: [],
  };
  if (buckets.glass) parts.glass = [];
  const pane = parts.glass || parts.dark;
  const drawnW = 13.5 + rng() * 3, drawnD = 21 + rng() * 5, wallH = 5.4 + rng() * 0.8, roofH = 1.9;
  // maps lane B (2026-10-03): an authored plot sets the footprint (Kestrel Airfield's cargo-hangar plot); the draws stay
  const w = context?.plot?.w ?? drawnW, d = context?.plot?.d ?? drawnD;
  const local = forkRng((drawnW - 13.5) / 3 * 0.61 + (drawnD - 21) / 5 * 0.29 + (wallH - 5.4) / 0.8 * 0.07);
  parts.stone.push(hallPlinth(w + 0.4, 1.1, d + 0.4, -0.65));
  const wallBucket = steelClad ? parts.structureMetal! : parts.stone;
  const cladHex = snowClad ? WAREHOUSE_CLADDING_HEX_SNOW : WAREHOUSE_CLADDING_HEX;
  // (props census #4/#13, lane B 2026-10-15; the Ironworks court's donor) the walls stand round the hall's core with the
  // shutters, the clerestory and the catalog's openings cut through them (cutWalls below; settleCatalogCuts after the
  // catalog): the core, the room's dark at the back of every cut, stands in the stream where the solid stood (on a steel
  // hall its paint's draws taken as the solid's were)
  const core = box(w - 2 * WAREHOUSE_WALL_T, wallH, d - 2 * WAREHOUSE_WALL_T, 0.55).translate(0, wallH / 2, 0);
  if (steelClad) { paintHex(core.clone(), local, cladHex, 1, 0.03); core.userData.uvJitter = 'consume'; }
  parts.dark.push(core);
  const gableA = gablePrism(w, roofH, 0.32).translate(0, wallH, d / 2 - 0.16);
  const gableB = gablePrism(w, roofH, 0.32).translate(0, wallH, -d / 2 + 0.16);
  for (const shell of [gableA, gableB]) {
    if (steelClad) { paintHex(shell, local, cladHex, 1, 0.03); shell.userData.uvJitter = 'consume'; }
    wallBucket.push(shell);
  }
  const t = WAREHOUSE_WALL_T, holes: HallHoles = { px: [], nx: [], pz: [], nz: [] }, units: HallUnit[] = [];
  // (the buildings stream, 2026-10-13: each slab's underside on the gable's own slope, the hall closed under them; the
  // slabs stood 5 cm over the wall tops and buried the skylights)
  const seat = gableSlabSeat(w / 2, roofH, 0.4, 0.13), ang = seat.pitch;
  parts.dark.push(gableAttic(w, roofH, d).translate(0, wallH, 0));
  for (const side of [-1, 1]) {
    const slab = hallSlab(seat.length, 0.13, d + 0.7, 0.35);
    pitchRoofPlane(slab, 'x', -side as -1 | 1, ang, 'gable');
    slab.translate(-side * seat.out, wallH + seat.up, 0);
    parts.roof.push(slab);
    // ridge skylights: two glazed strips a metre down each roof plane
    for (const sz of [-d * 0.22, d * 0.2]) {
      // 6 cm glazing: the pitch audit regresses a slab's centre plane through its corners, and a thick narrow box
      // biases that slope (0.14 m on 0.95 m read 0.005 rad off the receipt)
      const light = dressing(box(0.95, 0.06, 2.6, 0.5));
      pitchRoofPlane(light, 'x', -side as -1 | 1, ang, 'gable');
      light.translate(-side * 1.15, wallH + roofH - 1.15 * Math.tan(ang) + 0.12, sz);
      pane.push(light);
    }
    // eave gutter on the long wall
    const gutter = dressing(new THREE.CylinderGeometry(0.065, 0.065, d + 0.5, 7, 1).rotateX(Math.PI / 2));
    gutter.translate(side * (w / 2 + 0.46), wallH - 0.04, 0);
    parts.dark.push(gutter);
  }
  // ridge vents (dark monitor boxes along the ridge line)
  for (let k = 0; k < 3; k++) {
    const vz = -d / 3 + k * (d / 3);
    parts.dark.push(box(0.8, 0.55, 2.6).translate(0, wallH + roofH + 0.22, vz));
  }
  // roller shutters on the street face (+z), each between two guide posts under the old rail
  for (const dx of [-w * 0.22, w * 0.22]) {
    // (the shutter at the back of its cut after the catalog pass, its sill on the plinth's top)
    holes.pz.push({ at: dx, w: 3.1, y0: 0.45, y1: 3.6 });
    const shutter = box(3.1, 3.6, 0.14, 0.8).translate(dx, 1.8, d / 2 + 0.09);
    units.push({ g: shutter, side: 'pz', offset: 0.02 });
    paintHex(shutter, local, steelClad ? WAREHOUSE_DOOR_HEX_STEEL : WAREHOUSE_DOOR_HEX, 1, 0.03);
    shutter.userData.uvJitter = 'consume'; // the timber leaf's four draws, kept
    parts.structureMetal!.push(shutter);
    parts.dark.push(box(3.5, 0.16, 0.10).translate(dx, 3.85, d / 2 + 0.12));
    for (const px of [-1.62, 1.62]) parts.dark.push(dressing(box(0.12, 3.7, 0.12, 1.0)).translate(dx + px, 1.85, d / 2 + 0.08));
    // the shutter box above the opening
    parts.dark.push(dressing(box(3.4, 0.36, 0.30, 1.0)).translate(dx, 3.95 + 0.18, d / 2 + 0.15));
  }
  // clerestory band both long walls
  for (let k = 0; k < 5; k++) {
    const zz = -d / 2 + (k + 0.5) * (d / 5);
    for (const side of [-1, 1]) {
      if (rng() < 0.15) continue;
      (side > 0 ? holes.px : holes.nx).push({ at: zz, w: 1.6, y0: wallH - 1.55, y1: wallH - 0.55 });
      const glass = box(0.08, 1.0, 1.6).translate(side * (w / 2 + 0.05), wallH - 1.05, zz);
      pane.push(glass);
      units.push({ g: glass, side: side > 0 ? 'px' : 'nx', offset: 0.02 });
      parts.wood.push(box(0.12, 0.10, 1.75).translate(side * (w / 2 + 0.06), wallH - 1.65, zz));
    }
  }
  // loading dock apron + a couple of pallets/crates
  const dock = box(w * 0.7, 0.7, 2.2, 0.6);
  dock.translate(0, 0.35, d / 2 + 1.25);
  parts.stone.push(jitterUV(dock, rng));
  for (let k = 0, n = 2 + ((rng() * 3) | 0); k < n; k++) {
    const cs = 0.6 + rng() * 0.5;
    const crate = box(cs, cs, cs, 1.0);
    crate.rotateY(rng() * Math.PI * 0.5);
    crate.translate((rng() - 0.5) * w * 0.6, 0.7 + cs / 2, d / 2 + 1.0 + rng() * 0.8);
    parts.wood.push(jitterUV(crate, rng));
  }
  // round 75: dock bumpers, a skillion canopy on two posts over the dock, the painted sign board on the gable
  for (const bx of [-w * 0.25, 0, w * 0.25]) {
    parts.dark.push(dressing(box(0.28, 0.32, 0.16, 1.0)).translate(bx, 0.42, d / 2 + 2.35 + 0.08));
  }
  const canopyY = Math.min(wallH - 0.9, 4.3);
  const canopy = dressing(box(w * 0.74, 0.1, 2.7, 0.35));
  pitchRoofPlane(canopy, 'z', 1, 0.12, 'skillion');
  canopy.translate(0, canopyY, d / 2 + 1.45);
  parts.roof.push(canopy);
  for (const px of [-w * 0.33, w * 0.33]) {
    const postH = canopyY - 0.16 - 0.7;
    parts.dark.push(dressing(box(0.14, postH, 0.14, 1.0)).translate(px, 0.7 + postH / 2, d / 2 + 2.15));
  }
  const sign = dressing(box(w * 0.42, 1.0, 0.07, 0.8));
  sign.translate(0, wallH - 0.62, d / 2 + 0.05);
  // follow-up 2 (2026-09-26): the board rides the map's plaster bucket — plaster2 was a whole extra mesh (one draw a
  // pass, four cascades) for a dozen boards on the maps that had no plaster2 wall of their own
  parts.plaster.push(sign);
  if (steelClad) {
    // corner trims and a girt line read the sheet hall as a framed building; on a snow map they are the plant's
    // oxide red on the frosted sheet (the baked bucket takes a vertex colour, the dark one does not)
    const trim = (geo: THREE.BufferGeometry): void => {
      if (snowClad) parts.baked!.push(paintHex(dressing(geo), local, WAREHOUSE_TRIM_HEX_SNOW, 1, 0.04));
      else parts.dark.push(dressing(geo));
    };
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      trim(box(0.12, wallH - 0.1, 0.12, 1.0).translate(cx * (w / 2 - 0.01), wallH / 2, cz * (d / 2 - 0.01)));
    }
    for (const side of [-1, 1]) {
      trim(box(0.06, 0.08, d - 0.2, 1.0).translate(side * (w / 2 + 0.02), wallH * 0.52, 0));
    }
  }
  if (snowClad) {
    // snow ledges on both eaves: the weathering hook loads every upward face with snow, but the eave's edge and the
    // gutter line are vertical faces — a white ledge over the gutter gives the roof its snow-capped edge
    for (const side of [-1, 1]) {
      const ledge = paintHex(dressing(box(0.34, 0.15, d + 0.62, 0.5)), local, WAREHOUSE_SNOW_HEX, 1, 0.02);
      ledge.translate(side * (w / 2 + 0.30), wallH + 0.10, 0);
      parts.baked!.push(ledge);
    }
  }
  const pieces: THREE.BufferGeometry[] = [];
  cutWalls(pieces, w, d, wallH, t, holes);
  const pieceRng = forkRng(0.731);
  if (steelClad) for (const g of pieces) paintHex(g, pieceRng, cladHex, 1, 0.03);
  wallBucket.push(...pieces);
  // (a brick hall's body for the catalog's reading; a steel one's stood in no bucket it reads, and still does not)
  if (!steelClad) wallBucket.push(envelopeMarker(w, wallH, d));
  for (const key of Object.keys(parts)) {
    const source = parts[key];
    const target = buckets[key];
    if (source && target) for (const geometry of source) target.push(geometry);
  }
  // the hall's cut for the catalog pass that follows (settleCatalogCuts): where the catalog's openings are cut too
  tagCutHall(buckets, { w, d, h: wallH, t, holes, pieces, bucket: steelClad ? 'structureMetal' : 'stone', paint: steelClad ? cladHex : null, units });
  return { w: w + 0.4, d: d + 3.0, h: wallH + roofH + 0.8 };
}

// ---------------------------------------------------------------------------------------------- containers (round 75)

/** Local stream forked from one shared draw's bits: new decisions never move the seeded stream of later placements. */
function forkRng(u: number): () => number {
  let a = (u * 4294967296) | 0;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const _livery = new THREE.Color();

/** Flat vertex paint from a colour, the value jitter drawn from the given stream (one draw per vertex). */
function paintHex(geo: THREE.BufferGeometry, rng: () => number, hex: number, scale = 1, jitter = 0.06): THREE.BufferGeometry {
  _livery.set(hex);
  return paintGeo(geo, rng, _livery.r * scale, _livery.g * scale, _livery.b * scale, jitter);
}

/** Riveted water tower: cylindrical tank on four braced legs + conical cap. */
export function makeWaterTower(
  rng: () => number,
  buckets: GeometryBuckets,
): StructureDimensions {
  const legH = 7.2 + rng() * 0.8, tankH = 3.4, tankR = 2.5;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = box(0.3, legH + 0.4, 0.3, 1.2);
    // Feet flare away from the tower centre while the tops converge beneath
    // the vessel. The old signs did the inverse, making the support cage read
    // upside down from every Garage and battlefield angle.
    leg.rotateZ(sx * 0.045);
    leg.rotateX(sz * -0.045);
    leg.translate(sx * 1.7, legH / 2, sz * 1.7);
    buckets.dark.push(leg);
  }
  // (props census #3, lane B 2026-10-14; the judges: "the braces cross through the middle of the cage") the girts run
  // round the cage at its two levels, each following the legs' rake; the first four take the four draws each the old
  // cross braces took, the rest are new to the stream
  const legAt = (s: number, y: number): number => s * (1.7 - (y - legH / 2) * Math.sin(0.045));
  let consumed = 0;
  for (const yy of [legH * 0.4, legH * 0.75]) {
    const e = legAt(1, yy);
    for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]] as const) {
      const g = memberGeo([ax * e, yy, az * e], [bx * e, yy, bz * e], 0.14);
      if (consumed++ < 4) delete g.userData.uvJitter;
      buckets.dark.push(g);
    }
  }
  // the X rods in every panel of every face, the anchor piers under the feet
  const levels = [0.4, legH * 0.4, legH * 0.75, legH - 0.1];
  for (let i = 0; i + 1 < levels.length; i++) {
    const y0 = levels[i], y1 = levels[i + 1], e0 = legAt(1, y0), e1 = legAt(1, y1);
    for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]] as const) {
      buckets.dark.push(memberGeo([ax * e0, y0, az * e0], [bx * e1, y1, bz * e1], 0.05));
      buckets.dark.push(memberGeo([bx * e0, y0, bz * e0], [ax * e1, y1, az * e1], 0.05));
    }
  }
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) buckets.stone.push(boxAt(0.8, 0.6, 0.8, legAt(sx, 0) , 0.0, legAt(sz, 0)));
  const tank = new THREE.CylinderGeometry(tankR, tankR, tankH, 12, 1);
  scaleUV(tank, 6, 2);
  tank.translate(0, legH + tankH / 2, 0);
  buckets.plaster.push(jitterUV(tank, rng));
  const cap = new THREE.ConeGeometry(tankR + 0.25, 1.1, 12, 1);
  scaleUV(cap, 3, 1);
  cap.translate(0, legH + tankH + 0.55, 0);
  buckets.roof.push(cap);
  const pipe = box(0.22, legH, 0.22, 2.0);
  pipe.translate(0.6, legH / 2, 0);
  buckets.dark.push(pipe);
  // the tank's riveted courses and its floor girder, the balcony round its foot (a grating ring, posts and two rails),
  // the ladder up a leg to it and on up the shell to the roof hatch, the finial, the frost box at the riser's foot and
  // the swinging spout with its counterweight over the track side (all new to the stream)
  const ring = (r: number, h: number, y: number, open = true, seg = 12): THREE.BufferGeometry => {
    const g = new THREE.CylinderGeometry(r, r, h, seg, 1, open);
    g.translate(0, y, 0);
    return dressing(g);
  };
  for (const yy of [legH + 0.08, legH + tankH * 0.36, legH + tankH * 0.68, legH + tankH - 0.06]) buckets.dark.push(ring(tankR + 0.012, 0.08, yy));
  buckets.dark.push(ring(tankR + 0.05, 0.3, legH - 0.12, false));
  const deck = new THREE.RingGeometry(tankR - 0.05, tankR + 0.75, 16, 1);
  deck.rotateX(-Math.PI / 2);
  deck.translate(0, legH + 0.02, 0);
  buckets.dark.push(dressing(deck));
  // (its grating's underside, seen from the yard: the integrity gate read the deck's missing back as a hole)
  const under = new THREE.RingGeometry(tankR - 0.05, tankR + 0.75, 16, 1);
  under.rotateX(Math.PI / 2);
  under.translate(0, legH - 0.01, 0);
  buckets.dark.push(dressing(under));
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2;
    buckets.dark.push(boxAt(0.04, 1.0, 0.04, Math.cos(a) * (tankR + 0.72), legH + 0.52, Math.sin(a) * (tankR + 0.72)));
  }
  // (the rails round tubes, not open bands: an open band shows its inside from over the balcony)
  for (const h of [0.5, 1.0]) {
    const rail = new THREE.TorusGeometry(tankR + 0.72, 0.022, 3, 16);
    rail.rotateX(Math.PI / 2);
    rail.translate(0, legH + h + 0.02, 0);
    buckets.dark.push(dressing(rail));
  }
  for (const g of ladderGeos(legAt(1, 0) + 0.25, 0, 0, legH + 0.05, 'z', 0.42)) buckets.dark.push(g);
  for (const g of ladderGeos(tankR + 0.12, 0, legH, legH + tankH + 0.2, 'z', 0.4)) buckets.dark.push(g);
  for (let y = legH + 0.8; y < legH + tankH; y += 1.2) buckets.dark.push(boxAt(0.17, 0.04, 0.5, tankR + 0.05, y, 0));
  buckets.dark.push(boxAt(0.6, 0.12, 0.6, tankR * 0.55, legH + tankH + 0.58, 0));
  const ball = new THREE.SphereGeometry(0.16, 8, 6);
  ball.translate(0, legH + tankH + 1.2, 0);
  buckets.dark.push(dressing(ball));
  buckets.wood.push(boxAt(0.9, 1.4, 0.9, 0.6, 0.7, 0));
  const sy = legH + 0.45;
  buckets.dark.push(memberGeo([-tankR + 0.1, sy, 0], [-tankR - 1.3, sy - 0.4, 0], 0.32));
  buckets.dark.push(memberGeo([-tankR - 1.3, sy - 0.4, 0], [-tankR - 1.45, sy - 1.2, 0], 0.28));
  buckets.dark.push(memberGeo([-tankR + 0.2, sy + 2.0, 0], [-tankR - 1.25, sy - 0.25, 0], 0.03));
  buckets.dark.push(boxAt(0.3, 0.5, 0.3, -tankR + 0.6, legH - 0.25, 0));
  return { w: 5.4, d: 5.4, h: legH + tankH + 1.2 };
}

/** Standalone round brick smokestack (~17 m) on a square plinth — the
 * overcast skyline needs verticals even where no factory slot landed. Props census #3 (lane B 2026-10-14; the judges:
 * "three parts: a base box, one tapered cylinder and a dark cap cylinder"): the plinth's front is cut by the flue
 * inlet's recess, its soot door at the back of it; a base course and a cornice round the plinth; iron bands up the
 * shaft every 2.5 m; the crown corbelled out in three courses over the cap; the ladder up the shaft on its stand-offs
 * and the lightning conductor down the other side. The plinth's rear block and the shaft keep the old seeded draws;
 * everything else is new to the stream. */
export function makeStack(
  rng: () => number,
  buckets: GeometryBuckets,
): StructureDimensions {
  const stackH = 15.5 + rng() * 3;
  const plinth = box(3.2, 1.6, 2.8, 0.7);
  plinth.translate(0, 0.7, -0.2);
  buckets.stone.push(jitterUV(plinth, rng));
  // the plinth's front: the piers each side of the inlet's recess and the lintel over it, the door at its back
  // (the piers stop a centimetre under the plinth's top, under the cornice: the Ironworks service court seats a stack
  // donor on its one plinth (foundryServiceSupport's census); full height, the piers read as two more and the court
  // refused the stack, so the whole court stayed unbuilt)
  for (const sx of [-1, 1]) buckets.stone.push(boxAt(1.15, 1.59, 0.4, sx * 1.025, 0.695, 1.4, 0.7));
  buckets.stone.push(boxAt(0.9, 0.35, 0.4, 0, 1.325, 1.4, 0.7));
  buckets.dark.push(boxAt(0.86, 1.2, 0.04, 0, 0.5, 1.22));
  buckets.stone.push(boxAt(3.44, 0.3, 3.44, 0, 0.05, 0, 0.7));
  buckets.stone.push(boxAt(3.4, 0.22, 3.4, 0, 1.5, 0, 0.7));
  const stack = new THREE.CylinderGeometry(0.72, 1.15, stackH, 10, 1);
  scaleUV(stack, 4, 8);
  stack.translate(0, 1.4 + stackH / 2, 0);
  buckets.stone.push(jitterUV(stack, rng));
  const rAt = (y: number): number => 1.15 + (0.72 - 1.15) * Math.max(0, Math.min(1, (y - 1.4) / stackH));
  for (let y = 3.0; y < 1.4 + stackH - 1.0; y += 2.5) {
    const band = new THREE.CylinderGeometry(rAt(y + 0.05) + 0.012, rAt(y - 0.05) + 0.012, 0.1, 10, 1, true);
    band.translate(0, y, 0);
    buckets.dark.push(dressing(band));
  }
  const crown = new THREE.CylinderGeometry(0.92, 0.78, 1.0, 10, 1);
  crown.translate(0, 1.4 + stackH + 0.4, 0);
  buckets.dark.push(crown);
  const top = 1.4 + stackH;
  for (const [r0, r1, y] of [[0.8, 0.84, top - 0.35], [0.88, 0.92, top - 0.12]] as const) {
    const course = new THREE.CylinderGeometry(r1, r0, 0.22, 10, 1);
    course.translate(0, y, 0);
    buckets.stone.push(dressing(course));
  }
  // the ladder up the +x side on stand-offs, the conductor down the -x side
  for (const dz of [-0.2, 0.2]) buckets.dark.push(memberGeo([rAt(1.6) + 0.16, 1.6, dz], [rAt(top) + 0.16, top + 0.3, dz], 0.04));
  for (let y = 1.9; y < top; y += 0.35) buckets.dark.push(boxAt(0.03, 0.03, 0.4, rAt(y) + 0.16, y, 0));
  for (let y = 2.5; y < top; y += 2.5) buckets.dark.push(boxAt(0.26, 0.04, 0.5, rAt(y) + 0.05, y, 0));
  buckets.dark.push(memberGeo([-(rAt(1.6) * 0.95 + 0.015), 1.6, 0], [-(rAt(top) * 0.95 + 0.015), top, 0], 0.025));
  buckets.dark.push(memberGeo([-(rAt(top) * 0.95 + 0.015), top, 0], [-(rAt(top) * 1.1), top + 1.6, 0], 0.025));
  return { w: 3.4, d: 3.4, h: stackH + 2.6 };
}

// =============================================================================
// COASTAL BUILDERS
// =============================================================================

/** Whitewashed lighthouse: tapered tower, gallery ring, dark lantern and red
 * cap (~15 m) — the fishing village's vertical landmark. */
export function makeLighthouse(
  rng: () => number,
  buckets: GeometryBuckets,
): StructureDimensions {
  const towH = 11.5 + rng() * 1.5;
  const base = new THREE.CylinderGeometry(2.4, 2.7, 1.2, 12, 1);
  scaleUV(base, 5, 1);
  base.translate(0, 0.5, 0);
  buckets.stone.push(jitterUV(base, rng));
  const tow = new THREE.CylinderGeometry(1.35, 1.95, towH, 12, 1);
  scaleUV(tow, 5, 4);
  tow.translate(0, 1.1 + towH / 2, 0);
  buckets.plaster.push(jitterUV(tow, rng));
  // gallery ring + rail posts
  const gal = new THREE.CylinderGeometry(1.95, 1.95, 0.18, 12, 1);
  gal.translate(0, 1.1 + towH + 0.09, 0);
  buckets.dark.push(gal);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const post = box(0.07, 0.9, 0.07, 2.0);
    post.translate(Math.cos(a) * 1.8, 1.1 + towH + 0.6, Math.sin(a) * 1.8);
    buckets.dark.push(post);
  }
  // lantern: glass drum + red cap
  const lant = new THREE.CylinderGeometry(1.0, 1.0, 1.5, 10, 1);
  lant.translate(0, 1.1 + towH + 0.95, 0);
  if (buckets.glass) markWorldLantern(lant);
  (buckets.glass || buckets.dark).push(lant);
  const cap = new THREE.ConeGeometry(1.25, 1.0, 10, 1);
  cap.translate(0, 1.1 + towH + 2.1, 0);
  buckets.roof.push(cap);
  const door = box(0.9, 1.8, 0.1, 1.0);
  door.translate(0, 0.9, 1.95);
  buckets.wood.push(door);
  return { w: 5.6, d: 5.6, h: towH + 3.4 };
}

/** Timber boat shed: low gabled plank hall with a wide slipway mouth and an
 * upturned dinghy alongside. */
export function makeBoatshed(
  rng: () => number,
  buckets: GeometryBuckets,
): StructureDimensions {
  const w = 7.4 + rng() * 1.2, d = 9.5 + rng() * 1.5, wallH = 2.8, roofH = 1.7;
  const base = box(w + 0.3, 0.5, d + 0.3, 0.7);
  base.translate(0, -0.05, 0);
  buckets.stone.push(jitterUV(base, rng));
  const hall = box(w, wallH, d, 0.6);
  hall.translate(0, wallH / 2 + 0.2, 0);
  buckets.wood.push(jitterUV(hall, rng));
  buckets.wood.push(gablePrism(w, roofH, 0.3).translate(0, wallH + 0.2, d / 2 - 0.15));
  buckets.wood.push(gablePrism(w, roofH, 0.3).translate(0, wallH + 0.2, -d / 2 + 0.15));
  // (the buildings stream, 2026-10-13: each slab's underside on the gable's own slope, the loft closed under them)
  const seat = gableSlabSeat(w / 2, roofH, 0.4, 0.11);
  buckets.wood.push(gableAttic(w, roofH, d).translate(0, wallH + 0.2, 0));
  for (const side of [-1, 1]) {
    const slab = box(seat.length, 0.11, d + 0.7, 0.35);
    pitchRoofPlane(slab, 'x', -side as -1 | 1, seat.pitch, 'gable');
    slab.translate(-side * seat.out, wallH + 0.2 + seat.up, 0);
    buckets.roof.push(slab);
  }
  // slipway mouth (dark opening) + ramp planks on the street face
  const mouth = box(w * 0.55, wallH * 0.8, 0.1);
  mouth.translate(0, wallH * 0.45 + 0.2, d / 2 + 0.06);
  buckets.dark.push(mouth);
  const ramp = box(w * 0.5, 0.1, 2.6, 0.8);
  ramp.rotateX(0.06);
  ramp.translate(0, 0.16, d / 2 + 1.4);
  buckets.wood.push(jitterUV(ramp, rng));
  // upturned dinghy alongside
  {
    const hull = new THREE.SphereGeometry(1, 9, 6);
    scaleUV(hull, 2, 1);
    hull.scale(2.0, 0.55, 0.75);
    hull.rotateY((rng() - 0.5) * 0.5);
    hull.translate(w / 2 + 1.3, 0.5, -d * 0.2);
    buckets.wood.push(jitterUV(hull, rng));
  }
  return { w: w + 3.0, d: d + 2.6, h: wallH + roofH + 0.6 };
}

/** Net-drying racks + stacked crab pots and fish crates — a working quay
 * plot that fills a village slot without another cottage. */
export function makeNetYard(
  rng: () => number,
  buckets: GeometryBuckets,
): StructureDimensions {
  const w = 8.5, d = 6.5;
  for (let r = 0; r < 2; r++) { // net rack rows: posts + two rails + hung mesh
    const rz = -d / 2 + 1.4 + r * 3.2;
    for (const sx of [-1, 0, 1]) {
      const post = box(0.14, 2.2, 0.14, 1.4);
      post.rotateZ((rng() - 0.5) * 0.05);
      post.translate(sx * (w / 2 - 1.1), 1.1, rz);
      buckets.wood.push(jitterUV(post, rng));
    }
    for (const ry of [1.35, 2.05]) {
      const rail = box(w - 2.0, 0.08, 0.08, 1.4);
      rail.translate(0, ry, rz);
      buckets.wood.push(jitterUV(rail, rng));
    }
    // hung net: thin dark sagging sheet
    const net = box(w - 2.4, 1.15, 0.04, 1.0);
    net.rotateX((rng() - 0.5) * 0.10);
    net.translate(0, 1.35, rz + 0.10);
    buckets.dark.push(net);
  }
  // crab pots (dark slatted cubes) + pale fish crates
  for (let k = 0, n = 4 + ((rng() * 4) | 0); k < n; k++) {
    const cs = 0.45 + rng() * 0.3;
    const pot = box(cs, cs * 0.8, cs, 1.2);
    pot.rotateY(rng() * Math.PI);
    pot.translate((rng() - 0.5) * (w - 2), cs * 0.4, d / 2 - 0.9 - rng() * 1.2);
    (rng() < 0.5 ? buckets.dark : buckets.wood).push(pot);
  }
  return { w, d, h: 2.4 };
}

/**
 * A colliery colony terrace (a 'terrace' plot, terraceLayout.ts; the buildings lane with map-revival, 2026-10-11, for
 * Cinder Junction's colony streets): two-storey brick houses sharing party walls across the plot's width, their doors
 * to +z with the steps on the plot's front edge (the pavement line), a slate gable roof whose ridge runs along the row
 * on a socle 4 cm proud, a stack on the ridge at each party wall and inside each end gable, and one-storey wash-houses
 * under mono-pitch roofs behind each pair where the plot is deep enough. The plain form, for a map without a kit that
 * rebuilds it (ruhr.ts terraceRow does on Cinder Junction). Two draws, whatever the plot.
 */
export function makeTerrace(
  rng: () => number,
  buckets: GeometryBuckets,
  wallBucket = 'stone',
): StructureDimensions {
  const layout = terraceLayout(structureBuildContext(buckets)?.plot);
  const { partyWalls, houses } = terraceUnits(layout);
  const walls = buckets[wallBucket] ?? buckets.stone;
  rng(); rng();
  const W = layout.w, zc = (layout.front + layout.back) / 2, half = layout.depth / 2;
  const wallH = 5.8, over = 0.3, verge = 0.15, thick = 0.13;
  const roofH = Math.tan(40 * Math.PI / 180) * half;
  buckets.stone.push(box(W + 0.08, 0.9, layout.depth + 0.08).translate(0, -0.25, zc));
  walls.push(box(W, wallH, layout.depth).translate(0, wallH / 2, zc));
  for (const sx of [-1, 1]) {
    walls.push(gablePrism(layout.depth, roofH, 0.32).rotateY(Math.PI / 2).translate(sx * (W / 2 - 0.16), wallH, zc));
  }
  // (the buildings stream, 2026-10-13: each slab's underside on the gable's own slope, the roof space closed under them)
  const seat = gableSlabSeat(half, roofH, over, thick);
  walls.push(gableAttic(layout.depth, roofH, W).rotateY(Math.PI / 2).translate(0, wallH, zc));
  for (const side of [-1, 1] as const) {
    const slab = slabBox(W + 2 * verge, thick, seat.length, 0.35);
    pitchRoofPlane(slab, 'z', side, seat.pitch, 'gable');
    buckets.roof.push(slab.translate(0, wallH + seat.up, zc + side * seat.out));
  }
  buckets.roof.push(slabBox(W + 2 * verge, thick + 0.01, 0.34, 0.5).translate(0, wallH + roofH + 0.04, zc));
  // the stacks: one on the ridge at each party wall, one inside each end gable
  for (const x of [-W / 2 + 0.5, ...partyWalls, W / 2 - 0.5]) {
    buckets.stone.push(box(0.55, 1.7, 0.75).translate(x, wallH + roofH + 0.25, zc));
    buckets.dark.push(box(0.16, 0.3, 0.16).translate(x - 0.12, wallH + roofH + 1.25, zc));
    buckets.dark.push(box(0.16, 0.3, 0.16).translate(x + 0.12, wallH + roofH + 1.25, zc));
  }
  for (const h of houses) {
    const xc = (h.x0 + h.x1) / 2, uw = h.x1 - h.x0;
    const xd = h.door > 0 ? h.x1 - 0.9 : h.x0 + 0.9, xw = xc - h.door * uw * 0.17;
    // the door, its step on the pavement line, the windows of both floors front and back
    buckets.dark.push(box(0.95, 2.15, 0.08).translate(xd, 1.2, layout.front + 0.02));
    buckets.stone.push(box(1.25, 0.32, layout.stepDepth + 0.05).translate(xd, 0.06, layout.front + layout.stepDepth / 2 - 0.02));
    buckets.dark.push(box(1.1, 1.3, 0.06).translate(xw, 1.75, layout.front + 0.02));
    for (const x of [xc - uw * 0.2, xc + uw * 0.2]) buckets.dark.push(box(0.9, 1.3, 0.06).translate(x, 4.35, layout.front + 0.02));
    buckets.dark.push(box(0.9, 1.1, 0.06).translate(xw, 1.85, layout.back - 0.02));
    buckets.dark.push(box(0.9, 1.1, 0.06).translate(xc, 4.4, layout.back - 0.02));
  }
  if (layout.washhouses) {
    // a flat-roofed wash-house behind each pair astride their party wall (an odd last house has its own)
    const zw = layout.back - layout.washDepth / 2, top = 2.5;
    for (let i = 0; i < houses.length; i += 2) {
      const pair = i + 1 < houses.length;
      const x = pair ? houses[i].x1 : houses[i].x0 + 1.25, ww = pair ? 4.2 : 2.3;
      walls.push(box(ww, top + 0.3, layout.washDepth).translate(x, (top - 0.3) / 2, zw));
      buckets.roof.push(slabBox(ww + 0.16, 0.12, layout.washDepth + 0.08, 0.35).translate(x, top + 0.06, zw - 0.04));
      buckets.dark.push(box(0.85, 1.9, 0.06).translate(x, 1.0, layout.back - layout.washDepth - 0.02));
    }
  }
  return { w: W, d: layout.d, h: wallH + roofH + 1.4 };
}

/** Builders keyed by plan name — spread into URBAN_BUILDERS (props.ts
 * BUILDER_BY_NAME contract, see maps/urbanKit.ts). */
export const RAIL_BUILDERS: Record<string, StructureBuilder> = {
  warehouse: makeWarehouse,
  // the colliery colony's terraced rows (terraceLayout.ts; Cinder Junction)
  terrace: makeTerrace,
  containerRow: makeContainerRow,
  gantry: makeGantry,
  watertower: makeWaterTower,
  stack: makeStack,
  shed: makeShed,
  lighthouse: makeLighthouse,
  boatshed: makeBoatshed,
  netyard: makeNetYard,
};

export { makeContainerRow, makeGantry, makeShed };
