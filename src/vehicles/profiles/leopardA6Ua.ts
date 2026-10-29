// Leopard 2A6 UA (264; the owner, 2026-10-28: "update the leopard 2a6 UA to have all of its cages and guns and stuff and
// more off of our new current actual leopard 2a6"): the source-measured Leopard 2A6 (leopardA6X.ts, id leo2a6) with the
// field kit Ukraine's 2A6s carry in published photographs, in place of the retired 2A6M-rig field package that lived in
// leopard.ts. Every addition names its source:
//   [A] 21st Separate Mechanized Brigade, photos by Oleksandr Bondar, 2025 (published by the Ukrainian 10th Army Corps;
//       deaidua.org/footage/?id=25): a tall welded cage over the turret under a camouflage net, welded square-mesh screens
//       round the turret and along the front of the hull, a mesh box over the bow corner with a chain curtain, rows of
//       Kontakt-1 cassettes on the rear skirts, a welded steel box at the back.
//   [B] the same footage page, turret close-ups (uploaded 2024-11): angle-iron frames with square wire mesh standing off
//       the turret flanks round the smoke dischargers and the bustle, a fringe of hanging chain along their bottom rails,
//       a mesh roof over them.
//   [C] Ukrainian Leopard 2 practice for the turret front and flanks: Kontakt-1 on the turret front and side projections
//       (Militarnyi, 2023-09-10; Bulgarian Military, 2023-04-07; ArmyInform photos by Ruslan Tarasov, 2025-01). No 2A6
//       photograph shows turret ERA: these four courses are kept for the gameplay sectors the vehicle already carries
//       (germany.ts addLeopard2A6UAFieldEraSectors), and the lane proposed dropping them to Main.
// Everything here is equipment or open lattice (never the armour shell: the OTCO lesson of 2026-10-28); only the
// Kontakt-1 cassettes are gameplay ERA, through the same six sectors and values as before. The one working roof gun is
// the 2A6's own loader MG3 (7.62 mm, as before); the two non-working roof stations of the old build are gone.
// The owner, later the same day: "lets add a ton of extra era and cages and ghillie on the actual tank parts themselves":
// the Kontakt-1 courses run the skirts' whole length, a third course on each turret flank and courses over the wedges'
// tops (all in the six sectors the vehicle already had, at their values); a welded mesh screen stands over the upper
// glacis; the field net lies on the turret roof and decks themselves (ghillieFleetSuits.ts) as well as over the cage. No
// screen can lie on the engine deck: the 2A6's tube, level and turned aft, passes 9 mm over its own fan rings.
// The kit is laid in the hull frame (leopardA6UaLayout.ts) and moved into the turret frame where the turret owns it; the
// brackets and cassettes are seated by rays on the built armour, so they follow the source-measured surfaces.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { buildLeopard2A6X } from './leopardA6X.ts';
import {
  LEOPARD_A6_UA_KIT as K, LEOPARD_A6_UA_PIVOT as PIVOT, leopardA6UaGunFloorY, leopardA6UaRoofY,
} from '../leopardA6UaLayout.ts';
import { addVehicleGhillieSuit } from '../ghillieSuit.ts';
import { addMissionAttachmentReceiver } from '../missionAttachmentReceiver.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Point = readonly [number, number, number];
type Owner = 'hull' | 'turret';
type Role = 'lattice' | 'chain' | 'detail' | 'dark' | 'fitting' | 'cloth';
const ROLE_BUCKET: Readonly<Record<Role, string>> = {
  lattice: 'OpenLattice', chain: 'OpenLatticeDark', detail: 'Detail', dark: 'Dark', fitting: 'FittingPaint', cloth: 'Cloth',
};
const { box } = KIT;

/** A square-section bar from a to b (12 triangles), in the frame its points are given in. */
function bar(a: Point, b: Point, w: number, h = w): THREE.BufferGeometry {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), delta = to.clone().sub(from);
  const g = box(w, delta.length(), h);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
  return g.translate(...from.add(to).multiplyScalar(.5).toArray());
}

