// src/world/maps/frozenRiverBanks.ts — the frozen river's banks (the looks lane; Frosthollow's Biały Dunajec, goral's one
// ice ribbon down the valley, maps/winter.ts RIVER).
//
// 226 (the reeds pair's critics, 2026-10-15: "lone tan sticks scattered on dry snow up to 4.8 m from the ice"): the reed
// beds stand AT the waterline. Along the banks, in stretches (a bed every few stations, the bank bare between), each bed a
// cluster of clumps within a metre and a half of the ice's edge and a little into its margin:
//   - cattail stands — tall round stems, each with its brown seed spike near the top under a cap of snow, and long blades
//     arching from their feet;
//   - sedge tussocks — a dense fountain of fine blades over a snow-covered crown;
//   - the stems standing in the ice frozen in, a collar of ice round each foot;
//   - the shore-ice shelf: broken plates heaved up against the bank along the edge, overlapping, the pressure ridge a
//     river's ice builds where it meets its banks.
// Soft dressing, no collision record. The stream: every station's draws are spent whether or not its points are clear,
// so the bed is the same whatever the terrain. The edge is the union of the channel's stations' discs (their radii at
// 0.96, the shoreline the terrain draws): a point's signed distance to it is the least of its distances to their rims.

import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { jitterUV } from '../propGeometry.ts';

type Rng = () => number;
interface BankField {
  getHeightAt(x: number, z: number): number;
  _roadDist(x: number, z: number): number;
}
interface BankBuckets {
  straw: THREE.BufferGeometry[];
  plaster: THREE.BufferGeometry[];
  wood: THREE.BufferGeometry[];
}
interface Station { x: number; z: number; r: number }

/** The channel's shoreline in its stations' radii (maps/winter.ts RIVER radii). */
const ICE = 0.96;
/** The reed band: from this far into the ice's margin to this far up the bank (m). */
const BAND_IN = -0.6, BAND_OUT = 1.5;

function surface(name: string, pos: number[], uv: number[], index: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.name = name;
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/**
 * A round stem from its foot at the origin: two rings of three sides (the seam doubled), tapering to a point at `height`,
 * its tip carried `bend` (x, z per metre of height) along a parabola (nine corners: a bank of them stays within the kit's
 * storage ceiling).
 */
function stem(name: string, height: number, width: number, bendX: number, bendZ: number, twist: number): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], index: number[] = [];
  const rings = [0, 0.62];
  rings.forEach((t) => {
    const radius = width * 0.5 * (1 - t * 0.55);
    for (let side = 0; side <= 3; side++) {
      const a = twist + side * Math.PI * 2 / 3;
      pos.push(Math.cos(a) * radius + bendX * height * t * t, height * t, Math.sin(a) * radius + bendZ * height * t * t);
      uv.push(side * width, height * t * 2);
    }
  });
  const tip = pos.length / 3;
  pos.push(bendX * height, height, bendZ * height); uv.push(2 * width, height * 2);
  for (let ring = 0; ring + 1 < rings.length; ring++) for (let side = 0; side < 3; side++) {
    const a = ring * 4 + side, b = a + 4;
    index.push(a, b, a + 1, a + 1, b, b + 1);
  }
  for (let side = 0; side < 3; side++) { const a = (rings.length - 1) * 4 + side; index.push(a, tip, a + 1); }
  return surface(name, pos, uv, index);
}

/** A flat blade from its foot: `len` long, `width` at the foot, arching `arch` (rad) over along its heading `yaw`. */
function blade(name: string, len: number, width: number, arch: number, yaw: number, twist: number): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], index: number[] = [];
  const n = 2;
  let x = 0, y = 0;
  for (let k = 0; k <= n; k++) {
    const t = k / n, half = width * 0.5 * (1 - t * 0.85);
    pos.push(x, y, -half, x, y, half);
    uv.push(0, t * len * 2, width, t * len * 2);
    const a = (Math.PI / 2) - arch * (t + 0.5 / n);
    x += Math.cos(a) * len / n; y += Math.sin(a) * len / n;
  }
  for (let k = 0; k < n; k++) { const a = k * 2; index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = surface(name, pos, uv, index);
  g.rotateX(twist);
  g.rotateY(yaw);
  return g;
}

