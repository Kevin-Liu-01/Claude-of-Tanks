// Declared physical muzzle bores, shared by the interior-fill generator (tools/gen-interior-fills.mjs), the watertight
// measurement (tools/tank-watertight-measure.mjs, read by the CLI and the fleet gate) and the fill-policy receipt.
//
// A profile that declares P.physicalMuzzleBore authors a real open recess, and the factory verifies it at build time
// (src/vehicles/physicalMuzzleBore.ts): a backstop at depthM, inward-facing wall stock at innerRadiusM and a seated
// annulus at the mouth. The factory records the verified declaration on the built tank
// (root.userData.physicalMuzzleBore, in the recoil frame that carries the bore). That recess opens to the sky through
// its mouth, so it is never body interior. The deep-interior test can still read a voxel column inside it as enclosed.
// The conservative voxelisation of the mouth annulus marks the top voxel of a column the bore wall misses by a
// millimetre. The BMP-3M Dragun at the owner's 0.9 size (2026-10-02) read six such voxels (0.09 L) at r 0.0425 m in
// its 0.0563 m bore. The generator then placed one gun-frame box in the bore, and the build's own bore check rejected
// it as a cap.
// Every voxel that can touch the declared recess (its centre within half a voxel diagonal of the bore cylinder) is
// therefore never filled and never counted as a leak. The measurement reports it apart as bore air, as it reports
// track lanes. On every current physical bore (the last 0.10-0.22 m of a protruding barrel) the margin reaches only the
// barrel's own wall stock and the open air at its mouth; a future bore seated flush in a hull or turret plate would
// need its margin reviewed against that body.
// 2026-10-10 (fleet-weapons lane, the coordinator's ruling on the inherited bore reds): the owner's carved bores
// (a28e4d8e6, src/vehicles/carvedMuzzleBore.ts: the 12-sided inward wall and recessed backstop cut into a legacy solid
// tip, frame `muzzleBoreShadowFallback*` with its `muzzleSeatReceipt`) are the same open recess. Undeclared, the
// mouth annulus's top voxels capped their columns, so the fleet gate read 0.06-0.13 L of the pocket's own air as a
// leak on nine hulls and the generator capped the bore with a fill. Every carved bore joins the declared one here.
import * as THREE from 'three';

const _point = new THREE.Vector3();

const boreRecord = (frame, innerRadiusM, depthM, muzzleZ, kind) => {
  if (![innerRadiusM, depthM, muzzleZ].every(Number.isFinite) || innerRadiusM <= 0 || depthM <= 0) {
    throw new RangeError(`${kind} muzzle bore record needs a finite radius, depth and mouth`);
  }
  return { worldToBore: frame.matrixWorld.clone().invert(), boreToWorld: frame.matrixWorld.clone(), innerRadiusM, depthM, muzzleZ };
};

/** Every carved bore frame of a built tank (carvedMuzzleBore.ts: the wall/backstop mesh's parent and its receipt). */
function carvedBores(root) {
  const bores = [];
  root.traverse((object) => {
    if (object.name !== 'muzzleBoreInnerWallAndBackstop' || !object.userData?.carvedBoreStock) return;
    const frame = object.parent, receipt = frame?.userData?.muzzleSeatReceipt;
    if (!receipt) throw new Error(`carved bore ${frame?.name ?? '?'} has no seat receipt`);
    bores.push(boreRecord(frame, receipt.physicalInnerRadiusM, receipt.physicalBoreDepthM, 0, 'carved'));
  });
  return bores;
}

/**
 * The built tank's open bores as world-to-bore transforms plus radius, depth and mouth, or null when it has none: the
 * profile-declared physical bore (its fields stay on the record itself) and every carved bore (`bores`, the declared
 * one first). insideBoreAir and boreAirVoxelMask read all of them.
 */
export function physicalBoreAir(root) {
  root.updateMatrixWorld(true);
  const declared = root.userData?.physicalMuzzleBore;
  let primary = null;
  if (declared) {
    const frame = root.getObjectByName(declared.frame);
    if (!frame) throw new Error(`physical muzzle bore frame ${declared.frame} is missing`);
    primary = boreRecord(frame, declared.innerRadiusM, declared.depthM, declared.muzzleZ, 'physical');
  }
  const carved = carvedBores(root);
  if (!primary && !carved.length) return null;
  const bores = primary ? [primary, ...carved] : carved;
  return { ...(primary ?? carved[0]), bores };
}

const boresOf = (bore) => bore?.bores ?? (bore ? [bore] : []);

/** Half a voxel diagonal: a voxel whose centre lies this close to the bore cylinder can touch it. */
const reach = (voxel) => voxel * Math.sqrt(3) / 2;

const _local = new THREE.Vector3();
function touchesBore(bore, voxel) {
  const pad = reach(voxel);
  _local.copy(_point).applyMatrix4(bore.worldToBore);
  return Math.hypot(_local.x, _local.y) < bore.innerRadiusM + pad
    && _local.z > bore.muzzleZ - bore.depthM - pad && _local.z < bore.muzzleZ + pad;
}

/** True when voxel (x, y, z) of a tank-voxel-body grid can touch any of the tank's open bores (bore may be null). */
export function insideBoreAir(bore, grid, x, y, z) {
  if (!bore) return false;
  const [ox, oy, oz] = grid.origin, v = grid.voxel;
  _point.set(ox + (x + 0.5) * v, oy + (y + 0.5) * v, oz + (z + 0.5) * v);
  for (const one of boresOf(bore)) if (touchesBore(one, v)) return true;
  return false;
}

/** Per-voxel bore mask over a grid (1 = can touch the bore): the insideBoreAir test, evaluated over the index range
 * of the padded cylinder's world bounds only, so the two agree voxel for voxel. */
export function boreAirVoxelMask(bore, grid) {
  const { nx, ny, nz, origin, voxel } = grid;
  const mask = new Uint8Array(nx * ny * nz);
  if (!bore) return mask;
  const pad = reach(voxel);
  const lo = (min, o) => Math.max(0, Math.floor((min - o) / voxel) - 1);
  const hi = (max, o, n) => Math.min(n - 1, Math.ceil((max - o) / voxel) + 1);
  for (const one of boresOf(bore)) {
    const r = one.innerRadiusM + pad;
    const bounds = new THREE.Box3(new THREE.Vector3(-r, -r, one.muzzleZ - one.depthM - pad), new THREE.Vector3(r, r, one.muzzleZ + pad))
      .applyMatrix4(one.boreToWorld);
    const x0 = lo(bounds.min.x, origin[0]), x1 = hi(bounds.max.x, origin[0], nx);
    const y0 = lo(bounds.min.y, origin[1]), y1 = hi(bounds.max.y, origin[1], ny);
    const z0 = lo(bounds.min.z, origin[2]), z1 = hi(bounds.max.z, origin[2], nz);
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (insideBoreAir(bore, grid, x, y, z)) mask[(z * ny + y) * nx + x] = 1;
    }
  }
  return mask;
}
