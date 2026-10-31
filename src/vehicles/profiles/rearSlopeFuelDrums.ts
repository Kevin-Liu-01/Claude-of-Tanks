// Two 200 L fuel drums across a hull's upper rear slope (258). The owner, 2026-10-26: "on the bulat m and bastion m, add
// big round fuel barrels on these surfaces in rear" (the markup: the Bulat-M's upper rear plate), and "add the extra fuel
// barrels on the top part of the rear in addition to back on the qilin, kunlun, and yun as well". The classic T-72-family
// pair: 0.59 m drums, 0.88 m long, lying across the stern on welded saddles with strap bands, rolling hoops and a bung.
// The slope is measured on each hull at each saddle (a downward ray along the stern on the hull bucket: the deck's edge,
// where the surface tilts aft, to the slope's foot); each drum sits on that chord with a saddle gap, its saddles stand on
// their own chords (their feet 2 cm into the plate: welded), so nothing floats and nothing enters the plate. The drums,
// saddles and hoops take the hull's camouflage (equipment); the straps and bung are dark steel. Hull-owned, visual only.
// 265 (owner, 2026-10-30: "make the stb 1 have two big fuel barrels and back"): the same pair across a VERTICAL stern
// plate (addSternShelfFuelDrums), which has no slope to seat them: a welded shelf under them on gussets, the saddles
// on the shelf, as tall as the tank wants its drums to stand (its gun's curve over the stern follows them).
// First-party: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import { KIT } from './kit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Port = Pick<TankBuilderPort, 'forEachBucketPart' | 'addEquipment' | 'hullG'> & { spec: { id: string } };

/** A drum's radius and length (m), the gap under it at its saddles, and its centres across the stern. */
export const REAR_SLOPE_DRUM = Object.freeze({ radius: 0.295, length: 0.88, gap: 0.035, minGap: 0.025, centreX: 0.5, saddleX: 0.3 });

/** One station's slope: its top edge (where the deck tilts aft) and its foot, [y, z] in the hull's frame. */
export interface SlopeChord { readonly top: readonly [number, number]; readonly foot: readonly [number, number] }

/** The stern's upper slope at `x`: the first run of aft-tilted surface behind the deck, read by downward rays on the hull
 * bucket every centimetre from z -2.2 aft. */
export function measureRearSlope(P: Port, x: number): SlopeChord {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes: THREE.Mesh[] = [];
  P.forEachBucketPart(['hull'], (geometry) => { const mesh = new THREE.Mesh(geometry, material); mesh.updateMatrixWorld(); meshes.push(mesh); });
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), normal = new THREE.Vector3();
  let top: [number, number] | null = null, foot: [number, number] | null = null;
  try {
    for (let z = -2.2; z >= -4.4; z -= 0.01) {
      ray.set(new THREE.Vector3(x, 6, z), down);
      const hit = ray.intersectObjects(meshes, false)[0];
      if (!hit?.face) { if (top) break; continue; }
      normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
      if (normal.y < 0) normal.negate();
      const tilted = normal.z < -0.25 && normal.y > 0.3;
      if (tilted) { top ??= [hit.point.y, hit.point.z]; foot = [hit.point.y, hit.point.z]; } else if (top) break;
    }
  } finally { material.dispose(); }
  if (!top || !foot || top[1] - foot[1] < 0.08) throw new Error(`${P.spec.id}: no upper rear slope at x ${x} for the fuel drums`);
  return { top, foot };
}

interface Frame { readonly mid: THREE.Vector3; readonly dir: THREE.Vector3; readonly n: THREE.Vector3 }
function chordFrame(chord: SlopeChord, x: number): Frame {
  const top = new THREE.Vector3(x, chord.top[0], chord.top[1]), foot = new THREE.Vector3(x, chord.foot[0], chord.foot[1]);
  const dir = foot.clone().sub(top).normalize();
  // the slope's outward normal: up and aft
  const n = new THREE.Vector3(0, -dir.z, dir.y);
  if (n.y < 0) n.negate();
  return { mid: top.clone().add(foot).multiplyScalar(0.5), dir, n };
}

