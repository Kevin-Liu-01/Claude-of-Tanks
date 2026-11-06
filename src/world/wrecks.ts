// src/world/wrecks.ts — DESTRUCTIBLES r1: REAL-ROSTER TANK WRECKS as static
// battlefield dressing.
//
// The old props.ts hulks were generic box sketches; the owner asked for the
// map wrecks to be "our actual tank models". This module builds a roster
// vehicle through the live factory (src/vehicles/tankFactory.ts), applies the
// settled destroyed pose via the factory's own wreck machinery
// (setDestroyed({pop, ageS: large}) — the exact precedent the killcam uses:
// wreckSeat capture, askew turret, drooped gun), then BAKES the posed
// hierarchy down to one static merged BufferGeometry with charred/rusted
// vertex colors and disposes the live visual. The factory's geometry-only
// material mode skips every temporary PBR/camouflage canvas because those
// pixels cannot survive this bake. A whole map's wrecks render as
// ONE mesh on the props layer's matte vertex-color material — a handful of
// draw calls total instead of a live tank's dozens, no articulation, no
// per-frame cost, no tank materials/textures retained.
//
// Contract notes:
//  - createTank is called with proceduralOnly: true — synchronous procedural
//    build (no async GLB swap, no GLB textures), and attachTankDecorations
//    HARD-SKIPS on that flag, so this path never interacts with the
//    decoration system or the geometry-gate metrology guards. tankFactory
//    itself is NOT modified — the bake is a pure consumer.
//  - Wrecks are DRESSING: props.ts gives them solid obstacles + colliders;
//    they are never in game.tanks, never spotted, never on the minimap.
//  - Failure-tolerant: profile builders are actively iterated by the
//    fidelity program — any per-id build failure returns null and the caller
//    just skips that wreck (a map with fewer wrecks beats a crashed build).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  compactWreckGeometryForPaintSteps, compactWreckGeometrySteps,
  type WreckGeometryBuildSlice,
} from './exactWreckGeometry.ts';
import { createTank } from '../vehicles/fleetFactory.ts';
import { WRECK_STATE_TABLE, type WreckState, type WreckStateRow } from './wreckStates.ts';
import { collectWreckShellSolids, collectWreckSolids } from './wreckCollision.ts';
import { crumpleWreckGeometry, planWreckCrumple, refineForCrumple, type WreckCrumplePlan } from './wreckCrumple.ts';
import { buildWreckDebris, seatWreckDebris } from './wreckDebris.ts';
import {
  buildTurretRingWellGeometry, cutTurretRingAperture, emptyTurretRingRim, planTurretRingHulk, type TurretRingSeat,
} from '../vehicles/turretRingWell.ts';

export interface WreckOptions {
  seed?: number;
  /** How it died and what has happened to it since (wreckStates.ts); default burnt_out. */
  state?: WreckState;
  /** (tank-opt RING) false bakes a cook-off's hulk without its ring well (the receipts' A/B); default on. */
  ring?: boolean;
  /** The paint the tank wore (sRGB hex; the map's camouflage family, wreckRemnantPaint): patches survive the burn on
   * the lower flanks. Unset: char and oxide only. */
  remnant?: number;
}

export interface WreckBake {
  solids: number[][];
  /** The hull's and turret's convex-hull corners for the shell record (wreckCollision.ts collectWreckShellSolids; the
   * hitbox lane, 2026-10-08); a bake without them keeps the movement solids for shells too. */
  shellSolids?: number[][];
  geo: THREE.BufferGeometry;
  shadowGeo: THREE.BufferGeometry | null;
  hx: number;
  hz: number;
  h: number;
  tris: number;
  /** The props placement budget's triangle count: the bake as that budget has always counted it (burnt-away suits in,
   * second canvas faces and kept muzzle walls out; budgetTriDelta), so every map seats the hulks it seated before the
   * sealed lane's bake fixes. `tris` stays the geometry's own count. */
  budgetTris?: number;
  /** The props placement footprint (half extents): the visible envelope with its burnt-away parts, the seat the hulk
   * has always taken. hx/hz/h are the visible geometry's own envelope. */
  placeHx?: number;
  placeHz?: number;
  /** (Lane C, #8 r2) The hulk's ground contact in its frame, [minX, maxX, minZ, maxZ]: the plan of everything within
   *  12 cm of its base (its track runs on the ground). The seat samples the terrain over it alone (seatHulk), not over
   *  the envelope of a tossed turret or a gun run out past the hull. */
  contact?: [number, number, number, number];
  /** (wrecks-270) How far under the ground line its base stands (m): a half-buried hulk's drift, a ditched nose. The
   *  seat lowers the hulk by it; its geometry and solids are in the frame the ground meets at y = 0. */
  buried?: number;
  /** (wrecks-270) The side a track_thrown hulk lost its track on (-1 or 1, x's sign): the debris lays the run there. */
  thrownSide?: number;
}

type TankWreckVisual = ReturnType<typeof createTank>;

interface WreckBuildSlice extends WreckGeometryBuildSlice {
  progress: false;
}

interface WreckBakeOwner {
  visual: TankWreckVisual | null;
  geometries: Set<THREE.BufferGeometry>;
}

/** A cook-off hulk's ring (tank-opt RING, 2026-10-16; turretRingWell.ts planTurretRingHulk): the hull-side parts the
 *  bake collects (posed and crumpled), cut once they are all in — exactly, on their final shape: the race's prism (the
 *  band closing those cut faces round the rim) and the well's under it, clear of the bent hull's skin — and the well
 *  merged in as real geometry, so the hulk's one mesh shows the ring its turret left. */
interface WreckRingStage {
  seat: TurretRingSeat;
  /** The bake's root frame to the hull frame (the cuts'), and back. */
  toHull: THREE.Matrix4;
  fromHull: THREE.Matrix4;
  /** The hull-side parts collected so far, each a generated interior fill or not. */
  parts: Map<THREE.BufferGeometry, boolean>;
}

function stageWreckRing(visual: TankWreckVisual, root: THREE.Object3D): WreckRingStage | null {
  const seat = visual.turretRingSeat?.();
  const hull = root.getObjectByName('rig_hull');
  if (!seat || !hull) return null;
  const toHull = hull.matrixWorld.clone().invert().multiply(root.matrixWorld);
  return { seat, toHull, fromHull: toHull.clone().invert(), parts: new Map() };
}

/** A hull-side part (not the turret's or the gun's): what the ring's cut takes. */
function ringCuttable(object: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object.parent; node && node !== root; node = node.parent) {
    if (node.name === 'rig_turret' || node.name === 'rig_gun') return false;
  }
  return true;
}

/** Every collected hull-side part cut at the ring, then the well merged; the placement budget counts the hulk as it
 *  always has (the cuts' and the well's triangles are not the map's to place). */
