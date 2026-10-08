// src/world/maps/reservoirDam.ts — Glen Canyon Dam in the battlefield (the map-revival lane, 2026-10-06, Skybridge
// round 4; gauntlet waves 170-171: "the landform must be inverted into a deep, sheer-walled canyon arm holding the water
// against a curved dam", "the dam needs arch curvature, a crest road, intake towers and the powerhouse reading at its
// toe").
//
// The reservoir's arm ends at a road across the canyon (the map's terrain: the arm's square end on one side of the
// road, the tailwater pocket on the other). This stands the dam on that road. Its upstream face is a vertical concrete
// arch, convex to the reservoir and keyed into both walls, rising from the arm's bed to a walkway at the road's height.
// Four intake towers on the face carry their gate-hoist houses over the walkway, with a gantry crane spanning them.
// Its downstream face is battered, from the road down into the pocket. The powerhouse is a long concrete hall along
// its toe in the tailwater, the penstocks coming down into its back, and the river outlet is a tunnel portal in the
// pocket's far wall. Parapets line the road over the dam; those walls carry collision, so a hull keeps to the road.
// Everything else is soft dressing in the shared buckets (the kit's poured concrete, the dark of an opening, the
// structural steel): no draw of its own.
// (round 7, gauntlet wave 259) The tailwater is rock — a short canyon below the face, a D in plan, fallen blocks on its
// brow (skybridgeArm.ts) — where round 4's kerb ring stood; no gate-hoist houses on the walkway, a lattice gantry crane,
// lamp standards with their mast arms, and the concrete's lifts, joints, the lake's ring and the runoff painted on the
// kit's weathered concrete.
import * as THREE from 'three';
import { cloneCollisionRecord, setCompoundShape, type CollisionRecord, type SimpleCollisionShape } from '../collision.ts';
import { box } from '../propGeometry.ts';

export interface ReservoirDamSite {
  /** The crest's middle, on the road's centre line (m). */
  x: number;
  z: number;
  /** The road's direction across the canyon (degrees from +x toward +z); the reservoir lies to its right. */
  roadDeg: number;
  /** Half the chord between the abutments (m) and the arch's radius (m). */
  halfChordM: number;
  archRadiusM: number;
  /** How far upstream of the road's centre line the face meets the abutments (m): past the arm's square end. */
  abutmentM: number;
  /** The road's half-width between the parapets (m). */
  roadHalfM: number;
  /** The reservoir's bed and the tailwater's bed (m). */
  reservoirBedY: number;
  tailwaterBedY: number;
  /** (round 7) The lake's level (m), for the calcite ring on the upstream face. Absent: half a metre over the bed. */
  waterY?: number;
  /** The tailwater pocket: its extent along the road from the crest's middle (m), its half-width and its near wall's
   * distance downstream of the road's centre line (m). */
  pocketFromM: number;
  pocketToM: number;
  pocketHalfM: number;
  pocketWallM: number;
  /** Kerbs along the reservoir's rims from the dam's abutments, [x0, z0, x1, z1] (m): the road's banks grade the arm's
   * corners there into slopes a hull could take down to the water. */
  rimGuards?: readonly (readonly [number, number, number, number])[];
  /** (round 7) The river outlet's tunnel portal in the tailwater's far wall: its foot's centre (m) and the bearing it faces
   * (degrees from +x toward +z, back toward the dam). Absent: round 4's portal in the pocket's west end. */
  outlet?: { x: number; z: number; yawDeg: number };
  /** (round 7) The tailwater's sides are rock (a short canyon below the dam, its own fallen blocks on its brow): no kerb
   * ring round it. Absent: round 4's kerb and rail round the pocket's rim. */
  naturalTailwater?: boolean;
}

interface DamGround {
  getHeightAt(x: number, z: number): number;
}

interface DamBuckets {
  plaster2?: THREE.BufferGeometry[];
  dark: THREE.BufferGeometry[];
  structureMetal?: THREE.BufferGeometry[];
  [name: string]: THREE.BufferGeometry[] | undefined;
}

/** What the receipts read back: the build's dimensions and counts. */
export interface ReservoirDamReceipt {
  chordM: number;
  sagM: number;
  crestY: number;
  upstreamFaceM: number;
  downstreamFaceM: number;
  triangles: number;
  towers: number;
  parapetM: number;
  kerbM: number;
  /** (round 7) The lift lines painted over the upstream face's ring. */
  lifts: number;
}