/** A closed band round the drum (axis x) at radius r, `width` wide: a strap, a rolling hoop or a chime. */
function band(r: number, width: number, depth: number): THREE.BufferGeometry {
  const inner = r - depth, half = width / 2;
  return new THREE.LatheGeometry([[inner, -half], [r, -half], [r, half], [inner, half], [inner, -half]]
    .map(([a, b]) => new THREE.Vector2(a, b)), 28).rotateZ(Math.PI / 2);
}

/** A saddle under the drum at one station: a 12 mm plate standing on its chord, its top following the drum's underside
 * with the seat gap, its foot 2 cm into the plate. */
function saddle(frame: Frame, centre: THREE.Vector3, x: number): THREE.BufferGeometry {
  const { radius } = REAR_SLOPE_DRUM, half = 0.16;
  // the drum's centre in the saddle's (u along the chord, v along the normal) frame
  const rel = centre.clone().sub(frame.mid);
  const cu = rel.dot(frame.dir), cv = rel.dot(frame.n);
  const top = (u: number): number => cv - Math.sqrt(Math.max(0, radius * radius - (u - cu) ** 2));
  const shape = new THREE.Shape();
  shape.moveTo(cu - half, -0.02);
  shape.lineTo(cu + half, -0.02);
  for (let i = 0; i <= 12; i++) { const u = cu + half - (2 * half * i) / 12; shape.lineTo(u, top(u)); }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false, curveSegments: 1 });
  const basis = new THREE.Matrix4().makeBasis(frame.dir, frame.n, new THREE.Vector3(1, 0, 0));
  basis.setPosition(new THREE.Vector3(x - 0.006, frame.mid.y, frame.mid.z));
  return geometry.applyMatrix4(basis);
}

/** One drum lying across the stern at `cx`: its body, end chimes and rolling hoops, the dark straps at `straps` (x) and
 * the bung on its outer end, 0.17 m from its axis along `bungDir`. The same drum on a slope and on a shelf. */
function addDrum(P: Port, cx: number, side: number, centre: THREE.Vector3, straps: readonly number[], bungDir: THREE.Vector3): void {
  const { radius, length } = REAR_SLOPE_DRUM, { cylX } = KIT;
  P.addEquipment('hullDetail', cylX(radius, length, 32), cx, centre.y, centre.z);
  for (const end of [-1, 1]) P.addEquipment('hullDetail', band(radius + 0.008, 0.02, 0.02), cx + end * (length / 2 - 0.012), centre.y, centre.z);
  for (const dx of [-0.15, 0.15]) P.addEquipment('hullDetail', band(radius + 0.012, 0.022, 0.02), cx + dx, centre.y, centre.z);
  for (const x of straps) P.addEquipment('hullDark', band(radius + 0.006, 0.04, 0.012), x, centre.y, centre.z);
  // the bung on the outer end, high on the face
  const bung = centre.clone().addScaledVector(bungDir, 0.17);
  P.addEquipment('hullDark', cylX(0.028, 0.014, 12), cx + side * (length / 2 + 0.007), bung.y, bung.z);
}

/** A vertical stern plate's drum shelf (265): the plate's face at `plateZ` (aft is -z), its foot at `footY` over a lower
 * plate raked forward `rake` m per m of drop, the shelf's top at `shelfY` across `halfWidth` either side, the drums'
 * faces `standoff` off the plate (clear of its fittings), the saddles `seat` tall under each drum's lowest point and the
 * gussets under the shelf at `gussets` (x). */
export interface SternShelf {
  readonly plateZ: number; readonly footY: number; readonly rake: number; readonly shelfY: number;
  readonly halfWidth: number; readonly standoff: number; readonly seat: number; readonly gussets: readonly number[];
}

/** A 12 mm gusset under the shelf at `x`: its top 5 mm into the shelf from the plate out to `reach`, its front 2 cm
 * inside the stern plate and down the raked lower plate to 0.70 m, its hypotenuse back out to the shelf. */
function gusset(shelf: SternShelf, x: number, reach: number): THREE.BufferGeometry {
  const { plateZ, footY, rake, shelfY } = shelf, top = shelfY - 0.005, low = 0.70;
  // u aft of the plate's face, v up
  const shape = new THREE.Shape();
  shape.moveTo(-0.03, top);
  shape.lineTo(reach, top);
  shape.lineTo(-(footY - low) * rake - 0.02, low);
  shape.lineTo(-0.03, footY - 0.01);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false, curveSegments: 1 });
  const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
  basis.setPosition(new THREE.Vector3(x - 0.006, 0, plateZ));
  return geometry.applyMatrix4(basis);
}

