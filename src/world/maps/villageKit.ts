// src/world/maps/villageKit.ts — world-dressing r1: the BUILDING CATALOG
// extension. Per-theme building types beyond the original cottage/barn/tower
// set: farm (farmhouse, granary, chapel, windmill), winter (log cabin, alpine
// house, onion-dome church, woodshed), desert (minaret), urban (corner shop),
// railyard (platform depot). Same plan-builder contract as maps/urbanKit.ts:
// fn(rng, buckets, wallBucket?) pushes composed BufferGeometry into the shared
// material buckets and returns the {w,d,h} footprint for obstacles/AABBs.
// Each carries 2-3 rng-driven size/roof/material variants and a grounded
// foundation course (the props.ts grounding precedent).

import * as THREE from 'three';
import {
  box, gableAttic, gablePrism, gableSlabSeat, pitchRoofPlane, pitchSkillionRoof, scaleUV, slabBox,
} from '../propGeometry.ts';
import { markCutCorner } from './exteriorDetailKit.ts';
import type { GeometryBuckets, StructureBuilder, StructureDimensions } from './exteriorDetailKit.ts';
import { markWorldWindowPane } from '../worldNightEmissionGeometry.ts';
import { addChapelSpirelet } from './chapelDressing.ts';

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
/** classic two-slab gable roof + ridge cap into parts.roof */
function gableRoof(
  parts: BuildingParts,
  w: number,
  d: number,
  wallH: number,
  roofH: number,
  over: number,
  thick = 0.12,
): number {
  // (the buildings stream, 2026-10-13) each slab's underside on the gable's own slope, the attic closed under them
  const seat = gableSlabSeat(w / 2, roofH, over, thick);
  for (const side of [-1, 1]) {
    const slab = slabBox(seat.length, thick, d + over * 2, 0.35);
    pitchRoofPlane(slab, 'x', -side as -1 | 1, seat.pitch, 'gable');
    parts.roof.push(slab.translate(-side * seat.out, wallH + seat.up, 0));
  }
  parts.wood.push(gableAttic(w, roofH, d).translate(0, wallH, 0));
  parts.roof.push(slabBox(0.34, thick + 0.01, d + over * 2, 0.5).translate(0, wallH + roofH + 0.04, 0));
  return seat.pitch;
}

// ---------------------------------------------------------------------------
// FARM THEME (verdant / autumn / steppe)
// ---------------------------------------------------------------------------

function addFarmhouseCrossWing(
  rng: () => number,
  buckets: GeometryBuckets,
  wallBucket: string,
  w: number,
  d: number,
): { wd: number; ww: number } {
  const ww = w * 0.62, wd = 4.4 + rng() * 1.2, wH = 2.7, wR = 1.5;
  const wx = w / 2 + wd / 2 - 0.4;
  const wing = newParts();
  wing[wallBucket].push(box(wd, wH, ww).translate(wx, wH / 2, -d * 0.16));
  // The gable triangle caps the outer (+x) end; its ridge runs along x.
  wing[wallBucket].push(gablePrism(ww, wR, 0.3).rotateY(Math.PI / 2)
    .translate(wx + wd / 2 - 0.15, wH, -d * 0.16));
  const slope = Math.hypot(ww / 2 + 0.35, wR + 0.1);
  const ang = Math.atan2(wR + 0.1, ww / 2 + 0.35);
  for (const side of [-1, 1]) {
    const slab = slabBox(wd + 0.7, 0.12, slope + 0.15, 0.35);
    // The sign opposes the z-offset side so ridge and eave edges meet.
    pitchRoofPlane(slab, 'z', -side as -1 | 1, ang, 'gable');
    slab.translate(wx, wH + wR / 2 + 0.06, -d * 0.16 - side * (ww / 4 + 0.18));
    wing.roof.push(slab);
  }
  wing.roof.push(slabBox(wd + 0.7, 0.13, 0.34, 0.5)
    .translate(wx, wH + wR + 0.04, -d * 0.16));
  pushParts(buckets, wing);
  return { wd, ww };
}

function addFarmhousePorch(parts: BuildingParts, w: number, d: number): void {
  const px = -w / 2 - 0.75;
  for (let k = 0; k < 3; k++) {
    parts.wood.push(box(0.12, 2.2, 0.12)
      .translate(px - 0.3, 1.1, -d * 0.30 + k * d * 0.30));
  }
  const roof = slabBox(1.7, 0.09, d * 0.72, 0.4);
  pitchSkillionRoof(roof, 'x', -1, 0.28);
  parts.roof.push(roof.translate(px - 0.02, 2.45, 0));
  parts.stone.push(box(1.4, 0.16, 1.3).translate(px, 0.08, d * 0.18));
  parts.wood.push(box(0.10, 2.2, 1.05).translate(-w / 2 - 0.04, 1.1, d * 0.18));
  parts.dark.push(box(0.06, 2.0, 0.85).translate(-w / 2 - 0.02, 1.05, d * 0.18));
}

function addFarmhouseWindows(
  rng: () => number,
  parts: BuildingParts,
  w: number,
  d: number,
  ww: number,
): void {
  const shutter = rng() < 0.7;
  for (const zz of [-d * 0.30, 0, d * 0.30]) {
    for (const side of [-1, 1]) {
      if (side > 0 && Math.abs(zz + d * 0.16) < ww * 0.6) continue;
      if (Math.abs(zz - d * 0.18) < 0.9 && side < 0) continue;
      if (rng() < 0.15) continue;
      parts.wood.push(box(0.12, 1.05, 0.84)
        .translate(side * (w / 2 + 0.04), 1.75, zz));
      const paneBucket = rng() < 0.5 ? 'glass' : 'curtain';
      parts[paneBucket].push(markWorldWindowPane(box(0.05, 0.9, 0.68), paneBucket, [side, 0, 0])
        // Seat the aperture 5 mm proud of its solid wood backing (+0.10).
        .translate(side * (w / 2 + 0.08), 1.75, zz));
      parts.stone.push(box(0.15, 0.09, 0.96)
        .translate(side * (w / 2 + 0.05), 1.16, zz));
      if (!shutter) continue;
      // Facade sticks remain at least 0.09 m thick to avoid sub-pixel shimmer.
      parts.wood.push(box(0.09, 0.98, 0.28)
        .translate(side * (w / 2 + 0.05), 1.75, zz - 0.58));
      parts.wood.push(box(0.09, 0.98, 0.28)
        .translate(side * (w / 2 + 0.05), 1.75, zz + 0.58));
    }
  }
}

