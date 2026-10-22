// Shared launch-canister stock for the pitching missile pods (owner 2026-10-21: "make missile tubes like those for
// type 100 ifv, ztz 100 proto ... follow that of the object 695, and tagil, which are more proper"). The vocabulary is
// Object 695's (object695MissileTurret.ts): a round canister body, a proud mouth collar around a recessed sealed launch
// terminal, a rear end cap and clamp bands, held at each band station by a frame of posts and straps. The collar's
// inner wall is unpainted dark liner, as on the TOS-1A cells (tos1aTagil.ts). First-party construction: Kevin B. Liu.
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT } from './kit.ts';

const { cylY, cylZ, torus } = KIT;

/** One canister, in the pitching gun frame: radii and the axial stations along +Z. */
export interface LaunchCanister {
  readonly bodyRadius: number;
  readonly collarRadius: number;
  readonly boreRadius: number;
  readonly capRadius: number;
  readonly bandRadius: number;
  /** Rear face of the end cap. */
  readonly rear: number;
  /** Mouth plane of the collar (the launch exit). */
  readonly mouth: number;
  readonly collarLength: number;
  /** Mouth plane to the sealed terminal's face. */
  readonly recess: number;
  /** Clamp-band centres; a pod's frames sit on these stations. */
  readonly bands: readonly number[];
  /** Radial segments; multiples of four keep a vertex on each axis, where the posts and straps bear on the bands. */
  readonly segments: readonly [high: number, low: number];
}

type Tag = (geometry: THREE.BufferGeometry, name: string) => THREE.BufferGeometry;
const CAP = .034, BAND = .05, TERMINAL = .008;
const POST = .035, POST_DEPTH = .06, STRAP = .032, STRAP_DEPTH = .07, SEAT = .002;

export function canisterTerminalZ(c: LaunchCanister): number { return c.mouth - c.recess; }

/** The collar lathe: shoulder off the body, outer wall, mouth annulus, inner wall down into the body. The inner wall
 * (lathe segment 3) is returned apart as the dark liner; the two parts keep their exact shared vertices. */
function collar(c: LaunchCanister, n: number): [painted: THREE.BufferGeometry, liner: THREE.BufferGeometry] {
  const start = c.mouth - c.collarLength, bodyFront = canisterTerminalZ(c) - TERMINAL - .001;
  const profile = [[c.bodyRadius, start], [c.collarRadius, start + .02], [c.collarRadius, c.mouth],
    [c.boreRadius, c.mouth], [c.boreRadius, bodyFront - .005]];
  // Lathe's +Y axis becomes +Z with a positive X quarter turn.
  const painted = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), n).rotateX(Math.PI / 2);
  const liner = painted.clone(), outer: number[] = [], inner: number[] = [];
  const indices = painted.index!.array, spans = profile.length - 1;
  for (let sector = 0; sector < n; sector++) for (let span = 0; span < spans; span++) {
    const offset = (sector * spans + span) * 6;
    (span === spans - 1 ? inner : outer).push(...indices.slice(offset, offset + 6));
  }
  painted.setIndex(outer); liner.setIndex(inner);
  return [painted, liner];
}

/** Where a launcher's stock goes: the pitching gun-mount buckets by default, or a fixed turret launcher's own buckets
 * and placement (a builder that authors in hull-datum coordinates passes its turretEquipment). */
export interface LauncherBuckets {
  readonly paint: string;
  readonly dark: string;
  /** Publish the body as the missileRack module part (gun-mount pods); fixed launchers rely on their weaponAssembly. */
  readonly module: boolean;
  readonly place?: (bucket: string, geometry: THREE.BufferGeometry, x: number, y: number, z: number) => void;
}
const GUN_MOUNT: LauncherBuckets = Object.freeze({ paint: 'gunMount', dark: 'gunMountDark', module: true });

