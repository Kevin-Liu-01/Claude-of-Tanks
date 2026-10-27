// Gun floodlights (the owner, 2026-10-24: "make the husarz and wilk and zoria and oplot m and merkava mk 4 trophy, type
// 96b, type 96-80, have floodlights at front by guns"): a searchlight drum beside the main gun, the size of the Soviet
// pattern's Luna (a 0.24 m drum, 0.22 m deep, for a 120-125 mm gun), on a bracket out of the mantlet. It belongs to the
// gun mount, so it pitches with the gun and stays put when the barrel recoils; its lens is a searchlight (a beam at night,
// vehicleNightLighting.ts). Each vehicle seats it from its own measured faces: the drum's back clear of the cheeks beside
// the gun through the gun's depression and elevation, the bracket's foot inside the mantlet's face and clear of the bore.
import { KIT } from './kit.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

/** Where a gun floodlight sits (m, the gun pivot's frame: x across, y up, z along the bore). */
export interface GunFloodlightSeat {
  /** Right of the gun, as the Soviet pattern's Luna rides (the hull's starboard, -x: +x is its left, the turret-yaw
   *  convention), or left. */
  readonly side: 'right' | 'left';
  /** The drum's axis off the bore (across, on its side, and up) and its back face's z. */
  readonly x: number;
  readonly y: number;
  readonly backZ: number;
  /** The bracket's foot: its distance off the bore (on the lamp's side), its height, and the z it runs back to inside the
   *  mantlet's face. */
  readonly anchorX: number;
  readonly anchorY: number;
  readonly anchorZ: number;
  readonly radius?: number;
  readonly depth?: number;
  /** The drum's and bracket's draw: the mount's own (default), or `gunMountLamp`, the mount's paint as a draw of its own,
   *  where the mount is a measured source part whose stock the lamp must not join. */
  readonly bucket?: 'gunMount' | 'gunMountLamp';
}

/** The floodlight's drum, rim, lens, rear cap and bracket on the gun mount; its seat is recorded on the gun rig. */
export function addGunFloodlight(P: TankBuilderPort, seat: GunFloodlightSeat): void {
  const { box, cylX, cylZ } = KIT;
  const { side, y, backZ, anchorX, anchorY, anchorZ, bucket = 'gunMount' } = seat;
  const s = side === 'right' ? -1 : 1, r = seat.radius ?? 0.12, depth = seat.depth ?? 0.22, x = s * seat.x, zc = backZ + depth / 2;
  const segments = P.q ? 20 : 12;
  P.add(bucket, cylZ(r, depth, segments), x, y, zc);
  P.add('gunMountDark', cylZ(r + 0.008, 0.024, segments), x, y, backZ + depth - 0.012);
  P.add('gunMountGlass', markVehicleNightLens(cylZ(r * 0.84, 0.006, segments), 'headlight', { searchlight: true }),
    x, y, backZ + depth + 0.001);
  P.add('gunMountDark', cylZ(r * 0.62, 0.035, segments), x, y, backZ - 0.0125);
  // the bracket: a boss on the drum's inboard side, a cross arm to the foot's line, and the foot run back into the mantlet
  const drumIn = seat.x - Math.sqrt(Math.max(0, r * r - (anchorY - y) ** 2)) + 0.01;
  P.add('gunMountDark', cylX(0.035, 0.04, 12), s * (drumIn - 0.01), anchorY, zc);
  P.add(bucket, box(drumIn - anchorX, 0.04, 0.05), s * (anchorX + drumIn) / 2, anchorY, zc);
  P.add(bucket, box(0.045, 0.04, zc + 0.025 - anchorZ), s * anchorX, anchorY, (zc + 0.025 + anchorZ) / 2);
  P.gunG.userData.gunFloodlight = Object.freeze({
    side, axis: Object.freeze([x, y, zc]), radius: r, depth, owner: bucket, searchlight: true,
  });
}
