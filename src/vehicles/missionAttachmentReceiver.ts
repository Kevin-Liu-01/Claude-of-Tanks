import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TankBuilderPort } from './tankFactoryCore.ts';

type ReceiverId = 'pt91_twardy' | 'leo2a6_ua' | 'ua_m1a1' | 'ua_t80u_modern';
type Vec3 = readonly [number, number, number];
export interface MissionReceiverPart {
  readonly role: 'roof-post' | 'rail-post' | 'crossarm' | 'rail-socket' | 'lower-arm' | 'edge-return';
  readonly size: Vec3;
  readonly center: Vec3;
}
interface ReceiverSeat {
  readonly x: number;
  readonly z: number;
  readonly topY: number;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** Only these permanent, physically attached pads are native dock supports.
 * The openings between the two beams remain empty; the native ray still has
 * to hit an actual upward triangle, never this rectangular search region. */
export const MISSION_RECEIVER_SEATS: Readonly<Record<ReceiverId, ReceiverSeat>> = {
  pt91_twardy: { x: -.72, z: -.28, topY: .885,
    minX: -.895, maxX: -.545, minZ: -.426, maxZ: -.134 },
  leo2a6_ua: { x: -1.45, z: .46, topY: .985,
    minX: -1.625, maxX: -1.275, minZ: .314, maxZ: .606 },
  ua_m1a1: { x: -1.50, z: -1, topY: 1.535,
    minX: -1.675, maxX: -1.325, minZ: -1.146, maxZ: -.854 },
  ua_t80u_modern: { x: -1.30, z: -.18, topY: 1.068,
    minX: -1.475, maxX: -1.125, minZ: -.326, maxZ: -.034 },
};

export function missionReceiverParts(id: ReceiverId): MissionReceiverPart[] {
  const seat = MISSION_RECEIVER_SEATS[id], parts: MissionReceiverPart[] = [];
  if (id === 'pt91_twardy') {
    // The cast dome changes by up to 5.2 mm with tessellation. Four finite
    // welded feet penetrate both native surfaces, giving the removable dock
    // one identical flat datum at either detail level. No broad armor slab.
    const bottoms = [.671, .687, .750, .758];
    let index = 0;
    for (const x of [-.108, .108]) for (const z of [-.09, .09]) {
      const bottom = bottoms[index++]!, top = .873;
      parts.push({ role: 'roof-post', size: [.038, top - bottom, .045],
        center: [seat.x + x, (bottom + top) / 2, seat.z + z] });
    }
  } else if (id === 'leo2a6_ua') {
    // These two short sockets overlap the permanent 32 mm roof-basket rail
    // at x=-1.55, y=.91. They do not use camouflage or a loose crate as a foot.
    for (const z of [-.09, .09]) {
      parts.push({ role: 'rail-post', size: [.026, .041, .026],
        center: [-1.55, .9425, seat.z + z] });
    }
  } else if (id === 'ua_t80u_modern') {
    // The left roof-cage wing (fieldRoofCage.ts: rails at x -1.62 and -.98,
    // tie at -1.30, top 1.04) covers Zoria's only roof launch column; the
    // roof gun sweeps everything inboard of it. Two flat bearers lie across
    // the wing, seated 8 mm into its rails, ties and cross rows, so the drone
    // rides above the lattice as the M1A1 SA's does, clear of the hinges and
    // the mast at z -.68.
    for (const dz of [-.09, .09]) {
      parts.push({ role: 'crossarm', size: [.67, .028, .116],
        center: [seat.x, seat.topY - .014, seat.z + dz] });
    }
    return parts;
  } else {
    // The roof cloth is above the load-bearing cage. Two thin hooked arms
    // reach around its existing edge, keeping both the cloth and the launch
    // column intact. Only the short return reaches outside the cage; the
    // drone itself remains over the turret, inside the hull's width.
    for (const dz of [-.09, .09]) {
      const z = seat.z + dz, railX = -2.01, outerX = -2.30;
      const slope = .04 / 1.56;
      const railTop = 1.30 + (.28 - z) * slope + .016 * Math.sqrt(1 + slope * slope);
      const bottom = railTop - .09;
      // Eight millimetres of finite socket contact with the underside of
      // the pitched 32 mm rail. A top-side clamp would pierce the cloth.
      parts.push({ role: 'rail-socket', size: [.04, .074, .045],
        center: [railX, railTop - .061, z] });
      parts.push({ role: 'lower-arm', size: [.31, .026, .045],
        center: [(railX + outerX) / 2, bottom, z] });
      parts.push({ role: 'edge-return', size: [.028, seat.topY - bottom, .045],
        center: [outerX, (seat.topY + bottom) / 2, z] });
      parts.push({ role: 'crossarm', size: [seat.x + .175 - outerX, .028, .116],
        center: [(seat.x + .175 + outerX) / 2, seat.topY - .014, z] });
    }
    return parts;
  }
  for (const z of [-.09, .09]) {
    parts.push({ role: 'crossarm', size: [.35, .028, .116],
      center: [seat.x, seat.topY - .014, seat.z + z] });
  }
  return parts;
}

interface ReceiverBuilder {
  readonly mats: { readonly hull: THREE.Material };
  readonly disposables: { dispose(): void }[];
  postAssemble: TankBuilderPort['postAssemble'];
}

/** Permanent equipment, separate from the armor shell and removable drone.
 * Keep its stable semantic mesh after material-bucket assembly so the native
 * support audit can identify these exact load-bearing pads without allowing
 * all roof decorations to carry a drone. Factory disposal owns the geometry. */
export function addMissionAttachmentReceiver(P: ReceiverBuilder, id: ReceiverId): void {
  const previous = P.postAssemble;
  P.postAssemble = rig => {
    previous?.(rig);
    const parts = missionReceiverParts(id).map(part => {
      const indexed = new THREE.BoxGeometry(...part.size);
      const geometry = indexed.toNonIndexed();
      indexed.dispose();
      return geometry.translate(...part.center);
    });
    const geometry = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    if (!geometry) throw new Error(`${id}: mission receiver geometry could not be assembled`);
    const receiver = new THREE.Mesh(geometry, P.mats.hull);
    receiver.name = 'turretMissionReceiver';
    receiver.castShadow = receiver.receiveShadow = true;
    receiver.userData.appearanceRole = 'armorPaint';
    rig.turretG.add(receiver);
    P.disposables.push(geometry);
  };
}
