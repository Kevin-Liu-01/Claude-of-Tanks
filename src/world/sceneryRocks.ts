// src/world/sceneryRocks.ts — the scenery lane's rock formations (2026-10-03): the landmark rock a map's geology
// makes, built from the ground up instead of scattered boulders. Each form follows the process that made it:
//
//   tor      granite: cuboidal blocks split by the sheeting joints (every thickness, thin flags over massive sheets)
//            and the vertical joint sets, their arrises rounded, stacked in two to four columns parted by open vertical
//            joints, the sheet rock breaking the turf round them, the clitter strewn down the slope (Dartmoor, the
//            Breton chaos);
//   outcrop  sandstone or limestone beds: hard beds standing proud over recessed soft ones, each higher bed stepping
//            back from a scarp that faces downhill, the beds split into blocks by the vertical joints, fallen blocks
//            at the foot (Buntsandstein ledges, the Dalmatian scars, the Franconian castle rocks);
//   pavement limestone clints split by narrow grikes along the master joints, flush with the turf, a low scar of
//            jointed blocks upslope (the Dalmatian karst, the Burren);
//   crag     slate or greywacke plates dipping steeply in two or three ranks along the strike, their tops broken by
//            the cleavage, scree below (the Eifel's Rur valley);
//   scree    an angular fan, its fines at the apex and its big blocks rolled farthest;
//   hoodoo   a sandstone pedestal waisted by the sand blast under a broad hard cap (the mushroom rocks of Wadi Rum);
//   menhir, cairn, calvary — rock that people shaped: a standing stone, a clearance cairn, a granite wayside calvary.
//
// Everything is welded world-space geometry in one vertex-coloured family that the props rock material draws (its
// triplanar detail tile, the grime hook and the per-map moss / dust / soil laws of rockDressing.ts — the boulders' own
// look, so a tor and the stones round it are one rock). Per vertex: position, normal (split at the cleavage angle, so
// joint faces shade crisp and weathered shoulders stay round), colour (the geology's tone, its beds, its streaks, its
// lichen), aRockGround (the ground under the vertex, for the soil skirt) and a world-planar uv (the roughness and
// occlusion tiles). A standing form publishes the convex hull of what stands above a hull's step as its collision
// mass; pavement and scree lie under that step and carry none. Deterministic: a formation draws only the stream it is
// handed; no wall clock, no Math.random. Renderer-free apart from three's geometry types.
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { SimplexNoise } from '../engine/simplexFast.ts';

import type { RockForm, RockGeology } from './sceneryPlan.ts';
import { formationCollisionProfile, rockGroundAt, type FormationCollisionProfile } from './rockCollision.ts';
import { convexHull2 } from './collision.ts';

type Rng = () => number;

interface RockGround {
  getHeightAt(x: number, z: number): number;
  /** The baked 1 m height grid, when the field has one: per-vertex ground reads use it. */
  getHeightAtFast?(x: number, z: number): number;
  /** The rendered triangles a hull's tracks meet (terrainContactSurface.ts), when the field has them. */
  getContactHeightAt?(x: number, z: number): number;
}

/** One authored rock formation. */
export interface RockFormationSpec {
  form: RockForm;
  geology: RockGeology;
  x: number;
  z: number;
  /** Footprint radius of the standing mass (pavement: of the slab field). */
  radius: number;
  /** Height of the standing mass above its lowest ground. */
  height: number;
  /** Strike of the joints / beds / plates, degrees from +X toward +Z. */
  yawDeg?: number;
  /** Loose stone shed round the foot (0 none, 1 the form's default). */
  shed?: number;
  /** Linear-ish sRGB tone override [h, s, l] for the geology's base colour (a map's rock tone). */
  tone?: readonly [number, number, number];
}

/** A standing rock mass the hulls and shells meet: its standing outline (the convex hull of its contact outlines, world
 * [x, z, ...]) and vertical range, and (the hitbox lane, 2026-10-07) its colliders from the standing stone itself
 * (rockCollision.ts formationCollisionProfile). */
interface RockMass {
  points: number[];
  y0: number;
  y1: number;
  profile: FormationCollisionProfile;
}

interface RockFormationBuild {
  geometry: THREE.BufferGeometry | null;
  masses: RockMass[];
  /** Pieces (blocks, beds, plates, slabs, stones) the formation laid. */
  pieces: number;
  triangles: number;
}

interface RockBuildOptions {
  /** Phones: fewer segments and fewer loose stones. */
  mobile?: boolean;
}

// ---------------------------------------------------------------------------------------------- palette

/** The geologies' base tones (sRGB HSL) and their variation laws. */
const GEOLOGY_TONE: Readonly<Record<RockGeology, readonly [number, number, number]>> = Object.freeze({
  granite: [0.09, 0.07, 0.50],   // grey with a warm feldspar cast
  sandstone: [0.035, 0.42, 0.42], // Buntsandstein / desert red
  limestone: [0.11, 0.08, 0.66], // pale grey-cream
  slate: [0.58, 0.07, 0.27],     // blue-grey
});

const _c = new THREE.Color();
function hsl(h: number, s: number, l: number): [number, number, number] {
  _c.setHSL(((h % 1) + 1) % 1, clamp(s, 0, 1), clamp(l, 0, 1), THREE.SRGBColorSpace);
  return [_c.r, _c.g, _c.b];
}
function clamp(x: number, a: number, b: number): number { return x < a ? a : x > b ? b : x; }
function smooth(a: number, b: number, x: number): number { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

// ---------------------------------------------------------------------------------------------- primitives

/**
 * A joint-bounded block: a subdivided cube rounded to `rounding` (0 = sharp, 1 = an ellipsoid), its faces pushed in
 * by a weathering field and cut by a few fracture planes. Unit space ±1 before the half extents scale it. Welded
 * (indexed) so the noise and the cuts keep it closed.
 */
function roundedBlock(
  hx: number, hy: number, hz: number, rounding: number, segments: number, noise: SimplexNoise, rng: Rng,
  { weather = 0.08, cuts = 2, cutDepth = 0.82, seedOffset = 0 } = {},
): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(2, 2, 2, segments, segments, segments);
  box.deleteAttribute('uv');
  box.deleteAttribute('normal');
  const g = mergeVertices(box);
  box.dispose();
  const p = g.attributes.position;
  const r = clamp(rounding, 0.02, 1);
  const inner = 1 - r;
  const planes: Array<[number, number, number, number]> = [];
  for (let k = 0; k < cuts * 4 && planes.length < cuts; k++) {
    const a = rng() * Math.PI * 2, e = (rng() - 0.3) * Math.PI * 0.55;
    const n: [number, number, number] = [Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)];
    if (n[1] < -0.2) continue; // never cut the seated bottom
    planes.push([n[0], n[1], n[2], cutDepth + rng() * (1 - cutDepth) * 0.7]);
  }
  const s = seedOffset * 17.31;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // round: the point on the inner box nearest the surface point, pushed out by r
    const ix = clamp(x, -inner, inner), iy = clamp(y, -inner, inner), iz = clamp(z, -inner, inner);
    let dx = x - ix, dy = y - iy, dz = z - iz;
    const dl = Math.hypot(dx, dy, dz);
    if (dl > 1e-6) { dx /= dl; dy /= dl; dz /= dl; x = ix + dx * r; y = iy + dy * r; z = iz + dz * r; }
    for (const [nx, ny, nz, d] of planes) {
      const proj = x * nx + y * ny + z * nz;
      if (proj > d) { const t = proj - d; x -= t * nx; y -= t * ny; z -= t * nz; }
    }
    // weathering only ever recedes: the block stays inside its hull
    const w = noise.noise3d(x * 1.7 + s, y * 1.7 - s, z * 1.7 + 3.1) * 0.5 + 0.5;
    const f = noise.noise3d(x * 4.3 - s, y * 4.3 + 7.7, z * 4.3 + s) * 0.5 + 0.5;
    const k = 1 - weather * (w * 0.75 + f * 0.25);
    p.setXYZ(i, x * k * hx, y * k * hy, z * k * hz);
  }
  return g;
}

/**
 * A bed (or one joint block of a bed): an outline extruded through its thickness with eroded edges. The outline is a
 * superellipse (squareness 2 an ellipse, 4-6 a rounded block) broken by a noise ring; the top and bottom rings are inset
 * by the bevel, the middle ring can stand proud (an overhanging hard bed). Welded. The bed's base sits at y = 0.
 */
function beddedSlab(
  rx: number, rz: number, thickness: number, bevel: number, sides: number, noise: SimplexNoise, seed: number,
  { roughness = 0.22, overhang = 0, scarp = 0, scarpAngle = 0, squareness = 2, topWobble = 0.12, shoulder = 0 } = {},
): THREE.BufferGeometry {
  const ring = (frac: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      // the superellipse radius along this direction (unit extents), then the noise ring
      const se = Math.pow(Math.pow(Math.abs(c), squareness) + Math.pow(Math.abs(s), squareness), -1 / squareness);
      const n = noise.noise(c * 1.3 + seed, s * 1.3 - seed * 0.7) * 0.6 + noise.noise(c * 3.1 - seed, s * 3.1 + seed) * 0.4;
      // the scarp side is cut straight; the dip side tapers
      const facing = Math.cos(a - scarpAngle);
      const cut = scarp > 0 ? 1 - scarp * smooth(0.55, 1, facing) * 0.35 : 1;
      const rr = se * (1 + n * roughness) * cut;
      out.push(c * Math.max(0.05, rx * rr - frac), s * Math.max(0.05, rz * rr - frac));
    }
    return out;
  };
  const bottom = ring(bevel * 0.4);
  const mid = ring(-overhang * Math.min(rx, rz));
  // (b12, wave 72 on Redrock: "a layer cake" — a shoulder rounds a hard bed's top arris the weather wore: a ring at 0.85
  // of the thickness inset half the way, the top ring inset the more; 0 keeps the three rings every other form has)
  const shoulderRing = shoulder > 0 ? ring(bevel * (1 + shoulder) * 0.5) : null;
  const top = ring(bevel * (1 + shoulder));
  const hMid = thickness * 0.55;
  const positions: number[] = [];
  const index: number[] = [];
  const push = (x: number, y: number, z: number) => { positions.push(x, y, z); return positions.length / 3 - 1; };
  for (let i = 0; i < sides; i++) push(bottom[i * 2], 0, bottom[i * 2 + 1]);
  for (let i = 0; i < sides; i++) push(mid[i * 2], hMid, mid[i * 2 + 1]);
  if (shoulderRing) for (let i = 0; i < sides; i++) push(shoulderRing[i * 2], thickness * 0.85, shoulderRing[i * 2 + 1]);
  const topBase = positions.length / 3;
  for (let i = 0; i < sides; i++) {
    const wob = noise.noise(top[i * 2] * 0.6 + seed * 3, top[i * 2 + 1] * 0.6) * thickness * topWobble;
    push(top[i * 2], thickness + wob, top[i * 2 + 1]);
  }
  const cTop = push(0, thickness * (1 + topWobble * 0.15), 0);
  const cBot = push(0, 0, 0);
  const bands = shoulderRing ? 3 : 2;
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    // bottom -> mid -> (shoulder ->) top walls (counter-clockwise seen from outside)
    for (let band = 0; band < bands; band++) {
      const a0 = band * sides + i, a1 = band * sides + j;
      const c0 = a0 + sides, c1 = a1 + sides;
      index.push(a0, c1, a1, a0, c0, c1);
    }
    index.push(topBase + i, cTop, topBase + j);
    index.push(i, j, cBot);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  return g;
}