function* finishWreckRingSteps(ring: WreckRingStage, target: WreckGeometrySet, owner: WreckBakeOwner):
  Generator<WreckGeometryBuildSlice, void, void> {
  const plan = planTurretRingHulk(ring.seat, [...ring.parts].map(([geometry, fill]) => ({ geometry, toHull: ring.toHull, fill })));
  yield { fine: true, stage: 'ring-plan' };
  const rim = emptyTurretRingRim(plan.sides);
  let done = 0;
  for (let i = 0; i < target.geos.length; i++) {
    const part = target.geos[i];
    if (!ring.parts.has(part)) continue;
    const cut = cutTurretRingAperture(part, plan.cuts, ring.toHull, rim);
    if (cut !== part) {
      owner.geometries.add(cut);
      target.budgetTriDelta -= triangleCount(cut) - triangleCount(part);
      target.geos[i] = cut;
    }
    if (++done % 16 === 0) yield { fine: true, stage: `ring-cut-${done}` };
  }
  const well = buildTurretRingWellGeometry(plan.seat, rim, plan.sides).applyMatrix4(ring.fromHull);
  owner.geometries.add(well);
  target.geos.push(well);
  target.budgetTriDelta -= triangleCount(well);
  yield { fine: true, stage: 'ring-well' };
}

const triangleCount = (geometry: THREE.BufferGeometry): number =>
  ((geometry.index?.count ?? geometry.attributes.position.count) / 3) | 0;

interface WreckGeometrySet {
  geos: THREE.BufferGeometry[];
  proxyGeos: THREE.BufferGeometry[];
  /** Root-frame bounds of the parts that burn away: the hulk keeps their footprint, so placement and collision hold. */
  burntAway: THREE.Box3;
  /** Triangles the placement budget still counts (burnt-away parts in, second canvas faces out): every map seats the
   * same hulks it seated before the sealed lane's bake fixes. */
  budgetTriDelta: number;
}

function mulberry32(a: number): () => number {
  return function (): number {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// cheap deterministic 3D value hash for the char/rust paint (no noise dep —
// wrecks.ts must stay import-light to avoid world<->vehicles cycles)
function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

// Static battlefield wrecks are never inspection heroes. Match the proven
// low-geometry battle handoff used by live tanks beyond 66 m: retain the
// load-bearing road-wheel/tire silhouettes, but omit sub-wheel recesses,
// return rollers and end-wheel fasteners that disappear under the charred
// track band at gameplay scale.
const WRECK_FINE_GEAR = /^(?:gearRoadWheel.*(?:Inset|Ring|Rim|Bowl|Hub|Dish|Recess)|gearReturnRoller|gearEndWheelHardware)/;
// At the closest authored wreck framing (~16 m), a 45 cm object projects to
// only a few pixels and its charred material has almost no internal contrast.
// Keep silhouette-bearing fittings, but do not bake smaller inspection parts
// into a map-long static mesh. This threshold is deliberately below road
// wheels, hatches, stowage boxes, guns and ERA blocks.
const WRECK_MIN_PART_DIAGONAL_M = 0.45;

/** true when o and every ancestor up to (incl.) root renders */
function chainVisible(o: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let n: THREE.Object3D | null = o; n; n = n.parent) {
    if (n.visible === false) return false;
    if (n === root) return true;
  }
  return true; // detached-under-root should not happen; keep permissive
}

function cloneWreckGeometry(
  geometry: THREE.BufferGeometry,
  transform: THREE.Matrix4,
  owner: WreckBakeOwner,
): THREE.BufferGeometry {
  const clone = geometry.clone();
  owner.geometries.add(clone);
  return clone.applyMatrix4(transform);
}

function disposeWreckBakeOwner(owner: WreckBakeOwner): void {
  // Drain every independent allocation even if one disposer throws. The
  // caller's cancellation/build error must remain the primary outcome.
  for (const geometry of owner.geometries) {
    try { geometry.dispose(); } catch (_) { /* continue draining */ }
  }
  owner.geometries.clear();
  if (owner.visual) {
    try { owner.visual.dispose(); } catch (_) { /* never break a world build */ }
    owner.visual = null;
  }
}

function* appendInstancedGeometrySteps(
  mesh: THREE.InstancedMesh,
  rootInv: THREE.Matrix4,
  geos: THREE.BufferGeometry[],
  owner: WreckBakeOwner,
  crumple: WreckCrumplePlan | null,
): Generator<WreckGeometryBuildSlice, void, void> {
  const relative = new THREE.Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld);
  const instance = new THREE.Matrix4();
  const transform = new THREE.Matrix4();
  const count = Math.min(mesh.count, 400);
  for (let i = 0; i < count; i++) {
    mesh.getMatrixAt(i, instance);
    transform.multiplyMatrices(relative, instance);
    const clone = cloneWreckGeometry(mesh.geometry, transform, owner);
    crumpleWreckGeometry(crumple, clone, mesh);
    geos.push(clone);
    if ((i + 1) % 16 === 0 || i + 1 === count) {
      yield { fine: true, stage: `collect-instances-${i + 1}` };
    }
  }
}

function isSimplifiedTrackReplacement(mesh: THREE.Mesh): boolean {
  if (mesh.name === 'gearTrackPadsSimplified') return false;
  return mesh.name === 'gearTrackPads'
    && !!mesh.parent?.children.some((child) => child.name === 'gearTrackPadsSimplified');
}

// Sealed lane 2026-10-10 (owner: "some vehicles are see through"): a burnt hulk keeps no camouflage suit. Baked into
// the one-sided props material its draped net read as an opaque sheet open from every side but one (the Leopard 2A4
// hulk showed the sky through 12,000 px of the 33 sealed views).
const WRECK_BURNT_AWAY = /_ghillie_/;
// Canvas is drawn double-sided on the live vehicle (materials.ts canvasCloth/canvasPale): its tarps, aprons and boots
// are one surface. The hulk's material is one-sided, so they bake with both windings.
const WRECK_TWO_SIDED = /^(?:hull|turret|gunMount)(?:Cloth|CanvasPale|CanvasSkin)$/;

function isDiscardedWreckPart(mesh: THREE.Mesh, root: THREE.Object3D): boolean {
  if (mesh.userData.wreckRemoved) return true;
  if (isSimplifiedTrackReplacement(mesh)) return true;
  if (mesh.name !== 'gearTrackPadsSimplified' && !chainVisible(mesh, root)) return true;
  return WRECK_FINE_GEAR.test(mesh.name || '');
}

