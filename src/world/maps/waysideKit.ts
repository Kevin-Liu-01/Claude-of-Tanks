// src/world/maps/waysideKit.ts — the wayside monuments (props census #11, the looks lane, 2026-10-15): the carved
// sandstone Bildstock, the timber field cross under its little roof, the Orthodox roadside cross and the Mekong-delta
// family tomb. Moved out of sceneryKit.ts (the scenery lane's built landmarks) unchanged, so the family's rebuild lives
// in a file of its own; sceneryKit's SCENERY_DESTRUCTIBLE_TYPES keeps their registry entries (their order unchanged).
//
// Builders author in HSL (sRGB) and store linear vertex colour (the inhabiting kit's convention); the timber pieces
// carry UVs for the props wood atlas. Origin at the base centre, +Y up, the face toward +Z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Rng = () => number;
type Palette = readonly [number, number, number];

const _c = new THREE.Color();

function scaleUV<T extends THREE.BufferGeometry>(geo: T, su: number, sv: number): T {
  const uv = geo.attributes.uv;
  if (!uv) return geo;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return geo;
}

function box(w: number, h: number, d: number, uvScale = 0.7): THREE.BufferGeometry {
  return scaleUV(new THREE.BoxGeometry(w, h, d), Math.max(w, d) * uvScale, h * uvScale);
}

