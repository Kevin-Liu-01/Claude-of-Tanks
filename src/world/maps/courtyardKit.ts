// src/world/maps/courtyardKit.ts — the desert compounds' courtyard well and courtyard clutter (the looks lane,
// 2026-10-16; WORKLIST #26's courtyard clutter, the coordinator's token item 3). Moved here from mapKits.ts (extract-
// then-own, 7bc304736), then rebuilt to the r2 standard:
//   - the well: its curb two courses of dressed blocks laid in bond round the shaft under a coping of flat slabs, the
//     shaft open with its water a metre down, two forked palm-trunk posts and the crossbar on them, the pulley wheel,
//     the rope and the bucket; a stone trough beside it with its water (was a stone cylinder, a dark box for a bucket);
//   - the clutter: crates of boards on their corner battens and rims, clay jars turned on a wheel (foot, belly, shoulder,
//     neck and lip), grain sacks slumped with their necks tied, rugs with a border woven in (were bare boxes, cylinders
//     and spheres).
// The draws are the old builders' exactly (the props stream: mapKits.ts's compound builders run on it): every value the
// old drew, in its order, the in-builder UV jitter on one part where the old jittered one, and as many parts left to the
// props build's UV pass as the old pushed, each taking its four draws and keeping its own UVs (userData.uvJitter
// 'consume'); the rest of a build's parts are new and take none ('none').
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, jitterUV, scaleUV } from '../propGeometry.ts';
import type { GeometryBuckets } from './exteriorDetailKit.ts';
import type { Rng } from './mapKits.ts';

/** One part of the props build's UV pass: its four draws taken, its UVs kept (props.ts jitterBuildingUvs). */
function consumed<T extends THREE.BufferGeometry>(g: T): T {
  g.userData.uvJitter = 'consume';
  return g;
}

/** Merge a part's pieces into one geometry (the built-ins are all indexed with position, normal, uv). */
function merged(pieces: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(pieces, false) ?? pieces[0];
  for (const p of pieces) if (p !== g) p.dispose();
  return g;
}

/** Collision (physics, 2026-10-16; structureCollision.ts): `pieces` merged, those `dressing` marks flagged per vertex
 *  as surface dressing (userData.noCollisionVertices), no collision part, as the map vehicles' trim is. */
function mergedDressed(pieces: THREE.BufferGeometry[], dressing: readonly boolean[]): THREE.BufferGeometry {
  const counts = pieces.map((p) => p.getAttribute('position').count);
  const g = merged(pieces);
  const flags = new Uint8Array(g.getAttribute('position').count);
  let at = 0;
  counts.forEach((n, i) => { if (dressing[i]) flags.fill(1, at, at + n); at += n; });
  g.userData.noCollisionVertices = flags;
  return g;
}

/** Collision: an item that stands as its plan hull from its foot to its top (structureCollision.ts hullPrism), as the
 *  old cylinder, sphere or box did, not as its lathe's or its battens' hundreds of facets. */
function hulled<T extends THREE.BufferGeometry>(g: T): T {
  g.userData.collisionHull = true;
  return g;
}

/** Collision: no part (water, a shaft's lining under grade, a bucket on its rope). */
function noCollision<T extends THREE.BufferGeometry>(g: T): T {
  g.userData.noCollision = true;
  return g;
}

/** A box w x h x d centred at (x, y, z), turned `yaw` about y (and `tilt` about its own x). */
function block(w: number, h: number, d: number, x: number, y: number, z: number, yaw = 0, tilt = 0, uv = 1.0): THREE.BufferGeometry {
  const b = box(w, h, d, uv);
  if (tilt) b.rotateX(tilt);
  if (yaw) b.rotateY(yaw);
  b.translate(x, y, z);
  return b;
}

/** A round pole from a to b, radius r (six sides). */
function rod(a: readonly [number, number, number], b: readonly [number, number, number], r: number, seg = 6): THREE.BufferGeometry {
  const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = dir.length();
  const g = new THREE.CylinderGeometry(r * 0.92, r, len, seg, 1);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  g.translate(a[0], a[1], a[2]);
  return g;
}

/**
 * The courtyard well (x, z the shaft's middle): see the module's note. Draws: four (the curb's UV jitter, as the old
 * stone ring took them); parts left to the UV pass: six (the old ring, two posts, crossbar, bucket and rope).
 */
