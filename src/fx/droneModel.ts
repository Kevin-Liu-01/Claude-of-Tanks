import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DRONE_AIRFRAME_SCALE } from '../sim/missionAttachment.ts';

/**
 * One airframe class for every service (round 3, 2026-10-10): the compact true-X carbon strike FPV of the 2020s front
 * lines. Exposed bell motors on four carbon arms, wide tri-blade props with light tips, a pilot camera between the front
 * side plates, receiver whips (and a video transmitter) at the rear, a 6S pack strapped to the top plate, and an
 * underslung RPG-pattern shaped charge, the field FPV's usual warhead on every side (round 4: a compact round-nosed
 * charge read as a camera ball). Fibre-optic aircraft add a payout spool behind the pack. The frame plates are carbon
 * twill; the rest is matte black; services differ only in how it is flown, the charge's paint and the pack's wrap.
 * Fictional service variants, not claims about real national inventories.
 */
export const DRONE_DESIGNS = {
 USA:{name:'Kestrel',charge:0x5d6046,wrap:0x2a2e33,payload:'pg7',link:'radio'},
 Russia:{name:'Korshun',charge:0x4d5a3b,wrap:0x2c3a52,payload:'pg7',link:'fiber'},
 USSR:{name:'Korshun',charge:0x4d5a3b,wrap:0x2c3a52,payload:'pg7',link:'fiber'},
 Germany:{name:'Falke',charge:0x52573f,wrap:0x2b2d30,payload:'pg7',link:'radio'},
 Britain:{name:'Merlin',charge:0x575c43,wrap:0x27313d,payload:'pg7',link:'radio'},
 France:{name:'Crecerelle',charge:0x5a5d48,wrap:0x2a2c30,payload:'pg7',link:'radio'},
 China:{name:'Feng',charge:0x56604a,wrap:0x30302c,payload:'pg7',link:'radio'},
 Japan:{name:'Hayabusa',charge:0x585e47,wrap:0x2f3236,payload:'pg7',link:'radio'},
 Sweden:{name:'Falk',charge:0x4f5b4a,wrap:0x2e3134,payload:'pg7',link:'radio'},
 Israel:{name:'Nesher',charge:0x6b6448,wrap:0x2c2f2e,payload:'pg7',link:'radio'},
 Poland:{name:'Sokol',charge:0x50593f,wrap:0x2a3038,payload:'pg7',link:'radio'},
 Italy:{name:'Nibbio',charge:0x5f5e44,wrap:0x2f302d,payload:'pg7',link:'radio'},
 Korea:{name:'Mae',charge:0x535f4c,wrap:0x2b3035,payload:'pg7',link:'radio'},
 Ukraine:{name:'Sokil',charge:0x5a5a3a,wrap:0x2a3a4a,payload:'pg7',link:'radio'},
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
// the rear antenna block, the landing gear, and per corner the arm, the motor column and the rotor disc.
const MOTOR_OFFSET = .48, ROTOR_Y = .137, SKID_Y = -.2, SKID_R = .0189, PROP_R = .3;
const ARM_Y0 = .029, ARM_Y1 = .045, MOUNT_Y = .021;
const MOTORS = [[-1,-1],[-1,1],[1,-1],[1,1]] as const;
// Matte black carbon and printed TPU, anodised metal and glass share four merged materials; colour rides in vertex colours.
const CARBON_PLATE = 0x25282c, TPU = 0x18191b, PCB = 0x1c3a2b, WIRE = 0x141516, WIRE_RED = 0x6e1f17,
 WIRE_WHITE = 0xcfccc2, RUBBER = 0x121314, STRAP = 0x151617, BUCKLE = 0x8e3024, COPPER = 0x5a3a24, STEEL = 0x7d8084,
 BLACK_ANODE = 0x1b1d20, BELL = 0x2b2e33, BELL_RING = 0x8f9399, VENT = 0x0a0b0c, FIBER = 0xd8d4c6, HAZARD = 0xb8902a,
 PROP = 0x3a3f45, PROP_TIP = 0xb0b4b8;
const DUST = 0x6e6556, MUD = 0x4a4337;

type Color3 = readonly [number, number, number];
const linear = (hex:number):Color3 => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

// The distant (lite) airframe keeps every structural member and drops sub-centimetre hardware.
let liteBuild = false;
const seg = (n:number) => liteBuild ? Math.max(5, Math.round(n * .5)) : n;
/** One merged material bucket; every bucket carries vertex colours (the materials stay white). */
class Bucket {
 readonly parts:THREE.BufferGeometry[]=[];
 /** `keepSmall`: the lite build keeps this bucket's sub-centimetre parts (the lens is all the glass there is). */
 readonly keepSmall:boolean;
 /** `uvRepeats`: box-projected UVs at this many texture tiles per authoring unit (the carbon twill), or none. */
 readonly uvRepeats:number;
 constructor(keepSmall = false, uvRepeats = 0) { this.keepSmall = keepSmall; this.uvRepeats = uvRepeats; }
 add(geometry:THREE.BufferGeometry,hex:number):void {
  if (liteBuild && !this.keepSmall) {
   geometry.computeBoundingSphere();
   if ((geometry.boundingSphere?.radius ?? 1) < .022) { geometry.dispose(); return; }
  }
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) geometry.dispose();
  for (const name of Object.keys(flat.attributes)) if (name !== 'position' && name !== 'normal') flat.deleteAttribute(name);
  if (!flat.getAttribute('normal')) flat.computeVertexNormals();
  const [r, g, b] = linear(hex), count = flat.getAttribute('position').count, colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b; }
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (this.uvRepeats) boxProjectedUV(flat, this.uvRepeats);
  this.parts.push(flat);
 }
 merge():THREE.BufferGeometry {
  const result = mergeGeometries(this.parts, false);
  for (const part of this.parts) part.dispose();
  if (!result) throw new Error('drone airframe bucket could not be merged');
  return result;
 }
}

