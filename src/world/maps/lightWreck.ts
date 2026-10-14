// src/world/maps/lightWreck.ts — the settled wreck of any fracture-ready light kind (E1, the props census, 2026-10-14;
// the looks lane).
//
// The pillbox lays its wreck by its own hand (fortKit.ts, on FractureSettle); a light kind that carries an anatomy
// (craftAnatomy.ts) gets this one, laid from its pieces by their roles, in place of PROP_FRACTURE's flat raft (the
// owner's shed: "a flat, clean raft of boards ... much smaller than the building"):
//  1. what stands on the ground stays (footings and slabs whole; half the posts and studs — those on the side away from
//     the blow — broken off at staggered heights, a corner standing to half its height or more);
//  2. the walls swing over about their feet — the blown side's out and down the blow, the lee side's mostly in over the
//     heap — until they lie or lean on what stands;
//  3. the long members snap at their scores and each length lies near where it fell, turned and tipped;
//  4. the roof comes down together, its panels dropped onto the heap a little down the blow, its rafters snapped;
//  5. the small things (fittings, bags, a chimney) are thrown out of it;
// each break capped with the material's edge (splintered timber, torn sheet). Deterministic in its seed.

import * as THREE from 'three';
import type { DamageMeshWriter, FractureMaterial } from '../destructionKit.ts';
import type { FracturePiece, FractureRole, KitFractureAnatomy } from '../fractureAnatomy.ts';
import { FractureSettle, type SettleBody } from './fractureSettle.ts';

type V3 = [number, number, number];

