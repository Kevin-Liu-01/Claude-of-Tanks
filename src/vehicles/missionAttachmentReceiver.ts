import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TankBuilderPort } from './tankFactoryCore.ts';
import { boxUV, paintedSurfaceShade } from './factoryGeometry.ts';
import { CAMO_UV_REPEATS_PER_M } from './camoWorldScale.ts';
import { leopardA6UaDockSeat } from './leopardA6UaLayout.ts';

type ReceiverId = 'leo2a6_ua' | 'ua_m1a1' | 't80u_zoria' | 'shot_kal';
type Vec3 = readonly [number, number, number];
export interface MissionReceiverPart {
  readonly role: 'rail-post' | 'crossarm' | 'rail-socket' | 'lower-arm' | 'edge-return'
    | 'bearer-plate' | 'bearer-flange' | 'bearer-spine' | 'bearer-web' | 'bearer-lip' | 'bolt' | 'corner-gusset'
    | 'side-rail-clamp' | 'cage-post' | 'cage-tie';
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
  // 264: on the cage roof's rail of the rebuilt 2A6 (leopardA6UaLayout.ts)
  leo2a6_ua: (({ x, z, topY }) => ({ x, z, topY, minX: x - .175, maxX: x + .175, minZ: z - .146, maxZ: z + .146 }))(
    leopardA6UaDockSeat()),
  ua_m1a1: { x: -1.50, z: -1, topY: 1.535,
    minX: -1.675, maxX: -1.325, minZ: -1.146, maxZ: -.854 },
  t80u_zoria: { x: -1.30, z: -.18, topY: 1.068,
    minX: -1.475, maxX: -1.125, minZ: -.326, maxZ: -.034 },
  shot_kal: { x: .45, z: -2.10, topY: .894,
    minX: .275, maxX: .625, minZ: -2.246, maxZ: -1.954 },
};

/**
 * A bearer as fabricated: a 14 mm top bar carries the dock's support datum (its top face, exactly where the solid
 * bearer's was) and the dock feet's padded seat; under it a channel welded from a central spine and two inset webs with
 * out-turned lips, and the clamp bolts through each web between the feet. Every member lies inside the solid bearer it
 * replaces, the envelope the native clearance audit certified, and nothing but the bar comes within 10 mm of a foot pad.
 */
/** A welded bearer under one pair of dock feet. `open` (round 5, the M1A1 SA: critics read the full-width top plates as
 * "plain grey planks ... a floating bench"): full-width top plates only where the feet bear, and between and beyond
 * them two narrow top flanges over the webs and spine, so the bearer reads as an open steel channel. */
