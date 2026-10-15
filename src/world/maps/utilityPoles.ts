// src/world/maps/utilityPoles.ts — the roadside utility line's geometry (props lane A, family #21, 2026-10-14: extracted
// from props.ts placeRoadsideUtilities unchanged — the sourced pole's prepared geometry, the procedural pole's parts and
// the wires' ribbon pool — so the family owns them; props.ts keeps the stations, the line's network, its crushables, the
// pole pool's material and the felled poles (Lane C's seat passes read them in flight), and calls these where the
// geometry always was built).
import * as THREE from 'three';
import { markPoleTimber, roundPoleShaft } from '../poleTimber.ts';
import { box, scaleUV } from '../propGeometry.ts';
import type { UtilityNetwork } from '../utilityNetwork.ts';

/** props.ts bakedGeometry: a sourced model, baked and cached by its options. */
type BakedSource = (name: string, opts: { targetH: number; sink: number; sourceZMin: number; whiteCap: readonly [number, number, number] }) => THREE.BufferGeometry;

/**
 * The sourced pole (telephone_pole_polygoogle) for the line's pool: the cached bake cloned, its shaft made round and its
 * wood marked for the poles' timber material (poleTimber.ts).
 */
export function sourcedPoleGeometry(bakedGeometry: BakedSource): THREE.BufferGeometry {
  // the scenery lane (after wave 57, Frosthollow's "beige column"): its wood is marked for the poles' timber material
  // (poleTimber.ts) on a clone — the baked source stays cached unmarked; wave 66 ("a straight, flat-faced,
  // constant-width beam"): its shaft round, smooth and tapered first
  return markPoleTimber(roundPoleShaft(bakedGeometry('telephone_pole_polygoogle',
    {
      targetH: 7.4, sink: 0.15, sourceZMin: -1,
      whiteCap: [0.14, 0.21, 0.16],
    }).clone()));
}

/** The procedural pole (no sourced models): its tapered shaft, two crossarms with their pegs and a brace, for the wood
 *  bucket, at the station's post and yaw. */
export function proceduralPoleParts(post: { x: number; y: number; z: number }, yaw: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const pole = new THREE.CylinderGeometry(0.09, 0.17, 6.2, 7, 1);
  scaleUV(pole, 0.8, 3.0);
  pole.translate(post.x, post.y + 3.0, post.z);
  out.push(pole);
  for (const armY of [5.75, 5.15]) {
    const arm = box(1.5, 0.11, 0.09, 1.0);
    arm.rotateY(yaw);
    arm.translate(post.x, post.y + armY, post.z);
    out.push(arm);
    for (const side of [-1, 1]) {
      const peg = box(0.07, 0.16, 0.07, 2.0);
      peg.rotateY(yaw);
      peg.translate(post.x + Math.cos(yaw) * 0.6 * side,
        post.y + armY + 0.13, post.z - Math.sin(yaw) * 0.6 * side);
      out.push(peg);
    }
  }
  const brace = box(0.06, 1.1, 0.06, 1.5);
  brace.rotateZ(0.6);
  brace.rotateY(yaw);
  brace.translate(post.x + Math.cos(yaw) * 0.26,
    post.y + 4.8, post.z - Math.sin(yaw) * 0.26);
  out.push(brace);
  return out;
}

/** The line's wires: one instanced ribbon pool, a thin cylinder per catenary segment of each side's conductor. */
export interface UtilityWires {
  readonly mesh: THREE.InstancedMesh;
  /** Re-lay the given spans (a pole fell or stood up again), or every span. */
  rebuild(indices?: readonly number[] | null): void;
}
/** The wires of the line (null: no spans), added to `group`, every span laid. */
export function createUtilityWires(network: UtilityNetwork | null, material: THREE.Material, group: THREE.Group): UtilityWires | null {
  if (!network?.instanceCount) return null;
  const points = new Float64Array((network.segments + 1) * 3);
  const _wireA = new THREE.Vector3(), _wireB = new THREE.Vector3();
  const _wireMid = new THREE.Vector3(), _wireDir = new THREE.Vector3();
  const _wireUp = new THREE.Vector3(0, 1, 0), _wireScale = new THREE.Vector3();
  const _wireQuat = new THREE.Quaternion(), _wireMatrix = new THREE.Matrix4();
  const wireGeo = new THREE.CylinderGeometry(1, 1, 1, 4, 1);
  const wireIM = new THREE.InstancedMesh(wireGeo, material, network.instanceCount);
  wireIM.name = 'utility-wires';
  wireIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  wireIM.castShadow = false;
  wireIM.receiveShadow = false;
  wireIM.frustumCulled = false;
  wireIM.matrixAutoUpdate = false;
  group.add(wireIM);
  function writeWireSpan(spanIndex: number): void {
    for (let side = 0; side < 2; side++) {
      network!.writeSpanPoints(spanIndex, side, points);
      for (let seg = 0; seg < network!.segments; seg++) {
        const a = seg * 3, b = a + 3;
        _wireA.set(points[a], points[a + 1], points[a + 2]);
        _wireB.set(points[b], points[b + 1], points[b + 2]);
        _wireDir.subVectors(_wireB, _wireA);
        const len = _wireDir.length();
        if (len < 1e-5) continue;
        _wireQuat.setFromUnitVectors(_wireUp, _wireDir.multiplyScalar(1 / len));
        _wireMid.addVectors(_wireA, _wireB).multiplyScalar(0.5);
        _wireScale.set(0.020, len * 1.02, 0.020);
        _wireMatrix.compose(_wireMid, _wireQuat, _wireScale);
        wireIM.setMatrixAt(network!.instanceIndex(spanIndex, side, seg), _wireMatrix);
      }
    }
  }
  const wires: UtilityWires = {
    mesh: wireIM,
    rebuild(indices = null) {
      if (indices) {
        for (const spanIndex of indices) writeWireSpan(spanIndex);
      } else {
        for (let i = 0; i < network.spans.length; i++) writeWireSpan(i);
      }
      wireIM.instanceMatrix.needsUpdate = true;
    },
  };
  wires.rebuild();
  return wires;
}