/** 1.5-story farmhouse: main gabled block + lower cross-wing + porch. */
export function makeFarmhouse(
  rng: () => number,
  buckets: GeometryBuckets,
  wallBucket = 'plaster',
): StructureDimensions {
  const w = 6.4 + rng() * 1.4, d = 8.6 + rng() * 2.0;
  const wallH = 3.3, roofH = 2.2 + rng() * 0.5, over = 0.4;
  const parts = newParts();
  parts.stone.push(box(w + 0.3, 1.1, d + 0.3).translate(0, -0.1, 0));
  parts[wallBucket].push(box(w, wallH, d).translate(0, wallH / 2, 0));
  parts[wallBucket].push(gablePrism(w, roofH, 0.32).translate(0, wallH, d / 2 - 0.16));
  parts[wallBucket].push(gablePrism(w, roofH, 0.32).translate(0, wallH, -d / 2 + 0.16));
  gableRoof(parts, w, d, wallH, roofH, over);
  const { wd, ww } = addFarmhouseCrossWing(rng, buckets, wallBucket, w, d);
  addFarmhousePorch(parts, w, d);
  addFarmhouseWindows(rng, parts, w, d, ww);
  // gable attic window + chimney
  parts.dark.push(box(0.55, 0.65, 0.06).translate(w * 0.1, wallH + roofH * 0.42, d / 2 + 0.02));
  parts.stone.push(box(0.6, 1.7, 0.6).translate(-w * 0.2, wallH + roofH - 0.1, -d * 0.28));
  parts.stone.push(box(0.76, 0.12, 0.76).translate(-w * 0.2, wallH + roofH + 0.71, -d * 0.28));
  pushParts(buckets, parts);
  return { w: w + wd * 1.6, d: d + 0.3, h: wallH + roofH };
}

/** Granary raised on staddle stones: small wood loft, steps, gable roof. */
export function makeGranary(rng: () => number, buckets: GeometryBuckets): StructureDimensions {
  const w = 3.4 + rng() * 0.8, d = 4.4 + rng() * 1.0;
  const raise = 0.85, wallH = 2.3, roofH = 1.5 + rng() * 0.3, over = 0.42;
  const parts = newParts();
  // staddle stones: tapered base + cap disc (mushroom) at 4 corners + center
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) {
    const bx2 = sx * (w / 2 - 0.35), bz2 = sz * (d / 2 - 0.35);
    const stem = new THREE.CylinderGeometry(0.14, 0.20, raise - 0.12, 6, 1);
    scaleUV(stem, 0.5, 0.5);
    parts.stone.push(stem.translate(bx2, (raise - 0.12) / 2 - 0.15, bz2));
    const cap = new THREE.CylinderGeometry(0.30, 0.30, 0.12, 8, 1);
    scaleUV(cap, 0.8, 0.5);
    parts.stone.push(cap.translate(bx2, raise - 0.20, bz2));
  }
  const y0 = raise - 0.14;
  parts.wood.push(box(w, 0.16, d).translate(0, y0 + 0.08, 0)); // floor deck
  parts.wood.push(box(w, wallH, d).translate(0, y0 + wallH / 2 + 0.16, 0));
  parts.wood.push(gablePrism(w, roofH, 0.28).translate(0, y0 + wallH + 0.16, d / 2 - 0.14));
  parts.wood.push(gablePrism(w, roofH, 0.28).translate(0, y0 + wallH + 0.16, -d / 2 + 0.14));
  {
    const slope = Math.hypot(w / 2 + over, roofH + 0.1);
    const ang = Math.atan2(roofH + 0.1, w / 2 + over);
    for (const side of [-1, 1]) {
      const slab = slabBox(slope + 0.15, 0.11, d + over * 2, 0.35);
      pitchRoofPlane(slab, 'x', -side as -1 | 1, ang, 'gable');
      slab.translate(-side * (w / 4 + over / 2), y0 + wallH + 0.16 + roofH / 2 + 0.05, 0);
      parts.roof.push(slab);
    }
    parts.roof.push(slabBox(0.32, 0.12, d + over * 2, 0.5).translate(0, y0 + wallH + roofH + 0.20, 0));
  }
  // loft door + timber steps up to it
  parts.dark.push(box(0.9, 1.3, 0.07).translate(0, y0 + 0.16 + 0.85, d / 2 + 0.03));
  parts.wood.push(box(1.0, 0.10, 0.14).translate(0, y0 + 0.16 + 1.58, d / 2 + 0.05));
  for (let k = 0; k < 4; k++) {
    const treadY = 0.16 + k * 0.24;
    const treadZ = d / 2 + 1.05 - k * 0.26;
    parts.wood.push(box(0.9, 0.09, 0.28).translate(0, treadY, treadZ));
    // Two real risers carry every tread to the ground. The old stair read as
    // four disconnected planks hovering toward the loft door.
    const riserH = treadY - 0.045;
    for (const side of [-1, 1]) {
      parts.wood.push(box(0.10, riserH, 0.18)
        .translate(side * 0.34, riserH / 2, treadZ));
    }
  }
  pushParts(buckets, parts);
  return { w: w + 0.4, d: d + 1.6, h: raise + wallH + roofH };
}

