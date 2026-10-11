import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DRONE_AIRFRAME_SCALE } from '../sim/missionAttachment.ts';

/**
 * Fictional service variants, not claims about real national drone inventories. Each airframe follows a real
 * class of combat quadcopter of the 2020s: the carbon true-X or H-frame strike FPV with an underslung shaped charge
 * (an RPG-pattern cone or a short charge with a standoff probe), the guarded "cinewhoop" with molded ducts, and the
 * folding-arm reconnaissance-strike quad with a ball gimbal. `link` is how it is flown: an analog video transmitter
 * with receiver dipoles, a GNSS mast with mesh whips, or a fibre-optic spool paying out behind.
 */
export const DRONE_DESIGNS = {
 USA:{name:'Kestrel',color:0xa29372,accent:0xced3bd,frame:'x',sensor:'gimbal',link:'mesh',warhead:'efp',bell:0x2c3034,wrap:0x2a2e31},
 Russia:{name:'Korshun',color:0x546144,accent:0xd9b16b,frame:'h',sensor:'fpv',link:'fiber',warhead:'pg7',bell:0x2a2c2a,wrap:0x2c3a52},
 USSR:{name:'Korshun',color:0x546144,accent:0xd9b16b,frame:'h',sensor:'fpv',link:'fiber',warhead:'pg7',bell:0x2a2c2a,wrap:0x2c3a52},
 Germany:{name:'Falke',color:0x555d50,accent:0xcdba8c,frame:'duct',sensor:'gimbal',link:'mesh',warhead:'efp',bell:0x30343a,wrap:0x2b2d30},
 Britain:{name:'Merlin',color:0x5f694e,accent:0xd9c790,frame:'h',sensor:'fpv',link:'radio',warhead:'efp',bell:0x3a2a2a,wrap:0x27313d},
 France:{name:'Crecerelle',color:0x646c5c,accent:0x93afc4,frame:'x',sensor:'fpv',link:'radio',warhead:'efp',bell:0x26364a,wrap:0x2a2c30},
 China:{name:'Feng',color:0x838e7c,accent:0xd7c3a4,frame:'duct',sensor:'gimbal',link:'mesh',warhead:'efp',bell:0x2d3133,wrap:0x30302c},
 Japan:{name:'Hayabusa',color:0xa1ac9b,accent:0xddded0,frame:'fold',sensor:'gimbal',link:'mesh',warhead:'efp',bell:0x34383c,wrap:0x2f3236},
 Sweden:{name:'Falk',color:0x4e6258,accent:0xb9c6ac,frame:'fold',sensor:'gimbal',link:'radio',warhead:'efp',bell:0x2c3236,wrap:0x2e3134},
 Israel:{name:'Nesher',color:0xa89a78,accent:0xd8c9a5,frame:'h',sensor:'gimbal',link:'mesh',warhead:'efp',bell:0x3b3428,wrap:0x2c2f2e},
 Poland:{name:'Sokol',color:0x536553,accent:0xd7bcbc,frame:'x',sensor:'fpv',link:'radio',warhead:'pg7',bell:0x3a2c2e,wrap:0x2a3038},
 Italy:{name:'Nibbio',color:0x767451,accent:0xc4cba7,frame:'fold',sensor:'gimbal',link:'radio',warhead:'efp',bell:0x353331,wrap:0x2f302d},
 Korea:{name:'Mae',color:0x607467,accent:0xc6d7bd,frame:'duct',sensor:'gimbal',link:'mesh',warhead:'efp',bell:0x2e3438,wrap:0x2b3035},
 Ukraine:{name:'Sokil',color:0x716d46,accent:0xc0b465,frame:'x',sensor:'fpv',link:'radio',warhead:'pg7',bell:0x3b3324,wrap:0x2a3a4a},
} as const;
export type DroneNation=keyof typeof DRONE_DESIGNS;
/** Field paint of the carrier-mounted dock per service: the steel takes the vehicle fleet's own colour, not the drone's. */
export const DRONE_DOCK_PAINT:Readonly<Record<DroneNation,number>> = {
 USA:0x6f6447, Russia:0x4a5440, USSR:0x4a5440, Germany:0x4c5345, Britain:0x4f5641, France:0x535747, China:0x56604c,
 Japan:0x4b5541, Sweden:0x4a5549, Israel:0x80765c, Poland:0x4c5643, Italy:0x5b5a45, Korea:0x4c574a, Ukraine:0x55543b,
};
/** Beyond this camera distance an airframe (docked or flying) draws its lite build: every member, no sub-centimetre hardware. */
export const DRONE_LITE_DISTANCE_M = 26;
type DroneDesign=(typeof DRONE_DESIGNS)[DroneNation];
export function droneNation(nation?:string):DroneNation {
 if(nation==='USSR/Russia')return 'Russia';if(nation==='UK')return 'Britain';if(nation==='South Korea')return 'Korea';
 return nation && nation in DRONE_DESIGNS?nation as DroneNation:'USA';
}

// Authoring units: the finished airframe is scaled by DRONE_AIRFRAME_SCALE. Every finite part lies inside one of the
// certified dock stock volumes (sim/missionAttachment.ts REFERENCE_STOCK, here in authoring units): the centre body,
// the rear antenna block, the H rails, the landing gear, and per corner the arm, the motor column and the rotor disc.
const MOTOR_OFFSET = .48, ROTOR_Y = .14, SKID_Y = -.2, SKID_R = .0189;
const MOTORS = [[-1,-1],[-1,1],[1,-1],[1,1]] as const;
// Painted steel, carbon, copper and glass share four merged materials; small colour changes ride in vertex colours.
const CARBON = 0x272a2d, CARBON_EDGE = 0x363a3e, PCB = 0x1c3a2b, WIRE_RED = 0x8c2318, WIRE_BLACK = 0x121314,
 WIRE_WHITE = 0xd9d6cb, RUBBER = 0x151617, STRAP = 0x18191a, BUCKLE = 0x8e3024, COPPER = 0x7a4a2a,
 STEEL = 0xb9bbb8, ZINC = 0x8b8e88, BLACK_ANODE = 0x1f2124, FIBER = 0xe6e2d4, HAZARD = 0xd2a326;

