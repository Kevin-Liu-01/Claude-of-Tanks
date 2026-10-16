// src/world/maps/regional/rubblePile.ts — the street rubble pile (props.ts addRubblePile; the collapsed rowhouse slots'
// spill), extracted from ruinGrammar.ts as it was (the looks lane's r2 sweep, sub-stream b-east, 2026-10-16: lane B is
// parked, so its builder is taken extract-then-own) for this lane to rebuild on the r2 standard.
import * as THREE from 'three';
import { box, jitterUV } from '../../propGeometry.ts';

const _rubbleOff = new Float32Array(24);
/**
 * A box roughened into an irregular broken-masonry hexahedron: each of its eight corners moved by its own offset (shared
 * corners move together, so the faces stay welded). Draws 24 numbers from `rrng`.
 */
export function roughenChunk<T extends THREE.BufferGeometry>(chunk: T, rrng: () => number, amt: number): T {
  for (let c = 0; c < 8; c++) {
    _rubbleOff[c * 3] = (rrng() - 0.5) * amt;
    _rubbleOff[c * 3 + 1] = (rrng() - 0.5) * amt * 0.7;
    _rubbleOff[c * 3 + 2] = (rrng() - 0.5) * amt;
  }
  const cp = chunk.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const ci = (cp.getX(i) > 0 ? 1 : 0) + (cp.getY(i) > 0 ? 2 : 0) + (cp.getZ(i) > 0 ? 4 : 0);
    cp.setXYZ(i, cp.getX(i) + _rubbleOff[ci * 3], cp.getY(i) + _rubbleOff[ci * 3 + 1],
      cp.getZ(i) + _rubbleOff[ci * 3 + 2]);
  }
  chunk.computeVertexNormals();
  return chunk;
}

/**
 * A street rubble pile's pieces at (x, y, z), `pr` across: heaped masonry chunks of three classes (blocks, wall slabs,
 * brick clumps) over a ring of brick shards feathering it into the ground, and a charred beam jutting out of most.
 * Drawn from `rrng` exactly as props.ts drew them (the pile's draws feed the street's next candidates). `chunks`: how many
 * of the stone pieces (the first) are the heap's chunks, before the shards.
 */
