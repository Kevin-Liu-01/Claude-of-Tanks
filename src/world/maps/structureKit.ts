// src/world/maps/structureKit.ts — thirty-five additional battlefield
// structures. Fifteen heavyweight landmarks merge into the existing textured
// building buckets; twenty light buildings use one vertex-painted geometry
// per family and have persistent broken-state debris for the destructible
// instance system in props.ts.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addConnectedExterior } from './exteriorDetailKit.ts';
import type { GeometryBuckets, StructureBuilder, StructureDimensions } from './exteriorDetailKit.ts';
import { certifyGroundedStructureParts } from '../structureConnectivity.ts';

type Rng = () => number;
type Palette = readonly [number, number, number];

interface StructureParts extends GeometryBuckets {
  [name: string]: THREE.BufferGeometry[];
  plaster2: THREE.BufferGeometry[];
  plaster3: THREE.BufferGeometry[];
  glass: THREE.BufferGeometry[];
  curtain: THREE.BufferGeometry[];
  straw: THREE.BufferGeometry[];
  baked: THREE.BufferGeometry[];
}

type FacadeFace = 'front' | 'back' | 'right' | 'left';

interface TowerFacadeOptions {
  x?: number;
  z?: number;
  w: number;
  d: number;
  y0: number;
  y1: number;
  step?: number;
  bays?: number;
  sideBays?: number;
  frameBucket?: string;
  alternateLit?: boolean;
}

interface ConnectedCrownOptions {
  x?: number;
  z?: number;
  roofY: number;
  baseW?: number;
  style?: 'needle' | 'forked' | 'broadcast';
  yaw?: number;
}

interface GableLightOptions {
  w: number;
  d: number;
  wallH: number;
  roofH: number;
  pal: Palette;
  porch?: number;
  raised?: number;
  chimney?: boolean;
  windows?: number;
}

type LightStructureBuilder = (rng: Rng) => THREE.BufferGeometry;
type DebrisMaterial = 'wood' | 'canvas' | 'metal';

export interface DestructibleBuildingType {
  id: string;
  family: string;
  cls: 'break';
  mat: 'structureCanvas' | 'structureMetal' | 'structureWood';
  surfaceMaterial: 'structureCanvas' | 'structureMetal' | 'structureWood';
  contact: 'ob';
  collider: true;
  hw: number;
  hl: number;
  r: number;
  h: number;
  keep: number;
  crushMin: number;
  build: LightStructureBuilder;
  instanceTintStrength: number;
  broken: LightStructureBuilder;
}

const _color = new THREE.Color();
const _detailRng = () => 0.5;

function scaleUV<T extends THREE.BufferGeometry>(geo: T, su = 1, sv = 1): T {
  const uv = geo.attributes.uv;
  if (!uv) return geo;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return geo;
}

function box(w: number, h: number, d: number, uv = 0.55): THREE.BoxGeometry {
  return scaleUV(new THREE.BoxGeometry(w, h, d), Math.max(w, d) * uv, h * uv);
}

function detailUv<T extends THREE.BufferGeometry>(geo: T): T {
  geo.userData.detailUv = true;
  return geo;
}

function slab(w: number, h: number, d: number, uv = 0.45): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  const attr = geo.attributes.uv;
  const su = [d, d, w, w, w, w], sv = [h, h, d, d, h, h];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    attr.setXY(i, attr.getX(i) * su[f] * uv, attr.getY(i) * sv[f] * uv);
  }
  return geo;
}

function facadePanel(w: number, h: number, face: FacadeFace = 'front'): THREE.PlaneGeometry {
  // Window bays only need a camera-facing skin: the surrounding mullions and
  // transfer ledges provide the physical reveal. Two-triangle panels preserve
  // the richer facade at one sixth the raster/merge cost of tiny boxes.
  const geo = scaleUV(new THREE.PlaneGeometry(w, h), w * 0.88, h * 0.88);
  if (face === 'back') geo.rotateY(Math.PI);
  else if (face === 'right') geo.rotateY(Math.PI / 2);
  else if (face === 'left') geo.rotateY(-Math.PI / 2);
  return geo;
}

function cylinder(rt: number, rb: number, h: number, segments = 10): THREE.CylinderGeometry {
  return scaleUV(new THREE.CylinderGeometry(rt, rb, h, segments, 1), 1.5, 1.2);
}

function gable(w: number, h: number, d: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  geo.translate(0, 0, -d / 2);
  return scaleUV(geo, 0.5, 0.5);
}

function archShell(w: number, h: number, d: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const r = w / 2;
  shape.moveTo(-r, 0);
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI - i * Math.PI / 10;
    shape.lineTo(Math.cos(a) * r, Math.sin(a) * (h - 0.12));
  }
  shape.lineTo(r, 0);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  geo.translate(0, 0, -d / 2);
  return scaleUV(geo, 0.55, 0.55);
}

