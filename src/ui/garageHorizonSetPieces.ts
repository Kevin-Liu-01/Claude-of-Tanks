// src/ui/garageHorizonSetPieces.ts — a Garage's map set pieces on its horizon (garage-env-276).
//
// A battlefield's set pieces (src/world/landmarks: its church, gates, harbour, bungalow ...) are authored in its map file
// (props.landmarks). The Garage stands at its map's anchor (the terrain patch's source centre), so each piece is built
// as the world build builds it (buildLandmarkPiece: its builder on its own streams, the map kit's weathering, the
// phone's fine joinery left out) and stood on the Garage's horizon ring the way the skyline stands its landmarks: at its
// true compass bearing, its distance compressed onto the ring (garageSkyline.ts ringRadius), its angular size kept (a
// uniform scale of ring radius over true distance). The Garage frame is the map frame about the anchor (+x east,
// +z north), so the bearing and the piece's own heading carry over unchanged. Its parts join the pack's structure
// buckets and draw under the map's battlefield materials; nothing here has collision or a runtime.
import * as THREE from 'three';
import { buildLandmarkPiece } from '../world/landmarks/compose.ts';
import { LANDMARK_BUILDERS } from '../world/landmarks/index.ts';
import { LANDMARK_KINDS, isDressingPiece, resolveLandmarkParams } from '../world/landmarks/plan.ts';
import type { LandmarkPlacement } from '../world/landmarks/types.ts';
import type { GeometryBuckets } from '../world/maps/exteriorDetailKit.ts';
import { getDeviceTier } from '../engine/quality.ts';
import { GARAGE_PRESENTATION_POSE } from '../game/garagePresentationPose.ts';
import type { GarageMapStructures } from './garageBattleStructures.ts';
import { ringRadius } from './garageSkyline.ts';

/** Pieces nearer than this stand inside the yard's own buildings' ring: the Garage stages its own there. */
const NEAREST_M = 120;
/** Past this a piece is below a pixel at the ring (a 20 m tower at 1.6 km stands 0.7 degrees). */
const FARTHEST_M = 1600;
/** The foot of a horizon piece under the Garage datum, at its scale: it sits in the far ground, not on it. */
const FOOT_SINK_M = 0.6;

export interface GarageHorizonSetPiece {
  readonly kind: string;
  readonly name: string | null;
  readonly bearingDeg: number;
  readonly distM: number;
  readonly ringM: number;
  readonly scale: number;
  readonly triangles: number;
  /** Where it stands in the Garage frame, and the radius of its scaled footprint. */
  readonly x: number;
  readonly z: number;
  readonly footprintM: number;
  /** Its scaled bounds in the Garage frame. */
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

/**
 * Build the map's set pieces onto the horizon ring, into `buckets` (Garage frame), in slices (one piece a slice). The
 * map's kits must be loaded (loadGarageMapStructures loads its landmark builders with them).
 */
export function* buildGarageHorizonSetPieces(
  map: GarageMapStructures,
  anchor: readonly [number, number],
  buckets: GeometryBuckets,
): Generator<undefined, GarageHorizonSetPiece[], void> {
  const placements = ((map.cfg.props as { landmarks?: readonly LandmarkPlacement[] } | undefined)?.landmarks) ?? [];
  const pieces: GarageHorizonSetPiece[] = [];
  const tier = getDeviceTier() === 'mobile' ? 'mobile' : 'desktop';
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion();
  const scaleV = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (const placement of placements) {
    const spec = LANDMARK_KINDS[placement.kind], builder = LANDMARK_BUILDERS[placement.kind];
    // pavings, paths and a square's dressing are ground: they read as nothing at the ring
    if (!spec || !builder || spec.open || isDressingPiece(placement)) continue;
    const dx = placement.x - anchor[0], dz = placement.z - anchor[1], distM = Math.hypot(dx, dz);
    if (distM < NEAREST_M || distM > FARTHEST_M) continue;
    const ringM = ringRadius(distM), scale = ringM / distM;
    const { parts } = buildLandmarkPiece({
      mapId: map.mapId, seed: map.context.seed, tier, snowCap: map.context.snowCap, architecture: map.style,
      groundFall: 0, groundAt: () => 0, waterAt: () => 0,
    }, placement, resolveLandmarkParams(placement), builder);
    matrix.compose(position.set(dx * scale, -FOOT_SINK_M, dz * scale),
      rotation.setFromAxisAngle(up, (placement.yawDeg ?? 0) * Math.PI / 180), scaleV.setScalar(scale));
    let triangles = 0;
    const bounds = new THREE.Box3();
    for (const [key, list] of Object.entries(parts)) {
      if (!Array.isArray(list)) continue;
      for (const geometry of list as THREE.BufferGeometry[]) {
        geometry.applyMatrix4(matrix);
        triangles += (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;
        geometry.computeBoundingBox();
        if (geometry.boundingBox) bounds.union(geometry.boundingBox);
        (buckets[key] ||= []).push(geometry);
      }
    }
    const [hw, hl] = spec.footprint(resolveLandmarkParams(placement));
    pieces.push({
      kind: placement.kind, name: placement.name ?? null,
      bearingDeg: Number(((Math.atan2(dx, dz) * 180 / Math.PI + 360) % 360).toFixed(1)),
      distM: Math.round(distM), ringM: Number(ringM.toFixed(1)), scale: Number(scale.toFixed(3)), triangles,
      x: dx * scale, z: dz * scale, footprintM: Math.hypot(hw, hl) * scale,
      min: [bounds.min.x, bounds.min.y, bounds.min.z], max: [bounds.max.x, bounds.max.y, bounds.max.z],
    });
    yield undefined;
  }
  return pieces;
}

/** What a horizon piece must stand clear of in its Garage (Garage frame). */
export interface GarageHorizonScenery {
  /** The pack's structures: centre and footprint radius. */
  readonly structures: ReadonlyArray<{ readonly label: string; readonly x: number; readonly z: number; readonly radiusM: number }>;
  /** The tree groves' centres. */
  readonly trees: ReadonlyArray<{ readonly x: number; readonly z: number }>;
  /** The approach's centreline and its half width. */
  readonly route: ReadonlyArray<{ readonly x: number; readonly z: number }>;
  readonly routeHalfWidthM: number;
}

/** A grove's crown reach round its centre (three trees about 7 m apart). */
const GROVE_REACH_M = 4.5;
/** The hero's bounds on its turntable (heading 0: local +Z forward), generous for the longest hulls and guns. */
const HERO_BOX = new THREE.Box3(new THREE.Vector3(-2.1, 0, -6), new THREE.Vector3(2.1, 3.4, 6.5));

function segmentDistance(px: number, pz: number, a: { x: number; z: number }, b: { x: number; z: number }): number {
  const ux = b.x - a.x, uz = b.z - a.z, len2 = ux * ux + uz * uz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - a.x) * ux + (pz - a.z) * uz) / len2)) : 0;
  return Math.hypot(px - (a.x + ux * t), pz - (a.z + uz * t));
}

