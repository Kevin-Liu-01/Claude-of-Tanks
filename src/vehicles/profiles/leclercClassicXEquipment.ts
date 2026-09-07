// Independent original equipment for the older supplied Leclerc revision.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { sourceMachineGun } from './sourceMachineGun.ts';
import { classicTurret, classicGun, LECLERC_CLASSIC_X_DATUMS as D } from './leclercClassicXFrame.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const { box, cylZ } = KIT;
type Point = readonly [number, number, number];

function bar(P: TankBuilderPort, a: Point, b: Point, radius: number): void {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b);
  const direction = to.clone().sub(from), midpoint = to.add(from).multiplyScalar(.5);
  const g = new THREE.CylinderGeometry(radius, radius, direction.length(), 12);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), direction.normalize()));
  classicTurret(P, 'turretDetail', g, ...midpoint.toArray() as [number, number, number]);
}

function hoop(P: TankBuilderPort, y: number, back: number, front: number): void {
  // Actual source rails use straight diagonal chamfers, not rounded corners.
  // The right arm ends269mm earlier than the left on each measured level.
  const a = -1.56262, b = -.099237;
  const end = front + .016498;
  const points = [[a, y, end], [a, y, back + .2602], [-1.3955, y, back],
    [-.2754, y, back], [b, y, back + .2602], [b, y, end - .26912]];
  for (let i = 1; i < points.length; i++)
    bar(P, points[i - 1] as [number, number, number],
      points[i] as [number, number, number], .016498);
  // Real bent stock is continuous outside each change of direction. Flat
  // individual cylinder caps alone leave a wedge-shaped joint hole.
  for (let i = 1; i < points.length - 1; i++) classicTurret(P, 'turretDetail',
    new THREE.SphereGeometry(.016498, 16, 12),
    ...points[i] as [number, number, number]);
}

function basketSheet(P: TankBuilderPort): void {
  // Object748 includes a real thin floor across the chamfered frame; the
  // separate narrower raised plate842 is retained above it. Source front
  // edge is diagonal, not a symmetric rectangular fill.
  const frontRight = (z: number) => -1.548054
    + (-1.563906 - z) / .269119 * 1.43425;
  const sheet = sectionSolid([
    [-2.487, -1.398814, -.272005], [-2.224, -1.563, -.09924],
    [-1.833025, -1.563, -.09924], [-1.567, -1.563, frontRight(-1.567)],
  ].map(([z, left, right]) => ({ z,
    ring: [[left, 1.918949], [right, 1.918949],
      [right, 1.9252506], [left, 1.9252506]],
  })));
  classicTurret(P, 'turretDetail', sheet);
  bar(P, [-1.56262, 1.935447, -1.563906], [-.099237, 1.935447, -1.833025], .016498);
}

function basket(P: TankBuilderPort): void {
  for (const [y, back, front] of [[1.935447, -2.488133, -1.580404],
    [2.042145, -2.543008, -1.635279], [2.154041, -2.595755, -1.688026],
    [2.283007, -2.595755, -1.688026]]) hoop(P, y, back, front);
  basketSheet(P);
  for (const x of [-1.3218055, -1.025824, -.7016685, -.3695435]) {
    bar(P, [x, 1.935447, -2.487], [x, 2.154041, -2.595755], .0145565);
    bar(P, [x, 2.154041, -2.595755], [x, 2.28666, -2.595755], .0145565);
  }
  for (const x of [-1.56569, -.1074855])
    bar(P, [x, 1.931638, -2.22079], [x, 2.283271, -2.22079], .0158);
  classicTurret(P, 'turretDetail', box(1.23186, .023696, .434078),
    -.830713, 1.9236, -2.017745);
  for (const x of [-1.25, -.40])
    classicTurret(P, 'turretDetail', box(.035, .028, .28), x, 1.9236, -1.88);
  // Source rear starboard bin is canted and narrows toward its aft end.
  const bin = sectionSolid([
    { z: -2.4595, ring: [[.142287, 2.076869], [.987832, 2.076869],
      [.986073, 2.35385], [.142287, 2.35353]] },
    { z: -2.197976, ring: [[.139624, 1.881953], [.984924, 1.882276],
      [1.06769, 2.378577], [.139433, 2.378253]] },
    { z: -1.772579, ring: [[.224095, 1.832151], [.98341, 1.882276],
      [1.056199, 2.328451], [.223931, 2.32845]] },
  ]);
  classicTurret(P, 'turretDetail', bin);
  for (const y of [1.72, 1.858, 1.987])
    classicTurret(P, 'turretDetail', box(2.300428, .041059, .05953), -.02837, y, -2.055);
}