function paint<T extends THREE.BufferGeometry>(geo: T, pal: Palette, jit: number, rng: Rng): T {
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    _c.setHSL(pal[0], pal[1], Math.max(0.02, pal[2] + (rng() - 0.5) * jit), THREE.SRGBColorSpace);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/** One attribute set for every part (position, normal, uv, colour where the kind's material wants it), merged. */
function merge(parts: THREE.BufferGeometry[], withColor: boolean, withUv: boolean): THREE.BufferGeometry {
  const ready = parts.map((part) => {
    const g = part.index ? part.toNonIndexed() : part;
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count;
    if (withUv && !g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (!withUv && g.attributes.uv) g.deleteAttribute('uv');
    if (withColor && !g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    if (!withColor && g.attributes.color) g.deleteAttribute('color');
    return g;
  });
  const merged = mergeGeometries(ready, false);
  if (!merged) throw new Error('sceneryKit: merge produced no geometry');
  return merged;
}

// palettes (sRGB HSL)
const SANDSTONE_RED: Palette = [0.03, 0.34, 0.40];
const SANDSTONE_GREY: Palette = [0.09, 0.10, 0.52];
const NICHE_DARK: Palette = [0.06, 0.18, 0.14];
const SHRINE_PAINT: Palette = [0.6, 0.30, 0.42];
const IRON: Palette = [0.6, 0.05, 0.13];

// ---------------------------------------------------------------------------------------------- wayside shrine

/** A Bildstock: a carved sandstone pillar on a plinth, the niche house on top under a saddle cap, an iron cross. */
function bBildstock(rng: Rng): THREE.BufferGeometry {
  const red = rng() < 0.6;
  const stone = red ? SANDSTONE_RED : SANDSTONE_GREY;
  const parts: THREE.BufferGeometry[] = [];
  parts.push(paint(box(0.66, 0.36, 0.66).translate(0, 0.18, 0), stone, 0.05, rng));
  parts.push(paint(box(0.5, 0.12, 0.5).translate(0, 0.42, 0), stone, 0.05, rng));
  parts.push(paint(box(0.3, 1.5, 0.3).translate(0, 1.23, 0), stone, 0.06, rng));
  parts.push(paint(box(0.42, 0.08, 0.42).translate(0, 2.01, 0), stone, 0.05, rng));
  // the niche house: back, sides and a sill framing a dark recess with its painted panel
  parts.push(paint(box(0.56, 0.62, 0.12).translate(0, 2.36, -0.16), stone, 0.05, rng));
  for (const side of [-1, 1]) parts.push(paint(box(0.1, 0.62, 0.36).translate(side * 0.23, 2.36, 0), stone, 0.05, rng));
  parts.push(paint(box(0.36, 0.5, 0.04).translate(0, 2.34, -0.08), NICHE_DARK, 0.04, rng));
  parts.push(paint(box(0.2, 0.3, 0.02).translate(0, 2.36, -0.055), SHRINE_PAINT, 0.08, rng));
  parts.push(paint(box(0.56, 0.08, 0.4).translate(0, 2.02, 0.01), stone, 0.05, rng));
  // the saddle cap: two sloped slabs meeting on the ridge
  for (const side of [-1, 1]) {
    const slab = box(0.38, 0.07, 0.5);
    slab.rotateZ(side * -0.55);
    parts.push(paint(slab.translate(side * 0.15, 2.78, 0), stone, 0.05, rng));
  }
  // the iron cross on the ridge
  parts.push(paint(box(0.035, 0.34, 0.035).translate(0, 3.05, 0), IRON, 0.02, rng));
  parts.push(paint(box(0.2, 0.035, 0.035).translate(0, 3.1, 0), IRON, 0.02, rng));
  return merge(parts, true, false);
}

/** What stays of a broken shrine: the plinth and the stump of the pillar, the niche house in pieces at its foot. */
function bBildstockBroken(rng: Rng): THREE.BufferGeometry {
  const stone = rng() < 0.6 ? SANDSTONE_RED : SANDSTONE_GREY;
  const parts: THREE.BufferGeometry[] = [];
  parts.push(paint(box(0.66, 0.36, 0.66).translate(0, 0.18, 0), stone, 0.05, rng));
  const stump = box(0.3, 0.55, 0.3);
  stump.rotateZ(0.08);
  parts.push(paint(stump.translate(0.02, 0.62, 0), stone, 0.06, rng));
  for (let i = 0; i < 4; i++) {
    const chunk = box(0.22 + rng() * 0.2, 0.12 + rng() * 0.1, 0.2 + rng() * 0.18);
    chunk.rotateY(rng() * 3); chunk.rotateZ((rng() - 0.5) * 0.6);
    parts.push(paint(chunk.translate((rng() - 0.5) * 1.4, 0.07, 0.4 + rng() * 0.6), stone, 0.06, rng));
  }
  return merge(parts, true, false);
}

// ---------------------------------------------------------------------------------------------- timber crosses

/** A field cross: a squared oak upright on a stone footing, the crossbar, a small board roof over the corpus. */
function bWaysideCross(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(box(0.17, 3.5, 0.15).translate(0, 1.75, 0));
  parts.push(box(1.36, 0.14, 0.12).translate(0, 2.62, 0.01));
  // the roof: two boards on a ridge, and its gable board
  for (const side of [-1, 1]) {
    const board = box(0.4, 0.035, 0.5, 0.9);
    board.rotateZ(side * -0.62);
    parts.push(board.translate(side * 0.15, 3.46, 0.08));
  }
  parts.push(box(0.08, 0.06, 0.52).translate(0, 3.58, 0.08));
  // the corpus: a pale carved figure on the crossing (arms along the bar)
  parts.push(box(0.1, 0.62, 0.06).translate(0, 2.36, 0.1));
  parts.push(box(0.9, 0.06, 0.05).translate(0, 2.6, 0.1));
  // the little picket fence round its foot
  for (const [x, z] of [[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]]) parts.push(box(0.06, 0.62, 0.06).translate(x, 0.31, z));
  for (const z of [-0.62, 0.62]) parts.push(box(1.24, 0.05, 0.04).translate(0, 0.5, z));
  for (const x of [-0.62, 0.62]) parts.push(box(0.04, 0.05, 1.24).translate(x, 0.5, 0));
  void rng;
  return merge(parts, false, true);
}

/** An Orthodox roadside cross: three bars (the lowest slanted), a two-board pitched roof (the golubets). */
function bOrthodoxCross(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(box(0.16, 3.4, 0.14).translate(0, 1.7, 0));
  parts.push(box(0.56, 0.11, 0.11).translate(0, 2.98, 0.01));
  parts.push(box(1.3, 0.13, 0.12).translate(0, 2.58, 0.01));
  const foot = box(0.8, 0.11, 0.11);
  foot.rotateZ(-0.38);
  parts.push(foot.translate(0, 1.32, 0.01));
  for (const side of [-1, 1]) {
    const board = box(0.5, 0.035, 0.26, 0.9);
    board.rotateZ(side * -0.6);
    parts.push(board.translate(side * 0.19, 3.42, 0));
  }
  // the foot: two short sill beams crossed in the turf
  parts.push(box(0.9, 0.12, 0.14).translate(0, 0.05, 0));
  parts.push(box(0.14, 0.12, 0.9).translate(0, 0.05, 0));
  void rng;
  return merge(parts, false, true);
}

// ---------------------------------------------------------------------------------------------- the deltas

const paint_ = paint;
const STUCCO_PALE: Palette = [0.12, 0.2, 0.7];
const STUCCO_BLUE: Palette = [0.55, 0.14, 0.6];
const TOMB_TILE: Palette = [0.04, 0.42, 0.36];
const WEATHER_GREY: Palette = [0.1, 0.06, 0.42];

/**
 * A Mekong-delta family tomb in the rice fields: a rendered plinth, the low barrel of the grave, a headstone wall with
 * a little hipped roof of tiles, and two stub pillars at the foot — painted stucco gone grey with the monsoons.
 */
function bTomb(rng: Rng): THREE.BufferGeometry {
  const paint = rng() < 0.55 ? STUCCO_PALE : STUCCO_BLUE;
  const parts: THREE.BufferGeometry[] = [];
  parts.push(paint_(box(2.6, 0.32, 3.4), WEATHER_GREY, 0.06, rng).translate(0, 0.16, 0));
  parts.push(paint_(box(1.7, 0.5, 2.4), paint, 0.06, rng).translate(0, 0.57, 0.15));
  const barrel = new THREE.CylinderGeometry(0.62, 0.62, 2.2, 10, 1, false, 0, Math.PI);
  barrel.rotateZ(Math.PI / 2); barrel.rotateY(Math.PI / 2);
  parts.push(paint_(barrel, paint, 0.05, rng).translate(0, 0.82, 0.15));
  // the headstone wall and its roof at the head (+Z), the stub pillars at the foot
  parts.push(paint_(box(2.2, 1.55, 0.3), paint, 0.05, rng).translate(0, 1.05, -1.3));
  parts.push(paint_(box(0.9, 0.7, 0.04), WEATHER_GREY, 0.05, rng).translate(0, 1.05, -1.13));
  for (const side of [-1, 1]) {
    const slope = box(1.35, 0.06, 0.62);
    slope.rotateZ(side * -0.42);
    parts.push(paint_(slope, TOMB_TILE, 0.06, rng).translate(side * 0.58, 2.02, -1.3));
    parts.push(paint_(box(0.32, 0.8, 0.32), paint, 0.05, rng).translate(side * 1.05, 0.72, 1.45));
  }
  return merge(parts, true, false);
}

function bTombBroken(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(paint_(box(2.6, 0.32, 3.4), WEATHER_GREY, 0.06, rng).translate(0, 0.16, 0));
  for (let i = 0; i < 5; i++) {
    const chunk = box(0.4 + rng() * 0.6, 0.2 + rng() * 0.3, 0.4 + rng() * 0.6);
    chunk.rotateY(rng() * 3); chunk.rotateZ((rng() - 0.5) * 0.7);
    parts.push(paint_(chunk, rng() < 0.5 ? STUCCO_PALE : WEATHER_GREY, 0.08, rng).translate((rng() - 0.5) * 2.4, 0.42, (rng() - 0.5) * 3));
  }
  return merge(parts, true, false);
}

export { bBildstock, bBildstockBroken, bWaysideCross, bOrthodoxCross, bTomb, bTombBroken };
