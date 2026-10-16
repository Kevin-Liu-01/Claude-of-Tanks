// Owner 2026-10-15 (VEH-22): the T-72B3 Zubr and Zubr II carry the T-72B3M (2016) turret itself
// (nationalDonorTurret.ts) on their T-72B3 hulls, up-armoured with the Polish field fit: the modern remote autocannon
// on the commander's cupola, ERAWA courses, slat screens and nets with leaves, lamps, sensors and stowage.
//   "make the t72b3 zubr turret properly based off the t72 b3m 2016, except obvioulsy up armored annnd using modern
//    autocannon and cages and the leaves and lights and ERa and other emplacements"
// The hulls keep their Polish packages unchanged (nationalPoland.ts hullEquipment, zubrII.ts).
//
// The donor turret is never reshaped: every added part is seated against its real surfaces. Coordinates are
// turret-local (origin on the ring centre, +Z forward, +X the vehicle's left, +Y up). Measured donor datums used here
// (t72b3mX.ts, in this frame): the cast shell's lower edge y -.014 and widest flank x 1.407 at z .29; the Relikt cheek
// fan's lowest outer lip y .13-.22 over z .25-1.43; the bustle stowage boxes from z .29 (right) / -.21 (left) round
// to z -1.94, standing y .108-.736 and reaching x 1.81; the six-tube smoke bank on the left flank at z -.03-.36; the
// commander's cupola at (-.627,-.359) r .44 (the station's seat), the gunner's cupola at (.528,-.527) r .33 and the
// gunner's sight hood at x .58-.99, z -.21-.15 looking forward. The T-72B3 hull under the turret's sweep stands at most
// .029 (the driver's hatch lid, r 1.23-1.81 ahead) and .075 (its periscope block, r 1.65-1.75) above the ring seat.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {beamBetween} from './measuredPrimitives.ts';
import {eraCassette, strappedPack} from './modernizationFittings.ts';
import {nationalLamp, nationalEye, nationalRoofSensor} from './nationalRoofSystems.ts';
import {hullEquipment} from './nationalPoland.ts';
import {addPolishProtection} from './nationalPolandProtection.ts';
import {markVehicleNightLens} from '../vehicleNightLighting.ts';
import {NATIONAL_ROOF_LOADOUTS} from '../nationalRoofConfig.ts';
import {POLISH_PROTECTION_LAYOUTS} from '../nationalPolandProtectionConfig.ts';
import type {NationalModernizationConfig} from '../nationalModernizationConfig.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
const {box, cylY, cylZ, cylX, torus} = KIT;

type PolandDonorId = 't72b3_zubr' | 't72b3_zubr_ii';
type V3 = readonly [number, number, number];
/** Rows of POLISH_PROTECTION_LAYOUTS (hull screens unchanged; turret numbers describe the kit's own screens). */
const PROTECTION_MODEL: Readonly<Record<PolandDonorId, number>> = {t72b3_zubr: 2, t72b3_zubr_ii: 3};
const SIDES = [-1, 1] as const;
const eraSector = (side: number): string => `turret_era_${side < 0 ? 'L' : 'R'}`;

/** Raycast seats on permanent stock only: the donor casting plus the kit's own welded housings, never removable ERA,
 * stowage boxes or other fittings. */