/** The other face of a one-surface part: reversed triangles with reversed normals (the clone is bake-owned). */
function reversedWreckGeometry(geometry: THREE.BufferGeometry, owner: WreckBakeOwner): THREE.BufferGeometry {
  const back = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  owner.geometries.add(back);
  for (const attribute of Object.values(back.attributes) as THREE.BufferAttribute[]) {
    const size = attribute.itemSize, array = attribute.array;
    for (let corner = 0; corner + 2 < attribute.count; corner += 3) {
      for (let k = 0; k < size; k++) {
        const b = (corner + 1) * size + k, c = (corner + 2) * size + k;
        const t = array[b]; array[b] = array[c]; array[c] = t;
      }
    }
  }
  const normal = back.getAttribute('normal') as THREE.BufferAttribute | undefined;
  if (normal) for (let i = 0; i < normal.array.length; i++) normal.array[i] = -normal.array[i];
  return back;
}

/** (wrecks-270) A part with the triangles on one side of the hull's centre line (x * side > 0, the bake's frame) taken
 *  away: a thrown track's run. Null when nothing is left. */
function dropWreckSide(geometry: THREE.BufferGeometry, side: number, owner: WreckBakeOwner): THREE.BufferGeometry | null {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) owner.geometries.add(flat);
  const position = flat.attributes.position;
  const keep: number[] = [];
  for (let t = 0; t + 2 < position.count; t += 3) {
    if ((position.getX(t) + position.getX(t + 1) + position.getX(t + 2)) * side <= 0) keep.push(t);
  }
  if (!keep.length) return null;
  if (keep.length * 3 === position.count) return flat;
  const out = new THREE.BufferGeometry();
  owner.geometries.add(out);
  for (const [name, attribute] of Object.entries(flat.attributes) as [string, THREE.BufferAttribute][]) {
    const size = attribute.itemSize, src = attribute.array;
    const array = new (src.constructor as Float32ArrayConstructor)(keep.length * 3 * size);
    keep.forEach((t, k) => array.set(src.subarray(t * size, (t + 3) * size), k * 3 * size));
    out.setAttribute(name, new THREE.BufferAttribute(array, size, attribute.normalized));
  }
  return out;
}

function* appendWreckMeshGeometrySteps(
  mesh: THREE.Mesh,
  root: THREE.Object3D,
  rootInv: THREE.Matrix4,
  target: WreckGeometrySet,
  size: THREE.Vector3,
  owner: WreckBakeOwner,
  crumple: WreckCrumplePlan | null,
  ring: WreckRingStage | null = null,
): Generator<WreckGeometryBuildSlice, void, void> {
  if (!mesh.geometry?.attributes?.position || isDiscardedWreckPart(mesh, root)) return;
  if (WRECK_BURNT_AWAY.test(mesh.name || '')) {
    // the exact bounds the baked part would have given (the same clone and float transform), then dropped
    const relative = new THREE.Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld);
    const transforms: THREE.Matrix4[] = [];
    if (mesh instanceof THREE.InstancedMesh) {
      const instance = new THREE.Matrix4();
      for (let i = 0; i < Math.min(mesh.count, 400); i++) {
        mesh.getMatrixAt(i, instance);
        transforms.push(new THREE.Matrix4().multiplyMatrices(relative, instance));
      }
    } else transforms.push(relative);
    for (const transform of transforms) {
      const part = cloneWreckGeometry(mesh.geometry, transform, owner);
      part.computeBoundingBox();
      if (part.boundingBox) target.burntAway.union(part.boundingBox);
      target.budgetTriDelta += ((part.index?.count ?? part.attributes.position.count) / 3) | 0;
      owner.geometries.delete(part);
      part.dispose();
    }
    return;
  }
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (material?.colorWrite === false) {
    // the shadow proxies bend and dent with what they stand for (wreckCrumple.ts)
    const proxy = cloneWreckGeometry(mesh.geometry, new THREE.Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld), owner);
    crumpleWreckGeometry(crumple, proxy, mesh);
    target.proxyGeos.push(proxy);
    return;
  }
  if (material?.transparent && 'map' in material && material.map) return;
  if (mesh instanceof THREE.InstancedMesh) {
    const first = target.geos.length;
    yield* appendInstancedGeometrySteps(mesh, rootInv, target.geos, owner, crumple);
    // (wrecks-270) a thrown track: the run on that side is gone
    const side = mesh.userData.wreckDropSide as number | undefined;
    if (side) {
      for (let i = target.geos.length - 1; i >= first; i--) {
        const part = target.geos[i];
        part.computeBoundingBox();
        if ((part.boundingBox!.min.x + part.boundingBox!.max.x) * side > 0) { target.geos.splice(i, 1); owner.geometries.delete(part); part.dispose(); }
      }
    }
    // its copies are bent already: the ring cuts them with the rest
    if (ring && ringCuttable(mesh, root)) for (let i = first; i < target.geos.length; i++) ring.parts.set(target.geos[i], false);
    return;
  }
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  mesh.geometry.boundingBox?.getSize(size);
  // The carved muzzle's wall and backstop close the aperture cut from the barrel's own face: never a small part.
  const small = Math.hypot(size.x, size.y, size.z) < WRECK_MIN_PART_DIAGONAL_M;
  if (small && !mesh.userData.carvedBoreStock) return;
  const posed = cloneWreckGeometry(mesh.geometry, new THREE.Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld), owner);
  // (wrecks-270) a thrown track: the run on that side is gone
  const clone = mesh.userData.wreckDropSide ? dropWreckSide(posed, mesh.userData.wreckDropSide as number, owner) : posed;
  if (!clone) return;
  // the plates get corners to bend first (a box plate's middle has none), then the crumple moves them
  const refined = refineForCrumple(crumple, clone, mesh);
  if (refined !== clone) owner.geometries.add(refined);
  crumpleWreckGeometry(crumple, refined, mesh);
  target.geos.push(refined);
  // (tank-opt RING) a hull-side part: the ring cuts it once every part is in and bent (finishWreckRingSteps)
  const ringPart = !!ring && ringCuttable(mesh, root);
  if (ring && ringPart) ring.parts.set(refined, !!mesh.userData.interiorFill);
  // integ/218 (sealed r1 over destruction 350): the kept muzzle walls and the canvas's second faces stay out of the
  // placement budget as they were before the crumple; the second face reverses the crumpled surface, so both windings
  // follow the same dents
  if (small) target.budgetTriDelta -= ((refined.index?.count ?? refined.attributes.position.count) / 3) | 0;
  if (WRECK_TWO_SIDED.test(mesh.name || '')) {
    const back = reversedWreckGeometry(refined, owner);
    target.geos.push(back);
    target.budgetTriDelta -= (back.attributes.position.count / 3) | 0;
    if (ring && ringPart) ring.parts.set(back, false);
  }
}

