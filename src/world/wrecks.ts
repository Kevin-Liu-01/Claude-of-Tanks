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
import { resolveWreckRoster } from './wreckRoster.ts';
import { collectWreckShellSolids, collectWreckSolids } from './wreckCollision.ts';
import { crumpleWreckGeometry, planWreckCrumple, refineForCrumple, type WreckCrumplePlan } from './wreckCrumple.ts';

export interface WreckOptions {
  seed?: number;
  pop?: boolean;
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
}

type TankWreckVisual = ReturnType<typeof createTank>;

interface WreckBuildSlice extends WreckGeometryBuildSlice {
  progress: false;
}

interface WreckBakeOwner {
  visual: TankWreckVisual | null;
  geometries: Set<THREE.BufferGeometry>;
}

type DebrisFamily = 'char' | 'rust' | 'rubber';

interface WreckGeometrySet {
  geos: THREE.BufferGeometry[];
  proxyGeos: THREE.BufferGeometry[];
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

function isDiscardedWreckPart(mesh: THREE.Mesh, root: THREE.Object3D): boolean {
  if (isSimplifiedTrackReplacement(mesh)) return true;
  if (mesh.name !== 'gearTrackPadsSimplified' && !chainVisible(mesh, root)) return true;
  return WRECK_FINE_GEAR.test(mesh.name || '');
}

function* appendWreckMeshGeometrySteps(
  mesh: THREE.Mesh,
  root: THREE.Object3D,
  rootInv: THREE.Matrix4,
  target: WreckGeometrySet,
  size: THREE.Vector3,
  owner: WreckBakeOwner,
  crumple: WreckCrumplePlan | null,
): Generator<WreckGeometryBuildSlice, void, void> {
  if (!mesh.geometry?.attributes?.position || isDiscardedWreckPart(mesh, root)) return;
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
    yield* appendInstancedGeometrySteps(mesh, rootInv, target.geos, owner, crumple);
    return;
  }
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  mesh.geometry.boundingBox?.getSize(size);
  if (Math.hypot(size.x, size.y, size.z) < WRECK_MIN_PART_DIAGONAL_M) return;
  const clone = cloneWreckGeometry(mesh.geometry, new THREE.Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld), owner);
  // the plates get corners to bend first (a box plate's middle has none), then the crumple moves them
  const refined = refineForCrumple(crumple, clone, mesh);
  if (refined !== clone) owner.geometries.add(refined);
  crumpleWreckGeometry(crumple, refined, mesh);
  target.geos.push(refined);
}

function* collectWreckGeometrySteps(
  root: THREE.Object3D,
  rootInv: THREE.Matrix4,
  owner: WreckBakeOwner,
  crumple: WreckCrumplePlan | null = null,
): Generator<WreckGeometryBuildSlice, WreckGeometrySet, void> {
  const target: WreckGeometrySet = { geos: [], proxyGeos: [] };
  const size = new THREE.Vector3();
  // Match Object3D.traverse's pre-order without retaining a callback stack
  // across checkpoints. This private settled hierarchy cannot change owners.
  const stack: THREE.Object3D[] = [root];
  let visited = 0;
  while (stack.length) {
    const object = stack.pop()!;
    if (object instanceof THREE.Mesh) {
      yield* appendWreckMeshGeometrySteps(object, root, rootInv, target, size, owner, crumple);
    }
    for (let index = object.children.length - 1; index >= 0; index--) stack.push(object.children[index]);
    if (++visited % 16 === 0 || !stack.length) {
      yield { fine: true, stage: `collect-nodes-${visited}` };
    }
  }
  return target;
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
// (destruction core, 2026-10-10, wave 350: "orange rust smears painted onto an intact, blocky body", "a large X-shaped
// streak on the turret face reads like crate bracing") the rust a long-dead hulk wears, muted to the char band's top
// (the old rust branch reached 0.28 red on one corner in six, and every bright corner lit the triangles round it), and
// the heat of the fire that killed it: the steel over the fighting compartment and the engine deck burnt to a cold,
// faintly violet grey, ringed by a straw-bronze temper band, and soot climbing round them and over the deck's edges.
const WRECK_RUST: readonly [number, number, number] = [0.138, 0.064, 0.032];
const WRECK_HEAT: readonly [number, number, number] = [0.094, 0.09, 0.1];
const WRECK_TEMPER: readonly [number, number, number] = [0.104, 0.074, 0.044];

/**
 * Where a hulk's fire burned, in the bake's root space: the deck's height (the hull plate's top) and the hot spots, as
 * x, y, z triples (the fighting compartment under the ring, the engine deck behind it). Null when the hierarchy has no
 * hull plate: the paint then keeps to char, oxide, rust and ash.
 */
interface WreckPaintFrame { deckY: number; hot: readonly number[] }

function wreckPaintFrame(root: THREE.Object3D, rootInv: THREE.Matrix4): WreckPaintFrame | null {
  const box = new THREE.Box3(), part = new THREE.Box3(), toRoot = new THREE.Matrix4();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object.name !== 'hull' || !object.geometry?.attributes?.position) return;
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    box.union(part.copy(object.geometry.boundingBox!).applyMatrix4(toRoot.multiplyMatrices(rootInv, object.matrixWorld)));
  });
  if (box.isEmpty()) return null;
  const length = box.max.z - box.min.z, cx = (box.min.x + box.max.x) * 0.5, mid = (box.min.z + box.max.z) * 0.5;
  // forward is +z: the ring a little ahead of the middle, the engine deck over the rear fifth
  return { deckY: box.max.y, hot: [cx, box.max.y, mid + 0.06 * length, cx, box.max.y, box.min.z + 0.2 * length] };
}