/** Small stone chapel: nave, steep roof, bell gable with a hung bell. */
export function makeChapel(rng: () => number, buckets: GeometryBuckets): StructureDimensions {
  const w = 5.0 + rng() * 0.8, d = 7.6 + rng() * 1.4;
  const wallH = 3.6, roofH = 2.6 + rng() * 0.4, over = 0.35;
  const parts = newParts();
  parts.stone.push(box(w + 0.4, 1.1, d + 0.4).translate(0, -0.1, 0));
  parts.stone.push(box(w, wallH, d, 0.7).translate(0, wallH / 2, 0));
  parts.stone.push(gablePrism(w, roofH, 0.34).translate(0, wallH, d / 2 - 0.17));
  parts.stone.push(gablePrism(w, roofH, 0.34).translate(0, wallH, -d / 2 + 0.17));
  gableRoof(parts, w, d, wallH, roofH, over, 0.13);
  // bell gable above the entrance: pierced wall slab + bell + tiny cap
  const bgH = 1.9;
  parts.stone.push(box(1.5, bgH, 0.35, 0.7).translate(0, wallH + roofH + bgH / 2 - 0.5, d / 2 - 0.4));
  parts.dark.push(box(0.62, 0.72, 0.37).translate(0, wallH + roofH + bgH - 1.02, d / 2 - 0.4)); // opening
  {
    const bell = new THREE.CylinderGeometry(0.14, 0.22, 0.30, 7, 1);
    scaleUV(bell, 0.5, 0.5);
    parts.roof.push(bell.translate(0, wallH + roofH + bgH - 1.06, d / 2 - 0.4));
  }
  const cap = gablePrism(1.8, 0.5, 0.55);
  cap.rotateY(Math.PI / 2);
  parts.roof.push(cap.translate(0, wallH + roofH + bgH - 0.5, d / 2 - 0.4));
  addChapelSpirelet(parts, wallH + roofH + bgH, d / 2 - 0.4); // (its spirelet and cross: dressing, chapelDressing.ts)
  // arched door (stone surround + recessed leaf) and slit windows
  parts.stone.push(box(1.7, 2.9, 0.22).translate(0, 1.45, d / 2 + 0.06));
  parts.wood.push(box(1.15, 2.3, 0.10).translate(0, 1.15, d / 2 + 0.13));
  parts.dark.push(box(0.92, 2.1, 0.06).translate(0, 1.05, d / 2 + 0.19));
  for (const zz of [-d * 0.26, 0, d * 0.26]) {
    for (const side of [-1, 1]) {
      parts.dark.push(box(0.06, 1.35, 0.4).translate(side * (w / 2 + 0.03), 2.15, zz));
      parts.stone.push(box(0.14, 0.10, 0.56).translate(side * (w / 2 + 0.05), 1.42, zz));
    }
  }
  // small cross finial on the rear gable
  // (its stem down into the ridge: the slabs now meet the gable's apex, a few centimetres under their old line)
  parts.dark.push(box(0.07, 0.9, 0.07).translate(0, wallH + roofH + 0.45, -d / 2 + 0.2));
  parts.dark.push(box(0.34, 0.07, 0.07).translate(0, wallH + roofH + 0.72, -d / 2 + 0.2));
  pushParts(buckets, parts);
  return { w: w + 0.4, d: d + 0.4, h: wallH + roofH + bgH };
}

/** Tower windmill: tapered stone drum, wood cap, 4 lattice sails. */
export function makeMill(rng: () => number, buckets: GeometryBuckets): StructureDimensions {
  const r0 = 2.6 + rng() * 0.3, r1 = 1.9, h = 7.4 + rng() * 0.8;
  const parts = newParts();
  const base = new THREE.CylinderGeometry(r0 + 0.35, r0 + 0.5, 1.0, 12, 1);
  scaleUV(base, 4, 0.5);
  parts.stone.push(base.translate(0, 0.3, 0));
  const drum = new THREE.CylinderGeometry(r1, r0, h, 12, 1);
  scaleUV(drum, 5, h * 0.5);
  parts.stone.push(drum.translate(0, h / 2 + 0.6, 0));
  // wood boat-cap
  const cap = new THREE.CylinderGeometry(0.4, r1 + 0.25, 1.7, 10, 1);
  scaleUV(cap, 3, 1);
  parts.wood.push(cap.translate(0, h + 0.6 + 0.85, 0));
  // door + two small windows up the drum
  parts.wood.push(box(1.15, 2.1, 0.3).translate(0, 1.35, r0 * 0.92));
  parts.dark.push(box(0.9, 1.85, 0.14).translate(0, 1.3, r0 * 0.92 + 0.12));
  parts.dark.push(box(0.5, 0.7, 0.2).translate(0, h * 0.55, r0 * 0.66 + (r1 - r0) * 0.05));
  parts.dark.push(box(0.5, 0.7, 0.2).rotateY(Math.PI).translate(0, h * 0.8, -(r1 + 0.28)));
  // sail hub + 4 lattice sails on the +z face, parked as an X
  const hubZ = r1 + 0.75, hubY = h + 0.9;
  const shaft = new THREE.CylinderGeometry(0.16, 0.16, 1.6, 6, 1);
  scaleUV(shaft, 0.5, 0.5);
  shaft.rotateX(Math.PI / 2);
  parts.wood.push(shaft.translate(0, hubY, hubZ - 0.6));
  const sailL = 4.6 + rng() * 0.5;
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2;
    const arm = box(0.14, sailL, 0.10, 1.0);
    arm.translate(0, sailL / 2 + 0.2, 0);
    // lattice: 5 cross slats + one edge stringer along the outer half
    for (let s2 = 0; s2 < 5; s2++) {
      const slat = box(0.72, 0.06, 0.05, 1.0);
      slat.translate(0.30, sailL * 0.42 + s2 * sailL * 0.115, 0);
      slat.rotateZ(a);
      slat.translate(0, hubY, hubZ);
      parts.wood.push(slat);
    }
    const stringer = box(0.06, sailL * 0.58, 0.05, 1.0);
    stringer.translate(0.64, sailL * 0.66, 0);
    stringer.rotateZ(a);
    stringer.translate(0, hubY, hubZ);
    parts.wood.push(stringer);
    arm.rotateZ(a);
    arm.translate(0, hubY, hubZ);
    parts.wood.push(arm);
  }
  pushParts(buckets, parts);
  return { w: (r0 + 0.5) * 2, d: (r0 + 0.5) * 2, h: h + 2.3 };
}

// ---------------------------------------------------------------------------
// WINTER THEME
// ---------------------------------------------------------------------------