class Kit {
  readonly P: TankBuilderPort;
  readonly fine: boolean;
  constructor(P: TankBuilderPort) { this.P = P; this.fine = P.q; }
  /** Authors a part laid in the hull frame on its owner; turret parts move into the turret frame. */
  put(owner: Owner, role: Role, g: THREE.BufferGeometry): void {
    if (owner === 'turret') g.translate(-PIVOT[0], -PIVOT[1], -PIVOT[2]);
    this.P.addEquipment(owner + ROLE_BUCKET[role], g);
  }
  bar(owner: Owner, role: Role, a: Point, b: Point, w: number, h = w): void { this.put(owner, role, bar(a, b, w, h)); }
  /**
   * A welded mesh panel [A][B]: an angle-iron frame round o, o+u, o+u+v, o+v (the edges listed in `edges`) and square
   * wire mesh inside it. `skipU` and `skipV` (distances along u and v) keep wires off where an antenna passes through.
   */
  panel(owner: Owner, o: Point, u: Point, v: Point, opts: { frame?: number; skipU?: readonly number[]; skipV?: readonly number[];
    edges?: readonly boolean[] } = {}): void {
    const frame = opts.frame ?? .036, pitch = this.fine ? .095 : .16, wire = this.fine ? .0065 : .009;
    const at = (s: number, t: number): Point => [o[0] + u[0] * s + v[0] * t, o[1] + u[1] * s + v[1] * t, o[2] + u[2] * s + v[2] * t];
    const lu = Math.hypot(...u), lv = Math.hypot(...v);
    const [e0, e1, e2, e3] = opts.edges ?? [true, true, true, true];
    if (e0) this.bar(owner, 'lattice', at(0, 0), at(1, 0), frame);
    if (e1) this.bar(owner, 'lattice', at(1, 0), at(1, 1), frame);
    if (e2) this.bar(owner, 'lattice', at(1, 1), at(0, 1), frame);
    if (e3) this.bar(owner, 'lattice', at(0, 1), at(0, 0), frame);
    const near = (list: readonly number[] | undefined, m: number) => (list ?? []).some((k) => Math.abs(k - m) < .06);
    const nu = Math.max(1, Math.round(lu / pitch)), nv = Math.max(1, Math.round(lv / pitch));
    for (let i = 1; i < nu; i++) if (!near(opts.skipU, i / nu * lu)) this.bar(owner, 'lattice', at(i / nu, 0), at(i / nu, 1), wire);
    for (let j = 1; j < nv; j++) if (!near(opts.skipV, j / nv * lv)) this.bar(owner, 'lattice', at(0, j / nv), at(1, j / nv), wire);
  }
  /** A dark camouflage net tied over a cage bay [A]: square cords across o, o+u, o+u+v, o+v, no frame of its own. */
  net(owner: Owner, o: Point, u: Point, v: Point): void {
    const pitch = this.fine ? .12 : .18, cord = this.fine ? .014 : .02;
    const at = (s: number, t: number): Point => [o[0] + u[0] * s + v[0] * t, o[1] + u[1] * s + v[1] * t, o[2] + u[2] * s + v[2] * t];
    const nu = Math.max(1, Math.round(Math.hypot(...u) / pitch)), nv = Math.max(1, Math.round(Math.hypot(...v) / pitch));
    for (let i = 1; i < nu; i++) this.bar(owner, 'chain', at(i / nu, 0), at(i / nu, 1), cord);
    for (let j = 1; j < nv; j++) this.bar(owner, 'chain', at(0, j / nv), at(1, j / nv), cord);
  }
  /** One strand of chain from a down to b: links turned a quarter turn each in turn at HIGH, a single rod at LOW. */
  strand(owner: Owner, a: Point, b: Point): void {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.round(length / .06);
    if (!this.fine || n < 2) { this.bar(owner, 'chain', a, b, .011, .006); return; }
    for (let k = 0; k < n; k++) {
      const p = (t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      this.bar(owner, 'chain', p(k / n), p(Math.min(1, (k + 1.2) / n)), k % 2 ? .007 : .022, k % 2 ? .022 : .007);
    }
  }
  /** A fringe of hanging chain under a rail from a to b [A][B]: each strand its own drop, pitch and sway, a few missing. */
  chains(owner: Owner, a: Point, b: Point, bottomY: number, seed: number): void {
    const span = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.max(3, Math.round(span / (this.fine ? .075 : .13)));
    const jit = (i: number, k: number): number => {
      let h = Math.imul(i + seed, 0x9e3779b1) ^ Math.imul(k + 7, 0x85ebca6b);
      h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
      return (h >>> 0) / 4294967296 - .5;
    };
    for (let i = 0; i <= n; i++) {
      if (i > 0 && i < n && jit(i, 1) > .40) continue;
      const t = Math.min(1, Math.max(0, (i + jit(i, 2) * .4) / n));
      const x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t, top = a[1] + (b[1] - a[1]) * t - .012;
      const drop = (top - bottomY) * (.78 + (jit(i, 3) + .5) * .22), sway = jit(i, 4) * .05;
      this.strand(owner, [x, top, z], [x + sway * .4, top - drop, z + sway]);
    }
  }
}

/** A ray caster over one owner's built armour (in that owner's frame), for seating kit on the source-measured surfaces. */
function armourProbe(P: TankBuilderPort, buckets: readonly string[]) {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), meshes: THREE.Mesh[] = [];
  P.forEachBucketPart([...buckets], (geometry) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.updateMatrixWorld();
    meshes.push(mesh);
  });
  const ray = new THREE.Raycaster();
  return {
    hit(origin: Point, direction: Point): THREE.Intersection | null {
      ray.set(new THREE.Vector3(...origin), new THREE.Vector3(...direction).normalize());
      return ray.intersectObjects(meshes, false)[0] ?? null;
    },
    dispose(): void { material.dispose(); },
  };
}

