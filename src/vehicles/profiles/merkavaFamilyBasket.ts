// Merkava family bustle load (release 262; the owner 2026-10-29: "fix the bustles and replace the stuff in them with our
// actual decorations and stuff"). The sources pile bags, rolls and a draped tarp in the basket; the fit leaves them out
// (basketclear.py) and the basket carries the fleet's own field stowage instead, as the Barak's and the Abrams' baskets
// do (owner 2026-10-14: "actual tank equipment ... in lieu of random thingies"): welded steel chests (fieldChest.ts), rows
// of M2A1 ammunition cans and of pressed 20 L jerrycans (accessoryKits.ts), in the army's issue drab. Each piece stands on
// the basket's measured floor (its face plates, basketplates.py; the Mk 1 and Mk 3 floors fall a few degrees to the rear
// rail, and the pieces lie with them) clear of its rails, struts and the turret's wall, packed against them by
// basketpack.py; the chests' latches face aft. The basket's volume is reserved, so the decor's loads keep out of it.
import * as THREE from 'three';
import { jerrycanParts } from '../accessoryKits.ts';
import { ammoCanParts, fieldChestParts, reserveDecorVolume } from './fieldChest.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import type { MerkavaBasket } from './merkavaFamilyDetails.ts';

/** One piece of a basket's load in the hull frame: its kind; its centre on the floor (x, y, z); its yaw about the floor's
 *  normal (0 lays a chest's length along x, its latches aft); the floor's normal (its x and z); then a chest's length,
 *  height and depth, or a row's count (ammunition cans or jerrycans side by side along the row, each long side across it;
 *  'ammol', ammunition cans end to end along it, as they lie on a slim chest's lid). */
export type BasketLoadItem =
  | readonly ['chest', x: number, y: number, z: number, yaw: number, nx: number, nz: number, w: number, h: number, d: number]
  | readonly ['ammo' | 'ammol' | 'cans', x: number, y: number, z: number, yaw: number, nx: number, nz: number, n: number];

/** An ammunition can's pitch across a row (its 0.155 m body, its lid's lip and a hand's gap), along one (its 0.305 m
 *  length and its latch lever) and a jerrycan's. */
const PITCH = { ammo: 0.175, ammol: 0.33, cans: 0.185 } as const;
const UP = new THREE.Vector3(0, 1, 0), normal = new THREE.Vector3(), tilt = new THREE.Quaternion(), turn = new THREE.Quaternion(),
  e = new THREE.Euler(), along = new THREE.Vector3();

/** Draws a basket's load in the turret frame and reserves the basket's volume (its bars' box, 0.6 m over its floor). */
export function buildMerkavaBasketLoad(P: TankBuilderPort, load: readonly BasketLoadItem[], basket: MerkavaBasket,
  pivot: readonly [number, number]): void {
  const [py, pz] = pivot, high = !!P.q;
  let floor = Infinity;
  for (const item of load) {
    const [kind, x, y, z, yaw, nx, nz] = item;
    floor = Math.min(floor, y);
    tilt.setFromUnitVectors(UP, normal.set(nx, Math.sqrt(Math.max(0, 1 - nx * nx - nz * nz)), nz));
    const put = (paint: readonly THREE.BufferGeometry[], dark: readonly THREE.BufferGeometry[], u: number, spin: number) => {
      // along the row on the tilted floor, then the piece turned about the floor's normal
      along.set(Math.cos(yaw) * u, 0, -Math.sin(yaw) * u).applyQuaternion(tilt);
      e.setFromQuaternion(turn.setFromAxisAngle(UP, yaw + spin).premultiply(tilt));
      for (const g of paint) P.addEquipment('turretEquipment', g, x + along.x, y + along.y - py, z + along.z - pz, e.x, e.y, e.z);
      for (const g of dark) P.addEquipment('turretDark', g, x + along.x, y + along.y - py, z + along.z - pz, e.x, e.y, e.z);
    };
    if (kind === 'chest') {
      const [, , , , , , , w, h, d] = item;
      const { paint, dark } = fieldChestParts(w, h, d, { high, front: -1 });
      put(paint, dark, 0, 0);
      continue;
    }
    const n = item[7], pitch = PITCH[kind];
    for (let k = 0; k < n; k++) {
      const u = (k - (n - 1) / 2) * pitch;
      if (kind !== 'cans') {
        // the can's long side across the row with its latch lever aft, or along it
        const { paint, dark } = ammoCanParts(high);
        put(paint, dark, u, kind === 'ammo' ? Math.PI / 2 : 0);
        continue;
      }
      // the row's end cans show their stamped X outboard; the spout on the aft shoulder
      const can = jerrycanParts(1, n === 1 ? [-1, 1] : k === 0 ? [-1] : k === n - 1 ? [1] : [], high);
      const paint = [can.body, ...can.stamps, can.spine, ...can.grips];
      for (const g of paint) g.userData.issueDrab = true;
      put(paint, can.spout ? [can.spout] : [], u, Math.PI);
    }
  }
  if (!load.length) return;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [ax, , az, bx, , bz] of basket.bars as readonly (readonly number[])[]) {
    x0 = Math.min(x0, ax!, bx!); x1 = Math.max(x1, ax!, bx!); z0 = Math.min(z0, az!, bz!); z1 = Math.max(z1, az!, bz!);
  }
  reserveDecorVolume(P.turretG, [x0, floor - py, z0 - pz], [x1, floor + 0.6 - py, z1 - pz]);
}