/** UVs from the plane each face looks along (its normal's dominant axis), so a woven map lies flat on every face. */
function boxProjectedUV(geometry:THREE.BufferGeometry, repeats:number):void {
 const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), uv = new Float32Array(position.count * 2);
 for (let i = 0; i < position.count; i++) {
  const nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i)), nz = Math.abs(normal.getZ(i));
  const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
  const [u, v] = ny >= nx && ny >= nz ? [x, z] : nx >= nz ? [z, y] : [x, y];
  uv[i * 2] = u * repeats; uv[i * 2 + 1] = v * repeats;
 }
 geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
/** Carbon twill, 2/2: four rounded tows each way per tile, the over-and-under stepping one tow per row. Built from
 * data (no canvas), mipmapped so it averages to an even sheen at a distance. */
function createCarbonTwill(sheen = false):THREE.DataTexture {
 const size = 32, data = new Uint8Array(size * size * 4);
 for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
  const warp = (((i >> 3) + (j >> 3)) & 3) < 2, across = warp ? (j & 7) : (i & 7);
  // Round 4b (critics: the light plates read as grey plastic): dark carbon carries its weave in the sheen — the tows
  // differ strongly here, and the plates read this map as both albedo and roughness.
  // The sheen copy (the roughness map) spans a narrow band (about .6 to .8 of the material's roughness): tows that
  // catch the light differently, never a lacquer mirror (round 4b review: the full range glared white in the Garage).
  const crown = Math.sin((across + .5) / 8 * Math.PI), weave = (warp ? 1 : 0) * .6 + .4 * crown;
  const value = sheen ? Math.round(195 + 60 * weave) : Math.round((warp ? 255 : 150) * (.72 + .28 * crown));
  const o = (j * size + i) * 4; data[o] = data[o + 1] = data[o + 2] = value; data[o + 3] = 255;
 }
 const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
 texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.magFilter = THREE.LinearFilter;
 texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true;
 // colour in sRGB; the sheen copy is data (roughness), read linear
 texture.colorSpace = sheen ? THREE.NoColorSpace : THREE.SRGBColorSpace;
 texture.name = sheen ? 'FPV carbon twill sheen' : 'FPV carbon twill'; texture.needsUpdate = true;
 return texture;
}
/** The landing spin-down's disc strengths, strongest first (droneArrival.ts steps through them). */
export const DRONE_ROTOR_FADE_STEPS = Object.freeze([.82, .64, .46, .3, .16]);
/** One twill tile every 10 mm of finished airframe. */
const TWILL_REPEATS = DRONE_AIRFRAME_SCALE / .01;

/** Deterministic lattice noise in [0,1): the same point always weathers the same way. */
function hash3(x:number,y:number,z:number):number {
 const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
 return s - Math.floor(s);
}
function noise3(x:number,y:number,z:number):number {
 const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
 const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
 let value = 0;
 for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) for (let dz = 0; dz < 2; dz++) {
  value += hash3(ix + dx, iy + dy, iz + dz) * (dx ? ux : 1 - ux) * (dy ? uy : 1 - uy) * (dz ? uz : 1 - uz);
 }
 return value;
}
/** Field wear in the vertex colours: dust settles on what faces up and clings to the gear and the charge's belly;
 * scuffs vary the finish. Positions are authoring units. */
export function weatherVertexColors(geometry:THREE.BufferGeometry,strength:number,lowY:number,scale=1,dustHex=DUST,lowHex=dustHex):void {
 const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), color = geometry.getAttribute('color');
 if (!color || !normal) return;
 const dust = linear(dustHex), grime = linear(lowHex), k0 = 9.1 / scale, k1 = 61.7 / scale;
 for (let i = 0; i < position.count; i++) {
  const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
  const patch = .5 + .5 * noise3(x * k0, y * k0, z * k0);
  const top = Math.max(0, normal.getY(i)) ** 1.6 * patch * strength;
  const low = Math.min(1, Math.max(0, (lowY - y) / (.09 * scale))) * .6 * strength * patch;
  // Dust where it settles, grime where it splashes: one cover fraction shared between the two by their weights.
  const scuff = .9 + .2 * hash3(x * k1, y * k1, z * k1), cover = Math.min(.62, top + low), share = top + low > 1e-6 ? top / (top + low) : 1;
  for (let c = 0; c < 3; c++) color.setComponent(i, c, color.getComponent(i, c) * scuff * (1 - cover) + (dust[c]! * share + grime[c]! * (1 - share)) * cover);
 }
 color.needsUpdate = true;
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