function paint<T extends THREE.BufferGeometry>(geo: T, hex: number, rng: Rng, jitter = 0.075): T {
  const n = geo.attributes.position.count;
  const colors = new Float32Array(n * 3);
  // THREE.Color.set(hex) already converts authored sRGB hex values into the
  // renderer's linear working space. Converting again crushes midtones and
  // makes these baked structures read almost black under low winter/industrial
  // sun rigs.
  _color.set(hex);
  for (let i = 0; i < n; i++) {
    const v = 1 + (rng() - 0.5) * jitter * 2;
    colors[i * 3] = Math.min(1, _color.r * v);
    colors[i * 3 + 1] = Math.min(1, _color.g * v);
    colors[i * 3 + 2] = Math.min(1, _color.b * v);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geometry = mergeGeometries(
    parts.map((geo) => (geo.index ? geo.toNonIndexed() : geo)),
    false,
  );
  if (!geometry) throw new Error('structure geometry merge produced no result');
  return geometry;
}

/**
 * Prove a lightweight building is one supported assembly before its authored
 * parts are flattened into a single instanced geometry. After merge there is
 * no reliable way to distinguish an intentional window surround from a
 * floating porch, ladder, service box or roof sheet, so the receipt belongs
 * at this boundary rather than in the renderer or destruction path.
 */
function mergeConnectedStructure(id: string, parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const connectivity = certifyGroundedStructureParts(id, parts);
  const geometry = merge(parts);
  geometry.userData.structureConnectivity = connectivity;
  return geometry;
}

function push(parts: StructureParts, bucket: string, geo: THREE.BufferGeometry): void {
  (parts[bucket] || parts.dark).push(geo);
}

function finish(buckets: GeometryBuckets, parts: StructureParts): void {
  for (const [bucket, geos] of Object.entries(parts)) {
    const target = buckets[bucket];
    if (!target) continue;
    for (const geo of geos) target.push(geo);
  }
}

function parts(): StructureParts {
  return {
    plaster: [], plaster2: [], plaster3: [], stone: [], roof: [], wood: [],
    dark: [], glass: [], curtain: [], straw: [], baked: [],
  };
}

function addGableRoof(
  out: StructureParts,
  w: number,
  d: number,
  wallH: number,
  roofH: number,
  over = 0.4,
): void {
  const slope = Math.hypot(w / 2 + over, roofH + 0.08);
  const angle = Math.atan2(roofH + 0.08, w / 2 + over);
  for (const side of [-1, 1]) {
    const roof = slab(slope + 0.14, 0.13, d + over * 2);
    roof.rotateZ(side * angle);
    roof.translate(-side * (w / 4 + over / 2), wallH + roofH / 2 + 0.06, 0);
    out.roof.push(roof);
  }
  out.roof.push(slab(0.34, 0.14, d + over * 2).translate(0, wallH + roofH + 0.04, 0));
}

function addWindow(
  out: StructureParts,
  x: number,
  y: number,
  z: number,
  face: 'x' | 'z' = 'z',
  wide = 0.9,
  tall = 1.15,
): void {
  const pane = face === 'z' ? box(wide, tall, 0.06) : box(0.06, tall, wide);
  const sill = face === 'z' ? box(wide + 0.18, 0.10, 0.16) : box(0.16, 0.10, wide + 0.18);
  const lit = Math.abs(Math.round(x * 17 + y * 11 + z * 7)) % 5 === 0;
  out[lit ? 'curtain' : 'glass'].push(pane.translate(x, y, z));
  out.stone.push(sill.translate(x, y - tall / 2 - 0.08, z));
  // Full recessed surround: the former pane+sill treatment read as a flat
  // dark sticker at street distance. Jambs, lintel and divided glazing reuse
  // the already-required stone bucket, so every facade gains real silhouette
  // depth without activating another material or texture family.
  const jambH = tall + 0.22;
  if (face === 'z') {
    out.stone.push(detailUv(box(0.11, jambH, 0.13).translate(x - wide / 2 - 0.07, y, z + 0.01)));
    out.stone.push(detailUv(box(0.11, jambH, 0.13).translate(x + wide / 2 + 0.07, y, z + 0.01)));
    out.stone.push(detailUv(box(wide + 0.32, 0.12, 0.15).translate(x, y + tall / 2 + 0.08, z + 0.01)));
    out.stone.push(detailUv(box(0.055, tall - 0.08, 0.09).translate(x, y, z + 0.055)));
    out.stone.push(detailUv(box(wide - 0.06, 0.055, 0.09).translate(x, y, z + 0.055)));
  } else {
    out.stone.push(detailUv(box(0.13, jambH, 0.11).translate(x + 0.01, y, z - wide / 2 - 0.07)));
    out.stone.push(detailUv(box(0.13, jambH, 0.11).translate(x + 0.01, y, z + wide / 2 + 0.07)));
    out.stone.push(detailUv(box(0.15, 0.12, wide + 0.32).translate(x + 0.01, y + tall / 2 + 0.08, z)));
    out.stone.push(detailUv(box(0.09, tall - 0.08, 0.055).translate(x + 0.055, y, z)));
    out.stone.push(detailUv(box(0.09, 0.055, wide - 0.06).translate(x + 0.055, y, z)));
  }
}

// -------------------------------------------------------------------------
// Heavy structures — merged into the established building material buckets.
// -------------------------------------------------------------------------

export function makeTavern(rng: Rng, buckets: GeometryBuckets, wallBucket = 'plaster'): StructureDimensions {
  const out = parts(), w = 9.2, d = 12.4, wallH = 4.7, roofH = 2.7;
  out.stone.push(box(w + 0.5, 1.0, d + 0.5).translate(0, 0.05, 0));
  out[wallBucket].push(box(w, wallH, d).translate(0, wallH / 2, 0));
  out[wallBucket].push(gable(w, roofH, 0.3).translate(0, wallH, d / 2 - 0.15));
  out[wallBucket].push(gable(w, roofH, 0.3).translate(0, wallH, -d / 2 + 0.15));
  addGableRoof(out, w, d, wallH, roofH, 0.55);
  // Deep street balcony, carved braces, hanging inn sign and rear chimney.
  out.wood.push(box(w * 0.78, 0.20, 1.55).translate(0, 3.05, d / 2 + 0.7));
  for (let x = -3; x <= 3; x += 1.5) {
    out.wood.push(box(0.10, 1.05, 0.10).translate(x, 3.6, d / 2 + 1.25));
    // Posts reach the balcony bearer instead of stopping 30 cm below it.
    out.wood.push(box(0.10, 3.05, 0.10).translate(x, 1.525, d / 2 + 1.25));
  }
  out.roof.push(slab(w * 0.88, 0.11, 2.1).rotateX(-0.15).translate(0, 5.05, d / 2 + 0.72));
  out.dark.push(box(1.6, 0.95, 0.10).translate(-w / 2 - 0.08, 3.1, d * 0.2));
  out.stone.push(box(0.72, 2.5, 0.72).translate(2.6, wallH + roofH - 0.3, -2.7));
  for (const x of [-2.5, 0, 2.5]) addWindow(out, x, 2.0, d / 2 + 0.04);
  addConnectedExterior(out, { id: 'tavern', w, d, wallH, profile: 'rural', variant: 1 });
  finish(buckets, out);
  return { w: w + 0.5, d: d + 2.5, h: wallH + roofH + 1.0 };
}

export function makeSchoolhouse(rng: Rng, buckets: GeometryBuckets, wallBucket = 'plaster2'): StructureDimensions {
  const out = parts(), w = 8.6, d = 13.6, wallH = 4.3, roofH = 3.0;
  out.stone.push(box(w + 0.45, 1.1, d + 0.45).translate(0, 0, 0));
  out[wallBucket].push(box(w, wallH, d).translate(0, wallH / 2, 0));
  out[wallBucket].push(gable(w, roofH, 0.3).translate(0, wallH, d / 2 - 0.15));
  out[wallBucket].push(gable(w, roofH, 0.3).translate(0, wallH, -d / 2 + 0.15));
  addGableRoof(out, w, d, wallH, roofH, 0.45);
  // Bell cupola and twin entrance porch make it unmistakable at range.
  out.wood.push(box(2.6, 1.8, 2.6).translate(0, wallH + roofH + 0.5, 1.0));
  for (const side of [-1, 1]) out.dark.push(box(0.62, 0.85, 0.08).translate(side * 0.65, wallH + roofH + 0.6, 2.34));
  const cap = new THREE.ConeGeometry(2.0, 2.4, 4, 1);
  cap.rotateY(Math.PI / 4); cap.translate(0, wallH + roofH + 2.6, 1.0); out.roof.push(cap);
  out.wood.push(box(3.5, 0.18, 2.0).translate(0, 0.18, d / 2 + 1.0));
  for (const x of [-1.35, 1.35]) out.wood.push(box(0.13, 2.7, 0.13).translate(x, 1.5, d / 2 + 1.65));
  out.roof.push(slab(4.1, 0.12, 2.4).rotateX(-0.14).translate(0, 3.0, d / 2 + 0.95));
  for (const z of [-4.4, -1.5, 1.4]) for (const side of [-1, 1]) addWindow(out, side * (w / 2 + 0.04), 2.35, z, 'x', 1.25, 1.55);
  addConnectedExterior(out, { id: 'schoolhouse', w, d, wallH, profile: 'civic', variant: 2 });
  finish(buckets, out);
  return { w: w + 0.5, d: d + 2.5, h: wallH + roofH + 4.0 };
}

export function makeFireStation(rng: Rng, buckets: GeometryBuckets, wallBucket = 'stone'): StructureDimensions {
  const out = parts(), w = 11.4, d = 15.0, wallH = 5.4;
  out[wallBucket].push(box(w, wallH, d).translate(0, wallH / 2, 0));
  out.roof.push(slab(w + 0.5, 0.28, d + 0.5).translate(0, wallH + 0.12, 0));
  // Twin deep appliance doors with lintels and a square hose-drying tower.
  for (const x of [-3.0, 1.1]) {
    out.dark.push(box(3.35, 3.7, 0.12).translate(x, 1.85, d / 2 + 0.08));
    for (let y = 0.5; y < 3.6; y += 0.62) out.wood.push(box(3.15, 0.06, 0.08).translate(x, y, d / 2 + 0.16));
  }
  const tx = 4.0, towerH = 11.8;
  out.stone.push(box(3.0, towerH, 3.0).translate(tx, towerH / 2, -3.7));
  for (const face of [-1, 1]) out.dark.push(box(1.65, 2.1, 0.08).translate(tx, towerH - 2.1, -3.7 + face * 1.52));
  const towerCap = new THREE.ConeGeometry(2.25, 2.2, 4, 1);
  towerCap.rotateY(Math.PI / 4); towerCap.translate(tx, towerH + 1.1, -3.7); out.roof.push(towerCap);
  out.plaster3.push(box(4.8, 0.85, 0.12).translate(-1.0, 4.7, d / 2 + 0.1));
  addConnectedExterior(out, { id: 'firestation', w, d, wallH, profile: 'industrial', variant: 0 });
  finish(buckets, out);
  return { w: w + 0.4, d: d + 0.4, h: towerH + 2.3 };
}

export function makeFishery(rng: Rng, buckets: GeometryBuckets): StructureDimensions {
  const out = parts(), w = 10.2, d = 15.5, wallH = 4.4, roofH = 1.8;
  out.wood.push(box(w, wallH, d).translate(0, wallH / 2 + 0.35, 0));
  out.wood.push(gable(w, roofH, 0.3).translate(0, wallH + 0.35, d / 2 - 0.15));
  out.wood.push(gable(w, roofH, 0.3).translate(0, wallH + 0.35, -d / 2 + 0.15));
  addGableRoof(out, w, d, wallH + 0.35, roofH, 0.7);
  // Wet working dock, hoist boom, ice-house annex and net loft openings.
  out.wood.push(box(w + 6.2, 0.3, 4.0).translate(0, 0.3, d / 2 + 2.0));
  for (const x of [-7.1, -4.8, 4.8, 7.1]) out.wood.push(box(0.25, 2.2, 0.25).translate(x, -0.6, d / 2 + 2.0));
  out.dark.push(box(0.22, 6.2, 0.22).rotateZ(-0.38).translate(5.6, 3.35, d / 2 + 1.0));
  out.dark.push(box(0.06, 3.0, 0.06).translate(6.75, 1.5, d / 2 + 1.0));
  out.stone.push(box(4.2, 3.4, 5.0).translate(-w / 2 - 1.5, 1.7, -2.4));
  out.roof.push(slab(4.6, 0.16, 5.4).rotateZ(0.12).translate(-w / 2 - 1.5, 3.75, -2.4));
  for (const x of [-2.8, 0, 2.8]) addWindow(out, x, 2.4, d / 2 + 0.04, 'z', 1.1, 1.1);
  addConnectedExterior(out, { id: 'fishery', w, d, wallH: wallH + 0.35, profile: 'timber', variant: 1 });
  finish(buckets, out);
  return { w: w + 8.0, d: d + 4.5, h: wallH + roofH + 1.0 };
}

export function makeBathhouse(rng: Rng, buckets: GeometryBuckets, wallBucket = 'plaster3'): StructureDimensions {
  const out = parts(), w = 12.4, d = 11.0, wallH = 4.5;
  out.stone.push(box(w + 0.5, 1.0, d + 0.5).translate(0, 0.05, 0));
  out[wallBucket].push(box(w, wallH, d).translate(0, wallH / 2, 0));
  out.roof.push(slab(w + 0.2, 0.15, d + 0.2).translate(0, wallH + 0.08, 0));
  // Three low domes, lantern vents and an arched entry vestibule.
  for (const [x, z, r] of [[-3.2, -2.0, 2.8], [2.8, -2.1, 2.5], [0, 2.6, 2.35]]) {
    const dome = new THREE.SphereGeometry(r, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.scale(1, 0.58, 1); dome.translate(x, wallH, z); out.roof.push(dome);
    out.dark.push(cylinder(0.22, 0.28, 0.65, 8).translate(x, wallH + r * 0.58 + 0.25, z));
  }
  out[wallBucket].push(box(4.0, 3.8, 2.0).translate(0, 1.9, d / 2 + 0.9));
  out.dark.push(box(1.6, 2.7, 0.10).translate(0, 1.35, d / 2 + 1.92));
  for (const x of [-4.0, 4.0]) addWindow(out, x, 2.25, d / 2 + 0.04, 'z', 0.7, 1.25);
  addConnectedExterior(out, { id: 'bathhouse', w, d, wallH, profile: 'civic', variant: 3 });
  finish(buckets, out);
  return { w: w + 0.5, d: d + 2.2, h: wallH + 3.2 };
}

export function makeCaravanserai(rng: Rng, buckets: GeometryBuckets, wallBucket = 'plaster'): StructureDimensions {
  const out = parts(), w = 21.0, d = 19.0, wallH = 5.2;
  // Courtyard plan: four occupied perimeter wings, fortified gate towers.
  out[wallBucket].push(box(w, wallH, 4.0).translate(0, wallH / 2, -d / 2 + 2.0));
  out[wallBucket].push(box(w, wallH, 4.0).translate(0, wallH / 2, d / 2 - 2.0));
  out[wallBucket].push(box(4.0, wallH, d - 8.0).translate(-w / 2 + 2.0, wallH / 2, 0));
  out[wallBucket].push(box(4.0, wallH, d - 8.0).translate(w / 2 - 2.0, wallH / 2, 0));
  for (const x of [-6.4, 6.4]) out.stone.push(box(3.5, 7.2, 4.2).translate(x, 3.6, d / 2 - 1.2));
  out.dark.push(box(4.6, 4.4, 0.14).translate(0, 2.2, d / 2 + 0.08));
  out.roof.push(slab(w + 0.4, 0.18, 4.4).translate(0, wallH + 0.1, -d / 2 + 2.0));
  out.roof.push(slab(w + 0.4, 0.18, 4.4).translate(0, wallH + 0.1, d / 2 - 2.0));
  for (let x = -7; x <= 7; x += 3.5) {
    out.dark.push(box(1.8, 2.2, 0.08).translate(x, 1.4, -d / 2 + 4.04));
    out.wood.push(box(0.16, 2.8, 0.16).translate(x, 1.4, -d / 2 + 5.0));
  }
  // The courtyard posts carry a continuous shade arcade back into the north
  // wing. Besides giving the 21 m facade a readable rhythm, this closes the
  // former one-metre air gap between every post and the actual structure.
  out.wood.push(slab(16.4, 0.18, 1.25).rotateX(-0.045)
    .translate(0, 2.86, -d / 2 + 4.48));
  for (const x of [-8.2, -4.1, 0, 4.1, 8.2]) {
    out.stone.push(box(0.42, wallH - 0.25, 0.38)
      .translate(x, (wallH - 0.25) / 2, d / 2 + 0.08));
  }
  addConnectedExterior(out, { id: 'caravanserai', w, d, wallH, profile: 'desert', variant: 0 });
  finish(buckets, out);
  return { w: w + 0.4, d: d + 0.4, h: 7.4 };
}

export function makeFoundryOffice(rng: Rng, buckets: GeometryBuckets, wallBucket = 'stone'): StructureDimensions {
  const out = parts(), w = 13.0, d = 14.0, wallH = 5.8;
  out[wallBucket].push(box(w, wallH, d).translate(0, wallH / 2, 0));
  // A three-bay sawtooth roof preserves the industrial silhouette.
  for (let i = 0; i < 3; i++) {
    const z = -d / 2 + (i + 0.5) * d / 3;
    const tooth = gable(w, 2.0, d / 3 - 0.12).rotateY(Math.PI / 2);
    tooth.rotateY(-Math.PI / 2); // keep extrusion along z; explicit for authoring clarity
    tooth.translate(0, wallH, z); out.plaster3.push(tooth);
    const roof = slab(w + 0.4, 0.14, d / 3 + 0.15);
    roof.rotateZ(-0.27); roof.translate(0.8, wallH + 1.0, z); out.roof.push(roof);
    addWindow(out, -w / 2 - 0.04, wallH + 0.95, z, 'x', d / 3 - 0.55, 1.45);
  }
  for (const x of [-3.7, -1.2, 1.3, 3.8]) addWindow(out, x, 2.9, d / 2 + 0.05, 'z', 1.25, 1.8);
  out.dark.push(box(3.2, 3.5, 0.12).translate(0, 1.75, -d / 2 - 0.05));
  out.stone.push(box(1.0, 4.5, 1.0).translate(4.6, wallH + 1.7, -4.0));
  addConnectedExterior(out, { id: 'foundryoffice', w, d, wallH, profile: 'industrial', variant: 2 });
  finish(buckets, out);
  return { w: w + 0.4, d: d + 0.4, h: wallH + 4.0 };
}

export function makeRangerLodge(rng: Rng, buckets: GeometryBuckets, wallBucket = 'wood'): StructureDimensions {
  const out = parts(), w = 10.8, d = 13.4, wallH = 4.0, roofH = 3.5;
  out.stone.push(box(w + 0.5, 1.2, d + 0.5).translate(0, 0, 0));
  out[wallBucket].push(box(w, wallH, d).translate(0, wallH / 2, 0));
  out[wallBucket].push(gable(w, roofH, 0.3).translate(0, wallH, d / 2 - 0.15));
  out[wallBucket].push(gable(w, roofH, 0.3).translate(0, wallH, -d / 2 + 0.15));
  addGableRoof(out, w, d, wallH, roofH, 0.75);
  // Full porch, stone fireplace and observation cupola.
  out.wood.push(box(w + 1.8, 0.18, 2.6).translate(0, 0.24, d / 2 + 1.3));
  for (const x of [-5.2, -2.6, 0, 2.6, 5.2]) out.wood.push(box(0.16, 2.8, 0.16).translate(x, 1.55, d / 2 + 2.25));
  out.roof.push(slab(w + 2.0, 0.13, 3.1).rotateX(-0.17).translate(0, 3.25, d / 2 + 1.25));
  out.stone.push(box(1.35, 5.8, 1.35).translate(-3.4, wallH + 0.9, -2.2));
  out.wood.push(box(3.0, 1.7, 3.0).translate(2.0, wallH + roofH + 0.35, -1.0));
  const cap = new THREE.ConeGeometry(2.15, 1.9, 4, 1);
  cap.rotateY(Math.PI / 4); cap.translate(2.0, wallH + roofH + 2.15, -1.0); out.roof.push(cap);
  for (const x of [-3.2, 0, 3.2]) addWindow(out, x, 2.1, d / 2 + 0.04);
  addConnectedExterior(out, { id: 'rangerlodge', w, d, wallH, profile: 'timber', variant: 2 });
  finish(buckets, out);
  return { w: w + 2.0, d: d + 3.0, h: wallH + roofH + 3.2 };
}

// -------------------------------------------------------------------------
// Megacity landmarks. These remain ordinary material-bucket geometry: an
// entire skyline still resolves to the same handful of merged draw calls as
// a village. Damage is authored into the silhouette (missing corners,
// exposed slabs and bridge stumps) instead of adding transparent shell meshes.
// -------------------------------------------------------------------------

function addTowerFacadeGrid(out: StructureParts, {
  x = 0, z = 0, w, d, y0, y1, step = 3.1, bays = 4, sideBays = 5,
  frameBucket = 'stone', alternateLit = true,
}: TowerFacadeOptions): void {
  const bayW = w / bays;
  const sideBayW = d / sideBays;
  let floor = 0;
  for (let y = y0; y < y1; y += step, floor++) {
    for (let bay = 0; bay < bays; bay++) {
      const bx = x - w / 2 + bayW * (bay + 0.5);
      const bucket = alternateLit && (floor * 3 + bay * 5) % 13 === 0 ? 'curtain' : 'glass';
      out[bucket].push(facadePanel(bayW * 0.72, 1.18, 'front')
        .translate(bx, y, z + d / 2 + 0.055));
      out.glass.push(facadePanel(bayW * 0.72, 1.18, 'back')
        .translate(bx, y, z - d / 2 - 0.055));
    }
    for (let bay = 0; bay < sideBays; bay++) {
      const bz = z - d / 2 + sideBayW * (bay + 0.5);
      const bucket = alternateLit && (floor * 7 + bay * 3) % 17 === 0 ? 'curtain' : 'glass';
      out[bucket].push(facadePanel(sideBayW * 0.70, 1.18, 'right')
        .translate(x + w / 2 + 0.055, y, bz));
      out.glass.push(facadePanel(sideBayW * 0.70, 1.18, 'left')
        .translate(x - w / 2 - 0.055, y, bz));
    }
  }

  // Deep vertical mullions and transfer-floor ledges turn the texture into a
  // readable facade at both street and skyline distances. They stay in the
  // existing material buckets, so the whole city still merges to the same
  // handful of draw calls.
  const facadeH = Math.max(1, y1 - y0 + step * 0.45);
  const facadeY = (y0 + y1) / 2 - step * 0.14;
  for (let bay = 1; bay < bays; bay++) {
    const bx = x - w / 2 + bayW * bay;
    out[frameBucket].push(detailUv(box(0.18, facadeH, 0.22)
      .translate(bx, facadeY, z + d / 2 + 0.055)));
    out[frameBucket].push(detailUv(box(0.18, facadeH, 0.22)
      .translate(bx, facadeY, z - d / 2 - 0.055)));
  }
  for (let bay = 1; bay < sideBays; bay++) {
    const bz = z - d / 2 + sideBayW * bay;
    out[frameBucket].push(detailUv(box(0.22, facadeH, 0.18)
      .translate(x + w / 2 + 0.055, facadeY, bz)));
    out[frameBucket].push(detailUv(box(0.22, facadeH, 0.18)
      .translate(x - w / 2 - 0.055, facadeY, bz)));
  }
  for (let y = y0 - step * 0.48; y < y1; y += step * 3) {
    out[frameBucket].push(detailUv(slab(w + 0.28, 0.20, d + 0.28, 0.7)
      .translate(x, y, z)));
  }
}

function addConnectedCrown(out: StructureParts, {
  x = 0, z = 0, roofY, baseW = 4.8, style = 'needle', yaw = 0,
}: ConnectedCrownOptions): number {
  const baseD = style === 'forked' ? baseW * 0.72 : baseW;
  out.roof.push(slab(baseW, 0.46, baseD).translate(x, roofY + 0.23, z));

  if (style === 'broadcast') {
    const pedestalH = 1.35;
    out.dark.push(box(baseW * 0.62, pedestalH, baseD * 0.62)
      .translate(x, roofY + 0.46 + pedestalH / 2 - 0.03, z));
    const mastBase = roofY + 0.46 + pedestalH - 0.06;
    const mastH = 8.4;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = box(0.16, mastH, 0.16);
      leg.rotateZ(sx * -0.075);
      leg.rotateX(sz * 0.075);
      out.dark.push(leg.translate(x + sx * 0.48, mastBase + mastH / 2, z + sz * 0.48));
    }
    for (let i = 0; i <= 4; i++) {
      const y = mastBase + i * mastH / 4;
      out.dark.push(box(1.12 - i * 0.13, 0.14, 1.12 - i * 0.13).translate(x, y, z));
    }
    out.dark.push(cylinder(0.10, 0.13, 4.6, 8)
      .translate(x, mastBase + mastH + 2.25, z));
    out.curtain.push(cylinder(0.24, 0.24, 0.26, 10)
      .translate(x, mastBase + mastH + 4.5, z));
    return mastBase + mastH + 4.65;
  }

  if (style === 'forked') {
    const shoulderH = 1.1;
    out.stone.push(box(baseW * 0.68, shoulderH, baseD * 0.70)
      .translate(x, roofY + 0.46 + shoulderH / 2 - 0.03, z));
    const y0 = roofY + 0.46 + shoulderH - 0.06;
    for (const side of [-1, 1]) {
      const sx = x + side * baseW * 0.21;
      const blade = box(0.34, 6.8, 0.42);
      blade.rotateZ(side * -0.08);
      out.dark.push(blade.translate(sx, y0 + 3.4, z));
      const finial = new THREE.ConeGeometry(0.34, 2.3, 6, 1);
      finial.rotateY(yaw + Math.PI / 6);
      finial.translate(sx - side * 0.27, y0 + 7.62, z);
      out.roof.push(finial);
    }
    out.dark.push(box(baseW * 0.56, 0.24, 0.30).translate(x, y0 + 4.4, z));
    return y0 + 8.8;
  }

  const tiers = [
    [baseW * 0.72, 1.10], [baseW * 0.50, 1.18], [baseW * 0.31, 1.05],
  ];
  let cursor = roofY + 0.42;
  for (let i = 0; i < tiers.length; i++) {
    const [tw, th] = tiers[i];
    out[i === 1 ? 'stone' : 'roof'].push(box(tw, th, tw * 0.86)
      .translate(x, cursor + th / 2, z));
    cursor += th - 0.04;
  }
  const needle = new THREE.ConeGeometry(baseW * 0.18, 7.6, 8, 1);
  needle.rotateY(yaw + Math.PI / 8);
  needle.translate(x, cursor + 3.72, z);
  out.roof.push(needle);
  out.dark.push(cylinder(0.085, 0.12, 4.0, 8).translate(x, cursor + 9.38, z));
  out.curtain.push(cylinder(0.22, 0.22, 0.22, 10).translate(x, cursor + 11.28, z));
  return cursor + 11.4;
}

/** Bombed 55 m office tower with an asymmetrical collapsed crown. */
export function makeMegatower(rng: Rng, buckets: GeometryBuckets, wallBucket = 'plaster3'): StructureDimensions {
  const out = parts(), w = 18.5, d = 20.5, podiumH = 6.0;
  out.stone.push(box(w + 5.0, podiumH, d + 4.0).translate(0, podiumH / 2, 0));
  out.dark.push(box(w * 0.55, 3.5, 0.16).translate(0, 1.75, d / 2 + 2.08));
  for (const x of [-8.0, -4.0, 4.0, 8.0]) {
    out.stone.push(box(0.8, podiumH + 0.4, 1.2).translate(x, podiumH / 2, d / 2 + 2.25));
  }
  const lowerH = 28, upperH = 18;
  out[wallBucket].push(box(w, lowerH, d).translate(0, podiumH + lowerH / 2, 0));
  const upperBase = podiumH + lowerH;
  // The crown is genuinely missing a quadrant: a short surviving transfer
  // floor, a tall west spine and a torn rear core replace the old solid box.
  // This reads as structural destruction in silhouette instead of a dark
  // decal painted onto an otherwise pristine tower.
  out.plaster2.push(box(w * 0.72, 5.8, d * 0.78)
    .translate(-w * 0.08, upperBase + 2.9, -d * 0.04));
  out.plaster2.push(box(w * 0.34, upperH - 2.0, d * 0.70)
    .translate(-w * 0.25, upperBase + (upperH - 2.0) / 2, -d * 0.06));
  out.stone.push(box(w * 0.25, upperH - 7.0, d * 0.28)
    .translate(w * 0.11, upperBase + (upperH - 7.0) / 2, -d * 0.25));
  addTowerFacadeGrid(out, {
    w, d, y0: podiumH + 3.0, y1: podiumH + lowerH - 1.0,
    step: 3.0, bays: 5, sideBays: 6,
  });
  for (let y = upperBase + 3.0; y < upperBase + upperH - 2.0; y += 3.0) {
    out.dark.push(box(w * 0.27, 0.9, 0.10).translate(-w * 0.25, y, d * 0.29));
    out.glass.push(box(0.10, 0.9, d * 0.48).translate(-w * 0.08, y, -d * 0.06));
  }
  // Torn-away southeast crown: exposed floor plates, snapped columns and a
  // leaning service mast give the skyline a clear destroyed read.
  for (let i = 0; i < 4; i++) {
    const y = podiumH + lowerH + 4.5 + i * 4.0;
    out.stone.push(slab(7.5 - i * 0.7, 0.28, 6.4 - i * 0.55)
      .translate(w * 0.24, y, d * 0.18));
    // Each torn slab retains one transfer beam into the surviving west spine.
    // The asymmetry remains, but the floor plates are no longer suspended.
    out.dark.push(box(3.65, 0.34, 0.44)
      .translate(-0.05, y - 0.24, d * 0.18));
  }
  for (const [x, z, h] of [[5.4, 4.8, 14], [2.1, 5.0, 9], [5.2, 1.7, 7]]) {
    const col = box(0.36, h, 0.36); col.rotateZ((rng() - 0.5) * 0.18);
    out.dark.push(col.translate(x, podiumH + lowerH + h / 2, z));
  }
  // The surviving west spine carries a complete stepped communications crown.
  // Its broad base overlaps the roof slab before narrowing to the needle, so
  // even the damaged variant has no hovering antenna or unsupported finial.
  const spireTop = addConnectedCrown(out, {
    x: -w * 0.25, z: -d * 0.06,
    roofY: upperBase + upperH - 2.0, baseW: 4.6, style: 'broadcast', yaw: -0.18,
  });
  finish(buckets, out);
  return { w: w + 5.2, d: d + 4.2, h: spireTop };
}

/** Twin stepped arcology slabs joined by a damaged high skybridge. */
export function makeArcology(rng: Rng, buckets: GeometryBuckets, wallBucket = 'stone'): StructureDimensions {
  const out = parts(), towerW = 12.0, d = 22.0, hA = 39.0, hB = 33.0;
  const towers: Array<readonly [number, number, string]> = [
    [-9.0, hA, wallBucket],
    [9.0, hB, 'plaster3'],
  ];
  for (const [x, h, bucket] of towers) {
    const intactH = h - 8.0;
    out[bucket].push(box(towerW, intactH, d).translate(x, intactH / 2, 0));
    // Unequal surviving roof lobes leave a deep shell-bite through the crown.
    out[bucket].push(box(towerW * 0.46, 8.0, d * 0.82)
      .translate(x - towerW * 0.25, intactH + 4.0, -d * 0.04));
    out.stone.push(box(towerW * 0.28, 4.2, d * 0.34)
      .translate(x + towerW * 0.26, intactH + 2.1, -d * 0.23));
    for (let i = 0; i < 3; i++) {
      const deck = slab(towerW * (0.34 - i * 0.035), 0.24, d * (0.42 - i * 0.035));
      deck.rotateZ((i - 1) * 0.055);
      out.stone.push(deck.translate(x + towerW * 0.22, intactH + 1.1 + i * 2.2, d * 0.20));
    }
    // A battered service spine ties the cantilevered crown decks back to the
    // intact slab below. It is intentionally exposed as part of the damage.
    out.dark.push(box(0.48, 7.0, 0.48)
      .translate(x + towerW * 0.13, intactH + 3.5, d * 0.15));
  }
  // Explicit facade grids preserve the gap between both towers while giving
  // each slab its own bay cadence and weather-catching frame depth.
  for (const [x, h] of [[-9.0, hA], [9.0, hB]]) {
    addTowerFacadeGrid(out, {
      x, w: towerW, d, y0: 3.2, y1: h - 8.5, step: 3.2,
      bays: 3, sideBays: 5, frameBucket: x < 0 ? 'stone' : 'dark',
    });
  }
  out.stone.push(box(30.5, 3.4, 5.2).translate(0, 22.0, -1.2));
  out.dark.push(box(8.0, 2.7, 5.35).translate(2.5, 22.0, -1.2)); // blown bridge bay
  for (const x of [-13.0, -5.0, 5.0, 13.0]) {
    const brace = box(0.42, 13.0, 0.42); brace.rotateZ(x < 0 ? -0.18 : 0.18);
    out.stone.push(brace.translate(x, 6.3, d / 2 + 0.4));
  }
  out.roof.push(slab(6.0, 0.4, d * 0.84).translate(-12.0, hA + 0.2, -d * 0.04));
  out.roof.push(slab(6.0, 0.4, d * 0.84).translate(6.0, hB + 0.2, -d * 0.04));
  const leftTop = addConnectedCrown(out, {
    x: -12.0, z: -d * 0.04, roofY: hA + 0.40, baseW: 4.2, style: 'forked', yaw: 0.08,
  });
  addConnectedCrown(out, {
    x: 6.0, z: -d * 0.04, roofY: hB + 0.40, baseW: 3.8, style: 'needle', yaw: -0.12,
  });
  finish(buckets, out);
  return { w: 31.0, d: d + 1.2, h: leftTop };
}

/** Slender setback tower with a polished civic needle and deep stone fins. */
export function makeNeedleTower(rng: Rng, buckets: GeometryBuckets, wallBucket = 'plaster2'): StructureDimensions {
  const out = parts(), w = 14.0, d = 16.0, podiumH = 5.4;
  out.stone.push(box(w + 4.8, podiumH, d + 4.8).translate(0, podiumH / 2, 0));
  out.dark.push(box(5.2, 3.1, 0.16).translate(0, 1.55, d / 2 + 2.47));
  const stages = [
    { w, d, h: 24, y: podiumH, bucket: wallBucket },
    { w: w * 0.80, d: d * 0.84, h: 12, y: podiumH + 23.8, bucket: 'plaster3' },
    { w: w * 0.58, d: d * 0.62, h: 8.6, y: podiumH + 35.6, bucket: 'stone' },
  ];
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    out[stage.bucket].push(box(stage.w, stage.h, stage.d)
      .translate(0, stage.y + stage.h / 2, 0));
    out.roof.push(slab(stage.w + 0.42, 0.24, stage.d + 0.42)
      .translate(0, stage.y + stage.h + 0.10, 0));
    addTowerFacadeGrid(out, {
      w: stage.w, d: stage.d, y0: stage.y + 2.6,
      y1: stage.y + stage.h - 1.1, step: i === 0 ? 3.0 : 2.8,
      bays: i === 0 ? 4 : 3, sideBays: i === 0 ? 5 : 3,
      frameBucket: i === 2 ? 'dark' : 'stone',
    });
  }
  const finalStage = stages[stages.length - 1];
  const roofY = finalStage.y + finalStage.h + 0.22;
  const spireTop = addConnectedCrown(out, {
    roofY, baseW: 5.0, style: 'needle', yaw: (rng() - 0.5) * 0.18,
  });
  finish(buckets, out);
  return { w: w + 5.0, d: d + 5.0, h: spireTop };
}

