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
    for (const [key, list] of Object.entries(parts)) {
      if (!Array.isArray(list)) continue;
      for (const geometry of list as THREE.BufferGeometry[]) {
        geometry.applyMatrix4(matrix);
        triangles += (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;
        (buckets[key] ||= []).push(geometry);
      }
    }
    pieces.push({
      kind: placement.kind, name: placement.name ?? null,
      bearingDeg: Number(((Math.atan2(dx, dz) * 180 / Math.PI + 360) % 360).toFixed(1)),
      distM: Math.round(distM), ringM: Number(ringM.toFixed(1)), scale: Number(scale.toFixed(3)), triangles,
    });
    yield undefined;
  }
  return pieces;
}