function* collectWreckGeometrySteps(
  root: THREE.Object3D,
  rootInv: THREE.Matrix4,
  owner: WreckBakeOwner,
  crumple: WreckCrumplePlan | null = null,
  ring: WreckRingStage | null = null,
): Generator<WreckGeometryBuildSlice, WreckGeometrySet, void> {
  const target: WreckGeometrySet = { geos: [], proxyGeos: [], burntAway: new THREE.Box3(), budgetTriDelta: 0 };
  const size = new THREE.Vector3();
  // Match Object3D.traverse's pre-order without retaining a callback stack
  // across checkpoints. This private settled hierarchy cannot change owners.
  const stack: THREE.Object3D[] = [root];
  let visited = 0;
  while (stack.length) {
    const object = stack.pop()!;
    if (object instanceof THREE.Mesh) {
      yield* appendWreckMeshGeometrySteps(object, root, rootInv, target, size, owner, crumple, ring);
    }
    for (let index = object.children.length - 1; index >= 0; index--) stack.push(object.children[index]);
    if (++visited % 16 === 0 || !stack.length) {
      yield { fine: true, stage: `collect-nodes-${visited}` };
    }
  }
  return target;
}

/**
 * A donor's sliver triangles can carry zero normals out of computeVertexNormals (the t90am's turretDetail had 51),
 * which bake to unlit specks. A corner whose normal has no usable length takes its triangle's face normal, or up
 * when the triangle has no area; every other corner is renormalised. Non-indexed, bake-owned geometry only.
 */
function repairWreckNormals(geometry: THREE.BufferGeometry): void {
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const normal = geometry.attributes.normal as THREE.BufferAttribute | undefined;
  if (!normal?.isBufferAttribute || !position?.isBufferAttribute || normal.itemSize !== 3) return;
  const p = position.array, n = normal.array;
  for (let t = 0; t + 2 < normal.count; t += 3) {
    let face = false, fx = 0, fy = 1, fz = 0;
    for (let k = t; k < t + 3; k++) {
      const o = k * 3, l = Math.hypot(n[o], n[o + 1], n[o + 2]);
      if (l > 0.99 && l < 1.01) continue;
      if (l > 0.5 && Number.isFinite(l)) { n[o] /= l; n[o + 1] /= l; n[o + 2] /= l; continue; }
      if (!face) {
        face = true;
        const a = t * 3, b = a + 3, c = a + 6;
        const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
        const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx, cl = Math.hypot(cx, cy, cz);
        if (cl > 1e-12 && Number.isFinite(cl)) { fx = cx / cl; fy = cy / cl; fz = cz / cl; }
      }
      n[o] = fx; n[o + 1] = fy; n[o + 2] = fz;
    }
  }
  normal.needsUpdate = true;
}

function normalizeGeometry(
  geometry: THREE.BufferGeometry,
  keepNormal: boolean,
  owner?: WreckBakeOwner,
): THREE.BufferGeometry {
  const normalized = geometry.index ? geometry.toNonIndexed() : geometry;
  // The synchronous debris consumer retains its existing ownership path;
  // staged tank bakes always register before any later operation can throw.
  owner?.geometries.add(normalized);
  if (keepNormal && !normalized.attributes.normal) normalized.computeVertexNormals();
  if (keepNormal) repairWreckNormals(normalized);
  for (const key of Object.keys(normalized.attributes)) {
    if (key !== 'position' && (!keepNormal || key !== 'normal')) normalized.deleteAttribute(key);
  }
  normalized.morphAttributes = {};
  normalized.clearGroups();
  return normalized;
}

function* normalizeGeometrySetSteps(
  geometries: THREE.BufferGeometry[],
  keepNormal: boolean,
  owner: WreckBakeOwner,
): Generator<WreckGeometryBuildSlice, THREE.BufferGeometry[], void> {
  const result: THREE.BufferGeometry[] = [];
  for (let index = 0; index < geometries.length; index++) {
    result.push(normalizeGeometry(geometries[index], keepNormal, owner));
    if ((index + 1) % 16 === 0 || index + 1 === geometries.length) {
      yield { fine: true, stage: `normalize-${keepNormal ? 'visible' : 'shadow'}-${index + 1}` };
    }
  }
  return result;
}

function mergeRequired(
  geometries: THREE.BufferGeometry[],
  failureMessage: string,
): THREE.BufferGeometry {
  const merged = mergeGeometries(geometries, false);
  if (!merged) throw new Error(failureMessage);
  return merged;
}

// The burn's other tones (the map-vehicles lane, P4, 2026-10-06), all inside the char band's value so a sunlit hulk
// still reads burnt, never tan: the brown oxide a hot hull takes on its flanks, the grey of burnt-off paint on the roof
// and deck, soot streaked up the sides, and patches of the paint the tank wore surviving low on its flanks.
const WRECK_OXIDE: readonly [number, number, number] = [0.105, 0.052, 0.028];
const WRECK_ASH: readonly [number, number, number] = [0.098, 0.094, 0.088];

/** A coarse cell value (blotches a cell's size, blended across each triangle by the vertex colours). */
function wreckCell(px: number, py: number, pz: number, scale: number, salt: number): number {
  return hash3(Math.round(px * scale) * 0.73 + salt, Math.round(py * scale) * 0.61 - salt * 0.5, Math.round(pz * scale) * 0.79 + salt * 0.25);
}

function wreckVertexColor(
  px: number,
  py: number,
  pz: number,
  up: number,
  rustPhase: number,
  remnant: readonly [number, number, number] | null,
  color: [number, number, number],
  age = 0,
): readonly [number, number, number] {
  const panel = hash3(
    Math.round(px * 2.4) * 0.5,
    Math.round(py * 2.4) * 0.5,
    Math.round(pz * 2.4) * 0.5,
  );
  const grain = hash3(px * 9.1, py * 9.1, pz * 9.1);
  const rust = hash3(px * 1.7 + rustPhase, py * 1.9, pz * 1.7 - rustPhase);
  // (wrecks-270) an old hulk: the rust spreads over the soot and the oxide over the flanks, year on year
  if (rust > 0.80 - age * 0.24 && up < 0.85 + age * 0.15) {
    const level = 0.085 + grain * 0.075;
    color[0] = level * 1.75;
    color[1] = level * 0.9;
    color[2] = level * 0.55;
    return color;
  }
  const level = 0.046 + panel * 0.022 + grain * 0.017 + up * up * 0.020;
  let r = level * 1.05, g = level, b = level * 0.93;
  const mix = (target: readonly [number, number, number], t: number) => {
    r += (target[0] - r) * t; g += (target[1] - g) * t; b += (target[2] - b) * t;
  };
  // heat oxide in broad blotches down the flanks (less on the faces the sky sees)
  const oxide = wreckCell(px, py, pz, 1.25, rustPhase);
  const oxideFrom = 0.52 - age * 0.22;
  if (oxide > oxideFrom) mix(WRECK_OXIDE, Math.min(1, ((oxide - oxideFrom) / (1 - oxideFrom)) * (0.85 + age * 0.15)) * (1 - up * 0.6 * (1 - age)));
  // the paint it wore, surviving in patches low on the flanks where the fire ran thinnest
  if (remnant && up < 0.55 && py < 1.35) {
    const keep = wreckCell(px, py, pz, 1.7, rustPhase * 0.37 + 5.1);
    const low = py < 0.9 ? 1 : (1.35 - py) / 0.45;
    if (keep > 0.5) mix(remnant, Math.min(1, ((keep - 0.5) / 0.3)) * 0.9 * low);
  }
  // burnt-off paint gone to grey ash on the roof and deck
  if (up > 0.7 && py > 1.2) {
    const ash = wreckCell(px, py, pz, 2.1, rustPhase * 0.53 + 9.7);
    if (ash > 0.55) mix(WRECK_ASH, ((ash - 0.55) / 0.45) * 0.55 * (up - 0.7) / 0.3);
  }
  // soot streaked up the sides from the hatches and the engine deck
  if (up < 0.3) {
    const streak = hash3(Math.round(px * 7) * 0.31 + rustPhase, Math.round(py * 0.9) * 0.29, Math.round(pz * 7) * 0.37);
    if (streak > 0.72) { const k = 1 - 0.38 * ((streak - 0.72) / 0.28); r *= k; g *= k; b *= k; }
  }
  color[0] = r;
  color[1] = g;
  color[2] = b;
  return color;
}

