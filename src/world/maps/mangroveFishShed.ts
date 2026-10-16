// src/world/maps/mangroveFishShed.ts — the Mangrove wharf's fish-buying shed (vựa cá; props census #25, the looks lane
// 2026-10-15; kit:mekong/fishery's wharf: "plan:fishery's single wood box, painted dark door, black-stick hoist and blank
// stone annex"). Mangrove's first fishery is the wharf's donor (props.ts regionalDonor): the Mekong kit never rebuilds
// it, and mangroveFisheryWharf.ts re-seats this build's own parts on the creek landing. So the plan builder builds the Cà
// Mau shed itself on Mangrove, inside the contract the wharf and the placement stream hold it to:
//
//   - the placement stream: props.ts jitterBuildingUvs spends four draws on every part without a uvJitter tag. The base
//     build spent 21; this build hands back exactly 21 such parts (STREAM_PARTS, checked as it finishes), every other
//     part new to the stream ('none'), so every later placement keeps its seat;
//   - the wharf's members, as the composer finds them by their boxes: the four dock piles (wood, -1.7 to 0.5 m, their
//     line 9.75 m out), the dock (wood, x to 8.2, z 7.75 to 11.75) and the ice-house annex (stone, x -8.7 to -4.5, z -4.9
//     to 0.1, its foot at 0 for the composer to lower into the mud); the floor's underside at 0.35 m (the two body piles
//     the composer moves under it reach 4 cm into it);
//   - the build's reach (the second Mangrove fishery's kit reads it as its plot): the annex's pent roof, the dock, the
//     piles and the ridge cap stand where the base's did, and nothing passes them;
//   - the base set's buckets (props.ts placePlannedBuilding): no structureWood there, so the members are painted in the
//     baked bucket (the boats' and the light crafts' material).
//
// The shed: a floor of planks on bearers over stilts; hardwood posts round it under a plate, knee-braced, tie beams
// across with king posts to the ridge; walls of upright planks with their gaps, the front to the dock open under a
// header, a sliding door on its rail in the east wall, propped shutters in the west, a door in the back; the boarded
// gables; a corrugated roof on its rafters and purlins with the sheets' laps and a ridge cap; the annex an ice store of
// rendered block with its door cut and hung; inside the sorting tables, the baskets, the foam ice boxes and the platform
// scale; on the dock a blue tarpaulin on poles over the landing, boxes and baskets.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { gableSlabSeat, pitchRoofPlane } from '../propGeometry.ts';
import type { GeometryBuckets, StructureDimensions } from './exteriorDetailKit.ts';

/** The parts the base fishery spent the placement stream on (four draws each): this build spends exactly as many. */
const STREAM_PARTS = 21;
/** stream: a solid part the stream pays for; dressing: one it pays for that carries no collision; decor: new to both */
type Kind = 'stream' | 'dressing' | 'decor';
type V3 = readonly [number, number, number];

