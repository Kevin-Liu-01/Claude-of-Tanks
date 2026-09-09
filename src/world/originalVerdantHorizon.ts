/** Original Verdant horizon from 822daf5fa (2026-07-27), restored on request.
 * Preserve its geometry, baked colours and single untextured draw. Only the
 * TypeScript/module boundary is new; no new landscape interpretation here. */
import * as THREE from 'three';
import { SimplexNoise } from '../engine/simplexFast.ts';

const COLUMNS = 240;
const ROWS = [
  { r: 476, base: 10, amp: 0, f0: 0, f1: 0, aer: .08, skirt: true },
  { r: 640, base: 52, amp: 44, f0: 2.3, f1: 5.1, aer: .14 },
  { r: 880, base: 74, amp: 80, f0: 1.7, f1: 3.9, aer: .28 },
  { r: 1180, base: 22, amp: 0, f0: 0, f1: 0, aer: .42 },
];
function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function sampleOriginalVerdantHorizon(seed: number) {
  const noise = new SimplexNoise({ random: mulberry32((seed ^ 0x7A11) >>> 0) });
  const positions = new Float32Array(COLUMNS * ROWS.length * 3);
  const colors = new Float32Array(positions.length);
  // The original shading used the unrounded heights, before Float32 upload.
  const heights = new Float64Array(COLUMNS * ROWS.length);
  let maxHeight = 1;
  for (let row = 0; row < ROWS.length; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      const a = column / COLUMNS * Math.PI * 2;
      const radius = ROWS[row].r * (1 + .025 * noise.noise(
        Math.cos(a) * 4 + row * 13, Math.sin(a) * 4 - row * 7));
      let h = ROWS[row].base;
      if (row === 1) {
        const r1 = 1 - Math.abs(noise.noise(Math.cos(a) * 2.3 + 11, Math.sin(a) * 2.3 - 7));
        const r2 = noise.noise(Math.cos(a) * 5.1 - 3, Math.sin(a) * 5.1 + 9) * .5 + .5;
        h = 52 + r1 * r1 * 44 + r2 * 16;
      } else if (row === 2) {
        const r1 = 1 - Math.abs(noise.noise(Math.cos(a) * 1.7 - 21, Math.sin(a) * 1.7 + 17));
        const r2 = noise.noise(Math.cos(a) * 3.9 + 31, Math.sin(a) * 3.9 - 13) * .5 + .5;
        h = 74 + r1 * r1 * 80 + r2 * 24;
      }
      const i = row * COLUMNS + column;
      heights[i] = h; maxHeight = Math.max(maxHeight, h);
      positions[i * 3] = Math.cos(a) * radius;
      positions[i * 3 + 1] = h;
      positions[i * 3 + 2] = Math.sin(a) * radius;
    }
  }
  // Original Verdant palette, not the later mountain/ribbon palette. Scene
  // fog and the current day/night owner still apply normally to this mesh.
  const base = new THREE.Color(0x38542c), fog = new THREE.Color(0x7e97b8);
  const color = new THREE.Color();
  for (let row = 0; row < ROWS.length; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      const a = column / COLUMNS * Math.PI * 2, i = row * COLUMNS + column;
      const t = Math.max(0, heights[i] / maxHeight);
      const tex = noise.noise(Math.cos(a) * 2.2 + row * 5, Math.sin(a) * 2.2 - row * 3) * .5 + .5;
      color.copy(base).multiplyScalar((.88 + t * .28) * (.93 + tex * .14));
      color.lerp(fog, Math.min(1, ROWS[row].aer + (1 - t) * .06));
      colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
    }
  }
  return { positions, colors, heights: new Float32Array(heights), rows: ROWS, maxHeight };
}

export function buildOriginalVerdantHorizon(seed: number): THREE.Mesh {
  const { positions, colors } = sampleOriginalVerdantHorizon(seed);
  const indices: number[] = [];
  for (let row = 0; row < ROWS.length - 1; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      const next = (column + 1) % COLUMNS;
      const a = row * COLUMNS + column, b = row * COLUMNS + next;
      const c = (row + 1) * COLUMNS + column, d = (row + 1) * COLUMNS + next;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true }));
  mesh.name = 'horizon-ring'; mesh.matrixAutoUpdate = false;
  mesh.userData.aoExclude = true;
  return mesh;
}