type Color3 = readonly [number, number, number];
const linear = (hex:number):Color3 => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

/** One merged material bucket. `colored` buckets carry vertex colours, the painted one takes its material colour. */
// The distant (lite) airframe keeps every structural member and drops sub-centimetre hardware.
let liteBuild = false;
const seg = (n:number) => liteBuild ? Math.max(5, Math.round(n * .5)) : n;
class Bucket {
 readonly parts:THREE.BufferGeometry[]=[];
 readonly colored:boolean;
 constructor(colored:boolean) { this.colored = colored; }
 add(geometry:THREE.BufferGeometry,hex=0xffffff):void {
  if (liteBuild && this.colored) {
   geometry.computeBoundingSphere();
   if ((geometry.boundingSphere?.radius ?? 1) < .022) { geometry.dispose(); return; }
  }
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) geometry.dispose();
  for (const name of Object.keys(flat.attributes)) if (name !== 'position' && name !== 'normal') flat.deleteAttribute(name);
  if (!flat.getAttribute('normal')) flat.computeVertexNormals();
  if (this.colored) {
   const [r, g, b] = linear(hex), count = flat.getAttribute('position').count, colors = new Float32Array(count * 3);
   for (let i = 0; i < count; i++) { colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b; }
   flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  this.parts.push(flat);
 }
 merge():THREE.BufferGeometry {
  const result = mergeGeometries(this.parts, false);
  for (const part of this.parts) part.dispose();
  if (!result) throw new Error('drone airframe bucket could not be merged');
  return result;
 }
}

const up = new THREE.Vector3(0, 1, 0);
function box(w:number,h:number,d:number,x:number,y:number,z:number,rx=0,ry=0,rz=0):THREE.BufferGeometry {
 const g = new THREE.BoxGeometry(w, h, d);
 if (rx || ry || rz) g.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')));
 return g.translate(x, y, z);
}
function cylinder(rTop:number,rBottom:number,h:number,segments:number,x:number,y:number,z:number,open=false):THREE.BufferGeometry {
 return new THREE.CylinderGeometry(rTop, rBottom, h, seg(segments), 1, open).translate(x, y, z);
}
/** A closed cylinder whose axis is x, y or z, centred at (x,y,z). */
function axisCylinder(r:number,h:number,segments:number,axis:'x'|'y'|'z',x:number,y:number,z:number):THREE.BufferGeometry {
 const g = new THREE.CylinderGeometry(r, r, h, seg(segments));
 if (axis === 'x') g.rotateZ(Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
 return g.translate(x, y, z);
}
/** A round member between two points. */
function rod(r:number,a:readonly number[],b:readonly number[],segments=6):THREE.BufferGeometry {
 const start = new THREE.Vector3(a[0], a[1], a[2]), end = new THREE.Vector3(b[0], b[1], b[2]);
 const g = new THREE.CylinderGeometry(r, r, start.distanceTo(end), seg(segments), 1, true);
 g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, end.clone().sub(start).normalize()));
 return g.translate((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
}
/** Lathe of (radius, along) pairs around +Z (axis 'z') or +Y. */
function lathe(profile:readonly (readonly [number,number])[],segments:number,axis:'y'|'z',x:number,y:number,z:number):THREE.BufferGeometry {
 const g = new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(Math.max(r, 1e-4), h)), seg(segments));
 if (axis === 'z') g.rotateX(Math.PI / 2);
 return g.translate(x, y, z);
}
/** Convex outline (x,z pairs, either winding) extruded between y0 and y1, with flat faces. */
function plate(outline:readonly (readonly [number,number])[],y0:number,y1:number):THREE.BufferGeometry {
 const positions:number[] = [];
 const ring = signedArea(outline) > 0 ? outline : [...outline].reverse();
 const n = ring.length;
 for (let i = 1; i < n - 1; i++) {
  const a = ring[0]!, b = ring[i]!, c = ring[i + 1]!;
  positions.push(a[0], y1, a[1], c[0], y1, c[1], b[0], y1, b[1]);
  positions.push(a[0], y0, a[1], b[0], y0, b[1], c[0], y0, c[1]);
 }
 for (let i = 0; i < n; i++) {
  const a = ring[i]!, b = ring[(i + 1) % n]!;
  positions.push(a[0], y0, a[1], a[0], y1, a[1], b[0], y1, b[1], a[0], y0, a[1], b[0], y1, b[1], b[0], y0, b[1]);
 }
 const g = new THREE.BufferGeometry();
 g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
 g.computeVertexNormals();
 return g;
}
function signedArea(points:readonly (readonly [number,number])[]):number {
 let area = 0;
 for (let i = 0; i < points.length; i++) { const a = points[i]!, b = points[(i + 1) % points.length]!; area += a[0] * b[1] - b[0] * a[1]; }
 return -area;
}
/** Chamfered rectangle outline centred at (x,z). */
function chamfered(halfX:number,halfZ:number,cut:number,x=0,z=0):[number,number][] {
 return [[x - halfX + cut, z - halfZ],[x + halfX - cut, z - halfZ],[x + halfX, z - halfZ + cut],[x + halfX, z + halfZ - cut],
  [x + halfX - cut, z + halfZ],[x - halfX + cut, z + halfZ],[x - halfX, z + halfZ - cut],[x - halfX, z - halfZ + cut]];
}
/** A flat bar from a to b (x,z) that narrows from w0 to w1, with a bevelled top edge. */
function taperedBar(a:readonly [number,number],b:readonly [number,number],w0:number,w1:number,y0:number,y1:number,bevel:number):THREE.BufferGeometry {
 const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz), px = -dz / length, pz = dx / length;
 const section = (p:readonly [number,number],w:number):number[][] => {
  const h = w / 2;
  return [[-h, y0],[h, y0],[h, y1 - bevel],[h - bevel, y1],[-h + bevel, y1],[-h, y1 - bevel]].map(([s, y]) => [p[0] + px * s!, y!, p[1] + pz * s!]);
 };
 const ra = section(a, w0), rb = section(b, w1), positions:number[] = [];
 const quad = (p:number[],q:number[],r:number[],s:number[]) => positions.push(...p, ...q, ...r, ...p, ...r, ...s);
 for (let i = 0; i < 6; i++) { const j = (i + 1) % 6; quad(ra[i]!, rb[i]!, rb[j]!, ra[j]!); }
 for (let i = 1; i < 5; i++) { positions.push(...ra[0]!, ...ra[i + 1]!, ...ra[i]!); positions.push(...rb[0]!, ...rb[i]!, ...rb[i + 1]!); }
 const g = new THREE.BufferGeometry();
 g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
 g.computeVertexNormals();
 return g;
}
/** Closed loft through octagonal sections (z, halfWidth, bottom, top, chamfer), for molded fuselages. */
function loft(sections:readonly (readonly [number,number,number,number,number])[]):THREE.BufferGeometry {
 const rings = sections.map(([z, hw, bottom, top, cut]) => [[-hw + cut, bottom],[hw - cut, bottom],[hw, bottom + cut],[hw, top - cut],
  [hw - cut, top],[-hw + cut, top],[-hw, top - cut],[-hw, bottom + cut]].map(([x, y]) => [x!, y!, z]));
 const positions:number[] = [];
 const quad = (p:number[],q:number[],r:number[],s:number[]) => positions.push(...p, ...q, ...r, ...p, ...r, ...s);
 for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < 8; i++) {
  const j = (i + 1) % 8;
  quad(rings[k]![i]!, rings[k]![j]!, rings[k + 1]![j]!, rings[k + 1]![i]!);
 }
 const first = rings[0]!, last = rings[rings.length - 1]!;
 for (let i = 1; i < 7; i++) { positions.push(...first[0]!, ...first[i]!, ...first[i + 1]!); positions.push(...last[0]!, ...last[i + 1]!, ...last[i]!); }
 const g = new THREE.BufferGeometry();
 g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
 g.computeVertexNormals();
 return g;
}