/** A small angular stone: a low icosahedron flattened and cut. */
function looseStone(size: number, flat: number, noise: SimplexNoise, rng: Rng, detail: number, round: number): THREE.BufferGeometry {
  const ico = new THREE.IcosahedronGeometry(1, detail);
  ico.deleteAttribute('uv');
  ico.deleteAttribute('normal');
  const g = mergeVertices(ico);
  ico.dispose();
  const p = g.attributes.position;
  const sx = size * (0.8 + rng() * 0.5), sz = size * (0.7 + rng() * 0.5), sy = size * flat;
  const o = rng() * 100;
  const planes: Array<[number, number, number, number]> = [];
  const cuts = round > 0.5 ? 1 : 3;
  for (let k = 0; k < cuts; k++) {
    const a = rng() * Math.PI * 2, e = (rng() - 0.2) * 1.2;
    planes.push([Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a), 0.55 + rng() * 0.3]);
  }
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    for (const [nx, ny, nz, d] of planes) {
      const proj = x * nx + y * ny + z * nz;
      if (proj > d) { const t = proj - d; x -= t * nx; y -= t * ny; z -= t * nz; }
    }
    const k = 1 - 0.12 * (noise.noise3d(x * 2 + o, y * 2, z * 2 - o) * 0.5 + 0.5);
    p.setXYZ(i, x * k * sx, y * k * sy, z * k * sz);
  }
  return g;
}

// ---------------------------------------------------------------------------------------------- assembly