class Stock {
  private readonly meshes: THREE.Mesh[] = [];
  private readonly material = new THREE.MeshBasicMaterial({side: THREE.DoubleSide});
  private readonly ray = new THREE.Raycaster();
  private readonly id: string;
  constructor(id: string, geometries: readonly THREE.BufferGeometry[] = []) {
    this.id = id;
    for (const g of geometries) this.add(g);
  }
  add(g: THREE.BufferGeometry): THREE.BufferGeometry {
    const mesh = new THREE.Mesh(g, this.material); mesh.updateMatrixWorld(true); this.meshes.push(mesh); return g;
  }
  /** The highest permanent surface under a plan point. */
  top(x: number, z: number): number {
    this.ray.set(new THREE.Vector3(x, 4, z), new THREE.Vector3(0, -1, 0));
    const hit = this.ray.intersectObjects(this.meshes, false)[0];
    if (!hit) throw new Error(`${this.id}: no permanent turret seat at ${x.toFixed(3)},${z.toFixed(3)}`);
    return hit.point.y;
  }
  /** The first permanent surface along a ray, its normal turned back towards the ray's origin. */
  face(origin: V3, direction: V3): {point: THREE.Vector3; normal: THREE.Vector3} {
    const dir = new THREE.Vector3(...direction).normalize();
    this.ray.set(new THREE.Vector3(...origin), dir);
    const hit = this.ray.intersectObjects(this.meshes, false)[0];
    if (!hit?.face) throw new Error(`${this.id}: no permanent turret face from ${origin.map(v => v.toFixed(3))}`);
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    if (normal.dot(dir) > 0) normal.negate();
    return {point: hit.point.clone(), normal};
  }
  dispose(): void { this.material.dispose(); }
}

/** Closed loft through rings of 3D points (equal counts), every face wound outwards. */
function loft(rings: readonly (readonly V3[])[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const v = (p: V3) => new THREE.Vector3(...p);
  const centroid = (points: readonly V3[]) => points.reduce((c, p) => c.add(v(p)), new THREE.Vector3()).multiplyScalar(1 / points.length);
  const push = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, inside: THREE.Vector3) => {
    const n = b.clone().sub(a).cross(c.clone().sub(a)), out = a.clone().add(b).add(c).multiplyScalar(1 / 3).sub(inside);
    if (n.dot(out) < 0) positions.push(...a.toArray(), ...c.toArray(), ...b.toArray());
    else positions.push(...a.toArray(), ...b.toArray(), ...c.toArray());
  };
  const n = rings[0].length;
  for (let s = 0; s < rings.length - 1; s++) {
    const inside = centroid([...rings[s], ...rings[s + 1]]);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, a = v(rings[s][i]), b = v(rings[s][j]), c = v(rings[s + 1][j]), d = v(rings[s + 1][i]);
      push(a, b, c, inside); push(a, c, d, inside);
    }
  }
  for (const [s, t] of [[0, 1], [rings.length - 1, rings.length - 2]] as const) {
    const c = centroid(rings[s]), inside = centroid([...rings[s], ...rings[t]]);
    for (let i = 0; i < n; i++) push(c, v(rings[s][i]), v(rings[s][(i + 1) % n]), inside);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const uv: number[] = [];
  for (let i = 0; i < positions.length; i += 3) uv.push(positions[i], positions[i + 2]);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** A removable screen or cage member: open lattice, tagged for the Polish protection receipts. */
function lattice(P: TankBuilderPort, g: THREE.BufferGeometry, tag: string): void {
  g.userData.polishProtection = tag;
  P.addEquipment('turretOpenLattice', g);
}

/** A side-type ERAWA cassette seated by raycast on permanent stock, its hit face along the seat's outward normal. */
function eraTile(P: TankBuilderPort, seats: Stock, side: number, origin: V3, direction: V3,
  size: readonly [thickness: number, height: number, length: number]): void {
  const {point, normal} = seats.face(origin, direction);
  const sign = point.x < 0 ? -1 : 1;
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(sign, 0, 0), normal);
  const r = new THREE.Euler().setFromQuaternion(q);
  const center = point.clone().addScaledVector(normal, size[0] / 2 - .006);
  eraCassette(P, 'turret', eraSector(side), center.toArray(), size, [r.x, r.y, r.z]);
}

/** A welded block rising from the casting to a level top: it reaches down to the lowest of its footprint's seats. */
function weldedBlock(P: TankBuilderPort, casting: Stock, x: number, z: number, w: number, d: number, top: number,
  bucket = 'turretDetail'): void {
  const seats = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]].map(([a, b]) => casting.top(x + a * w * .45, z + b * d * .45));
  const low = Math.min(...seats) - .012;
  if (top - low < .02) throw new Error(`welded block at ${x},${z} has no height above its seat`);
  P.addEquipment(bucket, box(w, top - low, d), x, (top + low) / 2, z);
}

