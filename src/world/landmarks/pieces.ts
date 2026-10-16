// src/world/landmarks/pieces.ts — a set piece's named pieces (props lane A, E12, 2026-10-14; the owner: "make sure you
// touch all props and buildings and objects"; WORKLIST E12: "named pieces (attic, figure, merlon, roof, drum, stele top,
// parapet run, sail) that detach and settle, an open-lattice reading for headframes, masts, lookouts and trestles, and
// tank ruptures").
//
// A builder draws a piece it names into a sink of its own, beside the set piece's sink (`piece(sink, spec, body)`), and
// finishes the set piece with `finishLandmark(sink)`: each named piece comes out as its own geometries in the piece's
// buckets, tagged `userData.damagePiece` (the world's spans carry the name: structureDamageSeam.ts, and a stage's hide
// names it: destructionKit.ts DamageHide.piece), its collision as the builder emitted it (a structural member keeps
// its bands, dressing stays dressing; `dressing: true` makes the whole piece dressing). The composer samples the ground each piece may fall on (`samplePieceGround`: numbers, never geometry) and the
// landmark damage kit (landmarks/damage.ts) lays the piece's own triangles where it settles when its stage comes.
//
// Ground railings (kit.ts `railing` on the ground or on a dwarf wall) come out the same way as the props' destructible
// fence modules (`landmarkModulesOf`): a hull breaks them as it breaks any other fence.
import type { BufferGeometry } from 'three';
import { PartSink, type RegionalParts, type Vec3 } from '../maps/regional/geometry.ts';

/** What a piece is: a member that comes off (a figure, a merlon, a sail), a bay of an open frame, a vessel. */
export type LandmarkPieceKind = 'detach' | 'lattice' | 'tank';
/** The damage stage that takes it ('collapse': only a light set piece's fall, which takes every piece). */
export type LandmarkPieceStage = 'damaged' | 'breached' | 'collapse';
/** How it comes off: over about its foot, off its seat (a merlon, a finial), down where it stands (a roof), or laid
 *  flat (a sail, a dish, a panel: its thinnest side down). */
export type LandmarkPieceFall = 'topple' | 'drop' | 'slump' | 'flat';

export interface LandmarkPieceSpec {
  /** Unique within the set piece ('figure', 'merlon-3', 'sail-2', 'mast-top', 'tank-1'). */
  name: string;
  kind: LandmarkPieceKind;
  at: LandmarkPieceStage;
  /** default: 'topple' (a tank ruptures where it stands) */
  fall?: LandmarkPieceFall;
  /** The whole piece is dressing (no collision) whatever its parts were emitted as. */
  dressing?: boolean;
  /** Falls away from the set piece's middle (a sail off the cap, a figure off its plinth): default true. */
  outward?: boolean;
  /** The level direction it falls toward in the set piece's frame (a merlon off the wall's face: [0, 1]), jittered. */
  toward?: readonly [number, number];
  /** How far past its own middle along its fall it lands clear of what it stood on (m); absent: past the set piece's
   *  plan (a figure off its plinth). */
  clear?: number;
  /** A tank's vessel (kind 'tank'): a vertical cylinder in the set piece's frame, and what spills from it. */
  vessel?: { x: number; z: number; y0: number; y1: number; r: number; contents: 'water' | 'fuel' | 'grain' | 'none' };
}

/** The ground round a piece, over the set piece's base (m), on an n × n grid from (x0, z0) at `step` metres. */
export interface LandmarkPieceGround { x0: number; z0: number; step: number; n: number; h: number[] }

export interface LandmarkPiece extends LandmarkPieceSpec {
  /** Its bounds in the set piece's frame. */
  min: Vec3;
  max: Vec3;
  triangles: number;
  ground?: LandmarkPieceGround;
}

/** A destructible fence module a set piece lays (types.ts LandmarkBuild.destructibles), `lift` metres over the ground. */
export interface LandmarkModule { kind: string; x: number; z: number; yawDeg: number; scale?: number; lift?: number }

const PENDING = new WeakMap<PartSink, Array<{ spec: LandmarkPieceSpec; parts: RegionalParts }>>();
const MODULES = new WeakMap<object, LandmarkModule[]>();
const PIECES = new WeakMap<object, LandmarkPiece[]>();

/**
 * Draw a named piece: `body` emits into a sink of its own, placed where the set piece's sink has its placements open,
 * with its paint and its reveal depth.
 */
export function piece(sink: PartSink, spec: LandmarkPieceSpec, body: (s: PartSink) => void): void {
  const child = new PartSink(sink.uvOffset);
  child.paint = sink.paint;
  child.recess = sink.recess;
  const at = sink.placement();
  if (at) child.placed(at.yaw, at.x, at.y, at.z, () => body(child));
  else body(child);
  let list = PENDING.get(sink);
  if (!list) { list = []; PENDING.set(sink, list); }
  if (list.some((p) => p.spec.name === spec.name)) throw new Error(`landmarks: a second piece named ${spec.name}`);
  list.push({ spec, parts: child.finish() });
}