/** Log cabin: stacked round-log walls, crossed corner ends, low gable. */
export function makeLogCabin(rng: () => number, buckets: GeometryBuckets): StructureDimensions {
  const w = 4.8 + rng() * 1.0, d = 6.2 + rng() * 1.4;
  const nLogs = 7, logR = 0.19;
  const wallH = nLogs * logR * 2 * 0.88;
  const roofH = 1.35 + rng() * 0.3, over = 0.55;
  const parts = newParts();
  parts.stone.push(box(w + 0.3, 0.9, d + 0.3).translate(0, -0.18, 0));
  // log courses: X-axis pairs and Z-axis pairs alternate half-heights
  for (let k = 0; k < nLogs; k++) {
    const y = 0.28 + k * logR * 2 * 0.88;
    for (const s of [-1, 1]) {
      const lz = new THREE.CylinderGeometry(logR, logR, d + 0.55, 7, 1);
      scaleUV(lz, 0.8, d * 0.5);
      lz.rotateX(Math.PI / 2);
      parts.wood.push(lz.translate(s * (w / 2 - logR), y, 0));
      const lx = new THREE.CylinderGeometry(logR, logR, w + 0.55, 7, 1);
      scaleUV(lx, 0.8, w * 0.5);
      lx.rotateZ(Math.PI / 2);
      parts.wood.push(lx.translate(0, y + logR * 0.88, s * (d / 2 - logR)));
    }
  }
  const topY = 0.28 + wallH;
  parts.wood.push(gablePrism(w, roofH, 0.3).translate(0, topY, d / 2 - 0.15));
  parts.wood.push(gablePrism(w, roofH, 0.3).translate(0, topY, -d / 2 + 0.15));
  gableRoof(parts, w, d, topY, roofH, over, 0.14);
  // plank door + small windows + stone chimney
  parts.wood.push(box(1.0, 1.9, 0.14).translate(w * 0.06, 1.15, d / 2 + 0.16));
  parts.dark.push(box(0.8, 1.7, 0.06).translate(w * 0.06, 1.1, d / 2 + 0.25));
  for (const side of [-1, 1]) {
    if (rng() < 0.2) continue;
    parts.wood.push(box(0.12, 0.8, 0.7).translate(side * (w / 2 + 0.02), 1.5, -d * 0.14));
    const paneBucket = rng() < 0.5 ? 'curtain' : 'dark';
    parts[paneBucket].push(markWorldWindowPane(box(0.05, 0.62, 0.52), paneBucket, [side, 0, 0])
      .translate(side * (w / 2 + 0.06), 1.5, -d * 0.14));
  }
  parts.stone.push(box(0.72, topY + roofH + 0.8, 0.72, 0.8).translate(-w / 2 + 0.1, (topY + roofH + 0.8) / 2, -d * 0.22));
  parts.stone.push(box(0.9, 0.14, 0.9).translate(-w / 2 + 0.1, topY + roofH + 0.78, -d * 0.22));
  pushParts(buckets, parts);
  return { w: w + 0.6, d: d + 0.6, h: topY + roofH };
}

/** Alpine house: plastered ground floor, timber upper, DEEP low-pitch eaves,
 * gable balcony rail. */
export function makeAlpine(
  rng: () => number,
  buckets: GeometryBuckets,
  wallBucket = 'plaster',
): StructureDimensions {
  const w = 7.0 + rng() * 1.4, d = 9.0 + rng() * 1.8;
  const gfH = 2.6, ufH = 2.3, roofH = 1.7 + rng() * 0.3, over = 1.05;
  const parts = newParts();
  parts.stone.push(box(w + 0.3, 1.2, d + 0.3).translate(0, -0.1, 0));
  parts[wallBucket].push(box(w, gfH, d).translate(0, gfH / 2, 0));
  parts.wood.push(box(w + 0.16, ufH, d + 0.16).translate(0, gfH + ufH / 2, 0));
  parts.wood.push(gablePrism(w + 0.16, roofH, 0.3).translate(0, gfH + ufH, d / 2 - 0.07));
  parts.wood.push(gablePrism(w + 0.16, roofH, 0.3).translate(0, gfH + ufH, -d / 2 + 0.07));
  gableRoof(parts, w + 0.16, d, gfH + ufH, roofH, over, 0.15);
  // balcony across the +z gable with a slat rail (sticks >= 0.09 m — AA spec)
  parts.wood.push(box(w * 0.8, 0.10, 1.0).translate(0, gfH + 0.05, d / 2 + 0.52));
  for (let k = 0, n = Math.round(w * 0.8 / 0.38); k <= n; k++) {
    parts.wood.push(box(0.09, 0.8, 0.06).translate(-w * 0.4 + k * (w * 0.8 / n), gfH + 0.48, d / 2 + 0.97));
  }
  parts.wood.push(box(w * 0.8 + 0.1, 0.09, 0.09).translate(0, gfH + 0.9, d / 2 + 0.97));
  for (const s of [-1, 1]) { // balcony braces
    const br = box(0.08, 0.08, 1.15, 1.2);
    br.rotateX(-0.7);
    parts.wood.push(br.translate(s * w * 0.34, gfH - 0.38, d / 2 + 0.28));
  }
  // upper-floor window band + door under the balcony
  parts.wood.push(box(1.1, 2.15, 0.12).translate(0, 1.1, d / 2 + 0.08));
  parts.dark.push(box(0.9, 2.0, 0.06).translate(0, 1.05, d / 2 + 0.13));
  for (const zz of [-d * 0.3, -d * 0.05, d * 0.22]) {
    for (const side of [-1, 1]) {
      if (rng() < 0.18) continue;
      parts.dark.push(box(0.06, 0.75, 0.62).translate(side * (w / 2 + 0.10), gfH + ufH * 0.55, zz));
      parts.wood.push(box(0.10, 0.08, 0.75).translate(side * (w / 2 + 0.12), gfH + ufH * 0.55 - 0.44, zz));
    }
  }
  for (const gs of [-1, 1]) { // gable-face upper windows
    const paneBucket = rng() < 0.5 ? 'curtain' : 'dark';
    parts[paneBucket].push(markWorldWindowPane(box(0.6, 0.72, 0.06), paneBucket, [0, 0, 1])
      // Upper timber cladding extends 8 cm beyond the ground-floor shell.
      .translate(gs * w * 0.2, gfH + ufH * 0.6, d / 2 + 0.055));
  }
  parts.stone.push(box(0.66, 1.4, 0.66).translate(w * 0.18, gfH + ufH + roofH - 0.1, -d * 0.2));
  pushParts(buckets, parts);
  return { w: w + 0.6, d: d + 1.2, h: gfH + ufH + roofH };
}