/** An integer lattice point's value in [0, 1) (a multiply-xorshift hash: a few integer operations, no sine). */
function latticeValue(x: number, y: number, z: number): number {
  let h = Math.imul(x, 0x8da6b343) ^ Math.imul(y, 0xd8163841) ^ Math.imul(z, 0xcb1ab31f);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/**
 * Smooth 3D value noise in [0, 1] (mean 0.5; a quarter of it past 0.6, one in twenty past 0.75): the lattice's values
 * blended by a smoothstep, so a feature is as large as a lattice cell whatever the triangles under it. (The old fields
 * were per-corner white noise: on the bake's bisected plates a dark or bright corner lit the eight triangles round it,
 * and the paint drew the bisection's diagonals.)
 */
function valueNoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const a = latticeValue(xi, yi, zi), b = latticeValue(xi + 1, yi, zi), c = latticeValue(xi, yi + 1, zi);
  const d = latticeValue(xi + 1, yi + 1, zi), e = latticeValue(xi, yi, zi + 1), f = latticeValue(xi + 1, yi, zi + 1);
  const g = latticeValue(xi, yi + 1, zi + 1), h = latticeValue(xi + 1, yi + 1, zi + 1);
  const ab = a + (b - a) * u, cd = c + (d - c) * u, ef = e + (f - e) * u, gh = g + (h - g) * u;
  const near = ab + (cd - ab) * v, far = ef + (gh - ef) * v;
  return near + (far - near) * w;
}