interface AirframeBuckets { carbon:Bucket; paint:Bucket; metal:Bucket; glass:Bucket }

/** Outrunner: anodised bell posts over copper windings, a machined base and a steel shaft under the prop nut. */
function addMotor(b:AirframeBuckets,design:DroneDesign,x:number,z:number,base:number):void {
 const top = Math.min(.119, base + .066);
 b.metal.add(cylinder(.046, .046, .008, 16, x, base + .004, z), BLACK_ANODE);
 b.metal.add(cylinder(.038, .038, top - base - .02, 10, x, (base + .008 + top - .012) / 2, z), COPPER);
 b.metal.add(cylinder(.049, .049, .012, 14, x, base + .014, z), design.bell);
 b.metal.add(cylinder(.044, .049, .013, 14, x, top - .0065, z), design.bell);
 for (let i = 0; i < 8; i++) {
  const angle = i * Math.PI / 4 + Math.PI / 8;
  b.metal.add(box(.026, top - base - .032, .008, x + Math.cos(angle) * .0455, (base + .02 + top - .013) / 2, z + Math.sin(angle) * .0455, 0, Math.PI / 2 - angle, 0), design.bell);
 }
 b.metal.add(cylinder(.016, .016, .004, 10, x, top + .001, z), STEEL);
 b.metal.add(cylinder(.0055, .0055, ROTOR_Y - .011 - top, 8, x, (top + ROTOR_Y - .011) / 2, z), STEEL);
}
/** Three phase leads laid along an arm's top from its motor toward the stack. */
function addMotorLeads(b:AirframeBuckets,x:number,z:number,y:number,toward:readonly [number,number],length:number):void {
 const dx = toward[0] - x, dz = toward[1] - z, d = Math.hypot(dx, dz), ux = dx / d, uz = dz / d;
 for (const [side, hex] of [[-1, WIRE_RED],[0, WIRE_BLACK],[1, WIRE_WHITE]] as const) {
  const ox = -uz * side * .009, oz = ux * side * .009;
  b.carbon.add(rod(.0042, [x + ux * .055 + ox, y, z + uz * .055 + oz], [x + ux * length + ox, y, z + uz * length + oz], 5), hex);
 }
}

/** X arms (or folding arms) from the body to each motor column, the motor pads and the motors. */
function addCornerArms(b:AirframeBuckets,design:DroneDesign,kind:'x'|'duct'|'fold'):void {
 for (const [sx, sz] of MOTORS) {
  const mx = sx * MOTOR_OFFSET, mz = sz * MOTOR_OFFSET;
  if (kind === 'fold') {
   // Molded folding arm on a vertical hinge pin at the fuselage shoulder.
   const hx = sx * .12, hz = sz * .12;
   b.paint.add(taperedBar([hx + sx * .012, hz + sz * .012], [mx, mz], .058, .046, .03, .062, .008));
   b.metal.add(cylinder(.027, .027, .046, 12, hx, .047, hz), BLACK_ANODE);
   b.metal.add(cylinder(.008, .008, .05, 8, hx, .047, hz), STEEL);
   b.paint.add(cylinder(.056, .056, .02, 16, mx, .052, mz));
   addMotor(b, design, mx, mz, .062);
  } else {
   b.carbon.add(taperedBar([sx * .115, sz * .125], [mx, mz], .078, .054, .031, .045, .004), CARBON);
   b.carbon.add(cylinder(.058, .058, .014, 16, mx, .038, mz), CARBON);
   for (let i = 0; i < 4; i++) {
    const angle = i * Math.PI / 2 + Math.PI / 4;
    b.metal.add(cylinder(.0065, .0065, .004, 6, mx + Math.cos(angle) * .03, .029, mz + Math.sin(angle) * .03), STEEL);
   }
   addMotor(b, design, mx, mz, .045);
   addMotorLeads(b, mx, mz, .0472, [0, 0], .27);
  }
 }
}

