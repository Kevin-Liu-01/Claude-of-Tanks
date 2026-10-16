// src/world/maps/courtyardKit.ts — the desert compounds' courtyard well and courtyard clutter (the looks lane,
// 2026-10-16; WORKLIST #26's courtyard clutter, the coordinator's token item 3). Moved here from mapKits.ts byte for byte
// (extract-then-own); mapKits.ts's compound builders call them as before.
import * as THREE from 'three';
import { box, jitterUV, scaleUV } from '../propGeometry.ts';
import type { GeometryBuckets } from './exteriorDetailKit.ts';
import type { Rng } from './mapKits.ts';

// courtyard well: stone ring, two posts, crossbar + bucket
export function courtyardWell(rng: Rng, buckets: GeometryBuckets, x: number, z: number): void {
  const ring = new THREE.CylinderGeometry(0.85, 0.95, 0.85, 9, 1);
  scaleUV(ring, 3, 1);
  ring.translate(x, 0.42, z);
  buckets.stone.push(jitterUV(ring, rng));
  for (const s of [-1, 1]) {
    const p = box(0.14, 1.9, 0.14, 1.2);
    p.translate(x + s * 0.75, 0.95, z);
    buckets.wood.push(p);
  }
  const bar = box(1.8, 0.10, 0.10, 1.2);
  bar.translate(x, 1.8, z);
  buckets.wood.push(bar);
  const bk = box(0.3, 0.3, 0.3, 1.2);
  bk.translate(x + 0.2, 1.35, z);
  buckets.dark.push(bk);
  // The bucket hangs from an authored rope instead of levitating beneath the
  // crossbar. This also keeps the complete well in one support chain.
  const rope = box(0.035, 0.45, 0.035, 2.0);
  rope.translate(x + 0.2, 1.575, z);
  buckets.dark.push(rope);
}

// scattered courtyard living clutter: crates, clay pots, sacks, a rug
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
      const crate = box(cs, cs, cs, 1.0);
      crate.rotateY(rng() * Math.PI * 0.5);
      crate.translate(cx, cs / 2, cz);
      buckets.wood.push(jitterUV(crate, rng));
    } else if (roll < 0.62) {
      const pr = 0.22 + rng() * 0.16, ph = 0.5 + rng() * 0.3;
      const pot = new THREE.CylinderGeometry(pr * 0.7, pr, ph, 8, 1);
      scaleUV(pot, 2, 1);
      pot.translate(cx, ph / 2, cz);
      buckets.stone.push(jitterUV(pot, rng));
    } else if (roll < 0.82) {
      const s = 0.42 + rng() * 0.22;
      const sack = new THREE.SphereGeometry(s, 7, 5);
      scaleUV(sack, 1.5, 1);
      sack.scale(1, 0.7, 1);
      sack.translate(cx, s * 0.48, cz);
      buckets.plaster.push(jitterUV(sack, rng));
    } else {
      const rug = box(1.5 + rng() * 0.8, 0.05, 2.2 + rng() * 0.6, 0.4);
      rug.rotateY((rng() - 0.5) * 0.6);
      rug.translate(cx, 0.035, cz);
      buckets.roof.push(jitterUV(rug, rng));
    }
  }
}