/** Offset broadcast headquarters with stacked terraces and a lattice mast. */
export function makeBroadcastTower(rng: Rng, buckets: GeometryBuckets, wallBucket = 'plaster3'): StructureDimensions {
  const out = parts(), w = 19.0, d = 15.0, podiumH = 6.2;
  out.stone.push(box(w + 5.0, podiumH, d + 5.0).translate(0, podiumH / 2, 0));
  const coreH = 29.0;
  out[wallBucket].push(box(w, coreH, d).translate(0, podiumH + coreH / 2, 0));
  out.plaster2.push(box(w * 0.62, 9.5, d * 0.78)
    .translate(-w * 0.17, podiumH + coreH + 4.7, -d * 0.04));
  out.stone.push(box(w * 0.34, 6.0, d * 0.55)
    .translate(w * 0.25, podiumH + coreH + 3.0, d * 0.14));
  addTowerFacadeGrid(out, {
    w, d, y0: podiumH + 3.0, y1: podiumH + coreH - 1.0,
    step: 3.15, bays: 5, sideBays: 4, frameBucket: 'dark',
  });
  addTowerFacadeGrid(out, {
    x: -w * 0.17, z: -d * 0.04, w: w * 0.62, d: d * 0.78,
    y0: podiumH + coreH + 2.5, y1: podiumH + coreH + 8.5,
    step: 2.8, bays: 3, sideBays: 3,
  });
  const terraceBase = podiumH + coreH + 9.5;
  let terraceTop = terraceBase;
  for (let i = 0; i < 3; i++) {
    const terraceY = terraceBase + i * 0.22;
    out.roof.push(slab(w * (0.88 - i * 0.15), 0.26, d * (0.88 - i * 0.12))
      .translate(-w * 0.08, terraceY, -d * 0.02));
    terraceTop = terraceY + 0.13;
  }
  const spireTop = addConnectedCrown(out, {
    x: -w * 0.17, z: -d * 0.04, roofY: terraceTop,
    baseW: 5.1, style: 'broadcast', yaw: (rng() - 0.5) * 0.12,
  });
  finish(buckets, out);
  return { w: w + 5.2, d: d + 5.2, h: spireTop };
}