interface AirframeBuckets { carbon:Bucket; plate:Bucket; paint:Bucket; metal:Bucket; glass:Bucket }

/** Exposed outrunner: machined stator base, copper windings in the gap, a flared gunmetal bell with vent windows and a
 * bright machined top ring, the shaft and prop adapter. */
function addMotor(b:AirframeBuckets,x:number,z:number):void {
 const base = ARM_Y1, top = base + .0705;
 b.metal.add(lathe([[0, base],[.045, base],[.047, base + .003],[.047, base + .008],[.041, base + .0105],[0, base + .0105]], 16, 'y', x, 0, z), BLACK_ANODE);
 // The windings show only in the narrow gap between the stator base and the bell, as on the real motor.
 b.metal.add(cylinder(.0395, .0395, .006, 12, x, base + .0125, z), COPPER);
 b.metal.add(lathe([[0, base + .0145],[.047, base + .0145],[.0495, base + .019],[.0495, base + .059],[.046, base + .066],[.031, top],[0, top]], 18, 'y', x, 0, z), BELL);
 b.metal.add(cylinder(.0425, .0438, .0018, 18, x, base + .0676, z, true), BELL_RING);
 for (let i = 0; i < 6; i++) {
  const angle = i * Math.PI / 3 + Math.PI / 6;
  b.metal.add(box(.017, .02, .003, x + Math.cos(angle) * .0497, base + .042, z + Math.sin(angle) * .0497, 0, Math.PI / 2 - angle, 0), VENT);
 }
 b.metal.add(cylinder(.009, .009, ROTOR_Y - .01 - top, 10, x, (top + ROTOR_Y - .01) / 2, z), STEEL);
}
/** Three silicone phase leads laid along an arm's top from its motor toward the stack. */
function addMotorLeads(b:AirframeBuckets,x:number,z:number,y:number,length:number):void {
 const d = Math.hypot(x, z), ux = -x / d, uz = -z / d;
 for (const side of [-1, 0, 1]) {
  const ox = -uz * side * .009, oz = ux * side * .009;
  b.carbon.add(rod(.0042, [x + ux * .06 + ox, y, z + uz * .06 + oz], [x + ux * length + ox, y, z + uz * length + oz], 5), WIRE);
 }
}

/** True-X frame: bottom plate, four arms clamped under a cap plate, standoffs, the flight stack and the top plate. */
function addFrame(b:AirframeBuckets,fiber:boolean):number {
 b.plate.add(plate(chamfered(.125, .25, .05, 0, .02), MOUNT_Y, ARM_Y0), CARBON_PLATE);
 for (const [sx, sz] of MOTORS) {
  const mx = sx * MOTOR_OFFSET, mz = sz * MOTOR_OFFSET;
  b.plate.add(taperedBar([sx * .115, sz * .125], [mx, mz], .084, .06, ARM_Y0, ARM_Y1, .004), CARBON_PLATE);
  b.plate.add(cylinder(.058, .058, ARM_Y1 - ARM_Y0, 18, mx, (ARM_Y0 + ARM_Y1) / 2, mz), CARBON_PLATE);
  for (let i = 0; i < 4; i++) {
   const angle = i * Math.PI / 2 + Math.PI / 4;
   b.metal.add(cylinder(.0065, .0065, .004, 6, mx + Math.cos(angle) * .03, ARM_Y0 - .002, mz + Math.sin(angle) * .03), STEEL);
  }
  addMotor(b, mx, mz);
  addMotorLeads(b, mx, mz, ARM_Y1 + .0042, .27);
 }
 b.plate.add(plate(chamfered(.13, .21, .05, 0, .01), ARM_Y1, ARM_Y1 + .006), CARBON_PLATE);
 const lower = ARM_Y1 + .006, upper = lower + .074;
 b.plate.add(plate(fiber ? chamfered(.1, .21, .035, 0, -.01) : chamfered(.1, .245, .035, 0, -.035), upper, upper + .007), CARBON_PLATE);
 for (const x of [-.07, .07]) for (const z of [-.13, .1]) b.metal.add(cylinder(.0095, .0095, upper - lower, 8, x, (lower + upper) / 2, z), BLACK_ANODE);
 for (const [i, y] of [lower + .018, lower + .042].entries()) {
  b.carbon.add(box(.072, .005, .072, 0, y, -.02), PCB);
  for (let k = 0; k < 6; k++) b.carbon.add(box(.012, .006, .009, -.025 + (k % 3) * .025, y + .005, -.045 + Math.floor(k / 3) * .05), i ? 0x2a2b2e : 0x3d3f42);
 }
 b.carbon.add(cylinder(.014, .014, .05, 10, .045, lower + .028, -.11), 0x24324a);
 b.carbon.add(rod(.004, [.045, lower + .028, -.085], [.02, lower + .02, -.05], 4), WIRE_RED);
 return upper + .007;
}

