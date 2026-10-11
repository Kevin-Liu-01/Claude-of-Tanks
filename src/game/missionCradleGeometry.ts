import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MissionAttachment } from '../sim/missionAttachment.ts';

/**
 * The drone dock as fabricated field kit: welded rectangular-tube rails, rubber-capped skid saddles, side latches,
 * a junction box with its cable run down a rear leg, gusseted legs and bolted foot plates. Every member is built
 * inside the finite stock that `missionCradleVolumes` certifies against the carrier (the native support audit and
 * the roof-weapon sweep), so the audited cradle is exactly what renders. Seat-local metres; one vertex-coloured mesh.
 */
const RUBBER = 0x17181a, ZINC = 0x8d908a, CABLE = 0x121314, STEEL_DARK = 0x2b2e2c, LED = 0x5fd16a, HAZARD = 0xc9a12d;

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
  const [r, g, b] = linear(hex), count = flat.getAttribute('position').count, colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b; }
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  this.parts.push(flat);
 }
 box(w:number, h:number, d:number, x:number, y:number, z:number, hex:number):void {
  this.add(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);
 }
 cylinder(r:number, h:number, segments:number, axis:'x'|'y'|'z', x:number, y:number, z:number, hex:number):void {
  const g = new THREE.CylinderGeometry(r, r, h, segments);
  if (axis === 'x') g.rotateZ(Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
  this.add(g.translate(x, y, z), hex);
 }
 rod(r:number, a:readonly number[], b:readonly number[], hex:number, segments = 6):void {
  const start = new THREE.Vector3(a[0], a[1], a[2]), end = new THREE.Vector3(b[0], b[1], b[2]);
  const g = new THREE.CylinderGeometry(r, r, start.distanceTo(end), segments, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize()));
  this.add(g.translate((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2), hex);
 }
 /** Open rectangular tube along x or z: four walls, so its cut ends read hollow. */
 tube(axis:'x'|'z', length:number, w:number, h:number, wall:number, x:number, y:number, z:number, hex:number):void {
  const along = (l:number, a:number, b:number) => axis === 'x' ? [l, a, b] as const : [b, a, l] as const;
  const [tw, th, td] = along(length, wall, w), [sw, sh, sd] = along(length, h - wall * 2, wall);
  for (const dy of [-(h - wall) / 2, (h - wall) / 2]) this.box(tw, th, td, x, y + dy, z, hex);
  for (const ds of [-(w - wall) / 2, (w - wall) / 2]) {
   const [ox, oz] = axis === 'x' ? [0, ds] : [ds, 0];
   this.box(sw, sh, sd, x + ox, y, z + oz, hex);
  }
 }
 merge():THREE.BufferGeometry {
  const result = mergeGeometries(this.parts, false);
  for (const part of this.parts) part.dispose();
  if (!result) throw new Error('mission cradle geometry could not be merged');
  return result;
 }
}