/** Record a destructible module on the set piece's sink (kit.ts railing). */
export function addLandmarkModule(sink: PartSink, module: LandmarkModule): void {
  let list = MODULES.get(sink);
  if (!list) { list = []; MODULES.set(sink, list); }
  list.push(module);
}

/**
 * Finish the set piece: the sink's parts, with every named piece's geometries appended in their buckets (tagged
 * `userData.damagePiece`; their collision as emitted) and the pieces and modules recorded against the parts.
 */
export function finishLandmark(sink: PartSink): RegionalParts {
  const parts = sink.finish();
  const pieces: LandmarkPiece[] = [];
  for (const { spec, parts: own } of PENDING.get(sink) ?? []) {
    const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    let triangles = 0;
    for (const [bucket, list] of Object.entries(own) as Array<[keyof RegionalParts, BufferGeometry[]]>) {
      for (const geometry of list) {
        const pos = geometry.getAttribute('position');
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
          if (x < min[0]) min[0] = x; if (y < min[1]) min[1] = y; if (z < min[2]) min[2] = z;
          if (x > max[0]) max[0] = x; if (y > max[1]) max[1] = y; if (z > max[2]) max[2] = z;
        }
        triangles += pos.count / 3;
        geometry.userData.damagePiece = spec.name;
        if (spec.dressing) geometry.userData.noCollision = true;
        parts[bucket].push(geometry);
      }
    }
    if (triangles > 0) pieces.push({ ...spec, min, max, triangles });
  }
  PENDING.delete(sink);
  if (pieces.length) PIECES.set(parts, pieces);
  const modules = MODULES.get(sink);
  if (modules?.length) MODULES.set(parts, modules);
  MODULES.delete(sink);
  return parts;
}

const LANDMARK_PARTS = new WeakSet<object>();
/** The composer marks a set piece's parts before it is described (damage.ts reads set pieces only). */
export function markLandmarkParts(parts: object): void { LANDMARK_PARTS.add(parts); }
export function isLandmarkParts(parts: object): boolean { return LANDMARK_PARTS.has(parts); }

/** A finished set piece's named pieces (null: none). */
export function landmarkPiecesOf(parts: object): readonly LandmarkPiece[] | null {
  return PIECES.get(parts) ?? null;
}

/** A finished set piece's destructible modules (its ground railings). */
export function landmarkModulesOf(parts: object): readonly LandmarkModule[] {
  return MODULES.get(parts) ?? [];
}

/** Grid points a side of a piece's ground. */
const GROUND_N = 9;

/**
 * The ground a piece may come down on (compose.ts, at build): the set piece's ground over its base, on a grid round the
 * piece reaching its height and a metre and a half past it each way.
 */
export function samplePieceGround(pieces: readonly LandmarkPiece[], ground: ((lx: number, lz: number) => number) | undefined): void {
  for (const p of pieces) {
    const cx = (p.min[0] + p.max[0]) / 2, cz = (p.min[2] + p.max[2]) / 2;
    const reach = Math.max(p.max[0] - p.min[0], p.max[2] - p.min[2]) / 2 + (p.max[1] - Math.max(0, p.min[1])) + 1.5;
    const step = (2 * reach) / (GROUND_N - 1);
    const h: number[] = [];
    for (let j = 0; j < GROUND_N; j++) for (let i = 0; i < GROUND_N; i++) {
      const v = ground ? ground(cx - reach + i * step, cz - reach + j * step) : 0;
      h.push(Number.isFinite(v) ? Math.round(v * 1000) / 1000 : 0);
    }
    p.ground = { x0: cx - reach, z0: cz - reach, step, n: GROUND_N, h };
  }
}

/** The ground over the base at (x, z) of the set piece's frame from a piece's grid (bilinear; its edge beyond). */
export function pieceGroundAt(g: LandmarkPieceGround | undefined, x: number, z: number): number {
  if (!g) return 0;
  const fx = Math.min(g.n - 1, Math.max(0, (x - g.x0) / g.step)), fz = Math.min(g.n - 1, Math.max(0, (z - g.z0) / g.step));
  const i0 = Math.min(g.n - 2, Math.floor(fx)), j0 = Math.min(g.n - 2, Math.floor(fz));
  const tx = fx - i0, tz = fz - j0;
  const at = (i: number, j: number) => g.h[j * g.n + i];
  return (at(i0, j0) * (1 - tx) + at(i0 + 1, j0) * tx) * (1 - tz) + (at(i0, j0 + 1) * (1 - tx) + at(i0 + 1, j0 + 1) * tx) * tz;
}