/** 6S pack on the top plate: heat-shrink wrap, a printed band, two straps with buckles, XT60 and balance leads. */
function addBattery(b:AirframeBuckets,design:DroneDesign,base:number,front=.13,rear=-.17):void {
 const top = base + .094, half = .074, cut = .012, z = (front + rear) / 2, depth = front - rear;
 const section = new THREE.Shape([[-half + cut, base],[half - cut, base],[half, base + cut],[half, top - cut],[half - cut, top],[-half + cut, top],[-half, top - cut],[-half, base + cut]].map(([x, y]) => new THREE.Vector2(x, y)));
 const pack = new THREE.ExtrudeGeometry(section, { depth, bevelEnabled: false }).translate(0, 0, rear);
 b.carbon.add(pack, design.wrap);
 b.carbon.add(box(half * 2 + .002, top - base - .03, .05, 0, (base + top) / 2, z + depth * .18), 0x7d7b70);
 for (const sz of [rear + .08, front - .08]) {
  b.carbon.add(box(half * 2 + .012, .006, .028, 0, top + .003, sz), STRAP);
  for (const sx of [-1, 1]) b.carbon.add(box(.006, top - base + .012, .028, sx * (half + .006), (base + top) / 2, sz), STRAP);
  b.metal.add(box(.03, .009, .034, half * .45, top + .006, sz), BUCKLE);
 }
 b.carbon.add(rod(.0075, [-.058, base + .03, rear - .003], [-.058, base + .012, rear - .032], 6), WIRE_RED);
 b.carbon.add(rod(.0075, [-.026, base + .03, rear - .003], [-.026, base + .012, rear - .032], 6), WIRE);
 b.carbon.add(box(.05, .022, .03, -.042, base + .011, rear - .046), 0xb39634);
 b.carbon.add(rod(.003, [half - .012, top - .01, rear - .002], [half + .008, base + .034, rear + .018], 4), WIRE_WHITE);
 b.carbon.add(box(.01, .026, .014, half + .009, base + .028, rear + .03), 0xd2cfc6);
}

/** Pilot camera: a micro body in printed TPU side plates at the nose, tilted up for forward flight. */
function addFpvCamera(b:AirframeBuckets,y:number,z:number):void {
 const tilt = -.42;
 for (const sx of [-1, 1]) b.carbon.add(plate([[sx * .041, z - .05],[sx * .041, z + .03],[sx * .049, z + .03],[sx * .049, z - .05]], y - .038, y + .038), TPU);
 b.carbon.add(box(.066, .062, .056, 0, y, z - .006, tilt), 0x202224);
 const dir = new THREE.Vector3(0, -Math.sin(tilt), Math.cos(tilt));
 const lensAt = new THREE.Vector3(0, y, z - .006).addScaledVector(dir, .04);
 b.metal.add(rod(.021, lensAt.clone().addScaledVector(dir, -.016).toArray(), lensAt.clone().addScaledVector(dir, .013).toArray(), 14), 0x1e2022);
 b.glass.add(rod(.0155, lensAt.clone().addScaledVector(dir, .012).toArray(), lensAt.clone().addScaledVector(dir, .0145).toArray(), 14), 0xffffff);
 b.metal.add(axisCylinder(.0045, .102, 6, 'x', 0, y, z - .006), STEEL);
}

/** Underslung charge on black straps: an RPG-pattern cone with a piezo nose fuze. */
function addWarhead(b:AirframeBuckets,design:DroneDesign):void {
 const mountY = MOUNT_Y, paint = design.charge;
 {
  const y = Math.min(-.088, mountY - .093), r = .09;
  b.paint.add(lathe([[0,-.305],[.038,-.305],[.048,-.29],[.056,-.27],[.086,-.24],[r,-.2],[r,-.03],[.085,.03],[.071,.1],[.053,.17],[.035,.24],[.023,.29],[.019,.31]], 20, 'z', 0, y, 0), paint);
  b.metal.add(lathe([[.019,.305],[.018,.345],[.014,.36],[.009,.372],[0,.376]], 16, 'z', 0, y, 0), 0x5f6058);
  b.carbon.add(lathe([[r + .0012,-.16],[r + .0012,-.14]], 20, 'z', 0, y, 0), HAZARD);
  b.carbon.add(lathe([[r + .0012,-.09],[r + .0012,-.085]], 20, 'z', 0, y, 0), 0x111111);
  for (const z of [-.2, -.03]) {
   b.carbon.add(new THREE.TorusGeometry(r + .003, .004, 4, seg(20)).translate(0, y, z), STRAP);
   b.carbon.add(box(.04, mountY - (y + r) + .004, .022, 0, (mountY + y + r) / 2, z), STRAP);
  }
  b.metal.add(box(.1, .01, .26, 0, mountY - .005, -.115), BLACK_ANODE);
 }
}

