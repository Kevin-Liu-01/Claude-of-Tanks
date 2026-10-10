import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TankBuilderPort } from './tankFactoryCore.ts';
import { boxUV } from './factoryGeometry.ts';
import { CAMO_UV_REPEATS_PER_M } from './camoWorldScale.ts';

type ReceiverId = 'pt91_twardy' | 'leo2a6_ua' | 'ua_m1a1' | 'ua_t80u_modern';
type Vec3 = readonly [number, number, number];
export interface MissionReceiverPart {
  readonly role: 'roof-post' | 'rail-post' | 'crossarm' | 'rail-socket' | 'lower-arm' | 'edge-return'
    | 'bearer-plate' | 'bearer-spine' | 'bearer-web' | 'bearer-lip' | 'bolt' | 'corner-gusset';
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

/**
 * A bearer as fabricated: a 14 mm top bar carries the dock's support datum (its top face, exactly where the solid
 * bearer's was) and the dock feet's padded seat; under it a channel welded from a central spine and two inset webs with
 * out-turned lips, and the clamp bolts through each web between the feet. Every member lies inside the solid bearer it
 * replaces, the envelope the native clearance audit certified, and nothing but the bar comes within 10 mm of a foot pad.
 */
function bearerParts(size: Vec3, center: Vec3, footXs: readonly number[]): MissionReceiverPart[] {
  const [length, height, width] = size, [cx, cy, cz] = center, top = cy + height / 2, bottom = cy - height / 2;
  const bar = .014, web = .006, webZ = width / 2 - .018, channel = height - bar + .002;
  const parts: MissionReceiverPart[] = [
    { role: 'bearer-plate', size: [length, bar, width], center: [cx, top - bar / 2, cz] },
    { role: 'bearer-spine', size: [length - .01, channel, .016], center: [cx, bottom + channel / 2, cz] },
  ];
  for (const side of [-1, 1]) {
    const z = cz + side * webZ;
    parts.push({ role: 'bearer-web', size: [length - .004, channel, web], center: [cx, bottom + channel / 2, z] });
    parts.push({ role: 'bearer-lip', size: [length - .008, .004, .018], center: [cx, bottom + .002, z + side * .007] });
    for (const fx of footXs) for (const end of [-1, 1]) {
      const x = cx + fx + end * .062;
      if (Math.abs(x - cx) > length / 2 - .012) continue;
      parts.push({ role: 'bolt', size: [.012, .01, .004], center: [x, bottom + .008, z + side * (web / 2 + .0005)] });
    }
  }
  return parts;
}
export function missionReceiverParts(id: ReceiverId): MissionReceiverPart[] {
  const seat = MISSION_RECEIVER_SEATS[id], parts: MissionReceiverPart[] = [];
  const feet = [seat.x - .108, seat.x + .108];
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
    // the mast at z -.68. These bearers sit down in the lattice bars to within
    // 3 mm of their support face, so they stay solid: a channel's members would
    // be buried in the bars.
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
    const sockets: MissionReceiverPart[] = [], members: MissionReceiverPart[] = [];
    for (const dz of [-.09, .09]) {
      const z = seat.z + dz, railX = -2.01, outerX = -2.30;
      const slope = .04 / 1.56;
      const railTop = 1.30 + (.28 - z) * slope + .016 * Math.sqrt(1 + slope * slope);
      const bottom = railTop - .09;
      // Eight millimetres of finite socket contact with the underside of
      // the pitched 32 mm rail. A top-side clamp would pierce the cloth.
      sockets.push({ role: 'rail-socket', size: [.04, .074, .045],
        center: [railX, railTop - .061, z] });
      members.push({ role: 'lower-arm', size: [.31, .026, .045],
        center: [(railX + outerX) / 2, bottom, z] });
      members.push({ role: 'edge-return', size: [.028, seat.topY - bottom, .045],
        center: [outerX, (seat.topY + bottom) / 2, z] });
      // A welded gusset fills the outer corner where the arm turns up to the return.
      members.push({ role: 'corner-gusset', size: [.04, .04, .012],
        center: [outerX + .031, bottom + .030, z] });
      const span = seat.x + .175 - outerX;
      members.push(...bearerParts([span, .028, .116], [(seat.x + .175 + outerX) / 2, seat.topY - .014, z], feet.map(x => x - (seat.x + .175 + outerX) / 2)));
    }
    return [...sockets, ...members];
  }
  for (const z of [-.09, .09]) {
    parts.push(...bearerParts([.35, .028, .116], [seat.x, seat.topY - .014, seat.z + z], feet.map(x => x - seat.x)));
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
    // Painted like the turret it is welded to. The camouflage buckets project one vehicle-space pattern at a single
    // density and carry baked vertex colour; this mesh bypasses the buckets, so it gets both here. It used to render
    // black (the hull material reads vertex colour, and these boxes had none) with a whole camo tile per small face.
    boxUV(geometry, CAMO_UV_REPEATS_PER_M);
    const normals = geometry.getAttribute('normal'), shade = new Float32Array(normals.count * 3);
    for (let i = 0; i < normals.count; i++) {
      const ny = normals.getY(i), ao = (1 - Math.max(0, -ny) * .28) * (1 - Math.max(0, ny) * .16);
      shade[i * 3] = shade[i * 3 + 1] = shade[i * 3 + 2] = ao;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(shade, 3));
    const receiver = new THREE.Mesh(geometry, P.mats.hull);
    receiver.name = 'turretMissionReceiver';
    receiver.castShadow = receiver.receiveShadow = true;
    receiver.userData.appearanceRole = 'armorPaint';
    rig.turretG.add(receiver);
    P.disposables.push(geometry);
  };
}