/** Euler (XYZ) that turns a cassette's local +Z onto the face normal n, its local +Y up the face (forward up a roof). */
function faceRotation(n: THREE.Vector3): [number, number, number] {
  const z = n.clone().normalize(), ref = Math.abs(z.y) < .7 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  const y = ref.addScaledVector(z, -ref.dot(z)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z), 'XYZ');
  return [e.x, e.y, e.z];
}

// ---- turret: mesh screens, chain fringe and the roof cage [A][B] --------------------------------------------------

function turretCage(kit: Kit, P: TankBuilderPort): number {
  const probe = armourProbe(P, ['turret']);
  const X = K.turretScreenX, y0 = K.screenBottomY, y1 = K.screenTopY, zr = K.rearScreenZ, zf = K.frontPostZ;
  const [, zMid] = K.postZs;
  let brackets = 0;
  try {
    for (const side of [-1, 1]) {
      // the flank screen: four bays between its posts
      const stations = [zr, -1.95, zMid, .30, zf];
      for (let k = 0; k + 1 < stations.length; k++) {
        const a = stations[k]!, b = stations[k + 1]!;
        kit.panel('turret', [side * X, y0, a], [0, 0, b - a], [0, y1 - y0, 0]);
      }
      // standoff brackets, bolted to the wall: one pair ahead of the bustle baskets and behind the smoke dischargers
      // (z -1.70 to -0.57), and one bracket ahead of them and one at the flank's front, over its three cassette courses
      // (y 1.87-2.36)
      for (const [z, ys] of [[-1.88, [y0 + .05, 2.36]], [-.30, [2.40]], [.72, [2.40]]] as const) for (const y of ys) {
        const hit = probe.hit([side * 4, y - PIVOT[1], z - PIVOT[2]], [-side, 0, 0]);
        if (!hit) throw new Error(`leo2a6_ua: no turret wall under the screen bracket at y ${y} z ${z}`);
        const x = hit.point.x + PIVOT[0];
        kit.bar('turret', 'lattice', [x - side * .01, y, z], [side * X, y, z], .03);
        kit.put('turret', 'detail', box(.05, .10, .10).translate(x + side * .02, y, z));
        brackets++;
      }
      // cage posts up to the eaves, the bays above the screen braced crosswise
      for (const z of K.postZs) kit.bar('turret', 'lattice', [side * X, y1, z], [side * X, K.eaveY, z], .04);
      for (let k = 0; k + 1 < K.postZs.length; k++) {
        kit.bar('turret', 'lattice', [side * X, y1, K.postZs[k]!], [side * X, K.eaveY, K.postZs[k + 1]!], .028);
      }
      kit.chains('turret', [side * X, y0, zr + .04], [side * X, y0, zf - .04], K.chainBottomY, side > 0 ? 11 : 23);
      // the rear corner braced to the bustle roof, the front overhang's corner strut down to the front post
      kit.bar('turret', 'lattice', [side * X, y1, zr], [side * .62, 2.345, -2.55], .03);
      kit.bar('turret', 'lattice', [side * X, K.eaveY, K.roofFrontZ], [side * X, y1, zf], .028);
    }
    // the bustle's rear screen, tied back to the bustle wall either side of the middle
    kit.panel('turret', [-X, y0, zr], [2 * X, 0, 0], [0, y1 - y0, 0]);
    for (const x of [-.25, .40]) for (const y of [y0 + .08, 2.28]) {
      const hit = probe.hit([x - PIVOT[0], y - PIVOT[1], -5], [0, 0, 1]);
      if (!hit) throw new Error(`leo2a6_ua: no bustle wall behind the rear screen at x ${x} y ${y}`);
      kit.bar('turret', 'lattice', [x, y, hit.point.z + PIVOT[2] - .01], [x, y, zr], .03);
      brackets++;
    }
    kit.chains('turret', [-X + .04, y0, zr], [X - .04, y0, zr], K.chainBottomY, 37);
    // the camouflage net tied round the cage above the screens [A: the 2025 cage is netted from the screens to its roof],
    // just outboard of the posts and braces; the front stays open for the sights and the gun
    const netY = y1 + .02, netH = K.eaveY - netY;
    for (const side of [-1, 1]) kit.net('turret', [side * (X + .03), netY, zr], [0, 0, zf - zr], [0, netH, 0]);
    kit.net('turret', [-X, netY, zr - .03], [2 * X, 0, 0], [0, netH, 0]);
    // the pitched roof: eave and ridge rails, a bow at every post station and at the front edge, square mesh between
    // them; the rear bay's wires step round the two whip antennas where they pass through it
    for (const x of [-X, 0, X]) kit.bar('turret', 'lattice', [x, leopardA6UaRoofY(x), zr], [x, leopardA6UaRoofY(x), K.roofFrontZ], .04);
    for (const z of [...K.postZs, K.roofFrontZ]) for (const side of [-1, 1]) {
      kit.bar('turret', 'lattice', [side * X, K.eaveY, z], [0, K.crownY, z], .036);
    }
    // under the wires, the roof's sheet of expanded mesh [A: the rusty sheet over the 2025 cage]: what the net is laid on
    for (const side of [-1, 1]) {
      kit.bar('turret', 'chain', [0, K.crownY - .0055, (zr + K.roofFrontZ) / 2], [side * X, K.eaveY - .0055, (zr + K.roofFrontZ) / 2],
        .004, K.roofFrontZ - zr);
    }
    const bays = [zr, zMid, zf, K.roofFrontZ];
    const across = Math.hypot(X, K.eaveY - K.crownY);
    for (const side of [-1, 1]) {
      const whips = K.whipXs.filter((x) => Math.sign(x) === side).map((x) => Math.abs(x) / X * across);
      for (let k = 0; k + 1 < bays.length; k++) {
        const a = bays[k]!, b = bays[k + 1]!, spans = K.whipZ > a && K.whipZ < b;
        kit.panel('turret', [0, K.crownY, a], [0, 0, b - a], [side * X, K.eaveY - K.crownY, 0], {
          edges: [false, false, false, false], skipU: spans ? [K.whipZ - a] : [], skipV: spans ? whips : [] });
      }
    }
  } finally { probe.dispose(); }
  return brackets;
}