/** A small mound, flattened: a sedge's snowy crown or an ice collar round a frozen-in foot (two rings, a crown point). */
function mound(name: string, r: number, h: number, segments = 6): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, Math.min(segments, 6), 2, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(1, h / r, 1);
  g.name = name;
  return g;
}

/**
 * A plate of the shore ice as the river breaks it (r2, 2026-10-16: the sweep read the shelf's plates plain boxes): an
 * irregular six-sided slab `w` along the edge, `dep` across the bank and `th` thick, centred as the box it replaced and
 * inside its w x dep plan, its broken outline from a hash of where it lies (`seed`), never the stream; flat faces, its
 * uvs a plate's width across each face as the box's were.
 */
function shelfPlate(w: number, th: number, dep: number, seed: number): THREE.BufferGeometry {
  const j = (k: number): number => {
    let q = Math.imul(seed ^ Math.imul(k, 0x9e3779b1), 0x85ebca6b);
    q ^= q >>> 13; q = Math.imul(q, 0xc2b2ae35); q ^= q >>> 16;
    return (q >>> 0) / 4294967296;
  };
  const hw = w / 2, hd = dep / 2, hy = th / 2;
  const ring: Array<[number, number]> = [
    [-hw + w * 0.18 * j(1), -hd], [hw * (0.3 + 0.45 * j(2)), -hd + dep * 0.14 * j(3)], [hw, -hd * (0.1 + 0.5 * j(4))],
    [hw - w * 0.22 * j(5), hd], [-hw * (0.1 + 0.5 * j(6)), hd - dep * 0.16 * j(7)], [-hw, hd * (0.15 + 0.55 * j(8))],
  ];
  const pos: number[] = [], uv: number[] = [];
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Vector3();
  const tri = (a: THREE.Vector3, b: THREE.Vector3, d: THREE.Vector3, out: THREE.Vector3, ua: number[], ub: number[], ud: number[]): void => {
    e1.subVectors(b, a); e2.subVectors(d, a);
    const ok = n.crossVectors(e1, e2).dot(out) >= 0;
    for (const [q, t] of (ok ? [[a, ua], [b, ub], [d, ud]] : [[a, ua], [d, ud], [b, ub]]) as Array<[THREE.Vector3, number[]]>) {
      pos.push(q.x, q.y, q.z); uv.push(t[0], t[1]);
    }
  };
  const P = (k: number, y: number) => new THREE.Vector3(ring[k % 6][0], y, ring[k % 6][1]);
  // the broken sides, each wound out from the slab's middle
  for (let k = 0; k < 6; k++) {
    const a0 = P(k, -hy), a1 = P(k + 1, -hy), b1 = P(k + 1, hy), b0 = P(k, hy);
    c.set((a0.x + a1.x) / 2, 0, (a0.z + a1.z) / 2);
    const u0 = k / 6, u1 = (k + 1) / 6;
    tri(a0, a1, b1, c, [u0, 0], [u1, 0], [u1, 1]);
    tri(a0, b1, b0, c, [u0, 0], [u1, 1], [u0, 1]);
  }
  // its top and its underside
  const faces = THREE.ShapeUtils.triangulateShape(ring.map(([x, z]) => new THREE.Vector2(x, z)), []);
  for (const [y, out] of [[hy, new THREE.Vector3(0, 1, 0)], [-hy, new THREE.Vector3(0, -1, 0)]] as const) {
    for (const [a, b, d] of faces) {
      const t = (k: number) => [ring[k][0] / w + 0.5, ring[k][1] / dep + 0.5];
      tri(P(a, y), P(b, y), P(d, y), out, t(a), t(b), t(d));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return mergeVertices(g);
}

/** A seed spike's cap of snow: a low four-sided cone, open beneath (the spike's top under it). */
function snowCap(r: number, h: number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, h, 3, 1, true);
  g.translate(0, h / 2, 0);
  g.name = 'winter-cattail-cap';
  return g;
}

export function dressFrozenRiverBanks(stations: readonly Station[], field: BankField, rng: Rng, buckets: BankBuckets): void {
  if (stations.length < 2) return;
  // the signed distance to the ice's edge: negative on the ice
  const edge = (x: number, z: number): number => {
    let d = Infinity;
    for (const s of stations) d = Math.min(d, Math.hypot(x - s.x, z - s.z) - s.r * ICE);
    return d;
  };
  const clear = (x: number, z: number, roads = 6): boolean =>
    Math.max(Math.abs(x), Math.abs(z)) <= 480 && field._roadDist(x, z) >= roads;
  const inBand = (d: number): boolean => d >= BAND_IN && d <= BAND_OUT;
  // the beds come in stretches down each bank: a slow wave along the channel with a draw of its own per bank
  const phase = [rng() * Math.PI * 2, rng() * Math.PI * 2];
  for (let i = 0; i < stations.length; i++) {
    const s = stations[i], a = stations[Math.max(0, i - 1)], b = stations[Math.min(stations.length - 1, i + 1)];
    const tl = Math.hypot(b.x - a.x, b.z - a.z) || 1, tx = (b.x - a.x) / tl, tz = (b.z - a.z) / tl;
    for (const [bank, side] of [[0, -1], [1, 1]] as const) {
      const nx = -tz * side, nz = tx * side;
      const at = (out: number, along: number): [number, number] =>
        [s.x + nx * (s.r * ICE + out) + tx * along, s.z + nz * (s.r * ICE + out) + tz * along];
      const bed = Math.sin(i * 0.23 + phase[bank]) + Math.sin(i * 0.071 + phase[bank] * 1.7) * 0.6;
      // the shore-ice shelf, everywhere along the edge: plates heaved against the bank, overlapping
      const plates = 1 + ((rng() * 2) | 0);
      for (let k = 0; k < plates; k++) {
        const along = (rng() - 0.5) * s.r * 0.55, out = -0.2 - rng() * 1.1;
        const w = 0.8 + rng() * 1.3, dep = 0.5 + rng() * 0.7, th = 0.06 + rng() * 0.08;
        const heave = 0.18 + rng() * 0.35, roll = (rng() - 0.5) * 0.3, yawJ = (rng() - 0.5) * 0.5;
        const [px, pz] = at(out, along);
        if (!clear(px, pz) || edge(px, pz) > 0.3) continue;
        const plate = shelfPlate(w, th, dep, (Math.imul(Math.round(px * 100), 73856093) ^ Math.imul(Math.round(pz * 100), 19349663) ^ k) | 0);
        plate.name = 'winter-shore-shelf';
        // heaved: its bank side up, set on the ice where it lies
        // (its depth across the bank: the heave lifts its bank side, its width along the edge)
        plate.rotateX(-heave); plate.rotateZ(roll);
        plate.rotateY(Math.atan2(nx, nz) + yawJ);
        // seated: its lowest corner against the ground under it 3 cm down, wherever on the bank's slope that corner is
        plate.translate(px, 0, pz);
        const pp = plate.getAttribute('position');
        let seat = Infinity;
        for (let v = 0; v < pp.count; v++) seat = Math.min(seat, pp.getY(v) - field.getHeightAt(pp.getX(v), pp.getZ(v)));
        plate.translate(0, -seat - 0.03, 0);
        buckets.plaster.push(jitterUV(plate, rng));
      }
      // the reed bed: in its stretch, a few clumps along the station's reach, at the waterline
      const clumps = bed > 0.08 ? 2 + ((rng() * 3) | 0) : 0;
      if (!clumps) continue;
      for (let c = 0; c < clumps; c++) {
        const along = (rng() - 0.5) * s.r * 0.6, out = -0.3 + rng() * 1.3;
        const [cx, cz] = at(out, along);
        const kind = rng() < 0.55 ? 'cattail' : 'sedge';
        const ok = clear(cx, cz) && inBand(edge(cx, cz));
        if (kind === 'cattail') {
          const n = 5 + ((rng() * 5) | 0);
          let frozen = 0;
          for (let k = 0; k < n; k++) {
            const h = 1.15 + rng() * 0.75, w = 0.016 + rng() * 0.008;
            const bx = (rng() - 0.5) * 0.3, bz = (rng() - 0.5) * 0.3;
            const u = (rng() - 0.5) * 1.8, v = (rng() - 0.5) * 0.7;
            const spike = rng() < 0.55, twist = rng() * Math.PI;
            const fx = cx + tx * u + nx * v, fz = cz + tz * u + nz * v;
            const d = edge(fx, fz);
            if (!ok || !inBand(d)) continue;
            const y = field.getHeightAt(fx, fz) - 0.06;
            const st = stem('winter-cattail', h, w, bx, bz, twist).translate(fx, y, fz);
            buckets.straw.push(st);
            if (spike) {
              // the seed spike just under the tip, along the stem's top, under its cap of snow
              const len = 0.17 + h * 0.05, top = 0.8 + 0.06;
              const sx = fx + bx * h * top * top, sy = y + h * top, sz = fz + bz * h * top * top;
              const dx = 2 * bx * top, dz = 2 * bz * top, dl = Math.hypot(dx, 1, dz);
              const head = new THREE.CylinderGeometry(0.025, 0.027, len, 4, 1, true);
              head.name = 'winter-cattail-head';
              head.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / dl, 1 / dl, dz / dl)));
              head.translate(sx, sy, sz);
              buckets.wood.push(head);
              const cap = snowCap(0.034, 0.03);
              cap.translate(sx + dx / dl * len / 2, sy + len / (2 * dl), sz + dz / dl * len / 2);
              buckets.plaster.push(cap);
            }
            if (d < 0.15) frozen++;
            // the stand's long blades from the feet of its first stems
            // (the stand's mass is its leaves: two long blades arching from each of its first three stems' feet)
            if (k < 3) {
              for (let j = 0; j < 2; j++) {
                const bl = blade('winter-cattail-leaf', 0.75 + h * 0.5 - j * 0.2, 0.034, 0.35 + k * 0.18 + j * 0.25, twist + k * 2.1 + j * 2.9, (j - 0.5) * 0.5);
                buckets.straw.push(bl.translate(fx, y + 0.02, fz));
              }
            }
          }
          if (ok && frozen) {
            const collar = mound('winter-ice-collar', 0.5 + frozen * 0.06, 0.07, 8);
            collar.translate(cx, field.getHeightAt(cx, cz) - 0.03, cz);
            buckets.plaster.push(collar);
          }
        } else {
          // a sedge tussock: a dense fountain of fine blades over its crown, the crown under snow
          const n = 8 + ((rng() * 5) | 0), r = 0.16 + rng() * 0.12;
          const d = edge(cx, cz);
          const y = field.getHeightAt(cx, cz);
          for (let k = 0; k < n; k++) {
            const len = 0.38 + rng() * 0.42, arch = 0.5 + rng() * 0.8, yaw = rng() * Math.PI * 2;
            const reach = r * rng(), lean = (rng() - 0.5) * 0.5;
            const ox = Math.cos(yaw) * reach, oz = Math.sin(yaw) * reach;
            if (!ok || !inBand(edge(cx + ox, cz + oz))) continue;
            buckets.straw.push(blade('winter-sedge', len, 0.018, arch, yaw, lean).translate(cx + ox, y - 0.03, cz + oz));
          }
          if (ok) {
            const crown = mound(d < 0.15 ? 'winter-ice-collar' : 'winter-sedge-crown', r + 0.08, 0.12, 7);
            crown.translate(cx, y - 0.04, cz);
            buckets.plaster.push(crown);
          }
        }
      }
    }
  }
}
