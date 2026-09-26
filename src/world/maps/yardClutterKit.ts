// Round 75 (2026-09-26): the yard clutter kit — one merged, instance-ready geometry per dressing family for the
// planner's placements (world/yardDressing.ts). Pallets, crates and cable drums ride the wood atlas; drums, fuel
// tanks and skips the painted-steel atlas (white vertex paint, so an instance colour is the livery; hoops, saddles
// and lugs darker); tyre stacks the matte vertex-coloured bucket. Every piece stands on y = 0 in its own frame and
// keeps inside the planner's family radius. First-party generated geometry; no model is loaded.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from '../propGeometry.ts';
import { BOX_FACE, STEEL_STRIP_V, mapBoxFaceUv, mapSheetUv, stripSpanU } from '../propsSteelAtlas.ts';
import type { YardFamily } from '../yardDressing.ts';

export type YardMaterial = 'steel' | 'wood' | 'baked';

export interface YardFamilyGeometry {
  family: YardFamily;
  material: YardMaterial;
  geometry: THREE.BufferGeometry;
  triangles: number;
}

/** Livery colourways (authored sRGB) an instance colour selects by the placement's variant. */
export const YARD_LIVERIES: Readonly<Record<'brownfield' | 'polar' | 'martian', Readonly<Record<'drum' | 'skip' | 'fuelTank', readonly number[]>>>> = Object.freeze({
  brownfield: {
    drum: [0x4a6fa8, 0x9a4634, 0x66744d, 0x878c91, 0xd8702a, 0x3d3f42, 0xbfa676, 0x4c7a76],
    skip: [0x66744d, 0x9a4634, 0xd8702a, 0x3d5d84],
    fuelTank: [0xcfcfc9, 0x9aa39c, 0x9a4634, 0x66744d],
  },
  polar: {
    drum: [0xd8702a, 0x4a6fa8, 0xdedfda, 0x8f959a, 0xb85a30, 0x3d3f42, 0x6e8b57, 0xd8702a],
    skip: [0xd8702a, 0x4a6fa8, 0x8f959a, 0x66744d],
    fuelTank: [0xdedfda, 0xd8702a, 0x9aa39c, 0x8f959a],
  },
  martian: {
    drum: [0xe1e3e5, 0xd97d2e, 0x9ea4aa, 0xcdc6b8, 0xe1e3e5, 0xd97d2e, 0x9ea4aa, 0xcdc6b8],
    skip: [0xe1e3e5, 0xd97d2e, 0x9ea4aa, 0xcdc6b8],
    fuelTank: [0xe1e3e5, 0xd97d2e, 0x9ea4aa, 0xcdc6b8],
  },
});

const _color = new THREE.Color();