// ---- hull: mesh boxes over the front skirts and the bow corner, chain curtains [A] -------------------------------

/** The highest a hull box's top may stand over [x0, x1] x [z0, z1]: its own 1.44 m, or 25 mm (nationalGunClearance's keep)
 * plus its rail's half-width under the main gun's swept underside at the 9-degree stop, rounded down to 5 mm. A further
 * 25 mm covers the turret's seat over the deck, which the closed-form sweep leaves out (the gun probe measured the tube
 * 15 mm under it at yaw 47). */
function boxTop(x0: number, x1: number, z0: number, z1: number): number {
  let floor = Infinity;
  for (let i = 0; i <= 8; i++) for (const x of [x0, x1]) floor = Math.min(floor, leopardA6UaGunFloorY(x, z0 + (z1 - z0) * i / 8));
  return Math.min(K.hullBoxTopY, Math.floor((floor - .025 - .025 - .018) * 200) / 200);
}

function hullScreens(kit: Kit, P: TankBuilderPort): number {
  const probe = armourProbe(P, ['hull', 'hullExternalArmor']);
  const xo = K.hullBoxX, xi = K.hullBoxInnerX, yb = K.hullBoxBottomY, [z0, z1] = K.hullBoxZ;
  let brackets = 0;
  try {
    for (const side of [-1, 1]) {
      // one welded box per bay, each as tall as the main gun's sweep over it allows: the tops step down toward the bow
      const stations = [z0, ...HULL_SCREEN_STATIONS.slice(1, -1), z1];
      const tops = stations.slice(0, -1).map((a, k) => boxTop(xi, xo + .02, a, stations[k + 1]!));
      for (let k = 0; k + 1 < stations.length; k++) {
        const a = stations[k]!, b = stations[k + 1]!, yt = tops[k]!;
        kit.panel('hull', [side * xo, yb, a], [0, 0, b - a], [0, yt - yb, 0]);
        kit.panel('hull', [side * xi, yt, a], [0, 0, b - a], [side * (xo - xi), 0, 0]);
      }
      // brackets at every station (the front one on the skirt's last plate, short of its tapered nose): standoffs from
      // the skirt's face at two heights, and a tab from the skirt's top up to the box's inner rail
      for (const [k, z] of HULL_SCREEN_STATIONS.entries()) {
        const yt = Math.min(tops[Math.max(0, k - 1)]!, tops[Math.min(k, tops.length - 1)]!);
        for (const y of [1.02, 1.26]) {
          const hit = probe.hit([side * 3, y, z], [-side, 0, 0]);
          if (!hit || Math.abs(hit.point.x) < 1.6) throw new Error(`leo2a6_ua: no skirt face under the hull screen at y ${y} z ${z}`);
          kit.bar('hull', 'lattice', [hit.point.x - side * .008, y, z], [side * xo, y, z], .03);
          brackets++;
        }
        const top = probe.hit([side * xi, 3, z], [0, -1, 0]);
        if (top && top.point.y > 1.1 && top.point.y < yt - .03) kit.bar('hull', 'lattice', [side * xi, top.point.y - .01, z], [side * xi, yt, z], .03);
      }
      // the bow box: its face ahead of the fender tip, its top over the fender, the chain curtain in front of the track
      const xb = K.bowInnerX, zb = K.bowFaceZ, yo = Math.min(K.bowTopY, boxTop(xb, xo + .02, z1, zb + .02));
      kit.panel('hull', [side * xb, yb, zb], [side * (xo - xb), 0, 0], [0, yo - yb, 0]);
      kit.panel('hull', [side * xb, yo, z1], [side * (xo - xb), 0, 0], [0, 0, zb - z1], { edges: [false, true, false, true] });
      kit.panel('hull', [side * xo, yb, z1], [0, 0, zb - z1], [0, yo - yb, 0], { edges: [false, true, false, false] });
      kit.bar('hull', 'lattice', [side * xb, yo, z1], [side * xb, yo, zb], .036);
      // the bow box rides a bar from the glacis' tow plate
      const tow = probe.hit([side * 1.30, 1.18, 6], [0, 0, -1]);
      if (tow) kit.bar('hull', 'lattice', [side * 1.30, 1.18, tow.point.z - .01], [side * 1.30, 1.18, zb], .03);
      kit.chains('hull', [side * (xb + .03), yb, zb + .005], [side * (xo - .03), yb, zb + .005], K.bowChainBottomY, side > 0 ? 51 : 67);
    }
  } finally { probe.dispose(); }
  return brackets;
}

