import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MissionAttachment } from '../sim/missionAttachment.ts';
import { weatherVertexColors } from '../fx/droneModel.ts';

/**
 * The drone dock as field kit (round 3): a 10 mm steel plate frame bolted where its members cross, standing on round
 * tube legs with bolted foot flanges and rubber isolators; rubber skid channels; four quick-release skid clamps
 * (fixed posts here, the swinging hook heads in `createMissionHoldDownGeometry`); a junction box with its cable run down
 * a rear leg. Every member is built inside the finite stock that `missionCradleVolumes` certifies against the carrier
 * (the native support audit and the roof-weapon sweep), and the clamps' heads inside the parked airframe's own gear
 * stock, so the audited dock is exactly what renders. Seat-local metres; one vertex-coloured mesh, worn and dusted.
 */
const RUBBER = 0x17181a, ZINC = 0x7e817c, CABLE = 0x121314, STEEL_DARK = 0x2b2e2c, LED = 0x5fd16a, HAZARD = 0xc9a12d,
 RELEASE = 0xb3361f;

type Color3 = readonly [number, number, number];
const linear = (hex:number):Color3 => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const shade = (hex:number, k:number):number => {
 const c = new THREE.Color(hex);
 return new THREE.Color(c.r * k, c.g * k, c.b * k).getHex();
};

class CradleBuilder {
 readonly parts:THREE.BufferGeometry[] = [];
 add(geometry:THREE.BufferGeometry, hex:number):void {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) geometry.dispose();
  for (const name of Object.keys(flat.attributes)) if (name !== 'position' && name !== 'normal') flat.deleteAttribute(name);
  if (!flat.getAttribute('normal')) flat.computeVertexNormals();
  // Each member's paint weathered its own way (a few percent either side), as field kit does.
  const k = .94 + .12 * memberShade(this.parts.length);
  const [r, g, b] = linear(hex).map(v => v * k) as unknown as Color3, count = flat.getAttribute('position').count, colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b; }
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  this.parts.push(flat);
 }
 box(w:number, h:number, d:number, x:number, y:number, z:number, hex:number):void {
  this.add(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);
 }
 /** A box between two corners. */
 span(x0:number, y0:number, z0:number, x1:number, y1:number, z1:number, hex:number):void {
  this.box(x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, hex);
 }
 cylinder(r:number, h:number, segments:number, axis:'x'|'y'|'z', x:number, y:number, z:number, hex:number):void {
  const g = new THREE.CylinderGeometry(r, r, h, segments);
  if (axis === 'x') g.rotateZ(Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
  this.add(g.translate(x, y, z), hex);
 }
 /** A vertical round member from y0 to y1. */
 post(r:number, x:number, y0:number, y1:number, z:number, hex:number, segments = 10):void {
  this.cylinder(r, y1 - y0, segments, 'y', x, (y0 + y1) / 2, z, hex);
 }
 rod(r:number, a:readonly number[], b:readonly number[], hex:number, segments = 6):void {
  const start = new THREE.Vector3(a[0], a[1], a[2]), end = new THREE.Vector3(b[0], b[1], b[2]);
  const g = new THREE.CylinderGeometry(r, r, start.distanceTo(end), segments, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize()));
  this.add(g.translate((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2), hex);
 }
 /** A flat plate (x0..x1, z0..z1) between y0 and y1 with chamfered corners. */
 plate(x0:number, x1:number, z0:number, z1:number, y0:number, y1:number, cut:number, hex:number):void {
  const c = Math.min(cut, (x1 - x0) / 3, (z1 - z0) / 3);
  const outline = [[x0 + c, z0],[x1 - c, z0],[x1, z0 + c],[x1, z1 - c],[x1 - c, z1],[x0 + c, z1],[x0, z1 - c],[x0, z0 + c]];
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x!, -z!)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false });
  g.rotateX(-Math.PI / 2).translate(0, y0, 0);
  this.add(g, hex);
 }
 merge():THREE.BufferGeometry {
  const result = mergeGeometries(this.parts, false);
  for (const part of this.parts) part.dispose();
  if (!result) throw new Error('mission cradle geometry could not be merged');
  return result;
 }
}