/** The level top a fitting of this footprint can stand on: the highest of its seats. */
function levelSeat(casting: Stock, x: number, z: number, w: number, d: number): number {
  return Math.max(...[[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]].map(([a, b]) => casting.top(x + a * w / 2, z + b * d / 2)));
}

// ---------------------------------------------------------------------------------------------------------------------
// Zubr: the compact field fit. A fitted pannier course wraps the chin and forward flanks under the Relikt fan and
// carries fine ERAWA tiles; slat screens hang outboard of the stowage boxes from welded stanchions; a compact rear rack
// carries the camouflage roll, a service case, tools and the whips.

const ZUBR = {
  belt: {low: .040, high: .120, origin: [0, .08, .30] as V3, start: .34, chinX: .44, inner: .035, outer: .045},
  tile: [.040, .068, .125] as const,
  // front stanchions: right (-X) behind the right front roof cassette (z .234), left (+X) ahead of the top smoke tube
  // (z .09) and outboard of the gunner's sight hood (x .992)
  stanchion: {front: [[-1.14, .16], [1.14, .19]] as const, rear: [.70, -.98] as const, top: .80, arm: .755},
  screen: {x: 1.95, front: .30, rear: -1.25, bottom: .24, top: .74},
  rack: {front: -2.00, rear: -2.34, half: .84, floor: .085, top: .50, rails: [.30, .62] as const},
} as const;

/** The casting's outline at height y along a radial ray from the belt origin (plan angle phi from +X towards +Z). */
function outline(casting: Stock, side: number, phi: number, y: number): {point: THREE.Vector3; dir: THREE.Vector3} {
  const [ox, , oz] = ZUBR.belt.origin, dir = new THREE.Vector3(side * Math.cos(phi), 0, Math.sin(phi));
  const origin: V3 = [ox + dir.x * 3, y, oz + dir.z * 3];
  const {point} = casting.face(origin, [-dir.x, 0, -dir.z]);
  return {point, dir};
}

/** The fine ERAWA course: a welded pannier fitted round the cast shell's undercut from the chin beside the mantlet to the
 * forward flank (where the shell curves away beneath the Relikt fan), every tile seated on it by raycast. */
