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
import * as THREE from 'three';

const _point = new THREE.Vector3();

/** The built tank's declared bore as a world-to-bore transform plus its radius, depth and mouth, or null. */
export function physicalBoreAir(root) {
  const declared = root.userData?.physicalMuzzleBore;
  if (!declared) return null;
  const frame = root.getObjectByName(declared.frame);
  if (!frame) throw new Error(`physical muzzle bore frame ${declared.frame} is missing`);
  const { innerRadiusM, depthM, muzzleZ } = declared;
  if (![innerRadiusM, depthM, muzzleZ].every(Number.isFinite) || innerRadiusM <= 0 || depthM <= 0) {
    throw new RangeError('physical muzzle bore record needs a finite radius, depth and mouth');
  }
  root.updateMatrixWorld(true);
  return { worldToBore: frame.matrixWorld.clone().invert(), boreToWorld: frame.matrixWorld.clone(), innerRadiusM, depthM, muzzleZ };
}

/** Half a voxel diagonal: a voxel whose centre lies this close to the bore cylinder can touch it. */
const reach = (voxel) => voxel * Math.sqrt(3) / 2;

function touchesBore(bore, voxel) {
  const pad = reach(voxel);
  _point.applyMatrix4(bore.worldToBore);
  return Math.hypot(_point.x, _point.y) < bore.innerRadiusM + pad
    && _point.z > bore.muzzleZ - bore.depthM - pad && _point.z < bore.muzzleZ + pad;
}

/** True when voxel (x, y, z) of a tank-voxel-body grid can touch the declared bore (bore may be null). */
export function insideBoreAir(bore, grid, x, y, z) {
  if (!bore) return false;
  const [ox, oy, oz] = grid.origin, v = grid.voxel;
  _point.set(ox + (x + 0.5) * v, oy + (y + 0.5) * v, oz + (z + 0.5) * v);
  return touchesBore(bore, v);
}

/** Per-voxel bore mask over a grid (1 = can touch the bore): the insideBoreAir test, evaluated over the index range
 * of the padded cylinder's world bounds only, so the two agree voxel for voxel. */
export function boreAirVoxelMask(bore, grid) {
  const { nx, ny, nz, origin, voxel } = grid;
  const mask = new Uint8Array(nx * ny * nz);
  if (!bore) return mask;
  const pad = reach(voxel), r = bore.innerRadiusM + pad;
  const bounds = new THREE.Box3(new THREE.Vector3(-r, -r, bore.muzzleZ - bore.depthM - pad), new THREE.Vector3(r, r, bore.muzzleZ + pad))
    .applyMatrix4(bore.boreToWorld);
  const lo = (min, o) => Math.max(0, Math.floor((min - o) / voxel) - 1);
  const hi = (max, o, n) => Math.min(n - 1, Math.ceil((max - o) / voxel) + 1);
  const x0 = lo(bounds.min.x, origin[0]), x1 = hi(bounds.max.x, origin[0], nx);
  const y0 = lo(bounds.min.y, origin[1]), y1 = hi(bounds.max.y, origin[1], ny);
  const z0 = lo(bounds.min.z, origin[2]), z1 = hi(bounds.max.z, origin[2], nz);
  for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (insideBoreAir(bore, grid, x, y, z)) mask[(z * ny + y) * nx + x] = 1;
  }
  return mask;
}
