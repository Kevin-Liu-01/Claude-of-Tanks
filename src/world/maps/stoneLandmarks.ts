// src/world/maps/stoneLandmarks.ts — the stone landmarks (props census #11, the looks lane, 2026-10-15): rock that
// people shaped — the standing stone, the clearance cairn and the granite wayside calvary. They are rock forms
// (sceneryRocks.ts buildRockFormation's FORMS), built through the rock pipeline so they weather with the map's rock;
// moved out of sceneryRocks.ts unchanged, so the family's rebuild lives in a file of its own. Each form draws only the
// formation's own stream (scenery.ts: one stream a landmark) and the shared read-only noise.
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { SimplexNoise } from '../../engine/simplexFast.ts';
import { looseStone, lowestGround, place, roundedBlock, type Piece, type RockFormationSpec, type RockGround } from '../sceneryRocks.ts';

type Rng = () => number;

function menhir(spec: RockFormationSpec, ground: RockGround, noise: SimplexNoise, rng: Rng, mobile: boolean, pieces: Piece[]): void {
  // a standing stone: a split slab set on end, leaning a little, its top broken by the quarrying; packing stones round
  // its foot
  const H = spec.height, W = Math.max(0.5, spec.radius);
  const yaw = THREE.MathUtils.degToRad(spec.yawDeg ?? rng() * 180);
  const { min } = lowestGround(ground, spec.x, spec.z, W * 0.6);
  const sink = 0.6 + H * 0.08;
  const g = roundedBlock(W * 0.5, (H + sink) * 0.5, W * (0.28 + rng() * 0.08), 0.32, mobile ? 4 : 6, noise, rng,
    { weather: 0.14, cuts: 3, cutDepth: 0.62, seedOffset: 300 });
  pieces.push({ geometry: place(g, spec.x, min - sink + (H + sink) * 0.5, spec.z, yaw, (rng() - 0.5) * 0.09, (rng() - 0.5) * 0.12), layer: -1, standing: true });
  for (let i = 0; i < (mobile ? 2 : 4); i++) {
    const a = yaw + rng() * Math.PI * 2, rr = W * (0.45 + rng() * 0.25);
    const x = spec.x + Math.cos(a) * rr, z = spec.z + Math.sin(a) * rr;
    const size = 0.18 + rng() * 0.2;
    pieces.push({ geometry: place(looseStone(size, 0.6, noise, rng, mobile ? 0 : 1, 0.6), x, ground.getHeightAt(x, z) - size * 0.3, z, rng() * 6.3), layer: -1, standing: false });
  }
}

function cairn(spec: RockFormationSpec, ground: RockGround, noise: SimplexNoise, rng: Rng, mobile: boolean, pieces: Piece[]): void {
  // a clearance cairn (the Dalmatian gomila, the Bedouin rujm): field stone heaped into a dome; a rough core under a
  // shell of the larger stones
  const R = spec.radius, H = spec.height;
  const { min } = lowestGround(ground, spec.x, spec.z, R);
  const core = roundedBlock(R * 0.86, H * 0.92, R * 0.8, 1, mobile ? 3 : 4, noise, rng, { weather: 0.16, cuts: 0, seedOffset: 500 });
  pieces.push({ geometry: place(core, spec.x, min - H * 0.12, spec.z, rng() * 6.3), layer: -1, standing: true });
  const stone = Math.max(0.35, Math.min(0.9, R * 0.16));
  const rings = Math.max(2, Math.round(H / (stone * 0.9)));
  for (let k = 0; k < rings; k++) {
    const t = k / rings;
    const rr = R * Math.pow(1 - t, 0.85) * 0.96;
    const n = Math.max(1, Math.round((2 * Math.PI * rr) / (stone * (mobile ? 2.6 : 2.0))));
    const yRing = min + t * H * 0.92;
    for (let i = 0; i < n; i++) {
      const a = (i + rng() * 0.6) / n * Math.PI * 2;
      const x = spec.x + Math.cos(a) * rr, z = spec.z + Math.sin(a) * rr * 0.93;
      const size = stone * (0.6 + rng() * 0.6);
      pieces.push({ geometry: place(looseStone(size, 0.55 + rng() * 0.2, noise, rng, mobile ? 0 : 1, 0.3), x, yRing + size * 0.1, z, rng() * 6.3, (rng() - 0.5) * 0.6, (rng() - 0.5) * 0.6), layer: -1, standing: true });
    }
  }
}