function paintFlat(geo: THREE.BufferGeometry, value: number): THREE.BufferGeometry {
  const n = geo.attributes.position.count;
  const colors = new Float32Array(n * 3).fill(value);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function paintHex(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  _color.set(hex);
  const n = geo.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { colors[i * 3] = _color.r; colors[i * 3 + 1] = _color.g; colors[i * 3 + 2] = _color.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/** A box on the plain sheet strip, every face at 84 px/m from an atlas position (metres) of its own. */
function sheetBox(w: number, h: number, d: number, atU = 0.5): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  const plain = STEEL_STRIP_V.plain;
  const spanV = (m: number): readonly [number, number] => [plain[0], plain[0] + (plain[1] - plain[0]) * Math.min(1, m / 2.6)];
  mapBoxFaceUv(geo, BOX_FACE.px, stripSpanU(atU, d), spanV(h));
  mapBoxFaceUv(geo, BOX_FACE.nx, stripSpanU(atU, d), spanV(h));
  mapBoxFaceUv(geo, BOX_FACE.pz, stripSpanU(atU, w), spanV(h));
  mapBoxFaceUv(geo, BOX_FACE.nz, stripSpanU(atU, w), spanV(h));
  mapBoxFaceUv(geo, BOX_FACE.py, stripSpanU(atU, d), spanV(w), true);
  mapBoxFaceUv(geo, BOX_FACE.ny, stripSpanU(atU, d), spanV(w), true);
  return geo;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const expanded = parts.map((geo) => (geo.index ? geo.toNonIndexed() : geo));
  const merged = mergeGeometries(expanded, false);
  if (!merged) throw new Error('yard clutter: merge produced no geometry');
  for (const geo of new Set([...parts, ...expanded])) if (geo !== merged) geo.dispose();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

// ---------------------------------------------------------------------------------------------- wood

/** One pallet in its frame: deck, three stringers, two bottom boards; 1.2 x 0.144 x 1.0 m. */
function pallet(dx: number, dz: number, yaw: number, y: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const place = (g: THREE.BufferGeometry, ox: number, oy: number, oz: number): void => {
    g.translate(ox, oy, oz);
    g.rotateY(yaw);
    g.translate(dx, y, dz);
    parts.push(g);
  };
  place(box(1.2, 0.022, 1.0, 0.9), 0, 0.133, 0);
  for (const sx of [-0.55, 0, 0.55]) place(box(0.1, 0.1, 1.0, 0.9), sx, 0.072, 0);
  for (const sz of [-0.42, 0.42]) place(box(1.2, 0.022, 0.12, 0.9), 0, 0.011, sz);
  return parts;
}

function palletStack(count: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < count; k++) {
    const wobble = Math.sin(k * 2.7) * 0.04, drift = Math.cos(k * 1.9) * 0.03;
    parts.push(...pallet(wobble, drift, Math.sin(k * 3.1) * 0.06, k * 0.144));
  }
  return merge(parts);
}

function crates(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const crate = (s: number, h: number, dx: number, dy: number, dz: number, yaw: number): void => {
    const body = box(s, h, s, 1.0);
    const pieces = [body];
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      pieces.push(box(0.07, h + 0.02, 0.07, 1.0).translate(cx * (s / 2 - 0.02), 0, cz * (s / 2 - 0.02)));
    }
    for (const g of pieces) { g.translate(0, h / 2, 0); g.rotateY(yaw); g.translate(dx, dy, dz); parts.push(g); }
  };
  crate(0.95, 0.85, 0, 0, 0, 0);
  crate(0.8, 0.7, 0.12, 0.85, -0.06, 0.22);
  crate(0.6, 0.6, 0.74, 0, 0.12, 0); // a third beside the stack, inside the 1.1 m planning radius
  return merge(parts);
}

function cableDrum(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const sx of [-0.45, 0.45]) {
    const flange = new THREE.CylinderGeometry(0.76, 0.76, 0.07, 14, 1);
    scaleCylinderUv(flange, 2.4, 0.07);
    flange.rotateZ(Math.PI / 2);
    flange.translate(sx, 0.76, 0);
    parts.push(flange);
  }
  const core = new THREE.CylinderGeometry(0.38, 0.38, 0.86, 10, 1);
  scaleCylinderUv(core, 2.4, 0.86);
  core.rotateZ(Math.PI / 2);
  core.translate(0, 0.76, 0);
  parts.push(core);
  for (const sx of [-0.45, 0.45]) { // the two battens the drum's flanges stand on
    parts.push(box(0.2, 0.12, 1.7, 1.0).translate(sx, 0.06, 0));
  }
  return merge(parts);
}

/** World-metre UVs for the wood atlas on a cylinder (u around, v along), the props 0.5 uv/m convention. */
function scaleCylinderUv(geo: THREE.CylinderGeometry, circumferenceM: number, lengthM: number): void {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circumferenceM * 0.5, uv.getY(i) * lengthM * 0.5);
}

// ---------------------------------------------------------------------------------------------- steel

/** A 200-litre drum: shell and two rolling hoops on the plain sheet strip; white paint takes the instance livery. */
function drum(dx: number, dz: number, yaw: number, shade: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const shell = new THREE.CylinderGeometry(0.29, 0.29, 0.88, 12, 1);
  mapSheetUv(shell, 1.82, 0.88);
  paintFlat(shell, shade);
  shell.translate(0, 0.44, 0);
  parts.push(shell);
  for (const hy of [0.24, 0.64]) {
    const hoop = new THREE.CylinderGeometry(0.305, 0.305, 0.05, 12, 1, true);
    mapSheetUv(hoop, 1.9, 0.05);
    paintFlat(hoop, shade * 0.62);
    hoop.translate(0, hy, 0);
    parts.push(hoop);
  }
  for (const g of parts) { g.rotateY(yaw); g.translate(dx, 0, dz); }
  return parts;
}

function drumRank(): THREE.BufferGeometry {
  return merge([...drum(-0.66, 0, 0.2, 1), ...drum(0, 0.04, 1.1, 0.86), ...drum(0.66, -0.02, 2.3, 0.72)]);
}

function tyres(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) {
    const y = k * 0.26 + 0.13, dx = Math.sin(k * 2.1) * 0.05, dz = Math.cos(k * 1.7) * 0.05;
    const outer = new THREE.CylinderGeometry(0.5, 0.5, 0.26, 12, 1, true);
    const inner = new THREE.CylinderGeometry(0.29, 0.29, 0.26, 10, 1, true);
    // the inner ring faces inward so the hole reads from above; the top annulus stays open
    const flipped = inner.toNonIndexed();
    const index = new Uint16Array(flipped.attributes.position.count);
    for (let i = 0; i < index.length; i += 3) { index[i] = i; index[i + 1] = i + 2; index[i + 2] = i + 1; }
    flipped.setIndex(new THREE.BufferAttribute(index, 1));
    flipped.computeVertexNormals();
    for (const g of [outer, flipped]) { paintHex(g, 0x141516); g.rotateY(k * 0.9); g.translate(dx, y, dz); parts.push(g); }
  }
  return merge(parts);
}