/** A stream of the shed's own (mulberry32 on a fixed seed): its tones, never the placement stream. */
function own(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _c = new THREE.Color();
/** A box, its UVs at `uv` repeats a metre (u along its longer horizontal side, v up), non-indexed. */
function box(w: number, h: number, d: number, uv = 0.55): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const a = g.attributes.uv;
  for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * Math.max(w, d) * uv, a.getY(i) * h * uv);
  return g.toNonIndexed();
}
/** A board: a box without its top and bottom (it stands on a sill under a plate: they are never seen). */
function board(w: number, h: number, d: number, uv = 0.55): THREE.BufferGeometry {
  const g = box(w, h, d, uv), keep = [0, 1, 2, 3, 8, 9, 10, 11];
  const out = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(g.attributes)) {
    const size = a.itemSize, src = a.array as Float32Array, dst = new Float32Array(keep.length * 3 * size);
    keep.forEach((t, k) => dst.set(src.subarray(t * 3 * size, (t + 1) * 3 * size), k * 3 * size));
    out.setAttribute(name, new THREE.BufferAttribute(dst, size));
  }
  g.dispose();
  return out;
}
/** A member from a to b, `w` x `t` in section (its length along its own y before it is turned). */
function beam(a: V3, b: V3, w: number, t: number): THREE.BufferGeometry {
  const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = dir.length();
  const g = box(w, len, t);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  return g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
}
/** Paint a geometry one tone (`hex` scaled by `k`), a little varied vertex to vertex. */
function paint(g: THREE.BufferGeometry, hex: number, k: number, rng: () => number, jitter = 0.03): THREE.BufferGeometry {
  _c.set(hex);
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = k * (1 + (rng() - 0.5) * jitter * 2);
    col[i * 3] = Math.min(1, _c.r * v); col[i * 3 + 1] = Math.min(1, _c.g * v); col[i * 3 + 2] = Math.min(1, _c.b * v);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function merged(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(list, false);
  if (!g) throw new Error('mangroveFishShed: merge produced no geometry');
  for (const p of list) p.dispose();
  return g;
}

const PLANK = 0x7c6c58, POST = 0x5a4a3a, TIMBER = 0x6a5a48, TARP = 0x2f6db0, FOAM = 0xe9e8e1;

/**
 * Build the shed into `buckets` (the base builders' bucket set): its parts, their stream tags, and the base fishery's
 * dimensions (placement read them).
 */
export function buildMangroveFishShed(buckets: GeometryBuckets): StructureDimensions {
  const w = 10.2, d = 15.5, wallH = 4.4, roofH = 1.8, top = wallH + 0.35, floor = 0.47, plate = top - 0.15;
  const rng = own(0x5ead0f15);
  const out: Array<[string, THREE.BufferGeometry, Kind]> = [];
  const put = (bucket: string, g: THREE.BufferGeometry, kind: Kind) => {
    if (kind === 'decor') g.userData.uvJitter = 'none';
    if (kind !== 'stream') g.userData.noCollision = true;
    out.push([bucket, g, kind]);
  };
  const tone = (hex: number, k: number, g: THREE.BufferGeometry, j = 0.03) => paint(g, hex, k, rng, j);
  const plankK = () => 0.82 + rng() * 0.3;

  // ---- the wharf's own members, as the base laid them (the composer finds them by their boxes)
  put('wood', box(w + 6.2, 0.3, 4.0, 0.7).translate(0, 0.3, d / 2 + 2.0), 'stream');
  for (const x of [-7.1, -4.8, 4.8, 7.1]) put('wood', box(0.25, 2.2, 0.25, 0.55).translate(x, -0.6, d / 2 + 2.0), 'stream');

  // ---- the floor: a deck of planks over the stilts (its underside at 0.35 m: the body piles reach into it)
  put('wood', box(w, 0.12, d, 0.55).translate(0, 0.41, 0), 'stream');
  {
    const under: THREE.BufferGeometry[] = [];
    // the bearers across under the floor at every post line, the stilts under their ends and middles, sunk in the bank
    for (let k = 0; k <= 6; k++) {
      const z = -d / 2 + 0.15 + (d - 0.3) * k / 6;
      under.push(tone(TIMBER, 0.62, box(w - 0.1, 0.16, 0.14).translate(0, 0.27, z)));
      for (const x of [-w / 2 + 0.2, 0, w / 2 - 0.2]) {
        if (k === 4 && Math.abs(x) > 4 && x < 0) continue; // (the annex stands there)
        under.push(tone(POST, 0.6, box(0.14, 1.88, 0.14).translate(x, 0.19 - 0.94, z)));
      }
      // a cross-brace under the outer bays
      if (k % 2 === 0) under.push(tone(POST, 0.6, beam([-w / 2 + 0.2, -0.9, z], [0, 0.17, z], 0.08, 0.05)));
    }
    put('baked', merged(under), 'dressing');
  }

  // ---- the frame: hardwood posts round the walls under the plate, the front's posts each side of its opening
  const zs = Array.from({ length: 7 }, (_, k) => -d / 2 + 0.09 + (d - 0.18) * k / 6);
  const px = w / 2 - 0.1, open = 4.1, header = 3.3;
  {
    const posts: THREE.BufferGeometry[] = [];
    for (const z of zs) for (const s of [-1, 1]) posts.push(tone(POST, 0.9 + rng() * 0.15, box(0.16, plate - floor, 0.16).translate(s * px, (floor + plate) / 2, z)));
    for (const x of [-2.5, 0, 2.5]) posts.push(tone(POST, 0.95, box(0.16, plate - floor, 0.16).translate(x, (floor + plate) / 2, -d / 2 + 0.09)));
    for (const s of [-1, 1]) posts.push(tone(POST, 0.95, box(0.16, plate - floor, 0.16).translate(s * open, (floor + plate) / 2, d / 2 - 0.09)));
    // the header over the front's opening
    posts.push(tone(TIMBER, 0.8, box(2 * open + 0.16, 0.22, 0.16).translate(0, header + 0.11, d / 2 - 0.09)));
    put('baked', merged(posts), 'stream');
  }
  {
    // the plates on the posts, the tie beams across at every post line, the king posts to the ridge, the knee braces
    const frame: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) frame.push(tone(TIMBER, 0.78, box(0.18, 0.15, d).translate(s * px, plate + 0.075, 0)));
    for (const s of [-1, 1]) frame.push(tone(TIMBER, 0.78, box(w - 0.2, 0.15, 0.18).translate(0, plate + 0.075, s * (d / 2 - 0.09))));
    for (const z of zs.slice(1, -1)) {
      frame.push(tone(TIMBER, 0.75, box(w - 0.36, 0.14, 0.12).translate(0, plate + 0.07, z)));
      frame.push(tone(TIMBER, 0.75, box(0.12, top + roofH - plate - 0.19, 0.12).translate(0, (plate + top + roofH - 0.19) / 2, z)));
      for (const s of [-1, 1]) frame.push(tone(TIMBER, 0.72, beam([s * (px - 0.05), plate - 0.75, z], [s * (px - 0.75), plate, z], 0.09, 0.06)));
    }
    put('baked', merged(frame), 'dressing');
  }

  // ---- the walls: upright planks with their gaps between the posts, each its own weathering
  const plank = (x: number, z: number, y0: number, y1: number, alongX: boolean, list: THREE.BufferGeometry[]) => {
    if (y1 - y0 < 0.05) return;
    const g = alongX ? board(0.22, y1 - y0, 0.03, 0.55) : board(0.03, y1 - y0, 0.22, 0.55);
    list.push(tone(PLANK, plankK(), g.translate(x, (y0 + y1) / 2, z), 0.02));
  };
  const step = 0.245;
  const sides: THREE.BufferGeometry[] = [];
  {
    // the west wall (-x): the annex is the wall from z -4.9 to 0.1; two shuttered openings in the bays toward the front
    const west = sides, wx = -w / 2 + 0.015;
    const hatches: Array<[number, number]> = [[2.6, 3.8], [5.2, 6.4]];
    for (let z = -d / 2 + 0.12; z < d / 2 - 0.1; z += step) {
      if (z > -4.95 && z < 0.15) continue;
      const hatch = hatches.find(([a, b]) => z > a - 0.05 && z < b + 0.05);
      if (hatch) { plank(wx, z, floor, 1.55, false, west); plank(wx, z, 2.55, plate, false, west); } else plank(wx, z, floor, plate, false, west);
    }
    // the shutters hinged at their heads, propped out on their sticks
    const sh: THREE.BufferGeometry[] = [];
    for (const [a, b] of hatches) {
      const leaf = box(0.035, 1.0, b - a + 0.1).translate(0, -0.5, 0);
      leaf.rotateZ(-0.62).translate(-w / 2, 2.58, (a + b) / 2);
      sh.push(tone(PLANK, 0.9, leaf, 0.02));
      sh.push(tone(TIMBER, 0.7, beam([-w / 2, 1.58, (a + b) / 2], [-w / 2 - 0.6, 1.8, (a + b) / 2], 0.04, 0.04)));
      sh.push(tone(TIMBER, 0.75, box(0.08, 0.08, b - a + 0.2).translate(-w / 2 - 0.04, 1.52, (a + b) / 2)));
    }
    put('baked', merged(sh), 'dressing');
  }
  {
    // the east wall (+x): the sliding door's opening, its leaf slid back along its rail beside it
    const east = sides, ex = w / 2 - 0.015, da = 0.5, db = 3.1;
    for (let z = -d / 2 + 0.12; z < d / 2 - 0.1; z += step) {
      if (z > da && z < db) plank(ex, z, 3.0, plate, false, east); else plank(ex, z, floor, plate, false, east);
    }
    // (the boards are the walls' dressing: the collision is the lining behind them, below)
    put('baked', merged(sides), 'dressing');
    const door: THREE.BufferGeometry[] = [];
    // (the leaf hung from its rail by its head, against the wall's boards; its ledges on it; the opening's header)
    const lh = floor + 2.58 - (floor + 0.05);
    for (let z = db + 0.05; z < db + 2.65; z += 0.2) door.push(tone(PLANK, 0.95 + rng() * 0.12, box(0.035, lh, 0.19).translate(w / 2 + 0.0175, floor + 0.05 + lh / 2, z), 0.02));
    for (const y of [floor + 0.35, floor + 2.2]) door.push(tone(TIMBER, 0.75, box(0.04, 0.12, 2.6).translate(w / 2 + 0.055, y, db + 1.35)));
    door.push(paint(box(0.06, 0.08, 6.0).translate(w / 2 + 0.03, floor + 2.62, (da + db + 2.6) / 2), 0x3a3836, 1, rng, 0.02));
    door.push(paint(box(0.05, 0.22, 2.7).translate(w / 2 + 0.025, 3.0 + 0.11, (da + db) / 2), TIMBER, 0.7, rng));
    put('baked', merged(door), 'decor');
  }
  {
    // the back wall (-z), its door; the front (+z): planked beside the opening and over its header
    const ends: THREE.BufferGeometry[] = [], bz = -d / 2 + 0.015, fz = d / 2 - 0.015;
    for (let x = -w / 2 + 0.12; x < w / 2 - 0.1; x += step) {
      if (x > 0.62 && x < 1.78) plank(x, bz, floor + 2.15, plate, true, ends); else plank(x, bz, floor, plate, true, ends);
      if (Math.abs(x) > open + 0.05) plank(x, fz, floor, plate, true, ends); else plank(x, fz, header + 0.22, plate, true, ends);
    }
    put('baked', merged(ends), 'dressing');
  }
  {
    // the gables, boarded to the rake (each board's head under the roof's underside)
    const gab: THREE.BufferGeometry[] = [], tanP = roofH / (w / 2);
    for (const z of [-d / 2 + 0.015, d / 2 - 0.015]) {
      for (let x = -w / 2 + 0.12; x < w / 2 - 0.1; x += step) {
        const head = top + (w / 2 - Math.abs(x) - 0.11) * tanP - 0.06;
        plank(x, z, plate + 0.15, head, true, gab);
      }
    }
    put('baked', merged(gab), 'dressing');
  }
  {
    // the lining behind the boards to breast height (the walls' collision: a hull stops at the shed's sides; the boards'
    // gaps show it below and the dark of the shed above), its runs broken at the door openings and the annex
    const lin: THREE.BufferGeometry[] = [], y1 = 1.6, lx = w / 2 - 0.045, lz = d / 2 - 0.045;
    const runZ = (x: number, z0: number, z1: number) => { if (z1 - z0 > 0.1) lin.push(tone(TIMBER, 0.55, box(0.03, y1 - floor, z1 - z0).translate(x, (floor + y1) / 2, (z0 + z1) / 2), 0.02)); };
    const runX = (z: number, x0: number, x1: number) => { if (x1 - x0 > 0.1) lin.push(tone(TIMBER, 0.55, box(x1 - x0, y1 - floor, 0.03).translate((x0 + x1) / 2, (floor + y1) / 2, z), 0.02)); };
    runZ(-lx, -lz, -4.95); runZ(-lx, 0.15, lz);
    runZ(lx, -lz, 0.5); runZ(lx, 3.1, lz);
    runX(-lz, -lx, 0.62); runX(-lz, 1.78, lx);
    runX(lz, -lx, -open - 0.1); runX(lz, open + 0.1, lx);
    put('baked', merged(lin), 'stream');
  }
  // the back door, hung in its opening on strap hinges
  {
    const dr: THREE.BufferGeometry[] = [];
    for (let x = 0.7; x < 1.6; x += 0.19) dr.push(tone(PLANK, 0.8, box(0.18, 2.1, 0.035).translate(x + 0.09, floor + 1.06, -d / 2 + 0.0475), 0.02));
    for (const y of [floor + 0.3, floor + 1.8]) dr.push(paint(box(0.5, 0.05, 0.015).translate(0.98, y, -d / 2 + 0.0225), 0x2e2c2a, 1, rng, 0.02));
    put('baked', merged(dr), 'decor');
  }

  // ---- the roof: corrugated sheet on its purlins and rafters, the laps, the ridge cap
  const over = 0.7, seat = gableSlabSeat(w / 2, roofH, over, 0.13, 0.14, 0.08);
  for (const side of [-1, 1]) {
    const slab = box(seat.length, 0.13, d + over * 2, 0.45);
    pitchRoofPlane(slab, 'x', -side as -1 | 1, seat.pitch, 'gable');
    slab.translate(-side * seat.out, top + seat.up, 0);
    put('roof', slab, 'stream');
  }
  put('roof', box(0.34, 0.14, d + over * 2, 0.45).translate(0, top + roofH + 0.04, 0), 'stream');
  {
    // the sheets' laps down both slopes, a sheet's width apart
    const laps: THREE.BufferGeometry[] = [], n: V3[] = [[Math.sin(seat.pitch), Math.cos(seat.pitch), 0], [-Math.sin(seat.pitch), Math.cos(seat.pitch), 0]];
    for (const side of [-1, 1]) {
      const nn = n[side < 0 ? 0 : 1];
      for (let z = -d / 2 - over + 0.45; z < d / 2 + over - 0.3; z += 0.9) {
        const g = box(seat.length - 0.3, 0.03, 0.06, 0.45);
        pitchRoofPlane(g, 'x', -side as -1 | 1, seat.pitch, 'gable');
        g.translate(-side * seat.out + nn[0] * 0.08, top + seat.up + nn[1] * 0.08, z);
        laps.push(g);
      }
    }
    const lapGeo = merged(laps);
    lapGeo.userData.roofPlanePitch = undefined;
    put('roof', lapGeo, 'dressing');
  }
  {
    // the rafters at every post line and the purlins along them, under the sheet
    const tanP = roofH / (w / 2), rf: THREE.BufferGeometry[] = [];
    for (const z of zs) for (const s of [-1, 1]) rf.push(tone(TIMBER, 0.7, beam([s * (w / 2 + over - 0.05), top - (over - 0.05) * tanP - 0.12, z], [0, top + roofH - 0.14, z], 0.08, 0.12)));
    for (const s of [-1, 1]) for (const t of [0.2, 0.55, 0.88]) {
      const x = s * (w / 2 + over) * (1 - t), y = top - over * tanP + (w / 2 + over) * t * tanP - 0.05;
      rf.push(tone(TIMBER, 0.66, box(0.08, 0.08, d + over * 2 - 0.1).translate(x, y, 0)));
    }
    put('baked', merged(rf), 'dressing');
  }
  // the ridge cap over the sheets (the base's own, its reach the build's)
  put('roof', box(0.44, 0.12, d + 1.44, 0.45).translate(0, wallH + 0.35 + roofH + 0.1, 0), 'decor');

  // ---- the annex: the ice store of block, its door cut and hung, its top closed under the pent (the base's box)
  {
    const x0 = -8.7, x1 = -4.5, z0 = -4.9, z1 = 0.1, h = 3.4, t = 0.25, da = -7.3, db = -6.3, dh = 2.3, sill = 0.3;
    const walls = [
      box(x1 - x0, h, t, 0.5).translate((x0 + x1) / 2, h / 2, z0 + t / 2),
      box(t, h, z1 - z0 - 2 * t, 0.5).translate(x0 + t / 2, h / 2, (z0 + z1) / 2),
      box(t, h, z1 - z0 - 2 * t, 0.5).translate(x1 - t / 2, h / 2, (z0 + z1) / 2),
      box(da - x0, h, t, 0.5).translate((x0 + da) / 2, h / 2, z1 - t / 2),
      box(x1 - db, h, t, 0.5).translate((db + x1) / 2, h / 2, z1 - t / 2),
      box(db - da, h - dh, t, 0.5).translate((da + db) / 2, (dh + h) / 2, z1 - t / 2),
      box(db - da, sill, t, 0.5).translate((da + db) / 2, sill / 2, z1 - t / 2),
      box(x1 - x0 - 2 * t, 0.1, z1 - z0 - 2 * t, 0.5).translate((x0 + x1) / 2, h - 0.05, (z0 + z1) / 2),
    ];
    put('stone', merged(walls), 'stream');
    const door: THREE.BufferGeometry[] = [];
    for (let x = da + 0.02; x < db - 0.05; x += 0.2) door.push(tone(0x8a8478, 0.95, box(0.19, dh - sill - 0.02, 0.04).translate(x + 0.095, (sill + dh) / 2, z1 - 0.13), 0.02));
    door.push(paint(box(0.06, 0.18, 0.06).translate(db - 0.18, 1.3, z1 - 0.09), 0x2e2c2a, 1, rng, 0.02));
    door.push(paint(box(db - da + 0.3, 0.12, 0.08).translate((da + db) / 2, dh + 0.06, z1 + 0.04), 0x9a958a, 1, rng, 0.02));
    put('baked', merged(door), 'decor');
  }
  {
    // its pent roof, as the base laid it
    const g = new THREE.BoxGeometry(4.6, 0.16, 5.4);
    const a = g.attributes.uv, su = [5.4, 5.4, 4.6, 4.6, 4.6, 4.6], sv = [0.16, 0.16, 5.4, 5.4, 0.16, 0.16];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) a.setXY(f * 4 + k, a.getX(f * 4 + k) * su[f] * 0.45, a.getY(f * 4 + k) * sv[f] * 0.45);
    put('roof', pitchRoofPlane(g, 'x', -1, 0.12, 'skillion').translate(-w / 2 - 1.5, 3.75, -2.4), 'stream');
  }

  // ---- the furniture of the trade: sorting tables, baskets, the foam ice boxes, the platform scale; on the dock the
  // tarpaulin over the landing, boxes and baskets (dressing: no collision)
  {
    const f: THREE.BufferGeometry[] = [];
    const basket = (x: number, y: number, z: number, hex: number) => {
      f.push(tone(hex, 1, new THREE.CylinderGeometry(0.27, 0.22, 0.34, 10, 1, true).toNonIndexed().translate(x, y + 0.17, z)));
      f.push(tone(hex, 0.8, new THREE.CylinderGeometry(0.22, 0.22, 0.02, 10).toNonIndexed().translate(x, y + 0.01, z)));
    };
    const foam = (x: number, y: number, z: number) => f.push(tone(FOAM, 0.95 + rng() * 0.05, box(0.62, 0.36, 0.42).translate(x, y + 0.18, z), 0.01));
    for (const [tx, tz] of [[-1.6, 1.4], [1.6, -1.6]]) {
      f.push(tone(PLANK, 1.05, box(1.1, 0.06, 2.6).translate(tx, floor + 0.82, tz)));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.push(tone(TIMBER, 0.7, box(0.07, 0.79, 0.07).translate(tx + sx * 0.45, floor + 0.4, tz + sz * 1.15)));
      basket(tx - 0.2, floor + 0.85, tz - 0.6, 0xc0392b);
      basket(tx + 0.25, floor + 0.85, tz + 0.5, 0x2e6fb8);
      basket(tx, floor, tz + 1.65, 0x3a9a5a);
    }
    for (let k = 0; k < 9; k++) foam(-3.6 + (k % 3) * 0.66, floor + Math.floor(k / 3) * 0.36, 5.6 + (k % 2) * 0.05);
    for (let k = 0; k < 5; k++) foam(3.4 + (k % 2) * 0.66, floor + Math.floor(k / 2) * 0.36, -6.2);
    // the platform scale: its deck, its column, its beam
    f.push(paint(box(0.7, 0.12, 0.55).translate(2.6, floor + 0.06, 6.3), 0x4a5052, 1, rng));
    f.push(paint(box(0.06, 1.0, 0.06).translate(2.6, floor + 0.62, 6.0), 0x3a3e40, 1, rng));
    f.push(paint(box(0.5, 0.05, 0.05).translate(2.6, floor + 1.14, 6.0), 0x3a3e40, 1, rng));
    put('baked', merged(f), 'decor');
  }
  {
    const dock: THREE.BufferGeometry[] = [], dz = d / 2 + 2.0, deck = 0.45;
    // the tarpaulin over the landing: its poles at the dock's edge, the sheet sloping back to the eaves, sagging between
    for (const x of [-3.6, 0, 3.6]) dock.push(tone(TIMBER, 0.7, box(0.08, 2.75 - deck, 0.08).translate(x, (deck + 2.75) / 2, dz + 1.6)));
    dock.push(tone(TIMBER, 0.7, box(7.4, 0.07, 0.07).translate(0, 2.76, dz + 1.6)));
    // (its head against the front's boards over the header, its foot on the bar: it hangs from both)
    const zHead = d / 2 + 0.05, yHead = 3.9, zFoot = dz + 1.62, yFoot = 2.79;
    const run = zFoot - zHead, fall = yHead - yFoot, len = Math.hypot(run, fall);
    const tarp = new THREE.PlaneGeometry(7.6, len, 8, 2).toNonIndexed();
    tarp.rotateX(-Math.PI / 2 + Math.atan2(fall, run));
    const p = tarp.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setY(i, p.getY(i) - 0.12 * Math.sin(x * Math.PI / 3.6) ** 2); }
    tarp.computeVertexNormals();
    tarp.translate(0, (yHead + yFoot) / 2, (zHead + zFoot) / 2);
    dock.push(tone(TARP, 1, tarp, 0.01));
    const under = tarp.clone();
    const idx = under.attributes.position;
    for (let i = 0; i < idx.count; i += 3) { for (const at of ['position', 'normal']) { const a = under.getAttribute(at); const t = [a.getX(i + 1), a.getY(i + 1), a.getZ(i + 1)]; a.setXYZ(i + 1, a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2)); a.setXYZ(i + 2, t[0], t[1], t[2]); } }
    const nrm = under.attributes.normal;
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
    dock.push(tone(TARP, 0.6, under, 0.01));
    // boxes and baskets on the dock
    for (let k = 0; k < 6; k++) dock.push(tone(FOAM, 0.96, box(0.62, 0.36, 0.42).translate(-6.6 + (k % 2) * 0.66, deck + 0.18 + Math.floor(k / 2) * 0.36, dz - 1.0), 0.01));
    for (const [x, z, hex] of [[5.6, dz - 0.6, 0xc0392b], [6.1, dz + 0.2, 0x2e6fb8], [5.3, dz + 0.9, 0x3a9a5a]] as const) {
      dock.push(tone(hex, 1, new THREE.CylinderGeometry(0.27, 0.22, 0.34, 10, 1, true).toNonIndexed().translate(x, deck + 0.17, z)));
    }
    put('baked', merged(dock), 'decor');
  }

  // the parts the stream pays for: exactly the base's
  const spent = out.filter(([, , k]) => k !== 'decor').length;
  if (spent !== STREAM_PARTS) throw new Error(`mangroveFishShed: ${spent} stream parts, the base fishery spent ${STREAM_PARTS}`);
  for (const [bucket, g] of out) {
    const target = buckets[bucket];
    if (target) target.push(g);
    else g.dispose();
  }
  return { w: w + 8.0, d: d + 4.5, h: wallH + roofH + 1.0 };
}
