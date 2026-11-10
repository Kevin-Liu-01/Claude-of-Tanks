// stowageRacks.ts — the stowage racks a mission seat keeps off (round 270, lane abrams-bradley). Main, 2026-11-06, on the
// M2A2 whose regenerated drone-dock seat stood over its bustle rack and turned the rack's duffel away: "move the
// drone-dock seat off the bustle rack and keep the duffel. The rack and its load are the real vehicle's stowage; the dock
// is a mission add-on, so it finds clear deck. Add a decor control that fails if a mission seat overlaps a stowage rack."
//
// One source, three readers:
// - decorations.ts loads these racks (LIVED_IN_ROWS: the M1A1 and tejas bustle racks, every Bradley turret's rack) from
//   the footprints here;
// - tools/gen-mission-attachment-seats.mjs treats every rack's volume as occupied when it seats the drone dock;
// - src/vehicles/stowageRackSeats.selftest.mjs fails when a seat record's keep-out boxes enter a rack's volume.
// A rack is either one the lived-in decor loads (LIVED_IN_RACKS, frame coordinates) or one a builder publishes: a
// KIT.fittings.stowageRack fitting (its root's userData.rackEnvelope), found on the built tank (publishedStowageRacks).
// A rack's volume is its footprint from its floor to its rails plus RACK_LOAD_HEAD, the load a full rack carries over its
// rails. A leaf: three and the dock's certified volumes only, so the decor path (the garage boot) can read it.
import * as THREE from 'three';
import type { MissionAttachment } from '../sim/missionAttachment.ts';
import { missionAirframeVolumes, missionCradleVolumes } from '../sim/missionDockVolumes.ts';

export type RackFrame = 'hull' | 'turret';
/** A stowage rack in its frame's own coordinates: its footprint (x0..x1, z0..z1), its floor and its rails' top (edge). */
export interface StowageRack {
  readonly frame: RackFrame;
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
  readonly floor: number;
  readonly edge: number;
}

/** How high a full rack's load stands over its rails (m): the M1A1 rack's crew load stands 10-35 cm over them
 *  (decorations.ts M1A1_RACK), the M2A2's long duffel 31 cm over the bags it is lashed onto. */
export const RACK_LOAD_HEAD = 0.35;
/** Clearance kept round the drone dock's certified volumes (m); decorations.ts dockKeepOut keeps the decor this far off. */
export const DOCK_KEEP_OUT_CLEAR = 0.03;

const rack = (x0: number, x1: number, z0: number, z1: number, floor: number, edge: number): StowageRack =>
  Object.freeze({ frame: 'turret', x0, x1, z0, z1, floor, edge });
/** The bustle rack on the owner's M1A1 turret (profiles/abrams.ts m1a1Source): inner faces x +-1.355, its front at the rear
 *  face z -2.60, 0.34 m deep, the open mesh floor at 0.29, the rails at 0.66. */
export const M1A1_BUSTLE_RACK = rack(-1.355, 1.355, -2.94, -2.6, 0.29, 0.66);
/** The tejas-family bustle rack (m1a1_abrams_hc, m1a1_abrams_fep): x +-1.07, z -2.98..-2.60, floor 0.32, rails 0.84. */
export const TEJAS_BUSTLE_RACK = rack(-1.07, 1.07, -2.98, -2.6, 0.32, 0.84);
/** Each vehicle's racks the lived-in decor loads (decorations.ts LIVED_IN_ROWS reads its Bradley racks from here). */
export const LIVED_IN_RACKS: Readonly<Record<string, readonly StowageRack[]>> = Object.freeze({
  m1a1: [M1A1_BUSTLE_RACK],
  m1a1_abrams_sa: [M1A1_BUSTLE_RACK],
  m1a1_abrams_aim: [M1A1_BUSTLE_RACK],
  m1a1_abrams_hc: [TEJAS_BUSTLE_RACK],
  m1a1_abrams_fep: [TEJAS_BUSTLE_RACK],
  // the classic turret's bustle rack, its bags to 0.55
  m2a2_bradley: [rack(-0.62, 0.3, -1.3, -0.98, 0.45, 0.55)],
  // the source-measured turret's rack, its bags to 0.62
  m3a2_bradley: [rack(-0.4, 0.2, -1.52, -1.28, 0.47, 0.62)],
  // the 269 M3A3 turret's open rack on its bustle box's lid (bradleyA3Turret.ts BRADLEY_A3_BUSTLE)
  m3a3_bradley: [rack(-0.62, 0.48, -1.62, -1.24, 0.55, 0.83)],
  ua_m2a3_bradley: [rack(-0.4, 0.62, -1.6, -1.28, 0.46, 0.6)],
  // the crew's bags across the turret's rear
  m6_linebacker: [rack(-0.3, 0.74, -1.76, -1.6, 0.5, 0.6)],
});