/** The two drums across a vertical stern plate, on a welded shelf (see SternShelf): the shelf a 10 mm plate 2 cm into
 * the stern plate and out past the drums' backs, closing the view to the ground under them, on gussets down to the
 * raked lower plate; each drum in two saddles `seat` tall on it, its straps over them. */
export function addSternShelfFuelDrums(P: Port, shelf: SternShelf): void {
  const { radius, length, centreX, saddleX } = REAR_SLOPE_DRUM;
  const { plateZ, shelfY, halfWidth, standoff, seat, gussets } = shelf;
  const cu = standoff + radius, depth = cu + radius + 0.03;
  P.addEquipment('hullDetail', KIT.box(2 * halfWidth, 0.01, depth + 0.02), 0, shelfY - 0.005, plateZ - (depth - 0.02) / 2);
  for (const x of gussets) P.addEquipment('hullDetail', gusset(shelf, x, cu));
  const placed: { centre: [number, number, number]; saddles: number[] }[] = [];
  for (const side of [-1, 1]) {
    const cx = side * centreX, stations = [cx - saddleX, cx + saddleX];
    const centre = new THREE.Vector3(cx, shelfY + seat + radius, plateZ - cu);
    addDrum(P, cx, side, centre, stations, new THREE.Vector3(0, 1, 0));
    for (const x of stations) {
      // the chord 12 mm over the shelf's top, so the saddle's 2 cm foot stays inside the 10 mm plate
      const frame: Frame = { mid: new THREE.Vector3(x, shelfY + 0.012, centre.z), dir: new THREE.Vector3(0, 0, -1), n: new THREE.Vector3(0, 1, 0) };
      P.addEquipment('hullDetail', saddle(frame, centre.clone().setX(x), x));
    }
    placed.push({ centre: [cx, Number(centre.y.toFixed(4)), Number(centre.z.toFixed(4))], saddles: stations });
  }
  P.hullG.userData.sternShelfFuelDrums = { radius, length, shelfY, plateZ, depth: Number(depth.toFixed(4)), drums: placed };
}

/** The two drums on the hull's upper rear slope (see the header). */
export function addRearSlopeFuelDrums(P: Port): void {
  const { radius, length, gap, minGap, centreX, saddleX } = REAR_SLOPE_DRUM;
  const placed: { centre: [number, number, number]; saddles: { x: number; top: readonly number[]; foot: readonly number[] }[] }[] = [];
  for (const side of [-1, 1]) {
    const cx = side * centreX, stations = [cx - saddleX, cx + saddleX];
    const frames = stations.map((x) => ({ x, chord: measureRearSlope(P, x) })).map(({ x, chord }) => ({ x, chord, frame: chordFrame(chord, x) }));
    // the drum on the stations' mean chord, raised along its normal until it keeps minGap over each station's chord
    const meanTop = [(frames[0]!.chord.top[0] + frames[1]!.chord.top[0]) / 2, (frames[0]!.chord.top[1] + frames[1]!.chord.top[1]) / 2] as const;
    const meanFoot = [(frames[0]!.chord.foot[0] + frames[1]!.chord.foot[0]) / 2, (frames[0]!.chord.foot[1] + frames[1]!.chord.foot[1]) / 2] as const;
    const mean = chordFrame({ top: meanTop, foot: meanFoot }, cx);
    const centre = mean.mid.clone().addScaledVector(mean.n, radius + gap);
    for (const { frame } of frames) {
      const clearance = centre.clone().setX(frame.mid.x).sub(frame.mid).dot(frame.n) - radius;
      if (clearance < minGap) centre.addScaledVector(mean.n, minGap - clearance);
    }
    addDrum(P, cx, side, centre, frames.map(({ x }) => x), mean.n);
    for (const { x, frame } of frames) P.addEquipment('hullDetail', saddle(frame, centre.clone().setX(x), x));
    placed.push({ centre: [cx, Number(centre.y.toFixed(4)), Number(centre.z.toFixed(4))],
      saddles: frames.map(({ x, chord }) => ({ x, top: chord.top, foot: chord.foot })) });
  }
  P.hullG.userData.rearSlopeFuelDrums = { radius, length, drums: placed };
}
