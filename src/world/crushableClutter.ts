import {BufferAttribute, BufferGeometry, InstancedMesh, Matrix4, Vector3} from 'three';
import type {CollisionRecord} from './collision.ts';

// The smallest colliding stones are loose dressing. Authored tactical cover
// and the larger outcrop class retain their solid collision.
export function isLooseSurfaceRock(scale: number, sink: number, tactical: boolean): boolean {
  return !tactical && scale >= 1.25 && scale <= 1.8 && sink <= .5;
}

interface VertexSpan {
  position: BufferAttribute;
  normal: BufferAttribute;
  first: number;
  homePosition: Float32Array;
  homeNormal: Float32Array;
}
interface InstanceSlot { mesh: InstancedMesh; slot: number; home: Matrix4 }
/** Anything that owns pieces drawn inside a merged material bucket and moves their vertices there (bindClutterBatch). */
interface SpanOwner { readonly spans: VertexSpan[] }
const pieceOwners = new WeakMap<BufferGeometry, SpanOwner>();
const flatScale = new Vector3(1, .14, 1);

/** The clutter's kinds: the rubble heaps, the hedgehogs, the loose rocks, the coal heaps, and (Lane C, PRP-02) the small
 *  dressing props given their break path (maps/smallPropBreak.ts), each `prop-<what>`. */
export type ClutterKind = 'rubble' | 'hedgehog' | 'small-rock' | 'coal-heap' | `prop-${string}`;

/** Preserve the existing material batches/rock instances: collapse only this
 * object's vertices or instance, with no new draw calls or frame-loop work. */
export class CrushableClutter {
  readonly spans: VertexSpan[] = [];
  readonly instances: InstanceSlot[] = [];
  readonly kind: ClutterKind;
  readonly x: number; readonly y: number; readonly z: number;
  readonly r: number; readonly h: number;
  readonly obstacles: CollisionRecord[]; readonly colliders: CollisionRecord[];
  /** (the hitbox lane, 2026-10-10) a crushed instance's pose from its standing one, in place of the flattening (a
   * crushed stone splits and presses into the ground: crushedStones.ts), and what else a crush lays and a rematch takes
   * back (a stone's flakes and chips, its scuff). */
  pressedPose: ((home: Matrix4, out: Matrix4) => void) | null = null;
  readonly crushHooks: Array<(crushed: boolean) => void> = [];
  constructor(
    kind: ClutterKind,
    x: number, y: number, z: number, r: number, h: number,
    obstacles: CollisionRecord[], colliders: CollisionRecord[],
  ) {
    this.kind = kind; this.x = x; this.y = y; this.z = z; this.r = r; this.h = h;
    this.obstacles = obstacles; this.colliders = colliders;
  }

  ownPiece(geometry: BufferGeometry): void { pieceOwners.set(geometry, this); }

  bindInstance(mesh: InstancedMesh, slot: number): void {
    const home = new Matrix4(); mesh.getMatrixAt(slot, home);
    this.instances.push({mesh, slot, home});
  }

  /** Called after map-specific replacements, so repurposed rubble (e.g.
   * reservoir waterworks) keeps its authored solid structure contract. */
  activate(propIdx: number): boolean {
    if (this.obstacles.some(record => record.kind !== this.kind)) return false;
    for (const record of [...this.obstacles, ...this.colliders]) {
      record.propIdx = propIdx; record.crushable = true;
      record.crushMin = 0; record.crushKeep = 1;
    }
    return true;
  }

  setCrushed(crushed: boolean): void {
    for (const record of this.obstacles) record.crushed = crushed;
    for (const record of this.colliders) { record.crushed = crushed; record.dead = crushed; }
    for (const span of this.spans) this.poseSpan(span, crushed);
    for (const {mesh, slot, home} of this.instances) {
      const matrix = home.clone();
      if (crushed && this.pressedPose) this.pressedPose(home, matrix);
      else if (crushed) { matrix.scale(flatScale); matrix.elements[13] = this.y + .02; }
      mesh.setMatrixAt(slot, matrix); mesh.instanceMatrix.needsUpdate = true;
    }
    for (const hook of this.crushHooks) hook(crushed);
  }

  private poseSpan(span: VertexSpan, crushed: boolean): void {
    const {position, normal, first, homePosition: p, homeNormal: n} = span;
    for (let i = 0; i < p.length; i += 3) {
      const at = first + i / 3;
      position.setXYZ(at, p[i]!, crushed ? this.y + .025 + (p[i + 1]! - this.y) * .12 : p[i + 1]!, p[i + 2]!);
      const ny = crushed ? n[i + 1]! / .12 : n[i + 1]!;
      const length = crushed ? Math.hypot(n[i]!, ny, n[i + 2]!) || 1 : 1;
      normal.setXYZ(at, n[i]! / length, ny / length, n[i + 2]! / length);
    }
    position.addUpdateRange(first * 3, p.length); normal.addUpdateRange(first * 3, n.length);
    position.needsUpdate = true; normal.needsUpdate = true;
  }
}

/**
 * (Lane C, #8 r2, 2026-10-14) A piece drawn inside a merged material bucket that can be hidden there and shown again:
 * a vehicle set piece's intact build (props.ts), so a map's set pieces cost no draw of their own. Hidden, its vertices
 * collapse onto its first one (degenerate triangles, nothing drawn); shown, they return to their home positions.
 */
export class HiddenSpanPiece {
  readonly spans: VertexSpan[] = [];
  private hidden = false;

  ownPiece(geometry: BufferGeometry): void { pieceOwners.set(geometry, this); }

  setHidden(hidden: boolean): void {
    if (hidden === this.hidden) return;
    this.hidden = hidden;
    for (const {position, first, homePosition: p} of this.spans) {
      for (let i = 0; i < p.length; i += 3) {
        const at = first + i / 3;
        if (hidden) position.setXYZ(at, p[0]!, p[1]!, p[2]!);
        else position.setXYZ(at, p[i]!, p[i + 1]!, p[i + 2]!);
      }
      position.addUpdateRange(first * 3, p.length);
      position.needsUpdate = true;
    }
  }
}

/** The material merger emits non-indexed sources in unchanged source order. */
export function bindClutterBatch(sources: readonly BufferGeometry[], merged: BufferGeometry): void {
  const position = merged.getAttribute('position') as BufferAttribute;
  const normal = merged.getAttribute('normal') as BufferAttribute;
  let first = 0;
  for (const source of sources) {
    const count = source.index?.count ?? source.getAttribute('position').count;
    const owner = pieceOwners.get(source);
    // Replaced donor geometry is not present in the final material sources.
    if (owner) owner.spans.push({position, normal, first,
      homePosition: new Float32Array(position.array.slice(first * 3, (first + count) * 3)),
      homeNormal: new Float32Array(normal.array.slice(first * 3, (first + count) * 3)),
    });
    first += count;
  }
}