/** Winter church: stone nave + tower with onion dome and spire cross. */
export function makeOnionChurch(rng: () => number, buckets: GeometryBuckets): StructureDimensions {
  const w = 6.4 + rng() * 0.8, d = 9.4 + rng() * 1.4;
  const wallH = 4.2, roofH = 2.8, over = 0.4;
  const parts = newParts();
  parts.stone.push(box(w + 0.4, 1.2, d + 0.4).translate(0, -0.1, 0));
  parts.plaster.push(box(w, wallH, d).translate(0, wallH / 2, 0));
  parts.plaster.push(gablePrism(w, roofH, 0.34).translate(0, wallH, d / 2 - 0.17));
  parts.plaster.push(gablePrism(w, roofH, 0.34).translate(0, wallH, -d / 2 + 0.17));
  gableRoof(parts, w, d, wallH, roofH, over, 0.13);
  // tower over the entrance bay
  const tw = 3.0, tH = 7.6 + rng() * 0.8;
  const tz = d / 2 - tw / 2 + 0.6;
  parts.plaster.push(box(tw, tH, tw).translate(0, tH / 2, tz));
  for (const side of [-1, 1]) { // belfry openings
    parts.dark.push(box(0.06, 1.1, 0.7).translate(side * (tw / 2 + 0.03), tH - 1.1, tz));
  }
  parts.dark.push(box(0.7, 1.1, 0.06).translate(0, tH - 1.1, tz + tw / 2 + 0.03));
  // onion dome: squashed sphere + neck + tapering tip, dark roof material
  {
    const neck = new THREE.CylinderGeometry(0.85, 1.1, 0.5, 10, 1);
    scaleUV(neck, 2, 0.5);
    parts.roof.push(neck.translate(0, tH + 0.25, tz));
    const onion = new THREE.SphereGeometry(1.35, 12, 10);
    onion.scale(1, 1.12, 1);
    scaleUV(onion, 2, 2);
    parts.roof.push(onion.translate(0, tH + 1.55, tz));
    const tip = new THREE.ConeGeometry(0.62, 1.5, 10, 1);
    scaleUV(tip, 1, 1);
    parts.roof.push(tip.translate(0, tH + 3.15, tz));
    parts.dark.push(box(0.06, 0.85, 0.06).translate(0, tH + 4.25, tz));
    parts.dark.push(box(0.4, 0.06, 0.06).translate(0, tH + 4.35, tz));
  }
  // arched nave windows + entrance
  for (const zz of [-d * 0.3, -d * 0.05, d * 0.18]) {
    for (const side of [-1, 1]) {
      parts.dark.push(box(0.06, 1.6, 0.55).translate(side * (w / 2 + 0.03), 2.4, zz));
      parts.stone.push(box(0.14, 0.10, 0.72).translate(side * (w / 2 + 0.05), 1.52, zz));
    }
  }
  parts.wood.push(box(1.3, 2.4, 0.12).translate(0, 1.2, d / 2 + 0.08));
  parts.dark.push(box(1.05, 2.2, 0.06).translate(0, 1.15, d / 2 + 0.13));
  parts.stone.push(box(1.9, 0.16, 0.9).translate(0, 0.08, d / 2 + 0.45));
  pushParts(buckets, parts);
  return { w: w + 0.4, d: d + 0.4, h: tH + 4.4 };
}

/** Open-front woodshed: mono-pitch roof, slat walls, stacked firewood fill. */
export function makeWoodshed(rng: () => number, buckets: GeometryBuckets): StructureDimensions {
  const w = 3.6 + rng() * 0.8, d = 4.6 + rng() * 1.0;
  const hLo = 2.0, hHi = 2.8;
  const parts = newParts();
  parts.stone.push(box(w + 0.2, 0.6, d + 0.2).translate(0, -0.12, 0));
  // slat back + side walls (open +x front); a rotated top board on each side wall
  // (the buildings stream, 2026-10-13, the integrity check: the back wall stopped 11 cm under the roof, and each side
  // wall's triangle under the mono-pitch stood open, sky through the shed from either side) the back wall runs up to the
  // roof's underside, and each side's triangle is boarded up to it (new parts, so no placement-stream draws)
  const pitch = Math.atan2(hHi - hLo, w + 0.7);
  const under = (x: number): number => (hLo + hHi) / 2 + 0.22 + (x - 0.1) * Math.tan(pitch) - 0.055 / Math.cos(pitch) + 0.02;
  const backH = under(-w / 2 - 0.05) - 0.1;
  parts.wood.push(box(0.10, backH, d).translate(-w / 2, backH / 2 + 0.1, 0));
  for (const s of [-1, 1]) {
    parts.wood.push(box(w, hLo, 0.10).translate(0, hLo / 2 + 0.1, s * d / 2));
    const wg = box(Math.hypot(w, hHi - hLo), 0.10, 0.10, 0.6);
    wg.rotateZ(Math.atan2(hHi - hLo, w));
    parts.wood.push(wg.translate(0, hLo + (hHi - hLo) / 2 + 0.1, s * d / 2));
    const infill = new THREE.Shape();
    infill.moveTo(-w / 2, hLo + 0.08); infill.lineTo(w / 2, hLo + 0.08);
    infill.lineTo(w / 2, under(w / 2)); infill.lineTo(-w / 2, under(-w / 2)); infill.closePath();
    const board = new THREE.ExtrudeGeometry(infill, { depth: 0.08, bevelEnabled: false });
    scaleUV(board, 0.6, 0.6);
    board.userData.uvJitter = 'none';
    parts.wood.push(board.translate(0, 0, s * d / 2 - 0.04));
  }
  // corner posts + mono-pitch roof
  for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    parts.wood.push(box(0.13, sx > 0 ? hHi : hLo, 0.13).translate(sx * (w / 2 - 0.07), (sx > 0 ? hHi : hLo) / 2 + 0.1, sz * (d / 2 - 0.07)));
  }
  {
    const slope = Math.hypot(w + 0.7, hHi - hLo);
    const roof = slabBox(slope, 0.11, d + 0.6, 0.35);
    pitchRoofPlane(roof, 'x', -1, Math.atan2(hHi - hLo, w + 0.7), 'skillion');
    parts.roof.push(roof.translate(0.1, (hLo + hHi) / 2 + 0.22, 0));
  }
  // firewood fill: two visible stacked rows in the open bay
  // (the buildings stream, 2026-10-12, the integrity check: the logs stood apart in the air, the lower row 4 cm over the
  // base, the upper 4 cm over it) each log laid on the base or the row under it and against its neighbours
  for (let row = 0; row < 2; row++) {
    for (let k = 0, n = Math.floor(d / 0.30) - 1; k < n; k++) {
      const log = new THREE.CylinderGeometry(0.145, 0.155, w * 0.7, 6, 1);
      scaleUV(log, 0.8, 0.8);
      log.rotateZ(Math.PI / 2);
      log.rotateY((rng() - 0.5) * 0.06);
      parts.wood.push(log.translate(-0.1, 0.32 + row * 0.29, -d / 2 + 0.5 + k * 0.30));
    }
  }
  pushParts(buckets, parts);
  return { w: w + 0.3, d: d + 0.3, h: hHi + 0.3 };
}