function zubrEraBelt(P: TankBuilderPort, casting: Stock): void {
  const b = ZUBR.belt;
  for (const side of SIDES) {
    // Stations every ~.15 m along the outline, from the flank at z .34 round the corner to the chin at |x| .44.
    const samples: {phi: number; point: THREE.Vector3}[] = [];
    for (let phi = 0; phi < 1.4; phi += .004) {
      const {point} = outline(casting, side, phi, (b.low + b.high) / 2);
      if (point.z < b.start) continue;
      samples.push({phi, point});
      if (Math.abs(point.x) <= b.chinX) break;
    }
    const stations: typeof samples = [samples[0]];
    let run = 0;
    for (let i = 1; i < samples.length; i++) {
      run += samples[i].point.distanceTo(samples[i - 1].point);
      if (run >= .15 || i === samples.length - 1) { stations.push(samples[i]); run = 0; }
    }
    const rings: V3[][] = stations.map(({phi}) => {
      const lo = outline(casting, side, phi, b.low), hi = outline(casting, side, phi, b.high);
      const mid = outline(casting, side, phi, (b.low + b.high) / 2), d = lo.dir;
      const reach = Math.max(...[lo, hi, mid].map(o => o.point.clone().sub(new THREE.Vector3(...b.origin).setY(o.point.y)).dot(d)));
      const at = (r: number, y: number): V3 => [b.origin[0] + d.x * r, y, b.origin[2] + d.z * r];
      const inner = (o: {point: THREE.Vector3}) => o.point.clone().sub(new THREE.Vector3(...b.origin).setY(o.point.y)).dot(d) - b.inner;
      return [at(inner(lo), b.low), at(reach + b.outer, b.low), at(reach + b.outer, b.high), at(inner(hi), b.high)];
    });
    const pannier = loft(rings);
    P.addExternalArmor('turret', pannier);
    const seats = new Stock(P.spec.id, [pannier]);
    try {
      for (let i = 0; i < rings.length - 1; i++) {
        const [, ob0, ot0] = rings[i], [, ob1, ot1] = rings[i + 1];
        const mid = new THREE.Vector3(...ob0).add(new THREE.Vector3(...ob1)).add(new THREE.Vector3(...ot0)).add(new THREE.Vector3(...ot1)).multiplyScalar(.25);
        const along = new THREE.Vector3(...ob1).sub(new THREE.Vector3(...ob0)); along.y = 0;
        if (along.length() < b.outer) continue;
        const out = new THREE.Vector3(along.z, 0, -along.x).normalize();
        if (out.x * side < 0 && Math.abs(out.x) > Math.abs(out.z) * .2) out.negate();
        if (out.z < 0 && Math.abs(out.z) > Math.abs(out.x)) out.negate();
        const length = Math.min(ZUBR.tile[2], along.length() - .018);
        eraTile(P, seats, side, mid.clone().addScaledVector(out, .3).toArray() as unknown as V3, out.clone().negate().toArray() as unknown as V3,
          [ZUBR.tile[0], ZUBR.tile[1], length]);
      }
    } finally { seats.dispose(); }
    // Bolt heads along the pannier's top edge.
    for (let i = 1; i < rings.length - 1; i += 2) {
      const [, , ot, it] = rings[i];
      P.addEquipment('turretDark', cylY(.016, .016, .012, 8), ot[0] * .8 + it[0] * .2, b.high + .005, ot[2] * .8 + it[2] * .2);
    }
  }
}

/** Screens hang outboard of the stowage boxes on two cantilever arms per side. Each arm leaves a welded stanchion on
 * the cast roof shoulder, passes over the box lids and clamps the screen's top rail; a knee brace drops to its mid
 * rail. The front stanchions carry the round driving lamps, the arms' outer ends the laser-warning heads. */
function zubrScreens(P: TankBuilderPort, casting: Stock, lamp: Parameters<typeof nationalLamp>[4]): void {
  const s = ZUBR.screen, st = ZUBR.stanchion, mid = (s.bottom + s.top) / 2;
  for (const side of SIDES) {
    const x = side * s.x;
    const front = st.front[side < 0 ? 0 : 1];
    for (const [px, sz] of [front, [side * st.rear[0], st.rear[1]]] as const) {
      weldedBlock(P, casting, px, sz, .12, .12, st.top);
      P.addEquipment('turretDetail', box(.17, .022, .17), px, st.top + .011, sz);
      const from: V3 = [px + side * .06, st.arm, sz], to: V3 = [x, st.arm, sz];
      lattice(P, beamBetween(from, to, .022, 8), 'side-mount');
      lattice(P, box(.07, .07, .09).translate(px + side * .085, st.arm, sz), 'mount-shoe');
      lattice(P, box(.06, .05, .08).translate(x, s.top + .02, sz), 'screen-clamp');
      lattice(P, beamBetween([side * (s.x - .34), st.arm - .012, sz], [x, mid, sz], .012, 6), 'screen-brace');
    }
    for (const z of [s.front, s.rear]) lattice(P, box(.034, s.top - s.bottom + .034, .034).translate(x, mid, z), 'screen-frame');
    for (const y of [s.bottom, mid, s.top]) lattice(P, box(.031, .029, s.front - s.rear + .034).translate(x, y, (s.front + s.rear) / 2), 'screen-frame');
    const count = Math.ceil((s.front - s.rear) / .16);
    for (let i = 1; i < count; i++) lattice(P, box(.018, s.top - s.bottom, .018).translate(x, mid, s.rear + i * (s.front - s.rear) / count), 'screen-slat');
    lattice(P, beamBetween([x, s.bottom, s.rear], [x, s.top, (s.front + s.rear) / 2], .010, 4), 'screen-brace');
    // Round driving lamps on the front stanchions, ahead of everything on the roof and clear of the gunner's sight.
    nationalLamp(P, front[0], front[1], st.top + .022, lamp);
    // Laser-warning heads on the front arms' outer ends, guarded.
    const lx = side * (s.x - .07), lz = front[1], seat = st.arm + .022, y = seat + .047;
    P.addEquipment('turretDetail', box(.105, .084, .13), lx, y, lz);
    P.addModuleVisual('optics', 'turretGlass', box(.074, .035, .013), lx, y + .006, lz + .071);
    for (const dx of [-.068, .068]) P.addEquipment('turretDetail', beamBetween([lx + dx, seat - .008, lz - .06], [lx + dx, seat + .133, lz + .058], .008));
    P.addEquipment('turretDetail', beamBetween([lx - .068, seat + .133, lz + .058], [lx + .068, seat + .133, lz + .058], .008));
  }
}