interface Piece {
  geometry: THREE.BufferGeometry;
  /** The piece's bed / layer index (sandstone banding) or -1. */
  layer: number;
  /** The piece stands (contributes to a collision mass). */
  standing: boolean;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

function place(g: THREE.BufferGeometry, x: number, y: number, z: number, yaw: number, pitch = 0, roll = 0): THREE.BufferGeometry {
  _e.set(pitch, yaw, roll, 'YXZ');
  _q.setFromEuler(_e);
  _m.compose(_p.set(x, y, z), _q, _s);
  g.applyMatrix4(_m);
  return g;
}

function lowestGround(ground: RockGround, x: number, z: number, r: number): { min: number; max: number } {
  let min = ground.getHeightAt(x, z), max = min;
  for (let ring = 1; ring <= 2; ring++) {
    const rr = r * ring / 2;
    for (let i = 0; i < 8; i++) {
      const a = (i + ring * 0.5) * Math.PI / 4;
      const y = ground.getHeightAt(x + Math.cos(a) * rr, z + Math.sin(a) * rr);
      if (y < min) min = y;
      if (y > max) max = y;
    }
  }
  return { min, max };
}

/** Downhill direction (unit XZ) at a point, from central differences of the ground. */
function downhill(ground: RockGround, x: number, z: number, step: number): [number, number] {
  const gx = ground.getHeightAt(x + step, z) - ground.getHeightAt(x - step, z);
  const gz = ground.getHeightAt(x, z + step) - ground.getHeightAt(x, z - step);
  const l = Math.hypot(gx, gz);
  return l < 1e-4 ? [0, 0] : [-gx / l, -gz / l];
}

/**
 * The standing pieces' collision mass (the hitbox lane, 2026-10-07): the one projected hull from the ground to the top
 * filled a tor's open joints, a ledge's recesses and the air round a hoodoo's waist (40 % of Redrock's formation
 * colliders stood in empty air, 81 % of the worst tenth's). Now each block of the standing stone keeps its own outline,
 * and the movement footprint is the stone between a hull's track tops and its roof (rockCollision.ts
 * FORMATION_CONTACT_FLOOR_M). The loose pieces (fallen blocks, talus, scree) carry none: a phone builds fewer of them,
 * and every tier must lay the same colliders (the authority's shard is one).
 */
function massOf(pieces: Piece[], ground: RockGround, floor: number): RockMass | null {
  // (2026-10-08) the stone's rise over the ground a hull meets and the eye sees: the rendered triangles, which part from
  // the 1 m grid by metres at a cliff's foot (rockCollision.ts rockGroundAt)
  const profile = formationCollisionProfile(pieces.filter((piece) => piece.standing).map((piece) => piece.geometry), rockGroundAt(ground));
  if (!profile) return null;
  const corners: Array<[number, number]> = [];
  for (const outline of profile.contact) for (let i = 0; i < outline.length; i += 2) corners.push([outline[i], outline[i + 1]]);
  return { points: convexHull2(corners), y0: floor - 0.5, y1: profile.top, profile };
}

/**
 * Colour, ground and normals, then one non-indexed geometry: per-corner normals averaged over the faces that share the
 * welded vertex within the cleavage angle (joint faces crisp, weathered shoulders smooth). Every piece is welded
 * (indexed), so the corner's faces come from the index, not from a position hash.
 */
function finish(
  pieces: Piece[], geology: RockGeology, toneOverride: readonly [number, number, number] | undefined,
  ground: RockGround, noise: SimplexNoise, salt: number,
): THREE.BufferGeometry {
  const [bh, bs, bl] = toneOverride ?? GEOLOGY_TONE[geology];
  const cleavageCos = Math.cos(THREE.MathUtils.degToRad(geology === 'granite' ? 48 : 34));
  const groundAt = ground.getHeightAtFast ? (x: number, z: number) => ground.getHeightAtFast!(x, z) : (x: number, z: number) => ground.getHeightAt(x, z);
  let corners = 0;
  for (const piece of pieces) corners += piece.geometry.index ? piece.geometry.index.count : piece.geometry.attributes.position.count;
  const pos = new Float32Array(corners * 3), nor = new Float32Array(corners * 3), col = new Float32Array(corners * 3), gr = new Float32Array(corners);
  // a world-planar UV for the material's roughness / occlusion tiles (the albedo and normal tiles are sampled
  // triplanar by the rock hook, which needs none)
  const uvs = new Float32Array(corners * 2);
  let out = 0;
  for (const piece of pieces) {
    const g = piece.geometry;
    const p = g.attributes.position.array as Float32Array;
    const vertexCount = g.attributes.position.count;
    const idx = g.index ? g.index.array : null;
    const faceCount = (idx ? idx.length : vertexCount) / 3;
    const corner = (f: number, k: number) => (idx ? idx[f * 3 + k] : f * 3 + k);
    // face normals and, per welded vertex, the faces that meet there (CSR)
    const fn = new Float32Array(faceCount * 3);
    const degree = new Int32Array(vertexCount + 1);
    for (let f = 0; f < faceCount; f++) {
      const a = corner(f, 0), b = corner(f, 1), c = corner(f, 2);
      const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
      const ux = p[b * 3] - ax, uy = p[b * 3 + 1] - ay, uz = p[b * 3 + 2] - az;
      const vx = p[c * 3] - ax, vy = p[c * 3 + 1] - ay, vz = p[c * 3 + 2] - az;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      fn[f * 3] = nx / len; fn[f * 3 + 1] = ny / len; fn[f * 3 + 2] = nz / len;
      degree[a + 1]++; degree[b + 1]++; degree[c + 1]++;
    }
    for (let v = 0; v < vertexCount; v++) degree[v + 1] += degree[v];
    const fill = degree.slice(0, vertexCount);
    const faces = new Int32Array(faceCount * 3);
    for (let f = 0; f < faceCount; f++) for (let k = 0; k < 3; k++) { const v = corner(f, k); faces[fill[v]++] = f; }
    // per welded vertex: its ground and its colour (shared by every corner)
    const vGround = new Float32Array(vertexCount), vColor = new Float32Array(vertexCount * 3);
    for (let v = 0; v < vertexCount; v++) {
      const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2];
      let sx = 0, sy = 0, sz = 0;
      for (let i = degree[v]; i < degree[v + 1]; i++) { const f = faces[i]; sx += fn[f * 3]; sy += fn[f * 3 + 1]; sz += fn[f * 3 + 2]; }
      const nl = Math.hypot(sx, sy, sz) || 1;
      const ny = sy / nl;
      const gy = groundAt(x, z);
      vGround[v] = gy;
      // tone: the geology's base, mottled at the metre scale, paler on the weathered tops, darker in the joints
      const mott = noise.noise3d(x * 0.31 + salt, y * 0.31, z * 0.31 - salt);
      const fine = noise.noise3d(x * 1.9 - salt, y * 1.9 + 3, z * 1.9);
      const up = Math.max(0, ny);
      let h = bh, s = bs, l = bl * (0.86 + mott * 0.10 + fine * 0.05 + up * up * 0.12);
      if (geology === 'sandstone') {
        // the beds: alternate hard (paler, warmer) and soft (darker, redder) layers; cross-bedding wisps inside
        const bed = piece.layer >= 0 ? piece.layer : Math.floor((y - gy) / 0.9);
        const soft = bed % 2 === 1;
        h += soft ? -0.012 : 0.018 + (bed % 3 === 0 ? 0.02 : 0);
        s *= soft ? 1.08 : 0.82;
        l *= soft ? 0.84 : 1.06 + (bed % 3 === 0 ? 0.08 : 0);
        l *= 0.94 + 0.06 * Math.sin((y + fine * 0.6) * 9.5);
      } else if (geology === 'limestone') {
        // black biofilm runs down the vertical faces; the tops bleach
        const vertical = 1 - Math.abs(ny);
        const run = smooth(0.35, 0.8, noise.noise(x * 2.3 + z * 1.7 + salt, y * 0.22) * 0.5 + 0.5) * vertical;
        l *= 1 - run * 0.38;
        l *= 1 + up * 0.08;
      } else if (geology === 'slate') {
        // iron in the joints: rust stains under the plate edges
        const rust = smooth(0.55, 0.85, noise.noise3d(x * 0.9 - salt, y * 1.4, z * 0.9 + salt) * 0.5 + 0.5) * (1 - up);
        h = h + (0.07 - h) * rust * 0.9; s = s + (0.45 - s) * rust * 0.8; l *= 1 + rust * 0.25;
      } else {
        // granite: lichen rosettes on the weather side and the tops (pale grey-green and a little orange)
        const lich = smooth(0.62, 0.78, noise.noise3d(x * 2.6 + salt, y * 2.6, z * 2.6 - salt) * 0.5 + 0.5) * (0.35 + up * 0.65);
        const orange = smooth(0.7, 0.85, noise.noise3d(x * 3.7 - salt, y * 3.7 + 9, z * 3.7) * 0.5 + 0.5) * up;
        h = h + (0.17 - h) * lich * 0.7; s = s + (0.16 - s) * lich * 0.6; l *= 1 + lich * 0.16;
        h = h + (0.08 - h) * orange * 0.8; s = s + (0.55 - s) * orange * 0.7;
      }
      // contact: the stone darkens where it meets the soil
      l *= 0.82 + 0.18 * smooth(0, 0.6, y - gy);
      const [r, g2, b2] = hsl(h, s, l);
      vColor[v * 3] = r; vColor[v * 3 + 1] = g2; vColor[v * 3 + 2] = b2;
    }
    for (let f = 0; f < faceCount; f++) {
      const fx = fn[f * 3], fy = fn[f * 3 + 1], fz = fn[f * 3 + 2];
      for (let k = 0; k < 3; k++) {
        const v = corner(f, k);
        let sx = 0, sy = 0, sz = 0;
        for (let i = degree[v]; i < degree[v + 1]; i++) {
          const o = faces[i];
          const gx = fn[o * 3], gy = fn[o * 3 + 1], gz = fn[o * 3 + 2];
          if (gx * fx + gy * fy + gz * fz < cleavageCos) continue;
          sx += gx; sy += gy; sz += gz;
        }
        const nl = Math.hypot(sx, sy, sz) || 1;
        pos[out * 3] = p[v * 3]; pos[out * 3 + 1] = p[v * 3 + 1]; pos[out * 3 + 2] = p[v * 3 + 2];
        nor[out * 3] = sx / nl; nor[out * 3 + 1] = sy / nl; nor[out * 3 + 2] = sz / nl;
        col[out * 3] = vColor[v * 3]; col[out * 3 + 1] = vColor[v * 3 + 1]; col[out * 3 + 2] = vColor[v * 3 + 2];
        gr[out] = vGround[v];
        uvs[out * 2] = p[v * 3] * 0.37 + p[v * 3 + 1] * 0.21; uvs[out * 2 + 1] = p[v * 3 + 2] * 0.37 - p[v * 3 + 1] * 0.17;
        out++;
      }
    }
    g.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
  merged.setAttribute('aRockGround', new THREE.BufferAttribute(gr, 1));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

// ---------------------------------------------------------------------------------------------- the forms

function graniteTor(spec: RockFormationSpec, ground: RockGround, noise: SimplexNoise, rng: Rng, mobile: boolean, pieces: Piece[]): void {
  // A tor is the jointed core of the granite left standing when the weathered rock round it washed away (gauntlet wave
  // 29, Saltmere Bay: "a stack of near-black slabs, all the same thickness and shaped like pillows, on a bald dome";
  // Dartmoor and the Breton chaos): cuboidal blocks split by the horizontal sheeting joints and the vertical joint
  // sets, their arrises rounded by the weather but their faces flat; the sheets of every thickness, thin flags over
  // massive blocks; the stacks parted by open vertical joints along the main set, each sheet split across into two
  // or three blocks, the upper ones set back or overhanging; the sheet rock breaking the turf round the stacks in low
  // flat slabs; and the clitter that fell from it strewn down the slope, half sunk in the ground.
  const R = spec.radius, H = spec.height;
  const yaw = THREE.MathUtils.degToRad(spec.yawDeg ?? rng() * 180);
  const ca = Math.cos(yaw), sa = Math.sin(yaw);
  const seg = mobile ? 3 : 4;
  const scale = Math.max(0.6, H / 5.5);
  const at = (along: number, across: number): [number, number] => [spec.x + ca * along - sa * across, spec.z + sa * along + ca * across];
  // the sheet rock breaking the turf: low flat slabs along the joint sets round the stacks, their tops a hand to a third
  // of a metre over the ground, the rest of them in it
  const sheets = Math.round((mobile ? 4 : 9) * (0.7 + R / 12));
  for (let i = 0; i < sheets; i++) {
    const ang = (i / sheets) * Math.PI * 2 + (rng() - 0.5) * 0.6;
    const rr = R * (0.55 + rng() * 0.75);
    const [x, z] = at(Math.cos(ang) * rr, Math.sin(ang) * rr * 0.8);
    const len = (1.0 + rng() * 1.6) * scale, wid = len * (0.45 + rng() * 0.35), rise = 0.08 + rng() * 0.24;
    const g = roundedBlock(len * 0.5, 0.35 + rise * 0.5, wid * 0.5, 0.3 + rng() * 0.12, seg - 1, noise, rng, { weather: 0.1, cuts: 1, cutDepth: 0.85, seedOffset: 5 + i });
    const y = ground.getHeightAt(x, z) + rise - (0.35 + rise * 0.5);
    pieces.push({ geometry: place(g, x, y, z, yaw + (rng() < 0.5 ? 0 : Math.PI / 2) + (rng() - 0.5) * 0.25, (rng() - 0.5) * 0.08, (rng() - 0.5) * 0.08), layer: -1, standing: false });
  }
  // the stacks along the main joint
  const stacks = R >= 5 ? 3 + (rng() < 0.45 ? 1 : 0) : 2 + (rng() < 0.5 ? 1 : 0);
  const span = 2 * R * 0.82, pitch = span / stacks;
  const tallest = Math.floor(rng() * stacks);
  for (let k = 0; k < stacks; k++) {
    const along = (k - (stacks - 1) / 2) * pitch + (rng() - 0.5) * pitch * 0.18;
    const across = (rng() - 0.5) * R * 0.3;
    const [cx, cz] = at(along, across);
    const local = ground.getHeightAt(cx, cz);
    const top = local + (k === tallest ? H : H * (0.5 + rng() * 0.38));
    // the stack's plan: along the main joint, across it
    let hx = pitch * (0.42 + rng() * 0.08), hz = R * (0.36 + rng() * 0.12);
    let y = local - 0.4;
    const lean = (rng() - 0.5) * 0.06;
    let shiftX = 0, shiftZ = 0;
    for (let layer = 0; layer < 8 && y < top - 0.25; layer++) {
      // every thickness: a thin flag now and then over the massive sheets, the top sheets thinner
      const thin = rng() < 0.32;
      const t = Math.min(top - y + 0.1, (thin ? 0.32 + rng() * 0.3 : 0.75 + rng() * 0.95) * scale * (layer > 2 ? 0.8 : 1));
      // the vertical joints split the sheet across into one to three blocks, an open joint between them
      // (phones draw each sheet whole)
      const split = hz > 1.1 * scale && rng() < 0.75 ? (hz > 1.8 * scale && rng() < 0.5 ? 3 : 2) : 1;
      const pieces3 = mobile ? 1 : split;
      const gap = (0.07 + rng() * 0.12) * scale;
      const blockHz = (2 * hz - gap * (pieces3 - 1)) / pieces3 / 2;
      for (let b = 0; b < pieces3; b++) {
        const bz = -hz + blockHz + b * (2 * blockHz + gap);
        // a block's own cut: a little longer or shorter, set in or out from the sheet's line
        const bhx = hx * (0.9 + rng() * 0.18), bhz = blockHz * (0.92 + rng() * 0.12);
        // (the thin flags and the narrow blocks on one segment fewer: the tor keeps its budget)
        const blockSeg = t < 0.7 * scale || bhz < 0.8 * scale ? seg - 1 : seg;
        const slab = roundedBlock(bhx, t * 0.5, bhz, 0.18 + rng() * 0.12, blockSeg, noise, rng,
          { weather: 0.07, cuts: 1, cutDepth: 0.86, seedOffset: 31 + k * 13 + layer * 3 + b });
        const ox = shiftX + (rng() - 0.5) * 0.12 * scale, oz = shiftZ + bz + (rng() - 0.5) * 0.08 * scale;
        const [px, pz] = [cx + ca * ox - sa * oz, cz + sa * ox + ca * oz];
        // each sheet sits on the one under it with its joint open a few centimetres at the rounded arrises
        pieces.push({ geometry: place(slab, px, y + t * 0.5, pz, yaw + (rng() - 0.5) * 0.12, lean + (rng() - 0.5) * 0.04, (rng() - 0.5) * 0.04), layer: -1, standing: true });
      }
      y += t * 0.985;
      // the upper sheets set back (the weather took their edges) or, now and then, overhang the one below
      const step = rng() < 0.22 ? 1.06 : 0.78 + rng() * 0.14;
      hx *= step; hz *= 0.8 + rng() * 0.14;
      shiftX += (rng() - 0.5) * hx * 0.25; shiftZ += (rng() - 0.5) * hz * 0.2;
    }
  }
  // the clitter: cuboidal blocks that fell from the stacks, half sunk, densest at the foot and strewn down the slope
  const shed = spec.shed ?? 1;
  const count = Math.round((mobile ? 8 : 22) * shed * (0.8 + R / 10));
  const [dx, dz] = downhill(ground, spec.x, spec.z, R);
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const far = Math.pow(rng(), 1.4);
    const rr = R * (0.8 + far * 2.2);
    let x = spec.x + Math.cos(a) * rr, z = spec.z + Math.sin(a) * rr * 0.8;
    // the farther ones lie downhill
    x += dx * R * 1.2 * far; z += dz * R * 1.2 * far;
    const size = (0.28 + Math.pow(rng(), 2) * 1.05) * Math.min(1.2, scale) * (1 - far * 0.35);
    const g = roundedBlock(size, size * (0.42 + rng() * 0.3), size * (0.65 + rng() * 0.3), 0.34 + rng() * 0.14,
      mobile || size < 0.9 ? 2 : 3, noise, rng, { weather: 0.08, cuts: 1, cutDepth: 0.8, seedOffset: 80 + i });
    const y = ground.getHeightAt(x, z) + size * (0.05 - rng() * 0.3);
    pieces.push({ geometry: place(g, x, y, z, rng() * Math.PI * 2, (rng() - 0.5) * 0.35, (rng() - 0.5) * 0.35), layer: -1, standing: false });
  }
}

function beddedOutcrop(spec: RockFormationSpec, ground: RockGround, noise: SimplexNoise, rng: Rng, mobile: boolean, pieces: Piece[]): void {
  // A bedded outcrop: hard and soft beds of a sedimentary rock exposed on a slope — a scarp of stepped ledges where
  // the beds break off (each hard bed standing proud over the recessed soft one below it, each one higher stepping
  // back from the face), the dip slope behind, the beds split into blocks by the vertical joints. The strike runs
  // across the slope: the scarp faces downhill.
  const R = spec.radius, H = spec.height;
  const [dx, dz] = downhill(ground, spec.x, spec.z, R);
  const strike = spec.yawDeg !== undefined ? THREE.MathUtils.degToRad(spec.yawDeg)
    : (dx === 0 && dz === 0 ? rng() * Math.PI : Math.atan2(dz, dx) + Math.PI / 2);
  // the across axis (perpendicular to the strike), signed so +across points down the slope (the scarp side)
  let ux = -Math.sin(strike), uz = Math.cos(strike);
  if (ux * dx + uz * dz < 0) { ux = -ux; uz = -uz; }
  const sx = Math.cos(strike), sz = Math.sin(strike);
  // (b12: the beds jointed into more, blockier blocks, each outline on fewer facets: the formation keeps its budget)
  const sides = mobile ? 8 : 14;
  const { min } = lowestGround(ground, spec.x, spec.z, R);
  const limestone = spec.geology === 'limestone';
  let y = min - 0.55;
  let halfL = R, halfD = R * (0.38 + rng() * 0.1);
  let back = 0;
  // on a slope the beds climb from the scarp foot until they stand H above the hillside at the centre
  const crown = Math.max(min + H, ground.getHeightAt(spec.x, spec.z) + H * 0.75);
  for (let bed = 0; bed < 14 && y < crown - 0.15; bed++) {
    const soft = bed % 2 === 1 && !limestone;
    // (b12, wave 72 on Redrock: "a layer cake" of even slabs) the beds uneven: thin hard beds and a few massive ones, the
    // soft partings thin and weathered back into the face, a shadow line under each hard bed
    const thick = Math.min(crown - y + 0.1, soft ? 0.12 + rng() * 0.3 : (0.5 + 1.25 * Math.pow(rng(), 1.6)) * Math.max(0.7, H / 4.5));
    // the joints split a hard bed into blocks along the strike, closer than a bed is long (no unbroken plate)
    const blocks = soft ? 1 : Math.max(1, Math.round(halfL * 2 / (2.4 + rng() * 2.2)));
    const gap = limestone ? 0.08 + rng() * 0.14 : 0.25 + rng() * 0.35; // limestone's joints close: one scar face
    const blockHalf = (halfL * 2 - gap * (blocks - 1)) / blocks / 2;
    for (let b = 0; b < blocks; b++) {
      const along = -halfL + blockHalf + b * (blockHalf * 2 + gap) + (rng() - 0.5) * 0.3;
      // each joint block proud or recessed of its bed's face, and now and then fallen out of it altogether (its gap the
      // scarp's broken edge; never the bed's last block)
      const depth = halfD * (soft ? 0.68 : 0.78 + rng() * 0.34);
      if (!soft && blocks > 1 && b > 0 && rng() < 0.14) continue;
      // a joint block's own thickness (a bed wedges along its strike) and its settle: blocky in plan with broken edges,
      // its top arris worn round (the shoulder)
      const blockThick = soft ? thick : thick * (0.78 + rng() * 0.44), settle = soft ? 0 : (rng() - 0.6) * 0.12;
      const g = beddedSlab(blockHalf * (soft ? 1.02 : 0.96), depth, blockThick, soft ? 0.05 : 0.16, sides, noise, spec.x * 0.01 + bed * 1.7 + b * 0.53,
        { roughness: soft ? 0.12 : 0.32, overhang: soft ? 0 : 0.05, squareness: soft ? 2.6 : 4.2, topWobble: soft ? 0.1 : 0.16, shoulder: soft || mobile || blockThick < 0.65 ? 0 : 0.8 });
      const cx = spec.x + sx * along - ux * back, cz = spec.z + sz * along - uz * back;
      const j = limestone ? 0.35 : 1, tip = soft ? 0.04 : 0.09;
      pieces.push({ geometry: place(g, cx, y + settle, cz, -strike + (rng() - 0.5) * 0.06 * j, (rng() - 0.5) * tip * j, (rng() - 0.5) * tip * j), layer: bed, standing: true });
    }
    y += thick * 0.98;
    if (!soft) {
      // the next hard bed steps back from the scarp and shortens along the strike
      back += halfD * (limestone ? 0.04 + rng() * 0.12 : 0.08 + rng() * 0.3);
      halfL *= 0.74 + rng() * 0.2;
      halfD *= 0.8 + rng() * 0.14;
    }
  }
  // the fallen blocks at the scarp foot (b12, wave 72: "soap bars"): angular — sharp joint blocks barely rounded, cut by
  // three fractures — graded by size (the big ones at the foot, the small ones rolled out beyond), half buried
  const shed = spec.shed ?? 1;
  const count = Math.round((mobile ? 4 : 11) * shed);
  for (let i = 0; i < count; i++) {
    const along = (rng() - 0.5) * R * 2.1, reach = rng(), out = R * (0.35 + reach * 0.7);
    const x = spec.x + sx * along + ux * out, z = spec.z + sz * along + uz * out;
    const size = (0.25 + Math.pow(rng(), 1.6) * 1.2) * (1.2 - 0.65 * reach);
    const g = roundedBlock(size, size * (0.45 + rng() * 0.3), size * (0.65 + rng() * 0.35), 0.05, 2, noise, rng, { weather: 0.04, cuts: 3, cutDepth: 0.62, seedOffset: i + 40 });
    const yy = ground.getHeightAt(x, z) - size * (0.15 + rng() * 0.2);
    pieces.push({ geometry: place(g, x, yy, z, rng() * Math.PI, (rng() - 0.5) * 0.5, (rng() - 0.5) * 0.4), layer: i % 4, standing: false });
  }
}

function limestonePavement(spec: RockFormationSpec, ground: RockGround, noise: SimplexNoise, rng: Rng, mobile: boolean, pieces: Piece[]): void {
  // Limestone pavement: the bare top of a limestone bed, dissolved along its joints into clints (the blocks) and grikes
  // (the fissures between), lying nearly flush with the turf; a low scar (the next bed's broken edge) behind it.
  const R = spec.radius;
  const yaw = THREE.MathUtils.degToRad(spec.yawDeg ?? rng() * 180);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const cellU = mobile ? 3.0 : 2.4, cellV = cellU * 1.45;
  const nu = Math.ceil(R / cellU), nv = Math.ceil(R / cellV);
  const sides = mobile ? 10 : 14;
  for (let i = -nu; i <= nu; i++) {
    for (let j = -nv; j <= nv; j++) {
      // the master joints run straight along the strike; the cross joints wander
      const u = (i + (rng() - 0.5) * 0.25) * cellU, v = (j + (rng() - 0.5) * 0.45) * cellV;
      const d = Math.hypot(u, v * 0.85) / R;
      const rim = 0.7 + noise.noise(u * 0.16 + spec.x * 0.01, v * 0.16) * 0.3;
      if (d > rim || rng() < 0.07) continue;
      const x = spec.x + u * c - v * s, z = spec.z + u * s + v * c;
      const grike = 0.12 + rng() * 0.12;
      const hu = cellU * 0.5 - grike * 0.5, hv = cellV * 0.5 * (0.7 + rng() * 0.3) - grike * 0.5;
      const rise = 0.06 + (1 - d) * 0.16 + rng() * 0.08;
      const thick = 0.35 + rise;
      const g = beddedSlab(hu, hv, thick, 0.04, sides, noise, i * 3.1 + j * 1.7 + spec.z * 0.01, { roughness: 0.07, squareness: 7, topWobble: 0.05 });
      const gy = ground.getHeightAt(x, z);
      pieces.push({ geometry: place(g, x, gy + rise - thick, z, -yaw + (rng() - 0.5) * 0.1, (rng() - 0.5) * 0.04, (rng() - 0.5) * 0.04), layer: -1, standing: false });
    }
  }
  // the scar: the next bed's broken edge, a low step of jointed blocks along the strike on the upslope side
  if (spec.height > 0.4) {
    const [dx, dz] = downhill(ground, spec.x, spec.z, R);
    const back = dx === 0 && dz === 0 ? [-s, c] : [-dx, -dz];
    const sx = spec.x + back[0] * R * 0.8, sz = spec.z + back[1] * R * 0.8;
    const along = [back[1], -back[0]];
    const { min } = lowestGround(ground, sx, sz, R * 0.5);
    const span = R * 1.5, blocks = Math.max(3, Math.round(span / 2.6));
    const half = span / blocks / 2;
    for (let tier = 0; tier < 2; tier++) {
      for (let b = 0; b < blocks - tier; b++) {
        const t = -span / 2 + half + b * half * 2 + tier * half + (rng() - 0.5) * 0.4;
        const depth = 1.0 + rng() * 0.6, h = (spec.height * 0.5) * (0.75 + rng() * 0.5) + (tier ? 0 : 0.45);
        const g = beddedSlab(half - 0.12, depth, h, 0.06, sides, noise, b * 2.3 + tier * 9 + spec.x * 0.01, { roughness: 0.08, squareness: 6, topWobble: 0.05 });
        const x = sx + along[0] * t + back[0] * tier * 1.3, z = sz + along[1] * t + back[1] * tier * 1.3;
        pieces.push({ geometry: place(g, x, min - 0.45 + tier * spec.height * 0.45, z, -Math.atan2(along[1], along[0]) + (rng() - 0.5) * 0.08), layer: -1, standing: true });
      }
    }
  }
}

function slateCrag(spec: RockFormationSpec, ground: RockGround, noise: SimplexNoise, rng: Rng, mobile: boolean, pieces: Piece[]): void {
  // A slate / greywacke crag: steeply dipping plates of the cleaved rock standing out of the slope in two or three
  // ranks along the strike, their tops broken where the cleavage splits them, rust in the joints.
  const R = spec.radius, H = spec.height;
  const yaw = THREE.MathUtils.degToRad(spec.yawDeg ?? rng() * 180);
  const ca = Math.cos(yaw), sa = Math.sin(yaw);
  const { min } = lowestGround(ground, spec.x, spec.z, R);
  const dip = THREE.MathUtils.degToRad(60 + rng() * 15);
  const ranks = R > 4 ? 3 : 2;
  for (let rank = 0; rank < ranks; rank++) {
    const across = (rank - (ranks - 1) / 2) * R * 0.32 + (rng() - 0.5) * 0.4;
    const plates = 3 + ((rng() * 3) | 0);
    for (let i = 0; i < plates; i++) {
      const t = plates === 1 ? 0 : i / (plates - 1) - 0.5;
      const along = t * R * 1.5 + (rng() - 0.5) * 0.8;
      const x = spec.x + ca * along - sa * across, z = spec.z + sa * along + ca * across;
      const hy = H * (0.5 + (1 - Math.abs(t) * 1.3) * 0.45 + rng() * 0.12) * (rank === 1 ? 1 : 0.8) * 0.5;
      const thick = 0.35 + rng() * 0.45;
      const len = R * (0.22 + rng() * 0.2);
      const g = roundedBlock(len, hy, thick, 0.08, mobile ? 3 : 4, noise, rng, { weather: 0.07, cuts: 3, cutDepth: 0.6, seedOffset: rank * 13 + i + 90 });
      pieces.push({ geometry: place(g, x, min + hy * 0.8 - 0.45, z, -yaw + (rng() - 0.5) * 0.15, (dip - Math.PI / 2) * (rng() < 0.85 ? 1 : -0.6), (rng() - 0.5) * 0.14), layer: -1, standing: true });
    }
  }
}

function scree(spec: RockFormationSpec, ground: RockGround, noise: SimplexNoise, rng: Rng, mobile: boolean, pieces: Piece[]): void {
  // a fan of angular stone: densest at its apex (spec.x, spec.z), spreading and fining downslope
  const R = spec.radius;
  const [dx, dz] = downhill(ground, spec.x, spec.z, 2);
  const axis = dx === 0 && dz === 0 ? THREE.MathUtils.degToRad(spec.yawDeg ?? 0) : Math.atan2(dz, dx);
  const count = Math.round((mobile ? 60 : 150) * (spec.shed ?? 1) * (R / 10));
  for (let i = 0; i < count; i++) {
    const t = Math.pow(rng(), 0.7);
    const spread = (rng() - 0.5) * (0.3 + t * 1.1);
    const a = axis + spread;
    const rr = t * R;
    const x = spec.x + Math.cos(a) * rr, z = spec.z + Math.sin(a) * rr;
    // the big blocks roll farthest; the fines stay up the fan
    const size = (0.18 + Math.pow(rng(), 2.0) * 0.6) * (0.7 + t * 0.8);
    const g = looseStone(size, 0.45 + rng() * 0.25, noise, rng, 0, 0);
    const y = ground.getHeightAt(x, z) - size * 0.2;
    pieces.push({ geometry: place(g, x, y, z, rng() * Math.PI * 2, (rng() - 0.5) * 0.5, (rng() - 0.5) * 0.5), layer: -1, standing: false });
  }
}

function hoodoo(spec: RockFormationSpec, ground: RockGround, noise: SimplexNoise, rng: Rng, mobile: boolean, pieces: Piece[]): void {
  // A hoodoo (the mushroom rocks of Wadi Rum): the wind and the sand blast cut the softer beds at the foot faster than
  // the hard cap above, leaving a narrowing pedestal under a broad slab; fallen cap pieces lie round it.
  const R = spec.radius, H = spec.height;
  const yaw = THREE.MathUtils.degToRad(spec.yawDeg ?? rng() * 180);
  const sides = mobile ? 12 : 18;
  const { min } = lowestGround(ground, spec.x, spec.z, R * 0.5);
  const capT = Math.max(0.6, H * 0.22);
  const stemH = H - capT;
  // the pedestal: soft beds, waisted (narrowest a little below the cap)
  let y = min - 0.5;
  const beds = Math.max(3, Math.round(stemH / 0.7));
  for (let b = 0; b < beds; b++) {
    const t = (b + 0.5) / beds;
    const waist = 0.42 + 0.58 * Math.pow(Math.abs(t - 0.78) / 0.78, 1.4);
    const thick = (stemH + 0.5) / beds;
    const g = beddedSlab(R * 0.55 * waist, R * 0.45 * waist, thick * 1.02, 0.04, sides, noise, b * 1.9 + spec.x * 0.01,
      { roughness: 0.16, squareness: 2.4, topWobble: 0.04 });
    pieces.push({ geometry: place(g, spec.x + (rng() - 0.5) * 0.12, y, spec.z + (rng() - 0.5) * 0.12, -yaw + b * 0.05), layer: 1, standing: true });
    y += thick;
  }
  // the cap: one hard, broad, slightly tilted slab overhanging the pedestal
  const cap = beddedSlab(R, R * (0.62 + rng() * 0.18), capT, 0.12, sides + 4, noise, spec.z * 0.01 + 7,
    { roughness: 0.2, overhang: 0.06, squareness: 2.6, topWobble: 0.12 });
  pieces.push({ geometry: place(cap, spec.x, y - 0.05, spec.z, -yaw, (rng() - 0.5) * 0.08, (rng() - 0.5) * 0.08), layer: 0, standing: true });
  for (let i = 0; i < (mobile ? 3 : 6); i++) {
    const a = rng() * Math.PI * 2, rr = R * (0.8 + rng() * 0.8);
    const x = spec.x + Math.cos(a) * rr, z = spec.z + Math.sin(a) * rr;
    const size = 0.3 + rng() * 0.6;
    const g = roundedBlock(size, size * 0.4, size * 0.8, 0.15, 2, noise, rng, { weather: 0.06, cuts: 2, cutDepth: 0.7, seedOffset: 400 + i });
    pieces.push({ geometry: place(g, x, ground.getHeightAt(x, z) + size * 0.1, z, rng() * 3, (rng() - 0.5) * 0.5, (rng() - 0.5) * 0.5), layer: 0, standing: false });
  }
}

function menhir(spec: RockFormationSpec, ground: RockGround, noise: SimplexNoise, rng: Rng, mobile: boolean, pieces: Piece[]): void {
  // a standing stone: a split slab set on end, leaning a little, its top broken by the quarrying; packing stones round
  // its foot
  const H = spec.height, W = Math.max(0.5, spec.radius);
  const yaw = THREE.MathUtils.degToRad(spec.yawDeg ?? rng() * 180);
  const { min } = lowestGround(ground, spec.x, spec.z, W * 0.6);
  const sink = 0.6 + H * 0.08;
  const g = roundedBlock(W * 0.5, (H + sink) * 0.5, W * (0.28 + rng() * 0.08), 0.32, mobile ? 4 : 6, noise, rng,
    { weather: 0.14, cuts: 3, cutDepth: 0.62, seedOffset: 300 });
  pieces.push({ geometry: place(g, spec.x, min - sink + (H + sink) * 0.5, spec.z, yaw, (rng() - 0.5) * 0.09, (rng() - 0.5) * 0.12), layer: -1, standing: true });
  for (let i = 0; i < (mobile ? 2 : 4); i++) {
    const a = yaw + rng() * Math.PI * 2, rr = W * (0.45 + rng() * 0.25);
    const x = spec.x + Math.cos(a) * rr, z = spec.z + Math.sin(a) * rr;
    const size = 0.18 + rng() * 0.2;
    pieces.push({ geometry: place(looseStone(size, 0.6, noise, rng, mobile ? 0 : 1, 0.6), x, ground.getHeightAt(x, z) - size * 0.3, z, rng() * 6.3), layer: -1, standing: false });
  }
}

function cairn(spec: RockFormationSpec, ground: RockGround, noise: SimplexNoise, rng: Rng, mobile: boolean, pieces: Piece[]): void {
  // a clearance cairn (the Dalmatian gomila, the Bedouin rujm): field stone heaped into a dome; a rough core under a
  // shell of the larger stones
  const R = spec.radius, H = spec.height;
  const { min } = lowestGround(ground, spec.x, spec.z, R);
  const core = roundedBlock(R * 0.86, H * 0.92, R * 0.8, 1, mobile ? 3 : 4, noise, rng, { weather: 0.16, cuts: 0, seedOffset: 500 });
  pieces.push({ geometry: place(core, spec.x, min - H * 0.12, spec.z, rng() * 6.3), layer: -1, standing: true });
  const stone = Math.max(0.35, Math.min(0.9, R * 0.16));
  const rings = Math.max(2, Math.round(H / (stone * 0.9)));
  for (let k = 0; k < rings; k++) {
    const t = k / rings;
    const rr = R * Math.pow(1 - t, 0.85) * 0.96;
    const n = Math.max(1, Math.round((2 * Math.PI * rr) / (stone * (mobile ? 2.6 : 2.0))));
    const yRing = min + t * H * 0.92;
    for (let i = 0; i < n; i++) {
      const a = (i + rng() * 0.6) / n * Math.PI * 2;
      const x = spec.x + Math.cos(a) * rr, z = spec.z + Math.sin(a) * rr * 0.93;
      const size = stone * (0.6 + rng() * 0.6);
      pieces.push({ geometry: place(looseStone(size, 0.55 + rng() * 0.2, noise, rng, mobile ? 0 : 1, 0.3), x, yRing + size * 0.1, z, rng() * 6.3, (rng() - 0.5) * 0.6, (rng() - 0.5) * 0.6), layer: -1, standing: true });
    }
  }
}

function calvary(spec: RockFormationSpec, ground: RockGround, noise: SimplexNoise, rng: Rng, mobile: boolean, pieces: Piece[]): void {
  // a granite wayside calvary: three dressed steps, a pedestal, an octagonal shaft with a necking ring and the cross;
  // the steps follow the ground's lowest corner so no step floats
  const S = spec.radius / 1.6; // 1.6 m half-base at scale 1
  const H = spec.height;
  const yaw = THREE.MathUtils.degToRad(spec.yawDeg ?? 0);
  const { min } = lowestGround(ground, spec.x, spec.z, spec.radius);
  const seg = mobile ? 1 : 2;
  let y = min - 0.25;
  const steps: Array<[number, number]> = [[1.6, 0.42], [1.22, 0.36], [0.86, 0.34]];
  for (const [half, h] of steps) {
    const g = roundedBlock(half * S, h * 0.5 + (y < min ? 0.12 : 0), half * S, 0.05, seg, noise, rng, { weather: 0.03, cuts: 0, seedOffset: 600 + half });
    pieces.push({ geometry: place(g, spec.x, y + h * 0.5, spec.z, yaw), layer: -1, standing: true });
    y += h;
  }
  const ped = roundedBlock(0.5 * S, 0.42, 0.5 * S, 0.08, seg, noise, rng, { weather: 0.04, cuts: 0, seedOffset: 620 });
  pieces.push({ geometry: place(ped, spec.x, y + 0.42, spec.z, yaw), layer: -1, standing: true });
  y += 0.84;
  const shaftH = Math.max(1.6, H - y + min - 1.25);
  const shaft = new THREE.CylinderGeometry(0.17 * S, 0.22 * S, shaftH, mobile ? 6 : 8, 2);
  shaft.deleteAttribute('uv'); shaft.deleteAttribute('normal');
  const shaftW = mergeVertices(shaft); shaft.dispose();
  pieces.push({ geometry: place(shaftW, spec.x, y + shaftH * 0.5, spec.z, yaw + Math.PI / 8), layer: -1, standing: true });
  y += shaftH;
  const neck = roundedBlock(0.26 * S, 0.09, 0.26 * S, 0.3, seg, noise, rng, { weather: 0.02, cuts: 0, seedOffset: 640 });
  pieces.push({ geometry: place(neck, spec.x, y + 0.05, spec.z, yaw + Math.PI / 4), layer: -1, standing: true });
  y += 0.12;
  // the cross: an upright and its arms, the arms' ends a little splayed (the Breton trefoil reduced to a block)
  const up = roundedBlock(0.13 * S, 0.62, 0.11 * S, 0.12, seg, noise, rng, { weather: 0.03, cuts: 0, seedOffset: 660 });
  pieces.push({ geometry: place(up, spec.x, y + 0.62, spec.z, yaw), layer: -1, standing: true });
  const arm = roundedBlock(0.56 * S, 0.11, 0.1 * S, 0.12, seg, noise, rng, { weather: 0.03, cuts: 0, seedOffset: 680 });
  pieces.push({ geometry: place(arm, spec.x, y + 0.86, spec.z, yaw), layer: -1, standing: true });
  for (const side of [-1, 1]) {
    const end = roundedBlock(0.09 * S, 0.16, 0.12 * S, 0.3, seg, noise, rng, { weather: 0.03, cuts: 0, seedOffset: 700 + side });
    pieces.push({ geometry: place(end, spec.x + Math.cos(yaw) * side * 0.56 * S, y + 0.86, spec.z - Math.sin(yaw) * side * 0.56 * S, yaw), layer: -1, standing: true });
  }
}

// ---------------------------------------------------------------------------------------------- bedrock

/** Bedrock on a hill's steep flanks (the scenery `bedrock` family). */
interface BedrockSpec {
  geology: RockGeology;
  /** The hill's summit: the centre the beds ring. */
  x: number;
  z: number;
  /** How far out from the summit the flanks are searched. */
  radius: number;
  /** Ground steeper than this (rise over run) shows its rock; a hull climbs the gentler ground, so the beds start above
   * the highest ground it reaches. */
  minGrade?: number;
  /** The beds' thickness range (m). */
  beds?: readonly [number, number];
  /** A bare-rock sheet over the summit. */
  crown?: boolean;
  tone?: readonly [number, number, number];
}

/**
 * The terrain's bed law, when the world carries it (the ground lane's terrain.ts terrainBedWobbleAt and
 * terrainFormationBoundaryY): the skin's bed boundaries lie on its bedY surfaces (bedY = y − wobbleAt(x, z)), so the
 * skin's beds and the terrain's strata are one bedding, and the skin takes the map's two formations' tones.
 */
interface BedrockStrata {
  /** The beds' wander in metres of height at (x, z). */
  wobbleAt(x: number, z: number): number;
  /** Two formations: the boundary in the beds' own height at (x, z), and the linear RGB multipliers below and above. */
  formation?: { boundaryAt(x: number, z: number): number; lower: readonly [number, number, number]; upper: readonly [number, number, number] };
}

interface BedrockBuildOptions extends RockBuildOptions {
  strata?: BedrockStrata;
}

const BEDROCK_STEP = 0.5;   // the ray profiles' step (m)
const BEDROCK_CLEAR = 1.6;  // the lowest bed stands this far above the highest ground a hull climbs to on its ray
const BEDROCK_BENCH = 3.4;  // a bed whose bench would run wider than this is not cut: the ground there is gentle

/** The beds' joint spacing (m) and the widest master cleft (m) of each geology. */
const BEDROCK_JOINTS: Readonly<Record<RockGeology, readonly [number, number, number]>> = Object.freeze({
  sandstone: [3.5, 9, 0.7],
  limestone: [2.5, 6, 0.45],
  granite: [4, 10, 0.8],
  slate: [1.5, 4, 0.3],
});

/**
 * A bed's cross-section in its outward frame (r out of the hill from the bed's foot line, y up): inner bottom, outer
 * bottom (undercut), the face's belly, the face under the lip, the lip, inner top. r0 / r1 are where the ground falls
 * through the bed's foot and top along the frame (the top is uphill, r1 < r0).
 */
function bedProfile(r0: number, r1: number, b0: number, b1: number, t: number, proud: number, bulge: number, batter: number, bev: number): Array<[number, number]> {
  return [
    [r0 - 0.7, b0 - 0.05],
    [r0 + proud * 0.55, b0 - 0.05],
    [r0 + proud + bulge - batter * 0.45, b0 + t * 0.42],
    [r0 + proud - batter - bev * 0.6, b1 - bev],
    [r0 + proud - batter - bev * 1.8, b1 + 0.02],
    [r1 - 0.7, b1 + 0.02],
  ];
}

/**
 * Sweep a bed's profile rows (six world points each, ordered so the outward frame turns left of the run: walking
 * direction = outward x up) into blocks: every run of cut rows is one welded block, an uncut row parts it. The underside
 * is left out (a bed sits on the bench below it; under the lowest the hill shows through).
 */
function pushBedBlocks(rows: ReadonlyArray<number[] | null>, layer: number, pieces: Piece[]): void {
  let i = 0;
  while (i < rows.length) {
    while (i < rows.length && !rows[i]) i++;
    const firstRow = i;
    while (i < rows.length && rows[i]) i++;
    // (a run of two rows is a sliver a few metres long, standing off a wall where the ground breaks up: none)
    if (i - firstRow < 3) continue;
    const run = rows.slice(firstRow, i) as number[][];
    const positions: number[] = [];
    for (const row of run) positions.push(...row);
    const index: number[] = [];
    const v = (k: number, q: number) => k * 6 + q;
    for (let k = 0; k + 1 < run.length; k++) {
      for (let q = 1; q < 5; q++) index.push(v(k, q), v(k + 1, q + 1), v(k + 1, q), v(k, q), v(k, q + 1), v(k + 1, q + 1));
    }
    const last = run.length - 1;
    for (let q = 1; q < 5; q++) {
      index.push(v(0, 0), v(0, q + 1), v(0, q));          // the block's first end faces back along the run
      index.push(v(last, 0), v(last, q), v(last, q + 1)); // its last end faces on along it
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(index);
    pieces.push({ geometry: g, layer, standing: false });
  }
}

/**
 * Bedrock showing through a hill's steep flanks: the hill's own beds, level, ringing it from the highest ground a hull
 * can climb to up to its crown. Each bed stands a little proud of the slope with a steep face (the hard beds farther
 * than the soft ones under them), a rounded lip and a bench running back into the hill, where the next bed sits; the
 * vertical joints split every bed into blocks, open a little, staggered from bed to bed; rounded knobs crown the
 * summit (Wadi Rum's domes, the Bungle Bungle beehives). The ground under it stays the hill: the hulls and shells meet
 * the terrain, and the rock is a skin no hull reaches, so it publishes no mass. Rays from the summit read the hill;
 * nothing is drawn where the ground is gentle, under water or beyond the search radius.
 */
export function buildBedrock(
  spec: BedrockSpec, ground: RockGround, noise: SimplexNoise, rng: Rng, { mobile = false, strata }: BedrockBuildOptions = {},
): RockFormationBuild {
  const minGrade = spec.minGrade ?? 0.9;
  const [tMin, tMax] = spec.beds ?? (spec.geology === 'sandstone' ? [1.2, 3.2] : spec.geology === 'limestone' ? [0.8, 2.2] : [1.0, 2.6]);
  // (a phone's beds keep their joints farther apart: fewer blocks, the same rock)
  const [jMin0, jMax0, cleftMax] = BEDROCK_JOINTS[spec.geology];
  const jMin = jMin0 * (mobile ? 1.6 : 1), jMax = jMax0 * (mobile ? 1.6 : 1);
  // the rays: one every 1.5 m (2.5 m on phones) round six tenths of the search radius, where a dome's wall stands, so
  // a cleft a few metres wide is read on two rays or more and the beds follow a lobed foot
  const rays = Math.max(mobile ? 36 : 48, Math.min(mobile ? 120 : 200, Math.round((Math.PI * 2 * spec.radius * 0.6) / (mobile ? 2.5 : 1.5))));
  const steps = Math.max(4, Math.ceil(spec.radius / BEDROCK_STEP)), stride = steps + 1;
  const groundAt = ground.getHeightAtFast ? (x: number, z: number) => ground.getHeightAtFast!(x, z) : (x: number, z: number) => ground.getHeightAt(x, z);
  // the ray profiles: the ground from the summit outward
  const H = new Float32Array(rays * stride);
  for (let j = 0; j < rays; j++) {
    const a = (j / rays) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    for (let k = 0; k <= steps; k++) H[j * stride + k] = groundAt(spec.x + c * k * BEDROCK_STEP, spec.z + s * k * BEDROCK_STEP);
  }
  // per ray: the crest (the highest ground on its inner part) and the highest ground a hull climbs to from outside
  // (the outermost point steeper than minGrade)
  const peak = new Int32Array(rays), climb = new Float32Array(rays);
  let top = -Infinity, foot = Infinity, summitX = spec.x, summitZ = spec.z;
  for (let j = 0; j < rays; j++) {
    const row = j * stride;
    let best = 0;
    for (let k = 1; k <= steps * 0.4; k++) if (H[row + k] > H[row + best]) best = k;
    peak[j] = best;
    if (H[row + best] > top) {
      top = H[row + best];
      const a = (j / rays) * Math.PI * 2;
      summitX = spec.x + Math.cos(a) * best * BEDROCK_STEP; summitZ = spec.z + Math.sin(a) * best * BEDROCK_STEP;
    }
    foot = Math.min(foot, H[row + steps]);
    climb[j] = Infinity;
    for (let k = steps - 1; k > best; k--) {
      if ((H[row + k - 1] - H[row + k + 1]) / (2 * BEDROCK_STEP) > minGrade) { climb[j] = H[row + k]; break; }
    }
  }
  /** The first radius on ray j, going out from its crest, where the ground falls below y (NaN: none in reach). */
  const edge = (j: number, y: number): number => {
    const row = j * stride;
    let k = peak[j];
    if (H[row + k] < y) return NaN;
    for (k++; k <= steps; k++) {
      if (H[row + k] < y) {
        const h0 = H[row + k - 1], h1 = H[row + k];
        return (k - 1 + (h0 - y) / Math.max(1e-6, h0 - h1)) * BEDROCK_STEP;
      }
    }
    return NaN;
  };
  const rayAt = (theta: number): [number, number, number] => {
    const f = ((theta / (Math.PI * 2)) % 1 + 1) % 1 * rays;
    const j0 = Math.floor(f) % rays;
    return [j0, (j0 + 1) % rays, f - Math.floor(f)];
  };
  const edgeAt = (theta: number, y: number): number => {
    const [j0, j1, f] = rayAt(theta);
    const a = edge(j0, y), b = edge(j1, y);
    return a + (b - a) * f;
  };
  const climbAt = (theta: number): number => { const [j0, j1] = rayAt(theta); return Math.max(climb[j0], climb[j1]); };

  const pieces: Piece[] = [];
  let lowest = Infinity;
  for (let j = 0; j < rays; j++) lowest = Math.min(lowest, climb[j]);
  if (!Number.isFinite(lowest) || !(top > lowest)) return { geometry: null, masses: [], pieces: 0, triangles: 0 };
  const sandstone = spec.geology === 'sandstone';
  const segLen = mobile ? 3.5 : 2.5;
  // the hill's reference radius (half way up its rock) sets the joint and dip arcs
  let rs = 0, rn = 0;
  for (let j = 0; j < rays; j += 4) { const r = edge(j, (lowest + top) * 0.5); if (Number.isFinite(r)) { rs += r; rn++; } }
  if (!rn) return { geometry: null, masses: [], pieces: 0, triangles: 0 };
  const rRef = Math.max(3, rs / rn);
  const rayAngle = (j: number) => (j / rays) * Math.PI * 2;
  // ---- the hill's own bedding (the beehive read: every dome bedded alike, its beds level and even as courses): its
  // beds thicker or thinner than the geology's run, dipping its own way by its own amount (up to five degrees); every
  // bed boundary dips a shade off the next and swells and pinches along its run. A boundary is the top of one bed and
  // the foot of the next, so the beds sit on each other wherever they run, and no bed pinches out.
  // (on a world with the terrain's bed law the beds lie on its bedY surfaces instead: no dip or swell of their own)
  const bedWob = strata?.wobbleAt;
  const thick = 0.72 + rng() * 0.62;
  const dipAz = rng() * Math.PI * 2, tanDip = spec.geology === 'slate' || bedWob ? 0 : 0.015 + rng() * 0.075;
  const swell = bedWob ? 0 : 0.12 + rng() * 0.16;
  const plan: Array<{ t: number; soft: boolean; layer: number; proud: number; batter: number; bev: number; stagger: number; show: number }> = [];
  const level: number[] = [lowest + BEDROCK_CLEAR]; // the boundaries' mean heights: level[k] is bed k's foot
  let hard = 0, soft = 0;
  while (plan.length < 60) {
    const k = plan.length;
    // a sandstone's thick hard beds part on thin soft ones that the weather cuts back; now and then a massive bed
    const isSoft = sandstone && k > 0 && rng() < 0.55 && !(soft > hard);
    const massive = !isSoft && rng() < 0.22;
    const t = (isSoft ? 0.3 + rng() * 0.4 : (tMin + rng() * (tMax - tMin)) * (massive ? 1.8 : 1)) * thick;
    if (level[k] + t > top - 0.6) break;
    // a third of the hard beds stand out as ledges, the rest a hand's breadth proud; and no bed rings the whole hill:
    // each shows as its own rock along stretches of the girth (`show`, a threshold on its exposure field), and the
    // hill's weathered wall between them
    // (a ledge's lip is weathered round, not a cushion: a small bevel, a face that barely bellies)
    const ledge = !isSoft && rng() < 0.25;
    plan.push({ t, soft: isSoft, layer: isSoft ? 2 * soft++ + 1 : 2 * hard++,
      proud: isSoft ? 0.05 + rng() * 0.08 : ledge ? 0.5 + rng() * 0.4 : 0.08 + rng() * 0.17, batter: (0.04 + rng() * 0.08) * t,
      bev: isSoft ? Math.min(0.1, t * 0.2) : Math.min(0.28, t * 0.11), stagger: rng(),
      show: isSoft ? -0.6 + rng() * 0.5 : -0.85 + rng() * 0.35 });
    level.push(level[k] + t);
  }
  // each boundary's own dip and swell, each held to under a sixth of the thinner bed it parts
  const drift: number[] = [], amp: number[] = [];
  for (let k = 0; k <= plan.length; k++) {
    const thin = Math.min(plan[Math.max(0, k - 1)]?.t ?? 1, plan[Math.min(plan.length - 1, k)]?.t ?? 1);
    drift.push(bedWob ? 0 : (rng() - 0.5) * 0.3 * thin / rRef);
    amp.push(swell * 0.5 * thin);
  }
  /** Boundary k's height at a bearing (k = 0 the lowest bed's foot, k = plan.length the top bed's top), read half way
   * up the rock (a row refines it at its own face). The swell is periodic round the hill (no seam where it wraps). */
  const boundaryAt = (k: number, theta: number): number => level[k] + (bedWob
    ? bedWob(spec.x + Math.cos(theta) * rRef, spec.z + Math.sin(theta) * rRef)
    : (tanDip + drift[k]) * rRef * Math.cos(theta - dipAz)
      + amp[k] * noise.noise(Math.cos(theta) * rRef / 9 + k * 5.31, Math.sin(theta) * rRef / 9 - k * 2.17));
  /** Bed k's exposure along the girth, in [-1, 1]: it shows as its own rock where this clears its `show`. */
  const exposure = (k: number, theta: number): number =>
    noise.noise(Math.cos(theta) * rRef / 16 + k * 3.71 + 40, Math.sin(theta) * rRef / 16 - k * 1.33);
  /**
   * How far the ground at a height falls back into the hill on each ray against the foot line a few metres either side
   * (m): a cleft, the rill the weather cut down the wall, reads a metre or more (the maps lane's jebels: a 3-4 m cut
   * down a 70 degree wall falls back 0.6-2.2 m); a lobe's broad bay curves back far less over so short a run (Redrock's
   * smooth domes: no master cleft at 0.9 m). Past CLEFT_M a bed breaks off at the cleft's lips (it follows the cleft's
   * shoulders in a little), and the cleft's walls are the hill's own.
   */
  const CLEFT_M = 0.9;
  const recessAt = (y: (j: number) => number, rAt: number): Float32Array => {
    const e = new Float32Array(rays);
    for (let j = 0; j < rays; j++) e[j] = edge(j, y(j));
    const w = Math.max(2, Math.round((5 * rays) / (Math.PI * 2 * Math.max(3, rAt))));
    const out = new Float32Array(rays);
    for (let j = 0; j < rays; j++) {
      if (!Number.isFinite(e[j])) continue;
      let left = -Infinity, right = -Infinity;
      for (let d = 1; d <= w; d++) {
        const a = e[(j - d + rays) % rays], b = e[(j + d) % rays];
        if (Number.isFinite(a)) left = Math.max(left, a);
        if (Number.isFinite(b)) right = Math.max(right, b);
      }
      out[j] = Math.max(0, Math.min(left, right) - e[j]);
    }
    return out;
  };
  // the master joints: one in every cleft half way up the rock (a run of cleft rays is one cleft, its joint as wide as
  // the run's deep middle), and between them one every 10 to 18 m of the hill's girth; each parts every bed from the
  // crown to the foot
  const midK = Math.min(plan.length, Math.floor(plan.length / 2));
  const midRecess = recessAt((j) => boundaryAt(midK, rayAngle(j)) + (plan[midK]?.t ?? 0) * 0.5, rRef);
  const clefts: Array<[number, number]> = [];
  const deep = (j: number) => midRecess[(j + rays) % rays] > CLEFT_M;
  for (let j = 0; j < rays; j++) {
    if (!deep(j) || deep(j - 1)) continue;
    let n = 1;
    while (n < rays && deep(j + n)) n++;
    clefts.push([rayAngle(j + (n - 1) / 2), Math.max(cleftMax * 0.55, (n * Math.PI * 2 / rays) * rRef * 0.6)]);
  }
  if (!clefts.length) clefts.push([rng() * Math.PI * 2, cleftMax * (0.55 + rng() * 0.5)]);
  const master: Array<[number, number]> = []; // [angle, cleft width m], ascending
  for (let m = 0; m < clefts.length; m++) {
    const [a, w] = clefts[m];
    master.push([a, w]);
    const next = m + 1 < clefts.length ? clefts[m + 1][0] : clefts[0][0] + Math.PI * 2;
    // (a cleft is narrow enough that its own shaded walls fill it, not the sunlit slope behind)
    const parts = Math.max(1, Math.round(((next - a) * rRef) / (10 + rng() * 8)));
    for (let i = 1; i < parts; i++) master.push([a + (next - a) * (i + (rng() - 0.5) * 0.6) / parts, cleftMax * (0.55 + rng() * 0.5)]);
  }
  const masters = master.length;
  for (let k = 0; k < plan.length; k++) {
    const { t, soft: isSoft, layer, proud, batter, bev, stagger, show } = plan[k];
    let bs = 0, bn = 0;
    for (let j = 0; j < rays; j += 4) {
      const r = edge(j, (boundaryAt(k, rayAngle(j)) + boundaryAt(k + 1, rayAngle(j))) * 0.5);
      if (Number.isFinite(r)) { bs += r; bn++; }
    }
    if (!bn) continue;
    const rMean = Math.max(2, bs / bn);
    // the clefts this bed's foot runs into: the bed stops at their lips
    const recess = recessAt((j) => boundaryAt(k, rayAngle(j)) + t * 0.3, rMean);
    for (let m = 0; m < masters; m++) {
      const [aStart, wStart] = master[m], [aNext, wNext] = master[(m + 1) % masters];
      const spanStart = aStart + wStart * 0.5 / rMean;
      const spanEnd = (m + 1 < masters ? aNext : aNext + Math.PI * 2) - wNext * 0.5 / rMean;
      // the bed's own joints: tight, staggered from the bed below (a soft bed is one block per span)
      let theta = spanStart;
      let first = true;
      while (theta < spanEnd - 0.01) {
        let arc = isSoft ? Infinity : jMin + rng() * (jMax - jMin);
        if (first && !isSoft) { arc *= 0.3 + stagger * 0.7; first = false; }
        const tight = (0.05 + rng() * 0.09) / rMean;
        const t0 = theta, t1 = Math.min(theta + arc / rMean, spanEnd);
        theta = t1 + tight;
        if (spanEnd - t1 < (jMin * 0.4) / rMean) theta = spanEnd; // no sliver at the span's end
        const t1b = theta >= spanEnd ? spanEnd : t1;
        if (t1b <= t0) continue;
        // every block weathered back its own way, and set a little high or low on its bed (the beds are not courses)
        const p = proud * (0.6 + rng() * 0.8), lift = isSoft ? 0 : (rng() - 0.5) * 0.16;
        const n = Math.max(2, Math.ceil(((t1b - t0) * rMean) / segLen));
        // the profile at each sample, or null where the bed is not cut (gentle, unreachable, climbable or cleft ground)
        const rows: Array<number[] | null> = [];
        for (let i = 0; i <= n; i++) {
          const th = t0 + (t1b - t0) * (i / n);
          const [j0, j1, f] = rayAt(th);
          const shown = exposure(k, th) - show;
          if (recess[j0] + (recess[j1] - recess[j0]) * f > CLEFT_M || shown < 0) { rows.push(null); continue; }
          const c = Math.cos(th), sn = Math.sin(th);
          let b0 = boundaryAt(k, th) + lift, b1 = boundaryAt(k + 1, th) + lift;
          let r0 = edgeAt(th, b0), r1 = edgeAt(th, b1);
          if (bedWob && Number.isFinite(r0) && Number.isFinite(r1)) {
            // the terrain's bedY read where each boundary meets the ground, once refined
            b0 = level[k] + bedWob(spec.x + c * r0, spec.z + sn * r0) + lift; r0 = edgeAt(th, b0);
            b1 = level[k + 1] + bedWob(spec.x + c * r1, spec.z + sn * r1) + lift; r1 = edgeAt(th, b1);
          }
          const tt = b1 - b0;
          if (!Number.isFinite(r0) || !Number.isFinite(r1) || r0 < 1.5 || r0 - r1 > BEDROCK_BENCH || tt < 0.15 || b0 < climbAt(th) + BEDROCK_CLEAR) { rows.push(null); continue; }
          const wob = noise.noise(th * rMean * 0.35 + k * 3.1, b0 * 0.21) * 0.5 + 0.5;
          // (a ledge thins back into the wall toward the ends of its stretch)
          const pp = p * (0.8 + 0.4 * wob) * (0.3 + 0.7 * Math.min(1, shown / 0.22));
          const bulge = noise.noise(th * rMean * 0.9 - k * 1.7, b0 * 0.4 + 5) * 0.06 * tt;
          const row: number[] = [];
          for (const [r, y] of bedProfile(r0, r1, b0, b1, tt, pp, bulge, batter, bev)) row.push(spec.x + c * r, y, spec.z + sn * r);
          rows.push(row);
        }
        pushBedBlocks(rows, layer, pieces);
      }
    }
  }
  // the crown: the bare rock of the summit, one sheet laid over the cap above the last bed (its rim tucked into that
  // bed's bench), a little proud of the ground and swelling where the weather has left it
  // (it starts from the highest bed whose top rings most of the hill: a lobe's last beds run only along its saddle)
  let capK = -1;
  for (let k = plan.length; k >= 1 && capK < 0; k--) {
    let ring = 0;
    for (let j = 0; j < rays; j++) if (Number.isFinite(edge(j, boundaryAt(k, rayAngle(j))))) ring++;
    if (ring >= rays * 0.6) capK = k;
  }
  const capY = capK >= 0 ? level[capK] : NaN;
  if ((spec.crown ?? true) && Number.isFinite(capY)) {
    const rings = mobile ? 4 : 6;
    const rim = new Float32Array(rays);
    let ok = 0;
    for (let j = 0; j < rays; j++) { const r = edge(j, boundaryAt(capK, rayAngle(j))); rim[j] = Number.isFinite(r) ? Math.max(0, r - 0.4) : NaN; if (Number.isFinite(r)) ok++; }
    if (ok >= rays * 0.5) {
      // a ray with no rim (it runs on over a saddle) takes the nearest rims either side, so the sheet stays whole
      const known = Float32Array.from(rim);
      for (let j = 0; j < rays; j++) {
        if (Number.isFinite(known[j])) continue;
        let a = 1, b = 1;
        while (!Number.isFinite(known[(j - a + rays) % rays])) a++;
        while (!Number.isFinite(known[(j + b) % rays])) b++;
        rim[j] = (known[(j - a + rays) % rays] * b + known[(j + b) % rays] * a) / (a + b);
      }
      const positions: number[] = [], index: number[] = [];
      const peakY = groundAt(summitX, summitZ);
      positions.push(summitX, peakY + 0.45, summitZ);
      // (the sheet takes a bearing every 3 m or so of its rim, not every ray: the crown is smooth)
      const spokes = Math.min(rays, mobile ? 36 : 56);
      for (let k = 1; k <= rings; k++) {
        for (let j = 0; j < spokes; j++) {
          const a = (j / spokes) * Math.PI * 2, f = k / rings;
          const [j0, j1, w] = rayAt(a), rimA = rim[j0] + (rim[j1] - rim[j0]) * w;
          // the rays start at the authored centre; the sheet's rings start at the summit and reach each bearing's rim
          const x = summitX + (spec.x + Math.cos(a) * rimA - summitX) * f, z = summitZ + (spec.z + Math.sin(a) * rimA - summitZ) * f;
          const swell = (noise.noise(x * 0.11 + 7.3, z * 0.11 - 2.9) * 0.5 + 0.5) * 0.5 * (1 - f * f);
          positions.push(x, groundAt(x, z) + 0.3 + swell - (k === rings ? 0.25 : 0), z);
        }
      }
      const at = (k: number, j: number) => (k === 0 ? 0 : 1 + (k - 1) * spokes + (j % spokes));
      for (let j = 0; j < spokes; j++) index.push(at(0, 0), at(1, j + 1), at(1, j));
      for (let k = 1; k < rings; k++) {
        for (let j = 0; j < spokes; j++) index.push(at(k, j), at(k, j + 1), at(k + 1, j + 1), at(k, j), at(k + 1, j + 1), at(k + 1, j));
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      g.setIndex(index);
      pieces.push({ geometry: g, layer: 2 * hard, standing: false });
    }
  }
  const count = pieces.length;
  const geometry = count ? finish(pieces, spec.geology, spec.tone, ground, noise, spec.x * 0.017 - spec.z * 0.011) : null;
  if (geometry) {
    // desert varnish (Wadi Rum's walls): dark manganese streaks running straight down the faces from the ledges — a field
    // of the bearing alone, so a streak runs across the beds below it — a little cooler than the rock; none on the benches
    const pos = geometry.attributes.position, nor = geometry.attributes.normal, col = geometry.attributes.color;
    for (let v = 0; v < pos.count; v++) {
      if (Math.abs(nor.getY(v)) > 0.55) continue;
      const arc = Math.atan2(pos.getZ(v) - spec.z, pos.getX(v) - spec.x) * rRef;
      const field = noise.noise(arc * 0.45 + 17.3, 3.1) * 0.6 + noise.noise(arc * 1.7 - 4.7, 8.3) * 0.4;
      const streak = Math.min(1, Math.max(0, (field - 0.18) / 0.32));
      if (streak <= 0) continue;
      const dark = 1 - 0.42 * streak * streak * (3 - 2 * streak);
      col.setXYZ(v, col.getX(v) * dark * 0.97, col.getY(v) * dark * 0.98, col.getZ(v) * dark);
    }
  }
  const formation = strata?.formation;
  if (geometry && bedWob && formation) {
    // the map's two formations, as the terrain draws them on its rock: the paler below the boundary, the redder above,
    // the step one bed thick (smoothstep ±1.2 m in the beds' own height)
    const pos = geometry.attributes.position, col = geometry.attributes.color;
    const [lr, lg, lb] = formation.lower, [ur, ug, ub] = formation.upper;
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v), z = pos.getZ(v);
      const t = Math.min(1, Math.max(0, (pos.getY(v) - bedWob(x, z) - formation.boundaryAt(x, z) + 1.2) / 2.4));
      const u = t * t * (3 - 2 * t);
      col.setXYZ(v, col.getX(v) * (lr + (ur - lr) * u), col.getY(v) * (lg + (ug - lg) * u), col.getZ(v) * (lb + (ub - lb) * u));
    }
  }
  return { geometry, masses: [], pieces: count, triangles: geometry ? geometry.attributes.position.count / 3 : 0 };
}

type FormBuilder = (spec: RockFormationSpec, ground: RockGround, noise: SimplexNoise, rng: Rng, mobile: boolean, pieces: Piece[]) => void;
const FORMS: Readonly<Record<RockForm, FormBuilder>> = Object.freeze({
  tor: graniteTor, outcrop: beddedOutcrop, crag: slateCrag, pavement: limestonePavement, scree, hoodoo,
  menhir, cairn, calvary,
});

/**
 * Build one rock formation in world space. The stream `rng` is the formation's own; the noise field is shared and
 * read-only. Returns the welded vertex-coloured geometry, the standing masses' collision and the counts.
 */
export function buildRockFormation(
  spec: RockFormationSpec, ground: RockGround, noise: SimplexNoise, rng: Rng, { mobile = false }: RockBuildOptions = {},
): RockFormationBuild {
  const pieces: Piece[] = [];
  const { min } = lowestGround(ground, spec.x, spec.z, spec.radius);
  const form = FORMS[spec.form];
  if (!form) throw new Error(`sceneryRocks: unknown form ${spec.form}`);
  form(spec, ground, noise, rng, mobile, pieces);
  // a slate crag sheds scree below it; a sandstone or limestone outcrop sheds a little
  if (spec.form === 'crag' && (spec.shed ?? 1) > 0) {
    const [dx, dz] = downhill(ground, spec.x, spec.z, spec.radius);
    scree({ ...spec, x: spec.x + dx * spec.radius * 0.8, z: spec.z + dz * spec.radius * 0.8, radius: spec.radius * 1.4, shed: (spec.shed ?? 1) * 0.6 },
      ground, noise, rng, mobile, pieces);
  }
  const mass = massOf(pieces, ground, min);
  const count = pieces.length;
  const geometry = count ? finish(pieces, spec.geology, spec.tone, ground, noise, spec.x * 0.013 + spec.z * 0.007) : null;
  const triangles = geometry ? geometry.attributes.position.count / 3 : 0;
  return { geometry, masses: mass ? [mass] : [], pieces: count, triangles };
}