/** Broad terraced financial tower with an asymmetric split-blade crown. */
export function makeTerraceTower(rng: Rng, buckets: GeometryBuckets, wallBucket = 'stone'): StructureDimensions {
  const out = parts(), w = 21.0, d = 18.0, podiumH = 5.8;
  out.plaster3.push(box(w + 4.0, podiumH, d + 4.0).translate(0, podiumH / 2, 0));
  const lowerH = 22.0;
  out[wallBucket].push(box(w, lowerH, d).translate(0, podiumH + lowerH / 2, 0));
  const shoulderY = podiumH + lowerH;
  out.plaster2.push(box(w * 0.76, 10.0, d * 0.82)
    .translate(w * 0.06, shoulderY + 5.0, -d * 0.03));
  out[wallBucket].push(box(w * 0.48, 8.0, d * 0.60)
    .translate(-w * 0.08, shoulderY + 13.9, d * 0.04));
  addTowerFacadeGrid(out, {
    w, d, y0: podiumH + 2.8, y1: shoulderY - 1.0,
    step: 3.0, bays: 6, sideBays: 5,
  });
  addTowerFacadeGrid(out, {
    x: w * 0.06, z: -d * 0.03, w: w * 0.76, d: d * 0.82,
    y0: shoulderY + 2.7, y1: shoulderY + 9.1,
    step: 2.8, bays: 4, sideBays: 4, frameBucket: 'dark',
  });
  for (let i = 0; i < 4; i++) {
    out.roof.push(slab(w + 1.4 - i * 2.6, 0.30, d + 1.4 - i * 2.0)
      .translate(i * 0.35, shoulderY + i * 2.7, -i * 0.20));
  }
  const upperRoofY = shoulderY + 17.9;
  out.roof.push(slab(w * 0.50, 0.34, d * 0.62)
    .translate(-w * 0.08, upperRoofY + 0.17, d * 0.04));
  const spireTop = addConnectedCrown(out, {
    x: -w * 0.08, z: d * 0.04, roofY: upperRoofY + 0.34,
    baseW: 5.7, style: 'forked', yaw: (rng() - 0.5) * 0.12,
  });
  finish(buckets, out);
  return { w: w + 4.4, d: d + 4.4, h: spireTop };
}