export function courtyardWell(rng: Rng, buckets: GeometryBuckets, x: number, z: number): void {
  const R0 = 0.62, R1 = 0.95, n = 9;
  // the curb: two courses of blocks in bond round the shaft, the coping's slabs over them, proud inside and out; and the
  // trough beside it of three stones and its floor
  const stone: THREE.BufferGeometry[] = [];
  for (let c = 0; c < 2; c++) {
    for (let k = 0; k < n; k++) {
      const a = (k + c * 0.5) / n * Math.PI * 2, rm = (R0 + R1) / 2, len = 2 * rm * Math.sin(Math.PI / n) - 0.03;
      stone.push(block(len, 0.36, R1 - R0, x + Math.cos(a) * rm, -0.12 + c * 0.38 + 0.18, z + Math.sin(a) * rm, Math.PI / 2 - a));
    }
  }
  for (let k = 0; k < n; k++) {
    const a = (k + 0.25) / n * Math.PI * 2, rm = (R0 + R1) / 2, len = 2 * (rm + 0.04) * Math.sin(Math.PI / n) - 0.015;
    stone.push(block(len, 0.12, R1 - R0 + 0.12, x + Math.cos(a) * rm, 0.7, z + Math.sin(a) * rm, Math.PI / 2 - a));
  }
  const tx = x + R1 + 0.55, tz = z + 0.2;
  stone.push(block(0.55, 0.12, 1.25, tx, 0.06, tz));
  for (const s of [-1, 1]) stone.push(block(0.1, 0.5, 1.25, tx + s * 0.225, 0.3, tz));
  for (const s of [-1, 1]) stone.push(block(0.35, 0.5, 0.1, tx, 0.3, tz + s * 0.575));
  const curb = merged(stone);
  scaleUV(curb, 3, 1);
  buckets.stone.push(consumed(jitterUV(curb, rng)));
  // the posts: palm trunks forked at their heads either side of the shaft, the crossbar in the forks, the pulley on it
  // (collision: the posts and the crossbar; the forks, the wheel and its axle are dressing)
  const wood: THREE.BufferGeometry[] = [], woodDressing: boolean[] = [];
  for (const s of [-1, 1]) {
    const px = x + s * (R1 + 0.02);
    wood.push(rod([px, -0.2, z], [px, 1.85, z], 0.09, 7)); woodDressing.push(false);
    for (const t of [-1, 1]) { wood.push(rod([px, 1.75, z], [px, 2.05, z + t * 0.1], 0.04, 5)); woodDressing.push(true); }
  }
  wood.push(rod([x - R1 - 0.12, 1.96, z], [x + R1 + 0.12, 1.96, z], 0.055, 6)); woodDressing.push(false);
  const wheel = new THREE.CylinderGeometry(0.17, 0.17, 0.06, 10, 1);
  wheel.rotateZ(Math.PI / 2);
  wheel.translate(x + 0.2, 1.8, z);
  wood.push(wheel); woodDressing.push(true);
  wood.push(rod([x + 0.2, 1.8, z], [x + 0.2, 1.97, z], 0.02, 4)); woodDressing.push(true);
  buckets.wood.push(consumed(mergedDressed(wood, woodDressing)));
  // the bucket: staves on a little taper, its iron band and bail (wood), the rope down to it from the wheel (dark)
  // (the triage round, 2026-10-16: the rope hung 13 cm off the wheel, the bucket in the air under it — the wheel turns on
  // the crossbar's line, x, so the rope leaves its rim on the side, z + its radius: the rope and the bucket hang there)
  const pail: THREE.BufferGeometry[] = [], bx = x + 0.2, bz = z + 0.17;
  const staves = new THREE.CylinderGeometry(0.15, 0.12, 0.3, 9, 1, true);
  staves.translate(bx, 0.95, bz);
  pail.push(staves);
  const bottom = new THREE.CircleGeometry(0.12, 9);
  bottom.rotateX(-Math.PI / 2);
  bottom.translate(bx, 0.81, bz);
  pail.push(bottom);
  pail.push(rod([bx - 0.14, 1.08, bz], [bx, 1.22, bz], 0.012, 4), rod([bx, 1.22, bz], [bx + 0.14, 1.08, bz], 0.012, 4));
  buckets.wood.push(noCollision(consumed(merged(pail))));
  buckets.dark.push(noCollision(consumed(rod([bx, 1.22, bz], [bx, 1.8, bz], 0.012, 4))));
  // the water: in the shaft a metre down, and in the trough
  const well = new THREE.CircleGeometry(R0 + 0.02, 12);
  well.rotateX(-Math.PI / 2);
  well.translate(x, -0.85, z);
  buckets.dark.push(noCollision(consumed(well)));
  // the shaft's lining down to it (the curb's inside carried on down)
  const lining = inward(new THREE.CylinderGeometry(R0, R0, 0.75, 12, 1, true));
  lining.translate(x, -0.47, z);
  lining.userData.uvJitter = 'none';
  buckets.stone.push(noCollision(lining));
  // (the trough's water the sixth part the UV pass takes its four draws for, as the old well's rope was)
  buckets.dark.push(noCollision(consumed(block(0.33, 0.01, 1.03, tx, 0.43, tz))));
}

/** A surface turned to face the other way (a shaft's lining seen from inside): its triangles rewound, its normals
 *  reversed. */
