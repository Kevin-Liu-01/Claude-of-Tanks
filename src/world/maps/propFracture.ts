// src/world/maps/propFracture.ts — a destructible prop's broken state made from its own intact build (destruction core
// lane, 2026-10-09; the owner: "destructible objects/props: not looking good and haven't been updated").
//
// The legacy broken builders were a few generic boxes scattered flat: a crate became seven planks of no particular
// crate, a fence three sticks. Here the broken state is the intact geometry itself, broken: every part of the build (a
// post, a rail, a board, a panel, a wheel — the primitives the builder merged, found again as the mesh's connected
// islands) snaps across its length where it is long enough, with a ragged cut, and the pieces fall: the low stub of a
// post may stay standing, everything else lies on the ground round where the prop stood, turned and scattered, still in
// its own paint, its own grain and its own tint. The pool keeps one broken geometry a kind a map (props.ts): this is it.
//
// Deterministic in (geometry, plan, seed); pure geometry, no allocation per frame. The broken state has no collider
// (props.ts breakRecord): the pieces stay low (a stub at most `stubMax` tall), so nothing stands where a hull drives.

import * as THREE from 'three';

export interface FracturePlan {
  /** Parts longer than this (m) snap; their pieces are at least `pieceMin` long. */
  readonly snapLen: number;
  readonly pieceMin: number;
  /** Cuts a long part takes: up to this many. */
  readonly maxCuts: number;
  /** How ragged a cut is (m, along the part). */
  readonly jag: number;
  /** How far the pieces spread from where the prop stood (m). */
  readonly scatter: number;
  /** The chance a post's foot stays standing as a stub, and the stub's height limit (m). */
  readonly stubChance: number;
  readonly stubMax: number;
  /** Parts smaller than this (bounding diagonal, m) are left out: fittings that would only float. */
  readonly dropBelow: number;
  /** The height (m) no fallen piece stands above: what will not lie flat slumps to it. */
  readonly debrisMax: number;
}

export const WOOD_FRACTURE: FracturePlan = Object.freeze({
  snapLen: 0.55, pieceMin: 0.18, maxCuts: 2, jag: 0.05, scatter: 0.55, stubChance: 0.6, stubMax: 0.45, dropBelow: 0.06, debrisMax: 0.55,
});
/** A fence or a gate: posts snap low and often stand, boards and rails lie along the line it ran. */
export const FENCE_FRACTURE: FracturePlan = Object.freeze({
  snapLen: 0.6, pieceMin: 0.25, maxCuts: 2, jag: 0.05, scatter: 0.35, stubChance: 0.75, stubMax: 0.42, dropBelow: 0.05, debrisMax: 0.45,
});