/** Open-sided concrete parking deck: a broad, tank-scale urban landmark. */
export function makeParkingDeck(rng: Rng, buckets: GeometryBuckets): StructureDimensions {
  const out = parts(), w = 27.0, d = 22.0, floors = 5, floorH = 2.65;
  for (let i = 0; i <= floors; i++) {
    out.stone.push(slab(w, 0.32, d).translate(0, i * floorH + 0.16, 0));
  }
  for (const x of [-w / 2 + 1.2, -4.2, 4.2, w / 2 - 1.2]) {
    for (const z of [-d / 2 + 1.1, d / 2 - 1.1]) {
      out.stone.push(box(0.62, floors * floorH, 0.62)
        .translate(x, floors * floorH / 2, z));
    }
  }
  for (let i = 0; i < floors; i++) {
    out.dark.push(box(w - 3.0, 1.15, 0.08).translate(0, i * floorH + 1.4, d / 2 + 0.05));
    // Guard rails are carried by visible posts into the deck beneath; the old
    // rails floated half a metre above every storey edge.
    for (const x of [-10.8, -5.4, 0, 5.4, 10.8]) {
      out.dark.push(box(0.10, 0.92, 0.10)
        .translate(x, i * floorH + 0.72, d / 2 + 0.02));
    }
  }
  const ramp = slab(7.0, 0.28, d * 0.68); ramp.rotateX(-0.24);
  out.plaster3.push(ramp.translate(-5.0, 5.8, 0));
  // Collapsed outer bay.
  for (let i = 1; i <= 3; i++) {
    const deck = slab(6.5, 0.30, 8.0); deck.rotateZ(0.08 * i);
    out.stone.push(deck.translate(w / 2 - 2.6, i * floorH - 0.4, -3.0));
  }
  finish(buckets, out);
  return { w: w + 0.4, d: d + 0.4, h: floors * floorH + 0.4 };
}

/** Monumental civic hall with bombed rotunda and deep colonnade. */
export function makeCivicHall(rng: Rng, buckets: GeometryBuckets, wallBucket = 'plaster2'): StructureDimensions {
  const out = parts(), w = 31.0, d = 18.0, h = 10.5;
  out[wallBucket].push(box(w, h, d).translate(0, h / 2, 0));
  out.stone.push(slab(w + 2.0, 0.55, d + 2.0).translate(0, 0.28, 0));
  out.stone.push(slab(w + 1.2, 0.42, d + 1.2).translate(0, h + 0.21, 0));
  for (let x = -12.5; x <= 12.5; x += 3.1) {
    out.stone.push(cylinder(0.34, 0.42, 8.2, 10).translate(x, 4.1, d / 2 + 2.2));
  }
  out.roof.push(slab(w - 1.0, 0.45, 4.8).translate(0, 8.5, d / 2 + 1.2));
  const dome = new THREE.SphereGeometry(6.8, 18, 9, 0, Math.PI * 1.55, 0, Math.PI / 2);
  dome.scale(1, 0.52, 1); dome.translate(-3.0, h, -1.0); out.roof.push(dome);
  // Missing dome quarter and exposed ribs are suggested with black blast
  // panels and leaning steel members rather than overlapping alpha geometry.
  out.dark.push(box(5.2, 3.2, 0.18).rotateZ(-0.22).translate(1.8, h + 2.0, 4.1));
  for (let i = 0; i < 6; i++) {
    const rib = box(0.18, 7.0, 0.18); rib.rotateZ(-0.42 + i * 0.16);
    out.dark.push(rib.translate(-3.0 + (i - 2.5) * 0.7, h + 2.1, -1.0));
  }
  addConnectedExterior(out, { id: 'civichall', w, d, wallH: h, profile: 'civic', variant: 4 });
  finish(buckets, out);
  return { w: w + 2.2, d: d + 4.8, h: h + 4.2 };
}

export const STRUCTURE_BUILDERS: Record<string, StructureBuilder> = {
  tavern: makeTavern,
  schoolhouse: makeSchoolhouse,
  firestation: makeFireStation,
  fishery: makeFishery,
  bathhouse: makeBathhouse,
  caravanserai: makeCaravanserai,
  foundryoffice: makeFoundryOffice,
  rangerlodge: makeRangerLodge,
  megatower: makeMegatower,
  arcology: makeArcology,
  needletower: makeNeedleTower,
  broadcasttower: makeBroadcastTower,
  terracetower: makeTerraceTower,
  parkingdeck: makeParkingDeck,
  civichall: makeCivicHall,
};

// -------------------------------------------------------------------------
// Light destructible structures. Every type is authored as a single baked
// vertex-color mesh so a whole family remains one draw call on a live map.
// -------------------------------------------------------------------------

const PAL = {
  timber: [0x4b3222, 0x74523a, 0x25221f],
  paleWood: [0x76634b, 0x9a8768, 0x3a332b],
  canvas: [0x95866a, 0xb7ab8d, 0x605b4d],
  khaki: [0x596044, 0x78805c, 0x2e3529],
  steel: [0x51575b, 0x747b7c, 0x272d31],
  urbanSteel: [0x596065, 0x8b9293, 0x242a2e],
  desert: [0xa18a67, 0xc0ad83, 0x655845],
  nordic: [0x4b382c, 0x8b765e, 0x242b2c],
} as const satisfies Record<string, Palette>;

function colored<T extends THREE.BufferGeometry>(
  partsOut: THREE.BufferGeometry[],
  geo: T,
  color: number,
  rng: Rng,
  jitter = 0.08,
): T {
  partsOut.push(paint(geo, color, rng, jitter));
  return geo;
}