function inward<T extends THREE.BufferGeometry>(g: T): T {
  const idx = g.getIndex(), nor = g.getAttribute('normal');
  if (idx) for (let i = 0; i < idx.count; i += 3) { const b = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, b); }
  for (let i = 0; i < nor.count; i++) nor.setXYZ(i, -nor.getX(i), -nor.getY(i), -nor.getZ(i));
  return g;
}

/** A crate's battens: its twelve edges as thin timbers (merged with its body). */
function crate(cs: number): THREE.BufferGeometry {
  const t = 0.05, h = cs / 2 - t / 2, parts: THREE.BufferGeometry[] = [box(cs - 0.03, cs - 0.03, cs - 0.03, 1.0)];
  for (const a of [-h, h]) for (const b of [-h, h]) {
    parts.push(block(t, cs, t, a, 0, b), block(cs, t, t, 0, a, b), block(t, t, cs, a, b, 0));
  }
  // a board's seam across each side face: the slats
  for (const s of [-1, 1]) parts.push(block(cs - 0.1, 0.03, 0.01, 0, 0, s * (cs / 2 - 0.01)), block(0.01, 0.03, cs - 0.1, s * (cs / 2 - 0.01), 0, 0));
  return merged(parts);
}

/** A clay jar (zir) turned on a wheel: foot, belly, shoulder, neck and lip, `pr` its belly's radius, `ph` its height. */
function jar(pr: number, ph: number): THREE.BufferGeometry {
  const P = (r: number, y: number) => new THREE.Vector2(r * pr, y * ph);
  const g = new THREE.LatheGeometry([P(0.001, 0), P(0.55, 0), P(0.62, 0.04), P(0.9, 0.3), P(1.0, 0.5), P(0.85, 0.75), P(0.45, 0.88), P(0.4, 0.95),
    P(0.52, 1.0), P(0.42, 1.0), P(0.3, 0.9)], 10);
  return g;
}

/** A grain sack slumped on the ground, its neck tied: `s` its size. */
function sack(s: number): THREE.BufferGeometry {
  const P = (r: number, y: number) => new THREE.Vector2(r * s, y * s);
  // (the triage round: the floor's fan from the axis reached a big sack's 0.54 m rim in triangles a third of a
  // millimetre high — slivers; it now runs to a ring at 0.4 first)
  const g = new THREE.LatheGeometry([P(0.001, 0), P(0.4, 0.01), P(0.85, 0.02), P(1.05, 0.25), P(1.0, 0.55), P(0.7, 0.85), P(0.25, 1.05), P(0.18, 1.1), P(0.28, 1.25), P(0.001, 1.28)], 8);
  g.scale(1, 0.62, 0.85);
  return g;
}

/**
 * Scattered courtyard living clutter: crates, clay pots, sacks, a rug. Draws: as the old builder's, item by item (its
 * place, its kind, its own size and turn, the in-builder UV jitter's four); parts left to the UV pass: one an item.
 */
export function courtyardClutter(
  rng: Rng,
  buckets: GeometryBuckets,
  w: number,
  d: number,
  n: number,
): void {
  for (let k = 0; k < n; k++) {
    const cx = (rng() - 0.5) * (w - 5), cz = (rng() - 0.5) * (d - 5);
    const roll = rng();
    if (roll < 0.34) {
      const cs = 0.5 + rng() * 0.4;
      const c = crate(cs);
      c.rotateY(rng() * Math.PI * 0.5);
      c.translate(cx, cs / 2, cz);
      buckets.wood.push(hulled(consumed(jitterUV(c, rng))));
    } else if (roll < 0.62) {
      const pr = 0.22 + rng() * 0.16, ph = 0.5 + rng() * 0.3;
      const pot = jar(pr, ph);
      scaleUV(pot, 2, 1);
      pot.translate(cx, 0, cz);
      buckets.stone.push(hulled(consumed(jitterUV(pot, rng))));
    } else if (roll < 0.82) {
      const s = 0.42 + rng() * 0.22;
      const g = sack(s);
      scaleUV(g, 1.5, 1);
      g.translate(cx, 0, cz);
      buckets.plaster.push(hulled(consumed(jitterUV(g, rng))));
    } else {
      const rw = 1.5 + rng() * 0.8, rd = 2.2 + rng() * 0.6;
      // the rug and its woven border a hair over it
      const rug = merged([box(rw, 0.05, rd, 0.4), block(rw - 0.1, 0.006, 0.12, 0, 0.028, rd / 2 - 0.12), block(rw - 0.1, 0.006, 0.12, 0, 0.028, -rd / 2 + 0.12),
        block(0.12, 0.006, rd - 0.36, rw / 2 - 0.12, 0.028, 0), block(0.12, 0.006, rd - 0.36, -rw / 2 + 0.12, 0.028, 0)]);
      rug.rotateY((rng() - 0.5) * 0.6);
      rug.translate(cx, 0.035, cz);
      buckets.roof.push(hulled(consumed(jitterUV(rug, rng))));
    }
  }
}
