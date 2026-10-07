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
// pocket's far wall. Parapets line the road over the dam and a kerb with its rail rings the pocket's rim; those walls
// carry collision, so a hull keeps to the road and the rim. Everything else is soft dressing in the shared buckets
// (the kit's poured concrete, the dark of an opening, the structural steel): no draw of its own.
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
  /** The tailwater pocket: its extent along the road from the crest's middle (m), its half-width and its near wall's
   * distance downstream of the road's centre line (m). */
  pocketFromM: number;
  pocketToM: number;
  pocketHalfM: number;
  pocketWallM: number;
  /** Kerbs along the reservoir's rims from the dam's abutments, [x0, z0, x1, z1] (m): the road's banks grade the arm's
   * corners there into slopes a hull could take down to the water. */
  rimGuards?: readonly (readonly [number, number, number, number])[];
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
}

const WHITE: readonly [number, number, number] = [1, 1, 1];
const STEEL: readonly [number, number, number] = [0.55, 0.58, 0.58];
const GANTRY: readonly [number, number, number] = [0.78, 0.62, 0.22];
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

/** Stand the dam, its powerhouse, intakes and walls; push its collision into both sinks. */
export function dressReservoirDam(site: ReservoirDamSite, ground: DamGround, buckets: DamBuckets,
  obstacles?: CollisionRecord[], colliders?: CollisionRecord[]): ReservoirDamReceipt {
  const concrete = buckets.plaster2 ?? buckets.stone ?? buckets.plaster!;
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
  const upVec = new THREE.Vector3(0, 1, 0), upstream = v.clone(), downstream = v.clone().negate();
  let triangles = 0;
  // (a bucket merges its parts whole, so each part takes the attributes the bucket's parts carry: a colour where they
  // carry one, the structural steel's paint, and none in the dark and the concrete)
  const push = (list: THREE.BufferGeometry[], g: THREE.BufferGeometry, rgb: readonly [number, number, number]) => {
    if (list[0]?.getAttribute('color')) paint(g, rgb);
    triangles += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    list.push(g);
  };
  // the upstream face (vertical, the arch), its lifts banded by the face's rows
  const faceRows: THREE.Vector3[][] = [];
  const LIFTS = 6;
  for (let r = 0; r <= LIFTS; r++) faceRows.push(phis.map((phi) => arch(phi, 0, crestTop + (bedUp - crestTop) * (r / LIFTS))));
  push(concrete, surface(faceRows, upstream), WHITE);
  // the walkway over the arch: from the arch's crest back to the road's upstream parapet, its parapet on the arch
  const roadEdge = site.roadHalfM + PARAPET_T;
  push(concrete, surface([phis.map((phi) => arch(phi, 0, walkY)), phis.map((phi) => {
    const p = arch(phi, 0, walkY), s = (p.clone().sub(O)).dot(u);
    return at(s, roadEdge, walkY);
  })], upVec), WHITE);
  const archParapet = [phis.map((phi) => arch(phi, 0, crestTop)), phis.map((phi) => arch(phi, PARAPET_T, crestTop)),
    phis.map((phi) => arch(phi, PARAPET_T, walkY))];
  push(concrete, surface(archParapet.slice(0, 2), upVec), WHITE);
  push(concrete, surface(archParapet.slice(1), downstream), WHITE);
  // the intake towers on the face's middle: semicircular trash-rack structures from the bed to the walkway, each
  // carrying a gate-hoist house; the racks' dark slots round their noses
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
    push(concrete, surface([ring(walkY + 0.2), ring(bedUp)], out), WHITE);
    for (let k = 1; k < 8; k += 2) {
      const a = -Math.PI / 2 + Math.PI * ((k + 0.5) / 8);
      const p = cx.clone().addScaledVector(tangent, Math.sin(a) * (radius + 0.05)).addScaledVector(out, Math.cos(a) * (radius + 0.05));
      const slot = placedBox(0.9, (walkY - 3) - (site.reservoirBedY + 1), 0.25, p.setY(site.reservoirBedY + 1), tangent.clone().multiplyScalar(Math.cos(a)).addScaledVector(out, -Math.sin(a)).normalize());
      push(buckets.dark, slot, DARK);
    }
    const house = placedBox(7.4, 4.2, 5.6, cx.clone().addScaledVector(out, -1.2).setY(walkY), tangent);
    push(concrete, house, WHITE);
    push(concrete, placedBox(8.0, 0.35, 6.2, cx.clone().addScaledVector(out, -1.2).setY(walkY + 4.2), tangent), WHITE);
    push(buckets.dark, placedBox(2.0, 2.4, 0.2, cx.clone().addScaledVector(out, 1.62).setY(walkY), tangent), DARK);
    towers++;
  }
  // the gantry crane over the intakes: two portal legs on rails along the walkway and its girder
  {
    const sMid = 0, t0 = roadEdge + 1.2, t1 = site.abutmentM + sag - 1.5;
    for (const ds of [-9, 9]) {
      for (const t of [t0, t1]) push(metal, pipe(at(sMid + ds, t, walkY), at(sMid + ds, t, walkY + 11), 0.35, 6), GANTRY);
      push(metal, placedBox(0.6, 0.8, t1 - t0 + 0.8, at(sMid + ds, (t0 + t1) / 2, walkY + 11), u), GANTRY);
    }
    push(metal, placedBox(19, 1.1, 1.4, at(sMid, (t0 + t1) / 2, walkY + 11.8), u), GANTRY);
    push(metal, placedBox(4.2, 2.6, 3.2, at(sMid, (t0 + t1) / 2, walkY + 9.2), u), GANTRY);
  }
  // the road's parapets and lamp standards over the dam: upstream from abutment to abutment, downstream over the pocket
  // (the upstream parapet runs past the abutments over the corners the road's banks grade, to the rim's kerbs)
  const chordS = site.halfChordM + 8;
  const parapet = (t: number, s0: number, s1: number) => {
    const len = s1 - s0, mid = (s0 + s1) / 2;
    push(concrete, placedBox(len, PARAPET_H, PARAPET_T, at(mid, t, ground.getHeightAt(at(mid, t).x, at(mid, t).z) - 0.1), u), WHITE);
  };
  parapet(site.roadHalfM + PARAPET_T / 2, -chordS, chordS);
  const pocketS0 = site.pocketFromM, pocketS1 = site.pocketToM;
  parapet(-(site.roadHalfM + PARAPET_T / 2), pocketS0, pocketS1);
  for (let s = -chordS + 6; s <= chordS - 6; s += 12) {
    const base = at(s, site.roadHalfM + PARAPET_T / 2, walkY + PARAPET_H);
    push(metal, pipe(base, base.clone().setY(base.y + 6.5), 0.09, 6), STEEL);
    push(metal, placedBox(1.4, 0.18, 0.35, base.clone().addScaledVector(v, -0.6).setY(base.y + 6.4), u), STEEL);
  }
  // the downstream face: battered from the road's edge into the pocket, over the pocket's length
  const faceTop = site.pocketWallM, rise = crestY - site.tailwaterBedY;
  const sideS = (s: number) => Math.max(pocketS0, Math.min(pocketS1, s));
  const M = 16, ss = Array.from({ length: M + 1 }, (_, j) => sideS(pocketS0 + (pocketS1 - pocketS0) * (j / M)));
  const dRows: THREE.Vector3[][] = [];
  for (let r = 0; r <= 5; r++) {
    const y = crestY - 0.2 - (rise + 1.8) * (r / 5), out = faceTop + 0.42 * (crestY - y);
    dRows.push(ss.map((s) => at(s, -out, y)));
  }
  push(concrete, surface(dRows, downstream.clone().add(upVec.clone().multiplyScalar(0.4)).normalize()), WHITE);
  // the powerhouse along the toe, in the tailwater: a hall of poured concrete between pilasters, tall slot windows, a
  // flat roof with its transformer deck, the penstocks dropping into its back from the face
  {
    const s0 = pocketS0 + 4, s1 = pocketS1 - 4, len = s1 - s0, mid = (s0 + s1) / 2;
    const wallT = faceTop + 0.42 * (crestY - (site.tailwaterBedY + 14)) + 0.5, depthM = 11;
    const hallBase = at(mid, -(wallT + depthM / 2), site.tailwaterBedY - 1.5);
    push(concrete, placedBox(len, 15.5, depthM, hallBase, u), WHITE);
    push(concrete, placedBox(len + 0.8, 0.6, depthM + 0.8, hallBase.clone().setY(site.tailwaterBedY + 14), u), WHITE);
    const front = -(wallT + depthM) - 0.1;
    for (let s = s0 + 3; s <= s1 - 3; s += 4.5) {
      push(buckets.dark, placedBox(1.1, 7.5, 0.25, at(s, front, site.tailwaterBedY + 4.5), u), DARK);
      push(concrete, placedBox(0.9, 14.6, 0.6, at(s + 2.25, front - 0.2, site.tailwaterBedY - 0.5), u), WHITE);
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
  // the river outlet: a tunnel portal at the water in the pocket's far end (the canyon runs on through the rock)
  {
    const p = at(pocketS0 + 1.2, -(site.pocketWallM + site.pocketHalfM), site.tailwaterBedY - 0.5);
    push(buckets.dark, placedBox(0.4, 7.5, 9, p, u), DARK);
    push(concrete, placedBox(0.6, 1.2, 11, p.clone().setY(site.tailwaterBedY + 7), u), WHITE);
  }
  // the kerb and its rail round the pocket's rim (the road's parapet guards the side under the road)
  const kerbRuns: [THREE.Vector3, THREE.Vector3][] = [];
  {
    const far = -(site.pocketWallM + 2 * site.pocketHalfM + 1.5), near = -(site.roadHalfM + PARAPET_T);
    const a0 = pocketS0 - 3, a1 = pocketS1 + 3;
    kerbRuns.push([at(a0, near), at(a0, far)], [at(a0, far), at(a1, far)], [at(a1, far), at(a1, near)]);
    for (const [x0, z0, x1, z1] of site.rimGuards ?? []) kerbRuns.push([new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, 0, z1)]);
    for (const [p, q] of kerbRuns) {
      const len = p.distanceTo(q), dir = q.clone().sub(p).normalize(), mid = p.clone().add(q).multiplyScalar(0.5);
      const y = Math.min(ground.getHeightAt(p.x, p.z), ground.getHeightAt(q.x, q.z), ground.getHeightAt(mid.x, mid.z));
      push(concrete, placedBox(len, KERB_H + 0.3, KERB_T, mid.clone().setY(y - 0.3), dir), WHITE);
      for (const lift of [KERB_H + 0.25, KERB_H + 0.65]) {
        push(metal, pipe(p.clone().setY(y + lift), q.clone().setY(y + lift), 0.05, 5), STEEL);
      }
    }
  }
  // collision: the road's parapets and the kerb as thin boxes
  const parts: SimpleCollisionShape[] = [];
  const wall = (p: THREE.Vector3, q: THREE.Vector3, t: number, y0: number, y1: number) => {
    const mid = p.clone().add(q).multiplyScalar(0.5), len = p.distanceTo(q);
    parts.push({ kind: 'obb', cx: mid.x, cz: mid.z, hw: t / 2, hl: len / 2, yaw: Math.atan2(q.x - p.x, q.z - p.z), y0, y1 });
  };
  const pY = crestY - 0.5, pTop = crestY + PARAPET_H;
  wall(at(-chordS, site.roadHalfM + PARAPET_T / 2), at(chordS, site.roadHalfM + PARAPET_T / 2), PARAPET_T, pY, pTop);
  wall(at(pocketS0, -(site.roadHalfM + PARAPET_T / 2)), at(pocketS1, -(site.roadHalfM + PARAPET_T / 2)), PARAPET_T, pY, pTop);
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
    triangles: Math.round(triangles), towers, parapetM: Math.round(2 * chordS + (pocketS1 - pocketS0)),
    kerbM: Math.round(kerbRuns.reduce((n, [p, q]) => n + p.distanceTo(q), 0)),
  };
}
