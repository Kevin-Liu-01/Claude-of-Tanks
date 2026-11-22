/**
 * ringZoneGuard.ts — the hull kit that stands over the turret's foot round its ring (274, turret-deck-gate; the owner on
 * the Leopard 2 prototype: "turret looks like its glitching into hull": fender bins taller than the turret's foot hid
 * the ring from the side).
 *
 * Copyright © 2026 Kevin B. Liu. Created, designed and directed by Kevin B. Liu; first-party Reserved Content
 * (LicenseRef-Claude-of-Tanks-Proprietary-Content-1.0, LICENSE-POLICY.md, NOTICE.md). Claude was a development tool for
 * this file, not an author. provenance: urn:claude-of-tanks:vehicle-helper:ring-zone-guard.
 *
 * The factory's hull kit entry points (P.addEquipment, P.addHatch, P.addExternalArmor) hand each part they place here.
 * On a geometry-receipt build, after the turret is seated (turretSeatRace.ts), a part whose plan box reaches into the
 * annulus RING_ZONE_MARGIN_M outside the turret's foot (per bearing, measureTurretFootline) and whose top stands more than
 * RING_ZONE_RISE_M over the foot there is recorded on `hullG.userData.ringZoneViolations`. The guard never moves
 * geometry: the fix is at the placing code. src/vehicles/turretDeckAudit.test-support.mjs gates the same rule on the
 * drawn hull, all of it, and names these parts in its rows. A hull whose real vehicle does stand that high beside its
 * turret (its own deck, a fender box) is exempt by name in RING_ZONE_EXEMPT, with the photo that shows it and the most
 * it may rise.
 */
import * as THREE from 'three';
import { combatAnatomyCalibration } from './combatAnatomyCalibrationRegistry.ts';
import { measureTurretFootline } from './turretSeatRace.ts';

/** How far outside the turret's foot a hull part is read, and how far over the foot it may stand (m). */
export const RING_ZONE_MARGIN_M = 0.30;
export const RING_ZONE_RISE_M = 0.02;
const RING_ZONE_STEP_M = 0.05;

/** A hull part one of the guarded entry points placed: its bucket and its plan box, read before the buckets merge. */
export interface RingZonePart {
  readonly bucket: string;
  readonly box: THREE.Box3;
}

export interface RingZoneViolation {
  readonly bucket: string;
  /** The part's box centre (rig_hull frame), the bearing it is caught on (deg; 0 front, 90 the vehicle's left), how far
   *  outside the foot, and how far its top stands over the foot there (m). */
  readonly at: readonly [number, number, number];
  readonly bearingDeg: number;
  readonly outM: number;
  readonly riseM: number;
}

/** Hulls the photos show standing over the turret's foot (turret-deck-gate-274 FINAL-PLAN §4; coordinator 2026-11-21):
 *  the reason, and the most any hull top may rise over the foot within the margin (m): the measured rise plus 1 cm. */