// ---------------------------------------------------------------------------
// DESERT / URBAN / RAILYARD
// ---------------------------------------------------------------------------

/** A copy of an open shell wound to face inward (the inner side of a parapet ring or a broken dome). */
function insideOut(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const index = geometry.index;
  if (index) for (let i = 0; i < index.count; i += 3) { const b = index.getX(i + 1); index.setX(i + 1, index.getX(i + 2)); index.setX(i + 2, b); }
  const normal = geometry.getAttribute('normal');
  if (normal) for (let i = 0; i < normal.count; i++) normal.setXYZ(i, -normal.getX(i), -normal.getY(i), -normal.getZ(i));
  return geometry;
}

/** Minaret: tapered round shaft, balcony ring, lantern + small dome. */
export function makeMinaret(rng: () => number, buckets: GeometryBuckets): StructureDimensions {
  const r = 1.35 + rng() * 0.15, h = 10.5 + rng() * 1.5;
  const parts = newParts();
  const plinth = box(r * 2.6, 1.4, r * 2.6, 0.7);
  parts.stone.push(plinth.translate(0, 0.55, 0));
  const shaft = new THREE.CylinderGeometry(r * 0.72, r, h, 12, 1);
  scaleUV(shaft, 4, h * 0.5);
  parts.plaster.push(shaft.translate(0, h / 2 + 1.2, 0));
  // balcony ring + slat parapet
  const balc = new THREE.CylinderGeometry(r * 1.18, r * 0.86, 0.5, 12, 1);
  scaleUV(balc, 4, 0.5);
  parts.stone.push(balc.translate(0, h + 1.2, 0));
  const rail = new THREE.CylinderGeometry(r * 1.16, r * 1.16, 0.62, 12, 1, true);
  scaleUV(rail, 4, 0.5);
  parts.wood.push(rail.translate(0, h + 1.75, 0));
  // (the buildings stream, 2026-10-12, the integrity check: the parapet's inside was its culled back, open from above;
  // the lantern stood 0.55 m over the balcony on nothing and the dome hung over it, open underneath) the parapet's
  // inner face, the shaft's core rising through the balcony to the lantern, a cornice under the dome closing it
  // (parts new to the placement stream take none of its UV draws: props.ts jitterBuildingUvs, so every later
  // placement on the map keeps its seat)
  const railIn = new THREE.CylinderGeometry(r * 1.12, r * 1.12, 0.62, 12, 1, true);
  scaleUV(railIn, 4, 0.5);
  railIn.userData.uvJitter = 'none';
  parts.wood.push(insideOut(railIn).translate(0, h + 1.75, 0));
  const core = new THREE.CylinderGeometry(r * 0.66, r * 0.72, 0.9, 12, 1);
  scaleUV(core, 4, 0.5);
  core.userData.uvJitter = 'none';
  parts.plaster.push(core.translate(0, h + 1.6, 0));
  // lantern + dome + finial
  const lant = new THREE.CylinderGeometry(r * 0.62, r * 0.68, 1.5, 10, 1);
  scaleUV(lant, 3, 1);
  parts.plaster.push(lant.translate(0, h + 2.75, 0));
  const cornice = new THREE.CylinderGeometry(r * 0.8, r * 0.8, 0.16, 12, 1);
  scaleUV(cornice, 3, 0.2);
  cornice.userData.uvJitter = 'none';
  parts.stone.push(cornice.translate(0, h + 3.47, 0));
  for (let k = 0; k < 4; k++) {
    const op = box(0.34, 0.9, 0.1);
    op.rotateY(k * Math.PI / 2);
    op.translate(Math.sin(k * Math.PI / 2) * r * 0.62, h + 2.75, Math.cos(k * Math.PI / 2) * r * 0.62);
    parts.dark.push(op);
  }
  const dome = new THREE.SphereGeometry(r * 0.78, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
  scaleUV(dome, 2, 2);
  parts.roof.push(dome.translate(0, h + 3.5, 0));
  parts.dark.push(box(0.06, 1.0, 0.06).translate(0, h + 4.6, 0));
  // doorway
  parts.dark.push(box(0.8, 1.7, 0.2).translate(0, 2.05, r * 0.95));
  pushParts(buckets, parts);
  return { w: r * 2.7, d: r * 2.7, h: h + 5.0 };
}

/** Urban corner shop: 2-story block, chamfered corner entrance, display
 * glass on both street faces, signboard + string course. */
/**
 * The corner shop's cut corner (+x, +z): its legs along each face, and a point `out` metres in front of the cut face's
 * middle (the face looks along (1, 0, 1) / sqrt 2).
 */
const CORNER_CUT = 0.86;
function onCornerCut(w: number, d: number, out: number): [number, number] {
  const k = out / Math.SQRT2;
  return [w / 2 - CORNER_CUT / 2 + k, d / 2 - CORNER_CUT / 2 + k];
}
/** A plan polygon (x, z) extruded from y0 up to y1: the cap faces up and down, the sides out. */
function planSolid(points: ReadonlyArray<readonly [number, number]>, y0: number, y1: number, uvScale = 0.5): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  points.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2).translate(0, y0, 0);
  return scaleUV(geometry, uvScale, uvScale);
}
/** The shop's plan inset by `inset` from its walls, its +x +z corner cut. */
function cornerShopPlan(w: number, d: number, inset = 0): Array<[number, number]> {
  // (the cut line moved in by `inset` meets the inset faces CORNER_CUT - inset (2 - sqrt 2) from their corner)
  const x = w / 2 - inset, z = d / 2 - inset, c = CORNER_CUT - inset * (2 - Math.SQRT2);
  return [[-x, -z], [x, -z], [x, z - c], [x - c, z], [-x, z]];
}