/** A closed round canister body (the damageable missile-rack stock) with its collar, terminal, end cap and bands. */
export function addLaunchCanister(P: TankBuilderPort, tag: Tag, c: LaunchCanister, x: number, y: number,
  bandStations: readonly number[] = c.bands, to: LauncherBuckets = GUN_MOUNT): void {
  const n = P.q ? c.segments[0] : c.segments[1];
  if (n % 4) throw new RangeError(`Launch canister segments must be a multiple of four (${n})`);
  const put = to.place ?? ((bucket: string, g: THREE.BufferGeometry, px: number, py: number, pz: number) =>
    P.addEquipment(bucket, g, px, py, pz));
  const terminal = canisterTerminalZ(c), bodyFront = terminal - TERMINAL - .001, bodyRear = c.rear + CAP - .013;
  const body = tag(cylZ(c.bodyRadius, bodyFront - bodyRear, n), 'missile-canister');
  if (to.module) P.addModuleVisual('missileRack', to.paint, body, x, y, (bodyFront + bodyRear) / 2);
  else put(to.paint, body, x, y, (bodyFront + bodyRear) / 2);
  const [painted, liner] = collar(c, n);
  put(to.paint, tag(painted, 'canister-mouth'), x, y, 0);
  put(to.dark, tag(liner, 'canister-liner'), x, y, 0);
  put(to.dark, tag(cylZ(c.boreRadius - .001, TERMINAL, n), 'launch-terminal'), x, y, terminal - TERMINAL / 2);
  put(to.paint, tag(cylZ(c.capRadius, CAP, n), 'canister-rear-cap'), x, y, c.rear + CAP / 2);
  // The chase camera sees the rear caps most: a gasket ring half sunk in the painted cap's face and the launch
  // umbilical connector let 3 mm into it (a full dark disc read as an open rear bore).
  if (P.q) {
    put(to.dark, tag(torus(c.capRadius * .84, .006, n, 4).rotateX(Math.PI / 2), 'canister-rear-seal'), x, y, c.rear);
    put(to.dark, tag(new THREE.BoxGeometry(.06, .044, .03), 'canister-connector'),
      x, y - c.capRadius * .42, c.rear - .012);
  }
  for (const z of bandStations) put(to.paint, tag(cylZ(c.bandRadius, BAND, n), 'canister-band'), x, y, z);
}

/** One launch cell let into a launcher face, as on the TOS-1A pack: a painted rim collar from `behind` the face plane
 * to `proud` in front of it, its inner wall a dark liner running `depth` back to a dark sealed terminal (`terminal`
 * false leaves the bore's floor to stock the builder already has, such as a missile's nose cap). The face's own hole
 * should sit between `bore` and `bore + wall`, inside the collar wall, so its edge never shows. */
export interface LaunchCell {
  readonly bore: number;
  readonly wall: number;
  readonly proud: number;
  readonly behind: number;
  readonly depth: number;
  readonly terminal?: boolean;
  /** Radial segments; multiples of four keep a vertex on each axis. */
  readonly segments: readonly [high: number, low: number];
}

/** A launch cell's painted rim and dark bore, in the launcher's own frame (axis +Z), centred at (x, y) with the face
 * plane at z = face. */
export function launchCellParts(c: LaunchCell, q: boolean | undefined, x: number, y: number, face: number):
  { rim: THREE.BufferGeometry; bore: THREE.BufferGeometry } {
  const n = q ? c.segments[0] : c.segments[1];
  if (n % 4) throw new RangeError(`Launch cell segments must be a multiple of four (${n})`);
  const R = c.bore + c.wall, mouth = face + c.proud, floor = face - c.depth;
  const profile = [[R, face - c.behind], [R, mouth], [c.bore, mouth], [c.bore, floor]];
  const rim = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), n).rotateX(Math.PI / 2);
  const liner = rim.clone(), outer: number[] = [], inner: number[] = [];
  const indices = rim.index!.array, spans = profile.length - 1;
  for (let sector = 0; sector < n; sector++) for (let span = 0; span < spans; span++) {
    const offset = (sector * spans + span) * 6;
    (span === spans - 1 ? inner : outer).push(...indices.slice(offset, offset + 6));
  }
  rim.setIndex(outer); liner.setIndex(inner);
  const dark: THREE.BufferGeometry[] = [liner];
  if (c.terminal !== false) dark.push(cylZ(c.bore - .001, TERMINAL, n).translate(0, 0, floor + TERMINAL / 2));
  return { rim: rim.translate(x, y, 0), bore: KIT.mergeAll(dark).translate(x, y, 0) };
}

/** A flat launcher face plate, front face at z = 0 and `thickness` deep, centred on (0, 0) with round holes. */
export function perforatedPlate(width: number, height: number, thickness: number,
  holes: readonly (readonly [number, number])[], holeRadius: number, segments: number): THREE.BufferGeometry {
  const shape = new THREE.Shape([new THREE.Vector2(-width / 2, -height / 2), new THREE.Vector2(width / 2, -height / 2),
    new THREE.Vector2(width / 2, height / 2), new THREE.Vector2(-width / 2, height / 2)]);
  for (const [x, y] of holes) {
    const hole = new THREE.Path(); hole.absarc(x, y, holeRadius, 0, Math.PI * 2, true); shape.holes.push(hole);
  }
  return new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, steps: 1, curveSegments: segments })
    .translate(0, 0, -thickness);
}