export const RING_ZONE_EXEMPT: Readonly<Record<string, { readonly reason: string; readonly riseM: number }>> = Object.freeze({
  m48a3_patton: { reason: 'fender air cleaners stand level with the bustle edge (m48a3 side and rear three-quarter photos)', riseM: 0.048 },
  m48a5_patton: { reason: 'left fender boxes and fittings level with the bustle edge (m48a3 side photo)', riseM: 0.032 },
  magach3: { reason: 'rear fender box and lifting eyes level with the bustle edge (magach side and rear three-quarter photos)', riseM: 0.031 },
  bwp1: { reason: "the hull commander's cupola stands well above the low turret (bwp1 front three-quarter photo)", riseM: 0.121 },
  bmp2: { reason: 'small roof fittings reach about the turret rim (bmp2 front three-quarter photo)', riseM: 0.046 },
  bmp3: { reason: 'the raised rear roof box stands above the turret edge (bmp3 rear three-quarter photo)', riseM: 0.047 },
  bmp3_rok: { reason: 'the raised rear roof box stands above the turret edge (bmp3_rok rear three-quarter photo)', riseM: 0.047 },
  ua_cv9040c: { reason: 'the tarp over its frame is heaped to turret-roof height (ua_cv9040c side photo)', riseM: 0.203 },
  pgz95: { reason: "the commander's raised block with its vision blocks stands tight against the turret front, over its low foot (twin-aa-268 pgz95 Beijing Museum photos)", riseM: 0.245 },
  t64bm1m: { reason: "the shelf fuel tanks and SPTA boxes (0.19-0.21 m) are the T-64's own rear-quarter stop, kept by the 262 lane (docs/references/tanks/t64bm1m.md); no photo on disk", riseM: 0.144 },
  pt64_tur: { reason: "the T-64 shelf fuel tanks and SPTA boxes, the rear-quarter stop kept by the 262 lane (docs/references/tanks/t64bm1m.md)", riseM: 0.092 },
  t64b1v_2022: { reason: "the T-64 shelf boxes beside the mod. 2022 turret slat cage's low rail (docs/references/tanks/t64bm1m.md)", riseM: 0.073 },
  object195: { reason: "the hull's collar round the turret foot is built on purpose (as designed; no clear photo)", riseM: 0.04 },
});

/** The part's plan box in the hull frame (the buckets' frame), read where the guarded entry points hand it over. */
export function ringZonePart(bucket: string, part: THREE.BufferGeometry): RingZonePart {
  if (!part.boundingBox) part.computeBoundingBox();
  return { bucket, box: part.boundingBox!.clone() };
}

const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/** The guarded parts standing over the seated turret's foot (see the header), worst per part. */
export function ringZoneViolations({ specId, hullG, turretG, gunG, parts }: {
  specId: string; hullG: THREE.Object3D; turretG: THREE.Object3D; gunG: THREE.Object3D | null; parts: readonly RingZonePart[];
}): RingZoneViolation[] {
  const receipt = combatAnatomyCalibration(specId)?.turretRing;
  if (!receipt || !parts.length) return [];
  turretG.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  turretG.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || !mesh.geometry?.getAttribute('position')) return;
    for (let o: THREE.Object3D | null = mesh; o; o = o.parent) if (o === gunG) return;
    meshes.push(mesh);
  });
  const { cx, cz, footR, footY } = measureTurretFootline(meshes, hullG, receipt, true);
  if (!footY) return [];
  let lowest = Infinity;
  for (const y of footY) lowest = Math.min(lowest, y);
  const bins = footR.length, out: RingZoneViolation[] = [];
  for (const { bucket, box } of parts) {
    if (box.max.y <= lowest + RING_ZONE_RISE_M) continue;
    let worst: RingZoneViolation | null = null;
    for (let k = 0; k < bins; k++) {
      if (!(footR[k] > 0) || !Number.isFinite(footY[k])) continue;
      const rise = box.max.y - footY[k];
      if (rise <= RING_ZONE_RISE_M || (worst && rise <= worst.riseM)) continue;
      const a = ((k + 0.5) / bins) * Math.PI * 2, sx = Math.sin(a), sz = Math.cos(a);
      for (let d = RING_ZONE_STEP_M / 2; d <= RING_ZONE_MARGIN_M; d += RING_ZONE_STEP_M) {
        const x = cx + sx * (footR[k] + d), z = cz + sz * (footR[k] + d);
        if (x < box.min.x || x > box.max.x || z < box.min.z || z > box.max.z) continue;
        const c = box.getCenter(new THREE.Vector3());
        worst = { bucket, at: [round3(c.x), round3(c.y), round3(c.z)], bearingDeg: Math.round(THREE.MathUtils.radToDeg(a)) % 360,
          outM: round3(d), riseM: round3(rise) };
        break;
      }
    }
    if (worst) out.push(worst);
  }
  return out.sort((p, q) => q.riseM - p.riseM);
}