/** Four rails leave the cast shell's lower rear under the rear stowage boxes and carry an open rack; its rear face is
 * the slatted rear cage. */
function rearRack(P: TankBuilderPort, casting: Stock, r: {front: number; rear: number; half: number; floor: number;
  top: number; rails: readonly number[]}): void {
  const railY = r.floor - .01;
  for (const side of SIDES) for (const rx of r.rails) {
    const {point} = casting.face([side * rx, railY, -3], [0, 0, 1]);
    P.addEquipment('turretDetail', beamBetween([side * rx, railY, point.z + .06], [side * rx, railY, r.rear - .02], .022, 8));
  }
  for (const z of [r.front, (r.front + r.rear) / 2, r.rear])
    P.addEquipment('turretDetail', box(r.half * 2 + .03, .024, .03), 0, r.floor + .012 + .01, z);
  const mid = (r.floor + r.top) / 2;
  for (const side of SIDES) {
    for (const z of [r.front, r.rear]) lattice(P, box(.032, r.top - r.floor, .032).translate(side * r.half, mid + .01, z), 'rear-frame');
    for (const y of [mid, r.top]) lattice(P, box(.028, .028, r.front - r.rear).translate(side * r.half, y, (r.front + r.rear) / 2), 'rear-frame');
  }
  for (const y of [r.floor + .03, mid, r.top]) lattice(P, box(r.half * 2 + .032, .028, .028).translate(0, y, r.rear), 'rear-frame');
  lattice(P, box(r.half * 2 + .032, .028, .028).translate(0, r.top, r.front), 'rear-frame');
  const posts = Math.ceil(r.half * 2 / .16);
  for (let i = 1; i < posts; i++) lattice(P, box(.019, r.top - r.floor - .03, .024).translate(-r.half + i * r.half * 2 / posts, mid + .015, r.rear), 'rear-slat');
}

