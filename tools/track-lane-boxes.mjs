// Track lane boxes, shared by the interior-fill generator (tools/gen-interior-fills.mjs) and the watertight check
// (tools/tank-watertight-check.mjs). The lane a track sweeps is never body interior: the generator leaves it as air,
// and the check must neither fill nor report that air as a leak — it reports the excluded lane volume separately
// (2026-09-21 follow-up to d0cbb9fcd: the Jagdpanzer E100 X read 4.53 L and the Leclerc classic X 0.80 L of lane
// air as "leaks" once their fills kept clear of the shoe lanes). One implementation keeps the two tools in lockstep.
//
// Tracks are moving parts too (2026-09-19, T-90M X): the lane a track band sweeps — between its upper and lower
// runs, idler to sprocket, one voxel of clearance around it — is never interior air, even where the hull's nose or
// sponson plates enclose it. The strict track-clip audit has tested the installed fills against the bands since
// 1cb462309; the T-90M's nose filled 89 voxels of its idler wrap before this rule.
// The visible track is the instanced shoe belt, not the band (2026-09-21, r34-clip): shoes ride outside the band
// (tankFactoryCore rOut + pad depth) and, where trackCarrierWidthM narrows the web, overhang it on both sides
// (Leclerc classic X 55 mm, Jagdpanzer E100 X 110 mm a side). The audit's shoe pass tests fills against that
// envelope, so each lane also excludes every live shoe instance on its side, with one voxel of clearance outboard
// and along y/z — a one-voxel fill column stood inside the classic Leclerc's forward-guard shoe overhang while its
// band box read clean. The band box keeps the INBOARD face: a shoe's inner edge can sit on the hull wall itself
// (Leclerc classic X right side, 5 mm), and padding it there would leave a column of real hull interior unfilled.
import * as THREE from 'three';
import { isTrackShoeMesh } from './track-clip-classification.mjs';

/** Clearance around each track band, in voxels: the strict clip audit samples 2 cm cells. */
export const TRACK_LANE_BAND_PAD_VOXELS = 2;
/** Clearance around the live shoe-instance envelope, in voxels. */
export const TRACK_LANE_SHOE_PAD_VOXELS = 1;

const _bandPoint = new THREE.Vector3(), _shoeInstance = new THREE.Matrix4(), _shoeWorld = new THREE.Matrix4();
/** One THREE.Box3 per track side (tank frame): the padded band box, extended outboard and along its length by the
 * padded envelope of every live shoe instance on that side. */
export function trackLaneBoxes(root, bandPad, shoePad) {
  root.updateMatrixWorld(true);
  const lanes = new Map(), shoes = new Map(); // side sign -> lane box / envelope of every live shoe instance
  const boxFor = (map, side) => { let box = map.get(side); if (!box) { box = new THREE.Box3(); map.set(side, box); } return box; };
  root.traverse((node) => {
    if (node.isMesh && !node.isInstancedMesh && /^gearTrackBand/.test(node.name || '')) {
      const box = new THREE.Box3().setFromObject(node);
      boxFor(lanes, Math.sign(box.min.x + box.max.x) || 1).union(box.expandByScalar(bandPad));
      return;
    }
    if (!isTrackShoeMesh(node)) return;
    if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
    const local = node.geometry.boundingBox;
    for (let k = 0; k < node.count; k++) {
      node.getMatrixAt(k, _shoeInstance);
      if (Math.abs(_shoeInstance.determinant()) < 1e-12) continue; // scale-0 pads (covered top run) are no surface
      _shoeWorld.multiplyMatrices(node.matrixWorld, _shoeInstance);
      const envelope = boxFor(shoes, Math.sign(_shoeWorld.elements[12]) || 1);
      for (let c = 0; c < 8; c++) {
        _bandPoint.set(c & 1 ? local.max.x : local.min.x, c & 2 ? local.max.y : local.min.y, c & 4 ? local.max.z : local.min.z);
        envelope.expandByPoint(_bandPoint.applyMatrix4(_shoeWorld));
      }
    }
  });
  for (const [side, envelope] of shoes) {
    envelope.expandByScalar(shoePad);
    const lane = boxFor(lanes, side);
    if (lane.isEmpty()) { lane.copy(envelope); if (side > 0) lane.min.x += shoePad; else lane.max.x -= shoePad; continue; }
    lane.min.y = Math.min(lane.min.y, envelope.min.y); lane.max.y = Math.max(lane.max.y, envelope.max.y);
    lane.min.z = Math.min(lane.min.z, envelope.min.z); lane.max.z = Math.max(lane.max.z, envelope.max.z);
    if (side > 0) lane.max.x = Math.max(lane.max.x, envelope.max.x); else lane.min.x = Math.min(lane.min.x, envelope.min.x);
  }
  return [...lanes.values()];
}

/** The lanes the generator uses for a voxel size: band pad two voxels, shoe pad one voxel. */
export function trackLaneBoxesForVoxel(root, voxel) {
  return trackLaneBoxes(root, voxel * TRACK_LANE_BAND_PAD_VOXELS, voxel * TRACK_LANE_SHOE_PAD_VOXELS);
}

/** True when the centre of voxel (x, y, z) of a tank-voxel-body grid lies inside any lane box. */
export function insideTrackLane(boxes, grid, x, y, z) {
  if (!boxes.length) return false;
  const [ox, oy, oz] = grid.origin;
  const v = grid.voxel;
  _bandPoint.set(ox + (x + 0.5) * v, oy + (y + 0.5) * v, oz + (z + 0.5) * v);
  for (const box of boxes) if (box.containsPoint(_bandPoint)) return true;
  return false;
}

/** Per-voxel lane mask over a grid (1 = inside a lane box): the insideTrackLane test evaluated once for every voxel
 * of each box's index range, so the two agree voxel for voxel without scanning the whole grid per box. */
export function trackLaneVoxelMask(boxes, grid) {
  const { nx, ny, nz, origin, voxel } = grid;
  const mask = new Uint8Array(nx * ny * nz);
  const lo = (min, o) => Math.max(0, Math.floor((min - o) / voxel) - 1);
  const hi = (max, o, n) => Math.min(n - 1, Math.ceil((max - o) / voxel) + 1);
  for (const box of boxes) {
    const x0 = lo(box.min.x, origin[0]), x1 = hi(box.max.x, origin[0], nx);
    const y0 = lo(box.min.y, origin[1]), y1 = hi(box.max.y, origin[1], ny);
    const z0 = lo(box.min.z, origin[2]), z1 = hi(box.max.z, origin[2], nz);
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      _bandPoint.set(origin[0] + (x + 0.5) * voxel, origin[1] + (y + 0.5) * voxel, origin[2] + (z + 0.5) * voxel);
      if (box.containsPoint(_bandPoint)) mask[(z * ny + y) * nx + x] = 1;
    }
  }
  return mask;
}