/** Black printed-TPU skids on angled struts, tied to the bottom plate through anodised blocks; rubber end caps. */
function addLandingGear(b:AirframeBuckets):void {
 const mountY = MOUNT_Y;
 for (const sx of [-1, 1]) {
  const x = sx * .205;
  b.carbon.add(rod(SKID_R, [x, SKID_Y, -.268], [x, SKID_Y, .31], 8), TPU);
  for (const z of [-.268, .31]) b.carbon.add(new THREE.SphereGeometry(SKID_R, seg(8), seg(5)).translate(x, SKID_Y, z), RUBBER);
  for (const z of [-.17, .19]) {
   b.metal.add(box(.042, .028, .044, sx * .125, mountY - .014, z), BLACK_ANODE);
   b.carbon.add(rod(.0125, [sx * .127, mountY - .02, z], [x, SKID_Y + .01, z + (z > 0 ? .02 : -.02)], 8), TPU);
   b.metal.add(box(.03, .02, .03, x, SKID_Y + .012, z + (z > 0 ? .02 : -.02)), BLACK_ANODE);
  }
 }
}

/** Rear antennas: receiver whips in a V on every airframe; the video transmitter's lollipop on a radio link, or the
 * fibre-optic spool (wound canister on rail brackets, payout eyelet and trailing line) on a fibre link. */
function addLink(b:AirframeBuckets,kind:'radio'|'fiber',topY:number):void {
 for (const sx of [-1, 1]) {
  // Two runs each, so every triangle lies wholly in the body or the antenna block.
  const a = [sx * .09, topY + .012, -.2], mid = [sx * .105, .25, -.2555], knee = [sx * .115, .307, -.2855], tip = [sx * .125, .335, -.3];
  b.carbon.add(box(.022, .018, .03, sx * .09, topY + .009, -.2), TPU);
  b.carbon.add(rod(.0042, a, mid, 5), WIRE);
  b.carbon.add(rod(.0042, mid, knee, 5), WIRE);
  b.carbon.add(rod(.0046, knee, tip, 5), WIRE_WHITE);
 }
 if (kind === 'radio') {
  const x = .0;
  b.carbon.add(box(.046, .02, .046, x, topY + .01, -.21), TPU);
  b.carbon.add(rod(.0065, [x, topY + .02, -.21], [x, .24, -.248], 6), WIRE);
  b.carbon.add(rod(.0065, [x, .24, -.248], [x, .292, -.276], 6), WIRE);
  b.carbon.add(new THREE.SphereGeometry(.031, seg(12), seg(7)).scale(1, .62, 1).translate(x, .306, -.282), 0x26282a);
  return;
 }
 b.carbon.add(lathe([[.078,-.4],[.08,-.392],[.08,-.248],[.078,-.24]], 20, 'z', 0, .145, 0), 0x26282b);
 b.carbon.add(lathe([[.0805,-.37],[.0805,-.27]], 20, 'z', 0, .145, 0), FIBER);
 b.carbon.add(lathe([[0,-.4],[.03,-.4],[.03,-.425],[.014,-.44],[0,-.44]], 12, 'z', 0, .145, 0), TPU);
 b.metal.add(new THREE.TorusGeometry(.009, .003, 4, seg(8)).translate(0, .145, -.445), STEEL);
 b.carbon.add(rod(.0018, [0, .145, -.445], [0, .13, -.54], 3), FIBER);
 for (const z of [-.37, -.27]) for (const sx of [-1, 1]) b.metal.add(rod(.0075, [sx * .132, .057, z], [sx * .062, .093, z], 6), BLACK_ANODE);
}

export interface DroneModelKit {
 body:THREE.BufferGeometry; plate:THREE.BufferGeometry; equipment:THREE.BufferGeometry; metal:THREE.BufferGeometry; lens:THREE.BufferGeometry;
 rotor:THREE.BufferGeometry; rotorBlur:THREE.BufferGeometry;
 /** The disc at under half strength: shown over the blades while they spool up or slow down. */
 rotorBlurFaint:THREE.BufferGeometry;
 /** The disc fading in five steps (strength .82 to .16): a landing's spin-down shows a different disc every frame. */
 rotorBlurSteps:readonly THREE.BufferGeometry[];
 bodyMaterial:THREE.MeshStandardMaterial; plateMaterial:THREE.MeshStandardMaterial; equipmentMaterial:THREE.MeshStandardMaterial; metalMaterial:THREE.MeshStandardMaterial;
 lensMaterial:THREE.MeshStandardMaterial; rotorMaterial:THREE.MeshStandardMaterial; blurMaterial:THREE.MeshStandardMaterial;
 /** Rigid airframe parts in draw order, each a merged mesh with its own material. */
 parts:readonly {geometry:THREE.BufferGeometry;material:THREE.MeshStandardMaterial}[];
 name:string;
 dispose():void;
}