/** The racks a built tank's builders published: every KIT.fittings.stowageRack root, measured in its frame (the turret's
 *  rig or the hull root, unscaled, as the seat generator's stock is), its floor at its lowest point and its rails
 *  rackEnvelope.heightM over it. */
export function publishedStowageRacks(root: THREE.Object3D): StowageRack[] {
  root.updateMatrixWorld(true);
  const turret = root.getObjectByName('rig_turret');
  const frameInverse = (owner: THREE.Object3D): THREE.Matrix4 => new THREE.Matrix4().copy(owner.matrixWorld)
    .scale(new THREE.Vector3(1 / owner.scale.x, 1 / owner.scale.y, 1 / owner.scale.z)).invert();
  const out: StowageRack[] = [];
  root.traverse((fitting) => {
    const envelope = fitting.userData?.rackEnvelope as { heightM?: number } | undefined;
    if (fitting.userData?.fitting !== 'stowageRack' || !envelope || !Number.isFinite(envelope.heightM)) return;
    let onTurret = false;
    for (let p: THREE.Object3D | null = fitting; p && p !== root; p = p.parent) if (p === turret) onTurret = true;
    const inverse = frameInverse(onTurret ? turret! : root), box = new THREE.Box3(), part = new THREE.Box3();
    fitting.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      box.union(part.copy(mesh.geometry.boundingBox!).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld)));
    });
    if (box.isEmpty()) return;
    out.push(Object.freeze({ frame: onTurret ? 'turret' : 'hull', x0: box.min.x, x1: box.max.x, z0: box.min.z, z1: box.max.z,
      floor: box.min.y, edge: box.min.y + envelope.heightM! }));
  });
  return out;
}

/** A rack's volume: its footprint from its floor to its rails plus RACK_LOAD_HEAD. */
export function stowageRackVolume(r: StowageRack): THREE.Box3 {
  return new THREE.Box3(new THREE.Vector3(r.x0, r.floor, r.z0), new THREE.Vector3(r.x1, r.edge + RACK_LOAD_HEAD, r.z1));
}

/** The drone dock's keep-out boxes in its seat's frame: the cradle, the parked airframe and its launch column, each grown
 *  by DOCK_KEEP_OUT_CLEAR. */
export function missionDockKeepOutBoxes(seat: MissionAttachment): THREE.Box3[] {
  const at = new THREE.Vector3(seat.x, seat.y, seat.z);
  return [...missionCradleVolumes(seat), ...missionAirframeVolumes(seat, true)].map((v) =>
    new THREE.Box3(new THREE.Vector3(...v.min), new THREE.Vector3(...v.max)).translate(at).expandByScalar(DOCK_KEEP_OUT_CLEAR));
}

/** Where a seat's keep-out boxes enter a rack's volume (more than a millimetre deep on every axis): one row per rack, with
 *  the overlap's extent. Empty when the seat keeps off every rack in its frame. */
export function seatRackOverlaps(seat: MissionAttachment, racks: readonly StowageRack[]): Array<{ rack: StowageRack; overlap: THREE.Box3 }> {
  const boxes = missionDockKeepOutBoxes(seat), out: Array<{ rack: StowageRack; overlap: THREE.Box3 }> = [];
  for (const r of racks) {
    if (r.frame !== seat.frame) continue;
    const volume = stowageRackVolume(r), overlap = new THREE.Box3();
    for (const box of boxes) {
      const meet = box.clone().intersect(volume);
      if (!meet.isEmpty() && Math.min(meet.max.x - meet.min.x, meet.max.y - meet.min.y, meet.max.z - meet.min.z) > 0.001) overlap.union(meet);
    }
    if (!overlap.isEmpty()) out.push({ rack: r, overlap });
  }
  return out;
}