/** H frame: twin square carbon tubes, end plugs, clamp blocks, short motor arms and a belly plate. */
function addHFrame(b:AirframeBuckets,design:DroneDesign):void {
 for (const sx of [-1, 1]) {
  const x = sx * .14;
  b.carbon.add(box(.044, .044, 1.0, x, .035, 0), CARBON);
  b.carbon.add(box(.036, .0035, .99, x, .0585 - .0045, 0), CARBON_EDGE);
  for (const sz of [-1, 1]) {
   b.metal.add(box(.046, .046, .01, x, .035, sz * .5), BLACK_ANODE);
   const mz = sz * MOTOR_OFFSET, mx = sx * MOTOR_OFFSET;
   b.carbon.add(taperedBar([x, mz], [mx, mz], .052, .048, .031, .045, .004), CARBON);
   b.carbon.add(cylinder(.058, .058, .014, 16, mx, .038, mz), CARBON);
   b.metal.add(box(.064, .056, .058, x, .035, mz), BLACK_ANODE);
   for (const dy of [-.019, .019]) b.metal.add(axisCylinder(.006, .07, 6, 'x', x, .035 + dy, mz), STEEL);
   addMotor(b, design, mx, mz, .045);
   addMotorLeads(b, mx, mz, .0472, [x, mz], .27);
  }
 }
 for (const z of [-.42, .36]) b.carbon.add(rod(.016, [-.14, .035, z], [.14, .035, z], 10), CARBON);
 b.carbon.add(plate(chamfered(.16, .25, .03, 0, .05), .005, .013), CARBON);
}

/** Molded guard rings around each rotor, tied to the body deck under the disc. */
function addDucts(b:AirframeBuckets):void {
 for (const [sx, sz] of MOTORS) {
  const mx = sx * MOTOR_OFFSET, mz = sz * MOTOR_OFFSET;
  b.paint.add(cylinder(.302, .302, .044, 32, mx, .127, mz, true));
  b.paint.add(cylinder(.293, .293, .044, 32, mx, .127, mz, true));
  b.paint.add(new THREE.TorusGeometry(.2975, .0055, 4, seg(32)).rotateX(Math.PI / 2).translate(mx, .1485, mz));
  b.paint.add(new THREE.RingGeometry(.274, .302, seg(32), 1).rotateX(-Math.PI / 2).translate(mx, .105, mz));
  b.paint.add(new THREE.RingGeometry(.274, .302, seg(32), 1).rotateX(Math.PI / 2).translate(mx, .1045, mz));
  // Three spokes: an outer run under the disc, a short rise inside the motor column from the motor pad.
  for (let i = 0; i < 3; i++) {
   const angle = Math.atan2(-sz, -sx) + Math.PI / 3 + i * 2 * Math.PI / 3, c = Math.cos(angle), s = Math.sin(angle);
   b.paint.add(rod(.005, [mx + c * .066, .109, mz + s * .066], [mx + c * .286, .111, mz + s * .286], 6));
   b.paint.add(rod(.005, [mx + c * .056, .046, mz + s * .056], [mx + c * .066, .109, mz + s * .066], 6));
  }
  // Bridge from the guard toward the body deck, under the rotor plane.
  b.paint.add(taperedBar([sx * .2, sz * .2], [sx * .272, sz * .272], .05, .05, .101, .113, .003));
 }
 // The deck the bridges meet: a molded cross over the stack.
 b.paint.add(plate([[-.215, -.17],[-.17, -.215],[.17, -.215],[.215, -.17],[.215, .17],[.17, .215],[-.17, .215],[-.215, .17]], .101, .113));
}

/** Central stack of the carbon frames: plates, standoffs, flight controller, capacitor. */
function addStack(b:AirframeBuckets,design:DroneDesign,frame:'x'|'h'|'duct',fiber:boolean):number {
 const lower = frame === 'h' ? .057 : .045, upper = lower + .08;
 if (frame === 'h') b.carbon.add(plate(chamfered(.165, .24, .04, 0, .02), lower, lower + .006), CARBON);
 else {
  b.carbon.add(plate(chamfered(.125, .23, .05, 0, .05), .026, .031), CARBON);
  b.carbon.add(plate(chamfered(.13, .21, .05, 0, .02), lower, lower + .006), CARBON);
 }
 b.carbon.add(plate(fiber ? chamfered(.1, .21, .035, 0, -.01) : chamfered(.1, .245, .035, 0, -.035), upper, upper + .007), CARBON);
 for (const x of [-.07, .07]) for (const z of [-.13, .1]) b.metal.add(cylinder(.0095, .0095, upper - lower - .006, 8, x, (lower + .006 + upper) / 2, z), design.bell);
 for (const [i, y] of [lower + .022, lower + .046].entries()) {
  b.carbon.add(box(.072, .005, .072, 0, y, -.02), PCB);
  for (let k = 0; k < 6; k++) b.carbon.add(box(.012, .006, .009, -.025 + (k % 3) * .025, y + .005, -.045 + Math.floor(k / 3) * .05), i ? 0x2a2b2e : 0x3d3f42);
 }
 b.carbon.add(cylinder(.014, .014, .05, 10, .045, lower + .03, -.11), 0x24324a);
 b.carbon.add(rod(.004, [.045, lower + .03, -.085], [.02, lower + .022, -.05], 4), WIRE_RED);
 return upper + .007;
}