function hash(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function random(a: number): () => number {
  return function (): number {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The connected islands of a non-indexed geometry: corners welded by position (1 mm) and by triangle. */
function islands(position: THREE.BufferAttribute): number[][] {
  const count = position.count;
  const parent = new Int32Array(count);
  for (let i = 0; i < count; i++) parent[i] = i;
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a: number, b: number): void => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
  const seen = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    const key = `${Math.round(position.getX(i) * 1000)},${Math.round(position.getY(i) * 1000)},${Math.round(position.getZ(i) * 1000)}`;
    const first = seen.get(key);
    if (first === undefined) seen.set(key, i); else union(first, i);
  }
  for (let t = 0; t + 2 < count; t += 3) { union(t, t + 1); union(t, t + 2); }
  const groups = new Map<number, number[]>();
  for (let t = 0; t + 2 < count; t += 3) {
    const r = find(t);
    let list = groups.get(r);
    if (!list) { list = []; groups.set(r, list); }
    list.push(t, t + 1, t + 2);
  }
  return [...groups.values()];
}

interface Piece { corners: number[]; axis: number; lo: number; hi: number; island: THREE.Box3; stub: boolean }

const AXES = ['x', 'y', 'z'] as const;

/**
 * Break `intact` by `plan` (a new geometry with the same attributes; `intact` is not touched). `seed` varies the break
 * between kinds and maps. The prop's footprint centre is the origin, its base y = 0 (the destructible builders' frame).
 */
export function fractureProp(intact: THREE.BufferGeometry, plan: FracturePlan, seed: number): THREE.BufferGeometry {
  const source = intact.index ? intact.toNonIndexed() : intact;
  const position = source.attributes.position as THREE.BufferAttribute;
  const rng = random(seed | 0);
  const pieces: Piece[] = [];
  const v = new THREE.Vector3();
  for (const corners of islands(position)) {
    const box = new THREE.Box3();
    for (const i of corners) box.expandByPoint(v.fromBufferAttribute(position, i));
    const size = box.getSize(new THREE.Vector3());
    if (size.length() < plan.dropBelow) continue;
    const axis = size.x >= size.y && size.x >= size.z ? 0 : size.y >= size.z ? 1 : 2;
    const lo = box.min.getComponent(axis), hi = box.max.getComponent(axis), length = hi - lo;
    const cuts: number[] = [];
    if (length > plan.snapLen) {
      const vertical = axis === 1;
      // a post snaps low (its foot a stub at most stubMax tall), anything else across its middle
      if (vertical && box.min.y < 0.1) cuts.push(Math.min(lo + plan.stubMax, lo + length * (0.2 + rng() * 0.2)));
      // (a part twice the snap length always breaks somewhere: a board across a fence bay never lies whole)
      const least = length > 2 * plan.snapLen && !cuts.length ? 1 : 0;
      const more = Math.max(least, Math.floor(rng() * (plan.maxCuts + 1 - cuts.length)));
      for (let k = 0; k < more; k++) cuts.push(lo + length * (0.3 + rng() * 0.4));
      cuts.sort((a, b) => a - b);
      for (let k = cuts.length - 1; k > 0; k--) if (cuts[k] - cuts[k - 1] < plan.pieceMin) cuts.splice(k, 1);
      while (cuts.length && cuts[0] - lo < plan.pieceMin) cuts.shift();
      while (cuts.length && hi - cuts[cuts.length - 1] < plan.pieceMin) cuts.pop();
    }
    const edges = [lo, ...cuts, hi];
    for (let k = 0; k + 1 < edges.length; k++) {
      const foot = axis === 1 && k === 0 && box.min.y < 0.1 && edges[1] - lo <= plan.stubMax + 1e-6;
      pieces.push({ corners, axis, lo: edges[k], hi: edges[k + 1], island: box, stub: foot && cuts.length > 0 && rng() < plan.stubChance });
    }
  }
  // the attribute layout of the source, written piece by piece
  const names = Object.keys(source.attributes);
  const total = pieces.reduce((sum, piece) => sum + piece.corners.length, 0);
  const out: Record<string, Float32Array> = {};
  for (const name of names) out[name] = new Float32Array(total * (source.attributes[name] as THREE.BufferAttribute).itemSize);
  const m = new THREE.Matrix4(), nm = new THREE.Matrix3(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const p = new THREE.Vector3(), n = new THREE.Vector3(), centre = new THREE.Vector3(), lift = new THREE.Vector3();
  const blowX = Math.cos(rng() * Math.PI * 2), blowZ = Math.sin(rng() * Math.PI * 2);
  let write = 0;
  const scratch = new Float32Array(3 * 4096);
  for (const piece of pieces) {
    // the piece: its part with the coordinate along the part clamped into its span, the cut ragged
    const key = AXES[piece.axis];
    const count = piece.corners.length;
    const at = count * 3 <= scratch.length ? scratch : new Float32Array(count * 3);
    const box = new THREE.Box3();
    for (let c = 0; c < count; c++) {
      p.fromBufferAttribute(position, piece.corners[c]);
      const value = p[key];
      const jag = plan.jag * (hash(p.x, p.y, p.z) - 0.5);
      if (value < piece.lo && piece.lo > piece.island.min.getComponent(piece.axis) + 1e-6) p[key] = piece.lo + Math.max(0, jag);
      else if (value > piece.hi && piece.hi < piece.island.max.getComponent(piece.axis) - 1e-6) p[key] = piece.hi + Math.min(0, jag);
      at[c * 3] = p.x; at[c * 3 + 1] = p.y; at[c * 3 + 2] = p.z;
      box.expandByPoint(p);
    }
    box.getCenter(centre);
    if (piece.stub) {
      // a stub stands where it stood, leaning a little
      e.set((rng() - 0.5) * 0.3, 0, (rng() - 0.5) * 0.3);
      m.makeRotationFromEuler(e);
      lift.set(centre.x, box.min.y, centre.z);
      m.premultiply(new THREE.Matrix4().makeTranslation(lift.x, lift.y, lift.z));
      m.multiply(new THREE.Matrix4().makeTranslation(-lift.x, -lift.y, -lift.z));
    } else {
      // everything else falls flat — its thinnest side up (a board on its face, a post on its side, a panel down) — then
      // turned, tipped a little where it lies on the others, and thrown out along the blow (more for what stood higher)
      const size = box.getSize(new THREE.Vector3());
      const flip = (rng() < 0.5 ? 1 : -1) * Math.PI / 2;
      const thin = size.x <= size.y && size.x <= size.z ? 0 : size.z <= size.y ? 2 : 1;
      const lay = new THREE.Matrix4().makeRotationFromEuler(e.set(thin === 2 ? flip : 0, 0, thin === 0 ? flip : 0));
      // (a long piece tips less: its far end never props up higher than a short one's)
      const tip = 0.4 * Math.min(1, 0.6 / Math.max(size.x, size.y, size.z));
      q.setFromEuler(e.set((rng() - 0.5) * tip, rng() * Math.PI * 2, (rng() - 0.5) * tip));
      m.makeRotationFromQuaternion(q).multiply(lay);
      m.multiply(new THREE.Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z));
      const throwM = plan.scatter * (0.3 + rng()) * (0.5 + Math.min(1.5, centre.y));
      const side = (rng() - 0.5) * plan.scatter;
      const tx = centre.x * 0.7 + blowX * throwM - blowZ * side, tz = centre.z * 0.7 + blowZ * throwM + blowX * side;
      // seated: its lowest corner on the ground, a few on the others
      let minY = Infinity;
      for (let c = 0; c < count; c++) { p.set(at[c * 3], at[c * 3 + 1], at[c * 3 + 2]).applyMatrix4(m); minY = Math.min(minY, p.y); }
      m.premultiply(new THREE.Matrix4().makeTranslation(tx, -minY + 0.005 + rng() * rng() * 0.12, tz));
      // a shape no turn lays flat (a tent's A-frame, a box, a cart bed) slumps instead: pressed down to the debris height
      let maxY = -Infinity;
      for (let c = 0; c < count; c++) { p.set(at[c * 3], at[c * 3 + 1], at[c * 3 + 2]).applyMatrix4(m); maxY = Math.max(maxY, p.y); }
      if (maxY > plan.debrisMax) m.premultiply(new THREE.Matrix4().makeScale(1, (plan.debrisMax / maxY) * (0.75 + rng() * 0.25), 1));
    }
    nm.getNormalMatrix(m);
    for (let c = 0; c < count; c++) {
      const src = piece.corners[c];
      for (const name of names) {
        const attr = source.attributes[name] as THREE.BufferAttribute;
        const size = attr.itemSize, dst = out[name];
        if (name === 'position') {
          p.set(at[c * 3], at[c * 3 + 1], at[c * 3 + 2]).applyMatrix4(m);
          dst[(write + c) * 3] = p.x; dst[(write + c) * 3 + 1] = p.y; dst[(write + c) * 3 + 2] = p.z;
        } else if (name === 'normal') {
          n.fromBufferAttribute(attr, src).applyMatrix3(nm).normalize();
          dst[(write + c) * 3] = n.x; dst[(write + c) * 3 + 1] = n.y; dst[(write + c) * 3 + 2] = n.z;
        } else {
          for (let k = 0; k < size; k++) dst[(write + c) * size + k] = attr.array[src * size + k];
        }
      }
    }
    write += count;
  }
  const broken = new THREE.BufferGeometry();
  for (const name of names) {
    const attr = source.attributes[name] as THREE.BufferAttribute;
    broken.setAttribute(name, new THREE.BufferAttribute(out[name], attr.itemSize, attr.normalized));
  }
  broken.userData = { ...intact.userData, fractured: { parts: new Set(pieces.map((piece) => piece.corners)).size, pieces: pieces.length } };
  broken.computeBoundingBox();
  broken.computeBoundingSphere();
  if (source !== intact) source.dispose();
  return broken;
}

/**
 * The kinds whose broken state is their intact build, broken (props.ts finalizeDestructiblePool): the boards, posts,
 * frames and cloth of the light dressing. A kind left out keeps its own broken builder: the barrel's sprung staves, the
 * carts (cartKit), the burnt vehicles (civilianVehicleKit), the walls' stone, the straw, the wire, the pillbox.
 */
export const PROP_FRACTURE: Readonly<Record<string, FracturePlan>> = Object.freeze({
  crate: WOOD_FRACTURE, pallet: WOOD_FRACTURE, bench: WOOD_FRACTURE, trough: WOOD_FRACTURE, stall: WOOD_FRACTURE,
  firewood: WOOD_FRACTURE, rugframe: WOOD_FRACTURE, laundry: WOOD_FRACTURE, ammobox: WOOD_FRACTURE, tent: WOOD_FRACTURE,
  cablespool: WOOD_FRACTURE, gate: WOOD_FRACTURE,
  fenceplank: FENCE_FRACTURE, fencepicket: FENCE_FRACTURE, fencewattle: FENCE_FRACTURE, fencerail: FENCE_FRACTURE,
});

/** A kind's break on a map: its own salt on the map's seed. */
export function fractureSeed(mapSeed: number, kind: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < kind.length; i++) h = Math.imul(h ^ kind.charCodeAt(i), 0x01000193);
  return (h ^ Math.imul(mapSeed | 0, 0x9e3779b1)) | 0;
}