export function rubblePileParts(x: number, y: number, z: number, pr: number, rrng: () => number): { stone: THREE.BufferGeometry[]; wood: THREE.BufferGeometry[]; chunks: number } {
  const stone: THREE.BufferGeometry[] = [], wood: THREE.BufferGeometry[] = [];
  const n = 6 + ((rrng() * 5) | 0);
  for (let k = 0; k < n; k++) {
    const a = rrng() * Math.PI * 2, rr = Math.sqrt(rrng()) * pr;
    const cs = 0.35 + rrng() * 0.8;
    // mix chunk classes: blocky masonry / flat slab / brick-proportioned
    const cls = rrng();
    const chunk = cls < 0.55
      ? box(cs, cs * (0.5 + rrng() * 0.5), cs * (0.6 + rrng() * 0.6), 0.9)
      : cls < 0.8
        ? box(cs * 1.3, cs * 0.22, cs * (0.8 + rrng() * 0.5), 0.9)   // wall slab
        : box(cs * 0.7, cs * 0.3, cs * 0.35, 0.9);                    // brick clump
    roughenChunk(chunk, rrng, cs * 0.34);
    jitterUV(chunk, rrng);
    chunk.rotateY(rrng() * Math.PI);
    chunk.rotateX((rrng() - 0.5) * 0.5);
    chunk.translate(x + Math.cos(a) * rr, y + 0.12 + (1 - rr / pr) * pr * 0.35, z + Math.sin(a) * rr);
    stone.push(chunk);
  }
  // brick-shard apron: small debris feathering the pile into the ground
  for (let k = 0; k < 7; k++) {
    const a = rrng() * Math.PI * 2, rr = pr * (0.8 + rrng() * 0.6);
    const bs = 0.10 + rrng() * 0.16;
    const shard = roughenChunk(box(bs * 1.7, bs * 0.7, bs, 1.2), rrng, bs * 0.4);
    shard.rotateY(rrng() * Math.PI);
    shard.translate(x + Math.cos(a) * rr, y + 0.05, z + Math.sin(a) * rr);
    stone.push(shard);
  }
  if (rrng() < 0.6) { // charred beam jutting out
    const beam = box(0.14, 0.14, 2.2 + rrng() * 1.4, 1.0);
    beam.rotateX(-0.5 - rrng() * 0.4);
    beam.rotateY(rrng() * Math.PI * 2);
    beam.translate(x, y + pr * 0.4, z);
    wood.push(beam);
  }
  // (props census #7, lane B 2026-10-14; the judges: "loose boxes on the road, no body to the heap") the heap's fill
  // body under its chunks — sunk at its edge, its crown under the chunks' — and the other chunk classes bedded in it:
  // brick courses still bonded, planks, all from the pile's own seat (a hash of it: the street stream is never drawn)
  const h = seatStream(x, z);
  stone.push(fillBody(x, y, z, pr, h));
  for (let k = 0; k < 3; k++) {
    const a = h() * Math.PI * 2, rr = (0.25 + h() * 0.6) * pr, bl = 0.6 + h() * 0.5;
    const course = roughenChunk(box(bl, 0.16, 0.24, 0.9), h, 0.05);
    course.rotateZ((h() - 0.5) * 0.6);
    course.rotateY(h() * Math.PI);
    course.translate(x + Math.cos(a) * rr, y + fillAt(rr / pr, pr) - 0.05, z + Math.sin(a) * rr);
    stone.push(course);
  }
  for (let k = 0; k < 2; k++) {
    const a = h() * Math.PI * 2, rr = (0.2 + h() * 0.5) * pr, len = 1.0 + h() * 0.8;
    const plank = box(len, 0.05, 0.2, 1.0);
    plank.rotateZ(-0.35 - h() * 0.4);
    plank.rotateY(h() * Math.PI * 2);
    plank.translate(x + Math.cos(a) * rr, y + fillAt(rr / pr, pr) + 0.1, z + Math.sin(a) * rr);
    wood.push(plank);
  }
  return { stone, wood, chunks: n };
}

/** A deterministic stream from a seat (its position to the centimetre): no draw from the street's stream. */
function seatStream(x: number, z: number): () => number {
  let a = (Math.imul(Math.round(x * 100), 73856093) ^ Math.imul(Math.round(z * 100), 19349663)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The fill's height over the seat at a fraction `s` of the pile's radius out from its middle. */
function fillAt(s: number, pr: number): number {
  return Math.max(0, pr * 0.42 * (1 - s * s));
}

/** The heap's fill body: a low mound of rings out from its crown, its edge sunk 0.6 m (a slope's fall stays covered). */
function fillBody(x: number, y: number, z: number, pr: number, h: () => number): THREE.BufferGeometry {
  const seg = 10, rings: Array<[number, number]> = [[0.3, fillAt(0.3, pr)], [0.6, fillAt(0.6, pr)], [0.9, fillAt(0.9, pr) + 0.04], [1.18, -0.6]];
  const pos: number[] = [], idx: number[] = [];
  pos.push(x, y + fillAt(0, pr) + 0.02, z);
  const jit = Array.from({ length: seg }, () => 0.85 + h() * 0.3);
  for (const [s, hy] of rings) {
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2, r = s * pr * jit[j];
      pos.push(x + Math.cos(a) * r, y + hy * (s < 1.1 ? jit[j] : 1), z + Math.sin(a) * r);
    }
  }
  for (let j = 0; j < seg; j++) idx.push(0, 1 + ((j + 1) % seg), 1 + j);
  for (let r = 0; r + 1 < rings.length; r++) {
    const a0 = 1 + r * seg, b0 = 1 + (r + 1) * seg;
    for (let j = 0; j < seg; j++) {
      const j1 = (j + 1) % seg;
      idx.push(a0 + j, a0 + j1, b0 + j1, a0 + j, b0 + j1, b0 + j);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const uv: number[] = [];
  for (let i = 0; i < pos.length; i += 3) uv.push(pos[i] * 0.5, pos[i + 2] * 0.5);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