/** A toothed elevation sector, coaxial with the pitch axis (+X) and centred on x = 0 across its width. Angles are in
 * the gun frame's Z-Y plane, measured from +Z toward +Y; a point at θ sits at θ + pitch once the cradle elevates, so a
 * fixed pinion at φ meshes for every pitch while the arc covers [φ − elevation, φ + depression]. The web runs in from
 * `inner` (on the trunnion hub) to `outer`; teeth stand `tooth` proud of it (LOW: a plain rim). */
export function elevationSector(inner: number, outer: number, tooth: number, fromDeg: number, toDeg: number,
  teeth: number, width: number, toothed: boolean): THREE.BufferGeometry {
  const a0 = fromDeg * Math.PI / 180, a1 = toDeg * Math.PI / 180, pitch = (a1 - a0) / teeth;
  const at = (r: number, a: number): THREE.Vector2 => new THREE.Vector2(r * Math.cos(a), r * Math.sin(a));
  const rim: THREE.Vector2[] = [];
  if (toothed) {
    for (let k = 0; k < teeth; k++) {
      const a = a0 + k * pitch;
      rim.push(at(outer, a), at(outer, a + pitch / 4), at(outer + tooth, a + pitch / 4),
        at(outer + tooth, a + 3 * pitch / 4), at(outer, a + 3 * pitch / 4));
    }
    rim.push(at(outer, a1));
  } else {
    for (let k = 0; k <= 6; k++) rim.push(at(outer + tooth / 2, a0 + (a1 - a0) * k / 6));
  }
  for (let k = 4; k >= 0; k--) rim.push(at(inner, a0 + (a1 - a0) * k / 4));
  // Shape x is gun-frame Z, shape y is Y; a −90° turn about Y sends the extrusion along −X.
  return new THREE.ExtrudeGeometry(new THREE.Shape(rim), { depth: width, bevelEnabled: false, steps: 1 })
    .rotateY(-Math.PI / 2).translate(width / 2, 0, 0);
}

/** The frame's member centres: outer post x on each side, bottom and top strap y. */
export interface ClampFrame {
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
  readonly top: number;
}

/** A clamp frame at one band station: outer posts tangent to the bands, a post between each pair of columns, top and
 * bottom straps, and a strap between each pair of rows. Every member overlaps the bands it bears on by 2 mm; posts and
 * straps differ in depth and length so no two faces are coplanar. */
export function addClampFrame(P: TankBuilderPort, tag: Tag, c: LaunchCanister,
  columns: readonly number[], rows: readonly number[], z: number): ClampFrame {
  const xs = [...columns].sort((a, b) => a - b), ys = [...rows].sort((a, b) => a - b), r = c.bandRadius;
  const left = xs[0] - r - POST / 2 + SEAT, right = xs[xs.length - 1] + r + POST / 2 - SEAT;
  const bottom = ys[0] - r - STRAP / 2 + SEAT, top = ys[ys.length - 1] + r + STRAP / 2 - SEAT;
  const middle = (left + right) / 2, width = right - left + POST - .008;
  const postBottom = bottom - STRAP / 2 + .004, postTop = top + STRAP / 2 - .004;
  for (const x of [left, right]) {
    P.addEquipment('gunMount', tag(new THREE.BoxGeometry(POST, postTop - postBottom, POST_DEPTH), 'pod-post'),
      x, (postTop + postBottom) / 2, z);
  }
  for (let i = 1; i < xs.length; i++) {
    const gap = xs[i] - xs[i - 1] - 2 * r;
    if (gap > 0) P.addEquipment('gunMount', tag(new THREE.BoxGeometry(gap + 2 * SEAT, postTop - postBottom, POST_DEPTH - .004),
      'pod-center-post'), (xs[i] + xs[i - 1]) / 2, (postTop + postBottom) / 2, z);
  }
  for (const y of [bottom, top]) {
    P.addEquipment('gunMount', tag(new THREE.BoxGeometry(width, STRAP, STRAP_DEPTH), 'pod-strap'), middle, y, z);
  }
  for (let i = 1; i < ys.length; i++) {
    const gap = ys[i] - ys[i - 1] - 2 * r;
    if (gap > 0) P.addEquipment('gunMount', tag(new THREE.BoxGeometry(width - .006, gap + 2 * SEAT, STRAP_DEPTH - .004),
      'pod-row-strap'), middle, (ys[i] + ys[i - 1]) / 2, z);
  }
  if (P.q) for (const x of [left, right]) {
    P.addEquipment('gunMountDark', tag(cylY(.019, .019, .012, 8), 'strap-fastener'), x, top + STRAP / 2 + .004, z);
  }
  return { left, right, bottom, top };
}