function screenRect(box: THREE.Box3, camera: THREE.PerspectiveCamera): THREE.Box2 | null {
  const rect = new THREE.Box2(), v = new THREE.Vector3(), view = new THREE.Vector3();
  for (let k = 0; k < 8; k += 1) {
    v.set(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z);
    view.copy(v).applyMatrix4(camera.matrixWorldInverse);
    if (view.z > -camera.near) return null; // behind the opening camera: not in its view
    v.project(camera);
    rect.expandByPoint(new THREE.Vector2(v.x, v.y));
  }
  return rect;
}

/**
 * The Garage quality rubric's two checks over the horizon pieces (garage-env-276): a piece whose footprint meets a
 * structure, a tree grove or the approach is a scenery overlap; a piece that stands nearer the opening camera than the
 * hero, or whose silhouette in the opening view meets the hero's (16:9, the widest stage), is a sightline intrusion.
 */
export function auditGarageHorizonSetPieces(
  pieces: readonly GarageHorizonSetPiece[],
  scenery: GarageHorizonScenery,
  aspect = 16 / 9,
): { overlaps: string[]; sightline: string[] } {
  const overlaps: string[] = [], sightline: string[] = [];
  const pose = GARAGE_PRESENTATION_POSE;
  const camera = new THREE.PerspectiveCamera(pose.cameraFovDeg, aspect, 0.1, 2000);
  camera.position.set(...pose.cameraOffsetM);
  camera.lookAt(0, pose.cameraLookHeightM, 0);
  camera.updateMatrixWorld(true);
  const hero = screenRect(HERO_BOX, camera)!;
  const cameraToHero = camera.position.length();
  for (const piece of pieces) {
    const label = piece.name ?? piece.kind;
    for (const structure of scenery.structures) {
      if (Math.hypot(piece.x - structure.x, piece.z - structure.z) < piece.footprintM + structure.radiusM) overlaps.push(`${label} meets ${structure.label}`);
    }
    if (scenery.trees.some((tree) => Math.hypot(piece.x - tree.x, piece.z - tree.z) < piece.footprintM + GROVE_REACH_M)) overlaps.push(`${label} meets a tree grove`);
    for (let k = 1; k < scenery.route.length; k += 1) {
      if (segmentDistance(piece.x, piece.z, scenery.route[k - 1], scenery.route[k]) < piece.footprintM + scenery.routeHalfWidthM) {
        overlaps.push(`${label} meets the approach`); break;
      }
    }
    const box = new THREE.Box3(new THREE.Vector3(...piece.min), new THREE.Vector3(...piece.max));
    if (box.distanceToPoint(camera.position) < cameraToHero) { sightline.push(`${label} stands nearer than the hero`); continue; }
    const rect = screenRect(box, camera);
    if (rect && rect.intersectsBox(hero)) sightline.push(`${label} stands behind the hero in the opening view`);
  }
  return { overlaps, sightline };
}