/** sRGB hex to the painter's linear triple, darkened and dulled as fire leaves paint. */
function remnantLinear(hex: number | undefined): readonly [number, number, number] | null {
  if (hex === undefined) return null;
  const c = (v: number) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const lin: [number, number, number] = [c((hex >> 16) & 255), c((hex >> 8) & 255), c(hex & 255)];
  const grey = (lin[0] + lin[1] + lin[2]) / 3;
  // dulled a little toward grey and darkened by the smoke: a light paint (sand, whitewash) more, so it stays a patch of
  // dirty paint on a dark hull, never a tan one
  const dark = Math.min(0.85, 0.11 / Math.max(0.02, grey));
  // and never brighter, channel by channel, than the char band's brightest (only the rust is brighter)
  return [Math.min(0.11, (lin[0] * 0.8 + grey * 0.2) * dark), Math.min(0.104, (lin[1] * 0.8 + grey * 0.2) * dark),
    Math.min(0.0965, (lin[2] * 0.8 + grey * 0.2) * dark)];
}

function* paintWreckGeometrySteps(
  merged: THREE.BufferGeometry,
  rustPhase: number,
  remnant: readonly [number, number, number] | null = null,
  age = 0,
): Generator<WreckGeometryBuildSlice, void, void> {
  const position = merged.attributes.position;
  const normal = merged.attributes.normal;
  const colors = new Float32Array(position.count * 3);
  // A bake paints tens of thousands of vertices; reuse one tuple without
  // changing arithmetic or retaining scratch state beyond this construction.
  const scratchColor: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < position.count; i++) {
    const color = wreckVertexColor(
      position.getX(i),
      position.getY(i),
      position.getZ(i),
      Math.max(0, normal.getY(i)),
      rustPhase,
      remnant,
      scratchColor,
      age,
    );
    colors[i * 3] = color[0];
    colors[i * 3 + 1] = color[1];
    colors[i * 3 + 2] = color[2];
    if ((i + 1) % 2048 === 0 || i + 1 === position.count) {
      yield { fine: true, stage: `paint-vertices-${i + 1}` };
    }
  }
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function* mergeShadowGeometrySteps(
  proxyGeos: THREE.BufferGeometry[],
  owner: WreckBakeOwner,
): Generator<WreckGeometryBuildSlice, THREE.BufferGeometry | null, void> {
  if (!proxyGeos.length) return null;
  const normalized = yield* normalizeGeometrySetSteps(proxyGeos, false, owner);
  const merged = mergeGeometries(normalized, false);
  if (merged) owner.geometries.add(merged);
  return merged;
}

function wreckBakeResult(
  merged: THREE.BufferGeometry,
  shadowGeo: THREE.BufferGeometry | null,
  solids: number[][],
  shellSolids: number[][] | null = null,
  burntAway: THREE.Box3 | null = null,
  budgetTriDelta = 0,
  ground: number | null = null,
): WreckBake {
  merged.computeBoundingBox();
  const own = merged.boundingBox;
  if (!own) throw new Error('wreck bounds unavailable');
  const burnt = burntAway && !burntAway.isEmpty() ? burntAway : null;
  // (wrecks-270) a state that sinks the hulk names its ground line: what lies under it is in the earth
  const baseY = ground ?? (burnt ? Math.min(own.min.y, burnt.min.y) : own.min.y);
  for (const solid of solids) for (let i = 1; i < solid.length; i += 3) solid[i] -= baseY;
  for (const solid of shellSolids ?? []) for (let i = 1; i < solid.length; i += 3) solid[i] -= baseY;
  merged.translate(0, -baseY, 0);
  shadowGeo?.translate(0, -baseY, 0);
  // the translate recomputed the geometry's own box from its float positions (the visible envelope); the burnt-away
  // parts join it exactly as their translated float positions would have (fround(y - baseY)) for the placement
  // footprint, so every map seats its hulks where it did
  const bounds = merged.boundingBox!;
  const footprint = bounds.clone();
  if (burnt) {
    footprint.union(new THREE.Box3(
      new THREE.Vector3(burnt.min.x, Math.fround(burnt.min.y - baseY), burnt.min.z),
      new THREE.Vector3(burnt.max.x, Math.fround(burnt.max.y - baseY), burnt.max.z),
    ));
  }
  // the ground contact: the plan of the vertices within 12 cm of the base (the track runs), for the seat (seatHulk)
  const pos = merged.attributes.position.array;
  let cx0 = Infinity, cx1 = -Infinity, cz0 = Infinity, cz1 = -Infinity;
  // (wrecks-270) a hulk on its side rests on its fender's and turret's edges: when the 12 cm band holds no plan, it is
  // read 40 cm deep
  for (const band of [0.12, 0.4]) {
    cx0 = Infinity; cx1 = -Infinity; cz0 = Infinity; cz1 = -Infinity;
    for (let i = 0; i < pos.length; i += 3) {
      if (pos[i + 1] > band) continue;
      if (pos[i] < cx0) cx0 = pos[i]; if (pos[i] > cx1) cx1 = pos[i];
      if (pos[i + 2] < cz0) cz0 = pos[i + 2]; if (pos[i + 2] > cz1) cz1 = pos[i + 2];
    }
    if (cx1 - cx0 > 0.5 && cz1 - cz0 > 0.5) break;
  }
  const contact: [number, number, number, number] | null = cx1 - cx0 > 0.5 && cz1 - cz0 > 0.5 ? [cx0, cx1, cz0, cz1] : null;
  return {
    solids,
    ...(shellSolids ? { shellSolids } : {}),
    ...(contact ? { contact } : {}),
    geo: merged,
    shadowGeo,
    hx: (bounds.max.x - bounds.min.x) / 2,
    hz: (bounds.max.z - bounds.min.z) / 2,
    h: bounds.max.y - bounds.min.y,
    ...(burnt ? { placeHx: (footprint.max.x - footprint.min.x) / 2, placeHz: (footprint.max.z - footprint.min.z) / 2 } : {}),
    ...(ground !== null && bounds.min.y < 0 ? { buried: -bounds.min.y } : {}),
    tris: ((merged.index?.count ?? merged.attributes.position.count) / 3) | 0,
    budgetTris: (((merged.index?.count ?? merged.attributes.position.count) / 3) | 0) + budgetTriDelta,
  };
}

