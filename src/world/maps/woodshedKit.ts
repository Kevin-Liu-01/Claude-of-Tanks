// src/world/maps/woodshedKit.ts — the plan woodshed (makeWoodshed), moved out of villageKit.ts byte for byte (props
// census #17, the looks lane's vernacular sub-stream, 2026-10-15; the coordinator's extract-then-own grant). It is the
// plan:woodshed fallback and the Garage's 'field stores' and 'winter stores' (src/ui/garageEnvironmentRecipes.ts).

import * as THREE from 'three';
import { box, pitchRoofPlane, scaleUV, slabBox } from '../propGeometry.ts';
import type { GeometryBuckets, StructureDimensions } from './exteriorDetailKit.ts';

interface BuildingParts {
  [name: string]: THREE.BufferGeometry[];
  plaster: THREE.BufferGeometry[];
  plaster2: THREE.BufferGeometry[];
  plaster3: THREE.BufferGeometry[];
  stone: THREE.BufferGeometry[];
  roof: THREE.BufferGeometry[];
  wood: THREE.BufferGeometry[];
  dark: THREE.BufferGeometry[];
  glass: THREE.BufferGeometry[];
  curtain: THREE.BufferGeometry[];
}

function pushParts(buckets: GeometryBuckets, parts: BuildingParts): void {
  for (const key of Object.keys(parts)) {
    const target = buckets[key];
    if (!target) continue;
    for (const geometry of parts[key]) target.push(geometry);
  }
}
function newParts(): BuildingParts {
  return { plaster: [], plaster2: [], plaster3: [], stone: [], roof: [], wood: [], dark: [], glass: [], curtain: [] };
}

/** A straight member from a to b, `w` x `h` in section (its broad face up where it can), its long axis a to b. */
function beam(a: readonly [number, number, number], b: readonly [number, number, number], w: number, h: number): THREE.BufferGeometry {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz);
  const geo = box(w, h, len, 0.6);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(dx / len, dy / len, dz / len)));
  return geo.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
}

/**
 * Open-front woodshed (the props census #17, 2026-10-15, the judges on plan:woodshed: "the generic makeWoodshed itself
 * must also be rebuilt — framed open shed: sill on pads, posts with knee braces, wall plate and rafters, separate boards,
 * a coursed roof, the log-end pile — because the garage's field_shed and repair_bunker environments build it directly"):
 * stone pads under the posts, sills along the back and the ends, the corner and middle posts, the wall plate low at the
 * back and the beam high over the open front (+x) on their knee braces, the rafters under the plank deck with their
 * tails, the shingle courses on it, separate vertical boards with gaps on three sides cut to the roof's slope, the logs
 * stacked in the bay with their ends out.
 *
 * Its draws are the old shed's, exactly (props.ts's placement stream): two for its size, one a log for the two rows of
 * logs; and of its parts as many take the four uv-jitter draws each as the old shed's did (the logs, the deck and ten
 * members, those ten 'consume': their uvs stay); every other part is new and takes none.
 */