function fuelTank(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const shell = new THREE.CylinderGeometry(0.9, 0.9, 4.4, 14, 1);
  mapSheetUv(shell, 5.65, 4.4);
  paintFlat(shell, 1);
  shell.rotateX(Math.PI / 2);
  shell.translate(0, 1.25, 0);
  parts.push(shell);
  for (const sz of [-1.45, 1.45]) {
    const saddle = sheetBox(2.0, 0.5, 0.42, 1.2);
    paintFlat(saddle, 0.42);
    saddle.translate(0, 0.25, sz);
    parts.push(saddle);
    const cradle = sheetBox(0.16, 0.65, 0.42, 1.3);
    paintFlat(cradle, 0.42);
    cradle.translate(0, 0.62, sz);
    parts.push(cradle);
  }
  const neck = new THREE.CylinderGeometry(0.14, 0.14, 0.34, 8, 1);
  mapSheetUv(neck, 0.9, 0.34);
  paintFlat(neck, 0.5);
  neck.translate(0, 2.2, 0.9);
  parts.push(neck);
  const manway = new THREE.CylinderGeometry(0.3, 0.3, 0.1, 10, 1);
  mapSheetUv(manway, 1.9, 0.1);
  paintFlat(manway, 0.55);
  manway.translate(0, 2.15, -0.7);
  parts.push(manway);
  return merge(parts);
}

function skip(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const body = sheetBox(3.2, 1.35, 1.6, 0.2);
  const position = body.attributes.position;
  for (let i = 0; i < position.count; i++) {
    if (position.getY(i) > 0) position.setXYZ(i, position.getX(i) * 1.07, position.getY(i), position.getZ(i) * 1.08);
  }
  body.computeVertexNormals();
  paintFlat(body, 1);
  body.translate(0, 0.675 + 0.12, 0);
  parts.push(body);
  for (const [w, d, dx, dz] of [[3.5, 0.1, 0, 0.9], [3.5, 0.1, 0, -0.9], [0.1, 1.85, 1.75, 0], [0.1, 1.85, -1.75, 0]] as const) {
    const lip = sheetBox(w, 0.08, d, 2.0);
    paintFlat(lip, 0.5);
    lip.translate(dx, 1.5, dz);
    parts.push(lip);
  }
  for (const sx of [-1.35, 1.35]) { // skid runners
    const runner = sheetBox(0.25, 0.12, 1.5, 2.2);
    paintFlat(runner, 0.35);
    runner.translate(sx, 0.06, 0);
    parts.push(runner);
  }
  for (const sx of [-1.68, 1.68]) { // lifting lugs
    const lug = sheetBox(0.06, 0.32, 0.36, 2.4);
    paintFlat(lug, 0.45);
    lug.translate(sx, 1.05, 0);
    parts.push(lug);
  }
  return merge(parts);
}

// ---------------------------------------------------------------------------------------------- catalog

const BUILDERS: Readonly<Record<YardFamily, () => THREE.BufferGeometry>> = Object.freeze({
  pallets: () => palletStack(3),
  palletsTall: () => palletStack(6),
  crates,
  drum: () => merge(drum(0, 0, 0, 1)),
  drumRank,
  cableDrum,
  tyres,
  fuelTank,
  skip,
});

export const YARD_FAMILY_MATERIAL: Readonly<Record<YardFamily, YardMaterial>> = Object.freeze({
  pallets: 'wood', palletsTall: 'wood', crates: 'wood', cableDrum: 'wood',
  drum: 'steel', drumRank: 'steel', fuelTank: 'steel', skip: 'steel',
  tyres: 'baked',
});

/** Triangle caps the receipt holds each family to (a stack of six pallets is the largest wooden piece). */
export const YARD_FAMILY_TRIANGLE_CAP: Readonly<Record<YardFamily, number>> = Object.freeze({
  pallets: 240, palletsTall: 480, crates: 200, drum: 110, drumRank: 320, cableDrum: 200, tyres: 220, fuelTank: 200, skip: 140,
});

/** Build one family's geometry (the caller owns and disposes it; one per family per battlefield). */
export function buildYardFamily(family: YardFamily): YardFamilyGeometry {
  const geometry = BUILDERS[family]();
  const position = geometry.getAttribute('position');
  return { family, material: YARD_FAMILY_MATERIAL[family], geometry, triangles: Math.floor((geometry.index?.count ?? position.count) / 3) };
}

/** The livery an instance takes (drums and ranks share the drum table; pallets and crates take none). */
export function yardInstanceLivery(
  family: YardFamily, variant: number, palette: keyof typeof YARD_LIVERIES,
): number | null {
  const table = YARD_LIVERIES[palette];
  const key = family === 'drum' || family === 'drumRank' ? 'drum' : family === 'skip' ? 'skip' : family === 'fuelTank' ? 'fuelTank' : null;
  if (!key) return null;
  const rows = table[key];
  return rows[((variant % rows.length) + rows.length) % rows.length];
}