/** 6S pack on the top plate: heat-shrink wrap, a printed band, two straps with buckles, XT60 and balance leads. */
function addBattery(b:AirframeBuckets,design:DroneDesign,base:number,front=.13,rear=-.17):void {
 const top = base + .094, half = .074, cut = .012, z = (front + rear) / 2, depth = front - rear;
 const section = new THREE.Shape([[-half + cut, base],[half - cut, base],[half, base + cut],[half, top - cut],[half - cut, top],[-half + cut, top],[-half, top - cut],[-half, base + cut]].map(([x, y]) => new THREE.Vector2(x, y)));
 const pack = new THREE.ExtrudeGeometry(section, { depth, bevelEnabled: false }).translate(0, 0, rear);
 b.carbon.add(pack, design.wrap);
 b.carbon.add(box(half * 2 + .002, top - base - .03, .05, 0, (base + top) / 2, z + depth * .18), 0x8c8a7c);
 for (const sz of [rear + .08, front - .08]) {
  b.carbon.add(box(half * 2 + .012, .006, .028, 0, top + .003, sz), STRAP);
  for (const sx of [-1, 1]) b.carbon.add(box(.006, top - base + .012, .028, sx * (half + .006), (base + top) / 2, sz), STRAP);
  b.metal.add(box(.03, .009, .034, half * .45, top + .006, sz), BUCKLE);
 }
 // XT60 lead to the stack's left rear; balance lead tucked on the right.
 b.carbon.add(rod(.0075, [-.058, base + .03, rear - .003], [-.058, base + .012, rear - .032], 6), WIRE_RED);
 b.carbon.add(rod(.0075, [-.026, base + .03, rear - .003], [-.026, base + .012, rear - .032], 6), WIRE_BLACK);
 b.carbon.add(box(.05, .022, .03, -.042, base + .011, rear - .046), 0xc7a93a);
 b.carbon.add(rod(.003, [half - .012, top - .01, rear - .002], [half + .008, base + .034, rear + .018], 4), WIRE_WHITE);
 b.carbon.add(box(.01, .026, .014, half + .009, base + .028, rear + .03), 0xe4e1d8);
}

/** Pilot camera: a micro body in a printed cage between the plates, tilted up for forward flight. */
function addFpvCamera(b:AirframeBuckets,y:number,z:number):void {
 const tilt = -.42;
 for (const sx of [-1, 1]) b.paint.add(plate([[sx * .041, z - .05],[sx * .041, z + .03],[sx * .048, z + .03],[sx * .048, z - .05]], y - .036, y + .036));
 b.carbon.add(box(.066, .062, .056, 0, y, z - .006, tilt), 0x202224);
 const dir = new THREE.Vector3(0, -Math.sin(tilt), Math.cos(tilt));
 const lensAt = new THREE.Vector3(0, y, z - .006).addScaledVector(dir, .04);
 b.metal.add(rod(.02, lensAt.clone().addScaledVector(dir, -.016).toArray(), lensAt.clone().addScaledVector(dir, .012).toArray(), 14), 0x232527);
 b.glass.add(rod(.0145, lensAt.clone().addScaledVector(dir, .011).toArray(), lensAt.clone().addScaledVector(dir, .0135).toArray(), 14));
 b.metal.add(axisCylinder(.0045, .1, 6, 'x', 0, y, z - .006), STEEL);
}

/** Two-axis ball gimbal hung under the nose: yoke, EO and thermal apertures. */
function addGimbal(b:AirframeBuckets,mountY:number,z:number):void {
 const ball = mountY - .066;
 b.paint.add(box(.13, .012, .05, 0, mountY - .006, z));
 for (const sx of [-1, 1]) b.paint.add(box(.012, .06, .03, sx * .061, mountY - .036, z));
 b.metal.add(axisCylinder(.012, .124, 10, 'x', 0, ball, z), BLACK_ANODE);
 b.paint.add(new THREE.SphereGeometry(.05, seg(16), seg(10)).translate(0, ball, z));
 b.metal.add(rod(.026, [0, ball + .006, z + .036], [0, ball + .004, z + .052], 16), 0x1b1c1e);
 b.glass.add(rod(.019, [0, ball + .0042, z + .051], [0, ball + .004, z + .0535], 16));
 b.metal.add(rod(.014, [.026, ball - .016, z + .034], [.026, ball - .017, z + .047], 12), 0x1b1c1e);
 b.carbon.add(rod(.011, [.026, ball - .017, z + .046], [.026, ball - .0172, z + .0478], 12), 0x3a2f3c);
}

/** Underslung charge: an RPG-pattern cone with a piezo nose fuze, or a short charge with a standoff probe. */
function addWarhead(b:AirframeBuckets,kind:'pg7'|'efp',mountY:number,probeEnd:number):void {
 if (kind === 'pg7') {
  const y = Math.min(-.088, mountY - .093), r = .09;
  b.paint.add(lathe([[0,-.305],[.038,-.305],[.048,-.29],[.056,-.27],[.086,-.24],[r,-.2],[r,-.03],[.085,.03],[.071,.1],[.053,.17],[.035,.24],[.023,.29],[.019,.31]], 20, 'z', 0, y, 0));
  b.metal.add(lathe([[.019,.305],[.018,.345],[.014,.36],[.009,.372],[0,.376]], 16, 'z', 0, y, 0), 0x6f7064);
  b.carbon.add(lathe([[r + .0012,-.16],[r + .0012,-.14]], 20, 'z', 0, y, 0), HAZARD);
  b.carbon.add(lathe([[r + .0012,-.09],[r + .0012,-.085]], 20, 'z', 0, y, 0), 0x111111);
  for (const z of [-.2, -.03]) {
   b.carbon.add(new THREE.TorusGeometry(r + .003, .004, 4, seg(20)).translate(0, y, z), STRAP);
   b.carbon.add(box(.04, mountY - (y + r) + .004, .022, 0, (mountY + y + r) / 2, z), STRAP);
  }
  b.metal.add(box(.1, .01, .26, 0, mountY - .005, -.115), ZINC);
  return;
 }
 const y = -.098;
 b.paint.add(lathe([[0,-.13],[.05,-.13],[.064,-.115],[.066,-.09],[.066,.085],[.06,.1],[.052,.104]], 18, 'z', 0, y, 0));
 b.metal.add(lathe([[.052,.104],[.045,.1],[.03,.094],[0,.09]], 18, 'z', 0, y, 0), COPPER);
 b.carbon.add(lathe([[.0672,-.05],[.0672,-.035]], 18, 'z', 0, y, 0), HAZARD);
 b.metal.add(rod(.0075, [0, y, .095], [0, y, probeEnd - .02], 8), STEEL);
 b.metal.add(lathe([[.012,0],[.014,.008],[.012,.016],[0,.02]], 10, 'z', 0, y, probeEnd - .02), 0x2d2e30);
 b.metal.add(axisCylinder(.018, .03, 10, 'z', 0, y, -.145), BLACK_ANODE);
 b.carbon.add(rod(.004, [0, y + .015, -.15], [0, mountY - .01, -.16], 4), WIRE_BLACK);
 for (const z of [-.08, .05]) {
  b.carbon.add(new THREE.TorusGeometry(.07, .006, 4, seg(18)).translate(0, y, z), STRAP);
  b.carbon.add(box(.034, mountY - (y + .07) + .004, .02, 0, (mountY + y + .07) / 2, z), STRAP);
 }
 b.metal.add(box(.09, .01, .2, 0, mountY - .005, -.015), ZINC);
}