function mountedGun(P: TankBuilderPort): void {
  // Source neutral file omits an exposed roof weapon. This small supported
  // game-required weapon is an explicit native-only addition, not an oracle
  // match or an invented source object. All its solids share one real owner.
  const mg = sourceMachineGun(P, D.turretPivot);
  mg.add('turretDetail', box(.088, .055, .115), .88, 2.497, .18);
  mg.add('turretDark', box(.07, .065, .24), .88, 2.549, .27);
  mg.add('turretDark', cylZ(.016, .39, 20), .88, 2.553, .58);
  const tube = new THREE.CylinderGeometry(.012, .012, .035, 20, 1, true).rotateX(Math.PI / 2);
  mg.add('turretDark', tube, .88, 2.553, .7925);
  mg.finish();
}

function mount(P: TankBuilderPort): void {
  // The forward fused source housing becomes a closed pitching assembly;
  // its neutral exterior remains independently measured in source meters.
  const g = sectionSolid([
    { z: 1.975, ring: [[-.181, 1.775], [.1954, 1.775], [.1954, 2.224034], [-.181, 2.224034]] },
    { z: 2.45, ring: [[-.181, 1.782193], [.1954, 1.782193], [.1954, 2.224034], [-.181, 2.224034]] },
    { z: 2.768608, ring: [[-.025469, 2.11351], [.0456, 2.11351], [.0456, 2.184578], [-.025469, 2.184578]] },
  ]);
  classicGun(P, 'gunMount', g);
  for (const [x, w] of [[-.161595, .086366], [.175848, .080792]])
    for (const z of [2.077365, 2.272516, 2.459011])
      classicGun(P, 'gunMount', box(w, .256568, .054394), x, 2.032969, z);
}

function tube(P: TankBuilderPort): void {
  // Unlike the later Char file's asymmetric jacket, this source has a round
  // tube. A closed radial profile retains the genuinely deep open bore.
  const outer: readonly [number, number][] = [[2.45012127254, .1681642],
    [2.579, .1681642], [2.58, .1400485], [5.71, .1400485],
    [6.15, .139421], [6.20, .1231615], [D.muzzleZ, .1231615]];
  const cross = [...outer.map(([z, r]) => new THREE.Vector2(r, z)),
    new THREE.Vector2(.0843395, D.muzzleZ), new THREE.Vector2(.0843395, 4.60643577576),
    new THREE.Vector2(0, 4.60643577576), new THREE.Vector2(0, 2.45012127254),
    new THREE.Vector2(.1681642, 2.45012127254)];
  const g = new THREE.LatheGeometry(cross, P.q ? 48 : 32).rotateX(Math.PI / 2);
  classicGun(P, 'gun', g, D.trunnion[0], D.trunnion[1], 0);
  // Independent reflective collar at the source forward station.
  const ring = new THREE.LatheGeometry([[.124, 5.31787], [.1342315, 5.31787],
    [.1342315, 6.246341], [.124, 6.246341], [.124, 5.31787]]
    .map(([r, z]) => new THREE.Vector2(r, z)), P.q ? 48 : 32).rotateX(Math.PI / 2);
  classicGun(P, 'gun', ring, .0056525, 1.9602115, 0);
  classicGun(P, 'gunDark', cylZ(.0843395, .004, 32),
    D.trunnion[0], D.trunnion[1], 4.60443577576);
  P.muzzleZ = D.muzzleZ - D.trunnion[2];
}

function muzzleReference(P: TankBuilderPort): void {
  // The older source's larger MRS sits on two connected legs, not a dark
  // color band or a full barrel collar.
  classicGun(P, 'gun', box(.069884, .032, .232154), .005179, 2.07727, 6.156959);
  for (const z of [6.058, 6.258])
    classicGun(P, 'gun', box(.030, .059, .029), .005179, 2.1135, z);
  classicGun(P, 'gun', cylZ(.0436705, .216676, 24), .004481, 2.1553765, 6.146211);
  classicGun(P, 'gunDark', cylZ(.03025, .003, 24), .004481, 2.1553765, 6.2559);
}

export function addLeclercClassicXEquipment(P: TankBuilderPort): void {
  basket(P); mountedGun(P); mount(P); tube(P); muzzleReference(P);
}
