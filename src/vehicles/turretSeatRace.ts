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
 * The seat (`seatTurretOverDeck`): outside the race's rim, every turret surface below its plane comes up onto it. The
 * plane at a radius off the ring's axis is TURRET_SEAT_GAP_M over the hull's highest top at that radius on any bearing
 * (the receipt's swept deck, turretRingWell.ts measureTurretSweep), so whatever of the turret passes over a hull part
 * at some bearing stands its gap over it: no higher than TURRET_SEAT_RISE_M over the deck round the ring (a deck a few
 * centimetres proud of the ring's, a plate over the track's return; taller kit keeps its own clearance), and lower
 * where the hull stays under that deck on every bearing (a lower engine deck or glacis, past the hull's sides), so a
 * bustle or a rack hanging over a lower deck keeps its drop. Procedural turrets were authored sitting into their decks,
 * so a traverse swept their buried undersides through the hull and its kit; seated, the turret's walls stop over a dark
 * seam with the race in it. A corner is seated by its position (every copy of it, in every mesh, alike), so no seam
 * opens between faces that share it. Inside the rim (the ring's basket and collar, in the hull's well) and the gun are
 * left as built. A moved surface's geometry is this build's own copy (a fitting's geometry can be shared between meshes
 * and tanks), freed with the build.
 */
import * as THREE from 'three';
import { combatAnatomyCalibration } from './combatAnatomyCalibrationRegistry.ts';

/** The build's disposables (its geometry is freed with it). */
interface GeometryDisposables { push(geometry: THREE.BufferGeometry): unknown }

/** The seam between the deck round the ring and the turret's lowest surface outside the race (m). */
export const TURRET_SEAT_GAP_M = 0.03;
/** Past the race's rim, where the turret's surfaces are seated over the deck (m). */
const SEAT_RIM_CLEAR_M = 0.02;
/** The swept deck's radius band (m), and its value where no hull lies at that radius on any bearing (m under the deck). */
export const TURRET_SWEEP_BIN_M = 0.05;
export const TURRET_SWEEP_FLOOR_M = -1;
/** How far either side of a corner's radius the swept deck under it is read (m): its 2.5 cm grid's cells, and the
 *  reach of the faces round the corner (a face's edge between two seated corners runs straight). */
const SWEEP_READ_M = 0.10;
/** The most the seat rises over the deck round the ring's plane (m). */
const TURRET_SEAT_RISE_M = 0.04;

/** The race's mesh name (tools and the ring census find it by it). */
export const TURRET_SEAT_RACE_NAME = 'turretSeatRace';

/** How far the race stands over the deck it was measured on, and how far it runs into it (m): 4 mm proud, since a gun's
 *  mantlet can pass low over the ring's front as it depresses (the ZTZ-99A2's comes within 1 cm of the deck there). */
const RACE_TOP_M = 0.004;
const RACE_FOOT_M = 0.010;
/** Inside the receipt's rim, so the kill's ring prism takes all of it (m). */
const RIM_INSET_M = 0.004;
const CHAMFER_M = 0.002;

interface TurretSeatRaceReceipt {
  readonly seat: readonly number[];
  readonly deckY: number;
  readonly rimR: number;
  readonly sweepR0?: number;
  readonly sweepDy?: readonly number[];
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
  disposables: GeometryDisposables;
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

const _toHull = new THREE.Matrix4(), _hullInverse = new THREE.Matrix4();
const _v = new THREE.Vector3(), _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3();
const _corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

function underObject(object: THREE.Object3D, ancestor: THREE.Object3D | null): boolean {
  if (!ancestor) return false;
  for (let o: THREE.Object3D | null = object; o; o = o.parent) if (o === ancestor) return true;
  return false;
}

/** A hull-frame position's key (0.1 mm): every copy of one corner, in any of the turret's meshes, is seated alike. */
const positionKey = (p: THREE.Vector3): string =>
  `${Math.round(p.x * 1e4)},${Math.round(p.y * 1e4)},${Math.round(p.z * 1e4)}`;

export interface SeatTurretOverDeckOptions {
  specId: string;
  hullG: THREE.Object3D;
  turretG: THREE.Object3D;
  gunG: THREE.Object3D | null;
  disposables: GeometryDisposables;
}

/** Seat the turret's surfaces over the deck round its ring (see the header); the count of meshes moved. */
export function seatTurretOverDeck({ specId, hullG, turretG, gunG, disposables }: SeatTurretOverDeckOptions): number {
  const receipt = combatAnatomyCalibration(specId)?.turretRing;
  if (!receipt || !(receipt.rimR > 0.3) || !Number.isFinite(receipt.deckY)) return 0;
  const seatY = receipt.deckY + TURRET_SEAT_GAP_M, keepR = receipt.rimR + SEAT_RIM_CLEAR_M;
  const cx = receipt.seat[0], cz = receipt.seat[2];
  const sweep = receipt.sweepDy, sweepR0 = receipt.sweepR0 ?? Infinity;
  // the plane a corner at plan radius r comes up to: its gap over the swept deck's highest band within SWEEP_READ_M of
  // r (no higher than TURRET_SEAT_RISE_M over the deck round the ring), or the deck's own plane without a swept deck
  const planeAt = (r: number): number => {
    if (!sweep?.length || r < sweepR0) return seatY;
    const b0 = Math.max(0, Math.floor((r - SWEEP_READ_M - sweepR0) / TURRET_SWEEP_BIN_M));
    const b1 = Math.floor((r + SWEEP_READ_M - sweepR0) / TURRET_SWEEP_BIN_M);
    if (b1 >= sweep.length) return seatY;
    let dy = TURRET_SWEEP_FLOOR_M;
    for (let b = b0; b <= b1; b++) dy = Math.max(dy, sweep[b]);
    return seatY + Math.min(dy, TURRET_SEAT_RISE_M);
  };
  hullG.updateWorldMatrix(true, false);
  turretG.updateMatrixWorld(true);
  _hullInverse.copy(hullG.matrixWorld).invert();
  const meshes: THREE.Mesh[] = [];
  turretG.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || underObject(mesh, gunG)
      || mesh.userData.interiorFill || mesh.userData.vehicleMarking || !mesh.geometry?.getAttribute('position')) return;
    meshes.push(mesh);
  });
  // 1. every corner of a triangle reaching past the rim takes the plane at its own radius, by position: a corner several
  // triangles (or meshes) share comes up alike in each, so no seam opens between them; a corner inside the rim that such
  // a triangle shares (a cap fanned from the ring's middle) comes up too, so the cap lies on the plane instead of sloping
  // back down to it. Triangles all inside the rim (the basket, the collar) keep their other corners as built.
  const targets = new Map<string, number>();
  for (const mesh of meshes) {
    const position = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
    const count = index ? index.count : position.count;
    _toHull.multiplyMatrices(_hullInverse, mesh.matrixWorld);
    for (let k = 0; k + 2 < count; k += 3) {
      let reaches = false;
      for (let c = 0; c < 3; c++) {
        _corners[c].fromBufferAttribute(position, index ? index.getX(k + c) : k + c).applyMatrix4(_toHull);
        reaches ||= (_corners[c].x - cx) ** 2 + (_corners[c].z - cz) ** 2 > keepR * keepR;
      }
      if (!reaches) continue;
      for (const p of _corners) {
        const plane = planeAt(Math.max(keepR, Math.hypot(p.x - cx, p.z - cz)));
        if (p.y >= plane) continue;
        const key = positionKey(p);
        const was = targets.get(key);
        if (was === undefined || plane > was) targets.set(key, plane);
      }
    }
  }
  if (!targets.size) return 0;
  let highest = -Infinity;
  for (const plane of targets.values()) highest = Math.max(highest, plane);
  // 2. each mesh holding such a corner: this build's own copy (a fitting's geometry can be shared between meshes and
  // tanks), every vertex at a seated position set on its plane, and the moved vertices' normals from the faces round them
  let moved = 0;
  for (const mesh of meshes) {
    const source = mesh.geometry, position = source.getAttribute('position');
    _toHull.multiplyMatrices(_hullInverse, mesh.matrixWorld);
    const lift: number[] = [];
    for (let i = 0; i < position.count; i++) {
      _v.fromBufferAttribute(position, i).applyMatrix4(_toHull);
      if (_v.y >= highest) continue;
      const plane = targets.get(positionKey(_v));
      if (plane !== undefined) lift.push(i, plane);
    }
    if (!lift.length) continue;
    const seated = source.clone();
    const out = seated.getAttribute('position') as THREE.BufferAttribute;
    const toLocal = _toHull.clone().invert();
    const movedVertex = new Uint8Array(out.count);
    for (let k = 0; k < lift.length; k += 2) {
      const i = lift[k];
      _v.fromBufferAttribute(out, i).applyMatrix4(_toHull);
      _v.y = lift[k + 1];
      _v.applyMatrix4(toLocal);
      out.setXYZ(i, _v.x, _v.y, _v.z);
      movedVertex[i] = 1;
    }
    const normal = seated.getAttribute('normal') as THREE.BufferAttribute | undefined;
    if (normal) {
      // (unmoved vertices keep their authored, possibly smooth, normals)
      const sum = new Float32Array(out.count * 3), index = seated.index, count = index ? index.count : out.count;
      for (let k = 0; k + 2 < count; k += 3) {
        const a = index ? index.getX(k) : k, b = index ? index.getX(k + 1) : k + 1, c = index ? index.getX(k + 2) : k + 2;
        if (!movedVertex[a] && !movedVertex[b] && !movedVertex[c]) continue;
        _v.fromBufferAttribute(out, a);
        _e1.fromBufferAttribute(out, b).sub(_v);
        _e2.fromBufferAttribute(out, c).sub(_v);
        _e1.cross(_e2);
        for (const i of [a, b, c]) if (movedVertex[i]) { sum[i * 3] += _e1.x; sum[i * 3 + 1] += _e1.y; sum[i * 3 + 2] += _e1.z; }
      }
      for (let i = 0; i < out.count; i++) {
        if (!movedVertex[i]) continue;
        _v.set(sum[i * 3], sum[i * 3 + 1], sum[i * 3 + 2]);
        if (_v.lengthSq() > 1e-24) { _v.normalize(); normal.setXYZ(i, _v.x, _v.y, _v.z); }
      }
      normal.needsUpdate = true;
    }
    out.needsUpdate = true;
    seated.computeBoundingBox();
    seated.computeBoundingSphere();
    disposables.push(seated);
    mesh.geometry = seated;
    moved++;
  }
  return moved;
}