/** Skids on printed-strut gear, tied to the lower plate through anodised blocks. */
function addLandingGear(b:AirframeBuckets,mountY:number):void {
 for (const sx of [-1, 1]) {
  const x = sx * .205;
  b.paint.add(rod(SKID_R, [x, SKID_Y, -.268], [x, SKID_Y, .31], 8));
  for (const z of [-.268, .31]) b.carbon.add(new THREE.SphereGeometry(SKID_R, seg(8), seg(5)).translate(x, SKID_Y, z), RUBBER);
  for (const z of [-.17, .19]) {
   b.metal.add(box(.042, .028, .044, sx * .125, mountY - .014, z), BLACK_ANODE);
   b.paint.add(rod(.0125, [sx * .127, mountY - .02, z], [x, SKID_Y + .01, z + (z > 0 ? .02 : -.02)], 8));
   b.metal.add(box(.03, .02, .03, x, SKID_Y + .012, z + (z > 0 ? .02 : -.02)), BLACK_ANODE);
  }
 }
}

/** How the aircraft is flown: video transmitter and receiver dipoles, GNSS mast and whips, or a fibre spool. */
function addLink(b:AirframeBuckets,kind:'radio'|'fiber'|'mesh',topY:number,mountY:number,mastX=0):void {
 if (kind === 'radio') {
  // Lollipop VTX antenna on a printed mount at the right rear; receiver dipoles taped down the rear struts.
  const x = mastX || .05;
  b.paint.add(box(.046, .02, .046, x, topY + .01, -.21));
  b.carbon.add(rod(.0065, [x, topY + .02, -.21], [x, .24, -.248], 6), WIRE_BLACK);
  b.carbon.add(rod(.0065, [x, .24, -.248], [x, .292, -.276], 6), WIRE_BLACK);
  b.carbon.add(new THREE.SphereGeometry(.031, seg(12), seg(7)).scale(1, .62, 1).translate(x, .306, -.282), 0x2b2d2f);
  for (const sx of [-1, 1]) {
   const ax = sx * .127, ay = mountY - .02, bx = sx * .205, by = SKID_Y + .01, t = .3;
   const start = [ax + (bx - ax) * t, ay + (by - ay) * t, -.17 - .02 * t];
   b.carbon.add(rod(.0035, start, [sx * .19, -.165, -.235], 4), WIRE_BLACK);
   b.carbon.add(rod(.0045, [sx * .19, -.165, -.2], [sx * .19, -.165, -.27], 5), WIRE_WHITE);
  }
  return;
 }
 if (kind === 'mesh') {
  const x = mastX;
  b.metal.add(cylinder(.009, .009, .25 - topY, 8, x, (topY + .25) / 2, -.255), BLACK_ANODE);
  b.paint.add(cylinder(.044, .046, .024, 18, x, .262, -.255));
  b.carbon.add(cylinder(.036, .036, .004, 18, x, .276, -.255), 0xd8d4c4);
  if (topY < .2) b.metal.add(box(.124, .01, .018, x, .205, -.255), BLACK_ANODE);
  for (const sx of [-1, 1]) {
   const wx = Math.max(-.11, Math.min(.11, x + sx * .052));
   b.metal.add(cylinder(.011, .011, .02, 8, wx, .215, -.255), BLACK_ANODE);
   b.carbon.add(rod(.0045, [wx, .224, -.255], [Math.max(-.145, Math.min(.145, wx + sx * .093)), .355, -.292], 5), 0x1a1b1c);
  }
  return;
 }
 // Fibre-optic spool: wound canister on rail brackets, payout eyelet and the trailing line.
 b.paint.add(lathe([[.078,-.4],[.08,-.392],[.08,-.248],[.078,-.24]], 20, 'z', 0, .145, 0));
 b.carbon.add(lathe([[.0805,-.37],[.0805,-.27]], 20, 'z', 0, .145, 0), FIBER);
 b.paint.add(lathe([[0,-.4],[.03,-.4],[.03,-.425],[.014,-.44],[0,-.44]], 12, 'z', 0, .145, 0));
 b.metal.add(new THREE.TorusGeometry(.009, .003, 4, seg(8)).translate(0, .145, -.445), STEEL);
 b.carbon.add(rod(.0018, [0, .145, -.445], [0, .13, -.54], 3), FIBER);
 for (const z of [-.37, -.27]) for (const sx of [-1, 1]) b.metal.add(rod(.0075, [sx * .132, .057, z], [sx * .062, .093, z], 6), BLACK_ANODE);
}

/** Folding reconnaissance-strike body: molded fuselage, slide-in pack with grip, GNSS dome and vents. */
function addFoldBody(b:AirframeBuckets,design:DroneDesign):void {
 b.paint.add(loft([[-.4,.07,.045,.115,.025],[-.3,.1,.032,.148,.035],[-.1,.115,.025,.162,.04],[.1,.115,.025,.162,.04],[.25,.1,.032,.142,.035],[.33,.072,.045,.118,.025],[.365,.045,.06,.1,.015]]));
 b.carbon.add(box(.14, .046, .26, 0, .184, -.22), design.wrap);
 b.carbon.add(box(.1, .012, .2, 0, .213, -.22), 0x3a3d40);
 b.carbon.add(box(.142, .02, .03, 0, .19, -.08), 0x8c8a7c);
 b.paint.add(new THREE.SphereGeometry(.042, seg(14), seg(6), 0, Math.PI * 2, 0, Math.PI / 2).scale(1, .55, 1).translate(0, .161, .04));
 for (let i = 0; i < 4; i++) b.carbon.add(box(.006, .03, .09, -.045 + i * .03, .15, .18, .35), 0x141516);
 for (const sx of [-1, 1]) b.carbon.add(box(.004, .05, .14, sx * .116, .095, -.1), 0x2b2e30);
 b.paint.add(box(.18, .012, .36, 0, .022, -.03));
}

