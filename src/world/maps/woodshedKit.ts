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