function addCornerShopEntrance(
  parts: BuildingParts,
  wallBucket: string,
  w: number,
  d: number,
  wallH: number,
): void {
  // (the buildings stream, 2026-10-13, the weird-buildings survey: the entrance's chamfer was a slab turned across the
  // shop's full corner, so its ends stuck out of both faces as wedges and the door and sign, turned the other way, stood
  // inside the wall) the body's corner is cut (makeCornerShop); on the cut face, a pier of the wall, the door with its
  // leaf, the sign over it
  const turn = Math.PI / 4, face = CORNER_CUT * Math.SQRT2;
  const pier = box(face, wallH, 0.06);
  pier.rotateY(turn);
  const [px, pz] = onCornerCut(w, d, 0.03);
  parts[wallBucket].push(pier.translate(px, wallH / 2, pz));
  const door = box(1.15, 2.35, 0.14);
  door.rotateY(turn);
  const [dx, dz] = onCornerCut(w, d, 0.07);
  parts.wood.push(door.translate(dx, 1.2, dz));
  const leaf = box(0.92, 2.15, 0.07);
  leaf.rotateY(turn);
  const [lx, lz] = onCornerCut(w, d, 0.125);
  parts.dark.push(leaf.translate(lx, 1.15, lz));
  const sign = box(face - 0.02, 0.55, 0.12);
  sign.rotateY(turn);
  const [sx, sz] = onCornerCut(w, d, 0.06);
  parts.wood.push(sign.translate(sx, 2.85, sz));
}

function addCornerShopDisplays(parts: BuildingParts, w: number, d: number): void {
  for (const face of [0, 1]) {
    const along = face === 0 ? w : d;
    for (let k = 0; k < 2; k++) {
      const position = -along / 2 + 1.8 + k * (along / 2 - 1.2);
      const pane = box(0.07, 1.6, 2.0);
      const riser = box(0.16, 0.45, 2.14);
      const lintel = box(0.10, 0.42, 2.2);
      if (face === 0) {
        parts.glass.push(pane.translate(w / 2 + 0.02, 1.42, position));
        parts.stone.push(riser.translate(w / 2 + 0.05, 0.33, position));
        parts.wood.push(lintel.translate(w / 2 + 0.06, 2.5, position));
      } else {
        pane.rotateY(Math.PI / 2);
        riser.rotateY(Math.PI / 2);
        lintel.rotateY(Math.PI / 2);
        parts.glass.push(pane.translate(position, 1.42, d / 2 + 0.02));
        parts.stone.push(riser.translate(position, 0.33, d / 2 + 0.05));
        parts.wood.push(lintel.translate(position, 2.5, d / 2 + 0.06));
      }
    }
  }
}

function addCornerShopUpperWindows(
  rng: () => number,
  parts: BuildingParts,
  w: number,
  d: number,
): void {
  for (const face of [0, 1]) {
    const along = face === 0 ? w : d;
    const count = Math.max(2, Math.round(along / 2.5));
    // (spaced along the face's length short of the cut corner: the last sill stood past the cut)
    const run = along - CORNER_CUT;
    for (let k = 0; k < count; k++) {
      const position = -along / 2 + (k + 0.5) * (run / count);
      if (rng() < 0.12) continue;
      const pane = box(0.05, 1.2, 0.8);
      const sill = box(0.2, 0.10, 1.05);
      const paneBucket = rng() < 0.6 ? 'glass' : rng() < 0.8 ? 'curtain' : 'dark';
      if (face === 0) {
        markWorldWindowPane(pane, paneBucket, [1, 0, 0]);
        parts[paneBucket].push(pane.translate(w / 2 + 0.012, 5.0, position));
        parts.stone.push(sill.translate(w / 2 + 0.09, 4.32, position));
      } else {
        markWorldWindowPane(pane, paneBucket, [-1, 0, 0]);
        pane.rotateY(Math.PI / 2);
        sill.rotateY(Math.PI / 2);
        parts[paneBucket].push(pane.translate(position, 5.0, d / 2 + 0.012));
        parts.stone.push(sill.translate(position, 4.32, d / 2 + 0.09));
      }
    }
  }
}

function addCornerShopParapet(
  parts: BuildingParts,
  wallBucket: string,
  w: number,
  d: number,
  wallH: number,
): void {
  const parapetHeight = 0.7;
  const y = wallH + parapetHeight / 2, c = CORNER_CUT;
  // (the front and right parapets and the front coping stop at the cut corner, the cut carries its own run; the roof
  // deck's corner is cut with the walls: they ran on over the cut face, a parapet and a slab's corner in the air)
  parts[wallBucket].push(box(w - c, parapetHeight, 0.22).translate(-c / 2, y, d / 2 - 0.11));
  parts[wallBucket].push(box(w, parapetHeight, 0.22).translate(0, y, -d / 2 + 0.11));
  parts[wallBucket].push(box(0.22, parapetHeight, d - c).translate(w / 2 - 0.11, y, -c / 2));
  parts[wallBucket].push(box(0.22, parapetHeight, d).translate(-w / 2 + 0.11, y, 0));
  parts.stone.push(box(w + 0.07 - c, 0.10, 0.32)
    .translate(-(0.07 + c) / 2, wallH + parapetHeight + 0.05, d / 2 - 0.11));
  parts.stone.push(box(w + 0.14, 0.10, 0.32)
    .translate(0, wallH + parapetHeight + 0.05, -d / 2 + 0.11));
  const deck = planSolid(cornerShopPlan(w, d, 0.15), wallH + 0.06, wallH + 0.14, 0.3);
  parts.roof.push(deck);
  // the cut corner's parapet and coping, each mitred to the ends of the front and side runs it joins (new parts: no
  // placement-stream draws)
  const X = w / 2, Z = d / 2;
  const cutParapet = planSolid([[X - c, Z], [X, Z - c], [X - 0.22, Z - c], [X - c, Z - 0.22]], wallH, wallH + parapetHeight);
  const o = 0.05 * Math.SQRT2;
  const cutCoping = planSolid([[X - c, Z + o], [X + o, Z - c], [X - 0.27, Z - c], [X - c, Z - 0.27]],
    wallH + parapetHeight, wallH + parapetHeight + 0.10);
  for (const g of [cutParapet, cutCoping]) g.userData.uvJitter = 'none';
  parts[wallBucket].push(cutParapet);
  parts.stone.push(cutCoping);
}