/**
 * Build one roster tank as a settled, burnt wreck and bake it to a single
 * static geometry (position/normal/color, base at y=0, XZ centered on the
 * hull origin, facing local +z like the live tank).
 *
 * @param {object} engineCtx EngineCtx (ARCHITECTURE §2.8)
 * @param {string} specId roster vehicle id ('kv2', 'm1a1_abrams_hc', ...)
 * @param {{seed?: number, state?: WreckState}} [opts] the damage state (wreckStates.ts): turret_blown_off is the
 *   ammo-rack wreck (turret tossed beside the ring), burnt_out the unseated-askew turret
 * @returns {?{geo: THREE.BufferGeometry, hx: number, hz: number, h: number,
 *   tris: number}} null on any build failure
 */
export function bakeTankWreck(
  engineCtx: object,
  specId: string,
  opts: WreckOptions = {},
): WreckBake | null {
  const steps = bakeTankWreckSteps(engineCtx, specId, opts);
  let result = steps.next();
  while (!result.done) result = steps.next();
  return result.value;
}

/** Cooperative twin with identical geometry and RNG. Consumers must close
 * the iterator on cancellation; no temporary visual or partial bake escapes.
 * The factory construction itself remains synchronous and is named honestly.
 */
export function* bakeTankWreckSteps(
  engineCtx: object,
  specId: string,
  opts: WreckOptions = {},
): Generator<WreckBuildSlice, WreckBake | null, void> {
  const steps = buildTankWreckSteps(engineCtx, specId, opts);
  try {
    let result = steps.next();
    while (!result.done) {
      yield { fine: true, progress: false, stage: `wreck-${specId}:${result.value.stage}` };
      result = steps.next();
    }
    return result.value;
  } finally {
    steps.return(null);
  }
}

// (wrecks-270) The parts a state takes off, by the factory's part names.
const WRECK_TRACK_PART = /^gearTrack/;
const WRECK_WHEEL_PART = /^(?:gear(?:RoadWheel|ReturnRoller|EndWheel|Suspension)|hullRunningGear)/;
const WRECK_FITTING_GROUP = /^fitting_|KitRackLoad|M2HB|MachineGun|machineGun/;
const WRECK_FITTING_MESH = /(?:Glass|Cloth|CanvasPale|CanvasSkin|Rubber)$/;

/** `object`'s bounds in the root frame. */
function rootFrameBox(object: THREE.Object3D, rootInv: THREE.Matrix4): THREE.Box3 {
  const box = new THREE.Box3(), part = new THREE.Box3(), m = new THREE.Matrix4();
  object.updateMatrixWorld(true);
  object.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || !node.geometry?.attributes?.position || !chainVisible(node, object)) return;
    if (node instanceof THREE.InstancedMesh) return; // the running gear's copies stay inside the hull's own bounds
    if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
    box.union(part.copy(node.geometry.boundingBox!).applyMatrix4(m.multiplyMatrices(rootInv, node.matrixWorld)));
  });
  return box;
}

const pick = (range: readonly [number, number], rng: () => number): number => range[0] + (range[1] - range[0]) * rng();

/**
 * (wrecks-270) A damage state's moves on the settled wreck's hierarchy, before the bake reads it (wreckStates.ts): the
 * tracks, wheels, fittings or gun taken off; the turret lifted off and set down beside the hull; the whole hulk pitched
 * nose-down about its tail, rolled onto its side about a track's outer edge, or sunk. Returns the ground line in the
 * root frame when the state sinks the hulk into it (the bake's base), else null (the base is its lowest point), and the
 * side a thrown track came off (0 for none). Its
 * own stream from the seed: the bake's other draws are the same in every state.
 */