function smoothRamp(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function wreckVertexColor(
  px: number,
  py: number,
  pz: number,
  up: number,
  rustPhase: number,
  remnant: readonly [number, number, number] | null,
  frame: WreckPaintFrame | null,
  color: [number, number, number],
): readonly [number, number, number] {
  // a hair of panel drift in metre cells (subtle: never a pattern of its own)
  const panel = hash3(
    Math.round(px * 0.9) * 0.5,
    Math.round(py * 0.9) * 0.5,
    Math.round(pz * 0.9) * 0.5,
  );
  const mottle = valueNoise(px * 1.15 + rustPhase, py * 1.15, pz * 1.15 - rustPhase);
  const level = 0.046 + mottle * 0.026 + panel * 0.004 + up * up * 0.020;
  let r = level * 1.05, g = level, b = level * 0.93;
  const mix = (target: readonly [number, number, number], t: number) => {
    r += (target[0] - r) * t; g += (target[1] - g) * t; b += (target[2] - b) * t;
  };
  // heat oxide in broad blotches down the flanks (less on the faces the sky sees)
  const oxide = valueNoise(px * 0.8 - rustPhase * 0.5, py * 0.8 + 3.1, pz * 0.8 + rustPhase * 0.5);
  if (oxide > 0.42) mix(WRECK_OXIDE, smoothRamp(0.42, 0.75, oxide) * 0.85 * (1 - up * 0.6));
  // rust blooms where the water stood and ran: coherent patches on the flanks, more of them low down, muted
  const bloom = valueNoise(px * 1.4 + 7.7 + rustPhase, py * 1.6, pz * 1.4 - rustPhase);
  if (bloom > 0.56 && up < 0.85) mix(WRECK_RUST, smoothRamp(0.56, 0.74, bloom) * 0.85 * (1 - up) * (py < 1.6 ? 1 : 0.6));
  // the paint it wore, surviving in patches low on the flanks where the fire ran thinnest
  if (remnant && up < 0.55 && py < 1.35) {
    const keep = valueNoise(px * 1.7 + rustPhase * 0.37 + 5.1, py * 1.7, pz * 1.7);
    const low = py < 0.9 ? 1 : (1.35 - py) / 0.45;
    if (keep > 0.5) mix(remnant, Math.min(1, ((keep - 0.5) / 0.3)) * 0.9 * low);
  }
  let soot = 0;
  if (frame) {
    // the fire's heat: the nearest hot spot (a little flattened: the fire spread along the deck), its rim broken up
    let d2 = Infinity;
    for (let i = 0; i < frame.hot.length; i += 3) {
      const dx = px - frame.hot[i], dy = (py - frame.hot[i + 1]) * 1.3, dz = pz - frame.hot[i + 2];
      d2 = Math.min(d2, dx * dx + dy * dy + dz * dz);
    }
    const d = Math.sqrt(d2) + (valueNoise(px * 2.1 - rustPhase, py * 2.1, pz * 2.1 + 4.4) - 0.5) * 0.6;
    const heat = 1 - smoothRamp(0.35, 1.7, d);
    if (heat > 0) {
      mix(WRECK_TEMPER, heat * (1 - heat) * 4 * 0.4);
      mix(WRECK_HEAT, heat * heat * 0.8);
    }
    // soot: climbing round the hot spots (thinner on the hottest steel, burnt clean), and run over the deck's edges
    // down the top of the flanks and up the turret's skirt
    const round = (1 - smoothRamp(0.6, 2.3, d)) * (1 - heat * 0.7);
    const edge = up < 0.5
      ? smoothRamp(frame.deckY - 1.0, frame.deckY - 0.05, py) * (1 - 0.5 * smoothRamp(frame.deckY + 0.05, frame.deckY + 0.9, py))
      : 0;
    soot = Math.max(round * 0.85, edge * 0.65);
  }
  // burnt-off paint gone to grey ash on the roof and deck
  if (up > 0.7 && py > 1.2) {
    const ash = valueNoise(px * 1.8 + rustPhase * 0.53 + 9.7, py * 1.8, pz * 1.8);
    if (ash > 0.5) mix(WRECK_ASH, smoothRamp(0.5, 0.8, ash) * 0.55 * (up - 0.7) / 0.3);
  }
  if (soot > 0) {
    const k = 1 - 0.5 * soot * (0.55 + 0.45 * valueNoise(px * 1.3 + 11, py * 1.3, pz * 1.3 - rustPhase));
    r *= k; g *= k; b *= k;
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
  frame: WreckPaintFrame | null = null,
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
      frame,
      scratchColor,
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
): WreckBake {
  merged.computeBoundingBox();
  const bounds = merged.boundingBox;
  if (!bounds) throw new Error('wreck bounds unavailable');
  const baseY = bounds.min.y;
  for (const solid of solids) for (let i = 1; i < solid.length; i += 3) solid[i] -= baseY;
  for (const solid of shellSolids ?? []) for (let i = 1; i < solid.length; i += 3) solid[i] -= baseY;
  merged.translate(0, -bounds.min.y, 0);
  shadowGeo?.translate(0, -bounds.min.y, 0);
  return {
    solids,
    ...(shellSolids ? { shellSolids } : {}),
    geo: merged,
    shadowGeo,
    hx: (bounds.max.x - bounds.min.x) / 2,
    hz: (bounds.max.z - bounds.min.z) / 2,
    h: bounds.max.y - bounds.min.y,
    tris: ((merged.index?.count ?? merged.attributes.position.count) / 3) | 0,
  };
}

/**
 * Build one roster tank as a settled, burnt wreck and bake it to a single
 * static geometry (position/normal/color, base at y=0, XZ centered on the
 * hull origin, facing local +z like the live tank).
 *
 * @param {object} engineCtx EngineCtx (ARCHITECTURE §2.8)
 * @param {string} specId roster vehicle id ('kv2', 'm1a2', ...)
 * @param {{seed?: number, pop?: boolean}} [opts] pop=true = ammo-rack wreck
 *   (turret tossed beside the ring), else unseated-askew turret
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
    // settled wreck pose through the factory's own machinery: ageS far past
    // every timeline => turret settled (popped beside the ring or unseated
    // askew), gun drooped, burn timeline fully aged.
    visual.setDestroyed({ pop: !!opts.pop, ageS: 1000 });
    const root = visual.root;
    root.updateMatrixWorld(true);
    const solids = collectWreckSolids(root);
    const shellSolids = collectWreckShellSolids(root);
    const rootInv = root.matrixWorld.clone().invert();
    // the metal deformed (the owner, 2026-10-09: "crumpled not just turn rusty"): dents, sagging fenders, hanging
    // skirts, a slack track, a bent barrel — planned from the posed hierarchy on the wreck's own seed, applied part by
    // part as the bake collects it; the solids above are the posed hierarchy's, so collision does not move
    const crumple = planWreckCrumple(root, seed, !!opts.pop);
    const paintFrame = wreckPaintFrame(root, rootInv);
    yield { fine: true, stage: 'construct' };
    const { geos, proxyGeos } = yield* collectWreckGeometrySteps(root, rootInv, owner, crumple);
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
    yield* paintWreckGeometrySteps(merged, rustPhase, remnantLinear(opts.remnant), paintFrame);
    if (!preparedForPaint) yield* compactWreckGeometrySteps(merged);
    const shadowGeo = yield* mergeShadowGeometrySteps(proxyGeos, owner);
    const result = wreckBakeResult(merged, shadowGeo, solids, shellSolids);
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
 * Public-roster wreck pools. Saved/hidden builder donors are not eligible;
 * only the selected public vehicle's procedural family is demand-loaded.
 * @param {string} era canonical vehicle era
 * @returns {string[]}
 */
export function wreckPool(era: string): string[] {
  return resolveWreckRoster(era);
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

function debrisBaseColor(
  family: DebrisFamily,
  rust: boolean,
): readonly [number, number, number] {
  // (destruction core, 2026-10-10, wave 350: "bright terracotta plates that look more like bricks than steel") a shed
  // plate's rust is the hull's own muted rust (WRECK_RUST's tone, a shade darker), not a brick's orange
  if (rust) return [0.108, 0.052, 0.029];
  if (family === 'rubber') return [0.028, 0.026, 0.024];
  return [0.064, 0.057, 0.051];
}

function appendColoredDebris(
  geometry: THREE.BufferGeometry,
  family: DebrisFamily,
  rng: () => number,
  parts: THREE.BufferGeometry[],
): void {
  const normalized = normalizeGeometry(geometry, true);
  const colors = new Float32Array(normalized.attributes.position.count * 3);
  for (let i = 0; i < normalized.attributes.position.count; i++) {
    const grain = 0.78 + rng() * 0.38;
    const rust = family === 'rust' || (family === 'char' && rng() < 0.12);
    const base = debrisBaseColor(family, rust);
    colors[i * 3] = base[0] * grain;
    colors[i * 3 + 1] = base[1] * grain;
    colors[i * 3 + 2] = base[2] * grain;
  }
  normalized.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  parts.push(normalized);
}

function appendTornTrackRun(
  side: number,
  modern: boolean,
  rng: () => number,
  parts: THREE.BufferGeometry[],
): void {
  const count = (modern ? 10 : 8) + ((rng() * 5) | 0);
  const startX = side * (modern ? 2.05 : 1.65);
  const startZ = (rng() - 0.5) * 2.2;
  const direction = (side > 0 ? 0.45 : Math.PI + 0.45) + (rng() - 0.5) * 1.2;
  for (let i = 0; i < count; i++) {
    if (i > 2 && rng() < 0.16) continue;
    const distance = i * (modern ? 0.48 : 0.42);
    const x = startX + Math.sin(direction) * distance + Math.sin(i * 0.8) * 0.16;
    const z = startZ + Math.cos(direction) * distance + Math.cos(i * 0.63) * 0.14;
    const pad = new THREE.BoxGeometry(modern ? 0.50 : 0.43, 0.09, modern ? 0.31 : 0.27);
    pad.rotateY(direction + (rng() - 0.5) * 0.36);
    pad.rotateX((rng() - 0.5) * 0.22);
    pad.rotateZ((rng() - 0.5) * 0.18);
    pad.translate(x, 0.07 + rng() * 0.05, z);
    appendColoredDebris(pad, i % 5 === 0 ? 'rust' : 'char', rng, parts);
  }
}

function appendDetachedWheel(
  modern: boolean,
  rng: () => number,
  parts: THREE.BufferGeometry[],
): void {
  const radius = (modern ? 0.34 : 0.29) + rng() * 0.12;
  const width = 0.18 + rng() * 0.10;
  const wheel = new THREE.CylinderGeometry(radius, radius, width, 10, 1);
  // (destruction core, 2026-10-10, wave 350: "a shed road wheel stands balanced upright on its rim") a shed wheel lies
  // flat, or leans 10-30 degrees on its hub's stub or the litter under it, seated on its lowest rim point — never stood
  // on its rim. Wheel and hub share one tilt and one heading.
  const lean = rng() < 0.45 ? 0.17 + rng() * 0.35 : (rng() - 0.5) * 0.12;
  const heading = rng() * Math.PI;
  wheel.rotateZ(lean);
  wheel.rotateY(heading);
  const angle = rng() * Math.PI * 2;
  const distance = 2.7 + rng() * 3.2;
  const x = Math.sin(angle) * distance;
  const z = Math.cos(angle) * distance;
  const seat = Math.abs(Math.sin(lean)) * radius + Math.cos(lean) * width * 0.5;
  wheel.translate(x, seat, z);
  appendColoredDebris(wheel, 'rubber', rng, parts);

  const hub = new THREE.CylinderGeometry(radius * 0.36, radius * 0.36, width + 0.025, 9, 1);
  hub.rotateZ(lean);
  hub.rotateY(heading);
  hub.translate(x, seat, z);
  appendColoredDebris(hub, 'rust', rng, parts);
}

function appendArmorPanel(rng: () => number, parts: THREE.BufferGeometry[]): void {
  const width = 0.45 + rng() * 0.75;
  const depth = 0.28 + rng() * 0.58;
  const panel = new THREE.BoxGeometry(width, 0.045 + rng() * 0.045, depth);
  panel.rotateX((rng() - 0.5) * 0.45);
  panel.rotateY(rng() * Math.PI);
  panel.rotateZ((rng() - 0.5) * 0.32);
  const angle = rng() * Math.PI * 2;
  const distance = 2.0 + rng() * 4.0;
  panel.translate(
    Math.sin(angle) * distance,
    0.08 + rng() * 0.12,
    Math.cos(angle) * distance,
  );
  appendColoredDebris(panel, rng() < 0.2 ? 'rust' : 'char', rng, parts);
}

/**
 * Build lightweight local-space battlefield debris for a baked tank wreck:
 * torn track-pad runs, detached road wheels, armor panels and tow-cable scrap.
 * All pieces merge into the wreck mesh (zero extra draw calls / idle work).
 * The exact vehicle silhouette and any popped turret still come from
 * bakeTankWreck; these are the missing secondary destruction cues around it.
 *
 * @param {number} seed
 * @param {{modern?:boolean}} [opts]
 * @returns {{geo:THREE.BufferGeometry,tris:number}}
 */
export function bakeWreckDebris(
  seed: number,
  opts: { modern?: boolean } = {},
): { geo: THREE.BufferGeometry; tris: number } {
  const rng = mulberry32((seed ^ 0x71ac5eed) >>> 0);
  const modern = opts.modern !== false;
  const parts: THREE.BufferGeometry[] = [];

  // Two visibly torn track runs: irregular pads snake away from opposite hull
  // corners, with gaps and flipped shoes instead of intact ribbon geometry.
  for (const side of [-1, 1]) {
    appendTornTrackRun(side, modern, rng, parts);
  }

  // Detached road wheels: flat or leaning discs.
  const wheelCount = (modern ? 4 : 3) + ((rng() * 3) | 0);
  for (let i = 0; i < wheelCount; i++) {
    appendDetachedWheel(modern, rng, parts);
  }

  // Armor skirts, grilles and stowage panels thrown beyond the burn scar.
  const panelCount = 4 + ((rng() * 4) | 0);
  for (let i = 0; i < panelCount; i++) {
    appendArmorPanel(rng, parts);
  }

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('wreck debris merge failed');
  const tris = (merged.attributes.position.count / 3) | 0;
  for (const g of parts) g.dispose();
  return { geo: merged, tris };
}