function stream(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function quatRotate(q: readonly number[], v: V3): V3 {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

/** The colour of a fresh break by material (pale splinters, bright torn metal); null draws no cap (cloth tears open). */
const BREAK: Partial<Record<FractureMaterial, readonly [number, number, number]>> = {
  timber: [0.74, 0.6, 0.42], plank: [0.76, 0.63, 0.45], infill: [0.6, 0.52, 0.4], metal: [0.56, 0.56, 0.55],
  concrete: [0.62, 0.6, 0.56], brick: [0.58, 0.36, 0.26], stone: [0.6, 0.58, 0.54], rubble: [0.55, 0.52, 0.47],
  adobe: [0.6, 0.5, 0.38], plaster: [0.78, 0.76, 0.7], earth: [0.36, 0.28, 0.2], tile: [0.62, 0.36, 0.26], slate: [0.36, 0.38, 0.4],
};

/**
 * The edge of a light piece's break (SettleEdge): the piece's section at the score, its rim jagged — splinters standing
 * out of the − length's end toward +, the + length's the other way — fanned from the middle. Cloth and canvas draw none.
 */
export function lightEdge(material: FractureMaterial, piece: FracturePiece, score: number | 'whole', seed: number, out: DamageMeshWriter): void {
  const colour = BREAK[material];
  if (!colour || score === 'whole') return;
  const axis = piece.scoreAxis ?? (piece.h[0] >= piece.h[1] && piece.h[0] >= piece.h[2] ? 0 : piece.h[1] >= piece.h[2] ? 1 : 2);
  const others = ([0, 1, 2] as const).filter((k) => k !== axis);
  const ax = (k: number): V3 => quatRotate(piece.q, k === 0 ? [1, 0, 0] : k === 1 ? [0, 1, 0] : [0, 0, 1]);
  const A = ax(axis), B = ax(others[0]), C = ax(others[1]);
  const hb = piece.h[others[0]], hc = piece.h[others[1]];
  const centre: V3 = [piece.c[0] + A[0] * score, piece.c[1] + A[1] * score, piece.c[2] + A[2] * score];
  const rng = stream(seed);
  // the rim: eight points round the section (corners and mid-sides), each drawn in a little and splintered along A
  const rim: Array<[number, number]> = [[-1, -1], [1, -1], [1, 0], [1, 1], [-1, 1], [-1, 0]];
  const reach = material === 'timber' || material === 'plank' ? Math.min(0.09, 0.35 * Math.max(hb, hc) + 0.02) : 0.025;
  const jag = rim.map(([b, c]) => ({ b: b * hb * (0.82 + 0.16 * rng()), c: c * hc * (0.82 + 0.16 * rng()), s: reach * (0.25 + 0.75 * rng()) }));
  for (const sign of [1, -1]) {
    // sign +1: the − length's cap, facing +A, its splinters out toward +A; −1 the + length's
    if (!out.begin(piece.bucket, 'debris')) continue;
    const n: V3 = [A[0] * sign, A[1] * sign, A[2] * sign];
    const mid = out.vertex(centre[0], centre[1], centre[2], n[0], n[1], n[2], 0, 0, colour[0] * 0.92, colour[1] * 0.92, colour[2] * 0.92);
    const ids = jag.map((j, k) => {
      const s = (k % 2 ? 0.35 : 1) * j.s * sign;
      const p: V3 = [centre[0] + B[0] * j.b + C[0] * j.c + A[0] * s, centre[1] + B[1] * j.b + C[1] * j.c + A[1] * s, centre[2] + B[2] * j.b + C[2] * j.c + A[2] * s];
      const k2 = 0.85 + 0.25 * ((k * 37) % 7) / 7;
      return out.vertex(p[0], p[1], p[2], n[0], n[1], n[2], 0, 0, colour[0] * k2, colour[1] * k2, colour[2] * k2);
    });
    // the fan winds round +n for the − cap and round −n for the + cap
    const handed = (() => {
      const d = (B[1] * C[2] - B[2] * C[1]) * A[0] + (B[2] * C[0] - B[0] * C[2]) * A[1] + (B[0] * C[1] - B[1] * C[0]) * A[2];
      return d * sign > 0;
    })();
    for (let k = 0; k < ids.length; k++) {
      const a = ids[k], b = ids[(k + 1) % ids.length];
      if (handed) out.triangle(mid, a, b); else out.triangle(mid, b, a);
    }
    out.end();
  }
}

/** Roles by what the fall does with them. */
const GROUNDWORK: ReadonlySet<FractureRole> = new Set(['footing', 'slab']);
const UPRIGHT: ReadonlySet<FractureRole> = new Set(['post', 'stud']);
const PANEL: ReadonlySet<FractureRole> = new Set(['wall', 'board', 'sheet', 'door', 'shutter', 'frame']);
const ROOF: ReadonlySet<FractureRole> = new Set(['roof', 'rafter', 'purlin']);
const MEMBER: ReadonlySet<FractureRole> = new Set(['sill', 'plate', 'girt', 'brace']);

export interface LightWreckOptions {
  /** The ground under it in the prop frame (default flat at 0). */
  ground?: (x: number, z: number) => number;
  /** The wreck's colours times this (default 0.84: dust and soot). */
  dust?: number;
}

/**
 * The settled wreck of a light kind from its intact build and its anatomy (fractureAnatomy.ts; every piece laid, or
 * FractureSettle throws). Plain triangles: position, normal, uv and colour.
 */
export function settleLightWreck(intact: THREE.BufferGeometry, anatomy: KitFractureAnatomy, seed: number, opts: LightWreckOptions = {}): THREE.BufferGeometry {
  const S = new FractureSettle(intact, anatomy, { cell: 0.08, margin: 3, dust: opts.dust ?? 0.84, ground: opts.ground });
  const P = anatomy.pieces, idx = P.map((_p, i) => i);
  const rng = stream(seed ^ 0x51ed7);
  const r = (lo: number, hi: number): number => lo + (hi - lo) * rng();
  const az = rng() * Math.PI * 2;
  const blow: V3 = [Math.cos(az), 0, Math.sin(az)];
  // the building's plan, middle and height
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, top = 0;
  for (const p of P) {
    const e = Math.hypot(p.h[0], p.h[2]) * 0.7;
    x0 = Math.min(x0, p.c[0] - e); x1 = Math.max(x1, p.c[0] + e); z0 = Math.min(z0, p.c[2] - e); z1 = Math.max(z1, p.c[2] + e);
    top = Math.max(top, p.c[1] + Math.hypot(p.h[0], p.h[1], p.h[2]) * 0.7);
  }
  const mid: V3 = [(x0 + x1) / 2, 0, (z0 + z1) / 2];
  const outward = (c: readonly number[]): V3 => {
    const d: V3 = [c[0] - mid[0], 0, c[2] - mid[2]];
    const l = Math.hypot(d[0], d[2]);
    return l > 1e-3 ? [d[0] / l, 0, d[2] / l] : blow;
  };
  const lee = (c: readonly number[]): number => -(outward(c)[0] * blow[0] + outward(c)[2] * blow[2]);
  const tall = (p: FracturePiece): number => {
    const ys = [0, 1, 2].map((k) => Math.abs(quatRotate(p.q, k === 0 ? [1, 0, 0] : k === 1 ? [0, 1, 0] : [0, 0, 1])[1]) * p.h[k]);
    return 2 * Math.max(...ys);
  };
  const ceiling = Math.max(1.0, top * 0.72);
  // the snaps the wreck can afford (the r2 standard: the wreck within 1.5 x the intact triangles; a snap costs its
  // clipped faces and two capped ends, about 30 triangles): spent on the longest members first, the rest lie whole
  const intactTris = (intact.index ? intact.index.count : intact.getAttribute('position').count) / 3;
  let budget = Math.floor((0.42 * intactTris) / 30);
  const snapped = new Set<number>();
  for (const i of idx.filter((k) => (P[k].scores?.length ?? 0) > 0).sort((a, b) => Math.max(...P[b].h) - Math.max(...P[a].h))) {
    const cost = P[i].scores!.length;
    if (cost > budget) continue;
    budget -= cost;
    snapped.add(i);
  }
  const lengths = (i: number, salt: number): SettleBody[] => (snapped.has(i) ? S.snap(i, lightEdge, undefined, seed ^ Math.imul(i + 1, salt)) : [S.body([i])]);
  // 1. the groundwork stays; the uprights and walls on the lee side stand broken off, staggered (a corner standing)
  for (const i of idx) if (GROUNDWORK.has(P[i].role) && P[i].anchor) S.stay(i, 0.9);
  // (what stands on the ground or on the floor: an upright or a wall whose foot is within 0.6 m of the ground)
  const standing = idx.filter((i) => !S.isLaid(i) && UPRIGHT.has(P[i].role) && P[i].c[1] - tall(P[i]) / 2 < 0.6)
    .sort((a, b) => lee(P[b].c) - lee(P[a].c));
  const keep = new Set(standing.slice(0, Math.max(2, Math.ceil(standing.length * 0.5))));
  for (const i of standing) {
    if (!keep.has(i)) continue;
    const p = P[i], foot = p.c[1] - tall(p) / 2, h = tall(p);
    const frac = r(0.45, 0.85), wander = r(0.08, 0.22), phase = r(0, 6.28);
    S.cut(i, (x, z) => foot + h * frac + Math.sin(x * 9.1 + z * 7.3 + phase) * wander * h * 0.3, 0.9);
  }
  // 2. the rest of the uprights and the walls go over about their feet, outward (the blown side down the blow)
  for (const i of idx) {
    if (S.isLaid(i)) continue;
    const p = P[i];
    if (!(UPRIGHT.has(p.role) || PANEL.has(p.role)) || tall(p) < 0.6) continue;
    // the blown side goes out and down the blow; the lee side falls in over the heap, leaning on what stands
    const out = outward(p.c), struck = lee(p.c) < 0;
    const d: V3 = struck ? [out[0] * 0.6 + blow[0] * 0.4, 0, out[2] * 0.6 + blow[2] * 0.4] : rng() < 0.6 ? [-out[0], 0, -out[2]] : out;
    if (UPRIGHT.has(p.role) && snapped.has(i)) {
      for (const b of lengths(i, 0x2f6b)) {
        S.lie(b, Math.atan2(d[2], d[0]) + r(-0.7, 0.7), [d[0] * r(0.2, 1.0), 0, d[2] * r(0.2, 1.0)], false, r(0, Math.PI), { ceiling, maxTilt: 1.0 });
      }
      continue;
    }
    S.topple(S.body([i]), d, r(1.25, 1.55), { ceiling, maxTilt: 1.2 });
  }
  // 3. the roof together: its panels dropped on the heap a little down the blow, its rafters and purlins snapped
  S.together(() => {
    for (const i of idx) {
      if (S.isLaid(i) || !ROOF.has(P[i].role)) continue;
      const p = P[i];
      if (p.role === 'roof') {
        const b = S.body([i]);
        S.drop(b, r(-0.35, 0.35), [blow[0] * r(0.2, 0.9), 0, blow[2] * r(0.2, 0.9)], { ceiling, maxTilt: 0.9 });
      } else {
        for (const b of lengths(i, 0x45d9)) {
          const ax = b.axes[p.scoreAxis ?? 0];
          S.lie(b, Math.atan2(ax[2], ax[0]) + r(-0.5, 0.5), [blow[0] * r(0, 0.8), 0, blow[2] * r(0, 0.8)], false, r(0, Math.PI), { ceiling, maxTilt: 0.9 });
        }
      }
    }
  });
  // 4. the horizontal members snapped where they hung; the small things thrown out of the heap
  for (const i of idx) {
    if (S.isLaid(i)) continue;
    const p = P[i], out = outward(p.c);
    if (MEMBER.has(p.role) || UPRIGHT.has(p.role) || PANEL.has(p.role)) {
      for (const b of lengths(i, 0x6c8b)) {
        const ax = b.axes[p.scoreAxis ?? 0];
        S.lie(b, Math.atan2(ax[2], ax[0]) + r(-0.6, 0.6), [out[0] * r(0, 0.7), 0, out[2] * r(0, 0.7)], false, r(0, Math.PI), { ceiling, maxTilt: 1.0 });
      }
    } else if (p.role === 'fitting' || p.role === 'bag' || p.role === 'chimney') {
      for (const b of S.scatter(i)) S.lie(b, r(0, Math.PI * 2), [out[0] * r(0.4, 1.6) + r(-0.3, 0.3), 0, out[2] * r(0.4, 1.6) + r(-0.3, 0.3)], rng() < 0.3, r(-0.5, 0.5), { ceiling });
    } else {
      S.drop(S.body([i]), r(-0.4, 0.4), [out[0] * r(0, 0.5), 0, out[2] * r(0, 0.5)], { ceiling });
    }
  }
  return S.finish();
}