// ---- screens on the hull's own plates (the owner: "cages ... on the actual tank parts themselves") ----------------

/** The glacis screen: welded mesh standing off the upper glacis on brackets, its face bent down over the nose plate
 * between the headlights, 25 mm (and its frame) under the main gun's 9-degree sweep everywhere over it. */
function glacisScreen(kit: Kit, P: TankBuilderPort): void {
  const probe = armourProbe(P, ['hull']);
  const plate = (x: number, z: number): number => {
    const hit = probe.hit([x, 3, z], [0, -1, 0]);
    if (!hit) throw new Error(`leo2a6_ua: no glacis under the screen at x ${x} z ${z}`);
    return hit.point.y;
  };
  try {
    const half = .98, za = 2.92, zb = 3.28, off = .07;
    const lift = (z: number): number => Math.min(off, Math.min(...[-half, 0, half].map((x) =>
      leopardA6UaGunFloorY(x, z) - .025 - .018 - plate(x, z))));
    const ya = plate(0, za) + lift(za), yb = plate(0, zb) + lift(zb);
    kit.panel('hull', [-half, ya, za], [2 * half, 0, 0], [0, yb - ya, zb - za]);
    // the face over the nose plate, between the headlights, 8 cm out from the plate at its foot (rays in from ahead)
    const nose = .62, yc = 1.08, foot = probe.hit([0, yc, 6], [0, 0, -1]);
    if (!foot) throw new Error('leo2a6_ua: no nose plate under the glacis screen');
    kit.panel('hull', [-nose, yb, zb + .02], [2 * nose, 0, 0], [0, yc - yb, foot.point.z + .08 - zb - .02]);
    for (const x of [-half + .03, -.33, .33, half - .03]) for (const z of [za + .03, zb - .03]) {
      const y = plate(x, z);
      kit.bar('hull', 'lattice', [x, y - .004, z], [x, (z < 3 ? ya : yb) - .018, z], .024);
    }
  } finally { probe.dispose(); }
}