function calvary(spec: RockFormationSpec, ground: RockGround, noise: SimplexNoise, rng: Rng, mobile: boolean, pieces: Piece[]): void {
  // a granite wayside calvary: three dressed steps, a pedestal, an octagonal shaft with a necking ring and the cross;
  // the steps follow the ground's lowest corner so no step floats
  const S = spec.radius / 1.6; // 1.6 m half-base at scale 1
  const H = spec.height;
  const yaw = THREE.MathUtils.degToRad(spec.yawDeg ?? 0);
  const { min } = lowestGround(ground, spec.x, spec.z, spec.radius);
  const seg = mobile ? 1 : 2;
  let y = min - 0.25;
  const steps: Array<[number, number]> = [[1.6, 0.42], [1.22, 0.36], [0.86, 0.34]];
  for (const [half, h] of steps) {
    const g = roundedBlock(half * S, h * 0.5 + (y < min ? 0.12 : 0), half * S, 0.05, seg, noise, rng, { weather: 0.03, cuts: 0, seedOffset: 600 + half });
    pieces.push({ geometry: place(g, spec.x, y + h * 0.5, spec.z, yaw), layer: -1, standing: true });
    y += h;
  }
  const ped = roundedBlock(0.5 * S, 0.42, 0.5 * S, 0.08, seg, noise, rng, { weather: 0.04, cuts: 0, seedOffset: 620 });
  pieces.push({ geometry: place(ped, spec.x, y + 0.42, spec.z, yaw), layer: -1, standing: true });
  y += 0.84;
  const shaftH = Math.max(1.6, H - y + min - 1.25);
  const shaft = new THREE.CylinderGeometry(0.17 * S, 0.22 * S, shaftH, mobile ? 6 : 8, 2);
  shaft.deleteAttribute('uv'); shaft.deleteAttribute('normal');
  const shaftW = mergeVertices(shaft); shaft.dispose();
  pieces.push({ geometry: place(shaftW, spec.x, y + shaftH * 0.5, spec.z, yaw + Math.PI / 8), layer: -1, standing: true });
  y += shaftH;
  const neck = roundedBlock(0.26 * S, 0.09, 0.26 * S, 0.3, seg, noise, rng, { weather: 0.02, cuts: 0, seedOffset: 640 });
  pieces.push({ geometry: place(neck, spec.x, y + 0.05, spec.z, yaw + Math.PI / 4), layer: -1, standing: true });
  y += 0.12;
  // the cross: an upright and its arms, the arms' ends a little splayed (the Breton trefoil reduced to a block)
  const up = roundedBlock(0.13 * S, 0.62, 0.11 * S, 0.12, seg, noise, rng, { weather: 0.03, cuts: 0, seedOffset: 660 });
  pieces.push({ geometry: place(up, spec.x, y + 0.62, spec.z, yaw), layer: -1, standing: true });
  const arm = roundedBlock(0.56 * S, 0.11, 0.1 * S, 0.12, seg, noise, rng, { weather: 0.03, cuts: 0, seedOffset: 680 });
  pieces.push({ geometry: place(arm, spec.x, y + 0.86, spec.z, yaw), layer: -1, standing: true });
  for (const side of [-1, 1]) {
    const end = roundedBlock(0.09 * S, 0.16, 0.12 * S, 0.3, seg, noise, rng, { weather: 0.03, cuts: 0, seedOffset: 700 + side });
    pieces.push({ geometry: place(end, spec.x + Math.cos(yaw) * side * 0.56 * S, y + 0.86, spec.z - Math.sin(yaw) * side * 0.56 * S, yaw), layer: -1, standing: true });
  }
}

export { menhir, cairn, calvary };