function zubrRackLoad(P: TankBuilderPort): void {
  const r = ZUBR.rack, z = (r.front + r.rear) / 2, deck = r.floor + .034;
  P.addEquipment('turretDetail', box(r.half * 2 - .06, .016, r.front - r.rear - .05), 0, deck - .008, z);
  // The camouflage roll, strapped across the rack.
  P.addEquipment('turretCloth', cylX(.105, .80, 18), .30, deck + .105, z);
  for (const x of [.04, .56]) P.addEquipment('turretDark', torus(.108, .011, 18, 6).rotateY(Math.PI / 2), x, deck + .105, z);
  // A service case and a strapped pack.
  P.addEquipment('turretDetail', box(.32, .19, .22), -.50, deck + .095, z + .02);
  P.addEquipment('turretDetail', box(.334, .018, .234), -.50, deck + .199, z + .02);
  for (const dx of [-.10, .10]) P.addEquipment('turretDark', box(.034, .048, .016), -.50 + dx, deck + .14, z + .138);
  strappedPack(P, 'turret', [-.12, deck + .07, z], [.26, .14, .24]);
  // Tools clamped outside the rack's left side rail; the whips on its rear corners.
  const tx = r.half + .040;
  P.addEquipment('turretDark', beamBetween([tx, r.top, r.front - .02], [tx, r.top, r.rear + .03], .013));
  for (const zz of [r.front - .06, r.rear + .07]) P.addEquipment('turretDark', box(.07, .045, .025), r.half + .022, r.top, zz);
  P.addEquipment('turretDetail', box(.03, .12, .20), r.half + .028, (r.floor + r.top) / 2 + .01, (r.front + r.rear) / 2 + .05);
  P.addEquipment('turretDark', beamBetween([r.half + .028, (r.floor + r.top) / 2 + .07, (r.front + r.rear) / 2 + .05], [r.half + .028, r.top - .02, (r.front + r.rear) / 2 + .05], .012));
  for (const side of SIDES) {
    const x = side * r.half, zz = r.rear;
    P.addEquipment('turretDetail', cylY(.050, .060, .06, 12), x, r.top + .044, zz);
    P.addEquipment('turretDark', cylY(.008, .014, .70, 8), x, r.top + .424, zz);
  }
}

function zubrSensors(P: TankBuilderPort, casting: Stock): void {
  const l = NATIONAL_ROOF_LOADOUTS.t72b3_zubr;
  // The flat sensor head ahead of the commander's cupola, on a welded plinth.
  const ex = -.70, ez = .42, eye = levelSeat(casting, ex, ez, .20, .20) + .01;
  weldedBlock(P, casting, ex, ez, .19, .19, eye);
  nationalEye(P, ex, ez, eye, l);
  // The radome on the right rear stanchion.
  const [rx, rz] = ZUBR.stanchion.rear;
  nationalRoofSensor(P, -rx, rz, ZUBR.stanchion.top + .022, l);
}

function buildZubrTurret(P: TankBuilderPort, casting: Stock): void {
  zubrEraBelt(P, casting);
  zubrScreens(P, casting, NATIONAL_ROOF_LOADOUTS.t72b3_zubr.lamp);
  rearRack(P, casting, ZUBR.rack);
  zubrRackLoad(P);
  zubrSensors(P, casting);
}

/** Zubr: its unchanged Polish hull package, then the turret fit. */
export function buildPolandDonorKit(P: TankBuilderPort, c: NationalModernizationConfig): void {
  hullEquipment(P, c);
  fitPolandDonorTurret(P, 't72b3_zubr');
}

/** Zubr II: the hull is built by zubrII.ts buildZubrIIHull; the turret fit follows. */
export function buildZubrIIDonorKit(P: TankBuilderPort): void {
  fitPolandDonorTurret(P, 't72b3_zubr_ii');
}

function fitPolandDonorTurret(P: TankBuilderPort, id: PolandDonorId): void {
  const castingGeometry: THREE.BufferGeometry[] = [];
  P.forEachBucketPart(['turret'], g => castingGeometry.push(g));
  const casting = new Stock(P.spec.id, castingGeometry);
  try {
    if (id === 't72b3_zubr') buildZubrTurret(P, casting);
  } finally { casting.dispose(); }
  const stock: THREE.BufferGeometry[] = [];
  P.forEachBucketPart(['turret', 'turretExternalArmor'], g => { if (!Object.hasOwn(g.userData, 'eraHitFaceVertexStarts')) stock.push(g); });
  addPolishProtection(P, PROTECTION_MODEL[id], stock, {turretScreens: false, turretSuit: id === 't72b3_zubr'});
}

void cylZ; void markVehicleNightLens; void POLISH_PROTECTION_LAYOUTS;