/** Wide twisted three-blade propeller: broad planform with a rounded tip, washout from root to tip, a light tip band
 * that reads in motion, round hub and nut. */
function createRotor(radius:number):THREE.BufferGeometry {
 const bucket = new Bucket(), stations = [0, .08, .18, .3, .45, .6, .75, .86, .93, 1], band = 7;
 const chord = (f:number) => f < .3 ? .05 + f / .3 * .046 : f < .86 ? .096 - (f - .3) / .56 * .03 : .066 - (f - .86) / .14 * .042;
 const pitch = (f:number) => (17 - 8 * f) * Math.PI / 180, root = .023;
 for (let blade = 0; blade < 3; blade++) {
  const rings:number[][][] = [];
  for (const f of stations) {
   const r = root + (radius - root) * f, c = chord(f), t = Math.max(.0022, .0078 * (1 - f)), a = pitch(f), ca = Math.cos(a), sa = Math.sin(a);
   const local = [[.36 * c, 0],[.05 * c, t * .5],[-.64 * c, 0],[.05 * c, -t * .3]];
   rings.push(local.map(([zc, yc]) => [r, yc! * ca + zc! * sa, -yc! * sa + zc! * ca]));
  }
  for (const [from, to, hex] of [[0, band, PROP],[band, rings.length - 1, PROP_TIP]] as const) {
   const positions:number[] = [];
   const quad = (p:number[],q:number[],r:number[],s:number[]) => positions.push(...p, ...q, ...r, ...p, ...r, ...s);
   for (let k = from; k < to; k++) for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(rings[k]![i]!, rings[k + 1]![i]!, rings[k + 1]![j]!, rings[k]![j]!); }
   if (to === rings.length - 1) { const tip = rings[to]!; positions.push(...tip[0]!, ...tip[1]!, ...tip[2]!, ...tip[0]!, ...tip[2]!, ...tip[3]!); }
   const g = new THREE.BufferGeometry();
   g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
   g.computeVertexNormals();
   bucket.add(g.rotateY(blade * Math.PI * 2 / 3), hex);
  }
 }
 bucket.add(cylinder(.024, .024, .02, 14, 0, 0, 0), 0x202124);
 bucket.add(cylinder(.0085, .012, .006, 10, 0, .013, 0), 0x8f9294);
 return bucket.merge();
}
/** Spinning-disc impression: a translucent grey disc that thickens outward, a bright tip ring that echoes the blade
 * tips and reads against dark kit and bright sky alike, and three faint blade passages. `strength` scales its opacity
 * (the faint disc shows over slowing or quickening blades). */
function createRotorBlur(radius:number,strength=1):THREE.BufferGeometry {
 const radial = [.03, .06, .14 * radius / .29, .5 * radius, .84 * radius, .9 * radius, .965 * radius, radius], segments = 48;
 const alpha = (r:number) => strength * (r < .06 ? .12 : r < .84 * radius ? .24 + .1 * (r / radius) : r < .965 * radius ? .64 : 0);
 const shade = (r:number) => r < .84 * radius ? .28 : .62;
 const positions:number[] = [], colors:number[] = [];
 for (let s = 0; s < segments; s++) for (let k = 0; k < radial.length - 1; k++) {
  const a0 = s / segments * Math.PI * 2, a1 = (s + 1) / segments * Math.PI * 2, r0 = radial[k]!, r1 = radial[k + 1]!;
  // The band's own shade, sampled at its middle, so the tip ring stays one colour across its width.
  const tone = shade((r0 + r1) / 2);
  const corner = (r:number,a:number) => { positions.push(Math.cos(a) * r, 0, Math.sin(a) * r); colors.push(tone, tone * 1.02, tone * 1.07, alpha(r) * (.8 + .2 * Math.cos(3 * a))); };
  corner(r0, a0); corner(r1, a1); corner(r1, a0); corner(r0, a0); corner(r0, a1); corner(r1, a1);
 }
 const normals = Array.from({ length: positions.length / 3 }, () => [0, 1, 0]).flat();
 // Round 4b (critics, wave 411c: from a camera at dock height the discs vanished edge-on before touchdown): a thin
 // blurred ribbon at the tip circle, 3.2 cm of authoring height (inside the rotor stock's y band), so a spinning disc
 // seen side-on is a translucent line across its span, never nothing.
 const ribbonR = .985 * radius, ribbonH = .016, ribbonAlpha = .3 * strength, ribbonTone = .28;
 const ribbonMask = new Array(positions.length / 3).fill(0);
 for (let s = 0; s < segments; s++) {
  const a0 = s / segments * Math.PI * 2, a1 = (s + 1) / segments * Math.PI * 2;
  const p = (a:number, y:number) => [Math.cos(a) * ribbonR, y, Math.sin(a) * ribbonR];
  const quad = [p(a0, -ribbonH), p(a1, ribbonH), p(a1, -ribbonH), p(a0, -ribbonH), p(a0, ribbonH), p(a1, ribbonH)];
  for (const [index, q] of quad.entries()) {
   const a = index === 1 || index === 2 || index === 5 ? a1 : a0;
   positions.push(...q); normals.push(Math.cos(a), 0, Math.sin(a)); ribbonMask.push(1);
   // side-on, the near and far halves of the ribbon overlap: two faint layers read as one soft line
   colors.push(ribbonTone, ribbonTone * 1.02, ribbonTone * 1.07, ribbonAlpha);
  }
 }
 const g = new THREE.BufferGeometry();
 g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
 g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
 g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
 // 1 on the edge ribbon: the blur material fades it away from edge-on (installDiscRibbonFade)
 g.setAttribute('cotRibbon', new THREE.Float32BufferAttribute(ribbonMask, 1));
 return g;
}
/** Round 4b (wave 416: seen face-on or at an angle the tip ribbon drew a crisp white rim, "prop guards"): the disc
 * material keeps the ribbon only near edge-on — its alpha falls from full within about 7 degrees of the rotor plane
 * to nothing by about 20 degrees — so a side view keeps a soft line and every other view shows the plain disc.
 * Chained after the engine's shader hooks (call it after their setup), for instanced and single meshes alike. */