export function createMissionCradleGeometry(seat:MissionAttachment, paint:number):THREE.BufferGeometry {
 const c = new CradleBuilder(), dark = shade(paint, .72);
 const [dx, dz] = seat.payloadOffset ?? [0, 0];
 const fx = seat.footX, fz = seat.footZ;
 // Cross rails (50 x 25 mm tube), one per skid row, spanning the cantilever when the pad is offset.
 for (const z of [-fz, fz]) {
  c.tube('x', seat.width + Math.abs(dx) - .004, .04, .026, .003, dx / 2, 0, z, paint);
  // Fillet welds where each saddle rail crosses it.
  for (const x of [-fx + dx, fx + dx]) for (const side of [-1, 1]) c.box(.006, .005, .046, x + side * .022, .0135, z, dark);
 }
 // Junction box on the rear rail: lid, screws, status lamp, hazard label, rear connector and side gland.
 c.box(.094, .034, .108, 0, .009, -fz - .004, paint);
 c.box(.098, .006, .112, 0, .029, -fz - .004, dark);
 for (const sx of [-.04, .04]) for (const sz of [-.05, .042]) c.cylinder(.0035, .002, 8, 'y', sx, .033, -fz - .004 + sz, ZINC);
 c.box(.01, .002, .01, .026, .033, -fz + .03, LED);
 c.box(.04, .002, .024, -.012, .033, -fz - .01, HAZARD);
 c.cylinder(.012, .01, 12, 'z', 0, .006, -fz - .055, STEEL_DARK);
 c.cylinder(.007, .01, 8, 'x', -.0445, -.003, -fz - .024, STEEL_DARK);
 for (const [i, x] of [-fx, fx].entries()) {
  const sx = x < 0 ? -1 : 1;
  // Longitudinal rail (48 x 30 mm tube) carrying the saddles.
  c.tube('z', seat.depth + Math.abs(dz) - .004, .048, .03, .003, x + dx, .005, dz / 2, paint);
  for (const [j, z] of [-fz, fz].entries()) {
   // Skid saddle: steel cup with a rubber pad, two retaining bolts at its ends.
   c.box(.08, .012, .095, x + dx, .027, z + dz, paint);
   c.box(.072, .006, .084, x + dx, .036, z + dz, RUBBER);
   for (const e of [-1, 1]) c.cylinder(.0042, .003, 6, 'y', x + dx, .0345, z + dz + e * .0445, ZINC);
   // Side latch: guide plate, hinge blocks and the clamp lever with its red pin.
   const gx = x + dx + sx * .047;
   c.box(.006, .05, .084, gx + sx * .006, .02, z + dz, paint);
   for (const e of [-1, 1]) c.box(.008, .012, .012, gx - sx * .002, .036, z + dz + e * .03, dark);
   c.cylinder(.0042, .072, 8, 'z', gx - sx * .0035, .039, z + dz, ZINC);
   c.box(.004, .016, .006, gx - sx * .0045, .028, z + dz + .036, 0x9b2a20);
   // Leg: square tube post with a cap plate under the rail; the supported foot follows the measured roof.
   const index = i * 2 + j, foot = seat.y - (seat.supportY?.[index] ?? seat.y - .045);
   c.box(.026, Math.max(.004, foot - .008), .028, x, -foot / 2 - .002, z, paint);
   c.box(.036, .006, .042, x, -.003, z, dark);
   if (foot > .07) c.box(.036, .006, .042, x, -foot * .5, z, dark);
   // Foot: rubber isolator, base plate, weld fillet and four bolts into the roof.
   c.box(.092, .002, .097, x, -foot - .003, z, RUBBER);
   c.box(.09, .006, .095, x, -foot + .001, z, paint);
   c.box(.044, .006, .048, x, -foot + .007, z, dark);
   for (const bx of [-.034, .034]) for (const bz of [-.036, .036]) c.cylinder(.0048, .004, 6, 'y', x + bx, -foot + .006, z + bz, ZINC);
  }
 }
 // Power and data cable: from the box gland along the rear rail, clipped down the rear-left leg into the roof.
 const rearFoot = seat.y - (seat.supportY?.[0] ?? seat.y - .045);
 c.rod(.0035, [-.049, -.009, -fz - .024], [-fx + .012, -.009, -fz - .024], CABLE);
 c.rod(.0035, [-fx + .012, -.009, -fz - .024], [-fx, -.009, -fz - .0177], CABLE);
 c.rod(.0035, [-fx, -.009, -fz - .0177], [-fx, -rearFoot + .008, -fz - .0177], CABLE);
 c.rod(.0035, [-fx, -rearFoot + .008, -fz - .0177], [-fx, -rearFoot + .008, -fz - .04], CABLE);
 c.cylinder(.007, .008, 10, 'y', -fx, -rearFoot + .004, -fz - .04, STEEL_DARK);
 for (const t of [.3, .7]) c.box(.012, .006, .009, -fx, -.009 - (rearFoot - .02) * t, -fz - .0175, ZINC);
 if (seat.braced) {
  const rise = seat.y - Math.max(...(seat.supportY ?? [seat.y - .045]));
  if (rise >= .20) {
   const lower = -rise + .08, upper = -.045, thickness = .022;
   const brace = (start:readonly number[], end:readonly number[]) => {
    const a = new THREE.Vector3(start[0], start[1], start[2]), b = new THREE.Vector3(end[0], end[1], end[2]);
    const direction = b.clone().sub(a), rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    const middle = a.add(b).multiplyScalar(.5);
    c.add(new THREE.BoxGeometry(thickness, direction.length(), thickness).applyQuaternion(rotation).translate(middle.x, middle.y, middle.z), paint);
   };
   for (const sign of [-1, 1]) {
    brace([sign * fx, lower, -fz], [sign * fx, upper, fz]);
    brace([-fx, lower, sign * fz], [fx, upper, sign * fz]);
   }
  }
 }
 return c.merge();
}