function bearerParts(size: Vec3, center: Vec3, footXs: readonly number[], open = false): MissionReceiverPart[] {
  const [length, height, width] = size, [cx, cy, cz] = center, top = cy + height / 2, bottom = cy - height / 2;
  const bar = .014, web = .006, webZ = width / 2 - .018, channel = height - bar + .002;
  const parts: MissionReceiverPart[] = [];
  if (!open) parts.push({ role: 'bearer-plate', size: [length, bar, width], center: [cx, top - bar / 2, cz] });
  else {
    // The pads (x +-.0475 round each foot) stand on full plates 13 cm long. Edge flanges run between and beyond them,
    // each ending 5 mm inside a plate (welded to it) and short of the dock foot's own envelope, whose sides they would
    // otherwise cut (the native dock clearance pads every foot by 6 mm).
    const plateHalf = .065, flangeStop = .06, ends = [-length / 2, ...[...footXs].sort((m, n) => m - n).flatMap(fx => [fx - flangeStop, fx + flangeStop]), length / 2];
    for (const fx of footXs) parts.push({ role: 'bearer-plate', size: [plateHalf * 2, bar, width], center: [cx + fx, top - bar / 2, cz] });
    for (let k = 0; k + 1 < ends.length; k += 2) {
      const x0 = ends[k]!, x1 = ends[k + 1]!;
      if (x1 - x0 < .01) continue;
      for (const side of [-1, 1]) parts.push({ role: 'bearer-flange', size: [x1 - x0, bar, .022], center: [cx + (x0 + x1) / 2, top - bar / 2, cz + side * (width / 2 - .011)] });
    }
  }
  parts.push({ role: 'bearer-spine', size: [length - .01, channel, .016], center: [cx, bottom + channel / 2, cz] });
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
  if (id === 'leo2a6_ua') {
    // These two short sockets stand 4 mm into the cage roof's 32 mm dock rail (264: leopardA6UaLayout.ts). They do not
    // use camouflage or a loose crate as a foot.
    const { x, socketY } = leopardA6UaDockSeat();
    for (const z of [-.09, .09]) {
      parts.push({ role: 'rail-post', size: [.026, .041, .026], center: [x, socketY, seat.z + z] });
    }
  } else if (id === 'shot_kal') {
    // The Sho't Kal's commander's M2 and loader's .30 sweep its whole cast roof, and its raised AVDS deck lies under the
    // main gun's arc: the dock rides on the IDF bustle basket instead (centurionFamily.ts buildIdfTurretRacks: its top
    // rear rail at y .858 and z -2.40, the bustle bin's lid at .88 to z -1.78). Two bars run fore and aft under the dock
    // feet, seated 8 mm into the rear rail and the bin's lid, about 1.9 m from both roof guns' pivots.
    for (const dx of [-.108, .108]) {
      parts.push({ role: 'crossarm', size: [.116, .028, .64], center: [seat.x + dx, seat.topY - .014, -2.09] });
    }
    return parts;
  } else if (id === 't80u_zoria') {
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
    // Round 4 (critics, 2026-10-11: the dock read as a bench beside the cage): each arm also drops a post down the
    // outside of the cage's side frame to a clamp on its two-thirds rail, and a tie welds the two posts together, so the
    // bracket is visibly part of the cage. The posts stay outboard of the side lattice; the clamps grip the rail.
    const sockets: MissionReceiverPart[] = [], clamps: MissionReceiverPart[] = [], members: MissionReceiverPart[] = [];
    const postX = -2.066, tieY = 1.08;
    for (const dz of [-.09, .09]) {
      const z = seat.z + dz, railX = -2.01, outerX = -2.30;
      const slope = .04 / 1.56;
      const railTop = 1.30 + (.28 - z) * slope + .016 * Math.sqrt(1 + slope * slope);
      const bottom = railTop - .09;
      // Eight millimetres of finite socket contact with the underside of
      // the pitched 32 mm rail. A top-side clamp would pierce the cloth.
      sockets.push({ role: 'rail-socket', size: [.04, .074, .045],
        center: [railX, railTop - .061, z] });
      // The side frame's two-thirds rail (ukraine.ts addAbramsCageSideFrames: a 22 mm bar in the frame plane x -2.01,
      // lerp of base and roof at 0.66 between the stations at z .28 and -1.28), wrapped by a clamp block that reaches
      // in from the post.
      const t = (.28 - z) / 1.56, sideRailY = (.10 + .66 * 1.20) + t * ((.08 + .66 * 1.26) - (.10 + .66 * 1.20));
      clamps.push({ role: 'side-rail-clamp', size: [.066, .04, .032], center: [-2.029, sideRailY, z] });
      members.push({ role: 'cage-post', size: [.022, bottom - sideRailY - .004, .022],
        center: [postX, (bottom - .009 + sideRailY + .013) / 2, z] });
      members.push({ role: 'lower-arm', size: [.31, .026, .045],
        center: [(railX + outerX) / 2, bottom, z] });
      members.push({ role: 'edge-return', size: [.028, seat.topY - bottom, .045],
        center: [outerX, (seat.topY + bottom) / 2, z] });
      // A welded gusset fills the outer corner where the arm turns up to the return.
      members.push({ role: 'corner-gusset', size: [.04, .04, .012],
        center: [outerX + .031, bottom + .030, z] });
      const span = seat.x + .175 - outerX;
      members.push(...bearerParts([span, .028, .116], [(seat.x + .175 + outerX) / 2, seat.topY - .014, z], feet.map(x => x - (seat.x + .175 + outerX) / 2), true));
    }
    members.push({ role: 'cage-tie', size: [.018, .02, .18 + .022], center: [postX, tieY, seat.z] });
    return [...sockets, ...clamps, ...members];
  }
  for (const z of [-.09, .09]) {
    parts.push(...bearerParts([.35, .028, .116], [seat.x, seat.topY - .014, seat.z + z], feet.map(x => x - seat.x)));
  }
  return parts;
}

interface ReceiverBuilder {
  readonly mats: { readonly hull: THREE.Material; readonly dark?: THREE.Material };
  readonly disposables: { dispose(): void }[];
  postAssemble: TankBuilderPort['postAssemble'];
}

/** Darken the up-facing vertices' shade (vertex colour) by `factor`. */
function grimeTopFaces(geometry: THREE.BufferGeometry, factor: number): void {
  const normal = geometry.getAttribute('normal'), colour = geometry.getAttribute('color');
  for (let index = 0; index < normal.count; index++) {
    if (normal.getY(index) <= .5) continue;
    colour.setXYZ(index, colour.getX(index) * factor, colour.getY(index) * factor, colour.getZ(index) * factor);
  }
  colour.needsUpdate = true;
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
    // Painted like the structure it is welded to. The camouflage buckets project one vehicle-space pattern at a single
    // density and carry baked vertex colour; this mesh bypasses the buckets, so it gets both here. It used to render
    // black (the hull material reads vertex colour, and these boxes had none) with a whole camo tile per small face.
    // The M1A1 SA's hooks and bearers are welded to its dark-steel cage (round 3, 2026-10-10: the dock must read as
    // tied to the cage, not as a painted shelf over it), so they take the cage lattice's own dark steel.
    boxUV(geometry, CAMO_UV_REPEATS_PER_M);
    paintedSurfaceShade(geometry);
    const onDarkCage = id === 'ua_m1a1' && !!P.mats.dark;
    // Round 4 (critics: "pale planks or a bench"): the bearers' wide tops caught the overhead light far brighter than
    // the cage's thin bars; they carry the cage's grime instead, so the bracket reads as one dark steel structure.
    if (onDarkCage) grimeTopFaces(geometry, .62);
    const receiver = new THREE.Mesh(geometry, onDarkCage ? P.mats.dark! : P.mats.hull);
    receiver.name = 'turretMissionReceiver';
    receiver.castShadow = receiver.receiveShadow = true;
    receiver.userData.appearanceRole = onDarkCage ? 'gunmetal' : 'armorPaint';
    rig.turretG.add(receiver);
    P.disposables.push(geometry);
  };
}