function poseWreckState(root: THREE.Object3D, state: WreckStateRow, seed: number): { ground: number | null; thrownSide: number } {
  const rng = mulberry32((seed ^ 0x57a7e5) >>> 0);
  const rootInv = root.matrixWorld.clone().invert();
  const hull = root.getObjectByName('rig_hull') ?? root;
  const hullBox = rootFrameBox(hull, rootInv);
  if (hullBox.isEmpty()) return { ground: null, thrownSide: 0 };
  const ground0 = hullBox.min.y;
  const halfW = Math.max(-hullBox.min.x, hullBox.max.x);
  const dropSide = state.removes.track === 'one' ? (rng() < 0.5 ? -1 : 1) : 0;
  const { removes } = state;
  const take = (node: THREE.Object3D): void => { node.visible = false; node.userData.wreckRemoved = true; };
  const part = new THREE.Box3(), m = new THREE.Matrix4();
  root.traverse((node) => {
    const name = node.name || '';
    if (removes.fittings && !(node instanceof THREE.Mesh) && WRECK_FITTING_GROUP.test(name)) take(node);
    if (!(node instanceof THREE.Mesh)) return;
    if (removes.fittings && (WRECK_FITTING_MESH.test(name) || WRECK_FITTING_GROUP.test(name))) take(node);
    if (removes.wheels && WRECK_WHEEL_PART.test(name)) take(node);
    if (!WRECK_TRACK_PART.test(name) || removes.track === 'none') return;
    if (removes.track === 'both') { take(node); return; }
    // one track: a run wholly on that side goes; one mesh holding both runs loses that side's triangles in the bake
    if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
    part.copy(node.geometry.boundingBox!).applyMatrix4(m.multiplyMatrices(rootInv, node.matrixWorld));
    if (node instanceof THREE.InstancedMesh || part.min.x * dropSide < 0 && part.max.x * dropSide > 0) node.userData.wreckDropSide = dropSide;
    else if ((part.min.x + part.max.x) * dropSide > 0) take(node);
  });
  if (removes.gun) { const gun = root.getObjectByName('rig_gun'); if (gun) take(gun); }
  const turret = root.getObjectByName('rig_turret');
  if (state.turretSetDown && turret) {
    // lifted off the ring and set down upright on the ground beside the hull, turned as the crane left it
    if (turret.parent !== root) root.attach(turret);
    const side = rng() < 0.5 ? -1 : 1;
    turret.position.set(0, 0, 0);
    turret.quaternion.setFromEuler(new THREE.Euler((rng() - 0.5) * 0.1, rng() * Math.PI * 2, (rng() - 0.5) * 0.1, 'YXZ'));
    const tb = rootFrameBox(turret, rootInv);
    turret.position.set(
      side * (halfW + (tb.max.x - tb.min.x) / 2 + 0.6) - (tb.min.x + tb.max.x) / 2,
      ground0 - tb.min.y - 0.04,
      (hullBox.min.z + hullBox.max.z) / 2 + (rng() - 0.5) * 2 - (tb.min.z + tb.max.z) / 2,
    );
  }
  const pitch = pick(state.pitch, rng), rollSide = dropSide || (rng() < 0.5 ? -1 : 1), roll = pick(state.roll, rng);
  const sink = pick(state.sink, rng) * (hullBox.max.y - hullBox.min.y);
  const onSide = Math.abs(roll) > 0.5;
  if (pitch || roll || sink) {
    // the pivot: a ditched nose turns about the tail's lower edge; a hulk on its side about its middle (then laid on its
    // flank); the rest about the hull's middle on the ground
    const pivot = pitch > 0.1 ? new THREE.Vector3(0, ground0, hullBox.min.z)
      : new THREE.Vector3((hullBox.min.x + hullBox.max.x) / 2, onSide ? (hullBox.min.y + hullBox.max.y) / 2 : ground0,
        (hullBox.min.z + hullBox.max.z) / 2);
    const turn = new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z)
      .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(pitch, 0, -rollSide * Math.abs(roll), 'XYZ')))
      .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
    for (const child of [...root.children]) child.applyMatrix4(turn);
  }
  // a hulk on its side or cut up keeps its plan centred on its origin (the seat tests its footprint about it)
  if (onSide || state.turretSetDown) {
    const all = rootFrameBox(root, rootInv);
    const shift = new THREE.Matrix4().makeTranslation(-(all.min.x + all.max.x) / 2, 0, -(all.min.z + all.max.z) / 2);
    for (const child of [...root.children]) child.applyMatrix4(shift);
  }
  // a ditched nose and a sunk hulk keep the ground where it was (the tail's edge, the drift's top); one on its side
  // rests on its hull's flank (the gun digs in); the rest on their lowest point
  const ground = pitch > 0.1 ? ground0 : sink > 0 ? ground0 + sink : onSide ? rootFrameBox(hull, rootInv).min.y : null;
  return { ground, thrownSide: dropSide };
}