export function installDiscRibbonFade(material:THREE.Material):void {
 if (material.userData.cotDiscRibbonFade) return;
 material.userData.cotDiscRibbonFade = true;
 (material.defines ??= {}).COT_DISC_RIBBON = '';
 const previous = material.onBeforeCompile.bind(material), previousKey = material.customProgramCacheKey.bind(material);
 material.onBeforeCompile = (shader, renderer) => {
  previous(shader, renderer);
  shader.vertexShader = shader.vertexShader
   .replace('#include <common>', '#include <common>\nattribute float cotRibbon;\nvarying float vCotRibbonFade;')
   .replace('#include <project_vertex>', `#include <project_vertex>
  {
   vec4 cotAxis = vec4(0.0, 1.0, 0.0, 0.0);
   #ifdef USE_INSTANCING
    cotAxis = instanceMatrix * cotAxis;
   #endif
   float cotFace = abs(dot(normalize((modelViewMatrix * cotAxis).xyz), normalize(-mvPosition.xyz)));
   vCotRibbonFade = mix(1.0, 1.0 - smoothstep(0.12, 0.35, cotFace), cotRibbon);
  }`);
  shader.fragmentShader = shader.fragmentShader
   .replace('#include <common>', '#include <common>\nvarying float vCotRibbonFade;')
   .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.a *= vCotRibbonFade;');
 };
 material.customProgramCacheKey = () => `${previousKey()}|cotDiscRibbon`;
 material.needsUpdate = true;
}

/** Four merged materials (matte carbon and TPU, the charge's paint, anodised metal, glass) plus the propellers. Motor
 * bells, wiring, payload straps, camera mounts and landing gear share the exact airframe between its parked and
 * airborne presentations. */
