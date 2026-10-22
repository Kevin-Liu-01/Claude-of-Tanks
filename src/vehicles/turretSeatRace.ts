/**
 * turretSeatRace.ts — the hull-side race an intact tank shows in the seam under its turret (the owner, 2026-10-22: "make
 * sure all tank turrets have a proper turret ring/attachment area").
 *
 * Copyright © 2026 Kevin B. Liu. Created, designed and directed by Kevin B. Liu; first-party Reserved Content
 * (LicenseRef-Claude-of-Tanks-Proprietary-Content-1.0, LICENSE-POLICY.md, NOTICE.md). Claude was a development tool for
 * this file, not an author. provenance: urn:claude-of-tanks:vehicle-helper:turret-seat-race.
 *
 * The ring is the one turretRingWell.ts measures (measureTurretRing: the rig_turret seat, the deck round the race's rim,
 * the race's outer radius), published by tools/gen-combat-anatomy.mjs as the calibration's `turretRing` receipt, so the
 * drawn race, a wreck's ring plate and the combat ring all share one axis and seat. A tank whose calibration carries no
 * receipt shows none. The race is a flat machined ring on the deck, a little inside the receipt's rim, standing under
 * the turret's underside; the turret builders keep that underside clear of the deck so the seam reads. A kill's ring cut
 * (turretRingWell.ts cutTurretRingMeshes) takes it with the deck inside the ring, and the wreck's plate draws its own
 * race on the same rim; a rematch puts it back. turretRingWell.ts leaves it out of the deck it measures.
 *
 * The seat (`seatTurretOverDeck`): outside the race's rim, every turret surface below the receipt's deck plus
 * TURRET_SEAT_GAP_M comes up onto that plane. Procedural turrets were authored sitting into their decks, so a traverse
 * swept their buried undersides through the hull and its kit; on the plane, the turret's walls stop over a dark seam
 * with the race in it, and nothing of the turret can meet the deck round the ring at any bearing. Inside the rim (the
 * ring's basket and collar, in the hull's well) and the gun are left as built. A moved surface's geometry is this
 * build's own copy (a fitting's geometry can be shared between meshes and tanks), freed with the build.
 */
import * as THREE from 'three';
import { combatAnatomyCalibration } from './combatAnatomyCalibrationRegistry.ts';

/** The seam between the deck round the ring and the turret's lowest surface outside the race (m). */
export const TURRET_SEAT_GAP_M = 0.03;
/** Past the race's rim, where the turret's surfaces are seated over the deck (m). */
const SEAT_RIM_CLEAR_M = 0.02;

/** The race's mesh name (tools and the ring census find it by it). */
export const TURRET_SEAT_RACE_NAME = 'turretSeatRace';

/** How far the race stands over the deck it was measured on, and how far it runs into it (m). */
const RACE_TOP_M = 0.016;
const RACE_FOOT_M = 0.010;
/** Inside the receipt's rim, so the kill's ring prism takes all of it (m). */
const RIM_INSET_M = 0.004;
const CHAMFER_M = 0.004;

interface TurretSeatRaceReceipt {
  readonly seat: readonly number[];
  readonly deckY: number;
  readonly rimR: number;
}

/** The race's width (its bolt flange and machined face) from its outer radius, as the wreck's plate draws it. */
function raceWidth(rimR: number): number { return Math.min(0.085, Math.max(0.05, 0.075 * rimR)); }