const STEEL: readonly [number, number, number] = [0.55, 0.58, 0.58];
// (Skybridge round 6, gauntlet wave 259: "a flat-yellow box-section gantry ... reading as placeholder geometry") the
// gantry crane in the Bureau's weathered machinery green, as the kit's switchyard steel
const GANTRY: readonly [number, number, number] = [0.40, 0.47, 0.42];
const DARK: readonly [number, number, number] = [0.12, 0.12, 0.13];
const PARAPET_H = 1.1, PARAPET_T = 0.45, KERB_H = 0.9, KERB_T = 0.6;

/** A colour attribute over a geometry. */
function paint(geometry: THREE.BufferGeometry, rgb: readonly [number, number, number]): THREE.BufferGeometry {
  const n = geometry.getAttribute('position').count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = rgb[0]; c[i * 3 + 1] = rgb[1]; c[i * 3 + 2] = rgb[2]; }
  geometry.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geometry;
}

/**
 * A smooth surface through rows of points (rows[r][j], j along it), UVs in metres at the props' half scale (the
 * distance along the first row and down each column), its normals turned toward `outward`.
 */
function surface(rows: readonly (readonly THREE.Vector3[])[], outward: THREE.Vector3): THREE.BufferGeometry {
  const R = rows.length, J = rows[0].length;
  const pos = new Float32Array(R * J * 3), uv = new Float32Array(R * J * 2), idx: number[] = [];
  const along = [0];
  for (let j = 1; j < J; j++) along.push(along[j - 1] + rows[0][j].distanceTo(rows[0][j - 1]));
  for (let r = 0; r < R; r++) for (let j = 0; j < J; j++) {
    const p = rows[r][j], k = r * J + j;
    pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
    let down = 0;
    for (let q = 1; q <= r; q++) down += rows[q][j].distanceTo(rows[q - 1][j]);
    uv[k * 2] = along[j] * 0.5; uv[k * 2 + 1] = down * 0.5;
  }
  const a = new THREE.Vector3(), b = new THREE.Vector3(), n = new THREE.Vector3();
  a.subVectors(rows[R - 1][J - 1], rows[0][0]); b.subVectors(rows[0][J - 1], rows[R - 1][0]); n.crossVectors(a, b);
  const flip = n.dot(outward) < 0;
  for (let r = 0; r < R - 1; r++) for (let j = 0; j < J - 1; j++) {
    const i00 = r * J + j, i01 = i00 + 1, i10 = i00 + J, i11 = i10 + 1;
    if (!flip) idx.push(i00, i10, i11, i00, i11, i01); else idx.push(i00, i11, i10, i00, i01, i11);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A box `w` (along u) x `h` x `d` (along v), its base's centre at p, turned so its local x runs along u. */
function placedBox(w: number, h: number, d: number, p: THREE.Vector3, u: THREE.Vector3): THREE.BufferGeometry {
  const g = box(w, h, d, 0.5);
  g.rotateY(-Math.atan2(u.z, u.x));
  g.translate(p.x, p.y + h / 2, p.z);
  return g;
}

/** A prism of `seg` sides from a to b, radius r (a pipe or a pole). */
function pipe(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 8): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
  const mid = a.clone().add(b).multiplyScalar(0.5), dir = b.clone().sub(a).normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

/**
 * (round 7, gauntlet wave 259: "an untextured flat-grey slab block on a bare grey deck ... a box-section gantry and stick
 * lamp posts, reading as placeholder geometry rather than board-formed, weathered 1960s concrete"; "the dam at its end as
 * a row of grey towers rather than a curved concrete arch") The concrete's own marks, painted on the kit's poured concrete
 * where the map has a regional kit (regionalPlaster2: the kit's concrete under per-vertex tints): the pours' lift lines
 * every 2.3 m (the Bureau's 7.5 ft lifts) and the contraction joints between its blocks every 15 m, the lake's calcite
 * ring on the upstream face over the waterline, the runoff's dark streaks under the parapet's scuppers. Each a band a few
 * centimetres proud of its face, so it reads at any distance without a texture of its own.
 */
const CONCRETE_TINT: readonly [number, number, number] = [0.84, 0.82, 0.78];
const LIFT_TINT: readonly [number, number, number] = [0.68, 0.66, 0.62];
const JOINT_TINT: readonly [number, number, number] = [0.58, 0.56, 0.53];
const RING_TINT: readonly [number, number, number] = [1, 0.985, 0.95];
const STREAK_TINT: readonly [number, number, number] = [0.6, 0.57, 0.53];
const DECK_TINT: readonly [number, number, number] = [0.74, 0.72, 0.68];
const LIFT_M = 2.3, JOINT_M = 15;

/** A deterministic 0..1 from two integers (no stream: the dam draws no random numbers). */
function hash01(i: number, k: number): number {
  const v = Math.sin(i * 12.9898 + k * 78.233 + 0.5) * 43758.5453;
  return v - Math.floor(v);
}

/** Stand the dam, its powerhouse, intakes and walls; push its collision into both sinks. */
export function dressReservoirDam(site: ReservoirDamSite, ground: DamGround, buckets: DamBuckets,
  obstacles?: CollisionRecord[], colliders?: CollisionRecord[]): ReservoirDamReceipt {
  // (round 7) the kit's weathered concrete when the map has one, painted per vertex; else the shared concrete as before
  const regional = buckets.regionalPlaster2;
  const concrete = regional ?? buckets.plaster2 ?? buckets.stone ?? buckets.plaster!;
  const metal = buckets.structureMetal ?? buckets.dark;
  const rd = site.roadDeg * Math.PI / 180;
  const u = new THREE.Vector3(Math.cos(rd), 0, Math.sin(rd));          // along the road
  const v = new THREE.Vector3(u.z, 0, -u.x);                            // upstream (the road's right)
  const O = new THREE.Vector3(site.x, 0, site.z);
  const at = (s: number, t: number, y = 0): THREE.Vector3 => O.clone().addScaledVector(u, s).addScaledVector(v, t).setY(y);
  const crestY = ground.getHeightAt(site.x, site.z);
  const R = site.archRadiusM, phiMax = Math.asin(Math.min(0.99, site.halfChordM / R));
  const sag = R * (1 - Math.cos(phiMax));
  // the arch: centred downstream so its abutments stand `abutmentM` upstream of the road's line
  const centreT = site.abutmentM - R * Math.cos(phiMax);
  const arch = (phi: number, inset: number, y: number): THREE.Vector3 =>
    at((R - inset) * Math.sin(phi), centreT + (R - inset) * Math.cos(phi), y);
  const N = 28, phis = Array.from({ length: N + 1 }, (_, j) => -phiMax + 2 * phiMax * (j / N));
  const bedUp = site.reservoirBedY - 2, walkY = crestY + 0.15, crestTop = walkY + PARAPET_H;
  const waterY = site.waterY ?? site.reservoirBedY + 0.5;
  const upVec = new THREE.Vector3(0, 1, 0), upstream = v.clone(), downstream = v.clone().negate();
  let triangles = 0;
  // (a bucket merges its parts whole, so each part takes the attributes the bucket's parts carry: a colour where they
  // carry one — always in the regional concrete — the structural steel's paint, and none in the dark)
  const push = (list: THREE.BufferGeometry[], g: THREE.BufferGeometry, rgb: readonly [number, number, number], colour = false) => {
    if (colour || list[0]?.getAttribute('color')) paint(g, rgb);
    triangles += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    list.push(g);
  };
  // the concrete: the regional bucket's parts are unindexed (the kit's), with its colour
  const pushConcrete = (g: THREE.BufferGeometry, rgb: readonly [number, number, number] = CONCRETE_TINT) =>
    push(concrete, regional ? g.toNonIndexed() : g, rgb, !!regional);
  // a band over the arch's face between two heights, `inset` off it (negative: upstream, proud of the face), between two
  // bearings (default the whole span)
  const archBand = (y0: number, y1: number, inset: number, rgb: readonly [number, number, number], j0 = 0, j1 = N) =>
    pushConcrete(surface([phis.slice(j0, j1 + 1).map((phi) => arch(phi, inset, y1)), phis.slice(j0, j1 + 1).map((phi) => arch(phi, inset, y0))], upstream), rgb);
  // the upstream face (vertical, the arch), its lifts banded by the face's rows
  const faceRows: THREE.Vector3[][] = [];
  const LIFTS = 6;
  for (let r = 0; r <= LIFTS; r++) faceRows.push(phis.map((phi) => arch(phi, 0, crestTop + (bedUp - crestTop) * (r / LIFTS))));
  pushConcrete(surface(faceRows, upstream));
  // (round 7) the lake's calcite ring over the waterline, the lifts over it, the joints down the face
  archBand(waterY - 0.3, waterY + 4.8, -0.03, RING_TINT);
  let lifts = 0;
  for (let y = waterY + 4.8 + LIFT_M; y < walkY - 0.4; y += LIFT_M) { archBand(y - 0.06, y + 0.06, -0.035, LIFT_TINT); lifts++; }
  const jointEvery = Math.max(1, Math.round(N * JOINT_M / (2 * R * phiMax)));
  for (let j = jointEvery; j < N; j += jointEvery) {
    const dphi = 0.08 / R;
    pushConcrete(surface([[arch(phis[j] - dphi, -0.04, crestTop - 0.05), arch(phis[j] + dphi, -0.04, crestTop - 0.05)],
      [arch(phis[j] - dphi, -0.04, waterY - 0.3), arch(phis[j] + dphi, -0.04, waterY - 0.3)]], upstream), JOINT_TINT);
  }
  // the walkway over the arch: from the arch's crest back to the road's upstream parapet, its parapet on the arch
  const roadEdge = site.roadHalfM + PARAPET_T;
  const walkRow = (phi: number) => { const p = arch(phi, 0, walkY), s = (p.clone().sub(O)).dot(u); return at(s, roadEdge, walkY); };
  pushConcrete(surface([phis.map((phi) => arch(phi, 0, walkY)), phis.map(walkRow)], upVec), DECK_TINT);
  // (round 7) the walkway's expansion joints over the blocks' joints, dark lines across the deck
  for (let j = jointEvery; j < N; j += jointEvery) {
    const a = arch(phis[j], 0.05, walkY + 0.02), b = walkRow(phis[j]).setY(walkY + 0.02), d = b.clone().sub(a);
    const side = new THREE.Vector3(d.z, 0, -d.x).normalize().multiplyScalar(0.06);
    pushConcrete(surface([[a.clone().add(side), b.clone().add(side)], [a.clone().sub(side), b.clone().sub(side)]], upVec), JOINT_TINT);
  }
  const archParapet = [phis.map((phi) => arch(phi, 0, crestTop)), phis.map((phi) => arch(phi, PARAPET_T, crestTop)),
    phis.map((phi) => arch(phi, PARAPET_T, walkY))];
  pushConcrete(surface(archParapet.slice(0, 2), upVec));
  pushConcrete(surface(archParapet.slice(1), downstream));
  // the intake towers on the face's middle: semicircular trash-rack structures from the bed to the walkway, the racks'
  // dark slots round their noses. (round 7: no gate-hoist houses on the walkway — from the plateau the four boxes read as
  // "a row of grey towers" over the arch; the gantry crane works the gates, a hatch over each tower)
  let towers = 0;
  for (const phi of [-0.36, -0.12, 0.12, 0.36].map((k) => k * phiMax * 1.6)) {
    const base = arch(phi, 0, 0), out = base.clone().sub(arch(phi, 1, 0)).normalize();
    const tangent = new THREE.Vector3(out.z, 0, -out.x);
    // (the half-round's diameter on the face, so the tower stands against it)
    const radius = 3.2, cx = base.clone();
    const ring = (y: number) => Array.from({ length: 9 }, (_, k) => {
      const a = -Math.PI / 2 + Math.PI * (k / 8);
      return cx.clone().addScaledVector(tangent, Math.sin(a) * radius).addScaledVector(out, Math.cos(a) * radius).setY(y);
    });
    pushConcrete(surface([ring(walkY + 0.2), ring(bedUp)], out));
    // the tower's cap over the walkway's level and its hatch
    pushConcrete(surface([ring(walkY + 0.2), Array.from({ length: 9 }, () => cx.clone().setY(walkY + 0.2))], upVec), DECK_TINT);
    push(buckets.dark, placedBox(2.4, 0.08, 1.8, cx.clone().addScaledVector(out, 1.4).setY(walkY + 0.2), tangent), DARK);
    for (let k = 1; k < 8; k += 2) {
      const a = -Math.PI / 2 + Math.PI * ((k + 0.5) / 8);
      const p = cx.clone().addScaledVector(tangent, Math.sin(a) * (radius + 0.05)).addScaledVector(out, Math.cos(a) * (radius + 0.05));
      const slot = placedBox(0.9, (walkY - 3) - (site.reservoirBedY + 1), 0.25, p.setY(site.reservoirBedY + 1), tangent.clone().multiplyScalar(Math.cos(a)).addScaledVector(out, -Math.sin(a)).normalize());
      push(buckets.dark, slot, DARK);
    }
    towers++;
  }
  // the gantry crane over the intakes (round 7: "a flat box-section gantry"): two portal frames of lattice legs under a
  // truss beam across the walkway, tied along the walkway by two lattice end ties, the trolley's machinery house on the
  // beams and its hook block hanging under it — all members of round section in the Bureau's machinery green
  {
    const t0 = roadEdge + 1.4, t1 = site.abutmentM + sag - 1.8, H = 11.5, legW = 0.9;
    const member = (a: THREE.Vector3, b: THREE.Vector3, r: number) => push(metal, pipe(a, b, r, 6), GANTRY);
    /** A lattice column from y0 to y1 at (s, t): four chords, a diagonal on each face every bay. */
    const column = (s: number, t: number, y0: number, y1: number) => {
      const c = (ds: number, dt: number, y: number) => at(s + ds * legW / 2, t + dt * legW / 2, y);
      for (const [ds, dt] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) member(c(ds, dt, y0), c(ds, dt, y1), 0.11);
      const bays = Math.max(2, Math.round((y1 - y0) / 1.6));
      for (let k = 0; k < bays; k++) {
        const ya = y0 + (y1 - y0) * k / bays, yb = y0 + (y1 - y0) * (k + 1) / bays, flip = k % 2 ? -1 : 1;
        member(c(-1, -1, ya), c(1 * flip, -1, yb), 0.05); member(c(1, 1, ya), c(-1 * flip, 1, yb), 0.05);
        member(c(-1, -1 * flip, ya), c(-1, 1 * flip, yb), 0.05); member(c(1, 1 * flip, ya), c(1, -1 * flip, yb), 0.05);
      }
    };
    /** A Warren truss between two points at height y: two chords 1.1 m apart and the web's diagonals every 1.6 m. */
    const truss = (a: THREE.Vector3, b: THREE.Vector3, depth = 1.1) => {
      const top = (p: THREE.Vector3) => p.clone().setY(p.y + depth);
      member(a, b, 0.14); member(top(a), top(b), 0.14);
      const len = a.distanceTo(b), n = Math.max(2, Math.round(len / 1.6));
      for (let k = 0; k < n; k++) {
        const p = a.clone().lerp(b, k / n), q = a.clone().lerp(b, (k + 1) / n);
        member(k % 2 ? top(p) : p, k % 2 ? q : top(q), 0.06);
      }
    };
    for (const ds of [-9, 9]) {
      for (const t of [t0, t1]) {
        column(ds, t, walkY, walkY + H);
        push(metal, placedBox(1.4, 0.7, 2.2, at(ds, t, walkY), v), GANTRY); // the wheel truck on its rail
      }
      truss(at(ds, t0, walkY + H), at(ds, t1, walkY + H));
    }
    for (const t of [t0, t1]) truss(at(-9, t, walkY + H), at(9, t, walkY + H), 0.9);
    // the rails along the walkway under the trucks
    for (const t of [t0, t1]) push(metal, placedBox(24, 0.16, 0.2, at(0, t, walkY), u), STEEL);
    // the trolley: its machinery house on the beams, the hoist ropes and the hook block
    const tm = (t0 + t1) / 2;
    push(metal, placedBox(3.6, 2.4, 3.0, at(-2, tm, walkY + H + 1.1), v), GANTRY);
    push(metal, placedBox(3.9, 0.25, 3.3, at(-2, tm, walkY + H + 3.5), v), [0.33, 0.39, 0.35]);
    for (const dt of [-0.4, 0.4]) push(metal, pipe(at(-2, tm + dt, walkY + H), at(-2, tm + dt, walkY + 4.6), 0.03, 4), STEEL);
    push(metal, placedBox(1.1, 1.4, 0.7, at(-2, tm, walkY + 3.2), v), DARK);
  }
  // the road's parapets and lamp standards over the dam: upstream from abutment to abutment, downstream over the pocket
  // (the upstream parapet runs past the abutments over the corners the road's banks grade, to the rim's kerbs)
  const chordS = site.halfChordM + 8;
  const parapet = (t: number, s0: number, s1: number) => {
    const len = s1 - s0, mid = (s0 + s1) / 2;
    pushConcrete(placedBox(len, PARAPET_H, PARAPET_T, at(mid, t, ground.getHeightAt(at(mid, t).x, at(mid, t).z) - 0.1), u));
  };
  parapet(site.roadHalfM + PARAPET_T / 2, -chordS, chordS);
  const pocketS0 = site.pocketFromM, pocketS1 = site.pocketToM;
  // (round 7: the downstream parapet over the tailwater's brow, a few metres past its walls)
  const overS0 = pocketS0 - (site.naturalTailwater ? 3 : 0), overS1 = pocketS1 + (site.naturalTailwater ? 3 : 0);
  parapet(-(site.roadHalfM + PARAPET_T / 2), overS0, overS1);
  // the lamp standards (round 7: "stick lamp posts"): a concrete plinth on the parapet's line, a tapered steel pole, its
  // mast arm out over the carriageway and the luminaire's head
  for (let s = -chordS + 6; s <= chordS - 6; s += 12) {
    const base = at(s, site.roadHalfM + PARAPET_T / 2, walkY + PARAPET_H);
    pushConcrete(placedBox(0.62, 0.5, 0.62, base.clone().setY(walkY + PARAPET_H - 0.05), u));
    const pole = new THREE.CylinderGeometry(0.07, 0.13, 7.2, 8, 1, false);
    pole.translate(base.x, base.y + 0.45 + 3.6, base.z);
    push(metal, pole, STEEL);
    const top = base.clone().setY(base.y + 0.45 + 7.2), tip = top.clone().addScaledVector(v, -2.2).setY(top.y + 0.35);
    push(metal, pipe(top.clone().setY(top.y - 0.3), tip, 0.05, 6), STEEL);
    push(metal, placedBox(0.95, 0.22, 0.42, tip.clone().addScaledVector(v, -0.35).setY(tip.y - 0.18), v), [0.34, 0.35, 0.36]);
    push(buckets.dark, placedBox(0.7, 0.03, 0.3, tip.clone().addScaledVector(v, -0.35).setY(tip.y - 0.2), v), DARK);
  }
  // the downstream face: battered from the road's edge into the pocket, over the pocket's length
  const faceTop = site.pocketWallM, rise = crestY - site.tailwaterBedY;
  const sideS = (s: number) => Math.max(pocketS0, Math.min(pocketS1, s));
  const M = 16, ss = Array.from({ length: M + 1 }, (_, j) => sideS(pocketS0 + (pocketS1 - pocketS0) * (j / M)));
  const outAt = (y: number) => faceTop + 0.42 * (crestY - y);
  const dRows: THREE.Vector3[][] = [];
  for (let r = 0; r <= 5; r++) {
    const y = crestY - 0.2 - (rise + 1.8) * (r / 5);
    dRows.push(ss.map((s) => at(s, -outAt(y), y)));
  }
  const faceNormal = downstream.clone().add(upVec.clone().multiplyScalar(0.4)).normalize();
  pushConcrete(surface(dRows, faceNormal));
  // (round 7) the face's lifts and joints and the runoff's streaks down it from the parapet's scuppers
  const dBand = (s0: number, s1: number, yTop: number, yBottom: number, proud: number, rgb: readonly [number, number, number]) => {
    const row = (y: number) => [s0, (s0 + s1) / 2, s1].map((s) => at(s, -(outAt(y) + proud), y));
    pushConcrete(surface([row(yTop), row(yBottom)], faceNormal), rgb);
  };
  for (let y = crestY - 1.2; y > site.tailwaterBedY + 1; y -= LIFT_M) dBand(pocketS0, pocketS1, y + 0.06, y - 0.06, 0.035, LIFT_TINT);
  for (let s = pocketS0 + JOINT_M / 2; s < pocketS1 - 2; s += JOINT_M) dBand(s - 0.08, s + 0.08, crestY - 0.25, site.tailwaterBedY + 0.5, 0.04, JOINT_TINT);
  for (let k = 0, s = pocketS0 + 2.5; s < pocketS1 - 1; s += 4.5, k++) {
    const len = 4 + 9 * hash01(k, 1), w = 0.35 + 0.4 * hash01(k, 2);
    dBand(s - w / 2, s + w / 2, crestY - 0.25, crestY - 0.25 - len, 0.02, STREAK_TINT);
  }
  // the powerhouse along the toe, in the tailwater: a hall of poured concrete between pilasters, tall slot windows, a
  // flat roof with its transformer deck, the penstocks dropping into its back from the face
  {
    const s0 = pocketS0 + 4, s1 = pocketS1 - 4, len = s1 - s0, mid = (s0 + s1) / 2;
    const wallT = faceTop + 0.42 * (crestY - (site.tailwaterBedY + 14)) + 0.5, depthM = 11;
    const hallBase = at(mid, -(wallT + depthM / 2), site.tailwaterBedY - 1.5);
    pushConcrete(placedBox(len, 15.5, depthM, hallBase, u));
    pushConcrete(placedBox(len + 0.8, 0.6, depthM + 0.8, hallBase.clone().setY(site.tailwaterBedY + 14), u), DECK_TINT);
    const front = -(wallT + depthM) - 0.1;
    for (let s = s0 + 3; s <= s1 - 3; s += 4.5) {
      push(buckets.dark, placedBox(1.1, 7.5, 0.25, at(s, front, site.tailwaterBedY + 4.5), u), DARK);
      pushConcrete(placedBox(0.9, 14.6, 0.6, at(s + 2.25, front - 0.2, site.tailwaterBedY - 0.5), u), [0.9, 0.88, 0.84]);
    }
    // the tailrace arches at the waterline
    for (let s = s0 + 5; s <= s1 - 5; s += 7) push(buckets.dark, placedBox(3.6, 1.9, 0.3, at(s, front - 0.05, site.tailwaterBedY - 0.4), u), DARK);
    // the transformer deck on the roof: grey tanks with their porcelain bushings (ribbed stacks, not chimneys)
    for (let s = s0 + 4; s <= s1 - 4; s += 6) {
      const p = at(s, -(wallT + depthM * 0.45), site.tailwaterBedY + 14.6);
      push(metal, placedBox(2.6, 2.4, 2.0, p, u), STEEL);
      for (const ds of [-0.7, 0, 0.7]) {
        for (let k = 0; k < 4; k++) push(metal, pipe(at(s + ds, -(wallT + depthM * 0.45), p.y + 2.4 + k * 0.32), at(s + ds, -(wallT + depthM * 0.45), p.y + 2.4 + k * 0.32 + 0.22), 0.16 - 0.02 * (k % 2), 8), [0.42, 0.24, 0.16]);
      }
    }
    // the penstocks from the face down into the hall's back
    for (let s = s0 + 4; s <= s1 - 4; s += (len - 8) / 7) {
      const top = at(s, -(faceTop + 0.42 * 6 - 0.6), crestY - 6), foot = at(s, -(wallT + 0.3), site.tailwaterBedY + 10);
      push(metal, pipe(top, foot, 1.6, 10), [0.47, 0.52, 0.50]);
    }
  }
  // the river outlet: a tunnel portal at the water, where the canyon runs on through the rock (round 7: in the tailwater
  // nose's far wall, a concrete headwall round its dark mouth)
  if (site.outlet) {
    const yaw = site.outlet.yawDeg * Math.PI / 180, face = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
    const along = new THREE.Vector3(face.z, 0, -face.x), foot = new THREE.Vector3(site.outlet.x, site.tailwaterBedY - 0.6, site.outlet.z);
    pushConcrete(placedBox(9.5, 9.5, 1.6, foot.clone().addScaledVector(face, -0.4), along));
    pushConcrete(placedBox(10.5, 0.9, 2.0, foot.clone().addScaledVector(face, -0.2).setY(foot.y + 9.5), along), DECK_TINT);
    push(buckets.dark, placedBox(5.4, 6.2, 0.3, foot.clone().addScaledVector(face, 0.5), along), DARK);
  } else {
    const p = at(pocketS0 + 1.2, -(site.pocketWallM + site.pocketHalfM), site.tailwaterBedY - 0.5);
    push(buckets.dark, placedBox(0.4, 7.5, 9, p, u), DARK);
    pushConcrete(placedBox(0.6, 1.2, 11, p.clone().setY(site.tailwaterBedY + 7), u));
  }
  // the kerbs and their rails: the rims' guards where the road meets the reservoir's corners, and (round 4's pocket, not
  // round 7's rock tailwater) the ring round the pocket's rim
  const kerbRuns: [THREE.Vector3, THREE.Vector3][] = [];
  {
    if (!site.naturalTailwater) {
      const far = -(site.pocketWallM + 2 * site.pocketHalfM + 1.5), near = -(site.roadHalfM + PARAPET_T);
      const a0 = pocketS0 - 3, a1 = pocketS1 + 3;
      kerbRuns.push([at(a0, near), at(a0, far)], [at(a0, far), at(a1, far)], [at(a1, far), at(a1, near)]);
    }
    for (const [x0, z0, x1, z1] of site.rimGuards ?? []) kerbRuns.push([new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, 0, z1)]);
    for (const [p, q] of kerbRuns) {
      const len = p.distanceTo(q), dir = q.clone().sub(p).normalize(), mid = p.clone().add(q).multiplyScalar(0.5);
      const y = Math.min(ground.getHeightAt(p.x, p.z), ground.getHeightAt(q.x, q.z), ground.getHeightAt(mid.x, mid.z));
      pushConcrete(placedBox(len, KERB_H + 0.3, KERB_T, mid.clone().setY(y - 0.3), dir));
      for (const lift of [KERB_H + 0.25, KERB_H + 0.65]) {
        push(metal, pipe(p.clone().setY(y + lift), q.clone().setY(y + lift), 0.05, 5), STEEL);
      }
    }
  }
  // collision: the road's parapets and the kerbs as thin boxes
  const parts: SimpleCollisionShape[] = [];
  const wall = (p: THREE.Vector3, q: THREE.Vector3, t: number, y0: number, y1: number) => {
    const mid = p.clone().add(q).multiplyScalar(0.5), len = p.distanceTo(q);
    parts.push({ kind: 'obb', cx: mid.x, cz: mid.z, hw: t / 2, hl: len / 2, yaw: Math.atan2(q.x - p.x, q.z - p.z), y0, y1 });
  };
  const pY = crestY - 0.5, pTop = crestY + PARAPET_H;
  wall(at(-chordS, site.roadHalfM + PARAPET_T / 2), at(chordS, site.roadHalfM + PARAPET_T / 2), PARAPET_T, pY, pTop);
  wall(at(overS0, -(site.roadHalfM + PARAPET_T / 2)), at(overS1, -(site.roadHalfM + PARAPET_T / 2)), PARAPET_T, pY, pTop);
  for (const [p, q] of kerbRuns) {
    const y = Math.min(ground.getHeightAt(p.x, p.z), ground.getHeightAt(q.x, q.z));
    wall(p, q, KERB_T, y - 0.5, y + KERB_H + 0.65);
  }
  let low = Infinity, high = -Infinity;
  for (const part of parts) { if ('y0' in part && part.y0 !== undefined) { low = Math.min(low, part.y0); high = Math.max(high, part.y1 ?? part.y0); } }
  const record = setCompoundShape({ min: [0, low, 0], max: [0, high, 0], kind: 'dam-parapet' }, parts);
  obstacles?.push(record);
  colliders?.push(cloneCollisionRecord(record));
  return {
    chordM: Math.round(2 * R * Math.sin(phiMax)), sagM: Math.round(sag * 10) / 10, crestY: Math.round(crestY * 100) / 100,
    upstreamFaceM: Math.round((crestTop - site.reservoirBedY) * 10) / 10, downstreamFaceM: Math.round(rise * 10) / 10,
    triangles: Math.round(triangles), towers, parapetM: Math.round(2 * chordS + (overS1 - overS0)),
    kerbM: Math.round(kerbRuns.reduce((n, [p, q]) => n + p.distanceTo(q), 0)), lifts,
  };
}