const memberShade = (index:number) => { const s = Math.sin(index * 91.7 + 13.1) * 43758.5453; return s - Math.floor(s); };
const BARE_STEEL = 0x6c6d68, WELD = 0x4a4b46, DUST_LIGHT = 0x9a8f78, GRIME = 0x3b352c;

/** Plate top (seat-local metres); the skids rest on the channels at 0.039. */
const PLATE_TOP = .012, PLATE_BOTTOM = .002;
/** The skid clamps: posts beside the skids, between the gear's struts. Seat-local, before the payload offset. The red
 * arm hinges at the post's top (HINGE_Y, axis along the skid) and flips from over the skid to straight up. */
const CLAMP_X = .112, CLAMP_Z = .055, HINGE_Y = .0675;
/** The airframe's skid line, seat-local (droneModel: x 0.205 authoring at DRONE_AIRFRAME_SCALE 0.45). */
const SKID_X = .0923;

export function createMissionCradleGeometry(seat:MissionAttachment, paint:number):THREE.BufferGeometry {
 const c = new CradleBuilder(), dark = shade(paint, .72);
 const [dx, dz] = seat.payloadOffset ?? [0, 0];
 const fx = seat.footX, fz = seat.footZ;
 const width = seat.width + Math.abs(dx) - .004, depth = seat.depth + Math.abs(dz) - .004;
 const xMin = dx / 2 - width / 2, xMax = dx / 2 + width / 2, zMin = dz / 2 - depth / 2, zMax = dz / 2 + depth / 2;
 // The plate frame: two side plates along the skids, cross plates between and outboard of them (no doubled faces).
 for (const x of [-fx + dx, fx + dx]) c.plate(x - .024, x + .024, zMin, zMax, PLATE_BOTTOM, PLATE_TOP, .012, paint);
 for (const z of [-fz, fz]) {
  const runs = [[xMin, -fx + dx - .024],[-fx + dx + .024, fx + dx - .024],[fx + dx + .024, xMax]];
  for (const [x0, x1] of runs) if (x1! - x0! > .004) c.span(x0!, PLATE_BOTTOM, z - .024, x1!, PLATE_TOP, z + .024, paint);
  // Four countersunk bolts where the plates cross; a lightening hole in the cross plate between the skids.
  for (const x of [-fx + dx, fx + dx]) for (const ox of [-.014, .014]) for (const oz of [-.014, .014]) {
   c.cylinder(.0058, .0016, 8, 'y', x + ox, PLATE_TOP + .0008, z + oz, ZINC);
  }
  if (z > 0) c.cylinder(.012, .0006, 14, 'y', dx / 2, PLATE_TOP + .0003, z, shade(paint, .32));
  // Weld beads down both seams where the cross plate meets the side plates.
  for (const x of [-fx + dx, fx + dx]) for (const e of [-.024, .024]) c.rod(.0018, [x + e, PLATE_TOP + .0004, z - .022], [x + e, PLATE_TOP + .0004, z + .022], WELD, 5);
  // Paint chipped back to bare steel along the plate edges.
  for (const [k, x] of [-.13, -.05, .04, .12].entries()) c.box(.007 + .002 * (k % 2), .0006, .004, dx / 2 + x, PLATE_TOP + .0003, z + (k % 2 ? .021 : -.021), BARE_STEEL);
 }
 for (const x of [-fx + dx, fx + dx]) for (const [k, zc] of [-.15, -.03, .11].entries()) c.box(.004, .0006, .006 + .002 * k, x + (k % 2 ? .021 : -.021), PLATE_TOP + .0003, dz / 2 + zc, BARE_STEEL);
 for (const x of [-fx + dx, fx + dx]) for (const z of [dz / 2 - .147, dz / 2 + .147]) c.cylinder(.011, .0006, 14, 'y', x, PLATE_TOP + .0003, z, shade(paint, .32));
 // Junction box on the rear cross plate: lid, screws, status lamp, hazard label, rear connector and side gland.
 c.span(-.047, PLATE_TOP, -fz - .058, .047, .027, -fz + .05, paint);
 c.span(-.049, .027, -fz - .06, .049, .031, -fz + .052, dark);
 for (const sx of [-.04, .04]) for (const sz of [-.05, .042]) c.cylinder(.0035, .002, 8, 'y', sx, .032, -fz - .004 + sz, ZINC);
 c.box(.01, .002, .01, .026, .032, -fz + .03, LED);
 c.box(.04, .002, .024, -.012, .032, -fz - .01, HAZARD);
 c.cylinder(.009, .01, 12, 'z', 0, .021, -fz - .054, STEEL_DARK);
 c.cylinder(.007, .01, 8, 'x', -.045, .019, -fz - .024, STEEL_DARK);
 for (const [i, x] of [-fx, fx].entries()) {
  const sx = x < 0 ? -1 : 1;
  for (const [j, z] of [-fz, fz].entries()) {
   // Rubber skid channel outboard of its clamp: a pad the skid rests on (top at 0.039) with a lip either side of it.
   const sk = sx * SKID_X + dx, sz = j ? 1 : -1, z0 = dz + sz * .066, z1 = dz + sz * .133;
   const [za, zb] = sz > 0 ? [z0, z1] : [z1, z0], [xa, xb] = sx > 0 ? [sk - .009, sk + .018] : [sk - .018, sk + .009];
   c.span(sk - .019, .021, za, sk + .019, .039, zb, RUBBER);
   for (const side of [-1, 1]) c.span(sk + side * .0145 - .003, .0386, za + .004, sk + side * .0145 + .003, .0438, zb - .006, RUBBER);
   // Riser block between the plate and the channel, inside the side plate's stock.
   c.span(xa, PLATE_TOP, za + .002, xb, .021, zb - .002, dark);
   // Quick-release clamp post beside the skid (three runs: plate stock, channel stock, gear stock); the swinging head
   // is a separate mesh. A base boss bolts it to the side plate.
   const px = sx * CLAMP_X + dx, pz = (j ? 1 : -1) * CLAMP_Z + dz;
   c.cylinder(.009, .007, 12, 'y', px, PLATE_TOP + .0035, pz, dark);
   c.add(new THREE.TorusGeometry(.0058, .0016, 4, 12).rotateX(Math.PI / 2).translate(px, PLATE_TOP + .0072, pz), WELD);
   c.post(.0055, px, PLATE_TOP + .007, .021, pz, STEEL_DARK);
   c.post(.0055, px, .021, .039, pz, STEEL_DARK);
   c.post(.0055, px, .039, HINGE_Y - .003, pz, STEEL_DARK);
   // Hinge knuckle at the post's top (the red arm swings about it) and the red quick-release collar below it.
   c.cylinder(.0052, .02, 10, 'z', px, HINGE_Y, pz, STEEL_DARK);
   c.post(.0068, px, .0425, .0495, pz, RELEASE, 12);
   // Leg: round tube standoff under a bolted top flange; the supported foot follows the measured roof.
   const index = i * 2 + j, foot = seat.y - (seat.supportY?.[index] ?? seat.y - .045);
   c.box(.036, .006, .040, x, PLATE_BOTTOM - .003, z, dark);
   c.post(.0145, x, -foot + .008, PLATE_BOTTOM - .006, z, paint, 12);
   // Fillet welds round the tube where it meets its flanges.
   c.add(new THREE.TorusGeometry(.0152, .0022, 4, 14).rotateX(Math.PI / 2).translate(x, PLATE_BOTTOM - .0062, z), WELD);
   c.add(new THREE.TorusGeometry(.0152, .0022, 4, 14).rotateX(Math.PI / 2).translate(x, -foot + .0082, z), WELD);
   if (foot > .07) c.post(.0175, x, -foot * .5 - .004, -foot * .5 + .004, z, dark, 12);
   // Foot: rubber isolator, round flange with four bolts into the roof.
   c.post(.044, x, -foot - .003, -foot, z, RUBBER, 16);
   c.post(.041, x, -foot, -foot + .008, z, paint, 16);
   // round 5 (critics: "no visible fixing"): four hex bolts on washers hold each foot to the roof, big enough to read
   for (const bx of [-.026, .026]) for (const bz of [-.026, .026]) {
    c.post(.0082, x + bx, -foot + .008, -foot + .0089, z + bz, ZINC, 12);
    c.post(.0062, x + bx, -foot + .0089, -foot + .0115, z + bz, ZINC, 6);
   }
  }
 }
 // Power and data cable: from the box gland along the rear plate's underside, clipped down the rear-left leg.
 const rearFoot = seat.y - (seat.supportY?.[0] ?? seat.y - .045);
 c.rod(.0035, [-.05, -.004, -fz - .024], [-fx + .012, -.004, -fz - .024], CABLE);
 c.rod(.0035, [-fx + .012, -.004, -fz - .024], [-fx, -.004, -fz - .0177], CABLE);
 c.rod(.0035, [-fx, -.004, -fz - .0177], [-fx, -rearFoot + .008, -fz - .0177], CABLE);
 c.rod(.0035, [-fx, -rearFoot + .008, -fz - .0177], [-fx, -rearFoot + .008, -fz - .04], CABLE);
 c.cylinder(.007, .008, 10, 'y', -fx, -rearFoot + .004, -fz - .04, STEEL_DARK);
 for (const t of [.3, .7]) c.box(.012, .006, .009, -fx, -.004 - (rearFoot - .02) * t, -fz - .0175, ZINC);
 if (seat.braced) {
  const rise = seat.y - Math.max(...(seat.supportY ?? [seat.y - .045]));
  if (rise >= .20) {
   const lower = -rise + .08, upper = -.045;
   for (const sign of [-1, 1]) {
    c.rod(.0105, [sign * fx, lower, -fz], [sign * fx, upper, fz], paint, 10);
    c.rod(.0105, [-fx, lower, sign * fz], [fx, upper, sign * fz], paint, 10);
   }
  }
 }
 const geometry = c.merge();
 // Field wear: dust on what faces up, grime toward the roof, scuffed paint (the airframe's own law, in metres).
 weatherVertexColors(geometry, .5, -.02, .45, DUST_LIGHT, GRIME);
 return geometry;
}