/** The race in the rig_hull frame, or null for a receipt that names no ring. */
export function buildTurretSeatRaceGeometry(receipt: TurretSeatRaceReceipt, high: boolean): THREE.BufferGeometry | null {
  const { seat, deckY, rimR } = receipt;
  if (!(rimR > 0.3) || !Number.isFinite(deckY) || seat.length < 3) return null;
  const rOut = rimR - RIM_INSET_M, rIn = rOut - raceWidth(rimR);
  const y0 = deckY - RACE_FOOT_M, y1 = deckY + RACE_TOP_M;
  const profile = [[rIn, y0], [rOut, y0], [rOut, y1 - CHAMFER_M], [rOut - CHAMFER_M, y1], [rIn, y1], [rIn, y0]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(profile, high ? 64 : 48).translate(seat[0], 0, seat[2]);
}

export interface ApplyTurretSeatRaceOptions {
  specId: string;
  hullG: THREE.Object3D;
  material: THREE.Material;
  high: boolean;
  disposables: THREE.BufferGeometry[];
}

/** The race on this tank's rig_hull from its calibration's turret-ring receipt; false when it has none. */
export function applyTurretSeatRace({ specId, hullG, material, high, disposables }: ApplyTurretSeatRaceOptions): boolean {
  const receipt = combatAnatomyCalibration(specId)?.turretRing;
  if (!receipt) return false;
  const geometry = buildTurretSeatRaceGeometry(receipt, high);
  if (!geometry) return false;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = TURRET_SEAT_RACE_NAME;
  mesh.userData.turretSeatRace = true;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  hullG.add(mesh);
  disposables.push(geometry);
  return true;
}

const _toHull = new THREE.Matrix4(), _toLocal = new THREE.Matrix4(), _hullInverse = new THREE.Matrix4();
const _v = new THREE.Vector3();

function underObject(object: THREE.Object3D, ancestor: THREE.Object3D | null): boolean {
  if (!ancestor) return false;
  for (let o: THREE.Object3D | null = object; o; o = o.parent) if (o === ancestor) return true;
  return false;
}

export interface SeatTurretOverDeckOptions {
  specId: string;
  hullG: THREE.Object3D;
  turretG: THREE.Object3D;
  gunG: THREE.Object3D | null;
  disposables: THREE.BufferGeometry[];
}

/** Seat the turret's surfaces over the deck round its ring (see the header); the count of meshes moved. */
export function seatTurretOverDeck({ specId, hullG, turretG, gunG, disposables }: SeatTurretOverDeckOptions): number {
  const receipt = combatAnatomyCalibration(specId)?.turretRing;
  if (!receipt || !(receipt.rimR > 0.3) || !Number.isFinite(receipt.deckY)) return 0;
  const seatY = receipt.deckY + TURRET_SEAT_GAP_M, keepR2 = (receipt.rimR + SEAT_RIM_CLEAR_M) ** 2;
  const cx = receipt.seat[0], cz = receipt.seat[2];
  hullG.updateWorldMatrix(true, false);
  turretG.updateMatrixWorld(true);
  _hullInverse.copy(hullG.matrixWorld).invert();
  let moved = 0;
  turretG.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || underObject(mesh, gunG)
      || mesh.userData.interiorFill || mesh.userData.vehicleMarking) return;
    const source = mesh.geometry, position = source?.getAttribute('position');
    if (!position) return;
    _toHull.multiplyMatrices(_hullInverse, mesh.matrixWorld);
    let needs = false;
    for (let i = 0; i < position.count && !needs; i++) {
      _v.fromBufferAttribute(position, i).applyMatrix4(_toHull);
      needs = _v.y < seatY && (_v.x - cx) ** 2 + (_v.z - cz) ** 2 > keepR2;
    }
    if (!needs) return;
    const seated = source.clone();
    const out = seated.getAttribute('position') as THREE.BufferAttribute;
    _toLocal.copy(_toHull).invert();
    for (let i = 0; i < out.count; i++) {
      _v.fromBufferAttribute(out, i).applyMatrix4(_toHull);
      if (_v.y >= seatY || (_v.x - cx) ** 2 + (_v.z - cz) ** 2 <= keepR2) continue;
      _v.y = seatY;
      _v.applyMatrix4(_toLocal);
      out.setXYZ(i, _v.x, _v.y, _v.z);
    }
    out.needsUpdate = true;
    seated.computeVertexNormals();
    seated.computeBoundingBox();
    seated.computeBoundingSphere();
    disposables.push(seated);
    mesh.geometry = seated;
    moved++;
  });
  return moved;
}