// ---- Kontakt-1 cassettes: the six gameplay sectors [A][C] ---------------------------------------------------------

/** Kontakt-1 4S20 cassette, 252 x 132 x 70 mm, against the factory's 280 x 130 x 70 mm brick. The courses leave 3-4 cm
 * between cassettes, as the photographed rows do, so their dark plates read as seams through the camouflage. */
const BRICK = Object.freeze({ w: .252, h: .132, d: .070 });
const LYING = Object.freeze([BRICK.w / .28, BRICK.h / .13, 1] as const);
const STANDING = Object.freeze([BRICK.h / .28, BRICK.w / .13, 1] as const);
/** The hull screens' bracket stations (hullScreens; the front one on the skirt's last plate). */
const HULL_SCREEN_STATIONS = Object.freeze([K.hullBoxZ[0], 1.45, 2.42, 3.30, K.hullBoxZ[1] - .14]);

function kontakt(P: TankBuilderPort): Record<string, number> {
  const counts: Record<string, number> = {};
  // each cassette's dark mounting plate, 11 mm proud of its sides: the seams between cassettes read as the steel frames
  // they are bolted to (the Ukrainian Abrams kit's rims, abramsSourceXUkraineKit.ts), and they stay when a cassette is spent
  const plates: { owner: Owner; g: THREE.BufferGeometry }[] = [];
  const hullProbe = armourProbe(P, ['hull', 'hullExternalArmor']);
  const turretProbe = armourProbe(P, ['turret']);
  // a course along a wall (rays in from the flank at height y) or over a roof (rays down at x); a roof course keeps
  // only the cassettes that land on a face turned up
  type CourseRow = { y?: number; x?: number; zs: readonly number[]; scale: readonly number[] };
  const seat = (owner: Owner, sector: string, side: number, rows: readonly CourseRow[]): void => {
    P.eraCluster(sector, (place) => {
      for (const row of rows) for (const z of row.zs) {
        const probe = owner === 'turret' ? turretProbe : hullProbe, lift = owner === 'turret' ? PIVOT : [0, 0, 0] as const;
        const roof = row.x !== undefined;
        const hit = roof ? probe.hit([row.x! - lift[0], 6, z - lift[2]], [0, -1, 0])
          : probe.hit([side * 4, row.y! - lift[1], z - lift[2]], [-side, 0, 0]);
        if (roof && (!hit?.face || hit.face.normal.y < .55)) continue;
        if (!hit?.face) throw new Error(`leo2a6_ua/${sector}: no armour face at y ${row.y} z ${z}`);
        // a ray through the seam between two skirt plates lands on the hull side behind the track's top run: no cassette
        if (owner === 'hull' && !roof && Math.abs(hit.point.x) < 1.6) continue;
        const n = hit.face.normal.clone();
        if (roof) { if (n.y < 0) n.negate(); } else {
          if (n.x * side < 0) n.negate();
          n.y = Math.max(-.35, Math.min(.35, n.y));
        }
        n.normalize();
        // the back face 6 mm into the plate it is bolted to
        const c = hit.point.clone().addScaledVector(n, BRICK.d / 2 - .006);
        if (owner === 'turret') c.add(new THREE.Vector3(...PIVOT));
        const [rx, ry, rz] = faceRotation(n);
        place(c.x, c.y, c.z, rx, ry, rz, row.scale[0], row.scale[1], row.scale[2]);
        const foot = hit.point.clone().addScaledVector(n, .002);
        if (owner === 'turret') foot.add(new THREE.Vector3(...PIVOT));
        plates.push({ owner, g: box(row.scale[0] * .28 + .022, row.scale[1] * .13 + .022, .008)
          .applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ'))).translate(foot.x, foot.y, foot.z) });
        counts[sector] = (counts[sector] ?? 0) + 1;
      }
    }, owner === 'turret');
  };
  const run = (from: number, to: number, pitch: number, halfW = 0): number[] => {
    const n = Math.floor((to - from) / pitch + 1e-6), start = from + ((to - from) - n * pitch) / 2;
    // clear of the hull screens' brackets (their standoffs reach the skirt's face at every station)
    return Array.from({ length: n + 1 }, (_, i) => +(start + i * pitch).toFixed(4))
      .filter((z) => !halfW || HULL_SCREEN_STATIONS.every((station) => Math.abs(z - station) > halfW + .03));
  };
  try {
    for (const side of [-1, 1]) {
      // the fleet names a sector by the sign of its x (+x 'R': eraSurfaceFrame.ts keeps only that side's points)
      const s = side > 0 ? 'R' : 'L';
      // the rear skirts [A]: a course of standing cassettes under a course of lying ones, from the last skirt plate to
      // the middle of the hull, where the mesh box begins (the rearmost plate is short: the standing course starts ahead)
      // the skirts [A], their whole length (the owner): a course of standing cassettes under a course of lying ones,
      // from the last skirt plate to the nose, behind the hull's mesh boxes and round their brackets (the rearmost plate
      // is short: the standing course starts ahead of it; the lying course stops short of the lowest box top, 1.29 m)
      seat('hull', `ua_skirt_era_${s}`, side, [
        { y: 1.016, zs: run(-2.76, 3.45, .165, BRICK.h / 2), scale: STANDING },
        { y: 1.232, zs: run(K.skirtEraZ[0], 3.25, .29, BRICK.w / 2), scale: LYING },
      ]);
      // the turret's flat flanks ahead of the dischargers [C]: three courses of lying cassettes behind the screen
      seat('turret', `ua_turret_side_era_${s}`, side, [
        { y: 1.94, zs: run(-.42, .96, .29), scale: LYING },
        { y: 2.12, zs: run(-.42, .96, .29), scale: LYING },
        { y: 2.29, zs: run(-.42, .96, .29), scale: LYING },
      ]);
      // the turret front [C]: two courses down the wedge's outer face and, over the wedge's top, three rows (two on the
      // right wedge, outboard of the EMES and its view); the gun's mantlet passes inside them at every pitch
      seat('turret', `ua_turret_cheek_era_${s}`, side, [
        { y: 1.82, zs: run(1.22, 2.10, .29), scale: LYING },
        { y: 1.98, zs: run(1.22, 2.10, .29), scale: LYING },
        ...(side > 0 ? [.52, .80, 1.08] : [-1.10, -1.36]).map((x) => ({ x, zs: run(1.30, 2.36, .29), scale: LYING })),
      ]);
    }
  } finally { hullProbe.dispose(); turretProbe.dispose(); }
  for (const { owner, g } of plates) {
    if (owner === 'turret') g.translate(-PIVOT[0], -PIVOT[1], -PIVOT[2]);
    P.addEquipment(`${owner}Dark`, g);
  }
  return counts;
}

// ---- stowage [A], the roof dock and markings -------------------------------------------------------------------------

function stowage(kit: Kit): void {
  // a welded steel box in the left bustle basket and a rolled tarpaulin in the right one, inside the rear screen
  const floorY = 1.909, segments = kit.fine ? 14 : 8;
  kit.put('turret', 'fitting', box(.42, .30, .48).translate(.90, floorY + .15, -2.43));
  for (const dz of [-.16, .16]) kit.put('turret', 'dark', box(.43, .022, .03).translate(.90, floorY + .30, -2.43 + dz));
  kit.put('turret', 'cloth', KIT.cylX(.13, .44, segments).translate(-.90, floorY + .13, -2.43));
  for (const dx of [-.14, .14]) kit.put('turret', 'dark', KIT.cylX(.134, .03, segments).translate(-.90 + dx, floorY + .13, -2.43));
}

export function buildLeopard2A6UA(P: TankBuilderPort): void {
  buildLeopard2A6X(P);
  const kit = new Kit(P);
  const cassettes = kontakt(P);
  const turretBrackets = turretCage(kit, P);
  const hullBrackets = hullScreens(kit, P);
  glacisScreen(kit, P);
  stowage(kit);
  // the roof dock's rail, the length of the roof on its right half, welded into the mesh's plane
  // (missionAttachmentReceiver.ts seats on it)
  const railY = leopardA6UaRoofY(K.dockRailX);
  kit.bar('turret', 'detail', [K.dockRailX, railY, K.rearScreenZ], [K.dockRailX, railY, K.roofFrontZ], K.dockRailW);
  addMissionAttachmentReceiver(P, 'leo2a6_ua');
  // the tactical number on the right rear hull wall above the skirt cassettes; the shared marking pass seats the trident
  // on the left one (vehicleMarkings.ts)
  P.decal('hull', 'number', null, .19, [-1.656, 1.58, -2.20], -Math.PI / 2, 0, -.175);
  if (P.geometryReceipt) {
    P.turretG.userData.leopard2A6UAKitReceipt = Object.freeze({
      base: 'leo2a6', sources: Object.freeze(['A', 'B', 'C']), cassettes: Object.freeze(cassettes),
      turretBrackets, hullBrackets, equipmentIsNonArmor: true,
    });
  }
  addVehicleGhillieSuit(P);
}

export const LEOPARD_A6_UA_PROFILES = Object.freeze({ leo2a6_ua: { build: buildLeopard2A6UA } });