/** The four quick-release clamps, in seat-local metres (payload offset applied): each arm's hinge and the yaw that
 * points it inward over its skid. */
export function missionHoldDownPivots(seat:MissionAttachment):{x:number;z:number;closedYaw:number}[] {
 const [dx, dz] = seat.payloadOffset ?? [0, 0], result = [];
 for (const sx of [-1, 1]) for (const sz of [-1, 1]) result.push({ x: sx * CLAMP_X + dx, z: sz * CLAMP_Z + dz, closedYaw: sx > 0 ? 0 : Math.PI });
 return result;
}
/** Height of the clamp arms' hinge (the post's top). */
export const MISSION_HOLD_DOWN_Y = HINGE_Y;
/** A clamp arm's pose at an opening fraction (0 holding the skid, 1 standing straight up): it flips about its hinge,
 * eased at both ends. The whole swing stays inside the parked airframe's gear stock (missionAttachmentVisual receipt). */
export function missionHoldDownMatrix(p:{x:number;z:number;closedYaw:number}, open:number, out:THREE.Matrix4):THREE.Matrix4 {
 const h = Math.min(1, Math.max(0, open)), e = h * h * (3 - 2 * h);
 out.makeRotationY(p.closedYaw).multiply(flip.makeRotationZ(-e * Math.PI / 2));
 return out.setPosition(p.x, HINGE_Y, p.z);
}
const flip = new THREE.Matrix4();
/** One clamp arm about its hinge (the hinge on its top edge, so the arm flips up without ever reaching outboard), as a
 * quick-release lever (round 5, critics: "the hold-downs read as orange blocks"): a hinge barrel, a slim dark-steel
 * lever that lies over the skid along local -x, a red grip sleeve on its free end (the release, read before a lift-off),
 * a lip down past the skid's crown and a rubber pad bearing on it. Vertex-coloured, worn like the dock. */
export function createMissionHoldDownGeometry():THREE.BufferGeometry {
 const c = new CradleBuilder();
 c.cylinder(.0042, .013, 10, 'z', -.0062, -.0045, 0, STEEL_DARK);
 c.span(-.034, -.0072, -.0048, -.0045, -.0022, .0048, STEEL_DARK);
 c.span(-.038, -.0095, -.0072, -.0255, 0, .0072, RELEASE);
 for (const x of [-.0335, -.03]) c.span(x - .0007, -.0003, -.0073, x + .0007, .0003, .0073, shade(RELEASE, .62));
 c.span(-.038, -.0175, -.0062, -.0335, -.0095, .0062, STEEL_DARK);
 c.span(-.0335, -.013, -.0058, -.0255, -.0095, .0058, RUBBER);
 const geometry = c.merge();
 weatherVertexColors(geometry, .22, -1, .45);
 return geometry;
}