export function createDroneModelKit(nation?:string,detail:'full'|'lite'='full'):DroneModelKit {
 liteBuild = detail === 'lite';
 try { return buildDroneModelKit(DRONE_DESIGNS[droneNation(nation)]); }
 finally { liteBuild = false; }
}
function buildDroneModelKit(design:DroneDesign):DroneModelKit {
 const b:AirframeBuckets = { carbon: new Bucket(), plate: new Bucket(false, TWILL_REPEATS), paint: new Bucket(), metal: new Bucket(), glass: new Bucket(true) };
 const fiber = design.link === 'fiber';
 const topY = addFrame(b, fiber);
 addBattery(b, design, topY);
 addFpvCamera(b, .088, .265);
 addWarhead(b, design);
 addLandingGear(b);
 addLink(b, design.link, topY);
 const body = b.carbon.merge(), plateGeometry = b.plate.merge(), equipment = b.paint.merge(), metal = b.metal.merge(), lens = b.glass.merge();
 // Field wear before scaling (authoring units): dust on what faces up, the charge's belly grimy. The gear stays dark
 // (round 4: dusted legs read pale, a camera drone's).
 weatherVertexColors(body, .3, -1, 1, MUD);
 weatherVertexColors(plateGeometry, .12, -1);
 weatherVertexColors(equipment, .3, -.14);
 weatherVertexColors(metal, .2, -1, 1, MUD);
 for (const geometry of [body, plateGeometry, equipment, metal, lens]) geometry.scale(DRONE_AIRFRAME_SCALE, DRONE_AIRFRAME_SCALE, DRONE_AIRFRAME_SCALE);
 const rotor = createRotor(PROP_R).scale(DRONE_AIRFRAME_SCALE, DRONE_AIRFRAME_SCALE, DRONE_AIRFRAME_SCALE);
 const rotorBlur = createRotorBlur(PROP_R).scale(DRONE_AIRFRAME_SCALE, DRONE_AIRFRAME_SCALE, DRONE_AIRFRAME_SCALE);
 const rotorBlurFaint = createRotorBlur(PROP_R, .42).scale(DRONE_AIRFRAME_SCALE, DRONE_AIRFRAME_SCALE, DRONE_AIRFRAME_SCALE);
 const rotorBlurSteps = DRONE_ROTOR_FADE_STEPS.map(strength => createRotorBlur(PROP_R, strength).scale(DRONE_AIRFRAME_SCALE, DRONE_AIRFRAME_SCALE, DRONE_AIRFRAME_SCALE));
 // Matte composite and matte anodised metal: carbon and printed parts scatter; the metal keeps a soft machined highlight
 // without mirroring the sky (a bright bell or belly read as chrome).
 const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: .74, metalness: .03 });
 // The frame plates' twill under a thin lacquer: a little more sheen than the printed and wrapped parts.
 const twill = createCarbonTwill(), twillSheen = createCarbonTwill(true);
 const plateMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, map: twill, roughnessMap: twillSheen, roughness: .8, metalness: .04 });
 const equipmentMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: .8, metalness: .02 });
 const metalMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: .6, metalness: .35 });
 const lensMaterial = new THREE.MeshStandardMaterial({ color: 0x2f4a56, emissive: 0x0b1f28, roughness: .08, metalness: .55 });
 const rotorMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: .55, metalness: .02, side: THREE.DoubleSide });
 const blurMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, transparent: true, depthWrite: false, roughness: .7, metalness: 0, side: THREE.DoubleSide });
 for (const [material, label] of [[bodyMaterial,'composite'],[plateMaterial,'carbon plate'],[equipmentMaterial,'paint'],[metalMaterial,'metal'],[lensMaterial,'glass'],[rotorMaterial,'propellers'],[blurMaterial,'rotor blur']] as const) material.name = `FPV ${design.name} ${label}`;
 const parts = [{ geometry: body, material: bodyMaterial },{ geometry: plateGeometry, material: plateMaterial },{ geometry: equipment, material: equipmentMaterial },{ geometry: metal, material: metalMaterial },{ geometry: lens, material: lensMaterial }];
 return { body, plate: plateGeometry, equipment, metal, lens, rotor, rotorBlur, rotorBlurFaint, rotorBlurSteps, bodyMaterial, plateMaterial, equipmentMaterial, metalMaterial, lensMaterial, rotorMaterial, blurMaterial, parts,
  name: design.name,
  dispose() {
   for (const geometry of [body, plateGeometry, equipment, metal, lens, rotor, rotorBlur, rotorBlurFaint, ...rotorBlurSteps]) geometry.dispose();
   for (const material of [bodyMaterial, plateMaterial, equipmentMaterial, metalMaterial, lensMaterial, rotorMaterial, blurMaterial]) material.dispose();
   twill.dispose(); twillSheen.dispose();
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
  installDiscRibbonFade(kit.blurMaterial);
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
/**
 * A counter-rotating propeller drawn without a mirrored transform (2026-10-12, the owner: "make sure the american drones
 * have all 4 rotors properly there"): poseDroneRotor mirrors the two counter-rotating props with a negative x scale, and
 * an instanced mesh cannot follow a per-instance negative determinant — the GPU then sees the props' outward faces as back
 * faces and a double-sided material lights them from behind, so two of the four props drew near-black against the
 * ground. This is the prop geometry mirrored once, its winding flipped, to draw with the pose's scale held at +1.
 */
export function mirroredRotorGeometry(rotor:THREE.BufferGeometry):THREE.BufferGeometry {
 const mirrored = (rotor.index ? rotor.toNonIndexed() : rotor.clone()).scale(-1, 1, 1);
 for (const attribute of Object.values(mirrored.attributes) as THREE.BufferAttribute[]) {
  const size = attribute.itemSize, array = attribute.array as Float32Array;
  for (let t = 0; t < attribute.count; t += 3) for (let k = 0; k < size; k++) {
   const a = (t + 1) * size + k, b = (t + 2) * size + k, swap = array[a]!; array[a] = array[b]!; array[b] = swap;
  }
 }
 return mirrored;
}
export function poseDroneRotor(prop:THREE.Object3D,index:number,spin:number):void {
 prop.position.set(index<2?-MOTOR_OFFSET:MOTOR_OFFSET,ROTOR_Y,index%2?MOTOR_OFFSET:-MOTOR_OFFSET).multiplyScalar(DRONE_AIRFRAME_SCALE);
 const direction = droneRotorDirection(index);
 prop.rotation.y=spin*direction+index*.8;prop.scale.set(direction,1,1);prop.updateMatrix();
}