export function makeWoodshed(rng: () => number, buckets: GeometryBuckets): StructureDimensions {
  const w = 3.6 + rng() * 0.8, d = 4.6 + rng() * 1.0;
  const hLo = 2.0, hHi = 2.8;
  const parts = newParts();
  const fresh: THREE.BufferGeometry[] = [];
  const put = (list: THREE.BufferGeometry[], geo: THREE.BufferGeometry): THREE.BufferGeometry => { list.push(geo); fresh.push(geo); return geo; };
  // the deck rises from the low back to the high open front (the old shed's roof slab, its underside here)
  const pitch = Math.atan2(hHi - hLo, w + 0.7);
  const under = (x: number): number => (hLo + hHi) / 2 + 0.22 + (x - 0.1) * Math.tan(pitch) - 0.055 / Math.cos(pitch) + 0.02;
  const s = 0.14, padTop = 0.2, sillTop = 0.34, xb = -w / 2 + s / 2, xf = w / 2 - s / 2;
  const zs = [-d / 2 + s / 2, 0, d / 2 - s / 2];
  // the pads, the sills on them (the back's and the ends'), the posts: the back on its sill, the front on its pads
  for (const x of [xb, xf]) for (const z of zs) put(parts.stone, box(0.34, 0.5, 0.34).translate(x, padTop - 0.25, z));
  put(parts.wood, box(s, sillTop - padTop, d).translate(xb, (padTop + sillTop) / 2, 0));
  for (const sz of [-1, 1]) put(parts.wood, box(w - 2 * s, sillTop - padTop, s).translate(0, (padTop + sillTop) / 2, sz * (d / 2 - s / 2)));
  const plate = 0.16, backTop = under(xb - s / 2) - 0.12, frontTop = under(xf - s / 2) - 0.12;
  for (const z of zs) put(parts.wood, box(s, backTop - plate - sillTop, s).translate(xb, (sillTop + backTop - plate) / 2, z));
  for (const z of zs) put(parts.wood, box(s, frontTop - plate - padTop, s).translate(xf, (padTop + frontTop - plate) / 2, z));
  put(parts.wood, box(s + 0.02, plate, d).translate(xb, backTop - plate / 2, 0));
  put(parts.wood, box(s + 0.02, plate, d).translate(xf, frontTop - plate / 2, 0));
  // knee braces from the front posts to the beam
  for (const z of zs) for (const dir of [-1, 1]) {
    const zt = z + dir * 0.6;
    if (Math.abs(zt) > d / 2 - s) continue;
    put(parts.wood, beam([xf - 0.02, frontTop - plate - 0.6, z + dir * s / 2], [xf - 0.02, frontTop - plate, zt], 0.08, 0.08));
  }
  // the rafters under the deck, their tails out past the plates
  for (let k = 0, n = Math.max(4, Math.round(d / 0.7)); k <= n; k++) {
    const z = -d / 2 + s / 2 + (d - s) * k / n, x0 = -w / 2 - 0.3, x1 = w / 2 + 0.3;
    put(parts.wood, beam([x0, under(x0) - 0.065, z], [x1, under(x1) - 0.065, z], 0.07, 0.12));
  }
  // the deck (the old roof slab, its four draws kept) and the shingle courses lapped up it
  {
    const slope = Math.hypot(w + 0.7, hHi - hLo);
    const roof = slabBox(slope, 0.11, d + 0.6, 0.35);
    pitchRoofPlane(roof, 'x', -1, Math.atan2(hHi - hLo, w + 0.7), 'skillion');
    parts.roof.push(roof.translate(0.1, (hLo + hHi) / 2 + 0.22, 0));
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    for (let v = 0.12; v < slope - 0.1; v += 0.26) {
      const x = -(w + 0.7) / 2 + 0.1 + v * cp, y = (hLo + hHi) / 2 + 0.22 - (hHi - hLo) / 2 + v * sp + 0.055 / cp + 0.012;
      // (structureConnectivity: a tilted roof slab carries the shared orientation receipt) each course lapped a little
      // steeper than the deck, its butt standing proud
      const course = pitchRoofPlane(box(0.22, 0.025, d + 0.58, 0.4), 'x', -1, pitch + 0.08, 'skillion');
      put(parts.roof, course.translate(x, y, 0));
    }
  }
  // the boards: the back's standing to the deck, the ends' cut to its slope, each its own with a finger's gap
  const bw = 0.2, gap = 0.03, bt = 0.025;
  for (let z = -d / 2 - bt; z < d / 2 + bt - 0.05; z += bw + gap) {
    const top = under(-w / 2 - bt) - 0.005, bh = top - (padTop - 0.02);
    put(parts.wood, box(bt, bh, Math.min(bw, d / 2 + bt - z)).translate(-w / 2 - bt / 2, padTop - 0.02 + bh / 2, z + Math.min(bw, d / 2 + bt - z) / 2));
  }
  for (const sz of [-1, 1]) {
    for (let x = -w / 2; x < w / 2 - 0.05; x += bw + gap) {
      const x1 = Math.min(w / 2, x + bw), y0 = padTop - 0.02;
      const shape = new THREE.Shape();
      shape.moveTo(x, y0); shape.lineTo(x1, y0); shape.lineTo(x1, under(x1) - 0.005); shape.lineTo(x, under(x) - 0.005); shape.closePath();
      const board = new THREE.ExtrudeGeometry(shape, { depth: bt, bevelEnabled: false });
      scaleUV(board, 0.6, 0.6);
      put(parts.wood, board.translate(0, 0, sz > 0 ? d / 2 : -d / 2 - bt));
    }
  }
  // firewood fill: two visible stacked rows in the open bay
  // (the buildings stream, 2026-10-12, the integrity check: the logs stood apart in the air, the lower row 4 cm over the
  // base, the upper 4 cm over it) each log laid on the base or the row under it and against its neighbours
  // (2026-10-15) on the sill's level now, the floor of the bay the ground between the pads; the old rows' draws kept
  for (let row = 0; row < 2; row++) {
    for (let k = 0, n = Math.floor(d / 0.30) - 1; k < n; k++) {
      const log = new THREE.CylinderGeometry(0.145, 0.155, w * 0.7, 6, 1);
      scaleUV(log, 0.8, 0.8);
      log.rotateZ(Math.PI / 2);
      log.rotateY((rng() - 0.5) * 0.06);
      parts.wood.push(log.translate(-0.1, 0.145 + row * 0.29, -d / 2 + 0.5 + k * 0.30));
    }
  }
  // the parts new to the stream take no draws; ten of them take the old shed's other members' four (their uvs kept: the
  // old shed's eleven jittered members were its base, back, two sides, two side boards, four posts and the roof slab)
  fresh.forEach((g, i) => { g.userData.uvJitter = i < 10 ? 'consume' : 'none'; });
  pushParts(buckets, parts);
  return { w: w + 0.3, d: d + 0.3, h: hHi + 0.3 };
}