export interface DroneModelKit {
 body:THREE.BufferGeometry; equipment:THREE.BufferGeometry; metal:THREE.BufferGeometry; lens:THREE.BufferGeometry;
 rotor:THREE.BufferGeometry; rotorBlur:THREE.BufferGeometry;
 bodyMaterial:THREE.MeshStandardMaterial; equipmentMaterial:THREE.MeshStandardMaterial; metalMaterial:THREE.MeshStandardMaterial;
 lensMaterial:THREE.MeshStandardMaterial; rotorMaterial:THREE.MeshStandardMaterial; blurMaterial:THREE.MeshStandardMaterial;
 /** Rigid airframe parts in draw order, each a merged mesh with its own material. */
 parts:readonly {geometry:THREE.BufferGeometry;material:THREE.MeshStandardMaterial}[];
 name:string; frame:DroneDesign['frame'];
 dispose():void;
}

/** Twisted three-blade propeller: tapered planform, washout from root to tip, round hub and nut. */
function createRotor(radius:number):THREE.BufferGeometry {
 const bucket = new Bucket(true), stations = [0, .1, .25, .45, .65, .82, .93, 1];
 const chord = (f:number) => f < .25 ? .046 + f / .25 * .03 : f < .82 ? .076 - (f - .25) / .57 * .024 : .052 - (f - .82) / .18 * .036;
 const pitch = (f:number) => (19 - 8 * f) * Math.PI / 180, root = .021;
 for (let blade = 0; blade < 3; blade++) {
  const positions:number[] = [], rings:number[][][] = [];
  for (const f of stations) {
   const r = root + (radius - root) * f, c = chord(f), t = Math.max(.0022, .0075 * (1 - f)), a = pitch(f), ca = Math.cos(a), sa = Math.sin(a);
   const local = [[.36 * c, 0],[.05 * c, t * .5],[-.64 * c, 0],[.05 * c, -t * .3]];
   rings.push(local.map(([zc, yc]) => [r, yc! * ca + zc! * sa, -yc! * sa + zc! * ca]));
  }
  const quad = (p:number[],q:number[],r:number[],s:number[]) => positions.push(...p, ...q, ...r, ...p, ...r, ...s);
  for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(rings[k]![i]!, rings[k + 1]![i]!, rings[k + 1]![j]!, rings[k]![j]!); }
  const tip = rings[rings.length - 1]!;
  positions.push(...tip[0]!, ...tip[1]!, ...tip[2]!, ...tip[0]!, ...tip[2]!, ...tip[3]!);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  bucket.add(g.rotateY(blade * Math.PI * 2 / 3), 0x1b1c1e);
 }
 bucket.add(cylinder(.022, .022, .022, 14, 0, 0, 0), 0x202124);
 bucket.add(cylinder(.0085, .012, .004, 10, 0, .013, 0), 0x8f9294);
 return bucket.merge();
}
/** Spinning-disc impression: a thin translucent ring with a denser tip band and three faint blade passages. */
function createRotorBlur(radius:number):THREE.BufferGeometry {
 const radial = [.03, .06, .14 * radius / .29, .5 * radius, .82 * radius, .9 * radius, .965 * radius, radius], segments = 48;
 const alpha = (r:number) => r < .06 ? .14 : r < .82 * radius ? .38 - .08 * (r / radius) : r < .965 * radius ? .5 : 0;
 const positions:number[] = [], colors:number[] = [];
 for (let s = 0; s < segments; s++) for (let k = 0; k < radial.length - 1; k++) {
  const a0 = s / segments * Math.PI * 2, a1 = (s + 1) / segments * Math.PI * 2, r0 = radial[k]!, r1 = radial[k + 1]!;
  const corner = (r:number,a:number) => { positions.push(Math.cos(a) * r, 0, Math.sin(a) * r); colors.push(.2, .205, .215, alpha(r) * (.8 + .2 * Math.cos(3 * a))); };
  corner(r0, a0); corner(r1, a1); corner(r1, a0); corner(r0, a0); corner(r0, a1); corner(r1, a1);
 }
 const g = new THREE.BufferGeometry();
 g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
 g.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from({ length: positions.length / 3 }, () => [0, 1, 0]).flat(), 3));
 g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
 return g;
}

/** Four merged materials (carbon and plastics, national paint, anodised metal, glass) plus the propellers. Motor
 * bells, guards, wiring, payload straps, camera mounts and landing gear share the exact airframe between its parked
 * and airborne presentations. */