export function makeCornerShop(
  rng: () => number,
  buckets: GeometryBuckets,
  wallBucket = 'plaster',
): StructureDimensions {
  const w = 8.0 + rng() * 1.6, d = 8.0 + rng() * 1.6;
  const wallH = 6.6, roofH = 0.7;
  const parts = newParts();
  parts.stone.push(box(w + 0.3, 1.2, d + 0.3).translate(0, -0.1, 0));
  // the body with its +x +z corner cut for the entrance (the buildings stream, 2026-10-13: it was a full box)
  parts[wallBucket].push(planSolid(cornerShopPlan(w, d), 0, wallH));
  addCornerShopEntrance(parts, wallBucket, w, d, wallH);
  addCornerShopDisplays(parts, w, d);
  // string course + upper windows (each run stops at the cut corner, which carries its own: they crossed it in the air)
  const c = CORNER_CUT;
  parts.stone.push(box(w + 0.08 - c, 0.14, 0.10).translate(-(0.08 + c) / 2, 3.3, d / 2 + 0.04));
  parts.stone.push(box(0.10, 0.14, d + 0.08 - c).translate(w / 2 + 0.04, 3.3, -(0.08 + c) / 2));
  const [cx, cz] = onCornerCut(w, d, 0.04);
  const cutCourse = box(c * Math.SQRT2 + 0.1, 0.14, 0.10).rotateY(Math.PI / 4).translate(cx, 3.3, cz);
  cutCourse.userData.uvJitter = 'none';
  parts.stone.push(cutCourse);
  addCornerShopUpperWindows(rng, parts, w, d);
  addCornerShopParapet(parts, wallBucket, w, d, wallH);
  pushParts(buckets, parts);
  // the exterior pass (props.ts addCatalogExterior) keeps the cut corner's courses, pier, downpipe and gutter on the walls
  markCutCorner(buckets, CORNER_CUT);
  return { w: w + 0.3, d: d + 0.3, h: wallH + roofH };
}

/** Rail platform depot: long low hall, raised platform slab, post canopy. */
export function makeDepot(
  rng: () => number,
  buckets: GeometryBuckets,
  wallBucket = 'plaster',
): StructureDimensions {
  const w = 6.0 + rng() * 0.8, d = 16 + rng() * 4;
  const wallH = 3.8, roofH = 1.7, over = 0.5;
  const parts = newParts();
  parts.stone.push(box(w + 0.3, 1.2, d + 0.3).translate(0, -0.1, 0));
  parts[wallBucket].push(box(w, wallH, d).translate(0, wallH / 2, 0));
  parts[wallBucket].push(gablePrism(w, roofH, 0.32).translate(0, wallH, d / 2 - 0.16));
  parts[wallBucket].push(gablePrism(w, roofH, 0.32).translate(0, wallH, -d / 2 + 0.16));
  gableRoof(parts, w, d, wallH, roofH, over, 0.13);
  // platform slab along +x face
  const pw = 3.2;
  parts.stone.push(box(pw, 0.75, d + 2.5, 0.8).translate(w / 2 + pw / 2, 0.28, 0));
  // canopy over the platform: posts + sloped slab
  for (let k = 0, n = Math.max(3, Math.round(d / 4.5)); k < n; k++) {
    const pz = -d / 2 + (k + 0.5) * (d / n);
    parts.dark.push(box(0.12, 2.9, 0.12).translate(w / 2 + pw - 0.5, 2.1, pz));
  }
  {
    const can = slabBox(pw + 1.0, 0.09, d + 1.6, 0.35);
    pitchRoofPlane(can, 'x', 1, 0.14, 'skillion');
    parts.roof.push(can.translate(w / 2 + pw / 2 - 0.1, 3.75, 0));
  }
  // doors/windows along the platform face + big end doors
  for (let k = 0, n = Math.max(2, Math.round(d / 4)); k < n; k++) {
    const pz = -d / 2 + (k + 0.7) * (d / n);
    if (k % 2 === 0) {
      parts.wood.push(box(0.10, 2.2, 1.3).translate(w / 2 + 0.04, 1.75, pz));
      parts.dark.push(box(0.06, 2.05, 1.1).translate(w / 2 + 0.07, 1.7, pz));
    } else {
      parts.dark.push(box(0.06, 1.1, 1.5).translate(w / 2 + 0.03, 2.1, pz));
      parts.wood.push(box(0.10, 0.09, 1.66).translate(w / 2 + 0.05, 1.5, pz));
    }
  }
  parts.dark.push(box(2.4, 2.9, 0.10).translate(0, 1.5, d / 2 + 0.06));
  parts.wood.push(box(2.7, 3.1, 0.06).translate(0, 1.6, d / 2 + 0.02));
  // ridge vent stacks
  for (const vz of [-d * 0.25, d * 0.2]) {
    parts.dark.push(box(0.35, 0.8, 0.35).translate(0, wallH + roofH + 0.3, vz));
  }
  pushParts(buckets, parts);
  return { w: w + pw + 1.2, d: d + 2.6, h: wallH + roofH + 0.6 };
}

/** Plan-name builders (spread into props.ts BUILDER_BY_NAME). */
export const VILLAGE_BUILDERS: Record<string, StructureBuilder> = {
  farmhouse: makeFarmhouse,
  granary: makeGranary,
  chapel: makeChapel,
  mill: makeMill,
  logcabin: makeLogCabin,
  alpine: makeAlpine,
  onionchurch: makeOnionChurch,
  woodshed: makeWoodshed,
  minaret: makeMinaret,
  cornershop: makeCornerShop,
  depot: makeDepot,
};