function gableLight({
  w, d, wallH, roofH, pal, porch = 0, raised = 0, chimney = false, windows = 2,
}: GableLightOptions, rng: Rng): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const [wall, trim, dark] = pal;
  if (raised > 0) {
    for (const x of [-w * 0.38, w * 0.38]) for (const z of [-d * 0.38, d * 0.38]) {
      colored(out, box(0.16, raised, 0.16).translate(x, raised / 2, z), dark, rng);
    }
  }
  const y0 = raised;
  colored(out, box(w, wallH, d).translate(0, y0 + wallH / 2, 0), wall, rng);
  colored(out, gable(w, roofH, 0.14).translate(0, y0 + wallH, d / 2 - 0.07), wall, rng);
  colored(out, gable(w, roofH, 0.14).translate(0, y0 + wallH, -d / 2 + 0.07), wall, rng);
  const slope = Math.hypot(w / 2 + 0.28, roofH + 0.05), ang = Math.atan2(roofH + 0.05, w / 2 + 0.28);
  for (const side of [-1, 1]) {
    const roof = slab(slope + 0.12, 0.10, d + 0.6);
    roof.rotateZ(side * ang); roof.translate(-side * (w / 4 + 0.14), y0 + wallH + roofH / 2 + 0.04, 0);
    colored(out, roof, dark, rng);
  }
  colored(out, box(w * 0.24, wallH * 0.68, 0.07).translate(0, y0 + wallH * 0.34, d / 2 + 0.04), dark, rng);
  for (let i = 0; i < windows; i++) {
    const x = windows === 1 ? -w * 0.25 : -w * 0.3 + i * (w * 0.6 / Math.max(1, windows - 1));
    if (Math.abs(x) < w * 0.16) continue;
    const ww = w * 0.17, wh = wallH * 0.34, wy = y0 + wallH * 0.58;
    colored(out, box(ww, wh, 0.06).translate(x, wy, d / 2 + 0.05), 0x52656a, rng, 0.04);
    // A complete trim surround and cross mullion keeps these lightweight
    // destructibles legible as occupied buildings before they are broken.
    // Detail-only paint uses a neutral sampler. Preserve the caller RNG
    // sequence so adding facade geometry cannot reshuffle later prop variants
    // or activate an otherwise-unused material family on a map.
    for (const sx of [-1, 1]) colored(out,
      box(0.065, wh + 0.16, 0.09).translate(x + sx * (ww / 2 + 0.045), wy, d / 2 + 0.09), trim, _detailRng);
    for (const sy of [-1, 1]) colored(out,
      box(ww + 0.19, 0.065, 0.09).translate(x, wy + sy * (wh / 2 + 0.045), d / 2 + 0.09), trim, _detailRng);
    colored(out, box(0.045, wh - 0.05, 0.08).translate(x, wy, d / 2 + 0.12), dark, rng);
    colored(out, box(ww - 0.04, 0.045, 0.08).translate(x, wy, d / 2 + 0.12), dark, _detailRng);
  }
  if (porch > 0) {
    colored(out, box(w * 0.9, 0.12, porch).translate(0, y0 + 0.08, d / 2 + porch / 2), trim, rng);
    for (const x of [-w * 0.38, w * 0.38]) colored(out, box(0.10, wallH * 0.68, 0.10).translate(x, y0 + wallH * 0.35, d / 2 + porch * 0.82), dark, rng);
    const awning = slab(w, 0.08, porch + 0.35); awning.rotateX(-0.16);
    colored(out, awning.translate(0, y0 + wallH * 0.73, d / 2 + porch * 0.42), trim, rng);
  }
  if (chimney) colored(out, box(0.42, 1.8, 0.42).translate(-w * 0.28, y0 + wallH + roofH * 0.78, -d * 0.2), dark, rng);
  // Connected exterior service language shared by the lightweight family.
  // Battens overlap the wall shell, the fascia overlaps the gable caps, and
  // the utility box/conduit both penetrate the side wall: no decorative part
  // can hover beside the building after instancing on uneven terrain.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    colored(out, box(0.14, wallH, 0.14).translate(
      sx * (w / 2 + 0.025), y0 + wallH / 2, sz * (d / 2 + 0.025),
    ), trim, _detailRng);
  }
  for (const z of [-d / 2 - 0.03, d / 2 + 0.03]) {
    colored(out, box(w + 0.18, 0.14, 0.14).translate(0, y0 + wallH - 0.08, z), trim, _detailRng);
  }
  const serviceY = y0 + Math.min(1.65, wallH * 0.58);
  colored(out, box(0.24, 0.62, 0.82).translate(w / 2 + 0.08, serviceY, -d * 0.12), dark, _detailRng);
  colored(out, box(0.10, Math.max(0.45, serviceY - y0 - 0.20), 0.10).translate(
    w / 2 + 0.035, y0 + Math.max(0.45, serviceY - y0 - 0.20) / 2 + 0.08, -d * 0.12,
  ), dark, _detailRng);
  return out;
}

function debris(
  meta: Pick<DestructibleBuildingType, 'hw' | 'hl' | 'h'>,
  pal: Palette,
  rng: Rng,
  material: DebrisMaterial = 'wood',
): THREE.BufferGeometry {
  const out: THREE.BufferGeometry[] = [];
  const [base, trim, dark] = pal;
  const count = material === 'canvas' ? 11 : 15;
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2, radius = Math.sqrt(rng()) * Math.max(meta.hw, meta.hl) * 0.82;
    const long = 0.55 + rng() * (material === 'canvas' ? 1.8 : 2.6);
    const piece = material === 'canvas'
      ? slab(long, 0.045, 0.45 + rng() * 0.8)
      : box(0.16 + rng() * 0.22, 0.08 + rng() * 0.10, long);
    piece.rotateY(a + rng()); piece.rotateX((rng() - 0.5) * 0.24);
    piece.translate(Math.cos(a) * radius, 0.08 + rng() * 0.25, Math.sin(a) * radius);
    colored(out, piece, i % 4 === 0 ? trim : base, rng, 0.14);
  }
  // Recognizable collapsed roof sheet and surviving stove/utility block.
  const roof = slab(meta.hw * 1.35, 0.08, meta.hl * 0.95);
  roof.rotateY((rng() - 0.5) * 0.8); roof.rotateX(0.12 + rng() * 0.18);
  colored(out, roof.translate(meta.hw * 0.18, 0.18, -meta.hl * 0.08), dark, rng, 0.12);
  // Building-scale persistent wreckage: collapsed wall leaves, a snapped
  // frame and a buckled service panel keep the broken state recognizable as
  // the exact structure that stood here instead of a generic debris sprinkle.
  const panelColor = material === 'metal' ? trim : base;
  for (const side of [-1, 1]) {
    const panel = slab(meta.hw * 1.15, 0.09, Math.min(meta.h * 0.46, meta.hl * 1.20));
    panel.rotateY(side * (0.34 + rng() * 0.18));
    panel.rotateX(0.08 + rng() * 0.14);
    colored(out, panel.translate(side * meta.hw * 0.28, 0.14, side * meta.hl * 0.22),
      panelColor, rng, 0.11);
  }
  const frameH = Math.min(1.55, meta.h * 0.30);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const post = box(0.16, frameH * (0.65 + rng() * 0.35), 0.16);
    post.rotateZ((rng() - 0.5) * 0.22);
    colored(out, post.translate(sx * meta.hw * 0.64, frameH * 0.42, sz * meta.hl * 0.58),
      dark, rng, 0.10);
  }
  const service = box(0.12, 0.62, 0.86);
  service.rotateZ(Math.PI / 2 - 0.16);
  colored(out, service.translate(-meta.hw * 0.42, 0.22, meta.hl * 0.28), dark, rng, 0.08);
  return merge(out);
}

function makeFieldHut(rng: Rng): THREE.BufferGeometry {
  const out = gableLight({ w: 4.2, d: 5.6, wallH: 2.45, roofH: 1.35, pal: PAL.timber, porch: 1.1, chimney: true }, rng);
  colored(out, box(1.4, 0.75, 0.55).translate(-1.15, 0.4, 3.15), PAL.paleWood[1], rng);
  return mergeConnectedStructure('fieldhut', out);
}

function makeLeanTo(rng: Rng): THREE.BufferGeometry {
  const out: THREE.BufferGeometry[] = [], p = PAL.paleWood;
  for (const x of [-2.4, 2.4]) for (const z of [-2.0, 2.0]) colored(out, box(0.16, 2.8, 0.16).translate(x, 1.4, z), p[2], rng);
  colored(out, box(5.2, 2.3, 0.18).translate(0, 1.15, -2.05), p[0], rng);
  const roof = slab(5.8, 0.12, 5.0); roof.rotateX(-0.18); colored(out, roof.translate(0, 2.75, 0), p[1], rng);
  for (let i = 0; i < 3; i++) colored(out, box(1.1, 0.85, 0.8).translate(-1.5 + i * 1.45, 0.43, -1.45), p[0], rng);
  return mergeConnectedStructure('leanto', out);
}

function makeHuntingBlind(rng: Rng): THREE.BufferGeometry {
  const out: THREE.BufferGeometry[] = [], p = PAL.timber, y = 3.1;
  for (const x of [-1.15, 1.15]) for (const z of [-1.15, 1.15]) colored(out, box(0.16, y, 0.16).translate(x, y / 2, z), p[2], rng);
  colored(out, box(2.8, 2.2, 2.8).translate(0, y + 1.1, 0), p[0], rng);
  colored(out, slab(3.2, 0.12, 3.3).rotateZ(0.10).translate(0, y + 2.3, 0), p[1], rng);
  for (const side of [-1, 1]) colored(out, box(0.08, 0.45, 1.5).translate(side * 1.43, y + 1.35, 0), p[2], rng);
  for (let i = 0; i < 6; i++) colored(out, box(0.75, 0.08, 0.12).translate(1.7, 0.35 + i * 0.45, 1.15), p[1], rng);
  return mergeConnectedStructure('huntingblind', out);
}

function makeFisherShack(rng: Rng): THREE.BufferGeometry {
  const out = gableLight({ w: 4.8, d: 6.2, wallH: 2.7, roofH: 1.45, pal: PAL.nordic, porch: 1.5, raised: 0.45 }, rng);
  for (const x of [-1.8, 0, 1.8]) {
    colored(out, box(0.10, 2.2, 0.10).translate(x, 1.1, -3.65), PAL.nordic[2], rng);
    // The drying rack used to stand half a metre behind the shack with no
    // join. Tie every upright back into the rear wall with a real bearer.
    colored(out, box(0.10, 0.10, 0.66).translate(x, 1.1, -3.34), PAL.nordic[2], _detailRng);
  }
  colored(out, box(4.0, 0.08, 0.08).translate(0, 2.15, -3.65), PAL.nordic[1], rng);
  return mergeConnectedStructure('fishershack', out);
}

function makeSaunaHut(rng: Rng): THREE.BufferGeometry {
  const out = gableLight({ w: 4.6, d: 5.0, wallH: 2.5, roofH: 1.65, pal: PAL.nordic, chimney: true, windows: 1 }, rng);
  for (let y = 0.45; y < 2.4; y += 0.38) colored(out, box(4.75, 0.10, 0.12).translate(0, y, 2.56), PAL.nordic[1], rng);
  colored(out, box(1.2, 0.28, 1.2).translate(1.3, 0.14, 3.1), PAL.nordic[2], rng);
  return mergeConnectedStructure('saunahut', out);
}

function makeAlpineRefuge(rng: Rng): THREE.BufferGeometry {
  const out = gableLight({ w: 6.0, d: 7.0, wallH: 2.8, roofH: 2.7, pal: PAL.nordic, porch: 1.0, chimney: true }, rng);
  for (const x of [-2.3, -0.8, 0.8, 2.3]) colored(out, box(0.12, 0.9, 0.12).translate(x, 3.25, 3.85), PAL.nordic[1], rng);
  colored(out, box(5.4, 0.12, 0.15).translate(0, 3.7, 3.85), PAL.nordic[2], rng);
  return mergeConnectedStructure('alpinerefuge', out);
}

function makeStiltHouse(rng: Rng): THREE.BufferGeometry {
  const out = gableLight({ w: 5.6, d: 7.2, wallH: 2.7, roofH: 1.8, pal: PAL.paleWood, porch: 1.3, raised: 2.0 }, rng);
  for (let i = 0; i < 6; i++) colored(out, box(1.0, 0.10, 0.18).translate(3.0, 0.35 + i * 0.34, 2.6 + i * 0.22), PAL.paleWood[1], rng);
  colored(out, box(0.12, 2.6, 0.12).rotateX(-0.58).translate(3.0, 1.2, 3.15), PAL.paleWood[2], rng);
  return mergeConnectedStructure('stilthouse', out);
}