function* buildTankWreckSteps(
  engineCtx: object,
  specId: string,
  opts: WreckOptions,
): Generator<WreckGeometryBuildSlice, WreckBake | null, void> {
  const seed = (opts.seed ?? 1) | 0;
  const rng = mulberry32(seed ^ 0x5eed);
  const owner: WreckBakeOwner = { visual: null, geometries: new Set() };
  try {
    const visual = createTank(specId, engineCtx, {
      camoSeed: 4000 + (seed % 997),
      quality: 'low',
      // Battlefield hulks are read by their hull/turret/track silhouette, not
      // inspection-scale fasteners. Use the same authored low-geometry branch
      // as distant live combatants before baking the pose. This preserves the
      // exact vehicle proportions and wreck choreography while avoiding a
      // permanent hero-mesh tax on every frame of the match.
      geometryQuality: 'low',
      // The hierarchy is immediately reduced to position/normal/color and
      // rendered with the props layer's one baked material. Building normal,
      // roughness, camouflage, track, decal, and burnt maps here was pure
      // discarded work (nine modern wrecks dominated Ruinspires props time).
      materialMode: 'geometry-only',
      // No anatomy consumer survives the static position/normal/color bake.
      // Leave visual ERA placement and all normal factory defaults intact.
      eraVisualBindingReceipt: false,
      proceduralOnly: true,    // synchronous, no GLB, decor hard-skips
    });
    owner.visual = visual;
    const state = WRECK_STATE_TABLE[opts.state ?? 'burnt_out'];
    // settled wreck pose through the factory's own machinery: ageS far past
    // every timeline => turret settled (popped beside the ring or unseated
    // askew), gun drooped, burn timeline fully aged.
    visual.setDestroyed({ pop: state.pop, ageS: 1000 });
    const root = visual.root;
    root.updateMatrixWorld(true);
    // (wrecks-270) then the state's moves on the same hierarchy: parts off, the turret set down, the hull pitched, rolled
    // or sunk; the solids, the crumple, the ring and the geometry below all read the posed hierarchy
    const { ground, thrownSide } = poseWreckState(root, state, seed);
    root.updateMatrixWorld(true);
    const solids = collectWreckSolids(root);
    const shellSolids = collectWreckShellSolids(root);
    const rootInv = root.matrixWorld.clone().invert();
    // the metal deformed (the owner, 2026-10-09: "crumpled not just turn rusty"): dents, sagging fenders, hanging
    // skirts, a slack track, a bent barrel — planned from the posed hierarchy on the wreck's own seed, applied part by
    // part as the bake collects it; the solids above are the posed hierarchy's, so collision does not move
    const crumple = planWreckCrumple(root, seed, state.pop);
    // (tank-opt RING, 2026-10-16; the owner: "when the turret blows off we should see that") a cook-off's hulk shows the
    // ring its turret left: staged after the solids and the crumple plan (neither moves), merged into the one mesh; a
    // plain kill's turret still covers its ring, so its hulk keeps the deck as it was
    const ring = state.pop && opts.ring !== false ? stageWreckRing(visual, root) : null;
    yield { fine: true, stage: 'construct' };
    const collected = yield* collectWreckGeometrySteps(root, rootInv, owner, crumple, ring);
    if (ring) yield* finishWreckRingSteps(ring, collected, owner);
    const { geos, proxyGeos, burntAway, budgetTriDelta } = collected;
    if (!geos.length) throw new Error('no bakeable geometry');
    const normalized = yield* normalizeGeometrySetSteps(geos, true, owner);
    const merged = mergeRequired(normalized, 'merge failed');
    owner.geometries.add(merged);
    yield { fine: true, stage: 'merge-visible' };

    // ---- charred/rusted wreck paint (vertex colors, matte 'baked' mat) ----
    // Language matches the props charPaint hulks: scorched brown-black body,
    // clustered rust bloom, ash-lightened upward faces, subtle panel drift.
    // stay inside the PROVEN charPaint value band (props.ts r7 hulks:
    // v 0.055-0.105) — the first cut carried an up-facing "ash" bonus to
    // ~0.16 albedo which tonemapped to TAN under a 3.5+ sun (steppe/verdant
    // frame review); charred steel must stay near-black even sunlit.
    const rustPhase = rng() * 40;
    // RGB is determined by these exact position/normal words. Paint only the
    // first-occurrence representatives, retaining the original corner index.
    const preparedForPaint = yield* compactWreckGeometryForPaintSteps(merged);
    yield* paintWreckGeometrySteps(merged, rustPhase, remnantLinear(opts.remnant), state.age);
    if (!preparedForPaint) yield* compactWreckGeometrySteps(merged);
    const shadowGeo = yield* mergeShadowGeometrySteps(proxyGeos, owner);
    const result = wreckBakeResult(merged, shadowGeo, solids, shellSolids, burntAway, budgetTriDelta, ground);
    if (thrownSide) result.thrownSide = thrownSide;
    yield { fine: true, stage: 'finalize' };
    owner.geometries.delete(merged);
    if (shadowGeo) owner.geometries.delete(shadowGeo);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[wrecks] bake failed for ${specId}:`, message);
    return null;
  } finally {
    disposeWreckBakeOwner(owner);
  }
}

/**
 * The paint a map's wrecks wore (sRGB), by its field: the green of the field maps, the sand of the deserts and the
 * red rock, the whitewash of the snow, the grey of the cities and the works, the brown of the autumn woods.
 */
export function wreckRemnantPaint(mapId: string): number {
  switch (mapId) {
    case 'desert': case 'oasis': case 'badlands': case 'steppe': case 'titan_gorge': case 'skybridge': case 'copper_mesa':
    case 'orchard': case 'mars': return 0x9a8456;
    case 'winter': case 'whiteout': case 'alpine': return 0xc4c2b8;
    case 'urban': case 'railyard': case 'ruinspires': case 'blackglass': case 'foundry': case 'caldera': return 0x5c5e5a;
    case 'autumn': return 0x5e5236;
    case 'moon': return 0x8c8c88;
    default: return 0x4e5834;
  }
}

/**
 * A hulk's battlefield debris laid on flat ground in its frame and merged (the receipts' view of it; the props place
 * the pieces one by one on the terrain: wreckDebris.ts seatWreckDebris). Lane C, #8 r2: built from a tank's own kinds of
 * parts (linked track shoes, road wheels, torn plates, a skirt, a bin, a hatch lid, a drum, a roof gun), not boxes.
 */
export function bakeWreckDebris(
  seed: number,
  opts: { modern?: boolean; contact?: readonly [number, number, number, number] } = {},
): { geo: THREE.BufferGeometry; tris: number } {
  const debris = buildWreckDebris(seed, opts);
  const parts = seatWreckDebris(debris, null, 0, 0, 0);
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('wreck debris merge failed');
  for (const g of parts) g.dispose();
  return { geo: merged, tris: debris.tris };
}

/** How far the hulk's plane may stand over the deepest dip under its tracks (m): a third of the ground's relief under the
 *  contact, 4 to 9 cm; the rest of the run settles into the ground, deepest only where a bump rises under it. */
const HULK_SEAT_GAP_M = [0.04, 0.09] as const;

/**
 * (Lane C, #8 r2; the census judge: "every hulk is sunk along its whole running gear ... 0.42 to 0.70 m under the
 * terrain ... Cause: planGroundedObbPose drops the plane to the lowest of nine samples, then sinks a further 0.14 m")
 * Seat a hulk on its track runs: the terrain sampled over its ground contact alone (wrecks.ts WreckBake.contact, 5 x 7
 * points), the plane fitted to them by least squares, then set so it stands 4-9 cm over the deepest dip (a third of
 * the relief); the tracks settle into the ground elsewhere, deepest only at a bump. Returns the planGroundedObbPose fields the placement reads.
 */
export function seatHulk(
  heightField: { getHeightAt(x: number, z: number): number },
  x: number,
  z: number,
  yaw: number,
  contact: readonly [number, number, number, number],
) {
  const [x0, x1, z0, z1] = contact, c = Math.cos(yaw), s = Math.sin(yaw);
  const lx: number[] = [], lz: number[] = [], hy: number[] = [];
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 6; j++) {
    const ax = x0 + (x1 - x0) * (i / 4), az = z0 + (z1 - z0) * (j / 6);
    lx.push(ax); lz.push(az); hy.push(heightField.getHeightAt(x + ax * c + az * s, z - ax * s + az * c));
  }
  // least squares h = a + b x + d z over the samples (the local axes)
  const n = hy.length;
  let sx = 0, sz = 0, sh = 0, sxx = 0, szz = 0, sxz = 0, sxh = 0, szh = 0;
  for (let k = 0; k < n; k++) {
    sx += lx[k]; sz += lz[k]; sh += hy[k]; sxx += lx[k] * lx[k]; szz += lz[k] * lz[k]; sxz += lx[k] * lz[k];
    sxh += lx[k] * hy[k]; szh += lz[k] * hy[k];
  }
  const mx = sx / n, mz = sz / n, mh = sh / n;
  const cxx = sxx / n - mx * mx, czz = szz / n - mz * mz, cxz = sxz / n - mx * mz, cxh = sxh / n - mx * mh, czh = szh / n - mz * mh;
  const det = cxx * czz - cxz * cxz;
  const b = Math.abs(det) > 1e-9 ? (cxh * czz - czh * cxz) / det : 0;
  const d = Math.abs(det) > 1e-9 ? (czh * cxx - cxh * cxz) / det : 0;
  const a = mh - b * mx - d * mz;
  let minR = Infinity, maxR = -Infinity, min = Infinity, max = -Infinity;
  for (let k = 0; k < n; k++) {
    const r = hy[k] - (a + b * lx[k] + d * lz[k]);
    if (r < minR) minR = r; if (r > maxR) maxR = r;
    if (hy[k] < min) min = hy[k]; if (hy[k] > max) max = hy[k];
  }
  const offset = minR + Math.min(HULK_SEAT_GAP_M[1], Math.max(HULK_SEAT_GAP_M[0], (maxR - minR) / 3));
  const y = a + offset; // the plane at the hulk's origin (local 0, 0)
  // the normal of h = y + b x + d z in local axes, turned to the world by the yaw
  const nl = Math.hypot(b, d, 1) || 1, nxl = -b / nl, nzl = -d / nl, ny = 1 / nl;
  return {
    y,
    normalX: nxl * c + nzl * s,
    normalY: ny,
    normalZ: -nxl * s + nzl * c,
    min,
    max,
    spread: max - min,
    maxEmbed: Math.max(0, maxR - offset),
    maxFloat: Math.max(0, offset - minR),
  };
}