export function createDroneModelKit(nation?:string,detail:'full'|'lite'='full'):DroneModelKit {
 liteBuild = detail === 'lite';
 try { return buildDroneModelKit(DRONE_DESIGNS[droneNation(nation)]); }
 finally { liteBuild = false; }
}
function buildDroneModelKit(design:DroneDesign):DroneModelKit {
 const b:AirframeBuckets = { carbon: new Bucket(true), paint: new Bucket(false), metal: new Bucket(true), glass: new Bucket(false) };
 const frame = design.frame, fiber = design.link === 'fiber';
 let topY:number;
 if (frame === 'fold') {
  addFoldBody(b, design);
  addCornerArms(b, design, 'fold');
  topY = .162;
 } else {
  if (frame === 'h') addHFrame(b, design);
  else addCornerArms(b, design, frame);
  if (frame === 'duct') addDucts(b);
  topY = addStack(b, design, frame, fiber);
  addBattery(b, design, topY);
 }
 const mountY = frame === 'h' ? .005 : frame === 'fold' ? .016 : .026;
 const cameraY = frame === 'h' ? .1 : .088, cameraZ = frame === 'h' ? .3 : .265;
 if (frame !== 'fold') addFpvCamera(b, cameraY, cameraZ);
 if (design.sensor === 'gimbal') addGimbal(b, mountY, frame === 'fold' ? .3 : .27);
 addWarhead(b, design.warhead, mountY, design.sensor === 'gimbal' ? .19 : .34);
 addLandingGear(b, mountY);
 if (frame === 'fold') addLink(b, design.link, .207, mountY, .058);
 else addLink(b, design.link, topY, mountY);
 const body = b.carbon.merge(), equipment = b.paint.merge(), metal = b.metal.merge(), lens = b.glass.merge();
 for (const geometry of [body, equipment, metal, lens]) geometry.scale(DRONE_AIRFRAME_SCALE, DRONE_AIRFRAME_SCALE, DRONE_AIRFRAME_SCALE);
 const radius = frame === 'duct' ? .262 : .295;
 const rotor = createRotor(radius).scale(DRONE_AIRFRAME_SCALE, DRONE_AIRFRAME_SCALE, DRONE_AIRFRAME_SCALE);
 const rotorBlur = createRotorBlur(radius).scale(DRONE_AIRFRAME_SCALE, DRONE_AIRFRAME_SCALE, DRONE_AIRFRAME_SCALE);
 // Matte composite and anodised metal: carbon and printed parts scatter, metal keeps a soft machined highlight.
 const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: .58, metalness: .06 });
 const equipmentMaterial = new THREE.MeshStandardMaterial({ color: design.color, roughness: .74, metalness: .04 });
 const metalMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: .36, metalness: .82 });
 const lensMaterial = new THREE.MeshStandardMaterial({ color: 0x2f4a56, emissive: 0x0b1f28, roughness: .08, metalness: .55 });
 const rotorMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: .5, metalness: .05, side: THREE.DoubleSide });
 const blurMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, transparent: true, depthWrite: false, roughness: .7, metalness: 0, side: THREE.DoubleSide });
 for (const [material, label] of [[bodyMaterial,'composite'],[equipmentMaterial,'paint'],[metalMaterial,'metal'],[lensMaterial,'glass'],[rotorMaterial,'propellers'],[blurMaterial,'rotor blur']] as const) material.name = `FPV ${design.name} ${label}`;
 const parts = [{ geometry: body, material: bodyMaterial },{ geometry: equipment, material: equipmentMaterial },{ geometry: metal, material: metalMaterial },{ geometry: lens, material: lensMaterial }];
 return { body, equipment, metal, lens, rotor, rotorBlur, bodyMaterial, equipmentMaterial, metalMaterial, lensMaterial, rotorMaterial, blurMaterial, parts,
  name: design.name, frame,
  dispose() {
   for (const geometry of [body, equipment, metal, lens, rotor, rotorBlur]) geometry.dispose();
   for (const material of [bodyMaterial, equipmentMaterial, metalMaterial, lensMaterial, rotorMaterial, blurMaterial]) material.dispose();
  } };
}
/** Engine lit-material registration (cascaded shadows), installed once by the battle FX and the Garage preview. */
export interface DroneMaterialHooks { setup?(material:THREE.Material):unknown; release?(material:THREE.Material):unknown }
let materialHooks:DroneMaterialHooks = {};
export function configureDroneMaterials(hooks:DroneMaterialHooks):void { materialHooks = hooks; }
export function droneMaterialHooks():DroneMaterialHooks { return materialHooks; }
interface CachedKit { kit:DroneModelKit; users:number; hooks:DroneMaterialHooks; extras:Map<string,{dispose():void}> }
const kitCache = new Map<string,CachedKit>();
export interface DroneKitLease {
 readonly kit:DroneModelKit;
 /** Per-kit derived resources (a parked airframe), built once and disposed with the kit. */
 shared<T extends {dispose():void}>(key:string,build:(kit:DroneModelKit)=>T):T;
 release():void;
}
/** One airframe build per nation and detail, shared by every dock and the flight pools; disposed with its last user. */
export function acquireDroneModelKit(nation?:string,detail:'full'|'lite'='full'):DroneKitLease {
 const key = `${droneNation(nation)}:${detail}`;
 let entry = kitCache.get(key);
 if (!entry) {
  const kit = createDroneModelKit(nation, detail), hooks = materialHooks;
  for (const material of [...kit.parts.map(part => part.material), kit.rotorMaterial, kit.blurMaterial]) hooks.setup?.(material);
  entry = { kit, users: 0, hooks, extras: new Map() };
  kitCache.set(key, entry);
 }
 entry.users++;
 const owned = entry;
 let released = false;
 return {
  kit: owned.kit,
  shared(name, build) {
   let value = owned.extras.get(name);
   if (!value) { value = build(owned.kit); owned.extras.set(name, value); }
   return value as ReturnType<typeof build>;
  },
  release() {
   if (released) return;
   released = true;
   if (--owned.users > 0) return;
   kitCache.delete(key);
   for (const extra of owned.extras.values()) extra.dispose();
   for (const material of [...owned.kit.parts.map(part => part.material), owned.kit.rotorMaterial, owned.kit.blurMaterial]) owned.hooks.release?.(material);
   owned.kit.dispose();
  },
 };
}
/** Diagonal pairs turn the same way (props-out), so each rotor's twist faces its own airflow. */
export function droneRotorDirection(index:number):1|-1 { return (index < 2) === (index % 2 === 0) ? 1 : -1; }
export function poseDroneRotor(prop:THREE.Object3D,index:number,spin:number):void {
 prop.position.set(index<2?-MOTOR_OFFSET:MOTOR_OFFSET,ROTOR_Y,index%2?MOTOR_OFFSET:-MOTOR_OFFSET).multiplyScalar(DRONE_AIRFRAME_SCALE);
 const direction = droneRotorDirection(index);
 prop.rotation.y=spin*direction+index*.8;prop.scale.set(direction,1,1);prop.updateMatrix();
}