function makeLonghouse(rng: Rng): THREE.BufferGeometry {
  const out = gableLight({ w: 6.8, d: 12.8, wallH: 2.8, roofH: 3.7, pal: PAL.timber, windows: 3 }, rng);
  for (const z of [-4.3, -1.4, 1.4, 4.3]) for (const side of [-1, 1]) colored(out, box(0.12, 2.2, 0.12).translate(side * 3.46, 1.1, z), PAL.timber[1], rng);
  const ridge = cylinder(0.18, 0.18, 13.6, 7); ridge.rotateX(Math.PI / 2); colored(out, ridge.translate(0, 6.55, 0), PAL.timber[2], rng);
  return mergeConnectedStructure('longhouse', out);
}

function makeDesertTent(rng: Rng): THREE.BufferGeometry {
  const out: THREE.BufferGeometry[] = [], p = PAL.desert, w = 5.2, d = 7.6, h = 2.8;
  const shape = new THREE.Shape(); shape.moveTo(-w / 2, 0); shape.lineTo(0, h); shape.lineTo(w / 2, 0); shape.closePath();
  const tent = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false }); tent.translate(0, 0, -d / 2);
  colored(out, tent, p[0], rng, 0.12);
  for (const z of [-d / 2 - 0.15, d / 2 + 0.15]) colored(out, box(0.12, h + 0.6, 0.12).translate(0, (h + 0.6) / 2, z), p[2], rng);
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) {
    const rope = box(0.035, 0.035, 2.0); rope.rotateX(0.72); rope.rotateY(x > 0 ? 0.25 : -0.25);
    colored(out, rope.translate(x * 1.1, 0.65, z * 1.08), p[2], rng);
  }
  colored(out, slab(3.8, 0.05, 2.2).translate(0, 0.06, d / 2 + 1.2), p[1], rng);
  return mergeConnectedStructure('deserttent', out);
}

function makeCommandTent(rng: Rng): THREE.BufferGeometry {
  const out: THREE.BufferGeometry[] = [], p = PAL.khaki, w = 6.2, d = 8.2, wall = 1.15, roof = 2.35;
  colored(out, box(w, wall, d).translate(0, wall / 2, 0), p[0], rng);
  colored(out, gable(w, roof, d).translate(0, wall, 0), p[1], rng);
  for (const z of [-3.0, 0, 3.0]) colored(out, box(0.10, wall + roof + 0.3, 0.10).translate(0, (wall + roof) / 2, z), p[2], rng);
  colored(out, box(2.4, 0.9, 0.9).translate(-1.55, 0.45, 4.25), PAL.timber[0], rng);
  colored(out, box(0.10, 5.2, 0.10).translate(2.8, 2.6, -3.6), p[2], rng);
  colored(out, box(1.8, 0.06, 0.06).rotateZ(-0.22).translate(3.0, 5.0, -3.6), p[2], rng);
  return mergeConnectedStructure('commandtent', out);
}

function makeFieldHospital(rng: Rng): THREE.BufferGeometry {
  const out: THREE.BufferGeometry[] = [], p = PAL.canvas;
  for (const x of [-2.7, 2.7]) {
    colored(out, box(4.5, 1.05, 8.8).translate(x, 0.53, 0), p[0], rng);
    colored(out, gable(4.5, 2.0, 8.8).translate(x, 1.05, 0), p[1], rng);
    colored(out, box(0.10, 3.3, 0.10).translate(x, 1.65, 0), p[2], rng);
  }
  colored(out, slab(1.1, 0.06, 1.1).translate(0, 2.15, 4.48), 0xd8d0ba, rng);
  colored(out, box(0.22, 0.05, 0.82).translate(0, 2.19, 4.52), 0x7b2c28, rng, 0.02);
  colored(out, box(0.82, 0.05, 0.22).translate(0, 2.20, 4.53), 0x7b2c28, rng, 0.02);
  for (let i = 0; i < 4; i++) colored(out, box(1.65, 0.14, 0.62).translate(-2.7 + (i % 2) * 5.4, 0.48, -2.8 + ((i / 2) | 0) * 5.6), PAL.steel[1], rng);
  return mergeConnectedStructure('fieldhospital', out);
}

function makeGuardPost(rng: Rng): THREE.BufferGeometry {
  const out: THREE.BufferGeometry[] = [], p = PAL.steel, y0 = 1.2;
  colored(out, box(3.2, 2.6, 3.2).translate(0, y0 + 1.3, 0), p[0], rng);
  for (const side of [-1, 1]) {
    colored(out, box(2.2, 0.65, 0.08).translate(0, y0 + 1.65, side * 1.64), 0x73909a, rng);
    colored(out, box(0.08, 0.65, 2.2).translate(side * 1.64, y0 + 1.65, 0), 0x73909a, rng);
  }
  colored(out, slab(3.9, 0.16, 3.9).translate(0, y0 + 2.72, 0), p[2], rng);
  for (const x of [-1.2, 1.2]) for (const z of [-1.2, 1.2]) colored(out, box(0.18, y0, 0.18).translate(x, y0 / 2, z), p[2], rng);
  for (let i = 0; i < 5; i++) colored(out, box(0.65, 0.08, 0.10).translate(1.7, 0.25 + i * 0.35, 1.3), p[1], rng);
  return mergeConnectedStructure('guardpost', out);
}

function makeMotorPool(rng: Rng): THREE.BufferGeometry {
  const out: THREE.BufferGeometry[] = [], p = PAL.steel, w = 9.0, d = 11.5;
  for (const x of [-w / 2, 0, w / 2]) for (const z of [-d / 2, d / 2]) colored(out, box(0.22, 3.8, 0.22).translate(x, 1.9, z), p[2], rng);
  const roof = slab(w + 0.8, 0.16, d + 0.8); roof.rotateZ(0.11); colored(out, roof.translate(0, 3.9, 0), p[0], rng);
  colored(out, box(2.0, 0.25, 7.0).translate(0, 0.05, 0), p[2], rng);
  for (const x of [-3.1, 3.1]) for (const z of [-3.7, 0, 3.7]) colored(out, cylinder(0.38, 0.38, 0.85, 10).translate(x, 0.43, z), p[1], rng);
  colored(out, box(2.5, 1.0, 0.7).translate(-3.0, 0.5, -4.8), PAL.timber[0], rng);
  return mergeConnectedStructure('motorpool', out);
}

function makeQuonsetHut(rng: Rng): THREE.BufferGeometry {
  const out: THREE.BufferGeometry[] = [], p = PAL.steel, w = 6.8, d = 11.5, h = 3.8;
  colored(out, archShell(w, h, d), p[0], rng, 0.10);
  for (let z = -d / 2 + 0.8; z < d / 2; z += 1.15) {
    const rib = archShell(w + 0.12, h + 0.08, 0.08); rib.translate(0, 0, z); colored(out, rib, p[1], rng, 0.04);
  }
  colored(out, box(3.5, 3.0, 0.10).translate(0, 1.5, d / 2 + 0.06), p[2], rng);
  for (const x of [-2.2, 2.2]) colored(out, box(0.65, 0.9, 0.08).translate(x, 1.9, d / 2 + 0.12), 0x6f8790, rng);
  return mergeConnectedStructure('quonsethut', out);
}

function makeTransformerShed(rng: Rng): THREE.BufferGeometry {
  const out: THREE.BufferGeometry[] = [], p = PAL.steel, w = 5.4, d = 5.0, h = 3.4;
  colored(out, box(w, h, d).translate(0, h / 2, 0), p[0], rng);
  colored(out, slab(w + 0.5, 0.18, d + 0.5).rotateZ(-0.09).translate(0, h + 0.1, 0), p[2], rng);
  for (const x of [-1.55, 0, 1.55]) for (let y = 1.0; y <= 2.5; y += 0.38) colored(out, box(0.95, 0.08, 0.08).translate(x, y, d / 2 + 0.08), p[1], rng);
  for (const x of [-1.4, 1.4]) {
    colored(out, box(0.28, 1.0, 0.28).translate(x, h + 0.6, -1.1), 0x5f4f3a, rng);
    colored(out, cylinder(0.22, 0.22, 0.36, 8).translate(x, h + 1.16, -1.1), 0x7b735d, rng);
  }
  colored(out, box(2.2, 2.8, 0.10).translate(0, 1.4, -d / 2 - 0.05), p[2], rng);
  return mergeConnectedStructure('transformershed', out);
}

function makeCheckpointHut(rng: Rng): THREE.BufferGeometry {
  const out: THREE.BufferGeometry[] = [], p = PAL.steel, w = 4.0, d = 5.2, h = 3.0;
  colored(out, box(w, h, d).translate(0, h / 2, 0), p[0], rng);
  colored(out, slab(w + 0.7, 0.16, d + 1.1).rotateZ(0.08).translate(0, h + 0.08, 0), p[2], rng);
  for (const side of [-1, 1]) colored(out, box(0.08, 1.0, 2.7).translate(side * (w / 2 + 0.05), 1.95, 0), 0x718b90, rng);
  colored(out, box(2.5, 0.12, 1.8).translate(0, 0.12, d / 2 + 0.85), p[1], rng);
  for (const x of [-1.0, 1.0]) colored(out, box(0.12, 2.2, 0.12).translate(x, 1.15, d / 2 + 1.55), p[2], rng);
  colored(out, slab(2.8, 0.10, 2.0).rotateX(-0.12).translate(0, 2.35, d / 2 + 0.9), p[1], rng);
  return mergeConnectedStructure('checkpointhut', out);
}

function makeSecurityOffice(rng: Rng): THREE.BufferGeometry {
  const out: THREE.BufferGeometry[] = [], p = PAL.urbanSteel, w = 7.2, d = 8.6, h = 4.8;
  colored(out, box(w, h, d).translate(0, h / 2, 0), p[0], rng);
  colored(out, slab(w + 0.55, 0.24, d + 0.55).translate(0, h + 0.08, 0), p[2], rng);
  for (const side of [-1, 1]) for (const x of [-2.25, 0, 2.25]) {
    colored(out, box(1.28, 1.25, 0.09).translate(x, 3.05, side * (d / 2 + 0.04)),
      side > 0 && x === 0 ? 0x9ca488 : 0x58737b, rng, 0.035);
  }
  for (const x of [-2.25, 0, 2.25]) {
    colored(out, box(0.12, 1.62, 0.13).translate(x - 0.72, 3.05, d / 2 + 0.04), p[1], _detailRng);
    colored(out, box(0.12, 1.62, 0.13).translate(x + 0.72, 3.05, d / 2 + 0.04), p[1], _detailRng);
  }
  colored(out, box(1.45, 2.55, 0.12).translate(0, 1.28, d / 2 + 0.06), p[2], rng);
  colored(out, slab(3.6, 0.14, 1.45).rotateX(-0.08)
    .translate(0, 3.15, d / 2 + 0.62), p[1], rng);
  for (const x of [-1.55, 1.55]) {
    colored(out, box(0.13, 3.05, 0.13).translate(x, 1.52, d / 2 + 1.18), p[2], rng);
  }
  colored(out, box(w + 0.10, 0.18, 0.18).translate(0, 1.72, d / 2 + 0.04), p[1], _detailRng);
  return mergeConnectedStructure('securityoffice', out);
}

function makeServiceGarage(rng: Rng): THREE.BufferGeometry {
  const out: THREE.BufferGeometry[] = [], p = PAL.urbanSteel, w = 9.6, d = 11.2, h = 5.0;
  colored(out, box(w, h, d).translate(0, h / 2, 0), p[0], rng);
  const roof = slab(w + 0.7, 0.22, d + 0.7); roof.rotateZ(-0.055);
  colored(out, roof.translate(0, h + 0.10, 0), p[1], rng);
  for (const x of [-2.55, 2.0]) {
    colored(out, box(3.6, 3.55, 0.12).translate(x, 1.78, d / 2 + 0.07), p[2], rng);
    for (let y = 0.5; y < 3.45; y += 0.48) {
      colored(out, box(3.35, 0.075, 0.10).translate(x, y, d / 2 + 0.15), p[1], _detailRng);
    }
    colored(out, box(3.95, 0.24, 0.22).translate(x, 3.68, d / 2 + 0.04), p[1], _detailRng);
  }
  for (const side of [-1, 1]) {
    colored(out, box(0.10, 1.3, 2.2).translate(side * (w / 2 + 0.04), 3.05, -2.2),
      0x58737b, rng, 0.035);
  }
  colored(out, box(2.6, 1.0, 1.45).translate(-3.25, 0.5, -d / 2 - 0.66), p[1], rng);
  colored(out, box(0.22, 5.85, 0.22).translate(3.65, 2.92, -4.45), p[2], rng);
  colored(out, cylinder(0.30, 0.30, 0.24, 10).translate(3.65, 5.90, -4.45), p[1], rng);
  return mergeConnectedStructure('servicegarage', out);
}

function makeRelayStation(rng: Rng): THREE.BufferGeometry {
  const out: THREE.BufferGeometry[] = [], p = PAL.urbanSteel, w = 6.2, d = 6.8, h = 4.2;
  colored(out, box(w, h, d).translate(0, h / 2, 0), p[0], rng);
  colored(out, slab(w + 0.5, 0.24, d + 0.5).translate(0, h + 0.10, 0), p[2], rng);
  for (const x of [-1.85, 0, 1.85]) {
    for (let y = 1.0; y <= 2.9; y += 0.38) {
      colored(out, box(1.05, 0.08, 0.10).translate(x, y, d / 2 + 0.07), p[1], _detailRng);
    }
  }
  colored(out, box(2.0, 2.9, 0.12).translate(0, 1.45, -d / 2 - 0.06), p[2], rng);
  colored(out, box(2.1, 0.72, 2.1).translate(0, h + 0.48, 0), p[1], rng);
  const mastY = h + 0.80;
  for (const side of [-1, 1]) {
    const leg = box(0.14, 5.4, 0.14); leg.rotateZ(side * -0.075);
    colored(out, leg.translate(side * 0.36, mastY + 2.65, 0), p[2], rng);
  }
  for (let i = 0; i < 4; i++) {
    colored(out, box(0.92 - i * 0.12, 0.12, 0.22)
      .translate(0, mastY + i * 1.45, 0), p[1], _detailRng);
  }
  colored(out, cylinder(0.10, 0.13, 2.7, 8).translate(0, mastY + 6.55, 0), p[2], rng);
  colored(out, cylinder(0.28, 0.28, 0.20, 10).translate(0, mastY + 7.84, 0), 0xa66d31, rng);
  return mergeConnectedStructure('relaystation', out);
}

function makeCornerOffice(rng: Rng): THREE.BufferGeometry {
  const out: THREE.BufferGeometry[] = [], p = PAL.urbanSteel, w = 8.4, d = 8.4, h = 6.6;
  colored(out, box(w, h, d).translate(0, h / 2, 0), p[0], rng);
  colored(out, slab(w + 0.5, 0.24, d + 0.5).translate(0, h + 0.10, 0), p[2], rng);
  for (const y of [2.25, 4.75]) {
    for (const x of [-2.65, -0.9, 0.9, 2.65]) {
      const paneColor = (Math.round(x * 10 + y * 7) % 3 === 0) ? 0xa49b7c : 0x58737b;
      colored(out, box(1.12, 1.18, 0.09).translate(x, y, d / 2 + 0.04), paneColor, rng, 0.035);
      colored(out, box(0.09, 1.18, 1.12).translate(w / 2 + 0.04, y, x), paneColor, rng, 0.035);
    }
    colored(out, box(w + 0.10, 0.18, 0.18).translate(0, y - 0.76, d / 2 + 0.04), p[1], _detailRng);
    colored(out, box(0.18, 0.18, d + 0.10).translate(w / 2 + 0.04, y - 0.76, 0), p[1], _detailRng);
  }
  colored(out, box(1.5, 2.55, 0.12).translate(-2.55, 1.28, d / 2 + 0.06), p[2], rng);
  colored(out, slab(3.2, 0.14, 1.25).rotateX(-0.07)
    .translate(-2.55, 3.10, d / 2 + 0.53), p[1], rng);
  for (const x of [-3.85, -1.25]) {
    colored(out, box(0.13, 3.0, 0.13).translate(x, 1.5, d / 2 + 1.04), p[2], rng);
  }
  colored(out, box(2.5, 0.74, 2.2).translate(1.65, h + 0.49, -1.5), p[1], rng);
  return mergeConnectedStructure('corneroffice', out);
}

function lightMeta(
  id: string,
  family: string,
  hw: number,
  hl: number,
  h: number,
  pal: Palette,
  build: LightStructureBuilder,
  debrisMaterial: DebrisMaterial = 'wood',
): DestructibleBuildingType {
  const surfaceMaterial: DestructibleBuildingType['surfaceMaterial'] = debrisMaterial === 'canvas'
    ? 'structureCanvas'
    : debrisMaterial === 'metal' ? 'structureMetal' : 'structureWood';
  const instanceTintStrength = debrisMaterial === 'metal'
    ? 0.035 : debrisMaterial === 'canvas' ? 0.045 : 0.07;
  const base = {
    id, family, cls: 'break' as const, mat: surfaceMaterial, surfaceMaterial,
    contact: 'ob' as const, collider: true as const,
    hw, hl, r: Math.hypot(hw, hl), h, keep: 0.84, crushMin: 4.5, build,
    instanceTintStrength,
  };
  return {
    ...base,
    broken: (rng: Rng) => debris(base, pal, rng, debrisMaterial),
  };
}

export const DESTRUCTIBLE_BUILDING_TYPES: Record<string, DestructibleBuildingType> = {
  fieldhut: lightMeta('fieldhut', 'rural', 2.3, 3.5, 4.1, PAL.timber, makeFieldHut),
  leanto: lightMeta('leanto', 'rural', 2.9, 2.6, 3.1, PAL.paleWood, makeLeanTo),
  huntingblind: lightMeta('huntingblind', 'woodland', 1.8, 1.8, 5.5, PAL.timber, makeHuntingBlind),
  fishershack: lightMeta('fishershack', 'coastal', 2.7, 4.2, 4.7, PAL.nordic, makeFisherShack),
  saunahut: lightMeta('saunahut', 'nordic', 2.5, 3.2, 4.4, PAL.nordic, makeSaunaHut),
  alpinerefuge: lightMeta('alpinerefuge', 'alpine', 3.3, 4.3, 5.8, PAL.nordic, makeAlpineRefuge),
  stilthouse: lightMeta('stilthouse', 'wetland', 3.4, 4.6, 6.5, PAL.paleWood, makeStiltHouse),
  longhouse: lightMeta('longhouse', 'tribal', 3.7, 6.8, 6.6, PAL.timber, makeLonghouse),
  deserttent: lightMeta('deserttent', 'desert-camp', 3.2, 4.4, 3.4, PAL.desert, makeDesertTent, 'canvas'),
  commandtent: lightMeta('commandtent', 'military-camp', 3.5, 4.8, 5.2, PAL.khaki, makeCommandTent, 'canvas'),
  fieldhospital: lightMeta('fieldhospital', 'military-camp', 5.2, 5.0, 3.4, PAL.canvas, makeFieldHospital, 'canvas'),
  guardpost: lightMeta('guardpost', 'military', 2.1, 2.1, 4.1, PAL.steel, makeGuardPost, 'metal'),
  motorpool: lightMeta('motorpool', 'military', 5.0, 6.3, 4.2, PAL.steel, makeMotorPool, 'metal'),
  quonsethut: lightMeta('quonsethut', 'industrial', 3.7, 6.2, 4.0, PAL.steel, makeQuonsetHut, 'metal'),
  transformershed: lightMeta('transformershed', 'industrial', 3.0, 2.8, 4.7, PAL.steel, makeTransformerShed, 'metal'),
  checkpointhut: lightMeta('checkpointhut', 'military', 2.5, 3.7, 3.3, PAL.steel, makeCheckpointHut, 'metal'),
  securityoffice: lightMeta('securityoffice', 'urban', 4.0, 5.1, 5.2, PAL.urbanSteel, makeSecurityOffice, 'metal'),
  servicegarage: lightMeta('servicegarage', 'urban-industrial', 5.3, 6.3, 6.2, PAL.urbanSteel, makeServiceGarage, 'metal'),
  relaystation: lightMeta('relaystation', 'urban-industrial', 3.5, 3.8, 12.9, PAL.urbanSteel, makeRelayStation, 'metal'),
  corneroffice: lightMeta('corneroffice', 'urban', 4.7, 4.7, 7.5, PAL.urbanSteel, makeCornerOffice, 'metal'),
};

export const STRUCTURE_CATALOG = [
  ...Object.keys(STRUCTURE_BUILDERS).map((id) => ({ id, mode: 'merged' })),
  ...Object.values(DESTRUCTIBLE_BUILDING_TYPES).map(({ id, family }) => ({ id, family, mode: 'destructible' })),
];
